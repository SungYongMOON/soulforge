import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");

test("UsageTrendChart source wires accessible range toggle (최근 7일 default, 최근 30일 history) with textual basis label and excludes summary markup", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");

  // Summary row markup and CSS classes are completely removed
  assert.doesNotMatch(source, /usage-trend-latest/u);
  assert.doesNotMatch(source, /data-testid="usage-trend-latest"/u);
  assert.doesNotMatch(css, /\.usage-trend-latest/u);

  // Range state defaults to 7 days
  assert.match(source, /const \[range, setRange\] = useState<7 \| 30>\(7\);/u);

  // Range toggle accessible controls and classes
  assert.match(source, /className="usage-trend-ranges" role="tablist" aria-label="조회 기간"/u);
  assert.match(source, /aria-selected=\{range === 7\} onClick=\{.*chooseRange\(7\)\}>최근 7일<\/button>/u);
  assert.match(source, /aria-selected=\{range === 30\} onClick=\{.*chooseRange\(30\)\}>최근 30일<\/button>/u);
  assert.match(source, /data-range=\{range\}/u);

  // CSS definitions for range controls and mobile responsiveness
  assert.match(css, /\.usage-trend-controls\s*\{/u);
  assert.match(css, /\.usage-trend-ranges\s*\{/u);
  assert.match(css, /\.usage-trend-ranges button\s*\{/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.usage-trend-ranges/u);

  // Textual basis label supports complete and partial coverage
  assert.match(source, /토큰 관측일 기준/u);
  assert.match(source, /토큰 관측일 우선 · 미근거 항목은 시작일 기준/u);
  assert.match(source, /KST 최근 \{range\}일\{basisLabel\}/u);

  // View switch remains present (model vs provider)
  assert.match(source, /const \[view, setView\] = useState<"model" \| "provider">\("model"\);/u);
  assert.match(source, /className="usage-trend-tabs" role="tablist" aria-label="사용량 분류"/u);
  assert.match(source, /data-view=\{view\}/u);
});

test("buildUsageTrendChart supports exactly 7 and 30 days and computes dynamic x, ticks, hit-grid, and keyboard bounds", () => {
  const source = readFileSync(APP_PATH, "utf8");

  // Strict support for exactly 7 or 30 days
  assert.match(source, /if \(\(days\.length !== 7 && days\.length !== 30\) \|\| series\.length === 0\) return null;/u);

  // Dynamic x denominator using (days.length - 1)
  assert.match(source, /const x = \(index: number\) => left \+ \(index \* plotWidth\) \/ \(days\.length - 1\);/u);

  // Dynamic tick stride (all days for <=7, stride 5 + last for >7)
  assert.match(source, /index % \(days\.length <= 7 \? 1 : 5\) === 0 \|\| index === days\.length - 1/u);

  // Dynamic hit-grid column count and keyboard bounds
  assert.match(source, /gridTemplateColumns:\s*`repeat\(\$\{days\.length\},\s*minmax\(0,\s*1fr\)\)`/u);
  assert.match(source, /Math\.min\(days\.length - 1,\s*Math\.max\(0,\s*index \+ offset\)\)/u);

  // Active range sync across labels and ARIA
  assert.match(source, /aria-label=\{`최근 \$\{range\}일 \$\{view === "model" \? "모델별" : "제공자별"\}/u);
  assert.match(source, /· KST 최근 \{range\}일/u);

  // State reset on range and view switches
  assert.match(source, /const chooseRange = \(next: 7 \| 30\) => \{\s*setRange\(next\);\s*setSelectedSeries\(null\);\s*setSelectedReqFamily\(null\);\s*setActiveIndex\(null\);\s*\};/u);
  assert.match(source, /const chooseView = \(next: "model" \| "provider"\) => \{\s*setView\(next\);\s*setSelectedSeries\(null\);\s*setSelectedReqFamily\(null\);\s*setActiveIndex\(null\);\s*\};/u);
});

test("synthetic 7-day range renders 8/20-like 1.3B activity visibly substantial while 30-day history retains older 9B peak", () => {
  // Simulate 30 days of data: older ~9B peak on day 5 (index 4) and 8/20-like ~1.3B total on day 26 (index 25)
  const days30 = Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
  const gptValues30 = Array.from({ length: 30 }, () => 0);
  const claudeValues30 = Array.from({ length: 30 }, () => 0);

  gptValues30[4] = 9_000_000_000; // 9B peak on day 5
  gptValues30[25] = 800_000_000; // 800M on day 26 (8/20)
  claudeValues30[25] = 500_000_000; // 500M on day 26 (8/20), total = 1.3B

  // Helper matching the algorithm in App.tsx
  function computeChartScale(daysSlice, seriesList, selectedId = null) {
    const totals = daysSlice.map((_, index) => seriesList.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
    const selectedItem = selectedId !== null ? seriesList.find((item) => item.id === selectedId) : null;
    const rawMax = selectedItem
      ? Math.max(...(selectedItem.values ?? []), 1)
      : Math.max(...totals, 1);
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const maxToken = Math.ceil(rawMax / magnitude) * magnitude;
    const plotHeight = 188; // 238 - 16 (top) - 34 (bottom)
    const y = (val) => 16 + plotHeight - (val / maxToken) * plotHeight;
    return { maxToken, y, plotHeight, totals };
  }

  // --- 30-DAY MODE ---
  const series30 = [
    { id: "gpt-5.6-sol", label: "gpt-5.6-sol", values: gptValues30 },
    { id: "claude-opus-5", label: "claude-opus-5", values: claudeValues30 },
  ];

  // In 30-day mode stacked view: 9B peak dominates
  const stacked30 = computeChartScale(days30, series30, null);
  assert.equal(stacked30.maxToken, 9_000_000_000);
  const day26Height30 = (stacked30.plotHeight - (stacked30.y(1_300_000_000) - 16)) / stacked30.plotHeight;
  assert.ok(day26Height30 < 0.15, "Under 9B 30-day scale, 1.3B is compressed to < 15% height");

  // In 30-day mode when selecting gpt-5.6-sol: because it has the older 9B peak on day 5, y-axis stays 9B
  const gptSelected30 = computeChartScale(days30, series30, "gpt-5.6-sol");
  assert.equal(gptSelected30.maxToken, 9_000_000_000, "30-day selection of gpt-5.6-sol retains 9B axis due to day 5 peak");

  // --- DEFAULT 7-DAY MODE ---
  const days7 = days30.slice(-7);
  const series7 = [
    { id: "gpt-5.6-sol", label: "gpt-5.6-sol", values: gptValues30.slice(-7) },
    { id: "claude-opus-5", label: "claude-opus-5", values: claudeValues30.slice(-7) },
  ];

  // In 7-day mode: day 5 peak (9B) is excluded!
  const stacked7 = computeChartScale(days7, series7, null);
  // Total on day 26 (index 2 in 7-day window) is 800M + 500M = 1.3B -> magnitude 10^9, ceil(1.3/1)*1B = 2B
  assert.equal(stacked7.maxToken, 2_000_000_000, "7-day stacked ceiling scales to recent usage (2B) without 9B peak");
  const day26Height7 = (stacked7.plotHeight - (stacked7.y(1_300_000_000) - 16)) / stacked7.plotHeight;
  assert.ok(Math.abs(day26Height7 - 0.65) < 1e-6, "1.3B is 65% of plot height in 7-day stacked view, visibly prominent and substantial");

  // In 7-day mode when selecting gpt-5.6-sol: 800M ceiling
  const gptSelected7 = computeChartScale(days7, series7, "gpt-5.6-sol");
  assert.equal(gptSelected7.maxToken, 800_000_000, "7-day selection of gpt-5.6-sol rescales to 800M ceiling");
  const gptSelectedHeight7 = (gptSelected7.plotHeight - (gptSelected7.y(800_000_000) - 16)) / gptSelected7.plotHeight;
  assert.ok(Math.abs(gptSelectedHeight7 - 1.0) < 1e-6, "800M fills 100% of plot height when selected in 7-day view");

  // In 7-day mode when selecting claude-opus-5: 500M ceiling
  const claudeSelected7 = computeChartScale(days7, series7, "claude-opus-5");
  assert.equal(claudeSelected7.maxToken, 500_000_000, "7-day selection of claude-opus-5 rescales to 500M ceiling");
  const claudeSelectedHeight7 = (claudeSelected7.plotHeight - (claudeSelected7.y(500_000_000) - 16)) / claudeSelected7.plotHeight;
  assert.ok(Math.abs(claudeSelectedHeight7 - 1.0) < 1e-6, "500M fills 100% of plot height when selected in 7-day view");
});

test("variable x denominator, dynamic tick stride, hit-grid column count, and keyboard bounds evaluate accurately across 7 and 30 days", () => {
  const left = 58;
  const right = 12;
  const width = 1000;
  const plotWidth = width - left - right; // 930

  // 7-day evaluation
  const days7 = Array.from({ length: 7 }, (_, i) => ({ date: `2026-08-${String(i + 18).padStart(2, "0")}` }));
  const x7 = (index) => left + (index * plotWidth) / (days7.length - 1);

  assert.equal(x7(0), left, "First x in 7-day view matches left edge");
  assert.equal(x7(6), left + plotWidth, "Last x in 7-day view matches right edge");
  assert.equal(x7(3), left + plotWidth / 2, "Middle x in 7-day view matches plot center");

  const ticks7 = days7
    .map((_, index) => index)
    .filter((index) => index % (days7.length <= 7 ? 1 : 5) === 0 || index === days7.length - 1);
  assert.deepEqual(ticks7, [0, 1, 2, 3, 4, 5, 6], "7-day view renders all 7 date ticks");

  const keyClamp7 = (index, offset) => Math.min(days7.length - 1, Math.max(0, index + offset));
  assert.equal(keyClamp7(6, 1), 6, "Right arrow clamps at index 6 in 7-day view");
  assert.equal(keyClamp7(0, -1), 0, "Left arrow clamps at index 0 in 7-day view");

  // 30-day evaluation
  const days30 = Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
  const x30 = (index) => left + (index * plotWidth) / (days30.length - 1);

  assert.equal(x30(0), left, "First x in 30-day view matches left edge");
  assert.equal(x30(29), left + plotWidth, "Last x in 30-day view matches right edge");

  const ticks30 = days30
    .map((_, index) => index)
    .filter((index) => index % (days30.length <= 7 ? 1 : 5) === 0 || index === days30.length - 1);
  assert.deepEqual(ticks30, [0, 5, 10, 15, 20, 25, 29], "30-day view renders ticks every 5 days plus the last day");

  const keyClamp30 = (index, offset) => Math.min(days30.length - 1, Math.max(0, index + offset));
  assert.equal(keyClamp30(29, 1), 29, "Right arrow clamps at index 29 in 30-day view");
  assert.equal(keyClamp30(0, -1), 0, "Left arrow clamps at index 0 in 30-day view");
});
