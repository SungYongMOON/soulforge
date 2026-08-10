import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  BOARD_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA,
  createBoardUsageHistorySnapshot,
  loadBoardUsageHistorySnapshot,
  loadReadOnlyBoardUsageProjection,
  validateBoardUsageHistorySnapshot,
  validateReadOnlyBoardUsageProjection,
  writeBoardUsageHistorySnapshot,
} from "./board_history_snapshot.mjs";
import { runCli } from "./cli.mjs";
import { loadPersistedUsageEvents, persistUsageEvents } from "./usage_meter.mjs";

function event({
  id,
  thread,
  startedAt,
  project = "project-a",
  work = "work-a",
  tokens = 10,
  credit = 0.01,
  role = "executor",
  model = "gpt-5.6-terra",
  effort = "max",
  parent = null,
  rateLimit = null,
}) {
  return {
    event_id: id,
    thread_id: thread,
    project_id: project,
    work_id: work,
    team_id: "team-a",
    parent_thread_id: parent,
    actor: { role },
    model: { id: model, reasoning_effort: effort },
    usage: { total_tokens: tokens },
    credits: { total: credit },
    time: { started_at: startedAt },
    source: { source_ref: "raw-session-must-not-appear" },
    rate_limit_snapshot: rateLimit,
  };
}

function totals(snapshot, name) {
  return snapshot.windows[name].totals;
}

function persistedUsageEvent({
  eventId,
  threadId,
  turnId,
  startedAt,
  sourceKind = "codex_session_jsonl",
  model = "gpt-5.6-terra",
}) {
  const tokenConfidence = sourceKind === "claude_session_jsonl"
    ? "exact_per_message"
    : sourceKind === "antigravity_conversation_db"
      ? "request_count_only"
      : "exact_cumulative_delta";
  const credits = sourceKind === "codex_session_jsonl"
    ? {
      status: "calculated",
      rate_card_id: "synthetic-card",
      service_tier: "standard",
      total: 0.01,
      components: { uncached_input: 0.005, cached_input: 0, cache_write_input: 0, output: 0.005 },
    }
    : {
      status: "rate_unknown",
      rate_card_id: "unpriced",
      service_tier: "standard",
      total: null,
      components: null,
    };
  return {
    schema_version: "soulforge.ai_usage_event.v1",
    event_id: eventId,
    organization_id: "org-a",
    team_id: "team-a",
    project_id: "project-a",
    work_id: "work-a",
    thread_id: threadId,
    turn_id: turnId,
    parent_thread_id: null,
    root_thread_id: threadId,
    root_turn_id: turnId,
    source: { kind: sourceKind, source_ref: "synthetic-ref", originator: null },
    actor: { node_id: "node-a", agent_id: "agent-a", agent_depth: 0, role: "executor" },
    model: { id: model, reasoning_effort: "max", service_tier: "standard", context_window: null },
    usage: {
      input_tokens: 5,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 0,
      total_tokens: 10,
      uncached_input_tokens: 5,
      model_invocation_count: 1,
      max_invocation_input_tokens: 5,
    },
    credits,
    time: { started_at: startedAt, completed_at: new Date(Date.parse(startedAt) + 1_000).toISOString(), duration_ms: 1000 },
    rate_limit_snapshot: null,
    measurement: {
      status: "complete",
      token_confidence: tokenConfidence,
      attribution_confidence: sourceKind === "codex_session_jsonl" ? "explicit_binding" : "derived_lineage",
    },
    privacy: { metadata_only: true, prompt_captured: false, reasoning_captured: false, tool_payload_captured: false },
  };
}

