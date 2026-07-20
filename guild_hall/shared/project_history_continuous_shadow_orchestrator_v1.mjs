import {
  canonicalJson,
  sha256Canonical,
  validateTypedRef,
} from "./project_history_envelope.mjs";
import {
  PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
  buildProjectHistoryReceiptAdapterGenerationV2,
  openProjectHistoryShadowAdapterAuthorityV1,
  replayProjectHistoryReceiptAdapterGenerationsV2,
  validateProjectHistoryReceiptAdapterGenerationV2,
  validateProjectHistoryReceiptAdapterRequestV2,
} from "./project_history_receipt_adapter_v2.mjs";

export const PROJECT_HISTORY_CONTINUOUS_SHADOW_INPUT_SCHEMA_VERSION =
  "soulforge.project_history_continuous_shadow_input.v1";
export const PROJECT_HISTORY_CONTINUOUS_SHADOW_RESULT_SCHEMA_VERSION =
  "soulforge.project_history_continuous_shadow_result.v1";
export const PROJECT_HISTORY_CONTINUOUS_SHADOW_COVERAGE_SCHEMA_VERSION =
  "soulforge.project_history_continuous_shadow_coverage.v1";

export const PROJECT_HISTORY_CONTINUOUS_SHADOW_EXPORT_CONTRACT = Object.freeze({
  feature_state: "off",
  input_authority: "explicit_continuous_receipt_and_project_classification",
  shadow_authority: "separate_private_shadow_adapter_epoch",
  raw_ingress_authority_reused: false,
  output_mode: "in_memory_only",
  scheduler_enabled: false,
  live_database_written: false,
  accepted_history: false,
  production_readiness_granted: false,
});

const INPUT_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "continuous_run_receipt",
  "continuous_run_receipt_digest",
  "receipt_root",
  "explicit_project_refs",
  "shadow_authority",
  "coverage",
  "occurrences",
  "raw_payload_copied",
  "accepted_history",
]);
const SHADOW_AUTHORITY_FIELDS = Object.freeze([
  "epoch",
  "digest",
  "node_id",
  "issued_at",
  "expires_at",
  "revoked",
]);
const CONTINUOUS_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  "schema_version",
  "run_id",
  "status",
  "node_id",
  "lease_epoch",
  "writer_authority_epoch",
  "writer_authority_digest",
  "writer_authority_node_id",
  "writer_authority_mode",
  "started_at",
  "completed_at",
  "source_deleted",
  "source_overwritten",
  "erp_written",
  "mcp_written",
  "project_promoted",
]);
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const CONTINUOUS_RUN_RECEIPT_V2 = "soulforge.ingress.continuous_run_receipt.v2";
const CONTINUOUS_STATUSES = new Set(["ok", "degraded"]);
const WRITER_MODES = new Set(["primary", "fallback"]);
const PHASE_BY_LANE = Object.freeze({
  mail: "H01",
  voice: "H02",
  structured_pc_work: "H03",
  file: "H04",
  run_log: "H05",
});
const COMPLETE_COVERAGE_STATES = new Set(["complete_with_events", "complete_no_events"]);
const FORBIDDEN_RECEIPT_FIELD_TOKENS = new Set([
  "body",
  "cookie",
  "credential",
  "password",
  "payload",
  "secret",
  "token",
  "transcript",
]);

export class ProjectHistoryContinuousShadowOrchestratorV1Error extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryContinuousShadowOrchestratorV1Error";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryContinuousShadowOrchestratorV1Error(code, path, message);
}

function exactKeys(value, fields, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length
      || !actual.every((key, index) => key === expected[index])) {
    fail("exact_fields_required", path, "Object fields differ from the fixed contract");
  }
}

function denseArray(value, path) {
  if (!Array.isArray(value)) fail("array_required", path, "Expected an array");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("dense_array_required", `${path}[${index}]`, "Sparse arrays are forbidden");
  }
  return value;
}

function assertCanonicalUtc(value, path) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("canonical_utc_required", path, "Expected canonical millisecond UTC");
  }
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("digest_required", path, "Expected a canonical sha256 digest");
  }
}

function refsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function fieldTokens(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function assertNoForbiddenReceiptFields(value, path = "$input.continuous_run_receipt") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenReceiptFields(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "credential_files_checked"
        && Number.isSafeInteger(child) && child >= 0) {
      continue;
    }
    if (fieldTokens(key).some((token) => FORBIDDEN_RECEIPT_FIELD_TOKENS.has(token))) {
      fail("continuous_receipt_private_field_forbidden", `${path}.${key}`, "Continuous receipt must remain metadata-only");
    }
    assertNoForbiddenReceiptFields(child, `${path}.${key}`);
  }
}

