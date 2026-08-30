/**
 * Public-safe, pure Agent workforce lineage contract.
 *
 * This is deliberately not the Agent Observation store. `agent_record.v1` says which observed
 * provider identity belongs to which project-bound agent; it is not an approved Agent Mark and
 * cannot be promoted into one by shape inference. This module only prepares a frozen contract
 * packet. It persists nothing, calls no runtime, changes no configuration, and activates no
 * authority.
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
} from './guard_primitives.mjs';
import { AGENT_RECORD_SCHEMA } from './agent_registry.mjs';
import { ENTRY_CODES, MAX_LIST } from './observation_internals.mjs';

export const AGENT_FAMILY_SCHEMA = 'soulforge.agent_observation.agent_family.v0';
export const AGENT_MARK_SCHEMA = 'soulforge.agent_observation.agent_mark.v0';
export const AGENT_DEPLOYMENT_SCHEMA = 'soulforge.agent_observation.agent_deployment.v0';
export const AGENT_MARK_RUN_SCHEMA = 'soulforge.agent_observation.agent_mark_run.v0';
export const AGENT_MEMORY_GENERATION_SCHEMA = 'soulforge.agent_observation.agent_memory_generation.v0';
export const AGENT_WORKFORCE_LINEAGE_SCHEMA = 'soulforge.agent_observation.agent_workforce_lineage.v0';

export const AGENT_WORKFORCE_LINEAGE_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: ENTRY_CODES.unknownField,
  SECRET_VALUE_FORBIDDEN: ENTRY_CODES.secret,
  LOCAL_PATH_VALUE_FORBIDDEN: ENTRY_CODES.localPath,
  INPUT_TOO_DEEP: ENTRY_CODES.tooDeep,
  INPUT_TOO_LARGE: ENTRY_CODES.tooLarge,
  HOSTILE_INPUT_REFUSED: ENTRY_CODES.hostileInput,
  ACCESSOR_PROPERTY_FORBIDDEN: ENTRY_CODES.accessor,
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  AGENT_RECORD_NOT_AGENT_MARK: 'AGENT_RECORD_NOT_AGENT_MARK',
  REVISION_DIGEST_MISMATCH: 'REVISION_DIGEST_MISMATCH',
  FAMILY_MARK_MISMATCH: 'FAMILY_MARK_MISMATCH',
  MARK_DEPLOYMENT_MISMATCH: 'MARK_DEPLOYMENT_MISMATCH',
  RUN_DEPLOYMENT_MISMATCH: 'RUN_DEPLOYMENT_MISMATCH',
  PROJECT_SCOPE_MISMATCH: 'PROJECT_SCOPE_MISMATCH',
  MEMORY_LINEAGE_MISMATCH: 'MEMORY_LINEAGE_MISMATCH',
  BINDING_SNAPSHOT_MISMATCH: 'BINDING_SNAPSHOT_MISMATCH',
  EFFECT_ACTIVATION_FORBIDDEN: 'EFFECT_ACTIVATION_FORBIDDEN',
});

const H = AGENT_WORKFORCE_LINEAGE_HOLD_CODES;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const UNKNOWN = 'UNKNOWN';

const ROOT_FIELDS = Object.freeze([
  'schema_version', 'family', 'mark', 'deployment', 'run', 'memory_generation', 'effect_boundary',
]);
const FAMILY_FIELDS = Object.freeze([
  'schema_version', 'family_ref', 'family_version', 'family_digest', 'lifecycle_state',
  'role_refs', 'capability_refs', 'supersedes_family_ref', 'rollback_family_ref',
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
const RUN_FIELDS = Object.freeze([
  'schema_version', 'run_ref', 'run_version', 'run_digest', 'deployment_ref', 'mark_ref',
  'project_ref', 'assignment_ref', 'work_brief_ref', 'runtime_ref', 'profile_ref',
  'session_ref', 'requested_model_id', 'observed_model_id', 'requested_effort',
  'observed_effort', 'result_refs', 'evidence_refs', 'started_at', 'ended_at', 'run_state',
]);
const MEMORY_FIELDS = Object.freeze([
  'schema_version', 'memory_generation_ref', 'memory_version', 'memory_digest', 'mark_ref',
  'deployment_ref', 'parent_memory_generation_ref', 'memory_manifest_ref',
  'memory_classification', 'retention_policy_ref', 'recovery_ref', 'rollback_ref',
  'supersedes_memory_generation_ref',
]);
const EFFECT_FIELDS = Object.freeze([
  'persistence_write', 'runtime_call', 'configuration_mutation', 'authority_activation', 'external_call',
]);
const MODEL_EFFORT_FIELDS = Object.freeze([
  'requested_model_id', 'observed_model_id', 'requested_effort', 'observed_effort',
]);

const LIFECYCLE_STATES = Object.freeze(['candidate', 'approved', 'superseded', 'retired']);
const RUN_STATES = Object.freeze(['prepared', 'running_observed', 'result_observed', 'failed_observed', 'held']);
const MEMORY_CLASSES = Object.freeze(['agent_runtime_cache', 'project_scoped_private_memory', 'recovery_snapshot_metadata']);

function shapeHold(value, fields, detail) {
  if (!isPlainObject(value)) return invalid(detail);
  const extra = unknownKeyIn(value, fields);
  if (extra !== null) return hold(H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN, extra);
  if (!fields.every((field) => Object.hasOwn(value, field))) return invalid(detail);
  return null;
}

function canonicalRefList(value, { allowEmpty = false } = {}) {
  if (!isDenseArray(value) || value.length > MAX_LIST || (!allowEmpty && value.length === 0)) return false;
  if (!value.every(isSafeRef)) return false;
  if (new Set(value).size !== value.length) return false;
  for (let index = 1; index < value.length; index += 1) if (value[index - 1] > value[index]) return false;
  return true;
}

const nullableRef = (value) => value === null || isSafeRef(value);
const secretPointer = (value) => value === null || (isSafeRef(value) && value.startsWith('secretref:'));
const version = (value) => typeof value === 'string' && SEMVER.test(value);
const digest = (value) => typeof value === 'string' && SHA256_REF.test(value);
const modelOrEffort = (value) => value === UNKNOWN || isSafeRef(value);
const sameList = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
const revisionLineage = (currentRef, supersedesRef, rollbackRef) => (
  (supersedesRef === null && rollbackRef === null)
  || (isSafeRef(supersedesRef) && supersedesRef === rollbackRef && supersedesRef !== currentRef)
);

export function computeLineageRecordDigest(record) {
  return digestOf(record);
}

function normalizeModelEffort(record) {
  const copy = { ...record };
  for (const field of MODEL_EFFORT_FIELDS) {
    if (copy[field] === undefined || copy[field] === null || copy[field] === '') copy[field] = UNKNOWN;
  }
  return copy;
}

function digestMatches(record, digestField) {
  if (!digest(record[digestField])) return false;
  const body = { ...record };
  delete body[digestField];
  return record[digestField] === computeLineageRecordDigest(body);
}

function invalid(detail) {
  return hold(H.INVALID_FIELD_VALUE, detail);
}

/**
 * Prepare a frozen, public-safe lineage packet. `PREPARED_CONTRACT` is not registration,
 * deployment, run start, authority activation, task completion, or memory promotion.
 */
