/**
 * Pure admission contract for the future Project AI Team Pack emitter.
 *
 * This module consumes already-approved, public-safe project/team metadata and exact
 * VERIFIED_AGENT_ACTIVE_BINDING receipts. It does not approve a Project Mark, activate an Agent,
 * create a profile, configure a runtime, write a pack, or release anything.
 */

import {
  deepFreeze,
  digestOf,
  guardEntry,
  hold,
  isDenseArray,
  isPlainObject,
  isSafeRef,
  isUtcMs,
  unknownKeyIn,
} from '../../agent_observation/guard_primitives.mjs';
import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
} from '../../agent_observation/agent_authority_verification.mjs';
import {
  AGENT_DEPLOYMENT_SCHEMA,
  AGENT_MARK_SCHEMA,
  AGENT_MEMORY_GENERATION_SCHEMA,
  computeLineageRecordDigest,
} from '../../agent_observation/agent_mark_lineage.mjs';

export const PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA =
  'soulforge.deployment_pack.project_ai_team_pack_admission.v0';
export const PROJECT_AI_TEAM_MARK_SCHEMA =
  'soulforge.deployment_pack.approved_project_ai_team_mark.v0';
export const PROJECT_AI_TEAM_TOPOLOGY_SCHEMA =
  'soulforge.deployment_pack.project_ai_team_topology.v0';
export const PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA =
  'soulforge.deployment_pack.project_ai_team_mark_authority_pin.v0';
export const PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA =
  'soulforge.deployment_pack.project_ai_team_mark_authority_current_state.v0';

export const PROJECT_AI_TEAM_PACK_ADMISSION_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: 'RAW_OR_UNKNOWN_FIELD_FORBIDDEN',
  SECRET_VALUE_FORBIDDEN: 'SECRET_VALUE_FORBIDDEN',
  LOCAL_PATH_VALUE_FORBIDDEN: 'LOCAL_PATH_VALUE_FORBIDDEN',
  INPUT_TOO_DEEP: 'INPUT_TOO_DEEP',
  INPUT_TOO_LARGE: 'INPUT_TOO_LARGE',
  HOSTILE_INPUT_REFUSED: 'HOSTILE_INPUT_REFUSED',
  ACCESSOR_PROPERTY_FORBIDDEN: 'ACCESSOR_PROPERTY_FORBIDDEN',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  APPROVED_PROJECT_MARK_REQUIRED: 'APPROVED_PROJECT_MARK_REQUIRED',
  TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED: 'TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED',
  TRUSTED_PROJECT_MARK_CURRENT_STATE_REQUIRED: 'TRUSTED_PROJECT_MARK_CURRENT_STATE_REQUIRED',
  PROJECT_MARK_APPROVAL_MISMATCH: 'PROJECT_MARK_APPROVAL_MISMATCH',
  PROJECT_MARK_EXPIRED: 'PROJECT_MARK_EXPIRED',
  PROJECT_MARK_REVOKED: 'PROJECT_MARK_REVOKED',
  PROJECT_SCOPE_MISMATCH: 'PROJECT_SCOPE_MISMATCH',
  TEAM_TOPOLOGY_INVALID: 'TEAM_TOPOLOGY_INVALID',
  REQUIRED_ROLE_CLASS_MISSING: 'REQUIRED_ROLE_CLASS_MISSING',
  ROLE_BINDING_GAP: 'ROLE_BINDING_GAP',
  VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED: 'VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED',
  VERIFIED_BINDING_DIGEST_MISMATCH: 'VERIFIED_BINDING_DIGEST_MISMATCH',
  AUTHORITY_STATE_NOT_CURRENT: 'AUTHORITY_STATE_NOT_CURRENT',
  AUTHORITY_STATE_REVOKED: 'AUTHORITY_STATE_REVOKED',
  AUTHORITY_BINDING_EXPIRED: 'AUTHORITY_BINDING_EXPIRED',
  AGENT_BINDING_MISMATCH: 'AGENT_BINDING_MISMATCH',
  ROLE_REQUIREMENT_MISMATCH: 'ROLE_REQUIREMENT_MISMATCH',
  DUPLICATE_AGENT_BINDING: 'DUPLICATE_AGENT_BINDING',
  SHARED_OR_CROSS_PROJECT_CONTEXT_FORBIDDEN: 'SHARED_OR_CROSS_PROJECT_CONTEXT_FORBIDDEN',
});

