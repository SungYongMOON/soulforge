// antigravity-quota.mjs — sanitized Antigravity quota observations only.
// Groups stay dynamic: this layer never invents a fixed provider-window map.

export const ANTIGRAVITY_QUOTA_SCHEMA_VERSION = "soulforge.team_ops_board_antigravity_quota.v1";
export const ANTIGRAVITY_QUOTA_STATUS_SCHEMA_VERSION = "soulforge.team_ops_board_antigravity_quota_status.v1";

const KNOWN_WINDOWS = new Set(["weekly", "5h"]);
const FRESHNESS = new Set(["current", "stale"]);
const SOURCE_KINDS = new Set([
  "antigravity_sanitized_local_receipt",
  "antigravity_sanitized_loopback_receipt",
]);
const MAX_GROUPS = 8;
const MAX_BUCKETS = 8;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildAntigravityQuotaStatus({ appRunning = false, observedAtMs = Date.now() } = {}) {
  if (typeof appRunning !== "boolean" || !Number.isFinite(observedAtMs)) return null;
  return {
    schema_version: ANTIGRAVITY_QUOTA_STATUS_SCHEMA_VERSION,
    observed_at: new Date(observedAtMs).toISOString(),
    freshness: "current",
    app_state: appRunning ? "running" : "absent",
    quota_state: "unknown",
    reason: appRunning ? "app_running_source_unavailable" : "app_absent",
  };
}

export function quotaSeverityForRemaining(remainingPercent) {
  if (typeof remainingPercent !== "number" || !Number.isFinite(remainingPercent)
    || remainingPercent < 0 || remainingPercent > 100) return "idle";
  if (remainingPercent <= 15) return "crit";
  if (remainingPercent <= 40) return "warn";
  return "ok";
}

function safeLabel(value, max = 48) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/gu, "").trim().slice(0, max) : "";
}

function fraction(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 1_000) / 1_000
    : null;
}

function isoOrNull(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizedGroups(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const groups = [];
  for (const group of value.slice(0, MAX_GROUPS)) {
    if (!isRecord(group) || !Array.isArray(group.buckets)) continue;
    const label = safeLabel(group.label ?? group.displayName) || "그룹";
    const buckets = [];
    for (const bucket of group.buckets.slice(0, MAX_BUCKETS)) {
      if (!isRecord(bucket)) continue;
      const window = KNOWN_WINDOWS.has(bucket.window) ? bucket.window : null;
      const remaining = fraction(bucket.remaining_fraction ?? bucket.remainingFraction);
      if (window === null || remaining === null) continue;
      buckets.push({
        window,
        remaining_fraction: remaining,
        resets_at: isoOrNull(bucket.resets_at ?? bucket.resetTime),
      });
    }
    if (buckets.length > 0) groups.push({ label, buckets });
  }
  return groups.length > 0 ? groups : null;
}

// language_server response { response: { groups: [{ displayName, buckets }] } }
export function parseAntigravityQuotaResponse(body) {
  return normalizedGroups(body?.response?.groups ?? body?.groups ?? null);
}

export function buildAntigravityQuotaSnapshot({
  groups,
  observedAtMs = Date.now(),
  freshness = "current",
  sourceKind = "antigravity_sanitized_loopback_receipt",
} = {}) {
  const normalized = normalizedGroups(groups);
  if (normalized === null || !Number.isFinite(observedAtMs)
    || !FRESHNESS.has(freshness) || !SOURCE_KINDS.has(sourceKind)) return null;
  return {
    schema_version: ANTIGRAVITY_QUOTA_SCHEMA_VERSION,
    observed_at: new Date(observedAtMs).toISOString(),
    freshness,
    source_kind: sourceKind,
    groups: normalized,
  };
}

// Cache intake is intentionally stricter than display parsing. A future or
// malformed record is unusable and must not become a green/current value.
export function normalizeAntigravityQuotaSnapshot(value, { nowMs = Date.now() } = {}) {
  if (!isRecord(value) || value.schema_version !== ANTIGRAVITY_QUOTA_SCHEMA_VERSION
    || !Number.isFinite(nowMs)) return null;
  const observedAt = isoOrNull(value.observed_at);
  const observedAtMs = observedAt === null ? NaN : Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs) || observedAtMs > nowMs) return null;
  const sourceKind = SOURCE_KINDS.has(value.source_kind)
    ? value.source_kind
    : "antigravity_sanitized_loopback_receipt";
  const freshness = FRESHNESS.has(value.freshness) ? value.freshness : "stale";
  return buildAntigravityQuotaSnapshot({
    groups: value.groups,
    observedAtMs,
    freshness,
    sourceKind,
  });
}

export function staleAntigravityQuotaSnapshot(snapshot, options = {}) {
  const normalized = normalizeAntigravityQuotaSnapshot(snapshot, options);
  return normalized === null ? null : { ...normalized, freshness: "stale" };
}

// UI convenience: flatten dynamic group × known-window data without claiming
// that a group is a particular provider plan or fixed quota identifier.
export function antigravityQuotaRows(snapshot) {
  const normalized = normalizeAntigravityQuotaSnapshot(snapshot, { nowMs: Date.now() });
  if (normalized === null) return [];
  const rows = [];
  for (const group of normalized.groups) {
    const shortName = group.label.replace(/\s*Models?$/iu, "").replace(/\s*and GPT.*$/iu, "+GPT");
    for (const bucket of group.buckets) {
      rows.push({
        provider: `AG·${shortName}`,
        window: bucket.window === "5h" ? "5시간 창" : "주간 창",
        remaining_percent: Math.round(bucket.remaining_fraction * 100),
        resets_at: bucket.resets_at,
        freshness: normalized.freshness,
        source_kind: normalized.source_kind,
        observed_at: normalized.observed_at,
      });
    }
  }
  return rows;
}
