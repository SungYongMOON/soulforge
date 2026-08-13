import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PROVIDER_QUOTA_AI_USAGE_LEDGER_INTERCHANGE,
  PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION,
  PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION,
  buildOfficialProviderQuotaProjection,
  createClaudeOauthUsageQuotaSnapshot,
  createClaudeStatusLineQuotaSnapshot,
  createOfficialProviderQuotaSnapshot,
  isOfficialProviderQuotaSnapshot,
  validateOfficialProviderQuotaSnapshot,
} from "./provider-quota-snapshot.mjs";

const NOW_MS = Date.parse("2026-08-10T00:00:00.000Z");

function isoAfter(minutes) {
  return new Date(NOW_MS + (minutes * 60 * 1_000)).toISOString();
}

function antigravityObservation(overrides = {}) {
  return {
    source_kind: "antigravity_sanitized_local_receipt",
    observed_at: new Date(NOW_MS).toISOString(),
    limits: [
      {
        limit_id: "antigravity_five_hour",
        percentage_kind: "remaining_percentage",
        percentage: 73.25,
        window_minutes: 300,
        resets_at: isoAfter(295),
      },
      {
        limit_id: "antigravity_weekly",
        percentage_kind: "remaining_percentage",
        percentage: 42,
        window_minutes: 10_080,
        resets_at: isoAfter(10_000),
      },
    ],
    ...overrides,
  };
}

test("provider quota snapshots are strict, digest-bound, and distinct from usage ledger events", () => {
  const snapshot = createOfficialProviderQuotaSnapshot(antigravityObservation(), { nowMs: NOW_MS });

  assert.equal(PROVIDER_QUOTA_AI_USAGE_LEDGER_INTERCHANGE, "forbidden");
  assert.equal(snapshot.schema_version, PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "digest",
    "limits",
    "observed_at",
    "schema_version",
    "source_kind",
  ]);
  assert.equal(isOfficialProviderQuotaSnapshot(snapshot, { nowMs: NOW_MS }), true);
  assert.equal(isOfficialProviderQuotaSnapshot({
    schema_version: "soulforge.ai_usage_event.v1",
    event_id: "usage-event",
    usage: {},
  }, { nowMs: NOW_MS }), false);

  const tampered = { ...snapshot, digest: "0".repeat(64) };
  assert.throws(
    () => validateOfficialProviderQuotaSnapshot(tampered, { nowMs: NOW_MS }),
    { code: "provider_quota_digest_mismatch" },
  );
});

test("Claude status-line parser retains only the documented rate-limit fields", () => {
  const canary = "DO_NOT_RETAIN_PROVIDER_INPUT";
  const snapshot = createClaudeStatusLineQuotaSnapshot({
    cwd: canary,
    session_id: canary,
    account: canary,
    credential: canary,
    cookie: canary,
    headers: canary,
    prompt: canary,
    transcript: canary,
    envelope: canary,
    rate_limits: {
      five_hour: {
        used_percentage: 18.5,
        resets_at: Math.floor((NOW_MS + (4 * 60 * 60 * 1_000)) / 1_000),
        path: canary,
      },
      seven_day: {
        used_percentage: 54,
        resets_at: Math.floor((NOW_MS + (6 * 24 * 60 * 60 * 1_000)) / 1_000),
        body: canary,
      },
    },
  }, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  });

  const bytes = JSON.stringify(snapshot);
  assert.equal(bytes.includes(canary), false);
  assert.deepEqual(snapshot.limits.map((limit) => limit.limit_id), [
    "claude_five_hour",
    "claude_weekly",
  ]);
  assert.deepEqual(snapshot.limits.map((limit) => limit.percentage_kind), [
    "used_percentage",
    "used_percentage",
  ]);

  const fiveHourOnly = createClaudeStatusLineQuotaSnapshot({
    rate_limits: {
      five_hour: {
        used_percentage: 1,
        resets_at: Math.floor((NOW_MS + 60_000) / 1_000),
      },
    },
  }, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  });
  assert.deepEqual(fiveHourOnly.limits.map((limit) => limit.limit_id), ["claude_five_hour"]);

  const weeklyOnly = createClaudeStatusLineQuotaSnapshot({
    rate_limits: {
      seven_day: {
        used_percentage: 2,
        resets_at: Math.floor((NOW_MS + (24 * 60 * 60 * 1_000)) / 1_000),
      },
    },
  }, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  });
  assert.deepEqual(weeklyOnly.limits.map((limit) => limit.limit_id), ["claude_weekly"]);
  assert.equal(createClaudeStatusLineQuotaSnapshot({}, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  }), null);
  assert.throws(
    () => createClaudeStatusLineQuotaSnapshot({
      rate_limits: {
        five_hour: { used_percentage: "not-a-number", resets_at: 1 },
      },
    }, {
      observedAt: new Date(NOW_MS).toISOString(),
      nowMs: NOW_MS,
    }),
    { code: "provider_quota_claude_statusline_incomplete" },
  );
});

