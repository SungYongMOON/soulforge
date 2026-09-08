import assert from "node:assert/strict";
import test from "node:test";

import { isValidatedHourlyShadowCycle } from "../src/hourly_shadow_cycle_contract.mjs";
import { hashWorkIntakeFacts, isWorkIntakeResult, runWorkIntake } from "../src/work_intake_adapter.mjs";
import { syntheticInput, scriptedJudge, syntheticResult, eventAttempt, START, END } from "./work_intake_test_helpers.mjs";

function addTask(input, status = "open") {
  input.source_reads[1].status = "read";
  input.linear_view.tasks.push({ task_ref: "linear:task1", project_ref: "P01", status,
    task_semantic_sha256: "b".repeat(64), evidence_refs: ["linear:task1:rev1"] });
}

test("synthetic NEW consumes the unchanged effect-zero Shadow contract, retains no facts, and brands only immutable outputs", async () => {
  const input = syntheticInput();
  const result = await syntheticResult(input);
  assert.equal(result.status, "COMPLETED");
  assert.equal(isWorkIntakeResult(result), true);
  assert.equal(isWorkIntakeResult({ ...result }), false);
  assert.equal(isWorkIntakeResult(JSON.parse(JSON.stringify(result))), false);
  const attempt = eventAttempt(result);
  assert.equal(attempt.classification, "NEW");
  assert.equal(attempt.status, "DECIDED");
  assert.equal(attempt.model_receipt_ref, "judge:1");
  assert.equal(attempt.scope_ref, input.events[0].scope_ref);
  assert.equal(attempt.event_ref, input.events[0].event_ref);
  assert.equal(attempt.project_binding_ref, input.events[0].project_binding_ref);
  assert.equal(attempt.source_revision_ref, input.events[0].revision_ref);
  assert.equal(attempt.echo_provenance, null);
  assert.equal(result.attempts[0].scope_ref, input.source_reads[0].scope_ref);
  assert.equal(isValidatedHourlyShadowCycle(attempt.shadow_cycle), true);
  assert.equal(attempt.shadow_cycle.context_mode, "live_only");
  assert.equal(result.provenance, "synthetic");
  assert.deepEqual(Object.values(result.effect_counters), [0, 0, 0, 0, 0, 0]);
  assert.equal(Object.isFrozen(result.attempts[0].reason_codes), true);
  assert.equal(result.denominators.total_attempts, 3);
  assert.equal(result.denominators.proposals, 1);
  assert.ok(result.cursor_proposals.every((cursor) => cursor.eligible));
  assert.equal(JSON.stringify(result).includes(input.events[0].facts[0].text), false);
  assert.equal(JSON.stringify(result).includes('"facts"'), false);
  input.events[0].facts[0].text = "changed after completion";
  assert.equal(attempt.input_sha256, result.input_sha256);
});

test("live, replay and absent provenance are explicit retained failures and never call a judge", async () => {
  for (const [provenance, code] of [["live", "LIVE_BINDING_NOT_IMPLEMENTED"], ["replay", "HISTORICAL_REPLAY_NOT_SUPPORTED"], [null, "PROVENANCE_REQUIRED"]]) {
    const input = syntheticInput(); input.provenance = provenance;
    let calls = 0;
    const result = await runWorkIntake(input, { judge: async () => { calls++; } });
    assert.equal(result.status, "HOLD");
    assert.ok(result.hold_codes.includes(code));
    assert.match(result.input_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.attempts[0].input_sha256, result.input_sha256);
    assert.equal(calls, 0);
    assert.ok(result.attempts.every((attempt) => attempt.shadow_cycle === null));
  }
});

test("forged document validations cannot enter the adapter", async () => {
  const input = syntheticInput();
  input.document_validation = structuredClone(input.document_validation);
  const result = await syntheticResult(input);
  assert.ok(result.hold_codes.includes("DOCUMENT_VALIDATION_REQUIRED"));
});

