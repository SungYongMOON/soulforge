import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import {
  REPORT_AUTHORING_INPUT_SCHEMA_VERSION,
  REPORT_AUTHORING_RECEIPT_SCHEMA_REF,
  REPORT_AUTHORING_RECEIPT_VALIDATOR_REF,
  REPORT_AUTHORING_SOURCE_OWNER_REF,
  REPORT_AUTHORING_WORKFLOW_REF,
  RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION,
  adaptReportAuthoringReceipt,
  createRunHistoryCoverageEvidence,
  replayRunHistoryEvents,
  validateReportAuthoringRunEvent,
} from "./run_history.mjs";

const fixturePath = fileURLToPath(new URL("./fixtures/report_authoring_receipt.synthetic.json", import.meta.url));
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const receiptSchemaPath = fileURLToPath(new URL("../../.workflow/report_authoring_v0/contracts/workflow_receipt.v1.schema.json", import.meta.url));
const receiptSchema = JSON.parse(fs.readFileSync(receiptSchemaPath, "utf8"));
const PROJECT_REF = Object.freeze({
  entity_type: "project",
  owner_surface: "synthetic_project_registry",
  entity_id: "project:p01",
});
const COVERAGE_POLICY_REF = Object.freeze({
  entity_type: "rule_revision",
  owner_surface: "synthetic_d25_policy",
  entity_id: "rule:run_log:v1",
});
const APPLICABILITY_REF = Object.freeze({
  entity_type: "rule_revision",
  owner_surface: "synthetic_d25_policy",
  entity_id: "rule:run_log:not_applicable:v1",
});

function clone(value) {
  return structuredClone(value);
}

function input(receipt = fixture, overrides = {}) {
  return {
    schema_version: REPORT_AUTHORING_INPUT_SCHEMA_VERSION,
    feature_enabled: false,
    workflow_ref: REPORT_AUTHORING_WORKFLOW_REF,
    receipt_schema_ref: REPORT_AUTHORING_RECEIPT_SCHEMA_REF,
    receipt_validator_ref: REPORT_AUTHORING_RECEIPT_VALIDATOR_REF,
    receipt_ref: {
      entity_type: "workflow_receipt",
      owner_surface: "report_authoring_v0",
      entity_id: `receipt:${receipt.job_id}`,
    },
    event_ref: {
      entity_type: "event",
      owner_surface: "report_authoring_v0",
      entity_id: `receipt_event:${receipt.job_id}`,
    },
    receipt,
    project_ref: PROJECT_REF,
    observed_at: "2026-07-20T00:01:01.000Z",
    known_at: "2026-07-20T00:01:02.000Z",
    recorded_at: "2026-07-20T00:01:02.000Z",
    ...overrides,
  };
}

