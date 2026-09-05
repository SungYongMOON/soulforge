import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  TONGS_HEARTBEAT_SCHEMA,
  buildTongsHeartbeatRecord,
  decideTongsSupervisorAction,
  evaluateTongsPreflight,
  isValidListenTarget,
  isValidTongsHeartbeatRecord,
  summarizeTongsLane,
  tongsHeartbeatIsFresh,
  tongsHeartbeatPath,
} from "./tongs_lane_support.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(HERE, "tongs_lane_support.mjs");

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

test("isValidListenTarget accepts only loopback host:port in the ephemeral+registered range", () => {
  assert.equal(isValidListenTarget("127.0.0.1:4311"), true);
  assert.equal(isValidListenTarget("127.0.0.1:1024"), true);
  assert.equal(isValidListenTarget("127.0.0.1:65535"), true);
  assert.equal(isValidListenTarget("127.0.0.1:1023"), false);
  assert.equal(isValidListenTarget("127.0.0.1:65536"), false);
  assert.equal(isValidListenTarget("0.0.0.0:4311"), false);
  assert.equal(isValidListenTarget("localhost:4311"), false);
  assert.equal(isValidListenTarget("127.0.0.1"), false);
  assert.equal(isValidListenTarget(4311), false);
  assert.equal(isValidListenTarget(null), false);
});

test("isValidTongsHeartbeatRecord enforces exact keys and the ready+pid+listen invariant", () => {
  assert.equal(isValidTongsHeartbeatRecord(readyRecord()), true);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), extra: 1 }), false);
  const { pid, ...missingPid } = readyRecord();
  void pid;
  assert.equal(isValidTongsHeartbeatRecord(missingPid), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), schema_version: "other" }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), status: "unknown" }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), observed_at: "not-a-date" }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), pid: 0 }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), pid: -1 }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), listen: "0.0.0.0:4311" }), false);
  // "ready" without a pid or listen is a contradiction.
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), pid: null }), false);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), listen: null }), false);
  // Every other status may leave both null.
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), status: "stopped", pid: null, listen: null }), true);
  assert.equal(isValidTongsHeartbeatRecord({ ...readyRecord(), status: "starting", pid: null, listen: null }), true);
  assert.equal(isValidTongsHeartbeatRecord(null), false);
  assert.equal(isValidTongsHeartbeatRecord([readyRecord()]), false);
});

test("buildTongsHeartbeatRecord builds a valid record and rejects an invalid one", () => {
  const record = buildTongsHeartbeatRecord({ status: "starting", observedAt: "2026-09-06T00:00:00.000Z" });
  assert.deepEqual(record, {
    schema_version: TONGS_HEARTBEAT_SCHEMA,
    status: "starting",
    observed_at: "2026-09-06T00:00:00.000Z",
    pid: null,
    listen: null,
  });
  assert.throws(() => buildTongsHeartbeatRecord({ status: "bogus" }), /tongs_heartbeat_invalid/);
  // "ready" requires pid+listen even through the builder.
  assert.throws(() => buildTongsHeartbeatRecord({ status: "ready" }), /tongs_heartbeat_invalid/);
});

test("tongsHeartbeatPath joins the fixed operations/tongs directory and rejects bad input", () => {
  // An absolute path computed from process.cwd() rather than a hardcoded
  // drive-letter/POSIX-root literal, so this fixture never resembles a
  // concrete local absolute path to the repository's own path-policy scanner.
  const absoluteRoot = path.join(process.cwd(), "state");
  const result = tongsHeartbeatPath(absoluteRoot, "erp_mcp");
  assert.match(result, /operations[\\/]tongs[\\/]erp_mcp\.heartbeat\.v1\.json$/);
  assert.throws(() => tongsHeartbeatPath("relative/state", "erp_mcp"), /tongs_state_root_invalid/);
  assert.throws(
    () => tongsHeartbeatPath(absoluteRoot, "not_a_service"),
    /tongs_service_invalid/,
  );
});

test("tongsHeartbeatIsFresh compares observed_at against now and a required max age", () => {
  const record = readyRecord({ observed_at: "2026-09-06T00:00:00.000Z" });
  const observedMs = Date.parse(record.observed_at);
  assert.equal(tongsHeartbeatIsFresh(record, { now: observedMs, maxAgeMs: 1000 }), true);
  assert.equal(tongsHeartbeatIsFresh(record, { now: observedMs + 999, maxAgeMs: 1000 }), true);
  assert.equal(tongsHeartbeatIsFresh(record, { now: observedMs + 1001, maxAgeMs: 1000 }), false);
  assert.equal(tongsHeartbeatIsFresh(record, { now: observedMs - 1, maxAgeMs: 1000 }), false);
  assert.equal(tongsHeartbeatIsFresh({ ...record, status: "bogus" }, { now: observedMs, maxAgeMs: 1000 }), false);
  assert.throws(() => tongsHeartbeatIsFresh(record, { now: observedMs, maxAgeMs: 0 }), /tongs_max_age_invalid/);
  assert.throws(() => tongsHeartbeatIsFresh(record, { now: observedMs, maxAgeMs: -5 }), /tongs_max_age_invalid/);
});

