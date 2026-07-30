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

export const RUNNER_INPUT_SCHEMA = "soulforge.five_field_cursor_runner_input.v2";
export const RUNNER_RECEIPT_SCHEMA = "soulforge.five_field_cursor_runner_receipt.v2";

const SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
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
const CURSOR_ROOT =
  "guild_hall/state/operations/ai_work_result_recovery/v1/cursors";
const REQUIRED_FORBIDDEN_ROOT_KINDS = new Set([
  "active_public_repo",
  "active_workmeta",
  "codex_worktree",
  "orca_worktree",
  "installed_automation_control",
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
  if (key && FORBIDDEN_INPUT_KEY_RE.test(key)) fail("input_contract_invalid");
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
    "path",
    "remote_url",
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
    "remote_url",
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
    "remote_url",
    "ref",
    "commit_author",
    "cursor_commit_message",
  ])) fail("cursor_writer_contract_invalid");
  if (
    !exactKeys(input.ledger_writer.commit_author, ["name", "email"])
    || !exactKeys(input.cursor_writer.commit_author, ["name", "email"])
  ) fail("input_contract_invalid");
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
  ])) fail("input_contract_invalid");
  if (!exactKeys(input.isolation, ["runtime_root", "forbidden_roots"])) {
    fail("input_contract_invalid");
  }
  if (
    !Array.isArray(input.isolation.forbidden_roots)
    || !input.isolation.forbidden_roots.every((row) =>
      exactKeys(row, ["kind", "path"]))
  ) fail("input_contract_invalid");
  if (
    !Array.isArray(input.source_allowlist)
    || !input.source_allowlist.every((row) => exactKeys(row, [
      "classification",
      "repo",
      "ref",
      "source_lane",
      "snapshot_path",
    ]))
  ) fail("input_contract_invalid");
  if (
    !Array.isArray(input.ledger_writer_allowlist)
    || !input.ledger_writer_allowlist.every((row) => exactKeys(row, [
      "binding_id",
      "classification",
      "clone_path",
      "remote",
      "remote_url",
      "ref",
      "ledger_logical_path",
    ]))
  ) fail("input_contract_invalid");
  if (
    !Array.isArray(input.cursor_writer_allowlist)
    || !input.cursor_writer_allowlist.every((row) => exactKeys(row, [
      "binding_id",
      "classification",
      "clone_path",
      "remote",
      "remote_url",
      "ref",
      "cursor_logical_path",
    ]))
  ) fail("input_contract_invalid");
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
  ];
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

