import path from "node:path";
import { buildKnowledgeGraph, KNOWLEDGE_GRAPH_SCHEMA_VERSION } from "./graph_export.mjs";
import { normalizeRepoPath, pathExists, readJson } from "../shared/io.mjs";

export const RETRIEVAL_PLAN_SCHEMA_VERSION = "soulforge.knowledge_graph_retrieval_plan.v0";

const DEFAULT_EXPORT_ID = "knowledge_graph_view_v0";
const DEFAULT_GRAPH_ROOT = "_workspaces/system/knowledge_view/graph_export";
const STRONG_MATCH_THRESHOLD = 6;
const SELECTED_NODE_SCORE = 100;

export async function buildRetrievalPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  const selectedNodeRef = normalizeOptionalRef(options.nodeRef);
  if (!question && !selectedNodeRef) {
    throw new Error("retrieval plan requires --question or --node-ref");
  }

  const graphLoad = await loadGraph({ repoRoot, graphRef: options.graphRef, exportId: options.exportId });
  const graph = graphLoad.graph;
  validateGraphBoundary(graph);

  const nodeByRef = new Map((graph.nodes ?? []).map((node) => [node.node_ref, node]));
  const selectedNode = selectedNodeRef ? nodeByRef.get(selectedNodeRef) : null;
  if (selectedNodeRef && !selectedNode) {
    throw new Error(`selected --node-ref was not found in graph: ${selectedNodeRef}`);
  }
  const query = analyzeQuestion(question || selectedNode?.label || selectedNodeRef);
  const maxNodes = clampInteger(options.maxNodes ?? 8, 1, 50);
  const maxPaths = clampInteger(options.maxPaths ?? 12, 0, 100);
  const maxSourceRefs = clampInteger(options.maxSourceRefs ?? 20, 0, 200);
  const scoredNodes = scoreNodes(graph.nodes ?? [], query, selectedNodeRef);
  const candidates = scoredNodes.slice(0, maxNodes).map((item) => formatCandidate(item, graph.edges ?? []));
  const relationSeedRefs = selectedNodeRef ? new Set([selectedNodeRef]) : new Set(candidates.map((candidate) => candidate.node_ref));
  const relationPaths = buildRelationPaths({ edges: graph.edges ?? [], nodeByRef, candidateRefs: relationSeedRefs, maxPaths });
  const sourceRefs = collectSourceRefs(candidates, relationPaths, maxSourceRefs);
  const missingEvidenceItems = buildMissingEvidenceItems({ graph, query, candidates, relationPaths, selectedNodeRef });
  const missingEvidence = missingEvidenceItems.map((item) => item.label);
  const nextActionItems = buildNextActionItems({ missingEvidenceItems, candidates, selectedNodeRef });
  const nextActions = nextActionItems.map((item) => item.label);
  const selectedCandidate = selectedNodeRef
    ? candidates.find((candidate) => candidate.node_ref === selectedNodeRef) ??
      formatCandidate({ node: selectedNode, score: SELECTED_NODE_SCORE, reasons: ["selected:node_ref"] }, graph.edges ?? [])
    : null;
  const detectionCard = buildDetectionCard({
    selectedNode: selectedCandidate,
    candidates,
    relationPaths,
    sourceRefs,
    missingEvidence,
    nextActions,
  });

  return {
    schema_version: RETRIEVAL_PLAN_SCHEMA_VERSION,
    kind: "knowledge_graph_retrieval_plan",
    status: "metadata_only",
    generated_at_utc: new Date().toISOString(),
    graph_ref: graphLoad.graphRef,
    graph_loaded_from: graphLoad.loadedFrom,
    question: {
      text: question,
      tokens: [...query.tokens],
      detected_modes: query.detectedModes,
    },
    display: {
      mode: selectedNodeRef ? "selected_node" : "question",
      title: detectionCard.title,
      subtitle: selectedNodeRef ? "선택 노드 기준 metadata-only 탐지" : "질문 기준 metadata-only 탐지",
    },
    selected_node_ref: selectedNodeRef,
    selected_node: selectedCandidate,
    input: {
      question_text: question,
      selected_node_ref: selectedNodeRef,
      max_nodes: maxNodes,
      max_paths: maxPaths,
      max_source_refs: maxSourceRefs,
    },
    boundary: {
      metadata_only: true,
      no_answer_generated: true,
      no_source_text_loaded: true,
      no_vector_search: true,
      no_notebooklm_answers: true,
      no_private_payloads: true,
      no_canon_or_ontology_mutation: true,
      plan_is_navigation_signal_not_truth: true,
    },
    candidate_nodes: candidates,
    candidates,
    relation_paths: relationPaths,
    source_refs: sourceRefs,
    missing_evidence: missingEvidence,
    missing_evidence_items: missingEvidenceItems,
    next_actions: nextActions,
    next_action_items: nextActionItems,
    detection_card: detectionCard,
  };
}