const H = PROJECT_AI_TEAM_PACK_ADMISSION_HOLD_CODES;
const ENTRY_CODES = Object.freeze({
  unknownField: H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN,
  secret: H.SECRET_VALUE_FORBIDDEN,
  localPath: H.LOCAL_PATH_VALUE_FORBIDDEN,
  tooDeep: H.INPUT_TOO_DEEP,
  tooLarge: H.INPUT_TOO_LARGE,
  hostileInput: H.HOSTILE_INPUT_REFUSED,
  accessor: H.ACCESSOR_PROPERTY_FORBIDDEN,
});

const ROOT_FIELDS = Object.freeze([
  'schema_version', 'admission_evaluated_at', 'project_mark', 'team_topology',
  'project_mark_authority_pin', 'project_mark_current_authority_state', 'agent_bindings',
]);
const PROJECT_MARK_FIELDS = Object.freeze([
  'schema_version', 'project_mark_ref', 'project_mark_version', 'project_mark_digest',
  'project_scope_ref', 'team_topology_ref', 'team_topology_digest', 'lifecycle_state',
  'owner_ref', 'approval_receipt_ref', 'rollback_project_mark_ref',
]);
const PROJECT_MARK_PIN_FIELDS = Object.freeze([
  'schema_version', 'pin_ref', 'verification_receipt_ref', 'owner_ref', 'authority_ref',
  'verifier_ref', 'project_scope_ref', 'project_mark_ref', 'project_mark_digest',
  'team_topology_ref', 'team_topology_digest', 'approval_receipt_ref',
  'approval_receipt_digest', 'claim_ceiling', 'issued_at', 'verified_at', 'expires_at',
  'receipt_epoch', 'trusted_authority_epoch', 'revoked',
]);
const PROJECT_MARK_CURRENT_STATE_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'evaluated_at', 'authority_ref',
  'current_authority_epoch', 'revoked_pin_refs', 'claim_ceiling',
]);
const TOPOLOGY_FIELDS = Object.freeze([
  'schema_version', 'team_topology_ref', 'team_topology_version', 'team_topology_digest',
  'project_scope_ref', 'role_slots',
]);
const ROLE_SLOT_FIELDS = Object.freeze([
  'role_slot_ref', 'role_class', 'role_ref', 'required_capability_refs',
  'required_tool_refs', 'required_authority_policy_refs',
]);
const BINDING_FIELDS = Object.freeze([
  'role_slot_ref', 'mark', 'deployment', 'memory_generation',
  'verified_active_binding', 'current_authority_state',
]);
const MARK_FIELDS = Object.freeze([
  'schema_version', 'mark_ref', 'mark_version', 'mark_digest', 'family_ref',
  'soul_revision_ref', 'soul_digest', 'instruction_revision_ref', 'instruction_digest',
  'requested_model_id', 'observed_model_id', 'requested_effort', 'observed_effort',
  'role_refs', 'capability_refs', 'skill_refs', 'workflow_refs', 'tool_refs',
  'authority_policy_refs', 'project_scope_refs', 'memory_policy_ref', 'evaluation_refs',
  'supersedes_mark_ref', 'rollback_mark_ref',
]);
const DEPLOYMENT_FIELDS = Object.freeze([
  'schema_version', 'deployment_ref', 'deployment_version', 'deployment_digest', 'mark_ref',
  'project_scope_refs', 'runtime_ref', 'runtime_version', 'profile_ref', 'session_ref',
  'tool_refs', 'authority_policy_refs', 'secret_ref', 'supersedes_deployment_ref',
  'rollback_deployment_ref',
]);
const MEMORY_FIELDS = Object.freeze([
  'schema_version', 'memory_generation_ref', 'memory_version', 'memory_digest', 'mark_ref',
  'deployment_ref', 'parent_memory_generation_ref', 'memory_manifest_ref',
  'memory_classification', 'retention_policy_ref', 'recovery_ref', 'rollback_ref',
  'supersedes_memory_generation_ref',
]);
const RECEIPT_FIELDS = Object.freeze([
  'schema_version', 'status', 'verification_receipt_ref', 'trusted_pin_ref',
  'approval_claim_digest', 'authority_receipt_ref', 'authority_receipt_digest', 'claim_ceiling',
  'owner_ref', 'authority_ref', 'verifier_ref', 'authority_state_evaluation_ref',
  'authority_evaluated_at', 'current_authority_epoch', 'project_scope_ref', 'lineage_digest',
  'family_ref', 'family_digest', 'mark_ref', 'mark_digest', 'deployment_ref',
  'deployment_digest', 'memory_generation_ref', 'memory_digest', 'issued_at', 'verified_at',
  'expires_at', 'receipt_epoch', 'trusted_authority_epoch', 'effect_boundary', 'receipt_digest',
]);
const RECEIPT_EFFECT_FIELDS = Object.freeze([
  'catalog_mutation', 'persistence_write', 'runtime_or_task_call', 'approval_or_promotion',
  'external_or_clock_call', 'receipt_body_read',
]);
const CURRENT_STATE_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'evaluated_at', 'authority_ref',
  'current_authority_epoch', 'revoked_pin_refs', 'claim_ceiling',
]);

