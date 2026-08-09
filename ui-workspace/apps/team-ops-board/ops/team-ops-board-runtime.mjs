#!/usr/bin/env node

import { spawn } from "node:child_process";
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const CONFIG_FILE = path.join(APP_ROOT, "vite.config.ts");
const DIST_INDEX = path.join(APP_ROOT, "dist", "index.html");
const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 15_000;
const CONTROL_TIMEOUT_MS = 3_000;
const MAX_RECORD_BYTES = 4096;
const SAFE_FAILURE_CLASSES = new Set([
  "allowed_host_unavailable",
  "build_unavailable",
  "control_unavailable",
  "health_failed",
  "identity_mismatch",
  "pilot_required",
  "port_unavailable",
  "runtime_already_running",
  "runtime_platform_unsupported",
  "runtime_start_ambiguous",
  "runtime_start_failed",
  "runtime_start_timeout",
  "runtime_state_ambiguous",
  "runtime_state_unsafe",
  "runtime_stop_ambiguous",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function sanitizeRuntimeFailure(error) {
  if (error?.code === "EADDRINUSE") return "port_unavailable";
  return SAFE_FAILURE_CLASSES.has(error?.code) ? error.code : "runtime_start_failed";
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
  const workerEnv = { ...env };
  const quotaReadEnabled = env?.[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ] === "1";
  delete workerEnv[TEAM_OPS_BOARD_RUNTIME_CLAUDE_QUOTA_READ];
  delete workerEnv[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ];
  if (quotaReadEnabled) workerEnv[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ] = "1";
  return workerEnv;
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
  let lockHandle;
  try {
    lockHandle = await open(paths.lock, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") fail("runtime_state_ambiguous");
    throw error;
  }

  let child;
  try {
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), "__worker", runId], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: createRuntimeWorkerEnvironment(env),
    });
    if (!Number.isSafeInteger(child.pid) || child.pid < 1) fail("runtime_start_failed");
    const starting = {
      schema_version: TEAM_OPS_BOARD_RUNTIME_SCHEMA,
      run_id: runId,
      pid: child.pid,
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
      pid: child.pid,
      started_at: startedAt,
    })}\n`, "utf8");
    await lockHandle.sync();
    await lockHandle.close();
    lockHandle = null;
    child.unref();
  } catch (error) {
    await lockHandle?.close().catch(() => {});
    await removeOwnedRuntime(paths, runId).catch(() => {});
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
    await removeOwnedRecord(paths.lock, runId).catch(() => {});
    throw Object.assign(new Error(failureClass), { code: failureClass });
  }
}

export function parseRuntimeCommand(argv) {
  if (argv.length !== 1 || !new Set(["start", "status", "health", "stop", "--help"]).has(argv[0])) {
    fail("control_unavailable");
  }
  return argv[0];
}

function help() {
  return "usage: node ops/team-ops-board-runtime.mjs <start|status|health|stop>";
}

async function main() {
  if (process.argv[2] === "__worker") {
    await runWorker(process.argv[3]);
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
        : await stopRuntime();
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
