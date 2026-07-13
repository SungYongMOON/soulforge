import { fail } from "./errors.mjs";
import { isCanonicalDate, isCanonicalDateTime } from "./temporal.mjs";

export const MAX_INPUT_REF_SIZE = 8 * 1024 * 1024;
export const MAX_TOTAL_INPUT_SIZE = 16 * 1024 * 1024;
export const MAX_ARTIFACT_SIZE = 16 * 1024 * 1024;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const OPAQUE_REF = /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{0,95}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const REQUEST_FIELDS = [
  "schema",
  "job_id",
  "idempotency_key",
  "workflow_id",
  "workflow_binding_revision",
  "mode",
  "project_code",
  "actor_ref",
  "input_refs",
  "report_type",
  "audience",
  "output_formats",
  "boundary_policy",
  "acceptance_profile",
];

const REPORT_TYPES = ["experiment", "analysis", "progress", "presentation", "other"];
const AUDIENCES = ["internal_review", "management", "customer", "regulator", "other"];
const INPUT_ROLES = ["source_material", "draft_report", "owner_contract", "semantic_manifest"];
const INPUT_MEDIA_TYPES = ["application/json", "text/markdown", "text/plain"];
const OUTPUT_ROLES = [
  "report_document_json",
  "final_report_md",
  "final_report_html",
  "protected_semantic_manifest",
  "preservation_audit",
  "semantic_verification",
];
const OUTPUT_MEDIA_TYPES = ["text/markdown", "text/html", "application/json"];
const CLAIM_CEILINGS = ["observed", "source_supported", "rejected_or_blocked"];
const SECTION_ROLES = [
  "executive_summary", "purpose", "conditions_method", "criteria_request_items", "results", "discussion_considerations", "conclusion_verdict", "next_actions", "references_traceability",
  "decision_question_scope", "method_assumptions", "criteria_weights", "alternatives_evidence", "analysis_discussion", "conclusion_recommendation", "decision_ask_next_actions",
  "status_summary", "scope_baseline", "milestones_actuals", "deliverables_evidence", "issues_risks_dependencies", "forecast", "decision_support_requests",
  "title_context", "bluf_and_ask", "minimum_background", "evidence", "recommendation_next",
  "scope_evidence_basis", "findings_current_state", "interpretation_limitations", "bounded_conclusion_decision_status", "boundary_note", "appendix", "other",
];
const REPORT_REQUIRED_ROLE_MATRIX = Object.freeze({
  experiment: ["purpose", "conditions_method", "results", "discussion_considerations", "conclusion_verdict", "next_actions"],
  analysis: ["decision_question_scope", "method_assumptions", "alternatives_evidence", "analysis_discussion", "conclusion_recommendation", "decision_ask_next_actions"],
  progress: ["status_summary", "scope_baseline", "milestones_actuals", "issues_risks_dependencies", "next_actions"],
  presentation: ["title_context", "bluf_and_ask", "evidence", "recommendation_next"],
  other: ["purpose", "scope_evidence_basis", "findings_current_state", "interpretation_limitations", "bounded_conclusion_decision_status", "next_actions"],
});
const COMPACT_INTERNAL_PROGRESS_ROLES = Object.freeze([
  "status_summary",
  "issues_risks_dependencies",
  "next_actions",
]);
const SUMMARY_ROLES = new Set(["executive_summary", "bluf_and_ask"]);
const PASS_CHECK_IDS = Object.freeze({
  technical_content: ["source_fidelity", "protected_fields", "citation_resolution", "conditions_scope", "authorized_changes"],
  evidence_logic: ["role_matrix", "evidence_logic", "claim_ceiling", "conclusion_support", "unconfirmed_handling"],
  derive_executive_summary: ["body_claim_paths", "no_summary_only_claim", "verdict_scope", "action_support"],
  final_polish: ["grammar_tone", "semantic_delta_none", "reader_projection", "technical_terms_preserved", "no_detector_or_word_blacklist"],
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, fields, path) {
  if (!isObject(value)) {
    fail("contract_type", `${path} must be an object`, { path });
  }
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail("contract_unknown_field", `Unknown field ${path}.${key}`, { path: `${path}.${key}` });
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      fail("contract_missing_field", `Missing field ${path}.${key}`, { path: `${path}.${key}` });
    }
  }
}

function exactObjectWithOptional(value, requiredFields, optionalFields, path) {
  if (!isObject(value)) fail("contract_type", `${path} must be an object`, { path });
  const allowed = new Set([...requiredFields, ...optionalFields]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("contract_unknown_field", `Unknown field ${path}.${key}`, { path: `${path}.${key}` });
  }
  for (const key of requiredFields) {
    if (!Object.hasOwn(value, key)) fail("contract_missing_field", `Missing field ${path}.${key}`, { path: `${path}.${key}` });
  }
}

function stringValue(value, path, { min = 1, max = 8192, pattern = null } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    fail("contract_string", `Invalid string at ${path}`, { path });
  }
  return value;
}

function nullableText(value, path) {
  if (value === null) return null;
  return stringValue(value, path);
}

function safeId(value, path) {
  return stringValue(value, path, { max: 96, pattern: SAFE_ID });
}

function opaqueRef(value, path) {
  return stringValue(value, path, { min: 3, max: 224, pattern: OPAQUE_REF });
}

function sha256(value, path) {
  return stringValue(value, path, { min: 64, max: 64, pattern: SHA256 });
}

function reasonCode(value, path) {
  return stringValue(value, path, { max: 96, pattern: REASON_CODE });
}

function enumValue(value, allowed, path) {
  if (!allowed.includes(value)) {
    fail("contract_enum", `Invalid value at ${path}`, { path, allowed, actual: value });
  }
  return value;
}

function boolValue(value, path) {
  if (typeof value !== "boolean") fail("contract_boolean", `${path} must be a boolean`, { path });
  return value;
}

function integerValue(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("contract_integer", `Invalid integer at ${path}`, { path, min, max });
  }
  return value;
}

function arrayValue(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail("contract_array", `Invalid array at ${path}`, { path, min, max });
  }
  return value;
}

function uniqueStrings(value, path, { min = 0, max = 64, validator = null } = {}) {
  arrayValue(value, path, { min, max });
  const seen = new Set();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (validator) validator(item, itemPath);
    else stringValue(item, itemPath);
    if (seen.has(item)) fail("contract_duplicate", `Duplicate value at ${itemPath}`, { path: itemPath });
    seen.add(item);
  });
}

function dateValue(value, path) {
  stringValue(value, path, { min: 10, max: 10, pattern: DATE });
  if (!isCanonicalDate(value)) {
    fail("contract_date", `Invalid date at ${path}`, { path });
  }
}

function nullableDate(value, path) {
  if (value === null) return null;
  dateValue(value, path);
  return value;
}

function dateTimeValue(value, path) {
  stringValue(value, path, { min: 20, max: 24, pattern: DATE_TIME });
  if (!isCanonicalDateTime(value)) fail("contract_datetime", `Invalid timestamp at ${path}`, { path });
}

function validateRefMetadata(ref, path, { input = false } = {}) {
  exactObject(ref, ["role", "payload_ref", "sha256", "size", "media_type"], path);
  if (input) enumValue(ref.role, INPUT_ROLES, `${path}.role`);
  else reasonCode(ref.role, `${path}.role`);
  opaqueRef(ref.payload_ref, `${path}.payload_ref`);
  sha256(ref.sha256, `${path}.sha256`);
  integerValue(ref.size, `${path}.size`, { min: 1, max: input ? MAX_INPUT_REF_SIZE : MAX_ARTIFACT_SIZE });
  enumValue(ref.media_type, input ? INPUT_MEDIA_TYPES : [...INPUT_MEDIA_TYPES, "text/html"], `${path}.media_type`);
}

