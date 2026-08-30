// Public-safe KVDS-shaped full contract canary.
//
// This test deliberately composes the existing owners instead of defining a
// new workflow: accepted-context refs -> Forge/Linear admission -> Agent
// lineage/authority -> Project AI Team pack admission -> Engineering MCP
// readback -> one Hermes execution -> authenticated artifact custody -> Vault
// review and human acceptance. Every port is in-memory or injected; there is
// no filesystem, network, provider, Linear, runtime, or external mutation.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  AGENT_DEPLOYMENT_SCHEMA,
  AGENT_FAMILY_SCHEMA,
  AGENT_MARK_RUN_SCHEMA,
  AGENT_MARK_SCHEMA,
  AGENT_MEMORY_GENERATION_SCHEMA,
  AGENT_WORKFORCE_LINEAGE_SCHEMA,
  computeLineageRecordDigest,
  prepareAgentWorkforceLineageContract,
} from "../../agent_observation/agent_mark_lineage.mjs";
import {
  appendAgentWorkforceRevisionEvent,
  createAgentWorkforceRevisionCatalog,
  projectActiveAgentWorkforceRevisions,
} from "../../agent_observation/agent_workforce_revision_catalog.mjs";
import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  computeUnverifiedAgentApprovalClaimDigest,
  verifyAgentWorkforceAuthorityClaim,
} from "../../agent_observation/agent_authority_verification.mjs";
import { digestOf } from "../../agent_observation/guard_primitives.mjs";
import {
  PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA,
  PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA,
  PROJECT_AI_TEAM_MARK_SCHEMA,
  PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA,
  PROJECT_AI_TEAM_TOPOLOGY_SCHEMA,
  prepareProjectAiTeamPackAdmission,
} from "../../deployment_pack/src/project_ai_team_pack_admission.mjs";
import { createEngineeringMcpReadFacade } from "../../engineering_mcp/src/facade.mjs";
import {
  createEngineeringMcpStdioServer,
  runEngineeringMcpStdio,
} from "../../engineering_mcp/src/stdio_server.mjs";
import { createForgeIntentCore } from "../../forge_intent/src/forge_intent_core.mjs";
import { createVaultRevisionCore } from "../../vault_revision/src/artifact_revision_core.mjs";
import {
  AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA,
  TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA,
  admitHermesArtifactSubmission,
  digestArtifactFileManifest,
  digestAuthenticatedCustodyReceipt,
  digestTrustedSubmissionCurrentState,
} from "../../vault_revision/src/hermes_submission_admission.mjs";
import { assignCandidate } from "../../../ui-workspace/apps/dev-erp/src/assignment_policy.mjs";
import {
  EXECUTOR_AUTHORITY_BINDING_SCHEMA,
  TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA,
  admitCandidateExecutorAuthority,
} from "../../../ui-workspace/apps/dev-erp/src/candidate_execution_authority_adapter.mjs";
import { createCandidateExecutionCoordinator } from "../../../ui-workspace/apps/dev-erp/src/candidate_execution_coordinator.mjs";
import {
  admitForgeLinearExecutionPacket,
} from "../../../ui-workspace/apps/dev-erp/src/forge_linear_execution_packet_admission.mjs";
import { createHermesBotSubmitExecutor } from "../../../ui-workspace/apps/dev-erp/src/hermes_bot_submit_executor.mjs";
import { matchRoleCapabilities } from "../../../ui-workspace/apps/dev-erp/src/role_capability_matcher.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const withDigest = (record, field) => ({
  ...record,
  [field]: computeLineageRecordDigest(record),
});
const PROJECT = "project:kvds";
const TASK_ID = "KVDS-FULL-001";
const TASK_REF = Object.freeze({ provider: "linear", task_id: TASK_ID });
const ADMISSION_AT = "2026-08-31T01:10:00.000Z";
const ACCEPTED_CONTEXT = Object.freeze({
  generation_ref: "context-generation:kvds.g1",
  manifest_digest: sha("a"),
  accepted_at: "2026-08-31T00:30:00.000Z",
  receipt_ref: "receipt:accepted-context-kvds-g1",
});
const RUNTIME_EXE = path.resolve("synthetic-kvds-hermes", "hermes");
const RUNTIME_HOME = path.resolve("synthetic-kvds-hermes", "home");
const RUNTIME_WORK = path.resolve("synthetic-kvds-hermes", "work");
const RUNTIME_SHA = sha("e");
const AUTHORIZED_RUNTIME_KEYS = Object.freeze([
  "performing_agent_id", "bot_ref", "executor_ref", "profile_ref", "session_ref",
  "deployment_ref", "deployment_digest", "expected_model", "expected_effort",
  "executable_path", "executable_sha256", "HERMES_HOME", "working_directory",
]);

const TEAM_SLOTS = Object.freeze([
  Object.freeze({
    role_slot_ref: "role-slot:01-manager", role_class: "manager",
    role_ref: "role:project-manager",
    required_capability_refs: ["capability:project-coordination"],
    required_tool_refs: [],
    required_authority_policy_refs: ["authority-policy:project-manager"],
  }),
  Object.freeze({
    role_slot_ref: "role-slot:02-responsibility", role_class: "responsibility",
    role_ref: "role:systems-engineering-responsibility",
    required_capability_refs: ["capability:systems-engineering"],
    required_tool_refs: ["tool:requirements-review"],
    required_authority_policy_refs: ["authority-policy:domain-responsibility"],
  }),
  Object.freeze({
    role_slot_ref: "role-slot:03-specialist", role_class: "specialist",
    role_ref: "role:sonar-specialist",
    required_capability_refs: ["capability:sonar-analysis"],
    required_tool_refs: ["tool:sonar-analysis"],
    required_authority_policy_refs: ["authority-policy:specialist-artifact-only"],
  }),
  Object.freeze({
    role_slot_ref: "role-slot:04-common", role_class: "common",
    role_ref: "role:document-common",
    required_capability_refs: ["capability:document-production"],
    required_tool_refs: ["tool:document-workshop"],
    required_authority_policy_refs: ["authority-policy:common-artifact-only"],
  }),
]);

