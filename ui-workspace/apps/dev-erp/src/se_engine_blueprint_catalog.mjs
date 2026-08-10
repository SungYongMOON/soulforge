// SE Engine Blueprint v1.2 candidate: public-safe, data-only architecture
// projection. This module is intentionally not imported by any UI or runtime.
// It describes structure; it does not observe, approve, write, or activate.

export const SE_ENGINE_BLUEPRINT_SCHEMA = "soulforge.se_engine_blueprint.catalog.v0";
export const SE_ENGINE_BLUEPRINT_PLAN_REVISION = "engine_plan_v1_2_candidate";
export const SE_ENGINE_BLUEPRINT_CATALOG_REVISION = "engine_plan_v1_2_candidate_0";

export const SE_ENGINE_BLUEPRINT_IMPLEMENTATION_VIEWS = Object.freeze(["CURRENT", "TARGET", "VERIFY_HP"]);
export const SE_ENGINE_BLUEPRINT_LIFECYCLE_STATES = Object.freeze([
  "active", "draft", "candidate", "blocked", "superseded", "retired", "unknown"
]);
export const SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS = Object.freeze([
  "observed", "source_supported", "validated_private", "canon_candidate", "canon_entry",
  "rejected_or_blocked", "unknown"
]);
export const SE_ENGINE_BLUEPRINT_RELATIONS = Object.freeze([
  "has_revision", "produces", "supports", "returns_evidence_to"
]);

const LAYERS = new Set(["authority", "knowledge", "graph", "state", "context", "action"]);
const ROLES = new Set([
  "source", "ledger", "retrieval", "projection", "capsule", "state", "finding",
  "candidate", "receipt", "gate", "generation", "writer", "feedback"
]);
const IMPLEMENTATION_VIEWS = new Set(SE_ENGINE_BLUEPRINT_IMPLEMENTATION_VIEWS);
const LIFECYCLE_STATES = new Set(SE_ENGINE_BLUEPRINT_LIFECYCLE_STATES);
const CLAIM_CEILINGS = new Set(SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS);
const RELATIONS = new Set(SE_ENGINE_BLUEPRINT_RELATIONS);
const RELATION_STATES = new Set(["candidate"]);
const RELATION_LIFECYCLES = new Set(["active"]);

const ROOT_KEYS = new Set([
  "schema_version", "plan_revision", "projection_kind", "catalog_revision", "catalog_state",
  "claim_ceiling", "status_contract", "boundaries", "source_authority", "non_claims",
  "common_contract_table", "gate_sequence", "nodes", "edges"
]);
const STATUS_CONTRACT_KEYS = new Set([
  "implementation_view_values", "lifecycle_values", "claim_ceiling_values"
]);
const BOUNDARY_KEYS = new Set([
  "metadata_only", "structural_catalog_only", "generated_view_is_not_authority",
  "actual_project_data_included", "raw_payload_included", "private_path_included", "secret_included",
  "ui_integration", "runtime_activation", "writer_activation", "ai_official_approval_allowed",
  "ai_baseline_change_allowed", "ai_external_commitment_allowed", "p8_is_only_erp_writer"
]);
const SOURCE_AUTHORITY_KEYS = new Set([
  "ordered_source_families", "policy_owner_ref", "claim_ceiling",
  "lower_source_may_override_higher", "project_applicability_required",
  "normative_force_and_applicability_remain_distinct", "conflict_requires_human_review"
]);
const CONTRACT_ROW_KEYS = new Set(["contract_id", "owner_scope", "required_fields", "rules", "forbidden"]);
const GATE_KEYS = new Set(["gate_id", "order", "node_id", "requires", "receipt", "unlocks", "stop_condition"]);
const NODE_KEYS = new Set([
  "id", "label", "layer", "role", "entity_ref", "implementation_view", "lifecycle_status",
  "claim_ceiling", "authority_owner_refs",
  "evidence_refs", "required_contract_fields", "forbidden_contract_fields", "prerequisite_node_refs",
  "boundary_note"
]);
const ENTITY_REF_KEYS = new Set(["entity_type", "owner_surface", "entity_id"]);
const EDGE_KEYS = new Set([
  "id", "from_ref", "to_ref", "relation_type", "relation_state", "relation_lifecycle",
  "directed", "label", "source_refs", "claim_ceiling", "evidence_scope", "proves",
  "does_not_prove", "gate_refs"
]);

const FORBIDDEN_RUNTIME_KEYS = new Set([
  "health", "runtime_state", "live_state", "probe", "writer_enabled", "scheduler_enabled",
  "as_of", "absolute_path", "raw_payload", "secret"
]);
const REQUIRED_NON_CLAIMS = Object.freeze([
  "source_truth", "ontology_acceptance", "knowledge_acceptance", "context_acceptance",
  "task_acceptance", "owner_approval", "canon_promotion", "actual_project_readiness",
  "live_binding", "runtime_activation", "writer_activation", "ui_integration", "raw_payload_storage"
]);
const EDGE_DOES_NOT_PROVE = Object.freeze([
  "source_truth", "knowledge_acceptance", "context_acceptance", "task_acceptance",
  "erp_mutation", "live_execution", "edge_receipt", "owner_approval"
]);
const SOURCE_AUTHORITY_ORDER = Object.freeze([
  "project_contract_rfp_sow_cdrl_approved_baseline",
  "current_law_and_regulation",
  "company_approved_process",
  "official_guidance",
  "standards_and_professional_guidance",
  "reviewed_wiki",
  "llm_proposal"
]);

function blueprintFail(code, detail = "") {
  const error = new Error(`${code}${detail ? `: ${detail}` : ""}`);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function safeId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,95}$/u.test(value);
}

function safeText(value, maxLength = 320) {
  return typeof value === "string"
    && value.length > 0
    && Array.from(value).length <= maxLength
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}

function safePublicRef(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.includes("\\")) return false;
  if (/^(?:[A-Za-z]:|\/|~\/|file:|https?:|ssh:|s3:)/iu.test(value)) return false;
  if (/(?:^|\/)\.\.(?:\/|$)/u.test(value)) return false;
  if (/(?:^|\/)(?:_workmeta|_workspaces|private-state|guild_hall\/state|secrets?|\.env)(?:\/|$)/iu.test(value)) return false;
  if (/(?:^|[^A-Za-z0-9])P\d{2}-\d{3}(?:$|[^A-Za-z0-9])/u.test(value)) return false;
  return /^[A-Za-z0-9._:@/-]+$/u.test(value);
}

function exactStringSet(values, expected) {
  return Array.isArray(values)
    && values.length === expected.length
    && new Set(values).size === values.length
    && expected.every((value) => values.includes(value));
}

