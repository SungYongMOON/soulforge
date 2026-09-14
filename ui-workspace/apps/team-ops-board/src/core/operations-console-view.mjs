import { buildOperationsMap, directConnections } from './operations-map-view.mjs';

export const CONSOLE_ASSESSMENTS = Object.freeze({
  problem: { label: '이상 신호', tone: 'red', next: '검사 결과와 영향 범위를 확인하세요.' },
  pending: { label: '처리 보류', tone: 'amber', next: '보류 사유와 다음 처리 시각을 확인하세요.' },
  observation_error: { label: '확인 불가', tone: 'amber', next: '관측·검사 근거를 확인하세요. 서비스 중단이 확정된 것은 아닙니다.' },
  unknown: { label: '미확인', tone: 'neutral', next: '아직 판단할 근거가 없습니다. 구현·연결과 검사 범위를 확인하세요.' },
  ok: { label: '검사 통과', tone: 'green', next: '아래 검사 범위에서 확인됐습니다. 모든 업무의 성공을 뜻하지 않습니다.' },
});

// A documented input artifact, not a new service or a claim that every custody
// store feeds the preparer. Source-specific runtime joins still need receipts.
const grantNode = Object.freeze({ id: 'context_engine::source_grant', label: '사용 허용된 보관 항목',
  stage: 'prepare', role: '과제·목적·항목·판본이 지정된 source grant',
  implementation: '입력 계약 구현 · 설치 연결 미확인', location: 'Context Engine · grant / admission',
  scope: '허용된 항목만 준비기에 전달하는 코드 계약 · 실제 실행 미진단',
  sourceRef: 'guild_hall/context_engine/harness/estate_graph_sync.mjs',
  health: 'unknown', observedAt: null, freshness: 'unknown', healthReasons: [], recovery: null });

export function consoleAssessment(node, healthAvailable = true) {
  const key = node?.id?.startsWith('watchtower::') && !healthAvailable
    ? 'unknown' : node?.assessment?.key ?? 'unknown';
  const base = CONSOLE_ASSESSMENTS[key] ?? CONSOLE_ASSESSMENTS.unknown;
  return { ...base, key, count: node?.assessment?.pendingCount ?? null };
}

export function buildConsoleView(inputs = {}, failedSources = []) {
  const base = buildOperationsMap(inputs);
  const nodes = [...base.nodes.map(n => n.id === 'context_engine::prepare'
    ? { ...n, role: '허용 목록의 보관 항목을 읽어 문서 단위로 준비·검증' } : n), { ...grantNode }];
  const healthAvailable = Boolean(inputs.health?.snapshot) && !failedSources.includes('health');
  // Snapshot-only adapters deliberately return retained/stale. Keep the last
  // scan's findings visible, but never call the retained result current.
  const healthCurrent = healthAvailable && inputs.health?.refresh_state === 'ready';
  const edges = [...base.edges, { id: 'context-call:source_grant:prepare', from: grantNode.id,
    to: 'context_engine::prepare', relation: 'data', label: '허용된 항목만',
    evidenceMode: 'implementation_contract', receiptObserved: false, sourceRef: grantNode.sourceRef }];
  const rows = nodes.map(n => ({ ...n, status: consoleAssessment(n, healthAvailable) }));
  const watched = rows.filter(n => n.id.startsWith('watchtower::'));
  const counts = Object.fromEntries(Object.keys(CONSOLE_ASSESSMENTS).map(key => [key, watched.filter(n => n.status.key === key).length]));
  const rank = { problem: 0, pending: 1, observation_error: 2, unknown: 3, ok: 4 };
  const attention = watched.filter(n => n.status.key !== 'ok').sort((a,b) => rank[a.status.key]-rank[b.status.key] || a.label.localeCompare(b.label,'ko'));
  return { ...base, nodes: rows, edges, counts, attention, watchedCount: watched.length, healthAvailable, healthCurrent,
    stages: base.stages.map(s => ({ ...s, members: rows.filter(n => n.stage === s.id) })) };
}

export function focusScene(model, nodeId) {
  const center = model.nodes.find(n => n.id === nodeId);
  if (!center) return { nodes: [], edges: [] };
  const adjacent = directConnections(model, nodeId);
  const incoming = [...new Map(adjacent.incoming.map(r=>[r.node.id,r.node])).values()];
  const outgoing = [...new Map(adjacent.outgoing.map(r=>[r.node.id,r.node])).values()].filter(n=>n.id !== nodeId && !incoming.some(x=>x.id===n.id));
  const height = Math.max(incoming.length, outgoing.length, 1) * 98;
  const nodes = [ { ...center, position: { x: 270, y: height/2-38 } },
    ...incoming.filter(n=>n.id!==nodeId).map((n,i)=>({ ...n, position: { x: 0, y: i*98 } })),
    ...outgoing.map((n,i)=>({ ...n, position: { x: 540, y: i*98 } })) ];
  const ids = new Set(nodes.map(n=>n.id));
  return { nodes, edges: model.edges.filter(e => (e.from === nodeId || e.to === nodeId) && ids.has(e.from) && ids.has(e.to)) };
}

export function directoryKey(root, relative = '') { return JSON.stringify([root, relative]); }
export function flattenDirectory(root, relative, cache, expanded, maxRows = 500) {
  const rows = [];
  function visit(parent, depth) {
    const data = cache[directoryKey(root,parent)];
    if (!data) return;
    for (const entry of data.entries ?? []) {
      if (rows.length >= maxRows) return;
      const location = parent ? `${parent}/${entry.name}` : entry.name;
      rows.push({ ...entry, relative: location, parent, depth });
      if (entry.browsable && expanded.has(directoryKey(root,location))) visit(location,depth+1);
    }
  }
  visit(relative,0);
  return rows;
}

// No model/day -> task attribution exists in the current aggregate contract.
// Only drill into the measured model row; keep period task totals separate.
export function selectedUsageDay(history, date, modelId, excludedModelIds) {
  const day = history?.model_daily?.find(row=>row.date===date);
  if (!day) return null;
  if (modelId==='other' && !Array.isArray(excludedModelIds)) return null;
  const rows = (day.models ?? []).filter(row=>!modelId || (modelId==='other' ? !excludedModelIds.includes(row.model_id) : row.model_id===modelId));
  return { date, rows, scope: 'model_daily_only', taskAttribution: 'unavailable' };
}
