import test from "node:test";
import assert from "node:assert/strict";
import { hashWorkIntakeFacts, runWorkIntake } from "../src/work_intake_adapter.mjs";
import { validateWorkIntakeDocuments } from "../src/work_intake_documents.mjs";
import { evaluateWorkIntakeRun, compareWorkIntakeEvaluations, isWorkIntakeEvaluation } from "../src/work_intake_evaluation.mjs";
import { syntheticInput as developmentInput, scriptedJudge, syntheticResult as scriptedResult, eventAttempt, START, END } from "./work_intake_test_helpers.mjs";

// Expectations authored in the P0/P3 lane, independently of the production
// adapter. These are synthetic contract fixtures, never human/model utility gold.
const EXPECTED = Object.freeze({ new: "NEW", follow_up: "FOLLOW_UP", evidence: "EVIDENCE", completed: "NO_ACTION", stale: "HOLD", partial: "HOLD", late: "EVIDENCE", echo: "NO_ACTION" });
const DEVELOPMENT_EVENT = `event_${hashWorkIntakeFacts(["gmail", "scope:gmail", "event:1"])}`;
function syntheticInput(runId) {
  const input = developmentInput(runId);
  input.events[0].event_ref = "evaluation:event-1";
  return input;
}
const syntheticResult = (input = syntheticInput(), overrides = {}) => scriptedResult(input, overrides);
function evaluation(run, expected = EXPECTED.new, partition = "evaluation") {
  return {
    partition, case_set_ref: "synthetic:independent-case-set-v1",
    verdict_provenance: { kind: "independent_synthetic_fixture", author_ref: "synthetic:policy-evaluation", producer_author_ref: "synthetic:intake-adapter",
      frozen_at: START, source_snapshot_sha256: run.snapshot_sha256, development_event_identities: [DEVELOPMENT_EVENT] },
    cases: run.attempts.filter((a) => a.kind === "event").map((attempt, index) => ({ case_id: `synthetic:case-${index}`, partition,
      event_identity: attempt.event_identity, expected_classification: expected, expected_project_ref: "P01", verdict_ref: `synthetic:verdict-${index}` })),
    evaluated_at: END,
  };
}
const observed = (value, evidence_ref = `synthetic:observed-${value.toLowerCase()}`) => ({ value, evidence_ref });
function taskInput() {
  const input = syntheticInput(); input.source_reads[1].status = "read";
  input.linear_view.tasks.push({ task_ref: "synthetic:task-open", project_ref: "P01", status: "open", task_semantic_sha256: "b".repeat(64), evidence_refs: ["synthetic:task-state"] });
  return input;
}
function matchingJudge(classification) {
  return async (request) => ({ ...await scriptedJudge()(request), classification,
    reason_code: classification === "EVIDENCE" ? "SUPPORTING_EVIDENCE" : "EXISTING_TASK", matched_task_ref: "synthetic:task-open",
    evidence_refs: [...request.event.evidence_refs, "synthetic:task-state"] });
}

test("existing live-contract evaluator is consumed with explicit synthetic provenance and no utility claim", async () => {
  const run = await syntheticResult();
  const value = evaluateWorkIntakeRun(run, evaluation(run));
  assert.equal(value.status, "EVALUATED", JSON.stringify(value));
  assert.equal(isWorkIntakeEvaluation(value), true);
  assert.equal(value.report.provenance, "synthetic");
  assert.equal(value.report.measured_model_utility, false);
  assert.equal(value.report.rows[0].core_evaluation.quality_receipt.contract_invariants.live_only_context_held, true);
  assert.equal(value.report.rows[0].core_evaluation.quality_receipt.reasoning_outcome, "TRUE_POSITIVE");
  assert.deepEqual(value.report.counts, { attempts: 3, event_attempts: 1, read_attempts: 2, read_failures: 0,
    decidable: 1, proposed: 1, held: 0, missed_actions: 0, excess_holds: 0, wrong_project: 0, classification_matches: 1 });
  assert.equal(value.report.measurements.input_tokens.value, "UNKNOWN");
  assert.equal(value.report.measurements.cost_usd.value, "UNKNOWN");
  assert.equal(value.report.stage_counts.used.yes, 0);
  assert.equal(value.report.stage_counts.used.unknown, 1);
  assert.deepEqual(value.report.ratios.adopted_per_proposed, { numerator: 0, denominator: 1, unknown: 1 });
  assert.equal(isWorkIntakeEvaluation(structuredClone(value)), false);
});

