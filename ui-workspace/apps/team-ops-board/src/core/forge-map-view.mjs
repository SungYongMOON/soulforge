// forge-map-view.mjs — 대장간 지도 첫 화면의 순수 view-model.
//
// 한 장의 그림으로 "우리 구조가 지금 실제로 돌고 있는가"를 답한다. 입력은 Vigil이
// 이미 들고 있는 읽기 전용 스냅샷 넷뿐이다.
//
//   topology        /topology-health.snapshot.json   (Watchtower 노드 건강)
//   tongs           /tongs.snapshot.json             (Tongs 하트비트)
//   secureWork      /secure-work.snapshot.json       (외부 작업 사이클 상태)
//   scheduledTasks  /scheduled-tasks.snapshot.json   (Bellows 예약 작업)
//
// 이 모듈은 순수 함수만 담는다: fetch·타이머·DOM·파일·프로세스가 없고, writer도 없다.
//
// 상태 어휘. plan 08의 패널 enum(`healthy` `degraded` `stale` `unavailable`
// `unknown` `hold`)과 Watchtower 노드 enum(`ok` `degraded` `stale` `down`
// `unmonitored`)은 서로 다른 어휘다. 지도는 노드 어휘를 그대로 쓰되 `unmonitored`
// 만 `unknown`으로 접는다. 대응은 `ok`≙`healthy`, `down`≙`unavailable`.
//
// 집계 규칙은 결정론적 우선순위 하나뿐이다:
//
//   hold > down > stale > degraded > unknown > ok
//
// `unknown`이 `ok`보다 세다는 점이 이 화면의 핵심이다. 근거가 없는 칸은 초록이 아니라
// 회색이어야 한다(plan 08 "Missing evidence is `unknown`, not green"). 노드가 하나도
// 없거나 전부 `unmonitored`인 부품은 그래서 `unknown`으로 남는다.

import { describeTopologyReason } from "./topology-view.mjs";

export const FORGE_MAP_VIEW_SCHEMA = "soulforge.team_ops_board.forge_map_view.v0";

// 나쁜 쪽이 앞이다. 인덱스가 작을수록 강하다.
export const FORGE_STATE_PRIORITY = Object.freeze([
  "hold", "down", "stale", "degraded", "unknown", "ok",
]);

export const FORGE_STATE_LABELS = Object.freeze({
  hold: "보류",
  down: "끊김",
  stale: "낡음",
  degraded: "주의",
  unknown: "근거 없음",
  ok: "정상",
});

// Watchtower 노드 상태 -> 지도 상태. `unmonitored` 만 접는다.
const NODE_STATE_TO_FORGE_STATE = Object.freeze({
  ok: "ok",
  degraded: "degraded",
  stale: "stale",
  down: "down",
  unmonitored: "unknown",
});

// 매핑되지 않은 노드가 모이는 자리. 조용히 숨기지 않고 수를 드러낸다.
export const FORGE_OTHER_COMPONENT_ID = "other";

