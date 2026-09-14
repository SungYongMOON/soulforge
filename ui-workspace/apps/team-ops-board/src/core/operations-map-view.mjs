import { buildTopologyFederationViewModel } from './topology-federation-view.mjs';
import { buildUnifiedTopologyViewModel } from './topology-unified-view.mjs';
import { buildTopologyRecoverySupervision } from './topology-recovery-view.mjs';

// Presentation registration only. Node identity/edges stay in the existing
// federation; the context implementation has not yet supplied health receipts.
const CONTEXT_REF = 'guild_hall/context_engine/README.md';
export const OPERATION_STAGES = Object.freeze([
  { id: 'collect', title: '수집', subtitle: 'Tributary · 외부 자료의 입구', x: 0, y: 45, icon: 'inbox' },
  { id: 'custody', title: '원본 보관', subtitle: 'Heartwood · 원본과 출처 보존', x: 330, y: 0, icon: 'archive' },
  { id: 'prepare', title: '전처리·검증', subtitle: '원문 정규화 · 세대 검증', x: 660, y: 45, icon: 'filter' },
  { id: 'extract', title: '청킹·임베딩·그래프', subtitle: '문서를 검색 가능한 단위로', x: 990, y: 0, icon: 'boxes' },
  { id: 'graph', title: '통합 Neo4j', subtitle: '과제·세대별 파생 색인', x: 990, y: 365, icon: 'database' },
  { id: 'context', title: '검색·맥락 구성', subtitle: '맥락이 · 근거를 모아 조립', x: 660, y: 410, icon: 'search' },
  { id: 'response', title: '에이전트·사용자 응답', subtitle: 'Buzz · 응답 에이전트 · 모델', x: 330, y: 365, icon: 'message' },
  { id: 'support', title: '관측·지원', subtitle: 'Vigil · 복구 · 사용량 · 구조', x: 0, y: 410, icon: 'activity' },
]);

export const CONTEXT_NODES = Object.freeze([
  { id: 'context_engine::prepare', label: '자료 준비·검증', stage: 'prepare', role: '준비된 자료와 세대 manifest 검증', location: 'Context Engine · 준비기', sourceRef: CONTEXT_REF, implementation: '코드 구현 · 운영 관측 미연결' },
  { id: 'context_engine::extract', label: '청킹·임베딩·추출', stage: 'extract', role: 'extractGraphFragments · 그래프 조각과 벡터 생성', location: 'Context Engine · GraphRAG worker', sourceRef: CONTEXT_REF, implementation: '코드 구현 · 모델 호출 관측 미연결' },
  { id: 'context_engine::neo4j', label: 'Neo4j 통합 색인', stage: 'graph', role: 'materializeGraphIndex · 과제·세대 경계의 파생 그래프', location: 'Neo4j · 정확한 실행 binding은 관측 미연결', sourceRef: CONTEXT_REF, implementation: '적재·검색 코드 구현 · DB 건강 미확인' },
  { id: 'context_engine::search', label: '벡터·하이브리드 검색', stage: 'context', role: 'createGraphSearch · manifest 안의 근거만 반환', location: 'Context Engine · GraphRAG retriever', sourceRef: CONTEXT_REF, implementation: '코드 구현 · 검색 영수증 미연결' },
  { id: 'context_engine::compose', label: '맥락이', stage: 'context', role: 'composeWorkingContext · 검색 방식 선택과 작업 맥락 조립', location: '신뢰된 모델 binding · 실행 위치 미확인', sourceRef: CONTEXT_REF, implementation: '코드 구현 · 현재 실행 미확인' },
  { id: 'context_engine::models', label: '추출 LLM · 임베더', stage: 'extract', role: 'binding으로 지정된 모델이 추출과 임베딩 수행', location: '모델 호스트 관측 미연결', sourceRef: CONTEXT_REF, implementation: '호출 계약 구현 · 가용성 미확인' },
  { id: 'operations::response_agent', label: '응답 에이전트', stage: 'response', role: '사용자 응답 에이전트 · 현재 맥락 전달 연결은 미확인', location: '정확한 실행 위치 관측 미연결', sourceRef: null, implementation: '요청된 표시 항목 · 연결 근거 미등록' },
]);
// These lines represent documented implementation calls, never runtime traffic.
export const CONTEXT_EDGES = Object.freeze([
  ['prepare', 'extract', '준비된 문서'], ['models', 'extract', '모델 호출 계약'],
  ['extract', 'neo4j', '색인 세대 적재'], ['neo4j', 'search', '세대 범위 검색'], ['search', 'compose', '근거 조립'],
].map(([a,b,label]) => ({ id: `context-call:${a}:${b}`, from: `context_engine::${a}`, to: `context_engine::${b}`, label,
  sourceRef: CONTEXT_REF, relation: 'data', evidenceMode: 'implementation_contract', receiptObserved: false })));

