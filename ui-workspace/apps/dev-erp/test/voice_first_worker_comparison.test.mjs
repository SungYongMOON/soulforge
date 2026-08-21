import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPTED_MODELS_PER_WORKER,
  ACCEPTED_WORKERS,
  WORKER_COMPARISON_HOLD_CODES as C,
  WORKER_COMPARISON_INPUT_SCHEMA,
  WORKER_COMPARISON_POLICY_REVISION,
  compareWorkerCohort,
  isAcceptedModelForWorker,
} from "../src/voice_first_worker_comparison.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function pin(overrides = {}) {
  return {
    work_unit_id: "WU-SYNTH-001",
    inputs_digest: digest("1"),
    constraints_digest: digest("2"),
    completion_criteria_digest: digest("3"),
    validator_digest: digest("4"),
    policy_digest: digest("5"),
    policy_ref: WORKER_COMPARISON_POLICY_REVISION,
    ...overrides,
  };
}

function modelFor(workerId) {
  return { codex: "gpt-5-codex", gemini_flash: "gemini-3.7-flash", grok_build: "grok-build-v1" }[workerId];
}

function entry(workerId, workUnitPin, options = {}) {
  const elapsedMs = options.elapsedMs ?? ({ codex: 300, gemini_flash: 500, grok_build: 800 }[workerId]);
  const correctionCount = options.correctionCount ?? ({ codex: 0, gemini_flash: 1, grok_build: 2 }[workerId]);
  const score = options.score ?? ({ codex: 1, gemini_flash: 0.9, grok_build: 0.8 }[workerId]);
  const runId = options.runId ?? `run_${workerId}_01`;
  const workId = options.workId ?? workUnitPin.work_unit_id;
  const correctionEvidence = correctionCount > 0 ? `ev_corr_${workerId}_01` : null;
  const startedAt = "2026-08-21T21:00:00.000Z";
  const completedAt = new Date(Date.parse(startedAt) + elapsedMs).toISOString();
  return {
    worker_id: workerId,
    work_run: {
      schema_version: "soulforge.ai_work_run.v1",
      event_id: `ev_run_${workerId}_01`, run_id: runId, work_id: workId,
      run_scope: "experiment", cost_role: "execution", variant: "candidate", task_class: "code_generation", risk_class: "low",
      experiment_id: "exp_cohort_01", repo_commit: "7a114a2f188c3a75ba340fe393348d8e6997c5a8", launcher_version: "launch_v1",
      topology: { expected_max_depth: 1, expected_max_children: 0, reviewer_policy: "independent_review_v1", preflight_policy: "preflight_v1" },
      cost_scope: { controller_included: true, executor_included: true, reviewer_included: true, offline_oracle_included: false },
      work_record_ref: null, started_at: startedAt, completed_at: completedAt, model_id: modelFor(workerId), reasoning_effort: null,
      usage_event_ids: [`ev_usage_${workerId}_01`], instruction_manifest_ref: "manifest_synth_01", measurement_status: "complete",
      authority: "non_authoritative_measurement_projection", metadata_only: true, raw_prompt_copied: false, raw_reasoning_copied: false, raw_tool_payload_copied: false,
      ...options.workRun,
    },
    quality_result: {
      schema_version: "soulforge.ai_quality_result.v1", event_id: `ev_quality_${workerId}_01`, result_id: `result_quality_${workerId}_01`, run_id: runId, work_id: workId,
      evaluator_kind: "deterministic", metric_id: "synthetic_conformance", score, scale_min: 0, scale_max: 1, decision: "pass",
      evidence_refs: [`ev_validator_${workerId}_01`, ...(correctionEvidence ? [correctionEvidence] : [])], occurred_at: "2026-08-21T21:00:02.000Z",
      metadata_only: true, raw_prompt_copied: false, raw_reasoning_copied: false, raw_tool_payload_copied: false,
      ...options.qualityResult,
    },
    run_binding: {
      worker_id: workerId, run_id: runId, work_unit_id: workUnitPin.work_unit_id,
      inputs_digest: workUnitPin.inputs_digest, constraints_digest: workUnitPin.constraints_digest,
      completion_criteria_digest: workUnitPin.completion_criteria_digest, validator_digest: workUnitPin.validator_digest, policy_digest: workUnitPin.policy_digest,
      ...options.runBinding,
    },
    validator_binding: {
      worker_id: workerId, run_id: runId, work_unit_id: workUnitPin.work_unit_id,
      validator_ref: "validator_synth_01", validator_digest: workUnitPin.validator_digest,
      validation_evidence_ref: `validator_evidence_${workerId}_01`, validation_evidence_digest: digest(workerId === "codex" ? "d" : workerId === "gemini_flash" ? "e" : "f"),
      execution_receipt_ref: `validator_execution_${workerId}_01`, execution_receipt_digest: digest(workerId === "codex" ? "7" : workerId === "gemini_flash" ? "8" : "9"),
      ...options.validatorBinding,
    },
    deterministic_validator_result: {
      validator_ref: "validator_synth_01", validator_digest: workUnitPin.validator_digest, quality_policy_ref: "quality_policy_synth_01", quality_policy_digest: digest("6"),
      decision: "pass", passed_checks: 10, total_checks: 10, occurred_at: "2026-08-21T21:00:01.500Z", ...options.validator,
    },
    independent_reviewer_result: {
      reviewer_ref: `claude_reviewer_${workerId}`, review_ref: `review_${workerId}_01`, review_digest: digest(workerId === "codex" ? "a" : workerId === "gemini_flash" ? "b" : "c"),
      decision: "accept", is_independent: true, occurred_at: "2026-08-21T21:00:02.500Z", ...options.reviewer,
    },
    review_binding: {
      worker_id: workerId, run_id: runId, work_unit_id: workUnitPin.work_unit_id,
      review_ref: `review_${workerId}_01`, review_digest: digest(workerId === "codex" ? "a" : workerId === "gemini_flash" ? "b" : "c"),
      ...options.reviewBinding,
    },
    metrics: {
      elapsed_ms: elapsedMs, correction_count: correctionCount, correction_evidence_ref: correctionEvidence,
      effect_counters: { linear_mutations: 0, erp_mutations: 0, gmail_sends: 0, slack_posts: 0, git_commits: 0, task_mutations: 0, external_calls: 0 },
      ...options.metrics,
    },
  };
}