test("missing Gmail and unavailable required reads remain in the failure denominator", async () => {
  const unavailable = syntheticInput(); unavailable.source_reads[0].status = "unavailable";
  const result = await syntheticResult(unavailable);
  assert.equal(result.status, "HOLD");
  assert.equal(result.denominators.source_read_attempts, 2);
  assert.equal(result.denominators.failed_reads, 1);
  assert.equal(result.denominators.event_attempts, 1);
  assert.ok(eventAttempt(result).reason_codes.includes("SOURCE_UNAVAILABLE"));
  assert.ok(result.cursor_proposals.every((cursor) => !cursor.eligible));
  const missing = syntheticInput(); missing.source_reads.shift();
  const missingResult = await syntheticResult(missing);
  assert.ok(missingResult.hold_codes.includes("MISSING_REQUIRED_SOURCE"));
  assert.equal(missingResult.denominators.failed_reads, 1);
});

test("optional Slack read failure does not reject independent Gmail decisions", async () => {
  const input = syntheticInput();
  input.permission_refs.push("perm:slack");
  input.source_reads.push({ ...input.source_reads[0], source: "slack", scope_ref: "scope:slack", status: "unavailable", permission_ref: "perm:slack", evidence_refs: ["read:slack"] });
  const result = await syntheticResult(input);
  assert.equal(result.status, "HOLD");
  assert.equal(eventAttempt(result).classification, "NEW");
  assert.equal(eventAttempt(result).shadow_validation.status, "VALIDATED");
  assert.equal(result.cursor_proposals.find((cursor) => cursor.source === "gmail").eligible, true);
  assert.equal(result.cursor_proposals.find((cursor) => cursor.source === "slack").eligible, false);
});

test("coverage, source permission, source scope and current Linear view fail separately", async () => {
  const cases = [
    [(input) => { input.source_reads[0].status = "partial"; }, "SOURCE_PARTIAL"],
    [(input) => { input.source_reads[0].window.start = "2026-09-08T00:30:00.000Z"; }, "SOURCE_WINDOW_GAP"],
    [(input) => { input.permission_refs.shift(); }, "SOURCE_PERMISSION_MISSING"],
    [(input) => { input.events[0].scope_ref = "scope:elsewhere"; }, "SOURCE_SCOPE_MISMATCH"],
    [(input) => { input.linear_view.status = "stale"; }, "LINEAR_VIEW_STALE"],
    [(input) => { input.linear_view.status = "unknown"; }, "LINEAR_VIEW_UNKNOWN"],
    [(input) => { input.linear_view.coverage = "partial"; }, "LINEAR_VIEW_PARTIAL"],
    [(input) => { input.linear_view.coverage = "unavailable"; }, "LINEAR_VIEW_UNAVAILABLE"],
    [(input) => { input.linear_view.as_of = START; }, "LINEAR_VIEW_TIME_INVALID"],
  ];
  for (const [change, code] of cases) {
    const input = syntheticInput(); change(input);
    const result = await syntheticResult(input);
    assert.ok(eventAttempt(result).reason_codes.includes(code), code);
    assert.equal(eventAttempt(result).shadow_cycle, null);
  }
});

test("unknown binding, stale, refuted, parse unavailable, failure and unread revisions remain distinct", async () => {
  const cases = [
    [(event) => { event.project_ref = null; event.project_binding_ref = null; }, "PROJECT_BINDING_UNKNOWN"],
    [(event) => { event.project_ref = "P02"; }, "PROJECT_BINDING_MISMATCH"],
    [(event) => { event.revision_state = "unknown"; }, "REVISION_UNKNOWN"],
    [(event) => { event.revision_state = "superseded"; }, "STALE_REVISION"],
    [(event) => { event.revision_state = "refuted"; }, "REFUTED_REVISION"],
    [(event) => { event.parse_state = "unavailable"; }, "PARSE_UNAVAILABLE"],
    [(event) => { event.parse_state = "failed"; }, "PARSE_FAILED"],
    [(event) => { event.parse_state = "not_attempted"; }, "PARSE_NOT_ATTEMPTED"],
  ];
  for (const [change, code] of cases) {
    const input = syntheticInput(); change(input.events[0]);
    const result = await syntheticResult(input);
    assert.ok(eventAttempt(result).reason_codes.includes(code), code);
    assert.equal(eventAttempt(result).model_receipt_ref, null);
  }
});

