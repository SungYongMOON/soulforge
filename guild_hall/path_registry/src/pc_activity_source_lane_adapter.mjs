// Pure file-activity coverage receipt -> source-lane capture adapter.
//
// The input is the existing refs-only project-history coverage contract owned
// by `guild_hall/file_activity`. The receipt binds source owner, project,
// exact event count, window time, and ordered event digest in one native
// record. This module performs no filesystem/provider/credential operation and
// can emit only one `capture_generation`; backup, restore, retention, RPO, and
// human acceptance remain outside this boundary.

import {
  canonicalJson,
  sha256Canonical,
  validateProjectHistoryCoverageReceipt,
  validateTypedRef,
} from "../../shared/project_history_envelope.mjs";

import { validateLaneRecord } from "./source_lane_index.mjs";

const PC_ACTIVITY_SOURCE_REF = "source.pc_activity";
const FILE_ACTIVITY_OWNER = "file_activity";
const ACCEPTED_COVERAGE_STATES = new Set([
  "complete_with_events", "complete_no_events",
]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function fail(code) {
  // Stable, non-reflective errors keep caller-owned refs and paths out of
  // public receipts and logs.
  const error = new Error(code);
  error.code = code;
  throw error;
}

function canonicalCopy(value, code) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    fail(code);
  }
}

function assertClock(value, code) {
  if (typeof value !== "string" || !ISO.test(value)) fail(code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    fail(code);
  }
  return timestamp;
}

function assertReceiptDigest(value, receipt) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("pc_activity_coverage_receipt_digest_invalid");
  }
  if (value !== sha256Canonical(receipt)) {
    fail("pc_activity_coverage_receipt_digest_mismatch");
  }
}

function digestRef(prefix, digest) {
  return `${prefix}.${digest.slice("sha256:".length)}`;
}

export function adaptAcceptedPcActivityCoverageToLaneRecord({
  source_ref,
  expected_source_owner_ref,
  expected_project_ref,
  generation_seq,
  coverage_receipt,
  coverage_receipt_digest,
  envelopes,
  evaluation_time,
  max_receipt_age_seconds,
} = {}) {
  if (source_ref !== PC_ACTIVITY_SOURCE_REF) fail("foreign_pc_activity_source");
  if (!Number.isSafeInteger(generation_seq) || generation_seq < 1) {
    fail("pc_activity_capture_generation_seq_invalid");
  }
  if (!Number.isSafeInteger(max_receipt_age_seconds) || max_receipt_age_seconds < 1) {
    fail("pc_activity_capture_freshness_horizon_invalid");
  }

  const coverage = canonicalCopy(
    coverage_receipt,
    "pc_activity_coverage_receipt_value_invalid",
  );
  const boundedEnvelopes = canonicalCopy(
    envelopes,
    "pc_activity_coverage_envelopes_value_invalid",
  );
  const expectedSourceOwner = canonicalCopy(
    expected_source_owner_ref,
    "pc_activity_expected_source_owner_ref_invalid",
  );
  const expectedProject = canonicalCopy(
    expected_project_ref,
    "pc_activity_expected_project_ref_invalid",
  );

  try {
    validateTypedRef(expectedSourceOwner, "source_owner", "$expected_source_owner_ref");
    validateTypedRef(expectedProject, "project", "$expected_project_ref");
    validateProjectHistoryCoverageReceipt(coverage, boundedEnvelopes);
  } catch {
    fail("pc_activity_coverage_receipt_not_accepted");
  }
  if (coverage.lane !== "file"
      || coverage.source_owner_ref.owner_surface !== FILE_ACTIVITY_OWNER
      || canonicalJson(coverage.source_owner_ref) !== canonicalJson(expectedSourceOwner)
      || coverage.project_ref === null
      || canonicalJson(coverage.project_ref) !== canonicalJson(expectedProject)) {
    fail("foreign_pc_activity_coverage_scope");
  }
  if (!ACCEPTED_COVERAGE_STATES.has(coverage.state)) {
    fail("pc_activity_coverage_not_complete");
  }
  assertReceiptDigest(coverage_receipt_digest, coverage);

  const capturedAt = assertClock(coverage.window_end, "pc_activity_capture_clock_invalid");
  const evaluatedAt = assertClock(evaluation_time, "pc_activity_evaluation_clock_invalid");
  if (capturedAt > evaluatedAt) fail("pc_activity_coverage_clock_in_future");
  if (evaluatedAt - capturedAt > max_receipt_age_seconds * 1000) {
    fail("pc_activity_coverage_receipt_stale");
  }

  return validateLaneRecord({
    record_kind: "capture_generation",
    source_ref: PC_ACTIVITY_SOURCE_REF,
    generation_seq,
    capture_ref: digestRef("receipt.pc-activity.coverage", coverage_receipt_digest),
    manifest_ref: digestRef("manifest.pc-activity.event-set", coverage.ordered_event_digest),
    item_count: coverage.event_count,
    content_digest: coverage.ordered_event_digest,
    captured_at: coverage.window_end,
    immutable: true,
  });
}
