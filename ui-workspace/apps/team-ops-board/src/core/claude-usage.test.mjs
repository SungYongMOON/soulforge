// claude-usage.test.mjs — Claude Code 사용량 재구성 순수 계층의 dedup·윈도 경계·KST 일 경계·
// sidechain 분리·프라이버시 가드 fail-closed 동작을 node:test로 검증한다.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAUDE_USAGE_SCHEMA_VERSION,
  buildClaudeUsageSnapshot,
  buildClaudeUsageViewModel,
  estimateClaudeUsdCost,
  guardClaudeUsagePrivacy,
  kstDayStartMs,
  parseClaudeUsageLine,
} from "./claude-usage.mjs";

const REFERENCE_MS = Date.parse("2026-08-08T02:00:00.000Z");

function usageLine({
  messageId = "msg_01",
  requestId,
  timestamp = "2026-08-08T01:30:00.000Z",
  model = "claude-fable-5",
  type = "assistant",
  sidechain = false,
  input = 10,
  output = 20,
  cacheRead = 300,
  cacheWrite = 40,
} = {}) {
  const entry = {
    type,
    timestamp,
    sessionId: "0000-session",
    isSidechain: sidechain,
    message: {
      role: "assistant",
      model,
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite,
      },
    },
  };
  if (messageId !== null) entry.message.id = messageId;
  if (requestId !== undefined) entry.requestId = requestId;
  return JSON.stringify(entry);
}

function record(overrides = {}) {
  return parseClaudeUsageLine(usageLine(overrides));
}

test("parseClaudeUsageLine extracts aggregate-safe fields only", () => {
  const parsed = parseClaudeUsageLine(usageLine());
  assert.deepEqual(parsed, {
    message_id: "msg_01",
    timestamp: "2026-08-08T01:30:00.000Z",
    model: "claude-fable-5",
    sidechain: false,
    tokens: {
      input: 10,
      output: 20,
      cache_read: 300,
      cache_write: 40,
      total_tokens: 30,
      total_with_cache: 370,
    },
  });
  assert.equal("sessionId" in parsed, false);
  assert.equal("cwd" in parsed, false);
});

test("parseClaudeUsageLine falls back to requestId when message.id is missing", () => {
  const parsed = parseClaudeUsageLine(usageLine({ messageId: null, requestId: "req_77" }));
  assert.equal(parsed.message_id, "req_77");
});

test("parseClaudeUsageLine fails closed on malformed lines", () => {
  assert.equal(parseClaudeUsageLine("not json"), null);
  assert.equal(parseClaudeUsageLine(""), null);
  assert.equal(parseClaudeUsageLine(null), null);
  assert.equal(parseClaudeUsageLine("[1,2]"), null);
  assert.equal(parseClaudeUsageLine(usageLine({ type: "user" })), null, "non-assistant line");
  assert.equal(parseClaudeUsageLine(usageLine({ messageId: null })), null, "no message.id nor requestId");
  assert.equal(parseClaudeUsageLine(usageLine({ timestamp: "yesterday" })), null, "unparseable timestamp");
  const noUsage = JSON.parse(usageLine());
  delete noUsage.message.usage;
  assert.equal(parseClaudeUsageLine(JSON.stringify(noUsage)), null, "missing usage");
});

test("buildClaudeUsageSnapshot dedups repeated message ids (same id 3x counts once)", () => {
  const repeated = [record(), record(), record()];
  const snapshot = buildClaudeUsageSnapshot(repeated, { referenceMs: REFERENCE_MS });
  assert.equal(snapshot.schema_version, CLAUDE_USAGE_SCHEMA_VERSION);
  assert.equal(snapshot.five_hour.turns, 1);
  assert.equal(snapshot.rolling_7d.turns, 1);
  assert.equal(snapshot.rolling_7d.tokens.total_tokens, 30);
  assert.equal(snapshot.rolling_7d.tokens.total_with_cache, 370);
  assert.equal(snapshot.models_7d.length, 1);
  assert.deepEqual(snapshot.models_7d[0], {
    model: "claude-fable-5",
    turns: 1,
    tokens: { input: 10, output: 20, cache_read: 300, cache_write: 40, total_tokens: 30, total_with_cache: 370 },
  });
  assert.equal(snapshot.last_activity_at, "2026-08-08T01:30:00.000Z");
});

