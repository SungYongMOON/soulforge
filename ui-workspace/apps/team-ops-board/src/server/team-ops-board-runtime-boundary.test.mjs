import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEAM_OPS_BOARD_RUNTIME_HOST,
  TEAM_OPS_BOARD_RUNTIME_HIDDEN_LAUNCHER,
  TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES,
  TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE,
  TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_RUNTIME_PREFLIGHT_TIMEOUT_MS,
  TEAM_OPS_BOARD_CHILD_RESTART_BACKOFF_MS,
  TEAM_OPS_BOARD_CHILD_RESTART_LIMIT,
  TEAM_OPS_BOARD_RUNTIME_PIPE,
  TEAM_OPS_BOARD_RUNTIME_PORT,
  TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES,
  TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT,
  TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL,
  TEAM_OPS_BOARD_RUNTIME_TASK_NAME,
  TEAM_OPS_BOARD_RUNTIME_TRIGGER_DURATION,
  TEAM_OPS_BOARD_RUNTIME_TRIGGER_INTERVAL,
  TEAM_OPS_BOARD_RUNTIME_TRIGGER_KIND,
  authorizeRuntimeControl,
  classifyRuntimeObservation,
  classifyRuntimeRecovery,
  classifyRuntimeTermination,
  classifyBoardChildStartingState,
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
  decideBoardChildSupervisor,
  deriveAllowedHostFromServeStatus,
  parseRuntimeCommand,
  isTerminationReceipt,
  refreshRuntimeHeartbeat,
  runScheduledController,
  runtimeHeartbeatIsFresh,
  runtimeHealthIsReady,
  sanitizeChildExitEvidence,
  sanitizeRuntimeFailure,
  scheduledTaskInspectionIsExact,
  scheduledTaskInspectionIsTriggerlessLegacy,
  scheduledTaskUnregisterIsSafe,
  scheduledQuotaReadRequested,
  stopControllerOwnedChild,
  transitionRuntimeState,
  transitionRuntimeDesiredState,
  validateRuntimeLaunchEnvironment,
  TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_EVENTS,
  TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_HISTORY_SCHEMA,
  TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_HISTORY_LIMIT,
  createRuntimeLifecycleEntry,
  isRuntimeLifecycleEntry,
} from "../../ops/team-ops-board-runtime.mjs";
import {
  classifyBoundedHistory,
  planBoundedHistoryAppend,
} from "../core/bounded-observability-history.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_SOURCE = path.resolve(HERE, "..", "..", "ops", "team-ops-board-runtime.mjs");
const HIDDEN_LAUNCHER_SOURCE = path.resolve(HERE, "..", "..", "ops", "team-ops-board-hidden-launcher.vbs");

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

