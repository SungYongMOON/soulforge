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

function declaredSurfaceSource() {
  const source = appSource();
  const start = source.indexOf("const DECLARED_TOPOLOGY_STATE_NOTICE");
  const end = source.indexOf("function AiUsagePanel", start);
  assert.ok(start > 0 && end > start, "declared federation surface must exist as its own component");
  return source.slice(start, end);
}

test("System surface consumes the loopback federation endpoint read-only and keeps W1 health untouched", () => {
  const source = appSource();
  assert.match(source, /buildTopologyFederationViewModel/u);
  assert.match(source, /selectTopologyFederationProvider/u);
  assert.match(source, /\.\/core\/topology-federation-view\.mjs/u);
  assert.match(source, /fetch\("\/topology-federation\.snapshot\.json", \{ cache: "no-store" \}\)/u);
  // The existing W1 health lens must keep its own endpoint, model, and surface.
  assert.match(source, /\/topology-health\.snapshot\.json\$\{force \? "\?refresh=1" : ""\}/u);
  assert.match(source, /buildTopologyViewModel/u);
  assert.match(source, /<SystemTopologySurface projection=\{topologyProjection\}/u);
  assert.match(source, /<DeclaredTopologyFederationSurface projection=\{topologyFederationProjection\} \/>/u);
});

test("a failed federation read is presented as stale or unavailable, never as current structure", () => {
  const source = appSource();
  assert.match(source, /state: "stale", reason: "federation_fetch_failed"/u);
  assert.match(source, /state: "unavailable", reason: "federation_fetch_failed", snapshot: null/u);
  const surface = declaredSurfaceSource();
  assert.match(surface, /data-testid="declared-topology-loading"/u);
  assert.match(surface, /data-testid="declared-topology-unavailable"/u);
  assert.match(surface, /data-testid="declared-topology-state-notice"/u);
  assert.match(surface, /구조 재읽기 실패/u);
  assert.match(surface, /구조·관계·상태를 추정하지 않습니다/u);
});

test("declared lens labels itself as declared structure and not as live health or delivery proof", () => {
  const surface = declaredSurfaceSource();
  assert.match(surface, /AX TOPOLOGY FEDERATION · v1/u);
  assert.match(surface, /현재 health·실행·전달 영수증이 아닙니다/u);
  assert.match(surface, /Watchtower W1 판정과 별도 근거입니다/u);
  assert.match(surface, /선언 구조가 입증하지 않는 것/u);
  assert.match(surface, /TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS/u);
  assert.match(surface, /선언 상태는 W1 health 색으로 승격되지 않으며/u);
});

test("declared lens shows provider overview with counts, declared status, ceiling, validation and runtime state", () => {
  const surface = declaredSurfaceSource();
  assert.match(surface, /data-testid="declared-topology-provider-overview"/u);
  assert.match(surface, /data-testid="declared-topology-counts"/u);
  assert.match(surface, /선언 상태 \{provider\.declaredStatusLabel\}/u);
  assert.match(surface, /주장 한계 \{provider\.claimCeilingLabel\}/u);
  assert.match(surface, /검증 \{provider\.validationStateLabel\}/u);
  assert.match(surface, /런타임 \{provider\.runtimeStateLabel\}/u);
  assert.match(surface, /노드 \{provider\.nodeCount\} · 간선 \{provider\.edgeCount\}/u);
  assert.match(surface, /선언 blocker \{provider\.blockerCodes\.join/u);
});

test("provider selection drills into the flattened namespaced set through the pure selector", () => {
  const surface = declaredSurfaceSource();
  assert.match(surface, /selectTopologyFederationProvider\(model, selectedProviderId\)/u);
  assert.match(surface, /aria-pressed=\{selectedProviderId === provider\.id\}/u);
  assert.match(surface, /setSelectedProviderId\(\(current\) => current === provider\.id \? null : provider\.id\)/u);
  assert.match(surface, /data-testid="declared-topology-provider-detail"/u);
  assert.match(surface, /data-testid="declared-topology-empty-selection"/u);
  assert.match(surface, /selection\.nodes\.map/u);
  assert.match(surface, /selection\.edges\.map/u);
  assert.match(surface, /\{node\.diagnosticStateLabel\} · \{node\.repairStateLabel\}/u);
  assert.match(surface, /\{edge\.evidenceModeLabel\}/u);
});

test("declared lens never borrows W1 health tones or merges into the health summary", () => {
  const surface = declaredSurfaceSource();
  for (const healthToken of [
    "watchtower-chip", "is-ok", "is-degraded", "is-down", "is-unmonitored",
    "buildTopologyViewModel", "edgeDelivery", "deliveryProven", "stateLabel",
  ]) {
    assert.equal(surface.includes(healthToken), false, `${healthToken} must stay in the health lens`);
  }
  const css = readFileSync(CSS_PATH, "utf8");
  const declaredCss = css.slice(css.indexOf(".ax-declared {"));
  assert.ok(declaredCss.length > 0, "declared lens styling must exist");
  for (const tone of ["is-ok", "is-degraded", "is-down", "is-unmonitored", "#70d98c", "#ff8d84", "#f5b849"]) {
    assert.equal(declaredCss.includes(tone), false, `${tone} health tone must not style declared structure`);
  }
});

test("declared lens keeps repair as candidate plus Owner approval language only", () => {
  const surface = declaredSurfaceSource();
  assert.match(surface, /복구 제안 후보/u);
  assert.match(surface, /복구는 후보이며 Owner 승인 필요/u);
  assert.match(surface, /Owner 승인 필요, 실행 동작 없음/u);
  assert.match(surface, /이 표면에는 실행·변경 동작이 없습니다/u);
  // repair_execution stays a displayed contract fact, never an offered action.
  assert.match(surface, /복구 실행 권한 \{String\(summary\.repairExecutionAuthority\)\}/u);
  assert.match(surface, /<dt>복구 실행<\/dt><dd>\{String\(selection\.provider\.capabilities\.executeRepair\)\}/u);
});

test("declared lens stays read-only: every control is local selection, no call or mutation", () => {
  const surface = declaredSurfaceSource();
  const handlers = [...surface.matchAll(/onClick=\{([^}]*(?:\}[^}]*)?)\}/gu)].map((match) => match[1]);
  assert.ok(handlers.length >= 2, "declared lens must own its selection controls");
  for (const handler of handlers) {
    assert.match(handler, /setSelectedProviderId/u);
  }
  for (const forbidden of [
    "fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "window.open",
    "method: \"POST\"", "method: \"PUT\"", "method: \"PATCH\"", "method: \"DELETE\"",
    "<form", "<a ", "href", "https://", "notebook", "account", "credential",
    "재시작", "실행하기", "적용하기",
  ]) {
    assert.equal(surface.includes(forbidden), false, `${forbidden} must not appear in the declared lens`);
  }
});
