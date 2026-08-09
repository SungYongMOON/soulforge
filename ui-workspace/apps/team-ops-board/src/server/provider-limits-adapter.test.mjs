import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_OPS_BOARD_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_READ_ONLY_PILOT,
} from "../core/team-ops-board-read-only-pilot.mjs";
import {
  DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS,
  DEFAULT_CLAUDE_LIMITS_REFRESH_MS,
  DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS,
  DEFAULT_PROVIDER_LIMITS_TTL_MS,
  createProviderLimitsReader,
  requestClaudeLimits,
} from "./provider-limits-adapter.mjs";

const START_MS = Date.parse("2026-08-09T00:00:00.000Z");

function claudeValue(utilization = 24) {
  return {
    five_hour: { utilization, resets_at: "2026-08-09T05:00:00.000Z" },
    seven_day: { utilization: utilization / 2, resets_at: "2026-08-16T00:00:00.000Z" },
    model_windows: [],
  };
}

test("read-only pilot leaves Claude provider limits UNKNOWN without credential or OAuth access", async () => {
  let codexReads = 0;
  let claudeReads = 0;
  const reader = createProviderLimitsReader({
    env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1" },
    now: () => START_MS,
    readCodexLimitsImpl: async () => {
      codexReads += 1;
      return {
        primary: { used_percent: 12, window_minutes: 300, resets_at_epoch_s: null },
        secondary: null,
        plan_type: "test",
        observed_at: "2026-08-09T00:00:00.000Z"
      };
    },
    readClaudeLimitsImpl: async () => {
      claudeReads += 1;
      return {
        five_hour: { utilization: 0, resets_at: null },
        seven_day: null,
        model_windows: []
      };
    }
  });

  const snapshot = await reader.readSnapshot();

  assert.equal(codexReads, 1);
  assert.equal(claudeReads, 0);
  assert.equal(snapshot.claude, null);
  assert.deepEqual(snapshot.claude_status, {
    state: "disabled",
    outcome: "disabled",
    attempted_at: null,
    last_success_at: null,
    freshness: "unknown",
  });
  assert.equal(snapshot.codex.primary.used_percent, 12);
});

test("pilot Claude quota read requires exact opt-in while non-pilot behavior stays enabled", async () => {
  for (const value of [undefined, "", "0", "true", " 1", "1 ", 1, true]) {
    let reads = 0;
    const reader = createProviderLimitsReader({
      env: {
        [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1",
        [TEAM_OPS_BOARD_CLAUDE_QUOTA_READ]: value,
      },
      now: () => START_MS,
      readCodexLimitsImpl: async () => null,
      readClaudeLimitsImpl: async () => {
        reads += 1;
        return claudeValue();
      },
    });
    const snapshot = await reader.readSnapshot();
    assert.equal(reads, 0);
    assert.equal(snapshot.claude_status.state, "disabled");
  }

  for (const env of [
    { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1", [TEAM_OPS_BOARD_CLAUDE_QUOTA_READ]: "1" },
    {},
  ]) {
    let reads = 0;
    const reader = createProviderLimitsReader({
      env,
      now: () => START_MS,
      readCodexLimitsImpl: async () => null,
      readClaudeLimitsImpl: async ({ timeoutMs }) => {
        reads += 1;
        assert.equal(timeoutMs, DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS);
        return claudeValue(36);
      },
    });
    const snapshot = await reader.readSnapshot();
    assert.equal(reads, 1);
    assert.equal(snapshot.claude.five_hour.utilization, 36);
    assert.deepEqual(snapshot.claude_status, {
      state: "ready",
      outcome: "success",
      attempted_at: "2026-08-09T00:00:00.000Z",
      last_success_at: "2026-08-09T00:00:00.000Z",
      freshness: "current",
    });
  }
});

test("Claude request classifies only safe outcomes without consuming error bodies", async () => {
  const calls = [];
  const responseFor = (status, body = claudeValue()) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const request = async (response) => requestClaudeLimits({
    accessToken: "synthetic-access-value",
    timeoutMs: DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS,
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, hasSignal: options.signal instanceof AbortSignal });
      if (response instanceof Error) throw response;
      return response;
    },
  });

  assert.deepEqual(await request(responseFor(401)), { outcome: "auth_failed", claude: null });
  assert.deepEqual(await request(responseFor(403)), { outcome: "auth_failed", claude: null });
  assert.deepEqual(await request(responseFor(429)), { outcome: "rate_limited", claude: null });
  assert.deepEqual(await request(responseFor(500)), { outcome: "invalid_response", claude: null });
  assert.deepEqual(await request(responseFor(200, { unexpected: true })), { outcome: "invalid_response", claude: null });
  assert.deepEqual(await request({ ok: true, status: 200, json: async () => { throw new SyntaxError("synthetic"); } }), {
    outcome: "invalid_response",
    claude: null,
  });
  const timeout = new Error("synthetic timeout");
  timeout.name = "TimeoutError";
  assert.deepEqual(await request(timeout), { outcome: "timeout", claude: null });
  const abort = new Error("synthetic abort");
  abort.name = "AbortError";
  assert.deepEqual(await request(abort), { outcome: "timeout", claude: null });
  const success = await request(responseFor(200, claudeValue(48)));
  assert.equal(success.outcome, "success");
  assert.equal(success.claude.five_hour.utilization, 48);
  assert.ok(calls.every((call) => call.url === "https://api.anthropic.com/api/oauth/usage"));
  assert.ok(calls.every((call) => call.method === "GET" && call.hasSignal));
});

