import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS,
  TONGS_PROJECTION_SCHEMA,
  TONGS_SNAPSHOT_PATH,
  TONGS_STATE_ROOT_ENV,
  TONGS_STATUS_VALUES,
  createTongsHeartbeatAdapterPlugin,
  createTongsHeartbeatReader,
  defaultTongsHeartbeatPath,
  projectTongsHeartbeat,
  resolveTongsStateRoot,
} from "./tongs-heartbeat-adapter.mjs";
import {
  TONGS_ALWAYS_MANAGED_SERVICE,
  TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS,
  TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES,
  tongsHeartbeatPath,
} from "../../../../../guild_hall/shared/tongs_heartbeat_contract.mjs";

const NOW_MS = Date.parse("2026-09-06T04:00:00.000Z");
// Tongs lane 이 실제로 쓰는 모양 그대로다(schema_version 필수, status "ready") —
// 예전 fixture 는 lane 이 절대 쓰지 않는 "listening" 상태와 없는 "schema" 키를
// 썼다. 이 fixture 는 tongs_lane_support.mjs 의 TONGS_HEARTBEAT_SCHEMA 를 그대로
// 참조해 두 값이 갈라지면 이 파일이 아니라 그 상수가 바뀐 사실이 드러나게 한다.
const VALID = {
  schema_version: TONGS_HEARTBEAT_SCHEMA,
  status: "ready",
  observed_at: "2026-09-06T03:59:00.000Z",
  pid: 4242,
  listen: "127.0.0.1:4311",
};

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "soulforge-tongs-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("정상 하트비트는 상태·나이·듣는 포트만 투영한다", () => {
  const projection = projectTongsHeartbeat(JSON.stringify(VALID), { nowMs: NOW_MS });
  assert.equal(projection.schema_version, TONGS_PROJECTION_SCHEMA);
  assert.equal(projection.state, "ready");
  assert.equal(projection.status, "ready");
  assert.equal(projection.observed_at, "2026-09-06T03:59:00.000Z");
  assert.equal(projection.listen_port, 4311);
  assert.equal(projection.age_seconds, 60);
  assert.equal(projection.fresh, true);
  assert.deepEqual(projection.authority_boundary, { read_only: true, runtime_authority: false, repair_authority: false });
});

test("pid 값은 형식만 보고 투영에는 남기지 않는다", () => {
  const serialized = JSON.stringify(projectTongsHeartbeat(JSON.stringify(VALID), { nowMs: NOW_MS }));
  assert.equal(serialized.includes("4242"), false);
  assert.equal(serialized.includes("\"pid\""), false);
  // 듣는 주소는 포트 숫자만 남고 호스트 문자열은 남지 않는다.
  assert.equal(serialized.includes("127.0.0.1"), false);
  assert.equal(serialized.includes("\"listen\""), false);
});

test("신선도 창을 넘긴 하트비트는 값을 지우지 않고 fresh=false 로 낮춘다", () => {
  const stale = projectTongsHeartbeat(
    JSON.stringify({ ...VALID, observed_at: "2026-09-06T03:00:00.000Z" }),
    { nowMs: NOW_MS },
  );
  assert.equal(stale.state, "ready");
  assert.equal(stale.status, "ready");
  assert.equal(stale.age_seconds, 3600);
  assert.equal(stale.fresh, false);
});

test("미래 시각(시계 어긋남)은 신선하다고 주장하지 않는다", () => {
  const future = projectTongsHeartbeat(
    JSON.stringify({ ...VALID, observed_at: "2026-09-06T05:00:00.000Z" }),
    { nowMs: NOW_MS },
  );
  assert.equal(future.state, "ready");
  assert.equal(future.fresh, false);
  assert.equal(future.age_seconds < 0, true);
});

