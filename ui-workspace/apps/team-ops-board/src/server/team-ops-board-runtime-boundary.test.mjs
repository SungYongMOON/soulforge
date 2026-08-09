import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEAM_OPS_BOARD_RUNTIME_HOST,
  TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES,
  TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE,
  TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_RUNTIME_PIPE,
  TEAM_OPS_BOARD_RUNTIME_PORT,
  TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES,
  TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT,
  TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL,
  TEAM_OPS_BOARD_RUNTIME_TASK_NAME,
  authorizeRuntimeControl,
  classifyRuntimeObservation,
  classifyRuntimeRecovery,
  classifyRuntimeTermination,
  classifyScheduledTaskResult,
  classifyRuntimeOwnership,
  closePreviewGracefully,
  createPublicScheduledTaskState,
  createPublicRuntimeState,
  createPreviewConfig,
  createRuntimeWorkerEnvironment,
  createScheduledRuntimeEnvironment,
  createScheduledHelperEnvironment,
  createScheduledLaunchIntentEnvelope,
  createScheduledTaskDefinition,
  createScheduledTaskPowerShellSpec,
  createTerminationReceipt,
  deriveAllowedHostFromServeStatus,
  parseRuntimeCommand,
  isTerminationReceipt,
  refreshRuntimeHeartbeat,
  runtimeHeartbeatIsFresh,
  runtimeHealthIsReady,
  sanitizeRuntimeFailure,
  scheduledTaskInspectionIsExact,
  scheduledTaskUnregisterIsSafe,
  scheduledQuotaReadRequested,
  transitionRuntimeState,
  transitionRuntimeDesiredState,
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