// 부품 상자. `nodes`가 빈 배열인 부품은 topology 대신 자기 스냅샷(evidence)에서
// 상태를 받거나(Tongs·Bellows·외부 작업 사이클), 아직 Vigil에 붙은 관측원이 아예
// 없다(Buzz·Rune). 후자는 회색으로 남는 것이 정답이다.
//
// band/col 은 SVG 배치 힌트다. band 0 = 사람의 물길, 1 = 자료의 물길, 2 = 받치는 것.
export const FORGE_COMPONENTS = Object.freeze([
  {
    id: "buzz",
    name: "Buzz",
    identifier: "buzz-server",
    meaning: "팀원이 봇에게 말 거는 문",
    evidence: "none",
    band: 0,
    col: 0,
    nodes: Object.freeze([]),
  },
  {
    id: "hermes",
    name: "Hermes 봇",
    identifier: "agent-runtime",
    meaning: "팀원 대신 집게를 잡는 손",
    evidence: "topology",
    band: 0,
    col: 1,
    nodes: Object.freeze(["src_agent_runtime"]),
  },
  {
    id: "tongs",
    name: "Tongs",
    identifier: "dev-erp-mcp",
    meaning: "뜨거운 것을 잡는 유일한 도구",
    evidence: "tongs",
    band: 0,
    col: 2,
    nodes: Object.freeze([]),
  },
  {
    id: "world_tree",
    name: "World Tree",
    identifier: "dev-erp",
    meaning: "할 일과 영수증이 걸리는 나무",
    evidence: "topology",
    band: 0,
    col: 3,
    nodes: Object.freeze(["consumer_timeline"]),
  },
  {
    id: "vigil",
    name: "Vigil",
    identifier: "team-ops-board",
    meaning: "밤을 지키는 야경 · 이 화면",
    evidence: "topology",
    band: 0,
    col: 4,
    nodes: Object.freeze(["consumer_board", "watchtower_self", "codex_retention_report"]),
  },
  {
    id: "tributary",
    name: "Tributary",
    identifier: "ingress",
    meaning: "Ore가 흘러드는 지류 · 원천과 수집기",
    evidence: "topology",
    band: 1,
    col: 0,
    nodes: Object.freeze([
      "src_hiworks", "src_plaud", "src_slack", "src_onedrive", "src_gmail", "src_linear", "src_buzz",
      "ingress_supervisor", "mail_forwarder", "slack_batch", "local_activity",
      "linear_collect", "buzz_collect", "voice_label_worker",
    ]),
  },
  {
    id: "heartwood",
    name: "Heartwood",
    identifier: "custody-store",
    meaning: "Ingot이 굳어 쌓이는 심재",
    evidence: "topology",
    band: 1,
    col: 1,
    nodes: Object.freeze([
      "store_mail_events", "store_voice_custody", "store_slack_custody",
      "store_activity_outbox", "store_usage_ledger",
      "store_linear_custody", "store_buzz_custody",
    ]),
  },
  {
    id: "reliquary",
    name: "Reliquary",
    identifier: "backup_controller",
    meaning: "남는 것 · N차 백업본",
    evidence: "topology",
    band: 1,
    col: 2,
    nodes: Object.freeze([
      "backup_buzz_server", "backup_agent_runtime", "store_backup_generations",
    ]),
  },
  {
    id: "hearth",
    name: "Hearth",
    identifier: "ai_usage_meter",
    meaning: "화덕 · 모델과 그 사용량계",
    evidence: "topology",
    band: 1,
    col: 3,
    nodes: Object.freeze([
      "src_codex", "src_claude", "src_antigravity",
      "usage_codex_collector", "usage_claude_collector", "usage_antigravity_collector",
      "usage_meter",
    ]),
  },
  {
    id: "bellows",
    name: "Bellows",
    identifier: "schtasks",
    meaning: "사람 없이 바람을 넣는 풀무",
    evidence: "scheduled_tasks",
    band: 2,
    col: 0,
    nodes: Object.freeze([]),
  },
  {
    id: "secure_work",
    name: "외부 작업 사이클",
    identifier: "secure_work",
    meaning: "경계 밖 작업 한 바퀴",
    evidence: "secure_work",
    band: 2,
    col: 1,
    nodes: Object.freeze([]),
  },
  {
    id: "rune",
    name: "Rune",
    identifier: "engineering_engine",
    meaning: "빠진 것을 읽기만 하는 판단",
    evidence: "none",
    band: 2,
    col: 2,
    nodes: Object.freeze([]),
  },
  {
    id: "quench",
    name: "Quench",
    identifier: "validate",
    meaning: "통과해야 단단해지는 담금질",
    evidence: "topology",
    band: 2,
    col: 3,
    nodes: Object.freeze(["gate_five_field", "store_workmeta"]),
  },
]);

export const FORGE_BAND_LABELS = Object.freeze([
  "사람의 물길",
  "자료의 물길",
  "받치는 것",
]);

// node id -> component id. 부품 정의에서 한 번만 파생하므로 두 곳이 어긋날 수 없다.
export const FORGE_NODE_COMPONENT_INDEX = Object.freeze(
  Object.fromEntries(
    FORGE_COMPONENTS.flatMap((component) => component.nodes.map((nodeId) => [nodeId, component.id])),
  ),
);

// SVG `text` 는 줄바꿈도 생략도 하지 않는다: 상자를 넘친 글자는 옆 상자를 그대로
// 침범한다. 폭을 글자 종류로 추정해(한글·한자 1em, 그 외 0.52em) 넘칠 문자열을
// 잘라 두는 것이 화면 쪽의 유일한 방어선이다. 추정이므로 여유를 두고 쓴다.
const WIDE_GLYPH_RE = /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

