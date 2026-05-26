import crypto from "node:crypto";
import path from "node:path";
import { buildKnowledgeGraph, KNOWLEDGE_GRAPH_SCHEMA_VERSION } from "../knowledge_graph/graph_export.mjs";
import { normalizeRepoPath, pathExists, readJson, writeJson } from "../shared/io.mjs";

export const RAG_MANIFEST_SCHEMA_VERSION = "soulforge.rag_manifest.v0";
export const RAG_ANSWER_SCHEMA_VERSION = "soulforge.rag_answer.v0";
export const RAG_ANSWER_VALIDATION_SCHEMA_VERSION = "soulforge.rag_answer_validation.v0";
export const SOURCE_SLICE_CARD_SCHEMA_VERSION = "soulforge.source_slice_card.v0";
export const SOURCE_SLICE_CARD_SET_SCHEMA_VERSION = "soulforge.source_slice_card_set.v0";
export const SOURCE_SLICE_TRIAGE_REGISTER_SCHEMA_VERSION = "soulforge.source_slice_triage_register.v0";
export const SOURCE_SLICE_REVIEW_QUEUE_SCHEMA_VERSION = "soulforge.source_slice_review_queue.v0";
export const SOURCE_SLICE_DECISION_PACKET_SCHEMA_VERSION = "soulforge.source_slice_decision_packet.v0";
export const SOURCE_SLICE_OWNER_DECISION_RECORD_SCHEMA_VERSION = "soulforge.source_slice_owner_decision_record.v0";
export const RAG_METADATA_INDEX_SCHEMA_VERSION = "soulforge.rag_metadata_index.v0";
export const RAG_RETRIEVAL_TRACE_SCHEMA_VERSION = "soulforge.rag_retrieval_trace.v0";
export const RAG_RETRIEVAL_EVALUATION_SCHEMA_VERSION = "soulforge.rag_retrieval_evaluation.v0";
export const RAG_MANIFEST_GENERATOR_ID = "guild_hall.rag.manifest_generator.v0";
export const RAG_ANSWER_ENGINE_ID = "guild_hall.rag.metadata_answer_engine.v0";
export const RAG_INDEXED_ANSWER_ENGINE_ID = "guild_hall.rag.metadata_indexed_answer_engine.v0";
export const SOURCE_SLICE_CARD_GENERATOR_ID = "guild_hall.rag.source_slice_card_generator.v0";
export const SOURCE_SLICE_TRIAGE_REGISTER_GENERATOR_ID = "guild_hall.rag.source_slice_triage_register_generator.v0";
export const SOURCE_SLICE_REVIEW_QUEUE_GENERATOR_ID = "guild_hall.rag.source_slice_review_queue_generator.v0";
export const SOURCE_SLICE_DECISION_PACKET_GENERATOR_ID = "guild_hall.rag.source_slice_decision_packet_generator.v0";
export const SOURCE_SLICE_OWNER_DECISION_RECORD_GENERATOR_ID = "guild_hall.rag.source_slice_owner_decision_record_generator.v0";
export const RAG_METADATA_INDEX_GENERATOR_ID = "guild_hall.rag.metadata_index_generator.v0";
export const RAG_RETRIEVAL_TRACE_GENERATOR_ID = "guild_hall.rag.retrieval_trace_generator.v0";
export const RAG_RETRIEVAL_EVALUATION_GENERATOR_ID = "guild_hall.rag.retrieval_evaluation_generator.v0";

const DEFAULT_EXPORT_ID = "knowledge_graph_view_v0";
const DEFAULT_GRAPH_ROOT = "_workspaces/system/knowledge_view/graph_export";
const DEFAULT_MANIFEST_ROOT = "_workspaces/system/rag/manifests";
const DEFAULT_SOURCE_SLICE_ROOT = "_workspaces/system/rag/source_slice_cards";
const DEFAULT_SOURCE_SLICE_TRIAGE_REGISTER_ROOT = "_workmeta/system/reports/rag/source_slice_triage_register";
const DEFAULT_SOURCE_SLICE_REVIEW_QUEUE_ROOT = "_workmeta/system/reports/rag/source_slice_review_queue";
const DEFAULT_SOURCE_SLICE_DECISION_PACKET_ROOT = "_workmeta/system/reports/rag/source_slice_decision_packets";
const DEFAULT_SOURCE_SLICE_OWNER_DECISION_ROOT = "_workmeta/system/reports/rag/source_slice_owner_decisions";
const DEFAULT_METADATA_INDEX_ROOT = "_workspaces/system/rag/metadata_retrieval_indexes";
const DEFAULT_RETRIEVAL_TRACE_ROOT = "_workmeta/system/reports/rag/retrieval_traces";
const DEFAULT_RETRIEVAL_EVALUATION_ROOT = "_workmeta/system/reports/rag/retrieval_evaluations";
const MIN_ANSWER_SCORE = 4;
const MIN_ANSWER_MATCH_REASONS = 1;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const TOKEN_FINGERPRINT_PATTERN = /^[a-f0-9]{32}$/i;
const RAG_ANSWER_ALLOWED_KEYS = new Set([
  "schema_version",
  "kind",
  "status",
  "generated_at_utc",
  "engine_id",
  "question_fingerprint",
  "query_token_count",
  "query_token_fingerprints",
  "raw_question_persisted",
  "answer",
  "manifest_ref",
  "manifest_id",
  "metadata_index_ref",
  "index_id",
  "claim_ceiling",
  "validation",
  "retrieval_trace",
  "retrieved_units",
  "citations",
  "boundary",
]);
const RAG_ANSWER_STATUSES = new Set([
  "blocked",
  "blocked_insufficient_manifest_evidence",
  "blocked_insufficient_metadata_index_evidence",
  "metadata_only_answer",
  "metadata_index_answer",
]);
const RAG_ANSWER_CLAIM_CEILINGS = new Set(["observed", "source_supported", "validated_private", "rejected_or_blocked"]);
const RAG_ANSWER_BOUNDARY_KEYS = new Set([
  "metadata_only",
  "no_source_text_loaded",
  "no_vector_search",
  "no_notebooklm_answers",
  "no_private_payloads",
  "no_canon_or_ontology_mutation",
  "answer_is_navigation_signal_not_source_truth",
  "metadata_index_only",
]);
const STOPWORD_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "manifest",
  "metadata",
  "mvp",
  "of",
  "on",
  "or",
  "query",
  "rag",
  "search",
  "source",
  "support",
  "the",
  "to",
  "what",
  "with",
  "검색",
  "근거",
  "자료",
  "질문",
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_text",
  "content",
  "excerpt",
  "html",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "payload",
  "private_payload",
  "raw",
  "raw_payload",
  "secret",
  "source_body",
  "source_text",
  "text",
]);
const FORBIDDEN_SOURCE_SLICE_KEYS = new Set([
  ...FORBIDDEN_PAYLOAD_KEYS,
  "bm25",
  "bm25_index",
  "bm25_payload",
  "bm25_terms",
  "embedding",
  "embeddings",
  "index_payload",
  "offsets",
  "source_text",
  "token_offsets",
  "vector",
  "vector_index",
  "vector_payload",
  "vectors",
]);
const FORBIDDEN_RAG_MANIFEST_INDEX_KEYS = new Set([
  "bm25_index",
  "bm25_terms",
  "embedding_index",
  "lexical_index",
  "metadata_lexical_index",
  "postings",
  "term_frequencies",
  "terms",
  "token_frequencies",
  "token_postings",
  "vector_index",
]);
const FORBIDDEN_METADATA_RETRIEVAL_KEYS = new Set([
  "answer",
  "question",
  "raw_query",
  "source_handles",
  "source_locator_ref",
  "storage_locator",
  "token",
  "token_frequencies",
]);
const FORBIDDEN_RAG_ANSWER_KEYS = new Set([
  "body",
  "body_html",
  "body_text",
  "chunk",
  "chunk_payload",
  "chunk_text",
  "chunks",
  "content",
  "conversation_id",
  "html",
  "mail_body",
  "notebooklm_answer",
  "notebooklm_answer_text",
  "notebooklm_conversation_id",
  "notebooklm_question",
  "notebooklm_response",
  "notebooklm_output",
  "payload",
  "private_payload",
  "question",
  "question_text",
  "query",
  "query_text",
  "raw",
  "raw_payload",
  "raw_question",
  "raw_query",
  "source_body",
  "source_chunk",
  "source_chunks",
  "source_content",
  "source_payload",
  "source_text",
  "text",
  "user_query",
  "user_question",
]);
const SECRET_LIKE_KEYS = new Set([
  "access_token",
  "api_key",
  "authorization",
  "bearer_token",
  "client_secret",
  "cookie",
  "credential",
  "credentials",
  "id_token",
  "password",
  "passwd",
  "private_key",
  "refresh_token",
  "secret",
  "session",
  "token",
]);
const SOURCE_SLICE_ALLOWED_KEYS = new Set([
  "allowed_for_index_build",
  "allowed_for_source_text_retrieval",
  "answer_synthesis_status",
  "blocker_codes",
  "blockers",
  "boundary",
  "bm25_index_included",
  "bm25_index_status",
  "card_count",
  "card_payload_level",
  "card_schema_version",
  "cards",
  "cards_are_not_answers",
  "cards_are_not_indexes",
  "chunk_payloads_included",
  "chunking_status",
  "claim_ceiling",
  "counts",
  "covered_graph_node_count",
  "covered_graph_node_refs",
  "covered_retrieval_unit_count",
  "embeddings_included",
  "evaluation_status",
  "excerpts_included",
  "generated_at_utc",
  "generator_id",
  "graph_ref",
  "index_not_built",
  "index_readiness",
  "kind",
  "manifest_id",
  "manifest_ref",
  "metadata_fingerprint",
  "metadata_card_ready_index_blocked",
  "metadata_card_ready_owner_approval_required",
  "metadata_only",
  "next_owner_action",
  "notebooklm_answers_included",
  "owner_approval",
  "owner_source_slice_approval_required",
  "packet_map_refs",
  "payload_state",
  "planned_processing",
  "purpose",
  "readiness_counts",
  "retrieval_trace_status",
  "runtime_absolute_paths_included",
  "schema_version",
  "secrets_or_session_included",
  "sensitivity",
  "slice_policy",
  "slice_set_id",
  "source_access",
  "source_class",
  "source_count",
  "source_handle",
  "source_hash",
  "source_kind",
  "source_ledger_refs",
  "source_locator_ref",
  "source_payloads_included",
  "source_refs",
  "source_slice_ref",
  "source_text_access",
  "source_text_loaded",
  "source_text_not_loaded",
  "status",
  "validation",
  "blocked_unsafe_source_locator",
  "vector_index_included",
  "vector_index_status",
  "warehouse_state",
]);
const SOURCE_SLICE_V0_INDEX_READINESS_STATUSES = new Set([
  "blocked_unsafe_source_locator",
  "metadata_card_ready_index_blocked",
  "metadata_card_ready_owner_approval_required",
]);
const SOURCE_SLICE_V0_REQUIRED_BLOCKER_CODES = [
  "index_not_built",
  "owner_source_slice_approval_required",
  "source_text_not_loaded",
];
const SOURCE_SLICE_TRIAGE_REGISTER_ALLOWED_KEYS = new Set([
  "accepted_for_metadata_knowledge",
  "allowed_for_index_build",
  "allowed_for_notebooklm_packet",
  "allowed_for_rag_metadata_answer",
  "allowed_for_source_text_retrieval",
  "applied_owner_decision",
  "auto_register_passed_metadata",
  "blocked_count",
  "blocked_items",
  "blocked_unsafe_source_locator",
  "blocker_codes",
  "blockers",
  "boundary",
  "boundary_contract",
  "card_count",
  "card_metadata_fingerprint",
  "card_status",
  "claim_ceiling",
  "claim_ceiling_counts",
  "counts",
  "covered_graph_node_count",
  "covered_graph_node_refs",
  "criteria_failed",
  "criteria_passed",
  "criteria_result",
  "draft",
  "evidence_refs",
  "generated_at_utc",
  "generator_id",
  "graph_ref",
  "grants",
  "hold_candidate",
  "index_build_allowed",
  "index_build",
  "kind",
  "manifest_id",
  "manifest_ref",
  "metadata_fingerprint",
  "metadata_knowledge",
  "metadata_knowledge_registration_allowed",
  "metadata_only",
  "notebooklm_packet",
  "notebooklm_answers_included",
  "notebooklm_packet_membership_allowed",
  "owner_defined_criteria_are_policy",
  "owner_approval_observed",
  "owner_review_count",
  "owner_review_items",
  "owner_review_required",
  "policy_ref",
  "project_private_metadata",
  "private_metadata_only",
  "public_canon",
  "public_canon_promotion_allowed",
  "public_safe_metadata",
  "purpose",
  "rag_metadata_knowledge_only",
  "register_applies_no_source_text_decisions",
  "register_id",
  "register_is_not_owner_approval",
  "registered_count",
  "registered_items",
  "registered_metadata_knowledge",
  "registration_scope",
  "rejected_or_unclear",
  "result",
  "route",
  "route_counts",
  "runtime_absolute_paths_included",
  "schema_version",
  "secrets_or_session_included",
  "sensitivity",
  "sensitivity_counts",
  "slice_set_id",
  "source_class",
  "source_handle",
  "source_hash",
  "source_kind",
  "source_locator_ref",
  "source_payloads_included",
  "source_policy_ref",
  "source_text_retrieval",
  "source_refs",
  "source_slice_ref",
  "source_text_retrieval_allowed",
  "standing_owner_policy",
  "stronger_permissions_default_false",
  "status",
  "triage_item_ref",
  "triage_register_ref",
  "triage_policy",
  "validation",
  "warehouse_state",
  "observed",
  "source_supported",
  "validated_private",
  "canon_candidate",
  "canon_entry",
  "rejected_or_blocked",
]);
const FORBIDDEN_SOURCE_SLICE_TRIAGE_REGISTER_KEYS = new Set([
  ...FORBIDDEN_SOURCE_SLICE_KEYS,
  "approval_granted",
  "approved_at",
  "approved_by",
  "chunk_ref",
  "index_ref",
  "ready_for_index",
  "source_text_ref",
]);
const SOURCE_SLICE_TRIAGE_REGISTER_STATUSES = new Set(["draft", "ready_for_curation", "blocked"]);
const SOURCE_SLICE_METADATA_KNOWLEDGE_OWNER_APPROVAL_VALUES = new Set([
  "public_canon_or_explicit_metadata",
  "owner_approved",
  "owner_approved_local",
  "accepted_for_bookshelf",
  "approved",
]);
const SOURCE_SLICE_METADATA_KNOWLEDGE_SOURCE_CLASSES = new Set([
  "metadata_only",
  "official_reference",
  "owner_approved",
  "public_reference",
  "project_source_packet",
]);
const SOURCE_SLICE_REVIEW_QUEUE_ALLOWED_KEYS = new Set([
  "allowed_next_actions",
  "applied_decision",
  "block_unsafe_source_locator",
  "blocked",
  "blocker_codes",
  "blockers",
  "boundary",
  "card_count",
  "card_metadata_fingerprint",
  "card_index_readiness_status",
  "card_status",
  "claim_ceiling",
  "counts",
  "covered_graph_node_count",
  "covered_graph_node_refs",
  "decision",
  "decision_counts",
  "draft",
  "generated_at_utc",
  "generator_id",
  "graph_ref",
  "index_build_allowed",
  "item_count",
  "items",
  "kind",
  "manifest_id",
  "manifest_ref",
  "metadata_fingerprint",
  "metadata_only",
  "none",
  "normal",
  "notebooklm_answers_included",
  "owner_approval_granted",
  "owner_approval_observed",
  "pending_owner_review",
  "private",
  "private_metadata_only",
  "private_review_required",
  "priority_counts",
  "project_private_metadata",
  "public_safe_metadata",
  "purpose",
  "queue_applies_no_decisions",
  "queue_id",
  "queue_is_not_owner_approval",
  "recommended_decision",
  "register_id",
  "required_evidence_refs",
  "review_item_ref",
  "review_policy",
  "review_priority",
  "review_required",
  "runtime_absolute_paths_included",
  "schema_version",
  "secrets_or_session_included",
  "sensitivity",
  "sensitivity_counts",
  "slice_set_id",
  "source_handle",
  "source_locator_ref",
  "source_payloads_included",
  "source_refs",
  "source_slice_ref",
  "source_text_retrieval_allowed",
  "status",
  "triage_blocked_unsafe_source_locator",
  "triage_item_ref",
  "triage_owner_review_required",
  "triage_register_ref",
  "triage_route",
  "validation",
]);
const FORBIDDEN_SOURCE_SLICE_REVIEW_QUEUE_KEYS = new Set([
  ...FORBIDDEN_SOURCE_SLICE_KEYS,
  "approval_granted",
  "approved",
  "approved_at",
  "approved_by",
  "chunk_ref",
  "index_ref",
  "ready_for_index",
  "source_text_ref",
]);
const SOURCE_SLICE_REVIEW_QUEUE_STATUSES = new Set(["draft", "ready_for_owner_review", "blocked"]);
const SOURCE_SLICE_DECISION_PACKET_ALLOWED_KEYS = new Set([
  "allowed_next_actions",
  "allowed_owner_decisions",
  "applied_decision",
  "block_unsafe_source_locator",
  "blocked_count",
  "blocker_codes",
  "blockers",
  "boundary",
  "card_metadata_fingerprint",
  "claim_ceiling",
  "counts",
  "covered_graph_node_count",
  "covered_graph_node_refs",
  "current_rag_metadata_answer_allowed",
  "current_registration_scope",
  "decision_item_count",
  "decision_item_ref",
  "decision_policy",
  "decision_route",
  "decision_route_counts",
  "default_decision",
  "downstream_if_owner_approves",
  "generated_at_utc",
  "generator_id",
  "graph_ref",
  "hold",
  "index_build",
  "index_build_allowed",
  "items",
  "keep_metadata_only",
  "kind",
  "manifest_id",
  "manifest_ref",
  "metadata_fingerprint",
  "metadata_only",
  "metadata_registered_count",
  "notebooklm_packet",
  "notebooklm_packet_allowed",
  "notebooklm_answers_included",
  "notebooklm_packet_membership_allowed",
  "owner_decision_applied",
  "owner_decision_ref",
  "owner_review_count",
  "owner_review_required",
  "packet_applies_no_decisions",
  "packet_id",
  "packet_is_not_owner_approval",
  "pending_decision",
  "pending_owner_decision",
  "project_private_metadata",
  "public_canon",
  "public_canon_promotion_allowed",
  "public_safe_metadata",
  "purpose",
  "queue_id",
  "register_id",
  "registered_metadata_stronger_permission_review",
  "review_queue_ref",
  "required_evidence_refs",
  "requires_explicit_owner_input",
  "runtime_absolute_paths_included",
  "schema_version",
  "secrets_or_session_included",
  "sensitivity",
  "sensitivity_counts",
  "slice_set_id",
  "source_handle",
  "source_locator_ref",
  "source_payloads_included",
  "source_refs",
  "source_slice_count",
  "source_slice_ref",
  "source_text_retrieval",
  "source_text_retrieval_allowed",
  "status",
  "stronger_permission_request_count",
  "stronger_permissions_default_false",
  "triage_register_ref",
  "blocked_unsafe_source_locator",
  "private_metadata_only",
  "unknown",
  "validation",
]);
const FORBIDDEN_SOURCE_SLICE_DECISION_PACKET_KEYS = new Set([
  ...FORBIDDEN_SOURCE_SLICE_KEYS,
  "approval_granted",
  "approved",
  "approved_at",
  "approved_by",
  "chunk_ref",
  "index_ref",
  "ready_for_index",
  "source_text_ref",
]);
const SOURCE_SLICE_DECISION_PACKET_STATUSES = new Set(["pending_owner_decision", "blocked"]);
const SOURCE_SLICE_DECISION_ROUTES = new Set([
  "registered_metadata_stronger_permission_review",
  "owner_review_required",
  "blocked_unsafe_source_locator",
]);
const SOURCE_SLICE_PENDING_DECISIONS = new Set([
  "keep_metadata_only",
  "hold_for_owner_review",
  "block_unsafe_source_locator",
]);
const DEFAULT_LENS_PROFILES = [
  {
    lens_id: "rag_knowledge_readiness",
    title: "RAG Knowledge Readiness",
    purpose: "Show metadata-only source, claim, graph, and retrieval readiness.",
    node_types: ["knowledge", "source", "concept", "validation", "workflow", "party"],
    relation_types: ["supports", "derived_from", "uses", "requires_owner_decision", "chains", "routes_to"],
  },
  {
    lens_id: "project_stage_gap",
    title: "Project Stage Gap",
    purpose: "Show project, stage, source, artifact, and owner-decision gaps when project metadata is supplied.",
    node_types: ["project", "mission", "artifact", "source", "knowledge", "validation"],
    relation_types: ["consumes", "produces", "supports", "requires_owner_decision", "routes_to"],
  },
  {
    lens_id: "workload_bottleneck",
    title: "Workload Bottleneck",
    purpose: "Show metadata-only workload and route bottleneck signals after workload_event data exists.",
    node_types: ["project", "mission", "workflow", "party", "agent_run", "validation", "artifact"],
    relation_types: ["uses", "routes_to", "validates", "requires_owner_decision", "produces"],
  },
  {
    lens_id: "soulforge_balance",
    title: "Soulforge Balance",
    purpose: "Show whole-system balance across canon, workflow, party, unit, model, and knowledge surfaces.",
    node_types: [
      "knowledge",
      "project",
      "workflow",
      "party",
      "mission",
      "species",
      "class",
      "unit",
      "model_profile",
      "agent_surface",
      "validation",
      "artifact",
    ],
    relation_types: ["uses", "recommends", "routes_to", "chains", "has_species", "has_class", "validates"],
  },
];

