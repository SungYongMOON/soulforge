import fs from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import {
  validateExecutorStageResult,
  validateIdentityAuthorityRecord,
  validateSemanticVerifierResult,
  validateWorkflowJobRequest,
} from "./contract.mjs";
import { fail } from "./errors.mjs";
import { validateSchemaContract } from "./schema_runtime.mjs";

const SHA256 = /^[a-f0-9]{64}$/;

function exactObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("identity_authority_issue_contract_invalid", `${label} must be an object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail("identity_authority_issue_unknown_field", `Unknown ${label} field: ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) fail("identity_authority_issue_missing_field", `Missing ${label} field: ${key}`);
}

function confined(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function assertNoLinkedPath(base, target, fsOps) {
  const relative = path.relative(base, target);
  let current = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const metadata = await fsOps.lstat(current);
    if (metadata.isSymbolicLink()) fail("identity_authority_path_link_forbidden", `Identity authority path contains a link or junction: ${segment}`);
    if (current !== target && !metadata.isDirectory()) fail("identity_authority_path_component_invalid", `Identity authority path component is not a directory: ${segment}`);
  }
}

export function identityAuthorityRecordPath(repositoryRoot, recordSha256) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) fail("identity_authority_repository_root_invalid", "Identity authority requires an absolute repository root");
  if (typeof recordSha256 !== "string" || !SHA256.test(recordSha256)) fail("identity_authority_record_digest_invalid", "Identity authority record digest must be SHA-256");
  return path.join(path.resolve(repositoryRoot), "_workspaces", "system", "workflow_runner", "identity_authority", "records", `${recordSha256}.json`);
}

export function createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256, fsOps = fs }) {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  const recordsRoot = path.join(resolvedRepositoryRoot, "_workspaces", "system", "workflow_runner", "identity_authority", "records");
  const recordPath = identityAuthorityRecordPath(resolvedRepositoryRoot, recordSha256);

  return {
    async verifySeparation({ request, workflowBundleSha256, finalRewriter, verifier }) {
      const repositoryMetadata = await fsOps.lstat(resolvedRepositoryRoot);
      if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) fail("identity_authority_repository_identity_invalid", "Repository root must be a non-link directory");
      try {
        await assertNoLinkedPath(resolvedRepositoryRoot, recordPath, fsOps);
      } catch (error) {
        if (error?.code === "ENOENT") fail("identity_authority_record_missing", "The configured identity authority record does not exist in the fixed trusted root");
        throw error;
      }
      const realRepositoryRoot = await fsOps.realpath(resolvedRepositoryRoot);
      const realRecordsRoot = await fsOps.realpath(recordsRoot);
      const realRecordPath = await fsOps.realpath(recordPath);
      const expectedRealRecordsRoot = path.join(realRepositoryRoot, "_workspaces", "system", "workflow_runner", "identity_authority", "records");
      if (realRecordsRoot !== expectedRealRecordsRoot || !confined(realRecordsRoot, realRecordPath)) fail("identity_authority_path_escape", "Identity authority record escaped the fixed trusted record root");
      const metadata = await fsOps.lstat(realRecordPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) fail("identity_authority_record_identity_invalid", "Identity authority record must be a non-link regular file");
      const bytes = await fsOps.readFile(realRecordPath);
      if (sha256Bytes(bytes) !== recordSha256) fail("identity_authority_record_hash_mismatch", "Identity authority record bytes do not match the configured digest");
      let record;
      try {
        record = JSON.parse(bytes.toString("utf8"));
        await validateSchemaContract("identity_authority_record", record);
        record = validateIdentityAuthorityRecord(record);
      } catch (error) {
        if (error?.code) throw error;
        fail("identity_authority_record_json_invalid", "Identity authority record is not valid JSON");
      }
      const canonicalBytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
      if (!canonicalBytes.equals(bytes)) fail("identity_authority_record_not_canonical", "Identity authority record must use canonical JSON bytes");
      if (record.identity_claim !== "local_context_separation_declared" || record.authority.deployment_attestation_ref !== null) {
        fail("identity_authority_deployment_claim_untrusted", "The filesystem authority adapter verifies exact result/hash bindings and caller-declared distinct refs only; deployment identity requires a separately trusted verifier");
      }

      const requestSha256 = sha256Canonical(request);
      const candidateDocumentSha256 = sha256Canonical(finalRewriter.document);
      if (record.request_sha256 !== requestSha256
        || record.workflow_bundle_sha256 !== workflowBundleSha256
        || record.candidate_document_sha256 !== candidateDocumentSha256) {
        fail("identity_authority_execution_binding_mismatch", "Identity authority record is not bound to this request, bundle, and candidate");
      }
      const bindings = [
        [record.author_pass_receipt, finalRewriter, "identity_authority_author_receipt_mismatch"],
        [record.verifier_pass_receipt, verifier, "identity_authority_verifier_receipt_mismatch"],
      ];
      for (const [receipt, execution, code] of bindings) {
        if (receipt.actor_ref !== execution.actor_ref
          || receipt.run_ref !== execution.run_ref
          || receipt.context_ref !== execution.context_ref
          || receipt.identity_attestation_ref !== execution.identity_attestation_ref
          || receipt.result_sha256 !== sha256Canonical(execution)) {
          fail(code, "Identity pass receipt does not match the exact execution result and identity refs");
        }
      }
      if (record.verifier_pass_receipt.completed_at !== verifier.completed_at) {
        fail("identity_authority_verifier_time_mismatch", "Verifier receipt time does not match the verifier result");
      }
      return {
        status: "pass",
        authority_ref: record.authority.authority_ref,
        authority_record_sha256: recordSha256,
        identity_claim: record.identity_claim,
        deployment_attestation_ref: record.authority.deployment_attestation_ref,
        author_pass_receipt_sha256: sha256Canonical(record.author_pass_receipt),
        verifier_pass_receipt_sha256: sha256Canonical(record.verifier_pass_receipt),
      };
    },
  };
}

