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
export const TOPOLOGY_NODE_KINDS = Object.freeze([
  "external", "supervisor", "worker", "store", "gate", "consumer",
]);
export const TOPOLOGY_HEALTH_STATES = Object.freeze([
  "ok", "degraded", "stale", "down", "unmonitored",
]);
export const TOPOLOGY_EDGE_FLOWS = Object.freeze(["data", "control"]);

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const WATCHTOWER_CLI_PATH = resolve(MODULE_ROOT, "../../../../../guild_hall/watchtower/cli.mjs");
const DEFAULT_POINTER_PATH = resolve(
  MODULE_ROOT,
  "../../../../../guild_hall/state/operations/watchtower/binding.pointer.json",
);
const MAX_SNAPSHOT_BYTES = 1_048_576;
const MAX_NODES = 500;
const MAX_EDGES = 2_000;
const MAX_TEXT_LENGTH = 256;
const MAX_REASON_COUNT = 64;
const ROOT_KEYS = new Set(["schema_version", "observed_at", "summary", "nodes", "edges"]);
const SUMMARY_KEYS = new Set(TOPOLOGY_HEALTH_STATES);
const NODE_REQUIRED_KEYS = new Set(["id", "label", "kind", "group", "col", "row", "health"]);
const NODE_KEYS = new Set([
  ...NODE_REQUIRED_KEYS, "operation_mode", "provider", "health_scope",
]);
const HEALTH_KEYS = new Set(["state", "reasons", "age_seconds"]);
const EDGE_REQUIRED_KEYS = new Set(["from", "to", "label", "flow"]);
const EDGE_KEYS = new Set([...EDGE_REQUIRED_KEYS, "scope"]);
const NODE_KIND_SET = new Set(TOPOLOGY_NODE_KINDS);
const HEALTH_STATE_SET = new Set(TOPOLOGY_HEALTH_STATES);
const EDGE_FLOW_SET = new Set(TOPOLOGY_EDGE_FLOWS);
const OPERATION_MODE_SET = new Set(["structural", "on_demand", "scheduled", "resident"]);
const PROVIDER_SET = new Set(["codex", "claude", "antigravity"]);
const HEALTH_SCOPE_SET = new Set(["node", "provider", "collector", "aggregate", "self"]);
const EDGE_SCOPE_SET = new Set([
  "node_health_only", "usage_collector_health_only", "usage_contract_structure_only",
]);
const UNMONITORED_REASON_SET = new Set([
  "structural_only",
  "provider_evidence_absent",
  "collector_evidence_absent",
  "catalog_only_on_demand",
  "independent_evidence_absent",
  "probe_unbound",
]);
const PROTECTED_NODE_CONTRACTS = new Map([
  ["src_codex", {
    kind: "external", operationMode: "structural", provider: "codex", healthScope: "provider",
    unmonitoredReasons: ["provider_evidence_absent"], observedAllowed: false,
  }],
  ["src_claude", {
    kind: "external", operationMode: "structural", provider: "claude", healthScope: "provider",
    unmonitoredReasons: ["provider_evidence_absent"], observedAllowed: false,
  }],
  ["src_antigravity", {
    kind: "external", operationMode: "structural", provider: "antigravity", healthScope: "provider",
    unmonitoredReasons: ["provider_evidence_absent"], observedAllowed: false,
  }],
  ["usage_codex_collector", {
    kind: "worker", operationMode: "on_demand", provider: "codex", healthScope: "collector",
    unmonitoredReasons: ["collector_evidence_absent", "probe_unbound"], observedAllowed: true,
  }],
  ["usage_meter", {
    kind: "worker", operationMode: "on_demand", provider: null, healthScope: "aggregate",
    unmonitoredReasons: ["independent_evidence_absent"], observedAllowed: false,
  }],
  ["watchtower_self", {
    kind: "gate", operationMode: "structural", provider: null, healthScope: "self",
    unmonitoredReasons: ["independent_evidence_absent"], observedAllowed: false,
  }],
]);
const SUPPORTED_KIND_FLOWS = new Set([
  "data:external>supervisor",
  "data:external>worker",
  "data:supervisor>store",
  "data:worker>worker",
  "data:worker>store",
  "data:worker>consumer",
  "data:store>worker",
  "data:store>consumer",
  "data:gate>store",
  "data:gate>consumer",
  "control:worker>gate",
  "control:supervisor>gate",
]);
const PRIVACY_KEY_SENTINEL = /(?:^|_)(?:raw|body|html|source_quote|attachment|secret|token|password|passwd|cookie|session|credential|authorization|binding_path|provider_id|email)(?:_|$)/iu;

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function ageSeconds(timestamp, observedNow) {
  return timestamp === null ? null : Math.max(0, Math.floor((observedNow - timestamp) / 1000));
}

