import test from "node:test";
import assert from "node:assert/strict";

import {
  HOST_STATS_SCHEMA_VERSION,
  buildHostStatsViewModel,
  cpuPercentFromSamples,
  formatGb,
  formatUptime,
} from "./host-stats.mjs";

const GIB = 1024 ** 3;

function coreSample(user, sys, idle, { nice = 0, irq = 0 } = {}) {
  return { times: { user, nice, sys, idle, irq } };
}

function sampleSnapshot() {
  return {
    schema_version: HOST_STATS_SCHEMA_VERSION,
    observed_at: "2026-08-08T01:00:00.000Z",
    cpu: { percent: 36.2, cores: 8, history: [10, 20, 36.2] },
    memory: {
      total_bytes: 16 * GIB,
      used_bytes: Math.round(9.2 * GIB),
      percent: 57.5,
      history: [50, 57.5],
    },
    disks: [
      { drive: "C:", total_bytes: 460 * GIB, used_bytes: 219 * GIB, percent: 47.6 },
      { drive: "D:", total_bytes: 931 * GIB, used_bytes: Math.round(1.5 * GIB), percent: 0.2 },
    ],
    uptime_seconds: 14 * 86_400 + 7 * 3_600 + 30 * 60,
  };
}

test("cpuPercentFromSamples aggregates busy delta over total delta", () => {
  const prev = [coreSample(100, 50, 850)];
  const next = [coreSample(190, 80, 1230)];
  // total delta 500, idle delta 380, busy delta 120 → 24%
  assert.equal(cpuPercentFromSamples(prev, next), 24);

  const prevMulti = [coreSample(100, 0, 900), coreSample(200, 100, 700)];
  const nextMulti = [coreSample(200, 0, 1000), coreSample(250, 150, 800)];
  // core deltas: busy 100 + idle 100, busy 100 + idle 100 → aggregate 200/400 → 50%
  assert.equal(cpuPercentFromSamples(prevMulti, nextMulti), 50);

  // rounds to 1 decimal: busy 1 / total 3 → 33.333… → 33.3
  assert.equal(cpuPercentFromSamples([coreSample(0, 0, 0)], [coreSample(1, 0, 2)]), 33.3);
});

test("cpuPercentFromSamples clamps and fails closed on invalid deltas", () => {
  const base = [coreSample(100, 0, 100)];
  assert.equal(cpuPercentFromSamples(base, base), null, "zero total delta");
  assert.equal(cpuPercentFromSamples([coreSample(200, 0, 200)], base), null, "negative total delta");
  assert.equal(cpuPercentFromSamples(null, base), null);
  assert.equal(cpuPercentFromSamples([], base), null);
  assert.equal(cpuPercentFromSamples([{}], base), null);
  assert.equal(cpuPercentFromSamples([coreSample(Number.NaN, 0, 100)], base), null);
  assert.equal(cpuPercentFromSamples([coreSample(-1, 0, 100)], base), null);
  // idle shrank → busy delta exceeds total delta → clamp to 100
  assert.equal(cpuPercentFromSamples([coreSample(100, 0, 100)], [coreSample(250, 0, 50)]), 100);
});

test("formatGb keeps one decimal under 100 and integers above", () => {
  assert.equal(formatGb(Math.round(9.2 * GIB)), "9.2");
  assert.equal(formatGb(16 * GIB), "16");
  assert.equal(formatGb(219 * GIB), "219");
  assert.equal(formatGb(Math.round(219.6 * GIB)), "220");
  assert.equal(formatGb(0), "0");
  assert.equal(formatGb(-1), null);
  assert.equal(formatGb(Number.POSITIVE_INFINITY), null);
  assert.equal(formatGb("16"), null);
});

test("formatUptime omits leading zero units and floors minutes", () => {
  assert.equal(formatUptime(14 * 86_400 + 7 * 3_600 + 30 * 60), "14d 7h 30m");
  assert.equal(formatUptime(86_400 + 120), "1d 0h 2m");
  assert.equal(formatUptime(3_600), "1h 0m");
  assert.equal(formatUptime(119), "1m");
  assert.equal(formatUptime(59), "0m");
  assert.equal(formatUptime(0), "0m");
  assert.equal(formatUptime(-5), null);
  assert.equal(formatUptime(null), null);
});

test("view model maps a valid snapshot into strip cells", () => {
  const model = buildHostStatsViewModel(sampleSnapshot());
  assert.equal(model.available, true);
  assert.equal(model.observedAt, "2026-08-08T01:00:00.000Z");
  assert.deepEqual(model.cells.map((cell) => cell.key), ["cpu", "mem", "disk_c", "disk_d", "up"]);

  const [cpu, mem, diskC, diskD, up] = model.cells;
  assert.equal(cpu.label, "CPU");
  assert.equal(cpu.value, "36%");
  assert.deepEqual(cpu.history, [10, 20, 36.2]);
  assert.equal(mem.label, "MEM");
  assert.equal(mem.value, "9.2/16GB");
  assert.deepEqual(mem.history, [50, 57.5]);
  assert.equal(diskC.label, "DISK C:");
  assert.equal(diskC.value, "219/460GB");
  assert.equal(diskD.value, "1.5/931GB");
  assert.equal(up.label, "UP");
  assert.equal(up.value, "14d 7h 30m");
});

test("view model fails closed on malformed snapshots", () => {
  const failClosed = (snapshot, reason) => {
    const model = buildHostStatsViewModel(snapshot);
    assert.equal(model.available, false, reason);
    assert.deepEqual(model.cells, [], reason);
    assert.equal(model.observedAt, null, reason);
  };

  failClosed(null, "null snapshot");
  failClosed([], "array snapshot");
  failClosed({ ...sampleSnapshot(), schema_version: "soulforge.other.v1" }, "wrong schema");
  failClosed({ ...sampleSnapshot(), extra_field: 1 }, "unknown top-level key");
  failClosed({ ...sampleSnapshot(), observed_at: "not-a-date" }, "bad observed_at");

  const badCpuPercent = sampleSnapshot();
  badCpuPercent.cpu.percent = 150;
  failClosed(badCpuPercent, "cpu percent out of range");

  const badCpuKey = sampleSnapshot();
  badCpuKey.cpu.vendor = "acme";
  failClosed(badCpuKey, "unknown cpu key");

  const badHistory = sampleSnapshot();
  badHistory.memory.history = "not-an-array";
  failClosed(badHistory, "non-array history");

  const oversizedHistory = sampleSnapshot();
  oversizedHistory.cpu.history = Array.from({ length: 65 }, () => 1);
  failClosed(oversizedHistory, "history over 64 entries");

  const badHistoryEntry = sampleSnapshot();
  badHistoryEntry.cpu.history = [10, "20"];
  failClosed(badHistoryEntry, "non-numeric history entry");

  const badDrive = sampleSnapshot();
  badDrive.disks[0].drive = `${String.fromCharCode(67)}:\\`;
  failClosed(badDrive, "drive letter format");

  const badDiskKey = sampleSnapshot();
  badDiskKey.disks[0].mount = "/c";
  failClosed(badDiskKey, "unknown disk key");

  const badUptime = sampleSnapshot();
  badUptime.uptime_seconds = -1;
  failClosed(badUptime, "negative uptime");
});
