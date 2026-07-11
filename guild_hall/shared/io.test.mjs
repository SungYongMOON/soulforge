import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeJson, readJson } from "./io.mjs";

test("writeJson: 원자적 쓰기 — 디렉터리 자동생성·라운드트립·덮어쓰기·tmp 잔재 없음", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "io-atomic-"));
  try {
    const target = path.join(dir, "sub", "x.json");
    // 신규(중간 디렉터리 자동 생성) + 라운드트립
    await writeJson(target, { a: 1, nested: { k: "v" } });
    assert.deepEqual(await readJson(target), { a: 1, nested: { k: "v" } });
    // 덮어쓰기(원자 rename 이 기존 대상을 교체)
    await writeJson(target, { a: 2, b: "x" });
    assert.deepEqual(await readJson(target), { a: 2, b: "x" });
    // 쓰기 후 tmp 파일 잔재가 남지 않아야(성공 경로)
    const leftovers = (await fs.readdir(path.dirname(target))).filter((n) => n.includes(".tmp-"));
    assert.equal(leftovers.length, 0, "성공 쓰기 후 tmp 잔재 없음");
    // trailingNewline 옵션 보존
    await writeJson(target, { a: 3 }, { trailingNewline: false });
    const raw = await fs.readFile(target, "utf8");
    assert.equal(raw.endsWith("\n"), false, "trailingNewline:false 는 개행 없음");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("writeJson: 직렬화 실패(순환참조) 시 tmp 잔재 없이 throw + 기존 파일 무손상", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "io-atomic-err-"));
  try {
    const target = path.join(dir, "x.json");
    await writeJson(target, { ok: true });
    const circular = {};
    circular.self = circular;
    await assert.rejects(() => writeJson(target, circular), /circular|Converting/i);
    // 기존 파일은 그대로(원자성 — 실패가 대상을 truncate 하지 않음)
    assert.deepEqual(await readJson(target), { ok: true }, "직렬화 실패가 기존 파일을 훼손하지 않음");
    const leftovers = (await fs.readdir(dir)).filter((n) => n.includes(".tmp-"));
    assert.equal(leftovers.length, 0, "실패 경로에서도 tmp 잔재 없음");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