function exactOrderedStrings(values, expected) {
  return Array.isArray(values)
    && values.length === expected.length
    && values.every((value, index) => value === expected[index]);
}

function boundedStringArray(values, { allowEmpty = true, refs = false } = {}) {
  return Array.isArray(values)
    && (allowEmpty || values.length > 0)
    && values.every((value) => (refs ? safePublicRef(value) : safeId(value)));
}

function unsafeTextMarker(value) {
  if (typeof value !== "string") return null;
  if (/(?:^|[\s"'])(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\/(?:Users|home)\/)/u.test(value)) {
    return "absolute_or_home_path";
  }
  if (/(?:^|[\s\\/])(?:_workmeta|_workspaces|private-state|guild_hall[\\/]state|\.env(?:\.[A-Za-z0-9_-]+)?)(?:[\\/]|$)/iu.test(value)) {
    return "private_surface";
  }
  if (/(?:^|[^A-Za-z0-9])P\d{2}-\d{3}(?:$|[^A-Za-z0-9])/u.test(value)) return "actual_project_identifier";
  if (/(?:password|passwd|api[_-]?key|access[_-]?token|token|secret)\s*[:=]\s*\S+/iu.test(value)) return "secret_like_assignment";
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value)) return "private_key_material";
  return null;
}

function findCatalogViolation(value, seen = new WeakSet()) {
  const unsafeText = unsafeTextMarker(value);
  if (unsafeText) return { code: "blueprint_unsafe_text", detail: unsafeText };
  if (!isRecord(value) && !Array.isArray(value)) return null;
  if (seen.has(value)) return { code: "blueprint_cyclic_input", detail: "repeated_object_reference" };
  seen.add(value);
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RUNTIME_KEYS.has(key)) {
      return { code: "blueprint_forbidden_runtime_field", detail: key };
    }
    const found = findCatalogViolation(entry, seen);
    if (found) return found;
  }
  return null;
}

function deepFreeze(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function canonicalizeObjectKeys(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeObjectKeys(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, canonicalizeObjectKeys(value[key])])
  );
}

function makeNode({
  id, label, layer, role, ownerSurface, claimCeiling, evidenceRefs,
  requiredFields = [], forbiddenFields = [], prerequisites = [], boundaryNote
}) {
  return {
    id,
    label,
    layer,
    role,
    entity_ref: { entity_type: "se_engine_blueprint_component", owner_surface: ownerSurface, entity_id: id },
    implementation_view: "TARGET",
    lifecycle_status: "candidate",
    claim_ceiling: claimCeiling,
    authority_owner_refs: [ownerSurface],
    evidence_refs: evidenceRefs,
    required_contract_fields: requiredFields,
    forbidden_contract_fields: forbiddenFields,
    prerequisite_node_refs: prerequisites,
    boundary_note: boundaryNote
  };
}

function makeEdge(id, from, to, relationType, label, gateRefs = [], sourceRefs = [PLAN_CANDIDATE_REF]) {
  const fromNode = BLUEPRINT_NODES.find((node) => node.id === from);
  const toNode = BLUEPRINT_NODES.find((node) => node.id === to);
  if (!fromNode || !toNode) blueprintFail("blueprint_definition_endpoint_invalid", id);
  return {
    id,
    from_ref: structuredClone(fromNode.entity_ref),
    to_ref: structuredClone(toNode.entity_ref),
    relation_type: relationType,
    relation_state: "candidate",
    relation_lifecycle: "active",
    directed: true,
    label,
    source_refs: sourceRefs,
    claim_ceiling: "observed",
    evidence_scope: "structural_catalog_only",
    proves: ["structural_catalog_relationship_only"],
    does_not_prove: [...EDGE_DOES_NOT_PROVE],
    gate_refs: gateRefs
  };
}

export const SE_ENGINE_BLUEPRINT_COMMON_CONTRACT_TABLE = deepFreeze([
  {
    contract_id: "id",
    owner_scope: "owner_scope:existing_entity_owners",
    required_fields: ["entity_type", "owner_surface", "entity_id"],
    rules: ["Reuse stable identifiers, typed references, and exact revisions from their existing owners."],
    forbidden: ["mutable_path_as_identity", "invented_project_identifier", "silent_rekey"]
  },
  {
    contract_id: "owner",
    owner_scope: "owner_scope:source_context_task_and_human_authorities",
    required_fields: ["authority_owner_refs", "evidence_refs", "claim_ceiling"],
    rules: ["Source, context, approval, task, and ERP owners remain separate; generated views own none of them."],
    forbidden: ["projection_as_truth_owner", "ai_as_official_approver", "view_as_writer"]
  },
  {
    contract_id: "node",
    owner_scope: "owner_scope:se_engine_blueprint_candidate",
    required_fields: ["entity_ref", "layer", "role", "implementation_view", "lifecycle_status", "claim_ceiling"],
    rules: ["Every node is metadata-only and exposes the weakest supported claim."],
    forbidden: ["raw_payload", "actual_project_data", "runtime_health_claim"]
  },
  {
    contract_id: "edge",
    owner_scope: "owner_scope:se_engine_blueprint_candidate",
    required_fields: [
      "from_ref", "to_ref", "relation_type", "relation_state", "relation_lifecycle",
      "directed", "source_refs", "claim_ceiling", "evidence_scope", "does_not_prove"
    ],
    rules: ["Every edge is a structural catalog relationship, never an execution or acceptance receipt."],
    forbidden: ["dangling_endpoint", "runtime_state", "authority_escalation"]
  },
  {
    contract_id: "status",
    owner_scope: "owner_scope:existing_status_contracts",
    required_fields: ["implementation_view", "lifecycle_status", "claim_ceiling"],
    rules: ["Implementation view, lifecycle, and claim ceiling remain separate axes."],
    forbidden: ["view_status_as_truth", "implicit_promotion", "unsupported_claim_upgrade"]
  },
  {
    contract_id: "gate",
    owner_scope: "owner_scope:registered_human_and_task_engine_authorities",
    required_fields: ["gate_id", "order", "requires", "receipt", "stop_condition"],
    rules: ["P5 context acceptance precedes P6 candidate, P6 receipt precedes P7, and P7 receipt precedes P8."],
    forbidden: ["gate_bypass", "automatic_official_acceptance", "writer_before_p8"]
  }
]);