function validateContinuousRunReceipt(receipt, expectedDigest) {
  canonicalJson(receipt);
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    fail("continuous_receipt_invalid", "$input.continuous_run_receipt", "Expected a continuous run receipt object");
  }
  for (const field of CONTINUOUS_RECEIPT_REQUIRED_FIELDS) {
    if (!Object.hasOwn(receipt, field)) {
      fail("continuous_receipt_field_missing", `$input.continuous_run_receipt.${field}`, "Required receipt field is missing");
    }
  }
  assertNoForbiddenReceiptFields(receipt);
  assertDigest(expectedDigest, "$input.continuous_run_receipt_digest");
  if (sha256Canonical(receipt) !== expectedDigest) {
    fail("continuous_receipt_digest_mismatch", "$input.continuous_run_receipt_digest", "Continuous receipt metadata differs from its external pin");
  }
  if (receipt.schema_version !== CONTINUOUS_RUN_RECEIPT_V2
      || !CONTINUOUS_STATUSES.has(receipt.status)) {
    fail("continuous_receipt_state_invalid", "$input.continuous_run_receipt", "Only completed v2 ok/degraded receipts are accepted");
  }
  validateTypedRef({ entity_type: "run", owner_surface: "continuous_ingress", entity_id: receipt.run_id }, "run", "$input.continuous_run_receipt.run_id");
  validateTypedRef({ entity_type: "node", owner_surface: "continuous_ingress", entity_id: receipt.node_id }, "node", "$input.continuous_run_receipt.node_id");
  if (!Number.isSafeInteger(receipt.lease_epoch) || receipt.lease_epoch < 1
      || !Number.isSafeInteger(receipt.writer_authority_epoch) || receipt.writer_authority_epoch < 1) {
    fail("continuous_receipt_epoch_invalid", "$input.continuous_run_receipt", "Lease and custody authority epochs must be positive integers");
  }
  assertDigest(receipt.writer_authority_digest, "$input.continuous_run_receipt.writer_authority_digest");
  if (receipt.writer_authority_node_id !== receipt.node_id
      || !WRITER_MODES.has(receipt.writer_authority_mode)) {
    fail("continuous_receipt_authority_invalid", "$input.continuous_run_receipt", "Custody authority tuple is inconsistent");
  }
  assertCanonicalUtc(receipt.started_at, "$input.continuous_run_receipt.started_at");
  assertCanonicalUtc(receipt.completed_at, "$input.continuous_run_receipt.completed_at");
  if (receipt.started_at >= receipt.completed_at) {
    fail("continuous_receipt_window_invalid", "$input.continuous_run_receipt", "Continuous run window must be non-empty");
  }
  for (const field of [
    "source_deleted",
    "source_overwritten",
    "erp_written",
    "mcp_written",
    "project_promoted",
  ]) {
    if (receipt[field] !== false) {
      fail("continuous_receipt_boundary_invalid", `$input.continuous_run_receipt.${field}`, "Continuous custody receipt cannot grant mutation or promotion");
    }
  }
  return receipt;
}

function validateSingleExplicitProject(value) {
  denseArray(value, "$input.explicit_project_refs");
  if (value.length === 0) {
    fail("explicit_project_classification_missing", "$input.explicit_project_refs", "Exactly one explicit project is required");
  }
  if (value.length !== 1) {
    fail("explicit_project_classification_ambiguous", "$input.explicit_project_refs", "More than one explicit project is ambiguous");
  }
  return validateTypedRef(value[0], "project", "$input.explicit_project_refs[0]");
}

function validateProjectScope(rows, projectRef, path) {
  denseArray(rows, path);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === null || typeof row !== "object" || Array.isArray(row)
        || !Object.hasOwn(row, "project_ref")) {
      fail("classification_project_missing", `${path}[${index}].project_ref`, "Every row must carry its explicit project classification");
    }
    validateTypedRef(row.project_ref, "project", `${path}[${index}].project_ref`);
    if (!refsEqual(row.project_ref, projectRef)) {
      fail("mixed_project_classification", `${path}[${index}].project_ref`, "All rows must bind the one explicit project");
    }
  }
}

