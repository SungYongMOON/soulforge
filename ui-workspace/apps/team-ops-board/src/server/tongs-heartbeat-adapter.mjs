// tongs-heartbeat-adapter.mjs — Tongs 하트비트 파일을 loopback 전용
// GET /tongs.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽는 것은 Tongs lane 이 실제로 쓰는 서비스별 파일 둘뿐이다.
//
//   <state root>/operations/tongs/erp_mcp.heartbeat.v1.json      개인 ERP MCP (server.mjs, 기본 127.0.0.1:4311)
//   <state root>/operations/tongs/ingress_mcp.heartbeat.v1.json  HPP evidence ingress MCP (설정된 경우에만)
//
// 파일 이름·레코드 모양·status 어휘는 guild_hall/shared/tongs_heartbeat_contract.mjs
// 가 소유하고, 쓰는 쪽(ui-workspace/apps/dev-erp-mcp/ops/tongs_lane_support.mjs)과
// 이 어댑터가 같은 export 를 import 한다. 2026-09-06 이전에는 두 앱이 각자 사본을
// 들고 있었고 파일 이름·키·상태 어휘·null 허용 네 가지가 전부 달라, 살아 있는 lane 도
// 영원히 `tongs_heartbeat_absent` 로 투영됐다. 그 파일들은 Tongs lane 이 쓰고 이
// 어댑터는 절대 쓰지 않는다. 하트비트가 없으면 `unknown`(회색)이고, 있는데 규격을
// 어기면 `unavailable`(관측된 고장)이다.
//
// state root 는 vite.config.ts 가 넘기는 값(SOULFORGE_STATE_ROOT > SOULFORGE_OWNER_ROOT
// > 이 checkout 의 guild_hall/state)이고, Tongs lane 의 -StateRoot 는 같은 디렉터리여야
// 한다 — lane 의 `preflight --state-root` 가 그 일치를 등록 전에 확인한다.
//
// 브라우저까지 가는 것: 서비스별 상태 enum, 관측 시각, 나이(초), 신선도 boolean, 듣는
// loopback 포트 번호. 최상위 status/observed_at/listen_port/age_seconds/fresh 는 4311 을
// 답하는 erp_mcp 의 것이고 `services` 에 두 서비스가 따로 실린다. `pid` 는 형식만
// 검사하고 값은 버린다 — 프로세스 번호는 화면에서 답할 질문이 없고 lane 을 다시 만질
// 근거도 아니다.

import { readFile, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import {
  TONGS_HEARTBEAT_STATUSES,
  TONGS_PRIMARY_SERVICE,
  TONGS_SERVICES,
  tongsHeartbeatPathSegments,
  validateTongsHeartbeatRecord,
} from "../../../../../guild_hall/shared/tongs_heartbeat_contract.mjs";

export const TONGS_SNAPSHOT_PATH = "/tongs.snapshot.json";
// v2: status 어휘가 lane 계약(starting/ready/degraded/stopped/error)으로 바뀌고
// `services` 가 붙었다. v1 은 실제 writer 와 한 번도 맞은 적이 없는 추정 계약이었다.
export const TONGS_PROJECTION_SCHEMA = "soulforge.team_ops_board.tongs_projection.v2";
export const TONGS_STATUS_VALUES = TONGS_HEARTBEAT_STATUSES;
export { TONGS_PRIMARY_SERVICE, TONGS_SERVICES };
export const DEFAULT_TONGS_TTL_MS = 30_000;
// 하트비트는 주기 신호다(lane 의 예약작업이 5분마다 다시 쓴다). 이 창을 넘으면 마지막
// 값을 지우지 않고 `stale` 로 낮춘다.
export const DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS = 900;

const MAX_BYTES = 16 * 1024;
// listen 은 계약 validator 가 `127.0.0.1:<port>` 로 이미 검증했다. 여기서는 포트만 뗀다.
const LISTEN_PORT_RE = /:(\d{1,5})$/u;

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));

// host-stats/topology 어댑터와 같은 관례: SOULFORGE_STATE_ROOT > SOULFORGE_OWNER_ROOT >
// 이 checkout 의 guild_hall/state.
export function defaultTongsStateRoot(env = process.env) {
  return resolveSoulforgeStateRoot(env, () => resolve(MODULE_ROOT, "../../../../../guild_hall/state"));
}

// 서비스별 실제 파일 경로. 이름은 계약 모듈이 정하고 여기서는 state root 만 붙인다.
export function tongsHeartbeatPaths(stateRoot) {
  const paths = {};
  for (const service of TONGS_SERVICES) {
    paths[service] = join(stateRoot, ...tongsHeartbeatPathSegments(service));
  }
  return Object.freeze(paths);
}

function isLoopbackAddress(remoteAddress) {
  if (!remoteAddress) return false;
  return remoteAddress === "127.0.0.1"
    || remoteAddress === "::1"
    || remoteAddress === "::ffff:127.0.0.1";
}