const ROLE_CLASSES = Object.freeze(['manager', 'responsibility', 'specialist', 'common']);
const REQUIRED_ROLE_CLASSES = new Set(ROLE_CLASSES);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const UNKNOWN = 'UNKNOWN';
const MAX_LIST = 64;

const invalid = (detail) => hold(H.INVALID_FIELD_VALUE, detail);
const digestRef = (value) => typeof value === 'string' && SHA256_REF.test(value);
const semver = (value) => typeof value === 'string' && SEMVER.test(value);
const nullableRef = (value) => value === null || isSafeRef(value);
const exactUtcMs = (value) => isUtcMs(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value;
const exactShape = (value, fields) => isPlainObject(value)
  && unknownKeyIn(value, fields) === null
  && fields.every((field) => Object.hasOwn(value, field));

function canonicalRefList(value, { allowEmpty = false } = {}) {
  if (!isDenseArray(value) || value.length > MAX_LIST || (!allowEmpty && value.length === 0)) return false;
  if (!value.every(isSafeRef) || new Set(value).size !== value.length) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (value[index - 1] > value[index]) return false;
  }
  return true;
}

const sameList = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);
const includesAll = (actual, required) => required.every((value) => actual.includes(value));
const digestMatches = (record, field) => {
  if (!digestRef(record[field])) return false;
  const body = { ...record };
  delete body[field];
  return record[field] === computeLineageRecordDigest(body);
};

function validateProjectMark(mark, topology) {
  if (!exactShape(mark, PROJECT_MARK_FIELDS)
    || mark.schema_version !== PROJECT_AI_TEAM_MARK_SCHEMA
    || !isSafeRef(mark.project_mark_ref)
    || !semver(mark.project_mark_version)
    || !digestRef(mark.project_mark_digest)
    || !isSafeRef(mark.project_scope_ref)
    || !isSafeRef(mark.team_topology_ref)
    || !digestRef(mark.team_topology_digest)
    || mark.lifecycle_state !== 'approval_claim'
    || !isSafeRef(mark.owner_ref)
    || !isSafeRef(mark.approval_receipt_ref)
    || !isSafeRef(mark.rollback_project_mark_ref)
    || mark.rollback_project_mark_ref === mark.project_mark_ref
    || !digestMatches(mark, 'project_mark_digest')) return hold(H.APPROVED_PROJECT_MARK_REQUIRED);
  if (mark.team_topology_ref !== topology.team_topology_ref
    || mark.team_topology_digest !== topology.team_topology_digest
    || mark.project_scope_ref !== topology.project_scope_ref) return hold(H.PROJECT_SCOPE_MISMATCH);
  return null;
}

