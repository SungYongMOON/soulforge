import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  HEARTBEAT_FIELDS,
  TONGS_ALWAYS_MANAGED_SERVICE,
  TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
  TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES,
  TONGS_REGISTERED_TRIGGER_INTERVAL_MS,
  TONGS_SERVICES,
  TONGS_STATE_DIRNAME,
  buildTongsHeartbeatRecord,
  decideTongsSupervisorAction,
  evaluateLockClaim,
  evaluateTongsPreflight,
  isValidListenTarget,
  isValidTongsHeartbeatRecord,
  summarizeTongsLane,
  tongsHeartbeatIsFresh,
  tongsHeartbeatPath,
} from "./tongs_lane_support.mjs";
import {
  HEARTBEAT_FIELDS as SHARED_HEARTBEAT_FIELDS,
  TONGS_ALWAYS_MANAGED_SERVICE as SHARED_TONGS_ALWAYS_MANAGED_SERVICE,
  TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS as SHARED_TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
  TONGS_HEARTBEAT_SCHEMA as SHARED_TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES as SHARED_TONGS_HEARTBEAT_STATUSES,
  TONGS_SERVICES as SHARED_TONGS_SERVICES,
  TONGS_STATE_DIRNAME as SHARED_TONGS_STATE_DIRNAME,
  isValidListenTarget as sharedIsValidListenTarget,
  isValidTongsHeartbeatRecord as sharedIsValidTongsHeartbeatRecord,
  tongsHeartbeatPath as sharedTongsHeartbeatPath,
} from "../../../../guild_hall/shared/tongs_heartbeat_contract.mjs";

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

// Contract test: this module re-exports the heartbeat wire-format contract
// from guild_hall/shared/tongs_heartbeat_contract.mjs instead of redeclaring
// it (see this module's own header). Assert reference equality (===), not
// just equal values, so a future edit that accidentally reintroduces a local
// copy here — rather than an import — fails this test even if the copy's
// values happen to still match today.
test("this module's contract exports are the exact guild_hall/shared bindings, not a local copy", () => {
  assert.strictEqual(HEARTBEAT_FIELDS, SHARED_HEARTBEAT_FIELDS);
  assert.strictEqual(TONGS_ALWAYS_MANAGED_SERVICE, SHARED_TONGS_ALWAYS_MANAGED_SERVICE);
  assert.strictEqual(TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS, SHARED_TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS);
  assert.strictEqual(TONGS_HEARTBEAT_SCHEMA, SHARED_TONGS_HEARTBEAT_SCHEMA);
  assert.strictEqual(TONGS_HEARTBEAT_STATUSES, SHARED_TONGS_HEARTBEAT_STATUSES);
  assert.strictEqual(TONGS_SERVICES, SHARED_TONGS_SERVICES);
  assert.strictEqual(TONGS_STATE_DIRNAME, SHARED_TONGS_STATE_DIRNAME);
  assert.strictEqual(isValidListenTarget, sharedIsValidListenTarget);
  assert.strictEqual(isValidTongsHeartbeatRecord, sharedIsValidTongsHeartbeatRecord);
  assert.strictEqual(tongsHeartbeatPath, sharedTongsHeartbeatPath);
});

