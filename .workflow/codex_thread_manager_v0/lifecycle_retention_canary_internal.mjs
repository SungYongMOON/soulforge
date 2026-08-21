import { createHash } from "node:crypto";
import { types } from "node:util";
import { computeReportDigest, LIFECYCLE_RETENTION_REPORT_SCHEMA } from "./lifecycle_retention.mjs";
import { CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA } from "./codex_retention_automation_internal.mjs";
import { RETENTION_PRESERVATION_RECEIPT_SCHEMA } from "./lifecycle_retention_preservation.mjs";
import { ALLOWED_MAIN_REFS } from "./git_worktree_canary_adapter.mjs";

export const RETENTION_CANARY_APPROVAL_SCHEMA = "soulforge.codex_thread_manager.retention_canary_approval.v1";
export const RETENTION_CANARY_PACKET_SCHEMA = "soulforge.codex_thread_manager.retention_canary_packet.v1";
export const RETENTION_CANARY_RECEIPT_SCHEMA = "soulforge.codex_thread_manager.retention_canary_receipt.v1";
export const RETENTION_CANARY_RESULT_SCHEMA = "soulforge.codex_thread_manager.retention_canary_result.v1";
export const RETENTION_ARCHIVE_OBSERVATION_SCHEMA = "soulforge.codex_thread_manager.retention_archive_observation.v1";
export const CANARY_MANAGER_PROTOCOL_SCHEMA = "soulforge.codex_thread_manager.canary_manager_protocol.v1";

function createImmutableAllowlist(items) {
  const arr = [...items];
  Object.defineProperty(arr, "has", {
    value: function (val) { return arr.includes(val); },
    writable: false,
    configurable: false,
    enumerable: false
  });
  Object.defineProperty(arr, "size", {
    get: function () { return arr.length; },
    configurable: false,
    enumerable: false
  });
  return Object.freeze(arr);
}

export const ALLOWED_CANARY_ACTIONS = createImmutableAllowlist(["apply_canary"]);
export const ALLOWED_CANARY_STRATEGIES = createImmutableAllowlist(["archive_and_remove_clean_worktree"]);

export const ALLOWED_SYNTHETIC_ARCHIVE_OBSERVERS = createImmutableAllowlist(["synthetic_archive_observer_adapter"]);
export const ALLOWED_REAL_ARCHIVE_OBSERVERS = createImmutableAllowlist(["real_codex_archive_observer_adapter"]);

export const ALLOWED_SYNTHETIC_REMOVERS = createImmutableAllowlist(["synthetic_git_canary_adapter"]);
export const ALLOWED_REAL_REMOVERS = createImmutableAllowlist(["real_git_canary_adapter"]);

export const ALLOWED_SYNTHETIC_PROBES = createImmutableAllowlist(["synthetic_git_canary_adapter"]);
export const ALLOWED_REAL_PROBES = createImmutableAllowlist(["real_git_canary_adapter"]);

export const REAL_EVIDENCE_TOKENS = createImmutableAllowlist([
  "codex_manager_archive_verified",
  "git_ref_resolved",
  "git_ancestry_verified",
  "git_rev_list_zero_verified",
  "git_porcelain_verified",
  "git_head_matched",
  "git_clean_verified",
  "git_worktree_removed",
  "git_probe_added",
  "git_probe_head_verified",
  "git_probe_clean_verified",
  "git_probe_removed",
  "git_probe_porcelain_cleared"
]);

export const SYNTHETIC_EVIDENCE_TOKENS = createImmutableAllowlist([
  "synthetic_archive_verified",
  "synthetic_worktree_removed",
  "synthetic_probe_verified"
]);

export const SAFE_EVIDENCE_TOKENS = createImmutableAllowlist([
  ...REAL_EVIDENCE_TOKENS,
  ...SYNTHETIC_EVIDENCE_TOKENS
]);

const ALLOWED_REPORT_SCHEMAS = createImmutableAllowlist([
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA
]);

const CANARY_APPROVAL_KEYS = Object.freeze(new Set([
  "schema_version",
  "approval_id",
  "candidate_id",
  "report_digest",
  "allowed_action",
  "canary_strategy",
  "issued_at",
  "expires_at"
]));

const CANARY_PACKET_KEYS = Object.freeze(new Set([
  "schema_version",
  "packet_id",
  "candidate_id",
  "binding_handle",
  "action",
  "strategy",
  "report_digest",
  "approval_id",
  "preservation_receipt_id",
  "target_commit_sha",
  "approved_main_sha",
  "approved_main_ref",
  "declared_unique_commit_count",
  "issued_at",
  "expires_at",
  "packet_digest"
]));

const ARCHIVE_OBSERVATION_KEYS = Object.freeze(new Set([
  "schema_version",
  "candidate_id",
  "packet_digest",
  "status",
  "archive_verified",
  "observer_kind",
  "observed_at",
  "observed_evidence"
]));

const BINDING_RECORD_KEYS = Object.freeze(new Set([
  "candidate_id",
  "binding_handle",
  "packet_id",
  "packet_digest",
  "worktree_path",
  "target_commit_sha",
  "official_thread_id",
  "binding_kind",
  "observed_at",
  "issued_at",
  "expires_at"
]));

const CANARY_MANAGER_PROTOCOL_KEYS = Object.freeze(new Set([
  "schema_version",
  "adapter_mode",
  "approval_id",
  "packet_id",
  "packet_digest",
  "binding_handle",
  "issued_at",
  "expires_at",
  "manager_attestation_digest"
]));

const RETENTION_PRESERVATION_RECEIPT_KEYS = Object.freeze(new Set([
  "schema_version",
  "receipt_id",
  "candidate_id",
  "report_digest",
  "approval_id",
  "strategy",
  "manifest_id",
  "manifest_digest",
  "status",
  "restore_check_status",
  "verified_at",
  "claim_ceiling",
  "evidence_kind",
  "preservation_count",
  "removal_count",
  "authority"
]));

