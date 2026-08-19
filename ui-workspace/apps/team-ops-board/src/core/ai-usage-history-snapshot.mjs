import {
  createUnmeasuredAiUsageSnapshot,
  normalizeAiUsageSnapshot
} from "./ai-usage-snapshot.mjs";

export const AI_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA = "soulforge.ai_usage_board_history_snapshot.v2";
export const AI_USAGE_HISTORY_SNAPSHOT_SCHEMA = "soulforge.ai_usage_board_history_snapshot.v3";
export const AI_USAGE_HISTORY_TIMEZONE = "Asia/Seoul";
export const AI_USAGE_PROJECTION_ENVELOPE_SCHEMA = "soulforge.team_ops_board_ai_usage_projection.v1";
export const AI_USAGE_READ_ONLY_PROJECTION_SCHEMA = "soulforge.ai_usage_board_read_only_projection.v1";
export const AI_USAGE_HISTORY_WINDOWS = Object.freeze([
  "calendar_day",
  "calendar_week",
  "calendar_month",
  "rolling_24h",
  "rolling_7d",
  "rolling_30d",
  "all_time"
]);
export const UNMEASURED_REQUEST_FAMILY_CONTRACT_VERSION = "soulforge.ai_usage_unmeasured_family.v1";
export const UNMEASURED_REQUEST_FAMILIES = Object.freeze(["ag_gemini", "ag_claude_gpt"]);
export const UNMEASURED_REQUEST_FAMILY_LABELS = Object.freeze({
  ag_gemini: "AG·Gemini",
  ag_claude_gpt: "AG·Claude+GPT",
});

export function antigravityQuotaFamilyForModel(modelId, { failClosed = true } = {}) {
  const normalized = typeof modelId === "string" ? modelId.toLowerCase().trim() : "";
  if (normalized.startsWith("gemini")) return "ag_gemini";
  if (normalized.startsWith("claude") || normalized.startsWith("gpt") || normalized.startsWith("chatgpt")) return "ag_claude_gpt";
  if (failClosed) {
    const error = new Error("board_usage_history_antigravity_model_unknown");
    error.code = "board_usage_history_antigravity_model_unknown";
    throw error;
  }
  return null;
}

