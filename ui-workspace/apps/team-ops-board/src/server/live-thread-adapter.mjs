import { spawn as spawnProcess, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { loadPersistedUsageEvents } from "../../../../../guild_hall/ai_usage_meter/usage_meter.mjs";

import {
  buildLiveThreadProjection,
  createUnavailableLiveThreadProjection,
  normalizeExactThreadBindingRegistry,
  projectRuntimeThread
} from "../core/live-thread-projection.mjs";
import {
  defaultThreadEnrollmentRegistryPath,
  isLiveThreadEnrollmentDisabled,
  readThreadEnrollmentRegistry
} from "../core/live-thread-enrollment.mjs";
import {
  defaultOrganizationCatalogPath,
  readOrganizationCatalog
} from "./live-organization-catalog-store.mjs";
import {
  defaultThreadResultGateRegistryPath,
  readThreadResultGateRegistry
} from "../core/live-thread-result-gate.mjs";
import {
  DEFAULT_LIFECYCLE_POSITIVE_LEASE_MAX_AGE_MS,
  DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS,
  defaultLifecycleDisableControlPath,
  defaultLifecycleSnapshotPath,
  projectLifecycleSnapshotRuntime,
  readLifecycleSnapshotSource
} from "./live-thread-lifecycle-snapshot.mjs";
import {
  DEFAULT_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS,
  DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
  createAutomaticLifecycleReconciler,
  defaultCodexSessionsRoot,
  reconcileAndPersistLifecycle
} from "./live-thread-lifecycle-reconcile.mjs";
import {
  DEFAULT_AUTO_ENROLLMENT_DEBOUNCE_MS,
  collectExactParentThreadLineage,
  createLiveThreadAutoEnrollmentReconciler
} from "./live-thread-auto-enrollment.mjs";
import {
  collectExactSubagentStartReceiptLineage
} from "./live-thread-subagent-receipt-enrollment.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export const LIVE_THREAD_SNAPSHOT_PATH = "/codex-threads.snapshot.json";

const DEFAULT_LIMITS = {
  cacheMs: 5_000,
  // The persisted exact lifecycle source remains authoritative when the
  // optional app-server observation misses this bounded UI refresh budget.
  timeoutMs: 5_000,
  pageSize: 20,
  maxPages: 20,
  maxThreads: 400,
  maxProtocolBytes: 1_048_576,
  maxProtocolLineBytes: 262_144,
  lifecycleSnapshotMaxAgeMs: DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS,
  lifecyclePositiveLeaseMaxAgeMs: DEFAULT_LIFECYCLE_POSITIVE_LEASE_MAX_AGE_MS,
  lifecycleSnapshotMaxFutureMs: 60_000,
  lifecycleReconcileDebounceMs: DEFAULT_AUTO_LIFECYCLE_RECONCILE_DEBOUNCE_MS,
  lifecycleReconcileTimeoutMs: DEFAULT_AUTO_LIFECYCLE_RECONCILE_TIMEOUT_MS,
  lifecycleReconcileMaxSessions: 200,
  autoEnrollmentDebounceMs: DEFAULT_AUTO_ENROLLMENT_DEBOUNCE_MS
};

function readPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function readNonNegativeInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function adapterLimits(overrides = {}) {
  return {
    cacheMs: readPositiveInteger(overrides.cacheMs, DEFAULT_LIMITS.cacheMs, 60_000),
    timeoutMs: readPositiveInteger(overrides.timeoutMs, DEFAULT_LIMITS.timeoutMs, 30_000),
    pageSize: readPositiveInteger(overrides.pageSize, DEFAULT_LIMITS.pageSize, 20),
    maxPages: readPositiveInteger(overrides.maxPages, DEFAULT_LIMITS.maxPages, 20),
    maxThreads: readPositiveInteger(overrides.maxThreads, DEFAULT_LIMITS.maxThreads, 400),
    maxProtocolBytes: readPositiveInteger(overrides.maxProtocolBytes, DEFAULT_LIMITS.maxProtocolBytes, 1_048_576),
    maxProtocolLineBytes: readPositiveInteger(overrides.maxProtocolLineBytes, DEFAULT_LIMITS.maxProtocolLineBytes, 262_144),
    lifecycleSnapshotMaxAgeMs: readNonNegativeInteger(
      overrides.lifecycleSnapshotMaxAgeMs,
      DEFAULT_LIMITS.lifecycleSnapshotMaxAgeMs,
      24 * 60 * 60 * 1_000
    ),
    lifecyclePositiveLeaseMaxAgeMs: readNonNegativeInteger(
      overrides.lifecyclePositiveLeaseMaxAgeMs,
      DEFAULT_LIMITS.lifecyclePositiveLeaseMaxAgeMs,
      DEFAULT_LIFECYCLE_SNAPSHOT_MAX_AGE_MS
    ),
    lifecycleSnapshotMaxFutureMs: readNonNegativeInteger(
      overrides.lifecycleSnapshotMaxFutureMs,
      DEFAULT_LIMITS.lifecycleSnapshotMaxFutureMs,
      5 * 60 * 1_000
    ),
    lifecycleReconcileDebounceMs: readNonNegativeInteger(
      overrides.lifecycleReconcileDebounceMs,
      DEFAULT_LIMITS.lifecycleReconcileDebounceMs,
      5 * 60 * 1_000
    ),
    lifecycleReconcileTimeoutMs: readPositiveInteger(
      overrides.lifecycleReconcileTimeoutMs,
      DEFAULT_LIMITS.lifecycleReconcileTimeoutMs,
      10_000
    ),
    lifecycleReconcileMaxSessions: readPositiveInteger(
      overrides.lifecycleReconcileMaxSessions,
      DEFAULT_LIMITS.lifecycleReconcileMaxSessions,
      200
    ),
    autoEnrollmentDebounceMs: readNonNegativeInteger(
      overrides.autoEnrollmentDebounceMs,
      DEFAULT_LIMITS.autoEnrollmentDebounceMs,
      5 * 60 * 1_000
    )
  };
}

function quoteWindowsCommandArgument(value) {
  const text = String(value);
  return /[\s"&|<>^]/u.test(text) ? `"${text.replace(/"/gu, '\\"')}"` : text;
}

function directWindowsCodexSpawnSpec(command, args) {
  const raw = String(command || "").trim();
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const candidate = String(value || "").trim();
    if (!candidate || seen.has(candidate.toLowerCase())) return;
    seen.add(candidate.toLowerCase());
    candidates.push(candidate);
  };
  add(raw);
  if (raw && !/[\\/:]/u.test(raw)) {
    try {
      const found = spawnSync("where.exe", [raw], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5_000
      });
      if (!found.error && found.status === 0) {
        for (const line of String(found.stdout || "").split(/\r?\n/u)) add(line);
      }
    } catch {}
  }
  for (const candidate of candidates) {
    const extension = extname(candidate).toLowerCase();
    if (extension === ".cmd" || extension === ".bat") {
      const executable = join(dirname(candidate), "node_modules", "@openai", "codex", "bin", "codex.js");
      if (!existsSync(executable)) continue;
      const localNode = join(dirname(candidate), "node.exe");
      return {
        command: resolve(existsSync(localNode) ? localNode : process.execPath),
        args: [resolve(executable), ...args]
      };
    }
    if (extension === ".exe" && existsSync(candidate)) {
      return { command: resolve(candidate), args };
    }
  }
  return null;
}

function defaultSpawnSpec() {
  const configuredCommand = String(process.env.TEAM_OPS_BOARD_CODEX_APP_SERVER_COMMAND || "").trim();
  const command = configuredCommand || "codex";
  const args = ["app-server"];
  if (process.platform !== "win32") return { command, args };
  const direct = directWindowsCodexSpawnSpec(command, args);
  if (direct) return direct;
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsCommandArgument).join(" ")]
  };
}

