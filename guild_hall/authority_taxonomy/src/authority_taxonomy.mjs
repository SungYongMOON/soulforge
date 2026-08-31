// OD-11 authority taxonomy — pure contract/admission receipt only.
//
// This module intentionally owns no policy store, replay ledger, clock, ERP,
// Bastion, Console, runtime, or external writer. Every time and current-state
// fact is supplied by the caller, then checked conservatively. A positive
// receipt is only a contract-admission candidate; it never grants authority or
// performs an effect.

export const AUTHORITY_TAXONOMY_SCHEMA = 'soulforge.authority_taxonomy.v0';
export const AUTHORITY_ADMISSION_REQUEST_SCHEMA = 'soulforge.authority_taxonomy.admission_request.v0';
export const AUTHORITY_ADMISSION_RECEIPT_SCHEMA = 'soulforge.authority_taxonomy.admission_receipt.v0';
export const AUTHORITY_STATE_SCHEMA = 'soulforge.authority_taxonomy.current_state.v0';
export const HUMAN_APPROVAL_SCHEMA = 'soulforge.authority_taxonomy.human_approval.v0';
export const REPLAY_RATE_GUARD_SCHEMA = 'soulforge.authority_taxonomy.replay_rate_guard.v0';
export const STOP_DENY_SCHEMA = 'soulforge.authority_taxonomy.stop_deny.v0';
export const AUTHORING_RESULT_SCHEMA = 'soulforge.authority_taxonomy.authoring_result.v0';

// Canonical execution authority meanings from
// SOULFORGE_VOICE_FIRST_BOT_AGENT_OPERATING_MODEL_V0_2.md §6.
export const ACTION_AUTHORITY = Object.freeze({
  A0: 'read_and_shadow_proposal_effect_0',
  A1: 'project_decision_or_evidence_ledger_append',
  A2: 'create_only_candidate_artifact_or_approved_official_task_create',
  A3: 'bounded_task_field_or_waiting_set_release',
  A4: 'mechanically_provable_task_auto_done',
  A5: 'approved_work_unit_dispatch_to_worker',
  A6: 'approved_recipient_template_work_type_bounded_external_action',
});

export const RISK_CLASS = Object.freeze({
  R0: 'read_shadow_effect_0',
  R1: 'owned_append_or_candidate_create',
  R2: 'bounded_internal_canary_create_or_update',
  R3: 'foreign_mutation_auto_done_or_physical_dispatch',
  R4: 'external_or_irreversible_authority_sensitive_action',
});

export const EVIDENCE_CLASS = Object.freeze({
  EV1: 'minimum_observed_evidence',
  EV2: 'owned_append_or_candidate_evidence',
  EV3: 'exact_human_approved_canary_evidence',
});

const RISK_RANK = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 });
const EVIDENCE_RANK = Object.freeze({ EV1: 1, EV2: 2, EV3: 3 });
const MAX_MUTATING_EXPIRY_MS = 4 * 60 * 60 * 1000;
const MAX_AUTHORITY_STATE_AGE_MS = 5 * 60 * 1000;
const REF = /^[a-z][a-z0-9_.:-]{1,160}$/;
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

const REQUEST_FIELDS = Object.freeze([
  'schema_version',
  'request_ref',
  'subject_ref',
  'action_id',
  'action_authority',
  'risk_class',
  'evidence_class',
  'effect_count',
  'scope',
  'authority_epoch',
  'idempotency_key',
  'expires_at',
]);
const AUTHOR_DRAFT_FIELDS = Object.freeze(REQUEST_FIELDS.filter((field) => field !== 'schema_version'));
const SCOPE_FIELDS = Object.freeze(['project_ref', 'task_ref', 'target_ref', 'owner_ref', 'canary_ref']);
const CONTEXT_FIELDS = Object.freeze([
  'now',
  'authority_state',
  'human_approval',
  'replay_rate_guard',
  'stop',
]);
const STATE_FIELDS = Object.freeze([
  'schema_version',
  'state_ref',
  'authority_ref',
  'subject_ref',
  'action_id',
  'scope',
  'authority_epoch',
  'risk_ceiling',
  'evidence_floor',
  'evaluated_at',
  'expires_at',
  'revoked',
]);
const APPROVAL_FIELDS = Object.freeze([
  'schema_version',
  'approval_ref',
  'approver_ref',
  'approver_kind',
  'subject_ref',
  'request_ref',
  'action_id',
  'scope',
  'authority_epoch',
  'evidence_class',
  'expires_at',
  'revoked',
]);
const GUARD_FIELDS = Object.freeze([
  'schema_version',
  'guard_ref',
  'rate_limit_ref',
  'request_ref',
  'idempotency_key',
  'authority_epoch',
  'scope',
  'freshness',
  'window_effect_limit',
  'consumed_effect_count',
  'window_expires_at',
  'duplicate_detected',
  'replay_detected',
  'rate_check',
  'rate_bypass_detected',
]);