test("late occurrence joins the current observation window; out-of-window observations do not", async () => {
  const input = syntheticInput(); input.events[0].occurred_at = "2026-09-01T00:00:00.000Z";
  const late = await syntheticResult(input);
  assert.equal(eventAttempt(late).classification, "NEW");
  assert.equal(eventAttempt(late).late_arrival, true);
  assert.equal(eventAttempt(late).occurred_at, input.events[0].occurred_at);
  input.events[0].observed_at = START;
  const outside = await syntheticResult(input);
  assert.ok(eventAttempt(outside).reason_codes.includes("EVENT_OUTSIDE_OBSERVATION_WINDOW"));
});

test("source facts are hash-checked and semantic judge evidence and receipt must bind exact input", async () => {
  const changed = syntheticInput(); changed.events[0].facts[0].text += " altered";
  assert.ok(eventAttempt(await syntheticResult(changed)).reason_codes.includes("FACTS_DIGEST_MISMATCH"));
  const evidence = await syntheticResult(syntheticInput(), { evidence_refs: ["not:observed"] });
  assert.ok(eventAttempt(evidence).reason_codes.includes("JUDGE_EVIDENCE_UNBOUND"));
  const receipt = await runWorkIntake(syntheticInput(), { judge: async (request) => {
    const value = await scriptedJudge()(request); value.model_receipt.input_sha256 = "f".repeat(64); return value;
  } });
  assert.ok(eventAttempt(receipt).reason_codes.includes("JUDGE_RECEIPT_UNBOUND"));
  const fakeModel = await runWorkIntake(syntheticInput(), { judge: async (request) => {
    const value = await scriptedJudge()(request); value.model_receipt.model_ref = "claimed-real-model"; return value;
  } });
  assert.ok(eventAttempt(fakeModel).reason_codes.includes("JUDGE_RECEIPT_UNBOUND"));
});

test("judge absence, thrown errors and generated raw response fields produce retained HOLD attempts", async () => {
  const absent = await runWorkIntake(syntheticInput());
  assert.deepEqual(eventAttempt(absent).reason_codes, ["SEMANTIC_JUDGE_UNAVAILABLE"]);
  const failed = await runWorkIntake(syntheticInput(), { judge: async () => { throw new Error("do-not-persist-error-text"); } });
  assert.deepEqual(eventAttempt(failed).reason_codes, ["SEMANTIC_JUDGE_FAILED"]);
  assert.equal(JSON.stringify(failed).includes("do-not-persist"), false);
  const generated = await syntheticResult(syntheticInput(), { summary: "do-not-persist-generated-prose" });
  assert.deepEqual(eventAttempt(generated).reason_codes, ["INVALID_JUDGE_OUTPUT"]);
  assert.equal(JSON.stringify(generated).includes("do-not-persist"), false);
});

test("input snapshot is immutable across the async judge boundary", async () => {
  const input = syntheticInput();
  const result = await runWorkIntake(input, { judge: async (request) => {
    assert.ok(Object.isFrozen(request.event.facts[0]));
    input.events[0].project_ref = "P02";
    input.source_reads[0].status = "unavailable";
    await Promise.resolve();
    return scriptedJudge()(request);
  } });
  assert.equal(result.project_ref, "P01");
  assert.equal(eventAttempt(result).classification, "NEW");
  assert.equal(result.source_reads[0].status, "read");
});

test("event identity, source revision and semantic task/action hashes have separate lifetimes", async () => {
  const first = await syntheticResult();
  const next = syntheticInput("run:2");
  next.events[0].revision_ref = "ev:revision2";
  next.events[0].evidence_refs[0] = "ev:revision2";
  next.events[0].revision_sha256 = "e".repeat(64);
  const second = await syntheticResult(next);
  const a = eventAttempt(first), b = eventAttempt(second);
  assert.equal(a.event_identity, b.event_identity);
  assert.notEqual(a.event_revision_sha256, b.event_revision_sha256);
  assert.equal(a.task_identity, b.task_identity);
  assert.equal(a.semantic_digest, b.semantic_digest);
  assert.notEqual(a.shadow_cycle.trigger_digest, b.shadow_cycle.trigger_digest);
  const changedMeaning = await syntheticResult(syntheticInput("run:3"), { action_semantic_sha256: "f".repeat(64) });
  assert.equal(a.event_revision_sha256, eventAttempt(changedMeaning).event_revision_sha256);
  assert.notEqual(a.semantic_digest, eventAttempt(changedMeaning).semantic_digest);
  assert.notEqual(a.shadow_cycle.trigger_digest, eventAttempt(changedMeaning).shadow_cycle.trigger_digest);
});

