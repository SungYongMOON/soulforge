import assert from "node:assert/strict";
import test from "node:test";

import {
  TEAM_OPS_BOARD_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_READ_ONLY_PILOT,
} from "../core/team-ops-board-read-only-pilot.mjs";
import {
  DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS,
  DEFAULT_CLAUDE_FAILURE_COOLDOWN_MS,
  DEFAULT_CLAUDE_LIMITS_REFRESH_MS,
  DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS,
  DEFAULT_PROVIDER_LIMITS_TTL_MS,
  MAX_CLAUDE_FAILURE_COOLDOWN_MS,
  createProviderLimitsReader,
  normalizeOrcaClaudeUsage,
  readClaudeLimitsFromOrca,
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

test("Orca Claude runtime snapshot whitelists exact quota values and strips account fields", async () => {
  const updatedAt = START_MS + 1_000;
  const rawClaude = {
    provider: "claude", status: "ok", updatedAt, error: null,
    session: { usedPercent: 2, windowMinutes: 300, resetsAt: START_MS + 3_600_000, resetDescription: "ignored" },
    weekly: { usedPercent: 51, windowMinutes: 10_080, resetsAt: START_MS + 604_800_000, resetDescription: null },
    fableWeekly: { usedPercent: 87, windowMinutes: 10_080, resetsAt: START_MS + 604_800_000 },
    usageMetadata: { accountEmail: "must-not-retain" },
    account: "must-not-retain",
  };
  assert.deepEqual(normalizeOrcaClaudeUsage(rawClaude), {
    five_hour: { utilization: 2, resets_at: "2026-08-09T01:00:00.000Z" },
    seven_day: { utilization: 51, resets_at: "2026-08-16T00:00:00.000Z" },
    model_windows: [{ key: "fable_weekly", label: "Fable", utilization: 87, resets_at: "2026-08-16T00:00:00.000Z" }],
    observed_at: "2026-08-09T00:00:01.000Z",
    source: "orca_runtime_snapshot",
  });
  assert.equal(normalizeOrcaClaudeUsage({ ...rawClaude, session: { ...rawClaude.session, usedPercent: 101 } }), null);
  assert.equal(normalizeOrcaClaudeUsage({ ...rawClaude, session: { ...rawClaude.session, windowMinutes: 301 } }), null);
  assert.equal(normalizeOrcaClaudeUsage({ ...rawClaude, session: { ...rawClaude.session, resetsAt: Number.MAX_VALUE } }), null);
});

test("Orca reader uses exact argv and fails closed on malformed, timeout, and nonzero results", async () => {
  const calls = [];
  const valid = JSON.stringify({
    id: "safe-id", ok: true, _meta: { runtimeId: "runtime" },
    result: { claude: [{ secret: "ignored" }], codex: [], rateLimits: { claude: {
      provider: "claude", status: "ok", updatedAt: START_MS,
      session: { usedPercent: 2, windowMinutes: 300, resetsAt: null },
      weekly: { usedPercent: 51, windowMinutes: 10_080, resetsAt: null },
      fableWeekly: { usedPercent: 87, windowMinutes: 10_080, resetsAt: null },
    } } },
  });
  const success = await readClaudeLimitsFromOrca({ execFileImpl: async (...args) => {
    calls.push(args);
    return { stdout: valid, stderr: "must-not-consume" };
  } });
  assert.equal(success.outcome, "success");
  assert.equal(success.claude.five_hour.utilization, 2);
  assert.equal(success.claude.seven_day.utilization, 51);
  assert.equal(success.claude.model_windows[0].utilization, 87);
  assert.deepEqual(calls[0][0], "orca");
  assert.deepEqual(calls[0][1], ["account", "list", "--json"]);
  assert.equal(calls[0][2].shell, false);
  assert.equal(JSON.stringify(success).includes("secret"), false);
  for (const execFileImpl of [
    async () => ({ stdout: "not-json" }),
    async () => ({ stdout: JSON.stringify({ ok: false }) }),
    async () => { const error = new Error("timeout"); error.killed = true; throw error; },
    async () => { const error = new Error("nonzero"); error.code = 1; throw error; },
  ]) assert.deepEqual(await readClaudeLimitsFromOrca({ execFileImpl }), { outcome: "invalid_response", claude: null });
});

test("pilot Claude quota read requires exact opt-in and uses Orca without OAuth fallback", async () => {
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

  let oauthReads = 0;
  const reader = createProviderLimitsReader({
    env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1", [TEAM_OPS_BOARD_CLAUDE_QUOTA_READ]: "1" },
    now: () => START_MS,
    readCodexLimitsImpl: async () => null,
    readOrcaClaudeLimitsImpl: async () => ({ outcome: "success", source: "orca_runtime_snapshot", claude: claudeValue(36) }),
    readClaudeLimitsImpl: async () => { oauthReads += 1; return claudeValue(99); },
  });
  const snapshot = await reader.readSnapshot();
  assert.equal(oauthReads, 0);
  assert.equal(snapshot.claude.five_hour.utilization, 36);
  assert.equal(snapshot.claude.source, "orca_runtime_snapshot");

  const failedOrca = createProviderLimitsReader({
    env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1", [TEAM_OPS_BOARD_CLAUDE_QUOTA_READ]: "1" },
    now: () => START_MS,
    readCodexLimitsImpl: async () => null,
    readOrcaClaudeLimitsImpl: async () => ({ outcome: "invalid_response" }),
    readClaudeLimitsImpl: async () => { oauthReads += 1; return claudeValue(99); },
  });
  assert.equal((await failedOrca.readSnapshot()).claude, null);
  assert.equal(oauthReads, 0);
});

test("Orca source updatedAt controls freshness instead of Board read time", async () => {
  const reader = createProviderLimitsReader({
    env: { [TEAM_OPS_BOARD_READ_ONLY_PILOT]: "1", [TEAM_OPS_BOARD_CLAUDE_QUOTA_READ]: "1" },
    now: () => START_MS + DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS + 1,
    readCodexLimitsImpl: async () => null,
    readOrcaClaudeLimitsImpl: async () => ({
      outcome: "success", source: "orca_runtime_snapshot",
      claude: { ...claudeValue(44), observed_at: new Date(START_MS).toISOString() },
    }),
  });
  const snapshot = await reader.readSnapshot();
  assert.equal(snapshot.claude.observed_at, new Date(START_MS).toISOString());
  assert.equal(snapshot.claude_status.state, "stale");
  assert.equal(snapshot.claude_status.freshness, "stale");
});

test("Claude request classifies only safe outcomes without consuming error bodies", async () => {
  const calls = [];
  const responseFor = (status, body = claudeValue(), retryAfter = null) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "retry-after" ? retryAfter : null },
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

test("failure immediately marks process-memory last-good stale and cooldown suppresses retries", async () => {
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
  assert.equal(failedCurrent.claude_status.state, "stale");
  assert.equal(failedCurrent.claude_status.outcome, "rate_limited");
  assert.equal(failedCurrent.claude_status.freshness, "stale");
  assert.equal(failedCurrent.claude.five_hour.utilization, 57);

  nowMs = START_MS + DEFAULT_CLAUDE_LIMITS_REFRESH_MS + DEFAULT_CLAUDE_FAILURE_COOLDOWN_MS - 1;
  const justCurrent = await reader.readSnapshot();
  assert.equal(justCurrent.claude_status.freshness, "stale");
  assert.equal(results.length, 1);
  nowMs += 1;
  const stale = await reader.readSnapshot();
  assert.equal(stale.claude_status.state, "stale");
  assert.equal(stale.claude_status.outcome, "timeout");
  assert.equal(stale.claude_status.freshness, "stale");
  assert.equal(stale.claude.five_hour.utilization, 57);
  assert.equal(results.length, 0);

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

test("Retry-After accepts delta-seconds and HTTP-date without reading an error body", async () => {
  let bodyReads = 0;
  const response = (value) => ({
    ok: false,
    status: 429,
    headers: { get: (name) => name.toLowerCase() === "retry-after" ? value : null },
    json: async () => { bodyReads += 1; throw new Error("must not read"); },
  });
  const options = { accessToken: "synthetic", timeoutMs: 10, now: () => START_MS };
  assert.equal((await requestClaudeLimits({ ...options, fetchImpl: async () => response("600") })).retryAfterMs, 600_000);
  assert.equal((await requestClaudeLimits({ ...options, fetchImpl: async () => response("7200") })).retryAfterMs, MAX_CLAUDE_FAILURE_COOLDOWN_MS);
  assert.equal((await requestClaudeLimits({ ...options, fetchImpl: async () => response(new Date(START_MS + 900_000).toUTCString()) })).retryAfterMs, 900_000);
  assert.deepEqual(await requestClaudeLimits({ ...options, fetchImpl: async () => response("invalid") }), {
    outcome: "rate_limited", claude: null,
  });
  assert.equal(bodyReads, 0);
});

test("exponential failure cooldown observes each boundary and caps at one hour", async () => {
  let nowMs = START_MS;
  let reads = 0;
  const reader = createProviderLimitsReader({
    env: {}, ttlMs: 0, claudeRefreshMs: 0, now: () => nowMs,
    readCodexLimitsImpl: async () => null,
    readClaudeLimitsImpl: async () => { reads += 1; return { outcome: "timeout" }; },
  });
  for (const cooldownMs of [300_000, 600_000, 1_200_000, 2_400_000, 3_600_000, 3_600_000]) {
    await reader.readSnapshot();
    const afterFailure = reads;
    nowMs += cooldownMs - 1;
    await reader.readSnapshot();
    assert.equal(reads, afterFailure);
    nowMs += 1;
  }
  await reader.readSnapshot();
  assert.equal(reads, 7);
});

test("malformed injected Retry-After values fall back to the first five-minute cooldown", async () => {
  for (const retryAfterMs of [-1, "600000", {}, Number.NaN, Number.POSITIVE_INFINITY]) {
    let nowMs = START_MS;
    let reads = 0;
    const reader = createProviderLimitsReader({
      env: {}, ttlMs: 0, claudeRefreshMs: 0, now: () => nowMs,
      readCodexLimitsImpl: async () => null,
      readClaudeLimitsImpl: async () => {
        reads += 1;
        return { outcome: "rate_limited", retryAfterMs };
      },
    });
    await reader.readSnapshot();
    assert.equal(reads, 1);
    nowMs += DEFAULT_CLAUDE_FAILURE_COOLDOWN_MS - 1;
    await reader.readSnapshot();
    assert.equal(reads, 1);
    nowMs += 1;
    await reader.readSnapshot();
    assert.equal(reads, 2);
  }
});

test("failure cooldown is exponential, capped, Retry-After compatible, and success resets it", async () => {
  let nowMs = START_MS;
  let reads = 0;
  const outcomes = [
    { outcome: "rate_limited", retryAfterMs: 900_000 },
    { outcome: "timeout" },
    { outcome: "success", claude: claudeValue(41) },
    { outcome: "invalid_response" },
  ];
  const reader = createProviderLimitsReader({
    env: {}, ttlMs: 0, claudeRefreshMs: 0, now: () => nowMs,
    readCodexLimitsImpl: async () => null,
    readClaudeLimitsImpl: async () => { reads += 1; return outcomes.shift(); },
  });
  await Promise.all([reader.readSnapshot(), reader.readSnapshot(), reader.readSnapshot()]);
  assert.equal(reads, 1);
  nowMs += 899_999;
  await reader.readSnapshot();
  assert.equal(reads, 1);
  nowMs += 1;
  await reader.readSnapshot();
  assert.equal(reads, 2);
  nowMs += 599_999;
  await reader.readSnapshot();
  assert.equal(reads, 2);
  nowMs += 1;
  const recovered = await reader.readSnapshot();
  assert.equal(reads, 3);
  assert.equal(recovered.claude_status.state, "ready");
  nowMs += DEFAULT_CLAUDE_LIMITS_REFRESH_MS;
  await reader.readSnapshot();
  assert.equal(reads, 4);
  nowMs += DEFAULT_CLAUDE_FAILURE_COOLDOWN_MS - 1;
  await reader.readSnapshot();
  assert.equal(reads, 4);
  nowMs += 1;
  await reader.readSnapshot();
  assert.equal(reads, 5);
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
