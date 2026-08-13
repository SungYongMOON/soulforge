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
  "usage_meter_health_only",
  "usage_contract_structure_only",
]);
const UNMONITORED_REASONS = new Set([
  "structural_only",
  "provider_evidence_absent",
  "collector_evidence_absent",
  "catalog_only_on_demand",
  "independent_evidence_absent",
]);
// 간선이 전달 영수증을 갖지 못하는 사유. 노드의 unmonitored_reason 과 같은 역할이며,
// 근거 없음을 값의 부재로 두지 않고 명시한다. 사유를 못 대는 간선은 정의가 거부된다.
const UNRECEIPTED_REASONS = new Set([
  "receipt_channel_absent",   // 전달 영수증 메커니즘이 아직 없다
  "probe_observation_only",   // 근거는 대상 노드의 probe 결과이며 별도 전달 영수증이 아니다
  "structural_only",          // 구조 관계이며 판정 가능한 전달이 일어나지 않는다
]);
export const EDGE_DELIVERY_STATES = Object.freeze([
  "delivering", "late", "stale", "failed", "registered_no_delivery", "unreceipted",
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
  { id: "usage_codex_collector", label: "Codex scheduled collector", kind: "worker", group: "AI 사용량 수집", probe: "usage_codex_collector", operation_mode: "scheduled", provider: "codex", health_scope: "collector", unmonitored_reason: "collector_evidence_absent", col: 1, row: 4.5 },
  { id: "usage_claude_collector", label: "Claude scheduled collector/adapter", kind: "worker", group: "AI 사용량 수집", probe: "usage_claude_collector", operation_mode: "scheduled", provider: "claude", health_scope: "collector", unmonitored_reason: "collector_evidence_absent", col: 1, row: 5.4 },
  { id: "usage_antigravity_collector", label: "Antigravity on-demand collector/adapter", kind: "worker", group: "AI 사용량 수집", probe: null, operation_mode: "on_demand", provider: "antigravity", health_scope: "collector", unmonitored_reason: "catalog_only_on_demand", col: 1, row: 6.3 },

  // 저장·검증 평면
  { id: "store_mail_events", label: "메일 event 원장", kind: "store", group: "데이터 평면", probe: "store_mail_events", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 2, row: 0 },
  { id: "store_voice_custody", label: "음성 custody", kind: "store", group: "데이터 평면", probe: "store_voice_custody", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 2, row: 1.8 },
  { id: "store_slack_custody", label: "Slack custody", kind: "store", group: "데이터 평면", probe: "store_slack_custody", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 2, row: 2.7 },
  { id: "gate_five_field", label: "five-field 원장 검증", kind: "gate", group: "게이트", probe: "gate_five_field", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 2, row: 3.5 },
  { id: "usage_meter", label: "공통 AI Usage Meter", kind: "worker", group: "관측", probe: "usage_meter", operation_mode: "on_demand", health_scope: "aggregate", unmonitored_reason: "independent_evidence_absent", col: 2, row: 5.4 },
  { id: "store_workmeta", label: "_workmeta 시간장부", kind: "store", group: "데이터 평면", probe: "store_workmeta", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 2, row: 7.2 },

  // 후처리·외부 목적지·공유 원장·검사 판정
  { id: "src_gmail", label: "Gmail API", kind: "consumer", group: "후처리", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 3, row: 0.9 },
  { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "worker", group: "후처리", probe: "voice_label_worker", operation_mode: "scheduled", health_scope: "node", unmonitored_reason: "collector_evidence_absent", col: 3, row: 1.8 },
  { id: "store_activity_outbox", label: "파일·활동 delta outbox", kind: "store", group: "후처리", probe: "store_activity_outbox", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 3, row: 4.2 },
  { id: "store_usage_ledger", label: "공유 AI usage-event 원장", kind: "store", group: "데이터 평면", probe: "store_usage_ledger", operation_mode: "structural", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 3, row: 5.4 },
  { id: "watchtower_self", label: "Watchtower 검사·판정", kind: "gate", group: "관측", probe: "watchtower_self", operation_mode: "scheduled", health_scope: "self", unmonitored_reason: "independent_evidence_absent", col: 3, row: 7.2 },

  // 소비 표면
  { id: "consumer_timeline", label: "프로젝트 시간장부 shadow", kind: "consumer", group: "소비", probe: null, operation_mode: "structural", health_scope: "node", unmonitored_reason: "structural_only", col: 4, row: 1.4 },
  { id: "consumer_board", label: "Workspace Board", kind: "consumer", group: "소비", probe: "consumer_board", operation_mode: "resident", health_scope: "node", unmonitored_reason: "independent_evidence_absent", col: 4, row: 5.4 },
]);

