import { createHash } from "node:crypto";
import { types } from "node:util";
import { computeReportDigest, LIFECYCLE_RETENTION_REPORT_SCHEMA } from "./lifecycle_retention.mjs";
import { CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA } from "./codex_retention_automation_internal.mjs";
import { HELD_PRODUCTION_PRESERVATION_ADAPTER } from "../../guild_hall/backup_controller/retention_preservation_gate.mjs";

export const RETENTION_APPROVAL_RECEIPT_SCHEMA = "soulforge.codex_thread_manager.retention_approval_receipt.v1";
export const RETENTION_PRESERVATION_MANIFEST_SCHEMA = "soulforge.codex_thread_manager.retention_preservation_manifest.v1";
export const RETENTION_PRESERVATION_RECEIPT_SCHEMA = "soulforge.codex_thread_manager.retention_preservation_receipt.v1";
export const RETENTION_PRESERVATION_RESULT_SCHEMA = "soulforge.codex_thread_manager.retention_preservation_result.v1";

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

export const ALLOWED_RETENTION_ACTIONS = createImmutableAllowlist(["preserve"]);
export const ALLOWED_PRESERVATION_STRATEGIES = createImmutableAllowlist([
  "preservation_branch",
  "_local_hold"
]);

const ALLOWED_REPORT_SCHEMAS = createImmutableAllowlist([
  LIFECYCLE_RETENTION_REPORT_SCHEMA,
  CODEX_RETENTION_AUTOMATION_REPORT_SCHEMA
]);

const APPROVAL_RECEIPT_KEYS = Object.freeze(new Set([
  "schema_version",
  "approval_id",
  "candidate_id",
  "report_digest",
  "allowed_action",
  "preservation_strategy",
  "issued_at",
  "expires_at"
]));

const SAFE_ADAPTER_ERROR_CODES = createImmutableAllowlist([
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
  "DUPLICATE_CANDIDATE_ID_REJECTED",
  "CANDIDATE_NOT_FOUND_IN_REPORT",
  "PRESERVATION_NOT_AUTHORIZED",
  "SOURCE_OBJECT_INVALID",
  "SOURCE_OBJECT_READ_FAILED",
  "SOURCE_OBJECT_COUNT_MISMATCH",
  "SOURCE_OBJECT_BYTE_MISMATCH",
  "MANIFEST_NOT_FOUND",
  "PRESERVATION_WRITE_FAILED",
  "PRESERVATION_READBACK_FAILED",
  "PRESERVATION_REPLAY_CONFLICT",
  "RESTORE_CHECK_FAILED",
  "RESTORE_CHECK_DIGEST_MISMATCH",
  "METADATA_COUNTS_MISSING",
  "DIRTY_UNTRACKED_STATE_UNKNOWN",
  "DIRTY_UNTRACKED_HOLD",
  "INDEX_LOCK_PRESENT_OR_UNKNOWN",
  "GIT_OPERATION_MARKER_PRESENT",
  "WORKTREE_LOCKED",
  "WORKTREE_LOCATION_UNAVAILABLE",
  "MAIN_ANCESTRY_UNKNOWN",
  "UNIQUE_COMMITS_PRESENT",
  "SOURCE_READ_FAILED",
  "SOURCE_READ_THREW",
  "SOURCE_OBJECTS_MISSING",
  "ZERO_UNIQUE_COMMITS_BRANCH_PRESERVATION_FORBIDDEN",
  "RETENTION_ACTION_UNSUPPORTED",
  "INVALID_MANIFEST",
  "CLAIM_FAILED",
  "CLAIM_CONSUMED",
  "ADAPTER_ERROR_CODE_UNSAFE",
  "ADAPTER_EXECUTION_THREW"
]);

