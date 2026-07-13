import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createFilesystemArtifactAdapter } from "./artifact_store.mjs";
import { scanFinalReportBoundary } from "./boundary.mjs";
import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { loadStaticWorkflowBinding } from "./catalog.mjs";
import {
  validateEditorialPassRecord,
  validateIdentityAuthorityRecord,
  validateReportDocument,
  validateSemanticVerifierResult,
  validateWorkflowJobRequest,
  validateWorkflowJobState,
  validateWorkflowReceipt,
} from "./contract.mjs";
import { WorkflowRunnerError } from "./errors.mjs";
import { createFilesystemIdentityAuthorityAdapter, identityAuthorityRecordPath, issueLocalIdentityAuthorityRecord } from "./identity_authority.mjs";
import {
  assertManifestCoversLexicalInventory,
  extractDraftLexicalInventory,
  verifyLexicalInventoryPreserved,
} from "./lexical_guard.mjs";
import { createFilesystemPayloadAdapter } from "./payload_store.mjs";
import { createFilesystemReceiptAdapter } from "./receipt_store.mjs";
import { renderReportPair } from "./render_report_pair.mjs";
import { runWorkflowJob } from "./runner.mjs";
import { compileAllRuntimeSchemas, listRuntimeSchemaKinds, validateSchemaContract } from "./schema_runtime.mjs";
import { compareProtectedManifests, runDeterministicPreservation } from "./semantic_preservation.mjs";
import { createFilesystemStateAdapter, createInitialState, transitionState } from "./state_machine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const FIXTURE_PATH = path.join(REPO_ROOT, ".workflow", "report_authoring_v0", "fixtures", "synthetic_report_document.json");
const REGRESSION_PATH = path.join(REPO_ROOT, ".workflow", "report_authoring_v0", "fixtures", "semantic_regression_cases.json");
const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
const regressionCases = JSON.parse(await fs.readFile(REGRESSION_PATH, "utf8"));
const clone = (value) => structuredClone(value);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

async function expectCode(action, code) {
  await assert.rejects(async () => action(), (error) => {
    assert.equal(error instanceof WorkflowRunnerError, true, `expected WorkflowRunnerError, got ${error?.stack ?? error}`);
    assert.equal(error.code, code);
    return true;
  });
}

function inputRef(role, bytes, mediaType = "application/json") {
  return { role, payload_ref: `payload:${role}`, sha256: sha256Bytes(bytes), size: bytes.length, media_type: mediaType };
}

function requestFor(mode, refs, jobId = `job-${mode}`) {
  return {
    schema: "soulforge.workflow_job_request.v1",
    job_id: jobId,
    idempotency_key: `idem-${jobId}`,
    workflow_id: "report_authoring_v0",
    workflow_binding_revision: "report_authoring_v0.binding.v1",
    mode,
    project_code: "fixture",
    actor_ref: "actor:requester",
    input_refs: refs,
    report_type: "experiment",
    audience: "internal_review",
    output_formats: ["md"],
    boundary_policy: "soulforge.report.boundary.v1",
    acceptance_profile: "soulforge.report.semantic_preservation.v1",
  };
}

const ROLE_MATRICES = Object.freeze({
  experiment: ["executive_summary", "purpose", "conditions_method", "criteria_request_items", "results", "discussion_considerations", "conclusion_verdict", "next_actions", "references_traceability"],
  analysis: ["executive_summary", "decision_question_scope", "method_assumptions", "criteria_weights", "alternatives_evidence", "analysis_discussion", "conclusion_recommendation", "decision_ask_next_actions", "references_traceability"],
  progress: ["status_summary", "scope_baseline", "milestones_actuals", "deliverables_evidence", "issues_risks_dependencies", "forecast", "decision_support_requests", "next_actions", "references_traceability"],
  presentation: ["title_context", "bluf_and_ask", "minimum_background", "evidence", "recommendation_next", "references_traceability"],
  other: ["executive_summary", "purpose", "scope_evidence_basis", "findings_current_state", "interpretation_limitations", "bounded_conclusion_decision_status", "next_actions"],
});

function documentForType(reportType) {
  const document = clone(fixture);
  document.report_type = reportType;
  document.references = [];
  document.semantic_manifest.invariants = document.semantic_manifest.invariants.filter((item) => item.kind !== "citation");
  document.sections = ROLE_MATRICES[reportType].map((role, index) => {
    const summary = role.includes("summary") || role === "bluf_and_ask";
    const text = `${reportType} ${role} 근거 문장 ${index + 1}.`;
    return {
      section_id: `section-${index}`,
      heading: `${reportType} ${role}`,
      role,
      claim_refs: ["inv-number"],
      blocks: [{
        block_id: `block-${index}`,
        type: "paragraph",
        text,
        claim_refs: ["inv-number"],
        source_refs: ["fixture:source"],
        ...(summary ? {
          sentences: [{ sentence_id: `sentence-${index}`, text, claim_refs: ["inv-number"], source_refs: ["fixture:source"], citation_refs: [] }],
        } : {}),
      }],
    };
  });
  return document;
}

function shortOtherDocument() {
  const document = clone(fixture);
  document.report_type = "other";
  const roleBySection = new Map([
    ["purpose", "purpose"],
    ["conditions", "scope_evidence_basis"],
    ["results", "findings_current_state"],
    ["discussion", "interpretation_limitations"],
    ["conclusion", "bounded_conclusion_decision_status"],
    ["actions", "next_actions"],
  ]);
  document.sections = document.sections
    .filter((section) => roleBySection.has(section.section_id))
    .map((section) => ({ ...section, role: roleBySection.get(section.section_id) }));
  return document;
}

const PASS_IDS = Object.freeze({
  technical_content: ["source_fidelity", "protected_fields", "citation_resolution", "conditions_scope", "authorized_changes"],
  evidence_logic: ["role_matrix", "evidence_logic", "claim_ceiling", "conclusion_support", "unconfirmed_handling"],
  derive_executive_summary: ["body_claim_paths", "no_summary_only_claim", "verdict_scope", "action_support"],
  final_polish: ["grammar_tone", "semantic_delta_none", "reader_projection", "technical_terms_preserved", "no_detector_or_word_blacklist"],
});

function passRecord(stage) {
  return {
    schema: "soulforge.editorial_pass_record.v1",
    stage,
    status: "pass",
    checks: PASS_IDS[stage].map((id) => ({ id, applicable: true, answer: "yes", evidence_refs: ["fixture:source"], blocker_code: null })),
  };
}

function artifactBodies() {
  return [
    { role: "report_document_json", mediaType: "application/json", bytes: Buffer.from("{}\n") },
    { role: "final_report_md", mediaType: "text/markdown", bytes: Buffer.from("# report\n") },
    { role: "protected_semantic_manifest", mediaType: "application/json", bytes: Buffer.from("{}\n") },
    { role: "preservation_audit", mediaType: "application/json", bytes: Buffer.from("{}\n") },
    { role: "semantic_verification", mediaType: "application/json", bytes: Buffer.from("{}\n") },
  ];
}

function artifactRefs(jobId = "receipt-job") {
  return artifactBodies().map((item) => ({
    role: item.role,
    payload_ref: `artifact:${jobId}:${item.role}`,
    sha256: sha256Bytes(item.bytes),
    size: item.bytes.length,
    media_type: item.mediaType,
  }));
}

function receiptValue(jobId = "receipt-job") {
  return {
    schema: "soulforge.workflow_receipt.v1",
    job_id: jobId,
    workflow_id: "report_authoring_v0",
    request_sha256: HASH_A,
    result_sha256: HASH_B,
    workflow_bundle_sha256: HASH_A,
    bundle_integrity_claim: "local_self_integrity_only",
    runner_release: "workflow-runner.v1",
    binding_revision: "report_authoring_v0.binding.v1",
    input_refs: [{ role: "draft_report", payload_ref: "payload:draft", sha256: HASH_A, size: 1, media_type: "application/json" }],
    output_refs: artifactRefs(jobId),
    execution: {
      request_actor_ref: "actor:requester",
      final_rewriter_actor_ref: "actor:rewriter",
      final_rewriter_run_ref: "run:rewriter",
      final_rewriter_context_ref: "context:rewriter",
      final_rewriter_identity_attestation_ref: "attestation:rewriter",
      semantic_verifier_actor_ref: "actor:verifier",
      semantic_verifier_run_ref: "run:verifier",
      semantic_verifier_context_ref: "context:verifier",
      semantic_verifier_identity_attestation_ref: "attestation:verifier",
      identity_authority_ref: "authority:test",
      identity_authority_record_sha256: HASH_A,
      identity_claim: "local_context_separation_declared",
      deployment_attestation_ref: null,
      author_pass_receipt_sha256: HASH_A,
      verifier_pass_receipt_sha256: HASH_B,
      model_ref: null,
      reasoning_ref: null,
    },
    phase_transition_digest_before_receipt_confirmation: HASH_B,
    validator_summary: {
      request_contract: "pass",
      document_contract: "pass",
      deterministic_preservation: "pass",
      lexical_guard: "pass",
      independent_semantic_verification: "pass",
      render: "pass",
      boundary: "pass",
      counts: { protected_baseline: 1, protected_candidate: 1, protected_matched: 1, lexical_protected: 1, unconfirmed: 0 },
    },
    boundary: {
      content_classification: "private_work_product",
      raw_input_payload_copy_detected: false,
      known_secret_pattern_scan_status: "pass",
      runtime_absolute_path_detected: false,
      source_owned_absolute_path_count: 0,
      forbidden_internal_scaffold_detected: false,
      artifact_storage_class: "workspace_system",
      receipt_metadata_only: true,
    },
    started_at: "2026-07-13T00:00:00.000Z",
    completed_at: "2026-07-13T00:01:00.000Z",
    stop_error_code: null,
  };
}