function lineagePacket(slot, key, generation = 2) {
  const familyRef = `agent-family:kvds-${key}`;
  const suffix = generation === 1 ? `${key}-old` : key;
  const priorSuffix = generation === 1 ? null : `${key}-old`;
  const markRef = `agent-mark:kvds-${suffix}`;
  const priorMarkRef = priorSuffix === null ? null : `agent-mark:kvds-${priorSuffix}`;
  const deploymentRef = `agent-deployment:kvds-${suffix}`;
  const priorDeploymentRef = priorSuffix === null
    ? null : `agent-deployment:kvds-${priorSuffix}`;
  const memoryRef = `memory-generation:kvds-${suffix}/v1`;
  const priorMemoryRef = priorSuffix === null
    ? null : `memory-generation:kvds-${priorSuffix}/v1`;
  const roles = [slot.role_ref];
  const capabilities = [...slot.required_capability_refs].sort();
  const tools = [...new Set(["tool:engineering-mcp/v0", ...slot.required_tool_refs])].sort();
  const policies = [...slot.required_authority_policy_refs].sort();
  const family = withDigest({
    schema_version: AGENT_FAMILY_SCHEMA,
    family_ref: familyRef,
    family_version: "1.0.0",
    lifecycle_state: "approved",
    role_refs: roles,
    capability_refs: capabilities,
    supersedes_family_ref: null,
    rollback_family_ref: null,
  }, "family_digest");
  const mark = withDigest({
    schema_version: AGENT_MARK_SCHEMA,
    mark_ref: markRef,
    mark_version: `${generation}.0.0`,
    family_ref: familyRef,
    soul_revision_ref: `soul-revision:kvds-${key}/v1`,
    soul_digest: sha("1"),
    instruction_revision_ref: `instruction-revision:kvds-${key}/v1`,
    instruction_digest: sha("2"),
    requested_model_id: "model:gpt-5.6-terra",
    observed_model_id: "UNKNOWN",
    requested_effort: "effort:max",
    observed_effort: "UNKNOWN",
    role_refs: roles,
    capability_refs: capabilities,
    skill_refs: [`skill:kvds-${key}/v1`],
    workflow_refs: [`workflow:kvds-${key}/v1`],
    tool_refs: tools,
    authority_policy_refs: policies,
    project_scope_refs: [PROJECT],
    memory_policy_ref: `memory-policy:kvds-${key}/project-private`,
    evaluation_refs: [`evaluation:kvds-${key}/v1`],
    supersedes_mark_ref: priorMarkRef,
    rollback_mark_ref: priorMarkRef,
  }, "mark_digest");
  const deployment = withDigest({
    schema_version: AGENT_DEPLOYMENT_SCHEMA,
    deployment_ref: deploymentRef,
    deployment_version: `${generation}.0.0`,
    mark_ref: markRef,
    project_scope_refs: [PROJECT],
    runtime_ref: `runtime:hermes-kvds-${key}`,
    runtime_version: "0.20.5",
    profile_ref: `profile:kvds-${key}`,
    session_ref: `session:kvds-${key}/canonical`,
    tool_refs: tools,
    authority_policy_refs: policies,
    secret_ref: `secretref:kvds-${key}/runtime`,
    supersedes_deployment_ref: priorDeploymentRef,
    rollback_deployment_ref: priorDeploymentRef,
  }, "deployment_digest");
  const run = withDigest({
    schema_version: AGENT_MARK_RUN_SCHEMA,
    run_ref: `agent-run:kvds-${suffix}/prepared`,
    run_version: `${generation}.0.0`,
    deployment_ref: deploymentRef,
    mark_ref: markRef,
    project_ref: PROJECT,
    assignment_ref: `assignment:kvds-${key}/prepared`,
    work_brief_ref: `work-brief:kvds-${key}/prepared`,
    runtime_ref: deployment.runtime_ref,
    profile_ref: deployment.profile_ref,
    session_ref: deployment.session_ref,
    requested_model_id: "model:gpt-5.6-terra",
    observed_model_id: "UNKNOWN",
    requested_effort: "effort:max",
    observed_effort: "UNKNOWN",
    result_refs: [],
    evidence_refs: [],
    started_at: "2026-08-31T01:00:00.000Z",
    ended_at: null,
    run_state: "prepared",
  }, "run_digest");
  const memory = withDigest({
    schema_version: AGENT_MEMORY_GENERATION_SCHEMA,
    memory_generation_ref: memoryRef,
    memory_version: `${generation}.0.0`,
    mark_ref: markRef,
    deployment_ref: deploymentRef,
    parent_memory_generation_ref: priorMemoryRef,
    memory_manifest_ref: `memory-manifest:kvds-${key}/v1`,
    memory_classification: "project_scoped_private_memory",
    retention_policy_ref: "retention-policy:project-agent-memory/v1",
    recovery_ref: `recovery:kvds-${key}/v1`,
    rollback_ref: `rollback:kvds-${key}/v1`,
    supersedes_memory_generation_ref: priorMemoryRef,
  }, "memory_digest");
  return {
    schema_version: AGENT_WORKFORCE_LINEAGE_SCHEMA,
    family,
    mark,
    deployment,
    run,
    memory_generation: memory,
    effect_boundary: {
      persistence_write: false,
      runtime_call: false,
      configuration_mutation: false,
      authority_activation: false,
      external_call: false,
    },
  };
}