test("the default heartbeat freshness window is at least 2x the registered task's own repetition interval", () => {
  // M2: a max-age equal to (or barely above) the trigger interval leaves a
  // reuse decision with near-zero margin against ordinary Task Scheduler
  // lateness, which flips reuse -> start and races the still-live incumbent
  // (see run-tongs-loopback.ps1's adopt path). This constant is shared by
  // this module, run-tongs-loopback.ps1, and register-tongs-task.ps1 — this
  // test pins the relationship, not just the raw number, so a future edit
  // that raises the trigger interval without raising this window fails loud.
  assert.ok(TONGS_REGISTERED_TRIGGER_INTERVAL_MS > 0);
  assert.ok(
    TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS >= 2 * TONGS_REGISTERED_TRIGGER_INTERVAL_MS,
    `default max heartbeat age (${TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS}ms) must be >= 2x the registered `
      + `trigger interval (${TONGS_REGISTERED_TRIGGER_INTERVAL_MS}ms)`,
  );
});

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
    moduleResolves: true,
    ingressRequested: false,
  });
  assert.equal(allGood.ok, true);
  assert.deepEqual(allGood.failed_checks, []);
  assert.equal("ingress_config_present" in allGood.checks, false);

  const missingEntry = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: false,
    entryInsideLaneRoot: true,
    moduleResolves: false,
    ingressRequested: false,
  });
  assert.equal(missingEntry.ok, false);
  assert.deepEqual(missingEntry.failed_checks.sort(), ["entry_path_present", "module_resolves"].sort());

  // M6: a lane built against the wrong --previous-lane carries the entry
  // file (entry_path_present true) but not its node_modules closure, so
  // module_resolves is the only check that catches it.
  const missingDependencyClosure = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: true,
    entryInsideLaneRoot: true,
    moduleResolves: false,
    ingressRequested: false,
  });
  assert.equal(missingDependencyClosure.ok, false);
  assert.deepEqual(missingDependencyClosure.failed_checks, ["module_resolves"]);

  const ingressMissingConfig = evaluateTongsPreflight({
    nodePathPresent: true,
    entryPathPresent: true,
    entryInsideLaneRoot: true,
    moduleResolves: true,
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
    moduleResolves: true,
    ingressRequested: true,
    ingressConfigPresent: true,
    ingressConfigValid: true,
  });
  assert.equal(ingressGood.ok, true);
});

test("evaluateLockClaim acquires a free lock, blocks on a live holder, and reclaims a dead one", () => {
  assert.deepEqual(evaluateLockClaim({ existingLock: null, holderAlive: false }), { acquired: true });
  assert.deepEqual(
    evaluateLockClaim({ existingLock: { pid: 4242 }, holderAlive: true }),
    { acquired: false, holder_pid: 4242 },
  );
  assert.deepEqual(
    evaluateLockClaim({ existingLock: { pid: 4242 }, holderAlive: false }),
    { acquired: true, reclaimed_from_pid: 4242 },
  );
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
  // M6: the real server.mjs imports @modelcontextprotocol/sdk and zod
  // transitively (via src/tools.mjs); this proves preflight actually
  // resolves that closure instead of only checking file presence.
  assert.equal(preflightOkResult.checks.module_resolves, true);
  assert.equal(preflightOkResult.module_resolution_error_code, null);

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
  assert.equal(preflightBadIngressResult.ingress_enabled, null);
});

// M6: a lane assembled with the wrong --previous-lane carries the entry file
// but not its node_modules closure; this proves preflight's module_resolves
// check catches exactly that instead of only checking file presence.
test("CLI preflight fails closed on a missing third-party dependency instead of only checking presence", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "tongs-lane-support-test-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const { writeFile: writeEntryFixture } = await import("node:fs/promises");
  const brokenEntryPath = path.join(scratch, "broken-entry.mjs");
  await writeEntryFixture(
    brokenEntryPath,
    'import "sf-tongs-lane-test-nonexistent-package-xyz";\n'
      + "// synthetic fixture: syntactically valid, but its bare import can never resolve.\n",
    "utf8",
  );

  const preflightBrokenEntry = spawnSync(process.execPath, [
    CLI_PATH,
    "preflight",
    "--node-path", process.execPath,
    "--entry-path", brokenEntryPath,
    "--lane-root", scratch,
  ]);
  assert.equal(preflightBrokenEntry.status, 1);
  const result = JSON.parse(preflightBrokenEntry.stdout.toString());
  assert.equal(result.ok, false);
  assert.ok(result.failed_checks.includes("module_resolves"));
  assert.equal(result.checks.entry_path_present, true);
  assert.equal(result.checks.entry_inside_lane_root, true);
  assert.equal(result.module_resolution_error_code, "ERR_MODULE_NOT_FOUND");
});

