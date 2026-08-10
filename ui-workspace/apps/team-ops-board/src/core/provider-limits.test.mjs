import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_LIMITS_SCHEMA_VERSION,
  buildClaudeQuotaPresentation,
  buildProviderLimitsSnapshot,
  normalizeClaudeOfficialQuota,
  parseCodexRateLimitsFromJsonlText,
} from "./provider-limits.mjs";

const OBSERVED_AT = "2026-08-10T00:00:00.000Z";
const official = (overrides = {}) => ({
  capture_status: "accepted",
  freshness: "fresh",
  source_kind: "claude_code_statusline_rate_limits",
  observed_at: OBSERVED_AT,
  five_hour: { limit_id: "claude_five_hour", percentage_kind: "used_percentage", percentage: 20, window_minutes: 300, resets_at: "2026-08-10T05:00:00.000Z" },
  weekly: { limit_id: "claude_weekly", percentage_kind: "remaining_percentage", percentage: 70, window_minutes: 10_080, resets_at: "2026-08-17T00:00:00.000Z" },
  fable_weekly: null,
  ...overrides,
});

test("Codex parser keeps only the newest valid public rate-limit fields", () => {
  const text = [
    JSON.stringify({ timestamp: "2026-08-09T00:00:00Z", payload: { rate_limits: { primary: { used_percent: 10, window_minutes: 300, resets_at: 1786323600 }, plan_type: "pro" } } }),
    JSON.stringify({ timestamp: OBSERVED_AT, payload: { rate_limits: { primary: { used_percent: 25, window_minutes: 300, resets_at: 1786410000 }, secondary: null, plan_type: "pro" } } }),
  ].join("\n");
  assert.equal(parseCodexRateLimitsFromJsonlText(text).primary.used_percent, 25);
  assert.equal(parseCodexRateLimitsFromJsonlText("broken"), null);
});

test("official Claude status-line quota accepts documented 5h/7d and never infers Fable", () => {
  const normalized = normalizeClaudeOfficialQuota(official({
    fable_weekly: { limit_id: "claude_fable_weekly", percentage_kind: "used_percentage", percentage: 90, window_minutes: 10_080, resets_at: "2026-08-17T00:00:00.000Z" },
  }));
  assert.equal(normalized.five_hour.utilization, 20);
  assert.equal(normalized.weekly.utilization, 30);
  assert.equal(normalized.fable_weekly, null);
});

test("malformed or inconsistent quota becomes UNKNOWN/HOLD, never zero/current", () => {
  const normalized = normalizeClaudeOfficialQuota(official({ weekly: null }));
  assert.equal(normalized.capture_status, "hold");
  assert.equal(normalized.freshness, "unknown");
  assert.equal(normalized.five_hour, null);
  assert.equal(buildClaudeQuotaPresentation({ claude_official: normalized }).current, false);
});

test("provider snapshot is v3, sanitized, and keeps quota separate from usage", () => {
  const snapshot = buildProviderLimitsSnapshot({ claudeOfficial: official({ raw: "drop-me" }), observedAtMs: Date.parse(OBSERVED_AT) });
  assert.equal(snapshot.schema_version, PROVIDER_LIMITS_SCHEMA_VERSION);
  assert.equal(snapshot.claude_official.capture_status, "accepted");
  assert.doesNotMatch(JSON.stringify(snapshot), /raw|drop-me|usage_event/u);
});