const ACTION_CATALOG = Object.freeze({
  read_projection: Object.freeze({
    action_authority: 'A0', risk_class: 'R0', evidence_min: 'EV1', max_effects: 0,
    requires_owned_scope: false, requires_human_approval: false, requires_canary: false,
  }),
  shadow_proposal: Object.freeze({
    action_authority: 'A0', risk_class: 'R0', evidence_min: 'EV1', max_effects: 0,
    requires_owned_scope: false, requires_human_approval: false, requires_canary: false,
  }),
  project_decision_ledger_append: Object.freeze({
    action_authority: 'A1', risk_class: 'R1', evidence_min: 'EV2', max_effects: 1,
    requires_owned_scope: true, requires_human_approval: false, requires_canary: false,
  }),
  project_evidence_ledger_append: Object.freeze({
    action_authority: 'A1', risk_class: 'R1', evidence_min: 'EV2', max_effects: 1,
    requires_owned_scope: true, requires_human_approval: false, requires_canary: false,
  }),
  candidate_artifact_create: Object.freeze({
    action_authority: 'A2', risk_class: 'R1', evidence_min: 'EV2', max_effects: 1,
    requires_owned_scope: true, requires_human_approval: false, requires_canary: false,
  }),
  approved_official_task_create: Object.freeze({
    action_authority: 'A2', risk_class: 'R2', evidence_min: 'EV3', max_effects: 1,
    requires_owned_scope: false, requires_human_approval: true, requires_canary: true,
  }),
  bounded_task_field_update: Object.freeze({
    action_authority: 'A3', risk_class: 'R2', evidence_min: 'EV3', max_effects: 1,
    requires_owned_scope: false, requires_human_approval: true, requires_canary: true,
  }),
  task_waiting_set: Object.freeze({
    action_authority: 'A3', risk_class: 'R2', evidence_min: 'EV3', max_effects: 1,
    requires_owned_scope: false, requires_human_approval: true, requires_canary: true,
  }),
  task_waiting_release: Object.freeze({
    action_authority: 'A3', risk_class: 'R2', evidence_min: 'EV3', max_effects: 1,
    requires_owned_scope: false, requires_human_approval: true, requires_canary: true,
  }),
});

// R3 values are classified only so raw authoring attempts can be refused. They
// never appear in ACTION_CATALOG and therefore cannot produce a request through
// authorAdmissionRequest.
const R3_NON_GRANTABLE_ACTIONS = Object.freeze({
  foreign_task_field_update: Object.freeze({ action_authority: 'A3', risk_class: 'R3' }),
  task_auto_done: Object.freeze({ action_authority: 'A4', risk_class: 'R3' }),
  approved_work_unit_dispatch: Object.freeze({ action_authority: 'A5', risk_class: 'R3' }),
});

// R4 values are refusal classifiers, not grantable action descriptors. The
// authoring API cannot materialize an admission request for any of them.
export const R4_AUTHORING_DENY_ACTION_IDS = Object.freeze([
  'external_send',
  'external_share',
  'money_commitment',
  'baseline_acceptance',
  'final_acceptance',
  'release',
  'credential_write',
  'acl_write',
  'authority_write',
  'destructive_action',
  'cross_project_widening',
  'promotion',
  'redelegation',
]);

