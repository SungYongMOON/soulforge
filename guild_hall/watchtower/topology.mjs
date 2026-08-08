// topology.mjs — Soulforge AX 시스템 토폴로지의 public-safe 정의.
// 노드/간선은 구조와 역할만 나타낸다. 실제 경로·작업명·임계값은 local binding이 소유한다.
// 간선은 health 전파나 실행 증거가 아니며, 각 노드의 health는 그 노드의 probe만 판정한다.

export const WATCHTOWER_TOPOLOGY_SCHEMA_VERSION = "soulforge.watchtower.topology.v1";

const NODE_KINDS = new Set(["external", "supervisor", "worker", "store", "gate", "consumer"]);
const OPERATION_MODES = new Set(["structural", "resident", "scheduled", "on_demand"]);
const PROVIDERS = new Set(["codex", "claude", "antigravity"]);
const HEALTH_SCOPES = new Set(["node", "provider", "collector", "aggregate", "self"]);
const EDGE_FLOWS = new Set(["data", "control"]);
const EDGE_SCOPES = new Set([
  "node_health_only",
  "usage_collector_health_only",
  "usage_contract_structure_only",
]);
const UNMONITORED_REASONS = new Set([
  "structural_only",
  "provider_evidence_absent",
  "collector_evidence_absent",
  "catalog_only_on_demand",
  "independent_evidence_absent",
]);
const SUPPORTED_KIND_FLOWS = new Set([
  "data:external>supervisor",
  "data:external>worker",
  "data:supervisor>store",
  "data:worker>worker",
  "data:worker>store",
  "data:worker>consumer",
  "data:store>worker",
  "data:store>consumer",
  "data:gate>store",
  "data:gate>consumer",
  "control:worker>gate",
  "control:supervisor>gate",
]);

function topologyFail(code, detail = "") {
  const error = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  error.code = code;
  throw error;
}

