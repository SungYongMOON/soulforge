// topology-federation-view.mjs — tracked AX topology federation projection을
// Board 화면 모델로 바꾸는 순수 정규화 계층. 프레임워크 비종속(node:test 검증 대상).
//
// 이 계층은 선언 구조만 다룬다. Watchtower W1 health 모델(topology-view.mjs)과
// 절대 합치지 않으며, 선언 status 를 health 색·상태로 승격하지 않는다. 계약에
// 없는 관계·상태는 만들지 않고, 모자란 입력은 사용 불가로 닫는다.

export const TOPOLOGY_FEDERATION_LENS = "declared_structure";
export const TOPOLOGY_FEDERATION_LENS_LABEL = "선언 구조 (declared structure)";
export const TOPOLOGY_FEDERATION_STATES = Object.freeze(["ready", "stale", "unavailable"]);
export const TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS = Object.freeze({
  live_health: "현재 health 아님",
  runtime_execution: "실행 중 증거 아님",
  delivery_receipt: "전달 영수증 아님",
  provider_availability: "공급자 가용성 아님",
  repair_execution: "복구 실행 아님",
});

const PROVIDER_KIND_LABELS = Object.freeze({
  platform: "플랫폼",
  domain_engine: "도메인 엔진",
  knowledge: "지식",
  workflow: "워크플로",
  advisory_workbench: "자문 워크벤치",
});
const DECLARED_STATUS_LABELS = Object.freeze({
  active: "선언 활성",
  candidate: "선언 후보",
  planned: "선언 예정",
  hold: "선언 보류",
});
const VALIDATION_STATE_LABELS = Object.freeze({
  not_run: "구조 검증 미실행",
  passed: "구조 검증 통과",
  failed: "구조 검증 실패",
  unknown: "구조 검증 상태 미상",
});
const CLAIM_CEILING_LABELS = Object.freeze({
  observed: "관찰됨",
  source_supported: "출처로 뒷받침됨",
  validated_private: "비공개 검증됨",
  canon_candidate: "정본 후보",
  canon_entry: "정본 등록됨",
  rejected_or_blocked: "막힘/보류",
});
const RUNTIME_STATE_LABELS = Object.freeze({
  unknown: "런타임 미관측",
  not_applicable: "런타임 해당 없음",
});
const PAYLOAD_STATE_LABELS = Object.freeze({
  none: "payload 없음",
  metadata_only: "메타데이터만",
  public_safe_contract: "public-safe 계약",
});
const NODE_KIND_LABELS = Object.freeze({
  external: "외부", supervisor: "감독", worker: "연산", store: "저장", gate: "판단",
  consumer: "소비", provider: "공급자", domain_engine: "도메인 엔진", module: "모듈",
  operation: "연산단위", knowledge: "지식", workbench: "워크벤치",
});
const LAYER_LABELS = Object.freeze({
  system: "시스템", subsystem: "하위시스템", module: "모듈",
  operation: "연산", runtime: "런타임",
});
const DIAGNOSTIC_STATE_LABELS = Object.freeze({
  structural: "구조 선언",
  validator_backed: "구조 validator 근거",
  unknown: "진단 근거 미상",
});
// 복구는 어떤 값이어도 실행 표면이 아니다. 후보와 Owner 승인 문구만 남긴다.
const REPAIR_STATE_LABELS = Object.freeze({
  none: "복구 후보 없음",
  candidate_only: "복구 후보 · Owner 승인 필요",
  owner_approval_required: "Owner 승인 필요",
});
const RELATION_LABELS = Object.freeze({
  data: "데이터", control: "제어", contains: "포함", imports: "임포트",
  projects: "투영", advises: "자문", validates: "검증", observes: "관찰",
});
const EVIDENCE_MODE_LABELS = Object.freeze({
  structural_only: "구조 선언만",
  receipt_required: "영수증 필요 · 이 표면에 영수증 없음",
});

const DECLARED_EVIDENCE_SCOPE = "declared_structure_contract_only";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function labelOf(map, value) {
  return typeof value === "string" && Object.hasOwn(map, value) ? map[value] : "미정의";
}

function unavailableFederationViewModel(state, reason) {
  return {
    available: false,
    lens: TOPOLOGY_FEDERATION_LENS,
    lensLabel: TOPOLOGY_FEDERATION_LENS_LABEL,
    state,
    reason,
    providers: [],
    flattened: { nodes: [], edges: [] },
    summary: null,
    digest: null,
    doesNotProve: Object.keys(TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS),
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
  };
}

