import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEvidenceEvents } from "./evidence_ledger.mjs";
import {
  USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND,
  loadPersistedUsageEvents,
} from "./usage_meter.mjs";

export const BOARD_SNAPSHOT_SCHEMA = "soulforge.ai_usage_board_snapshot.v1";

const ALLOWED_HOOK_STATUSES = new Set(["ok", "disabled", "hold", "deferred", "unknown"]);
const ALLOWED_COVERAGE_STATUSES = new Set(["unmeasured", "partial", "complete"]);
const FRESH_HOOK_HEALTH_MAX_AGE_MS = 15 * 60 * 1000;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const FORBIDDEN_KEY = /(session|path|raw|private|secret|credential|cookie|prompt|reasoning|argument|output|body)/iu;
const ROOT_KEYS = new Set([
  "schema_version",
  "generated_at",
  "health",
  "coverage",
  "totals",
  "roles",
  "model_effort",
  "activity",
]);
const HEALTH_KEYS = new Set(["hook_status", "pending_event_count"]);
const COVERAGE_KEYS = new Set([
  "status",
  "measured_turns",
  "total_turns",
  "issue_count",
  "unassigned_turns",
  "rate_unknown_turns",
]);
const TOTAL_KEYS = new Set(["turns", "total_tokens", "credits", "credit_unknown_turns"]);
const ROLE_KEYS = new Set(["role", "turns", "total_tokens", "credits", "credit_unknown_turns"]);
const MODEL_EFFORT_KEYS = new Set([
  "model",
  "reasoning_effort",
  "turns",
  "total_tokens",
  "credits",
  "credit_unknown_turns",
]);
const ACTIVITY_KEYS = new Set([
  "execution_turns",
  "coordination_turns",
  "review_turns",
  "fan_out_turns",
  "retry_count",
  "timeout_count",
]);
const PUBLIC_ROLE_LABELS = new Map([
  ["ceo", "CEO"],
  ["system_manager", "SYSTEM_manager"],
  ["system manager", "SYSTEM_manager"],
  ["manager", "manager"],
  ["responsibility_owner", "responsibility_owner"],
  ["responsibility owner", "responsibility_owner"],
  ["owner", "owner"],
  ["executor", "executor"],
  ["execution", "execution"],
  ["reviewer", "reviewer"],
  ["review", "review"],
  ["unassigned", "unassigned"],
]);
const PUBLIC_EFFORT_LABELS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
const PUBLIC_MODEL = /^gpt-\d+(?:\.\d+)*(?:-(?:sol|terra|codex|mini|pro|thinking|spark))*$/iu;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => (key !== "reasoning_effort" && FORBIDDEN_KEY.test(key)) || hasForbiddenKey(child),
  );
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeRole(value) {
  return PUBLIC_ROLE_LABELS.get(text(value).toLowerCase()) ?? "unassigned";
}

function safeModel(value) {
  const label = text(value).toLowerCase();
  return PUBLIC_MODEL.test(label) ? label : "UNKNOWN";
}

