import { createHash } from "node:crypto";

// This contract deliberately does not share a shape with AI usage ledger/events.
// It carries only a provider-owned quota observation that a separate, already
// sanitized producer has made safe to retain.
export const PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION = "soulforge.team_ops_board_provider_quota_snapshot.v1";
export const PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION = "soulforge.team_ops_board_provider_quota_projection.v1";
export const PROVIDER_QUOTA_AI_USAGE_LEDGER_INTERCHANGE = "forbidden";

export const DEFAULT_PROVIDER_QUOTA_FRESHNESS_MS = 120_000;
export const MAX_PROVIDER_QUOTA_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1_000;
export const MAX_PROVIDER_QUOTA_FUTURE_OBSERVED_MS = 0;

const RESET_SLACK_MS = 5 * 60 * 1_000;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const LIMIT_KEYS = Object.freeze([
  "limit_id",
  "percentage_kind",
  "percentage",
  "window_minutes",
  "resets_at",
]);
const OBSERVATION_KEYS = Object.freeze(["source_kind", "observed_at", "limits"]);
const SNAPSHOT_KEYS = Object.freeze([
  "schema_version",
  "source_kind",
  "observed_at",
  "limits",
  "digest",
]);
const LIMIT_RULES = Object.freeze({
  claude_five_hour: Object.freeze({ windowMinutes: 300 }),
  claude_weekly: Object.freeze({ windowMinutes: 10_080 }),
  claude_fable_weekly: Object.freeze({ windowMinutes: 10_080 }),
  antigravity_five_hour: Object.freeze({ windowMinutes: 300 }),
  antigravity_weekly: Object.freeze({ windowMinutes: 10_080 }),
});

const SOURCE_RULES = Object.freeze({
  claude_code_statusline_rate_limits: Object.freeze({
    expected: Object.freeze(["claude_five_hour", "claude_weekly"]),
    optional: Object.freeze([]),
    minimum_limits: 1,
  }),
  // Compatibility can consume only a pre-sanitized receipt. It never grants
  // authority to invoke Orca, read an account listing, or inspect credentials.
  claude_orca_compat_receipt: Object.freeze({
    expected: Object.freeze(["claude_five_hour", "claude_weekly"]),
    optional: Object.freeze(["claude_fable_weekly"]),
    minimum_limits: 1,
  }),
  claude_oauth_usage_sanitized: Object.freeze({
    expected: Object.freeze(["claude_five_hour", "claude_weekly"]),
    optional: Object.freeze(["claude_fable_weekly"]),
    minimum_limits: 2,
  }),
  antigravity_sanitized_local_receipt: Object.freeze({
    expected: Object.freeze(["antigravity_five_hour", "antigravity_weekly"]),
    optional: Object.freeze([]),
    minimum_limits: 1,
  }),
  antigravity_sanitized_loopback_receipt: Object.freeze({
    expected: Object.freeze(["antigravity_five_hour", "antigravity_weekly"]),
    optional: Object.freeze([]),
    minimum_limits: 1,
  }),
  // The Windows UIA collector reduces accessibility names to percentages and
  // reset times before this boundary. No window handle, title, or raw name.
  antigravity_windows_uia_receipt: Object.freeze({
    expected: Object.freeze(["antigravity_five_hour", "antigravity_weekly"]),
    optional: Object.freeze([]),
    minimum_limits: 1,
  }),
});

export const PROVIDER_QUOTA_SOURCE_KINDS = Object.freeze(Object.keys(SOURCE_RULES));
export const PROVIDER_QUOTA_LIMIT_IDS = Object.freeze(Object.keys(LIMIT_RULES));
export const PROVIDER_QUOTA_PERCENTAGE_KINDS = Object.freeze([
  "used_percentage",
  "remaining_percentage",
]);
export const PROVIDER_QUOTA_CAPTURE_STATUSES = Object.freeze(["accepted", "hold"]);
export const PROVIDER_QUOTA_FRESHNESS = Object.freeze(["fresh", "stale", "unknown"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort((left, right) => left.localeCompare(right, "en")).join("\u0000")
      === [...keys].sort((left, right) => left.localeCompare(right, "en")).join("\u0000");
}

function normalizedIso(value, code) {
  if (typeof value !== "string") fail(code);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) fail(code);
  return { epochMs, iso: new Date(epochMs).toISOString() };
}

