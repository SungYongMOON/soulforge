// tongs_heartbeat_contract.mjs — the one place the Tongs loopback lane (the
// writer, ui-workspace/apps/dev-erp-mcp/ops/tongs_lane_support.mjs) and Vigil
// (the reader, ui-workspace/apps/team-ops-board/src/server/tongs-heartbeat-adapter.mjs)
// agree on a heartbeat file: where it sits under the shared state root, which
// exact fields the record carries, and which status words it may use.
//
// Before this module existed the two apps each carried their own copy of the
// contract and the copies disagreed on every axis (file name, key set, status
// vocabulary, nullability), so a healthy lane projected as
// `tongs_heartbeat_absent` forever (found 2026-09-06 against a real lane
// build). Both sides now import these exports; a repository-level test on
// each side reads a file the real writer produced.
//
// Layout under the shared state root (SOULFORGE_STATE_ROOT, or
// <SOULFORGE_OWNER_ROOT>/guild_hall/state — see soulforge_state_root.mjs):
//
//   operations/tongs/erp_mcp.heartbeat.v1.json      personal ERP MCP (server.mjs, default 127.0.0.1:4311)
//   operations/tongs/ingress_mcp.heartbeat.v1.json  HPP evidence ingress MCP (ingress_server.mjs, only when configured)
//
// Record (exact keys, no more, no fewer):
//
//   {
//     "schema_version": "soulforge.tongs_lane.heartbeat.v1",
//     "status": "starting" | "ready" | "degraded" | "stopped" | "error",
//     "observed_at": "<ISO-8601>",
//     "pid": <positive integer> | null,
//     "listen": "127.0.0.1:<1024..65535>" | null
//   }
//
// `ready` must carry both a pid and a listen address; every other status may
// leave either or both null (a `stopped` ingress with the feature OFF is the
// normal case). This module is pure: no filesystem, clock, socket, or writer.

export const TONGS_HEARTBEAT_SCHEMA = "soulforge.tongs_lane.heartbeat.v1";
export const TONGS_SERVICES = Object.freeze(["erp_mcp", "ingress_mcp"]);
// The service whose heartbeat answers "is Tongs listening on 4311?"; the
// ingress service is optional and feature-gated, so a reader that must pick
// one status for the whole lane picks this one.
export const TONGS_PRIMARY_SERVICE = "erp_mcp";
export const TONGS_HEARTBEAT_STATUSES = Object.freeze([
  "starting",
  "ready",
  "degraded",
  "stopped",
  "error",
]);
export const TONGS_STATE_DIRNAME = "operations/tongs";
export const TONGS_HEARTBEAT_FIELDS = Object.freeze(["schema_version", "status", "observed_at", "pid", "listen"]);
// Reason codes `validateTongsHeartbeatRecord` can return, in the order the
// checks run. A reader that surfaces them (Vigil does) shows exactly these.
export const TONGS_HEARTBEAT_REASONS = Object.freeze([
  "tongs_heartbeat_not_object",
  "tongs_heartbeat_keys_unexpected",
  "tongs_heartbeat_schema_version_unexpected",
  "tongs_heartbeat_status_unexpected",
  "tongs_heartbeat_observed_at_invalid",
  "tongs_heartbeat_pid_invalid",
  "tongs_heartbeat_listen_invalid",
  "tongs_heartbeat_ready_incomplete",
]);

const LISTEN_RE = /^127\.0\.0\.1:([0-9]{1,5})$/;

export class TongsHeartbeatContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "TongsHeartbeatContractError";
    this.code = code;
  }
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function tongsHeartbeatFileName(service) {
  if (!TONGS_SERVICES.includes(service)) throw new TongsHeartbeatContractError("tongs_service_invalid");
  return `${service}.heartbeat.v1.json`;
}

// Path segments relative to the state root, ready for path.join(stateRoot, ...).
export function tongsHeartbeatPathSegments(service) {
  return Object.freeze([...TONGS_STATE_DIRNAME.split("/"), tongsHeartbeatFileName(service)]);
}

// Only the loopback host the lane launcher can bind, and only a port outside
// the privileged range. `localhost` and `[::1]` are not spellings the writer
// ever produces, so a reader must not accept them either.
export function isValidListenTarget(value) {
  if (typeof value !== "string") return false;
  const match = LISTEN_RE.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535;
}

// Exact-keys, fail-closed record validator with a reason code, matching the
// convention every other lane's state schema in this repository uses. The
// boolean wrapper below is what the writer uses; the reason is what Vigil shows.
export function validateTongsHeartbeatRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "tongs_heartbeat_not_object" };
  }
  const keys = Object.keys(value).sort();
  const expected = [...TONGS_HEARTBEAT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return { ok: false, reason: "tongs_heartbeat_keys_unexpected" };
  }
  if (value.schema_version !== TONGS_HEARTBEAT_SCHEMA) {
    return { ok: false, reason: "tongs_heartbeat_schema_version_unexpected" };
  }
  if (!TONGS_HEARTBEAT_STATUSES.includes(value.status)) {
    return { ok: false, reason: "tongs_heartbeat_status_unexpected" };
  }
  if (typeof value.observed_at !== "string" || !Number.isFinite(Date.parse(value.observed_at))) {
    return { ok: false, reason: "tongs_heartbeat_observed_at_invalid" };
  }
  if (value.pid !== null && !isPositiveInt(value.pid)) {
    return { ok: false, reason: "tongs_heartbeat_pid_invalid" };
  }
  if (value.listen !== null && !isValidListenTarget(value.listen)) {
    return { ok: false, reason: "tongs_heartbeat_listen_invalid" };
  }
  // A "ready" service without a pid and a listen address is a contradiction;
  // every other status may leave either or both null.
  if (value.status === "ready" && (value.pid === null || value.listen === null)) {
    return { ok: false, reason: "tongs_heartbeat_ready_incomplete" };
  }
  return { ok: true, reason: null };
}

export function isValidTongsHeartbeatRecord(value) {
  return validateTongsHeartbeatRecord(value).ok;
}
