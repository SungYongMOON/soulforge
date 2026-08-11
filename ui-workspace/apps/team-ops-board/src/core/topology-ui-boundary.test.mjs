import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");
const ASSET_ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))), "assets", "topology");

test("unified declared nodes expose left inputs and right outputs with curved directed edges", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const unifiedStart = source.indexOf("function UnifiedTopologyNode");
  const unifiedEnd = source.indexOf("function AiUsagePanel", unifiedStart);
  const unified = source.slice(unifiedStart, unifiedEnd);
  assert.match(unified, /type="target" position=\{Position\.Left\}/u);
  assert.match(unified, /type="source" position=\{Position\.Right\}/u);
  assert.match(source, /type:\s*MarkerType\.ArrowClosed/u);
  assert.match(unified, /type:\s*"default"/u);
});

test("unified topology keeps category surface and health status separate", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /UNIFIED_TOPOLOGY_CATEGORIES/u);
  assert.match(source, /is-category-\$\{data\.category\}/u);
  assert.match(source, /is-health-\$\{data\.healthState\}/u);
  assert.match(css, /\.unified-topology-node\.is-provider/u);
  assert.match(css, /\.unified-topology-node\.is-group/u);
  assert.match(css, /\.unified-topology-node\.is-node/u);
  assert.match(css, /\.unified-topology-node\.has-health/u);
  assert.match(css, /\.unified-topology-node\.is-health-down/u);
});

test("unified topology provides compact drill-down, overview controls and focus restore", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /<MiniMap/u);
  assert.match(source, /<Controls/u);
  assert.match(source, /selectedNodeId/u);
  assert.match(source, /toggleUnifiedTopologyExpansion/u);
  assert.match(source, /data\.onActivate\(data, event\.currentTarget\)/u);
  assert.match(source, /event\.key !== "Enter" && event\.key !== " "/u);
  assert.match(source, /섹터 선택 → 선언 그룹 선택 → 실제 노드/u);
  assert.match(source, /flowInstance\.fitView/u);
  assert.match(source, /fittedLayoutRef\.current === layoutSignature/u);
  assert.match(css, /\.unified-topology-node-hit:focus-visible/u);
  assert.match(css, /\.unified-topology-node\.is-selected/u);
});

test("unified selected-node inspector stays read-only and declares evidence limits", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /onRefreshReadOnly/u);
  assert.match(source, /event\.key !== "Escape"/u);
  assert.match(source, /DECLARED STRUCTURE · READ-ONLY/u);
  assert.match(source, /관측 없음 · 런타임 UNKNOWN/u);
  assert.match(source, /읽기 전용 · 실행·복구 동작 없음/u);
  assert.match(source, /edge\.receiptObserved \? " is-receipted" : " is-structural"/u);
  assert.match(source, /selectedNodeTriggerRef/u);
  assert.match(source, /inspectorRef\.current\?\.focus/u);
  assert.match(css, /\.watchtower-node-inspector\s*\{/u);
  assert.match(css, /\.watchtower-inspector-evidence\s*\{/u);
});

test("unified UI labels absent and stale W1 evidence without inferring provider health", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /W1 관측 없음 · 선언 구조만 표시/u);
  assert.match(source, /!model\.diagnostics\.w1Current/u);
  assert.match(source, /보존 관측을 현재 상태로 승격하지 않음/u);
  assert.match(source, /Engineering·Knowledge·Notebook은 W1 상태를 상속하지 않습니다/u);
  assert.equal(source.includes("provider_summary"), false);
});

test("Fleet Watchtower state and provider polling fail closed without aggregate substitution", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /function fleetWatchtowerPresentation/u);
  assert.match(source, /node\?\.id === "watchtower_self"/u);
  assert.match(source, /"watchtower_self 없음 · 미감시\/HOLD"/u);
  assert.match(source, /const healthy = refreshState === "ready"[\s\S]*watchtowerSelf\?\.state === "ok"/u);
  assert.match(source, /PROVIDER_POLL_TIMEOUT_MS/u);
  assert.match(source, /new AbortController\(\)/u);
  assert.match(source, /if \(inFlight !== null\) return inFlight;/u);
  assert.match(source, /let generation = 0;/u);
  assert.match(source, /refresh_state: "refreshing"/u);
  assert.match(source, /refresh_state: complete \? "ready" : "hold"/u);
  assert.match(source, /fleet-provider-observation-state/u);
  assert.equal(source.includes("const healthy = model.summary"), false);
});

test("Claude token presentation consumes normalized provider evidence without model-prefix attribution", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /usage\?\.provider_evidence\?\.claude/u);
  assert.match(source, /"ledger_fresh", "ledger_stale", "validated_empty"/u);
  assert.match(source, /Claude \$\{fleetTokenLabel\(claudeEvidence\.total_tokens\)\} tok/u);
  assert.match(source, /ledger_stale/u);
  assert.match(source, /data-ledger-freshness/u);
  assert.doesNotMatch(source, /fleet-claude-collection-attempt/u);
  assert.doesNotMatch(source, /provider health·live·E2E·current 근거 아님/u);
  assert.match(css, /\.fleet-claude-ledger-evidence\.is-stale/u);
  assert.equal(source.includes("claudeRecon"), false);
  assert.equal(source.includes("estimateClaudeUsdCost"), false);
  assert.equal(source.includes("startsWith(\"claude\")"), false);
  assert.equal(source.includes("rawId.replace(/^gemini-/"), false);
  assert.equal(source.includes("요청 수 · Antigravity"), false);
  assert.equal(source.includes("Claude 세션·미등록"), false);
  assert.equal(source.includes("/claude-usage.snapshot.json"), false);
});

test("redistributed topology brand assets retain source and license notices", () => {
  const provenance = readFileSync(join(ASSET_ROOT, "README.md"), "utf8");
  const licenses = readFileSync(join(ASSET_ROOT, "THIRD_PARTY_LICENSES.md"), "utf8");
  assert.match(provenance, /homarr-labs\/dashboard-icons/u);
  assert.match(provenance, /microsoft-onedrive\.svg/u);
  assert.match(provenance, /slack\.svg/u);
  assert.match(licenses, /Apache License[\s\S]*Version 2\.0/u);
  assert.match(licenses, /Copyright \(c\) 2024 Bjorn Lammers, Meier Lukas, Thomas Camlong and Homarr Labs/u);
  assert.match(licenses, /MIT License[\s\S]*Copyright \(c\) 2023 LobeHub/u);
});
