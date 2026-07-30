#!/usr/bin/env node
/**
 * Isolated runner for AI work result recovery.
 *
 * The runner accepts only injected source/writer bindings. It reads an immutable
 * public source snapshot, builds commits in the isolated writer repository's
 * object database, and pushes without force. The writer worktree is never used
 * as a staging surface.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  INPUT_SCHEMA as SWEEP_INPUT_SCHEMA,
  canonicalRecordDigest,
  deriveWorkerIdentity,
  planCursorSweep,
  sourceLaneTrailer,
} from "./five_field_cursor_sweep.mjs";
import {
  TRANSPORT_BINDING_SCHEMA,
  createTransportAdapter,
} from "./five_field_transport_adapter.mjs";
import {
  RUNTIME_PREFLIGHT_INPUT_SCHEMA,
  RUNTIME_PREFLIGHT_RECEIPT_SCHEMA,
  runRuntimePreflight,
  runtimeLaunchBindingDigest,
} from "./five_field_runtime_preflight.mjs";

export const RUNNER_V3_INPUT_SCHEMA =
  "soulforge.five_field_cursor_runner_input.v3";
export const RUNNER_INPUT_SCHEMA = "soulforge.five_field_cursor_runner_input.v4";
export const RUNNER_RECEIPT_SCHEMA = "soulforge.five_field_cursor_runner_receipt.v4";

const SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const OPAQUE_RANDOM_256_RE = /^[0-9a-f]{64}$/u;
const REF_RE = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u;
const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/u;
const EMAIL_RE = /^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/u;
const LOGICAL_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,299}$/u;
const ABSOLUTE_PATH_SENTINEL_RE =
  /(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+\\|\/(?:Users|home|tmp|var|etc)\/|file:\/\/)/iu;
const SECRET_SENTINEL_RE =
  /(?:ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|bearer|credential|cookie)\s*[:=]\s*\S+)/iu;
const FORBIDDEN_INPUT_KEY_RE =
  /^(?:raw|chat|payload|body|messages?|transcript|credentials?|tokens?|passwords?|cookies?|sessions?)$/iu;
const PRIVATE_URL_OR_REF_RE =
  /(?:^(?:https?|ssh|git):\/\/|^git@|^refs\/(?!heads\/|tags\/))/iu;
const STALE_RECOVERY_POLICY =
  "same_host_dead_pid_expired_owner_approved";
const NON_INTERACTIVE_GIT_ENV = Object.freeze({
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never",
  GIT_ASKPASS: process.execPath,
  SSH_ASKPASS: process.execPath,
  SSH_ASKPASS_REQUIRE: "never",
  GIT_SSH_COMMAND: "ssh -oBatchMode=yes -oNumberOfPasswordPrompts=0",
});
const CURSOR_ROOT =
  "guild_hall/state/operations/ai_work_result_recovery/v1/cursors";
const REQUIRED_FORBIDDEN_ROOT_KINDS = new Set([
  "active_public_root",
  "active_workmeta",
  "active_private_state",
  "codex_worktree",
  "orca_worktree",
  "automation_control_root",
]);
const FIXED_FALSE_AUTHORITY_FIELDS = Object.freeze([
  "official_completion",
  "worksession_acceptance",
  "taskdriver_acceptance",
  "erp_acceptance",
  "mcp_acceptance",
]);

class RunnerError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class CursorRunnerInterruption extends Error {
  constructor(point) {
    super(`injected_fault:${point}`);
    this.name = "CursorRunnerInterruption";
    this.code = `injected_fault:${point}`;
    this.point = point;
  }
}

function fail(code) {
  throw new RunnerError(code);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, allowed) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function rejectForbiddenInput(value, key = null) {
  if (
    key
    && FORBIDDEN_INPUT_KEY_RE.test(key)
    && !(key === "credential" && value === "capture_prohibited")
  ) fail("input_contract_invalid");
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenInput(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      rejectForbiddenInput(child, childKey);
    }
    return;
  }
  if (typeof value !== "string") return;
  if (SECRET_SENTINEL_RE.test(value)) fail("input_boundary_sentinel");
  const pathKey = [
    "snapshot_path",
    "clone_path",
    "runtime_root",
    "lock_path",
    "input_path",
    "path",
    "runner",
    "source",
    "writer_workmeta",
    "writer_private_state",
    "config",
    "locks",
    "active_public_root",
    "active_workmeta",
    "active_private_state",
    "automation_control_root",
  ].includes(key);
  if (!pathKey && ABSOLUTE_PATH_SENTINEL_RE.test(value)) {
    fail("input_boundary_sentinel");
  }
  if (PRIVATE_URL_OR_REF_RE.test(value)) {
    fail("input_boundary_sentinel");
  }
}

function assertExactRunnerShape(input) {
  if (!exactKeys(input, [
    "schema_version",
    "execution_mode",
    "recorded_at",
    "runtime",
    "source",
    "cursor",
    "ledger_writer",
    "cursor_writer",
    "lease",
    "isolation",
    "runtime_preflight",
    "automation_binding",
    "source_allowlist",
    "ledger_writer_allowlist",
    "cursor_writer_allowlist",
  ])) fail("input_top_level_contract_invalid");
  if (!exactKeys(input.runtime, [
    "tool",
    "model",
    "installed_models",
    "asserted_worker",
  ])) fail("runtime_contract_invalid");
  if (!exactKeys(input.source, [
    "classification",
    "repo",
    "ref",
    "source_lane",
    "seed",
    "target",
    "snapshot_path",
  ])) fail("source_contract_invalid");
  if (!exactKeys(input.cursor, [
    "repo",
    "ref",
    "source_lane",
    "last_successful_source_commit",
    "expected_revision",
    "expected_sequence",
    "logical_path",
  ])) fail("cursor_contract_invalid");
  if (!exactKeys(input.ledger_writer, [
    "binding_id",
    "classification",
    "clone_path",
    "remote",
    "transport_class",
    "authority_fingerprint",
    "ref",
    "ledger_logical_path",
    "commit_author",
    "output_commit_message",
  ])) fail("ledger_writer_contract_invalid");
  if (!exactKeys(input.cursor_writer, [
    "binding_id",
    "classification",
    "clone_path",
    "remote",
    "transport_class",
    "authority_fingerprint",
    "ref",
    "commit_author",
    "cursor_commit_message",
  ])) fail("cursor_writer_contract_invalid");
  if (
    !exactKeys(input.ledger_writer.commit_author, ["name", "email"])
    || !exactKeys(input.cursor_writer.commit_author, ["name", "email"])
  ) fail("commit_author_contract_invalid");
  if (!exactKeys(input.lease, [
    "owner_token",
    "pid",
    "host_identity",
    "acquired_at",
    "expires_at",
    "writer_epoch",
    "lock_path",
    "stale_recovery_policy",
    "owner_allows_stale_recovery",
  ])) fail("lease_contract_invalid");
  if (!exactKeys(input.isolation, ["runtime_root", "forbidden_roots"])) {
    fail("isolation_contract_invalid");
  }
  if (!exactKeys(input.runtime_preflight, ["input", "receipt"])) {
    fail("runtime_preflight_full_projection_required");
  }
  if (!exactKeys(input.automation_binding, [
    "candidate_sha256",
    "candidate_status",
    "runtime_manifest_digest",
    "runtime_evidence_digest",
    "runtime_launch_binding_digest",
  ])) fail("automation_binding_contract_invalid");
  if (
    !Array.isArray(input.isolation.forbidden_roots)
    || !input.isolation.forbidden_roots.every((row) =>
      exactKeys(row, ["kind", "path"]))
  ) fail("forbidden_roots_contract_invalid");
  if (
    !Array.isArray(input.source_allowlist)
    || !input.source_allowlist.every((row) => exactKeys(row, [
      "classification",
      "repo",
      "ref",
      "source_lane",
      "snapshot_path",
    ]))
  ) fail("source_allowlist_contract_invalid");
  if (
    !Array.isArray(input.ledger_writer_allowlist)
    || !input.ledger_writer_allowlist.every((row) => exactKeys(row, [
      "binding_id",
      "classification",
      "clone_path",
      "remote",
      "transport_class",
      "authority_fingerprint",
      "ref",
      "ledger_logical_path",
    ]))
  ) fail("ledger_writer_allowlist_contract_invalid");
  if (
    !Array.isArray(input.cursor_writer_allowlist)
    || !input.cursor_writer_allowlist.every((row) => exactKeys(row, [
      "binding_id",
      "classification",
      "clone_path",
      "remote",
      "transport_class",
      "authority_fingerprint",
      "ref",
      "cursor_logical_path",
    ]))
  ) fail("cursor_writer_allowlist_contract_invalid");
  rejectForbiddenInput(input);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sourceLaneDigest(source) {
  return sourceLaneTrailer(source).split(": ", 2)[1].slice("sha256:".length);
}

export function cursorLogicalPath(source) {
  return `${CURSOR_ROOT}/${sourceLaneDigest(source)}.json`;
}

export function cursorRevision(cursor) {
  return sha256(canonicalize(cursor));
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathContains(root, target) {
  const rel = relative(root, target);
  return rel === "" || (
    rel !== ".."
    && !rel.startsWith(`..${sep}`)
    && !isAbsolute(rel)
  );
}

function exactRealpath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) fail(code);
  let physical;
  try {
    physical = realpathSync.native(resolve(value));
  } catch {
    fail(code);
  }
  if (comparablePath(physical) !== comparablePath(value)) fail(code);
  let stat;
  try {
    stat = lstatSync(physical);
  } catch {
    fail(code);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
  return physical;
}

function exactLockLocation(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("lease_lock_path_invalid");
  }
  const normalized = resolve(value);
  const parent = exactRealpath(dirname(normalized), "lease_lock_parent_invalid");
  const canonical = resolve(parent, basename(normalized));
  if (comparablePath(canonical) !== comparablePath(value)) {
    fail("lease_lock_path_invalid");
  }
  if (existsSync(canonical)) {
    const stat = lstatSync(canonical);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail("lease_lock_path_invalid");
    }
  }
  return { path: canonical, parent };
}

function assertPairwiseDisjoint(roots) {
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (
        pathContains(roots[left], roots[right])
        || pathContains(roots[right], roots[left])
      ) fail("isolation_roots_overlap");
    }
  }
}

function validateIsolation(
  input,
  sourceRoot,
  ledgerWriterRoot,
  cursorWriterRoot,
  ledgerRemoteRoot,
  cursorRemoteRoot,
) {
  const runtimeRoot = exactRealpath(
    input.isolation.runtime_root,
    "runtime_root_realpath_invalid",
  );
  const lock = exactLockLocation(input.lease.lock_path);
  const forbiddenRoots = input.isolation.forbidden_roots.map((row) => {
    safeToken(row.kind, "forbidden_root_kind_invalid");
    return {
      kind: row.kind,
      root: exactRealpath(row.path, "forbidden_root_realpath_invalid"),
    };
  });
  const kinds = new Set(forbiddenRoots.map((row) => row.kind));
  for (const required of REQUIRED_FORBIDDEN_ROOT_KINDS) {
    if (!kinds.has(required)) fail("forbidden_root_kind_missing");
  }
  const transactionRoots = [
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerRemoteRoot,
    cursorRemoteRoot,
    runtimeRoot,
    lock.parent,
  ].filter(Boolean);
  assertPairwiseDisjoint(transactionRoots);
  for (const transactionRoot of transactionRoots) {
    for (const forbidden of forbiddenRoots) {
      if (
        pathContains(forbidden.root, transactionRoot)
        || pathContains(transactionRoot, forbidden.root)
      ) fail("forbidden_root_overlap");
    }
  }
  return { runtimeRoot, lock, forbiddenRoots };
}

function assertRuntimePreflightBinding(
  input,
  sourceRoot,
  ledgerWriterRoot,
  cursorWriterRoot,
  ledgerRemoteRoot,
  cursorRemoteRoot,
  isolation,
) {
  const preflightInput = input.runtime_preflight.input;
  const roots = preflightInput.roots;
  const runtimeRoots = {
    runner: exactRealpath(roots.runner, "runtime_runner_root_invalid"),
    source: exactRealpath(roots.source, "runtime_source_root_invalid"),
    writerWorkmeta: exactRealpath(
      roots.writer_workmeta,
      "runtime_ledger_writer_root_invalid",
    ),
    writerPrivateState: exactRealpath(
      roots.writer_private_state,
      "runtime_cursor_writer_root_invalid",
    ),
    locks: exactRealpath(roots.locks, "runtime_locks_root_invalid"),
  };
  if (
    comparablePath(runtimeRoots.runner) !== comparablePath(isolation.runtimeRoot)
    || comparablePath(runtimeRoots.source) !== comparablePath(sourceRoot)
    || comparablePath(runtimeRoots.locks) !== comparablePath(isolation.lock.parent)
  ) fail("runtime_preflight_path_binding_mismatch");
  if (
    !pathContains(runtimeRoots.writerWorkmeta, ledgerWriterRoot)
    || (
      ledgerRemoteRoot
      && !pathContains(runtimeRoots.writerWorkmeta, ledgerRemoteRoot)
    )
    || !pathContains(runtimeRoots.writerPrivateState, cursorWriterRoot)
    || (
      cursorRemoteRoot
      && !pathContains(runtimeRoots.writerPrivateState, cursorRemoteRoot)
    )
  ) fail("runtime_preflight_writer_binding_mismatch");

  const isolationForbidden = isolation.forbiddenRoots.map((row) =>
    `${row.kind}\0${comparablePath(row.root)}`).sort();
  const preflightForbidden = preflightInput.forbidden_roots.map((row) =>
    `${row.kind}\0${comparablePath(
      exactRealpath(row.path, "runtime_forbidden_root_invalid"),
    )}`).sort();
  if (canonicalize(isolationForbidden) !== canonicalize(preflightForbidden)) {
    fail("runtime_preflight_forbidden_roots_mismatch");
  }

  const writerEvidence = preflightInput.evidence.git_authority.writers;
  const ledgerWriter = input.ledger_writer;
  const cursorWriter = input.cursor_writer;
  const expectedLedgerTransport = ledgerWriter.transport_class === "local_file"
    ? "local"
    : ledgerWriter.transport_class;
  const expectedCursorTransport = cursorWriter.transport_class === "local_file"
    ? "local"
    : cursorWriter.transport_class;
  if (
    writerEvidence.workmeta.writer_role !== "writer_workmeta"
    || writerEvidence.workmeta.logical_remote !== ledgerWriter.remote
    || writerEvidence.workmeta.ref !== ledgerWriter.ref
    || writerEvidence.workmeta.transport_class !== expectedLedgerTransport
    || writerEvidence.workmeta.authority_fingerprint
      !== ledgerWriter.authority_fingerprint
    || writerEvidence.private_state.writer_role !== "writer_private_state"
    || writerEvidence.private_state.logical_remote !== cursorWriter.remote
    || writerEvidence.private_state.ref !== cursorWriter.ref
    || writerEvidence.private_state.transport_class !== expectedCursorTransport
    || writerEvidence.private_state.authority_fingerprint
      !== cursorWriter.authority_fingerprint
  ) fail("runtime_preflight_writer_authority_binding_mismatch");

  const leasePolicy = preflightInput.evidence.lease_policy;
  if (
    leasePolicy.stale_recovery_policy
      !== input.lease.stale_recovery_policy
    || leasePolicy.owner_token_class !== "opaque_random_256_v1"
    || leasePolicy.operational_primary !== true
    || leasePolicy.first_lease_stale !== false
    || leasePolicy.host_identity_digest
      !== sha256(input.lease.host_identity)
    || leasePolicy.initial_writer_epoch !== input.lease.writer_epoch
    || leasePolicy.initial_writer_epoch !== Math.max(
      leasePolicy.restored_writer_epoch,
      leasePolicy.authority_writer_epoch,
      leasePolicy.receipt_writer_epoch,
      0,
    ) + 1
  ) fail("runtime_preflight_lease_policy_binding_mismatch");
}

function safeLogicalPath(value, code) {
  if (
    typeof value !== "string"
    || !LOGICAL_PATH_RE.test(value)
    || value.includes("\\")
    || value.startsWith("/")
    || value.endsWith("/")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
    || value === ".git"
    || value.startsWith(".git/")
  ) {
    fail(code);
  }
  return value;
}

function safeMetadata(value, code, maximum = 240) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r\n]/u.test(value)
    || ABSOLUTE_PATH_SENTINEL_RE.test(value)
    || SECRET_SENTINEL_RE.test(value)
  ) {
    fail(code);
  }
  return value;
}

function safeToken(value, code) {
  if (
    typeof value !== "string"
    || !TOKEN_RE.test(value)
    || ABSOLUTE_PATH_SENTINEL_RE.test(value)
    || SECRET_SENTINEL_RE.test(value)
  ) {
    fail(code);
  }
  return value;
}

function safeRef(value, code) {
  if (
    typeof value !== "string"
    || !REF_RE.test(value)
    || ABSOLUTE_PATH_SENTINEL_RE.test(value)
    || SECRET_SENTINEL_RE.test(value)
  ) {
    fail(code);
  }
  return value;
}

function normalizeIso(value, code) {
  if (typeof value !== "string" || !value.endsWith("Z")) fail(code);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) fail(code);
  return parsed.toISOString();
}

function gitSpawnEnvironment(overrides = {}) {
  return {
    ...process.env,
    ...overrides,
    ...NON_INTERACTIVE_GIT_ENV,
  };
}

function gitResult(repoPath, args, options = {}) {
  return spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    input: options.input,
    env: gitSpawnEnvironment(options.env),
  });
}

export function inspectNonInteractiveGitEnvironment(overrides = {}) {
  const env = gitSpawnEnvironment(overrides);
  return Object.freeze({
    terminal_prompt_blocked: env.GIT_TERMINAL_PROMPT === "0",
    credential_manager_interactive:
      String(env.GCM_INTERACTIVE).toLowerCase() !== "never",
    git_askpass_blocked: env.GIT_ASKPASS === process.execPath,
    ssh_askpass_blocked:
      env.SSH_ASKPASS === process.execPath
      && env.SSH_ASKPASS_REQUIRE === "never",
    ssh_batch_mode: env.GIT_SSH_COMMAND
      === "ssh -oBatchMode=yes -oNumberOfPasswordPrompts=0",
    raw_failure_output_discarded: true,
  });
}

function git(repoPath, args, code, options = {}) {
  const result = gitResult(repoPath, args, options);
  if (result.status !== 0) fail(code);
  return String(result.stdout).replace(/\r\n/gu, "\n");
}

function resolveCommit(repoPath, value, code) {
  if (!SHA_RE.test(value || "")) fail(code);
  const commit = git(
    repoPath,
    ["rev-parse", "--verify", `${value}^{commit}`],
    code,
  ).trim();
  if (!SHA_RE.test(commit)) fail(code);
  return commit;
}

function resolveRef(repoPath, ref, code) {
  if (!REF_RE.test(ref || "")) fail(code);
  const commit = git(
    repoPath,
    ["rev-parse", "--verify", `${ref}^{commit}`],
    code,
  ).trim();
  if (!SHA_RE.test(commit)) fail(code);
  return commit;
}

function isAncestor(repoPath, older, newer) {
  const result = gitResult(repoPath, ["merge-base", "--is-ancestor", older, newer]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  fail("git_ancestry_check_failed");
}

function isBare(repoPath) {
  return git(
    repoPath,
    ["rev-parse", "--is-bare-repository"],
    "git_repository_probe_failed",
  ).trim() === "true";
}

function writerWorktreeState(repoPath) {
  return git(
    repoPath,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    "writer_status_failed",
  );
}

function readBlob(repoPath, commit, logicalPath, { optional = false } = {}) {
  const result = gitResult(repoPath, ["show", `${commit}:${logicalPath}`]);
  if (result.status !== 0) {
    if (optional) return "";
    fail("writer_required_blob_missing");
  }
  return String(result.stdout).replace(/\r\n/gu, "\n");
}

function parseJsonObject(text, code) {
  let value;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ""));
  } catch {
    fail(code);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function exactLeaseRecord(value) {
  return exactKeys(value, [
    "owner_token",
    "pid",
    "host_identity",
    "acquired_at",
    "expires_at",
    "writer_epoch",
  ]);
}

function leaseRecord(input) {
  return {
    owner_token: input.owner_token,
    pid: input.pid,
    host_identity: input.host_identity,
    acquired_at: normalizeIso(input.acquired_at, "lease_acquired_at_invalid"),
    expires_at: normalizeIso(input.expires_at, "lease_expires_at_invalid"),
    writer_epoch: input.writer_epoch,
  };
}

function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function currentTime(options) {
  const value = typeof options.now === "function"
    ? options.now()
    : new Date().toISOString();
  return normalizeIso(value, "lease_clock_invalid");
}

function readLeaseSnapshot(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    fail("lease_record_invalid");
  }
  const current = parseJsonObject(
    text,
    "lease_record_invalid",
  );
  if (!exactLeaseRecord(current)) fail("lease_record_invalid");
  return { text, record: current };
}

function readLease(path) {
  return readLeaseSnapshot(path).record;
}

function writeExclusiveLease(path, record) {
  let descriptor;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch (error) {
    if (error?.code === "EEXIST") fail("lease_create_race");
    fail("lease_create_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function staleTakeoverPath(lockPath) {
  return `${lockPath}.stale-takeover`;
}

function replaceStaleLease(lockPath, stale, record, options) {
  const quarantine = staleTakeoverPath(lockPath);
  try {
    linkSync(lockPath, quarantine);
  } catch (error) {
    if (error?.code === "EEXIST") fail("lease_stale_takeover_contended");
    if (error?.code === "ENOENT") fail("lease_stale_record_changed");
    fail("lease_stale_takeover_failed");
  }

  try {
    if (typeof options.beforeStaleLeaseDelete === "function") {
      options.beforeStaleLeaseDelete();
    }
    const current = readLeaseSnapshot(lockPath);
    const claimed = readLeaseSnapshot(quarantine);
    if (current.text !== stale.text || claimed.text !== stale.text) {
      fail("lease_stale_record_changed");
    }
    try {
      unlinkSync(lockPath);
    } catch {
      fail("lease_stale_takeover_failed");
    }
    writeExclusiveLease(lockPath, record);
  } finally {
    try {
      unlinkSync(quarantine);
    } catch {
      // The transient quarantine may already have been removed.
    }
  }
}

function acquireLease(input, recordedAt, options, receipt) {
  const record = leaseRecord(input);
  const now = currentTime(options);
  if (
    !safeMetadata(record.owner_token, "lease_owner_token_invalid", 160)
    || !safeMetadata(record.host_identity, "lease_host_identity_invalid", 160)
  ) fail("lease_identity_invalid");
  if (!Number.isSafeInteger(record.pid) || record.pid < 1) {
    fail("lease_pid_invalid");
  }
  if (!Number.isSafeInteger(record.writer_epoch) || record.writer_epoch < 1) {
    fail("lease_writer_epoch_invalid");
  }
  if (record.acquired_at >= record.expires_at) fail("lease_interval_invalid");
  if (record.acquired_at > recordedAt) fail("lease_acquired_after_recorded_at");
  if (record.expires_at <= now) fail("lease_interval_expired");
  if (input.stale_recovery_policy !== STALE_RECOVERY_POLICY) {
    fail("lease_stale_recovery_policy_invalid");
  }

  let staleRecovered = false;
  const quarantine = staleTakeoverPath(input.lock_path);
  if (existsSync(quarantine)) fail("lease_takeover_in_progress");
  if (existsSync(input.lock_path)) {
    const stale = readLeaseSnapshot(input.lock_path);
    const pidAlive = (options.isPidAlive || defaultPidAlive)(stale.record.pid);
    if (stale.record.host_identity !== record.host_identity) {
      fail("lease_stale_owner_host_mismatch");
    }
    if (pidAlive) fail("lease_live_owner");
    if (normalizeIso(stale.record.expires_at, "lease_record_invalid") > now) {
      fail("lease_not_expired");
    }
    if (!input.owner_allows_stale_recovery) {
      fail("lease_stale_recovery_not_allowed");
    }
    if (
      !Number.isSafeInteger(stale.record.writer_epoch)
      || record.writer_epoch <= stale.record.writer_epoch
    ) fail("writer_epoch_stale");
    replaceStaleLease(input.lock_path, stale, record, options);
    staleRecovered = true;
  } else {
    writeExclusiveLease(input.lock_path, record);
  }
  receipt.lease = {
    state: staleRecovered ? "RECOVERED_STALE" : "ACQUIRED",
    writer_epoch: record.writer_epoch,
    acquired: true,
    released: false,
    stale_recovered: staleRecovered,
  };
  return { path: input.lock_path, record, options };
}

function assertLease(handle) {
  let current;
  try {
    current = readLease(handle.path);
  } catch {
    fail("lease_fence_lost");
  }
  if (canonicalize(current) !== canonicalize(handle.record)) {
    fail("lease_fence_lost");
  }
  if (normalizeIso(current.expires_at, "lease_record_invalid")
      <= currentTime(handle.options)) {
    fail("lease_expired");
  }
}

function releaseLease(handle, receipt) {
  if (!handle) return;
  try {
    assertLease(handle);
    unlinkSync(handle.path);
    receipt.lease.state = "RELEASED";
    receipt.lease.released = true;
  } catch {
    receipt.lease.state = "FENCE_LOST";
    receipt.lease.released = false;
    hold(receipt, "lease_release_failed");
  }
}

function parseLedger(text) {
  if (!text) return [];
  const rows = [];
  for (const line of text.split(/\r?\n/u).filter(Boolean)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      fail("ledger_json_invalid");
    }
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      fail("ledger_record_invalid");
    }
    rows.push(row);
  }
  return rows;
}

function appendLedger(existing, records) {
  if (records.length === 0) return existing;
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  return `${existing}${separator}${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function assertNoIdentityConflicts(records) {
  const byId = new Map();
  for (const record of records) {
    if (typeof record.id !== "string") fail("ledger_record_identity_invalid");
    const digest = canonicalRecordDigest(record);
    const prior = byId.get(record.id);
    if (prior && prior !== digest) fail("ledger_identity_digest_conflict");
    byId.set(record.id, digest);
  }
  return byId;
}

function configuredLocalRemoteRoot(writerRoot, remote) {
  const configured = git(
    writerRoot,
    ["remote", "get-url", remote],
    "writer_remote_not_configured",
  ).trim();
  if (
    !configured
    || SECRET_SENTINEL_RE.test(configured)
    || /:\/\/[^/\s]+@/u.test(configured)
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(configured)
    || /^git@/iu.test(configured)
  ) fail("writer_local_remote_binding_invalid");
  const candidate = isAbsolute(configured)
    ? configured
    : resolve(writerRoot, configured);
  return exactRealpath(candidate, "writer_remote_realpath_invalid");
}

export function localFileAuthorityFingerprint(value) {
  const physical = exactRealpath(value, "writer_remote_realpath_invalid");
  return sha256(`local_file\0${comparablePath(physical)}`);
}

function fetchRemoteTipGit(writerRoot, remote, ref) {
  git(
    writerRoot,
    ["fetch", "--no-tags", "--quiet", remote, ref],
    "writer_remote_fetch_failed",
  );
  return resolveCommit(writerRoot, git(
    writerRoot,
    ["rev-parse", "--verify", "FETCH_HEAD"],
    "writer_remote_tip_invalid",
  ).trim(), "writer_remote_tip_invalid");
}

function tryFetchRemoteTipGit(writerRoot, remote, ref) {
  const fetched = gitResult(
    writerRoot,
    ["fetch", "--no-tags", "--quiet", remote, ref],
  );
  if (fetched.status !== 0) return null;
  const result = gitResult(
    writerRoot,
    ["rev-parse", "--verify", "FETCH_HEAD"],
  );
  const tip = String(result.stdout || "").trim();
  return result.status === 0 && SHA_RE.test(tip) ? tip : null;
}

function pushCommitGit(writerRoot, remote, ref, commit) {
  const result = gitResult(
    writerRoot,
    ["push", "--porcelain", remote, `${commit}:${ref}`],
  );
  return result.status === 0;
}

function remoteContainsCommitGit(writerRoot, remote, ref, commit) {
  const tip = fetchRemoteTipGit(writerRoot, remote, ref);
  return {
    tip,
    contains: isAncestor(writerRoot, commit, tip),
  };
}

function transportBinding(writer) {
  return {
    schema_version: TRANSPORT_BINDING_SCHEMA,
    logical_remote: writer.remote,
    ref: writer.ref,
    transport_class: writer.transport_class,
    authority_fingerprint: writer.authority_fingerprint,
  };
}

function builtInGitTransportExecutor(writerRoot, writer) {
  let lastFreshTip = null;
  return (request) => {
    if (request.operation === "fetch_fresh_tip") {
      lastFreshTip = fetchRemoteTipGit(
        writerRoot,
        writer.remote,
        writer.ref,
      );
      return {
        status: "OK",
        tip: lastFreshTip,
        authority_binding_verified: true,
      };
    }
    if (request.operation === "push_commit") {
      const pushed = pushCommitGit(
        writerRoot,
        writer.remote,
        writer.ref,
        request.commit,
      );
      if (pushed) {
        return {
          status: "PUSHED",
          authority_binding_verified: true,
        };
      }
      const reconciledTip = tryFetchRemoteTipGit(
        writerRoot,
        writer.remote,
        writer.ref,
      );
      if (
        reconciledTip
        && isAncestor(writerRoot, request.commit, reconciledTip)
      ) {
        lastFreshTip = reconciledTip;
        return {
          status: "PUSHED",
          authority_binding_verified: true,
        };
      }
      const isConcurrentNonFastForward = Boolean(
        reconciledTip
        && lastFreshTip
        && reconciledTip !== lastFreshTip
        && isAncestor(writerRoot, lastFreshTip, reconciledTip),
      );
      if (reconciledTip) lastFreshTip = reconciledTip;
      return {
        status: isConcurrentNonFastForward
          ? "REJECTED_NON_FAST_FORWARD"
          : "UNKNOWN_AFTER_PUSH",
        authority_binding_verified: true,
      };
    }
    if (request.operation === "verify_inclusion") {
      const result = remoteContainsCommitGit(
        writerRoot,
        writer.remote,
        writer.ref,
        request.commit,
      );
      return {
        status: result.contains ? "INCLUDED" : "NOT_INCLUDED",
        tip: result.tip,
        authority_binding_verified: true,
      };
    }
    fail("transport_operation_invalid");
  };
}

function assertSafeNetworkRemoteBinding(writerRoot, writer) {
  const remoteNames = git(
    writerRoot,
    ["remote"],
    "writer_remote_not_configured",
  ).split(/\r?\n/u).filter(Boolean);
  if (!remoteNames.includes(writer.remote)) {
    fail("writer_remote_not_configured");
  }
  const transportClass = git(
    writerRoot,
    [
      "config",
      "--get",
      `remote.${writer.remote}.soulforge-transport-class`,
    ],
    "writer_transport_metadata_missing",
  ).trim();
  const fingerprint = git(
    writerRoot,
    [
      "config",
      "--get",
      `remote.${writer.remote}.soulforge-authority-fingerprint`,
    ],
    "writer_transport_metadata_missing",
  ).trim();
  if (
    transportClass !== writer.transport_class
    || fingerprint !== writer.authority_fingerprint
  ) fail("writer_authority_fingerprint_mismatch");
}

function buildTransport(writerRoot, writer, options) {
  let remoteRoot = null;
  let executor = options.transportExecutors?.[writer.binding_id];
  if (writer.transport_class === "local_file") {
    remoteRoot = configuredLocalRemoteRoot(writerRoot, writer.remote);
    if (!isBare(remoteRoot)) fail("writer_remote_must_be_bare");
    if (
      localFileAuthorityFingerprint(remoteRoot)
      !== writer.authority_fingerprint
    ) fail("writer_authority_fingerprint_mismatch");
    executor ||= builtInGitTransportExecutor(writerRoot, writer);
  } else if (typeof executor !== "function") {
    assertSafeNetworkRemoteBinding(writerRoot, writer);
    executor = builtInGitTransportExecutor(writerRoot, writer);
  }
  return {
    adapter: createTransportAdapter(transportBinding(writer), executor),
    remoteRoot,
  };
}

function commitWithBlob({
  writerRoot,
  baseCommit,
  logicalPath,
  content,
  author,
  recordedAt,
  message,
}) {
  const gitDirectoryRaw = git(
    writerRoot,
    ["rev-parse", "--absolute-git-dir"],
    "writer_git_directory_invalid",
  ).trim();
  const gitDirectory = exactRealpath(gitDirectoryRaw, "writer_git_directory_invalid");
  if (!pathContains(writerRoot, gitDirectory) && !pathContains(gitDirectory, writerRoot)) {
    fail("writer_git_directory_escape");
  }
  const indexPath = resolve(
    gitDirectory,
    `five-field-runner-${process.pid}-${randomBytes(8).toString("hex")}.index`,
  );
  const env = {
    GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: recordedAt,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: recordedAt,
  };
  try {
    git(writerRoot, ["read-tree", baseCommit], "writer_read_tree_failed", { env });
    const blob = git(
      writerRoot,
      ["hash-object", "-w", "--stdin"],
      "writer_blob_create_failed",
      { env, input: content },
    ).trim();
    if (!SHA_RE.test(blob)) fail("writer_blob_create_failed");
    git(
      writerRoot,
      ["update-index", "--add", "--cacheinfo", "100644", blob, logicalPath],
      "writer_index_update_failed",
      { env },
    );
    const tree = git(
      writerRoot,
      ["write-tree"],
      "writer_tree_create_failed",
      { env },
    ).trim();
    if (!SHA_RE.test(tree)) fail("writer_tree_create_failed");
    const commit = git(
      writerRoot,
      ["commit-tree", tree, "-p", baseCommit],
      "writer_commit_create_failed",
      { env, input: `${message}\n` },
    ).trim();
    if (!SHA_RE.test(commit)) fail("writer_commit_create_failed");
    return commit;
  } finally {
    rmSync(indexPath, { force: true });
  }
}

function baseReceipt() {
  return {
    schema_version: RUNNER_RECEIPT_SCHEMA,
    operation: "ai_work_result_recovery",
    execution_mode: "isolated",
    status: "HOLD",
    official_completion: false,
    worksession_acceptance: false,
    taskdriver_acceptance: false,
    erp_acceptance: false,
    mcp_acceptance: false,
    claim_ceiling: "operational_evidence_only",
    worker_identity: null,
    source: {
      classification: null,
      repo: null,
      ref: null,
      source_lane: null,
      seed: null,
      target: null,
    },
    source_snapshot: {
      bare: null,
      target_tree_digest: null,
      immutable_recheck: false,
    },
    records: {
      missing: 0,
      appended: 0,
      duplicate: 0,
      full_record_digests: [],
    },
    self_loop_exclusions: [],
    publication_order: [],
    ledger_output: {
      commit: null,
      created: false,
      push_success: false,
      remote_contains_commit: false,
    },
    cursor_update: {
      before: null,
      after: null,
      state: "UNKNOWN",
      expected_revision: null,
      resulting_revision: null,
      sequence_before: null,
      sequence_after: null,
      writer_epoch_before: null,
      writer_epoch_after: null,
      commit: null,
      created: false,
      cas_success: false,
      push_success: false,
      remote_contains_commit: false,
    },
    writer_binding: {
      ledger: {
        classification: null,
        transport_class: null,
        authority_binding_verified: false,
      },
      cursor: {
        classification: null,
        transport_class: null,
        authority_binding_verified: false,
      },
    },
    runtime_preflight: {
      status: "HOLD",
      exact_receipt_match: false,
      manifest_digest: null,
      evidence_digest: null,
      launch_binding_digest: null,
      forbidden_union_digest: null,
      reviewed_receipt_digest: null,
      binding_digest: null,
      lease_policy: {
        owner_token_class: "UNKNOWN",
        first_lease_stale: null,
        host_identity_digest: null,
        restored_writer_epoch: null,
        authority_writer_epoch: null,
        receipt_writer_epoch: null,
        initial_writer_epoch: null,
        ttl_minutes: null,
        ttl_formula: null,
        epoch_formula: null,
      },
      rechecks: {
        initial: false,
        before_ledger_push: false,
        before_cursor_commit: false,
        before_cursor_push: false,
      },
      hold_reasons: ["runtime_preflight_not_run"],
    },
    automation_binding: {
      candidate_sha256: null,
      candidate_status: "UNKNOWN",
      matched: false,
    },
    reconciliation: {
      required: false,
      reason: null,
      cursor_unchanged: null,
    },
    lease: {
      state: "NOT_ACQUIRED",
      writer_epoch: null,
      acquired: false,
      released: false,
      stale_recovered: false,
    },
    hold_reasons: [],
    safety: {
      first_live_source_public_only: false,
      source_snapshot_worktree_mutations: 0,
      ledger_writer_worktree_mutations: 0,
      cursor_writer_worktree_mutations: 0,
      records_deleted: 0,
      records_rewritten: 0,
      force_pushes: 0,
      designated_writer_commits: 0,
      designated_remote_pushes: 0,
      cursor_compare_and_swap: true,
      paths_and_remote_redacted: true,
    },
  };
}

function hold(receipt, reason) {
  if (!receipt.hold_reasons.includes(reason)) receipt.hold_reasons.push(reason);
  receipt.status = "HOLD";
  return receipt;
}

function validateAllowlists(
  input,
  sourceRoot,
  ledgerWriterRoot,
  cursorWriterRoot,
) {
  const source = input.source;
  const sourceMatches = Array.isArray(input.source_allowlist)
    ? input.source_allowlist.filter((row) =>
      row?.classification === "public"
      && row.repo === source.repo
      && row.ref === source.ref
      && row.source_lane === source.source_lane
      && typeof row.snapshot_path === "string"
      && comparablePath(realpathSync.native(resolve(row.snapshot_path)))
        === comparablePath(sourceRoot))
    : [];
  if (sourceMatches.length !== 1) fail("source_not_exactly_allowlisted");

  const ledgerWriter = input.ledger_writer;
  const ledgerMatches = input.ledger_writer_allowlist.filter((row) =>
    row.binding_id === ledgerWriter.binding_id
    && row.classification === ledgerWriter.classification
    && comparablePath(realpathSync.native(resolve(row.clone_path)))
      === comparablePath(ledgerWriterRoot)
    && row.remote === ledgerWriter.remote
    && row.transport_class === ledgerWriter.transport_class
    && row.authority_fingerprint === ledgerWriter.authority_fingerprint
    && row.ref === ledgerWriter.ref
    && row.ledger_logical_path === ledgerWriter.ledger_logical_path);
  if (ledgerMatches.length !== 1) fail("ledger_writer_not_exactly_allowlisted");

  const cursorWriter = input.cursor_writer;
  const cursorMatches = input.cursor_writer_allowlist.filter((row) =>
    row?.binding_id === cursorWriter.binding_id
    && row.classification === cursorWriter.classification
    && comparablePath(realpathSync.native(resolve(row.clone_path)))
      === comparablePath(cursorWriterRoot)
    && row.remote === cursorWriter.remote
    && row.transport_class === cursorWriter.transport_class
    && row.authority_fingerprint === cursorWriter.authority_fingerprint
    && row.ref === cursorWriter.ref
    && row.cursor_logical_path === input.cursor.logical_path);
  if (cursorMatches.length !== 1) fail("cursor_writer_not_exactly_allowlisted");
}

function validateWriter(writer, kind) {
  safeToken(writer.binding_id, `${kind}_binding_id_invalid`);
  if (!["private", "synthetic"].includes(writer.classification)) {
    fail(`${kind}_classification_invalid`);
  }
  safeToken(writer.remote, `${kind}_remote_invalid`);
  safeRef(writer.ref, `${kind}_ref_invalid`);
  if (!["local_file", "https", "ssh"].includes(writer.transport_class)) {
    fail(`${kind}_transport_class_invalid`);
  }
  if (!DIGEST_RE.test(writer.authority_fingerprint || "")) {
    fail(`${kind}_authority_fingerprint_invalid`);
  }
  const author = writer.commit_author || {};
  safeMetadata(author.name, `${kind}_author_name_invalid`, 120);
  if (
    typeof author.email !== "string"
    || !EMAIL_RE.test(author.email)
    || ABSOLUTE_PATH_SENTINEL_RE.test(author.email)
    || SECRET_SENTINEL_RE.test(author.email)
  ) fail(`${kind}_author_email_invalid`);
}

function runtimePreflightNow(options) {
  const configured = typeof options.preflightNow === "function"
    ? options.preflightNow()
    : options.preflightNow;
  return configured ?? currentTime(options);
}

function assertFixedFalseAuthority(value, code) {
  if (
    FIXED_FALSE_AUTHORITY_FIELDS.some((field) => value?.[field] !== false)
    || value?.claim_ceiling !== "operational_evidence_only"
  ) fail(code);
}

function runtimeAuthorityBindingDigest(input) {
  return sha256(canonicalize({
    runtime_preflight: {
      manifest_digest: input.automation_binding.runtime_manifest_digest,
      evidence_digest: input.automation_binding.runtime_evidence_digest,
      launch_binding_digest:
        input.automation_binding.runtime_launch_binding_digest,
      forbidden_union_digest:
        input.runtime_preflight.receipt.forbidden_union_digest,
    },
    automation: {
      candidate_sha256: input.automation_binding.candidate_sha256,
      candidate_status: input.automation_binding.candidate_status,
    },
    roots: input.runtime_preflight.input.roots,
    guarded_roots: input.runtime_preflight.input.guarded_roots,
    forbidden_roots: input.runtime_preflight.input.forbidden_roots,
    worktree_inventory: input.runtime_preflight.input.worktree_inventory,
    writers: {
      ledger: {
        binding_id: input.ledger_writer.binding_id,
        clone_path: input.ledger_writer.clone_path,
        remote: input.ledger_writer.remote,
        transport_class: input.ledger_writer.transport_class,
        authority_fingerprint: input.ledger_writer.authority_fingerprint,
        ref: input.ledger_writer.ref,
        logical_path: input.ledger_writer.ledger_logical_path,
      },
      cursor: {
        binding_id: input.cursor_writer.binding_id,
        clone_path: input.cursor_writer.clone_path,
        remote: input.cursor_writer.remote,
        transport_class: input.cursor_writer.transport_class,
        authority_fingerprint: input.cursor_writer.authority_fingerprint,
        ref: input.cursor_writer.ref,
        logical_path: input.cursor.logical_path,
      },
    },
    lease: {
      host_identity: input.lease.host_identity,
      acquired_at: input.lease.acquired_at,
      expires_at: input.lease.expires_at,
      owner_token_digest: sha256(input.lease.owner_token),
      writer_epoch: input.lease.writer_epoch,
      stale_recovery_policy: input.lease.stale_recovery_policy,
      owner_allows_stale_recovery:
        input.lease.owner_allows_stale_recovery,
    },
  }));
}

function assertOneShotLeaseBasis(input) {
  const lease = input.lease;
  const policy = input.runtime_preflight.input.evidence.lease_policy;
  const acquiredAt = normalizeIso(
    lease.acquired_at,
    "lease_acquired_at_invalid",
  );
  const expiresAt = normalizeIso(
    lease.expires_at,
    "lease_expires_at_invalid",
  );
  const actualTtlMs =
    new Date(expiresAt).valueOf() - new Date(acquiredAt).valueOf();
  if (
    !OPAQUE_RANDOM_256_RE.test(lease.owner_token || "")
    || lease.owner_allows_stale_recovery !== false
    || policy.owner_token_class !== "opaque_random_256_v1"
    || policy.first_lease_stale !== false
    || policy.host_identity_digest !== sha256(lease.host_identity)
    || actualTtlMs !== policy.ttl_minutes * 60_000
    || lease.writer_epoch !== policy.initial_writer_epoch
    || policy.initial_writer_epoch !== Math.max(
      policy.restored_writer_epoch,
      policy.authority_writer_epoch,
      policy.receipt_writer_epoch,
      0,
    ) + 1
  ) fail("one_shot_lease_basis_mismatch");
}

function revalidateRuntimeAuthority(
  input,
  options,
  receipt,
  checkpoint,
  expectedBindingDigest = null,
) {
  if (
    !exactKeys(input.runtime_preflight, ["input", "receipt"])
    || input.runtime_preflight.input?.schema_version
      !== RUNTIME_PREFLIGHT_INPUT_SCHEMA
    || input.runtime_preflight.receipt?.schema_version
      !== RUNTIME_PREFLIGHT_RECEIPT_SCHEMA
  ) fail("runtime_preflight_full_projection_required");
  const reviewed = input.runtime_preflight.receipt;
  if (reviewed.status !== "PASS") fail("runtime_preflight_reviewed_pass_required");
  assertFixedFalseAuthority(reviewed, "runtime_preflight_authority_invalid");

  const recomputed = runRuntimePreflight(
    input.runtime_preflight.input,
    { now: runtimePreflightNow(options) },
  );
  if (recomputed.status !== "PASS") {
    fail(`runtime_preflight_recheck:${recomputed.hold_reasons?.[0]
      || "failed"}`);
  }
  assertFixedFalseAuthority(recomputed, "runtime_preflight_authority_invalid");
  if (canonicalize(recomputed) !== canonicalize(reviewed)) {
    fail("runtime_preflight_receipt_mismatch");
  }

  const binding = input.automation_binding;
  if (
    !DIGEST_RE.test(binding.candidate_sha256 || "")
    || binding.candidate_status !== "PAUSED"
    || binding.runtime_manifest_digest !== recomputed.manifest_digest
    || binding.runtime_evidence_digest !== recomputed.evidence_digest
    || binding.runtime_launch_binding_digest
      !== recomputed.launch_binding_digest
  ) fail("automation_runtime_binding_mismatch");

  const bindingDigest = runtimeAuthorityBindingDigest(input);
  if (expectedBindingDigest && bindingDigest !== expectedBindingDigest) {
    fail("runtime_authority_binding_drift");
  }
  receipt.runtime_preflight = {
    status: "PASS",
    exact_receipt_match: true,
    manifest_digest: recomputed.manifest_digest,
    evidence_digest: recomputed.evidence_digest,
    launch_binding_digest: recomputed.launch_binding_digest,
    forbidden_union_digest: recomputed.forbidden_union_digest,
    reviewed_receipt_digest: sha256(canonicalize(reviewed)),
    binding_digest: bindingDigest,
    lease_policy: {
      ...recomputed.lease_policy,
    },
    rechecks: {
      ...receipt.runtime_preflight.rechecks,
      [checkpoint]: true,
    },
    hold_reasons: [],
  };
  receipt.automation_binding = {
    candidate_sha256: binding.candidate_sha256,
    candidate_status: binding.candidate_status,
    matched: true,
  };
  return { recomputed, bindingDigest };
}

function validateInput(input, receipt, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input_object_required");
  }
  if (input.schema_version === RUNNER_V3_INPUT_SCHEMA) {
    hold(receipt, "runner_v3_explicit_hold");
    return null;
  }
  assertExactRunnerShape(input);
  if (input.schema_version !== RUNNER_INPUT_SCHEMA) fail("input_schema_mismatch");
  if (input.execution_mode !== "isolated") fail("execution_mode_must_be_isolated");

  const recordedAt = normalizeIso(input.recorded_at, "recorded_at_invalid");
  const worker = deriveWorkerIdentity(input.runtime);
  if (!worker.ok) {
    hold(receipt, worker.reason);
    return null;
  }
  receipt.worker_identity = worker.worker;

  const source = input.source;
  if (source.classification !== "public") fail("source_must_be_public");
  safeToken(source.repo, "source_repo_invalid");
  safeToken(source.source_lane, "source_lane_invalid");
  safeRef(source.ref, "source_ref_invalid");
  if (!SHA_RE.test(source.seed || "")) fail("source_seed_invalid");
  if (!SHA_RE.test(source.target || "")) fail("source_target_invalid");

  const cursor = input.cursor;
  if (
    cursor.repo !== source.repo
    || cursor.ref !== source.ref
    || cursor.source_lane !== source.source_lane
    || cursor.last_successful_source_commit !== source.seed
  ) fail("cursor_source_tuple_mismatch");
  if (!DIGEST_RE.test(cursor.expected_revision || "")) {
    fail("cursor_expected_revision_invalid");
  }
  if (
    !Number.isSafeInteger(cursor.expected_sequence)
    || cursor.expected_sequence < 0
  ) fail("cursor_expected_sequence_invalid");
  safeLogicalPath(cursor.logical_path, "cursor_logical_path_invalid");
  if (
    cursor.logical_path === "_workmeta/system/bindings"
    || cursor.logical_path.startsWith("_workmeta/system/bindings/")
  ) fail("cursor_workmeta_binding_path_forbidden");
  if (cursor.logical_path !== cursorLogicalPath(source)) {
    fail("cursor_logical_owner_path_mismatch");
  }

  const ledgerWriter = input.ledger_writer;
  validateWriter(ledgerWriter, "ledger_writer");
  safeLogicalPath(
    ledgerWriter.ledger_logical_path,
    "ledger_logical_path_invalid",
  );
  safeMetadata(
    ledgerWriter.output_commit_message,
    "ledger_writer_commit_message_invalid",
    200,
  );

  const cursorWriter = input.cursor_writer;
  validateWriter(cursorWriter, "cursor_writer");
  safeMetadata(
    cursorWriter.cursor_commit_message,
    "cursor_writer_commit_message_invalid",
    200,
  );
  if (ledgerWriter.binding_id === cursorWriter.binding_id) {
    fail("writer_bindings_must_be_distinct");
  }

  const lease = input.lease;
  safeMetadata(lease.owner_token, "lease_owner_token_invalid", 160);
  safeMetadata(lease.host_identity, "lease_host_identity_invalid", 160);
  if (!Number.isSafeInteger(lease.pid) || lease.pid < 1) fail("lease_pid_invalid");
  if (!Number.isSafeInteger(lease.writer_epoch) || lease.writer_epoch < 1) {
    fail("lease_writer_epoch_invalid");
  }
  if (lease.stale_recovery_policy !== STALE_RECOVERY_POLICY) {
    fail("lease_stale_recovery_policy_invalid");
  }
  if (typeof lease.owner_allows_stale_recovery !== "boolean") {
    fail("lease_stale_recovery_authority_invalid");
  }

  let runtimeAuthority;
  try {
    runtimeAuthority = revalidateRuntimeAuthority(
      input,
      options,
      receipt,
      "initial",
    );
  } catch (error) {
    hold(receipt, error?.code || "runtime_preflight_failed");
    return null;
  }
  const runtimePreflight = runtimeAuthority.recomputed;
  try {
    assertOneShotLeaseBasis(input);
  } catch (error) {
    hold(receipt, error?.code || "one_shot_lease_basis_mismatch");
    return null;
  }
  if (options.cliRuntimeBinding) {
    const binding = options.cliRuntimeBinding;
    const roots = input.runtime_preflight.input.roots;
    if (
      comparablePath(binding.runtimeRoot) !== comparablePath(roots.runner)
      || comparablePath(binding.configRoot) !== comparablePath(roots.config)
      || comparablePath(binding.inputPath)
        !== comparablePath(input.runtime_preflight.input.launch.input_path)
      || binding.manifestDigest !== runtimePreflight.manifest_digest
      || binding.evidenceDigest !== runtimePreflight.evidence_digest
      || binding.launchBindingDigest !== runtimePreflight.launch_binding_digest
      || runtimeLaunchBindingDigest({
        runner_root: binding.runtimeRoot,
        config_root: binding.configRoot,
        input_path: binding.inputPath,
      }) !== runtimePreflight.launch_binding_digest
    ) {
      hold(receipt, "runtime_cli_binding_mismatch");
      return null;
    }
  }

  const sourceRoot = exactRealpath(
    source.snapshot_path,
    "source_snapshot_realpath_invalid",
  );
  const ledgerWriterRoot = exactRealpath(
    ledgerWriter.clone_path,
    "ledger_writer_clone_realpath_invalid",
  );
  const cursorWriterRoot = exactRealpath(
    cursorWriter.clone_path,
    "cursor_writer_clone_realpath_invalid",
  );
  const ledgerTransport = buildTransport(
    ledgerWriterRoot,
    ledgerWriter,
    options,
  );
  const cursorTransport = buildTransport(
    cursorWriterRoot,
    cursorWriter,
    options,
  );
  const ledgerRemoteRoot = ledgerTransport.remoteRoot;
  const cursorRemoteRoot = cursorTransport.remoteRoot;
  const isolation = validateIsolation(
    input,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerRemoteRoot,
    cursorRemoteRoot,
  );
  assertRuntimePreflightBinding(
    input,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerRemoteRoot,
    cursorRemoteRoot,
    isolation,
  );
  validateAllowlists(
    input,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
  );

  receipt.source = {
    classification: source.classification,
    repo: source.repo,
    ref: source.ref,
    source_lane: source.source_lane,
    seed: source.seed,
    target: source.target,
  };
  receipt.cursor_update.before = cursor.last_successful_source_commit;
  receipt.cursor_update.after = cursor.last_successful_source_commit;
  receipt.cursor_update.expected_revision = cursor.expected_revision;
  receipt.cursor_update.sequence_before = cursor.expected_sequence;
  receipt.writer_binding = {
    ledger: {
      classification: ledgerWriter.classification,
      ...ledgerTransport.adapter.receiptEvidence(),
    },
    cursor: {
      classification: cursorWriter.classification,
      ...cursorTransport.adapter.receiptEvidence(),
    },
  };
  receipt.safety.first_live_source_public_only = true;
  return {
    recordedAt,
    worker: worker.worker,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerRemoteRoot,
    cursorRemoteRoot,
    ledgerTransport: ledgerTransport.adapter,
    cursorTransport: cursorTransport.adapter,
    isolation,
    runtimeAuthorityBindingDigest: runtimeAuthority.bindingDigest,
  };
}

function sourceSnapshotEvidence(sourceRoot, source) {
  const bare = isBare(sourceRoot);
  if (!bare) {
    const status = writerWorktreeState(sourceRoot);
    if (status !== "") fail("source_snapshot_not_clean");
  }
  const seed = resolveCommit(sourceRoot, source.seed, "source_seed_not_commit");
  const target = resolveCommit(sourceRoot, source.target, "source_target_not_commit");
  const refTip = resolveRef(sourceRoot, source.ref, "source_ref_not_commit");
  if (refTip !== target) fail("source_snapshot_ref_target_mismatch");
  if (!isAncestor(sourceRoot, seed, target)) fail("source_seed_not_ancestor");
  const tree = git(
    sourceRoot,
    ["rev-parse", "--verify", `${target}^{tree}`],
    "source_target_tree_invalid",
  ).trim();
  if (!SHA_RE.test(tree)) fail("source_target_tree_invalid");
  return { bare, seed, target, tree, clean: true };
}

function sourceSnapshotUnchanged(sourceRoot, source, evidence) {
  const current = sourceSnapshotEvidence(sourceRoot, source);
  return current.bare === evidence.bare
    && current.seed === evidence.seed
    && current.target === evidence.target
    && current.tree === evidence.tree;
}

function finalSourceSnapshotUnchanged(sourceRoot, source, evidence) {
  try {
    return sourceSnapshotUnchanged(sourceRoot, source, evidence);
  } catch {
    return false;
  }
}

function writerPreflight(writerRoot) {
  if (isBare(writerRoot)) fail("writer_clone_must_have_worktree");
  const top = exactRealpath(
    git(writerRoot, ["rev-parse", "--show-toplevel"], "writer_top_level_invalid").trim(),
    "writer_top_level_invalid",
  );
  if (comparablePath(top) !== comparablePath(writerRoot)) fail("writer_top_level_mismatch");
  const worktree = writerWorktreeState(writerRoot);
  if (worktree !== "") fail("writer_worktree_not_clean");
  return worktree;
}

function makeSweepInput(input, ledgerRecords) {
  const source = input.source;
  return {
    schema_version: SWEEP_INPUT_SCHEMA,
    feature_state: "OFF",
    recorded_at: input.recorded_at,
    runtime: input.runtime,
    source: {
      classification: "public",
      repo: source.repo,
      repo_path: source.snapshot_path,
      ref: source.ref,
      source_lane: source.source_lane,
      baseline: source.seed,
      candidate_target: source.target,
    },
    cursor: {
      repo: source.repo,
      ref: source.ref,
      source_lane: source.source_lane,
      last_successful_source_commit: source.seed,
    },
    source_allowlist: [{
      classification: "public",
      repo: source.repo,
      repo_path: source.snapshot_path,
      ref: source.ref,
      source_lane: source.source_lane,
    }],
    ledger_records: ledgerRecords,
  };
}

function applyPlanToReceipt(receipt, plan) {
  receipt.records.missing = plan.counts.missing;
  receipt.records.duplicate = plan.counts.duplicate;
  receipt.records.full_record_digests = plan.digests;
  receipt.self_loop_exclusions = plan.self_loop_exclusions;
}

function injectedHold(options, point, receipt) {
  if (options.faultAt === point) {
    return hold(receipt, `injected_fault:${point}`);
  }
  return null;
}

function runtimeAuthorityCheckpoint(
  input,
  options,
  receipt,
  validated,
  checkpoint,
) {
  try {
    revalidateRuntimeAuthority(
      input,
      options,
      receipt,
      checkpoint,
      validated.runtimeAuthorityBindingDigest,
    );
    return true;
  } catch (error) {
    hold(receipt, error?.code || `runtime_preflight_drift:${checkpoint}`);
    if (
      receipt.ledger_output.remote_contains_commit
      && receipt.cursor_update.state !== "VERIFIED_ADVANCED"
    ) {
      receipt.reconciliation = {
        required: true,
        reason: `authority_drift_after_ledger:${checkpoint}`,
        cursor_unchanged: true,
      };
    }
    return false;
  }
}

function holdForPostLedgerReconciliation(
  receipt,
  reason,
  reconciliationReason,
  postPushReason = "post_cursor_push_stage_unverified",
) {
  if (
    receipt.ledger_output.remote_contains_commit
    && receipt.cursor_update.state !== "VERIFIED_ADVANCED"
  ) {
    const cursorPushAttempted =
      receipt.publication_order.includes("cursor_push_attempt");
    receipt.reconciliation = {
      required: true,
      reason: cursorPushAttempted ? postPushReason : reconciliationReason,
      cursor_unchanged: cursorPushAttempted ? null : true,
    };
  }
  return hold(receipt, reason);
}

function holdForSourceDrift(receipt, reason, checkpoint) {
  return holdForPostLedgerReconciliation(
    receipt,
    reason,
    `source_snapshot_drift_after_ledger:${checkpoint}`,
  );
}

/**
 * Run one isolated recovery transaction.
 *
 * `options.faultAt`, lifecycle hooks, and `options.transportExecutors` are
 * programmatic-test/runtime injections and are never accepted by the CLI.
 */