function coverage(state, events, overrides = {}) {
  const gapState = new Set(["partial", "failed", "not_collected"]).has(state);
  return createRunHistoryCoverageEvidence({
    schema_version: RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION,
    feature_enabled: false,
    coverage_policy_ref: COVERAGE_POLICY_REF,
    lane: "run_log",
    source_owner_ref: REPORT_AUTHORING_SOURCE_OWNER_REF,
    project_ref: PROJECT_REF,
    window_start: "2026-07-20T00:00:00.000Z",
    window_end: "2026-07-21T00:00:00.000Z",
    state,
    event_count: state === "complete_with_events" || state === "partial"
      ? events.length
      : state === "complete_no_events" ? 0 : null,
    gap_codes: gapState ? ["synthetic_run_gap"] : [],
    applicability_ref: state === "not_applicable" ? APPLICABILITY_REF : null,
    ...overrides,
  }, events);
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("exact report-authoring receipt becomes a feature-OFF typed run event bound to its full digest", () => {
  const event = adaptReportAuthoringReceipt(input());
  assert.equal(event.feature_enabled, false);
  assert.equal(event.job_id, fixture.job_id);
  assert.equal(event.full_receipt_digest, sha256Canonical(fixture));
  assert.deepEqual(event.envelope.native_occurrence_ref, {
    entity_type: "workflow_job",
    owner_surface: "report_authoring_v0",
    entity_id: `job:${fixture.job_id}`,
  });
  assert.deepEqual(event.envelope.content_ref, {
    entity_type: "content",
    owner_surface: "report_authoring_v0",
    entity_id: event.full_receipt_digest,
  });
  assert.equal(event.envelope.lane, "run_log");
  assert.equal(event.raw_payload_copied, false);
  assert.doesNotThrow(() => validateReportAuthoringRunEvent(event));
  assert.equal(Object.hasOwn(event, "receipt"), false);
});

test("fixture and adapter constants stay pinned to the exact report-authoring receipt schema", () => {
  assert.equal(receiptSchema.additionalProperties, false);
  assert.equal(receiptSchema.properties.schema.const, fixture.schema);
  assert.equal(receiptSchema.properties.workflow_id.const, fixture.workflow_id);
  assert.equal(receiptSchema.properties.binding_revision.const, fixture.binding_revision);
  assert.deepEqual([...receiptSchema.required].sort(), Object.keys(fixture).sort());
});

test("identical replay is a no-op and emits deterministic ordered dedupe evidence", () => {
  const event = adaptReportAuthoringReceipt(input());
  const first = replayRunHistoryEvents([], [event, clone(event)]);
  assert.equal(first.events.length, 1);
  assert.equal(first.receipt.added_count, 1);
  assert.equal(first.receipt.replayed_count, 1);
  assert.deepEqual(first.receipt.deduped_job_refs, [event.envelope.native_occurrence_ref]);

  const replay = replayRunHistoryEvents(first.events, [clone(event)]);
  assert.equal(replay.receipt.added_count, 0);
  assert.equal(replay.receipt.replayed_count, 1);
  assert.equal(replay.receipt.ordered_event_digest, first.receipt.ordered_event_digest);
});

test("same job_id with a different full canonical receipt digest is a hard conflict", () => {
  const first = adaptReportAuthoringReceipt(input());
  const changedReceipt = clone(fixture);
  changedReceipt.result_sha256 = "c".repeat(64);
  const changed = adaptReportAuthoringReceipt(input(changedReceipt));
  assert.notEqual(first.full_receipt_digest, changed.full_receipt_digest);
  assertCode(
    () => replayRunHistoryEvents([first], [changed]),
    "job_id_immutable_conflict",
  );
});

test("wrong workflow, unknown schema, arbitrary fields, and five-field records are ineligible", () => {
  const wrongWorkflow = clone(fixture);
  wrongWorkflow.workflow_id = "other_workflow_v0";
  assertCode(() => adaptReportAuthoringReceipt(input(wrongWorkflow)), "run_schema_not_allowed");

  const unknownSchema = clone(fixture);
  unknownSchema.schema = "soulforge.generic_run_receipt.v1";
  assertCode(() => adaptReportAuthoringReceipt(input(unknownSchema)), "run_schema_not_allowed");

  const arbitrary = clone(fixture);
  arbitrary.arbitrary_manifest = {};
  assertCode(() => adaptReportAuthoringReceipt(input(arbitrary)), "report_authoring_receipt_invalid");

  const fiveField = { schema: "soulforge.five_field_session_capture.v1", id: "same-current-id" };
  assertCode(() => adaptReportAuthoringReceipt(input(fiveField)), "five_field_native_occurrence_ineligible");
});

test("runs recursion and path-bearing adapter inputs fail before any discovery", () => {
  const recursive = input();
  recursive.runs_root = "runs/**";
  assertCode(() => adaptReportAuthoringReceipt(recursive), "extra_field");

  const absoluteProject = input();
  absoluteProject.project_ref = {
    entity_type: "project",
    owner_surface: "synthetic_project_registry",
    entity_id: ["C:", "private", "project"].join("\\"),
  };
  assert.throws(() => adaptReportAuthoringReceipt(absoluteProject));

  const uncProject = input();
  uncProject.project_ref = {
    entity_type: "project",
    owner_surface: "synthetic_project_registry",
    entity_id: ["", "", "server", "share", "project"].join("\\"),
  };
  assert.throws(() => adaptReportAuthoringReceipt(uncProject));
});

test("raw, stage-log, transcript, task-chat, and secret sentinels hidden in schema-allowed strings fail closed", () => {
  const values = [
    ["payload:raw_transcript", "raw_or_log_ref_forbidden"],
    ["payload:task_chat", "raw_or_log_ref_forbidden"],
    ["payload:full_conversation", "raw_or_log_ref_forbidden"],
    ["payload:sk-proj-abcdefgh", "secret_ref_forbidden"],
  ];
  for (const [payloadRef, code] of values) {
    const receipt = clone(fixture);
    receipt.input_refs[0].payload_ref = payloadRef;
    assertCode(() => adaptReportAuthoringReceipt(input(receipt)), code);
  }

  const stageLog = clone(fixture);
  stageLog.output_refs[0].role = "stage_log";
  assertCode(() => adaptReportAuthoringReceipt(input(stageLog)), "raw_or_log_ref_forbidden");
});

test("feature activation and typed-ref aliases are rejected", () => {
  assertCode(() => adaptReportAuthoringReceipt(input(fixture, { feature_enabled: true })), "feature_must_remain_off");
  const alias = input();
  alias.workflow_ref = { ...REPORT_AUTHORING_WORKFLOW_REF, owner_surface: "report_writer" };
  assertCode(() => adaptReportAuthoringReceipt(alias), "typed_ref_binding_mismatch");
});

test("all six common coverage states preserve the count/null/gap matrix", () => {
  const event = adaptReportAuthoringReceipt(input());
  const withEvents = coverage("complete_with_events", [event]);
  const noEvents = coverage("complete_no_events", []);
  const partial = coverage("partial", [event], { gap_codes: ["z_gap", "a_gap"] });
  const failed = coverage("failed", []);
  const notCollected = coverage("not_collected", []);
  const notApplicable = coverage("not_applicable", []);

  assert.deepEqual([
    [withEvents.coverage_receipt.state, withEvents.coverage_receipt.event_count, withEvents.coverage_receipt.gap_codes],
    [noEvents.coverage_receipt.state, noEvents.coverage_receipt.event_count, noEvents.coverage_receipt.gap_codes],
    [partial.coverage_receipt.state, partial.coverage_receipt.event_count, partial.coverage_receipt.gap_codes],
    [failed.coverage_receipt.state, failed.coverage_receipt.event_count, failed.coverage_receipt.gap_codes],
    [notCollected.coverage_receipt.state, notCollected.coverage_receipt.event_count, notCollected.coverage_receipt.gap_codes],
    [notApplicable.coverage_receipt.state, notApplicable.coverage_receipt.event_count, notApplicable.coverage_receipt.gap_codes],
  ], [
    ["complete_with_events", 1, []],
    ["complete_no_events", 0, []],
    ["partial", 1, ["a_gap", "z_gap"]],
    ["failed", null, ["synthetic_run_gap"]],
    ["not_collected", null, ["synthetic_run_gap"]],
    ["not_applicable", null, []],
  ]);
  assert.deepEqual(notApplicable.coverage_receipt.applicability_ref, APPLICABILITY_REF);
});

test("coverage rejects count mismatches, hidden gaps, reversed windows, and mixed scope", () => {
  const event = adaptReportAuthoringReceipt(input());
  assertCode(
    () => coverage("complete_with_events", [event], { event_count: 0 }),
    "coverage_event_count_mismatch",
  );
  assertCode(
    () => coverage("partial", [event], { gap_codes: [] }),
    "coverage_matrix_invalid",
  );
  assertCode(
    () => coverage("complete_no_events", [], {
      window_start: "2026-07-21T00:00:00.000Z",
      window_end: "2026-07-20T00:00:00.000Z",
    }),
    "coverage_window_invalid",
  );
  assert.throws(() => coverage("complete_with_events", [event], {
    project_ref: {
      entity_type: "project",
      owner_surface: "synthetic_project_registry",
      entity_id: "project:p02",
    },
  }));
});

test("coverage never invents policy or gap authority", () => {
  const missingPolicy = {
    schema_version: RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION,
    feature_enabled: false,
    lane: "run_log",
    source_owner_ref: REPORT_AUTHORING_SOURCE_OWNER_REF,
    project_ref: PROJECT_REF,
    window_start: "2026-07-20T00:00:00.000Z",
    window_end: "2026-07-21T00:00:00.000Z",
    state: "not_collected",
    event_count: null,
    gap_codes: ["synthetic_run_gap"],
    applicability_ref: null,
  };
  assertCode(() => createRunHistoryCoverageEvidence(missingPolicy, []), "missing_field");
});

test("event collection ordering and receipt digests are input-order independent", () => {
  const firstReceipt = clone(fixture);
  firstReceipt.job_id = "synthetic-report-job-002";
  firstReceipt.completed_at = "2026-07-20T00:02:00.000Z";
  const first = adaptReportAuthoringReceipt(input(firstReceipt, {
    receipt_ref: {
      entity_type: "workflow_receipt",
      owner_surface: "report_authoring_v0",
      entity_id: "receipt:synthetic-report-job-002",
    },
    event_ref: {
      entity_type: "event",
      owner_surface: "report_authoring_v0",
      entity_id: "receipt_event:synthetic-report-job-002",
    },
    known_at: "2026-07-20T00:02:02.000Z",
    recorded_at: "2026-07-20T00:02:02.000Z",
  }));
  const second = adaptReportAuthoringReceipt(input());
  const forward = replayRunHistoryEvents([], [first, second]);
  const reversed = replayRunHistoryEvents([], [second, first]);
  assert.deepEqual(forward.events, reversed.events);
  assert.equal(forward.receipt.ordered_event_digest, reversed.receipt.ordered_event_digest);
});
