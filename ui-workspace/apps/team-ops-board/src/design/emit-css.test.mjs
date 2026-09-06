// emit-css.test.mjs — 생성된 CSS의 모든 커스텀 프로퍼티가 design-system.mjs에서
// 오는지(그리고 design-system.mjs의 모든 값이 생성 CSS에 나타나는지) 왕복 확인한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { renderCss } from "./emit-css.mjs";
import { colorRoles, colorRolesLight, typography, spacing, radius, elevation, motion } from "./design-system.mjs";

const ROOT_GROUPS = { ...colorRoles, ...typography, ...spacing, ...radius, ...elevation, ...motion };

function extractRootAndLightBlocks(css) {
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/u);
  const lightMatch = css.match(/\[data-theme="light"\]\s*\{([^}]*)\}/u);
  assert.ok(rootMatch, ":root block must exist in generated CSS");
  assert.ok(lightMatch, '[data-theme="light"] block must exist in generated CSS');
  return { root: rootMatch[1], light: lightMatch[1] };
}

function varNamesIn(block) {
  return [...block.matchAll(/--sf-([a-z0-9-]+):/gu)].map((m) => m[1]);
}

test("생성된 CSS의 모든 --sf-* 변수가 design-system.mjs 값에서 온다", () => {
  const css = renderCss();
  const { root, light } = extractRootAndLightBlocks(css);

  const rootVarNames = varNamesIn(root);
  assert.ok(rootVarNames.length > 0);
  for (const name of rootVarNames) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(ROOT_GROUPS, name),
      true,
      `--sf-${name} appeared in :root but has no matching design-system.mjs entry`
    );
  }

  const lightVarNames = varNamesIn(light);
  assert.ok(lightVarNames.length > 0);
  for (const name of lightVarNames) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(colorRolesLight, name),
      true,
      `--sf-${name} appeared in [data-theme="light"] but has no matching colorRolesLight entry`
    );
  }
});

test("design-system.mjs의 모든 :root 그룹 값이 생성된 CSS에 나타난다(왕복)", () => {
  const css = renderCss();
  const { root } = extractRootAndLightBlocks(css);
  const rootVarNames = new Set(varNamesIn(root));
  for (const key of Object.keys(ROOT_GROUPS)) {
    assert.equal(rootVarNames.has(key), true, `design-system.mjs key "${key}" did not reach the generated :root block`);
  }
});

test("committed design-system.generated.css는 renderCss()와 바이트 단위로 같다(결정론)", () => {
  const generatedPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "design-system.generated.css");
  const committed = readFileSync(generatedPath, "utf8");
  assert.equal(committed, renderCss(), "design-system.generated.css is stale — run: node src/design/emit-css.mjs --write");
});
