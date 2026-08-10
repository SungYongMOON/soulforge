import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "App.tsx");
const CSS_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), "team-ops.css");

test("normal Board UI is wired to the live exact-ID projection, not synthetic inbox data", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /liveThreadProjectionRequest/u);
  assert.match(source, /selectLiveThreadView/u);
  for (const forbidden of ["owner-inbox", "buildOwnerInboxFixture", "provider-visual", "fixtureMode", "synthetic"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not drive the normal UI`);
  }
});

test("normal Board UI uses the safe owner display label for card and detail titles", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /<strong>\{thread\.display_label\}<\/strong>/u);
  assert.match(source, /<h2 id="live-thread-detail-title">\{thread\.display_label\}<\/h2>/u);
  assert.match(source, /live-card-secondary/u);
  assert.equal(source.includes("thread.name"), false);
  assert.equal(source.includes("thread.title"), false);
});

test("Owner, organization, and work/history surfaces are explicit and raw idle never becomes Owner attention", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data-testid="owner-overview-tab"/u);
  assert.match(source, /data-testid="organization-tree-tab"/u);
  assert.match(source, /data-testid="work-history-tab"/u);
  assert.match(source, /<OrganizationWorkspace/u);
  assert.match(source, /data-testid="organization-tree-subview"/u);
  assert.match(source, /data-testid="organization-flow-subview"/u);
  assert.match(source, /parent_thread_id/u);
  assert.match(source, /liveThreadResultStateLabel/u);
  assert.match(source, /lifecycleSourceHealthLabel/u);
  assert.match(source, /data-testid="realtime-coverage"/u);
  assert.match(source, /data-testid="local-meter-health"/u);
  assert.match(source, /value="stopped"/u);
  assert.match(source, /결과 확인/u);
  assert.match(source, /statusKey="stopped"/u);
  assert.match(source, /statusKey="unknown"/u);
  assert.match(source, /Codex 파란 점은 새 활동·미확인 알림/u);
  assert.match(source, /Owner에게 명시적으로 전달된 result gate만 표시합니다/u);
  assert.match(source, /countRealtimeConnectedSessions\(buckets\)/u);
  assert.match(source, /realtimeThreadConnectionPresentation\(thread\)/u);
  assert.match(source, /realtime-connection-state/u);
  assert.equal(source.includes("idle_result_check"), false);
  assert.equal(source.includes("결과 확인 필요"), false);
});

test("organization topology uses a graph renderer with keyboard-operable exact-ID node controls", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /from "@xyflow\/react"/u);
  assert.match(source, /buildOperationalOrganizationTopology/u);
  assert.match(source, /<ReactFlow/u);
  assert.match(source, /organizationTopologyNodeTypes/u);
  assert.match(source, /data-live-thread-id=\{data\.thread_id \?\? undefined\}/u);
  assert.match(source, /data-testid=\{data\.test_id\}/u);
  assert.match(source, /onSelect\(node\.thread_id, trigger\)/u);
  assert.match(source, /nodesDraggable=\{false\}/u);
  assert.match(source, /nodesConnectable=\{false\}/u);
  assert.match(source, /panOnDrag/u);
  assert.match(css, /\.organization-topology-node-button:focus-visible/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.organization-topology-canvas\s*\{\s*height:\s*520px;/su);
});
test("organization topology offers persistent live-only and full-organization scopes", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /ORGANIZATION_TOPOLOGY_MODE_STORAGE_KEY/u);
  assert.match(source, /role="group" aria-label="조직도 표시 범위"/u);
  assert.match(source, /aria-pressed=\{topologyMode === "live"\}/u);
  assert.match(source, />실시간만<\/button>/u);
  assert.match(source, /aria-pressed=\{topologyMode === "all"\}/u);
  assert.match(source, />전체 조직<\/button>/u);
  assert.match(source, /mode: topologyMode/u);
  assert.match(source, /모든 회사·CEO·팀장·책임자를 표시합니다/u);
  assert.match(source, /현재 표시할 운영 작업이 없습니다/u);
  assert.match(css, /\.organization-topology-mode-control button:focus-visible/u);
  assert.match(css, /\.organization-topology-mode-control button\[aria-pressed="true"\]/u);
});
test("operational topology lays compact manager lanes left-to-right with renderer-owned rounded connectors", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /const placeDescendantLane/u);
  assert.match(source, /let childY = y;/u);
  assert.match(source, /childY \+= childHeight \+ OPERATIONAL_TOPOLOGY_LANE_GAP;/u);
  assert.match(source, /positions\.set\(manager\.node_id, \{ x: 252, y: companyY \}\);/u);
  assert.match(source, /companyY \+= laneHeight \+ OPERATIONAL_TOPOLOGY_LANE_GAP;/u);
  assert.match(source, /type: "smoothstep"/u);
  assert.match(source, /pathOptions: \{ borderRadius: 18, offset: 14 \}/u);
  assert.match(css, /\.organization-topology-node\s*\{[^}]*width:\s*196px;[^}]*height:\s*76px;/su);
  assert.match(css, /\.organization-topology-node-manager_anchor\s*\{[^}]*border-color:/su);
  assert.match(css, /\.organization-topology-node-responsibility_anchor\s*\{[^}]*border-color:/su);
  assert.match(css, /\.organization-topology-node-context_thread\s*\{[^}]*border-style:\s*dashed;/su);
  assert.match(css, /\.organization-topology-canvas\s*\{[^}]*overflow:\s*hidden;/su);
  assert.equal(source.includes("representedGroupIds"), false);
  assert.equal(source.includes('lane_id === "development1_projects"'), false);
  assert.equal(css.includes(".organization-topology-node::before"), false);
  assert.equal(css.includes(".organization-topology-node::after"), false);
});
test("realtime execution, approval, and result lanes stay in rightward desktop order", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  const lanesStart = source.indexOf('className="realtime-status-lanes"');
  const active = source.indexOf('statusKey="active"', lanesStart);
  const waiting = source.indexOf('statusKey="waiting"', active);
  const result = source.indexOf('statusKey="owner_result"', waiting);
  assert.ok(lanesStart >= 0 && active > lanesStart && waiting > active && result > waiting);
  assert.match(css, /\.realtime-status-lanes\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/su);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.realtime-status-lanes\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/su);
  assert.equal(source.includes('className="realtime-group-note"'), false);
});

test("automatic observation stays single-flight and commits candidate snapshots as non-blocking transitions", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /startTransition/u);
  assert.match(source, /refreshInFlightRef/u);
  assert.match(source, /if \(refreshInFlightRef\.current\)/u);
  assert.match(source, /if \(force\) setRefreshing\(true\);/u);
  assert.match(source, /Promise\.allSettled\(\[liveRefresh, usageRefresh\]\)/u);
  assert.doesNotMatch(source, /function updateProjection\(force = false\) \{\s*setRefreshing\(true\)/u);
});

test("thread detail opens above the board without narrowing its content", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /const mobileDialogOpen = Boolean\(isMobileDetail && selectedThread\);/u);
  assert.match(source, /\{selectedThread && \(/u);
  assert.match(css, /\.live-board-layout:has\(\.live-thread-detail:not\(\.is-modal\)\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/su);
  assert.match(css, /\.live-thread-detail\s*\{[^}]*position:\s*fixed;[^}]*right:\s*18px;[^}]*width:\s*min\(360px, calc\(100vw - 36px\)\);/su);
});
test("organization topology preserves exact parent context and fail-safe visual tones", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /node_kind === "context_thread"/u);
  assert.match(source, /topologyToneLabel\(data\.rollup_tone\)/u);
  assert.match(source, /organization-topology-rollup-badge/u);
  assert.doesNotMatch(source, /data\.thread\?\.result_state === "none"/u);
  assert.match(source, /type="target" position=\{Position\.Left\}/u);
  assert.match(source, /type="source" position=\{Position\.Right\}/u);
  assert.match(source, /target\?\.node_kind === "context_thread" \? target\.rollup_tone : target\?\.tone/u);
  assert.match(css, /\.organization-topology-node-transient_thread\.is-active/u);
  assert.match(css, /\.organization-topology-node-transient_thread\.is-waiting/u);
  assert.match(css, /\.organization-topology-node-transient_thread\.is-result/u);
  assert.match(css, /\.organization-topology-node-manager_anchor\.is-unknown/u);
  assert.match(css, /\.organization-topology-node-manager_anchor\.is-active/u);
  assert.match(css, /\.organization-topology-node-responsibility_anchor\.is-active/u);
  assert.match(css, /\.organization-topology-rollup-badge\.is-active/u);
});
test("read acknowledgement says it hides only the local Board view", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /읽었음 · 현황에서 숨기기/u);
  assert.match(source, /Codex TASK를 완료·보관·변경하지 않습니다/u);
  assert.match(source, /buildRealtimeStatusBuckets\(projection\.threads, ownerView\.threads\)/u);
  assert.match(source, /visibleOwnerThreadIds = new Set\(ownerView\.threads/u);
  assert.match(source, /visibleOwnerThreadIds\.has\(thread\.thread_id\)/u);
  assert.equal(source.includes("ownerHeadlineThreads"), false);
});

test("responsibility flow counts only active task threads as execution TASKs", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /function isActiveTaskThread/u);
  assert.match(source, /thread\?\.thread_kind === "task" && thread\?\.status === "active"/u);
  assert.equal(source.match(/filter\(isActiveTaskThread\)/gu)?.length, 3);
  assert.equal(source.includes('thread.thread_kind === "task" || thread.status === "active"'), false);
});

test("live search owns its input column and cancels the legacy mobile grid row", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.live-thread-search\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/su);
  assert.match(css, /\.live-board-controls \.live-thread-search\s*\{\s*grid-row:\s*auto;/su);
});

test("work and history filters explain response end and missing state signals without implying completion", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /value="stopped">응답 종료 · 결과 미확정</u);
  assert.match(source, /value="not_loaded_unknown">상태 신호 없음</u);
  assert.match(source, /value="error">상태 관측 오류</u);
  assert.match(source, /className="live-work-status-guide"/u);
  assert.match(source, /마지막 응답\/turn만 끝남 · TASK 완료 아님/u);
  assert.match(source, /등록은 됐지만 실행·대기·결과를 판정할 최신 신호 없음/u);
  assert.match(css, /\.live-work-status-guide\s*\{[^}]*grid-column:\s*1 \/ -1;/su);
});

test("AI usage breakdown rows stay top-aligned when sibling tables have different lengths", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.ai-usage-grid > section\s*\{[^}]*align-content:\s*start;/su);
});

test("usage distribution paints every declared column tone", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  for (const tone of ["amber", "teal", "purple", "green"]) {
    assert.match(source, new RegExp(`tone: "${tone}"`, "u"));
    assert.match(
      css,
      new RegExp(`\\.ledger-distribution-column\\.is-${tone} \\.ledger-bar > span\\s*\\{[^}]*background:`, "u"),
    );
  }
});

test("thirty-day usage chart separates exact provider tokens with readable responsive controls", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /Meter credits · 동일 축/u);
  assert.match(source, /Provider credit series legend/u);
  assert.match(source, /사용 총괄 provider token 범례/u);
  assert.match(source, /fleet-credit-area/u);
  assert.match(source, /role="tooltip"/u);
  assert.match(source, /fleet-token-hit-grid/u);
  assert.match(source, /providerDaily\.length === 30/u);
  assert.match(source, /monotoneAreaPath\(upperPoints, lowerPoints\)/u);
  assert.match(source, /index % 5 === 0/u);
  assert.match(source, /index % 2 === 0/u);
  assert.match(source, /\.total_tokens \?\? null/u);
  assert.match(source, /\.token_unknown_turns \?\? 0/u);
  assert.match(source, /토큰 미기록 \$\{series\.unknownTurns\[index\]\}회/u);
  assert.match(source, /합계\(기록분\)/u);
  assert.doesNotMatch(source, /fleet-credit-day-controls/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /onFocus=\{\(\) => setCreditChartIndex\(index\)\}/u);
  assert.match(source, /event\.currentTarget !== document\.activeElement/u);
  assert.match(source, /totalsFoot = "[^"]*30[^"]*"/u);
  assert.match(css, /height:\s*clamp\(280px,\s*21vw,\s*420px\)/u);
  assert.match(css, /grid-template-columns:\s*repeat\(30,/u);
  assert.match(source, /pending \? "사용량 불러오는 중"/u);
  assert.match(source, /Meter credit/u);
  assert.match(source, /cache: "no-store"/u);
  assert.match(source, /Claude \$\{claudeObservationState\}/u);
  assert.match(source, /Antigravity \$\{antigravityQuotaReady \? "READY" : "UNKNOWN\/HOLD"\}/u);
  assert.match(source, /Codex, Claude, Antigravity Gemini Meter credit 비교/u);
  for (const provider of ["codex", "claude", "antigravity"]) {
    assert.match(source, new RegExp(`provider-credit-\\$\\{series\\.id\\}`, "u"));
    assert.match(css, new RegExp(`\\.provider-credit-${provider}\\s*\\{[^}]*stroke:`, "u"));
  }
  assert.match(source, /Provider별 계산 가능한 credit 근거가 없습니다/u);
});

test("AI usage history controls stay on the work surface and expose only exact-ID ranking fields", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /surface === "work" && <AiUsagePanel/u);
  assert.match(source, /function AiUsageHistoryPanel/u);
  assert.match(source, /data-testid=\{`ai-usage-period-\$\{key\}`\}/u);
  assert.match(source, /data-testid="ai-usage-history-reconciliation"/u);
  assert.match(source, /labelKey="project_id"/u);
  assert.match(source, /labelKey="work_id"/u);
  assert.match(source, /labelKey="task_id"/u);
  assert.match(source, /정확한 ID 기준 사용 이력/u);
  assert.match(source, /KST 기준 토큰·크레딧/u);
  assert.match(source, /exactTaskLabels\.get\(row\[labelKey\]\)/u);
  assert.match(source, /자동 계측 정상/u);
  assert.match(source, /부분 계측/u);
  assert.match(source, /Meter hook 상태/u);
  assert.equal(source.includes("\\uc815\\ud655"), false);
  assert.equal(source.includes("source_path"), false);
  assert.equal(source.includes("session_path"), false);
  assert.match(css, /\.ai-usage-history-grid\s*\{/u);
  assert.match(css, /\.ai-usage-row strong\s*\{/u);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.ai-usage-history-grid/u);
});

test("AI usage history compares project and exact-linked organization totals without a chart dependency", () => {
  const source = readFileSync(APP_PATH, "utf8");
  const css = readFileSync(CSS_PATH, "utf8");
  assert.match(source, /buildProjectUsageChartRows/u);
  assert.match(source, /buildOrganizationUsageChartRows/u);
  assert.match(source, /className="ai-usage-chart-grid"/u);
  assert.match(source, /프로젝트별 토큰 사용량/u);
  assert.match(source, /조직별 연결 사용량/u);
  assert.match(source, /TASK exact ID와 Board 조직 등록이 일치한 사용량/u);
  assert.match(source, /조직 등록 연결을 불러오는 중입니다/u);
  assert.match(source, /조직 등록 연결을 확인할 수 없습니다\. 그래프 귀속을 추정하지 않습니다/u);
  assert.match(source, /isOrganizationUsageAttributionReady\(projection\)/u);
  assert.match(source, /상위 TASK 밖 집계와 조직 등록이 일치하지 않는 사용량은 미연결·기타로 유지합니다/u);
  assert.match(source, /<progress/u);
  assert.match(css, /\.ai-usage-chart-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/su);
  assert.match(css, /\.ai-usage-chart progress\s*\{[^}]*appearance:\s*none;/su);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.ai-usage-chart-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/su);
  assert.equal(source.includes("recharts"), false);
});

test("mobile detail restores focus by exact logical thread before using a stable control", () => {
  const source = readFileSync(APP_PATH, "utf8");
  assert.match(source, /data-live-thread-id=\{thread\.thread_id\}/u);
  assert.match(source, /node\.dataset\.liveThreadId === restoreThreadId/u);
  assert.match(source, /data-live-focus-fallback/u);
  assert.match(source, /\[triggerRef\.current, logicalTrigger, stableControl\]\.find\(canRestoreFocus\)/u);
  assert.match(source, /isFocusRestoreCandidate/u);
});
