import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TOPOLOGY_DIAGNOSTIC_NODE_IDS } from "./topology-connection-diagnostics.mjs";

const SRC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APP_PATH = join(SRC_ROOT, "App.tsx");
const CSS_PATH = join(SRC_ROOT, "team-ops.css");

function systemTopologySurface() {
  const source = readFileSync(APP_PATH, "utf8");
  const start = source.indexOf("function SystemTopologySurface");
  const end = source.indexOf("const ENGINE_NODE_ICON_BY_ID", start);
  assert.ok(start > 0 && end > start, "SystemTopologySurface 범위를 찾지 못했습니다");
  return source.slice(start, end);
}

test("연결 진단 버튼은 allowlist 노드에서만 나오고 읽기 전용 표현을 유지한다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /isTopologyDiagnosticNode\(selectedNode\.id\) && \(/u);
  assert.match(surface, /data-testid="system-topology-connection-diagnose"/u);
  assert.match(surface, />진단<\/button>/u);
  assert.match(surface, /READ-ONLY DIAGNOSTICS/u);
  // 복구·재시작·로그인 실행 표면은 이 진단에 존재하지 않는다.
  assert.doesNotMatch(surface, /복구 실행|자동 복구|재시작|로그인 실행|repair_execution/u);
});

test("진단은 이미 있는 loopback 표면만 다시 읽고 새 서버 호출을 만들지 않는다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /async function diagnoseNodeConnection\(nodeId: string\)/u);
  assert.match(surface, /const nextProjection = await onRefreshReadOnly\(\);/u);
  assert.match(surface, /healthProjection: nextProjection \?\? projection/u);
  assert.match(surface, /providerSnapshots,/u);
  const diagnoseStart = surface.indexOf("async function diagnoseNodeConnection");
  const diagnoseEnd = surface.indexOf("async function inspectTrackingRecovery", diagnoseStart);
  const diagnose = surface.slice(diagnoseStart, diagnoseEnd);
  assert.doesNotMatch(diagnose, /fetch\(|XMLHttpRequest|EventSource|WebSocket/u);
  assert.doesNotMatch(diagnose, /snapshot\.json/u);
});

test("진단 결과는 계정·로컬·관측·근거 한계를 분리해 표시한다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /<dt>계정 연결<\/dt>/u);
  assert.match(surface, /<dt>로컬 수집·소스<\/dt>/u);
  assert.match(surface, /<dt>마지막 안전 관측<\/dt>/u);
  assert.match(surface, /근거 범위 \{connectionDiagnosis\.result\.evidence\.owners\.length > 0/u);
  assert.match(surface, /connectionDiagnosis\.result\.evidence\.limits\.map/u);
  assert.match(surface, /account\.state_label\} · \{connectionDiagnosis\.result\.account\.reason_label/u);
  assert.match(surface, /local_source\.state_label\} · \{connectionDiagnosis\.result\.local_source\.reason_label/u);
  assert.match(surface, /last_safe_observation\.age_label/u);
});

test("진단은 토폴로지 health 를 승격하지 않고 상태 유지를 명시한다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /<dt>토폴로지 상태<\/dt>/u);
  assert.match(surface, /진단으로 바뀌지 않음/u);
  // 진단 결과는 노드/간선 모델이 아니라 별도 렌즈에서만 읽는다.
  const diagnosisStart = surface.indexOf('id="watchtower-connection-diagnosis"');
  const diagnosisEnd = surface.indexOf("watchtower-inspector-owner-note", diagnosisStart);
  const diagnosis = surface.slice(diagnosisStart, diagnosisEnd);
  assert.doesNotMatch(diagnosis, /setSelectedNodeId|graphNodes|graphEdges|model\.summary|healthState/u);
});

test("진단 영역은 접근 가능한 상태 영역과 버튼 연결을 유지한다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /aria-controls="watchtower-connection-diagnosis"/u);
  assert.match(surface, /aria-expanded=\{connectionDiagnosis\?\.nodeId === selectedNode\.id\}/u);
  assert.match(surface, /disabled=\{connectionDiagnosis\?\.nodeId === selectedNode\.id && connectionDiagnosis\?\.pending === true\}/u);
  assert.match(surface, /id="watchtower-connection-diagnosis"/u);
  assert.match(surface, /aria-label=\{`\$\{selectedNode\.label\} 연결 진단 결과`\}/u);
  assert.match(surface, /role="status"[\s\S]{0,80}aria-live="polite"[\s\S]{0,80}aria-busy=/u);
});