export function validateWorkflowJobRequest(request) {
  exactObject(request, REQUEST_FIELDS, "$request");
  enumValue(request.schema, ["soulforge.workflow_job_request.v1"], "$request.schema");
  safeId(request.job_id, "$request.job_id");
  safeId(request.idempotency_key, "$request.idempotency_key");
  enumValue(request.workflow_id, ["report_authoring_v0"], "$request.workflow_id");
  enumValue(request.workflow_binding_revision, ["report_authoring_v0.binding.v1"], "$request.workflow_binding_revision");
  enumValue(request.mode, ["full_authoring", "final_polish"], "$request.mode");
  safeId(request.project_code, "$request.project_code");
  opaqueRef(request.actor_ref, "$request.actor_ref");
  enumValue(request.report_type, REPORT_TYPES, "$request.report_type");
  enumValue(request.audience, AUDIENCES, "$request.audience");
  enumValue(request.boundary_policy, ["soulforge.report.boundary.v1"], "$request.boundary_policy");
  enumValue(request.acceptance_profile, ["soulforge.report.semantic_preservation.v1"], "$request.acceptance_profile");

  arrayValue(request.input_refs, "$request.input_refs", { min: 1, max: 8 });
  const roles = new Set();
  const payloadRefs = new Set();
  let totalSize = 0;
  request.input_refs.forEach((ref, index) => {
    const path = `$request.input_refs[${index}]`;
    validateRefMetadata(ref, path, { input: true });
    if (roles.has(ref.role)) fail("request_duplicate_input_role", `Duplicate input role ${ref.role}`, { path });
    if (payloadRefs.has(ref.payload_ref)) fail("request_duplicate_payload_ref", `Duplicate payload ref ${ref.payload_ref}`, { path });
    roles.add(ref.role);
    payloadRefs.add(ref.payload_ref);
    totalSize += ref.size;
  });
  if (totalSize > MAX_TOTAL_INPUT_SIZE) {
    fail("request_total_input_size_exceeded", "Total declared input size exceeds the fixed limit", { totalSize, max: MAX_TOTAL_INPUT_SIZE });
  }
  if (request.mode === "full_authoring" && !roles.has("source_material")) {
    fail("request_missing_source_material", "full_authoring requires source_material");
  }
  if (request.mode === "final_polish" && !roles.has("draft_report")) {
    fail("request_missing_draft_report", "final_polish requires draft_report");
  }

  uniqueStrings(request.output_formats, "$request.output_formats", {
    min: 1,
    max: 2,
    validator: (value, path) => enumValue(value, ["md", "html"], path),
  });
  if (!request.output_formats.includes("md")) {
    fail("request_canonical_markdown_required", "Markdown is the mandatory canonical rendered report; HTML is optional");
  }
  return request;
}

const STATE_FIELDS = [
  "schema",
  "job_id",
  "request_sha256",
  "state_version",
  "status",
  "phase",
  "attempt",
  "created_at",
  "updated_at",
  "terminal_reason_code",
];

const PHASES = [
  "validate",
  "intake",
  "draft",
  "technical_content",
  "evidence_logic",
  "derive_executive_summary",
  "final_polish",
  "preservation",
  "semantic_verify",
  "document_validate",
  "render",
  "boundary",
  "receipt",
];

export function validateWorkflowJobState(state) {
  exactObject(state, STATE_FIELDS, "$state");
  enumValue(state.schema, ["soulforge.workflow_job_state.v1"], "$state.schema");
  safeId(state.job_id, "$state.job_id");
  sha256(state.request_sha256, "$state.request_sha256");
  integerValue(state.state_version, "$state.state_version");
  enumValue(state.status, ["queued", "running", "blocked", "succeeded", "failed", "cancelled", "interrupted"], "$state.status");
  enumValue(state.phase, PHASES, "$state.phase");
  integerValue(state.attempt, "$state.attempt");
  dateTimeValue(state.created_at, "$state.created_at");
  dateTimeValue(state.updated_at, "$state.updated_at");
  if (state.terminal_reason_code !== null) reasonCode(state.terminal_reason_code, "$state.terminal_reason_code");
  const terminal = ["blocked", "succeeded", "failed", "cancelled", "interrupted"].includes(state.status);
  if (terminal !== (state.terminal_reason_code !== null)) {
    fail("state_terminal_reason_mismatch", "Terminal state and terminal_reason_code must agree");
  }
  return state;
}

function validateArtifactRef(ref, path) {
  exactObject(ref, ["role", "payload_ref", "sha256", "size", "media_type"], path);
  enumValue(ref.role, OUTPUT_ROLES, `${path}.role`);
  opaqueRef(ref.payload_ref, `${path}.payload_ref`);
  sha256(ref.sha256, `${path}.sha256`);
  integerValue(ref.size, `${path}.size`, { min: 1, max: MAX_ARTIFACT_SIZE });
  enumValue(ref.media_type, OUTPUT_MEDIA_TYPES, `${path}.media_type`);
}

function validateCounts(counts, path) {
  exactObject(counts, ["baseline", "candidate", "matched", "missing", "changed", "unexpected"], path);
  for (const key of Object.keys(counts)) integerValue(counts[key], `${path}.${key}`);
}

export function validateWorkflowJobResult(result) {
  exactObject(result, ["schema", "job_id", "workflow_id", "binding_revision", "status", "artifact_refs", "preservation", "identity_assurance", "unconfirmed_codes", "claim_ceiling", "boundary"], "$result");
  enumValue(result.schema, ["soulforge.workflow_job_result.v1"], "$result.schema");
  safeId(result.job_id, "$result.job_id");
  enumValue(result.workflow_id, ["report_authoring_v0"], "$result.workflow_id");
  enumValue(result.binding_revision, ["report_authoring_v0.binding.v1"], "$result.binding_revision");
  enumValue(result.status, ["succeeded", "blocked", "failed"], "$result.status");
  arrayValue(result.artifact_refs, "$result.artifact_refs", { min: 5, max: 6 });
  const roles = new Set();
  result.artifact_refs.forEach((ref, index) => {
    validateArtifactRef(ref, `$result.artifact_refs[${index}]`);
    if (roles.has(ref.role)) fail("result_duplicate_artifact_role", `Duplicate artifact role ${ref.role}`);
    roles.add(ref.role);
  });
  for (const role of ["report_document_json", "final_report_md", "protected_semantic_manifest", "preservation_audit", "semantic_verification"]) {
    if (!roles.has(role)) fail("result_missing_audit_artifact", `Missing required audit artifact ${role}`);
  }

  exactObject(result.preservation, ["deterministic_status", "lexical_status", "lexical_scope", "lexical_inventory_sha256", "lexical_count", "semantic_status", "semantic_verdict_ref", "semantic_verifier_actor_ref", "semantic_verifier_run_ref", "inventory_sha256", "counts"], "$result.preservation");
  enumValue(result.preservation.deterministic_status, ["pass", "fail"], "$result.preservation.deterministic_status");
  enumValue(result.preservation.lexical_status, ["pass", "fail"], "$result.preservation.lexical_status");
  enumValue(result.preservation.lexical_scope, ["final_polish_input_draft", "full_authoring_technical_content_adopted_claims"], "$result.preservation.lexical_scope");
  sha256(result.preservation.lexical_inventory_sha256, "$result.preservation.lexical_inventory_sha256");
  integerValue(result.preservation.lexical_count, "$result.preservation.lexical_count");
  enumValue(result.preservation.semantic_status, ["pass", "fail"], "$result.preservation.semantic_status");
  opaqueRef(result.preservation.semantic_verdict_ref, "$result.preservation.semantic_verdict_ref");
  opaqueRef(result.preservation.semantic_verifier_actor_ref, "$result.preservation.semantic_verifier_actor_ref");
  opaqueRef(result.preservation.semantic_verifier_run_ref, "$result.preservation.semantic_verifier_run_ref");
  sha256(result.preservation.inventory_sha256, "$result.preservation.inventory_sha256");
  validateCounts(result.preservation.counts, "$result.preservation.counts");
  exactObject(result.identity_assurance, ["claim", "authority_ref", "authority_record_sha256", "deployment_attestation_ref"], "$result.identity_assurance");
  enumValue(result.identity_assurance.claim, ["local_context_separation_declared", "deployment_attested_process_separation"], "$result.identity_assurance.claim");
  opaqueRef(result.identity_assurance.authority_ref, "$result.identity_assurance.authority_ref");
  sha256(result.identity_assurance.authority_record_sha256, "$result.identity_assurance.authority_record_sha256");
  if (result.identity_assurance.deployment_attestation_ref !== null) opaqueRef(result.identity_assurance.deployment_attestation_ref, "$result.identity_assurance.deployment_attestation_ref");
  if ((result.identity_assurance.claim === "deployment_attested_process_separation") !== (result.identity_assurance.deployment_attestation_ref !== null)) {
    fail("result_identity_claim_mismatch", "Result identity claim and deployment attestation must agree");
  }
  uniqueStrings(result.unconfirmed_codes, "$result.unconfirmed_codes", { max: 64, validator: safeId });
  enumValue(result.claim_ceiling, CLAIM_CEILINGS, "$result.claim_ceiling");
  exactObject(result.boundary, ["content_classification", "raw_input_payload_copy_detected", "known_secret_pattern_scan_status", "runtime_absolute_path_detected", "source_owned_absolute_path_count", "forbidden_internal_scaffold_detected", "artifact_storage_class", "receipt_metadata_only"], "$result.boundary");
  enumValue(result.boundary.content_classification, ["public_safe", "private_work_product"], "$result.boundary.content_classification");
  boolValue(result.boundary.raw_input_payload_copy_detected, "$result.boundary.raw_input_payload_copy_detected");
  enumValue(result.boundary.known_secret_pattern_scan_status, ["pass", "detected"], "$result.boundary.known_secret_pattern_scan_status");
  boolValue(result.boundary.runtime_absolute_path_detected, "$result.boundary.runtime_absolute_path_detected");
  integerValue(result.boundary.source_owned_absolute_path_count, "$result.boundary.source_owned_absolute_path_count");
  boolValue(result.boundary.forbidden_internal_scaffold_detected, "$result.boundary.forbidden_internal_scaffold_detected");
  enumValue(result.boundary.artifact_storage_class, ["workspace_system", "owner_approved_shared_worksite"], "$result.boundary.artifact_storage_class");
  boolValue(result.boundary.receipt_metadata_only, "$result.boundary.receipt_metadata_only");
  if (result.status === "succeeded") {
    if (result.preservation.deterministic_status !== "pass" || result.preservation.lexical_status !== "pass" || result.preservation.semantic_status !== "pass") {
      fail("result_success_without_verification", "Succeeded result requires deterministic, lexical, and semantic preservation passes");
    }
    if (result.boundary.raw_input_payload_copy_detected || result.boundary.known_secret_pattern_scan_status !== "pass" || result.boundary.runtime_absolute_path_detected || result.boundary.forbidden_internal_scaffold_detected || result.boundary.receipt_metadata_only !== true) {
      fail("result_success_boundary_violation", "Succeeded result cannot carry a boundary violation");
    }
  }
  return result;
}