function glyphWidth(character, fontSize) {
  return (WIDE_GLYPH_RE.test(character) ? 1 : 0.52) * fontSize;
}

export function estimateForgeTextWidth(text, fontSize) {
  let width = 0;
  for (const character of String(text ?? "")) width += glyphWidth(character, fontSize);
  return width;
}

export function clampForgeText(text, maxWidth, fontSize) {
  const value = String(text ?? "");
  if (!(maxWidth > 0) || !(fontSize > 0)) return "";
  if (estimateForgeTextWidth(value, fontSize) <= maxWidth) return value;
  const ellipsisWidth = glyphWidth("\u2026", fontSize);
  let width = 0;
  let kept = "";
  for (const character of value) {
    const next = width + glyphWidth(character, fontSize);
    if (next + ellipsisWidth > maxWidth) break;
    width = next;
    kept += character;
  }
  return `${kept}\u2026`;
}

function frozenClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenClone));
  if (value !== null && typeof value === "object") {
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = frozenClone(value[key]);
    return Object.freeze(copy);
  }
  return value;
}

// 결정론적 집계: 알 수 없는 상태 문자열은 무시하지 않고 가장 강한 쪽(hold)으로 올린다.
// 새 상태가 생겼는데 화면이 조용히 초록을 유지하는 일이 없어야 한다.
export function aggregateForgeComponentState(states) {
  const list = Array.isArray(states) ? states : [];
  if (list.length === 0) return "unknown";
  let bestIndex = FORGE_STATE_PRIORITY.length;
  for (const state of list) {
    const index = FORGE_STATE_PRIORITY.indexOf(state);
    // -1 = 이 화면이 모르는 상태 -> 최악으로 취급한다.
    const rank = index === -1 ? -1 : index;
    if (rank < bestIndex) bestIndex = rank;
  }
  return bestIndex < 0 ? "hold" : FORGE_STATE_PRIORITY[bestIndex];
}

export function forgeStateFromNodeState(nodeState) {
  return NODE_STATE_TO_FORGE_STATE[nodeState] ?? "unknown";
}

// 사유 코드는 기존 사유 사전(topology-view)이 소유한다. 여기서 새 번역표를
// 만들지 않으며, 사전에 없는 코드는 원래 코드가 그대로 보인다.
function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .filter((reason) => typeof reason === "string" && reason.length > 0 && reason.length <= 128)
    .slice(0, 8)
    .map((reason) => describeTopologyReason(reason));
}

function readTopologySnapshot(topology) {
  // 두 모양을 모두 받는다: 어댑터 봉투({refresh_state, snapshot}) 또는 스냅샷 자체.
  const snapshot = topology && typeof topology === "object" && topology.snapshot !== undefined
    ? topology.snapshot
    : topology;
  if (snapshot === null || typeof snapshot !== "object" || !Array.isArray(snapshot.nodes)) return null;
  return snapshot;
}

function buildTopologyNodeRows(topology) {
  const snapshot = readTopologySnapshot(topology);
  if (snapshot === null) return { rows: [], observedAt: null, available: false };
  const seen = new Set();
  const rows = [];
  for (const node of snapshot.nodes) {
    if (node === null || typeof node !== "object") continue;
    const id = typeof node.id === "string" ? node.id : null;
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const nodeState = typeof node?.health?.state === "string" ? node.health.state : "unmonitored";
    rows.push(Object.freeze({
      id,
      label: typeof node.label === "string" ? node.label : id,
      group: typeof node.group === "string" ? node.group : "",
      nodeState,
      state: forgeStateFromNodeState(nodeState),
      reasons: Object.freeze(normalizeReasons(node?.health?.reasons)),
      componentId: FORGE_NODE_COMPONENT_INDEX[id] ?? FORGE_OTHER_COMPONENT_ID,
    }));
  }
  return {
    rows,
    observedAt: typeof snapshot.observed_at === "string" ? snapshot.observed_at : null,
    available: rows.length > 0,
  };
}

// ── 부품 전용 근거 판독기 ─────────────────────────────────────────────────
// 각 판독기는 { state, note, detail } 만 돌려준다. 경로·비밀·원문은 오지 않는다.