function cloneSafeProjection(value) {
  return JSON.parse(JSON.stringify(value));
}

function classifyRpcError(value) {
  const detail = String(value?.message ?? value?.code ?? "").toLowerCase();
  if (detail.includes("usestatedbonly") || (detail.includes("unknown") && detail.includes("state")) || detail.includes("unexpected thread/list params")) {
    return "unsupported_state_db_only";
  }
  return "app_server_rpc_error";
}

function validCursor(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 2_048
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function listThreadsFromAppServer({ spawnImpl, spawnSpec, limits, cwd, preferStateDb = true }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(spawnSpec.command, spawnSpec.args, {
        cwd,
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch {
      reject(new Error("app_server_launch_failed"));
      return;
    }

    const pending = new Map();
    const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let bytes = 0;
    let nextId = 1;
    let settled = false;
    let timer;
    let cleanupPromise = null;

    const cleanup = () => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = new Promise((resolveCleanup) => {
        clearTimeout(timer);
        try { reader.close(); } catch {}
        for (const request of pending.values()) request.reject(new Error("app_server_closed"));
        pending.clear();
        try { child.stdin.end(); } catch {}
        if (child.exitCode !== null) {
          resolveCleanup();
          return;
        }
        const fallback = setTimeout(resolveCleanup, 300);
        child.once("exit", () => {
          clearTimeout(fallback);
          resolveCleanup();
        });
        try { child.kill(); } catch {
          clearTimeout(fallback);
          resolveCleanup();
        }
      });
      return cleanupPromise;
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      void cleanup().finally(() => resolve(result));
    };
    const fail = (code) => {
      if (settled) return;
      settled = true;
      void cleanup().finally(() => reject(new Error(code)));
    };
    const send = (message) => {
      if (settled || child.stdin.destroyed || !child.stdin.writable) return false;
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
          if (error) fail("app_server_stdin_failed");
        });
        return true;
      } catch {
        fail("app_server_stdin_failed");
        return false;
      }
    };
    const request = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
      if (settled) {
        rejectRequest(new Error("app_server_closed"));
        return;
      }
      const id = nextId++;
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      if (!send({ id, method, params })) {
        pending.delete(id);
        rejectRequest(new Error("app_server_closed"));
      }
    });
    const notify = (method, params = {}) => send({ method, params });

    timer = setTimeout(() => fail("app_server_timeout"), limits.timeoutMs);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > limits.maxProtocolBytes) fail("app_server_output_limit");
    });
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > limits.maxProtocolBytes) fail("app_server_output_limit");
    });
    child.stdin.on("error", () => fail("app_server_stdin_failed"));
    child.on("error", () => fail("app_server_launch_failed"));
    child.on("exit", () => {
      if (!settled) fail("app_server_closed");
    });
    reader.on("line", (line) => {
      if (settled || !line.trim()) return;
      if (Buffer.byteLength(line, "utf8") > limits.maxProtocolLineBytes) {
        fail("app_server_output_limit");
        return;
      }
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail("app_server_protocol_invalid");
        return;
      }
      if (!Number.isSafeInteger(message?.id)) return;
      const pendingRequest = pending.get(message.id);
      if (!pendingRequest) return;
      pending.delete(message.id);
      if (message.error) {
        pendingRequest.reject(new Error(classifyRpcError(message.error)));
        return;
      }
      pendingRequest.resolve(message.result);
    });

    (async () => {
      await request("initialize", {
        clientInfo: { name: "soulforge-team-ops-board", version: "1" },
        capabilities: { experimentalApi: true }
      });
      notify("initialized", {});

      const threads = [];
      const lineage = [];
      const lineageUnsafeThreadIds = new Set();
      let lineageMalformed = 0;
      const seenCursors = new Set();
      let cursor = null;
      let pages = 0;
      let useStateDbOnly = preferStateDb;
      let partial = false;
      while (true) {
        if (pages >= limits.maxPages || threads.length >= limits.maxThreads) {
          partial = true;
          break;
        }
        const params = {
          limit: limits.pageSize,
          ...(cursor ? { cursor } : {}),
          ...(useStateDbOnly ? { useStateDbOnly: true } : {})
        };
        let result;
        try {
          result = await request("thread/list", params);
        } catch (error) {
          if (useStateDbOnly && error?.message === "unsupported_state_db_only") {
            useStateDbOnly = false;
            continue;
          }
          throw error;
        }
        pages += 1;
        const rawData = result?.data;
        const data = Array.isArray(rawData) ? rawData : [];
        const exactLineage = collectExactParentThreadLineage(rawData);
        lineage.push(...exactLineage.candidates);
        lineageMalformed += exactLineage.malformed_count;
        for (const threadId of exactLineage.unsafe_thread_ids) lineageUnsafeThreadIds.add(threadId);
        for (const item of data) {
          if (threads.length >= limits.maxThreads) {
            partial = true;
            break;
          }
          const projected = projectRuntimeThread(item);
          if (projected) threads.push(projected);
        }
        if (threads.length >= limits.maxThreads) {
          partial = true;
          break;
        }
        const nextCursor = result?.nextCursor;
        if (nextCursor === null || nextCursor === undefined || nextCursor === "") break;
        if (!validCursor(nextCursor) || seenCursors.has(nextCursor)) throw new Error("app_server_invalid_cursor");
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }
      finish({
        threads,
        lineage,
        lineageMalformed,
        lineageUnsafeThreadIds: [...lineageUnsafeThreadIds].sort((left, right) => left.localeCompare(right, "en")),
        partial,
        pages,
        usedStateDbOnly: useStateDbOnly
      });
    })().catch(() => fail("app_server_query_failed"));
  });
}