function validateProjectMarkAuthority(mark, topology, pin, currentState, evaluatedAt) {
  if (!exactShape(pin, PROJECT_MARK_PIN_FIELDS)
    || pin.schema_version !== PROJECT_AI_TEAM_MARK_AUTHORITY_PIN_SCHEMA) {
    return hold(H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED);
  }
  for (const field of [
    'pin_ref', 'verification_receipt_ref', 'owner_ref', 'authority_ref', 'verifier_ref',
    'project_scope_ref', 'project_mark_ref', 'team_topology_ref', 'approval_receipt_ref',
  ]) if (!isSafeRef(pin[field])) return hold(H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED);
  for (const field of [
    'project_mark_digest', 'team_topology_digest', 'approval_receipt_digest',
  ]) if (!digestRef(pin[field])) return hold(H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED);
  if (pin.claim_ceiling !== 'validated_private'
    || ![pin.issued_at, pin.verified_at, pin.expires_at].every(exactUtcMs)
    || !Number.isSafeInteger(pin.receipt_epoch) || pin.receipt_epoch < 0
    || !Number.isSafeInteger(pin.trusted_authority_epoch) || pin.trusted_authority_epoch < 0
    || typeof pin.revoked !== 'boolean'
    || pin.verified_at < pin.issued_at
    || pin.verified_at >= pin.expires_at) return hold(H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED);
  if (pin.owner_ref !== mark.owner_ref
    || pin.project_scope_ref !== mark.project_scope_ref
    || pin.project_mark_ref !== mark.project_mark_ref
    || pin.project_mark_digest !== mark.project_mark_digest
    || pin.team_topology_ref !== topology.team_topology_ref
    || pin.team_topology_digest !== topology.team_topology_digest
    || pin.approval_receipt_ref !== mark.approval_receipt_ref) {
    return hold(H.PROJECT_MARK_APPROVAL_MISMATCH);
  }
  if (!exactShape(currentState, PROJECT_MARK_CURRENT_STATE_FIELDS)
    || currentState.schema_version !== PROJECT_AI_TEAM_MARK_AUTHORITY_CURRENT_STATE_SCHEMA
    || !isSafeRef(currentState.evaluation_ref)
    || !exactUtcMs(currentState.evaluated_at)
    || !isSafeRef(currentState.authority_ref)
    || !Number.isSafeInteger(currentState.current_authority_epoch)
    || currentState.current_authority_epoch < 0
    || !canonicalRefList(currentState.revoked_pin_refs, { allowEmpty: true })
    || currentState.claim_ceiling !== 'validated_private') {
    return hold(H.TRUSTED_PROJECT_MARK_CURRENT_STATE_REQUIRED);
  }
  if (currentState.evaluated_at !== evaluatedAt
    || currentState.authority_ref !== pin.authority_ref
    || evaluatedAt < pin.verified_at) return hold(H.TRUSTED_PROJECT_MARK_CURRENT_STATE_REQUIRED);
  if (evaluatedAt >= pin.expires_at) return hold(H.PROJECT_MARK_EXPIRED);
  if (pin.revoked
    || currentState.revoked_pin_refs.includes(pin.pin_ref)
    || currentState.current_authority_epoch !== pin.receipt_epoch
    || pin.trusted_authority_epoch !== pin.receipt_epoch) return hold(H.PROJECT_MARK_REVOKED);
  return null;
}

function validateTopology(topology) {
  if (!exactShape(topology, TOPOLOGY_FIELDS)
    || topology.schema_version !== PROJECT_AI_TEAM_TOPOLOGY_SCHEMA
    || !isSafeRef(topology.team_topology_ref)
    || !semver(topology.team_topology_version)
    || !digestRef(topology.team_topology_digest)
    || !isSafeRef(topology.project_scope_ref)
    || !isDenseArray(topology.role_slots)
    || topology.role_slots.length < ROLE_CLASSES.length
    || topology.role_slots.length > MAX_LIST) return hold(H.TEAM_TOPOLOGY_INVALID);
  const topologyBody = { ...topology };
  delete topologyBody.team_topology_digest;
  if (topology.team_topology_digest !== digestOf(topologyBody)) return hold(H.TEAM_TOPOLOGY_INVALID);
  const slots = new Set();
  const classes = new Map(ROLE_CLASSES.map((value) => [value, 0]));
  let previousSlot = null;
  for (const slot of topology.role_slots) {
    if (!exactShape(slot, ROLE_SLOT_FIELDS)
      || !isSafeRef(slot.role_slot_ref)
      || !ROLE_CLASSES.includes(slot.role_class)
      || !isSafeRef(slot.role_ref)
      || !canonicalRefList(slot.required_capability_refs)
      || !canonicalRefList(slot.required_tool_refs, { allowEmpty: true })
      || !canonicalRefList(slot.required_authority_policy_refs)) return hold(H.TEAM_TOPOLOGY_INVALID);
    if (slots.has(slot.role_slot_ref) || (previousSlot !== null && previousSlot > slot.role_slot_ref)) {
      return hold(H.TEAM_TOPOLOGY_INVALID);
    }
    slots.add(slot.role_slot_ref);
    previousSlot = slot.role_slot_ref;
    classes.set(slot.role_class, classes.get(slot.role_class) + 1);
  }
  if (classes.get('manager') !== 1) return hold(H.REQUIRED_ROLE_CLASS_MISSING, 'manager');
  for (const roleClass of REQUIRED_ROLE_CLASSES) {
    if (classes.get(roleClass) === 0) return hold(H.REQUIRED_ROLE_CLASS_MISSING, roleClass);
  }
  return null;
}

