import assert from "node:assert/strict";

import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  computeUnverifiedAgentApprovalClaimDigest,
  verifyAgentWorkforceAuthorityClaim,
} from "../../../../guild_hall/agent_observation/agent_authority_verification.mjs";
import { digestOf } from "../../../../guild_hall/agent_observation/guard_primitives.mjs";
import { createForgeIntentCore } from "../../../../guild_hall/forge_intent/src/forge_intent_core.mjs";
import { assignCandidate } from "../src/assignment_policy.mjs";
import {
  EXECUTOR_AUTHORITY_BINDING_SCHEMA,
  TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA,
  admitCandidateExecutorAuthority,
} from "../src/candidate_execution_authority_adapter.mjs";
import { createCandidateExecutionCoordinator } from "../src/candidate_execution_coordinator.mjs";
import {
  FORGE_LINEAR_EXECUTION_PACKET_ADMISSION_SCHEMA,
  admitForgeLinearExecutionPacket,
} from "../src/forge_linear_execution_packet_admission.mjs";
import { matchRoleCapabilities } from "../src/role_capability_matcher.mjs";

const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const SHA_D = `sha256:${"d".repeat(64)}`;
const PROJECT = "project:kvds";
const FAMILY = "agent-family:kvds-se";
const MARK = "agent-mark:kvds-se-i";
const DEPLOYMENT = "agent-deployment:kvds-se-i";

async function forgeOutputs() {
  const core = createForgeIntentCore({
    taskWriter: {
      async createOfficialTask() {
        return {
          task_ref: "linear.task:kvds-001",
          writer_ref: "writer.linear.owner-gated",
        };
      },
    },
  });
  core.createWorkCandidate({
    candidate_id: "candidate.kvds-001",
    accepted_context_ref: "context.kvds:g1",
    engine_finding_refs: ["finding.kvds:gap-001"],
    rationale: "One accepted gap requires a bounded systems engineering review.",
    confidence: "high",
    stop_conditions: ["stop if the accepted source generation changes"],
  });
  const intent = core.createTaskIntent({
    intent_id: "intent.kvds-001",
    candidate_id: "candidate.kvds-001",
    requested_change: "Register one bounded official review task.",
    expected_prior_state: "no equivalent open official task",
  });
  core.recordApproval({
    approval_ref: "approval.kvds-001",
    intent_id: intent.intent_id,
    intent_digest: intent.intent_digest,
    authority_ref: "authority.human-owner",
    decision: "approve",
  });
  const officialTask = await core.registerOfficialTask({
    intent_id: intent.intent_id,
    intent_digest: intent.intent_digest,
  });
  const assignment = core.createAssignment({
    assignment_id: "assignment.kvds-001",
    intent_id: intent.intent_id,
    primary_role: "role.kvds-se",
    actor_ref: "actor:kvds-se",
    authority_ref: "authority.kvds-task.v1",
    assignment_epoch: 11,
    expires_at: "2026-09-15T00:00:00.000Z",
  });
  const brief = core.issueWorkBrief({
    brief_id: "brief.kvds-001",
    assignment_id: assignment.assignment_id,
    problem: "An accepted systems-engineering gap remains open.",
    requested_outcome: "Produce one review-ready analysis artifact.",
    allowed_write_scope: ["workspace.kvds:review-artifact"],
    required_evidence: ["source-receipt:accepted-context-g1"],
    stop_conditions: ["stop on source or project ambiguity"],
    escalation_path: "role.kvds-pm",
    input_bundle_manifest_digest: "a".repeat(64),
    required_review_role: "role.kvds-reviewer",
  });
  return { officialTask, assignment, brief };
}

function requestFor(outputs) {
  const linearEvidence = {
    schema_version: "soulforge.linear.official_task_read_evidence.v0",
    evidence_state: "current",
    provider: "linear",
    task_id: "KVDS-001",
    forge_task_ref: "linear.task:kvds-001",
    task_status: "Todo",
    project_scope_ref: "project:kvds",
    read_receipt_ref: "receipt:linear-read-kvds-001",
    source_receipt_refs: [
      "receipt:accepted-context-g1",
      "receipt:linear-read-kvds-001",
    ],
  };
  return {
    forge_official_task: outputs.officialTask,
    forge_assignment: outputs.assignment,
    forge_issued_work_brief: outputs.brief,
    linear_official_task_read_evidence: {
      ...linearEvidence,
      read_receipt_digest: digestOf(linearEvidence),
    },
    execution_binding: {
      schema_version: "soulforge.forge_linear.execution_binding.v0",
      candidate_ref: "candidate:kvds-001",
      project_scope_ref: "project:kvds",
      action_ref: "action:prepare-kvds-review",
      authority_ref: "authority.kvds-task.v1",
      required_role_ref: "role.kvds-se",
      responsible_actor_ref: "actor:kvds-se",
      required_capability_refs: ["cap:artifact-review", "cap:se-analysis"],
      source_receipt_refs: [
        "receipt:accepted-context-g1",
        "receipt:linear-read-kvds-001",
      ],
      assignment_id: "assignment.kvds-001",
      assignment_authority_ref: "authority.kvds-task.v1",
      assignment_epoch: 11,
      assignment_state: "current",
      work_brief_revision_id: "brief.kvds-001",
      work_brief_content_sha256: digestOf(outputs.brief),
      parent_task_ref: null,
    },
  };
}