function normalizedNowMs(value) {
  if (!Number.isFinite(value)) fail("provider_quota_reference_time_invalid");
  return Number(value);
}

function normalizedFreshnessMs(value) {
  if (!Number.isSafeInteger(value)
    || value < 1
    || value > MAX_PROVIDER_QUOTA_FRESHNESS_MS) {
    fail("provider_quota_freshness_threshold_invalid");
  }
  return value;
}

function normalizedPercentage(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail("provider_quota_percentage_invalid");
  }
  return Math.round(value * 1_000) / 1_000;
}

function limitOrder(limitId) {
  return PROVIDER_QUOTA_LIMIT_IDS.indexOf(limitId);
}

function normalizedLimit(value, observedAtMs, sourceKind) {
  if (!hasExactKeys(value, LIMIT_KEYS)) fail("provider_quota_limit_keys_invalid");
  if (!PROVIDER_QUOTA_LIMIT_IDS.includes(value.limit_id)) fail("provider_quota_limit_id_invalid");
  if (!PROVIDER_QUOTA_PERCENTAGE_KINDS.includes(value.percentage_kind)) {
    fail("provider_quota_percentage_kind_invalid");
  }
  const rule = LIMIT_RULES[value.limit_id];
  if (!Number.isSafeInteger(value.window_minutes) || value.window_minutes !== rule.windowMinutes) {
    fail("provider_quota_window_invalid");
  }
  let resetsAt = null;
  if (value.resets_at === null) {
    if (sourceKind !== "claude_oauth_usage_sanitized") fail("provider_quota_reset_invalid");
  } else {
    const reset = normalizedIso(value.resets_at, "provider_quota_reset_invalid");
    const maximumResetMs = observedAtMs + (rule.windowMinutes * 60 * 1_000) + RESET_SLACK_MS;
    if (reset.epochMs <= observedAtMs || reset.epochMs > maximumResetMs) {
      fail("provider_quota_reset_implausible");
    }
    resetsAt = reset.iso;
  }
  return {
    limit_id: value.limit_id,
    percentage_kind: value.percentage_kind,
    percentage: normalizedPercentage(value.percentage),
    window_minutes: rule.windowMinutes,
    resets_at: resetsAt,
  };
}

function normalizedLimits(value, sourceKind, observedAtMs) {
  if (!Array.isArray(value)) fail("provider_quota_limits_invalid");
  const sourceRule = SOURCE_RULES[sourceKind];
  const allowed = new Set([...sourceRule.expected, ...sourceRule.optional]);
  const seen = new Set();
  const limits = value.map((item) => {
    const normalized = normalizedLimit(item, observedAtMs, sourceKind);
    if (!allowed.has(normalized.limit_id) || seen.has(normalized.limit_id)) {
      fail("provider_quota_limits_invalid");
    }
    seen.add(normalized.limit_id);
    return normalized;
  });
  if (limits.length !== seen.size || limits.length < sourceRule.minimum_limits) {
    fail("provider_quota_limits_incomplete");
  }
  return limits.sort((left, right) => limitOrder(left.limit_id) - limitOrder(right.limit_id));
}

function hasCompleteSourceCoverage(snapshot) {
  const sourceRule = SOURCE_RULES[snapshot.source_kind];
  const seen = new Set(snapshot.limits.map((limit) => limit.limit_id));
  return sourceRule.expected.every((limitId) => seen.has(limitId));
}

