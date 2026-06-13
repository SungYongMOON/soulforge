import assert from "node:assert/strict";
import test from "node:test";

import { checkNode, checkSyntax, checkDb, checkGitignore, checkLive, runDoctor } from "../tools/doctor.mjs";
import { analyze, expectedToken, scanNodeModules } from "../../../../guild_hall/doctor/platform_binary_check.mjs";

test("B2: dev-erp doctor — 개별 체크 통과/고장", async () => {
  assert.equal(checkNode("22.5.0").ok, true);
  assert.equal(checkNode("21.9.0").ok, false);

  assert.equal(checkSyntax(["a.mjs"], () => true).ok, true);
  assert.equal(checkSyntax(["a.mjs", "b.mjs"], (f) => f !== "b.mjs").ok, false);

  // DB 시나리오
  assert.equal(checkDb({ dbExists: false }).ok, true); // warn 허용
  assert.equal(checkDb({ dbExists: false }).warn, true);
  assert.equal(checkDb({ dbExists: true, schemaVersion: "dev_erp.v1", ingestedMtime: "100", realMetaMtime: 100 }).ok, true);
  assert.equal(checkDb({ dbExists: true, schemaVersion: "v999" }).ok, false);
  const stale = checkDb({ dbExists: true, schemaVersion: "dev_erp.v1", ingestedMtime: "100", realMetaMtime: 200 });
  assert.equal(stale.ok, true);
  assert.equal(stale.warn, true); // 재적재 예고

  assert.equal(checkGitignore(() => "data/\n", []).ok, true);
  assert.equal(checkGitignore(() => "", []).ok, false);
  assert.equal(checkGitignore(() => "data/", ["data/x.db"]).ok, false);

  // live: 실패해도 선택 체크라 warn (도구 비종속 — 서버 없는 CI 에서도 안전)
  const down = await checkLive(1, () => { throw new Error("refused"); });
  assert.equal(down.ok, true);
  assert.equal(down.warn, true);
  const up = await checkLive(4300, async () => ({ json: async () => ({ ok: true, counts: { projects: 1 } }) }));
  assert.equal(up.ok, true);
  assert.equal(up.warn, undefined);
});

test("B2: dev-erp doctor — 실제 앱 통합 실행 OK", async () => {
  const r = await runDoctor({ live: false });
  const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.note}`);
  assert.deepEqual(failed, [], failed.join(" | "));
});

test("B2: 플랫폼 바이너리 검사 — 일치/불일치 판정", () => {
  assert.equal(expectedToken("darwin", "arm64"), "darwin-arm64");
  const r1 = analyze(["@esbuild/darwin-arm64"], "darwin", "arm64");
  assert.deepEqual([r1.matches.length, r1.mismatches.length], [1, 0]);
  const r2 = analyze(["@esbuild/darwin-arm64", "@rollup/rollup-linux-x64"], "linux", "x64");
  assert.equal(r2.mismatches.length, 1); // darwin 바이너리가 linux 호스트에서 검출
  assert.equal(r2.matches.length, 1);
  const r3 = analyze(["@esbuild/win32-x64"], "win32", "x64");
  assert.equal(r3.mismatches.length, 0); // win32/win 표기 흡수
  const r4 = analyze(["@esbuild/darwin-x64"], "win32", "x64");
  assert.equal(r4.mismatches.length, 1); // darwin-x64 를 win-x64 로 오인 금지
  // 실제 저장소 스캔은 환경 의존 — 함수가 안전하게 동작하는지만 확인
  const scan = scanNodeModules();
  assert.equal(typeof scan.present, "boolean");
  assert.ok(Array.isArray(scan.found));
});
