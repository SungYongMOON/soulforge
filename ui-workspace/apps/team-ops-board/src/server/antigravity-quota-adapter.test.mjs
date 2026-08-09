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
      }
    });

    assert.equal(await reader.readSnapshot(), null);
    assert.equal(portProbes, 0);
    assert.equal(rpcCalls, 0);
    assert.equal(existsSync(cachePath), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
