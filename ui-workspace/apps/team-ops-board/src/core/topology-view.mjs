// topology-view.mjs — Watchtower topology health 스냅샷을 Board 화면 모델로
// 변환하는 순수 정규화 계층. 프레임워크 비종속(node:test 검증 대상).

export const TOPOLOGY_HEALTH_STATES = Object.freeze(["ok", "degraded", "stale", "down", "unmonitored"]);

const GROUP_COLUMNS = Object.freeze({
  "외부 소스": 0,
  "수집": 1,
  "관측": 1,
  "게이트": 2,
  "데이터 평면": 2,
  "소비": 3,
});

const STATE_LABELS = Object.freeze({
  ok: "정상",
  degraded: "열화",
  stale: "신선도 초과",
  down: "정지",
  unmonitored: "미감시",
});

const REASON_LABELS = Object.freeze({
  heartbeat_late: "하트비트 지각",
  heartbeat_stale: "하트비트 신선도 초과",
  task_not_running: "예약작업 미실행",
  task_query_failed: "예약작업 조회 실패",
  source_missing: "신호 파일 없음",
  source_empty: "신호 기록 없음",
  probe_unbound: "판정 미바인딩",
});

export function describeTopologyReason(reason) {
  if (typeof reason !== "string") return "알 수 없는 사유";
  if (REASON_LABELS[reason] !== undefined) return REASON_LABELS[reason];
  if (reason.startsWith("status_")) return `상태 신호: ${reason.slice("status_".length)}`;
  if (reason.startsWith("count_")) return `수치 초과: ${reason.slice("count_".length)}`;
  return reason;
}

export function describeTopologyAge(ageSeconds) {
  if (!Number.isFinite(ageSeconds)) return "관측 없음";
  if (ageSeconds < 90) return `${Math.max(0, Math.round(ageSeconds))}초 전`;
  if (ageSeconds < 5400) return `${Math.round(ageSeconds / 60)}분 전`;
  return `${Math.round(ageSeconds / 3600)}시간 전`;
}

export function buildTopologyViewModel(snapshot) {
  if (snapshot === null || typeof snapshot !== "object" || !Array.isArray(snapshot.nodes)) {
    return { available: false, nodes: [], edges: [], summary: null, attention: [], observedAt: null };
  }
  const columnCursor = new Map();
  const nodes = snapshot.nodes.map((node) => {
    const state = TOPOLOGY_HEALTH_STATES.includes(node?.health?.state) ? node.health.state : "unmonitored";
    const column = Number.isFinite(node?.col) ? node.col : (GROUP_COLUMNS[node.group] ?? 2);
    let row;
    if (Number.isFinite(node?.row)) {
      row = node.row;
    } else {
      row = columnCursor.get(column) ?? 0;
      columnCursor.set(column, row + 1);
    }
    return {
      id: String(node.id),
      label: String(node.label),
      kind: String(node.kind ?? "worker"),
      group: String(node.group ?? ""),
      state,
      stateLabel: STATE_LABELS[state],
      ageLabel: describeTopologyAge(node?.health?.age_seconds),
      reasons: Array.isArray(node?.health?.reasons)
        ? node.health.reasons.map((reason) => describeTopologyReason(reason))
        : [],
      position: { x: column * 300, y: 64 + row * 100 },
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const captionColumns = new Map();
  for (const node of nodes) {
    const column = Math.round(node.position.x / 300);
    if (!captionColumns.has(column)) captionColumns.set(column, node.group);
  }
  const captions = [...captionColumns.entries()]
    .filter(([, group]) => group.length > 0)
    .map(([column, group]) => ({
      id: `caption-col-${column}`,
      label: group,
      kind: "caption",
      group,
      state: "caption",
      stateLabel: "",
      ageLabel: "",
      reasons: [],
      position: { x: column * 300, y: 8 },
    }));
  const FLOWING = new Set(["ok", "degraded"]);
  const edges = (Array.isArray(snapshot.edges) ? snapshot.edges : [])
    .filter((edge) => nodeById.has(edge?.from) && nodeById.has(edge?.to))
    .map((edge, index) => {
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
      const flowing = FLOWING.has(source.state) || FLOWING.has(target.state);
      return {
        id: `topo-edge-${index}`,
        source: String(edge.from),
        target: String(edge.to),
        label: typeof edge.label === "string" ? edge.label : "",
        flow: edge.flow === "control" ? "control" : "data",
        flowing,
      };
    });
  const summary = Object.fromEntries(TOPOLOGY_HEALTH_STATES.map((state) => [
    state,
    nodes.filter((node) => node.state === state).length,
  ]));
  const attention = nodes
    .filter((node) => node.state === "degraded" || node.state === "stale" || node.state === "down")
    .sort((left, right) => {
      const rank = { down: 0, stale: 1, degraded: 2 };
      return rank[left.state] - rank[right.state];
    });
  return {
    available: true,
    nodes: [...captions, ...nodes],
    edges,
    summary,
    attention,
    observedAt: typeof snapshot.observed_at === "string" ? snapshot.observed_at : null,
  };
}
