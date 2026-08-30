// Program-chain dogfood — the first CROSS-MODULE integration proof.
//
// Every core below passed its own adversarial suite in isolation; this file
// proves the CONTRACTS BETWEEN them actually compose: one synthetic work
// item flows forge → vault → forge brief → workshop, the Engineering MCP
// read facade serves real core records within its egress contract, and the
// uniform-denial vocabulary is literally identical across modules. All
// facts stay synthetic (synthetic writer, caller-asserted custody/scan,
// injected clocks); nothing external is touched.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createForgeIntentCore } from "../../forge_intent/src/forge_intent_core.mjs";
import { createVaultRevisionCore, UNIFORM_DENIAL } from "../../vault_revision/src/artifact_revision_core.mjs";
import { createToolWorkshopCore, DOCUMENT_WORKSHOP_PROFILE } from "../../tool_workshop/src/tool_workshop_core.mjs";
import { createEngineeringMcpReadFacade } from "../../engineering_mcp/src/facade.mjs";
import { UNIFORM_DENIAL_CODE } from "../../engineering_mcp/src/contract.mjs";

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const SCOPE = Object.freeze({ project_ref: "demo_project" });
const CLOCK_0 = "2026-08-30T12:00:00.000Z";

function syntheticWriter() {
  return {
    createOfficialTask: async () => ({ task_ref: "linear.synthetic:1", writer_ref: "writer.synthetic" }),
  };
}