function prepareVerifiedAgent(slot, key, epoch) {
  const baseline = prepareAgentWorkforceLineageContract(lineagePacket(slot, key, 1));
  assert.equal(baseline.status, "PREPARED_CONTRACT", JSON.stringify(baseline));
  const prepared = prepareAgentWorkforceLineageContract(lineagePacket(slot, key, 2));
  assert.equal(prepared.status, "PREPARED_CONTRACT", JSON.stringify(prepared));
  const catalog = createAgentWorkforceRevisionCatalog();
  const baselineClaimed = appendAgentWorkforceRevisionEvent(catalog, {
    event_ref: `agent-catalog-event:kvds-${key}-old/approval-claim`,
    catalog_state: "approval_claim",
    authority_receipt_ref: `approval-receipt:kvds-${key}-old`,
    recorded_at: "2026-08-31T00:58:00.000Z",
    prepared_contract: baseline,
  });
  assert.equal(baselineClaimed.status, "APPROVAL_CLAIM_RECORDED");
  const candidate = appendAgentWorkforceRevisionEvent(catalog, {
    event_ref: `agent-catalog-event:kvds-${key}/candidate`,
    catalog_state: "candidate",
    authority_receipt_ref: null,
    recorded_at: "2026-08-31T01:01:00.000Z",
    prepared_contract: prepared,
  });
  assert.equal(candidate.status, "CANDIDATE_RECORDED");
  const claimed = appendAgentWorkforceRevisionEvent(catalog, {
    event_ref: `agent-catalog-event:kvds-${key}/approval-claim`,
    catalog_state: "approval_claim",
    authority_receipt_ref: `approval-receipt:kvds-${key}`,
    recorded_at: "2026-08-31T01:02:00.000Z",
    prepared_contract: prepared,
  });
  assert.equal(claimed.status, "APPROVAL_CLAIM_RECORDED");
  const projection = projectActiveAgentWorkforceRevisions(catalog);
  assert.equal(projection.rows.length, 0, "approval claim is not active authority");
  assert.equal(projection.unverified_approval_claims.length, 1);
  const unverified = projection.unverified_approval_claims[0];
  const digested = computeUnverifiedAgentApprovalClaimDigest(unverified, PROJECT);
  assert.equal(digested.status, "UNVERIFIED_CLAIM_DIGESTED");
  const pin = {
    schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
    pin_ref: `authority-pin:kvds-${key}`,
    verification_receipt_ref: `verification-receipt:kvds-${key}`,
    owner_ref: "owner:human-owner",
    authority_ref: "authority:agent-deployment-approval/v1",
    verifier_ref: "verifier:agent-authority/v1",
    project_scope_ref: PROJECT,
    lineage_digest: unverified.lineage_digest,
    family_ref: unverified.family_ref,
    family_digest: unverified.family_digest,
    mark_ref: unverified.mark_ref,
    mark_digest: unverified.mark_digest,
    deployment_ref: unverified.deployment_ref,
    deployment_digest: unverified.deployment_digest,
    memory_generation_ref: unverified.memory_generation_ref,
    memory_digest: unverified.memory_digest,
    approval_claim_digest: digested.claim_digest,
    authority_receipt_ref: unverified.authority_receipt_ref,
    authority_receipt_digest: sha(String(epoch)),
    claim_ceiling: "validated_private",
    issued_at: "2026-08-31T01:02:00.000Z",
    verified_at: "2026-08-31T01:03:00.000Z",
    expires_at: "2026-08-31T03:00:00.000Z",
    receipt_epoch: epoch,
    trusted_authority_epoch: epoch,
    revoked: false,
  };
  const current = {
    schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: `authority-evaluation:kvds-${key}/current`,
    evaluated_at: "2026-08-31T01:04:00.000Z",
    authority_ref: pin.authority_ref,
    current_authority_epoch: epoch,
    revoked_pin_refs: [],
    claim_ceiling: "validated_private",
  };
  const verified = verifyAgentWorkforceAuthorityClaim(unverified, pin, current);
  assert.equal(verified.status, "VERIFIED_ACTIVE_BINDING", JSON.stringify(verified));
  return {
    prepared,
    verified,
    current: { ...current, evaluated_at: ADMISSION_AT },
  };
}

function prepareTeam() {
  const agents = TEAM_SLOTS.map((slot, index) => (
    prepareVerifiedAgent(slot, index === 1 ? "se-i" : String(index + 1), index + 5)
  ));
  const topologyBody = {
    schema_version: PROJECT_AI_TEAM_TOPOLOGY_SCHEMA,
    team_topology_ref: "project-team-topology:kvds/v1",
    team_topology_version: "1.0.0",
    project_scope_ref: PROJECT,
    role_slots: TEAM_SLOTS.map((slot) => ({
      ...slot,
      required_capability_refs: [...slot.required_capability_refs],
      required_tool_refs: [...slot.required_tool_refs],
      required_authority_policy_refs: [...slot.required_authority_policy_refs],
    })),
  };
  const topology = { ...topologyBody, team_topology_digest: digestOf(topologyBody) };
  const markBody = {
    schema_version: PROJECT_AI_TEAM_MARK_SCHEMA,
    project_mark_ref: "project-ai-team-mark:kvds/v1",
    project_mark_version: "1.0.0",
    project_scope_ref: PROJECT,
    team_topology_ref: topology.team_topology_ref,
    team_topology_digest: topology.team_topology_digest,
    lifecycle_state: "approval_claim",
    owner_ref: "owner:human-owner",
    approval_receipt_ref: "approval-receipt:project-ai-team/kvds-v1",
    rollback_project_mark_ref: "project-ai-team-mark:kvds/v0",
  };
  const projectMark = { ...markBody, project_mark_digest: digestOf(markBody) };
  const request = {
    schema_version: PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA,
    admission_evaluated_at: ADMISSION_AT,
    project_mark: projectMark,
    team_topology: topology,
    project_mark_authority_pin: {
      schema_version: PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA,
      pin_ref: "authority-pin:project-ai-team/kvds-v1",
      verification_receipt_ref: "verification-receipt:project-ai-team/kvds-v1",
      owner_ref: "owner:human-owner",
      authority_ref: "authority:project-ai-team-approval/v1",
      verifier_ref: "verifier:project-ai-team-authority/v1",
      project_scope_ref: PROJECT,
      project_mark_ref: projectMark.project_mark_ref,
      project_mark_digest: projectMark.project_mark_digest,
      team_topology_ref: topology.team_topology_ref,
      team_topology_digest: topology.team_topology_digest,
      approval_receipt_ref: projectMark.approval_receipt_ref,
      approval_receipt_digest: sha("7"),
      claim_ceiling: "validated_private",
      issued_at: "2026-08-31T01:01:00.000Z",
      verified_at: "2026-08-31T01:03:00.000Z",
      expires_at: "2026-08-31T03:00:00.000Z",
      receipt_epoch: 4,
      trusted_authority_epoch: 4,
      revoked: false,
    },
    project_mark_current_authority_state: {
      schema_version: PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA,
      evaluation_ref: "authority-evaluation:project-ai-team/kvds-admission",
      evaluated_at: ADMISSION_AT,
      authority_ref: "authority:project-ai-team-approval/v1",
      current_authority_epoch: 4,
      revoked_pin_refs: [],
      claim_ceiling: "validated_private",
    },
    agent_bindings: TEAM_SLOTS.map((slot, index) => ({
      role_slot_ref: slot.role_slot_ref,
      mark: agents[index].prepared.record.mark,
      deployment: agents[index].prepared.record.deployment,
      memory_generation: agents[index].prepared.record.memory_generation,
      verified_active_binding: agents[index].verified,
      current_authority_state: agents[index].current,
    })),
  };
  const admitted = prepareProjectAiTeamPackAdmission(request);
  assert.equal(admitted.status, "PREPARED_PROJECT_AI_TEAM_PACK_INPUT", JSON.stringify(admitted));
  return { agents, admitted };
}