function refreshLinearDigest(request) {
  const evidence = request.linear_official_task_read_evidence;
  const { read_receipt_digest: ignored, ...body } = evidence;
  evidence.read_receipt_digest = digestOf(body);
  return request;
}

function roleSnapshot() {
  return {
    schema_version: "soulforge.organization.role_snapshot.v1",
    snapshot_ref: { revision_id: "role-snapshot-r1", content_sha256: SHA_B },
    roles: [{
      role_ref: "role.kvds-se",
      status: "active",
      responsible_action_refs: ["action:prepare-kvds-review"],
      responsible_actor_ref: "actor:kvds-se",
      candidate_actor_refs: ["actor:kvds-se"],
    }],
  };
}

function capabilitySnapshot() {
  return {
    schema_version: "soulforge.organization.capability_snapshot.v1",
    snapshot_ref: { revision_id: "capability-snapshot-r1", content_sha256: SHA_C },
    actor_bindings: [{
      actor_ref: "actor:kvds-se",
      performing_agent_id: "agent:kvds-se-i",
      bot_ref: "bot:kvds-se-i",
      executor_ref: "executor.hermes.native-chat",
      status: "active",
      capability_refs: ["cap:artifact-review", "cap:se-analysis"],
    }],
  };
}

function verifiedActiveBinding() {
  const projection = {
    project_scope_ref: PROJECT,
    project_scope_refs: [PROJECT],
    lineage_digest: `sha256:${"2".repeat(64)}`,
    family_ref: FAMILY,
    family_digest: `sha256:${"3".repeat(64)}`,
    mark_ref: MARK,
    mark_digest: `sha256:${"4".repeat(64)}`,
    deployment_ref: DEPLOYMENT,
    deployment_digest: `sha256:${"5".repeat(64)}`,
    memory_generation_ref: "memory-generation:kvds-se-i",
    memory_digest: `sha256:${"6".repeat(64)}`,
    authority_receipt_ref: "approval-receipt:kvds-se-i",
    authority_receipt_verified: false,
  };
  const claim = computeUnverifiedAgentApprovalClaimDigest(projection, PROJECT);
  assert.equal(claim.status, "UNVERIFIED_CLAIM_DIGESTED");
  const pin = {
    schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
    pin_ref: "authority-pin:kvds-se-i",
    verification_receipt_ref: "verification-receipt:kvds-se-i",
    owner_ref: "owner:human-owner",
    authority_ref: "authority:agent-deployment/v1",
    verifier_ref: "verifier:agent-authority/v1",
    project_scope_ref: PROJECT,
    lineage_digest: projection.lineage_digest,
    family_ref: FAMILY,
    family_digest: projection.family_digest,
    mark_ref: MARK,
    mark_digest: projection.mark_digest,
    deployment_ref: DEPLOYMENT,
    deployment_digest: projection.deployment_digest,
    memory_generation_ref: projection.memory_generation_ref,
    memory_digest: projection.memory_digest,
    approval_claim_digest: claim.claim_digest,
    authority_receipt_ref: projection.authority_receipt_ref,
    authority_receipt_digest: `sha256:${"7".repeat(64)}`,
    claim_ceiling: "validated_private",
    issued_at: "2026-09-08T01:00:00.000Z",
    verified_at: "2026-09-08T01:01:00.000Z",
    expires_at: "2026-09-08T03:00:00.000Z",
    receipt_epoch: 7,
    trusted_authority_epoch: 7,
    revoked: false,
  };
  const state = {
    schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: "authority-state-evaluation:kvds-se-i",
    evaluated_at: "2026-09-08T01:02:00.000Z",
    authority_ref: pin.authority_ref,
    current_authority_epoch: 7,
    revoked_pin_refs: [],
    claim_ceiling: "validated_private",
  };
  const receipt = verifyAgentWorkforceAuthorityClaim(projection, pin, state);
  assert.equal(receipt.status, "VERIFIED_ACTIVE_BINDING");
  return receipt;
}