test("Claude OAuth keeps a reported percentage when the provider explicitly omits the reset time", () => {
  const snapshot = createClaudeOauthUsageQuotaSnapshot({
    five_hour: { utilization: 12, resets_at: null },
    seven_day: { utilization: 34, resets_at: isoAfter(9_000) },
  }, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  });

  assert.equal(snapshot.limits[0].limit_id, "claude_five_hour");
  assert.equal(snapshot.limits[0].percentage, 12);
  assert.equal(snapshot.limits[0].resets_at, null);
  assert.equal(validateOfficialProviderQuotaSnapshot(snapshot, { nowMs: NOW_MS }).limits[0].resets_at, null);
});

test("unknown fields, future observations, and implausible quota windows fail closed", () => {
  const valid = antigravityObservation();
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({ ...valid, credential: "synthetic-only" }, { nowMs: NOW_MS }),
    { code: "provider_quota_observation_keys_invalid" },
  );
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({
      ...valid,
      limits: [{ ...valid.limits[0], unexpected: "synthetic-only" }, valid.limits[1]],
    }, { nowMs: NOW_MS }),
    { code: "provider_quota_limit_keys_invalid" },
  );
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({
      ...valid,
      observed_at: new Date(NOW_MS + 1).toISOString(),
    }, { nowMs: NOW_MS }),
    { code: "provider_quota_observed_at_future" },
  );
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({
      ...valid,
      limits: [
        { ...valid.limits[0], window_minutes: 1 },
        valid.limits[1],
      ],
    }, { nowMs: NOW_MS }),
    { code: "provider_quota_window_invalid" },
  );
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({
      ...valid,
      limits: [
        { ...valid.limits[0], resets_at: isoAfter(400) },
        valid.limits[1],
      ],
    }, { nowMs: NOW_MS }),
    { code: "provider_quota_reset_implausible" },
  );
  assert.throws(
    () => createClaudeStatusLineQuotaSnapshot({
      rate_limits: {
        five_hour: { used_percentage: 1, resets_at: Number.MAX_SAFE_INTEGER },
        seven_day: {
          used_percentage: 1,
          resets_at: Math.floor((NOW_MS + (24 * 60 * 60 * 1_000)) / 1_000),
        },
      },
    }, {
      observedAt: new Date(NOW_MS).toISOString(),
      nowMs: NOW_MS,
    }),
    { code: "provider_quota_claude_statusline_incomplete" },
  );
});

