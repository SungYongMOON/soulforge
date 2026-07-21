import {
  buildRagRetrievalTrace,
  validateRagRetrievalTrace,
} from "../rag/rag.mjs";
import { canonicalJson, sha256Canonical } from "./project_history_envelope.mjs";
import {
  PROJECT_HISTORY_KNOWLEDGE_SCOPES,
  validateProjectHistoryKnowledgeProjection,
} from "./project_history_knowledge_projection.mjs";

export const PROJECT_HISTORY_KNOWLEDGE_QUERY_SCHEMA_VERSION =
  "soulforge.project_history_knowledge_query.v1";

const PROJECT_CODE_PATTERN = /^P\d{2}-\d{3}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const QUERY_STATUSES = new Set([
  "retrieved_metadata",
  "blocked_insufficient_metadata_index_evidence",
]);
const AUTHORITY_FIELDS = Object.freeze([
  "accepted_history",
  "knowledge_acceptance",
  "owner_approval",
  "ontology_acceptance",
  "canon_mutation",
  "registry_mutation",
  "graph_mutation",
  "rag_ingestion",
  "drive_mutation",
  "notebooklm_mutation",
  "feature_activation",
  "business_data_mutation",
]);
const RESULT_FIELDS = Object.freeze([
  "schema_version",
  "kind",
  "status",
  "feature_state",
  "route",
  "generated_at_utc",
  "knowledge_scope",
  "owner_project_code",
  "origin_project_code",
  "claim_ceiling",
  "query_fingerprint",
  "selection",
  "hits",
  "boundary",
  "authority",
  "query_digest",
]);
const SELECTION_FIELDS = Object.freeze([
  "projection_id",
  "projection_digest",
  "generation_id",
  "ordered_event_digest",
  "source_attestation_digest",
  "graph_id",
  "graph_digest",
  "manifest_id",
  "index_id",
]);
const HIT_FIELDS = Object.freeze([
  "unit_ref",
  "graph_node_ref",
  "title_label",
  "summary",
  "node_type",
  "score",
  "match_reasons",
  "claim_ceiling",
  "retrieval_status",
  "history_metadata_digest",
  "knowledge_scope",
  "owner_project_code",
  "origin_project_code",
]);
const BOUNDARY = Object.freeze({
  metadata_only: true,
  raw_question_persisted: false,
  source_text_loaded: false,
  source_payload_loaded: false,
  chunk_payload_loaded: false,
  locator_returned: false,
  implicit_scope_fallback_allowed: false,
  cross_scope_results_allowed: false,
  writes_performed: false,
  external_calls_performed: false,
});
const FORBIDDEN_RESULT_KEYS = new Set([
  "body",
  "body_text",
  "chunk_text",
  "locator",
  "locator_ref",
  "mail_body",
  "payload",
  "question",
  "raw_payload",
  "raw_query",
  "source_body",
  "source_locator",
  "source_locator_ref",
  "source_text",
  "storage_locator",
  "transcript",
]);

export class ProjectHistoryKnowledgeQueryError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryKnowledgeQueryError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryKnowledgeQueryError(code, path, message);
}

