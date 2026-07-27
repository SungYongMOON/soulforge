import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runDailyAutomation } from "./automation.mjs";
import { BackupControllerError } from "./controller.mjs";

const execFileAsync = promisify(execFile);
const QUIESCE_SCHEMA_VERSION = "soulforge.backup_controller.writer_quiesce.v1";
const QUIESCE_STATE_SCHEMA_VERSION = "soulforge.backup_controller.writer_quiesce_state.v1";
const SAFE_TASK_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const SAFE_TASK_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RESTORE_MODES = new Set(["ensure_running", "run_once_after_backup", "restore_previous"]);

function fail(code) {
  throw new BackupControllerError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function requireSafeAbsolutePath(value, code) {
  if (typeof value !== "string" || !path.win32.isAbsolute(value)) fail(code);
  const resolved = path.win32.resolve(value);
  if (/(?:^|[\\/])(?:\.env(?:\..*)?|secrets?|credentials?|tokens?|cookies?|auth)(?:[\\/]|$)/i.test(resolved)) {
    fail("secret_like_path_rejected");
  }
  return resolved;
}

function validateMarkers(value, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) fail(code);
  const unique = new Set();
  for (const marker of value) {
    if (typeof marker !== "string" || marker.length < 8 || marker.length > 260 || /[\r\n]/.test(marker)) fail(code);
    const normalized = marker.toLowerCase();
    if (unique.has(normalized)) fail(code);
    unique.add(normalized);
  }
  return value;
}

export function validateWriterQuiesceConfig(value) {
  exactKeys(value, ["schema_version", "controller_id", "state_ref", "stop_timeout_seconds", "tasks"], "writer_quiesce_shape_invalid");
  if (value.schema_version !== QUIESCE_SCHEMA_VERSION || value.controller_id !== "soulforge-backup-controller") {
    fail("writer_quiesce_schema_invalid");
  }
  value.state_ref = requireSafeAbsolutePath(value.state_ref, "writer_quiesce_state_ref_invalid");
  if (!Number.isInteger(value.stop_timeout_seconds) || value.stop_timeout_seconds < 5 || value.stop_timeout_seconds > 900) {
    fail("writer_quiesce_timeout_invalid");
  }
  if (!Array.isArray(value.tasks) || value.tasks.length < 1 || value.tasks.length > 8) fail("writer_quiesce_tasks_invalid");
  const ids = new Set();
  const names = new Set();
  for (const task of value.tasks) {
    exactKeys(task, ["task_id", "task_name", "action_markers", "process_markers", "quiesce_mode", "pause_ref", "restore_mode"], "writer_quiesce_task_shape_invalid");
    if (typeof task.task_id !== "string" || !SAFE_TASK_ID.test(task.task_id) || ids.has(task.task_id)) {
      fail("writer_quiesce_task_id_invalid");
    }
    const normalizedName = typeof task.task_name === "string" ? task.task_name.toLowerCase() : "";
    if (!SAFE_TASK_NAME.test(task.task_name ?? "") || names.has(normalizedName)) fail("writer_quiesce_task_name_invalid");
    if (!RESTORE_MODES.has(task.restore_mode)) fail("writer_quiesce_restore_mode_invalid");
    if (!["cooperative_pause", "wait_for_idle"].includes(task.quiesce_mode)) fail("writer_quiesce_mode_invalid");
    if (task.quiesce_mode === "cooperative_pause") {
      task.pause_ref = requireSafeAbsolutePath(task.pause_ref, "writer_quiesce_pause_ref_invalid");
    } else if (task.pause_ref !== null) {
      fail("writer_quiesce_pause_ref_invalid");
    }
    validateMarkers(task.action_markers, "writer_quiesce_action_markers_invalid");
    validateMarkers(task.process_markers, "writer_quiesce_process_markers_invalid");
    ids.add(task.task_id);
    names.add(normalizedName);
  }
  return value;
}

