#!/usr/bin/env node

import { execFile } from "node:child_process";
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

export const TEAM_OPS_BOARD_RUNTIME_SCHEMA = "soulforge.team_ops_board.runtime.v1";
export const TEAM_OPS_BOARD_RUNTIME_HOST = "127.0.0.1";
export const TEAM_OPS_BOARD_RUNTIME_PORT = 4192;
export const TEAM_OPS_BOARD_RUNTIME_PIPE = String.raw`\\.\pipe\soulforge-team-ops-board-runtime-v1`;
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const CONFIG_FILE = path.join(APP_ROOT, "vite.config.ts");
const DIST_INDEX = path.join(APP_ROOT, "dist", "index.html");
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 15_000;
const CONTROL_TIMEOUT_MS = 3_000;
const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_BYTES = 256 * 1024;
const MAX_RECORD_BYTES = 4096;
const execFileAsync = promisify(execFile);
const SAFE_FAILURE_CLASSES = new Set([
  "allowed_host_unavailable",
  "bootstrap_invalid",
  "bootstrap_timeout",
  "bootstrap_unavailable",
  "build_unavailable",
  "control_unavailable",
  "health_failed",
  "identity_mismatch",
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
  "runtime_worker_failed",
  "worker_create_failed",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function sanitizeRuntimeFailure(error, fallback = "runtime_start_failed") {
  if (error?.code === "EADDRINUSE") return "port_unavailable";
  return SAFE_FAILURE_CLASSES.has(error?.code) ? error.code : fallback;
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
  const quotaReadEnabled = env?.[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ] === "1";
  if (quotaReadEnabled) workerEnv[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ] = "1";
  return workerEnv;
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

export function createRuntimeBootstrapPipe(runId) {
  if (typeof runId !== "string" || !/^[a-f0-9-]{36}$/u.test(runId)) {
    fail("bootstrap_invalid");
  }
  return String.raw`\\.\pipe\soulforge-team-ops-board-bootstrap-${runId}`;
}

export function createWmiWorkerCreationSpec({
  runId,
  bootstrapPipe,
  nodePath = process.execPath,
  modulePath = fileURLToPath(import.meta.url),
  systemRoot = process.env.SystemRoot || process.env.WINDIR,
} = {}) {
  if (process.platform !== "win32" && systemRoot === undefined) {
    fail("runtime_platform_unsupported");
  }
  if (typeof systemRoot !== "string" || systemRoot.trim() === "") {
    fail("worker_create_failed");
  }
  if (bootstrapPipe !== createRuntimeBootstrapPipe(runId)) fail("bootstrap_invalid");
  const commandLine = [nodePath, modulePath, "__worker_bootstrap", runId, bootstrapPipe]
    .map(quoteWindowsCommandArgument)
    .join(" ");
  const safeCommandLine = powershellSingleQuoted(commandLine);
  const script = [
    "$ErrorActionPreference='Stop'",
    `$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${safeCommandLine}}`,
    "if(([int]$r.ReturnValue)-ne 0 -or ([int]$r.ProcessId)-lt 1){exit 23}",
    "$o=[pscustomobject]@{return_value=0;pid=[int]$r.ProcessId}",
    "[Console]::Out.Write(($o|ConvertTo-Json -Compress))",
  ].join(";");
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
      Buffer.from(script, "utf16le").toString("base64"),
    ],
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
  if (!new Set(["status", "health", "stop"]).has(requestValue?.action)) {
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

export function runtimeHealthIsReady(state, control, loopbackHeadOk) {
  return state?.state === "ready"
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

export function createPublicRuntimeState(state, overrides = {}) {
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
  result.ok = state ? state.state === "ready" : (overrides.ok ?? true);
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

function validateBootstrapEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("bootstrap_invalid");
  const entries = Object.entries(value);
  if (entries.length > 1024) fail("bootstrap_invalid");
  for (const [name, entryValue] of entries) {
    if (name.length < 1 || name.length > 512 || /[\u0000\r\n=]/u.test(name)
        || typeof entryValue !== "string" || entryValue.includes("\u0000")) {
      fail("bootstrap_invalid");
    }
  }
  return Object.fromEntries(entries);
}

export function createRuntimeBootstrapEnvelope(runId, workerEnvironment) {
  createRuntimeBootstrapPipe(runId);
  return {
    schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
    run_id: runId,
    environment: validateBootstrapEnvironment(workerEnvironment),
  };
}

async function listenBootstrap(runId, bootstrapPipe, workerEnvironment) {
  const payload = `${JSON.stringify(createRuntimeBootstrapEnvelope(runId, workerEnvironment))}\n`;
  if (Buffer.byteLength(payload) > MAX_BOOTSTRAP_BYTES) fail("bootstrap_invalid");

  const sockets = new Set();
  let claimedPid = null;
  let expectedPid = null;
  let claimedSocket = null;
  let claimedPhase = null;
  let settle;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    settle = resolve;
    rejectCompletion = reject;
  });
  const completionTimer = setTimeout(
    () => rejectCompletion(Object.assign(new Error("bootstrap_timeout"), { code: "bootstrap_timeout" })),
    BOOTSTRAP_TIMEOUT_MS,
  );
  completion.finally(() => clearTimeout(completionTimer)).catch(() => {});
  const sendEnvironmentIfAttested = () => {
    if (!claimedSocket || expectedPid === null || claimedPhase !== "await_pid") return;
    if (claimedPid !== expectedPid) {
      claimedSocket.destroy();
      rejectCompletion(Object.assign(new Error("bootstrap_invalid"), { code: "bootstrap_invalid" }));
      return;
    }
    claimedPhase = "ack";
    claimedSocket.write(payload);
  };

  const server = createServer((socket) => {
    let bytes = "";
    let phase = "hello";
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(BOOTSTRAP_TIMEOUT_MS, () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.on("data", (chunk) => {
      bytes += chunk;
      if (Buffer.byteLength(bytes) > MAX_BOOTSTRAP_BYTES) {
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = bytes.indexOf("\n")) >= 0) {
        const line = bytes.slice(0, newline);
        bytes = bytes.slice(newline + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          socket.destroy();
          return;
        }
        if (phase === "hello") {
          if (claimedPid !== null
              || message?.action !== "bootstrap"
              || message?.run_id !== runId
              || !Number.isSafeInteger(message?.pid)
              || message.pid < 1) {
            socket.destroy();
            return;
          }
          claimedPid = message.pid;
          claimedSocket = socket;
          claimedPhase = "await_pid";
          phase = "await_pid";
          sendEnvironmentIfAttested();
          continue;
        }
        if (phase !== "await_pid" || claimedPhase !== "ack"
            || message?.action !== "ack"
            || message?.run_id !== runId
            || message?.pid !== claimedPid) {
          socket.destroy();
          return;
        }
        settle({ pid: claimedPid });
        socket.end();
        return;
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(bootstrapPipe, resolve);
  });
  return {
    server,
    sockets,
    completion,
    setExpectedPid(pid) {
      if (expectedPid !== null || !Number.isSafeInteger(pid) || pid < 1) {
        fail("bootstrap_invalid");
      }
      expectedPid = pid;
      sendEnvironmentIfAttested();
    },
  };
}

async function closeBootstrap(owner) {
  if (!owner) return;
  for (const socket of owner.sockets) socket.destroy();
  await new Promise((resolve) => owner.server.close(() => resolve()));
}

async function receiveBootstrapEnvironment(runId, bootstrapPipe) {
  if (bootstrapPipe !== createRuntimeBootstrapPipe(runId)) fail("bootstrap_invalid");
  return new Promise((resolve, reject) => {
    const socket = createConnection(bootstrapPipe);
    let bytes = "";
    const timer = setTimeout(
      () => socket.destroy(Object.assign(new Error("bootstrap_timeout"), { code: "bootstrap_timeout" })),
      BOOTSTRAP_TIMEOUT_MS,
    );
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify({
      action: "bootstrap",
      run_id: runId,
      pid: process.pid,
    })}\n`));
    socket.on("data", (chunk) => {
      bytes += chunk;
      if (Buffer.byteLength(bytes) > MAX_BOOTSTRAP_BYTES) {
        socket.destroy(Object.assign(new Error("bootstrap_invalid"), { code: "bootstrap_invalid" }));
        return;
      }
      const newline = bytes.indexOf("\n");
      if (newline < 0) return;
      let message;
      try {
        message = JSON.parse(bytes.slice(0, newline));
      } catch {
        socket.destroy(Object.assign(new Error("bootstrap_invalid"), { code: "bootstrap_invalid" }));
        return;
      }
      if (message?.schema_version !== TEAM_OPS_BOARD_RUNTIME_SCHEMA
          || message?.run_id !== runId) {
        socket.destroy(Object.assign(new Error("bootstrap_invalid"), { code: "bootstrap_invalid" }));
        return;
      }
      let environment;
      try {
        environment = validateBootstrapEnvironment(message.environment);
      } catch (error) {
        socket.destroy(error);
        return;
      }
      socket.write(`${JSON.stringify({ action: "ack", run_id: runId, pid: process.pid })}\n`);
      clearTimeout(timer);
      socket.end();
      resolve(environment);
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(Object.assign(error, { code: sanitizeRuntimeFailure(error, "bootstrap_unavailable") }));
    });
  });
}

async function createIndependentWorker(runId, bootstrapPipe, env = process.env) {
  const spec = createWmiWorkerCreationSpec({
    runId,
    bootstrapPipe,
    systemRoot: env.SystemRoot || env.WINDIR,
  });
  const helperEnvironment = {};
  for (const name of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (typeof env[name] === "string") helperEnvironment[name] = env[name];
  }
  let stdout;
  try {
    ({ stdout } = await execFileAsync(spec.file, spec.args, {
      encoding: "utf8",
      env: helperEnvironment,
      maxBuffer: MAX_RECORD_BYTES,
      timeout: BOOTSTRAP_TIMEOUT_MS,
      windowsHide: true,
    }));
  } catch {
    fail("worker_create_failed");
  }
  let result;
  try {
    result = JSON.parse(String(stdout));
  } catch {
    fail("worker_create_failed");
  }
  if (result?.return_value !== 0 || !Number.isSafeInteger(result?.pid) || result.pid < 1) {
    fail("worker_create_failed");
  }
  return result.pid;
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

async function startRuntime(env = process.env) {
  if (process.platform !== "win32") fail("runtime_platform_unsupported");
  validateRuntimeLaunchEnvironment(env);
  await buildDigest();
  const paths = runtimePaths(env);
  await ensureNormalDirectory(paths.root);

  const existingState = await readRuntimeState(paths);
  const existingLock = await readRuntimeLock(paths);
  const existingOwnership = classifyRuntimeOwnership(existingState, existingLock);
  if (existingOwnership !== "stopped") {
    if (existingOwnership === "owned" && processAlive(existingState.pid)) {
      const response = await sendControl({ action: "status", run_id: existingState.run_id }).catch(() => null);
      if (response?.run_id === existingState.run_id) {
        fail("runtime_already_running");
      }
    }
    fail("runtime_state_ambiguous");
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const bootstrapPipe = createRuntimeBootstrapPipe(runId);
  let lockHandle;
  try {
    lockHandle = await open(paths.lock, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") fail("runtime_state_ambiguous");
    throw error;
  }

  let bootstrapOwner = null;
  let createdPid = null;
  try {
    bootstrapOwner = await listenBootstrap(
      runId,
      bootstrapPipe,
      createRuntimeWorkerEnvironment(env),
    );
    createdPid = await createIndependentWorker(runId, bootstrapPipe, env);
    bootstrapOwner.setExpectedPid(createdPid);
    const starting = {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      run_id: runId,
      pid: createdPid,
      state: "starting",
      host: "loopback",
      port: TEAM_OPS_BOARD_RUNTIME_PORT,
      started_at: startedAt,
      build_sha256: null,
      failure_class: null,
    };
    await writeJsonAtomic(paths.state, starting);
    await lockHandle.writeFile(`${JSON.stringify({
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      run_id: runId,
      pid: createdPid,
      started_at: startedAt,
    })}\n`, "utf8");
    await lockHandle.sync();
    await lockHandle.close();
    lockHandle = null;
    const bootstrapResult = await bootstrapOwner.completion;
    if (bootstrapResult.pid !== createdPid) fail("bootstrap_invalid");
    await closeBootstrap(bootstrapOwner);
    bootstrapOwner = null;
  } catch (error) {
    await closeBootstrap(bootstrapOwner).catch(() => {});
    await lockHandle?.close().catch(() => {});
    if (createdPid) {
      const exitDeadline = Date.now() + BOOTSTRAP_TIMEOUT_MS + 2_000;
      while (processAlive(createdPid) && Date.now() < exitDeadline) await wait(25);
      if (processAlive(createdPid)) fail("runtime_start_ambiguous");
    }
    await removeOwnedRuntime(paths, runId).catch(() => {});
    await rm(paths.lock, { force: true }).catch(() => {});
    throw error;
  }

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await readRuntimeState(paths);
    if (state?.run_id !== runId) fail("runtime_state_ambiguous");
    if (state.state === "error") {
      const exitDeadline = Date.now() + 2_000;
      while (processAlive(state.pid) && Date.now() < exitDeadline) await wait(25);
      if (processAlive(state.pid)) fail("runtime_start_ambiguous");
      await removeOwnedRuntime(paths, runId);
      fail(state.failure_class ?? "runtime_start_failed");
    }
    if (state.state === "ready") {
      const control = await sendControl({ action: "health", run_id: runId }).catch(() => null);
      const healthy = runtimeHealthIsReady(state, control, await headLoopback());
      if (healthy) return createPublicRuntimeState(state, { health: "ok" });
    }
    if (!processAlive(state.pid)) {
      await removeOwnedRuntime(paths, runId);
      fail("runtime_start_failed");
    }
    await wait(100);
  }
  const timedOutState = await readRuntimeState(paths);
  if (!timedOutState || timedOutState.run_id !== runId) fail("runtime_start_ambiguous");
  if (await requestOwnedStop(paths, timedOutState)) fail("runtime_start_timeout");
  fail("runtime_start_ambiguous");
}

async function inspectRuntime(env = process.env, { health = false } = {}) {
  const paths = runtimePaths(env);
  if (!(await normalDirectoryIfPresent(paths.root))) return createPublicRuntimeState(null, { ok: true });
  const state = await readRuntimeState(paths);
  const lock = await readRuntimeLock(paths);
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "stopped") return createPublicRuntimeState(null, { ok: true });
  if (ownership !== "owned") fail("runtime_state_ambiguous");
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
  const ownership = classifyRuntimeOwnership(state, lock);
  if (ownership === "stopped") return createPublicRuntimeState(null, { ok: true });
  if (ownership !== "owned") fail("runtime_state_ambiguous");
  if (!(await requestOwnedStop(paths, state))) fail("runtime_stop_ambiguous");
  return createPublicRuntimeState(null, { ok: true, outcome: "stopped" });
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
  await removeOwnedRuntime(paths, state.run_id);
  if (await readJsonRecord(paths.state) || await readJsonRecord(paths.lock)) {
    fail("runtime_recovery_unsafe");
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
  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
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
    fatalPromise = (async () => {
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
    await writeJsonAtomic(paths.state, {
      ...transitionRuntimeState(startingState, "preview_ready"),
      build_sha256: await buildDigest(),
    });
    process.once("uncaughtException", (error) => {
      recordFatalFailure(error).then(() => process.exit(1)).catch(() => process.exit(1));
    });
    process.once("unhandledRejection", (reason) => {
      recordFatalFailure(reason).then(() => process.exit(1)).catch(() => process.exit(1));
    });
    process.once("SIGINT", () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));
    process.once("SIGTERM", () => shutdown().then(() => process.exit(0)).catch(() => process.exit(1)));
  } catch (error) {
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

async function runBootstrapWorker(runId, bootstrapPipe) {
  const environment = await receiveBootstrapEnvironment(runId, bootstrapPipe);
  for (const name of Object.keys(process.env)) delete process.env[name];
  for (const [name, value] of Object.entries(environment)) process.env[name] = value;
  await runWorker(runId, process.env);
}

export function parseRuntimeCommand(argv) {
  if (argv.length !== 1 || !new Set(["start", "status", "health", "stop", "recover", "--help"]).has(argv[0])) {
    fail("control_unavailable");
  }
  return argv[0];
}

function help() {
  return "usage: node ops/team-ops-board-runtime.mjs <start|status|health|stop|recover>";
}

async function main() {
  if (process.argv[2] === "__worker_bootstrap") {
    await runBootstrapWorker(process.argv[3], process.argv[4]);
    return;
  }
  const command = parseRuntimeCommand(process.argv.slice(2));
  if (command === "--help") {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const result = command === "start"
    ? await startRuntime()
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
