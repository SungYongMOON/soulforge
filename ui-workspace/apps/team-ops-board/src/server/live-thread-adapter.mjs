import { spawn as spawnProcess, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

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

export const LIVE_THREAD_SNAPSHOT_PATH = "/codex-threads.snapshot.json";

const DEFAULT_LIMITS = {
  cacheMs: 5_000,
  timeoutMs: 8_000,
  pageSize: 20,
  maxPages: 20,
  maxThreads: 400,
  maxProtocolBytes: 1_048_576,
  maxProtocolLineBytes: 131_072
};

function readPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
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
    maxProtocolLineBytes: readPositiveInteger(overrides.maxProtocolLineBytes, DEFAULT_LIMITS.maxProtocolLineBytes, 131_072)
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

function listThreadsFromAppServer({ spawnImpl, spawnSpec, limits, cwd }) {
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
      const seenCursors = new Set();
      let cursor = null;
      let pages = 0;
      let useStateDbOnly = true;
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
        const data = Array.isArray(result?.data) ? result.data : [];
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
      finish({ threads, partial, pages });
    })().catch(() => fail("app_server_query_failed"));
  });
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

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function createLiveThreadAdapter({
  registryPath = process.env.TEAM_OPS_BOARD_THREAD_VISIBILITY_REGISTRY || defaultThreadEnrollmentRegistryPath(),
  exactBindingPath = process.env.TEAM_OPS_BOARD_EXACT_THREAD_BINDINGS || null,
  spawnSpec = defaultSpawnSpec(),
  spawnImpl = spawnProcess,
  cwd = process.cwd(),
  limits: limitOverrides = {},
  now = () => Date.now(),
  env = process.env
} = {}) {
  const limits = adapterLimits(limitOverrides);
  let cached = null;
  let inFlight = null;

  async function refresh() {
    const enrollment = await readThreadEnrollmentRegistry(registryPath);
    if (enrollment.status === "missing") return createUnavailableLiveThreadProjection({ health: "unavailable", enrollmentHealth: "missing" });
    if (!enrollment.registry) return createUnavailableLiveThreadProjection({ health: "error", enrollmentHealth: "invalid" });
    if (isLiveThreadEnrollmentDisabled({ registry: enrollment.registry, env })) {
      return createUnavailableLiveThreadProjection({ health: "disabled", enrollmentHealth: "disabled" });
    }

    const exactBindings = await readExactBindingRegistry(exactBindingPath);
    const currentEnrollmentCount = enrollment.registry.entries.filter((entry) => entry.lifecycle === "current" || entry.lifecycle === "accepted").length;
    if (currentEnrollmentCount === 0) {
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        exactBindingRegistry: exactBindings.registry,
        runtimeThreads: [],
        adapter: {
          health: exactBindings.status === "invalid" ? "partial" : "ready",
          coverage: "partial",
          transport: "loopback_local",
          last_refresh_at: new Date(now()).toISOString()
        }
      });
    }

    try {
      const observed = await listThreadsFromAppServer({ spawnImpl, spawnSpec, limits, cwd });
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        exactBindingRegistry: exactBindings.registry,
        runtimeThreads: observed.threads,
        adapter: {
          health: observed.partial || exactBindings.status === "invalid" ? "partial" : "ready",
          coverage: "partial",
          transport: "loopback_local",
          last_refresh_at: new Date(now()).toISOString()
        }
      });
    } catch {
      return buildLiveThreadProjection({
        enrollmentRegistry: enrollment.registry,
        exactBindingRegistry: exactBindings.registry,
        runtimeThreads: [],
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