export const SE_ENGINE_BLUEPRINT_GATE_SEQUENCE = deepFreeze([
  {
    gate_id: "p5_context_acceptance",
    order: 5,
    node_id: "p5_human_acceptance",
    requires: ["context_response_candidate", "registered_human_authority"],
    receipt: "context_acceptance_receipt",
    unlocks: ["accepted_context_generation_next"],
    stop_condition: "missing_or_rejected_context_acceptance"
  },
  {
    gate_id: "p6_candidate_generation",
    order: 6,
    node_id: "p6_task_intent_candidate",
    requires: ["accepted_context_generation_next", "finding_disposition", "context_sufficiency", "authority_sufficiency"],
    receipt: "task_intent_candidate_receipt",
    unlocks: ["p7_task_driver"],
    stop_condition: "missing_context_sufficiency_or_authority"
  },
  {
    gate_id: "p7_task_driver_acceptance",
    order: 7,
    node_id: "p7_task_driver",
    requires: ["p6_task_intent_candidate", "task_intent_candidate_receipt", "why", "why_now", "authority", "idempotency"],
    receipt: "task_driver_acceptance_receipt",
    unlocks: ["p8_sole_erp_writer"],
    stop_condition: "missing_driver_acceptance"
  },
  {
    gate_id: "p8_atomic_erp_write",
    order: 8,
    node_id: "p8_sole_erp_writer",
    requires: ["p7_task_driver", "task_driver_acceptance_receipt", "sole_writer_contract"],
    receipt: "erp_atomic_write_receipt",
    unlocks: [],
    stop_condition: "writer_not_authorized_or_not_sole"
  }
]);

const TEMPORAL_ONTOLOGY_REF = "docs/architecture/foundation/TEMPORAL_KNOWLEDGE_ONTOLOGY_V0.md";
const RAG_CONTRACT_REF = "docs/architecture/guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md";
const WIKI_CONTRACT_REF = "docs/architecture/guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md";
const KNOWLEDGE_GRAPH_REF = "docs/architecture/guild_hall/KNOWLEDGE_GRAPH_VIEW_MODEL_V0.md";
const PROJECT_CONTEXT_REF = "docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md";
const TASK_ENGINE_REF = "ui-workspace/apps/dev-erp/docs/TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md";
const PLAN_CANDIDATE_REF = "owner_scope:engine_plan_v1_2_candidate";