function envelope(refreshState, snapshot = null, refreshMetadata = null) {
  return {
    schema_version: TOPOLOGY_PROJECTION_ENVELOPE_SCHEMA,
    refresh_state: refreshState,
    refresh_metadata: refreshMetadata,
    snapshot,
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function hasRequiredAllowedKeys(value, required, allowed) {
  const keys = Object.keys(value);
  return [...required].every((key) => Object.hasOwn(value, key))
    && keys.every((key) => allowed.has(key));
}

function containsPrivacySentinel(value) {
  if (typeof value === "string") {
    return /[A-Za-z]:[\\/]/u.test(value)
      || /^\\\\[^\\]/u.test(value)
      || /(?:^|\s)\/(?:home|Users|var|tmp|etc|opt|srv|mnt|private|root)(?:\/|$)/u.test(value)
      || /file:\/\//iu.test(value)
      || /(?:password|passwd|secret|token|cookie|credential|authorization)\s*[:=]/iu.test(value)
      || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value)
      || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => containsPrivacySentinel(entry));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, entry]) => (
    PRIVACY_KEY_SENTINEL.test(key) || containsPrivacySentinel(entry)
  ));
}

function validText(value, { allowEmpty = false } = {}) {
  return typeof value === "string"
    && value.length <= MAX_TEXT_LENGTH
    && (allowEmpty || value.length > 0)
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validCoordinate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 10_000;
}