export async function issueLocalIdentityAuthorityRecord({ repositoryRoot, request, workflowBundleSha256, finalRewriter, verifier, controller, fsOps = fs }) {
  const resolvedRepositoryRoot = path.resolve(repositoryRoot);
  validateWorkflowJobRequest(request);
  validateExecutorStageResult(finalRewriter, "$identity_issue.final_rewriter");
  if (finalRewriter.pass_record?.stage !== "final_polish" || finalRewriter.pass_record.status !== "pass") fail("identity_authority_author_pass_invalid", "Authority issuance requires the exact passing final-polish result");
  validateSemanticVerifierResult(verifier);
  if (typeof workflowBundleSha256 !== "string" || !SHA256.test(workflowBundleSha256)) fail("identity_authority_bundle_digest_invalid", "Authority issuance requires the exact workflow bundle SHA-256");
  if (verifier.status !== "pass") fail("identity_authority_verifier_not_passed", "Authority issuance requires a passing semantic verifier result");
  const candidateDocumentSha256 = sha256Canonical(finalRewriter.document);
  if (verifier.candidate_document_sha256 !== candidateDocumentSha256) fail("identity_authority_candidate_hash_mismatch", "Verifier result is not bound to the final-rewriter document");
  const requestedInputs = new Map(request.input_refs.map((ref) => [`${ref.role}\u0000${ref.payload_ref}`, ref.sha256]));
  if (verifier.checked_inputs.length !== requestedInputs.size) fail("identity_authority_checked_inputs_incomplete", "Verifier did not check every request input before authority issuance");
  for (const checked of verifier.checked_inputs) {
    if (requestedInputs.get(`${checked.role}\u0000${checked.payload_ref}`) !== checked.sha256) fail("identity_authority_checked_input_mismatch", "Verifier checked-input evidence differs from the request");
  }
  exactObject(controller, [
    "record_id",
    "authority_ref",
    "actor_ref",
    "run_ref",
    "context_ref",
    "identity_attestation_ref",
    "process_ref",
    "author_pass_process_ref",
    "verifier_pass_process_ref",
    "author_completed_at",
    "recorded_at",
  ], "controller");
  const requestSha256 = sha256Canonical(request);
  const record = validateIdentityAuthorityRecord({
    schema: "soulforge.workflow_identity_authority_record.v1",
    record_id: controller.record_id,
    status: "pass",
    identity_claim: "local_context_separation_declared",
    request_sha256: requestSha256,
    workflow_bundle_sha256: workflowBundleSha256,
    candidate_document_sha256: candidateDocumentSha256,
    author_pass_receipt: {
      role: "final_rewriter",
      sequence: 1,
      actor_ref: finalRewriter.actor_ref,
      run_ref: finalRewriter.run_ref,
      context_ref: finalRewriter.context_ref,
      identity_attestation_ref: finalRewriter.identity_attestation_ref,
      pass_process_ref: controller.author_pass_process_ref,
      request_sha256: requestSha256,
      workflow_bundle_sha256: workflowBundleSha256,
      candidate_document_sha256: candidateDocumentSha256,
      result_sha256: sha256Canonical(finalRewriter),
      completed_at: controller.author_completed_at,
    },
    verifier_pass_receipt: {
      role: "semantic_verifier",
      sequence: 2,
      actor_ref: verifier.actor_ref,
      run_ref: verifier.run_ref,
      context_ref: verifier.context_ref,
      identity_attestation_ref: verifier.identity_attestation_ref,
      pass_process_ref: controller.verifier_pass_process_ref,
      request_sha256: requestSha256,
      workflow_bundle_sha256: workflowBundleSha256,
      candidate_document_sha256: candidateDocumentSha256,
      result_sha256: sha256Canonical(verifier),
      completed_at: verifier.completed_at,
    },
    authority: {
      authority_ref: controller.authority_ref,
      actor_ref: controller.actor_ref,
      run_ref: controller.run_ref,
      context_ref: controller.context_ref,
      identity_attestation_ref: controller.identity_attestation_ref,
      process_ref: controller.process_ref,
      recorded_at: controller.recorded_at,
      deployment_attestation_ref: null,
    },
  });
  await validateSchemaContract("identity_authority_record", record);
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const digest = sha256Bytes(bytes);
  const target = identityAuthorityRecordPath(resolvedRepositoryRoot, digest);
  const recordsRoot = path.dirname(target);
  const repositoryMetadata = await fsOps.lstat(resolvedRepositoryRoot);
  if (!repositoryMetadata.isDirectory() || repositoryMetadata.isSymbolicLink()) fail("identity_authority_repository_identity_invalid", "Repository root must be a non-link directory");
  let current = resolvedRepositoryRoot;
  for (const segment of path.relative(resolvedRepositoryRoot, recordsRoot).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const metadata = await fsOps.lstat(current);
      if (metadata.isSymbolicLink()) fail("identity_authority_path_link_forbidden", `Identity authority path contains a link or junction: ${segment}`);
      if (!metadata.isDirectory()) fail("identity_authority_path_component_invalid", `Identity authority path component is not a directory: ${segment}`);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  await fsOps.mkdir(recordsRoot, { recursive: true });
  await assertNoLinkedPath(resolvedRepositoryRoot, recordsRoot, fsOps);
  const realRepositoryRoot = await fsOps.realpath(resolvedRepositoryRoot);
  const realRecordsRoot = await fsOps.realpath(recordsRoot);
  if (realRecordsRoot !== path.join(realRepositoryRoot, "_workspaces", "system", "workflow_runner", "identity_authority", "records")) fail("identity_authority_path_escape", "Identity authority record root escaped the repository");
  try {
    await fsOps.writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await fsOps.readFile(target);
    if (!existing.equals(bytes)) fail("identity_authority_existing_record_mismatch", "Existing authority record does not match the canonical bytes");
  }
  return {
    schema: "soulforge.workflow_identity_authority_issue_result.v1",
    status: "pass",
    identity_claim: "local_context_separation_declared",
    deployment_attestation_ref: null,
    authority_ref: record.authority.authority_ref,
    identity_authority_record_sha256: digest,
  };
}