const V2_ROOT_KEYS = ["schema_version", "generated_at", "timezone", "reference_at", "top_n", "current", "windows", "activity", "rate_limit"];
const V3_ROOT_KEYS = [...V2_ROOT_KEYS, "provider_rows", "claude_collection"];
const V3_PROVIDER_DAILY_ROOT_KEYS = [...V3_ROOT_KEYS, "provider_daily"];
const V3_DAILY_SERIES_ROOT_KEYS = [...V3_PROVIDER_DAILY_ROOT_KEYS, "model_daily"];
const V3_UNMEASURED_DAILY_ROOT_KEYS = [...V3_DAILY_SERIES_ROOT_KEYS, "unmeasured_request_daily"];
const WINDOW_KEYS = ["start_at", "end_at", "totals", "breakdowns"];
const BREAKDOWN_KEYS = ["projects", "works", "tasks", "models"];
const BREAKDOWN_GROUP_KEYS = ["top", "other"];
const METRIC_KEYS = ["turns", "total_tokens", "credits", "credit_unknown_turns"];
const DIMENSIONS = Object.freeze([
  ["projects", "project_id"],
  ["works", "work_id"],
  ["tasks", "task_id"],
  ["models", "model_id"]
]);
const ACTIVITY_KEYS = ["daily", "hourly"];
const DAILY_ROW_KEYS = ["date", ...METRIC_KEYS];
const HOURLY_ROW_KEYS = ["hour", "turns", "total_tokens"];
const RATE_LIMIT_KEYS = ["limit_id", "plan_type", "used_percent", "window_minutes", "resets_at_epoch_s", "observed_at"];
const KST_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_DAILY_ROWS = 60;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const FORBIDDEN_KEY = /(session|path|raw|private|secret|credential|cookie|prompt|reasoning|argument|output|body|source|title|message|tool)/iu;
const CREDIT_TOLERANCE = 1e-9;
const ENVELOPE_KEYS = ["schema_version", "refresh_state", "snapshot"];
const READ_ONLY_ENVELOPE_KEYS = ["schema_version", "read_only", "snapshot"];
const REFRESH_STATES = new Set(["ready", "refreshing", "hold", "unmeasured"]);
const PROVIDER_ROWS_KEYS = ["provider", "turns", "total_tokens", "latest_usage_at"];
const PROVIDER_ORDER = ["codex", "claude", "antigravity"];
const PROVIDER_DAILY_ROW_KEYS = ["date", "providers"];
const PROVIDER_DAILY_VALUE_KEYS = ["provider", "total_tokens", "token_unknown_turns", "credits", "credit_unknown_turns"];
const MODEL_DAILY_ROW_KEYS = ["date", "models"];
const MODEL_DAILY_VALUE_KEYS = ["model_id", "turns", "total_tokens", "token_unknown_turns"];
const UNMEASURED_REQUEST_DAILY_ROW_KEYS = ["date", "total_requests", "families"];
const UNMEASURED_REQUEST_FAMILY_VALUE_KEYS = ["family_id", "requests", "models"];
const UNMEASURED_REQUEST_MODEL_VALUE_KEYS = ["model_id", "requests"];
const UNMEASURED_REQUEST_FAMILY_IDS = ["ag_gemini", "ag_claude_gpt"];
const CLAUDE_COLLECTION_KEYS = [
  "schema_version",
  "state",
  "reason",
  "attempted_at",
  "freshness_threshold_seconds",
  "freshness",
  "counts",
  "evidence_scope",
  "claim_scope"
];
const CLAUDE_COLLECTION_COUNT_KEYS = [
  "session_file_count",
  "parsed_session_count",
  "observed_message_count",
  "accepted_event_count",
  "duplicate_message_count",
  "issue_count"
];
const CLAUDE_COLLECTION_STATES = new Set(["observed", "available_empty", "missing", "partial", "error", "unknown"]);
const CLAUDE_COLLECTION_FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const CLAUDE_COLLECTION_REASON_BY_STATE = Object.freeze({
  observed: new Set(["source_observed"]),
  available_empty: new Set(["source_accessible_empty"]),
  missing: new Set(["projects_root_missing"]),
  partial: new Set(["source_partial"]),
  error: new Set(["collector_error"]),
  unknown: new Set(["attempt_unavailable", "attempt_timestamp_untrusted"])
});
const CLAUDE_COLLECTION_SCHEMA = "soulforge.ai_usage_claude_collection_projection.v1";
const CLAUDE_COLLECTION_EVIDENCE_SCOPE = "collector_attempt_source_observation_only";
const CLAUDE_COLLECTION_CLAIM_SCOPE = "does_not_prove_provider_availability_health_live_e2e_or_aggregate_health_or_completeness";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort((left, right) => left.localeCompare(right, "en")).join("\u0000")
      === [...keys].sort((left, right) => left.localeCompare(right, "en")).join("\u0000");
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => (
      key !== "reasoning_effort"
      && !CLAUDE_COLLECTION_COUNT_KEYS.includes(key)
      && FORBIDDEN_KEY.test(key)
    ) || hasForbiddenKey(child)
  );
}

