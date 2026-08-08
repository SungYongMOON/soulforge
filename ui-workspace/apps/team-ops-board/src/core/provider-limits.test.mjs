// provider-limits.test.mjs — 공식 한도 파싱의 최신 선택·실패 폐쇄 회귀.

import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeClaudeOauthUsage,
  parseCodexRateLimitsFromJsonlText,
} from "./provider-limits.mjs";

test("codex JSONL parser picks the latest parseable rate_limits line", () => {
  const lines = [
    JSON.stringify({ timestamp: "2026-08-08T01:00:00Z", payload: { type: "token_count", rate_limits: { primary: { used_percent: 42, window_minutes: 10080, resets_at: 1786163319 }, secondary: null, plan_type: "pro" } } }),
    '{"broken json with "rate_limits" inside',
    JSON.stringify({ timestamp: "2026-08-08T03:00:00Z", payload: { type: "token_count", rate_limits: { primary: { used_percent: 97.4, window_minutes: 10080, resets_at: 1786163319 }, secondary: { used_percent: 12, window_minutes: 300, resets_at: 1786150000 }, plan_type: "pro" } } }),
  ].join("\n");
  const parsed = parseCodexRateLimitsFromJsonlText(lines);
  assert.equal(parsed.primary.used_percent, 97.4);
  assert.equal(parsed.secondary.used_percent, 12);
  assert.equal(parsed.secondary.window_minutes, 300);
  assert.equal(parsed.plan_type, "pro");
  assert.equal(parsed.observed_at, "2026-08-08T03:00:00.000Z");
});

test("codex JSONL parser fails closed on garbage and invalid percents", () => {
  assert.equal(parseCodexRateLimitsFromJsonlText(""), null);
  assert.equal(parseCodexRateLimitsFromJsonlText("no limits here"), null);
  const invalid = JSON.stringify({ timestamp: "2026-08-08T03:00:00Z", payload: { rate_limits: { primary: { used_percent: "많이" }, plan_type: "pro" } } });
  assert.equal(parseCodexRateLimitsFromJsonlText(invalid), null);
});

test("claude oauth normalizer keeps only utilization windows and clamps shape", () => {
  const normalized = normalizeClaudeOauthUsage({
    five_hour: { utilization: 89, resets_at: "2026-08-08T04:09:59.932986+00:00" },
    seven_day: { utilization: 18.26, resets_at: "2026-08-14T20:59:59Z" },
    seven_day_opus: null,
    limits: { secret_budget: 999 },
    spend: { amount: 12 },
  });
  assert.equal(normalized.five_hour.utilization, 89);
  assert.equal(normalized.five_hour.resets_at, "2026-08-08T04:09:59.932Z");
  assert.equal(normalized.seven_day.utilization, 18.3);
  assert.equal(normalized.seven_day_opus, null);
  assert.equal(Object.keys(normalized).length, 4);
  assert.doesNotMatch(JSON.stringify(normalized), /secret_budget|spend/u);
});

test("claude oauth normalizer fails closed when no window is usable", () => {
  assert.equal(normalizeClaudeOauthUsage(null), null);
  assert.equal(normalizeClaudeOauthUsage({ five_hour: { utilization: "high" } }), null);
});
