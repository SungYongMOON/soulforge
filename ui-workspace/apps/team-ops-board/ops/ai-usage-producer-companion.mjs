import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { classifyBoundedHistory, planBoundedHistoryAppend } from "../src/core/bounded-observability-history.mjs";
import { findCodexSessionFiles } from "../../../../guild_hall/ai_usage_meter/usage_meter.mjs";

const execFileAsync = promisify(execFile);
export const DEFAULT_USAGE_PRODUCER_INTERVAL_MS = 5 * 60 * 1_000;
export const ACTIVE_CODEX_SESSION_MAX_AGE_MS = 15 * 60 * 1_000;
// A collector child had no bound at all, so one wedged process could hold the
// sweep's single-flight forever and every lane would silently stop aging.
//
// The bound is deliberately not tight: the Codex lane has been observed taking
// ~78s live, so a 90s bound would kill healthy work. 180s leaves real headroom
// over that observation while still terminating a wedged child.
//
// A slow sweep may therefore outrun the five-minute interval and skip one
// overlapping tick, which is correct and self-correcting: trigger() simply
// returns the in-flight sweep. What cannot happen is a permanent wedge, because
// every child is bounded, so the sweep always terminates and always releases
// single-flight for the next interval.
export const DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS = 180 * 1_000;
export const USAGE_PRODUCER_CYCLE_SCHEMA = "soulforge.ai_usage_producer_cycle.v1";
export const USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA = "soulforge.ai_usage_producer_cycle_history.v1";
export const USAGE_PRODUCER_CYCLE_HISTORY_LIMIT = 50;
// A bounded read to match the bounded write: the history is read back on every
// cycle, so an oversized, symlinked, or non-regular entry is refused before any
// byte is parsed. 50 cycle rows with eight lanes each sit well under this.
export const USAGE_PRODUCER_CYCLE_MAX_BYTES = 128 * 1024;
export const USAGE_PRODUCER_RECOVERY_SCHEMA = "soulforge.ai_usage_producer_recovery.v1";
export const USAGE_PRODUCER_RECOVERY_HISTORY_SCHEMA = "soulforge.ai_usage_producer_recovery_history.v1";
export const USAGE_PRODUCER_RECOVERY_HISTORY_LIMIT = 50;
export const USAGE_PRODUCER_RECOVERY_MAX_BYTES = 128 * 1024;
export const MAX_CONSECUTIVE_RECOVERY_ATTEMPTS = 3;
export const SAFE_REPAIR_ISSUE_CODES = Object.freeze(["usage_event_duplicate_conflict", "usage_event_conflict"]);
// Fixed lane vocabulary. A cycle receipt names lanes only from this list, so it
// can never grow a path, command line, session id, or provider payload.
export const USAGE_PRODUCER_LANES = Object.freeze([
  "lifecycle",
  "codex",
  "claude",
  "antigravity",
  "meter",
  "store_usage_ledger",
  "watchtower",
  "active_sessions",
]);
export const USAGE_PRODUCER_LANE_STATUSES = Object.freeze(["ok", "error", "skipped"]);

const SAFE_THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u;
const HEARTBEAT_SCHEMA = "soulforge.ai_usage_producer_heartbeat.v1";
const ANTIGRAVITY_RESULT_SCHEMA = "soulforge.ai_usage_meter_collect_antigravity_result.v1";
export const CODEX_COLLECT_RESULT_SCHEMA = "soulforge.ai_usage_meter_collect_result.v1";

const EXACT_COLLECT_ROOT_KEYS = Object.freeze([
  "schema_version",
  "mode",
  "session_file_count",
  "parsed_session_count",
  "issue_count",
  "issues",
  "observed_event_count",
  "duplicate_event_observation_count",
  "event_count",
  "summary",
  "persistence",
  "coverage",
]);

const EXACT_SUMMARY_ROOT_KEYS = Object.freeze([
  "schema_version",
  "totals",
  "by_organization",
  "by_team",
  "by_project",
  "by_work",
  "by_model",
  "by_agent",
  "by_node",
  "by_role",
  "by_reasoning_effort",
  "by_attribution",
  "by_measurement",
]);

const SUMMARY_ARRAY_FIELDS = Object.freeze([
  "by_organization",
  "by_team",
  "by_project",
  "by_work",
  "by_model",
  "by_agent",
  "by_node",
  "by_role",
  "by_reasoning_effort",
  "by_attribution",
  "by_measurement",
]);

function failCollect(code = "collector_result_invalid") {
  throw Object.assign(new Error(code), { code });
}

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function assertExactKeys(obj, expectedKeys) {
  if (!isPlainObject(obj)) failCollect();
  const keys = Object.keys(obj);
  if (keys.length !== expectedKeys.length || !expectedKeys.every((k) => Object.hasOwn(obj, k))) {
    failCollect();
  }
}

function assertNonNegativeInt(val) {
  if (!Number.isSafeInteger(val) || val < 0) failCollect();
  return val;
}

function isSafeSourceRef(ref) {
  return typeof ref === "string"
    && ref.length >= 1
    && ref.length <= 240
    && /^[\x20-\x7e]+$/u.test(ref)
    && !ref.includes("\\")
    && !/^[a-zA-Z]:/u.test(ref)
    && !ref.startsWith("/")
    && !ref.includes("..")
    && !/(?:^|\/)\.(?:\/|$)/u.test(ref)
    && !ref.includes("@")
    && !/(?:bearer|token|password|passwd|secret|api_key|credential)/iu.test(ref);
}