test("scheduled task is desired-state gated, interactive, limited, and contains no protected values", () => {
  const syntheticDrive = `${String.fromCharCode(67)}${String.fromCharCode(58)}`;
  // The action operands are only quoted into the arguments string, so they stay
  // non-absolute sentinels: this file tracks no concrete local absolute path.
  // The spaces still exercise the argument quoting the sanitizer applies.
  const nodePath = "sentinel node home\\node.exe";
  const modulePath = "sentinel public-safe\\team-ops-board-runtime.mjs";
  const launcherPath = "sentinel public-safe\\team-ops-board-hidden-launcher.vbs";
  // Only the system root has to stay rooted: the definition resolves it to
  // locate wscript.exe and powershell.exe.
  const systemRoot = path.win32.join(syntheticDrive, "Windows");
  const definition = createScheduledTaskDefinition({ nodePath, modulePath, launcherPath, systemRoot });
  assert.equal(definition.task_name, TEAM_OPS_BOARD_RUNTIME_TASK_NAME);
  assert.equal(definition.trigger_count, 1);
  assert.equal(definition.trigger_kind, TEAM_OPS_BOARD_RUNTIME_TRIGGER_KIND);
  assert.equal(definition.trigger_repetition_interval, TEAM_OPS_BOARD_RUNTIME_TRIGGER_INTERVAL);
  assert.equal(definition.trigger_repetition_interval, "PT5M");
  assert.equal(definition.trigger_repetition_duration, TEAM_OPS_BOARD_RUNTIME_TRIGGER_DURATION);
  assert.equal(definition.trigger_enabled, true);
  assert.equal(definition.stored_credential_count, 0);
  assert.equal(definition.logon_type, "Interactive");
  assert.equal(definition.run_level, "Limited");
  assert.equal(definition.task_path, "root");
  assert.equal(definition.multiple_instances, "IgnoreNew");
  assert.equal(definition.enabled, true);
  assert.equal(definition.execution_time_limit, "unlimited");
  assert.equal(definition.stop_on_idle_end, false);
  assert.equal(definition.restart_count, 3);
  assert.equal(definition.restart_count, TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT);
  assert.equal(definition.restart_interval, TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL);
  assert.equal(definition.watchdog_count, 0);
  assert.equal(definition.execute, path.win32.join(systemRoot, "System32", "wscript.exe"));
  assert.match(definition.arguments, /^\/\/B \/\/NoLogo /u);
  assert.match(definition.arguments, /team-ops-board-hidden-launcher\.vbs/u);
  assert.match(definition.arguments, /node\.exe/u);
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
    /New-ScheduledTask .* -Description 'Soulforge Team Operations Board read-only gated runtime'/u,
  );
  assert.doesNotMatch(decoded, /Register-ScheduledTask[^;]*-InputObject[^;]*-Description/u);
  assert.match(decoded, /Register-ScheduledTask[^;]*-InputObject \$definition/u);
  assert.match(decoded, /New-ScheduledTaskPrincipal -UserId \$owner -LogonType Interactive -RunLevel Limited/u);
  assert.match(decoded, /-RestartCount 3 -RestartInterval \(\[TimeSpan\]::FromMinutes\(1\)\)/u);
  assert.match(decoded, /-DontStopOnIdleEnd/u);
  assert.match(decoded, /Resolve-Sid/u);
  assert.match(decoded, /\$identity\.User\.Value/u);
  assert.match(decoded, /\$principalSid -eq \$ownerSid/u);
  assert.match(decoded, /Triggers \| Where-Object \{ \$null -ne \$_ \}/u);
  assert.match(decoded, /__scheduled_worker/u);
  assert.match(decoded, /team-ops-board-runtime\.mjs/u);
  // Exactly one repeating time trigger, a future start boundary so registration
  // itself presents no start opportunity, and an omitted repetition duration,
  // which is how Task Scheduler stores indefinite repetition.
  assert.equal(
    decoded.match(/New-ScheduledTaskTrigger[^;]*/u)?.[0],
    "New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(5)) -RepetitionInterval (New-TimeSpan -Minutes 5)",
  );
  assert.doesNotMatch(decoded, /-RepetitionDuration/u);
  assert.match(decoded, /New-ScheduledTask -Action \$action -Trigger \$trigger /u);
  assert.doesNotMatch(decoded, /-AtLogOn|-AtStartup|-Daily|-Weekly|-User /u);
  assert.doesNotMatch(decoded, /-Password|Highest|SYSTEM/u);
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
    assert.match(mutationDecoded, /IdleSettings\.StopOnIdleEnd/u);
    assert.match(mutationDecoded, /RestartCount/u);
    const triggerExactAt = mutationDecoded.indexOf(
      "$triggerExact=($facts.count -eq 1 -and $facts.kind -eq 'time' -and $facts.interval -eq $ri -and $facts.duration -eq $rd -and $facts.enabled -eq $true -and $facts.boundaryOk -eq $true)",
    );
    assert.ok(triggerExactAt >= 0 && mutationAt > triggerExactAt);
    // The trigger exactness guard also requires a parseable, non-implausibly-
    // far-future StartBoundary, computed once in Get-TriggerFacts so both the
    // run and unregister mutation guards enforce it identically.
    assert.match(mutationDecoded, /\$one\.StartBoundary/u);
    assert.match(mutationDecoded, /\[datetime\]::TryParse\(\$b,\[ref\]\$bt\)/u);
    assert.match(mutationDecoded, /\$bt -le \(Get-Date\)\.AddMinutes\(6\)/u);
    assert.doesNotMatch(mutationDecoded, /New-ScheduledTaskTrigger|Set-ScheduledTask/u);
    // Only removal tolerates the earlier triggerless registration; a single
    // trigger that isn't exact is still refused by both operations.
    assert.match(
      mutationDecoded,
      operation === "run"
        ? /if\(\$null -eq \$t -or -not \$triggerExact -or /u
        : /if\(\$null -eq \$t -or -not \(\$facts\.count -eq 0 -or \$triggerExact\) -or /u,
    );
  }

  // Inspection projects the same boundary fact the JS exactness check reads,
  // in both the missing-task and existing-task branches, and observes only.
  const inspectSpec = createScheduledTaskPowerShellSpec("inspect", { definition, systemRoot });
  const inspectDecoded = Buffer.from(
    inspectSpec.args[inspectSpec.args.indexOf("-EncodedCommand") + 1],
    "base64",
  ).toString("utf16le");
  assert.ok(inspectDecoded.includes(
    "boundary=$(if($null -ne $one){[string]$one.StartBoundary}else{$null})",
  ));
  assert.ok(inspectDecoded.includes("trigger_start_boundary=$null"));
  assert.ok(inspectDecoded.includes("trigger_start_boundary=$facts.boundary"));
  assert.doesNotMatch(
    inspectDecoded,
    /Register-ScheduledTask|Start-ScheduledTask|Unregister-ScheduledTask|Set-ScheduledTask/u,
  );
});

