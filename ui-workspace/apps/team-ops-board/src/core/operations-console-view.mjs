import { buildOperationsMap, directConnections } from './operations-map-view.mjs';

export const CONSOLE_ASSESSMENTS = Object.freeze({
  problem: { label: '이상 신호', tone: 'red', next: '검사 결과와 영향 범위를 확인하세요.' },
  pending: { label: '처리 보류', tone: 'amber', next: '보류 사유와 다음 처리 시각을 확인하세요.' },
  processing: { label: '처리 중', tone: 'blue', next: '기존 수집 주기로 순차 처리 중입니다. 지금 필요한 사용자 조치는 없습니다.' },
  history: { label: '과거 이력', tone: 'neutral', next: '과거 조사용 기록입니다. 현재 실행을 막는 사유나 사용자 조치로 분류하지 않습니다.' },
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

// Registration gaps, routine processing and historical records are not operator alerts.
export function needsIntervention(node) {
  return ['problem', 'pending', 'observation_error'].includes(node?.status?.key);
}

export function buildConsoleView(inputs = {}, failedSources = []) {
  const base = buildOperationsMap(inputs);
  const modelHosts = failedSources.includes('models') ? [] : (inputs.models?.hosts ?? []).filter(h => h.id?.startsWith('rag-model-'));
  const nodes = [...base.nodes.map(n => n.id === 'context_engine::prepare'
    ? { ...n, role: '허용 목록의 보관 항목을 읽어 문서 단위로 준비·검증' }
    : n.id === 'context_engine::models' && modelHosts.length ? { ...n,
      location: modelHosts.map(h => h.label).join(' · '),
      implementation: '호출 계약 구현 · 모델 서버 메타데이터 관측 연결',
      scope: '서버 API·등록 모델·적재 목록은 로컬 모델 서버 패널에서 확인 · 실제 추론과 검색 성공은 미검사',
      observedAt: inputs.models.observed_at, freshness: 'observed',
      sourceRef: 'ui-workspace/apps/team-ops-board/src/server/local-model-status-adapter.mjs' } : n), { ...grantNode }];
  const healthAvailable = Boolean(inputs.health?.snapshot) && !failedSources.includes('health');
  // Snapshot-only adapters deliberately return retained/stale. Keep the last
  // scan's findings visible, but never call the retained result current.
  const healthCurrent = healthAvailable && inputs.health?.refresh_state === 'ready';
  const edges = [...base.edges, { id: 'context-call:source_grant:prepare', from: grantNode.id,
    to: 'context_engine::prepare', relation: 'data', label: '허용된 항목만',
    evidenceMode: 'implementation_contract', receiptObserved: false, sourceRef: grantNode.sourceRef }];
  const collection=failedSources.includes('recent')?null:inputs.recent?.collection;
  const freshCollection=collection&&Date.now()-Date.parse(collection.observed_at)>=0&&Date.now()-Date.parse(collection.observed_at)<900000;
  let rows = nodes.map(n => n.id==='watchtower::ingress_supervisor'&&freshCollection
    &&(!n.observedAt||Date.parse(collection.observed_at)>=Date.parse(n.observedAt)-5000||(n.healthReasons?.length>0&&n.healthReasons.every(r=>['status_degraded','plaud_collection_degraded'].includes(r))))?{...n,collection,
    observedAt:collection.observed_at,healthReasons:collection.recovering?['plaud_collection_backlog']:[...new Set([...(n.healthReasons??[]),...(collection.errors??[])])],scope:'최신 수집 영수증의 목록·원본 보관·등록 결과 · 전처리·RAG 성공과 별도',
    status:collection.recovering?{...CONSOLE_ASSESSMENTS.processing,key:'processing',label:'수집 순차 처리 중',count:null}:collection.errors?.length?{...CONSOLE_ASSESSMENTS.problem,key:'problem',count:null}:consoleAssessment(n,healthAvailable)}:({ ...n, status: consoleAssessment(n, healthAvailable) }));
  const facts=failedSources.includes('incidents')?null:inputs.incidents;
  const fresh=at=>Date.now()-Date.parse(at)>=0&&Date.now()-Date.parse(at)<15*60000;
  rows=rows.map(n=>{
    if(n.id==='watchtower::mail_forwarder'&&facts?.mail?.history_only&&fresh(facts.mail.observed_at))return {...n,mailHistory:facts.mail,observedAt:facts.mail.observed_at,healthReasons:['historical_mail_failures'],scope:'최근 원본 가져오기 실행의 실패·보류와 과거 실패 장부를 구분 · 과거 메일 전달 성공은 미확인',status:{...CONSOLE_ASSESSMENTS.history,key:'history',count:null,label:`과거 실패 ${facts.mail.tracked}건 · 현재 회차 보류 없음`}};
    if(n.id==='watchtower::linear_collect'&&facts?.linear?.status==='ok'&&facts.linear.codes?.length===0&&fresh(facts.linear.observed_at)&&(!n.observedAt||Date.parse(facts.linear.observed_at)>=Date.parse(n.observedAt)-5000||n.status.key==='ok'))return {...n,observedAt:facts.linear.observed_at,healthReasons:[],status:{...CONSOLE_ASSESSMENTS.ok,key:'ok',label:'최근 수집 완료',count:null}};
    return n;
  });
  const watched = rows.filter(n => n.id.startsWith('watchtower::'));
  const counts = Object.fromEntries(Object.keys(CONSOLE_ASSESSMENTS).map(key => [key, watched.filter(n => n.status.key === key).length]));
  const rank = { problem: 0, pending: 1, observation_error: 2, history:3, unknown: 4, ok: 5 };
  const attention = watched.filter(needsIntervention).sort((a,b) => rank[a.status.key]-rank[b.status.key] || a.label.localeCompare(b.label,'ko'));
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