test("manual worker maps only exact operator quota intent without mutating its parent", () => {
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

test("scheduled task is on-demand, interactive, limited, and contains no protected values", () => {
  const syntheticDrive = `${String.fromCharCode(67)}${String.fromCharCode(58)}`;
  const nodePath = path.win32.join(syntheticDrive, "Program Files", "nodejs", "node.exe");
  const modulePath = path.win32.join(syntheticDrive, "public-safe", "team-ops-board-runtime.mjs");
  const systemRoot = path.win32.join(syntheticDrive, "Windows");
  const definition = createScheduledTaskDefinition({ nodePath, modulePath });
  assert.equal(definition.task_name, TEAM_OPS_BOARD_RUNTIME_TASK_NAME);
  assert.equal(definition.trigger_count, 0);
  assert.equal(definition.stored_credential_count, 0);
  assert.equal(definition.logon_type, "Interactive");
  assert.equal(definition.run_level, "Limited");
  assert.equal(definition.task_path, "root");
  assert.equal(definition.multiple_instances, "IgnoreNew");
  assert.equal(definition.enabled, true);
  assert.equal(definition.execution_time_limit, "unlimited");
  assert.equal(definition.restart_count, 3);
  assert.equal(definition.restart_count, TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT);
  assert.equal(definition.restart_interval, TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL);
  assert.equal(definition.watchdog_count, 0);
  assert.match(definition.action_digest, /^[a-f0-9]{64}$/u);
  const spec = createScheduledTaskPowerShellSpec("register", {
    definition,
    systemRoot,
  });
  const encodedAt = spec.args.indexOf("-EncodedCommand");
  assert.ok(encodedAt >= 0);
  const decoded = Buffer.from(spec.args[encodedAt + 1], "base64").toString("utf16le");
  assert.match(spec.file, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/iu);
  assert.match(decoded, /Register-ScheduledTask/u);
  assert.match(
    decoded,
    /New-ScheduledTask .* -Description 'Soulforge Team Operations Board read-only on-demand runtime'/u,
  );
  assert.doesNotMatch(decoded, /Register-ScheduledTask[^;]*-InputObject[^;]*-Description/u);
  assert.match(decoded, /Register-ScheduledTask[^;]*-InputObject \$definition/u);
  assert.match(decoded, /New-ScheduledTaskPrincipal -UserId \$owner -LogonType Interactive -RunLevel Limited/u);
  assert.match(decoded, /-RestartCount 3 -RestartInterval \(\[TimeSpan\]::FromMinutes\(1\)\)/u);
  assert.match(decoded, /Resolve-Sid/u);
  assert.match(decoded, /\$identity\.User\.Value/u);
  assert.match(decoded, /\$principalSid -eq \$ownerSid/u);
  assert.match(decoded, /Triggers \| Where-Object \{ \$null -ne \$_ \}/u);
  assert.match(decoded, /__scheduled_worker/u);
  assert.match(decoded, /team-ops-board-runtime\.mjs/u);
  assert.doesNotMatch(decoded, /New-ScheduledTaskTrigger|-Password|Highest|SYSTEM/u);
  assert.doesNotMatch(decoded, /protected-host|credential-value|binding-value|account-value/u);
  for (const operation of ["run", "unregister"]) {
    const mutationSpec = createScheduledTaskPowerShellSpec(operation, { definition, systemRoot });
    const mutationDecoded = Buffer.from(
      mutationSpec.args[mutationSpec.args.indexOf("-EncodedCommand") + 1],
      "base64",
    ).toString("utf16le");
    const validationAt = mutationDecoded.indexOf("task_definition_mismatch");
    const mutationAt = mutationDecoded.indexOf(
      operation === "run" ? "Start-ScheduledTask" : "Unregister-ScheduledTask",
    );
    assert.ok(validationAt >= 0 && mutationAt > validationAt);
    const postMutation = mutationDecoded.slice(mutationAt);
    assert.doesNotMatch(postMutation, /Get-ScheduledTask/u);
    assert.match(
      postMutation,
      operation === "run" ? /outcome='run_requested'/u : /outcome='unregistered'/u,
    );
    assert.match(postMutation, /ConvertTo-Json -Compress/u);
    if (operation === "unregister") {
      const readyCheckAt = mutationDecoded.indexOf("[string]$t.State -ne 'Ready'");
      assert.ok(readyCheckAt >= 0 && mutationAt > readyCheckAt);
    }
    assert.match(mutationDecoded, /TaskPath \$p/u);
    assert.match(mutationDecoded, /MultipleInstances/u);
    assert.match(mutationDecoded, /ExecutionTimeLimit/u);
    assert.match(mutationDecoded, /RestartCount/u);
  }
});

test("manual intent is monotonic, idempotent, and reboot-stale intent stays off", () => {
  const stopped = transitionRuntimeDesiredState(null, "stopped", "2026-08-10T00:00:00.000Z");
  assert.equal(stopped.desired_state, "stopped");
  assert.equal(stopped.intent_epoch, 0);
  const running = transitionRuntimeDesiredState(stopped, "start", "2026-08-10T00:00:01.000Z");
  assert.equal(running.desired_state, "running");
  assert.equal(running.intent_epoch, 1);
  assert.deepEqual(
    transitionRuntimeDesiredState(running, "start", "2026-08-10T00:00:02.000Z"),
    running,
  );
  const requested = transitionRuntimeDesiredState(
    running,
    "request_stop",
    "2026-08-10T00:00:03.000Z",
  );
  assert.equal(requested.desired_state, "stop_requested");
  assert.equal(requested.intent_epoch, 2);
  const finalStopped = transitionRuntimeDesiredState(
    requested,
    "stopped",
    "2026-08-10T00:00:04.000Z",
  );
  assert.equal(finalStopped.desired_state, "stopped");
  assert.equal(finalStopped.intent_epoch, 2);
  const recoveryNeeded = transitionRuntimeDesiredState(
    running,
    "recovery_needed",
    "2026-08-10T00:00:05.000Z",
  );
  assert.equal(recoveryNeeded.desired_state, "recovery_needed");
  assert.equal(recoveryNeeded.intent_epoch, 1);
});

test("termination receipts distinguish evidence classes without private identifiers", () => {
  const desired = {
    schema_version: "soulforge.team_ops_board.runtime.v1",
    desired_state: "running",
    intent_epoch: 4,
    updated_at: "2026-08-10T00:00:00.000Z",
  };
  const ready = {
    state: "ready",
    heartbeat_at: "2026-08-10T00:00:05.000Z",
    pid: 4321,
    run_id: "11111111-1111-4111-8111-111111111111",
    protected_path: "must-not-project",
  };
  assert.equal(classifyScheduledTaskResult(0), "success");
  assert.equal(classifyScheduledTaskResult(267009), "running");
  assert.equal(classifyScheduledTaskResult(267014), "terminated");
  assert.equal(classifyScheduledTaskResult(73), "failed");
  assert.equal(classifyScheduledTaskResult(-1073741819), "native_crash");
  assert.equal(classifyRuntimeTermination({
    desiredState: "stop_requested",
    runtimeState: "ready",
    lastTaskResultClass: "running",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
    workerAliveAtCapture: true,
  }), "normal_stop");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "error",
    lastTaskResultClass: "native_crash",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
  }), "handled_error");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "native_crash",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
  }), "native_crash");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "terminated",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
  }), "external_termination");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "unavailable",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: false,
    dependencyLossBeforeExit: true,
  }), "dependency_loss");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "failed",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
  }), "unknown");
  assert.equal(classifyRuntimeTermination({
    desiredState: "stop_requested",
    runtimeState: "ready",
    lastTaskResultClass: "running",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
  }), "unknown");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "unavailable",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: false,
  }), "unknown");
  assert.equal(classifyRuntimeTermination({
    desiredState: "running",
    runtimeState: "ready",
    lastTaskResultClass: "success",
    heartbeatAgeMs: 1_000,
    dependencyAvailable: true,
  }), "unknown");
  const receipt = createTerminationReceipt({
    operation: "restart_recovery",
    desired,
    runtimeState: ready,
    taskState: "ready",
    lastTaskResult: 267014,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
    observedAt: "2026-08-10T00:00:06.000Z",
  });
  assert.equal(receipt.exit_classification, "external_termination");
  assert.deepEqual(Object.keys(receipt).sort(), [
    "dependency_state", "desired_state", "exit_classification", "heartbeat",
    "intent_epoch", "last_result_class", "observed_at", "operation",
    "receipt_kind", "runtime_marker", "schema_version", "task_state",
  ]);
  assert.equal(JSON.stringify(receipt).includes("must-not-project"), false);
  assert.equal(JSON.stringify(receipt).includes("4321"), false);
  assert.equal(JSON.stringify(receipt).includes("11111111"), false);
  const markerless = createTerminationReceipt({
    operation: "pre_stop",
    desired: null,
    runtimeState: ready,
    taskState: "ready",
    lastTaskResult: 73,
    dependencyAvailable: false,
    workerAliveAtCapture: false,
    observedAt: "2026-08-10T00:00:06.000Z",
  });
  assert.equal(markerless.desired_state, "unknown");
  assert.equal(markerless.intent_epoch, null);
  assert.equal(markerless.dependency_state, "unavailable");
  assert.equal(markerless.exit_classification, "unknown");
  assert.equal(isTerminationReceipt(JSON.parse(JSON.stringify(markerless))), true);
  assert.equal(isTerminationReceipt({ ...markerless, desired_state: "stopped" }), false);
  assert.equal(isTerminationReceipt({ ...markerless, intent_epoch: 0 }), false);
});

