// tongs-heartbeat-adapter.mjs — Tongs 하트비트 파일을 loopback 전용
// GET /tongs.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽는 것은 하나뿐이다: `<tongs state root>/operations/tongs/erp_mcp.heartbeat.v1.json`
// (경로 조각과 파일명은 이 어댑터가 다시 짓지 않고
// guild_hall/shared/tongs_heartbeat_contract.mjs — Tongs lane 과 이 어댑터가
// 함께 가져다 쓰는 정본 계약 모듈 — 에서 그대로 가져온다. Vigil(이 앱)은 빌드된
// source lane에서 실행되고 그 lane 은 dev-erp-mcp 의 파일을 싣지 않으므로, 이
// 어댑터는 Tongs lane 자신의 모듈(ui-workspace/apps/dev-erp-mcp/ops/
// tongs_lane_support.mjs)을 직접 import 하지 않는다 — 계약은 두 앱이 함께
// import 하는 guild_hall/shared 에만 둔다). 그 파일은 Tongs lane 이 쓰고 이
// 어댑터는 절대 쓰지 않는다. 하트비트가 없으면 `unknown`(회색)이고, 있는데
// 규격을 어기면 `unavailable`(관측된 고장)이다.
//
// 브라우저까지 가는 것: 상태 enum, 관측 시각, 나이(초), 신선도 boolean, 그리고
// 듣는 loopback 포트 번호. `pid` 는 형식만 검사하고 값은 버린다 — 프로세스 번호는
// 화면에서 답할 질문이 없고 lane 을 다시 만질 근거도 아니다.
//
// 상태 root: Tongs lane 의 등록 파라미터 `-StateRoot`(예: 운영 control root)와
// 이 Board 의 일반 SOULFORGE_STATE_ROOT/SOULFORGE_OWNER_ROOT 는 서로 다른 값을
// 가리켜도 되는 독립된 설정 채널이다(docs/TONGS_LANE_RUNBOOK_V0.md §3). 이
// 어댑터는 그래서 둘이 우연히 같다고 가정하지 않는다 — SOULFORGE_TONGS_STATE_ROOT
// 가 명시되면 그 값을 최우선으로 쓰고(값이 있는데 절대·존재 디렉터리가 아니면
// fail-closed 로 거부, 조용한 대체 없음), 없으면 이 Board 의 다른 상태 파일과
// 같은 일반 우선순위(SOULFORGE_STATE_ROOT > SOULFORGE_OWNER_ROOT > 이 checkout)
// 로 내려간다.

import { readFile, lstat } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { resolveSoulforgeStateRoot, validateOverride } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  HEARTBEAT_FIELDS,
  TONGS_ALWAYS_MANAGED_SERVICE,
  TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
  TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES,
  tongsHeartbeatPath,
} from "../../../../../guild_hall/shared/tongs_heartbeat_contract.mjs";

export const TONGS_SNAPSHOT_PATH = "/tongs.snapshot.json";
export const TONGS_PROJECTION_SCHEMA = "soulforge.team_ops_board.tongs_projection.v1";
// Tongs lane 자신이 정의한 하트비트 상태 어휘를 그대로 재노출한다(예전에는 이
// 어댑터가 독자적으로 ["listening","starting","stopped"] 를 추측해 lane 이 실제
// 로 절대 쓰지 않는 값이었다).
export const TONGS_STATUS_VALUES = TONGS_HEARTBEAT_STATUSES;
export const DEFAULT_TONGS_TTL_MS = 30_000;
// 하트비트는 주기 신호다. 이 창을 넘으면 마지막 값을 지우지 않고 `stale` 로
// 낮춘다. Tongs lane 자신의 재기동 판단 창(TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
// 등록된 예약작업 5분 반복의 2.4배)과 같은 값을 초 단위로 쓴다 — 예전에는 이
// 어댑터가 독자적으로 900 을 추측해 lane 의 실제 재기동 판단 창(720)과 어긋나
// 있었다.
export const DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS = TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS / 1000;
export const TONGS_STATE_ROOT_ENV = "SOULFORGE_TONGS_STATE_ROOT";

