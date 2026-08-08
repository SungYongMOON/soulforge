// topology-view.mjs — Watchtower topology health 스냅샷을 Board 화면 모델로
// 변환하는 순수 정규화 계층. 프레임워크 비종속(node:test 검증 대상).

export const TOPOLOGY_HEALTH_STATES = Object.freeze(["ok", "degraded", "stale", "down", "unmonitored"]);

const GROUP_COLUMNS = Object.freeze({
  "외부 소스": 0,
  "수집": 1,
  "게이트": 2,
  "데이터 평면": 2,
  "후처리": 3,
  "관측": 3,
  "소비": 4,
});

const COLUMN_LANES = Object.freeze({
  0: { label: "외부 소스", roleLabel: "INPUT", tone: "input" },
  1: { label: "수집·연산", roleLabel: "COLLECT", tone: "process" },
  2: { label: "데이터·판단", roleLabel: "DATA / DECISION", tone: "data" },
  3: { label: "후처리·판정", roleLabel: "PROCESS / ROUTE", tone: "route" },
  4: { label: "소비", roleLabel: "OUTPUT", tone: "output" },
});

const TOPOLOGY_COLUMN_GAP = 440;
const TOPOLOGY_ROW_GAP = 144;
const TOPOLOGY_TOP_GUTTER = 96;
const TOPOLOGY_LANE_WIDTH = 360;

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

export function distributeTopologyPorts(count) {
  if (!Number.isInteger(count) || count <= 0) return [];
  if (count === 1) return [50];
  if (count === 2) return [36, 64];
  if (count === 3) return [28, 50, 72];
  if (count === 4) return [22, 41, 59, 78];
  return Array.from({ length: count }, (_value, index) => 18 + (index * 64) / (count - 1));
}

function distributeTopologySteps(count) {
  if (count <= 1) return [0.5];
  if (count === 2) return [0.42, 0.58];
  if (count === 3) return [0.34, 0.5, 0.66];
  if (count === 4) return [0.3, 0.43, 0.57, 0.7];
  return Array.from({ length: count }, (_value, index) => 0.28 + (index * 0.44) / (count - 1));
}

export function buildTopologyViewModel(snapshot) {
  if (snapshot === null || typeof snapshot !== "object" || !Array.isArray(snapshot.nodes)) {
    return { available: false, nodes: [], edges: [], summary: null, attention: [], observedAt: null };
  }
  const columnCursor = new Map();
  const nodes = snapshot.nodes.map((node) => {
    const state = TOPOLOGY_HEALTH_STATES.includes(node?.health?.state) ? node.health.state : "unmonitored";
    const column = Number.isFinite(node?.col)
      ? Math.round(node.col)
      : (GROUP_COLUMNS[node.group] ?? 2);
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
      position: {
        x: column * TOPOLOGY_COLUMN_GAP,
        y: TOPOLOGY_TOP_GUTTER + row * TOPOLOGY_ROW_GAP,
      },
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const laneHeight = Math.max(360, ...nodes.map((node) => node.position.y + 94));
  const lanes = [...new Set(nodes.map((node) => Math.round(node.position.x / TOPOLOGY_COLUMN_GAP)))]
    .sort((left, right) => left - right)
    .map((column) => {
      const lane = COLUMN_LANES[column] ?? {
        label: `단계 ${column + 1}`,
        roleLabel: "FLOW",
        tone: "neutral",
      };
      return {
        id: `lane-col-${column}`,
        label: lane.label,
        roleLabel: lane.roleLabel,
        tone: lane.tone,
        kind: "lane",
        group: lane.label,
        width: TOPOLOGY_LANE_WIDTH,
        height: laneHeight,
        column,
        state: "lane",
        stateLabel: "",
        ageLabel: "",
        reasons: [],
        position: { x: column * TOPOLOGY_COLUMN_GAP - 64, y: 0 },
      };
    });
  const rawEdges = (Array.isArray(snapshot.edges) ? snapshot.edges : [])
    .filter((edge) => nodeById.has(edge?.from) && nodeById.has(edge?.to))
    .map((edge, index) => {
      return {
        id: `topo-edge-${index}`,
        source: String(edge.from),
        target: String(edge.to),
        label: typeof edge.label === "string" ? edge.label : "",
        flow: edge.flow === "control" ? "control" : "data",
      };
    });
  const inboundByNode = new Map(nodes.map((node) => [node.id, []]));
  const outboundByNode = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of rawEdges) {
    inboundByNode.get(edge.target).push(edge);
    outboundByNode.get(edge.source).push(edge);
  }
  const compareByOppositeNode = (side) => (left, right) => {
    const leftNode = nodeById.get(side === "input" ? left.source : left.target);
    const rightNode = nodeById.get(side === "input" ? right.source : right.target);
    return leftNode.position.y - rightNode.position.y
      || leftNode.position.x - rightNode.position.x
      || left.id.localeCompare(right.id);
  };
  for (const entries of inboundByNode.values()) entries.sort(compareByOppositeNode("input"));
  for (const entries of outboundByNode.values()) entries.sort(compareByOppositeNode("output"));

  const routeByEdge = new Map();
  for (const node of nodes) {
    const inbound = inboundByNode.get(node.id);
    const outbound = outboundByNode.get(node.id);
    const inputTops = distributeTopologyPorts(inbound.length);
    const outputTops = distributeTopologyPorts(outbound.length);
    const outputSteps = distributeTopologySteps(outbound.length);
    inbound.forEach((edge, index) => {
      routeByEdge.set(edge.id, {
        ...(routeByEdge.get(edge.id) ?? {}),
        targetHandle: `input-${edge.id}`,
        targetPortIndex: index,
        targetPortTop: inputTops[index],
      });
    });
    outbound.forEach((edge, index) => {
      routeByEdge.set(edge.id, {
        ...(routeByEdge.get(edge.id) ?? {}),
        sourceHandle: `output-${edge.id}`,
        sourcePortIndex: index,
        sourcePortTop: outputTops[index],
        stepPosition: outputSteps[index],
      });
    });
  }
  const routedNodes = nodes.map((node) => ({
    ...node,
    inputPorts: inboundByNode.get(node.id).map((edge) => ({
      id: `input-${edge.id}`,
      edgeId: edge.id,
      top: routeByEdge.get(edge.id).targetPortTop,
    })),
    outputPorts: outboundByNode.get(node.id).map((edge) => ({
      id: `output-${edge.id}`,
      edgeId: edge.id,
      top: routeByEdge.get(edge.id).sourcePortTop,
    })),
  }));
  const edges = rawEdges.map((edge) => ({ ...edge, ...routeByEdge.get(edge.id) }));
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
    nodes: [...lanes, ...routedNodes],
    edges,
    summary,
    attention,
    observedAt: typeof snapshot.observed_at === "string" ? snapshot.observed_at : null,
  };
}