function normalizedObservation(value, { nowMs = Date.now() } = {}) {
  if (!hasExactKeys(value, OBSERVATION_KEYS)) fail("provider_quota_observation_keys_invalid");
  if (!PROVIDER_QUOTA_SOURCE_KINDS.includes(value.source_kind)) fail("provider_quota_source_kind_invalid");
  const referenceMs = normalizedNowMs(nowMs);
  const observed = normalizedIso(value.observed_at, "provider_quota_observed_at_invalid");
  if (observed.epochMs > referenceMs + MAX_PROVIDER_QUOTA_FUTURE_OBSERVED_MS) {
    fail("provider_quota_observed_at_future");
  }
  return {
    source_kind: value.source_kind,
    observed_at: observed.iso,
    limits: normalizedLimits(value.limits, value.source_kind, observed.epochMs),
  };
}

function canonicalEvidence(snapshot) {
  return JSON.stringify({
    schema_version: PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION,
    source_kind: snapshot.source_kind,
    observed_at: snapshot.observed_at,
    limits: snapshot.limits,
  });
}

function digestFor(snapshot) {
  return createHash("sha256").update(canonicalEvidence(snapshot), "utf8").digest("hex");
}

// The producer contract is intentionally smaller than a provider response or
// Claude status-line envelope. Unknown fields are rejected before hashing or
// persistence, so they cannot cross this boundary accidentally.
export function createOfficialProviderQuotaSnapshot(observation, options = {}) {
  const normalized = normalizedObservation(observation, options);
  const snapshot = {
    schema_version: PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION,
    ...normalized,
  };
  return {
    ...snapshot,
    digest: digestFor(snapshot),
  };
}

export function validateOfficialProviderQuotaSnapshot(value, options = {}) {
  if (!hasExactKeys(value, SNAPSHOT_KEYS)
    || value.schema_version !== PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION
    || typeof value.digest !== "string"
    || !DIGEST_PATTERN.test(value.digest)) {
    fail("provider_quota_snapshot_invalid");
  }
  const normalized = normalizedObservation({
    source_kind: value.source_kind,
    observed_at: value.observed_at,
    limits: value.limits,
  }, options);
  const snapshot = {
    schema_version: PROVIDER_QUOTA_SNAPSHOT_SCHEMA_VERSION,
    ...normalized,
  };
  if (digestFor(snapshot) !== value.digest) fail("provider_quota_digest_mismatch");
  return {
    ...snapshot,
    digest: value.digest,
  };
}

export function isOfficialProviderQuotaSnapshot(value, options = {}) {
  try {
    validateOfficialProviderQuotaSnapshot(value, options);
    return true;
  } catch {
    return false;
  }
}

function unknownProjection() {
  return {
    schema_version: PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION,
    capture_status: "hold",
    freshness: "unknown",
    snapshot: null,
  };
}

// This is the only reader-facing state: a cache alone is not proof that the
// tool is still running, so callers must pass sourceAvailable=true to expose a
// fresh value. Read-only restart callers leave it false and get STALE/HOLD.
export function buildOfficialProviderQuotaProjection({
  snapshot = null,
  sourceAvailable = false,
  nowMs = Date.now(),
  freshnessMs = DEFAULT_PROVIDER_QUOTA_FRESHNESS_MS,
} = {}) {
  if (snapshot === null) return unknownProjection();
  const referenceMs = normalizedNowMs(nowMs);
  const thresholdMs = normalizedFreshnessMs(freshnessMs);
  let validated;
  try {
    validated = validateOfficialProviderQuotaSnapshot(snapshot, { nowMs: referenceMs });
  } catch {
    return unknownProjection();
  }
  if (!hasCompleteSourceCoverage(validated)) {
    return {
      schema_version: PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION,
      capture_status: "hold",
      freshness: "unknown",
      snapshot: validated,
    };
  }
  const ageMs = referenceMs - Date.parse(validated.observed_at);
  const fresh = sourceAvailable === true && ageMs >= 0 && ageMs <= thresholdMs;
  return {
    schema_version: PROVIDER_QUOTA_PROJECTION_SCHEMA_VERSION,
    capture_status: fresh ? "accepted" : "hold",
    freshness: fresh ? "fresh" : "stale",
    snapshot: validated,
  };
}

