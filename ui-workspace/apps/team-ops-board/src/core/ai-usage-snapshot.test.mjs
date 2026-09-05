import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_USAGE_BOARD_SNAPSHOT_SCHEMA,
  createUnmeasuredAiUsageSnapshot,
  normalizeAiUsageSnapshot,
  reconcileAiUsageSnapshot
} from "./ai-usage-snapshot.mjs";

function snapshotFixture() {
  return {
    schema_version: AI_USAGE_BOARD_SNAPSHOT_SCHEMA,
    generated_at: "2026-08-03T10:00:00.000Z",
    health: { hook_status: "ok", pending_event_count: 0 },
    coverage: {
      status: "complete",
      measured_turns: 3,
      total_turns: 3,
      unassigned_turns: 2,
      rate_unknown_turns: 0,
      issue_count: 0
    },
    totals: { turns: 3, total_tokens: 1200, credits: 0.42, credit_unknown_turns: 0 },
    roles: [
      { role: "CEO", turns: 1, total_tokens: 200, credits: 0.07, credit_unknown_turns: 0 },
      { role: "unassigned", turns: 2, total_tokens: 1000, credits: 0.35, credit_unknown_turns: 0 }
    ],
    model_effort: [
      {
        model: "gpt-5.6-terra",
        reasoning_effort: "xhigh",
        turns: 2,
        total_tokens: 1000,
        credits: 0.35,
        credit_unknown_turns: 0
      },
      {
        model: "UNKNOWN",
        reasoning_effort: "UNKNOWN",
        turns: 1,
        total_tokens: 200,
        credits: 0.07,
        credit_unknown_turns: 0
      }
    ],
    activity: {
      execution_turns: 1,
      coordination_turns: 1,
      review_turns: 1,
      fan_out_turns: 1,
      retry_count: 0,
      timeout_count: 0
    }
  };
}

test("AI usage snapshot: accepts an allowlisted reconciled projection", () => {
  const result = normalizeAiUsageSnapshot(snapshotFixture());

  assert.equal(result.state, "ready");
  assert.equal(result.snapshot.totals.total_tokens, 1200);
  assert.equal(result.snapshot.coverage.unassigned_turns, 2);
  assert.equal(result.snapshot.coverage.rate_unknown_turns, 0);
  assert.equal(result.snapshot.coverage.issue_count, 0);
  assert.deepEqual(reconcileAiUsageSnapshot(result.snapshot), {
    ok: true,
    role_totals: { turns: 3, total_tokens: 1200, credits: 0.42, credit_unknown_turns: 0 },
    model_effort_totals: { turns: 3, total_tokens: 1200, credits: 0.42, credit_unknown_turns: 0 },
    known_credits_reconcile: true,
    credit_unknown_turns_reconcile: true
  });
});

test("AI usage snapshot: missing, malformed, unknown, and protected input stays unmeasured", () => {
  const missing = normalizeAiUsageSnapshot(null);
  assert.equal(missing.state, "unmeasured");
  assert.deepEqual(missing.snapshot, createUnmeasuredAiUsageSnapshot());

  const unknownField = { ...snapshotFixture(), debug: "not-for-ui" };
  const protectedField = { ...snapshotFixture(), raw_prompt: "not-for-ui" };
  for (const input of [unknownField, protectedField, "not an object"]) {
    const result = normalizeAiUsageSnapshot(input);
    assert.equal(result.state, "invalid");
    assert.equal(JSON.stringify(result.snapshot).includes("not-for-ui"), false);
  }
});

test("AI usage snapshot: fallback labels never guess unknown role or model values", () => {
  const input = snapshotFixture();
  input.roles[0].role = "";
  input.model_effort[0].model = ["C:", "\\runtime\\session"].join("");
  input.model_effort[0].reasoning_effort = "";
  input.coverage.unassigned_turns = 3;

  const result = normalizeAiUsageSnapshot(input);
  assert.equal(result.state, "ready");
  assert.equal(result.snapshot.roles[0].role, "unassigned");
  assert.equal(result.snapshot.model_effort[0].model, "UNKNOWN");
  assert.equal(result.snapshot.model_effort[0].reasoning_effort, "UNKNOWN");
});

test("AI usage snapshot: hand-crafted private labels never render", () => {
  const input = snapshotFixture();
  input.roles[0].role = "private customer";
  input.model_effort[0].model = "private model";
  input.model_effort[0].reasoning_effort = "private effort";
  input.coverage.unassigned_turns = 3;

  const result = normalizeAiUsageSnapshot(input);
  assert.equal(result.state, "ready");
  assert.equal(result.snapshot.roles[0].role, "unassigned");
  assert.equal(result.snapshot.model_effort[0].model, "UNKNOWN");
  assert.equal(result.snapshot.model_effort[0].reasoning_effort, "UNKNOWN");
  assert.equal(JSON.stringify(result.snapshot).includes("private"), false);
});