function identityAuthorityRecord({ request, bundleDigest, finalRewriter, verifier }) {
  const requestSha256 = sha256Canonical(request);
  const candidateDocumentSha256 = sha256Canonical(finalRewriter.document);
  return validateIdentityAuthorityRecord({
    schema: "soulforge.workflow_identity_authority_record.v1",
    record_id: `identity-${request.job_id}`,
    status: "pass",
    identity_claim: "local_context_separation_declared",
    request_sha256: requestSha256,
    workflow_bundle_sha256: bundleDigest,
    candidate_document_sha256: candidateDocumentSha256,
    author_pass_receipt: {
      role: "final_rewriter",
      sequence: 1,
      actor_ref: finalRewriter.actor_ref,
      run_ref: finalRewriter.run_ref,
      context_ref: finalRewriter.context_ref,
      identity_attestation_ref: finalRewriter.identity_attestation_ref,
      pass_process_ref: "process:author-pass",
      request_sha256: requestSha256,
      workflow_bundle_sha256: bundleDigest,
      candidate_document_sha256: candidateDocumentSha256,
      result_sha256: sha256Canonical(finalRewriter),
      completed_at: "2026-07-13T00:00:20.000Z",
    },
    verifier_pass_receipt: {
      role: "semantic_verifier",
      sequence: 2,
      actor_ref: verifier.actor_ref,
      run_ref: verifier.run_ref,
      context_ref: verifier.context_ref,
      identity_attestation_ref: verifier.identity_attestation_ref,
      pass_process_ref: "process:verifier-pass",
      request_sha256: requestSha256,
      workflow_bundle_sha256: bundleDigest,
      candidate_document_sha256: candidateDocumentSha256,
      result_sha256: sha256Canonical(verifier),
      completed_at: verifier.completed_at,
    },
    authority: {
      authority_ref: "authority:local-supervisor",
      actor_ref: "actor:local-supervisor",
      run_ref: "run:local-supervisor",
      context_ref: "context:local-supervisor",
      identity_attestation_ref: "attestation:local-supervisor",
      process_ref: "process:local-supervisor",
      recorded_at: "2026-07-13T00:00:31.000Z",
      deployment_attestation_ref: null,
    },
  });
}

async function writeIdentityAuthorityRecord(repositoryRoot, record) {
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const digest = sha256Bytes(bytes);
  const target = identityAuthorityRecordPath(repositoryRoot, digest);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes, { flag: "wx" });
  return { digest, target };
}