const CLAIM_STRENGTH = {
  unknown: 0,
  rejected_or_blocked: 0,
  observed: 1,
  source_supported: 2,
  validated_private: 3,
  canon_candidate: 4,
  canon_entry: 5,
};

export async function buildRagManifest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const generatedAtUtc = formatTimestampUtc(options.now);
  const graphLoad = await loadGraph({ repoRoot, graphRef: options.graphRef, exportId: options.exportId, now: options.now });
  validateMetadataGraph(graphLoad.graph);
  const graph = graphLoad.graph;

  const sourceByLocator = collectMetadataSources(graph);
  const retrievalUnits = buildRetrievalUnits(graph, sourceByLocator);
  const graphBindings = buildGraphBindings(graph);
  const manifestId = normalizeManifestId(options.manifestId ?? `rag_manifest_${graph.export_id ?? DEFAULT_EXPORT_ID}`);

  return {
    schema_version: RAG_MANIFEST_SCHEMA_VERSION,
    kind: "rag_manifest",
    status: "draft",
    manifest_id: manifestId,
    generator_id: RAG_MANIFEST_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    scope: {
      owner_surface: "guild_hall/rag",
      project_code: null,
      allowed_use: "metadata_navigation",
      source_surfaces: sourceSurfacesForManifest(graph),
      lens_profile_ids: DEFAULT_LENS_PROFILES.map((profile) => profile.lens_id),
    },
    source_refs: {
      graph_ref: graphLoad.graphRef,
      graph_loaded_from: graphLoad.loadedFrom,
      snapshot_ref: null,
      source_ledger_refs: [],
      packet_map_refs: [],
      knowledge_access_ledger_refs: graph.graph_scope?.ledger_refs ?? [],
    },
    freshness: {
      graph_export_id: graph.export_id ?? null,
      graph_generated_at_utc: graph.generated_at_utc ?? null,
      graph_source_hash: stableHash({
        schema_version: graph.schema_version,
        export_id: graph.export_id,
        generated_at_utc: graph.generated_at_utc,
        node_refs: (graph.nodes ?? []).map((node) => node.node_ref).sort(),
        edge_refs: (graph.edges ?? []).map((edge) => edge.edge_ref).sort(),
      }),
      snapshot_source_observations_fingerprint: null,
    },
    boundary: {
      metadata_only: true,
      source_payloads_included: false,
      chunk_text_included: false,
      node_metadata_included: true,
      notebooklm_answers_included: false,
      secrets_or_session_included: false,
      runtime_absolute_paths_included: false,
      answer_generation_allowed: "metadata_only",
    },
    lens_profiles: DEFAULT_LENS_PROFILES,
    sources: [...sourceByLocator.values()].sort((left, right) => left.source_handle.localeCompare(right.source_handle)),
    retrieval_units: retrievalUnits,
    graph_bindings: graphBindings,
    indexes: [],
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeRagManifest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const manifest = await buildRagManifest(options);
  const outputRef =
    options.outputRef ??
    normalizeRepoPath(path.join(DEFAULT_MANIFEST_ROOT, manifest.manifest_id, "rag_manifest.json"));
  const outputPath = path.join(repoRoot, safeRagOutputPath(outputRef));
  await writeJson(outputPath, manifest);
  return {
    status: "written",
    manifest_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    manifest_id: manifest.manifest_id,
    source_count: manifest.sources.length,
    retrieval_unit_count: manifest.retrieval_units.length,
    graph_binding_count: manifest.graph_bindings.length,
  };
}

export async function loadRagManifest({ repoRoot = process.cwd(), manifestRef } = {}) {
  if (!manifestRef) {
    throw new Error("manifest_ref_required");
  }
  const root = path.resolve(repoRoot);
  const manifestPath = path.join(root, safeRepoRelativePath(manifestRef));
  return readJson(manifestPath);
}

export async function buildSourceSliceCards(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const manifest = options.manifest ?? (options.manifestRef
    ? await loadRagManifest({ repoRoot, manifestRef: options.manifestRef })
    : await buildRagManifest(options));
  const manifestValidation = validateRagManifest(manifest);
  if (manifestValidation.status !== "pass") {
    throw new Error(`source_slice_cards_require_valid_manifest:${manifestValidation.blockers.join(",")}`);
  }
  const generatedAtUtc = formatTimestampUtc(options.now);
  const sliceSetId = normalizeSourceSliceSetId(options.sliceSetId ?? `source_slices_${manifest.manifest_id}`);
  const unitsBySourceHandle = unitsBySourceHandleFromManifest(manifest);
  const cards = (manifest.sources ?? [])
    .map((source) => buildSourceSliceCard({ source, units: unitsBySourceHandle.get(source.source_handle) ?? [] }))
    .sort((left, right) => left.source_slice_ref.localeCompare(right.source_slice_ref));
  const readinessCounts = countBy(cards.map((card) => card.index_readiness.status));

  return {
    schema_version: SOURCE_SLICE_CARD_SET_SCHEMA_VERSION,
    kind: "source_slice_card_set",
    status: "draft",
    slice_set_id: sliceSetId,
    generator_id: SOURCE_SLICE_CARD_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      manifest_ref: options.manifestRef ?? null,
      manifest_id: manifest.manifest_id,
      graph_ref: manifest.source_refs?.graph_ref ?? null,
      source_ledger_refs: manifest.source_refs?.source_ledger_refs ?? [],
      packet_map_refs: manifest.source_refs?.packet_map_refs ?? [],
    },
    boundary: sourceSliceBoundary(),
    slice_policy: {
      purpose: "pre_index_source_slice_readiness",
      card_payload_level: "metadata_only",
      source_text_access: "not_requested",
      chunking_status: "not_started",
      bm25_index_status: "not_started",
      vector_index_status: "not_started",
      retrieval_trace_status: "not_started",
      answer_synthesis_status: "not_started",
    },
    counts: {
      source_count: manifest.sources.length,
      card_count: cards.length,
      covered_retrieval_unit_count: [...unitsBySourceHandle.values()].reduce((total, units) => total + units.length, 0),
      readiness_counts: readinessCounts,
    },
    cards,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceSliceCards(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const cardSet = await buildSourceSliceCards(options);
  const outputRef =
    options.outputRef ??
    defaultSourceSliceOutputRef({ cardSet, projectCode: options.projectCode });
  if (sourceSliceCardSetRequiresPrivateOutput(cardSet) && outputRef.startsWith(`${DEFAULT_SOURCE_SLICE_ROOT}/`)) {
    throw new Error("private source slice cards require _workmeta/<project_code>/reports/rag/source_slice_cards/ output");
  }
  const outputPath = path.join(repoRoot, safeSourceSliceOutputPath(outputRef));
  await writeJson(outputPath, cardSet);
  return {
    status: "written",
    source_slice_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    slice_set_id: cardSet.slice_set_id,
    card_count: cardSet.cards.length,
    readiness_counts: cardSet.counts.readiness_counts,
  };
}

export async function loadSourceSliceCards({ repoRoot = process.cwd(), sourceSliceRef } = {}) {
  if (!sourceSliceRef) {
    throw new Error("source_slice_ref_required");
  }
  const root = path.resolve(repoRoot);
  const cardSetPath = path.join(root, safeRepoRelativePath(sourceSliceRef));
  return readJson(cardSetPath);
}

export async function buildSourceSliceTriageRegister(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const cardSet = options.cardSet ?? await loadSourceSliceCards({ repoRoot, sourceSliceRef: options.sourceSliceRef });
  const cardValidation = validateSourceSliceCards(cardSet);
  if (cardValidation.status !== "pass") {
    throw new Error(`source_slice_triage_register_requires_valid_cards:${cardValidation.blockers.join(",")}`);
  }
  const generatedAtUtc = formatTimestampUtc(options.now);
  const registerId = normalizeSourceSliceTriageRegisterId(
    options.registerId ?? `source_slice_triage_${cardSet.slice_set_id}`,
  );
  const triageItems = (cardSet.cards ?? []).map(buildSourceSliceTriageItem).sort((left, right) => {
    const routeCompare = triageRouteRank(left.criteria_result.route) - triageRouteRank(right.criteria_result.route);
    return routeCompare || left.triage_item_ref.localeCompare(right.triage_item_ref);
  });
  const registeredItems = triageItems.filter((item) => item.criteria_result.route === "registered_metadata_knowledge");
  const ownerReviewItems = triageItems.filter((item) => item.criteria_result.route === "owner_review_required");
  const blockedItems = triageItems.filter((item) => item.criteria_result.route === "blocked_unsafe_source_locator");

  return {
    schema_version: SOURCE_SLICE_TRIAGE_REGISTER_SCHEMA_VERSION,
    kind: "source_slice_triage_register",
    status: "draft",
    register_id: registerId,
    generator_id: SOURCE_SLICE_TRIAGE_REGISTER_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      source_slice_ref: options.sourceSliceRef ?? null,
      slice_set_id: cardSet.slice_set_id,
      manifest_ref: cardSet.source_refs?.manifest_ref ?? null,
      manifest_id: cardSet.source_refs?.manifest_id ?? null,
      graph_ref: cardSet.source_refs?.graph_ref ?? null,
    },
    boundary: sourceSliceTriageRegisterBoundary(),
    triage_policy: {
      purpose: "apply_existing_wiki_intake_criteria_to_rag_metadata_knowledge",
      source_policy_ref: "docs/architecture/workspace/examples/llm_wiki_bookshelf/canonical_source_intake_checklist.md",
      standing_owner_policy: {
        policy_ref: "standing_owner_policy:rag_source_slice_metadata_v0",
        owner_defined_criteria_are_policy: true,
        auto_register_passed_metadata: true,
        stronger_permissions_default_false: true,
        grants: {
          metadata_knowledge: true,
          source_text_retrieval: false,
          index_build: false,
          notebooklm_packet: false,
          public_canon: false,
        },
      },
      metadata_knowledge_registration_allowed: true,
      register_is_not_owner_approval: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
    },
    counts: {
      card_count: cardSet.cards.length,
      registered_count: registeredItems.length,
      owner_review_count: ownerReviewItems.length,
      blocked_count: blockedItems.length,
      route_counts: countBy(triageItems.map((item) => item.criteria_result.route)),
      sensitivity_counts: countBy(triageItems.map((item) => item.sensitivity)),
      claim_ceiling_counts: countBy(triageItems.map((item) => item.claim_ceiling)),
    },
    registered_items: registeredItems,
    owner_review_items: ownerReviewItems,
    blocked_items: blockedItems,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceSliceTriageRegister(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const register = await buildSourceSliceTriageRegister(options);
  const outputRef =
    options.outputRef ??
    defaultSourceSliceTriageRegisterOutputRef({ register, projectCode: options.projectCode });
  if (
    sourceSliceTriageRegisterRequiresProjectOutput(register) &&
    outputRef.startsWith(`${DEFAULT_SOURCE_SLICE_TRIAGE_REGISTER_ROOT}/`)
  ) {
    throw new Error("private source slice triage register requires _workmeta/<project_code>/reports/rag/source_slice_triage_register/ output");
  }
  const outputPath = path.join(repoRoot, safeSourceSliceTriageRegisterOutputPath(outputRef));
  await writeJson(outputPath, register);
  return {
    status: "written",
    triage_register_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    register_id: register.register_id,
    registered_count: register.counts.registered_count,
    owner_review_count: register.counts.owner_review_count,
    blocked_count: register.counts.blocked_count,
    route_counts: register.counts.route_counts,
  };
}

export async function loadSourceSliceTriageRegister({ repoRoot = process.cwd(), triageRegisterRef } = {}) {
  if (!triageRegisterRef) {
    throw new Error("triage_register_ref_required");
  }
  const root = path.resolve(repoRoot);
  const registerPath = path.join(root, safeRepoRelativePath(triageRegisterRef));
  return readJson(registerPath);
}

export async function buildSourceSliceReviewQueue(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const triageRegister = options.triageRegister ?? (options.triageRegisterRef
    ? await loadSourceSliceTriageRegister({ repoRoot, triageRegisterRef: options.triageRegisterRef })
    : null);
  if (triageRegister) {
    const triageValidation = validateSourceSliceTriageRegister(triageRegister);
    if (triageValidation.status !== "pass") {
      throw new Error(`source_slice_review_queue_requires_valid_triage_register:${triageValidation.blockers.join(",")}`);
    }
  }
  const cardSet = triageRegister
    ? null
    : options.cardSet ?? await loadSourceSliceCards({ repoRoot, sourceSliceRef: options.sourceSliceRef });
  if (cardSet) {
    const cardValidation = validateSourceSliceCards(cardSet);
    if (cardValidation.status !== "pass") {
      throw new Error(`source_slice_review_queue_requires_valid_cards:${cardValidation.blockers.join(",")}`);
    }
  }
  const generatedAtUtc = formatTimestampUtc(options.now);
  const queueId = normalizeSourceSliceReviewQueueId(
    options.queueId ?? `source_slice_review_${triageRegister?.register_id ?? cardSet.slice_set_id}`,
  );
  const sourceItems = triageRegister
    ? [...(triageRegister.blocked_items ?? []), ...(triageRegister.owner_review_items ?? [])].map(buildSourceSliceReviewItemFromTriageItem)
    : (cardSet.cards ?? []).map(buildSourceSliceReviewItem);
  const items = sourceItems.sort((left, right) => {
    const priorityCompare = reviewPriorityRank(left.review_priority) - reviewPriorityRank(right.review_priority);
    return priorityCompare || left.review_item_ref.localeCompare(right.review_item_ref);
  });
  const cardCount = triageRegister
    ? triageRegister.counts?.card_count ?? (triageRegister.registered_items?.length ?? 0) + (triageRegister.owner_review_items?.length ?? 0) + (triageRegister.blocked_items?.length ?? 0)
    : cardSet.cards.length;

  return {
    schema_version: SOURCE_SLICE_REVIEW_QUEUE_SCHEMA_VERSION,
    kind: "source_slice_review_queue",
    status: "draft",
    queue_id: queueId,
    generator_id: SOURCE_SLICE_REVIEW_QUEUE_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      source_slice_ref: triageRegister ? triageRegister.source_refs?.source_slice_ref ?? null : options.sourceSliceRef ?? null,
      triage_register_ref: options.triageRegisterRef ?? null,
      register_id: triageRegister?.register_id ?? null,
      slice_set_id: triageRegister?.source_refs?.slice_set_id ?? cardSet?.slice_set_id ?? null,
      manifest_ref: triageRegister?.source_refs?.manifest_ref ?? cardSet?.source_refs?.manifest_ref ?? null,
      manifest_id: triageRegister?.source_refs?.manifest_id ?? cardSet?.source_refs?.manifest_id ?? null,
      graph_ref: triageRegister?.source_refs?.graph_ref ?? cardSet?.source_refs?.graph_ref ?? null,
    },
    boundary: sourceSliceReviewQueueBoundary(),
    review_policy: {
      purpose: triageRegister ? "owner_source_slice_decision_preparation_for_triage_holds" : "owner_source_slice_decision_preparation",
      metadata_only: true,
      queue_is_not_owner_approval: true,
      queue_applies_no_decisions: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      allowed_next_actions: ["owner_approve_hold_or_block"],
    },
    counts: {
      card_count: cardCount,
      item_count: items.length,
      decision_counts: countBy(items.map((item) => item.decision.recommended_decision)),
      sensitivity_counts: countBy(items.map((item) => item.sensitivity)),
      priority_counts: countBy(items.map((item) => item.review_priority)),
    },
    items,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceSliceReviewQueue(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const queue = await buildSourceSliceReviewQueue(options);
  const outputRef =
    options.outputRef ??
    defaultSourceSliceReviewQueueOutputRef({ queue, projectCode: options.projectCode });
  if (
    sourceSliceReviewQueueRequiresProjectOutput(queue) &&
    outputRef.startsWith(`${DEFAULT_SOURCE_SLICE_REVIEW_QUEUE_ROOT}/`)
  ) {
    throw new Error("private source slice review queue requires _workmeta/<project_code>/reports/rag/source_slice_review_queue/ output");
  }
  const outputPath = path.join(repoRoot, safeSourceSliceReviewQueueOutputPath(outputRef));
  await writeJson(outputPath, queue);
  return {
    status: "written",
    review_queue_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    queue_id: queue.queue_id,
    item_count: queue.items.length,
    decision_counts: queue.counts.decision_counts,
  };
}

export async function loadSourceSliceReviewQueue({ repoRoot = process.cwd(), reviewQueueRef } = {}) {
  if (!reviewQueueRef) {
    throw new Error("review_queue_ref_required");
  }
  const root = path.resolve(repoRoot);
  const queuePath = path.join(root, safeRepoRelativePath(reviewQueueRef));
  return readJson(queuePath);
}

export async function buildSourceSliceDecisionPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const triageRegister = options.triageRegister ?? (options.triageRegisterRef
    ? await loadSourceSliceTriageRegister({ repoRoot, triageRegisterRef: options.triageRegisterRef })
    : null);
  const reviewQueue = options.reviewQueue ?? (options.reviewQueueRef
    ? await loadSourceSliceReviewQueue({ repoRoot, reviewQueueRef: options.reviewQueueRef })
    : null);
  if (!triageRegister && !reviewQueue) {
    throw new Error("source_slice_decision_packet_requires_triage_register_or_review_queue");
  }
  if (triageRegister) {
    const triageValidation = validateSourceSliceTriageRegister(triageRegister);
    if (triageValidation.status !== "pass") {
      throw new Error(`source_slice_decision_packet_requires_valid_triage_register:${triageValidation.blockers.join(",")}`);
    }
  }
  if (reviewQueue) {
    const queueValidation = validateSourceSliceReviewQueue(reviewQueue);
    if (queueValidation.status !== "pass") {
      throw new Error(`source_slice_decision_packet_requires_valid_review_queue:${queueValidation.blockers.join(",")}`);
    }
  }

  const generatedAtUtc = formatTimestampUtc(options.now);
  const packetId = normalizeSourceSliceDecisionPacketId(
    options.packetId ?? `source_slice_decision_${triageRegister?.register_id ?? reviewQueue.queue_id}`,
  );
  const items = buildSourceSliceDecisionItems({ triageRegister, reviewQueue });
  const sourceRefs = {
    triage_register_ref: options.triageRegisterRef ?? null,
    review_queue_ref: options.reviewQueueRef ?? null,
    register_id: triageRegister?.register_id ?? reviewQueue?.source_refs?.register_id ?? null,
    queue_id: reviewQueue?.queue_id ?? null,
    source_slice_ref: triageRegister?.source_refs?.source_slice_ref ?? reviewQueue?.source_refs?.source_slice_ref ?? null,
    slice_set_id: triageRegister?.source_refs?.slice_set_id ?? reviewQueue?.source_refs?.slice_set_id ?? null,
    manifest_ref: triageRegister?.source_refs?.manifest_ref ?? reviewQueue?.source_refs?.manifest_ref ?? null,
    manifest_id: triageRegister?.source_refs?.manifest_id ?? reviewQueue?.source_refs?.manifest_id ?? null,
    graph_ref: triageRegister?.source_refs?.graph_ref ?? reviewQueue?.source_refs?.graph_ref ?? null,
  };

  return {
    schema_version: SOURCE_SLICE_DECISION_PACKET_SCHEMA_VERSION,
    kind: "source_slice_decision_packet",
    status: "pending_owner_decision",
    packet_id: packetId,
    generator_id: SOURCE_SLICE_DECISION_PACKET_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: sourceRefs,
    boundary: sourceSliceDecisionPacketBoundary(),
    decision_policy: {
      purpose: "prepare_owner_decision_before_source_text_retrieval_or_index_build",
      metadata_only: true,
      packet_is_not_owner_approval: true,
      packet_applies_no_decisions: true,
      stronger_permissions_default_false: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_membership_allowed: false,
      public_canon_promotion_allowed: false,
      allowed_owner_decisions: [
        "keep_metadata_only",
        "hold",
        "block_unsafe_source_locator",
        "source_text_retrieval",
        "index_build",
        "notebooklm_packet",
      ],
      requires_explicit_owner_input: [
        "source_text_retrieval",
        "index_build",
        "notebooklm_packet",
        "public_canon",
      ],
    },
    counts: {
      source_slice_count: items.length,
      decision_item_count: items.length,
      metadata_registered_count: items.filter((item) => item.decision_route === "registered_metadata_stronger_permission_review").length,
      owner_review_count: items.filter((item) => item.decision_route === "owner_review_required").length,
      blocked_count: items.filter((item) => item.decision_route === "blocked_unsafe_source_locator").length,
      stronger_permission_request_count: items.filter((item) => item.pending_decision.default_decision === "keep_metadata_only").length,
      decision_route_counts: countBy(items.map((item) => item.decision_route)),
      sensitivity_counts: countBy(items.map((item) => item.sensitivity)),
    },
    items,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceSliceDecisionPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const packet = await buildSourceSliceDecisionPacket(options);
  const outputRef =
    options.outputRef ??
    defaultSourceSliceDecisionPacketOutputRef({ packet, projectCode: options.projectCode });
  if (
    sourceSliceDecisionPacketRequiresProjectOutput(packet) &&
    outputRef.startsWith(`${DEFAULT_SOURCE_SLICE_DECISION_PACKET_ROOT}/`)
  ) {
    throw new Error("private source slice decision packet requires _workmeta/<project_code>/reports/rag/source_slice_decision_packets/ output");
  }
  const outputPath = path.join(repoRoot, safeSourceSliceDecisionPacketOutputPath(outputRef));
  await writeJson(outputPath, packet);
  return {
    status: "written",
    decision_packet_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    packet_id: packet.packet_id,
    decision_item_count: packet.items.length,
    decision_route_counts: packet.counts.decision_route_counts,
  };
}

export async function loadSourceSliceDecisionPacket({ repoRoot = process.cwd(), decisionPacketRef } = {}) {
  if (!decisionPacketRef) {
    throw new Error("decision_packet_ref_required");
  }
  const root = path.resolve(repoRoot);
  const packetPath = path.join(root, safeRepoRelativePath(decisionPacketRef));
  return readJson(packetPath);
}

export function validateSourceSliceDecisionPacket(packet) {
  const blockers = [];
  if (packet?.schema_version !== SOURCE_SLICE_DECISION_PACKET_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (packet?.kind !== "source_slice_decision_packet") {
    blockers.push("kind_must_be_source_slice_decision_packet");
  }
  if (!isSafeMetadataId(packet?.packet_id)) {
    blockers.push("packet_id_unsafe");
  }
  if (!SOURCE_SLICE_DECISION_PACKET_STATUSES.has(packet?.status)) {
    blockers.push("source_slice_decision_packet_status_unknown");
  }
  const boundary = packet?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.packet_is_not_owner_approval !== true) blockers.push("packet_must_not_be_owner_approval");
  if (boundary.packet_applies_no_decisions !== true) blockers.push("packet_must_apply_no_decisions");
  if (boundary.stronger_permissions_default_false !== true) blockers.push("stronger_permissions_must_default_false");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");
  if (boundary.notebooklm_packet_allowed !== false) blockers.push("notebooklm_packet_must_not_be_allowed");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");

  const policy = packet?.decision_policy ?? {};
  if (policy.packet_is_not_owner_approval !== true) blockers.push("policy_packet_must_not_be_owner_approval");
  if (policy.packet_applies_no_decisions !== true) blockers.push("policy_packet_must_apply_no_decisions");
  if (policy.stronger_permissions_default_false !== true) blockers.push("policy_stronger_permissions_must_default_false");
  if (policy.source_text_retrieval_allowed !== false) blockers.push("policy_source_text_retrieval_must_not_be_allowed");
  if (policy.index_build_allowed !== false) blockers.push("policy_index_build_must_not_be_allowed");
  if (policy.notebooklm_packet_membership_allowed !== false) blockers.push("policy_notebooklm_packet_must_not_be_allowed");
  if (policy.public_canon_promotion_allowed !== false) blockers.push("policy_public_canon_promotion_must_not_be_allowed");

  blockers.push(...findSourceSliceDecisionPacketShapeBlockers(packet));
  const items = manifestArrayField(packet, "items", blockers);
  const decisionItemRefs = new Set();
  const sourceSliceRefs = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      blockers.push("decision_item_must_be_object");
      continue;
    }
    if (!isSafeMetadataId(item.decision_item_ref)) blockers.push("decision_item_ref_unsafe");
    if (!isSafeMetadataId(item.source_slice_ref)) blockers.push("decision_item_source_slice_ref_unsafe");
    if (!isSafeMetadataId(item.source_handle)) blockers.push("decision_item_source_handle_unsafe");
    if (!isSafeMetadataRef(item.source_locator_ref)) blockers.push("decision_item_source_locator_ref_unsafe");
    if (decisionItemRefs.has(item.decision_item_ref)) blockers.push("decision_item_ref_duplicate");
    decisionItemRefs.add(item.decision_item_ref);
    if (sourceSliceRefs.has(item.source_slice_ref)) blockers.push("decision_item_source_slice_ref_duplicate");
    sourceSliceRefs.add(item.source_slice_ref);
    if (!SOURCE_SLICE_DECISION_ROUTES.has(item.decision_route)) blockers.push("decision_item_route_unknown");
    if (!Object.hasOwn(CLAIM_STRENGTH, item.claim_ceiling ?? "unknown")) blockers.push("decision_item_claim_ceiling_unknown");
    if (!isSafeMetadataId(item.metadata_fingerprint)) blockers.push("decision_item_metadata_fingerprint_unsafe");
    if (item.card_metadata_fingerprint !== null && !isSafeMetadataId(item.card_metadata_fingerprint)) {
      blockers.push("decision_item_card_metadata_fingerprint_unsafe");
    }
    validateSourceSlicePendingDecision(item, blockers);
    for (const ref of manifestArrayField(item, "covered_graph_node_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("decision_item_covered_graph_node_ref_unsafe");
    }
    for (const code of manifestArrayField(item, "blocker_codes", blockers, { required: false })) {
      if (!isSafeMetadataId(code)) blockers.push("decision_item_blocker_code_unsafe");
    }
  }
  blockers.push(...findUnsafeManifestValues(packet));

  return {
    schema_version: "soulforge.source_slice_decision_packet_validation.v0",
    kind: "source_slice_decision_packet_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    packet_id: packet?.packet_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
      not_owner_approval: boundary.packet_is_not_owner_approval === true,
      no_decisions_applied: boundary.packet_applies_no_decisions === true,
      stronger_permissions_default_false: boundary.stronger_permissions_default_false === true,
      no_source_text_retrieval: boundary.source_text_retrieval_allowed === false,
      no_index_build: boundary.index_build_allowed === false,
      no_notebooklm_packet: boundary.notebooklm_packet_allowed === false,
      no_public_canon_promotion: boundary.public_canon_promotion_allowed === false,
    },
  };
}

export async function buildSourceSliceOwnerDecisionRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const decisionPacket = options.decisionPacket ?? await loadSourceSliceDecisionPacket({
    repoRoot,
    decisionPacketRef: options.decisionPacketRef,
  });
  const packetValidation = validateSourceSliceDecisionPacket(decisionPacket);
  if (packetValidation.status !== "pass") {
    throw new Error(`source_slice_owner_decision_record_requires_valid_decision_packet:${packetValidation.blockers.join(",")}`);
  }
  const generatedAtUtc = formatTimestampUtc(options.now);
  const recordId = normalizeSourceSliceOwnerDecisionRecordId(
    options.recordId ?? `source_slice_owner_decision_${decisionPacket.packet_id}`,
  );
  const items = (decisionPacket.items ?? []).map(buildSourceSliceOwnerDecisionRecordItem);

  return {
    schema_version: SOURCE_SLICE_OWNER_DECISION_RECORD_SCHEMA_VERSION,
    kind: "source_slice_owner_decision_record",
    status: "draft_no_owner_decision_applied",
    record_id: recordId,
    generator_id: SOURCE_SLICE_OWNER_DECISION_RECORD_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      decision_packet_ref: options.decisionPacketRef ?? null,
      packet_id: decisionPacket.packet_id,
      triage_register_ref: decisionPacket.source_refs?.triage_register_ref ?? null,
      review_queue_ref: decisionPacket.source_refs?.review_queue_ref ?? null,
      manifest_ref: decisionPacket.source_refs?.manifest_ref ?? null,
      manifest_id: decisionPacket.source_refs?.manifest_id ?? null,
      graph_ref: decisionPacket.source_refs?.graph_ref ?? null,
    },
    boundary: sourceSliceOwnerDecisionRecordBoundary(),
    decision_policy: {
      purpose: "record_safe_default_decisions_before_metadata_index_completion",
      metadata_only: true,
      record_is_not_owner_approval: true,
      record_applies_no_stronger_permissions: true,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_allowed: false,
      public_canon_promotion_allowed: false,
      default_applied_decision: "keep_metadata_only",
    },
    counts: {
      source_slice_count: items.length,
      decision_record_item_count: items.length,
      keep_metadata_only_count: items.filter((item) => item.applied_decision === "keep_metadata_only").length,
      owner_review_required_count: items.filter((item) => item.decision_route === "owner_review_required").length,
      blocked_count: items.filter((item) => item.decision_route === "blocked_unsafe_source_locator").length,
      stronger_permission_grant_count: 0,
      sensitivity_counts: countBy(items.map((item) => item.sensitivity)),
    },
    items,
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeSourceSliceOwnerDecisionRecord(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const record = await buildSourceSliceOwnerDecisionRecord(options);
  const outputRef =
    options.outputRef ??
    defaultSourceSliceOwnerDecisionRecordOutputRef({ record, projectCode: options.projectCode });
  if (
    sourceSliceOwnerDecisionRecordRequiresProjectOutput(record) &&
    outputRef.startsWith(`${DEFAULT_SOURCE_SLICE_OWNER_DECISION_ROOT}/`)
  ) {
    throw new Error("private source slice owner decision record requires _workmeta/<project_code>/reports/rag/source_slice_owner_decisions/ output");
  }
  const outputPath = path.join(repoRoot, safeSourceSliceOwnerDecisionRecordOutputPath(outputRef));
  await writeJson(outputPath, record);
  return {
    status: "written",
    owner_decision_record_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    record_id: record.record_id,
    decision_record_item_count: record.items.length,
    keep_metadata_only_count: record.counts.keep_metadata_only_count,
  };
}

export async function loadSourceSliceOwnerDecisionRecord({ repoRoot = process.cwd(), ownerDecisionRecordRef } = {}) {
  if (!ownerDecisionRecordRef) {
    throw new Error("owner_decision_record_ref_required");
  }
  const root = path.resolve(repoRoot);
  const recordPath = path.join(root, safeRepoRelativePath(ownerDecisionRecordRef));
  return readJson(recordPath);
}

export function validateSourceSliceOwnerDecisionRecord(record) {
  const blockers = [];
  if (record?.schema_version !== SOURCE_SLICE_OWNER_DECISION_RECORD_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (record?.kind !== "source_slice_owner_decision_record") blockers.push("kind_must_be_source_slice_owner_decision_record");
  if (!isSafeMetadataId(record?.record_id)) blockers.push("record_id_unsafe");
  if (record?.status !== "draft_no_owner_decision_applied") blockers.push("owner_decision_record_status_must_be_draft_no_owner_decision_applied");
  const boundary = record?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.record_is_not_owner_approval !== true) blockers.push("record_must_not_be_owner_approval");
  if (boundary.record_applies_no_stronger_permissions !== true) blockers.push("record_must_apply_no_stronger_permissions");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");
  if (boundary.notebooklm_packet_allowed !== false) blockers.push("notebooklm_packet_must_not_be_allowed");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");

  const items = manifestArrayField(record, "items", blockers);
  const itemRefs = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      blockers.push("owner_decision_item_must_be_object");
      continue;
    }
    if (!isSafeMetadataId(item.decision_record_item_ref)) blockers.push("owner_decision_item_ref_unsafe");
    if (itemRefs.has(item.decision_record_item_ref)) blockers.push("owner_decision_item_ref_duplicate");
    itemRefs.add(item.decision_record_item_ref);
    if (!isSafeMetadataId(item.source_slice_ref)) blockers.push("owner_decision_item_source_slice_ref_unsafe");
    if (!isSafeMetadataId(item.source_handle)) blockers.push("owner_decision_item_source_handle_unsafe");
    if (!isSafeMetadataRef(item.source_locator_ref)) blockers.push("owner_decision_item_source_locator_ref_unsafe");
    if (!SOURCE_SLICE_DECISION_ROUTES.has(item.decision_route)) blockers.push("owner_decision_item_route_unknown");
    if (item.applied_decision !== "keep_metadata_only") blockers.push("owner_decision_item_applied_decision_must_be_keep_metadata_only");
    if (item.owner_approval_granted !== false) blockers.push("owner_decision_item_owner_approval_must_not_be_granted");
    if (item.source_text_retrieval_allowed !== false) blockers.push("owner_decision_item_source_text_retrieval_must_not_be_allowed");
    if (item.index_build_allowed !== false) blockers.push("owner_decision_item_index_build_must_not_be_allowed");
    if (item.notebooklm_packet_allowed !== false) blockers.push("owner_decision_item_notebooklm_packet_must_not_be_allowed");
    if (item.public_canon_promotion_allowed !== false) blockers.push("owner_decision_item_public_canon_promotion_must_not_be_allowed");
    if (!isSafeMetadataId(item.metadata_fingerprint)) blockers.push("owner_decision_item_metadata_fingerprint_unsafe");
  }
  blockers.push(...findUnsafeManifestValues(record));

  return {
    schema_version: "soulforge.source_slice_owner_decision_record_validation.v0",
    kind: "source_slice_owner_decision_record_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    record_id: record?.record_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
      not_owner_approval: boundary.record_is_not_owner_approval === true,
      no_stronger_permissions: boundary.record_applies_no_stronger_permissions === true,
    },
  };
}