function exactCursorState(value) {
  return exactKeys(value, [
    "repo",
    "ref",
    "source_lane",
    "last_successful_source_commit",
    "sequence",
    "writer_epoch",
  ])
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 0
    && Number.isSafeInteger(value.writer_epoch)
    && value.writer_epoch >= 0;
}

function assertCursorFence(cursorState, input, { allowAdvanced = false } = {}) {
  const { source, cursor, lease } = input;
  const leasePolicy = input.runtime_preflight.input.evidence.lease_policy;
  if (!exactCursorState(cursorState)) fail("cursor_state_contract_invalid");
  if (
    cursorState.repo !== source.repo
    || cursorState.ref !== source.ref
    || cursorState.source_lane !== source.source_lane
  ) fail("cursor_remote_source_tuple_mismatch");
  if (allowAdvanced && cursorState.last_successful_source_commit === source.target) {
    if (
      cursorState.sequence !== cursor.expected_sequence + 1
      || cursorState.writer_epoch !== leasePolicy.initial_writer_epoch
    ) fail("cursor_sequence_mismatch");
    return "advanced";
  }
  if (cursorState.last_successful_source_commit !== source.seed) {
    fail("cursor_remote_source_tuple_mismatch");
  }
  if (cursorState.sequence !== cursor.expected_sequence) {
    fail("cursor_sequence_mismatch");
  }
  if (cursorRevision(cursorState) !== cursor.expected_revision) {
    fail("cursor_compare_and_swap_revision_mismatch");
  }
  if (cursorState.writer_epoch !== leasePolicy.restored_writer_epoch) {
    fail("cursor_restored_writer_epoch_mismatch");
  }
  if (cursorState.writer_epoch >= lease.writer_epoch) fail("writer_epoch_stale");
  return "baseline";
}

