import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { digestOf } from '../../agent_observation/guard_primitives.mjs';
import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
} from '../../agent_observation/agent_authority_verification.mjs';
import {
  AGENT_DEPLOYMENT_SCHEMA,
  AGENT_MARK_SCHEMA,
  AGENT_MEMORY_GENERATION_SCHEMA,
} from '../../agent_observation/agent_mark_lineage.mjs';
import {
  PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA,
  PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA,
  PROJECT_AI_TEAM_MARK_SCHEMA,
  PROJECT_AI_TEAM_PACK_ADMISSION_HOLD_CODES as H,
  PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA,
  PROJECT_AI_TEAM_TOPOLOGY_SCHEMA,
  prepareProjectAiTeamPackAdmission,
} from '../src/project_ai_team_pack_admission.mjs';

const sha = (character) => `sha256:${character.repeat(64)}`;
const ADMISSION_AT = '2026-08-31T01:05:00.000Z';
const PROJECT = 'project:kvds';

const withDigest = (record, field) => ({ ...record, [field]: digestOf(record) });

const slots = Object.freeze([
  Object.freeze({
    role_slot_ref: 'role-slot:01-manager',
    role_class: 'manager',
    role_ref: 'role:project-manager',
    required_capability_refs: ['capability:project-coordination'],
    required_tool_refs: [],
    required_authority_policy_refs: ['authority-policy:project-manager'],
  }),
  Object.freeze({
    role_slot_ref: 'role-slot:02-responsibility',
    role_class: 'responsibility',
    role_ref: 'role:systems-engineering-responsibility',
    required_capability_refs: ['capability:systems-engineering'],
    required_tool_refs: ['tool:requirements-review'],
    required_authority_policy_refs: ['authority-policy:domain-responsibility'],
  }),
  Object.freeze({
    role_slot_ref: 'role-slot:03-specialist',
    role_class: 'specialist',
    role_ref: 'role:sonar-specialist',
    required_capability_refs: ['capability:sonar-analysis'],
    required_tool_refs: ['tool:sonar-analysis'],
    required_authority_policy_refs: ['authority-policy:specialist-artifact-only'],
  }),
  Object.freeze({
    role_slot_ref: 'role-slot:04-common',
    role_class: 'common',
    role_ref: 'role:document-common',
    required_capability_refs: ['capability:document-production'],
    required_tool_refs: ['tool:document-workshop'],
    required_authority_policy_refs: ['authority-policy:common-artifact-only'],
  }),
]);

function topology() {
  return withDigest({
    schema_version: PROJECT_AI_TEAM_TOPOLOGY_SCHEMA,
    team_topology_ref: 'project-team-topology:kvds/v1',
    team_topology_version: '1.0.0',
    project_scope_ref: PROJECT,
    role_slots: slots.map((slot) => ({
      ...slot,
      required_capability_refs: [...slot.required_capability_refs],
      required_tool_refs: [...slot.required_tool_refs],
      required_authority_policy_refs: [...slot.required_authority_policy_refs],
    })),
  }, 'team_topology_digest');
}

function projectMark(team = topology()) {
  return withDigest({
    schema_version: PROJECT_AI_TEAM_MARK_SCHEMA,
    project_mark_ref: 'project-ai-team-mark:kvds/v1',
    project_mark_version: '1.0.0',
    project_scope_ref: PROJECT,
    team_topology_ref: team.team_topology_ref,
    team_topology_digest: team.team_topology_digest,
    lifecycle_state: 'approval_claim',
    owner_ref: 'owner:human-owner',
    approval_receipt_ref: 'approval-receipt:project-ai-team/kvds-v1',
    rollback_project_mark_ref: 'project-ai-team-mark:kvds/v0',
  }, 'project_mark_digest');
}

