import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { TEAM_OPS_BOARD_READ_ONLY_PILOT } from "../core/team-ops-board-read-only-pilot.mjs";
import { createAntigravityQuotaReader } from "./antigravity-quota-adapter.mjs";

test("read-only pilot leaves Antigravity quota UNKNOWN without probing RPC or writing cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-antigravity-pilot-"));
  try {
    let portProbes = 0;
    let rpcCalls = 0;
    let processChecks = 0;
    const cachePath = join(directory, "antigravity_quota.last.json");
    const reader = createAntigravityQuotaReader({
      env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" },
      cachePath,
      listPorts: async () => {
        portProbes += 1;
        return ["12345"];
      },
      fetchImpl: async () => {
        rpcCalls += 1;
        throw new Error("pilot_must_not_call_rpc");
      },
      detectAppRunning: async () => {
        processChecks += 1;
        return true;
      },
      now: () => Date.parse("2026-08-10T12:00:00Z"),
    });

    const first = await reader.readSnapshot();
    assert.equal(first.app_state, "running");
    assert.equal(first.quota_state, "unknown");
    assert.equal(first.reason, "app_running_source_unavailable");
    assert.equal(await reader.readSnapshot(), first);
    assert.equal(portProbes, 0);
    assert.equal(rpcCalls, 0);
    assert.equal(processChecks, 1);
    assert.equal(existsSync(cachePath), false);
    assert.doesNotMatch(JSON.stringify(first), /pid|port|path|token|secret|credential/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("read-only pilot reports app absence without synthesizing numeric quota", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-antigravity-absent-"));
  try {
    const reader = createAntigravityQuotaReader({
      env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" },
      cachePath: join(directory, "missing.json"),
      detectAppRunning: async () => false,
      now: () => Date.parse("2026-08-10T12:00:00Z"),
    });
    const status = await reader.readSnapshot();
    assert.equal(status.app_state, "absent");
    assert.equal(status.reason, "app_absent");
    assert.equal(status.quota_state, "unknown");
    assert.equal("groups" in status, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
