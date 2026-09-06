import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TONGS_HEARTBEAT_SCHEMA,
  TONGS_HEARTBEAT_STATUSES,
  TONGS_SERVICES,
} from "../../../../../guild_hall/shared/tongs_heartbeat_contract.mjs";
// 쓰는 쪽(Tongs lane)의 모듈과 CLI. 테스트에서만 건너간다 — 어댑터 자체는 앱 간
// import 없이 guild_hall/shared 의 계약만 본다.
import { tongsHeartbeatPath } from "../../../dev-erp-mcp/ops/tongs_lane_support.mjs";
import {
  TONGS_PROJECTION_SCHEMA,
  TONGS_SNAPSHOT_PATH,
  TONGS_STATUS_VALUES,
  composeTongsSnapshot,
  createTongsHeartbeatAdapterPlugin,
  createTongsHeartbeatReader,
  defaultTongsStateRoot,
  projectTongsHeartbeat,
  tongsHeartbeatPaths,
} from "./tongs-heartbeat-adapter.mjs";

const LANE_SUPPORT_CLI = fileURLToPath(new URL("../../../dev-erp-mcp/ops/tongs_lane_support.mjs", import.meta.url));
const NOW_MS = Date.parse("2026-09-06T04:00:00.000Z");
// Tongs lane 의 writer 가 실제로 쓰는 레코드 모양 그대로(ops/tongs_lane_support.mjs
// buildTongsHeartbeatRecord): schema_version 포함 5키, status 는 lane 어휘.
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

async function writeHeartbeat(stateRoot, service, record) {
  const path = tongsHeartbeatPaths(stateRoot)[service];
  await mkdir(join(stateRoot, "operations", "tongs"), { recursive: true });
  await writeFile(path, JSON.stringify(record), "utf8");
  return path;
}

test("상태 어휘와 파일 경로는 계약 모듈과 lane writer 의 것을 그대로 쓴다", () => {
  assert.equal(TONGS_STATUS_VALUES, TONGS_HEARTBEAT_STATUSES);
  assert.deepEqual([...TONGS_STATUS_VALUES], ["starting", "ready", "degraded", "stopped", "error"]);
  const stateRoot = join(tmpdir(), "soulforge-tongs-contract-pin");
  const paths = tongsHeartbeatPaths(stateRoot);
  assert.deepEqual(Object.keys(paths), [...TONGS_SERVICES]);
  // 읽는 경로 == 쓰는 경로. 2026-09-06 이전에는 어댑터가 `heartbeat.json` 을 읽었고
  // lane 은 `<service>.heartbeat.v1.json` 을 썼다.
  for (const service of TONGS_SERVICES) {
    assert.equal(paths[service], tongsHeartbeatPath(stateRoot, service));
  }
  assert.match(paths.erp_mcp, /operations[\\/]tongs[\\/]erp_mcp\.heartbeat\.v1\.json$/u);
});

test("정상 하트비트는 상태·나이·듣는 포트만 투영한다", () => {
  const projection = projectTongsHeartbeat(JSON.stringify(VALID), { nowMs: NOW_MS });
  assert.equal(projection.state, "ready");
  assert.equal(projection.reason, null);
  assert.equal(projection.status, "ready");
  assert.equal(projection.observed_at, "2026-09-06T03:59:00.000Z");
  assert.equal(projection.listen_port, 4311);
  assert.equal(projection.age_seconds, 60);
  assert.equal(projection.fresh, true);
});