test("snapshot comparison excludes run identity but pins source, Linear, permissions and window", async () => {
  const one = await syntheticResult();
  const two = await syntheticResult(syntheticInput("run:2"));
  assert.equal(one.snapshot_sha256, two.snapshot_sha256);
  assert.notEqual(one.input_sha256, two.input_sha256);
  for (const change of [
    (input) => { input.events[0].revision_sha256 = "f".repeat(64); },
    (input) => { input.linear_view.status = "unknown"; },
    (input) => { input.permission_refs.push("perm:extra"); },
    (input) => { input.window.start = "2026-09-08T00:01:00.000Z"; },
  ]) {
    const input = syntheticInput(); change(input);
    assert.notEqual((await syntheticResult(input)).snapshot_sha256, one.snapshot_sha256);
  }
});

test("existing tasks support FOLLOW_UP/EVIDENCE/NO_ACTION but cannot be minted as NEW", async () => {
  const input = syntheticInput(); addTask(input);
  const duplicate = await syntheticResult(input);
  assert.ok(eventAttempt(duplicate).reason_codes.includes("EXISTING_TASK_MISCLASSIFIED_NEW"));
  for (const classification of ["FOLLOW_UP", "EVIDENCE"]) {
    const result = await syntheticResult(input, { classification, reason_code: classification === "FOLLOW_UP" ? "EXISTING_TASK" : "SUPPORTING_EVIDENCE",
      matched_task_ref: "linear:task1", evidence_refs: [...input.events[0].evidence_refs, "linear:task1:rev1"] });
    assert.equal(eventAttempt(result).classification, classification);
  }
  input.linear_view.tasks[0].status = "completed";
  const followClosed = await syntheticResult(input, { classification: "FOLLOW_UP", matched_task_ref: "linear:task1", evidence_refs: [...input.events[0].evidence_refs, "linear:task1:rev1"] });
  assert.ok(eventAttempt(followClosed).reason_codes.includes("CLOSED_TASK_FOLLOW_UP"));
  const complete = await syntheticResult(input, { classification: "NO_ACTION", reason_code: "ALREADY_COMPLETED", action_semantic_sha256: null,
    matched_task_ref: "linear:task1", evidence_refs: [...input.events[0].evidence_refs, "linear:task1:rev1"] });
  assert.equal(eventAttempt(complete).classification, "NO_ACTION");
});

test("exact echo readback suppresses only its source event revision and keeps true changes eligible", async () => {
  const input = syntheticInput();
  input.events[0].evidence_refs.push("echo:readback", "result:1");
  input.echo_receipts.push({ source: "gmail", scope_ref: "scope:gmail", event_ref: "event:1", revision_sha256: "a".repeat(64), evidence_ref: "echo:readback", result_ref: "result:1" });
  const echo = await runWorkIntake(input, { judge: async () => { assert.fail("exact echo must not be judged"); } });
  assert.deepEqual(eventAttempt(echo).reason_codes, ["SELF_ECHO_EXACT_READBACK"]);
  assert.equal(eventAttempt(echo).shadow_cycle.is_bot_echo, true);
  assert.deepEqual(eventAttempt(echo).echo_provenance, input.echo_receipts[0]);
  assert.notEqual(eventAttempt(echo).echo_provenance, input.echo_receipts[0]);
  assert.equal(Object.isFrozen(eventAttempt(echo).echo_provenance), true);
  input.events[0].revision_sha256 = "e".repeat(64);
  const changed = await syntheticResult(input);
  assert.equal(eventAttempt(changed).classification, "NEW");
  assert.equal(eventAttempt(changed).echo_provenance, null);
  input.events[0].revision_sha256 = "a".repeat(64);
  input.events[0].evidence_refs.pop();
  const unbound = await syntheticResult(input);
  assert.deepEqual(eventAttempt(unbound).reason_codes, ["ECHO_READBACK_UNBOUND"]);
  assert.equal(eventAttempt(unbound).echo_provenance, null);
});