function encodeMarkers(markers) {
  return Buffer.from(JSON.stringify(markers), "utf8").toString("base64");
}

function parseBridgeOutput(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) fail("writer_task_bridge_output_invalid");
  try {
    const value = JSON.parse(lines.at(-1));
    if (!isRecord(value) || value.ok !== true) fail(value?.error_code ?? "writer_task_bridge_failed");
    return value;
  } catch (error) {
    if (error instanceof BackupControllerError) throw error;
    fail("writer_task_bridge_output_invalid");
  }
}

export function createWindowsTaskAdapter({
  bridgeRef = path.join(path.dirname(fileURLToPath(import.meta.url)), "windows_task_bridge.ps1"),
  execFileImpl = execFileAsync,
} = {}) {
  async function invoke(operation, task, timeoutSeconds) {
    const args = [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", bridgeRef,
      "-Operation", operation,
      "-TaskName", task.task_name,
      "-ActionMarkersBase64", encodeMarkers(task.action_markers),
      "-ProcessMarkersBase64", encodeMarkers(task.process_markers),
      "-QuiesceMode", task.quiesce_mode,
      "-PauseRef", task.pause_ref ?? "",
      "-TimeoutSeconds", String(timeoutSeconds),
    ];
    try {
      const { stdout } = await execFileImpl("powershell.exe", args, { windowsHide: true, maxBuffer: 1024 * 1024 });
      return parseBridgeOutput(stdout);
    } catch (error) {
      if (error instanceof BackupControllerError) throw error;
      if (typeof error?.stdout === "string" && error.stdout.trim()) return parseBridgeOutput(error.stdout);
      fail("writer_task_bridge_failed");
    }
  }
  return {
    inspect: (task) => invoke("inspect", task, 30),
    quiesce: (task, timeoutSeconds) => invoke("quiesce", task, timeoutSeconds),
    enable: (task) => invoke("enable", task, 30),
    disable: (task) => invoke("disable", task, 30),
    start: (task) => invoke("start", task, 30),
  };
}

async function writeJsonAtomic(ref, value) {
  await mkdir(path.dirname(ref), { recursive: true });
  const tempRef = `${ref}.${process.pid}.tmp`;
  await writeFile(tempRef, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tempRef, ref);
}

