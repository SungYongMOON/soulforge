// secure-work-status-adapter.mjs — 외부 작업 사이클의 상태 파일을 loopback 전용
// GET /secure-work.snapshot.json 으로 투영하는 Vite dev/preview 플러그인.
//
// 읽는 것은 하나뿐이다: `<state root>/operations/secure_work/status.json`.
// 그 파일은 다른 lane 이 쓰고 이 어댑터는 절대 쓰지 않는다. glob, 디렉터리 탐색,
// 질의 인자, 대체 경로가 없다.
//
// 브라우저까지 가는 것: 상태 이름별 건수와 관측 시각뿐이다. `last_job` 과
// `last_receipt_ref` 는 형식만 검사하고 값은 버린다 — 화면이 답해야 할 질문은
// "몇 건이 어느 단계에 있나"이지 "그게 뭐냐"가 아니다.
//
// 상태 세 가지: 파일 없음 = `unknown`(회색), 규격 위반 = `unavailable`(관측된 고장),
// 통과 = `ready`. 없음과 깨짐은 다른 사실이므로 같은 값으로 접지 않는다.

import { readFile, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { resolveSoulforgeStateRoot } from "../../../../../guild_hall/shared/soulforge_state_root.mjs";
import { isDirectLoopbackRequest } from "./loopback-request-guard.mjs";

export const SECURE_WORK_SNAPSHOT_PATH = "/secure-work.snapshot.json";
export const SECURE_WORK_PROJECTION_SCHEMA = "soulforge.team_ops_board.secure_work_projection.v1";
export const SECURE_WORK_STATUS_SCHEMA = "soulforge.secure_work.status.v0";
export const DEFAULT_SECURE_WORK_TTL_MS = 30_000;

const MAX_BYTES = 64 * 1024;
const MAX_JOB_STATES = 32;
const JOB_STATE_RE = /^[A-Za-z0-9][A-Za-z0-9_]{0,47}$/u;
const STATUS_KEYS = Object.freeze(["schema", "observed_at", "jobs", "last_job", "last_receipt_ref"]);

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));

// host-stats/topology 어댑터와 같은 관례: SOULFORGE_STATE_ROOT > SOULFORGE_OWNER_ROOT >
// 이 checkout 의 guild_hall/state.
export function defaultSecureWorkStatusPath(env = process.env) {
  const stateRoot = resolveSoulforgeStateRoot(env, () => resolve(MODULE_ROOT, "../../../../../guild_hall/state"));
  return join(stateRoot, "operations", "secure_work", "status.json");
}

function envelope({ state, reason = null, observedAt = null, jobs = {}, total = 0, nowMs }) {
  return {
    schema_version: SECURE_WORK_PROJECTION_SCHEMA,
    state,
    reason,
    read_at: new Date(nowMs).toISOString(),
    observed_at: observedAt,
    jobs,
    total,
    authority_boundary: { read_only: true, runtime_authority: false, repair_authority: false },
  };
}

// 순수 함수: 파일 바이트 -> 투영. 합성 입력으로 그대로 검증된다.
export function projectSecureWorkStatus(raw, { nowMs = Date.now() } = {}) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_BYTES) {
    return envelope({ state: "unavailable", reason: "secure_work_status_unreadable", nowMs });
  }
  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    return envelope({ state: "unavailable", reason: "secure_work_status_unparsable", nowMs });
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return envelope({ state: "unavailable", reason: "secure_work_status_not_object", nowMs });
  }
  const keys = Object.keys(document).sort();
  const expected = [...STATUS_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return envelope({ state: "unavailable", reason: "secure_work_status_keys_unexpected", nowMs });
  }
  if (document.schema !== SECURE_WORK_STATUS_SCHEMA) {
    return envelope({ state: "unavailable", reason: "secure_work_status_schema_unexpected", nowMs });
  }
  if (typeof document.observed_at !== "string" || !Number.isFinite(Date.parse(document.observed_at))) {
    return envelope({ state: "unavailable", reason: "secure_work_status_observed_at_invalid", nowMs });
  }
  const rawJobs = document.jobs;
  if (rawJobs === null || typeof rawJobs !== "object" || Array.isArray(rawJobs)) {
    return envelope({ state: "unavailable", reason: "secure_work_status_jobs_invalid", nowMs });
  }
  const jobEntries = Object.entries(rawJobs);
  if (jobEntries.length > MAX_JOB_STATES) {
    return envelope({ state: "unavailable", reason: "secure_work_status_jobs_oversize", nowMs });
  }
  const jobs = {};
  let total = 0;
  for (const [state, count] of jobEntries) {
    if (!JOB_STATE_RE.test(state) || !Number.isSafeInteger(count) || count < 0) {
      return envelope({ state: "unavailable", reason: "secure_work_status_jobs_invalid", nowMs });
    }
    jobs[state] = count;
    total += count;
  }
  // 값은 버리고 형식만 본다 — 작업 id 와 영수증 ref 는 화면에 오지 않는다.
  for (const key of ["last_job", "last_receipt_ref"]) {
    const value = document[key];
    if (value !== null && (typeof value !== "string" || value.length === 0 || value.length > 256)) {
      return envelope({ state: "unavailable", reason: "secure_work_status_reference_invalid", nowMs });
    }
  }
  return envelope({ state: "ready", observedAt: document.observed_at, jobs, total, nowMs });
}

export function createSecureWorkStatusReader({
  statusPath = null,
  env = process.env,
  ttlMs = DEFAULT_SECURE_WORK_TTL_MS,
  now = Date.now,
  readFileImpl = readFile,
  lstatImpl = lstat,
} = {}) {
  const path = statusPath ?? defaultSecureWorkStatusPath(env);
  let cached = null;
  let cachedAt = null;
  let inFlight = null;

  async function compute() {
    let info;
    try {
      info = await lstatImpl(path);
    } catch {
      // 파일이 아직 없다 — 고장이 아니라 근거 없음이다.
      return envelope({ state: "unknown", reason: "secure_work_status_absent", nowMs: now() });
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) {
      return envelope({ state: "unavailable", reason: "secure_work_status_unreadable", nowMs: now() });
    }
    let raw;
    try {
      raw = await readFileImpl(path, "utf8");
    } catch {
      return envelope({ state: "unavailable", reason: "secure_work_status_unreadable", nowMs: now() });
    }
    return projectSecureWorkStatus(raw, { nowMs: now() });
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
          const projection = envelope({ state: "unavailable", reason: "secure_work_status_unreadable", nowMs: now() });
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

export function createSecureWorkStatusAdapterPlugin(options = {}) {
  const reader = createSecureWorkStatusReader(options);
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
      if (url.pathname !== SECURE_WORK_SNAPSHOT_PATH) {
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
      const respond = (projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      };
      void reader.readSnapshot().then(respond, () => respond(
        envelope({ state: "unavailable", reason: "secure_work_status_unreadable", nowMs: Date.now() }),
      ));
    });
  };
  return {
    name: "soulforge-secure-work-status-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