function mergeRuntimeThreadObservations(primary, current, maximum) {
  const merged = new Map(primary.map((thread) => [thread.thread_id, thread]));
  for (const thread of current) {
    const existing = merged.get(thread.thread_id);
    if (!existing && merged.size >= maximum) break;
    if (!existing) {
      merged.set(thread.thread_id, thread);
      continue;
    }
    const existingIsStopOnly = existing.stop_observed_at !== null && existing.status === "not_loaded_unknown";
    const nextIsStopOnly = thread.stop_observed_at !== null && thread.status === "not_loaded_unknown";
    const preferNext = (
      (existing.status === "not_loaded_unknown" && thread.status !== "not_loaded_unknown")
      || (existingIsStopOnly && !nextIsStopOnly)
      || (!existingIsStopOnly && !nextIsStopOnly && String(thread.updated_at ?? "").localeCompare(String(existing.updated_at ?? "")) > 0)
    );
    const preferred = preferNext ? thread : existing;
    const stopObservedAt = [existing.stop_observed_at, thread.stop_observed_at]
      .filter((value) => typeof value === "string")
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    const updatedAt = [existing.updated_at, thread.updated_at]
      .filter((value) => typeof value === "string")
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    merged.set(thread.thread_id, { ...preferred, updated_at: updatedAt, stop_observed_at: stopObservedAt });
  }
  return [...merged.values()];
}