function validateAnchor(anchor, path) {
  exactObject(anchor, ["section_id", "block_id", "row_id", "column_id"], path);
  safeId(anchor.section_id, `${path}.section_id`);
  safeId(anchor.block_id, `${path}.block_id`);
  if (anchor.row_id !== null) safeId(anchor.row_id, `${path}.row_id`);
  if (anchor.column_id !== null) safeId(anchor.column_id, `${path}.column_id`);
  if ((anchor.row_id === null) !== (anchor.column_id === null)) {
    fail("manifest_partial_table_anchor", `row_id and column_id must both be null or both be set at ${path}`);
  }
}

function validateRange(range, path) {
  exactObject(range, ["min", "max", "min_inclusive", "max_inclusive"], path);
  nullableText(range.min, `${path}.min`);
  nullableText(range.max, `${path}.max`);
  boolValue(range.min_inclusive, `${path}.min_inclusive`);
  boolValue(range.max_inclusive, `${path}.max_inclusive`);
  if (range.min === null && range.max === null) fail("manifest_empty_range", `Range must have a bound at ${path}`);
}

function validateUncertainty(uncertainty, path) {
  exactObject(uncertainty, ["value", "unit", "coverage_factor", "confidence"], path);
  stringValue(uncertainty.value, `${path}.value`);
  stringValue(uncertainty.unit, `${path}.unit`);
  nullableText(uncertainty.coverage_factor, `${path}.coverage_factor`);
  nullableText(uncertainty.confidence, `${path}.confidence`);
}

function validateAttribution(attribution, path) {
  exactObject(attribution, ["actor_ref", "role", "assurance_status"], path);
  opaqueRef(attribution.actor_ref, `${path}.actor_ref`);
  stringValue(attribution.role, `${path}.role`);
  enumValue(attribution.assurance_status, ["reported", "observed", "verified", "not_verified", "unconfirmed"], `${path}.assurance_status`);
}

const INVARIANT_FIELDS = [
  "invariant_id",
  "kind",
  "association_key",
  "occurrence",
  "anchor",
  "surface_form",
  "subject",
  "predicate",
  "object",
  "value",
  "unit",
  "comparator",
  "range",
  "uncertainty",
  "polarity",
  "direction",
  "modality",
  "attribution",
  "conditions",
  "scope",
  "causality",
  "verdict",
  "evidence_refs",
];
const OPTIONAL_INVARIANT_FIELDS = [
  "time_context",
  "location",
  "candidate_entity",
  "comparator_entity",
  "metric",
  "outcome",
  "coreference_target",
  "citation_bindings",
  "visual_bindings",
];

function validateInvariant(invariant, path) {
  exactObjectWithOptional(invariant, INVARIANT_FIELDS, OPTIONAL_INVARIANT_FIELDS, path);
  safeId(invariant.invariant_id, `${path}.invariant_id`);
  enumValue(invariant.kind, ["number", "date", "identifier", "citation", "table_cell", "negation", "comparison", "modality", "attribution", "condition_scope", "causality", "verdict", "unconfirmed"], `${path}.kind`);
  safeId(invariant.association_key, `${path}.association_key`);
  integerValue(invariant.occurrence, `${path}.occurrence`, { min: 1, max: 4096 });
  validateAnchor(invariant.anchor, `${path}.anchor`);
  stringValue(invariant.surface_form, `${path}.surface_form`);
  for (const field of ["subject", "predicate", "object", "value", "unit"]) nullableText(invariant[field], `${path}.${field}`);
  enumValue(invariant.comparator, ["lt", "lte", "eq", "gte", "gt", "range", "approx", "none"], `${path}.comparator`);
  if (invariant.range !== null) validateRange(invariant.range, `${path}.range`);
  if (invariant.uncertainty !== null) validateUncertainty(invariant.uncertainty, `${path}.uncertainty`);
  enumValue(invariant.polarity, ["positive", "negative", "not_applicable"], `${path}.polarity`);
  enumValue(invariant.direction, ["higher", "lower", "increase", "decrease", "equal", "no_difference", "not_applicable"], `${path}.direction`);
  enumValue(invariant.modality, ["shall", "should", "may", "observed", "unknown", "not_applicable"], `${path}.modality`);
  if (invariant.attribution !== null) validateAttribution(invariant.attribution, `${path}.attribution`);
  uniqueStrings(invariant.conditions, `${path}.conditions`, { max: 64 });
  uniqueStrings(invariant.scope, `${path}.scope`, { max: 64 });
  enumValue(invariant.causality, ["caused", "associated", "temporal_only", "not_established", "not_applicable"], `${path}.causality`);
  enumValue(invariant.verdict, ["pass", "conditional_pass", "fail", "unconfirmed", "not_applicable"], `${path}.verdict`);
  uniqueStrings(invariant.evidence_refs, `${path}.evidence_refs`, { max: 64, validator: opaqueRef });
  for (const field of ["time_context", "location", "candidate_entity", "comparator_entity", "metric", "outcome", "coreference_target"]) {
    if (Object.hasOwn(invariant, field)) nullableText(invariant[field], `${path}.${field}`);
  }
  if (Object.hasOwn(invariant, "citation_bindings")) uniqueStrings(invariant.citation_bindings, `${path}.citation_bindings`, { max: 64, validator: safeId });
  if (Object.hasOwn(invariant, "visual_bindings")) uniqueStrings(invariant.visual_bindings, `${path}.visual_bindings`, { max: 64, validator: safeId });
  if (invariant.kind === "citation" && (!Object.hasOwn(invariant, "citation_bindings") || invariant.citation_bindings.length < 1 || !invariant.citation_bindings.includes(invariant.object))) {
    fail("manifest_citation_binding_missing", `Citation invariant requires an explicit reference-entry binding at ${path}`);
  }
  if (invariant.kind === "table_cell" && invariant.anchor.row_id === null) {
    fail("manifest_table_cell_anchor_missing", `table_cell requires row and column anchors at ${path}`);
  }
}

export function validateSemanticManifest(manifest, path = "$manifest") {
  exactObject(manifest, ["schema", "source_document_ref", "invariants"], path);
  enumValue(manifest.schema, ["soulforge.protected_semantic_manifest.v1"], `${path}.schema`);
  opaqueRef(manifest.source_document_ref, `${path}.source_document_ref`);
  arrayValue(manifest.invariants, `${path}.invariants`, { min: 1, max: 4096 });
  const ids = new Set();
  const associations = new Set();
  manifest.invariants.forEach((invariant, index) => {
    const invariantPath = `${path}.invariants[${index}]`;
    validateInvariant(invariant, invariantPath);
    if (ids.has(invariant.invariant_id)) fail("manifest_duplicate_invariant_id", `Duplicate invariant id ${invariant.invariant_id}`);
    ids.add(invariant.invariant_id);
    const association = `${invariant.kind}\u0000${invariant.association_key}\u0000${invariant.occurrence}`;
    if (associations.has(association)) fail("manifest_duplicate_association", `Duplicate invariant association ${invariant.association_key}`);
    associations.add(association);
  });
  return manifest;
}

