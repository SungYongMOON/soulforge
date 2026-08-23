import {
  buildTopologyFederationViewModel,
  selectTopologyFederationProvider,
} from "./topology-federation-view.mjs";
import { distributeTopologyPorts } from "./topology-view.mjs";

export const ENGINEERING_ENGINE_PROVIDER_ID = "engineering_engine";

const COLUMN_GAP = 360;
const ROW_GAP = 138;
const TOP_GUTTER = 96;
const LANE_WIDTH = 330;

const ENGINE_LANES = Object.freeze([
  {
    roleLabel: "BOUNDARY",
    label: "계약·권한",
    tone: "input",
    ids: ["contract_config", "common_se_corpus_projection", "se_core_crosswalk_projection", "execution_mode", "ceilings", "authority", "identity"],
  },
  {
    roleLabel: "ASSEMBLE",
    label: "조립·바인딩",
    tone: "process",
    ids: ["index", "registration", "module_binding", "capsule", "mcp_contract"],
  },
  {
    roleLabel: "EVIDENCE",
    label: "정본·근거",
    tone: "data",
    ids: ["canonical", "fingerprint", "lineage", "custody", "context_receipt", "project_context_generation_candidate", "project_context_acceptance_gate", "delivery_receipt", "finding", "errors"],
  },
  {
    roleLabel: "ENGINE",
    label: "연산·실행",
    tone: "route",
    ids: ["graph", "pipeline", "minting", "heartbeat", "snapshot"],
  },
  {
    roleLabel: "OUTPUT",
    label: "결과·자기 구조",
    tone: "output",
    ids: [
      "engine_pass",
      "engine_self_topology",
      "se_core_crosswalk_case_run",
      "se_core_source_cited_answer_run",
      "ax_se_project_assessment",
      "ax_se_project_role_roster",
      "ax_se_project_role_bound_assessment",
      "ax_se_project_context_pilot",
    ],
  },
]);

const CLASSIC_SHAPE_BY_ID = Object.freeze({
  contract_config: "external",
  common_se_corpus_projection: "external",
  se_core_crosswalk_projection: "external",
  execution_mode: "external",
  ceilings: "external",
  authority: "gate",
  identity: "gate",
  canonical: "store",
  fingerprint: "store",
  lineage: "store",
  custody: "store",
  context_receipt: "store",
  project_context_generation_candidate: "store",
  project_context_acceptance_gate: "store",
  delivery_receipt: "store",
  finding: "store",
  errors: "gate",
  graph: "supervisor",
  pipeline: "supervisor",
  minting: "worker",
  heartbeat: "worker",
  snapshot: "store",
  engine_pass: "consumer",
  engine_self_topology: "consumer",
  se_core_crosswalk_case_run: "consumer",
  se_core_source_cited_answer_run: "consumer",
  ax_se_project_assessment: "consumer",
  ax_se_project_role_roster: "consumer",
  ax_se_project_role_bound_assessment: "consumer",
  ax_se_project_context_pilot: "consumer",
});

const STRUCTURAL_LIMITS = Object.freeze([
  "runtime_health",
  "live_execution",
  "edge_delivery",
  "repair_execution",
]);

function unavailable(reason) {
  return {
    available: false,
    reason,
    state: "unavailable",
    nodes: [],
    edges: [],
    source: { nodeCount: 0, edgeCount: 0 },
    authority: { runtime: false, repair: false },
  };
}

function edgePortSteps(count) {
  if (count <= 1) return [0.5];
  return Array.from({ length: count }, (_value, index) => 0.28 + (index * 0.44) / (count - 1));
}

