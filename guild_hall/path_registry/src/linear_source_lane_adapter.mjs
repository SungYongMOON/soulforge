// Pure Linear collection run receipt -> source-lane capture adapter.
//
// The adapter consumes only the refs-only run receipt the Linear collection
// lane persists under its private state root. It performs no provider call,
// credential lookup, or filesystem operation. Its single output is one
// `capture_generation` record for `source.linear`; backup pointers, restore
// tests, retention, RPO, and human acceptance remain structurally outside.

import {
  observedObjectTotal,
  validateLinearCollectRunReceipt,
} from "../../linear_history/linear_collect_receipt.mjs";
import {
  canonicalJson,
  sha256Canonical,
} from "../../shared/project_history_envelope.mjs";

import { validateLaneRecord } from "./source_lane_index.mjs";

const LINEAR_SOURCE_REF = "source.linear";
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const URL_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

function fail(code) {
  // Errors cross a public-safe contract. Never echo caller-owned field names,
  // source values, refs, paths, or secret-shaped strings.
  const error = new Error(code);
  error.code = code;
  throw error;
}

function canonicalCopy(value) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    fail("linear_receipt_canonicalization_failed");
  }
  return null;
}

function assertClock(value, code) {
  if (typeof value !== "string" || !ISO.test(value)) fail(code);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(code);
  return timestamp;
}

function digestRef(prefix, digest) {
  return `${prefix}.${digest.slice("sha256:".length)}`;
}

export function adaptAcceptedLinearCaptureToLaneRecord({
  source_ref,
  expected_lane_id,
  expected_workspace_url_key,
  generation_seq,
  run_receipt,
  run_receipt_digest,
  evaluation_time,
  max_receipt_age_seconds,
} = {}) {
  if (source_ref !== LINEAR_SOURCE_REF) fail("foreign_linear_source");
  if (typeof expected_lane_id !== "string" || !SAFE_REF.test(expected_lane_id)
      || typeof expected_workspace_url_key !== "string"
      || !URL_KEY.test(expected_workspace_url_key)) {
    fail("linear_expected_scope_invalid");
  }
  if (!Number.isSafeInteger(generation_seq) || generation_seq < 1) {
    fail("linear_capture_generation_seq_invalid");
  }
  if (!Number.isSafeInteger(max_receipt_age_seconds) || max_receipt_age_seconds < 1) {
    fail("linear_capture_freshness_horizon_invalid");
  }
  if (run_receipt === null || typeof run_receipt !== "object" || Array.isArray(run_receipt)) {
    fail("linear_run_receipt_invalid");
  }
  const receipt = canonicalCopy(run_receipt);
  try {
    validateLinearCollectRunReceipt(receipt);
  } catch {
    fail("linear_run_receipt_not_accepted");
  }
  if (receipt.status !== "ok" || receipt.mode !== "apply" || receipt.repository_writes !== 0) {
    fail("linear_run_receipt_not_accepted");
  }
  if (receipt.lane_id !== expected_lane_id) fail("foreign_linear_lane");
  if (receipt.workspace_url_key !== expected_workspace_url_key) fail("foreign_linear_workspace");
  if (receipt.generation_seq !== generation_seq) fail("linear_capture_generation_seq_mismatch");
  if (typeof run_receipt_digest !== "string" || !SHA256.test(run_receipt_digest)) {
    fail("linear_run_receipt_digest_invalid");
  }
  if (run_receipt_digest !== sha256Canonical(receipt)) fail("linear_run_receipt_digest_mismatch");

  const completed = assertClock(receipt.completed_at, "linear_capture_clock_invalid");
  const captured = assertClock(receipt.window.upper, "linear_capture_clock_invalid");
  const evaluated = assertClock(evaluation_time, "linear_evaluation_clock_invalid");
  if (completed > evaluated || captured > evaluated) fail("linear_capture_receipt_clock_in_future");
  if (evaluated - completed > max_receipt_age_seconds * 1000) fail("linear_capture_receipt_stale");

  return validateLaneRecord({
    record_kind: "capture_generation",
    source_ref: LINEAR_SOURCE_REF,
    generation_seq,
    capture_ref: digestRef("receipt.linear.run", run_receipt_digest),
    manifest_ref: digestRef("receipt.linear.custody", receipt.custody_manifest_digest),
    item_count: observedObjectTotal(receipt),
    content_digest: receipt.custody_manifest_digest,
    captured_at: receipt.window.upper,
    immutable: true,
  });
}
