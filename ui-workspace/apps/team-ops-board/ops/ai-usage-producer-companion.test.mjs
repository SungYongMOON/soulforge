import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ACTIVE_CODEX_SESSION_MAX_AGE_MS, DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS, MAX_CONSECUTIVE_RECOVERY_ATTEMPTS, SAFE_REPAIR_ISSUE_CODES, USAGE_PRODUCER_CYCLE_HISTORY_LIMIT, USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, USAGE_PRODUCER_CYCLE_MAX_BYTES, USAGE_PRODUCER_CYCLE_SCHEMA, USAGE_PRODUCER_RECOVERY_HISTORY_LIMIT, USAGE_PRODUCER_RECOVERY_HISTORY_SCHEMA, USAGE_PRODUCER_RECOVERY_MAX_BYTES, USAGE_PRODUCER_RECOVERY_SCHEMA, activeCodexSessionIds, containSweepFailure, createUsageProducerCycleRecord, createUsageProducerRecoveryRecord, isConsistentCodexIssues, isUsageProducerCycleRecord, isUsageProducerRecoveryRecord, isVerifiedPersistenceResult, isVerifiedRecoveryPersistenceResult, loadActiveCodexSessionFiles, persistProducerCycleReceipt, persistProducerHeartbeat, persistProducerRecoveryReceipt, runClaudeQuotaSweep, runUsageProducerSweep, startUsageProducerCompanion, USAGE_PRODUCER_LANES, validateCodexCollectionResult } from "./ai-usage-producer-companion.mjs";

const REPO_ROOT = path.resolve("test-fixtures", "repo");
const STATE_ROOT = path.resolve("test-fixtures", "state");
const PROJECT_ROOT = path.resolve("test-fixtures", "owner-root");
const WATCHTOWER_POINTER = path.resolve("test-fixtures", "watchtower", "binding.pointer.json");
const REGISTRY_PATH = path.resolve("test-fixtures", "registry.json");
const ACTIVE_FILES = [
  path.resolve("test-fixtures", "active-a.jsonl"),
  path.resolve("test-fixtures", "active-b.jsonl"),
];

function antigravityResult({ conversationDbCount = 0, issueCount = 0, eventCount = 0 } = {}) {
  return { stdout: JSON.stringify({
    schema_version: "soulforge.ai_usage_meter_collect_antigravity_result.v1",
    mode: "apply",
    conversation_db_count: conversationDbCount,
    issue_count: issueCount,
    event_count: eventCount,
  }) };
}

function codexSummary({ turns = 0 } = {}) {
  return {
    schema_version: "soulforge.ai_usage_summary.v1",
    totals: { turns },
    by_organization: [],
    by_team: [],
    by_project: [],
    by_work: [],
    by_model: [],
    by_agent: [],
    by_node: [],
    by_role: [],
    by_reasoning_effort: [],
    by_attribution: [],
    by_measurement: [],
  };
}

function codexCollectResult({
  sessionFileCount = 0,
  parsedSessionCount = 0,
  issueCount = 0,
  issues = [],
  observedEventCount = 0,
  duplicateEventObservationCount = 0,
  eventCount = 0,
  summary = codexSummary({ turns: eventCount }),
  persistence,
  stateRoot = STATE_ROOT,
  coverage = null,
  ...overrides
} = {}) {
  const resolvedPersistence = persistence !== undefined ? persistence : {
    created: 0,
    updated: 0,
    replayed: eventCount,
    total_event_count: eventCount,
    event_ids: Array.from({ length: eventCount }, (_, i) => `e${String(i + 1).padStart(2, "0")}`),
    state_root: stateRoot,
  };
  return {
    stdout: JSON.stringify({
      schema_version: "soulforge.ai_usage_meter_collect_result.v1",
      mode: "apply",
      session_file_count: sessionFileCount,
      parsed_session_count: parsedSessionCount,
      issue_count: issueCount,
      issues,
      observed_event_count: observedEventCount,
      duplicate_event_observation_count: duplicateEventObservationCount,
      event_count: eventCount,
      summary,
      persistence: resolvedPersistence,
      coverage,
      ...overrides,
    }),
  };
}

function successfulRun(args) {
  if (args?.[1] === "collect-antigravity") return antigravityResult();
  if (args?.[1] === "collect") {
    const stateRootIdx = args ? args.indexOf("--state-root") : -1;
    const stateRoot = stateRootIdx !== -1 && args[stateRootIdx + 1] ? args[stateRootIdx + 1] : STATE_ROOT;
    return codexCollectResult({ stateRoot });
  }
  return undefined;
}

// The sweep's default cycle writer touches the real state root, so every test
// that does not assert on cycle evidence injects an in-memory sink.
const noCycleReceipt = async () => null;
const noRecoveryReceipt = async () => null;

test("active Codex collection selects only fresh exact started sessions", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");
  const ids = activeCodexSessionIds({ identities: [
    { session_id: "fresh-a", lifecycle_state: "started", observed_at: "2026-08-10T11:59:00.000Z" },
    { session_id: "stale-a", lifecycle_state: "started", observed_at: new Date(now - ACTIVE_CODEX_SESSION_MAX_AGE_MS - 1).toISOString() },
    { session_id: "stopped-a", lifecycle_state: "observed_at_stop", observed_at: "2026-08-10T11:59:00.000Z" },
    { session_id: "fresh-a", lifecycle_state: "started", observed_at: "2026-08-10T11:58:00.000Z" },
  ] }, { now: () => now });
  assert.deepEqual(ids, ["fresh-a"]);
});

test("active Codex collection includes a fresh session even before Board enrollment or lifecycle projection", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-global-active-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const stateRoot = path.join(root, "state");
  const sessionsRoot = path.join(root, "sessions", "2026", "08", "13");
  await mkdir(sessionsRoot, { recursive: true });
  const fresh = path.join(sessionsRoot, "rollout-2026-08-13T01-00-00-fresh-unregistered.jsonl");
  const stale = path.join(sessionsRoot, "rollout-2026-08-12T01-00-00-stale-unregistered.jsonl");
  await writeFile(fresh, "", "utf8");
  await writeFile(stale, "", "utf8");
  const now = Date.parse("2026-08-13T02:00:00.000Z");
  await utimes(fresh, new Date(now - 60_000), new Date(now - 60_000));
  await utimes(stale, new Date(now - ACTIVE_CODEX_SESSION_MAX_AGE_MS - 1), new Date(now - ACTIVE_CODEX_SESSION_MAX_AGE_MS - 1));

  const files = await loadActiveCodexSessionFiles({ stateRoot, sessionsRoot, now: () => now });

  assert.deepEqual(files, [fresh]);
});

test("producer sweep refreshes lifecycle and usage ledgers without coupling quota cadence", async () => {
  const calls = [];
  const heartbeats = [];
  const result = await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    threadIds: ["thread-a", "thread-b"],
    loadActiveFiles: async () => ACTIVE_FILES,
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", events_digest: "same" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (file, args) => { calls.push({ file, args }); return successfulRun(args); },
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(calls.slice(0, 4).map((call) => call.args[1]), ["lifecycle-reconcile", "collect", "collect-claude", "collect-antigravity"]);
  assert.deepEqual(calls[0].args.filter((arg) => arg === "--thread-id").length, 2);
  assert.ok(calls.slice(0, 4).every((call) => call.args.includes("--apply")));
  assert.equal(calls[1].args[calls[1].args.indexOf("--project-root") + 1], PROJECT_ROOT);
  assert.deepEqual(calls[3].args.slice(1), ["collect-antigravity", "--state-root", STATE_ROOT, "--max-age-days", "2", "--apply"]);
  assert.equal(calls.length, 7);
  assert.match(calls[4].args[0], /guild_hall[\\/]watchtower[\\/]cli\.mjs$/u);
  assert.deepEqual(calls[4].args.slice(1), ["probe", "--pointer", WATCHTOWER_POINTER, "--json"]);
  assert.equal(calls[4].args.includes("--no-write"), false);
  assert.ok(calls.slice(5).every((call) => call.args.includes("--include-active")));
  assert.ok(calls.slice(5).every((call) => call.args[call.args.indexOf("--project-root") + 1] === PROJECT_ROOT));
  assert.deepEqual(calls.slice(5).map((call) => call.args[call.args.indexOf("--session-file") + 1]), [
    ...ACTIVE_FILES,
  ]);
  assert.deepEqual(heartbeats.map(({ lane, succeeded }) => [lane, succeeded]), [["codex", true], ["claude", true], ["antigravity", true], ["meter", true], ["store_usage_ledger", true]]);
});

test("Antigravity collector failure is isolated and recorded with a sanitized lane receipt", async () => {
  const heartbeats = [];
  const result = await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => {
      if (args[1] === "collect-antigravity") {
        throw Object.assign(new Error("redacted"), { code: 1, stderr: JSON.stringify({ error: "antigravity_index_unreadable", private_detail: "discarded" }) });
      }
      return successfulRun(args);
    },
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(heartbeats.find(({ lane }) => lane === "antigravity"), {
    stateRoot: STATE_ROOT,
    lane: "antigravity",
    attemptedAt: heartbeats[0].attemptedAt,
    succeeded: false,
    errorCode: "antigravity_index_unreadable",
    now: heartbeats[0].now,
  });
  assert.equal(JSON.stringify(heartbeats).includes("private_detail"), false);
  assert.equal(heartbeats.find(({ lane }) => lane === "meter").succeeded, true);
});