async function loadGraph({ repoRoot, graphRef, exportId }) {
  const safeGraphRef = graphRef
    ? safeRepoRelativePath(graphRef)
    : normalizeRepoPath(path.join(DEFAULT_GRAPH_ROOT, normalizeExportId(exportId ?? DEFAULT_EXPORT_ID), "graph.json"));
  const graphPath = path.join(repoRoot, safeGraphRef);
  if (await pathExists(graphPath)) {
    return {
      graph: await readJson(graphPath),
      graphRef: safeGraphRef,
      loadedFrom: "generated_graph_json",
    };
  }
  if (graphRef) {
    throw new Error(`explicit --graph-ref was not found: ${safeGraphRef}`);
  }

  const graph = await buildKnowledgeGraph({
    repoRoot,
    exportId: normalizeExportId(exportId ?? DEFAULT_EXPORT_ID),
  });
  return {
    graph,
    graphRef: `in_memory:${graph.export_id}`,
    loadedFrom: "in_memory_export",
  };
}

function validateGraphBoundary(graph) {
  if (graph?.schema_version !== KNOWLEDGE_GRAPH_SCHEMA_VERSION) {
    throw new Error(`retrieval plan requires ${KNOWLEDGE_GRAPH_SCHEMA_VERSION} graph.json`);
  }
  if (graph?.boundary?.metadata_only !== true || graph?.graph_scope?.metadata_only !== true) {
    throw new Error("retrieval plan only accepts metadata-only knowledge graph exports");
  }
}

function analyzeQuestion(question) {
  const tokens = tokenize(question);
  const detectedModes = [];
  if (hasAny(tokens, ["source", "sources", "evidence", "citation", "provenance", "claim", "claims", "출처", "근거"])) {
    detectedModes.push("evidence_review");
  }
  if (hasAny(tokens, ["global", "overall", "summary", "summarize", "theme", "themes", "pattern", "patterns", "corpus", "전체", "요약"])) {
    detectedModes.push("global_synthesis");
  }
  if (hasAny(tokens, ["multi", "hop", "multihop", "relationship", "relationships", "path", "between", "dependency", "연결", "관계", "경로"])) {
    detectedModes.push("multi_hop");
  }
  if (hasAny(tokens, ["local", "exact", "specific", "file", "chunk", "정확", "특정", "파일"])) {
    detectedModes.push("local_factual");
  }
  if (hasAny(tokens, ["graph", "rag", "graphrag", "vector", "hybrid", "retrieval", "검색"])) {
    detectedModes.push("graph_vector_comparison");
  }
  if (detectedModes.length === 0) {
    detectedModes.push("metadata_navigation");
  }
  return { tokens, detectedModes };
}