function projectMarkPin(teamMark, team, over = {}) {
  return {
    schema_version: PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA,
    pin_ref: 'authority-pin:project-ai-team/kvds-v1',
    verification_receipt_ref: 'verification-receipt:project-ai-team/kvds-v1',
    owner_ref: 'owner:human-owner',
    authority_ref: 'authority:project-ai-team-approval/v1',
    verifier_ref: 'verifier:project-ai-team-authority/v1',
    project_scope_ref: PROJECT,
    project_mark_ref: teamMark.project_mark_ref,
    project_mark_digest: teamMark.project_mark_digest,
    team_topology_ref: team.team_topology_ref,
    team_topology_digest: team.team_topology_digest,
    approval_receipt_ref: teamMark.approval_receipt_ref,
    approval_receipt_digest: sha('7'),
    claim_ceiling: 'validated_private',
    issued_at: '2026-08-31T01:01:00.000Z',
    verified_at: '2026-08-31T01:03:00.000Z',
    expires_at: '2026-08-31T03:00:00.000Z',
    receipt_epoch: 4,
    trusted_authority_epoch: 4,
    revoked: false,
    ...over,
  };
}

function projectMarkCurrentState(over = {}) {
  return {
    schema_version: PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: 'authority-evaluation:project-ai-team/kvds-admission',
    evaluated_at: ADMISSION_AT,
    authority_ref: 'authority:project-ai-team-approval/v1',
    current_authority_epoch: 4,
    revoked_pin_refs: [],
    claim_ceiling: 'validated_private',
    ...over,
  };
}

function mark(slot, key) {
  const toolRefs = [...slot.required_tool_refs];
  return withDigest({
    schema_version: AGENT_MARK_SCHEMA,
    mark_ref: `agent-mark:kvds-${key}`,
    mark_version: '1.0.0',
    family_ref: `agent-family:${key}`,
    soul_revision_ref: `soul-revision:${key}/v1`,
    soul_digest: sha('1'),
    instruction_revision_ref: `instruction-revision:${key}/v1`,
    instruction_digest: sha('2'),
    requested_model_id: 'model:gpt-5.6-terra',
    observed_model_id: 'UNKNOWN',
    requested_effort: 'effort:max',
    observed_effort: 'UNKNOWN',
    role_refs: [slot.role_ref],
    capability_refs: [...slot.required_capability_refs],
    skill_refs: [],
    workflow_refs: [],
    tool_refs: toolRefs,
    authority_policy_refs: [...slot.required_authority_policy_refs],
    project_scope_refs: [PROJECT],
    memory_policy_ref: `memory-policy:${key}/project-private`,
    evaluation_refs: [`evaluation:${key}/v1`],
    supersedes_mark_ref: `agent-mark:kvds-${key}-old`,
    rollback_mark_ref: `agent-mark:kvds-${key}-old`,
  }, 'mark_digest');
}

function deployment(agentMark, key, runtimeKey = key) {
  return withDigest({
    schema_version: AGENT_DEPLOYMENT_SCHEMA,
    deployment_ref: `agent-deployment:kvds-${key}`,
    deployment_version: '1.0.0',
    mark_ref: agentMark.mark_ref,
    project_scope_refs: [PROJECT],
    runtime_ref: `runtime:hermes-${runtimeKey}`,
    runtime_version: '0.20.5',
    profile_ref: `profile:kvds-${runtimeKey}`,
    session_ref: `session:kvds-${runtimeKey}`,
    tool_refs: [...agentMark.tool_refs],
    authority_policy_refs: [...agentMark.authority_policy_refs],
    secret_ref: `secretref:hermes-${key}`,
    supersedes_deployment_ref: `agent-deployment:kvds-${key}-old`,
    rollback_deployment_ref: `agent-deployment:kvds-${key}-old`,
  }, 'deployment_digest');
}

function memory(agentMark, agentDeployment, key) {
  return withDigest({
    schema_version: AGENT_MEMORY_GENERATION_SCHEMA,
    memory_generation_ref: `memory-generation:kvds-${key}/v1`,
    memory_version: '1.0.0',
    mark_ref: agentMark.mark_ref,
    deployment_ref: agentDeployment.deployment_ref,
    parent_memory_generation_ref: null,
    memory_manifest_ref: `memory-manifest:kvds-${key}/v1`,
    memory_classification: 'project_scoped_private_memory',
    retention_policy_ref: 'retention-policy:project-agent-memory/v1',
    recovery_ref: `recovery:kvds-${key}/v1`,
    rollback_ref: `rollback:kvds-${key}/v1`,
    supersedes_memory_generation_ref: null,
  }, 'memory_digest');
}

