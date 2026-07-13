import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

export const WORKFLOW_ID = "report_authoring_v0";
export const WORKFLOW_BINDING_REVISION = "report_authoring_v0.binding.v1";
export const WORKFLOW_REQUEST_SCHEMA = "soulforge.workflow_job_request.v1";
export const WORKFLOW_PUBLIC_REQUEST_SCHEMA = "dev_erp.workflow_job_create.v1";
export const WORKFLOW_INPUT_SCHEMA = "dev_erp.workflow_input.v1";
export const WORKFLOW_CANCEL_SCHEMA = "dev_erp.workflow_job_cancel.v1";
export const WORKFLOW_RECOVERY_SCHEMA = "dev_erp.workflow_job_recovery.v1";
export const WORKFLOW_DEPLOYMENT_ATTESTATION_SCHEMA = "dev_erp.workflow_deployment_attestation.v1";
export const WORKFLOW_BOUNDARY_POLICY = "soulforge.report.boundary.v1";
export const WORKFLOW_ACCEPTANCE_PROFILE = "soulforge.report.semantic_preservation.v1";
export const WORKFLOW_RAW_INPUT_MAX_BYTES = 393_216;
export const WORKFLOW_RAW_OUTPUT_MAX_BYTES = 393_216;
export const WORKFLOW_INPUT_TTL_MS = 30 * 60 * 1000;
export const WORKFLOW_CLAIM_CEILINGS = Object.freeze(["observed", "source_supported", "rejected_or_blocked"]);

export const WORKFLOW_MODES = Object.freeze(["full_authoring", "final_polish"]);
export const WORKFLOW_REPORT_TYPES = Object.freeze(["experiment", "analysis", "progress", "presentation", "other"]);
export const WORKFLOW_AUDIENCES = Object.freeze(["internal_review", "management", "customer", "regulator", "other"]);
export const WORKFLOW_INPUT_ROLES = Object.freeze(["source", "draft"]);
export const WORKFLOW_INPUT_MEDIA_TYPES = Object.freeze([
  "text/plain; charset=utf-8",
  "text/markdown; charset=utf-8",
  "application/json",
]);

export const WORKFLOW_ARTIFACT_MEDIA_TYPES = Object.freeze({
  report_document_json: "application/json",
  final_report_md: "text/markdown",
  final_report_html: "text/html",
  protected_semantic_manifest: "application/json",
  preservation_audit: "application/json",
  semantic_verification: "application/json",
});

export const WORKFLOW_ARTIFACT_ROLES = Object.freeze(Object.keys(WORKFLOW_ARTIFACT_MEDIA_TYPES));
export const WORKFLOW_READER_ARTIFACT_ROLES = Object.freeze(["final_report_md", "final_report_html"]);
export const WORKFLOW_AUDIT_ARTIFACT_ROLES = Object.freeze(
  WORKFLOW_ARTIFACT_ROLES.filter((role) => !WORKFLOW_READER_ARTIFACT_ROLES.includes(role)),
);

export const WORKFLOW_JOB_ID_RE = /^wfj_[a-f0-9]{32}$/;
export const WORKFLOW_INPUT_HANDLE_RE = /^wih_[a-f0-9]{32}$/;
export const WORKFLOW_IDEMPOTENCY_KEY_RE = /^wfi_[a-f0-9]{32}$/;
export const WORKFLOW_OPERATION_ID_RE = /^wfo_[a-f0-9]{32}$/;
export const WORKFLOW_PROJECT_RE = /^P[0-9]{2}-[0-9]{3}(?:_[A-Z0-9][A-Z0-9_-]{0,47})?$/;
export const SHA256_RE = /^[a-f0-9]{64}$/;

const STATUS = Object.freeze(["queued", "running", "blocked", "succeeded", "failed", "cancelled", "interrupted"]);
const PHASE = Object.freeze(["validate", "intake", "draft", "final_polish", "preservation", "semantic_verify", "render", "receipt"]);

