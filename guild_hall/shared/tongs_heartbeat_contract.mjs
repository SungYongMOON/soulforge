// tongs_heartbeat_contract.mjs — the one definition of the Tongs(MCP 문) lane's
// on-disk heartbeat wire format: where a heartbeat file lives, what its exact
// field set and status vocabulary are, and the nullable-field rule a record
// must satisfy to be valid.
//
// Two independent apps read and write this shape and must never redeclare
// their own copy of it:
//
//   ui-workspace/apps/dev-erp-mcp/ops/tongs_lane_support.mjs
//     The Tongs loopback lane's own launcher support module — the writer.
//     Imports every export below and re-exports them, so its existing
//     importers (its own CLI, tongs_lane_support.test.mjs) keep working
//     unchanged.
//
//   ui-workspace/apps/team-ops-board/src/server/tongs-heartbeat-adapter.mjs
//     Vigil's read-only probe — the reader. Imports every export it needs
//     directly from this module, never from the lane module above: Vigil
//     (team-ops-board) runs from a built source lane
//     (guild_hall/deployment_pack, operations-lane-v3) that does not carry
//     dev-erp-mcp's files, so a direct import from there would resolve in
//     dev but fail at runtime in the built lane. A 2026-09-06 audit (session
//     claude_20260906_team_ops_adapter_enum_drift_audit) held the direct
//     team-ops-board -> dev-erp-mcp import this module replaces, pending an
//     Owner decision on where the contract should actually live. This file —
//     next to guild_hall/shared/soulforge_state_root.mjs, which the same
//     adapter already imports the same way — is that decision: neither app
//     imports the other; both import guild_hall/shared, which every source
//     lane (operations and tongs alike) can carry without creating an
//     app-to-app edge.
//
// See ui-workspace/apps/dev-erp-mcp/docs/TONGS_LANE_RUNBOOK_V0.md §5.1 for the
// full contract this module implements, including the fail-closed
// SOULFORGE_TONGS_STATE_ROOT state-root rule that stays with the adapter —
// state-root resolution is a per-consumer concern, not part of the wire
// format this module owns.
//
// Everything the Tongs lane needs beyond this wire format — the registration
// interval, the run-lock schema, the supervisor's restart-or-reuse decision,
// the preflight aggregator — stays in tongs_lane_support.mjs: those are
// lane-internal decisions Vigil never reads or reimplements.

import path from "node:path";

export const TONGS_HEARTBEAT_SCHEMA = "soulforge.tongs_lane.heartbeat.v1";
export const TONGS_SERVICES = Object.freeze(["erp_mcp", "ingress_mcp"]);
export const TONGS_HEARTBEAT_STATUSES = Object.freeze([
  "starting",
  "ready",
  "degraded",
  "stopped",
  "error",
]);
export const TONGS_STATE_DIRNAME = "operations/tongs";
// The service every Tongs registration always manages (see the runbook's §2
// table: the personal ERP MCP is "항상 관리 대상"/always managed, the ingress
// MCP is opt-in and OFF by default). A read-only external probe that wants a
// single "is Tongs up" answer — Vigil's team-ops-board snapshot — watches
// exactly this service rather than aggregating both.
export const TONGS_ALWAYS_MANAGED_SERVICE = "erp_mcp";
// 2.4x the registered task's own trigger repetition interval
// (TONGS_REGISTERED_TRIGGER_INTERVAL_MS = 300000ms, owned by
// tongs_lane_support.mjs — a lane-registration concern, not part of the wire
// format this module owns). Vigil's own freshness window is derived from
// this exact constant so the two sides cannot independently guess different
// numbers again (see tongs-heartbeat-adapter.mjs's
// DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS).
export const TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS = 720000;
// This exact field set is also the allowed-keys contract Vigil's adapter
// validates an on-disk heartbeat against.
export const HEARTBEAT_FIELDS = Object.freeze(["schema_version", "status", "observed_at", "pid", "listen"]);
// The env var name both the writer and the reader agree on for the lane's own
// state root, independent of the general SOULFORGE_STATE_ROOT/
// SOULFORGE_OWNER_ROOT override (docs/TONGS_LANE_RUNBOOK_V0.md §3/§5.1 — the
// two are allowed to diverge). Canonical here, not in either app, so neither
// tongs-heartbeat-adapter.mjs (Vigil, the reader) nor tongs_lane_support.mjs
// (the Tongs lane's own launcher support, the writer) can drift from the
// other's name for it; both import and re-export this exact binding.
export const TONGS_STATE_ROOT_ENV = "SOULFORGE_TONGS_STATE_ROOT";

const LISTEN_RE = /^127\.0\.0\.1:([0-9]{1,5})$/;

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// Parses a listen string against the exact same rule isValidListenTarget
// enforces and returns the port number, or null if the string is not
// "127.0.0.1:<port>" with the port inside the ephemeral+registered range
// [1024, 65535]. Exported so a consumer that also wants the numeric port
// (tongs-heartbeat-adapter.mjs's projection) does not hand-roll a second
// regex that can drift from this one's accepted set (2026-09-06 review, M1 —
// the adapter used to accept "localhost:" and "[::1]:" too, which this
// module's isValidTongsHeartbeatRecord never did).
export function parseTongsListenPort(value) {
  if (typeof value !== "string") return null;
  const match = LISTEN_RE.exec(value);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

export function isValidListenTarget(value) {
  return parseTongsListenPort(value) !== null;
}

// Exact-keys, fail-closed record validator, matching the convention every
// other lane's state schema in this repository uses. This is the "nullable
// rule" both sides must agree on: every status may leave pid and listen
// null, except "ready" — a "ready" service without a pid and a listen
// address is a contradiction.
export function isValidTongsHeartbeatRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...HEARTBEAT_FIELDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  if (value.schema_version !== TONGS_HEARTBEAT_SCHEMA) return false;
  if (!TONGS_HEARTBEAT_STATUSES.includes(value.status)) return false;
  if (typeof value.observed_at !== "string" || !Number.isFinite(Date.parse(value.observed_at))) return false;
  if (value.pid !== null && !isPositiveInt(value.pid)) return false;
  if (value.listen !== null && !isValidListenTarget(value.listen)) return false;
  if (value.status === "ready" && (value.pid === null || value.listen === null)) return false;
  return true;
}

// File name pattern + directory: "<state-root>/operations/tongs/<service>.heartbeat.v1.json".
export function tongsHeartbeatPath(stateRoot, service) {
  if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) fail("tongs_state_root_invalid");
  if (!TONGS_SERVICES.includes(service)) fail("tongs_service_invalid");
  return path.join(stateRoot, ...TONGS_STATE_DIRNAME.split("/"), `${service}.heartbeat.v1.json`);
}