function receipt(agentMark, agentDeployment, agentMemory, key, over = {}) {
  const body = {
    schema_version: VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
    status: 'VERIFIED_ACTIVE_BINDING',
    verification_receipt_ref: `verification-receipt:kvds-${key}`,
    trusted_pin_ref: `authority-pin:kvds-${key}`,
    approval_claim_digest: sha('3'),
    authority_receipt_ref: `authority-receipt:kvds-${key}`,
    authority_receipt_digest: sha('4'),
    claim_ceiling: 'validated_private',
    owner_ref: 'owner:human-owner',
    authority_ref: 'authority:agent-deployment-approval/v1',
    verifier_ref: 'verifier:agent-authority/v1',
    authority_state_evaluation_ref: `authority-evaluation:kvds-${key}/verified`,
    authority_evaluated_at: '2026-08-31T01:04:00.000Z',
    current_authority_epoch: 9,
    project_scope_ref: PROJECT,
    lineage_digest: sha('5'),
    family_ref: agentMark.family_ref,
    family_digest: sha('6'),
    mark_ref: agentMark.mark_ref,
    mark_digest: agentMark.mark_digest,
    deployment_ref: agentDeployment.deployment_ref,
    deployment_digest: agentDeployment.deployment_digest,
    memory_generation_ref: agentMemory.memory_generation_ref,
    memory_digest: agentMemory.memory_digest,
    issued_at: '2026-08-31T01:01:00.000Z',
    verified_at: '2026-08-31T01:03:00.000Z',
    expires_at: '2026-08-31T02:00:00.000Z',
    receipt_epoch: 9,
    trusted_authority_epoch: 9,
    effect_boundary: {
      catalog_mutation: false,
      persistence_write: false,
      runtime_or_task_call: false,
      approval_or_promotion: false,
      external_or_clock_call: false,
      receipt_body_read: false,
    },
    ...over,
  };
  return { ...body, receipt_digest: digestOf(body) };
}

function currentState(key, over = {}) {
  return {
    schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: `authority-evaluation:kvds-${key}/admission`,
    evaluated_at: ADMISSION_AT,
    authority_ref: 'authority:agent-deployment-approval/v1',
    current_authority_epoch: 9,
    revoked_pin_refs: [],
    claim_ceiling: 'validated_private',
    ...over,
  };
}

function binding(slot, index, { runtimeKey = String(index) } = {}) {
  const key = String(index);
  const agentMark = mark(slot, key);
  const agentDeployment = deployment(agentMark, key, runtimeKey);
  const agentMemory = memory(agentMark, agentDeployment, key);
  return {
    role_slot_ref: slot.role_slot_ref,
    mark: agentMark,
    deployment: agentDeployment,
    memory_generation: agentMemory,
    verified_active_binding: receipt(agentMark, agentDeployment, agentMemory, key),
    current_authority_state: currentState(key),
  };
}

function packet() {
  const team = topology();
  const teamMark = projectMark(team);
  return {
    schema_version: PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA,
    admission_evaluated_at: ADMISSION_AT,
    project_mark: teamMark,
    team_topology: team,
    project_mark_authority_pin: projectMarkPin(teamMark, team),
    project_mark_current_authority_state: projectMarkCurrentState(),
    agent_bindings: slots.map((slot, index) => binding(slot, index + 1)),
  };
}

test('prepares only a public-safe Project AI Team pack input from four current exact bindings', () => {
  const result = prepareProjectAiTeamPackAdmission(packet());
  assert.equal(result.status, 'PREPARED_PROJECT_AI_TEAM_PACK_INPUT');
  assert.equal(result.pack_id, 'project_ai_team_pack');
  assert.equal(result.project_scope_ref, PROJECT);
  assert.equal(result.approved_project_mark_deployment_bindings.length, 4);
  assert.equal(result.runtime_references.length, 4);
  assert.deepEqual(
    result.approved_project_mark_deployment_bindings.map((entry) => entry.role_class),
    ['manager', 'responsibility', 'specialist', 'common'],
  );
  assert.equal(result.authority_granted, false);
  assert.equal(result.profile_or_runtime_created, false);
  assert.equal(result.runtime_configured_or_started, false);
  assert.equal(result.pack_emitted_or_released, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.approved_project_mark_deployment_bindings[0]));
});

