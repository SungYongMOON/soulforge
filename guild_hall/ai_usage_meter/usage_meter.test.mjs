import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  buildUsageEvents,
  calculateCredits,
  collectUsageEvents,
  loadPersistedUsageEvents,
  loadRateCard,
  parseCodexSessionFile,
  persistUsageEvents,
  summarizeUsageEvents,
} from "./usage_meter.mjs";
import { upsertUsageBinding } from "./binding_store.mjs";

const RATE_CARD = new URL("./rate_card.v1.json", import.meta.url);

function row(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

function sessionMeta({ id, parent = null, timestamp = "2026-08-03T00:00:00.000Z", cwd = "fixtures/workspace/project-a", depth = 0 }) {
  return row(timestamp, "session_meta", {
    id,
    session_id: id,
    parent_thread_id: parent,
    timestamp,
    cwd,
    originator: "codex_test",
    agent_path: parent ? `/root/${id}` : null,
    agent_nickname: null,
    source: parent ? { subagent: { thread_spawn: { depth } } } : {},
  });
}

function taskStarted(turnId, timestamp = "2026-08-03T00:00:01.000Z") {
  return row(timestamp, "event_msg", {
    type: "task_started",
    turn_id: turnId,
    started_at: timestamp,
    model_context_window: 258400,
  });
}

function turnContext(turnId, model = "gpt-5.6-sol", effort = "high", timestamp = "2026-08-03T00:00:01.100Z") {
  return row(timestamp, "turn_context", { turn_id: turnId, model, effort });
}

function tokenCount(usage, timestamp, lastInput = 100) {
  return row(timestamp, "event_msg", {
    type: "token_count",
    info: {
      total_token_usage: usage,
      last_token_usage: { input_tokens: lastInput },
    },
    rate_limits: {
      limit_id: "codex",
      primary: { used_percent: 4, window_minutes: 10080, resets_at: 1786163319 },
      plan_type: "pro",
    },
  });
}

function taskComplete(turnId, timestamp = "2026-08-03T00:00:05.000Z") {
  return row(timestamp, "event_msg", {
    type: "task_complete",
    turn_id: turnId,
    completed_at: timestamp,
    duration_ms: 4000,
    last_agent_message: "this must not be retained",
  });
}

function usage(input, cached, output, reasoning = 0, cacheWrite = 0) {
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: cacheWrite,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: input + output,
  };
}

async function writeSession(root, name, lines) {
  const file = path.join(root, `rollout-${name}.jsonl`);
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

async function runCli(args, stdin = null) {
  return new Promise((resolve, reject) => {
    const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: path.dirname(cliPath),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin ?? "");
  });
}

async function runWindowsHookCommand(command, stateRoot) {
  return new Promise((resolve, reject) => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ], {
      cwd: repoRoot,
      env: { ...process.env, SOULFORGE_AI_USAGE_METER_STATE_ROOT: stateRoot },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end("");
  });
}

function config(extra = {}) {
  return {
    schema_version: "soulforge.ai_usage_meter_config.v1",
    organization_id: "org-a",
    default_team_id: "team-default",
    default_project_id: "unassigned",
    node_id: "node-a",
    service_tier: "standard",
    project_bindings: [{ cwd_prefix: "fixtures/workspace/project-a", project_id: "project-a", team_id: "team-a" }],
    work_bindings: [],
    ...extra,
  };
}

test("cumulative snapshots become exact per-turn deltas without duplicate token events", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-meter-"));
  const file = await writeSession(root, "root-session-0001", [
    sessionMeta({ id: "root-session-0001" }),
    turnContext("turn-a", "gpt-5.6-sol", "high", "2026-08-03T00:00:00.500Z"),
    taskStarted("turn-a"),
    tokenCount(usage(100, 50, 10, 3), "2026-08-03T00:00:02.000Z", 100),
    tokenCount(usage(100, 50, 10, 3), "2026-08-03T00:00:02.100Z", 100),
    tokenCount(usage(200, 100, 20, 5), "2026-08-03T00:00:03.000Z", 110),
    taskComplete("turn-a"),
    taskStarted("turn-b", "2026-08-03T00:00:06.000Z"),
    turnContext("turn-b", "gpt-5.6-terra", "medium", "2026-08-03T00:00:06.100Z"),
    tokenCount(usage(260, 120, 25, 6), "2026-08-03T00:00:07.000Z", 60),
    taskComplete("turn-b", "2026-08-03T00:00:08.000Z"),
    row("2026-08-03T00:00:08.100Z", "response_item", {
      type: "message",
      content: [{ type: "input_text", text: "SECRET-SHOULD-NEVER-APPEAR" }],
    }),
  ]);
  const parsed = await parseCodexSessionFile(file);
  assert.equal(parsed.turns.length, 2);
  assert.deepEqual(parsed.turns[0].usage, usage(200, 100, 20, 5));
  assert.deepEqual(parsed.turns[1].usage, usage(60, 20, 5, 1));
  assert.equal(parsed.turns[0].model_invocation_count, 2);
  assert.equal(parsed.turns[0].max_invocation_input_tokens, 110);
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET-SHOULD-NEVER-APPEAR/u);
});

