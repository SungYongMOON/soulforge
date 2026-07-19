import { createHash } from "node:crypto";

import {
  buildKnowledgeRagCandidate,
  validateKnowledgeRagCandidate,
} from "../knowledge_access/knowledge_rag_candidate_ledger.mjs";
import {
  RAG_MANIFEST_SCHEMA_VERSION,
  RAG_METADATA_INDEX_SCHEMA_VERSION,
  RAG_METADATA_INDEX_GENERATOR_ID,
  buildRagMetadataIndex,
  validateRagManifest,
  validateRagMetadataIndex,
} from "../rag/rag.mjs";
import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  sha256Canonical,
} from "./project_history_envelope.mjs";
import {
  validateActualFiveLaneShadowGeneration,
} from "./project_history_actual_shadow.mjs";

export const PROJECT_HISTORY_KNOWLEDGE_PROJECTION_SCHEMA_VERSION =
  "soulforge.project_history_knowledge_projection.v1";
export const PROJECT_HISTORY_KNOWLEDGE_CANDIDATE_PREVIEW_SCHEMA_VERSION =
  "soulforge.project_history_knowledge_candidate_preview.v1";
export const PROJECT_HISTORY_KNOWLEDGE_GRAPH_VIEW_SCHEMA_VERSION =
  "soulforge.project_history_knowledge_graph_view.v1";
export const PROJECT_HISTORY_KNOWLEDGE_PROJECTION_GENERATOR_ID =
  "guild_hall.shared.project_history_knowledge_projection.v1";
export const PROJECT_HISTORY_KNOWLEDGE_SCOPES = Object.freeze(["project", "common"]);

const SECOND_PRECISION_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/u;
const PROJECT_HISTORY_RAG_INDEX_BOUNDARY = Object.freeze({
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
});
const METADATA_INDEX_STOPWORD_TOKENS = new Set([
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
const AUTHORITY_FIELDS = Object.freeze([
  "source_truth",
  "owner_approval",
  "knowledge_acceptance",
  "ontology_acceptance",
  "accepted_history",
  "graph_mutation",
  "rag_ingestion",
  "canon_mutation",
  "registry_mutation",
  "drive_mutation",
  "notebooklm_mutation",
  "feature_activation",
]);
const PROJECTION_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "route",
  "projection_id",
  "generated_at_utc",
  "knowledge_scope",
  "owner_project_code",
  "origin_project_code",
  "input_binding",
  "candidate_previews",
  "graph_view",
  "rag_manifest",
  "rag_metadata_index",
  "authority",
  "boundary",
  "projection_digest",
]);
const CANDIDATE_PREVIEW_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "feature_state",
  "route",
  "knowledge_scope",
  "owner_project_code",
  "origin_project_code",
  "lane",
  "occurrence_id",
  "history_metadata_digest",
  "candidate",
  "authority",
]);
const INPUT_BINDING_FIELDS = Object.freeze([
  "generation_id",
  "ordered_event_digest",
  "source_attestation_digest",
  "accepted_history",
  "raw_payload_copied",
]);
const BOUNDARY_FIELDS = Object.freeze([
  "metadata_only",
  "source_text_included",
  "raw_payload_included",
  "external_source_addresses_included",
  "accepted_history_created",
  "live_feature_activated",
  "registry_mutated",
  "drive_mutated",
  "notebooklm_mutated",
]);
const RAG_MANIFEST_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "manifest_id",
  "generator_id",
  "generated_at_utc",
  "feature_state",
  "route",
  "scope",
  "source_refs",
  "freshness",
  "boundary",
  "authority",
  "lens_profiles",
  "sources",
  "retrieval_units",
  "graph_bindings",
  "indexes",
  "validation",
]);
const RAG_MANIFEST_SCOPE_FIELDS = Object.freeze([
  "owner_surface",
  "project_code",
  "origin_project_code",
  "knowledge_scope",
  "allowed_use",
  "source_surfaces",
  "lens_profile_ids",
]);
const RAG_MANIFEST_SOURCE_REF_FIELDS = Object.freeze([
  "graph_ref",
  "generation_id",
  "ordered_event_digest",
  "source_attestation_digest",
]);
const RAG_MANIFEST_FRESHNESS_FIELDS = Object.freeze([
  "graph_generated_at_utc",
  "graph_digest",
  "input_event_digest",
]);
const RAG_MANIFEST_BOUNDARY_FIELDS = Object.freeze([
  "metadata_only",
  "source_payloads_included",
  "chunk_text_included",
  "node_metadata_included",
  "notebooklm_answers_included",
  "secrets_or_session_included",
  "runtime_absolute_paths_included",
  "answer_generation_allowed",
]);
const FORBIDDEN_PROJECTION_KEYS = new Set([
  "accepted_history_ref",
  "accepted_pointer",
  "body",
  "body_text",
  "chunk_text",
  "mail_body",
  "payload",
  "raw_payload",
  "source_body",
  "source_locator",
  "source_locator_ref",
  "source_text",
  "storage_locator",
  "transcript",
]);

export class ProjectHistoryKnowledgeProjectionError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryKnowledgeProjectionError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryKnowledgeProjectionError(code, path, message);
}

function exactKeys(value, expected, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", path, "Fields do not match the projection contract");
  }
}

function denseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain dense array");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_forbidden", `${path}[${index}]`, "Sparse arrays are forbidden");
    }
  }
  return value;
}

function projectionWithout(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function digestSuffix(value, length = 16) {
  return sha256Canonical(value).slice("sha256:".length, "sha256:".length + length);
}

function buildAuthorityFlags() {
  return Object.fromEntries(AUTHORITY_FIELDS.map((field) => [field, false]));
}

function buildBoundary() {
  return {
    metadata_only: true,
    source_text_included: false,
    raw_payload_included: false,
    external_source_addresses_included: false,
    accepted_history_created: false,
    live_feature_activated: false,
    registry_mutated: false,
    drive_mutated: false,
    notebooklm_mutated: false,
  };
}

function assertAuthorityOff(value, path) {
  exactKeys(value, AUTHORITY_FIELDS, path);
  for (const field of AUTHORITY_FIELDS) {
    if (value[field] !== false) {
      fail("authority_must_be_false", `${path}.${field}`, "Projection authority is always false");
    }
  }
}

function assertBoundary(value, path) {
  exactKeys(value, BOUNDARY_FIELDS, path);
  if (value.metadata_only !== true) {
    fail("metadata_only_required", `${path}.metadata_only`, "Projection must remain metadata-only");
  }
  for (const field of BOUNDARY_FIELDS.filter((key) => key !== "metadata_only")) {
    if (value[field] !== false) {
      fail("boundary_flag_must_be_false", `${path}.${field}`, "Projection boundary flags must remain false");
    }
  }
}

function assertNoForbiddenProjectionKeys(value, path = "$projection") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenProjectionKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PROJECTION_KEYS.has(key.toLowerCase())) {
      fail("forbidden_projection_key", `${path}.${key}`, "Source-bearing or pointer fields are forbidden");
    }
    assertNoForbiddenProjectionKeys(child, `${path}.${key}`);
  }
}

