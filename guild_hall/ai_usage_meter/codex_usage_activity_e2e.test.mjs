import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";

import {
  BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  BOARD_USAGE_HISTORY_SNAPSHOT_V3_SCHEMA,
  createBoardUsageHistorySnapshot,
  loadBoardUsageHistorySnapshot,
} from "./board_history_snapshot.mjs";
import { runCli } from "./cli.mjs";
import {
  loadCodexActivityProjection,
} from "./codex_usage_activity.mjs";
import {
  collectUsageObservations,
  loadPersistedUsageEvents,
  loadRateCard,
  persistUsageEvents,
} from "./usage_meter.mjs";

function createValidUsageEvent({
  eventId,
  threadId = "thread-a",
  turnId = "turn-a",
  projectId = "soulforge",
  workId = "work-a",
  modelId = "gpt-5.6-terra",
  tokens = 10,
  credits = 0.01,
  startedAt = "2026-08-03T12:00:00.000Z",
}) {
  return {
    schema_version: "soulforge.ai_usage_event.v1",
    event_id: eventId,
    organization_id: "soulforge",
    team_id: "team-a",
    project_id: projectId,
    work_id: workId,
    thread_id: threadId,
    turn_id: turnId,
    parent_thread_id: null,
    root_thread_id: threadId,
    root_turn_id: turnId,
    source: { kind: "codex_session_jsonl", source_ref: "synthetic-ref", originator: null },
    actor: { node_id: "node-a", agent_id: "agent-a", agent_depth: 0, role: "executor" },
    model: { id: modelId, reasoning_effort: "max", service_tier: "standard", context_window: null },
    usage: {
      input_tokens: Math.round(tokens * 0.7),
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: tokens - Math.round(tokens * 0.7),
      reasoning_output_tokens: 0,
      total_tokens: tokens,
      uncached_input_tokens: Math.round(tokens * 0.7),
      model_invocation_count: 1,
      max_invocation_input_tokens: Math.round(tokens * 0.7),
    },
    credits: {
      status: "calculated",
      rate_card_id: "synthetic-card",
      service_tier: "standard",
      total: credits,
      components: { uncached_input: credits * 0.5, cached_input: 0, cache_write_input: 0, output: credits * 0.5 },
    },
    time: {
      started_at: startedAt,
      completed_at: new Date(Date.parse(startedAt) + 60000).toISOString(),
      duration_ms: 60000,
    },
    rate_limit_snapshot: null,
    measurement: { status: "complete", token_confidence: "exact_cumulative_delta", attribution_confidence: "explicit_binding" },
    privacy: { metadata_only: true, prompt_captured: false, reasoning_captured: false, tool_payload_captured: false },
  };
}

