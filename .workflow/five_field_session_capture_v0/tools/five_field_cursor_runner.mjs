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
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  INPUT_SCHEMA as SWEEP_INPUT_SCHEMA,
  canonicalRecordDigest,
  deriveWorkerIdentity,
  planCursorSweep,
} from "./five_field_cursor_sweep.mjs";

export const RUNNER_INPUT_SCHEMA = "soulforge.five_field_cursor_runner_input.v1";
export const RUNNER_RECEIPT_SCHEMA = "soulforge.five_field_cursor_runner_receipt.v1";

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

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
      commit: null,
      created: false,
      cas_success: false,
      push_success: false,
      remote_contains_commit: false,
    },
    writer_binding: {
      binding_id: null,
      classification: null,
      ref: null,
    },
    hold_reasons: [],
    safety: {
      first_live_source_public_only: false,
      source_snapshot_worktree_mutations: 0,
      writer_worktree_mutations: 0,
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

function validateAllowlist(input, sourceRoot, writerRoot) {
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

  const writer = input.writer;
  const cursor = input.cursor;
  const writerMatches = Array.isArray(input.writer_allowlist)
    ? input.writer_allowlist.filter((row) =>
      row?.binding_id === writer.binding_id
      && row.classification === writer.classification
      && typeof row.clone_path === "string"
      && comparablePath(realpathSync.native(resolve(row.clone_path)))
        === comparablePath(writerRoot)
      && row.remote === writer.remote
      && row.remote_url === writer.remote_url
      && row.ref === writer.ref
      && row.ledger_logical_path === writer.ledger_logical_path
      && row.cursor_logical_path === cursor.logical_path)
    : [];
  if (writerMatches.length !== 1) fail("writer_not_exactly_allowlisted");
}

function validateInput(input, receipt) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input_object_required");
  }
  if (input.schema_version !== RUNNER_INPUT_SCHEMA) fail("input_schema_mismatch");
  if (input.execution_mode !== "isolated") fail("execution_mode_must_be_isolated");

  const recordedAt = normalizeIso(input.recorded_at, "recorded_at_invalid");
  const worker = deriveWorkerIdentity(input.runtime);
  if (!worker.ok) {
    hold(receipt, worker.reason);
    return null;
  }
  receipt.worker_identity = worker.worker;

  const source = input.source || {};
  if (source.classification !== "public") fail("source_must_be_public");
  safeToken(source.repo, "source_repo_invalid");
  safeToken(source.source_lane, "source_lane_invalid");
  safeRef(source.ref, "source_ref_invalid");
  if (!SHA_RE.test(source.seed || "")) fail("source_seed_invalid");
  if (!SHA_RE.test(source.target || "")) fail("source_target_invalid");

  const cursor = input.cursor || {};
  if (
    cursor.repo !== source.repo
    || cursor.ref !== source.ref
    || cursor.source_lane !== source.source_lane
    || cursor.last_successful_source_commit !== source.seed
  ) {
    fail("cursor_source_tuple_mismatch");
  }
  if (!DIGEST_RE.test(cursor.expected_revision || "")) {
    fail("cursor_expected_revision_invalid");
  }
  safeLogicalPath(cursor.logical_path, "cursor_logical_path_invalid");

  const writer = input.writer || {};
  safeToken(writer.binding_id, "writer_binding_id_invalid");
  if (!["private", "synthetic"].includes(writer.classification)) {
    fail("writer_classification_invalid");
  }
  safeToken(writer.remote, "writer_remote_invalid");
  safeRef(writer.ref, "writer_ref_invalid");
  safeLogicalPath(writer.ledger_logical_path, "ledger_logical_path_invalid");
  if (writer.ledger_logical_path === cursor.logical_path) {
    fail("writer_logical_paths_must_be_distinct");
  }
  const author = writer.commit_author || {};
  safeMetadata(author.name, "writer_author_name_invalid", 120);
  if (
    typeof author.email !== "string"
    || !EMAIL_RE.test(author.email)
    || ABSOLUTE_PATH_SENTINEL_RE.test(author.email)
    || SECRET_SENTINEL_RE.test(author.email)
  ) {
    fail("writer_author_email_invalid");
  }
  safeMetadata(writer.output_commit_message, "writer_output_commit_message_invalid", 200);
  safeMetadata(writer.cursor_commit_message, "writer_cursor_commit_message_invalid", 200);

  const sourceRoot = exactRealpath(source.snapshot_path, "source_snapshot_realpath_invalid");
  const writerRoot = exactRealpath(writer.clone_path, "writer_clone_realpath_invalid");
  if (
    pathContains(sourceRoot, writerRoot)
    || pathContains(writerRoot, sourceRoot)
  ) {
    fail("source_writer_realpath_overlap");
  }
  validateAllowlist(input, sourceRoot, writerRoot);
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
  receipt.writer_binding = {
    binding_id: writer.binding_id,
    classification: writer.classification,
    ref: writer.ref,
  };
  receipt.safety.first_live_source_public_only = true;
  return { recordedAt, worker: worker.worker, sourceRoot, writerRoot };
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
export function runCursorRunner(input, options = {}) {
  const receipt = baseReceipt();
  let validated;
  try {
    validated = validateInput(input, receipt);
    if (!validated) return receipt;
  } catch (error) {
    return hold(receipt, error?.code || "input_boundary_invalid");
  }

  const {
    recordedAt,
    sourceRoot,
    writerRoot,
  } = validated;
  const { source, cursor, writer } = input;
  let sourceEvidence;
  let initialWriterState;
  try {
    sourceEvidence = sourceSnapshotEvidence(sourceRoot, source);
    receipt.source_snapshot.bare = sourceEvidence.bare;
    receipt.source_snapshot.target_tree_digest = sha256(sourceEvidence.tree);
    initialWriterState = writerPreflight(writerRoot, writer);
  } catch (error) {
    return hold(receipt, error?.code || "preflight_failed");
  }

  let remoteTip;
  let cursorText;
  let remoteCursor;
  let ledgerText;
  let ledgerRecords;
  try {
    remoteTip = fetchRemoteTip(writerRoot, writer.remote, writer.ref);
    cursorText = readBlob(writerRoot, remoteTip, cursor.logical_path);
    remoteCursor = parseJsonObject(cursorText, "cursor_json_invalid");
    ledgerText = readBlob(
      writerRoot,
      remoteTip,
      writer.ledger_logical_path,
      { optional: true },
    );
    ledgerRecords = parseLedger(ledgerText);
    assertNoIdentityConflicts(ledgerRecords);
  } catch (error) {
    return hold(receipt, error?.code || "writer_state_read_failed");
  }

  const remoteCursorRevision = cursorRevision(remoteCursor);
  const alreadyAdvanced =
    remoteCursor.repo === source.repo
    && remoteCursor.ref === source.ref
    && remoteCursor.source_lane === source.source_lane
    && remoteCursor.last_successful_source_commit === source.target;
  if (alreadyAdvanced) {
    receipt.cursor_update.after = source.target;
    receipt.cursor_update.state = "VERIFIED_ADVANCED";
  } else {
    if (
      remoteCursor.repo !== source.repo
      || remoteCursor.ref !== source.ref
      || remoteCursor.source_lane !== source.source_lane
      || remoteCursor.last_successful_source_commit !== source.seed
    ) {
      return hold(receipt, "cursor_remote_source_tuple_mismatch");
    }
    if (remoteCursorRevision !== cursor.expected_revision) {
      return hold(receipt, "cursor_compare_and_swap_revision_mismatch");
    }
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
      if (writerWorktreeState(writerRoot) !== initialWriterState) {
        return hold(receipt, "writer_worktree_changed");
      }
    } catch {
      return hold(receipt, "final_recheck_failed");
    }
    receipt.status = "ALREADY_ADVANCED";
    receipt.cursor_update.after = source.target;
    receipt.cursor_update.state = "VERIFIED_ADVANCED";
    receipt.cursor_update.resulting_revision = remoteCursorRevision;
    receipt.cursor_update.cas_success = true;
    receipt.cursor_update.remote_contains_commit = true;
    return receipt;
  }

  let outputCommit = remoteTip;
  if (plan.records_to_append.length > 0) {
    let combinedLedger;
    try {
      combinedLedger = appendLedger(ledgerText, plan.records_to_append);
      const combinedRecords = parseLedger(combinedLedger);
      const digestById = assertNoIdentityConflicts(combinedRecords);
      for (const record of plan.records_to_append) {
        if (digestById.get(record.id) !== canonicalRecordDigest(record)) {
          fail("ledger_append_digest_verification_failed");
        }
      }
      outputCommit = commitWithBlob({
        writerRoot,
        baseCommit: remoteTip,
        logicalPath: writer.ledger_logical_path,
        content: combinedLedger,
        author: writer.commit_author,
        recordedAt,
        message: writer.output_commit_message,
      });
      receipt.ledger_output.commit = outputCommit;
      receipt.ledger_output.created = true;
      receipt.safety.designated_writer_commits += 1;
      if (typeof options.beforeLedgerPush === "function") {
        options.beforeLedgerPush();
      }
      receipt.ledger_output.push_success =
        pushCommit(writerRoot, writer.remote, writer.ref, outputCommit);
      if (!receipt.ledger_output.push_success) {
        return hold(receipt, "ledger_output_non_fast_forward_push_failed");
      }
      receipt.safety.designated_remote_pushes += 1;
      const inclusion = remoteContainsCommit(
        writerRoot,
        writer.remote,
        writer.ref,
        outputCommit,
      );
      receipt.ledger_output.remote_contains_commit =
        inclusion.contains && options.faultAt !== "ledger_inclusion_failure";
      if (!receipt.ledger_output.remote_contains_commit) {
        return hold(receipt, "ledger_output_remote_inclusion_failed");
      }
      remoteTip = inclusion.tip;
      receipt.records.appended = plan.records_to_append.length;
    } catch (error) {
      return hold(receipt, error?.code || "ledger_output_failed");
    }
  } else {
    receipt.ledger_output.commit = remoteTip;
    receipt.ledger_output.push_success = true;
    receipt.ledger_output.remote_contains_commit = true;
  }

  const afterOutputFault = injectedHold(options, "after_output_push", receipt);
  if (afterOutputFault) return afterOutputFault;

  try {
    remoteTip = fetchRemoteTip(writerRoot, writer.remote, writer.ref);
    const cursorAtCas = parseJsonObject(
      readBlob(writerRoot, remoteTip, cursor.logical_path),
      "cursor_json_invalid",
    );
    const revisionAtCas = cursorRevision(cursorAtCas);
    if (
      cursorAtCas.repo !== source.repo
      || cursorAtCas.ref !== source.ref
      || cursorAtCas.source_lane !== source.source_lane
      || cursorAtCas.last_successful_source_commit !== source.seed
      || revisionAtCas !== cursor.expected_revision
    ) {
      return hold(receipt, "cursor_compare_and_swap_revision_mismatch");
    }
    if (!sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return hold(receipt, "source_snapshot_changed_before_cursor_cas");
    }

    const advancedCursor = {
      ...cursorAtCas,
      last_successful_source_commit: source.target,
    };
    const advancedText = `${JSON.stringify(advancedCursor, null, 2)}\n`;
    const cursorCommit = commitWithBlob({
      writerRoot,
      baseCommit: remoteTip,
      logicalPath: cursor.logical_path,
      content: advancedText,
      author: writer.commit_author,
      recordedAt,
      message: writer.cursor_commit_message,
    });
    receipt.cursor_update.commit = cursorCommit;
    receipt.cursor_update.created = true;
    receipt.cursor_update.resulting_revision = cursorRevision(advancedCursor);
    receipt.cursor_update.cas_success = true;
    receipt.safety.designated_writer_commits += 1;

    const afterCursorCommitFault = injectedHold(options, "after_cursor_commit", receipt);
    if (afterCursorCommitFault) return afterCursorCommitFault;

    if (!sourceSnapshotUnchanged(sourceRoot, source, sourceEvidence)) {
      return hold(receipt, "source_snapshot_changed_before_cursor_push");
    }
    receipt.cursor_update.push_success =
      pushCommit(writerRoot, writer.remote, writer.ref, cursorCommit);
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
      writerRoot,
      writer.remote,
      writer.ref,
      cursorCommit,
    );
    receipt.cursor_update.remote_contains_commit =
      cursorInclusion.contains && options.faultAt !== "cursor_inclusion_failure";
    if (!receipt.cursor_update.remote_contains_commit) {
      return hold(receipt, "cursor_remote_inclusion_failed");
    }
    const persistedCursor = parseJsonObject(
      readBlob(writerRoot, cursorInclusion.tip, cursor.logical_path),
      "cursor_json_invalid",
    );
    if (
      persistedCursor.last_successful_source_commit !== source.target
      || cursorRevision(persistedCursor) !== receipt.cursor_update.resulting_revision
    ) {
      return hold(receipt, "cursor_remote_content_verification_failed");
    }
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
    if (writerWorktreeState(writerRoot) !== initialWriterState) {
      return hold(receipt, "writer_worktree_changed");
    }
  } catch {
    return hold(receipt, "final_recheck_failed");
  }

  receipt.status = "SUCCESS";
  return receipt;
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