function stableMetadataIndexHash(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function metadataIndexTokenFingerprint(token) {
  return stableMetadataIndexHash(`soulforge_metadata_token:${token}`).slice(0, 32);
}

function metadataIndexTokens(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9가-힣_.-]+/u)
      .map((token) => token.trim())
      .filter((token) => token && token.length > 1 && !METADATA_INDEX_STOPWORD_TOKENS.has(token)),
  );
}

function metadataIndexTokenFingerprintCounts(values) {
  const counts = {};
  for (const value of values) {
    for (const token of metadataIndexTokens(value)) {
      const fingerprint = metadataIndexTokenFingerprint(token);
      counts[fingerprint] = (counts[fingerprint] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildExpectedRagIndexDocuments(manifest) {
  return manifest.retrieval_units.map((unit) => {
    const tokenFingerprintCounts = metadataIndexTokenFingerprintCounts([
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
      title_label: unit.title_label,
      summary: unit.summary,
      node_type: unit.node_type,
      owner_surface: unit.owner_surface,
      claim_ceiling: unit.claim_ceiling,
      lifecycle_status: unit.lifecycle_status,
      payload_state: "metadata_only",
      token_fingerprint_count: Object.values(tokenFingerprintCounts).reduce((total, count) => total + count, 0),
      token_fingerprint_counts: tokenFingerprintCounts,
      metadata_fingerprint: stableMetadataIndexHash({
        unit_ref: unit.unit_ref,
        graph_node_ref: unit.graph_node_ref,
        title_label: unit.title_label,
        summary: unit.summary,
      }),
    };
  }).sort((left, right) => left.document_ref.localeCompare(right.document_ref));
}

function buildExpectedRagIndexLexicalIndex(documents) {
  const postingsByToken = new Map();
  for (const document of documents) {
    for (const [fingerprint, count] of Object.entries(document.token_fingerprint_counts)) {
      postingsByToken.set(fingerprint, [
        ...(postingsByToken.get(fingerprint) ?? []),
        { document_ref: document.document_ref, count },
      ]);
    }
  }
  return {
    tokenizer: "soulforge_basic_metadata_tokenizer_v0",
    score_method: "metadata_lexical_overlap_v0",
    token_postings: [...postingsByToken.entries()]
      .map(([fingerprint, postings]) => ({
        token_fingerprint: fingerprint,
        document_count: postings.length,
        postings: postings.sort((left, right) => left.document_ref.localeCompare(right.document_ref)),
      }))
      .sort((left, right) => left.token_fingerprint.localeCompare(right.token_fingerprint)),
  };
}

function assertRagIndexBindsManifest(manifest, index) {
  const expectedDocuments = buildExpectedRagIndexDocuments(manifest);
  if (canonicalJson(index.documents) !== canonicalJson(expectedDocuments)) {
    fail(
      "rag_metadata_index_document_derivation_mismatch",
      "$projection.rag_metadata_index.documents",
      "Index documents must be the exact deterministic manifest projection",
    );
  }
  const expectedLexicalIndex = buildExpectedRagIndexLexicalIndex(expectedDocuments);
  if (canonicalJson(index.lexical_index) !== canonicalJson(expectedLexicalIndex)) {
    fail(
      "rag_metadata_index_lexical_derivation_mismatch",
      "$projection.rag_metadata_index.lexical_index",
      "Lexical postings must be the exact deterministic document projection",
    );
  }
  const expectedCounts = {
    source_count: manifest.sources.length,
    private_source_count: 0,
    retrieval_unit_count: manifest.retrieval_units.length,
    indexed_document_count: expectedDocuments.length,
    token_fingerprint_count: expectedLexicalIndex.token_postings.length,
    blocked_document_count: manifest.retrieval_units.length - expectedDocuments.length,
  };
  if (canonicalJson(index.counts) !== canonicalJson(expectedCounts)) {
    fail(
      "rag_metadata_index_count_derivation_mismatch",
      "$projection.rag_metadata_index.counts",
      "Index counts must match the deterministic manifest projection",
    );
  }
  return {
    documents: expectedDocuments,
    lexical_index: expectedLexicalIndex,
    counts: expectedCounts,
  };
}

function resolveKnowledgeScope(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail("options_object_required", "$options", "Options must explicitly carry knowledgeScope");
  }
  const camelPresent = Object.hasOwn(options, "knowledgeScope");
  const snakePresent = Object.hasOwn(options, "knowledge_scope");
  if (!camelPresent && !snakePresent) {
    fail("knowledge_scope_required", "$options.knowledge_scope", "Choose project or common explicitly");
  }
  if (camelPresent && snakePresent && options.knowledgeScope !== options.knowledge_scope) {
    fail("knowledge_scope_conflict", "$options", "Camel and snake knowledge scope values disagree");
  }
  const scope = camelPresent ? options.knowledgeScope : options.knowledge_scope;
  if (!PROJECT_HISTORY_KNOWLEDGE_SCOPES.includes(scope)) {
    fail("knowledge_scope_invalid", "$options.knowledge_scope", "Expected project or common");
  }
  return scope;
}

function assertProjectCode(value, path) {
  if (typeof value !== "string" || !PROJECT_CODE_PATTERN.test(value)) {
    fail("origin_project_code_invalid", path, "Expected a canonical PNN-NNN project code");
  }
  return value;
}

function resolveOriginProjectCode(options) {
  const camelPresent = Object.hasOwn(options, "originProjectCode");
  const snakePresent = Object.hasOwn(options, "origin_project_code");
  if (!camelPresent && !snakePresent) {
    fail(
      "origin_project_code_required",
      "$options.origin_project_code",
      "Expected origin project code must be explicit",
    );
  }
  if (camelPresent && snakePresent && options.originProjectCode !== options.origin_project_code) {
    fail("origin_project_code_conflict", "$options", "Camel and snake origin project code values disagree");
  }
  return assertProjectCode(
    camelPresent ? options.originProjectCode : options.origin_project_code,
    "$options.origin_project_code",
  );
}

function projectCodeFromGeneration(generation) {
  const value = String(generation.project_ref?.entity_id ?? "");
  if (!PROJECT_CODE_PATTERN.test(value)) {
    fail(
      "origin_project_code_invalid",
      "$generation.project_ref.entity_id",
      "Expected the complete entity ID to be one canonical PNN-NNN project code",
    );
  }
  return value;
}

function generatedAtFromGeneration(generation) {
  const latest = generation.envelopes
    .map((envelope) => envelope.recorded_at)
    .sort()
    .at(-1);
  const timestamp = new Date(latest).toISOString().replace(/\.\d{3}Z$/u, "Z");
  if (!SECOND_PRECISION_UTC_PATTERN.test(timestamp)) {
    fail("generated_at_invalid", "$generation.envelopes", "Could not derive a deterministic UTC timestamp");
  }
  return timestamp;
}

function buildCandidatePreview({
  generation,
  envelope,
  knowledgeScope,
  ownerProjectCode,
  originProjectCode,
  generatedAtUtc,
}) {
  const sourceContextRef = [
    "project_history_actual_shadow",
    generation.generation_id,
    envelope.lane,
    envelope.occurrence_id,
  ].join("/");
  const candidate = buildKnowledgeRagCandidate({
    createdAt: generatedAtUtc,
    projectCode: ownerProjectCode,
    sourceContextRef,
    candidateKind: "completion_knowledge",
    shortReason: `Feature-OFF ${envelope.lane} history metadata candidate requires owner decision.`,
    suggestedRoute: "owner_decision_needed",
    claimCeiling: "observed",
    missingInputs: ["owner_knowledge_candidate_decision"],
    ownerQuestion:
      `Should the ${envelope.lane} metadata candidate remain held, be rejected, or advance to separately authorized review?`,
    status: "held",
    itemRef: `project_history_occurrence/${envelope.occurrence_id}`,
    knowledgeHint:
      `${originProjectCode} ${envelope.lane} project-history metadata candidate.`,
  });
  const validation = validateKnowledgeRagCandidate(candidate);
  if (!validation.ok) {
    fail("candidate_invalid", "$candidate", validation.errors.join(","));
  }
  return {
    schema_version: PROJECT_HISTORY_KNOWLEDGE_CANDIDATE_PREVIEW_SCHEMA_VERSION,
    kind: "project_history_knowledge_candidate_preview",
    feature_state: "off",
    route: "owner_decision_needed",
    knowledge_scope: knowledgeScope,
    owner_project_code: ownerProjectCode,
    origin_project_code: originProjectCode,
    lane: envelope.lane,
    occurrence_id: envelope.occurrence_id,
    history_metadata_digest: envelope.metadata_digest,
    candidate,
    authority: buildAuthorityFlags(),
  };
}

function graphNodeRef(prefix, value) {
  return `${prefix}:${value}`;
}

function buildGraphEdge(fromRef, toRef, relationType) {
  return {
    edge_ref: graphNodeRef("project_history_edge", digestSuffix({ fromRef, toRef, relationType })),
    from_ref: fromRef,
    to_ref: toRef,
    relation_type: relationType,
    relation_state: "candidate",
    directed: true,
    claim_ceiling: "observed",
    route: "owner_decision_needed",
  };
}

function buildGraphView({
  generation,
  candidatePreviews,
  knowledgeScope,
  ownerProjectCode,
  originProjectCode,
  generatedAtUtc,
}) {
  const originNodeRef = graphNodeRef("project_history_origin", originProjectCode);
  const ownerNodeRef = graphNodeRef("project_history_owner", ownerProjectCode);
  const generationNodeRef = graphNodeRef(
    "project_history_shadow_generation",
    digestSuffix({ generation_id: generation.generation_id, digest: generation.ordered_event_digest }),
  );
  const contextNodes = [
    {
      node_ref: originNodeRef,
      node_type: "origin_project",
      label: originProjectCode,
      owner_project_code: originProjectCode,
      origin_project_code: originProjectCode,
      knowledge_scope: "project",
      lane: null,
      claim_ceiling: "observed",
      lifecycle_status: "shadow",
      route: "owner_decision_needed",
      metadata_digest: sha256Canonical({
        origin_project_code: originProjectCode,
      }),
    },
    {
      node_ref: ownerNodeRef,
      node_type: "candidate_owner",
      label: ownerProjectCode,
      owner_project_code: ownerProjectCode,
      origin_project_code: originProjectCode,
      knowledge_scope: knowledgeScope,
      lane: null,
      claim_ceiling: "observed",
      lifecycle_status: "held",
      route: "owner_decision_needed",
      metadata_digest: sha256Canonical({ owner_project_code: ownerProjectCode, knowledge_scope: knowledgeScope }),
    },
    {
      node_ref: generationNodeRef,
      node_type: "shadow_generation",
      label: generation.generation_id,
      owner_project_code: originProjectCode,
      origin_project_code: originProjectCode,
      knowledge_scope: "project",
      lane: null,
      claim_ceiling: "observed",
      lifecycle_status: "shadow",
      route: "owner_decision_needed",
      metadata_digest: generation.ordered_event_digest,
    },
  ];
  const candidateNodes = candidatePreviews.map((preview) => ({
    node_ref: graphNodeRef("knowledge_candidate", preview.candidate.candidate_id),
    node_type: "knowledge_candidate",
    label: `${originProjectCode} ${preview.lane} history candidate`,
    owner_project_code: ownerProjectCode,
    origin_project_code: originProjectCode,
    knowledge_scope: knowledgeScope,
    lane: preview.lane,
    claim_ceiling: "observed",
    lifecycle_status: "held",
    route: "owner_decision_needed",
    metadata_digest: preview.history_metadata_digest,
  }));
  const edges = [
    buildGraphEdge(generationNodeRef, originNodeRef, "originates_from_project"),
    ...candidateNodes.flatMap((node) => [
      buildGraphEdge(node.node_ref, generationNodeRef, "projected_from_shadow_generation"),
      buildGraphEdge(node.node_ref, ownerNodeRef, "held_by_candidate_owner"),
      buildGraphEdge(node.node_ref, originNodeRef, "retains_origin_project"),
    ]),
  ].sort((left, right) => left.edge_ref.localeCompare(right.edge_ref));
  const graph = {
    schema_version: PROJECT_HISTORY_KNOWLEDGE_GRAPH_VIEW_SCHEMA_VERSION,
    kind: "project_history_knowledge_graph_view",
    status: "preview",
    feature_state: "off",
    route: "owner_decision_needed",
    graph_id: `project_history_knowledge_graph_${digestSuffix({
      generation_id: generation.generation_id,
      knowledge_scope: knowledgeScope,
      origin_project_code: originProjectCode,
      ordered_event_digest: generation.ordered_event_digest,
    })}`,
    generated_at_utc: generatedAtUtc,
    knowledge_scope: knowledgeScope,
    owner_project_code: ownerProjectCode,
    origin_project_code: originProjectCode,
    generation_id: generation.generation_id,
    nodes: [...contextNodes, ...candidateNodes].sort((left, right) => left.node_ref.localeCompare(right.node_ref)),
    edges,
    authority: buildAuthorityFlags(),
    boundary: buildBoundary(),
    graph_digest: "",
  };
  graph.graph_digest = sha256Canonical(projectionWithout(graph, "graph_digest"));
  return graph;
}

function buildRagManifest({
  generation,
  graphView,
  candidatePreviews,
  knowledgeScope,
  ownerProjectCode,
  originProjectCode,
  generatedAtUtc,
}) {
  const candidateNodes = graphView.nodes.filter((node) => node.node_type === "knowledge_candidate");
  const manifest = {
    schema_version: RAG_MANIFEST_SCHEMA_VERSION,
    kind: "rag_manifest",
    status: "draft",
    manifest_id: `project_history_knowledge_manifest_${digestSuffix({
      graph_digest: graphView.graph_digest,
      knowledge_scope: knowledgeScope,
    })}`,
    generator_id: PROJECT_HISTORY_KNOWLEDGE_PROJECTION_GENERATOR_ID,
    generated_at_utc: generatedAtUtc,
    feature_state: "off",
    route: "owner_decision_needed",
    scope: {
      owner_surface: ownerProjectCode,
      project_code: ownerProjectCode,
      origin_project_code: originProjectCode,
      knowledge_scope: knowledgeScope,
      allowed_use: "metadata_candidate_preview",
      source_surfaces: ["project_history_actual_shadow"],
      lens_profile_ids: [],
    },
    source_refs: {
      graph_ref: graphView.graph_id,
      generation_id: generation.generation_id,
      ordered_event_digest: generation.ordered_event_digest,
      source_attestation_digest: generation.source_attestation_digest,
    },
    freshness: {
      graph_generated_at_utc: graphView.generated_at_utc,
      graph_digest: graphView.graph_digest,
      input_event_digest: generation.ordered_event_digest,
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
    authority: buildAuthorityFlags(),
    lens_profiles: [],
    sources: [],
    retrieval_units: candidateNodes.map((node) => {
      const preview = candidatePreviews.find(
        (item) => graphNodeRef("knowledge_candidate", item.candidate.candidate_id) === node.node_ref,
      );
      return {
        unit_ref: `graph_node:${node.node_ref}`,
        unit_type: "graph_node_metadata",
        graph_node_ref: node.node_ref,
        source_handles: [],
        title_label: node.label,
        summary:
          `${knowledgeScope} scope metadata candidate; owner ${ownerProjectCode}; route owner_decision_needed; feature off.`,
        node_type: "knowledge",
        owner_surface: ownerProjectCode,
        claim_ceiling: "observed",
        lifecycle_status: "held",
        retrieval: {
          status: "metadata_only",
          allowed_for_retrieval: true,
          allowed_modes: ["metadata_graph_answer"],
          blocker_code: null,
          next_owner_action_ref: "owner_decision_needed",
        },
        payload_state: "not_in_manifest",
        content_hash_or_null: null,
        token_count_or_null: null,
        history_metadata_digest: preview.history_metadata_digest,
      };
    }).sort((left, right) => left.unit_ref.localeCompare(right.unit_ref)),
    graph_bindings: graphView.edges.map((edge) => ({
      binding_ref: edge.edge_ref,
      from_ref: edge.from_ref,
      to_ref: edge.to_ref,
      relation_type: edge.relation_type,
      relation_state: edge.relation_state,
      directed: edge.directed,
      evidence_event_count: 1,
      claim_ceiling_hint: edge.claim_ceiling,
      source_refs: {},
    })),
    indexes: [],
    validation: {
      status: "unchecked",
      blockers: [],
    },
  };
  const validation = validateRagManifest(manifest);
  if (validation.status !== "pass") {
    fail("rag_manifest_invalid", "$projection.rag_manifest", validation.blockers.join(","));
  }
  manifest.validation = validation;
  validateProjectHistoryKnowledgeRagManifest(manifest);
  return manifest;
}

export function validateProjectHistoryKnowledgeRagManifest(manifest) {
  canonicalJson(manifest);
  assertNoForbiddenProjectionKeys(manifest, "$manifest");
  exactKeys(manifest, RAG_MANIFEST_FIELDS, "$manifest");
  const genericValidation = validateRagManifest(manifest);
  if (genericValidation.status !== "pass") {
    fail("rag_manifest_invalid", "$manifest", genericValidation.blockers.join(","));
  }
  if (manifest.schema_version !== RAG_MANIFEST_SCHEMA_VERSION
      || manifest.kind !== "rag_manifest"
      || manifest.status !== "draft"
      || manifest.generator_id !== PROJECT_HISTORY_KNOWLEDGE_PROJECTION_GENERATOR_ID
      || manifest.feature_state !== "off"
      || manifest.route !== "owner_decision_needed") {
    fail("rag_manifest_state_invalid", "$manifest", "Expected the feature-OFF project-history preview generator");
  }
  if (!SECOND_PRECISION_UTC_PATTERN.test(manifest.generated_at_utc)) {
    fail("generated_at_invalid", "$manifest.generated_at_utc", "Expected second-precision UTC");
  }
  exactKeys(manifest.scope, RAG_MANIFEST_SCOPE_FIELDS, "$manifest.scope");
  if (!PROJECT_HISTORY_KNOWLEDGE_SCOPES.includes(manifest.scope.knowledge_scope)) {
    fail("knowledge_scope_invalid", "$manifest.scope.knowledge_scope", "Expected project or common");
  }
  const originProjectCode = assertProjectCode(
    manifest.scope.origin_project_code,
    "$manifest.scope.origin_project_code",
  );
  const expectedOwner = manifest.scope.knowledge_scope === "project"
    ? originProjectCode
    : "system";
  if (manifest.scope.owner_surface !== expectedOwner
      || manifest.scope.project_code !== expectedOwner
      || manifest.scope.allowed_use !== "metadata_candidate_preview"
      || canonicalJson(manifest.scope.source_surfaces) !== canonicalJson(["project_history_actual_shadow"])
      || canonicalJson(manifest.scope.lens_profile_ids) !== canonicalJson([])) {
    fail("rag_manifest_scope_invalid", "$manifest.scope", "Scope ownership or allowed use is invalid");
  }
  exactKeys(manifest.source_refs, RAG_MANIFEST_SOURCE_REF_FIELDS, "$manifest.source_refs");
  if (typeof manifest.source_refs.generation_id !== "string" || manifest.source_refs.generation_id.length === 0
      || typeof manifest.source_refs.graph_ref !== "string" || manifest.source_refs.graph_ref.length === 0
      || !DIGEST_PATTERN.test(manifest.source_refs.ordered_event_digest)
      || !DIGEST_PATTERN.test(manifest.source_refs.source_attestation_digest)) {
    fail("rag_manifest_source_binding_invalid", "$manifest.source_refs", "Manifest input bindings are invalid");
  }
  exactKeys(manifest.freshness, RAG_MANIFEST_FRESHNESS_FIELDS, "$manifest.freshness");
  if (manifest.freshness.graph_generated_at_utc !== manifest.generated_at_utc
      || !DIGEST_PATTERN.test(manifest.freshness.graph_digest)
      || manifest.freshness.input_event_digest !== manifest.source_refs.ordered_event_digest) {
    fail("rag_manifest_freshness_invalid", "$manifest.freshness", "Freshness metadata does not bind the input");
  }
  exactKeys(manifest.boundary, RAG_MANIFEST_BOUNDARY_FIELDS, "$manifest.boundary");
  if (manifest.boundary.metadata_only !== true
      || manifest.boundary.node_metadata_included !== true
      || manifest.boundary.source_payloads_included !== false
      || manifest.boundary.chunk_text_included !== false
      || manifest.boundary.notebooklm_answers_included !== false
      || manifest.boundary.secrets_or_session_included !== false
      || manifest.boundary.runtime_absolute_paths_included !== false
      || manifest.boundary.answer_generation_allowed !== "metadata_only") {
    fail("rag_manifest_boundary_invalid", "$manifest.boundary", "Manifest exceeds metadata-only preview authority");
  }
  assertAuthorityOff(manifest.authority, "$manifest.authority");
  for (const [key, value] of [
    ["lens_profiles", manifest.lens_profiles],
    ["sources", manifest.sources],
    ["indexes", manifest.indexes],
  ]) {
    denseArray(value, `$manifest.${key}`);
    if (value.length !== 0) {
      fail("rag_manifest_live_surface_forbidden", `$manifest.${key}`, "Preview manifests keep live surfaces empty");
    }
  }
  denseArray(manifest.retrieval_units, "$manifest.retrieval_units");
  if (manifest.retrieval_units.length !== PROJECT_HISTORY_LANES.length) {
    fail("rag_manifest_unit_count_invalid", "$manifest.retrieval_units", "Expected one metadata unit per history lane");
  }
  const unitRefs = new Set();
  const candidateNodeRefs = new Set();
  const observedUnitTitles = new Set();
  const expectedUnitTitles = new Set(
    PROJECT_HISTORY_LANES.map((lane) => `${originProjectCode} ${lane} history candidate`),
  );
  const expectedUnitSummary =
    `${manifest.scope.knowledge_scope} scope metadata candidate; owner ${expectedOwner}; route owner_decision_needed; feature off.`;
  for (const unit of manifest.retrieval_units) {
    if (!String(unit.unit_ref ?? "").startsWith("graph_node:knowledge_candidate:")
        || unit.graph_node_ref !== unit.unit_ref.slice("graph_node:".length)
        || unit.unit_type !== "graph_node_metadata"
        || canonicalJson(unit.source_handles) !== canonicalJson([])
        || !expectedUnitTitles.has(unit.title_label)
        || unit.summary !== expectedUnitSummary
        || unit.node_type !== "knowledge"
        || unit.owner_surface !== expectedOwner
        || unit.claim_ceiling !== "observed"
        || unit.lifecycle_status !== "held"
        || unit.payload_state !== "not_in_manifest"
        || unit.content_hash_or_null !== null
        || unit.token_count_or_null !== null
        || !DIGEST_PATTERN.test(unit.history_metadata_digest)
        || unit.retrieval?.status !== "metadata_only"
        || unit.retrieval?.allowed_for_retrieval !== true
        || canonicalJson(unit.retrieval?.allowed_modes) !== canonicalJson(["metadata_graph_answer"])
        || unit.retrieval?.blocker_code !== null
        || unit.retrieval?.next_owner_action_ref !== "owner_decision_needed") {
      fail("rag_manifest_unit_invalid", "$manifest.retrieval_units", "Retrieval unit exceeds candidate-preview scope");
    }
    if (unitRefs.has(unit.unit_ref)) {
      fail("rag_manifest_unit_duplicate", "$manifest.retrieval_units", "Retrieval units must be unique");
    }
    unitRefs.add(unit.unit_ref);
    candidateNodeRefs.add(unit.graph_node_ref);
    observedUnitTitles.add(unit.title_label);
  }
  if (canonicalJson([...observedUnitTitles].sort()) !== canonicalJson([...expectedUnitTitles].sort())) {
    fail("rag_manifest_unit_lane_set_invalid", "$manifest.retrieval_units", "Expected one unit title per history lane");
  }
  denseArray(manifest.graph_bindings, "$manifest.graph_bindings");
  const relationCounts = new Map();
  const bindingRefs = new Set();
  const generationNodeRefs = new Set();
  const projectedCandidateRefs = new Set();
  const heldCandidateRefs = new Set();
  const retainedCandidateRefs = new Set();
  const originNodeRef = graphNodeRef("project_history_origin", originProjectCode);
  const ownerNodeRef = graphNodeRef("project_history_owner", expectedOwner);
  const allowedRelations = new Set([
    "originates_from_project",
    "projected_from_shadow_generation",
    "held_by_candidate_owner",
    "retains_origin_project",
  ]);
  for (const binding of manifest.graph_bindings) {
    const expectedBindingRef = graphNodeRef("project_history_edge", digestSuffix({
      fromRef: binding.from_ref,
      toRef: binding.to_ref,
      relationType: binding.relation_type,
    }));
    if (!allowedRelations.has(binding.relation_type)
        || binding.binding_ref !== expectedBindingRef
        || binding.relation_state !== "candidate"
        || binding.directed !== true
        || binding.evidence_event_count !== 1
        || binding.claim_ceiling_hint !== "observed"
        || canonicalJson(binding.source_refs) !== canonicalJson({})) {
      fail("rag_manifest_graph_binding_invalid", "$manifest.graph_bindings", "Graph binding exceeds candidate authority");
    }
    if (bindingRefs.has(binding.binding_ref)) {
      fail("rag_manifest_graph_binding_duplicate", "$manifest.graph_bindings", "Graph bindings must be unique");
    }
    bindingRefs.add(binding.binding_ref);
    relationCounts.set(binding.relation_type, (relationCounts.get(binding.relation_type) ?? 0) + 1);
    if (binding.relation_type === "originates_from_project") {
      if (!String(binding.from_ref ?? "").startsWith("project_history_shadow_generation:")
          || binding.to_ref !== originNodeRef) {
        fail("rag_manifest_graph_origin_binding_invalid", "$manifest.graph_bindings", "Origin binding is inconsistent");
      }
      generationNodeRefs.add(binding.from_ref);
    } else if (binding.relation_type === "projected_from_shadow_generation") {
      if (!candidateNodeRefs.has(binding.from_ref)
          || !String(binding.to_ref ?? "").startsWith("project_history_shadow_generation:")) {
        fail("rag_manifest_graph_generation_binding_invalid", "$manifest.graph_bindings", "Generation binding is inconsistent");
      }
      projectedCandidateRefs.add(binding.from_ref);
      generationNodeRefs.add(binding.to_ref);
    } else if (binding.relation_type === "held_by_candidate_owner") {
      if (!candidateNodeRefs.has(binding.from_ref) || binding.to_ref !== ownerNodeRef) {
        fail("rag_manifest_graph_owner_binding_invalid", "$manifest.graph_bindings", "Owner binding is inconsistent");
      }
      heldCandidateRefs.add(binding.from_ref);
    } else if (binding.relation_type === "retains_origin_project") {
      if (!candidateNodeRefs.has(binding.from_ref) || binding.to_ref !== originNodeRef) {
        fail("rag_manifest_graph_origin_binding_invalid", "$manifest.graph_bindings", "Retained origin is inconsistent");
      }
      retainedCandidateRefs.add(binding.from_ref);
    }
  }
  const expectedRelationCounts = {
    originates_from_project: 1,
    projected_from_shadow_generation: PROJECT_HISTORY_LANES.length,
    held_by_candidate_owner: PROJECT_HISTORY_LANES.length,
    retains_origin_project: PROJECT_HISTORY_LANES.length,
  };
  if (canonicalJson(Object.fromEntries([...relationCounts.entries()].sort()))
      !== canonicalJson(expectedRelationCounts)) {
    fail("rag_manifest_graph_binding_count_invalid", "$manifest.graph_bindings", "Graph binding counts are invalid");
  }
  const expectedCandidateNodeRefs = canonicalJson([...candidateNodeRefs].sort());
  if (generationNodeRefs.size !== 1
      || canonicalJson([...projectedCandidateRefs].sort()) !== expectedCandidateNodeRefs
      || canonicalJson([...heldCandidateRefs].sort()) !== expectedCandidateNodeRefs
      || canonicalJson([...retainedCandidateRefs].sort()) !== expectedCandidateNodeRefs) {
    fail("rag_manifest_graph_binding_coverage_invalid", "$manifest.graph_bindings", "Graph bindings do not cover each candidate exactly once");
  }
  if (canonicalJson(manifest.validation) !== canonicalJson(genericValidation)) {
    fail("rag_manifest_validation_stale", "$manifest.validation", "Embedded validation is stale");
  }
  return manifest;
}

export async function rebuildProjectHistoryKnowledgeRagIndex(manifest, options = {}) {
  validateProjectHistoryKnowledgeRagManifest(manifest);
  const generatedAtUtc = options.generatedAtUtc ?? options.generated_at_utc ?? manifest.generated_at_utc;
  if (!SECOND_PRECISION_UTC_PATTERN.test(String(generatedAtUtc ?? ""))) {
    fail("generated_at_invalid", "$options.generated_at_utc", "Expected second-precision UTC");
  }
  const indexId = options.indexId ?? options.index_id
    ?? `project_history_knowledge_index_${digestSuffix({
      manifest_id: manifest.manifest_id,
      generated_at_utc: generatedAtUtc,
    })}`;
  const built = await buildRagMetadataIndex({
    manifest,
    now: generatedAtUtc,
    indexId,
  });
  const index = {
    ...built,
    feature_state: "off",
    route: "owner_decision_needed",
    authority: buildAuthorityFlags(),
  };
  const indexValidation = validateRagMetadataIndex(index);
  if (indexValidation.status !== "pass") {
    fail("rag_metadata_index_invalid", "$index", indexValidation.blockers.join(","));
  }
  index.validation = indexValidation;
  assertNoForbiddenProjectionKeys(index, "$index");
  return index;
}

export async function buildProjectHistoryKnowledgeProjection(generation, options = {}) {
  validateActualFiveLaneShadowGeneration(generation);
  const knowledgeScope = resolveKnowledgeScope(options);
  const expectedOriginProjectCode = resolveOriginProjectCode(options);
  const originProjectCode = projectCodeFromGeneration(generation);
  if (originProjectCode !== expectedOriginProjectCode) {
    fail(
      "origin_project_mismatch",
      "$options.origin_project_code",
      `Expected ${expectedOriginProjectCode}; actual Shadow generation carries ${originProjectCode}`,
    );
  }
  const ownerProjectCode = knowledgeScope === "project" ? originProjectCode : "system";
  const generatedAtUtc = generatedAtFromGeneration(generation);
  const candidatePreviews = generation.envelopes.map((envelope) => buildCandidatePreview({
    generation,
    envelope,
    knowledgeScope,
    ownerProjectCode,
    originProjectCode,
    generatedAtUtc,
  }));
  const graphView = buildGraphView({
    generation,
    candidatePreviews,
    knowledgeScope,
    ownerProjectCode,
    originProjectCode,
    generatedAtUtc,
  });
  const ragManifest = buildRagManifest({
    generation,
    graphView,
    candidatePreviews,
    knowledgeScope,
    ownerProjectCode,
    originProjectCode,
    generatedAtUtc,
  });
  const ragMetadataIndex = await rebuildProjectHistoryKnowledgeRagIndex(ragManifest);
  const projection = {
    schema_version: PROJECT_HISTORY_KNOWLEDGE_PROJECTION_SCHEMA_VERSION,
    kind: "project_history_knowledge_projection",
    status: "preview",
    feature_state: "off",
    route: "owner_decision_needed",
    projection_id: `project_history_knowledge_projection_${digestSuffix({
      generation_id: generation.generation_id,
      knowledge_scope: knowledgeScope,
      origin_project_code: originProjectCode,
      ordered_event_digest: generation.ordered_event_digest,
      source_attestation_digest: generation.source_attestation_digest,
    })}`,
    generated_at_utc: generatedAtUtc,
    knowledge_scope: knowledgeScope,
    owner_project_code: ownerProjectCode,
    origin_project_code: originProjectCode,
    input_binding: {
      generation_id: generation.generation_id,
      ordered_event_digest: generation.ordered_event_digest,
      source_attestation_digest: generation.source_attestation_digest,
      accepted_history: false,
      raw_payload_copied: false,
    },
    candidate_previews: candidatePreviews,
    graph_view: graphView,
    rag_manifest: ragManifest,
    rag_metadata_index: ragMetadataIndex,
    authority: buildAuthorityFlags(),
    boundary: buildBoundary(),
    projection_digest: "",
  };
  projection.projection_digest = sha256Canonical(projectionWithout(projection, "projection_digest"));
  return validateProjectHistoryKnowledgeProjection(projection);
}

export function validateProjectHistoryKnowledgeProjection(projection) {
  canonicalJson(projection);
  assertNoForbiddenProjectionKeys(projection);
  exactKeys(projection, PROJECTION_FIELDS, "$projection");
  if (projection.schema_version !== PROJECT_HISTORY_KNOWLEDGE_PROJECTION_SCHEMA_VERSION) {
    fail("projection_schema_invalid", "$projection.schema_version", "Unexpected projection schema");
  }
  if (projection.kind !== "project_history_knowledge_projection"
      || projection.status !== "preview"
      || projection.feature_state !== "off"
      || projection.route !== "owner_decision_needed") {
    fail("projection_state_invalid", "$projection", "Projection must remain a feature-OFF preview");
  }
  if (!PROJECT_HISTORY_KNOWLEDGE_SCOPES.includes(projection.knowledge_scope)) {
    fail("knowledge_scope_invalid", "$projection.knowledge_scope", "Expected project or common");
  }
  const originProjectCode = assertProjectCode(
    projection.origin_project_code,
    "$projection.origin_project_code",
  );
  const expectedOwner = projection.knowledge_scope === "project"
    ? originProjectCode
    : "system";
  if (projection.owner_project_code !== expectedOwner) {
    fail("candidate_owner_invalid", "$projection", "Scope does not match candidate ownership");
  }
  if (!SECOND_PRECISION_UTC_PATTERN.test(projection.generated_at_utc)) {
    fail("generated_at_invalid", "$projection.generated_at_utc", "Expected second-precision UTC");
  }
  exactKeys(projection.input_binding, INPUT_BINDING_FIELDS, "$projection.input_binding");
  if (projection.input_binding.accepted_history !== false
      || projection.input_binding.raw_payload_copied !== false) {
    fail("shadow_boundary_invalid", "$projection.input_binding", "Accepted history and raw copying are forbidden");
  }
  if (!DIGEST_PATTERN.test(projection.input_binding.ordered_event_digest)
      || !DIGEST_PATTERN.test(projection.input_binding.source_attestation_digest)) {
    fail("input_digest_invalid", "$projection.input_binding", "Expected canonical SHA-256 digests");
  }
  if (typeof projection.input_binding.generation_id !== "string"
      || projection.input_binding.generation_id.length === 0) {
    fail("generation_id_invalid", "$projection.input_binding.generation_id", "Expected a stable generation ID");
  }
  const expectedProjectionId = `project_history_knowledge_projection_${digestSuffix({
    generation_id: projection.input_binding.generation_id,
    knowledge_scope: projection.knowledge_scope,
    origin_project_code: originProjectCode,
    ordered_event_digest: projection.input_binding.ordered_event_digest,
    source_attestation_digest: projection.input_binding.source_attestation_digest,
  })}`;
  if (projection.projection_id !== expectedProjectionId) {
    fail("projection_id_mismatch", "$projection.projection_id", "Projection ID does not match its input binding");
  }
  denseArray(projection.candidate_previews, "$projection.candidate_previews");
  if (projection.candidate_previews.length !== PROJECT_HISTORY_LANES.length) {
    fail("candidate_count_invalid", "$projection.candidate_previews", "Expected one preview per history lane");
  }
  const candidateLaneSet = new Set(projection.candidate_previews.map((preview) => preview?.lane));
  if (
    candidateLaneSet.size !== PROJECT_HISTORY_LANES.length
    || PROJECT_HISTORY_LANES.some((lane) => !candidateLaneSet.has(lane))
  ) {
    fail(
      "candidate_lane_set_invalid",
      "$projection.candidate_previews",
      "Candidates must contain each history lane exactly once",
    );
  }
  const candidateIds = new Set();
  for (let index = 0; index < projection.candidate_previews.length; index += 1) {
    const preview = projection.candidate_previews[index];
    const path = `$projection.candidate_previews[${index}]`;
    exactKeys(preview, CANDIDATE_PREVIEW_FIELDS, path);
    if (preview.schema_version !== PROJECT_HISTORY_KNOWLEDGE_CANDIDATE_PREVIEW_SCHEMA_VERSION
        || preview.kind !== "project_history_knowledge_candidate_preview"
        || preview.feature_state !== "off"
        || preview.route !== "owner_decision_needed") {
      fail("candidate_preview_schema_invalid", path, "Unexpected candidate preview schema");
    }
    if (preview.knowledge_scope !== projection.knowledge_scope
        || preview.owner_project_code !== expectedOwner
        || preview.origin_project_code !== originProjectCode) {
      fail("candidate_scope_binding_invalid", path, "Candidate scope or ownership is inconsistent");
    }
    const candidateValidation = validateKnowledgeRagCandidate(preview.candidate);
    if (!candidateValidation.ok) {
      fail("candidate_invalid", `${path}.candidate`, candidateValidation.errors.join(","));
    }
    if (preview.candidate.project_code !== expectedOwner
        || preview.candidate.suggested_route !== "owner_decision_needed"
        || preview.candidate.claim_ceiling !== "observed"
        || preview.candidate.status !== "held") {
      fail("candidate_authority_invalid", `${path}.candidate`, "Candidate must remain held at observed owner-decision route");
    }
    if (candidateIds.has(preview.candidate.candidate_id)) {
      fail("candidate_duplicate", path, "Candidate IDs must be unique");
    }
    candidateIds.add(preview.candidate.candidate_id);
    if (!/^ph-occ:[0-9a-f]{64}$/u.test(preview.occurrence_id)
        || !DIGEST_PATTERN.test(preview.history_metadata_digest)) {
      fail("history_metadata_digest_invalid", `${path}.history_metadata_digest`, "Expected canonical SHA-256 digest");
    }
    assertAuthorityOff(preview.authority, `${path}.authority`);
    const expectedPreview = buildCandidatePreview({
      generation: { generation_id: projection.input_binding.generation_id },
      envelope: {
        lane: preview.lane,
        occurrence_id: preview.occurrence_id,
        metadata_digest: preview.history_metadata_digest,
      },
      knowledgeScope: projection.knowledge_scope,
      ownerProjectCode: expectedOwner,
      originProjectCode,
      generatedAtUtc: projection.generated_at_utc,
    });
    if (canonicalJson(preview) !== canonicalJson(expectedPreview)) {
      fail("candidate_derivation_mismatch", path, "Candidate does not match its generation metadata binding");
    }
  }
  if (sha256Canonical(projection.candidate_previews.map((preview) => preview.history_metadata_digest))
      !== projection.input_binding.ordered_event_digest) {
    fail("candidate_event_digest_mismatch", "$projection.candidate_previews", "Candidate metadata does not match ordered event digest");
  }
  const generationBinding = {
    generation_id: projection.input_binding.generation_id,
    ordered_event_digest: projection.input_binding.ordered_event_digest,
    source_attestation_digest: projection.input_binding.source_attestation_digest,
  };
  const expectedGraphView = buildGraphView({
    generation: generationBinding,
    candidatePreviews: projection.candidate_previews,
    knowledgeScope: projection.knowledge_scope,
    ownerProjectCode: expectedOwner,
    originProjectCode,
    generatedAtUtc: projection.generated_at_utc,
  });
  if (canonicalJson(projection.graph_view) !== canonicalJson(expectedGraphView)) {
    fail("graph_view_derivation_mismatch", "$projection.graph_view", "Graph view is not the exact candidate projection");
  }
  const expectedManifest = buildRagManifest({
    generation: generationBinding,
    graphView: expectedGraphView,
    candidatePreviews: projection.candidate_previews,
    knowledgeScope: projection.knowledge_scope,
    ownerProjectCode: expectedOwner,
    originProjectCode,
    generatedAtUtc: projection.generated_at_utc,
  });
  validateProjectHistoryKnowledgeRagManifest(projection.rag_manifest);
  if (canonicalJson(projection.rag_manifest) !== canonicalJson(expectedManifest)) {
    fail("rag_manifest_derivation_mismatch", "$projection.rag_manifest", "Manifest is not the exact graph projection");
  }
  const indexValidation = validateRagMetadataIndex(projection.rag_metadata_index);
  if (indexValidation.status !== "pass") {
    fail("rag_metadata_index_invalid", "$projection.rag_metadata_index", indexValidation.blockers.join(","));
  }
  if (projection.rag_metadata_index.feature_state !== "off"
      || projection.rag_metadata_index.route !== "owner_decision_needed"
      || projection.rag_metadata_index.generator_id !== RAG_METADATA_INDEX_GENERATOR_ID
      || projection.rag_metadata_index.source_refs.manifest_ref !== null
      || projection.rag_metadata_index.source_refs.manifest_id !== projection.rag_manifest.manifest_id
      || projection.rag_metadata_index.source_refs.decision_packet_ref !== null
      || projection.rag_metadata_index.source_refs.owner_decision_record_ref !== null
      || projection.rag_metadata_index.source_refs.graph_ref !== projection.graph_view.graph_id
      || projection.rag_metadata_index.index_id !== `project_history_knowledge_index_${digestSuffix({
        manifest_id: projection.rag_manifest.manifest_id,
        generated_at_utc: projection.generated_at_utc,
      })}`
      || projection.rag_metadata_index.generated_at_utc !== new Date(projection.generated_at_utc).toISOString()
      || projection.rag_metadata_index.documents.length !== projection.candidate_previews.length) {
    fail("rag_metadata_index_binding_invalid", "$projection.rag_metadata_index", "Index must bind the candidate-only manifest");
  }
  const manifestUnitRefs = projection.rag_manifest.retrieval_units.map((unit) => unit.unit_ref).sort();
  const indexDocumentRefs = projection.rag_metadata_index.documents.map((document) => document.document_ref).sort();
  if (canonicalJson(manifestUnitRefs) !== canonicalJson(indexDocumentRefs)) {
    fail("rag_metadata_index_document_binding_invalid", "$projection.rag_metadata_index.documents", "Index documents must match manifest units");
  }
  const expectedIndexParts = assertRagIndexBindsManifest(
    projection.rag_manifest,
    projection.rag_metadata_index,
  );
  if (canonicalJson(projection.rag_metadata_index.validation) !== canonicalJson(indexValidation)) {
    fail("rag_metadata_index_validation_stale", "$projection.rag_metadata_index.validation", "Embedded validation is stale");
  }
  assertAuthorityOff(projection.rag_metadata_index.authority, "$projection.rag_metadata_index.authority");
  const expectedIndex = {
    schema_version: RAG_METADATA_INDEX_SCHEMA_VERSION,
    kind: "rag_metadata_index",
    status: "ready_metadata_only",
    index_id: `project_history_knowledge_index_${digestSuffix({
      manifest_id: projection.rag_manifest.manifest_id,
      generated_at_utc: projection.generated_at_utc,
    })}`,
    generator_id: RAG_METADATA_INDEX_GENERATOR_ID,
    generated_at_utc: new Date(projection.generated_at_utc).toISOString(),
    source_refs: {
      manifest_ref: null,
      manifest_id: projection.rag_manifest.manifest_id,
      decision_packet_ref: null,
      owner_decision_record_ref: null,
      graph_ref: projection.graph_view.graph_id,
    },
    boundary: PROJECT_HISTORY_RAG_INDEX_BOUNDARY,
    counts: expectedIndexParts.counts,
    documents: expectedIndexParts.documents,
    lexical_index: expectedIndexParts.lexical_index,
    validation: indexValidation,
    feature_state: "off",
    route: "owner_decision_needed",
    authority: buildAuthorityFlags(),
  };
  if (canonicalJson(projection.rag_metadata_index) !== canonicalJson(expectedIndex)) {
    fail(
      "rag_metadata_index_derivation_mismatch",
      "$projection.rag_metadata_index",
      "Index must be the exact deterministic metadata-only manifest projection",
    );
  }
  assertAuthorityOff(projection.authority, "$projection.authority");
  assertBoundary(projection.boundary, "$projection.boundary");
  if (!DIGEST_PATTERN.test(projection.projection_digest)
      || projection.projection_digest !== sha256Canonical(projectionWithout(projection, "projection_digest"))) {
    fail("projection_digest_mismatch", "$projection.projection_digest", "Projection digest does not match");
  }
  return projection;
}