function normalizedTimestamp(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function metric(value) {
  if (!hasExactKeys(value, METRIC_KEYS)) return null;
  const parsed = {
    turns: Number.isSafeInteger(value.turns) && value.turns >= 0 ? value.turns : null,
    total_tokens: Number.isSafeInteger(value.total_tokens) && value.total_tokens >= 0 ? value.total_tokens : null,
    credits: typeof value.credits === "number" && Number.isFinite(value.credits) && value.credits >= 0 ? value.credits : null,
    credit_unknown_turns: Number.isSafeInteger(value.credit_unknown_turns) && value.credit_unknown_turns >= 0
      ? value.credit_unknown_turns
      : null
  };
  if (Object.values(parsed).some((entry) => entry === null) || parsed.credit_unknown_turns > parsed.turns) return null;
  return parsed;
}

function metricsEqual(left, right) {
  return left.turns === right.turns
    && left.total_tokens === right.total_tokens
    && left.credit_unknown_turns === right.credit_unknown_turns
    && Math.abs(left.credits - right.credits) <= CREDIT_TOLERANCE;
}

function sumMetrics(rows) {
  return rows.reduce((total, row) => ({
    turns: total.turns + row.turns,
    total_tokens: total.total_tokens + row.total_tokens,
    credits: total.credits + row.credits,
    credit_unknown_turns: total.credit_unknown_turns + row.credit_unknown_turns
  }), { turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 });
}

function rowComparator(idKey) {
  return (left, right) => (
    right.total_tokens - left.total_tokens
    || right.credits - left.credits
    || right.turns - left.turns
    || left[idKey].localeCompare(right[idKey], "en")
  );
}

function breakdown(value, idKey, topN, totals) {
  if (!hasExactKeys(value, BREAKDOWN_GROUP_KEYS) || !Array.isArray(value.top) || value.top.length > topN) return null;
  const seen = new Set();
  const top = [];
  for (const row of value.top) {
    if (!hasExactKeys(row, [idKey, ...METRIC_KEYS]) || typeof row[idKey] !== "string" || !SAFE_ID.test(row[idKey])) return null;
    if (seen.has(row[idKey])) return null;
    const parsed = metric(Object.fromEntries(METRIC_KEYS.map((key) => [key, row[key]])));
    if (!parsed) return null;
    seen.add(row[idKey]);
    top.push({ [idKey]: row[idKey], ...parsed });
  }
  if (JSON.stringify(top) !== JSON.stringify([...top].sort(rowComparator(idKey)))) return null;
  const other = metric(value.other);
  if (!other || (other.turns > 0 && top.length !== topN) || !metricsEqual(sumMetrics([...top, other]), totals)) return null;
  return { top, other };
}

function window(value, topN) {
  if (!hasExactKeys(value, WINDOW_KEYS)) return null;
  const startAt = normalizedTimestamp(value.start_at, true);
  const endAt = normalizedTimestamp(value.end_at, true);
  const totals = metric(value.totals);
  if (startAt === undefined || endAt === undefined || !totals || !hasExactKeys(value.breakdowns, BREAKDOWN_KEYS)) return null;
  const breakdowns = {};
  for (const [pluralKey, idKey] of DIMENSIONS) {
    const parsed = breakdown(value.breakdowns[pluralKey], idKey, topN, totals);
    if (!parsed) return null;
    breakdowns[pluralKey] = parsed;
  }
  return { start_at: startAt, end_at: endAt, totals, breakdowns };
}

function activity(value, allTimeTotals) {
  if (!hasExactKeys(value, ACTIVITY_KEYS) || !Array.isArray(value.daily) || !Array.isArray(value.hourly)) return null;
  if (value.daily.length < 1 || value.daily.length > MAX_DAILY_ROWS || value.hourly.length !== 24) return null;
  const daily = [];
  let priorDate = "";
  for (const row of value.daily) {
    if (!hasExactKeys(row, DAILY_ROW_KEYS) || typeof row.date !== "string" || !KST_DATE.test(row.date)) return null;
    if (row.date <= priorDate) return null;
    priorDate = row.date;
    const parsed = metric(Object.fromEntries(METRIC_KEYS.map((key) => [key, row[key]])));
    if (!parsed) return null;
    daily.push({ date: row.date, ...parsed });
  }
  let hourlyTurns = 0;
  let hourlyTokens = 0;
  const hourly = [];
  for (const [index, row] of value.hourly.entries()) {
    if (!hasExactKeys(row, HOURLY_ROW_KEYS) || row.hour !== index
      || !Number.isSafeInteger(row.turns) || row.turns < 0
      || !Number.isSafeInteger(row.total_tokens) || row.total_tokens < 0) return null;
    hourlyTurns += row.turns;
    hourlyTokens += row.total_tokens;
    hourly.push({ hour: index, turns: row.turns, total_tokens: row.total_tokens });
  }
  if (hourlyTurns !== allTimeTotals.turns || hourlyTokens !== allTimeTotals.total_tokens) return null;
  return { daily, hourly };
}

function rateLimit(value) {
  if (value === null) return { value: null };
  if (!hasExactKeys(value, RATE_LIMIT_KEYS)) return null;
  if (typeof value.limit_id !== "string" || !SAFE_ID.test(value.limit_id)) return null;
  if (value.plan_type !== null && (typeof value.plan_type !== "string" || !SAFE_ID.test(value.plan_type))) return null;
  if (typeof value.used_percent !== "number" || !Number.isFinite(value.used_percent)
    || value.used_percent < 0 || value.used_percent > 1000) return null;
  if (value.window_minutes !== null && (!Number.isSafeInteger(value.window_minutes) || value.window_minutes < 0)) return null;
  if (value.resets_at_epoch_s !== null && (!Number.isSafeInteger(value.resets_at_epoch_s) || value.resets_at_epoch_s < 0)) return null;
  const observedAt = normalizedTimestamp(value.observed_at);
  if (observedAt === undefined) return null;
  return {
    value: {
      limit_id: value.limit_id,
      plan_type: value.plan_type,
      used_percent: value.used_percent,
      window_minutes: value.window_minutes,
      resets_at_epoch_s: value.resets_at_epoch_s,
      observed_at: observedAt
    }
  };
}

function emptyClaudeEvidence() {
  return {
    provider: "claude",
    state: "UNKNOWN",
    reason: "provider_evidence_unknown",
    attempted_at: null,
    freshness_threshold_seconds: null,
    freshness: "unknown",
    evidence_scope: null,
    claim_scope: null,
    ledger_freshness_threshold_seconds: null,
    ledger_freshness: "unknown",
    turns: null,
    total_tokens: null,
    latest_usage_at: null,
    value_state: "masked"
  };
}

function providerRows(value, referenceAt) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const parsed = [];
  for (const row of value) {
    if (!hasExactKeys(row, PROVIDER_ROWS_KEYS)
      || !PROVIDER_ORDER.includes(row.provider)
      || !Number.isSafeInteger(row.turns) || row.turns < 1
      || !Number.isSafeInteger(row.total_tokens) || row.total_tokens < 0
      || seen.has(row.provider)) return null;
    const latestUsageAt = normalizedTimestamp(row.latest_usage_at);
    if (latestUsageAt === undefined || Date.parse(latestUsageAt) > Date.parse(referenceAt)) return null;
    seen.add(row.provider);
    parsed.push({
      provider: row.provider,
      turns: row.turns,
      total_tokens: row.total_tokens,
      latest_usage_at: latestUsageAt
    });
  }
  const sorted = [...parsed].sort((left, right) => (
    PROVIDER_ORDER.indexOf(left.provider) - PROVIDER_ORDER.indexOf(right.provider)
  ));
  return JSON.stringify(parsed) === JSON.stringify(sorted) ? parsed : null;
}

