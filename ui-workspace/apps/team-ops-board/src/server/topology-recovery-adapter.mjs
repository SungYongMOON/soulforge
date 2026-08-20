import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export const TOPOLOGY_RECOVERY_PATH = "/topology-recovery.snapshot.json";
// v3 carries the supervision fields, the bounded sanitized history (v2), the
// supervisor attempt receipt, and diagnostic gating. A v1 or v2 cycle receipt is never reinterpreted as v3.
export const TOPOLOGY_RECOVERY_PROJECTION_SCHEMA =
  "soulforge.team_ops_board.topology_recovery_projection.v3";
export const TOPOLOGY_RECOVERY_CYCLE_SCHEMA =
  "soulforge.watchtower.recovery_cycle.v3";
export const TOPOLOGY_RECOVERY_HISTORY_SCHEMA =
  "soulforge.watchtower.recovery_history.v2";
export const TOPOLOGY_RECOVERY_SUPERVISOR_SCHEMA =
  "soulforge.watchtower.recovery_supervisor.v1";

const MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1_000;
const MAX_HISTORY_ENTRIES = 200;
// Observed times may not be in the future beyond local clock skew. `next_retry_at`
// is the one field that is expected to be in the future and is exempt.
const CLOCK_SKEW_MS = 5_000;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_.-]{0,127}$/u;
const MODE_SET = new Set(["observe", "safe-repair"]);
const STATUS_SET = new Set(["ok", "attention"]);
const REPAIRABILITY_SET = new Set([
  "not_needed", "not_declared", "forbidden", "observe_only",
  "not_available", "not_allowlisted", "allowlisted",
]);
const ATTEMPT_SET = new Set(["not_attempted", "denied", "succeeded", "failed"]);
const VERIFICATION_SET = new Set(["not_run", "passed", "failed"]);
const OUTCOME_SET = new Set([
  "verified_repair", "not_verified", "owner_action_required",
  "precondition_unmet", "execution_failed", "postverify_failed",
  "running_but_stale", "suppressed_backoff", "suppressed_circuit_open",
  "supervision_unavailable", "not_eligible", "forbidden", "observe_only",
]);
const CIRCUIT_SET = new Set(["closed", "open", "half_open"]);
const ROOT_KEYS = [
  "schema_version", "attempted_at", "completed_at", "mode", "status",
  "state_revalidated", "evidence", "recovery",
];
const RECOVERY_KEYS = [
  "node_id", "reason", "diagnostic_code", "repairability", "repair_action", "attempt", "verification",
  "escalation", "outcome_code", "circuit_state", "consecutive_failures",
  "last_attempt_at", "last_verified_repair_at", "next_retry_at",
];
const HISTORY_ROOT_KEYS = ["schema_version", "updated_at", "entries"];
const HISTORY_ROW_KEYS = [
  "at", "node_id", "reason", "diagnostic_code", "action", "attempt", "verification",
  "circuit_state", "next_retry_at", "outcome_code",
];
const SUPERVISOR_KEYS = [
  "schema_version", "attempted_at", "completed_at", "status",
  "last_success_at", "error_code", "consecutive_errors",
];

