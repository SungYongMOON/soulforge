// topology.mjs — Soulforge AX 시스템 토폴로지의 public-safe 정의.
// 노드/간선은 역할 식별자만 담는다. 실제 경로·작업명·임계값은 local binding이 소유한다.

export const WATCHTOWER_TOPOLOGY_SCHEMA_VERSION = "soulforge.watchtower.topology.v1";

// kind: external(외부 소스) | supervisor(상주 감독) | worker(주기 워커) | store(상태/커스터디 저장)
//       | gate(검증 게이트) | consumer(소비 표면)
// probe: binding.probes 의 키 — null 이면 감시 대상 아님(unmonitored)
// col/row: lane-per-row 레이아웃 힌트 — 같은 lane 은 같은 row 로 흘러 간선 교차를 줄인다.
export const TOPOLOGY_NODES = Object.freeze([
  // 외부 입력 소스
  { id: "src_hiworks", label: "Hiworks 메일", kind: "external", group: "외부 소스", probe: null, col: 0, row: 0 },
  { id: "src_plaud", label: "PLAUD 음성", kind: "external", group: "외부 소스", probe: null, col: 0, row: 1.8 },
  { id: "src_slack", label: "Slack API", kind: "external", group: "외부 소스", probe: null, col: 0, row: 2.7 },
  { id: "src_onedrive", label: "OneDrive worksite", kind: "external", group: "외부 소스", probe: null, col: 0, row: 3.6 },
  { id: "src_codex", label: "Codex 세션", kind: "external", group: "외부 소스", probe: null, col: 0, row: 4.5 },

  // 상주 감독·주기 워커 (schtasks)
  {
    id: "ingress_supervisor",
    label: "Five-Lane Ingress 감독",
    kind: "supervisor",
    group: "수집",
    probe: "ingress_supervisor",
    col: 1, row: 0,
  },
  { id: "mail_forwarder", label: "Hiworks→Gmail 수입기", kind: "worker", group: "수집", probe: "mail_forwarder", col: 1, row: 0.9 },
  { id: "slack_batch", label: "Slack 배치 수집기", kind: "worker", group: "수집", probe: "slack_batch", col: 1, row: 2.7 },
  { id: "local_activity", label: "파일·로컬활동 수집기", kind: "worker", group: "수집", probe: "local_activity", col: 1, row: 3.6 },
  { id: "usage_meter", label: "AI 사용량 미터", kind: "worker", group: "관측", probe: "usage_meter", col: 1, row: 4.5 },

  // 저장 평면
  { id: "store_mail_events", label: "메일 event 원장", kind: "store", group: "데이터 평면", probe: null, col: 2, row: 0 },
  { id: "store_voice_custody", label: "음성 custody", kind: "store", group: "데이터 평면", probe: null, col: 2, row: 1.8 },
  { id: "store_slack_custody", label: "Slack custody", kind: "store", group: "데이터 평면", probe: null, col: 2, row: 2.7 },
  { id: "gate_five_field", label: "five-field 원장 검증", kind: "gate", group: "게이트", probe: null, col: 2, row: 3.5 },
  { id: "store_usage_ledger", label: "사용량 원장", kind: "store", group: "데이터 평면", probe: null, col: 2, row: 4.9 },
  { id: "store_workmeta", label: "_workmeta 시간장부", kind: "store", group: "데이터 평면", probe: null, col: 2, row: 5.7 },

  // 후처리·외부 목적지·검사 판정
  { id: "src_gmail", label: "Gmail API", kind: "consumer", group: "후처리", probe: null, col: 3, row: 0.9 },
  { id: "voice_label_worker", label: "음성 ASR·라벨 워커", kind: "worker", group: "후처리", probe: "voice_label_worker", col: 3, row: 1.8 },
  { id: "store_activity_outbox", label: "파일·활동 delta outbox", kind: "store", group: "후처리", probe: null, col: 3, row: 4.2 },
  { id: "watchtower_self", label: "Watchtower 검사·판정", kind: "supervisor", group: "관측", probe: "watchtower_self", col: 3, row: 6.4 },

  // 소비 표면
  { id: "consumer_timeline", label: "프로젝트 시간장부 shadow", kind: "consumer", group: "소비", probe: null, col: 4, row: 1.4 },
  { id: "consumer_board", label: "Workspace Board", kind: "consumer", group: "소비", probe: null, col: 4, row: 4.5 },
]);

// flow: data(실선 — 실제 데이터 이동) | control(점선 — 검사·검증·제어 신호)
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
  { from: "src_codex", to: "usage_meter", label: "lifecycle hook", flow: "control" },
  { from: "usage_meter", to: "store_usage_ledger", label: "turn 귀속", flow: "data" },
  { from: "store_mail_events", to: "consumer_timeline", label: "shadow 투영", flow: "data" },
  { from: "voice_label_worker", to: "consumer_timeline", label: "발생 라벨", flow: "data" },
  { from: "store_activity_outbox", to: "consumer_timeline", label: "proxy", flow: "data" },
  { from: "store_workmeta", to: "consumer_board", label: "조직 overlay", flow: "data" },
  { from: "store_usage_ledger", to: "consumer_board", label: "usage 패널", flow: "data" },
  { from: "ingress_supervisor", to: "watchtower_self", label: "상태 신호", flow: "control" },
  { from: "voice_label_worker", to: "watchtower_self", label: "상태 신호", flow: "control" },
  { from: "slack_batch", to: "watchtower_self", label: "상태 신호", flow: "control" },
  { from: "local_activity", to: "watchtower_self", label: "상태 신호", flow: "control" },
  { from: "mail_forwarder", to: "watchtower_self", label: "상태 신호", flow: "control" },
  { from: "watchtower_self", to: "consumer_board", label: "판정 스냅샷", flow: "data" },
]);

export function topologySkeleton() {
  return {
    schema_version: WATCHTOWER_TOPOLOGY_SCHEMA_VERSION,
    nodes: TOPOLOGY_NODES.map((node) => ({ ...node })),
    edges: TOPOLOGY_EDGES.map((edge) => ({ ...edge })),
  };
}