export function buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(input) {
  canonicalJson(input);
  exactKeys(input, INPUT_FIELDS, "$input");
  if (input.schema_version !== PROJECT_HISTORY_CONTINUOUS_SHADOW_INPUT_SCHEMA_VERSION
      || input.feature_state !== "off"
      || input.raw_payload_copied !== false
      || input.accepted_history !== false) {
    fail("continuous_shadow_boundary_invalid", "$input", "The orchestrator is feature-OFF metadata-only Shadow");
  }
  const continuousReceipt = validateContinuousRunReceipt(
    input.continuous_run_receipt,
    input.continuous_run_receipt_digest,
  );
  const projectRef = validateSingleExplicitProject(input.explicit_project_refs);
  exactKeys(input.shadow_authority, SHADOW_AUTHORITY_FIELDS, "$input.shadow_authority");
  assertDigest(input.shadow_authority.digest, "$input.shadow_authority.digest");
  if (input.shadow_authority.digest === continuousReceipt.writer_authority_digest) {
    fail("raw_ingress_authority_reuse_forbidden", "$input.shadow_authority.digest", "Shadow authority must be independent from RAW custody authority");
  }
  validateProjectScope(input.coverage, projectRef, "$input.coverage");
  validateProjectScope(input.occurrences, projectRef, "$input.occurrences");
  if (continuousReceipt.status === "degraded"
      && input.coverage.every((row) => COMPLETE_COVERAGE_STATES.has(row.state))) {
    fail(
      "degraded_continuous_receipt_requires_coverage_gap",
      "$input.coverage",
      "A degraded continuous run cannot declare complete Shadow coverage for every lane",
    );
  }

  const generationId = `continuous:${sha256Canonical({
    continuous_run_receipt_digest: input.continuous_run_receipt_digest,
    project_ref: projectRef,
  }).slice("sha256:".length)}`;
  const request = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION,
    feature_state: "off",
    generation_id: generationId,
    generated_at: continuousReceipt.completed_at,
    receipt_root: input.receipt_root,
    project_ref: projectRef,
    window_start: continuousReceipt.started_at,
    window_end: continuousReceipt.completed_at,
    classification_state: "shadow",
    required_writer_epoch: input.shadow_authority.epoch,
    writer_authority: structuredClone(input.shadow_authority),
    coverage: structuredClone(input.coverage),
    occurrences: structuredClone(input.occurrences),
    raw_payload_copied: false,
    accepted_history: false,
  };
  return validateProjectHistoryReceiptAdapterRequestV2(request);
}

export function buildProjectHistoryContinuousShadowCoverageV1(generation) {
  validateProjectHistoryReceiptAdapterGenerationV2(generation);
  const phases = generation.coverage_receipts.map((receipt) => Object.freeze({
    phase_id: PHASE_BY_LANE[receipt.lane],
    lane: receipt.lane,
    state: receipt.state,
    event_count: receipt.event_count,
    gap_codes: Object.freeze([...receipt.gap_codes]),
  }));
  const incomplete = phases
    .filter((entry) => !COMPLETE_COVERAGE_STATES.has(entry.state))
    .map((entry) => entry.phase_id);
  phases.push(Object.freeze({
    phase_id: "H06",
    lane: null,
    state: incomplete.length === 0 ? "shadow_coverage_complete" : "shadow_coverage_incomplete",
    event_count: generation.envelopes.length,
    gap_codes: Object.freeze(incomplete.map((phaseId) => `${phaseId.toLowerCase()}_coverage_gap`)),
  }));
  return Object.freeze({
    schema_version: PROJECT_HISTORY_CONTINUOUS_SHADOW_COVERAGE_SCHEMA_VERSION,
    generation_id: generation.generation_id,
    project_ref: generation.project_ref,
    phases: Object.freeze(phases),
    production_readiness_granted: false,
    raw_payload_copied: false,
    accepted_history: false,
  });
}

export async function runProjectHistoryContinuousShadowOrchestratorV1(input, {
  authorityPath,
  authorityDigest,
  currentGenerations = [],
} = {}) {
  const request = buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun(input);
  if (authorityDigest !== request.writer_authority.digest) {
    fail("shadow_authority_digest_mismatch", "$options.authorityDigest", "Authority pin must match the request mirror");
  }
  const authoritySnapshot = openProjectHistoryShadowAdapterAuthorityV1({
    authorityPath,
    authorityDigest,
    request,
  });
  const generation = await buildProjectHistoryReceiptAdapterGenerationV2(request, {
    authoritySnapshot,
  });
  const replay = replayProjectHistoryReceiptAdapterGenerationsV2(
    currentGenerations,
    generation,
  );
  return Object.freeze({
    schema_version: PROJECT_HISTORY_CONTINUOUS_SHADOW_RESULT_SCHEMA_VERSION,
    feature_state: "off",
    request,
    generation,
    replay,
    coverage: buildProjectHistoryContinuousShadowCoverageV1(generation),
    output_written: false,
    scheduler_enabled: false,
    live_database_written: false,
    raw_payload_copied: false,
    accepted_history: false,
    production_readiness_granted: false,
  });
}

export const buildContinuousProjectHistoryShadowRequestV1 =
  buildProjectHistoryReceiptAdapterRequestV2FromContinuousRun;
export const runContinuousProjectHistoryShadowV1 =
  runProjectHistoryContinuousShadowOrchestratorV1;
