import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  computeUnverifiedAgentApprovalClaimDigest,
  verifyAgentWorkforceAuthorityClaim,
} from "../../../../guild_hall/agent_observation/agent_authority_verification.mjs";
import { matchRoleCapabilities } from "../src/role_capability_matcher.mjs";
import { assignCandidate } from "../src/assignment_policy.mjs";
import {
  CANDIDATE_EXECUTION_AUTHORITY_ADMISSION_SCHEMA,
  CANDIDATE_EXECUTION_AUTHORITY_HOLD_CODES as H,
  EXECUTOR_AUTHORITY_BINDING_SCHEMA,
  TRUSTED_EXECUTOR_CURRENT_EVALUATION_SCHEMA,
  admitCandidateExecutorAuthority,
} from "../src/candidate_execution_authority_adapter.mjs";
import { createCandidateExecutionCoordinator } from "../src/candidate_execution_coordinator.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const PROJECT = "project:kvds";
const FAMILY = "agent-family:kvds-se";
const MARK = "agent-mark:kvds-se-i";
const DEPLOYMENT = "agent-deployment:kvds-se-i";

function taskRef(taskId = "KVDS-ADMISSION-001") {
  return { provider: "linear", task_id: taskId };
}

function revisionRef(taskId = "KVDS-ADMISSION-001") {
  return {
    provider: "linear",
    task_id: taskId,
    revision_id: "work-brief-r1",
    content_sha256: sha("a"),
  };
}

function taskPacket(taskId = "KVDS-ADMISSION-001") {
  return {
    schema_version: "soulforge.candidate_execution.task_packet.v1",
    validation_state: "prevalidated",
    task_class: "official",
    task_status: "Todo",
    task_ref: taskRef(taskId),
    parent_task_ref: null,
    work_brief_revision_ref: revisionRef(taskId),
    action_ref: "prepare.kvds.review",
    authority_ref: "authority:kvds-task.v1",
    coverage_refs: ["coverage:kvds-review"],
  };
}

function candidatePacket(task) {
  return {
    schema_version: "soulforge.candidate_execution.candidate_packet.v1",
    validation_state: "prevalidated",
    selection_state: "candidate",
    candidate_ref: "candidate:kvds-admission-001",
    label_prefilter_passed: true,
    task_ref: structuredClone(task.task_ref),
    work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
    action_ref: task.action_ref,
    authority_ref: task.authority_ref,
  };
}

function roleCapabilityMatch(task) {
  return matchRoleCapabilities({
    work_task_contract: {
      schema_version: "soulforge.role_capability.work_task_contract.v1",
      validation_state: "prevalidated",
      task_ref: structuredClone(task.task_ref),
      work_brief_revision_ref: structuredClone(task.work_brief_revision_ref),
      action_ref: task.action_ref,
      authority_ref: task.authority_ref,
      required_role_ref: "role:kvds-se",
      required_capability_refs: ["cap:artifact-review", "cap:se-analysis"],
    },
    role_snapshot: {
      schema_version: "soulforge.organization.role_snapshot.v1",
      snapshot_ref: { revision_id: "role-snapshot-r1", content_sha256: sha("b") },
      roles: [{
        role_ref: "role:kvds-se",
        status: "active",
        responsible_action_refs: [task.action_ref],
        responsible_actor_ref: "actor:kvds-se",
        candidate_actor_refs: ["actor:kvds-se"],
      }],
    },
    capability_snapshot: {
      schema_version: "soulforge.organization.capability_snapshot.v1",
      snapshot_ref: { revision_id: "capability-snapshot-r1", content_sha256: sha("c") },
      actor_bindings: [{
        actor_ref: "actor:kvds-se",
        performing_agent_id: "agent:kvds-se-i",
        bot_ref: "bot:kvds-se-i",
        executor_ref: "executor:kvds-se-i",
        status: "active",
        capability_refs: ["cap:artifact-review", "cap:se-analysis"],
      }],
    },
  });
}

function assignmentPacket(match) {
  return assignCandidate({
    matcher_result: match,
    policy: {
      schema_version: "soulforge.assignment_policy.snapshot.v1",
      validation_state: "prevalidated",
      mode: "responsible_ceo_triage",
      policy_revision_ref: { revision_id: "assignment-policy-r1", content_sha256: sha("d") },
    },
  });
}