export function validateCodexCollectionResult(result) {
  let value;
  try {
    value = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    failCollect();
  }

  assertExactKeys(value, EXACT_COLLECT_ROOT_KEYS);

  if (value.schema_version !== CODEX_COLLECT_RESULT_SCHEMA || value.mode !== "apply") {
    failCollect();
  }

  const sessionFileCount = assertNonNegativeInt(value.session_file_count);
  const parsedSessionCount = assertNonNegativeInt(value.parsed_session_count);
  const issueCount = assertNonNegativeInt(value.issue_count);
  const observedEventCount = assertNonNegativeInt(value.observed_event_count);
  assertNonNegativeInt(value.duplicate_event_observation_count);
  const eventCount = assertNonNegativeInt(value.event_count);

  if (parsedSessionCount > sessionFileCount || eventCount > observedEventCount) {
    failCollect();
  }

  if (!Array.isArray(value.issues) || value.issues.length !== issueCount || value.issues.length > 10000) {
    failCollect();
  }

  for (const issue of value.issues) {
    assertExactKeys(issue, ["source_ref", "code"]);
    if (typeof issue.code !== "string" || !SAFE_ERROR_CODE.test(issue.code) || !isSafeSourceRef(issue.source_ref)) {
      failCollect();
    }
  }

  const summary = value.summary;
  assertExactKeys(summary, EXACT_SUMMARY_ROOT_KEYS);
  if (summary.schema_version !== "soulforge.ai_usage_summary.v1" || !isPlainObject(summary.totals)) {
    failCollect();
  }
  if (assertNonNegativeInt(summary.totals.turns) !== eventCount) {
    failCollect();
  }
  for (const field of SUMMARY_ARRAY_FIELDS) {
    if (!Array.isArray(summary[field])) failCollect();
  }

  if (value.persistence !== null && !isPlainObject(value.persistence)) failCollect();
  if (value.coverage !== null && !isPlainObject(value.coverage)) failCollect();

  return value;
}

function validateAntigravityCollectionResult(result) {
  let value;
  try {
    value = JSON.parse(String(result?.stdout ?? ""));
  } catch {
    failCollect("antigravity_result_invalid");
  }
  if (value?.schema_version !== ANTIGRAVITY_RESULT_SCHEMA
    || value?.mode !== "apply"
    || !Number.isSafeInteger(value?.conversation_db_count)
    || value.conversation_db_count < 0
    || !Number.isSafeInteger(value?.issue_count)
    || value.issue_count < 0
    || !Number.isSafeInteger(value?.event_count)
    || value.event_count < 0) {
    failCollect("antigravity_result_invalid");
  }
  if (value.issue_count > 0) {
    failCollect("antigravity_collection_partial");
  }
  return value;
}

function safeErrorCode(error) {
  // A timeout kill is checked before anything else: the child was terminated by
  // us, so whatever it managed to print is not the reason it failed.
  if (error?.killed === true) return "collector_timeout";
  try {
    const childError = JSON.parse(String(error?.stderr ?? ""))?.error;
    if (typeof childError === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/u.test(childError)) return childError;
  } catch {}
  const code = error?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_.:-]{1,80}$/u.test(code)) return code;
  if (Number.isSafeInteger(code) && code >= 0 && code <= 255) return `collector_exit_${code}`;
  return "collector_failed";
}

// A lane receipt channel is independent from the sweep. A failed write must not
// abort the remaining lanes or escape as a process-level rejection, so the lane
// simply stays at its prior value and ages out fail-closed.
async function persistLaneHealth(persistHeartbeat, options) {
  try {
    await persistHeartbeat(options);
  } catch {
    // Intentionally contained; only sanitized codes are ever persisted.
  }
}

// The companion runs inside the Board runtime, which deliberately exits on an
// unhandled rejection. Every collector failure must therefore terminate here as
// a fail-closed hold carrying only a sanitized code, never raw error text.
export function containSweepFailure(runSweep) {
  return Promise.resolve()
    .then(runSweep)
    .catch((error) => ({ status: "hold", error_code: safeErrorCode(error) }));
}

async function readHeartbeat(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return value?.schema_version === HEARTBEAT_SCHEMA ? value : null;
  } catch { return null; }
}

async function writeHeartbeat(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function persistProducerHeartbeat({
  stateRoot,
  lane,
  attemptedAt,
  succeeded,
  errorCode = null,
  activity = null,
  projectionAt = null,
  retryState = null,
  backlogCount = null,
  attemptNumber = null,
  safeIssueCodes = null,
  nextAttemptAt = null,
  now = () => new Date(),
} = {}) {
  const file = path.join(stateRoot, "producer_health", `${lane}.json`);
  const prior = await readHeartbeat(file);
  const completedAt = now().toISOString();
  const value = {
    schema_version: HEARTBEAT_SCHEMA,
    lane,
    status: succeeded ? "ok" : "error",
    attempted_at: attemptedAt,
    completed_at: completedAt,
    last_success_at: succeeded ? completedAt : prior?.last_success_at ?? null,
    error_codes: succeeded ? [] : [errorCode],
    activity_changed: typeof activity === "boolean" ? activity : null,
    projection_at: typeof projectionAt === "string" && Number.isFinite(Date.parse(projectionAt)) ? projectionAt : null,
    ...(typeof retryState === "string" ? { retry_state: retryState } : {}),
    ...(Number.isSafeInteger(backlogCount) && backlogCount >= 0 ? { backlog_count: backlogCount } : {}),
    ...(Number.isSafeInteger(attemptNumber) && attemptNumber >= 0 ? { attempt_number: attemptNumber } : {}),
    ...(Array.isArray(safeIssueCodes) ? { safe_issue_codes: [...new Set(safeIssueCodes)].sort((a, b) => a.localeCompare(b, "en")) } : {}),
    ...(typeof nextAttemptAt === "string" && Number.isFinite(Date.parse(nextAttemptAt)) ? { next_attempt_at: nextAttemptAt } : (retryState === "clear" || retryState === "held" ? { next_attempt_at: null } : {})),
  };
  await writeHeartbeat(file, value);
  return value;
}

// Every collector child gets the same bounded shape, so no lane can outlive the
// sweep that owns it.
function childOptions(repoRoot, childTimeoutMs) {
  const timeout = Number.isSafeInteger(childTimeoutMs) && childTimeoutMs > 0
    ? childTimeoutMs
    : DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS;
  return { cwd: repoRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout };
}

function safeLaneStatus(value) {
  return USAGE_PRODUCER_LANE_STATUSES.includes(value) ? value : "error";
}

// A cycle receipt is the producer's own liveness evidence: it says a sweep
// started, and later how long it took and how each lane ended. The per-lane
// heartbeats stay unchanged and remain the authority for lane freshness.
export function createUsageProducerCycleRecord({
  cycleState,
  attemptedAt,
  completedAt = null,
  durationMs = null,
  lanes = [],
} = {}) {
  const state = cycleState === "started" || cycleState === "completed" ? cycleState : null;
  if (state === null || !Number.isFinite(Date.parse(attemptedAt ?? ""))) return null;
  return {
    schema_version: USAGE_PRODUCER_CYCLE_SCHEMA,
    cycle_state: state,
    attempted_at: attemptedAt,
    completed_at: state === "completed" && Number.isFinite(Date.parse(completedAt ?? "")) ? completedAt : null,
    duration_ms: state === "completed" && Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    lanes: state === "started" ? [] : USAGE_PRODUCER_LANES.map((lane) => {
      const row = lanes.find((candidate) => candidate?.lane === lane) ?? null;
      const status = row === null ? "skipped" : safeLaneStatus(row.status);
      const errorCode = typeof row?.error_code === "string" && SAFE_ERROR_CODE.test(row.error_code)
        ? row.error_code
        : null;
      return { lane, status, error_code: status === "error" ? errorCode ?? "collector_failed" : null };
    }),
  };
}

// A lane row is exact in itself and consistent with its own status: an error
// must carry a sanitized code, and a non-error must carry none. A row claiming
// "ok" beside an error code, or "error" with nothing to say, is not a weaker
// receipt — it is a contradictory one, so it fails the record outright.
function isUsageProducerLaneRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
  const keys = ["lane", "status", "error_code"];
  if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key))) return false;
  if (!USAGE_PRODUCER_LANES.includes(row.lane) || !USAGE_PRODUCER_LANE_STATUSES.includes(row.status)) return false;
  if (row.status === "error") {
    return typeof row.error_code === "string" && SAFE_ERROR_CODE.test(row.error_code);
  }
  return row.error_code === null;
}