test("스키마 위반은 전부 unavailable 이고 사유 코드가 붙는다", () => {
  const cases = [
    [JSON.stringify({ ...VALID, status: "cooking" }), "tongs_heartbeat_status_unexpected"],
    // "listening" 은 예전 어댑터가 추측했던 값이다 — 실제 lane 어휘가 아니므로
    // 지금은 다른 미확인 상태 문자열과 똑같이 거부돼야 한다.
    [JSON.stringify({ ...VALID, status: "listening" }), "tongs_heartbeat_status_unexpected"],
    [JSON.stringify({ ...VALID, extra: true }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ status: "ready", observed_at: VALID.observed_at }), "tongs_heartbeat_keys_unexpected"],
    // schema_version 은 필수다 — 예전에는 없어도 됐고, 있으면 다른 이름("schema")
    // 이었다. 실제 lane 은 이 필드를 항상 쓴다.
    [JSON.stringify({ status: VALID.status, observed_at: VALID.observed_at, pid: VALID.pid, listen: VALID.listen }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ ...VALID, schema_version: "soulforge.tongs_lane.heartbeat.v0" }), "tongs_heartbeat_schema_unexpected"],
    [JSON.stringify({ ...VALID, observed_at: "지금" }), "tongs_heartbeat_observed_at_invalid"],
    [JSON.stringify({ ...VALID, pid: 0 }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, pid: "4242" }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, listen: 4311 }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "0.0.0.0:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "10.0.0.4:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "127.0.0.1:80" }), "tongs_heartbeat_listen_invalid"],
    // "ready" 는 lane 의 유일한 계약: pid·listen 이 둘 다 채워져야 한다.
    [JSON.stringify({ ...VALID, pid: null, listen: null }), "tongs_heartbeat_ready_missing_pid_or_listen"],
    [JSON.stringify({ ...VALID, listen: null }), "tongs_heartbeat_ready_missing_pid_or_listen"],
    [JSON.stringify(["listening"]), "tongs_heartbeat_not_object"],
    ["}{", "tongs_heartbeat_unparsable"],
    ["", "tongs_heartbeat_unreadable"],
  ];
  for (const [raw, reason] of cases) {
    const projection = projectTongsHeartbeat(raw, { nowMs: NOW_MS });
    assert.equal(projection.state, "unavailable", `${reason} 는 unavailable 이어야 한다`);
    assert.equal(projection.reason, reason);
    assert.equal(projection.status, null);
    assert.equal(projection.listen_port, null);
  }
});

test("loopback ipv6·localhost 표기를 받고, ready 가 아닌 상태는 pid·listen 이 null 이어도 된다", () => {
  for (const listen of ["127.0.0.1:4311", "localhost:4311", "[::1]:4311"]) {
    const projection = projectTongsHeartbeat(JSON.stringify({ ...VALID, listen }), { nowMs: NOW_MS });
    assert.equal(projection.state, "ready", `${listen} 는 loopback 이다`);
    assert.equal(projection.listen_port, 4311);
  }
  // lane 이 재기동 판단 사이에 실제로 쓰는 모양: 멈춘 서비스는 pid/listen 이
  // 둘 다 null 이고, 이것은 규격 위반이 아니라 정상 "멈춤" 관측이다(실제 운영
  // 하트비트 파일에서 그대로 관측된 모양).
  for (const status of ["starting", "degraded", "stopped", "error"]) {
    const stopped = projectTongsHeartbeat(
      JSON.stringify({ ...VALID, status, pid: null, listen: null }),
      { nowMs: NOW_MS },
    );
    assert.equal(stopped.state, "ready", `${status} 는 pid/listen 없이도 유효하다`);
    assert.equal(stopped.status, status);
    assert.equal(stopped.listen_port, null);
  }
});

test("하트비트 파일이 없으면 unknown 이다 — 고장이 아니라 근거 없음", async () => {
  await withTempDir(async (dir) => {
    const reader = createTongsHeartbeatReader({ heartbeatPath: join(dir, "missing", "heartbeat.json") });
    const projection = await reader.readSnapshot();
    assert.equal(projection.state, "unknown");
    assert.equal(projection.reason, "tongs_heartbeat_absent");
    assert.equal(projection.status, null);
  });
});

test("실제 파일을 읽고 TTL 안에서는 다시 읽지 않는다", async () => {
  await withTempDir(async (dir) => {
    const heartbeatPath = join(dir, "heartbeat.json");
    await writeFile(heartbeatPath, JSON.stringify(VALID), "utf8");
    let reads = 0;
    let clock = NOW_MS;
    const reader = createTongsHeartbeatReader({
      heartbeatPath,
      now: () => clock,
      readFileImpl: async (...args) => {
        reads += 1;
        return (await import("node:fs/promises")).readFile(...args);
      },
    });
    assert.equal((await reader.readSnapshot()).status, "ready");
    clock += 10_000;
    await reader.readSnapshot();
    assert.equal(reads, 1);
    clock += 30_000;
    await reader.readSnapshot();
    assert.equal(reads, 2);
  });
});