test("child sessions inherit the root work and project attribution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-"));
  const childStartedEpochSeconds = Date.parse("2026-08-03T00:02:00.000Z") / 1_000;
  const parent = await writeSession(root, "parent-session", [
    sessionMeta({ id: "parent-session" }),
    taskStarted("parent-turn"),
    turnContext("parent-turn"),
    tokenCount(usage(1000, 800, 100, 40), "2026-08-03T00:01:00.000Z"),
    taskComplete("parent-turn", "2026-08-03T00:10:00.000Z"),
  ]);
  const child = await writeSession(root, "child-session", [
    sessionMeta({ id: "child-session", parent: "parent-session", timestamp: childStartedEpochSeconds, depth: 1 }),
    taskStarted("child-turn", "2026-08-03T00:02:01.000Z"),
    turnContext("child-turn", "gpt-5.6-luna", "medium", "2026-08-03T00:02:01.100Z"),
    tokenCount(usage(500, 400, 50, 20), "2026-08-03T00:03:00.000Z"),
    taskComplete("child-turn", "2026-08-03T00:04:00.000Z"),
  ]);
  const events = await buildUsageEvents({
    sessionFiles: [parent, child],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  assert.equal(events.length, 2);
  assert.equal(new Set(events.map((event) => event.work_id)).size, 1);
  assert.equal(events[0].project_id, "project-a");
  assert.equal(events[1].project_id, "project-a");
  const childEvent = events.find((event) => event.thread_id === "child-session");
  assert.equal(childEvent.root_turn_id, "parent-turn");
  assert.equal(childEvent.time.started_at, "2026-08-03T00:02:01.000Z");
  const schema = JSON.parse(await readFile(new URL("./ai_usage_event.v1.schema.json", import.meta.url), "utf8"));
  const validate = new Ajv2020({
    strict: true,
    allowUnionTypes: true,
    formats: { "date-time": true },
  }).compile(schema);
  assert.equal(validate(childEvent), true, JSON.stringify(validate.errors));
});

test("a child never guesses the previous parent turn and later upgrades to the observed active root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-enrichment-"));
  const parent = await writeSession(root, "lineage-enrichment-parent", [
    sessionMeta({ id: "lineage-enrichment-parent" }),
    taskStarted("previous-parent-turn", "2026-08-03T00:00:01.000Z"),
    turnContext("previous-parent-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:02.000Z"),
    taskComplete("previous-parent-turn", "2026-08-03T00:00:03.000Z"),
    taskStarted("active-parent-turn", "2026-08-03T00:01:00.000Z"),
    turnContext("active-parent-turn", "gpt-5.6-sol", "high", "2026-08-03T00:01:00.100Z"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:02:00.000Z"),
  ]);
  const child = await writeSession(root, "lineage-enrichment-child", [
    sessionMeta({
      id: "lineage-enrichment-child",
      parent: "lineage-enrichment-parent",
      timestamp: "2026-08-03T00:01:30.000Z",
      depth: 1,
    }),
    taskStarted("lineage-enrichment-child-turn", "2026-08-03T00:01:31.000Z"),
    turnContext("lineage-enrichment-child-turn", "gpt-5.6-sol", "high", "2026-08-03T00:01:31.100Z"),
    tokenCount(usage(50, 20, 5), "2026-08-03T00:01:40.000Z"),
    taskComplete("lineage-enrichment-child-turn", "2026-08-03T00:01:50.000Z"),
  ]);
  const rateCard = await loadRateCard(RATE_CARD);
  const withoutActiveParent = await buildUsageEvents({
    sessionFiles: [parent, child],
    config: config(),
    rateCard,
  });
  const provisionalChild = withoutActiveParent.find((event) => event.thread_id === "lineage-enrichment-child");
  assert.equal(provisionalChild.root_thread_id, "lineage-enrichment-child");
  assert.equal(provisionalChild.root_turn_id, "lineage-enrichment-child-turn");

  const withActiveParent = await buildUsageEvents({
    sessionFiles: [parent, child],
    config: config(),
    rateCard,
    includeActive: true,
  });
  const enrichedChild = withActiveParent.find((event) => event.thread_id === "lineage-enrichment-child");
  assert.equal(enrichedChild.root_thread_id, "lineage-enrichment-parent");
  assert.equal(enrichedChild.root_turn_id, "active-parent-turn");
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-enrichment-state-"));
  await persistUsageEvents(state, [provisionalChild]);
  assert.equal((await persistUsageEvents(state, [enrichedChild])).updated, 1);
  assert.equal((await loadPersistedUsageEvents(state))[0].root_turn_id, "active-parent-turn");
  assert.equal((await persistUsageEvents(state, [provisionalChild])).replayed, 1);
  assert.equal((await loadPersistedUsageEvents(state))[0].root_turn_id, "active-parent-turn");
});