// The shape a cycle receipt is allowed to take depends on which half of the
// cycle it reports. A "started" row that already carries a duration, or a
// "completed" row missing lanes, would let a partial or fabricated cycle read
// as a real one, so each state is validated against its own exact contract
// rather than a permissive union of both.
export function isUsageProducerCycleRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = ["schema_version", "cycle_state", "attempted_at", "completed_at", "duration_ms", "lanes"];
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return false;
  if (value.schema_version !== USAGE_PRODUCER_CYCLE_SCHEMA) return false;
  if (!["started", "completed"].includes(value.cycle_state)) return false;
  const attemptedMs = Date.parse(value.attempted_at ?? "");
  if (!Number.isFinite(attemptedMs)) return false;
  if (!Array.isArray(value.lanes) || !value.lanes.every(isUsageProducerLaneRow)) return false;

  if (value.cycle_state === "started") {
    // Nothing about the outcome exists yet, so nothing about it may be claimed.
    return value.completed_at === null
      && value.duration_ms === null
      && value.lanes.length === 0;
  }

  const completedMs = Date.parse(value.completed_at ?? "");
  if (!Number.isFinite(completedMs) || completedMs < attemptedMs) return false;
  if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < 0) return false;
  // Exactly one row per fixed lane: no duplicate, no omission, no extra.
  if (value.lanes.length !== USAGE_PRODUCER_LANES.length) return false;
  const seen = new Set(value.lanes.map((row) => row.lane));
  return seen.size === value.lanes.length
    && USAGE_PRODUCER_LANES.every((lane) => seen.has(lane));
}

// A missing history is a safe first write. A present-but-untrustworthy one is
// evidence in its own right and must survive untouched, so the two cases are
// reported apart rather than collapsed into "nothing usable".
async function probeCycleHistory(file, fsOps) {
  const readOps = { lstat, readFile, ...fsOps };
  let info;
  try {
    info = await readOps.lstat(file);
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > USAGE_PRODUCER_CYCLE_MAX_BYTES) {
    return { presence: "unreadable", value: null };
  }
  try {
    return { presence: "present", value: JSON.parse(await readOps.readFile(file, "utf8")) };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
}

// Latest plus one bounded history file. Two files total per state root, so a
// resident producer cannot grow an unbounded evidence directory.
export async function persistProducerCycleReceipt({
  stateRoot,
  record,
  historyLimit = USAGE_PRODUCER_CYCLE_HISTORY_LIMIT,
  fsOps = {},
} = {}) {
  if (!path.isAbsolute(stateRoot ?? "") || !isUsageProducerCycleRecord(record)) return null;
  const directory = path.join(stateRoot, "producer_health");
  const latestFile = path.join(directory, "cycle.json");
  const historyFile = path.join(directory, "cycle-history.json");
  // Latest and history are written independently. The sweep's current liveness
  // must stay visible even when the history cannot be safely appended, and a
  // corrupt history is never overwritten to force the write through.
  let plan;
  try {
    const probe = await probeCycleHistory(historyFile, fsOps);
    plan = planBoundedHistoryAppend({
      classified: classifyBoundedHistory({
        presence: probe.presence,
        value: probe.value,
        schemaVersion: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA,
        isEntry: isUsageProducerCycleRecord,
      }),
      entry: record,
      schemaVersion: USAGE_PRODUCER_CYCLE_HISTORY_SCHEMA,
      limit: historyLimit,
      isEntry: isUsageProducerCycleRecord,
    });
  } catch {
    plan = { outcome: "preserved", record: null, reason: "history_plan_failed" };
  }
  let latestOutcome = "written";
  try {
    await writeHeartbeat(latestFile, record);
  } catch {
    // Cycle evidence is best effort; it must never abort or delay collection.
    latestOutcome = "latest_write_failed";
  }
  let historyOutcome = plan.outcome;
  let historyReason = plan.reason;
  if (plan.record !== null) {
    try {
      await writeHeartbeat(historyFile, plan.record);
    } catch {
      historyOutcome = "preserved";
      historyReason = "history_write_failed";
    }
  }
  return {
    record,
    latest_outcome: latestOutcome,
    history_outcome: historyOutcome,
    history_reason: historyReason,
  };
}

export function createUsageProducerRecoveryRecord({
  observedAt,
  lane,
  safeIssueCodes = [],
  backlogCount = 0,
  attemptNumber = 0,
  action = "none",
  outcome = "cleared",
  verificationResult = "clean",
} = {}) {
  const observedMs = Date.parse(observedAt ?? "");
  if (!Number.isFinite(observedMs)
    || !USAGE_PRODUCER_LANES.includes(lane)
    || !Array.isArray(safeIssueCodes)
    || !safeIssueCodes.every((code) => typeof code === "string" && SAFE_ERROR_CODE.test(code))
    || !Number.isSafeInteger(backlogCount) || backlogCount < 0
    || !Number.isSafeInteger(attemptNumber) || attemptNumber < 0 || attemptNumber > MAX_CONSECUTIVE_RECOVERY_ATTEMPTS
    || !["quarantine_and_continue", "none"].includes(action)
    || (action === "quarantine_and_continue" && !safeIssueCodes.every((code) => SAFE_REPAIR_ISSUE_CODES.includes(code)))
    || !["retrying", "held", "cleared", "failed"].includes(outcome)
    || typeof verificationResult !== "string" || !SAFE_ERROR_CODE.test(verificationResult)) {
    return null;
  }
  const sortedCodes = [...new Set(safeIssueCodes)].sort((left, right) => left.localeCompare(right, "en")).slice(0, 50);
  return {
    schema_version: USAGE_PRODUCER_RECOVERY_SCHEMA,
    observed_at: observedAt,
    lane,
    safe_issue_codes: sortedCodes,
    backlog_count: backlogCount,
    attempt_number: attemptNumber,
    action,
    outcome,
    verification_result: verificationResult,
  };
}

export function isUsageProducerRecoveryRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = [
    "schema_version",
    "observed_at",
    "lane",
    "safe_issue_codes",
    "backlog_count",
    "attempt_number",
    "action",
    "outcome",
    "verification_result",
  ];
  if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return false;
  if (value.schema_version !== USAGE_PRODUCER_RECOVERY_SCHEMA) return false;
  if (!Number.isFinite(Date.parse(value.observed_at ?? ""))) return false;
  if (!USAGE_PRODUCER_LANES.includes(value.lane)) return false;
  if (!Array.isArray(value.safe_issue_codes)
    || value.safe_issue_codes.length > 50
    || !value.safe_issue_codes.every((code) => typeof code === "string" && SAFE_ERROR_CODE.test(code))) {
    return false;
  }
  const seenCodes = new Set(value.safe_issue_codes);
  if (seenCodes.size !== value.safe_issue_codes.length) return false;
  for (let i = 1; i < value.safe_issue_codes.length; i++) {
    if (value.safe_issue_codes[i - 1].localeCompare(value.safe_issue_codes[i], "en") >= 0) return false;
  }
  if (!Number.isSafeInteger(value.backlog_count) || value.backlog_count < 0) return false;
  if (!Number.isSafeInteger(value.attempt_number) || value.attempt_number < 0 || value.attempt_number > MAX_CONSECUTIVE_RECOVERY_ATTEMPTS) return false;
  if (!["quarantine_and_continue", "none"].includes(value.action)) return false;
  if (value.action === "quarantine_and_continue" && !value.safe_issue_codes.every((code) => SAFE_REPAIR_ISSUE_CODES.includes(code))) {
    return false;
  }
  if (!["retrying", "held", "cleared", "failed"].includes(value.outcome)) return false;
  if (typeof value.verification_result !== "string" || !SAFE_ERROR_CODE.test(value.verification_result)) return false;
  return true;
}

