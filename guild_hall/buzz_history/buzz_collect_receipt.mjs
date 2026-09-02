// Buzz collection run receipt contract (Tributary).
//
// One receipt is written per collection run under `<state_root>/receipts/`.
// It is refs-only and body-free: counts, cursors, digests, operation counts
// and gap codes. Event content, encrypted wrapper bytes, public keys,
// signatures, community signing keys and host-local paths never enter it. The
// path_registry Buzz source-lane adapter consumes exactly this shape to derive
// a `capture_generation` record, so the validator lives here (owner side) and
// is imported by both the runner and the adapter.

import { canonicalJson, sha256Canonical } from "../shared/project_history_envelope.mjs";

export const BUZZ_COLLECT_RUN_RECEIPT_SCHEMA_VERSION = "soulforge.buzz_collect.run_receipt.v1";
export const BUZZ_COLLECT_CURSOR_SCHEMA_VERSION = "soulforge.buzz_collect.cursor.v1";
// Two read operations only: the loopback liveness probe and the single
// read-only export process. There is no third channel into the relay.
export const BUZZ_READ_OPERATIONS = Object.freeze([
  "buzz.read.liveness",
  "buzz.read.export",
]);
export const BUZZ_COLLECT_OBJECT_KINDS = Object.freeze([
  "events",
  "tombstones",
  "audit",
  "snapshots",
]);
export const BUZZ_COLLECT_EXPORT_DIGEST_KINDS = Object.freeze([
  "events",
  "tombstones",
  "audit",
  "snapshot",
]);
export const BUZZ_COLLECT_COVERAGE_GAPS = Object.freeze([
  "row_limit_reached",
  "export_truncated",
  "polling_cannot_prove_hard_deletes",
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
  "relay_key",
  "community_count",
  "started_at",
  "completed_at",
  "duration_ms",
  "window",
  "cursor_before",
  "cursor_after",
  "read_calls",
  "process_calls",
  "objects",
  "export_digests",
  "custody_manifest_digest",
  "coverage_gaps",
  "error_codes",
  "repository_writes",
  "private_writes",
  "network_used",
]);
const WINDOW_FIELDS = Object.freeze(["received_since", "deleted_since", "audit_seq_min", "phase"]);
const CURSOR_FIELDS = Object.freeze([
  "schema_version",
  "received_watermark",
  "deleted_watermark",
  "audit_seq_max",
  "generation_seq",
]);
const READ_CALL_FIELDS = Object.freeze(["total", "by_operation"]);
const OBJECT_COUNT_FIELDS = Object.freeze(["observed", "created", "unchanged"]);

// Node clocks only ever emit millisecond precision; PostgreSQL `received_at`
// and `deleted_at` carry up to microseconds, so watermarks and window bounds
// accept 1-6 fractional digits while the lane's own timestamps stay strict.
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ISO_US = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/u;
const ISO_US_PARTS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{1,6})Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/u;
const RELAY_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
const FORBIDDEN_KEY = /(?:^|_)(?:access_token|api_key|authorization|body|bytes|content|cookie|credential|description|email|local_path|nsec|password|path|payload|private_key|prompt|pubkey|raw_body|raw_event|refresh_token|secret|sig|signing_key|tags|title|token|transcript)(?:_|$)/iu;
// Nostr private keys (`nsec1…`, bech32 charset), JWT-shaped bearer material
// and the token shapes the neighbouring lanes already refuse.
const TOKEN_VALUE = /^(?:nsec1[02-9ac-hj-np-z]{20,}|lin_(?:api|oauth)_|(?:xox[abprs]|xapp)-|eyJ[A-Za-z0-9_-]{8,}\.|Bearer\s)/u;