test("reader keeps a 60-second cache, a 120-second Claude cadence, and one in-flight refresh", async () => {
  assert.equal(DEFAULT_PROVIDER_LIMITS_TTL_MS, 60_000);
  assert.equal(DEFAULT_CLAUDE_LIMITS_REFRESH_MS, 120_000);
  let nowMs = START_MS;
  let codexReads = 0;
  let claudeReads = 0;
  let releaseFirstCodex;
  const firstCodex = new Promise((resolve) => { releaseFirstCodex = resolve; });
  const reader = createProviderLimitsReader({
    env: {},
    now: () => nowMs,
    readCodexLimitsImpl: async () => {
      codexReads += 1;
      if (codexReads === 1) await firstCodex;
      return null;
    },
    readClaudeLimitsImpl: async () => {
      claudeReads += 1;
      return claudeValue(claudeReads);
    },
  });

  const reads = [reader.readSnapshot(), reader.readSnapshot(), reader.readSnapshot()];
  await Promise.resolve();
  assert.equal(codexReads, 1);
  releaseFirstCodex();
  await Promise.all(reads);
  assert.equal(claudeReads, 1);

  nowMs += DEFAULT_PROVIDER_LIMITS_TTL_MS - 1;
  await reader.readSnapshot();
  assert.equal(codexReads, 1);
  nowMs += 1;
  await reader.readSnapshot();
  assert.equal(codexReads, 2);
  assert.equal(claudeReads, 1);
  nowMs += DEFAULT_PROVIDER_LIMITS_TTL_MS;
  const refreshed = await reader.readSnapshot();
  assert.equal(codexReads, 3);
  assert.equal(claudeReads, 2);
  assert.equal(refreshed.claude.five_hour.utilization, 2);
});

test("failure retains process-memory last-good and freshness crosses its source-owned boundary", async () => {
  assert.equal(DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS, 300_000);
  let nowMs = START_MS;
  const results = [
    { outcome: "success", claude: claudeValue(57) },
    { outcome: "rate_limited", claude: null },
    { outcome: "timeout", claude: null },
  ];
  const reader = createProviderLimitsReader({
    env: {},
    ttlMs: 0,
    now: () => nowMs,
    readCodexLimitsImpl: async () => null,
    readClaudeLimitsImpl: async () => results.shift(),
  });

  const success = await reader.readSnapshot();
  assert.equal(success.claude_status.state, "ready");
  assert.equal(success.claude.five_hour.utilization, 57);

  nowMs += DEFAULT_CLAUDE_LIMITS_REFRESH_MS;
  const failedCurrent = await reader.readSnapshot();
  assert.equal(failedCurrent.claude_status.state, "error");
  assert.equal(failedCurrent.claude_status.outcome, "rate_limited");
  assert.equal(failedCurrent.claude_status.freshness, "current");
  assert.equal(failedCurrent.claude.five_hour.utilization, 57);

  nowMs = START_MS + DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS - 1;
  const justCurrent = await reader.readSnapshot();
  assert.equal(justCurrent.claude_status.freshness, "current");
  nowMs += 1;
  const stale = await reader.readSnapshot();
  assert.equal(stale.claude_status.state, "stale");
  assert.equal(stale.claude_status.outcome, "timeout");
  assert.equal(stale.claude_status.freshness, "stale");
  assert.equal(stale.claude.five_hour.utilization, 57);

  const newReader = createProviderLimitsReader({
    env: {},
    now: () => nowMs,
    readCodexLimitsImpl: async () => null,
    readClaudeLimitsImpl: async () => ({ outcome: "credential_unavailable", claude: null }),
  });
  const noPersistedLastGood = await newReader.readSnapshot();
  assert.equal(noPersistedLastGood.claude, null);
  assert.equal(noPersistedLastGood.claude_status.state, "error");
  assert.equal(noPersistedLastGood.claude_status.outcome, "credential_unavailable");
});

test("public snapshot recursively excludes raw, secret, path, account, body, and authorization fields", async () => {
  const reader = createProviderLimitsReader({
    env: {},
    now: () => START_MS,
    readCodexLimitsImpl: async () => null,
    readClaudeLimitsImpl: async () => ({
      outcome: "success",
      claude: {
        ...claudeValue(22),
        raw: "synthetic-sensitive-marker",
        secret: "synthetic-sensitive-marker",
        account: "synthetic-sensitive-marker",
        error_body: "synthetic-sensitive-marker",
      },
    }),
  });
  const snapshot = await reader.readSnapshot();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object" || value === null) return;
    for (const [key, nested] of Object.entries(value)) {
      assert.doesNotMatch(key, /token|secret|path|raw|account|body|authorization/iu);
      visit(nested);
    }
  };
  visit(snapshot);
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-sensitive-marker/u);
});
