// host-stats-adapter.test.mjs — 샘플러의 TTL 억제(실패 지속 중 포함)와
// 멈춘 statfs에 대한 마감시한 회귀를 고정한다.

import assert from "node:assert/strict";
import test from "node:test";

import { createHostStatsSampler } from "./host-stats-adapter.mjs";

function incrementingCpus() {
  let counter = 0;
  return () => {
    counter += 50;
    return [{ times: { user: counter, nice: 0, sys: 0, idle: 1_000 + counter, irq: 0 } }];
  };
}

test("TTL suppresses re-sampling even while sampling persistently fails", async () => {
  let clock = 0;
  let cpuCalls = 0;
  const sampler = createHostStatsSampler({
    cpus: () => {
      cpuCalls += 1;
      return [];
    },
    totalmem: () => 100,
    freemem: () => 50,
    uptime: () => 10,
    statfs: null,
    cpuSampleDelayMs: 0,
    sampleTtlMs: 5_000,
    sampleTimeoutMs: 500,
    now: () => clock,
  });

  assert.equal(await sampler.readSnapshot(), null);
  const callsAfterFirstAttempt = cpuCalls;
  assert.ok(callsAfterFirstAttempt > 0);

  clock += 100;
  assert.equal(await sampler.readSnapshot(), null);
  assert.equal(cpuCalls, callsAfterFirstAttempt);

  clock += 5_000;
  await sampler.readSnapshot();
  assert.ok(cpuCalls > callsAfterFirstAttempt);
});

test("hanging statfs hits the sample deadline, serves null, and recovers after TTL", async () => {
  let clock = 0;
  let hang = true;
  let statfsCalls = 0;
  const sampler = createHostStatsSampler({
    cpus: incrementingCpus(),
    totalmem: () => 1_000,
    freemem: () => 400,
    uptime: () => 77,
    statfs: () => {
      statfsCalls += 1;
      return hang ? new Promise(() => {}) : Promise.resolve({ bsize: 1, blocks: 100, bavail: 40 });
    },
    diskRoots: [`${String.fromCharCode(67)}:/`],
    cpuSampleDelayMs: 0,
    sampleTtlMs: 5_000,
    sampleTimeoutMs: 40,
    now: () => clock,
  });

  assert.equal(await sampler.readSnapshot(), null);
  assert.equal(statfsCalls, 1);

  clock += 100;
  assert.equal(await sampler.readSnapshot(), null);
  assert.equal(statfsCalls, 1);

  hang = false;
  clock += 5_000;
  const snapshot = await sampler.readSnapshot();
  assert.ok(snapshot !== null);
  assert.equal(snapshot.disks.length, 1);
  assert.equal(snapshot.disks[0].drive, "C:");
});