function validateMark(mark, projectRef) {
  if (!exactShape(mark, MARK_FIELDS)
    || mark.schema_version !== AGENT_MARK_SCHEMA
    || !isSafeRef(mark.mark_ref)
    || !semver(mark.mark_version)
    || !isSafeRef(mark.family_ref)
    || !isSafeRef(mark.soul_revision_ref)
    || !digestRef(mark.soul_digest)
    || !isSafeRef(mark.instruction_revision_ref)
    || !digestRef(mark.instruction_digest)
    || !['requested_model_id', 'observed_model_id', 'requested_effort', 'observed_effort']
      .every((field) => mark[field] === UNKNOWN || isSafeRef(mark[field]))
    || !canonicalRefList(mark.role_refs)
    || !canonicalRefList(mark.capability_refs)
    || !canonicalRefList(mark.skill_refs, { allowEmpty: true })
    || !canonicalRefList(mark.workflow_refs, { allowEmpty: true })
    || !canonicalRefList(mark.tool_refs, { allowEmpty: true })
    || !canonicalRefList(mark.authority_policy_refs)
    || !canonicalRefList(mark.project_scope_refs)
    || !isSafeRef(mark.memory_policy_ref)
    || !canonicalRefList(mark.evaluation_refs)
    || !isSafeRef(mark.supersedes_mark_ref)
    || !isSafeRef(mark.rollback_mark_ref)
    || mark.supersedes_mark_ref !== mark.rollback_mark_ref
    || mark.rollback_mark_ref === mark.mark_ref
    || !digestMatches(mark, 'mark_digest')) return invalid('mark');
  if (!sameList(mark.project_scope_refs, [projectRef])) {
    return hold(H.SHARED_OR_CROSS_PROJECT_CONTEXT_FORBIDDEN, 'mark_project_scope_refs');
  }
  return null;
}

function validateDeployment(deployment, mark, projectRef) {
  if (!exactShape(deployment, DEPLOYMENT_FIELDS)
    || deployment.schema_version !== AGENT_DEPLOYMENT_SCHEMA
    || !isSafeRef(deployment.deployment_ref)
    || !semver(deployment.deployment_version)
    || !isSafeRef(deployment.mark_ref)
    || !canonicalRefList(deployment.project_scope_refs)
    || !isSafeRef(deployment.runtime_ref)
    || !semver(deployment.runtime_version)
    || !isSafeRef(deployment.profile_ref)
    || !isSafeRef(deployment.session_ref)
    || !canonicalRefList(deployment.tool_refs, { allowEmpty: true })
    || !canonicalRefList(deployment.authority_policy_refs)
    || !(deployment.secret_ref === null
      || (isSafeRef(deployment.secret_ref) && deployment.secret_ref.startsWith('secretref:')))
    || !isSafeRef(deployment.supersedes_deployment_ref)
    || !isSafeRef(deployment.rollback_deployment_ref)
    || deployment.supersedes_deployment_ref !== deployment.rollback_deployment_ref
    || deployment.rollback_deployment_ref === deployment.deployment_ref
    || !digestMatches(deployment, 'deployment_digest')) return invalid('deployment');
  if (deployment.mark_ref !== mark.mark_ref
    || !sameList(deployment.project_scope_refs, [projectRef])) {
    return hold(H.SHARED_OR_CROSS_PROJECT_CONTEXT_FORBIDDEN, 'deployment_project_scope_refs');
  }
  if (!sameList(deployment.tool_refs, mark.tool_refs)
    || !sameList(deployment.authority_policy_refs, mark.authority_policy_refs)) {
    return hold(H.AGENT_BINDING_MISMATCH, 'mark_deployment_policy_snapshot');
  }
  return null;
}

function validateMemory(memory, mark, deployment) {
  if (!exactShape(memory, MEMORY_FIELDS)
    || memory.schema_version !== AGENT_MEMORY_GENERATION_SCHEMA
    || !isSafeRef(memory.memory_generation_ref)
    || !semver(memory.memory_version)
    || !digestRef(memory.memory_digest)
    || !isSafeRef(memory.mark_ref)
    || !isSafeRef(memory.deployment_ref)
    || !nullableRef(memory.parent_memory_generation_ref)
    || !isSafeRef(memory.memory_manifest_ref)
    || memory.memory_classification !== 'project_scoped_private_memory'
    || !isSafeRef(memory.retention_policy_ref)
    || !isSafeRef(memory.recovery_ref)
    || !isSafeRef(memory.rollback_ref)
    || !nullableRef(memory.supersedes_memory_generation_ref)
    || memory.parent_memory_generation_ref !== memory.supersedes_memory_generation_ref
    || !digestMatches(memory, 'memory_digest')) return invalid('memory_generation');
  if (memory.mark_ref !== mark.mark_ref || memory.deployment_ref !== deployment.deployment_ref) {
    return hold(H.AGENT_BINDING_MISMATCH, 'memory_binding');
  }
  return null;
}

