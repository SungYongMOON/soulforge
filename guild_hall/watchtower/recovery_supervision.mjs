import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const RECOVERY_SUPERVISION_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_supervision.v1";
export const RECOVERY_HISTORY_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_history.v1";
export const RECOVERY_SUPERVISOR_SCHEMA_VERSION =
  "soulforge.watchtower.recovery_supervisor.v1";

// Fixed policy. The normal companion cycle stays 5 minutes; an unsuccessful
// eligible attempt backs the node off 5m, then 15m, then 60m. Three consecutive
// unsuccessful attempts open the circuit for 60m, after which exactly one
// half-open attempt is permitted. A verified repair resets both counters.
export const RECOVERY_NORMAL_CYCLE_MS = 5 * 60 * 1_000;
export const RECOVERY_BACKOFF_MS = Object.freeze([
  5 * 60 * 1_000,
  15 * 60 * 1_000,
  60 * 60 * 1_000,
]);
export const RECOVERY_CIRCUIT_OPEN_FAILURES = 3;
export const RECOVERY_CIRCUIT_OPEN_MS = 60 * 60 * 1_000;
export const RECOVERY_HISTORY_MAX_ENTRIES = 200;
export const RECOVERY_SUPERVISION_MAX_NODES = 64;
export const RECOVERY_MAX_CONSECUTIVE_FAILURES = 99;

export const RECOVERY_OUTCOME_CODES = Object.freeze([
  "verified_repair",
  "precondition_unmet",
  "execution_failed",
  "postverify_failed",
  "running_but_stale",
  "suppressed_backoff",
  "suppressed_circuit_open",
  "supervision_unavailable",
  "not_eligible",
  "forbidden",
  "observe_only",
]);
export const RECOVERY_CIRCUIT_STATES = Object.freeze(["closed", "open", "half_open"]);

const OUTCOME_SET = new Set(RECOVERY_OUTCOME_CODES);
const CIRCUIT_SET = new Set(RECOVERY_CIRCUIT_STATES);
// Only an eligible attempt that actually failed feeds backoff and the circuit.
// Suppression, forbidden actions, observe mode, and running-but-stale never
// invent an attempt and never move the counters.
const COUNTED_FAILURE_CODES = new Set([
  "precondition_unmet", "execution_failed", "postverify_failed",
]);
const ALWAYS_RECORDED_CODES = new Set([...COUNTED_FAILURE_CODES, "verified_repair"]);

const SAFE_NODE = /^[a-z][a-z0-9_]{0,127}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_STATE_BYTES = 256 * 1024;