function verifiedActiveBinding() {
  const projection = {
    project_scope_ref: PROJECT,
    project_scope_refs: [PROJECT],
    lineage_digest: sha("1"),
    family_ref: FAMILY,
    family_digest: sha("2"),
    mark_ref: MARK,
    mark_digest: sha("3"),
    deployment_ref: DEPLOYMENT,
    deployment_digest: sha("4"),
    memory_generation_ref: "memory-generation:kvds-se-i",
    memory_digest: sha("5"),
    authority_receipt_ref: "approval-receipt:kvds-se-i",
    authority_receipt_verified: false,
  };
  const digested = computeUnverifiedAgentApprovalClaimDigest(projection, PROJECT);
  assert.equal(digested.status, "UNVERIFIED_CLAIM_DIGESTED");
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
    approval_claim_digest: digested.claim_digest,
    authority_receipt_ref: projection.authority_receipt_ref,
    authority_receipt_digest: sha("6"),
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

function executorBinding(match, over = {}) {
  return {
    schema_version: EXECUTOR_AUTHORITY_BINDING_SCHEMA,
    assignment_epoch: 11,
    project_scope_ref: PROJECT,
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
    deployment_digest: sha("4"),
    requested_model: "gpt-5.6-terra",
    requested_effort: "max",
    observed_model: "UNKNOWN",
    observed_effort: "UNKNOWN",
    tool_authority_ref: "tool-authority:kvds-se-i/v1",
    tool_authority_epoch: 3,
    tool_policy_digest: sha("7"),
    authorized_tool_refs: ["tool:artifact-read", "tool:evidence-submit"],
    required_tool_refs: ["tool:artifact-read"],
    ...over,
  };
}

function currentEvaluation(receipt, binding, over = {}) {
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
    ...over,
  };
}

function fixture(over = {}) {
  const task = taskPacket();
  const match = roleCapabilityMatch(task);
  const assignment = assignmentPacket(match);
  assert.equal(match.state, "candidate", JSON.stringify(match));
  assert.equal(assignment.assignment_state, "assigned", JSON.stringify(assignment));
  const receipt = verifiedActiveBinding();
  const binding = executorBinding(match, over.executor_binding);
  const evaluation = currentEvaluation(receipt, binding, over.trusted_current_evaluation);
  return {
    candidate_packet: candidatePacket(task),
    task_packet: task,
    assignment_packet: assignment,
    role_capability_match: match,
    verified_active_binding: receipt,
    trusted_current_evaluation: evaluation,
    executor_binding: binding,
  };
}

function succeededOutcome() {
  return {
    status: "succeeded",
    reason_code: null,
    result_ref: "result:kvds-admission-synthetic",
    artifact_refs: [],
    evidence_refs: ["evidence:kvds-admission-synthetic"],
    external_effect_evidence: {
      source: "executor.synthetic",
      receipt_ref: "receipt:synthetic-executor",
      linear_writes: 0,
      network_calls: 0,
      filesystem_writes: 0,
      shell_commands: 0,
    },
  };
}

