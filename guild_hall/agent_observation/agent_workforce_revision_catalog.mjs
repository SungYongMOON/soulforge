/**
 * Pure, in-memory revision catalog for prepared Agent workforce lineage contracts.
 *
 * This catalog deliberately stores only metadata refs and digests from a freshly revalidated
 * `PREPARED_CONTRACT`. Its ledger is hidden behind a WeakMap, append-only, and process-local. An
 * `approval_claim` catalog event means only that the caller supplied an authority-receipt ref;
 * this module does not read or validate that receipt and therefore grants no authority. It performs no
 * persistence, runtime call, run start, task mutation, configuration change, or promotion.
 */

import {
  deepFreeze,
  digestOf,
  guardEntry,
  hold,
  isPlainObject,
  isSafeRef,
  isUtcMs,
  unknownKeyIn,
} from './guard_primitives.mjs';
import { ENTRY_CODES } from './observation_internals.mjs';
import {
  AGENT_WORKFORCE_LINEAGE_HOLD_CODES,
  AGENT_WORKFORCE_LINEAGE_SCHEMA,
  prepareAgentWorkforceLineageContract,
} from './agent_mark_lineage.mjs';

export const AGENT_WORKFORCE_REVISION_EVENT_SCHEMA = 'soulforge.agent_observation.agent_workforce_revision_event.v0';

export const AGENT_WORKFORCE_REVISION_CATALOG_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: ENTRY_CODES.unknownField,
  SECRET_VALUE_FORBIDDEN: ENTRY_CODES.secret,
  LOCAL_PATH_VALUE_FORBIDDEN: ENTRY_CODES.localPath,
  INPUT_TOO_DEEP: ENTRY_CODES.tooDeep,
  INPUT_TOO_LARGE: ENTRY_CODES.tooLarge,
  HOSTILE_INPUT_REFUSED: ENTRY_CODES.hostileInput,
  ACCESSOR_PROPERTY_FORBIDDEN: ENTRY_CODES.accessor,
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNKNOWN_CATALOG: 'UNKNOWN_CATALOG',
  PREPARED_CONTRACT_REQUIRED: 'PREPARED_CONTRACT_REQUIRED',
  PREPARED_CONTRACT_DIGEST_MISMATCH: 'PREPARED_CONTRACT_DIGEST_MISMATCH',
  EVENT_CONFLICT: 'EVENT_CONFLICT',
  LINEAGE_STATE_CONFLICT: 'LINEAGE_STATE_CONFLICT',
  REVISION_REF_CONFLICT: 'REVISION_REF_CONFLICT',
  UNKNOWN_SUPERSEDED_REVISION: 'UNKNOWN_SUPERSEDED_REVISION',
  NON_MONOTONIC_VERSION: 'NON_MONOTONIC_VERSION',
  SUPERSESSION_REQUIRED: 'SUPERSESSION_REQUIRED',
  WORKFORCE_REVISION_UNCHANGED: 'WORKFORCE_REVISION_UNCHANGED',
  ROLLBACK_CANDIDATE_INVALID: 'ROLLBACK_CANDIDATE_INVALID',
  AUTHORITY_RECEIPT_REQUIRED: 'AUTHORITY_RECEIPT_REQUIRED',
  AUTHORITY_RECEIPT_FORBIDDEN: 'AUTHORITY_RECEIPT_FORBIDDEN',
  CLAIMED_SCOPE_CONFLICT: 'CLAIMED_SCOPE_CONFLICT',
});

const H = AGENT_WORKFORCE_REVISION_CATALOG_HOLD_CODES;
const STATE = new WeakMap();
const INPUT_FIELDS = Object.freeze([
  'event_ref', 'catalog_state', 'authority_receipt_ref', 'recorded_at', 'prepared_contract',
]);
const PREPARED_FIELDS = Object.freeze(['status', 'schema_version', 'lineage_digest', 'record']);
const CATALOG_STATES = Object.freeze(['candidate', 'approval_claim']);

const versionTuple = (value) => value.split('.').map((part) => Number.parseInt(part, 10));
const versionGreaterThan = (current, prior) => {
  const left = versionTuple(current);
  const right = versionTuple(prior);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return false;
};

const eventDigest = (event) => digestOf(event);
const sameRecord = (left, right) => digestOf(left) === digestOf(right);

export function createAgentWorkforceRevisionCatalog() {
  const handle = Object.freeze({ kind: 'soulforge.agent_observation.agent_workforce_revision_catalog.v0' });
  STATE.set(handle, {
    events: [],
    eventByRef: new Map(),
    lineageStateIndex: new Map(),
    families: new Map(),
    marks: new Map(),
    deployments: new Map(),
    memories: new Map(),
    approvalClaimByProjectScope: new Map(),
  });
  return handle;
}

