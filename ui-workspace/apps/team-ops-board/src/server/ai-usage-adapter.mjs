import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA,
  validateBoardUsageHistorySnapshot
} from "../../../../../guild_hall/ai_usage_meter/board_history_snapshot.mjs";

import {
  defaultThreadEnrollmentRegistryPath,
  isLiveThreadEnrollmentDisabled,
  readThreadEnrollmentRegistry
} from "../core/live-thread-enrollment.mjs";
import { AI_USAGE_PROJECTION_ENVELOPE_SCHEMA } from "../core/ai-usage-history-snapshot.mjs";
import { defaultCodexSessionsRoot } from "./live-thread-lifecycle-reconcile.mjs";

export const AI_USAGE_SNAPSHOT_PATH = "/ai-usage-meter.snapshot.json";
export const DEFAULT_AI_USAGE_REFRESH_DEBOUNCE_MS = 15_000;
export const DEFAULT_AI_USAGE_INITIAL_TIMEOUT_MS = 30_000;

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const METER_CLI_PATH = resolve(MODULE_ROOT, "../../../../../guild_hall/ai_usage_meter/cli.mjs");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const MAX_EXACT_THREAD_IDS = 100;
const MAX_DEBOUNCE_MS = 60_000;
const MAX_TIMEOUT_MS = 30_000;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function nonNegativeInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function safeNow(value) {
  const candidate = typeof value === "function" ? value() : value;
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

function exactThreadIds(threadIds) {
  if (!Array.isArray(threadIds)) return [];
  const ids = new Set();
  for (const threadId of threadIds) {
    if (typeof threadId !== "string" || !SAFE_ID.test(threadId)) return [];
    ids.add(threadId);
  }
  return [...ids].sort((left, right) => left.localeCompare(right, "en"));
}

function scopeArguments(threadIds) {
  return threadIds.flatMap((threadId) => ["--thread-id", threadId]);
}

function outputPath(args) {
  const index = args.indexOf("--output");
  return index >= 0 && typeof args[index + 1] === "string" ? args[index + 1] : null;
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function unavailableProjection(refreshState = "hold") {
  return {
    schema_version: AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: refreshState,
    snapshot: null
  };
}

function snapshotProjection(snapshot, refreshState) {
  return {
    schema_version: AI_USAGE_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: refreshState,
    snapshot
  };
}

export function defaultAiUsageSnapshotPaths(stateRoot) {
  const root = resolve(stateRoot);
  return {
    currentPath: join(root, "board", "current.snapshot.json"),
    historyPath: join(root, "board", "history.snapshot.json")
  };
}

// CLI output is deliberately discarded. Only the Meter's strict, local history
// snapshot is read back and validated for the loopback endpoint.
export function runMeterCliCommand({ args, timeoutMs, cwd, spawnImpl = spawn } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timer = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      callback(value);
    };
    let child;
    try {
      child = spawnImpl(process.execPath, [METER_CLI_PATH, ...args], {
        cwd,
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"]
      });
    } catch {
      rejectPromise(new Error("meter_command_spawn_failed"));
      return;
    }
    child.once("error", () => finish(rejectPromise, new Error("meter_command_spawn_failed")));
    child.once("exit", (code) => {
      if (code === 0) finish(resolvePromise);
      else finish(rejectPromise, new Error("meter_command_failed"));
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(rejectPromise, new Error("meter_command_timeout"));
    }, timeoutMs);
  });
}

export async function refreshExactScopedUsage({
  stateRoot,
  sessionsRoot,
  threadIds,
  currentPath = defaultAiUsageSnapshotPaths(stateRoot).currentPath,
  historyPath = defaultAiUsageSnapshotPaths(stateRoot).historyPath,
  commandTimeoutMs = DEFAULT_AI_USAGE_INITIAL_TIMEOUT_MS,
  cwd = process.cwd(),
  runCommand = runMeterCliCommand
} = {}) {
  const exactIds = exactThreadIds(threadIds);
  if (!stateRoot || !sessionsRoot || !exactIds.length || exactIds.length > MAX_EXACT_THREAD_IDS) {
    throw new Error("ai_usage_exact_scope_invalid");
  }
  const scope = scopeArguments(exactIds);
  const common = { timeoutMs: commandTimeoutMs, cwd };
  await runCommand({
    ...common,
    args: ["collect", "--apply", "--state-root", resolve(stateRoot), "--sessions-root", resolve(sessionsRoot), ...scope]
  });
  await runCommand({
    ...common,
    args: ["lifecycle-reconcile", "--apply", "--state-root", resolve(stateRoot), "--sessions-root", resolve(sessionsRoot), "--max-sessions", String(MAX_EXACT_THREAD_IDS), ...scope]
  });
  await runCommand({
    ...common,
    args: ["board-snapshot", "--state-root", resolve(stateRoot), "--output", resolve(currentPath), ...scope]
  });
  await runCommand({
    ...common,
    args: ["board-history-snapshot", "--state-root", resolve(stateRoot), "--output", resolve(historyPath), ...scope]
  });
  const snapshot = validateBoardUsageHistorySnapshot(JSON.parse(await readFile(historyPath, "utf8")));
  if (snapshot.schema_version !== BOARD_USAGE_HISTORY_SNAPSHOT_SCHEMA) throw new Error("ai_usage_history_schema_invalid");
  return snapshot;
}