const BLUEPRINT_NODES = [
  makeNode({ id: "authoritative_sources", label: "Authoritative Sources", layer: "authority", role: "source", ownerSurface: "owner_scope:source_authority", claimCeiling: "observed", evidenceRefs: [TEMPORAL_ONTOLOGY_REF, PLAN_CANDIDATE_REF], requiredFields: ["source_id", "authority_kind", "normative_force", "applicability", "review_state"], boundaryNote: "The Owner-plan precedence is a candidate policy; normative force and project applicability remain separate." }),
  makeNode({ id: "source_revision_ledger", label: "Source Revision Ledger", layer: "authority", role: "ledger", ownerSurface: "owner_scope:source_revision_ledger", claimCeiling: "source_supported", evidenceRefs: [TEMPORAL_ONTOLOGY_REF], requiredFields: ["source_revision_id", "content_id", "sha256", "valid_at", "known_at"], prerequisites: ["authoritative_sources"], boundaryNote: "Exact immutable source identity remains with the source owner." }),
  makeNode({ id: "rag_evidence", label: "RAG Evidence", layer: "knowledge", role: "retrieval", ownerSurface: "owner_scope:rag_projection", claimCeiling: "source_supported", evidenceRefs: [RAG_CONTRACT_REF], requiredFields: ["rag_index_id", "rag_chunk_id", "evidence_locator_id", "source_revision_id"], prerequisites: ["source_revision_ledger"], boundaryNote: "RAG is a rebuildable search projection, not source truth." }),
  makeNode({ id: "reviewed_wiki", label: "Reviewed Wiki", layer: "knowledge", role: "projection", ownerSurface: ".party/knowledge_wiki_cell", claimCeiling: "source_supported", evidenceRefs: [WIKI_CONTRACT_REF], requiredFields: ["wiki_page_id", "wiki_revision_id", "source_revision_refs", "claim_refs", "claim_ceiling"], prerequisites: ["source_revision_ledger"], boundaryNote: "Wiki text is a reviewed source-bound explanation and cannot replace source truth." }),
  makeNode({ id: "knowledge_lineage_graph", label: "Knowledge Lineage Graph", layer: "graph", role: "projection", ownerSurface: "guild_hall/knowledge_graph", claimCeiling: "source_supported", evidenceRefs: [KNOWLEDGE_GRAPH_REF, TEMPORAL_ONTOLOGY_REF], requiredFields: ["entity_ref", "relation_state", "source_refs", "claim_ceiling"], prerequisites: ["rag_evidence", "reviewed_wiki"], boundaryNote: "The graph is a generated navigation projection and owns no knowledge acceptance." }),
  makeNode({ id: "project_state_graph", label: "Project State Graph", layer: "graph", role: "projection", ownerSurface: "owner_scope:project_context", claimCeiling: "source_supported", evidenceRefs: [PROJECT_CONTEXT_REF], requiredFields: ["project_ref", "gate_ref", "branch_ref", "context_event_refs", "claim_ceiling"], prerequisites: ["knowledge_lineage_graph"], boundaryNote: "This projection does not become a second project-context truth owner." }),
  makeNode({ id: "accepted_context_generation_current", label: "Current Accepted Context Generation", layer: "context", role: "generation", ownerSurface: "owner_scope:project_context", claimCeiling: "source_supported", evidenceRefs: [TASK_ENGINE_REF, PROJECT_CONTEXT_REF], requiredFields: ["accepted_context_generation", "context_acceptance_receipt", "exact_context_revision_refs"], boundaryNote: "This input generation was accepted before the current immutable snapshot is derived." }),
  makeNode({ id: "context_capsule", label: "Task Context Capsule", layer: "context", role: "capsule", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PROJECT_CONTEXT_REF, PLAN_CANDIDATE_REF], requiredFields: ["project_code", "gate_ref", "branch_ref", "accepted_context_generation", "exact_evidence_refs", "valid_at", "known_at", "claim_ceiling", "fingerprint", "size_budget"], prerequisites: ["project_state_graph", "accepted_context_generation_current"], boundaryNote: "A task receives a bounded minimum subgraph, never the whole project or corpus." }),
  makeNode({ id: "se_expected_state", label: "SE Expected State", layer: "state", role: "state", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["expected_state_id", "source_revision_refs", "applicability", "valid_at", "known_at"], prerequisites: ["context_capsule"], boundaryNote: "Expected state is derived from applicable authority and accepted context." }),
  makeNode({ id: "project_observed_state", label: "Project Observed State", layer: "state", role: "state", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["observed_state_id", "artifact_revision_refs", "evidence_refs", "valid_at", "known_at"], prerequisites: ["context_capsule"], boundaryNote: "Observed state separates file presence, evidence sufficiency, acceptance, and completion." }),
  makeNode({ id: "project_state_snapshot", label: "Current Immutable Project State Snapshot", layer: "state", role: "state", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF, TEMPORAL_ONTOLOGY_REF], requiredFields: ["snapshot_id", "project_code", "typed_ref", "revision_id", "accepted_context_generation", "valid_at", "known_at", "exact_source_artifact_revision_hash_refs", "state_axes", "evidence_lineage", "claim_ceiling", "deterministic_replay_fingerprint", "prior_snapshot_ref", "prior_snapshot_diff"], forbiddenFields: ["as_of"], prerequisites: ["se_expected_state", "project_observed_state", "accepted_context_generation_current"], boundaryNote: "The snapshot is an immutable derived projection, never a new truth owner or baseline writer." }),
  makeNode({ id: "gap_unknown_finding", label: "Gap / Unknown Finding", layer: "state", role: "finding", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["finding_id", "finding_kind", "snapshot_ref", "evidence_sufficiency", "authority_status"], prerequisites: ["project_state_snapshot"], boundaryNote: "Missing, unknown, insufficient evidence, and rejection remain distinct states." }),
  makeNode({ id: "context_request_candidate", label: "Context Request Candidate", layer: "context", role: "candidate", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["context_request_id", "finding_ref", "requested_context_scope", "request_authority"], prerequisites: ["gap_unknown_finding"], boundaryNote: "A finding proposes a request candidate; it does not create a TaskIntent." }),
  makeNode({ id: "context_exchange_receipts", label: "Request / Response Receipts", layer: "context", role: "receipt", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["request_receipt_ref", "response_receipt_ref", "request_revision_ref", "response_revision_ref"], prerequisites: ["context_request_candidate"], boundaryNote: "Receipts prove exchange only; they do not prove context acceptance." }),
  makeNode({ id: "context_response_candidate", label: "Context Response Candidate", layer: "context", role: "candidate", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["context_candidate_id", "response_receipt_ref", "source_revision_refs", "claim_ceiling", "authority_status"], prerequisites: ["context_exchange_receipts"], boundaryNote: "A response remains a context candidate until P5 human review and acceptance." }),
  makeNode({ id: "p5_human_acceptance", label: "P5 Human Review / Acceptance", layer: "context", role: "gate", ownerSurface: "owner_scope:registered_human_authority", claimCeiling: "observed", evidenceRefs: [TASK_ENGINE_REF, PLAN_CANDIDATE_REF], requiredFields: ["context_acceptance_receipt", "registered_approver_ref", "authority_scope", "accepted_context_refs"], prerequisites: ["context_response_candidate"], boundaryNote: "The Owner-plan candidate requires registered human authority for official project-context acceptance." }),
  makeNode({ id: "accepted_context_generation_next", label: "Next Accepted Context Generation", layer: "context", role: "generation", ownerSurface: "owner_scope:project_context", claimCeiling: "source_supported", evidenceRefs: [TASK_ENGINE_REF, PROJECT_CONTEXT_REF], requiredFields: ["accepted_context_generation", "context_acceptance_receipt", "exact_context_revision_refs"], prerequisites: ["p5_human_acceptance"], boundaryNote: "A next generation exists only after the P5 acceptance receipt." }),
  makeNode({ id: "project_state_snapshot_next", label: "Next Immutable Project State Snapshot", layer: "state", role: "state", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF, TEMPORAL_ONTOLOGY_REF], requiredFields: ["snapshot_id", "project_code", "typed_ref", "revision_id", "accepted_context_generation", "valid_at", "known_at", "exact_source_artifact_revision_hash_refs", "state_axes", "evidence_lineage", "claim_ceiling", "deterministic_replay_fingerprint", "prior_snapshot_ref", "prior_snapshot_diff"], forbiddenFields: ["as_of"], prerequisites: ["accepted_context_generation_next"], boundaryNote: "The next snapshot is replayed from the next accepted generation and points back to the prior snapshot." }),
  makeNode({ id: "finding_disposition", label: "Finding Close / Supersede / Reopen", layer: "state", role: "finding", ownerSurface: PLAN_CANDIDATE_REF, claimCeiling: "observed", evidenceRefs: [PLAN_CANDIDATE_REF], requiredFields: ["finding_ref", "snapshot_ref", "disposition", "review_receipt_ref"], prerequisites: ["project_state_snapshot_next", "gap_unknown_finding"], boundaryNote: "Finding disposition follows the next snapshot and remains append-only and review-bound." }),
  makeNode({ id: "p6_task_intent_candidate", label: "P6 TaskIntent Candidate", layer: "action", role: "candidate", ownerSurface: "owner_scope:responsibility_engineering_ax", claimCeiling: "source_supported", evidenceRefs: [TASK_ENGINE_REF], requiredFields: ["task_intent_candidate_id", "accepted_context_generation", "finding_ref", "authority_ceiling", "idempotency_key"], prerequisites: ["accepted_context_generation_next", "finding_disposition"], boundaryNote: "P6 is candidate-only and must produce zero ERP or official Task rows." }),
  makeNode({ id: "p7_task_driver", label: "P7 TaskDriver", layer: "action", role: "candidate", ownerSurface: "owner_scope:responsibility_engineering_ax", claimCeiling: "source_supported", evidenceRefs: [TASK_ENGINE_REF], requiredFields: ["task_driver_id", "why", "why_now", "authority", "expiry", "revocation", "idempotency", "task_driver_acceptance_receipt"], prerequisites: ["p6_task_intent_candidate"], boundaryNote: "P7 cannot open P8 until why, authority, and idempotency are accepted." }),
  makeNode({ id: "p8_sole_erp_writer", label: "P8 Sole ERP Writer", layer: "action", role: "writer", ownerSurface: "ui-workspace/apps/dev-erp", claimCeiling: "source_supported", evidenceRefs: [TASK_ENGINE_REF], requiredFields: ["task_driver_ref", "task_driver_acceptance_receipt", "sole_writer_contract", "atomic_write_receipt"], prerequisites: ["p7_task_driver"], boundaryNote: "The writer remains feature-OFF and synthetic; no live or actual-project mutation is authorized." }),
  makeNode({ id: "execution_evidence_feedback", label: "Execution Evidence / Review Feedback", layer: "action", role: "feedback", ownerSurface: "owner_scope:execution_evidence", claimCeiling: "observed", evidenceRefs: [TASK_ENGINE_REF], requiredFields: ["task_ref", "result_revision_ref", "evidence_refs", "review_state", "recorded_at"], prerequisites: ["p8_sole_erp_writer"], boundaryNote: "Agent success or closeout is not official completion or verification acceptance." })
];

