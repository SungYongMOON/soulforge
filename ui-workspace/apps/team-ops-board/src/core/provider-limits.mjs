// provider-limits.mjs — public Board projection for official quota evidence.
// This is deliberately separate from the AI usage ledger and accepts only the
// small, sanitized receipt shape emitted by the server adapter.

export const PROVIDER_LIMITS_SCHEMA_VERSION = "soulforge.team_ops_board_provider_limits.v3";
export const PROVIDER_LIMITS_SCHEMA_VERSION_V2 = "soulforge.team_ops_board_provider_limits.v2";

const SAFE_PLAN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const CLAUDE_SOURCE_KINDS = new Set([
  "claude_code_statusline_rate_limits",
  "claude_orca_compat_receipt",
  "claude_oauth_usage_sanitized",
]);
const FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const CAPTURE_STATUS = new Set(["accepted", "hold"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finitePercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value * 10) / 10
    : null;
}

function safeEpochSeconds(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoOrNull(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function codexWindow(window) {
  if (!isRecord(window)) return null;
  const usedPercent = finitePercent(window.used_percent);
  if (usedPercent === null) return null;
  return {
    used_percent: usedPercent,
    window_minutes: safeEpochSeconds(window.window_minutes),
    resets_at_epoch_s: safeEpochSeconds(window.resets_at ?? window.resets_at_epoch_s),
  };
}

function normalizeCodexSnapshot(value) {
  if (!isRecord(value)) return null;
  const primary = codexWindow(value.primary);
  if (primary === null) return null;
  return {
    primary,
    secondary: codexWindow(value.secondary),
    plan_type: typeof value.plan_type === "string" && SAFE_PLAN.test(value.plan_type) ? value.plan_type : null,
    observed_at: isoOrNull(value.observed_at),
  };
}

// Parse only the public Codex rate-limit fields from a session JSONL line.
export function parseCodexRateLimitsFromJsonlText(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const lines = text.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.includes('"rate_limits"')) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const limits = parsed?.payload?.rate_limits ?? parsed?.rate_limits ?? null;
    const normalized = normalizeCodexSnapshot({
      ...limits,
      observed_at: parsed?.timestamp,
    });
    if (normalized !== null) return normalized;
  }
  return null;
}

function emptyClaudeOfficialQuota() {
  return {
    capture_status: "hold",
    freshness: "unknown",
    source_kind: null,
    observed_at: null,
    five_hour: null,
    weekly: null,
    fable_weekly: null,
  };
}

function normalizedOfficialWindow(value, { expectedId, expectedMinutes, observedAtMs }) {
  if (isRecord(value) && value.limit_id === undefined && value.window_minutes === undefined) {
    const utilization = finitePercent(value.utilization);
    const resetsAt = isoOrNull(value.resets_at);
    const resetMs = resetsAt === null ? NaN : Date.parse(resetsAt);
    return utilization !== null && Number.isFinite(resetMs) && resetMs > observedAtMs
      ? { utilization, resets_at: resetsAt }
      : null;
  }
  if (!isRecord(value) || value.limit_id !== expectedId
    || !["used_percentage", "remaining_percentage"].includes(value.percentage_kind)
    || value.window_minutes !== expectedMinutes) return null;
  const percentage = finitePercent(value.percentage);
  const resetsAt = isoOrNull(value.resets_at);
  const resetMs = resetsAt === null ? NaN : Date.parse(resetsAt);
  if (percentage === null || !Number.isFinite(resetMs) || resetMs <= observedAtMs) return null;
  return {
    utilization: value.percentage_kind === "used_percentage" ? percentage : 100 - percentage,
    resets_at: resetsAt,
  };
}

// The server removes the receipt digest and every other non-display field
// before this reaches the browser. Revalidate the remaining presentation
// contract so a malformed loopback response cannot create a green value.
export function normalizeClaudeOfficialQuota(value) {
  const empty = emptyClaudeOfficialQuota();
  if (!isRecord(value) || !CLAUDE_SOURCE_KINDS.has(value.source_kind)
    || !CAPTURE_STATUS.has(value.capture_status) || !FRESHNESS.has(value.freshness)) return empty;
  const observedAt = isoOrNull(value.observed_at);
  const observedAtMs = observedAt === null ? NaN : Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs)) return empty;
  const fiveHour = normalizedOfficialWindow(value.five_hour, {
    expectedId: "claude_five_hour",
    expectedMinutes: 300,
    observedAtMs,
  });
  const weekly = normalizedOfficialWindow(value.weekly, {
    expectedId: "claude_weekly",
    expectedMinutes: 10_080,
    observedAtMs,
  });
  const fableWeekly = ["claude_orca_compat_receipt", "claude_oauth_usage_sanitized"].includes(value.source_kind)
    ? normalizedOfficialWindow(value.fable_weekly, {
      expectedId: "claude_fable_weekly",
      expectedMinutes: 10_080,
      observedAtMs,
    })
    : null;
  const complete = fiveHour !== null && weekly !== null;
  const current = complete && ["claude_code_statusline_rate_limits", "claude_oauth_usage_sanitized"].includes(value.source_kind)
    && value.capture_status === "accepted" && value.freshness === "fresh";
  const stale = complete && value.capture_status === "hold" && value.freshness === "stale";
  if (!current && !stale) return empty;
  return {
    capture_status: current ? "accepted" : "hold",
    freshness: current ? "fresh" : "stale",
    source_kind: value.source_kind,
    observed_at: observedAt,
    five_hour: fiveHour,
    weekly,
    fable_weekly: fableWeekly,
  };
}

export function buildClaudeQuotaPresentation(snapshot) {
  const official = normalizeClaudeOfficialQuota(snapshot?.claude_official);
  const current = official.capture_status === "accepted" && official.freshness === "fresh";
  const state = current ? "ready" : official.freshness === "stale" ? "stale" : "unknown";
  return {
    official,
    claude: {
      five_hour: official.five_hour,
      seven_day: official.weekly,
      fable_weekly: official.fable_weekly,
      model_windows: official.fable_weekly === null ? [] : [{
        key: "fable_weekly",
        label: "Fable",
        utilization: official.fable_weekly.utilization,
        resets_at: official.fable_weekly.resets_at,
      }],
      observed_at: official.observed_at,
    },
    status: {
      state,
      outcome: official.source_kind,
      attempted_at: official.observed_at,
      last_success_at: official.observed_at,
      freshness: current ? "current" : official.freshness,
    },
    current,
    value_state: current ? "current" : state === "stale" ? "last_known" : "unavailable",
  };
}

export function buildProviderLimitsSnapshot({
  codex = null,
  claudeOfficial = null,
  observedAtMs = Date.now(),
} = {}) {
  const observed = new Date(observedAtMs);
  const observedAt = Number.isFinite(observed.getTime()) ? observed.toISOString() : null;
  return {
    schema_version: PROVIDER_LIMITS_SCHEMA_VERSION,
    observed_at: observedAt,
    codex: normalizeCodexSnapshot(codex),
    claude_official: normalizeClaudeOfficialQuota(claudeOfficial),
  };
}