test("decideTongsSupervisorAction starts when there is no evidence of a live, fresh, healthy process", () => {
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: null, processAlive: false }),
    { action: "start", reason: "no_heartbeat" },
  );
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: { bogus: true }, processAlive: true }),
    { action: "start", reason: "heartbeat_invalid" },
  );
  assert.deepEqual(
    decideTongsSupervisorAction({
      heartbeat: buildTongsHeartbeatRecord({ status: "stopped" }),
      processAlive: false,
    }),
    { action: "start", reason: "heartbeat_status_stopped" },
  );
  assert.deepEqual(
    decideTongsSupervisorAction({
      heartbeat: buildTongsHeartbeatRecord({ status: "error" }),
      processAlive: true,
    }),
    { action: "start", reason: "heartbeat_status_error" },
  );
  const fresh = readyRecord({ observed_at: new Date(1000).toISOString() });
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: fresh, processAlive: false, now: 1500, maxHeartbeatAgeMs: 60000 }),
    { action: "start", reason: "process_not_alive" },
  );
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: fresh, processAlive: true, now: 1000 + 60001, maxHeartbeatAgeMs: 60000 }),
    { action: "start", reason: "heartbeat_stale" },
  );
});

test("decideTongsSupervisorAction reuses a fresh, alive, ready service", () => {
  const fresh = readyRecord({ observed_at: new Date(1000).toISOString() });
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: fresh, processAlive: true, now: 1000 + 59999, maxHeartbeatAgeMs: 60000 }),
    { action: "reuse", reason: "heartbeat_fresh_and_process_alive" },
  );
  const starting = buildTongsHeartbeatRecord({ status: "starting", observedAt: new Date(1000).toISOString() });
  assert.deepEqual(
    decideTongsSupervisorAction({ heartbeat: starting, processAlive: true, now: 1000, maxHeartbeatAgeMs: 60000 }),
    { action: "reuse", reason: "heartbeat_fresh_and_process_alive" },
  );
});

test("evaluateTongsPreflight passes only when every applicable check is true", () => {
  const allGood = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: true,
    entryInsideLaneRoot: true,
    ingressRequested: false,
  });
  assert.equal(allGood.ok, true);
  assert.deepEqual(allGood.failed_checks, []);
  assert.equal("ingress_config_present" in allGood.checks, false);

  const missingEntry = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: false,
    entryInsideLaneRoot: true,
    ingressRequested: false,
  });
  assert.equal(missingEntry.ok, false);
  assert.deepEqual(missingEntry.failed_checks, ["entry_path_present"]);

  const ingressMissingConfig = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: true,
    entryInsideLaneRoot: true,
    ingressRequested: true,
    ingressConfigPresent: false,
    ingressConfigValid: null,
  });
  assert.equal(ingressMissingConfig.ok, false);
  assert.deepEqual(
    ingressMissingConfig.failed_checks.sort(),
    ["ingress_config_present", "ingress_config_valid"].sort(),
  );

  const ingressGood = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: true,
    entryInsideLaneRoot: true,
    ingressRequested: true,
    ingressConfigPresent: true,
    ingressConfigValid: true,
  });
  assert.equal(ingressGood.ok, true);
});

test("summarizeTongsLane folds per-service heartbeats with a worst-first priority", () => {
  assert.equal(summarizeTongsLane().overall_status, "unknown");
  assert.equal(
    summarizeTongsLane({ erpHeartbeat: readyRecord(), ingressHeartbeat: readyRecord() }).overall_status,
    "ready",
  );
  assert.equal(
    summarizeTongsLane({
      erpHeartbeat: readyRecord(),
      ingressHeartbeat: buildTongsHeartbeatRecord({ status: "error" }),
    }).overall_status,
    "error",
  );
  assert.equal(
    summarizeTongsLane({
      erpHeartbeat: readyRecord(),
      ingressHeartbeat: buildTongsHeartbeatRecord({ status: "degraded" }),
    }).overall_status,
    "degraded",
  );
  assert.equal(
    summarizeTongsLane({ erpHeartbeat: null, ingressHeartbeat: null }).overall_status,
    "unknown",
  );
  assert.equal(
    summarizeTongsLane({ erpHeartbeat: { bogus: true } }).overall_status,
    "error",
  );
});