function exactKeys(value, expected, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", path, "Fields do not match the query contract");
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

function resolveAliasedOption(options, camelName, snakeName, requiredCode) {
  const camelPresent = Object.hasOwn(options, camelName);
  const snakePresent = Object.hasOwn(options, snakeName);
  if (!camelPresent && !snakePresent) {
    fail(requiredCode, `$options.${snakeName}`, `${snakeName} must be explicit`);
  }
  if (camelPresent && snakePresent && options[camelName] !== options[snakeName]) {
    fail(`${requiredCode.replace(/_required$/u, "")}_conflict`, "$options", "Aliased values disagree");
  }
  return camelPresent ? options[camelName] : options[snakeName];
}

function resolveOptions(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail("options_object_required", "$options", "Options must be a plain object");
  }
  const knowledgeScope = resolveAliasedOption(
    options,
    "knowledgeScope",
    "knowledge_scope",
    "knowledge_scope_required",
  );
  if (!PROJECT_HISTORY_KNOWLEDGE_SCOPES.includes(knowledgeScope)) {
    fail("knowledge_scope_invalid", "$options.knowledge_scope", "Expected project or common");
  }
  const originProjectCode = resolveAliasedOption(
    options,
    "originProjectCode",
    "origin_project_code",
    "origin_project_code_required",
  );
  if (typeof originProjectCode !== "string" || !PROJECT_CODE_PATTERN.test(originProjectCode)) {
    fail("origin_project_code_invalid", "$options.origin_project_code", "Expected PNN-NNN");
  }
  const question = String(options.question ?? "").trim();
  if (!question) {
    fail("question_required", "$options.question", "Question must be transient and nonempty");
  }
  const maxUnits = options.maxUnits ?? options.max_units ?? 5;
  if (!Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 20) {
    fail("max_units_invalid", "$options.max_units", "Expected an integer from 1 through 20");
  }
  if (options.now !== undefined && Number.isNaN(new Date(options.now).getTime())) {
    fail("query_time_invalid", "$options.now", "Expected an ISO-8601 compatible timestamp");
  }
  return { knowledgeScope, originProjectCode, question, maxUnits, now: options.now };
}

function buildAuthority() {
  return Object.fromEntries(AUTHORITY_FIELDS.map((field) => [field, false]));
}