function readTongsEvidence(snapshot) {
  if (snapshot === null || typeof snapshot !== "object") {
    return { state: "unknown", note: "읽기 실패 · 근거 없음" };
  }
  if (snapshot.state === "unknown") {
    return { state: "unknown", note: "하트비트 없음 · 아직 안 켜짐" };
  }
  if (snapshot.state === "unavailable") {
    // 파일이 있는데 규격을 어겼다 — 없음(회색)과 다른 관측된 고장이다.
    return { state: "degraded", note: `하트비트 규격 위반 · ${safeCode(snapshot.reason)}` };
  }
  if (snapshot.state !== "ready") {
    return { state: "unknown", note: "상태 미확정" };
  }
  const status = typeof snapshot.status === "string" ? snapshot.status : "unknown";
  const listen = Number.isSafeInteger(snapshot.listen_port) ? `듣는 포트 ${snapshot.listen_port}` : "포트 미상";
  const staleNote = snapshot.fresh === false ? " · 하트비트 낡음" : "";
  if (status === "listening") {
    return {
      state: snapshot.fresh === false ? "stale" : "ok",
      note: `${listen}${staleNote}`,
    };
  }
  if (status === "starting") return { state: "degraded", note: `기동 중 · ${listen}${staleNote}` };
  if (status === "stopped") return { state: "down", note: `멈춤 · ${listen}${staleNote}` };
  return { state: "unknown", note: `상태 ${status}` };
}