test("a stronger self-root backfill advances measurement without regressing ancestor attribution", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-rebase-session-"));
  const child = await writeSession(sessions, "lineage-rebase-child", [
    sessionMeta({
      id: "lineage-rebase-child",
      parent: "lineage-rebase-parent",
      timestamp: "2026-08-03T00:01:30.000Z",
      depth: 1,
    }),
    taskStarted("lineage-rebase-child-turn", "2026-08-03T00:01:31.000Z"),
    turnContext("lineage-rebase-child-turn", "gpt-5.6-sol", "high", "2026-08-03T00:01:31.100Z"),
    tokenCount(usage(200, 100, 20, 5), "2026-08-03T00:01:40.000Z"),
    taskComplete("lineage-rebase-child-turn", "2026-08-03T00:01:50.000Z"),
  ]);
  const rateCard = await loadRateCard(RATE_CARD);
  const [selfRoot] = await buildUsageEvents({
    sessionFiles: [child],
    config: config(),
    rateCard,
  });
  assert.equal(selfRoot.root_thread_id, selfRoot.thread_id);

  const ancestor = structuredClone(selfRoot);
  ancestor.root_thread_id = "lineage-rebase-parent";
  ancestor.root_turn_id = "lineage-rebase-parent-turn";
  ancestor.team_id = "bound-team";
  ancestor.project_id = "bound-project";
  ancestor.work_id = "bound-work";
  ancestor.actor.role = "executor";
  ancestor.measurement = {
    ...ancestor.measurement,
    status: "observed_at_stop",
    attribution_confidence: "explicit_binding",
  };
  ancestor.time.completed_at = null;
  ancestor.time.duration_ms = null;
  ancestor.model.id = "unknown";
  ancestor.model.reasoning_effort = null;
  ancestor.model.context_window = null;
  ancestor.source.originator = null;
  ancestor.usage = {
    input_tokens: 100,
    cached_input_tokens: 50,
    cache_write_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 2,
    total_tokens: 110,
    uncached_input_tokens: 50,
    model_invocation_count: 1,
    max_invocation_input_tokens: 100,
  };
  ancestor.credits = calculateCredits(
    ancestor.usage,
    ancestor.model.id,
    rateCard,
    ancestor.model.service_tier,
    ancestor.time.started_at,
  );

  const assertMerged = async (state) => {
    const [persisted] = await loadPersistedUsageEvents(state);
    assert.equal(persisted.root_thread_id, ancestor.root_thread_id);
    assert.equal(persisted.root_turn_id, ancestor.root_turn_id);
    assert.equal(persisted.team_id, ancestor.team_id);
    assert.equal(persisted.project_id, ancestor.project_id);
    assert.equal(persisted.work_id, ancestor.work_id);
    assert.equal(persisted.actor.role, ancestor.actor.role);
    assert.equal(persisted.measurement.attribution_confidence, "explicit_binding");
    assert.deepEqual(persisted.usage, selfRoot.usage);
    assert.equal(persisted.measurement.status, "complete");
    assert.deepEqual(persisted.time, selfRoot.time);
    assert.deepEqual(persisted.source, selfRoot.source);
    assert.deepEqual(persisted.model, selfRoot.model);
    assert.deepEqual(persisted.credits, selfRoot.credits);
    assert.equal((await readdir(path.join(state, "revisions", persisted.event_id))).length, 1);
  };

  const directState = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-rebase-direct-"));
  await persistUsageEvents(directState, [ancestor]);
  assert.equal((await persistUsageEvents(directState, [selfRoot])).updated, 1);
  await assertMerged(directState);
  assert.equal((await persistUsageEvents(directState, [selfRoot])).replayed, 1);

  const queuedState = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-rebase-pending-"));
  await persistUsageEvents(queuedState, [ancestor]);
  const lockPath = path.join(queuedState, "ledger.lock");
  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    token: "lineage-rebase-test-lock",
  })}\n`, "utf8");
  assert.equal((await persistUsageEvents(queuedState, [selfRoot])).pending, 1);
  await rm(lockPath, { force: true });
  assert.equal((await persistUsageEvents(queuedState, [])).updated, 1);
  await assertMerged(queuedState);
  const pendingEntries = await readdir(path.join(queuedState, "pending"), { recursive: true });
  assert.equal(pendingEntries.some((entry) => String(entry).endsWith(".json")), false);
});

test("parent continuation completion is resolved before child lineage time filtering", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-lineage-continuation-time-"));
  const parentId = "lineage-time-parent";
  const parentTurnId = "lineage-time-parent-turn";
  const partial = await writeSession(root, "lineage-time-partial", [
    sessionMeta({ id: parentId }),
    taskStarted(parentTurnId, "2026-08-03T00:00:01.000Z"),
    turnContext(parentTurnId),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:02.000Z"),
  ]);
  const completeBeforeChild = await writeSession(root, "lineage-time-complete-before", [
    sessionMeta({ id: parentId }),
    taskStarted(parentTurnId, "2026-08-03T00:00:01.000Z"),
    turnContext(parentTurnId),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:20.000Z"),
    taskComplete(parentTurnId, "2026-08-03T00:00:30.000Z"),
  ]);
  const child = await writeSession(root, "lineage-time-child", [
    sessionMeta({
      id: "lineage-time-child",
      parent: parentId,
      timestamp: "2026-08-03T00:01:00.000Z",
      depth: 1,
    }),
    taskStarted("lineage-time-child-turn", "2026-08-03T00:01:01.000Z"),
    turnContext("lineage-time-child-turn"),
    tokenCount(usage(50, 20, 5), "2026-08-03T00:01:02.000Z"),
    taskComplete("lineage-time-child-turn", "2026-08-03T00:01:03.000Z"),
  ]);
  const rateCard = await loadRateCard(RATE_CARD);
  const completedBefore = await buildUsageEvents({
    sessionFiles: [partial, completeBeforeChild, child],
    config: config(),
    rateCard,
    includeActive: true,
  });
  const selfRootChild = completedBefore.find((event) => event.thread_id === "lineage-time-child");
  assert.equal(selfRootChild.root_thread_id, "lineage-time-child");
  assert.equal(selfRootChild.root_turn_id, "lineage-time-child-turn");

  const completeAcrossChild = await writeSession(root, "lineage-time-complete-across", [
    sessionMeta({ id: parentId }),
    taskStarted(parentTurnId, "2026-08-03T00:00:01.000Z"),
    turnContext(parentTurnId),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:01:20.000Z"),
    taskComplete(parentTurnId, "2026-08-03T00:02:00.000Z"),
  ]);
  const completedAcross = await buildUsageEvents({
    sessionFiles: [partial, completeAcrossChild, child],
    config: config(),
    rateCard,
    includeActive: true,
  });
  const parentRootChild = completedAcross.find((event) => event.thread_id === "lineage-time-child");
  assert.equal(parentRootChild.root_thread_id, parentId);
  assert.equal(parentRootChild.root_turn_id, parentTurnId);
});

test("Outlook seven-turn reference reproduces 670.294225 Sol credits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-outlook-"));
  const fixtures = [
    [17370176, 16922880, 15889],
    [10173167, 9872896, 5425],
    [4558035, 4424960, 7211],
    [5558733, 5395456, 22883],
    [2177739, 2161152, 3565],
    [524309, 518144, 762],
    [251450, 248320, 627],
  ];
  const files = [];
  const workBindings = [];
  for (let index = 0; index < fixtures.length; index += 1) {
    const threadId = `outlook-thread-${index}`;
    const turnId = `outlook-turn-${index}`;
    const [input, cached, output] = fixtures[index];
    files.push(await writeSession(root, threadId, [
      sessionMeta({ id: threadId }),
      taskStarted(turnId),
      turnContext(turnId),
      tokenCount(usage(input, cached, output), "2026-08-03T00:00:03.000Z"),
      taskComplete(turnId),
    ]));
    workBindings.push({ thread_id: threadId, turn_id: turnId, work_id: "outlook.audit" });
  }
  const events = await buildUsageEvents({
    sessionFiles: files,
    config: config({ work_bindings: workBindings }),
    rateCard: await loadRateCard(RATE_CARD),
  });
  const summary = summarizeUsageEvents(events);
  assert.equal(summary.totals.credits, 670.294225);
  assert.equal(summary.by_work.length, 1);
  assert.equal(summary.by_work[0].key, "outlook.audit");
});

test("rate calculation partitions cached, cache-write, and output without reasoning double count", async () => {
  const rateCard = await loadRateCard(RATE_CARD);
  const result = calculateCredits(usage(1000, 600, 100, 80, 100), "gpt-5.6-sol", rateCard, "standard");
  assert.equal(result.components.uncached_input, 0.0375);
  assert.equal(result.components.cached_input, 0.0075);
  assert.equal(result.components.cache_write_input, 0);
  assert.equal(result.components.output, 0.075);
  assert.equal(result.total, 0.12);
  assert.equal(calculateCredits(usage(10, 0, 1), "unknown-model", rateCard).total, null);
  assert.equal(
    calculateCredits(
      usage(1000, 600, 100, 80, 100),
      "gpt-5.5",
      rateCard,
      "standard",
      "2026-04-02T00:00:00.000Z",
    ).total,
    0.12,
  );
  assert.equal(
    calculateCredits(
      usage(1000, 600, 100, 80, 100),
      "gpt-5.4",
      rateCard,
      "fast",
      "2026-04-03T00:00:00.000Z",
    ).total,
    0.12,
  );
  assert.equal(
    calculateCredits(
      usage(1000, 600, 100, 80, 100),
      "gpt-5.4",
      rateCard,
      "standard",
      "2026-04-01T23:59:59.999Z",
    ).status,
    "rate_unknown",
  );
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-invalid-rate-"));
  const invalid = path.join(root, "invalid-rate.json");
  await writeFile(invalid, JSON.stringify({
    ...rateCard,
    models: { "gpt-5.6-sol": { ...rateCard.models["gpt-5.6-sol"], output: -1 } },
  }), "utf8");
  await assert.rejects(loadRateCard(invalid), { code: "rate_card_model_rate_invalid" });
});

test("event credit pricing keeps pre-migration GPT-5.4 unknown and prices later legacy models", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rate-boundary-"));
  const before = await writeSession(root, "rate-before", [
    sessionMeta({ id: "rate-before", timestamp: "2026-04-01T00:00:00.000Z" }),
    taskStarted("rate-before-turn", "2026-04-01T00:00:01.000Z"),
    turnContext("rate-before-turn", "gpt-5.4", "high", "2026-04-01T00:00:01.100Z"),
    tokenCount(usage(1000, 600, 100, 80, 100), "2026-04-01T00:00:02.000Z"),
    taskComplete("rate-before-turn", "2026-04-01T00:00:03.000Z"),
  ]);
  const after = await writeSession(root, "rate-after", [
    sessionMeta({ id: "rate-after", timestamp: "2026-04-02T00:00:00.000Z" }),
    taskStarted("rate-after-turn", "2026-04-02T00:00:01.000Z"),
    turnContext("rate-after-turn", "gpt-5.5", "high", "2026-04-02T00:00:01.100Z"),
    tokenCount(usage(1000, 600, 100, 80, 100), "2026-04-02T00:00:02.000Z"),
    taskComplete("rate-after-turn", "2026-04-02T00:00:03.000Z"),
  ]);
  const events = await buildUsageEvents({
    sessionFiles: [before, after],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  assert.equal(events.find((event) => event.thread_id === "rate-before").credits.status, "rate_unknown");
  assert.equal(events.find((event) => event.thread_id === "rate-after").credits.total, 0.12);
});

test("an exact turn binding takes precedence over an earlier thread-wide binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-exact-binding-"));
  const file = await writeSession(root, "binding-priority-thread", [
    sessionMeta({ id: "binding-priority-thread" }),
    taskStarted("binding-priority-turn"),
    turnContext("binding-priority-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("binding-priority-turn"),
  ]);
  const events = await buildUsageEvents({
    sessionFiles: [file],
    config: config({
      work_bindings: [
        { thread_id: "binding-priority-thread", turn_id: null, work_id: "thread-wide" },
        { thread_id: "binding-priority-thread", turn_id: "binding-priority-turn", work_id: "exact" },
      ],
    }),
    rateCard: await loadRateCard(RATE_CARD),
  });
  assert.equal(events[0].work_id, "exact");
});

test("metadata ledger is immutable, replay-safe, and contains no raw conversation fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-persist-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-session-"));
  const file = await writeSession(sessions, "persist-session", [
    sessionMeta({ id: "persist-session" }),
    taskStarted("persist-turn"),
    turnContext("persist-turn"),
    tokenCount(usage(1000, 900, 100, 90), "2026-08-03T00:00:03.000Z"),
    taskComplete("persist-turn"),
  ]);
  const events = await buildUsageEvents({
    sessionFiles: [file],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  assert.deepEqual(await persistUsageEvents(root, events), {
    created: 1,
    updated: 0,
    replayed: 0,
    event_ids: [events[0].event_id],
    total_event_count: 1,
    state_root: path.resolve(root),
  });
  assert.equal((await persistUsageEvents(root, events)).replayed, 1);
  const concurrent = await Promise.all([
    persistUsageEvents(root, events),
    persistUsageEvents(root, events),
  ]);
  assert.equal(concurrent.every((receipt) => receipt.replayed === 1), true);
  const loaded = await loadPersistedUsageEvents(root);
  assert.equal(loaded.length, 1);
  const serialized = JSON.stringify(loaded);
  assert.doesNotMatch(serialized, /last_agent_message|input_text|tool_input|reasoning_content/u);
  const current = JSON.parse(await readFile(path.join(root, "current.json"), "utf8"));
  assert.equal(current.event_count, 1);
});

test("a stop snapshot upgrades to a complete event without double counting", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-usage-upgrade-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-upgrade-session-"));
  const activeFile = await writeSession(sessions, "upgrade-session", [
    sessionMeta({ id: "upgrade-session" }),
    taskStarted("upgrade-turn"),
    turnContext("upgrade-turn"),
    tokenCount(usage(900, 800, 90, 60), "2026-08-03T00:00:03.000Z"),
  ]);
  const rateCard = await loadRateCard(RATE_CARD);
  const observed = await buildUsageEvents({
    sessionFiles: [activeFile],
    config: config(),
    rateCard,
    forcedComplete: { [path.resolve(activeFile)]: ["upgrade-turn"] },
  });
  assert.equal(observed[0].measurement.status, "observed_at_stop");
  assert.equal(observed[0].time.completed_at, null);
  await persistUsageEvents(root, observed);

  await writeFile(activeFile, `${[
    sessionMeta({ id: "upgrade-session" }),
    taskStarted("upgrade-turn"),
    turnContext("upgrade-turn"),
    tokenCount(usage(1000, 900, 100, 70), "2026-08-03T00:00:04.000Z"),
    taskComplete("upgrade-turn"),
  ].join("\n")}\n`, "utf8");
  const complete = await buildUsageEvents({
    sessionFiles: [activeFile],
    config: config(),
    rateCard,
  });
  const receipt = await persistUsageEvents(root, complete);
  assert.equal(receipt.updated, 1);
  assert.equal(receipt.total_event_count, 1);
  const loaded = await loadPersistedUsageEvents(root);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].measurement.status, "complete");
  assert.equal(loaded[0].usage.input_tokens, 1000);
});

test("SubagentStop hook reads its parent and persists only the child with root work attribution", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-session-"));
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-state-"));
  const parent = await writeSession(sessions, "hook-parent", [
    sessionMeta({ id: "hook-parent" }),
    taskStarted("hook-parent-turn"),
    turnContext("hook-parent-turn"),
    tokenCount(usage(1000, 900, 100, 70), "2026-08-03T00:01:00.000Z"),
  ]);
  const child = await writeSession(sessions, "hook-child", [
    sessionMeta({
      id: "hook-child",
      parent: "hook-parent",
      timestamp: "2026-08-03T00:02:00.000Z",
      depth: 1,
    }),
    taskStarted("hook-child-turn", "2026-08-03T00:02:01.000Z"),
    turnContext("hook-child-turn", "gpt-5.6-luna", "medium", "2026-08-03T00:02:01.100Z"),
    tokenCount(usage(500, 400, 50, 20), "2026-08-03T00:03:00.000Z"),
  ]);
  const configPath = path.join(sessions, "config.json");
  await writeFile(configPath, `${JSON.stringify(config())}\n`, "utf8");
  await upsertUsageBinding(state, {
    thread_id: "hook-parent",
    turn_id: "hook-parent-turn",
    work_id: "hook.work",
    project_id: null,
    team_id: null,
    role: null,
  });
  const result = await runCli([
    "hook",
    "--sessions-root", sessions,
    "--state-root", state,
    "--config", configPath,
  ], `\uFEFF${JSON.stringify({
    hook_event_name: "SubagentStop",
    session_id: "hook-parent",
    transcript_path: parent,
    agent_id: "hook-child",
    agent_transcript_path: child,
    cwd: "fixtures/workspace/project-a",
  })}`);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
  const persisted = await loadPersistedUsageEvents(state);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].thread_id, "hook-child");
  assert.equal(persisted[0].root_turn_id, "hook-parent-turn");
  assert.equal(persisted[0].work_id, "hook.work");
  assert.equal(persisted[0].measurement.status, "observed_at_stop");
});

test("hook isolates missing and malformed stdin as non-blocking HOLD health", async () => {
  for (const [input, detail] of [["", "hook_input_missing"], ["{not-json", "hook_input_invalid"]]) {
    const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-invalid-"));
    const result = await runCli(["hook", "--state-root", state], input);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    const health = JSON.parse(await readFile(path.join(state, "health", "latest.json"), "utf8"));
    assert.equal(health.status, "hold");
    assert.equal(health.detail, detail);
  }
});

test("tracked Windows lifecycle hook command reaches non-blocking health handling", { skip: process.platform !== "win32" }, async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-hook-windows-command-"));
  try {
    const hooks = JSON.parse(await readFile(new URL("../../.codex/hooks.json", import.meta.url), "utf8"));
    const stopCommand = hooks.hooks.Stop[0].hooks[0].commandWindows;
    const subagentStopCommand = hooks.hooks.SubagentStop[0].hooks[0].commandWindows;
    assert.equal(stopCommand, subagentStopCommand);
    assert.equal(stopCommand.includes("$"), false);

    const result = await runWindowsHookCommand(stopCommand, state);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
    const health = JSON.parse(await readFile(path.join(state, "health", "latest.json"), "utf8"));
    assert.equal(health.status, "hold");
    assert.equal(health.detail, "hook_input_missing");
    assert.equal((await loadPersistedUsageEvents(state)).length, 0);
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test("backfill isolates an invalid session and reports the coverage gap", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-backfill-"));
  const good = await writeSession(sessions, "backfill-good", [
    sessionMeta({ id: "backfill-good" }),
    taskStarted("backfill-turn"),
    turnContext("backfill-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("backfill-turn"),
  ]);
  const bad = await writeSession(sessions, "backfill-bad", [
    taskStarted("orphan-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
  ]);
  const result = await collectUsageEvents({
    sessionFiles: [good, bad],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
    sourceRoot: sessions,
    continueOnError: true,
  });
  assert.equal(result.parsed_session_count, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.observed_event_count, 1);
  assert.equal(result.duplicate_event_observation_count, 0);
  assert.deepEqual(result.issues, [{
    source_ref: path.basename(bad),
    code: "session_meta_missing",
  }]);
});

test("continued rollout files collapse to one monotonic turn event before aggregation", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-continuation-"));
  const partial = await writeSession(sessions, "continued-a", [
    sessionMeta({ id: "continued-session" }),
    taskStarted("continued-turn"),
    turnContext("continued-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
  ]);
  const complete = await writeSession(sessions, "continued-b", [
    sessionMeta({ id: "continued-session" }),
    taskStarted("continued-turn"),
    turnContext("continued-turn"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:04.000Z"),
    taskComplete("continued-turn"),
  ]);
  const result = await collectUsageEvents({
    sessionFiles: [partial, complete],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
    includeActive: true,
  });
  assert.equal(result.observed_event_count, 2);
  assert.equal(result.duplicate_event_observation_count, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].measurement.status, "complete");
  assert.equal(result.events[0].usage.input_tokens, 200);
});

test("continued rollout copies enrich missing model metadata without a duplicate conflict", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-model-enrichment-"));
  const known = await writeSession(sessions, "model-known", [
    sessionMeta({ id: "model-enrichment-session" }),
    taskStarted("model-enrichment-turn"),
    turnContext("model-enrichment-turn", "gpt-5.6-sol", "high"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:04.000Z"),
    taskComplete("model-enrichment-turn"),
  ]);
  const copiedWithoutContext = await writeSession(sessions, "model-missing", [
    sessionMeta({ id: "model-enrichment-session" }),
    taskStarted("model-enrichment-turn"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:04.000Z"),
    taskComplete("model-enrichment-turn"),
  ]);
  const result = await collectUsageEvents({
    sessionFiles: [known, copiedWithoutContext],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  assert.equal(result.duplicate_event_observation_count, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].model.id, "gpt-5.6-sol");
  assert.equal(result.events[0].model.reasoning_effort, "high");
  assert.equal(result.events[0].credits.status, "calculated");

  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-model-enrichment-state-"));
  const unknownEvent = (await buildUsageEvents({
    sessionFiles: [copiedWithoutContext],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  }))[0];
  const knownEvent = (await buildUsageEvents({
    sessionFiles: [known],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  }))[0];
  assert.equal(unknownEvent.credits.status, "rate_unknown");
  await persistUsageEvents(state, [unknownEvent]);
  assert.equal((await persistUsageEvents(state, [knownEvent])).updated, 1);
  assert.equal((await loadPersistedUsageEvents(state))[0].model.id, "gpt-5.6-sol");
});

test("continued rollout merges richer model metadata with the larger token observation", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-composite-"));
  const knownPartial = await writeSession(sessions, "composite-known", [
    sessionMeta({ id: "composite-session" }),
    taskStarted("composite-turn"),
    turnContext("composite-turn", "gpt-5.6-sol", "high"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
  ]);
  const unknownComplete = await writeSession(sessions, "composite-complete", [
    sessionMeta({ id: "composite-session" }),
    taskStarted("composite-turn"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:04.000Z"),
    taskComplete("composite-turn"),
  ]);
  const result = await collectUsageEvents({
    sessionFiles: [knownPartial, unknownComplete],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
    includeActive: true,
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].usage.input_tokens, 200);
  assert.equal(result.events[0].measurement.status, "complete");
  assert.equal(result.events[0].model.id, "gpt-5.6-sol");
  assert.equal(result.events[0].credits.status, "calculated");
});

test("incremental continuation persistence accepts a monotonic source rollover and keeps a revision", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-persistence-"));
  const july = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-july-"));
  const august = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-august-"));
  const partial = await writeSession(july, "continued-july", [
    sessionMeta({ id: "incremental-continuation" }),
    taskStarted("incremental-turn"),
    turnContext("incremental-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
  ]);
  const complete = await writeSession(august, "continued-august", [
    sessionMeta({ id: "incremental-continuation" }),
    taskStarted("incremental-turn"),
    turnContext("incremental-turn"),
    tokenCount(usage(200, 100, 20), "2026-08-03T00:00:04.000Z"),
    taskComplete("incremental-turn"),
  ]);
  const [partialEvent] = await buildUsageEvents({
    sessionFiles: [partial],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
    includeActive: true,
  });
  const [completeEvent] = await buildUsageEvents({
    sessionFiles: [complete],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });

  assert.notEqual(partialEvent.source.source_ref, completeEvent.source.source_ref);
  assert.equal((await persistUsageEvents(state, [partialEvent])).created, 1);
  assert.equal((await persistUsageEvents(state, [completeEvent])).updated, 1);
  const [persisted] = await loadPersistedUsageEvents(state);
  assert.equal(persisted.measurement.status, "complete");
  assert.equal(persisted.usage.input_tokens, 200);
  assert.equal(persisted.source.source_ref, completeEvent.source.source_ref);
  assert.equal((await readdir(path.join(state, "revisions", persisted.event_id))).length, 1);

  const queuedState = await mkdtemp(path.join(os.tmpdir(), "sf-usage-rollout-pending-"));
  await persistUsageEvents(queuedState, [partialEvent]);
  const lockPath = path.join(queuedState, "ledger.lock");
  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    token: "continuation-test-lock",
  })}\n`, "utf8");
  const queued = await persistUsageEvents(queuedState, [completeEvent]);
  assert.equal(queued.pending, 1);
  await rm(lockPath, { force: true });
  const drained = await persistUsageEvents(queuedState, []);
  assert.equal(drained.updated, 1);
  const [drainedEvent] = await loadPersistedUsageEvents(queuedState);
  assert.equal(drainedEvent.measurement.status, "complete");
  assert.equal(drainedEvent.usage.input_tokens, 200);
  const pendingEntries = await readdir(path.join(queuedState, "pending"), { recursive: true });
  assert.equal(pendingEntries.some((entry) => String(entry).endsWith(".json")), false);
});