function scoreNodes(nodes, query, selectedNodeRef) {
  return nodes
    .map((node) => {
      const labelTokens = tokenize(node.label);
      const refTokens = tokenize(node.node_ref);
      const summaryTokens = tokenize(node.summary);
      const typeTokens = tokenize(node.node_type);
      const sourceRefTokens = tokenize(Object.values(node.source_refs ?? {}).filter(Boolean).join(" "));
      let score = 0;
      const reasons = [];
      if (selectedNodeRef && node.node_ref === selectedNodeRef) {
        score += SELECTED_NODE_SCORE;
        reasons.push("selected:node_ref");
      }
      for (const token of query.tokens) {
        if (labelTokens.has(token)) {
          score += 6;
          reasons.push(`label:${token}`);
        }
        if (refTokens.has(token)) {
          score += 4;
          reasons.push(`ref:${token}`);
        }
        if (summaryTokens.has(token)) {
          score += 3;
          reasons.push(`summary:${token}`);
        }
        if (sourceRefTokens.has(token)) {
          score += 2;
          reasons.push(`source_ref:${token}`);
        }
        if (typeTokens.has(token)) {
          score += 1;
          reasons.push(`type:${token}`);
        }
      }
      if (query.detectedModes.includes("graph_vector_comparison") && refTokens.has("graph") && refTokens.has("rag")) {
        score += 6;
        reasons.push("mode:graph_vector_comparison");
      }
      if (query.detectedModes.includes("evidence_review") && node.node_type === "knowledge") {
        score += 1;
        reasons.push("mode:evidence_review");
      }
      if (node.trust?.claim_ceiling === "source_supported") {
        score += 1;
        reasons.push("trust:source_supported");
      }
      return { node, score, reasons: [...new Set(reasons)] };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.node.node_ref.localeCompare(right.node.node_ref));
}

function formatCandidate(item, edges) {
  const connectedEdges = edges.filter((edge) => edge.from_ref === item.node.node_ref || edge.to_ref === item.node.node_ref);
  return {
    node_ref: item.node.node_ref,
    label: item.node.label,
    node_type: item.node.node_type,
    score: item.score,
    match_reasons: item.reasons,
    is_selected: item.reasons.includes("selected:node_ref"),
    claim_ceiling: item.node.trust?.claim_ceiling ?? "unknown",
    lifecycle_status: item.node.lifecycle?.status ?? "unknown",
    source_refs: compactSourceRefs(item.node.source_refs),
    visible_degree: connectedEdges.length,
    relation_type_counts: countBy(connectedEdges.map((edge) => edge.relation_type)),
  };
}

function buildRelationPaths({ edges, nodeByRef, candidateRefs, maxPaths }) {
  return edges
    .filter((edge) => candidateRefs.has(edge.from_ref) || candidateRefs.has(edge.to_ref))
    .map((edge) => {
      const fromNode = nodeByRef.get(edge.from_ref);
      const toNode = nodeByRef.get(edge.to_ref);
      return {
        path_ref: edge.edge_ref,
        depth: 1,
        from: formatPathNode(fromNode, edge.from_ref),
        relation_type: edge.relation_type,
        relation_state: edge.relation_state,
        directed: edge.directed,
        to: formatPathNode(toNode, edge.to_ref),
        source_refs: compactSourceRefs(edge.source_refs),
        evidence_event_count: edge.metrics?.evidence_event_count ?? 0,
        claim_ceiling_hint: weakestClaimCeiling([fromNode?.trust?.claim_ceiling, toNode?.trust?.claim_ceiling]),
      };
    })
    .sort((left, right) => {
      const evidenceDelta = right.evidence_event_count - left.evidence_event_count;
      if (evidenceDelta !== 0) return evidenceDelta;
      return left.path_ref.localeCompare(right.path_ref);
    })
    .slice(0, maxPaths);
}

function formatPathNode(node, fallbackRef) {
  return {
    node_ref: node?.node_ref ?? fallbackRef,
    label: node?.label ?? fallbackRef,
    node_type: node?.node_type ?? "unknown_node",
    claim_ceiling: node?.trust?.claim_ceiling ?? "unknown",
  };
}

function collectSourceRefs(candidates, relationPaths, maxSourceRefs) {
  const refs = new Map();
  for (const candidate of candidates) {
    for (const [role, value] of Object.entries(candidate.source_refs ?? {})) {
      addSourceRef(refs, value, role, candidate.node_ref);
    }
  }
  for (const pathItem of relationPaths) {
    for (const [role, value] of Object.entries(pathItem.source_refs ?? {})) {
      addSourceRef(refs, value, role, pathItem.path_ref);
    }
  }
  return [...refs.values()]
    .map((item) => ({
      ...item,
      roles: [...item.roles].sort(),
      referenced_by: [...item.referenced_by].sort(),
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref))
    .slice(0, maxSourceRefs);
}

function addSourceRef(refs, value, role, referencedBy) {
  if (!value || typeof value !== "string") return;
  const ref = value;
  const item =
    refs.get(ref) ??
    {
      ref,
      ref_type: ref.startsWith("http") ? "url" : "repo_metadata_ref",
      roles: new Set(),
      referenced_by: new Set(),
    };
  item.roles.add(role);
  item.referenced_by.add(referencedBy);
  refs.set(ref, item);
}

function buildMissingEvidenceItems({ graph, query, candidates, relationPaths, selectedNodeRef }) {
  const missing = [];
  const addMissing = (code, label, refs = []) => {
    missing.push({ code, label, related_refs: refs });
  };
  const selectedRefs = selectedNodeRef ? [selectedNodeRef] : [];
  const candidateRefs = candidates.map((candidate) => candidate.node_ref);
  const nodeTypes = new Set((graph.nodes ?? []).map((node) => node.node_type));
  const relationTypes = new Set((graph.edges ?? []).map((edge) => edge.relation_type));
  if (selectedNodeRef && relationPaths.length === 0) {
    addMissing(
      "selected_node_no_relation_paths",
      "Selected node has no relation paths in the current metadata graph, so the card can only show node-local metadata.",
      selectedRefs,
    );
  }
  if (candidates.length === 0 || candidates[0].score < STRONG_MATCH_THRESHOLD) {
    addMissing("no_strong_metadata_match", "No strong metadata node match was found for the question.", candidateRefs);
  }
  if (graph.graph_scope?.canon_only || (graph.graph_scope?.ledger_refs ?? []).length === 0) {
    addMissing(
      "no_knowledge_access_ledger_refs",
      "No explicit knowledge-access ledger refs are included, so usage and recency are navigation defaults only.",
    );
  }
  if (!nodeTypes.has("source") || !relationTypes.has("supports")) {
    addMissing(
      "no_source_support_edges",
      "No source nodes or `supports` edges are present, so the plan can point to metadata refs but not evidence-source support paths.",
    );
  }
  if (query.detectedModes.includes("graph_vector_comparison")) {
    addMissing(
      "no_vector_or_hybrid_retriever",
      "No vector/BM25 baseline, embedding index, graph traversal engine, or hybrid retriever is attached to this graph view.",
    );
  }
  if (query.detectedModes.includes("multi_hop") && relationPaths.length === 0) {
    addMissing("no_multi_hop_relation_match", "No relation path matched the candidate nodes for multi-hop inspection.", candidateRefs);
  }
  if (query.detectedModes.includes("multi_hop")) {
    addMissing("one_hop_paths_only", "Relation paths are one-hop metadata paths only; no query-time multi-hop path scoring is implemented.");
  }
  if (query.detectedModes.includes("global_synthesis")) {
    addMissing("no_global_summaries", "No GraphRAG-style community reports or map-reduce global summaries are generated.");
  }
  if (!nodeTypes.has("validation") && !relationTypes.has("validates")) {
    addMissing("no_validation_benchmark", "No validation or benchmark node is present for corpus-specific retrieval quality claims.");
  }
  return dedupeByCode(missing);
}

function dedupeByCode(items) {
  const byCode = new Map();
  for (const item of items) {
    if (!byCode.has(item.code)) {
      byCode.set(item.code, item);
    }
  }
  return [...byCode.values()];
}

function buildNextActionItems({ missingEvidenceItems, candidates, selectedNodeRef }) {
  const codes = new Set(missingEvidenceItems.map((item) => item.code));
  const actions = [];
  const addAction = (code, label, refs = []) => {
    actions.push({ code, label, related_refs: refs });
  };
  if (selectedNodeRef && codes.has("selected_node_no_relation_paths")) {
    addAction(
      "add_selected_node_relation_edges",
      "Add reviewed relation edges for the selected node before treating it as a connected evidence path.",
      [selectedNodeRef],
    );
  }
  if (codes.has("no_source_support_edges")) {
    addAction("add_source_support_edges", "Add public-safe `source` nodes plus `supports` or `derived_from` edges for reviewed source refs.");
  }
  if (codes.has("no_knowledge_access_ledger_refs")) {
    addAction("regenerate_with_ledger_refs", "Regenerate the graph with explicit knowledge-access ledger refs when usage or recency matters.");
  }
  if (codes.has("no_vector_or_hybrid_retriever")) {
    addAction("keep_metadata_only_until_sourcebound_retrieval", "Keep this command metadata-only; add a separate sourcebound retrieval workflow before any answer generation.");
  }
  if (candidates.length > 0) {
    addAction(
      "use_candidates_for_sourcebound_review",
      "Use the top candidate nodes and relation paths as the next sourcebound review scope.",
      candidates.map((candidate) => candidate.node_ref),
    );
  }
  return dedupeByCode(actions);
}

function buildDetectionCard({ selectedNode, candidates, relationPaths, sourceRefs, missingEvidence, nextActions }) {
  const focus = selectedNode ?? candidates[0] ?? null;
  return {
    title: focus ? `탐지 카드: ${focus.label}` : "탐지 카드",
    focus_node_ref: focus?.node_ref ?? null,
    focus_node_type: focus?.node_type ?? null,
    claim_ceiling: focus?.claim_ceiling ?? "unknown",
    summary: focus
      ? "Metadata-only graph detection card payload. Render this as navigation and review guidance, not as an answer."
      : "No candidate node was found for this retrieval plan.",
    counts: {
      candidate_nodes: candidates.length,
      relation_paths: relationPaths.length,
      source_refs: sourceRefs.length,
      missing_evidence: missingEvidence.length,
      next_actions: nextActions.length,
    },
    render_contract: {
      title_from: "detection_card.title",
      focus_from: "detection_card.focus_node_ref",
      candidates_from: "candidate_nodes",
      relation_paths_from: "relation_paths",
      source_refs_from: "source_refs",
      missing_evidence_from: "missing_evidence",
      missing_evidence_items_from: "missing_evidence_items",
      next_actions_from: "next_actions",
      next_action_items_from: "next_action_items",
    },
  };
}

function compactSourceRefs(sourceRefs) {
  return Object.fromEntries(Object.entries(sourceRefs ?? {}).filter(([, value]) => value !== null && value !== undefined));
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function weakestClaimCeiling(values) {
  const order = ["unknown", "rejected_or_blocked", "observed", "source_supported", "validated_private", "canon_candidate", "canon_entry"];
  const present = values.filter(Boolean);
  if (present.length === 0) return "unknown";
  return present.sort((left, right) => claimOrderIndex(left, order) - claimOrderIndex(right, order))[0] ?? "unknown";
}

function claimOrderIndex(value, order) {
  const index = order.indexOf(value);
  return index === -1 ? 0 : index;
}

function hasAny(tokens, candidates) {
  return candidates.some((candidate) => tokens.has(candidate));
}

function tokenize(value) {
  const text = normalizeSearchText(value);
  const matches = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = new Set(matches);
  const compact = text.replace(/[^\p{L}\p{N}]+/gu, "");
  if (compact.length >= 3 && matches.length <= 2) {
    tokens.add(compact);
  }
  for (const token of [...tokens]) {
    for (const expanded of expandToken(token)) {
      tokens.add(expanded);
    }
  }
  return new Set([...tokens].filter((token) => token.length >= 2));
}

function expandToken(token) {
  const expansions = {
    graphrag: ["graph", "rag"],
    multihop: ["multi", "hop"],
    sourcebound: ["source", "bound"],
    notebooklm: ["notebook", "lm"],
  };
  return expansions[token] ?? [];
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_/.:#?=&-]+/g, " ");
}

function normalizeOptionalRef(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function safeRepoRelativePath(value) {
  const raw = String(value);
  if (path.isAbsolute(raw)) {
    throw new Error("--graph-ref must be repo-relative");
  }
  const normalized = normalizeRepoPath(path.normalize(raw));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("--graph-ref must stay inside the repo");
  }
  return normalized;
}

function normalizeExportId(value) {
  return String(value ?? DEFAULT_EXPORT_ID).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}