test("CLI preflight surfaces a structurally valid but disabled ingress binding", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "tongs-lane-support-test-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const { mkdir: mkdirFixture, writeFile: writeFixture } = await import("node:fs/promises");
  const stateRoot = path.join(scratch, "state");
  const submissionRoot = path.join(stateRoot, "submissions");
  await mkdirFixture(submissionRoot, { recursive: true });
  const authRegistryPath = path.join(scratch, "ingress_auth_registry.v1.json");
  await writeFixture(
    authRegistryPath,
    `${JSON.stringify({ schema_version: "soulforge.ingress.mcp_auth_registry.v1", revision: 0, tokens: [] })}\n`,
    "utf8",
  );
  const localOutboxBindingPath = path.join(scratch, "local_outbox_binding.v1.json");
  await writeFixture(localOutboxBindingPath, "{}\n", "utf8");
  const disabledConfigPath = path.join(scratch, "ingress-binding-disabled.json");
  await writeFixture(disabledConfigPath, `${JSON.stringify({
    schema_version: "soulforge.ingress.mcp_binding.v1",
    enabled: false,
    node_id: "tongs-lane-test-node",
    listen_host: "127.0.0.1",
    listen_port: 48500,
    public_url: "http://127.0.0.1:48500",
    local_outbox_binding_path: localOutboxBindingPath,
    auth_registry_path: authRegistryPath,
    state_root: stateRoot,
    submission_root: submissionRoot,
    max_file_bytes: 1048576,
    chunk_bytes: 65536,
    ticket_ttl_seconds: 3600,
    max_open_uploads_per_credential: 4,
    max_pending_upload_bytes_per_credential: 4194304,
    max_retained_upload_bytes_per_credential: 8388608,
  })}\n`, "utf8");

  const realLaneRoot = path.resolve(HERE, "..");
  const preflightDisabled = spawnSync(process.execPath, [
    CLI_PATH,
    "preflight",
    "--node-path", process.execPath,
    "--entry-path", path.join(realLaneRoot, "ingress_server.mjs"),
    "--lane-root", realLaneRoot,
    "--ingress-config", disabledConfigPath,
  ]);
  assert.equal(preflightDisabled.status, 0, preflightDisabled.stderr.toString());
  const result = JSON.parse(preflightDisabled.stdout.toString());
  assert.equal(result.ok, true);
  assert.equal(result.checks.ingress_config_valid, true);
  // A structurally valid binding with enabled:false is a green preflight,
  // exactly as the runbook's default-OFF contract requires — but the
  // launcher must read ingress_enabled itself before it decides to spawn
  // (see run-tongs-loopback.ps1's skip branch), because a green preflight
  // here does not mean the service can actually come up.
  assert.equal(result.ingress_enabled, false);
});

