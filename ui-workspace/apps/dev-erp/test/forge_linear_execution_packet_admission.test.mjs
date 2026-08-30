import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    expires_at: "2026-09-15",
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
      executor_ref: "executor:kvds-se-i",
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
    issued_at: "2026-08-31T01:00:00.000Z",
    verified_at: "2026-08-31T01:01:00.000Z",
    expires_at: "2026-08-31T03:00:00.000Z",
    receipt_epoch: 7,
    trusted_authority_epoch: 7,
    revoked: false,
  };
  const state = {
    schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: "authority-state-evaluation:kvds-se-i",
    evaluated_at: "2026-08-31T01:02:00.000Z",
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
    executor_ref: "executor:kvds-se-i",
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
    evaluated_at: "2026-08-31T01:03:00.000Z",
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

test("actual Forge outputs and current Linear Todo evidence become exact coordinator packets", async () => {
  const outputs = await forgeOutputs();
  const admitted = admitForgeLinearExecutionPacket(requestFor(outputs));

  assert.equal(admitted.status, "ADMITTED", JSON.stringify(admitted));
  assert.equal(admitted.schema_version, FORGE_LINEAR_EXECUTION_PACKET_ADMISSION_SCHEMA);
  assert.deepEqual(admitted.task_ref, { provider: "linear", task_id: "KVDS-001" });
  assert.deepEqual(admitted.work_brief_revision_ref, {
    provider: "linear",
    task_id: "KVDS-001",
    revision_id: "brief.kvds-001",
    content_sha256: digestOf(outputs.brief),
  });
  assert.deepEqual(admitted.task_packet.coverage_refs, [
    "receipt:accepted-context-g1",
    "receipt:linear-read-kvds-001",
  ]);
  assert.deepEqual(admitted.forge_binding_refs, {
    intent_ref: "intent.kvds-001",
    assignment_ref: "assignment.kvds-001",
    brief_ref: "brief.kvds-001",
    source_draft_ref: null,
    writer_ref: "writer.linear.owner-gated",
    linear_read_receipt_ref: "receipt:linear-read-kvds-001",
    linear_read_receipt_digest:
      requestFor(outputs).linear_official_task_read_evidence.read_receipt_digest,
  });
  for (const field of [
    "problem", "requested_outcome", "allowed_write_scope", "required_evidence",
    "stop_conditions", "escalation_path", "input_bundle_manifest_digest",
    "required_review_role",
  ]) assert.deepEqual(admitted.issued_work_brief_bindings[field], outputs.brief[field], field);

  const match = matchRoleCapabilities({
    work_task_contract: admitted.work_task_contract,
    role_snapshot: roleSnapshot(),
    capability_snapshot: capabilitySnapshot(),
  });
  assert.equal(match.state, "candidate", JSON.stringify(match));
  const assignment = assignCandidate({
    matcher_result: match,
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: SHA_D },
    },
  });
  assert.equal(assignment.assignment_state, "assigned", JSON.stringify(assignment));

  const verified = verifiedActiveBinding();
  const executor = executorBinding(admitted, match);
  const current = currentEvaluation(verified, executor);
  assert.deepEqual(match.role_snapshot_ref, executor.role_snapshot_ref);
  assert.deepEqual(match.capability_snapshot_ref, executor.capability_snapshot_ref);
  assert.deepEqual(assignment.performer_binding.capability_snapshot_ref,
    executor.capability_snapshot_ref);
  assert.equal(match.responsible_role_ref, executor.responsible_role_ref);
  assert.equal(match.responsible_actor_ref, executor.actor_ref);
  assert.equal(assignment.responsible_role_ref, executor.responsible_role_ref);
  assert.deepEqual(match.required_capability_refs, executor.required_capability_refs);
  assert.deepEqual(current.role_snapshot_ref, executor.role_snapshot_ref);
  assert.deepEqual(current.capability_snapshot_ref, executor.capability_snapshot_ref);
  assert.equal(current.responsible_role_ref, executor.responsible_role_ref);
  assert.equal(current.actor_ref, executor.actor_ref);
  assert.deepEqual(current.required_capability_refs, executor.required_capability_refs);
  const authorityAdmission = admitCandidateExecutorAuthority({
    candidate_packet: admitted.candidate_packet,
    task_packet: admitted.task_packet,
    assignment_packet: assignment,
    role_capability_match: match,
    verified_active_binding: verified,
    trusted_current_evaluation: current,
    executor_binding: executor,
  });
  assert.equal(authorityAdmission.status, "ADMITTED", JSON.stringify(authorityAdmission));
  assert.equal(authorityAdmission.assignment_epoch, 11);
  assert.equal(authorityAdmission.project_scope_ref, PROJECT);

  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map(),
  });
  const compatibility = await coordinator.dispatch({
    candidate_packet: admitted.candidate_packet,
    task_packet: admitted.task_packet,
    assignment_packet: assignment,
    idempotency_key: "dispatch:kvds-001",
    successor_of_receipt_id: null,
  });
  assert.deepEqual(compatibility, { status: "HOLD", hold_code: "EXECUTOR_UNAVAILABLE" });
  assert.deepEqual(coordinator.inspect().external_effects, {
    linear_writes: 0,
    network_calls: 0,
    filesystem_writes: 0,
    shell_commands: 0,
  });
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.task_packet), true);
  assert.equal(Object.isFrozen(admitted.issued_work_brief_bindings), true);
});