function validatePreparedContract(prepared) {
  if (!isPlainObject(prepared)) return hold(H.PREPARED_CONTRACT_REQUIRED);
  const extra = unknownKeyIn(prepared, PREPARED_FIELDS);
  if (extra !== null || !PREPARED_FIELDS.every((field) => Object.hasOwn(prepared, field))) {
    return hold(H.PREPARED_CONTRACT_REQUIRED);
  }
  if (prepared.status !== 'PREPARED_CONTRACT' || prepared.schema_version !== AGENT_WORKFORCE_LINEAGE_SCHEMA) {
    return hold(H.PREPARED_CONTRACT_REQUIRED);
  }
  const revalidated = prepareAgentWorkforceLineageContract(prepared.record);
  if (revalidated.status !== 'PREPARED_CONTRACT') return revalidated;
  if (revalidated.lineage_digest !== prepared.lineage_digest) {
    return hold(H.PREPARED_CONTRACT_DIGEST_MISMATCH);
  }
  return revalidated;
}

function recordConflict(index, ref, record, digestField) {
  const existing = index.get(ref);
  if (existing === undefined) return null;
  return existing[digestField] === record[digestField]
    ? null
    : hold(H.REVISION_REF_CONFLICT);
}

function priorRevision(index, ref) {
  if (ref === null) return null;
  return index.get(ref) ?? undefined;
}

function validateMonotonicRevision(index, current, config) {
  const { refField, versionField, supersedesField, rollbackField } = config;
  const supersedesRef = current[supersedesField];
  if (supersedesRef === null) return null;
  const prior = priorRevision(index, supersedesRef);
  if (prior === undefined) return hold(H.UNKNOWN_SUPERSEDED_REVISION);
  if (!versionGreaterThan(current[versionField], prior[versionField])) {
    return hold(H.NON_MONOTONIC_VERSION, versionField);
  }
  if (rollbackField !== null && current[rollbackField] !== supersedesRef) {
    return hold(H.ROLLBACK_CANDIDATE_INVALID, refField);
  }
  return null;
}

function uniqueClaimedHead(entries) {
  const claimed = entries.filter((entry) => entry !== undefined);
  if (claimed.length === 0) return { status: 'EMPTY', claimed: null };
  const first = claimed[0];
  if (claimed.length !== entries.length || claimed.some((entry) => entry.lineage_digest !== first.lineage_digest)) {
    return { status: 'CONFLICT', claimed: null };
  }
  return { status: 'CLAIMED', claimed: first };
}

function validateAgainstClaimedHead(state, record) {
  const { family, mark, deployment, memory_generation: memory } = record;
  const claimedSet = uniqueClaimedHead(
    deployment.project_scope_refs.map((scope) => state.approvalClaimByProjectScope.get(scope)),
  );
  if (claimedSet.status === 'CONFLICT') return hold(H.CLAIMED_SCOPE_CONFLICT);
  if (claimedSet.status === 'EMPTY') {
    if (mark.supersedes_mark_ref !== null
      || deployment.supersedes_deployment_ref !== null
      || memory.supersedes_memory_generation_ref !== null) return hold(H.UNKNOWN_SUPERSEDED_REVISION);
    return null;
  }

  const claimed = claimedSet.claimed;
  const exactOrSuperseding = (currentRef, supersedesRef, rollbackRef, priorRef) => (
    currentRef === priorRef
      ? supersedesRef === null && rollbackRef === null
      : supersedesRef === priorRef && rollbackRef === priorRef
  );
  if (!exactOrSuperseding(mark.mark_ref, mark.supersedes_mark_ref, mark.rollback_mark_ref, claimed.mark_ref)) {
    return hold(H.SUPERSESSION_REQUIRED, 'mark_ref');
  }
  if (!exactOrSuperseding(
    deployment.deployment_ref,
    deployment.supersedes_deployment_ref,
    deployment.rollback_deployment_ref,
    claimed.deployment_ref,
  )) {
    return hold(H.SUPERSESSION_REQUIRED, 'deployment_ref');
  }
  if (memory.memory_generation_ref === claimed.memory_generation_ref) {
    if (memory.parent_memory_generation_ref !== null || memory.supersedes_memory_generation_ref !== null) {
      return hold(H.SUPERSESSION_REQUIRED, 'memory_generation_ref');
    }
  } else if (memory.parent_memory_generation_ref !== claimed.memory_generation_ref
    || memory.supersedes_memory_generation_ref !== claimed.memory_generation_ref) {
    return hold(H.SUPERSESSION_REQUIRED, 'memory_generation_ref');
  }
  if (family.family_ref === claimed.family_ref
    && mark.mark_ref === claimed.mark_ref
    && deployment.deployment_ref === claimed.deployment_ref
    && memory.memory_generation_ref === claimed.memory_generation_ref) {
    return hold(H.WORKFORCE_REVISION_UNCHANGED);
  }
  if (family.family_ref === claimed.family_ref) {
    if (family.supersedes_family_ref !== null || family.rollback_family_ref !== null) {
      return hold(H.ROLLBACK_CANDIDATE_INVALID, 'family_ref');
    }
  } else if (family.supersedes_family_ref !== claimed.family_ref
    || family.rollback_family_ref !== claimed.family_ref) {
    return hold(H.SUPERSESSION_REQUIRED, 'family_ref');
  }
  return null;
}