function executorBinding(admitted, match) {
  return {
    schema_version: EXECUTOR_AUTHORITY_BINDING_SCHEMA,
    assignment_epoch: admitted.assignment_binding.assignment_epoch,
    project_scope_ref: admitted.project_scope_ref,
    family_ref: FAMILY,
    mark_ref: MARK,
    role_snapshot_ref: structuredClone(match.role_snapshot_ref),
    capability_snapshot_ref: structuredClone(match.capability_snapshot_ref),
    responsible_role_ref: match.responsible_role_ref,
    required_capability_refs: [...match.required_capability_refs],
    actor_ref: "actor:kvds-se",
    performing_agent_id: "agent:kvds-se-i",
    bot_ref: "bot:kvds-se-i",
    executor_ref: "executor.hermes.native-chat",
    profile_ref: "profile:kvds-se-i/v1",
    session_ref: "session:kvds-se-i/canonical",
    deployment_ref: DEPLOYMENT,
    deployment_digest: `sha256:${"5".repeat(64)}`,
    requested_model: "gpt-5.6-terra",
    requested_effort: "max",
    observed_model: "UNKNOWN",
    observed_effort: "UNKNOWN",
    tool_authority_ref: "tool-authority:kvds-se-i/v1",
    tool_authority_epoch: 3,
    tool_policy_digest: `sha256:${"8".repeat(64)}`,
    authorized_tool_refs: ["tool:artifact-read", "tool:evidence-submit"],
    required_tool_refs: ["tool:artifact-read"],
  };
}

function currentEvaluation(receipt, binding) {
  return {
    schema_version: TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA,
    status: "TRUSTED_CURRENT",
    evaluation_ref: "executor-current-evaluation:kvds-se-i",
    evaluated_at: "2026-09-08T01:03:00.000Z",
    authority_state_evaluation_ref: receipt.authority_state_evaluation_ref,
    authority_ref: receipt.authority_ref,
    current_authority_epoch: receipt.current_authority_epoch,
    project_scope_ref: binding.project_scope_ref,
    current_assignment_epoch: binding.assignment_epoch,
    active_slot_state: "idle",
    active_run_ref: null,
    revoked_binding_refs: [],
    family_ref: binding.family_ref,
    mark_ref: binding.mark_ref,
    performing_agent_id: binding.performing_agent_id,
    bot_ref: binding.bot_ref,
    executor_ref: binding.executor_ref,
    profile_ref: binding.profile_ref,
    session_ref: binding.session_ref,
    deployment_ref: binding.deployment_ref,
    deployment_digest: binding.deployment_digest,
    role_snapshot_ref: structuredClone(binding.role_snapshot_ref),
    capability_snapshot_ref: structuredClone(binding.capability_snapshot_ref),
    responsible_role_ref: binding.responsible_role_ref,
    actor_ref: binding.actor_ref,
    required_capability_refs: [...binding.required_capability_refs],
    observed_model: binding.observed_model,
    observed_effort: binding.observed_effort,
    tool_authority_ref: binding.tool_authority_ref,
    tool_authority_epoch: binding.tool_authority_epoch,
    tool_policy_digest: binding.tool_policy_digest,
    authorized_tool_refs: [...binding.authorized_tool_refs],
  };
}

export async function nativeAuthorityFixture() {
  const outputs = await forgeOutputs();
  const forge_request = requestFor(outputs);
  const forge_admission = admitForgeLinearExecutionPacket(forge_request);
  const match = matchRoleCapabilities({
    work_task_contract: forge_admission.work_task_contract,
    role_snapshot: roleSnapshot(), capability_snapshot: capabilitySnapshot(),
  });
  const assignment = assignCandidate({
    matcher_result: match,
    policy: { schema_version: "soulforge.assignment_policy.snapshot.v1", validation_state: "prevalidated",
      mode: "responsible_ceo_triage", policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_D } },
  });
  const verified = verifiedActiveBinding();
  const binding = executorBinding(forge_admission, match);
  const authority_request = {
    candidate_packet: forge_admission.candidate_packet, task_packet: forge_admission.task_packet,
    assignment_packet: assignment, role_capability_match: match,
    verified_active_binding: verified, trusted_current_evaluation: currentEvaluation(verified, binding),
    executor_binding: binding,
  };
  assert.equal(admitCandidateExecutorAuthority(authority_request).status, "ADMITTED");
  return { forge_request, forge_admission, authority_request };
}