export async function buildRagMetadataIndex(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const manifest = options.manifest ?? await loadRagManifest({ repoRoot, manifestRef: options.manifestRef });
  const manifestValidation = validateRagManifest(manifest);
  if (manifestValidation.status !== "pass") {
    throw new Error(`rag_metadata_index_requires_valid_manifest:${manifestValidation.blockers.join(",")}`);
  }
  const decisionPacket = options.decisionPacket ?? (options.decisionPacketRef
    ? await loadSourceSliceDecisionPacket({ repoRoot, decisionPacketRef: options.decisionPacketRef })
    : null);
  if (decisionPacket) {
    const packetValidation = validateSourceSliceDecisionPacket(decisionPacket);
    if (packetValidation.status !== "pass") {
      throw new Error(`rag_metadata_index_requires_valid_decision_packet:${packetValidation.blockers.join(",")}`);
    }
  }
  const ownerDecisionRecord = options.ownerDecisionRecord ?? (options.ownerDecisionRecordRef
    ? await loadSourceSliceOwnerDecisionRecord({ repoRoot, ownerDecisionRecordRef: options.ownerDecisionRecordRef })
    : null);
  if (ownerDecisionRecord) {
    const recordValidation = validateSourceSliceOwnerDecisionRecord(ownerDecisionRecord);
    if (recordValidation.status !== "pass") {
      throw new Error(`rag_metadata_index_requires_valid_owner_decision_record:${recordValidation.blockers.join(",")}`);
    }
  }
  const generatedAtUtc = formatTimestampUtc(options.now);
  const indexId = normalizeRagMetadataIndexId(options.indexId ?? `metadata_index_${manifest.manifest_id}`);
  const decisionState = buildMetadataDecisionState({ decisionPacket, ownerDecisionRecord });
  const documents = buildMetadataIndexDocuments({ manifest, decisionState });
  const tokenPostings = buildLexicalTokenPostings(documents);
  const privateSourceCount = (manifest.sources ?? []).filter((source) =>
    isPrivateSourceLocatorRef(source.storage_locator) || (source.sensitivity && source.sensitivity !== "public_safe_metadata")
  ).length;

  return {
    schema_version: RAG_METADATA_INDEX_SCHEMA_VERSION,
    kind: "rag_metadata_index",
    status: "ready_metadata_only",
    index_id: indexId,
    generator_id: RAG_METADATA_INDEX_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    source_refs: {
      manifest_ref: options.manifestRef ?? null,
      manifest_id: manifest.manifest_id,
      decision_packet_ref: options.decisionPacketRef ?? null,
      owner_decision_record_ref: options.ownerDecisionRecordRef ?? null,
      graph_ref: manifest.source_refs?.graph_ref ?? null,
    },
    boundary: ragMetadataIndexBoundary(),
    counts: {
      source_count: manifest.sources?.length ?? 0,
      private_source_count: privateSourceCount,
      retrieval_unit_count: manifest.retrieval_units?.length ?? 0,
      indexed_document_count: documents.length,
      token_fingerprint_count: tokenPostings.length,
      blocked_document_count: (manifest.retrieval_units?.length ?? 0) - documents.length,
    },
    documents,
    lexical_index: {
      tokenizer: "soulforge_basic_metadata_tokenizer_v0",
      score_method: "metadata_lexical_overlap_v0",
      token_postings: tokenPostings,
    },
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeRagMetadataIndex(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const index = await buildRagMetadataIndex(options);
  const outputRef =
    options.outputRef ??
    defaultRagMetadataIndexOutputRef({ index, projectCode: options.projectCode });
  if (
    ragMetadataIndexRequiresProjectOutput(index) &&
    outputRef.startsWith(`${DEFAULT_METADATA_INDEX_ROOT}/`)
  ) {
    throw new Error("private rag metadata index requires _workmeta/<project_code>/reports/rag/metadata_retrieval_indexes/ output");
  }
  const outputPath = path.join(repoRoot, safeRagMetadataIndexOutputPath(outputRef));
  await writeJson(outputPath, index);
  return {
    status: "written",
    metadata_index_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    index_id: index.index_id,
    indexed_document_count: index.documents.length,
    token_fingerprint_count: index.counts.token_fingerprint_count,
  };
}

export async function loadRagMetadataIndex({ repoRoot = process.cwd(), metadataIndexRef } = {}) {
  if (!metadataIndexRef) throw new Error("metadata_index_ref_required");
  const root = path.resolve(repoRoot);
  const indexPath = path.join(root, safeRepoRelativePath(metadataIndexRef));
  return readJson(indexPath);
}

export function validateRagMetadataIndex(index) {
  const blockers = [];
  if (index?.schema_version !== RAG_METADATA_INDEX_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (index?.kind !== "rag_metadata_index") blockers.push("kind_must_be_rag_metadata_index");
  if (!isSafeMetadataId(index?.index_id)) blockers.push("index_id_unsafe");
  if (index?.status !== "ready_metadata_only") blockers.push("metadata_index_status_must_be_ready_metadata_only");
  const boundary = index?.boundary ?? {};
  validateMetadataRetrievalBoundary(boundary, blockers);
  const documents = manifestArrayField(index, "documents", blockers);
  const documentRefs = new Set();
  for (const document of documents) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      blockers.push("metadata_index_document_must_be_object");
      continue;
    }
    if (!isSafeMetadataRef(document.document_ref)) blockers.push("metadata_index_document_ref_unsafe");
    if (documentRefs.has(document.document_ref)) blockers.push("metadata_index_document_ref_duplicate");
    documentRefs.add(document.document_ref);
    if (!isSafeMetadataRef(document.graph_node_ref)) blockers.push("metadata_index_graph_node_ref_unsafe");
    if (!Object.hasOwn(CLAIM_STRENGTH, document.claim_ceiling ?? "unknown")) blockers.push("metadata_index_claim_ceiling_unknown");
    if (document.payload_state !== "metadata_only") blockers.push("metadata_index_document_payload_state_must_be_metadata_only");
    if (!isSafeMetadataId(document.metadata_fingerprint)) blockers.push("metadata_index_document_metadata_fingerprint_unsafe");
    if (Object.hasOwn(document, "source_handles")) blockers.push("metadata_index_document_source_handles_must_not_be_persisted");
    if (Object.hasOwn(document, "source_locator_ref")) blockers.push("metadata_index_document_source_locator_must_not_be_persisted");
    if (Object.hasOwn(document, "token_frequencies")) blockers.push("metadata_index_document_raw_tokens_must_not_be_persisted");
    if (!Number.isInteger(document.token_fingerprint_count) || document.token_fingerprint_count < 0) {
      blockers.push("metadata_index_document_token_fingerprint_count_invalid");
    }
    const fingerprintCounts = document.token_fingerprint_counts;
    if (!fingerprintCounts || typeof fingerprintCounts !== "object" || Array.isArray(fingerprintCounts)) {
      blockers.push("metadata_index_document_token_fingerprint_counts_must_be_object");
    } else {
      for (const [fingerprint, count] of Object.entries(fingerprintCounts)) {
        if (!isSafeMetadataId(fingerprint)) blockers.push("metadata_index_document_token_fingerprint_unsafe");
        if (!Number.isInteger(count) || count < 1) blockers.push("metadata_index_document_token_fingerprint_count_invalid");
      }
    }
  }
  const postings = manifestArrayField(index?.lexical_index ?? {}, "token_postings", blockers);
  for (const posting of postings) {
    if (!posting || typeof posting !== "object" || Array.isArray(posting)) {
      blockers.push("metadata_index_token_posting_must_be_object");
      continue;
    }
    if (Object.hasOwn(posting, "token")) blockers.push("metadata_index_raw_token_must_not_be_persisted");
    if (!isSafeMetadataId(posting.token_fingerprint)) blockers.push("metadata_index_token_fingerprint_unsafe");
    for (const entry of manifestArrayField(posting, "postings", blockers)) {
      if (!isSafeMetadataRef(entry.document_ref)) blockers.push("metadata_index_posting_document_ref_unsafe");
      if (!Number.isInteger(entry.count) || entry.count < 1) blockers.push("metadata_index_posting_count_invalid");
    }
  }
  blockers.push(...findForbiddenExactKeyBlockers(index, FORBIDDEN_METADATA_RETRIEVAL_KEYS, "metadata_index"));
  blockers.push(...findUnsafeManifestValues(index));
  return {
    schema_version: "soulforge.rag_metadata_index_validation.v0",
    kind: "rag_metadata_index_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    index_id: index?.index_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: metadataRetrievalBoundarySummary(boundary),
  };
}

export async function buildRagRetrievalTrace(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) throw new Error("retrieval trace requires --question");
  const metadataIndex = options.metadataIndex ?? await loadRagMetadataIndex({
    repoRoot,
    metadataIndexRef: options.metadataIndexRef,
  });
  const indexValidation = validateRagMetadataIndex(metadataIndex);
  if (indexValidation.status !== "pass") {
    throw new Error(`rag_retrieval_trace_requires_valid_metadata_index:${indexValidation.blockers.join(",")}`);
  }
  const maxUnits = clampInteger(options.maxUnits ?? 5, 1, 20);
  const retrievedUnits = retrieveUnitsFromMetadataIndex({ metadataIndex, question, maxUnits });
  const traceId = normalizeRagRetrievalTraceId(options.traceId ?? `retrieval_trace_${stableHash(`${metadataIndex.index_id}:${question}`).slice(0, 12)}`);
  return {
    schema_version: RAG_RETRIEVAL_TRACE_SCHEMA_VERSION,
    kind: "rag_retrieval_trace",
    status: retrievedUnits.length > 0 ? "retrieved_metadata" : "blocked_insufficient_metadata_index_evidence",
    trace_id: traceId,
    generator_id: RAG_RETRIEVAL_TRACE_GENERATOR_ID,
    generated_at_utc: formatTimestampUtc(options.now),
    source_refs: {
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex.index_id,
      manifest_ref: metadataIndex.source_refs?.manifest_ref ?? null,
      owner_decision_record_ref: metadataIndex.source_refs?.owner_decision_record_ref ?? null,
    },
    boundary: ragMetadataIndexBoundary(),
    question_fingerprint: stableHash(`query:${question}`),
    query_token_count: tokenize(question).size,
    query_token_fingerprints: tokenFingerprintsForValue(question),
    retrieved_units: retrievedUnits,
    citations: buildCitations(retrievedUnits),
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
}

export async function writeRagRetrievalTrace(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const trace = await buildRagRetrievalTrace(options);
  const outputRef =
    options.outputRef ??
    normalizeRepoPath(path.join(DEFAULT_RETRIEVAL_TRACE_ROOT, trace.trace_id, "retrieval_trace.json"));
  const outputPath = path.join(repoRoot, safeRagRetrievalTraceOutputPath(outputRef));
  await writeJson(outputPath, trace);
  return {
    status: "written",
    retrieval_trace_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    trace_id: trace.trace_id,
    retrieved_unit_count: trace.retrieved_units.length,
  };
}

export async function loadRagRetrievalTrace({ repoRoot = process.cwd(), retrievalTraceRef } = {}) {
  if (!retrievalTraceRef) throw new Error("retrieval_trace_ref_required");
  const root = path.resolve(repoRoot);
  const tracePath = path.join(root, safeRepoRelativePath(retrievalTraceRef));
  return readJson(tracePath);
}

export function validateRagRetrievalTrace(trace) {
  const blockers = [];
  if (trace?.schema_version !== RAG_RETRIEVAL_TRACE_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (trace?.kind !== "rag_retrieval_trace") blockers.push("kind_must_be_rag_retrieval_trace");
  if (!isSafeMetadataId(trace?.trace_id)) blockers.push("trace_id_unsafe");
  if (!["retrieved_metadata", "blocked_insufficient_metadata_index_evidence"].includes(trace?.status)) {
    blockers.push("retrieval_trace_status_unknown");
  }
  validateMetadataRetrievalBoundary(trace?.boundary ?? {}, blockers);
  if (Object.hasOwn(trace ?? {}, "question")) blockers.push("retrieval_trace_question_must_not_be_persisted");
  if (!isSafeMetadataId(trace?.question_fingerprint)) blockers.push("retrieval_trace_question_fingerprint_unsafe");
  if (!Number.isInteger(trace?.query_token_count) || (trace?.query_token_count ?? -1) < 0) {
    blockers.push("retrieval_trace_query_token_count_invalid");
  }
  for (const fingerprint of manifestArrayField(trace, "query_token_fingerprints", blockers, { required: false })) {
    if (!isSafeMetadataId(fingerprint)) blockers.push("retrieval_trace_query_token_fingerprint_unsafe");
  }
  for (const unit of manifestArrayField(trace, "retrieved_units", blockers)) {
    if (!isSafeMetadataRef(unit.unit_ref)) blockers.push("trace_unit_ref_unsafe");
    if (!isSafeMetadataRef(unit.graph_node_ref)) blockers.push("trace_graph_node_ref_unsafe");
    if (Object.hasOwn(unit, "source_handles")) blockers.push("trace_unit_source_handles_must_not_be_persisted");
    for (const reason of manifestArrayField(unit, "match_reasons", blockers, { required: false })) {
      if (!isSafeMetadataId(reason)) blockers.push("trace_match_reason_unsafe");
    }
  }
  blockers.push(...findForbiddenExactKeyBlockers(trace, new Set(["question", "raw_query", "source_handles"]), "retrieval_trace"));
  blockers.push(...findUnsafeManifestValues(trace));
  return {
    schema_version: "soulforge.rag_retrieval_trace_validation.v0",
    kind: "rag_retrieval_trace_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    trace_id: trace?.trace_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: metadataRetrievalBoundarySummary(trace?.boundary ?? {}),
  };
}

export async function buildRagRetrievalEvaluation(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const metadataIndex = options.metadataIndex ?? await loadRagMetadataIndex({
    repoRoot,
    metadataIndexRef: options.metadataIndexRef,
  });
  const indexValidation = validateRagMetadataIndex(metadataIndex);
  if (indexValidation.status !== "pass") {
    throw new Error(`rag_retrieval_evaluation_requires_valid_metadata_index:${indexValidation.blockers.join(",")}`);
  }
  const evaluationId = normalizeRagRetrievalEvaluationId(options.evaluationId ?? `retrieval_eval_${metadataIndex.index_id}`);
  const cases = buildSelfRetrievalEvaluationCases(metadataIndex);
  const passedCases = cases.filter((item) => item.status === "pass").length;
  return {
    schema_version: RAG_RETRIEVAL_EVALUATION_SCHEMA_VERSION,
    kind: "rag_retrieval_evaluation",
    status: cases.length > 0 && passedCases === cases.length ? "pass" : "needs_review",
    evaluation_id: evaluationId,
    generator_id: RAG_RETRIEVAL_EVALUATION_GENERATOR_ID,
    generated_at_utc: formatTimestampUtc(options.now),
    source_refs: {
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex.index_id,
    },
    boundary: {
      ...ragMetadataIndexBoundary(),
      evaluation_is_smoke_not_quality_benchmark: true,
    },
    counts: {
      case_count: cases.length,
      pass_count: passedCases,
      fail_count: cases.length - passedCases,
    },
    cases,
  };
}

export async function writeRagRetrievalEvaluation(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const evaluation = await buildRagRetrievalEvaluation(options);
  const outputRef =
    options.outputRef ??
    normalizeRepoPath(path.join(DEFAULT_RETRIEVAL_EVALUATION_ROOT, evaluation.evaluation_id, "retrieval_evaluation.json"));
  const outputPath = path.join(repoRoot, safeRagRetrievalEvaluationOutputPath(outputRef));
  await writeJson(outputPath, evaluation);
  return {
    status: "written",
    retrieval_evaluation_ref: normalizeRepoPath(path.relative(repoRoot, outputPath)),
    evaluation_id: evaluation.evaluation_id,
    evaluation_status: evaluation.status,
    counts: evaluation.counts,
  };
}

export async function loadRagRetrievalEvaluation({ repoRoot = process.cwd(), retrievalEvaluationRef } = {}) {
  if (!retrievalEvaluationRef) throw new Error("retrieval_evaluation_ref_required");
  const root = path.resolve(repoRoot);
  const evaluationPath = path.join(root, safeRepoRelativePath(retrievalEvaluationRef));
  return readJson(evaluationPath);
}

export function validateRagRetrievalEvaluation(evaluation) {
  const blockers = [];
  if (evaluation?.schema_version !== RAG_RETRIEVAL_EVALUATION_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (evaluation?.kind !== "rag_retrieval_evaluation") blockers.push("kind_must_be_rag_retrieval_evaluation");
  if (!isSafeMetadataId(evaluation?.evaluation_id)) blockers.push("evaluation_id_unsafe");
  if (!["pass", "needs_review"].includes(evaluation?.status)) blockers.push("retrieval_evaluation_status_unknown");
  validateMetadataRetrievalBoundary(evaluation?.boundary ?? {}, blockers);
  if (evaluation?.boundary?.evaluation_is_smoke_not_quality_benchmark !== true) {
    blockers.push("retrieval_evaluation_must_disclaim_quality_benchmark");
  }
  for (const item of manifestArrayField(evaluation, "cases", blockers)) {
    if (!isSafeMetadataId(item.case_id)) blockers.push("retrieval_evaluation_case_id_unsafe");
    if (Object.hasOwn(item, "question")) blockers.push("retrieval_evaluation_case_question_must_not_be_persisted");
    if (!isSafeMetadataId(item.query_fingerprint)) blockers.push("retrieval_evaluation_case_query_fingerprint_unsafe");
    if (!isSafeMetadataId(item.query_source)) blockers.push("retrieval_evaluation_case_query_source_unsafe");
    if (!isSafeMetadataRef(item.expected_document_ref)) blockers.push("retrieval_evaluation_expected_document_ref_unsafe");
    if (!["pass", "fail"].includes(item.status)) blockers.push("retrieval_evaluation_case_status_unknown");
    for (const fingerprint of manifestArrayField(item, "query_token_fingerprints", blockers, { required: false })) {
      if (!isSafeMetadataId(fingerprint)) blockers.push("retrieval_evaluation_case_query_token_fingerprint_unsafe");
    }
    for (const ref of manifestArrayField(item, "retrieved_document_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("retrieval_evaluation_case_retrieved_document_ref_unsafe");
    }
  }
  blockers.push(...findForbiddenExactKeyBlockers(evaluation, new Set(["question", "raw_query", "source_handles"]), "retrieval_evaluation"));
  blockers.push(...findUnsafeManifestValues(evaluation));
  return {
    schema_version: "soulforge.rag_retrieval_evaluation_validation.v0",
    kind: "rag_retrieval_evaluation_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    evaluation_id: evaluation?.evaluation_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: metadataRetrievalBoundarySummary(evaluation?.boundary ?? {}),
  };
}

export function validateSourceSliceCards(cardSet) {
  const blockers = [];
  if (cardSet?.schema_version !== SOURCE_SLICE_CARD_SET_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (cardSet?.kind !== "source_slice_card_set") {
    blockers.push("kind_must_be_source_slice_card_set");
  }
  if (!isSafeMetadataId(cardSet?.slice_set_id)) {
    blockers.push("slice_set_id_unsafe");
  }
  const boundary = cardSet?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.excerpts_included !== false) blockers.push("excerpts_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_index_included !== false) blockers.push("bm25_index_must_not_be_included");
  if (boundary.vector_index_included !== false) blockers.push("vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");

  blockers.push(...findSourceSliceShapeBlockers(cardSet));
  const cards = manifestArrayField(cardSet, "cards", blockers);
  for (const card of cards) {
    if (!card || typeof card !== "object" || Array.isArray(card)) {
      blockers.push("source_slice_card_must_be_object");
      continue;
    }
    if (card.card_schema_version !== SOURCE_SLICE_CARD_SCHEMA_VERSION) blockers.push("card_schema_version_mismatch");
    if (card.kind !== "source_slice_card") blockers.push("card_kind_must_be_source_slice_card");
    if (!isSafeMetadataId(card.source_slice_ref)) blockers.push("source_slice_ref_unsafe");
    if (!isSafeMetadataId(card.source_handle)) blockers.push("source_handle_unsafe");
    if (!isSafeMetadataRef(card.source_locator_ref)) blockers.push("source_locator_ref_unsafe");
    if (isPrivateSourceLocatorRef(card.source_locator_ref) && card.sensitivity === "public_safe_metadata") {
      blockers.push("source_locator_private_requires_private_sensitivity");
    }
    if (!Object.hasOwn(CLAIM_STRENGTH, card.claim_ceiling ?? "unknown")) blockers.push("claim_ceiling_unknown");
    if (!isSafeMetadataId(card.index_readiness?.status)) blockers.push("index_readiness_status_unsafe");
    validateSourceSliceCardV0Safety(card, blockers);
    for (const ref of manifestArrayField(card, "covered_graph_node_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("covered_graph_node_ref_unsafe");
    }
    for (const code of manifestArrayField(card, "blocker_codes", blockers, { required: false })) {
      if (!isSafeMetadataId(code)) blockers.push("blocker_code_unsafe");
    }
  }
  blockers.push(...findUnsafeManifestValues(cardSet));

  return {
    schema_version: "soulforge.source_slice_card_validation.v0",
    kind: "source_slice_card_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    slice_set_id: cardSet?.slice_set_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_chunk_payloads: boundary.chunk_payloads_included === false,
      no_excerpts: boundary.excerpts_included === false,
      no_embeddings: boundary.embeddings_included === false,
      no_bm25_index: boundary.bm25_index_included === false,
      no_vector_index: boundary.vector_index_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    },
  };
}

export function validateSourceSliceTriageRegister(register) {
  const blockers = [];
  if (register?.schema_version !== SOURCE_SLICE_TRIAGE_REGISTER_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (register?.kind !== "source_slice_triage_register") {
    blockers.push("kind_must_be_source_slice_triage_register");
  }
  if (!isSafeMetadataId(register?.register_id)) {
    blockers.push("register_id_unsafe");
  }
  if (!SOURCE_SLICE_TRIAGE_REGISTER_STATUSES.has(register?.status)) {
    blockers.push("source_slice_triage_register_status_unknown");
  }
  const boundary = register?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.register_is_not_owner_approval !== true) blockers.push("register_must_not_be_owner_approval");
  if (boundary.register_applies_no_source_text_decisions !== true) blockers.push("register_must_apply_no_source_text_decisions");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");

  const policy = register?.triage_policy ?? {};
  if (policy.metadata_knowledge_registration_allowed !== true) blockers.push("policy_metadata_registration_must_be_allowed");
  if (policy.register_is_not_owner_approval !== true) blockers.push("policy_register_must_not_be_owner_approval");
  if (policy.source_text_retrieval_allowed !== false) blockers.push("policy_source_text_retrieval_must_not_be_allowed");
  if (policy.index_build_allowed !== false) blockers.push("policy_index_build_must_not_be_allowed");
  if (policy.notebooklm_packet_membership_allowed !== false) blockers.push("policy_notebooklm_packet_must_not_be_allowed");
  if (policy.public_canon_promotion_allowed !== false) blockers.push("policy_public_canon_promotion_must_not_be_allowed");
  validateStandingOwnerPolicy(policy.standing_owner_policy ?? {}, blockers);

  blockers.push(...findSourceSliceTriageRegisterShapeBlockers(register));
  const registeredItems = manifestArrayField(register, "registered_items", blockers);
  const ownerReviewItems = manifestArrayField(register, "owner_review_items", blockers);
  const blockedItems = manifestArrayField(register, "blocked_items", blockers);
  validateSourceSliceTriageItems(registeredItems, blockers, {
    result: "accepted_for_metadata_knowledge",
    route: "registered_metadata_knowledge",
  });
  validateSourceSliceTriageItems(ownerReviewItems, blockers, {
    result: "hold_candidate",
    route: "owner_review_required",
  });
  validateSourceSliceTriageItems(blockedItems, blockers, {
    result: "rejected_or_unclear",
    route: "blocked_unsafe_source_locator",
  });
  blockers.push(...findUnsafeManifestValues(register));

  return {
    schema_version: "soulforge.source_slice_triage_register_validation.v0",
    kind: "source_slice_triage_register_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    register_id: register?.register_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
      not_owner_approval: boundary.register_is_not_owner_approval === true,
      no_source_text_decisions: boundary.register_applies_no_source_text_decisions === true,
      no_source_text_retrieval: boundary.source_text_retrieval_allowed === false,
      no_index_build: boundary.index_build_allowed === false,
    },
  };
}

export function validateSourceSliceReviewQueue(queue) {
  const blockers = [];
  if (queue?.schema_version !== SOURCE_SLICE_REVIEW_QUEUE_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (queue?.kind !== "source_slice_review_queue") {
    blockers.push("kind_must_be_source_slice_review_queue");
  }
  if (!isSafeMetadataId(queue?.queue_id)) {
    blockers.push("queue_id_unsafe");
  }
  if (!SOURCE_SLICE_REVIEW_QUEUE_STATUSES.has(queue?.status)) {
    blockers.push("source_slice_review_queue_status_unknown");
  }
  const boundary = queue?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.queue_is_not_owner_approval !== true) blockers.push("queue_must_not_be_owner_approval");
  if (boundary.queue_applies_no_decisions !== true) blockers.push("queue_must_apply_no_decisions");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.index_build_allowed !== false) blockers.push("index_build_must_not_be_allowed");

  const policy = queue?.review_policy ?? {};
  if (policy.queue_is_not_owner_approval !== true) blockers.push("policy_queue_must_not_be_owner_approval");
  if (policy.queue_applies_no_decisions !== true) blockers.push("policy_queue_must_apply_no_decisions");
  if (policy.source_text_retrieval_allowed !== false) blockers.push("policy_source_text_retrieval_must_not_be_allowed");
  if (policy.index_build_allowed !== false) blockers.push("policy_index_build_must_not_be_allowed");

  blockers.push(...findSourceSliceReviewQueueShapeBlockers(queue));
  const items = manifestArrayField(queue, "items", blockers);
  const reviewItemRefs = new Set();
  const sourceSliceRefs = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      blockers.push("review_item_must_be_object");
      continue;
    }
    if (!isSafeMetadataId(item.review_item_ref)) blockers.push("review_item_ref_unsafe");
    if (!isSafeMetadataId(item.source_slice_ref)) blockers.push("review_item_source_slice_ref_unsafe");
    if (!isSafeMetadataId(item.source_handle)) blockers.push("review_item_source_handle_unsafe");
    if (!isSafeMetadataRef(item.source_locator_ref)) blockers.push("review_item_source_locator_ref_unsafe");
    if (reviewItemRefs.has(item.review_item_ref)) blockers.push("review_item_ref_duplicate");
    reviewItemRefs.add(item.review_item_ref);
    if (sourceSliceRefs.has(item.source_slice_ref)) blockers.push("review_item_source_slice_ref_duplicate");
    sourceSliceRefs.add(item.source_slice_ref);
    if (!Object.hasOwn(CLAIM_STRENGTH, item.claim_ceiling ?? "unknown")) blockers.push("review_item_claim_ceiling_unknown");
    if (!isSafeMetadataId(item.card_metadata_fingerprint)) blockers.push("review_item_card_metadata_fingerprint_unsafe");
    if (!isSafeMetadataId(item.metadata_fingerprint)) blockers.push("review_item_metadata_fingerprint_unsafe");
    validateSourceSliceReviewDecision(item, blockers);
    for (const ref of manifestArrayField(item, "covered_graph_node_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("review_item_covered_graph_node_ref_unsafe");
    }
    for (const code of manifestArrayField(item, "blocker_codes", blockers, { required: false })) {
      if (!isSafeMetadataId(code)) blockers.push("review_item_blocker_code_unsafe");
    }
    for (const ref of manifestArrayField(item.decision ?? {}, "required_evidence_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("review_item_required_evidence_ref_unsafe");
    }
  }
  blockers.push(...findUnsafeManifestValues(queue));

  return {
    schema_version: "soulforge.source_slice_review_queue_validation.v0",
    kind: "source_slice_review_queue_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    queue_id: queue?.queue_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
      not_owner_approval: boundary.queue_is_not_owner_approval === true,
      no_decisions_applied: boundary.queue_applies_no_decisions === true,
      no_source_text_retrieval: boundary.source_text_retrieval_allowed === false,
      no_index_build: boundary.index_build_allowed === false,
    },
  };
}

function validateSourceSliceCardV0Safety(card, blockers) {
  const sourceAccess = card.source_access ?? {};
  if (card.status !== "candidate") blockers.push("source_slice_v0_status_must_be_candidate");
  if (sourceAccess.payload_state !== "not_loaded") blockers.push("source_slice_v0_payload_state_must_be_not_loaded");
  if (sourceAccess.source_text_access !== "not_requested") blockers.push("source_slice_v0_source_text_access_must_be_not_requested");
  if (sourceAccess.source_text_loaded !== false) blockers.push("source_slice_v0_source_text_loaded_must_be_false");
  if (sourceAccess.owner_source_slice_approval_required !== true) blockers.push("source_slice_v0_owner_approval_required_must_be_true");
  if (sourceAccess.allowed_for_source_text_retrieval !== false) {
    blockers.push("source_slice_v0_source_text_retrieval_must_not_be_allowed");
  }

  const planned = card.planned_processing ?? {};
  if (planned.chunking_status !== "not_started") blockers.push("source_slice_v0_chunking_status_must_be_not_started");
  if (planned.chunk_payloads_included !== false) blockers.push("source_slice_v0_chunk_payloads_must_not_be_included");
  if (planned.bm25_index_status !== "not_started") blockers.push("source_slice_v0_bm25_index_status_must_be_not_started");
  if (planned.vector_index_status !== "not_started") blockers.push("source_slice_v0_vector_index_status_must_be_not_started");
  if (planned.embeddings_included !== false) blockers.push("source_slice_v0_embeddings_must_not_be_included");
  if (planned.retrieval_trace_status !== "not_started") blockers.push("source_slice_v0_retrieval_trace_status_must_be_not_started");
  if (planned.evaluation_status !== "not_started") blockers.push("source_slice_v0_evaluation_status_must_be_not_started");

  const indexReadiness = card.index_readiness ?? {};
  if (!SOURCE_SLICE_V0_INDEX_READINESS_STATUSES.has(indexReadiness.status)) {
    blockers.push("source_slice_v0_index_readiness_status_must_be_blocked");
  }
  if (indexReadiness.allowed_for_index_build !== false) blockers.push("source_slice_v0_index_build_must_not_be_allowed");
  if (indexReadiness.next_owner_action !== "approve_source_slice_before_indexing") {
    blockers.push("source_slice_v0_next_owner_action_must_require_approval");
  }

  const blockerCodes = new Set(Array.isArray(card.blocker_codes) ? card.blocker_codes : []);
  for (const requiredCode of SOURCE_SLICE_V0_REQUIRED_BLOCKER_CODES) {
    if (!blockerCodes.has(requiredCode)) blockers.push(`source_slice_v0_missing_blocker:${requiredCode}`);
  }
}

export function validateRagManifest(manifest) {
  const blockers = [];
  if (manifest?.schema_version !== RAG_MANIFEST_SCHEMA_VERSION) {
    blockers.push("schema_version_mismatch");
  }
  if (manifest?.kind !== "rag_manifest") {
    blockers.push("kind_must_be_rag_manifest");
  }
  const boundary = manifest?.boundary ?? {};
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.chunk_text_included !== false) blockers.push("chunk_text_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");

  const sources = manifestArrayField(manifest, "sources", blockers);
  const retrievalUnits = manifestArrayField(manifest, "retrieval_units", blockers);
  const graphBindings = manifestArrayField(manifest, "graph_bindings", blockers);
  const indexes = manifestArrayField(manifest, "indexes", blockers, { required: false });
  if (indexes.length > 0) blockers.push("manifest_indexes_must_be_empty");

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      blockers.push("source_must_be_object");
      continue;
    }
    if (!source.source_handle) blockers.push("source_missing_handle");
    if (!isSafeMetadataRef(source.storage_locator)) {
      blockers.push(`unsafe_source_locator:${source.source_handle ?? "unknown"}`);
    }
  }

  const sourceHandles = new Set(sources.map((source) => source?.source_handle).filter(Boolean));
  for (const unit of retrievalUnits) {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      blockers.push("retrieval_unit_must_be_object");
      continue;
    }
    if (!unit.unit_ref) blockers.push("retrieval_unit_missing_ref");
    if (hasForbiddenPayloadFields(unit)) {
      blockers.push(`retrieval_unit_payload_field:${unit.unit_ref ?? "unknown"}`);
    }
    const unitSourceHandles = manifestArrayField(unit, "source_handles", blockers, { required: false });
    for (const handle of unitSourceHandles) {
      if (!sourceHandles.has(handle)) {
        blockers.push(`retrieval_unit_unknown_source:${unit.unit_ref ?? "unknown"}:${handle}`);
      }
    }
  }

  for (const binding of graphBindings) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      blockers.push("graph_binding_must_be_object");
      continue;
    }
    if (!binding.binding_ref || !binding.from_ref || !binding.to_ref || !binding.relation_type) {
      blockers.push("graph_binding_missing_required_field");
    }
  }
  blockers.push(...findRagManifestIndexPayloadBlockers(manifest));
  blockers.push(...findUnsafeManifestValues(manifest));

  return {
    schema_version: "soulforge.rag_manifest_validation.v0",
    kind: "rag_manifest_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    manifest_id: manifest?.manifest_id ?? null,
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    boundary: {
      metadata_only: boundary.metadata_only === true,
      no_source_payloads: boundary.source_payloads_included === false,
      no_chunk_text: boundary.chunk_text_included === false,
      no_notebooklm_answers: boundary.notebooklm_answers_included === false,
      no_secrets_or_session: boundary.secrets_or_session_included === false,
      no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    },
  };
}