test("correction preserves exact supersedes target and category for the existing ledger", async () => {
  const first = await syntheticResult();
  const next = syntheticInput("run:correction");
  next.events[0].correction = { supersedes_cycle_ref: eventAttempt(first).shadow_cycle.cycle_id, category: "EVIDENCE_CORRECTION" };
  const result = await syntheticResult(next, { classification: "NO_ACTION", reason_code: "NO_NEW_REQUEST", action_semantic_sha256: null });
  assert.equal(eventAttempt(result).shadow_cycle.supersedes_ref, eventAttempt(first).shadow_cycle.cycle_id);
  assert.equal(eventAttempt(result).shadow_cycle.correction_category, "EVIDENCE_CORRECTION");
  next.events[0].correction.category = "ARBITRARY";
  assert.ok(eventAttempt(await syntheticResult(next)).reason_codes.includes("INVALID_EVENT"));
});

test("empty source windows complete without inventing tasks", async () => {
  const input = syntheticInput(); input.events = []; input.source_reads[0].status = "empty";
  const result = await syntheticResult(input);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.denominators.event_attempts, 0);
  assert.equal(result.denominators.proposals, 0);
});

test("malformed entries and forbidden raw fields never throw or survive in a result", async () => {
  const mutations = [
    (input) => { input.source_reads[0] = null; },
    (input) => { input.events[0] = null; },
    (input) => { input.linear_view = null; },
    (input) => { input.linear_view.tasks = [null]; },
    (input) => { input.echo_receipts = [null]; },
    (input) => { input.source_reads[0].body = "SENSITIVE_RAW_EXAMPLE"; },
    (input) => { input.events[0].body = "SENSITIVE_RAW_EXAMPLE"; },
    (input) => { input.extra = "SENSITIVE_RAW_EXAMPLE"; },
  ];
  for (const change of mutations) {
    const input = syntheticInput(); change(input);
    const result = await syntheticResult(input);
    assert.equal(result.status, "HOLD");
    assert.equal(isWorkIntakeResult(result), true);
    assert.equal(JSON.stringify(result).includes("SENSITIVE_RAW_EXAMPLE"), false);
  }
  const cyclic = syntheticInput(); cyclic.extra = cyclic;
  const result = await syntheticResult(cyclic);
  assert.deepEqual(result.hold_codes, ["INVALID_INPUT_GRAPH"]);
  assert.equal(result.input_sha256, null);
  let accessed = false;
  const accessor = syntheticInput(); Object.defineProperty(accessor, "extra", { enumerable: true, get() { accessed = true; return "secret"; } });
  assert.equal((await syntheticResult(accessor)).status, "HOLD");
  assert.equal(accessed, false);
  const documentAccessor = syntheticInput();
  Object.defineProperty(documentAccessor, "document_validation", { enumerable: true, get() { accessed = true; return null; } });
  assert.equal((await syntheticResult(documentAccessor)).status, "HOLD");
  assert.equal(accessed, false);
});

test("duplicate source revisions and conflicting exact revision hashes hold every affected attempt", async () => {
  for (const conflict of [false, true]) {
    const input = syntheticInput();
    input.events.push(structuredClone(input.events[0]));
    if (conflict) input.events[1].revision_sha256 = "f".repeat(64);
    const result = await syntheticResult(input);
    const events = result.attempts.filter((attempt) => attempt.kind === "event");
    assert.ok(events.every((attempt) => attempt.reason_codes.includes(conflict ? "SOURCE_REVISION_CONFLICT" : "DUPLICATE_SOURCE_REVISION")));
    assert.ok(events.every((attempt) => attempt.shadow_cycle === null));
  }
});

test("evidence above the existing source cap holds rather than silently truncating", async () => {
  const input = syntheticInput();
  for (let n = 2; n <= 24; n++) {
    const event = structuredClone(input.events[0]);
    event.event_ref = `event:${n}`; event.revision_ref = `ev:revision${n}`;
    event.project_binding_ref = `ev:binding${n}`;
    event.facts = [{ fact_ref: `ev:fact${n}`, text: `Synthetic fact ${n}` }];
    event.facts_sha256 = hashWorkIntakeFacts(event.facts);
    event.evidence_refs = [event.revision_ref, event.project_binding_ref, event.facts[0].fact_ref];
    input.events.push(event);
  }
  const result = await syntheticResult(input);
  assert.ok(result.hold_codes.includes("SOURCE_EVIDENCE_LIMIT_EXCEEDED"));
  assert.ok(result.attempts.every((attempt) => attempt.shadow_cycle === null));
});
