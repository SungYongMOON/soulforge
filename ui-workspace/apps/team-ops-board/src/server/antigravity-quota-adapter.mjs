// antigravity-quota-adapter.mjs — local-only sanitized quota cache and,
// under an exact gate, a loopback language-server observation.

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildAntigravityQuotaSnapshot,
  buildAntigravityQuotaStatus,
  normalizeAntigravityQuotaSnapshot,
  parseAntigravityQuotaResponse,
  staleAntigravityQuotaSnapshot,
} from "../core/antigravity-quota.mjs";
import { isTeamOpsBoardReadOnlyPilot } from "../core/team-ops-board-read-only-pilot.mjs";

const execFileAsync = promisify(execFile);
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));

export const ANTIGRAVITY_QUOTA_SNAPSHOT_PATH = "/antigravity-quota.snapshot.json";
export const DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS = 120_000;
export const TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH = "TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH";
export const DEFAULT_ANTIGRAVITY_QUOTA_CACHE_PATH = path.resolve(
  MODULE_ROOT,
  "../../../../../guild_hall/state/operations/team_ops_board/antigravity_quota.last.json",
);

const RPC_PATH = "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary";
const PROBE_TIMEOUT_MS = 3_000;
const MAX_CANDIDATE_PORTS = 24;

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function isAntigravityQuotaLiveRefreshEnabled(env = process.env) {
  return env?.[TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH] === "1";
}

async function agyProcessIds() {
  const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], { timeout: 10_000, windowsHide: true });
  const pids = new Set();
  for (const line of stdout.split("\n")) {
    const match = /^"(agy\.exe|language_server\w*\.exe)","(\d+)"/u.exec(line.trim());
    if (match) pids.add(match[2]);
  }
  return pids;
}

async function antigravityAppRunning() {
  return (await agyProcessIds()).size > 0;
}

async function candidatePorts() {
  const pids = await agyProcessIds();
  if (pids.size === 0) return [];
  const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "TCP"], { timeout: 15_000, windowsHide: true });
  const ports = [];
  for (const line of stdout.split("\n")) {
    const match = /TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)/u.exec(line);
    if (match && pids.has(match[2]) && !ports.includes(match[1])) ports.push(match[1]);
  }
  return ports.slice(0, MAX_CANDIDATE_PORTS);
}

async function queryQuota(port, fetchImpl) {
  const response = await fetchImpl(`http://127.0.0.1:${port}${RPC_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return parseAntigravityQuotaResponse(await response.json().catch(() => null));
}

function staleSnapshot(snapshot, nowMs) {
  return staleAntigravityQuotaSnapshot(snapshot, { nowMs });
}

export function createAntigravityQuotaReader({
  env = process.env,
  fetchImpl = fetch,
  listPorts = candidatePorts,
  ttlMs = DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS,
  cachePath = DEFAULT_ANTIGRAVITY_QUOTA_CACHE_PATH,
  now = Date.now,
  detectAppRunning = antigravityAppRunning,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;
  let knownPort = null;
  let cacheChecked = false;
  let lastStatus = null;
  const readOnlyPilot = isTeamOpsBoardReadOnlyPilot(env);
  const liveRefreshEnabled = !readOnlyPilot && isAntigravityQuotaLiveRefreshEnabled(env);

  async function persistCache(snapshot) {
    if (cachePath === null) return;
    try {
      await mkdir(path.dirname(cachePath), { recursive: true });
      const temporary = `${cachePath}.tmp-${process.pid}`;
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await rename(temporary, cachePath);
    } catch {
      // Cache persistence is advisory. A failure never changes the public state.
    }
  }

  async function loadCacheOnce() {
    if (cacheChecked || cachePath === null) return;
    cacheChecked = true;
    try {
      const parsed = JSON.parse(await readFile(cachePath, "utf8"));
      // A retained local file is last-known evidence, never a live refresh.
      lastGood = staleSnapshot(parsed, now());
    } catch {
      // Missing, malformed, unreadable, or future cache is UNKNOWN/HOLD.
    }
  }

  function retainLastGoodAsStale() {
    lastGood = staleSnapshot(lastGood, now());
  }

  function accept(groups) {
    const snapshot = buildAntigravityQuotaSnapshot({
      groups,
      observedAtMs: now(),
      freshness: "current",
      sourceKind: "antigravity_sanitized_loopback_receipt",
    });
    if (snapshot === null) {
      retainLastGoodAsStale();
      return;
    }
    lastGood = snapshot;
    cacheChecked = true;
    void persistCache(snapshot);
  }

  async function refresh() {
    // Load before every gate so a Board restart can expose cache-only evidence
    // without RPC, process inspection, or a cache write.
    await loadCacheOnce();
    if (!liveRefreshEnabled) {
      lastStatus = buildAntigravityQuotaStatus({
        appRunning: await detectAppRunning().catch(() => false),
        observedAtMs: now(),
      });
      retainLastGoodAsStale();
      return;
    }
    if (knownPort !== null) {
      const groups = await queryQuota(knownPort, fetchImpl).catch(() => null);
      if (groups !== null) {
        accept(groups);
        return;
      }
      knownPort = null;
    }
    const ports = await listPorts().catch(() => []);
    for (const port of ports) {
      const groups = await queryQuota(port, fetchImpl).catch(() => null);
      if (groups !== null) {
        knownPort = port;
        accept(groups);
        return;
      }
    }
    // Provider off, Orca off, auth/error, and malformed replies retain only a
    // timestamped STALE last-good result.
    retainLastGoodAsStale();
  }

  return {
    async readSnapshot() {
      await loadCacheOnce();
      const observedNow = now();
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < ttlMs) return lastGood ?? lastStatus;
      if (inFlight === null) {
        lastAttemptAt = observedNow;
        const operation = refresh()
          .catch(() => { retainLastGoodAsStale(); })
          .finally(() => {
            if (inFlight === operation) inFlight = null;
          });
        inFlight = operation;
      }
      await inFlight;
      return lastGood ?? lastStatus;
    },
  };
}

export function createAntigravityQuotaAdapterPlugin(options = {}) {
  const reader = createAntigravityQuotaReader(options);
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
      if (url.pathname !== ANTIGRAVITY_QUOTA_SNAPSHOT_PATH) {
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
      const respond = (snapshot) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(snapshot ?? null));
      };
      void reader.readSnapshot().then(respond, () => respond(null));
    });
  };
  return {
    name: "soulforge-antigravity-quota-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