async function readOptionalJson(ref) {
  try {
    return JSON.parse(await readFile(ref, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("writer_quiesce_state_invalid");
  }
}

function validateSavedState(value, config, configSha256) {
  exactKeys(value, ["schema_version", "controller_id", "config_sha256", "phase", "started_at", "tasks"], "writer_quiesce_state_invalid");
  if (
    value.schema_version !== QUIESCE_STATE_SCHEMA_VERSION ||
    value.controller_id !== config.controller_id ||
    value.config_sha256 !== configSha256 ||
    !["preparing", "quiesced", "restoring"].includes(value.phase) ||
    typeof value.started_at !== "string" ||
    Number.isNaN(Date.parse(value.started_at)) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length !== config.tasks.length
  ) {
    fail("writer_quiesce_state_invalid");
  }
  for (let index = 0; index < value.tasks.length; index += 1) {
    const saved = value.tasks[index];
    const expected = config.tasks[index];
    exactKeys(saved, ["task_id", "task_name", "was_enabled", "was_running"], "writer_quiesce_state_invalid");
    if (
      saved.task_id !== expected.task_id ||
      saved.task_name !== expected.task_name ||
      typeof saved.was_enabled !== "boolean" ||
      typeof saved.was_running !== "boolean"
    ) {
      fail("writer_quiesce_state_invalid");
    }
  }
  return value;
}

async function restoreTasks({ config, configSha256, savedState, adapter, restoreConfirmDelayMs }) {
  await writeJsonAtomic(config.state_ref, { ...savedState, phase: "restoring" });
  const restoreResults = [];
  for (let index = config.tasks.length - 1; index >= 0; index -= 1) {
    const task = config.tasks[index];
    const previous = savedState.tasks[index];
    if (previous.was_enabled) await adapter.enable(task);
    else await adapter.disable(task);
    const shouldStart =
      previous.was_enabled &&
      (task.restore_mode === "ensure_running" ||
        task.restore_mode === "run_once_after_backup" ||
        (task.restore_mode === "restore_previous" && previous.was_running));
    if (shouldStart) await adapter.start(task);
    if (shouldStart && task.restore_mode === "ensure_running") {
      await new Promise((resolve) => setTimeout(resolve, restoreConfirmDelayMs));
      const restored = await adapter.inspect(task);
      if (restored.state !== "Running" && Number(restored.matching_process_count) < 1) {
        fail("writer_task_restart_unconfirmed");
      }
    }
    restoreResults.unshift({ task_id: task.task_id, enabled_restored: previous.was_enabled, start_dispatched: shouldStart });
  }
  await unlink(config.state_ref);
  return restoreResults;
}

export async function runQuiescedDailyAutomation({
  activationSidecarRef,
  quiesceSidecarRef,
  expectedQuiesceSha256,
  now = new Date(),
  taskAdapter,
  runAutomationImpl = runDailyAutomation,
  restoreConfirmDelayMs = 5000,
} = {}) {
  const configRef = requireSafeAbsolutePath(quiesceSidecarRef, "writer_quiesce_ref_invalid");
  if (typeof expectedQuiesceSha256 !== "string" || !SHA256.test(expectedQuiesceSha256)) fail("writer_quiesce_sha256_invalid");
  const configBytes = await readFile(configRef);
  const configSha256 = createHash("sha256").update(configBytes).digest("hex");
  if (configSha256 !== expectedQuiesceSha256) fail("writer_quiesce_sha256_mismatch");
  const config = validateWriterQuiesceConfig(JSON.parse(configBytes.toString("utf8")));
  const adapter = taskAdapter ?? createWindowsTaskAdapter();

  const staleState = await readOptionalJson(config.state_ref);
  let recoveredPreviousState = false;
  if (staleState) {
    await restoreTasks({
      config,
      configSha256,
      savedState: validateSavedState(staleState, config, configSha256),
      adapter,
      restoreConfirmDelayMs,
    });
    recoveredPreviousState = true;
  }

  const observed = [];
  for (const task of config.tasks) {
    const state = await adapter.inspect(task);
    observed.push({
      task_id: task.task_id,
      task_name: task.task_name,
      was_enabled: state.enabled === true,
      was_running: state.state === "Running" || Number(state.matching_process_count) > 0,
    });
  }
  const savedState = {
    schema_version: QUIESCE_STATE_SCHEMA_VERSION,
    controller_id: config.controller_id,
    config_sha256: configSha256,
    phase: "preparing",
    started_at: now.toISOString(),
    tasks: observed,
  };
  await writeJsonAtomic(config.state_ref, savedState);

  let automationResult;
  let automationError;
  let restoreResults;
  try {
    for (const task of config.tasks) await adapter.quiesce(task, config.stop_timeout_seconds);
    await writeJsonAtomic(config.state_ref, { ...savedState, phase: "quiesced" });
    automationResult = await runAutomationImpl({ activationSidecarRef, now });
  } catch (error) {
    automationError = error;
  } finally {
    try {
      restoreResults = await restoreTasks({ config, configSha256, savedState, adapter, restoreConfirmDelayMs });
    } catch {
      fail("writer_restore_failed");
    }
  }
  if (automationError) throw automationError;
  return {
    schema_version: "soulforge.backup_controller.quiesced_automation_result.v1",
    operation: "quiesced_daily_automation",
    status: automationResult.status,
    recovered_previous_state: recoveredPreviousState,
    writer_quiesce_performed: true,
    writer_restore_performed: true,
    task_results: restoreResults,
    automation: automationResult,
  };
}