export function buildEngineeringClassicTopologyViewModel(projection) {
  const federation = buildTopologyFederationViewModel(projection);
  if (!federation.available) return unavailable(federation.reason ?? "federation_unavailable");
  if (federation.summary?.runtimeAuthority === true || federation.summary?.repairExecutionAuthority === true) {
    return unavailable("authority_boundary_refused");
  }
  const selected = selectTopologyFederationProvider(federation, ENGINEERING_ENGINE_PROVIDER_ID);
  if (selected === null) return unavailable("engineering_engine_provider_missing");
  if (selected.nodes.length !== selected.provider.nodeCount || selected.edges.length !== selected.provider.edgeCount) {
    return unavailable("engineering_engine_count_mismatch");
  }
  if (selected.nodes.some((node) => node.kind !== "module" || node.layer !== "module")) {
    return unavailable("engineering_engine_node_contract_mismatch");
  }
  if (selected.edges.some((edge) => edge.relation !== "imports"
    || !edge.from.startsWith(`${ENGINEERING_ENGINE_PROVIDER_ID}::`)
    || !edge.to.startsWith(`${ENGINEERING_ENGINE_PROVIDER_ID}::`))) {
    return unavailable("engineering_engine_edge_contract_mismatch");
  }

  const nodeByLocalId = new Map(selected.nodes.map((node) => [node.localId, node]));
  const laneByLocalId = new Map();
  for (let column = 0; column < ENGINE_LANES.length; column += 1) {
    for (const localId of ENGINE_LANES[column].ids) {
      if (laneByLocalId.has(localId)) return unavailable("engineering_engine_lane_duplicate");
      laneByLocalId.set(localId, column);
    }
  }
  if (nodeByLocalId.size !== laneByLocalId.size
    || [...nodeByLocalId.keys()].some((localId) => !laneByLocalId.has(localId))) {
    return unavailable("engineering_engine_lane_coverage_mismatch");
  }

  const rowByLocalId = new Map();
  for (const lane of ENGINE_LANES) lane.ids.forEach((id, index) => rowByLocalId.set(id, index));
  const baseNodes = selected.nodes.map((node) => {
    const column = laneByLocalId.get(node.localId);
    const row = rowByLocalId.get(node.localId);
    return {
      id: node.id,
      localId: node.localId,
      label: node.label,
      sourceKind: node.kind,
      kind: CLASSIC_SHAPE_BY_ID[node.localId] ?? "worker",
      group: node.group ?? "kernel",
      state: "unmonitored",
      stateLabel: "구조 선언",
      ageLabel: "runtime UNKNOWN",
      reasons: ["실행 상태 관측 없음"],
      healthObserved: false,
      healthBasis: "catalog_only",
      catalog_only: true,
      evidenceScope: "engineering_engine_declared_structure_only",
      evidenceAt: null,
      proves: ["provider_local_module_import_relationship"],
      doesNotProve: STRUCTURAL_LIMITS,
      statusText: "선언 모듈 · runtime UNKNOWN",
      operationMode: "read_only",
      provider: ENGINEERING_ENGINE_PROVIDER_ID,
      position: { x: column * COLUMN_GAP, y: TOP_GUTTER + row * ROW_GAP },
    };
  });
  const baseNodeById = new Map(baseNodes.map((node) => [node.id, node]));
  const rawEdges = selected.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label || edge.relation,
    flow: "data",
    relation: edge.relation,
    relationKind: "catalog_only",
    deliveryState: "unreceipted",
    deliveryReason: "structural_only",
    deliveryProven: false,
    evidenceScope: "engineering_engine_declared_structure_only",
    proves: ["provider_local_module_import_relationship"],
    doesNotProve: STRUCTURAL_LIMITS,
  }));
  const inboundByNode = new Map(baseNodes.map((node) => [node.id, []]));
  const outboundByNode = new Map(baseNodes.map((node) => [node.id, []]));
  for (const edge of rawEdges) {
    if (!baseNodeById.has(edge.source) || !baseNodeById.has(edge.target)) {
      return unavailable("engineering_engine_edge_endpoint_missing");
    }
    inboundByNode.get(edge.target).push(edge);
    outboundByNode.get(edge.source).push(edge);
  }
  const sortEdges = (opposite) => (left, right) => {
    const leftNode = baseNodeById.get(left[opposite]);
    const rightNode = baseNodeById.get(right[opposite]);
    return leftNode.position.x - rightNode.position.x
      || leftNode.position.y - rightNode.position.y
      || left.id.localeCompare(right.id, "en");
  };
  for (const edges of inboundByNode.values()) edges.sort(sortEdges("source"));
  for (const edges of outboundByNode.values()) edges.sort(sortEdges("target"));

  const routeByEdge = new Map();
  for (const node of baseNodes) {
    const inbound = inboundByNode.get(node.id);
    const outbound = outboundByNode.get(node.id);
    const inputTops = distributeTopologyPorts(inbound.length);
    const outputTops = distributeTopologyPorts(outbound.length);
    const outputSteps = edgePortSteps(outbound.length);
    inbound.forEach((edge, index) => routeByEdge.set(edge.id, {
      ...(routeByEdge.get(edge.id) ?? {}),
      targetHandle: `input-${edge.id}`,
      targetPortIndex: index,
      targetPortTop: inputTops[index],
    }));
    outbound.forEach((edge, index) => routeByEdge.set(edge.id, {
      ...(routeByEdge.get(edge.id) ?? {}),
      sourceHandle: `output-${edge.id}`,
      sourcePortIndex: index,
      sourcePortTop: outputTops[index],
      stepPosition: outputSteps[index],
    }));
  }

  const nodes = baseNodes.map((node) => ({
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
  const laneHeight = Math.max(600, ...nodes.map((node) => node.position.y + 104));
  const lanes = ENGINE_LANES.map((lane, column) => ({
    id: `engine-lane-col-${column}`,
    label: lane.label,
    roleLabel: lane.roleLabel,
    tone: lane.tone,
    kind: "lane",
    group: lane.label,
    width: LANE_WIDTH,
    height: laneHeight,
    column,
    state: "lane",
    stateLabel: "",
    ageLabel: "",
    reasons: [],
    position: { x: column * COLUMN_GAP - 64, y: 0 },
  }));

  return {
    available: true,
    reason: federation.reason,
    state: federation.state,
    provider: selected.provider,
    nodes: [...lanes, ...nodes],
    edges: rawEdges.map((edge) => ({ ...edge, ...routeByEdge.get(edge.id) })),
    source: {
      nodeCount: selected.nodes.length,
      edgeCount: selected.edges.length,
      nodeIds: selected.nodes.map((node) => node.id).sort(),
      edgeIds: selected.edges.map((edge) => edge.id).sort(),
    },
    authority: {
      runtime: federation.summary.runtimeAuthority,
      repair: federation.summary.repairExecutionAuthority,
    },
    gap: "Watchtower와 Engineering Engine 사이 연결 계약 미선언",
  };
}
