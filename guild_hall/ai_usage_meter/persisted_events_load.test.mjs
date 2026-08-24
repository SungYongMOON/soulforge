import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createBoardUsageHistorySnapshot,
} from "./board_history_snapshot.mjs";
import {
  DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY,
  MAX_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY,
  normalizePersistedUsageEventsConcurrency,
  loadPersistedUsageEvents,
  validateUsageEvent,
} from "./usage_meter.mjs";

function createValidUsageEvent({
  eventId,
  startedAt = "2026-08-03T12:00:00.000Z",
}) {
  return {
    schema_version: "soulforge.ai_usage_event.v1",
    event_id: eventId,
    organization_id: "org-a",
    team_id: "team-a",
    project_id: "project-a",
    work_id: "work-a",
    thread_id: "thread-a",
    turn_id: "turn-a",
    parent_thread_id: null,
    root_thread_id: "thread-a",
    root_turn_id: "turn-a",
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

test("loadPersistedUsageEvents loads events with bounded parallelism, determinism, and validation", async () => {
  assert.equal(typeof DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY, "number");
  assert.equal(typeof MAX_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY, "number");
  assert.ok(DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY > 0);
  assert.ok(MAX_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY >= DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);

  // Normalization and clamping assertions
  assert.equal(normalizePersistedUsageEventsConcurrency(undefined), DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency({}), DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency(-1), DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency(0), DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency("invalid"), DEFAULT_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency(4), 4);
  assert.equal(normalizePersistedUsageEventsConcurrency({ concurrency: 8 }), 8);
  assert.equal(normalizePersistedUsageEventsConcurrency(100000), MAX_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);
  assert.equal(normalizePersistedUsageEventsConcurrency({ concurrency: 50000 }), MAX_LOAD_PERSISTED_USAGE_EVENTS_CONCURRENCY);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "usage-load-test-"));
  const eventsDir = path.join(tempDir, "events", "2026-08");
  await mkdir(eventsDir, { recursive: true });

  try {
    const totalEvents = 40;
    const expectedEvents = [];

    for (let i = 0; i < totalEvents; i += 1) {
      const padded = String(i).padStart(3, "0");
      // Intentionally vary started_at timestamps to test sorting determinism
      const minute = String(i % 60).padStart(2, "0");
      const event = createValidUsageEvent({
        eventId: `aue-test-${padded}`,
        startedAt: `2026-08-03T12:${minute}:00.000Z`,
      });
      expectedEvents.push(event);
      await writeFile(path.join(eventsDir, `aue-test-${padded}.json`), JSON.stringify(event));
    }

    // Sort expected according to contract: started_at ascending then event_id ascending
    expectedEvents.sort((a, b) => (
      (a.time.started_at ?? "").localeCompare(b.time.started_at ?? "", "en")
      || a.event_id.localeCompare(b.event_id, "en")
    ));

    // Test with default concurrency
    const defaultLoaded = await loadPersistedUsageEvents(tempDir);
    assert.equal(defaultLoaded.length, totalEvents);
    assert.deepEqual(defaultLoaded, expectedEvents);

    // Test with custom bounded concurrency options
    const sequentialLoaded = await loadPersistedUsageEvents(tempDir, { concurrency: 1 });
    assert.deepEqual(sequentialLoaded, expectedEvents);

    const boundedLoaded = await loadPersistedUsageEvents(tempDir, { concurrency: 4 });
    assert.deepEqual(boundedLoaded, expectedEvents);

    const numberOptionLoaded = await loadPersistedUsageEvents(tempDir, 8);
    assert.deepEqual(numberOptionLoaded, expectedEvents);

    const clampedLoaded = await loadPersistedUsageEvents(tempDir, { concurrency: 999999 });
    assert.deepEqual(clampedLoaded, expectedEvents);

    // Empty state root returns empty array
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), "usage-empty-test-"));
    try {
      const emptyLoaded = await loadPersistedUsageEvents(emptyDir);
      assert.deepEqual(emptyLoaded, []);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("loadPersistedUsageEvents validates every event and fails closed on corrupt file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "usage-corrupt-test-"));
  const eventsDir = path.join(tempDir, "events", "2026-08");
  await mkdir(eventsDir, { recursive: true });

  try {
    for (let i = 0; i < 5; i += 1) {
      const event = createValidUsageEvent({ eventId: `aue-valid-${i}` });
      await writeFile(path.join(eventsDir, `aue-valid-${i}.json`), JSON.stringify(event));
    }

    // Add an invalid JSON file
    await writeFile(path.join(eventsDir, "aue-invalid-syntax.json"), "{ invalid json");
    await assert.rejects(
      async () => loadPersistedUsageEvents(tempDir),
      SyntaxError,
    );

    // Replace with valid JSON but invalid schema event (missing schema_version)
    await writeFile(path.join(eventsDir, "aue-invalid-syntax.json"), JSON.stringify({ event_id: "aue-no-schema" }));
    await assert.rejects(
      async () => loadPersistedUsageEvents(tempDir),
      (err) => err?.message === "usage_event_schema_invalid" || err?.message?.includes("usage_event"),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createBoardUsageHistorySnapshot reconciles dimension breakdowns across 30,000+ fractional-credit events without underflow", () => {
  const baseTime = Date.parse("2026-08-24T00:00:00.000Z");
  const events = [];
  const c = 0.12970785906732105;
  const totalEvents = 30376;

  for (let i = 0; i < totalEvents; i += 1) {
    const val = Number((c * (1 + (i % 7) * 0.13)).toFixed(9));
    events.push({
      schema_version: "soulforge.ai_usage_event.v1",
      event_id: `event-${String(i).padStart(6, "0")}`,
      organization_id: "org-1",
      team_id: "team-1",
      project_id: `proj-${i % 2}`,
      work_id: `work-${i % 3}`,
      thread_id: "thread-1",
      turn_id: "turn-1",
      source: { kind: "codex_session_jsonl" },
      actor: { role: "executor" },
      model: { id: "model-a" },
      time: { started_at: new Date(baseTime + (i * 1000)).toISOString() },
      usage: { total_tokens: 10 },
      measurement: { token_confidence: "exact_per_message" },
      credits: { total: val },
    });
  }

  const snapshot = createBoardUsageHistorySnapshot(events, {
    referenceAt: new Date(baseTime + ((totalEvents + 100) * 1000)).toISOString(),
    topN: 10,
  });

  assert.equal(snapshot.current.totals.turns, totalEvents);
  assert.equal(snapshot.windows.all_time.totals.turns, totalEvents);
  assert.ok(snapshot.windows.all_time.totals.credits > 0);
  assert.equal(snapshot.windows.all_time.breakdowns.projects.other.turns, 0);
  assert.equal(snapshot.windows.all_time.breakdowns.projects.other.credits, 0);
});