export function isVerifiedRecoveryPersistenceResult(result) {
  return result !== null
    && typeof result === "object"
    && !Array.isArray(result)
    && result.latest_outcome === "written"
    && (result.history_outcome === "created" || result.history_outcome === "appended");
}

const SAFE_PERSISTENCE_EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;

function isSafePersistenceEventId(id) {
  return typeof id === "string"
    && id.length >= 1
    && id.length <= 120
    && SAFE_PERSISTENCE_EVENT_ID.test(id)
    && !/(?:bearer|token|password|passwd|secret|api_key|credential)/iu.test(id);
}

function pathsEqual(pathA, pathB) {
  if (typeof pathA !== "string" || typeof pathB !== "string" || pathA.length === 0 || pathB.length === 0) {
    return false;
  }
  if (!path.isAbsolute(pathA) || !path.isAbsolute(pathB)) {
    return false;
  }
  const normA = path.resolve(pathA);
  const normB = path.resolve(pathB);
  if (process.platform === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

export function isVerifiedPersistenceResult(result, expectedStateRoot) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) return false;
  if (typeof expectedStateRoot !== "string" || expectedStateRoot.length === 0 || !path.isAbsolute(expectedStateRoot)) {
    return false;
  }

  const hasIssues = Object.hasOwn(result, "issues");
  const expectedKeyCount = hasIssues ? 7 : 6;
  const keys = Object.keys(result);
  if (keys.length !== expectedKeyCount) return false;

  if (!Object.hasOwn(result, "created")
    || !Object.hasOwn(result, "updated")
    || !Object.hasOwn(result, "replayed")
    || !Object.hasOwn(result, "event_ids")
    || !Object.hasOwn(result, "total_event_count")
    || !Object.hasOwn(result, "state_root")) {
    return false;
  }

  if (!Number.isSafeInteger(result.created) || result.created < 0) return false;
  if (!Number.isSafeInteger(result.updated) || result.updated < 0) return false;
  if (!Number.isSafeInteger(result.replayed) || result.replayed < 0) return false;
  if (!Number.isSafeInteger(result.total_event_count) || result.total_event_count < 0) return false;

  if (!Array.isArray(result.event_ids)) return false;
  if (result.created + result.updated + result.replayed !== result.event_ids.length) return false;
  if (result.total_event_count < result.event_ids.length) return false;

  for (let i = 0; i < result.event_ids.length; i++) {
    const id = result.event_ids[i];
    if (!isSafePersistenceEventId(id)) return false;
    if (i > 0 && result.event_ids[i - 1].localeCompare(id, "en") >= 0) {
      return false;
    }
  }

  if (typeof result.state_root !== "string"
    || result.state_root.length === 0
    || !path.isAbsolute(result.state_root)) {
    return false;
  }

  if (!pathsEqual(result.state_root, expectedStateRoot)) {
    return false;
  }

  if (hasIssues) {
    if (!Array.isArray(result.issues) || result.issues.length > 10000) return false;
    for (const issue of result.issues) {
      if (issue === null || typeof issue !== "object" || Array.isArray(issue)) return false;
      const issueKeys = Object.keys(issue);
      if (issueKeys.length !== 2 || !Object.hasOwn(issue, "source_ref") || !Object.hasOwn(issue, "code")) {
        return false;
      }
      if (typeof issue.code !== "string" || !SAFE_ERROR_CODE.test(issue.code)) {
        return false;
      }
      if (!isSafeSourceRef(issue.source_ref)) {
        return false;
      }
    }
  }

  return true;
}

