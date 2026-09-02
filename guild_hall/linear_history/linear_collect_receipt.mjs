// Linear collection run receipt contract.
//
// One receipt is written per collection run under `<state_root>/receipts/`.
// It is refs-only and body-free: counts, cursors, digests, operation counts
// and gap codes. Issue titles, descriptions, comment bodies, e-mail addresses,
// secrets and host-local paths never enter it. The path_registry Linear
// source-lane adapter consumes exactly this shape to derive a
// `capture_generation` record, so the validator lives here (owner side) and
// is imported by both the runner and the adapter.

import { canonicalJson, sha256Canonical } from "../shared/project_history_envelope.mjs";

import { LINEAR_READ_OPERATIONS } from "./linear_graphql_client.mjs";

export const LINEAR_COLLECT_RUN_RECEIPT_SCHEMA_VERSION = "soulforge.linear_collect.run_receipt.v1";
export const LINEAR_COLLECT_CURSOR_SCHEMA_VERSION = "soulforge.linear_collect.cursor.v1";
export const LINEAR_COLLECT_OBJECT_KINDS = Object.freeze([
  "workspace",
  "teams",
  "users",
  "projects",
  "labels",
  "states",
  "cycles",
  "issues",
  "comments",
  "read_evidence",
]);
export const LINEAR_COLLECT_COVERAGE_GAPS = Object.freeze([
  "max_pages_continuation_pending",
  "backfill_stalled_window_advanced",
  "polling_cannot_prove_hard_deletes",
  "catalog_continuation_pending",
  "run_deadline_reached",
]);

const RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "lane_id",
  "run_id",
  "generation_seq",
  "mode",
  "status",
  "writer_authority_id",
  "writer_epoch",
  "binding_sha256",
  "workspace_url_key",
  "organization_id",
  "started_at",
  "completed_at",
  "duration_ms",
  "window",
  "cursor_before",
  "cursor_after",
  "read_calls",
  "objects",
  "custody_manifest_digest",
  "coverage_gaps",
  "error_codes",
  "repository_writes",
  "private_writes",
  "network_used",
]);
const WINDOW_FIELDS = Object.freeze(["lower", "upper", "phase", "order_observed"]);
const CURSOR_FIELDS = Object.freeze(["schema_version", "watermark", "backfill", "generation_seq"]);
const BACKFILL_FIELDS = Object.freeze(["lower", "upper", "resume_watermark", "stall_count"]);
const READ_CALL_FIELDS = Object.freeze(["total", "by_operation"]);
const OBJECT_COUNT_FIELDS = Object.freeze(["observed", "created", "unchanged"]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/u;
const URL_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:access_token|api_key|authorization|body|bytes|content|cookie|credential|description|email|local_path|password|path|payload|private_key|prompt|raw_body|raw_event|refresh_token|secret|title|token|transcript)(?:_|$)/iu;
const TOKEN_VALUE = /^(?:lin_(?:api|oauth)_|(?:xox[abprs]|xapp)-|eyJ[A-Za-z0-9_-]{8,}\.|Bearer\s)/u;

export class LinearCollectReceiptError extends Error {
  constructor(code, target) {
    super(`${code} at ${target}`);
    this.name = "LinearCollectReceiptError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target) {
  throw new LinearCollectReceiptError(code, target);
}

function plainRecord(value, target) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("receipt_plain_object_required", target);
  }
  return value;
}

function exactKeys(value, fields, target) {
  plainRecord(value, target);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    fail("receipt_exact_keys_required", target);
  }
  return value;
}

function isAbsolutePathLike(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function inspectSafeValue(value, target, seen = new Set()) {
  if (typeof value === "string") {
    if (isAbsolutePathLike(value)) fail("receipt_absolute_path_forbidden", target);
    if (TOKEN_VALUE.test(value)) fail("receipt_secret_value_forbidden", target);
    return;
  }
  if (value === null || ["boolean", "number"].includes(typeof value)) return;
  if (typeof value !== "object") fail("receipt_value_invalid", target);
  if (seen.has(value)) fail("receipt_cycle_forbidden", target);
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("receipt_key_invalid", target);
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      fail("receipt_descriptor_forbidden", target);
    }
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
    if (FORBIDDEN_KEY.test(normalizedKey)) fail("receipt_forbidden_field", target);
    inspectSafeValue(descriptor.value, `${target}.${key}`, seen);
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    fail("receipt_record_invalid", target);
  }
  seen.delete(value);
}

