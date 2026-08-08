import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  AI_USAGE_SNAPSHOT_PATH,
  createAiUsageAdapter,
  createAiUsageAdapterPlugin,
  outputPath,
  refreshExactScopedUsage
} from "./ai-usage-adapter.mjs";
import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import { createBoardUsageHistorySnapshot } from "../../../../../guild_hall/ai_usage_meter/board_history_snapshot.mjs";

const AT = "2026-08-04T01:00:00.000Z";
const ENV = { TEAM_OPS_BOARD_AUTO_USAGE_REFRESH: "true" };

function historyFixture() {
  return createBoardUsageHistorySnapshot([], {
    generatedAt: AT,
    referenceAt: AT,
    topN: 1
  });
}

function registration(threadId) {
  return {
    threadId,
    organizationGroupId: "org-system",
    routeId: null,
    workId: null,
    threadKind: "task",
    displayLabel: "Board TASK",
    relationship: "primary",
    lifecycle: "current"
  };
}

async function writeRegistry(path, ids) {
  let registry = createEmptyThreadEnrollmentRegistry({ now: AT });
  for (const id of ids) {
    registry = registerExistingThread(registry, registration(id), { now: AT, env: ENV }).registry;
  }
  await writeThreadEnrollmentRegistryAtomic(path, registry, { env: ENV });
}

function threadIdsFromArgs(args) {
  return args.flatMap((value, index) => value === "--thread-id" ? [args[index + 1]] : []);
}

test("usage refresh runs the Meter pipeline sequentially with only the exact enrolled ID scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-usage-pipeline-"));
  try {
    const stateRoot = join(directory, "meter-state");
    const sessionsRoot = join(directory, "codex-sessions");
    const commands = [];
    const expected = historyFixture();
    const snapshot = await refreshExactScopedUsage({
      stateRoot,
      sessionsRoot,
      threadIds: ["thread-two", "thread-one"],
      runCommand: async ({ args }) => {
        commands.push(args);
        if (args[0] === "board-history-snapshot") {
          const target = outputPath(args);
          assert.ok(target);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, `${JSON.stringify(expected)}\n`, "utf8");
        }
      }
    });

    assert.deepEqual(commands.map((args) => args[0]), [
      "collect",
      "collect-claude",
      "collect-antigravity",
      "lifecycle-reconcile",
      "board-snapshot",
      "board-history-snapshot"
    ]);
    for (const args of commands) {
      // 로컬 소유 공급자 수집(claude·antigravity)은 exact 스레드 스코프를 받지 않는다.
      if (args[0] === "collect-claude" || args[0] === "collect-antigravity") {
        assert.equal(args.includes("--thread-id"), false);
        continue;
      }
      assert.deepEqual(threadIdsFromArgs(args), ["thread-one", "thread-two"]);
      assert.equal(args.includes("--thread-id"), true);
    }
    assert.equal(commands[3].includes("--max-sessions"), true);
    for (const command of ["board-snapshot", "board-history-snapshot"]) {
      const args = commands.find((entry) => entry[0] === command);
      const providers = args.flatMap((value, index) => (value === "--include-provider" ? [args[index + 1]] : []));
      assert.deepEqual(providers, ["claude_session_jsonl", "antigravity_conversation_db"]);
    }
    assert.deepEqual(snapshot, expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("usage adapter keeps a validated last-good snapshot during a debounced single-flight refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-usage-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-two", "thread-one"]);
    const expected = historyFixture();
    const calls = [];
    let nowMs = Date.parse(AT);
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const adapter = createAiUsageAdapter({
      registryPath,
      usageMeterStateRoot: join(directory, "meter-state"),
      usageSessionsRoot: join(directory, "sessions"),
      env: ENV,
      now: () => nowMs,
      limits: { debounceMs: 15_000, initialTimeoutMs: 200, commandTimeoutMs: 200 },
      refreshUsage: async ({ threadIds }) => {
        calls.push(threadIds);
        return calls.length === 1 ? expected : pending;
      }
    });

    const initial = await adapter.readProjection();
    assert.equal(initial.refresh_state, "ready");
    assert.deepEqual(initial.snapshot, expected);
    assert.deepEqual(calls, [["thread-one", "thread-two"]]);

    nowMs += 15_001;
    const refreshing = await adapter.readProjection({ force: true });
    const overlapping = await adapter.readProjection();
    assert.equal(refreshing.refresh_state, "refreshing");
    assert.equal(overlapping.refresh_state, "refreshing");
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1], ["thread-one", "thread-two"]);

    release(expected);
    await new Promise((resolve) => setImmediate(resolve));
    const ready = await adapter.readProjection();
    assert.equal(ready.refresh_state, "ready");
    assert.deepEqual(ready.snapshot, expected);
    assert.equal(JSON.stringify(ready).includes("RAW_"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("usage adapter fails closed when exact enrollment is unavailable", async () => {
  const adapter = createAiUsageAdapter({
    registryPath: join(tmpdir(), "RAW_USAGE_MISSING_REGISTRY.json"),
    env: ENV,
    refreshUsage: async () => {
      throw new Error("must_not_run");
    }
  });
  const projection = await adapter.readProjection({ force: true });
  assert.deepEqual(projection, {
    schema_version: "soulforge.team_ops_board_ai_usage_projection.v1",
    refresh_state: "hold",
    snapshot: null
  });
  assert.equal(JSON.stringify(projection).includes("RAW_USAGE"), false);
});

test("usage loopback plugin returns the redacted envelope and rejects non-GET requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-usage-plugin-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-one"]);
    let middleware;
    const plugin = createAiUsageAdapterPlugin({
      registryPath,
      env: ENV,
      refreshUsage: async () => historyFixture()
    });
    plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });

    const request = { method: "GET", url: `${AI_USAGE_SNAPSHOT_PATH}?refresh=1`, socket: { remoteAddress: "127.0.0.1" } };
    const result = await new Promise((resolve) => {
      const response = {
        statusCode: 0,
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        end(body = "") { resolve({ statusCode: this.statusCode, headers: this.headers, body }); }
      };
      middleware(request, response, () => resolve({ next: true }));
    });
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(JSON.parse(result.body).refresh_state, "ready");

    const notAllowed = await new Promise((resolve) => {
      const response = {
        statusCode: 0,
        setHeader() {},
        end() { resolve(this.statusCode); }
      };
      middleware({ ...request, method: "POST" }, response, () => resolve(0));
    });
    assert.equal(notAllowed, 405);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