test("Antigravity partial result cannot produce a green collector heartbeat", async () => {
  const heartbeats = [];
  const result = await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => args[1] === "collect-antigravity"
      ? antigravityResult({ conversationDbCount: 1, issueCount: 1 })
      : successfulRun(args),
  });
  assert.equal(result.status, "partial");
  assert.equal(heartbeats.find(({ lane }) => lane === "antigravity").errorCode, "antigravity_collection_partial");
});

test("Antigravity zero local databases is a successful idle collector attempt, not provider evidence", async () => {
  const heartbeats = [];
  const result = await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => successfulRun(args),
  });
  assert.equal(result.status, "observed");
  assert.equal(heartbeats.find(({ lane }) => lane === "antigravity").succeeded, true);
});

test("Claude quota sweep uses the gated sanitized collector independently", async () => {
  const calls = [];
  const result = await runClaudeQuotaSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    run: async (file, args, options) => { calls.push({ file, args, options }); },
  });
  assert.equal(result.status, "observed");
  assert.equal(calls.length, 1);
  assert.match(calls[0].args[0], /claude-oauth-usage-collector\.mjs$/u);
  assert.ok(calls[0].args.includes("--gate-path"));
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--gate-path") + 1],
    path.join(PROJECT_ROOT, "guild_hall", "state", "operations", "provider_quota", "claude", "oauth", "enabled.v1.json"),
  );
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--receipt-path") + 1],
    path.join(PROJECT_ROOT, "guild_hall", "state", "operations", "provider_quota", "claude", "statusline", "provider_quota.receipt.v1.json"),
  );
  assert.equal(calls[0].options.windowsHide, true);
});

test("producer heartbeat retains last-good and never treats idle activity as failure", async (t) => {
  const root = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(process.env.TEMP, "usage-heartbeat-")));
  t.after(async () => { await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })); });
  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-11T00:00:00.000Z") + tick++ * 1_000);
  const healthy = await persistProducerHeartbeat({ stateRoot: root, lane: "codex", attemptedAt: now().toISOString(), succeeded: true, activity: false, now });
  assert.equal(healthy.status, "ok");
  assert.equal(healthy.activity_changed, false);
  const failed = await persistProducerHeartbeat({ stateRoot: root, lane: "codex", attemptedAt: now().toISOString(), succeeded: false, errorCode: "collector_failed", now });
  assert.equal(failed.status, "error");
  assert.equal(failed.last_success_at, healthy.last_success_at);
  assert.deepEqual(failed.error_codes, ["collector_failed"]);
  assert.equal(JSON.stringify(failed).includes(root), false);
});

test("Meter heartbeat validates the final ledger independently from a provider failure", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => {
      if (args[1] === "collect-claude") throw Object.assign(new Error("claude unavailable"), { code: "collector_unavailable" });
      return successfulRun(args);
    },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "claude").succeeded, false);
  assert.equal(heartbeats.find(({ lane }) => lane === "meter").succeeded, true);
  assert.equal(heartbeats.find(({ lane }) => lane === "store_usage_ledger").succeeded, true);
});

test("ledger validation receipt remains independent when the Meter receipt channel fails", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => {
      if (value.lane === "meter") throw new Error("meter receipt unavailable");
      heartbeats.push(value);
    },
    run: async (_file, args) => successfulRun(args),
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "store_usage_ledger").succeeded, true);
});

test("collector child exit is preserved as a fixed sanitized error code", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", events_digest: "same" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => { if (args[1] === "collect") throw Object.assign(new Error("redacted"), { code: 1 }); return successfulRun(args); },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "codex").errorCode, "collector_exit_1");
});

test("sanitized Meter CLI error code is retained without stderr detail", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => {
      if (args[1] === "collect") throw Object.assign(new Error("redacted"), { code: 1, stderr: JSON.stringify({ error: "ledger_lock_held", error_digest: "not-retained" }) });
      return successfulRun(args);
    },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "codex").errorCode, "ledger_lock_held");
  assert.equal(JSON.stringify(heartbeats).includes("error_digest"), false);
});

// The companion intervals below are deliberately short, so the wait itself must
// be generous: it returns as soon as the condition holds and only the failure
// path pays the timeout. A tight deadline would flake on a loaded host without
// making any assertion stronger.
async function waitUntil(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("expected companion condition was not reached");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("a rejected sweep is contained as a hold carrying only a sanitized code", async () => {
  assert.deepEqual(
    await containSweepFailure(() => {
      throw Object.assign(new Error(`ledger at ${STATE_ROOT} is locked`), { code: "ledger_lock_held" });
    }),
    { status: "hold", error_code: "ledger_lock_held" },
  );
  const opaque = await containSweepFailure(async () => {
    throw new Error(`unreadable ${REGISTRY_PATH} for account owner@example.com`);
  });
  assert.deepEqual(opaque, { status: "hold", error_code: "collector_failed" });
  const childExit = await containSweepFailure(async () => {
    throw Object.assign(new Error("redacted"), {
      code: 2,
      stderr: JSON.stringify({ error: "collector_gate_disabled", private_detail: "discarded" }),
    });
  });
  assert.equal(childExit.error_code, "collector_gate_disabled");
  const serialized = JSON.stringify([opaque, childExit]);
  assert.equal(serialized.includes("owner@example.com"), false);
  assert.equal(serialized.includes("private_detail"), false);
  assert.equal(serialized.includes(REGISTRY_PATH.replaceAll("\\", "\\\\")), false);
  assert.deepEqual(await containSweepFailure(async () => ({ status: "observed", completed: 3 })), {
    status: "observed",
    completed: 3,
  });
});

test("a failed lane receipt write cannot abort the sweep or falsify sibling lanes", async () => {
  const heartbeats = [];
  const result = await runUsageProducerSweep({
    persistCycle: noCycleReceipt,
    persistRecovery: noRecoveryReceipt,
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => {
      if (value.lane === "codex") {
        throw Object.assign(new Error(`EACCES ${STATE_ROOT}`), { code: "EACCES" });
      }
      heartbeats.push(value);
    },
    run: async (_file, args) => successfulRun(args),
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(heartbeats.map(({ lane }) => lane), [
    "claude", "antigravity", "meter", "store_usage_ledger",
  ]);
});

test("rejected usage and quota sweeps never reach the runtime as unhandled rejections", async () => {
  const rejections = [];
  const listener = (reason) => rejections.push(reason);
  process.on("unhandledRejection", listener);
  let calls = 0;
  let quotaCalls = 0;
  const companion = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    intervalMs: 5,
    loadThreadIds: async () => { throw new Error(`unreadable ${REGISTRY_PATH}`); },
    sweep: async () => {
      calls += 1;
      throw Object.assign(new Error(`ledger at ${STATE_ROOT} is locked`), { code: "ledger_lock_held" });
    },
    quotaSweep: () => {
      quotaCalls += 1;
      throw Object.assign(new Error(`quota gate at ${PROJECT_ROOT}`), { code: "quota_gate_unreadable" });
    },
  });
  try {
    await waitUntil(() => calls >= 3 && quotaCalls >= 3);
  } finally {
    await companion.stop();
    // `unhandledRejection` is emitted a full turn after a rejection goes
    // unhandled, so drain the queue before asserting; otherwise the assertion
    // could pass simply by running too early.
    await new Promise((resolve) => setImmediate(resolve));
    process.off("unhandledRejection", listener);
  }
  assert.deepEqual(rejections, []);
});

test("the sweep timers continue on their own cadence after a contained failure", async () => {
  let calls = 0;
  let quotaCalls = 0;
  const observed = [];
  const companion = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    intervalMs: 5,
    loadThreadIds: async () => [],
    sweep: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("first sweep failed"), { code: "ledger_lock_held" });
      observed.push("usage");
      return { status: "observed", completed: 3 };
    },
    quotaSweep: async () => {
      quotaCalls += 1;
      if (quotaCalls === 1) throw new Error("first quota sweep failed");
      observed.push("quota");
      return { status: "observed" };
    },
  });
  try {
    await waitUntil(() => observed.filter((lane) => lane === "usage").length >= 2
      && observed.filter((lane) => lane === "quota").length >= 2);
  } finally {
    await companion.stop();
  }
  assert.ok(calls >= 3);
  assert.ok(quotaCalls >= 3);
});

test("companion is single-flight and stops without starting another sweep", async () => {
  let calls = 0;
  let quotaCalls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const companion = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    intervalMs: 5,
    loadThreadIds: async () => ["thread-a"],
    quotaSweep: async () => { quotaCalls += 1; },
    sweep: async (options) => {
      assert.equal(options.watchtowerPointerPath, WATCHTOWER_POINTER);
      calls += 1;
      await pending;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  assert.ok(quotaCalls >= 2, "quota cadence must continue while the usage sweep is in flight");
  release();
  await companion.stop();
});

function cycleCollector() {
  const records = [];
  return { records, persistCycle: async ({ record }) => { records.push(record); return record; } };
}

test("a sweep writes a started cycle receipt before it launches any child", async () => {
  const cycle = cycleCollector();
  const seen = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => { seen.push([cycle.records.length, args[1]]); return successfulRun(args); },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async () => undefined,
    persistRecovery: noRecoveryReceipt,
    persistCycle: cycle.persistCycle,
    now: () => new Date("2026-08-19T00:00:00.000Z"),
  });

  assert.ok(seen.length > 0 && seen.every(([recordCount]) => recordCount >= 1), "every child ran after the started receipt");
  assert.equal(cycle.records[0].cycle_state, "started");
  assert.equal(cycle.records[0].schema_version, USAGE_PRODUCER_CYCLE_SCHEMA);
  assert.equal(cycle.records[0].attempted_at, "2026-08-19T00:00:00.000Z");
  assert.equal(cycle.records[0].completed_at, null);
  assert.equal(cycle.records[0].duration_ms, null);
  assert.deepEqual(cycle.records[0].lanes, []);
});

