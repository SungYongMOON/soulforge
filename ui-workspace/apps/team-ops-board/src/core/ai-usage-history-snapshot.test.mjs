import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  AI_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA,
  AI_USAGE_HISTORY_TIMEZONE,
  AI_USAGE_HISTORY_WINDOWS,
  AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
  AI_USAGE_READ_ONLY_PROJECTION_SCHEMA,
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

function claudeCollectionFixture({
  state = "observed",
  attemptedAt = AT,
  freshnessThresholdSeconds = 900
} = {}) {
  const details = {
    observed: {
      reason: "source_observed",
      counts: { session_file_count: 1, parsed_session_count: 1, observed_message_count: 1, accepted_event_count: 1, duplicate_message_count: 0, issue_count: 0 }
    },
    available_empty: {
      reason: "source_accessible_empty",
      counts: { session_file_count: 1, parsed_session_count: 1, observed_message_count: 0, accepted_event_count: 0, duplicate_message_count: 0, issue_count: 0 }
    },
    missing: {
      reason: "projects_root_missing",
      counts: { session_file_count: 0, parsed_session_count: 0, observed_message_count: 0, accepted_event_count: 0, duplicate_message_count: 0, issue_count: 0 }
    },
    partial: {
      reason: "source_partial",
      counts: { session_file_count: 1, parsed_session_count: 1, observed_message_count: 1, accepted_event_count: 0, duplicate_message_count: 0, issue_count: 1 }
    },
    error: {
      reason: "collector_error",
      counts: { session_file_count: 0, parsed_session_count: 0, observed_message_count: 0, accepted_event_count: 0, duplicate_message_count: 0, issue_count: 1 }
    },
    unknown: {
      reason: "attempt_unavailable",
      counts: { session_file_count: 0, parsed_session_count: 0, observed_message_count: 0, accepted_event_count: 0, duplicate_message_count: 0, issue_count: 0 }
    }
  }[state];
  const attempted_at = state === "unknown" ? null : attemptedAt;
  const freshness = attempted_at === null
    ? "unknown"
    : Date.parse(AT) - Date.parse(attempted_at) > freshnessThresholdSeconds * 1_000
      ? "stale"
      : Date.parse(AT) - Date.parse(attempted_at) < 0
        ? "unknown"
        : "fresh";
  return {
    schema_version: "soulforge.ai_usage_claude_collection_projection.v1",
    state,
    reason: details.reason,
    attempted_at,
    freshness_threshold_seconds: freshnessThresholdSeconds,
    freshness,
    counts: details.counts,
    evidence_scope: "collector_attempt_source_observation_only",
    claim_scope: "does_not_prove_provider_availability_health_live_e2e_or_aggregate_health_or_completeness"
  };
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
    },
    provider_rows: [
      { provider: "claude", turns: 1, total_tokens: 50, latest_usage_at: "2026-08-04T00:59:00.000Z" }
    ],
    provider_daily: Array.from({ length: 30 }, (_, index) => ({
      date: new Date(Date.parse("2026-07-06T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10),
      providers: [
        { provider: "codex", total_tokens: null, token_unknown_turns: 0, credits: null, credit_unknown_turns: 0 },
        { provider: "claude", total_tokens: index === 29 ? 50 : null, token_unknown_turns: 0, credits: null, credit_unknown_turns: index === 29 ? 1 : 0 },
        { provider: "antigravity", total_tokens: null, token_unknown_turns: index === 28 ? 3 : 0, credits: null, credit_unknown_turns: 0 },
      ],
    })),
    claude_collection: claudeCollectionFixture()
  };
}

