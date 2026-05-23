export const KNOWLEDGE_GRAPH_LLM_REVIEW_SCHEMA_VERSION = "soulforge.knowledge_graph_llm_review_request.v0";
export const DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL = "gpt-5.5";
export const DEFAULT_KNOWLEDGE_GRAPH_REVIEW_OUTPUT_REF =
  "guild_hall/state/tools/codex_bridge/knowledge_graph_relation_review.md";

export function buildKnowledgeGraphReviewRequest(plan, options = {}) {
  const context = compactKnowledgeGraphReviewContext(plan);
  return {
    schema_version: KNOWLEDGE_GRAPH_LLM_REVIEW_SCHEMA_VERSION,
    kind: "knowledge_graph_relation_candidate_review_request",
    status: "ready_for_codex_bridge",
    model: String(options.model ?? DEFAULT_KNOWLEDGE_GRAPH_REVIEW_MODEL),
    mode: "knowledge_graph_relation_candidate_review",
    output_ref: String(options.outputRef ?? DEFAULT_KNOWLEDGE_GRAPH_REVIEW_OUTPUT_REF),
    prompt: buildKnowledgeGraphReviewPrompt(context),
    context,
    boundary: {
      metadata_only: true,
      no_source_text_loaded: true,
      no_answer_generation_request: true,
      no_owner_approval_claim: true,
      no_canon_or_ontology_mutation: true,
      relation_candidates_only: true,
    },
  };
}

export function compactKnowledgeGraphReviewContext(plan) {
  return {
    schema_version: "soulforge.knowledge_graph_llm_review_context.v0",
    status: "metadata_only",
    graph_ref: plan.graph_ref ?? null,
    graph_loaded_from: plan.graph_loaded_from ?? null,
    display: plan.display ?? null,
    selected_node_ref: plan.selected_node_ref ?? null,
    question: plan.question ?? null,
    input: plan.input ?? null,
    detection_card: plan.detection_card ?? null,
    boundary: plan.boundary ?? null,
    candidate_nodes: (plan.candidate_nodes ?? []).slice(0, 8).map(compactCandidate),
    relation_paths: (plan.relation_paths ?? []).slice(0, 24).map(compactRelationPath),
    source_refs: (plan.source_refs ?? []).slice(0, 20).map(compactSourceRef),
    missing_evidence_items: (plan.missing_evidence_items ?? []).map(compactCodedItem),
    next_action_items: (plan.next_action_items ?? []).map(compactCodedItem),
  };
}

export function buildKnowledgeGraphReviewPrompt(context) {
  const focus = context.selected_node_ref ?? context.display?.title ?? "question";
  return [
    "다음 Soulforge knowledge graph 탐지 카드/plan을 기준으로 관계 후보를 제안해줘.",
    `검토 초점: ${focus}`,
    "",
    "출력 요구:",
    "- 한국어로 짧고 실무적으로 작성.",
    "- 먼저 현재 카드가 왜 RAG 답변 재료로 충분하지 않은지 한 단락으로 설명.",
    "- 이어서 relation_candidates 배열 형태로 후보를 제안.",
    "- 각 후보는 relation_type, from_ref, to_ref, reason, required_evidence, claim_ceiling, apply_now 필드를 포함.",
    "- apply_now는 owner 검토 전에는 false로 둔다.",
    "",
    "경계:",
    "- 답변 생성, source truth, owner approval, ontology acceptance, canon promotion, validation pass, 구현 완료를 주장하지 말 것.",
    "- context에 없는 원문 내용, private payload, secret, 실제 파일 본문을 상상하지 말 것.",
    "- 현재 그래프에 없는 관계는 candidate로만 말하고 확정 관계처럼 쓰지 말 것.",
  ].join("\n");
}

function compactCandidate(candidate) {
  return {
    node_ref: candidate.node_ref,
    label: candidate.label,
    node_type: candidate.node_type,
    score: candidate.score,
    match_reasons: candidate.match_reasons ?? [],
    is_selected: Boolean(candidate.is_selected),
    claim_ceiling: candidate.claim_ceiling ?? "unknown",
    lifecycle_status: candidate.lifecycle_status ?? "unknown",
    visible_degree: candidate.visible_degree ?? 0,
    relation_type_counts: candidate.relation_type_counts ?? {},
    source_refs: compactObject(candidate.source_refs),
  };
}

function compactRelationPath(pathItem) {
  return {
    path_ref: pathItem.path_ref,
    depth: pathItem.depth,
    from: compactPathNode(pathItem.from),
    relation_type: pathItem.relation_type,
    relation_state: pathItem.relation_state,
    directed: Boolean(pathItem.directed),
    direction_from_selected: pathItem.direction_from_selected ?? "unknown",
    to: compactPathNode(pathItem.to),
    source_refs: compactObject(pathItem.source_refs),
    evidence_event_count: pathItem.evidence_event_count ?? 0,
    claim_ceiling_hint: pathItem.claim_ceiling_hint ?? "unknown",
  };
}

function compactPathNode(node) {
  if (!node) return null;
  return {
    node_ref: node.node_ref,
    label: node.label,
    node_type: node.node_type,
    claim_ceiling: node.claim_ceiling ?? "unknown",
  };
}

function compactSourceRef(sourceRef) {
  return {
    ref: sourceRef.ref,
    ref_type: sourceRef.ref_type ?? "repo_metadata_ref",
    roles: sourceRef.roles ?? [],
    referenced_by: sourceRef.referenced_by ?? [],
  };
}

function compactCodedItem(item) {
  return {
    code: item.code,
    label: item.label,
    related_refs: item.related_refs ?? [],
  };
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, child]) => child !== null && child !== undefined));
}
