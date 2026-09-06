// emit-css.mjs — design-system.mjs 값을 CSS custom property 문자열로
// 렌더링하는 순수 함수 + 결정론적 CLI.
//
// renderCss()는 fetch·DOM·타이머·writer가 없는 순수 함수다. 이 파일은 literal
// color를 하나도 갖지 않는다 — 전부 design-system.mjs에서 가져다 순회만 한다
// (lint-literal-colors.test.mjs가 이 경계를 강제한다).
//
// CLI(파일을 직접 실행했을 때만)는 `--write`를 줘야 실제로
// src/design/design-system.generated.css에 쓴다. 인자 없이 실행하면 렌더링
// 결과를 stdout에 미리보기로 찍기만 한다(guild_hall/buzz_history/
// buzz_runtime_manifest_emitter.mjs의 --write 관례와 동일).
//
// App.tsx / team-ops.css에 이 출력을 실제로 연결하는 배선은 S2 몫이다(이
// lane에서는 생성 파일만 만들고 아무 데도 import하지 않는다).

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  SCHEMA_VERSION,
  colorRoles,
  colorRolesLight,
  typography,
  spacing,
  radius,
  elevation,
  motion,
} from "./design-system.mjs";

const ROOT_GROUPS = Object.freeze([colorRoles, typography, spacing, radius, elevation, motion]);

const OUTPUT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "design-system.generated.css");
const GENERATED_HEADER = `/* AUTO-GENERATED — do not hand-edit.
 * Source: src/design/design-system.mjs (${SCHEMA_VERSION})
 * Regenerate: node src/design/emit-css.mjs --write
 */
`;

// 한 그룹의 [key, value] 쌍을 "  --sf-<key>: <value>;" 줄로 기계적으로 바꾼다.
// 매핑 표가 따로 없다 — design-system.mjs의 키가 이미 `--sf-` 뒤에 붙일 kebab-case다.
function renderDeclarations(group) {
  return Object.entries(group)
    .map(([key, value]) => `  --sf-${key}: ${value};`)
    .join("\n");
}

export function renderCss() {
  const rootBody = ROOT_GROUPS.map(renderDeclarations).join("\n");
  const lightBody = renderDeclarations(colorRolesLight);
  return (
    GENERATED_HEADER +
    "\n" +
    ":root {\n" +
    rootBody +
    "\n}\n\n" +
    '[data-theme="light"] {\n' +
    lightBody +
    "\n}\n"
  );
}

function main(argv) {
  const css = renderCss();
  if (argv.includes("--write")) {
    writeFileSync(OUTPUT_PATH, css, "utf8");
    process.stdout.write(`wrote ${css.length} bytes to ${OUTPUT_PATH}\n`);
    return 0;
  }
  if (argv.includes("--check")) {
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf8") : null;
    if (current !== css) {
      process.stderr.write("design-system.generated.css is stale — run: node src/design/emit-css.mjs --write\n");
      return 1;
    }
    process.stdout.write("design-system.generated.css is up to date\n");
    return 0;
  }
  process.stdout.write(css);
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath !== null && invokedPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  process.exitCode = main(process.argv.slice(2));
}
