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
import { isTeamOpsBoardClaudeQuotaReadEnabled } from "../core/team-ops-board-read-only-pilot.mjs";

export const PROVIDER_LIMITS_SNAPSHOT_PATH = "/provider-limits.snapshot.json";
export const DEFAULT_PROVIDER_LIMITS_TTL_MS = 60_000;
// OAuth usage 엔드포인트는 호출 빈도 제한(429)이 있어 별도 주기로만 재조회한다.
// 진행 중 세션이 실시간으로 소모하므로 표시 지연을 줄이기 위해 2분으로 운용한다.
export const DEFAULT_CLAUDE_LIMITS_REFRESH_MS = 120_000;
export const DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS = 300_000;
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

function safeClaudeReadResult(outcome, claude = null) {
  return { outcome, claude };
}

export async function requestClaudeLimits({ accessToken, fetchImpl, timeoutMs }) {
  try {
    const response = await fetchImpl("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 401 || response.status === 403) return safeClaudeReadResult("auth_failed");
    if (response.status === 429) return safeClaudeReadResult("rate_limited");
    if (!response.ok) return safeClaudeReadResult("invalid_response");
    const claude = normalizeClaudeOauthUsage(await response.json());
    return claude === null
      ? safeClaudeReadResult("invalid_response")
      : safeClaudeReadResult("success", claude);
  } catch (error) {
    return error?.name === "TimeoutError" || error?.name === "AbortError"
      ? safeClaudeReadResult("timeout")
      : safeClaudeReadResult("invalid_response");
  }
}

async function readClaudeLimits({ credentialsPath, fetchImpl, timeoutMs }) {
  let token;
  try {
    token = await readClaudeOauthToken(credentialsPath);
  } catch {
    return safeClaudeReadResult("credential_unavailable");
  }
  if (token === null) return safeClaudeReadResult("credential_unavailable");
  return requestClaudeLimits({ accessToken: token, fetchImpl, timeoutMs });
}

function normalizeClaudeReadResult(value) {
  if (value?.outcome === "success") {
    const claude = buildProviderLimitsSnapshot({ claude: value.claude ?? null }).claude;
    return claude === null ? safeClaudeReadResult("invalid_response") : safeClaudeReadResult("success", claude);
  }
  if ([
    "credential_unavailable",
    "auth_failed",
    "rate_limited",
    "timeout",
    "invalid_response",
  ].includes(value?.outcome)) return safeClaudeReadResult(value.outcome);
  // Preserve the former injected-reader contract for local callers while the
  // runtime reader itself always returns the classified result above.
  if (typeof value === "object" && value !== null) {
    const claude = buildProviderLimitsSnapshot({ claude: value }).claude;
    return claude === null ? safeClaudeReadResult("invalid_response") : safeClaudeReadResult("success", claude);
  }
  return safeClaudeReadResult("invalid_response");
}

function buildClaudeStatus({ enabled, outcome, attemptedAtMs, lastSuccessAtMs, observedAtMs, freshnessMs }) {
  if (!enabled) {
    return {
      state: "disabled",
      outcome: "disabled",
      attempted_at: null,
      last_success_at: null,
      freshness: "unknown",
    };
  }
  if (outcome === null || attemptedAtMs === null) {
    return {
      state: "unknown",
      outcome: null,
      attempted_at: null,
      last_success_at: null,
      freshness: "unknown",
    };
  }
  const freshness = lastSuccessAtMs === null
    ? "unknown"
    : observedAtMs - lastSuccessAtMs < freshnessMs ? "current" : "stale";
  const state = outcome === "success"
    ? freshness === "current" ? "ready" : "stale"
    : freshness === "stale" ? "stale" : "error";
  return {
    state,
    outcome,
    attempted_at: new Date(attemptedAtMs).toISOString(),
    last_success_at: lastSuccessAtMs === null ? null : new Date(lastSuccessAtMs).toISOString(),
    freshness,
  };
}

export function createProviderLimitsReader({
  env = process.env,
  sessionsRoot = defaultCodexSessionsRoot(env),
  credentialsPath = path.join(os.homedir(), ".claude", ".credentials.json"),
  fetchImpl = fetch,
  ttlMs = DEFAULT_PROVIDER_LIMITS_TTL_MS,
  claudeRefreshMs = DEFAULT_CLAUDE_LIMITS_REFRESH_MS,
  claudeFreshnessMs = DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS,
  fetchTimeoutMs = DEFAULT_PROVIDER_LIMITS_FETCH_TIMEOUT_MS,
  readCodexLimitsImpl = readCodexLimits,
  readClaudeLimitsImpl = readClaudeLimits,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  // 공급자별 last-good을 따로 유지 — 한쪽 실패(예: OAuth 429)가 다른 쪽 관측을 지우지 않는다.
  let lastCodex = null;
  let lastClaude = null;
  let lastClaudeAttemptAt = null;
  let lastClaudeOutcome = null;
  let lastClaudeSuccessAt = null;
  let lastSnapshot = null;
  const claudeReadEnabled = isTeamOpsBoardClaudeQuotaReadEnabled(env);
  const effectiveClaudeRefreshMs = Math.max(DEFAULT_CLAUDE_LIMITS_REFRESH_MS, claudeRefreshMs);
  const effectiveClaudeFreshnessMs = Math.max(DEFAULT_CLAUDE_LIMITS_FRESHNESS_MS, claudeFreshnessMs);

  async function refresh() {
    const codex = await readCodexLimitsImpl(sessionsRoot).catch(() => null);
    if (codex !== null) lastCodex = codex;
    const observedNow = now();
    if (claudeReadEnabled && (lastClaudeAttemptAt === null || observedNow - lastClaudeAttemptAt >= effectiveClaudeRefreshMs)) {
      lastClaudeAttemptAt = observedNow;
      const readResult = normalizeClaudeReadResult(
        await readClaudeLimitsImpl({ credentialsPath, fetchImpl, timeoutMs: fetchTimeoutMs })
          .catch(() => safeClaudeReadResult("invalid_response")),
      );
      lastClaudeOutcome = readResult.outcome;
      if (readResult.outcome === "success") {
        lastClaudeSuccessAt = observedNow;
        lastClaude = { ...readResult.claude, observed_at: new Date(observedNow).toISOString() };
      }
    }
    const snapshotNow = now();
    lastSnapshot = buildProviderLimitsSnapshot({
      codex: lastCodex,
      claude: lastClaude,
      claudeStatus: buildClaudeStatus({
        enabled: claudeReadEnabled,
        outcome: lastClaudeOutcome,
        attemptedAtMs: lastClaudeAttemptAt,
        lastSuccessAtMs: lastClaudeSuccessAt,
        observedAtMs: snapshotNow,
        freshnessMs: effectiveClaudeFreshnessMs,
      }),
      observedAtMs: snapshotNow,
    });
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < ttlMs) return lastSnapshot;
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
      return lastSnapshot;
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