async function forgeAndLinear() {
  let syntheticWriterCalls = 0;
  const forge = createForgeIntentCore({
    taskWriter: {
      async createOfficialTask() {
        syntheticWriterCalls += 1;
        return { task_ref: "linear.task:kvds-full-001", writer_ref: "writer.synthetic-linear" };
      },
    },
  });
  forge.createWorkCandidate({
    candidate_id: "candidate.kvds-full-001",
    accepted_context_ref: ACCEPTED_CONTEXT.generation_ref,
    engine_finding_refs: ["finding.kvds:se-gap-001"],
    rationale: "One accepted KVDS context gap needs a bounded review artifact.",
    confidence: "high",
    stop_conditions: ["stop when the accepted context generation changes"],
  });
  const intent = forge.createTaskIntent({
    intent_id: "intent.kvds-full-001",
    candidate_id: "candidate.kvds-full-001",
    requested_change: "Register one bounded KVDS systems-engineering review.",
    expected_prior_state: "no equivalent open official task",
  });
  forge.recordApproval({
    approval_ref: "approval.kvds-full-001",
    intent_id: intent.intent_id,
    intent_digest: intent.intent_digest,
    authority_ref: "authority.human-owner",
    decision: "approve",
  });
  const officialTask = await forge.registerOfficialTask({
    intent_id: intent.intent_id,
    intent_digest: intent.intent_digest,
  });
  const assignment = forge.createAssignment({
    assignment_id: "assignment.kvds-full-001",
    intent_id: intent.intent_id,
    primary_role: TEAM_SLOTS[1].role_ref,
    actor_ref: "actor:kvds-se",
    authority_ref: "authority.kvds-task.v1",
    assignment_epoch: 11,
    expires_at: "2026-09-15",
  });
  const brief = forge.issueWorkBrief({
    brief_id: "brief.kvds-full-001",
    assignment_id: assignment.assignment_id,
    problem: "One accepted KVDS systems-engineering gap remains open.",
    requested_outcome: "Produce one review-ready public-safe analysis artifact.",
    allowed_write_scope: ["workspace.kvds:review-artifact"],
    required_evidence: [ACCEPTED_CONTEXT.receipt_ref],
    stop_conditions: ["stop on project or accepted-context ambiguity"],
    escalation_path: "role:project-manager",
    input_bundle_manifest_digest: ACCEPTED_CONTEXT.manifest_digest.slice("sha256:".length),
    required_review_role: "role:kvds-independent-reviewer",
  });
  const linearEvidence = {
    schema_version: "soulforge.linear.official_task_read_evidence.v0",
    evidence_state: "current",
    provider: "linear",
    task_id: TASK_ID,
    forge_task_ref: officialTask.task_ref,
    task_status: "Todo",
    project_scope_ref: PROJECT,
    read_receipt_ref: "receipt:linear-read-kvds-full-001",
    source_receipt_refs: [ACCEPTED_CONTEXT.receipt_ref, "receipt:linear-read-kvds-full-001"],
  };
  const request = {
    forge_official_task: officialTask,
    forge_assignment: assignment,
    forge_issued_work_brief: brief,
    linear_official_task_read_evidence: {
      ...linearEvidence,
      read_receipt_digest: digestOf(linearEvidence),
    },
    execution_binding: {
      schema_version: "soulforge.forge_linear.execution_binding.v0",
      candidate_ref: "candidate:kvds-full-001",
      project_scope_ref: PROJECT,
      action_ref: "action:prepare-kvds-review",
      authority_ref: "authority.kvds-task.v1",
      required_role_ref: TEAM_SLOTS[1].role_ref,
      responsible_actor_ref: "actor:kvds-se",
      required_capability_refs: [...TEAM_SLOTS[1].required_capability_refs],
      source_receipt_refs: [...linearEvidence.source_receipt_refs],
      assignment_id: assignment.assignment_id,
      assignment_authority_ref: assignment.authority_ref,
      assignment_epoch: assignment.assignment_epoch,
      assignment_state: "current",
      work_brief_revision_id: brief.brief_id,
      work_brief_content_sha256: digestOf(brief),
      parent_task_ref: null,
    },
  };
  const admitted = admitForgeLinearExecutionPacket(request);
  assert.equal(admitted.status, "ADMITTED", JSON.stringify(admitted));
  assert.equal(syntheticWriterCalls, 1);
  return { forge, request, admitted, assignment, brief, officialTask };
}