function assertIso(value, target) {
  if (typeof value !== "string" || !ISO.test(value) || new Date(value).toISOString() !== value) {
    fail("receipt_clock_invalid", target);
  }
  return Date.parse(value);
}

function assertNonnegativeInteger(value, target) {
  if (!Number.isSafeInteger(value) || value < 0) fail("receipt_count_invalid", target);
  return value;
}

function assertSafeRef(value, target) {
  if (typeof value !== "string" || !SAFE_REF.test(value)) fail("receipt_ref_invalid", target);
  return value;
}

export function validateLinearCollectCursor(cursor, target = "$cursor") {
  exactKeys(cursor, CURSOR_FIELDS, target);
  if (cursor.schema_version !== LINEAR_COLLECT_CURSOR_SCHEMA_VERSION) {
    fail("cursor_schema_invalid", `${target}.schema_version`);
  }
  if (cursor.watermark !== null) assertIso(cursor.watermark, `${target}.watermark`);
  if (cursor.backfill !== null) {
    exactKeys(cursor.backfill, BACKFILL_FIELDS, `${target}.backfill`);
    const lower = assertIso(cursor.backfill.lower, `${target}.backfill.lower`);
    const upper = assertIso(cursor.backfill.upper, `${target}.backfill.upper`);
    if (lower > upper) fail("cursor_backfill_window_invalid", `${target}.backfill`);
    const resume = assertIso(cursor.backfill.resume_watermark, `${target}.backfill.resume_watermark`);
    if (resume < upper) fail("cursor_backfill_window_invalid", `${target}.backfill.resume_watermark`);
    assertNonnegativeInteger(cursor.backfill.stall_count, `${target}.backfill.stall_count`);
  }
  assertNonnegativeInteger(cursor.generation_seq, `${target}.generation_seq`);
  return cursor;
}