export const SAFE_CANARY_ERROR_CODES = createImmutableAllowlist([
  "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
  "CLOCK_INVALID",
  "APPROVAL_INVALID_FORMAT",
  "APPROVAL_SCHEMA_VERSION_INVALID",
  "APPROVAL_ID_INVALID",
  "APPROVAL_CANDIDATE_ID_INVALID",
  "APPROVAL_REPORT_DIGEST_INVALID",
  "APPROVAL_EXPIRED",
  "APPROVAL_FUTURE_SKEW_REJECTED",
  "DISALLOWED_ACTION_REJECTED",
  "DISALLOWED_STRATEGY_REJECTED",
  "REPORT_INVALID_FORMAT",
  "REPORT_SCHEMA_INVALID",
  "REPORT_DIGEST_MISMATCH",
  "REPORT_DIGEST_COMPUTATION_FAILED",
  "DUPLICATE_CANDIDATE_ID_REJECTED",
  "CANDIDATE_NOT_FOUND_IN_REPORT",
  "PRESERVATION_RECEIPT_INVALID",
  "PRESERVATION_RECEIPT_REQUIRED",
  "PRESERVATION_NOT_VERIFIED",
  "PRESERVATION_NOT_REAL_VERIFIED",
  "PINNED_TASK_REJECTED",
  "RESULT_GATE_NOT_COMPLETED",
  "ENROLLMENT_LIFECYCLE_NOT_CURRENT",
  "SOURCE_HEALTH_BINDING_UNAVAILABLE",
  "THREAD_SCOPE_COVERAGE_INCOMPLETE",
  "UNBOUND_OR_ORPHAN_TASKS_PRESENT",
  "WORKTREE_PREFLIGHT_HEALTH_UNAVAILABLE",
  "WORKTREE_NOT_CLEAN",
  "WORKTREE_LOCATION_UNAVAILABLE",
  "DIRTY_UNTRACKED_HOLD",
  "DIRTY_UNTRACKED_STATE_UNKNOWN",
  "INDEX_LOCK_PRESENT_OR_UNKNOWN",
  "GIT_OPERATION_MARKER_PRESENT",
  "WORKTREE_LOCKED",
  "WORKTREE_PRUNABLE_HOLD",
  "UNIQUE_COMMITS_PRESENT",
  "MAIN_ANCESTRY_UNKNOWN",
  "COMMIT_SHA_REQUIRED",
  "COMMIT_SHA_INVALID",
  "MAIN_SHA_REQUIRED",
  "MAIN_SHA_INVALID",
  "MAIN_REF_REQUIRED",
  "MAIN_REF_INVALID",
  "MAIN_REF_MISMATCH",
  "MAIN_ANCESTRY_NOT_CONTAINED",
  "PACKET_REQUIRED",
  "PACKET_MISMATCH_REJECTED",
  "PACKET_EXPIRED",
  "ARCHIVE_OBSERVATION_MISSING",
  "ARCHIVE_OBSERVATION_INVALID",
  "ARCHIVE_OBSERVATION_EXPIRED",
  "ARCHIVE_NOT_VERIFIED",
  "BINDING_STORE_MISSING",
  "BINDING_RESOLVE_FAILED",
  "BINDING_RECORD_INVALID",
  "BINDING_RECORD_EXPIRED",
  "REMOVAL_BEFORE_ARCHIVE_FORBIDDEN",
  "WORKTREE_REMOVAL_FAILED",
  "WORKTREE_HEAD_MISMATCH",
  "WORKTREE_PATH_UNSAFE",
  "REPO_ROOT_REMOVAL_FORBIDDEN",
  "BROAD_DIRECTORY_REMOVAL_FORBIDDEN",
  "SYMLINK_REPARSE_AMBIGUITY",
  "WORKTREE_NOT_IN_PORCELAIN",
  "FORBIDDEN_FLAG_REJECTED",
  "RESTORE_PROBE_FAILED",
  "RESTORE_PROBE_HEAD_MISMATCH",
  "RESTORE_PROBE_DIRTY",
  "RESTORE_PROBE_CLEANUP_FAILED",
  "REPLAY_STORE_MISSING",
  "REPLAY_CONFLICT",
  "CANARY_REPLAY_CONFLICT",
  "PROTOCOL_INVALID",
  "ADAPTER_KIND_MISMATCH",
  "ADAPTER_ERROR_CODE_UNSAFE",
  "ADAPTER_EXECUTION_THREW",
  "EVIDENCE_TOKEN_INVALID",
  // Phase 4 Safe Codes (Blocker B9)
  "SOURCE_READ_FAILED",
  "SOURCE_READ_THREW",
  "SOURCE_OBJECTS_MISSING",
  "SOURCE_OBJECT_INVALID",
  "ZERO_UNIQUE_COMMITS_BRANCH_PRESERVATION_FORBIDDEN",
  "RETENTION_ACTION_UNSUPPORTED",
  "INVALID_MANIFEST",
  "CLAIM_FAILED",
  "CLAIM_CONSUMED",
  "METADATA_COUNTS_MISSING"
]);

const CANDIDATE_ID_PATTERN = /^cand-[0-9a-f]{32}$/u;
const APPROVAL_ID_PATTERN = /^appr-[0-9a-f]{32}$/u;
const PRESERVATION_RECEIPT_ID_PATTERN = /^rcpt-pres-[0-9a-f]{32}$/u;
const BINDING_HANDLE_PATTERN = /^bnd-canary-[0-9a-f]{32}$/u;
const PACKET_ID_PATTERN = /^pkt-canary-[0-9a-f]{32}$/u;
const REPORT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/u;
const LOCAL_PATH_PATTERN = /(?:[A-Za-z]:[\\/]|file:\/\/\/|\/(?:home|Users|var|etc|usr|tmp|root)\/|\\\\)/iu;
const SECRET_PATTERN = /-----BEGIN [A-Z ]+PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:ghp_|github_pat_|sk-|xox[baprs]-|AIza)[A-Za-z0-9_-]{8,}/iu;