export const GRANTABLE_ACTION_IDS = Object.freeze(Object.keys(ACTION_CATALOG));
export const CONTRACT_EFFECT_BOUNDARY = Object.freeze({
  authority_granted: false,
  effects_performed: 0,
  erp_mutation: false,
  bastion_mutation: false,
  console_mutation: false,
  persistence_write: false,
  external_action: false,
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// Read data without invoking accessors. Any accessor, class instance, array,
// symbol property, cyclic value, or hostile Proxy failure is rejected by the
// caller instead of becoming an authority input.
function clonePlainData(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('non_plain_data');
  if (ancestors.has(value)) throw new Error('cycle');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('non_plain_object');
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error('symbol_property');
  ancestors.add(value);
  const clone = {};
  for (const key of Object.getOwnPropertyNames(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) {
      throw new Error('accessor_or_hidden_property');
    }
    clone[key] = clonePlainData(descriptor.value, ancestors);
  }
  ancestors.delete(value);
  return clone;
}

function snapshot(value) {
  try {
    return { ok: true, value: clonePlainData(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function exactRecord(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeRef(value) {
  return typeof value === 'string' && REF.test(value);
}

function isWildcard(value) {
  return typeof value === 'string' && value.includes('*');
}

function parseUtc(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(ISO_UTC);
  if (!match) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return null;
  const fraction = (match[7] ?? '').padEnd(3, '0');
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}Z`;
  return new Date(millis).toISOString() === normalized ? millis : null;
}

function sameScope(left, right) {
  return SCOPE_FIELDS.every((field) => left[field] === right[field]);
}

function validateScope(scope) {
  if (!exactRecord(scope, SCOPE_FIELDS)) return { ok: false, code: 'EXACT_SCOPE_REQUIRED' };
  for (const field of SCOPE_FIELDS.filter((field) => field !== 'canary_ref')) {
    if (isWildcard(scope[field])) return { ok: false, code: 'WILDCARD_SCOPE_FORBIDDEN' };
    if (!isSafeRef(scope[field])) return { ok: false, code: 'EXACT_SCOPE_REQUIRED' };
  }
  if (scope.canary_ref !== null) {
    if (isWildcard(scope.canary_ref)) return { ok: false, code: 'WILDCARD_SCOPE_FORBIDDEN' };
    if (!isSafeRef(scope.canary_ref)) return { ok: false, code: 'EXACT_SCOPE_REQUIRED' };
  }
  return { ok: true, scope };
}

function classifyAction(actionId) {
  if (hasOwn(ACTION_CATALOG, actionId)) return { kind: 'grantable', descriptor: ACTION_CATALOG[actionId] };
  if (hasOwn(R3_NON_GRANTABLE_ACTIONS, actionId)) return { kind: 'r3', descriptor: R3_NON_GRANTABLE_ACTIONS[actionId] };
  if (R4_AUTHORING_DENY_ACTION_IDS.includes(actionId)) return { kind: 'r4', descriptor: { action_authority: 'A6', risk_class: 'R4' } };
  return null;
}

function requestRefOf(request) {
  return isSafeRef(request?.request_ref) ? request.request_ref : null;
}

function makeReceipt({ status, reasonCode = null, request = null, actionClassGrantable = false, extra = {} }) {
  return deepFreeze({
    schema_version: AUTHORITY_ADMISSION_RECEIPT_SCHEMA,
    status,
    reason_code: reasonCode,
    request_ref: requestRefOf(request),
    action_class_grantable: actionClassGrantable,
    contract_admitted: status === 'ADMISSION_CANDIDATE',
    ...CONTRACT_EFFECT_BOUNDARY,
    ...extra,
  });
}

function validateRequest(request) {
  if (!exactRecord(request, REQUEST_FIELDS)) return { ok: false, code: 'REQUEST_SHAPE_INVALID' };
  if (request.schema_version !== AUTHORITY_ADMISSION_REQUEST_SCHEMA) return { ok: false, code: 'REQUEST_SCHEMA_INVALID' };
  for (const field of ['request_ref', 'subject_ref', 'action_id', 'idempotency_key']) {
    if (isWildcard(request[field])) return { ok: false, code: 'WILDCARD_FORBIDDEN' };
    if (!isSafeRef(request[field])) return { ok: false, code: 'REQUEST_REF_INVALID' };
  }
  const scopeResult = validateScope(request.scope);
  if (!scopeResult.ok) return scopeResult;
  if (!Number.isSafeInteger(request.effect_count) || request.effect_count < 0) {
    return { ok: false, code: 'EFFECT_COUNT_INVALID' };
  }
  if (!Number.isSafeInteger(request.authority_epoch) || request.authority_epoch < 0) {
    return { ok: false, code: 'AUTHORITY_EPOCH_INVALID' };
  }
  const expiresAt = parseUtc(request.expires_at);
  if (expiresAt === null) return { ok: false, code: 'REQUEST_EXPIRY_INVALID' };
  const classification = classifyAction(request.action_id);
  if (!classification) return { ok: false, code: 'UNKNOWN_ACTION' };
  if (classification.kind === 'r3') return { ok: false, code: 'R3_NON_GRANTABLE_ACTION', classification };
  if (classification.kind === 'r4') return { ok: false, code: 'R4_UNREPRESENTABLE_ACTION', classification };
  const { descriptor } = classification;
  if (request.action_authority !== descriptor.action_authority) {
    return { ok: false, code: 'ACTION_AUTHORITY_MISMATCH', classification };
  }
  if (request.risk_class !== descriptor.risk_class) return { ok: false, code: 'RISK_CLASS_MISMATCH', classification };
  if (!hasOwn(EVIDENCE_RANK, request.evidence_class)) return { ok: false, code: 'EVIDENCE_CLASS_INVALID', classification };
  if (request.effect_count !== descriptor.max_effects) return { ok: false, code: 'EFFECT_COUNT_EXCEEDED', classification };
  if (EVIDENCE_RANK[request.evidence_class] < EVIDENCE_RANK[descriptor.evidence_min]) {
    return { ok: false, code: 'EVIDENCE_DOWNGRADE', classification };
  }
  return { ok: true, request, descriptor, expires_at_ms: expiresAt, classification };
}

function validateStop(stop, request) {
  if (stop === null) return { ok: true, denied: false };
  const common = ['schema_version', 'stop_ref', 'active', 'subject_ref', 'deny_scope'];
  if (!stop || typeof stop !== 'object') return { ok: false, code: 'STOP_RECORD_INVALID' };
  if (!['all_subject', 'exact_action_scope'].includes(stop.deny_scope)) {
    return { ok: false, code: 'STOP_RECORD_INVALID' };
  }
  const expected = stop.deny_scope === 'all_subject'
    ? common
    : [...common, 'action_id', 'scope'];
  if (!exactRecord(stop, expected) || stop.schema_version !== STOP_DENY_SCHEMA
    || !isSafeRef(stop.stop_ref) || !isSafeRef(stop.subject_ref) || typeof stop.active !== 'boolean') {
    return { ok: false, code: 'STOP_RECORD_INVALID' };
  }
  if (stop.deny_scope === 'exact_action_scope') {
    const scopeResult = validateScope(stop.scope);
    if (!scopeResult.ok || !isSafeRef(stop.action_id)) return { ok: false, code: 'STOP_RECORD_INVALID' };
  }
  if (!stop.active || stop.subject_ref !== request.subject_ref) return { ok: true, denied: false };
  if (stop.deny_scope === 'all_subject') return { ok: true, denied: true, stop_ref: stop.stop_ref };
  return {
    ok: true,
    denied: stop.action_id === request.action_id && sameScope(stop.scope, request.scope),
    stop_ref: stop.stop_ref,
  };
}

function validateAuthorityState(state, requestValidation, nowMs) {
  const { request, descriptor, expires_at_ms: requestExpiry } = requestValidation;
  if (!exactRecord(state, STATE_FIELDS) || state.schema_version !== AUTHORITY_STATE_SCHEMA) {
    return { ok: false, code: 'AUTHORITY_STATE_REQUIRED' };
  }
  for (const field of ['state_ref', 'authority_ref', 'subject_ref', 'action_id']) {
    if (!isSafeRef(state[field])) return { ok: false, code: 'AUTHORITY_STATE_INVALID' };
  }
  const scopeResult = validateScope(state.scope);
  if (!scopeResult.ok) return { ok: false, code: 'AUTHORITY_STATE_INVALID' };
  if (!Number.isSafeInteger(state.authority_epoch) || state.authority_epoch < 0
    || typeof state.revoked !== 'boolean') return { ok: false, code: 'AUTHORITY_STATE_INVALID' };
  if (!hasOwn(RISK_RANK, state.risk_ceiling) || !hasOwn(EVIDENCE_RANK, state.evidence_floor)) {
    return { ok: false, code: 'AUTHORITY_STATE_INVALID' };
  }
  const evaluatedAt = parseUtc(state.evaluated_at);
  const expiresAt = parseUtc(state.expires_at);
  if (evaluatedAt === null || expiresAt === null || expiresAt <= evaluatedAt) {
    return { ok: false, code: 'AUTHORITY_STATE_INVALID' };
  }
  if (state.subject_ref !== request.subject_ref || state.action_id !== request.action_id || !sameScope(state.scope, request.scope)) {
    return { ok: false, code: 'AUTHORITY_BINDING_MISMATCH' };
  }
  if (state.authority_epoch !== request.authority_epoch) return { ok: false, code: 'AUTHORITY_EPOCH_DRIFT' };
  if (state.revoked) return { ok: false, code: 'AUTHORITY_REVOKED' };
  if (evaluatedAt > nowMs || nowMs >= expiresAt || nowMs - evaluatedAt > MAX_AUTHORITY_STATE_AGE_MS) {
    return { ok: false, code: 'AUTHORITY_STATE_STALE_OR_EXPIRED' };
  }
  if (requestExpiry > expiresAt) return { ok: false, code: 'REQUEST_OUTLIVES_AUTHORITY_STATE' };
  if (RISK_RANK[state.risk_ceiling] > RISK_RANK.R2) return { ok: false, code: 'RISK_CEILING_INVALID' };
  if (RISK_RANK[request.risk_class] > RISK_RANK[state.risk_ceiling]) {
    return { ok: false, code: 'RISK_CEILING_EXCEEDED' };
  }
  if (EVIDENCE_RANK[state.evidence_floor] < EVIDENCE_RANK[descriptor.evidence_min]
    || EVIDENCE_RANK[request.evidence_class] < EVIDENCE_RANK[state.evidence_floor]) {
    return { ok: false, code: 'EVIDENCE_DOWNGRADE' };
  }
  return { ok: true, state, expires_at_ms: expiresAt };
}

function validateHumanApproval(approval, requestValidation, stateValidation, nowMs) {
  const { request } = requestValidation;
  if (approval === null) return { ok: false, code: 'EXACT_HUMAN_APPROVAL_REQUIRED' };
  if (!exactRecord(approval, APPROVAL_FIELDS) || approval.schema_version !== HUMAN_APPROVAL_SCHEMA) {
    return { ok: false, code: 'EXACT_HUMAN_APPROVAL_REQUIRED' };
  }
  for (const field of ['approval_ref', 'approver_ref', 'subject_ref', 'request_ref', 'action_id']) {
    if (!isSafeRef(approval[field])) return { ok: false, code: 'EXACT_HUMAN_APPROVAL_REQUIRED' };
  }
  const scopeResult = validateScope(approval.scope);
  if (!scopeResult.ok) return { ok: false, code: 'EXACT_HUMAN_APPROVAL_REQUIRED' };
  if (approval.approver_ref === request.subject_ref) return { ok: false, code: 'SELF_APPROVAL_FORBIDDEN' };
  if (approval.approver_kind !== 'human' || !approval.approver_ref.startsWith('human:')
    || !Number.isSafeInteger(approval.authority_epoch) || approval.authority_epoch < 0
    || typeof approval.revoked !== 'boolean' || approval.evidence_class !== 'EV3') {
    return { ok: false, code: 'EXACT_HUMAN_APPROVAL_REQUIRED' };
  }
  if (approval.subject_ref !== request.subject_ref || approval.request_ref !== request.request_ref
    || approval.action_id !== request.action_id || !sameScope(approval.scope, request.scope)
    || approval.authority_epoch !== request.authority_epoch) {
    return { ok: false, code: 'HUMAN_APPROVAL_BINDING_MISMATCH' };
  }
  const approvalExpiry = parseUtc(approval.expires_at);
  if (approval.revoked) return { ok: false, code: 'HUMAN_APPROVAL_REVOKED' };
  if (approvalExpiry === null || nowMs >= approvalExpiry) return { ok: false, code: 'HUMAN_APPROVAL_EXPIRED' };
  if (requestValidation.expires_at_ms > approvalExpiry || requestValidation.expires_at_ms > stateValidation.expires_at_ms) {
    return { ok: false, code: 'REQUEST_OUTLIVES_HUMAN_APPROVAL' };
  }
  return { ok: true, approval };
}

function validateReplayRateGuard(guard, request) {
  if (!exactRecord(guard, GUARD_FIELDS) || guard.schema_version !== REPLAY_RATE_GUARD_SCHEMA) {
    return { ok: false, code: 'REPLAY_RATE_GUARD_REQUIRED' };
  }
  for (const field of ['guard_ref', 'rate_limit_ref', 'request_ref', 'idempotency_key']) {
    if (!isSafeRef(guard[field])) return { ok: false, code: 'REPLAY_RATE_GUARD_REQUIRED' };
  }
  const scopeResult = validateScope(guard.scope);
  if (!scopeResult.ok || !Number.isSafeInteger(guard.authority_epoch) || guard.authority_epoch < 0
    || !Number.isSafeInteger(guard.window_effect_limit) || guard.window_effect_limit < 0
    || !Number.isSafeInteger(guard.consumed_effect_count) || guard.consumed_effect_count < 0
    || typeof guard.duplicate_detected !== 'boolean' || typeof guard.replay_detected !== 'boolean'
    || typeof guard.rate_bypass_detected !== 'boolean') {
    return { ok: false, code: 'REPLAY_RATE_GUARD_REQUIRED' };
  }
  if (guard.request_ref !== request.request_ref || guard.idempotency_key !== request.idempotency_key
    || guard.authority_epoch !== request.authority_epoch || !sameScope(guard.scope, request.scope)) {
    return { ok: false, code: 'REPLAY_RATE_GUARD_BINDING_MISMATCH' };
  }
  if (guard.duplicate_detected || guard.replay_detected || guard.freshness !== 'fresh') {
    return { ok: false, code: 'DUPLICATE_OR_REPLAY_DETECTED' };
  }
  if (guard.rate_bypass_detected) return { ok: false, code: 'RATE_BYPASS_DETECTED' };
  if (guard.rate_check !== 'within_limit' || guard.window_effect_limit !== request.effect_count
    || guard.consumed_effect_count !== 0 || guard.window_expires_at !== request.expires_at
    || parseUtc(guard.window_expires_at) === null) return { ok: false, code: 'RATE_LIMIT_REQUIRED' };
  return { ok: true, guard };
}

function validateExpiry(requestValidation, nowMs) {
  const { request, descriptor, expires_at_ms: expiresAt } = requestValidation;
  if (nowMs >= expiresAt) return { ok: false, code: 'REQUEST_EXPIRED' };
  if (['R1', 'R2'].includes(request.risk_class) && expiresAt - nowMs > MAX_MUTATING_EXPIRY_MS) {
    return { ok: false, code: 'EXPIRY_EXCEEDS_FOUR_HOURS' };
  }
  if (descriptor.requires_owned_scope && request.scope.owner_ref !== request.subject_ref) {
    return { ok: false, code: 'OWNED_SCOPE_REQUIRED' };
  }
  if (descriptor.requires_canary && (!isSafeRef(request.scope.canary_ref) || !request.scope.canary_ref.startsWith('canary:'))) {
    return { ok: false, code: 'EXACT_CANARY_SCOPE_REQUIRED' };
  }
  if (!descriptor.requires_canary && request.scope.canary_ref !== null) {
    return { ok: false, code: 'UNEXPECTED_CANARY_SCOPE' };
  }
  return { ok: true };
}

function authoringResult(status, reasonCode, request = null) {
  return deepFreeze({
    schema_version: AUTHORING_RESULT_SCHEMA,
    status,
    reason_code: reasonCode,
    request,
    ...CONTRACT_EFFECT_BOUNDARY,
  });
}

// Strict authoring helper. It emits requests only for R0–R2 catalog actions;
// it is not a grant writer and has no route to any product/runtime mutation.
export function authorAdmissionRequest(rawDraft) {
  const copied = snapshot(rawDraft);
  if (!copied.ok || !exactRecord(copied.value, AUTHOR_DRAFT_FIELDS)) {
    return authoringResult('AUTHORING_REJECTED', 'REQUEST_SHAPE_INVALID');
  }
  const request = { schema_version: AUTHORITY_ADMISSION_REQUEST_SCHEMA, ...copied.value };
  const validation = validateRequest(request);
  if (!validation.ok) return authoringResult('AUTHORING_REJECTED', validation.code);
  return authoringResult('REQUEST_AUTHORED', null, deepFreeze(request));
}

// Evaluate a typed request against caller-supplied current-state, human
// approval, replay/rate guard, and optional STOP record. No state is retained;
// an integration's sole writer must separately consume the guard atomically.
export function evaluateAuthorityAdmission(rawRequest, rawContext) {
  const copied = snapshot({ request: rawRequest, context: rawContext });
  if (!copied.ok) return makeReceipt({ status: 'REFUSED', reasonCode: 'HOSTILE_OR_INVALID_INPUT' });
  const requestValidation = validateRequest(copied.value.request);
  if (!requestValidation.ok) {
    return makeReceipt({
      status: 'REFUSED',
      reasonCode: requestValidation.code,
      request: copied.value.request,
      actionClassGrantable: requestValidation.classification?.kind === 'grantable',
    });
  }
  const { request, descriptor } = requestValidation;
  const context = copied.value.context;
  if (!exactRecord(context, CONTEXT_FIELDS)) {
    return makeReceipt({ status: 'REFUSED', reasonCode: 'CONTEXT_REQUIRED', request, actionClassGrantable: true });
  }
  const nowMs = parseUtc(context.now);
  if (nowMs === null) {
    return makeReceipt({ status: 'REFUSED', reasonCode: 'CONTEXT_CLOCK_INVALID', request, actionClassGrantable: true });
  }
  const stopResult = validateStop(context.stop, request);
  if (!stopResult.ok) {
    return makeReceipt({ status: 'REFUSED', reasonCode: stopResult.code, request, actionClassGrantable: true });
  }
  if (stopResult.denied) {
    return makeReceipt({
      status: 'DENIED_STOP',
      reasonCode: 'STOP_SUBTRACTIVE_DENY',
      request,
      actionClassGrantable: true,
      extra: { stop_ref: stopResult.stop_ref },
    });
  }
  const expiryResult = validateExpiry(requestValidation, nowMs);
  if (!expiryResult.ok) {
    return makeReceipt({ status: 'REFUSED', reasonCode: expiryResult.code, request, actionClassGrantable: true });
  }
  const stateValidation = validateAuthorityState(context.authority_state, requestValidation, nowMs);
  if (!stateValidation.ok) {
    return makeReceipt({ status: 'REFUSED', reasonCode: stateValidation.code, request, actionClassGrantable: true });
  }
  let approval = null;
  if (descriptor.requires_human_approval) {
    const approvalValidation = validateHumanApproval(context.human_approval, requestValidation, stateValidation, nowMs);
    if (!approvalValidation.ok) {
      return makeReceipt({ status: 'REFUSED', reasonCode: approvalValidation.code, request, actionClassGrantable: true });
    }
    approval = approvalValidation.approval;
  }
  const guardValidation = validateReplayRateGuard(context.replay_rate_guard, request);
  if (!guardValidation.ok) {
    return makeReceipt({ status: 'REFUSED', reasonCode: guardValidation.code, request, actionClassGrantable: true });
  }
  return makeReceipt({
    status: 'ADMISSION_CANDIDATE',
    request,
    actionClassGrantable: true,
    extra: {
      action_id: request.action_id,
      action_authority: request.action_authority,
      risk_class: request.risk_class,
      evidence_class: request.evidence_class,
      exact_scope: deepFreeze({ ...request.scope }),
      authority_ref: stateValidation.state.authority_ref,
      authority_epoch: request.authority_epoch,
      human_approval_ref: approval?.approval_ref ?? null,
      replay_rate_guard_ref: guardValidation.guard.guard_ref,
      rate_limit_ref: guardValidation.guard.rate_limit_ref,
      contract_note: 'receipt_only_no_authority_grant_or_product_mutation',
    },
  });
}