test("a completed cycle receipt carries duration and one exact status per lane", async () => {
  const cycle = cycleCollector();
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    run: async (_node, args) => {
      if (args[1] === "collect-claude") throw Object.assign(new Error("boom"), { code: "ENOENT" });
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async () => undefined,
    persistRecovery: noRecoveryReceipt,
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const completed = cycle.records.at(-1);
  assert.equal(completed.cycle_state, "completed");
  assert.equal(typeof completed.completed_at, "string");
  assert.ok(Number.isSafeInteger(completed.duration_ms) && completed.duration_ms >= 0);
  assert.deepEqual(completed.lanes.map((lane) => lane.lane), [...USAGE_PRODUCER_LANES]);
  assert.equal(completed.lanes.find((lane) => lane.lane === "claude").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "claude").error_code, "ENOENT");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "ok");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, null);
  assert.equal(completed.lanes.find((lane) => lane.lane === "active_sessions").status, "skipped");
  assert.doesNotMatch(JSON.stringify(cycle.records), /test-fixtures|boom|--state-root/u);
});

test("a stuck child times out with a fixed code and does not falsify sibling lanes", async () => {
  const cycle = cycleCollector();
  const observedTimeouts = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    childTimeoutMs: 5_000,
    run: async (_node, args, options) => {
      observedTimeouts.push(options?.timeout);
      // Node execFile signals a timeout kill exactly this way.
      if (args[1] === "collect") throw Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async () => undefined,
    persistRecovery: noRecoveryReceipt,
    persistCycle: cycle.persistCycle,
    now: () => new Date("2026-08-19T00:00:00.000Z"),
  });

  assert.ok(observedTimeouts.length > 0 && observedTimeouts.every((value) => value === 5_000), "every child carried the bounded timeout");
  const lanes = cycle.records.at(-1).lanes;
  assert.equal(lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(lanes.find((lane) => lane.lane === "codex").error_code, "collector_timeout");
  assert.equal(lanes.find((lane) => lane.lane === "antigravity").status, "ok");
  assert.equal(DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS, 180_000);
});

test("a timed-out sweep releases single-flight so the next interval still runs", async () => {
  let sweeps = 0;
  const companion = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    intervalMs: 3_600_000,
    loadThreadIds: async () => [],
    quotaSweep: async () => ({ status: "observed" }),
    sweep: async () => {
      sweeps += 1;
      throw Object.assign(new Error("stuck"), { killed: true, signal: "SIGTERM" });
    },
  });
  await companion.stop();
  const second = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    intervalMs: 3_600_000,
    loadThreadIds: async () => [],
    quotaSweep: async () => ({ status: "observed" }),
    sweep: async () => { sweeps += 1; return { status: "observed", completed: 3 }; },
  });
  await second.stop();
  assert.equal(sweeps, 2);
});

test("idle stays healthy: no new usage is not a producer failure", async () => {
  const cycle = cycleCollector();
  const heartbeats = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => successfulRun(args),
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "unchanged", event_count: 7 }),
    persistHeartbeat: async (options) => { heartbeats.push(options); },
    persistRecovery: noRecoveryReceipt,
    persistCycle: cycle.persistCycle,
    now: () => new Date("2026-08-19T00:00:00.000Z"),
  });

  const meter = heartbeats.find((entry) => entry.lane === "meter");
  assert.equal(meter.succeeded, true);
  assert.equal(meter.activity, false);
  assert.equal(cycle.records.at(-1).lanes.find((lane) => lane.lane === "meter").status, "ok");
});

test("the quota sweep child is bounded by the same timeout and fixed code", async () => {
  let observed = null;
  const result = await runClaudeQuotaSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    childTimeoutMs: 5_000,
    run: async (_node, _args, options) => {
      observed = options?.timeout;
      throw Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" });
    },
  });
  assert.equal(observed, 5_000);
  assert.deepEqual(result, { status: "hold", error_code: "collector_timeout" });
});

test("cycle history retention is bounded and schema-tagged", () => {
  assert.equal(USAGE_PRODUCER_CYCLE_HISTORY_LIMIT, 50);
  assert.equal(USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, "soulforge.ai_usage_producer_cycle_history.v1");
  assert.deepEqual([...USAGE_PRODUCER_LANES], [
    "lifecycle", "codex", "claude", "antigravity", "meter", "store_usage_ledger", "watchtower", "active_sessions",
  ]);
});

test("a refused cycle history is preserved byte-for-byte while latest still records liveness", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-cycle-bound-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const record = createUsageProducerCycleRecord({ cycleState: "started", attemptedAt: "2026-08-19T00:00:00.000Z" });
  const historyFile = path.join(root, "producer_health", "cycle-history.json");
  const corrupt = "CORRUPT-CYCLE-HISTORY-DO-NOT-OVERWRITE";

  for (const boundary of [
    { size: USAGE_PRODUCER_CYCLE_MAX_BYTES + 1, isFile: true, isSymbolicLink: false },
    { size: 64, isFile: true, isSymbolicLink: true },
    { size: 64, isFile: false, isSymbolicLink: false },
  ]) {
    await mkdir(path.dirname(historyFile), { recursive: true });
    await writeFile(historyFile, corrupt, "utf8");
    let reads = 0;
    const result = await persistProducerCycleReceipt({
      stateRoot: root,
      record,
      fsOps: {
        lstat: async () => ({ size: boundary.size, isFile: () => boundary.isFile, isSymbolicLink: () => boundary.isSymbolicLink }),
        readFile: async () => { reads += 1; return "{}"; },
      },
    });

    assert.equal(reads, 0, "the file is never read once the boundary rejects it");
    assert.equal(result.history_outcome, "preserved");
    assert.equal(result.history_reason, "history_present_invalid");
    assert.equal(await readFile(historyFile, "utf8"), corrupt, "corrupt history bytes are unchanged");
    // The sweep's current liveness is still visible despite the refused history.
    assert.equal(result.latest_outcome, "written");
    assert.deepEqual(result.record, record);
    const latest = JSON.parse(await readFile(path.join(root, "producer_health", "cycle.json"), "utf8"));
    assert.equal(latest.cycle_state, "started");
  }
});

test("a malformed or foreign cycle history is preserved rather than filtered or restarted", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-cycle-corrupt-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const record = createUsageProducerCycleRecord({ cycleState: "started", attemptedAt: "2026-08-19T00:00:00.000Z" });
  const historyFile = path.join(root, "producer_health", "cycle-history.json");
  const good = createUsageProducerCycleRecord({ cycleState: "started", attemptedAt: "2026-08-18T00:00:00.000Z" });

  const corruptions = [
    "{not json at all",
    JSON.stringify({ schema_version: "soulforge.foreign.v1", entries: [] }),
    JSON.stringify({ schema_version: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, entries: "nope" }),
    JSON.stringify({ schema_version: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, entries: [{ cycle_state: "started" }] }),
    // One good row beside one bad row is still never salvaged.
    JSON.stringify({ schema_version: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, entries: [good, { tampered: true }] }),
  ];

  for (const corrupt of corruptions) {
    await mkdir(path.dirname(historyFile), { recursive: true });
    await writeFile(historyFile, corrupt, "utf8");

    const result = await persistProducerCycleReceipt({ stateRoot: root, record });

    assert.equal(result.history_outcome, "preserved");
    assert.equal(result.history_reason, "history_present_invalid");
    assert.equal(await readFile(historyFile, "utf8"), corrupt, "the corrupt history is byte-identical afterwards");
    assert.equal(result.latest_outcome, "written");
  }
});

test("a within-bound cycle history is read back and appended to", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-cycle-append-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const first = createUsageProducerCycleRecord({ cycleState: "started", attemptedAt: "2026-08-19T00:00:00.000Z" });
  const second = createUsageProducerCycleRecord({
    cycleState: "completed",
    attemptedAt: "2026-08-19T00:00:00.000Z",
    completedAt: "2026-08-19T00:00:12.000Z",
    durationMs: 12_000,
    lanes: [{ lane: "codex", status: "ok", error_code: null }],
  });
  const created = await persistProducerCycleReceipt({ stateRoot: root, record: first });
  const appended = await persistProducerCycleReceipt({ stateRoot: root, record: second });
  assert.equal(created.history_outcome, "created", "a missing history is a safe first write");
  assert.equal(appended.history_outcome, "appended");

  const history = JSON.parse(await readFile(path.join(root, "producer_health", "cycle-history.json"), "utf8"));
  assert.deepEqual(history.entries.map((row) => row.cycle_state), ["started", "completed"]);
  const latest = JSON.parse(await readFile(path.join(root, "producer_health", "cycle.json"), "utf8"));
  assert.equal(latest.cycle_state, "completed");
  assert.equal(latest.duration_ms, 12_000);
  assert.equal(USAGE_PRODUCER_CYCLE_MAX_BYTES, 128 * 1024);
});