export class WorkflowJobError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = "WorkflowJobError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 400) {
  throw new WorkflowJobError(code, status);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function exactObject(value, fields, code = "workflow_request_invalid") {
  if (!isObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    fail(code);
  }
  return value;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function enumValue(value, allowed, code) {
  if (!allowed.includes(value)) fail(code);
  return value;
}

function exactString(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

export function normalizeWorkflowMediaType(value) {
  const mediaType = String(value || "").trim().toLowerCase().replace(/\s*;\s*/g, "; ").replace(/\s*=\s*/g, "=");
  if (mediaType === "text/plain" || mediaType === "text/plain; charset=utf-8") return "text/plain; charset=utf-8";
  if (mediaType === "text/markdown" || mediaType === "text/markdown; charset=utf-8") return "text/markdown; charset=utf-8";
  if (mediaType === "application/json" || mediaType === "application/json; charset=utf-8") return "application/json";
  fail("workflow_input_media_type_unsupported", 415);
}

function decodeFatalUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("workflow_input_utf8_invalid");
  }
}

export function validateWorkflowInputUpload({ project_code, role, media_type, bytes }) {
  exactString(project_code, WORKFLOW_PROJECT_RE, "workflow_project_invalid");
  enumValue(role, WORKFLOW_INPUT_ROLES, "workflow_input_role_invalid");
  const normalizedMediaType = normalizeWorkflowMediaType(media_type);
  if (!Buffer.isBuffer(bytes)) fail("workflow_input_body_invalid");
  if (bytes.length < 1) fail("workflow_input_empty");
  if (bytes.length > WORKFLOW_RAW_INPUT_MAX_BYTES) fail("workflow_input_too_large", 413);
  const text = decodeFatalUtf8(bytes);
  if (normalizedMediaType === "application/json") {
    try { JSON.parse(text); }
    catch { fail("workflow_input_json_invalid"); }
  }
  return { project_code, role, media_type: normalizedMediaType, bytes };
}

export function validatePublicWorkflowJobRequest(value) {
  exactObject(value, ["schema", "project_code", "mode", "report_type", "audience", "input_handles"], "workflow_request_fields_invalid");
  if (value.schema !== WORKFLOW_PUBLIC_REQUEST_SCHEMA) fail("workflow_request_schema_invalid");
  exactString(value.project_code, WORKFLOW_PROJECT_RE, "workflow_project_invalid");
  enumValue(value.mode, WORKFLOW_MODES, "workflow_mode_invalid");
  enumValue(value.report_type, WORKFLOW_REPORT_TYPES, "workflow_report_type_invalid");
  enumValue(value.audience, WORKFLOW_AUDIENCES, "workflow_audience_invalid");
  if (!Array.isArray(value.input_handles) || value.input_handles.length < 1 || value.input_handles.length > 2) {
    fail("workflow_input_handle_count_invalid");
  }
  const seen = new Set();
  for (const handle of value.input_handles) {
    exactString(handle, WORKFLOW_INPUT_HANDLE_RE, "workflow_input_handle_invalid");
    if (seen.has(handle)) fail("workflow_input_handle_duplicate");
    seen.add(handle);
  }
  return value;
}

export function validateResolvedWorkflowInputs(mode, inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) fail("workflow_inputs_invalid");
  const draftCount = inputs.filter((input) => input.role === "draft").length;
  const sourceCount = inputs.filter((input) => input.role === "source").length;
  const total = inputs.reduce((sum, input) => sum + Number(input.body_size || 0), 0);
  if (total > WORKFLOW_RAW_INPUT_MAX_BYTES) fail("workflow_input_total_too_large", 413);
  if (sourceCount > 1 || draftCount > 1) fail("workflow_input_role_duplicate", 422);
  if (mode === "final_polish" && draftCount !== 1) fail("workflow_final_polish_draft_required", 422);
  if (mode === "full_authoring" && (draftCount !== 0 || sourceCount < 1)) fail("workflow_full_authoring_source_required", 422);
  if (inputs.some((input) => !WORKFLOW_INPUT_ROLES.includes(input.role))) fail("workflow_input_role_invalid");
  return { total_bytes: total, draft_count: draftCount, source_count: sourceCount };
}