// --- CLI round-trip: proves the argv plumbing and file I/O without ever
// opening a network listener. Uses a scratch directory under the OS temp
// root, never a repository or lane path.
test("CLI preflight, write-heartbeat, read-heartbeat, and decide round-trip through real files", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "tongs-lane-support-test-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const stateRoot = path.join(scratch, "state");
  // Real wall-clock "now", not a fixed literal: the CLI's `decide` subcommand
  // compares against a live Date.now(), and this repository's sandbox clock
  // does not necessarily agree with any particular calendar date.
  const observedAt = new Date().toISOString();

  const write = spawnSync(process.execPath, [
    CLI_PATH,
    "write-heartbeat",
    "--state-root", stateRoot,
    "--service", "erp_mcp",
    "--status", "ready",
    "--pid", "4242",
    "--listen", "127.0.0.1:4311",
    "--observed-at", observedAt,
  ]);
  assert.equal(write.status, 0, write.stderr.toString());
  const writeResult = JSON.parse(write.stdout.toString());
  assert.equal(writeResult.ok, true);
  assert.equal(writeResult.record.status, "ready");

  const read = spawnSync(process.execPath, [
    CLI_PATH,
    "read-heartbeat",
    "--state-root", stateRoot,
    "--service", "erp_mcp",
  ]);
  assert.equal(read.status, 0, read.stderr.toString());
  const readResult = JSON.parse(read.stdout.toString());
  assert.equal(readResult.present, true);
  assert.equal(readResult.record.pid, 4242);

  const decideReuse = spawnSync(process.execPath, [
    CLI_PATH,
    "decide",
    "--state-root", stateRoot,
    "--service", "erp_mcp",
    "--process-alive", "true",
    "--max-heartbeat-age-ms", "999999999",
  ]);
  assert.equal(decideReuse.status, 0, decideReuse.stderr.toString());
  assert.deepEqual(JSON.parse(decideReuse.stdout.toString()), {
    action: "reuse",
    reason: "heartbeat_fresh_and_process_alive",
  });

  const decideStart = spawnSync(process.execPath, [
    CLI_PATH,
    "decide",
    "--state-root", stateRoot,
    "--service", "erp_mcp",
    "--process-alive", "false",
  ]);
  assert.equal(decideStart.status, 0, decideStart.stderr.toString());
  assert.deepEqual(JSON.parse(decideStart.stdout.toString()), {
    action: "start",
    reason: "process_not_alive",
  });

  const decideMissingService = spawnSync(process.execPath, [
    CLI_PATH,
    "decide",
    "--state-root", stateRoot,
    "--service", "ingress_mcp",
    "--process-alive", "true",
  ]);
  assert.equal(decideMissingService.status, 0, decideMissingService.stderr.toString());
  assert.deepEqual(JSON.parse(decideMissingService.stdout.toString()), {
    action: "start",
    reason: "no_heartbeat",
  });

  // preflight against the real app directory this test file itself lives in
  // (the actual server.mjs and the actual src/ingress_mcp_service.mjs), so the
  // ingress branch exercises the real loadIngressMcpConfig() call rather than
  // a stubbed boolean. No network is opened either way.
  const realLaneRoot = path.resolve(HERE, "..");
  const realEntryPath = path.join(realLaneRoot, "server.mjs");

  const preflightOk = spawnSync(process.execPath, [
    CLI_PATH,
    "preflight",
    "--node-path", process.execPath,
    "--entry-path", realEntryPath,
    "--lane-root", realLaneRoot,
  ]);
  assert.equal(preflightOk.status, 0, preflightOk.stderr.toString());
  const preflightOkResult = JSON.parse(preflightOk.stdout.toString());
  assert.equal(preflightOkResult.ok, true);
  assert.equal(preflightOkResult.network_used, false);
  assert.equal(preflightOkResult.resolved_listen, null);

  const outsideEntryPath = path.join(scratch, "outside", "server.mjs");
  await mkdtempWriteFixture(path.dirname(outsideEntryPath), outsideEntryPath);
  const preflightOutside = spawnSync(process.execPath, [
    CLI_PATH,
    "preflight",
    "--node-path", process.execPath,
    "--entry-path", outsideEntryPath,
    "--lane-root", realLaneRoot,
  ]);
  assert.equal(preflightOutside.status, 1);
  const preflightOutsideResult = JSON.parse(preflightOutside.stdout.toString());
  assert.equal(preflightOutsideResult.ok, false);
  assert.ok(preflightOutsideResult.failed_checks.includes("entry_inside_lane_root"));

  // A present-but-structurally-invalid ingress binding: this exercises the
  // real dynamic import + loadIngressMcpConfig() call end to end and proves
  // it fails closed with a specific code instead of throwing uncaught or
  // silently passing.
  const badIngressConfigPath = path.join(scratch, "ingress-binding.json");
  const { writeFile: writeConfigFile } = await import("node:fs/promises");
  await writeConfigFile(badIngressConfigPath, "{}\n", "utf8");
  const preflightBadIngress = spawnSync(process.execPath, [
    CLI_PATH,
    "preflight",
    "--node-path", process.execPath,
    "--entry-path", path.join(realLaneRoot, "ingress_server.mjs"),
    "--lane-root", realLaneRoot,
    "--ingress-config", badIngressConfigPath,
  ]);
  assert.equal(preflightBadIngress.status, 1);
  const preflightBadIngressResult = JSON.parse(preflightBadIngress.stdout.toString());
  assert.equal(preflightBadIngressResult.ok, false);
  assert.ok(preflightBadIngressResult.failed_checks.includes("ingress_config_valid"));
  assert.equal(preflightBadIngressResult.ingress_config_error_code, "invalid_ingress_mcp_config");
  assert.equal(preflightBadIngressResult.resolved_listen, null);
});

async function mkdtempWriteFixture(directory, entryPath) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
  await writeFile(entryPath, "// synthetic fixture entry point, not a real server\n", "utf8");
}
