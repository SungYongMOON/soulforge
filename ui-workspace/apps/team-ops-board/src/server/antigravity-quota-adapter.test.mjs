import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { TEAM_OPS_BOARD_READ_ONLY_PILOT } from "../core/team-ops-board-read-only-pilot.mjs";
import {
  TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH,
  createAntigravityQuotaReader,
  parseAntigravityProcessIds,
  readAntigravityQuotaFromCli,
  resolveAntigravityCliPath,
  resolveAntigravityQuotaCachePath,
} from "./antigravity-quota-adapter.mjs";

const CLI_USAGE_OUTPUT = [
  "Gemini Models\tWeekly Limit Remaining\t95%\t2026-08-14T09:05:32Z",
  "Gemini Models\tFive Hour Limit Remaining\t99%\t2026-08-14T07:05:32Z",
  "Claude and GPT models\tWeekly Limit Remaining\t97%\t2026-08-14T09:05:32Z",
  "Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-08-14T07:05:32Z",
].join("\n");

test("official CLI quota fallback uses the exact slash command and a bounded environment", async () => {
  let calls = 0;
  const localAppData = resolve("test-fixtures", "localappdata");
  const expectedCliPath = join(localAppData, "agy", "bin", "agy.exe");
  const groups = await readAntigravityQuotaFromCli({
    env: {
      PATH: "synthetic-safe-path",
      APPDATA: "synthetic-safe-appdata",
      LOCALAPPDATA: localAppData,
      UNRELATED_SECRET: "must-not-forward",
    },
    nowMs: Date.parse("2026-08-14T06:00:00Z"),
    statCli: async (file) => {
      assert.equal(file, expectedCliPath);
      return { isFile: () => true, isSymbolicLink: () => false };
    },
    runCli: async (file, args, options) => {
      calls += 1;
      assert.equal(file, expectedCliPath);
      assert.deepEqual(args, ["--print", "/usage", "--output-format", "text", "--print-timeout", "30s"]);
      assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 40_000);
      assert.equal(options.maxBuffer, 16 * 1024);
      assert.equal(options.env.PATH, "synthetic-safe-path");
      assert.equal(options.env.APPDATA, "synthetic-safe-appdata");
      assert.equal("UNRELATED_SECRET" in options.env, false);
      return { stdout: CLI_USAGE_OUTPUT };
    },
  });
  assert.equal(calls, 1);
  assert.equal(groups[0].buckets[0].remaining_fraction, 0.95);
  assert.equal(resolveAntigravityCliPath({}), null);
  assert.equal(resolveAntigravityCliPath({ LOCALAPPDATA: "relative" }), null);
});

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