function roleMatch(admitted) {
  return matchRoleCapabilities({
    work_task_contract: admitted.work_task_contract,
    role_snapshot: {
      schema_version: "soulforge.organization.role_snapshot.v1",
      snapshot_ref: { revision_id: "role-snapshot-kvds-r1", content_sha256: sha("b") },
      roles: [{
        role_ref: TEAM_SLOTS[1].role_ref,
        status: "active",
        responsible_action_refs: [admitted.task_packet.action_ref],
        responsible_actor_ref: "actor:kvds-se",
        candidate_actor_refs: ["actor:kvds-se"],
      }],
    },
    capability_snapshot: {
      schema_version: "soulforge.organization.capability_snapshot.v1",
      snapshot_ref: { revision_id: "capability-snapshot-kvds-r1", content_sha256: sha("c") },
      actor_bindings: [{
        actor_ref: "actor:kvds-se",
        performing_agent_id: "agent:kvds-se-i",
        bot_ref: "bot:kvds-se-i",
        executor_ref: "executor.hermes.bot-submit",
        status: "active",
        capability_refs: [...TEAM_SLOTS[1].required_capability_refs],
      }],
    },
  });
}

function assignmentFor(match) {
  return assignCandidate({
    matcher_result: match,
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-kvds-r1", content_sha256: sha("d") },
    },
  });
}

function authorityPackets(admitted, match, assignment, selectedAgent) {
  const lineage = selectedAgent.prepared.record;
  const binding = {
    schema_version: EXECUTOR_AUTHORITY_BINDING_SCHEMA,
    assignment_epoch: admitted.assignment_binding.assignment_epoch,
    project_scope_ref: PROJECT,
    family_ref: lineage.family.family_ref,
    mark_ref: lineage.mark.mark_ref,
    role_snapshot_ref: structuredClone(match.role_snapshot_ref),
    capability_snapshot_ref: structuredClone(match.capability_snapshot_ref),
    responsible_role_ref: match.responsible_role_ref,
    required_capability_refs: [...match.required_capability_refs],
    actor_ref: "actor:kvds-se",
    performing_agent_id: assignment.performer_binding.performing_agent_id,
    bot_ref: assignment.performer_binding.bot_ref,
    executor_ref: assignment.performer_binding.executor_ref,
    profile_ref: lineage.deployment.profile_ref,
    session_ref: lineage.deployment.session_ref,
    deployment_ref: lineage.deployment.deployment_ref,
    deployment_digest: lineage.deployment.deployment_digest,
    requested_model: "gpt-5.6-terra",
    requested_effort: "max",
    observed_model: "UNKNOWN",
    observed_effort: "UNKNOWN",
    tool_authority_ref: "tool-authority:kvds-se-i/v1",
    tool_authority_epoch: 3,
    tool_policy_digest: sha("8"),
    authorized_tool_refs: ["tool:engineering-mcp/v0", "tool:requirements-review"],
    required_tool_refs: ["tool:engineering-mcp/v0"],
  };
  const current = {
    schema_version: TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA,
    status: "TRUSTED_CURRENT",
    evaluation_ref: "executor-current-evaluation:kvds-se-i",
    evaluated_at: ADMISSION_AT,
    authority_state_evaluation_ref: selectedAgent.verified.authority_state_evaluation_ref,
    authority_ref: selectedAgent.verified.authority_ref,
    current_authority_epoch: selectedAgent.verified.current_authority_epoch,
    project_scope_ref: PROJECT,
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
  return { binding, current };
}

async function mcpReadback(forge, team, selectedAgent) {
  const facade = createEngineeringMcpReadFacade({
    enabled: true,
    actor: { actor_ref: "actor:kvds-se", project_scopes: [PROJECT] },
    clock: () => ADMISSION_AT,
    providers: {
      "task.get_official": () => ({
        task_ref: forge.officialTask.task_ref,
        status: "Todo",
        assignee_ref: forge.assignment.actor_ref,
        priority: "P1",
        due: forge.assignment.expires_at,
        source_system: "synthetic-linear-writer",
      }),
      "work.get_brief": () => ({
        work_brief_ref: forge.brief.brief_id,
        task_ref: forge.officialTask.task_ref,
        input_bundle_manifest_digest: forge.brief.input_bundle_manifest_digest,
        expires_at: forge.brief.expires_at,
      }),
      "context.get_accepted_generation": (args) => {
        if (args.project_ref !== PROJECT || args.generation_ref !== ACCEPTED_CONTEXT.generation_ref) {
          throw new Error("not available");
        }
        return {
          generation_ref: ACCEPTED_CONTEXT.generation_ref,
          manifest_digest: ACCEPTED_CONTEXT.manifest_digest,
          accepted_at: ACCEPTED_CONTEXT.accepted_at,
        };
      },
      "agent.get_assignment_binding": () => ({
        deployment_ref: selectedAgent.prepared.record.deployment.deployment_ref,
        mark_ref: selectedAgent.prepared.record.mark.mark_ref,
        binding_state: team.admitted.status,
      }),
    },
  });
  const server = createEngineeringMcpStdioServer({ enabled: true, facade });
  const input = new PassThrough();
  const output = new PassThrough();
  output.setEncoding("utf8");
  let stdout = "";
  output.on("data", (chunk) => { stdout += chunk; });
  const running = runEngineeringMcpStdio({ server, input, output });
  const calls = [
    [1, "task.get_official", { task_ref: forge.officialTask.task_ref }],
    [2, "work.get_brief", { assignment_id: forge.assignment.assignment_id }],
    [3, "context.get_accepted_generation", {
      project_ref: PROJECT, generation_ref: ACCEPTED_CONTEXT.generation_ref,
    }],
    [4, "agent.get_assignment_binding", { assignment_id: forge.assignment.assignment_id }],
  ];
  for (const [id, name, args] of calls) {
    input.write(`${JSON.stringify({
      jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args },
    })}\n`);
  }
  input.end();
  await running;
  const rows = stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 4);
  assert.equal(rows.every((row) => row.result.structuredContent.ok === true), true);
  assert.equal(rows[0].result.structuredContent.result.task_ref, forge.officialTask.task_ref);
  assert.equal(rows[1].result.structuredContent.result.work_brief_ref, forge.brief.brief_id);
  assert.equal(rows[2].result.structuredContent.result.generation_ref, ACCEPTED_CONTEXT.generation_ref);
  assert.equal(rows[3].result.structuredContent.result.mark_ref,
    selectedAgent.prepared.record.mark.mark_ref);
}