export function validateIdempotencyKey(value) {
  return exactString(value, WORKFLOW_IDEMPOTENCY_KEY_RE, "workflow_idempotency_key_invalid");
}

export function validateCancelRequest(value) {
  exactObject(value, ["schema", "expected_state_version"], "workflow_cancel_fields_invalid");
  if (value.schema !== WORKFLOW_CANCEL_SCHEMA) fail("workflow_cancel_schema_invalid");
  if (!Number.isSafeInteger(value.expected_state_version) || value.expected_state_version < 1) fail("workflow_state_version_invalid");
  return value;
}

export function validateRecoveryRequest(value) {
  exactObject(value, ["schema", "expected_state_version", "action", "idempotency_key"], "workflow_recovery_fields_invalid");
  if (value.schema !== WORKFLOW_RECOVERY_SCHEMA) fail("workflow_recovery_schema_invalid");
  if (!Number.isSafeInteger(value.expected_state_version) || value.expected_state_version < 1) fail("workflow_state_version_invalid");
  if (value.action !== "resume_receipt") fail("workflow_recovery_action_forbidden", 409);
  validateIdempotencyKey(value.idempotency_key);
  return value;
}

export function validatePagination({ limit, offset }) {
  const parsedLimit = limit === undefined || limit === null || limit === "" ? 50 : Number(limit);
  const parsedOffset = offset === undefined || offset === null || offset === "" ? 0 : Number(offset);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) fail("workflow_pagination_invalid");
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 1_000_000) fail("workflow_pagination_invalid");
  return { limit: parsedLimit, offset: parsedOffset };
}

export function validateStatusFilter(value) {
  if (value === undefined || value === null || value === "") return null;
  return enumValue(value, STATUS, "workflow_status_invalid");
}

export function validatePhase(value) {
  return enumValue(value, PHASE, "workflow_phase_invalid");
}

export function buildFixedRunnerRequest({ job, inputs }) {
  if (!job || !WORKFLOW_JOB_ID_RE.test(job.job_id)) fail("workflow_job_invalid");
  const roleMap = Object.freeze({ source: "source_material", draft: "draft_report" });
  const mediaTypeMap = Object.freeze({
    "text/plain; charset=utf-8": "text/plain",
    "text/markdown; charset=utf-8": "text/markdown",
    "application/json": "application/json",
  });
  if (!Array.isArray(inputs) || inputs.some((input) => !roleMap[input.role] || !mediaTypeMap[input.media_type])) {
    fail("workflow_runner_input_mapping_invalid");
  }
  return {
    schema: WORKFLOW_REQUEST_SCHEMA,
    job_id: job.job_id,
    idempotency_key: job.idempotency_key,
    workflow_id: WORKFLOW_ID,
    workflow_binding_revision: WORKFLOW_BINDING_REVISION,
    mode: job.mode,
    project_code: job.project_code,
    actor_ref: `erp-account:${job.actor_account_id}`,
    input_refs: inputs.map((input) => ({
      role: roleMap[input.role],
      payload_ref: input.body_ref,
      sha256: input.body_sha256,
      size: input.body_size,
      media_type: mediaTypeMap[input.media_type],
    })),
    report_type: job.report_type,
    audience: job.audience,
    output_formats: ["md", "html"],
    boundary_policy: WORKFLOW_BOUNDARY_POLICY,
    acceptance_profile: WORKFLOW_ACCEPTANCE_PROFILE,
  };
}