test('missing verified binding and uncovered role slots HOLD', () => {
  const missingReceipt = packet();
  delete missingReceipt.agent_bindings[0].verified_active_binding;
  assert.equal(
    prepareProjectAiTeamPackAdmission(missingReceipt).hold_code,
    H.ROLE_BINDING_GAP,
  );

  const uncovered = packet();
  uncovered.agent_bindings.pop();
  assert.equal(prepareProjectAiTeamPackAdmission(uncovered).hold_code, H.ROLE_BINDING_GAP);
});

test('a Project Mark cannot self-approve or omit its independent trusted authority proof', () => {
  const missingPin = packet();
  delete missingPin.project_mark_authority_pin;
  assert.equal(
    prepareProjectAiTeamPackAdmission(missingPin).hold_code,
    H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED,
  );

  const selfApproved = packet();
  selfApproved.project_mark.lifecycle_state = 'approved';
  const markBody = { ...selfApproved.project_mark };
  delete markBody.project_mark_digest;
  selfApproved.project_mark.project_mark_digest = digestOf(markBody);
  selfApproved.project_mark_authority_pin.project_mark_digest = selfApproved.project_mark.project_mark_digest;
  assert.equal(
    prepareProjectAiTeamPackAdmission(selfApproved).hold_code,
    H.APPROVED_PROJECT_MARK_REQUIRED,
  );
});

test('expired or revoked Project Mark authority proof HOLD independently of Agent receipts', () => {
  const expired = packet();
  expired.project_mark_authority_pin.expires_at = ADMISSION_AT;
  assert.equal(prepareProjectAiTeamPackAdmission(expired).hold_code, H.PROJECT_MARK_EXPIRED);

  const revoked = packet();
  revoked.project_mark_current_authority_state.revoked_pin_refs = [
    revoked.project_mark_authority_pin.pin_ref,
  ];
  assert.equal(prepareProjectAiTeamPackAdmission(revoked).hold_code, H.PROJECT_MARK_REVOKED);
});

test('duplicate Mark Deployment session runtime or profile identities HOLD', () => {
  for (const field of ['mark_ref', 'deployment_ref', 'runtime_ref', 'profile_ref', 'session_ref']) {
    const candidate = packet();
    if (field === 'mark_ref') {
      const sharedMarkBody = {
        ...candidate.agent_bindings[0].mark,
        role_refs: [slots[0].role_ref, slots[1].role_ref].sort(),
        capability_refs: [
          ...slots[0].required_capability_refs,
          ...slots[1].required_capability_refs,
        ].sort(),
        tool_refs: [...slots[1].required_tool_refs],
        authority_policy_refs: [
          ...slots[0].required_authority_policy_refs,
          ...slots[1].required_authority_policy_refs,
        ].sort(),
      };
      delete sharedMarkBody.mark_digest;
      const sharedMark = { ...sharedMarkBody, mark_digest: digestOf(sharedMarkBody) };
      for (let index = 0; index < 2; index += 1) {
        const key = String(index + 1);
        const agentDeployment = deployment(sharedMark, key);
        const agentMemory = memory(sharedMark, agentDeployment, key);
        candidate.agent_bindings[index] = {
          role_slot_ref: slots[index].role_slot_ref,
          mark: { ...sharedMark },
          deployment: agentDeployment,
          memory_generation: agentMemory,
          verified_active_binding: receipt(sharedMark, agentDeployment, agentMemory, key),
          current_authority_state: currentState(key),
        };
      }
    } else if (field === 'deployment_ref') {
      const second = candidate.agent_bindings[1];
      second.deployment = { ...second.deployment, deployment_ref: candidate.agent_bindings[0].deployment.deployment_ref };
      const body = { ...second.deployment };
      delete body.deployment_digest;
      second.deployment.deployment_digest = digestOf(body);
      second.memory_generation.deployment_ref = second.deployment.deployment_ref;
      const memoryBody = { ...second.memory_generation };
      delete memoryBody.memory_digest;
      second.memory_generation.memory_digest = digestOf(memoryBody);
      second.verified_active_binding = receipt(second.mark, second.deployment, second.memory_generation, '2');
    } else {
      const second = candidate.agent_bindings[1];
      second.deployment = { ...second.deployment, [field]: candidate.agent_bindings[0].deployment[field] };
      const body = { ...second.deployment };
      delete body.deployment_digest;
      second.deployment.deployment_digest = digestOf(body);
      second.verified_active_binding = receipt(second.mark, second.deployment, second.memory_generation, '2');
    }
    assert.equal(
      prepareProjectAiTeamPackAdmission(candidate).hold_code,
      H.DUPLICATE_AGENT_BINDING,
      field,
    );
  }
});

