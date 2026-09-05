import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SECURE_WORK_PROJECTION_SCHEMA,
  SECURE_WORK_SNAPSHOT_PATH,
  SECURE_WORK_STATUS_SCHEMA,
  createSecureWorkStatusAdapterPlugin,
  createSecureWorkStatusReader,
  defaultSecureWorkStatusPath,
  projectSecureWorkStatus,
} from "./secure-work-status-adapter.mjs";

const VALID = {
  schema: SECURE_WORK_STATUS_SCHEMA,
  observed_at: "2026-09-05T19:15:23Z",
  jobs: { G2_PREPARED: 1, G3_RUNNING: 2 },
  last_job: "o_041c320a9286d34cd0cbda75708368d6",
  last_receipt_ref: "o_041c320a9286d34cd0cbda75708368d6/003_g2.propose.json",
};

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "soulforge-secure-work-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("정상 상태 파일은 건수만 투영한다", () => {
  const projection = projectSecureWorkStatus(JSON.stringify(VALID), { nowMs: 0 });
  assert.equal(projection.schema_version, SECURE_WORK_PROJECTION_SCHEMA);
  assert.equal(projection.state, "ready");
  assert.equal(projection.reason, null);
  assert.equal(projection.observed_at, "2026-09-05T19:15:23Z");
  assert.deepEqual(projection.jobs, { G2_PREPARED: 1, G3_RUNNING: 2 });
  assert.equal(projection.total, 3);
  assert.deepEqual(projection.authority_boundary, { read_only: true, runtime_authority: false, repair_authority: false });
});

test("작업 id 와 영수증 ref 는 형식만 검사하고 값은 버린다", () => {
  const serialized = JSON.stringify(projectSecureWorkStatus(JSON.stringify(VALID), { nowMs: 0 }));
  assert.equal(serialized.includes("o_041c320a9286d34cd0cbda75708368d6"), false);
  assert.equal(serialized.includes("003_g2.propose.json"), false);
  assert.equal(serialized.includes("last_job"), false);
  assert.equal(serialized.includes("last_receipt_ref"), false);
});

test("스키마 위반은 전부 unavailable 이고 사유 코드가 붙는다", () => {
  const cases = [
    [JSON.stringify({ ...VALID, schema: "soulforge.other.v9" }), "secure_work_status_schema_unexpected"],
    [JSON.stringify({ ...VALID, extra: 1 }), "secure_work_status_keys_unexpected"],
    [JSON.stringify({ schema: VALID.schema, observed_at: VALID.observed_at, jobs: {} }), "secure_work_status_keys_unexpected"],
    [JSON.stringify({ ...VALID, observed_at: "어제" }), "secure_work_status_observed_at_invalid"],
    [JSON.stringify({ ...VALID, jobs: [] }), "secure_work_status_jobs_invalid"],
    [JSON.stringify({ ...VALID, jobs: { "bad key!": 1 } }), "secure_work_status_jobs_invalid"],
    [JSON.stringify({ ...VALID, jobs: { G2_PREPARED: -1 } }), "secure_work_status_jobs_invalid"],
    [JSON.stringify({ ...VALID, jobs: { G2_PREPARED: 1.5 } }), "secure_work_status_jobs_invalid"],
    [JSON.stringify({ ...VALID, last_job: 42 }), "secure_work_status_reference_invalid"],
    [JSON.stringify({ ...VALID, last_receipt_ref: "x".repeat(400) }), "secure_work_status_reference_invalid"],
    [JSON.stringify([VALID]), "secure_work_status_not_object"],
    ["{ not json", "secure_work_status_unparsable"],
    ["", "secure_work_status_unreadable"],
  ];
  for (const [raw, reason] of cases) {
    const projection = projectSecureWorkStatus(raw, { nowMs: 0 });
    assert.equal(projection.state, "unavailable", `${reason} 는 unavailable 이어야 한다`);
    assert.equal(projection.reason, reason);
    assert.deepEqual(projection.jobs, {});
    assert.equal(projection.total, 0);
  }
});

test("null 상태값은 허용되고 건수만 남는다", () => {
  const projection = projectSecureWorkStatus(
    JSON.stringify({ ...VALID, last_job: null, last_receipt_ref: null }),
    { nowMs: 0 },
  );
  assert.equal(projection.state, "ready");
  assert.equal(projection.total, 3);
});

test("상태 파일이 없으면 unknown 이다 — 고장이 아니라 근거 없음", async () => {
  await withTempDir(async (dir) => {
    const reader = createSecureWorkStatusReader({ statusPath: join(dir, "missing", "status.json") });
    const projection = await reader.readSnapshot();
    assert.equal(projection.state, "unknown");
    assert.equal(projection.reason, "secure_work_status_absent");
  });
});

test("실제 파일을 읽고 TTL 안에서는 다시 읽지 않는다", async () => {
  await withTempDir(async (dir) => {
    const statusPath = join(dir, "status.json");
    await writeFile(statusPath, JSON.stringify(VALID), "utf8");
    let reads = 0;
    let clock = 1_000;
    const reader = createSecureWorkStatusReader({
      statusPath,
      now: () => clock,
      readFileImpl: async (...args) => {
        reads += 1;
        return (await import("node:fs/promises")).readFile(...args);
      },
    });
    assert.equal((await reader.readSnapshot()).total, 3);
    clock += 10_000;
    await reader.readSnapshot();
    assert.equal(reads, 1);
    clock += 30_000;
    await reader.readSnapshot();
    assert.equal(reads, 2);
  });
});

test("기본 경로는 state root 아래 operations/secure_work/status.json 이다", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "state"), { recursive: true });
    const resolved = defaultSecureWorkStatusPath({ SOULFORGE_STATE_ROOT: join(dir, "state") });
    assert.equal(resolved, join(dir, "state", "operations", "secure_work", "status.json"));
  });
});

test("endpoint 는 loopback GET 만 받고 no-store·nosniff 를 붙인다", async () => {
  const plugin = createSecureWorkStatusAdapterPlugin({ statusPath: join(tmpdir(), "soulforge-absent-status.json") });
  assert.equal(plugin.name, "soulforge-secure-work-status-adapter");
  const handlers = [];
  plugin.configureServer({ middlewares: { use: (handler) => handlers.push(handler) } });
  const handler = handlers[0];
  const call = ({ method = "GET", url = SECURE_WORK_SNAPSHOT_PATH, remoteAddress = "127.0.0.1" }) =>
    new Promise((resolve) => {
      const headers = {};
      const response = {
        statusCode: 200,
        setHeader: (key, value) => { headers[key] = value; },
        end: (body) => resolve({ statusCode: response.statusCode, headers, body }),
      };
      handler({ method, url, socket: { remoteAddress } }, response, () => resolve({ statusCode: "next", headers, body: null }));
    });
  assert.equal((await call({ method: "PUT" })).statusCode, 405);
  assert.equal((await call({ remoteAddress: "192.168.0.5" })).statusCode, 403);
  assert.equal((await call({ url: "/nope.json" })).statusCode, "next");
  const ok = await call({});
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Cache-Control"], "no-store");
  assert.equal(ok.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(JSON.parse(ok.body).state, "unknown");
});

test("어댑터에는 쓰기 동사가 없다", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./secure-work-status-adapter.mjs", import.meta.url), "utf8");
  for (const forbidden of ["writeFile", "appendFile", "mkdir", "rename", "unlink", "rm(", "spawn", "child_process"]) {
    assert.equal(source.includes(forbidden), false, `읽기 전용 어댑터에 ${forbidden} 이 있으면 안 된다`);
  }
});