test("historical replay, unbound live, and copied producer results never enter core evaluation", async () => {
  for (const provenance of ["replay", "live"]) {
    const input = syntheticInput(); input.provenance = provenance;
    const run = await syntheticResult(input);
    assert.ok(evaluateWorkIntakeRun(run, evaluation(run)).hold_codes.includes("NON_SYNTHETIC_EVALUATION_FORBIDDEN"));
  }
  const run = await syntheticResult();
  assert.ok(evaluateWorkIntakeRun(structuredClone(run), evaluation(run)).hold_codes.includes("INVALID_INTAKE_RESULT"));
});

test("independent labels cover NEW, FOLLOW_UP, EVIDENCE, NO_ACTION and HOLD", async () => {
  const runs = [
    [await syntheticResult(), EXPECTED.new],
    [await runWorkIntake(taskInput(), { judge: matchingJudge("FOLLOW_UP") }), EXPECTED.follow_up],
    [await runWorkIntake(taskInput(), { judge: matchingJudge("EVIDENCE") }), EXPECTED.evidence],
    [await syntheticResult(syntheticInput(), { classification: "NO_ACTION", reason_code: "ALREADY_COMPLETED", action_semantic_sha256: null }), EXPECTED.completed],
  ];
  const stale = syntheticInput(); stale.events[0].revision_state = "superseded";
  runs.push([await syntheticResult(stale), EXPECTED.stale]);
  for (const [run, expected] of runs) {
    const value = evaluateWorkIntakeRun(run, evaluation(run, expected));
    assert.equal(value.status, "EVALUATED", JSON.stringify(value));
    assert.equal(value.report.rows[0].classification_match, true, expected);
  }
});

test("partial reads retain failed attempt denominators and HOLD + PASS never becomes success", async () => {
  const input = syntheticInput(); input.source_reads[0].status = "partial";
  const run = await syntheticResult(input);
  for (const readback of ["REQUIRED", "PENDING", "PASS"]) {
    const labels = evaluation(run, EXPECTED.partial);
    labels.observations = [{ event_identity: eventAttempt(run).event_identity, provenance: "synthetic",
      receipt_self_readback: observed(readback), business_effect_readback: observed("NOT_ATTEMPTED", null) }];
    const value = evaluateWorkIntakeRun(run, labels);
    assert.equal(value.status, "EVALUATED");
    assert.equal(value.report.run_status, "HOLD");
    assert.equal(value.report.counts.read_failures, 1);
    assert.equal(value.report.counts.attempts, 3);
    assert.equal(value.report.counts.decidable, 0);
    assert.equal(value.report.rows[0].observation.receipt_self_readback.value, readback);
    assert.equal(value.report.rows[0].classification, "HOLD");
    assert.equal(value.report.rows[0].core_evaluation, null);
    for (const stage of ["adopted", "executed", "verified", "used"]) assert.equal(value.report.stage_counts[stage].yes, 0);
  }
});

test("late current evidence and exact result echo have distinct independent outcomes", async () => {
  const late = taskInput(); late.events[0].occurred_at = "2026-09-07T22:30:00.000Z";
  const lateRun = await runWorkIntake(late, { judge: matchingJudge("EVIDENCE") });
  assert.equal(eventAttempt(lateRun).late_arrival, true);
  assert.equal(evaluateWorkIntakeRun(lateRun, evaluation(lateRun, EXPECTED.late)).report.rows[0].classification_match, true);
  const echo = syntheticInput(); echo.events[0].evidence_refs.push("synthetic:result", "synthetic:readback");
  echo.echo_receipts.push({ source: "gmail", scope_ref: "scope:gmail", event_ref: echo.events[0].event_ref, revision_sha256: "a".repeat(64), evidence_ref: "synthetic:readback", result_ref: "synthetic:result" });
  let calls = 0;
  const echoRun = await runWorkIntake(echo, { judge: () => { calls++; throw new Error("must not judge exact echo"); } });
  assert.equal(calls, 0);
  assert.equal(evaluateWorkIntakeRun(echoRun, evaluation(echoRun, EXPECTED.echo)).report.rows[0].classification_match, true);
});

