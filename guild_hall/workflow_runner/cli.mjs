#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFilesystemArtifactAdapter } from "./artifact_store.mjs";
import { canonicalJson, sha256Canonical } from "./canonical.mjs";
import { loadStaticWorkflowBinding } from "./catalog.mjs";
import {
  validateExecutorStageResult,
  validateProtectedBaselineResult,
  validateReportDocument,
  validateSemanticVerifierResult,
  validateWorkflowJobOutcome,
  validateWorkflowJobRequest,
} from "./contract.mjs";
import { WorkflowRunnerError, fail } from "./errors.mjs";
import { createFilesystemIdentityAuthorityAdapter, issueLocalIdentityAuthorityRecord } from "./identity_authority.mjs";
import { createFilesystemPayloadAdapter } from "./payload_store.mjs";
import { createFilesystemReceiptAdapter } from "./receipt_store.mjs";
import { runWorkflowJob } from "./runner.mjs";
import { validateSchemaContract } from "./schema_runtime.mjs";
import { createFilesystemStateAdapter } from "./state_machine.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const OPAQUE_REF = /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;

function exactObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("cli_contract_type", `${label} must be an object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail("cli_contract_unknown_field", `Unknown ${label} field: ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) fail("cli_contract_missing_field", `Missing ${label} field: ${key}`);
}

function parseOptions(tokens, allowed) {
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!allowed.has(flag) || value === undefined || value.startsWith("--") || Object.hasOwn(values, flag)) {
      fail("cli_argument_invalid", `Invalid or duplicate CLI argument: ${flag ?? "<missing>"}`);
    }
    values[flag] = value;
  }
  for (const flag of allowed) if (!Object.hasOwn(values, flag)) fail("cli_argument_missing", `Missing CLI argument: ${flag}`);
  return values;
}

async function readJsonFile(target) {
  if (typeof target !== "string" || !path.isAbsolute(target)) fail("cli_path_not_absolute", "CLI JSON input paths must be absolute");
  const metadata = await fs.lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail("cli_input_not_regular_file", "CLI JSON input must be a non-symlink regular file");
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    fail("cli_json_invalid", `Invalid JSON input: ${path.basename(target)}`);
  }
}