test("buildClaudeUsageSnapshot enforces the rolling five-hour boundary", () => {
  const snapshot = buildClaudeUsageSnapshot([
    record({ messageId: "msg_edge_out", timestamp: "2026-08-07T21:00:00.000Z" }),
    record({ messageId: "msg_edge_in", timestamp: "2026-08-07T21:00:00.001Z" }),
    record({ messageId: "msg_now", timestamp: "2026-08-08T02:00:00.000Z" }),
    record({ messageId: "msg_future", timestamp: "2026-08-08T02:00:00.001Z" }),
  ], { referenceMs: REFERENCE_MS });
  // 정확히 reference-5h 인 라인과 reference 이후 라인은 제외, 경계 직후·reference 정각은 포함.
  assert.equal(snapshot.five_hour.turns, 2);
  assert.equal(snapshot.rolling_7d.turns, 3);
});

test("buildClaudeUsageSnapshot uses the KST calendar day boundary", () => {
  assert.equal(kstDayStartMs(REFERENCE_MS), Date.parse("2026-08-07T15:00:00.000Z"));
  const snapshot = buildClaudeUsageSnapshot([
    record({ messageId: "msg_prev_day", timestamp: "2026-08-07T14:59:59.999Z" }),
    record({ messageId: "msg_day_start", timestamp: "2026-08-07T15:00:00.000Z" }),
    record({ messageId: "msg_morning", timestamp: "2026-08-08T01:00:00.000Z" }),
  ], { referenceMs: REFERENCE_MS });
  // KST(UTC+9) 기준 2026-08-08 은 UTC 2026-08-07T15:00:00Z 에 시작한다.
  assert.equal(snapshot.calendar_day.turns, 2);
  assert.equal(snapshot.rolling_7d.turns, 3);
});

test("buildClaudeUsageSnapshot splits sidechain turns per window", () => {
  const snapshot = buildClaudeUsageSnapshot([
    record({ messageId: "msg_main", sidechain: false }),
    record({ messageId: "msg_side_a", sidechain: true }),
    record({ messageId: "msg_side_b", sidechain: true, timestamp: "2026-08-05T01:00:00.000Z" }),
  ], { referenceMs: REFERENCE_MS });
  assert.equal(snapshot.five_hour.turns, 2);
  assert.equal(snapshot.five_hour.sidechain_turns, 1);
  assert.equal(snapshot.rolling_7d.turns, 3);
  assert.equal(snapshot.rolling_7d.sidechain_turns, 2);
  // sidechain 토큰도 윈도 합계에는 포함된다(분리 지표는 turn 수).
  assert.equal(snapshot.rolling_7d.tokens.total_tokens, 90);
});

test("buildClaudeUsageSnapshot ignores unusable records and empty input", () => {
  const snapshot = buildClaudeUsageSnapshot([null, {}, { message_id: "x" }], { referenceMs: REFERENCE_MS });
  assert.equal(snapshot.five_hour.turns, 0);
  assert.equal(snapshot.models_7d.length, 0);
  assert.equal(snapshot.last_activity_at, null);
  const empty = buildClaudeUsageSnapshot(undefined, { referenceMs: REFERENCE_MS });
  assert.equal(empty.rolling_7d.tokens.total_with_cache, 0);
});

