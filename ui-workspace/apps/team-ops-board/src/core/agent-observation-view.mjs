/**
 * Board view model for the Agent Observation evidence.
 *
 * `guild_hall/agent_observation` produces several projections — store counts with a privacy audit,
 * delivery edges, Board health, and the meter lineage rollups — and until now nothing displayed any
 * of them. This turns those projections into rows a Board panel can render.
 *
 * It is a pure view-model builder in the shape the other topology views use: it takes projections
 * the caller already obtained, returns a plain object, and never fetches, writes, or reads a clock.
 *
 * Two display rules it will not bend:
 *   - A hold is shown as a hold. A projection that failed is never rendered as an empty-but-healthy
 *     panel, because "nothing to show" and "we could not look" mean opposite things to a reader.
 *   - Structural adjacency is never drawn as delivery. The observation contract keeps those two
 *     counts apart precisely so a screen cannot merge them back together.
 */

const UNAVAILABLE_LABEL = "관찰 증거 없음";

const HOLD_LABELS = Object.freeze({
  UNKNOWN_STORE: "관찰 store를 알 수 없음 · 표시 보류",
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: "허용되지 않은 필드 · 표시 보류",
  HOSTILE_INPUT_REFUSED: "입력 거부됨 · 표시 보류",
  INPUT_TOO_LARGE: "입력이 한도를 넘음 · 표시 보류",
});

const HEALTH_LABELS = Object.freeze({
  available: "가용",
  missing: "근거 없음",
  invalid: "불일치",
  disabled: "비활성",
});

const COVERAGE_LABELS = Object.freeze({
  exact: "정확 바인딩",
  hold: "보류",
});

/** Every record family the store audits. A family missing here would be displayed as unaudited. */
const AUDITED_FAMILY_LABELS = Object.freeze({
  agents: "에이전트",
  runs: "실행",
  usage: "사용량",
  receipts: "영수증",
  delivery_edges: "전달 간선",
});

export function lookupObservationHoldLabel(holdCode) {
  if (typeof holdCode !== "string" || holdCode.length === 0) return UNAVAILABLE_LABEL;
  return HOLD_LABELS[holdCode] ?? `보류 · ${holdCode}`;
}

const isProjected = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && value.status === "PROJECTED";

const holdOf = (value) => (value !== null && typeof value === "object" && value.status === "HOLD"
  ? lookupObservationHoldLabel(value.hold_code)
  : UNAVAILABLE_LABEL);

/**
 * The privacy panel. The counters are only meaningful alongside the list of families they covered:
 * three zeroes read the same whether every family was audited or none were.
 */
function buildPrivacyPanel(counts) {
  if (!isProjected(counts)) {
    return { available: false, reason: holdOf(counts), families: [], totals: null, clean: false };
  }
  const audited = Array.isArray(counts.privacy_audited_families) ? counts.privacy_audited_families : [];
  const privacy = counts.privacy ?? {};
  const totals = {
    raw_fields_stored: privacy.raw_fields_stored ?? 0,
    secret_fields_stored: privacy.secret_fields_stored ?? 0,
    local_path_fields_stored: privacy.local_path_fields_stored ?? 0,
  };
  const expected = Object.keys(AUDITED_FAMILY_LABELS);
  const missing = expected.filter((family) => !audited.includes(family));
  return {
    available: true,
    reason: null,
    families: audited.map((family) => ({ key: family, label: AUDITED_FAMILY_LABELS[family] ?? family })),
    // A family the store knows about but did not audit is the one thing these counters cannot show,
    // so the view says it outright rather than letting three zeroes imply full coverage.
    unaudited_families: missing.map((family) => ({ key: family, label: AUDITED_FAMILY_LABELS[family] })),
    totals,
    clean: missing.length === 0
      && totals.raw_fields_stored === 0
      && totals.secret_fields_stored === 0
      && totals.local_path_fields_stored === 0,
  };
}

/** The delivery panel. Structural and delivery counts stay in separate columns, never summed. */
function buildDeliveryPanel(edges) {
  if (!isProjected(edges)) {
    return { available: false, reason: holdOf(edges), consumers: [], delivery_count: 0, structural_count: 0 };
  }
  const consumers = Array.isArray(edges.consumers) ? edges.consumers : [];
  return {
    available: true,
    reason: null,
    delivery_count: edges.delivery_edge_count ?? 0,
    structural_count: edges.structural_edge_count ?? 0,
    consumers: consumers.map((consumer) => ({
      consumer_run_id: consumer.consumer_run_id,
      consumer_agent_id: consumer.consumer_agent_id,
      delivery_count: consumer.delivery_count ?? 0,
      structural_count: consumer.structural_count ?? 0,
      // Each ref keeps the producer that supplied it. A pooled list would say a consumer received
      // these artifacts without saying from whom.
      evidence: (consumer.producer_evidence_refs ?? []).map((ref) => ({
        producer_agent_id: ref.producer_agent_id,
        ref_label: `${ref.ref_kind}:${ref.ref_value}`,
      })),
      // Adjacency with no delivery is worth showing as its own state rather than as a zero.
      adjacent_only: (consumer.delivery_count ?? 0) === 0 && (consumer.structural_count ?? 0) > 0,
    })),
  };
}