function input(overrides = {}) {
  const workUnitPin = overrides.work_unit_pin ?? pin();
  return {
    schema_version: WORKER_COMPARISON_INPUT_SCHEMA,
    comparison_id: "cmp_synth_001",
    work_unit_pin: workUnitPin,
    cohort: ACCEPTED_WORKERS.map((workerId) => entry(workerId, workUnitPin)),
    ...overrides,
  };
}

function replaceEntry(packet, workerId, options) {
  packet.cohort[packet.cohort.findIndex((entryItem) => entryItem.worker_id === workerId)] = entry(workerId, packet.work_unit_pin, options);
  return packet;
}

function assertHold(result, code) {
  assert.equal(result.status, "HOLD");
  assert.equal(result.hold_codes.includes(code), true, `${code}: ${result.hold_codes.join(", ")}`);
}

test("valid cohort creates a full evidence-bound receipt with numeric latest evaluation", () => {
  const packet = input();
  const result = compareWorkerCohort(packet);
  assert.equal(result.status, "COMPARED");
  assert.equal(result.receipt.evaluated_at, "2026-08-21T21:00:02.500Z");
  assert.equal(result.receipt.comparison_dimensions.validation_pass_all, true);
  assert.deepEqual(Object.keys(result.receipt.run_bindings).sort(), ["codex/run_codex_01", "gemini_flash/run_gemini_flash_01", "grok_build/run_grok_build_01"]);
  assert.deepEqual(result.receipt.run_bindings["codex/run_codex_01"], packet.cohort[0].run_binding);
  assert.equal(result.receipt.selection.outcome, "DOMINANT_EVALUATED_WORKER");
  assert.equal(result.receipt.selection.winner, "codex");
  assert.equal(Object.isFrozen(result.receipt), true);
});