function validateVerifiedReceipt(receipt, currentState, mark, deployment, memory, projectRef, evaluatedAt) {
  if (!exactShape(receipt, RECEIPT_FIELDS)
    || receipt.schema_version !== VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA
    || receipt.status !== 'VERIFIED_ACTIVE_BINDING'
    || receipt.claim_ceiling !== 'validated_private'
    || !exactShape(receipt.effect_boundary, RECEIPT_EFFECT_FIELDS)
    || RECEIPT_EFFECT_FIELDS.some((field) => receipt.effect_boundary[field] !== false)) {
    return hold(H.VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED);
  }
  for (const field of [
    'verification_receipt_ref', 'trusted_pin_ref', 'authority_receipt_ref', 'owner_ref',
    'authority_ref', 'verifier_ref', 'authority_state_evaluation_ref', 'project_scope_ref',
    'family_ref', 'mark_ref', 'deployment_ref', 'memory_generation_ref',
  ]) if (!isSafeRef(receipt[field])) return hold(H.VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED);
  for (const field of [
    'approval_claim_digest', 'authority_receipt_digest', 'lineage_digest', 'family_digest',
    'mark_digest', 'deployment_digest', 'memory_digest', 'receipt_digest',
  ]) if (!digestRef(receipt[field])) return hold(H.VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED);
  if (![receipt.issued_at, receipt.verified_at, receipt.authority_evaluated_at, receipt.expires_at]
    .every(exactUtcMs)
    || !Number.isSafeInteger(receipt.current_authority_epoch)
    || receipt.current_authority_epoch < 0
    || !Number.isSafeInteger(receipt.receipt_epoch)
    || receipt.receipt_epoch < 0
    || !Number.isSafeInteger(receipt.trusted_authority_epoch)
    || receipt.trusted_authority_epoch < 0
    || receipt.verified_at < receipt.issued_at
    || receipt.authority_evaluated_at < receipt.verified_at
    || receipt.authority_evaluated_at >= receipt.expires_at) {
    return hold(H.VERIFIED_AGENT_ACTIVE_BINDING_REQUIRED);
  }
  const receiptBody = { ...receipt };
  delete receiptBody.receipt_digest;
  if (receipt.receipt_digest !== digestOf(receiptBody)) {
    return hold(H.VERIFIED_BINDING_DIGEST_MISMATCH);
  }
  if (!exactShape(currentState, CURRENT_STATE_FIELDS)
    || currentState.schema_version !== AGENT_AUTHORITY_CURRENT_STATE_SCHEMA
    || !isSafeRef(currentState.evaluation_ref)
    || !exactUtcMs(currentState.evaluated_at)
    || !isSafeRef(currentState.authority_ref)
    || !Number.isSafeInteger(currentState.current_authority_epoch)
    || currentState.current_authority_epoch < 0
    || !canonicalRefList(currentState.revoked_pin_refs, { allowEmpty: true })
    || currentState.claim_ceiling !== 'validated_private'
    || currentState.evaluated_at !== evaluatedAt
    || currentState.authority_ref !== receipt.authority_ref) {
    return hold(H.AUTHORITY_STATE_NOT_CURRENT);
  }
  if (evaluatedAt < receipt.verified_at || evaluatedAt < receipt.authority_evaluated_at) {
    return hold(H.AUTHORITY_STATE_NOT_CURRENT);
  }
  if (evaluatedAt >= receipt.expires_at) return hold(H.AUTHORITY_BINDING_EXPIRED);
  if (currentState.revoked_pin_refs.includes(receipt.trusted_pin_ref)
    || currentState.current_authority_epoch !== receipt.receipt_epoch
    || receipt.current_authority_epoch !== receipt.receipt_epoch
    || receipt.trusted_authority_epoch !== receipt.receipt_epoch) {
    return hold(H.AUTHORITY_STATE_REVOKED);
  }
  if (receipt.project_scope_ref !== projectRef
    || receipt.family_ref !== mark.family_ref
    || receipt.mark_ref !== mark.mark_ref
    || receipt.mark_digest !== mark.mark_digest
    || receipt.deployment_ref !== deployment.deployment_ref
    || receipt.deployment_digest !== deployment.deployment_digest
    || receipt.memory_generation_ref !== memory.memory_generation_ref
    || receipt.memory_digest !== memory.memory_digest) {
    return hold(H.AGENT_BINDING_MISMATCH, 'verified_receipt_binding');
  }
  return null;
}