function validateParagraph(block, path) {
  exactObjectWithOptional(block, ["block_id", "type", "text", "claim_refs", "source_refs"], ["sentences", "citation_refs"], path);
  safeId(block.block_id, `${path}.block_id`);
  enumValue(block.type, ["paragraph"], `${path}.type`);
  stringValue(block.text, `${path}.text`);
  uniqueStrings(block.claim_refs, `${path}.claim_refs`, { max: 4096, validator: safeId });
  uniqueStrings(block.source_refs, `${path}.source_refs`, { max: 64, validator: opaqueRef });
  if (Object.hasOwn(block, "citation_refs")) uniqueStrings(block.citation_refs, `${path}.citation_refs`, { max: 64, validator: safeId });
  if (Object.hasOwn(block, "sentences")) {
    arrayValue(block.sentences, `${path}.sentences`, { min: 1, max: 256 });
    const sentenceIds = new Set();
    const sentenceClaims = [];
    const sentenceSources = [];
    const sentenceCitations = [];
    block.sentences.forEach((sentence, index) => {
      const sentencePath = `${path}.sentences[${index}]`;
      exactObject(sentence, ["sentence_id", "text", "claim_refs", "source_refs", "citation_refs"], sentencePath);
      safeId(sentence.sentence_id, `${sentencePath}.sentence_id`);
      if (sentenceIds.has(sentence.sentence_id)) fail("document_duplicate_sentence_id", `Duplicate sentence ${sentence.sentence_id}`);
      sentenceIds.add(sentence.sentence_id);
      stringValue(sentence.text, `${sentencePath}.text`);
      uniqueStrings(sentence.claim_refs, `${sentencePath}.claim_refs`, { max: 4096, validator: safeId });
      uniqueStrings(sentence.source_refs, `${sentencePath}.source_refs`, { max: 64, validator: opaqueRef });
      uniqueStrings(sentence.citation_refs, `${sentencePath}.citation_refs`, { max: 64, validator: safeId });
      sentenceClaims.push(...sentence.claim_refs);
      sentenceSources.push(...sentence.source_refs);
      sentenceCitations.push(...sentence.citation_refs);
    });
    const joinedText = block.sentences.map((sentence) => sentence.text).join(" ").replace(/\s+/gu, " ").trim();
    if (joinedText !== block.text.replace(/\s+/gu, " ").trim()) fail("document_sentence_text_mismatch", `Sentence text does not reconstruct paragraph ${block.block_id}`);
    if (canonicalClaimRefs([...new Set(sentenceClaims)].sort()) !== canonicalClaimRefs([...block.claim_refs].sort())) fail("document_sentence_claim_union_mismatch", `Sentence claim refs do not reconstruct paragraph ${block.block_id}`);
    if (canonicalClaimRefs([...new Set(sentenceSources)].sort()) !== canonicalClaimRefs([...block.source_refs].sort())) fail("document_sentence_source_union_mismatch", `Sentence source refs do not reconstruct paragraph ${block.block_id}`);
    const blockCitationRefs = Object.hasOwn(block, "citation_refs") ? block.citation_refs : [];
    if (canonicalClaimRefs([...new Set(sentenceCitations)].sort()) !== canonicalClaimRefs([...blockCitationRefs].sort())) fail("document_sentence_citation_union_mismatch", `Sentence citation refs do not reconstruct paragraph ${block.block_id}`);
  }
}

function validateBullets(block, path) {
  exactObject(block, ["block_id", "type", "items"], path);
  safeId(block.block_id, `${path}.block_id`);
  enumValue(block.type, ["bullets"], `${path}.type`);
  arrayValue(block.items, `${path}.items`, { min: 1, max: 128 });
  const itemIds = new Set();
  block.items.forEach((item, index) => {
    const itemPath = `${path}.items[${index}]`;
    exactObjectWithOptional(item, ["item_id", "text", "claim_refs", "source_refs"], ["citation_refs"], itemPath);
    safeId(item.item_id, `${itemPath}.item_id`);
    if (itemIds.has(item.item_id)) fail("document_duplicate_bullet_item_id", `Duplicate bullet item ${item.item_id}`);
    itemIds.add(item.item_id);
    stringValue(item.text, `${itemPath}.text`);
    uniqueStrings(item.claim_refs, `${itemPath}.claim_refs`, { max: 4096, validator: safeId });
    uniqueStrings(item.source_refs, `${itemPath}.source_refs`, { max: 64, validator: opaqueRef });
    if (Object.hasOwn(item, "citation_refs")) uniqueStrings(item.citation_refs, `${itemPath}.citation_refs`, { max: 64, validator: safeId });
  });
}

function validateTable(block, path) {
  exactObjectWithOptional(block, ["block_id", "type", "caption", "columns", "rows", "source_refs"], ["citation_refs"], path);
  safeId(block.block_id, `${path}.block_id`);
  enumValue(block.type, ["table"], `${path}.type`);
  stringValue(block.caption, `${path}.caption`);
  arrayValue(block.columns, `${path}.columns`, { min: 1, max: 32 });
  const columnIds = new Set();
  block.columns.forEach((column, index) => {
    const columnPath = `${path}.columns[${index}]`;
    exactObject(column, ["column_id", "heading", "unit"], columnPath);
    safeId(column.column_id, `${columnPath}.column_id`);
    stringValue(column.heading, `${columnPath}.heading`);
    nullableText(column.unit, `${columnPath}.unit`);
    if (columnIds.has(column.column_id)) fail("document_duplicate_column_id", `Duplicate column ${column.column_id}`);
    columnIds.add(column.column_id);
  });
  arrayValue(block.rows, `${path}.rows`, { min: 1, max: 512 });
  const rowIds = new Set();
  block.rows.forEach((row, rowIndex) => {
    const rowPath = `${path}.rows[${rowIndex}]`;
    exactObject(row, ["row_id", "label", "cells"], rowPath);
    safeId(row.row_id, `${rowPath}.row_id`);
    stringValue(row.label, `${rowPath}.label`);
    if (rowIds.has(row.row_id)) fail("document_duplicate_row_id", `Duplicate row ${row.row_id}`);
    rowIds.add(row.row_id);
    arrayValue(row.cells, `${rowPath}.cells`, { min: columnIds.size, max: columnIds.size });
    const cellColumns = new Set();
    row.cells.forEach((cell, cellIndex) => {
      const cellPath = `${rowPath}.cells[${cellIndex}]`;
      exactObject(cell, ["column_id", "text"], cellPath);
      safeId(cell.column_id, `${cellPath}.column_id`);
      stringValue(cell.text, `${cellPath}.text`);
      if (!columnIds.has(cell.column_id)) fail("document_unknown_cell_column", `Unknown cell column ${cell.column_id}`);
      if (cellColumns.has(cell.column_id)) fail("document_duplicate_cell_column", `Duplicate cell column ${cell.column_id}`);
      cellColumns.add(cell.column_id);
    });
  });
  uniqueStrings(block.source_refs, `${path}.source_refs`, { max: 64, validator: opaqueRef });
  if (Object.hasOwn(block, "citation_refs")) uniqueStrings(block.citation_refs, `${path}.citation_refs`, { max: 64, validator: safeId });
}