function authenticatedCustody(execution, forge, selectedAgent) {
  const lineage = selectedAgent.prepared.record;
  const fileManifest = [{
    relative_path: "report/kvds-review.md",
    role_ref: "artifact-role.primary",
    byte_size: 256,
    content_sha256: sha("9"),
  }];
  const body = {
    schema_version: AUTHENTICATED_ARTIFACT_CUSTODY_RECEIPT_SCHEMA,
    status: "AUTHENTICATED_CUSTODY",
    custody_receipt_ref: "custody.kvds-full-review.001",
    upload_ticket_ref: "upload-ticket.kvds-full-review.001",
    authentication_receipt_ref: "upload-auth.kvds-full-review.001",
    authentication_claim_digest: sha("6"),
    submission_id: "submission.kvds-full-review.001",
    idempotency_key: "submission-key.kvds-full-review.001",
    project_ref: PROJECT,
    task_ref: structuredClone(TASK_REF),
    assignment_ref: forge.assignment.assignment_id,
    assignment_epoch: forge.assignment.assignment_epoch,
    task_authority_ref: execution.authority_ref,
    assignment_policy_revision_ref: structuredClone(execution.assignment_policy_revision_ref),
    run_id: execution.run_id,
    fencing_epoch: execution.fencing_epoch,
    agent_mark_ref: lineage.mark.mark_ref,
    performing_agent_id: execution.attribution.performing_agent_id,
    bot_ref: execution.attribution.bot_ref,
    executor_ref: execution.attribution.executor_ref,
    deployment_ref: lineage.deployment.deployment_ref,
    deployment_digest: lineage.deployment.deployment_digest,
    work_brief_revision_ref: structuredClone(execution.claim.work_brief_revision_ref),
    logical_artifact_id: "artifact.kvds-full-review",
    parent_revision_id: null,
    file_manifest: fileManifest,
    file_count: 1,
    total_size: 256,
    manifest_digest: digestArtifactFileManifest(fileManifest),
    content_sha256: sha("9"),
    scan_state: "clean",
    quarantine_state: "released",
    source_refs: [ACCEPTED_CONTEXT.receipt_ref],
    result_ref: execution.result_ref,
    evidence_refs: [...execution.evidence_refs],
    uploader_authority_ref: "authority.kvds-artifact-upload",
    uploader_authority_epoch: 13,
    trusted_pin_ref: selectedAgent.verified.trusted_pin_ref,
    trusted_pin_digest: selectedAgent.verified.receipt_digest,
  };
  return { ...body, receipt_digest: digestAuthenticatedCustodyReceipt(body) };
}

function trustedCustodyState(custody) {
  const body = {
    schema_version: TRUSTED_VAULT_SUBMISSION_CURRENT_SCHEMA,
    status: "TRUSTED_CURRENT",
    evaluation_ref: "vault-current.kvds-full-review.001",
    project_ref: custody.project_ref,
    task_ref: structuredClone(custody.task_ref),
    assignment_ref: custody.assignment_ref,
    current_assignment_epoch: custody.assignment_epoch,
    task_authority_ref: custody.task_authority_ref,
    assignment_policy_revision_ref: structuredClone(custody.assignment_policy_revision_ref),
    run_id: custody.run_id,
    run_state: "succeeded",
    fencing_epoch: custody.fencing_epoch,
    agent_mark_ref: custody.agent_mark_ref,
    performing_agent_id: custody.performing_agent_id,
    bot_ref: custody.bot_ref,
    executor_ref: custody.executor_ref,
    deployment_ref: custody.deployment_ref,
    deployment_digest: custody.deployment_digest,
    work_brief_revision_ref: structuredClone(custody.work_brief_revision_ref),
    logical_artifact_id: custody.logical_artifact_id,
    current_parent_revision_id: custody.parent_revision_id,
    expected_file_count: custody.file_count,
    expected_total_size: custody.total_size,
    expected_manifest_digest: custody.manifest_digest,
    expected_content_sha256: custody.content_sha256,
    expected_source_refs: [...custody.source_refs],
    expected_result_ref: custody.result_ref,
    expected_evidence_refs: [...custody.evidence_refs],
    expected_authentication_receipt_ref: custody.authentication_receipt_ref,
    expected_authentication_claim_digest: custody.authentication_claim_digest,
    uploader_authority_ref: custody.uploader_authority_ref,
    current_uploader_authority_epoch: custody.uploader_authority_epoch,
    trusted_pin_ref: custody.trusted_pin_ref,
    trusted_pin_digest: custody.trusted_pin_digest,
    consumed_custody_receipt_refs: [],
    consumed_idempotency_keys: [],
  };
  return { ...body, evaluation_digest: digestTrustedSubmissionCurrentState(body) };
}