function catalogEvent(input, prepared) {
  const { family, mark, deployment, memory_generation: memory } = prepared.record;
  return deepFreeze({
    schema_version: AGENT_WORKFORCE_REVISION_EVENT_SCHEMA,
    event_ref: input.event_ref,
    catalog_state: input.catalog_state,
    authority_receipt_ref: input.authority_receipt_ref,
    authority_receipt_verified: false,
    authority_evidence_class: 'caller_supplied_ref_only',
    recorded_at: input.recorded_at,
    lineage_digest: prepared.lineage_digest,
    family_ref: family.family_ref,
    family_version: family.family_version,
    family_digest: family.family_digest,
    family_lifecycle_claim: family.lifecycle_state,
    supersedes_family_ref: family.supersedes_family_ref,
    rollback_family_ref: family.rollback_family_ref,
    mark_ref: mark.mark_ref,
    mark_version: mark.mark_version,
    mark_digest: mark.mark_digest,
    supersedes_mark_ref: mark.supersedes_mark_ref,
    rollback_mark_ref: mark.rollback_mark_ref,
    deployment_ref: deployment.deployment_ref,
    deployment_version: deployment.deployment_version,
    deployment_digest: deployment.deployment_digest,
    supersedes_deployment_ref: deployment.supersedes_deployment_ref,
    rollback_deployment_ref: deployment.rollback_deployment_ref,
    memory_generation_ref: memory.memory_generation_ref,
    memory_version: memory.memory_version,
    memory_digest: memory.memory_digest,
    parent_memory_generation_ref: memory.parent_memory_generation_ref,
    supersedes_memory_generation_ref: memory.supersedes_memory_generation_ref,
    project_scope_refs: Object.freeze([...deployment.project_scope_refs]),
    effect_boundary: Object.freeze({
      persists_catalog: false,
      verifies_authority_receipt: false,
      approves_or_promotes: false,
      starts_runtime_or_run: false,
      mutates_task_or_project: false,
      performs_external_call: false,
    }),
  });
}

function appendRevisionIndex(index, ref, record) {
  if (!index.has(ref)) index.set(ref, record);
}

/**
 * Append a candidate or caller-receipt-backed approval claim.
 *
 * `approval_claim` is intentionally not an authority verdict. The event records an opaque authority ref
 * and keeps `authority_receipt_verified: false`; a separate authority owner must validate it.
 */