const BLUEPRINT_EDGES = [
  makeEdge("edge_source_has_revision", "authoritative_sources", "source_revision_ledger", "has_revision", "exact revision"),
  makeEdge("edge_revision_produces_rag", "source_revision_ledger", "rag_evidence", "produces", "revision-bound retrieval"),
  makeEdge("edge_revision_produces_wiki", "source_revision_ledger", "reviewed_wiki", "produces", "source-bound explanation"),
  makeEdge("edge_rag_supports_knowledge_graph", "rag_evidence", "knowledge_lineage_graph", "supports", "evidence lineage"),
  makeEdge("edge_wiki_supports_knowledge_graph", "reviewed_wiki", "knowledge_lineage_graph", "supports", "reviewed claim lineage"),
  makeEdge("edge_knowledge_supports_project_graph", "knowledge_lineage_graph", "project_state_graph", "supports", "exact knowledge refs"),
  makeEdge("edge_project_graph_produces_capsule", "project_state_graph", "context_capsule", "produces", "bounded task subgraph"),
  makeEdge("edge_current_generation_supports_capsule", "accepted_context_generation_current", "context_capsule", "supports", "current accepted context"),
  makeEdge("edge_capsule_supports_expected", "context_capsule", "se_expected_state", "supports", "applicable expectation context"),
  makeEdge("edge_capsule_supports_observed", "context_capsule", "project_observed_state", "supports", "bounded observed context"),
  makeEdge("edge_expected_supports_snapshot", "se_expected_state", "project_state_snapshot", "supports", "expected state axis"),
  makeEdge("edge_observed_supports_snapshot", "project_observed_state", "project_state_snapshot", "supports", "observed state axis"),
  makeEdge("edge_current_generation_produces_snapshot", "accepted_context_generation_current", "project_state_snapshot", "produces", "current immutable replay input"),
  makeEdge("edge_snapshot_produces_finding", "project_state_snapshot", "gap_unknown_finding", "produces", "gap and unknown comparison"),
  makeEdge("edge_finding_produces_request", "gap_unknown_finding", "context_request_candidate", "produces", "context request candidate"),
  makeEdge("edge_request_produces_receipts", "context_request_candidate", "context_exchange_receipts", "produces", "request and response receipts"),
  makeEdge("edge_receipts_produce_candidate", "context_exchange_receipts", "context_response_candidate", "produces", "response remains candidate"),
  makeEdge("edge_candidate_supports_p5", "context_response_candidate", "p5_human_acceptance", "supports", "human review input"),
  makeEdge("edge_p5_produces_next_generation", "p5_human_acceptance", "accepted_context_generation_next", "produces", "next accepted generation", ["p5_context_acceptance"]),
  makeEdge("edge_next_generation_produces_snapshot", "accepted_context_generation_next", "project_state_snapshot_next", "produces", "next immutable replay input", ["p5_context_acceptance"]),
  makeEdge("edge_next_snapshot_produces_disposition", "project_state_snapshot_next", "finding_disposition", "produces", "close supersede or reopen", ["p5_context_acceptance"]),
  makeEdge("edge_finding_supports_disposition", "gap_unknown_finding", "finding_disposition", "supports", "finding lineage"),
  makeEdge("edge_disposition_produces_p6", "finding_disposition", "p6_task_intent_candidate", "produces", "sufficiency and authority gated candidate", ["p5_context_acceptance", "p6_candidate_generation"]),
  makeEdge("edge_p6_produces_p7", "p6_task_intent_candidate", "p7_task_driver", "produces", "accepted candidate to TaskDriver", ["p6_candidate_generation"]),
  makeEdge("edge_p7_produces_p8", "p7_task_driver", "p8_sole_erp_writer", "produces", "accepted driver to atomic writer", ["p7_task_driver_acceptance", "p8_atomic_erp_write"]),
  makeEdge("edge_p8_produces_feedback", "p8_sole_erp_writer", "execution_evidence_feedback", "produces", "result and evidence feedback", ["p8_atomic_erp_write"]),
  makeEdge("edge_feedback_returns_to_observed", "execution_evidence_feedback", "project_observed_state", "returns_evidence_to", "observed state feedback")
];

export const SE_ENGINE_BLUEPRINT_CATALOG = deepFreeze({
  schema_version: SE_ENGINE_BLUEPRINT_SCHEMA,
  plan_revision: SE_ENGINE_BLUEPRINT_PLAN_REVISION,
  projection_kind: "se_engine_architecture",
  catalog_revision: SE_ENGINE_BLUEPRINT_CATALOG_REVISION,
  catalog_state: "candidate",
  claim_ceiling: "observed",
  status_contract: {
    implementation_view_values: [...SE_ENGINE_BLUEPRINT_IMPLEMENTATION_VIEWS],
    lifecycle_values: [...SE_ENGINE_BLUEPRINT_LIFECYCLE_STATES],
    claim_ceiling_values: [...SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS]
  },
  boundaries: {
    metadata_only: true,
    structural_catalog_only: true,
    generated_view_is_not_authority: true,
    actual_project_data_included: false,
    raw_payload_included: false,
    private_path_included: false,
    secret_included: false,
    ui_integration: false,
    runtime_activation: false,
    writer_activation: false,
    ai_official_approval_allowed: false,
    ai_baseline_change_allowed: false,
    ai_external_commitment_allowed: false,
    p8_is_only_erp_writer: true
  },
  source_authority: {
    ordered_source_families: [...SOURCE_AUTHORITY_ORDER],
    policy_owner_ref: PLAN_CANDIDATE_REF,
    claim_ceiling: "observed",
    lower_source_may_override_higher: false,
    project_applicability_required: true,
    normative_force_and_applicability_remain_distinct: true,
    conflict_requires_human_review: true
  },
  non_claims: [...REQUIRED_NON_CLAIMS],
  common_contract_table: SE_ENGINE_BLUEPRINT_COMMON_CONTRACT_TABLE,
  gate_sequence: SE_ENGINE_BLUEPRINT_GATE_SEQUENCE,
  nodes: BLUEPRINT_NODES,
  edges: BLUEPRINT_EDGES
});