test("기본 경로는 state root 아래 operations/tongs/erp_mcp.heartbeat.v1.json 이다", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "state"), { recursive: true });
    const resolved = defaultTongsHeartbeatPath({ SOULFORGE_STATE_ROOT: join(dir, "state") });
    assert.equal(resolved, join(dir, "state", "operations", "tongs", "erp_mcp.heartbeat.v1.json"));
  });
});

// 계약 테스트: Tongs lane 이 실제로 쓰는 파일명(guild_hall/shared/
// tongs_heartbeat_contract.mjs 의 tongsHeartbeatPath + TONGS_ALWAYS_MANAGED_SERVICE)과
// 이 어댑터가 기본으로 읽으려는 파일명이 같은 상수/함수에서 나온다는 것을 직접
// 증명한다 — 두 값이 우연히 같은 문자열이라서가 아니라 같은 함수 호출의
// 결과라서 절대 갈라질 수 없다는 것을 확인한다. 이 파일 자신도 그 함수를
// guild_hall/shared 에서 직접 import 한다(dev-erp-mcp 의 tongs_lane_support.mjs를
// 거치지 않는다) — team-ops-board -> dev-erp-mcp import edge 는 어디에도 없다.
test("계약: 어댑터의 기본 경로는 lane writer 와 같은 tongsHeartbeatPath() 호출에서 나온다", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "state"), { recursive: true });
    const stateRoot = join(dir, "state");
    const adapterPath = defaultTongsHeartbeatPath({ SOULFORGE_STATE_ROOT: stateRoot });
    const laneWriterPath = tongsHeartbeatPath(stateRoot, TONGS_ALWAYS_MANAGED_SERVICE);
    assert.equal(adapterPath, laneWriterPath);
    assert.equal(TONGS_ALWAYS_MANAGED_SERVICE, "erp_mcp");
  });
});

// 계약 테스트: 어댑터가 재노출하는 상태 어휘(TONGS_STATUS_VALUES)는
// guild_hall/shared/tongs_heartbeat_contract.mjs 의 TONGS_HEARTBEAT_STATUSES와
// 참조가 같다(===) — 값만 우연히 같은 복사본이 아니라 정확히 같은 배열
// 객체라서, 그 정본이 바뀌면 이 어댑터도 자동으로 같이 바뀌고 절대 따로
// 갈라질 수 없다는 것을 증명한다.
test("계약: 어댑터의 상태 어휘는 guild_hall/shared 의 배열과 같은 참조다(복사본이 아니다)", () => {
  assert.strictEqual(TONGS_STATUS_VALUES, TONGS_HEARTBEAT_STATUSES);
});

test("state root: SOULFORGE_TONGS_STATE_ROOT 가 일반 SOULFORGE_STATE_ROOT 보다 우선하고, 없으면 그리로 내려간다", async () => {
  await withTempDir(async (dir) => {
    const tongsRoot = join(dir, "tongs-only-root");
    const generalRoot = join(dir, "general-state-root");
    await mkdir(tongsRoot, { recursive: true });
    await mkdir(generalRoot, { recursive: true });
    // 명시된 값이 있으면 일반 SOULFORGE_STATE_ROOT 는 아예 보지 않는다.
    assert.equal(
      resolveTongsStateRoot({ [TONGS_STATE_ROOT_ENV]: tongsRoot, SOULFORGE_STATE_ROOT: generalRoot }),
      tongsRoot,
    );
    // 없으면 이 Board 의 다른 상태 파일과 같은 일반 우선순위로 내려간다.
    assert.equal(resolveTongsStateRoot({ SOULFORGE_STATE_ROOT: generalRoot }), generalRoot);
  });
});

test("state root: SOULFORGE_TONGS_STATE_ROOT 가 있는데 잘못되면 fail-closed 로 거부하고 조용히 내려가지 않는다", async () => {
  await withTempDir(async (dir) => {
    const generalRoot = join(dir, "general-state-root");
    await mkdir(generalRoot, { recursive: true });
    for (const badValue of ["", join("relative", "path"), join(dir, "does-not-exist")]) {
      assert.throws(
        () => resolveTongsStateRoot({ [TONGS_STATE_ROOT_ENV]: badValue, SOULFORGE_STATE_ROOT: generalRoot }),
        (error) => error?.code === "soulforge_root_override_invalid" && error?.variable === TONGS_STATE_ROOT_ENV,
        `${JSON.stringify(badValue)} 는 SOULFORGE_STATE_ROOT 로 조용히 넘어가면 안 된다`,
      );
    }
  });
});