// flow: data(실선 — 실제 데이터 계약) | control(점선 — 검사·검증·제어 관계)
// 모든 간선은 정적 구조이며 실행·freshness·health를 전달하지 않는다.
// receipt: binding.receipts 의 키 — null 이면 unreceipted_reason 으로 명시된 무근거 상태.
//
// 간선이 그려졌다는 사실은 전달의 증거가 아니다. 노드 probe 가 살아 있다는 것은 그 노드가
// 살아 있다는 뜻이고, 그 노드에서 나가는 선이 실제로 데이터를 옮겼다는 뜻이 아니다. 두 주장은
// 다르므로 별개 필드로 나눈다. 현재 전달 영수증 채널은 아직 구축되지 않았으므로 모든 간선이
// receipt: null 이며, 화면은 이를 초록이 아니라 무근거로 표시해야 한다.
export const TOPOLOGY_EDGES = Object.freeze([
  { from: "src_hiworks", to: "ingress_supervisor", label: "POP3 수집", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_hiworks", to: "mail_forwarder", label: "원본 bytes", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "mail_forwarder", to: "src_gmail", label: "import", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "ingress_supervisor", to: "store_mail_events", label: "event append", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_plaud", to: "ingress_supervisor", label: "세션 intake", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "ingress_supervisor", to: "store_voice_custody", label: "custody", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "store_voice_custody", to: "voice_label_worker", label: "ASR·라벨", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_slack", to: "slack_batch", label: "일 2회 pull", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "slack_batch", to: "store_slack_custody", label: "revision append", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_onedrive", to: "local_activity", label: "파일 관찰", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "local_activity", to: "gate_five_field", label: "원장 검증", flow: "control", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "gate_five_field", to: "store_activity_outbox", label: "delta append", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },

  { from: "src_codex", to: "usage_codex_collector", label: "on-demand read", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_claude", to: "usage_claude_collector", label: "on-demand read", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "src_antigravity", to: "usage_antigravity_collector", label: "on-demand read", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "usage_codex_collector", to: "usage_meter", label: "usage event", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "usage_claude_collector", to: "usage_meter", label: "usage event", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "usage_antigravity_collector", to: "usage_meter", label: "usage event", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "usage_meter", to: "store_usage_ledger", label: "validated append", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },

  { from: "store_mail_events", to: "consumer_timeline", label: "shadow 투영", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "voice_label_worker", to: "consumer_timeline", label: "발생 라벨", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "store_activity_outbox", to: "consumer_timeline", label: "proxy", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "store_workmeta", to: "consumer_board", label: "조직 overlay", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
  { from: "store_usage_ledger", to: "consumer_board", label: "read-only usage snapshot", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },

  { from: "ingress_supervisor", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "voice_label_worker", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "slack_batch", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "local_activity", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "mail_forwarder", to: "watchtower_self", label: "상태 관찰", flow: "control", scope: "node_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "usage_codex_collector", to: "watchtower_self", label: "Codex collector health 관찰", flow: "control", scope: "usage_collector_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "usage_claude_collector", to: "watchtower_self", label: "Claude collector health 관찰", flow: "control", scope: "usage_collector_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "usage_meter", to: "watchtower_self", label: "usage ledger validation health 관찰", flow: "control", scope: "usage_meter_health_only", receipt: null, unreceipted_reason: "probe_observation_only" },
  { from: "watchtower_self", to: "consumer_board", label: "판정 스냅샷", flow: "data", receipt: null, unreceipted_reason: "receipt_channel_absent" },
]);

/**
 * 간선 하나의 전달 상태를 판정한다.
 *
 * 노드 probe 와 같은 period+grace 2단 윈도를 쓴다. 영수증에 윈도를 적용하지 않으면 3주 전
 * 성공이 오늘 선을 초록으로 칠하고, "한 번 성공하면 영원히 초록"이 된다.
 *
 * 인접 노드의 health 를 근거로 삼지 않는다. 인자로 노드 상태를 받지 않는 것이 그 규칙을
 * 강제하는 방법이다 — 참조할 수 없으면 베낄 수 없다.
 */
export function edgeDeliveryVerdict(edge, { receipts = {}, windows = {}, now = Date.now() } = {}) {
  if (edge === null || typeof edge !== "object") topologyFail("edge_delivery_edge_invalid");
  if (edge.receipt === null || edge.receipt === undefined) {
    return {
      state: "unreceipted",
      reason: edge.unreceipted_reason ?? "receipt_channel_absent",
      // 화면이 이것을 전달 확인으로 오독하지 못하게 명시한다.
      proves_delivery: false,
    };
  }
  const window = windows[edge.receipt];
  if (window === undefined) topologyFail("edge_delivery_window_absent", edge.receipt);
  for (const field of ["period_seconds", "grace_seconds"]) {
    if (!Number.isInteger(window[field]) || window[field] < 0) topologyFail("edge_delivery_window_invalid", `${edge.receipt}.${field}`);
  }
  if (window.period_seconds === 0) topologyFail("edge_delivery_window_invalid", `${edge.receipt}.period_seconds`);

  const receipt = receipts[edge.receipt];
  if (receipt === undefined || receipt === null) {
    // 채널은 등록됐지만 아직 한 번도 전달되지 않았다. 미등록과 구별되는 상태다.
    return { state: "registered_no_delivery", reason: "no_receipt_observed", proves_delivery: false };
  }
  if (receipt.outcome === "failed") {
    return { state: "failed", reason: receipt.failure_code ?? "delivery_failed", proves_delivery: false };
  }
  if (receipt.outcome !== "delivered") topologyFail("edge_delivery_outcome_invalid", edge.receipt);
  if (!Number.isFinite(receipt.observed_at_ms)) topologyFail("edge_delivery_timestamp_invalid", edge.receipt);

  const ageSeconds = Math.max(0, Math.floor((now - receipt.observed_at_ms) / 1000));
  if (ageSeconds <= window.period_seconds) {
    return { state: "delivering", age_seconds: ageSeconds, proves_delivery: true };
  }
  if (ageSeconds <= window.period_seconds + window.grace_seconds) {
    return { state: "late", age_seconds: ageSeconds, proves_delivery: true, note: "grace_window" };
  }
  // 윈도를 벗어난 영수증은 과거의 전달만 증명한다. 현재 전달을 증명하지 않는다.
  return { state: "stale", age_seconds: ageSeconds, proves_delivery: false, reason: "receipt_outside_window" };
}

/** 정의된 간선 전체의 전달 상태 집계. 근거 있는 것과 없는 것을 섞지 않는다. */
export function summariseEdgeDelivery(edges = TOPOLOGY_EDGES, options = {}) {
  const counts = Object.fromEntries(EDGE_DELIVERY_STATES.map((s) => [s, 0]));
  for (const edge of edges) counts[edgeDeliveryVerdict(edge, options).state] += 1;
  const proven = counts.delivering + counts.late;
  return {
    counts,
    total: edges.length,
    delivery_proven: proven,
    delivery_unproven: edges.length - proven,
    // 화면 문구가 이 값에서 나와야 한다. 32개를 다 그려놓고 전달을 주장하는 것이 원래 문제였다.
    claim: proven === 0
      ? "표시된 간선 중 현재 전달이 증명된 것은 없습니다"
      : `${proven}/${edges.length} 간선에 윈도 내 전달 영수증이 있습니다`,
  };
}

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
    if (node.health_scope === "collector" && (node.kind !== "worker" || !["on_demand", "scheduled"].includes(node.operation_mode))) {
      topologyFail("topology_collector_scope_invalid", node.id);
    }
    if (node.health_scope === "aggregate" && (node.provider !== undefined || !["on_demand", "scheduled"].includes(node.operation_mode))) {
      topologyFail("topology_aggregate_scope_invalid", node.id);
    }
    if (node.health_scope === "self" && node.id !== "watchtower_self") {
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
      if (edge.scope === "usage_meter_health_only"
        && (from.id !== "usage_meter" || from.health_scope !== "aggregate" || from.probe === null)) {
        topologyFail("topology_edge_scope_subject_invalid", `${edge.from}>${edge.to}`);
      }
    }
    if (edge.flow === "control" && edge.to === "watchtower_self" && edge.scope === undefined) {
      topologyFail("topology_edge_scope_missing", `${edge.from}>${edge.to}`);
    }
    if (Object.hasOwn(edge, "health") || Object.hasOwn(edge, "state")) {
      topologyFail("topology_edge_runtime_state_forbidden", `${edge.from}>${edge.to}`);
    }

    // 전달 근거는 구조 검증을 통과한 간선에만 묻는다. 순서를 뒤집으면 dangling 이나 kind 오류가
    // "영수증 없음"으로 보고되어 더 근본적인 문제를 가린다.
    //
    // 무근거를 값의 부재로 두지 않는다. 노드가 unmonitored_reason 을 대야 하는 것과 같은 이유로,
    // 근거 없는 간선도 사유를 대야 한다. 그러지 않으면 그려졌다는 사실만으로 전달이 있었던
    // 것처럼 보인다.
    if (!Object.hasOwn(edge, "receipt")) topologyFail("topology_edge_receipt_absent", `${edge.from}>${edge.to}`);
    if (edge.receipt !== null && (typeof edge.receipt !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(edge.receipt))) {
      topologyFail("topology_edge_receipt_invalid", `${edge.from}>${edge.to}`);
    }
    if (edge.receipt === null) {
      if (!UNRECEIPTED_REASONS.has(edge.unreceipted_reason)) {
        topologyFail("topology_edge_unreceipted_reason_invalid", `${edge.from}>${edge.to}`);
      }
      // probe 결과를 근거로 내세우려면 그 노드에 실제 probe 가 있어야 한다.
      if (edge.unreceipted_reason === "probe_observation_only" && from.probe === null) {
        topologyFail("topology_edge_probe_observation_unsupported", `${edge.from}>${edge.to}`);
      }
    } else if (edge.unreceipted_reason !== undefined) {
      topologyFail("topology_edge_receipt_reason_conflict", `${edge.from}>${edge.to}`);
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