export function validatePassReceipt(receipt, expectedRole) {
  exactObject(receipt, [
    "schema", "role", "operation_id", "operation_nonce_sha256", "process_instance_id", "child_pid",
    "started_at", "finished_at", "terminated_at", "bundle_sha256", "input_sha256", "output_sha256",
    "permission_profile_revision", "skills", "instruction_sources", "sandbox_mode", "writable_roots",
    "network_access", "approval_policy", "context_sha256", "receipt_sha256",
  ], "workflow_pass_receipt_fields_invalid");
  if (receipt.schema !== "dev_erp.workflow_pass_receipt.v1") fail("workflow_pass_receipt_schema_invalid");
  if (receipt.role !== expectedRole || !["author", "verifier"].includes(receipt.role)) fail("workflow_pass_role_invalid");
  exactString(receipt.operation_id, WORKFLOW_OPERATION_ID_RE, "workflow_pass_operation_invalid");
  for (const field of ["operation_nonce_sha256", "bundle_sha256", "input_sha256", "output_sha256", "permission_profile_revision", "context_sha256", "receipt_sha256"]) {
    exactString(receipt[field], SHA256_RE, "workflow_pass_hash_invalid");
  }
  if (typeof receipt.process_instance_id !== "string" || receipt.process_instance_id.length < 1 || receipt.process_instance_id.length > 128) fail("workflow_pass_process_invalid");
  if (receipt.child_pid !== null && (!Number.isSafeInteger(receipt.child_pid) || receipt.child_pid < 1)) fail("workflow_pass_pid_invalid");
  for (const field of ["started_at", "finished_at", "terminated_at"]) {
    if (typeof receipt[field] !== "string" || !Number.isFinite(Date.parse(receipt[field]))) fail("workflow_pass_time_invalid");
  }
  if (!(Date.parse(receipt.started_at) <= Date.parse(receipt.finished_at)
    && Date.parse(receipt.finished_at) <= Date.parse(receipt.terminated_at))) fail("workflow_pass_time_invalid");
  if (!Array.isArray(receipt.skills) || receipt.skills.length !== 0) fail("workflow_pass_skills_not_empty");
  if (!Array.isArray(receipt.instruction_sources) || receipt.instruction_sources.length !== 0) fail("workflow_pass_instruction_sources_not_empty");
  if (!Array.isArray(receipt.writable_roots) || receipt.writable_roots.length !== 0) fail("workflow_pass_writable_roots_not_empty");
  if (receipt.sandbox_mode !== "read-only" || receipt.network_access !== false || receipt.approval_policy !== "never") {
    fail("workflow_pass_permission_boundary_invalid");
  }
  const { receipt_sha256: claimedReceiptSha256, ...receiptPayload } = receipt;
  if (sha256Canonical(receiptPayload) !== claimedReceiptSha256) {
    fail("workflow_pass_receipt_digest_invalid");
  }
  return receipt;
}

export function validateSeparatedPassReceipts(authorReceipt, verifierReceipt, expectedBundleSha256) {
  validatePassReceipt(authorReceipt, "author");
  validatePassReceipt(verifierReceipt, "verifier");
  if (authorReceipt.bundle_sha256 !== expectedBundleSha256 || verifierReceipt.bundle_sha256 !== expectedBundleSha256) {
    fail("workflow_pass_bundle_mismatch");
  }
  if (authorReceipt.process_instance_id === verifierReceipt.process_instance_id
    || authorReceipt.context_sha256 === verifierReceipt.context_sha256
    || authorReceipt.operation_id === verifierReceipt.operation_id
    || (authorReceipt.child_pid !== null && verifierReceipt.child_pid !== null && authorReceipt.child_pid === verifierReceipt.child_pid)) {
    fail("workflow_pass_process_not_separate");
  }
  if (Date.parse(authorReceipt.terminated_at) > Date.parse(verifierReceipt.started_at)) {
    fail("workflow_author_not_terminated_before_verifier");
  }
  if (verifierReceipt.input_sha256 !== authorReceipt.output_sha256) fail("workflow_verifier_input_not_bound");
  return { author: authorReceipt, verifier: verifierReceipt };
}

