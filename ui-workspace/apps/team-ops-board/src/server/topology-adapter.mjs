// topology-adapter.mjs — Watchtower topology health를 loopback 전용 GET
// /topology-health.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
// 실제 판정은 guild_hall/watchtower/cli.mjs probe가 수행하고, 이 어댑터는
// 로컬 pointer(git-ignored)로 binding을 찾아 CLI stdout(JSON)만 중계한다.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const TOPOLOGY_SNAPSHOT_PATH = "/topology-health.snapshot.json";
export const TOPOLOGY_PROJECTION_ENVELOPE_SCHEMA = "soulforge.team_ops_board.topology_projection.v1";
export const TOPOLOGY_HEALTH_SNAPSHOT_SCHEMA = "soulforge.watchtower.topology_health.v1";
export const DEFAULT_TOPOLOGY_REFRESH_DEBOUNCE_MS = 20_000;
export const DEFAULT_TOPOLOGY_COMMAND_TIMEOUT_MS = 25_000;

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const WATCHTOWER_CLI_PATH = resolve(MODULE_ROOT, "../../../../../guild_hall/watchtower/cli.mjs");
const DEFAULT_POINTER_PATH = resolve(
  MODULE_ROOT,
  "../../../../../guild_hall/state/operations/watchtower/binding.pointer.json",
);
const MAX_SNAPSHOT_BYTES = 1_048_576;
const MAX_NODES = 500;

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function envelope(refreshState, snapshot = null) {
  return {
    schema_version: TOPOLOGY_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: refreshState,
    snapshot,
  };
}

export function validateTopologyHealthSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("topology_snapshot_invalid");
  }
  if (snapshot.schema_version !== TOPOLOGY_HEALTH_SNAPSHOT_SCHEMA) {
    throw new Error("topology_snapshot_schema_invalid");
  }
  if (typeof snapshot.observed_at !== "string" || Number.isNaN(Date.parse(snapshot.observed_at))) {
    throw new Error("topology_snapshot_observed_at_invalid");
  }
  if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0 || snapshot.nodes.length > MAX_NODES) {
    throw new Error("topology_snapshot_nodes_invalid");
  }
  if (!Array.isArray(snapshot.edges)) throw new Error("topology_snapshot_edges_invalid");
  if (/[A-Za-z]:\\/u.test(JSON.stringify(snapshot))) {
    throw new Error("topology_snapshot_path_leak");
  }
  for (const node of snapshot.nodes) {
    if (typeof node?.id !== "string" || typeof node?.label !== "string"
      || node.health === null || typeof node.health !== "object"
      || typeof node.health.state !== "string") {
      throw new Error("topology_snapshot_node_invalid");
    }
  }
  return snapshot;
}

export function runWatchtowerProbe({
  bindingPath,
  timeoutMs = DEFAULT_TOPOLOGY_COMMAND_TIMEOUT_MS,
  spawnImpl = spawn,
} = {}) {
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
      child = spawnImpl(process.execPath, [WATCHTOWER_CLI_PATH, "probe", "--binding", bindingPath, "--json"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      rejectPromise(new Error("watchtower_spawn_failed"));
      return;
    }
    const chunks = [];
    let bytes = 0;
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_SNAPSHOT_BYTES) {
        try { child.kill(); } catch {}
        finish(rejectPromise, new Error("watchtower_output_too_large"));
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", () => finish(rejectPromise, new Error("watchtower_spawn_failed")));
    child.once("exit", (code) => {
      if (code !== 0 && code !== 2) {
        finish(rejectPromise, new Error("watchtower_probe_failed"));
        return;
      }
      try {
        finish(resolvePromise, validateTopologyHealthSnapshot(JSON.parse(Buffer.concat(chunks).toString("utf8"))));
      } catch (error) {
        finish(rejectPromise, error);
      }
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(rejectPromise, new Error("watchtower_probe_timeout"));
    }, timeoutMs);
  });
}

export async function resolveBindingPath(pointerPath = DEFAULT_POINTER_PATH) {
  const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
  if (pointer === null || typeof pointer !== "object" || typeof pointer.binding_path !== "string"
    || pointer.binding_path.length === 0) {
    throw new Error("topology_pointer_invalid");
  }
  return pointer.binding_path;
}

export function createTopologyAdapter({
  pointerPath = process.env.TEAM_OPS_BOARD_WATCHTOWER_POINTER || DEFAULT_POINTER_PATH,
  runProbe = runWatchtowerProbe,
  now = Date.now,
  limits: limitOverrides = {},
} = {}) {
  const debounceMs = Number.isSafeInteger(limitOverrides.debounceMs) && limitOverrides.debounceMs >= 0
    ? limitOverrides.debounceMs
    : DEFAULT_TOPOLOGY_REFRESH_DEBOUNCE_MS;
  const commandTimeoutMs = Number.isSafeInteger(limitOverrides.commandTimeoutMs) && limitOverrides.commandTimeoutMs > 0
    ? limitOverrides.commandTimeoutMs
    : DEFAULT_TOPOLOGY_COMMAND_TIMEOUT_MS;
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;

  function begin(bindingPath) {
    if (inFlight !== null) return inFlight;
    lastAttemptAt = now();
    const operation = Promise.resolve()
      .then(() => runProbe({ bindingPath, timeoutMs: commandTimeoutMs }))
      .then((snapshot) => {
        lastGood = snapshot;
        return "ready";
      }, () => "hold")
      .finally(() => {
        if (inFlight === operation) inFlight = null;
      });
    inFlight = operation;
    return operation;
  }

  return {
    async readProjection({ force = false } = {}) {
      let bindingPath;
      try {
        bindingPath = await resolveBindingPath(pointerPath);
      } catch {
        return envelope("unconfigured");
      }
      const observedNow = now();
      const due = force || lastAttemptAt === null || observedNow - lastAttemptAt >= debounceMs;
      if (due) begin(bindingPath);
      if (lastGood !== null) {
        return envelope(inFlight === null ? "ready" : "refreshing", lastGood);
      }
      if (inFlight === null) return envelope("hold");
      const state = await inFlight;
      return lastGood !== null ? envelope("ready", lastGood) : envelope(state === "ready" ? "ready" : "hold");
    },
  };
}

export function createTopologyAdapterPlugin(options = {}) {
  const adapter = createTopologyAdapter(options);
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
      if (url.pathname !== TOPOLOGY_SNAPSHOT_PATH) {
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
      const respond = (projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      };
      void adapter.readProjection({ force: url.searchParams.get("refresh") === "1" })
        .then(respond, () => respond(envelope("hold")));
    });
  };
  return {
    name: "soulforge-topology-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