test("exported model catalog cannot mutate private model membership", () => {
  assert.equal(Object.isFrozen(ACCEPTED_MODELS_PER_WORKER.codex), true);
  assert.throws(() => ACCEPTED_MODELS_PER_WORKER.codex.push("not-accepted"));
  assert.equal(ACCEPTED_MODELS_PER_WORKER.codex.add, undefined);
  assert.equal(isAcceptedModelForWorker("codex", "not-accepted"), false);
  assert.equal(isAcceptedModelForWorker("codex", "gpt-5-codex"), true);
});

test("partial or incomplete measurements cannot be compared", () => {
  const partial = replaceEntry(input(), "codex", { workRun: { measurement_status: "partial" } });
  assertHold(compareWorkerCohort(partial), C.MEASUREMENT_INCOMPLETE);
  const missingCompletion = replaceEntry(input(), "codex", { workRun: { completed_at: null } });
  assertHold(compareWorkerCohort(missingCompletion), C.MEASUREMENT_INCOMPLETE);
});

test("validator and reviewer gates require pass/accept with complete evidence", () => {
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { validator: { decision: "fail" } })), C.DETERMINISTIC_VALIDATOR_NOT_PASSED);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { validator: { passed_checks: 9 } })), C.DETERMINISTIC_VALIDATOR_INVALID);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { reviewer: { decision: "reject" } })), C.INDEPENDENT_REVIEW_NOT_ACCEPTED);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { reviewer: { reviewer_ref: "gemini_flash" } })), C.INDEPENDENT_REVIEW_INVALID);
  const duplicate = input();
  duplicate.cohort[1].independent_reviewer_result.review_ref = duplicate.cohort[0].independent_reviewer_result.review_ref;
  assertHold(compareWorkerCohort(duplicate), C.INDEPENDENT_REVIEW_DUPLICATE);
});

test("all comparison bases must be exactly equal before numeric ranking", () => {
  const mutations = [
    (item) => { item.quality_result.metric_id = "other_metric"; },
    (item) => { item.quality_result.scale_min = -1; },
    (item) => { item.quality_result.evaluator_kind = "human"; },
    (item) => { item.work_run.repo_commit = "abcdef1234567"; },
    (item) => { item.work_run.instruction_manifest_ref = "manifest_other"; },
    (item) => { item.work_run.task_class = "other_task"; },
    (item) => { item.work_run.cost_scope.reviewer_included = false; },
    (item) => { item.deterministic_validator_result.total_checks = 11; item.deterministic_validator_result.passed_checks = 11; },
    (item) => { item.deterministic_validator_result.quality_policy_ref = "quality_policy_other"; },
  ];
  for (const mutate of mutations) {
    const packet = input();
    mutate(packet.cohort[1]);
    assertHold(compareWorkerCohort(packet), C.COMPARISON_BASIS_MISMATCH);
  }
});

test("per-run binding must exactly match every work-unit pin digest", () => {
  for (const field of ["inputs_digest", "constraints_digest", "completion_criteria_digest", "validator_digest", "policy_digest"]) {
    const packet = input();
    packet.cohort[0].run_binding[field] = digest("f");
    assertHold(compareWorkerCohort(packet), C.RUN_BINDING_MISMATCH);
  }
});

test("measurement rejects noncanonical timestamps, inversions, elapsed mismatch, and unsafe quality evidence", () => {
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { workRun: { completed_at: "2026-08-21T21:00:00Z" } })), C.WORK_RUN_INVALID);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { workRun: { started_at: "2026-08-21T21:00:01.000Z", completed_at: "2026-08-21T21:00:00.900Z" } })), C.WORK_RUN_INVALID);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { metrics: { elapsed_ms: 301 } })), C.ELAPSED_TIME_MISMATCH);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { qualityResult: { evidence_refs: [] } })), C.QUALITY_RESULT_INVALID);
  assertHold(compareWorkerCohort(replaceEntry(input(), "gemini_flash", { metrics: { correction_evidence_ref: "ev_not_quality_evidence" } })), C.CORRECTION_EVIDENCE_MISMATCH);
});

