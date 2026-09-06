// antigravity-usage-adapter.mjs — Antigravity IDE state.vscdb의 잔여 크레딧 스냅샷을 read-only로
// 읽어 loopback 전용 GET /antigravity-usage.snapshot.json 으로 서빙하는 Vite dev/preview 플러그인.
// DB는 read-only(mode=ro)로 연다 — IDE 실행 중 WAL 내용을 보기 위해 immutable은 쓰지 않는다
// (쓰기 없음). 60초 TTL로 재조회하며 실패 시 null을 낸다.

import path from "node:path";
import { promises as fsPromises } from "node:fs";

import {
  buildAntigravityUsageSnapshot,
  decodeModelCredits,
} from "../core/antigravity-usage.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export const ANTIGRAVITY_USAGE_SNAPSHOT_PATH = "/antigravity-usage.snapshot.json";
export const ANTIGRAVITY_STATE_DB_ENV = "TEAM_OPS_BOARD_ANTIGRAVITY_STATE_DB";
export const DEFAULT_ANTIGRAVITY_USAGE_REFRESH_TTL_MS = 60_000;

const MODEL_CREDITS_ITEM_KEY = "antigravityUnifiedStateSync.modelCredits";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

let sqliteModulePromise = null;

function loadSqliteModule() {
  if (sqliteModulePromise === null) {
    sqliteModulePromise = import("node:sqlite");
  }
  return sqliteModulePromise;
}

export function resolveAntigravityStateDbPath(env = process.env) {
  const override = env[ANTIGRAVITY_STATE_DB_ENV];
  if (typeof override === "string" && override.trim() !== "") return override;
  return path.join(env.APPDATA ?? "", "Antigravity IDE", "User", "globalStorage", "state.vscdb");
}

function toReadOnlyUri(dbPath) {
  // Windows 역슬래시 경로를 SQLite file: URI 형태로 정규화한다.
  return `file:${dbPath.split(path.sep).join("/")}?mode=ro`;
}

function rawValueToString(raw) {
  if (typeof raw === "string") return raw;
  if (raw instanceof Uint8Array) {
    try {
      return UTF8_DECODER.decode(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function createAntigravityUsageReader({
  dbPath = resolveAntigravityStateDbPath(),
  refreshTtlMs = DEFAULT_ANTIGRAVITY_USAGE_REFRESH_TTL_MS,
  now = Date.now,
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastResult = null;

  async function readOnce(nowMs) {
    const stats = await fsPromises.stat(dbPath);
    const { DatabaseSync } = await loadSqliteModule();
    let db = null;
    let raw;
    try {
      db = new DatabaseSync(toReadOnlyUri(dbPath), { readOnly: true });
      const row = db
        .prepare("SELECT value FROM ItemTable WHERE key = ?")
        .get(MODEL_CREDITS_ITEM_KEY);
      raw = row === undefined ? undefined : row.value;
    } finally {
      if (db !== null) {
        try {
          db.close();
        } catch {
          // close 실패는 무시한다(read-only 핸들).
        }
      }
    }
    const encoded = rawValueToString(raw);
    if (encoded === null) return null;
    const credits = decodeModelCredits(encoded);
    if (credits === null) return null;
    return buildAntigravityUsageSnapshot({ mtimeMs: stats.mtimeMs, credits, nowMs });
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (lastAttemptAt !== null && observedNow - lastAttemptAt < refreshTtlMs) {
        if (inFlight !== null) await inFlight;
        return lastResult;
      }
      if (inFlight === null) {
        lastAttemptAt = observedNow;
        const operation = readOnce(observedNow)
          .then(
            (snapshot) => {
              lastResult = snapshot;
            },
            () => {
              // DB 부재·잠김·파싱 실패는 null 스냅샷으로 강등한다(500 금지).
              lastResult = null;
            },
          )
          .finally(() => {
            if (inFlight === operation) inFlight = null;
          });
        inFlight = operation;
      }
      await inFlight;
      return lastResult;
    },
  };
}

export function createAntigravityUsageAdapterPlugin(options = {}) {
  const reader = createAntigravityUsageReader(options);
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
      if (url.pathname !== ANTIGRAVITY_USAGE_SNAPSHOT_PATH) {
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
      reader.readSnapshot().then(respond, () => respond(null));
    });
  };
  return {
    name: "soulforge-antigravity-usage-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