test("scheduled worker derives private bindings in memory and keeps quota OFF", () => {
  const syntheticDrive = `${String.fromCharCode(67)}${String.fromCharCode(58)}`;
  const ownerRoot = path.win32.join(syntheticDrive, "owner-root");
  const serveStatus = {
    AllowFunnel: { "board.example.ts.net:443": false },
    Web: {
      "board.example.ts.net:443": {
        Handlers: { "/": { Proxy: "http://127.0.0.1:4192" } },
      },
    },
  };
  assert.equal(deriveAllowedHostFromServeStatus(serveStatus), "board.example.ts.net");
  const environment = createScheduledRuntimeEnvironment({
    ownerRoot,
    serveStatus,
    baseEnvironment: {
      LOCALAPPDATA: path.win32.join(syntheticDrive, "runtime-state"),
      TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "1",
      TEAM_OPS_BOARD_CLAUDE_QUOTA_READ: "1",
      TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: "must-be-replaced",
      TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS: "must-not-inherit",
      PSModulePath: "must-not-reach-runtime",
      UNRELATED_PASSWORD: "must-not-forward",
    },
  });
  assert.equal(environment.TEAM_OPS_BOARD_READ_ONLY_PILOT, "1");
  assert.equal(environment.TEAM_OPS_BOARD_ALLOWED_HOSTS, "board.example.ts.net");
  assert.match(environment.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY, /thread_visibility\.v1\.json$/u);
  assert.notEqual(environment.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY, "must-be-replaced");
  assert.equal("TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS" in environment, false);
  assert.equal("TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ" in environment, false);
  assert.equal("TEAM_OPS_BOARD_CLAUDE_QUOTA_READ" in environment, false);
  assert.equal("UNRELATED_PASSWORD" in environment, false);

  const helperEnvironment = createScheduledHelperEnvironment({
    USERPROFILE: "os-user-profile",
    APPDATA: "os-app-data",
    LOCALAPPDATA: "os-local-data",
    PATH: "os-path",
    PATHEXT: "os-path-ext",
    PROGRAMDATA: "os-program-data",
    PSModulePath: "scheduled-tasks-module-path",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "must-not-forward",
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: "must-not-forward",
    ANTHROPIC_API_KEY: "must-not-forward",
  });
  assert.equal(helperEnvironment.USERPROFILE, "os-user-profile");
  assert.equal(helperEnvironment.APPDATA, "os-app-data");
  assert.equal(helperEnvironment.LOCALAPPDATA, "os-local-data");
  assert.equal(helperEnvironment.PATH, "os-path");
  assert.equal(helperEnvironment.PATHEXT, "os-path-ext");
  assert.equal(helperEnvironment.PROGRAMDATA, "os-program-data");
  assert.equal(helperEnvironment.PSModulePath, "scheduled-tasks-module-path");
  assert.equal("TEAM_OPS_BOARD_ALLOWED_HOSTS" in helperEnvironment, false);
  assert.equal("TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY" in helperEnvironment, false);
  assert.equal("ANTHROPIC_API_KEY" in helperEnvironment, false);
  assert.equal("PSModulePath" in environment, false);
  assert.throws(() => deriveAllowedHostFromServeStatus({
    ...serveStatus,
    AllowFunnel: { "board.example.ts.net:443": true },
  }), /serve_state_unsafe/);

  const filtered = createRuntimeWorkerEnvironment({
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: "board.example.ts.net",
    TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "0",
    TEAM_OPS_BOARD_CLAUDE_QUOTA_READ: "1",
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: "memory-only",
    UNRELATED_PASSWORD: "must-not-forward",
  });
  assert.equal(filtered.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY, "memory-only");
  assert.equal("UNRELATED_PASSWORD" in filtered, false);

  const runId = "11111111-1111-4111-8111-111111111111";
  assert.equal(scheduledQuotaReadRequested({}), false);
  assert.equal(scheduledQuotaReadRequested({ TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "true" }), false);
  assert.equal(scheduledQuotaReadRequested({ TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "1" }), true);
  assert.deepEqual(createScheduledLaunchIntentEnvelope(runId, {
    TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ: "1",
  }), {
    schema_version: "soulforge.team_ops_board.runtime.v1",
    run_id: runId,
    quota_read: true,
  });
  assert.match(TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE, /^\\\\\.\\pipe\\/u);
});