function stageFor(node) {
  if (node.stage) return node.stage;
  const local = node.id.replace(/^watchtower::/u, '');
  if (['ingress_supervisor','gate_five_field','store_usage_ledger','store_workmeta','src_agent_runtime'].includes(local)) return 'support';
  if (local === 'src_buzz') return 'response';
  if (local === 'voice_label_worker' || local === 'gate_five_field') return 'prepare';
  if (node.provider_id !== 'watchtower') return 'support';
  if (node.group === '수집' || node.group === '외부 소스') return 'collect';
  if (node.kind === 'store' && node.group !== '백업') return 'custody';
  return 'support';
}

export function buildOperationsMap({ federation, health, recovery, graph } = {}) {
  const declared = buildTopologyFederationViewModel(federation);
  const providerIds = declared.providers.map(p => p.id);
  const groupKeys = [...new Set(declared.flattened.nodes.map(n => `${n.provider_id}::${n.group ?? '그룹 없음'}`))];
  const unified = buildUnifiedTopologyViewModel(federation, health, { providerIds, groupKeys });
  const sourceNodes = unified.nodes.filter(n => n.displayKind === 'node');
  const nodes = sourceNodes.map(n => {
    const local = n.id.startsWith('watchtower::') ? n.id.slice(12) : null;
    const raw = local ? health?.snapshot?.nodes?.find(item => item.id === local) : null;
    const observed = raw && raw.health.state !== 'unmonitored';
    const provider = declared.providers.find(p => p.id === n.providerId);
    return { id: n.id, label: n.label, stage: stageFor(n.source), role: `${n.source.kind} · ${n.source.group}`,
      location: raw?.tracking?.evidence_owner ? `관측 소유자: ${raw.tracking.evidence_owner} · 실행 경로 미제공` : '실행 위치 관측 미연결',
      implementation: `${provider?.declaredStatusLabel ?? '구조 등록'} · ${provider?.validationStateLabel ?? '검증 미확인'}`,
      health: raw?.health?.state ?? 'unknown', healthReasons: raw?.health?.reasons ?? [],
      freshness: observed ? health?.refresh_state === 'ready' ? 'fresh' : 'retained' : 'unknown',
      observedAt: observed ? raw.tracking?.last_checked_at ?? health.snapshot.observed_at : null,
      scope: raw?.health_scope === 'node' ? '노드 상태·근거 시각 검사 · 업무 산출물과 종단 전달은 미진단' : raw?.health_scope ?? n.healthEvidenceScope ?? '선언 구조만 · 실행·업무 성공 미진단',
      nextCheck: raw?.tracking?.next_check_at ?? null,
      sourceRef: provider?.sourceId ?? 'guild_hall/watchtower/topology/federated_topology.v1.json',
      recovery: local ? buildTopologyRecoverySupervision({ projection: recovery, nodeId: local }) : null };
  });
  nodes.push(...CONTEXT_NODES.map(n => ({ ...n, health: 'unknown', freshness: 'unknown', observedAt: null,
    healthReasons: [], scope: '구현 계약만 · 실행·전달·복구 진단 미연결', recovery: null })));
  const responseAgent = nodes.find(n => n.id === 'operations::response_agent');
  if (responseAgent && graph?.response_agent_label) responseAgent.label = graph.response_agent_label;
  const graphNode = nodes.find(n => n.id === 'context_engine::neo4j');
  if (graphNode && graph?.rows?.length) {
    graphNode.graphReceipts = graph;
    graphNode.observedAt = graph.rows.map(r=>r.observed_at).sort().at(0);
    graphNode.freshness = graph.summary?.fresh ? 'fresh' : 'retained';
    graphNode.implementation = '구현 + 기존 반영 영수증 연결';
    graphNode.scope = '구성된 과제의 세대·청크·노드 수 DB 되읽기 결과만 · 현재 DB 생존과 응답 품질 미진단';
    graphNode.sourceRef = 'guild_hall/context_engine/harness/estate_graph_sync.mjs';
  }
  const ids = new Set(nodes.map(n => n.id));
  const edges = [...unified.edges.map(e => ({ ...e, from: e.source, to: e.target })), ...CONTEXT_EDGES]
    .filter(e => ids.has(e.from) && ids.has(e.to));
  const stages = OPERATION_STAGES.map(stage => ({ ...stage, members: nodes.filter(n => n.stage === stage.id) }));
  return { stages, nodes, edges, sourceAvailable: declared.available, observedAt: health?.snapshot?.observed_at ?? null,
    refreshState: health?.refresh_state ?? 'unavailable', gaps: ['보관 → 맥락 엔진 자료 준비: 전달 연결 미확인 (음성 후처리와 별도)', '맥락이 → 응답 에이전트·Buzz: 전달 연결 미등록'],
    matchedCount: nodes.filter(n => n.observedAt).length };
}

