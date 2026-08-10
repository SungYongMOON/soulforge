import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBoardUsageSnapshot, loadBoardUsageSnapshot, writeBoardUsageSnapshot } from "./board_snapshot.mjs";
import { normalizeAiUsageSnapshot } from "../../ui-workspace/apps/team-ops-board/src/core/ai-usage-snapshot.mjs";

function event({
  id,
  role,
  model,
  effort,
  tokens,
  credit,
  parent = null,
  project = "project-a",
  team = "team-a",
  work = "work-a",
  measurementStatus = null,
}) {
  const output = {
    event_id: id,
    project_id: project,
    team_id: team,
    work_id: work,
    parent_thread_id: parent,
    actor: { role },
    model: { id: model, reasoning_effort: effort },
    usage: { total_tokens: tokens },
    credits: { total: credit },
    source: { source_ref: "synthetic-session.jsonl" },
  };
  if (measurementStatus !== null) output.measurement = { status: measurementStatus };
  return output;
}

function fullCoverage(total) {
  return { scope: "full_sessions_root", issue_count: 0, unique_event_count: total };
}

function healthyHook(observedAt) {
  return { status: "ok", observed_at: observedAt };
}

function persistedCompleteEvent() {
  return {
    schema_version: "soulforge.ai_usage_event.v1",
    event_id: "aue-board-snapshot-state",
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
    time: { started_at: "2026-08-03T11:59:00.000Z", completed_at: "2026-08-03T12:00:00.000Z", duration_ms: 1000 },
    rate_limit_snapshot: null,
    measurement: { status: "complete", token_confidence: "exact_cumulative_delta", attribution_confidence: "explicit_binding" },
    privacy: { metadata_only: true, prompt_captured: false, reasoning_captured: false, tool_payload_captured: false },
  };
}

test("Board snapshot keeps the synthetic CEO-manager-owner-executor-review topology reconciled", () => {
  const snapshot = createBoardUsageSnapshot([
    event({ id: "ceo", role: "CEO", model: "gpt-5.6-sol", effort: "xhigh", tokens: 100, credit: 0.1, measurementStatus: "complete" }),
    event({ id: "manager", role: "SYSTEM_manager", model: "gpt-5.6-sol", effort: "high", tokens: 90, credit: 0.09, parent: "ceo", measurementStatus: "complete" }),
    event({ id: "owner", role: "responsibility_owner", model: "gpt-5.6-terra", effort: "high", tokens: 80, credit: 0.08, parent: "manager", measurementStatus: "complete" }),
    event({ id: "executor", role: "executor", model: "gpt-5.6-terra", effort: "xhigh", tokens: 70, credit: 0.07, parent: "owner", measurementStatus: "complete" }),
    event({ id: "reviewer", role: "reviewer", model: "unknown", effort: null, tokens: 60, credit: null, parent: "executor", measurementStatus: "complete" }),
  ], {
    coverage: fullCoverage(5),
    hookHealth: healthyHook("2026-08-03T12:00:00.000Z"),
    pendingEventCount: 0,
    toolEvents: [
      { attempt: 2, retry_reason_code: "timeout_retry", timeout: true },
      { attempt: 1, retry_reason_code: null, timeout: false },
    ],
    generatedAt: "2026-08-03T12:00:00.000Z",
  });

  assert.equal(snapshot.coverage.status, "complete");
  assert.equal(snapshot.coverage.issue_count, 0);
  assert.equal(snapshot.health.hook_status, "ok");
  assert.equal(snapshot.totals.turns, 5);
  assert.equal(snapshot.totals.total_tokens, 400);
  assert.equal(snapshot.totals.credits, 0.34);
  assert.equal(snapshot.totals.credit_unknown_turns, 1);
  assert.equal(snapshot.activity.execution_turns, 1);
  assert.equal(snapshot.activity.coordination_turns, 3);
  assert.equal(snapshot.activity.review_turns, 1);
  assert.equal(snapshot.activity.fan_out_turns, 4);
  assert.equal(snapshot.activity.retry_count, 1);
  assert.equal(snapshot.activity.timeout_count, 1);
  assert.equal(snapshot.roles.reduce((sum, row) => sum + row.turns, 0), snapshot.totals.turns);
  assert.equal(snapshot.roles.reduce((sum, row) => sum + row.total_tokens, 0), snapshot.totals.total_tokens);
  assert.equal(snapshot.roles.reduce((sum, row) => sum + row.credit_unknown_turns, 0), snapshot.totals.credit_unknown_turns);
  assert.equal(snapshot.model_effort.reduce((sum, row) => sum + row.turns, 0), snapshot.totals.turns);
  assert.equal(snapshot.model_effort.reduce((sum, row) => sum + row.total_tokens, 0), snapshot.totals.total_tokens);
  assert.equal(snapshot.model_effort.reduce((sum, row) => sum + row.credit_unknown_turns, 0), snapshot.totals.credit_unknown_turns);
  assert.match(JSON.stringify(snapshot), /rate_unknown_turns/u);
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-session|source_ref|thread_id|prompt|payload/u);
});