test("scheduled controller bounds Board-child recovery and stop wins", async () => {
  assert.equal(TEAM_OPS_BOARD_CHILD_RESTART_LIMIT, 3);
  assert.equal(TEAM_OPS_BOARD_CHILD_RESTART_BACKOFF_MS, 1_000);
  assert.equal(decideBoardChildSupervisor({
    desiredState: "running",
    childExited: false,
    childReady: true,
    restartCount: 0,
  }), "continue");
  assert.equal(decideBoardChildSupervisor({
    desiredState: "running",
    childExited: true,
    childReady: false,
    restartCount: 0,
    restartLimit: 1,
  }), "restart");
  assert.equal(decideBoardChildSupervisor({
    desiredState: "running",
    childExited: true,
    childReady: false,
    restartCount: 1,
    restartLimit: 1,
  }), "exhausted");
  assert.equal(decideBoardChildSupervisor({
    desiredState: "stop_requested",
    childExited: true,
    childReady: false,
    restartCount: 0,
  }), "stop");

  const now = Date.parse("2026-08-10T12:00:00.000Z");
  assert.equal(classifyBoardChildStartingState({
    state: "starting",
    started_at: "2026-08-10T11:59:50.000Z",
  }, { now, startTimeoutMs: 30_000 }), "starting");
  assert.equal(classifyBoardChildStartingState({
    state: "starting",
    started_at: "2026-08-10T11:59:20.000Z",
  }, { now, startTimeoutMs: 30_000 }), "nonready");
  assert.equal(classifyBoardChildStartingState({
    state: "starting",
    started_at: "invalid",
  }, { now, startTimeoutMs: 30_000 }), "hold");
  assert.equal(classifyBoardChildStartingState({
    state: "starting",
    started_at: "2026-08-10T12:00:01.000Z",
  }, { now, startTimeoutMs: 30_000 }), "hold");

  let sendCount = 0;
  let killCount = 0;
  const child = new EventEmitter();
  Object.assign(child, {
    connected: true,
    exitCode: null,
    signalCode: null,
    send(message) {
      sendCount += 1;
      assert.equal(message.action, "controller_stop");
      setImmediate(() => {
        child.exitCode = 0;
        child.emit("exit", 0, null);
      });
    },
    kill() {
      killCount += 1;
      return true;
    },
  });
  assert.equal(await stopControllerOwnedChild(child, {
    state: null,
    stopTimeoutMs: 50,
  }), "controller_stop");
  assert.equal(await stopControllerOwnedChild(child, {
    state: null,
    stopTimeoutMs: 50,
  }), "exited");
  assert.equal(sendCount, 1);
  assert.equal(killCount, 0);
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
  assert.equal(classifyScheduledTaskResult(2147946720), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, {}), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, { taskState: "ready" }), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, { multipleInstancesIgnoreNew: true }), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, { taskState: "ready", multipleInstancesIgnoreNew: true }), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, { taskState: "running", multipleInstancesIgnoreNew: false }), "failed");
  assert.equal(classifyScheduledTaskResult(2147946720, { taskState: "running", multipleInstancesIgnoreNew: true }), "running");
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
    "child_exit_code", "child_failure_class", "child_signal_class",
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
  assert.equal(environment.TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH, "1");
  assert.equal("TEAM_OPS_BOARD_ANTIGRAVITY_UIA_READ" in environment, false);
  assert.equal(environment.TEAM_OPS_BOARD_READ_ONLY_PILOT, "1");
  assert.equal(environment.TEAM_OPS_BOARD_ALLOWED_HOSTS, "board.example.ts.net");
  assert.equal(environment.SOULFORGE_AI_USAGE_PROJECT_ROOT, ownerRoot);
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
    trigger_count: 1,
    trigger_kind: "time",
    trigger_repetition_interval: "PT5M",
    trigger_repetition_duration: "indefinite",
    trigger_enabled: true,
    trigger_start_boundary: new Date(Date.now() - 60_000).toISOString(),
    stored_credential_count: 0,
    current_owner_match: true,
    run_level_limited: true,
    task_path_root: true,
    multiple_instances_ignore_new: true,
    enabled: true,
    unlimited_execution: true,
    stop_on_idle_end: false,
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
  for (const drift of [
    { trigger_count: 0, trigger_kind: null, trigger_repetition_interval: null, trigger_repetition_duration: null, trigger_enabled: null },
    { trigger_count: 2, watchdog_count: 1 },
    { trigger_repetition_interval: "PT1M" },
    { trigger_repetition_duration: "PT30M" },
    { trigger_kind: "other" },
    { trigger_enabled: false },
  ]) {
    assert.equal(scheduledTaskInspectionIsExact({ ...inspection, ...drift }), false);
  }
  // StartBoundary contract, pinned to a fixed `now` so the tolerance edge is
  // exact instead of racing the wall clock. Registration stamps the boundary at
  // now+5m, so an immediate post-register inspection reads a boundary that
  // hasn't happened yet and must stay exact; a boundary drifted further out
  // than the tolerance signals a mismatched or tampered task, and a missing or
  // unparseable boundary is never accepted.
  const boundaryNow = Date.parse("2026-08-16T00:00:00.000Z");
  const boundaryAt = (offsetMs) => new Date(boundaryNow + offsetMs).toISOString();
  for (const [trigger_start_boundary, expected] of [
    [boundaryAt(-365 * 24 * 60 * 60_000), true],
    [boundaryAt(-60_000), true],
    [boundaryAt(0), true],
    [boundaryAt(5 * 60_000), true],
    // Exactly the tolerance is still a fresh registration; one millisecond past
    // it is not.
    [boundaryAt(6 * 60_000), true],
    [boundaryAt(6 * 60_000 + 1), false],
    [boundaryAt(60 * 60_000), false],
    [boundaryAt(365 * 24 * 60 * 60_000), false],
    // Task Scheduler reports local time without a zone designator; a boundary
    // that far in the past parses to the same verdict in any local zone.
    ["2026-01-01T00:00:00", true],
    [null, false],
    [undefined, false],
    ["", false],
    ["   ", false],
    ["not-a-date", false],
    ["PT5M", false],
    [boundaryNow, false],
  ]) {
    assert.equal(
      scheduledTaskInspectionIsExact(
        { ...inspection, trigger_start_boundary },
        definition,
        { now: boundaryNow },
      ),
      expected,
    );
  }
  // A zero-trigger legacy task reports no boundary at all, so removal
  // compatibility must not depend on one.
  const triggerlessLegacy = {
    ...inspection,
    trigger_count: 0,
    trigger_kind: null,
    trigger_repetition_interval: null,
    trigger_repetition_duration: null,
    trigger_enabled: null,
    trigger_start_boundary: null,
  };
  assert.equal(scheduledTaskInspectionIsTriggerlessLegacy(triggerlessLegacy), true);
  assert.equal(scheduledTaskInspectionIsTriggerlessLegacy(inspection), false);
  assert.equal(scheduledTaskInspectionIsTriggerlessLegacy({ ...inspection, trigger_count: 2 }), false);
  assert.equal(scheduledTaskInspectionIsTriggerlessLegacy({
    ...triggerlessLegacy, watchdog_count: 1,
  }), false);
  assert.equal(scheduledTaskInspectionIsTriggerlessLegacy({
    ...triggerlessLegacy, action_digest: "b".repeat(64),
  }), false);
  // A task registered before the relaunch trigger stays removable, never runnable.
  assert.equal(scheduledTaskInspectionIsExact(triggerlessLegacy), false);
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection: triggerlessLegacy, runtimeOwnership: "stopped", listenerState: "absent",
  }), true);
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection, runtimeOwnership: "stopped", listenerState: "absent",
  }), true);
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection: { ...inspection, trigger_count: 2, watchdog_count: 1 },
    runtimeOwnership: "stopped",
    listenerState: "absent",
  }), false);
  // A single trigger that differs from the exact relaunch definition is neither
  // exact nor triggerless legacy, and must not be treated as removable.
  assert.equal(scheduledTaskUnregisterIsSafe({
    inspection: { ...inspection, trigger_repetition_interval: "PT1M" },
    runtimeOwnership: "stopped",
    listenerState: "absent",
  }), false);
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