test("read-only pilot with the exact local quota gate accepts only sanitized RPC groups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-antigravity-rpc-"));
  try {
    let rpcCalls = 0;
    const reader = createAntigravityQuotaReader({
      env: {
        [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1",
        [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1",
      },
      cachePath: join(directory, "quota.json"),
      listPorts: async () => ["32123"],
      fetchImpl: async (url, options) => {
        rpcCalls += 1;
        assert.equal(url, "http://127.0.0.1:32123/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary");
        assert.equal(options.method, "POST");
        assert.equal(options.body, "{}");
        assert.equal(options.redirect, "error");
        return {
          ok: true,
          async json() {
            return { response: { groups: [{
              displayName: "Gemini Models",
              privateDescription: "must_not_escape",
              buckets: [
                { window: "weekly", remainingFraction: 0.96 },
                { window: "5h", remainingFraction: 1 },
              ],
            }, {
              displayName: "Claude and GPT models",
              buckets: [
                { window: "weekly", remainingFraction: 0.97 },
                { window: "5h", remainingFraction: 1 },
              ],
            }] } };
          },
        };
      },
      now: () => Date.parse("2026-08-10T12:00:00Z"),
    });
    const snapshot = await reader.readSnapshot();
    assert.equal(snapshot.source_kind, "antigravity_sanitized_loopback_receipt");
    assert.equal(snapshot.freshness, "current");
    assert.equal(snapshot.groups[0].buckets[0].remaining_fraction, 0.96);
    assert.equal(rpcCalls, 1);
    assert.doesNotMatch(JSON.stringify(snapshot), /privateDescription|csrf|cookie|credential|token|pid|port|path/iu);
    assert.equal(existsSync(join(directory, "quota.json")), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("quota cache resolves from the stable owner root rather than the active code worktree", () => {
  const ownerRoot = resolve("test-fixtures", "owner-root");
  assert.equal(
    resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: ownerRoot }),
    join(ownerRoot, "guild_hall", "state", "operations", "team_ops_board", "antigravity_quota.last.json"),
  );
  assert.equal(resolveAntigravityQuotaCachePath({}), null);
  assert.equal(resolveAntigravityQuotaCachePath({ SOULFORGE_AI_USAGE_PROJECT_ROOT: "relative-owner" }), null);
});

test("only exact Antigravity executable names can own a quota listener", () => {
  const tasklist = [
    '"Antigravity.exe","100","Console","1","1 K"',
    '"language_server.exe","101","Console","1","1 K"',
    '"agy.exe","102","Console","1","1 K"',
    '"language_server_private.exe","103","Console","1","1 K"',
    '"other_language_server.exe","104","Console","1","1 K"',
  ].join("\n");
  assert.deepEqual([...parseAntigravityProcessIds(tasklist)].sort(), ["100", "101", "102"]);
  assert.deepEqual([...parseAntigravityProcessIds(tasklist, { portOwnersOnly: true })].sort(), ["101", "102"]);
});

test("a Board restart reopens the stable owner-root cache only as stale last-good evidence", async () => {
  const ownerRoot = await mkdtemp(join(tmpdir(), "team-ops-antigravity-owner-root-"));
  try {
    const observedAtMs = Date.parse("2026-08-10T12:00:00Z");
    const environment = {
      SOULFORGE_AI_USAGE_PROJECT_ROOT: ownerRoot,
      [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1",
      [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1",
    };
    const writer = createAntigravityQuotaReader({
      env: environment,
      listPorts: async () => ["32123"],
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { response: { groups: [{
            displayName: "Gemini Models",
            buckets: [{ window: "weekly", remainingFraction: 0.96 }],
          }] } };
        },
      }),
      now: () => observedAtMs,
    });
    assert.equal((await writer.readSnapshot()).freshness, "current");

    let portProbes = 0;
    const restarted = createAntigravityQuotaReader({
      env: { SOULFORGE_AI_USAGE_PROJECT_ROOT: ownerRoot, [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" },
      listPorts: async () => {
        portProbes += 1;
        return [];
      },
      detectAppRunning: async () => false,
      now: () => observedAtMs + 60_000,
    });
    const retained = await restarted.readSnapshot();
    assert.equal(retained.freshness, "stale");
    assert.equal(retained.groups[0].buckets[0].remaining_fraction, 0.96);
    assert.equal(portProbes, 0);
  } finally {
    await rm(ownerRoot, { recursive: true, force: true });
  }
});

test("local quota failure reports source unavailable instead of returning null", async () => {
  const reader = createAntigravityQuotaReader({
    env: {
      [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1",
      [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1",
    },
    cachePath: null,
    listPorts: async () => ["32123"],
    fetchImpl: async () => { throw new Error("synthetic_rpc_failure"); },
    readCliQuota: async () => null,
    detectAppRunning: async () => true,
    now: () => Date.parse("2026-08-10T12:00:00Z"),
  });
  const status = await reader.readSnapshot();
  assert.equal(status.app_state, "running");
  assert.equal(status.quota_state, "unknown");
  assert.equal(status.reason, "app_running_source_unavailable");
});

test("official CLI quota is a sanitized fallback when the local RPC is unavailable", async () => {
  const reader = createAntigravityQuotaReader({
    env: { [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1" },
    cachePath: null,
    listPorts: async () => [],
    detectAppRunning: async () => true,
    readCliQuota: async () => [{
      label: "Gemini Models",
      buckets: [{ window: "weekly", remaining_fraction: 0.95, resets_at: null }],
    }],
    now: () => Date.parse("2026-08-14T07:00:00Z"),
  });
  const snapshot = await reader.readSnapshot();
  assert.equal(snapshot.source_kind, "antigravity_sanitized_cli_usage_receipt");
  assert.equal(snapshot.groups[0].buckets[0].remaining_fraction, 0.95);
});

test("an absent Antigravity app never starts the CLI fallback", async () => {
  let cliCalls = 0;
  const reader = createAntigravityQuotaReader({
    env: { [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1" },
    cachePath: null,
    listPorts: async () => [],
    detectAppRunning: async () => false,
    readCliQuota: async () => {
      cliCalls += 1;
      return [];
    },
    now: () => Date.parse("2026-08-14T07:00:00Z"),
  });
  const status = await reader.readSnapshot();
  assert.equal(cliCalls, 0);
  assert.equal(status.app_state, "absent");
  assert.equal(status.reason, "app_absent");
});

test("a cached local port is never trusted after it leaves the current Antigravity PID set", async () => {
  let nowMs = Date.parse("2026-08-10T12:00:00Z");
  let portLists = 0;
  let rpcCalls = 0;
  const reader = createAntigravityQuotaReader({
    env: { [TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH]: "1" },
    cachePath: null,
    ttlMs: 1_000,
    listPorts: async () => portLists++ === 0 ? ["32123"] : [],
    fetchImpl: async () => {
      rpcCalls += 1;
      return {
        ok: true,
        async json() {
          return { response: { groups: [{
            displayName: "Gemini Models",
            buckets: [{ window: "weekly", remainingFraction: 0.96 }],
          }] } };
        },
      };
    },
    readCliQuota: async () => null,
    detectAppRunning: async () => false,
    now: () => nowMs,
  });
  assert.equal((await reader.readSnapshot()).freshness, "current");
  nowMs += 2_000;
  assert.equal((await reader.readSnapshot()).freshness, "stale");
  assert.equal(rpcCalls, 1);
  assert.equal(portLists, 2);
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