function prepareBinding(binding, slot, projectRef, evaluatedAt) {
  if (!exactShape(binding, BINDING_FIELDS) || binding.role_slot_ref !== slot.role_slot_ref) {
    return hold(H.ROLE_BINDING_GAP, slot.role_slot_ref);
  }
  const markHold = validateMark(binding.mark, projectRef);
  if (markHold !== null) return markHold;
  const deploymentHold = validateDeployment(binding.deployment, binding.mark, projectRef);
  if (deploymentHold !== null) return deploymentHold;
  const memoryHold = validateMemory(binding.memory_generation, binding.mark, binding.deployment);
  if (memoryHold !== null) return memoryHold;
  const receiptHold = validateVerifiedReceipt(
    binding.verified_active_binding,
    binding.current_authority_state,
    binding.mark,
    binding.deployment,
    binding.memory_generation,
    projectRef,
    evaluatedAt,
  );
  if (receiptHold !== null) return receiptHold;
  if (!binding.mark.role_refs.includes(slot.role_ref)
    || !includesAll(binding.mark.capability_refs, slot.required_capability_refs)
    || !includesAll(binding.mark.tool_refs, slot.required_tool_refs)
    || !includesAll(binding.mark.authority_policy_refs, slot.required_authority_policy_refs)) {
    return hold(H.ROLE_REQUIREMENT_MISMATCH, slot.role_slot_ref);
  }
  return {
    status: 'OK',
    approved_binding: {
      role_slot_ref: slot.role_slot_ref,
      role_class: slot.role_class,
      role_ref: slot.role_ref,
      family_ref: binding.mark.family_ref,
      mark_ref: binding.mark.mark_ref,
      mark_version: binding.mark.mark_version,
      mark_digest: binding.mark.mark_digest,
      deployment_ref: binding.deployment.deployment_ref,
      deployment_version: binding.deployment.deployment_version,
      deployment_digest: binding.deployment.deployment_digest,
      role_refs: [...binding.mark.role_refs],
      capability_refs: [...binding.mark.capability_refs],
      tool_refs: [...binding.mark.tool_refs],
      authority_policy_refs: [...binding.mark.authority_policy_refs],
      memory_policy_ref: binding.mark.memory_policy_ref,
      memory_generation_ref: binding.memory_generation.memory_generation_ref,
      memory_digest: binding.memory_generation.memory_digest,
      memory_recovery_ref: binding.memory_generation.recovery_ref,
      memory_rollback_ref: binding.memory_generation.rollback_ref,
      mark_rollback_ref: binding.mark.rollback_mark_ref,
      deployment_rollback_ref: binding.deployment.rollback_deployment_ref,
      verification_receipt_ref: binding.verified_active_binding.verification_receipt_ref,
      verification_receipt_digest: binding.verified_active_binding.receipt_digest,
      authority_receipt_ref: binding.verified_active_binding.authority_receipt_ref,
      authority_state_evaluation_ref: binding.current_authority_state.evaluation_ref,
      authority_evaluated_at: binding.current_authority_state.evaluated_at,
      expires_at: binding.verified_active_binding.expires_at,
    },
    runtime_reference: {
      role_slot_ref: slot.role_slot_ref,
      deployment_ref: binding.deployment.deployment_ref,
      runtime_ref: binding.deployment.runtime_ref,
      runtime_version: binding.deployment.runtime_version,
      profile_ref: binding.deployment.profile_ref,
      session_ref: binding.deployment.session_ref,
      secret_ref: binding.deployment.secret_ref,
    },
  };
}

/**
 * Prepare the bounded, public-safe input envelope consumed by a later pack emitter.
 * `admission_evaluated_at` is supplied by the authority caller; this pure module reads no clock.
 */