function isPositiveRuntimeStatus(status) {
  return status === "active" || status === "waiting";
}

function latestRuntimeTimestamp(observations, field) {
  return observations
    .map((observation) => observation?.[field])
    .filter((value) => typeof value === "string")
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function withRuntimeTiming(preferred, ...observations) {
  return {
    ...preferred,
    updated_at: latestRuntimeTimestamp(observations, "updated_at"),
    stop_observed_at: latestRuntimeTimestamp(observations, "stop_observed_at")
  };
}

function latestRuntimeByThreadId(threads) {
  const byThreadId = new Map();
  for (const thread of threads) {
    const prior = byThreadId.get(thread.thread_id);
    if (!prior || String(thread.updated_at ?? "").localeCompare(String(prior.updated_at ?? "")) > 0) {
      byThreadId.set(thread.thread_id, thread);
    }
  }
  return byThreadId;
}

function reconcileLeasedLifecycleRuntime({
  appRuntimeThreads,
  lifecycleRuntimeThreads,
  stopObservations,
  enrolledThreadIds,
  maximum
}) {
  const runtimeByThreadId = latestRuntimeByThreadId(appRuntimeThreads);
  const lifecycleByThreadId = latestRuntimeByThreadId(lifecycleRuntimeThreads);
  const stopByThreadId = latestRuntimeByThreadId(stopObservations);
  const relevantThreadIds = new Set([
    ...enrolledThreadIds,
    ...lifecycleByThreadId.keys(),
    ...stopByThreadId.keys()
  ]);

  for (const threadId of relevantThreadIds) {
    const app = runtimeByThreadId.get(threadId);
    const lifecycle = lifecycleByThreadId.get(threadId);
    const usageStop = stopByThreadId.get(threadId);
    let next = null;

    if (app?.status === "error") {
      next = withRuntimeTiming(app, app, lifecycle, usageStop);
    } else if (lifecycle && isPositiveRuntimeStatus(lifecycle.status)) {
      const positiveFollowsUsageStop = !usageStop
        || String(lifecycle.updated_at ?? "").localeCompare(String(usageStop.updated_at ?? "")) > 0;
      next = positiveFollowsUsageStop
        ? withRuntimeTiming(lifecycle, lifecycle, app)
        : withRuntimeTiming(usageStop, usageStop, app);
    } else if (lifecycle?.status === "stopped") {
      const newestStopAt = latestRuntimeTimestamp([lifecycle, usageStop], "updated_at");
      const appStartsNewTurn = app
        && isPositiveRuntimeStatus(app.status)
        && String(app.updated_at ?? "").localeCompare(String(newestStopAt ?? "")) > 0;
      // App-server activity is trusted here only as a newer turn after an
      // available exact lifecycle stop. Without that lifecycle boundary,
      // app-only positives still fail closed below.
      next = appStartsNewTurn
        ? withRuntimeTiming(app, app, lifecycle, usageStop)
        : withRuntimeTiming(lifecycle, lifecycle, usageStop, app);
    } else if (usageStop) {
      next = withRuntimeTiming(usageStop, usageStop, app);
    } else if (app) {
      next = isPositiveRuntimeStatus(app.status) ? { ...app, status: "not_loaded_unknown" } : app;
    }

    if (next && (runtimeByThreadId.has(threadId) || runtimeByThreadId.size < maximum)) {
      runtimeByThreadId.set(threadId, next);
    }
  }
  return [...runtimeByThreadId.values()];
}

async function loadUsageStopObservations({ loadUsageEvents, stateRoot, enrolledThreadIds }) {
  if (!stateRoot || enrolledThreadIds.size === 0) return [];
  let events;
  try {
    events = await loadUsageEvents(stateRoot);
  } catch {
    return [];
  }
  const latest = new Map();
  for (const event of events) {
    if (
      !enrolledThreadIds.has(event?.thread_id)
      || !["complete", "observed_at_stop"].includes(event?.measurement?.status)
      || event?.privacy?.metadata_only !== true
      || event?.privacy?.prompt_captured !== false
      || event?.privacy?.reasoning_captured !== false
      || event?.privacy?.tool_payload_captured !== false
    ) continue;
    const updatedAt = event?.time?.completed_at ?? event?.time?.started_at;
    if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) continue;
    const prior = latest.get(event.thread_id);
    if (!prior || Date.parse(prior.updatedAt) < Date.parse(updatedAt)) {
      latest.set(event.thread_id, {
        thread_id: event.thread_id,
        status: "not_loaded_unknown",
        updated_at: updatedAt,
        stop_observed_at: updatedAt
      });
    }
  }
  return [...latest.values()];
}