function currentCursorState(cursorWriterRoot, cursorTransport, cursor) {
  const tip = cursorTransport.fetchFreshTip();
  const state = parseJsonObject(
    readBlob(cursorWriterRoot, tip, cursor.logical_path),
    "cursor_json_invalid",
  );
  return { tip, state };
}

function runTransaction(input, options, receipt, validated, leaseHandle) {
  const {
    recordedAt,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerTransport,
    cursorTransport,
  } = validated;
  const {
    source,
    cursor,
    ledger_writer: ledgerWriter,
    cursor_writer: cursorWriter,
    lease,
  } = input;
  let sourceEvidence;
  let initialLedgerWriterState;
  let initialCursorWriterState;
  try {
    sourceEvidence = sourceSnapshotEvidence(sourceRoot, source);
    receipt.source_snapshot.bare = sourceEvidence.bare;
    receipt.source_snapshot.target_tree_digest = sha256(sourceEvidence.tree);
    initialLedgerWriterState = writerPreflight(ledgerWriterRoot);
    initialCursorWriterState = writerPreflight(cursorWriterRoot);
  } catch (error) {
    return hold(receipt, error?.code || "preflight_failed");
  }

  let ledgerTip;
  let cursorTip;
  let remoteCursor;
  let ledgerText;
  let ledgerRecords;
  try {
    ledgerTip = ledgerTransport.fetchFreshTip();
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorTransport,
      cursor,
    ));
    receipt.writer_binding.ledger = {
      classification: ledgerWriter.classification,
      ...ledgerTransport.receiptEvidence(),
    };
    receipt.writer_binding.cursor = {
      classification: cursorWriter.classification,
      ...cursorTransport.receiptEvidence(),
    };
    ledgerText = readBlob(
      ledgerWriterRoot,
      ledgerTip,
      ledgerWriter.ledger_logical_path,
      { optional: true },
    );
    ledgerRecords = parseLedger(ledgerText);
    assertNoIdentityConflicts(ledgerRecords);
  } catch (error) {
    return hold(receipt, error?.code || "writer_state_read_failed");
  }

  let cursorDisposition;
  try {
    cursorDisposition = assertCursorFence(remoteCursor, input, {
      allowAdvanced: true,
    });
  } catch (error) {
    return hold(receipt, error?.code || "cursor_fence_failed");
  }
  const remoteCursorRevision = cursorRevision(remoteCursor);
  const alreadyAdvanced = cursorDisposition === "advanced";
  receipt.cursor_update.writer_epoch_before = remoteCursor.writer_epoch;
  receipt.cursor_update.sequence_before = remoteCursor.sequence;
  if (alreadyAdvanced) {
    receipt.cursor_update.after = source.target;
    receipt.cursor_update.state = "VERIFIED_ADVANCED";
  } else {
    receipt.cursor_update.state = "VERIFIED_NOT_ADVANCED";
  }

  let plan;
  try {
    plan = planCursorSweep(makeSweepInput(input, ledgerRecords));
  } catch {
    return hold(receipt, "sweep_planner_failed");
  }
  applyPlanToReceipt(receipt, plan);
  if (plan.status === "HOLD") {
    for (const reason of plan.hold_reasons) hold(receipt, reason);
    return receipt;
  }

  if (alreadyAdvanced) {
    if (plan.counts.missing !== 0) {
      return hold(receipt, "cursor_advanced_with_missing_records");
    }
    try {
      receipt.source_snapshot.immutable_recheck =
        sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence);
      if (!receipt.source_snapshot.immutable_recheck) {
        return hold(receipt, "source_snapshot_changed");
      }
      if (
        writerWorktreeState(ledgerWriterRoot) !== initialLedgerWriterState
        || writerWorktreeState(cursorWriterRoot) !== initialCursorWriterState
      ) return hold(receipt, "writer_worktree_changed");
    } catch {
      return hold(receipt, "final_recheck_failed");
    }
    receipt.status = "ALREADY_ADVANCED";
    receipt.cursor_update.resulting_revision = remoteCursorRevision;
    receipt.cursor_update.sequence_after = remoteCursor.sequence;
    receipt.cursor_update.writer_epoch_after = remoteCursor.writer_epoch;
    receipt.cursor_update.cas_success = true;
    receipt.cursor_update.remote_contains_commit = true;
    receipt.reconciliation = {
      required: false,
      reason: null,
      cursor_unchanged: true,
    };
    return receipt;
  }

  let outputCommit = ledgerTip;
  if (plan.records_to_append.length > 0) {
    try {
      const combinedLedger = appendLedger(ledgerText, plan.records_to_append);
      const digestById = assertNoIdentityConflicts(parseLedger(combinedLedger));
      for (const record of plan.records_to_append) {
        if (digestById.get(record.id) !== canonicalRecordDigest(record)) {
          fail("ledger_append_digest_verification_failed");
        }
      }
      outputCommit = commitWithBlob({
        writerRoot: ledgerWriterRoot,
        baseCommit: ledgerTip,
        logicalPath: ledgerWriter.ledger_logical_path,
        content: combinedLedger,
        author: ledgerWriter.commit_author,
        recordedAt,
        message: ledgerWriter.output_commit_message,
      });
      receipt.ledger_output.commit = outputCommit;
      receipt.ledger_output.created = true;
      receipt.safety.designated_writer_commits += 1;
      if (typeof options.beforeLedgerPush === "function") {
        options.beforeLedgerPush();
      }
      assertLease(leaseHandle);
      const cursorFence = currentCursorState(
        cursorWriterRoot,
        cursorTransport,
        cursor,
      ).state;
      assertCursorFence(cursorFence, input);
      assertLease(leaseHandle);
      if (!finalSourceSnapshotUnchanged(
        sourceRoot,
        source,
        sourceEvidence,
      )) {
        return holdForSourceDrift(
          receipt,
          "source_snapshot_changed_before_ledger_push",
          "before_ledger_push",
        );
      }
      if (!runtimeAuthorityCheckpoint(
        input,
        options,
        receipt,
        validated,
        "before_ledger_push",
      )) return receipt;
      assertLease(leaseHandle);
      receipt.publication_order.push("ledger_push_attempt");
      const ledgerPush = ledgerTransport.pushCommit(outputCommit);
      receipt.ledger_output.push_success = ledgerPush === "PUSHED";
      if (ledgerPush === "UNKNOWN_AFTER_PUSH") {
        return hold(receipt, "ledger_output_unknown_after_push");
      }
      if (ledgerPush !== "PUSHED") {
        return hold(receipt, "ledger_output_non_fast_forward_push_failed");
      }
      receipt.safety.designated_remote_pushes += 1;
      const inclusion = ledgerTransport.verifyInclusion(outputCommit);
      receipt.ledger_output.remote_contains_commit =
        inclusion.status === "INCLUDED"
        && options.faultAt !== "ledger_inclusion_failure";
      if (!receipt.ledger_output.remote_contains_commit) {
        return hold(
          receipt,
          inclusion.status === "UNKNOWN_AFTER_PUSH"
            ? "ledger_output_unknown_after_push"
            : "ledger_output_remote_inclusion_failed",
        );
      }
      receipt.publication_order.push("ledger_remote_inclusion_verified");
      ledgerTip = inclusion.tip;
      receipt.records.appended = plan.records_to_append.length;
    } catch (error) {
      return hold(receipt, error?.code || "ledger_output_failed");
    }
  } else {
    receipt.ledger_output.commit = ledgerTip;
    receipt.ledger_output.push_success = true;
    receipt.ledger_output.remote_contains_commit = true;
    receipt.publication_order.push("ledger_already_complete");
  }

  const afterOutputFault = injectedHold(options, "after_output_push", receipt);
  if (afterOutputFault) return afterOutputFault;

  let cursorStage = "initial_cursor_cas";
  try {
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorTransport,
      cursor,
    ));
    assertCursorFence(remoteCursor, input);
    assertLease(leaseHandle);
    if (typeof options.beforePostLedgerCursorSourceCheck === "function") {
      options.beforePostLedgerCursorSourceCheck();
    }
    if (!finalSourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return holdForSourceDrift(
        receipt,
        "source_snapshot_changed_before_cursor_cas",
        "before_cursor_cas",
      );
    }
    cursorStage = "before_cursor_commit";
    if (typeof options.beforeCursorCommit === "function") {
      options.beforeCursorCommit();
    }
    assertLease(leaseHandle);
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorTransport,
      cursor,
    ));
    assertCursorFence(remoteCursor, input);
    if (!finalSourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return holdForSourceDrift(
        receipt,
        "source_snapshot_changed_before_cursor_commit",
        "before_cursor_commit",
      );
    }
    if (!runtimeAuthorityCheckpoint(
      input,
      options,
      receipt,
      validated,
      "before_cursor_commit",
    )) return receipt;
    assertLease(leaseHandle);

    const advancedCursor = {
      repo: source.repo,
      ref: source.ref,
      source_lane: source.source_lane,
      last_successful_source_commit: source.target,
      sequence: remoteCursor.sequence + 1,
      writer_epoch: lease.writer_epoch,
    };
    const cursorCommit = commitWithBlob({
      writerRoot: cursorWriterRoot,
      baseCommit: cursorTip,
      logicalPath: cursor.logical_path,
      content: `${JSON.stringify(advancedCursor, null, 2)}\n`,
      author: cursorWriter.commit_author,
      recordedAt,
      message: cursorWriter.cursor_commit_message,
    });
    receipt.cursor_update.commit = cursorCommit;
    receipt.cursor_update.created = true;
    receipt.cursor_update.resulting_revision = cursorRevision(advancedCursor);
    receipt.cursor_update.sequence_after = advancedCursor.sequence;
    receipt.cursor_update.writer_epoch_after = advancedCursor.writer_epoch;
    receipt.cursor_update.cas_success = true;
    receipt.safety.designated_writer_commits += 1;
    receipt.publication_order.push("cursor_commit_created");

    const afterCursorCommitFault = injectedHold(
      options,
      "after_cursor_commit",
      receipt,
    );
    if (afterCursorCommitFault) return afterCursorCommitFault;
    if (!finalSourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return holdForSourceDrift(
        receipt,
        "source_snapshot_changed_before_cursor_push",
        "pre_hook_before_cursor_push",
      );
    }
    cursorStage = "before_cursor_push";
    if (typeof options.beforeCursorPush === "function") {
      options.beforeCursorPush();
    }
    assertLease(leaseHandle);
    const cursorBeforePush = currentCursorState(
      cursorWriterRoot,
      cursorTransport,
      cursor,
    );
    assertCursorFence(cursorBeforePush.state, input);
    if (cursorBeforePush.tip !== cursorTip) fail("cursor_non_fast_forward_race");
    assertLease(leaseHandle);
    if (!finalSourceSnapshotUnchanged(
      sourceRoot,
      source,
      sourceEvidence,
    )) {
      return holdForSourceDrift(
        receipt,
        "source_snapshot_changed_before_cursor_push",
        "before_cursor_push",
      );
    }
    if (!runtimeAuthorityCheckpoint(
      input,
      options,
      receipt,
      validated,
      "before_cursor_push",
    )) return receipt;
    assertLease(leaseHandle);

    receipt.publication_order.push("cursor_push_attempt");
    const cursorPush = cursorTransport.pushCommit(cursorCommit);
    receipt.cursor_update.push_success = cursorPush === "PUSHED";
    if (cursorPush !== "PUSHED") {
      receipt.cursor_update.after = null;
      receipt.cursor_update.state = cursorPush === "UNKNOWN_AFTER_PUSH"
        ? "UNKNOWN_AFTER_PUSH"
        : "UNKNOWN_AFTER_PUSH_ATTEMPT";
      return holdForPostLedgerReconciliation(
        receipt,
        cursorPush === "UNKNOWN_AFTER_PUSH"
          ? "cursor_push_outcome_unknown"
          : "cursor_non_fast_forward_push_failed",
        "post_ledger_cursor_stage_failure:before_cursor_push",
        "post_cursor_push_outcome_unverified",
      );
    }
    receipt.safety.designated_remote_pushes += 1;
    receipt.cursor_update.after = null;
    receipt.cursor_update.state = "UNKNOWN_AFTER_PUSH";

    if (options.faultAt === "after_cursor_push") {
      throw new CursorRunnerInterruption("after_cursor_push");
    }

    const cursorInclusion = cursorTransport.verifyInclusion(cursorCommit);
    receipt.cursor_update.remote_contains_commit =
      cursorInclusion.status === "INCLUDED"
      && options.faultAt !== "cursor_inclusion_failure";
    if (!receipt.cursor_update.remote_contains_commit) {
      return holdForPostLedgerReconciliation(
        receipt,
        cursorInclusion.status === "UNKNOWN_AFTER_PUSH"
          ? "cursor_push_outcome_unknown"
          : "cursor_remote_inclusion_failed",
        "post_ledger_cursor_stage_failure:before_cursor_push",
        "post_cursor_push_inclusion_unverified",
      );
    }
    const persistedCursor = parseJsonObject(
      readBlob(cursorWriterRoot, cursorInclusion.tip, cursor.logical_path),
      "cursor_json_invalid",
    );
    if (
      !exactCursorState(persistedCursor)
      || persistedCursor.last_successful_source_commit !== source.target
      || persistedCursor.sequence !== advancedCursor.sequence
      || persistedCursor.writer_epoch !== lease.writer_epoch
      || cursorRevision(persistedCursor) !== receipt.cursor_update.resulting_revision
    ) {
      return holdForPostLedgerReconciliation(
        receipt,
        "cursor_remote_content_verification_failed",
        "post_ledger_cursor_stage_failure:before_cursor_push",
        "post_cursor_push_content_unverified",
      );
    }
    receipt.publication_order.push("cursor_remote_inclusion_verified");
    receipt.cursor_update.after = source.target;
    receipt.cursor_update.state = "VERIFIED_ADVANCED";
  } catch (error) {
    if (error instanceof CursorRunnerInterruption) throw error;
    return holdForPostLedgerReconciliation(
      receipt,
      error?.code || "cursor_update_failed",
      `post_ledger_cursor_stage_failure:${cursorStage}`,
    );
  }

  try {
    receipt.source_snapshot.immutable_recheck =
      sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence);
    if (!receipt.source_snapshot.immutable_recheck) {
      return hold(receipt, "source_snapshot_changed");
    }
    if (
      writerWorktreeState(ledgerWriterRoot) !== initialLedgerWriterState
      || writerWorktreeState(cursorWriterRoot) !== initialCursorWriterState
    ) return hold(receipt, "writer_worktree_changed");
  } catch {
    return hold(receipt, "final_recheck_failed");
  }

  receipt.status = "SUCCESS";
  receipt.reconciliation = {
    required: false,
    reason: null,
    cursor_unchanged: false,
  };
  return receipt;
}