const COMPLETE_LANES = USAGE_PRODUCER_LANES.map((lane) => ({ lane, status: "ok", error_code: null }));
const startedRecord = () => createUsageProducerCycleRecord({ cycleState: "started", attemptedAt: "2026-08-19T00:00:00.000Z" });
const completedRecord = () => createUsageProducerCycleRecord({
  cycleState: "completed",
  attemptedAt: "2026-08-19T00:00:00.000Z",
  completedAt: "2026-08-19T00:00:12.000Z",
  durationMs: 12_000,
  lanes: COMPLETE_LANES,
});

test("a started cycle record may not claim any outcome it cannot yet have", () => {
  const started = startedRecord();
  assert.equal(isUsageProducerCycleRecord(started), true);
  assert.deepEqual(started.lanes, []);
  for (const invalid of [
    { ...started, completed_at: "2026-08-19T00:00:12.000Z" },
    { ...started, duration_ms: 0 },
    { ...started, duration_ms: 12_000 },
    { ...started, lanes: [{ lane: "codex", status: "ok", error_code: null }] },
    { ...started, lanes: COMPLETE_LANES },
  ]) {
    assert.equal(isUsageProducerCycleRecord(invalid), false);
  }
});

test("a completed cycle record must carry a full, duplicate-free lane set and a real duration", () => {
  const completed = completedRecord();
  assert.equal(isUsageProducerCycleRecord(completed), true);
  assert.equal(completed.lanes.length, USAGE_PRODUCER_LANES.length);

  const omitted = COMPLETE_LANES.slice(0, -1);
  const duplicated = [...COMPLETE_LANES.slice(0, -1), { ...COMPLETE_LANES[0] }];
  for (const invalid of [
    { ...completed, completed_at: null },
    { ...completed, completed_at: "not-a-time" },
    { ...completed, duration_ms: null },
    { ...completed, duration_ms: -1 },
    { ...completed, duration_ms: 1.5 },
    { ...completed, lanes: [] },
    { ...completed, lanes: omitted },
    { ...completed, lanes: duplicated },
    { ...completed, lanes: [...COMPLETE_LANES, { lane: "codex", status: "ok", error_code: null }] },
  ]) {
    assert.equal(isUsageProducerCycleRecord(invalid), false);
  }
  assert.equal(duplicated.length, USAGE_PRODUCER_LANES.length, "the duplicate case has the right length and still fails");
});

test("a completed_at earlier than attempted_at is rejected", () => {
  const completed = completedRecord();
  assert.equal(isUsageProducerCycleRecord({ ...completed, completed_at: "2026-08-18T23:59:59.000Z" }), false);
  // Equal timestamps are a legitimate sub-millisecond cycle.
  assert.equal(isUsageProducerCycleRecord({ ...completed, completed_at: completed.attempted_at, duration_ms: 0 }), true);
});

test("a lane row must agree with its own status about whether something failed", () => {
  const completed = completedRecord();
  const withLane = (row) => ({ ...completed, lanes: [row, ...COMPLETE_LANES.slice(1)] });

  assert.equal(isUsageProducerCycleRecord(withLane({ lane: "lifecycle", status: "error", error_code: "collector_timeout" })), true);
  assert.equal(isUsageProducerCycleRecord(withLane({ lane: "lifecycle", status: "ok", error_code: null })), true);
  assert.equal(isUsageProducerCycleRecord(withLane({ lane: "lifecycle", status: "skipped", error_code: null })), true);

  for (const contradictory of [
    { lane: "lifecycle", status: "error", error_code: null },
    { lane: "lifecycle", status: "ok", error_code: "collector_timeout" },
    { lane: "lifecycle", status: "skipped", error_code: "collector_timeout" },
    { lane: "lifecycle", status: "error", error_code: "" },
    { lane: "lifecycle", status: "error", error_code: "raw stderr text with spaces" },
    { lane: "not_a_lane", status: "ok", error_code: null },
    { lane: "lifecycle", status: "maybe", error_code: null },
    { lane: "lifecycle", status: "ok", error_code: null, detail: "extra" },
  ]) {
    assert.equal(isUsageProducerCycleRecord(withLane(contradictory)), false);
  }
});

test("every state-dependent violation classifies the history invalid and preserves its bytes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-cycle-shape-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const historyFile = path.join(root, "producer_health", "cycle-history.json");
  const started = startedRecord();
  const completed = completedRecord();

  const violations = [
    { ...started, duration_ms: 12_000 },
    { ...started, completed_at: "2026-08-19T00:00:12.000Z" },
    { ...started, lanes: COMPLETE_LANES },
    { ...completed, lanes: COMPLETE_LANES.slice(0, -1) },
    { ...completed, lanes: [...COMPLETE_LANES.slice(0, -1), { ...COMPLETE_LANES[0] }] },
    { ...completed, completed_at: "2026-08-18T23:59:59.000Z" },
    { ...completed, duration_ms: -1 },
    { ...completed, lanes: [{ lane: "codex", status: "error", error_code: null }, ...COMPLETE_LANES.slice(1)] },
    { ...completed, lanes: [{ lane: "codex", status: "ok", error_code: "collector_timeout" }, ...COMPLETE_LANES.slice(1)] },
  ];

  for (const violation of violations) {
    assert.equal(isUsageProducerCycleRecord(violation), false, "the validator rejects the violation directly");
    const corrupt = JSON.stringify({ schema_version: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, entries: [violation] });
    await mkdir(path.dirname(historyFile), { recursive: true });
    await writeFile(historyFile, corrupt, "utf8");

    const result = await persistProducerCycleReceipt({ stateRoot: root, record: started });

    assert.equal(result.history_outcome, "preserved");
    assert.equal(result.history_reason, "history_present_invalid");
    assert.equal(await readFile(historyFile, "utf8"), corrupt, "the invalid history is byte-identical afterwards");
    assert.equal(result.latest_outcome, "written");
  }
});

test("a malformed cycle record is never persisted as latest or history in the first place", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-cycle-refuse-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const malformed = { ...startedRecord(), duration_ms: 12_000 };
  assert.equal(await persistProducerCycleReceipt({ stateRoot: root, record: malformed }), null);
  await assert.rejects(() => readFile(path.join(root, "producer_health", "cycle.json"), "utf8"));
});

test("Codex collection with duplicate conflict issue performs self-repair, recording ok heartbeat with backlog metadata and recovery receipt", async () => {
  const cycle = cycleCollector();
  const heartbeats = [];
  const recoveries = [];
  let tick = 0;
  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 5,
            total_event_count: 5,
            event_ids: ["event-1", "event-2", "event-3", "event-4", "event-5"],
            state_root: STATE_ROOT,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  assert.equal(result.status, "observed");
  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, true);
  assert.equal(codexHeartbeat.retryState, "retrying");
  assert.equal(codexHeartbeat.backlogCount, 1);
  assert.equal(codexHeartbeat.attemptNumber, 1);
  assert.deepEqual(codexHeartbeat.safeIssueCodes, ["usage_event_duplicate_conflict"]);
  assert.ok(typeof codexHeartbeat.nextAttemptAt === "string");

  const claudeHeartbeat = heartbeats.find(({ lane }) => lane === "claude");
  assert.equal(claudeHeartbeat.succeeded, true);

  const antigravityHeartbeat = heartbeats.find(({ lane }) => lane === "antigravity");
  assert.equal(antigravityHeartbeat.succeeded, true);

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "ok");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, null);
  assert.equal(completed.lanes.find((lane) => lane.lane === "claude").status, "ok");
  assert.equal(completed.lanes.find((lane) => lane.lane === "antigravity").status, "ok");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].schema_version, USAGE_PRODUCER_RECOVERY_SCHEMA);
  assert.equal(recoveries[0].lane, "codex");
  assert.deepEqual(recoveries[0].safe_issue_codes, ["usage_event_duplicate_conflict"]);
  assert.equal(recoveries[0].backlog_count, 1);
  assert.equal(recoveries[0].attempt_number, 1);
  assert.equal(recoveries[0].action, "quarantine_and_continue");
  assert.equal(recoveries[0].outcome, "retrying");
  assert.equal(recoveries[0].verification_result, "isolated_and_persisted");
});

test("Codex collection with ledger merge conflict issue performs self-repair when persistence succeeds", async () => {
  const cycle = cycleCollector();
  const heartbeats = [];
  const recoveries = [];
  let tick = 0;
  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-canonical-conflict", code: "usage_event_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 5,
            total_event_count: 5,
            event_ids: ["event-1", "event-2", "event-3", "event-4", "event-5"],
            state_root: STATE_ROOT,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  assert.equal(result.status, "observed");
  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, true);
  assert.equal(codexHeartbeat.retryState, "retrying");
  assert.equal(codexHeartbeat.backlogCount, 1);
  assert.equal(codexHeartbeat.attemptNumber, 1);
  assert.deepEqual(codexHeartbeat.safeIssueCodes, ["usage_event_conflict"]);
  assert.ok(typeof codexHeartbeat.nextAttemptAt === "string");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "retrying");
  assert.equal(recoveries[0].action, "quarantine_and_continue");
  assert.equal(recoveries[0].verification_result, "isolated_and_persisted");
});