test("E2E CLI: authoritative full collect with --apply writes nonempty atomic activity sidecar, scoped collect cannot overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "sf-activity-e2e-cli-"));
  const sessionsDir = join(root, "sessions");
  const stateDir = join(root, "state");
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  try {
    // Write a multi-day session file with rollout prefix
    const sessionFile1 = join(sessionsDir, "rollout-2026-08-21-001-thread-cli-1.jsonl");
    const lines1 = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-21T00:00:00.000Z", payload: { id: "thread-cli-1", session_id: "thread-cli-1", timestamp: "2026-08-21T00:00:00.000Z", cwd: null } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-21T00:00:01.000Z", payload: { turn_id: "turn-cli-1", model: "gpt-5.6-terra", effort: "high" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-21T00:00:02.000Z", payload: { type: "task_started", turn_id: "turn-cli-1", started_at: "2026-08-21T00:00:02.000Z" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-21T10:00:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 150 } } } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-22T04:00:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 300, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 150, reasoning_output_tokens: 0, total_tokens: 450 } } } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-22T05:00:00.000Z", payload: { type: "task_complete", turn_id: "turn-cli-1", completed_at: "2026-08-22T05:00:00.000Z", duration_ms: 1000 } }),
    ].join("\n");
    await writeFile(sessionFile1, lines1, "utf8");

    // Full collect with apply
    const cliResult = await runCli([
      "collect",
      "--sessions-root", sessionsDir,
      "--state-root", stateDir,
      "--apply",
    ]);

    assert.equal(cliResult.mode, "apply");
    assert.equal(cliResult.event_count, 1);

    // Verify persisted activity projection
    const activity = await loadCodexActivityProjection(stateDir);
    assert.ok(activity);
    assert.equal(activity.coverage.scope, "full_sessions_root");
    assert.equal(activity.totals.total_tokens, 450);
    assert.equal(activity.threads.length, 1);
    assert.equal(activity.threads[0].thread_id, "thread-cli-1");
    assert.equal(activity.threads[0].turn_id, "turn-cli-1");
    assert.equal(activity.threads[0].observations.length, 2);
    // Observation 1 on 2026-08-21 (KST): 150 tokens
    // Observation 2 on 2026-08-22 (KST): 300 tokens (450 - 150)
    assert.equal(activity.threads[0].observations[0].delta_tokens, 150);
    assert.equal(activity.threads[0].observations[1].delta_tokens, 300);

    // Now run scoped collect with apply: it must NOT overwrite the authoritative activity sidecar
    const scopedResult = await runCli([
      "collect",
      "--sessions-root", sessionsDir,
      "--state-root", stateDir,
      "--thread-id", "thread-cli-1",
      "--apply",
    ]);
    assert.equal(scopedResult.mode, "apply");

    // The activity projection should still be authoritative
    const activityAfterScoped = await loadCodexActivityProjection(stateDir);
    assert.equal(activityAfterScoped.coverage.scope, "full_sessions_root");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("E2E 4-case reconciliation: matched multi-day + uncovered + mismatched + unmatched sidecar turn", async () => {
  const root = await mkdtemp(join(tmpdir(), "sf-activity-e2e-4case-"));
  try {
    // 1. Matched multi-day event: 500 tokens across 8/21 and 8/22
    const matchedEvent = createValidUsageEvent({
      eventId: "aue_matched",
      threadId: "thread-matched",
      turnId: "turn-matched-1",
      tokens: 500,
      credits: 0.50,
      startedAt: "2026-08-21T00:00:00.000Z",
    });

    // 2. Uncovered legacy event: 1,000,000 tokens on 8/01 (no activity record)
    const uncoveredEvent = createValidUsageEvent({
      eventId: "aue_uncovered",
      threadId: "thread-uncovered",
      turnId: "turn-uncovered-1",
      tokens: 1_000_000,
      credits: 100.0,
      startedAt: "2026-08-01T00:00:00.000Z",
    });

    // 3. Mismatched event: 200 tokens in canonical ledger, but 999 tokens in sidecar -> retained on started_at
    const mismatchedEvent = createValidUsageEvent({
      eventId: "aue_mismatched",
      threadId: "thread-mismatched",
      turnId: "turn-mismatched-1",
      tokens: 200,
      credits: 0.20,
      startedAt: "2026-08-15T00:00:00.000Z",
    });

    const canonicalLedger = [matchedEvent, uncoveredEvent, mismatchedEvent];
    await persistUsageEvents(root, canonicalLedger);

    // 4. Sidecar has:
    // - matched event (500 tokens, 200 on 8/21 + 300 on 8/22)
    // - mismatched event (999 tokens != 200 tokens)
    // - unmatched sidecar event (thread-sidecar-only, not in canonical ledger)
    const activityProjection = {
      schema_version: "soulforge.ai_usage_codex_activity_projection.v1",
      generated_at: "2026-08-24T12:00:00.000Z",
      coverage: { scope: "full_sessions_root", session_file_count: 3, parsed_session_count: 3, issue_count: 0, thread_count: 3, turn_count: 3 },
      privacy: { metadata_only: true, prompt_captured: false, reasoning_captured: false, tool_payload_captured: false },
      issues: [],
      totals: { total_tokens: 1599 },
      threads: [
        {
          thread_id: "thread-matched",
          turn_id: "turn-matched-1",
          observations: [
            { observed_at: "2026-08-21T08:00:00.000Z", delta_tokens: 200 },
            { observed_at: "2026-08-22T08:00:00.000Z", delta_tokens: 300 },
          ],
          total_tokens: 500,
        },
        {
          thread_id: "thread-mismatched",
          turn_id: "turn-mismatched-1",
          observations: [
            { observed_at: "2026-08-23T08:00:00.000Z", delta_tokens: 999 },
          ],
          total_tokens: 999,
        },
        {
          thread_id: "thread-sidecar-only",
          turn_id: "turn-sidecar-1",
          observations: [
            { observed_at: "2026-08-22T08:00:00.000Z", delta_tokens: 100 },
          ],
          total_tokens: 100,
        },
      ],
      reconciliation: { total_tokens: 1599, thread_count: 3, turn_count: 3, observation_count: 4 },
    };

    const snapshot = createBoardUsageHistorySnapshot(canonicalLedger, {
      referenceAt: "2026-08-24T12:00:00.000Z",
      activityProjection,
    });

    // 1. Emits v4 schema
    assert.equal(snapshot.schema_version, BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA);

    // 2. Coverage summary: 1 matched, 1 mismatched, 1 unmatched, 1 uncovered -> state: "partial"
    assert.deepEqual(snapshot.codex_activity_coverage, {
      state: "partial",
      matched_turns: 1,
      mismatched_turns: 1,
      unmatched_turns: 1,
      uncovered_turns: 1,
    });

    // 3. All-time total tokens: 500 (matched) + 1,000,000 (uncovered) + 200 (mismatched legacy) = 1,000,700
    assert.equal(snapshot.windows.all_time.totals.total_tokens, 1_000_700);
    assert.equal(snapshot.windows.all_time.totals.turns, 3);
    assert.equal(snapshot.windows.all_time.totals.credits, 100.70);

    // 4. Temporal distribution:
    // 8/01: uncovered turn on started_at (1,000,000 tokens, 1 turn)
    const d01 = snapshot.activity.daily.find((d) => d.date === "2026-08-01");
    assert.equal(d01.total_tokens, 1_000_000);
    assert.equal(d01.turns, 1);

    // 8/15: mismatched turn on started_at (200 tokens, 1 turn)
    const d15 = snapshot.activity.daily.find((d) => d.date === "2026-08-15");
    assert.equal(d15.total_tokens, 200);
    assert.equal(d15.turns, 1);

    // 8/21: matched turn obs 1 (200 tokens, 1 turn)
    const d21 = snapshot.activity.daily.find((d) => d.date === "2026-08-21");
    assert.equal(d21.total_tokens, 200);
    assert.equal(d21.turns, 1);

    // 8/22: matched turn obs 2 (300 tokens, 0 turns)
    const d22 = snapshot.activity.daily.find((d) => d.date === "2026-08-22");
    assert.equal(d22.total_tokens, 300);
    assert.equal(d22.turns, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("15-Minute fresh active session rule: active turns from fresh files are included, stale active turns excluded", async () => {
  const root = await mkdtemp(join(tmpdir(), "sf-fresh-active-"));
  try {
    const freshFile = join(root, "rollout-fresh-active.jsonl");
    const staleFile = join(root, "rollout-stale-active.jsonl");

    const freshLines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-24T10:00:00.000Z", payload: { id: "thread-fresh", timestamp: "2026-08-24T10:00:00.000Z" } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-24T10:00:01.000Z", payload: { turn_id: "turn-fresh-1", model: "gpt-5.6-terra" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:00:02.000Z", payload: { type: "task_started", turn_id: "turn-fresh-1", started_at: "2026-08-24T10:00:02.000Z" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:05:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 150 } } } }),
    ].join("\n");

    const staleLines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-20T10:00:00.000Z", payload: { id: "thread-stale", timestamp: "2026-08-20T10:00:00.000Z" } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-20T10:00:01.000Z", payload: { turn_id: "turn-stale-1", model: "gpt-5.6-terra" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-20T10:00:02.000Z", payload: { type: "task_started", turn_id: "turn-stale-1", started_at: "2026-08-20T10:00:02.000Z" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-20T10:05:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 200, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 100, reasoning_output_tokens: 0, total_tokens: 300 } } } }),
    ].join("\n");

    await writeFile(freshFile, freshLines, "utf8");
    await writeFile(staleFile, staleLines, "utf8");

    // Set staleFile mtime to 1 hour ago
    const oneHourAgo = (Date.now() - 3600 * 1000) / 1000;
    await utimes(staleFile, oneHourAgo, oneHourAgo);

    const rateCard = await loadRateCard(path.resolve("guild_hall/ai_usage_meter/rate_card.v1.json"));
    const collected = await collectUsageObservations({
      sessionFiles: [freshFile, staleFile],
      config: { organization_id: "soulforge", default_team_id: "t", default_project_id: "p" },
      rateCard,
    });

    const activeTurnIds = (collected.usage_activity_turns ?? []).map((t) => t.turn_id);
    assert.ok(activeTurnIds.includes("turn-fresh-1"), "Fresh active turn must be included in activity turns");
    assert.ok(!activeTurnIds.includes("turn-stale-1"), "Stale active turn (>15m) must NOT be included in activity turns");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Counter regression detection: non-monotonic token_count emits safe issue and excludes turn without crashing", async () => {
  const root = await mkdtemp(join(tmpdir(), "sf-counter-regression-"));
  try {
    const regFile = join(root, "rollout-regression-session.jsonl");
    const regLines = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-24T10:00:00.000Z", payload: { id: "thread-reg", timestamp: "2026-08-24T10:00:00.000Z" } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-24T10:00:01.000Z", payload: { turn_id: "turn-reg-1", model: "gpt-5.6-terra" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:00:02.000Z", payload: { type: "task_started", turn_id: "turn-reg-1", started_at: "2026-08-24T10:00:02.000Z" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:05:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 500, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 200, reasoning_output_tokens: 0, total_tokens: 700 } } } }),
      // Regression: counter drops to 100 total
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:06:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 50, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 100 } } } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-24T10:07:00.000Z", payload: { type: "task_complete", turn_id: "turn-reg-1", completed_at: "2026-08-24T10:07:00.000Z" } }),
    ].join("\n");

    await writeFile(regFile, regLines, "utf8");

    const rateCard = await loadRateCard(path.resolve("guild_hall/ai_usage_meter/rate_card.v1.json"));
    const collected = await collectUsageObservations({
      sessionFiles: [regFile],
      config: { organization_id: "soulforge", default_team_id: "t", default_project_id: "p" },
      rateCard,
    });

    assert.ok(collected.issues.some((i) => i.code === "codex_activity_counter_regression"));
    assert.equal(collected.usage_activity_turns.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("E2E CLI: authoritative full collect on empty sessions directory writes a fresh empty sidecar and replaces stale bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "sf-activity-e2e-empty-cli-"));
  const sessionsDir = join(root, "sessions");
  const stateDir = join(root, "state");
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });

  try {
    const sessionFile1 = join(sessionsDir, "rollout-session-1.jsonl");
    const lines1 = [
      JSON.stringify({ type: "session_meta", timestamp: "2026-08-21T00:00:00.000Z", payload: { id: "thread-cli-e1", session_id: "thread-cli-e1", timestamp: "2026-08-21T00:00:00.000Z" } }),
      JSON.stringify({ type: "turn_context", timestamp: "2026-08-21T00:00:01.000Z", payload: { turn_id: "turn-cli-e1", model: "gpt-5.6-terra" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-21T00:00:02.000Z", payload: { type: "task_started", turn_id: "turn-cli-e1", started_at: "2026-08-21T00:00:02.000Z" } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-21T10:00:00.000Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 150 } } } }),
      JSON.stringify({ type: "event_msg", timestamp: "2026-08-21T10:05:00.000Z", payload: { type: "task_complete", turn_id: "turn-cli-e1", completed_at: "2026-08-21T10:05:00.000Z" } }),
    ].join("\n");
    await writeFile(sessionFile1, lines1, "utf8");

    // 1. Initial authoritative apply
    await runCli(["collect", "--sessions-root", sessionsDir, "--state-root", stateDir, "--apply"]);
    const initialActivity = await loadCodexActivityProjection(stateDir);
    assert.equal(initialActivity.totals.total_tokens, 150);
    assert.equal(initialActivity.threads.length, 1);

    // 2. Remove session file -> sessionsDir is now empty
    await rm(sessionFile1, { force: true });

    // 3. Second authoritative apply on empty sessions dir
    const secondResult = await runCli(["collect", "--sessions-root", sessionsDir, "--state-root", stateDir, "--apply"]);
    assert.equal(secondResult.mode, "apply");
    assert.equal(secondResult.event_count, 0);

    // 4. Stale 150-token sidecar must be replaced with fresh empty projection (0 tokens)
    const refreshedActivity = await loadCodexActivityProjection(stateDir);
    assert.ok(refreshedActivity);
    assert.equal(refreshedActivity.totals.total_tokens, 0);
    assert.equal(refreshedActivity.threads.length, 0);
    assert.equal(refreshedActivity.reconciliation.total_tokens, 0);
    assert.equal(refreshedActivity.reconciliation.observation_count, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