export async function answerFromRagManifest(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) {
    throw new Error("answer requires --question");
  }
  if (options.metadataIndexRef || options.metadataIndex) {
    return answerFromRagMetadataIndex({ ...options, repoRoot, question });
  }
  const manifest = options.manifest ?? (options.manifestRef
    ? await loadRagManifest({ repoRoot, manifestRef: options.manifestRef })
    : await buildRagManifest(options));
  const validation = validateRagManifest(manifest);
  const queryMetadata = buildAnswerQueryMetadata(question);
  if (validation.status !== "pass") {
    return {
      schema_version: RAG_ANSWER_SCHEMA_VERSION,
      kind: "rag_answer",
      status: "blocked",
      generated_at_utc: new Date().toISOString(),
      engine_id: RAG_ANSWER_ENGINE_ID,
      ...queryMetadata,
      answer: "RAG manifest validation failed, so no answer was generated.",
      validation,
      citations: [],
      retrieved_units: [],
      boundary: answerBoundary(),
    };
  }

  const maxUnits = clampInteger(options.maxUnits ?? 5, 1, 20);
  const retrievedUnits = retrieveUnits({ manifest, question, maxUnits });
  if (retrievedUnits.length === 0) {
    return {
      schema_version: RAG_ANSWER_SCHEMA_VERSION,
      kind: "rag_answer",
      status: "blocked_insufficient_manifest_evidence",
      generated_at_utc: new Date().toISOString(),
      engine_id: RAG_ANSWER_ENGINE_ID,
      ...queryMetadata,
      answer: "metadata-only RAG manifest에서 질문과 직접 맞는 항목을 찾지 못했습니다. Sourcebound retrieval 또는 manifest coverage 확장이 필요합니다.",
      manifest_ref: options.manifestRef ?? null,
      manifest_id: manifest.manifest_id,
      claim_ceiling: "observed",
      validation,
      retrieved_units: [],
      citations: [],
      boundary: answerBoundary(),
    };
  }
  const answer = renderMetadataAnswer({ manifest, retrievedUnits });
  return {
    schema_version: RAG_ANSWER_SCHEMA_VERSION,
    kind: "rag_answer",
    status: "metadata_only_answer",
    generated_at_utc: new Date().toISOString(),
    engine_id: RAG_ANSWER_ENGINE_ID,
    ...queryMetadata,
    answer,
    manifest_ref: options.manifestRef ?? null,
    manifest_id: manifest.manifest_id,
    claim_ceiling: weakestClaimCeiling(retrievedUnits.map((unit) => unit.claim_ceiling)),
    validation,
    retrieved_units: retrievedUnits,
    citations: buildCitations(retrievedUnits),
    boundary: answerBoundary(),
  };
}