test("Codex self-repair advances attempt counter up to 3 for same issue codes, then transitions to held", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-budget-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  let currentTime = "2026-08-19T00:00:00.000Z";
  const now = () => new Date(currentTime);

  const mockCollectRun = async (_node, args) => {
    if (args[1] === "collect") {
      return codexCollectResult({
        sessionFileCount: 1,
        parsedSessionCount: 1,
        issueCount: 1,
        issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
        observedEventCount: 5,
        duplicateEventObservationCount: 0,
        eventCount: 5,
        persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
      });
    }
    return successfulRun(args);
  };

  // Run 1: attempt 1 -> retrying
  currentTime = "2026-08-19T00:00:00.000Z";
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: mockCollectRun,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: currentTime, events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  let hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 1);
  assert.equal(hb.backlog_count, 1);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:05:00.000Z");

  // Run 2: attempt 2 -> retrying (time reaches next_attempt_at: 00:05:00.000Z)
  currentTime = "2026-08-19T00:05:00.000Z";
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: mockCollectRun,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: currentTime, events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 2);
  assert.equal(hb.backlog_count, 1);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:15:00.000Z");

  // Run 3: attempt 3 -> retrying (time reaches next_attempt_at: 00:15:00.000Z)
  currentTime = "2026-08-19T00:15:00.000Z";
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: mockCollectRun,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: currentTime, events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 3);
  assert.equal(hb.backlog_count, 1);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:30:00.000Z");

  // Run 4: attempt budget exceeded -> held, next_attempt_at null, remains ok (time reaches next_attempt_at: 00:30:00.000Z)
  currentTime = "2026-08-19T00:30:00.000Z";
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: mockCollectRun,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: currentTime, events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "held");
  assert.equal(hb.attempt_number, 3);
  assert.equal(hb.backlog_count, 1);
  assert.equal(hb.next_attempt_at, null);

  const recoveryHistory = JSON.parse(await readFile(path.join(root, "producer_health", "recovery-history.json"), "utf8"));
  assert.equal(recoveryHistory.entries.length, 4);
  assert.deepEqual(recoveryHistory.entries.map((e) => e.outcome), ["retrying", "retrying", "retrying", "held"]);
});

test("Codex self-repair clears backlog and resets attempt counter when issue disappears", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-clear-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000);

  // Run 1: duplicate conflict -> retrying
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  let hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 1);
  assert.equal(hb.backlog_count, 1);

  // Run 2: clean -> cleared, attempt_number reset to 0, backlog_count 0
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "clear");
  assert.equal(hb.attempt_number, 0);
  assert.equal(hb.backlog_count, 0);
  assert.equal(hb.next_attempt_at, null);

  const recoveryHistory = JSON.parse(await readFile(path.join(root, "producer_health", "recovery-history.json"), "utf8"));
  assert.equal(recoveryHistory.entries.length, 2);
  assert.equal(recoveryHistory.entries[1].outcome, "cleared");
  assert.equal(recoveryHistory.entries[1].verification_result, "clean");
});

test("Codex collection with unsafe or malformed issue code fails closed and is never repaired", async () => {
  const heartbeats = [];
  const recoveries = [];
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "unsafe code with spaces!" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: STATE_ROOT },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return record; },
    persistCycle: noCycleReceipt,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "collector_result_invalid");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result, "collector_result_invalid");
});

test("Codex collection with missing persistence fails closed", async () => {
  const heartbeats = [];
  const recoveries = [];
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          eventCount: 5,
          persistence: null,
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return record; },
    persistCycle: noCycleReceipt,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_missing");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].verification_result, "persistence_missing");
});

test("Codex collection with invalid persistence fails closed and never claims quarantine_and_continue", async () => {
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          eventCount: 5,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 5,
            total_event_count: -1,
            event_ids: ["e01", "e02", "e03", "e04", "e05"],
            state_root: STATE_ROOT,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_invalid");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_invalid");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result, "persistence_invalid");
});

test("recovery history retention is bounded, schema-tagged, and preserves corrupt bytes", async (t) => {
  assert.equal(USAGE_PRODUCER_RECOVERY_HISTORY_LIMIT, 50);
  assert.equal(USAGE_PRODUCER_RECOVERY_HISTORY_SCHEMA, "soulforge.ai_usage_producer_recovery_history.v1");
  assert.equal(USAGE_PRODUCER_RECOVERY_MAX_BYTES, 128 * 1024);
  assert.equal(MAX_CONSECUTIVE_RECOVERY_ATTEMPTS, 3);
  assert.deepEqual([...SAFE_REPAIR_ISSUE_CODES], ["usage_event_duplicate_conflict", "usage_event_conflict"]);

  const root = await mkdtemp(path.join(tmpdir(), "usage-recovery-corrupt-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const historyFile = path.join(root, "producer_health", "recovery-history.json");
  const corrupt = "CORRUPT-RECOVERY-DO-NOT-OVERWRITE";
  await mkdir(path.dirname(historyFile), { recursive: true });
  await writeFile(historyFile, corrupt, "utf8");

  const record = createUsageProducerRecoveryRecord({
    observedAt: "2026-08-19T00:00:00.000Z",
    lane: "codex",
    safeIssueCodes: ["usage_event_duplicate_conflict"],
    backlogCount: 1,
    attemptNumber: 1,
    action: "quarantine_and_continue",
    outcome: "retrying",
    verificationResult: "isolated_and_persisted",
  });

  const result = await persistProducerRecoveryReceipt({ stateRoot: root, record });
  assert.equal(result.history_outcome, "preserved");
  assert.equal(result.history_reason, "history_present_invalid");
  assert.equal(await readFile(historyFile, "utf8"), corrupt);
  assert.equal(result.latest_outcome, "written");
});

test("isUsageProducerRecoveryRecord strictly validates allowed vocabulary and schema", () => {
  const valid = {
    schema_version: USAGE_PRODUCER_RECOVERY_SCHEMA,
    observed_at: "2026-08-19T00:00:00.000Z",
    lane: "codex",
    safe_issue_codes: ["usage_event_duplicate_conflict"],
    backlog_count: 1,
    attempt_number: 1,
    action: "quarantine_and_continue",
    outcome: "retrying",
    verification_result: "isolated_and_persisted",
  };
  assert.equal(isUsageProducerRecoveryRecord(valid), true);

  for (const invalid of [
    null,
    {},
    { ...valid, schema_version: "wrong" },
    { ...valid, lane: "unknown_lane" },
    { ...valid, safe_issue_codes: ["usage_counter_regressed"] },
    { ...valid, safe_issue_codes: ["usage_event_duplicate_conflict", "usage_event_conflict"] }, // unsorted
    { ...valid, backlog_count: -1 },
    { ...valid, attempt_number: 4 },
    { ...valid, action: "unsupported_action" },
    { ...valid, outcome: "unknown_outcome" },
    { ...valid, verification_result: "raw with spaces" },
    { ...valid, forbidden_key: "forbidden" },
  ]) {
    assert.equal(isUsageProducerRecoveryRecord(invalid), false);
  }
});

test("Codex collection with malformed stdout fails closed with collector_result_invalid", async () => {
  const cycle = cycleCollector();
  const heartbeats = [];
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return { stdout: "not valid json" };
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: noRecoveryReceipt,
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "collector_result_invalid");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "collector_result_invalid");
});

test("Codex collection fails closed and records error when final ledger projection validation fails", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-proj-fail-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000);

  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => { throw Object.assign(new Error("snapshot corrupted"), { code: "ledger_projection_invalid" }); },
    persistCycle: noCycleReceipt,
    now,
  });

  const hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "error");
  assert.deepEqual(hb.error_codes, ["ledger_projection_invalid"]);

  const rec = JSON.parse(await readFile(path.join(root, "producer_health", "recovery.json"), "utf8"));
  assert.equal(rec.outcome, "failed");
  assert.equal(rec.verification_result, "ledger_projection_invalid");
});

test("Codex collection with mixed safe issues holds backlog as ok without repair or token invention", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-mixed-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000);

  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 2,
          parsedSessionCount: 2,
          issueCount: 2,
          issues: [
            { source_ref: "session-a", code: "usage_event_duplicate_conflict" },
            { source_ref: "session-b", code: "usage_counter_regressed" },
          ],
          observedEventCount: 10,
          duplicateEventObservationCount: 0,
          eventCount: 10,
          persistence: { created: 0, updated: 0, replayed: 10, total_event_count: 10, event_ids: ["e01", "e02", "e03", "e04", "e05", "e06", "e07", "e08", "e09", "e10"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 10 }),
    persistCycle: noCycleReceipt,
    now,
  });

  const hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "held");
  assert.equal(hb.backlog_count, 2);
  assert.deepEqual(hb.safe_issue_codes, ["usage_counter_regressed", "usage_event_duplicate_conflict"]);
  assert.equal(hb.next_attempt_at, null);

  const rec = JSON.parse(await readFile(path.join(root, "producer_health", "recovery.json"), "utf8"));
  assert.equal(rec.outcome, "held");
  assert.equal(rec.action, "none");
  assert.equal(rec.verification_result, "unresolved_hold");
  assert.deepEqual(rec.safe_issue_codes, ["usage_counter_regressed", "usage_event_duplicate_conflict"]);
});