test("exact verified authority and current executor binding produce a frozen coordinator-ready admission", async () => {
  const input = fixture();
  const admitted = admitCandidateExecutorAuthority(input);

  assert.equal(admitted.status, "ADMITTED", JSON.stringify(admitted));
  assert.equal(admitted.schema_version, CANDIDATE_EXECUTION_AUTHORITY_ADMISSION_SCHEMA);
  assert.equal(admitted.status, "ADMITTED");
  assert.equal(admitted.project_scope_ref, PROJECT);
  assert.equal(admitted.executor_binding.executor_ref, input.assignment_packet.performer_binding.executor_ref);
  assert.equal(admitted.executor_binding.bot_ref, input.assignment_packet.performer_binding.bot_ref);
  assert.equal(admitted.executor_binding.observed_model, "UNKNOWN");
  assert.equal(admitted.executor_binding.observed_effort, "UNKNOWN");
  assert.equal(admitted.effect_boundary.executor_called, false);
  assert.equal(admitted.effect_boundary.task_or_linear_mutated, false);
  assert.equal(admitted.effect_boundary.worker_success_treated_as_done, false);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.executor_binding), true);

  let calls = 0;
  const coordinator = createCandidateExecutionCoordinator({
    feature_enabled: true,
    executors: new Map([[admitted.executor_binding.executor_ref, {
      async execute(executeInput) {
        calls += 1;
        assert.deepEqual(executeInput.task_packet, input.task_packet);
        assert.deepEqual(executeInput.assignment_packet, input.assignment_packet);
        return succeededOutcome();
      },
    }]]),
  });
  const execution = admitted.status === "ADMITTED" ? await coordinator.dispatch({
    candidate_packet: input.candidate_packet,
    task_packet: input.task_packet,
    assignment_packet: input.assignment_packet,
    idempotency_key: "dispatch:kvds-admission-001",
    successor_of_receipt_id: null,
  }) : null;
  assert.equal(execution.status, "succeeded");
  assert.equal(execution.execution_receipt.official_task_done, false);
  assert.equal(execution.execution_receipt.official_task_mutated, false);
  assert.equal(calls, 1);
});

test("expired, revoked, stale authority or assignment epochs, and duplicate slots fail closed", () => {
  const expired = fixture({ trusted_current_evaluation: { evaluated_at: "2026-08-31T03:00:00.000Z" } });
  assert.deepEqual(admitCandidateExecutorAuthority(expired), hold(H.AUTHORITY_EXPIRED));

  const revoked = fixture();
  revoked.trusted_current_evaluation.revoked_binding_refs = [revoked.executor_binding.session_ref];
  assert.deepEqual(admitCandidateExecutorAuthority(revoked), hold(H.AUTHORITY_REVOKED));

  const staleAuthority = fixture();
  staleAuthority.trusted_current_evaluation.current_authority_epoch += 1;
  assert.deepEqual(admitCandidateExecutorAuthority(staleAuthority), hold(H.AUTHORITY_EPOCH_STALE));

  const staleAssignment = fixture();
  staleAssignment.trusted_current_evaluation.current_assignment_epoch += 1;
  assert.deepEqual(admitCandidateExecutorAuthority(staleAssignment), hold(H.ASSIGNMENT_EPOCH_STALE));

  const active = fixture();
  active.trusted_current_evaluation.active_slot_state = "active";
  active.trusted_current_evaluation.active_run_ref = "run:already-active";
  assert.deepEqual(admitCandidateExecutorAuthority(active), hold(H.DUPLICATE_ACTIVE_SLOT));
});

test("project, role-capability, Agent/Bot/profile/session, and tool authority drift are distinct HOLDs", () => {
  const project = fixture({ executor_binding: { project_scope_ref: "project:msh" } });
  project.trusted_current_evaluation.project_scope_ref = "project:msh";
  assert.deepEqual(admitCandidateExecutorAuthority(project), hold(H.PROJECT_SCOPE_MISMATCH));

  const capability = fixture();
  capability.executor_binding.required_capability_refs = ["cap:artifact-review"];
  assert.deepEqual(admitCandidateExecutorAuthority(capability), hold(H.ROLE_CAPABILITY_MISMATCH));

  const bot = fixture();
  bot.trusted_current_evaluation.bot_ref = "bot:other";
  assert.deepEqual(admitCandidateExecutorAuthority(bot), hold(H.AGENT_BINDING_MISMATCH));

  const session = fixture();
  session.trusted_current_evaluation.session_ref = "session:other";
  assert.deepEqual(admitCandidateExecutorAuthority(session), hold(H.AGENT_BINDING_MISMATCH));

  const tool = fixture();
  tool.executor_binding.required_tool_refs = ["tool:not-authorized"];
  assert.deepEqual(admitCandidateExecutorAuthority(tool), hold(H.TOOL_AUTHORITY_MISMATCH));

  const toolEpoch = fixture();
  toolEpoch.trusted_current_evaluation.tool_authority_epoch += 1;
  assert.deepEqual(admitCandidateExecutorAuthority(toolEpoch), hold(H.TOOL_AUTHORITY_MISMATCH));
});