export async function answerFromRagMetadataIndex(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const question = String(options.question ?? "").trim();
  if (!question) {
    throw new Error("answer requires --question");
  }
  const metadataIndex = options.metadataIndex ?? await loadRagMetadataIndex({
    repoRoot,
    metadataIndexRef: options.metadataIndexRef,
  });
  const validation = validateRagMetadataIndex(metadataIndex);
  const queryMetadata = buildAnswerQueryMetadata(question);
  if (validation.status !== "pass") {
    return {
      schema_version: RAG_ANSWER_SCHEMA_VERSION,
      kind: "rag_answer",
      status: "blocked",
      generated_at_utc: new Date().toISOString(),
      engine_id: RAG_INDEXED_ANSWER_ENGINE_ID,
      ...queryMetadata,
      answer: "RAG metadata index validation failed, so no indexed answer was generated.",
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex?.index_id ?? null,
      validation,
      citations: [],
      retrieved_units: [],
      boundary: {
        ...answerBoundary(),
        metadata_index_only: true,
      },
    };
  }

  const trace = await buildRagRetrievalTrace({
    repoRoot,
    metadataIndex,
    metadataIndexRef: options.metadataIndexRef,
    question,
    maxUnits: options.maxUnits,
    traceId: options.traceId,
    now: options.now,
  });
  const traceValidation = validateRagRetrievalTrace(trace);
  if (traceValidation.status !== "pass") {
    return {
      schema_version: RAG_ANSWER_SCHEMA_VERSION,
      kind: "rag_answer",
      status: "blocked",
      generated_at_utc: new Date().toISOString(),
      engine_id: RAG_INDEXED_ANSWER_ENGINE_ID,
      ...queryMetadata,
      answer: "RAG retrieval trace validation failed, so no indexed answer was generated.",
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex.index_id,
      validation: traceValidation,
      citations: [],
      retrieved_units: [],
      boundary: {
        ...answerBoundary(),
        metadata_index_only: true,
      },
    };
  }

  if (trace.retrieved_units.length === 0) {
    return {
      schema_version: RAG_ANSWER_SCHEMA_VERSION,
      kind: "rag_answer",
      status: "blocked_insufficient_metadata_index_evidence",
      generated_at_utc: new Date().toISOString(),
      engine_id: RAG_INDEXED_ANSWER_ENGINE_ID,
      ...queryMetadata,
      answer: "metadata-only retrieval index에서 질문과 직접 맞는 항목을 찾지 못했습니다. Manifest coverage 또는 sourcebound retrieval 확장이 필요합니다.",
      metadata_index_ref: options.metadataIndexRef ?? null,
      index_id: metadataIndex.index_id,
      manifest_ref: metadataIndex.source_refs?.manifest_ref ?? null,
      manifest_id: metadataIndex.source_refs?.manifest_id ?? null,
      claim_ceiling: "observed",
      validation,
      retrieval_trace: compactRetrievalTraceForAnswer(trace),
      retrieved_units: [],
      citations: [],
      boundary: {
        ...answerBoundary(),
        metadata_index_only: true,
      },
    };
  }

  const pseudoManifest = {
    manifest_id: metadataIndex.source_refs?.manifest_id ?? metadataIndex.index_id,
  };
  return {
    schema_version: RAG_ANSWER_SCHEMA_VERSION,
    kind: "rag_answer",
    status: "metadata_index_answer",
    generated_at_utc: new Date().toISOString(),
    engine_id: RAG_INDEXED_ANSWER_ENGINE_ID,
    ...queryMetadata,
    answer: renderMetadataAnswer({ manifest: pseudoManifest, retrievedUnits: trace.retrieved_units }),
    metadata_index_ref: options.metadataIndexRef ?? null,
    index_id: metadataIndex.index_id,
    manifest_ref: metadataIndex.source_refs?.manifest_ref ?? null,
    manifest_id: metadataIndex.source_refs?.manifest_id ?? null,
    claim_ceiling: weakestClaimCeiling(trace.retrieved_units.map((unit) => unit.claim_ceiling)),
    validation,
    retrieval_trace: compactRetrievalTraceForAnswer(trace),
    retrieved_units: trace.retrieved_units,
    citations: trace.citations,
    boundary: {
      ...answerBoundary(),
      metadata_index_only: true,
    },
  };
}

export function validateRagAnswer(answer) {
  const blockers = [];
  if (answer?.schema_version !== RAG_ANSWER_SCHEMA_VERSION) blockers.push("schema_version_mismatch");
  if (answer?.kind !== "rag_answer") blockers.push("kind_must_be_rag_answer");
  validateAllowedAnswerKeys(answer, RAG_ANSWER_ALLOWED_KEYS, blockers, "rag_answer");
  if (!RAG_ANSWER_STATUSES.has(answer?.status)) blockers.push("answer_status_unknown");
  if (!isSafeMetadataId(answer?.engine_id)) blockers.push("engine_id_unsafe");
  if (answer?.raw_question_persisted !== false) blockers.push("raw_question_persisted_must_be_false");
  if (!isSha256Hex(answer?.question_fingerprint)) blockers.push("question_fingerprint_unsafe");
  if (!Number.isInteger(answer?.query_token_count) || (answer?.query_token_count ?? -1) < 0) {
    blockers.push("query_token_count_invalid");
  }
  const queryTokenFingerprints = manifestArrayField(answer, "query_token_fingerprints", blockers, { required: false });
  if (Number.isInteger(answer?.query_token_count) && answer.query_token_count !== queryTokenFingerprints.length) {
    blockers.push("query_token_count_must_match_fingerprint_count");
  }
  for (const fingerprint of queryTokenFingerprints) {
    if (!isTokenFingerprint(fingerprint)) blockers.push("query_token_fingerprint_unsafe");
  }
  if (Object.hasOwn(answer ?? {}, "claim_ceiling") && !RAG_ANSWER_CLAIM_CEILINGS.has(answer.claim_ceiling)) {
    blockers.push("claim_ceiling_not_allowed_for_rag_answer");
  }
  const boundary = answer?.boundary ?? {};
  validateAllowedAnswerKeys(boundary, RAG_ANSWER_BOUNDARY_KEYS, blockers, "rag_answer.boundary");
  if (boundary.metadata_only !== true) blockers.push("answer_boundary_metadata_only_must_be_true");
  if (boundary.no_source_text_loaded !== true) blockers.push("answer_boundary_source_text_must_not_be_loaded");
  if (boundary.no_vector_search !== true) blockers.push("answer_boundary_vector_search_must_not_be_used");
  if (boundary.no_notebooklm_answers !== true) blockers.push("answer_boundary_notebooklm_answers_must_not_be_used");
  if (boundary.no_private_payloads !== true) blockers.push("answer_boundary_private_payloads_must_not_be_used");
  if (boundary.no_canon_or_ontology_mutation !== true) blockers.push("answer_boundary_must_not_mutate_canon_or_ontology");
  if (boundary.answer_is_navigation_signal_not_source_truth !== true) {
    blockers.push("answer_boundary_must_disclaim_source_truth");
  }
  blockers.push(...findRagAnswerSafetyBlockers(answer));
  return {
    schema_version: RAG_ANSWER_VALIDATION_SCHEMA_VERSION,
    kind: "rag_answer_validation",
    status: blockers.length === 0 ? "pass" : "blocked",
    blocker_count: blockers.length,
    blockers: [...new Set(blockers)].sort(),
    answer_status: answer?.status ?? null,
    question_fingerprint: answer?.question_fingerprint ?? null,
    boundary: {
      metadata_only: boundary.metadata_only === true,
      raw_question_persisted: answer?.raw_question_persisted === false,
      no_source_text_loaded: boundary.no_source_text_loaded === true,
      no_notebooklm_answers: boundary.no_notebooklm_answers === true,
      no_private_payloads: boundary.no_private_payloads === true,
      no_canon_or_ontology_mutation: boundary.no_canon_or_ontology_mutation === true,
    },
  };
}

export function renderAnswerText(answer) {
  const lines = [
    answer.answer,
    "",
    `상태: ${answer.status}`,
    `주장 한계: ${answer.claim_ceiling ?? "unknown"}`,
    `Manifest: ${answer.manifest_id ?? "n/a"}`,
    answer.metadata_index_ref ? `Metadata index: ${answer.metadata_index_ref}` : null,
    "근거 refs:",
  ].filter(Boolean);
  for (const citation of answer.citations ?? []) {
    lines.push(`- ${citation.ref} (${citation.role})`);
  }
  if ((answer.citations ?? []).length === 0) {
    lines.push("- 없음");
  }
  lines.push("");
  lines.push("경계: metadata-only, source text/vector/NotebookLM answers/private payloads were not loaded.");
  return `${lines.join("\n")}\n`;
}

async function loadGraph({ repoRoot, graphRef, exportId, now }) {
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
    now,
  });
  return {
    graph,
    graphRef: `in_memory:${graph.export_id}`,
    loadedFrom: "in_memory_export",
  };
}

function sourceSurfacesForManifest(graph) {
  const surfaces = graph.graph_scope?.source_surfaces ?? ["public_canon"];
  return [...new Set(surfaces.filter((surface) => surface !== "explicit_rag_manifest_refs"))].sort();
}

function unitsBySourceHandleFromManifest(manifest) {
  const byHandle = new Map();
  for (const unit of manifest.retrieval_units ?? []) {
    for (const sourceHandle of unit.source_handles ?? []) {
      byHandle.set(sourceHandle, [...(byHandle.get(sourceHandle) ?? []), unit]);
    }
  }
  return byHandle;
}

function buildSourceSliceCard({ source, units }) {
  const graphNodeRefs = [...new Set(units.map((unit) => unit.graph_node_ref).filter(Boolean))].sort();
  const claimCeiling = weakestClaimCeiling([
    source.review_state?.claim_ceiling ?? "observed",
    ...units.map((unit) => unit.claim_ceiling ?? "observed"),
  ]);
  const blockerCodes = sourceSliceBlockerCodes(source);
  return {
    source_slice_ref: `source_slice:${source.source_handle}`,
    card_schema_version: SOURCE_SLICE_CARD_SCHEMA_VERSION,
    kind: "source_slice_card",
    status: "candidate",
    source_handle: source.source_handle,
    source_kind: source.source_kind ?? "unknown",
    source_class: source.source_class ?? "metadata_only",
    source_locator_ref: source.storage_locator,
    source_hash: source.source_hash ?? null,
    sensitivity: sourceSliceSensitivity(source),
    owner_approval: source.owner_approval ?? "unknown",
    warehouse_state: source.warehouse_state ?? "observed",
    claim_ceiling: claimCeiling,
    covered_graph_node_count: graphNodeRefs.length,
    covered_graph_node_refs: graphNodeRefs.slice(0, 50),
    covered_retrieval_unit_count: units.length,
    source_access: {
      payload_state: "not_loaded",
      source_text_access: "not_requested",
      source_text_loaded: false,
      owner_source_slice_approval_required: true,
      allowed_for_source_text_retrieval: false,
    },
    planned_processing: {
      chunking_status: "not_started",
      chunk_payloads_included: false,
      bm25_index_status: "not_started",
      vector_index_status: "not_started",
      embeddings_included: false,
      retrieval_trace_status: "not_started",
      evaluation_status: "not_started",
    },
    index_readiness: {
      status: sourceSliceReadinessStatus(source, blockerCodes),
      allowed_for_index_build: false,
      next_owner_action: "approve_source_slice_before_indexing",
    },
    blocker_codes: blockerCodes,
    metadata_fingerprint: stableHash({
      source_handle: source.source_handle,
      storage_locator: source.storage_locator,
      source_hash: source.source_hash ?? null,
      graph_node_refs: graphNodeRefs,
      claim_ceiling: claimCeiling,
      blocker_codes: blockerCodes,
    }),
  };
}

function sourceSliceReadinessStatus(source, blockerCodes) {
  if (blockerCodes.includes("unsafe_source_locator")) return "blocked_unsafe_source_locator";
  if (source.source_class === "metadata_only") return "metadata_card_ready_index_blocked";
  return "metadata_card_ready_owner_approval_required";
}

function sourceSliceBlockerCodes(source) {
  const blockers = ["source_text_not_loaded", "owner_source_slice_approval_required", "index_not_built"];
  if (!isSafeMetadataRef(source.storage_locator)) blockers.push("unsafe_source_locator");
  if (source.notebooklm_use && source.notebooklm_use !== "not_included") blockers.push("notebooklm_not_allowed_for_card");
  return [...new Set(blockers)].sort();
}

function sourceSliceSensitivity(source) {
  if (isPrivateSourceLocatorRef(source.storage_locator)) {
    return source.sensitivity === "project_private_metadata" ? "project_private_metadata" : "private_metadata_only";
  }
  return source.sensitivity ?? "unknown";
}

function sourceSliceBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    chunk_payloads_included: false,
    excerpts_included: false,
    embeddings_included: false,
    bm25_index_included: false,
    vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    cards_are_not_indexes: true,
    cards_are_not_answers: true,
  };
}

function buildSourceSliceTriageItem(card) {
  const criteria = evaluateSourceSliceMetadataKnowledgeCriteria(card);
  return {
    triage_item_ref: `source_slice_triage:${stableHash(card.source_slice_ref).slice(0, 12)}`,
    source_slice_ref: card.source_slice_ref,
    source_handle: card.source_handle,
    source_locator_ref: card.source_locator_ref,
    source_hash: card.source_hash ?? null,
    source_kind: card.source_kind ?? "unknown",
    source_class: card.source_class ?? "metadata_only",
    warehouse_state: card.warehouse_state ?? "observed",
    sensitivity: card.sensitivity,
    owner_approval_observed: card.owner_approval ?? "unknown",
    claim_ceiling: card.claim_ceiling ?? "observed",
    card_status: card.status,
    covered_graph_node_count: card.covered_graph_node_count ?? 0,
    covered_graph_node_refs: (card.covered_graph_node_refs ?? []).slice(0, 50),
    blocker_codes: card.blocker_codes ?? [],
    criteria_result: criteria,
    metadata_fingerprint: stableHash({
      source_slice_ref: card.source_slice_ref,
      source_handle: card.source_handle,
      source_locator_ref: card.source_locator_ref,
      source_hash: card.source_hash ?? null,
      source_kind: card.source_kind,
      source_class: card.source_class,
      sensitivity: card.sensitivity,
      owner_approval: card.owner_approval,
      criteria,
    }),
    card_metadata_fingerprint: card.metadata_fingerprint,
  };
}

function evaluateSourceSliceMetadataKnowledgeCriteria(card) {
  const criteriaPassed = [];
  const criteriaFailed = [];
  const pass = (criterion, condition) => {
    if (condition) {
      criteriaPassed.push(criterion);
    } else {
      criteriaFailed.push(criterion);
    }
  };

  pass("source_identity", isSafeMetadataId(card.source_slice_ref) && isSafeMetadataId(card.source_handle));
  pass("storage_locator_safe", isSafeMetadataRef(card.source_locator_ref));
  pass(
    "owner_approval_basis",
    SOURCE_SLICE_METADATA_KNOWLEDGE_OWNER_APPROVAL_VALUES.has(card.owner_approval ?? "unknown"),
  );
  pass("version_state_or_hash", isSafeMetadataId(card.source_hash ?? ""));
  pass("payload_boundary", sourceSliceCardHasMetadataOnlyPayloadBoundary(card));
  pass(
    "source_class_allowed",
    SOURCE_SLICE_METADATA_KNOWLEDGE_SOURCE_CLASSES.has(card.source_class ?? "unknown"),
  );
  pass("public_safe_metadata", card.sensitivity === "public_safe_metadata");
  pass("claim_ceiling_explicit", Object.hasOwn(CLAIM_STRENGTH, card.claim_ceiling ?? "unknown"));
  pass("review_route_explicit", Array.isArray(card.blocker_codes));

  let result = "accepted_for_metadata_knowledge";
  let route = "registered_metadata_knowledge";
  if (card.blocker_codes?.includes("unsafe_source_locator") || !isSafeMetadataRef(card.source_locator_ref)) {
    result = "rejected_or_unclear";
    route = "blocked_unsafe_source_locator";
  } else if (criteriaFailed.length > 0) {
    result = "hold_candidate";
    route = "owner_review_required";
  }

  return {
    result,
    route,
    registration_scope: "rag_metadata_knowledge_only",
    claim_ceiling: card.claim_ceiling ?? "observed",
    criteria_passed: criteriaPassed.sort(),
    criteria_failed: criteriaFailed.sort(),
    evidence_refs: [
      "docs/architecture/workspace/examples/llm_wiki_bookshelf/canonical_source_intake_checklist.md",
      "docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md",
    ],
    boundary_contract: {
      metadata_only: true,
      allowed_for_rag_metadata_answer: result === "accepted_for_metadata_knowledge",
      allowed_for_source_text_retrieval: false,
      allowed_for_index_build: false,
      allowed_for_notebooklm_packet: false,
      applied_owner_decision: false,
      public_canon_promotion_allowed: false,
    },
  };
}

function sourceSliceCardHasMetadataOnlyPayloadBoundary(card) {
  return (
    card?.source_access?.payload_state === "not_loaded" &&
    card?.source_access?.source_text_loaded === false &&
    card?.source_access?.allowed_for_source_text_retrieval === false &&
    card?.planned_processing?.chunk_payloads_included === false &&
    card?.planned_processing?.embeddings_included === false &&
    card?.index_readiness?.allowed_for_index_build === false
  );
}

function buildSourceSliceReviewItemFromTriageItem(item) {
  const recommendation = sourceSliceReviewRecommendationFromTriageItem(item);
  return {
    review_item_ref: `source_slice_review:${stableHash(item.triage_item_ref).slice(0, 12)}`,
    source_slice_ref: item.source_slice_ref,
    source_handle: item.source_handle,
    source_locator_ref: item.source_locator_ref,
    sensitivity: item.sensitivity,
    owner_approval_observed: item.owner_approval_observed ?? "unknown",
    claim_ceiling: item.claim_ceiling ?? "observed",
    card_status: item.card_status ?? "candidate",
    card_index_readiness_status: recommendation.cardIndexReadinessStatus,
    covered_graph_node_count: item.covered_graph_node_count ?? 0,
    covered_graph_node_refs: (item.covered_graph_node_refs ?? []).slice(0, 50),
    blocker_codes: item.blocker_codes ?? [],
    triage_item_ref: item.triage_item_ref,
    triage_route: item.criteria_result?.route ?? "owner_review_required",
    review_priority: recommendation.reviewPriority,
    status: "pending_owner_review",
    decision: {
      status: "pending_owner_review",
      recommended_decision: recommendation.recommendedDecision,
      applied_decision: "none",
      owner_approval_granted: false,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      allowed_next_actions: [recommendation.allowedNextAction],
      required_evidence_refs: item.criteria_result?.evidence_refs ?? [],
    },
    metadata_fingerprint: stableHash({
      triage_item_ref: item.triage_item_ref,
      source_slice_ref: item.source_slice_ref,
      source_handle: item.source_handle,
      source_locator_ref: item.source_locator_ref,
      triage_route: item.criteria_result?.route,
      blocker_codes: item.blocker_codes ?? [],
    }),
    card_metadata_fingerprint: item.card_metadata_fingerprint,
  };
}

function buildSourceSliceReviewItem(card) {
  const recommendation = sourceSliceReviewRecommendation(card);
  return {
    review_item_ref: `source_slice_review:${stableHash(card.source_slice_ref).slice(0, 12)}`,
    source_slice_ref: card.source_slice_ref,
    source_handle: card.source_handle,
    source_locator_ref: card.source_locator_ref,
    sensitivity: card.sensitivity,
    owner_approval_observed: card.owner_approval ?? "unknown",
    claim_ceiling: card.claim_ceiling ?? "observed",
    card_status: card.status,
    card_index_readiness_status: card.index_readiness?.status ?? "unknown",
    covered_graph_node_count: card.covered_graph_node_count ?? 0,
    covered_graph_node_refs: (card.covered_graph_node_refs ?? []).slice(0, 50),
    blocker_codes: card.blocker_codes ?? [],
    review_priority: recommendation.reviewPriority,
    status: "pending_owner_review",
    decision: {
      status: "pending_owner_review",
      recommended_decision: recommendation.recommendedDecision,
      applied_decision: "none",
      owner_approval_granted: false,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      allowed_next_actions: [recommendation.allowedNextAction],
      required_evidence_refs: [],
    },
    metadata_fingerprint: stableHash({
      source_slice_ref: card.source_slice_ref,
      source_handle: card.source_handle,
      source_locator_ref: card.source_locator_ref,
      sensitivity: card.sensitivity,
      card_status: card.status,
      card_index_readiness_status: card.index_readiness?.status,
      blocker_codes: card.blocker_codes ?? [],
    }),
    card_metadata_fingerprint: card.metadata_fingerprint,
  };
}

function sourceSliceReviewRecommendationFromTriageItem(item) {
  if (item.criteria_result?.route === "blocked_unsafe_source_locator") {
    return {
      recommendedDecision: "block_unsafe_source_locator",
      reviewPriority: "blocked",
      allowedNextAction: "owner_block_or_fix_locator",
      cardIndexReadinessStatus: "triage_blocked_unsafe_source_locator",
    };
  }
  if (item.sensitivity && item.sensitivity !== "public_safe_metadata") {
    return {
      recommendedDecision: "private_review_required",
      reviewPriority: "private",
      allowedNextAction: "owner_private_approve_hold_or_block",
      cardIndexReadinessStatus: "triage_owner_review_required",
    };
  }
  return {
    recommendedDecision: "review_required",
    reviewPriority: "normal",
    allowedNextAction: "owner_approve_hold_or_block",
    cardIndexReadinessStatus: "triage_owner_review_required",
  };
}

function sourceSliceReviewRecommendation(card) {
  if (card.blocker_codes?.includes("unsafe_source_locator") || card.index_readiness?.status === "blocked_unsafe_source_locator") {
    return {
      recommendedDecision: "block_unsafe_source_locator",
      reviewPriority: "blocked",
      allowedNextAction: "owner_block_or_fix_locator",
    };
  }
  if (card.sensitivity && card.sensitivity !== "public_safe_metadata") {
    return {
      recommendedDecision: "private_review_required",
      reviewPriority: "private",
      allowedNextAction: "owner_private_approve_hold_or_block",
    };
  }
  return {
    recommendedDecision: "review_required",
    reviewPriority: "normal",
    allowedNextAction: "owner_approve_hold_or_block",
  };
}

function buildSourceSliceDecisionItems({ triageRegister, reviewQueue }) {
  const bySourceSliceRef = new Map();
  if (triageRegister) {
    for (const item of triageRegister.registered_items ?? []) {
      bySourceSliceRef.set(
        item.source_slice_ref,
        buildSourceSliceDecisionItemFromTriageItem(item, "registered_metadata_stronger_permission_review"),
      );
    }
    if (!reviewQueue) {
      for (const item of triageRegister.owner_review_items ?? []) {
        bySourceSliceRef.set(item.source_slice_ref, buildSourceSliceDecisionItemFromTriageItem(item, "owner_review_required"));
      }
      for (const item of triageRegister.blocked_items ?? []) {
        bySourceSliceRef.set(item.source_slice_ref, buildSourceSliceDecisionItemFromTriageItem(item, "blocked_unsafe_source_locator"));
      }
    }
  }
  for (const item of reviewQueue?.items ?? []) {
    bySourceSliceRef.set(item.source_slice_ref, buildSourceSliceDecisionItemFromReviewItem(item));
  }
  return [...bySourceSliceRef.values()].sort((left, right) => {
    const routeCompare = decisionRouteRank(left.decision_route) - decisionRouteRank(right.decision_route);
    return routeCompare || left.decision_item_ref.localeCompare(right.decision_item_ref);
  });
}

function buildSourceSliceDecisionItemFromTriageItem(item, route) {
  const defaultDecision = defaultDecisionForDecisionRoute(route);
  return {
    decision_item_ref: `source_slice_decision:${stableHash(`${route}:${item.source_slice_ref}`).slice(0, 12)}`,
    source_slice_ref: item.source_slice_ref,
    source_handle: item.source_handle,
    source_locator_ref: item.source_locator_ref,
    sensitivity: item.sensitivity,
    claim_ceiling: item.claim_ceiling ?? "observed",
    decision_route: route,
    current_registration_scope: item.criteria_result?.registration_scope ?? "rag_metadata_knowledge_only",
    current_rag_metadata_answer_allowed: item.criteria_result?.boundary_contract?.allowed_for_rag_metadata_answer === true,
    covered_graph_node_count: item.covered_graph_node_count ?? 0,
    covered_graph_node_refs: (item.covered_graph_node_refs ?? []).slice(0, 50),
    blocker_codes: item.blocker_codes ?? [],
    pending_decision: buildPendingDecision({
      defaultDecision,
      requiredEvidenceRefs: item.criteria_result?.evidence_refs ?? [],
      route,
    }),
    downstream_if_owner_approves: sourceSliceDecisionDownstreamMap(),
    metadata_fingerprint: stableHash({
      source_slice_ref: item.source_slice_ref,
      source_handle: item.source_handle,
      source_locator_ref: item.source_locator_ref,
      route,
      card_metadata_fingerprint: item.card_metadata_fingerprint ?? null,
    }),
    card_metadata_fingerprint: item.card_metadata_fingerprint ?? null,
  };
}

function buildSourceSliceDecisionItemFromReviewItem(item) {
  const route = item.decision?.recommended_decision === "block_unsafe_source_locator"
    ? "blocked_unsafe_source_locator"
    : "owner_review_required";
  const defaultDecision = defaultDecisionForDecisionRoute(route);
  return {
    decision_item_ref: `source_slice_decision:${stableHash(`${route}:${item.source_slice_ref}`).slice(0, 12)}`,
    source_slice_ref: item.source_slice_ref,
    source_handle: item.source_handle,
    source_locator_ref: item.source_locator_ref,
    sensitivity: item.sensitivity,
    claim_ceiling: item.claim_ceiling ?? "observed",
    decision_route: route,
    current_registration_scope: "owner_review_pending",
    current_rag_metadata_answer_allowed: false,
    covered_graph_node_count: item.covered_graph_node_count ?? 0,
    covered_graph_node_refs: (item.covered_graph_node_refs ?? []).slice(0, 50),
    blocker_codes: item.blocker_codes ?? [],
    pending_decision: buildPendingDecision({
      defaultDecision,
      requiredEvidenceRefs: item.decision?.required_evidence_refs ?? [],
      route,
    }),
    downstream_if_owner_approves: sourceSliceDecisionDownstreamMap(),
    metadata_fingerprint: stableHash({
      source_slice_ref: item.source_slice_ref,
      source_handle: item.source_handle,
      source_locator_ref: item.source_locator_ref,
      route,
      card_metadata_fingerprint: item.card_metadata_fingerprint ?? null,
    }),
    card_metadata_fingerprint: item.card_metadata_fingerprint ?? null,
  };
}

function buildPendingDecision({ defaultDecision, requiredEvidenceRefs, route }) {
  return {
    status: "pending_owner_decision",
    applied_decision: "none",
    owner_decision_ref: null,
    default_decision: defaultDecision,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
    notebooklm_packet_allowed: false,
    public_canon_promotion_allowed: false,
    allowed_next_actions: allowedNextActionsForDecisionRoute(route),
    required_evidence_refs: requiredEvidenceRefs,
  };
}

function defaultDecisionForDecisionRoute(route) {
  if (route === "blocked_unsafe_source_locator") return "block_unsafe_source_locator";
  if (route === "owner_review_required") return "hold_for_owner_review";
  return "keep_metadata_only";
}

function allowedNextActionsForDecisionRoute(route) {
  if (route === "blocked_unsafe_source_locator") {
    return ["owner_block_unsafe_source_locator", "owner_fix_source_locator"];
  }
  if (route === "owner_review_required") {
    return ["owner_keep_metadata_only", "owner_hold", "owner_block", "owner_explicit_source_permission"];
  }
  return ["owner_keep_metadata_only", "owner_explicit_source_permission", "owner_hold", "owner_block"];
}

function sourceSliceDecisionDownstreamMap() {
  return {
    source_text_retrieval: "create_sourcebound_source_packet_after_owner_decision",
    index_build: "create_index_build_packet_after_source_text_boundary_validation",
    notebooklm_packet: "create_notebooklm_packet_map_candidate_after_owner_decision",
    public_canon: "route_to_public_canon_review_after_separate_owner_approval",
  };
}

function buildSourceSliceOwnerDecisionRecordItem(item) {
  return {
    decision_record_item_ref: `source_slice_owner_decision:${stableHash(item.decision_item_ref).slice(0, 12)}`,
    decision_item_ref: item.decision_item_ref,
    source_slice_ref: item.source_slice_ref,
    source_handle: item.source_handle,
    source_locator_ref: item.source_locator_ref,
    sensitivity: item.sensitivity,
    claim_ceiling: item.claim_ceiling ?? "observed",
    decision_route: item.decision_route,
    applied_decision: "keep_metadata_only",
    owner_approval_granted: false,
    current_rag_metadata_answer_allowed: item.current_rag_metadata_answer_allowed === true,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
    notebooklm_packet_allowed: false,
    public_canon_promotion_allowed: false,
    metadata_fingerprint: stableHash({
      decision_item_ref: item.decision_item_ref,
      source_slice_ref: item.source_slice_ref,
      source_handle: item.source_handle,
      applied_decision: "keep_metadata_only",
    }),
  };
}

function buildMetadataDecisionState({ decisionPacket, ownerDecisionRecord }) {
  const bySourceHandle = new Map();
  for (const item of decisionPacket?.items ?? []) {
    bySourceHandle.set(item.source_handle, {
      source_handle: item.source_handle,
      current_rag_metadata_answer_allowed: item.current_rag_metadata_answer_allowed === true,
      applied_decision: "pending",
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_allowed: false,
      public_canon_promotion_allowed: false,
    });
  }
  for (const item of ownerDecisionRecord?.items ?? []) {
    bySourceHandle.set(item.source_handle, {
      source_handle: item.source_handle,
      current_rag_metadata_answer_allowed: item.current_rag_metadata_answer_allowed === true,
      applied_decision: item.applied_decision,
      source_text_retrieval_allowed: false,
      index_build_allowed: false,
      notebooklm_packet_allowed: false,
      public_canon_promotion_allowed: false,
    });
  }
  return bySourceHandle;
}

function buildMetadataIndexDocuments({ manifest, decisionState }) {
  return (manifest.retrieval_units ?? [])
    .filter(isAnswerEligibleUnit)
    .filter((unit) => unitAllowedForMetadataIndex(unit, decisionState))
    .map((unit) => {
      const tokenFingerprintCounts = tokenFingerprintCountMap([
        unit.graph_node_ref,
        unit.title_label,
        unit.summary,
        unit.node_type,
        unit.owner_surface,
        unit.claim_ceiling,
        unit.lifecycle_status,
      ]);
      return {
        document_ref: unit.unit_ref,
        graph_node_ref: unit.graph_node_ref,
        title_label: unit.title_label ?? unit.graph_node_ref,
        summary: unit.summary ?? null,
        node_type: unit.node_type ?? "unknown_node",
        owner_surface: unit.owner_surface ?? null,
        claim_ceiling: unit.claim_ceiling ?? "observed",
        lifecycle_status: unit.lifecycle_status ?? "unknown",
        payload_state: "metadata_only",
        token_fingerprint_count: Object.values(tokenFingerprintCounts).reduce((total, count) => total + count, 0),
        token_fingerprint_counts: tokenFingerprintCounts,
        metadata_fingerprint: stableHash({
          unit_ref: unit.unit_ref,
          graph_node_ref: unit.graph_node_ref,
          title_label: unit.title_label,
          summary: unit.summary,
        }),
      };
    })
    .sort((left, right) => left.document_ref.localeCompare(right.document_ref));
}

function unitAllowedForMetadataIndex(unit, decisionState) {
  if (decisionState.size === 0) return true;
  const handles = unit.source_handles ?? [];
  if (handles.length === 0) return true;
  return handles.every((handle) => {
    const state = decisionState.get(handle);
    return !state || state.current_rag_metadata_answer_allowed === true;
  });
}