test("control requests require the exact attributable run id", () => {
  const state = { run_id: "11111111-1111-4111-8111-111111111111" };
  assert.deepEqual(authorizeRuntimeControl(state, { action: "health", run_id: state.run_id }), {
    ok: true,
    outcome: "health",
  });
  assert.deepEqual(authorizeRuntimeControl(state, { action: "fault", run_id: state.run_id }), {
    ok: true,
    outcome: "fault",
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
  const heartbeat = refreshRuntimeHeartbeat(ready, "2026-08-10T00:00:10.000Z");
  assert.equal(heartbeat.heartbeat_at, "2026-08-10T00:00:10.000Z");
  const heartbeatNow = Date.parse("2026-08-10T00:00:20.000Z");
  assert.equal(createPublicRuntimeState(heartbeat, {}, heartbeatNow).ok, true);
  assert.equal(createPublicRuntimeState(
    heartbeat,
    {},
    Date.parse("2026-08-10T00:01:00.001Z"),
  ).ok, false);
  assert.equal(runtimeHeartbeatIsFresh(heartbeat, heartbeatNow), true);
  assert.equal(runtimeHealthIsReady(heartbeat, { ok: true, run_id: runId }, true, heartbeatNow), true);
  assert.equal(runtimeHealthIsReady(heartbeat, { ok: true, run_id: "other" }, true, heartbeatNow), false);
  assert.equal(runtimeHealthIsReady(heartbeat, { ok: true, run_id: runId }, false, heartbeatNow), false);

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
  assert.equal(classifyRuntimeObservation({
    state: heartbeat, ownerAlive: true, listenerState: "present", controlReady: true,
    now: heartbeatNow,
  }), "ready");
  assert.equal(classifyRuntimeObservation({
    state: ready, ownerAlive: false, listenerState: "absent", controlReady: false,
  }), "runtime_worker_absent");
  assert.equal(classifyRuntimeObservation({
    state: failed, ownerAlive: false, listenerState: "absent", controlReady: false,
  }), "handled_failure");
  assert.equal(classifyRuntimeObservation({
    state: heartbeat,
    ownerAlive: true,
    listenerState: "present",
    controlReady: true,
    now: Date.parse("2026-08-10T00:01:00.001Z"),
  }), "hold");
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
  for (const command of [
    "task-register", "task-status", "task-run", "task-stop", "task-fault", "task-unregister",
    "status", "health", "stop", "recover", "--help",
  ]) {
    assert.equal(parseRuntimeCommand([command]), command);
  }
  assert.throws(() => parseRuntimeCommand(["task-run", "extra"]), /control_unavailable/);
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

  const definition = createScheduledTaskDefinition();
  const inspection = {
    exists: true,
    task_state: "ready",
    trigger_count: 0,
    stored_credential_count: 0,
    current_owner_match: true,
    run_level_limited: true,
    task_path_root: true,
    multiple_instances_ignore_new: true,
    enabled: true,
    unlimited_execution: true,
    restart_count: TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT,
    restart_interval: TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL,
    watchdog_count: 0,
    action_count: 1,
    action_digest: definition.action_digest,
    last_task_result: 0,
  };
  assert.equal(scheduledTaskInspectionIsExact(inspection), true);
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection, runtimeOwnership: "stopped", listenerState: "absent",
  }), true);
  for (const taskState of ["unknown", "running", "queued"]) {
    assert.equal(scheduledTaskUnregisterIsSafe({
      inspection: { ...inspection, task_state: taskState },
      runtimeOwnership: "stopped",
      listenerState: "absent",
    }), false);
  }
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection, runtimeOwnership: "owned", listenerState: "present",
  }), false);
  const taskState = createPublicScheduledTaskState(inspection, "stopped");
  assert.deepEqual(Object.keys(taskState).sort(), [
    "action_digest", "current_owner_match", "desired_state", "intent_epoch",
    "last_result_class", "ok", "runtime_health", "schema_version",
    "stored_credential_count", "task_health", "trigger_count",
  ]);
  assert.equal(taskState.ok, false);
});