export function validateReportDocument(document) {
  exactObject(document, ["schema", "report_id", "project_code", "title", "report_date", "report_type", "audience", "claim_ceiling", "source_record_status", "sections", "references", "semantic_manifest", "unconfirmed_items", "boundary"], "$document");
  enumValue(document.schema, ["soulforge.report_document.v1"], "$document.schema");
  safeId(document.report_id, "$document.report_id");
  safeId(document.project_code, "$document.project_code");
  stringValue(document.title, "$document.title");
  nullableDate(document.report_date, "$document.report_date");
  enumValue(document.report_type, REPORT_TYPES, "$document.report_type");
  enumValue(document.audience, AUDIENCES, "$document.audience");
  enumValue(document.claim_ceiling, CLAIM_CEILINGS, "$document.claim_ceiling");
  enumValue(document.source_record_status, ["complete", "partial", "unconfirmed"], "$document.source_record_status");
  arrayValue(document.references, "$document.references", { max: 256 });
  const referenceIds = new Set();
  const referencesById = new Map();
  document.references.forEach((reference, index) => {
    const referencePath = `$document.references[${index}]`;
    exactObject(reference, ["reference_id", "label", "source_ref"], referencePath);
    safeId(reference.reference_id, `${referencePath}.reference_id`);
    if (referenceIds.has(reference.reference_id)) fail("document_duplicate_reference_id", `Duplicate reference ${reference.reference_id}`);
    referenceIds.add(reference.reference_id);
    referencesById.set(reference.reference_id, reference);
    stringValue(reference.label, `${referencePath}.label`);
    opaqueRef(reference.source_ref, `${referencePath}.source_ref`);
  });
  arrayValue(document.sections, "$document.sections", { min: 1, max: 64 });
  const sectionIds = new Set();
  const blockIds = new Set();
  const sectionClaimRefs = new Map();
  const explicitBlockClaimRefs = new Map();
  const citationUses = [];
  document.sections.forEach((section, sectionIndex) => {
    const sectionPath = `$document.sections[${sectionIndex}]`;
    exactObject(section, ["section_id", "heading", "role", "claim_refs", "blocks"], sectionPath);
    safeId(section.section_id, `${sectionPath}.section_id`);
    stringValue(section.heading, `${sectionPath}.heading`);
    enumValue(section.role, SECTION_ROLES, `${sectionPath}.role`);
    if (sectionIds.has(section.section_id)) fail("document_duplicate_section_id", `Duplicate section ${section.section_id}`);
    sectionIds.add(section.section_id);
    uniqueStrings(section.claim_refs, `${sectionPath}.claim_refs`, { max: 4096, validator: safeId });
    sectionClaimRefs.set(section.section_id, section.claim_refs);
    const blockClaims = [];
    arrayValue(section.blocks, `${sectionPath}.blocks`, { min: 1, max: 128 });
    section.blocks.forEach((block, blockIndex) => {
      const blockPath = `${sectionPath}.blocks[${blockIndex}]`;
      if (!isObject(block)) fail("contract_type", `${blockPath} must be an object`);
      enumValue(block.type, ["paragraph", "bullets", "table"], `${blockPath}.type`);
      if (block.type === "paragraph") validateParagraph(block, blockPath);
      else if (block.type === "bullets") validateBullets(block, blockPath);
      else validateTable(block, blockPath);
      if (block.type === "paragraph") blockClaims.push(...block.claim_refs);
      else if (block.type === "bullets") blockClaims.push(...block.items.flatMap((item) => item.claim_refs));
      if (block.type === "paragraph") citationUses.push({ claim_refs: block.claim_refs, citation_refs: block.citation_refs ?? [] });
      else if (block.type === "bullets") citationUses.push(...block.items.map((item) => ({ claim_refs: item.claim_refs, citation_refs: item.citation_refs ?? [] })));
      else citationUses.push({ claim_refs: [], citation_refs: block.citation_refs ?? [] });
      if (blockIds.has(block.block_id)) fail("document_duplicate_block_id", `Duplicate block ${block.block_id}`);
      blockIds.add(block.block_id);
    });
    explicitBlockClaimRefs.set(section.section_id, blockClaims);
  });
  const requiredRoles = document.report_type === "progress" && document.audience === "internal_review"
    ? [...COMPACT_INTERNAL_PROGRESS_ROLES]
    : [...REPORT_REQUIRED_ROLE_MATRIX[document.report_type]];
  if (["management", "customer", "regulator"].includes(document.audience) && ["experiment", "analysis", "other"].includes(document.report_type)) requiredRoles.unshift("executive_summary");
  else if (document.report_type === "other" && document.sections.length > 6) requiredRoles.unshift("executive_summary");
  let previousIndex = -1;
  for (const role of requiredRoles) {
    const roleIndex = document.sections.findIndex((section, index) => index > previousIndex && section.role === role);
    if (roleIndex < 0) fail("document_required_section_missing", `Report type ${document.report_type} requires ordered section role ${role}`);
    previousIndex = roleIndex;
  }
  const roleCounts = new Map();
  for (const section of document.sections) roleCounts.set(section.role, (roleCounts.get(section.role) ?? 0) + 1);
  for (const [role, count] of roleCounts) {
    if (count > 1 && !new Set(["evidence", "appendix", "other"]).has(role)) fail("document_section_role_cardinality", `Section role ${role} may appear only once`);
  }
  validateSemanticManifest(document.semantic_manifest, "$document.semantic_manifest");
  if (document.report_date === null && document.semantic_manifest.invariants.some((invariant) => invariant.anchor.section_id === "document" && invariant.anchor.block_id === "report_date")) {
    fail("document_null_report_date_manifest_conflict", "A null report_date cannot retain a protected report-date invariant");
  }
  const invariantIds = new Set(document.semantic_manifest.invariants.map((invariant) => invariant.invariant_id));
  const citationInvariantByReference = new Map();
  for (const invariant of document.semantic_manifest.invariants.filter((item) => item.kind === "citation")) {
    for (const referenceId of invariant.citation_bindings) {
      if (citationInvariantByReference.has(referenceId)) {
        fail("document_reference_multiple_citation_bindings", `Reference entry has more than one citation invariant: ${referenceId}`);
      }
      citationInvariantByReference.set(referenceId, invariant);
    }
  }
  const usedReferences = new Set();
  for (const use of citationUses) {
    for (const referenceId of use.citation_refs) {
      if (!referenceIds.has(referenceId)) fail("document_citation_ref_unresolved", `Citation ref is not in the reference registry: ${referenceId}`);
      const citationInvariant = citationInvariantByReference.get(referenceId);
      if (!citationInvariant || !use.claim_refs.includes(citationInvariant.invariant_id)) fail("document_citation_claim_binding_missing", `Citation ${referenceId} is not bound to its citation invariant on the same assertion`);
      usedReferences.add(referenceId);
    }
  }
  for (const [referenceId, citationInvariant] of citationInvariantByReference) {
    if (!referenceIds.has(referenceId)) fail("document_citation_registry_missing", `Citation invariant does not resolve to a reference entry: ${referenceId}`);
    const reference = referencesById.get(referenceId);
    if (citationInvariant.object !== referenceId) fail("document_citation_object_binding_mismatch", `Citation invariant object does not resolve to its reference entry: ${referenceId}`);
    if (!citationInvariant.evidence_refs.includes(reference.source_ref)) fail("document_citation_source_binding_mismatch", `Reference source_ref is not protected by the citation invariant: ${referenceId}`);
    if (!reference.label.includes(citationInvariant.surface_form)) fail("document_citation_label_binding_mismatch", `Reference label does not expose the protected citation surface: ${referenceId}`);
    if (!usedReferences.has(referenceId)) fail("document_citation_not_used", `Reference entry is not cited by a claim-bearing assertion: ${referenceId}`);
  }
  for (const referenceId of referenceIds) if (!usedReferences.has(referenceId)) fail("document_reference_not_used", `Reference entry is not used: ${referenceId}`);
  const tableClaimRefs = new Map();
  for (const invariant of document.semantic_manifest.invariants) {
    if (invariant.anchor.row_id === null) continue;
    const refs = tableClaimRefs.get(invariant.anchor.section_id) ?? [];
    refs.push(invariant.invariant_id);
    tableClaimRefs.set(invariant.anchor.section_id, refs);
  }
  const bodyClaimRefs = new Set();
  for (const section of document.sections) {
    const expectedSectionRefs = [...new Set([...(explicitBlockClaimRefs.get(section.section_id) ?? []), ...(tableClaimRefs.get(section.section_id) ?? [])])].sort();
    const actualSectionRefs = [...sectionClaimRefs.get(section.section_id)].sort();
    if (canonicalClaimRefs(actualSectionRefs) !== canonicalClaimRefs(expectedSectionRefs)) {
      fail("document_section_claim_union_mismatch", `Section claim_refs must equal the union of paragraph, bullet-item, and anchored table claims: ${section.section_id}`);
    }
    for (const claimRef of actualSectionRefs) {
      if (!invariantIds.has(claimRef)) fail("document_claim_ref_unresolved", `Section claim ref is not in the semantic manifest: ${claimRef}`);
      if (!SUMMARY_ROLES.has(section.role)) bodyClaimRefs.add(claimRef);
    }
  }
  for (const section of document.sections.filter((item) => SUMMARY_ROLES.has(item.role))) {
    if (section.claim_refs.length < 1) fail("document_summary_claim_refs_missing", `Summary role ${section.role} must bind to verified body claims`);
    for (const claimRef of section.claim_refs) if (!bodyClaimRefs.has(claimRef)) fail("document_summary_only_claim", `Summary claim ${claimRef} has no body claim path`);
    for (const block of section.blocks) {
      if (block.type === "paragraph") {
        if (!Object.hasOwn(block, "sentences")) fail("document_summary_sentences_missing", `Summary paragraph ${block.block_id} must expose sentence assertions`);
        for (const sentence of block.sentences ?? []) {
          if (sentence.claim_refs.length < 1) fail("document_summary_sentence_claim_refs_missing", `Summary sentence ${sentence.sentence_id} lacks a body claim path`);
          for (const claimRef of sentence.claim_refs) if (!bodyClaimRefs.has(claimRef)) fail("document_summary_only_claim", `Summary sentence claim ${claimRef} has no body claim path`);
        }
      }
      if (block.type === "bullets") {
        for (const item of block.items) if (item.claim_refs.length < 1) fail("document_summary_sentence_claim_refs_missing", `Summary bullet ${item.item_id} lacks a body claim path`);
      }
    }
  }
  arrayValue(document.unconfirmed_items, "$document.unconfirmed_items", { max: 64 });
  const unconfirmedIds = new Set();
  document.unconfirmed_items.forEach((item, index) => {
    const itemPath = `$document.unconfirmed_items[${index}]`;
    exactObject(item, ["item_id", "statement", "impact", "close_condition", "owner_ref", "due_or_trigger"], itemPath);
    safeId(item.item_id, `${itemPath}.item_id`);
    if (unconfirmedIds.has(item.item_id)) fail("document_unconfirmed_item_duplicate", `Duplicate unconfirmed item ${item.item_id}`);
    unconfirmedIds.add(item.item_id);
    stringValue(item.statement, `${itemPath}.statement`);
    stringValue(item.impact, `${itemPath}.impact`);
    stringValue(item.close_condition, `${itemPath}.close_condition`);
    if (item.owner_ref !== null) opaqueRef(item.owner_ref, `${itemPath}.owner_ref`);
    nullableText(item.due_or_trigger, `${itemPath}.due_or_trigger`);
  });
  for (const invariant of document.semantic_manifest.invariants.filter((item) => item.kind === "unconfirmed")) {
    if (!unconfirmedIds.has(invariant.invariant_id)) {
      fail(
        "document_unconfirmed_register_missing",
        `Protected unconfirmed claim requires a same-ID register item with impact and close condition: ${invariant.invariant_id}`,
      );
    }
  }
  exactObject(document.boundary, ["content_classification", "owner_contract_ref"], "$document.boundary");
  enumValue(document.boundary.content_classification, ["public_safe", "private_work_product"], "$document.boundary.content_classification");
  if (document.boundary.owner_contract_ref !== null) opaqueRef(document.boundary.owner_contract_ref, "$document.boundary.owner_contract_ref");
  return document;
}