const STATE_ROW_KEYS = [
  "node_id", "consecutive_failures", "circuit_state", "last_attempt_at",
  "last_verified_repair_at", "last_failure_code", "next_retry_at",
];
const HISTORY_ROW_KEYS = [
  "at", "node_id", "reason", "action", "attempt", "verification",
  "circuit_state", "next_retry_at", "outcome_code",
];
const SUPERVISOR_KEYS = [
  "schema_version", "attempted_at", "completed_at", "status",
  "last_success_at", "error_code", "consecutive_errors",
];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function exactTimestamp(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function optionalTimestamp(value) {
  return value === null || exactTimestamp(value);
}

function isoOrNull(milliseconds) {
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function recoverySupervisionPaths(evidenceRoot) {
  if (!path.isAbsolute(evidenceRoot ?? "")) throw new TypeError("recovery_evidence_root_invalid");
  return {
    state: path.join(evidenceRoot, "recovery_supervision.json"),
    history: path.join(evidenceRoot, "recovery_history.json"),
    supervisor: path.join(evidenceRoot, "recovery_supervisor.json"),
  };
}

export async function writeAtomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  await rename(temporary, file);
}

export function defaultSupervisionRow(nodeId) {
  if (!SAFE_NODE.test(nodeId ?? "")) throw new TypeError("recovery_supervision_node_invalid");
  return {
    node_id: nodeId,
    consecutive_failures: 0,
    circuit_state: "closed",
    last_attempt_at: null,
    last_verified_repair_at: null,
    last_failure_code: null,
    next_retry_at: null,
  };
}

function validSupervisionRow(row) {
  return hasExactKeys(row, STATE_ROW_KEYS)
    && SAFE_NODE.test(row.node_id)
    && Number.isSafeInteger(row.consecutive_failures)
    && row.consecutive_failures >= 0
    && row.consecutive_failures <= RECOVERY_MAX_CONSECUTIVE_FAILURES
    && CIRCUIT_SET.has(row.circuit_state)
    && optionalTimestamp(row.last_attempt_at)
    && optionalTimestamp(row.last_verified_repair_at)
    && (row.last_failure_code === null || (typeof row.last_failure_code === "string"
      && SAFE_CODE.test(row.last_failure_code) && OUTCOME_SET.has(row.last_failure_code)))
    && optionalTimestamp(row.next_retry_at);
}

export function validateSupervisionState(value) {
  if (!hasExactKeys(value, ["schema_version", "updated_at", "nodes"])
    || value.schema_version !== RECOVERY_SUPERVISION_SCHEMA_VERSION
    || !exactTimestamp(value.updated_at)
    || !Array.isArray(value.nodes)
    || value.nodes.length > RECOVERY_SUPERVISION_MAX_NODES) {
    throw new TypeError("recovery_supervision_invalid");
  }
  const seen = new Set();
  const nodes = value.nodes.map((row) => {
    if (!validSupervisionRow(row) || seen.has(row.node_id)) {
      throw new TypeError("recovery_supervision_row_invalid");
    }
    seen.add(row.node_id);
    return Object.fromEntries(STATE_ROW_KEYS.map((key) => [key, row[key]]));
  });
  return { schema_version: value.schema_version, updated_at: value.updated_at, nodes };
}

/**
 * Read the persisted per-node retry memory. An absent file is a legitimate
 * first run. A present-but-invalid file is not silently reset into "no
 * failures"; the caller must treat `ok === false` as suppression.
 */
export async function readSupervisionState({ evidenceRoot } = {}) {
  const { state: file } = recoverySupervisionPaths(evidenceRoot);
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: true, present: false, rows: [] };
    return { ok: false, present: true, rows: [] };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_STATE_BYTES) return { ok: false, present: true, rows: [] };
  try {
    return { ok: true, present: true, rows: validateSupervisionState(JSON.parse(text)).nodes };
  } catch {
    return { ok: false, present: true, rows: [] };
  }
}

export function validateRecoveryHistory(value) {
  if (!hasExactKeys(value, ["schema_version", "updated_at", "entries"])
    || value.schema_version !== RECOVERY_HISTORY_SCHEMA_VERSION
    || !exactTimestamp(value.updated_at)
    || !Array.isArray(value.entries)
    || value.entries.length > RECOVERY_HISTORY_MAX_ENTRIES) {
    throw new TypeError("recovery_history_invalid");
  }
  // One node appends at most one row per cycle, so a repeated node/time pair is
  // a replayed or hand-edited ledger rather than history.
  const seen = new Set();
  const entries = value.entries.map((row) => {
    if (!hasExactKeys(row, HISTORY_ROW_KEYS)
      || !exactTimestamp(row.at)
      || seen.has(`${row.node_id} ${row.at}`)
      || !SAFE_NODE.test(row.node_id)
      || !SAFE_CODE.test(row.reason)
      || !SAFE_CODE.test(row.action)
      || !SAFE_CODE.test(row.attempt)
      || !SAFE_CODE.test(row.verification)
      || !CIRCUIT_SET.has(row.circuit_state)
      || !optionalTimestamp(row.next_retry_at)
      || !OUTCOME_SET.has(row.outcome_code)) {
      throw new TypeError("recovery_history_row_invalid");
    }
    seen.add(`${row.node_id} ${row.at}`);
    return Object.fromEntries(HISTORY_ROW_KEYS.map((key) => [key, row[key]]));
  });
  return { schema_version: value.schema_version, updated_at: value.updated_at, entries };
}

