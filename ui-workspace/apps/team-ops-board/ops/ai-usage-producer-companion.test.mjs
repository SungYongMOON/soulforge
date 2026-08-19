import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ACTIVE_CODEX_SESSION_MAX_AGE_MS, DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS, USAGE_PRODUCER_CYCLE_HISTORY_LIMIT, USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA, USAGE_PRODUCER_CYCLE_MAX_BYTES, USAGE_PRODUCER_CYCLE_SCHEMA, createUsageProducerCycleRecord, isUsageProducerCycleRecord, persistProducerCycleReceipt, USAGE_PRODUCER_LANES, activeCodexSessionIds, containSweepFailure, loadActiveCodexSessionFiles, persistProducerHeartbeat, runClaudeQuotaSweep, runUsageProducerSweep, startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

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

function successfulRun(args) {
  return args?.[1] === "collect-antigravity" ? antigravityResult() : undefined;
}

// The sweep's default cycle writer touches the real state root, so every test
// that does not assert on cycle evidence injects an in-memory sink.
const noCycleReceipt = async () => null;

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