test("guardClaudeUsagePrivacy rejects poisoned keys at any depth", () => {
  const clean = buildClaudeUsageSnapshot([record()], { referenceMs: REFERENCE_MS });
  assert.equal(guardClaudeUsagePrivacy(clean), clean);
  assert.equal(guardClaudeUsagePrivacy({ ...clean, cwd: `${String.fromCharCode(67)}:/somewhere` }), null);
  assert.equal(guardClaudeUsagePrivacy({ ...clean, promptText: "hello" }), null);
  const nested = { ...clean, models_7d: [{ model: "claude-x", turns: 1, tokens: {}, filePath: "x" }] };
  assert.equal(guardClaudeUsagePrivacy(nested), null);
  assert.equal(guardClaudeUsagePrivacy(null), null);
  assert.equal(guardClaudeUsagePrivacy("string"), null);
});

test("buildClaudeUsageViewModel projects a valid snapshot", () => {
  const snapshot = {
    ...buildClaudeUsageSnapshot([
      record(),
      record({ messageId: "msg_side", sidechain: true, model: "claude-haiku-4" }),
    ], { referenceMs: REFERENCE_MS }),
    observed_at: "2026-08-08T02:00:00.000Z",
    plan: { user_rate_limit_tier: null, organization_rate_limit_tier: "default_claude_max_20x" },
  };
  const view = buildClaudeUsageViewModel(snapshot);
  assert.equal(view.available, true);
  assert.equal(view.observedAt, "2026-08-08T02:00:00.000Z");
  assert.equal(view.plan.organizationTier, "default_claude_max_20x");
  assert.equal(view.windows.length, 3);
  assert.equal(view.windows[0].key, "five_hour");
  assert.equal(view.windows[0].turns, 2);
  assert.equal(view.windows[0].sidechainTurns, 1);
  assert.equal(view.windows[0].tokens.totalWithCache, 740);
  assert.equal(view.models.length, 2);
  assert.equal(view.models[0].totalTokens, 30);
});

test("buildClaudeUsageViewModel fails closed on malformed snapshots", () => {
  const closed = { available: false, observedAt: null, lastActivityAt: null, plan: null, windows: [], models: [] };
  assert.deepEqual(buildClaudeUsageViewModel(null), closed);
  assert.deepEqual(buildClaudeUsageViewModel("nope"), closed);
  assert.deepEqual(buildClaudeUsageViewModel({}), closed);
  const good = buildClaudeUsageSnapshot([record()], { referenceMs: REFERENCE_MS });
  assert.equal(buildClaudeUsageViewModel(good).available, true);
  assert.equal(buildClaudeUsageViewModel({ ...good, schema_version: "other.v9" }).available, false);
  assert.equal(buildClaudeUsageViewModel({ ...good, extra_key: 1 }).available, false);
  assert.equal(buildClaudeUsageViewModel({ ...good, five_hour: { turns: -1, sidechain_turns: 0, tokens: {} } }).available, false);
  const overSplit = { ...good, five_hour: { ...good.five_hour, sidechain_turns: good.five_hour.turns + 1 } };
  assert.equal(buildClaudeUsageViewModel(overSplit).available, false, "sidechain_turns must not exceed turns");
});

test("buildClaudeUsageViewModel fails closed when the privacy guard trips", () => {
  const poisoned = { ...buildClaudeUsageSnapshot([record()], { referenceMs: REFERENCE_MS }), cwd: `${String.fromCharCode(67)}:/leak` };
  const view = buildClaudeUsageViewModel(poisoned);
  assert.equal(view.available, false);
  assert.deepEqual(view.windows, []);
});

test("estimateClaudeUsdCost prices known models and reports unknown ones", () => {
  const result = estimateClaudeUsdCost([
    { model: "claude-fable-5", tokens: { input: 1_000_000, output: 100_000, cache_read: 10_000_000, cache_write: 500_000 } },
    { model: "claude-mystery", tokens: { input: 5, output: 5, cache_read: 0, cache_write: 0 } },
  ]);
  assert.equal(result.usd, 35);
  assert.deepEqual(result.unknown_models, ["claude-mystery"]);
  assert.equal(estimateClaudeUsdCost(null), null);
});