test("requested and observed model or effort remain distinct and cannot be guessed", () => {
  const unknown = admitCandidateExecutorAuthority(fixture());
  assert.equal(unknown.status, "ADMITTED");
  assert.equal(unknown.executor_binding.requested_model, "gpt-5.6-terra");
  assert.equal(unknown.executor_binding.observed_model, "UNKNOWN");
  assert.equal(unknown.executor_binding.requested_effort, "max");
  assert.equal(unknown.executor_binding.observed_effort, "UNKNOWN");

  const observed = fixture({ executor_binding: {
    observed_model: "gpt-5.6-terra",
    observed_effort: "max",
  } });
  assert.equal(admitCandidateExecutorAuthority(observed).status, "ADMITTED");

  const wrongModel = fixture({ executor_binding: { observed_model: "gpt-5.6-sol" } });
  assert.deepEqual(admitCandidateExecutorAuthority(wrongModel), hold(H.MODEL_BINDING_MISMATCH));

  const wrongEffort = fixture({ executor_binding: { observed_effort: "high" } });
  assert.deepEqual(admitCandidateExecutorAuthority(wrongEffort), hold(H.EFFORT_BINDING_MISMATCH));
});

test("tampered receipt, mismatched execution basis, raw/path/secret/accessor/hostile inputs are redacted HOLD", () => {
  const tampered = fixture();
  tampered.verified_active_binding = structuredClone(tampered.verified_active_binding);
  tampered.verified_active_binding.project_scope_ref = "project:msh";
  assert.deepEqual(admitCandidateExecutorAuthority(tampered), hold(H.VERIFIED_BINDING_DIGEST_MISMATCH));

  const basis = fixture();
  basis.candidate_packet.action_ref = "prepare:other";
  assert.deepEqual(admitCandidateExecutorAuthority(basis), hold(H.EXECUTION_BASIS_MISMATCH));

  const raw = { ...fixture(), raw_body: "not allowed" };
  assert.deepEqual(admitCandidateExecutorAuthority(raw), hold(H.REQUEST_INVALID));

  const local = fixture();
  local.executor_binding.profile_ref = ["C:", "profiles", "kvds"].join("\\");
  assert.deepEqual(admitCandidateExecutorAuthority(local), hold(H.LOCAL_PATH_FORBIDDEN));

  const secret = fixture();
  secret.executor_binding.session_ref = "Bearer abcdefghijklmnop";
  assert.deepEqual(admitCandidateExecutorAuthority(secret), hold(H.SECRET_FORBIDDEN));

  const accessor = fixture();
  Object.defineProperty(accessor.executor_binding, "profile_ref", {
    enumerable: true,
    get: () => "profile:forged",
  });
  assert.deepEqual(admitCandidateExecutorAuthority(accessor), hold(H.ACCESSOR_FORBIDDEN));

  const hostile = new Proxy({}, { ownKeys() { throw new Error("refuse"); } });
  assert.deepEqual(admitCandidateExecutorAuthority(hostile), hold(H.HOSTILE_INPUT));
  for (const result of [raw, local, secret, accessor].map(admitCandidateExecutorAuthority)) {
    assert.deepEqual(Object.keys(result), ["status", "hold_code"]);
  }
});

test("the authority adapter has no execution, claim, mutation, filesystem, network, runtime, or clock surface", () => {
  const source = readFileSync(new URL("../src/candidate_execution_authority_adapter.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    "from \"node:fs\"", "from \"node:http\"", "from \"node:https\"", "fetch(",
    "Date.now(", "setTimeout(", "writeFile", "appendFile", "spawn(", "exec(",
    "process.env", "createCandidateExecutionCoordinator", "createHermesBotSubmitExecutor",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  const receipt = admitCandidateExecutorAuthority(fixture());
  assert.deepEqual(receipt.effect_boundary, {
    executor_called: false,
    claim_created: false,
    task_or_linear_mutated: false,
    agent_or_session_created: false,
    runtime_filesystem_network_or_clock_used: false,
    worker_success_treated_as_done: false,
  });
});

function hold(code) {
  return { status: "HOLD", hold_code: code };
}