export function runCursorRunner(input, options = {}) {
  const receipt = baseReceipt();
  let validated;
  let leaseHandle;
  try {
    validated = validateInput(input, receipt, options);
    if (!validated) return receipt;
    leaseHandle = acquireLease(
      input.lease,
      validated.recordedAt,
      options,
      receipt,
    );
    return runTransaction(input, options, receipt, validated, leaseHandle);
  } catch (error) {
    if (error instanceof CursorRunnerInterruption) throw error;
    return hold(receipt, error?.code || "input_boundary_invalid");
  } finally {
    releaseLease(leaseHandle, receipt);
  }
}

function parseCli(argv) {
  const values = {
    inputPath: null,
    runtimeRoot: null,
    configRoot: null,
    manifestDigest: null,
    evidenceDigest: null,
    launchBindingDigest: null,
  };
  const flags = new Map([
    ["--input", "inputPath"],
    ["--runtime-root", "runtimeRoot"],
    ["--config-root", "configRoot"],
    ["--runtime-manifest-digest", "manifestDigest"],
    ["--runtime-evidence-digest", "evidenceDigest"],
    ["--runtime-launch-binding-digest", "launchBindingDigest"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    if (key) {
      if (!argv[index + 1] || values[key] !== null) fail("cli_binding_invalid");
      values[key] = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--help") {
      return { help: true };
    } else {
      fail("unknown_argument");
    }
  }
  if (!values.inputPath) fail("input_path_required");
  if (!values.runtimeRoot) fail("runtime_root_required");
  if (!values.configRoot) fail("config_root_required");
  if (!DIGEST_RE.test(values.manifestDigest || "")) {
    fail("runtime_manifest_digest_required");
  }
  if (!DIGEST_RE.test(values.evidenceDigest || "")) {
    fail("runtime_evidence_digest_required");
  }
  if (!DIGEST_RE.test(values.launchBindingDigest || "")) {
    fail("runtime_launch_binding_digest_required");
  }
  return values;
}

function exactCliInputFile(value, configRoot) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail("cli_input_realpath_invalid");
  }
  let physical;
  let stat;
  try {
    physical = realpathSync.native(resolve(value));
    stat = lstatSync(resolve(value));
  } catch {
    fail("cli_input_realpath_invalid");
  }
  if (
    comparablePath(physical) !== comparablePath(value)
    || !stat.isFile()
    || stat.isSymbolicLink()
    || comparablePath(physical) === comparablePath(configRoot)
    || !pathContains(configRoot, physical)
  ) fail("cli_input_realpath_invalid");
  return physical;
}