test("신선도 창은 lane 자신의 재기동 판단 창(TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS)과 같은 값이다", () => {
  assert.equal(DEFAULT_TONGS_FRESHNESS_WINDOW_SECONDS * 1000, TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS);
});

test("실제 파일명으로 쓰인 fixture 하트비트를 읽고 ok/stale/absent 를 올바르게 판정한다", async () => {
  await withTempDir(async (dir) => {
    const stateRoot = join(dir, "state");
    const tongsDir = join(stateRoot, "operations", "tongs");
    await mkdir(tongsDir, { recursive: true });
    const realPath = join(tongsDir, "erp_mcp.heartbeat.v1.json");
    assert.equal(realPath, defaultTongsHeartbeatPath({ SOULFORGE_STATE_ROOT: stateRoot }));

    // ok: 방금 관측된 ready 하트비트.
    let clock = NOW_MS;
    await writeFile(realPath, JSON.stringify({ ...VALID, observed_at: new Date(clock - 60_000).toISOString() }), "utf8");
    const okReader = createTongsHeartbeatReader({ env: { SOULFORGE_STATE_ROOT: stateRoot }, now: () => clock });
    const ok = await okReader.readSnapshot();
    assert.equal(ok.state, "ready");
    assert.equal(ok.status, "ready");
    assert.equal(ok.fresh, true);
    assert.equal(ok.listen_port, 4311);

    // stale: 같은 파일, 신선도 창을 넘긴 관측 시각.
    const staleObservedAt = new Date(clock - (TONGS_DEFAULT_MAX_HEARTBEAT_AGE_MS + 60_000)).toISOString();
    await writeFile(realPath, JSON.stringify({ ...VALID, observed_at: staleObservedAt }), "utf8");
    const staleReader = createTongsHeartbeatReader({ env: { SOULFORGE_STATE_ROOT: stateRoot }, now: () => clock });
    const stale = await staleReader.readSnapshot();
    assert.equal(stale.state, "ready");
    assert.equal(stale.fresh, false);

    // absent: 같은 state root, 다른(비어 있는) service — 파일 자체가 없다.
    const emptyStateRoot = join(dir, "empty-state");
    await mkdir(emptyStateRoot, { recursive: true });
    const absentReader = createTongsHeartbeatReader({ env: { SOULFORGE_STATE_ROOT: emptyStateRoot }, now: () => clock });
    const absent = await absentReader.readSnapshot();
    assert.equal(absent.state, "unknown");
    assert.equal(absent.reason, "tongs_heartbeat_absent");
  });
});

test("endpoint 는 loopback GET 만 받고 no-store·nosniff 를 붙인다", async () => {
  const plugin = createTongsHeartbeatAdapterPlugin({ heartbeatPath: join(tmpdir(), "soulforge-absent-heartbeat.json") });
  assert.equal(plugin.name, "soulforge-tongs-heartbeat-adapter");
  const handlers = [];
  plugin.configureServer({ middlewares: { use: (handler) => handlers.push(handler) } });
  const handler = handlers[0];
  const call = ({ method = "GET", url = TONGS_SNAPSHOT_PATH, remoteAddress = "127.0.0.1" }) =>
    new Promise((resolve) => {
      const headers = {};
      const response = {
        statusCode: 200,
        setHeader: (key, value) => { headers[key] = value; },
        end: (body) => resolve({ statusCode: response.statusCode, headers, body }),
      };
      handler({ method, url, socket: { remoteAddress } }, response, () => resolve({ statusCode: "next", headers, body: null }));
    });
  assert.equal((await call({ method: "DELETE" })).statusCode, 405);
  assert.equal((await call({ remoteAddress: "100.64.0.2" })).statusCode, 403);
  assert.equal((await call({ url: "/elsewhere.json" })).statusCode, "next");
  const ok = await call({});
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Cache-Control"], "no-store");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(JSON.parse(ok.body).state, "unknown");
});

test("어댑터에는 쓰기 동사와 프로세스 제어가 없다", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./tongs-heartbeat-adapter.mjs", import.meta.url), "utf8");
  for (const forbidden of ["writeFile", "appendFile", "mkdir", "rename", "unlink", "rm(", "spawn", "child_process", "process.kill"]) {
    assert.equal(source.includes(forbidden), false, `읽기 전용 어댑터에 ${forbidden} 이 있으면 안 된다`);
  }
});
