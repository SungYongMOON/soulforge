#!/usr/bin/env node

import { execFile, fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { request } from "node:http";
import { createConnection, createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  TEAM_OPS_BOARD_CLAUDE_QUOTA_READ,
  TEAM_OPS_BOARD_READ_ONLY_PILOT,
  isTeamOpsBoardReadOnlyPilot,
} from "../src/core/team-ops-board-read-only-pilot.mjs";
import { resolveTeamOpsBoardAllowedHosts } from "../src/server/team-ops-board-allowed-hosts.mjs";
import { startUsageProducerCompanion } from "./ai-usage-producer-companion.mjs";

export const TEAM_OPS_BOARD_RUNTIME_SCHEMA = "soulforge.team_ops_board.runtime.v1";
export const TEAM_OPS_BOARD_RUNTIME_HOST = "127.0.0.1";
export const TEAM_OPS_BOARD_RUNTIME_PORT = 4192;
export const TEAM_OPS_BOARD_RUNTIME_PIPE = String.raw`\\.\pipe\soulforge-team-ops-board-runtime-v1`;
export const TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE = String.raw`\\.\pipe\soulforge-team-ops-board-runtime-launch-v1`;
export const TEAM_OPS_BOARD_RUNTIME_TASK_NAME = "Soulforge-TeamOpsBoard-ReadOnly-v1";
export const TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ =
  "TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ";

const RUNTIME_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "APPDATA",
  "CODEX_HOME",
  "ComSpec",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "SOULFORGE_AI_USAGE_METER_STATE_ROOT",
  "TEAM_OPS_BOARD_ALLOWED_HOSTS",
  "TEAM_OPS_BOARD_ANTIGRAVITY_STATE_DB",
  "TEAM_OPS_BOARD_CLAUDE_PROJECTS_ROOT",
  "TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS",
  "TEAM_OPS_BOARD_HOST_DISK_ROOTS",
  "TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL",
  "TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT",
  "TEAM_OPS_BOARD_ORGANIZATION_CATALOG",
  "TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY",
  "TEAM_OPS_BOARD_READ_ONLY_PILOT",
  "TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY",
  "TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY",
  "TEAM_OPS_BOARD_WATCHTOWER_POINTER",
]);
const SCHEDULED_OS_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "APPDATA",
  "ComSpec",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "PROGRAMDATA",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
]);
const SCHEDULED_HELPER_ENVIRONMENT_ALLOWLIST = Object.freeze([
  ...SCHEDULED_OS_ENVIRONMENT_ALLOWLIST,
  "PSModulePath",
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const SOULFORGE_ROOT = path.resolve(APP_ROOT, "../../..");
const CONFIG_FILE = path.join(APP_ROOT, "vite.config.ts");
const DIST_INDEX = path.join(APP_ROOT, "dist", "index.html");
const RUNTIME_DEPENDENCY_SENTINEL = path.resolve(
  APP_ROOT,
  "..",
  "..",
  "node_modules",
  "vite",
  "package.json",
);
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 15_000;
const CONTROL_TIMEOUT_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
export const TEAM_OPS_BOARD_RUNTIME_HEARTBEAT_MAX_AGE_MS = 30_000;
export const TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES = 4096;
export const TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES = 128 * 1024;
export const TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT = 3;
export const TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL = "PT1M";
export const TEAM_OPS_BOARD_CHILD_RESTART_LIMIT = 3;
export const TEAM_OPS_BOARD_CHILD_RESTART_BACKOFF_MS = 1_000;
const CHILD_HEALTH_POLL_MS = 1_000;
const CONTROLLER_CHILD_STOP_ACTION = "controller_stop";
const MAX_RECORD_BYTES = TEAM_OPS_BOARD_RUNTIME_PUBLIC_RECORD_MAX_BYTES;
const execFileAsync = promisify(execFile);
const SAFE_FAILURE_CLASSES = new Set([
  "allowed_host_unavailable",
  "build_unavailable",
  "control_unavailable",
  "health_failed",
  "identity_mismatch",
  "owner_root_unavailable",
  "pilot_required",
  "port_unavailable",
  "runtime_already_running",
  "runtime_platform_unsupported",
  "runtime_recovery_unsafe",
  "runtime_start_ambiguous",
  "runtime_start_failed",
  "runtime_start_timeout",
  "runtime_state_ambiguous",
  "runtime_state_unsafe",
  "runtime_stop_ambiguous",
  "runtime_worker_absent",
  "runtime_worker_failed",
  "serve_state_unsafe",
  "termination_capture_failed",
  "task_definition_mismatch",
  "task_intent_unavailable",
  "task_unavailable",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function decideBoardChildSupervisor({
  desiredState,
  childExited,
  childReady,
  restartCount,
  restartLimit = TEAM_OPS_BOARD_CHILD_RESTART_LIMIT,
}) {
  if (desiredState !== "running") return "stop";
  if (!childExited && childReady) return "continue";
  return restartCount < restartLimit ? "restart" : "exhausted";
}

export function classifyBoardChildStartingState(state, {
  now = Date.now(),
  startTimeoutMs = START_TIMEOUT_MS,
} = {}) {
  if (state?.state !== "starting") return "not_starting";
  const startedAt = Date.parse(state.started_at);
  if (!Number.isFinite(startedAt) || startedAt > now) return "hold";
  return now - startedAt > startTimeoutMs ? "nonready" : "starting";
}

export function sanitizeRuntimeFailure(error, fallback = "runtime_start_failed") {
  if (error?.code === "EADDRINUSE") return "port_unavailable";
  return SAFE_FAILURE_CLASSES.has(error?.code) ? error.code : fallback;
}

const DESIRED_STATES = new Set([
  "running",
  "stopped",
  "stop_requested",
  "recovery_needed",
]);
const TERMINATION_CLASSIFICATIONS = new Set([
  "normal_stop",
  "handled_error",
  "native_crash",
  "external_termination",
  "dependency_loss",
  "unknown",
]);

export function transitionRuntimeDesiredState(current, event, observedAt) {
  const timestamp = String(observedAt ?? "");
  if (!Number.isFinite(Date.parse(timestamp))) fail("runtime_state_ambiguous");
  const epoch = current?.intent_epoch ?? 0;
  if (!Number.isSafeInteger(epoch) || epoch < 0) fail("runtime_state_ambiguous");
  const desiredState = current?.desired_state ?? "stopped";
  if (!DESIRED_STATES.has(desiredState)) fail("runtime_state_ambiguous");
  if (event === "start") {
    if (desiredState === "running") return { ...current };
    return {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      desired_state: "running",
      intent_epoch: epoch + 1,
      updated_at: timestamp,
    };
  }
  if (event === "request_stop") {
    if (["stopped", "stop_requested"].includes(desiredState)) return { ...current };
    return {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      desired_state: "stop_requested",
      intent_epoch: epoch + 1,
      updated_at: timestamp,
    };
  }
  if (event === "stopped") {
    if (desiredState === "stopped" && current) return { ...current };
    return {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      desired_state: "stopped",
      intent_epoch: epoch,
      updated_at: timestamp,
    };
  }
  if (event === "recovery_needed") {
    if (desiredState === "recovery_needed") return { ...current };
    return {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      desired_state: "recovery_needed",
      intent_epoch: epoch,
      updated_at: timestamp,
    };
  }
  fail("runtime_state_ambiguous");
}

export function classifyScheduledTaskResult(lastTaskResult) {
  if (lastTaskResult === null || lastTaskResult === undefined) return "unavailable";
  if (!Number.isSafeInteger(lastTaskResult)) return "invalid";
  if (lastTaskResult === 0) return "success";
  if (lastTaskResult === 267009) return "running";
  if ([267014, -1073741510].includes(lastTaskResult)) return "terminated";
  if ([-1073741819, -1073740791].includes(lastTaskResult)) return "native_crash";
  return "failed";
}

export function classifyRuntimeTermination({
  desiredState,
  runtimeState,
  lastTaskResultClass,
  heartbeatAgeMs,
  dependencyAvailable,
  dependencyLossBeforeExit = false,
  workerAliveAtCapture = null,
  handledFailure = false,
}) {
  if (dependencyAvailable === false && dependencyLossBeforeExit === true) {
    return "dependency_loss";
  }
  if (handledFailure === true || runtimeState === "error") return "handled_error";
  if (desiredState === "stop_requested" && workerAliveAtCapture === true) return "normal_stop";
  if (desiredState === "stopped" && runtimeState === "absent"
      && lastTaskResultClass === "success") return "normal_stop";
  const freshHeartbeat = Number.isFinite(heartbeatAgeMs)
    && heartbeatAgeMs >= 0
    && heartbeatAgeMs <= TEAM_OPS_BOARD_RUNTIME_HEARTBEAT_MAX_AGE_MS;
  if (lastTaskResultClass === "terminated" && freshHeartbeat) return "external_termination";
  if (lastTaskResultClass === "native_crash" && freshHeartbeat) return "native_crash";
  return "unknown";
}

export function createTerminationReceipt({
  operation,
  desired,
  runtimeState,
  taskState,
  lastTaskResult,
  dependencyAvailable,
  dependencyLossBeforeExit = false,
  workerAliveAtCapture = null,
  observedAt,
}) {
  const timestamp = String(observedAt ?? "");
  const observedMs = Date.parse(timestamp);
  if (!Number.isFinite(observedMs)
      || !new Set(["pre_stop", "pre_recover", "pre_unregister", "restart_recovery"])
        .has(operation)) fail("termination_capture_failed");
  const heartbeatMs = Date.parse(runtimeState?.heartbeat_at ?? "");
  const heartbeatAgeMs = Number.isFinite(heartbeatMs) && observedMs >= heartbeatMs
    ? observedMs - heartbeatMs
    : null;
  const heartbeat = heartbeatAgeMs === null
    ? "absent"
    : heartbeatAgeMs <= TEAM_OPS_BOARD_RUNTIME_HEARTBEAT_MAX_AGE_MS ? "fresh" : "stale";
  const resultClass = classifyScheduledTaskResult(lastTaskResult);
  const exitClassification = classifyRuntimeTermination({
    desiredState: desired?.desired_state ?? "unknown",
    runtimeState: runtimeState?.state ?? "absent",
    lastTaskResultClass: resultClass,
    heartbeatAgeMs,
    dependencyAvailable,
    dependencyLossBeforeExit,
    workerAliveAtCapture,
    handledFailure: runtimeState?.state === "error",
  });
  if (!TERMINATION_CLASSIFICATIONS.has(exitClassification)) fail("termination_capture_failed");
  return {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    receipt_kind: "termination_evidence",
    operation,
    observed_at: timestamp,
    desired_state: desired?.desired_state ?? "unknown",
    intent_epoch: desired?.intent_epoch ?? null,
    task_state: new Set(["missing", "ready", "running", "queued", "disabled"])
      .has(taskState) ? taskState : "unknown",
    last_result_class: resultClass,
    runtime_marker: new Set(["starting", "ready", "stopping", "error"])
      .has(runtimeState?.state) ? runtimeState.state : "absent",
    heartbeat,
    exit_classification: exitClassification,
    dependency_state: dependencyAvailable === true
      ? "available" : dependencyAvailable === false ? "unavailable" : "unknown",
  };
}

export function validateRuntimeLaunchEnvironment(env = process.env) {
  if (!isTeamOpsBoardReadOnlyPilot(env)
      || env?.[TEAM_OPS_BOARD_READ_ONLY_PILOT] !== "1") {
    fail("pilot_required");
  }
  const allowedHosts = resolveTeamOpsBoardAllowedHosts(env);
  if (allowedHosts.length !== 1) fail("allowed_host_unavailable");
  return { read_only_pilot: true, allowed_host_count: 1 };
}

export function createRuntimeWorkerEnvironment(env = process.env) {
  const workerEnv = {};
  for (const name of RUNTIME_ENVIRONMENT_ALLOWLIST) {
    if (typeof env?.[name] === "string") workerEnv[name] = env[name];
  }
  delete workerEnv[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ];
  delete workerEnv[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  if (env?.[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ] === "1") {
    workerEnv[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ] = "1";
  }
  return workerEnv;
}

export function scheduledQuotaReadRequested(env = process.env) {
  return env?.[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ] === "1";
}

function quoteWindowsCommandArgument(value) {
  const text = String(value);
  if (text.includes("\u0000") || /[\r\n]/u.test(text)) fail("worker_create_failed");
  const escaped = text
    .replace(/(\\*)"/gu, "$1$1\\\"")
    .replace(/(\\+)$/u, "$1$1");
  return `"${escaped}"`;
}

function powershellSingleQuoted(value) {
  const text = String(value);
  if (text.includes("\u0000") || /[\r\n]/u.test(text)) fail("worker_create_failed");
  return `'${text.replaceAll("'", "''")}'`;
}

function scheduledActionDigest(execute, argumentsValue) {
  return createHash("sha256")
    .update(`${execute}\u0000${argumentsValue}`, "utf8")
    .digest("hex");
}

export function createScheduledTaskDefinition({
  nodePath = process.execPath,
  modulePath = fileURLToPath(import.meta.url),
} = {}) {
  const argumentsValue = `${quoteWindowsCommandArgument(modulePath)} __scheduled_worker`;
  return {
    task_name: TEAM_OPS_BOARD_RUNTIME_TASK_NAME,
    execute: nodePath,
    arguments: argumentsValue,
    action_digest: scheduledActionDigest(nodePath, argumentsValue),
    trigger_count: 0,
    stored_credential_count: 0,
    logon_type: "Interactive",
    run_level: "Limited",
    task_path: "root",
    multiple_instances: "IgnoreNew",
    enabled: true,
    execution_time_limit: "unlimited",
    restart_count: TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT,
    restart_interval: TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL,
    watchdog_count: 0,
  };
}

export function createScheduledTaskPowerShellSpec(operation, {
  definition = createScheduledTaskDefinition(),
  systemRoot = process.env.SystemRoot || process.env.WINDIR,
} = {}) {
  if (!new Set(["inspect", "register", "run", "unregister"]).has(operation)) {
    fail("task_unavailable");
  }
  if (typeof systemRoot !== "string" || systemRoot.trim() === "") fail("task_unavailable");
  const taskName = powershellSingleQuoted(definition.task_name);
  const execute = powershellSingleQuoted(definition.execute);
  const argumentsValue = powershellSingleQuoted(definition.arguments);
  const expectedDigest = powershellSingleQuoted(definition.action_digest);
  const runtimeSchema = powershellSingleQuoted(TEAM_OPS_BOARD_RUNTIME_SCHEMA);
  const script = [
    "$ErrorActionPreference='Stop'",
    `$n=${taskName}`,
    `$e=${execute}`,
    `$a=${argumentsValue}`,
    `$d=${expectedDigest}`,
    `$s=${runtimeSchema}`,
    "$p='\\'",
    "$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent()",
    "$owner=$identity.Name",
    "$ownerSid=$identity.User.Value",
    "function Resolve-Sid([string]$id){try{return (New-Object System.Security.Principal.NTAccount($id)).Translate([System.Security.Principal.SecurityIdentifier]).Value}catch{try{return (New-Object System.Security.Principal.SecurityIdentifier($id)).Value}catch{return $null}}}",
    "function Get-Digest([string]$x,[string]$y){$h=[System.Security.Cryptography.SHA256]::Create();try{$b=[Text.Encoding]::UTF8.GetBytes($x+[char]0+$y);return ([BitConverter]::ToString($h.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}",
  ];
  if (operation === "register") {
    script.push(
      "$existing=Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue",
      "if($null -ne $existing){throw 'task_definition_mismatch'}",
      "$action=New-ScheduledTaskAction -Execute $e -Argument $a",
      "$principal=New-ScheduledTaskPrincipal -UserId $owner -LogonType Interactive -RunLevel Limited",
      "$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))",
      "$definition=New-ScheduledTask -Action $action -Principal $principal -Settings $settings -Description 'Soulforge Team Operations Board read-only on-demand runtime'",
      "$null=Register-ScheduledTask -TaskPath $p -TaskName $n -InputObject $definition",
    );
  } else if (operation === "run") {
    script.push(
      "$t=Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue",
      "$actions=@($t.Actions);$triggers=@($t.Triggers | Where-Object { $null -ne $_ });$logon=[string]$t.Principal.LogonType;$settings=$t.Settings;$principalSid=Resolve-Sid ([string]$t.Principal.UserId)",
      "if($null -eq $t -or [string]$t.State -ne 'Ready' -or [string]$t.TaskPath -ne $p -or $triggers.Count -ne 0 -or $actions.Count -ne 1 -or (Get-Digest ([string]$actions[0].Execute) ([string]$actions[0].Arguments)) -ne $d -or $null -eq $principalSid -or $principalSid -ne $ownerSid -or $logon -ne 'Interactive' -or [string]$t.Principal.RunLevel -ne 'Limited' -or [string]$settings.MultipleInstances -ne 'IgnoreNew' -or $settings.Enabled -ne $true -or [string]$settings.ExecutionTimeLimit -ne 'PT0S' -or [int]$settings.RestartCount -ne 3 -or [string]$settings.RestartInterval -ne 'PT1M'){throw 'task_definition_mismatch'}",
      "Start-ScheduledTask -TaskPath $p -TaskName $n",
      "$o=[pscustomobject]@{schema_version=$s;ok=$true;outcome='run_requested'}",
    );
  } else if (operation === "unregister") {
    script.push(
      "$t=Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue",
      "$actions=@($t.Actions);$triggers=@($t.Triggers | Where-Object { $null -ne $_ });$logon=[string]$t.Principal.LogonType;$settings=$t.Settings;$principalSid=Resolve-Sid ([string]$t.Principal.UserId)",
      "if($null -eq $t -or [string]$t.State -ne 'Ready' -or [string]$t.TaskPath -ne $p -or $triggers.Count -ne 0 -or $actions.Count -ne 1 -or (Get-Digest ([string]$actions[0].Execute) ([string]$actions[0].Arguments)) -ne $d -or $null -eq $principalSid -or $principalSid -ne $ownerSid -or $logon -ne 'Interactive' -or [string]$t.Principal.RunLevel -ne 'Limited' -or [string]$settings.MultipleInstances -ne 'IgnoreNew' -or $settings.Enabled -ne $true -or [string]$settings.ExecutionTimeLimit -ne 'PT0S' -or [int]$settings.RestartCount -ne 3 -or [string]$settings.RestartInterval -ne 'PT1M'){throw 'task_definition_mismatch'}",
      "Unregister-ScheduledTask -TaskPath $p -TaskName $n -Confirm:$false",
      "$o=[pscustomobject]@{schema_version=$s;ok=$true;outcome='unregistered'}",
    );
  }
  if (!new Set(["run", "unregister"]).has(operation)) {
    script.push(
      "$t=Get-ScheduledTask -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue",
      "$info=$(if($null -ne $t){Get-ScheduledTaskInfo -TaskPath $p -TaskName $n -ErrorAction SilentlyContinue}else{$null})",
      "if($null -eq $t){$o=[pscustomobject]@{exists=$false;task_state='missing';trigger_count=0;stored_credential_count=0;current_owner_match=$false;run_level_limited=$false;task_path_root=$false;multiple_instances_ignore_new=$false;enabled=$false;unlimited_execution=$false;restart_count=0;restart_interval=$null;watchdog_count=0;action_count=0;action_digest=$null;last_task_result=$null}}else{$actions=@($t.Actions);$triggerObjects=@($t.Triggers | Where-Object { $null -ne $_ });$logon=[string]$t.Principal.LogonType;$settings=$t.Settings;$restart=[int]$settings.RestartCount;$triggerCount=$triggerObjects.Count;$principalSid=Resolve-Sid ([string]$t.Principal.UserId);$o=[pscustomobject]@{exists=$true;task_state=([string]$t.State).ToLowerInvariant();trigger_count=$triggerCount;stored_credential_count=($(if($logon -eq 'Interactive'){0}else{1}));current_owner_match=($null -ne $principalSid -and $principalSid -eq $ownerSid);run_level_limited=([string]$t.Principal.RunLevel -eq 'Limited');task_path_root=([string]$t.TaskPath -eq $p);multiple_instances_ignore_new=([string]$settings.MultipleInstances -eq 'IgnoreNew');enabled=($settings.Enabled -eq $true);unlimited_execution=([string]$settings.ExecutionTimeLimit -eq 'PT0S');restart_count=$restart;restart_interval=([string]$settings.RestartInterval);watchdog_count=$(if($triggerCount -eq 0){0}else{1});action_count=$actions.Count;action_digest=$(if($actions.Count -eq 1){Get-Digest ([string]$actions[0].Execute) ([string]$actions[0].Arguments)}else{$null});last_task_result=$(if($null -ne $info){[int64]$info.LastTaskResult}else{$null})}}",
    );
  }
  script.push("[Console]::Out.Write(($o|ConvertTo-Json -Compress))");
  const powershell = path.join(
    path.resolve(systemRoot),
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return {
    file: powershell,
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(script.join(";"), "utf16le").toString("base64"),
    ],
    env_names: ["SystemRoot", "WINDIR", "TEMP", "TMP"],
  };
}

export function scheduledTaskInspectionIsExact(inspection, definition = createScheduledTaskDefinition()) {
  return inspection?.exists === true
    && inspection.trigger_count === 0
    && inspection.stored_credential_count === 0
    && inspection.current_owner_match === true
    && inspection.run_level_limited === true
    && inspection.task_path_root === true
    && inspection.multiple_instances_ignore_new === true
    && inspection.enabled === true
    && inspection.unlimited_execution === true
    && inspection.restart_count === TEAM_OPS_BOARD_RUNTIME_RESTART_COUNT
    && inspection.restart_interval === TEAM_OPS_BOARD_RUNTIME_RESTART_INTERVAL
    && inspection.watchdog_count === 0
    && inspection.action_count === 1
    && inspection.action_digest === definition.action_digest;
}

export function scheduledTaskUnregisterIsSafe({ inspection, runtimeOwnership, listenerState }) {
  return scheduledTaskInspectionIsExact(inspection)
    && inspection.task_state === "ready"
    && runtimeOwnership === "stopped"
    && listenerState === "absent";
}

function anyTrue(value) {
  if (value === true) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some(anyTrue);
}

function servedHost(value) {
  if (typeof value !== "string") return null;
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function loopbackProxy(value) {
  if (typeof value !== "string") return false;
  try {
    const proxy = new URL(value);
    return proxy.protocol === "http:"
      && proxy.hostname === TEAM_OPS_BOARD_RUNTIME_HOST
      && Number(proxy.port) === TEAM_OPS_BOARD_RUNTIME_PORT;
  } catch {
    return false;
  }
}

export function deriveAllowedHostFromServeStatus(status) {
  if (!status || typeof status !== "object" || Array.isArray(status)) fail("serve_state_unsafe");
  if (anyTrue(status.AllowFunnel)) fail("serve_state_unsafe");
  const matches = new Set();
  for (const [origin, site] of Object.entries(status.Web ?? {})) {
    const host = servedHost(origin);
    for (const handler of Object.values(site?.Handlers ?? {})) {
      if (loopbackProxy(handler?.Proxy)) matches.add(host);
    }
  }
  const hosts = [...matches].filter(Boolean);
  if (hosts.length !== 1) fail("serve_state_unsafe");
  const allowed = resolveTeamOpsBoardAllowedHosts({ TEAM_OPS_BOARD_ALLOWED_HOSTS: hosts[0] });
  if (allowed.length !== 1 || allowed[0] !== hosts[0]) fail("serve_state_unsafe");
  return hosts[0];
}

export function createScheduledRuntimeEnvironment({
  baseEnvironment = {},
  ownerRoot,
  serveStatus,
} = {}) {
  if (typeof ownerRoot !== "string" || !path.isAbsolute(ownerRoot)) fail("owner_root_unavailable");
  const operationsRoot = path.join(path.resolve(ownerRoot), "guild_hall", "state", "operations");
  const boardStateRoot = path.join(operationsRoot, "team_ops_board");
  const usageRoot = path.join(operationsRoot, "ai_usage_meter");
  const env = {};
  for (const name of SCHEDULED_OS_ENVIRONMENT_ALLOWLIST) {
    if (typeof baseEnvironment?.[name] === "string") env[name] = baseEnvironment[name];
  }
  Object.assign(env, {
    TEAM_OPS_BOARD_READ_ONLY_PILOT: "1",
    TEAM_OPS_BOARD_ALLOWED_HOSTS: deriveAllowedHostFromServeStatus(serveStatus),
    TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY: path.join(boardStateRoot, "thread_visibility.v1.json"),
    TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY: path.join(boardStateRoot, "thread_result_gate.v1.json"),
    SOULFORGE_AI_USAGE_METER_STATE_ROOT: usageRoot,
    TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT: path.join(usageRoot, "lifecycle", "current.json"),
    TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL: path.join(usageRoot, "control", "emergency-disable.v1.json"),
    TEAM_OPS_BOARD_WATCHTOWER_POINTER: path.join(operationsRoot, "watchtower", "binding.pointer.json"),
    TEAM_OPS_BOARD_ORGANIZATION_GOVERNANCE_OVERLAY: path.join(
      path.resolve(ownerRoot),
      "_workmeta",
      "system",
      "bindings",
      "organization_governance_overlay.v1.json",
    ),
  });
  delete env[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ];
  delete env[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  validateRuntimeLaunchEnvironment(env);
  return env;
}

export function createScheduledLaunchIntentEnvelope(runId, env = process.env) {
  if (typeof runId !== "string" || !/^[a-f0-9-]{36}$/u.test(runId)) {
    fail("task_intent_unavailable");
  }
  return {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    run_id: runId,
    quota_read: scheduledQuotaReadRequested(env),
  };
}

export function classifyRuntimeRecovery({
  state,
  lock,
  ownerAlive,
  controlAvailable,
  listenerState,
}) {
  if (classifyRuntimeOwnership(state, lock) !== "owned") return "unsafe";
  if (ownerAlive !== false || controlAvailable !== false || listenerState !== "absent") {
    return "unsafe";
  }
  return "recoverable";
}

export function createPreviewConfig() {
  return {
    root: APP_ROOT,
    configFile: CONFIG_FILE,
    preview: {
      host: TEAM_OPS_BOARD_RUNTIME_HOST,
      port: TEAM_OPS_BOARD_RUNTIME_PORT,
      strictPort: true,
    },
  };
}

export function authorizeRuntimeControl(runtimeState, requestValue) {
  if (!runtimeState || requestValue?.run_id !== runtimeState.run_id) {
    return { ok: false, outcome: "identity_mismatch" };
  }
  if (!new Set(["status", "health", "stop", "fault"]).has(requestValue?.action)) {
    return { ok: false, outcome: "control_unavailable" };
  }
  return { ok: true, outcome: requestValue.action };
}

export function classifyRuntimeOwnership(state, lock) {
  if (!state && !lock) return "stopped";
  if (!state || !lock
      || state.run_id !== lock.run_id
      || state.pid !== lock.pid) return "ambiguous";
  return "owned";
}

export function transitionRuntimeState(state, event, failureClass = null) {
  if (!state) fail("runtime_state_ambiguous");
  if (event === "preview_ready" && state.state === "starting") {
    return { ...state, state: "ready", failure_class: null };
  }
  if (event === "stop_requested" && ["starting", "ready"].includes(state.state)) {
    return { ...state, state: "stopping" };
  }
  if (event === "start_failed" && state.state === "starting"
      && SAFE_FAILURE_CLASSES.has(failureClass)) {
    return { ...state, state: "error", failure_class: failureClass };
  }
  if (event === "runtime_failed" && state.state === "ready"
      && SAFE_FAILURE_CLASSES.has(failureClass)) {
    return { ...state, state: "error", failure_class: failureClass };
  }
  fail("runtime_state_ambiguous");
}

export function refreshRuntimeHeartbeat(state, observedAt) {
  if (state?.state !== "ready"
      || typeof observedAt !== "string"
      || !Number.isFinite(Date.parse(observedAt))) fail("runtime_state_ambiguous");
  return { ...state, heartbeat_at: observedAt };
}

export function runtimeHeartbeatIsFresh(state, now = Date.now()) {
  const observedAt = Date.parse(state?.heartbeat_at ?? "");
  const reference = typeof now === "function" ? now() : now;
  return Number.isFinite(observedAt)
    && Number.isFinite(reference)
    && reference >= observedAt
    && reference - observedAt <= TEAM_OPS_BOARD_RUNTIME_HEARTBEAT_MAX_AGE_MS;
}

export function runtimeHealthIsReady(state, control, loopbackHeadOk, now = Date.now()) {
  return state?.state === "ready"
    && runtimeHeartbeatIsFresh(state, now)
    && control?.ok === true
    && control?.run_id === state.run_id
    && loopbackHeadOk === true;
}

export async function closePreviewGracefully(previewServer) {
  if (!previewServer || typeof previewServer.close !== "function") {
    fail("runtime_stop_ambiguous");
  }
  await previewServer.close();
}

function runtimeStateRoot(env = process.env) {
  const localRoot = env?.LOCALAPPDATA;
  if (process.platform === "win32") {
    if (typeof localRoot !== "string" || localRoot.trim() === "") {
      fail("runtime_state_unsafe");
    }
    return path.join(path.resolve(localRoot), "Soulforge", "team-ops-board-runtime");
  }
  return path.join(os.tmpdir(), "soulforge-team-ops-board-runtime");
}

function runtimePaths(env = process.env) {
  const root = runtimeStateRoot(env);
  return {
    root,
    lock: path.join(root, "runtime.v1.lock"),
    state: path.join(root, "runtime.v1.json"),
    desired: path.join(root, "desired.v1.json"),
    terminationReceipt: path.join(root, "termination-receipt.v1.json"),
  };
}

async function ensureNormalDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("runtime_state_unsafe");
}

async function normalDirectoryIfPresent(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("runtime_state_unsafe");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function optionalNormalFile(filePath) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RECORD_BYTES) {
      fail("runtime_state_unsafe");
    }
    return info;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonRecord(filePath) {
  if (!(await optionalNormalFile(filePath))) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    fail("runtime_state_ambiguous");
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function isRuntimeRecord(value) {
  return value
    && value.schema_version === TEAM_OPS_BOARD_RUNTIME_SCHEMA
    && typeof value.run_id === "string"
    && /^[a-f0-9-]{36}$/u.test(value.run_id)
    && Number.isSafeInteger(value.pid)
    && value.pid > 0
    && ["starting", "ready", "stopping", "error"].includes(value.state)
    && value.host === "loopback"
    && value.port === TEAM_OPS_BOARD_RUNTIME_PORT
    && typeof value.started_at === "string"
    && Number.isFinite(Date.parse(value.started_at))
    && (value.heartbeat_at === null
      || (typeof value.heartbeat_at === "string" && Number.isFinite(Date.parse(value.heartbeat_at))))
    && (value.build_sha256 === null || /^[a-f0-9]{64}$/u.test(value.build_sha256))
    && (value.failure_class === null || SAFE_FAILURE_CLASSES.has(value.failure_class));
}

async function readRuntimeState(paths) {
  const state = await readJsonRecord(paths.state);
  if (state === null) return null;
  if (!isRuntimeRecord(state)) fail("runtime_state_ambiguous");
  return state;
}

async function readRuntimeLock(paths) {
  const lock = await readJsonRecord(paths.lock);
  if (lock === null) return null;
  if (lock.schema_version !== TEAM_OPS_BOARD_RUNTIME_SCHEMA
      || typeof lock.run_id !== "string"
      || !Number.isSafeInteger(lock.pid)
      || lock.pid < 1
      || typeof lock.started_at !== "string") {
    fail("runtime_state_ambiguous");
  }
  return lock;
}

function isDesiredRecord(value) {
  return value
    && value.schema_version === TEAM_OPS_BOARD_RUNTIME_SCHEMA
    && DESIRED_STATES.has(value.desired_state)
    && Number.isSafeInteger(value.intent_epoch)
    && value.intent_epoch >= 0
    && typeof value.updated_at === "string"
    && Number.isFinite(Date.parse(value.updated_at));
}

async function readDesiredState(paths) {
  const value = await readJsonRecord(paths.desired);
  if (value === null) return null;
  if (!isDesiredRecord(value)) fail("runtime_state_ambiguous");
  return value;
}

async function writeDesiredState(paths, value) {
  if (!isDesiredRecord(value)) fail("runtime_state_ambiguous");
  await writeJsonAtomic(paths.desired, value);
  const observed = await readDesiredState(paths);
  if (!observed || observed.desired_state !== value.desired_state
      || observed.intent_epoch !== value.intent_epoch) fail("runtime_state_ambiguous");
  return observed;
}

export function isTerminationReceipt(value) {
  return value
    && value.schema_version === TEAM_OPS_BOARD_RUNTIME_SCHEMA
    && value.receipt_kind === "termination_evidence"
    && new Set(["pre_stop", "pre_recover", "pre_unregister", "restart_recovery"])
      .has(value.operation)
    && typeof value.observed_at === "string"
    && Number.isFinite(Date.parse(value.observed_at))
    && ((value.desired_state === "unknown" && value.intent_epoch === null)
      || (DESIRED_STATES.has(value.desired_state)
        && Number.isSafeInteger(value.intent_epoch) && value.intent_epoch >= 0))
    && TERMINATION_CLASSIFICATIONS.has(value.exit_classification)
    && new Set(["available", "unavailable", "unknown"]).has(value.dependency_state);
}

async function dependencyAvailable() {
  try {
    const [buildInfo, dependencyInfo] = await Promise.all([
      lstat(DIST_INDEX),
      lstat(RUNTIME_DEPENDENCY_SENTINEL),
    ]);
    return buildInfo.isFile() && !buildInfo.isSymbolicLink()
      && dependencyInfo.isFile() && !dependencyInfo.isSymbolicLink();
  } catch {
    return false;
  }
}

async function captureTerminationEvidence(paths, operation, {
  task = null,
  desired = null,
  state = null,
  workerAliveAtCapture = null,
} = {}) {
  try {
    const receipt = createTerminationReceipt({
      operation,
      desired: desired ?? await readDesiredState(paths),
      runtimeState: state ?? await readRuntimeState(paths),
      taskState: task?.task_state ?? "unknown",
      lastTaskResult: task?.last_task_result ?? null,
      dependencyAvailable: await dependencyAvailable(),
      workerAliveAtCapture,
      observedAt: new Date().toISOString(),
    });
    await writeJsonAtomic(paths.terminationReceipt, receipt);
    const observed = await readJsonRecord(paths.terminationReceipt);
    if (!isTerminationReceipt(observed)
        || observed.observed_at !== receipt.observed_at
        || observed.operation !== operation) fail("termination_capture_failed");
    return observed;
  } catch {
    fail("termination_capture_failed");
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function buildDigest() {
  try {
    const info = await lstat(DIST_INDEX);
    if (!info.isFile() || info.isSymbolicLink()) fail("build_unavailable");
    return createHash("sha256").update(await readFile(DIST_INDEX)).digest("hex");
  } catch (error) {
    if (error?.code === "build_unavailable") throw error;
    fail("build_unavailable");
  }
}

export function createPublicRuntimeState(state, overrides = {}, now = Date.now()) {
  const result = {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    ok: state?.state === "ready",
    state: state?.state ?? "stopped",
    outcome: state?.failure_class ?? null,
    run_id: state?.run_id ?? null,
    pid: state?.pid ?? null,
    host: state ? "loopback" : null,
    port: state?.port ?? TEAM_OPS_BOARD_RUNTIME_PORT,
    started_at: state?.started_at ?? null,
    build_sha256: state?.build_sha256 ?? null,
    ...overrides,
  };
  result.ok = state
    ? state.state === "ready" && runtimeHeartbeatIsFresh(state, now)
    : (overrides.ok ?? true);
  return result;
}

function headLoopback(timeoutMs = CONTROL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const probe = request({
      host: TEAM_OPS_BOARD_RUNTIME_HOST,
      port: TEAM_OPS_BOARD_RUNTIME_PORT,
      path: "/",
      method: "HEAD",
      timeout: timeoutMs,
      headers: { host: "localhost" },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode >= 200 && response.statusCode < 400));
    });
    probe.on("timeout", () => probe.destroy());
    probe.on("error", () => resolve(false));
    probe.end();
  });
}

function sendControl(payload, timeoutMs = CONTROL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(TEAM_OPS_BOARD_RUNTIME_PIPE);
    let bytes = "";
    const timer = setTimeout(() => socket.destroy(new Error("control_unavailable")), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on("data", (chunk) => {
      bytes += chunk;
      if (bytes.length > MAX_RECORD_BYTES) socket.destroy(new Error("control_unavailable"));
      const newline = bytes.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(bytes.slice(0, newline)));
      } catch {
        reject(Object.assign(new Error("control_unavailable"), { code: "control_unavailable" }));
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(Object.assign(error, { code: "control_unavailable" }));
    });
  });
}

async function listenScheduledLaunchIntent(env = process.env) {
  const sockets = new Set();
  let settle;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    settle = resolve;
    rejectCompletion = reject;
  });
  const timer = setTimeout(
    () => rejectCompletion(Object.assign(new Error("task_intent_unavailable"), { code: "task_intent_unavailable" })),
    START_TIMEOUT_MS,
  );
  completion.finally(() => clearTimeout(timer)).catch(() => {});
  const paths = runtimePaths(env);
  const server = createServer((socket) => {
    let bytes = "";
    let handled = false;
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(CONTROL_TIMEOUT_MS, () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.on("data", async (chunk) => {
      if (handled) return;
      bytes += chunk;
      if (bytes.length > MAX_RECORD_BYTES) {
        handled = true;
        socket.destroy();
        return;
      }
      const newline = bytes.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      let hello;
      try {
        hello = JSON.parse(bytes.slice(0, newline));
        const state = await readRuntimeState(paths);
        const lock = await readRuntimeLock(paths);
        if (hello?.action !== "scheduled_launch"
            || hello?.run_id !== state?.run_id
            || hello?.pid !== state?.pid
            || classifyRuntimeOwnership(state, lock) !== "owned") {
          fail("task_intent_unavailable");
        }
        const envelope = createScheduledLaunchIntentEnvelope(state.run_id, env);
        socket.end(`${JSON.stringify(envelope)}\n`);
        settle(envelope);
      } catch (error) {
        socket.destroy();
        rejectCompletion(Object.assign(error, { code: "task_intent_unavailable" }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE, resolve);
  });
  return { server, sockets, completion };
}

async function closeScheduledLaunchIntent(owner) {
  if (!owner) return;
  for (const socket of owner.sockets) socket.destroy();
  await new Promise((resolve) => owner.server.close(() => resolve()));
}

async function receiveScheduledLaunchIntent(runId) {
  return new Promise((resolve) => {
    const socket = createConnection(TEAM_OPS_BOARD_RUNTIME_LAUNCH_PIPE);
    let bytes = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), CONTROL_TIMEOUT_MS);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify({
      action: "scheduled_launch",
      run_id: runId,
      pid: process.pid,
    })}\n`));
    socket.on("data", (chunk) => {
      bytes += chunk;
      if (bytes.length > MAX_RECORD_BYTES) return finish(false);
      const newline = bytes.indexOf("\n");
      if (newline < 0) return;
      try {
        const envelope = JSON.parse(bytes.slice(0, newline));
        finish(envelope?.schema_version === TEAM_OPS_BOARD_RUNTIME_SCHEMA
          && envelope?.run_id === runId
          && envelope?.quota_read === true);
      } catch {
        finish(false);
      }
    });
    socket.on("error", () => finish(false));
  });
}

function probeControlAvailability(timeoutMs = CONTROL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = createConnection(TEAM_OPS_BOARD_RUNTIME_PIPE);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(null));
    socket.on("connect", () => finish(true));
    socket.on("error", (error) => finish(
      ["ENOENT", "ECONNREFUSED"].includes(error?.code) ? false : null,
    ));
  });
}

export function createScheduledHelperEnvironment(env = process.env) {
  const result = {};
  for (const name of SCHEDULED_HELPER_ENVIRONMENT_ALLOWLIST) {
    if (typeof env?.[name] === "string") result[name] = env[name];
  }
  return result;
}

function validateTaskInspection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.exists !== "boolean"
      || typeof value.task_state !== "string"
      || !Number.isSafeInteger(value.trigger_count)
      || !Number.isSafeInteger(value.stored_credential_count)
      || typeof value.current_owner_match !== "boolean"
      || typeof value.run_level_limited !== "boolean"
      || typeof value.task_path_root !== "boolean"
      || typeof value.multiple_instances_ignore_new !== "boolean"
      || typeof value.enabled !== "boolean"
      || typeof value.unlimited_execution !== "boolean"
      || !Number.isSafeInteger(value.restart_count)
      || (value.restart_interval !== null && typeof value.restart_interval !== "string")
      || !Number.isSafeInteger(value.watchdog_count)
      || !Number.isSafeInteger(value.action_count)
      || (value.last_task_result !== null && !Number.isSafeInteger(value.last_task_result))
      || (value.action_digest !== null && !/^[a-f0-9]{64}$/u.test(value.action_digest))) {
    fail("task_unavailable");
  }
  return value;
}

function validateTaskMutationReceipt(value, operation) {
  const expected = operation === "run" ? "run_requested" : "unregistered";
  if (value?.schema_version !== TEAM_OPS_BOARD_RUNTIME_SCHEMA
      || value?.ok !== true
      || value?.outcome !== expected
      || Object.keys(value).length !== 3) fail("task_unavailable");
  return value;
}

async function invokeScheduledTask(operation, env = process.env) {
  if (process.platform !== "win32") fail("runtime_platform_unsupported");
  const spec = createScheduledTaskPowerShellSpec(operation, {
    systemRoot: env.SystemRoot || env.WINDIR,
  });
  try {
    const { stdout } = await execFileAsync(spec.file, spec.args, {
      encoding: "utf8",
      env: createScheduledHelperEnvironment(env),
      maxBuffer: TEAM_OPS_BOARD_RUNTIME_HELPER_MAX_BUFFER_BYTES,
      timeout: START_TIMEOUT_MS,
      windowsHide: true,
    });
    const parsed = JSON.parse(String(stdout));
    return new Set(["run", "unregister"]).has(operation)
      ? validateTaskMutationReceipt(parsed, operation)
      : validateTaskInspection(parsed);
  } catch {
    fail("task_unavailable");
  }
}

export function classifyRuntimeObservation({
  state,
  ownerAlive,
  listenerState,
  controlReady,
  now = Date.now(),
}) {
  if (!state) return "stopped";
  if (state.state === "error") return "handled_failure";
  if (state.state === "ready" && (ownerAlive === false || listenerState === "absent")) {
    return "runtime_worker_absent";
  }
  if (state.state === "ready" && !runtimeHeartbeatIsFresh(state, now)) return "hold";
  if (state.state === "ready" && ownerAlive === true
      && listenerState === "present" && controlReady === true) return "ready";
  if (state.state === "starting" && ownerAlive === true) return "starting";
  if (state.state === "stopping") return "stopping";
  return "hold";
}

export function createPublicScheduledTaskState(inspection, runtimeHealth, desired = null) {
  const exact = scheduledTaskInspectionIsExact(inspection);
  return {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    ok: exact && runtimeHealth === "ready",
    trigger_count: inspection?.trigger_count ?? null,
    stored_credential_count: inspection?.stored_credential_count ?? null,
    current_owner_match: inspection?.current_owner_match ?? false,
    action_digest: inspection?.action_digest ?? null,
    task_health: !inspection?.exists ? "missing" : exact ? inspection.task_state : "definition_hold",
    runtime_health: runtimeHealth,
    desired_state: desired?.desired_state ?? "stopped",
    intent_epoch: desired?.intent_epoch ?? 0,
    last_result_class: classifyScheduledTaskResult(inspection?.last_task_result),
  };
}

async function resolveOwnerRoot(env = process.env) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("git", [
      "-C", APP_ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir",
    ], {
      encoding: "utf8",
      env: createScheduledHelperEnvironment(env),
      maxBuffer: MAX_RECORD_BYTES,
      timeout: CONTROL_TIMEOUT_MS,
      windowsHide: true,
    }));
  } catch {
    fail("owner_root_unavailable");
  }
  const commonDirectory = path.resolve(String(stdout).trim());
  try {
    const info = await lstat(commonDirectory);
    if (!info.isDirectory() || info.isSymbolicLink()
        || path.basename(commonDirectory).toLowerCase() !== ".git") {
      fail("owner_root_unavailable");
    }
  } catch (error) {
    if (error?.code === "owner_root_unavailable") throw error;
    fail("owner_root_unavailable");
  }
  return path.dirname(commonDirectory);
}

async function readServeStatus(env = process.env) {
  try {
    const { stdout } = await execFileAsync("tailscale", ["serve", "status", "--json"], {
      encoding: "utf8",
      env: createScheduledHelperEnvironment(env),
      maxBuffer: 256 * 1024,
      timeout: CONTROL_TIMEOUT_MS,
      windowsHide: true,
    });
    return JSON.parse(String(stdout));
  } catch {
    fail("serve_state_unsafe");
  }
}

async function deriveScheduledRuntimeEnvironment(env = process.env) {
  return createScheduledRuntimeEnvironment({
    baseEnvironment: env,
    ownerRoot: await resolveOwnerRoot(env),
    serveStatus: await readServeStatus(env),
  });
}

function probeLoopbackListener(timeoutMs = 1_000) {
  return new Promise((resolve) => {
    const socket = createConnection({
      host: TEAM_OPS_BOARD_RUNTIME_HOST,
      port: TEAM_OPS_BOARD_RUNTIME_PORT,
    });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish("ambiguous"));
    socket.on("connect", () => finish("present"));
    socket.on("error", (error) => finish(error?.code === "ECONNREFUSED" ? "absent" : "ambiguous"));
  });
}

async function removeOwnedRecord(filePath, runId) {
  const record = await readJsonRecord(filePath).catch(() => null);
  if (record?.run_id === runId) await rm(filePath, { force: true });
}

async function removeOwnedRuntime(paths, runId) {
  await removeOwnedRecord(paths.state, runId);
  await removeOwnedRecord(paths.lock, runId);
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForWorkerClaim(paths, runId, pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let lock = null;
    let state = null;
    try {
      lock = await readRuntimeLock(paths);
      state = await readRuntimeState(paths);
    } catch (error) {
      if (error?.code !== "runtime_state_ambiguous") throw error;
    }
    if (lock && state) {
      if (lock.run_id !== runId || state.run_id !== runId
          || lock.pid !== pid || state.pid !== pid) {
        fail("identity_mismatch");
      }
      return { lock, state };
    }
    await wait(25);
  }
  fail("identity_mismatch");
}

async function waitForOwnedRuntimeGone(paths, runId, timeoutMs = STOP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readJsonRecord(paths.state);
    const lock = await readJsonRecord(paths.lock);
    if (!state && !lock) return !(await headLoopback(500));
    if ((state && state.run_id !== runId) || (lock && lock.run_id !== runId)) {
      fail("runtime_state_ambiguous");
    }
    await wait(100);
  }
  return false;
}

async function requestOwnedStop(paths, state) {
  const response = await sendControl({ action: "stop", run_id: state.run_id }).catch(() => null);
  if (!response?.ok || response.run_id !== state.run_id || response.outcome !== "stopping") {
    return false;
  }
  return waitForOwnedRuntimeGone(paths, state.run_id);
}

async function waitForScheduledRuntime(env = process.env) {
  const paths = runtimePaths(env);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await readRuntimeState(paths).catch(() => null);
    const lock = await readRuntimeLock(paths).catch(() => null);
    if (state && lock && classifyRuntimeOwnership(state, lock) === "owned") {
      if (state.state === "error") fail(state.failure_class ?? "runtime_start_failed");
      if (!processAlive(state.pid)) fail("runtime_worker_absent");
      if (state.state === "ready") {
        const control = await sendControl({ action: "health", run_id: state.run_id }).catch(() => null);
        if (runtimeHealthIsReady(state, control, await headLoopback())) {
          return createPublicRuntimeState(state, { health: "ok" });
        }
      }
    }
    await wait(100);
  }
  fail("runtime_start_timeout");
}

async function registerScheduledRuntime(env = process.env) {
  const before = await invokeScheduledTask("inspect", env);
  if (before.exists) fail("task_definition_mismatch");
  const after = await invokeScheduledTask("register", env);
  if (!scheduledTaskInspectionIsExact(after)) fail("task_definition_mismatch");
  const paths = runtimePaths(env);
  await ensureNormalDirectory(paths.root);
  const current = await readDesiredState(paths);
  const desired = await writeDesiredState(paths, current?.desired_state === "stopped"
    ? current
    : transitionRuntimeDesiredState(current, "stopped", new Date().toISOString()));
  return createPublicScheduledTaskState(after, "stopped", desired);
}

async function inspectScheduledRuntime(env = process.env) {
  const task = await invokeScheduledTask("inspect", env);
  const paths = runtimePaths(env);
  const desired = await readDesiredState(paths);
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "ambiguous") fail("runtime_state_ambiguous");
  let controlReady = false;
  if (ownership === "owned") {
    const response = await sendControl({ action: "health", run_id: state.run_id }).catch(() => null);
    controlReady = response?.ok === true && response.run_id === state.run_id;
  }
  const listenerState = await probeLoopbackListener();
  const runtimeHealth = classifyRuntimeObservation({
    state,
    ownerAlive: state ? processAlive(state.pid) : false,
    listenerState,
    controlReady,
  });
  if (ownership === "stopped" && listenerState !== "absent") fail("runtime_state_ambiguous");
  const reportedHealth = desired?.desired_state === "running"
    && task.task_state === "ready"
    && ["stopped", "runtime_worker_absent"].includes(runtimeHealth)
    ? "recovery_needed"
    : runtimeHealth;
  return createPublicScheduledTaskState(task, reportedHealth, desired);
}

async function runScheduledRuntime(env = process.env) {
  const task = await invokeScheduledTask("inspect", env);
  if (!scheduledTaskInspectionIsExact(task)) fail("task_definition_mismatch");
  const paths = runtimePaths(env);
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "owned" && state?.state === "ready" && processAlive(state.pid)) {
    return inspectScheduledRuntime(env);
  }
  if (ownership !== "stopped") fail("runtime_already_running");
  if (await probeLoopbackListener() !== "absent") fail("runtime_state_ambiguous");
  await ensureNormalDirectory(paths.root);
  let desired = await readDesiredState(paths);
  if (!desired) {
    desired = {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      desired_state: "stopped",
      intent_epoch: 0,
      updated_at: new Date().toISOString(),
    };
  } else if (desired.desired_state === "running") {
    desired = transitionRuntimeDesiredState(desired, "recovery_needed", new Date().toISOString());
  }
  desired = transitionRuntimeDesiredState(desired, "start", new Date().toISOString());
  await writeDesiredState(paths, desired);
  const exactIntent = scheduledQuotaReadRequested(env);
  const intentOwner = exactIntent ? await listenScheduledLaunchIntent(env) : null;
  try {
    await invokeScheduledTask("run", env);
    if (intentOwner) await intentOwner.completion;
  } catch (error) {
    if (exactIntent) {
      await waitForScheduledRuntime(env).catch(() => null);
      await stopRuntime(env).catch(() => null);
    }
    throw error;
  } finally {
    await closeScheduledLaunchIntent(intentOwner).catch(() => {});
  }
  await waitForScheduledRuntime(env);
  return inspectScheduledRuntime(env);
}

async function unregisterScheduledRuntime(env = process.env) {
  const task = await invokeScheduledTask("inspect", env);
  const paths = runtimePaths(env);
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  const desired = await readDesiredState(paths);
  if (!task.exists && classifyRuntimeOwnership(state, lock) === "stopped"
      && await probeLoopbackListener() === "absent") {
    return createPublicScheduledTaskState(task, "stopped", desired);
  }
  if (desired?.desired_state !== "stopped") fail("runtime_state_ambiguous");
  if (!scheduledTaskUnregisterIsSafe({
    inspection: task,
    runtimeOwnership: classifyRuntimeOwnership(state, lock),
    listenerState: await probeLoopbackListener(),
  })) fail("runtime_state_ambiguous");
  await captureTerminationEvidence(paths, "pre_unregister", { task, desired, state });
  await invokeScheduledTask("unregister", env);
  const after = await invokeScheduledTask("inspect", env);
  if (after.exists) fail("task_definition_mismatch");
  return createPublicScheduledTaskState(after, "stopped", desired);
}

async function inspectRuntime(env = process.env, { health = false } = {}) {
  const paths = runtimePaths(env);
  if (!(await normalDirectoryIfPresent(paths.root))) return createPublicRuntimeState(null, { ok: true });
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "stopped") return createPublicRuntimeState(null, { ok: true });
  if (ownership !== "owned") fail("runtime_state_ambiguous");
  const listenerState = await probeLoopbackListener();
  if (state.state === "ready" && (!processAlive(state.pid) || listenerState === "absent")) {
    fail("runtime_worker_absent");
  }
  if (listenerState === "ambiguous") fail("runtime_state_ambiguous");
  if (health && state.state !== "ready") fail("health_failed");
  const response = await sendControl({ action: health ? "health" : "status", run_id: state.run_id }).catch(() => null);
  if (!response || response.run_id !== state.run_id) fail("runtime_state_ambiguous");
  if (health && !runtimeHealthIsReady(state, response, await headLoopback())) fail("health_failed");
  if (!health && response.outcome !== state.state) fail("runtime_state_ambiguous");
  return createPublicRuntimeState(state, { health: health ? "ok" : null });
}

async function stopRuntime(env = process.env) {
  const paths = runtimePaths(env);
  if (!(await normalDirectoryIfPresent(paths.root))) return createPublicRuntimeState(null, { ok: true });
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  let desired = await readDesiredState(paths);
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "stopped") {
    if (!desired || desired.desired_state === "stopped") {
      return createPublicRuntimeState(null, { ok: true });
    }
    desired = transitionRuntimeDesiredState(desired, "request_stop", new Date().toISOString());
    await writeDesiredState(paths, desired);
    const task = process.platform === "win32"
      ? await invokeScheduledTask("inspect", env)
      : null;
    await captureTerminationEvidence(paths, "pre_stop", {
      task,
      desired,
      state: null,
      workerAliveAtCapture: false,
    });
    await writeDesiredState(
      paths,
      transitionRuntimeDesiredState(desired, "stopped", new Date().toISOString()),
    );
    return createPublicRuntimeState(null, { ok: true, outcome: "stopped" });
  }
  if (ownership !== "owned") fail("runtime_state_ambiguous");
  const workerAliveAtCapture = processAlive(state.pid);
  desired = desired ?? {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    desired_state: "running",
    intent_epoch: 0,
    updated_at: new Date().toISOString(),
  };
  desired = transitionRuntimeDesiredState(desired, "request_stop", new Date().toISOString());
  await writeDesiredState(paths, desired);
  const task = process.platform === "win32"
    ? await invokeScheduledTask("inspect", env)
    : null;
  await captureTerminationEvidence(paths, "pre_stop", {
    task,
    desired,
    state,
    workerAliveAtCapture,
  });
  if (!(await requestOwnedStop(paths, state))) fail("runtime_stop_ambiguous");
  desired = transitionRuntimeDesiredState(desired, "stopped", new Date().toISOString());
  await writeDesiredState(paths, desired);
  return createPublicRuntimeState(null, { ok: true, outcome: "stopped" });
}

async function faultRuntime(env = process.env) {
  const paths = runtimePaths(env);
  const desired = await readDesiredState(paths);
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  if (desired?.desired_state !== "running"
      || classifyRuntimeOwnership(state, lock) !== "owned"
      || state?.state !== "ready") fail("runtime_state_ambiguous");
  const response = await sendControl({ action: "fault", run_id: state.run_id });
  if (!response?.ok || response.run_id !== state.run_id || response.outcome !== "faulting") {
    fail("control_unavailable");
  }
  return { schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA, ok: true, outcome: "fault_requested" };
}

async function recoverRuntime(env = process.env) {
  const paths = runtimePaths(env);
  if (!(await normalDirectoryIfPresent(paths.root))) {
    return createPublicRuntimeState(null, { ok: true, outcome: "nothing_to_recover" });
  }
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  if (!state && !lock) {
    return createPublicRuntimeState(null, { ok: true, outcome: "nothing_to_recover" });
  }
  const controlAvailable = await probeControlAvailability();
  const decision = classifyRuntimeRecovery({
    state,
    lock,
    ownerAlive: state ? processAlive(state.pid) : null,
    controlAvailable,
    listenerState: await probeLoopbackListener(),
  });
  if (decision !== "recoverable") fail("runtime_recovery_unsafe");
  const desired = await readDesiredState(paths);
  const task = process.platform === "win32"
    ? await invokeScheduledTask("inspect", env)
    : null;
  await captureTerminationEvidence(paths, "pre_recover", {
    task,
    desired,
    state,
    workerAliveAtCapture: false,
  });
  await removeOwnedRuntime(paths, state.run_id);
  if (await readJsonRecord(paths.state) || await readJsonRecord(paths.lock)) {
    fail("runtime_recovery_unsafe");
  }
  if (desired?.desired_state === "running") {
    await writeDesiredState(
      paths,
      transitionRuntimeDesiredState(desired, "recovery_needed", new Date().toISOString()),
    );
  }
  return createPublicRuntimeState(null, { ok: true, outcome: "recovered" });
}

async function listenControl(onRequest) {
  const sockets = new Set();
  const server = createServer((socket) => {
    let bytes = "";
    let handled = false;
    sockets.add(socket);
    socket.setTimeout(CONTROL_TIMEOUT_MS, () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      if (handled) return;
      bytes += chunk;
      if (bytes.length > MAX_RECORD_BYTES) {
        handled = true;
        socket.end(`${JSON.stringify({ ok: false, outcome: "control_unavailable" })}\n`);
        return;
      }
      const newline = bytes.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      let requestValue;
      try {
        requestValue = JSON.parse(bytes.slice(0, newline));
      } catch {
        socket.end(`${JSON.stringify({ ok: false, outcome: "control_unavailable" })}\n`);
        return;
      }
      Promise.resolve(onRequest(requestValue))
        .then((value) => socket.end(`${JSON.stringify(value)}\n`))
        .catch(() => socket.end(`${JSON.stringify({ ok: false, outcome: "control_unavailable" })}\n`));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(TEAM_OPS_BOARD_RUNTIME_PIPE, resolve);
  });
  return { server, sockets };
}

async function closeControlServer(owner) {
  if (!owner) return;
  for (const socket of owner.sockets) socket.end();
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      for (const socket of owner.sockets) socket.destroy();
      finish();
    }, CONTROL_TIMEOUT_MS);
    owner.server.close(finish);
  });
}

async function runWorker(runId, env = process.env) {
  const workerEnv = { ...env };
  delete workerEnv[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  if (env === process.env) delete process.env[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  validateRuntimeLaunchEnvironment(workerEnv);
  const paths = runtimePaths(workerEnv);
  await ensureNormalDirectory(paths.root);
  const { lock, state: startingState } = await waitForWorkerClaim(paths, runId, process.pid);
  if (lock.run_id !== runId || startingState.state !== "starting") fail("identity_mismatch");

  let previewServer = null;
  let controlServer = null;
  let shutdownPromise = null;
  let fatalPromise = null;
  let heartbeatTimer = null;
  let usageProducerCompanion = null;
  let shuttingDown = false;
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      clearInterval(heartbeatTimer);
      await usageProducerCompanion?.stop();
      const current = await readRuntimeState(paths).catch(() => null);
      if (current?.run_id === runId && ["starting", "ready"].includes(current.state)) {
        await writeJsonAtomic(paths.state, transitionRuntimeState(current, "stop_requested"));
      }
      if (previewServer) await closePreviewGracefully(previewServer);
      await closeControlServer(controlServer);
      await removeOwnedRuntime(paths, runId);
    })();
    return shutdownPromise;
  };
  const recordFatalFailure = (error) => {
    if (fatalPromise) return fatalPromise;
    shuttingDown = true;
    fatalPromise = (async () => {
      clearInterval(heartbeatTimer);
      const failureClass = sanitizeRuntimeFailure(error, "runtime_worker_failed");
      const current = await readRuntimeState(paths).catch(() => null);
      if (current?.run_id === runId && current.state === "ready") {
        await writeJsonAtomic(
          paths.state,
          transitionRuntimeState(current, "runtime_failed", failureClass),
        ).catch(() => {});
      }
      if (previewServer) await closePreviewGracefully(previewServer).catch(() => {});
      await closeControlServer(controlServer).catch(() => {});
    })();
    return fatalPromise;
  };

  try {
    controlServer = await listenControl(async (requestValue) => {
      const current = await readRuntimeState(paths);
      const authorization = authorizeRuntimeControl(current, requestValue);
      if (!authorization.ok) return authorization;
      if (authorization.outcome === "stop") {
        setTimeout(
          () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1)),
          25,
        );
        return { ok: true, outcome: "stopping", run_id: runId };
      }
      if (authorization.outcome === "fault") {
        setTimeout(() => process.exit(73), 25);
        return { ok: true, outcome: "faulting", run_id: runId };
      }
      const healthy = authorization.outcome === "health"
        ? current.state === "ready" && await headLoopback()
        : null;
      return {
        ok: authorization.outcome === "status" ? current.state === "ready" : healthy,
        outcome: authorization.outcome === "status" ? current.state : healthy ? "ok" : "down",
        run_id: runId,
      };
    });
    const vite = await import("vite");
    previewServer = await vite.preview(createPreviewConfig());
    if (!(await headLoopback())) fail("health_failed");
    usageProducerCompanion = startUsageProducerCompanion({
      repoRoot: SOULFORGE_ROOT,
      stateRoot: workerEnv.SOULFORGE_AI_USAGE_METER_STATE_ROOT,
    });
    await writeJsonAtomic(paths.state, {
      ...transitionRuntimeState(startingState, "preview_ready"),
      build_sha256: await buildDigest(),
      heartbeat_at: new Date().toISOString(),
    });
    heartbeatTimer = setInterval(async () => {
      if (shuttingDown) return;
      const current = await readRuntimeState(paths).catch(() => null);
      if (!shuttingDown && current?.run_id === runId && current.state === "ready") {
        await writeJsonAtomic(
          paths.state,
          refreshRuntimeHeartbeat(current, new Date().toISOString()),
        ).catch(() => {});
      }
    }, HEARTBEAT_INTERVAL_MS);
    process.once("uncaughtException", (error) => {
      recordFatalFailure(error).then(() => process.exit(1)).catch(() => process.exit(1));
    });
    process.once("unhandledRejection", (reason) => {
      recordFatalFailure(reason).then(() => process.exit(1)).catch(() => process.exit(1));
    });
    process.once("SIGINT", () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));
    process.once("SIGTERM", () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));
  } catch (error) {
    shuttingDown = true;
    clearInterval(heartbeatTimer);
    const failureClass = sanitizeRuntimeFailure(error);
    await closePreviewGracefully(previewServer).catch(() => {});
    await closeControlServer(controlServer).catch(() => {});
    const current = await readRuntimeState(paths).catch(() => null);
    if (current?.run_id === runId && current.state === "starting") {
      await writeJsonAtomic(
        paths.state,
        transitionRuntimeState(current, "start_failed", failureClass),
      ).catch(() => {});
    }
    throw Object.assign(new Error(failureClass), { code: failureClass });
  }
}

async function runScheduledWorker(env = process.env) {
  let controllerStopRequested = false;
  process.on("message", (message) => {
    if (message?.schema_version === TEAM_OPS_BOARD_RUNTIME_SCHEMA
        && message.action === CONTROLLER_CHILD_STOP_ACTION) {
      controllerStopRequested = true;
    }
  });
  const localPaths = runtimePaths(env);
  await ensureNormalDirectory(localPaths.root);
  const desired = await readDesiredState(localPaths);
  if (desired?.desired_state !== "running" || controllerStopRequested) return;
  const environment = await deriveScheduledRuntimeEnvironment(env);
  if (controllerStopRequested) return;
  delete environment[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ];
  delete environment[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  for (const name of Object.keys(process.env)) delete process.env[name];
  for (const [name, value] of Object.entries(environment)) process.env[name] = value;
  validateRuntimeLaunchEnvironment(process.env);
  await buildDigest();
  if (controllerStopRequested) return;
  const paths = runtimePaths(process.env);
  await ensureNormalDirectory(paths.root);
  const existingState = await readRuntimeState(paths);
  const existingLock = await readRuntimeLock(paths);
  const ownership = classifyRuntimeOwnership(existingState, existingLock);
  const listenerState = await probeLoopbackListener();
  if (ownership === "owned" && existingState && !processAlive(existingState.pid)
      && listenerState === "absent") {
    const task = await invokeScheduledTask("inspect", process.env);
    await captureTerminationEvidence(paths, "restart_recovery", {
      task,
      desired,
      state: existingState,
      workerAliveAtCapture: false,
    });
    await removeOwnedRuntime(paths, existingState.run_id);
  } else if (ownership !== "stopped" || listenerState !== "absent") {
    fail("runtime_already_running");
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  let lockHandle;
  try {
    lockHandle = await open(paths.lock, "wx");
    await lockHandle.writeFile(`${JSON.stringify({
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      run_id: runId,
      pid: process.pid,
      started_at: startedAt,
    })}\n`, "utf8");
    await lockHandle.sync();
    await lockHandle.close();
    lockHandle = null;
    await writeJsonAtomic(paths.state, {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      run_id: runId,
      pid: process.pid,
      state: "starting",
      host: "loopback",
      port: TEAM_OPS_BOARD_RUNTIME_PORT,
      started_at: startedAt,
      heartbeat_at: null,
      build_sha256: null,
      failure_class: null,
    });
  } catch (error) {
    await lockHandle?.close().catch(() => {});
    await removeOwnedRuntime(paths, runId).catch(() => {});
    throw error;
  }
  if (controllerStopRequested) {
    await removeOwnedRuntime(paths, runId);
    return;
  }
  const quotaReadRequested = await receiveScheduledLaunchIntent(runId);
  if (controllerStopRequested) {
    await removeOwnedRuntime(paths, runId);
    return;
  }
  if (quotaReadRequested) {
    process.env[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ] = "1";
  }
  await runWorker(runId, process.env);
}

function waitForBoardChildExit(child) {
  return new Promise((resolve) => {
    const finish = (code, signal) => resolve({ code, signal });
    child.once("exit", finish);
    child.once("error", () => finish(null, "error"));
  });
}

export async function stopControllerOwnedChild(child, {
  state = null,
  requestOwnedStopFn = async () => false,
  exitPromise = waitForBoardChildExit(child),
  stopTimeoutMs = STOP_TIMEOUT_MS,
} = {}) {
  if (child.exitCode !== null || child.signalCode !== null) return "exited";
  if (state && processAlive(state.pid) && await requestOwnedStopFn()) return "owned_stop";

  if (child.connected) {
    try {
      child.send({
        schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
        action: CONTROLLER_CHILD_STOP_ACTION,
      });
    } catch {
      // The bounded fallback remains attributable to this exact child handle.
    }
  }
  if (await Promise.race([
    exitPromise.then(() => true),
    wait(stopTimeoutMs).then(() => false),
  ])) return "controller_stop";

  if (child.exitCode === null && child.signalCode === null && child.kill("SIGTERM")) {
    if (await Promise.race([
      exitPromise.then(() => true),
      wait(stopTimeoutMs).then(() => false),
    ])) return "owned_fallback";
  }
  fail("runtime_stop_ambiguous");
}

async function observeBoardChild(child, paths) {
  const exit = waitForBoardChildExit(child);
  while (child.exitCode === null && child.signalCode === null) {
    const outcome = await Promise.race([
      exit.then((value) => ({ kind: "exit", value })),
      wait(CHILD_HEALTH_POLL_MS).then(() => ({ kind: "poll" })),
    ]);
    if (outcome.kind === "exit") return { reason: "exit", ...outcome.value };

    const desired = await readDesiredState(paths);
    const state = await readRuntimeState(paths);
    if (desired?.desired_state !== "running") {
      await stopControllerOwnedChild(child, {
        state,
        requestOwnedStopFn: () => requestOwnedStop(paths, state),
        exitPromise: exit,
      });
      return { reason: "stop", ...(await exit) };
    }
    const startingState = classifyBoardChildStartingState(state);
    if (startingState === "hold") fail("runtime_state_ambiguous");
    if (startingState === "nonready"
        || state?.state === "error"
        || (state?.state === "ready"
          && (!runtimeHeartbeatIsFresh(state) || await probeLoopbackListener() !== "present"))) {
      const task = await invokeScheduledTask("inspect", process.env);
      await captureTerminationEvidence(paths, "restart_recovery", {
        task,
        desired,
        state,
        workerAliveAtCapture: processAlive(state.pid),
      });
      if (!(await requestOwnedStop(paths, state))) fail("runtime_stop_ambiguous");
      return { reason: "nonready", ...(await exit), receiptCaptured: true };
    }
  }
  return { reason: "exit", ...(await exit) };
}

async function waitForControllerStop(paths) {
  while ((await readDesiredState(paths))?.desired_state === "running") {
    await wait(CHILD_HEALTH_POLL_MS);
  }
}

async function runScheduledController(env = process.env, {
  restartLimit = TEAM_OPS_BOARD_CHILD_RESTART_LIMIT,
  restartBackoffMs = TEAM_OPS_BOARD_CHILD_RESTART_BACKOFF_MS,
} = {}) {
  const paths = runtimePaths(env);
  await ensureNormalDirectory(paths.root);
  if ((await readDesiredState(paths))?.desired_state !== "running") return;

  const childEnvironment = await deriveScheduledRuntimeEnvironment(env);
  delete childEnvironment[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ];
  delete childEnvironment[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  let restartCount = 0;

  while ((await readDesiredState(paths))?.desired_state === "running") {
    const child = fork(fileURLToPath(import.meta.url), ["__runtime_child"], {
      env: childEnvironment,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    });
    const outcome = await observeBoardChild(child, paths);
    const desired = await readDesiredState(paths);
    if (outcome.reason === "stop" || desired?.desired_state !== "running") return;

    const state = await readRuntimeState(paths);
    if (!outcome.receiptCaptured) {
      const task = await invokeScheduledTask("inspect", env);
      await captureTerminationEvidence(paths, "restart_recovery", {
        task,
        desired,
        state,
        workerAliveAtCapture: false,
      });
    }
    if (state) await removeOwnedRuntime(paths, state.run_id);

    const decision = decideBoardChildSupervisor({
      desiredState: desired?.desired_state,
      childExited: true,
      childReady: false,
      restartCount,
      restartLimit,
    });
    if (decision !== "restart") {
      await waitForControllerStop(paths);
      return;
    }
    restartCount += 1;
    await wait(restartBackoffMs);
  }
}

export function parseRuntimeCommand(argv) {
  if (argv.length !== 1 || !new Set([
    "task-register",
    "task-status",
    "task-run",
    "task-fault",
    "task-stop",
    "task-unregister",
    "status",
    "health",
    "stop",
    "recover",
    "--help",
  ]).has(argv[0])) {
    fail("control_unavailable");
  }
  return argv[0];
}

function help() {
  return "usage: node ops/team-ops-board-runtime.mjs <task-register|task-status|task-run|task-stop|task-fault|task-unregister|status|health|stop|recover>";
}

async function main() {
  if (process.argv[2] === "__scheduled_worker") {
    await runScheduledController();
    return;
  }
  if (process.argv[2] === "__runtime_child") {
    await runScheduledWorker();
    return;
  }
  const command = parseRuntimeCommand(process.argv.slice(2));
  if (command === "--help") {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const result = command === "task-register"
    ? await registerScheduledRuntime()
    : command === "task-status"
      ? await inspectScheduledRuntime()
      : command === "task-run"
        ? await runScheduledRuntime()
        : command === "task-stop"
          ? (await stopRuntime(), await inspectScheduledRuntime())
          : command === "task-fault"
            ? await faultRuntime()
          : command === "task-unregister"
            ? await unregisterScheduledRuntime()
            : command === "status"
      ? await inspectRuntime()
      : command === "health"
        ? await inspectRuntime(process.env, { health: true })
        : command === "stop"
          ? await stopRuntime()
          : await recoverRuntime();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      ok: false,
      state: "hold",
      outcome: sanitizeRuntimeFailure(error),
    })}\n`);
    process.exitCode = 1;
  });
}
