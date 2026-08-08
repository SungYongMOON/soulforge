import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  AI_USAGE_HISTORY_TIMEZONE,
  AI_USAGE_HISTORY_WINDOWS,
  AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
  normalizeAiUsageHistoryProjection
} from "./ai-usage-history-snapshot.mjs";

const AT = "2026-08-04T01:00:00.000Z";
const METRICS = { turns: 1, total_tokens: 50, credits: 0.1, credit_unknown_turns: 0 };

function currentFixture() {
  return {
    schema_version: "soulforge.ai_usage_board_snapshot.v1",
    generated_at: AT,
    health: { hook_status: "ok", pending_event_count: 0 },
    coverage: {
      status: "partial",
      measured_turns: 1,
      total_turns: 1,
      unassigned_turns: 0,
      rate_unknown_turns: 0,
      issue_count: 0
    },
    totals: { ...METRICS },
    roles: [{ role: "executor", ...METRICS }],
    model_effort: [{ model: "gpt-5.6-terra", reasoning_effort: "high", ...METRICS }],
    activity: {
      execution_turns: 1,
      coordination_turns: 0,
      review_turns: 0,
      fan_out_turns: 0,
      retry_count: 0,
      timeout_count: 0
    }
  };
}

function breakdown(idKey, id) {
  return { top: [{ [idKey]: id, ...METRICS }], other: { turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 } };
}

function historyFixture() {
  const makeWindow = () => ({
    start_at: null,
    end_at: null,
    totals: { ...METRICS },
    breakdowns: {
      projects: breakdown("project_id", "project-a"),
      works: breakdown("work_id", "work-a"),
      tasks: breakdown("task_id", "task-a"),
      models: breakdown("model_id", "gpt-5.6-terra")
    }
  });
  return {
    schema_version: AI_USAGE_HISTORY_SNAPSHOT_SCHEMA,
    generated_at: AT,
    timezone: AI_USAGE_HISTORY_TIMEZONE,
    reference_at: AT,
    top_n: 1,
    current: currentFixture(),
    windows: Object.fromEntries(AI_USAGE_HISTORY_WINDOWS.map((name) => [name, makeWindow()])),
    activity: {
      daily: [
        { date: "2026-08-03", turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 },
        { date: "2026-08-04", turns: 1, total_tokens: 50, credits: 0.1, credit_unknown_turns: 0 }
      ],
      hourly: Array.from({ length: 24 }, (_, hour) => (
        hour === 10 ? { hour, turns: 1, total_tokens: 50 } : { hour, turns: 0, total_tokens: 0 }
      ))
    },
    rate_limit: {
      limit_id: "codex",
      plan_type: "pro",
      used_percent: 99,
      window_minutes: 10080,
      resets_at_epoch_s: 1786163319,
      observed_at: AT
    }
  };
}

test("AI usage history projection accepts strict KST windows and reconciled exact-ID rankings", () => {
  const projection = normalizeAiUsageHistoryProjection(historyFixture());

  assert.equal(projection.state, "ready");
  assert.equal(projection.history?.timezone, "Asia/Seoul");
  assert.equal(projection.history?.windows.all_time.breakdowns.tasks.top[0].task_id, "task-a");
  assert.equal(projection.history?.windows.all_time.breakdowns.models.top[0].model_id, "gpt-5.6-terra");
  assert.deepEqual(projection.history?.windows.all_time.totals, METRICS);
  assert.equal(projection.history?.activity.daily.at(-1).date, "2026-08-04");
  assert.equal(projection.history?.activity.hourly[10].turns, 1);
  assert.equal(projection.history?.rate_limit?.used_percent, 99);
  assert.equal(projection.history?.rate_limit?.plan_type, "pro");
});

test("AI usage history projection rejects unreconciled hourly activity and malformed rate limits", () => {
  const badHourly = historyFixture();
  badHourly.activity.hourly[3] = { hour: 3, turns: 5, total_tokens: 0 };
  assert.equal(normalizeAiUsageHistoryProjection(badHourly).state, "invalid");

  const badRate = historyFixture();
  badRate.rate_limit = { ...badRate.rate_limit, used_percent: 2000 };
  assert.equal(normalizeAiUsageHistoryProjection(badRate).state, "invalid");

  const noRate = historyFixture();
  noRate.rate_limit = null;
  const projection = normalizeAiUsageHistoryProjection(noRate);
  assert.equal(projection.state, "ready");
  assert.equal(projection.history?.rate_limit, null);
});

test("AI usage history projection rejects non-reconciled or protected history input", () => {
  const mismatch = historyFixture();
  mismatch.windows.all_time.breakdowns.projects.top[0].total_tokens = 49;
  assert.equal(normalizeAiUsageHistoryProjection(mismatch).state, "invalid");

  const protectedInput = historyFixture();
  protectedInput.windows.all_time.breakdowns.tasks.top[0].raw_path = "RAW_HISTORY_MUST_NOT_PROJECT";
  const result = normalizeAiUsageHistoryProjection(protectedInput);
  assert.equal(result.state, "invalid");
  assert.equal(JSON.stringify(result).includes("RAW_HISTORY_MUST_NOT_PROJECT"), false);
});

test("AI usage history projection preserves a legacy v1 aggregate as a no-history fallback", () => {
  const projection = normalizeAiUsageHistoryProjection(currentFixture());
  assert.equal(projection.state, "ready");
  assert.equal(projection.history, null);
});

test("AI usage history projection keeps a validated last-good snapshot while refresh is in progress", () => {
  const projection = normalizeAiUsageHistoryProjection({
    schema_version: AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: "refreshing",
    snapshot: historyFixture()
  });
  assert.equal(projection.state, "ready");
  assert.equal(projection.refresh_state, "refreshing");

  const hold = normalizeAiUsageHistoryProjection({
    schema_version: AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: "hold",
    snapshot: null
  });
  assert.equal(hold.state, "unmeasured");
  assert.equal(hold.refresh_state, "hold");
});