test("봉투의 최상위 필드는 erp_mcp 의 것이고 두 서비스가 services 에 따로 실린다", () => {
  const erp = projectTongsHeartbeat(JSON.stringify(VALID), { nowMs: NOW_MS });
  const ingress = projectTongsHeartbeat(
    JSON.stringify({ ...VALID, status: "stopped", pid: null, listen: null }),
    { nowMs: NOW_MS },
  );
  const snapshot = composeTongsSnapshot({ services: { erp_mcp: erp, ingress_mcp: ingress }, nowMs: NOW_MS });
  assert.equal(snapshot.schema_version, TONGS_PROJECTION_SCHEMA);
  assert.equal(snapshot.state, "ready");
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.listen_port, 4311);
  assert.equal(snapshot.read_at, new Date(NOW_MS).toISOString());
  assert.deepEqual(snapshot.services.erp_mcp, erp);
  assert.equal(snapshot.services.ingress_mcp.status, "stopped");
  assert.equal(snapshot.services.ingress_mcp.listen_port, null);
  assert.deepEqual(snapshot.authority_boundary, { read_only: true, runtime_authority: false, repair_authority: false });
  // erp_mcp 파일이 없으면 ingress 가 있어도 봉투는 unknown 이다 — 4311 에 대한 근거가 없다.
  const noPrimary = composeTongsSnapshot({ services: { ingress_mcp: ingress }, nowMs: NOW_MS });
  assert.equal(noPrimary.state, "unknown");
  assert.equal(noPrimary.reason, "tongs_heartbeat_absent");
  assert.equal(noPrimary.services.erp_mcp, null);
  assert.equal(noPrimary.services.ingress_mcp.status, "stopped");
});

test("pid 값은 형식만 보고 투영에는 남기지 않는다", () => {
  const snapshot = composeTongsSnapshot({
    services: { erp_mcp: projectTongsHeartbeat(JSON.stringify(VALID), { nowMs: NOW_MS }) },
    nowMs: NOW_MS,
  });
  const serialized = JSON.stringify(snapshot);
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

test("ready 가 아닌 상태는 pid/listen 이 null 이어도 규격 안이고 포트는 null 로 투영된다", () => {
  for (const status of ["starting", "degraded", "stopped", "error"]) {
    const projection = projectTongsHeartbeat(
      JSON.stringify({ ...VALID, status, pid: null, listen: null }),
      { nowMs: NOW_MS },
    );
    assert.equal(projection.state, "ready", status);
    assert.equal(projection.status, status);
    assert.equal(projection.listen_port, null);
  }
});

test("스키마 위반은 전부 unavailable 이고 계약 모듈의 사유 코드가 붙는다", () => {
  const cases = [
    // 옛 어댑터의 어휘(`listening`)와 선택 키(`schema`)는 writer 가 쓰지 않는다.
    [JSON.stringify({ ...VALID, status: "listening" }), "tongs_heartbeat_status_unexpected"],
    [JSON.stringify({ ...VALID, status: "cooking" }), "tongs_heartbeat_status_unexpected"],
    [JSON.stringify({ ...VALID, schema: "soulforge.tongs.heartbeat.v0" }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ ...VALID, extra: true }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ status: "ready", observed_at: VALID.observed_at }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ ...VALID, schema_version: "soulforge.tongs_lane.heartbeat.v2" }), "tongs_heartbeat_schema_version_unexpected"],
    [JSON.stringify({ ...VALID, observed_at: "지금" }), "tongs_heartbeat_observed_at_invalid"],
    [JSON.stringify({ ...VALID, pid: 0 }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, pid: "4242" }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, listen: 4311 }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "0.0.0.0:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "localhost:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "127.0.0.1:80" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, pid: null }), "tongs_heartbeat_ready_incomplete"],
    [JSON.stringify(["ready"]), "tongs_heartbeat_not_object"],
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

test("하트비트 파일이 없으면 unknown 이다 — 고장이 아니라 근거 없음", async () => {
  await withTempDir(async (dir) => {
    const reader = createTongsHeartbeatReader({ stateRoot: join(dir, "missing") });
    const projection = await reader.readSnapshot();
    assert.equal(projection.state, "unknown");
    assert.equal(projection.reason, "tongs_heartbeat_absent");
    assert.equal(projection.status, null);
    assert.deepEqual(projection.services, { erp_mcp: null, ingress_mcp: null });
  });
});

