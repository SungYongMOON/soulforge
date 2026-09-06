// palette.mjs — Canvas 세계 렌더가 조회할 팔레트. design-system.mjs 값을
// 재노출만 한다(자체 literal color가 없다 — lint-literal-colors.test.mjs가
// 강제).
//
// fetch·DOM·타이머·writer 없음. 브리프 §3.1 다이어그램의 `palette.mjs → Canvas/
// SVG 조회 forgeColor(role, theme) → "#hex"`를 구현한다.

import { colorRoles, colorRolesLight, worldPalette } from "./design-system.mjs";

// 세계 채움색 — 지면·물·길·건물 상태 4종·안개·설계도(브리프 §3.2 Canvas 전용
// 팔레트). worldPalette의 kebab-case 키를 세계 렌더가 쓰기 편한 camelCase로만
// 다시 노출한다. 값 자체는 그대로다.
//
// 키 이름은 worldPalette 쪽과 맞춘다(terrain/terrainVariant/blueprint) —
// colorRoles에도 "ground"(HUD 배경색)가 따로 있어서, 여기서 "ground"를 다시
// 쓰면 forgeColor()/colorRoles/worldFills를 함께 보는 소비자 입장에서 같은
// 이름이 두 가지 다른 색을 가리키게 된다(이전에 실제로 그랬다 — 이 리뷰가
// 고친 부분).
export const worldFills = Object.freeze({
  terrain: worldPalette["terrain"],
  terrainVariant: worldPalette["terrain-variant"],
  water: worldPalette["water"],
  waterDeep: worldPalette["water-deep"],
  road: worldPalette["road"],
  built: worldPalette["built"],
  building: worldPalette["building"],
  weathering: worldPalette["weathering"],
  ruin: worldPalette["ruin"],
  fog: worldPalette["fog-overlay"],
  blueprint: worldPalette["blueprint"],
});

// 상태·역할 선 색(semantic strokes) — HUD와 같은 색 원천(colorRoles)을 그대로
// 쓴다. 세계 지도 위 건물 테두리, 사건 외곽선 등에 쓰는 값들이다.
export const semanticStrokes = Object.freeze({
  ok: colorRoles["ok"],
  warn: colorRoles["warn"],
  bad: colorRoles["bad"],
  fog: colorRoles["fog"],
  hold: colorRoles["hold"],
  planned: colorRoles["planned"],
  external: colorRoles["external"],
  accent: colorRoles["accent"],
});

// theme별 조회에 쓰는 내부 결합 테이블. light 쪽은 colorRolesLight가 재정의한
// 역할만 갈아 끼우고, 나머지(세계 채움색·상태색)는 테마와 무관하게 하나다.
//
// colorRoles와 worldPalette는 서로 다른 어휘(HUD 크롬 vs 캔버스 세계)라 같은
// 키를 다른 뜻으로 쓰면 안 된다 — 합치기 전에 겹치는 키가 없는지 확인해
// 한쪽이 다른 쪽을 조용히 덮어쓰는 회귀를 막는다.
const OVERLAPPING_ROLE_KEYS = Object.keys(colorRoles).filter((key) =>
  Object.prototype.hasOwnProperty.call(worldPalette, key)
);
if (OVERLAPPING_ROLE_KEYS.length > 0) {
  throw new Error(
    `palette.mjs: colorRoles and worldPalette must not share keys, found: ${OVERLAPPING_ROLE_KEYS.join(", ")}`
  );
}
const DARK_LOOKUP = Object.freeze({ ...colorRoles, ...worldPalette });

/**
 * 역할 이름으로 색을 조회한다. Canvas 세계 렌더와 향후 SVG 렌더가 같은
 * 조회 하나를 쓰게 하기 위한 함수다(브리프 §3.1).
 *
 * @param {string} role colorRoles 또는 worldPalette의 kebab-case 키.
 * @param {"dark"|"light"} [theme]
 * @returns {string} CSS color 리터럴(#hex 또는 rgba/hsla 함수 표기).
 */
export function forgeColor(role, theme = "dark") {
  if (theme === "light" && Object.prototype.hasOwnProperty.call(colorRolesLight, role)) {
    return colorRolesLight[role];
  }
  if (Object.prototype.hasOwnProperty.call(DARK_LOOKUP, role)) {
    return DARK_LOOKUP[role];
  }
  throw new Error(`forgeColor: unknown role "${role}"`);
}