test("Board snapshot completes only with explicit fresh lifecycle evidence", () => {
  const generatedAt = "2026-08-03T12:00:00.000Z";
  const lifecycleEvent = {
    id: "lifecycle-complete",
    role: "executor",
    model: "gpt-5.6-terra",
    effort: "max",
    tokens: 10,
    credit: 0.01,
  };
  const base = event({ ...lifecycleEvent, measurementStatus: "complete" });
  const completeOptions = {
    coverage: fullCoverage(1),
    hookHealth: healthyHook(generatedAt),
    pendingEventCount: 0,
    generatedAt,
  };
  assert.equal(createBoardUsageSnapshot([base], completeOptions).coverage.status, "complete");

  const partialCases = [
    ["active", [event({ ...lifecycleEvent, measurementStatus: "active" })], completeOptions],
    ["observed at stop", [event({ ...lifecycleEvent, measurementStatus: "observed_at_stop" })], completeOptions],
    ["pending", [base], { ...completeOptions, pendingEventCount: 1 }],
    ["unhealthy", [base], { ...completeOptions, hookHealth: { status: "hold", observed_at: generatedAt } }],
    ["stale", [base], { ...completeOptions, hookHealth: healthyHook("2026-08-03T11:44:59.999Z") }],
    ["missing runtime evidence", [base], { coverage: fullCoverage(1), generatedAt }],
  ];
  for (const [, events, options] of partialCases) {
    assert.equal(createBoardUsageSnapshot(events, options).coverage.status, "partial");
  }
});

test("Board snapshot state root requires fresh healthy lifecycle evidence for complete coverage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-board-snapshot-state-root-"));
  const generatedAt = "2026-08-03T12:00:00.000Z";
  try {
    const eventPath = path.join(root, "events", "2026-08", "aue-board-snapshot-state.json");
    await mkdir(path.dirname(eventPath), { recursive: true });
    await mkdir(path.join(root, "coverage"), { recursive: true });
    await mkdir(path.join(root, "health"), { recursive: true });
    await writeFile(eventPath, `${JSON.stringify(persistedCompleteEvent())}\n`, "utf8");
    await writeFile(path.join(root, "coverage", "latest.json"), `${JSON.stringify(fullCoverage(1))}\n`, "utf8");
    await writeFile(path.join(root, "health", "latest.json"), `${JSON.stringify(healthyHook(generatedAt))}\n`, "utf8");

    const fresh = await loadBoardUsageSnapshot(root, { generatedAt });
    assert.equal(fresh.coverage.status, "complete");

    await writeFile(path.join(root, "health", "latest.json"), `${JSON.stringify(healthyHook("2026-08-03T11:44:59.999Z"))}\n`, "utf8");
    const stale = await loadBoardUsageSnapshot(root, { generatedAt });
    assert.equal(stale.coverage.status, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Board snapshot requires measured coverage invariants and accounts for sanitized roles", () => {
  const snapshot = createBoardUsageSnapshot([
    event({
      id: "unsafe-label",
      role: "private customer",
      model: "private model",
      effort: "private effort",
      tokens: 10,
      credit: 0.01,
    }),
  ], {
    coverage: fullCoverage(2),
    generatedAt: "2026-08-03T12:00:00.000Z",
  });

  assert.equal(snapshot.coverage.status, "partial");
  assert.equal(snapshot.coverage.measured_turns, 1);
  assert.equal(snapshot.coverage.total_turns, 2);
  assert.equal(snapshot.coverage.unassigned_turns, 1);
  assert.equal(snapshot.roles[0].role, "unassigned");
  assert.equal(snapshot.model_effort[0].model, "UNKNOWN");
  assert.equal(snapshot.model_effort[0].reasoning_effort, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(snapshot), /private customer|private model|private effort/u);

  const underreported = createBoardUsageSnapshot([
    event({
      id: "underreported-coverage",
      role: "executor",
      model: "gpt-5.6-terra",
      effort: "high",
      tokens: 10,
      credit: 0.01,
    }),
  ], { coverage: fullCoverage(0) });
  assert.equal(underreported.coverage.status, "partial");
  assert.equal(underreported.coverage.measured_turns, 1);
  assert.equal(underreported.coverage.total_turns, 1);
});