test("Fable is a fixed optional compatibility window, never inferred from the documented status-line source", () => {
  const compatibilityWithoutFable = createOfficialProviderQuotaSnapshot({
    source_kind: "claude_orca_compat_receipt",
    observed_at: new Date(NOW_MS).toISOString(),
    limits: [
      {
        limit_id: "claude_five_hour",
        percentage_kind: "used_percentage",
        percentage: 20,
        window_minutes: 300,
        resets_at: isoAfter(250),
      },
      {
        limit_id: "claude_weekly",
        percentage_kind: "used_percentage",
        percentage: 40,
        window_minutes: 10_080,
        resets_at: isoAfter(9_000),
      },
    ],
  }, { nowMs: NOW_MS });
  assert.deepEqual(compatibilityWithoutFable.limits.map((limit) => limit.limit_id), [
    "claude_five_hour",
    "claude_weekly",
  ]);

  const claudeSnapshot = createOfficialProviderQuotaSnapshot({
    source_kind: "claude_orca_compat_receipt",
    observed_at: new Date(NOW_MS).toISOString(),
    limits: [
      {
        limit_id: "claude_five_hour",
        percentage_kind: "used_percentage",
        percentage: 20,
        window_minutes: 300,
        resets_at: isoAfter(250),
      },
      {
        limit_id: "claude_weekly",
        percentage_kind: "used_percentage",
        percentage: 40,
        window_minutes: 10_080,
        resets_at: isoAfter(9_000),
      },
      {
        limit_id: "claude_fable_weekly",
        percentage_kind: "used_percentage",
        percentage: 60,
        window_minutes: 10_080,
        resets_at: isoAfter(8_000),
      },
    ],
  }, { nowMs: NOW_MS });

  assert.equal(claudeSnapshot.limits.at(-1).limit_id, "claude_fable_weekly");
  assert.throws(
    () => createOfficialProviderQuotaSnapshot({
      source_kind: "claude_code_statusline_rate_limits",
      observed_at: claudeSnapshot.observed_at,
      limits: claudeSnapshot.limits,
    }, { nowMs: NOW_MS }),
    { code: "provider_quota_limits_invalid" },
  );
});

test("projection keeps prior evidence stale or holds unknown without fabricating numeric values", () => {
  const snapshot = createOfficialProviderQuotaSnapshot(antigravityObservation(), { nowMs: NOW_MS });
  const fresh = buildOfficialProviderQuotaProjection({
    snapshot,
    sourceAvailable: true,
    nowMs: NOW_MS + 1_000,
  });
  assert.equal(fresh.schema_version, PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION);
  assert.equal(fresh.capture_status, "accepted");
  assert.equal(fresh.freshness, "fresh");

  const stale = buildOfficialProviderQuotaProjection({
    snapshot,
    sourceAvailable: false,
    nowMs: NOW_MS + 1_000,
  });
  assert.equal(stale.capture_status, "hold");
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.snapshot.observed_at, snapshot.observed_at);
  assert.equal(stale.snapshot.digest, snapshot.digest);

  const partial = createClaudeStatusLineQuotaSnapshot({
    rate_limits: {
      five_hour: {
        used_percentage: 3,
        resets_at: Math.floor((NOW_MS + 60_000) / 1_000),
      },
    },
  }, {
    observedAt: new Date(NOW_MS).toISOString(),
    nowMs: NOW_MS,
  });
  const partialProjection = buildOfficialProviderQuotaProjection({
    snapshot: partial,
    sourceAvailable: true,
    nowMs: NOW_MS,
  });
  assert.equal(partialProjection.capture_status, "hold");
  assert.equal(partialProjection.freshness, "unknown");
  assert.equal(partialProjection.snapshot.limits.length, 1);

  const unknown = buildOfficialProviderQuotaProjection({ nowMs: NOW_MS });
  assert.deepEqual(unknown, {
    schema_version: PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION,
    capture_status: "hold",
    freshness: "unknown",
    snapshot: null,
  });
});

test("inert snapshot library has no provider, process, filesystem, or configuration access", async () => {
  const source = await readFile(new URL("./provider-quota-snapshot.mjs", import.meta.url), "utf8");
  for (const forbiddenReference of [
    "node:child_process",
    "node:fs",
    "fetch(",
    "process.env",
    "execFile",
  ]) {
    assert.equal(source.includes(forbiddenReference), false, forbiddenReference);
  }
});
