import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { scanFinalReportBoundary } from "./boundary.mjs";
import {
  validateExecutorStageResult,
  validateProtectedBaselineResult,
  validateReportDocument,
  validateSemanticManifest,
  validateSemanticVerifierResult,
  validateWorkflowJobResult,
} from "./contract.mjs";
import { fail } from "./errors.mjs";
import {
  assertManifestCoversLexicalInventory,
  extractAdoptedClaimInventory,
  extractDraftLexicalInventory,
  verifyLexicalInventoryPreserved,
} from "./lexical_guard.mjs";
import { renderReportPair } from "./render_report_pair.mjs";
import { validateSchemaContract } from "./schema_runtime.mjs";
import { runDeterministicPreservation } from "./semantic_preservation.mjs";

function parseJsonBytes(bytes, code) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail(code, "Payload is not valid UTF-8 JSON");
  }
}

async function loadInputs(request, payloadAdapter) {
  if (!payloadAdapter || typeof payloadAdapter.read !== "function") {
    fail("payload_adapter_missing", "A payload adapter with read(ref) is required");
  }
  const inputs = new Map();
  for (const ref of request.input_refs) {
    const value = await payloadAdapter.read(ref);
    if (!(Buffer.isBuffer(value) || value instanceof Uint8Array)) {
      fail("payload_adapter_contract", `Payload adapter returned non-bytes for ${ref.role}`);
    }
    const bytes = Buffer.from(value);
    if (bytes.length !== ref.size) fail("payload_size_mismatch", `Payload size mismatch for ${ref.role}`);
    if (sha256Bytes(bytes) !== ref.sha256) fail("payload_hash_mismatch", `Payload hash mismatch for ${ref.role}`);
    inputs.set(ref.role, { ref, bytes });
  }
  return inputs;
}

function readProvidedManifest(inputs) {
  const payload = inputs.get("semantic_manifest");
  if (!payload) return null;
  if (payload.ref.media_type !== "application/json") {
    fail("semantic_manifest_media_type", "semantic_manifest must use application/json");
  }
  const manifest = parseJsonBytes(payload.bytes, "semantic_manifest_json_invalid");
  return validateSemanticManifest(manifest, "$provided_semantic_manifest");
}

function readStructuredDraft(inputs) {
  const payload = inputs.get("draft_report");
  if (!payload || payload.ref.media_type !== "application/json") return null;
  const candidate = parseJsonBytes(payload.bytes, "draft_report_json_invalid");
  try {
    return validateReportDocument(candidate);
  } catch {
    return null;
  }
}

async function buildProtectedBaseline({ request, inputs, providedManifest, executorAdapter, policyBundle }) {
  if (providedManifest) {
    return {
      manifest: providedManifest,
      actor_ref: request.actor_ref,
      run_ref: `run:${request.job_id}:provided-manifest`,
      context_ref: `context:${request.job_id}:provided-manifest`,
      identity_attestation_ref: `attestation:${request.job_id}:request-actor`,
    };
  }
  if (!executorAdapter || typeof executorAdapter.buildProtectedBaseline !== "function") {
    fail("protected_baseline_adapter_missing", "The workflow must generate a protected baseline when no optional manifest is provided");
  }
  return validateProtectedBaselineResult(await executorAdapter.buildProtectedBaseline({
    stage: "protected_claim_baseline",
    request,
    inputs,
    policy_bundle: policyBundle,
  }));
}

async function runExecutorStage(executorAdapter, stage, context) {
  if (!executorAdapter || typeof executorAdapter.runStage !== "function") {
    fail("executor_adapter_missing", "An executor adapter with runStage is required");
  }
  const rawResult = await executorAdapter.runStage({ stage, ...context });
  await validateSchemaContract("report_document", rawResult?.document);
  const result = validateExecutorStageResult(rawResult, `$${stage}_result`);
  if (stage === "draft") {
    if (result.pass_record !== null) fail("draft_pass_record_forbidden", "Drafting is not an editorial acceptance pass");
  } else if (!result.pass_record || result.pass_record.stage !== stage || result.pass_record.status !== "pass") {
    fail("editorial_pass_not_closed", `Stage ${stage} requires its exact passing self-check record`);
  }
  if (result.pass_record) await validateSchemaContract("editorial_pass", result.pass_record);
  return result;
}

const SUMMARY_ROLES = new Set(["executive_summary", "bluf_and_ask"]);
const COMPACT_INTERNAL_PROGRESS_ROLES = Object.freeze([
  "status_summary",
  "issues_risks_dependencies",
  "next_actions",
]);

