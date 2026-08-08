// provider-limits-adapter.mjs — Codex(최신 세션 텔레메트리)·Claude(OAuth usage 엔드포인트)의
// 공식 한도 사용률을 loopback 전용 GET /provider-limits.snapshot.json 으로 서빙한다.
// 자격증명 값은 메모리에서만 사용하고 어떤 경로로도 로그·응답에 싣지 않는다.

import { readdir, readFile, stat, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildProviderLimitsSnapshot,
  normalizeClaudeOauthUsage,
  parseCodexRateLimitsFromJsonlText,
} from "../core/provider-limits.mjs";

export const PROVIDER_LIMITS_SNAPSHOT_PATH = "/provider-limits.snapshot.json";
export const DEFAULT_PROVIDER_LIMITS_TTL_MS = 60_000;
export const DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS = 6_000;
const CODEX_TAIL_BYTES = 262_144;

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function defaultCodexSessionsRoot(env = process.env) {
  const home = typeof env.CODEX_HOME === "string" && env.CODEX_HOME.trim()
    ? env.CODEX_HOME.trim()
    : path.join(os.homedir(), ".codex");
  return path.join(home, "sessions");
}

async function latestNumericChild(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(right) - Number(left));
  return names.map((name) => path.join(root, name));
}

// sessions/<yyyy>/<mm>/<dd> 달력 트리를 최신부터 걸어 최근 rollout 파일을 찾는다.
async function newestSessionFile(sessionsRoot, maxDays = 4) {
  let visitedDays = 0;
  for (const yearDir of await latestNumericChild(sessionsRoot)) {
    for (const monthDir of await latestNumericChild(yearDir)) {
      for (const dayDir of await latestNumericChild(monthDir)) {
        visitedDays += 1;
        const entries = await readdir(dayDir, { withFileTypes: true });
        const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
        let newest = null;
        for (const file of files) {
          const fullPath = path.join(dayDir, file.name);
          const stats = await stat(fullPath).catch(() => null);
          if (stats === null) continue;
          if (newest === null || stats.mtimeMs > newest.mtimeMs) newest = { path: fullPath, mtimeMs: stats.mtimeMs };
        }
        if (newest !== null) return newest.path;
        if (visitedDays >= maxDays) return null;
      }
    }
  }
  return null;
}

async function readTail(filePath, tailBytes) {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - tailBytes);
    const length = size - start;
    if (length <= 0) return "";
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readCodexLimits(sessionsRoot) {
  const file = await newestSessionFile(sessionsRoot);
  if (file === null) return null;
  return parseCodexRateLimitsFromJsonlText(await readTail(file, CODEX_TAIL_BYTES));
}

async function readClaudeOauthToken(credentialsPath) {
  const raw = JSON.parse(await readFile(credentialsPath, "utf8"));
  const token = raw?.claudeAiOauth?.accessToken ?? raw?.access_token ?? null;
  return typeof token === "string" && token.length > 0 ? token : null;
}

async function readClaudeLimits({ credentialsPath, fetchImpl, timeoutMs }) {
  const token = await readClaudeOauthToken(credentialsPath);
  if (token === null) return null;
  const response = await fetchImpl("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return normalizeClaudeOauthUsage(await response.json());
}

export function createProviderLimitsReader({
  env = process.env,
  sessionsRoot = defaultCodexSessionsRoot(env),
  credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json"),
  fetchImpl = fetch,
  ttlMs = DEFAULT_PROVIDER_LIMITS_TTL_MS,
  fetchTimeoutMs = DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastGood = null;

  async function refresh() {
    const [codex, claude] = await Promise.all([
      readCodexLimits(sessionsRoot).catch(() => null),
      readClaudeLimits({ credentialsPath, fetchImpl, timeoutMs: fetchTimeoutMs }).catch(() => null),
    ]);
    if (codex === null && claude === null) return;
    lastGood = buildProviderLimitsSnapshot({
      codex,
      claude,
      observedAtMs: now(),
    });
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

export function createProviderLimitsAdapterPlugin(options = {}) {
  const reader = createProviderLimitsReader(options);
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
      if (url.pathname !== PROVIDER_LIMITS_SNAPSHOT_PATH) {
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
    name: "soulforge-provider-limits-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