function bindAuthorizedHermesRuntime(admission, configuredRuntime, executorOptions) {
  const keys = configuredRuntime && typeof configuredRuntime === "object"
    ? Reflect.ownKeys(configuredRuntime) : [];
  if (admission?.status !== "ADMITTED"
    || keys.length !== AUTHORIZED_RUNTIME_KEYS.length
    || !AUTHORIZED_RUNTIME_KEYS.every((key) => Object.hasOwn(configuredRuntime, key))) {
    return Object.freeze({ status: "HOLD", hold_code: "runtime_binding_invalid" });
  }
  const binding = admission.executor_binding;
  const exact = binding.performing_agent_id === configuredRuntime.performing_agent_id
    && binding.bot_ref === configuredRuntime.bot_ref
    && binding.executor_ref === configuredRuntime.executor_ref
    && binding.profile_ref === configuredRuntime.profile_ref
    && binding.session_ref === configuredRuntime.session_ref
    && binding.deployment_ref === configuredRuntime.deployment_ref
    && binding.deployment_digest === configuredRuntime.deployment_digest
    && binding.requested_model === configuredRuntime.expected_model
    && binding.requested_effort === configuredRuntime.expected_effort;
  if (!exact) {
    return Object.freeze({ status: "HOLD", hold_code: "runtime_binding_mismatch" });
  }
  return Object.freeze({
    status: "BOUND",
    executor: createHermesBotSubmitExecutor({
      ...executorOptions,
      runtime_binding: {
        performing_agent_id: configuredRuntime.performing_agent_id,
        bot_ref: configuredRuntime.bot_ref,
        durable_session_key: configuredRuntime.session_ref,
        expected_model: configuredRuntime.expected_model,
        executable_path: configuredRuntime.executable_path,
        executable_sha256: configuredRuntime.executable_sha256,
        HERMES_HOME: configuredRuntime.HERMES_HOME,
        working_directory: configuredRuntime.working_directory,
      },
    }),
  });
}

