// Pure mail receipt -> source-lane capture adapter.
//
// This module accepts only an already-written continuous-ingress receipt and
// its matching mail store-validity receipt. It performs no provider call and
// no filesystem write. The output is one `capture_generation` record for the
// existing source-lane index; it never invents a backup pointer, restore test,
// or human acceptance.

import {
  canonicalJson,
  sha256Canonical,
} from "../../shared/project_history_envelope.mjs";

import { validateLaneRecord } from "./source_lane_index.mjs";

const CONTINUOUS_SCHEMAS = Object.freeze([
  "soulforge.ingress.continuous_run_receipt.v2",
  "soulforge.ingress.continuous_run_receipt.v3",
]);
const MAIL_RESULT_SCHEMA = "soulforge.ingress.mail_bridge_result.v1";
const STORE_RECEIPT_SCHEMA = "soulforge.ingress.store_validity.v1";
const MAIL_SOURCE_REF = "source.mail";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SAFE_SCOPE_REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const SAFE_RUN_ID = /^[A-Za-z0-9_.:-]{1,192}$/;
const SAFE_ERROR_CODE = /^[a-z][a-z0-9_]{0,127}$/;

const CONTINUOUS_TOP_LEVEL_FIELDS = new Set([
  "schema_version", "run_id", "status", "node_id", "lease_epoch",
  "writer_authority_epoch", "writer_authority_digest",
  "writer_authority_node_id", "writer_authority_mode", "started_at",
  "completed_at", "mail", "plaud", "voice", "queues", "errors",
  "writes_performed", "writes_performed_lower_bound",
  "writes_performed_exact", "source_deleted", "source_overwritten",
  "erp_written", "mcp_written", "project_promoted", "mail_fetched",
  "continuous_scheduler_enabled",
]);

const MAIL_FIELDS = Object.freeze([
  "credential_files_checked", "error_codes", "exit_code", "mailboxes_enabled",
  "mailboxes_run", "mailboxes_skipped", "mailboxes_total", "partial",
  "schema_version", "spawned", "status", "total_duplicates", "total_events",
  "total_new_events", "write_count_known",
]);

const STORE_FIELDS = Object.freeze([
  "activity_changed", "attempted_at", "completed_at", "error_codes", "lane",
  "last_success_at", "schema_version", "status", "validated_count",
  "validation_digest", "validation_scope",
]);

const FORBIDDEN_KEY = /(?:^|_)(?:access_token|api_key|attachment|authorization|body|bytes|content|cookie|credential|local_path|password|path|payload|private_key|prompt|raw|refresh_token|secret|token|transcript)(?:_|$)/iu;
const SAFE_CREDENTIAL_COUNT_KEY = "credential_files_checked";

function fail(code) {
  // Public-safe boundary: caller-owned field names and values never return in
  // messages. The stable code is sufficient for diagnosis and routing.
  const error = new Error(code);
  error.code = code;
  throw error;
}

function plainRecord(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code);
  }
  return value;
}

function assertExactKeys(record, expected, code) {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail(code);
  }
}

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function assertBodyFree(value, seen = new Set()) {
  if (typeof value === "string") {
    if (absolutePathLeak(value)) fail("mail_receipt_absolute_path_forbidden");
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("mail_receipt_cycle_forbidden");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertBodyFree(item, seen);
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail("mail_receipt_record_invalid");
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
      if (key !== SAFE_CREDENTIAL_COUNT_KEY && FORBIDDEN_KEY.test(normalizedKey)) {
        fail("mail_receipt_forbidden_field", key);
      }
      assertBodyFree(item, seen);
    }
  }
  seen.delete(value);
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("mail_receipt_clock_invalid", field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("mail_receipt_clock_invalid", field);
  return timestamp;
}

function assertReceiptDigest(value, receipt, field) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("mail_receipt_digest_invalid", field);
  }
  let expected;
  try {
    expected = sha256Canonical(receipt);
  } catch {
    fail("mail_receipt_canonicalization_failed", field);
  }
  if (value !== expected) fail("mail_receipt_digest_mismatch", field);
}

function assertNonnegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) fail("mail_capture_count_invalid", field);
}

function validateMailResult(raw) {
  const mail = plainRecord(raw, "mail_capture_result_invalid");
  assertExactKeys(mail, MAIL_FIELDS, "mail_capture_result_shape_invalid");
  if (mail.schema_version !== MAIL_RESULT_SCHEMA || mail.status !== "ok"
      || mail.spawned !== true || mail.exit_code !== 0 || mail.partial !== false
      || mail.write_count_known !== true) {
    fail("mail_capture_not_accepted");
  }
  for (const field of [
    "credential_files_checked", "mailboxes_enabled", "mailboxes_run",
    "mailboxes_skipped", "mailboxes_total", "total_duplicates", "total_events",
    "total_new_events",
  ]) assertNonnegativeInteger(mail[field], field);
  if (!Array.isArray(mail.error_codes)
      || mail.error_codes.some((code) => typeof code !== "string" || !SAFE_ERROR_CODE.test(code))
      || mail.error_codes.length !== 0
      || mail.mailboxes_run !== mail.mailboxes_enabled
      || mail.mailboxes_skipped !== mail.mailboxes_total - mail.mailboxes_enabled
      || mail.total_new_events + mail.total_duplicates !== mail.total_events) {
    fail("mail_capture_result_inconsistent");
  }
  return mail;
}