export function createAiUsageAdapter({
  registryPath = process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || defaultThreadEnrollmentRegistryPath(),
  env = process.env,
  usageMeterStateRoot = process.env.SOULFORGE_AI_USAGE_METER_STATE_ROOT || resolve(dirname(registryPath), "..", "ai_usage_meter"),
  usageSessionsRoot = defaultCodexSessionsRoot({ env }),
  autoRefresh = !["0", "false", "no", "off"].includes(String(env?.TEAM_OPS_BOARD_AUTO_USAGE_REFRESH ?? "").trim().toLowerCase()),
  refreshUsage = refreshExactScopedUsage,
  now = Date.now,
  cwd = process.cwd(),
  limits: limitOverrides = {}
} = {}) {
  const debounceMs = nonNegativeInteger(
    limitOverrides.debounceMs,
    DEFAULT_AI_USAGE_REFRESH_DEBOUNCE_MS,
    MAX_DEBOUNCE_MS
  );
  const initialTimeoutMs = positiveInteger(
    limitOverrides.initialTimeoutMs,
    DEFAULT_AI_USAGE_INITIAL_TIMEOUT_MS,
    MAX_TIMEOUT_MS
  );
  const commandTimeoutMs = positiveInteger(
    limitOverrides.commandTimeoutMs,
    DEFAULT_AI_USAGE_INITIAL_TIMEOUT_MS,
    MAX_TIMEOUT_MS
  );
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;
  let lastFailure = false;

  async function enrolledScope() {
    const enrollment = await readThreadEnrollmentRegistry(registryPath);
    if (!enrollment.registry || enrollment.status !== "available" || isLiveThreadEnrollmentDisabled({ registry: enrollment.registry, env })) {
      return null;
    }
    const ids = exactThreadIds(enrollment.registry.entries
      .filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
      .map((entry) => entry.thread_id));
    return ids.length > 0 && ids.length <= MAX_EXACT_THREAD_IDS ? ids : null;
  }

  function begin(scope) {
    if (inFlight !== null) return inFlight;
    lastAttemptAt = safeNow(now);
    const scopeKey = scope.join("\u0000");
    let operation;
    operation = Promise.resolve().then(() => refreshUsage({
      stateRoot: usageMeterStateRoot,
      sessionsRoot: usageSessionsRoot,
      threadIds: scope,
      commandTimeoutMs,
      cwd
    })).then((snapshot) => {
      const accepted = validateBoardUsageHistorySnapshot(snapshot);
      lastGood = { scopeKey, snapshot: accepted };
      lastFailure = false;
      return { status: "ready", scopeKey };
    }, () => {
      lastFailure = true;
      return { status: "hold", scopeKey };
    }).finally(() => {
      if (inFlight === operation) inFlight = null;
    });
    inFlight = operation;
    return operation;
  }

  return {
    async readProjection({ force = false } = {}) {
      const scope = await enrolledScope().catch(() => null);
      if (!autoRefresh || scope === null) return unavailableProjection("hold");
      const scopeKey = scope.join("\u0000");
      const hasCurrentLastGood = lastGood?.scopeKey === scopeKey;
      const observedNow = safeNow(now);
      const due = force || lastAttemptAt === null || observedNow - lastAttemptAt >= debounceMs || !hasCurrentLastGood;
      if (due) begin(scope);

      if (hasCurrentLastGood) {
        return snapshotProjection(lastGood.snapshot, inFlight === null ? (lastFailure ? "hold" : "ready") : "refreshing");
      }
      if (inFlight === null) return unavailableProjection("hold");
      const initial = await withTimeout(inFlight, initialTimeoutMs);
      if (initial?.status === "ready" && lastGood?.scopeKey === scopeKey) {
        return snapshotProjection(lastGood.snapshot, "ready");
      }
      return unavailableProjection("hold");
    }
  };
}

export function createAiUsageAdapterPlugin(options = {}) {
  const adapter = createAiUsageAdapter(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== AI_USAGE_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      void adapter.readProjection({ force: url.searchParams.get("refresh") === "1" }).then((projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      }, () => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(unavailableProjection("hold")));
      });
    });
  };
  return {
    name: "soulforge-ai-usage-adapter",
    configureServer: configure,
    configurePreviewServer: configure
  };
}

export { outputPath };