test("Board usage history snapshots use Asia/Seoul calendar and rolling half-open windows", () => {
  const referenceAt = "2026-08-03T03:00:00.000Z";
  const snapshot = createBoardUsageHistorySnapshot([
    event({ id: "history-before-month", thread: "task-before-month", startedAt: "2026-07-31T14:59:59.999Z", project: "project-b", tokens: 40, credit: 0.04 }),
    event({ id: "history-month-start", thread: "task-month-start", startedAt: "2026-07-31T15:00:00.000Z", project: "unassigned", work: "unknown", tokens: 60, credit: 0.06 }),
    event({ id: "history-rolling-start", thread: "task-rolling-start", startedAt: "2026-08-02T03:00:00.000Z", project: "project-a", tokens: 100, credit: 0.1 }),
    event({ id: "history-day-before", thread: "task-day-before", startedAt: "2026-08-02T14:59:59.999Z", project: "project-a", tokens: 70, credit: 0.07 }),
    event({ id: "history-day-start", thread: "task-day-start", startedAt: "2026-08-02T15:00:00.000Z", project: "project-c", tokens: 60, credit: 0.06 }),
    event({ id: "history-reference", thread: "task-reference", startedAt: referenceAt, project: "project-d", tokens: 10, credit: 0.01 }),
  ], {
    generatedAt: referenceAt,
    referenceAt,
    topN: 2,
    coverage: { scope: "full_sessions_root", issue_count: 0, unique_event_count: 6 },
    hookHealth: { status: "ok", observed_at: referenceAt },
    pendingEventCount: 0,
    toolEvents: [{ attempt: 2, retry_reason_code: "retry", timeout: true }],
  });

  assert.equal(snapshot.schema_version, BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA);
  assert.equal(snapshot.timezone, "Asia/Seoul");
  assert.equal(snapshot.current.coverage.status, "partial");
  assert.equal(snapshot.current.activity.retry_count, 1);
  assert.equal(snapshot.current.activity.timeout_count, 1);
  assert.equal(snapshot.current.totals.turns, 6);
  assert.equal(snapshot.windows.calendar_day.start_at, "2026-08-02T15:00:00.000Z");
  assert.equal(snapshot.windows.calendar_day.end_at, "2026-08-03T15:00:00.000Z");
  assert.equal(snapshot.windows.calendar_week.start_at, "2026-08-02T15:00:00.000Z");
  assert.equal(snapshot.windows.calendar_month.start_at, "2026-07-31T15:00:00.000Z");
  assert.equal(snapshot.windows.rolling_24h.start_at, "2026-08-02T03:00:00.000Z");
  assert.deepEqual(totals(snapshot, "calendar_day"), {
    turns: 2, total_tokens: 70, credits: 0.07, credit_unknown_turns: 0,
  });
  assert.deepEqual(totals(snapshot, "calendar_week"), totals(snapshot, "calendar_day"));
  assert.deepEqual(totals(snapshot, "rolling_24h"), {
    turns: 3, total_tokens: 230, credits: 0.23, credit_unknown_turns: 0,
  });
  assert.deepEqual(totals(snapshot, "calendar_month"), {
    turns: 5, total_tokens: 300, credits: 0.3, credit_unknown_turns: 0,
  });
  assert.deepEqual(totals(snapshot, "all_time"), {
    turns: 6, total_tokens: 340, credits: 0.34, credit_unknown_turns: 0,
  });
  assert.deepEqual(snapshot.windows.all_time.breakdowns.projects.top.map((row) => row.project_id), [
    "project-a", "project-c",
  ]);
  assert.deepEqual(snapshot.windows.all_time.breakdowns.projects.other, {
    turns: 3, total_tokens: 110, credits: 0.11, credit_unknown_turns: 0,
  });
  assert.equal(snapshot.windows.all_time.breakdowns.works.top[0].work_id, "work-a");
  assert.equal(snapshot.windows.all_time.breakdowns.tasks.top[0].task_id, "task-rolling-start");
  assert.equal(snapshot.windows.all_time.breakdowns.projects.top.find((row) => row.project_id === "unassigned"), undefined);
  assert.equal(snapshot.windows.all_time.breakdowns.projects.other.turns, 3);
  assert.equal(snapshot.current.totals.turns, snapshot.windows.all_time.totals.turns);
  assert.equal(snapshot.current.totals.total_tokens, snapshot.windows.all_time.totals.total_tokens);
  assert.equal(snapshot.current.totals.credits, snapshot.windows.all_time.totals.credits);

  assert.equal(snapshot.windows.all_time.breakdowns.models.top[0].model_id, "gpt-5.6-terra");
  assert.equal(snapshot.windows.all_time.breakdowns.models.top[0].turns, 6);
  assert.equal(snapshot.windows.all_time.breakdowns.models.other.turns, 0);

  assert.equal(snapshot.activity.daily.length, 40);
  assert.equal(snapshot.activity.daily.at(-1).date, "2026-08-03");
  assert.deepEqual(
    { ...snapshot.activity.daily.at(-1), date: undefined },
    { ...totals(snapshot, "calendar_day"), date: undefined },
  );
  assert.equal(snapshot.activity.hourly.length, 24);
  assert.equal(snapshot.activity.hourly.reduce((sum, row) => sum + row.turns, 0), 6);
  assert.equal(snapshot.activity.hourly.reduce((sum, row) => sum + row.total_tokens, 0), 340);
  assert.equal(snapshot.activity.hourly[0].turns, 2);
  assert.equal(snapshot.activity.hourly[12].turns, 2);

  assert.doesNotMatch(JSON.stringify(snapshot), /raw-session-must-not-appear|"(?:source_ref|thread_id|prompt|message|tool_payload)"\s*:/u);
});

