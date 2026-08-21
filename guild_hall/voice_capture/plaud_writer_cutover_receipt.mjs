// plaud_writer_cutover_receipt.mjs — Owner validation module for PLAUD writer cutover receipt.
// Public-safe validator reused by continuous_runner and receipt expiry adapter.

export const PLAUD_CUTOVER_RECEIPT_SCHEMA = "soulforge.voice.plaud_writer_cutover_receipt.v1";
export const PLAUD_CUTOVER_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "observed_at",
  "valid_until",
  "source_node_id",
  "source_collector_label",
  "source_writer_status",
  "source_process_count",
  "source_service_state",
  "source_restart_policy_enabled",
  "target_node_id",
  "target_mode",
  "profile_sha256",
  "owner_approval_ref",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_VALIDITY_WINDOW_MS = 30 * 86_400 * 1000; // 30 days
const MAX_FUTURE_OBSERVATION_MS = 5 * 60 * 1000; // 5 minutes max future skew

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function exactFields(record, expectedFields, errorCode) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    fail(errorCode);
  }
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    fail(errorCode);
  }
}

export function validatePlaudCutoverReceipt(cutoverReceipt, options = {}) {
  const errorCode = options.errorCode || "continuous_plaud_cutover_receipt_invalid";
  const nowMs = Number.isFinite(options.now) ? options.now : Date.now();
  const allowExpired = options.allowExpired === true;
  const targetNodeId = options.targetNodeId;
  const profileSha256 = options.profileSha256;

  if (typeof targetNodeId !== "string" || !SAFE_ID.test(targetNodeId)) fail(errorCode);
  if (typeof profileSha256 !== "string" || !SHA256.test(profileSha256)) fail(errorCode);

  exactFields(cutoverReceipt, PLAUD_CUTOVER_RECEIPT_FIELDS, errorCode);

  if (cutoverReceipt.schema_version !== PLAUD_CUTOVER_RECEIPT_SCHEMA) fail(errorCode);
  if (!SAFE_ID.test(cutoverReceipt.source_node_id)) fail(errorCode);
  if (cutoverReceipt.source_node_id === targetNodeId) fail(errorCode);
  if (cutoverReceipt.source_collector_label !== "ai.soulforge.plaud-ingest") fail(errorCode);
  if (cutoverReceipt.source_writer_status !== "stopped") fail(errorCode);
  if (cutoverReceipt.source_process_count !== 0) fail(errorCode);
  if (cutoverReceipt.source_service_state !== "disabled_unloaded") fail(errorCode);
  if (cutoverReceipt.source_restart_policy_enabled !== false) fail(errorCode);
  if (!SAFE_ID.test(cutoverReceipt.target_node_id)) fail(errorCode);
  if (cutoverReceipt.target_node_id !== targetNodeId) fail(errorCode);
  if (cutoverReceipt.target_mode !== "primary_writer") fail(errorCode);
  if (!SHA256.test(cutoverReceipt.profile_sha256)) fail(errorCode);
  if (cutoverReceipt.profile_sha256 !== profileSha256) fail(errorCode);
  if (!STRICT_UTC_TIMESTAMP.test(cutoverReceipt.observed_at)) fail(errorCode);
  if (!STRICT_UTC_TIMESTAMP.test(cutoverReceipt.valid_until)) fail(errorCode);
  if (!SAFE_ID.test(cutoverReceipt.owner_approval_ref)) fail(errorCode);

  const observedAt = Date.parse(cutoverReceipt.observed_at);
  const validUntil = Date.parse(cutoverReceipt.valid_until);

  if (!Number.isFinite(observedAt) || !Number.isFinite(validUntil)) fail(errorCode);
  if (validUntil <= observedAt || (validUntil - observedAt) > MAX_VALIDITY_WINDOW_MS) fail(errorCode);

  // Always reject future observation past nowMs + 5 minutes, regardless of allowExpired
  if (observedAt > nowMs + MAX_FUTURE_OBSERVATION_MS) {
    fail(errorCode);
  }

  // When allowExpired=false (runtime execution), reject validUntil <= nowMs
  if (!allowExpired && validUntil <= nowMs) {
    fail(errorCode);
  }

  return {
    schema_version: cutoverReceipt.schema_version,
    observed_at: cutoverReceipt.observed_at,
    valid_until: cutoverReceipt.valid_until,
    source_node_id: cutoverReceipt.source_node_id,
    target_node_id: cutoverReceipt.target_node_id,
    owner_approval_ref: cutoverReceipt.owner_approval_ref,
  };
}
