import assert from "node:assert/strict";
import test from "node:test";

import { runUsageProducerSweep, startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

test("producer sweep refreshes lifecycle, usage ledgers, then gated Claude quota", async () => {
  const calls = [];
  const result = await runUsageProducerSweep({
    repoRoot: "C:\\safe\\Soulforge",
    stateRoot: "C:\\safe\\state",
    threadIds: ["thread-a", "thread-b"],
    run: async (file, args) => { calls.push({ file, args }); },
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(calls.slice(0, 3).map((call) => call.args[1]), ["lifecycle-reconcile", "collect", "collect-claude"]);
  assert.match(calls[3].args[0], /claude-oauth-usage-collector\.mjs$/u);
  assert.deepEqual(calls[0].args.filter((arg) => arg === "--thread-id").length, 2);
  assert.ok(calls.slice(0, 3).every((call) => call.args.includes("--apply")));
  assert.ok(calls[3].args.includes("--gate-path"));
});

test("companion is single-flight and stops without starting another sweep", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const companion = startUsageProducerCompanion({
    repoRoot: "C:\\safe\\Soulforge",
    stateRoot: "C:\\safe\\state",
    registryPath: "C:\\safe\\registry.json",
    intervalMs: 5,
    loadThreadIds: async () => ["thread-a"],
    sweep: async () => { calls += 1; await pending; },
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  release();
  await companion.stop();
});