async function readExactBindingRegistry(path) {
  if (!path) return { status: "missing", registry: null };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const registry = normalizeExactThreadBindingRegistry(parsed);
    return registry ? { status: "available", registry } : { status: "invalid", registry: null };
  } catch (error) {
    return error?.code === "ENOENT" ? { status: "missing", registry: null } : { status: "invalid", registry: null };
  }
}

function lifecycleHealthNeedsPartial(status) {
  return ["hold", "invalid", "disabled", "stale"].includes(status);
}

function automaticLifecycleReconcileEnabled(value) {
  return !["0", "false", "no", "off"].includes(String(value ?? "").trim().toLowerCase());
}

function lifecycleHoldSource() {
  return { status: "hold", snapshot: null, identity_count: 0 };
}

export function createLiveThreadAdapter({
  registryPath = process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || defaultThreadEnrollmentRegistryPath(),
  organizationCatalogPath = null,
  env = process.env,
  exactBindingPath = process.env.TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS || null,
  resultGatePath = process.env.TEAM_OPS_BOARD_THREAD_RESULT_GATE_REGISTRY || defaultThreadResultGateRegistryPath(),
  usageMeterStateRoot = process.env.SOULFORGE_AI_USAGE_METER_STATE_ROOT || resolve(dirname(registryPath), "..", "ai_usage_meter"),
  lifecycleStateRoot = usageMeterStateRoot,
  lifecycleSnapshotPath = process.env.TEAM_OPS_BOARD_LIFECYCLE_SNAPSHOT || defaultLifecycleSnapshotPath(lifecycleStateRoot),
  lifecycleDisableControlPath = process.env.TEAM_OPS_BOARD_LIFECYCLE_DISABLE_CONTROL || defaultLifecycleDisableControlPath(lifecycleStateRoot),
  lifecycleSessionsRoot = defaultCodexSessionsRoot({ env }),
  autoLifecycleReconcile = automaticLifecycleReconcileEnabled(env?.TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE),
  lifecycleReconcileAndPersist = reconcileAndPersistLifecycle,
  loadUsageEvents = loadPersistedUsageEvents,
  spawnSpec = defaultSpawnSpec(),
  spawnImpl = spawnProcess,
  cwd = process.cwd(),
  limits: limitOverrides = {},
  now = () => Date.now()
} = {}) {
  const resolvedOrganizationCatalogPath = organizationCatalogPath || defaultOrganizationCatalogPath(env);
  const limits = adapterLimits(limitOverrides);
  const lifecycleReconciler = autoLifecycleReconcile
    ? createAutomaticLifecycleReconciler({
      stateRoot: lifecycleStateRoot,
      sessionsRoot: lifecycleSessionsRoot,
      debounceMs: limits.lifecycleReconcileDebounceMs,
      timeoutMs: limits.lifecycleReconcileTimeoutMs,
      maxSessionCount: limits.lifecycleReconcileMaxSessions,
      now,
      reconcileAndPersist: lifecycleReconcileAndPersist
    })
    : null;
  const autoEnrollmentReconciler = createLiveThreadAutoEnrollmentReconciler({
    registryPath,
    env,
    debounceMs: limits.autoEnrollmentDebounceMs,
    now
  });
  let cached = null;
  let inFlight = null;

  async function refresh() {
    let enrollment = await readThreadEnrollmentRegistry(registryPath);
    if (enrollment.status === "missing") return createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" });
    if (!enrollment.registry) return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    if (isLiveThreadEnrollmentDisabled({ registry: enrollment.registry, env })) {
      return createUnavailableLiveThreadProjection({ health: "disabled", enrollmentHealth: "disabled" });
    }
    const organizationCatalog = await readOrganizationCatalog(resolvedOrganizationCatalogPath, { env });
    const organizationProjection = {
      organizationCatalog: organizationCatalog.catalog,
      organizationCatalogHealth: organizationCatalog.status
    };

    const exactBindings = await readExactBindingRegistry(exactBindingPath);
    const resultGates = await readThreadResultGateRegistry(resultGatePath, { env });
    let lifecycleSource = await readLifecycleSnapshotSource({
      stateRoot: lifecycleStateRoot,
      snapshotPath: lifecycleSnapshotPath,
      disabledControlPath: lifecycleDisableControlPath,
      now,
      maxAgeMs: limits.lifecycleSnapshotMaxAgeMs,
      maxFutureMs: limits.lifecycleSnapshotMaxFutureMs
    });
    const currentEnrollmentCount = enrollment.registry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted").length;
    let enrolledThreadIds = new Set(enrollment.registry.entries
      .filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
      .map((entry) => entry.thread_id));
    // A validated persisted snapshot is the request-path source of truth. The
    // companion producer refreshes it out of band; reconciling all enrolled
    // sessions again here makes an otherwise fresh Board request block near
    // the lifecycle timeout and can race the UI refresh window.
    if (lifecycleReconciler !== null && currentEnrollmentCount > 0 && !["available", "disabled", "invalid"].includes(lifecycleSource.status)) {
      const lifecycleSourceBeforeReconcile = lifecycleSource;
      const reconciliation = await lifecycleReconciler.reconcile({
        threadIds: enrolledThreadIds,
        sourceHealth: lifecycleSource.status
      });
      if (reconciliation.status === "available") {
        const refreshedLifecycleSource = await readLifecycleSnapshotSource({
          stateRoot: lifecycleStateRoot,
          snapshotPath: lifecycleSnapshotPath,
          disabledControlPath: lifecycleDisableControlPath,
          now,
          maxAgeMs: limits.lifecycleSnapshotMaxAgeMs,
          maxFutureMs: limits.lifecycleSnapshotMaxFutureMs
        });
        // A transient reconcile/read race must not erase a fresh, already
        // validated source. The source still expires normally at its bounded
        // max age and disabled/invalid controls remain fail-closed.
        lifecycleSource = refreshedLifecycleSource.status === "missing"
          && lifecycleSourceBeforeReconcile.status === "available"
          ? lifecycleSourceBeforeReconcile
          : refreshedLifecycleSource;
      } else if (reconciliation.status !== "debounced") {
        const refreshedLifecycleSource = await readLifecycleSnapshotSource({
          stateRoot: lifecycleStateRoot,
          snapshotPath: lifecycleSnapshotPath,
          disabledControlPath: lifecycleDisableControlPath,
          now,
          maxAgeMs: limits.lifecycleSnapshotMaxAgeMs,
          maxFutureMs: limits.lifecycleSnapshotMaxFutureMs
        });
        // Re-read the controls after a timeout/failure so an emergency disable,
        // invalid control, or stale source cannot be masked by the last-good
        // buffer. Only a transient missing read may retain a previously
        // validated available snapshot.
        lifecycleSource = refreshedLifecycleSource.status === "missing"
          && lifecycleSourceBeforeReconcile.status === "available"
          ? lifecycleSourceBeforeReconcile
          : refreshedLifecycleSource.status === "missing"
            ? lifecycleHoldSource()
            : refreshedLifecycleSource;
      } else if (lifecycleSource.status !== "available") {
        lifecycleSource = lifecycleHoldSource();
      }
    }
    if (currentEnrollmentCount === 0) {
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        ...organizationProjection,
        exactBindingRegistry: exactBindings.registry,
        resultGateRegistry: resultGates.registry,
        resultGateHealth: resultGates.status,
        lifecycleSourceHealth: lifecycleSource.status,
        lifecycleExactIdentityCount: lifecycleSource.identity_count,
        runtimeThreads: [],
        adapter: {
          health: exactBindings.status === "invalid" || resultGates.status === "invalid" || lifecycleHealthNeedsPartial(lifecycleSource.status) ? "partial" : "ready",
          coverage: "partial",
          transport: "loopback_local",
          last_refresh_at: new Date(now()).toISOString()
        }
      });
    }

    const stopObservations = await loadUsageStopObservations({ loadUsageEvents, stateRoot: usageMeterStateRoot, enrolledThreadIds });
    let lifecycleRuntime = projectLifecycleSnapshotRuntime({
      source: lifecycleSource,
      enrolledThreadIds,
      now,
      positiveLeaseMaxAgeMs: limits.lifecyclePositiveLeaseMaxAgeMs
    });
    const receiptLineage = collectExactSubagentStartReceiptLineage({
      source: lifecycleSource,
      env,
      now,
      positiveLeaseMaxAgeMs: limits.lifecyclePositiveLeaseMaxAgeMs
    });
    const refreshEnrollmentAndLifecycleRuntime = () => {
      enrolledThreadIds = new Set(enrollment.registry.entries
        .filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted")
        .map((entry) => entry.thread_id));
      lifecycleRuntime = projectLifecycleSnapshotRuntime({
        source: lifecycleSource,
        enrolledThreadIds,
        now,
        positiveLeaseMaxAgeMs: limits.lifecyclePositiveLeaseMaxAgeMs
      });
    };
    const reconcileAutoEnrollment = async ({ candidates, partial, malformedCount, unsafeThreadIds }) => {
      const autoEnrollment = await autoEnrollmentReconciler.reconcile({
        organizationCatalog: organizationCatalog.catalog,
        candidates,
        partial,
        malformedCount,
        unsafeThreadIds
      });
      if (autoEnrollment.status === "available" && autoEnrollment.changed && autoEnrollment.registry) {
        enrollment = { ...enrollment, registry: autoEnrollment.registry, status: "available" };
        refreshEnrollmentAndLifecycleRuntime();
      }
    };

    try {
      const observed = await listThreadsFromAppServer({ spawnImpl, spawnSpec, limits, cwd });
      let runtimeThreads = observed.threads;
      let currentRefreshPartial = false;
      let exactParentLineage = observed.lineage;
      let lineageMalformed = observed.lineageMalformed;
      const lineageUnsafeThreadIds = new Set(observed.lineageUnsafeThreadIds);
      let lineagePartial = observed.partial;
      if (lifecycleSource.status !== "available" && observed.usedStateDbOnly && observed.threads.some((thread) => (
        enrolledThreadIds.has(thread.thread_id) && thread.status === "not_loaded_unknown"
      ))) {
        try {
          const current = await listThreadsFromAppServer({ spawnImpl, spawnSpec, limits, cwd, preferStateDb: false });
          runtimeThreads = mergeRuntimeThreadObservations(observed.threads, current.threads, limits.maxThreads);
          currentRefreshPartial = current.partial;
          exactParentLineage = [...observed.lineage, ...current.lineage];
          lineageMalformed += current.lineageMalformed;
          for (const threadId of current.lineageUnsafeThreadIds) lineageUnsafeThreadIds.add(threadId);
          lineagePartial = observed.partial || current.partial;
        } catch {
          currentRefreshPartial = true;
        }
      }
      try {
        await reconcileAutoEnrollment({
          candidates: [...exactParentLineage, ...receiptLineage.candidates],
          partial: lineagePartial,
          malformedCount: lineageMalformed + receiptLineage.malformed_count,
          unsafeThreadIds: [...lineageUnsafeThreadIds, ...receiptLineage.unsafe_thread_ids]
        });
      } catch {}
      runtimeThreads = reconcileLeasedLifecycleRuntime({
        appRuntimeThreads: runtimeThreads,
        lifecycleRuntimeThreads: lifecycleRuntime.runtime_threads,
        stopObservations,
        enrolledThreadIds,
        maximum: limits.maxThreads
      });
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        ...organizationProjection,
        exactBindingRegistry: exactBindings.registry,
        resultGateRegistry: resultGates.registry,
        resultGateHealth: resultGates.status,
        lifecycleSourceHealth: lifecycleSource.status,
        lifecycleExactIdentityCount: lifecycleSource.identity_count,
        lifecycleMatchedEnrolledCount: lifecycleRuntime.matched_enrolled_count,
        runtimeThreads,
        adapter: {
          health: observed.partial || currentRefreshPartial || exactBindings.status === "invalid" || resultGates.status === "invalid" || lifecycleHealthNeedsPartial(lifecycleSource.status) ? "partial" : "ready",
          coverage: "partial",
          transport: "loopback_local",
          last_refresh_at: new Date(now()).toISOString()
        }
      });
    } catch {
      // The persisted receipt bridge can still add an exact child even when
      // the optional app-server observation is unavailable. It shares the
      // adapter's one awaited registry reconciler and never writes itself.
      if (receiptLineage.candidates.length > 0) {
        try {
          await reconcileAutoEnrollment({
            candidates: receiptLineage.candidates,
            partial: false,
            malformedCount: receiptLineage.malformed_count,
            unsafeThreadIds: receiptLineage.unsafe_thread_ids
          });
        } catch {}
      }
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        ...organizationProjection,
        exactBindingRegistry: exactBindings.registry,
        resultGateRegistry: resultGates.registry,
        resultGateHealth: resultGates.status,
        lifecycleSourceHealth: lifecycleSource.status,
        lifecycleExactIdentityCount: lifecycleSource.identity_count,
        lifecycleMatchedEnrolledCount: lifecycleRuntime.matched_enrolled_count,
        runtimeThreads: reconcileLeasedLifecycleRuntime({
          appRuntimeThreads: [],
          lifecycleRuntimeThreads: lifecycleRuntime.runtime_threads,
          stopObservations,
          enrolledThreadIds,
          maximum: limits.maxThreads
        }),
        adapter: {
          health: "error",
          coverage: "unknown",
          transport: "loopback_local",
          last_refresh_at: new Date(now()).toISOString()
        }
      });
    }
  }

  return {
    async readProjection({ force = false } = {}) {
      if (!force && cached && now() - cached.at < limits.cacheMs) return cloneSafeProjection(cached.value);
      if (!inFlight) {
        inFlight = refresh().then((projection) => {
          cached = { at: now(), value: projection };
          return projection;
        }).finally(() => {
          inFlight = null;
        });
      }
      return cloneSafeProjection(await inFlight);
    },
    invalidateCache() {
      cached = null;
    }
  };
}

export function createLiveThreadAdapterPlugin(options = {}) {
  const adapter = createLiveThreadAdapter(options);
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
      if (url.pathname !== LIVE_THREAD_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isDirectLoopbackRequest(request)) {
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
        response.statusCode = 503;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify(createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" })));
      });
    });
  };
  return {
    name: "soulforge-live-thread-adapter",
    configureServer: configure,
    configurePreviewServer: configure
  };
}
