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

function engineSurfaceSource() {
  const source = appSource();
  const start = source.indexOf("function EngineeringEngineTopologySurface");
  const end = source.indexOf("const DECLARED_TOPOLOGY_STATE_NOTICE", start);
  assert.ok(start > 0 && end > start, "classic engine topology surface must exist");
  return source.slice(start, end);
}

test("System keeps both read-only endpoints and restores two classic topology surfaces", () => {
  const source = appSource();
  assert.match(source, /fetch\("\/topology-federation\.snapshot\.json", \{ cache: "no-store" \}\)/u);
  assert.match(source, /\/topology-health\.snapshot\.json\$\{force \? "\?refresh=1" : ""\}/u);
  const systemStart = source.indexOf('{surface === "system" && (');
  const systemRender = source.slice(systemStart, source.indexOf('{surface === "work"', systemStart));
  assert.match(systemRender, /<SystemTopologySurface/u);
  assert.match(systemRender, /<EngineeringEngineTopologySurface/u);
  assert.doesNotMatch(systemRender, /<UnifiedSystemTopologySurface/u);
  assert.match(systemRender, /data-testid="system-topology-stack"/u);
});

test("engine uses the original ReactFlow node types, minimap, controls and curved directed edges", () => {
  const surface = engineSurfaceSource();
  assert.equal((surface.match(/<ReactFlow/g) ?? []).length, 1);
  assert.match(surface, /nodeTypes=\{watchtowerTopologyNodeTypes as any\}/u);
  assert.match(surface, /type:\s*"smoothstep"/u);
  assert.match(surface, /type:\s*MarkerType\.ArrowClosed/u);
  assert.match(surface, /<MiniMap/u);
  assert.match(surface, /<Controls/u);
  assert.match(surface, /pannable/u);
  assert.match(surface, /zoomable/u);
});

test("engine is fully expanded with no sector or group drill-down", () => {
  const surface = engineSurfaceSource();
  assert.doesNotMatch(surface, /toggleUnifiedTopologyExpansion|expansion|is-provider|is-group/u);
  assert.match(surface, /접기 없음/u);
  assert.match(surface, /모듈을 선택하면 직접 연결만 강조/u);
});

test("engine presents exact source counts, authority boundary and missing cross-provider contract", () => {
  const surface = engineSurfaceSource();
  assert.match(surface, /\{model\.source\.nodeCount\} 모듈/u);
  assert.match(surface, /\{model\.source\.edgeCount\} 연결/u);
  assert.match(surface, /실행 권한 false · 복구 권한 false/u);
  assert.match(surface, /\{model\.gap\}/u);
  assert.match(surface, /Watchtower와 Engine 사이 연결은 정본에 없으므로 만들지 않습니다/u);
});

test("Knowledge and Notebook are not rendered in the classic engine surface", () => {
  const surface = engineSurfaceSource();
  assert.doesNotMatch(surface, /knowledge_stack|watchtower_notebook_advisory_adapter|Knowledge|Notebook/u);
});

test("engine controls remain read-only and expose no repair or runtime mutation", () => {
  const surface = engineSurfaceSource();
  for (const forbidden of [
    "XMLHttpRequest", "localStorage", "sessionStorage", "window.open",
    'method: "POST"', 'method: "PUT"', 'method: "PATCH"', 'method: "DELETE"',
    "자동 복구", "재시작", "적용하기",
  ]) {
    assert.equal(surface.includes(forbidden), false, `${forbidden} must not appear in the engine surface`);
  }
});

test("classic shape, lane and edge styling stays active for Engine", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.watchtower-node-external::before/u);
  assert.match(css, /\.watchtower-node-supervisor/u);
  assert.match(css, /\.watchtower-node-store/u);
  assert.match(css, /\.watchtower-node-gate/u);
  assert.match(css, /\.watchtower-node-consumer/u);
  assert.match(css, /\.engineering-topology-canvas/u);
  assert.match(css, /\.engineering-topology-surface \.react-flow__edge\.engine-topology-edge/u);
});

test("engine inspector states declared structure and runtime UNKNOWN", () => {
  const surface = engineSurfaceSource();
  assert.match(surface, /DECLARED MODULE · READ-ONLY/u);
  assert.match(surface, /runtime UNKNOWN · 현재 실행 상태로 승격하지 않음/u);
  assert.match(surface, /\{selectedNode\.evidenceScope\}/u);
  assert.match(surface, /event\.key !== "Escape"/u);
});