// kind: external(외부 소스) | supervisor(상주 감독) | worker(수집·처리 단위)
//       | store(상태/커스터디 저장) | gate(검증·판정 표면) | consumer(소비 표면)
// operation_mode: structural | resident | scheduled | on_demand
// health_scope: node | provider | collector | aggregate | self
// probe: binding.probes 의 키 — null 이면 unmonitored_reason으로 명시된 미감시 상태
// col/row: lane-per-row 레이아웃 힌트 — 같은 lane 은 같은 row 로 흘러 간선 교차를 줄인다.
export const TOPOLOGY_NODES = Object.freeze([
  // 외부 입력 소스
  { id: "src_hiworks", label: "Hiworks 메일", kind: "external", group: "외부 소스", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 0, row: 0 },
  { id: "src_plaud", label: "PLAUD 음성", kind: "external", group: "외부 소스", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 0, row: 1.8 },
  { id: "src_slack", label: "Slack API", kind: "external", group: "외부 소스", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 0, row: 2.7 },
  { id: "src_onedrive", label: "OneDrive worksite", kind: "external", group: "외부 소스", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 0, row: 3.6 },
  { id: "src_codex", label: "Codex session JSONL", kind: "external", group: "AI 공급자 소스", probe: null, operation_mode: "structural", provider: "codex", health_scope: "provider", unmonitored_reason: "provider_evidence_absent", col: 0, row: 4.5 },
  { id: "src_claude", label: "Claude Code session JSONL", kind: "external", group: "AI 공급자 소스", probe: null, operation_mode: "structural", provider: "claude", health_scope: "provider", unmonitored_reason: "provider_evidence_absent", col: 0, row: 5.4 },
  { id: "src_antigravity", label: "Antigravity conversation DB", kind: "external", group: "AI 공급자 소스", probe: null, operation_mode: "structural", provider: "antigravity", health_scope: "provider", unmonitored_reason: "provider_evidence_absent", col: 0, row: 6.3 },

  // 상주 감독·주기 워커 (schtasks)
  {
    id: "ingress_supervisor",
    label: "Five-Lane Ingress 감독",
    kind: "supervisor",
    group: "수집",
    probe: "ingress_supervisor",
    operation_mode: "resident",
    health_scope: "node",
    unmonitored_reason: "collector_evidence_absent",
    col: 1, row: 0,
  },
  { id: "mail_forwarder", label: "Hiworks→Gmail 수입기", kind: "worker", group: "수집", probe: "mail_forwarder", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "collector_evidence_absent", col: 1, row: 0.9 },
  { id: "slack_batch", label: "Slack 배치 수집기", kind: "worker", group: "수집", probe: "slack_batch", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "collector_evidence_absent", col: 1, row: 2.7 },
  { id: "local_activity", label: "파일·로컬활동 수집기", kind: "worker", group: "수집", probe: "local_activity", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "collector_evidence_absent", col: 1, row: 3.6 },

  // provider별 실제 on-demand producer. provider source의 health와 collector health는 서로 대체하지 않는다.
  { id: "usage_codex_collector", label: "Codex on-demand collector", kind: "worker", group: "AI 사용량 수집", probe: "usage_meter", operation_mode: "on_demand", provider: "codex", health_scope: "collector", unmonitored_reason: "collector_evidence_absent", col: 1, row: 4.5 },
  { id: "usage_claude_collector", label: "Claude on-demand collector/adapter", kind: "worker", group: "AI 사용량 수집", probe: null, operation_mode: "on_demand", provider: "claude", health_scope: "collector", unmonitored_reason: "catalog_only_on_demand", col: 1, row: 5.4 },
  { id: "usage_antigravity_collector", label: "Antigravity on-demand collector/adapter", kind: "worker", group: "AI 사용량 수집", probe: null, operation_mode: "on_demand", provider: "antigravity", health_scope: "collector", unmonitored_reason: "catalog_only_on_demand", col: 1, row: 6.3 },

  // 저장·검증 평면
  { id: "store_mail_events", label: "메일 event 원장", kind: "store", group: "데이터 평면", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 2, row: 0 },
  { id: "store_voice_custody", label: "음성 custody", kind: "store", group: "데이터 평면", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 2, row: 1.8 },
  { id: "store_slack_custody", label: "Slack custody", kind: "store", group: "데이터 평면", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 2, row: 2.7 },
  { id: "gate_five_field", label: "five-field 원장 검증", kind: "gate", group: "게이트", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 2, row: 3.5 },
  { id: "usage_meter", label: "공통 AI Usage Meter", kind: "worker", group: "관측", probe: null, operation_mode: "on_demand", health_scope: "aggregate", unmonitored_reason: "independent_evidence_absent", col: 2, row: 5.4 },
  { id: "store_workmeta", label: "_workmeta 시간장부", kind: "store", group: "데이터 평면", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 2, row: 7.2 },

  // 후처리·외부 목적지·공유 원장·검사 판정
  { id: "src_gmail", label: "Gmail API", kind: "consumer", group: "후처리", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 3, row: 0.9 },
  { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "worker", group: "후처리", probe: "voice_label_worker", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "collector_evidence_absent", col: 3, row: 1.8 },
  { id: "store_activity_outbox", label: "파일·활동 delta outbox", kind: "store", group: "후처리", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 3, row: 4.2 },
  { id: "store_usage_ledger", label: "공유 AI usage-event 원장", kind: "store", group: "데이터 평면", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 3, row: 5.4 },
  { id: "watchtower_self", label: "Watchtower 검사·판정", kind: "gate", group: "관측", probe: null, operation_mode: "structural", health_scope: "self", unmonitored_reason: "independent_evidence_absent", col: 3, row: 7.2 },

  // 소비 표면
  { id: "consumer_timeline", label: "프로젝트 시간장부 shadow", kind: "consumer", group: "소비", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 4, row: 1.4 },
  { id: "consumer_board", label: "Workspace Board", kind: "consumer", group: "소비", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 4, row: 5.4 },
]);

