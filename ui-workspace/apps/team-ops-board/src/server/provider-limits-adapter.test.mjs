import assert from "node:assert/strict";
import test from "node:test";

import { createOfficialProviderQuotaSnapshot } from "../core/provider-quota-snapshot.mjs";
import { DEFAULT_CLAUDE_QUOTA_FRESHNESS_MS, DEFAULT_PROVIDER_LIMITS_TTL_MS, createProviderLimitsReader } from "./provider-limits-adapter.mjs";

const NOW = Date.parse("2026-08-10T00:00:00.000Z");

test("Claude receipt freshness covers the five-minute owned companion interval", () => {
  assert.equal(DEFAULT_CLAUDE_QUOTA_FRESHNESS_MS, 6 * 60_000);
});
function claudeSnapshot() {
  return createOfficialProviderQuotaSnapshot({
    source_kind: "claude_code_statusline_rate_limits",
    observed_at: new Date(NOW).toISOString(),
    limits: [
      { limit_id: "claude_five_hour", percentage_kind: "remaining_percentage", percentage: 80, window_minutes: 300, resets_at: "2026-08-10T05:00:00.000Z" },
      { limit_id: "claude_weekly", percentage_kind: "remaining_percentage", percentage: 60, window_minutes: 10_080, resets_at: "2026-08-17T00:00:00.000Z" },
    ],
  }, { nowMs: NOW });
}

test("reader consumes a fresh sanitized status-line receipt and keeps Fable UNKNOWN", async () => {
  const reader = createProviderLimitsReader({
    now: () => NOW,
    readCodexLimitsImpl: async () => null,
    providerQuotaReceiptStore: { readReadOnlyProjection: async () => ({ capture_status: "hold", freshness: "stale", snapshot: claudeSnapshot() }) },
  });
  const result = await reader.readSnapshot();
  assert.equal(result.claude_official.freshness, "fresh");
  assert.equal(result.claude_official.five_hour.utilization, 20);
  assert.equal(result.claude_official.fable_weekly, null);
});

test("missing or malformed receipt fails closed without provider or credential access", async () => {
  const reader = createProviderLimitsReader({ now: () => NOW, readCodexLimitsImpl: async () => null });
  const result = await reader.readSnapshot();
  assert.equal(result.claude_official.capture_status, "hold");
  assert.equal(result.claude_official.freshness, "unknown");
});

test("reader keeps one in-flight refresh for the bounded TTL", async () => {
  assert.equal(DEFAULT_PROVIDER_LIMITS_TTL_MS, 60_000);
  let calls = 0;
  const reader = createProviderLimitsReader({ now: () => NOW, readCodexLimitsImpl: async () => { calls += 1; return null; } });
  await Promise.all([reader.readSnapshot(), reader.readSnapshot(), reader.readSnapshot()]);
  assert.equal(calls, 1);
});