function cliRuntimeBinding(args) {
  const runtimeRoot = exactRealpath(
    args.runtimeRoot,
    "cli_runtime_root_invalid",
  );
  const configRoot = exactRealpath(
    args.configRoot,
    "cli_config_root_invalid",
  );
  const inputPath = exactCliInputFile(args.inputPath, configRoot);
  return {
    runtimeRoot,
    configRoot,
    inputPath,
    manifestDigest: args.manifestDigest,
    evidenceDigest: args.evidenceDigest,
    launchBindingDigest: args.launchBindingDigest,
  };
}

function publicCliError(error) {
  const allowed = new Set([
    "input_json_invalid",
    "input_path_required",
    "input_read_failed",
    "runtime_root_required",
    "config_root_required",
    "runtime_manifest_digest_required",
    "runtime_evidence_digest_required",
    "runtime_launch_binding_digest_required",
    "cli_binding_invalid",
    "cli_runtime_root_invalid",
    "cli_config_root_invalid",
    "cli_input_realpath_invalid",
    "unknown_argument",
  ]);
  return allowed.has(error?.code) ? error.code : "internal_runner_error";
}

function cli() {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        "Usage: node five_field_cursor_runner.mjs"
        + " --runtime-root <runner-dir>"
        + " --config-root <config-dir>"
        + " --runtime-manifest-digest <sha256:digest>"
        + " --runtime-evidence-digest <sha256:digest>"
        + " --runtime-launch-binding-digest <sha256:digest>"
        + " --input <json-file>\n"
        + "Runs one injected, isolated public-source recovery transaction.\n",
      );
      return;
    }
    const runtimeBinding = cliRuntimeBinding(args);
    let text;
    try {
      text = readFileSync(runtimeBinding.inputPath, "utf8");
    } catch {
      fail("input_read_failed");
    }
    let input;
    try {
      input = JSON.parse(text.replace(/^\uFEFF/u, ""));
    } catch {
      fail("input_json_invalid");
    }
    const receipt = runCursorRunner(input, {
      cliRuntimeBinding: runtimeBinding,
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    process.exitCode = receipt.status === "HOLD" ? 2 : 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: publicCliError(error),
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  cli();
}