// flow: data(실선 — 실제 데이터 계약) | control(점선 — 검사·검증·제어 관계)
// 모든 간선은 정적 구조이며 실행·freshness·health를 전달하지 않는다.
export const TOPOLOGY_EDGES = Object.freeze([
  { from: "src_hiworks", to: "ingress_supervisor", label: "POP3 수집", flow: "data" },
  { from: "src_hiworks", to: "mail_forwarder", label: "원본 bytes", flow: "data" },
  { from: "mail_forwarder", to: "src_gmail", label: "import", flow: "data" },
  { from: "ingress_supervisor", to: "store_mail_events", label: "event append", flow: "data" },
  { from: "src_plaud", to: "ingress_supervisor", label: "세션 intake", flow: "data" },
  { from: "ingress_supervisor", to: "store_voice_custody", label: "custody", flow: "data" },
  { from: "store_voice_custody", to: "voice_label_worker", label: "ASR·라벨", flow: "data" },
  { from: "src_slack", to: "slack_batch", label: "일 2회 pull", flow: "data" },
  { from: "slack_batch", to: "store_slack_custody", label: "revision append", flow: "data" },
  { from: "src_onedrive", to: "local_activity", label: "파일 관찰", flow: "data" },
  { from: "local_activity", to: "gate_five_field", label: "원장 검증", flow: "control" },
  { from: "gate_five_field", to: "store_activity_outbox", label: "delta append", flow: "data" },

  { from: "src_codex", to: "usage_codex_collector", label: "on-demand read", flow: "data" },
  { from: "src_claude", to: "usage_claude_collector", label: "on-demand read", flow: "data" },
  { from: "src_antigravity", to: "usage_antigravity_collector", label: "on-demand read", flow: "data" },
  { from: "usage_codex_collector", to: "usage_meter", label: "usage event", flow: "data" },
  { from: "usage_claude_collector", to: "usage_meter", label: "usage event", flow: "data" },
  { from: "usage_antigravity_collector", to: "usage_meter", label: "usage event", flow: "data" },
  { from: "usage_meter", to: "store_usage_ledger", label: "validated append", flow: "data" },

  { from: "store_mail_events", to: "consumer_timeline", label: "shadow 투영", flow: "data" },
  { from: "voice_label_worker", to: "consumer_timeline", label: "발생 라벨", flow: "data" },
  { from: "store_activity_outbox", to: "consumer_timeline", label: "proxy", flow: "data" },
  { from: "store_workmeta", to: "consumer_board", label: "조직 overlay", flow: "data" },
  { from: "store_usage_ledger", to: "consumer_board", label: "read-only usage snapshot", flow: "data" },

  { from: "ingress_supervisor", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only" },
  { from: "voice_label_worker", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only" },
  { from: "slack_batch", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only" },
  { from: "local_activity", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only" },
  { from: "mail_forwarder", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only" },
  { from: "usage_codex_collector", to: "watchtower_self", label: "Codex collector health 관찰", flow: "control", scope: "usage_collector_health_only" },
  { from: "usage_meter", to: "watchtower_self", label: "usage contract 구조 관찰", flow: "control", scope: "usage_contract_structure_only" },
  { from: "watchtower_self", to: "consumer_board", label: "판정 스냅샷", flow: "data" },
]);

export function validateTopologyDefinition({ nodes = TOPOLOGY_NODES, edges = TOPOLOGY_EDGES } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) topologyFail("topology_nodes_invalid");
  if (!Array.isArray(edges) || edges.length === 0) topologyFail("topology_edges_invalid");

  const nodesById = new Map();
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) topologyFail("topology_node_invalid");
    if (typeof node.id !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(node.id)) topologyFail("topology_node_id_invalid");
    if (nodesById.has(node.id)) topologyFail("topology_node_duplicate", node.id);
    if (typeof node.label !== "string" || node.label.length === 0 || typeof node.group !== "string" || node.group.length === 0) {
      topologyFail("topology_node_label_invalid", node.id);
    }
    if (!NODE_KINDS.has(node.kind)) topologyFail("topology_node_kind_invalid", node.id);
    if (!OPERATION_MODES.has(node.operation_mode)) topologyFail("topology_operation_mode_invalid", node.id);
    if (!HEALTH_SCOPES.has(node.health_scope)) topologyFail("topology_health_scope_invalid", node.id);
    if (!UNMONITORED_REASONS.has(node.unmonitored_reason)) topologyFail("topology_unmonitored_reason_invalid", node.id);
    if (node.probe !== null && (typeof node.probe !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(node.probe))) {
      topologyFail("topology_probe_invalid", node.id);
    }
    if (!Number.isFinite(node.col) || !Number.isFinite(node.row)) topologyFail("topology_position_invalid", node.id);
    if (node.provider !== undefined && !PROVIDERS.has(node.provider)) topologyFail("topology_provider_invalid", node.id);
    if (["provider", "collector"].includes(node.health_scope) && !PROVIDERS.has(node.provider)) {
      topologyFail("topology_provider_scope_invalid", node.id);
    }
    if (node.health_scope === "provider" && (node.kind !== "external" || node.probe !== null)) {
      topologyFail("topology_provider_evidence_invalid", node.id);
    }
    if (node.health_scope === "collector" && (node.kind !== "worker" || node.operation_mode !== "on_demand")) {
      topologyFail("topology_collector_scope_invalid", node.id);
    }
    if (node.health_scope === "aggregate" && (node.provider !== undefined || node.probe !== null || node.operation_mode !== "on_demand")) {
      topologyFail("topology_aggregate_scope_invalid", node.id);
    }
    if (node.health_scope === "self" && (node.id !== "watchtower_self" || node.probe !== null)) {
      topologyFail("topology_self_scope_invalid", node.id);
    }
    nodesById.set(node.id, node);
  }

  const edgeKeys = new Set();
  for (const edge of edges) {
    if (edge === null || typeof edge !== "object" || Array.isArray(edge)) topologyFail("topology_edge_invalid");
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) topologyFail("topology_edge_dangling", `${edge.from}>${edge.to}`);
    if (!EDGE_FLOWS.has(edge.flow)) topologyFail("topology_edge_flow_invalid", `${edge.from}>${edge.to}`);
    if (typeof edge.label !== "string" || edge.label.length === 0) topologyFail("topology_edge_label_invalid", `${edge.from}>${edge.to}`);
    const key = `${edge.from}>${edge.to}:${edge.flow}`;
    if (edgeKeys.has(key)) topologyFail("topology_edge_duplicate", key);
    edgeKeys.add(key);
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (from.col > to.col) topologyFail("topology_edge_backward", `${edge.from}>${edge.to}`);
    if (!SUPPORTED_KIND_FLOWS.has(`${edge.flow}:${from.kind}>${to.kind}`)) {
      topologyFail("topology_kind_flow_unsupported", `${edge.from}>${edge.to}`);
    }
    if (edge.scope !== undefined) {
      if (!EDGE_SCOPES.has(edge.scope) || edge.flow !== "control" || edge.to !== "watchtower_self") {
        topologyFail("topology_edge_scope_invalid", `${edge.from}>${edge.to}`);
      }
      if (edge.scope === "node_health_only" && from.health_scope !== "node") {
        topologyFail("topology_edge_scope_subject_invalid", `${edge.from}>${edge.to}`);
      }
      if (edge.scope === "usage_collector_health_only"
        && (from.health_scope !== "collector" || from.probe === null)) {
        topologyFail("topology_edge_scope_subject_invalid", `${edge.from}>${edge.to}`);
      }
      if (edge.scope === "usage_contract_structure_only"
        && (from.id !== "usage_meter" || from.health_scope !== "aggregate" || from.probe !== null)) {
        topologyFail("topology_edge_scope_subject_invalid", `${edge.from}>${edge.to}`);
      }
    }
    if (edge.flow === "control" && edge.to === "watchtower_self" && edge.scope === undefined) {
      topologyFail("topology_edge_scope_missing", `${edge.from}>${edge.to}`);
    }
    if (Object.hasOwn(edge, "health") || Object.hasOwn(edge, "state")) {
      topologyFail("topology_edge_runtime_state_forbidden", `${edge.from}>${edge.to}`);
    }
  }
  return { nodes, edges };
}

export function topologySkeleton() {
  validateTopologyDefinition();
  return {
    schema_version: WATCHTOWER_TOPOLOGY_SCHEMA_VERSION,
    nodes: TOPOLOGY_NODES.map((node) => ({ ...node })),
    edges: TOPOLOGY_EDGES.map((edge) => ({ ...edge })),
  };
}
