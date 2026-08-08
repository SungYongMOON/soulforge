// claude-usage-adapter.mjs — ~/.claude/projects 세션 전사(jsonl)의 usage 라인을 증분 스캔해
// 집계 숫자·모델 id·플랜 tier만 loopback 전용 GET /claude-usage.snapshot.json 으로 서빙하는
// Vite dev/preview 플러그인. 프롬프트·경로·세션 id는 파싱 단계에서 버려지고 서빙 전 프라이버시 가드로 재차 차단한다.

import os from "node:os";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import process from "node:process";

import {
  buildClaudeUsageSnapshot,
  guardClaudeUsagePrivacy,
  parseClaudeUsageLine,
} from "../core/claude-usage.mjs";

export const CLAUDE_USAGE_SNAPSHOT_PATH = "/claude-usage.snapshot.json";
export const DEFAULT_CLAUDE_USAGE_REFRESH_DEBOUNCE_MS = 30_000;
export const DEFAULT_CLAUDE_USAGE_RETENTION_MS = 8 * 86_400_000;
export const DEFAULT_CLAUDE_USAGE_MAX_RECORDS = 200_000;

const READ_CHUNK_BYTES = 1_048_576;
const USAGE_LINE_PREFILTER = '"usage"';

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function defaultProjectsRoot() {
  return process.env.TEAM_OPS_BOARD_CLAUDE_PROJECTS_ROOT
    || path.join(os.homedir(), ".claude", "projects");
}

function defaultClaudeConfigPath() {
  return path.join(os.homedir(), ".claude.json");
}

