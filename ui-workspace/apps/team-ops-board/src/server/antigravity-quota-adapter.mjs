// antigravity-quota-adapter.mjs — local-only sanitized quota cache and,
// under an exact gate, a loopback language-server observation.

import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { readSoulforgeRootOverride } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  buildAntigravityQuotaSnapshot,
  buildAntigravityQuotaStatus,
  parseAntigravityQuotaResponse,
  parseAntigravityUsageCliOutput,
  staleAntigravityQuotaSnapshot,
} from "../core/antigravity-quota.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

const execFileAsync = promisify(execFile);

export const ANTIGRAVITY_QUOTA_SNAPSHOT_PATH = "/antigravity-quota.snapshot.json";
export const DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS = 120_000;
export const TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH = "TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH";

const RPC_PATH = "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary";
const PROBE_TIMEOUT_MS = 3_000;
const PROCESS_QUERY_TIMEOUT_MS = 25_000;
const MAX_CANDIDATE_PORTS = 24;
const ANTIGRAVITY_APP_EXECUTABLES = new Set(["agy.exe", "antigravity.exe", "language_server.exe"]);
const ANTIGRAVITY_PORT_OWNER_EXECUTABLES = new Set(["agy.exe", "language_server.exe"]);
const CLI_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "APPDATA",
  "HOME",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
]);

export function isAntigravityQuotaLiveRefreshEnabled(env = process.env) {
  return env?.[TEAM_OPS_BOARD_ANTIGRAVITY_QUOTA_LIVE_REFRESH] === "1";
}

export function resolveAntigravityQuotaCachePath(env = process.env) {
  // SOULFORGE_STATE_ROOT wins over any owner root; the explicit owner root
  // (SOULFORGE_AI_USAGE_PROJECT_ROOT) wins over SOULFORGE_OWNER_ROOT. A
  // set-but-invalid override throws (fail closed) instead of returning null.
  const override = readSoulforgeRootOverride(env);
  const ownerRoot = env?.SOULFORGE_AI_USAGE_PROJECT_ROOT;
  let stateRoot = null;
  if (override?.source === "state_root") {
    stateRoot = override.stateRoot;
  } else if (typeof ownerRoot === "string" && path.isAbsolute(ownerRoot)) {
    stateRoot = path.join(path.resolve(ownerRoot), "guild_hall", "state");
  } else if (override !== null) {
    stateRoot = override.stateRoot;
  }
  if (stateRoot === null) return null;
  return path.join(stateRoot, "operations", "team_ops_board", "antigravity_quota.last.json");
}

export function resolveAntigravityCliPath(env = process.env) {
  const localAppData = env?.LOCALAPPDATA;
  if (typeof localAppData !== "string" || !path.isAbsolute(localAppData)) return null;
  return path.join(path.resolve(localAppData), "agy", "bin", "agy.exe");
}

export function parseAntigravityProcessIds(tasklistCsv, { portOwnersOnly = false } = {}) {
  if (typeof tasklistCsv !== "string") return new Set();
  const allowed = portOwnersOnly ? ANTIGRAVITY_PORT_OWNER_EXECUTABLES : ANTIGRAVITY_APP_EXECUTABLES;
  const pids = new Set();
  for (const line of tasklistCsv.split("\n")) {
    const match = /^"([A-Za-z0-9_.-]+)","(\d+)"/u.exec(line.trim());
    if (match && allowed.has(match[1].toLowerCase())) pids.add(match[2]);
  }
  return pids;
}

async function agyProcessIds({ portOwnersOnly = false } = {}) {
  const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], {
    timeout: PROCESS_QUERY_TIMEOUT_MS,
    windowsHide: true,
  });
  return parseAntigravityProcessIds(stdout, { portOwnersOnly });
}

async function antigravityAppRunning() {
  return (await agyProcessIds()).size > 0;
}

async function candidatePorts() {
  const pids = await agyProcessIds({ portOwnersOnly: true });
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
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return parseAntigravityQuotaResponse(await response.json().catch(() => null));
}

export async function readAntigravityQuotaFromCli({
  env = process.env,
  nowMs = Date.now(),
  runCli = execFileAsync,
  statCli = lstat,
} = {}) {
  const cliPath = resolveAntigravityCliPath(env);
  if (cliPath === null) return null;
  const cliStat = await statCli(cliPath).catch(() => null);
  if (cliStat === null || !cliStat.isFile() || cliStat.isSymbolicLink()) return null;
  const cliEnvironment = {};
  for (const name of CLI_ENVIRONMENT_ALLOWLIST) {
    if (typeof env?.[name] === "string") cliEnvironment[name] = env[name];
  }
  const { stdout } = await runCli(
    cliPath,
    ["--print", "/usage", "--output-format", "text", "--print-timeout", "30s"],
    {
      env: cliEnvironment,
      maxBuffer: 16 * 1024,
      timeout: 40_000,
      windowsHide: true,
    },
  );
  return parseAntigravityUsageCliOutput(stdout, { nowMs });
}

function staleSnapshot(snapshot, nowMs) {
  return staleAntigravityQuotaSnapshot(snapshot, { nowMs });
}

export function createAntigravityQuotaReader({
  env = process.env,
  fetchImpl = fetch,
  listPorts = candidatePorts,
  ttlMs = DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS,
  cachePath = resolveAntigravityQuotaCachePath(env),
  now = Date.now,
  detectAppRunning = antigravityAppRunning,
  readCliQuota = () => readAntigravityQuotaFromCli({ env, nowMs: now() }),
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;
  let cacheChecked = false;
  let lastStatus = null;
  const liveRefreshEnabled = isAntigravityQuotaLiveRefreshEnabled(env);

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

  async function accept(groups, sourceKind = "antigravity_sanitized_loopback_receipt") {
    const snapshot = buildAntigravityQuotaSnapshot({
      groups,
      observedAtMs: now(),
      freshness: "current",
      sourceKind,
    });
    if (snapshot === null) {
      retainLastGoodAsStale();
      return;
    }
    lastGood = snapshot;
    lastStatus = null;
    cacheChecked = true;
    await persistCache(snapshot);
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
    const ports = await listPorts().catch(() => []);
    for (const port of ports) {
      const groups = await queryQuota(port, fetchImpl).catch(() => null);
      if (groups !== null) {
        await accept(groups);
        return;
      }
    }
    const appRunning = await detectAppRunning().catch(() => false);
    if (appRunning) {
      const cliGroups = await readCliQuota().catch(() => null);
      if (cliGroups !== null) {
        await accept(cliGroups, "antigravity_sanitized_cli_usage_receipt");
        return;
      }
    }
    lastStatus = buildAntigravityQuotaStatus({
      appRunning,
      observedAtMs: now(),
    });
    // App absence, local source failure, and malformed replies retain only a
    // timestamped STALE last-good result. They do not prove provider health.
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
      if (!isDirectLoopbackRequest(request)) {
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
