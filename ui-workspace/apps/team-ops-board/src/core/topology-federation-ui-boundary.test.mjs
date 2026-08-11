import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(APP_ROOT, "App.tsx");
const CSS_PATH = join(APP_ROOT, "team-ops.css");

function appSource() {
  return readFileSync(APP_PATH, "utf8");
}

function unifiedSurfaceSource() {
  const source = appSource();
  const start = source.indexOf("function UnifiedSystemTopologySurface");
  const end = source.indexOf("function AiUsagePanel", start);
  assert.ok(start > 0 && end > start, "unified system topology must exist as one component");
  return source.slice(start, end);
}

test("System surface keeps both read-only endpoints and renders one unified consumer", () => {
  const source = appSource();
  assert.match(source, /\.\/core\/topology-unified-view\.mjs/u);
  assert.match(source, /fetch\("\/topology-federation\.snapshot\.json", \{ cache: "no-store" \}\)/u);
  assert.match(source, /\/topology-health\.snapshot\.json\$\{force \? "\?refresh=1" : ""\}/u);
  assert.match(source, /<UnifiedSystemTopologySurface/u);
  const systemStart = source.indexOf('{surface === "system" && (');
  const systemRender = source.slice(systemStart, source.indexOf('{surface === "work"', systemStart));
  assert.equal((systemRender.match(/TopologySurface/g) ?? []).length, 1);
  assert.doesNotMatch(systemRender, /<(?:DeclaredTopologyFederationSurface|SystemTopologySurface)\b/u);
});

test("unified surface owns exactly one ReactFlow canvas with pan, zoom and minimap", () => {
  const surface = unifiedSurfaceSource();
  assert.equal((surface.match(/<ReactFlow/g) ?? []).length, 1);
  assert.match(surface, /<MiniMap/u);
  assert.match(surface, /<Controls/u);
  assert.match(surface, /pannable/u);
  assert.match(surface, /zoomable/u);
  assert.match(surface, /fitView/u);
  assert.match(surface, /prefers-reduced-motion: reduce/u);
});

test("unified surface is federation-first and keeps W1 as an exact optional overlay", () => {
  const surface = unifiedSurfaceSource();
  assert.match(surface, /buildUnifiedTopologyViewModel\(federationProjection, healthProjection, expansion\)/u);
  assert.match(surface, /선언 구조는 federation 정본/u);
  assert.match(surface, /W1 정확 ID 대응/u);
  assert.match(surface, /W1 관측 없음 · 선언 구조만 표시/u);
  assert.match(surface, /현재 상태로 승격하지 않음/u);
  assert.match(surface, /Engineering·Knowledge·Notebook은 W1 상태를 상속하지 않습니다/u);
});

test("retained federation state and reason render as an explicit stale boundary", () => {
  const surface = unifiedSurfaceSource();
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(surface, /model\.state === "stale"/u);
  assert.match(surface, /data-testid="unified-topology-federation-state"/u);
  assert.match(surface, /선언 구조 STALE · \$\{model\.reason/u);
  assert.match(surface, /is-federation-stale/u);
  assert.match(css, /\.unified-topology-surface\.is-federation-stale/u);
  assert.match(css, /\.unified-topology-federation-state\.is-stale/u);
});

test("provider and group accessibility labels never read an undefined health label", () => {
  const source = appSource();
  assert.match(source, /const hasHealthStatus = \(data\.healthObserved \|\| data\.healthRetained\)/u);
  assert.match(source, /const healthAriaLabel = hasHealthStatus/u);
  assert.match(source, /data\.healthStateLabel \?\? data\.healthState \?\? "관측 상태 미상"/u);
  assert.match(source, /aria-label=\{`\$\{actionLabel\} · \$\{category\.label\} · \$\{data\.detail\} · \$\{healthAriaLabel\}`\}/u);
});

test("retained W1 evidence stays stale in the node inspector without a live claim", () => {
  const surface = unifiedSurfaceSource();
  assert.match(surface, /selectedNode\.healthRetained \? `이전 관측 보존 · 현재 아님/u);
  assert.match(surface, /: selectedNode\.healthObserved \?/u);
  assert.match(surface, /selectedNode\.healthStateLabel/u);
  assert.match(surface, /관측 없음 · 런타임 UNKNOWN/u);
});

test("unified topology controls preserve 44px pointer targets", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.unified-topology-surface \.react-flow__controls-button\s*\{\s*width:\s*44px;\s*height:\s*44px;/u);
});

test("authority and cross-provider gaps remain explicit and fail closed", () => {
  const surface = unifiedSurfaceSource();
  assert.match(surface, /data-testid="system-topology-unavailable"/u);
  assert.match(surface, /구조 또는 권한 경계가 안전하지 않아 표시를 중단했습니다/u);
  assert.match(surface, /data-testid="unified-topology-authority"/u);
  assert.match(surface, /런타임 권한 false · 복구 실행 권한 false/u);
  assert.match(surface, /data-testid="unified-topology-cross-provider-gap"/u);
  assert.match(surface, /공급자 간 연결은 정본에 없으므로 간선을 만들지 않습니다/u);
});

test("unified controls stay read-only and offer no repair or runtime mutation", () => {
  const surface = unifiedSurfaceSource();
  assert.match(surface, /onClick=\{onRefreshReadOnly\}/u);
  assert.match(surface, /toggleUnifiedTopologyExpansion/u);
  assert.match(surface, /setSelectedNodeId/u);
  for (const forbidden of [
    "XMLHttpRequest", "localStorage", "sessionStorage", "window.open",
    'method: "POST"', 'method: "PUT"', 'method: "PATCH"', 'method: "DELETE"',
    "재시작", "자동 복구", "적용하기",
  ]) {
    assert.equal(surface.includes(forbidden), false, `${forbidden} must not appear in the unified surface`);
  }
});

test("category surface and health border/status marker are separate visual channels", () => {
  const source = appSource();
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /is-category-\$\{data\.category\}/u);
  assert.match(source, /is-health-\$\{data\.healthState\}/u);
  assert.match(css, /\.unified-topology-node[\s\S]*--unified-category-color/u);
  assert.match(css, /\.unified-topology-node\.has-health[\s\S]*--unified-health-color/u);
  assert.match(css, /\.unified-topology-node\.is-health-down\s*\{\s*--unified-health-color:\s*#ff8178/u);
  const unifiedCss = css.slice(css.indexOf(".unified-topology-surface"));
  assert.doesNotMatch(unifiedCss, /is-category-[^{]+\{[^}]*#ff(?:8178|8d84)/u);
});
