import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createBoardUsageSnapshot,
  filterBoardUsageEventsByThreadIds,
  loadBoardUsageSnapshot,
  validateBoardUsageSnapshot,
} from "./board_snapshot.mjs";
import { canonicalJson, loadPersistedUsageEvents } from "./usage_meter.mjs";

export const BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA = "soulforge.ai_usage_board_history_snapshot.v2";
export const BOARD_USAGE_HISTORY_TIMEZONE = "Asia/Seoul";
export const DEFAULT_BOARD_USAGE_HISTORY_TOP_N = 10;
export const MAX_BOARD_USAGE_HISTORY_TOP_N = 50;
export const BOARD_USAGE_HISTORY_ACTIVITY_DAILY_DAYS = 40;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
const FORBIDDEN_KEY = /(session|path|raw|private|secret|credential|cookie|prompt|reasoning|argument|output|body|source|title|message|tool)/iu;
const ROOT_KEYS = new Set([
  "schema_version",
  "generated_at",
  "timezone",
  "reference_at",
  "top_n",
  "current",
  "windows",
  "activity",
  "rate_limit",
]);
const WINDOW_NAMES = [
  "calendar_day",
  "calendar_week",
  "calendar_month",
  "rolling_24h",
  "rolling_7d",
  "rolling_30d",
  "all_time",
];
const WINDOW_KEYS = new Set(["start_at", "end_at", "totals", "breakdowns"]);
const BREAKDOWN_KEYS = new Set(["projects", "works", "tasks", "models"]);
const BREAKDOWN_GROUP_KEYS = new Set(["top", "other"]);
const METRIC_KEYS = new Set(["turns", "total_tokens", "credits", "credit_unknown_turns"]);
const DIMENSIONS = [
  ["projects", "project_id"],
  ["works", "work_id"],
  ["tasks", "task_id"],
  ["models", "model_id"],
];
const ACTIVITY_KEYS = new Set(["daily", "hourly"]);
const DAILY_ROW_KEYS = new Set(["date", ...METRIC_KEYS]);
const HOURLY_ROW_KEYS = new Set(["hour", "turns", "total_tokens"]);
const RATE_LIMIT_KEYS = new Set([
  "limit_id", "plan_type", "used_percent", "window_minutes", "resets_at_epoch_s", "observed_at",
]);
const KST_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return isRecord(value) && Object.keys(value).every((key) => keys.has(key));
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => (key !== "reasoning_effort" && FORBIDDEN_KEY.test(key)) || hasForbiddenKey(child),
  );
}

function normalizedTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail(code);
  return new Date(value).toISOString();
}

function nullableTimestamp(value, code) {
  return value === null ? null : normalizedTimestamp(value, code);
}

function strictCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function strictCredit(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(code);
  return value;
}

function rounded(value) {
  return Number(value.toFixed(12));
}

function emptyMetrics() {
  return {
    turns: 0,
    total_tokens: 0,
    credits: 0,
    credit_unknown_turns: 0,
  };
}

function publicMetrics(metrics) {
  return {
    turns: metrics.turns,
    total_tokens: metrics.total_tokens,
    credits: rounded(metrics.credits),
    credit_unknown_turns: metrics.credit_unknown_turns,
  };
}

function addMetrics(target, value) {
  target.turns += value.turns;
  target.total_tokens += value.total_tokens;
  target.credits += value.credits;
  target.credit_unknown_turns += value.credit_unknown_turns;
  return target;
}

function sumMetrics(rows) {
  return publicMetrics(rows.reduce((sum, row) => addMetrics(sum, row), emptyMetrics()));
}

function metricsEqual(left, right) {
  return left.turns === right.turns
    && left.total_tokens === right.total_tokens
    && left.credit_unknown_turns === right.credit_unknown_turns
    && Math.abs(left.credits - right.credits) <= 1e-9;
}

function parseMetrics(value, code) {
  if (!hasOnlyKeys(value, METRIC_KEYS)) fail(code);
  const parsed = {
    turns: strictCount(value.turns, code),
    total_tokens: strictCount(value.total_tokens, code),
    credits: strictCredit(value.credits, code),
    credit_unknown_turns: strictCount(value.credit_unknown_turns, code),
  };
  if (parsed.credit_unknown_turns > parsed.turns) fail(code);
  return publicMetrics(parsed);
}