export function prepareProjectAiTeamPackAdmission(rawInput) {
  const guarded = guardEntry(rawInput, ROOT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;
  if (input.schema_version !== PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA
    || !exactUtcMs(input.admission_evaluated_at)) return invalid('admission_shape');
  if (!Object.hasOwn(input, 'project_mark_authority_pin')) {
    return hold(H.TRUSTED_PROJECT_MARK_AUTHORITY_PIN_REQUIRED);
  }
  if (!Object.hasOwn(input, 'project_mark_current_authority_state')) {
    return hold(H.TRUSTED_PROJECT_MARK_CURRENT_STATE_REQUIRED);
  }
  if (!exactShape(input, ROOT_FIELDS)) return invalid('admission_shape');

  const topologyHold = validateTopology(input.team_topology);
  if (topologyHold !== null) return topologyHold;
  const markHold = validateProjectMark(input.project_mark, input.team_topology);
  if (markHold !== null) return markHold;
  const projectMarkAuthorityHold = validateProjectMarkAuthority(
    input.project_mark,
    input.team_topology,
    input.project_mark_authority_pin,
    input.project_mark_current_authority_state,
    input.admission_evaluated_at,
  );
  if (projectMarkAuthorityHold !== null) return projectMarkAuthorityHold;
  if (!isDenseArray(input.agent_bindings) || input.agent_bindings.length !== input.team_topology.role_slots.length) {
    return hold(H.ROLE_BINDING_GAP);
  }

  const bySlot = new Map();
  for (const binding of input.agent_bindings) {
    if (!isPlainObject(binding) || !isSafeRef(binding.role_slot_ref) || bySlot.has(binding.role_slot_ref)) {
      return hold(H.DUPLICATE_AGENT_BINDING, 'role_slot_ref');
    }
    bySlot.set(binding.role_slot_ref, binding);
  }

  const uniqueness = new Map([
    ['mark_ref', new Set()], ['deployment_ref', new Set()], ['runtime_ref', new Set()],
    ['profile_ref', new Set()], ['session_ref', new Set()],
  ]);
  const approvedBindings = [];
  const runtimeReferences = [];
  for (const slot of input.team_topology.role_slots) {
    const binding = bySlot.get(slot.role_slot_ref);
    if (binding === undefined) return hold(H.ROLE_BINDING_GAP, slot.role_slot_ref);
    const prepared = prepareBinding(
      binding,
      slot,
      input.project_mark.project_scope_ref,
      input.admission_evaluated_at,
    );
    if (prepared.status !== 'OK') return prepared;
    const uniqueValues = {
      mark_ref: prepared.approved_binding.mark_ref,
      deployment_ref: prepared.approved_binding.deployment_ref,
      runtime_ref: prepared.runtime_reference.runtime_ref,
      profile_ref: prepared.runtime_reference.profile_ref,
      session_ref: prepared.runtime_reference.session_ref,
    };
    for (const [field, value] of Object.entries(uniqueValues)) {
      if (uniqueness.get(field).has(value)) return hold(H.DUPLICATE_AGENT_BINDING, field);
      uniqueness.get(field).add(value);
    }
    approvedBindings.push(prepared.approved_binding);
    runtimeReferences.push(prepared.runtime_reference);
  }
  if (bySlot.size !== input.team_topology.role_slots.length) return hold(H.ROLE_BINDING_GAP);

  const body = {
    schema_version: PROJECT_AI_TEAM_PACK_ADMISSION_SCHEMA,
    status: 'PREPARED_PROJECT_AI_TEAM_PACK_INPUT',
    pack_id: 'project_ai_team_pack',
    admission_evaluated_at: input.admission_evaluated_at,
    project_scope_ref: input.project_mark.project_scope_ref,
    project_mark_ref: input.project_mark.project_mark_ref,
    project_mark_version: input.project_mark.project_mark_version,
    project_mark_digest: input.project_mark.project_mark_digest,
    project_mark_approval_receipt_ref: input.project_mark.approval_receipt_ref,
    project_mark_approval_receipt_digest: input.project_mark_authority_pin.approval_receipt_digest,
    project_mark_verification_receipt_ref: input.project_mark_authority_pin.verification_receipt_ref,
    project_mark_authority_evaluation_ref: input.project_mark_current_authority_state.evaluation_ref,
    project_mark_authority_evaluated_at: input.project_mark_current_authority_state.evaluated_at,
    project_mark_approval_expires_at: input.project_mark_authority_pin.expires_at,
    project_mark_rollback_ref: input.project_mark.rollback_project_mark_ref,
    team_topology_ref: input.team_topology.team_topology_ref,
    team_topology_version: input.team_topology.team_topology_version,
    team_topology_digest: input.team_topology.team_topology_digest,
    approved_project_mark_deployment_bindings: approvedBindings,
    runtime_references: runtimeReferences,
    authority_granted: false,
    profile_or_runtime_created: false,
    runtime_configured_or_started: false,
    pack_emitted_or_released: false,
    effect_boundary: {
      filesystem_or_persistence_write: false,
      runtime_or_profile_call: false,
      configuration_mutation: false,
      authority_or_task_mutation: false,
      network_or_clock_call: false,
    },
  };
  return deepFreeze({ ...body, input_envelope_digest: digestOf(body) });
}