function claudeStatusLineWindow(value, limitId, observedAtMs) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)
    || typeof value.used_percentage !== "number"
    || !Number.isSafeInteger(value.resets_at)
    || value.resets_at < 0) {
    fail("provider_quota_claude_statusline_incomplete");
  }
  const rule = LIMIT_RULES[limitId];
  const resetMs = value.resets_at * 1_000;
  if (!Number.isSafeInteger(resetMs)) fail("provider_quota_claude_statusline_incomplete");
  const reset = new Date(resetMs);
  if (!Number.isFinite(reset.getTime())) fail("provider_quota_claude_statusline_incomplete");
  return {
    limit_id: limitId,
    percentage_kind: "used_percentage",
    percentage: value.used_percentage,
    window_minutes: rule.windowMinutes,
    resets_at: reset.toISOString(),
  };
}

// Narrow parser for the two fields documented by Claude Code. It intentionally
// destructures only rate_limits windows and never copies, hashes, logs, or
// retains the surrounding status-line input object.
export function createClaudeStatusLineQuotaSnapshot(statusLineInput, {
  observedAt = new Date(Date.now()).toISOString(),
  nowMs = Date.now(),
} = {}) {
  const observed = normalizedIso(observedAt, "provider_quota_observed_at_invalid");
  if (!isRecord(statusLineInput)
    || !Object.hasOwn(statusLineInput, "rate_limits")
    || statusLineInput.rate_limits === null
    || statusLineInput.rate_limits === undefined) {
    return null;
  }
  const rateLimits = statusLineInput.rate_limits;
  if (!isRecord(rateLimits)) fail("provider_quota_claude_statusline_incomplete");
  const limits = [
    claudeStatusLineWindow(rateLimits.five_hour, "claude_five_hour", observed.epochMs),
    claudeStatusLineWindow(rateLimits.seven_day, "claude_weekly", observed.epochMs),
  ].filter((limit) => limit !== null);
  if (limits.length === 0) return null;
  return createOfficialProviderQuotaSnapshot({
    source_kind: "claude_code_statusline_rate_limits",
    observed_at: observed.iso,
    limits,
  }, { nowMs });
}

function claudeOauthWindow(value, limitId) {
  if (!isRecord(value)) return null;
  const percentage = typeof value.utilization === "number" ? value.utilization : value.used_percentage;
  if (typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  const resetsAt = value.resets_at === null
    ? null
    : normalizedIso(value.resets_at, "provider_quota_claude_oauth_incomplete").iso;
  return { limit_id: limitId, percentage_kind: "used_percentage", percentage, window_minutes: LIMIT_RULES[limitId].windowMinutes, resets_at: resetsAt };
}

export function createClaudeOauthUsageQuotaSnapshot(input, { observedAt = new Date().toISOString(), nowMs = Date.now() } = {}) {
  if (!isRecord(input)) return null;
  const scopedFable = Array.isArray(input.limits) ? input.limits.find((entry) => isRecord(entry)
    && entry.kind === "weekly_scoped" && isRecord(entry.scope) && isRecord(entry.scope.model)
    && typeof entry.scope.model.display_name === "string" && entry.scope.model.display_name.trim().toLowerCase() === "fable") : null;
  const fable = scopedFable === null ? input.fable_weekly ?? input.fable_seven_day ?? input.seven_day_fable : { used_percentage: scopedFable.percent, resets_at: scopedFable.resets_at };
  const limits = [
    claudeOauthWindow(input.five_hour, "claude_five_hour"),
    claudeOauthWindow(input.seven_day, "claude_weekly"),
    claudeOauthWindow(fable, "claude_fable_weekly"),
  ].filter((entry) => entry !== null);
  if (!limits.some((entry) => entry.limit_id === "claude_five_hour") || !limits.some((entry) => entry.limit_id === "claude_weekly")) return null;
  return createOfficialProviderQuotaSnapshot({ source_kind: "claude_oauth_usage_sanitized", observed_at: observedAt, limits }, { nowMs });
}