function canonicalClaimRefs(values) {
  return values.join("\u0000");
}

export function validateSemanticVerifierResult(verdict) {
  exactObject(verdict, ["schema", "status", "actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "checked_inputs", "candidate_document_sha256", "baseline_manifest_sha256", "reason_codes", "unresolved_differences", "completed_at"], "$verdict");
  enumValue(verdict.schema, ["soulforge.semantic_verifier_result.v1"], "$verdict.schema");
  enumValue(verdict.status, ["pass", "fail"], "$verdict.status");
  opaqueRef(verdict.actor_ref, "$verdict.actor_ref");
  opaqueRef(verdict.run_ref, "$verdict.run_ref");
  opaqueRef(verdict.context_ref, "$verdict.context_ref");
  opaqueRef(verdict.identity_attestation_ref, "$verdict.identity_attestation_ref");
  arrayValue(verdict.checked_inputs, "$verdict.checked_inputs", { min: 1, max: 64 });
  const checkedKeys = new Set();
  verdict.checked_inputs.forEach((item, index) => {
    const path = `$verdict.checked_inputs[${index}]`;
    exactObject(item, ["role", "payload_ref", "sha256"], path);
    enumValue(item.role, INPUT_ROLES, `${path}.role`);
    opaqueRef(item.payload_ref, `${path}.payload_ref`);
    sha256(item.sha256, `${path}.sha256`);
    const key = `${item.role}\u0000${item.payload_ref}`;
    if (checkedKeys.has(key)) fail("verifier_duplicate_checked_input", `Duplicate checked input at ${path}`);
    checkedKeys.add(key);
  });
  sha256(verdict.candidate_document_sha256, "$verdict.candidate_document_sha256");
  sha256(verdict.baseline_manifest_sha256, "$verdict.baseline_manifest_sha256");
  uniqueStrings(verdict.reason_codes, "$verdict.reason_codes", { max: 64, validator: reasonCode });
  arrayValue(verdict.unresolved_differences, "$verdict.unresolved_differences", { max: 128 });
  verdict.unresolved_differences.forEach((item, index) => stringValue(item, `$verdict.unresolved_differences[${index}]`, { max: 512 }));
  dateTimeValue(verdict.completed_at, "$verdict.completed_at");
  if (verdict.status === "pass" && verdict.unresolved_differences.length > 0) {
    fail("verifier_pass_with_unresolved_difference", "Passing verifier result cannot contain unresolved differences");
  }
  return verdict;
}

function validateIdentityPassReceipt(receipt, path, expectedRole, expectedSequence) {
  exactObject(receipt, [
    "role",
    "sequence",
    "actor_ref",
    "run_ref",
    "context_ref",
    "identity_attestation_ref",
    "pass_process_ref",
    "request_sha256",
    "workflow_bundle_sha256",
    "candidate_document_sha256",
    "result_sha256",
    "completed_at",
  ], path);
  enumValue(receipt.role, [expectedRole], `${path}.role`);
  integerValue(receipt.sequence, `${path}.sequence`, { min: expectedSequence, max: expectedSequence });
  for (const field of ["actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "pass_process_ref"]) {
    opaqueRef(receipt[field], `${path}.${field}`);
  }
  for (const field of ["request_sha256", "workflow_bundle_sha256", "candidate_document_sha256", "result_sha256"]) {
    sha256(receipt[field], `${path}.${field}`);
  }
  dateTimeValue(receipt.completed_at, `${path}.completed_at`);
}

export function validateIdentityAuthorityRecord(record) {
  exactObject(record, [
    "schema",
    "record_id",
    "status",
    "identity_claim",
    "request_sha256",
    "workflow_bundle_sha256",
    "candidate_document_sha256",
    "author_pass_receipt",
    "verifier_pass_receipt",
    "authority",
  ], "$identity_authority_record");
  enumValue(record.schema, ["soulforge.workflow_identity_authority_record.v1"], "$identity_authority_record.schema");
  safeId(record.record_id, "$identity_authority_record.record_id");
  enumValue(record.status, ["pass"], "$identity_authority_record.status");
  enumValue(record.identity_claim, ["local_context_separation_declared", "deployment_attested_process_separation"], "$identity_authority_record.identity_claim");
  for (const field of ["request_sha256", "workflow_bundle_sha256", "candidate_document_sha256"]) {
    sha256(record[field], `$identity_authority_record.${field}`);
  }
  validateIdentityPassReceipt(record.author_pass_receipt, "$identity_authority_record.author_pass_receipt", "final_rewriter", 1);
  validateIdentityPassReceipt(record.verifier_pass_receipt, "$identity_authority_record.verifier_pass_receipt", "semantic_verifier", 2);
  for (const receipt of [record.author_pass_receipt, record.verifier_pass_receipt]) {
    if (receipt.request_sha256 !== record.request_sha256
      || receipt.workflow_bundle_sha256 !== record.workflow_bundle_sha256
      || receipt.candidate_document_sha256 !== record.candidate_document_sha256) {
      fail("identity_authority_binding_mismatch", "Identity pass receipt is not bound to the authority record request, bundle, and candidate");
    }
  }
  for (const field of ["actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "pass_process_ref"]) {
    if (record.author_pass_receipt[field] === record.verifier_pass_receipt[field]) {
      fail("identity_authority_separation_failed", `Author and verifier share ${field}`);
    }
  }
  if (Date.parse(record.author_pass_receipt.completed_at) >= Date.parse(record.verifier_pass_receipt.completed_at)) {
    fail("identity_authority_order_invalid", "Verifier pass must complete after the author pass");
  }
  exactObject(record.authority, [
    "authority_ref",
    "actor_ref",
    "run_ref",
    "context_ref",
    "identity_attestation_ref",
    "process_ref",
    "recorded_at",
    "deployment_attestation_ref",
  ], "$identity_authority_record.authority");
  for (const field of ["authority_ref", "actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "process_ref"]) {
    opaqueRef(record.authority[field], `$identity_authority_record.authority.${field}`);
  }
  dateTimeValue(record.authority.recorded_at, "$identity_authority_record.authority.recorded_at");
  if (record.authority.deployment_attestation_ref !== null) {
    opaqueRef(record.authority.deployment_attestation_ref, "$identity_authority_record.authority.deployment_attestation_ref");
  }
  if (record.identity_claim === "deployment_attested_process_separation" && record.authority.deployment_attestation_ref === null) {
    fail("identity_authority_deployment_attestation_missing", "Deployment-attested identity requires an external deployment attestation");
  }
  if (record.identity_claim === "local_context_separation_declared" && record.authority.deployment_attestation_ref !== null) {
    fail("identity_authority_claim_understated", "A deployment attestation must use the deployment-attested claim");
  }
  if (Date.parse(record.authority.recorded_at) < Date.parse(record.verifier_pass_receipt.completed_at)) {
    fail("identity_authority_record_time_invalid", "Authority record must be created after both pass receipts");
  }
  const passRefs = new Set([
    record.author_pass_receipt.actor_ref,
    record.author_pass_receipt.run_ref,
    record.author_pass_receipt.context_ref,
    record.author_pass_receipt.identity_attestation_ref,
    record.author_pass_receipt.pass_process_ref,
    record.verifier_pass_receipt.actor_ref,
    record.verifier_pass_receipt.run_ref,
    record.verifier_pass_receipt.context_ref,
    record.verifier_pass_receipt.identity_attestation_ref,
    record.verifier_pass_receipt.pass_process_ref,
  ]);
  for (const field of ["actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "process_ref"]) {
    if (passRefs.has(record.authority[field])) fail("identity_authority_declared_ref_collision", `Declared authority ${field} reuses a pass execution ref`);
  }
  return record;
}

export function validateWorkflowReceipt(receipt) {
  exactObject(receipt, ["schema", "job_id", "workflow_id", "request_sha256", "result_sha256", "workflow_bundle_sha256", "bundle_integrity_claim", "runner_release", "binding_revision", "input_refs", "output_refs", "execution", "phase_transition_digest_before_receipt_confirmation", "validator_summary", "boundary", "started_at", "completed_at", "stop_error_code"], "$receipt");
  enumValue(receipt.schema, ["soulforge.workflow_receipt.v1"], "$receipt.schema");
  safeId(receipt.job_id, "$receipt.job_id");
  enumValue(receipt.workflow_id, ["report_authoring_v0"], "$receipt.workflow_id");
  sha256(receipt.request_sha256, "$receipt.request_sha256");
  sha256(receipt.result_sha256, "$receipt.result_sha256");
  sha256(receipt.workflow_bundle_sha256, "$receipt.workflow_bundle_sha256");
  enumValue(receipt.bundle_integrity_claim, ["local_self_integrity_only", "externally_pinned_digest_match"], "$receipt.bundle_integrity_claim");
  enumValue(receipt.runner_release, ["workflow-runner.v1"], "$receipt.runner_release");
  enumValue(receipt.binding_revision, ["report_authoring_v0.binding.v1"], "$receipt.binding_revision");
  arrayValue(receipt.input_refs, "$receipt.input_refs", { min: 1, max: 8 });
  receipt.input_refs.forEach((ref, index) => validateRefMetadata(ref, `$receipt.input_refs[${index}]`));
  arrayValue(receipt.output_refs, "$receipt.output_refs", { min: 5, max: 6 });
  receipt.output_refs.forEach((ref, index) => validateRefMetadata(ref, `$receipt.output_refs[${index}]`));
  exactObject(receipt.execution, ["request_actor_ref", "final_rewriter_actor_ref", "final_rewriter_run_ref", "final_rewriter_context_ref", "final_rewriter_identity_attestation_ref", "semantic_verifier_actor_ref", "semantic_verifier_run_ref", "semantic_verifier_context_ref", "semantic_verifier_identity_attestation_ref", "identity_authority_ref", "identity_authority_record_sha256", "identity_claim", "deployment_attestation_ref", "author_pass_receipt_sha256", "verifier_pass_receipt_sha256", "model_ref", "reasoning_ref"], "$receipt.execution");
  for (const field of ["request_actor_ref", "final_rewriter_actor_ref", "final_rewriter_run_ref", "final_rewriter_context_ref", "final_rewriter_identity_attestation_ref", "semantic_verifier_actor_ref", "semantic_verifier_run_ref", "semantic_verifier_context_ref", "semantic_verifier_identity_attestation_ref"]) {
    opaqueRef(receipt.execution[field], `$receipt.execution.${field}`);
  }
  for (const field of ["model_ref", "reasoning_ref"]) if (receipt.execution[field] !== null) opaqueRef(receipt.execution[field], `$receipt.execution.${field}`);
  if (receipt.execution.final_rewriter_actor_ref === receipt.execution.semantic_verifier_actor_ref || receipt.execution.final_rewriter_run_ref === receipt.execution.semantic_verifier_run_ref || receipt.execution.final_rewriter_context_ref === receipt.execution.semantic_verifier_context_ref || receipt.execution.final_rewriter_identity_attestation_ref === receipt.execution.semantic_verifier_identity_attestation_ref) {
    fail("receipt_verifier_not_independent", "Receipt records self-verification");
  }
  opaqueRef(receipt.execution.identity_authority_ref, "$receipt.execution.identity_authority_ref");
  sha256(receipt.execution.identity_authority_record_sha256, "$receipt.execution.identity_authority_record_sha256");
  enumValue(receipt.execution.identity_claim, ["local_context_separation_declared", "deployment_attested_process_separation"], "$receipt.execution.identity_claim");
  if (receipt.execution.deployment_attestation_ref !== null) opaqueRef(receipt.execution.deployment_attestation_ref, "$receipt.execution.deployment_attestation_ref");
  if ((receipt.execution.identity_claim === "deployment_attested_process_separation") !== (receipt.execution.deployment_attestation_ref !== null)) {
    fail("receipt_identity_claim_mismatch", "Receipt identity claim and deployment attestation must agree");
  }
  sha256(receipt.execution.author_pass_receipt_sha256, "$receipt.execution.author_pass_receipt_sha256");
  sha256(receipt.execution.verifier_pass_receipt_sha256, "$receipt.execution.verifier_pass_receipt_sha256");
  sha256(receipt.phase_transition_digest_before_receipt_confirmation, "$receipt.phase_transition_digest_before_receipt_confirmation");
  exactObject(receipt.validator_summary, ["request_contract", "document_contract", "deterministic_preservation", "lexical_guard", "independent_semantic_verification", "render", "boundary", "counts"], "$receipt.validator_summary");
  for (const field of ["request_contract", "document_contract", "deterministic_preservation", "lexical_guard", "independent_semantic_verification", "render", "boundary"]) enumValue(receipt.validator_summary[field], ["pass", "fail"], `$receipt.validator_summary.${field}`);
  exactObject(receipt.validator_summary.counts, ["protected_baseline", "protected_candidate", "protected_matched", "lexical_protected", "unconfirmed"], "$receipt.validator_summary.counts");
  for (const value of Object.values(receipt.validator_summary.counts)) integerValue(value, "$receipt.validator_summary.counts.*");
  exactObject(receipt.boundary, ["content_classification", "raw_input_payload_copy_detected", "known_secret_pattern_scan_status", "runtime_absolute_path_detected", "source_owned_absolute_path_count", "forbidden_internal_scaffold_detected", "artifact_storage_class", "receipt_metadata_only"], "$receipt.boundary");
  enumValue(receipt.boundary.content_classification, ["public_safe", "private_work_product"], "$receipt.boundary.content_classification");
  boolValue(receipt.boundary.raw_input_payload_copy_detected, "$receipt.boundary.raw_input_payload_copy_detected");
  enumValue(receipt.boundary.known_secret_pattern_scan_status, ["pass", "detected"], "$receipt.boundary.known_secret_pattern_scan_status");
  boolValue(receipt.boundary.runtime_absolute_path_detected, "$receipt.boundary.runtime_absolute_path_detected");
  integerValue(receipt.boundary.source_owned_absolute_path_count, "$receipt.boundary.source_owned_absolute_path_count");
  boolValue(receipt.boundary.forbidden_internal_scaffold_detected, "$receipt.boundary.forbidden_internal_scaffold_detected");
  enumValue(receipt.boundary.artifact_storage_class, ["workspace_system", "owner_approved_shared_worksite"], "$receipt.boundary.artifact_storage_class");
  boolValue(receipt.boundary.receipt_metadata_only, "$receipt.boundary.receipt_metadata_only");
  if (receipt.boundary.raw_input_payload_copy_detected || receipt.boundary.known_secret_pattern_scan_status !== "pass" || receipt.boundary.runtime_absolute_path_detected || receipt.boundary.forbidden_internal_scaffold_detected || receipt.boundary.receipt_metadata_only !== true) {
    fail("receipt_boundary_violation", "Receipt boundary evidence did not pass");
  }
  dateTimeValue(receipt.started_at, "$receipt.started_at");
  dateTimeValue(receipt.completed_at, "$receipt.completed_at");
  if (receipt.stop_error_code !== null) fail("receipt_success_has_error", "Successful receipt stop_error_code must be null");
  return receipt;
}

export function validateWorkflowJobOutcome(outcome) {
  exactObject(outcome, ["schema", "state", "result", "receipt_confirmation", "error", "recovery", "replayed"], "$outcome");
  enumValue(outcome.schema, ["soulforge.workflow_job_outcome.v1"], "$outcome.schema");
  validateWorkflowJobState(outcome.state);
  if (outcome.result !== null) validateWorkflowJobResult(outcome.result);
  if (outcome.receipt_confirmation !== null) {
    exactObject(outcome.receipt_confirmation, ["payload_ref", "sha256", "size", "media_type"], "$outcome.receipt_confirmation");
    opaqueRef(outcome.receipt_confirmation.payload_ref, "$outcome.receipt_confirmation.payload_ref");
    sha256(outcome.receipt_confirmation.sha256, "$outcome.receipt_confirmation.sha256");
    integerValue(outcome.receipt_confirmation.size, "$outcome.receipt_confirmation.size", { min: 1, max: MAX_ARTIFACT_SIZE });
    enumValue(outcome.receipt_confirmation.media_type, ["application/json"], "$outcome.receipt_confirmation.media_type");
  }
  if (outcome.error !== null) {
    exactObject(outcome.error, ["code"], "$outcome.error");
    reasonCode(outcome.error.code, "$outcome.error.code");
  }
  exactObject(outcome.recovery, ["status", "artifact_refs", "reason_code", "receipt_confirmation"], "$outcome.recovery");
  enumValue(outcome.recovery.status, ["not_required", "rolled_back", "manual_required"], "$outcome.recovery.status");
  arrayValue(outcome.recovery.artifact_refs, "$outcome.recovery.artifact_refs", { max: 6 });
  outcome.recovery.artifact_refs.forEach((ref, index) => validateArtifactRef(ref, `$outcome.recovery.artifact_refs[${index}]`));
  if (outcome.recovery.reason_code !== null) reasonCode(outcome.recovery.reason_code, "$outcome.recovery.reason_code");
  if (outcome.recovery.receipt_confirmation !== null) {
    exactObject(outcome.recovery.receipt_confirmation, ["payload_ref", "sha256", "size", "media_type"], "$outcome.recovery.receipt_confirmation");
    opaqueRef(outcome.recovery.receipt_confirmation.payload_ref, "$outcome.recovery.receipt_confirmation.payload_ref");
    sha256(outcome.recovery.receipt_confirmation.sha256, "$outcome.recovery.receipt_confirmation.sha256");
    integerValue(outcome.recovery.receipt_confirmation.size, "$outcome.recovery.receipt_confirmation.size", { min: 1, max: MAX_ARTIFACT_SIZE });
    enumValue(outcome.recovery.receipt_confirmation.media_type, ["application/json"], "$outcome.recovery.receipt_confirmation.media_type");
  }
  boolValue(outcome.replayed, "$outcome.replayed");

  if (outcome.state.status === "succeeded") {
    if (outcome.result === null || outcome.receipt_confirmation === null || outcome.error !== null || outcome.recovery.status !== "not_required") {
      fail("outcome_success_inconsistent", "Succeeded outcome requires result and receipt confirmation without error or recovery");
    }
  } else if (outcome.receipt_confirmation !== null) {
    fail("outcome_nonsuccess_receipt", "Non-success outcome cannot claim receipt confirmation");
  }
  if (outcome.recovery.status === "not_required") {
    if (outcome.recovery.artifact_refs.length !== 0 || outcome.recovery.reason_code !== null || outcome.recovery.receipt_confirmation !== null) {
      fail("outcome_recovery_inconsistent", "not_required recovery must not carry artifacts or a reason");
    }
  } else {
    if (outcome.recovery.artifact_refs.length < 5 || outcome.recovery.reason_code === null) {
      fail("outcome_recovery_inconsistent", "Recovery records require artifact refs and a reason");
    }
  }
  if (outcome.recovery.status === "manual_required" && outcome.result !== null) {
    fail("outcome_manual_recovery_result_exposed", "A manual-recovery outcome cannot expose a successful result");
  }
  if (outcome.recovery.receipt_confirmation !== null && (outcome.recovery.status !== "manual_required" || outcome.recovery.reason_code !== "receipt_confirmed_before_terminal_state")) {
    fail("outcome_recovery_receipt_inconsistent", "Recovery receipt evidence is only valid for a confirmed receipt awaiting terminal-state adoption");
  }
  return outcome;
}

export function validateExecutorStageResult(result, path = "$stage_result") {
  exactObject(result, ["document", "actor_ref", "run_ref", "context_ref", "identity_attestation_ref", "pass_record"], path);
  validateReportDocument(result.document);
  opaqueRef(result.actor_ref, `${path}.actor_ref`);
  opaqueRef(result.run_ref, `${path}.run_ref`);
  opaqueRef(result.context_ref, `${path}.context_ref`);
  opaqueRef(result.identity_attestation_ref, `${path}.identity_attestation_ref`);
  if (result.pass_record !== null) validateEditorialPassRecord(result.pass_record, `${path}.pass_record`);
  return result;
}

export function validateEditorialPassRecord(record, path = "$pass_record") {
  exactObject(record, ["schema", "stage", "status", "checks"], path);
  enumValue(record.schema, ["soulforge.editorial_pass_record.v1"], `${path}.schema`);
  enumValue(record.stage, Object.keys(PASS_CHECK_IDS), `${path}.stage`);
  enumValue(record.status, ["pass", "fail"], `${path}.status`);
  arrayValue(record.checks, `${path}.checks`, { min: PASS_CHECK_IDS[record.stage].length, max: PASS_CHECK_IDS[record.stage].length });
  const expected = new Set(PASS_CHECK_IDS[record.stage]);
  const seen = new Set();
  record.checks.forEach((check, index) => {
    const checkPath = `${path}.checks[${index}]`;
    exactObject(check, ["id", "applicable", "answer", "evidence_refs", "blocker_code"], checkPath);
    enumValue(check.id, PASS_CHECK_IDS[record.stage], `${checkPath}.id`);
    if (seen.has(check.id)) fail("editorial_check_duplicate", `Duplicate editorial check ${check.id}`);
    seen.add(check.id);
    boolValue(check.applicable, `${checkPath}.applicable`);
    enumValue(check.answer, ["yes", "no", "not_applicable"], `${checkPath}.answer`);
    uniqueStrings(check.evidence_refs, `${checkPath}.evidence_refs`, { max: 64, validator: opaqueRef });
    if (check.blocker_code !== null) reasonCode(check.blocker_code, `${checkPath}.blocker_code`);
    if (check.applicable !== (check.answer !== "not_applicable")) fail("editorial_check_applicability_mismatch", `Editorial check applicability and answer disagree for ${check.id}`);
    if (check.answer === "yes" && check.evidence_refs.length < 1) fail("editorial_check_evidence_missing", `Passing editorial check lacks evidence: ${check.id}`);
    if ((check.answer === "no") !== (check.blocker_code !== null)) fail("editorial_check_blocker_mismatch", `Editorial blocker code mismatch for ${check.id}`);
  });
  if ([...expected].some((id) => !seen.has(id))) fail("editorial_check_set_incomplete", `Editorial check set is incomplete for ${record.stage}`);
  const hasNo = record.checks.some((check) => check.applicable && check.answer === "no");
  if ((record.status === "fail") !== hasNo) fail("editorial_pass_status_mismatch", "Editorial pass status must match its applicable checks");
  return record;
}

export function validateProtectedBaselineResult(result, path = "$protected_baseline_result") {
  exactObject(result, ["manifest", "actor_ref", "run_ref", "context_ref", "identity_attestation_ref"], path);
  validateSemanticManifest(result.manifest, `${path}.manifest`);
  opaqueRef(result.actor_ref, `${path}.actor_ref`);
  opaqueRef(result.run_ref, `${path}.run_ref`);
  opaqueRef(result.context_ref, `${path}.context_ref`);
  opaqueRef(result.identity_attestation_ref, `${path}.identity_attestation_ref`);
  return result;
}