function validateCaptureReceipt(raw) {
  const receipt = plainRecord(raw, "mail_capture_receipt_invalid");
  assertBodyFree(receipt);
  for (const key of Object.keys(receipt)) {
    if (!CONTINUOUS_TOP_LEVEL_FIELDS.has(key)) fail("mail_capture_receipt_unknown_field", key);
  }
  if (!CONTINUOUS_SCHEMAS.includes(receipt.schema_version)
      || (receipt.status !== "ok" && receipt.status !== "degraded")
      || typeof receipt.run_id !== "string" || !SAFE_RUN_ID.test(receipt.run_id)
      || receipt.mail_fetched !== true || receipt.source_deleted !== false
      || receipt.source_overwritten !== false || receipt.erp_written !== false
      || receipt.mcp_written !== false || receipt.project_promoted !== false) {
    fail("mail_capture_receipt_not_accepted");
  }
  validateMailResult(receipt.mail);
  const started = assertClock(receipt.started_at, "started_at");
  const completed = assertClock(receipt.completed_at, "completed_at");
  if (completed < started) fail("mail_capture_receipt_clock_order_invalid");
  return { receipt, started, completed };
}

function validateStoreReceipt(raw) {
  const receipt = plainRecord(raw, "mail_store_receipt_invalid");
  assertBodyFree(receipt);
  assertExactKeys(receipt, STORE_FIELDS, "mail_store_receipt_shape_invalid");
  if (receipt.schema_version !== STORE_RECEIPT_SCHEMA
      || receipt.lane !== "store_mail_events"
      || receipt.validation_scope !== "mail_event_tail_set_validity"
      || receipt.status !== "ok" || receipt.last_success_at !== receipt.completed_at
      || !Array.isArray(receipt.error_codes) || receipt.error_codes.length !== 0
      || (receipt.activity_changed !== null && typeof receipt.activity_changed !== "boolean")
      || !Number.isSafeInteger(receipt.validated_count) || receipt.validated_count < 1
      || typeof receipt.validation_digest !== "string"
      || !SHA256_HEX.test(receipt.validation_digest)) {
    fail("mail_store_receipt_not_accepted");
  }
  const attempted = assertClock(receipt.attempted_at, "attempted_at");
  const completed = assertClock(receipt.completed_at, "completed_at");
  assertClock(receipt.last_success_at, "last_success_at");
  if (completed < attempted) fail("mail_store_receipt_clock_order_invalid");
  return { receipt, attempted, completed };
}

function digestRef(prefix, digest) {
  return `${prefix}.${digest.slice("sha256:".length)}`;
}

export function adaptAcceptedMailCaptureToLaneRecord({
  source_ref,
  project_scope_ref,
  expected_project_scope_ref,
  generation_seq,
  capture_receipt,
  capture_receipt_digest,
  store_receipt,
  store_receipt_digest,
  evaluation_time,
  max_receipt_age_seconds,
} = {}) {
  if (source_ref !== MAIL_SOURCE_REF) fail("foreign_mail_source", String(source_ref));
  if (typeof project_scope_ref !== "string" || !SAFE_SCOPE_REF.test(project_scope_ref)
      || project_scope_ref.startsWith("hold:")
      || typeof expected_project_scope_ref !== "string"
      || project_scope_ref !== expected_project_scope_ref) {
    fail("foreign_mail_project_scope");
  }
  if (!Number.isSafeInteger(generation_seq) || generation_seq < 1) {
    fail("mail_capture_generation_seq_invalid");
  }
  if (!Number.isSafeInteger(max_receipt_age_seconds) || max_receipt_age_seconds < 1) {
    fail("mail_capture_freshness_horizon_invalid");
  }

  const capture = validateCaptureReceipt(capture_receipt);
  const store = validateStoreReceipt(store_receipt);
  assertReceiptDigest(capture_receipt_digest, capture.receipt, "capture_receipt_digest");
  assertReceiptDigest(store_receipt_digest, store.receipt, "store_receipt_digest");

  if (capture.started !== store.attempted || capture.completed !== store.completed) {
    fail("mail_capture_store_receipt_unbound");
  }
  const evaluated = assertClock(evaluation_time, "evaluation_time");
  if (capture.completed > evaluated) fail("mail_capture_receipt_clock_in_future");
  if (evaluated - capture.completed > max_receipt_age_seconds * 1000) {
    fail("mail_capture_receipt_stale");
  }

  // Canonicalization is repeated before constructing refs so a getter,
  // unsupported value, or post-validation mutation cannot silently create a
  // reference to different receipt bytes.
  canonicalJson(capture.receipt);
  canonicalJson(store.receipt);
  return validateLaneRecord({
    record_kind: "capture_generation",
    source_ref: MAIL_SOURCE_REF,
    generation_seq,
    capture_ref: digestRef("receipt.mail.capture", capture_receipt_digest),
    manifest_ref: digestRef("receipt.mail.store", store_receipt_digest),
    item_count: store.receipt.validated_count,
    content_digest: `sha256:${store.receipt.validation_digest}`,
    captured_at: store.receipt.completed_at,
    immutable: true,
  });
}