function safeEffort(value) {
  const label = text(value).toLowerCase();
  return PUBLIC_EFFORT_LABELS.has(label) ? label : "UNKNOWN";
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function strictCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function credit(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function strictCredit(value) {
  const parsed = credit(value);
  if (parsed === null) fail("board_snapshot_invalid");
  return parsed;
}

function rounded(value, decimals = 9) {
  return Number(value.toFixed(decimals));
}

function plusCredit(current, value) {
  return value === null ? current : rounded(current + value);
}

function knownCreditsMatch(left, right) {
  return Math.abs(left - right) <= 1e-9;
}

function classifyRole(role) {
  if (role === "reviewer" || role === "review") return "review";
  if (role === "executor" || role === "execution") return "execution";
  return "coordination";
}

function roleRow(key) {
  return {
    role: key,
    turns: 0,
    total_tokens: 0,
    credits: 0,
    credit_unknown_turns: 0,
  };
}

function modelRow(model, effort) {
  return {
    model,
    reasoning_effort: effort,
    turns: 0,
    total_tokens: 0,
    credits: 0,
    credit_unknown_turns: 0,
  };
}

function publicRow(row) {
  return {
    ...row,
    credits: rounded(row.credits),
  };
}

function sortRoleRows(rows) {
  return rows.sort((left, right) => right.total_tokens - left.total_tokens || left.role.localeCompare(right.role, "en"));
}

function sortModelRows(rows) {
  return rows.sort((left, right) => right.total_tokens - left.total_tokens
    || left.model.localeCompare(right.model, "en")
    || left.reasoning_effort.localeCompare(right.reasoning_effort, "en"));
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  fail("board_snapshot_event_invalid");
}

function deduplicateEvents(events) {
  const seen = new Map();
  const unique = [];
  for (const event of events) {
    if (!isRecord(event) || typeof event.event_id !== "string" || !EVENT_ID.test(event.event_id)) {
      fail("board_snapshot_event_id_invalid");
    }
    const identity = event.event_id;
    const serialized = canonicalJson(event);
    const previous = seen.get(identity);
    if (previous === undefined) {
      seen.set(identity, serialized);
      unique.push(event);
    } else if (previous !== serialized) {
      fail("board_snapshot_event_id_conflict");
    }
  }
  return unique;
}

export function filterBoardUsageEventsByThreadIds(events, threadIds = null) {
  if (threadIds === null || threadIds === undefined) return events;
  if (!Array.isArray(events) || !Array.isArray(threadIds)) fail("board_snapshot_thread_ids_invalid");
  const accepted = new Set(threadIds.map((threadId) => {
    if (typeof threadId !== "string" || !SAFE_ID.test(threadId)) fail("board_snapshot_thread_ids_invalid");
    return threadId;
  }));
  return events.filter((event) => accepted.has(event?.thread_id));
}

function normalizeIncludeProviders(includeProviders) {
  if (includeProviders === null || includeProviders === undefined) return null;
  if (!Array.isArray(includeProviders) || !includeProviders.length) {
    fail("board_snapshot_include_providers_invalid");
  }
  return new Set(includeProviders.map((kind) => {
    if (typeof kind !== "string" || !Object.hasOwn(USAGE_EVENT_TOKEN_CONFIDENCE_BY_SOURCE_KIND, kind)) {
      fail("board_snapshot_include_providers_invalid");
    }
    return kind;
  }));
}

// 최종 집합 = (exact thread ID로 필터한 이벤트, 기존 동작 그대로)
//            ∪ (source.kind가 includeProviders에 속한 모든 이벤트).
// includeProviders를 주지 않으면 기존 동작과 완전히 동일하다.
export function filterBoardUsageEvents(events, { threadIds = null, includeProviders = null } = {}) {
  const providers = normalizeIncludeProviders(includeProviders);
  const base = filterBoardUsageEventsByThreadIds(events, threadIds);
  if (providers === null) return base;
  if (!Array.isArray(events)) fail("board_snapshot_include_providers_invalid");
  const selected = new Set(base);
  const merged = [...base];
  for (const event of events) {
    if (selected.has(event)) continue;
    if (providers.has(event?.source?.kind)) {
      selected.add(event);
      merged.push(event);
    }
  }
  return merged;
}

function isAssigned(value) {
  const normalized = text(value).toLowerCase();
  return normalized.length > 0 && normalized !== "unassigned" && normalized !== "unknown";
}

function lifecycleMeasurementsComplete(events) {
  return events.length > 0 && events.every((event) => event?.measurement?.status === "complete");
}

function hasFreshHealthyHook(hookHealth, generatedAt) {
  if (hookHealth?.status !== "ok" || generatedAt === null) return false;
  const observedAt = typeof hookHealth.observed_at === "string" ? Date.parse(hookHealth.observed_at) : NaN;
  const snapshotAt = Date.parse(generatedAt);
  return Number.isFinite(observedAt)
    && Number.isFinite(snapshotAt)
    && observedAt <= snapshotAt
    && snapshotAt - observedAt <= FRESH_HOOK_HEALTH_MAX_AGE_MS;
}

function coverageProjection(coverage, measuredTurns, unassignedTurns, rateUnknownTurns, {
  events,
  hookHealth,
  pendingEventCount,
  generatedAt,
}) {
  const declaredTotalTurns = strictCount(coverage?.unique_event_count);
  const issueCount = strictCount(coverage?.issue_count);
  const pending = strictCount(pendingEventCount);
  const totalTurns = Math.max(declaredTotalTurns ?? measuredTurns, measuredTurns);
  const complete = measuredTurns > 0
    && coverage?.scope === "full_sessions_root"
    && declaredTotalTurns !== null
    && issueCount === 0
    && declaredTotalTurns === measuredTurns
    && lifecycleMeasurementsComplete(events)
    && pending === 0
    && hasFreshHealthyHook(hookHealth, generatedAt);
  return {
    status: complete ? "complete" : measuredTurns > 0 ? "partial" : "unmeasured",
    measured_turns: measuredTurns,
    total_turns: totalTurns,
    issue_count: issueCount ?? 0,
    unassigned_turns: unassignedTurns,
    rate_unknown_turns: rateUnknownTurns,
  };
}

async function readJsonOrNull(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function countJsonFiles(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await countJsonFiles(target);
    else if (entry.isFile() && entry.name.endsWith(".json")) total += 1;
  }
  return total;
}

function activityFromToolEvents(toolEvents) {
  return toolEvents.reduce((activity, event) => ({
    ...activity,
    retry_count: activity.retry_count + Math.max(
      event.retry_reason_code === null ? 0 : 1,
      Math.max(0, count(event.attempt) - 1),
    ),
    timeout_count: activity.timeout_count + (event.timeout === true ? 1 : 0),
  }), {
    retry_count: 0,
    timeout_count: 0,
  });
}

export function createBoardUsageSnapshot(events, {
  coverage = null,
  hookHealth = null,
  pendingEventCount = null,
  toolEvents = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!Array.isArray(events) || !Array.isArray(toolEvents)) fail("board_snapshot_input_invalid");
  const uniqueEvents = deduplicateEvents(events);
  const roles = new Map();
  const modelEffort = new Map();
  const totals = {
    turns: 0,
    total_tokens: 0,
    credits: 0,
    credit_unknown_turns: 0,
  };
  const activity = {
    execution_turns: 0,
    coordination_turns: 0,
    review_turns: 0,
    fan_out_turns: 0,
    ...activityFromToolEvents(toolEvents),
  };
  let unassignedTurns = 0;

  for (const event of uniqueEvents) {
    const role = safeRole(event?.actor?.role);
    const model = safeModel(event?.model?.id);
    const effort = safeEffort(event?.model?.reasoning_effort);
    const tokenCount = count(event?.usage?.total_tokens);
    const eventCredit = credit(event?.credits?.total);
    const roleValue = roles.get(role) ?? roleRow(role);
    const modelKey = `${model}\u0000${effort}`;
    const modelValue = modelEffort.get(modelKey) ?? modelRow(model, effort);

    totals.turns += 1;
    totals.total_tokens += tokenCount;
    totals.credits = plusCredit(totals.credits, eventCredit);
    if (eventCredit === null) totals.credit_unknown_turns += 1;

    roleValue.turns += 1;
    roleValue.total_tokens += tokenCount;
    roleValue.credits = plusCredit(roleValue.credits, eventCredit);
    if (eventCredit === null) roleValue.credit_unknown_turns += 1;
    roles.set(role, roleValue);

    modelValue.turns += 1;
    modelValue.total_tokens += tokenCount;
    modelValue.credits = plusCredit(modelValue.credits, eventCredit);
    if (eventCredit === null) modelValue.credit_unknown_turns += 1;
    modelEffort.set(modelKey, modelValue);

    activity[`${classifyRole(role)}_turns`] += 1;
    if (event?.parent_thread_id !== null && event?.parent_thread_id !== undefined) activity.fan_out_turns += 1;
    if (!isAssigned(event?.work_id) || !isAssigned(event?.project_id) || !isAssigned(event?.team_id) || role === "unassigned") {
      unassignedTurns += 1;
    }
  }

  const safeHealthStatus = ALLOWED_HOOK_STATUSES.has(hookHealth?.status)
    ? hookHealth.status
    : "unknown";
  const normalizedGeneratedAt = typeof generatedAt === "string" && Number.isFinite(Date.parse(generatedAt))
    ? new Date(generatedAt).toISOString()
    : null;
  const output = {
    schema_version: BOARD_SNAPSHOT_SCHEMA,
    generated_at: normalizedGeneratedAt,
    health: {
      hook_status: safeHealthStatus,
      pending_event_count: count(pendingEventCount),
    },
    coverage: coverageProjection(coverage, totals.turns, unassignedTurns, totals.credit_unknown_turns, {
      events: uniqueEvents,
      hookHealth,
      pendingEventCount,
      generatedAt: normalizedGeneratedAt,
    }),
    totals: {
      ...totals,
      credits: rounded(totals.credits),
    },
    roles: sortRoleRows([...roles.values()].map(publicRow)),
    model_effort: sortModelRows([...modelEffort.values()].map(publicRow)),
    activity,
  };
  return validateBoardUsageSnapshot(output);
}

function parseGeneratedAt(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("board_snapshot_invalid");
  return new Date(value).toISOString();
}

function parseMetricRow(value, allowed, labels) {
  if (!hasOnlyKeys(value, allowed)) fail("board_snapshot_invalid");
  const turns = strictCount(value.turns);
  const totalTokens = strictCount(value.total_tokens);
  const creditUnknownTurns = strictCount(value.credit_unknown_turns);
  if (turns === null || totalTokens === null || creditUnknownTurns === null || creditUnknownTurns > turns) {
    fail("board_snapshot_invalid");
  }
  return {
    ...labels(value),
    turns,
    total_tokens: totalTokens,
    credits: strictCredit(value.credits),
    credit_unknown_turns: creditUnknownTurns,
  };
}

function mergeRows(rows, keyFor, makeRow) {
  const merged = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const target = merged.get(key) ?? makeRow(row);
    target.turns += row.turns;
    target.total_tokens += row.total_tokens;
    target.credits += row.credits;
    target.credit_unknown_turns += row.credit_unknown_turns;
    merged.set(key, target);
  }
  return [...merged.values()].map(publicRow);
}

function sumRows(rows) {
  return rows.reduce((sum, row) => ({
    turns: sum.turns + row.turns,
    total_tokens: sum.total_tokens + row.total_tokens,
    credits: sum.credits + row.credits,
    credit_unknown_turns: sum.credit_unknown_turns + row.credit_unknown_turns,
  }), { turns: 0, total_tokens: 0, credits: 0, credit_unknown_turns: 0 });
}

export function validateBoardUsageSnapshot(snapshot) {
  if (!isRecord(snapshot) || hasForbiddenKey(snapshot) || !hasOnlyKeys(snapshot, ROOT_KEYS)) {
    fail("board_snapshot_invalid");
  }
  if (
    snapshot.schema_version !== BOARD_SNAPSHOT_SCHEMA
    || !hasOnlyKeys(snapshot.health, HEALTH_KEYS)
    || !hasOnlyKeys(snapshot.coverage, COVERAGE_KEYS)
    || !hasOnlyKeys(snapshot.totals, TOTAL_KEYS)
    || !hasOnlyKeys(snapshot.activity, ACTIVITY_KEYS)
    || !Array.isArray(snapshot.roles)
    || !Array.isArray(snapshot.model_effort)
  ) {
    fail("board_snapshot_invalid");
  }
  const turns = strictCount(snapshot.totals.turns);
  const totalTokens = strictCount(snapshot.totals.total_tokens);
  const totalCredits = strictCredit(snapshot.totals.credits);
  const totalCreditUnknown = strictCount(snapshot.totals.credit_unknown_turns);
  const measuredTurns = strictCount(snapshot.coverage.measured_turns);
  const coverageTotalTurns = strictCount(snapshot.coverage.total_turns);
  const issueCount = strictCount(snapshot.coverage.issue_count);
  const unassignedTurns = strictCount(snapshot.coverage.unassigned_turns);
  const rateUnknownTurns = strictCount(snapshot.coverage.rate_unknown_turns);
  const pendingEventCount = strictCount(snapshot.health.pending_event_count);
  const activity = Object.fromEntries(
    [...ACTIVITY_KEYS].map((key) => [key, strictCount(snapshot.activity[key])]),
  );
  if (
    turns === null || totalTokens === null || totalCreditUnknown === null
    || measuredTurns === null || coverageTotalTurns === null || issueCount === null
    || unassignedTurns === null || rateUnknownTurns === null || pendingEventCount === null
    || Object.values(activity).some((value) => value === null)
    || !ALLOWED_HOOK_STATUSES.has(snapshot.health.hook_status)
    || !ALLOWED_COVERAGE_STATUSES.has(snapshot.coverage.status)
    || measuredTurns !== turns
    || measuredTurns > coverageTotalTurns
    || unassignedTurns > measuredTurns
    || rateUnknownTurns !== totalCreditUnknown
    || rateUnknownTurns > measuredTurns
    || totalCreditUnknown > turns
    || activity.execution_turns + activity.coordination_turns + activity.review_turns !== turns
    || activity.fan_out_turns > turns
    || (snapshot.coverage.status === "complete" && (
      measuredTurns !== coverageTotalTurns
      || issueCount !== 0
      || snapshot.health.hook_status !== "ok"
      || pendingEventCount !== 0
    ))
  ) {
    fail("board_snapshot_invalid");
  }
  const parsedRoles = snapshot.roles.map((row) => parseMetricRow(row, ROLE_KEYS, (entry) => ({
    role: safeRole(entry.role),
  })));
  const parsedModelEffort = snapshot.model_effort.map((row) => parseMetricRow(row, MODEL_EFFORT_KEYS, (entry) => ({
    model: safeModel(entry.model),
    reasoning_effort: safeEffort(entry.reasoning_effort),
  })));
  const roles = sortRoleRows(mergeRows(parsedRoles, (row) => row.role, (row) => roleRow(row.role)));
  const modelEffort = sortModelRows(mergeRows(
    parsedModelEffort,
    (row) => `${row.model}\u0000${row.reasoning_effort}`,
    (row) => modelRow(row.model, row.reasoning_effort),
  ));
  const roleTotals = sumRows(roles);
  const modelTotals = sumRows(modelEffort);
  if (
    roleTotals.turns !== turns
    || modelTotals.turns !== turns
    || roleTotals.total_tokens !== totalTokens
    || modelTotals.total_tokens !== totalTokens
    || roleTotals.credit_unknown_turns !== totalCreditUnknown
    || modelTotals.credit_unknown_turns !== totalCreditUnknown
    || !knownCreditsMatch(roleTotals.credits, totalCredits)
    || !knownCreditsMatch(modelTotals.credits, totalCredits)
  ) {
    fail("board_snapshot_invalid");
  }
  const sanitizedRoleUnassignedTurns = roles
    .filter((row) => row.role === "unassigned")
    .reduce((total, row) => total + row.turns, 0);
  const finalUnassignedTurns = Math.max(unassignedTurns, sanitizedRoleUnassignedTurns);
  if (finalUnassignedTurns > measuredTurns) fail("board_snapshot_invalid");
  return {
    schema_version: BOARD_SNAPSHOT_SCHEMA,
    generated_at: parseGeneratedAt(snapshot.generated_at),
    health: {
      hook_status: snapshot.health.hook_status,
      pending_event_count: pendingEventCount,
    },
    coverage: {
      status: snapshot.coverage.status,
      measured_turns: measuredTurns,
      total_turns: coverageTotalTurns,
      issue_count: issueCount,
      unassigned_turns: finalUnassignedTurns,
      rate_unknown_turns: rateUnknownTurns,
    },
    totals: {
      turns,
      total_tokens: totalTokens,
      credits: rounded(totalCredits),
      credit_unknown_turns: totalCreditUnknown,
    },
    roles,
    model_effort: modelEffort,
    activity,
  };
}

export async function loadBoardUsageSnapshot(stateRoot, {
  generatedAt,
  threadIds = null,
  includeProviders = null,
} = {}) {
  const root = path.resolve(stateRoot);
  const [events, coverage, hookHealth, toolEvents, pendingEventCount] = await Promise.all([
    loadPersistedUsageEvents(root),
    readJsonOrNull(path.join(root, "coverage", "latest.json")),
    readJsonOrNull(path.join(root, "health", "latest.json")),
    loadEvidenceEvents(root, "tool_event"),
    countJsonFiles(path.join(root, "pending")),
  ]);
  const scoped = threadIds !== null && threadIds !== undefined;
  return createBoardUsageSnapshot(filterBoardUsageEvents(events, { threadIds, includeProviders }), {
    coverage: scoped ? null : coverage,
    hookHealth,
    pendingEventCount: scoped ? 0 : pendingEventCount,
    toolEvents: scoped ? [] : toolEvents,
    generatedAt,
  });
}

export async function writeBoardUsageSnapshot(outputPath, snapshot) {
  const clean = validateBoardUsageSnapshot(snapshot);
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
