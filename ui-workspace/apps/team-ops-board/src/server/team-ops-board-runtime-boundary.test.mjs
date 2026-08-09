import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEAM_OPS_BOARD_RUNTIME_HOST,
  TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_RUNTIME_PIPE,
  TEAM_OPS_BOARD_RUNTIME_PORT,
  authorizeRuntimeControl,
  classifyRuntimeOwnership,
  closePreviewGracefully,
  createPublicRuntimeState,
  createPreviewConfig,
  createRuntimeWorkerEnvironment,
  parseRuntimeCommand,
  runtimeHealthIsReady,
  sanitizeRuntimeFailure,
  transitionRuntimeState,
  validateRuntimeLaunchEnvironment,
} from "../../ops/team-ops-board-runtime.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SOURCE = path.resolve(HERE, "..", "..", "ops", "team-ops-board-runtime.mjs");

test("runtime launch requires exact pilot and one parser-approved protected host", () => {
  assert.throws(() => validateRuntimeLaunchEnvironment({}), /pilot_required/);
  assert.throws(
    () => validateRuntimeLaunchEnvironment({
      TEAM_OPS_BOARD_READ_ONLY_PILOT: "true",
      TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
    }),
    /pilot_required/,
  );
  assert.throws(
    () => validateRuntimeLaunchEnvironment({ TEAM_OPS_BOARD_READ_ONLY_PILOT: "1" }),
    /allowed_host_unavailable/,
  );
  assert.throws(
    () => validateRuntimeLaunchEnvironment({
      TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
      TEAM_OPS_BOARD_ALLOWED_HOSTS: "127.0.0.1",
    }),
    /allowed_host_unavailable/,
  );
  assert.deepEqual(validateRuntimeLaunchEnvironment({
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
  }), { read_only_pilot: true, allowed_host_count: 1 });
});

test("detached worker maps only exact operator quota intent without mutating its parent", () => {
  const parent = {
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
    TEAM_OPS_BOARD_CLAUDE_QUOTA_READ: "1",
    SYNTHETIC_BINDING: "retained-in-memory",
  };
  const defaultWorker = createRuntimeWorkerEnvironment(parent);
  assert.equal(parent.TEAM_OPS_BOARD_CLAUDE_QUOTA_READ, "1");
  assert.equal("TEAM_OPS_BOARD_CLAUDE_QUOTA_READ" in defaultWorker, false);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ in defaultWorker, false);
  assert.equal(defaultWorker.SYNTHETIC_BINDING, "retained-in-memory");
  assert.equal(defaultWorker.TEAM_OPS_BOARD_READ_ONLY_PILOT, "1");

  const exactParent = {
    ...parent,
    [TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ]: "1",
  };
  const exactWorker = createRuntimeWorkerEnvironment(exactParent);
  assert.equal(exactWorker.TEAM_OPS_BOARD_CLAUDE_QUOTA_READ, "1");
  assert.equal(TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ in exactWorker, false);
  assert.equal(exactParent[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ], "1");
  assert.equal(exactParent.TEAM_OPS_BOARD_CLAUDE_QUOTA_READ, "1");

  for (const malformed of ["", " ", "0", "true", " 1", "1 ", 1, null]) {
    const malformedParent = {
      ...parent,
      [TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ]: malformed,
    };
    const malformedWorker = createRuntimeWorkerEnvironment(malformedParent);
    assert.equal("TEAM_OPS_BOARD_CLAUDE_QUOTA_READ" in malformedWorker, false);
    assert.equal(TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ in malformedWorker, false);
    assert.equal(malformedParent[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ], malformed);
  }
});

test("runtime preview is fixed to strict loopback 4192", () => {
  const config = createPreviewConfig();
  assert.equal(TEAM_OPS_BOARD_RUNTIME_HOST, "127.0.0.1");
  assert.equal(TEAM_OPS_BOARD_RUNTIME_PORT, 4192);
  assert.equal(config.preview.host, "127.0.0.1");
  assert.equal(config.preview.port, 4192);
  assert.equal(config.preview.strictPort, true);
  assert.match(config.configFile, /vite\.config\.ts$/u);
  assert.match(TEAM_OPS_BOARD_RUNTIME_PIPE, /^\\\\\.\\pipe\\/u);
});

test("control requests require the exact attributable run id", () => {
  const state = { run_id: "11111111-1111-4111-8111-111111111111" };
  assert.deepEqual(authorizeRuntimeControl(state, { action: "health", run_id: state.run_id }), {
    ok: true,
    outcome: "health",
  });
  assert.deepEqual(authorizeRuntimeControl(state, { action: "stop", run_id: "other" }), {
    ok: false,
    outcome: "identity_mismatch",
  });
  assert.deepEqual(authorizeRuntimeControl(state, { action: "replace", run_id: state.run_id }), {
    ok: false,
    outcome: "control_unavailable",
  });
});