function safeDimensionId(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return SAFE_ID.test(candidate) && !new Set(["unknown", "unassigned"]).has(candidate.toLowerCase())
    ? candidate
    : "unassigned";
}

function requiredDimensionId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value) || value.toLowerCase() === "unknown") fail(code);
  return value;
}

function normalizeTopN(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_BOARD_USAGE_HISTORY_TOP_N) {
    fail("board_usage_history_top_n_invalid");
  }
  return parsed;
}

function normalizeExactThreadIds(threadIds) {
  if (!Array.isArray(threadIds) || !threadIds.length) fail("board_usage_history_thread_ids_required");
  return [...new Set(threadIds.map((threadId) => {
    if (typeof threadId !== "string" || !SAFE_ID.test(threadId)) fail("board_usage_history_thread_ids_invalid");
    return threadId;
  }))].sort((left, right) => left.localeCompare(right, "en"));
}

function deduplicateEvents(events) {
  if (!Array.isArray(events)) fail("board_usage_history_events_invalid");
  const seen = new Map();
  const unique = [];
  for (const event of events) {
    if (!isRecord(event) || typeof event.event_id !== "string" || !EVENT_ID.test(event.event_id)) {
      fail("board_usage_history_event_id_invalid");
    }
    const serialized = canonicalJson(event);
    const prior = seen.get(event.event_id);
    if (prior === undefined) {
      seen.set(event.event_id, serialized);
      unique.push(event);
    } else if (prior !== serialized) {
      fail("board_usage_history_event_id_conflict");
    }
  }
  return unique;
}

function eventObservation(event) {
  const startedAt = normalizedTimestamp(event?.time?.started_at, "board_usage_history_event_time_invalid");
  const totalTokens = Number.isSafeInteger(event?.usage?.total_tokens) && event.usage.total_tokens >= 0
    ? event.usage.total_tokens
    : 0;
  const credit = typeof event?.credits?.total === "number"
    && Number.isFinite(event.credits.total)
    && event.credits.total >= 0
    ? event.credits.total
    : null;
  return {
    started_at: startedAt,
    project_id: safeDimensionId(event?.project_id),
    work_id: safeDimensionId(event?.work_id),
    task_id: safeDimensionId(event?.thread_id),
    model_id: safeDimensionId(event?.model?.id),
    metrics: {
      turns: 1,
      total_tokens: totalTokens,
      credits: credit ?? 0,
      credit_unknown_turns: credit === null ? 1 : 0,
    },
  };
}

function localKstParts(timestamp) {
  const local = new Date(Date.parse(timestamp) + KST_OFFSET_MS);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}

function kstMidnight(year, month, day) {
  return new Date(Date.UTC(year, month, day) - KST_OFFSET_MS).toISOString();
}

