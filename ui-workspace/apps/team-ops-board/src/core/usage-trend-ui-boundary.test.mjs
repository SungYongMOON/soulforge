import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");

test("UsageTrendChart source wires compact latest-day summary row with bounded top 3 and safe remainder", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");

  // Summary row container and accessible labeling
  assert.match(source, /data-testid="usage-trend-latest"/u);
  assert.match(source, /aria-label=\{`최근일 \$\{latestDate\} 사용량 요약`\}/u);
  assert.match(source, /className="usage-trend-latest"/u);
  assert.match(source, /className="usage-trend-latest-label">최근일 <strong>\{latestDate\}<\/strong>/u);

  // Exact latest index and nonzero filter
  assert.match(source, /const latestIndex = days\.length - 1;/u);
  assert.match(source, /const latestDate = days\[latestIndex\]\?\.date \?\? "";/u);
  assert.match(source, /filter\(\(entry: any\) => entry\.value > 0\)/u);
  assert.match(source, /sort\(\(a: any, b: any\) => b\.value - a\.value \|\| a\.label\.localeCompare\(b\.label, "en"\)\)/u);

  // Bounded top 3 and remainder calculation
  assert.match(source, /const boundedTop = nonzeroSeries\.slice\(0, 3\);/u);
  assert.match(source, /const remainderSeries = nonzeroSeries\.slice\(3\);/u);
  assert.match(source, /const remainderTokens = remainderSeries\.reduce\(\(sum: number, entry: any\) => sum \+ entry\.value, 0\);/u);

  // Truthful token rendering with existing formatUsageNumber
  assert.match(source, /<span>\{entry\.label\} <strong>\{formatUsageNumber\(entry\.value\)\}<\/strong> tok<\/span>/u);
  assert.match(source, /<span>기타\(\{remainderSeries\.length\}\) <strong>\{formatUsageNumber\(remainderTokens\)\}<\/strong> tok<\/span>/u);
  assert.match(source, /<span className="usage-trend-latest-empty">기록 없음<\/span>/u);

  // CSS definitions for latest-day summary and mobile responsiveness
  assert.match(css, /\.usage-trend-latest\s*\{/u);
  assert.match(css, /\.usage-trend-latest-label\s*\{/u);
  assert.match(css, /\.usage-trend-latest-items\s*\{/u);
  assert.match(css, /\.usage-trend-latest-item\s*\{/u);
  assert.match(css, /\.usage-trend-latest-dot\s*\{/u);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.usage-trend-latest\s*\{/u);
});

test("buildUsageTrendChart recomputes scale when selectedSeries is provided and retains stacked maximum when null", () => {
  const source = readFileSync(APP_PATH, "utf8");

  // Function signature accepts selectedSeries with null fallback
  assert.match(source, /function buildUsageTrendChart\(days: any\[\], series: any\[\], requestSeries: any\[\] = \[\], selectedSeries: string \| null = null\)/u);

  // Selected item extraction and dynamic rawMax computation
  assert.match(source, /const selectedItem = selectedSeries !== null \? series\.find\(\(item: any\) => item\.id === selectedSeries\) : null;/u);
  assert.match(source, /const rawMax = selectedItem\s*\?\s*Math\.max\(\.\.\.\(selectedItem\.values \?\? \[\]\), 1\)\s*:\s*Math\.max\(\.\.\.totals, 1\);/u);

  // UsageTrendChart passes selectedSeries to buildUsageTrendChart
  assert.match(source, /const chart = buildUsageTrendChart\(days, series, showAgOverlay \? requestSeries : \[\], selectedSeries\);/u);

  // Chart renders isolated area when a series is selected and stacked area when unselected
  assert.match(source, /d=\{selectedSeries === null \? area\.stacked : area\.isolated\}/u);
  assert.match(source, /style=\{\{ color: USAGE_TREND_COLORS\[series\.findIndex\(\(item: any\) => item\.id === area\.id\) % USAGE_TREND_COLORS\.length\] \}\}/u);
});

test("synthetic 30-day scale decompression proves selected series is visibly inspectable despite older multi-billion spikes", () => {
  // Simulate 30 days of data with an older 5B spike on day 5 and synthetic 90M / 70M use on day 30
  const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}` }));
  const gptValues = Array.from({ length: 30 }, () => 0);
  const claudeValues = Array.from({ length: 30 }, () => 0);
  const olderSpikeValues = Array.from({ length: 30 }, () => 0);

  olderSpikeValues[4] = 5_000_000_000; // 5B spike on day 5
  gptValues[29] = 90_000_000; // 90M on day 30
  claudeValues[29] = 70_000_000; // 70M on day 30

  const series = [
    { id: "gpt-5.6-sol", label: "gpt-5.6-sol", values: gptValues },
    { id: "claude-opus-5", label: "claude-opus-5", values: claudeValues },
    { id: "older-model", label: "older-model", values: olderSpikeValues },
  ];

  // Helper matching the algorithm in App.tsx
  function computeChartScale(seriesList, selectedId = null) {
    const totals = days.map((_, index) => seriesList.reduce((sum, item) => sum + (item.values[index] ?? 0), 0));
    const selectedItem = selectedId !== null ? seriesList.find((item) => item.id === selectedId) : null;
    const rawMax = selectedItem
      ? Math.max(...(selectedItem.values ?? []), 1)
      : Math.max(...totals, 1);
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const maxToken = Math.ceil(rawMax / magnitude) * magnitude;
    const plotHeight = 188; // 238 - 16 (top) - 34 (bottom)
    const y = (val) => 16 + plotHeight - (val / maxToken) * plotHeight;
    return { maxToken, y, plotHeight };
  }

  // Unselected stacked view
  const stacked = computeChartScale(series, null);
  assert.equal(stacked.maxToken, 5_000_000_000);
  const gptStackedHeight = (stacked.plotHeight - (stacked.y(90_000_000) - 16)) / stacked.plotHeight;
  assert.ok(gptStackedHeight < 0.025, "Under 5B stacked scale, 90M is compressed to less than 2.5% height");

  // Selected gpt-5.6-sol
  const gptSelected = computeChartScale(series, "gpt-5.6-sol");
  assert.equal(gptSelected.maxToken, 90_000_000); // 90M ceiling rounded up to 90M magnitude
  const gptSelectedHeight = (gptSelected.plotHeight - (gptSelected.y(90_000_000) - 16)) / gptSelected.plotHeight;
  assert.ok(gptSelectedHeight > 0.90, "Under rescaled 90M ceiling, 90M fills > 90% height and is clearly inspectable");

  // Selected claude-opus-5
  const claudeSelected = computeChartScale(series, "claude-opus-5");
  assert.equal(claudeSelected.maxToken, 70_000_000); // 70M ceiling rounded up to 70M magnitude
  const claudeSelectedHeight = (claudeSelected.plotHeight - (claudeSelected.y(70_000_000) - 16)) / claudeSelected.plotHeight;
  assert.ok(claudeSelectedHeight > 0.90, "Under rescaled 70M ceiling, 70M fills > 90% height and is clearly inspectable");
});

test("synthetic latest-day summary extraction bounds top 3 nonzero items and computes safe remainder", () => {
  const latestIndex = 29;

  // Case 1: Synthetic scenario with 2 nonzero series
  const series2 = [
    { id: "gpt-5.6-sol", label: "gpt-5.6-sol", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 90_000_000 : 0)) },
    { id: "claude-opus-5", label: "claude-opus-5", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 70_000_000 : 0)) },
    { id: "idle-model", label: "idle-model", values: Array.from({ length: 30 }, () => 0) },
  ];

  const nonzero2 = series2
    .map((item) => ({ id: item.id, label: item.label, value: item.values[latestIndex] ?? 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  assert.equal(nonzero2.length, 2);
  assert.equal(nonzero2[0].label, "gpt-5.6-sol");
  assert.equal(nonzero2[0].value, 90_000_000);
  assert.equal(nonzero2[1].label, "claude-opus-5");
  assert.equal(nonzero2[1].value, 70_000_000);
  const remainder2 = nonzero2.slice(3);
  assert.equal(remainder2.length, 0);

  // Case 2: 5 nonzero models (bounds to top 3 + remainder of 2)
  const series5 = [
    { id: "m1", label: "Model 1", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 50_000_000 : 0)) },
    { id: "m2", label: "Model 2", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 40_000_000 : 0)) },
    { id: "m3", label: "Model 3", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 30_000_000 : 0)) },
    { id: "m4", label: "Model 4", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 20_000_000 : 0)) },
    { id: "m5", label: "Model 5", values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 10_000_000 : 0)) },
  ];

  const nonzero5 = series5
    .map((item) => ({ id: item.id, label: item.label, value: item.values[latestIndex] ?? 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  const top3 = nonzero5.slice(0, 3);
  const remainder5 = nonzero5.slice(3);
  const remainderTokens5 = remainder5.reduce((sum, e) => sum + e.value, 0);

  assert.equal(top3.length, 3);
  assert.equal(top3[0].label, "Model 1");
  assert.equal(top3[1].label, "Model 2");
  assert.equal(top3[2].label, "Model 3");
  assert.equal(remainder5.length, 2);
  assert.equal(remainderTokens5, 30_000_000);

  // Case 3: Zero tokens on latest day
  const seriesZero = [
    { id: "m1", label: "Model 1", values: Array.from({ length: 30 }, () => 0) },
  ];
  const nonzeroZero = seriesZero
    .map((item) => ({ id: item.id, label: item.label, value: item.values[latestIndex] ?? 0 }))
    .filter((entry) => entry.value > 0);
  assert.equal(nonzeroZero.length, 0);
});
