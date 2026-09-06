import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  TONGS_HEARTBEAT_FIELDS,
  TONGS_HEARTBEAT_REASONS,
  TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES,
  TONGS_PRIMARY_SERVICE,
  TONGS_SERVICES,
  TONGS_STATE_DIRNAME,
  isValidListenTarget,
  isValidTongsHeartbeatRecord,
  tongsHeartbeatFileName,
  tongsHeartbeatPathSegments,
  validateTongsHeartbeatRecord,
} from "./tongs_heartbeat_contract.mjs";

function readyRecord(overrides = {}) {
  return {
    schema_version: TONGS_HEARTBEAT_SCHEMA,
    status: "ready",
    observed_at: "2026-09-06T00:00:00.000Z",
    pid: 4242,
    listen: "127.0.0.1:4311",
    ...overrides,
  };
}

test("the contract names two services, the primary one first, under a fixed state directory", () => {
  assert.deepEqual([...TONGS_SERVICES], ["erp_mcp", "ingress_mcp"]);
  assert.equal(TONGS_PRIMARY_SERVICE, "erp_mcp");
  assert.equal(TONGS_STATE_DIRNAME, "operations/tongs");
  assert.deepEqual([...TONGS_HEARTBEAT_STATUSES], ["starting", "ready", "degraded", "stopped", "error"]);
  assert.deepEqual([...TONGS_HEARTBEAT_FIELDS], ["schema_version", "status", "observed_at", "pid", "listen"]);
});

test("heartbeat file names are per-service and versioned; unknown services are refused", () => {
  assert.equal(tongsHeartbeatFileName("erp_mcp"), "erp_mcp.heartbeat.v1.json");
  assert.equal(tongsHeartbeatFileName("ingress_mcp"), "ingress_mcp.heartbeat.v1.json");
  assert.deepEqual([...tongsHeartbeatPathSegments("erp_mcp")], ["operations", "tongs", "erp_mcp.heartbeat.v1.json"]);
  // The segments join into the exact path both the writer and Vigil use.
  const stateRoot = path.join(process.cwd(), "state");
  assert.match(
    path.join(stateRoot, ...tongsHeartbeatPathSegments("ingress_mcp")),
    /operations[\\/]tongs[\\/]ingress_mcp\.heartbeat\.v1\.json$/,
  );
  assert.throws(() => tongsHeartbeatFileName("heartbeat"), /tongs_service_invalid/);
  assert.throws(() => tongsHeartbeatPathSegments(""), /tongs_service_invalid/);
});

test("isValidListenTarget accepts only 127.0.0.1:<1024..65535>, the only spelling the writer produces", () => {
  assert.equal(isValidListenTarget("127.0.0.1:4311"), true);
  assert.equal(isValidListenTarget("127.0.0.1:1024"), true);
  assert.equal(isValidListenTarget("127.0.0.1:65535"), true);
  assert.equal(isValidListenTarget("127.0.0.1:1023"), false);
  assert.equal(isValidListenTarget("127.0.0.1:65536"), false);
  assert.equal(isValidListenTarget("0.0.0.0:4311"), false);
  assert.equal(isValidListenTarget("localhost:4311"), false);
  assert.equal(isValidListenTarget("[::1]:4311"), false);
  assert.equal(isValidListenTarget(4311), false);
  assert.equal(isValidListenTarget(null), false);
});

test("validateTongsHeartbeatRecord returns one reason per failing axis, in check order", () => {
  assert.deepEqual(validateTongsHeartbeatRecord(readyRecord()), { ok: true, reason: null });
  const cases = [
    [null, "tongs_heartbeat_not_object"],
    [[readyRecord()], "tongs_heartbeat_not_object"],
    [{ ...readyRecord(), extra: 1 }, "tongs_heartbeat_keys_unexpected"],
    [{ status: "ready", observed_at: readyRecord().observed_at }, "tongs_heartbeat_keys_unexpected"],
    // Vigil's former reader allowed an optional `schema` key; the writer never emits one.
    [{ ...readyRecord(), schema: TONGS_HEARTBEAT_SCHEMA }, "tongs_heartbeat_keys_unexpected"],
    [{ ...readyRecord(), schema_version: "other" }, "tongs_heartbeat_schema_version_unexpected"],
    // `listening` was Vigil's former word for `ready`; it is not in the contract.
    [{ ...readyRecord(), status: "listening" }, "tongs_heartbeat_status_unexpected"],
    [{ ...readyRecord(), observed_at: "not-a-date" }, "tongs_heartbeat_observed_at_invalid"],
    [{ ...readyRecord(), pid: 0 }, "tongs_heartbeat_pid_invalid"],
    [{ ...readyRecord(), pid: "4242" }, "tongs_heartbeat_pid_invalid"],
    [{ ...readyRecord(), listen: "0.0.0.0:4311" }, "tongs_heartbeat_listen_invalid"],
    [{ ...readyRecord(), listen: 4311 }, "tongs_heartbeat_listen_invalid"],
    [{ ...readyRecord(), pid: null }, "tongs_heartbeat_ready_incomplete"],
    [{ ...readyRecord(), listen: null }, "tongs_heartbeat_ready_incomplete"],
  ];
  for (const [record, reason] of cases) {
    const result = validateTongsHeartbeatRecord(record);
    assert.equal(result.ok, false, `${reason} must fail`);
    assert.equal(result.reason, reason);
    assert.ok(TONGS_HEARTBEAT_REASONS.includes(reason), `${reason} must be a published reason code`);
    assert.equal(isValidTongsHeartbeatRecord(record), false);
  }
});

test("every non-ready status may leave pid and listen null", () => {
  for (const status of TONGS_HEARTBEAT_STATUSES.filter((value) => value !== "ready")) {
    assert.equal(isValidTongsHeartbeatRecord(readyRecord({ status, pid: null, listen: null })), true, status);
    assert.equal(isValidTongsHeartbeatRecord(readyRecord({ status })), true, status);
  }
});
