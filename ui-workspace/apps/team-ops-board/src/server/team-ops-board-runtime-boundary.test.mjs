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
  classifyRuntimeRecovery,
  classifyRuntimeOwnership,
  closePreviewGracefully,
  createPublicRuntimeState,
  createPreviewConfig,
  createRuntimeBootstrapEnvelope,
  createRuntimeBootstrapPipe,
  createRuntimeWorkerEnvironment,
  createWmiWorkerCreationSpec,
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
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: "retained-in-memory",
    UNRELATED_API_KEY: "must-not-forward",
    GITHUB_TOKEN: "must-not-forward",
  };
  const defaultWorker = createRuntimeWorkerEnvironment(parent);
  assert.equal(parent.TEAM_OPS_BOARD_CLAUDE_QUOTA_READ, "1");
  assert.equal("TEAM_OPS_BOARD_CLAUDE_QUOTA_READ" in defaultWorker, false);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ in defaultWorker, false);
  assert.equal(defaultWorker.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY, "retained-in-memory");
  assert.equal("UNRELATED_API_KEY" in defaultWorker, false);
  assert.equal("GITHUB_TOKEN" in defaultWorker, false);
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

test("WMI creator command is job-independent and contains no protected environment values", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const bootstrapPipe = createRuntimeBootstrapPipe(runId);
  const syntheticDrive = `${String.fromCharCode(67)}${String.fromCharCode(58)}`;
  const nodePath = path.win32.join(syntheticDrive, "Program Files", "nodejs", "node.exe");
  const modulePath = path.win32.join(syntheticDrive, "public-safe", "team-ops-board-runtime.mjs");
  const systemRoot = path.win32.join(syntheticDrive, "Windows");
  assert.match(nodePath, /^[A-Z]:\\/u);
  assert.match(modulePath, /^[A-Z]:\\/u);
  assert.match(systemRoot, /^[A-Z]:\\/u);
  const spec = createWmiWorkerCreationSpec({
    runId,
    bootstrapPipe,
    nodePath,
    modulePath,
    systemRoot,
  });
  const encodedAt = spec.args.indexOf("-EncodedCommand");
  assert.ok(encodedAt >= 0);
  const decoded = Buffer.from(spec.args[encodedAt + 1], "base64").toString("utf16le");
  assert.match(spec.file, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/iu);
  assert.match(decoded, /Invoke-CimMethod -ClassName Win32_Process -MethodName Create/u);
  assert.match(decoded, /__worker_bootstrap/u);
  assert.match(decoded, /11111111-1111-4111-8111-111111111111/u);
  assert.match(decoded, /team-ops-board-runtime\.mjs/u);
  assert.match(decoded, /soulforge-team-ops-board-bootstrap/u);
  assert.doesNotMatch(decoded, /protected-host|credential-value|binding-value|account-value/u);
});

test("bootstrap envelope is run-id-attested and keeps the filtered environment memory-only", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const filtered = createRuntimeWorkerEnvironment({
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
    TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "0",
    TEAM_OPS_BOARD_CLAUDE_QUOTA_READ: "1",
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: "memory-only",
    UNRELATED_PASSWORD: "must-not-forward",
  });
  const envelope = createRuntimeBootstrapEnvelope(runId, filtered);
  assert.equal(envelope.run_id, runId);
  assert.equal(envelope.environment.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY, "memory-only");
  assert.equal("UNRELATED_PASSWORD" in envelope.environment, false);
  assert.equal("TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ" in envelope.environment, false);
  assert.equal("TEAM_OPS_BOARD_CLAUDE_QUOTA_READ" in envelope.environment, false);
  assert.throws(
    () => createRuntimeBootstrapEnvelope("wrong", filtered),
    /bootstrap_invalid/,
  );
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
  const failed = transitionRuntimeState(ready, "runtime_failed", "runtime_worker_failed");
  assert.equal(failed.state, "error");
  assert.equal(failed.failure_class, "runtime_worker_failed");
  assert.throws(() => transitionRuntimeState(stoppingFromReady, "preview_ready"), /runtime_state_ambiguous/);
  assert.equal(classifyRuntimeOwnership(null, null), "stopped");
});

test("stale-owner recovery requires every exact absence proof", () => {
  const state = { run_id: "11111111-1111-4111-8111-111111111111", pid: 1234 };
  const lock = { ...state };
  const safe = {
    state,
    lock,
    ownerAlive: false,
    controlAvailable: false,
    listenerState: "absent",
  };
  assert.equal(classifyRuntimeRecovery(safe), "recoverable");
  assert.equal(classifyRuntimeRecovery({ ...safe, ownerAlive: true }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, ownerAlive: null }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, controlAvailable: true }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, listenerState: "present" }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, listenerState: "ambiguous" }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, lock: { ...lock, pid: 9999 } }), "unsafe");
  assert.equal(classifyRuntimeRecovery({ ...safe, state: null }), "unsafe");
});

test("CLI and failure output remain bounded to public-safe classes", () => {
  for (const command of ["start", "status", "health", "stop", "recover", "--help"]) {
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
  assert.doesNotMatch(source, /\bspawn\s*\(/u);
  assert.doesNotMatch(source, /detached:\s*true/u);
  assert.match(source, /windowsHide:\s*true/u);
  assert.doesNotMatch(source, /Start-Process|cmd\.exe|\/c\s+start/iu);
  assert.match(source, /Invoke-CimMethod -ClassName Win32_Process -MethodName Create/u);
  assert.match(source, /receiveBootstrapEnvironment/u);
  assert.match(source, /message\?\.run_id !== runId/u);
  assert.match(source, /claimedPid !== expectedPid/u);
  assert.match(source, /bootstrapOwner\.setExpectedPid\(createdPid\)/u);
  assert.match(source, /RUNTIME_ENVIRONMENT_ALLOWLIST/u);
  assert.match(source, /if \(quotaReadEnabled\) workerEnv\[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\] = "1"/u);
  assert.match(source, /delete workerEnv\[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ\]/u);
  assert.match(source, /BOOTSTRAP_TIMEOUT_MS \+ 2_000/u);
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
  assert.match(source, /classifyRuntimeRecovery/u);
  assert.match(source, /process\.once\("uncaughtException"/u);
  assert.match(source, /process\.once\("unhandledRejection"/u);
  assert.match(source, /resolveTeamOpsBoardAllowedHosts/u);
});