function validateOutcomeConsistency(row) {
  const { outcome_code, attempt, verification, diagnostic_code } = row;
  const action = row.repair_action ?? row.action;
  if (outcome_code === "verified_repair") {
    if (attempt !== "succeeded" || verification !== "passed" || diagnostic_code !== null) return false;
  } else if (outcome_code === "not_verified") {
    if (attempt !== "succeeded" || !["failed", "not_run"].includes(verification) || diagnostic_code !== null) return false;
  } else if (outcome_code === "postverify_failed") {
    if (attempt !== "succeeded" || verification !== "failed" || diagnostic_code !== null) return false;
  } else if (outcome_code === "owner_action_required") {
    if (!["denied", "not_attempted"].includes(attempt)
      || verification !== "not_run"
      || (action !== undefined && action !== "none")
      || typeof diagnostic_code !== "string"
      || !SAFE_IDENTIFIER.test(diagnostic_code)) return false;
  } else if (outcome_code === "precondition_unmet") {
    if (attempt !== "denied" || verification !== "failed" || diagnostic_code !== null) return false;
  } else if (outcome_code === "execution_failed") {
    if (attempt !== "failed" || diagnostic_code !== null) return false;
  } else {
    if (!["denied", "not_attempted"].includes(attempt) || diagnostic_code !== null) return false;
  }
  return true;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function exactTimestamp(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function optionalTimestamp(value) {
  return value === null || exactTimestamp(value) !== null;
}

function observedTimestamp(value, now) {
  const milliseconds = exactTimestamp(value);
  return milliseconds !== null && milliseconds <= now + CLOCK_SKEW_MS;
}

function optionalObservedTimestamp(value, now) {
  return value === null || observedTimestamp(value, now);
}

function unavailable(state = "unavailable", observedAt = new Date().toISOString()) {
  return {
    schema_version: TOPOLOGY_RECOVERY_PROJECTION_SCHEMA,
    state,
    observed_at: observedAt,
    cycle: null,
    history: { state: "unavailable", entries: [] },
    supervisor: null,
  };
}

export function validateTopologyRecoveryCycle(value, { now = Date.now() } = {}) {
  if (!hasExactKeys(value, ROOT_KEYS)
    || value.schema_version !== TOPOLOGY_RECOVERY_CYCLE_SCHEMA
    || !MODE_SET.has(value.mode)
    || !STATUS_SET.has(value.status)
    || typeof value.state_revalidated !== "boolean"
    || !isPlainObject(value.evidence)
    || !Array.isArray(value.recovery)
    || value.recovery.length > 64) {
    throw new TypeError("topology_recovery_cycle_invalid");
  }
  const attemptedAt = exactTimestamp(value.attempted_at);
  const completedAt = exactTimestamp(value.completed_at);
  if (attemptedAt === null || completedAt === null || attemptedAt > completedAt
    || completedAt > now + CLOCK_SKEW_MS) {
    throw new TypeError("topology_recovery_time_invalid");
  }
  const nodeIds = new Set();
  const recovery = value.recovery.map((row) => {
    if (!hasExactKeys(row, RECOVERY_KEYS)
      || !SAFE_IDENTIFIER.test(row.node_id)
      || !SAFE_IDENTIFIER.test(row.reason)
      || (row.diagnostic_code !== null && (typeof row.diagnostic_code !== "string" || !SAFE_IDENTIFIER.test(row.diagnostic_code)))
      || !REPAIRABILITY_SET.has(row.repairability)
      || !SAFE_IDENTIFIER.test(row.repair_action)
      || !ATTEMPT_SET.has(row.attempt)
      || !VERIFICATION_SET.has(row.verification)
      || !SAFE_IDENTIFIER.test(row.escalation)
      || !OUTCOME_SET.has(row.outcome_code)
      || !CIRCUIT_SET.has(row.circuit_state)
      || !Number.isSafeInteger(row.consecutive_failures)
      || row.consecutive_failures < 0 || row.consecutive_failures > 99
      || !optionalObservedTimestamp(row.last_attempt_at, now)
      || !optionalObservedTimestamp(row.last_verified_repair_at, now)
      || !optionalTimestamp(row.next_retry_at)
      || !validateOutcomeConsistency(row)
      || nodeIds.has(row.node_id)) {
      throw new TypeError("topology_recovery_row_invalid");
    }
    nodeIds.add(row.node_id);
    return Object.fromEntries(RECOVERY_KEYS.map((key) => [key, row[key]]));
  });
  return {
    schema_version: value.schema_version,
    attempted_at: value.attempted_at,
    completed_at: value.completed_at,
    mode: value.mode,
    status: value.status,
    state_revalidated: value.state_revalidated,
    recovery,
  };
}

/**
 * Bounded sanitized history. Nothing here may carry raw output, local paths,
 * task names, command lines, provider data, or secrets; the exact key set and
 * bounded enums are the enforcement point.
 */
export function validateTopologyRecoveryHistory(value, { now = Date.now() } = {}) {
  if (!hasExactKeys(value, HISTORY_ROOT_KEYS)
    || value.schema_version !== TOPOLOGY_RECOVERY_HISTORY_SCHEMA
    || !observedTimestamp(value.updated_at, now)
    || !Array.isArray(value.entries)
    || value.entries.length > MAX_HISTORY_ENTRIES) {
    throw new TypeError("topology_recovery_history_invalid");
  }
  // One node writes at most one row per cycle, so a repeated node/time pair is a
  // malformed or replayed ledger, not history. It also keeps the rendered list key stable.
  const seen = new Set();
  const entries = value.entries.map((row) => {
    if (!hasExactKeys(row, HISTORY_ROW_KEYS)
      || !observedTimestamp(row.at, now)
      || !SAFE_IDENTIFIER.test(row.node_id)
      || !SAFE_IDENTIFIER.test(row.reason)
      || (row.diagnostic_code !== null && (typeof row.diagnostic_code !== "string" || !SAFE_IDENTIFIER.test(row.diagnostic_code)))
      || !SAFE_IDENTIFIER.test(row.action)
      || !ATTEMPT_SET.has(row.attempt)
      || !VERIFICATION_SET.has(row.verification)
      || !CIRCUIT_SET.has(row.circuit_state)
      || !optionalTimestamp(row.next_retry_at)
      || !OUTCOME_SET.has(row.outcome_code)
      || !validateOutcomeConsistency(row)
      || seen.has(JSON.stringify([row.node_id, row.at]))) {
      throw new TypeError("topology_recovery_history_row_invalid");
    }
    seen.add(JSON.stringify([row.node_id, row.at]));
    return Object.fromEntries(HISTORY_ROW_KEYS.map((key) => [key, row[key]]));
  });
  return { updated_at: value.updated_at, entries };
}

export function validateTopologyRecoverySupervisor(value, { now = Date.now() } = {}) {
  if (!hasExactKeys(value, SUPERVISOR_KEYS)
    || value.schema_version !== TOPOLOGY_RECOVERY_SUPERVISOR_SCHEMA
    || !observedTimestamp(value.attempted_at, now)
    || !observedTimestamp(value.completed_at, now)
    || exactTimestamp(value.attempted_at) > exactTimestamp(value.completed_at)
    || !["ok", "error"].includes(value.status)
    || !optionalObservedTimestamp(value.last_success_at, now)
    || (value.error_code !== null && !SAFE_IDENTIFIER.test(value.error_code))
    || !Number.isSafeInteger(value.consecutive_errors)
    || value.consecutive_errors < 0 || value.consecutive_errors > 9_999) {
    throw new TypeError("topology_recovery_supervisor_invalid");
  }
  return Object.fromEntries(SUPERVISOR_KEYS.map((key) => [key, value[key]]));
}

export function resolveTopologyRecoveryEvidenceRoot(ownerRoot) {
  if (typeof ownerRoot !== "string" || !path.isAbsolute(ownerRoot)) {
    throw new TypeError("topology_recovery_owner_root_invalid");
  }
  return path.join(
    path.resolve(ownerRoot),
    "guild_hall", "state", "operations", "watchtower", "external_evidence",
  );
}

export function resolveTopologyRecoveryCyclePath(ownerRoot) {
  return path.join(resolveTopologyRecoveryEvidenceRoot(ownerRoot), "recovery_cycle.json");
}

async function readBoundedJson(file) {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > MAX_BYTES) {
    throw new Error("topology_recovery_file_invalid");
  }
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("topology_recovery_file_invalid");
  return JSON.parse(text);
}

export async function readTopologyRecoveryProjection({
  ownerRoot,
  now = Date.now,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) {
  const observedNow = now();
  const observedAt = new Date(observedNow).toISOString();
  let evidenceRoot;
  let cycle;
  try {
    evidenceRoot = resolveTopologyRecoveryEvidenceRoot(ownerRoot);
    cycle = validateTopologyRecoveryCycle(
      await readBoundedJson(path.join(evidenceRoot, "recovery_cycle.json")),
      { now: observedNow },
    );
  } catch {
    return unavailable("unavailable", observedAt);
  }
  // History and the supervisor receipt are independent files. Each one fails
  // closed to "unavailable" on its own instead of degrading the validated cycle
  // or exposing partially trusted rows.
  let history = { state: "unavailable", entries: [] };
  try {
    const validated = validateTopologyRecoveryHistory(
      await readBoundedJson(path.join(evidenceRoot, "recovery_history.json")),
      { now: observedNow },
    );
    history = { state: "ready", entries: validated.entries };
  } catch {
    history = { state: "unavailable", entries: [] };
  }
  let supervisor = null;
  try {
    supervisor = validateTopologyRecoverySupervisor(
      await readBoundedJson(path.join(evidenceRoot, "recovery_supervisor.json")),
      { now: observedNow },
    );
  } catch {
    supervisor = null;
  }
  const completedAt = Date.parse(cycle.completed_at);
  return {
    schema_version: TOPOLOGY_RECOVERY_PROJECTION_SCHEMA,
    state: observedNow - completedAt <= maxAgeMs ? "ready" : "stale",
    observed_at: observedAt,
    cycle,
    history,
    supervisor,
  };
}

export function createTopologyRecoveryAdapterPlugin(options = {}) {
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== TOPOLOGY_RECOVERY_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      void readTopologyRecoveryProjection(options).then((projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      }, () => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(unavailable()));
      });
    });
  };
  return {
    name: "soulforge-topology-recovery-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
