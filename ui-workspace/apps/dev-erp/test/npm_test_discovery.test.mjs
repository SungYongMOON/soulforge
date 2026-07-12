import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("npm test 는 자동 발견 글롭 하나로 test/ 전체를 실행한다", () => {
  const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8"));
  // 무따옴표 글롭 단일형이 정답: npm-on-Windows(cmd)·POSIX sh·verify_gate
  // testRunnerCommand(execFileSync) 세 실행 경로 모두에서 node 가 확장/수신한다.
  // 이스케이프 따옴표를 넣으면 verify_gate 경로가 리터럴 따옴표 인자로 pass 0 이 된다.
  assert.equal(pkg.scripts.test, "node --test --test-concurrency=4 test/*.test.mjs");
});

test("test/ 밖·서브디렉터리 *.test.mjs 는 글롭이 못 잡으므로 존재하면 안 된다", () => {
  const testDir = join(appRoot, "test");
  const entries = readdirSync(testDir, { withFileTypes: true });
  const escapees = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = readdirSync(join(testDir, entry.name)).filter((name) => name.endsWith(".test.mjs"));
      escapees.push(...nested.map((name) => `${entry.name}/${name}`));
    }
  }
  assert.deepEqual(escapees, []);
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"));
  assert.ok(files.length >= 32, `test/*.test.mjs ${files.length}개 — 자동 발견 대상이 비정상적으로 줄었다`);
});