// One synthetic work item through the whole program chain. Returns every
// intermediate record so the assertions can bind them across modules.
async function runProgramChain() {
  const forge = createForgeIntentCore({ taskWriter: syntheticWriter() });
  forge.createWorkCandidate({
    candidate_id: "cand.dogfood",
    accepted_context_ref: "context.gen:demo_project:g1",
    engine_finding_refs: ["finding.gap:pack_manifest_unreviewed"],
    rationale: "The pack build manifest needs an accepted, reviewed revision.",
    confidence: "high",
    stop_conditions: ["stop when the manifest digest is disputed"],
  });
  const intent = forge.createTaskIntent({
    intent_id: "intent.dogfood", candidate_id: "cand.dogfood",
    requested_change: "Create one official task to review the pack build manifest.",
    expected_prior_state: "no open official task for this gap",
  });
  forge.recordApproval({
    approval_ref: "approval.dogfood", intent_id: "intent.dogfood",
    intent_digest: intent.intent_digest, authority_ref: "human.owner_delegate", decision: "approve",
  });
  const task = await forge.registerOfficialTask({ intent_id: "intent.dogfood", intent_digest: intent.intent_digest });
  const assignment = forge.createAssignment({
    assignment_id: "assign.dogfood", intent_id: "intent.dogfood",
    primary_role: "role.se_engineer", actor_ref: "member.alice",
    authority_ref: "authority.assignment_board", assignment_epoch: 1, expires_at: "2026-09-15",
  });

  const vault = createVaultRevisionCore();
  vault.registerLogicalArtifact({
    logical_artifact_id: "art.pack_manifest", artifact_kind: "manifest",
    project_ref: "demo_project",
    logical_owner_ref: "vault.catalog", byte_owner_ref: "custody.store_a",
    revision_owner_ref: "vault.revision_ledger", acceptance_owner_ref: "human.acceptor_1",
    backup_restore_owner_ref: "bastion.policy_1",
  });
  const payloadSha = sha256("synthetic pack manifest payload v1");
  vault.recordSubmission({
    submission_id: "sub.pm", actor_ref: "member.alice", assignment_ref: "assign.dogfood",
    project_ref: "demo_project", idempotency_key: "key-pm", declared_sha256: payloadSha, declared_size: 512,
  });
  vault.recordCustodyReceipt({ custody_receipt_ref: "cust.pm", submission_id: "sub.pm", stored_sha256: payloadSha });
  vault.recordScanClass("cust.pm", "clean");
  vault.createRevisionCandidate({
    logical_artifact_id: "art.pack_manifest", custody_receipt_ref: "cust.pm",
    assignment_ref: "assign.dogfood", artifact_revision_id: "rev.pm.1", parent_revision_id: null,
  }, SCOPE);
  vault.recordReview({ artifact_revision_id: "rev.pm.1", review_ref: "review.pm", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  const acceptedRevision = vault.recordHumanAcceptance({
    artifact_revision_id: "rev.pm.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.pm",
  }, SCOPE);
  const bundle = vault.assembleInputBundle({
    bundle_id: "bundle.dogfood", assembler_ref: "vault.assembler", idempotency_key: "bkey-dogfood",
    purpose_ref: "purpose.work_brief", entries: ["rev.pm.1"],
  }, SCOPE);

  // Vault's bundle digest becomes forge's brief binding — cross-module
  // digest compatibility is exactly what this step proves.
  forge.draftWorkBrief({
    draft_ref: "draft.dogfood", assignment_id: "assign.dogfood",
    problem: "Pack manifest revision review",
    requested_outcome: "reviewed and accepted manifest revision",
    allowed_write_scope: ["workspace:demo_project/pack_manifest_review"],
    required_evidence: ["review record ref", "acceptance ref"],
    stop_conditions: ["stop when the accepted head moves"],
    escalation_path: "escalate to the platform owner",
    required_review_role: "role.se_reviewer",
    input_bundle_manifest_digest: bundle.manifest_digest,
  });
  const brief = forge.issueWorkBriefFromDraft({
    brief_id: "brief.dogfood", assignment_id: "assign.dogfood",
    draft_ref: "draft.dogfood", issuer_ref: "authority.assignment_board",
  });

  const workshop = createToolWorkshopCore();
  workshop.registerWorkshop(DOCUMENT_WORKSHOP_PROFILE);
  workshop.submitJob({
    job_id: "job.dogfood", workshop_id: DOCUMENT_WORKSHOP_PROFILE.workshop_id,
    task_ref: task.task_ref, work_brief_ref: brief.brief_id, project_ref: "demo_project",
    priority: 1, required_tool_version: DOCUMENT_WORKSHOP_PROFILE.tool_versions[0],
    input_bundle_manifest_digest: brief.input_bundle_manifest_digest,
    timeout_seconds: 600,
  });
  const lease = workshop.acquireLease(DOCUMENT_WORKSHOP_PROFILE.workshop_id, { now: CLOCK_0, lease_id: "lease.dogfood" });
  const outputSha = sha256("synthetic reviewed manifest output v1");
  const receipt = workshop.completeRun({
    lease_id: "lease.dogfood", fencing_token: lease.fencing_token,
    validator_result: "pass", output_bundle_manifest_digest: outputSha,
    evidence_refs: ["evidence.review_record", "evidence.acceptance_ref"],
  });

  return { forge, vault, workshop, intent, task, assignment, acceptedRevision, bundle, brief, lease, receipt };
}

test("one work item composes across forge, vault, and workshop with binding-exact digests and refs", async () => {
  const chain = await runProgramChain();
  // The SAME digest travels vault bundle -> forge brief -> workshop job -> receipt.
  assert.match(chain.bundle.manifest_digest, /^[a-f0-9]{64}$/);
  assert.equal(chain.brief.input_bundle_manifest_digest, chain.bundle.manifest_digest);
  assert.equal(chain.receipt.input_bundle_manifest_digest, chain.bundle.manifest_digest);
  // The SAME external task ref travels forge -> brief -> workshop receipt.
  assert.equal(chain.brief.task_ref, chain.task.task_ref);
  assert.equal(chain.receipt.task_ref, chain.task.task_ref);
  // The brief that authorized the job is the one the assignment issued.
  assert.equal(chain.brief.assignment_id, chain.assignment.assignment_id);
  assert.equal(chain.brief.source_draft_ref, "draft.dogfood");
  // The workshop output is a CANDIDATE only — nothing in the chain closed
  // the task, moved the vault head, or accepted anything by itself.
  assert.equal(chain.receipt.claim, "workshop_output_candidate_only");
  assert.equal(chain.vault.getAcceptedHead("art.pack_manifest", SCOPE), "rev.pm.1", "the head moved only through the explicit human acceptance step");
  assert.equal(chain.workshop.getJob("job.dogfood").state, "done_candidate");
});

test("the MCP read facade serves REAL core records inside its egress contract", async () => {
  const chain = await runProgramChain();
  const facade = createEngineeringMcpReadFacade({
    enabled: true,
    actor: { actor_ref: "actor.team_member.alice", project_scopes: ["demo_project"] },
    clock: () => CLOCK_0,
    providers: {
      // status/priority/due are SYNTHETIC stand-ins asserted by this test
      // provider (labeled by source_system); a real provider reads them from
      // the actual task SoR.
      "task.get_official": () => ({
        task_ref: chain.task.task_ref, status: "open", assignee_ref: chain.assignment.actor_ref,
        priority: "p2", due: "none_declared", source_system: "synthetic_writer",
      }),
      "work.get_brief": (args) => {
        if (args.assignment_id !== chain.brief.assignment_id) throw new Error("unknown assignment");
        return {
          work_brief_ref: chain.brief.brief_id, task_ref: chain.brief.task_ref,
          input_bundle_manifest_digest: chain.brief.input_bundle_manifest_digest,
          expires_at: chain.brief.expires_at,
        };
      },
      "artifact.get_revision_metadata": (args, context) => {
        const record = chain.vault.getRevision(args.artifact_revision_id, { project_ref: context.project_scopes[0] });
        return {
          logical_artifact_id: record.logical_artifact_id,
          parent_revision_ids: record.parent_revision_id === null ? [] : [record.parent_revision_id],
          content_id: record.content_id,
          // SYNTHETIC-PROVIDER CHOICE, not contract semantics: a real
          // provider must supply the revision's actual manifest digest here;
          // this synthetic vault revision has no manifest, so the content
          // digest stands in. Do not copy this mapping into real wiring.
          manifest_digest: record.content_id.replace(/^sha256:/, ""),
          acceptance_state: record.state,
        };
      },
    },
  });

  const taskView = facade.dispatch({ tool: "task.get_official", args: { task_ref: chain.task.task_ref } });
  assert.equal(taskView.ok, true);
  assert.equal(taskView.result.task_ref, "linear.synthetic:1");

  const briefView = facade.dispatch({ tool: "work.get_brief", args: { assignment_id: "assign.dogfood" } });
  assert.equal(briefView.ok, true);
  assert.equal(briefView.result.input_bundle_manifest_digest, chain.bundle.manifest_digest,
    "the digest a client reads over MCP is the exact vault bundle digest");

  const revisionView = facade.dispatch({ tool: "artifact.get_revision_metadata", args: { artifact_revision_id: "rev.pm.1" } });
  assert.equal(revisionView.ok, true);
  assert.equal(revisionView.result.acceptance_state, "accepted");
  assert.deepEqual(revisionView.result.parent_revision_ids, []);

  // Vault's uniform denial thrown INSIDE a provider surfaces as the facade's
  // uniform denial: end-to-end, absent and foreign are indistinguishable.
  const absent = facade.dispatch({ tool: "artifact.get_revision_metadata", args: { artifact_revision_id: "rev.ghost" } });
  assert.deepEqual(absent, { ok: false, code: UNIFORM_DENIAL_CODE });
  assert.equal(facade.readLog().at(-1).outcome, "provider_error", "the log keeps the precise cause the client never sees");
  // The brief provider's unknown-assignment throw takes the same path.
  const unknownAssignment = facade.dispatch({ tool: "work.get_brief", args: { assignment_id: "assign.ghost" } });
  assert.deepEqual(unknownAssignment, { ok: false, code: UNIFORM_DENIAL_CODE });
});

test("redaction lineage and the external gate hold across the composed chain", async () => {
  const chain = await runProgramChain();
  const { vault } = chain;
  // The accepted RAW manifest revision is structurally unregistrable for
  // external submission, even though it is accepted.
  assert.throws(() => vault.registerExternalSubmission({
    external_submission_id: "ext.raw", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-raw", revision_ids: ["rev.pm.1"],
  }, SCOPE), (error) => error.code === "external_requires_redacted_derivative");
  // A redacted derivative on a separate external artifact goes through the
  // full path and registers with chain-complete lineage.
  vault.registerLogicalArtifact({
    logical_artifact_id: "art.pack_manifest_external", artifact_kind: "manifest",
    project_ref: "demo_project",
    logical_owner_ref: "vault.catalog", byte_owner_ref: "custody.store_a",
    revision_owner_ref: "vault.revision_ledger", acceptance_owner_ref: "human.acceptor_1",
    backup_restore_owner_ref: "bastion.policy_1",
  });
  const redactedSha = sha256("synthetic REDACTED manifest payload v1");
  vault.recordSubmission({
    submission_id: "sub.red", actor_ref: "member.alice", assignment_ref: "assign.dogfood",
    project_ref: "demo_project", idempotency_key: "key-red", declared_sha256: redactedSha, declared_size: 256,
  });
  vault.recordCustodyReceipt({ custody_receipt_ref: "cust.red", submission_id: "sub.red", stored_sha256: redactedSha });
  vault.recordScanClass("cust.red", "clean");
  vault.deriveRedactionCandidate({
    logical_artifact_id: "art.pack_manifest_external", custody_receipt_ref: "cust.red",
    assignment_ref: "assign.dogfood", artifact_revision_id: "rev.red.1", parent_revision_id: null,
    derived_from_revision_id: "rev.pm.1", redaction_profile_ref: "redaction.external_v1",
  }, SCOPE);
  vault.recordReview({ artifact_revision_id: "rev.red.1", review_ref: "review.red", reviewer_ref: "reviewer.bob", verdict: "ACCEPT" }, SCOPE);
  vault.recordHumanAcceptance({ artifact_revision_id: "rev.red.1", acceptance_owner_ref: "human.acceptor_1", acceptance_ref: "accept.red" }, SCOPE);
  const registered = vault.registerExternalSubmission({
    external_submission_id: "ext.dogfood", submitter_ref: "member.alice", destination_ref: "dest.customer_x",
    idempotency_key: "ext-dogfood", revision_ids: ["rev.red.1"],
  }, SCOPE);
  assert.deepEqual(registered.lineage, [{
    artifact_revision_id: "rev.red.1", derived_from_revision_id: "rev.pm.1",
    origin_revision_id: "rev.pm.1", redaction_profile_ref: "redaction.external_v1",
  }]);
  assert.equal(registered.claim, "lineage_registration_only_no_external_send");
});

test("the uniform-denial vocabulary is literally identical across modules", () => {
  assert.equal(UNIFORM_DENIAL_CODE, "not_available");
  assert.equal(UNIFORM_DENIAL.code, UNIFORM_DENIAL_CODE,
    "vault and the MCP contract share one denial word — a client can never tell which layer denied");
});