const CANDIDATE_ID_PATTERN = /^cand-[0-9a-f]{32}$/u;
const REPORT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
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
  if (typeof code !== "string" || !isSafeString(code) || !SAFE_ADAPTER_ERROR_CODES.has(code)) {
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

  const reportDigestFromSnapshot = typeof report.digest === "string" ? report.digest : (typeof reportInput.digest === "string" ? reportInput.digest : null);
  if (reportDigestFromSnapshot !== null && reportDigestFromSnapshot !== recomputedDigest) {
    return { valid: false, code: "REPORT_DIGEST_MISMATCH", report: null };
  }

  if (expectedReportDigest && recomputedDigest !== expectedReportDigest) {
    return { valid: false, code: "REPORT_DIGEST_MISMATCH", report: null };
  }

  return { valid: true, code: "REPORT_VALID", report, recomputedDigest };
}

export function validateRetentionApprovalReceiptInternal(approvalInput, { now = Date.now } = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return { valid: false, code: "CLOCK_INVALID", approval: null };
  }

  const approval = snapshotPlainData(approvalInput);
  if (!approval || !hasExactKeys(approval, APPROVAL_RECEIPT_KEYS)) {
    return { valid: false, code: "APPROVAL_INVALID_FORMAT", approval: null };
  }
  if (
    typeof approval.schema_version !== "string"
    || typeof approval.approval_id !== "string"
    || typeof approval.candidate_id !== "string"
    || typeof approval.report_digest !== "string"
    || typeof approval.allowed_action !== "string"
    || typeof approval.preservation_strategy !== "string"
    || typeof approval.issued_at !== "string"
    || typeof approval.expires_at !== "string"
  ) {
    return { valid: false, code: "APPROVAL_INVALID_FORMAT", approval: null };
  }
  if (approval.schema_version !== RETENTION_APPROVAL_RECEIPT_SCHEMA) {
    return { valid: false, code: "APPROVAL_SCHEMA_VERSION_INVALID", approval: null };
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(approval.approval_id)) {
    return { valid: false, code: "APPROVAL_ID_INVALID", approval: null };
  }
  if (!CANDIDATE_ID_PATTERN.test(approval.candidate_id)) {
    return { valid: false, code: "APPROVAL_CANDIDATE_ID_INVALID", approval: null };
  }
  if (!REPORT_DIGEST_PATTERN.test(approval.report_digest)) {
    return { valid: false, code: "APPROVAL_REPORT_DIGEST_INVALID", approval: null };
  }
  if (!ALLOWED_RETENTION_ACTIONS.has(approval.allowed_action)) {
    return { valid: false, code: "DISALLOWED_ACTION_REJECTED", approval: null };
  }
  if (!ALLOWED_PRESERVATION_STRATEGIES.has(approval.preservation_strategy)) {
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
    if (depth === 0 && key === "manifest_digest") continue;
    const val = obj[key];
    if (val !== undefined) {
      parts.push(JSON.stringify(key) + ":" + canonicalizeJson(val, depth + 1));
    }
  }
  return "{" + parts.join(",") + "}";
}

