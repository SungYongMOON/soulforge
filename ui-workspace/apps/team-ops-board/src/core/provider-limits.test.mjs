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

test("claude oauth normalizer keeps utilization windows and scoped model limits", () => {
  const normalized = normalizeClaudeOauthUsage({
    five_hour: { utilization: 89, resets_at: "2026-08-08T04:09:59.932986+00:00" },
    seven_day: { utilization: 18.26, resets_at: "2026-08-14T20:59:59Z" },
    seven_day_opus: { utilization: 28, resets_at: "2026-08-14T20:59:59Z" },
    seven_day_sonnet: null,
    nimbus_quill: { utilization: 0, resets_at: null },
    limits: [
      { kind: "session", group: "session", percent: 89, severity: "normal", resets_at: "2026-08-08T04:09:59Z", scope: null },
      { kind: "weekly_all", group: "weekly", percent: 18.26, resets_at: "2026-08-14T20:59:59Z", scope: null },
      { kind: "weekly_scoped", group: "weekly", percent: 46, resets_at: "2026-08-14T21:00:00Z", scope: { model: { id: null, display_name: "Fable" }, surface: null } },
      { kind: "weekly_scoped", group: "weekly", percent: "많이", scope: { model: { display_name: "Broken" } } },
    ],
    spend: { amount: 12 },
  });
  assert.equal(normalized.five_hour.utilization, 89);
  assert.equal(normalized.five_hour.resets_at, "2026-08-08T04:09:59.932Z");
  assert.equal(normalized.seven_day.utilization, 18.3);
  assert.deepEqual(normalized.model_windows, [
    { key: "weekly_scoped", label: "Fable", utilization: 46, resets_at: "2026-08-14T21:00:00.000Z" },
    { key: "seven_day_opus", label: "Opus", utilization: 28, resets_at: "2026-08-14T20:59:59.000Z" },
  ]);
  assert.equal(Object.keys(normalized).length, 3);
  assert.doesNotMatch(JSON.stringify(normalized), /spend|nimbus|Broken/u);
});

test("claude oauth normalizer fails closed when no window is usable", () => {
  assert.equal(normalizeClaudeOauthUsage(null), null);
  assert.equal(normalizeClaudeOauthUsage({ five_hour: { utilization: "high" } }), null);
});