test("termination evidence retains only bounded sanitized Board-child exit facts", () => {
  assert.deepEqual(sanitizeChildExitEvidence(), {
    child_exit_code: null,
    child_signal_class: null,
    child_failure_class: null,
  });
  assert.equal(sanitizeChildExitEvidence({ code: 0 }).child_exit_code, 0);
  assert.equal(sanitizeChildExitEvidence({ code: 3221225477 }).child_exit_code, 3221225477);
  assert.equal(sanitizeChildExitEvidence({ code: -1073741819 }).child_exit_code, -1073741819);
  assert.equal(sanitizeChildExitEvidence({ code: 4294967296 }).child_exit_code, null);
  assert.equal(sanitizeChildExitEvidence({ code: -2147483649 }).child_exit_code, null);
  assert.equal(sanitizeChildExitEvidence({ code: 1.5 }).child_exit_code, null);
  assert.equal(sanitizeChildExitEvidence({ code: "1" }).child_exit_code, null);
  for (const [signal, expected] of [
    ["SIGTERM", "sigterm"],
    ["SIGKILL", "sigkill"],
    ["SIGINT", "sigint"],
    ["SIGHUP", "other"],
    ["error", "spawn_error"],
    ["", null],
    [null, null],
  ]) {
    assert.equal(sanitizeChildExitEvidence({ signal }).child_signal_class, expected);
  }
  assert.equal(
    sanitizeChildExitEvidence({ failureClass: "runtime_worker_failed" }).child_failure_class,
    "runtime_worker_failed",
  );
  for (const unsafe of [
    "owner-machine-secret::board/worker.mjs:12",
    "Error: ECONNREFUSED 127.0.0.1:4192",
    "must-not-project",
    7,
  ]) {
    assert.equal(sanitizeChildExitEvidence({ failureClass: unsafe }).child_failure_class, null);
  }

  const ready = {
    schema_version: "soulforge.team_ops_board.runtime.v1",
    run_id: "11111111-1111-4111-8111-111111111111",
    pid: 4321,
    state: "error",
    failure_class: "runtime_worker_failed",
    heartbeat_at: "2026-08-10T00:00:05.000Z",
    protected_path: "must-not-project",
  };
  const receipt = createTerminationReceipt({
    operation: "restart_recovery",
    desired: { desired_state: "running", intent_epoch: 4 },
    runtimeState: ready,
    taskState: "ready",
    lastTaskResult: 1,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
    childExit: { code: 1, signal: null },
    observedAt: "2026-08-10T00:00:06.000Z",
  });
  assert.equal(receipt.child_exit_code, 1);
  assert.equal(receipt.child_signal_class, null);
  assert.equal(receipt.child_failure_class, "runtime_worker_failed");
  assert.equal(receipt.exit_classification, "handled_error");
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes("must-not-project"), false);
  assert.equal(serialized.includes("4321"), false);
  assert.equal(serialized.includes("11111111"), false);
  assert.equal(serialized.includes("owner-machine-secret::"), false);
  assert.equal(serialized.includes("ECONNREFUSED"), false);
  assert.equal(isTerminationReceipt(JSON.parse(serialized)), true);

  const killed = createTerminationReceipt({
    operation: "restart_recovery",
    desired: { desired_state: "running", intent_epoch: 4 },
    runtimeState: null,
    taskState: "ready",
    lastTaskResult: 1,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
    childExit: { code: null, signal: "SIGKILL", failureClass: "runtime_start_timeout" },
    observedAt: "2026-08-10T00:00:06.000Z",
  });
  assert.equal(killed.child_exit_code, null);
  assert.equal(killed.child_signal_class, "sigkill");
  assert.equal(killed.child_failure_class, "runtime_start_timeout");

  // Receipts written before child evidence existed stay readable and valid.
  const legacy = { ...receipt };
  delete legacy.child_exit_code;
  delete legacy.child_signal_class;
  delete legacy.child_failure_class;
  assert.equal(isTerminationReceipt(legacy), true);
  assert.equal(isTerminationReceipt({ ...receipt, child_signal_class: "SIGTERM" }), false);
  assert.equal(isTerminationReceipt({ ...receipt, child_signal_class: "reboot" }), false);
  assert.equal(isTerminationReceipt({ ...receipt, child_exit_code: 1.5 }), false);
  assert.equal(isTerminationReceipt({ ...receipt, child_exit_code: "1" }), false);
  assert.equal(
    isTerminationReceipt({ ...receipt, child_failure_class: "owner-machine-secret::worker.mjs" }),
    false,
  );
});