function addKstDays(timestamp, days) {
  const local = localKstParts(timestamp);
  const date = new Date(Date.UTC(local.year, local.month, local.day + days));
  return kstMidnight(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function calendarDayStart(referenceAt) {
  const local = localKstParts(referenceAt);
  return kstMidnight(local.year, local.month, local.day);
}

function calendarWeekStart(referenceAt) {
  const local = localKstParts(referenceAt);
  const mondayOffset = (local.weekday + 6) % 7;
  const date = new Date(Date.UTC(local.year, local.month, local.day - mondayOffset));
  return kstMidnight(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function calendarMonthStart(referenceAt) {
  const local = localKstParts(referenceAt);
  return kstMidnight(local.year, local.month, 1);
}

function nextKstMonthStart(referenceAt) {
  const local = localKstParts(referenceAt);
  return kstMidnight(local.year, local.month + 1, 1);
}

function kstDateKey(timestamp) {
  const local = localKstParts(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${local.year}-${pad(local.month + 1)}-${pad(local.day)}`;
}

function kstHour(timestamp) {
  return new Date(Date.parse(timestamp) + KST_OFFSET_MS).getUTCHours();
}

function activityDailyDates(referenceAt) {
  const dayStart = calendarDayStart(referenceAt);
  const dates = [];
  for (let offset = BOARD_USAGE_HISTORY_ACTIVITY_DAILY_DAYS - 1; offset >= 0; offset -= 1) {
    dates.push(kstDateKey(addKstDays(dayStart, -offset)));
  }
  return dates;
}

function buildActivity(observations, referenceAt) {
  const dates = activityDailyDates(referenceAt);
  const daily = new Map(dates.map((date) => [date, emptyMetrics()]));
  const hourly = Array.from({ length: 24 }, () => ({ turns: 0, total_tokens: 0 }));
  for (const observation of observations) {
    const dateKey = kstDateKey(observation.started_at);
    const bucket = daily.get(dateKey);
    if (bucket !== undefined) addMetrics(bucket, observation.metrics);
    const hourBucket = hourly[kstHour(observation.started_at)];
    hourBucket.turns += observation.metrics.turns;
    hourBucket.total_tokens += observation.metrics.total_tokens;
  }
  return {
    daily: dates.map((date) => ({ date, ...publicMetrics(daily.get(date)) })),
    hourly: hourly.map((bucket, hour) => ({ hour, turns: bucket.turns, total_tokens: bucket.total_tokens })),
  };
}

function sanitizedRateLimitId(value, fallback) {
  return typeof value === "string" && SAFE_ID.test(value) ? value : fallback;
}

function sanitizedRateLimitInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function latestRateLimit(events) {
  let candidate = null;
  for (const event of events) {
    const snapshot = event?.rate_limit_snapshot;
    if (!isRecord(snapshot)) continue;
    if (typeof snapshot.used_percent !== "number" || !Number.isFinite(snapshot.used_percent)) continue;
    const startedAt = event?.time?.started_at;
    if (typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))) continue;
    const eventId = typeof event?.event_id === "string" ? event.event_id : "";
    if (candidate !== null) {
      const order = Date.parse(startedAt) - Date.parse(candidate.started_at);
      if (order < 0 || (order === 0 && eventId.localeCompare(candidate.event_id, "en") <= 0)) continue;
    }
    candidate = { started_at: startedAt, event_id: eventId, snapshot };
  }
  if (candidate === null) return null;
  return {
    limit_id: sanitizedRateLimitId(candidate.snapshot.limit_id, "unknown"),
    plan_type: sanitizedRateLimitId(candidate.snapshot.plan_type, null),
    used_percent: rounded(Math.min(1000, Math.max(0, candidate.snapshot.used_percent))),
    window_minutes: sanitizedRateLimitInteger(candidate.snapshot.window_minutes),
    resets_at_epoch_s: sanitizedRateLimitInteger(candidate.snapshot.resets_at_epoch_s),
    observed_at: new Date(candidate.started_at).toISOString(),
  };
}

function windowDefinitions(referenceAt) {
  const day = calendarDayStart(referenceAt);
  const week = calendarWeekStart(referenceAt);
  const month = calendarMonthStart(referenceAt);
  const referenceMs = Date.parse(referenceAt);
  return [
    ["calendar_day", day, addKstDays(day, 1)],
    ["calendar_week", week, addKstDays(week, 7)],
    ["calendar_month", month, nextKstMonthStart(referenceAt)],
    ["rolling_24h", new Date(referenceMs - (24 * 60 * 60 * 1_000)).toISOString(), referenceAt],
    ["rolling_7d", new Date(referenceMs - (7 * 24 * 60 * 60 * 1_000)).toISOString(), referenceAt],
    ["rolling_30d", new Date(referenceMs - (30 * 24 * 60 * 60 * 1_000)).toISOString(), referenceAt],
    ["all_time", null, null],
  ];
}

function withinWindow(observation, startAt, endAt) {
  const at = Date.parse(observation.started_at);
  return (startAt === null || at >= Date.parse(startAt))
    && (endAt === null || at < Date.parse(endAt));
}

function rowFor(idKey, id) {
  return {
    [idKey]: id,
    ...emptyMetrics(),
  };
}

function sortRows(rows, idKey) {
  return [...rows].sort((left, right) => (
    right.total_tokens - left.total_tokens
    || right.credits - left.credits
    || right.turns - left.turns
    || left[idKey].localeCompare(right[idKey], "en")
  ));
}

function subtractMetrics(total, included) {
  const remaining = {
    turns: total.turns - included.turns,
    total_tokens: total.total_tokens - included.total_tokens,
    credits: total.credits - included.credits,
    credit_unknown_turns: total.credit_unknown_turns - included.credit_unknown_turns,
  };
  if (remaining.turns < 0 || remaining.total_tokens < 0 || remaining.credit_unknown_turns < 0
    || remaining.credits < -1e-9) fail("board_usage_history_breakdown_underflow");
  remaining.credits = Math.max(0, remaining.credits);
  return publicMetrics(remaining);
}

function dimensionBreakdown(observations, pluralKey, idKey, topN, totals) {
  const rows = new Map();
  for (const observation of observations) {
    const id = observation[idKey];
    const row = rows.get(id) ?? rowFor(idKey, id);
    addMetrics(row, observation.metrics);
    rows.set(id, row);
  }
  const sorted = sortRows([...rows.values()].map((row) => ({
    [idKey]: row[idKey],
    ...publicMetrics(row),
  })), idKey);
  const top = sorted.slice(0, topN);
  const other = subtractMetrics(totals, sumMetrics(top));
  return { top, other };
}

function buildWindow(observations, startAt, endAt, topN) {
  const selected = observations.filter((observation) => withinWindow(observation, startAt, endAt));
  const totals = sumMetrics(selected.map((observation) => observation.metrics));
  return {
    start_at: startAt,
    end_at: endAt,
    totals,
    breakdowns: Object.fromEntries(DIMENSIONS.map(([pluralKey, idKey]) => (
      [pluralKey, dimensionBreakdown(selected, pluralKey, idKey, topN, totals)]
    ))),
  };
}

function parseBreakdown(value, idKey, topN, totals) {
  if (!hasOnlyKeys(value, BREAKDOWN_GROUP_KEYS) || !Array.isArray(value.top)) {
    fail("board_usage_history_breakdown_invalid");
  }
  if (value.top.length > topN) fail("board_usage_history_breakdown_top_n_invalid");
  const seen = new Set();
  const top = value.top.map((row) => {
    if (!hasOnlyKeys(row, new Set([idKey, ...METRIC_KEYS]))) fail("board_usage_history_breakdown_row_invalid");
    const id = requiredDimensionId(row[idKey], "board_usage_history_breakdown_id_invalid");
    if (seen.has(id)) fail("board_usage_history_breakdown_duplicate_id");
    seen.add(id);
    return {
      [idKey]: id,
      ...parseMetrics(
        Object.fromEntries([...METRIC_KEYS].map((key) => [key, row[key]])),
        "board_usage_history_breakdown_metric_invalid",
      ),
    };
  });
  const sortedTop = sortRows(top, idKey);
  if (canonicalJson(top) !== canonicalJson(sortedTop)) fail("board_usage_history_breakdown_ranking_invalid");
  const other = parseMetrics(value.other, "board_usage_history_breakdown_other_invalid");
  if (other.turns > 0 && top.length !== topN) fail("board_usage_history_breakdown_top_n_invalid");
  if (!metricsEqual(sumMetrics([...top, other]), totals)) fail("board_usage_history_breakdown_reconciliation_invalid");
  return { top, other };
}

function parseWindow(value, expectedStartAt, expectedEndAt, topN) {
  if (!hasOnlyKeys(value, WINDOW_KEYS)) fail("board_usage_history_window_invalid");
  const startAt = nullableTimestamp(value.start_at, "board_usage_history_window_start_invalid");
  const endAt = nullableTimestamp(value.end_at, "board_usage_history_window_end_invalid");
  if (startAt !== expectedStartAt || endAt !== expectedEndAt) fail("board_usage_history_window_boundary_invalid");
  const totals = parseMetrics(value.totals, "board_usage_history_window_totals_invalid");
  if (!hasOnlyKeys(value.breakdowns, BREAKDOWN_KEYS)) fail("board_usage_history_window_breakdowns_invalid");
  const breakdowns = Object.fromEntries(DIMENSIONS.map(([pluralKey, idKey]) => (
    [pluralKey, parseBreakdown(value.breakdowns[pluralKey], idKey, topN, totals)]
  )));
  return { start_at: startAt, end_at: endAt, totals, breakdowns };
}

function parseActivity(value, referenceAt, windows) {
  if (!hasOnlyKeys(value, ACTIVITY_KEYS) || !Array.isArray(value.daily) || !Array.isArray(value.hourly)) {
    fail("board_usage_history_activity_invalid");
  }
  const expectedDates = activityDailyDates(referenceAt);
  if (value.daily.length !== expectedDates.length) fail("board_usage_history_activity_daily_invalid");
  const daily = value.daily.map((row, index) => {
    if (!hasOnlyKeys(row, DAILY_ROW_KEYS) || typeof row.date !== "string" || !KST_DATE.test(row.date)
      || row.date !== expectedDates[index]) {
      fail("board_usage_history_activity_daily_invalid");
    }
    return {
      date: row.date,
      ...parseMetrics(
        Object.fromEntries([...METRIC_KEYS].map((key) => [key, row[key]])),
        "board_usage_history_activity_daily_metric_invalid",
      ),
    };
  });
  if (!metricsEqual(daily[daily.length - 1], windows.calendar_day.totals)) {
    fail("board_usage_history_activity_daily_reconciliation_invalid");
  }
  const dailySum = sumMetrics(daily);
  const allTime = windows.all_time.totals;
  if (dailySum.turns > allTime.turns || dailySum.total_tokens > allTime.total_tokens
    || dailySum.credit_unknown_turns > allTime.credit_unknown_turns
    || dailySum.credits > allTime.credits + 1e-9) {
    fail("board_usage_history_activity_daily_reconciliation_invalid");
  }
  if (value.hourly.length !== 24) fail("board_usage_history_activity_hourly_invalid");
  let hourlyTurns = 0;
  let hourlyTokens = 0;
  const hourly = value.hourly.map((row, index) => {
    if (!hasOnlyKeys(row, HOURLY_ROW_KEYS) || row.hour !== index) fail("board_usage_history_activity_hourly_invalid");
    const turns = strictCount(row.turns, "board_usage_history_activity_hourly_invalid");
    const totalTokens = strictCount(row.total_tokens, "board_usage_history_activity_hourly_invalid");
    hourlyTurns += turns;
    hourlyTokens += totalTokens;
    return { hour: index, turns, total_tokens: totalTokens };
  });
  if (hourlyTurns !== allTime.turns || hourlyTokens !== allTime.total_tokens) {
    fail("board_usage_history_activity_hourly_reconciliation_invalid");
  }
  return { daily, hourly };
}

function parseRateLimit(value) {
  if (value === null) return null;
  if (!hasOnlyKeys(value, RATE_LIMIT_KEYS)) fail("board_usage_history_rate_limit_invalid");
  if (typeof value.limit_id !== "string" || !SAFE_ID.test(value.limit_id)) fail("board_usage_history_rate_limit_invalid");
  if (value.plan_type !== null && (typeof value.plan_type !== "string" || !SAFE_ID.test(value.plan_type))) {
    fail("board_usage_history_rate_limit_invalid");
  }
  if (typeof value.used_percent !== "number" || !Number.isFinite(value.used_percent)
    || value.used_percent < 0 || value.used_percent > 1000) {
    fail("board_usage_history_rate_limit_invalid");
  }
  if (value.window_minutes !== null && (!Number.isSafeInteger(value.window_minutes) || value.window_minutes < 0)) {
    fail("board_usage_history_rate_limit_invalid");
  }
  if (value.resets_at_epoch_s !== null && (!Number.isSafeInteger(value.resets_at_epoch_s) || value.resets_at_epoch_s < 0)) {
    fail("board_usage_history_rate_limit_invalid");
  }
  return {
    limit_id: value.limit_id,
    plan_type: value.plan_type,
    used_percent: rounded(value.used_percent),
    window_minutes: value.window_minutes,
    resets_at_epoch_s: value.resets_at_epoch_s,
    observed_at: normalizedTimestamp(value.observed_at, "board_usage_history_rate_limit_invalid"),
  };
}

export function validateBoardUsageHistorySnapshot(snapshot) {
  if (!hasOnlyKeys(snapshot, ROOT_KEYS) || hasForbiddenKey(snapshot)) {
    fail("board_usage_history_snapshot_invalid");
  }
  if (snapshot.schema_version !== BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA
    || snapshot.timezone !== BOARD_USAGE_HISTORY_TIMEZONE
    || !hasOnlyKeys(snapshot.windows, new Set(WINDOW_NAMES))) {
    fail("board_usage_history_snapshot_invalid");
  }
  const generatedAt = normalizedTimestamp(snapshot.generated_at, "board_usage_history_generated_at_invalid");
  const referenceAt = normalizedTimestamp(snapshot.reference_at, "board_usage_history_reference_at_invalid");
  const topN = normalizeTopN(snapshot.top_n);
  const current = validateBoardUsageSnapshot(snapshot.current);
  if (current.generated_at !== generatedAt) fail("board_usage_history_current_timestamp_invalid");
  const windows = Object.fromEntries(windowDefinitions(referenceAt).map(([name, startAt, endAt]) => (
    [name, parseWindow(snapshot.windows[name], startAt, endAt, topN)]
  )));
  if (!metricsEqual(windows.all_time.totals, current.totals)) {
    fail("board_usage_history_all_time_reconciliation_invalid");
  }
  const activity = parseActivity(snapshot.activity, referenceAt, windows);
  const rateLimit = parseRateLimit(snapshot.rate_limit);
  return {
    schema_version: BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    timezone: BOARD_USAGE_HISTORY_TIMEZONE,
    reference_at: referenceAt,
    top_n: topN,
    current,
    windows,
    activity,
    rate_limit: rateLimit,
  };
}

export function createBoardUsageHistorySnapshot(events, {
  coverage = null,
  hookHealth = null,
  pendingEventCount = null,
  toolEvents = [],
  currentSnapshot = null,
  generatedAt = new Date().toISOString(),
  referenceAt = generatedAt,
  topN = DEFAULT_BOARD_USAGE_HISTORY_TOP_N,
} = {}) {
  const normalizedGeneratedAt = normalizedTimestamp(generatedAt, "board_usage_history_generated_at_invalid");
  const normalizedReferenceAt = normalizedTimestamp(referenceAt, "board_usage_history_reference_at_invalid");
  const normalizedTopN = normalizeTopN(topN);
  const uniqueEvents = deduplicateEvents(events);
  const current = currentSnapshot === null
    ? createBoardUsageSnapshot(uniqueEvents, {
      coverage,
      hookHealth,
      pendingEventCount,
      toolEvents,
      generatedAt: normalizedGeneratedAt,
    })
    : validateBoardUsageSnapshot(currentSnapshot);
  const observations = uniqueEvents.map(eventObservation);
  const snapshot = {
    schema_version: BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
    generated_at: normalizedGeneratedAt,
    timezone: BOARD_USAGE_HISTORY_TIMEZONE,
    reference_at: normalizedReferenceAt,
    top_n: normalizedTopN,
    current,
    windows: Object.fromEntries(windowDefinitions(normalizedReferenceAt).map(([name, startAt, endAt]) => (
      [name, buildWindow(observations, startAt, endAt, normalizedTopN)]
    ))),
    activity: buildActivity(observations, normalizedReferenceAt),
    rate_limit: latestRateLimit(uniqueEvents),
  };
  return validateBoardUsageHistorySnapshot(snapshot);
}

export async function loadBoardUsageHistorySnapshot(stateRoot, {
  threadIds,
  generatedAt = new Date().toISOString(),
  referenceAt = generatedAt,
  topN = DEFAULT_BOARD_USAGE_HISTORY_TOP_N,
} = {}) {
  const root = path.resolve(stateRoot);
  const normalizedGeneratedAt = normalizedTimestamp(generatedAt, "board_usage_history_generated_at_invalid");
  const exactThreadIds = normalizeExactThreadIds(threadIds);
  const [allEvents, current] = await Promise.all([
    loadPersistedUsageEvents(root),
    loadBoardUsageSnapshot(root, { generatedAt: normalizedGeneratedAt, threadIds: exactThreadIds }),
  ]);
  const events = filterBoardUsageEventsByThreadIds(allEvents, exactThreadIds);
  return createBoardUsageHistorySnapshot(events, {
    currentSnapshot: current,
    generatedAt: normalizedGeneratedAt,
    referenceAt,
    topN,
  });
}

export async function writeBoardUsageHistorySnapshot(outputPath, snapshot) {
  const clean = validateBoardUsageHistorySnapshot(snapshot);
  const target = path.resolve(outputPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return clean;
}