const REQUIRED_CONTRACT_IDS = ["id", "owner", "node", "edge", "status", "gate"];
const REQUIRED_GATE_IDS = [
  "p5_context_acceptance", "p6_candidate_generation", "p7_task_driver_acceptance", "p8_atomic_erp_write"
];
const EXPECTED_NODE_IDS = new Set(BLUEPRINT_NODES.map((node) => node.id));
const EXPECTED_EDGE_IDS = new Set(BLUEPRINT_EDGES.map((edge) => edge.id));
const EXPECTED_CONTRACT_BY_ID = new Map(SE_ENGINE_BLUEPRINT_COMMON_CONTRACT_TABLE.map((row) => [row.contract_id, row]));
const EXPECTED_GATE_BY_ID = new Map(SE_ENGINE_BLUEPRINT_GATE_SEQUENCE.map((gate) => [gate.gate_id, gate]));
const EXPECTED_NODE_BY_ID = new Map(BLUEPRINT_NODES.map((node) => [node.id, node]));
const EXPECTED_EDGE_BY_ID = new Map(BLUEPRINT_EDGES.map((edge) => [edge.id, edge]));
const GATE_IDS = new Set(REQUIRED_GATE_IDS);
const CONTRACT_ORDER = new Map(REQUIRED_CONTRACT_IDS.map((id, index) => [id, index]));
const NODE_ORDER = new Map(BLUEPRINT_NODES.map((node, index) => [node.id, index]));
const EDGE_ORDER = new Map(BLUEPRINT_EDGES.map((edge, index) => [edge.id, index]));

const SNAPSHOT_REQUIRED_FIELDS = [
  "snapshot_id", "project_code", "typed_ref", "revision_id", "accepted_context_generation",
  "valid_at", "known_at", "exact_source_artifact_revision_hash_refs", "state_axes", "evidence_lineage",
  "claim_ceiling", "deterministic_replay_fingerprint", "prior_snapshot_ref", "prior_snapshot_diff"
];
const CONTEXT_LIFECYCLE_PAIRS = [
  ["gap_unknown_finding", "context_request_candidate"],
  ["context_request_candidate", "context_exchange_receipts"],
  ["context_exchange_receipts", "context_response_candidate"],
  ["context_response_candidate", "p5_human_acceptance"],
  ["p5_human_acceptance", "accepted_context_generation_next"],
  ["accepted_context_generation_next", "project_state_snapshot_next"],
  ["project_state_snapshot_next", "finding_disposition"],
  ["finding_disposition", "p6_task_intent_candidate"],
  ["p6_task_intent_candidate", "p7_task_driver"],
  ["p7_task_driver", "p8_sole_erp_writer"]
];
const FORBIDDEN_BYPASS_PAIRS = new Set([
  "p5_human_acceptance>p6_task_intent_candidate",
  "p5_human_acceptance>p7_task_driver",
  "p5_human_acceptance>p8_sole_erp_writer",
  "p6_task_intent_candidate>p8_sole_erp_writer",
  "gap_unknown_finding>p6_task_intent_candidate",
  "context_request_candidate>p6_task_intent_candidate",
  "context_response_candidate>p6_task_intent_candidate"
]);

function validateContractTable(rows) {
  if (!Array.isArray(rows) || rows.length !== REQUIRED_CONTRACT_IDS.length) blueprintFail("blueprint_contract_table_invalid");
  const ids = new Set();
  for (const row of rows) {
    if (!hasExactKeys(row, CONTRACT_ROW_KEYS) || !REQUIRED_CONTRACT_IDS.includes(row.contract_id)) {
      blueprintFail("blueprint_contract_row_invalid");
    }
    if (ids.has(row.contract_id)) blueprintFail("blueprint_contract_duplicate", row.contract_id);
    ids.add(row.contract_id);
    if (!safePublicRef(row.owner_scope)
      || !boundedStringArray(row.required_fields, { allowEmpty: false })
      || !Array.isArray(row.rules) || row.rules.length === 0 || !row.rules.every((rule) => safeText(rule, 360))
      || !boundedStringArray(row.forbidden, { allowEmpty: false })) {
      blueprintFail("blueprint_contract_row_invalid", row.contract_id);
    }
    const expected = EXPECTED_CONTRACT_BY_ID.get(row.contract_id);
    if (row.owner_scope !== expected.owner_scope
      || !exactStringSet(row.required_fields, expected.required_fields)
      || !exactStringSet(row.rules, expected.rules)
      || !exactStringSet(row.forbidden, expected.forbidden)) {
      blueprintFail("blueprint_contract_definition_invalid", row.contract_id);
    }
  }
  if (!REQUIRED_CONTRACT_IDS.every((id) => ids.has(id))) blueprintFail("blueprint_contract_table_invalid");
}

function validateGateSequence(gates) {
  if (!Array.isArray(gates) || gates.length !== REQUIRED_GATE_IDS.length) blueprintFail("blueprint_gate_sequence_invalid");
  const gateIds = new Set();
  for (const gate of gates) {
    if (!hasExactKeys(gate, GATE_KEYS) || !REQUIRED_GATE_IDS.includes(gate.gate_id)) blueprintFail("blueprint_gate_invalid");
    if (gateIds.has(gate.gate_id)) blueprintFail("blueprint_gate_duplicate", gate.gate_id);
    gateIds.add(gate.gate_id);
    if (!Number.isInteger(gate.order) || ![5, 6, 7, 8].includes(gate.order)
      || !safeId(gate.node_id) || !boundedStringArray(gate.requires, { allowEmpty: false })
      || !safeId(gate.receipt) || !boundedStringArray(gate.unlocks)
      || !safeId(gate.stop_condition)) {
      blueprintFail("blueprint_gate_invalid", gate.gate_id);
    }
    const expected = EXPECTED_GATE_BY_ID.get(gate.gate_id);
    if (gate.order !== expected.order
      || gate.node_id !== expected.node_id
      || gate.receipt !== expected.receipt
      || gate.stop_condition !== expected.stop_condition
      || !exactStringSet(gate.requires, expected.requires)
      || !exactStringSet(gate.unlocks, expected.unlocks)) {
      blueprintFail("blueprint_gate_definition_invalid", gate.gate_id);
    }
  }
  if (!REQUIRED_GATE_IDS.every((id) => gateIds.has(id))) blueprintFail("blueprint_gate_sequence_invalid");
}

function exactEntityRef(value, expected) {
  return hasExactKeys(value, ENTITY_REF_KEYS)
    && value.entity_type === expected.entity_type
    && value.owner_surface === expected.owner_surface
    && value.entity_id === expected.entity_id;
}