function tokenFingerprintCountMap(values) {
  const counts = {};
  for (const value of values) {
    for (const token of tokenize(value)) {
      const fingerprint = tokenFingerprint(token);
      counts[fingerprint] = (counts[fingerprint] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildLexicalTokenPostings(documents) {
  const postingsByToken = new Map();
  for (const document of documents) {
    for (const [fingerprint, count] of Object.entries(document.token_fingerprint_counts ?? {})) {
      postingsByToken.set(fingerprint, [
        ...(postingsByToken.get(fingerprint) ?? []),
        {
          document_ref: document.document_ref,
          count,
        },
      ]);
    }
  }
  return [...postingsByToken.entries()]
    .map(([fingerprint, postings]) => ({
      token_fingerprint: fingerprint,
      document_count: postings.length,
      postings: postings.sort((left, right) => left.document_ref.localeCompare(right.document_ref)),
    }))
    .sort((left, right) => left.token_fingerprint.localeCompare(right.token_fingerprint));
}

function retrieveUnitsFromMetadataIndex({ metadataIndex, question, maxUnits }) {
  const queryTokenFingerprints = tokenFingerprintsForValue(question);
  const documentsByRef = new Map((metadataIndex.documents ?? []).map((document) => [document.document_ref, document]));
  const scoreByRef = new Map();
  const reasonsByRef = new Map();
  const postingsByToken = new Map(
    (metadataIndex.lexical_index?.token_postings ?? []).map((posting) => [posting.token_fingerprint, posting.postings ?? []]),
  );
  for (const fingerprint of queryTokenFingerprints) {
    for (const posting of postingsByToken.get(fingerprint) ?? []) {
      const scoreDelta = 2 + posting.count;
      scoreByRef.set(posting.document_ref, (scoreByRef.get(posting.document_ref) ?? 0) + scoreDelta);
      reasonsByRef.set(posting.document_ref, [
        ...(reasonsByRef.get(posting.document_ref) ?? []),
        `metadata_term_fingerprint:${fingerprint}`,
      ]);
    }
  }
  return [...scoreByRef.entries()]
    .map(([documentRef, score]) => {
      const document = documentsByRef.get(documentRef);
      return {
        unit_ref: document.document_ref,
        graph_node_ref: document.graph_node_ref,
        title_label: document.title_label,
        summary: document.summary,
        node_type: document.node_type,
        score: score + Math.min(CLAIM_STRENGTH[document.claim_ceiling] ?? 0, 2),
        match_reasons: [...new Set(reasonsByRef.get(documentRef) ?? [])].sort(),
        claim_ceiling: document.claim_ceiling,
        retrieval_status: "metadata_index",
      };
    })
    .filter((unit) => unit.score >= MIN_ANSWER_SCORE && unit.match_reasons.length >= MIN_ANSWER_MATCH_REASONS)
    .sort((left, right) => right.score - left.score || left.unit_ref.localeCompare(right.unit_ref))
    .slice(0, maxUnits);
}

function buildSelfRetrievalEvaluationCases(metadataIndex) {
  return (metadataIndex.documents ?? [])
    .filter((document) => tokenize(document.title_label).size > 0)
    .slice(0, 10)
    .map((document, index) => {
      const retrieved = retrieveUnitsFromMetadataIndex({
        metadataIndex,
        question: document.title_label,
        maxUnits: 5,
      });
      const rank = retrieved.findIndex((unit) => unit.unit_ref === document.document_ref);
      return {
        case_id: `self_retrieval_${String(index + 1).padStart(2, "0")}`,
        query_source: "document_title_label_metadata",
        query_fingerprint: stableHash(`evaluation_query:${document.document_ref}:${document.title_label}`),
        query_token_fingerprints: tokenFingerprintsForValue(document.title_label),
        expected_document_ref: document.document_ref,
        observed_rank: rank === -1 ? null : rank + 1,
        status: rank === -1 ? "fail" : "pass",
        retrieved_document_refs: retrieved.map((unit) => unit.unit_ref),
      };
    });
}

function sourceSliceReviewQueueBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    queue_is_not_owner_approval: true,
    queue_applies_no_decisions: true,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
  };
}

function sourceSliceTriageRegisterBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    register_is_not_owner_approval: true,
    register_applies_no_source_text_decisions: true,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
  };
}

function sourceSliceDecisionPacketBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    packet_is_not_owner_approval: true,
    packet_applies_no_decisions: true,
    stronger_permissions_default_false: true,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
    notebooklm_packet_allowed: false,
    public_canon_promotion_allowed: false,
  };
}

function sourceSliceOwnerDecisionRecordBoundary() {
  return {
    metadata_only: true,
    source_payloads_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    record_is_not_owner_approval: true,
    record_applies_no_stronger_permissions: true,
    source_text_retrieval_allowed: false,
    index_build_allowed: false,
    notebooklm_packet_allowed: false,
    public_canon_promotion_allowed: false,
  };
}

function ragMetadataIndexBoundary() {
  return {
    metadata_only: true,
    metadata_index_only: true,
    source_payloads_included: false,
    source_text_loaded: false,
    chunk_payloads_included: false,
    excerpts_included: false,
    embeddings_included: false,
    bm25_source_index_included: false,
    vector_index_included: false,
    notebooklm_answers_included: false,
    secrets_or_session_included: false,
    runtime_absolute_paths_included: false,
    source_text_retrieval_allowed: false,
    source_text_index_build_allowed: false,
    notebooklm_packet_allowed: false,
    public_canon_promotion_allowed: false,
    artifact_is_not_owner_approval: true,
    artifact_is_not_source_truth: true,
  };
}

function validateMetadataRetrievalBoundary(boundary, blockers) {
  if (boundary.metadata_only !== true) blockers.push("boundary_metadata_only_must_be_true");
  if (boundary.metadata_index_only !== true) blockers.push("boundary_metadata_index_only_must_be_true");
  if (boundary.source_payloads_included !== false) blockers.push("source_payloads_must_not_be_included");
  if (boundary.source_text_loaded !== false) blockers.push("source_text_loaded_must_be_false");
  if (boundary.chunk_payloads_included !== false) blockers.push("chunk_payloads_must_not_be_included");
  if (boundary.excerpts_included !== false) blockers.push("excerpts_must_not_be_included");
  if (boundary.embeddings_included !== false) blockers.push("embeddings_must_not_be_included");
  if (boundary.bm25_source_index_included !== false) blockers.push("bm25_source_index_must_not_be_included");
  if (boundary.vector_index_included !== false) blockers.push("vector_index_must_not_be_included");
  if (boundary.notebooklm_answers_included !== false) blockers.push("notebooklm_answers_must_not_be_included");
  if (boundary.secrets_or_session_included !== false) blockers.push("secrets_or_session_must_not_be_included");
  if (boundary.runtime_absolute_paths_included !== false) blockers.push("runtime_absolute_paths_must_not_be_included");
  if (boundary.source_text_retrieval_allowed !== false) blockers.push("source_text_retrieval_must_not_be_allowed");
  if (boundary.source_text_index_build_allowed !== false) blockers.push("source_text_index_build_must_not_be_allowed");
  if (boundary.notebooklm_packet_allowed !== false) blockers.push("notebooklm_packet_must_not_be_allowed");
  if (boundary.public_canon_promotion_allowed !== false) blockers.push("public_canon_promotion_must_not_be_allowed");
  if (boundary.artifact_is_not_owner_approval !== true) blockers.push("artifact_must_not_be_owner_approval");
  if (boundary.artifact_is_not_source_truth !== true) blockers.push("artifact_must_not_be_source_truth");
}

function metadataRetrievalBoundarySummary(boundary) {
  return {
    metadata_only: boundary.metadata_only === true,
    metadata_index_only: boundary.metadata_index_only === true,
    no_source_payloads: boundary.source_payloads_included === false,
    no_source_text_loaded: boundary.source_text_loaded === false,
    no_chunk_payloads: boundary.chunk_payloads_included === false,
    no_excerpts: boundary.excerpts_included === false,
    no_embeddings: boundary.embeddings_included === false,
    no_bm25_source_index: boundary.bm25_source_index_included === false,
    no_vector_index: boundary.vector_index_included === false,
    no_notebooklm_answers: boundary.notebooklm_answers_included === false,
    no_secrets_or_session: boundary.secrets_or_session_included === false,
    no_runtime_absolute_paths: boundary.runtime_absolute_paths_included === false,
    no_source_text_retrieval: boundary.source_text_retrieval_allowed === false,
    no_source_text_index_build: boundary.source_text_index_build_allowed === false,
    not_owner_approval: boundary.artifact_is_not_owner_approval === true,
    not_source_truth: boundary.artifact_is_not_source_truth === true,
  };
}