test("a scheduled invocation with desired stopped exits without starting the Board", async (t) => {
  if (process.platform !== "win32") return t.skip("runtime state root is Windows-owned");
  const localAppData = await mkdtemp(path.join(tmpdir(), "board-scheduled-gate-"));
  t.after(async () => { await rm(localAppData, { recursive: true, force: true }); });
  const root = path.join(localAppData, "Soulforge", "team-ops-board-runtime");
  await mkdir(root, { recursive: true });
  const forkCalls = [];
  const forkChild = (...args) => { forkCalls.push(args); throw new Error("must-not-fork"); };

  for (const desiredState of ["stopped", "stop_requested", "recovery_needed"]) {
    await writeFile(path.join(root, "desired.v1.json"), `${JSON.stringify({
      schema_version: "soulforge.team_ops_board.runtime.v1",
      desired_state: desiredState,
      intent_epoch: 7,
      updated_at: "2026-08-16T00:00:00.000Z",
    })}\n`, "utf8");
    assert.equal(
      await runScheduledController({ LOCALAPPDATA: localAppData }, { forkChild }),
      undefined,
    );
    assert.deepEqual(forkCalls, []);
    assert.equal(existsSync(path.join(root, "runtime.v1.json")), false);
    assert.equal(existsSync(path.join(root, "runtime.v1.lock")), false);
  }

  const source = await readFile(RUNTIME_SOURCE, "utf8");
  const controller = source.slice(source.indexOf("export async function runScheduledController"));
  const preflightDesiredRead = controller.indexOf("const preflightDesired = await readDesiredState(paths)");
  const desiredStateReturn = controller.indexOf('preflightDesired?.desired_state !== "running") return');
  assert.ok(preflightDesiredRead >= 0);
  assert.ok(desiredStateReturn > preflightDesiredRead);
  assert.ok(desiredStateReturn < controller.indexOf("deriveEnvironment(env)", preflightDesiredRead));
  assert.ok(desiredStateReturn < controller.indexOf("forkChild("));
});