export function computeManifestDigest(manifest) {
  const canonical = canonicalizeJson(manifest, 0);
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function planRetentionPreservationInternal(reportInput, approvalInput, { now = Date.now } = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return { status: "HOLD", reason_code: "CLOCK_INVALID", manifest_template: null, candidate: null, approval: null };
  }

  const approvalValidation = validateRetentionApprovalReceiptInternal(approvalInput, { now: observedNow });
  if (!approvalValidation.valid) {
    return { status: "HOLD", reason_code: approvalValidation.code, manifest_template: null, candidate: null, approval: null };
  }
  const approval = Object.freeze(JSON.parse(JSON.stringify(approvalValidation.approval)));

  const reportValidation = sanitizeAndVerifyReport(reportInput, approval.report_digest);
  if (!reportValidation.valid) {
    return { status: "HOLD", reason_code: reportValidation.code, manifest_template: null, candidate: null, approval };
  }
  const report = Object.freeze(JSON.parse(JSON.stringify(reportValidation.report)));

  if (report.lifecycle_retention_action !== "HOLD") {
    return { status: "HOLD", reason_code: "RETENTION_ACTION_UNSUPPORTED", manifest_template: null, candidate: null, approval };
  }

  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const candidate = candidates.find((c) => isPlainRecord(c) && c.candidate_id === approval.candidate_id);

  if (!candidate) {
    return { status: "HOLD", reason_code: "CANDIDATE_NOT_FOUND_IN_REPORT", manifest_template: null, candidate: null, approval };
  }

  if (candidate.retention_action !== "HOLD") {
    return { status: "HOLD", reason_code: "RETENTION_ACTION_UNSUPPORTED", manifest_template: null, candidate, approval };
  }

  const metaCounts = isPlainRecord(candidate.metadata_counts) ? candidate.metadata_counts : null;
  if (!metaCounts) {
    return { status: "HOLD", reason_code: "METADATA_COUNTS_MISSING", manifest_template: null, candidate, approval };
  }

  if (typeof metaCounts.tracked_dirty !== "boolean" || typeof metaCounts.untracked !== "boolean") {
    return { status: "HOLD", reason_code: "DIRTY_UNTRACKED_STATE_UNKNOWN", manifest_template: null, candidate, approval };
  }
  if (metaCounts.tracked_dirty === true || metaCounts.untracked === true) {
    return { status: "HOLD", reason_code: "DIRTY_UNTRACKED_HOLD", manifest_template: null, candidate, approval };
  }

  if (typeof metaCounts.index_lock !== "boolean" || metaCounts.index_lock === true) {
    return { status: "HOLD", reason_code: "INDEX_LOCK_PRESENT_OR_UNKNOWN", manifest_template: null, candidate, approval };
  }

  if (typeof metaCounts.operation_markers !== "number" || !Number.isSafeInteger(metaCounts.operation_markers) || metaCounts.operation_markers !== 0) {
    return { status: "HOLD", reason_code: "GIT_OPERATION_MARKER_PRESENT", manifest_template: null, candidate, approval };
  }

  if (typeof metaCounts.locked !== "boolean" || metaCounts.locked === true) {
    return { status: "HOLD", reason_code: "WORKTREE_LOCKED", manifest_template: null, candidate, approval };
  }

  const uniqueCommits = metaCounts.unique_commits_vs_main;
  if (typeof uniqueCommits !== "number" || !Number.isSafeInteger(uniqueCommits) || uniqueCommits < 0) {
    return { status: "HOLD", reason_code: "MAIN_ANCESTRY_UNKNOWN", manifest_template: null, candidate, approval };
  }

  const holdReasons = Array.isArray(candidate.hold_reasons) ? candidate.hold_reasons : [];
  if (holdReasons.includes("worktree_not_found_in_preflight") || holdReasons.includes("worktree_location_unavailable")) {
    return { status: "HOLD", reason_code: "WORKTREE_LOCATION_UNAVAILABLE", manifest_template: null, candidate, approval };
  }
  if (holdReasons.includes("index_lock_present") || holdReasons.includes("index_lock_state_unknown")) {
    return { status: "HOLD", reason_code: "INDEX_LOCK_PRESENT_OR_UNKNOWN", manifest_template: null, candidate, approval };
  }
  if (holdReasons.includes("git_operation_marker_present") || holdReasons.includes("git_operation_state_unknown")) {
    return { status: "HOLD", reason_code: "GIT_OPERATION_MARKER_PRESENT", manifest_template: null, candidate, approval };
  }
  if (holdReasons.includes("worktree_locked")) {
    return { status: "HOLD", reason_code: "WORKTREE_LOCKED", manifest_template: null, candidate, approval };
  }
  if (holdReasons.includes("tracked_change_state_unknown") || holdReasons.includes("untracked_state_unknown")) {
    return { status: "HOLD", reason_code: "DIRTY_UNTRACKED_STATE_UNKNOWN", manifest_template: null, candidate, approval };
  }

  const strategy = approval.preservation_strategy;
  const portableRef = strategy === "preservation_branch"
    ? `refs/retention/preservation-${approval.candidate_id}`
    : `_local_hold/candidates/${approval.candidate_id}`;

  const manifestTemplate = Object.freeze({
    schema_version: RETENTION_PRESERVATION_MANIFEST_SCHEMA,
    candidate_id: approval.candidate_id,
    strategy,
    portable_ref: portableRef,
    declared_unique_commit_count: uniqueCommits
  });

  return {
    status: "PLAN_READY",
    reason_code: "PLAN_READY",
    manifest_template: manifestTemplate,
    candidate: Object.freeze(JSON.parse(JSON.stringify(candidate))),
    approval,
    report,
    declared_unique_commit_count: uniqueCommits
  };
}