function bodyProjection(document) {
  return {
    ...document,
    sections: document.sections.filter((section) => !SUMMARY_ROLES.has(section.role)),
  };
}

function summaryAssertionProjection(document) {
  const assertions = [];
  for (const section of document.sections.filter((item) => SUMMARY_ROLES.has(item.role))) {
    for (const block of section.blocks) {
      if (block.type === "paragraph") {
        for (const sentence of block.sentences ?? []) {
          assertions.push({
            section_id: section.section_id,
            block_id: block.block_id,
            sentence_id: sentence.sentence_id,
            sentence_sha256: sha256Bytes(Buffer.from(sentence.text, "utf8")),
            claim_refs: [...sentence.claim_refs],
            source_refs: [...sentence.source_refs],
            citation_refs: [...sentence.citation_refs],
          });
        }
      } else if (block.type === "bullets") {
        for (const item of block.items) {
          assertions.push({
            section_id: section.section_id,
            block_id: block.block_id,
            sentence_id: item.item_id,
            sentence_sha256: sha256Bytes(Buffer.from(item.text, "utf8")),
            claim_refs: [...item.claim_refs],
            source_refs: [...item.source_refs],
            citation_refs: [...(item.citation_refs ?? [])],
          });
        }
      }
    }
  }
  return assertions;
}

function verifySummaryDerivation(bodyDocument, derivedDocument) {
  if (canonicalJson(bodyProjection(bodyDocument)) !== canonicalJson(bodyProjection(derivedDocument))) {
    fail("summary_derivation_changed_verified_body", "Executive summary derivation may not change the verified body or its semantic manifest");
  }
  const summarySections = derivedDocument.sections.filter((section) => SUMMARY_ROLES.has(section.role));
  const sectionRoles = derivedDocument.sections.map((section) => section.role);
  const summaryOptional = (
    derivedDocument.report_type === "other"
      && new Set(["internal_review", "other"]).has(derivedDocument.audience)
      && derivedDocument.sections.length === 6
  ) || (
    derivedDocument.report_type === "progress"
      && derivedDocument.audience === "internal_review"
      && canonicalJson(sectionRoles) === canonicalJson(COMPACT_INTERNAL_PROGRESS_ROLES)
  );
  if (summarySections.length === 0 && summaryOptional) {
    return {
      schema: "soulforge.summary_derivation_record.v1",
      status: "pass",
      verified_body_sha256: sha256Canonical(bodyProjection(bodyDocument)),
      derived_document_sha256: sha256Canonical(derivedDocument),
      body_claim_refs: [],
      summary_assertions: [],
    };
  }
  if (summarySections.length !== 1) fail("summary_derivation_cardinality", "Exactly one report-type summary projection is required unless an exact compact internal form is used");
  const claimRefs = [...new Set(summarySections.flatMap((section) => section.claim_refs))].sort();
  if (claimRefs.length < 1) fail("summary_derivation_claim_path_missing", "Derived summary must carry body claim refs");
  const summaryAssertions = summaryAssertionProjection(derivedDocument);
  if (summaryAssertions.length < 1) fail("summary_derivation_sentence_map_missing", "Derived summary must persist sentence-level claim paths");
  return {
    schema: "soulforge.summary_derivation_record.v1",
    status: "pass",
    verified_body_sha256: sha256Canonical(bodyProjection(bodyDocument)),
    derived_document_sha256: sha256Canonical(derivedDocument),
    body_claim_refs: claimRefs,
    summary_assertions: summaryAssertions,
  };
}

function verifyFinalSummaryBinding(summaryDerivation, finalDocument) {
  const summarySections = finalDocument.sections.filter((section) => SUMMARY_ROLES.has(section.role));
  const finalRefs = [...new Set(summarySections.flatMap((section) => section.claim_refs))].sort();
  if (canonicalJson(finalRefs) !== canonicalJson(summaryDerivation.body_claim_refs)) {
    fail("summary_claim_binding_changed", "Final polish changed the body-claim paths of the derived summary");
  }
  if (canonicalJson(summaryAssertionProjection(finalDocument)) !== canonicalJson(summaryDerivation.summary_assertions)) {
    fail("summary_sentence_binding_changed", "Final polish changed a sentence-level summary assertion or evidence path");
  }
}