test("CLI acquire-lock/release-lock round-trip through real files and a real live-pid probe", async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), "tongs-lane-support-test-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const stateRoot = path.join(scratch, "state");

  // This test process's own pid is a real, verifiably-alive pid for the
  // duration of the test, without spawning anything: exactly the fixture
  // acquire-lock's real process.kill(pid, 0) probe needs to prove the
  // "still held" branch without any timing flakiness.
  const ownPid = String(process.pid);

  const firstAcquire = spawnSync(process.execPath, [
    CLI_PATH, "acquire-lock", "--state-root", stateRoot, "--pid", ownPid,
  ]);
  assert.equal(firstAcquire.status, 0, firstAcquire.stderr.toString());
  assert.deepEqual(JSON.parse(firstAcquire.stdout.toString()), { acquired: true });

  // A second acquire while the first holder (this test process) is alive
  // must fail closed and name the live holder, never silently steal the lock.
  const secondAcquire = spawnSync(process.execPath, [
    CLI_PATH, "acquire-lock", "--state-root", stateRoot, "--pid", "999999",
  ]);
  assert.equal(secondAcquire.status, 1);
  assert.deepEqual(JSON.parse(secondAcquire.stdout.toString()), { acquired: false, holder_pid: process.pid });

  // A pid that does not exist on this host at all: process.kill(pid, 0)
  // throws ESRCH, so a lock "held" by it is stale and must be reclaimed
  // rather than block forever.
  const staleLockPath = path.join(stateRoot, "operations", "tongs", "run.lock.v1.json");
  const { writeFile: writeLockFixture } = await import("node:fs/promises");
  await writeLockFixture(
    staleLockPath,
    `${JSON.stringify({ schema_version: "soulforge.tongs_lane.run_lock.v1", pid: 999999, acquired_at: new Date().toISOString() })}\n`,
    "utf8",
  );
  const reclaimAcquire = spawnSync(process.execPath, [
    CLI_PATH, "acquire-lock", "--state-root", stateRoot, "--pid", ownPid,
  ]);
  assert.equal(reclaimAcquire.status, 0, reclaimAcquire.stderr.toString());
  assert.deepEqual(JSON.parse(reclaimAcquire.stdout.toString()), { acquired: true, reclaimed_from_pid: 999999 });

  // release-lock is a no-op (not an error) for a pid that does not hold the
  // lock, and actually removes the file for the pid that does.
  const wrongRelease = spawnSync(process.execPath, [
    CLI_PATH, "release-lock", "--state-root", stateRoot, "--pid", "999999",
  ]);
  assert.equal(wrongRelease.status, 0, wrongRelease.stderr.toString());
  assert.deepEqual(JSON.parse(wrongRelease.stdout.toString()), { released: false });

  const rightRelease = spawnSync(process.execPath, [
    CLI_PATH, "release-lock", "--state-root", stateRoot, "--pid", ownPid,
  ]);
  assert.equal(rightRelease.status, 0, rightRelease.stderr.toString());
  assert.deepEqual(JSON.parse(rightRelease.stdout.toString()), { released: true });

  const acquireAfterRelease = spawnSync(process.execPath, [
    CLI_PATH, "acquire-lock", "--state-root", stateRoot, "--pid", ownPid,
  ]);
  assert.equal(acquireAfterRelease.status, 0, acquireAfterRelease.stderr.toString());
  assert.deepEqual(JSON.parse(acquireAfterRelease.stdout.toString()), { acquired: true });
});

test("CLI acquire-lock fails closed on a present-but-unparseable lock file instead of granting it", async (t) => {
  // Regression test: an earlier version treated ANY read/parse failure the
  // same as "no lock file yet", which silently handed out the lock over a
  // file that merely could not be parsed. This was caught live (not by
  // `node --check`, which cannot see it) against a lock file a PowerShell
  // `Set-Content -Encoding utf8` fixture had written with a leading UTF-8
  // BOM — real content, a real still-alive holder pid, just one byte
  // sequence JSON.parse refuses. The fix must fail closed on that instead
  // of granting the lock.
  const scratch = await mkdtemp(path.join(tmpdir(), "tongs-lane-support-test-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const stateRoot = path.join(scratch, "state");
  const lockDirectory = path.join(stateRoot, "operations", "tongs");
  const { mkdir: mkdirFixture, writeFile: writeLockFixture } = await import("node:fs/promises");
  await mkdirFixture(lockDirectory, { recursive: true });
  const lockPath = path.join(lockDirectory, "run.lock.v1.json");
  const bom = "﻿";
  await writeLockFixture(
    lockPath,
    `${bom}${JSON.stringify({ schema_version: "soulforge.tongs_lane.run_lock.v1", pid: process.pid, acquired_at: new Date().toISOString() })}\n`,
    "utf8",
  );

  const acquireAttempt = spawnSync(process.execPath, [
    CLI_PATH, "acquire-lock", "--state-root", stateRoot, "--pid", "777777",
  ]);
  assert.equal(acquireAttempt.status, 1);
  assert.match(acquireAttempt.stderr.toString(), /tongs_lock_unreadable/);
  assert.equal(acquireAttempt.stdout.toString(), "");
});

async function mkdtempWriteFixture(directory, entryPath) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
  await writeFile(entryPath, "// synthetic fixture entry point, not a real server\n", "utf8");
}
