import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");

test("UsageTrendChart source restores simple 30-day chart with textual basis label and excludes workarounds", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");

  // Rejected summary markup and CSS classes are completely removed
  assert.doesNotMatch(source, /usage-trend-latest/u);
  assert.doesNotMatch(source, /data-testid="usage-trend-latest"/u);
  assert.doesNotMatch(css, /\.usage-trend-latest/u);

  // Rejected 7/30-day toggle workaround is removed
  assert.doesNotMatch(source, /const \[range, setRange\] = useState/u);
  assert.doesNotMatch(source, /className="usage-trend-ranges"/u);
  assert.doesNotMatch(source, /chooseRange/u);
  assert.doesNotMatch(css, /\.usage-trend-ranges/u);

  // Textual basis label supports complete and partial coverage
  assert.match(source, /토큰 관측일 기준/u);
  assert.match(source, /토큰 관측일 우선 · 미근거 항목은 시작일 기준/u);
  assert.match(source, /KST 최근 30일\{basisLabel\}/u);

  // View switch remains present (model vs provider)
  assert.match(source, /const \[view, setView\] = useState<"model" \| "provider">\("model"\);/u);
  assert.match(source, /className="usage-trend-tabs" role="tablist" aria-label="사용량 분류"/u);
  assert.match(source, /data-view=\{view\}/u);
});

test("buildUsageTrendChart strictly supports 30 days and computes 30-day x, ticks, hit-grid, and keyboard bounds", () => {
  const source = readFileSync(APP_PATH, "utf8");

  // Strict support for 30 days
  assert.match(source, /if \(days\.length !== 30 \|\| series\.length === 0\) return null;/u);

  // 30-day x coordinate calculation
  assert.match(source, /const x = \(index: number\) => left \+ \(index \* plotWidth\) \/ \(days\.length - 1\);/u);

  // Stride 5 ticks for 30-day view
  assert.match(source, /index % 5 === 0 \|\| index === days\.length - 1/u);

  // 30-day hit-grid column count and keyboard bounds
  assert.match(source, /gridTemplateColumns:\s*`repeat\(\$\{days\.length\},\s*minmax\(0,\s*1fr\)\)`/u);
  assert.match(source, /Math\.min\(days\.length - 1,\s*Math\.max\(0,\s*index \+ offset\)\)/u);

  // 30-day aria-label
  assert.match(source, /aria-label=\{`최근 30일 \$\{view === "model" \? "모델별" : "제공자별"\}/u);
});

test("30-day coordinate geometry and stride-5 tick distribution evaluate accurately across 30 days", () => {
  const left = 58;
  const right = 12;
  const width = 1000;
  const plotWidth = width - left - right; // 930

  const days30 = Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
  const x30 = (index) => left + (index * plotWidth) / (days30.length - 1);

  assert.equal(x30(0), left, "First x in 30-day view matches left edge");
  assert.equal(x30(29), left + plotWidth, "Last x in 30-day view matches right edge");

  const ticks30 = days30
    .map((_, index) => index)
    .filter((index) => index % 5 === 0 || index === days30.length - 1);
  assert.deepEqual(ticks30, [0, 5, 10, 15, 20, 25, 29], "30-day view renders ticks every 5 days plus the last day");

  const keyClamp30 = (index, offset) => Math.min(days30.length - 1, Math.max(0, index + offset));
  assert.equal(keyClamp30(29, 1), 29, "Right arrow clamps at index 29 in 30-day view");
  assert.equal(keyClamp30(0, -1), 0, "Left arrow clamps at index 0 in 30-day view");
});