function jsonArtifact(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

async function ensureIndependentVerifier(finalRewriter, verdict, identityAdapter, request, workflowBundleSha256) {
  if (finalRewriter.actor_ref === verdict.actor_ref) {
    fail("verifier_actor_not_independent", "Independent semantic verifier actor must differ from the final rewriter");
  }
  if (finalRewriter.run_ref === verdict.run_ref) {
    fail("verifier_run_not_independent", "Independent semantic verifier run must differ from the final rewriter run");
  }
  if (finalRewriter.context_ref === verdict.context_ref) {
    fail("verifier_context_not_independent", "Independent semantic verifier context must differ from the final rewriter context");
  }
  if (finalRewriter.identity_attestation_ref === verdict.identity_attestation_ref) {
    fail("verifier_attestation_not_independent", "Independent semantic verifier must have a distinct identity attestation");
  }
  if (!identityAdapter || typeof identityAdapter.verifySeparation !== "function") {
    fail("identity_attestation_adapter_missing", "A trusted identity-separation adapter is mandatory");
  }
  const attestation = await identityAdapter.verifySeparation({ request, workflowBundleSha256, finalRewriter, verifier: verdict });
  const expectedFields = ["authority_ref", "authority_record_sha256", "author_pass_receipt_sha256", "deployment_attestation_ref", "identity_claim", "status", "verifier_pass_receipt_sha256"];
  if (!attestation
    || Object.keys(attestation).sort().join(",") !== expectedFields.sort().join(",")
    || attestation.status !== "pass"
    || !new Set(["local_context_separation_declared", "deployment_attested_process_separation"]).has(attestation.identity_claim)
    || (attestation.identity_claim === "deployment_attested_process_separation") !== (attestation.deployment_attestation_ref !== null)
    || typeof attestation.authority_ref !== "string"
    || !/^[a-f0-9]{64}$/.test(attestation.authority_record_sha256)
    || !/^[a-f0-9]{64}$/.test(attestation.author_pass_receipt_sha256)
    || !/^[a-f0-9]{64}$/.test(attestation.verifier_pass_receipt_sha256)) {
    fail("identity_attestation_failed", "Identity-separation adapter did not return a fixed authority-record attestation");
  }
  const expectedInputs = new Map(request.input_refs.map((ref) => [`${ref.role}\u0000${ref.payload_ref}`, ref]));
  if (verdict.checked_inputs.length !== expectedInputs.size) fail("verifier_input_coverage_incomplete", "Verifier did not check every bound input");
  for (const checked of verdict.checked_inputs) {
    const expected = expectedInputs.get(`${checked.role}\u0000${checked.payload_ref}`);
    if (!expected || expected.sha256 !== checked.sha256) fail("verifier_input_hash_binding_mismatch", "Verifier input coverage is not hash-bound to the request");
  }
  if (verdict.status !== "pass") {
    fail("independent_semantic_verification_failed", "Independent semantic verification did not pass", { verdict });
  }
  return attestation;
}

function ensureRequestedArtifacts(request, artifactRefs) {
  const roles = new Set(artifactRefs.map((ref) => ref.role));
  for (const format of request.output_formats) {
    const role = format === "md" ? "final_report_md" : "final_report_html";
    if (!roles.has(role)) fail("artifact_format_missing", `Requested output format was not written: ${format}`);
  }
}

function enforceRequestBoundDocument(request, document) {
  if (document.project_code !== request.project_code) {
    fail("document_project_code_request_mismatch", "Final document project_code must exactly match the workflow request");
  }
  if (document.report_type !== request.report_type) {
    fail("document_report_type_request_mismatch", "Final document report_type must exactly match the workflow request");
  }
  if (document.audience !== request.audience) {
    fail("document_audience_request_mismatch", "Final document audience must exactly match the workflow request");
  }
  if (document.boundary.content_classification !== "private_work_product") {
    fail("document_content_classification_not_verified", "v0 has no trusted classification authority and therefore permits private_work_product only");
  }
  const draftOnlyTruth = request.mode === "final_polish"
    && !request.input_refs.some((ref) => ref.role === "source_material");
  if (draftOnlyTruth && document.claim_ceiling !== "observed") {
    fail("document_claim_ceiling_exceeds_draft_only_request", "Draft-only final_polish cannot elevate source truth above observed");
  }
  if (draftOnlyTruth && !new Set(["partial", "unconfirmed"]).has(document.source_record_status)) {
    fail("document_source_record_status_exceeds_draft_only_request", "Draft-only final_polish cannot claim a complete source record");
  }
}

export async function runReportAuthoringHandler({
  request,
  binding,
  policyBundle,
  payloadAdapter,
  executorAdapter,
  verifierAdapter,
  identityAdapter,
  artifactAdapter,
  advance,
  workflowBundleSha256,
  journalPreparedExecution,
}) {
  await advance("intake");
  const inputs = await loadInputs(request, payloadAdapter);
  const providedManifest = readProvidedManifest(inputs);
  const protectedBaseline = await buildProtectedBaseline({ request, inputs, providedManifest, executorAdapter, policyBundle });
  const structuredDraft = request.mode === "final_polish" ? readStructuredDraft(inputs) : null;
  const draftLexicalInventory = request.mode === "final_polish"
    ? extractDraftLexicalInventory(inputs.get("draft_report"), structuredDraft)
    : null;
  if (draftLexicalInventory) assertManifestCoversLexicalInventory(protectedBaseline.manifest, draftLexicalInventory);

  await advance("draft");
  const draft = structuredDraft
    ? { document: structuredDraft, actor_ref: request.actor_ref, run_ref: `run:${request.job_id}:input-draft`, context_ref: `context:${request.job_id}:input-draft`, identity_attestation_ref: `attestation:${request.job_id}:request-actor`, pass_record: null }
    : await runExecutorStage(executorAdapter, "draft", { request, inputs, policyBundle, baselineManifest: protectedBaseline.manifest, document: null });

  await advance("technical_content");
  const technical = await runExecutorStage(executorAdapter, "technical_content", {
    request,
    inputs,
    policyBundle,
    baselineManifest: protectedBaseline.manifest,
    document: draft.document,
  });
  const lexicalInventory = request.mode === "final_polish"
    ? draftLexicalInventory
    : extractAdoptedClaimInventory(technical.document);

  await advance("evidence_logic");
  const evidenceLogic = await runExecutorStage(executorAdapter, "evidence_logic", {
    request,
    inputs,
    policyBundle,
    baselineManifest: protectedBaseline.manifest,
    document: technical.document,
  });

  await advance("derive_executive_summary");
  const summaryDerived = await runExecutorStage(executorAdapter, "derive_executive_summary", {
    request,
    inputs,
    policyBundle,
    baselineManifest: protectedBaseline.manifest,
    document: evidenceLogic.document,
  });
  const summaryDerivation = verifySummaryDerivation(evidenceLogic.document, summaryDerived.document);
  await validateSchemaContract("summary_derivation", summaryDerivation);

  await advance("final_polish");
  const finalRewriter = await runExecutorStage(executorAdapter, "final_polish", {
    request,
    inputs,
    policyBundle,
    baselineManifest: protectedBaseline.manifest,
    document: summaryDerived.document,
  });
  verifyFinalSummaryBinding(summaryDerivation, finalRewriter.document);
  enforceRequestBoundDocument(request, finalRewriter.document);

  await advance("preservation");
  const preservation = runDeterministicPreservation(protectedBaseline.manifest, finalRewriter.document);
  preservation.lexical_guard = verifyLexicalInventoryPreserved(lexicalInventory, finalRewriter.document);
  preservation.editorial_passes = [technical.pass_record, evidenceLogic.pass_record, summaryDerived.pass_record, finalRewriter.pass_record];
  preservation.summary_derivation = summaryDerivation;

  await advance("semantic_verify");
  if (!verifierAdapter || typeof verifierAdapter.verify !== "function") {
    fail("semantic_verifier_adapter_missing", "A separate semantic verifier adapter is mandatory");
  }
  const rawVerdict = await verifierAdapter.verify({
    request,
    checked_input_contract: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
    source_payloads: inputs,
    policy_bundle: policyBundle,
    baseline_manifest: protectedBaseline.manifest,
    final_document: finalRewriter.document,
    deterministic_audit: preservation,
    lexical_inventory: lexicalInventory,
    lexical_audit: preservation.lexical_guard,
    editorial_passes: preservation.editorial_passes,
    summary_derivation: summaryDerivation,
  });
  await validateSchemaContract("semantic_verifier", rawVerdict);
  const verdict = validateSemanticVerifierResult(rawVerdict);
  if (verdict.candidate_document_sha256 !== sha256Canonical(finalRewriter.document) || verdict.baseline_manifest_sha256 !== sha256Canonical(protectedBaseline.manifest)) {
    fail("verifier_artifact_hash_binding_mismatch", "Verifier result is not hash-bound to the candidate and baseline");
  }
  const identityAttestation = await ensureIndependentVerifier(finalRewriter, verdict, identityAdapter, request, workflowBundleSha256);

  await advance("document_validate");
  await validateSchemaContract("report_document", finalRewriter.document);
  validateReportDocument(finalRewriter.document);

  await advance("render");
  const rendered = renderReportPair(finalRewriter.document);

  await advance("boundary");
  const boundaryScan = scanFinalReportBoundary(finalRewriter.document, inputs);
  if (!artifactAdapter || typeof artifactAdapter.writeArtifactSet !== "function") {
    fail("artifact_adapter_missing", "An artifact adapter with writeArtifactSet is required");
  }
  const artifacts = [];
  artifacts.push({ role: "report_document_json", mediaType: "application/json", bytes: jsonArtifact(finalRewriter.document) });
  if (request.output_formats.includes("md")) {
    artifacts.push({ role: "final_report_md", mediaType: "text/markdown", bytes: Buffer.from(rendered.markdown, "utf8") });
  }
  if (request.output_formats.includes("html")) {
    artifacts.push({ role: "final_report_html", mediaType: "text/html", bytes: Buffer.from(rendered.html, "utf8") });
  }
  artifacts.push(
    { role: "protected_semantic_manifest", mediaType: "application/json", bytes: jsonArtifact(protectedBaseline.manifest) },
    { role: "preservation_audit", mediaType: "application/json", bytes: jsonArtifact(preservation) },
    { role: "semantic_verification", mediaType: "application/json", bytes: jsonArtifact(verdict) },
  );
  await validateSchemaContract("semantic_preservation", preservation);
  let preparedExecution = null;
  const artifactWrite = await artifactAdapter.writeArtifactSet({
    jobId: request.job_id,
    projectCode: request.project_code,
    artifacts,
    beforeArtifactCommit: async ({ artifactRefs, storageAttestation }) => {
      ensureRequestedArtifacts(request, artifactRefs);
      const verdictRef = artifactRefs.find((ref) => ref.role === "semantic_verification");
      const result = validateWorkflowJobResult({
        schema: "soulforge.workflow_job_result.v1",
        job_id: request.job_id,
        workflow_id: "report_authoring_v0",
        binding_revision: binding.binding_revision,
        status: "succeeded",
        artifact_refs: artifactRefs,
        preservation: {
          deterministic_status: preservation.status,
          lexical_status: preservation.lexical_guard.status,
          lexical_scope: preservation.lexical_guard.scope,
          lexical_inventory_sha256: preservation.lexical_guard.baseline_inventory_sha256,
          lexical_count: preservation.lexical_guard.protected_count,
          semantic_status: verdict.status,
          semantic_verdict_ref: verdictRef.payload_ref,
          semantic_verifier_actor_ref: verdict.actor_ref,
          semantic_verifier_run_ref: verdict.run_ref,
          inventory_sha256: preservation.candidate_inventory_sha256,
          counts: preservation.counts,
        },
        identity_assurance: {
          claim: identityAttestation.identity_claim,
          authority_ref: identityAttestation.authority_ref,
          authority_record_sha256: identityAttestation.authority_record_sha256,
          deployment_attestation_ref: identityAttestation.deployment_attestation_ref,
        },
        unconfirmed_codes: finalRewriter.document.unconfirmed_items.map((item) => item.item_id),
        claim_ceiling: finalRewriter.document.claim_ceiling,
        boundary: {
          content_classification: boundaryScan.content_classification,
          raw_input_payload_copy_detected: boundaryScan.raw_input_payload_copy_detected,
          known_secret_pattern_scan_status: boundaryScan.known_secret_pattern_scan_status,
          runtime_absolute_path_detected: boundaryScan.runtime_absolute_path_detected,
          source_owned_absolute_path_count: boundaryScan.source_owned_absolute_path_count,
          forbidden_internal_scaffold_detected: boundaryScan.forbidden_internal_scaffold_detected,
          artifact_storage_class: storageAttestation.storage_class,
          receipt_metadata_only: true,
        },
      });
      await validateSchemaContract("result", result);
      preparedExecution = {
        result,
        finalDocument: finalRewriter.document,
        finalRewriter,
        verdict,
        preservation,
        boundaryScan,
        storageAttestation,
        summaryDerivation,
        identityAttestation,
      };
      if (!journalPreparedExecution || typeof journalPreparedExecution !== "function") {
        fail("prepared_execution_journal_missing", "A durable prepared-execution journal callback is mandatory before artifact commit");
      }
      await journalPreparedExecution(preparedExecution);
    },
  });
  if (!artifactWrite || !Array.isArray(artifactWrite.artifact_refs) || !artifactWrite.storage_attestation) {
    fail("artifact_attestation_missing", "Artifact adapter did not return exact refs and storage attestation");
  }
  if (!preparedExecution
    || canonicalJson(preparedExecution.result.artifact_refs) !== canonicalJson(artifactWrite.artifact_refs)
    || canonicalJson(preparedExecution.storageAttestation) !== canonicalJson(artifactWrite.storage_attestation)) {
    fail("artifact_commit_journal_mismatch", "Committed artifact set does not match the durable prepared-execution journal");
  }
  return {
    ...preparedExecution,
    protectedBaseline,
    rendered,
  };
}