function confined(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function prepareCommand(tokens) {
  const options = parseOptions(tokens, new Set(["--request"]));
  const requestValue = await readJsonFile(options["--request"]);
  await validateSchemaContract("request", requestValue);
  const request = validateWorkflowJobRequest(requestValue);
  const loaded = await loadStaticWorkflowBinding({ workflowId: request.workflow_id, mode: request.mode });
  if (request.workflow_binding_revision !== loaded.binding.binding_revision) fail("request_binding_revision_mismatch", "Request binding revision is not trusted");
  const preparedOutputs = ["protected_baseline", "draft", "technical_content", "evidence_logic", "derive_executive_summary", "final_polish", "semantic_verifier"];
  const packet = {
    schema: "soulforge.workflow_execution_packet.v1",
    request_sha256: sha256Canonical(request),
    workflow_id: request.workflow_id,
    mode: request.mode,
    binding_revision: loaded.binding.binding_revision,
    workflow_bundle_sha256: loaded.bundleDigest,
    inner_runner: { skills_enabled: false, model_api_available: false, arbitrary_module_loading: false },
    contract_refs: {
      request: ".workflow/report_authoring_v0/contracts/workflow_job_request.v1.schema.json",
      finalize_config: ".workflow/report_authoring_v0/contracts/workflow_cli_finalize.v1.schema.json",
      issue_authority_config: ".workflow/report_authoring_v0/contracts/workflow_cli_issue_authority.v1.schema.json",
      identity_authority_record: ".workflow/report_authoring_v0/contracts/identity_authority_record.v1.schema.json",
    },
    prepared_outputs_required: preparedOutputs,
    authority_issue_config_skeleton: {
      schema: "soulforge.workflow_cli_issue_authority.v1",
      request,
      expected_workflow_bundle_sha256: loaded.bundleDigest,
      final_rewriter: null,
      semantic_verifier: null,
      controller: null,
    },
    finalize_config_skeleton: {
      schema: "soulforge.workflow_cli_finalize.v1",
      request,
      expected_workflow_bundle_sha256: loaded.bundleDigest,
      payload_bindings: null,
      allowed_payload_roots: null,
      artifact_root: null,
      artifact_storage_class: "workspace_system",
      owner_approval_ref: null,
      state_root: null,
      identity_authority_record_sha256: null,
      prepared: Object.fromEntries(preparedOutputs.map((stage) => [stage, null])),
    },
    note: "Codex or a future approved worker adapter must produce the prepared stage outputs; this Node runner does not call a model.",
  };
  await validateSchemaContract("execution_packet", packet);
  return packet;
}

async function validateCommand(tokens) {
  const options = parseOptions(tokens, new Set(["--kind", "--input"]));
  const value = await readJsonFile(options["--input"]);
  const validators = new Map([
    ["request", ["request", validateWorkflowJobRequest]],
    ["protected-baseline", [null, validateProtectedBaselineResult]],
    ["report-document", ["report_document", validateReportDocument]],
    ["executor-stage", [null, validateExecutorStageResult]],
    ["semantic-verifier", ["semantic_verifier", validateSemanticVerifierResult]],
    ["outcome", ["outcome", validateWorkflowJobOutcome]],
  ]);
  const entry = validators.get(options["--kind"]);
  if (!entry) fail("cli_validate_kind_invalid", "validate --kind is not in the fixed allowlist");
  const [schemaKind, validator] = entry;
  if (schemaKind) await validateSchemaContract(schemaKind, value);
  validator(value);
  return { schema: "soulforge.workflow_validation_result.v1", status: "pass", kind: options["--kind"], input_sha256: sha256Canonical(value) };
}

function validateFinalizeConfig(config) {
  exactObject(config, [
    "schema",
    "request",
    "expected_workflow_bundle_sha256",
    "payload_bindings",
    "allowed_payload_roots",
    "artifact_root",
    "artifact_storage_class",
    "owner_approval_ref",
    "state_root",
    "identity_authority_record_sha256",
    "prepared",
  ], "finalize config");
  if (config.schema !== "soulforge.workflow_cli_finalize.v1") fail("cli_finalize_schema_invalid", "Unknown finalize config schema");
  validateWorkflowJobRequest(config.request);
  if (typeof config.expected_workflow_bundle_sha256 !== "string" || !SHA256.test(config.expected_workflow_bundle_sha256)) fail("cli_expected_bundle_digest_invalid", "expected_workflow_bundle_sha256 must be SHA-256");
  if (!config.payload_bindings || typeof config.payload_bindings !== "object" || Array.isArray(config.payload_bindings)) fail("cli_payload_bindings_invalid", "payload_bindings must be an object");
  if (!Array.isArray(config.allowed_payload_roots) || config.allowed_payload_roots.length < 1) fail("cli_payload_roots_invalid", "allowed_payload_roots must be non-empty");
  for (const value of [...config.allowed_payload_roots, config.artifact_root, config.state_root]) {
    if (typeof value !== "string" || !path.isAbsolute(value)) fail("cli_runtime_path_invalid", "Finalize runtime paths must be absolute");
  }
  const approvedStateRoot = path.join(REPOSITORY_ROOT, "_workspaces", "system");
  if (!confined(approvedStateRoot, path.resolve(config.state_root))) fail("cli_state_root_forbidden", "Durable state must be under _workspaces/system");
  if (!new Set(["workspace_system", "owner_approved_shared_worksite"]).has(config.artifact_storage_class)) fail("cli_artifact_storage_class_invalid", "Unknown artifact storage class");
  if (config.owner_approval_ref !== null && (typeof config.owner_approval_ref !== "string" || !OPAQUE_REF.test(config.owner_approval_ref))) fail("cli_owner_approval_ref_invalid", "owner_approval_ref must be null or opaque");
  if (typeof config.identity_authority_record_sha256 !== "string" || !SHA256.test(config.identity_authority_record_sha256)) fail("cli_identity_authority_record_digest_invalid", "identity_authority_record_sha256 must be SHA-256");
  exactObject(config.prepared, ["protected_baseline", "draft", "technical_content", "evidence_logic", "derive_executive_summary", "final_polish", "semantic_verifier"], "prepared");
  for (const stage of ["protected_baseline", "draft", "technical_content", "evidence_logic", "derive_executive_summary", "final_polish"]) {
    if (config.prepared[stage] !== null) {
      if (stage === "protected_baseline") validateProtectedBaselineResult(config.prepared[stage]);
      else validateExecutorStageResult(config.prepared[stage], `$prepared.${stage}`);
    }
  }
  validateSemanticVerifierResult(config.prepared.semantic_verifier);
  return config;
}

async function finalizeCommand(tokens) {
  const options = parseOptions(tokens, new Set(["--config"]));
  const configValue = await readJsonFile(options["--config"]);
  await validateSchemaContract("finalize_config", configValue);
  const config = validateFinalizeConfig(configValue);
  const prepared = config.prepared;
  const executorAdapter = {
    async buildProtectedBaseline() {
      if (prepared.protected_baseline === null) fail("cli_prepared_baseline_missing", "Prepared baseline is required when no manifest input is bound");
      return prepared.protected_baseline;
    },
    async runStage({ stage }) {
      const result = prepared[stage];
      if (result === null || result === undefined) fail("cli_prepared_stage_missing", `Prepared stage is missing: ${stage}`);
      return result;
    },
  };
  const verifierAdapter = { async verify() { return prepared.semantic_verifier; } };
  const identityAdapter = createFilesystemIdentityAuthorityAdapter({
    repositoryRoot: REPOSITORY_ROOT,
    recordSha256: config.identity_authority_record_sha256,
  });
  const adapters = {
    preparedResultsOnly: true,
    stateAdapter: createFilesystemStateAdapter({ root: config.state_root, repositoryRoot: REPOSITORY_ROOT }),
    payloadAdapter: createFilesystemPayloadAdapter({ bindings: config.payload_bindings, allowedRoots: config.allowed_payload_roots }),
    executorAdapter,
    verifierAdapter,
    identityAdapter,
    artifactAdapter: createFilesystemArtifactAdapter({
      root: config.artifact_root,
      storageClass: config.artifact_storage_class,
      ownerApprovalRef: config.owner_approval_ref,
      repositoryRoot: REPOSITORY_ROOT,
    }),
    receiptAdapter: createFilesystemReceiptAdapter({
      workmetaRoot: path.join(REPOSITORY_ROOT, "_workmeta"),
      allowedProjectCodes: [config.request.project_code],
      repositoryRoot: REPOSITORY_ROOT,
    }),
  };
  return runWorkflowJob(config.request, adapters, { expectedBundleDigest: config.expected_workflow_bundle_sha256 });
}

async function issueAuthorityCommand(tokens) {
  const options = parseOptions(tokens, new Set(["--config"]));
  const config = await readJsonFile(options["--config"]);
  await validateSchemaContract("issue_authority_config", config);
  const request = validateWorkflowJobRequest(config.request);
  const loaded = await loadStaticWorkflowBinding({
    workflowId: request.workflow_id,
    mode: request.mode,
    expectedBundleDigest: config.expected_workflow_bundle_sha256,
  });
  if (request.workflow_binding_revision !== loaded.binding.binding_revision) fail("request_binding_revision_mismatch", "Request binding revision is not trusted");
  return issueLocalIdentityAuthorityRecord({
    repositoryRoot: REPOSITORY_ROOT,
    request,
    workflowBundleSha256: loaded.bundleDigest,
    finalRewriter: config.final_rewriter,
    verifier: config.semantic_verifier,
    controller: config.controller,
  });
}

async function recoveryCommand(tokens) {
  const options = parseOptions(tokens, new Set(["--state-root", "--job-id"]));
  if (!path.isAbsolute(options["--state-root"]) || !SAFE_ID.test(options["--job-id"])) fail("cli_recovery_argument_invalid", "Recovery requires an absolute state root and safe job id");
  const approvedStateRoot = path.join(REPOSITORY_ROOT, "_workspaces", "system");
  if (!confined(approvedStateRoot, path.resolve(options["--state-root"]))) fail("cli_state_root_forbidden", "Recovery state must be under _workspaces/system");
  const snapshot = await createFilesystemStateAdapter({ root: options["--state-root"], repositoryRoot: REPOSITORY_ROOT }).snapshot(options["--job-id"]);
  if (!snapshot) fail("cli_recovery_job_missing", "No durable job state exists");
  const status = snapshot.outcome?.recovery?.status ?? (snapshot.state.status === "running" ? "interrupted_inspection_required" : "no_recorded_recovery");
  const receiptReadyForAdoption = status === "manual_required" && snapshot.outcome?.recovery?.receipt_confirmation !== null;
  return {
    schema: "soulforge.workflow_recovery_status.v1",
    job_id: options["--job-id"],
    state: snapshot.state,
    recovery_status: status,
    next_action: status === "rolled_back" ? "submit_new_job_id" : receiptReadyForAdoption ? "owner_review_then_adopt_confirmed_receipt" : status === "manual_required" ? "owner_review_required" : "inspect_terminal_outcome",
  };
}

async function main(argv) {
  const [command, ...tokens] = argv;
  const commands = new Map([
    ["prepare", prepareCommand],
    ["validate", validateCommand],
    ["finalize", finalizeCommand],
    ["issue-authority", issueAuthorityCommand],
    ["recovery", recoveryCommand],
  ]);
  const handler = commands.get(command);
  if (!handler) fail("cli_subcommand_invalid", "Use exactly one of: prepare, validate, issue-authority, finalize, recovery");
  const result = await handler(tokens);
  process.stdout.write(`${canonicalJson(result)}\n`);
}

main(process.argv.slice(2)).catch((error) => {
  const code = error instanceof WorkflowRunnerError ? error.code : "workflow_runner_error";
  process.stderr.write(`${canonicalJson({ schema: "soulforge.workflow_cli_error.v1", status: "blocked", code })}\n`);
  process.exitCode = 1;
});