export function shortTopologyDigest(digest) {
  return typeof digest === "string" && SHA256_PATTERN.test(digest) ? `${digest.slice(0, 12)}…` : "—";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normaliseProvider(provider, nodes, edges) {
  const providerNodes = nodes.filter((node) => node.provider_id === provider.provider_id);
  const providerEdges = edges.filter((edge) => edge.provider_id === provider.provider_id);
  return {
    id: provider.provider_id,
    label: provider.label,
    kind: provider.provider_kind,
    kindLabel: labelOf(PROVIDER_KIND_LABELS, provider.provider_kind),
    declaredStatus: provider.declared_status,
    declaredStatusLabel: labelOf(DECLARED_STATUS_LABELS, provider.declared_status),
    claimCeiling: provider.claim_ceiling,
    claimCeilingLabel: labelOf(CLAIM_CEILING_LABELS, provider.claim_ceiling),
    validationState: provider.validation.state,
    validationStateLabel: labelOf(VALIDATION_STATE_LABELS, provider.validation.state),
    validatorId: provider.validation.validator_id,
    validationEvidenceRef: typeof provider.validation.evidence_ref === "string"
      ? provider.validation.evidence_ref
      : null,
    runtimeState: provider.runtime_state,
    runtimeStateLabel: labelOf(RUNTIME_STATE_LABELS, provider.runtime_state),
    payloadState: provider.payload_state,
    payloadStateLabel: labelOf(PAYLOAD_STATE_LABELS, provider.payload_state),
    sourceId: provider.source.source_id,
    sourceRevision: provider.source.revision,
    sourceDigestShort: shortTopologyDigest(provider.source.digest),
    blockerCodes: [...provider.blocker_codes],
    capabilities: {
      observe: [...provider.capabilities.observe],
      diagnose: [...provider.capabilities.diagnose],
      proposeRepair: [...provider.capabilities.propose_repair],
      executeRepair: provider.capabilities.execute_repair,
    },
    authorityBoundary: { ...provider.authority_boundary },
    nodeCount: providerNodes.length,
    edgeCount: providerEdges.length,
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
  };
}

export function buildTopologyFederationViewModel(projection) {
  if (!isPlainObject(projection) || projection.lens !== TOPOLOGY_FEDERATION_LENS
    || !TOPOLOGY_FEDERATION_STATES.includes(projection.state)) {
    return unavailableFederationViewModel("unavailable", "projection_unavailable");
  }
  const reason = typeof projection.reason === "string" ? projection.reason : null;
  const snapshot = projection.snapshot;
  if (projection.state === "unavailable" || !isPlainObject(snapshot)) {
    return unavailableFederationViewModel("unavailable", reason ?? "snapshot_absent");
  }
  if (snapshot.projection_kind !== TOPOLOGY_FEDERATION_LENS
    || !Array.isArray(snapshot.providers) || snapshot.providers.length === 0
    || !Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0
    || !Array.isArray(snapshot.edges) || !isPlainObject(snapshot.summary)) {
    return unavailableFederationViewModel("unavailable", "snapshot_shape_invalid");
  }
  for (const provider of snapshot.providers) {
    if (!isPlainObject(provider) || typeof provider.provider_id !== "string"
      || typeof provider.label !== "string"
      || !isPlainObject(provider.source) || !isPlainObject(provider.validation)
      || !isPlainObject(provider.capabilities) || !isPlainObject(provider.authority_boundary)
      || !Array.isArray(provider.capabilities.observe)
      || !Array.isArray(provider.capabilities.diagnose)
      || !Array.isArray(provider.capabilities.propose_repair)
      || !Array.isArray(provider.blocker_codes)) {
      return unavailableFederationViewModel("unavailable", "snapshot_provider_invalid");
    }
  }
  // 요약 수치와 실제 flattened 배열이 어긋나면 화면은 둘 중 무엇도 주장할 수 없다.
  if (snapshot.summary.provider_count !== snapshot.providers.length
    || snapshot.summary.node_count !== snapshot.nodes.length
    || snapshot.summary.edge_count !== snapshot.edges.length) {
    return unavailableFederationViewModel("unavailable", "snapshot_summary_mismatch");
  }
  const providers = snapshot.providers
    .map((provider) => normaliseProvider(provider, snapshot.nodes, snapshot.edges))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return {
    available: true,
    lens: TOPOLOGY_FEDERATION_LENS,
    lensLabel: TOPOLOGY_FEDERATION_LENS_LABEL,
    state: projection.state,
    reason,
    providers,
    // 드릴다운이 읽는 유일한 원본. 합성 projection 의 flattened namespaced 배열을
    // 그대로 들고 있고, 여기서 새 노드·간선을 만들지 않는다.
    flattened: { nodes: snapshot.nodes, edges: snapshot.edges },
    summary: {
      providerCount: snapshot.summary.provider_count,
      nodeCount: snapshot.summary.node_count,
      edgeCount: snapshot.summary.edge_count,
      runtimeAuthority: snapshot.summary.runtime_authority === true,
      repairExecutionAuthority: snapshot.summary.repair_execution_authority === true,
    },
    digest: {
      topology: snapshot.topology_digest,
      topologyShort: shortTopologyDigest(snapshot.topology_digest),
      sourceSetShort: shortTopologyDigest(snapshot.source_set_digest),
    },
    doesNotProve: Object.keys(TOPOLOGY_FEDERATION_DOES_NOT_PROVE_LABELS),
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
  };
}

function normaliseFederationNode(node) {
  const [namespace, ...rest] = String(node.id).split("::");
  return {
    id: node.id,
    localId: rest.length > 0 ? rest.join("::") : namespace,
    label: node.label,
    kind: node.kind,
    kindLabel: labelOf(NODE_KIND_LABELS, node.kind),
    layer: node.layer,
    layerLabel: labelOf(LAYER_LABELS, node.layer),
    group: typeof node.group === "string" ? node.group : null,
    parentId: typeof node.parent_id === "string" ? node.parent_id : null,
    diagnosticState: node.diagnostic_state,
    diagnosticStateLabel: labelOf(DIAGNOSTIC_STATE_LABELS, node.diagnostic_state),
    repairState: node.repair_state,
    repairStateLabel: labelOf(REPAIR_STATE_LABELS, node.repair_state),
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
  };
}

function normaliseFederationEdge(edge, nodeLabels) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    fromLabel: nodeLabels.get(edge.from) ?? edge.from,
    toLabel: nodeLabels.get(edge.to) ?? edge.to,
    label: typeof edge.label === "string" ? edge.label : "",
    relation: edge.relation,
    relationLabel: labelOf(RELATION_LABELS, edge.relation),
    layer: edge.layer,
    layerLabel: labelOf(LAYER_LABELS, edge.layer),
    evidenceMode: edge.evidence_mode,
    evidenceModeLabel: labelOf(EVIDENCE_MODE_LABELS, edge.evidence_mode),
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
  };
}