function exactStrings(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function parseExactTimestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

export function validateTopologyHealthSnapshot(snapshot, { now = Date.now() } = {}) {
  if (!isPlainObject(snapshot)) {
    throw new Error("topology_snapshot_invalid");
  }
  if (containsPrivacySentinel(snapshot)) throw new Error("topology_snapshot_privacy_sentinel");
  if (!hasExactKeys(snapshot, ROOT_KEYS)) throw new Error("topology_snapshot_fields_invalid");
  if (snapshot.schema_version !== TOPOLOGY_HEALTH_SNAPSHOT_SCHEMA) {
    throw new Error("topology_snapshot_schema_invalid");
  }
  const observedAt = parseExactTimestamp(snapshot.observed_at);
  if (observedAt === null || observedAt > now) {
    throw new Error("topology_snapshot_observed_at_invalid");
  }
  if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0 || snapshot.nodes.length > MAX_NODES) {
    throw new Error("topology_snapshot_nodes_invalid");
  }
  if (!Array.isArray(snapshot.edges) || snapshot.edges.length > MAX_EDGES) {
    throw new Error("topology_snapshot_edges_invalid");
  }
  if (!isPlainObject(snapshot.summary) || !hasExactKeys(snapshot.summary, SUMMARY_KEYS)) {
    throw new Error("topology_snapshot_summary_invalid");
  }
  const summary = Object.fromEntries(TOPOLOGY_HEALTH_STATES.map((state) => [state, 0]));
  const nodeIds = new Set();
  const nodeById = new Map();
  for (const node of snapshot.nodes) {
    if (!isPlainObject(node) || !hasRequiredAllowedKeys(node, NODE_REQUIRED_KEYS, NODE_KEYS)
      || !/^[a-z][a-z0-9_:-]{0,127}$/u.test(node.id)
      || !validText(node.label) || !validText(node.group)
      || !NODE_KIND_SET.has(node.kind)
      || !validCoordinate(node.col) || !validCoordinate(node.row)
      || (node.operation_mode !== undefined && !OPERATION_MODE_SET.has(node.operation_mode))
      || (node.provider !== undefined && !PROVIDER_SET.has(node.provider))
      || (node.health_scope !== undefined && !HEALTH_SCOPE_SET.has(node.health_scope))
      || !isPlainObject(node.health) || !hasExactKeys(node.health, HEALTH_KEYS)
      || !HEALTH_STATE_SET.has(node.health.state)
      || !Array.isArray(node.health.reasons) || node.health.reasons.length > MAX_REASON_COUNT
      || !node.health.reasons.every((reason) => validText(reason))
      || !(node.health.age_seconds === null
        || (Number.isFinite(node.health.age_seconds) && node.health.age_seconds >= 0))) {
      throw new Error("topology_snapshot_node_invalid");
    }
    if (nodeIds.has(node.id)) throw new Error("topology_snapshot_node_duplicate");
    if (node.health.state === "unmonitored"
      && (node.health.age_seconds !== null || node.health.reasons.length === 0
        || !node.health.reasons.every((reason) => UNMONITORED_REASON_SET.has(reason)))) {
      throw new Error("topology_snapshot_node_evidence_missing");
    }
    const protectedContract = PROTECTED_NODE_CONTRACTS.get(node.id);
    if (protectedContract !== undefined) {
      const providerValid = protectedContract.provider === null
        ? !Object.hasOwn(node, "provider")
        : node.provider === protectedContract.provider;
      if (node.kind !== protectedContract.kind
        || node.operation_mode !== protectedContract.operationMode
        || node.health_scope !== protectedContract.healthScope
        || !providerValid
        || (!protectedContract.observedAllowed && node.health.state !== "unmonitored")
        || (node.health.state === "unmonitored"
          && !exactStrings(node.health.reasons, protectedContract.unmonitoredReasons))) {
        throw new Error("topology_snapshot_protected_node_invalid");
      }
    }
    if (node.provider !== undefined && node.health_scope !== "provider" && node.health_scope !== "collector") {
      throw new Error("topology_snapshot_node_scope_invalid");
    }
    if (node.health_scope === "provider"
      && (node.id !== `src_${node.provider}` || node.kind !== "external")) {
      throw new Error("topology_snapshot_node_scope_invalid");
    }
    if (node.health_scope === "collector"
      && (node.id !== `usage_${node.provider}_collector` || node.kind !== "worker")) {
      throw new Error("topology_snapshot_node_scope_invalid");
    }
    if ((node.health_scope === "provider" || node.health_scope === "collector")
      && node.provider === undefined) {
      throw new Error("topology_snapshot_node_scope_invalid");
    }
    if ((node.health_scope === "aggregate" && node.id !== "usage_meter")
      || (node.health_scope === "self" && node.id !== "watchtower_self")) {
      throw new Error("topology_snapshot_node_scope_invalid");
    }
    nodeIds.add(node.id);
    nodeById.set(node.id, node);
    summary[node.health.state] += 1;
  }
  for (const nodeId of PROTECTED_NODE_CONTRACTS.keys()) {
    if (!nodeIds.has(nodeId)) throw new Error("topology_snapshot_protected_node_missing");
  }
  const edgeIds = new Set();
  for (const edge of snapshot.edges) {
    if (!isPlainObject(edge) || !hasRequiredAllowedKeys(edge, EDGE_REQUIRED_KEYS, EDGE_KEYS)
      || !validText(edge.from) || !validText(edge.to)
      || !validText(edge.label, { allowEmpty: true })
      || !EDGE_FLOW_SET.has(edge.flow)
      || (edge.scope !== undefined && (!EDGE_SCOPE_SET.has(edge.scope)
        || edge.flow !== "control" || edge.to !== "watchtower_self"))) {
      throw new Error("topology_snapshot_edge_invalid");
    }
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error("topology_snapshot_edge_dangling");
    }
    const sourceNode = nodeById.get(edge.from);
    if ((edge.flow === "control" && edge.to === "watchtower_self" && edge.scope === undefined)
      || (edge.scope === "node_health_only" && sourceNode.health_scope !== "node")
      || (edge.scope === "usage_collector_health_only"
        && (sourceNode.id !== "usage_codex_collector" || sourceNode.health_scope !== "collector"))
      || (edge.scope === "usage_contract_structure_only"
        && (sourceNode.id !== "usage_meter" || sourceNode.health_scope !== "aggregate"))) {
      throw new Error("topology_snapshot_edge_scope_invalid");
    }
    const kindFlow = `${edge.flow}:${sourceNode.kind}>${nodeById.get(edge.to).kind}`;
    if (!SUPPORTED_KIND_FLOWS.has(kindFlow)) {
      throw new Error("topology_snapshot_edge_kind_flow_invalid");
    }
    const edgeId = `${edge.from}\u0000${edge.to}\u0000${edge.flow}`;
    if (edgeIds.has(edgeId)) throw new Error("topology_snapshot_edge_duplicate");
    edgeIds.add(edgeId);
  }
  for (const state of TOPOLOGY_HEALTH_STATES) {
    if (!Number.isSafeInteger(snapshot.summary[state]) || snapshot.summary[state] < 0
      || snapshot.summary[state] !== summary[state]) {
      throw new Error("topology_snapshot_summary_mismatch");
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
  readOnlyPilot = false,
  pointerPath = process.env.TEAM_OPS_BOARD_WATCHTOWER_POINTER || DEFAULT_POINTER_PATH,
  runProbe = runWatchtowerProbe,
  resolveBinding = resolveBindingPath,
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
  let lastSuccessAt = null;
  let lastFailureAt = null;
  let lastRefreshFailed = false;

  function refreshMetadata(observedNow) {
    return {
      last_success_age_seconds: ageSeconds(lastSuccessAt, observedNow),
      last_failure_age_seconds: ageSeconds(lastFailureAt, observedNow),
    };
  }

  function hasFailedSinceSuccess() {
    return lastRefreshFailed;
  }

  function begin(bindingPath) {
    if (inFlight !== null) return inFlight;
    lastAttemptAt = now();
    const operation = Promise.resolve()
      .then(() => runProbe({ bindingPath, timeoutMs: commandTimeoutMs }))
      .then((snapshot) => {
        lastGood = validateTopologyHealthSnapshot(snapshot, { now: now() });
        lastSuccessAt = now();
        lastRefreshFailed = false;
        return "ready";
      })
      .catch(() => {
        lastFailureAt = now();
        lastRefreshFailed = true;
        return "hold";
      })
      .finally(() => {
        if (inFlight === operation) inFlight = null;
      });
    inFlight = operation;
    return operation;
  }

  return {
    async readProjection({ force = false } = {}) {
      if (readOnlyPilot === true) {
        return envelope("unconfigured", null, refreshMetadata(now()));
      }
      let bindingPath;
      try {
        bindingPath = await resolveBinding(pointerPath);
      } catch {
        const observedNow = now();
        if (lastGood !== null) {
          lastFailureAt = observedNow;
          lastRefreshFailed = true;
          return envelope("stale", lastGood, refreshMetadata(observedNow));
        }
        return envelope("unconfigured", null, refreshMetadata(observedNow));
      }
      const observedNow = now();
      const due = force || lastAttemptAt === null || observedNow - lastAttemptAt >= debounceMs;
      if (due) begin(bindingPath);
      if (lastGood !== null) {
        const refreshState = hasFailedSinceSuccess()
          ? "stale"
          : inFlight === null ? "ready" : "refreshing";
        return envelope(refreshState, lastGood, refreshMetadata(observedNow));
      }
      if (inFlight === null) return envelope("hold", null, refreshMetadata(observedNow));
      const state = await inFlight;
      const completedNow = now();
      return lastGood !== null
        ? envelope(hasFailedSinceSuccess() ? "stale" : "ready", lastGood, refreshMetadata(completedNow))
        : envelope(state === "ready" ? "ready" : "hold", null, refreshMetadata(completedNow));
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