test("Board usage history exposes the latest rate-limit snapshot with sanitized fields", () => {
  const snapshot = createBoardUsageHistorySnapshot([
    event({
      id: "rate-older", thread: "task-rate-a", startedAt: "2026-08-03T00:00:00.000Z",
      rateLimit: { limit_id: "codex", used_percent: 42, window_minutes: 10080, resets_at_epoch_s: 1786163319, plan_type: "pro" },
    }),
    event({
      id: "rate-newer", thread: "task-rate-b", startedAt: "2026-08-03T02:00:00.000Z",
      rateLimit: { limit_id: "codex", used_percent: 99, window_minutes: 10080, resets_at_epoch_s: 1786163319, plan_type: "무단 값" },
    }),
    event({ id: "rate-none", thread: "task-rate-c", startedAt: "2026-08-03T03:00:00.000Z" }),
  ], { generatedAt: "2026-08-03T03:30:00.000Z" });
  assert.deepEqual(snapshot.rate_limit, {
    limit_id: "codex",
    plan_type: null,
    used_percent: 99,
    window_minutes: 10080,
    resets_at_epoch_s: 1786163319,
    observed_at: "2026-08-03T02:00:00.000Z",
  });

  const none = createBoardUsageHistorySnapshot([
    event({ id: "rate-absent", thread: "task-rate-d", startedAt: "2026-08-03T00:00:00.000Z" }),
  ], { generatedAt: "2026-08-03T01:00:00.000Z" });
  assert.equal(none.rate_limit, null);
});

test("Board usage history deduplicates exact replays, normalizes unassigned dimensions, and rejects conflicts", () => {
  const replay = event({
    id: "history-replay",
    thread: "task-replay",
    startedAt: "2026-08-03T00:00:00.000Z",
    project: "unknown",
    work: "unassigned",
    tokens: 25,
    credit: null,
  });
  const snapshot = createBoardUsageHistorySnapshot([replay, structuredClone(replay)], {
    generatedAt: "2026-08-03T01:00:00.000Z",
    topN: 1,
  });
  assert.deepEqual(snapshot.windows.all_time.totals, {
    turns: 1, total_tokens: 25, credits: 0, credit_unknown_turns: 1,
  });
  assert.equal(snapshot.windows.all_time.breakdowns.projects.top[0].project_id, "unassigned");
  assert.equal(snapshot.windows.all_time.breakdowns.works.top[0].work_id, "unassigned");
  assert.throws(
    () => createBoardUsageHistorySnapshot([replay, { ...replay, usage: { total_tokens: 26 } }]),
    (error) => error?.code === "board_usage_history_event_id_conflict",
  );
});

test("Board usage history validator enforces top-N reconciliation, fixed boundaries, and raw exclusion", () => {
  const snapshot = createBoardUsageHistorySnapshot([
    event({ id: "history-validator-a", thread: "task-validator-a", startedAt: "2026-08-03T00:00:00.000Z", tokens: 10 }),
    event({ id: "history-validator-b", thread: "task-validator-b", startedAt: "2026-08-03T00:01:00.000Z", project: "project-b", tokens: 5 }),
  ], {
    generatedAt: "2026-08-03T02:00:00.000Z",
    topN: 1,
  });
  assert.deepEqual(validateBoardUsageHistorySnapshot(snapshot), snapshot);

  const badBoundary = structuredClone(snapshot);
  badBoundary.windows.calendar_day.start_at = "2026-08-02T00:00:00.000Z";
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badBoundary),
    (error) => error?.code === "board_usage_history_window_boundary_invalid",
  );

  const badSum = structuredClone(snapshot);
  badSum.windows.all_time.breakdowns.projects.other.total_tokens += 1;
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badSum),
    (error) => error?.code === "board_usage_history_breakdown_reconciliation_invalid",
  );

  const badRaw = { ...snapshot, raw_prompt: "not-permitted" };
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badRaw),
    (error) => error?.code === "board_usage_history_snapshot_invalid",
  );

  const badDailyDate = structuredClone(snapshot);
  badDailyDate.activity.daily[0].date = "1999-01-01";
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badDailyDate),
    (error) => error?.code === "board_usage_history_activity_daily_invalid",
  );

  const badHourly = structuredClone(snapshot);
  badHourly.activity.hourly[3].turns += 1;
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badHourly),
    (error) => error?.code === "board_usage_history_activity_hourly_reconciliation_invalid",
  );

  const badRateLimit = structuredClone(snapshot);
  badRateLimit.rate_limit = {
    limit_id: "codex", plan_type: "pro", used_percent: -1, window_minutes: null, resets_at_epoch_s: null,
    observed_at: "2026-08-03T00:00:00.000Z",
  };
  assert.throws(
    () => validateBoardUsageHistorySnapshot(badRateLimit),
    (error) => error?.code === "board_usage_history_rate_limit_invalid",
  );
});