function readSecureWorkEvidence(snapshot) {
  if (snapshot === null || typeof snapshot !== "object") {
    return { state: "unknown", note: "읽기 실패 · 근거 없음" };
  }
  if (snapshot.state === "unknown") {
    return { state: "unknown", note: "상태 파일 없음 · 한 바퀴 없음" };
  }
  if (snapshot.state === "unavailable") {
    return { state: "degraded", note: `상태 파일 규격 위반 · ${safeCode(snapshot.reason)}` };
  }
  if (snapshot.state !== "ready") {
    return { state: "unknown", note: "상태 미확정" };
  }
  const jobs = snapshot.jobs !== null && typeof snapshot.jobs === "object" ? snapshot.jobs : {};
  const entries = Object.entries(jobs).filter(([, count]) => Number.isSafeInteger(count) && count >= 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return { state: "unknown", note: "진행 중인 작업 없음" };
  const failed = entries
    .filter(([state]) => /FAIL|ERROR|BLOCK/u.test(state))
    .reduce((sum, [, count]) => sum + count, 0);
  const summary = entries.map(([state, count]) => `${state} ${count}`).join(" · ");
  return {
    state: failed > 0 ? "degraded" : "ok",
    note: summary,
  };
}

function readBellowsEvidence(snapshot) {
  if (snapshot === null || typeof snapshot !== "object") {
    return { state: "unknown", note: "읽기 실패 · 근거 없음" };
  }
  if (snapshot.state !== "ready" || !Array.isArray(snapshot.tasks)) {
    const reason = snapshot.state === "unavailable" ? safeCode(snapshot.reason) : "상태 미확정";
    return { state: "unknown", note: `작업 목록 없음 · ${reason}` };
  }
  const tasks = snapshot.tasks;
  if (tasks.length === 0) return { state: "unknown", note: "허용 이름의 작업이 없음" };
  const failing = tasks.filter((task) => task?.healthy === false).length;
  const running = tasks.filter((task) => task?.status === "Running").length;
  if (failing > 0) {
    return { state: "degraded", note: `작업 ${tasks.length} · 실패 ${failing} · 실행 ${running}` };
  }
  return { state: "ok", note: `작업 ${tasks.length} · 실행 ${running}` };
}

function safeCode(value) {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/u.test(value) ? value : "unknown";
}

const EVIDENCE_READERS = Object.freeze({
  tongs: readTongsEvidence,
  secure_work: readSecureWorkEvidence,
  scheduled_tasks: readBellowsEvidence,
});

const EVIDENCE_SOURCE_LABELS = Object.freeze({
  topology: "Vigil 관측 노드",
  tongs: "Tongs 하트비트",
  secure_work: "외부 작업 상태 파일",
  scheduled_tasks: "예약 작업 목록",
  none: "연결된 관측원 없음",
});

function countByState(rows) {
  const counts = {};
  for (const state of FORGE_STATE_PRIORITY) counts[state] = 0;
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return counts;
}

export function buildForgeMapViewModel({
  topology = null,
  tongs = null,
  secureWork = null,
  scheduledTasks = null,
} = {}) {
  const { rows, observedAt, available } = buildTopologyNodeRows(topology);
  const rowsByComponent = new Map();
  for (const row of rows) {
    const list = rowsByComponent.get(row.componentId) ?? [];
    list.push(row);
    rowsByComponent.set(row.componentId, list);
  }

  const evidenceSnapshots = { tongs, secure_work: secureWork, scheduled_tasks: scheduledTasks };

  const components = FORGE_COMPONENTS.map((component) => {
    const nodeRows = rowsByComponent.get(component.id) ?? [];
    const reader = EVIDENCE_READERS[component.evidence] ?? null;
    const evidence = reader === null
      ? { state: null, note: null }
      : reader(evidenceSnapshots[component.evidence] ?? null);
    const nodeStates = nodeRows.map((row) => row.state);
    const contributions = evidence.state === null ? nodeStates : [...nodeStates, evidence.state];
    const state = aggregateForgeComponentState(contributions);
    return {
      id: component.id,
      name: component.name,
      identifier: component.identifier,
      meaning: component.meaning,
      band: component.band,
      col: component.col,
      state,
      stateLabel: FORGE_STATE_LABELS[state],
      evidenceKind: component.evidence,
      evidenceSourceLabel: EVIDENCE_SOURCE_LABELS[component.evidence] ?? "미상",
      evidenceNote: evidence.note,
      declaredNodeCount: component.nodes.length,
      observedNodeCount: nodeRows.length,
      counts: countByState(nodeRows),
      nodes: nodeRows.map((row) => ({
        id: row.id,
        label: row.label,
        state: row.state,
        stateLabel: FORGE_STATE_LABELS[row.state],
        nodeState: row.nodeState,
        reasons: row.reasons,
      })),
    };
  });

  const otherRows = rowsByComponent.get(FORGE_OTHER_COMPONENT_ID) ?? [];
  const otherState = aggregateForgeComponentState(otherRows.map((row) => row.state));
  const other = {
    id: FORGE_OTHER_COMPONENT_ID,
    name: "기타",
    identifier: "unmapped",
    meaning: "아직 부품에 붙이지 않은 노드",
    band: 2,
    col: 4,
    state: otherState,
    stateLabel: FORGE_STATE_LABELS[otherState],
    evidenceKind: "topology",
    evidenceSourceLabel: EVIDENCE_SOURCE_LABELS.topology,
    evidenceNote: otherRows.length === 0 ? null : "부품 매핑을 갱신해야 함",
    declaredNodeCount: 0,
    observedNodeCount: otherRows.length,
    counts: countByState(otherRows),
    nodes: otherRows.map((row) => ({
      id: row.id,
      label: row.label,
      state: row.state,
      stateLabel: FORGE_STATE_LABELS[row.state],
      nodeState: row.nodeState,
      reasons: row.reasons,
    })),
  };

  // 고장·주의 목록: ok 도 unknown 도 아닌 노드만, 부품명을 붙여 최악부터.
  const attention = [...components, other]
    .flatMap((component) => component.nodes
      .filter((node) => node.state !== "ok" && node.state !== "unknown")
      .map((node) => ({ ...node, componentId: component.id, componentName: component.name })))
    .sort((a, b) => FORGE_STATE_PRIORITY.indexOf(a.state) - FORGE_STATE_PRIORITY.indexOf(b.state)
      || a.id.localeCompare(b.id));

  const summary = {
    componentTotal: components.length,
    byState: countByState(components),
    attentionCount: attention.length,
    observedNodeTotal: rows.length,
    unmappedNodeCount: otherRows.length,
    // 근거 없는 부품 수 — 이 화면이 아직 못 보는 곳의 크기다.
    unknownComponentCount: components.filter((component) => component.state === "unknown").length,
  };

  const refreshState = topology !== null && typeof topology === "object" && typeof topology.refresh_state === "string"
    ? topology.refresh_state
    : null;

  return frozenClone({
    schema: FORGE_MAP_VIEW_SCHEMA,
    available,
    observedAt,
    refreshState,
    bandLabels: FORGE_BAND_LABELS,
    components,
    other,
    attention,
    summary,
  });
}
