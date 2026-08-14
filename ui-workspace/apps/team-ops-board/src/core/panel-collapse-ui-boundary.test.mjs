import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(SRC_ROOT, "App.tsx");
const CSS_PATH = join(SRC_ROOT, "team-ops.css");

test("panel collapse UI: 네 화면의 주요 패널과 동적 업무 그룹에 동일한 제어를 연결한다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  for (const panelId of [
    "owner.limits",
    "owner.models",
    "owner.usage",
    "owner.realtime",
    "organization.workspace",
    "work.activity",
    "work.distribution",
    "work.usage_meter",
    "system.watchtower",
    "system.engineering",
  ]) {
    assert.equal(source.includes(`usePersistentPanelCollapse("${panelId}")`), true, panelId);
  }
  assert.match(source, /const panelId = `work\.group\.\$\{group\.organization_group_id\}`/u);
  assert.match(source, /aria-expanded=\{!collapsed\}/u);
  assert.match(source, /aria-controls=\{`panel-collapse-/u);
});

test("panel collapse UI: 본문만 접고 헤더·접근성·작은 화면 제어를 유지한다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /function CollapsiblePanelBody/u);
  assert.match(source, /hidden=\{collapsed\}/u);
  assert.match(css, /\.panel-collapse-body\s*\{\s*display:\s*contents;/u);
  assert.match(css, /\.panel-collapse-body\[hidden\]\s*\{\s*display:\s*none;/u);
  assert.match(css, /\.panel-collapse-button:focus-visible/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.panel-collapse-button\s*\{[^}]*min-height:\s*44px/u);
});
