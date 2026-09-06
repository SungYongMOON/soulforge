// design-system.test.mjs — design-system.mjs 자체의 세 가지 계약을 고정한다:
//   1. 토큰 이름에 색 단어가 없다(브리프 §3.2 "토큰 이름에 색 단어 금지").
//   2. 도형 어휘(shapeVocabulary) 값에도 색 단어가 없다(2026-09-06 fresh
//      review 전에는 gate/incident 값이 "-blue"/"orange-"를 직접 쓰고 있었다).
//   3. [data-theme="light"] 재정의는 이미 존재하는 토큰만 다시 정의한다(새
//      토큰을 몰래 만들지 않는다).

import test from "node:test";
import assert from "node:assert/strict";

import * as tokens from "./design-system.mjs";
import { colorRoles, colorRolesLight } from "./design-system.mjs";

// 기존 team-ops.css의 위반 사례(--blue --purple --red --green --amber,
// team-ops.css:52-56)를 포함해 흔한 영문 색 이름을 금지어로 둔다.
const FORBIDDEN_COLOR_WORDS = Object.freeze([
  "red", "blue", "green", "purple", "amber", "orange", "yellow", "pink",
  "black", "white", "gray", "grey", "brown", "cyan", "magenta", "violet",
  "indigo", "teal", "maroon", "navy", "gold", "silver",
]);

function collectKeys(value, out) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    out.push(key);
    collectKeys(nested, out);
  }
}

test("토큰 이름에 색 단어가 없다", () => {
  const allKeys = [];
  for (const [exportName, exported] of Object.entries(tokens)) {
    if (typeof exported === "function") continue;
    if (exportName === "default") continue;
    collectKeys(exported, allKeys);
  }
  assert.ok(allKeys.length > 20, "충분히 많은 키를 훑어야 이 테스트가 의미가 있다");

  const offenders = [];
  for (const key of allKeys) {
    const parts = key.toLowerCase().split(/[-_]/u);
    for (const word of FORBIDDEN_COLOR_WORDS) {
      if (parts.includes(word)) offenders.push(`"${key}" contains color word "${word}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("도형 어휘(shapeVocabulary) 값에도 색 단어가 없다", () => {
  // 위 테스트는 키만 본다. shapeVocabulary는 값 자체가 CSS 클래스/역할
  // 이름처럼 쓰이는 문자열이라(예: "dashed-border-planned") 값도 같은
  // 규칙을 지켜야 한다 — 예전 값("dashed-border-blue", "orange-outline")은
  // 이 검사가 있었다면 바로 걸렸을 위반이다.
  const offenders = [];
  for (const [key, value] of Object.entries(tokens.shapeVocabulary)) {
    assert.equal(typeof value, "string", `shapeVocabulary.${key} must be a string`);
    const parts = value.toLowerCase().split(/[-_]/u);
    for (const word of FORBIDDEN_COLOR_WORDS) {
      if (parts.includes(word)) offenders.push(`shapeVocabulary.${key}="${value}" contains color word "${word}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("[data-theme=\"light\"] 재정의는 기존 토큰만 다시 정의한다", () => {
  const lightKeys = Object.keys(colorRolesLight);
  assert.ok(lightKeys.length > 0, "light override가 비어 있으면 안 된다");
  for (const key of lightKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(colorRoles, key),
      true,
      `[data-theme="light"] introduces "${key}" which colorRoles (dark default) does not have`
    );
  }
});

test("designTokens 묶음이 schema_version과 모든 그룹을 갖는다", () => {
  assert.equal(tokens.designTokens.schema_version, tokens.SCHEMA_VERSION);
  assert.equal(tokens.SCHEMA_VERSION, "soulforge.team_ops_board.design_tokens.v1");
  for (const groupName of [
    "colorRoles", "colorRolesLight", "worldPalette", "stateColorRoleMap",
    "stalePattern", "typography", "shapeVocabulary", "shapeMeaning",
    "spacing", "radius", "elevation", "motion", "themePolicy",
  ]) {
    assert.equal(typeof tokens.designTokens[groupName], "object", `missing group "${groupName}"`);
  }
});

test("상태 우선순위는 코드의 FORGE_STATE_PRIORITY와 같은 상태 이름 집합을 쓴다", () => {
  // 값 자체(우선순위 로직)는 forge-map-view.mjs 소유다 — 여기서는 이 토큰이
  // 다루는 상태 이름 집합이 그 상태 어휘와 어긋나지 않는지만 확인한다.
  const stateNames = Object.keys(tokens.stateColorRoleMap).sort();
  assert.deepEqual(stateNames, ["degraded", "down", "hold", "ok", "stale", "unknown"].sort());
  for (const role of Object.values(tokens.stateColorRoleMap)) {
    assert.equal(Object.prototype.hasOwnProperty.call(colorRoles, role), true, `state role "${role}" must exist in colorRoles`);
  }
});
