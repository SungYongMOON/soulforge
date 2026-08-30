/**
 * Pure verification seam between an unverified workforce approval claim and a separately supplied
 * trusted authority pin.
 *
 * The revision catalog intentionally cannot grant authority. This module likewise cannot activate a
 * runtime, mutate the catalog, or read a receipt. It only proves that an exact public-safe claim and
 * an externally trusted pin bind the same authority receipt, project, lineage, Agent Family, Mark,
 * Deployment and Memory Generation while the supplied verification instant is inside the pin's
 * validity window and its authority epoch has not been revoked.
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
import { ENTRY_CODES, MAX_LIST } from './observation_internals.mjs';
import { AGENT_WORKFORCE_REVISION_EVENT_SCHEMA } from './agent_workforce_revision_catalog.mjs';

export const AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA = 'soulforge.agent_observation.agent_authority_trusted_pin.v0';
export const AGENT_AUTHORITY_CURRENT_STATE_SCHEMA = 'soulforge.agent_observation.agent_authority_current_state.v0';
export const VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA = 'soulforge.agent_observation.verified_agent_active_binding.v0';

export const AGENT_AUTHORITY_VERIFICATION_HOLD_CODES = Object.freeze({
  RAW_OR_UNKNOWN_FIELD_FORBIDDEN: ENTRY_CODES.unknownField,
  SECRET_VALUE_FORBIDDEN: ENTRY_CODES.secret,
  LOCAL_PATH_VALUE_FORBIDDEN: ENTRY_CODES.localPath,
  INPUT_TOO_DEEP: ENTRY_CODES.tooDeep,
  INPUT_TOO_LARGE: ENTRY_CODES.tooLarge,
  HOSTILE_INPUT_REFUSED: ENTRY_CODES.hostileInput,
  ACCESSOR_PROPERTY_FORBIDDEN: ENTRY_CODES.accessor,
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  UNVERIFIED_APPROVAL_CLAIM_REQUIRED: 'UNVERIFIED_APPROVAL_CLAIM_REQUIRED',
  TRUSTED_AUTHORITY_PIN_REQUIRED: 'TRUSTED_AUTHORITY_PIN_REQUIRED',
  TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED: 'TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED',
  CLAIM_DIGEST_MISMATCH: 'CLAIM_DIGEST_MISMATCH',
  AUTHORITY_RECEIPT_MISMATCH: 'AUTHORITY_RECEIPT_MISMATCH',
  BINDING_MISMATCH: 'BINDING_MISMATCH',
  PROJECT_SCOPE_MISMATCH: 'PROJECT_SCOPE_MISMATCH',
  CLAIM_CEILING_MISMATCH: 'CLAIM_CEILING_MISMATCH',
  AUTHORITY_PIN_NOT_YET_VALID: 'AUTHORITY_PIN_NOT_YET_VALID',
  AUTHORITY_PIN_EXPIRED: 'AUTHORITY_PIN_EXPIRED',
  AUTHORITY_PIN_REVOKED: 'AUTHORITY_PIN_REVOKED',
});

const H = AGENT_AUTHORITY_VERIFICATION_HOLD_CODES;
const SHA256_REF = /^sha256:[a-f0-9]{64}$/u;
const VERIFIED_CLAIM_CEILING = 'validated_private';

const PROJECTION_FIELDS = Object.freeze([
  'project_scope_ref', 'project_scope_refs', 'lineage_digest',
  'family_ref', 'family_digest', 'mark_ref', 'mark_digest',
  'deployment_ref', 'deployment_digest', 'memory_generation_ref', 'memory_digest',
  'authority_receipt_ref', 'authority_receipt_verified',
]);

const EVENT_FIELDS = Object.freeze([
  'schema_version', 'event_ref', 'catalog_state', 'authority_receipt_ref',
  'authority_receipt_verified', 'authority_evidence_class', 'recorded_at', 'lineage_digest',
  'family_ref', 'family_version', 'family_digest', 'family_lifecycle_claim',
  'supersedes_family_ref', 'rollback_family_ref', 'mark_ref', 'mark_version', 'mark_digest',
  'supersedes_mark_ref', 'rollback_mark_ref', 'deployment_ref', 'deployment_version',
  'deployment_digest', 'supersedes_deployment_ref', 'rollback_deployment_ref',
  'memory_generation_ref', 'memory_version', 'memory_digest', 'parent_memory_generation_ref',
  'supersedes_memory_generation_ref', 'project_scope_refs', 'effect_boundary',
]);

const EVENT_EFFECT_FIELDS = Object.freeze([
  'persists_catalog', 'verifies_authority_receipt', 'approves_or_promotes',
  'starts_runtime_or_run', 'mutates_task_or_project', 'performs_external_call',
]);

const CLAIM_INPUT_FIELDS = Object.freeze([...new Set([...PROJECTION_FIELDS, ...EVENT_FIELDS])]);

const PIN_FIELDS = Object.freeze([
  'schema_version', 'pin_ref', 'verification_receipt_ref',
  'owner_ref', 'authority_ref', 'verifier_ref', 'project_scope_ref',
  'lineage_digest', 'family_ref', 'family_digest', 'mark_ref', 'mark_digest',
  'deployment_ref', 'deployment_digest', 'memory_generation_ref', 'memory_digest',
  'approval_claim_digest', 'authority_receipt_ref', 'authority_receipt_digest',
  'claim_ceiling', 'issued_at', 'verified_at', 'expires_at',
  'receipt_epoch', 'trusted_authority_epoch', 'revoked',
]);

const CURRENT_STATE_FIELDS = Object.freeze([
  'schema_version', 'evaluation_ref', 'evaluated_at', 'authority_ref',
  'current_authority_epoch', 'revoked_pin_refs', 'claim_ceiling',
]);

const REQUIRED_CLAIM_BINDINGS = Object.freeze([
  'lineage_digest', 'family_ref', 'family_digest', 'mark_ref', 'mark_digest',
  'deployment_ref', 'deployment_digest', 'memory_generation_ref', 'memory_digest',
  'authority_receipt_ref', 'authority_receipt_verified', 'project_scope_refs',
]);

const BINDING_FIELDS = Object.freeze([
  'lineage_digest', 'family_ref', 'family_digest', 'mark_ref', 'mark_digest',
  'deployment_ref', 'deployment_digest', 'memory_generation_ref', 'memory_digest',
]);

const digestRef = (value) => typeof value === 'string' && SHA256_REF.test(value);
const exactUtcMs = (value) => {
  if (!isUtcMs(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
const exactShape = (value, fields) => isPlainObject(value)
  && unknownKeyIn(value, fields) === null
  && fields.every((field) => Object.hasOwn(value, field));

function canonicalRefList(value, { allowEmpty = false } = {}) {
  if (!isDenseArray(value) || (!allowEmpty && value.length === 0) || value.length > MAX_LIST) return false;
  if (!value.every(isSafeRef) || new Set(value).size !== value.length) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (value[index - 1] > value[index]) return false;
  }
  return true;
}

function validateUnverifiedClaim(rawClaim) {
  // The claim is snapshotted before its discriminant is read. Inspecting `schema_version` on the raw
  // value would let a hostile/revoked Proxy throw before the common entry guard could fail closed.
  const guarded = guardEntry(rawClaim, CLAIM_INPUT_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const claim = guarded.value;
  const allowed = Object.hasOwn(claim, 'schema_version') ? EVENT_FIELDS : PROJECTION_FIELDS;
  if (!exactShape(claim, allowed)) return hold(H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED);
  if (!REQUIRED_CLAIM_BINDINGS.every((field) => Object.hasOwn(claim, field))) {
    return hold(H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED);
  }
  if (!canonicalRefList(claim.project_scope_refs)) return hold(H.INVALID_FIELD_VALUE, 'project_scope_refs');
  if (!BINDING_FIELDS.every((field) => (
    field.endsWith('_digest') ? digestRef(claim[field]) : isSafeRef(claim[field])
  ))) return hold(H.INVALID_FIELD_VALUE, 'claim_binding');
  if (!isSafeRef(claim.authority_receipt_ref) || claim.authority_receipt_verified !== false) {
    return hold(H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED);
  }

  if (allowed === PROJECTION_FIELDS) {
    if (!isSafeRef(claim.project_scope_ref) || !claim.project_scope_refs.includes(claim.project_scope_ref)) {
      return hold(H.PROJECT_SCOPE_MISMATCH);
    }
    return { status: 'OK', claim, source_kind: 'catalog_projection' };
  }

  if (claim.schema_version !== AGENT_WORKFORCE_REVISION_EVENT_SCHEMA
    || claim.catalog_state !== 'approval_claim'
    || claim.authority_evidence_class !== 'caller_supplied_ref_only'
    || !isSafeRef(claim.event_ref)
    || !isUtcMs(claim.recorded_at)
    || !exactShape(claim.effect_boundary, EVENT_EFFECT_FIELDS)
    || EVENT_EFFECT_FIELDS.some((field) => claim.effect_boundary[field] !== false)) {
    return hold(H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED);
  }
  return { status: 'OK', claim, source_kind: 'catalog_event' };
}

function canonicalClaim(claim, projectScopeRef) {
  return {
    project_scope_ref: projectScopeRef,
    project_scope_refs: [...claim.project_scope_refs],
    lineage_digest: claim.lineage_digest,
    family_ref: claim.family_ref,
    family_digest: claim.family_digest,
    mark_ref: claim.mark_ref,
    mark_digest: claim.mark_digest,
    deployment_ref: claim.deployment_ref,
    deployment_digest: claim.deployment_digest,
    memory_generation_ref: claim.memory_generation_ref,
    memory_digest: claim.memory_digest,
    authority_receipt_ref: claim.authority_receipt_ref,
    authority_receipt_verified: false,
  };
}

/**
 * Recompute the canonical digest of an exact unverified approval claim for one project scope.
 * The project scope is explicit because a catalog event can name multiple project scopes.
 */
