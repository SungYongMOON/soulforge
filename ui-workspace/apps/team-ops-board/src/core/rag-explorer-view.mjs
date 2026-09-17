export const RAG_SOURCES = { slack: 'Slack', mail: '메일', linear: 'Linear', voice: 'PLAUD·음성', document: '문서', buzz: 'Buzz' };
const numeric = n => Number.isSafeInteger(n) && n >= 0;

export function ragConnections(snapshot) {
  const projects = snapshot?.projects ?? [], nodes = [], edges = [], totals = new Map();
  projects.forEach((p, i) => {
    const ready = p.comparison === 'counts_match' && p.detail_state === 'ready';
    nodes.push({ id: p.project, kind: 'project', label: p.project_name ? `${p.project} · ${p.project_name}` : p.project, project: p.project, count: ready ? p.store?.counts?.documents : null, x: 460, y: i * 95 });
    if (!ready) return;
    for (const [source, count] of Object.entries(p.source_links?.types ?? {})) {
      if (!numeric(count) || count === 0) continue;
      totals.set(source, (totals.get(source) ?? 0) + count);
      edges.push({ id: `${source}:${p.project}`, source: `source:${source}`, target: p.project, label: `${count} 문서`, count });
    }
  });
  [...totals].forEach(([source, count], i) => nodes.push({ id: `source:${source}`, kind: 'source', label: RAG_SOURCES[source] ?? source, count, x: 0, y: i * 95 }));
  return { nodes, edges, complete: Boolean(snapshot?.expected && projects.length === snapshot.expected && projects.every(p => p.comparison === 'counts_match' && p.detail_state === 'ready')), sources: [...totals].map(([id, count]) => ({ id, label: RAG_SOURCES[id] ?? id, count })) };
}

export function detectEntityType(labels = []) {
  const exclude = new Set(['Document', 'Chunk', 'Entity', 'Node']);
  const clean = (Array.isArray(labels) ? labels : []).filter(l => typeof l === 'string' && !exclude.has(l) && !l.startsWith('__'));
  return clean[0] || '개체';
}

export function entityColorKey(type = '') {
  const t = String(type).toLowerCase();
  if (/person|인물|사람|user|member|작업자|담당자/.test(t)) return 'person';
  if (/equip|장비|설비|device|tool|기기|센서|머신|machine/.test(t)) return 'equipment';
  if (/event|사건|행사|issue|장애|사고|incident|점검/.test(t)) return 'event';
  if (/decis|결정|의결|plan|계획|방침|정책|policy/.test(t)) return 'decision';
  if (/req|요청|티켓|ticket|inquiry|문의|task/.test(t)) return 'request';
  if (/org|조직|부서|팀|team|dept|company|회사/.test(t)) return 'org';
  return 'default';
}

function layoutConcentric(nodes, edges, cx = 460, cy = 300) {
  const N = nodes.length;
  if (N === 0) return [];
  if (N === 1) return [{ ...nodes[0], x: cx, y: cy }];

  const deg = new Map();
  nodes.forEach(n => deg.set(n.id, 0));
  edges.forEach(e => {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  });

  const sorted = [...nodes].sort((a, b) => (deg.get(b.id) - deg.get(a.id)) || a.id.localeCompare(b.id));
  const ringCapacities = [N <= 4 ? N : 2, 8, 16, 24, 32];
  const ringRadii = [N <= 4 ? 130 : 60, 180, 310, 440, 560];

  const positioned = [];
  let index = 0;

  for (let r = 0; r < ringCapacities.length && index < N; r++) {
    const cap = ringCapacities[r];
    const radius = ringRadii[r];
    const countInRing = Math.min(cap, N - index);
    const ringNodes = sorted.slice(index, index + countInRing);

    for (let i = 0; i < countInRing; i++) {
      const angle = (i / countInRing) * 2 * Math.PI - Math.PI / 2 + (r * 0.35);
      const x = Math.round(cx + radius * Math.cos(angle));
      const y = Math.round(cy + radius * Math.sin(angle));
      positioned.push({
        ...ringNodes[i],
        x,
        y
      });
    }
    index += countInRing;
  }

  return positioned;
}

const names = {
  CHANGES: '변경', CONCERNS: '관련 대상', DECIDED_AT: '결정 시점', REFERENCES: '참조',
  FOLLOWS_UP: '후속 조치', REQUIRES: '필요', DEPENDS_ON: '의존', ASSIGNED_TO: '담당',
  FROM_DOCUMENT: '문서에 속함',
  FROM_CHUNK: '본문 출처',
  NEXT_CHUNK: '다음 청크',
  REFERS_TO: '명시적 참조',
  RELATED_EVIDENCE: '관련 근거'
};

export const ENTITY_TYPE_NAMES={Person:'사람',Equipment:'장비',Event:'일정·사건',Decision:'결정',Request:'요청',Commitment:'약속·후속 조치',Constraint:'조건',Change:'변경',ReferencedDocument:'참고 문서',Organization:'조직'};

export function ragGraphScene(graph, mode = 'semantic') {
  if (mode === 'storage') {
    const columns = [0, 0, 0];
    const nodes = (graph?.nodes ?? []).map(n => {
      const labels = Array.isArray(n.labels) ? n.labels : [];
      const kind = labels.includes('Document') ? 'document' : labels.includes('Chunk') ? 'chunk' : 'entity';
      const column = kind === 'document' ? 0 : kind === 'chunk' ? 1 : 2, index = columns[column]++;
      const label = n.name || (kind === 'document' ? (n.document ? (n.document.length > 28 ? `${n.document.slice(0, 20)}…` : n.document) : '문서') : kind === 'chunk' ? (n.unit ? `청크 ${n.unit.split(':').at(-1)}` : `청크 ${index + 1}`) : labels[0] ?? '개체');
      return { ...n, kind, label, mode: 'storage', x: column * 360 + (kind === 'entity' ? Math.floor(index / 12) * 320 : 0), y: (kind === 'entity' ? index % 12 : index) * 96 };
    });
    const ids = new Set(nodes.map(n => n.id));
    const edges = (graph?.edges ?? []).filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...e, label: names[e.type] ?? e.type }));
    return { nodes, edges, mode: 'storage' };
  }

  // mode === 'semantic'
  const rawNodes = graph?.nodes ?? [];
  const entityNodes = rawNodes.filter(n => {
    const labels = Array.isArray(n.labels) ? n.labels : [];
    if (labels.includes('Document') || labels.includes('Chunk')) return false;
    if ((n.id && String(n.id).startsWith('__')) || (n.name && String(n.name).startsWith('__'))) return false;
    return true;
  }).map(n => {
    const labels = Array.isArray(n.labels) ? n.labels : [];
    const entityType = detectEntityType(labels);
    const colorKey = entityColorKey(entityType);
    const label = n.name || n.label || entityType;
    return {
      ...n,
      kind: 'entity',
      mode: 'semantic',
      entityType,
      colorKey,
      label
    };
  });

  const entityIds = new Set(entityNodes.map(n => n.id));
  const semanticEdges = (graph?.edges ?? []).filter(e => entityIds.has(e.source) && entityIds.has(e.target)).map(e => ({
    ...e,
    label: names[e.type] ?? (e.type ? String(e.type).replace(/_/g, ' ') : '연결')
  }));

  const layoutNodes = layoutConcentric(entityNodes, semanticEdges);
  return {
    nodes: layoutNodes,
    edges: semanticEdges,
    mode: 'semantic'
  };
}
