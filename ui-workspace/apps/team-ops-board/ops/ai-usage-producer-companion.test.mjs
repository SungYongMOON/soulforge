import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { ACTIVE_CODEX_SESSION_MAX_AGE_MS, activeCodexSessionIds, runUsageProducerSweep, startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

const REPO_ROOT = path.resolve("test-fixtures", "repo");
const STATE_ROOT = path.resolve("test-fixtures", "state");
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

test("producer sweep refreshes lifecycle, usage ledgers, then gated Claude quota", async () => {
  const calls = [];
  const result = await runUsageProducerSweep({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    threadIds: ["thread-a", "thread-b"],
    loadActiveFiles: async () => ACTIVE_FILES,
    run: async (file, args) => { calls.push({ file, args }); },
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(calls.slice(0, 3).map((call) => call.args[1]), ["lifecycle-reconcile", "collect", "collect-claude"]);
  assert.match(calls[3].args[0], /claude-oauth-usage-collector\.mjs$/u);
  assert.deepEqual(calls[0].args.filter((arg) => arg === "--thread-id").length, 2);
  assert.ok(calls.slice(0, 3).every((call) => call.args.includes("--apply")));
  assert.equal(calls.length, 7);
  assert.match(calls[4].args[0], /guild_hall[\\/]watchtower[\\/]cli\.mjs$/u);
  assert.deepEqual(calls[4].args.slice(1), ["probe", "--pointer", WATCHTOWER_POINTER, "--json"]);
  assert.equal(calls[4].args.includes("--no-write"), false);
  assert.ok(calls.slice(5).every((call) => call.args.includes("--include-active")));
  assert.deepEqual(calls.slice(5).map((call) => call.args[call.args.indexOf("--session-file") + 1]), [
    ...ACTIVE_FILES,
  ]);
  assert.ok(calls[3].args.includes("--gate-path"));
});

test("companion is single-flight and stops without starting another sweep", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const companion = startUsageProducerCompanion({
    repoRoot: REPO_ROOT,
    stateRoot: STATE_ROOT,
    registryPath: REGISTRY_PATH,
    watchtowerPointerPath: WATCHTOWER_POINTER,
    intervalMs: 5,
    loadThreadIds: async () => ["thread-a"],
    sweep: async (options) => {
      assert.equal(options.watchtowerPointerPath, WATCHTOWER_POINTER);
      calls += 1;
      await pending;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  release();
  await companion.stop();
});