export class BuzzCollectReceiptError extends Error {
  constructor(code, target) {
    super(`${code} at ${target}`);
    this.name = "BuzzCollectReceiptError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target) {
  throw new BuzzCollectReceiptError(code, target);
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
  if (typeof value !== "string" || !ISO_MS.test(value) || new Date(value).toISOString() !== value) {
    fail("receipt_clock_invalid", target);
  }
  return Date.parse(value);
}

// Relay-sourced instants keep their sub-millisecond digits verbatim so a
// watermark can be handed back to PostgreSQL without losing rows to rounding.
// Comparability only needs the millisecond prefix to be a real instant.
export function assertRelayIso(value, target, failWith = fail) {
  if (typeof value !== "string" || !ISO_US.test(value)) failWith("receipt_clock_invalid", target);
  const parts = ISO_US_PARTS.exec(value);
  if (parts === null) failWith("receipt_clock_invalid", target);
  const milliseconds = `${parts[1]}.${parts[2].padEnd(3, "0").slice(0, 3)}Z`;
  if (new Date(milliseconds).toISOString() !== milliseconds) failWith("receipt_clock_invalid", target);
  return Date.parse(milliseconds);
}

function assertNonnegativeInteger(value, target) {
  if (!Number.isSafeInteger(value) || value < 0) fail("receipt_count_invalid", target);
  return value;
}

function assertSafeRef(value, target) {
  if (typeof value !== "string" || !SAFE_REF.test(value)) fail("receipt_ref_invalid", target);
  return value;
}

export function validateBuzzCollectCursor(cursor, target = "$cursor") {
  exactKeys(cursor, CURSOR_FIELDS, target);
  if (cursor.schema_version !== BUZZ_COLLECT_CURSOR_SCHEMA_VERSION) {
    fail("cursor_schema_invalid", `${target}.schema_version`);
  }
  if (cursor.received_watermark !== null) {
    assertRelayIso(cursor.received_watermark, `${target}.received_watermark`);
  }
  if (cursor.deleted_watermark !== null) {
    assertRelayIso(cursor.deleted_watermark, `${target}.deleted_watermark`);
  }
  plainRecord(cursor.audit_seq_max, `${target}.audit_seq_max`);
  const communities = Object.keys(cursor.audit_seq_max);
  if (communities.length > 4096) fail("cursor_audit_seq_invalid", `${target}.audit_seq_max`);
  for (const community of communities) {
    if (!UUID.test(community)) fail("cursor_audit_seq_invalid", `${target}.audit_seq_max`);
    assertNonnegativeInteger(cursor.audit_seq_max[community], `${target}.audit_seq_max.${community}`);
  }
  assertNonnegativeInteger(cursor.generation_seq, `${target}.generation_seq`);
  return cursor;
}

export function validateBuzzCollectRunReceipt(receipt) {
  exactKeys(receipt, RECEIPT_FIELDS, "$receipt");
  inspectSafeValue(receipt, "$receipt");
  if (receipt.schema_version !== BUZZ_COLLECT_RUN_RECEIPT_SCHEMA_VERSION) {
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
  if (typeof receipt.relay_key !== "string" || !RELAY_KEY.test(receipt.relay_key)) {
    fail("receipt_relay_invalid", "$receipt.relay_key");
  }
  if (receipt.community_count !== null) {
    assertNonnegativeInteger(receipt.community_count, "$receipt.community_count");
  }
  const started = assertIso(receipt.started_at, "$receipt.started_at");
  const completed = assertIso(receipt.completed_at, "$receipt.completed_at");
  if (completed < started) fail("receipt_clock_order_invalid", "$receipt.completed_at");
  if (receipt.duration_ms !== completed - started) fail("receipt_duration_invalid", "$receipt.duration_ms");
  exactKeys(receipt.window, WINDOW_FIELDS, "$receipt.window");
  if (receipt.window.received_since !== null) {
    assertRelayIso(receipt.window.received_since, "$receipt.window.received_since");
  }
  if (receipt.window.deleted_since !== null) {
    assertRelayIso(receipt.window.deleted_since, "$receipt.window.deleted_since");
  }
  assertNonnegativeInteger(receipt.window.audit_seq_min, "$receipt.window.audit_seq_min");
  if (!["initial", "delta"].includes(receipt.window.phase)) {
    fail("receipt_window_invalid", "$receipt.window.phase");
  }
  // An `initial` phase has no lower bound to resume from; a `delta` phase must
  // carry the received lower bound it resumed from, so a receipt cannot claim
  // a bounded delta while having read from the beginning of the relay.
  if ((receipt.window.phase === "initial") !== (receipt.window.received_since === null)) {
    fail("receipt_window_phase_inconsistent", "$receipt.window.phase");
  }
  validateBuzzCollectCursor(receipt.cursor_before, "$receipt.cursor_before");
  validateBuzzCollectCursor(receipt.cursor_after, "$receipt.cursor_after");
  exactKeys(receipt.read_calls, READ_CALL_FIELDS, "$receipt.read_calls");
  assertNonnegativeInteger(receipt.read_calls.total, "$receipt.read_calls.total");
  exactKeys(receipt.read_calls.by_operation, BUZZ_READ_OPERATIONS, "$receipt.read_calls.by_operation");
  let operationTotal = 0;
  for (const operation of BUZZ_READ_OPERATIONS) {
    operationTotal += assertNonnegativeInteger(
      receipt.read_calls.by_operation[operation],
      `$receipt.read_calls.by_operation.${operation}`,
    );
  }
  if (operationTotal !== receipt.read_calls.total) fail("receipt_read_calls_inconsistent", "$receipt.read_calls");
  // Every export is exactly one spawned process, so the count of export reads
  // can never exceed the number of processes the run actually started.
  assertNonnegativeInteger(receipt.process_calls, "$receipt.process_calls");
  if (receipt.read_calls.by_operation["buzz.read.export"] > receipt.process_calls) {
    fail("receipt_process_calls_inconsistent", "$receipt.process_calls");
  }
  exactKeys(receipt.objects, BUZZ_COLLECT_OBJECT_KINDS, "$receipt.objects");
  for (const kind of BUZZ_COLLECT_OBJECT_KINDS) {
    const target = `$receipt.objects.${kind}`;
    exactKeys(receipt.objects[kind], OBJECT_COUNT_FIELDS, target);
    const observed = assertNonnegativeInteger(receipt.objects[kind].observed, `${target}.observed`);
    const created = assertNonnegativeInteger(receipt.objects[kind].created, `${target}.created`);
    const unchanged = assertNonnegativeInteger(receipt.objects[kind].unchanged, `${target}.unchanged`);
    if (created + unchanged !== observed) fail("receipt_object_counts_inconsistent", target);
  }
  exactKeys(receipt.export_digests, BUZZ_COLLECT_EXPORT_DIGEST_KINDS, "$receipt.export_digests");
  for (const kind of BUZZ_COLLECT_EXPORT_DIGEST_KINDS) {
    const value = receipt.export_digests[kind];
    if (typeof value !== "string" || !SHA256.test(value)) {
      fail("receipt_digest_invalid", `$receipt.export_digests.${kind}`);
    }
  }
  if (typeof receipt.custody_manifest_digest !== "string" || !SHA256.test(receipt.custody_manifest_digest)) {
    fail("receipt_digest_invalid", "$receipt.custody_manifest_digest");
  }
  for (const [field, allowed] of [
    ["coverage_gaps", new Set(BUZZ_COLLECT_COVERAGE_GAPS)],
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
  // The relay is reached over loopback through a local process, never over a
  // network the lane could exfiltrate through: the flag is fixed false.
  if (receipt.network_used !== false) fail("receipt_network_flag_invalid", "$receipt.network_used");
  canonicalJson(receipt);
  return receipt;
}

export function digestBuzzCollectRunReceipt(receipt) {
  validateBuzzCollectRunReceipt(receipt);
  return sha256Canonical(receipt);
}

// Snapshots are one rolled-up relay-shape object per run, not per-item
// custody, so they stay out of the lane-record item count exactly like the
// Linear lane keeps its derived read-evidence out of its own.
export function observedObjectTotal(receipt) {
  return BUZZ_COLLECT_OBJECT_KINDS
    .filter((kind) => kind !== "snapshots")
    .reduce((total, kind) => total + receipt.objects[kind].observed, 0);
}