function codePointCompare(a, b) {
  return a < b ? -1 : (a > b ? 1 : 0);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

export function isSafeString(value) {
  return typeof value === "string"
    && value.length <= 4096
    && value.normalize("NFC") === value
    && !CONTROL_CHAR_PATTERN.test(value)
    && !LOCAL_PATH_PATTERN.test(value)
    && !SECRET_PATTERN.test(value);
}

export function validateClockNow(nowInput) {
  if (nowInput === undefined) return Date.now();
  let candidate = nowInput;
  if (typeof nowInput === "function") {
    try {
      candidate = nowInput();
    } catch {
      return null;
    }
  }
  if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0) {
    return candidate;
  }
  return null;
}

export function sanitizeAdapterErrorCode(code) {
  if (typeof code !== "string" || !isSafeString(code) || !SAFE_CANARY_ERROR_CODES.has(code)) {
    return "ADAPTER_ERROR_CODE_UNSAFE";
  }
  return code;
}

export function snapshotPlainData(root, maxNodes = 5000) {
  const ancestors = new Set();
  let visitedCount = 0;
  function walk(value, depth = 0) {
    visitedCount += 1;
    if (visitedCount > maxNodes) throw new Error("snapshot_budget_exceeded");
    if (depth > 20) throw new Error("snapshot_depth_limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (!isSafeString(value)) throw new Error("unsafe_string_rejected");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) throw new Error("snapshot_number_invalid");
      return value;
    }
    if (typeof value !== "object" || types.isProxy(value) || ancestors.has(value)) {
      throw new Error("snapshot_shape_invalid");
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 1000) {
          throw new Error("snapshot_array_invalid");
        }
        return value.map((entry) => walk(entry, depth + 1));
      }
      if (!isPlainRecord(value)) throw new Error("snapshot_record_invalid");
      const keys = Reflect.ownKeys(value);
      if (keys.length > 128 || keys.some((key) => typeof key !== "string")) {
        throw new Error("snapshot_keys_invalid");
      }
      const output = {};
      for (const key of keys.sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new Error("snapshot_descriptor_invalid");
        }
        output[key] = walk(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      ancestors.delete(value);
    }
  }
  try {
    return walk(root);
  } catch {
    return null;
  }
}

export function sanitizeAndVerifyReport(reportInput, expectedReportDigest) {
  const report = snapshotPlainData(reportInput);
  if (!report || !isPlainRecord(report)) {
    return { valid: false, code: "REPORT_INVALID_FORMAT", report: null };
  }
  if (!ALLOWED_REPORT_SCHEMAS.has(report.schema_version)) {
    return { valid: false, code: "REPORT_SCHEMA_INVALID", report: null };
  }

  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const candidateIds = new Set();
  for (const candidate of candidates) {
    if (isPlainRecord(candidate) && typeof candidate.candidate_id === "string") {
      if (candidateIds.has(candidate.candidate_id)) {
        return { valid: false, code: "DUPLICATE_CANDIDATE_ID_REJECTED", report: null };
      }
      candidateIds.add(candidate.candidate_id);
    }
  }

  let recomputedDigest;
  try {
    recomputedDigest = computeReportDigest(report);
  } catch {
    return { valid: false, code: "REPORT_DIGEST_COMPUTATION_FAILED", report: null };
  }

  const reportDigestFromSnapshot = typeof report.digest === "string" ? report.digest : (typeof reportInput?.digest === "string" ? reportInput.digest : null);
  if (reportDigestFromSnapshot !== null && reportDigestFromSnapshot !== recomputedDigest) {
    return { valid: false, code: "REPORT_DIGEST_MISMATCH", report: null };
  }

  if (expectedReportDigest && recomputedDigest !== expectedReportDigest) {
    return { valid: false, code: "REPORT_DIGEST_MISMATCH", report: null };
  }

  return { valid: true, code: "REPORT_VALID", report, recomputedDigest };
}

export function validateRetentionCanaryApprovalInternal(approvalInput, { now = Date.now } = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return { valid: false, code: "CLOCK_INVALID", approval: null };
  }

  const approval = snapshotPlainData(approvalInput);
  if (!approval || !hasExactKeys(approval, CANARY_APPROVAL_KEYS)) {
    return { valid: false, code: "APPROVAL_INVALID_FORMAT", approval: null };
  }
  if (
    typeof approval.schema_version !== "string"
    || typeof approval.approval_id !== "string"
    || typeof approval.candidate_id !== "string"
    || typeof approval.report_digest !== "string"
    || typeof approval.allowed_action !== "string"
    || typeof approval.canary_strategy !== "string"
    || typeof approval.issued_at !== "string"
    || typeof approval.expires_at !== "string"
  ) {
    return { valid: false, code: "APPROVAL_INVALID_FORMAT", approval: null };
  }
  if (approval.schema_version !== RETENTION_CANARY_APPROVAL_SCHEMA) {
    return { valid: false, code: "APPROVAL_SCHEMA_VERSION_INVALID", approval: null };
  }
  if (!APPROVAL_ID_PATTERN.test(approval.approval_id)) {
    return { valid: false, code: "APPROVAL_ID_INVALID", approval: null };
  }
  if (!CANDIDATE_ID_PATTERN.test(approval.candidate_id)) {
    return { valid: false, code: "APPROVAL_CANDIDATE_ID_INVALID", approval: null };
  }
  if (!REPORT_DIGEST_PATTERN.test(approval.report_digest)) {
    return { valid: false, code: "APPROVAL_REPORT_DIGEST_INVALID", approval: null };
  }
  if (!ALLOWED_CANARY_ACTIONS.has(approval.allowed_action)) {
    return { valid: false, code: "DISALLOWED_ACTION_REJECTED", approval: null };
  }
  if (!ALLOWED_CANARY_STRATEGIES.has(approval.canary_strategy)) {
    return { valid: false, code: "DISALLOWED_STRATEGY_REJECTED", approval: null };
  }
  if (!ISO_UTC_PATTERN.test(approval.issued_at) || !ISO_UTC_PATTERN.test(approval.expires_at)) {
    return { valid: false, code: "APPROVAL_TIMESTAMP_INVALID", approval: null };
  }

  const issuedMs = Date.parse(approval.issued_at);
  const expiresMs = Date.parse(approval.expires_at);
  if (!Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs <= issuedMs) {
    return { valid: false, code: "APPROVAL_TIMESTAMP_INVALID", approval: null };
  }

  if (observedNow < issuedMs) {
    return { valid: false, code: "APPROVAL_FUTURE_SKEW_REJECTED", approval };
  }
  if (observedNow > expiresMs) {
    return { valid: false, code: "APPROVAL_EXPIRED", approval };
  }

  return { valid: true, code: "APPROVAL_VALID", approval };
}

