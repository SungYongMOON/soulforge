import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  TONGS_PROJECTION_SCHEMA,
  TONGS_SNAPSHOT_PATH,
  createTongsHeartbeatAdapterPlugin,
  createTongsHeartbeatReader,
  defaultTongsHeartbeatPath,
  projectTongsHeartbeat,
} from "./tongs-heartbeat-adapter.mjs";

const NOW_MS = Date.parse("2026-09-06T04:00:00.000Z");
const VALID = {
  status: "listening",
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
  assert.equal(projection.status, "listening");
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
  assert.equal(stale.status, "listening");
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
    [JSON.stringify({ ...VALID, extra: true }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ status: "listening", observed_at: VALID.observed_at }), "tongs_heartbeat_keys_unexpected"],
    [JSON.stringify({ ...VALID, observed_at: "지금" }), "tongs_heartbeat_observed_at_invalid"],
    [JSON.stringify({ ...VALID, pid: 0 }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, pid: "4242" }), "tongs_heartbeat_pid_invalid"],
    [JSON.stringify({ ...VALID, listen: 4311 }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "0.0.0.0:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "10.0.0.4:4311" }), "tongs_heartbeat_listen_invalid"],
    [JSON.stringify({ ...VALID, listen: "127.0.0.1:80" }), "tongs_heartbeat_listen_invalid"],
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

test("선택 키 schema 는 허용되고 loopback ipv6·localhost 표기도 받는다", () => {
  for (const listen of ["127.0.0.1:4311", "localhost:4311", "[::1]:4311"]) {
    const projection = projectTongsHeartbeat(JSON.stringify({ ...VALID, listen }), { nowMs: NOW_MS });
    assert.equal(projection.state, "ready", `${listen} 는 loopback 이다`);
    assert.equal(projection.listen_port, 4311);
  }
  const withSchema = projectTongsHeartbeat(
    JSON.stringify({ schema: "soulforge.tongs.heartbeat.v0", ...VALID }),
    { nowMs: NOW_MS },
  );
  assert.equal(withSchema.state, "ready");
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
    assert.equal((await reader.readSnapshot()).status, "listening");
    clock += 10_000;
    await reader.readSnapshot();
    assert.equal(reads, 1);
    clock += 30_000;
    await reader.readSnapshot();
    assert.equal(reads, 2);
  });
});

test("기본 경로는 state root 아래 operations/tongs/heartbeat.json 이다", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "state"), { recursive: true });
    const resolved = defaultTongsHeartbeatPath({ SOULFORGE_STATE_ROOT: join(dir, "state") });
    assert.equal(resolved, join(dir, "state", "operations", "tongs", "heartbeat.json"));
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
