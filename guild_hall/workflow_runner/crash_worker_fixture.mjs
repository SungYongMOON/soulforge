import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFilesystemArtifactAdapter } from "./artifact_store.mjs";
import { canonicalJson, sha256Bytes, sha256Canonical } from "./canonical.mjs";
import { createFilesystemReceiptAdapter } from "./receipt_store.mjs";
import { runWorkflowJob } from "./runner.mjs";
import { createFilesystemStateAdapter } from "./state_machine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, "..", "..");
const [runtimeRepositoryRoot, jobId, crashPoint = "none"] = process.argv.slice(2);
if (!runtimeRepositoryRoot || !path.isAbsolute(runtimeRepositoryRoot) || !jobId) process.exit(64);

const fixture = JSON.parse(await fs.readFile(path.join(REPOSITORY_ROOT, ".workflow", "report_authoring_v0", "fixtures", "synthetic_report_document.json"), "utf8"));
const bytes = Buffer.from(`${canonicalJson(fixture)}\n`, "utf8");
const request = {
  schema: "soulforge.workflow_job_request.v1",
  job_id: jobId,
  idempotency_key: `idem-${jobId}`,
  workflow_id: "report_authoring_v0",
  workflow_binding_revision: "report_authoring_v0.binding.v1",
  mode: "final_polish",
  project_code: "fixture",
  actor_ref: "actor:requester",
  input_refs: [{ role: "draft_report", payload_ref: "payload:draft", sha256: sha256Bytes(bytes), size: bytes.length, media_type: "application/json" }],
  report_type: "experiment",
  audience: "internal_review",
  output_formats: ["md"],
  boundary_policy: "soulforge.report.boundary.v1",
  acceptance_profile: "soulforge.report.semantic_preservation.v1",
};

const passIds = {
  technical_content: ["source_fidelity", "protected_fields", "citation_resolution", "conditions_scope", "authorized_changes"],
  evidence_logic: ["role_matrix", "evidence_logic", "claim_ceiling", "conclusion_support", "unconfirmed_handling"],
  derive_executive_summary: ["body_claim_paths", "no_summary_only_claim", "verdict_scope", "action_support"],
  final_polish: ["grammar_tone", "semantic_delta_none", "reader_projection", "technical_terms_preserved", "no_detector_or_word_blacklist"],
};
const passRecord = (stage) => ({
  schema: "soulforge.editorial_pass_record.v1",
  stage,
  status: "pass",
  checks: passIds[stage].map((id) => ({ id, applicable: true, answer: "yes", evidence_refs: ["fixture:source"], blocker_code: null })),
});
const executorAdapter = {
  async buildProtectedBaseline() {
    return { manifest: structuredClone(fixture.semantic_manifest), actor_ref: "actor:baseline", run_ref: `run:${jobId}:baseline`, context_ref: `context:${jobId}:baseline`, identity_attestation_ref: `attestation:${jobId}:baseline` };
  },
  async runStage({ stage }) {
    return {
      document: structuredClone(fixture),
      actor_ref: stage === "final_polish" ? "actor:rewriter" : `actor:${stage}`,
      run_ref: `run:${jobId}:${stage}`,
      context_ref: `context:${jobId}:${stage}`,
      identity_attestation_ref: `attestation:${jobId}:${stage}`,
      pass_record: stage === "draft" ? null : passRecord(stage),
    };
  },
};
const verifierAdapter = {
  async verify() {
    return {
      schema: "soulforge.semantic_verifier_result.v1",
      status: "pass",
      actor_ref: "actor:verifier",
      run_ref: `run:${jobId}:verifier`,
      context_ref: `context:${jobId}:verifier`,
      identity_attestation_ref: `attestation:${jobId}:verifier`,
      checked_inputs: request.input_refs.map(({ role, payload_ref, sha256 }) => ({ role, payload_ref, sha256 })),
      candidate_document_sha256: sha256Canonical(fixture),
      baseline_manifest_sha256: sha256Canonical(fixture.semantic_manifest),
      reason_codes: [],
      unresolved_differences: [],
      completed_at: "2026-07-13T00:00:30.000Z",
    };
  },
};
const identityAdapter = {
  async verifySeparation({ finalRewriter, verifier }) {
    return {
      status: "pass",
      authority_ref: "authority:test-supervisor",
      authority_record_sha256: "a".repeat(64),
      identity_claim: "local_context_separation_declared",
      deployment_attestation_ref: null,
      author_pass_receipt_sha256: sha256Canonical(finalRewriter),
      verifier_pass_receipt_sha256: sha256Canonical(verifier),
    };
  },
};

const hardCrash = (point) => {
  if (crashPoint === point) process.exit(86);
};

await fs.mkdir(runtimeRepositoryRoot, { recursive: true });
const artifactAdapter = createFilesystemArtifactAdapter({
  root: path.join(runtimeRepositoryRoot, "_workspaces", "system", "reports"),
  storageClass: "workspace_system",
  repositoryRoot: runtimeRepositoryRoot,
  beforeCommit: async () => hardCrash("artifact_before_rename"),
  afterCommit: async () => hardCrash("artifact_after_rename"),
});
const receiptAdapter = createFilesystemReceiptAdapter({
  workmetaRoot: path.join(runtimeRepositoryRoot, "_workmeta"),
  allowedProjectCodes: ["fixture"],
  repositoryRoot: runtimeRepositoryRoot,
  afterLink: async () => hardCrash("receipt_after_link"),
});
const outcome = await runWorkflowJob(request, {
  preparedResultsOnly: true,
  stateAdapter: createFilesystemStateAdapter({ root: path.join(runtimeRepositoryRoot, "_workspaces", "system", "state"), repositoryRoot: runtimeRepositoryRoot }),
  payloadAdapter: { async read() { return bytes; } },
  executorAdapter,
  verifierAdapter,
  identityAdapter,
  modelAdapter: {
    async complete() {
      await fs.writeFile(path.join(runtimeRepositoryRoot, "model_calls.log"), "unexpected model execution\n");
      throw new Error("prepared-results recovery must never call a model adapter");
    },
  },
  artifactAdapter,
  receiptAdapter,
}, {
  crashInjector: async (point) => hardCrash(point),
});
process.stdout.write(`${canonicalJson(outcome)}\n`);
