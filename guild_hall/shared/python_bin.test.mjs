import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pythonBin } from "./python_bin.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("pythonBin: 플랫폼별 python 실행기 이름", () => {
  assert.equal(pythonBin("win32"), "python");
  assert.equal(pythonBin("darwin"), "python3");
  assert.equal(pythonBin("linux"), "python3");
  assert.equal(pythonBin(), process.platform === "win32" ? "python" : "python3");
});

test("pythonBin: 실행 콜사이트가 python3 리터럴 하드코딩으로 회귀하지 않는다", () => {
  // launchd 렌더러(macOS 전용 소비)와 안내 문자열은 대상 아님 — 실행 spawn 2곳만 가드.
  for (const rel of ["guild_hall/town_crier/runtime.mjs", "guild_hall/doctor/cli.mjs"]) {
    const src = readFileSync(path.join(repoRoot, rel), "utf8");
    assert.doesNotMatch(src, /spawnSync\(\s*"python3"/u, `${rel}: spawnSync("python3") 하드코딩 금지`);
    assert.match(src, /from "\.\.\/shared\/python_bin\.mjs"/u, `${rel}: pythonBin 헬퍼 사용`);
  }
});
