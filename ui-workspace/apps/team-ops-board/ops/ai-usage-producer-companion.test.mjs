import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ACTIVE_CODEX_SESSION_MAX_AGE_MS, activeCodexSessionIds, loadActiveCodexSessionFiles, persistProducerHeartbeat, runClaudeQuotaSweep, runUsageProducerSweep, startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

const REPO_ROOT = path.resolve("test-fixtures", "repo");
const STATE_ROOT = path.resolve("test-fixtures", "state");
const PROJECT_ROOT = path.resolve("test-fixtures", "owner-root");
const WATCHTOWER_POINTER = path.resolve("test-fixtures", "watchtower", "binding.pointer.json");
const REGISTRY_PATH = path.resolve("test-fixtures", "registry.json");
const ACTIVE_FILES = [
  path.resolve("test-fixtures", "active-a.jsonl"),
  path.resolve("test-fixtures", "active-b.jsonl"),
];

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
    repoRoot: REPO_ROOT,
    projectRoot: PROJECT_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    threadIds: ["thread-a", "thread-b"],
    loadActiveFiles: async () => ACTIVE_FILES,
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", events_digest: "same" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (file, args) => { calls.push({ file, args }); },
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(calls.slice(0, 3).map((call) => call.args[1]), ["lifecycle-reconcile", "collect", "collect-claude"]);
  assert.deepEqual(calls[0].args.filter((arg) => arg === "--thread-id").length, 2);
  assert.ok(calls.slice(0, 3).every((call) => call.args.includes("--apply")));
  assert.equal(calls[1].args[calls[1].args.indexOf("--project-root") + 1], PROJECT_ROOT);
  assert.equal(calls.length, 6);
  assert.match(calls[3].args[0], /guild_hall[\\/]watchtower[\\/]cli\.mjs$/u);
  assert.deepEqual(calls[3].args.slice(1), ["probe", "--pointer", WATCHTOWER_POINTER, "--json"]);
  assert.equal(calls[3].args.includes("--no-write"), false);
  assert.ok(calls.slice(4).every((call) => call.args.includes("--include-active")));
  assert.ok(calls.slice(4).every((call) => call.args[call.args.indexOf("--project-root") + 1] === PROJECT_ROOT));
  assert.deepEqual(calls.slice(4).map((call) => call.args[call.args.indexOf("--session-file") + 1]), [
    ...ACTIVE_FILES,
  ]);
  assert.deepEqual(heartbeats.map(({ lane, succeeded }) => [lane, succeeded]), [["codex", true], ["claude", true], ["meter", true], ["store_usage_ledger", true]]);
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
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT,
    loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => {
      if (args[1] === "collect-claude") throw Object.assign(new Error("claude unavailable"), { code: "collector_unavailable" });
    },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "claude").succeeded, false);
  assert.equal(heartbeats.find(({ lane }) => lane === "meter").succeeded, true);
  assert.equal(heartbeats.find(({ lane }) => lane === "store_usage_ledger").succeeded, true);
});

test("ledger validation receipt remains independent when the Meter receipt channel fails", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", event_count: 12 }),
    persistHeartbeat: async (value) => {
      if (value.lane === "meter") throw new Error("meter receipt unavailable");
      heartbeats.push(value);
    },
    run: async () => {},
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "store_usage_ledger").succeeded, true);
});

test("collector child exit is preserved as a fixed sanitized error code", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z", events_digest: "same" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => { if (args[1] === "collect") throw Object.assign(new Error("redacted"), { code: 1 }); },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "codex").errorCode, "collector_exit_1");
});

test("sanitized Meter CLI error code is retained without stderr detail", async () => {
  const heartbeats = [];
  await runUsageProducerSweep({
    repoRoot: REPO_ROOT, stateRoot: STATE_ROOT, loadActiveFiles: async () => [],
    loadSnapshot: async () => ({ schema_version: "soulforge.ai_usage_meter_snapshot.v1", generated_at: "2026-08-11T00:00:00.000Z" }),
    persistHeartbeat: async (value) => { heartbeats.push(value); },
    run: async (_file, args) => {
      if (args[1] === "collect") throw Object.assign(new Error("redacted"), { code: 1, stderr: JSON.stringify({ error: "ledger_lock_held", error_digest: "not-retained" }) });
    },
  });
  assert.equal(heartbeats.find(({ lane }) => lane === "codex").errorCode, "ledger_lock_held");
  assert.equal(JSON.stringify(heartbeats).includes("error_digest"), false);
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