test("Board snapshot round-trips critical attribution coverage through the Board consumer", () => {
  const generatedAt = "2026-08-03T12:00:00.000Z";
  const options = {
    coverage: fullCoverage(1),
    hookHealth: healthyHook(generatedAt),
    pendingEventCount: 0,
    generatedAt,
  };
  for (const [dimension, overrides] of [
    ["team", { team: "unassigned" }],
    ["project", { project: "unassigned" }],
    ["work", { work: "unassigned" }],
  ]) {
    const produced = createBoardUsageSnapshot([event({
      id: `critical-${dimension}`,
      role: "executor",
      model: "gpt-5.6-terra",
      effort: "max",
      tokens: 10,
      credit: 0.01,
      measurementStatus: "complete",
      ...overrides,
    })], options);
    const consumed = normalizeAiUsageSnapshot(produced);
    assert.equal(produced.coverage.status, "complete", dimension);
    assert.equal(produced.coverage.unassigned_turns, 1, dimension);
    assert.equal(produced.roles[0].role, "executor", dimension);
    assert.equal(consumed.state, "ready", dimension);
    assert.equal(consumed.snapshot.coverage.unassigned_turns, 1, dimension);
  }

  const unsafeRole = createBoardUsageSnapshot([event({
    id: "critical-unsafe-role",
    role: "unsafe label",
    model: "gpt-5.6-terra",
    effort: "max",
    tokens: 10,
    credit: 0.01,
    measurementStatus: "complete",
  })], options);
  assert.equal(unsafeRole.roles[0].role, "unassigned");
  assert.equal(unsafeRole.coverage.unassigned_turns, 1);
  assert.equal(normalizeAiUsageSnapshot(unsafeRole).state, "ready");
});

test("Board snapshot deduplicates identical replay IDs and rejects conflicts", () => {
  const replay = event({
    id: "replay",
    role: "executor",
    model: "gpt-5.6-terra",
    effort: "high",
    tokens: 10,
    credit: 0.01,
  });
  const snapshot = createBoardUsageSnapshot([replay, JSON.parse(JSON.stringify(replay))], {
    coverage: fullCoverage(1),
  });
  assert.equal(snapshot.totals.turns, 1);
  assert.equal(snapshot.totals.total_tokens, 10);
  assert.equal(snapshot.totals.credits, 0.01);

  const conflicting = { ...replay, usage: { total_tokens: 11 } };
  assert.throws(
    () => createBoardUsageSnapshot([replay, conflicting], { coverage: fullCoverage(1) }),
    (error) => error?.code === "board_snapshot_event_id_conflict",
  );
});

test("Board snapshot writer rebuilds safe labels and rejects extra private fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-board-snapshot-"));
  try {
    const snapshot = createBoardUsageSnapshot([
      event({
        id: "writer",
        role: "executor",
        model: "gpt-5.6-terra",
        effort: "high",
        tokens: 10,
        credit: 0.01,
      }),
    ], { coverage: fullCoverage(1), generatedAt: "2026-08-03T12:00:00.000Z" });
    const output = path.join(root, "ai-usage-meter.snapshot.json");
    await assert.rejects(
      () => writeBoardUsageSnapshot(output, { ...snapshot, raw_prompt: "must-not-write" }),
      (error) => error?.code === "board_snapshot_invalid",
    );

    const unsafeLabel = JSON.parse(JSON.stringify(snapshot));
    unsafeLabel.roles[0].role = "private customer";
    const persistedSnapshot = await writeBoardUsageSnapshot(output, unsafeLabel);
    const persisted = await readFile(output, "utf8");
    assert.equal(persistedSnapshot.roles[0].role, "unassigned");
    assert.equal(persistedSnapshot.coverage.unassigned_turns, 1);
    assert.doesNotMatch(persisted, /private customer|session|source|prompt|payload|path/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Board snapshot is an atomic redacted output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-board-snapshot-"));
  try {
    const snapshot = createBoardUsageSnapshot([], { generatedAt: "2026-08-03T12:00:00.000Z" });
    const output = path.join(root, "ai-usage-meter.snapshot.json");
    await writeBoardUsageSnapshot(output, snapshot);
    const persisted = await readFile(output, "utf8");
    assert.equal(JSON.parse(persisted).coverage.status, "unmeasured");
    assert.doesNotMatch(persisted, /session|source|prompt|payload|path/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