export async function readRecoveryHistory({ evidenceRoot } = {}) {
  const { history: file } = recoverySupervisionPaths(evidenceRoot);
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: true, present: false, entries: [] };
    return { ok: false, present: true, entries: [] };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_STATE_BYTES) {
    return { ok: false, present: true, entries: [] };
  }
  try {
    return { ok: true, present: true, entries: validateRecoveryHistory(JSON.parse(text)).entries };
  } catch {
    return { ok: false, present: true, entries: [] };
  }
}

export function backoffMsForFailures(failures) {
  if (!Number.isSafeInteger(failures) || failures <= 0) return 0;
  return RECOVERY_BACKOFF_MS[Math.min(failures, RECOVERY_BACKOFF_MS.length) - 1];
}

/**
 * Decide whether the fixed policy permits a repair attempt for this node right
 * now. `half_open` is the single probe permitted once an open circuit has been
 * suppressed for the full 60 minute window.
 */
export function planNodeAttempt(row, nowMs) {
  if (!validSupervisionRow(row) || !Number.isFinite(nowMs)) {
    return { eligible: false, gate: "circuit_open", circuit_state: "open" };
  }
  const nextRetryMs = row.next_retry_at === null ? null : Date.parse(row.next_retry_at);
  if (row.circuit_state === "open") {
    if (nextRetryMs !== null && nowMs >= nextRetryMs) {
      return { eligible: true, gate: "half_open", circuit_state: "half_open" };
    }
    return { eligible: false, gate: "circuit_open", circuit_state: "open" };
  }
  if (nextRetryMs !== null && nowMs < nextRetryMs) {
    return { eligible: false, gate: "backoff_wait", circuit_state: row.circuit_state };
  }
  return { eligible: true, gate: "ready", circuit_state: "closed" };
}

/**
 * Fold one cycle outcome into the per-node retry memory. Only counted failure
 * codes move the counters; a verified repair is the only reset.
 */
export function applyAttemptOutcome(row, { outcomeCode, atMs } = {}) {
  const base = validSupervisionRow(row) ? row : defaultSupervisionRow(row?.node_id ?? "unknown_node");
  if (!OUTCOME_SET.has(outcomeCode) || !Number.isFinite(atMs)) return { ...base };
  const at = new Date(atMs).toISOString();
  if (outcomeCode === "verified_repair") {
    return {
      node_id: base.node_id,
      consecutive_failures: 0,
      circuit_state: "closed",
      last_attempt_at: at,
      last_verified_repair_at: at,
      last_failure_code: null,
      next_retry_at: null,
    };
  }
  if (!COUNTED_FAILURE_CODES.has(outcomeCode)) return { ...base };
  const failures = Math.min(base.consecutive_failures + 1, RECOVERY_MAX_CONSECUTIVE_FAILURES);
  const open = failures >= RECOVERY_CIRCUIT_OPEN_FAILURES;
  return {
    node_id: base.node_id,
    consecutive_failures: failures,
    circuit_state: open ? "open" : "closed",
    last_attempt_at: at,
    last_verified_repair_at: base.last_verified_repair_at,
    last_failure_code: outcomeCode,
    next_retry_at: isoOrNull(atMs + (open ? RECOVERY_CIRCUIT_OPEN_MS : backoffMsForFailures(failures))),
  };
}

/**
 * Classify the exact owned scheduled task before any action. A running task is
 * never stopped, restarted, or killed; it is escalated as owner action.
 */
export function classifyOwnedTaskGate(task, actionDigest) {
  if (!SHA256.test(actionDigest ?? "")) return "precondition_unmet";
  if (!isPlainObject(task) || task.exists !== true || task.enabled !== true
    || task.action_digest !== actionDigest) return "precondition_unmet";
  if (task.state === "running") return "running_but_stale";
  if (task.state === "ready" || task.state === "queued") return "startable";
  return "precondition_unmet";
}

export function buildHistoryRow({ at, nodeId, reason, action, attempt, verification, row, outcomeCode }) {
  return {
    at,
    node_id: nodeId,
    reason,
    action,
    attempt,
    verification,
    circuit_state: row.circuit_state,
    next_retry_at: row.next_retry_at,
    outcome_code: outcomeCode,
  };
}