function validateNode(node) {
  if (!hasExactKeys(node, NODE_KEYS)) blueprintFail("blueprint_node_shape_invalid", node?.id ?? "unknown");
  if (!safeId(node.id) || !safeText(node.label, 160) || !LAYERS.has(node.layer) || !ROLES.has(node.role)) {
    blueprintFail("blueprint_node_value_invalid", node.id);
  }
  if (!hasExactKeys(node.entity_ref, ENTITY_REF_KEYS)
    || !safeId(node.entity_ref.entity_type)
    || !safePublicRef(node.entity_ref.owner_surface)
    || node.entity_ref.entity_id !== node.id) {
    blueprintFail("blueprint_entity_ref_invalid", node.id);
  }
  if (!IMPLEMENTATION_VIEWS.has(node.implementation_view)
    || !LIFECYCLE_STATES.has(node.lifecycle_status)
    || !CLAIM_CEILINGS.has(node.claim_ceiling)) {
    blueprintFail("blueprint_node_status_invalid", node.id);
  }
  if (node.implementation_view !== "TARGET" || node.lifecycle_status !== "candidate") {
    blueprintFail("blueprint_candidate_status_boundary", node.id);
  }
  if (!boundedStringArray(node.authority_owner_refs, { allowEmpty: false, refs: true })
    || !boundedStringArray(node.evidence_refs, { allowEmpty: false, refs: true })
    || !boundedStringArray(node.required_contract_fields)
    || !boundedStringArray(node.forbidden_contract_fields)
    || !boundedStringArray(node.prerequisite_node_refs)
    || !safeText(node.boundary_note, 360)) {
    blueprintFail("blueprint_node_contract_invalid", node.id);
  }
  const expected = EXPECTED_NODE_BY_ID.get(node.id);
  if (!expected
    || node.label !== expected.label
    || node.layer !== expected.layer
    || node.role !== expected.role
    || !exactEntityRef(node.entity_ref, expected.entity_ref)
    || node.implementation_view !== expected.implementation_view
    || node.lifecycle_status !== expected.lifecycle_status
    || node.claim_ceiling !== expected.claim_ceiling
    || node.boundary_note !== expected.boundary_note
    || !exactStringSet(node.authority_owner_refs, expected.authority_owner_refs)
    || !exactStringSet(node.evidence_refs, expected.evidence_refs)
    || !exactStringSet(node.required_contract_fields, expected.required_contract_fields)
    || !exactStringSet(node.forbidden_contract_fields, expected.forbidden_contract_fields)
    || !exactStringSet(node.prerequisite_node_refs, expected.prerequisite_node_refs)) {
    blueprintFail("blueprint_node_definition_invalid", node.id);
  }
}

function validateEdge(edge, nodeIds) {
  if (!hasExactKeys(edge, EDGE_KEYS)) blueprintFail("blueprint_edge_shape_invalid", edge?.id ?? "unknown");
  if (!safeId(edge.id)
    || !hasExactKeys(edge.from_ref, ENTITY_REF_KEYS)
    || !hasExactKeys(edge.to_ref, ENTITY_REF_KEYS)
    || !safeId(edge.from_ref.entity_id)
    || !safeId(edge.to_ref.entity_id)
    || edge.from_ref.entity_id === edge.to_ref.entity_id
    || !nodeIds.has(edge.from_ref.entity_id)
    || !nodeIds.has(edge.to_ref.entity_id)
    || !RELATIONS.has(edge.relation_type)
    || !RELATION_STATES.has(edge.relation_state)
    || !RELATION_LIFECYCLES.has(edge.relation_lifecycle)
    || edge.directed !== true
    || !safeText(edge.label, 180)) {
    blueprintFail("blueprint_edge_invalid", edge.id);
  }
  if (edge.evidence_scope !== "structural_catalog_only"
    || edge.claim_ceiling !== "observed"
    || !boundedStringArray(edge.source_refs, { allowEmpty: false, refs: true })
    || !exactStringSet(edge.proves, ["structural_catalog_relationship_only"])
    || !exactStringSet(edge.does_not_prove, EDGE_DOES_NOT_PROVE)
    || !Array.isArray(edge.gate_refs) || !edge.gate_refs.every((gateRef) => GATE_IDS.has(gateRef))) {
    blueprintFail("blueprint_edge_claim_boundary_invalid", edge.id);
  }
  const pair = `${edge.from_ref.entity_id}>${edge.to_ref.entity_id}`;
  if (FORBIDDEN_BYPASS_PAIRS.has(pair)) blueprintFail("blueprint_gate_bypass", edge.id);
  const expected = EXPECTED_EDGE_BY_ID.get(edge.id);
  if (!expected
    || !exactEntityRef(edge.from_ref, expected.from_ref)
    || !exactEntityRef(edge.to_ref, expected.to_ref)
    || edge.relation_type !== expected.relation_type
    || edge.relation_state !== expected.relation_state
    || edge.relation_lifecycle !== expected.relation_lifecycle
    || edge.directed !== expected.directed
    || edge.label !== expected.label
    || edge.claim_ceiling !== expected.claim_ceiling
    || edge.evidence_scope !== expected.evidence_scope
    || !exactStringSet(edge.source_refs, expected.source_refs)
    || !exactStringSet(edge.proves, expected.proves)
    || !exactStringSet(edge.does_not_prove, expected.does_not_prove)
    || !exactStringSet(edge.gate_refs, expected.gate_refs)) {
    blueprintFail("blueprint_edge_definition_invalid", edge.id);
  }
}

function validatePrerequisiteDag(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map();
  function visit(nodeId) {
    if (state.get(nodeId) === "visiting") blueprintFail("blueprint_prerequisite_cycle", nodeId);
    if (state.get(nodeId) === "visited") return;
    state.set(nodeId, "visiting");
    for (const prerequisite of byId.get(nodeId).prerequisite_node_refs) visit(prerequisite);
    state.set(nodeId, "visited");
  }
  for (const node of nodes) visit(node.id);
}

