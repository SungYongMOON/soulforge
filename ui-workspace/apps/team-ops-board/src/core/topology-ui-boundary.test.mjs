import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");
const ASSET_ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))), "assets", "topology");

test("Watchtower nodes expose per-edge left inputs and right outputs with directed arrows", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data\.inputPorts\.map[\s\S]*type="target"[\s\S]*position=\{Position\.Left\}/u);
  assert.match(source, /data\.outputPorts\.map[\s\S]*type="source"[\s\S]*position=\{Position\.Right\}/u);
  assert.match(source, /sourceHandle:\s*edge\.sourceHandle/u);
  assert.match(source, /targetHandle:\s*edge\.targetHandle/u);
  assert.match(source, /style=\{\{ top: `\$\{port\.top\}%` \}\}/u);
  assert.match(source, /type:\s*MarkerType\.ArrowClosed/u);
  assert.match(source, /type:\s*"smoothstep"/u);
});

test("Watchtower topology keeps device identity, state color, and group boundaries separate", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /watchtowerBrandIcon/u);
  assert.match(source, /siGoogledrive/u);
  assert.match(source, /siGmail/u);
  assert.match(source, /slackBrandIconUrl/u);
  assert.match(source, /notebookLmBrandIconUrl/u);
  assert.match(source, /watchtowerLane:\s*WatchtowerTopologyLane/u);
  assert.match(css, /\.watchtower-lane\s*\{/u);
  assert.match(css, /\.watchtower-node-icon\s*\{/u);
  assert.match(css, /\.watchtower-node\.is-ok \.watchtower-node-icon/u);
  assert.match(css, /\.watchtower-node\.is-degraded \.watchtower-node-icon/u);
  assert.match(css, /\.watchtower-node\.is-unmonitored \.watchtower-node-icon/u);
  assert.match(css, /\.watchtower-node\.is-unmonitored[\s\S]*border-color:\s*#486f91;/u);
  assert.match(css, /\.watchtower-node-external::before[\s\S]*skewX\(-11deg\)/u);
  assert.match(css, /\.watchtower-node-supervisor[\s\S]*border-radius:\s*999px/u);
  assert.match(css, /\.watchtower-node-worker\s*\{\s*border-radius:\s*4px/u);
  assert.match(css, /\.watchtower-node-store \.watchtower-node-cap/u);
  assert.match(css, /\.watchtower-node-gate::before[\s\S]*polygon\(50% 0, 100% 50%, 50% 100%, 0 50%\)/u);
  assert.match(css, /\.watchtower-node\.watchtower-node-gate[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/u);
  assert.match(css, /\.watchtower-node\.watchtower-node-external[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/u);
  assert.match(css, /\.watchtower-node\.watchtower-node-consumer[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/u);
  assert.match(css, /\.watchtower-node-gate\.is-unmonitored::before\s*\{\s*background:\s*var\(--watchtower-shape-border\);\s*\}/u);
  assert.match(css, /\.watchtower-node-gate \.watchtower-node-hit:focus-visible\s*\{\s*outline:\s*0;\s*\}/u);
  assert.match(css, /\.watchtower-node-consumer::before[\s\S]*clip-path/u);
});

test("Watchtower topology provides overview controls and focus plus context", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /<MiniMap/u);
  assert.match(source, /<Controls/u);
  assert.match(source, /selectedNodeId/u);
  assert.match(source, /data\.onActivate\(data\.id,\s*event\.currentTarget\)/u);
  assert.match(source, /event\.key !== "Enter" && event\.key !== " "/u);
  assert.match(source, /직접 연결만 강조/u);
  assert.match(source, /setViewport\(\{ x: 72, y: 22, zoom: 0\.82 \}/u);
  assert.match(source, /fittedLayoutRef\.current === layoutSignature/u);
  assert.match(css, /\.watchtower-node\.is-dimmed/u);
  assert.match(css, /\.watchtower-node\.is-dimmed:focus-within/u);
  assert.match(css, /\.watchtower-surface \.react-flow__edge\.is-dimmed/u);
});

test("Watchtower selected-node inspector stays read-only and declares structural evidence limits", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /buildTopologyStructuralPaths/u);
  assert.match(source, /inspectorView/u);
  assert.match(source, /onRefreshReadOnly/u);
  assert.match(source, /event\.key !== "Escape"/u);
  assert.match(source, /Owner 승인 필요/u);
  assert.match(source, /직접 경로/u);
  assert.match(source, /전체 구조 경로/u);
  assert.match(source, /라이브·E2E·receipt를 입증하지 않습니다/u);
  assert.match(source, /selectedNodeTriggerRef/u);
  assert.match(source, /inspectorRef\.current\?\.focus/u);
  assert.match(css, /\.watchtower-node-inspector\s*\{/u);
  assert.match(css, /\.watchtower-inspector-evidence\s*\{/u);
});

test("Watchtower UI labels catalog-only nodes and stale refresh evidence without inferring provider health", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data\?\.healthBasis === "catalog_only"/u);
  assert.match(source, /typeof data\?\.statusText === "string"/u);
  assert.match(source, /className="watchtower-node-observation"/u);
  assert.match(source, /refreshState === "hold" \|\| refreshState === "stale"/u);
  assert.match(source, /last_success_age_seconds/u);
  assert.match(source, /last_failure_age_seconds/u);
  assert.match(source, /구조\/카탈로그 관계는 현재 공급자 성공 또는 독립 관측이 아님/u);
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
  assert.match(source, /createProviderSnapshots\("refreshing"\)/u);
  assert.match(source, /refresh_state: complete \? "ready" : "hold"/u);
  assert.match(source, /fleet-provider-observation-state/u);
  assert.equal(source.includes("const healthy = model.summary"), false);
});

test("Claude token presentation consumes normalized provider evidence without model-prefix attribution", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /usage\?\.provider_evidence\?\.claude/u);
  assert.match(source, /"ledger_fresh", "ledger_stale", "validated_empty"/u);
  assert.match(source, /Claude 원장 마지막 확인/u);
  assert.match(source, /STALE · 원장 근거/u);
  assert.match(source, /data-ledger-freshness/u);
  assert.match(source, /claude-collection-attempt/u);
  assert.match(source, /provider health·live·E2E·current 근거 아님/u);
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