test("tracked runtime has only the bounded desired-state gated task surface", async () => {
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  const hiddenLauncher = await readFile(HIDDEN_LAUNCHER_SOURCE, "utf8");
  assert.match(TEAM_OPS_BOARD_RUNTIME_HIDDEN_LAUNCHER, /team-ops-board-hidden-launcher\.vbs$/u);
  assert.match(hiddenLauncher, /shell\.Run\(command, 0, True\)/u);
  assert.match(hiddenLauncher, /mode <> "__scheduled_worker"/u);
  assert.doesNotMatch(hiddenLauncher, /cmd\.exe|powershell|Start-Process/iu);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES, 4096);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES, 128 * 1024);
  assert.doesNotMatch(source, /0\.0\.0\.0|ListenOnLan|firewall|taskkill|Stop-Process|schtasks|autostart|service create/iu);
  assert.doesNotMatch(source, /TEAM_OPS_BOARD_CLAUDE_QUOTA_READ\s*[:=]/u);
  assert.doesNotMatch(source, /console\.(?:log|error)|RedirectStandard|\.out\.log|\.err\.log/u);
  assert.doesNotMatch(source, /\bspawn\s*\(/u);
  assert.doesNotMatch(source, /detached:\s*true/u);
  assert.match(source, /windowsHide:\s*true/u);
  assert.match(source, /import \{ startRecoveryCompanion \} from/u);
  assert.match(source, /recoveryCompanion = startRecoveryCompanion\(\{/u);
  assert.ok((source.match(/await recoveryCompanion\?\.stop\(\)/gu) ?? []).length >= 3);
  assert.doesNotMatch(source, /Start-Process|cmd\.exe|\/c\s+start/iu);
  assert.doesNotMatch(source, /Invoke-CimMethod|Win32_Process|bootstrap/iu);
  assert.match(source, /Register-ScheduledTask/u);
  assert.match(source, /-RestartCount 3 -RestartInterval \(\[TimeSpan\]::FromMinutes\(1\)\)/u);
  assert.match(source, /New-ScheduledTaskPrincipal -UserId \$owner -LogonType Interactive -RunLevel Limited/u);
  assert.doesNotMatch(source, /-Password|RunLevel Highest/u);
  assert.equal(source.match(/New-ScheduledTaskTrigger/gu).length, 1);
  assert.match(source, /New-ScheduledTaskTrigger -Once -At \(\(Get-Date\)\.AddMinutes\(5\)\) -RepetitionInterval \(New-TimeSpan -Minutes 5\)/u);
  assert.doesNotMatch(source, /-AtLogOn|-AtStartup|-RepetitionDuration/u);
  // Registration records the stopped intent before the task with the repeating
  // trigger can exist, so registration itself never starts the Board.
  assert.ok(
    source.indexOf('transitionRuntimeDesiredState(current, "stopped"')
      < source.indexOf('const after = await invokeScheduledTask("register", env)'),
  );
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
  assert.match(source, /export async function runScheduledController/u);
  assert.match(source, /forkChild = fork,/u);
  assert.match(source, /forkChild\(fileURLToPath\(import\.meta\.url\), \["__runtime_child"\]/u);
  assert.match(source, /restartCount \+= 1/u);
  assert.match(source, /desired\?\.desired_state !== "running"/u);
  // Retry exhaustion (desired still "running", restarts spent) must fail the
  // scheduled worker process outright rather than idle-wait on desired state
  // ever becoming anything other than "running" -- nothing else in this
  // process would ever drive that transition, so such a wait would park the
  // Scheduled Task process forever instead of exiting nonzero for the
  // repeating PT5M relaunch trigger to retry from a clean process.
  assert.doesNotMatch(source, /waitForControllerStop/u);
  const controllerSource = source.slice(source.indexOf("export async function runScheduledController"));
  assert.match(controllerSource, /if \(decision !== "restart"\) fail\("runtime_worker_failed"\);/u);
  assert.doesNotMatch(source, /detached:\s*true/u);
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

test("preflight timeout is hardened to 15s and wired before control timeout", async () => {
  assert.equal(TEAM_OPS_BOARD_RUNTIME_PREFLIGHT_TIMEOUT_MS, 15000);
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  assert.match(source, /CONTROL_TIMEOUT_MS\s*=\s*3[_,]000/u);
  const resolveOwnerRootAt = source.indexOf("async function resolveOwnerRoot");
  const readServeStatusAt = source.indexOf("async function readServeStatus");
  const resolveOwnerRootSlice = source.slice(resolveOwnerRootAt, readServeStatusAt || source.length);
  assert.ok(resolveOwnerRootAt >= 0, "resolveOwnerRoot function found");
  assert.match(resolveOwnerRootSlice, /timeout:\s*TEAM_OPS_BOARD_RUNTIME_PREFLIGHT_TIMEOUT_MS/u);
  const readServeStatusEndAt = source.indexOf("async function", readServeStatusAt + 1);
  const readServeStatusSlice = source.slice(readServeStatusAt, readServeStatusEndAt || source.length);
  assert.match(readServeStatusSlice, /timeout:\s*TEAM_OPS_BOARD_RUNTIME_PREFLIGHT_TIMEOUT_MS/u);
  const controlUsage = source.match(/CONTROL_TIMEOUT_MS/gu) ?? [];
  const preflightUsage = source.match(/TEAM_OPS_BOARD_RUNTIME_PREFLIGHT_TIMEOUT_MS/gu) ?? [];
  assert.ok(controlUsage.length > 0, "CONTROL_TIMEOUT_MS is used");
  assert.ok(preflightUsage.length > 0, "PREFLIGHT_TIMEOUT_MS is used");
});

test("controller_preflight termination receipt validates with owner_root_unavailable", () => {
  const desired = {
    schema_version: "soulforge.team_ops_board.runtime.v1",
    desired_state: "running",
    intent_epoch: 1,
    updated_at: "2026-08-16T00:00:00.000Z",
  };
  const safe = createTerminationReceipt({
    operation: "controller_preflight",
    desired,
    runtimeState: null,
    taskState: "ready",
    lastTaskResult: 1,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
    childExit: { code: null, signal: null, failureClass: "owner_root_unavailable" },
    observedAt: "2026-08-16T00:00:00.100Z",
  });
  assert.equal(safe.operation, "controller_preflight");
  assert.equal(safe.child_failure_class, "owner_root_unavailable");
  assert.equal(isTerminationReceipt(JSON.parse(JSON.stringify(safe))), true);

  const unsafe = createTerminationReceipt({
    operation: "controller_preflight",
    desired,
    runtimeState: null,
    taskState: "ready",
    lastTaskResult: 1,
    dependencyAvailable: true,
    workerAliveAtCapture: false,
    childExit: { code: null, signal: null, failureClass: "unsafe-private-marker" },
    observedAt: "2026-08-16T00:00:00.100Z",
  });
  assert.equal(unsafe.child_failure_class, null);
  assert.equal(isTerminationReceipt(JSON.parse(JSON.stringify(unsafe))), true);
  assert.equal(isTerminationReceipt({ ...unsafe, child_failure_class: "owner_root_unavailable" }), true);
  assert.equal(isTerminationReceipt({ ...unsafe, child_failure_class: "unsafe-private-marker" }), false);
});

test("preflight controller rejects with owner_root_unavailable on temp LOCALAPPDATA", async (t) => {
  if (process.platform !== "win32") return t.skip("test requires Windows temp paths");
  const localAppData = await mkdtemp(path.join(tmpdir(), "board-preflight-"));
  t.after(async () => { await rm(localAppData, { recursive: true, force: true }); });
  const root = localAppData;
  await mkdir(path.join(root, "Soulforge", "team-ops-board-runtime"), { recursive: true });
  await writeFile(path.join(root, "Soulforge", "team-ops-board-runtime", "desired.v1.json"), `${JSON.stringify({
    schema_version: "soulforge.team_ops_board.runtime.v1",
    desired_state: "running",
    intent_epoch: 1,
    updated_at: "2026-08-16T00:00:00.000Z",
  })}\n`, "utf8");

  const captureLog = [];
  const deriveEnvironment = () => { throw Object.assign(new Error("redacted"), { code: "owner_root_unavailable" }); };
  const inspectTask = async () => null;
  const captureEvidence = (paths, operation, options) => {
    captureLog.push({ operation, options });
  };
  const forkCalls = [];
  const forkChild = (...args) => {
    forkCalls.push(args);
    throw new Error("must-not-fork");
  };

  let rejectionCode = null;
  try {
    await runScheduledController(
      { LOCALAPPDATA: localAppData },
      {
        restartLimit: 3,
        restartBackoffMs: 1000,
        forkChild,
        deriveEnvironment,
        inspectTask,
        captureEvidence,
      },
    );
  } catch (err) {
    rejectionCode = err.code;
  }

  assert.equal(rejectionCode, "owner_root_unavailable");
  assert.equal(captureLog.length, 1, "exactly one evidence capture");
  const captured = captureLog[0];
  assert.equal(captured.operation, "controller_preflight");
  assert.equal(captured.options.desired.desired_state, "running");
  assert.equal(captured.options.state, null);
  assert.equal(captured.options.workerAliveAtCapture, false);
  assert.equal(captured.options.childExit.failureClass, "owner_root_unavailable");
  assert.equal(forkCalls.length, 0, "no fork calls");
});

test("runtime lifecycle history records material transitions with an exact bounded shape", () => {
  assert.deepEqual([...TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_EVENTS], [
    "start", "ready", "stop_requested", "handled_fatal",
    "restart_recovery", "child_restart", "child_exhausted",
  ]);
  assert.equal(TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_HISTORY_LIMIT, 100);

  const entry = createRuntimeLifecycleEntry({
    event: "handled_fatal",
    failureClass: "runtime_worker_failed",
    observedAt: "2026-08-19T00:00:00.000Z",
  });
  // Ordered material events carry the whole answer. The entry holds no run id,
  // pid, hash, or any other correlatable identity.
  assert.deepEqual(entry, {
    observed_at: "2026-08-19T00:00:00.000Z",
    event: "handled_fatal",
    failure_class: "runtime_worker_failed",
  });
  assert.equal(isRuntimeLifecycleEntry(entry), true);
  assert.equal(isRuntimeLifecycleEntry({ ...entry, detail: "stack trace" }), false);
  assert.equal(isRuntimeLifecycleEntry({ ...entry, event: "heartbeat" }), false);
  assert.equal(isRuntimeLifecycleEntry({ ...entry, failure_class: "arbitrary text" }), false);
  // An identity field is not merely ignored, it is rejected as an extra key.
  assert.equal(isRuntimeLifecycleEntry({ ...entry, run_id: "0f3c1c1e-1c1e-4c1e-8c1e-1c1e1c1e1c1e" }), false);
  assert.equal(isRuntimeLifecycleEntry({ ...entry, pid: 4192 }), false);
  assert.equal(createRuntimeLifecycleEntry({ event: "heartbeat", observedAt: "2026-08-19T00:00:00.000Z" }), null);
  assert.equal(createRuntimeLifecycleEntry({ event: "start", observedAt: "not-a-time" }), null);
  assert.deepEqual(createRuntimeLifecycleEntry({ event: "start", observedAt: "2026-08-19T00:00:00.000Z" }), {
    observed_at: "2026-08-19T00:00:00.000Z",
    event: "start",
    failure_class: null,
  });
  // A run id supplied by a caller cannot leak in through an ignored option.
  assert.deepEqual(
    createRuntimeLifecycleEntry({ event: "start", runId: "0f3c1c1e-1c1e-4c1e-8c1e-1c1e1c1e1c1e", observedAt: "2026-08-19T00:00:00.000Z" }),
    { observed_at: "2026-08-19T00:00:00.000Z", event: "start", failure_class: null },
  );
});

test("the 10s heartbeat stays latest-only and is never appended to lifecycle history", async () => {
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  assert.match(source, /const HEARTBEAT_INTERVAL_MS = 10_000;/u);
  // The heartbeat proves liveness; only transitions become history rows.
  assert.doesNotMatch(source, /refreshRuntimeHeartbeat\([\s\S]{0,400}?appendRuntimeLifecycleEvent/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "ready"\)/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "stop_requested"\)/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "handled_fatal", \{ failureClass \}\)/u);
  // No call site may pass identity into lifecycle history.
  assert.doesNotMatch(source, /appendRuntimeLifecycleEvent\([^)]*runId/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "restart_recovery"/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "child_restart"/u);
  assert.match(source, /appendRuntimeLifecycleEvent\(paths, "child_exhausted"/u);
  // Termination last-good keeps its own separate file and contract.
  assert.match(source, /terminationReceipt: path\.join\(root, "termination-receipt\.v1\.json"\)/u);
  assert.match(source, /lifecycleHistory: path\.join\(root, "lifecycle-history\.v1\.json"\)/u);
});

test("a corrupt runtime lifecycle history is preserved and the core operation continues", async () => {
  const source = await readFile(RUNTIME_SOURCE, "utf8");
  // The append plans first and only writes a produced record; a preserved plan
  // carries a null record precisely so the bad history cannot be written over.
  assert.match(source, /planBoundedHistoryAppend\(\{/u);
  assert.match(source, /if \(plan\.record === null\) return \{ outcome: plan\.outcome, reason: plan\.reason \};/u);
  assert.match(source, /await writeJsonAtomic\(paths\.lifecycleHistory, plan\.record\);/u);
  // Presence is probed, so a missing history is a safe first write while a
  // present-but-untrustworthy one is classified invalid and preserved.
  assert.match(source, /probeLifecycleHistory/u);
  assert.match(source, /presence: "missing"/u);
  assert.match(source, /presence: "unreadable"/u);
  // Every call site stays best effort: no lifecycle append may throw into the
  // start, ready, stop, fatal, or restart paths.
  assert.match(source, /async function appendRuntimeLifecycleEvent\(paths, event, \{ failureClass = null \} = \{\}\) \{\n  try \{/u);
  assert.match(source, /\} catch \{\n    return \{ outcome: "preserved", reason: "history_write_failed" \};\n  \}/u);
  // No caller branches on the append result, so a preserved history can never
  // change whether the runtime starts, stops, or restarts.
  assert.doesNotMatch(source, /(const|let|if)[^\n]*await appendRuntimeLifecycleEvent/u);
});

test("lifecycle history classification preserves any present-but-invalid record", () => {
  const good = { observed_at: "2026-08-19T00:00:00.000Z", event: "ready", failure_class: null };
  const schemaVersion = TEAM_OPS_BOARD_RUNTIME_LIFECYCLE_HISTORY_SCHEMA;
  const options = { schemaVersion, isEntry: isRuntimeLifecycleEntry };

  assert.equal(classifyBoundedHistory({ presence: "missing", value: null, ...options }).state, "missing");
  assert.equal(classifyBoundedHistory({ presence: "unreadable", value: null, ...options }).state, "invalid");
  assert.equal(classifyBoundedHistory({ presence: "present", value: { schema_version: schemaVersion, entries: [good] }, ...options }).state, "valid");
  for (const corrupt of [
    { schema_version: "soulforge.foreign.v1", entries: [good] },
    { schema_version: schemaVersion, entries: [good, { tampered: true }] },
    { schema_version: schemaVersion, entries: [{ ...good, run_id: "0f3c1c1e-1c1e-4c1e-8c1e-1c1e1c1e1c1e" }] },
    { schema_version: schemaVersion, entries: "nope" },
    null,
  ]) {
    const classified = classifyBoundedHistory({ presence: "present", value: corrupt, ...options });
    assert.equal(classified.state, "invalid");
    assert.deepEqual(classified.entries, []);
    const plan = planBoundedHistoryAppend({ classified, entry: good, schemaVersion, isEntry: isRuntimeLifecycleEntry });
    assert.equal(plan.record, null, "no replacement record is ever produced for a corrupt history");
    assert.equal(plan.outcome, "preserved");
  }
});

test("Vite config registers GET-only /receipt-expiry.snapshot.json with stable owner-root binding and read-only authority boundary", async () => {
  const viteConfigPath = path.resolve(HERE, "..", "..", "vite.config.ts");
  const configSource = await readFile(viteConfigPath, "utf8");

  assert.match(
    configSource,
    /import\s+\{\s*createReceiptExpiryServerAdapter\s*\}\s+from\s+"\.\/src\/server\/receipt-expiry-adapter\.mjs";/u,
  );
  assert.match(
    configSource,
    /createReceiptExpiryServerAdapter\(\{\s*bindingPath:\s*receiptExpiryBindingPath,\s*ownerRoot\s*\}\)/u,
  );
  assert.match(
    configSource,
    /const receiptExpiryBindingPath = path\.join\(/u,
  );
  assert.match(
    configSource,
    /"receipt_expiry_binding\.v1\.json"/u,
  );
  assert.doesNotMatch(configSource, /receiptExpiry.*(?:write|repair|mutate|post)/iu);
});

test("Vite config registers GET-only /codex-retention.snapshot.json with stable owner-root binding and read-only authority boundary", async () => {
  const viteConfigPath = path.resolve(HERE, "..", "..", "vite.config.ts");
  const configSource = await readFile(viteConfigPath, "utf8");

  assert.match(
    configSource,
    /import\s+\{\s*createCodexRetentionServerAdapter\s*\}\s+from\s+"\.\/src\/server\/codex-retention-adapter\.mjs";/u,
  );
  assert.match(
    configSource,
    /createCodexRetentionServerAdapter\(\{\s*ownerRoot\s*\}\)/u,
  );
  assert.doesNotMatch(configSource, /codexRetention.*(?:write|repair|mutate|post)/iu);
});