export function prepareAgentWorkforceLineageContract(rawInput) {
  const guarded = guardEntry(rawInput, ROOT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;

  const rootShape = shapeHold(input, ROOT_FIELDS, 'lineage_shape');
  if (rootShape !== null) return rootShape;
  if (input.schema_version !== AGENT_WORKFORCE_LINEAGE_SCHEMA) return invalid('schema_version');

  // `agent_record.v1` is provider identity observation, never an Agent Mark. Keep an explicit
  // refusal so a future adapter cannot silently treat similar identity fields as approval.
  if (isPlainObject(input.mark) && input.mark.schema_version === AGENT_RECORD_SCHEMA) {
    return hold(H.AGENT_RECORD_NOT_AGENT_MARK);
  }

  const familyShape = shapeHold(input.family, FAMILY_FIELDS, 'family_shape');
  if (familyShape !== null) return familyShape;
  const family = input.family;
  if (family.schema_version !== AGENT_FAMILY_SCHEMA
    || !isSafeRef(family.family_ref)
    || !version(family.family_version)
    || !LIFECYCLE_STATES.includes(family.lifecycle_state)
    || !canonicalRefList(family.role_refs)
    || !canonicalRefList(family.capability_refs)
    || !nullableRef(family.supersedes_family_ref)
    || !nullableRef(family.rollback_family_ref)
    || !revisionLineage(family.family_ref, family.supersedes_family_ref, family.rollback_family_ref)) return invalid('family');
  if (!digestMatches(family, 'family_digest')) return hold(H.REVISION_DIGEST_MISMATCH, 'family_digest');

  if (!isPlainObject(input.mark)) return invalid('mark_shape');
  const mark = normalizeModelEffort(input.mark);
  const markShape = shapeHold(mark, MARK_FIELDS, 'mark_shape');
  if (markShape !== null) return markShape;
  if (mark.schema_version !== AGENT_MARK_SCHEMA
    || !isSafeRef(mark.mark_ref)
    || !version(mark.mark_version)
    || !isSafeRef(mark.family_ref)
    || !isSafeRef(mark.soul_revision_ref)
    || !digest(mark.soul_digest)
    || !isSafeRef(mark.instruction_revision_ref)
    || !digest(mark.instruction_digest)
    || !MODEL_EFFORT_FIELDS.every((field) => modelOrEffort(mark[field]))
    || !canonicalRefList(mark.role_refs)
    || !canonicalRefList(mark.capability_refs)
    || !canonicalRefList(mark.skill_refs)
    || !canonicalRefList(mark.workflow_refs)
    || !canonicalRefList(mark.tool_refs)
    || !canonicalRefList(mark.authority_policy_refs)
    || !canonicalRefList(mark.project_scope_refs)
    || !isSafeRef(mark.memory_policy_ref)
    || !canonicalRefList(mark.evaluation_refs)
    || !nullableRef(mark.supersedes_mark_ref)
    || !nullableRef(mark.rollback_mark_ref)
    || !revisionLineage(mark.mark_ref, mark.supersedes_mark_ref, mark.rollback_mark_ref)) return invalid('mark');
  if (!digestMatches(mark, 'mark_digest')) return hold(H.REVISION_DIGEST_MISMATCH, 'mark_digest');

  const deploymentShape = shapeHold(input.deployment, DEPLOYMENT_FIELDS, 'deployment_shape');
  if (deploymentShape !== null) return deploymentShape;
  const deployment = input.deployment;
  if (deployment.schema_version !== AGENT_DEPLOYMENT_SCHEMA
    || !isSafeRef(deployment.deployment_ref)
    || !version(deployment.deployment_version)
    || !isSafeRef(deployment.mark_ref)
    || !canonicalRefList(deployment.project_scope_refs)
    || !isSafeRef(deployment.runtime_ref)
    || !version(deployment.runtime_version)
    || !isSafeRef(deployment.profile_ref)
    || !isSafeRef(deployment.session_ref)
    || !canonicalRefList(deployment.tool_refs)
    || !canonicalRefList(deployment.authority_policy_refs)
    || !secretPointer(deployment.secret_ref)
    || !nullableRef(deployment.supersedes_deployment_ref)
    || !nullableRef(deployment.rollback_deployment_ref)
    || !revisionLineage(
      deployment.deployment_ref,
      deployment.supersedes_deployment_ref,
      deployment.rollback_deployment_ref,
    )) return invalid('deployment');
  if (!digestMatches(deployment, 'deployment_digest')) return hold(H.REVISION_DIGEST_MISMATCH, 'deployment_digest');

  if (!isPlainObject(input.run)) return invalid('run_shape');
  const run = normalizeModelEffort(input.run);
  const runShape = shapeHold(run, RUN_FIELDS, 'run_shape');
  if (runShape !== null) return runShape;
  if (run.schema_version !== AGENT_MARK_RUN_SCHEMA
    || !isSafeRef(run.run_ref)
    || !version(run.run_version)
    || !isSafeRef(run.deployment_ref)
    || !isSafeRef(run.mark_ref)
    || !isSafeRef(run.project_ref)
    || !isSafeRef(run.assignment_ref)
    || !isSafeRef(run.work_brief_ref)
    || !isSafeRef(run.runtime_ref)
    || !isSafeRef(run.profile_ref)
    || !isSafeRef(run.session_ref)
    || !MODEL_EFFORT_FIELDS.every((field) => modelOrEffort(run[field]))
    || !canonicalRefList(run.result_refs, { allowEmpty: true })
    || !canonicalRefList(run.evidence_refs, { allowEmpty: true })
    || !isUtcMs(run.started_at)
    || !(run.ended_at === null || isUtcMs(run.ended_at))
    || !RUN_STATES.includes(run.run_state)) return invalid('run');
  if (run.ended_at !== null && run.ended_at < run.started_at) return invalid('run_clock');
  if (run.run_state === 'running_observed' && run.ended_at !== null) return invalid('run_state_clock');
  if (run.run_state === 'result_observed' && (run.ended_at === null || run.result_refs.length === 0)) return invalid('run_result');
  if (!digestMatches(run, 'run_digest')) return hold(H.REVISION_DIGEST_MISMATCH, 'run_digest');

  const memoryShape = shapeHold(input.memory_generation, MEMORY_FIELDS, 'memory_shape');
  if (memoryShape !== null) return memoryShape;
  const memoryGeneration = input.memory_generation;
  if (memoryGeneration.schema_version !== AGENT_MEMORY_GENERATION_SCHEMA
    || !isSafeRef(memoryGeneration.memory_generation_ref)
    || !version(memoryGeneration.memory_version)
    || !isSafeRef(memoryGeneration.mark_ref)
    || !isSafeRef(memoryGeneration.deployment_ref)
    || !nullableRef(memoryGeneration.parent_memory_generation_ref)
    || !isSafeRef(memoryGeneration.memory_manifest_ref)
    || !MEMORY_CLASSES.includes(memoryGeneration.memory_classification)
    || !isSafeRef(memoryGeneration.retention_policy_ref)
    || !isSafeRef(memoryGeneration.recovery_ref)
    || !isSafeRef(memoryGeneration.rollback_ref)
    || !nullableRef(memoryGeneration.supersedes_memory_generation_ref)) return invalid('memory_generation');
  if (memoryGeneration.parent_memory_generation_ref !== memoryGeneration.supersedes_memory_generation_ref) {
    return hold(H.MEMORY_LINEAGE_MISMATCH, 'memory_parent_supersession');
  }
  if (!digestMatches(memoryGeneration, 'memory_digest')) return hold(H.REVISION_DIGEST_MISMATCH, 'memory_digest');

  const effectShape = shapeHold(input.effect_boundary, EFFECT_FIELDS, 'effect_boundary_shape');
  if (effectShape !== null) return effectShape;
  if (EFFECT_FIELDS.some((field) => input.effect_boundary[field] !== false)) {
    return hold(H.EFFECT_ACTIVATION_FORBIDDEN);
  }

  if (mark.family_ref !== family.family_ref) return hold(H.FAMILY_MARK_MISMATCH);
  if (deployment.mark_ref !== mark.mark_ref) return hold(H.MARK_DEPLOYMENT_MISMATCH);
  if (run.deployment_ref !== deployment.deployment_ref || run.mark_ref !== mark.mark_ref) {
    return hold(H.RUN_DEPLOYMENT_MISMATCH);
  }
  if (!deployment.project_scope_refs.includes(run.project_ref)
    || !mark.project_scope_refs.includes(run.project_ref)) return hold(H.PROJECT_SCOPE_MISMATCH);
  if (memoryGeneration.mark_ref !== mark.mark_ref
    || memoryGeneration.deployment_ref !== deployment.deployment_ref) return hold(H.MEMORY_LINEAGE_MISMATCH);

  if (!sameList(family.role_refs, mark.role_refs)
    || !sameList(family.capability_refs, mark.capability_refs)
    || !sameList(mark.project_scope_refs, deployment.project_scope_refs)
    || !sameList(mark.tool_refs, deployment.tool_refs)
    || !sameList(mark.authority_policy_refs, deployment.authority_policy_refs)
    || run.runtime_ref !== deployment.runtime_ref
    || run.profile_ref !== deployment.profile_ref
    || run.session_ref !== deployment.session_ref) return hold(H.BINDING_SNAPSHOT_MISMATCH);

  const record = deepFreeze({
    schema_version: AGENT_WORKFORCE_LINEAGE_SCHEMA,
    family: { ...family, role_refs: [...family.role_refs], capability_refs: [...family.capability_refs] },
    mark: {
      ...mark,
      role_refs: [...mark.role_refs], capability_refs: [...mark.capability_refs],
      skill_refs: [...mark.skill_refs], workflow_refs: [...mark.workflow_refs], tool_refs: [...mark.tool_refs],
      authority_policy_refs: [...mark.authority_policy_refs], project_scope_refs: [...mark.project_scope_refs],
      evaluation_refs: [...mark.evaluation_refs],
    },
    deployment: {
      ...deployment,
      project_scope_refs: [...deployment.project_scope_refs], tool_refs: [...deployment.tool_refs],
      authority_policy_refs: [...deployment.authority_policy_refs],
    },
    run: { ...run, result_refs: [...run.result_refs], evidence_refs: [...run.evidence_refs] },
    memory_generation: { ...memoryGeneration },
    effect_boundary: { ...input.effect_boundary },
  });

  return {
    status: 'PREPARED_CONTRACT',
    schema_version: AGENT_WORKFORCE_LINEAGE_SCHEMA,
    lineage_digest: digestOf(record),
    record,
  };
}
