// tongs-heartbeat-adapter.mjs — Tongs 하트비트 파일을 loopback 전용
// GET /tongs.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽는 것은 하나뿐이다: `<state root>/operations/tongs/heartbeat.json`.
// 그 파일은 Tongs lane 이 쓰고 이 어댑터는 절대 쓰지 않는다. 하트비트가 없으면
// `unknown`(회색)이고, 있는데 규격을 어기면 `unavailable`(관측된 고장)이다.
//
// 브라우저까지 가는 것: 상태 enum, 관측 시각, 나이(초), 신선도 boolean, 그리고
// 듣는 loopback 포트 번호. `pid` 는 형식만 검사하고 값은 버린다 — 프로세스 번호는
// 화면에서 답할 질문이 없고 lane 을 다시 만질 근거도 아니다.

import { readFile, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";

export const TONGS_SNAPSHOT_PATH = "/tongs.snapshot.json";
export const TONGS_PROJECTION_SCHEMA = "soulforge.team_ops_board.tongs_projection.v1";
export const TONGS_STATUS_VALUES = Object.freeze(["listening", "starting", "stopped"]);
export const DEFAULT_TONGS_TTL_MS = 30_000;
// 하트비트는 주기 신호다. 이 창을 넘으면 마지막 값을 지우지 않고 `stale` 로 낮춘다.
export const DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS = 900;

const MAX_BYTES = 16 * 1024;
const HEARTBEAT_REQUIRED_KEYS = Object.freeze(["status", "observed_at", "pid", "listen"]);
const HEARTBEAT_OPTIONAL_KEYS = Object.freeze(["schema"]);
// `127.0.0.1:4311`, `localhost:4311`, `[::1]:4311` 만 받는다. 바깥 주소는 규격 위반이다.
const LISTEN_RE = /^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/u;

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));

export function defaultTongsHeartbeatPath(env = process.env) {
  const stateRoot = resolveSoulforgeStateRoot(env, () => resolve(MODULE_ROOT, "../../../../../guild_hall/state"));
  return join(stateRoot, "operations", "tongs", "heartbeat.json");
}

function isLoopbackAddress(remoteAddress) {
  if (!remoteAddress) return false;
  return remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
}

function envelope({
  state, reason = null, status = null, observedAt = null,
  listenPort = null, ageSeconds = null, fresh = null, nowMs,
}) {
  return {
    schema_version: TONGS_PROJECTION_SCHEMA,
    state,
    reason,
    read_at: new Date(nowMs).toISOString(),
    status,
    observed_at: observedAt,
    listen_port: listenPort,
    age_seconds: ageSeconds,
    fresh,
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
  };
}

// 순수 함수: 파일 바이트 -> 투영.
export function projectTongsHeartbeat(raw, {
  nowMs = Date.now(),
  freshnessWindowSeconds = DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS,
} = {}) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BYTES) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_unreadable", nowMs });
  }
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_unparsable", nowMs });
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_not_object", nowMs });
  }
  const keys = Object.keys(document);
  const allowed = new Set([...HEARTBEAT_REQUIRED_KEYS, ...HEARTBEAT_OPTIONAL_KEYS]);
  if (HEARTBEAT_REQUIRED_KEYS.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_keys_unexpected", nowMs });
  }
  if (!TONGS_STATUS_VALUES.includes(document.status)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_status_unexpected", nowMs });
  }
  const observedMs = typeof document.observed_at === "string" ? Date.parse(document.observed_at) : NaN;
  if (!Number.isFinite(observedMs)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_observed_at_invalid", nowMs });
  }
  // pid 는 형식만 본다. 값은 버린다.
  if (!Number.isSafeInteger(document.pid) || document.pid <= 0) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_pid_invalid", nowMs });
  }
  if (typeof document.listen !== "string") {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_listen_invalid", nowMs });
  }
  const listenMatch = LISTEN_RE.exec(document.listen);
  const listenPort = listenMatch === null ? null : Number(listenMatch[1]);
  if (listenPort === null || listenPort < 1024 || listenPort > 65_535) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_listen_invalid", nowMs });
  }
  const ageSeconds = Math.round((nowMs - observedMs) / 1000);
  // 미래 시각은 시계 어긋남이다. 신선하다고 주장하지 않는다.
  const fresh = ageSeconds >= 0 && ageSeconds <= freshnessWindowSeconds;
  return envelope({
    state: "ready",
    status: document.status,
    observedAt: new Date(observedMs).toISOString(),
    listenPort,
    ageSeconds,
    fresh,
    nowMs,
  });
}

export function createTongsHeartbeatReader({
  heartbeatPath = null,
  env = process.env,
  ttlMs = DEFAULT_TONGS_TTL_MS,
  freshnessWindowSeconds = DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS,
  now = Date.now,
  readFileImpl = readFile,
  lstatImpl = lstat,
} = {}) {
  const path = heartbeatPath ?? defaultTongsHeartbeatPath(env);
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  async function compute() {
    let info;
    try {
      info = await lstatImpl(path);
    } catch {
      return envelope({ state: "unknown", reason: "tongs_heartbeat_absent", nowMs: now() });
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) {
      return envelope({ state: "unavailable", reason: "tongs_heartbeat_unreadable", nowMs: now() });
    }
    let raw;
    try {
      raw = await readFileImpl(path, "utf8");
    } catch {
      return envelope({ state: "unavailable", reason: "tongs_heartbeat_unreadable", nowMs: now() });
    }
    return projectTongsHeartbeat(raw, { nowMs: now(), freshnessWindowSeconds });
  }

  return {
    async readSnapshot() {
      const observedNow = now();
      if (cached !== null && cachedAt !== null && observedNow - cachedAt < ttlMs) return cached;
      if (inFlight === null) {
        const operation = compute().then((projection) => {
          cached = projection;
          cachedAt = now();
          return projection;
        }, () => {
          const projection = envelope({ state: "unavailable", reason: "tongs_heartbeat_unreadable", nowMs: now() });
          cached = projection;
          cachedAt = now();
          return projection;
        }).finally(() => {
          if (inFlight === operation) inFlight = null;
        });
        inFlight = operation;
      }
      return inFlight;
    },
  };
}

export function createTongsHeartbeatAdapterPlugin(options = {}) {
  const reader = createTongsHeartbeatReader(options);
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
      if (url.pathname !== TONGS_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket?.remoteAddress)) {
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
      void reader.readSnapshot().then(respond, () => respond(
        envelope({ state: "unavailable", reason: "tongs_heartbeat_unreadable", nowMs: Date.now() }),
      ));
    });
  };
  return {
    name: "soulforge-tongs-heartbeat-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