test("tracked runtime has only the bounded on-demand task surface", async () => {
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  assert.equal(TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES, 4096);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES, 128 * 1024);
  assert.doesNotMatch(source, /0\.0\.0\.0|ListenOnLan|firewall|taskkill|Stop-Process|schtasks|autostart|service create/iu);
  assert.doesNotMatch(source, /TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\s*[:=]/u);
  assert.doesNotMatch(source, /console\.(?:log|error)|RedirectStandard|\.out\.log|\.err\.log/u);
  assert.doesNotMatch(source, /\bspawn\s*\(/u);
  assert.doesNotMatch(source, /detached:\s*true/u);
  assert.match(source, /windowsHide:\s*true/u);
  assert.doesNotMatch(source, /Start-Process|cmd\.exe|\/c\s+start/iu);
  assert.doesNotMatch(source, /Invoke-CimMethod|Win32_Process|bootstrap/iu);
  assert.match(source, /Register-ScheduledTask/u);
  assert.match(source, /-RestartCount 3 -RestartInterval \(\[TimeSpan\]::FromMinutes\(1\)\)/u);
  assert.match(source, /New-ScheduledTaskPrincipal -UserId \$owner -LogonType Interactive -RunLevel Limited/u);
  assert.doesNotMatch(source, /New-ScheduledTaskTrigger|-Password|RunLevel Highest/u);
  assert.match(source, /Start-ScheduledTask -TaskPath \$p -TaskName \$n/u);
  assert.match(source, /Unregister-ScheduledTask -TaskPath \$p -TaskName \$n -Confirm:\$false/u);
  assert.match(source, /\["serve", "status", "--json"\]/u);
  assert.match(source, /createScheduledHelperEnvironment/u);
  assert.doesNotMatch(source, /@\(\$t\.Triggers\)\.Count/u);
  assert.match(source, /RUNTIME_ENVIRONMENT_ALLOWLIST/u);
  assert.match(source, /if \(env\?\.\[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ\] === "1"\)/u);
  assert.match(source, /delete environment\[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\]/u);
  assert.match(source, /delete environment\[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ\]/u);
  assert.match(source, /TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE/u);
  assert.match(source, /listenScheduledLaunchIntent/u);
  assert.match(source, /receiveScheduledLaunchIntent/u);
  assert.doesNotMatch(
    source,
    /api\.anthropic\.com|api\/oauth\/usage|anthropic-version|x-api-key|bearer/iu,
  );
  assert.match(source, /open\(paths\.lock,\s*"wx"\)/u);
  assert.match(source, /runtime_state_ambiguous/u);
  assert.match(source, /runtime_worker_absent/u);
  assert.match(source, /termination-receipt\.v1\.json/u);
  assert.match(source, /desired\.v1\.json/u);
  assert.match(source, /RUNTIME_DEPENDENCY_SENTINEL/u);
  assert.match(source, /captureTerminationEvidence\(paths, "pre_unregister"/u);
  assert.match(source, /captureTerminationEvidence\(paths, "pre_recover"/u);
  assert.match(source, /captureTerminationEvidence\(paths, "pre_stop"/u);
  assert.match(source, /captureTerminationEvidence\(paths, "restart_recovery"/u);
  assert.match(source, /desired\?\.desired_state !== "running"\) return/u);
  assert.match(source, /heartbeat_at/u);
  const workerSource = source.slice(source.indexOf("async function runScheduledWorker"));
  assert.ok(workerSource.indexOf("lockHandle.writeFile") < workerSource.indexOf("writeJsonAtomic(paths.state"));
  assert.doesNotMatch(workerSource, /rm\(paths\.lock/u);
  const statusSource = source.slice(
    source.indexOf("async function inspectScheduledRuntime"),
    source.indexOf("async function runScheduledRuntime"),
  );
  assert.match(statusSource, /readRuntimeState\(paths\);/u);
  assert.match(statusSource, /readRuntimeLock\(paths\);/u);
  assert.doesNotMatch(statusSource, /readRuntime(?:State|Lock)\(paths\)\.catch/u);
  const helperInvokeSource = source.slice(
    source.indexOf("async function invokeScheduledTask"),
    source.indexOf("export function classifyRuntimeObservation"),
  );
  assert.match(
    helperInvokeSource,
    /maxBuffer: TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES/u,
  );
  assert.doesNotMatch(helperInvokeSource, /stderr|process\.(?:stdout|stderr)\.write/u);
  assert.equal(
    source.match(/maxBuffer: TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES/gu)?.length,
    1,
  );
  assert.match(source, /socket\.setTimeout\(CONTROL_TIMEOUT_MS/u);
  assert.match(source, /for \(const socket of owner\.sockets\) socket\.destroy\(\)/u);
  assert.match(source, /await previewServer\.close\(\)/u);
  assert.match(source, /classifyRuntimeRecovery/u);
  assert.match(source, /process\.once\("uncaughtException"/u);
  assert.match(source, /process\.once\("unhandledRejection"/u);
  assert.match(source, /resolveTeamOpsBoardAllowedHosts/u);
});
