// Pure Slack coverage/custody receipt -> source-lane capture adapter.
//
// The adapter consumes only existing body-free receipts. It performs no
// provider call, credential lookup, or filesystem operation. Its single
// output is a `capture_generation`; backup, restore, retention, RPO, and
// human-acceptance evidence remain structurally outside this module.

import {
  canonicalJson,
  sha256Canonical,
} from "../../shared/project_history_envelope.mjs";
import {
  validateSlackBackfillCursor,
  validateSlackCoverageReceipt,
} from "../../slack_history/slack_history.mjs";

import { validateLaneRecord } from "./source_lane_index.mjs";

const SLACK_SOURCE_REF = "source.slack";
const ACCEPTED_COVERAGE_STATES = new Set([
  "complete_with_events",
  "complete_no_events",
]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_SCOPE_REF = /^[a-z][a-z0-9_.:/-]{1,160}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const WORKSPACE_ID = /^T[A-Z0-9]{2,31}$/u;
const CHANNEL_ID = /^[CGD][A-Z0-9]{2,31}$/u;
const PROJECT_CODE = /^[A-Z0-9][A-Z0-9_-]{1,63}$/u;
const TOKEN_VALUE = /^(?:(?:xox[abprs]|xapp)-|eyJ[A-Za-z0-9_-]{8,}\.)/u;
const FORBIDDEN_KEY = /(?:^|_)(?:access_token|api_key|authorization|body|bytes|content|cookie|credential|local_path|password|path|payload|private_key|prompt|raw_body|raw_event|raw_message|refresh_token|secret|token|transcript)(?:_|$)/iu;
const CUSTODY_FIELDS = Object.freeze(["raw_digest", "raw_ref", "source_refs"]);

function fail(code) {
  // Errors cross a public-safe contract. Never echo caller-owned field names,
  // source values, refs, paths, or secret-shaped strings.
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isAbsolutePathLike(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function inspectSafeValue(value, seen = new Set()) {
  if (typeof value === "string") {
    if (isAbsolutePathLike(value)) fail("slack_receipt_absolute_path_forbidden");
    if (TOKEN_VALUE.test(value)) fail("slack_receipt_secret_value_forbidden");
    return;
  }
  if (value === null || ["boolean", "number"].includes(typeof value)) return;
  if (typeof value !== "object") fail("slack_receipt_value_invalid");
  if (seen.has(value)) fail("slack_receipt_cycle_forbidden");
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("slack_receipt_key_invalid");
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      fail("slack_receipt_descriptor_forbidden");
    }
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
    if (!(["raw_digest", "raw_ref", "raw_payload_copied"].includes(normalizedKey))
        && FORBIDDEN_KEY.test(normalizedKey)) {
      fail("slack_receipt_forbidden_field");
    }
    inspectSafeValue(descriptor.value, seen);
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    fail("slack_receipt_record_invalid");
  }
  seen.delete(value);
}

function canonicalCopy(value) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    fail("slack_receipt_canonicalization_failed");
  }
}

function assertDigest(value, expected, invalidCode, mismatchCode) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(invalidCode);
  if (value !== expected) fail(mismatchCode);
}