export function verifyRetentionPreservationInternal(expectedManifest, readbackResult) {
  const safeExpected = snapshotPlainData(expectedManifest);
  if (!safeExpected || !isPlainRecord(safeExpected)) {
    return { status: "FAILED", reason_code: "MANIFEST_TYPE_INVALID" };
  }

  if (!isPlainRecord(readbackResult) || readbackResult.success !== true) {
    const rawCode = readbackResult?.error_code;
    return { status: "FAILED", reason_code: sanitizeAdapterErrorCode(rawCode) };
  }

  const readbackManifest = snapshotPlainData(readbackResult.manifest);
  if (!isPlainRecord(readbackManifest)) {
    return { status: "FAILED", reason_code: "MANIFEST_TYPE_INVALID" };
  }

  if (
    readbackManifest.manifest_id !== safeExpected.manifest_id
    || readbackManifest.manifest_digest !== safeExpected.manifest_digest
    || readbackManifest.candidate_id !== safeExpected.candidate_id
    || readbackManifest.strategy !== safeExpected.strategy
    || readbackManifest.portable_ref !== safeExpected.portable_ref
    || readbackManifest.total_objects !== safeExpected.total_objects
    || readbackManifest.total_bytes !== safeExpected.total_bytes
  ) {
    return { status: "FAILED", reason_code: "MANIFEST_IDENTITY_MISMATCH" };
  }

  let computedReadbackDigest;
  try {
    computedReadbackDigest = computeManifestDigest(readbackManifest);
  } catch {
    return { status: "FAILED", reason_code: "MANIFEST_DIGEST_MISMATCH" };
  }

  if (computedReadbackDigest !== safeExpected.manifest_digest) {
    return { status: "FAILED", reason_code: "MANIFEST_DIGEST_MISMATCH" };
  }

  const readbackObjects = Array.isArray(readbackResult.objects) ? readbackResult.objects : [];
  const expectedObjects = Array.isArray(safeExpected.objects) ? safeExpected.objects : [];

  if (readbackObjects.length !== expectedObjects.length) {
    return { status: "FAILED", reason_code: "OBJECT_COUNT_MISMATCH" };
  }

  for (let index = 0; index < expectedObjects.length; index += 1) {
    const expectedObj = expectedObjects[index];
    const readbackObj = readbackObjects[index];

    if (!isPlainRecord(readbackObj) || !Buffer.isBuffer(readbackObj.bytes)) {
      return { status: "FAILED", reason_code: "READBACK_OBJECT_INVALID" };
    }

    if (
      readbackObj.object_id !== expectedObj.object_id
      || readbackObj.kind !== expectedObj.kind
      || readbackObj.digest !== expectedObj.digest
      || readbackObj.byte_count !== expectedObj.byte_count
      || readbackObj.bytes.length !== expectedObj.byte_count
    ) {
      return { status: "FAILED", reason_code: "OBJECT_IDENTITY_MISMATCH" };
    }

    const recomputedHash = `sha256:${createHash("sha256").update(readbackObj.bytes).digest("hex")}`;
    if (recomputedHash !== expectedObj.digest) {
      return { status: "FAILED", reason_code: "OBJECT_DIGEST_MISMATCH" };
    }
  }

  return { status: "VERIFIED", reason_code: "RESTORE_CHECK_PASSED" };
}