const MAX_BYTES = 16 * 1024;
// `127.0.0.1:4311`, `localhost:4311`, `[::1]:4311` 만 받는다. 바깥 주소는 규격 위반이다.
const LISTEN_RE = /^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/u;

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));

function isSet(value) {
  return value !== undefined && value !== null;
}

// SOULFORGE_TONGS_STATE_ROOT(명시, fail-closed) > SOULFORGE_STATE_ROOT >
// SOULFORGE_OWNER_ROOT > 이 checkout 의 guild_hall/state. 앞 항이 설정돼
// 있는데 절대 경로가 아니거나 존재하는 디렉터리가 아니면(빈 값 포함) 조용히
// 다음 항으로 넘어가지 않고 SoulforgeRootOverrideError 를 던진다 — 이미
// SOULFORGE_STATE_ROOT/SOULFORGE_OWNER_ROOT 가 같은 파일에서 쓰는 것과 동일한
// 규칙이다(guild_hall/shared/soulforge_state_root.mjs).
export function resolveTongsStateRoot(env = process.env) {
  const explicit = env?.[TONGS_STATE_ROOT_ENV];
  if (isSet(explicit)) {
    return validateOverride(TONGS_STATE_ROOT_ENV, explicit, statSync, process.platform);
  }
  return resolveSoulforgeStateRoot(env, () => resolve(MODULE_ROOT, "../../../../../guild_hall/state"));
}

export function defaultTongsHeartbeatPath(env = process.env) {
  const stateRoot = resolveTongsStateRoot(env);
  return tongsHeartbeatPath(stateRoot, TONGS_ALWAYS_MANAGED_SERVICE);
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
  // 허용 key 집합은 Tongs lane 이 실제로 쓰는 다섯 필드 그대로다(HEARTBEAT_FIELDS,
  // tongs_lane_support.mjs 소유) — 이 어댑터가 별도로 짓지 않는다.
  const keys = Object.keys(document);
  const allowed = new Set(HEARTBEAT_FIELDS);
  if (HEARTBEAT_FIELDS.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_keys_unexpected", nowMs });
  }
  if (document.schema_version !== TONGS_HEARTBEAT_SCHEMA) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_schema_unexpected", nowMs });
  }
  if (!TONGS_STATUS_VALUES.includes(document.status)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_status_unexpected", nowMs });
  }
  const observedMs = typeof document.observed_at === "string" ? Date.parse(document.observed_at) : NaN;
  if (!Number.isFinite(observedMs)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_observed_at_invalid", nowMs });
  }
  // pid 는 형식만 본다. 값은 버린다. "ready" 가 아닌 상태는 null 일 수 있다
  // (tongs_lane_support.mjs 의 isValidTongsHeartbeatRecord 와 같은 규칙).
  const pidOk = document.pid === null || (Number.isSafeInteger(document.pid) && document.pid > 0);
  if (!pidOk) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_pid_invalid", nowMs });
  }
  if (document.listen !== null && typeof document.listen !== "string") {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_listen_invalid", nowMs });
  }
  let listenPort = null;
  if (typeof document.listen === "string") {
    const listenMatch = LISTEN_RE.exec(document.listen);
    listenPort = listenMatch === null ? null : Number(listenMatch[1]);
    if (listenPort === null || listenPort < 1024 || listenPort > 65_535) {
      return envelope({ state: "unavailable", reason: "tongs_heartbeat_listen_invalid", nowMs });
    }
  }
  // "ready" 는 pid·listen 이 반드시 채워져 있어야 하는 유일한 상태다(그 외
  // 상태는 둘 다 null 일 수 있다) — 같은 규칙을 isValidTongsHeartbeatRecord 도
  // 강제한다.
  if (document.status === "ready" && (document.pid === null || document.listen === null)) {
    return envelope({ state: "unavailable", reason: "tongs_heartbeat_ready_missing_pid_or_listen", nowMs });
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