export function evaluateWorkflowDeploymentAttestation({
  routeEnabled,
  attestation,
  expectedAttestationSha256,
  sourceCommit,
  expectedBundleSha256,
  erpIdentitySha256,
  workerIdentitySha256,
  passRunnerRelease,
  runnerAvailable,
  actualProbePassed = false,
  now = new Date(),
}) {
  const blockers = [];
  if (routeEnabled !== true) blockers.push("workflow_jobs_default_off");
  if (runnerAvailable !== true) blockers.push("workflow_runner_unavailable");
  if (actualProbePassed !== true) blockers.push("workflow_actual_probe_missing");
  if (!attestation) blockers.push("deployment_attestation_missing");
  if (!SHA256_RE.test(String(expectedAttestationSha256 || ""))) blockers.push("deployment_attestation_digest_unpinned");
  if (!SHA256_RE.test(String(expectedBundleSha256 || ""))) blockers.push("workflow_bundle_digest_unpinned");
  if (!SHA256_RE.test(String(erpIdentitySha256 || ""))) blockers.push("erp_service_identity_unavailable");
  if (!SHA256_RE.test(String(workerIdentitySha256 || ""))) blockers.push("worker_service_identity_unavailable");
  if (!passRunnerRelease) blockers.push("workflow_pass_runner_unavailable");
  if (!attestation) return { enabled: false, blockers: [...new Set(blockers)] };

  try {
    exactObject(attestation, [
      "schema", "source_commit", "bundle_sha256", "allowlist_sha256", "erp_service_identity_sha256",
      "worker_service_identity_sha256", "pass_runner_release", "pass_runner_identity_sha256",
      "payload_owner_revision", "payload_deny_revision", "receipt_root_revision", "acl_probe_revision",
      "acl_probe_result", "machine_identity_sha256", "approved_by", "issued_at", "expires_at",
    ], "deployment_attestation_fields_invalid");
    if (attestation.schema !== WORKFLOW_DEPLOYMENT_ATTESTATION_SCHEMA) fail("deployment_attestation_schema_invalid");
    for (const field of [
      "bundle_sha256", "allowlist_sha256", "erp_service_identity_sha256", "worker_service_identity_sha256",
      "pass_runner_identity_sha256", "payload_owner_revision", "payload_deny_revision", "receipt_root_revision",
      "acl_probe_revision", "machine_identity_sha256",
    ]) exactString(attestation[field], SHA256_RE, "deployment_attestation_hash_invalid");
    if (!/^[a-f0-9]{40}$/.test(attestation.source_commit)) fail("deployment_attestation_commit_invalid");
    if (attestation.acl_probe_result !== "passed") fail("deployment_attestation_acl_unproven");
    if (attestation.approved_by !== "owner") fail("deployment_attestation_owner_unapproved");
    if (!Number.isFinite(Date.parse(attestation.issued_at)) || !Number.isFinite(Date.parse(attestation.expires_at))) fail("deployment_attestation_time_invalid");
  } catch (error) {
    blockers.push(error instanceof WorkflowJobError ? error.code : "deployment_attestation_invalid");
    return { enabled: false, blockers: [...new Set(blockers)] };
  }

  if (sha256Canonical(attestation) !== expectedAttestationSha256) blockers.push("deployment_attestation_digest_mismatch");
  if (attestation.source_commit !== sourceCommit) blockers.push("deployment_attestation_commit_mismatch");
  if (attestation.bundle_sha256 !== expectedBundleSha256) blockers.push("deployment_attestation_bundle_mismatch");
  if (attestation.erp_service_identity_sha256 !== erpIdentitySha256) blockers.push("deployment_attestation_erp_identity_mismatch");
  if (attestation.worker_service_identity_sha256 !== workerIdentitySha256) blockers.push("deployment_attestation_worker_identity_mismatch");
  if (attestation.erp_service_identity_sha256 === attestation.worker_service_identity_sha256) blockers.push("deployment_attestation_identities_not_separate");
  if (attestation.pass_runner_release !== passRunnerRelease) blockers.push("deployment_attestation_pass_runner_mismatch");
  if (Date.parse(attestation.expires_at) <= now.getTime()) blockers.push("deployment_attestation_expired");
  if (Date.parse(attestation.issued_at) > now.getTime() + 60_000) blockers.push("deployment_attestation_not_yet_valid");
  return { enabled: blockers.length === 0, blockers: [...new Set(blockers)] };
}