async function makeRuntime(jobId, {
  receiptAdapterOverride = null,
  verifierActor = "actor:verifier",
  fixtureDocument = fixture,
  requestPatch = {},
  stageDocumentTransform = null,
  artifactAdapterFactory = null,
} = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-workflow-runner-"));
  const repositoryRoot = path.join(temporary, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  const bytes = Buffer.from(`${canonicalJson(fixtureDocument)}\n`, "utf8");
  const request = { ...requestFor("final_polish", [inputRef("draft_report", bytes)], jobId), ...requestPatch };
  let policyChecked = false;
  const executorAdapter = {
    async buildProtectedBaseline({ policy_bundle: policyBundle }) {
      assert.equal(Object.keys(policyBundle.files).every((name) => name.endsWith(".md")), true);
      policyChecked = true;
      return { manifest: clone(fixtureDocument.semantic_manifest), actor_ref: "actor:baseline", run_ref: `run:${jobId}:baseline`, context_ref: `context:${jobId}:baseline`, identity_attestation_ref: `attestation:${jobId}:baseline` };
    },
    async runStage(context) {
      const policyBundle = context.policyBundle;
      assert.equal(Object.keys(policyBundle.files).every((name) => name.endsWith(".md")), true);
      policyChecked = true;
      const document = clone(fixtureDocument);
      if (stageDocumentTransform) stageDocumentTransform(document, context.stage);
      return {
        document,
        actor_ref: context.stage === "final_polish" ? "actor:rewriter" : `actor:${context.stage}`,
        run_ref: `run:${jobId}:${context.stage}`,
        context_ref: `context:${jobId}:${context.stage}`,
        identity_attestation_ref: `attestation:${jobId}:${context.stage}`,
        pass_record: context.stage === "draft" ? null : passRecord(context.stage),
      };
    },
  };
  const verifierAdapter = {
    async verify(context) {
      assert.equal(context.checked_input_contract.length, request.input_refs.length);
      assert.equal(context.source_payloads.get("draft_report").bytes.equals(bytes), true);
      return {
        schema: "soulforge.semantic_verifier_result.v1",
        status: "pass",
        actor_ref: verifierActor,
        run_ref: `run:${jobId}:verifier`,
        context_ref: `context:${jobId}:verifier`,
        identity_attestation_ref: `attestation:${jobId}:verifier`,
        checked_inputs: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
        candidate_document_sha256: sha256Canonical(context.final_document),
        baseline_manifest_sha256: sha256Canonical(context.baseline_manifest),
        reason_codes: [],
        unresolved_differences: [],
        completed_at: "2026-07-13T00:00:30.000Z",
      };
    },
  };
  const artifactRoot = path.join(repositoryRoot, "_workspaces", "system", "reports");
  const artifactAdapter = artifactAdapterFactory
    ? artifactAdapterFactory({ repositoryRoot, artifactRoot })
    : createFilesystemArtifactAdapter({ root: artifactRoot, storageClass: "workspace_system", repositoryRoot });
  const receiptAdapter = receiptAdapterOverride ?? createFilesystemReceiptAdapter({
    workmetaRoot: path.join(repositoryRoot, "_workmeta"),
    allowedProjectCodes: ["fixture"],
    repositoryRoot,
  });
  return {
    temporary,
    repositoryRoot,
    request,
    adapters: {
      preparedResultsOnly: true,
      stateAdapter: createFilesystemStateAdapter({ root: path.join(repositoryRoot, "_workspaces", "system", "state"), repositoryRoot }),
      payloadAdapter: { async read() { return bytes; } },
      executorAdapter,
      verifierAdapter,
      identityAdapter: {
        async verifySeparation({ finalRewriter, verifier }) {
          return {
            status: "pass",
            authority_ref: "authority:test",
            authority_record_sha256: HASH_A,
            identity_claim: "local_context_separation_declared",
            deployment_attestation_ref: null,
            author_pass_receipt_sha256: sha256Canonical(finalRewriter),
            verifier_pass_receipt_sha256: sha256Canonical(verifier),
          };
        },
      },
      artifactAdapter,
      receiptAdapter,
    },
    policyWasChecked: () => policyChecked,
  };
}

test("request contracts accept the two minimal mode inputs and reject caller fields", async () => {
  const source = Buffer.from("source");
  const draft = Buffer.from("draft");
  validateWorkflowJobRequest(requestFor("full_authoring", [inputRef("source_material", source, "text/plain")]));
  validateWorkflowJobRequest(requestFor("final_polish", [inputRef("draft_report", draft, "text/plain")]));
  const invalid = requestFor("final_polish", [inputRef("draft_report", draft, "text/plain")]);
  invalid.prompt = "arbitrary";
  await expectCode(() => validateWorkflowJobRequest(invalid), "contract_unknown_field");
});

test("accepted N01-N24 and P01-P14 matrix is exact, routed, and has five non-placeholder type controls", () => {
  assert.equal(regressionCases.schema, "soulforge.report_authoring_regression_cases.v2");
  assert.deepEqual(regressionCases.negative_cases.map((item) => item.id), Array.from({ length: 24 }, (_, index) => `N${String(index + 1).padStart(2, "0")}`));
  assert.deepEqual(regressionCases.positive_controls.map((item) => item.id), Array.from({ length: 14 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`));
  const allowedGates = new Set(["deterministic_manifest", "citation_contract", "summary_contract", "fresh_verifier_required", "boundary_contract", "false_positive_control", "structure_contract", "mode_contract", "runner_e2e"]);
  for (const item of [...regressionCases.negative_cases, ...regressionCases.positive_controls]) {
    assert.equal(typeof item.source, "string", item.id);
    assert.equal(typeof item.candidate, "string", item.id);
    assert.equal(allowedGates.has(item.gate), true, `${item.id}:${item.gate}`);
  }
  assert.equal(regressionCases.automation_boundary.no_general_nlp_claim, true);
  assert.deepEqual(regressionCases.type_fixtures.map((item) => item.report_type), Object.keys(ROLE_MATRICES));
  for (const control of regressionCases.type_fixtures) {
    assert.deepEqual(control.roles, ROLE_MATRICES[control.report_type]);
    const document = documentForType(control.report_type);
    validateReportDocument(document);
    const texts = document.sections.map((section) => section.blocks[0].text);
    assert.equal(new Set(texts).size, texts.length, `${control.report_type} fixture must not reuse one placeholder body`);
  }
});

test("ReportDocument validates the synthetic fixture and all five adaptive role matrices", () => {
  validateReportDocument(fixture);
  for (const reportType of Object.keys(ROLE_MATRICES)) validateReportDocument(documentForType(reportType));
  const shortOther = documentForType("other");
  shortOther.sections = shortOther.sections.filter((section) => section.role !== "executive_summary");
  assert.equal(shortOther.sections.length, 6);
  validateReportDocument(shortOther);
  validateReportDocument(shortOtherDocument());
  const compactProgress = documentForType("progress");
  compactProgress.sections = compactProgress.sections.filter((section) => new Set([
    "status_summary", "issues_risks_dependencies", "next_actions",
  ]).has(section.role));
  assert.equal(compactProgress.sections.length, 3);
  validateReportDocument(compactProgress);
  const externalProgress = clone(compactProgress);
  externalProgress.audience = "management";
  assert.throws(() => validateReportDocument(externalProgress), (error) => error.code === "document_required_section_missing");
  const sourceOwnedStatus = clone(compactProgress);
  const statusSection = sourceOwnedStatus.sections.find((section) => section.role === "status_summary");
  delete statusSection.blocks[0].sentences;
  validateReportDocument(sourceOwnedStatus);
  const missingUnconfirmedRegister = clone(compactProgress);
  const unconfirmedInvariant = missingUnconfirmedRegister.semantic_manifest.invariants[0];
  unconfirmedInvariant.kind = "unconfirmed";
  unconfirmedInvariant.verdict = "unconfirmed";
  unconfirmedInvariant.causality = "not_established";
  unconfirmedInvariant.modality = "unknown";
  assert.throws(
    () => validateReportDocument(missingUnconfirmedRegister),
    (error) => error.code === "document_unconfirmed_register_missing",
  );
  missingUnconfirmedRegister.unconfirmed_items = [{
    item_id: unconfirmedInvariant.invariant_id,
    statement: "원인은 아직 확인하지 못했다.",
    impact: "현재 판정은 조건부다.",
    close_condition: "원인을 확인한다.",
    owner_ref: null,
    due_or_trigger: null,
  }];
  validateReportDocument(missingUnconfirmedRegister);
  const universalOther = clone(fixture);
  universalOther.report_type = "other";
  universalOther.sections = [{ section_id: "only", heading: "기타", role: "other", claim_refs: [], blocks: [{ block_id: "only-p", type: "paragraph", text: "단일 구조", claim_refs: [], source_refs: [] }] }];
  assert.throws(() => validateReportDocument(universalOther), (error) => error.code === "document_required_section_missing");
});

test("summary sentence claim refs and section unions are mandatory", async () => {
  const missingSentenceRef = clone(fixture);
  missingSentenceRef.sections[0].blocks[0].text += " Unsupported sentence.";
  missingSentenceRef.sections[0].blocks[0].sentences.push({ sentence_id: "summary-s2", text: "Unsupported sentence.", claim_refs: [], source_refs: [], citation_refs: [] });
  await expectCode(() => validateReportDocument(missingSentenceRef), "document_summary_sentence_claim_refs_missing");
  const sectionMismatch = clone(fixture);
  sectionMismatch.sections[0].claim_refs = ["inv-number"];
  await expectCode(() => validateReportDocument(sectionMismatch), "document_section_claim_union_mismatch");
});

test("protected semantic mutations fail across all declared negative classes", () => {
  const cases = [
    ["inv-number", (item) => { item.value = "3.4"; }],
    ["inv-number", (item) => { item.unit = "A"; }],
    ["inv-date", (item) => { item.value = "2026-07-14"; }],
    ["inv-identifier", (item) => { item.value = "ABC-999"; }],
    ["inv-citation", (item) => { item.object = "reference-9"; item.citation_bindings = ["reference-9"]; }],
    ["inv-table-value", (item) => { item.anchor.column_id = "status"; }],
    ["inv-negation", (item) => { item.polarity = "positive"; }],
    ["inv-comparison", (item) => { item.comparator = "lt"; }],
    ["inv-modality", (item) => { item.modality = "should"; }],
    ["inv-attribution", (item) => { item.attribution.assurance_status = "verified"; }],
    ["inv-condition", (item) => { item.conditions = ["조건 B"]; }],
    ["inv-causality", (item) => { item.causality = "caused"; }],
    ["inv-verdict", (item) => { item.verdict = "pass"; }],
  ];
  for (const [id, mutate] of cases) {
    const candidate = clone(fixture.semantic_manifest);
    mutate(candidate.invariants.find((item) => item.invariant_id === id));
    assert.equal(compareProtectedManifests(fixture.semantic_manifest, candidate).status, "fail", id);
  }
  const rebound = clone(fixture.semantic_manifest);
  rebound.source_document_ref = "fixture:different-source";
  assert.equal(compareProtectedManifests(fixture.semantic_manifest, rebound).status, "fail");

  for (const field of ["time_context", "location", "candidate_entity", "comparator_entity", "metric", "outcome", "coreference_target"]) {
    const baseline = clone(fixture.semantic_manifest);
    baseline.invariants.find((item) => item.invariant_id === "inv-number")[field] = `${field}-baseline`;
    const candidate = clone(baseline);
    candidate.invariants.find((item) => item.invariant_id === "inv-number")[field] = `${field}-changed`;
    assert.equal(compareProtectedManifests(baseline, candidate).status, "fail", field);
  }
});

test("protected anchors and surface forms reject coordinated document-plus-manifest movement", async () => {
  const moved = clone(fixture);
  const source = moved.sections.find((section) => section.section_id === "results").blocks.find((block) => block.block_id === "results-p1");
  const destination = moved.sections.find((section) => section.section_id === "discussion").blocks[0];
  source.text = source.text.replace("3.3 V", "the observed voltage");
  destination.text += " 3.3 V";
  moved.semantic_manifest.invariants.find((item) => item.invariant_id === "inv-number").anchor = {
    section_id: "discussion",
    block_id: destination.block_id,
    row_id: null,
    column_id: null,
  };
  await expectCode(() => runDeterministicPreservation(fixture.semantic_manifest, moved), "semantic_preservation_failed");
});

test("manifest order is stable while multiplicity loss fails", () => {
  const reordered = clone(fixture.semantic_manifest);
  reordered.invariants.reverse();
  const audit = compareProtectedManifests(fixture.semantic_manifest, reordered);
  assert.equal(audit.status, "pass");
  assert.equal(audit.baseline_inventory_sha256, audit.candidate_inventory_sha256);
  const missing = clone(fixture.semantic_manifest);
  missing.invariants.pop();
  assert.equal(compareProtectedManifests(fixture.semantic_manifest, missing).status, "fail");
});

test("lexical guard catches omitted baseline tokens, mutations, and newly introduced surfaces", async () => {
  const inventory = extractDraftLexicalInventory(null, fixture);
  assertManifestCoversLexicalInventory(fixture.semantic_manifest, inventory);
  verifyLexicalInventoryPreserved(inventory, fixture);
  const omitted = clone(fixture.semantic_manifest);
  omitted.invariants = omitted.invariants.filter((item) => item.invariant_id !== "inv-number");
  await expectCode(() => assertManifestCoversLexicalInventory(omitted, inventory), "lexical_manifest_coverage_missing");

  const citationShapedIdentifier = "TR-2026-0710-03";
  const citationInventory = extractDraftLexicalInventory({ bytes: Buffer.from(citationShapedIdentifier, "utf8") });
  const citationManifest = clone(fixture.semantic_manifest);
  const citationInvariant = clone(citationManifest.invariants.find((item) => item.kind === "citation"));
  citationInvariant.association_key = "report-source-tr";
  citationInvariant.surface_form = citationShapedIdentifier;
  citationInvariant.value = citationShapedIdentifier;
  citationManifest.invariants = [citationInvariant];
  assertManifestCoversLexicalInventory(citationManifest, citationInventory);
  const unrelatedCitationInventory = extractDraftLexicalInventory({ bytes: Buffer.from("ECO-4821", "utf8") });
  await expectCode(() => assertManifestCoversLexicalInventory(citationManifest, unrelatedCitationInventory), "lexical_manifest_coverage_missing");

  const mutations = [
    (document) => { document.sections.find((item) => item.section_id === "results").blocks[0].text += " 새 값은 9.9 V다."; },
    (document) => { document.sections.find((item) => item.section_id === "results").blocks[0].text += " 날짜는 2026-08-01이다."; },
    (document) => { document.sections.find((item) => item.section_id === "results").blocks[0].text += " 장치는 XYZ-999다."; },
    (document) => { document.sections.find((item) => item.section_id === "results").blocks[0].text += " 추가 인용은 [9]다."; },
    (document) => { document.sections.find((item) => item.section_id === "results").blocks[1].rows[0].cells[1].text = "NEW"; },
  ];
  for (const mutate of mutations) {
    const candidate = clone(fixture);
    mutate(candidate);
    await expectCode(() => verifyLexicalInventoryPreserved(inventory, candidate), "lexical_guard_preservation_failed");
  }
  const repeated = clone(fixture);
  repeated.sections.find((item) => item.section_id === "results").blocks[0].text += " 요약에서도 3.3 V를 유지했다.";
  verifyLexicalInventoryPreserved(inventory, repeated);
});

test("lexical guard preserves leading plus-minus and Korean unit particles", () => {
  const markdown = Buffer.from("측정값은 76.1 °C였고 허용 오차는 ±1.2 °C였기 때문에 재확인했다.", "utf8");
  const inventory = extractDraftLexicalInventory({ bytes: markdown });
  const surfaces = new Set(inventory.items.filter((item) => item.kind === "number").map((item) => item.surface_form));
  assert.equal(surfaces.has("76.1 °C"), true);
  assert.equal(surfaces.has("±1.2 °C"), true);
  assert.equal(surfaces.has("1.2 °C"), false, "leading plus-minus must not be silently discarded");
});

test("lexical guard permits prose-number to table-cell reconstruction but still blocks invented protected values", async () => {
  const structuredInventory = extractDraftLexicalInventory(null, fixture);
  const proseInventory = {
    ...structuredInventory,
    items: structuredInventory.items.map((item) => item.kind === "table_cell" && item.surface_form === "10.0 %"
      ? { kind: "number", surface_form: item.surface_form, occurrence: item.occurrence }
      : item),
  };
  proseInventory.inventory_sha256 = sha256Canonical({ scope: proseInventory.scope, items: proseInventory.items });
  verifyLexicalInventoryPreserved(proseInventory, fixture);

  const invented = clone(fixture);
  invented.sections.find((item) => item.section_id === "results").blocks[1].rows[0].cells[0].text = "9.9 %";
  await expectCode(() => verifyLexicalInventoryPreserved(proseInventory, invented), "lexical_guard_preservation_failed");
});

test("P02 and P05 v0 behavior preserves exact unit and citation surfaces", async () => {
  const p02 = regressionCases.positive_controls.find((item) => item.id === "P02");
  const p05 = regressionCases.positive_controls.find((item) => item.id === "P05");
  assert.equal(p02.source, p02.candidate);
  assert.equal(p05.source, p05.candidate);
  const inventory = extractDraftLexicalInventory(null, fixture);

  const literalUnit = clone(fixture);
  literalUnit.sections.find((section) => section.section_id === "results").blocks[0].text += ` ${p02.source}`;
  const literalUnitInventory = extractDraftLexicalInventory(null, literalUnit);
  verifyLexicalInventoryPreserved(literalUnitInventory, literalUnit);
  const literalConverted = clone(literalUnit);
  literalConverted.sections.find((section) => section.section_id === "results").blocks[0].text = literalConverted.sections.find((section) => section.section_id === "results").blocks[0].text.replace(p02.source, "0.0024 A");
  await expectCode(() => verifyLexicalInventoryPreserved(literalUnitInventory, literalConverted), "lexical_guard_preservation_failed");

  const converted = clone(fixture);
  converted.sections.find((section) => section.section_id === "results").blocks[0].text = converted.sections.find((section) => section.section_id === "results").blocks[0].text.replace("3.3 V", "0.0033 kV");
  await expectCode(() => verifyLexicalInventoryPreserved(inventory, converted), "lexical_guard_preservation_failed");

  const respaced = clone(fixture);
  respaced.sections.find((section) => section.section_id === "results").blocks[0].text = respaced.sections.find((section) => section.section_id === "results").blocks[0].text.replace("3.3 V", "3.3  V");
  await expectCode(() => verifyLexicalInventoryPreserved(inventory, respaced), "lexical_guard_preservation_failed");

  const renumbered = clone(fixture);
  renumbered.sections.find((section) => section.section_id === "results").blocks[0].text = renumbered.sections.find((section) => section.section_id === "results").blocks[0].text.replace("[1]", "[2]");
  await expectCode(() => verifyLexicalInventoryPreserved(inventory, renumbered), "lexical_guard_preservation_failed");

  const reboundSource = clone(fixture);
  reboundSource.references[0].source_ref = "source:invented";
  await expectCode(() => validateReportDocument(reboundSource), "document_citation_source_binding_mismatch");
  const relabeledSource = clone(fixture);
  relabeledSource.references[0].label = "Invented source";
  await expectCode(() => validateReportDocument(relabeledSource), "document_citation_label_binding_mismatch");
});

test("boundary guard is provenance-aware and does not ban legitimate vocabulary", async () => {
  const legitimate = clone(fixture);
  legitimate.sections.find((item) => item.section_id === "purpose").blocks[0].text = "semantic manifest와 workflow_bundle_sha256 필드를 설명하고 JSON Schema 예시 {\"schema\":\"https://json-schema.org/draft/2020-12/schema\"}를 검토한다.";
  scanFinalReportBoundary(legitimate, new Map());

  const withPath = clone(fixture);
  const sourceOwnedPath = ["C:", "Soulforge", "docs"].join("\\");
  const sourceOwnedSentence = `승인된 경로 ${sourceOwnedPath}를 분석한다.`;
  withPath.sections.find((item) => item.section_id === "purpose").blocks[0].text = sourceOwnedSentence;
  const pathBytes = Buffer.from(sourceOwnedSentence);
  const owned = new Map([["draft_report", { ref: inputRef("draft_report", pathBytes, "text/plain"), bytes: pathBytes }]]);
  const pathAudit = scanFinalReportBoundary(withPath, owned);
  assert.equal(pathAudit.runtime_absolute_path_detected, false);
  assert.equal(pathAudit.source_owned_absolute_path_count, 1);
  await expectCode(() => scanFinalReportBoundary(withPath, new Map()), "final_report_boundary_scan_failed");

  const secret = clone(fixture);
  secret.sections[1].blocks[0].text = "api_key=secret-value";
  await expectCode(() => scanFinalReportBoundary(secret, new Map()), "final_report_boundary_scan_failed");
  const placeholder = clone(fixture);
  placeholder.sections[1].blocks[0].text = "값은 {{placeholder}}다.";
  await expectCode(() => scanFinalReportBoundary(placeholder, new Map()), "final_report_boundary_scan_failed");
  const leaked = clone(fixture);
  leaked.sections[1].blocks[0].text = "soulforge.workflow_receipt.v1 job_id: x artifact_refs: []";
  await expectCode(() => scanFinalReportBoundary(leaked, new Map()), "final_report_boundary_scan_failed");
});

test("reader projection omits audit structures and renders reader-facing unconfirmed details", () => {
  const document = clone(fixture);
  document.unconfirmed_items = [{ item_id: "gap-one", statement: "원인은 아직 확인되지 않았다.", impact: "판정 범위가 제한된다.", close_condition: "추가 시험으로 원인을 확인한다.", owner_ref: null, due_or_trigger: null }];
  const rendered = renderReportPair(document);
  assert.match(rendered.markdown, /미확인 사항/u);
  assert.match(rendered.markdown, /원인은 아직 확인되지 않았다/u);
  assert.doesNotMatch(rendered.markdown, /gap-one|semantic_manifest|claim_refs|workflow_bundle_sha256/u);
  assert.doesNotMatch(rendered.html, /gap-one|semantic_manifest|claim_refs|workflow_bundle_sha256/u);
  assert.match(rendered.markdown, /참고문헌 레지스트리/u);
  assert.match(rendered.markdown, /Synthetic source \\\[1\\\]/u);
  assert.match(rendered.html, /HTML companion - canonical record remains the Markdown\/structured text file\./u);
  assert.match(rendered.html, /final_report_md \/ report_document_json/u);
  assert.match(rendered.html, /근거·참고문헌 레지스트리/u);
  assert.match(rendered.html, /후속 조치 표/u);
  assert.match(rendered.html, /Synthetic source \[1\]/u);

  const noRegistry = documentForType("other");
  const noRegistryRendered = renderReportPair(noRegistry);
  assert.match(noRegistryRendered.markdown, /출처: fixture:source/u);
  assert.match(noRegistryRendered.html, /근거·참고문헌 레지스트리/u);
  assert.match(noRegistryRendered.html, /본문 직접 근거/u);
  assert.match(noRegistryRendered.html, /fixture:source/u);
});

test("nullable report_date has manual/Ajv parity, no lexical token, and no rendered metadata row", async (t) => {
  const staleDateInvariant = clone(fixture);
  staleDateInvariant.report_date = null;
  await expectCode(() => validateReportDocument(staleDateInvariant), "document_null_report_date_manifest_conflict");
  await expectCode(() => validateSchemaContract("report_document", staleDateInvariant), "schema_validation_failed");

  const undated = clone(fixture);
  undated.report_date = null;
  undated.semantic_manifest.invariants = undated.semantic_manifest.invariants.filter((item) => item.invariant_id !== "inv-date");
  validateReportDocument(undated);
  await validateSchemaContract("report_document", undated);
  const inventory = extractDraftLexicalInventory(null, undated);
  assert.equal(inventory.items.some((item) => item.kind === "date"), false);
  const rendered = renderReportPair(undated);
  assert.doesNotMatch(rendered.markdown, /기준일:/u);
  assert.doesNotMatch(rendered.html, /<strong>기준일<\/strong>/u);
  assert.doesNotMatch(rendered.markdown, /null/u);

  const impossibleDate = clone(fixture);
  impossibleDate.report_date = "2026-02-30";
  await expectCode(() => validateReportDocument(impossibleDate), "contract_date");
  await expectCode(() => validateSchemaContract("report_document", impossibleDate), "schema_validation_failed");

  const runtime = await makeRuntime("runner-undated", { fixtureDocument: undated });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
});

test("editorial pass self-checks require the exact pass-scoped set", async () => {
  for (const stage of Object.keys(PASS_IDS)) validateEditorialPassRecord(passRecord(stage));
  const invalid = passRecord("technical_content");
  invalid.checks[0].evidence_refs = [];
  await expectCode(() => validateEditorialPassRecord(invalid), "editorial_check_evidence_missing");
});

test("Draft 2020-12 schemas compile and reject unknown fields while manual cross-field invariants remain explicit", async (t) => {
  const compilation = await compileAllRuntimeSchemas();
  assert.equal(compilation.status, "pass");
  assert.equal(compilation.kinds.length, 14);
  assert.deepEqual(compilation.kinds, listRuntimeSchemaKinds());

  const runtime = await makeRuntime("schema-parity");
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  const preparedJournal = JSON.parse(await fs.readFile(path.join(runtime.repositoryRoot, "_workspaces", "system", "state", "jobs", runtime.request.job_id, "prepared_execution.json"), "utf8"));
  const execution = preparedJournal.execution;
  const receipt = JSON.parse(await fs.readFile(path.join(runtime.repositoryRoot, "_workmeta", "fixture", "runs", runtime.request.job_id, "workflow_receipt.json"), "utf8"));
  const loaded = await loadStaticWorkflowBinding({ workflowId: runtime.request.workflow_id, mode: runtime.request.mode });
  const authorityRecord = identityAuthorityRecord({ request: runtime.request, bundleDigest: loaded.bundleDigest, finalRewriter: execution.finalRewriter, verifier: execution.verdict });
  const executionPacket = {
    schema: "soulforge.workflow_execution_packet.v1",
    request_sha256: sha256Canonical(runtime.request),
    workflow_id: "report_authoring_v0",
    mode: "final_polish",
    binding_revision: "report_authoring_v0.binding.v1",
    workflow_bundle_sha256: loaded.bundleDigest,
    inner_runner: { skills_enabled: false, model_api_available: false, arbitrary_module_loading: false },
    contract_refs: {
      request: ".workflow/report_authoring_v0/contracts/workflow_job_request.v1.schema.json",
      finalize_config: ".workflow/report_authoring_v0/contracts/workflow_cli_finalize.v1.schema.json",
      issue_authority_config: ".workflow/report_authoring_v0/contracts/workflow_cli_issue_authority.v1.schema.json",
      identity_authority_record: ".workflow/report_authoring_v0/contracts/identity_authority_record.v1.schema.json",
    },
    prepared_outputs_required: ["protected_baseline", "draft", "technical_content", "evidence_logic", "derive_executive_summary", "final_polish", "semantic_verifier"],
    authority_issue_config_skeleton: {},
    finalize_config_skeleton: {},
    note: "Prepared results only.",
  };
  const windowsFixtureRoot = path.win32.join(`C:${path.win32.sep}`, "fixture");
  const finalizeConfig = {
    schema: "soulforge.workflow_cli_finalize.v1",
    request: runtime.request,
    expected_workflow_bundle_sha256: loaded.bundleDigest,
    payload_bindings: { "payload:draft_report": path.win32.join(windowsFixtureRoot, "draft.json") },
    allowed_payload_roots: [windowsFixtureRoot],
    artifact_root: path.win32.join(windowsFixtureRoot, "artifacts"),
    artifact_storage_class: "workspace_system",
    owner_approval_ref: null,
    state_root: path.win32.join(windowsFixtureRoot, "state"),
    identity_authority_record_sha256: HASH_A,
    prepared: { protected_baseline: null, draft: null, technical_content: null, evidence_logic: null, derive_executive_summary: null, final_polish: null, semantic_verifier: execution.verdict },
  };
  const issueConfig = {
    schema: "soulforge.workflow_cli_issue_authority.v1",
    request: runtime.request,
    expected_workflow_bundle_sha256: loaded.bundleDigest,
    final_rewriter: execution.finalRewriter,
    semantic_verifier: execution.verdict,
    controller: {
      record_id: authorityRecord.record_id,
      authority_ref: authorityRecord.authority.authority_ref,
      actor_ref: authorityRecord.authority.actor_ref,
      run_ref: authorityRecord.authority.run_ref,
      context_ref: authorityRecord.authority.context_ref,
      identity_attestation_ref: authorityRecord.authority.identity_attestation_ref,
      process_ref: authorityRecord.authority.process_ref,
      author_pass_process_ref: authorityRecord.author_pass_receipt.pass_process_ref,
      verifier_pass_process_ref: authorityRecord.verifier_pass_receipt.pass_process_ref,
      author_completed_at: authorityRecord.author_pass_receipt.completed_at,
      recorded_at: authorityRecord.authority.recorded_at,
    },
  };
  const samples = {
    request: runtime.request,
    state: outcome.state,
    result: outcome.result,
    outcome,
    receipt,
    report_document: execution.finalDocument,
    semantic_verifier: execution.verdict,
    semantic_preservation: execution.preservation,
    editorial_pass: execution.finalRewriter.pass_record,
    summary_derivation: execution.summaryDerivation,
    identity_authority_record: authorityRecord,
    finalize_config: finalizeConfig,
    execution_packet: executionPacket,
    issue_authority_config: issueConfig,
  };
  assert.deepEqual(Object.keys(samples), listRuntimeSchemaKinds());
  for (const [kind, sample] of Object.entries(samples)) {
    await validateSchemaContract(kind, sample);
    const unknown = clone(sample);
    unknown._unknown = true;
    await expectCode(() => validateSchemaContract(kind, unknown), "schema_validation_failed");
  }

  const impossibleTimestamp = clone(outcome.state);
  impossibleTimestamp.created_at = "2026-07-13T99:99:99Z";
  await expectCode(() => validateWorkflowJobState(impossibleTimestamp), "contract_datetime");
  await expectCode(() => validateSchemaContract("state", impossibleTimestamp), "schema_validation_failed");
  const normalizedCalendarTimestamp = clone(outcome.state);
  normalizedCalendarTimestamp.created_at = "2026-02-30T12:00:00Z";
  await expectCode(() => validateWorkflowJobState(normalizedCalendarTimestamp), "contract_datetime");
  await expectCode(() => validateSchemaContract("state", normalizedCalendarTimestamp), "schema_validation_failed");

  const duplicateRoleRequest = clone(runtime.request);
  duplicateRoleRequest.input_refs.push({ ...duplicateRoleRequest.input_refs[0], payload_ref: "payload:duplicate", sha256: HASH_A });
  await validateSchemaContract("request", duplicateRoleRequest);
  await expectCode(() => validateWorkflowJobRequest(duplicateRoleRequest), "request_duplicate_input_role");
  const duplicateCheckedInput = clone(execution.verdict);
  duplicateCheckedInput.checked_inputs.push(clone(duplicateCheckedInput.checked_inputs[0]));
  await validateSchemaContract("semantic_verifier", duplicateCheckedInput);
  await expectCode(() => validateSemanticVerifierResult(duplicateCheckedInput), "verifier_duplicate_checked_input");
  const unresolvedPass = clone(execution.verdict);
  unresolvedPass.unresolved_differences = ["unresolved"];
  await expectCode(() => validateSchemaContract("semantic_verifier", unresolvedPass), "schema_validation_failed");
  await expectCode(() => validateSemanticVerifierResult(unresolvedPass), "verifier_pass_with_unresolved_difference");
});

test("artifact adapter confines roots, verifies committed files, and rolls back safely", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-artifacts-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporary, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  const root = path.join(repositoryRoot, "_workspaces", "system", "reports");
  const adapter = createFilesystemArtifactAdapter({ root, storageClass: "workspace_system", repositoryRoot });
  const written = await adapter.writeArtifactSet({ jobId: "artifact-job", projectCode: "fixture", artifacts: artifactBodies() });
  assert.equal(written.artifact_refs.length, 5);
  await expectCode(() => adapter.writeArtifactSet({ jobId: "artifact-job", projectCode: "fixture", artifacts: artifactBodies() }), "artifact_no_overwrite");
  await adapter.rollbackArtifactSet({ jobId: "artifact-job", projectCode: "fixture", artifactRefs: written.artifact_refs });
  await assert.rejects(fs.lstat(path.join(root, "artifact-job")), (error) => error.code === "ENOENT");

  const forbidden = path.join(repositoryRoot, "docs", "reports");
  assert.throws(() => createFilesystemArtifactAdapter({ root: forbidden, storageClass: "workspace_system", repositoryRoot }), (error) => error.code === "artifact_workspace_system_mismatch");
  await assert.rejects(fs.lstat(forbidden), (error) => error.code === "ENOENT");

  const crashRoot = path.join(repositoryRoot, "_workspaces", "system", "crash-safe");
  const crashSafe = createFilesystemArtifactAdapter({ root: crashRoot, storageClass: "workspace_system", repositoryRoot, afterCommit: async () => { throw new Error("after commit"); } });
  await assert.rejects(crashSafe.writeArtifactSet({ jobId: "crash-job", projectCode: "fixture", artifacts: artifactBodies() }));
  await assert.rejects(fs.lstat(path.join(crashRoot, "crash-job")), (error) => error.code === "ENOENT");

  const swapRoot = path.join(repositoryRoot, "_workspaces", "system", "swap-detect");
  const swapDetect = createFilesystemArtifactAdapter({ root: swapRoot, storageClass: "workspace_system", repositoryRoot, afterCommit: async ({ finalDirectory }) => { await fs.writeFile(path.join(finalDirectory, "final_report.md"), "tampered"); } });
  await expectCode(() => swapDetect.writeArtifactSet({ jobId: "swap-job", projectCode: "fixture", artifacts: artifactBodies() }), "artifact_postcommit_manual_recovery_required");
});

test("receipt adapter uses the exact companion sink, adopts exact repeats, and rejects mismatches", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-receipts-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporary, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  const adapter = createFilesystemReceiptAdapter({ workmetaRoot: path.join(repositoryRoot, "_workmeta"), allowedProjectCodes: ["fixture"], repositoryRoot });
  const receipt = validateWorkflowReceipt(receiptValue());
  const bytes = Buffer.from(`${canonicalJson(receipt)}\n`);
  const first = await adapter.write({ receipt, bytes, projectCode: "fixture" });
  const adopted = await adapter.write({ receipt, bytes, projectCode: "fixture" });
  assert.deepEqual(adopted, first);
  const mismatch = receiptValue();
  mismatch.result_sha256 = HASH_A;
  const mismatchBytes = Buffer.from(`${canonicalJson(mismatch)}\n`);
  await expectCode(() => adapter.write({ receipt: mismatch, bytes: mismatchBytes, projectCode: "fixture" }), "receipt_existing_mismatch");
  const arbitrary = path.join(temporary, "other", "_workmeta");
  assert.throws(() => createFilesystemReceiptAdapter({ workmetaRoot: arbitrary, allowedProjectCodes: ["fixture"], repositoryRoot }), (error) => error.code === "receipt_root_invalid");
  await assert.rejects(fs.lstat(arbitrary), (error) => error.code === "ENOENT");
});

test("fixed identity authority record binds declared distinct refs and ordered pass receipts to exact hashes", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-identity-authority-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporary, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  const draftBytes = Buffer.from(`${canonicalJson(fixture)}\n`, "utf8");
  const request = requestFor("final_polish", [inputRef("draft_report", draftBytes)], "identity-job");
  const finalRewriter = {
    document: clone(fixture),
    actor_ref: "actor:rewriter",
    run_ref: "run:identity-author",
    context_ref: "context:identity-author",
    identity_attestation_ref: "attestation:identity-author",
    pass_record: passRecord("final_polish"),
  };
  const verifier = {
    schema: "soulforge.semantic_verifier_result.v1",
    status: "pass",
    actor_ref: "actor:verifier",
    run_ref: "run:identity-verifier",
    context_ref: "context:identity-verifier",
    identity_attestation_ref: "attestation:identity-verifier",
    checked_inputs: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
    candidate_document_sha256: sha256Canonical(finalRewriter.document),
    baseline_manifest_sha256: sha256Canonical(finalRewriter.document.semantic_manifest),
    reason_codes: [],
    unresolved_differences: [],
    completed_at: "2026-07-13T00:00:30.000Z",
  };
  const record = identityAuthorityRecord({ request, bundleDigest: HASH_A, finalRewriter, verifier });
  const issued = await issueLocalIdentityAuthorityRecord({
    repositoryRoot,
    request,
    workflowBundleSha256: HASH_A,
    finalRewriter,
    verifier,
    controller: {
      record_id: record.record_id,
      authority_ref: record.authority.authority_ref,
      actor_ref: record.authority.actor_ref,
      run_ref: record.authority.run_ref,
      context_ref: record.authority.context_ref,
      identity_attestation_ref: record.authority.identity_attestation_ref,
      process_ref: record.authority.process_ref,
      author_pass_process_ref: record.author_pass_receipt.pass_process_ref,
      verifier_pass_process_ref: record.verifier_pass_receipt.pass_process_ref,
      author_completed_at: record.author_pass_receipt.completed_at,
      recorded_at: record.authority.recorded_at,
    },
  });
  const repeatedIssue = await issueLocalIdentityAuthorityRecord({
    repositoryRoot,
    request,
    workflowBundleSha256: HASH_A,
    finalRewriter,
    verifier,
    controller: {
      record_id: record.record_id,
      authority_ref: record.authority.authority_ref,
      actor_ref: record.authority.actor_ref,
      run_ref: record.authority.run_ref,
      context_ref: record.authority.context_ref,
      identity_attestation_ref: record.authority.identity_attestation_ref,
      process_ref: record.authority.process_ref,
      author_pass_process_ref: record.author_pass_receipt.pass_process_ref,
      verifier_pass_process_ref: record.verifier_pass_receipt.pass_process_ref,
      author_completed_at: record.author_pass_receipt.completed_at,
      recorded_at: record.authority.recorded_at,
    },
  });
  assert.deepEqual(repeatedIssue, issued);
  const digest = issued.identity_authority_record_sha256;
  const adapter = createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256: digest });
  const attestation = await adapter.verifySeparation({ request, workflowBundleSha256: HASH_A, finalRewriter, verifier });
  assert.equal(attestation.status, "pass");
  assert.equal(attestation.identity_claim, "local_context_separation_declared");
  assert.equal(attestation.deployment_attestation_ref, null);

  const forged = clone(record);
  forged.author_pass_receipt.actor_ref = "actor:forged-author";
  const { digest: forgedDigest } = await writeIdentityAuthorityRecord(repositoryRoot, forged);
  const forgedAdapter = createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256: forgedDigest });
  await expectCode(() => forgedAdapter.verifySeparation({ request, workflowBundleSha256: HASH_A, finalRewriter, verifier }), "identity_authority_author_receipt_mismatch");

  const selfAuthority = clone(record);
  selfAuthority.authority.process_ref = selfAuthority.author_pass_receipt.pass_process_ref;
  await expectCode(() => validateIdentityAuthorityRecord(selfAuthority), "identity_authority_declared_ref_collision");

  const sameDeclaredActor = clone(record);
  sameDeclaredActor.verifier_pass_receipt.actor_ref = sameDeclaredActor.author_pass_receipt.actor_ref;
  await expectCode(() => validateIdentityAuthorityRecord(sameDeclaredActor), "identity_authority_separation_failed");

  const forgedDeployment = clone(record);
  forgedDeployment.identity_claim = "deployment_attested_process_separation";
  forgedDeployment.authority.deployment_attestation_ref = "deployment:caller-forged";
  const { digest: forgedDeploymentDigest } = await writeIdentityAuthorityRecord(repositoryRoot, forgedDeployment);
  await expectCode(
    () => createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256: forgedDeploymentDigest }).verifySeparation({ request, workflowBundleSha256: HASH_A, finalRewriter, verifier }),
    "identity_authority_deployment_claim_untrusted",
  );

  await expectCode(
    () => createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256: HASH_B }).verifySeparation({ request, workflowBundleSha256: HASH_A, finalRewriter, verifier }),
    "identity_authority_record_missing",
  );
  const wrongName = identityAuthorityRecordPath(repositoryRoot, HASH_B);
  await fs.mkdir(path.dirname(wrongName), { recursive: true });
  await fs.writeFile(wrongName, `${canonicalJson(record)}\n`);
  await expectCode(
    () => createFilesystemIdentityAuthorityAdapter({ repositoryRoot, recordSha256: HASH_B }).verifySeparation({ request, workflowBundleSha256: HASH_A, finalRewriter, verifier }),
    "identity_authority_record_hash_mismatch",
  );
});

test("durable state survives adapter recreation, enforces global idempotency, and ignores temp records", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-state-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporary, "repo");
  await fs.mkdir(repositoryRoot, { recursive: true });
  const root = path.join(repositoryRoot, "_workspaces", "system", "state");
  const adapter = createFilesystemStateAdapter({ root, repositoryRoot });
  const initial = createInitialState({ jobId: "state-job", requestSha256: HASH_A, clock: () => new Date("2026-07-13T00:00:00.000Z") });
  const opened = await adapter.open({ jobId: "state-job", idempotencyKey: "state-idem", requestSha256: HASH_A, initialState: initial });
  const next = transitionState(opened.state, { expectedStateVersion: 0, status: "running", phase: "validate", attempt: 1, clock: () => new Date("2026-07-13T00:00:01.000Z") });
  await adapter.compareAndSwap({ jobId: "state-job", expectedStateVersion: 0, nextState: next });
  await fs.writeFile(path.join(root, "jobs", "state-job", "state", ".partial.tmp"), "{");
  const recreated = createFilesystemStateAdapter({ root, repositoryRoot });
  const replay = await recreated.open({ jobId: "state-job", idempotencyKey: "state-idem", requestSha256: HASH_A, initialState: initial });
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.state_version, 1);
  await expectCode(() => recreated.open({ jobId: "different-job", idempotencyKey: "state-idem", requestSha256: HASH_A, initialState: createInitialState({ jobId: "different-job", requestSha256: HASH_A }) }), "idempotency_conflict");
  assert.throws(() => createFilesystemStateAdapter({ root: path.join(repositoryRoot, "docs", "state"), repositoryRoot }), (error) => error.code === "state_forbidden_root");
});

test("hard-process crashes at artifact, receipt, terminal-state, and outcome windows resume by exact adoption without model execution", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-hard-crash-matrix-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const worker = path.join(HERE, "crash_worker_fixture.mjs");
  const crashPoints = [
    "artifact_before_rename",
    "artifact_after_rename",
    "before_receipt_write",
    "receipt_after_link",
    "after_terminal_outcome_intent",
    "after_terminal_state",
    "after_outcome_write",
  ];
  for (const [index, crashPoint] of crashPoints.entries()) {
    const repositoryRoot = path.join(temporary, `repo-${index}`);
    const jobId = `hard-crash-${index}`;
    const crashed = spawnSync(process.execPath, [worker, repositoryRoot, jobId, crashPoint], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(crashed.status, 86, `${crashPoint}: ${crashed.stderr}`);
    const resumed = spawnSync(process.execPath, [worker, repositoryRoot, jobId, "none"], { cwd: REPO_ROOT, encoding: "utf8" });
    assert.equal(resumed.status, 0, `${crashPoint}: ${resumed.stderr}`);
    const outcome = JSON.parse(resumed.stdout);
    assert.equal(outcome.state.status, "succeeded", crashPoint);
    assert.equal(outcome.result.status, "succeeded", crashPoint);
    await assert.rejects(fs.lstat(path.join(repositoryRoot, "model_calls.log")), (error) => error.code === "ENOENT", `${crashPoint} must reuse prepared results without model execution`);
    assert.equal(outcome.replayed, true, crashPoint);
    const artifactDirectory = path.join(repositoryRoot, "_workspaces", "system", "reports", jobId);
    const artifactNames = (await fs.readdir(artifactDirectory)).sort();
    assert.deepEqual(artifactNames, ["final_report.md", "preservation_audit.json", "protected_semantic_manifest.json", "report_document.json", "semantic_verification.json"]);
    const receipt = JSON.parse(await fs.readFile(path.join(repositoryRoot, "_workmeta", "fixture", "runs", jobId, "workflow_receipt.json"), "utf8"));
    assert.equal(receipt.result_sha256, sha256Canonical(outcome.result));
    assert.equal(receipt.workflow_bundle_sha256.length, 64);
  }
});

test("restart refuses mismatched committed artifacts and leaves them for manual recovery", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-hard-crash-tamper-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporary, "repo");
  const worker = path.join(HERE, "crash_worker_fixture.mjs");
  const jobId = "hard-crash-tamper";
  const crashed = spawnSync(process.execPath, [worker, repositoryRoot, jobId, "artifact_after_rename"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(crashed.status, 86, crashed.stderr);
  const reportPath = path.join(repositoryRoot, "_workspaces", "system", "reports", jobId, "final_report.md");
  await fs.writeFile(reportPath, "tampered\n");
  const resumed = spawnSync(process.execPath, [worker, repositoryRoot, jobId, "none"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(resumed.status, 0, resumed.stderr);
  const outcome = JSON.parse(resumed.stdout);
  assert.equal(outcome.state.status, "blocked");
  assert.equal(outcome.recovery.status, "manual_required");
  assert.equal(outcome.recovery.reason_code, "artifact_exact_match_failed");
  assert.equal(await fs.readFile(reportPath, "utf8"), "tampered\n");
});

test("filesystem payload adapter enforces opaque binding, root, size, and hash", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-payload-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const sourceRoot = path.join(temporary, "sources");
  await fs.mkdir(sourceRoot, { recursive: true });
  const target = path.join(sourceRoot, "draft.json");
  const bytes = Buffer.from("{}");
  await fs.writeFile(target, bytes);
  const adapter = createFilesystemPayloadAdapter({ bindings: { "payload:draft": target }, allowedRoots: [sourceRoot] });
  const ref = { role: "draft_report", payload_ref: "payload:draft", sha256: sha256Bytes(bytes), size: bytes.length, media_type: "application/json" };
  assert.equal((await adapter.read(ref)).equals(bytes), true);
  await expectCode(() => adapter.read({ ...ref, sha256: HASH_A }), "payload_declared_hash_mismatch");
});

test("static binding delivers policy files only and supports external expected-digest pinning", async () => {
  const loaded = await loadStaticWorkflowBinding({ workflowId: "report_authoring_v0", mode: "final_polish" });
  assert.equal(Object.keys(loaded.policyBundle.files).every((name) => name.endsWith(".md")), true);
  assert.equal(Object.keys(loaded.policyBundle.files).some((name) => name.endsWith(".mjs") || name.includes("contracts/")), false);
  assert.equal(Object.hasOwn(loaded.policyBundle.files, ".workflow/report_authoring_v0/references/editorial_contract.md"), true);
  const workflowYaml = await fs.readFile(path.join(REPO_ROOT, ".workflow", "report_authoring_v0", "workflow.yaml"), "utf8");
  assert.match(workflowYaml, /editorial_contract:\s+references\/editorial_contract\.md/u);
  const pinned = await loadStaticWorkflowBinding({ workflowId: "report_authoring_v0", mode: "final_polish", expectedBundleDigest: loaded.bundleDigest });
  assert.equal(pinned.integrity.claim, "externally_pinned_digest_match");
  await expectCode(() => loadStaticWorkflowBinding({ workflowId: "report_authoring_v0", mode: "final_polish", expectedBundleDigest: HASH_A }), "external_expected_digest_mismatch");
});

test("real CLI prepare emits the required bundle pin and finalize rejects a mismatched pin before state mutation", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-cli-bundle-pin-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const draftBytes = Buffer.from(`${canonicalJson(fixture)}\n`, "utf8");
  const draftPath = path.join(temporary, "draft.json");
  const request = requestFor("final_polish", [inputRef("draft_report", draftBytes)], "cli-pin-job");
  const requestPath = path.join(temporary, "request.json");
  await fs.writeFile(draftPath, draftBytes);
  await fs.writeFile(requestPath, `${canonicalJson(request)}\n`);
  const cliPath = path.join(HERE, "cli.mjs");
  const preparedProcess = spawnSync(process.execPath, [cliPath, "prepare", "--request", requestPath], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(preparedProcess.status, 0, preparedProcess.stderr);
  const packet = JSON.parse(preparedProcess.stdout);
  assert.match(packet.workflow_bundle_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(packet.finalize_config_skeleton.expected_workflow_bundle_sha256, packet.workflow_bundle_sha256);
  assert.equal(packet.contract_refs.finalize_config, ".workflow/report_authoring_v0/contracts/workflow_cli_finalize.v1.schema.json");

  const semanticVerifier = {
    schema: "soulforge.semantic_verifier_result.v1",
    status: "pass",
    actor_ref: "actor:verifier",
    run_ref: "run:cli-pin-verifier",
    context_ref: "context:cli-pin-verifier",
    identity_attestation_ref: "attestation:cli-pin-verifier",
    checked_inputs: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
    candidate_document_sha256: sha256Canonical(fixture),
    baseline_manifest_sha256: sha256Canonical(fixture.semantic_manifest),
    reason_codes: [],
    unresolved_differences: [],
    completed_at: "2026-07-13T00:00:30.000Z",
  };
  const config = {
    ...packet.finalize_config_skeleton,
    expected_workflow_bundle_sha256: HASH_A,
    payload_bindings: { "payload:draft_report": draftPath },
    allowed_payload_roots: [temporary],
    artifact_root: path.join(REPO_ROOT, "_workspaces", "system", "cli-pin-artifacts"),
    state_root: path.join(REPO_ROOT, "_workspaces", "system", "cli-pin-state"),
    identity_authority_record_sha256: HASH_B,
    prepared: { ...packet.finalize_config_skeleton.prepared, semantic_verifier: semanticVerifier },
  };
  const configPath = path.join(temporary, "finalize.json");
  await fs.writeFile(configPath, `${canonicalJson(config)}\n`);
  const finalizeProcess = spawnSync(process.execPath, [cliPath, "finalize", "--config", configPath], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(finalizeProcess.status, 1);
  assert.equal(JSON.parse(finalizeProcess.stderr).code, "external_expected_digest_mismatch");
  await assert.rejects(fs.lstat(config.state_root), (error) => error.code === "ENOENT");
});

test("disposable real CLI issues local authority, finalizes plain Markdown, replays, and rejects cross-request authority reuse", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "soulforge-cli-e2e-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const disposableRepo = path.join(temporary, "repo");
  await fs.mkdir(path.join(disposableRepo, ".workflow"), { recursive: true });
  await fs.mkdir(path.join(disposableRepo, "guild_hall"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, ".workflow", "report_authoring_v0"), path.join(disposableRepo, ".workflow", "report_authoring_v0"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "guild_hall", "workflow_runner"), path.join(disposableRepo, "guild_hall", "workflow_runner"), { recursive: true });
  await fs.cp(path.join(REPO_ROOT, "node_modules"), path.join(disposableRepo, "node_modules"), { recursive: true });
  const cliPath = path.join(disposableRepo, "guild_hall", "workflow_runner", "cli.mjs");
  const payloadRoot = path.join(disposableRepo, "inputs");
  await fs.mkdir(payloadRoot, { recursive: true });
  const markdown = [
    "# Synthetic validation report",
    "2026-07-13",
    "Under condition A, voltage was 3.3 V and exceeded the 3.0 V baseline.",
    "Device ABC-123 was unchanged [1].",
    "Item A measured 10.0 % with status PASS.",
  ].join("\n");
  const draftBytes = Buffer.from(`${markdown}\n`, "utf8");
  const draftPath = path.join(payloadRoot, "draft.md");
  await fs.writeFile(draftPath, draftBytes);
  const request = requestFor("final_polish", [inputRef("draft_report", draftBytes, "text/markdown")], "cli-e2e-job");
  const requestPath = path.join(payloadRoot, "request.json");
  await fs.writeFile(requestPath, `${canonicalJson(request)}\n`);
  const preparedProcess = spawnSync(process.execPath, [cliPath, "prepare", "--request", requestPath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(preparedProcess.status, 0, preparedProcess.stderr);
  const packet = JSON.parse(preparedProcess.stdout);
  assert.equal(packet.contract_refs.issue_authority_config, ".workflow/report_authoring_v0/contracts/workflow_cli_issue_authority.v1.schema.json");

  const stageResult = (stage, actor = `actor:${stage}`) => ({
    document: clone(fixture),
    actor_ref: actor,
    run_ref: `run:cli-e2e:${stage}`,
    context_ref: `context:cli-e2e:${stage}`,
    identity_attestation_ref: `attestation:cli-e2e:${stage}`,
    pass_record: stage === "draft" ? null : passRecord(stage),
  });
  const finalRewriter = stageResult("final_polish", "actor:rewriter");
  const semanticVerifier = {
    schema: "soulforge.semantic_verifier_result.v1",
    status: "pass",
    actor_ref: "actor:verifier",
    run_ref: "run:cli-e2e:verifier",
    context_ref: "context:cli-e2e:verifier",
    identity_attestation_ref: "attestation:cli-e2e:verifier",
    checked_inputs: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
    candidate_document_sha256: sha256Canonical(fixture),
    baseline_manifest_sha256: sha256Canonical(fixture.semantic_manifest),
    reason_codes: [],
    unresolved_differences: [],
    completed_at: "2026-07-13T00:00:30.000Z",
  };
  const issueConfig = {
    ...packet.authority_issue_config_skeleton,
    final_rewriter: finalRewriter,
    semantic_verifier: semanticVerifier,
    controller: {
      record_id: "cli-e2e-authority",
      authority_ref: "authority:cli-controller",
      actor_ref: "actor:cli-controller",
      run_ref: "run:cli-controller",
      context_ref: "context:cli-controller",
      identity_attestation_ref: "attestation:cli-controller",
      process_ref: "process:cli-controller",
      author_pass_process_ref: "process:cli-author-pass",
      verifier_pass_process_ref: "process:cli-verifier-pass",
      author_completed_at: "2026-07-13T00:00:20.000Z",
      recorded_at: "2026-07-13T00:00:31.000Z",
    },
  };
  const issuePath = path.join(payloadRoot, "issue-authority.json");
  await fs.writeFile(issuePath, `${canonicalJson(issueConfig)}\n`);
  const issuedProcess = spawnSync(process.execPath, [cliPath, "issue-authority", "--config", issuePath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(issuedProcess.status, 0, issuedProcess.stderr);
  const issued = JSON.parse(issuedProcess.stdout);
  assert.equal(issued.identity_claim, "local_context_separation_declared");
  assert.equal(issued.deployment_attestation_ref, null);
  const issuedAgain = spawnSync(process.execPath, [cliPath, "issue-authority", "--config", issuePath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(issuedAgain.status, 0, issuedAgain.stderr);
  assert.deepEqual(JSON.parse(issuedAgain.stdout), issued);

  const finalizeConfig = {
    ...packet.finalize_config_skeleton,
    payload_bindings: { "payload:draft_report": draftPath },
    allowed_payload_roots: [payloadRoot],
    artifact_root: path.join(disposableRepo, "_workspaces", "system", "cli-artifacts"),
    state_root: path.join(disposableRepo, "_workspaces", "system", "cli-state"),
    identity_authority_record_sha256: issued.identity_authority_record_sha256,
    prepared: {
      protected_baseline: { manifest: clone(fixture.semantic_manifest), actor_ref: "actor:baseline", run_ref: "run:cli-e2e:baseline", context_ref: "context:cli-e2e:baseline", identity_attestation_ref: "attestation:cli-e2e:baseline" },
      draft: stageResult("draft"),
      technical_content: stageResult("technical_content"),
      evidence_logic: stageResult("evidence_logic"),
      derive_executive_summary: stageResult("derive_executive_summary"),
      final_polish: finalRewriter,
      semantic_verifier: semanticVerifier,
    },
  };
  const finalizePath = path.join(payloadRoot, "finalize.json");
  await fs.writeFile(finalizePath, `${canonicalJson(finalizeConfig)}\n`);
  const finalizedProcess = spawnSync(process.execPath, [cliPath, "finalize", "--config", finalizePath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(finalizedProcess.status, 0, finalizedProcess.stderr);
  const finalized = JSON.parse(finalizedProcess.stdout);
  assert.equal(finalized.state.status, "succeeded", finalizedProcess.stdout);
  assert.equal(finalized.result.identity_assurance.claim, "local_context_separation_declared");
  const replayProcess = spawnSync(process.execPath, [cliPath, "finalize", "--config", finalizePath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(replayProcess.status, 0, replayProcess.stderr);
  assert.equal(JSON.parse(replayProcess.stdout).replayed, true);
  const receipt = JSON.parse(await fs.readFile(path.join(disposableRepo, "_workmeta", "fixture", "runs", request.job_id, "workflow_receipt.json"), "utf8"));
  assert.equal(receipt.execution.identity_claim, "local_context_separation_declared");
  assert.equal(receipt.execution.identity_authority_record_sha256, issued.identity_authority_record_sha256);

  const forgedRequest = { ...request, job_id: "cli-e2e-forged", idempotency_key: "idem-cli-e2e-forged" };
  const forgedConfig = { ...finalizeConfig, request: forgedRequest };
  const forgedPath = path.join(payloadRoot, "forged-finalize.json");
  await fs.writeFile(forgedPath, `${canonicalJson(forgedConfig)}\n`);
  const forgedProcess = spawnSync(process.execPath, [cliPath, "finalize", "--config", forgedPath], { cwd: disposableRepo, encoding: "utf8" });
  assert.equal(forgedProcess.status, 0, forgedProcess.stderr);
  const forgedOutcome = JSON.parse(forgedProcess.stdout);
  assert.equal(forgedOutcome.state.status, "blocked");
  assert.equal(forgedOutcome.error.code, "identity_authority_execution_binding_mismatch");
  await assert.rejects(fs.lstat(path.join(finalizeConfig.artifact_root, forgedRequest.job_id)), (error) => error.code === "ENOENT");
});

test("runner completes draft-only final_polish and replays the durable outcome", async (t) => {
  const runtime = await makeRuntime("runner-success");
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  assert.equal(outcome.result.status, "succeeded");
  assert.equal(outcome.receipt_confirmation.media_type, "application/json");
  assert.equal(runtime.policyWasChecked(), true);
  const replay = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.status, "succeeded");
});

test("runner preserves a valid hyphenated unconfirmed item id in the result", async (t) => {
  const runtime = await makeRuntime("runner-hyphen-unconfirmed", {
    stageDocumentTransform(document) {
      document.unconfirmed_items = [{
        item_id: "cause-unconfirmed",
        statement: "Cause remains unconfirmed.",
        impact: "The conclusion remains conditional.",
        close_condition: "Confirm the cause.",
        owner_ref: null,
        due_or_trigger: null,
      }];
    },
  });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  assert.deepEqual(outcome.result.unconfirmed_codes, ["cause-unconfirmed"]);
});

test("runner accepts the exact six-role short internal other report without a summary", async (t) => {
  const document = shortOtherDocument();
  const runtime = await makeRuntime("runner-short-other", {
    fixtureDocument: document,
    requestPatch: { report_type: "other" },
  });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  const prepared = JSON.parse(await fs.readFile(path.join(runtime.repositoryRoot, "_workspaces", "system", "state", "jobs", runtime.request.job_id, "prepared_execution.json"), "utf8"));
  assert.deepEqual(prepared.execution.summaryDerivation.body_claim_refs, []);
  assert.deepEqual(prepared.execution.summaryDerivation.summary_assertions, []);
});

test("runner accepts the exact three-role compact internal progress report without a derived summary", async (t) => {
  const document = documentForType("progress");
  document.report_date = null;
  document.sections = document.sections.filter((section) => new Set([
    "status_summary", "issues_risks_dependencies", "next_actions",
  ]).has(section.role));
  document.semantic_manifest.invariants = document.semantic_manifest.invariants
    .filter((invariant) => invariant.invariant_id === "inv-number");
  const compactTexts = ["상태 근거 문장.", "확인 근거 문장.", "후속 근거 문장."];
  document.sections.forEach((section, index) => {
    section.blocks[0].text = compactTexts[index];
  });
  const compactStatus = document.sections.find((section) => section.role === "status_summary");
  delete compactStatus.blocks[0].sentences;
  Object.assign(document.semantic_manifest.invariants[0], {
    kind: "condition_scope",
    association_key: "compact-status",
    anchor: { section_id: compactStatus.section_id, block_id: compactStatus.blocks[0].block_id, row_id: null, column_id: null },
    surface_form: compactTexts[0],
    subject: "진행 상태",
    predicate: "상태 근거",
    object: null,
    value: null,
    unit: null,
    comparator: "none",
    range: null,
    uncertainty: null,
    polarity: "positive",
    direction: "not_applicable",
    modality: "observed",
    attribution: null,
    conditions: [],
    scope: ["internal_review"],
    causality: "not_applicable",
    verdict: "not_applicable",
  });
  const runtime = await makeRuntime("runner-compact-progress", {
    fixtureDocument: document,
    requestPatch: { report_type: "progress", audience: "internal_review" },
  });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  const prepared = JSON.parse(await fs.readFile(path.join(runtime.repositoryRoot, "_workspaces", "system", "state", "jobs", runtime.request.job_id, "prepared_execution.json"), "utf8"));
  assert.deepEqual(prepared.execution.summaryDerivation.body_claim_refs, []);
  assert.deepEqual(prepared.execution.summaryDerivation.summary_assertions, []);
});

test("handler binds final metadata and safe draft-only provenance to the request", async (t) => {
  const cases = [
    { jobId: "bind-project", options: { requestPatch: { project_code: "other-project" } }, code: "document_project_code_request_mismatch" },
    { jobId: "bind-type", options: { requestPatch: { report_type: "analysis" } }, code: "document_report_type_request_mismatch" },
    { jobId: "bind-audience", options: { requestPatch: { audience: "management" } }, code: "document_audience_request_mismatch" },
    {
      jobId: "bind-classification",
      options: { stageDocumentTransform(document, stage) { if (stage === "final_polish") document.boundary.content_classification = "public_safe"; } },
      code: "document_content_classification_not_verified",
    },
    {
      jobId: "bind-claim-ceiling",
      options: { stageDocumentTransform(document, stage) { if (stage === "final_polish") document.claim_ceiling = "source_supported"; } },
      code: "document_claim_ceiling_exceeds_draft_only_request",
    },
    {
      jobId: "bind-source-status",
      options: { stageDocumentTransform(document, stage) { if (stage === "final_polish") document.source_record_status = "complete"; } },
      code: "document_source_record_status_exceeds_draft_only_request",
    },
  ];
  for (const item of cases) {
    const runtime = await makeRuntime(item.jobId, item.options);
    t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
    const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
    assert.equal(outcome.state.status, "blocked", item.jobId);
    assert.equal(outcome.error.code, item.code, item.jobId);
    assert.equal(outcome.recovery.status, "not_required", item.jobId);
  }
});

test("protected manifest artifact retains the protected baseline rather than candidate ordering", async (t) => {
  const runtime = await makeRuntime("baseline-manifest-artifact", {
    stageDocumentTransform(document, stage) {
      if (stage === "final_polish") document.semantic_manifest.invariants.reverse();
    },
  });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "succeeded", JSON.stringify(outcome));
  const artifactRoot = path.join(runtime.repositoryRoot, "_workspaces", "system", "reports", runtime.request.job_id);
  const protectedArtifact = JSON.parse(await fs.readFile(path.join(artifactRoot, "protected_semantic_manifest.json"), "utf8"));
  const finalDocument = JSON.parse(await fs.readFile(path.join(artifactRoot, "report_document.json"), "utf8"));
  assert.deepEqual(protectedArtifact, fixture.semantic_manifest);
  assert.notDeepEqual(finalDocument.semantic_manifest.invariants.map((item) => item.invariant_id), protectedArtifact.invariants.map((item) => item.invariant_id));
});

test("post-commit handler failures recover journaled refs for manual recovery", async (t) => {
  const tampered = await makeRuntime("runner-postcommit-tamper", {
    artifactAdapterFactory({ repositoryRoot, artifactRoot }) {
      return createFilesystemArtifactAdapter({
        root: artifactRoot,
        storageClass: "workspace_system",
        repositoryRoot,
        afterCommit: async ({ finalDirectory }) => fs.writeFile(path.join(finalDirectory, "final_report.md"), "tampered\n"),
      });
    },
  });
  t.after(() => fs.rm(tampered.temporary, { recursive: true, force: true }));
  const tamperedOutcome = await runWorkflowJob(tampered.request, tampered.adapters);
  assert.equal(tamperedOutcome.state.status, "blocked");
  assert.equal(tamperedOutcome.error.code, "artifact_postcommit_manual_recovery_required");
  assert.equal(tamperedOutcome.recovery.status, "manual_required");
  assert.equal(tamperedOutcome.recovery.reason_code, "artifact_postcommit_manual_recovery_required");
  assert.equal(tamperedOutcome.recovery.artifact_refs.length, 5);

  const rollbackFailed = await makeRuntime("runner-postcommit-rollback-fail", {
    artifactAdapterFactory({ repositoryRoot, artifactRoot }) {
      const base = createFilesystemArtifactAdapter({ root: artifactRoot, storageClass: "workspace_system", repositoryRoot });
      return {
        async writeArtifactSet(args) {
          await base.writeArtifactSet(args);
          throw new Error("post-commit handler failure");
        },
        async rollbackArtifactSet() {
          throw new Error("rollback failed");
        },
      };
    },
  });
  t.after(() => fs.rm(rollbackFailed.temporary, { recursive: true, force: true }));
  const rollbackOutcome = await runWorkflowJob(rollbackFailed.request, rollbackFailed.adapters);
  assert.equal(rollbackOutcome.state.status, "blocked");
  assert.equal(rollbackOutcome.recovery.status, "manual_required");
  assert.equal(rollbackOutcome.recovery.reason_code, "artifact_rollback_failed");
  assert.equal(rollbackOutcome.recovery.artifact_refs.length, 5);
});

test("receipt failure rolls back the complete artifact set", async (t) => {
  const runtime = await makeRuntime("runner-receipt-fail", { receiptAdapterOverride: { async write() { throw new Error("sink unavailable"); } } });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "blocked");
  assert.equal(outcome.recovery.status, "rolled_back", JSON.stringify(outcome));
  await assert.rejects(fs.lstat(path.join(runtime.repositoryRoot, "_workspaces", "system", "reports", runtime.request.job_id)), (error) => error.code === "ENOENT");
});

test("self-confirming semantic verifier is blocked before artifact commit", async (t) => {
  const runtime = await makeRuntime("runner-self-confirm", { verifierActor: "actor:rewriter" });
  t.after(() => fs.rm(runtime.temporary, { recursive: true, force: true }));
  const outcome = await runWorkflowJob(runtime.request, runtime.adapters);
  assert.equal(outcome.state.status, "blocked");
  assert.equal(outcome.error.code, "verifier_actor_not_independent", JSON.stringify(outcome));
  assert.equal(outcome.recovery.status, "not_required");
});