function assertClock(value, code) {
  if (typeof value !== "string" || !ISO.test(value)) fail(code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(code);
  return timestamp;
}

function assertExactKeys(record, expected, code) {
  if (record === null || typeof record !== "object" || Array.isArray(record)
      || Object.getPrototypeOf(record) !== Object.prototype) fail(code);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function validateCustodyReceipt(raw) {
  assertExactKeys(raw, CUSTODY_FIELDS, "slack_custody_receipt_shape_invalid");
  if (typeof raw.raw_digest !== "string" || !SHA256.test(raw.raw_digest)
      || raw.raw_ref !== `slack-raw:${raw.raw_digest.slice("sha256:".length)}`
      || !Array.isArray(raw.source_refs)
      || Object.keys(raw.source_refs).length !== raw.source_refs.length) {
    fail("slack_custody_receipt_not_accepted");
  }
  const sourceRefs = raw.source_refs;
  if (sourceRefs.some((ref) => typeof ref !== "string" || !SAFE_REF.test(ref))
      || new Set(sourceRefs).size !== sourceRefs.length
      || sourceRefs.some((ref, index) => index > 0 && sourceRefs[index - 1] >= ref)) {
    fail("slack_custody_receipt_not_accepted");
  }
  return raw;
}

function validateCustodyManifest(raw, deliveryEvidence) {
  if (!Array.isArray(raw) || Object.keys(raw).length !== raw.length) {
    fail("slack_custody_manifest_invalid");
  }
  const receipts = raw.map(validateCustodyReceipt);
  if (receipts.length !== deliveryEvidence.length) fail("slack_custody_count_mismatch");
  const digests = new Set();
  receipts.forEach((receipt, index) => {
    if (digests.has(receipt.raw_digest)) fail("slack_custody_receipt_duplicate");
    digests.add(receipt.raw_digest);
    if (index > 0 && receipts[index - 1].raw_digest >= receipt.raw_digest) {
      fail("slack_custody_manifest_not_canonical");
    }
  });
  const expectedEventRefs = new Set(
    deliveryEvidence.map((evidence) => `slack-event:${evidence.event_id}`),
  );
  const observedEventRefs = new Set();
  for (const receipt of receipts) {
    const eventRefs = receipt.source_refs.filter((ref) => ref.startsWith("slack-event:"));
    if (eventRefs.length !== 1) fail("slack_custody_delivery_binding_invalid");
    const [eventRef] = eventRefs;
    if (!expectedEventRefs.has(eventRef) || observedEventRefs.has(eventRef)) {
      fail("slack_custody_delivery_binding_invalid");
    }
    observedEventRefs.add(eventRef);
  }
  if (observedEventRefs.size !== expectedEventRefs.size) {
    fail("slack_custody_delivery_binding_invalid");
  }
  return receipts;
}

function digestRef(prefix, digest) {
  return `${prefix}.${digest.slice("sha256:".length)}`;
}

export function adaptAcceptedSlackCaptureToLaneRecord({
  source_ref,
  project_scope_ref,
  expected_project_scope_ref,
  expected_project_code,
  expected_workspace_id,
  expected_channel_id,
  expected_binding_id,
  generation_seq,
  capture_cursor,
  capture_cursor_digest,
  coverage_receipt,
  coverage_receipt_digest,
  custody_receipts,
  custody_manifest_digest,
  evaluation_time,
  max_receipt_age_seconds,
} = {}) {
  if (source_ref !== SLACK_SOURCE_REF) fail("foreign_slack_source");
  if (typeof project_scope_ref !== "string" || !SAFE_SCOPE_REF.test(project_scope_ref)
      || project_scope_ref.startsWith("hold:")
      || project_scope_ref !== expected_project_scope_ref) {
    fail("foreign_slack_project_scope");
  }
  if (typeof expected_project_code !== "string" || !PROJECT_CODE.test(expected_project_code)
      || typeof expected_workspace_id !== "string" || !WORKSPACE_ID.test(expected_workspace_id)
      || typeof expected_channel_id !== "string" || !CHANNEL_ID.test(expected_channel_id)
      || typeof expected_binding_id !== "string" || !SAFE_REF.test(expected_binding_id)) {
    fail("slack_expected_scope_invalid");
  }
  if (!Number.isSafeInteger(generation_seq) || generation_seq < 1) {
    fail("slack_capture_generation_seq_invalid");
  }
  if (!Number.isSafeInteger(max_receipt_age_seconds) || max_receipt_age_seconds < 1) {
    fail("slack_capture_freshness_horizon_invalid");
  }

  inspectSafeValue(coverage_receipt);
  inspectSafeValue(capture_cursor);
  inspectSafeValue(custody_receipts);
  const coverage = canonicalCopy(coverage_receipt);
  const cursor = canonicalCopy(capture_cursor);
  const custody = canonicalCopy(custody_receipts);
  try {
    validateSlackCoverageReceipt(coverage);
  } catch {
    fail("slack_coverage_receipt_not_accepted");
  }
  if (!ACCEPTED_COVERAGE_STATES.has(coverage.state)) {
    fail("slack_coverage_receipt_not_accepted");
  }
  try {
    validateSlackBackfillCursor(cursor);
  } catch {
    fail("slack_capture_cursor_not_accepted");
  }
  if (coverage.project_code !== expected_project_code
      || coverage.workspace_id !== expected_workspace_id
      || coverage.channel_id !== expected_channel_id
      || coverage.binding_id !== expected_binding_id
      || cursor.workspace_id !== expected_workspace_id
      || cursor.channel_id !== expected_channel_id
      || cursor.binding_id !== expected_binding_id) {
    fail("foreign_slack_capture_scope");
  }
  if (cursor.window_start !== coverage.window_start
      || cursor.window_end !== coverage.window_end
      || cursor.delivery_evidence.length !== coverage.event_count) {
    fail("slack_capture_cursor_coverage_unbound");
  }
  const cursorRevisionRefs = cursor.delivery_evidence
    .map((evidence) => evidence.revision_ref)
    .sort();
  if (canonicalJson(cursorRevisionRefs) !== canonicalJson(coverage.revision_refs)
      || cursor.generation_digest !== sha256Canonical(cursorRevisionRefs)) {
    fail("slack_capture_cursor_coverage_unbound");
  }
  assertDigest(
    capture_cursor_digest,
    sha256Canonical(cursor),
    "slack_capture_cursor_digest_invalid",
    "slack_capture_cursor_digest_mismatch",
  );
  assertDigest(
    coverage_receipt_digest,
    sha256Canonical(coverage),
    "slack_coverage_receipt_digest_invalid",
    "slack_coverage_receipt_digest_mismatch",
  );

  const custodyManifest = validateCustodyManifest(custody, cursor.delivery_evidence);
  const expectedCustodyDigest = sha256Canonical(custodyManifest);
  assertDigest(
    custody_manifest_digest,
    expectedCustodyDigest,
    "slack_custody_manifest_digest_invalid",
    "slack_custody_manifest_digest_mismatch",
  );

  const captured = assertClock(coverage.window_end, "slack_capture_clock_invalid");
  const evaluated = assertClock(evaluation_time, "slack_evaluation_clock_invalid");
  if (captured > evaluated) fail("slack_capture_receipt_clock_in_future");
  if (evaluated - captured > max_receipt_age_seconds * 1000) {
    fail("slack_capture_receipt_stale");
  }

  const contentDigest = sha256Canonical({
    binding_id: coverage.binding_id,
    channel_id: coverage.channel_id,
    coverage_metadata_digest: coverage.metadata_digest,
    cursor_digest: capture_cursor_digest,
    cursor_generation_digest: cursor.generation_digest,
    custody_manifest_digest: expectedCustodyDigest,
    event_count: coverage.event_count,
    ordered_revision_digest: coverage.ordered_revision_digest,
    project_code: coverage.project_code,
    window_end: coverage.window_end,
    workspace_id: coverage.workspace_id,
  });

  return validateLaneRecord({
    record_kind: "capture_generation",
    source_ref: SLACK_SOURCE_REF,
    generation_seq,
    capture_ref: digestRef("receipt.slack.coverage", coverage_receipt_digest),
    manifest_ref: digestRef("receipt.slack.custody", expectedCustodyDigest),
    item_count: coverage.event_count,
    content_digest: contentDigest,
    captured_at: coverage.window_end,
    immutable: true,
  });
}