export function appendAgentWorkforceRevisionEvent(catalog, rawInput) {
  const state = STATE.get(catalog);
  if (state === undefined) return hold(H.UNKNOWN_CATALOG);
  const guarded = guardEntry(rawInput, INPUT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const input = guarded.value;
  if (!INPUT_FIELDS.every((field) => Object.hasOwn(input, field))) return hold(H.INVALID_FIELD_VALUE, 'event_shape');
  if (!isSafeRef(input.event_ref)) return hold(H.INVALID_FIELD_VALUE, 'event_ref');
  if (!CATALOG_STATES.includes(input.catalog_state)) return hold(H.INVALID_FIELD_VALUE, 'catalog_state');
  if (!isUtcMs(input.recorded_at)) return hold(H.INVALID_FIELD_VALUE, 'recorded_at');
  if (input.catalog_state === 'candidate' && input.authority_receipt_ref !== null) {
    return hold(H.AUTHORITY_RECEIPT_FORBIDDEN);
  }
  if (input.catalog_state === 'approval_claim' && !isSafeRef(input.authority_receipt_ref)) {
    return hold(H.AUTHORITY_RECEIPT_REQUIRED);
  }

  const prepared = validatePreparedContract(input.prepared_contract);
  if (prepared.status !== 'PREPARED_CONTRACT') return prepared;
  const event = catalogEvent(input, prepared);
  const priorEvent = state.eventByRef.get(event.event_ref);
  if (priorEvent !== undefined) {
    return eventDigest(priorEvent) === eventDigest(event)
      ? { status: 'NO_OP', event: priorEvent }
      : hold(H.EVENT_CONFLICT);
  }
  const lineageStateKey = `${event.lineage_digest}\u0000${event.catalog_state}`;
  const priorStateEvent = state.lineageStateIndex.get(lineageStateKey);
  if (priorStateEvent !== undefined) return hold(H.LINEAGE_STATE_CONFLICT);

  const { family, mark, deployment, memory_generation: memory } = prepared.record;
  for (const conflict of [
    recordConflict(state.families, family.family_ref, family, 'family_digest'),
    recordConflict(state.marks, mark.mark_ref, mark, 'mark_digest'),
    recordConflict(state.deployments, deployment.deployment_ref, deployment, 'deployment_digest'),
    recordConflict(state.memories, memory.memory_generation_ref, memory, 'memory_digest'),
  ]) if (conflict !== null) return conflict;

  for (const monotonic of [
    validateMonotonicRevision(state.families, family, {
      refField: 'family_ref', versionField: 'family_version', supersedesField: 'supersedes_family_ref', rollbackField: 'rollback_family_ref',
    }),
    validateMonotonicRevision(state.marks, mark, {
      refField: 'mark_ref', versionField: 'mark_version', supersedesField: 'supersedes_mark_ref', rollbackField: 'rollback_mark_ref',
    }),
    validateMonotonicRevision(state.deployments, deployment, {
      refField: 'deployment_ref', versionField: 'deployment_version', supersedesField: 'supersedes_deployment_ref', rollbackField: 'rollback_deployment_ref',
    }),
    validateMonotonicRevision(state.memories, memory, {
      refField: 'memory_generation_ref', versionField: 'memory_version', supersedesField: 'supersedes_memory_generation_ref', rollbackField: null,
    }),
  ]) if (monotonic !== null) return monotonic;

  const claimedHeadValidation = validateAgainstClaimedHead(state, prepared.record);
  if (claimedHeadValidation !== null) return claimedHeadValidation;

  appendRevisionIndex(state.families, family.family_ref, family);
  appendRevisionIndex(state.marks, mark.mark_ref, mark);
  appendRevisionIndex(state.deployments, deployment.deployment_ref, deployment);
  appendRevisionIndex(state.memories, memory.memory_generation_ref, memory);
  state.events.push(event);
  state.eventByRef.set(event.event_ref, event);
  state.lineageStateIndex.set(lineageStateKey, event);

  if (event.catalog_state === 'approval_claim') {
    const claimed = deepFreeze({
      project_scope_refs: [...event.project_scope_refs],
      lineage_digest: event.lineage_digest,
      family_ref: event.family_ref,
      family_digest: event.family_digest,
      mark_ref: event.mark_ref,
      mark_digest: event.mark_digest,
      deployment_ref: event.deployment_ref,
      deployment_digest: event.deployment_digest,
      memory_generation_ref: event.memory_generation_ref,
      memory_digest: event.memory_digest,
      authority_receipt_ref: event.authority_receipt_ref,
      authority_receipt_verified: false,
    });
    for (const scope of event.project_scope_refs) state.approvalClaimByProjectScope.set(scope, claimed);
  }

  return { status: event.catalog_state === 'candidate' ? 'CANDIDATE_RECORDED' : 'APPROVAL_CLAIM_RECORDED', event };
}

export function listAgentWorkforceRevisionEvents(catalog) {
  const state = STATE.get(catalog);
  return state === undefined ? null : Object.freeze([...state.events]);
}

export function projectActiveAgentWorkforceRevisions(catalog) {
  const state = STATE.get(catalog);
  if (state === undefined) return hold(H.UNKNOWN_CATALOG);
  const unverifiedApprovalClaims = [...state.approvalClaimByProjectScope.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([projectScopeRef, claim]) => deepFreeze({ project_scope_ref: projectScopeRef, ...claim }));
  return deepFreeze({
    status: 'PROJECTED',
    rows: [],
    unverified_approval_claims: unverifiedApprovalClaims,
    authority_boundary: {
      receipt_refs_are_caller_supplied: true,
      receipt_refs_are_verified: false,
      authority_granted: false,
    },
  });
}

export { AGENT_WORKFORCE_LINEAGE_HOLD_CODES };
