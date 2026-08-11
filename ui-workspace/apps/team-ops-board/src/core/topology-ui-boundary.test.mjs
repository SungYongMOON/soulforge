import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");
const ASSET_ROOT = join(dirname(dirname(fileURLToPath(import.meta.url))), "assets", "topology");

test("classic W1 and Engine nodes expose left inputs, right outputs and curved directed edges", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const classicStart = source.indexOf("function WatchtowerTopologyNode");
  const classicEnd = source.indexOf("function AiUsagePanel", classicStart);
  const classic = source.slice(classicStart, classicEnd);
  assert.match(classic, /type="target" position=\{Position\.Left\}/u);
  assert.match(classic, /type="source" position=\{Position\.Right\}/u);
  assert.match(classic, /type:\s*MarkerType\.ArrowClosed/u);
  assert.match(classic, /type:\s*"smoothstep"/u);
});

test("classic topology restores distinct input, supervisor, store, gate and output shapes", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.watchtower-node-external::before/u);
  assert.match(css, /\.watchtower-node-supervisor/u);
  assert.match(css, /\.watchtower-node-store \.watchtower-node-cap/u);
  assert.match(css, /\.watchtower-node-gate::before/u);
  assert.match(css, /\.watchtower-node-consumer::before/u);
});

test("classic topology keeps overview controls, node highlighting and focus restore", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /<MiniMap/u);
  assert.match(source, /<Controls/u);
  assert.match(source, /selectedNodeId/u);
  assert.match(source, /data\.onActivate\(data\.id, event\.currentTarget\)/u);
  assert.match(source, /event\.key !== "Enter" && event\.key !== " "/u);
  assert.match(source, /flowInstance\.fitView/u);
  assert.match(css, /\.watchtower-node-hit:focus-visible/u);
  assert.match(css, /\.watchtower-node\.is-selected/u);
});

test("classic Engine inspector stays read-only and declares evidence limits", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const start = source.indexOf("function EngineeringEngineTopologySurface");
  const end = source.indexOf("const DECLARED_TOPOLOGY_STATE_NOTICE", start);
  const engine = source.slice(start, end);
  assert.match(engine, /event\.key !== "Escape"/u);
  assert.match(engine, /DECLARED MODULE · READ-ONLY/u);
  assert.match(engine, /runtime UNKNOWN · 현재 실행 상태로 승격하지 않음/u);
  assert.match(engine, /전달 영수증 아님/u);
  assert.match(engine, /selectedNodeTriggerRef/u);
  assert.match(engine, /inspectorRef\.current\?\.focus/u);
});

test("System render path contains no unified sector cards or drill-down", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const systemStart = source.indexOf('{surface === "system" && (');
  const systemRender = source.slice(systemStart, source.indexOf('{surface === "work"', systemStart));
  assert.doesNotMatch(systemRender, /UnifiedSystemTopologySurface|toggleUnifiedTopologyExpansion|sector::|group::/u);
  assert.match(systemRender, /SystemTopologySurface/u);
  assert.match(systemRender, /EngineeringEngineTopologySurface/u);
});

test("Fleet Watchtower state and provider polling fail closed without aggregate substitution", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /function fleetWatchtowerPresentation/u);
  assert.match(source, /node\?\.id === "watchtower_self"/u);
  assert.match(source, /watchtower_self/u);
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
  assert.match(css, /\.fleet-claude-ledger-evidence\.is-stale/u);
  assert.equal(source.includes("claudeRecon"), false);
  assert.equal(source.includes("estimateClaudeUsdCost"), false);
  assert.equal(source.includes('startsWith("claude")'), false);
  assert.equal(source.includes('rawId.replace(/^gemini-/'), false);
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
