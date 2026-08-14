import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

export const TOPOLOGY_RECOVERY_PATH = "/topology-recovery.snapshot.json";
export const TOPOLOGY_RECOVERY_PROJECTION_SCHEMA =
  "soulforge.team_ops_board.topology_recovery_projection.v1";
export const TOPOLOGY_RECOVERY_CYCLE_SCHEMA =
  "soulforge.watchtower.recovery_cycle.v1";

const MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_AGE_MS = 15 * 60 * 1_000;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_.-]{0,127}$/u;
const MODE_SET = new Set(["observe", "safe-repair"]);
const STATUS_SET = new Set(["ok", "attention"]);
const REPAIRABILITY_SET = new Set([
  "not_needed", "not_declared", "forbidden", "observe_only",
  "not_available", "not_allowlisted", "allowlisted",
]);
const ATTEMPT_SET = new Set(["not_attempted", "denied", "succeeded", "failed"]);
const VERIFICATION_SET = new Set(["not_run", "passed", "failed"]);
const ROOT_KEYS = [
  "schema_version", "attempted_at", "completed_at", "mode", "status", "evidence", "recovery",
];
const RECOVERY_KEYS = [
  "node_id", "reason", "repairability", "repair_action", "attempt", "verification", "escalation",
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
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function unavailable(state = "unavailable", observedAt = new Date().toISOString()) {
  return {
    schema_version: TOPOLOGY_RECOVERY_PROJECTION_SCHEMA,
    state,
    observed_at: observedAt,
    cycle: null,
  };
}

export function validateTopologyRecoveryCycle(value, { now = Date.now() } = {}) {
  if (!hasExactKeys(value, ROOT_KEYS)
    || value.schema_version !== TOPOLOGY_RECOVERY_CYCLE_SCHEMA
    || !MODE_SET.has(value.mode)
    || !STATUS_SET.has(value.status)
    || !isPlainObject(value.evidence)
    || !Array.isArray(value.recovery)
    || value.recovery.length > 64) {
    throw new TypeError("topology_recovery_cycle_invalid");
  }
  const attemptedAt = exactTimestamp(value.attempted_at);
  const completedAt = exactTimestamp(value.completed_at);
  if (attemptedAt === null || completedAt === null || attemptedAt > completedAt || completedAt > now + 5_000) {
    throw new TypeError("topology_recovery_time_invalid");
  }
  const nodeIds = new Set();
  const recovery = value.recovery.map((row) => {
    if (!hasExactKeys(row, RECOVERY_KEYS)
      || !SAFE_IDENTIFIER.test(row.node_id)
      || !SAFE_IDENTIFIER.test(row.reason)
      || !REPAIRABILITY_SET.has(row.repairability)
      || !SAFE_IDENTIFIER.test(row.repair_action)
      || !ATTEMPT_SET.has(row.attempt)
      || !VERIFICATION_SET.has(row.verification)
      || !SAFE_IDENTIFIER.test(row.escalation)
      || nodeIds.has(row.node_id)) {
      throw new TypeError("topology_recovery_row_invalid");
    }
    nodeIds.add(row.node_id);
    return {
      node_id: row.node_id,
      reason: row.reason,
      repairability: row.repairability,
      repair_action: row.repair_action,
      attempt: row.attempt,
      verification: row.verification,
      escalation: row.escalation,
    };
  });
  return {
    schema_version: value.schema_version,
    attempted_at: value.attempted_at,
    completed_at: value.completed_at,
    mode: value.mode,
    status: value.status,
    recovery,
  };
}

export function resolveTopologyRecoveryCyclePath(ownerRoot) {
  if (typeof ownerRoot !== "string" || !path.isAbsolute(ownerRoot)) {
    throw new TypeError("topology_recovery_owner_root_invalid");
  }
  return path.join(
    path.resolve(ownerRoot),
    "guild_hall", "state", "operations", "watchtower", "external_evidence", "recovery_cycle.json",
  );
}

export async function readTopologyRecoveryProjection({
  ownerRoot,
  now = Date.now,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) {
  const observedNow = now();
  const observedAt = new Date(observedNow).toISOString();
  try {
    const cyclePath = resolveTopologyRecoveryCyclePath(ownerRoot);
    const metadata = await lstat(cyclePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > MAX_BYTES) {
      throw new Error("topology_recovery_file_invalid");
    }
    const text = await readFile(cyclePath, "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("topology_recovery_file_invalid");
    const cycle = validateTopologyRecoveryCycle(JSON.parse(text), { now: observedNow });
    const completedAt = Date.parse(cycle.completed_at);
    return {
      schema_version: TOPOLOGY_RECOVERY_PROJECTION_SCHEMA,
      state: observedNow - completedAt <= maxAgeMs ? "ready" : "stale",
      observed_at: observedAt,
      cycle,
    };
  } catch {
    return unavailable("unavailable", observedAt);
  }
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
