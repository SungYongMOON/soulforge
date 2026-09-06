// palette.test.mjs — 팔레트 값이 토큰 값과 같은지(참조 또는 문자열 일치)
// 확인한다. palette.mjs는 재노출만 해야 하므로, 값이 달라지면 palette.mjs가
// 어딘가에서 literal을 다시 적었다는 신호다.

import test from "node:test";
import assert from "node:assert/strict";

import { worldFills, semanticStrokes, forgeColor } from "./palette.mjs";
import { colorRoles, colorRolesLight, worldPalette } from "./design-system.mjs";

test("semanticStrokes는 colorRoles와 문자열이 같다", () => {
  assert.equal(semanticStrokes.ok, colorRoles["ok"]);
  assert.equal(semanticStrokes.warn, colorRoles["warn"]);
  assert.equal(semanticStrokes.bad, colorRoles["bad"]);
  assert.equal(semanticStrokes.fog, colorRoles["fog"]);
  assert.equal(semanticStrokes.hold, colorRoles["hold"]);
  assert.equal(semanticStrokes.planned, colorRoles["planned"]);
  assert.equal(semanticStrokes.external, colorRoles["external"]);
  assert.equal(semanticStrokes.accent, colorRoles["accent"]);
});

test("worldFills는 worldPalette와 문자열이 같다", () => {
  assert.equal(worldFills.terrain, worldPalette["terrain"]);
  assert.equal(worldFills.terrainVariant, worldPalette["terrain-variant"]);
  assert.equal(worldFills.water, worldPalette["water"]);
  assert.equal(worldFills.waterDeep, worldPalette["water-deep"]);
  assert.equal(worldFills.road, worldPalette["road"]);
  assert.equal(worldFills.built, worldPalette["built"]);
  assert.equal(worldFills.building, worldPalette["building"]);
  assert.equal(worldFills.weathering, worldPalette["weathering"]);
  assert.equal(worldFills.ruin, worldPalette["ruin"]);
  assert.equal(worldFills.fog, worldPalette["fog-overlay"]);
  assert.equal(worldFills.blueprint, worldPalette["blueprint"]);
});

test("forgeColor(role) is dark 기본값과 같다", () => {
  assert.equal(forgeColor("ok"), colorRoles["ok"]);
  assert.equal(forgeColor("ground"), colorRoles["ground"]);
  assert.equal(forgeColor("built"), worldPalette["built"]);
});

test("forgeColor(role, \"light\")는 재정의된 역할만 갈아 끼운다", () => {
  assert.equal(forgeColor("ground", "light"), colorRolesLight["ground"]);
  assert.equal(forgeColor("ink-1", "light"), colorRolesLight["ink-1"]);
  // colorRolesLight가 재정의하지 않는 역할(예: 상태색)은 dark 값 그대로다.
  assert.equal(forgeColor("ok", "light"), colorRoles["ok"]);
  assert.equal(forgeColor("built", "light"), worldPalette["built"]);
});

test("forgeColor는 모르는 역할에 대해 던진다", () => {
  assert.throws(() => forgeColor("not-a-real-role"));
});
