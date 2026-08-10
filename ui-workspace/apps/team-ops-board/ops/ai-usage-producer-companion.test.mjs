import assert from "node:assert/strict";
import test from "node:test";

import { runUsageProducerSweep, startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

test("producer sweep runs only the two local metadata collectors sequentially", async () => {
  const calls = [];
  const result = await runUsageProducerSweep({
    repoRoot: "C:\\safe\\Soulforge",
    stateRoot: "C:\\safe\\state",
    run: async (file, args) => { calls.push({ file, args }); },
  });
  assert.equal(result.status, "observed");
  assert.deepEqual(calls.map((call) => call.args[1]), ["collect", "collect-claude"]);
  assert.ok(calls.every((call) => call.args.includes("--apply")));
  assert.ok(calls.every((call) => !call.args.some((arg) => /provider|quota|credential/iu.test(arg))));
});

test("companion is single-flight and stops without starting another sweep", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const companion = startUsageProducerCompanion({
    repoRoot: "C:\\safe\\Soulforge",
    stateRoot: "C:\\safe\\state",
    intervalMs: 5,
    sweep: async () => { calls += 1; await pending; },
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  release();
  await companion.stop();
});
