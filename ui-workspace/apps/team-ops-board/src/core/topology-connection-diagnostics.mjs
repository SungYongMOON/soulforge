// topology-connection-diagnostics.mjs — 비정상·미감시 노드에 대한 읽기 전용 연결 진단
// 투영. 이미 받아 둔 strict-safe 스냅샷(Watchtower topology health, provider limits,
// Antigravity quota)만 읽고 새 외부 호출을 만들지 않는다.
//
// 이 렌즈는 토폴로지 health 를 바꾸지 않는다. 계정 연결과 로컬 수집·소스는 서로를
// 대체하지 않는 별도 근거이며, 근거가 없으면 정상으로도 장애로도 판정하지 않는다.

import { normalizeAntigravityQuotaSnapshot } from "./antigravity-quota.mjs";
import { normalizeClaudeOfficialQuota } from "./provider-limits.mjs";
import { buildTopologyViewModel, describeTopologyAge } from "./topology-view.mjs";

export const TOPOLOGY_CONNECTION_DIAGNOSTIC_SCHEMA =
  "soulforge.team_ops_board.topology_connection_diagnostic.v1";

// 정확 allowlist. 목록 밖 id, 비문자열, 대소문자·공백 변형은 모두 fail closed 다.
export const TOPOLOGY_DIAGNOSTIC_NODE_IDS = Object.freeze([
  "consumer_timeline",
  "src_antigravity",
  "src_claude",
  "src_codex",
  "src_gmail",
  "src_hiworks",
  "src_onedrive",
  "src_plaud",
  "src_slack",
]);

export const TOPOLOGY_DIAGNOSTIC_ACCOUNT_STATES = Object.freeze([
  "confirmed", "failure_signal", "unverifiable", "not_applicable",
]);
export const TOPOLOGY_DIAGNOSTIC_LOCAL_STATES = Object.freeze(["ok", "attention", "unverifiable"]);
export const TOPOLOGY_DIAGNOSTIC_OBSERVATION_STATES = Object.freeze(["observed", "retained", "absent"]);

const ACCOUNT_STATE_LABELS = Object.freeze({
  confirmed: "확인됨",
  failure_signal: "실패 신호",
  unverifiable: "확인 불가",
  not_applicable: "해당 없음",
});

const LOCAL_STATE_LABELS = Object.freeze({
  ok: "정상",
  attention: "주의",
  unverifiable: "확인 불가",
});

const OBSERVATION_STATE_LABELS = Object.freeze({
  observed: "안전 관측",
  retained: "보존 관측",
  absent: "관측 없음",
});

const REASON_LABELS = Object.freeze({
  account_surface_absent: "이 노드에는 계정 로그인 표면이 없습니다",
  collector_evidence_absent: "로컬 수집기 관측 근거가 연결되지 않았습니다",
  collector_health_attention: "로컬 수집기에서 주의 상태가 관측되었습니다",
  collector_health_observed: "연결된 로컬 수집기가 정상으로 관측되었습니다",
  collector_health_retained: "로컬 수집기 관측이 보존본이라 현재 정상으로 볼 수 없습니다",
  evidence_owner_absent: "근거 소유 노드를 관측 스냅샷에서 찾지 못했습니다",
  health_snapshot_unavailable: "Watchtower 관측을 읽지 못했습니다",
  independent_evidence_absent: "독립 관측 근거가 없습니다",
  local_source_only_not_login_proof: "로컬 소스 파일만 확인할 수 있고 계정 로그인 증명은 아닙니다",
  node_id_not_allowlisted: "진단 허용 목록에 없는 노드입니다",
  producer_evidence_local_only: "로컬 생산자 관측만 있고 계정 로그인 증명은 아닙니다",
  provider_evidence_not_loaded: "이 화면에서 공급자 근거를 아직 읽지 않았습니다",
  provider_issued_quota_observed: "공급자가 발급한 한도 응답을 관측 시각에 확인했습니다",
  provider_quota_evidence_absent: "공급자 한도 근거가 없습니다",
  provider_quota_retained: "공급자 한도 근거가 보존본이라 현재 연결로 볼 수 없습니다",
  provider_scope_health_failure: "공급자 범위 관측이 비정상으로 보고되었습니다",
  runtime_not_deployed: "소비 런타임이 아직 배치되지 않았습니다",
});