export function canonicalizeJson(obj, depth = 0) {
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => (item === undefined ? "null" : canonicalizeJson(item, depth + 1))).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort(codePointCompare);
  const parts = [];
  for (const key of sortedKeys) {
    if (depth === 0 && key === "packet_digest") continue;
    const val = obj[key];
    if (val !== undefined) {
      parts.push(JSON.stringify(key) + ":" + canonicalizeJson(val, depth + 1));
    }
  }
  return "{" + parts.join(",") + "}";
}

export function computePacketDigest(packet) {
  const canonical = canonicalizeJson(packet, 0);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function planRetentionCanaryInternal(reportInput, approvalInput, preservationReceiptInput, options = {}) {
  const observedNow = validateClockNow(options?.now);
  if (observedNow === null) {
    return { status: "HOLD", reason_code: "CLOCK_INVALID", packet_template: null, candidate: null, approval: null };
  }

  const approvalValidation = validateRetentionCanaryApprovalInternal(approvalInput, { now: observedNow });
  if (!approvalValidation.valid) {
    return { status: "HOLD", reason_code: approvalValidation.code, packet_template: null, candidate: null, approval: null };
  }
  const approval = Object.freeze(JSON.parse(JSON.stringify(approvalValidation.approval)));

  const reportValidation = sanitizeAndVerifyReport(reportInput, approval.report_digest);
  if (!reportValidation.valid) {
    return { status: "HOLD", reason_code: reportValidation.code, packet_template: null, candidate: null, approval };
  }
  const report = Object.freeze(JSON.parse(JSON.stringify(reportValidation.report)));

  // Report Authority & Binding Checks
  const sourceHealth = report.source_health ?? {};
  if (!["available", "direct_app_observation"].includes(sourceHealth.task_worktree_binding)) {
    return { status: "HOLD", reason_code: "SOURCE_HEALTH_BINDING_UNAVAILABLE", packet_template: null, candidate: null, approval };
  }

  const threadScope = report.thread_scope ?? {};
  if (threadScope.binding_coverage !== "complete") {
    return { status: "HOLD", reason_code: "THREAD_SCOPE_COVERAGE_INCOMPLETE", packet_template: null, candidate: null, approval };
  }
  if (threadScope.unbound_task_count !== 0 || threadScope.orphan_binding_count !== 0) {
    return { status: "HOLD", reason_code: "UNBOUND_OR_ORPHAN_TASKS_PRESENT", packet_template: null, candidate: null, approval };
  }

  const preflight = report.worktree_preflight ?? {};
  if (preflight.list_status !== "available" || preflight.comparison_ref_status !== "available") {
    return { status: "HOLD", reason_code: "WORKTREE_PREFLIGHT_HEALTH_UNAVAILABLE", packet_template: null, candidate: null, approval };
  }

  // Blocker B3: preservationReceiptInput MUST be a plain record before any field access!
  if (!preservationReceiptInput || !isPlainRecord(preservationReceiptInput)) {
    return { status: "HOLD", reason_code: "PRESERVATION_RECEIPT_REQUIRED", packet_template: null, candidate: null, approval };
  }

  const preservationReceipt = snapshotPlainData(preservationReceiptInput);
  if (!preservationReceipt || !isPlainRecord(preservationReceipt)) {
    return { status: "HOLD", reason_code: "PRESERVATION_RECEIPT_REQUIRED", packet_template: null, candidate: null, approval };
  }
  if (
    preservationReceipt.schema_version !== RETENTION_PRESERVATION_RECEIPT_SCHEMA
    || !PRESERVATION_RECEIPT_ID_PATTERN.test(preservationReceipt.receipt_id)
    || preservationReceipt.candidate_id !== approval.candidate_id
    || preservationReceipt.report_digest !== approval.report_digest
    || preservationReceipt.status !== "PRESERVED_VERIFIED"
    || preservationReceipt.restore_check_status !== "VERIFIED"
    || preservationReceipt.authority?.preservation_authorized !== true
  ) {
    return { status: "HOLD", reason_code: "PRESERVATION_NOT_VERIFIED", packet_template: null, candidate: null, approval };
  }

  if (report.lifecycle_retention_action !== "HOLD") {
    return { status: "HOLD", reason_code: "RETENTION_ACTION_UNSUPPORTED", packet_template: null, candidate: null, approval };
  }

  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const candidate = candidates.find((c) => isPlainRecord(c) && c.candidate_id === approval.candidate_id);

  if (!candidate) {
    return { status: "HOLD", reason_code: "CANDIDATE_NOT_FOUND_IN_REPORT", packet_template: null, candidate: null, approval };
  }

  if (candidate.enrollment_lifecycle !== "current") {
    return { status: "HOLD", reason_code: "ENROLLMENT_LIFECYCLE_NOT_CURRENT", packet_template: null, candidate, approval };
  }

  if (candidate.retention_action !== "HOLD") {
    return { status: "HOLD", reason_code: "RETENTION_ACTION_UNSUPPORTED", packet_template: null, candidate, approval };
  }

  // Pinned task check - must be strict boolean false
  if (candidate.pinned !== false) {
    return { status: "HOLD", reason_code: "PINNED_TASK_REJECTED", packet_template: null, candidate, approval };
  }

  // Result gate completion check - accept completed ONLY!
  if (candidate.classification !== "completed") {
    return { status: "HOLD", reason_code: "RESULT_GATE_NOT_COMPLETED", packet_template: null, candidate, approval };
  }

  const metaCounts = isPlainRecord(candidate.metadata_counts) ? candidate.metadata_counts : null;
  if (!metaCounts) {
    return { status: "HOLD", reason_code: "METADATA_COUNTS_MISSING", packet_template: null, candidate, approval };
  }

  if (metaCounts.tracked_dirty !== false || metaCounts.untracked !== false) {
    return { status: "HOLD", reason_code: "DIRTY_UNTRACKED_HOLD", packet_template: null, candidate, approval };
  }

  if (metaCounts.index_lock !== false) {
    return { status: "HOLD", reason_code: "INDEX_LOCK_PRESENT_OR_UNKNOWN", packet_template: null, candidate, approval };
  }

  if (typeof metaCounts.operation_markers !== "number" || metaCounts.operation_markers !== 0) {
    return { status: "HOLD", reason_code: "GIT_OPERATION_MARKER_PRESENT", packet_template: null, candidate, approval };
  }

  if (metaCounts.locked !== false) {
    return { status: "HOLD", reason_code: "WORKTREE_LOCKED", packet_template: null, candidate, approval };
  }

  // Prunable check - must be strict boolean false
  if (metaCounts.prunable !== false) {
    return { status: "HOLD", reason_code: "WORKTREE_PRUNABLE_HOLD", packet_template: null, candidate, approval };
  }

  const uniqueCommits = metaCounts.unique_commits_vs_main;
  if (typeof uniqueCommits !== "number" || uniqueCommits !== 0) {
    return { status: "HOLD", reason_code: "UNIQUE_COMMITS_PRESENT", packet_template: null, candidate, approval };
  }

  const holdReasons = Array.isArray(candidate.hold_reasons) ? candidate.hold_reasons : [];
  if (holdReasons.includes("worktree_not_found_in_preflight") || holdReasons.includes("worktree_location_unavailable")) {
    return { status: "HOLD", reason_code: "WORKTREE_LOCATION_UNAVAILABLE", packet_template: null, candidate, approval };
  }
  if (holdReasons.includes("unique_commits_present")) {
    return { status: "HOLD", reason_code: "UNIQUE_COMMITS_PRESENT", packet_template: null, candidate, approval };
  }

  // Commit SHAs and Ref required explicitly - NO fabricated defaults!
  const targetCommitSha = options?.target_commit_sha || options?.targetCommitSha;
  const approvedMainSha = options?.approved_main_sha || options?.approvedMainSha;
  const approvedMainRef = options?.approved_main_ref || options?.approvedMainRef;

  if (!targetCommitSha || typeof targetCommitSha !== "string") {
    return { status: "HOLD", reason_code: "COMMIT_SHA_REQUIRED", packet_template: null, candidate, approval };
  }
  if (!COMMIT_SHA_PATTERN.test(targetCommitSha)) {
    return { status: "HOLD", reason_code: "COMMIT_SHA_INVALID", packet_template: null, candidate, approval };
  }

  if (!approvedMainSha || typeof approvedMainSha !== "string") {
    return { status: "HOLD", reason_code: "MAIN_SHA_REQUIRED", packet_template: null, candidate, approval };
  }
  if (!COMMIT_SHA_PATTERN.test(approvedMainSha)) {
    return { status: "HOLD", reason_code: "MAIN_SHA_INVALID", packet_template: null, candidate, approval };
  }

  if (!approvedMainRef || typeof approvedMainRef !== "string") {
    return { status: "HOLD", reason_code: "MAIN_REF_REQUIRED", packet_template: null, candidate, approval };
  }
  if (!ALLOWED_MAIN_REFS.has(approvedMainRef) || approvedMainRef.startsWith("-")) {
    return { status: "HOLD", reason_code: "MAIN_REF_INVALID", packet_template: null, candidate, approval };
  }

  const handleSeed = `${approval.candidate_id}:${approval.report_digest}:${preservationReceipt.receipt_id}:${observedNow}`;
  const handleHash = createHash("sha256").update(handleSeed, "utf8").digest("hex");
  const bindingHandle = `bnd-canary-${handleHash.slice(0, 32)}`;
  const packetId = `pkt-canary-${handleHash.slice(32, 64)}`;

  const packetTemplate = Object.freeze({
    schema_version: RETENTION_CANARY_PACKET_SCHEMA,
    packet_id: packetId,
    candidate_id: approval.candidate_id,
    binding_handle: bindingHandle,
    action: "apply_canary",
    strategy: "archive_and_remove_clean_worktree",
    report_digest: approval.report_digest,
    approval_id: approval.approval_id,
    preservation_receipt_id: preservationReceipt.receipt_id,
    target_commit_sha: targetCommitSha,
    approved_main_sha: approvedMainSha,
    approved_main_ref: approvedMainRef,
    declared_unique_commit_count: 0,
    issued_at: approval.issued_at,
    expires_at: approval.expires_at
  });

  const packetWithDigest = Object.freeze({
    ...packetTemplate,
    packet_digest: computePacketDigest(packetTemplate)
  });

  return {
    status: "PLAN_READY",
    reason_code: "PLAN_READY",
    packet_template: packetWithDigest,
    candidate: Object.freeze(JSON.parse(JSON.stringify(candidate))),
    approval,
    preservation_receipt: Object.freeze(JSON.parse(JSON.stringify(preservationReceipt))),
    report
  };
}

export function executeRetentionCanaryProductionInternal(reportInput, approvalInput, preservationReceiptInput, archiveObservationInput, options = {}) {
  const observedNow = validateClockNow(options?.now);
  const planResult = planRetentionCanaryInternal(reportInput, approvalInput, preservationReceiptInput, { ...options, now: observedNow });

  return {
    schema_version: RETENTION_CANARY_RESULT_SCHEMA,
    status: "HOLD",
    reason_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
    archive_count: 0,
    removal_count: 0,
    restore_probe_count: 0,
    verified_post_state: "HOLD",
    replay_state: "none",
    zero_forbidden_actions: true,
    packet_template: planResult.packet_template ?? null,
    receipt: null
  };
}

export async function executeRetentionCanarySyntheticInternal(reportInput, approvalInput, preservationReceiptInput, archiveObservationInput, {
  now = Date.now,
  packetInput = null,
  protocolContext = null,
  replayStore = null,
  bindingStore = null,
  archiveObserverAdapter = null,
  worktreeRemoverAdapter = null,
  restoreProbeAdapter = null
} = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "CLOCK_INVALID",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: null,
      receipt: null
    };
  }

  // Blocker B1: reportInput is MANDATORY!
  if (!reportInput || !isPlainRecord(reportInput)) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "REPORT_INVALID_FORMAT",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: null,
      receipt: null
    };
  }

  // Freeze / snapshot input parameters immutably
  const frozenApproval = snapshotPlainData(approvalInput);

  // Blocker B3: preservationReceiptInput MUST be a plain record, never null/undefined!
  if (!preservationReceiptInput || !isPlainRecord(preservationReceiptInput)) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PRESERVATION_RECEIPT_REQUIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: null,
      packet_template: null,
      receipt: null
    };
  }

  const frozenPreservation = snapshotPlainData(preservationReceiptInput);
  if (!frozenPreservation || !isPlainRecord(frozenPreservation) || !hasExactKeys(frozenPreservation, RETENTION_PRESERVATION_RECEIPT_KEYS)) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PRESERVATION_RECEIPT_REQUIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: null,
      packet_template: null,
      receipt: null
    };
  }

  const frozenArchiveObs = snapshotPlainData(archiveObservationInput);
  const frozenPacket = snapshotPlainData(packetInput);

  // Blocker B3: Stage 2 REQUIRES packetInput with exact keys!
  if (!frozenPacket || !hasExactKeys(frozenPacket, CANARY_PACKET_KEYS)) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PACKET_REQUIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: null,
      packet_template: null,
      receipt: null
    };
  }

  // Blocker B7: Stage 2 Packet Semantics & Recheck
  if (
    frozenPacket.schema_version !== RETENTION_CANARY_PACKET_SCHEMA
    || !PACKET_ID_PATTERN.test(frozenPacket.packet_id)
    || !BINDING_HANDLE_PATTERN.test(frozenPacket.binding_handle)
    || !CANDIDATE_ID_PATTERN.test(frozenPacket.candidate_id)
    || !PRESERVATION_RECEIPT_ID_PATTERN.test(frozenPacket.preservation_receipt_id)
    || frozenPacket.action !== "apply_canary"
    || frozenPacket.strategy !== "archive_and_remove_clean_worktree"
    || frozenPacket.declared_unique_commit_count !== 0
    || frozenPacket.candidate_id !== frozenApproval?.candidate_id
    || frozenPacket.approval_id !== frozenApproval?.approval_id
    || frozenPacket.report_digest !== frozenApproval?.report_digest
    || frozenPacket.preservation_receipt_id !== frozenPreservation?.receipt_id
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PACKET_MISMATCH_REJECTED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: frozenPacket,
      packet_template: frozenPacket,
      receipt: null
    };
  }

  const recomputedPacketDigest = computePacketDigest(frozenPacket);
  if (frozenPacket.packet_digest !== recomputedPacketDigest) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PACKET_MISMATCH_REJECTED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: frozenPacket,
      packet_template: frozenPacket,
      receipt: null
    };
  }

  // Blocker B7: Packet timestamp validation against observedNow
  const packetIssuedMs = Date.parse(frozenPacket.issued_at);
  const packetExpiresMs = Date.parse(frozenPacket.expires_at);
  if (!Number.isFinite(packetIssuedMs) || !Number.isFinite(packetExpiresMs) || observedNow < packetIssuedMs || observedNow > packetExpiresMs) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PACKET_EXPIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: frozenPacket,
      packet_template: frozenPacket,
      receipt: null
    };
  }

  // Blocker B1: Stage 2 Report & Safety Revalidation!
  const freshPlan = planRetentionCanaryInternal(reportInput, approvalInput, preservationReceiptInput, {
    now: observedNow,
    target_commit_sha: frozenPacket.target_commit_sha,
    approved_main_sha: frozenPacket.approved_main_sha,
    approved_main_ref: frozenPacket.approved_main_ref
  });

  if (freshPlan.status !== "PLAN_READY" || !freshPlan.packet_template) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: freshPlan.reason_code || "SAFETY_REVALIDATION_FAILED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: frozenPacket,
      packet_template: frozenPacket,
      receipt: null
    };
  }

  const freshTemplate = freshPlan.packet_template;
  if (
    freshTemplate.candidate_id !== frozenPacket.candidate_id
    || freshTemplate.report_digest !== frozenPacket.report_digest
    || freshTemplate.approval_id !== frozenPacket.approval_id
    || freshTemplate.preservation_receipt_id !== frozenPacket.preservation_receipt_id
    || freshTemplate.target_commit_sha !== frozenPacket.target_commit_sha
    || freshTemplate.approved_main_sha !== frozenPacket.approved_main_sha
    || freshTemplate.approved_main_ref !== frozenPacket.approved_main_ref
    || freshTemplate.action !== frozenPacket.action
    || freshTemplate.strategy !== frozenPacket.strategy
    || freshTemplate.declared_unique_commit_count !== frozenPacket.declared_unique_commit_count
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PACKET_MISMATCH_REJECTED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet: frozenPacket,
      packet_template: frozenPacket,
      receipt: null
    };
  }

  const packet = frozenPacket;
  const candidateId = packet.candidate_id;

  // Blocker B7: Adapter kind allowlists & mode matching
  if (!archiveObserverAdapter || !worktreeRemoverAdapter || !restoreProbeAdapter) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const obsKind = archiveObserverAdapter.adapter_kind;
  const remKind = worktreeRemoverAdapter.adapter_kind;
  const prbKind = restoreProbeAdapter.adapter_kind;

  const isSyntheticAll = ALLOWED_SYNTHETIC_ARCHIVE_OBSERVERS.has(obsKind)
    && ALLOWED_SYNTHETIC_REMOVERS.has(remKind)
    && ALLOWED_SYNTHETIC_PROBES.has(prbKind);

  const isRealAll = ALLOWED_REAL_ARCHIVE_OBSERVERS.has(obsKind)
    && ALLOWED_REAL_REMOVERS.has(remKind)
    && ALLOWED_REAL_PROBES.has(prbKind);

  if (!isSyntheticAll && !isRealAll) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ADAPTER_KIND_MISMATCH",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const allowedTokens = isRealAll ? REAL_EVIDENCE_TOKENS : SYNTHETIC_EVIDENCE_TOKENS;

  // Item 4: Internal Manager Protocol check with exact keys for real execution
  if (isRealAll) {
    const proto = snapshotPlainData(protocolContext);
    if (
      !proto
      || !isPlainRecord(proto)
      || !hasExactKeys(proto, CANARY_MANAGER_PROTOCOL_KEYS)
      || proto.schema_version !== CANARY_MANAGER_PROTOCOL_SCHEMA
      || proto.adapter_mode !== "real"
      || proto.approval_id !== packet.approval_id
      || proto.packet_id !== packet.packet_id
      || proto.packet_digest !== packet.packet_digest
      || proto.binding_handle !== packet.binding_handle
    ) {
      return {
        schema_version: RETENTION_CANARY_RESULT_SCHEMA,
        status: "HOLD",
        reason_code: "PROTOCOL_INVALID",
        archive_count: 0,
        removal_count: 0,
        restore_probe_count: 0,
        verified_post_state: "HOLD",
        replay_state: "none",
        zero_forbidden_actions: true,
        packet,
        packet_template: packet,
        receipt: null
      };
    }
  }

  // Blocker B4: Positive Real Preservation Allowlist
  if (isRealAll) {
    if (
      frozenPreservation.claim_ceiling !== "real_preservation_verified"
      || frozenPreservation.evidence_kind !== "real_git_execution"
      || frozenPreservation.status !== "PRESERVED_VERIFIED"
      || frozenPreservation.restore_check_status !== "VERIFIED"
      || frozenPreservation.candidate_id !== candidateId
      || frozenPreservation.report_digest !== packet.report_digest
      || frozenPreservation.authority?.preservation_authorized !== true
    ) {
      return {
        schema_version: RETENTION_CANARY_RESULT_SCHEMA,
        status: "HOLD",
        reason_code: "PRESERVATION_NOT_REAL_VERIFIED",
        archive_count: 0,
        removal_count: 0,
        restore_probe_count: 0,
        verified_post_state: "HOLD",
        replay_state: "none",
        zero_forbidden_actions: true,
        packet,
        packet_template: packet,
        receipt: null
      };
    }
  }

  // Blocker B5: Real Opaque Binding Store resolution & mandatory packet_digest check
  if (!bindingStore || typeof bindingStore.resolveBinding !== "function") {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "BINDING_STORE_MISSING",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  let resolvedBinding;
  try {
    resolvedBinding = await bindingStore.resolveBinding(packet.binding_handle);
  } catch {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "BINDING_RESOLVE_FAILED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (
    !isPlainRecord(resolvedBinding)
    || !hasExactKeys(resolvedBinding, BINDING_RECORD_KEYS)
    || resolvedBinding.candidate_id !== candidateId
    || resolvedBinding.binding_handle !== packet.binding_handle
    || resolvedBinding.packet_id !== packet.packet_id
    || resolvedBinding.packet_digest !== packet.packet_digest // MANDATORY (Blocker B5)
    || resolvedBinding.target_commit_sha !== packet.target_commit_sha
    || resolvedBinding.binding_kind !== "direct_app_observation"
    || typeof resolvedBinding.worktree_path !== "string"
    || !resolvedBinding.worktree_path
    || typeof resolvedBinding.official_thread_id !== "string"
    || !resolvedBinding.official_thread_id
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "BINDING_RECORD_INVALID",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // Binding Freshness Check (Blocker B5)
  const bindingExpiresMs = Date.parse(resolvedBinding.expires_at);
  if (!Number.isFinite(bindingExpiresMs) || observedNow > bindingExpiresMs) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "BINDING_RECORD_EXPIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const internalWorktreePath = resolvedBinding.worktree_path;

  // STAGE 1: Task Archive Observation Verification
  if (!frozenArchiveObs || !hasExactKeys(frozenArchiveObs, ARCHIVE_OBSERVATION_KEYS)) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ARCHIVE_OBSERVATION_INVALID",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (
    frozenArchiveObs.schema_version !== RETENTION_ARCHIVE_OBSERVATION_SCHEMA
    || frozenArchiveObs.candidate_id !== candidateId
    || frozenArchiveObs.packet_digest !== packet.packet_digest
    || frozenArchiveObs.status !== "archived"
    || frozenArchiveObs.archive_verified !== true
    || frozenArchiveObs.observer_kind !== "codex_app_manager"
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ARCHIVE_NOT_VERIFIED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const obsMs = Date.parse(frozenArchiveObs.observed_at);
  if (!Number.isFinite(obsMs) || obsMs > observedNow || (observedNow - obsMs) > 86400000) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ARCHIVE_OBSERVATION_EXPIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  let archiveResult;
  try {
    archiveResult = await archiveObserverAdapter.observeTaskArchive(candidateId, packet.packet_digest);
  } catch {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ADAPTER_EXECUTION_THREW",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (
    !isPlainRecord(archiveResult)
    || archiveResult.schema_version !== RETENTION_ARCHIVE_OBSERVATION_SCHEMA
    || archiveResult.success !== true
    || archiveResult.archive_verified !== true
    || archiveResult.candidate_id !== candidateId
    || archiveResult.packet_digest !== packet.packet_digest
    || archiveResult.observer_kind !== "codex_app_manager"
    || archiveResult.status !== "archived"
    || !ISO_UTC_PATTERN.test(archiveResult.observed_at)
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: sanitizeAdapterErrorCode(archiveResult?.error_code || "ARCHIVE_NOT_VERIFIED"),
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const liveObsMs = Date.parse(archiveResult.observed_at);
  if (!Number.isFinite(liveObsMs) || liveObsMs > observedNow || (observedNow - liveObsMs) > 86400000) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ARCHIVE_OBSERVATION_EXPIRED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // Cross-check archiveResult with frozenArchiveObs
  if (
    archiveResult.candidate_id !== frozenArchiveObs.candidate_id
    || archiveResult.packet_digest !== frozenArchiveObs.packet_digest
    || archiveResult.status !== frozenArchiveObs.status
    || archiveResult.observed_at !== frozenArchiveObs.observed_at
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ARCHIVE_NOT_VERIFIED",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // Item 1: Validate archive evidence tokens using partitioned allowedTokens BEFORE archiveCount=1
  if (!Array.isArray(archiveResult.observed_evidence) || archiveResult.observed_evidence.length === 0 || archiveResult.observed_evidence.some((tok) => typeof tok !== "string" || !isSafeString(tok) || !allowedTokens.has(tok))) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "EVIDENCE_TOKEN_INVALID",
      archive_count: 0,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const validatedArchiveEvidence = archiveResult.observed_evidence;
  const archiveCount = 1;

  // Replay store check & atomic consumption BEFORE removal!
  if (!replayStore || typeof replayStore.consumeReplay !== "function") {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "REPLAY_STORE_MISSING",
      archive_count: archiveCount,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "none",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  let replayConsumeRes;
  try {
    replayConsumeRes = await replayStore.consumeReplay(packet.packet_id);
  } catch {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "CANARY_REPLAY_CONFLICT",
      archive_count: archiveCount,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "replay_detected",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (!isPlainRecord(replayConsumeRes) || replayConsumeRes.success !== true) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "CANARY_REPLAY_CONFLICT",
      archive_count: archiveCount,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "replay_detected",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // STAGE 2: Worktree Removal (ONLY after archive verification & replay consumption)
  let removalResult;
  try {
    removalResult = await worktreeRemoverAdapter.removeCleanWorktree(candidateId, packet, {
      worktreePath: internalWorktreePath
    });
  } catch {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ADAPTER_EXECUTION_THREW",
      archive_count: archiveCount,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (!isPlainRecord(removalResult) || removalResult.success !== true) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: sanitizeAdapterErrorCode(removalResult?.error_code || "WORKTREE_REMOVAL_FAILED"),
      archive_count: archiveCount,
      removal_count: 0,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // Item 2: Honest post-remove evidence failure: report removal_count: 1 after observed successful removal!
  if (!Array.isArray(removalResult.observed_evidence) || removalResult.observed_evidence.length === 0 || removalResult.observed_evidence.some((tok) => typeof tok !== "string" || !isSafeString(tok) || !allowedTokens.has(tok))) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "EVIDENCE_TOKEN_INVALID",
      archive_count: archiveCount,
      removal_count: 1, // HONEST removal_count 1!
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const validatedRemovalEvidence = removalResult.observed_evidence;
  const removalCount = 1;

  // STAGE 3: Restore Probe Execution
  let probeResult;
  try {
    probeResult = await restoreProbeAdapter.performRestoreProbe(candidateId, packet, {
      worktreePath: internalWorktreePath
    });
  } catch {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ADAPTER_EXECUTION_THREW",
      archive_count: archiveCount,
      removal_count: removalCount,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  if (
    !isPlainRecord(probeResult)
    || probeResult.success !== true
    || probeResult.probe_verified !== true
    || probeResult.probe_cleanup_verified !== true
  ) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: sanitizeAdapterErrorCode(probeResult?.error_code || "RESTORE_PROBE_FAILED"),
      archive_count: archiveCount,
      removal_count: removalCount,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  // Item 1: Validate probe evidence tokens using partitioned allowedTokens
  if (!Array.isArray(probeResult.observed_evidence) || probeResult.observed_evidence.length === 0 || probeResult.observed_evidence.some((tok) => typeof tok !== "string" || !isSafeString(tok) || !allowedTokens.has(tok))) {
    return {
      schema_version: RETENTION_CANARY_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "EVIDENCE_TOKEN_INVALID",
      archive_count: archiveCount,
      removal_count: removalCount,
      restore_probe_count: 0,
      verified_post_state: "HOLD",
      replay_state: "single_use_consumed",
      zero_forbidden_actions: true,
      packet,
      packet_template: packet,
      receipt: null
    };
  }

  const validatedProbeEvidence = probeResult.observed_evidence;
  const restoreProbeCount = 1;

  // STAGE 4: Emit Verified Receipt (ONLY when archive, removal, and probe are fully verified)
  const combinedEvidence = Object.freeze([...new Set([
    ...validatedArchiveEvidence,
    ...validatedRemovalEvidence,
    ...validatedProbeEvidence
  ])]);

  const receiptSeed = `${packet.packet_id}:${packet.approval_id}:${observedNow}`;
  const receiptHash = createHash("sha256").update(receiptSeed, "utf8").digest("hex");
  const receiptId = `rcpt-canary-${receiptHash.slice(0, 32)}`;

  const claimCeiling = isRealAll ? "real_canary_verified" : "synthetic_evidence_only";
  const evidenceKind = isRealAll ? "real_git_execution" : "synthetic_test_proof";

  const receipt = Object.freeze({
    schema_version: RETENTION_CANARY_RECEIPT_SCHEMA,
    receipt_id: receiptId,
    candidate_id: candidateId,
    binding_handle: packet.binding_handle,
    packet_id: packet.packet_id,
    approval_id: packet.approval_id,
    preservation_receipt_id: packet.preservation_receipt_id,
    status: "CANARY_VERIFIED",
    verified_post_state: "CANARY_VERIFIED",
    replay_state: "single_use_consumed",
    verified_at: new Date(observedNow).toISOString(),
    claim_ceiling: claimCeiling,
    evidence_kind: evidenceKind,
    command_evidence: combinedEvidence,
    archive_count: archiveCount,
    removal_count: removalCount,
    restore_probe_count: restoreProbeCount,
    zero_forbidden_actions: true,
    authority: {
      canary_authorized: true,
      branch_delete_authorized: false,
      force_remove_authorized: false
    }
  });

  return {
    schema_version: RETENTION_CANARY_RESULT_SCHEMA,
    status: "CANARY_VERIFIED",
    reason_code: "SUCCESS",
    archive_count: archiveCount,
    removal_count: removalCount,
    restore_probe_count: restoreProbeCount,
    verified_post_state: "CANARY_VERIFIED",
    replay_state: "single_use_consumed",
    zero_forbidden_actions: true,
    packet,
    packet_template: packet,
    receipt
  };
}
