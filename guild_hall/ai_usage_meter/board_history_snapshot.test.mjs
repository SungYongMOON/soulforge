import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  createBoardUsageHistorySnapshot,
  loadBoardUsageHistorySnapshot,
  validateBoardUsageHistorySnapshot,
  writeBoardUsageHistorySnapshot,
} from "./board_history_snapshot.mjs";
import { runCli } from "./cli.mjs";
import { persistUsageEvents } from "./usage_meter.mjs";

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

function persistedUsageEvent({ eventId, threadId, turnId, startedAt }) {
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
    source: { kind: "codex_session_jsonl", source_ref: "synthetic-ref", originator: null },
    actor: { node_id: "node-a", agent_id: "agent-a", agent_depth: 0, role: "executor" },
    model: { id: "gpt-5.6-terra", reasoning_effort: "max", service_tier: "standard", context_window: null },
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
    credits: {
      status: "calculated",
      rate_card_id: "synthetic-card",
      service_tier: "standard",
      total: 0.01,
      components: { uncached_input: 0.005, cached_input: 0, cache_write_input: 0, output: 0.005 },
    },
    time: { started_at: startedAt, completed_at: new Date(Date.parse(startedAt) + 1_000).toISOString(), duration_ms: 1000 },
    rate_limit_snapshot: null,
    measurement: { status: "complete", token_confidence: "exact_cumulative_delta", attribution_confidence: "explicit_binding" },
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

  assert.doesNotMatch(JSON.stringify(snapshot), /raw-session-must-not-appear|source_ref|thread_id|prompt|message|tool_payload/u);
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
    assert.doesNotMatch(persisted, /source_ref|thread_id|raw-session|prompt|message/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Board usage history static schema rejects extra fields while the runtime validator enforces reconciliation", async () => {
  const schema = JSON.parse(await readFile(new URL("./ai_usage_board_history_snapshot.v2.schema.json", import.meta.url), "utf8"));
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