test("실제 파일을 읽고 TTL 안에서는 다시 읽지 않는다", async () => {
  await withTempDir(async (dir) => {
    const stateRoot = join(dir, "state");
    await writeHeartbeat(stateRoot, "erp_mcp", VALID);
    let reads = 0;
    let clock = NOW_MS;
    const reader = createTongsHeartbeatReader({
      stateRoot,
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

test("규격을 어긴 ingress 파일은 erp_mcp 투영을 바꾸지 않고 services 에 unavailable 로 남는다", async () => {
  await withTempDir(async (dir) => {
    const stateRoot = join(dir, "state");
    await writeHeartbeat(stateRoot, "erp_mcp", VALID);
    await writeFile(tongsHeartbeatPaths(stateRoot).ingress_mcp, "}{", "utf8");
    const snapshot = await createTongsHeartbeatReader({ stateRoot, now: () => NOW_MS }).readSnapshot();
    assert.equal(snapshot.state, "ready");
    assert.equal(snapshot.status, "ready");
    assert.equal(snapshot.services.ingress_mcp.state, "unavailable");
    assert.equal(snapshot.services.ingress_mcp.reason, "tongs_heartbeat_unparsable");
  });
});

// 회귀: 2026-09-06 에 잡힌 계약 불일치(파일 이름·키·상태 어휘·null 허용)는 어댑터의
// 합성 fixture 로는 절대 드러나지 않았다. 여기서는 Tongs lane 의 실제 writer CLI 가 실제
// 디스크에 쓴 파일을 어댑터가 그대로 읽어야 한다.
test("Tongs lane 의 실제 writer 가 쓴 파일을 어댑터가 그대로 읽는다", async () => {
  await withTempDir(async (dir) => {
    const stateRoot = join(dir, "state");
    const observedAt = "2026-09-06T03:59:00.000Z";
    const writeErp = spawnSync(process.execPath, [
      LANE_SUPPORT_CLI, "write-heartbeat",
      "--state-root", stateRoot, "--service", "erp_mcp", "--status", "ready",
      "--pid", "4242", "--listen", "127.0.0.1:4311", "--observed-at", observedAt,
    ]);
    assert.equal(writeErp.status, 0, writeErp.stderr.toString());
    // ingress 는 feature OFF 가 기본이라 launcher 가 `stopped`(pid/listen null) 로 남긴다.
    const writeIngress = spawnSync(process.execPath, [
      LANE_SUPPORT_CLI, "write-heartbeat",
      "--state-root", stateRoot, "--service", "ingress_mcp", "--status", "stopped", "--observed-at", observedAt,
    ]);
    assert.equal(writeIngress.status, 0, writeIngress.stderr.toString());

    const snapshot = await createTongsHeartbeatReader({ stateRoot, now: () => NOW_MS }).readSnapshot();
    assert.equal(snapshot.state, "ready", JSON.stringify(snapshot));
    assert.equal(snapshot.reason, null);
    assert.equal(snapshot.status, "ready");
    assert.equal(snapshot.observed_at, observedAt);
    assert.equal(snapshot.listen_port, 4311);
    assert.equal(snapshot.age_seconds, 60);
    assert.equal(snapshot.fresh, true);
    assert.equal(snapshot.services.erp_mcp.status, "ready");
    assert.equal(snapshot.services.ingress_mcp.state, "ready");
    assert.equal(snapshot.services.ingress_mcp.status, "stopped");
    assert.equal(snapshot.services.ingress_mcp.listen_port, null);
  });
});

test("기본 state root 는 SOULFORGE_STATE_ROOT 를 따르고 파일 경로는 그 아래 operations/tongs 다", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "state"), { recursive: true });
    const resolved = defaultTongsStateRoot({ SOULFORGE_STATE_ROOT: join(dir, "state") });
    assert.equal(resolved, join(dir, "state"));
    assert.equal(
      tongsHeartbeatPaths(resolved).erp_mcp,
      join(dir, "state", "operations", "tongs", "erp_mcp.heartbeat.v1.json"),
    );
  });
});

test("endpoint 는 loopback GET 만 받고 no-store·nosniff 를 붙인다", async () => {
  const plugin = createTongsHeartbeatAdapterPlugin({ stateRoot: join(tmpdir(), "soulforge-absent-tongs-state") });
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
  // 앱 간 import 도 없다: 계약은 guild_hall/shared 에서만 온다(주석의 경로 언급은 무방).
  assert.doesNotMatch(source, /from\s+"[^"]*dev-erp-mcp\//u);
  assert.match(source, /from\s+"[^"]*guild_hall\/shared\/tongs_heartbeat_contract\.mjs"/u);
});