function gitResult(repoPath, args, options = {}) {
  return spawnSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    input: options.input,
    env: options.env ? { ...process.env, ...options.env } : process.env,
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

function localRemoteRealpath(value, writerRoot) {
  if (typeof value !== "string" || !value) fail("writer_remote_url_required");
  if (SECRET_SENTINEL_RE.test(value) || /:\/\/[^/\s]+@/u.test(value)) {
    fail("writer_remote_secret_sentinel");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) return null;
  const candidate = isAbsolute(value) ? value : resolve(writerRoot, value);
  return exactRealpath(candidate, "writer_remote_realpath_invalid");
}

function remoteUrlMatches(injected, configured, writerRoot) {
  const injectedLocal = localRemoteRealpath(injected, writerRoot);
  const configuredLocal = localRemoteRealpath(configured, writerRoot);
  if (injectedLocal || configuredLocal) {
    return injectedLocal !== null
      && configuredLocal !== null
      && comparablePath(injectedLocal) === comparablePath(configuredLocal);
  }
  return injected === configured;
}

function fetchRemoteTip(writerRoot, remote, ref) {
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

function pushCommit(writerRoot, remote, ref, commit) {
  const result = gitResult(
    writerRoot,
    ["push", "--porcelain", remote, `${commit}:${ref}`],
  );
  return result.status === 0;
}

function remoteContainsCommit(writerRoot, remote, ref, commit) {
  const tip = fetchRemoteTip(writerRoot, remote, ref);
  return {
    tip,
    contains: isAncestor(writerRoot, commit, tip),
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
        binding_id: null,
        classification: null,
      },
      cursor: {
        binding_id: null,
        classification: null,
      },
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
    && row.remote_url === ledgerWriter.remote_url
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
    && row.remote_url === cursorWriter.remote_url
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
  const author = writer.commit_author || {};
  safeMetadata(author.name, `${kind}_author_name_invalid`, 120);
  if (
    typeof author.email !== "string"
    || !EMAIL_RE.test(author.email)
    || ABSOLUTE_PATH_SENTINEL_RE.test(author.email)
    || SECRET_SENTINEL_RE.test(author.email)
  ) fail(`${kind}_author_email_invalid`);
}

function validateInput(input, receipt) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input_object_required");
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
  const ledgerRemoteRoot = localRemoteRealpath(
    ledgerWriter.remote_url,
    ledgerWriterRoot,
  );
  const cursorRemoteRoot = localRemoteRealpath(
    cursorWriter.remote_url,
    cursorWriterRoot,
  );
  if (!ledgerRemoteRoot || !cursorRemoteRoot) {
    fail("writer_remote_must_be_local");
  }
  const configuredLedgerRemote = git(
    ledgerWriterRoot,
    ["remote", "get-url", ledgerWriter.remote],
    "ledger_writer_remote_not_configured",
  ).trim();
  const configuredCursorRemote = git(
    cursorWriterRoot,
    ["remote", "get-url", cursorWriter.remote],
    "cursor_writer_remote_not_configured",
  ).trim();
  const configuredLedgerRemoteRoot = localRemoteRealpath(
    configuredLedgerRemote,
    ledgerWriterRoot,
  );
  const configuredCursorRemoteRoot = localRemoteRealpath(
    configuredCursorRemote,
    cursorWriterRoot,
  );
  if (
    !configuredLedgerRemoteRoot
    || comparablePath(configuredLedgerRemoteRoot)
      !== comparablePath(ledgerRemoteRoot)
  ) fail("ledger_writer_remote_url_mismatch");
  if (
    !configuredCursorRemoteRoot
    || comparablePath(configuredCursorRemoteRoot)
      !== comparablePath(cursorRemoteRoot)
  ) fail("cursor_writer_remote_url_mismatch");
  if (!isBare(ledgerRemoteRoot)) fail("ledger_writer_remote_must_be_bare");
  if (!isBare(cursorRemoteRoot)) fail("cursor_writer_remote_must_be_bare");
  const isolation = validateIsolation(
    input,
    sourceRoot,
    ledgerWriterRoot,
    cursorWriterRoot,
    ledgerRemoteRoot,
    cursorRemoteRoot,
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
      binding_id: ledgerWriter.binding_id,
      classification: ledgerWriter.classification,
    },
    cursor: {
      binding_id: cursorWriter.binding_id,
      classification: cursorWriter.classification,
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
    isolation,
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

function writerPreflight(writerRoot, writer) {
  if (isBare(writerRoot)) fail("writer_clone_must_have_worktree");
  const top = exactRealpath(
    git(writerRoot, ["rev-parse", "--show-toplevel"], "writer_top_level_invalid").trim(),
    "writer_top_level_invalid",
  );
  if (comparablePath(top) !== comparablePath(writerRoot)) fail("writer_top_level_mismatch");
  const worktree = writerWorktreeState(writerRoot);
  if (worktree !== "") fail("writer_worktree_not_clean");
  const configuredUrl = git(
    writerRoot,
    ["remote", "get-url", writer.remote],
    "writer_remote_not_configured",
  ).trim();
  if (!remoteUrlMatches(writer.remote_url, configuredUrl, writerRoot)) {
    fail("writer_remote_url_mismatch");
  }
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

/**
 * Run one isolated recovery transaction.
 *
 * `options.faultAt` and `options.beforeLedgerPush` are
 * programmatic-test-only and are never accepted by the CLI.
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
  if (!exactCursorState(cursorState)) fail("cursor_state_contract_invalid");
  if (
    cursorState.repo !== source.repo
    || cursorState.ref !== source.ref
    || cursorState.source_lane !== source.source_lane
  ) fail("cursor_remote_source_tuple_mismatch");
  if (allowAdvanced && cursorState.last_successful_source_commit === source.target) {
    if (
      cursorState.sequence !== cursor.expected_sequence + 1
      || cursorState.writer_epoch < 1
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
  if (cursorState.writer_epoch >= lease.writer_epoch) fail("writer_epoch_stale");
  return "baseline";
}

function currentCursorState(cursorWriterRoot, cursorWriter, cursor) {
  const tip = fetchRemoteTip(
    cursorWriterRoot,
    cursorWriter.remote,
    cursorWriter.ref,
  );
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
    initialLedgerWriterState = writerPreflight(
      ledgerWriterRoot,
      ledgerWriter,
    );
    initialCursorWriterState = writerPreflight(
      cursorWriterRoot,
      cursorWriter,
    );
  } catch (error) {
    return hold(receipt, error?.code || "preflight_failed");
  }

  let ledgerTip;
  let cursorTip;
  let remoteCursor;
  let ledgerText;
  let ledgerRecords;
  try {
    ledgerTip = fetchRemoteTip(
      ledgerWriterRoot,
      ledgerWriter.remote,
      ledgerWriter.ref,
    );
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorWriter,
      cursor,
    ));
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
        cursorWriter,
        cursor,
      ).state;
      assertCursorFence(cursorFence, input);
      assertLease(leaseHandle);
      receipt.publication_order.push("ledger_push_attempt");
      receipt.ledger_output.push_success = pushCommit(
        ledgerWriterRoot,
        ledgerWriter.remote,
        ledgerWriter.ref,
        outputCommit,
      );
      if (!receipt.ledger_output.push_success) {
        return hold(receipt, "ledger_output_non_fast_forward_push_failed");
      }
      receipt.safety.designated_remote_pushes += 1;
      const inclusion = remoteContainsCommit(
        ledgerWriterRoot,
        ledgerWriter.remote,
        ledgerWriter.ref,
        outputCommit,
      );
      receipt.ledger_output.remote_contains_commit =
        inclusion.contains && options.faultAt !== "ledger_inclusion_failure";
      if (!receipt.ledger_output.remote_contains_commit) {
        return hold(receipt, "ledger_output_remote_inclusion_failed");
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

  try {
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorWriter,
      cursor,
    ));
    assertCursorFence(remoteCursor, input);
    assertLease(leaseHandle);
    if (!sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return hold(receipt, "source_snapshot_changed_before_cursor_cas");
    }
    if (typeof options.beforeCursorCommit === "function") {
      options.beforeCursorCommit();
    }
    assertLease(leaseHandle);
    ({ tip: cursorTip, state: remoteCursor } = currentCursorState(
      cursorWriterRoot,
      cursorWriter,
      cursor,
    ));
    assertCursorFence(remoteCursor, input);

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
    if (!sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return hold(receipt, "source_snapshot_changed_before_cursor_push");
    }
    if (typeof options.beforeCursorPush === "function") {
      options.beforeCursorPush();
    }
    assertLease(leaseHandle);
    const cursorBeforePush = currentCursorState(
      cursorWriterRoot,
      cursorWriter,
      cursor,
    );
    assertCursorFence(cursorBeforePush.state, input);
    if (cursorBeforePush.tip !== cursorTip) fail("cursor_non_fast_forward_race");
    assertLease(leaseHandle);

    receipt.publication_order.push("cursor_push_attempt");
    receipt.cursor_update.push_success = pushCommit(
      cursorWriterRoot,
      cursorWriter.remote,
      cursorWriter.ref,
      cursorCommit,
    );
    if (!receipt.cursor_update.push_success) {
      receipt.cursor_update.after = null;
      receipt.cursor_update.state = "UNKNOWN_AFTER_PUSH_ATTEMPT";
      return hold(receipt, "cursor_non_fast_forward_push_failed");
    }
    receipt.safety.designated_remote_pushes += 1;
    receipt.cursor_update.after = null;
    receipt.cursor_update.state = "UNKNOWN_AFTER_PUSH";

    if (options.faultAt === "after_cursor_push") {
      throw new CursorRunnerInterruption("after_cursor_push");
    }

    const cursorInclusion = remoteContainsCommit(
      cursorWriterRoot,
      cursorWriter.remote,
      cursorWriter.ref,
      cursorCommit,
    );
    receipt.cursor_update.remote_contains_commit =
      cursorInclusion.contains && options.faultAt !== "cursor_inclusion_failure";
    if (!receipt.cursor_update.remote_contains_commit) {
      return hold(receipt, "cursor_remote_inclusion_failed");
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
    ) return hold(receipt, "cursor_remote_content_verification_failed");
    receipt.publication_order.push("cursor_remote_inclusion_verified");
    receipt.cursor_update.after = source.target;
    receipt.cursor_update.state = "VERIFIED_ADVANCED";
  } catch (error) {
    if (error instanceof CursorRunnerInterruption) throw error;
    return hold(receipt, error?.code || "cursor_update_failed");
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
  return receipt;
}

export function runCursorRunner(input, options = {}) {
  const receipt = baseReceipt();
  let validated;
  let leaseHandle;
  try {
    validated = validateInput(input, receipt);
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
  let inputPath = "-";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") {
      if (!argv[index + 1]) fail("input_path_required");
      inputPath = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--help") {
      return { help: true };
    } else {
      fail("unknown_argument");
    }
  }
  return { inputPath };
}

function publicCliError(error) {
  const allowed = new Set([
    "input_json_invalid",
    "input_path_required",
    "input_read_failed",
    "unknown_argument",
  ]);
  return allowed.has(error?.code) ? error.code : "internal_runner_error";
}

function cli() {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        "Usage: node five_field_cursor_runner.mjs [--input <json-file|->]\n"
        + "Runs one injected, isolated public-source recovery transaction.\n",
      );
      return;
    }
    let text;
    try {
      text = args.inputPath === "-"
        ? readFileSync(0, "utf8")
        : readFileSync(resolve(args.inputPath), "utf8");
    } catch {
      fail("input_read_failed");
    }
    let input;
    try {
      input = JSON.parse(text.replace(/^\uFEFF/u, ""));
    } catch {
      fail("input_json_invalid");
    }
    const receipt = runCursorRunner(input);
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