export function validateLinearCollectRunReceipt(receipt) {
  exactKeys(receipt, RECEIPT_FIELDS, "$receipt");
  inspectSafeValue(receipt, "$receipt");
  if (receipt.schema_version !== LINEAR_COLLECT_RUN_RECEIPT_SCHEMA_VERSION) {
    fail("receipt_schema_invalid", "$receipt.schema_version");
  }
  assertSafeRef(receipt.lane_id, "$receipt.lane_id");
  if (typeof receipt.run_id !== "string" || !RUN_ID.test(receipt.run_id)) {
    fail("receipt_run_id_invalid", "$receipt.run_id");
  }
  assertNonnegativeInteger(receipt.generation_seq, "$receipt.generation_seq");
  if (receipt.mode !== "apply") fail("receipt_mode_invalid", "$receipt.mode");
  if (!["ok", "error"].includes(receipt.status)) fail("receipt_status_invalid", "$receipt.status");
  assertSafeRef(receipt.writer_authority_id, "$receipt.writer_authority_id");
  if (!Number.isSafeInteger(receipt.writer_epoch) || receipt.writer_epoch < 1) {
    fail("receipt_writer_epoch_invalid", "$receipt.writer_epoch");
  }
  if (typeof receipt.binding_sha256 !== "string" || !SHA256.test(receipt.binding_sha256)) {
    fail("receipt_digest_invalid", "$receipt.binding_sha256");
  }
  if (typeof receipt.workspace_url_key !== "string" || !URL_KEY.test(receipt.workspace_url_key)) {
    fail("receipt_workspace_invalid", "$receipt.workspace_url_key");
  }
  if (receipt.organization_id !== null
    && (typeof receipt.organization_id !== "string" || !UUID.test(receipt.organization_id))) {
    fail("receipt_workspace_invalid", "$receipt.organization_id");
  }
  const started = assertIso(receipt.started_at, "$receipt.started_at");
  const completed = assertIso(receipt.completed_at, "$receipt.completed_at");
  if (completed < started) fail("receipt_clock_order_invalid", "$receipt.completed_at");
  if (receipt.duration_ms !== completed - started) fail("receipt_duration_invalid", "$receipt.duration_ms");
  exactKeys(receipt.window, WINDOW_FIELDS, "$receipt.window");
  const lower = assertIso(receipt.window.lower, "$receipt.window.lower");
  const upper = assertIso(receipt.window.upper, "$receipt.window.upper");
  if (lower > upper) fail("receipt_window_invalid", "$receipt.window");
  if (!["delta", "backfill"].includes(receipt.window.phase)) fail("receipt_window_invalid", "$receipt.window.phase");
  if (![null, "ascending", "descending", "unknown"].includes(receipt.window.order_observed)) {
    fail("receipt_window_invalid", "$receipt.window.order_observed");
  }
  validateLinearCollectCursor(receipt.cursor_before, "$receipt.cursor_before");
  validateLinearCollectCursor(receipt.cursor_after, "$receipt.cursor_after");
  exactKeys(receipt.read_calls, READ_CALL_FIELDS, "$receipt.read_calls");
  assertNonnegativeInteger(receipt.read_calls.total, "$receipt.read_calls.total");
  exactKeys(receipt.read_calls.by_operation, LINEAR_READ_OPERATIONS, "$receipt.read_calls.by_operation");
  let operationTotal = 0;
  for (const operation of LINEAR_READ_OPERATIONS) {
    operationTotal += assertNonnegativeInteger(
      receipt.read_calls.by_operation[operation],
      `$receipt.read_calls.by_operation.${operation}`,
    );
  }
  if (operationTotal !== receipt.read_calls.total) fail("receipt_read_calls_inconsistent", "$receipt.read_calls");
  exactKeys(receipt.objects, LINEAR_COLLECT_OBJECT_KINDS, "$receipt.objects");
  for (const kind of LINEAR_COLLECT_OBJECT_KINDS) {
    const target = `$receipt.objects.${kind}`;
    exactKeys(receipt.objects[kind], OBJECT_COUNT_FIELDS, target);
    const observed = assertNonnegativeInteger(receipt.objects[kind].observed, `${target}.observed`);
    const created = assertNonnegativeInteger(receipt.objects[kind].created, `${target}.created`);
    const unchanged = assertNonnegativeInteger(receipt.objects[kind].unchanged, `${target}.unchanged`);
    if (created + unchanged !== observed) fail("receipt_object_counts_inconsistent", target);
  }
  if (typeof receipt.custody_manifest_digest !== "string" || !SHA256.test(receipt.custody_manifest_digest)) {
    fail("receipt_digest_invalid", "$receipt.custody_manifest_digest");
  }
  for (const [field, allowed] of [
    ["coverage_gaps", new Set(LINEAR_COLLECT_COVERAGE_GAPS)],
    ["error_codes", null],
  ]) {
    const values = receipt[field];
    if (!Array.isArray(values) || Object.keys(values).length !== values.length) {
      fail("receipt_code_list_invalid", `$receipt.${field}`);
    }
    values.forEach((value, index) => {
      if (typeof value !== "string" || !SAFE_CODE.test(value) || (allowed !== null && !allowed.has(value))) {
        fail("receipt_code_list_invalid", `$receipt.${field}[${index}]`);
      }
      if (index > 0 && values[index - 1].localeCompare(value) >= 0) {
        fail("receipt_code_list_invalid", `$receipt.${field}`);
      }
    });
  }
  if (receipt.status === "ok" && receipt.error_codes.length !== 0) {
    fail("receipt_status_inconsistent", "$receipt.error_codes");
  }
  if (receipt.repository_writes !== 0) fail("receipt_repository_writes_forbidden", "$receipt.repository_writes");
  assertNonnegativeInteger(receipt.private_writes, "$receipt.private_writes");
  if (typeof receipt.network_used !== "boolean") fail("receipt_network_flag_invalid", "$receipt.network_used");
  canonicalJson(receipt);
  return receipt;
}

export function digestLinearCollectRunReceipt(receipt) {
  validateLinearCollectRunReceipt(receipt);
  return sha256Canonical(receipt);
}

export function observedObjectTotal(receipt) {
  return LINEAR_COLLECT_OBJECT_KINDS
    .filter((kind) => kind !== "read_evidence")
    .reduce((total, kind) => total + receipt.objects[kind].observed, 0);
}