function compactRetrievalTraceForAnswer(trace) {
  return {
    trace_id: trace.trace_id,
    status: trace.status,
    question_fingerprint: trace.question_fingerprint,
    query_token_count: trace.query_token_count,
    query_token_fingerprints: trace.query_token_fingerprints ?? [],
    retrieved_unit_count: trace.retrieved_units?.length ?? 0,
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function findSourceSliceShapeBlockers(value, trail = "source_slice_card_set") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findSourceSliceShapeBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (!SOURCE_SLICE_ALLOWED_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_disallowed_key:${trail}.${key}`);
    }
    if (FORBIDDEN_SOURCE_SLICE_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_forbidden_payload_or_index_key:${trail}.${key}`);
    }
    blockers.push(...findSourceSliceShapeBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function findSourceSliceTriageRegisterShapeBlockers(value, trail = "source_slice_triage_register") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findSourceSliceTriageRegisterShapeBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (!SOURCE_SLICE_TRIAGE_REGISTER_ALLOWED_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_triage_register_disallowed_key:${trail}.${key}`);
    }
    if (FORBIDDEN_SOURCE_SLICE_TRIAGE_REGISTER_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_triage_register_forbidden_payload_or_index_key:${trail}.${key}`);
    }
    blockers.push(...findSourceSliceTriageRegisterShapeBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function findSourceSliceReviewQueueShapeBlockers(value, trail = "source_slice_review_queue") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findSourceSliceReviewQueueShapeBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (!SOURCE_SLICE_REVIEW_QUEUE_ALLOWED_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_review_queue_disallowed_key:${trail}.${key}`);
    }
    if (FORBIDDEN_SOURCE_SLICE_REVIEW_QUEUE_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_review_queue_forbidden_payload_or_index_key:${trail}.${key}`);
    }
    blockers.push(...findSourceSliceReviewQueueShapeBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function findSourceSliceDecisionPacketShapeBlockers(value, trail = "source_slice_decision_packet") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findSourceSliceDecisionPacketShapeBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (!SOURCE_SLICE_DECISION_PACKET_ALLOWED_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_decision_packet_disallowed_key:${trail}.${key}`);
    }
    if (FORBIDDEN_SOURCE_SLICE_DECISION_PACKET_KEYS.has(normalizedKey)) {
      blockers.push(`source_slice_decision_packet_forbidden_payload_or_index_key:${trail}.${key}`);
    }
    blockers.push(...findSourceSliceDecisionPacketShapeBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function validateSourceSliceTriageItems(items, blockers, expected) {
  const triageItemRefs = new Set();
  const sourceSliceRefs = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      blockers.push("triage_item_must_be_object");
      continue;
    }
    if (!isSafeMetadataId(item.triage_item_ref)) blockers.push("triage_item_ref_unsafe");
    if (!isSafeMetadataId(item.source_slice_ref)) blockers.push("triage_item_source_slice_ref_unsafe");
    if (!isSafeMetadataId(item.source_handle)) blockers.push("triage_item_source_handle_unsafe");
    if (!isSafeMetadataRef(item.source_locator_ref)) blockers.push("triage_item_source_locator_ref_unsafe");
    if (triageItemRefs.has(item.triage_item_ref)) blockers.push("triage_item_ref_duplicate");
    triageItemRefs.add(item.triage_item_ref);
    if (sourceSliceRefs.has(item.source_slice_ref)) blockers.push("triage_item_source_slice_ref_duplicate");
    sourceSliceRefs.add(item.source_slice_ref);
    if (!Object.hasOwn(CLAIM_STRENGTH, item.claim_ceiling ?? "unknown")) blockers.push("triage_item_claim_ceiling_unknown");
    if (!isSafeMetadataId(item.card_metadata_fingerprint)) blockers.push("triage_item_card_metadata_fingerprint_unsafe");
    if (!isSafeMetadataId(item.metadata_fingerprint)) blockers.push("triage_item_metadata_fingerprint_unsafe");
    validateSourceSliceTriageCriteria(item, blockers, expected);
    for (const ref of manifestArrayField(item, "covered_graph_node_refs", blockers, { required: false })) {
      if (!isSafeMetadataRef(ref)) blockers.push("triage_item_covered_graph_node_ref_unsafe");
    }
    for (const code of manifestArrayField(item, "blocker_codes", blockers, { required: false })) {
      if (!isSafeMetadataId(code)) blockers.push("triage_item_blocker_code_unsafe");
    }
  }
}

function validateSourceSliceTriageCriteria(item, blockers, expected) {
  const criteria = item.criteria_result ?? {};
  if (criteria.result !== expected.result) blockers.push(`triage_item_result_must_be_${expected.result}`);
  if (criteria.route !== expected.route) blockers.push(`triage_item_route_must_be_${expected.route}`);
  if (criteria.registration_scope !== "rag_metadata_knowledge_only") {
    blockers.push("triage_item_registration_scope_must_be_rag_metadata_knowledge_only");
  }
  if (!Object.hasOwn(CLAIM_STRENGTH, criteria.claim_ceiling ?? "unknown")) {
    blockers.push("triage_item_criteria_claim_ceiling_unknown");
  }
  for (const criterion of manifestArrayField(criteria, "criteria_passed", blockers, { required: false })) {
    if (!isSafeMetadataId(criterion)) blockers.push("triage_item_criteria_passed_unsafe");
  }
  for (const criterion of manifestArrayField(criteria, "criteria_failed", blockers, { required: false })) {
    if (!isSafeMetadataId(criterion)) blockers.push("triage_item_criteria_failed_unsafe");
  }
  for (const ref of manifestArrayField(criteria, "evidence_refs", blockers, { required: false })) {
    if (!isSafeMetadataRef(ref)) blockers.push("triage_item_evidence_ref_unsafe");
  }
  const boundary = criteria.boundary_contract ?? {};
  if (boundary.metadata_only !== true) blockers.push("triage_item_boundary_metadata_only_must_be_true");
  if (boundary.allowed_for_source_text_retrieval !== false) {
    blockers.push("triage_item_source_text_retrieval_must_not_be_allowed");
  }
  if (boundary.allowed_for_index_build !== false) blockers.push("triage_item_index_build_must_not_be_allowed");
  if (boundary.allowed_for_notebooklm_packet !== false) blockers.push("triage_item_notebooklm_packet_must_not_be_allowed");
  if (boundary.applied_owner_decision !== false) blockers.push("triage_item_applied_owner_decision_must_be_false");
  if (boundary.public_canon_promotion_allowed !== false) {
    blockers.push("triage_item_public_canon_promotion_must_not_be_allowed");
  }
  if (expected.route === "registered_metadata_knowledge" && boundary.allowed_for_rag_metadata_answer !== true) {
    blockers.push("triage_item_registered_metadata_answer_must_be_allowed");
  }
  if (expected.route !== "registered_metadata_knowledge" && boundary.allowed_for_rag_metadata_answer !== false) {
    blockers.push("triage_item_unregistered_metadata_answer_must_not_be_allowed");
  }
}

function validateStandingOwnerPolicy(policy, blockers) {
  if (!isSafeMetadataId(policy.policy_ref)) blockers.push("standing_owner_policy_ref_unsafe");
  if (policy.owner_defined_criteria_are_policy !== true) {
    blockers.push("standing_owner_policy_owner_criteria_must_be_policy");
  }
  if (policy.auto_register_passed_metadata !== true) {
    blockers.push("standing_owner_policy_must_auto_register_passed_metadata");
  }
  if (policy.stronger_permissions_default_false !== true) {
    blockers.push("standing_owner_policy_stronger_permissions_must_default_false");
  }
  const grants = policy.grants ?? {};
  if (grants.metadata_knowledge !== true) blockers.push("standing_owner_policy_metadata_knowledge_must_be_granted");
  if (grants.source_text_retrieval !== false) {
    blockers.push("standing_owner_policy_source_text_retrieval_must_not_be_granted");
  }
  if (grants.index_build !== false) blockers.push("standing_owner_policy_index_build_must_not_be_granted");
  if (grants.notebooklm_packet !== false) blockers.push("standing_owner_policy_notebooklm_packet_must_not_be_granted");
  if (grants.public_canon !== false) blockers.push("standing_owner_policy_public_canon_must_not_be_granted");
}

function validateSourceSliceReviewDecision(item, blockers) {
  if (!["blocked", "normal", "private"].includes(item.review_priority)) {
    blockers.push("review_item_priority_unknown");
  }
  if (item.status !== "pending_owner_review") blockers.push("review_item_status_must_be_pending_owner_review");
  const decision = item.decision ?? {};
  if (decision.status !== "pending_owner_review") blockers.push("review_decision_status_must_be_pending_owner_review");
  if (!["block_unsafe_source_locator", "private_review_required", "review_required"].includes(decision.recommended_decision)) {
    blockers.push("review_decision_recommended_decision_unknown");
  }
  if (decision.applied_decision !== "none") blockers.push("review_decision_applied_decision_must_be_none");
  if (decision.owner_approval_granted !== false) blockers.push("review_decision_owner_approval_must_not_be_granted");
  if (decision.source_text_retrieval_allowed !== false) blockers.push("review_decision_source_text_retrieval_must_not_be_allowed");
  if (decision.index_build_allowed !== false) blockers.push("review_decision_index_build_must_not_be_allowed");
  const allowedNextActions = manifestArrayField(decision, "allowed_next_actions", blockers, { required: false });
  for (const action of allowedNextActions) {
    if (!isSafeMetadataId(action)) blockers.push("review_decision_allowed_next_action_unsafe");
  }
}

function validateSourceSlicePendingDecision(item, blockers) {
  const decision = item.pending_decision ?? {};
  if (decision.status !== "pending_owner_decision") blockers.push("pending_decision_status_must_be_pending_owner_decision");
  if (decision.applied_decision !== "none") blockers.push("pending_decision_applied_decision_must_be_none");
  if (decision.owner_decision_ref !== null && !isSafeMetadataRef(decision.owner_decision_ref)) {
    blockers.push("pending_decision_owner_decision_ref_unsafe");
  }
  if (!SOURCE_SLICE_PENDING_DECISIONS.has(decision.default_decision)) blockers.push("pending_decision_default_decision_unknown");
  if (decision.source_text_retrieval_allowed !== false) {
    blockers.push("pending_decision_source_text_retrieval_must_not_be_allowed");
  }
  if (decision.index_build_allowed !== false) blockers.push("pending_decision_index_build_must_not_be_allowed");
  if (decision.notebooklm_packet_allowed !== false) blockers.push("pending_decision_notebooklm_packet_must_not_be_allowed");
  if (decision.public_canon_promotion_allowed !== false) {
    blockers.push("pending_decision_public_canon_promotion_must_not_be_allowed");
  }
  const allowedNextActions = manifestArrayField(decision, "allowed_next_actions", blockers, { required: false });
  for (const action of allowedNextActions) {
    if (!isSafeMetadataId(action)) blockers.push("pending_decision_allowed_next_action_unsafe");
  }
  for (const ref of manifestArrayField(decision, "required_evidence_refs", blockers, { required: false })) {
    if (!isSafeMetadataRef(ref)) blockers.push("pending_decision_required_evidence_ref_unsafe");
  }
}

function reviewPriorityRank(value) {
  if (value === "blocked") return 0;
  if (value === "private") return 1;
  return 2;
}

function decisionRouteRank(value) {
  if (value === "blocked_unsafe_source_locator") return 0;
  if (value === "owner_review_required") return 1;
  return 2;
}

function triageRouteRank(value) {
  if (value === "blocked_unsafe_source_locator") return 0;
  if (value === "owner_review_required") return 1;
  return 2;
}

function validateMetadataGraph(graph) {
  if (graph?.schema_version !== KNOWLEDGE_GRAPH_SCHEMA_VERSION) {
    throw new Error(`rag manifest requires ${KNOWLEDGE_GRAPH_SCHEMA_VERSION} graph data`);
  }
  if (graph?.boundary?.metadata_only !== true || graph?.graph_scope?.metadata_only !== true) {
    throw new Error("rag manifest only accepts metadata-only graph data");
  }
}

function collectMetadataSources(graph) {
  const sourceByLocator = new Map();
  for (const item of [...(graph.nodes ?? []), ...(graph.edges ?? [])]) {
    for (const locator of Object.values(item.source_refs ?? {}).filter(Boolean)) {
      if (!isSafeMetadataRef(locator)) {
        continue;
      }
      const sourceHandle = `source_${stableHash(locator).slice(0, 12)}`;
      if (!sourceByLocator.has(locator)) {
        sourceByLocator.set(locator, {
          source_handle: sourceHandle,
          title_label: path.posix.basename(String(locator)),
          source_kind: "repo_metadata_ref",
          source_class: "metadata_only",
          warehouse_state: "observed",
          storage_locator: locator,
          version: null,
          source_hash: stableHash(locator),
          owner_approval: "public_canon_or_explicit_metadata",
          sensitivity: locator.startsWith("_workmeta/") ? "private_metadata_only" : "public_safe_metadata",
          notebooklm_use: "not_included",
          review_state: {
            claim_ceiling: "observed",
          },
          tags: {
            domains: [],
            projects: [],
            organizations: [],
          },
          audit: {
            created_at_utc: null,
            updated_at_utc: null,
          },
        });
      }
    }
  }
  return sourceByLocator;
}

function buildRetrievalUnits(graph, sourceByLocator) {
  return (graph.nodes ?? [])
    .map((node) => {
      const sourceHandles = Object.values(node.source_refs ?? {})
        .filter(Boolean)
        .filter((locator) => sourceByLocator.has(locator))
        .map((locator) => sourceByLocator.get(locator).source_handle);
      const claimCeiling = node.trust?.claim_ceiling ?? "unknown";
      const retrievalStatus = retrievalStatusForNode(node);
      return {
        unit_ref: `graph_node:${node.node_ref}`,
        unit_type: "graph_node_metadata",
        graph_node_ref: node.node_ref,
        source_handles: [...new Set(sourceHandles)].sort(),
        title_label: node.label ?? node.node_ref,
        summary: node.summary ?? null,
        node_type: node.node_type ?? "unknown_node",
        owner_surface: node.owner_surface ?? null,
        claim_ceiling: claimCeiling,
        lifecycle_status: node.lifecycle?.status ?? "unknown",
        retrieval: {
          status: retrievalStatus,
          allowed_for_retrieval: retrievalStatus !== "blocked",
          allowed_modes: ["metadata_graph_answer"],
          blocker_code: retrievalStatus === "blocked" ? "blocked_or_rejected_claim" : null,
          next_owner_action_ref: null,
        },
        payload_state: "not_in_manifest",
        content_hash_or_null: stableHash({
          node_ref: node.node_ref,
          label: node.label,
          summary: node.summary,
          node_type: node.node_type,
        }),
        token_count_or_null: tokenize(`${node.node_ref} ${node.label ?? ""} ${node.summary ?? ""} ${node.node_type ?? ""}`).size,
      };
    })
    .sort((left, right) => left.unit_ref.localeCompare(right.unit_ref));
}

function buildGraphBindings(graph) {
  return (graph.edges ?? [])
    .map((edge) => ({
      binding_ref: edge.edge_ref,
      from_ref: edge.from_ref,
      to_ref: edge.to_ref,
      relation_type: edge.relation_type,
      relation_state: edge.relation_state ?? "unknown",
      directed: edge.directed !== false,
      evidence_event_count: edge.metrics?.evidence_event_count ?? 0,
      claim_ceiling_hint: edge.claim_ceiling_hint ?? null,
      source_refs: edge.source_refs ?? {},
    }))
    .sort((left, right) => left.binding_ref.localeCompare(right.binding_ref));
}

function retrievalStatusForNode(node) {
  if (node.lifecycle?.status === "blocked" || node.trust?.claim_ceiling === "rejected_or_blocked") {
    return "blocked";
  }
  return "metadata_only";
}

function retrieveUnits({ manifest, question, maxUnits }) {
  const queryTokens = tokenize(question);
  return (manifest.retrieval_units ?? [])
    .filter(isAnswerEligibleUnit)
    .map((unit) => {
      const labelTokens = tokenize(unit.title_label);
      const refTokens = tokenize(unit.graph_node_ref);
      const summaryTokens = tokenize(unit.summary);
      const typeTokens = tokenize(unit.node_type);
      let score = 0;
      const matchReasons = [];
      for (const token of queryTokens) {
        if (labelTokens.has(token)) {
          score += 6;
          matchReasons.push(`label:${token}`);
        }
        if (refTokens.has(token)) {
          score += 4;
          matchReasons.push(`ref:${token}`);
        }
        if (summaryTokens.has(token)) {
          score += 3;
          matchReasons.push(`summary:${token}`);
        }
        if (typeTokens.has(token)) {
          score += 1;
          matchReasons.push(`type:${token}`);
        }
      }
      if (matchReasons.length >= MIN_ANSWER_MATCH_REASONS) {
        score += Math.min(CLAIM_STRENGTH[unit.claim_ceiling] ?? 0, 2);
      }
      return {
        unit_ref: unit.unit_ref,
        graph_node_ref: unit.graph_node_ref,
        title_label: unit.title_label,
        summary: unit.summary,
        node_type: unit.node_type,
        score,
        match_reasons: [...new Set(matchReasons)],
        claim_ceiling: unit.claim_ceiling,
        retrieval_status: unit.retrieval?.status ?? "unknown",
        source_handles: unit.source_handles ?? [],
      };
    })
    .filter((unit) => unit.score >= MIN_ANSWER_SCORE && unit.match_reasons.length >= MIN_ANSWER_MATCH_REASONS)
    .sort((left, right) => right.score - left.score || left.unit_ref.localeCompare(right.unit_ref))
    .slice(0, maxUnits);
}

function isAnswerEligibleUnit(unit) {
  if (unit?.claim_ceiling === "rejected_or_blocked") return false;
  const retrieval = unit?.retrieval ?? {};
  if (retrieval.status === "blocked") return false;
  if (retrieval.allowed_for_retrieval === false) return false;
  return true;
}

function renderMetadataAnswer({ manifest, retrievedUnits }) {
  const top = retrievedUnits[0];
  const supporting = retrievedUnits
    .slice(1)
    .map((unit) => unit.title_label)
    .join(", ");
  const supportText = supporting ? ` 함께 참고된 항목은 ${supporting}입니다.` : "";
  return [
    `metadata-only RAG 결과에서 가장 가까운 항목은 "${top.title_label}"입니다.`,
    top.summary ? `요약 신호: ${top.summary}` : "이 항목은 현재 요약보다 식별자/관계 메타데이터 중심으로 검색되었습니다.",
    `Manifest ${manifest.manifest_id} 기준이며, 검색 상태는 ${top.retrieval_status}, 주장 한계는 ${top.claim_ceiling}입니다.`,
    supportText,
    "이 답변은 근거 refs를 따라 다음 sourcebound retrieval 또는 owner review로 이어지기 위한 초안 답변입니다.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildCitations(retrievedUnits) {
  const citations = [];
  for (const unit of retrievedUnits) {
    citations.push({
      ref: unit.graph_node_ref,
      role: "retrieved_graph_node",
      label: unit.title_label,
      claim_ceiling: unit.claim_ceiling,
      score: unit.score,
    });
    for (const sourceHandle of unit.source_handles ?? []) {
      citations.push({
        ref: sourceHandle,
        role: "source_handle",
        label: unit.title_label,
        claim_ceiling: unit.claim_ceiling,
        score: unit.score,
      });
    }
  }
  return citations.slice(0, 20);
}

function answerBoundary() {
  return {
    metadata_only: true,
    no_source_text_loaded: true,
    no_vector_search: true,
    no_notebooklm_answers: true,
    no_private_payloads: true,
    no_canon_or_ontology_mutation: true,
    answer_is_navigation_signal_not_source_truth: true,
  };
}

function buildAnswerQueryMetadata(question) {
  return {
    question_fingerprint: stableHash(`query:${question}`),
    query_token_count: tokenize(question).size,
    query_token_fingerprints: tokenFingerprintsForValue(question),
    raw_question_persisted: false,
  };
}

function hasForbiddenPayloadFields(unit) {
  const forbidden = ["chunk_text", "source_text", "body_text", "excerpt", "notebooklm_answer_text", "raw_payload"];
  return forbidden.some((key) => Object.prototype.hasOwnProperty.call(unit, key));
}

function isSafeMetadataRef(value) {
  const ref = String(value ?? "");
  if (!ref || path.isAbsolute(ref) || ref.includes("..")) return false;
  if (ref.includes("\\") || ref.startsWith("~") || /[\u0000-\u001F\u007F]/u.test(ref)) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(ref)) return false;
  if (/[A-Za-z]:[\\/]/.test(ref)) return false;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(ref)) return false;
  if (/(^|[/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([/_.-]|$)/i.test(ref)) {
    return false;
  }
  if (
    ref.startsWith("_workspaces/") &&
    !ref.startsWith("_workspaces/system/knowledge_view/") &&
    !ref.startsWith("_workspaces/system/rag/")
  ) {
    return false;
  }
  return true;
}

function safeRagOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (!ref.startsWith(`${DEFAULT_MANIFEST_ROOT}/`)) {
    throw new Error("rag manifest output must be under _workspaces/system/rag/manifests/");
  }
  return ref;
}

function safeSourceSliceOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_SLICE_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_cards\//.test(ref)
  ) {
    throw new Error("source slice card output must be under _workspaces/system/rag/source_slice_cards/ or _workmeta/<project_code>/reports/rag/source_slice_cards/");
  }
  return ref;
}

function safeSourceSliceTriageRegisterOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_SLICE_TRIAGE_REGISTER_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_triage_register\//.test(ref)
  ) {
    throw new Error("source slice triage register output must be under _workmeta/system/reports/rag/source_slice_triage_register/ or _workmeta/<project_code>/reports/rag/source_slice_triage_register/");
  }
  return ref;
}

function safeSourceSliceReviewQueueOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_SLICE_REVIEW_QUEUE_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_review_queue\//.test(ref)
  ) {
    throw new Error("source slice review queue output must be under _workmeta/system/reports/rag/source_slice_review_queue/ or _workmeta/<project_code>/reports/rag/source_slice_review_queue/");
  }
  return ref;
}

function safeSourceSliceDecisionPacketOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_SLICE_DECISION_PACKET_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_decision_packets\//.test(ref)
  ) {
    throw new Error("source slice decision packet output must be under _workmeta/system/reports/rag/source_slice_decision_packets/ or _workmeta/<project_code>/reports/rag/source_slice_decision_packets/");
  }
  return ref;
}

function safeSourceSliceOwnerDecisionRecordOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_SOURCE_SLICE_OWNER_DECISION_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/source_slice_owner_decisions\//.test(ref)
  ) {
    throw new Error("source slice owner decision record output must be under _workmeta/system/reports/rag/source_slice_owner_decisions/ or _workmeta/<project_code>/reports/rag/source_slice_owner_decisions/");
  }
  return ref;
}

function safeRagMetadataIndexOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_METADATA_INDEX_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/metadata_retrieval_indexes\//.test(ref)
  ) {
    throw new Error("rag metadata index output must be under _workspaces/system/rag/metadata_retrieval_indexes/ or _workmeta/<project_code>/reports/rag/metadata_retrieval_indexes/");
  }
  return ref;
}

function safeRagRetrievalTraceOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_RETRIEVAL_TRACE_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/retrieval_traces\//.test(ref)
  ) {
    throw new Error("rag retrieval trace output must be under _workmeta/system/reports/rag/retrieval_traces/ or _workmeta/<project_code>/reports/rag/retrieval_traces/");
  }
  return ref;
}

function safeRagRetrievalEvaluationOutputPath(value) {
  const ref = safeRepoRelativePath(value);
  if (
    !ref.startsWith(`${DEFAULT_RETRIEVAL_EVALUATION_ROOT}/`) &&
    !/^_workmeta\/[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\/reports\/rag\/retrieval_evaluations\//.test(ref)
  ) {
    throw new Error("rag retrieval evaluation output must be under _workmeta/system/reports/rag/retrieval_evaluations/ or _workmeta/<project_code>/reports/rag/retrieval_evaluations/");
  }
  return ref;
}

function defaultSourceSliceOutputRef({ cardSet, projectCode }) {
  const filename = "source_slice_cards.json";
  if (sourceSliceCardSetRequiresPrivateOutput(cardSet)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_slice_cards", cardSet.slice_set_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_SLICE_ROOT, cardSet.slice_set_id, filename));
}

function defaultSourceSliceTriageRegisterOutputRef({ register, projectCode }) {
  const filename = "source_slice_triage_register.json";
  if (sourceSliceTriageRegisterRequiresProjectOutput(register)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_slice_triage_register", register.register_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_SLICE_TRIAGE_REGISTER_ROOT, register.register_id, filename));
}

function defaultSourceSliceReviewQueueOutputRef({ queue, projectCode }) {
  const filename = "source_slice_review_queue.json";
  if (sourceSliceReviewQueueRequiresProjectOutput(queue)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_slice_review_queue", queue.queue_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_SLICE_REVIEW_QUEUE_ROOT, queue.queue_id, filename));
}

function defaultSourceSliceDecisionPacketOutputRef({ packet, projectCode }) {
  const filename = "source_slice_decision_packet.json";
  if (sourceSliceDecisionPacketRequiresProjectOutput(packet)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_slice_decision_packets", packet.packet_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_SLICE_DECISION_PACKET_ROOT, packet.packet_id, filename));
}

function defaultSourceSliceOwnerDecisionRecordOutputRef({ record, projectCode }) {
  const filename = "source_slice_owner_decision_record.json";
  if (sourceSliceOwnerDecisionRecordRequiresProjectOutput(record)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "source_slice_owner_decisions", record.record_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_SOURCE_SLICE_OWNER_DECISION_ROOT, record.record_id, filename));
}

function defaultRagMetadataIndexOutputRef({ index, projectCode }) {
  const filename = "metadata_index.json";
  if (ragMetadataIndexRequiresProjectOutput(index)) {
    const code = normalizeProjectCode(projectCode);
    return normalizeRepoPath(path.join("_workmeta", code, "reports", "rag", "metadata_retrieval_indexes", index.index_id, filename));
  }
  return normalizeRepoPath(path.join(DEFAULT_METADATA_INDEX_ROOT, index.index_id, filename));
}

function sourceSliceCardSetRequiresPrivateOutput(cardSet) {
  return (cardSet.cards ?? []).some(
    (card) =>
      isPrivateSourceLocatorRef(card.source_locator_ref) ||
      (card.sensitivity && card.sensitivity !== "public_safe_metadata"),
  );
}

function sourceSliceTriageRegisterRequiresProjectOutput(register) {
  return [...(register.registered_items ?? []), ...(register.owner_review_items ?? []), ...(register.blocked_items ?? [])].some(
    (item) =>
      isPrivateSourceLocatorRef(item.source_locator_ref) ||
      (item.sensitivity && item.sensitivity !== "public_safe_metadata"),
  );
}

function sourceSliceReviewQueueRequiresProjectOutput(queue) {
  return (queue.items ?? []).some(
    (item) =>
      isPrivateSourceLocatorRef(item.source_locator_ref) ||
      (item.sensitivity && item.sensitivity !== "public_safe_metadata"),
  );
}

function sourceSliceDecisionPacketRequiresProjectOutput(packet) {
  return (packet.items ?? []).some(
    (item) =>
      isPrivateSourceLocatorRef(item.source_locator_ref) ||
      (item.sensitivity && item.sensitivity !== "public_safe_metadata"),
  );
}

function sourceSliceOwnerDecisionRecordRequiresProjectOutput(record) {
  return (record.items ?? []).some(
    (item) =>
      isPrivateSourceLocatorRef(item.source_locator_ref) ||
      (item.sensitivity && item.sensitivity !== "public_safe_metadata"),
  );
}

function ragMetadataIndexRequiresProjectOutput(index) {
  return (index.counts?.private_source_count ?? 0) > 0;
}

function normalizeProjectCode(value) {
  const code = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(code)) {
    throw new Error("project_code_required_for_private_source_slice_cards");
  }
  return code;
}

function safeRepoRelativePath(value) {
  const ref = normalizeRepoPath(value);
  if (!isSafeMetadataRef(ref)) {
    throw new Error(`unsafe repo-relative path: ${value}`);
  }
  return ref;
}

function normalizeExportId(value) {
  const id = String(value ?? DEFAULT_EXPORT_ID).trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("export_id_must_be_simple");
  }
  return id;
}

function normalizeManifestId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("manifest_id_must_be_simple");
  }
  return id;
}

function normalizeSourceSliceSetId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("source_slice_set_id_must_be_simple");
  }
  return id;
}

function normalizeSourceSliceTriageRegisterId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("source_slice_triage_register_id_must_be_simple");
  }
  return id;
}

function normalizeSourceSliceReviewQueueId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("source_slice_review_queue_id_must_be_simple");
  }
  return id;
}

function normalizeSourceSliceDecisionPacketId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("source_slice_decision_packet_id_must_be_simple");
  }
  return id;
}

function normalizeSourceSliceOwnerDecisionRecordId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("source_slice_owner_decision_record_id_must_be_simple");
  }
  return id;
}

function normalizeRagMetadataIndexId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("rag_metadata_index_id_must_be_simple");
  }
  return id;
}

function normalizeRagRetrievalTraceId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("rag_retrieval_trace_id_must_be_simple");
  }
  return id;
}

function normalizeRagRetrievalEvaluationId(value) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) {
    throw new Error("rag_retrieval_evaluation_id_must_be_simple");
  }
  return id;
}

function isSafeMetadataId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) && !hasUnsafeManifestString(value);
}

function isSha256Hex(value) {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

function isTokenFingerprint(value) {
  return typeof value === "string" && TOKEN_FINGERPRINT_PATTERN.test(value);
}

function tokenFingerprint(token) {
  return stableHash(`soulforge_metadata_token:${token}`).slice(0, 32);
}

function tokenFingerprintsForValue(value) {
  return [...tokenize(value)].sort().map((token) => tokenFingerprint(token));
}

function isPrivateSourceLocatorRef(value) {
  const ref = normalizeRepoPath(String(value ?? ""));
  return ref.startsWith("_workmeta/") || ref.startsWith("private-state/") || ref.startsWith("guild_hall/state/");
}

function tokenize(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9가-힣_.-]+/u)
      .map((token) => token.trim())
      .filter((token) => token && token.length > 1 && !STOPWORD_TOKENS.has(token)),
  );
}

function findRagManifestIndexPayloadBlockers(value, trail = "manifest") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findRagManifestIndexPayloadBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "indexes" && Array.isArray(child) && child.length > 0) {
      blockers.push(`rag_manifest_index_payload_not_allowed:${trail}.${key}`);
    }
    if (FORBIDDEN_RAG_MANIFEST_INDEX_KEYS.has(normalizedKey)) {
      blockers.push(`rag_manifest_index_payload_not_allowed:${trail}.${key}`);
    }
    blockers.push(...findRagManifestIndexPayloadBlockers(child, `${trail}.${key}`));
  }
  return blockers;
}

function findForbiddenExactKeyBlockers(value, forbiddenKeys, trail) {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findForbiddenExactKeyBlockers(item, forbiddenKeys, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (!value || typeof value !== "object") {
    return blockers;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) {
      blockers.push(`forbidden_metadata_retrieval_key:${trail}.${key}`);
    }
    blockers.push(...findForbiddenExactKeyBlockers(child, forbiddenKeys, `${trail}.${key}`));
  }
  return blockers;
}

function findRagAnswerSafetyBlockers(value, trail = "rag_answer") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findRagAnswerSafetyBlockers(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_RAG_ANSWER_KEYS.has(normalizedKey)) {
        blockers.push(`rag_answer_forbidden_raw_or_payload_key:${trail}.${key}`);
      }
      if (SECRET_LIKE_KEYS.has(normalizedKey)) {
        blockers.push(`rag_answer_secret_like_key:${trail}.${key}`);
      }
      blockers.push(...findRagAnswerSafetyBlockers(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") {
    return blockers;
  }
  if (hasLocalAbsolutePathString(value)) {
    blockers.push(`rag_answer_local_absolute_path:${trail}`);
  }
  if (hasSecretLikeValueString(value)) {
    blockers.push(`rag_answer_secret_like_value:${trail}`);
  }
  return blockers;
}

function validateAllowedAnswerKeys(value, allowedKeys, blockers, trail) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) blockers.push(`unknown_key:${trail}.${key}`);
  }
}

function findUnsafeManifestValues(value, trail = "manifest") {
  const blockers = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      blockers.push(...findUnsafeManifestValues(item, `${trail}[${index}]`));
    });
    return blockers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
        blockers.push(`forbidden_payload_key:${trail}.${key}`);
      }
      blockers.push(...findUnsafeManifestValues(child, `${trail}.${key}`));
    }
    return blockers;
  }
  if (typeof value !== "string") {
    return blockers;
  }
  if (hasUnsafeManifestString(value)) {
    blockers.push(`unsafe_manifest_string:${trail}`);
  }
  return blockers;
}

function hasLocalAbsolutePathString(value) {
  const text = String(value ?? "");
  return /(^|[\s"'(])\/(?:Users|Volumes|private|var\/folders|tmp|home)\//.test(text) || /[A-Za-z]:[\\/]/.test(text);
}

function hasSecretLikeValueString(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return true;
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/.test(text)) {
    return true;
  }
  if (/\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?cookie)\s*[:=]\s*["']?[^"'\s]{8,}/i.test(text)) {
    return true;
  }
  if (/\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i.test(text)) return true;
  return false;
}

function manifestArrayField(value, key, blockers, options = {}) {
  const required = options.required !== false;
  const child = value?.[key];
  if (child === undefined || child === null) {
    if (required) blockers.push(`${key}_must_be_array`);
    return [];
  }
  if (!Array.isArray(child)) {
    blockers.push(`${key}_must_be_array`);
    return [];
  }
  return child;
}

function hasUnsafeManifestString(value) {
  const text = value.trim();
  if (!text) return false;
  if (/[A-Za-z]:[\\/]/.test(text)) return true;
  if (/\/Users\/|\/Volumes\/|\/private\/|\/var\/folders\//.test(text)) return true;
  if (/(^|[\s/_.-])(secret|token|cookie|credential|session|password|passwd|private_key)([\s/_.-]|$)/i.test(text)) {
    return true;
  }
  if (/(raw\s+mail|mail\s+body|hwp\s+body|pdf\s+body|word\s+body|raw\s+payload|private\s+payload|body\s+payload)/i.test(text)) {
    return true;
  }
  return false;
}

function weakestClaimCeiling(values) {
  const candidates = values.filter(Boolean);
  if (candidates.length === 0) return "observed";
  return candidates.sort((left, right) => (CLAIM_STRENGTH[left] ?? 0) - (CLAIM_STRENGTH[right] ?? 0))[0];
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function formatTimestampUtc(value) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_timestamp");
  }
  return date.toISOString();
}