test("stale, revoked, non-Todo, wrong project/task/assignment/brief inputs fail before Coordinator", async () => {
  const outputs = await forgeOutputs();
  const base = requestFor(outputs);
  const cases = [
    ["linear stale", (value) => {
      value.linear_official_task_read_evidence.evidence_state = "stale";
      refreshLinearDigest(value);
    },
      "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_STALE"],
    ["linear revoked", (value) => {
      value.linear_official_task_read_evidence.evidence_state = "revoked";
      refreshLinearDigest(value);
    },
      "LINEAR_OFFICIAL_TASK_REVOKED"],
    ["not Todo", (value) => {
      value.linear_official_task_read_evidence.task_status = "InProgress";
      refreshLinearDigest(value);
    },
      "LINEAR_OFFICIAL_TASK_NOT_TODO"],
    ["wrong project", (value) => { value.execution_binding.project_scope_ref = "project:msh"; },
      "FORGE_LINEAR_PROJECT_SCOPE_MISMATCH"],
    ["assignment stale", (value) => { value.execution_binding.assignment_state = "stale"; },
      "FORGE_ASSIGNMENT_STALE"],
    ["assignment revoked", (value) => { value.execution_binding.assignment_state = "revoked"; },
      "FORGE_ASSIGNMENT_REVOKED"],
    ["assignment epoch", (value) => { value.execution_binding.assignment_epoch = 12; },
      "FORGE_ASSIGNMENT_BINDING_MISMATCH"],
    ["assignment actor", (value) => { value.execution_binding.responsible_actor_ref = "actor:other"; },
      "FORGE_ASSIGNMENT_BINDING_MISMATCH"],
    ["source receipt", (value) => { value.execution_binding.source_receipt_refs = ["receipt:other"]; },
      "FORGE_LINEAR_SOURCE_RECEIPT_MISMATCH"],
    ["task ref", (value) => {
      value.linear_official_task_read_evidence.forge_task_ref = "linear.task:other";
      refreshLinearDigest(value);
    },
      "FORGE_LINEAR_TASK_ID_MISMATCH"],
    ["brief revision", (value) => { value.execution_binding.work_brief_revision_id = "brief.other"; },
      "FORGE_WORK_BRIEF_BINDING_MISMATCH"],
    ["brief digest", (value) => { value.execution_binding.work_brief_content_sha256 = `sha256:${"f".repeat(64)}`; },
      "FORGE_WORK_BRIEF_DIGEST_MISMATCH"],
    ["linear read digest", (value) => { value.linear_official_task_read_evidence.read_receipt_digest = `sha256:${"f".repeat(64)}`; },
      "LINEAR_OFFICIAL_TASK_READ_EVIDENCE_DIGEST_MISMATCH"],
    ["brief incomplete", (value) => { delete value.forge_issued_work_brief.required_evidence; },
      "FORGE_WORK_BRIEF_INCOMPLETE"],
  ];
  for (const [name, mutate, expected] of cases) {
    const request = structuredClone(base);
    mutate(request);
    assert.deepEqual(admitForgeLinearExecutionPacket(request), {
      status: "HOLD",
      hold_code: expected,
    }, name);
  }
  const draft = structuredClone(base);
  draft.forge_issued_work_brief = {
    draft_ref: "draft.kvds-001",
    assignment_id: "assignment.kvds-001",
    draft_revision: 1,
    bindings: {},
    missing_bindings: ["problem"],
    complete: false,
    claim: "draft_not_issuable_material",
  };
  assert.deepEqual(admitForgeLinearExecutionPacket(draft), {
    status: "HOLD",
    hold_code: "FORGE_WORK_BRIEF_NOT_ISSUED",
  });
});

test("unknown, secret, local-path, accessor, and hostile inputs return fixed redacted HOLDs", async () => {
  const outputs = await forgeOutputs();
  const unknown = { ...requestFor(outputs), unexpected: "do-not-reflect" };
  const secret = requestFor(outputs);
  secret.execution_binding.action_ref = "Bearer abcdefghijklmnop";
  const local = structuredClone(requestFor(outputs));
  local.forge_issued_work_brief.allowed_write_scope = [
    "C" + ":" + "\\" + ["private", "work"].join("\\"),
  ];
  const accessor = requestFor(outputs);
  Object.defineProperty(accessor.execution_binding, "action_ref", {
    enumerable: true,
    get: () => "action:forged",
  });
  const hostile = new Proxy({}, { ownKeys() { throw new Error("refuse"); } });
  const cases = [
    [unknown, "FORGE_LINEAR_ADMISSION_REQUEST_INVALID"],
    [secret, "FORGE_LINEAR_ADMISSION_SECRET_FORBIDDEN"],
    [local, "FORGE_LINEAR_ADMISSION_LOCAL_PATH_FORBIDDEN"],
    [accessor, "FORGE_LINEAR_ADMISSION_ACCESSOR_FORBIDDEN"],
    [hostile, "FORGE_LINEAR_ADMISSION_HOSTILE_INPUT"],
  ];
  for (const [request, expected] of cases) {
    const result = admitForgeLinearExecutionPacket(request);
    assert.deepEqual(result, { status: "HOLD", hold_code: expected });
    assert.deepEqual(Object.keys(result), ["status", "hold_code"]);
  }
});

test("the admission seam has no Linear, writer, claim, execution, Agent selection, filesystem, network, or clock surface", () => {
  const source = readFileSync(
    new URL("../src/forge_linear_execution_packet_admission.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "from \"node:fs\"", "from \"node:http\"", "from \"node:https\"", "fetch(",
    "Date.now(", "setTimeout(", "writeFile", "appendFile", "spawn(", "exec(",
    "process.env", "createOfficialTask", "createCandidateExecutionCoordinator",
    "createHermesBotSubmitExecutor", "matchRoleCapabilities", "assignCandidate(",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
