// antigravity-quota-adapter.mjs — 실행 중인 Antigravity language_server의 로컬 RPC
// (RetrieveUserQuotaSummary)에서 그룹별 잔여 쿼터를 읽어 loopback 전용
// GET /antigravity-quota.snapshot.json 으로 서빙한다. 포트는 고정 파일이 없어
// agy/language_server 프로세스의 LISTENING 포트를 열거해 응답하는 포트를 캐시한다.
// 읽기 전용 조회. 한도는 사용 시에만 소모되므로 앱이 꺼져도 마지막 성공 관측을
// 로컬 캐시(untracked state)로 유지 서빙한다 — observed_at으로 신선도를 판단한다.

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  ANTIGRAVITY_QUOTA_SCHEMA_VERSION,
  buildAntigravityQuotaSnapshot,
  parseAntigravityQuotaResponse,
} from "../core/antigravity-quota.mjs";

const execFileAsync = promisify(execFile);
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));

export const ANTIGRAVITY_QUOTA_SNAPSHOT_PATH = "/antigravity-quota.snapshot.json";
export const DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS = 120_000;
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

async function agyProcessIds() {
  const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], { timeout: 10_000, windowsHide: true });
  const pids = new Set();
  for (const line of stdout.split("\n")) {
    const match = /^"(agy\.exe|language_server\w*\.exe)","(\d+)"/u.exec(line.trim());
    if (match) pids.add(match[2]);
  }
  return pids;
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

function isPlausibleCachedSnapshot(value) {
  return typeof value === "object" && value !== null
    && value.schema_version === ANTIGRAVITY_QUOTA_SCHEMA_VERSION
    && typeof value.observed_at === "string" && Number.isFinite(Date.parse(value.observed_at))
    && Array.isArray(value.groups) && value.groups.length > 0;
}

export function createAntigravityQuotaReader({
  fetchImpl = fetch,
  listPorts = candidatePorts,
  ttlMs = DEFAULT_ANTIGRAVITY_QUOTA_TTL_MS,
  cachePath = DEFAULT_ANTIGRAVITY_QUOTA_CACHE_PATH,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;
  let knownPort = null;
  let cacheChecked = false;

  async function persistCache(snapshot) {
    if (cachePath === null) return;
    try {
      await mkdir(path.dirname(cachePath), { recursive: true });
      const temporary = `${cachePath}.tmp-${process.pid}`;
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await rename(temporary, cachePath);
    } catch {
      // 캐시는 편의 기능 — 저장 실패가 관측 서빙을 막지 않는다.
    }
  }

  async function loadCacheOnce() {
    if (cacheChecked || cachePath === null) return;
    cacheChecked = true;
    try {
      const parsed = JSON.parse(await readFile(cachePath, "utf8"));
      if (isPlausibleCachedSnapshot(parsed)) lastGood = parsed;
    } catch {
      // 캐시 없음/손상은 조용히 무시한다.
    }
  }

  function accept(groups) {
    lastGood = buildAntigravityQuotaSnapshot({ groups, observedAtMs: now() });
    cacheChecked = true;
    void persistCache(lastGood);
  }

  async function refresh() {
    // 이전에 응답한 포트를 먼저 시도하고, 실패하면 프로세스 포트를 재열거한다.
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
    // 앱이 꺼져 있으면 마지막 성공 관측(메모리, 없으면 디스크 캐시)을 유지한다.
    // 한도는 사용 시에만 소모되므로 과거 관측은 잔여를 과소평가하는 안전한 방향이다.
    if (lastGood === null) await loadCacheOnce();
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < ttlMs) return lastGood;
      if (inFlight === null) {
        lastAttemptAt = observedNow;
        const operation = refresh()
          .catch(() => {})
          .finally(() => {
            if (inFlight === operation) inFlight = null;
          });
        inFlight = operation;
      }
      await inFlight;
      return lastGood;
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
