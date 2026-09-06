// lint-literal-colors.test.mjs — src/design/** 안에서 literal color(hex 또는
// rgba?/hsla? 함수 호출)가 design-system.mjs 바깥에 있으면 실패한다(브리프
// §3.1 "컴포넌트에 literal hex 금지 … 예외 파일은 tokens.mjs 하나").
//
// (2026-09-06 fresh review: 파일명을 lint-tokens.test.mjs에서 바꿨다 — 이유는
// design-system.mjs 헤더 주석 참고. 검사 범위를 hex 리터럴뿐 아니라 rgba·hsla
// 계열 색 함수 호출까지 넓혔다 — "literal color" 하나로 통칭한다.)
//
// 범위는 지금은 src/design/**뿐이다. 저장소 전체(team-ops.css의 1,195개 등)로
// 넓히는 것은 S6의 `npm run lint:tokens`가 한다 — 이 테스트는 그 축소판이다.
//
// 제외:
//   - design-system.mjs: 유일한 literal 예외 파일 그 자체.
//   - design-system.generated.css: design-system.mjs에서 기계적으로 생성된
//     산출물이다. 값이 design-system.mjs와 같은지는 emit-css.test.mjs의 왕복
//     테스트가 이미 확인한다 — "다른 곳에 새로 적힌 색"이 아니라 같은 값의
//     CSS 투영이라 여기서는 본다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN_DIR = dirname(fileURLToPath(import.meta.url));
const ALLOWED_FILES = new Set(["design-system.mjs", "design-system.generated.css"]);
const SCANNED_EXTENSIONS = new Set([".mjs", ".css", ".ts", ".tsx", ".js", ".jsx"]);
const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/gu;

function listFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      listFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

test("src/design/** 안 literal color는 design-system.mjs에만 있다", () => {
  const files = listFiles(DESIGN_DIR).filter((full) => {
    const ext = full.slice(full.lastIndexOf("."));
    return SCANNED_EXTENSIONS.has(ext);
  });
  assert.ok(files.length >= 5, "스캔 대상 파일이 비정상적으로 적다 — 경로 확인 필요");

  const offenders = [];
  for (const full of files) {
    const rel = relative(DESIGN_DIR, full).replace(/\\/gu, "/");
    if (ALLOWED_FILES.has(rel)) continue;
    const text = readFileSync(full, "utf8");
    const matches = text.match(COLOR_PATTERN);
    if (matches) {
      offenders.push(`${rel}: ${[...new Set(matches)].join(", ")}`);
    }
  }
  assert.deepEqual(offenders, [], `literal color found outside design-system.mjs:\n${offenders.join("\n")}`);
});