export function isConsistentCodexIssues(rootIssues, persistenceIssues) {
  if (!Array.isArray(rootIssues)) return false;
  const pIssues = persistenceIssues === null || persistenceIssues === undefined ? [] : persistenceIssues;
  if (!Array.isArray(pIssues)) return false;
  if (pIssues.length === 0) return true;
  if (rootIssues.length < pIssues.length) return false;

  const rootCounts = new Map();
  for (const issue of rootIssues) {
    if (issue === null || typeof issue !== "object" || Array.isArray(issue)) return false;
    if (typeof issue.source_ref !== "string" || typeof issue.code !== "string") return false;
    const key = `${issue.source_ref}\0${issue.code}`;
    rootCounts.set(key, (rootCounts.get(key) ?? 0) + 1);
  }

  for (const issue of pIssues) {
    if (issue === null || typeof issue !== "object" || Array.isArray(issue)) return false;
    if (typeof issue.source_ref !== "string" || typeof issue.code !== "string") return false;
    const key = `${issue.source_ref}\0${issue.code}`;
    const remaining = rootCounts.get(key) ?? 0;
    if (remaining <= 0) return false;
    rootCounts.set(key, remaining - 1);
  }

  return true;
}

async function probeRecoveryHistory(file, fsOps) {
  const readOps = { lstat, readFile, ...fsOps };
  let info;
  try {
    info = await readOps.lstat(file);
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > USAGE_PRODUCER_RECOVERY_MAX_BYTES) {
    return { presence: "unreadable", value: null };
  }
  try {
    return { presence: "present", value: JSON.parse(await readOps.readFile(file, "utf8")) };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { presence: "missing", value: null }
      : { presence: "unreadable", value: null };
  }
}

export async function persistProducerRecoveryReceipt({
  stateRoot,
  record,
  historyLimit = USAGE_PRODUCER_RECOVERY_HISTORY_LIMIT,
  fsOps = {},
} = {}) {
  if (!path.isAbsolute(stateRoot ?? "") || !isUsageProducerRecoveryRecord(record)) return null;
  const directory = path.join(stateRoot, "producer_health");
  const latestFile = path.join(directory, "recovery.json");
  const historyFile = path.join(directory, "recovery-history.json");

  let plan;
  try {
    const probe = await probeRecoveryHistory(historyFile, fsOps);
    plan = planBoundedHistoryAppend({
      classified: classifyBoundedHistory({
        presence: probe.presence,
        value: probe.value,
        schemaVersion: USAGE_PRODUCER_RECOVERY_HISTORY_SCHEMA,
        isEntry: isUsageProducerRecoveryRecord,
      }),
      entry: record,
      schemaVersion: USAGE_PRODUCER_RECOVERY_HISTORY_SCHEMA,
      limit: historyLimit,
      isEntry: isUsageProducerRecoveryRecord,
    });
  } catch {
    plan = { outcome: "preserved", record: null, reason: "history_plan_failed" };
  }
  let latestOutcome = "written";
  try {
    await writeHeartbeat(latestFile, record);
  } catch {
    latestOutcome = "latest_write_failed";
  }
  let historyOutcome = plan.outcome;
  let historyReason = plan.reason;
  if (plan.record !== null) {
    try {
      await writeHeartbeat(historyFile, plan.record);
    } catch {
      historyOutcome = "preserved";
      historyReason = "history_write_failed";
    }
  }
  return {
    record,
    latest_outcome: latestOutcome,
    history_outcome: historyOutcome,
    history_reason: historyReason,
  };
}

export function activeCodexSessionIds(lifecycle, { now = Date.now } = {}) {
  if (!Array.isArray(lifecycle?.identities)) return [];
  const referenceAt = now();
  const ids = lifecycle.identities.filter((entry) => {
    const observedAt = Date.parse(entry?.observed_at);
    return entry?.lifecycle_state === "started"
      && Number.isFinite(observedAt)
      && observedAt <= referenceAt
      && referenceAt - observedAt <= ACTIVE_CODEX_SESSION_MAX_AGE_MS;
  }).map((entry) => entry?.session_id);
  return ids.every((id) => typeof id === "string" && SAFE_THREAD_ID.test(id))
    ? [...new Set(ids)].sort((left, right) => left.localeCompare(right, "en"))
    : [];
}