test('cross-project or shared deep context is refused before pack input exists', () => {
  const candidate = packet();
  const target = candidate.agent_bindings[2];
  target.mark.project_scope_refs = ['project:kvds', 'project:msh'];
  const body = { ...target.mark };
  delete body.mark_digest;
  target.mark.mark_digest = digestOf(body);
  target.verified_active_binding = receipt(target.mark, target.deployment, target.memory_generation, '3');
  assert.equal(
    prepareProjectAiTeamPackAdmission(candidate).hold_code,
    H.SHARED_OR_CROSS_PROJECT_CONTEXT_FORBIDDEN,
  );
});

test('expired and revoked authority snapshots cannot be reused', () => {
  const expired = packet();
  const first = expired.agent_bindings[0];
  first.verified_active_binding = receipt(first.mark, first.deployment, first.memory_generation, '1', {
    expires_at: ADMISSION_AT,
  });
  assert.equal(prepareProjectAiTeamPackAdmission(expired).hold_code, H.AUTHORITY_BINDING_EXPIRED);

  const revoked = packet();
  revoked.agent_bindings[0].current_authority_state.revoked_pin_refs = ['authority-pin:kvds-1'];
  assert.equal(prepareProjectAiTeamPackAdmission(revoked).hold_code, H.AUTHORITY_STATE_REVOKED);
});

test('role class gaps and capability gaps HOLD instead of self-approving a synthetic team', () => {
  const roleGap = packet();
  roleGap.team_topology.role_slots[3].role_class = 'specialist';
  const topologyBody = { ...roleGap.team_topology };
  delete topologyBody.team_topology_digest;
  roleGap.team_topology.team_topology_digest = digestOf(topologyBody);
  roleGap.project_mark.team_topology_digest = roleGap.team_topology.team_topology_digest;
  const markBody = { ...roleGap.project_mark };
  delete markBody.project_mark_digest;
  roleGap.project_mark.project_mark_digest = digestOf(markBody);
  roleGap.project_mark_authority_pin.team_topology_digest = roleGap.team_topology.team_topology_digest;
  roleGap.project_mark_authority_pin.project_mark_digest = roleGap.project_mark.project_mark_digest;
  assert.equal(
    prepareProjectAiTeamPackAdmission(roleGap).hold_code,
    H.REQUIRED_ROLE_CLASS_MISSING,
  );

  const capabilityGap = packet();
  const specialist = capabilityGap.agent_bindings[2];
  specialist.mark.capability_refs = ['capability:unrelated'];
  const specialistBody = { ...specialist.mark };
  delete specialistBody.mark_digest;
  specialist.mark.mark_digest = digestOf(specialistBody);
  specialist.verified_active_binding = receipt(
    specialist.mark,
    specialist.deployment,
    specialist.memory_generation,
    '3',
  );
  assert.equal(
    prepareProjectAiTeamPackAdmission(capabilityGap).hold_code,
    H.ROLE_REQUIREMENT_MISMATCH,
  );
});

test('raw secret material is rejected and the module contains no fs runtime network or clock call', () => {
  const candidate = packet();
  candidate.agent_bindings[0].deployment.secret_ref = 'sk-1234567890abcdef';
  assert.equal(prepareProjectAiTeamPackAdmission(candidate).hold_code, H.SECRET_VALUE_FORBIDDEN);

  const source = readFileSync(new URL('../src/project_ai_team_pack_admission.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    'node:fs', 'node:child_process', 'node:http', 'node:https', 'fetch(',
    'Date.now(', 'new Date()', 'process.env', 'writeFile', 'mkdir', 'spawn(', 'exec(',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