/** The Board health panel, in the Board's own closed vocabulary. */
function buildHealthPanel(health) {
  if (!isProjected(health)) {
    return { available: false, reason: holdOf(health), result_gate: null, binding_coverage: null, evidence: null };
  }
  const scope = health.scope ?? {};
  return {
    available: true,
    reason: null,
    result_gate: {
      value: scope.result_gate_health,
      label: HEALTH_LABELS[scope.result_gate_health] ?? scope.result_gate_health,
    },
    binding_coverage: {
      value: scope.binding_coverage,
      label: COVERAGE_LABELS[scope.binding_coverage] ?? scope.binding_coverage,
    },
    evidence: health.evidence ?? null,
  };
}

/**
 * The lineage panel: the agents whose subtree cost more than their own row.
 *
 * A parent whose subtree equals its self usage has no descendants worth a row here, and listing
 * every leaf would bury the handful of agents that actually dispatched work.
 */
function buildLineagePanel(lineage, { limit = 10 } = {}) {
  if (!isProjected(lineage)) {
    return { available: false, reason: holdOf(lineage), agents: [], agent_count: 0 };
  }
  const agents = Array.isArray(lineage.agents) ? lineage.agents : [];
  const dispatchers = agents
    .filter((agent) => (agent.subtree_usage?.turns ?? 0) > (agent.self_usage?.turns ?? 0))
    .sort((left, right) => (right.subtree_usage.turns - left.subtree_usage.turns)
      || left.agent_key.localeCompare(right.agent_key, "en"));
  return {
    available: true,
    reason: null,
    agent_count: lineage.agent_count ?? agents.length,
    // Parents the ledger never emitted a row for. A non-zero count means the source list was
    // incomplete, which is worth surfacing rather than silently repairing.
    materialised_parent_count: lineage.materialised_parent_count ?? 0,
    truncated: dispatchers.length > limit,
    agents: dispatchers.slice(0, limit).map((agent) => ({
      agent_key: agent.agent_key,
      depth: agent.depth,
      child_count: (agent.child_keys ?? []).length,
      self_turns: agent.self_usage?.turns ?? 0,
      child_direct_turns: agent.child_direct_usage?.turns ?? 0,
      subtree_turns: agent.subtree_usage?.turns ?? 0,
      // Present only when a grandchild exists, which is the case the three rollups exist to tell
      // apart at all.
      has_descendants_beyond_children:
        (agent.subtree_usage?.turns ?? 0)
        !== (agent.self_usage?.turns ?? 0) + (agent.child_direct_usage?.turns ?? 0),
    })),
  };
}

/**
 * Builds the whole Agent Observation panel set.
 *
 * Every projection is optional: a caller that has not obtained one gets that panel marked
 * unavailable rather than an empty panel that reads as healthy.
 */
export function buildAgentObservationViewModel({
  storeCounts = null,
  deliveryEdges = null,
  boardHealth = null,
  meterLineage = null,
  lineageLimit = 10,
} = {}) {
  const privacy = buildPrivacyPanel(storeCounts);
  const delivery = buildDeliveryPanel(deliveryEdges);
  const health = buildHealthPanel(boardHealth);
  const lineage = buildLineagePanel(meterLineage, { limit: lineageLimit });
  const panels = [privacy, delivery, health, lineage];

  return {
    schema_version: "soulforge.team_ops_board.agent_observation_view.v1",
    available: panels.some((panel) => panel.available),
    // Named so a reader can tell "all four panels are blank because nothing is wired" from "one
    // projection failed".
    unavailable_panel_count: panels.filter((panel) => !panel.available).length,
    counts: isProjected(storeCounts)
      ? {
        agents: storeCounts.agents ?? 0,
        runs: storeCounts.runs ?? 0,
        usage_events: storeCounts.usage_events ?? 0,
        receipts: storeCounts.receipts ?? 0,
        delivery_edges: storeCounts.delivery_edges ?? 0,
      }
      : null,
    privacy,
    delivery,
    health,
    lineage,
    authority_boundary: {
      read_only: true,
      writes_observation_store: false,
      writes_result_gate: false,
    },
  };
}
