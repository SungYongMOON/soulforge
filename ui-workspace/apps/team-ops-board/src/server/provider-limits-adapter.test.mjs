import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

test("the reader projects the last collection attempt beside the retained value", async () => {
  const reader = createProviderLimitsReader({
    now: () => NOW,
    readCodexLimitsImpl: async () => null,
    providerQuotaReceiptStore: { readReadOnlyProjection: async () => ({ capture_status: "hold", freshness: "stale", snapshot: claudeSnapshot() }) },
    providerQuotaAttemptLog: { readLatest: async () => ({ provider: "claude", attempted_at: "2026-08-10T00:00:30.000Z", result: "auth_rejected", result_class: "auth_rejected" }) },
  });
  const result = await reader.readSnapshot();
  assert.deepEqual(result.claude_quota_attempt, { attempted_at: "2026-08-10T00:00:30.000Z", result_class: "auth_rejected" });
});

test("an unreadable or absent attempt log leaves attempt evidence UNKNOWN, never a pass", async () => {
  for (const providerQuotaAttemptLog of [
    null,
    { readLatest: async () => null },
    { readLatest: async () => { throw new Error("disk"); } },
  ]) {
    const reader = createProviderLimitsReader({
      now: () => NOW,
      readCodexLimitsImpl: async () => null,
      providerQuotaReceiptStore: { readReadOnlyProjection: async () => ({ capture_status: "hold", freshness: "stale", snapshot: claudeSnapshot() }) },
      providerQuotaAttemptLog,
    });
    assert.equal((await reader.readSnapshot()).claude_quota_attempt, null);
  }
});

test("Codex quota selects freshest valid rate-limit observation across recent sessions when newest has no rate_limits row", async () => {
  const tempSessions = await mkdtemp(path.join(os.tmpdir(), "codex-sessions-test-"));
  const dayDir = path.join(tempSessions, "2026", "08", "24");
  await mkdir(dayDir, { recursive: true });

  try {
    const tOlder = new Date("2026-08-24T10:00:00.000Z");
    const tFresh = new Date("2026-08-24T11:14:00.000Z");
    const tNewest = new Date("2026-08-24T11:15:00.000Z");

    const olderPath = path.join(dayDir, "older-session.jsonl");
    const freshPath = path.join(dayDir, "fresh-session.jsonl");
    const newestPath = path.join(dayDir, "newest-session.jsonl");

    // Older session: 86% used
    await writeFile(olderPath, JSON.stringify({
      timestamp: "2026-08-24T10:00:00.000Z",
      payload: {
        rate_limits: {
          primary: { used_percent: 86, window_minutes: 10080, resets_at: 1787565600 },
          plan_type: "pro",
        },
      },
    }) + "\n");
    await utimes(olderPath, tOlder, tOlder);

    // Fresh session: 1% used
    await writeFile(freshPath, JSON.stringify({
      timestamp: "2026-08-24T11:14:00.000Z",
      payload: {
        rate_limits: {
          primary: { used_percent: 1, window_minutes: 10080, resets_at: 1787565600 },
          plan_type: "pro",
        },
      },
    }) + "\n");
    await utimes(freshPath, tFresh, tFresh);

    // Newest session: active but has NOT yet emitted rate_limits row
    await writeFile(newestPath, JSON.stringify({
      timestamp: "2026-08-24T11:15:00.000Z",
      type: "session_meta",
      payload: { id: "session-newest" },
    }) + "\n");
    await utimes(newestPath, tNewest, tNewest);

    const reader = createProviderLimitsReader({
      sessionsRoot: tempSessions,
      now: () => Date.parse("2026-08-24T11:16:00.000Z"),
    });

    const snapshot = await reader.readSnapshot();
    assert.ok(snapshot.codex !== null, "codex snapshot should not be null");
    assert.equal(snapshot.codex.primary.used_percent, 1);
    assert.equal(snapshot.codex.observed_at, "2026-08-24T11:14:00.000Z");
    assert.equal(snapshot.codex.plan_type, "pro");
  } finally {
    await rm(tempSessions, { recursive: true, force: true });
  }
});

test("Codex quota fails closed to null when no recent session has a valid rate_limits row", async () => {
  const tempSessions = await mkdtemp(path.join(os.tmpdir(), "codex-sessions-empty-"));
  const dayDir = path.join(tempSessions, "2026", "08", "24");
  await mkdir(dayDir, { recursive: true });

  try {
    const sessionPath = path.join(dayDir, "session.jsonl");
    await writeFile(sessionPath, JSON.stringify({
      timestamp: "2026-08-24T11:15:00.000Z",
      type: "session_meta",
    }) + "\n");

    const reader = createProviderLimitsReader({
      sessionsRoot: tempSessions,
      now: () => Date.parse("2026-08-24T11:16:00.000Z"),
    });

    const snapshot = await reader.readSnapshot();
    assert.equal(snapshot.codex, null);
  } finally {
    await rm(tempSessions, { recursive: true, force: true });
  }
});
