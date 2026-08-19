import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAUDE_QUOTA_ATTEMPT_CLASSES,
  PROVIDER_LIMITS_SCHEMA_VERSION,
  PROVIDER_LIMITS_SCHEMA_VERSION_V2,
  PROVIDER_LIMITS_SCHEMA_VERSION_V3,
  buildClaudeQuotaPresentation,
  buildProviderLimitsSnapshot,
  normalizeClaudeQuotaAttempt,
} from "./provider-limits.mjs";

const OBSERVED_AT = "2026-08-16T00:00:00.000Z";
const ATTEMPTED_AT = "2026-08-19T00:00:00.000Z";

const official = (overrides = {}) => ({
  capture_status: "hold",
  freshness: "stale",
  source_kind: "claude_oauth_usage_sanitized",
  observed_at: OBSERVED_AT,
  five_hour: { limit_id: "claude_five_hour", percentage_kind: "used_percentage", percentage: 94, window_minutes: 300, resets_at: "2026-08-16T05:00:00.000Z" },
  weekly: { limit_id: "claude_weekly", percentage_kind: "used_percentage", percentage: 83, window_minutes: 10_080, resets_at: "2026-08-23T00:00:00.000Z" },
  fable_weekly: null,
  ...overrides,
});

const attempt = (overrides = {}) => ({ attempted_at: ATTEMPTED_AT, result_class: "auth_rejected", ...overrides });

test("attempt classes are a fixed sanitized set with no free text", () => {
  assert.deepEqual([...CLAUDE_QUOTA_ATTEMPT_CLASSES].sort(), [
    "accepted", "auth_rejected", "credential_unavailable", "receipt_failed",
    "response_invalid", "transport_failed",
  ]);
});

test("attempt normalization is exact and fails closed to null", () => {
  assert.deepEqual(normalizeClaudeQuotaAttempt(attempt()), { attempted_at: ATTEMPTED_AT, result_class: "auth_rejected" });
  for (const value of [
    null, undefined, 12, "auth_rejected", [],
    attempt({ result_class: "kaput" }),
    attempt({ attempted_at: "yesterday" }),
    { ...attempt(), detail: "HTTP 401 Unauthorized from api.anthropic.com" },
  ]) {
    assert.equal(normalizeClaudeQuotaAttempt(value), null);
  }
});

test("the provider limits snapshot carries attempt evidence beside the last-good value", () => {
  const snapshot = buildProviderLimitsSnapshot({
    codex: null,
    claudeOfficial: official(),
    claudeAttempt: attempt(),
    observedAtMs: Date.parse(ATTEMPTED_AT),
  });
  assert.deepEqual(snapshot.claude_quota_attempt, { attempted_at: ATTEMPTED_AT, result_class: "auth_rejected" });
  assert.equal(snapshot.claude_official.freshness, "stale");
  assert.equal(snapshot.claude_official.five_hour.utilization, 94);
});

test("the root shape carrying attempt evidence is an explicit v4, not a widened v3", () => {
  assert.equal(PROVIDER_LIMITS_SCHEMA_VERSION, "soulforge.team_ops_board_provider_limits.v4");
  assert.equal(PROVIDER_LIMITS_SCHEMA_VERSION_V3, "soulforge.team_ops_board_provider_limits.v3");
  assert.equal(PROVIDER_LIMITS_SCHEMA_VERSION_V2, "soulforge.team_ops_board_provider_limits.v2");
  const snapshot = buildProviderLimitsSnapshot({
    claudeOfficial: official(),
    claudeAttempt: attempt(),
    observedAtMs: Date.parse(ATTEMPTED_AT),
  });
  assert.equal(snapshot.schema_version, PROVIDER_LIMITS_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "claude_official", "claude_quota_attempt", "codex", "observed_at", "schema_version",
  ]);
});

test("a retained v2 or v3 payload reads exactly as before and never gains a pass", () => {
  for (const schemaVersion of [PROVIDER_LIMITS_SCHEMA_VERSION_V2, PROVIDER_LIMITS_SCHEMA_VERSION_V3]) {
    const retained = { schema_version: schemaVersion, observed_at: OBSERVED_AT, codex: null, claude_official: official() };
    const presentation = buildClaudeQuotaPresentation(retained);
    assert.equal(presentation.status.state, "stale");
    assert.equal(presentation.claude.five_hour.utilization, 94);
    assert.equal(presentation.status.attempt_class, "unknown");
    assert.equal(presentation.status.attempted_at, null);
    assert.equal(presentation.requires_reauth, false);
    assert.equal(presentation.current, false);
  }
});

test("a snapshot without attempt evidence stays backward compatible and null", () => {
  const snapshot = buildProviderLimitsSnapshot({ codex: null, claudeOfficial: official(), observedAtMs: Date.parse(ATTEMPTED_AT) });
  assert.equal(snapshot.claude_quota_attempt, null);
  assert.equal(buildClaudeQuotaPresentation(snapshot).status.attempt_class, "unknown");
  assert.equal(buildClaudeQuotaPresentation(snapshot).status.attempted_at, null);
});

test("a rejected credential reaches the Owner as re-login required without any login action", () => {
  const presentation = buildClaudeQuotaPresentation(buildProviderLimitsSnapshot({
    claudeOfficial: official(),
    claudeAttempt: attempt(),
    observedAtMs: Date.parse(ATTEMPTED_AT),
  }));
  assert.equal(presentation.status.state, "stale");
  assert.equal(presentation.status.attempt_class, "auth_rejected");
  assert.equal(presentation.status.attempted_at, ATTEMPTED_AT);
  assert.equal(presentation.status.last_success_at, OBSERVED_AT);
  assert.equal(presentation.requires_reauth, true);
  assert.equal(presentation.current, false);
  assert.equal(presentation.value_state, "last_known");
});

test("attempt evidence never upgrades a stale value to current and a fresh value stays current", () => {
  const stillFailing = buildClaudeQuotaPresentation(buildProviderLimitsSnapshot({
    claudeOfficial: official(),
    claudeAttempt: attempt({ result_class: "accepted" }),
    observedAtMs: Date.parse(ATTEMPTED_AT),
  }));
  assert.equal(stillFailing.current, false);
  assert.equal(stillFailing.status.state, "stale");
  assert.equal(stillFailing.requires_reauth, false);

  const fresh = buildClaudeQuotaPresentation(buildProviderLimitsSnapshot({
    claudeOfficial: official({ capture_status: "accepted", freshness: "fresh" }),
    claudeAttempt: attempt({ result_class: "accepted" }),
    observedAtMs: Date.parse(OBSERVED_AT),
  }));
  assert.equal(fresh.current, true);
  assert.equal(fresh.status.state, "ready");
  assert.equal(fresh.requires_reauth, false);
});

test("an auth-rejected attempt with no last-good value stays UNKNOWN rather than inventing zero", () => {
  const presentation = buildClaudeQuotaPresentation(buildProviderLimitsSnapshot({
    claudeOfficial: null,
    claudeAttempt: attempt(),
    observedAtMs: Date.parse(ATTEMPTED_AT),
  }));
  assert.equal(presentation.status.state, "unknown");
  assert.equal(presentation.value_state, "unavailable");
  assert.equal(presentation.claude.five_hour, null);
  assert.equal(presentation.requires_reauth, true);
});