/**
 * Append only material events. Executed attempts are always recorded so the
 * circuit opening stays auditable; repeated suppression or owner-action states
 * are recorded once per transition instead of once per cycle.
 */
export function appendRecoveryHistory(existing, rows, max = RECOVERY_HISTORY_MAX_ENTRIES) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const row of rows) {
    // Never emit a duplicate node/time pair; the reader rejects them, so a
    // repeated cycle timestamp must not be able to break the whole ledger.
    if (merged.some((entry) => entry.node_id === row.node_id && entry.at === row.at)) continue;
    const last = [...merged].reverse().find((entry) => entry.node_id === row.node_id);
    const material = ALWAYS_RECORDED_CODES.has(row.outcome_code)
      || last === undefined
      || last.outcome_code !== row.outcome_code
      || last.circuit_state !== row.circuit_state;
    if (material) merged.push(row);
  }
  return merged.slice(-max);
}

export async function persistSupervisionState({ evidenceRoot, rows, keepNodeIds, updatedAt }) {
  const allowed = keepNodeIds instanceof Set ? keepNodeIds : new Set(keepNodeIds ?? []);
  const kept = rows
    .filter((row) => allowed.has(row.node_id))
    .sort((left, right) => left.node_id.localeCompare(right.node_id, "en"))
    .slice(0, RECOVERY_SUPERVISION_MAX_NODES);
  const state = validateSupervisionState({
    schema_version: RECOVERY_SUPERVISION_SCHEMA_VERSION,
    updated_at: updatedAt,
    nodes: kept,
  });
  await writeAtomicJson(recoverySupervisionPaths(evidenceRoot).state, state);
  return state;
}

export async function persistRecoveryHistory({ evidenceRoot, entries, updatedAt }) {
  const history = validateRecoveryHistory({
    schema_version: RECOVERY_HISTORY_SCHEMA_VERSION,
    updated_at: updatedAt,
    entries: entries.slice(-RECOVERY_HISTORY_MAX_ENTRIES),
  });
  await writeAtomicJson(recoverySupervisionPaths(evidenceRoot).history, history);
  return history;
}

export function safeSupervisorErrorCode(error) {
  const message = error?.message;
  return typeof message === "string" && SAFE_CODE.test(message)
    ? message
    : "recovery_cycle_failed";
}

async function readPriorSupervisorReceipt(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!hasExactKeys(value, SUPERVISOR_KEYS)
      || value.schema_version !== RECOVERY_SUPERVISOR_SCHEMA_VERSION
      || !["ok", "error"].includes(value.status)
      || !optionalTimestamp(value.last_success_at)
      || !Number.isSafeInteger(value.consecutive_errors)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Make a failed supervisor cycle visible without exposing raw exception text.
 * The last-good cycle, supervision state, and history files are never rewritten
 * on failure, so current truth is retained.
 */
export async function persistRecoverySupervisorReceipt({
  evidenceRoot, attemptedAt, status, errorCode = null, now = () => new Date(),
} = {}) {
  if (!exactTimestamp(attemptedAt) || !["ok", "error"].includes(status)) {
    throw new TypeError("recovery_supervisor_receipt_invalid");
  }
  const file = recoverySupervisionPaths(evidenceRoot).supervisor;
  const prior = await readPriorSupervisorReceipt(file);
  const completedAt = now().toISOString();
  const receipt = {
    schema_version: RECOVERY_SUPERVISOR_SCHEMA_VERSION,
    attempted_at: attemptedAt,
    completed_at: completedAt,
    status,
    last_success_at: status === "ok" ? completedAt : prior?.last_success_at ?? null,
    error_code: status === "ok" ? null
      : typeof errorCode === "string" && SAFE_CODE.test(errorCode) ? errorCode : "recovery_cycle_failed",
    consecutive_errors: status === "ok" ? 0 : Math.min((prior?.consecutive_errors ?? 0) + 1, 9_999),
  };
  await writeAtomicJson(file, receipt);
  return receipt;
}