const LIMIT_LABELS = Object.freeze({
  read_only: "이 진단은 읽기 전용이며 상태 변경, 복구, 로그인, 작업 재시작을 하지 않습니다.",
  edge_receipt_absent: "전달 영수증 통로가 없어 실제 데이터 전달은 증명되지 않습니다.",
  local_not_login_proof: "로컬 수집기·소스 관측은 공급자 로그인 증명이 아닙니다.",
  quota_point_in_time: "공급자 한도 응답은 관측 시각의 계정 수용만 증명하며 현재 순간을 보장하지 않습니다.",
  no_evidence_no_verdict: "근거가 없어 정상으로도 장애로도 판정하지 않습니다.",
  health_unchanged: "토폴로지 상태 색과 판정은 이 진단으로 바뀌지 않습니다.",
});

const EVIDENCE_SCOPES = Object.freeze({
  collector: "watchtower_local_collector_health",
  quota: "provider_issued_quota_receipt",
});

// 노드별 근거 계약. 각 항목은 어떤 근거가 어떤 판단을 뒷받침하는지 명시하며,
// 여기 없는 근거는 쓰지 않는다.
const NODE_CONTRACTS = new Map([
  ["src_hiworks", {
    label: "Hiworks 메일",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "producer_evidence_local_only",
    localOwners: ["ingress_supervisor", "mail_forwarder"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_plaud", {
    label: "PLAUD 음성",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "local_source_only_not_login_proof",
    localOwners: ["ingress_supervisor"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_slack", {
    label: "Slack API",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "producer_evidence_local_only",
    localOwners: ["slack_batch"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_onedrive", {
    label: "OneDrive worksite",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "local_source_only_not_login_proof",
    localOwners: ["local_activity"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_codex", {
    label: "Codex session JSONL",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "local_source_only_not_login_proof",
    localOwners: ["usage_codex_collector"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_claude", {
    label: "Claude Code session JSONL",
    accountSurface: true,
    accountLane: "claude",
    accountAbsentReason: "provider_quota_evidence_absent",
    localOwners: ["usage_claude_collector"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_antigravity", {
    label: "Antigravity conversation DB",
    accountSurface: true,
    accountLane: "antigravity",
    accountAbsentReason: "provider_quota_evidence_absent",
    localOwners: ["usage_antigravity_collector"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["src_gmail", {
    label: "Gmail API",
    accountSurface: true,
    accountLane: null,
    accountAbsentReason: "producer_evidence_local_only",
    localOwners: ["mail_forwarder"],
    localAbsentReason: "collector_evidence_absent",
  }],
  ["consumer_timeline", {
    label: "프로젝트 시간장부 shadow",
    accountSurface: false,
    accountLane: null,
    accountAbsentReason: "account_surface_absent",
    localOwners: [],
    localAbsentReason: "runtime_not_deployed",
  }],
]);

const ATTENTION_HEALTH_STATES = new Set(["degraded", "stale", "down"]);
const REFRESH_STATES = new Set(["ready", "refreshing", "stale", "hold", "unconfigured", "absent"]);

function describeReason(code) {
  return REASON_LABELS[code] ?? "설명 없는 사유";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isoOrNull(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function ageLabelFor(observedAt, nowMs) {
  const iso = isoOrNull(observedAt);
  if (iso === null || !Number.isFinite(nowMs)) return describeTopologyAge(null);
  return describeTopologyAge(Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1_000)));
}

function lane(state, reasonCode) {
  return { state, reasonCode };
}

function claudeQuotaLane(providerSnapshots) {
  if (!isRecord(providerSnapshots)) return lane(null, "provider_evidence_not_loaded");
  const official = normalizeClaudeOfficialQuota(providerSnapshots.limits?.claude_official);
  if (official.source_kind === null) return lane(null, "provider_quota_evidence_absent");
  const current = official.capture_status === "accepted" && official.freshness === "fresh";
  return {
    state: current ? "confirmed" : "retained",
    reasonCode: current ? "provider_issued_quota_observed" : "provider_quota_retained",
    observedAt: official.observed_at,
  };
}

function antigravityQuotaLane(providerSnapshots, nowMs) {
  if (!isRecord(providerSnapshots)) return lane(null, "provider_evidence_not_loaded");
  const quota = normalizeAntigravityQuotaSnapshot(providerSnapshots.antigravityQuota, { nowMs });
  if (quota === null) return lane(null, "provider_quota_evidence_absent");
  const current = quota.freshness === "current";
  return {
    state: current ? "confirmed" : "retained",
    reasonCode: current ? "provider_issued_quota_observed" : "provider_quota_retained",
    observedAt: quota.observed_at,
  };
}

function accountQuotaLane(contract, providerSnapshots, nowMs) {
  if (contract.accountLane === "claude") return claudeQuotaLane(providerSnapshots);
  if (contract.accountLane === "antigravity") return antigravityQuotaLane(providerSnapshots, nowMs);
  return null;
}

function collectorLane(contract, health) {
  if (contract.localOwners.length === 0) return null;
  if (!health.available) return lane("unverifiable", "health_snapshot_unavailable");
  const owners = contract.localOwners.map((ownerId) => health.nodeById.get(ownerId) ?? null);
  if (owners.some((owner) => owner === null)) return lane("unverifiable", "evidence_owner_absent");
  if (owners.some((owner) => ATTENTION_HEALTH_STATES.has(owner.state))) {
    return lane("attention", "collector_health_attention");
  }
  if (owners.some((owner) => owner.state !== "ok")) return lane("unverifiable", contract.localAbsentReason);
  // 마지막 관측이 정상이어도 현재 판정이 아니면 초록으로 올리지 않는다.
  if (!health.current) return lane("attention", "collector_health_retained");
  return lane("ok", "collector_health_observed");
}

function readHealth(healthProjection) {
  const refreshState = typeof healthProjection?.refresh_state === "string"
    && REFRESH_STATES.has(healthProjection.refresh_state)
    ? healthProjection.refresh_state
    : "absent";
  const model = buildTopologyViewModel(healthProjection?.snapshot ?? null);
  const nodes = model.available ? model.nodes.filter((node) => node.kind !== "lane") : [];
  return {
    available: model.available,
    current: model.available && refreshState === "ready",
    observedAt: model.available ? isoOrNull(model.observedAt) : null,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
  };
}

function unavailableDiagnostic(nodeId, reasonCode, nowMs) {
  return Object.freeze({
    schema_version: TOPOLOGY_CONNECTION_DIAGNOSTIC_SCHEMA,
    available: false,
    node_id: typeof nodeId === "string" && NODE_CONTRACTS.has(nodeId) ? nodeId : null,
    node_label: null,
    node_health: null,
    account: Object.freeze({
      state: "unverifiable",
      state_label: ACCOUNT_STATE_LABELS.unverifiable,
      reason_code: reasonCode,
      reason_label: describeReason(reasonCode),
    }),
    local_source: Object.freeze({
      state: "unverifiable",
      state_label: LOCAL_STATE_LABELS.unverifiable,
      reason_code: reasonCode,
      reason_label: describeReason(reasonCode),
    }),
    last_safe_observation: Object.freeze({
      observed_at: null,
      state: "absent",
      state_label: OBSERVATION_STATE_LABELS.absent,
      age_label: describeTopologyAge(null),
    }),
    evidence: Object.freeze({
      owners: Object.freeze([]),
      scopes: Object.freeze([]),
      limits: Object.freeze([LIMIT_LABELS.read_only, LIMIT_LABELS.no_evidence_no_verdict]),
    }),
    diagnosed_at: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    runtime_authority: false,
    repair_execution_authority: false,
  });
}

/**
 * @param {{
 *   nodeId?: unknown,
 *   healthProjection?: unknown,
 *   providerSnapshots?: unknown,
 *   nowMs?: number,
 * }} [options]
 */
/**
 * @param {{
 *   nodeId?: unknown,
 *   healthProjection?: unknown,
 *   providerSnapshots?: unknown,
 *   nowMs?: number,
 * }} [options]
 */
export function buildTopologyConnectionDiagnostic({
  nodeId = null,
  healthProjection = null,
  providerSnapshots = null,
  nowMs = Date.now(),
} = {}) {
  const contract = typeof nodeId === "string" ? NODE_CONTRACTS.get(nodeId) ?? null : null;
  if (contract === null) return unavailableDiagnostic(nodeId, "node_id_not_allowlisted", nowMs);
  if (!Number.isFinite(nowMs)) return unavailableDiagnostic(nodeId, "health_snapshot_unavailable", Number.NaN);

  const health = readHealth(healthProjection);
  const selfNode = health.available ? health.nodeById.get(nodeId) ?? null : null;
  const quota = accountQuotaLane(contract, providerSnapshots, nowMs);
  const collector = collectorLane(contract, health);

  const owners = [];
  const scopes = new Set();
  const limits = [LIMIT_LABELS.read_only, LIMIT_LABELS.health_unchanged, LIMIT_LABELS.edge_receipt_absent];
  // 관측 시각은 이 노드의 근거가 실제로 뒷받침될 때만 쌓는다. 근거가 없으면 스냅샷을 읽은
  // 시각이 있어도 그 노드를 관측했다고 말하지 않는다.
  const observationCandidates = [];
  let observationCurrent = false;
  const observe = (observedAt, current) => {
    observationCandidates.push(observedAt ?? null);
    if (current) observationCurrent = true;
  };

  // 계정 연결 — 공급자 범위 실패 신호 > 공급자 발급 근거 > 근거 없음. 로컬 근거는 절대
  // 계정 판단으로 승격하지 않는다.
  let account;
  if (!contract.accountSurface) {
    account = lane("not_applicable", "account_surface_absent");
  } else if (!health.available) {
    account = lane("unverifiable", "health_snapshot_unavailable");
  } else if (selfNode !== null && ATTENTION_HEALTH_STATES.has(selfNode.state)
    && selfNode.healthScope === "provider") {
    owners.push(nodeId);
    scopes.add(EVIDENCE_SCOPES.collector);
    observe(health.observedAt, health.current);
    account = lane("failure_signal", "provider_scope_health_failure");
  } else if (quota === null) {
    account = lane("unverifiable", contract.accountAbsentReason);
  } else if (quota.state === "confirmed" || quota.state === "retained") {
    scopes.add(EVIDENCE_SCOPES.quota);
    limits.push(LIMIT_LABELS.quota_point_in_time);
    observe(quota.observedAt, quota.state === "confirmed");
    account = quota.state === "confirmed"
      ? lane("confirmed", quota.reasonCode)
      : lane("unverifiable", quota.reasonCode);
  } else {
    account = lane("unverifiable", quota.reasonCode);
  }

  // 로컬 수집·소스 — 정확한 수집기 health owner 만 쓴다. 공급자 한도 영수증은 로컬
  // 세션 파일이나 대화 DB 가용성을 증명하지 않으므로 이 lane 에 들어오지 않는다.
  if (collector !== null && (collector.state === "ok" || collector.state === "attention")) {
    owners.push(...contract.localOwners);
    scopes.add(EVIDENCE_SCOPES.collector);
    observe(health.observedAt, health.current);
    limits.push(LIMIT_LABELS.local_not_login_proof);
  }
  const localSource = collector ?? lane("unverifiable", contract.localAbsentReason);

  if (account.state === "unverifiable" || localSource.state === "unverifiable") {
    limits.push(LIMIT_LABELS.no_evidence_no_verdict);
  }

  const observedAt = observationCandidates
    .map((candidate) => isoOrNull(candidate))
    .filter((candidate) => candidate !== null)
    .sort()
    .at(-1) ?? null;
  const observationState = observedAt === null ? "absent" : observationCurrent ? "observed" : "retained";

  return Object.freeze({
    schema_version: TOPOLOGY_CONNECTION_DIAGNOSTIC_SCHEMA,
    available: true,
    node_id: nodeId,
    node_label: contract.label,
    // 진단은 별도 렌즈다. 노드 상태는 Watchtower 판정 그대로만 다시 보여 준다.
    node_health: Object.freeze({
      state: selfNode?.state ?? null,
      state_label: selfNode?.stateLabel ?? null,
    }),
    account: Object.freeze({
      state: account.state,
      state_label: ACCOUNT_STATE_LABELS[account.state],
      reason_code: account.reasonCode,
      reason_label: describeReason(account.reasonCode),
    }),
    local_source: Object.freeze({
      state: localSource.state,
      state_label: LOCAL_STATE_LABELS[localSource.state],
      reason_code: localSource.reasonCode,
      reason_label: describeReason(localSource.reasonCode),
    }),
    last_safe_observation: Object.freeze({
      observed_at: observedAt,
      state: observationState,
      state_label: OBSERVATION_STATE_LABELS[observationState],
      age_label: observedAt === null ? describeTopologyAge(null) : ageLabelFor(observedAt, nowMs),
    }),
    evidence: Object.freeze({
      owners: Object.freeze([...new Set(owners)].sort()),
      scopes: Object.freeze([...scopes].sort()),
      limits: Object.freeze([...new Set(limits)]),
    }),
    diagnosed_at: new Date(nowMs).toISOString(),
    runtime_authority: false,
    repair_execution_authority: false,
  });
}

export function isTopologyDiagnosticNode(nodeId) {
  return typeof nodeId === "string" && NODE_CONTRACTS.has(nodeId);
}