// 드릴다운은 합성 projection 의 flattened namespaced 배열만 provider_id 로 거른다.
// 없는 provider 는 빈 화면이 아니라 null 로 닫는다.
export function selectTopologyFederationProvider(model, providerId) {
  if (model?.available !== true || typeof providerId !== "string") return null;
  const provider = model.providers.find((entry) => entry.id === providerId) ?? null;
  const flattened = model.flattened;
  if (provider === null || !isPlainObject(flattened)
    || !Array.isArray(flattened.nodes) || !Array.isArray(flattened.edges)) return null;
  const nodes = flattened.nodes
    .filter((node) => node.provider_id === providerId && typeof node.id === "string"
      && node.id.startsWith(`${providerId}::`))
    .map((node) => normaliseFederationNode(node));
  const nodeLabels = new Map(nodes.map((node) => [node.id, node.label]));
  const edges = flattened.edges
    .filter((edge) => edge.provider_id === providerId && typeof edge.id === "string"
      && edge.id.startsWith(`${providerId}::`)
      && nodeLabels.has(edge.from) && nodeLabels.has(edge.to))
    .map((edge) => normaliseFederationEdge(edge, nodeLabels));
  const groups = [...nodes.reduce((accumulator, node) => {
    const key = node.group ?? "그룹 없음";
    accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
    return accumulator;
  }, new Map())]
    .map(([group, nodeCount]) => ({ group, nodeCount }))
    .sort((left, right) => right.nodeCount - left.nodeCount
      || (left.group < right.group ? -1 : left.group > right.group ? 1 : 0));
  return {
    provider,
    nodes,
    edges,
    groups,
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      structuralOnlyEdges: edges.filter((edge) => edge.evidenceMode === "structural_only").length,
      receiptRequiredEdges: edges.filter((edge) => edge.evidenceMode === "receipt_required").length,
      repairCandidateNodes: nodes.filter((node) => node.repairState !== "none").length,
    },
    evidenceScope: DECLARED_EVIDENCE_SCOPE,
    doesNotProve: model.doesNotProve,
  };
}
