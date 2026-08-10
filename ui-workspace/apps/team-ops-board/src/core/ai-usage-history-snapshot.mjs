import {
  createUnmeasuredAiUsageSnapshot,
  normalizeAiUsageSnapshot
} from "./ai-usage-snapshot.mjs";

export const AI_USAGE_HISTORY_SNAPSHOT_SCHEMA = "soulforge.ai_usage_board_history_snapshot.v1";
export const AI_USAGE_HISTORY_TIMEZONE = "Asia/Seoul";
export const AI_USAGE_PROJECTION_ENVELOPE_SCHEMA = "soulforge.team_ops_board_ai_usage_projection.v1";
export const AI_USAGE_HISTORY_WINDOWS = Object.freeze([
  "calendar_day",
  "calendar_week",
  "calendar_month",
  "rolling_24h",
  "rolling_7d",
  "rolling_30d",
  "all_time"
]);

const ROOT_KEYS = ["schema_version", "generated_at", "timezone", "reference_at", "top_n", "current", "windows"];
const WINDOW_KEYS = ["start_at", "end_at", "totals", "breakdowns"];
const BREAKDOWN_KEYS = ["projects", "works", "tasks"];
const BREAKDOWN_GROUP_KEYS = ["top", "other"];
const METRIC_KEYS = ["turns", "total_tokens", "credits", "credit_unknown_turns"];
const DIMENSIONS = Object.freeze([
  ["projects", "project_id"],
  ["works", "work_id"],
  ["tasks", "task_id"]
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const FORBIDDEN_KEY = /(session|path|raw|private|secret|credential|cookie|prompt|reasoning|argument|output|body|source|title|message|tool)/iu;
const CREDIT_TOLERANCE = 1e-9;
const ENVELOPE_KEYS = ["schema_version", "refresh_state", "snapshot"];
const REFRESH_STATES = new Set(["ready", "refreshing", "hold", "unmeasured"]);

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
    ([key, child]) => (key !== "reasoning_effort" && FORBIDDEN_KEY.test(key)) || hasForbiddenKey(child)
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

function invalidProjection() {
  return {
    state: "invalid",
    snapshot: createUnmeasuredAiUsageSnapshot(),
    reconciliation: null,
    history: null,
    refresh_state: "hold"
  };
}

function noHistoryProjection(current) {
  return { ...current, history: null, refresh_state: current.state === "ready" ? "ready" : "unmeasured" };
}

function normalizeHistorySnapshot(input) {
  const legacy = normalizeAiUsageSnapshot(input);
  if (legacy.state === "ready" || input === null || input === undefined) return noHistoryProjection(legacy);
  if (!hasExactKeys(input, ROOT_KEYS) || hasForbiddenKey(input)) return invalidProjection();
  if (
    input.schema_version !== AI_USAGE_HISTORY_SNAPSHOT_SCHEMA
    || input.timezone !== AI_USAGE_HISTORY_TIMEZONE
    || !Number.isSafeInteger(input.top_n)
    || input.top_n < 1
    || input.top_n > 50
    || !hasExactKeys(input.windows, AI_USAGE_HISTORY_WINDOWS)
  ) return invalidProjection();

  const generatedAt = normalizedTimestamp(input.generated_at);
  const referenceAt = normalizedTimestamp(input.reference_at);
  const current = normalizeAiUsageSnapshot(input.current);
  if (generatedAt === undefined || referenceAt === undefined || current.state !== "ready" || current.snapshot.generated_at !== generatedAt) {
    return invalidProjection();
  }

  const windows = {};
  for (const name of AI_USAGE_HISTORY_WINDOWS) {
    const parsed = window(input.windows[name], input.top_n);
    if (!parsed) return invalidProjection();
    windows[name] = parsed;
  }
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

  return {
    ...current,
    history: {
      schema_version: AI_USAGE_HISTORY_SNAPSHOT_SCHEMA,
      generated_at: generatedAt,
      timezone: AI_USAGE_HISTORY_TIMEZONE,
      reference_at: referenceAt,
      top_n: input.top_n,
      windows
    },
    refresh_state: "ready"
  };
}

export function normalizeAiUsageHistoryProjection(input) {
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
      refresh_state: input.refresh_state
    };
  }
  const projection = normalizeHistorySnapshot(input.snapshot);
  if (projection.state !== "ready") return invalidProjection();
  return { ...projection, refresh_state: input.refresh_state };
}