test("Codex self-repair backoff respects next_attempt_at and only increments when due", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-truthful-backoff-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });

  let currentTime = "2026-08-19T00:00:00.000Z";
  const now = () => new Date(currentTime);

  const mockCollect = async (_node, args) => {
    if (args[1] === "collect") {
      return codexCollectResult({
        sessionFileCount: 1, parsedSessionCount: 1, issueCount: 1,
        issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
        observedEventCount: 5, eventCount: 5,
        persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
      });
    }
    return successfulRun(args);
  };

  const sweep = async () => runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: mockCollect,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: currentTime, events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });

  // T = 0m: Initial incident -> attempt 1, next_attempt_at = T + 5m (00:05:00.000Z)
  currentTime = "2026-08-19T00:00:00.000Z";
  await sweep();
  let hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 1);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:05:00.000Z");

  // T = 2m (< 5m): Intermediate sweep -> attempt remains 1, next_attempt_at remains 00:05:00.000Z
  currentTime = "2026-08-19T00:02:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 1);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:05:00.000Z");

  // T = 5m (== next_attempt_at): Due! Advances to attempt 2 -> next_attempt_at = T + 10m (00:15:00.000Z)
  currentTime = "2026-08-19T00:05:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");
  assert.equal(hb.attempt_number, 2);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:15:00.000Z");

  // T = 10m (< 15m): Intermediate sweep -> attempt remains 2, next_attempt_at remains 00:15:00.000Z
  currentTime = "2026-08-19T00:10:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.attempt_number, 2);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:15:00.000Z");

  // T = 15m (== next_attempt_at): Due! Advances to attempt 3 -> next_attempt_at = T + 15m (00:30:00.000Z)
  currentTime = "2026-08-19T00:15:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.attempt_number, 3);
  assert.equal(hb.next_attempt_at, "2026-08-19T00:30:00.000Z");

  // T = 30m (== next_attempt_at): Due! Budget (3 attempts) exhausted -> transitions to held, next_attempt_at: null
  currentTime = "2026-08-19T00:30:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "held");
  assert.equal(hb.attempt_number, 3);
  assert.equal(hb.next_attempt_at, null);

  // T = 35m: Intermediate repeated held sweep -> remains held, history length does NOT increase
  currentTime = "2026-08-19T00:35:00.000Z";
  await sweep();
  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "held");

  const recoveryHistory = JSON.parse(await readFile(path.join(root, "producer_health", "recovery-history.json"), "utf8"));
  assert.equal(recoveryHistory.entries.length, 4);
  assert.deepEqual(recoveryHistory.entries.map((e) => ({ attempt: e.attempt_number, outcome: e.outcome })), [
    { attempt: 1, outcome: "retrying" },
    { attempt: 2, outcome: "retrying" },
    { attempt: 3, outcome: "retrying" },
    { attempt: 3, outcome: "held" },
  ]);
});

test("recovery log only records cleared on transition from prior backlog and avoids spamming normal operations", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-log-signal-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });

  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000);

  const cleanCollect = async (_node, args) => {
    if (args[1] === "collect") {
      return codexCollectResult({
        sessionFileCount: 1, parsedSessionCount: 1, issueCount: 0, issues: [],
        observedEventCount: 5, eventCount: 5,
        persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
      });
    }
    return successfulRun(args);
  };

  const conflictCollect = async (_node, args) => {
    if (args[1] === "collect") {
      return codexCollectResult({
        sessionFileCount: 1, parsedSessionCount: 1, issueCount: 1,
        issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
        observedEventCount: 5, eventCount: 5,
        persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
      });
    }
    return successfulRun(args);
  };

  // Step 1: Normal steady-state clean sweep with no prior history -> should NOT create recovery log
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: cleanCollect,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });

  const historyFile = path.join(root, "producer_health", "recovery-history.json");
  let historyExists = true;
  try {
    await readFile(historyFile, "utf8");
  } catch {
    historyExists = false;
  }
  assert.equal(historyExists, false, "steady state clean sweep must not write recovery history");

  // Step 2: Incident occurs (conflict) -> writes 1st history record (retrying)
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: conflictCollect,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  let history = JSON.parse(await readFile(historyFile, "utf8"));
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].outcome, "retrying");

  // Step 3: Issue clears on next sweep -> writes 2nd history record (cleared transition)
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: cleanCollect,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  history = JSON.parse(await readFile(historyFile, "utf8"));
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[1].outcome, "cleared");

  // Step 4: Next clean sweep -> history length MUST REMAIN 2 (no spam)
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: cleanCollect,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });
  history = JSON.parse(await readFile(historyFile, "utf8"));
  assert.equal(history.entries.length, 2);
});

test("validateCodexCollectionResult validates exact required counts, schema, issues, summary, and persistence shape", () => {
  const baseSummary = () => ({
    schema_version: "soulforge.ai_usage_summary.v1",
    totals: { turns: 10 },
    by_organization: [],
    by_team: [],
    by_project: [],
    by_work: [],
    by_model: [],
    by_agent: [],
    by_node: [],
    by_role: [],
    by_reasoning_effort: [],
    by_attribution: [],
    by_measurement: [],
  });

  const baseResult = () => ({
    schema_version: "soulforge.ai_usage_meter_collect_result.v1",
    mode: "apply",
    session_file_count: 3,
    parsed_session_count: 3,
    issue_count: 0,
    issues: [],
    observed_event_count: 10,
    duplicate_event_observation_count: 0,
    event_count: 10,
    summary: baseSummary(),
    persistence: null,
    coverage: null,
  });

  // Valid clean result passes
  const valid = validateCodexCollectionResult({ stdout: JSON.stringify(baseResult()) });
  assert.equal(valid.schema_version, "soulforge.ai_usage_meter_collect_result.v1");
  assert.equal(valid.event_count, 10);

  // Valid conflict result passes
  const validConflict = validateCodexCollectionResult({
    stdout: JSON.stringify({
      ...baseResult(),
      issue_count: 1,
      issues: [{ source_ref: "session-abc.jsonl", code: "usage_event_duplicate_conflict" }],
    }),
  });
  assert.equal(validConflict.issue_count, 1);
  assert.equal(validConflict.issues[0].code, "usage_event_duplicate_conflict");

  // Valid plain object persistence and coverage pass
  const validObjects = validateCodexCollectionResult({
    stdout: JSON.stringify({
      ...baseResult(),
      persistence: { ledger_file: "test" },
      coverage: { complete: true },
    }),
  });
  assert.equal(validObjects.persistence.ledger_file, "test");

  // Table-driven rejection mutations
  const invalidMutations = [
    // Missing root keys
    ...Object.keys(baseResult()).map((key) => {
      const copy = baseResult();
      delete copy[key];
      return { name: `missing root key ${key}`, payload: copy };
    }),
    // Extra root key
    { name: "extra root key", payload: { ...baseResult(), forbidden_extra_key: "value" } },
    // Negative counts
    { name: "negative session_file_count", payload: { ...baseResult(), session_file_count: -1 } },
    { name: "negative parsed_session_count", payload: { ...baseResult(), parsed_session_count: -1 } },
    { name: "negative issue_count", payload: { ...baseResult(), issue_count: -1 } },
    { name: "negative observed_event_count", payload: { ...baseResult(), observed_event_count: -1 } },
    { name: "negative duplicate_event_observation_count", payload: { ...baseResult(), duplicate_event_observation_count: -1 } },
    { name: "negative event_count", payload: { ...baseResult(), event_count: -1 } },
    // Non-integer counts
    { name: "float event_count", payload: { ...baseResult(), event_count: 1.5 } },
    { name: "string event_count", payload: { ...baseResult(), event_count: "10" } },
    // Invariant violations
    { name: "parsed > session count", payload: { ...baseResult(), session_file_count: 2, parsed_session_count: 3 } },
    { name: "event > observed count", payload: { ...baseResult(), observed_event_count: 5, event_count: 10, summary: { ...baseSummary(), totals: { turns: 10 } } } },
    { name: "issue_count mismatch", payload: { ...baseResult(), issue_count: 1, issues: [] } },
    // Mode != apply
    { name: "dry_run mode", payload: { ...baseResult(), mode: "dry_run" } },
    // Primitive / array persistence & coverage
    { name: "string persistence", payload: { ...baseResult(), persistence: "invalid_string" } },
    { name: "array persistence", payload: { ...baseResult(), persistence: [1, 2] } },
    { name: "number coverage", payload: { ...baseResult(), coverage: 123 } },
    { name: "array coverage", payload: { ...baseResult(), coverage: [] } },
    // Issue violations (extra keys)
    { name: "issue detail", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict", detail: "forbidden" }] } },
    { name: "issue reason", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict", reason: "forbidden" }] } },
    { name: "issue winner_turn_id", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict", winner_turn_id: "forbidden" }] } },
    // Issue source_ref violations
    { name: "issue absolute path", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "/absolute/path/session.jsonl", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue drive path", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: ["C:", "\\path\\session.jsonl"].join(""), code: "usage_event_duplicate_conflict" }] } },
    { name: "issue slash drive path", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: ["C:", "/path/session.jsonl"].join(""), code: "usage_event_duplicate_conflict" }] } },
    { name: "issue traversal path", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "../traversal/session.jsonl", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue email", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "user@example.com", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue bearer token", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "bearer_token_abc", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue secret password", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "secret_password", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue control char", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "control\x00char", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue overlong text", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "a".repeat(241), code: "usage_event_duplicate_conflict" }] } },
    { name: "issue empty string", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "", code: "usage_event_duplicate_conflict" }] } },
    { name: "issue invalid code", payload: { ...baseResult(), issue_count: 1, issues: [{ source_ref: "session-a", code: "invalid code with spaces" }] } },
    // Summary violations
    { name: "summary wrong schema", payload: { ...baseResult(), summary: { ...baseSummary(), schema_version: "wrong_schema" } } },
    { name: "summary missing key", payload: (() => { const s = baseSummary(); delete s.by_model; return { ...baseResult(), summary: s }; })() },
    { name: "summary extra key", payload: { ...baseResult(), summary: { ...baseSummary(), extra_key: "forbidden" } } },
    { name: "summary turns mismatch", payload: { ...baseResult(), summary: { ...baseSummary(), totals: { turns: 999 } } } },
    { name: "summary negative turns", payload: { ...baseResult(), summary: { ...baseSummary(), totals: { turns: -1 } } } },
    { name: "summary non-array by_model", payload: { ...baseResult(), summary: { ...baseSummary(), by_model: { not: "array" } } } },
  ];

  for (const { name, payload } of invalidMutations) {
    assert.throws(
      () => validateCodexCollectionResult({ stdout: JSON.stringify(payload) }),
      { code: "collector_result_invalid" },
      `Expected collector_result_invalid for ${name}`
    );
  }
});