export function createClaudeUsageCollector({
  projectsRoot = defaultProjectsRoot(),
  claudeConfigPath = defaultClaudeConfigPath(),
  refreshDebounceMs = DEFAULT_CLAUDE_USAGE_REFRESH_DEBOUNCE_MS,
  retentionMs = DEFAULT_CLAUDE_USAGE_RETENTION_MS,
  maxRecords = DEFAULT_CLAUDE_USAGE_MAX_RECORDS,
  now = Date.now,
} = {}) {
  /** @type {Map<string, {offset: number, remainder: string}>} */
  const fileStates = new Map();
  /** @type {Map<string, ReturnType<typeof parseClaudeUsageLine>>} */
  const records = new Map();
  let planTier = null;
  let inFlight = null;
  let lastAttemptAt = null;
  let hasScanned = false;
  let lastGoodSnapshot = null;

  function ingestLine(line, cutoffMs) {
    if (!line.includes(USAGE_LINE_PREFILTER)) return;
    const record = parseClaudeUsageLine(line);
    if (record === null) return;
    const ms = Date.parse(record.timestamp);
    if (Number.isNaN(ms) || ms < cutoffMs) return;
    if (!records.has(record.message_id)) records.set(record.message_id, record);
  }

  async function ingestFile(filePath, size, cutoffMs) {
    let state = fileStates.get(filePath);
    if (state === undefined) {
      state = { offset: 0, remainder: "" };
      fileStates.set(filePath, state);
    }
    if (size < state.offset) {
      // truncate/rotation: 처음부터 다시 읽는다(레코드는 message_id dedup으로 이중 집계 방지).
      state.offset = 0;
      state.remainder = "";
    }
    if (size === state.offset) return;
    let handle;
    try {
      handle = await fsPromises.open(filePath, "r");
    } catch {
      return;
    }
    try {
      const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const decoder = new StringDecoder("utf8");
      let position = state.offset;
      while (position < size) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(READ_CHUNK_BYTES, size - position),
          position,
        );
        if (bytesRead <= 0) break;
        position += bytesRead;
        const text = state.remainder + decoder.write(buffer.subarray(0, bytesRead));
        const lines = text.split("\n");
        state.remainder = lines.pop() ?? "";
        for (const line of lines) ingestLine(line, cutoffMs);
      }
      state.offset = position;
    } catch {
      // 부분 실패는 다음 refresh에서 재시도한다.
    } finally {
      await handle.close().catch(() => {});
    }
  }

  function pruneRecords(cutoffMs) {
    for (const [key, record] of records) {
      const ms = Date.parse(record.timestamp);
      if (Number.isNaN(ms) || ms < cutoffMs) records.delete(key);
    }
    if (records.size > maxRecords) {
      const overflow = records.size - maxRecords;
      const oldest = [...records.entries()]
        .sort((a, b) => Date.parse(a[1].timestamp) - Date.parse(b[1].timestamp))
        .slice(0, overflow);
      for (const [key] of oldest) records.delete(key);
    }
  }

  async function scanTranscripts() {
    const cutoffMs = now() - retentionMs;
    let projectEntries;
    try {
      projectEntries = await fsPromises.readdir(projectsRoot, { withFileTypes: true });
    } catch {
      return;
    }
    const seenFiles = new Set();
    for (const projectEntry of projectEntries) {
      if (!projectEntry.isDirectory()) continue;
      const projectDir = path.join(projectsRoot, projectEntry.name);
      let fileEntries;
      try {
        fileEntries = await fsPromises.readdir(projectDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const fileEntry of fileEntries) {
        if (!fileEntry.isFile() || !fileEntry.name.endsWith(".jsonl")) continue;
        const filePath = path.join(projectDir, fileEntry.name);
        let stat;
        try {
          stat = await fsPromises.stat(filePath);
        } catch {
          continue;
        }
        if (stat.mtimeMs < cutoffMs) {
          fileStates.delete(filePath);
          continue;
        }
        seenFiles.add(filePath);
        await ingestFile(filePath, stat.size, cutoffMs);
      }
    }
    for (const knownPath of fileStates.keys()) {
      if (!seenFiles.has(knownPath)) fileStates.delete(knownPath);
    }
    pruneRecords(cutoffMs);
  }

  async function readPlanTier() {
    try {
      const parsed = JSON.parse(await fsPromises.readFile(claudeConfigPath, "utf8"));
      const account = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        && parsed.oauthAccount !== null && typeof parsed.oauthAccount === "object"
        ? parsed.oauthAccount
        : null;
      if (account === null) return null;
      return {
        user_rate_limit_tier: typeof account.userRateLimitTier === "string"
          ? account.userRateLimitTier
          : null,
        organization_rate_limit_tier: typeof account.organizationRateLimitTier === "string"
          ? account.organizationRateLimitTier
          : null,
      };
    } catch {
      return null;
    }
  }

  function beginRefresh() {
    if (inFlight !== null) return inFlight;
    lastAttemptAt = now();
    const operation = Promise.resolve()
      .then(async () => {
        await scanTranscripts();
        planTier = await readPlanTier();
        hasScanned = true;
      })
      .catch(() => {})
      .finally(() => {
        if (inFlight === operation) inFlight = null;
      });
    inFlight = operation;
    return operation;
  }

  function buildServableSnapshot() {
    try {
      const snapshot = {
        ...buildClaudeUsageSnapshot([...records.values()], { referenceMs: now() }),
        observed_at: new Date(now()).toISOString(),
        plan: planTier,
      };
      const guarded = guardClaudeUsagePrivacy(snapshot);
      if (guarded === null) return null;
      lastGoodSnapshot = guarded;
      return guarded;
    } catch {
      return lastGoodSnapshot;
    }
  }

  return {
    async readSnapshot({ force = false } = {}) {
      const observedNow = now();
      const due = force || lastAttemptAt === null || observedNow - lastAttemptAt >= refreshDebounceMs;
      if (due) beginRefresh();
      // 첫 스캔 완료 전에는 기다리고, 이후에는 진행 중이어도 마지막 상태로 즉시 응답한다.
      if (!hasScanned && inFlight !== null) await inFlight;
      return buildServableSnapshot();
    },
  };
}

export function createClaudeUsageAdapterPlugin(options = {}) {
  const collector = createClaudeUsageCollector(options);
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
      if (url.pathname !== CLAUDE_USAGE_SNAPSHOT_PATH) {
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
      void collector.readSnapshot().then(respond, () => respond(null));
    });
  };
  return {
    name: "soulforge-claude-usage-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
