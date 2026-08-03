import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runGuard,
  verify,
  verifyLeanRoot,
  snapshot,
  sha256,
  SOURCES,
  DIGEST_PATH,
  MANIFEST_PATH,
  ROOT_MIN_LINES,
  ROOT_MAX_LINES,
  ROOT_REQUIRED_SNIPPETS
} from "./boot_digest_guard.mjs";

function leanRootFixture(extraLines = []) {
  const required = ROOT_REQUIRED_SNIPPETS.map((snippet) => `- ${snippet}`);
  const padding = Array.from(
    { length: Math.max(0, ROOT_MIN_LINES - required.length - extraLines.length) },
    (_, index) => `- padding ${index}`
  );
  return [...required, ...padding, ...extraLines].join("\n") + "\n";
}

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "digest-"));
  mkdirSync(join(root, "docs/architecture/foundation"), { recursive: true });
  for (const rel of SOURCES) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), rel === "AGENTS.md" ? leanRootFixture() : `# src ${rel}\nrule line\n`);
  }
  writeFileSync(join(root, DIGEST_PATH), "# digest\n요약 줄\n");
  return root;
}

test("B3: 드리프트 가드 — update→OK→원본 변경 시 FAIL→재서명 복구", () => {
  const root = makeFixtureRepo();
  // 최초 검사: manifest 없음 → fail
  const first = runGuard({ root });
  assert.equal(first.ok, false);
  // --update 로 서명
  assert.equal(runGuard({ root, update: true }).ok, true);
  assert.equal(runGuard({ root }).ok, true);
  // 원본 변경 → 드리프트 검출
  writeFileSync(join(root, SOURCES[0]), leanRootFixture(["- changed"]));
  const drift = runGuard({ root });
  assert.equal(drift.ok, false);
  assert.ok(drift.problems.some((p) => p.includes("드리프트") && p.includes(SOURCES[0])));
  // 다이제스트 재검토 후 재서명 → 복구
  assert.equal(runGuard({ root, update: true }).ok, true);
  assert.equal(runGuard({ root }).ok, true);
  // 다이제스트만 수정 → manifest 재서명 요구
  writeFileSync(join(root, DIGEST_PATH), "# digest v2\n바뀐 요약\n");
  const digestChanged = runGuard({ root });
  assert.equal(digestChanged.ok, false);
  assert.ok(digestChanged.problems.some((p) => p.includes("재서명")));
});

test("B3: Lean Root 줄 범위와 필수 포인터를 fail-closed로 검증", () => {
  assert.equal(verifyLeanRoot(leanRootFixture()).ok, true);

  const tooShort = ROOT_REQUIRED_SNIPPETS.map((snippet) => `- ${snippet}`).join("\n");
  assert.ok(verifyLeanRoot(tooShort).problems.some((p) => p.includes("Lean Root 범위")));

  const tooLong = leanRootFixture(Array.from({ length: ROOT_MAX_LINES }, (_, index) => `- extra ${index}`));
  assert.ok(verifyLeanRoot(tooLong).problems.some((p) => p.includes("Lean Root 범위")));

  const missing = leanRootFixture().replace(ROOT_REQUIRED_SNIPPETS[0], "missing-pointer");
  assert.ok(verifyLeanRoot(missing).problems.some((p) => p.includes(ROOT_REQUIRED_SNIPPETS[0])));
});

test("B3: 100줄 상한 + 원본 누락 검출", () => {
  const root = makeFixtureRepo();
  runGuard({ root, update: true });
  // 101줄 다이제스트 → fail
  writeFileSync(join(root, DIGEST_PATH), Array.from({ length: 101 }, (_, i) => `줄 ${i}`).join("\n"));
  runGuard({ root, update: true }); // 재서명해도
  const tooLong = runGuard({ root });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.problems.some((p) => p.includes("상한")));
  // verify 순수 함수: 원본 누락
  const cur = snapshot(root);
  cur[SOURCES[1]] = { missing: true };
  const v = verify({ manifest: { sources: snapshot(root) }, current: cur, digestText: "한 줄" });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("원본 누락")));
  assert.equal(typeof sha256("x"), "string");
});

test("B3: 실제 저장소 — 다이제스트와 manifest 동기 상태", () => {
  const r = runGuard({});
  assert.deepEqual(r.problems, [], r.problems.join(" | "));
  assert.equal(r.ok, true);
});