test("isVerifiedRecoveryPersistenceResult validates written latest and accepted history outcome", () => {
  assert.equal(isVerifiedRecoveryPersistenceResult({ latest_outcome: "written", history_outcome: "created" }), true);
  assert.equal(isVerifiedRecoveryPersistenceResult({ latest_outcome: "written", history_outcome: "appended" }), true);

  assert.equal(isVerifiedRecoveryPersistenceResult(null), false);
  assert.equal(isVerifiedRecoveryPersistenceResult(undefined), false);
  assert.equal(isVerifiedRecoveryPersistenceResult({}), false);
  assert.equal(isVerifiedRecoveryPersistenceResult({ latest_outcome: "latest_write_failed", history_outcome: "created" }), false);
  assert.equal(isVerifiedRecoveryPersistenceResult({ latest_outcome: "written", history_outcome: "preserved" }), false);
  assert.equal(isVerifiedRecoveryPersistenceResult({ latest_outcome: "written", history_outcome: "other" }), false);
});

test("isVerifiedPersistenceResult validates exact receipt contract test-first", () => {
  const validPersistence = {
    created: 0,
    updated: 0,
    replayed: 5,
    total_event_count: 5,
    event_ids: ["e1", "e2", "e3", "e4", "e5"],
    state_root: STATE_ROOT,
  };

  // Valid basic 6-key receipt
  assert.equal(isVerifiedPersistenceResult(validPersistence, STATE_ROOT), true);

  // Valid with empty issues array (7 keys)
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [] }, STATE_ROOT), true);

  // Valid with issue rows
  assert.equal(isVerifiedPersistenceResult({
    ...validPersistence,
    issues: [{ source_ref: "session-a.json", code: "usage_event_conflict" }],
  }, STATE_ROOT), true);

  // Valid all-zero empty receipt (6 keys and 7 keys)
  assert.equal(isVerifiedPersistenceResult({ created: 0, updated: 0, replayed: 0, event_ids: [], total_event_count: 0, state_root: STATE_ROOT }, STATE_ROOT), true);
  assert.equal(isVerifiedPersistenceResult({ created: 0, updated: 0, replayed: 0, event_ids: [], total_event_count: 0, state_root: STATE_ROOT, issues: [] }, STATE_ROOT), true);

  // Rejects invalid/non-string/unsafe event_ids entries
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: [123] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["e1", 123, "e3", "e4", "e5"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: [""] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["path/to/event"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["api_key=secret"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["bearer_token"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["event 1"] }, STATE_ROOT), false);

  // Rejects duplicate and unsorted event_ids
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, replayed: 2, total_event_count: 2, event_ids: ["e1", "e1"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, replayed: 2, total_event_count: 2, event_ids: ["e2", "e1"] }, STATE_ROOT), false);

  // Rejects mismatched count (created + updated + replayed !== event_ids.length)
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, created: 1, event_ids: ["e1"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, event_ids: ["e1"] }, STATE_ROOT), false);

  // Rejects total_event_count < event_ids.length
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: 3 }, STATE_ROOT), false);

  // Rejects missing required keys
  for (const key of ["created", "updated", "replayed", "event_ids", "total_event_count", "state_root"]) {
    const missing = { ...validPersistence };
    delete missing[key];
    assert.equal(isVerifiedPersistenceResult(missing, STATE_ROOT), false);
  }

  // Rejects extra keys
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, extra_key: true }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [], pending: 1 }, STATE_ROOT), false);

  // Rejects negative, non-safe-integer, non-number counts
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: -1 }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: 1.5 }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: "5" }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: NaN }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, total_event_count: Infinity }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, created: -1 }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, updated: -1 }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, replayed: -1 }, STATE_ROOT), false);

  // Direct helper tests: exact root valid, normalized equivalent path valid
  const normalizedEquivalent = path.resolve(STATE_ROOT, "sub", "..");
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: normalizedEquivalent }, STATE_ROOT), true);
  assert.equal(isVerifiedPersistenceResult(validPersistence, normalizedEquivalent), true);

  // Windows case equivalent valid only on win32
  if (process.platform === "win32") {
    const caseEquivalent = STATE_ROOT.toLowerCase() === STATE_ROOT ? STATE_ROOT.toUpperCase() : STATE_ROOT.toLowerCase();
    assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: caseEquivalent }, STATE_ROOT), true);
    assert.equal(isVerifiedPersistenceResult(validPersistence, caseEquivalent), true);
  } else {
    const upper = "/TEST/STATE/ROOT";
    const lower = "/test/state/root";
    assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: upper }, lower), false);
  }

  // Sibling, parent, child mismatch invalid
  const parentRoot = path.dirname(STATE_ROOT);
  const childRoot = path.join(STATE_ROOT, "child");
  const siblingRoot = path.join(parentRoot, "sibling-root");
  const alternateRoot = path.resolve(tmpdir(), "other-state-root");
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: parentRoot }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: childRoot }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: siblingRoot }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: alternateRoot }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, parentRoot), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, childRoot), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, siblingRoot), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, alternateRoot), false);

  // Missing / non-absolute / invalid expectedStateRoot
  assert.equal(isVerifiedPersistenceResult(validPersistence, undefined), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, null), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, ""), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, "relative/path"), false);
  assert.equal(isVerifiedPersistenceResult(validPersistence, 123), false);

  // Rejects invalid state_root
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: "" }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: 123 }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, state_root: "relative/path" }, STATE_ROOT), false);

  // Rejects invalid issues
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: "not_array" }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: ["not_object"] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [{ code: "usage_event_conflict" }] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [{ source_ref: "session-a" }] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [{ source_ref: "session-a", code: "usage_event_conflict", extra: true }] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [{ source_ref: "/absolute/path", code: "usage_event_conflict" }] }, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({ ...validPersistence, issues: [{ source_ref: "session-a", code: "INVALID ERROR!" }] }, STATE_ROOT), false);

  // Null / undefined / primitive / empty object are invalid
  assert.equal(isVerifiedPersistenceResult(null, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult(undefined, STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult("invalid", STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult([], STATE_ROOT), false);
  assert.equal(isVerifiedPersistenceResult({}, STATE_ROOT), false);
});

test("isConsistentCodexIssues validates empty/empty, exact subset, missing, mismatch, and multiplicity", () => {
  // Empty / empty valid
  assert.equal(isConsistentCodexIssues([], []), true);
  assert.equal(isConsistentCodexIssues([], null), true);
  assert.equal(isConsistentCodexIssues([], undefined), true);

  // Persistence issue exact subset valid
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "usage_event_conflict" }],
    [{ source_ref: "s1", code: "usage_event_conflict" }]
  ), true);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "parse-err", code: "parse_error" }, { source_ref: "s1", code: "usage_event_conflict" }],
    [{ source_ref: "s1", code: "usage_event_conflict" }]
  ), true);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "usage_event_conflict" }, { source_ref: "s2", code: "other_code" }],
    [{ source_ref: "s1", code: "usage_event_conflict" }]
  ), true);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s2", code: "c2" }],
    [{ source_ref: "s2", code: "c2" }, { source_ref: "s1", code: "c1" }]
  ), true);

  // Persistence issue missing from root invalid (clean root requires empty persistence issues)
  assert.equal(isConsistentCodexIssues(
    [],
    [{ source_ref: "s1", code: "usage_event_conflict" }]
  ), false);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "usage_event_conflict" }],
    [{ source_ref: "s1", code: "usage_event_conflict" }, { source_ref: "s2", code: "other_code" }]
  ), false);

  // Code / ref mismatch invalid
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "usage_event_conflict" }],
    [{ source_ref: "s2", code: "usage_event_conflict" }]
  ), false);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "usage_event_conflict" }],
    [{ source_ref: "s1", code: "other_code" }]
  ), false);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }],
    [{ source_ref: "s2", code: "c2" }]
  ), false);

  // Duplicate multiplicity mismatch invalid if applicable
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }],
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }]
  ), false);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }],
    [{ source_ref: "s1", code: "c1" }]
  ), true);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }],
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }]
  ), true);
  assert.equal(isConsistentCodexIssues(
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }],
    [{ source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }, { source_ref: "s1", code: "c1" }]
  ), false);

  // Malformed and invalid input structures
  assert.equal(isConsistentCodexIssues(null, []), false);
  assert.equal(isConsistentCodexIssues(undefined, []), false);
  assert.equal(isConsistentCodexIssues("invalid", []), false);
  assert.equal(isConsistentCodexIssues([], "invalid"), false);
  assert.equal(isConsistentCodexIssues([{ source_ref: 123, code: "c1" }], [{ source_ref: 123, code: "c1" }]), false);
  assert.equal(isConsistentCodexIssues([{ source_ref: "s1", code: null }], [{ source_ref: "s1", code: null }]), false);
  assert.equal(isConsistentCodexIssues([null], [null]), false);
  assert.equal(isConsistentCodexIssues([{}], [{}]), false);
});