function assertNoForbiddenKeys(value, path = "$result") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESULT_KEYS.has(key.toLowerCase())) {
      fail("forbidden_query_result_key", `${path}.${key}`, "Source-bearing query fields are forbidden");
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

export async function queryProjectHistoryKnowledgeProjection(projection, options = {}) {
  const resolved = resolveOptions(options);
  validateProjectHistoryKnowledgeProjection(projection);
  if (projection.knowledge_scope !== resolved.knowledgeScope) {
    fail(
      "knowledge_scope_mismatch",
      "$projection.knowledge_scope",
      "The supplied projection cannot serve a different scope",
    );
  }
  if (projection.origin_project_code !== resolved.originProjectCode) {
    fail(
      "origin_project_code_mismatch",
      "$projection.origin_project_code",
      "The supplied projection cannot serve a different origin project",
    );
  }

  const trace = await buildRagRetrievalTrace({
    metadataIndex: projection.rag_metadata_index,
    question: resolved.question,
    maxUnits: resolved.maxUnits,
    now: resolved.now,
  });
  const traceValidation = validateRagRetrievalTrace(trace);
  if (traceValidation.status !== "pass") {
    fail("retrieval_trace_invalid", "$trace", traceValidation.blockers.join(","));
  }
  const unitsByRef = new Map(
    projection.rag_manifest.retrieval_units.map((unit) => [unit.unit_ref, unit]),
  );
  const result = {
    schema_version: PROJECT_HISTORY_KNOWLEDGE_QUERY_SCHEMA_VERSION,
    kind: "project_history_knowledge_query",
    status: trace.status,
    feature_state: "off",
    route: "owner_decision_needed",
    generated_at_utc: trace.generated_at_utc,
    knowledge_scope: projection.knowledge_scope,
    owner_project_code: projection.owner_project_code,
    origin_project_code: projection.origin_project_code,
    claim_ceiling: "observed",
    query_fingerprint: trace.question_fingerprint,
    selection: {
      projection_id: projection.projection_id,
      projection_digest: projection.projection_digest,
      generation_id: projection.input_binding.generation_id,
      ordered_event_digest: projection.input_binding.ordered_event_digest,
      source_attestation_digest: projection.input_binding.source_attestation_digest,
      graph_id: projection.graph_view.graph_id,
      graph_digest: projection.graph_view.graph_digest,
      manifest_id: projection.rag_manifest.manifest_id,
      index_id: projection.rag_metadata_index.index_id,
    },
    hits: trace.retrieved_units.map((unit) => ({
      ...unit,
      history_metadata_digest: unitsByRef.get(unit.unit_ref)?.history_metadata_digest ?? null,
      knowledge_scope: projection.knowledge_scope,
      owner_project_code: projection.owner_project_code,
      origin_project_code: projection.origin_project_code,
    })),
    boundary: { ...BOUNDARY },
    authority: buildAuthority(),
    query_digest: "",
  };
  result.query_digest = sha256Canonical(
    Object.fromEntries(Object.entries(result).filter(([key]) => key !== "query_digest")),
  );
  return validateProjectHistoryKnowledgeQueryResult(result);
}

export function validateProjectHistoryKnowledgeQueryResult(result) {
  canonicalJson(result);
  assertNoForbiddenKeys(result);
  exactKeys(result, RESULT_FIELDS, "$result");
  if (result.schema_version !== PROJECT_HISTORY_KNOWLEDGE_QUERY_SCHEMA_VERSION
      || result.kind !== "project_history_knowledge_query"
      || !QUERY_STATUSES.has(result.status)
      || result.feature_state !== "off"
      || result.route !== "owner_decision_needed"
      || result.claim_ceiling !== "observed") {
    fail("query_state_invalid", "$result", "Expected one feature-OFF held metadata query");
  }
  if (Number.isNaN(new Date(result.generated_at_utc).getTime())) {
    fail("query_time_invalid", "$result.generated_at_utc", "Expected an ISO-8601 timestamp");
  }
  if (!PROJECT_HISTORY_KNOWLEDGE_SCOPES.includes(result.knowledge_scope)) {
    fail("knowledge_scope_invalid", "$result.knowledge_scope", "Expected project or common");
  }
  if (!PROJECT_CODE_PATTERN.test(result.origin_project_code)) {
    fail("origin_project_code_invalid", "$result.origin_project_code", "Expected PNN-NNN");
  }
  const expectedOwner = result.knowledge_scope === "project" ? result.origin_project_code : "system";
  if (result.owner_project_code !== expectedOwner) {
    fail("owner_project_code_invalid", "$result.owner_project_code", "Owner does not match scope");
  }
  if (!SHA256_HEX_PATTERN.test(result.query_fingerprint)) {
    fail("query_fingerprint_invalid", "$result.query_fingerprint", "Expected an opaque SHA-256 fingerprint");
  }
  exactKeys(result.selection, SELECTION_FIELDS, "$result.selection");
  for (const field of [
    "projection_digest",
    "ordered_event_digest",
    "source_attestation_digest",
    "graph_digest",
  ]) {
    if (!SHA256_DIGEST_PATTERN.test(result.selection[field])) {
      fail("selection_digest_invalid", `$result.selection.${field}`, "Expected sha256:<hex>");
    }
  }
  for (const field of ["projection_id", "generation_id", "graph_id", "manifest_id", "index_id"]) {
    if (typeof result.selection[field] !== "string" || result.selection[field].length === 0) {
      fail("selection_ref_invalid", `$result.selection.${field}`, "Expected a nonempty metadata ref");
    }
  }
  denseArray(result.hits, "$result.hits");
  for (const [index, hit] of result.hits.entries()) {
    const path = `$result.hits[${index}]`;
    exactKeys(hit, HIT_FIELDS, path);
    if (hit.knowledge_scope !== result.knowledge_scope
        || hit.owner_project_code !== result.owner_project_code
        || hit.origin_project_code !== result.origin_project_code
        || hit.claim_ceiling !== "observed"
        || hit.retrieval_status !== "metadata_index"
        || !SHA256_DIGEST_PATTERN.test(hit.history_metadata_digest)) {
      fail("query_hit_scope_invalid", path, "Hit does not preserve the exact held scope and origin");
    }
    denseArray(hit.match_reasons, `${path}.match_reasons`);
  }
  exactKeys(result.boundary, Object.keys(BOUNDARY), "$result.boundary");
  if (canonicalJson(result.boundary) !== canonicalJson(BOUNDARY)) {
    fail("query_boundary_invalid", "$result.boundary", "Read-only and no-fallback boundary changed");
  }
  exactKeys(result.authority, AUTHORITY_FIELDS, "$result.authority");
  if (Object.values(result.authority).some((value) => value !== false)) {
    fail("query_authority_invalid", "$result.authority", "Query authority must remain false");
  }
  const expectedDigest = sha256Canonical(
    Object.fromEntries(Object.entries(result).filter(([key]) => key !== "query_digest")),
  );
  if (result.query_digest !== expectedDigest) {
    fail("query_digest_mismatch", "$result.query_digest", "Query result digest is stale");
  }
  return result;
}