test("노드 선택이 바뀌면 이전 진단 결과가 남지 않는다", () => {
  const surface = systemTopologySurface();
  assert.match(surface, /function clearSelectedNode[\s\S]{0,240}setConnectionDiagnosis\(null\)/u);
  assert.match(surface, /function activateTopologyNode[\s\S]{0,240}setConnectionDiagnosis\(null\)/u);
  assert.match(surface, /connectionDiagnosis\?\.nodeId === selectedNode\.id && \(/u);
});

test("기존 토폴로지 도형·색·미니맵·패널 접기 표면이 유지된다", () => {
  const surface = systemTopologySurface();
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(surface, /<MiniMap/u);
  assert.match(surface, /nodeColor=\{watchtowerMiniMapColor\}/u);
  assert.match(surface, /<Controls/u);
  assert.match(surface, /PanelCollapseButton panelId="system.watchtower"/u);
  assert.match(surface, /CollapsiblePanelBody panelId="system.watchtower"/u);
  assert.match(surface, /watchtower-shape-guide/u);
  assert.match(css, /\.watchtower-connection-diagnosis \{/u);
  assert.match(css, /\.watchtower-connection-limits \{/u);
  assert.match(css, /\.watchtower-connection-scope \{/u);
  assert.match(css, /\.watchtower-connection-diagnosis dd\[data-state="failure_signal"\]/u);
});

test("provider 폴링은 owner·system 표면에서만 켜지고 같은 loopback 표면만 다시 읽는다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /const providerPollingEnabled = surface === "owner" \|\| surface === "system";/u);

  const effectStart = source.indexOf("if (!providerPollingEnabled) return undefined;");
  assert.ok(effectStart > 0, "provider 폴링 게이트를 찾지 못했습니다");
  const effectEnd = source.indexOf("}, [providerPollingEnabled]);", effectStart);
  assert.ok(effectEnd > effectStart, "provider 폴링 effect 종료 지점을 찾지 못했습니다");
  const effect = source.slice(effectStart, effectEnd);

  // 기존 loopback GET 3개만 쓰고 새 route·provider 호출을 만들지 않는다.
  assert.deepEqual(
    [...effect.matchAll(/fetchJson\("([^"]+)"\)/gu)].map((match) => match[1]),
    ["/antigravity-usage.snapshot.json", "/antigravity-quota.snapshot.json", "/provider-limits.snapshot.json"],
  );
  assert.equal([...effect.matchAll(/\bfetch\(/gu)].length, 1);
  assert.doesNotMatch(effect, /XMLHttpRequest|EventSource|WebSocket|method:\s*"POST"/u);

  // 폴링 effect 는 하나뿐이라 owner·system 사이 전환에서 중복 폴링이 생기지 않는다.
  assert.equal([...source.matchAll(/if \(!providerPollingEnabled\) return undefined;/gu)].length, 1);
  assert.equal([...source.matchAll(/\}, \[providerPollingEnabled\]\);/gu)].length, 1);
  assert.equal([...source.matchAll(/PROVIDER_POLL_INTERVAL_MS\)/gu)].length, 1);
});

test("System Topology 는 owner 와 같은 providerSnapshots 를 그대로 받는다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /<SystemTopologySurface[\s\S]{0,240}providerSnapshots=\{providerSnapshots\}/u);
  assert.match(source, /<FleetUsageCards[^>]*providers=\{providerSnapshots\}/u);
  // work·organization 표면은 이 수신면을 열지 않는다. 게이트는 owner·system 두 값만 본다.
  assert.deepEqual(
    [...source.matchAll(/const providerPollingEnabled = ([^;]+);/gu)].map((match) => match[1]),
    ['surface === "owner" || surface === "system"'],
  );
  // provider 수신 상태를 쓰는 곳은 이 폴링 effect 하나뿐이다.
  assert.equal([...source.matchAll(/setProviderSnapshots\(/gu)].length, 1);
});

test("allowlist 는 9개 미감시 노드 그대로이며 UI 가 별도 목록을 다시 만들지 않는다", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.deepEqual([...TOPOLOGY_DIAGNOSTIC_NODE_IDS].sort(), [
    "consumer_timeline", "src_antigravity", "src_claude", "src_codex", "src_gmail",
    "src_hiworks", "src_onedrive", "src_plaud", "src_slack",
  ]);
  assert.match(source, /import \{ buildTopologyConnectionDiagnostic, isTopologyDiagnosticNode \} from "\.\/core\/topology-connection-diagnostics\.mjs";/u);
  // 화면은 allowlist 를 다시 만들지 않고 core 판정만 부른다.
  const surface = systemTopologySurface();
  for (const nodeId of TOPOLOGY_DIAGNOSTIC_NODE_IDS) {
    assert.equal(surface.includes(`"${nodeId}"`), false, `${nodeId} 목록이 화면 코드에 복제되었습니다`);
  }
});

test("regression P1-5: App.tsx requires exact verified_repair outcome_code before rendering completed", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /else if \(row\?\.outcome_code === "verified_repair"\) \{\s*text = "안전 조치 완료 · 사후 검증 통과";/u);
  assert.doesNotMatch(source, /row\?\.outcome_code === "verified_repair" \|\|/u);
  assert.doesNotMatch(source, /row\?\.attempt === "succeeded" && row\?\.verification === "passed"/u);
});
