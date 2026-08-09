import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AI_USAGE_READ_ONLY_QUERY_KEY,
  AI_USAGE_SNAPSHOT_PATH,
  createAiUsageAdapter,
  createAiUsageAdapterPlugin,
  readExactScopedUsageProjection
} from "./ai-usage-adapter.mjs";
import {
  createEmptyThreadEnrollmentRegistry,
  registerExistingThread,
  writeThreadEnrollmentRegistryAtomic
} from "../core/live-thread-enrollment.mjs";
import { createBoardUsageHistorySnapshot } from "../../../../../guild_hall/ai_usage_meter/board_history_snapshot.mjs";

const AT = "2026-08-04T01:00:00.000Z";
const ENV = { TEAM_OPS_BOARD_AUTO_USAGE_REFRESH: "true" };

function readOnlyFixture(events = []) {
  return {
    schema_version: "soulforge.ai_usage_board_read_only_projection.v1",
    read_only: 1,
    snapshot: createBoardUsageHistorySnapshot(events, {
      generatedAt: AT,
      referenceAt: AT,
      topN: 1
    })
  };
}

function claudeLedgerEvent() {
  return {
    event_id: "claude-ledger-event",
    thread_id: "claude-ledger-thread",
    project_id: "project-a",
    work_id: "work-a",
    team_id: "team-a",
    parent_thread_id: null,
    actor: { role: "executor" },
    model: { id: "gpt-not-provider-evidence", reasoning_effort: "high" },
    usage: { total_tokens: 50 },
    credits: { total: null },
    time: { started_at: "2026-08-04T00:59:00.000Z" },
    source: { kind: "claude_session_jsonl", source_ref: "must-not-project" },
    rate_limit_snapshot: null
  };
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

test("read-only usage projection validates only the exact enrolled scope", async () => {
  const calls = [];
  const expected = readOnlyFixture([claudeLedgerEvent()]);
  const projection = await readExactScopedUsageProjection({
    stateRoot: "safe-meter-state",
    threadIds: ["thread-two", "thread-one"],
    now: () => Date.parse(AT),
    claudeFreshnessThresholdSeconds: 60,
    loadProjection: async (stateRoot, options) => {
      calls.push({ stateRoot, options });
      return expected;
    }
  });
  assert.deepEqual(projection, expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.generatedAt, AT);
  assert.equal(calls[0].options.referenceAt, AT);
  assert.equal(calls[0].options.claudeFreshnessThresholdSeconds, 60);
  assert.deepEqual(calls[0].options.threadIds, ["thread-one", "thread-two"]);
  assert.deepEqual(projection.snapshot.provider_rows, [
    { provider: "claude", turns: 1, total_tokens: 50, latest_usage_at: "2026-08-04T00:59:00.000Z" }
  ]);
  assert.equal(projection.snapshot.claude_collection.state, "unknown");

  const source = readFileSync(new URL("./ai-usage-adapter.mjs", import.meta.url), "utf8");
  assert.equal(/node:child_process|\bspawn\b|--apply|collect-/u.test(source), false);
  assert.equal(/fetch\(/u.test(source), false);
});

test("usage adapter rereads the existing read-only projection and fails closed on an invalid result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-usage-adapter-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-two", "thread-one"]);
    const calls = [];
    const adapter = createAiUsageAdapter({
      registryPath,
      usageMeterStateRoot: join(directory, "meter-state"),
      env: ENV,
      now: () => Date.parse(AT),
      claudeFreshnessThresholdSeconds: 60,
      readUsageProjection: async (options) => {
        calls.push(options);
        return readOnlyFixture();
      }
    });

    const first = await adapter.readProjection();
    const reread = await adapter.readProjection();
    assert.equal(first.read_only, 1);
    assert.equal(reread.read_only, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].threadIds, ["thread-one", "thread-two"]);
    assert.equal(calls[0].claudeFreshnessThresholdSeconds, 60);

    const failed = createAiUsageAdapter({
      registryPath,
      usageMeterStateRoot: join(directory, "meter-state"),
      env: ENV,
      readUsageProjection: async () => ({ read_only: 0 })
    });
    assert.deepEqual(await failed.readProjection(), {
      schema_version: "soulforge.team_ops_board_ai_usage_projection.v1",
      refresh_state: "hold",
      snapshot: null
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("usage adapter fails closed when exact enrollment is unavailable", async () => {
  const adapter = createAiUsageAdapter({
    registryPath: join(tmpdir(), "RAW_USAGE_MISSING_REGISTRY.json"),
    env: ENV,
    readUsageProjection: async () => {
      throw new Error("must_not_run");
    }
  });
  const projection = await adapter.readProjection();
  assert.deepEqual(projection, {
    schema_version: "soulforge.team_ops_board_ai_usage_projection.v1",
    refresh_state: "hold",
    snapshot: null
  });
  assert.equal(JSON.stringify(projection).includes("RAW_USAGE"), false);
});

test("usage loopback plugin accepts only the local read_only path and returns a redacted envelope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "team-ops-usage-plugin-"));
  try {
    const registryPath = join(directory, "visibility.json");
    await writeRegistry(registryPath, ["thread-one"]);
    let middleware;
    const plugin = createAiUsageAdapterPlugin({
      registryPath,
      env: ENV,
      readUsageProjection: async () => readOnlyFixture()
    });
    plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });

    const request = {
      method: "GET",
      url: `${AI_USAGE_SNAPSHOT_PATH}?${AI_USAGE_READ_ONLY_QUERY_KEY}=1&refresh=1`,
      socket: { remoteAddress: "127.0.0.1" }
    };
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
    assert.equal(JSON.parse(result.body).read_only, 1);

    const missingReadOnly = await new Promise((resolve) => {
      const response = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode); } };
      middleware({ ...request, url: AI_USAGE_SNAPSHOT_PATH }, response, () => resolve(0));
    });
    assert.equal(missingReadOnly, 400);

    const notAllowed = await new Promise((resolve) => {
      const response = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode); } };
      middleware({ ...request, method: "POST" }, response, () => resolve(0));
    });
    assert.equal(notAllowed, 405);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