test("Board usage history writer is atomic and only writes the validated sidecar", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-board-usage-history-"));
  try {
    const snapshot = createBoardUsageHistorySnapshot([
      event({ id: "history-writer", thread: "task-writer", startedAt: "2026-08-03T00:00:00.000Z" }),
    ], { generatedAt: "2026-08-03T01:00:00.000Z" });
    const output = path.join(root, "ai-usage-meter.history.snapshot.json");
    const written = await writeBoardUsageHistorySnapshot(output, snapshot);
    assert.deepEqual(written, snapshot);
    const persisted = await readFile(output, "utf8");
    assert.equal(JSON.parse(persisted).schema_version, BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA);
    assert.doesNotMatch(persisted, /raw-session|"(?:source_ref|thread_id|prompt|message)"\s*:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Board usage history static schema rejects extra fields while the runtime validator enforces reconciliation", async () => {
  const schema = JSON.parse(await readFile(new URL("./ai_usage_board_history_snapshot.v3.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(schema);
  const snapshot = createBoardUsageHistorySnapshot([
    event({ id: "history-schema", thread: "task-schema", startedAt: "2026-08-03T00:00:00.000Z" }),
  ], { generatedAt: "2026-08-03T01:00:00.000Z" });
  assert.equal(validate(snapshot), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...snapshot, extra: true }), false);
});

test("Board usage history loader and CLI require exact accepted thread IDs and exclude unrelated persisted events", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-board-usage-history-scope-"));
  try {
    await persistUsageEvents(state, [
      persistedUsageEvent({ eventId: "aue-history-scope", threadId: "task-scope", turnId: "turn-scope", startedAt: "2026-08-03T00:00:00.000Z" }),
      persistedUsageEvent({ eventId: "aue-history-unrelated", threadId: "task-unrelated", turnId: "turn-unrelated", startedAt: "2026-08-03T00:01:00.000Z" }),
    ]);
    await mkdir(path.join(state, "coverage"), { recursive: true });
    await writeFile(path.join(state, "coverage", "latest.json"), JSON.stringify({
      scope: "full_sessions_root", issue_count: 0, unique_event_count: 2,
    }));
    await assert.rejects(
      () => loadBoardUsageHistorySnapshot(state, { generatedAt: "2026-08-03T02:00:00.000Z" }),
      (error) => error?.code === "board_usage_history_thread_ids_required",
    );
    const loaded = await loadBoardUsageHistorySnapshot(state, {
      threadIds: ["task-scope"],
      generatedAt: "2026-08-03T02:00:00.000Z",
      referenceAt: "2026-08-03T02:00:00.000Z",
    });
    assert.equal(loaded.current.totals.turns, 1);
    assert.equal(loaded.current.coverage.total_turns, 1);
    assert.equal(loaded.windows.all_time.totals.turns, 1);
    assert.equal(loaded.windows.all_time.breakdowns.tasks.top[0].task_id, "task-scope");
    assert.doesNotMatch(JSON.stringify(loaded), /task-unrelated/u);

    const output = path.join(state, "history.snapshot.json");
    const currentOutput = path.join(state, "current.snapshot.json");
    const currentSnapshot = await runCli([
      "board-snapshot",
      "--state-root", state,
      "--thread-id", "task-scope",
      "--output", currentOutput,
    ]);
    assert.equal(currentSnapshot.totals.turns, 1);
    assert.equal(JSON.parse(await readFile(currentOutput, "utf8")).totals.turns, 1);
    const cliSnapshot = await runCli([
      "board-history-snapshot",
      "--state-root", state,
      "--thread-id", "task-scope",
      "--reference-at", "2026-08-03T02:00:00.000Z",
      "--top-n", "1",
      "--output", output,
    ]);
    assert.equal(cliSnapshot.windows.all_time.totals.turns, 1);
    assert.equal(JSON.parse(await readFile(output, "utf8")).windows.all_time.totals.turns, 1);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("Board usage history include-provider unions provider events while default scope stays codex-only", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-board-usage-history-providers-"));
  try {
    await persistUsageEvents(state, [
      persistedUsageEvent({ eventId: "aue-history-codex", threadId: "task-scope", turnId: "turn-codex", startedAt: "2026-08-03T00:00:00.000Z" }),
      persistedUsageEvent({
        eventId: "aue-history-claude",
        threadId: "claude-session-a",
        turnId: "msg_claude001",
        startedAt: "2026-08-03T00:01:00.000Z",
        sourceKind: "claude_session_jsonl",
      }),
      persistedUsageEvent({
        eventId: "aue-history-ag",
        threadId: "ag-conversation-a",
        turnId: "ag-conversation-a.0",
        startedAt: "2026-08-03T00:02:00.000Z",
        sourceKind: "antigravity_conversation_db",
      }),
    ]);

    const codexOnly = await loadBoardUsageHistorySnapshot(state, {
      threadIds: ["task-scope"],
      generatedAt: "2026-08-03T02:00:00.000Z",
      referenceAt: "2026-08-03T02:00:00.000Z",
    });
    assert.equal(codexOnly.windows.all_time.totals.turns, 1);
    assert.equal(codexOnly.windows.all_time.totals.credit_unknown_turns, 0);

    const withProviders = await loadBoardUsageHistorySnapshot(state, {
      threadIds: ["task-scope"],
      generatedAt: "2026-08-03T02:00:00.000Z",
      referenceAt: "2026-08-03T02:00:00.000Z",
      includeProviders: ["claude_session_jsonl", "antigravity_conversation_db"],
    });
    assert.equal(withProviders.windows.all_time.totals.turns, 3);
    assert.equal(withProviders.windows.all_time.totals.credit_unknown_turns, 2);
    assert.equal(withProviders.current.totals.turns, 3);
    assert.deepEqual(
      withProviders.windows.all_time.breakdowns.tasks.top.map((row) => row.task_id).sort(),
      ["ag-conversation-a", "claude-session-a", "task-scope"],
    );

    const output = path.join(state, "history.providers.snapshot.json");
    const cliSnapshot = await runCli([
      "board-history-snapshot",
      "--state-root", state,
      "--thread-id", "task-scope",
      "--include-provider", "claude_session_jsonl",
      "--include-provider", "antigravity_conversation_db",
      "--reference-at", "2026-08-03T02:00:00.000Z",
      "--output", output,
    ]);
    assert.equal(cliSnapshot.windows.all_time.totals.turns, 3);
    assert.equal(JSON.parse(await readFile(output, "utf8")).windows.all_time.totals.turns, 3);

    await assert.rejects(
      () => loadBoardUsageHistorySnapshot(state, {
        threadIds: ["task-scope"],
        generatedAt: "2026-08-03T02:00:00.000Z",
        includeProviders: ["unknown_provider"],
      }),
      (error) => error?.code === "board_snapshot_include_providers_invalid",
    );
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("Board history v3 attributes provider rows only from ledger source.kind", () => {
  const referenceAt = "2026-08-03T02:00:00.000Z";
  const snapshot = createBoardUsageHistorySnapshot([
    persistedUsageEvent({
      eventId: "provider-source-codex", threadId: "task-source-codex", turnId: "turn-source-codex",
      startedAt: "2026-08-03T00:00:00.000Z", sourceKind: "codex_session_jsonl", model: "claude-prefix-must-not-count",
    }),
    persistedUsageEvent({
      eventId: "provider-source-claude", threadId: "task-source-claude", turnId: "turn-source-claude",
      startedAt: "2026-08-03T00:01:00.000Z", sourceKind: "claude_session_jsonl", model: "gpt-5.6-terra",
    }),
    persistedUsageEvent({
      eventId: "provider-source-antigravity", threadId: "task-source-antigravity", turnId: "turn-source-antigravity",
      startedAt: "2026-08-03T00:02:00.000Z", sourceKind: "antigravity_conversation_db", model: "claude-prefix-must-not-count",
    }),
    {
      ...persistedUsageEvent({
        eventId: "provider-source-unknown", threadId: "task-source-unknown", turnId: "turn-source-unknown",
        startedAt: "2026-08-03T00:03:00.000Z", sourceKind: "codex_session_jsonl", model: "claude-prefix-must-not-count",
      }),
      source: { kind: "unrecognized_source_kind" },
    },
  ], {
    generatedAt: referenceAt,
    referenceAt,
    claudeCollection: {
      state: "observed",
      attempted_at: "2026-08-03T01:59:00.000Z",
      counts: {
        session_file_count: 1,
        parsed_session_count: 1,
        observed_message_count: 1,
        accepted_event_count: 1,
        duplicate_message_count: 0,
        issue_count: 0,
      },
    },
  });
  assert.deepEqual(snapshot.provider_rows, [
    { provider: "codex", turns: 1, total_tokens: 10, latest_usage_at: "2026-08-03T00:00:00.000Z" },
    { provider: "claude", turns: 1, total_tokens: 10, latest_usage_at: "2026-08-03T00:01:00.000Z" },
    { provider: "antigravity", turns: 1, total_tokens: 10, latest_usage_at: "2026-08-03T00:02:00.000Z" },
  ]);
  assert.equal(snapshot.provider_daily.length, 15);
  const providerDay = snapshot.provider_daily.find((row) => row.date === "2026-08-03");
  assert.deepEqual(providerDay.providers.map((row) => row.provider), ["codex", "claude", "antigravity"]);
  assert.deepEqual(providerDay.providers.map((row) => row.credits), [0.01, null, null]);
  assert.deepEqual(providerDay.providers.map((row) => row.total_tokens), [10, 10, null]);
  assert.deepEqual(providerDay.providers.map((row) => row.token_unknown_turns), [0, 0, 1]);
  assert.equal(snapshot.claude_collection.freshness, "fresh");

  const futureProviderTimestamp = structuredClone(snapshot);
  futureProviderTimestamp.provider_rows[1].latest_usage_at = "2026-08-03T02:00:01.000Z";
  assert.throws(
    () => validateBoardUsageHistorySnapshot(futureProviderTimestamp),
    (error) => error?.code === "board_usage_history_provider_rows_invalid",
  );
  const privateSentinel = structuredClone(snapshot);
  privateSentinel.claude_collection.counts.secret = 1;
  assert.throws(
    () => validateBoardUsageHistorySnapshot(privateSentinel),
    (error) => error?.code === "board_usage_history_snapshot_invalid",
  );
});

test("Board history v3 carries Claude collection state separately from aggregate generated_at", () => {
  const eventForClaude = persistedUsageEvent({
    eventId: "claude-freshness-event", threadId: "claude-freshness-session", turnId: "claude-freshness-turn",
    startedAt: "2026-08-03T00:00:00.000Z", sourceKind: "claude_session_jsonl",
  });
  const stale = createBoardUsageHistorySnapshot([eventForClaude], {
    generatedAt: "2026-08-03T02:00:00.000Z",
    referenceAt: "2026-08-03T02:00:00.000Z",
    claudeFreshnessThresholdSeconds: 60,
    claudeCollection: {
      state: "observed",
      attempted_at: "2026-08-03T00:00:00.000Z",
      counts: {
        session_file_count: 1,
        parsed_session_count: 1,
        observed_message_count: 1,
        accepted_event_count: 1,
        duplicate_message_count: 0,
        issue_count: 0,
      },
    },
  });
  assert.equal(stale.generated_at, "2026-08-03T02:00:00.000Z");
  assert.equal(stale.claude_collection.freshness, "stale");
  assert.equal(stale.claude_collection.freshness_threshold_seconds, 60);

  const futureAttempt = createBoardUsageHistorySnapshot([eventForClaude], {
    generatedAt: "2026-08-03T02:00:00.000Z",
    referenceAt: "2026-08-03T02:00:00.000Z",
    claudeCollection: {
      state: "observed",
      attempted_at: "2026-08-03T02:01:00.000Z",
      counts: {
        session_file_count: 1,
        parsed_session_count: 1,
        observed_message_count: 1,
        accepted_event_count: 1,
        duplicate_message_count: 0,
        issue_count: 0,
      },
    },
  });
  assert.equal(futureAttempt.claude_collection.freshness, "unknown");
  assert.equal(futureAttempt.claude_collection.state, "unknown");
  assert.equal(futureAttempt.claude_collection.attempted_at, null);
  assert.equal(futureAttempt.claude_collection.counts.accepted_event_count, 0);
  assert.equal(futureAttempt.claude_collection.reason, "attempt_timestamp_untrusted");
  const rejectedFutureAttempt = structuredClone(stale);
  rejectedFutureAttempt.claude_collection.attempted_at = "2026-08-03T02:01:00.000Z";
  rejectedFutureAttempt.claude_collection.freshness = "unknown";
  assert.throws(
    () => validateBoardUsageHistorySnapshot(rejectedFutureAttempt),
    (error) => error?.code === "claude_collection_freshness_invalid",
  );
  assert.doesNotMatch(JSON.stringify(futureAttempt), /source_ref|raw-session|credential|secret/u);
});

test("Board history v2 remains accepted without v3 provider evidence", () => {
  const v3 = createBoardUsageHistorySnapshot([
    event({ id: "history-v2-compat", thread: "task-v2-compat", startedAt: "2026-08-03T00:00:00.000Z" }),
  ], { generatedAt: "2026-08-03T01:00:00.000Z" });
  const v2 = structuredClone(v3);
  v2.schema_version = BOARD_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA;
  delete v2.provider_rows;
  delete v2.provider_daily;
  delete v2.claude_collection;
  const accepted = validateBoardUsageHistorySnapshot(v2);
  assert.equal(accepted.schema_version, BOARD_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA);
  assert.equal("provider_rows" in accepted, false);
  assert.equal("claude_collection" in accepted, false);
});

test("read-only Board usage projection only validates existing ledger data", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-board-usage-read-only-"));
  try {
    await persistUsageEvents(state, [
      persistedUsageEvent({
        eventId: "read-only-codex", threadId: "task-read-only", turnId: "turn-read-only",
        startedAt: "2026-08-03T00:00:00.000Z",
      }),
      persistedUsageEvent({
        eventId: "read-only-claude", threadId: "claude-read-only", turnId: "claude-read-only-turn",
        startedAt: "2026-08-03T00:01:00.000Z", sourceKind: "claude_session_jsonl",
      }),
    ]);
    const persistedBefore = JSON.stringify(await loadPersistedUsageEvents(state));
    const direct = await loadReadOnlyBoardUsageProjection(state, {
      threadIds: ["task-read-only"],
      generatedAt: "2026-08-03T02:00:00.000Z",
      referenceAt: "2026-08-03T02:00:00.000Z",
    });
    assert.equal(direct.read_only, 1);
    assert.equal(direct.snapshot.schema_version, BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA);
    assert.deepEqual(direct.snapshot.provider_rows.find((row) => row.provider === "claude"), {
      provider: "claude", turns: 1, total_tokens: 10, latest_usage_at: "2026-08-03T00:01:00.000Z",
    });
    assert.equal(direct.snapshot.claude_collection.state, "unknown");
    assert.equal(direct.snapshot.claude_collection.attempted_at, null);
    assert.deepEqual(validateReadOnlyBoardUsageProjection(direct), direct);

    const cli = await runCli([
      "usage-projection",
      "--read-only=1",
      "--state-root", state,
      "--thread-id", "task-read-only",
      "--include-provider", "claude_session_jsonl",
      "--reference-at", "2026-08-03T02:00:00.000Z",
    ]);
    assert.equal(cli.read_only, 1);
    assert.equal(cli.snapshot.claude_collection.state, "unknown");
    await assert.rejects(
      () => runCli(["usage-projection", "--read-only=1", "--state-root", state, "--thread-id", "task-read-only", "--apply"]),
      (error) => error?.code === "usage_projection_option_invalid",
    );
    await assert.rejects(
      () => runCli(["usage-projection", "--read-only=1", "--state-root", state, "--thread-id", "task-read-only", "--output", path.join(state, "forbidden.json")]),
      (error) => error?.code === "usage_projection_option_invalid",
    );
    assert.equal(JSON.stringify(await loadPersistedUsageEvents(state)), persistedBefore);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});