export async function loadActiveCodexSessionFiles({ stateRoot, sessionsRoot = path.join(process.env.CODEX_HOME || path.join(process.env.USERPROFILE || "", ".codex"), "sessions"), now = Date.now } = {}) {
  if (!path.isAbsolute(stateRoot ?? "") || !path.isAbsolute(sessionsRoot ?? "")) return [];
  const lifecycle = await readFile(path.join(stateRoot, "lifecycle", "current.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => ({ identities: [] }));
  const activeIds = new Set(activeCodexSessionIds(lifecycle, { now }));
  const referenceAt = now();
  const selected = [];
  for (const file of await findCodexSessionFiles(sessionsRoot)) {
    const lifecycleActive = [...activeIds].some((id) => file.endsWith(`-${id}.jsonl`));
    const recentlyWritten = await stat(file)
      .then((info) => Number.isFinite(info.mtimeMs)
        && info.mtimeMs <= referenceAt
        && referenceAt - info.mtimeMs <= ACTIVE_CODEX_SESSION_MAX_AGE_MS)
      .catch(() => false);
    if (lifecycleActive || recentlyWritten) selected.push(file);
  }
  return selected;
}

export async function loadCurrentThreadIds(registryPath) {
  if (!path.isAbsolute(registryPath ?? "")) return [];
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (!Array.isArray(registry?.entries)) return [];
  const ids = registry.entries
    .filter((entry) => entry?.lifecycle === "current" || entry?.lifecycle === "accepted")
    .map((entry) => entry?.thread_id);
  return ids.every((threadId) => typeof threadId === "string" && SAFE_THREAD_ID.test(threadId))
    ? [...new Set(ids)].sort((left, right) => left.localeCompare(right, "en"))
    : [];
}

export async function runClaudeQuotaSweep({
  repoRoot,
  projectRoot = repoRoot,
  run = execFileAsync,
  childTimeoutMs = DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS,
} = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(projectRoot ?? "")) {
    return { status: "hold", error_code: "quota_root_unavailable" };
  }
  const collector = path.join(repoRoot, "ui-workspace", "apps", "team-ops-board", "src", "server", "claude-oauth-usage-collector.mjs");
  const stateRoot = path.join(projectRoot, "guild_hall", "state", "operations", "provider_quota", "claude");
  try {
    await run(process.execPath, [
      collector,
      "--gate-path", path.join(stateRoot, "oauth", "enabled.v1.json"),
      "--receipt-path", path.join(stateRoot, "statusline", "provider_quota.receipt.v1.json"),
    ], childOptions(repoRoot, childTimeoutMs));
    return { status: "observed" };
  } catch (error) {
    return { status: "hold", error_code: safeErrorCode(error) };
  }
}

export async function runUsageProducerSweep({ repoRoot, projectRoot = repoRoot, stateRoot, watchtowerPointerPath, threadIds = [], run = execFileAsync, loadActiveFiles = loadActiveCodexSessionFiles, loadSnapshot = async () => JSON.parse(await readFile(path.join(stateRoot, "current.json"), "utf8")), persistHeartbeat = persistProducerHeartbeat, persistCycle = persistProducerCycleReceipt, persistRecovery = persistProducerRecoveryReceipt, childTimeoutMs = DEFAULT_USAGE_PRODUCER_CHILD_TIMEOUT_MS, now = () => new Date() } = {}) {
  if (!path.isAbsolute(repoRoot ?? "") || !path.isAbsolute(projectRoot ?? "") || !path.isAbsolute(stateRoot ?? "")) {
    return { status: "hold", completed: 0 };
  }
  const cli = path.join(repoRoot, "guild_hall", "ai_usage_meter", "cli.mjs");
  const watchtowerCli = path.join(repoRoot, "guild_hall", "watchtower", "cli.mjs");
  const options = childOptions(repoRoot, childTimeoutMs);
  let completed = 0;
  let projectionCommandSucceeded = false;
  let pendingCodex = null;
  let pendingClaude = null;
  let pendingAntigravity = null;
  const attemptedAt = now().toISOString();
  const laneRows = new Map();
  const observeLane = (lane, status, errorCode = null) => {
    laneRows.set(lane, { lane, status, error_code: errorCode });
  };
  // The started receipt is written before any child exists, so a sweep that
  // never returns still leaves proof that it was attempted and when.
  await Promise.resolve(persistCycle({
    stateRoot,
    record: createUsageProducerCycleRecord({ cycleState: "started", attemptedAt }),
  })).catch(() => null);
  let priorDigest = null;
  let priorEventCount = null;
  try {
    const priorSnapshot = await loadSnapshot();
    priorDigest = priorSnapshot?.events_digest ?? null;
    priorEventCount = Number.isSafeInteger(priorSnapshot?.event_count) ? priorSnapshot.event_count : null;
  } catch {}
  const lifecycleArgs = threadIds.length > 0
    ? [cli, "lifecycle-reconcile", ...threadIds.flatMap((threadId) => ["--thread-id", threadId]), "--state-root", stateRoot, "--apply"]
    : null;
  const commands = [
    lifecycleArgs,
    [cli, "collect", "--project-root", projectRoot, "--state-root", stateRoot, "--apply"],
    [cli, "collect-claude", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
    [cli, "collect-antigravity", "--state-root", stateRoot, "--max-age-days", "2", "--apply"],
  ].filter(Boolean);
  const commandLanes = new Map([
    ["lifecycle-reconcile", "lifecycle"],
    ["collect", "codex"],
    ["collect-claude", "claude"],
    ["collect-antigravity", "antigravity"],
  ]);
  for (const args of commands) {
    const command = args[0] === cli ? args[1] : null;
    try {
      const result = await run(process.execPath, args, options);
      if (command === "collect-antigravity") validateAntigravityCollectionResult(result);
      completed += 1;
      if (command === "collect-claude") {
        observeLane(commandLanes.get(command), "ok");
        projectionCommandSucceeded = true;
        pendingClaude = { succeeded: true };
      } else if (command === "collect-antigravity") {
        observeLane(commandLanes.get(command), "ok");
        projectionCommandSucceeded = true;
        pendingAntigravity = { succeeded: true };
      } else if (command === "collect") {
        let collectResult;
        try {
          collectResult = validateCodexCollectionResult(result);
        } catch {
          pendingCodex = { valid: false, errorCode: "collector_result_invalid" };
          collectResult = null;
        }
        if (collectResult !== null) {
          const rawIssues = Array.isArray(collectResult.issues) ? collectResult.issues : [];
          const issueCodes = [...new Set(rawIssues.map((i) => i?.code))].filter(Boolean).sort((a, b) => a.localeCompare(b, "en")).slice(0, 50);
          const allSafeSyntax = issueCodes.every((code) => typeof code === "string" && SAFE_ERROR_CODE.test(code));
          const allAutoRepairable = issueCodes.every((code) => SAFE_REPAIR_ISSUE_CODES.includes(code));
          const hasPersistence = isVerifiedPersistenceResult(collectResult.persistence, stateRoot);
          const issuesConsistent = isConsistentCodexIssues(rawIssues, collectResult.persistence?.issues);

          if (!allSafeSyntax) {
            pendingCodex = { valid: false, errorCode: "collector_failed", rawIssues, issueCodes };
          } else if (collectResult.persistence === null) {
            pendingCodex = { valid: false, errorCode: "persistence_missing", rawIssues, issueCodes };
          } else if (!hasPersistence || !issuesConsistent) {
            pendingCodex = { valid: false, errorCode: "persistence_invalid", rawIssues, issueCodes };
          } else if (rawIssues.length === 0) {
            pendingCodex = { valid: true, clean: true, rawIssues, issueCodes };
            projectionCommandSucceeded = true;
          } else if (allAutoRepairable) {
            pendingCodex = { valid: true, clean: false, autoRepairable: true, rawIssues, issueCodes };
            projectionCommandSucceeded = true;
          } else {
            pendingCodex = { valid: true, clean: false, autoRepairable: false, rawIssues, issueCodes };
            projectionCommandSucceeded = true;
          }
        }
      } else {
        observeLane(commandLanes.get(command), "ok");
      }
    } catch (error) {
      // A timed-out lane fails closed with its own fixed code and leaves the
      // remaining lanes to run and report their own real result.
      observeLane(commandLanes.get(command), "error", safeErrorCode(error));
      if (command === "collect-claude") pendingClaude = { succeeded: false, errorCode: safeErrorCode(error) };
      if (command === "collect-antigravity") pendingAntigravity = { succeeded: false, errorCode: safeErrorCode(error) };
      if (command === "collect") pendingCodex = { valid: false, errorCode: safeErrorCode(error) };
      // Each producer remains fail-closed and the next interval retries it.
    }
  }
  let projectionResult;
  try {
    const snapshot = await loadSnapshot();
    if (!projectionCommandSucceeded || snapshot?.schema_version !== "soulforge.ai_usage_meter_snapshot.v1" || !Number.isFinite(Date.parse(snapshot.generated_at))) {
      throw Object.assign(new Error("ledger_projection_invalid"), { code: "ledger_projection_invalid" });
    }
    const activity = priorDigest !== null && typeof snapshot.events_digest === "string"
      ? snapshot.events_digest !== priorDigest
      : priorEventCount !== null && Number.isSafeInteger(snapshot.event_count)
        ? snapshot.event_count !== priorEventCount
        : null;
    projectionResult = { succeeded: true, activity, projectionAt: snapshot.generated_at };
  } catch (error) {
    projectionResult = { succeeded: false, errorCode: safeErrorCode(error) };
  }

  if (pendingCodex !== null) {
    const priorHeartbeat = await readHeartbeat(path.join(stateRoot, "producer_health", "codex.json")).catch(() => null);

    if (!projectionResult.succeeded || !pendingCodex.valid) {
      const codexErrorCode = (!pendingCodex.valid ? pendingCodex.errorCode : null)
        ?? projectionResult.errorCode
        ?? "ledger_projection_invalid";
      observeLane("codex", "error", codexErrorCode);
      await persistLaneHealth(persistHeartbeat, {
        stateRoot,
        lane: "codex",
        attemptedAt,
        succeeded: false,
        errorCode: codexErrorCode,
        now,
      });
      await Promise.resolve(persistRecovery({
        stateRoot,
        record: createUsageProducerRecoveryRecord({
          observedAt: attemptedAt,
          lane: "codex",
          safeIssueCodes: pendingCodex?.issueCodes ?? [],
          backlogCount: pendingCodex?.rawIssues?.length ?? 0,
          attemptNumber: 0,
          action: "none",
          outcome: "failed",
          verificationResult: codexErrorCode,
        }),
      })).catch(() => null);
    } else if (pendingCodex.clean) {
      const priorHadBacklog = priorHeartbeat !== null && (
        priorHeartbeat.retry_state === "retrying" ||
        priorHeartbeat.retry_state === "held" ||
        (Number.isSafeInteger(priorHeartbeat.backlog_count) && priorHeartbeat.backlog_count > 0) ||
        (Array.isArray(priorHeartbeat.safe_issue_codes) && priorHeartbeat.safe_issue_codes.length > 0) ||
        priorHeartbeat.status === "error"
      );
      let verified = true;
      if (priorHadBacklog) {
        const persistenceResult = await Promise.resolve(persistRecovery({
          stateRoot,
          record: createUsageProducerRecoveryRecord({
            observedAt: attemptedAt,
            lane: "codex",
            safeIssueCodes: [],
            backlogCount: 0,
            attemptNumber: 0,
            action: "none",
            outcome: "cleared",
            verificationResult: "clean",
          }),
        })).catch(() => null);
        verified = isVerifiedRecoveryPersistenceResult(persistenceResult);
      }
      if (verified) {
        observeLane("codex", "ok");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: true,
          retryState: "clear",
          backlogCount: 0,
          attemptNumber: 0,
          safeIssueCodes: [],
          nextAttemptAt: null,
          now,
        });
      } else {
        observeLane("codex", "error", "recovery_receipt_unavailable");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: false,
          errorCode: "recovery_receipt_unavailable",
          now,
        });
      }
    } else if (!pendingCodex.autoRepairable) {
      const priorSafeCodes = Array.isArray(priorHeartbeat?.safe_issue_codes) ? priorHeartbeat.safe_issue_codes : [];
      const sameIssueSet = priorSafeCodes.length === pendingCodex.issueCodes.length
        && pendingCodex.issueCodes.every((c, idx) => c === priorSafeCodes[idx]);
      const isRepeatedHeld = priorHeartbeat?.retry_state === "held" && sameIssueSet;
      let verified = true;
      if (!isRepeatedHeld) {
        const persistenceResult = await Promise.resolve(persistRecovery({
          stateRoot,
          record: createUsageProducerRecoveryRecord({
            observedAt: attemptedAt,
            lane: "codex",
            safeIssueCodes: pendingCodex.issueCodes,
            backlogCount: pendingCodex.rawIssues.length,
            attemptNumber: 0,
            action: "none",
            outcome: "held",
            verificationResult: "unresolved_hold",
          }),
        })).catch(() => null);
        verified = isVerifiedRecoveryPersistenceResult(persistenceResult);
      }
      if (verified) {
        observeLane("codex", "ok");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: true,
          retryState: "held",
          backlogCount: pendingCodex.rawIssues.length,
          attemptNumber: 0,
          safeIssueCodes: pendingCodex.issueCodes,
          nextAttemptAt: null,
          now,
        });
      } else {
        observeLane("codex", "error", "recovery_receipt_unavailable");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: false,
          errorCode: "recovery_receipt_unavailable",
          now,
        });
      }
    } else {
      const priorSafeCodes = Array.isArray(priorHeartbeat?.safe_issue_codes) ? priorHeartbeat.safe_issue_codes : [];
      const sameIssueSet = priorSafeCodes.length === pendingCodex.issueCodes.length
        && pendingCodex.issueCodes.every((c, idx) => c === priorSafeCodes[idx]);
      const attemptedMs = Date.parse(attemptedAt);

      let attemptNumber;
      let outcome;
      let retryState;
      let nextAttemptAt;
      let shouldAppendHistory = false;

      if (!sameIssueSet) {
        attemptNumber = 1;
        outcome = "retrying";
        retryState = "retrying";
        nextAttemptAt = Number.isFinite(attemptedMs)
          ? new Date(attemptedMs + 300_000).toISOString()
          : null;
        shouldAppendHistory = true;
      } else if (priorHeartbeat?.retry_state === "held") {
        attemptNumber = MAX_CONSECUTIVE_RECOVERY_ATTEMPTS;
        outcome = "held";
        retryState = "held";
        nextAttemptAt = null;
        shouldAppendHistory = false;
      } else {
        const priorAttempt = Number.isSafeInteger(priorHeartbeat?.attempt_number) && priorHeartbeat.attempt_number > 0
          ? priorHeartbeat.attempt_number
          : 1;
        const priorNextMs = Date.parse(priorHeartbeat?.next_attempt_at ?? "");
        const isDue = !Number.isFinite(priorNextMs) || (Number.isFinite(attemptedMs) && attemptedMs >= priorNextMs);

        if (!isDue) {
          attemptNumber = priorAttempt;
          outcome = "retrying";
          retryState = "retrying";
          nextAttemptAt = priorHeartbeat.next_attempt_at ?? null;
          shouldAppendHistory = false;
        } else {
          const nextAttempt = priorAttempt + 1;
          if (nextAttempt > MAX_CONSECUTIVE_RECOVERY_ATTEMPTS) {
            attemptNumber = MAX_CONSECUTIVE_RECOVERY_ATTEMPTS;
            outcome = "held";
            retryState = "held";
            nextAttemptAt = null;
            shouldAppendHistory = true;
          } else {
            attemptNumber = nextAttempt;
            outcome = "retrying";
            retryState = "retrying";
            nextAttemptAt = Number.isFinite(attemptedMs)
              ? new Date(attemptedMs + Math.min(nextAttempt * 300_000, 900_000)).toISOString()
              : null;
            shouldAppendHistory = true;
          }
        }
      }

      let verified = true;
      if (shouldAppendHistory) {
        const persistenceResult = await Promise.resolve(persistRecovery({
          stateRoot,
          record: createUsageProducerRecoveryRecord({
            observedAt: attemptedAt,
            lane: "codex",
            safeIssueCodes: pendingCodex.issueCodes,
            backlogCount: pendingCodex.rawIssues.length,
            attemptNumber,
            action: "quarantine_and_continue",
            outcome,
            verificationResult: "isolated_and_persisted",
          }),
        })).catch(() => null);
        verified = isVerifiedRecoveryPersistenceResult(persistenceResult);
      }

      if (verified) {
        observeLane("codex", "ok");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: true,
          retryState,
          backlogCount: pendingCodex.rawIssues.length,
          attemptNumber,
          safeIssueCodes: pendingCodex.issueCodes,
          nextAttemptAt,
          now,
        });
      } else {
        observeLane("codex", "error", "recovery_receipt_unavailable");
        await persistLaneHealth(persistHeartbeat, {
          stateRoot,
          lane: "codex",
          attemptedAt,
          succeeded: false,
          errorCode: "recovery_receipt_unavailable",
          now,
        });
      }
    }
  }

  if (pendingClaude !== null) {
    await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "claude", attemptedAt, succeeded: pendingClaude.succeeded, errorCode: pendingClaude.errorCode, now });
  }
  if (pendingAntigravity !== null) {
    await persistLaneHealth(persistHeartbeat, { stateRoot, lane: "antigravity", attemptedAt, succeeded: pendingAntigravity.succeeded, errorCode: pendingAntigravity.errorCode, now });
  }
  for (const lane of ["meter", "store_usage_ledger"]) {
    // Receipt channels are independent; one failed write must not falsify the other lane.
    await persistLaneHealth(persistHeartbeat, { stateRoot, lane, attemptedAt, ...projectionResult, now });
    // An idle window is a healthy sweep: activity=false is not an error.
    observeLane(lane, projectionResult.succeeded ? "ok" : "error", projectionResult.errorCode ?? null);
  }
  if (path.isAbsolute(watchtowerPointerPath ?? "")) {
    try {
      await run(process.execPath, [watchtowerCli, "probe", "--pointer", watchtowerPointerPath, "--json"], options);
      completed += 1;
      observeLane("watchtower", "ok");
    } catch (error) {
      // Observation failure is isolated from collection and retried next interval.
      observeLane("watchtower", "error", safeErrorCode(error));
    }
  }
  const activeFiles = await Promise.resolve(loadActiveFiles({ stateRoot })).catch(() => []);
  let activeFailures = 0;
  for (const sessionFile of activeFiles) {
    try {
      await run(process.execPath, [cli, "collect", "--project-root", projectRoot, "--session-file", sessionFile, "--state-root", stateRoot, "--include-active", "--apply"], options);
      completed += 1;
    } catch (error) {
      // One conflicting active session must not block other exact active sessions.
      activeFailures += 1;
      observeLane("active_sessions", "error", safeErrorCode(error));
    }
  }
  if (activeFiles.length > 0 && activeFailures === 0) observeLane("active_sessions", "ok");
  const expected = (lifecycleArgs === null ? 3 : 4)
    + (path.isAbsolute(watchtowerPointerPath ?? "") ? 1 : 0)
    + activeFiles.length;
  const completedAt = now().toISOString();
  const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(attemptedAt));
  await Promise.resolve(persistCycle({
    stateRoot,
    record: createUsageProducerCycleRecord({
      cycleState: "completed",
      attemptedAt,
      completedAt,
      durationMs: Number.isSafeInteger(durationMs) ? durationMs : null,
      lanes: [...laneRows.values()],
    }),
  })).catch(() => null);
  return { status: completed === expected ? "observed" : "partial", completed };
}