test("Codex self-repair fails closed and records error heartbeat when persistRecovery rejects", async () => {
  const heartbeats = [];
  const cycle = cycleCollector();
  let tick = 0;
  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: STATE_ROOT },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async () => { throw new Error("disk_write_failure"); },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  assert.ok(codexHeartbeats.every((hb) => hb.succeeded === false));
  assert.equal(codexHeartbeats.at(-1).errorCode, "recovery_receipt_unavailable");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "recovery_receipt_unavailable");
});

test("Codex self-repair fails closed and records error heartbeat when persistRecovery returns non-written outcome", async () => {
  const heartbeats = [];
  const cycle = cycleCollector();
  let tick = 0;
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: STATE_ROOT },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async () => ({ latest_outcome: "latest_write_failed", history_outcome: "preserved" }),
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  assert.ok(codexHeartbeats.every((hb) => hb.succeeded === false));
  assert.equal(codexHeartbeats.at(-1).errorCode, "recovery_receipt_unavailable");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "recovery_receipt_unavailable");
});

test("Codex cleared transition fails closed and records error heartbeat when cleared receipt write fails", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "usage-codex-clear-fail-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  let tick = 0;
  const now = () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000);

  // Run 1: duplicate conflict -> retrying (succeeds, creating prior backlog heartbeat)
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistCycle: noCycleReceipt,
    now,
  });

  let hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "ok");
  assert.equal(hb.retry_state, "retrying");

  // Run 2: clean collect, but persistRecovery rejects
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: { created: 0, updated: 0, replayed: 5, total_event_count: 5, event_ids: ["e1", "e2", "e3", "e4", "e5"], state_root: root },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistRecovery: async () => { throw new Error("disk_error"); },
    persistCycle: noCycleReceipt,
    now,
  });

  hb = JSON.parse(await readFile(path.join(root, "producer_health", "codex.json"), "utf8"));
  assert.equal(hb.status, "error");
  assert.deepEqual(hb.error_codes, ["recovery_receipt_unavailable"]);
});

test("runUsageProducerSweep fails closed on persistence with invalid event_ids [123] and performs no quarantine action", async () => {
  const root = path.join(tmpdir(), `test-companion-sweep-event-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(root, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 1,
          duplicateEventObservationCount: 0,
          eventCount: 1,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 1,
            total_event_count: 1,
            event_ids: [123],
            state_root: root,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_invalid");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_invalid");

  // Must not claim quarantine_and_continue or retrying
  assert.equal(recoveries.some((r) => r.action === "quarantine_and_continue"), false);
  assert.equal(recoveries.some((r) => r.outcome === "retrying"), false);
  await rm(root, { recursive: true, force: true });
});

test("runUsageProducerSweep fails closed on persistence state_root mismatch and performs no quarantine action", async () => {
  const rootA = path.join(tmpdir(), `test-companion-sweep-rootA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const rootB = path.join(tmpdir(), `test-companion-sweep-rootB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(rootA, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: rootA,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 1,
          issues: [{ source_ref: "session-a", code: "usage_event_duplicate_conflict" }],
          observedEventCount: 1,
          duplicateEventObservationCount: 0,
          eventCount: 1,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 1,
            total_event_count: 1,
            event_ids: ["e1"],
            state_root: rootB,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeat = heartbeats.find(({ lane }) => lane === "codex");
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_invalid");

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_invalid");

  // Must not claim quarantine_and_continue, retrying, held, or ok
  assert.equal(recoveries.some((r) => r.action === "quarantine_and_continue"), false);
  assert.equal(recoveries.some((r) => r.outcome === "retrying"), false);
  assert.equal(recoveries.some((r) => r.outcome === "held"), false);
  assert.equal(heartbeats.some((hb) => hb.status === "ok" || hb.status === "held" || hb.retry_state === "retrying" || hb.retry_state === "held"), false);
  await rm(rootA, { recursive: true, force: true });
});

test("runUsageProducerSweep fails closed on clean collect with missing persistence and never marks ok/clear", async () => {
  const root = path.join(tmpdir(), `test-companion-sweep-clean-missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(root, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: null,
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  const codexHeartbeat = codexHeartbeats.at(-1);
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_missing");
  assert.equal(heartbeats.some((hb) => hb.lane === "codex" && (hb.succeeded === true || hb.retry_state === "clear" || hb.retry_state === "held" || hb.status === "ok")), false);

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_missing");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result, "persistence_missing");
  await rm(root, { recursive: true, force: true });
});

test("runUsageProducerSweep fails closed on clean collect with invalid event_ids [123] persistence and never marks ok/clear", async () => {
  const root = path.join(tmpdir(), `test-companion-sweep-clean-event-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(root, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 1,
          duplicateEventObservationCount: 0,
          eventCount: 1,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 1,
            total_event_count: 1,
            event_ids: [123],
            state_root: root,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  const codexHeartbeat = codexHeartbeats.at(-1);
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_invalid");
  assert.equal(heartbeats.some((hb) => hb.lane === "codex" && (hb.succeeded === true || hb.retry_state === "clear" || hb.retry_state === "held" || hb.status === "ok")), false);

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_invalid");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result, "persistence_invalid");
  await rm(root, { recursive: true, force: true });
});

test("runUsageProducerSweep fails closed on clean collect with persistence state_root mismatch and never marks ok/clear", async () => {
  const rootA = path.join(tmpdir(), `test-companion-sweep-clean-rootA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const rootB = path.join(tmpdir(), `test-companion-sweep-clean-rootB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(rootA, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: rootA,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 1,
          duplicateEventObservationCount: 0,
          eventCount: 1,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 1,
            total_event_count: 1,
            event_ids: ["e1"],
            state_root: rootB,
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 1 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  const codexHeartbeat = codexHeartbeats.at(-1);
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode, "persistence_invalid");
  assert.equal(heartbeats.some((hb) => hb.lane === "codex" && (hb.succeeded === true || hb.retry_state === "clear" || hb.retry_state === "held" || hb.status === "ok")), false);

  const completed = cycle.records.at(-1);
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").status, "error");
  assert.equal(completed.lanes.find((lane) => lane.lane === "codex").error_code, "persistence_invalid");

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result, "persistence_invalid");
  await rm(rootA, { recursive: true, force: true });
});

test("runUsageProducerSweep fails closed on contradiction: root issues [] but persistence.issues nonempty and never marks ok/clear/retry/held", async () => {
  const root = path.join(tmpdir(), `test-companion-sweep-contradiction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(path.join(root, "producer_health"), { recursive: true });
  const heartbeats = [];
  const recoveries = [];
  const cycle = cycleCollector();
  let tick = 0;

  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: root,
    run: async (_node, args) => {
      if (args[1] === "collect") {
        return codexCollectResult({
          sessionFileCount: 1,
          parsedSessionCount: 1,
          issueCount: 0,
          issues: [],
          observedEventCount: 5,
          duplicateEventObservationCount: 0,
          eventCount: 5,
          persistence: {
            created: 0,
            updated: 0,
            replayed: 5,
            total_event_count: 5,
            event_ids: ["e1", "e2", "e3", "e4", "e5"],
            state_root: root,
            issues: [{ source_ref: "session-a", code: "usage_event_conflict" }],
          },
        });
      }
      return successfulRun(args);
    },
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-19T00:00:00.000Z", events_digest: "a", event_count: 5 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    persistRecovery: async ({ record }) => { recoveries.push(record); return { record, latest_outcome: "written", history_outcome: "created", history_reason: null }; },
    persistCycle: cycle.persistCycle,
    now: () => new Date(Date.parse("2026-08-19T00:00:00.000Z") + (tick++) * 1_000),
  });

  const codexHeartbeats = heartbeats.filter(({ lane }) => lane === "codex");
  assert.ok(codexHeartbeats.length > 0);
  const codexHeartbeat = codexHeartbeats.at(-1);
  assert.equal(codexHeartbeat.succeeded, false);
  assert.equal(codexHeartbeat.errorCode === "collector_result_invalid" || codexHeartbeat.errorCode === "persistence_invalid", true);
  assert.equal(heartbeats.some((hb) => hb.lane === "codex" && (hb.succeeded === true || hb.retry_state === "clear" || hb.retry_state === "retrying" || hb.retry_state === "held" || hb.status === "ok")), false);

  const completed = cycle.records.at(-1);
  const codexCycleLane = completed.lanes.find((lane) => lane.lane === "codex");
  assert.equal(codexCycleLane.status, "error");
  assert.equal(codexCycleLane.error_code === "collector_result_invalid" || codexCycleLane.error_code === "persistence_invalid", true);

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].outcome, "failed");
  assert.equal(recoveries[0].action, "none");
  assert.equal(recoveries[0].verification_result === "collector_result_invalid" || recoveries[0].verification_result === "persistence_invalid", true);
  assert.equal(recoveries.some((r) => r.action === "quarantine_and_continue"), false);
  assert.equal(recoveries.some((r) => r.outcome === "retrying" || r.outcome === "held" || r.outcome === "cleared"), false);
  await rm(root, { recursive: true, force: true });
});