test("any tie records explicit markers and forces no selection without worker-order bias", () => {
  const cases = [
    ["speed", (packet) => replaceEntry(packet, "gemini_flash", { elapsedMs: 300 })],
    ["correction", (packet) => replaceEntry(packet, "gemini_flash", { correctionCount: 0 })],
    ["quality", (packet) => replaceEntry(packet, "gemini_flash", { score: 1 })],
  ];
  for (const [dimension, mutate] of cases) {
    const packet = mutate(input());
    const result = compareWorkerCohort(packet);
    assert.equal(result.status, "COMPARED");
    assert.equal(result.receipt.selection.outcome, "NO_SELECTION");
    assert.equal(result.receipt.selection.winner, null);
    assert.equal(result.receipt.comparison_dimensions.tie_markers[dimension].length > 0, true);
  }
});

test("comparison IDs cover the canonical receipt body", () => {
  const first = compareWorkerCohort(input());
  const changed = input({ comparison_id: "cmp_synth_002" });
  const second = compareWorkerCohort(changed);
  assert.equal(first.status, "COMPARED");
  assert.equal(second.status, "COMPARED");
  assert.notEqual(first.receipt.receipt_id, second.receipt.receipt_id);
});

test("snapshotting rejects accessors and cycles before validation", () => {
  const accessor = input();
  Object.defineProperty(accessor, "comparison_id", { enumerable: true, get() { throw new Error("TOCTOU"); } });
  assertHold(compareWorkerCohort(accessor), C.INVALID_INPUT_SHAPE);
  const cyclic = input();
  cyclic.work_unit_pin.self = cyclic;
  assertHold(compareWorkerCohort(cyclic), C.INVALID_INPUT_SHAPE);
});

test("review and validator evidence bind exactly to each run and cannot be copied across workers", () => {
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { reviewBinding: { run_id: "run_foreign_01" } })), C.REVIEW_BINDING_MISMATCH);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { validatorBinding: { work_unit_id: "WU-FOREIGN-001" } })), C.VALIDATOR_BINDING_MISMATCH);
  const copied = input();
  copied.cohort[1].validator_binding.validation_evidence_ref = copied.cohort[0].validator_binding.validation_evidence_ref;
  copied.cohort[1].validator_binding.validation_evidence_digest = copied.cohort[0].validator_binding.validation_evidence_digest;
  assertHold(compareWorkerCohort(copied), C.VALIDATOR_EVIDENCE_DUPLICATE);
});

test("causal evidence clock and unique run identities are required", () => {
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { qualityResult: { occurred_at: "2026-08-21T21:00:01.400Z" } })), C.CAUSAL_TIME_ORDER_INVALID);
  const duplicated = input();
  const source = duplicated.cohort[0];
  const target = duplicated.cohort[1];
  for (const record of [target.work_run, target.quality_result, target.run_binding, target.validator_binding, target.review_binding]) record.run_id = source.work_run.run_id;
  assertHold(compareWorkerCohort(duplicated), C.DUPLICATE_RUN_ID);
});

test("quality values are finite and within the canonical scale", () => {
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { qualityResult: { score: Number.NaN } })), C.QUALITY_RESULT_INVALID);
  assertHold(compareWorkerCohort(replaceEntry(input(), "codex", { qualityResult: { score: 1.1 } })), C.QUALITY_RESULT_INVALID);
});

test("all harness axes are exact comparison bases", () => {
  const mutations = [
    (workRun) => { workRun.variant = "control"; },
    (workRun) => { workRun.topology.expected_max_depth = 2; },
    (workRun) => { workRun.run_scope = "operational"; },
    (workRun) => { workRun.cost_role = "rework"; },
    (workRun) => { workRun.launcher_version = "launch_v2"; },
    (workRun) => { workRun.experiment_id = "exp_other_01"; },
    (workRun) => { workRun.reasoning_effort = "high"; },
  ];
  for (const mutate of mutations) {
    const packet = input();
    mutate(packet.cohort[1].work_run);
    assertHold(compareWorkerCohort(packet), C.COMPARISON_BASIS_MISMATCH);
  }
});