export function startUsageProducerCompanion({
  repoRoot,
  projectRoot = repoRoot,
  stateRoot,
  registryPath,
  watchtowerPointerPath,
  intervalMs = DEFAULT_USAGE_PRODUCER_INTERVAL_MS,
  sweep = runUsageProducerSweep,
  quotaSweep = runClaudeQuotaSweep,
  loadThreadIds = loadCurrentThreadIds,
} = {}) {
  let stopped = false;
  let inFlight = null;
  let quotaInFlight = null;
  const trigger = () => {
    if (stopped || inFlight !== null) return inFlight;
    inFlight = containSweepFailure(async () => {
      const threadIds = await Promise.resolve()
        .then(() => loadThreadIds(registryPath))
        .catch(() => []);
      return sweep({ repoRoot, projectRoot, stateRoot, watchtowerPointerPath, threadIds });
    }).finally(() => { inFlight = null; });
    return inFlight;
  };
  const triggerQuota = () => {
    if (stopped || quotaInFlight !== null) return quotaInFlight;
    quotaInFlight = containSweepFailure(() => quotaSweep({ repoRoot, projectRoot }))
      .finally(() => { quotaInFlight = null; });
    return quotaInFlight;
  };
  void trigger();
  void triggerQuota();
  const timer = setInterval(() => { void trigger(); }, intervalMs);
  const quotaTimer = setInterval(() => { void triggerQuota(); }, intervalMs);
  timer.unref?.();
  quotaTimer.unref?.();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      clearInterval(quotaTimer);
      await Promise.all([
        inFlight?.catch(() => {}),
        quotaInFlight?.catch(() => {}),
      ]);
    },
  };
}