test("AI usage history projection accepts strict KST windows and reconciled exact-ID rankings", () => {
  const projection = normalizeAiUsageHistoryProjection(historyFixture());

  assert.equal(projection.state, "ready");
  assert.equal(projection.history?.timezone, "Asia/Seoul");
  assert.equal(projection.history?.windows.all_time.breakdowns.tasks.top[0].task_id, "task-a");
  assert.equal(projection.history?.windows.all_time.breakdowns.models.top[0].model_id, "gpt-5.6-terra");
  assert.equal(projection.history?.provider_daily.length, 30);
  assert.equal(projection.history?.provider_daily.at(-1).providers[1].total_tokens, 50);
  assert.equal(projection.history?.provider_daily.at(-2).providers[2].token_unknown_turns, 3);
  assert.deepEqual(projection.history?.windows.all_time.totals, METRICS);
  assert.equal(projection.history?.activity.daily.at(-1).date, "2026-08-04");
  assert.equal(projection.history?.activity.hourly[10].turns, 1);
  assert.equal(projection.history?.rate_limit?.used_percent, 99);
  assert.equal(projection.history?.rate_limit?.plan_type, "pro");
  assert.equal(projection.provider_evidence?.claude.value_state, "ledger_fresh");
  assert.equal(projection.provider_evidence?.claude.ledger_freshness, "fresh");
  assert.equal(projection.provider_evidence?.claude.ledger_freshness_threshold_seconds, 900);
  assert.equal(projection.provider_evidence?.claude.total_tokens, 50);
  assert.equal(projection.provider_evidence?.claude.latest_usage_at, "2026-08-04T00:59:00.000Z");
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

test("v2 history accepts aggregate fields but normalizes Claude provider evidence to UNKNOWN", () => {
  const v2 = historyFixture();
  v2.schema_version = AI_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA;
  delete v2.provider_rows;
  delete v2.provider_daily;
  delete v2.claude_collection;
  const projection = normalizeAiUsageHistoryProjection(v2);
  assert.equal(projection.state, "ready");
  assert.equal(projection.provider_evidence?.claude.state, "UNKNOWN");
  assert.equal(projection.provider_evidence?.claude.total_tokens, null);
  assert.equal(projection.provider_evidence?.claude.latest_usage_at, null);
  assert.equal(projection.provider_evidence?.claude.ledger_freshness, "unknown");
});

test("valid Claude ledger evidence remains visible independently from collection-attempt state", () => {
  for (const state of ["unknown", "error", "missing", "partial"]) {
    const fixture = historyFixture();
    fixture.claude_collection = claudeCollectionFixture({ state });
    const projection = normalizeAiUsageHistoryProjection(fixture);
    assert.equal(projection.state, "ready", state);
    assert.equal(projection.provider_evidence?.claude.state, state, state);
    assert.equal(projection.provider_evidence?.claude.value_state, "ledger_fresh", state);
    assert.equal(projection.provider_evidence?.claude.ledger_freshness, "fresh", state);
    assert.equal(projection.provider_evidence?.claude.total_tokens, 50, state);
    assert.equal(projection.provider_evidence?.claude.latest_usage_at, "2026-08-04T00:59:00.000Z", state);
  }

  const staleCollection = historyFixture();
  staleCollection.claude_collection = claudeCollectionFixture({
    state: "observed",
    attemptedAt: "2026-08-04T00:00:00.000Z",
    freshnessThresholdSeconds: 60
  });
  staleCollection.provider_rows[0].latest_usage_at = "2026-08-04T00:59:30.000Z";
  const staleCollectionProjection = normalizeAiUsageHistoryProjection(staleCollection);
  assert.equal(staleCollectionProjection.provider_evidence?.claude.freshness, "stale");
  assert.equal(staleCollectionProjection.provider_evidence?.claude.ledger_freshness, "fresh");
  assert.equal(staleCollectionProjection.provider_evidence?.claude.total_tokens, 50);
});

test("Claude ledger freshness follows latest_usage_at even when collection attempt is fresh", () => {
  const fixture = historyFixture();
  fixture.provider_rows[0].latest_usage_at = "2026-08-04T00:00:00.000Z";
  fixture.claude_collection = claudeCollectionFixture({
    state: "observed",
    attemptedAt: AT,
    freshnessThresholdSeconds: 60
  });
  const projection = normalizeAiUsageHistoryProjection(fixture);
  assert.equal(projection.state, "ready");
  assert.equal(projection.provider_evidence?.claude.freshness, "fresh");
  assert.equal(projection.provider_evidence?.claude.ledger_freshness, "stale");
  assert.equal(projection.provider_evidence?.claude.ledger_freshness_threshold_seconds, 60);
  assert.equal(projection.provider_evidence?.claude.value_state, "ledger_stale");
  assert.equal(projection.provider_evidence?.claude.total_tokens, 50);
  assert.equal(projection.provider_evidence?.claude.latest_usage_at, "2026-08-04T00:00:00.000Z");
});

test("Claude zero is exposed only for a fresh successful empty collection window", () => {
  const empty = historyFixture();
  empty.provider_rows = [];
  empty.claude_collection = claudeCollectionFixture({ state: "available_empty" });
  const emptyProjection = normalizeAiUsageHistoryProjection(empty);
  assert.equal(emptyProjection.provider_evidence?.claude.value_state, "validated_empty");
  assert.equal(emptyProjection.provider_evidence?.claude.total_tokens, 0);
  assert.equal(emptyProjection.provider_evidence?.claude.latest_usage_at, null);

  const staleEmpty = historyFixture();
  staleEmpty.provider_rows = [];
  staleEmpty.claude_collection = claudeCollectionFixture({
    state: "available_empty",
    attemptedAt: "2026-08-04T00:00:00.000Z",
    freshnessThresholdSeconds: 1
  });
  const staleEmptyProjection = normalizeAiUsageHistoryProjection(staleEmpty);
  assert.equal(staleEmptyProjection.provider_evidence?.claude.value_state, "masked");
  assert.equal(staleEmptyProjection.provider_evidence?.claude.total_tokens, null);

  const noRow = historyFixture();
  noRow.provider_rows = [];
  const noRowProjection = normalizeAiUsageHistoryProjection(noRow);
  assert.equal(noRowProjection.state, "ready");
  assert.equal(noRowProjection.provider_evidence?.claude.value_state, "masked");
  assert.equal(noRowProjection.provider_evidence?.claude.total_tokens, null);

  const futureAttempt = historyFixture();
  futureAttempt.claude_collection = claudeCollectionFixture({
    state: "observed",
    attemptedAt: "2026-08-04T01:01:00.000Z"
  });
  const futureProjection = normalizeAiUsageHistoryProjection(futureAttempt);
  assert.equal(futureProjection.state, "invalid");
  assert.equal(futureProjection.provider_evidence?.claude.total_tokens, null);
});

test("v3 provider evidence fails closed on future rows, broken collection reconciliation, and protected keys", () => {
  const futureRow = historyFixture();
  futureRow.provider_rows[0].latest_usage_at = "2026-08-04T01:01:00.000Z";
  assert.equal(normalizeAiUsageHistoryProjection(futureRow).state, "invalid");

  const mismatch = historyFixture();
  mismatch.claude_collection.counts.accepted_event_count = 2;
  assert.equal(normalizeAiUsageHistoryProjection(mismatch).state, "invalid");

  const protectedInput = historyFixture();
  protectedInput.claude_collection.counts.raw_path = "RAW_CLAUDE_COUNT_MUST_NOT_PROJECT";
  const result = normalizeAiUsageHistoryProjection(protectedInput);
  assert.equal(result.state, "invalid");
  assert.equal(JSON.stringify(result).includes("RAW_CLAUDE_COUNT_MUST_NOT_PROJECT"), false);
});

test("read-only envelope is required to expose v3 Claude evidence", () => {
  const projection = normalizeAiUsageHistoryProjection({
    schema_version: AI_USAGE_READ_ONLY_PROJECTION_SCHEMA,
    read_only: 1,
    snapshot: historyFixture()
  });
  assert.equal(projection.state, "ready");
  assert.equal(projection.read_only, 1);
  assert.equal(projection.provider_evidence?.claude.total_tokens, 50);
  assert.equal(projection.provider_evidence?.claude.value_state, "ledger_fresh");

  const invalid = normalizeAiUsageHistoryProjection({
    schema_version: AI_USAGE_READ_ONLY_PROJECTION_SCHEMA,
    read_only: 0,
    snapshot: historyFixture()
  });
  assert.equal(invalid.state, "invalid");
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