test("KVDS full contract holds drift, executes Hermes once, and accepts only reviewed custody", async () => {
  const team = prepareTeam();
  const selectedAgent = team.agents[1];
  assert.equal(team.admitted.project_scope_ref, PROJECT);
  assert.equal(team.admitted.approved_project_mark_deployment_bindings.some((entry) => (
    entry.mark_ref === selectedAgent.prepared.record.mark.mark_ref
      && entry.deployment_ref === selectedAgent.prepared.record.deployment.deployment_ref
  )), true);

  const forge = await forgeAndLinear();
  assert.deepEqual(forge.admitted.task_ref, TASK_REF);
  assert.equal(forge.admitted.issued_work_brief_bindings.input_bundle_manifest_digest,
    ACCEPTED_CONTEXT.manifest_digest.slice("sha256:".length));

  let executorCalls = 0;
  const wrongProject = structuredClone(forge.request);
  wrongProject.execution_binding.project_scope_ref = "project:msh";
  assert.equal(admitForgeLinearExecutionPacket(wrongProject).status, "HOLD");
  const wrongBrief = structuredClone(forge.request);
  wrongBrief.execution_binding.work_brief_content_sha256 = sha("f");
  assert.equal(admitForgeLinearExecutionPacket(wrongBrief).status, "HOLD");
  assert.equal(executorCalls, 0, "project and brief drift hold before executor lookup");

  const match = roleMatch(forge.admitted);
  assert.equal(match.state, "candidate", JSON.stringify(match));
  const assignment = assignmentFor(match);
  assert.equal(assignment.assignment_state, "assigned", JSON.stringify(assignment));
  const authority = authorityPackets(forge.admitted, match, assignment, selectedAgent);
  const authorityRequest = {
    candidate_packet: forge.admitted.candidate_packet,
    task_packet: forge.admitted.task_packet,
    assignment_packet: assignment,
    role_capability_match: match,
    verified_active_binding: selectedAgent.verified,
    trusted_current_evaluation: authority.current,
    executor_binding: authority.binding,
  };
  const wrongMark = structuredClone(authorityRequest);
  wrongMark.executor_binding.mark_ref = "agent-mark:kvds-wrong";
  assert.equal(admitCandidateExecutorAuthority(wrongMark).status, "HOLD");
  assert.equal(executorCalls, 0, "Mark drift holds before Coordinator and Hermes");
  const authorized = admitCandidateExecutorAuthority(authorityRequest);
  assert.equal(authorized.status, "ADMITTED", JSON.stringify(authorized));
  assert.equal(authorized.executor_binding.mark_ref,
    selectedAgent.prepared.record.mark.mark_ref);

  await mcpReadback(forge, team, selectedAgent);

  const workBriefText = "Public-safe synthetic KVDS systems-engineering Work Brief.";
  const configuredRuntime = {
    performing_agent_id: authorized.executor_binding.performing_agent_id,
    bot_ref: authorized.executor_binding.bot_ref,
    executor_ref: authorized.executor_binding.executor_ref,
    profile_ref: authorized.executor_binding.profile_ref,
    session_ref: authorized.executor_binding.session_ref,
    deployment_ref: authorized.executor_binding.deployment_ref,
    deployment_digest: authorized.executor_binding.deployment_digest,
    expected_model: authorized.executor_binding.requested_model,
    expected_effort: authorized.executor_binding.requested_effort,
    executable_path: RUNTIME_EXE,
    executable_sha256: RUNTIME_SHA,
    HERMES_HOME: RUNTIME_HOME,
    working_directory: RUNTIME_WORK,
  };
  for (const [field, driftedValue] of [
    ["profile_ref", "profile:kvds-wrong"],
    ["session_ref", "session:kvds-wrong/canonical"],
    ["deployment_ref", "agent-deployment:kvds-wrong"],
    ["deployment_digest", sha("0")],
    ["expected_model", "gpt-5.6-wrong"],
    ["expected_effort", "low"],
  ]) {
    const drifted = { ...configuredRuntime, [field]: driftedValue };
    assert.deepEqual(bindAuthorizedHermesRuntime(authorized, drifted, {}), {
      status: "HOLD", hold_code: "runtime_binding_mismatch",
    });
  }
  assert.equal(executorCalls, 0, "runtime drift holds before Coordinator and Hermes");
  const boundRuntime = bindAuthorizedHermesRuntime(authorized, configuredRuntime, {
    feature_enabled: true,
    wait_seconds: 45,
    async resolveWorkBrief(ref) {
      assert.deepEqual(ref, forge.admitted.task_packet.work_brief_revision_ref);
      return workBriefText;
    },
    async inspectFile(candidate) {
      assert.equal(candidate, RUNTIME_EXE);
      return { is_file: true, is_reparse_point: false };
    },
    async hashFile(candidate) {
      assert.equal(candidate, RUNTIME_EXE);
      return RUNTIME_SHA;
    },
    async runCommand(command) {
      executorCalls += 1;
      assert.equal(command.shell, false);
      assert.deepEqual(command.stdin, Buffer.from(workBriefText, "utf8"));
      const rows = [
        {
          schema_version: "hermes.bot_submit.v1", event: "accepted", state: "accepted",
          request_id: "request-kvds-full-001", session_key: configuredRuntime.session_ref,
          model: configuredRuntime.expected_model,
        },
        {
          schema_version: "hermes.bot_submit.v1", event: "completed", state: "completed",
          status: "complete", request_id: "request-kvds-full-001",
          text: "Public-safe synthetic KVDS review result.",
        },
      ];
      return { exit_code: 0, stdout: rows.map(JSON.stringify).join("\n"), stderr: "" };
    },
    now: () => 1_777_777_777_000,
  });
  assert.equal(boundRuntime.status, "BOUND");
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([[authorized.executor_binding.executor_ref, boundRuntime.executor]]),
  });
  const dispatchRequest = {
    candidate_packet: forge.admitted.candidate_packet,
    task_packet: forge.admitted.task_packet,
    assignment_packet: assignment,
    idempotency_key: "dispatch:kvds-full-001",
    successor_of_receipt_id: null,
  };
  const executed = await coordinator.dispatch(dispatchRequest);
  assert.equal(executed.status, "succeeded", JSON.stringify(executed));
  assert.equal(executorCalls, 1);
  assert.equal(executed.execution_receipt.official_task_done, false);
  assert.equal(executed.execution_receipt.official_task_mutated, false);
  assert.deepEqual(executed.execution_receipt.claim.task_ref, TASK_REF);
  assert.deepEqual(executed.execution_receipt.claim.work_brief_revision_ref,
    forge.admitted.task_packet.work_brief_revision_ref);
  const replay = await coordinator.dispatch(dispatchRequest);
  assert.equal(replay.status, "NO_OP");
  assert.equal(replay.replayed, true);
  assert.equal(executorCalls, 1, "Coordinator replay never calls Hermes twice");
  assert.deepEqual(coordinator.inspect().external_effects, {
    linear_writes: "UNKNOWN",
    network_calls: "UNKNOWN",
    filesystem_writes: "UNKNOWN",
    shell_commands: "UNKNOWN",
  });

  assert.equal(admitHermesArtifactSubmission({
    execution_receipt: executed.execution_receipt,
  }).status, "HOLD", "a Hermes result cannot bypass authenticated custody");
  const custody = authenticatedCustody(executed.execution_receipt, forge, selectedAgent);
  assert.equal(custody.project_ref, PROJECT);
  assert.deepEqual(custody.task_ref, TASK_REF);
  assert.deepEqual(custody.work_brief_revision_ref,
    forge.admitted.task_packet.work_brief_revision_ref);
  assert.equal(custody.agent_mark_ref, selectedAgent.prepared.record.mark.mark_ref);
  const proposal = admitHermesArtifactSubmission({
    execution_receipt: executed.execution_receipt,
    upload_custody_receipt: custody,
    trusted_current_state: trustedCustodyState(custody),
  });
  assert.equal(proposal.status, "PROPOSED", JSON.stringify(proposal));
  assert.equal(proposal.claim, "proposal_only_no_store_mutation_no_revision_no_acceptance");

  const vault = createVaultRevisionCore();
  const scope = { project_ref: PROJECT };
  vault.registerLogicalArtifact({
    logical_artifact_id: custody.logical_artifact_id,
    artifact_kind: "review_report",
    project_ref: PROJECT,
    logical_owner_ref: "vault.catalog",
    byte_owner_ref: "custody.store",
    revision_owner_ref: "vault.revision-ledger",
    acceptance_owner_ref: "owner.human-acceptor",
    backup_restore_owner_ref: "bastion.backup-policy",
  });
  vault.recordSubmission(proposal.vault_inputs.record_submission_input);
  vault.recordCustodyReceipt(proposal.vault_inputs.record_custody_receipt_input);
  vault.recordScanClass(
    proposal.vault_inputs.record_scan_class_input.custody_receipt_ref,
    proposal.vault_inputs.record_scan_class_input.scan_class,
  );
  vault.createRevisionCandidate({
    logical_artifact_id: custody.logical_artifact_id,
    custody_receipt_ref: custody.custody_receipt_ref,
    assignment_ref: custody.assignment_ref,
    artifact_revision_id: "revision.kvds-full-review.001",
    parent_revision_id: null,
  }, scope);
  assert.equal(vault.getAcceptedHead(custody.logical_artifact_id, scope), null,
    "custody and candidate alone never move the accepted head");
  vault.recordReview({
    artifact_revision_id: "revision.kvds-full-review.001",
    review_ref: "review.kvds-full-review.001",
    reviewer_ref: "actor.kvds-independent-reviewer",
    verdict: "ACCEPT",
  }, scope);
  assert.equal(vault.getAcceptedHead(custody.logical_artifact_id, scope), null,
    "independent review alone is not human acceptance");
  vault.recordHumanAcceptance({
    artifact_revision_id: "revision.kvds-full-review.001",
    acceptance_owner_ref: "owner.human-acceptor",
    acceptance_ref: "acceptance.kvds-full-review.001",
  }, scope);
  assert.equal(vault.getAcceptedHead(custody.logical_artifact_id, scope),
    "revision.kvds-full-review.001");
});