export function validateSeEngineBlueprintCatalog(value) {
  const violation = findCatalogViolation(value);
  if (violation) blueprintFail(violation.code, violation.detail);
  if (!hasExactKeys(value, ROOT_KEYS)) blueprintFail("blueprint_root_shape_invalid");
  if (value.schema_version !== SE_ENGINE_BLUEPRINT_SCHEMA
    || value.plan_revision !== SE_ENGINE_BLUEPRINT_PLAN_REVISION
    || value.projection_kind !== "se_engine_architecture"
    || value.catalog_revision !== SE_ENGINE_BLUEPRINT_CATALOG_REVISION
    || value.catalog_state !== "candidate"
    || value.claim_ceiling !== "observed") {
    blueprintFail("blueprint_root_value_invalid");
  }
  if (!hasExactKeys(value.status_contract, STATUS_CONTRACT_KEYS)
    || !exactStringSet(value.status_contract.implementation_view_values, SE_ENGINE_BLUEPRINT_IMPLEMENTATION_VIEWS)
    || !exactStringSet(value.status_contract.lifecycle_values, SE_ENGINE_BLUEPRINT_LIFECYCLE_STATES)
    || !exactStringSet(value.status_contract.claim_ceiling_values, SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS)) {
    blueprintFail("blueprint_status_contract_invalid");
  }
  if (!hasExactKeys(value.boundaries, BOUNDARY_KEYS)
    || value.boundaries.metadata_only !== true
    || value.boundaries.structural_catalog_only !== true
    || value.boundaries.generated_view_is_not_authority !== true
    || value.boundaries.p8_is_only_erp_writer !== true
    || Object.entries(value.boundaries).some(([key, entry]) => (
      !["metadata_only", "structural_catalog_only", "generated_view_is_not_authority", "p8_is_only_erp_writer"].includes(key)
        && entry !== false
    ))) {
    blueprintFail("blueprint_boundary_invalid");
  }
  if (!hasExactKeys(value.source_authority, SOURCE_AUTHORITY_KEYS)
    || !exactOrderedStrings(value.source_authority.ordered_source_families, SOURCE_AUTHORITY_ORDER)
    || value.source_authority.policy_owner_ref !== PLAN_CANDIDATE_REF
    || value.source_authority.claim_ceiling !== "observed"
    || value.source_authority.lower_source_may_override_higher !== false
    || value.source_authority.project_applicability_required !== true
    || value.source_authority.normative_force_and_applicability_remain_distinct !== true
    || value.source_authority.conflict_requires_human_review !== true) {
    blueprintFail("blueprint_source_authority_invalid");
  }
  if (!exactStringSet(value.non_claims, REQUIRED_NON_CLAIMS)) blueprintFail("blueprint_non_claims_invalid");

  validateContractTable(value.common_contract_table);
  validateGateSequence(value.gate_sequence);
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) blueprintFail("blueprint_catalog_arrays_invalid");

  const nodeIds = new Set();
  for (const node of value.nodes) {
    validateNode(node);
    if (nodeIds.has(node.id)) blueprintFail("blueprint_node_duplicate", node.id);
    nodeIds.add(node.id);
  }
  if (!exactStringSet([...nodeIds], [...EXPECTED_NODE_IDS])) blueprintFail("blueprint_node_set_invalid");
  for (const node of value.nodes) {
    if (!node.prerequisite_node_refs.every((ref) => nodeIds.has(ref) && ref !== node.id)) {
      blueprintFail("blueprint_node_prerequisite_invalid", node.id);
    }
  }
  validatePrerequisiteDag(value.nodes);

  const edgeIds = new Set();
  const edgeKeys = new Set();
  for (const edge of value.edges) {
    validateEdge(edge, nodeIds);
    if (edgeIds.has(edge.id)) blueprintFail("blueprint_edge_duplicate", edge.id);
    edgeIds.add(edge.id);
    const edgeKey = `${edge.from_ref.entity_id}>${edge.to_ref.entity_id}:${edge.relation_type}`;
    if (edgeKeys.has(edgeKey)) blueprintFail("blueprint_edge_duplicate", edgeKey);
    edgeKeys.add(edgeKey);
  }
  if (!exactStringSet([...edgeIds], [...EXPECTED_EDGE_IDS])) blueprintFail("blueprint_edge_set_invalid");

  const edgePairs = new Set(value.edges.map((edge) => `${edge.from_ref.entity_id}>${edge.to_ref.entity_id}`));
  for (const [from, to] of CONTEXT_LIFECYCLE_PAIRS) {
    if (!edgePairs.has(`${from}>${to}`)) blueprintFail("blueprint_context_lifecycle_incomplete", `${from}>${to}`);
  }
  for (const snapshotId of ["project_state_snapshot", "project_state_snapshot_next"]) {
    const snapshot = value.nodes.find((node) => node.id === snapshotId);
    if (!snapshot || !exactStringSet(snapshot.required_contract_fields, SNAPSHOT_REQUIRED_FIELDS)
      || !exactStringSet(snapshot.forbidden_contract_fields, ["as_of"])) {
      blueprintFail("blueprint_snapshot_contract_invalid", snapshotId);
    }
  }
  const writers = value.nodes.filter((node) => node.role === "writer");
  if (writers.length !== 1 || writers[0].id !== "p8_sole_erp_writer") blueprintFail("blueprint_sole_writer_invalid");

  const normalized = structuredClone(value);
  normalized.status_contract.implementation_view_values = [...SE_ENGINE_BLUEPRINT_IMPLEMENTATION_VIEWS];
  normalized.status_contract.lifecycle_values = [...SE_ENGINE_BLUEPRINT_LIFECYCLE_STATES];
  normalized.status_contract.claim_ceiling_values = [...SE_ENGINE_BLUEPRINT_CLAIM_CEILINGS];
  normalized.non_claims = [...REQUIRED_NON_CLAIMS];
  normalized.common_contract_table.sort((left, right) => CONTRACT_ORDER.get(left.contract_id) - CONTRACT_ORDER.get(right.contract_id));
  for (const row of normalized.common_contract_table) {
    const expected = EXPECTED_CONTRACT_BY_ID.get(row.contract_id);
    row.required_fields = [...expected.required_fields];
    row.rules = [...expected.rules];
    row.forbidden = [...expected.forbidden];
  }
  normalized.gate_sequence.sort((left, right) => left.order - right.order);
  for (const gate of normalized.gate_sequence) {
    const expected = EXPECTED_GATE_BY_ID.get(gate.gate_id);
    gate.requires = [...expected.requires];
    gate.unlocks = [...expected.unlocks];
  }
  normalized.nodes.sort((left, right) => NODE_ORDER.get(left.id) - NODE_ORDER.get(right.id));
  for (const node of normalized.nodes) {
    const expected = EXPECTED_NODE_BY_ID.get(node.id);
    node.authority_owner_refs = [...expected.authority_owner_refs];
    node.evidence_refs = [...expected.evidence_refs];
    node.required_contract_fields = [...expected.required_contract_fields];
    node.forbidden_contract_fields = [...expected.forbidden_contract_fields];
    node.prerequisite_node_refs = [...expected.prerequisite_node_refs];
  }
  normalized.edges.sort((left, right) => EDGE_ORDER.get(left.id) - EDGE_ORDER.get(right.id));
  for (const edge of normalized.edges) {
    const expected = EXPECTED_EDGE_BY_ID.get(edge.id);
    edge.source_refs = [...expected.source_refs];
    edge.proves = [...expected.proves];
    edge.does_not_prove = [...expected.does_not_prove];
    edge.gate_refs = [...expected.gate_refs];
  }
  return canonicalizeObjectKeys(normalized);
}

export function createSeEngineBlueprintCatalog() {
  return validateSeEngineBlueprintCatalog(structuredClone(SE_ENGINE_BLUEPRINT_CATALOG));
}
