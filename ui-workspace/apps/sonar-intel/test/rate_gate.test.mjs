import assert from "node:assert/strict";
import test from "node:test";

import { createRateGate } from "../src/rate_gate.mjs";

// A fake clock + sleep so this test asserts the *logic* (>=3s floor, one at a
// time) without ever actually waiting 3 seconds in the test run.
function fakeClock(startAt = 0) {
  let current = startAt;
  const sleepCalls = [];
  return {
    now: () => current,
    sleep: (ms) => {
      sleepCalls.push(ms);
      current += ms;
      return Promise.resolve();
    },
    advance: (ms) => {
      current += ms;
    },
    sleepCalls,
  };
}

test("first scheduled task runs without waiting", async () => {
  const clock = fakeClock();
  const gate = createRateGate({ minIntervalMs: 3000, now: clock.now, sleep: clock.sleep });
  const order = [];
  await gate.schedule(() => order.push("a"));
  assert.deepEqual(order, ["a"]);
  assert.deepEqual(clock.sleepCalls, []);
});

test("second task waits out the remaining gap to reach the minimum interval", async () => {
  const clock = fakeClock();
  const gate = createRateGate({ minIntervalMs: 3000, now: clock.now, sleep: clock.sleep });

  await gate.schedule(() => "first");
  clock.advance(1000); // only 1s of the required 3s has elapsed
  await gate.schedule(() => "second");

  assert.deepEqual(clock.sleepCalls, [2000], "should sleep exactly the remaining 2000ms");
});

test("no wait once enough real time has already elapsed", async () => {
  const clock = fakeClock();
  const gate = createRateGate({ minIntervalMs: 3000, now: clock.now, sleep: clock.sleep });

  await gate.schedule(() => "first");
  clock.advance(5000); // more than the 3s floor has passed
  await gate.schedule(() => "second");

  assert.deepEqual(clock.sleepCalls, []);
});

test("tasks run strictly one at a time, in schedule order, even if started concurrently", async () => {
  const clock = fakeClock();
  const gate = createRateGate({ minIntervalMs: 3000, now: clock.now, sleep: clock.sleep });
  const started = [];
  const finished = [];

  function makeTask(label) {
    return async () => {
      started.push(label);
      // Simulate async work; if the gate allowed overlap, "b" would start
      // before "a" finishes.
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished.push(label);
    };
  }

  const pA = gate.schedule(makeTask("a"));
  const pB = gate.schedule(makeTask("b"));
  const pC = gate.schedule(makeTask("c"));
  await Promise.all([pA, pB, pC]);

  assert.deepEqual(started, ["a", "b", "c"]);
  assert.deepEqual(finished, ["a", "b", "c"]);
});

test("a rejected task does not break the chain for the next scheduled task", async () => {
  const clock = fakeClock();
  const gate = createRateGate({ minIntervalMs: 0, now: clock.now, sleep: clock.sleep });

  await assert.rejects(() => gate.schedule(() => {
    throw new Error("boom");
  }));

  const result = await gate.schedule(() => "still works");
  assert.equal(result, "still works");
});

test("rejects a negative minIntervalMs", () => {
  assert.throws(() => createRateGate({ minIntervalMs: -1 }));
});