test("misses, excess holds and wrong project use independent expectations, not producer confidence", async () => {
  const noAction = await syntheticResult(syntheticInput(), { classification: "NO_ACTION", reason_code: "NO_NEW_REQUEST", action_semantic_sha256: null });
  const missed = evaluateWorkIntakeRun(noAction, evaluation(noAction, EXPECTED.new));
  assert.equal(missed.report.counts.missed_actions, 1);
  const held = await syntheticResult(syntheticInput(), { classification: "HOLD", reason_code: "INSUFFICIENT_EVIDENCE", task_semantic_sha256: null, action_semantic_sha256: null });
  assert.equal(evaluateWorkIntakeRun(held, evaluation(held, EXPECTED.new)).report.counts.excess_holds, 1);
  const wrong = await syntheticResult(), labels = evaluation(wrong); labels.cases[0].expected_project_ref = "P02";
  assert.equal(evaluateWorkIntakeRun(wrong, labels).report.counts.wrong_project, 1);
});

test("adoption, execution, verification, use and repeat exposure need separate evidence", async () => {
  const run = await syntheticResult(), labels = evaluation(run);
  labels.observations = [{ event_identity: eventAttempt(run).event_identity, provenance: "synthetic",
    receipt_self_readback: observed("PASS"), business_effect_readback: observed("PASS"),
    adopted: observed("YES", "synthetic:adoption"), executed: observed("YES", "synthetic:execution"),
    verified: observed("YES", "synthetic:verification"), repeat_exposure: observed("YES", "synthetic:duplicate-exposure") }];
  labels.measurements = { tool_calls: { value: 3, evidence_ref: "synthetic:tool-count" } };
  const value = evaluateWorkIntakeRun(run, labels);
  assert.equal(value.status, "EVALUATED");
  assert.deepEqual(value.report.ratios.used_per_verified, { numerator: 0, denominator: 1, unknown: 1 });
  assert.equal(value.report.stage_counts.repeat_exposure.yes, 1);
  assert.equal(value.report.measurements.tool_calls.value, 3);
  assert.equal(value.report.measurements.output_tokens.value, "UNKNOWN");
  labels.observations[0].used = observed("YES", "synthetic:actual-use");
  assert.equal(evaluateWorkIntakeRun(run, labels).report.stage_counts.used.yes, 1);
  labels.observations[0].verified = observed("UNKNOWN", null);
  assert.ok(evaluateWorkIntakeRun(run, labels).hold_codes.includes("INVALID_SYNTHETIC_OBSERVATION"));
});

test("receipt PASS, Issue count or missing observation evidence cannot manufacture utility", async () => {
  const run = await syntheticResult(), labels = evaluation(run);
  labels.observations = [{ event_identity: eventAttempt(run).event_identity, provenance: "synthetic", receipt_self_readback: observed("PASS"), business_effect_readback: observed("PASS") }];
  const value = evaluateWorkIntakeRun(run, labels);
  assert.equal(value.report.stage_counts.adopted.yes, 0);
  labels.observations[0].issue_count = 92;
  assert.equal(evaluateWorkIntakeRun(run, labels).status, "HOLD");
  delete labels.observations[0].issue_count; labels.observations[0].adopted = observed("YES", null);
  assert.equal(evaluateWorkIntakeRun(run, labels).status, "HOLD");
});

test("verdict provenance and development/evaluation separation are enforced", async () => {
  const run = await syntheticResult();
  for (const mutate of [
    (labels) => { labels.verdict_provenance.author_ref = labels.verdict_provenance.producer_author_ref; },
    (labels) => { labels.verdict_provenance.source_snapshot_sha256 = "f".repeat(64); },
    (labels) => { labels.verdict_provenance.frozen_at = "2026-09-08T02:00:00.000Z"; },
    (labels) => { labels.cases[0].partition = "development"; },
    (labels) => { labels.verdict_provenance.development_event_identities = [eventAttempt(run).event_identity]; },
    (labels) => { labels.cases = []; },
  ]) {
    const labels = evaluation(run); mutate(labels);
    assert.equal(evaluateWorkIntakeRun(run, labels).status, "HOLD");
  }
});