export function computeUnverifiedAgentApprovalClaimDigest(rawClaim, projectScopeRef) {
  const validated = validateUnverifiedClaim(rawClaim);
  if (validated.status !== 'OK') return validated;
  if (!isSafeRef(projectScopeRef) || !validated.claim.project_scope_refs.includes(projectScopeRef)) {
    return hold(H.PROJECT_SCOPE_MISMATCH);
  }
  if (validated.source_kind === 'catalog_projection'
    && validated.claim.project_scope_ref !== projectScopeRef) return hold(H.PROJECT_SCOPE_MISMATCH);
  const normalized = deepFreeze(canonicalClaim(validated.claim, projectScopeRef));
  return deepFreeze({
    status: 'UNVERIFIED_CLAIM_DIGESTED',
    source_kind: validated.source_kind,
    claim_digest: digestOf(normalized),
    normalized_claim: normalized,
    authority_granted: false,
  });
}

function validatePin(rawPin) {
  const guarded = guardEntry(rawPin, PIN_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const pin = guarded.value;
  if (!exactShape(pin, PIN_FIELDS) || pin.schema_version !== AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA) {
    return hold(H.TRUSTED_AUTHORITY_PIN_REQUIRED);
  }
  for (const field of [
    'pin_ref', 'verification_receipt_ref', 'owner_ref', 'authority_ref', 'verifier_ref',
    'project_scope_ref', 'family_ref', 'mark_ref', 'deployment_ref', 'memory_generation_ref',
    'authority_receipt_ref',
  ]) if (!isSafeRef(pin[field])) return hold(H.INVALID_FIELD_VALUE, field);
  for (const field of [
    'lineage_digest', 'family_digest', 'mark_digest', 'deployment_digest', 'memory_digest',
    'approval_claim_digest', 'authority_receipt_digest',
  ]) if (!digestRef(pin[field])) return hold(H.INVALID_FIELD_VALUE, field);
  if (pin.claim_ceiling !== VERIFIED_CLAIM_CEILING) return hold(H.CLAIM_CEILING_MISMATCH);
  if (![pin.issued_at, pin.verified_at, pin.expires_at].every(exactUtcMs)) {
    return hold(H.INVALID_FIELD_VALUE, 'validity_window');
  }
  if (!Number.isSafeInteger(pin.receipt_epoch) || pin.receipt_epoch < 0
    || !Number.isSafeInteger(pin.trusted_authority_epoch) || pin.trusted_authority_epoch < 0
    || typeof pin.revoked !== 'boolean') return hold(H.INVALID_FIELD_VALUE, 'revocation_state');
  if (pin.verified_at < pin.issued_at) return hold(H.AUTHORITY_PIN_NOT_YET_VALID);
  if (pin.verified_at >= pin.expires_at) return hold(H.AUTHORITY_PIN_EXPIRED);
  if (pin.revoked || pin.receipt_epoch !== pin.trusted_authority_epoch) {
    return hold(H.AUTHORITY_PIN_REVOKED);
  }
  return { status: 'OK', pin };
}

function validateCurrentAuthorityState(rawState) {
  if (rawState === undefined || rawState === null) return hold(H.TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED);
  const guarded = guardEntry(rawState, CURRENT_STATE_FIELDS, ENTRY_CODES);
  if (guarded.status === 'HOLD') return guarded;
  const state = guarded.value;
  if (!exactShape(state, CURRENT_STATE_FIELDS)
    || state.schema_version !== AGENT_AUTHORITY_CURRENT_STATE_SCHEMA) {
    return hold(H.TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED);
  }
  if (!isSafeRef(state.evaluation_ref) || !isSafeRef(state.authority_ref)
    || !exactUtcMs(state.evaluated_at)
    || !Number.isSafeInteger(state.current_authority_epoch) || state.current_authority_epoch < 0
    || !canonicalRefList(state.revoked_pin_refs, { allowEmpty: true })) {
    return hold(H.INVALID_FIELD_VALUE, 'current_authority_state');
  }
  if (state.claim_ceiling !== VERIFIED_CLAIM_CEILING) return hold(H.CLAIM_CEILING_MISMATCH);
  return { status: 'OK', state };
}

/**
 * Verify one exact approval claim against one separately supplied trusted authority pin.
 *
 * The returned receipt is deterministic and deeply frozen. Exact replay therefore yields the same
 * receipt digest without needing mutable replay state. A changed pin or claim changes the digest or
 * is refused; no state is stored here.
 */
export function verifyAgentWorkforceAuthorityClaim(rawClaim, rawTrustedPin, rawCurrentAuthorityState) {
  const pinResult = validatePin(rawTrustedPin);
  if (pinResult.status !== 'OK') return pinResult;
  const { pin } = pinResult;
  const stateResult = validateCurrentAuthorityState(rawCurrentAuthorityState);
  if (stateResult.status !== 'OK') return stateResult;
  const { state } = stateResult;
  if (state.authority_ref !== pin.authority_ref) return hold(H.BINDING_MISMATCH, 'authority_ref');
  if (state.evaluated_at < pin.verified_at) return hold(H.AUTHORITY_PIN_NOT_YET_VALID);
  if (state.evaluated_at >= pin.expires_at) return hold(H.AUTHORITY_PIN_EXPIRED);
  if (state.current_authority_epoch !== pin.receipt_epoch
    || state.revoked_pin_refs.includes(pin.pin_ref)) return hold(H.AUTHORITY_PIN_REVOKED);
  const claimResult = computeUnverifiedAgentApprovalClaimDigest(rawClaim, pin.project_scope_ref);
  if (claimResult.status !== 'UNVERIFIED_CLAIM_DIGESTED') return claimResult;
  const claim = claimResult.normalized_claim;

  if (claimResult.claim_digest !== pin.approval_claim_digest) return hold(H.CLAIM_DIGEST_MISMATCH);
  if (claim.authority_receipt_ref !== pin.authority_receipt_ref) {
    return hold(H.AUTHORITY_RECEIPT_MISMATCH);
  }
  if (claim.project_scope_ref !== pin.project_scope_ref) return hold(H.PROJECT_SCOPE_MISMATCH);
  for (const field of BINDING_FIELDS) {
    if (claim[field] !== pin[field]) return hold(H.BINDING_MISMATCH, field);
  }

  const receiptBody = {
    schema_version: VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
    status: 'VERIFIED_ACTIVE_BINDING',
    verification_receipt_ref: pin.verification_receipt_ref,
    trusted_pin_ref: pin.pin_ref,
    approval_claim_digest: claimResult.claim_digest,
    authority_receipt_ref: pin.authority_receipt_ref,
    authority_receipt_digest: pin.authority_receipt_digest,
    claim_ceiling: pin.claim_ceiling,
    owner_ref: pin.owner_ref,
    authority_ref: pin.authority_ref,
    verifier_ref: pin.verifier_ref,
    authority_state_evaluation_ref: state.evaluation_ref,
    authority_evaluated_at: state.evaluated_at,
    current_authority_epoch: state.current_authority_epoch,
    project_scope_ref: pin.project_scope_ref,
    lineage_digest: pin.lineage_digest,
    family_ref: pin.family_ref,
    family_digest: pin.family_digest,
    mark_ref: pin.mark_ref,
    mark_digest: pin.mark_digest,
    deployment_ref: pin.deployment_ref,
    deployment_digest: pin.deployment_digest,
    memory_generation_ref: pin.memory_generation_ref,
    memory_digest: pin.memory_digest,
    issued_at: pin.issued_at,
    verified_at: pin.verified_at,
    expires_at: pin.expires_at,
    receipt_epoch: pin.receipt_epoch,
    trusted_authority_epoch: pin.trusted_authority_epoch,
    effect_boundary: {
      catalog_mutation: false,
      persistence_write: false,
      runtime_or_task_call: false,
      approval_or_promotion: false,
      external_or_clock_call: false,
      receipt_body_read: false,
    },
  };
  return deepFreeze({ ...receiptBody, receipt_digest: digestOf(receiptBody) });
}