function collectionCounts(value) {
  if (!hasExactKeys(value, CLAUDE_COLLECTION_COUNT_KEYS)) return null;
  const counts = {};
  for (const key of CLAUDE_COLLECTION_COUNT_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return null;
    counts[key] = value[key];
  }
  if (counts.parsed_session_count > counts.session_file_count
    || counts.accepted_event_count > counts.observed_message_count) return null;
  return counts;
}

function collectionFreshness(attemptedAt, referenceAt, thresholdSeconds) {
  if (attemptedAt === null) return "unknown";
  const ageMs = Date.parse(referenceAt) - Date.parse(attemptedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  return ageMs > thresholdSeconds * 1_000 ? "stale" : "fresh";
}

function ledgerValueFreshness(latestUsageAt, referenceAt, thresholdSeconds) {
  const ageMs = Date.parse(referenceAt) - Date.parse(latestUsageAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  return ageMs > thresholdSeconds * 1_000 ? "stale" : "fresh";
}

function collectionCountsMatchState(state, counts) {
  if (state === "unknown" || state === "missing") {
    return CLAUDE_COLLECTION_COUNT_KEYS.every((key) => counts[key] === 0);
  }
  if (state === "observed") return counts.accepted_event_count > 0 && counts.issue_count === 0;
  if (state === "available_empty") return counts.accepted_event_count === 0 && counts.issue_count === 0;
  if (state === "partial") return counts.issue_count > 0 && (counts.parsed_session_count > 0 || counts.accepted_event_count > 0);
  return state === "error"
    && counts.issue_count > 0
    && counts.parsed_session_count === 0
    && counts.accepted_event_count === 0;
}

function claudeCollection(value, referenceAt) {
  if (!hasExactKeys(value, CLAUDE_COLLECTION_KEYS)
    || value.schema_version !== CLAUDE_COLLECTION_SCHEMA
    || !CLAUDE_COLLECTION_STATES.has(value.state)
    || !CLAUDE_COLLECTION_FRESHNESS.has(value.freshness)
    || !CLAUDE_COLLECTION_REASON_BY_STATE[value.state].has(value.reason)
    || value.evidence_scope !== CLAUDE_COLLECTION_EVIDENCE_SCOPE
    || value.claim_scope !== CLAUDE_COLLECTION_CLAIM_SCOPE
    || !Number.isSafeInteger(value.freshness_threshold_seconds)
    || value.freshness_threshold_seconds < 1
    || value.freshness_threshold_seconds > 604_800) return null;
  const attemptedAt = normalizedTimestamp(value.attempted_at, true);
  const counts = collectionCounts(value.counts);
  if (attemptedAt === undefined || counts === null || !collectionCountsMatchState(value.state, counts)) return null;
  if ((value.state === "unknown" && (attemptedAt !== null || value.freshness !== "unknown"))
    || (value.state !== "unknown" && attemptedAt === null)) return null;
  const freshness = collectionFreshness(attemptedAt, referenceAt, value.freshness_threshold_seconds);
  if (freshness !== value.freshness
    || (value.state !== "unknown" && freshness === "unknown")) return null;
  return {
    schema_version: CLAUDE_COLLECTION_SCHEMA,
    state: value.state,
    reason: value.reason,
    attempted_at: attemptedAt,
    freshness_threshold_seconds: value.freshness_threshold_seconds,
    freshness,
    counts,
    evidence_scope: CLAUDE_COLLECTION_EVIDENCE_SCOPE,
    claim_scope: CLAUDE_COLLECTION_CLAIM_SCOPE
  };
}

function claudeEvidence(rows, collection, referenceAt) {
  const claudeRow = rows.find((row) => row.provider === "claude") ?? null;
  const base = {
    provider: "claude",
    state: collection.state,
    reason: collection.reason,
    attempted_at: collection.attempted_at,
    freshness_threshold_seconds: collection.freshness_threshold_seconds,
    freshness: collection.freshness,
    evidence_scope: collection.evidence_scope,
    claim_scope: collection.claim_scope,
    ledger_freshness_threshold_seconds: collection.freshness_threshold_seconds,
    ledger_freshness: "unknown",
    turns: null,
    total_tokens: null,
    latest_usage_at: null,
    value_state: "masked"
  };
  if (claudeRow !== null) {
    const ledgerFreshness = ledgerValueFreshness(
      claudeRow.latest_usage_at,
      referenceAt,
      collection.freshness_threshold_seconds
    );
    if (ledgerFreshness === "unknown") return null;
    return {
      ...base,
      ledger_freshness: ledgerFreshness,
      turns: claudeRow.turns,
      total_tokens: claudeRow.total_tokens,
      latest_usage_at: claudeRow.latest_usage_at,
      value_state: ledgerFreshness === "fresh" ? "ledger_fresh" : "ledger_stale"
    };
  }
  if (collection.state === "available_empty" && collection.freshness === "fresh") {
    return { ...base, turns: 0, total_tokens: 0, value_state: "validated_empty" };
  }
  return base;
}

function invalidProjection() {
  return {
    state: "invalid",
    snapshot: createUnmeasuredAiUsageSnapshot(),
    reconciliation: null,
    history: null,
    refresh_state: "hold",
    provider_evidence: { claude: emptyClaudeEvidence() }
  };
}

function noHistoryProjection(current) {
  return {
    ...current,
    history: null,
    refresh_state: current.state === "ready" ? "ready" : "unmeasured",
    provider_evidence: { claude: emptyClaudeEvidence() }
  };
}

function normalizeHistorySnapshot(input) {
  const legacy = normalizeAiUsageSnapshot(input);
  if (legacy.state === "ready" || input === null || input === undefined) return noHistoryProjection(legacy);
  const isV2 = input?.schema_version === AI_USAGE_HISTORY_SNAPSHOT_V2_SCHEMA;
  const isV3 = input?.schema_version === AI_USAGE_HISTORY_SNAPSHOT_SCHEMA;
  const rootKeys = isV3 && Object.hasOwn(input ?? {}, "unmeasured_request_daily")
    ? V3_UNMEASURED_DAILY_ROOT_KEYS
    : isV3 && Object.hasOwn(input ?? {}, "model_daily")
      ? V3_DAILY_SERIES_ROOT_KEYS
      : isV3 && Object.hasOwn(input ?? {}, "provider_daily") ? V3_PROVIDER_DAILY_ROOT_KEYS : isV3 ? V3_ROOT_KEYS : V2_ROOT_KEYS;
  if ((!isV2 && !isV3) || !hasExactKeys(input, rootKeys) || hasForbiddenKey(input)) return invalidProjection();
  if (
    input.timezone !== AI_USAGE_HISTORY_TIMEZONE
    || !Number.isSafeInteger(input.top_n)
    || input.top_n < 1
    || input.top_n > 50
    || !hasExactKeys(input.windows, AI_USAGE_HISTORY_WINDOWS)
  ) return invalidProjection();

  const generatedAt = normalizedTimestamp(input.generated_at);
  const referenceAt = normalizedTimestamp(input.reference_at);
  const current = normalizeAiUsageSnapshot(input.current);
  if (generatedAt === undefined || referenceAt === undefined
    || Date.parse(generatedAt) > Date.parse(referenceAt)
    || current.state !== "ready" || current.snapshot.generated_at !== generatedAt) {
    return invalidProjection();
  }

  const windows = {};
  for (const name of AI_USAGE_HISTORY_WINDOWS) {
    const parsed = window(input.windows[name], input.top_n);
    if (!parsed) return invalidProjection();
    windows[name] = parsed;
  }
  const parsedActivity = activity(input.activity, windows.all_time.totals);
  if (!parsedActivity) return invalidProjection();
  const parsedRateLimit = rateLimit(input.rate_limit);
  if (!parsedRateLimit) return invalidProjection();
  const nestedTotals = current.snapshot.totals;
  if (
    nestedTotals.credits === null
    || !metricsEqual(windows.all_time.totals, {
      turns: nestedTotals.turns,
      total_tokens: nestedTotals.total_tokens,
      credits: nestedTotals.credits,
      credit_unknown_turns: nestedTotals.credit_unknown_turns
    })
  ) return invalidProjection();

  const history = {
    schema_version: input.schema_version,
    generated_at: generatedAt,
    timezone: AI_USAGE_HISTORY_TIMEZONE,
    reference_at: referenceAt,
    top_n: input.top_n,
    windows,
    activity: parsedActivity,
    rate_limit: parsedRateLimit.value
  };
  let providerEvidence = { claude: emptyClaudeEvidence() };
  if (isV3) {
    const rows = providerRows(input.provider_rows, referenceAt);
    const collection = claudeCollection(input.claude_collection, referenceAt);
    if (rows === null || collection === null) return invalidProjection();
    const evidence = claudeEvidence(rows, collection, referenceAt);
    if (evidence === null) return invalidProjection();
    history.provider_rows = rows;
    if (Object.hasOwn(input, "provider_daily")) {
      if (!Array.isArray(input.provider_daily) || input.provider_daily.length !== 30) return invalidProjection();
      const daily = input.provider_daily.map((row) => {
        if (!hasExactKeys(row, PROVIDER_DAILY_ROW_KEYS) || !KST_DATE.test(row.date)
          || !Array.isArray(row.providers) || row.providers.length !== PROVIDER_ORDER.length) return null;
        const providers = row.providers.map((entry, index) => (
          hasExactKeys(entry, PROVIDER_DAILY_VALUE_KEYS) && entry.provider === PROVIDER_ORDER[index]
            && (entry.total_tokens === null || (Number.isSafeInteger(entry.total_tokens) && entry.total_tokens >= 0))
            && Number.isSafeInteger(entry.token_unknown_turns) && entry.token_unknown_turns >= 0
            && (entry.credits === null || (typeof entry.credits === "number" && Number.isFinite(entry.credits) && entry.credits >= 0))
            && Number.isSafeInteger(entry.credit_unknown_turns) && entry.credit_unknown_turns >= 0
            ? { ...entry } : null
        ));
        return providers.some((entry) => entry === null) ? null : { date: row.date, providers };
      });
      if (daily.some((row) => row === null)) return invalidProjection();
      history.provider_daily = daily;
    }
    if (Object.hasOwn(input, "model_daily")) {
      if (!Array.isArray(input.model_daily) || input.model_daily.length !== 30) return invalidProjection();
      let priorDate = "";
      const daily = input.model_daily.map((row) => {
        if (!hasExactKeys(row, MODEL_DAILY_ROW_KEYS) || !KST_DATE.test(row.date) || row.date <= priorDate || !Array.isArray(row.models)) return null;
        priorDate = row.date;
        const seen = new Set();
        const models = row.models.map((entry) => {
          if (!hasExactKeys(entry, MODEL_DAILY_VALUE_KEYS) || typeof entry.model_id !== "string" || !SAFE_ID.test(entry.model_id)
            || seen.has(entry.model_id) || !Number.isSafeInteger(entry.turns) || entry.turns < 1
            || !Number.isSafeInteger(entry.total_tokens) || entry.total_tokens < 0
            || !Number.isSafeInteger(entry.token_unknown_turns) || entry.token_unknown_turns < 0
            || entry.token_unknown_turns > entry.turns) return null;
          seen.add(entry.model_id);
          return { ...entry };
        });
        return models.some((entry) => entry === null) ? null : { date: row.date, models };
      });
      if (daily.some((row) => row === null)) return invalidProjection();
      const activity = parsedActivity.daily.length >= 30 ? parsedActivity.daily.slice(-30) : null;
      if (activity !== null && daily.some((day, index) => day.date !== activity[index]?.date
        || day.models.reduce((sum, row) => sum + row.turns, 0) !== activity[index]?.turns
        || day.models.reduce((sum, row) => sum + row.total_tokens, 0) !== activity[index]?.total_tokens)) return invalidProjection();
      history.model_daily = daily;
    }
    if (Object.hasOwn(input, "unmeasured_request_daily")) {
      if (!Array.isArray(input.unmeasured_request_daily) || input.unmeasured_request_daily.length !== 30) return invalidProjection();
      let priorDate = "";
      const daily = input.unmeasured_request_daily.map((row) => {
        if (!hasExactKeys(row, UNMEASURED_REQUEST_DAILY_ROW_KEYS) || !KST_DATE.test(row.date) || row.date <= priorDate
          || !Number.isSafeInteger(row.total_requests) || row.total_requests < 0
          || !Array.isArray(row.families) || row.families.length !== UNMEASURED_REQUEST_FAMILY_IDS.length) return null;
        priorDate = row.date;
        let computedTotal = 0;
        const families = row.families.map((fam, famIndex) => {
          if (!hasExactKeys(fam, UNMEASURED_REQUEST_FAMILY_VALUE_KEYS)
            || fam.family_id !== UNMEASURED_REQUEST_FAMILY_IDS[famIndex]
            || !Number.isSafeInteger(fam.requests) || fam.requests < 0
            || !Array.isArray(fam.models)) return null;
          const seen = new Set();
          let famSum = 0;
          const models = fam.models.map((m) => {
            if (!hasExactKeys(m, UNMEASURED_REQUEST_MODEL_VALUE_KEYS)
              || typeof m.model_id !== "string" || !SAFE_ID.test(m.model_id) || seen.has(m.model_id)
              || !Number.isSafeInteger(m.requests) || m.requests < 1) return null;
            let mappedFamily = null;
            try {
              mappedFamily = antigravityQuotaFamilyForModel(m.model_id, { failClosed: true });
            } catch {
              return null;
            }
            if (mappedFamily !== fam.family_id) return null;
            seen.add(m.model_id);
            famSum += m.requests;
            return { model_id: m.model_id, requests: m.requests };
          });
          if (models.some((m) => m === null) || fam.requests !== famSum) return null;
          computedTotal += fam.requests;
          return { family_id: fam.family_id, requests: fam.requests, models };
        });
        if (families.some((f) => f === null) || row.total_requests !== computedTotal) return null;
        return { date: row.date, total_requests: row.total_requests, families };
      });
      if (daily.some((row) => row === null)) return invalidProjection();
      if (history.provider_daily) {
        for (const [index, day] of daily.entries()) {
          const agProvider = history.provider_daily[index]?.providers?.find((p) => p.provider === "antigravity");
          const agUnknown = agProvider?.token_unknown_turns ?? 0;
          if (day.total_requests !== agUnknown || day.date !== history.provider_daily[index]?.date) return invalidProjection();
        }
      }
      history.unmeasured_request_daily = daily;
    }
    history.claude_collection = collection;
    providerEvidence = { claude: evidence };
  }

  return {
    ...current,
    history,
    refresh_state: "ready",
    provider_evidence: providerEvidence
  };
}

export function normalizeAiUsageHistoryProjection(input) {
  if (hasExactKeys(input, READ_ONLY_ENVELOPE_KEYS)) {
    if (input.schema_version !== AI_USAGE_READ_ONLY_PROJECTION_SCHEMA || input.read_only !== 1) return invalidProjection();
    const projection = normalizeHistorySnapshot(input.snapshot);
    if (projection.state !== "ready") return invalidProjection();
    return { ...projection, refresh_state: "ready", read_only: 1 };
  }
  if (!hasExactKeys(input, ENVELOPE_KEYS)) return normalizeHistorySnapshot(input);
  if (input.schema_version !== AI_USAGE_PROJECTION_ENVELOPE_SCHEMA || !REFRESH_STATES.has(input.refresh_state)) {
    return invalidProjection();
  }
  if (input.snapshot === null) {
    if (input.refresh_state === "ready") return invalidProjection();
    return {
      state: "unmeasured",
      snapshot: createUnmeasuredAiUsageSnapshot(),
      reconciliation: null,
      history: null,
      refresh_state: input.refresh_state,
      provider_evidence: { claude: emptyClaudeEvidence() }
    };
  }
  const projection = normalizeHistorySnapshot(input.snapshot);
  if (projection.state !== "ready") return invalidProjection();
  return { ...projection, refresh_state: input.refresh_state };
}