test("same immutable inputs compare prompt dimensions without claiming a model winner or token savings", async () => {
  const a = await syntheticResult(syntheticInput("synthetic:run-a"));
  const b = await runWorkIntake(syntheticInput("synthetic:run-b"), { judge: async (request) => {
    const response = await scriptedJudge()(request); response.model_receipt.prompt_sha256_ref = "e".repeat(64); return response;
  } });
  const reports = [evaluateWorkIntakeRun(a, evaluation(a)), evaluateWorkIntakeRun(b, evaluation(b))];
  assert.ok(compareWorkIntakeEvaluations(reports).hold_codes.includes("UNDECLARED_COMPARISON_INTERVENTION"));
  const comparison = compareWorkIntakeEvaluations(reports, { vary_dimensions: ["prompt_sha256_ref"] });
  assert.equal(comparison.status, "COMPARABLE", JSON.stringify(comparison));
  assert.notEqual(comparison.variants[0].dimensions.prompt_sha256_ref, comparison.variants[1].dimensions.prompt_sha256_ref);
  assert.equal(comparison.winner, "NOT_INFERRED"); assert.equal(comparison.token_savings, "UNKNOWN");
});

test("source revision, Linear state, permissions and window drift block comparison", async () => {
  const baseline = await syntheticResult();
  const baselineEvaluation = evaluateWorkIntakeRun(baseline, evaluation(baseline));
  for (const mutate of [
    (input) => { input.events[0].revision_sha256 = "e".repeat(64); },
    (input) => { input.linear_view.evidence_refs.push("synthetic:linear-revision2"); },
    (input) => { input.permission_refs.push("synthetic:new-permission-revision"); },
    (input) => { input.window.start = "2026-09-08T00:10:00.000Z"; },
  ]) {
    const input = syntheticInput(); mutate(input); const run = await syntheticResult(input);
    const value = compareWorkIntakeEvaluations([baselineEvaluation, evaluateWorkIntakeRun(run, evaluation(run))]);
    assert.ok(value.hold_codes.includes("IMMUTABLE_INPUT_MISMATCH"), JSON.stringify(value));
  }
});

test("changed document policy and checked revision require explicitly declared interventions", async () => {
  const a = await syntheticResult(), input = syntheticInput("synthetic:policy-v2");
  const manifest = ["authority_policy", "intake_policy"].map((role) => ({ document_ref: `doc:${role}`, document_role: role,
    required_for: ["hourly_intake"], applicable_actions: ["hourly_intake"], revision_policy: { mode: "exact", revisions: ["v2"] },
    required_sections: ["scope"], authority_ref: `auth:${role}` }));
  input.document_validation = validateWorkIntakeDocuments({ action: "hourly_intake", manifest,
    documents: manifest.map((spec) => ({ document_ref: spec.document_ref, revision: "v2", sections: ["scope"], authority_ref: spec.authority_ref, read_status: "read" })) });
  const b = await syntheticResult(input);
  const reports = [evaluateWorkIntakeRun(a, evaluation(a)), evaluateWorkIntakeRun(b, evaluation(b))];
  assert.equal(a.snapshot_sha256, b.snapshot_sha256);
  assert.ok(compareWorkIntakeEvaluations(reports).hold_codes.includes("UNDECLARED_COMPARISON_INTERVENTION"));
  assert.ok(compareWorkIntakeEvaluations(reports, { vary_dimensions: ["document_manifest_sha256"] }).hold_codes.includes("UNDECLARED_COMPARISON_INTERVENTION"));
  assert.equal(compareWorkIntakeEvaluations(reports, { vary_dimensions: ["document_manifest_sha256", "document_evidence_sha256"] }).status, "COMPARABLE");
});

test("unknown model/prompt observations cannot establish a comparable model dimension", async () => {
  const input = syntheticInput(); input.source_reads[0].status = "unavailable";
  const run = await syntheticResult(input), labels = evaluation(run, EXPECTED.partial);
  const report = evaluateWorkIntakeRun(run, labels);
  assert.equal(report.status, "EVALUATED");
  assert.ok(compareWorkIntakeEvaluations([report, report]).hold_codes.includes("COMPARISON_DIMENSIONS_UNKNOWN"));
  const invalid = {}; Object.defineProperty(invalid, "vary_dimensions", { enumerable: true, get() { throw new Error("untrusted getter"); } });
  assert.equal(compareWorkIntakeEvaluations([report, report], invalid).status, "HOLD");
});