test("graceful stop closes the exact preview owner once", async () => {
  let closeCount = 0;
  await closePreviewGracefully({ close: async () => { closeCount += 1; } });
  assert.equal(closeCount, 1);
  await assert.rejects(() => closePreviewGracefully(null), /runtime_stop_ambiguous/);
});

test("synthetic lifecycle keeps ownership, readiness, and stop transitions fail closed", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const starting = {
    state: "starting",
    run_id: runId,
    pid: 1234,
    port: 4192,
    started_at: "2026-08-10T00:00:00.000Z",
    build_sha256: null,
    failure_class: null,
  };
  const lock = { run_id: runId, pid: 1234 };
  assert.equal(classifyRuntimeOwnership(null, null), "stopped");
  assert.equal(classifyRuntimeOwnership(starting, lock), "owned");
  assert.equal(classifyRuntimeOwnership(starting, { ...lock, pid: 9999 }), "ambiguous");
  assert.equal(createPublicRuntimeState(starting).ok, false);
  assert.equal(runtimeHealthIsReady(starting, { ok: true, run_id: runId }, true), false);

  const ready = transitionRuntimeState(starting, "preview_ready");
  assert.equal(ready.state, "ready");
  assert.equal(createPublicRuntimeState(ready).ok, true);
  assert.equal(runtimeHealthIsReady(ready, { ok: true, run_id: runId }, true), true);
  assert.equal(runtimeHealthIsReady(ready, { ok: true, run_id: "other" }, true), false);
  assert.equal(runtimeHealthIsReady(ready, { ok: true, run_id: runId }, false), false);

  const stoppingFromStart = transitionRuntimeState(starting, "stop_requested");
  const stoppingFromReady = transitionRuntimeState(ready, "stop_requested");
  assert.equal(stoppingFromStart.state, "stopping");
  assert.equal(stoppingFromReady.state, "stopping");
  assert.equal(createPublicRuntimeState(stoppingFromReady, { ok: true }).ok, false);
  assert.throws(() => transitionRuntimeState(stoppingFromReady, "preview_ready"), /runtime_state_ambiguous/);
  assert.equal(classifyRuntimeOwnership(null, null), "stopped");
});

test("CLI and failure output remain bounded to public-safe classes", () => {
  for (const command of ["start", "status", "health", "stop", "--help"]) {
    assert.equal(parseRuntimeCommand([command]), command);
  }
  assert.throws(() => parseRuntimeCommand(["start", "extra"]), /control_unavailable/);
  assert.equal(sanitizeRuntimeFailure({ code: "EADDRINUSE" }), "port_unavailable");
  assert.equal(sanitizeRuntimeFailure(new Error("protected payload")), "runtime_start_failed");
  const publicState = createPublicRuntimeState({
    state: "ready",
    run_id: "11111111-1111-4111-8111-111111111111",
    pid: 1234,
    port: 4192,
    started_at: "2026-08-10T00:00:00.000Z",
    build_sha256: "a".repeat(64),
    failure_class: null,
    protected_path: "must-not-project",
    credential: "must-not-project",
    allowed_host: "must-not-project",
    runtime_quota_intent: "must-not-project",
  });
  assert.deepEqual(Object.keys(publicState).sort(), [
    "build_sha256", "host", "ok", "outcome", "pid", "port", "run_id",
    "schema_version", "started_at", "state",
  ]);
  assert.equal(JSON.stringify(publicState).includes("must-not-project"), false);
});

test("tracked runtime has no exposure, force-kill, persistence, or protected-value logging surface", async () => {
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  assert.doesNotMatch(source, /0\.0\.0\.0|ListenOnLan|firewall|taskkill|Stop-Process|schtasks|autostart|service create/iu);
  assert.doesNotMatch(source, /tailscale|funnel/iu);
  assert.doesNotMatch(source, /TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\s*[:=]/u);
  assert.doesNotMatch(source, /console\.(?:log|error)|RedirectStandard|\.out\.log|\.err\.log/u);
  assert.match(source, /detached:\s*true/u);
  assert.match(source, /windowsHide:\s*true/u);
  assert.match(source, /stdio:\s*"ignore"/u);
  assert.match(source, /delete workerEnv\[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\]/u);
  assert.match(source, /delete workerEnv\[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ\]/u);
  assert.doesNotMatch(
    source,
    /api\.anthropic\.com|api\/oauth\/usage|anthropic-version|x-api-key|bearer/iu,
  );
  assert.match(source, /open\(paths\.lock,\s*"wx"\)/u);
  assert.match(source, /runtime_state_ambiguous/u);
  assert.match(source, /requestOwnedStop\(paths, timedOutState\)/u);
  assert.match(source, /socket\.setTimeout\(CONTROL_TIMEOUT_MS/u);
  assert.match(source, /for \(const socket of owner\.sockets\) socket\.destroy\(\)/u);
  assert.match(source, /await previewServer\.close\(\)/u);
  assert.match(source, /resolveTeamOpsBoardAllowedHosts/u);
});