export function executeRetentionPreservationProductionInternal(reportInput, approvalInput, { now = Date.now } = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "CLOCK_INVALID",
      preservation_count: 0,
      removal_count: 0,
      manifest_template: null,
      manifest: null,
      receipt: null
    };
  }

  const planResult = planRetentionPreservationInternal(reportInput, approvalInput, { now: observedNow });
  const prodAdapter = HELD_PRODUCTION_PRESERVATION_ADAPTER;
  const prodWriteRes = prodAdapter.writePreservation();

  return {
    schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
    status: "HOLD",
    reason_code: prodWriteRes.error_code || "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
    preservation_count: 0,
    removal_count: 0,
    manifest_template: planResult.manifest_template ?? null,
    manifest: null,
    receipt: null
  };
}

export async function executeRetentionPreservationSyntheticInternal(reportInput, approvalInput, {
  now = Date.now,
  sourceReaderAdapter = null,
  preservationWriterAdapter = null,
  preservationReaderAdapter = null
} = {}) {
  const observedNow = validateClockNow(now);
  if (observedNow === null) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "CLOCK_INVALID",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  const planResult = planRetentionPreservationInternal(reportInput, approvalInput, { now: observedNow });
  if (planResult.status !== "PLAN_READY") {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: planResult.reason_code,
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  const approval = planResult.approval;
  const candidateId = approval.candidate_id;
  const reportDigest = approval.report_digest;
  const strategy = approval.preservation_strategy;
  const approvalId = approval.approval_id;

  if (!sourceReaderAdapter || !preservationWriterAdapter || !preservationReaderAdapter
      || typeof sourceReaderAdapter.readSourceObjects !== "function"
      || typeof preservationWriterAdapter.writePreservation !== "function"
      || typeof preservationReaderAdapter.readPreservation !== "function") {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "FEATURE_OFF_PRODUCTION_EXECUTION_FORBIDDEN",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  let sourceResult;
  try {
    sourceResult = await sourceReaderAdapter.readSourceObjects(
      candidateId,
      planResult.declared_unique_commit_count
    );
  } catch {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "SOURCE_READ_THREW",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  if (!isPlainRecord(sourceResult) || sourceResult.success !== true) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: sanitizeAdapterErrorCode(sourceResult?.error_code || "SOURCE_READ_FAILED"),
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  const sourceObjects = Array.isArray(sourceResult.objects) ? sourceResult.objects : [];
  if (sourceObjects.length === 0) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "SOURCE_OBJECTS_MISSING",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  for (const rawObj of sourceObjects) {
    if (!isPlainRecord(rawObj) || !Buffer.isBuffer(rawObj.bytes) || rawObj.bytes.length === 0) {
      return {
        schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
        status: "HOLD",
        reason_code: "SOURCE_OBJECT_INVALID",
        preservation_count: 0,
        removal_count: 0,
        manifest: null,
        receipt: null
      };
    }
  }

  if (planResult.declared_unique_commit_count > 0 && sourceObjects.length < planResult.declared_unique_commit_count) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "SOURCE_OBJECT_COUNT_MISMATCH",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  if (strategy === "preservation_branch" && planResult.declared_unique_commit_count === 0) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "ZERO_UNIQUE_COMMITS_BRANCH_PRESERVATION_FORBIDDEN",
      preservation_count: 0,
      removal_count: 0,
      manifest: null,
      receipt: null
    };
  }

  const payloadObjects = [];
  let totalBytes = 0;

  for (let index = 0; index < sourceObjects.length; index += 1) {
    const rawObj = sourceObjects[index];
    const bytes = rawObj.bytes;
    const digestHex = createHash("sha256").update(bytes).digest("hex");
    const objectId = `obj-${digestHex.slice(0, 16)}`;
    const objectKind = strategy === "preservation_branch" ? "git_object_pack" : "local_hold_payload";

    payloadObjects.push({
      object_id: objectId,
      kind: objectKind,
      digest: `sha256:${digestHex}`,
      byte_count: bytes.length,
      bytes
    });
    totalBytes += bytes.length;
  }

  const manifestSeed = `${candidateId}:${reportDigest}:${strategy}:${totalBytes}:${payloadObjects.length}`;
  const manifestHash = createHash("sha256").update(manifestSeed, "utf8").digest("hex");
  const manifestId = `pmst-${manifestHash.slice(0, 32)}`;

  const manifest = {
    schema_version: RETENTION_PRESERVATION_MANIFEST_SCHEMA,
    manifest_id: manifestId,
    candidate_id: candidateId,
    strategy,
    portable_ref: planResult.manifest_template.portable_ref,
    objects: payloadObjects.map((obj) => ({
      object_id: obj.object_id,
      kind: obj.kind,
      digest: obj.digest,
      byte_count: obj.byte_count
    })),
    total_objects: payloadObjects.length,
    total_bytes: totalBytes
  };
  manifest.manifest_digest = computeManifestDigest(manifest);

  let writeResult;
  try {
    writeResult = await preservationWriterAdapter.writePreservation(manifest, payloadObjects);
  } catch {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PRESERVATION_WRITE_THREW",
      preservation_count: 0,
      removal_count: 0,
      manifest,
      receipt: null
    };
  }

  if (!isPlainRecord(writeResult) || writeResult.success !== true) {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: sanitizeAdapterErrorCode(writeResult?.error_code || "PRESERVATION_WRITE_FAILED"),
      preservation_count: 0,
      removal_count: 0,
      manifest,
      receipt: null
    };
  }

  let readbackResult;
  try {
    readbackResult = await preservationReaderAdapter.readPreservation(manifest.manifest_id);
  } catch {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: "PRESERVATION_READBACK_THREW",
      preservation_count: 0,
      removal_count: 0,
      manifest,
      receipt: null
    };
  }

  const verifyResult = verifyRetentionPreservationInternal(manifest, readbackResult);
  if (verifyResult.status !== "VERIFIED") {
    return {
      schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
      status: "HOLD",
      reason_code: verifyResult.reason_code,
      preservation_count: 0,
      removal_count: 0,
      manifest,
      receipt: null
    };
  }

  const receiptSeed = `${manifest.manifest_id}:${approvalId}:${observedNow}`;
  const receiptHash = createHash("sha256").update(receiptSeed, "utf8").digest("hex");
  const receiptId = `rcpt-${receiptHash.slice(0, 32)}`;

  const receipt = {
    schema_version: RETENTION_PRESERVATION_RECEIPT_SCHEMA,
    receipt_id: receiptId,
    candidate_id: manifest.candidate_id,
    report_digest: reportDigest,
    approval_id: approvalId,
    strategy: manifest.strategy,
    manifest_id: manifest.manifest_id,
    manifest_digest: manifest.manifest_digest,
    status: "PRESERVED_VERIFIED",
    restore_check_status: "VERIFIED",
    verified_at: new Date(observedNow).toISOString(),
    claim_ceiling: "synthetic_evidence_only",
    evidence_kind: "synthetic_test_proof",
    preservation_count: 1,
    removal_count: 0,
    authority: {
      preservation_authorized: true,
      removal_authorized: false
    }
  };

  return {
    schema_version: RETENTION_PRESERVATION_RESULT_SCHEMA,
    status: "PRESERVED_VERIFIED",
    reason_code: "SUCCESS",
    preservation_count: 1,
    removal_count: 0,
    manifest,
    receipt
  };
}