test("missing or malformed required timestamps become per-session coverage HOLD issues", async () => {
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-timestamp-hold-"));
  const good = await writeSession(sessions, "timestamp-good", [
    sessionMeta({ id: "timestamp-good" }),
    taskStarted("timestamp-good-turn"),
    turnContext("timestamp-good-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("timestamp-good-turn"),
  ]);
  const missingSessionTime = await writeSession(sessions, "timestamp-missing", [
    JSON.stringify({ type: "session_meta", payload: { id: "timestamp-missing" } }),
  ]);
  const malformedTurnTime = await writeSession(sessions, "timestamp-malformed", [
    sessionMeta({ id: "timestamp-malformed" }),
    taskStarted("timestamp-malformed-turn", "not-a-timestamp"),
  ]);
  const result = await collectUsageEvents({
    sessionFiles: [good, missingSessionTime, malformedTurnTime],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
    sourceRoot: sessions,
    continueOnError: true,
  });
  assert.equal(result.parsed_session_count, 1);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.issues, [
    { source_ref: path.basename(malformedTurnTime), code: "turn_started_at_invalid" },
    { source_ref: path.basename(missingSessionTime), code: "session_started_at_invalid" },
  ]);
});

test("persist rejects additional raw fields and published-schema core violations before writing", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-runtime-schema-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-runtime-schema-session-"));
  const file = await writeSession(sessions, "runtime-schema", [
    sessionMeta({ id: "runtime-schema" }),
    taskStarted("runtime-schema-turn"),
    turnContext("runtime-schema-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("runtime-schema-turn"),
  ]);
  const [event] = await buildUsageEvents({
    sessionFiles: [file],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  await assert.rejects(
    persistUsageEvents(state, [{ ...event, prompt: "raw material" }]),
    { code: "usage_event_additional_property" },
  );
  const nestedRaw = structuredClone(event);
  nestedRaw.usage.raw_payload = "raw material";
  await assert.rejects(persistUsageEvents(state, [nestedRaw]), { code: "usage_event_usage_additional_property" });
  const malformed = structuredClone(event);
  malformed.time.started_at = "2026-08-03";
  await assert.rejects(persistUsageEvents(state, [malformed]), { code: "usage_event_started_at_invalid" });
  const invalidTotal = structuredClone(event);
  invalidTotal.usage.total_tokens += 1;
  await assert.rejects(persistUsageEvents(state, [invalidTotal]), { code: "usage_event_total_tokens_invalid" });
  const invalidCreditTotal = structuredClone(event);
  invalidCreditTotal.credits.components.output += 0.001;
  await assert.rejects(persistUsageEvents(state, [invalidCreditTotal]), { code: "usage_event_credit_total_mismatch" });
  const invalidCreditTier = structuredClone(event);
  invalidCreditTier.credits.service_tier = "fast";
  await assert.rejects(persistUsageEvents(state, [invalidCreditTier]), { code: "usage_event_credit_service_tier_mismatch" });
  assert.deepEqual(await loadPersistedUsageEvents(state), []);
});

test("ledger-wide lookup prevents shard duplicates and bounds revision upgrades", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-ledger-wide-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-ledger-wide-session-"));
  const file = await writeSession(sessions, "ledger-wide", [
    sessionMeta({ id: "ledger-wide" }),
    taskStarted("ledger-wide-turn"),
    turnContext("ledger-wide-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("ledger-wide-turn"),
  ]);
  const [event] = await buildUsageEvents({
    sessionFiles: [file],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  await persistUsageEvents(state, [event]);
  const originalPath = path.join(state, "events", "2026-08", `${event.event_id}.json`);
  const misplacedDir = path.join(state, "events", "2026-07");
  const misplacedPath = path.join(misplacedDir, `${event.event_id}.json`);
  await mkdir(misplacedDir, { recursive: true });
  await rename(originalPath, misplacedPath);

  const rateRevision = structuredClone(event);
  rateRevision.credits.rate_card_id = `${event.credits.rate_card_id}.revision`;
  assert.equal((await persistUsageEvents(state, [rateRevision])).updated, 1);
  assert.equal((await loadPersistedUsageEvents(state)).length, 1);
  await assert.rejects(readFile(originalPath, "utf8"), { code: "ENOENT" });

  const attributionRevision = structuredClone(rateRevision);
  attributionRevision.team_id = "team-reclassified";
  attributionRevision.project_id = "project-reclassified";
  attributionRevision.work_id = "work.reclassified";
  attributionRevision.actor.role = "reviewer";
  attributionRevision.measurement.attribution_confidence = "explicit_binding";
  assert.equal((await persistUsageEvents(state, [attributionRevision])).updated, 1);

  const forbidden = [
    ["model", (candidate) => { candidate.model.id = "gpt-5.6-terra"; }],
    ["source", (candidate) => { candidate.source.source_ref = "other-rollout.jsonl"; }],
    ["root lineage", (candidate) => { candidate.root_turn_id = "other-root-turn"; }],
    ["start month", (candidate) => {
      candidate.time.started_at = "2026-09-03T00:00:01.000Z";
      candidate.time.completed_at = "2026-09-03T00:00:05.000Z";
    }],
    ["token regression", (candidate) => {
      candidate.usage.input_tokens -= 1;
      candidate.usage.uncached_input_tokens -= 1;
      candidate.usage.total_tokens -= 1;
    }],
  ];
  for (const [name, mutate] of forbidden) {
    const candidate = structuredClone(attributionRevision);
    mutate(candidate);
    await assert.rejects(persistUsageEvents(state, [candidate]), { code: "usage_event_conflict" }, name);
  }
  assert.equal((await loadPersistedUsageEvents(state)).length, 1);
  assert.equal((await readdir(path.join(state, "revisions", event.event_id))).length, 2);
});

test("ledger lock contention durably queues observations and drains them without duplication", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-pending-"));
  const sessions = await mkdtemp(path.join(os.tmpdir(), "sf-usage-pending-session-"));
  const file = await writeSession(sessions, "pending", [
    sessionMeta({ id: "pending" }),
    taskStarted("pending-turn"),
    turnContext("pending-turn"),
    tokenCount(usage(100, 50, 10), "2026-08-03T00:00:03.000Z"),
    taskComplete("pending-turn"),
  ]);
  const [event] = await buildUsageEvents({
    sessionFiles: [file],
    config: config(),
    rateCard: await loadRateCard(RATE_CARD),
  });
  const lockPath = path.join(state, "ledger.lock");
  await writeFile(lockPath, `${JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    token: "test-lock",
  })}\n`, "utf8");
  const queued = await persistUsageEvents(state, [event]);
  assert.equal(queued.pending, 1);
  assert.equal(queued.total_event_count, null);
  assert.deepEqual(await loadPersistedUsageEvents(state), []);

  await rm(lockPath, { force: true });
  const drained = await persistUsageEvents(state, [event]);
  assert.equal(drained.created, 1);
  assert.equal(drained.total_event_count, 1);
  assert.equal((await loadPersistedUsageEvents(state)).length, 1);
  const pendingEntries = await readdir(path.join(state, "pending"), { recursive: true });
  assert.equal(pendingEntries.some((entry) => String(entry).endsWith(".json")), false);
});

test("repo-local emergency disable is idempotent, non-blocking, and restores hook health", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "sf-usage-emergency-control-"));
  try {
    const disable = await runCli(["disable", "--state-root", state]);
    assert.equal(disable.code, 0, disable.stderr);
    assert.deepEqual(JSON.parse(disable.stdout), {
      schema_version: "soulforge.ai_usage_meter_emergency_control_result.v1",
      enabled: false,
      changed: true,
    });
    const repeatedDisable = await runCli(["disable", "--state-root", state]);
    assert.equal(repeatedDisable.code, 0, repeatedDisable.stderr);
    assert.equal(JSON.parse(repeatedDisable.stdout).changed, false);

    const disabledHook = await runCli(["hook", "--state-root", state], "");
    assert.equal(disabledHook.code, 0, disabledHook.stderr);
    assert.deepEqual(JSON.parse(disabledHook.stdout), {});
    const disabledHealth = JSON.parse(await readFile(path.join(state, "health", "latest.json"), "utf8"));
    assert.equal(disabledHealth.status, "disabled");

    const enable = await runCli(["enable", "--state-root", state]);
    assert.equal(enable.code, 0, enable.stderr);
    assert.equal(JSON.parse(enable.stdout).enabled, true);
    const repeatedEnable = await runCli(["enable", "--state-root", state]);
    assert.equal(repeatedEnable.code, 0, repeatedEnable.stderr);
    assert.equal(JSON.parse(repeatedEnable.stdout).changed, false);
    const enabledHealth = JSON.parse(await readFile(path.join(state, "health", "latest.json"), "utf8"));
    assert.equal(enabledHealth.status, "ok");
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});