test("AI usage snapshot: roles and model/effort rows reconcile every aggregate", () => {
  const invalidMutations = [
    ["role turns", (input) => { input.roles[1].turns = 1; }],
    ["model turns", (input) => { input.model_effort[1].turns = 0; }],
    ["role tokens", (input) => { input.roles[1].total_tokens = 999; }],
    ["model tokens", (input) => { input.model_effort[1].total_tokens = 199; }],
    ["role credits", (input) => { input.roles[1].credits = 0.34; }],
    ["model credits", (input) => { input.model_effort[1].credits = 0.08; }],
    ["role unknown credits", (input) => { input.roles[1].credit_unknown_turns = 1; }],
    ["model unknown credits", (input) => { input.model_effort[1].credit_unknown_turns = 1; }]
  ];

  for (const [name, mutate] of invalidMutations) {
    const input = snapshotFixture();
    mutate(input);
    assert.equal(normalizeAiUsageSnapshot(input).state, "invalid", name);
  }
});

test("AI usage snapshot: coverage never understates sanitized unassigned roles", () => {
  const input = snapshotFixture();
  input.roles[0].role = "not-allowlisted";

  assert.equal(normalizeAiUsageSnapshot(input).state, "invalid");
});

test("AI usage snapshot: credit totals distinguish null from a known aggregate", () => {
  const input = snapshotFixture();
  input.totals.credits = null;

  assert.equal(normalizeAiUsageSnapshot(input).state, "invalid");
});

test("AI usage snapshot: coverage measures every total turn and complete has no issues", () => {
  const partialWithIssue = snapshotFixture();
  partialWithIssue.coverage.status = "partial";
  partialWithIssue.coverage.issue_count = 1;
  assert.equal(normalizeAiUsageSnapshot(partialWithIssue).state, "ready");

  const measuredMismatch = snapshotFixture();
  measuredMismatch.coverage.status = "partial";
  measuredMismatch.coverage.measured_turns = 2;
  assert.equal(normalizeAiUsageSnapshot(measuredMismatch).state, "invalid");

  const completeWithIssue = snapshotFixture();
  completeWithIssue.coverage.issue_count = 1;
  assert.equal(normalizeAiUsageSnapshot(completeWithIssue).state, "invalid");

  const completeWithMismatch = snapshotFixture();
  completeWithMismatch.coverage.total_turns = 4;
  assert.equal(normalizeAiUsageSnapshot(completeWithMismatch).state, "invalid");

  const invalidIssueCount = snapshotFixture();
  invalidIssueCount.coverage.status = "partial";
  invalidIssueCount.coverage.issue_count = -1;
  assert.equal(normalizeAiUsageSnapshot(invalidIssueCount).state, "invalid");

  const excessiveUnassigned = snapshotFixture();
  excessiveUnassigned.coverage.status = "partial";
  excessiveUnassigned.coverage.total_turns = 4;
  excessiveUnassigned.coverage.unassigned_turns = 4;
  assert.equal(normalizeAiUsageSnapshot(excessiveUnassigned).state, "invalid");

  const rateUnknownMismatch = snapshotFixture();
  rateUnknownMismatch.coverage.rate_unknown_turns = 1;
  assert.equal(normalizeAiUsageSnapshot(rateUnknownMismatch).state, "invalid");
});

test("AI usage snapshot: activity turn classifications and fan-out stay bounded", () => {
  const activityMismatch = snapshotFixture();
  activityMismatch.activity.execution_turns = 2;
  assert.equal(normalizeAiUsageSnapshot(activityMismatch).state, "invalid");

  const excessiveFanOut = snapshotFixture();
  excessiveFanOut.activity.fan_out_turns = 4;
  assert.equal(normalizeAiUsageSnapshot(excessiveFanOut).state, "invalid");

  const negativeActivity = snapshotFixture();
  negativeActivity.activity.retry_count = -1;
  assert.equal(normalizeAiUsageSnapshot(negativeActivity).state, "invalid");

  const nonFiniteActivity = snapshotFixture();
  nonFiniteActivity.activity.timeout_count = Infinity;
  assert.equal(normalizeAiUsageSnapshot(nonFiniteActivity).state, "invalid");
});

test("AI usage snapshot: decimal credit reconciliation tolerates representation noise only", () => {
  const input = snapshotFixture();
  input.coverage.unassigned_turns = 0;
  input.totals.credits = 127854.6624015;
  input.roles = [{
    role: "executor",
    turns: 3,
    total_tokens: 1200,
    credits: 127854.66240150001,
    credit_unknown_turns: 0
  }];
  input.model_effort = [{
    model: "gpt-5.6-terra",
    reasoning_effort: "xhigh",
    turns: 3,
    total_tokens: 1200,
    credits: 127854.66240150001,
    credit_unknown_turns: 0
  }];
  assert.equal(normalizeAiUsageSnapshot(input).state, "ready");

  input.model_effort[0].credits += 0.000001;
  assert.equal(normalizeAiUsageSnapshot(input).state, "invalid");
});