function serviceProjection({
  state, reason = null, status = null, observedAt = null,
  listenPort = null, ageSeconds = null, fresh = null,
}) {
  return {
    state,
    reason,
    status,
    observed_at: observedAt,
    listen_port: listenPort,
    age_seconds: ageSeconds,
    fresh,
  };
}

function unreadable() {
  return serviceProjection({ state: "unavailable", reason: "tongs_heartbeat_unreadable" });
}

// 순수 함수: 파일 바이트 -> 서비스 하나의 투영.
export function projectTongsHeartbeat(raw, {
  nowMs = Date.now(),
  freshnessWindowSeconds = DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS,
} = {}) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BYTES) {
    return unreadable();
  }
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    return serviceProjection({ state: "unavailable", reason: "tongs_heartbeat_unparsable" });
  }
  // 규격 판정은 계약 모듈의 validator 하나뿐이다. 사유 코드도 거기서 온다.
  const verdict = validateTongsHeartbeatRecord(document);
  if (!verdict.ok) {
    return serviceProjection({ state: "unavailable", reason: verdict.reason });
  }
  const observedMs = Date.parse(document.observed_at);
  // pid 는 형식만 봤다(validator). 값은 버린다. listen 은 포트 숫자만 남긴다.
  const listenMatch = typeof document.listen === "string" ? LISTEN_PORT_RE.exec(document.listen) : null;
  const listenPort = listenMatch === null ? null : Number(listenMatch[1]);
  const ageSeconds = Math.round((nowMs - observedMs) / 1000);
  // 미래 시각은 시계 어긋남이다. 신선하다고 주장하지 않는다.
  const fresh = ageSeconds >= 0 && ageSeconds <= freshnessWindowSeconds;
  return serviceProjection({
    state: "ready",
    status: document.status,
    observedAt: new Date(observedMs).toISOString(),
    listenPort,
    ageSeconds,
    fresh,
  });
}

// 순수 함수: 서비스별 투영(파일 없음은 null) -> 응답 봉투. 최상위 필드는 4311 을 답하는
// erp_mcp 의 것이고, erp_mcp 파일이 없으면 봉투 전체가 `unknown` 이다.
export function composeTongsSnapshot({ services = {}, nowMs = Date.now() } = {}) {
  const normalized = {};
  for (const service of TONGS_SERVICES) normalized[service] = services[service] ?? null;
  const primary = normalized[TONGS_PRIMARY_SERVICE]
    ?? serviceProjection({ state: "unknown", reason: "tongs_heartbeat_absent" });
  return {
    schema_version: TONGS_PROJECTION_SCHEMA,
    state: primary.state,
    reason: primary.reason,
    read_at: new Date(nowMs).toISOString(),
    status: primary.status,
    observed_at: primary.observed_at,
    listen_port: primary.listen_port,
    age_seconds: primary.age_seconds,
    fresh: primary.fresh,
    services: normalized,
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
  };
}

export function createTongsHeartbeatReader({
  stateRoot = null,
  env = process.env,
  ttlMs = DEFAULT_TONGS_TTL_MS,
  freshnessWindowSeconds = DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS,
  now = Date.now,
  readFileImpl = readFile,
  lstatImpl = lstat,
} = {}) {
  const paths = tongsHeartbeatPaths(stateRoot ?? defaultTongsStateRoot(env));
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  async function readService(path, nowMs) {
    let info;
    try {
      info = await lstatImpl(path);
    } catch {
      // 없음: 고장이 아니라 근거 없음.
      return null;
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) return unreadable();
    let raw;
    try {
      raw = await readFileImpl(path, "utf8");
    } catch {
      return unreadable();
    }
    return projectTongsHeartbeat(raw, { nowMs, freshnessWindowSeconds });
  }

  async function compute() {
    const nowMs = now();
    const services = {};
    for (const service of TONGS_SERVICES) {
      services[service] = await readService(paths[service], nowMs);
    }
    return composeTongsSnapshot({ services, nowMs });
  }

  function unreadableSnapshot() {
    return composeTongsSnapshot({ services: { [TONGS_PRIMARY_SERVICE]: unreadable() }, nowMs: now() });
  }

  return {
    paths,
    async readSnapshot() {
      const observedNow = now();
      if (cached !== null && cachedAt !== null && observedNow - cachedAt < ttlMs) return cached;
      if (inFlight === null) {
        const operation = compute().then((projection) => {
          cached = projection;
          cachedAt = now();
          return projection;
        }, () => {
          const projection = unreadableSnapshot();
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
        composeTongsSnapshot({ services: { [TONGS_PRIMARY_SERVICE]: unreadable() }, nowMs: Date.now() }),
      ));
    });
  };
  return {
    name: "soulforge-tongs-heartbeat-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