export function stageConnections(model) {
  const nodeById = new Map(model.nodes.map(n => [n.id, n]));
  const groups = new Map();
  for (const edge of model.edges) {
    if (edge.relation !== 'data') continue;
    const from = nodeById.get(edge.from)?.stage, to = nodeById.get(edge.to)?.stage;
    if (!from || !to || from === to) continue;
    const key = `${from}:${to}:${edge.evidenceMode === 'implementation_contract' ? 'implementation' : 'declared'}`;
    const prior = groups.get(key);
    if (prior) prior.count++;
    else groups.set(key, { id: key, source: from, target: to, count: 1, label: edge.evidenceMode === 'implementation_contract' ? '구현 계약 · 관측 미연결' : '등록된 구조', observed: false });
  }
  return [...groups.values()];
}

export function directConnections(model, nodeId) {
  const byId = new Map(model.nodes.map(node => [node.id, node]));
  if (!byId.has(nodeId)) return { incoming: [], outgoing: [] };
  return {
    incoming: model.edges.filter(edge => edge.to === nodeId && byId.has(edge.from))
      .map(edge => ({ edge, node: byId.get(edge.from) })),
    outgoing: model.edges.filter(edge => edge.from === nodeId && byId.has(edge.to))
      .map(edge => ({ edge, node: byId.get(edge.to) })),
  };
}

export function architectureScene(model) {
  const columns = { custody: 2, prepare: 3, extract: 4, graph: 5, context: 6, response: 7 };
  const family = id => /buzz/u.test(id) ? 0 : /linear/u.test(id) ? 1 : /mail|hiworks/u.test(id) ? 2
    : /slack/u.test(id) ? 3 : /voice|plaud/u.test(id) ? 4 : /activity|onedrive|local/u.test(id) ? 5 : /usage/u.test(id) ? 6 : 7;
  const sceneNodes = model.nodes.filter(n => n.stage !== 'support').map(n => {
    const source = n.id.startsWith('watchtower::src_');
    const column = n.id === 'watchtower::src_buzz' ? 0 : n.stage === 'collect' ? source ? 0 : 1 : columns[n.stage];
    const row = n.id.startsWith('watchtower::') ? family(n.id) : /models|compose/u.test(n.id) ? 4 : 2;
    const shape = n.id === 'context_engine::neo4j' || n.role?.startsWith('store') ? 'store'
      : n.stage === 'response' && n.id !== 'watchtower::src_buzz' || n.id === 'context_engine::compose' ? 'agent' : 'process';
    return { ...n, column, row, shape, position: { x: column * 180, y: 55 + row * 76 } };
  });
  // Keep identities and relation direction. No aggregate stage bridge can turn
  // one voice-processing connection into the context engine's missing input.
  const byId = new Map(sceneNodes.map(n => [n.id,n]));
  const sceneEdges = model.edges.filter(e => e.relation === 'data' && byId.has(e.from) && byId.has(e.to)).map(e => {
    const from=byId.get(e.from), to=byId.get(e.to);
    return { ...e, sourceHandle: from.column === to.column ? from.row < to.row ? 'bottom' : 'top-out' : from.column < to.column ? 'right' : 'left-out',
      targetHandle: from.column === to.column ? from.row < to.row ? 'top' : 'bottom-in' : from.column < to.column ? 'left' : 'right-in' };
  });
  return { nodes: sceneNodes, edges: sceneEdges };
}
