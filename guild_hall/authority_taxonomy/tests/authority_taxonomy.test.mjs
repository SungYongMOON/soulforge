import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACTION_AUTHORITY,
  AUTHORING_RESULT_SCHEMA,
  AUTHORITY_ADMISSION_RECEIPT_SCHEMA,
  AUTHORITY_ADMISSION_REQUEST_SCHEMA,
  AUTHORITY_STATE_SCHEMA,
  EVIDENCE_CLASS,
  HUMAN_APPROVAL_SCHEMA,
  R4_AUTHORING_DENY_ACTION_IDS,
  REPLAY_RATE_GUARD_SCHEMA,
  RISK_CLASS,
  STOP_DENY_SCHEMA,
  authorAdmissionRequest,
  evaluateAuthorityAdmission,
} from '../src/authority_taxonomy.mjs';

const NOW = '2026-08-31T00:00:00.000Z';
const REQUEST_EXPIRY = '2026-08-31T01:00:00.000Z';
const STATE_EXPIRY = '2026-08-31T02:00:00.000Z';

function scope(overrides = {}) {
  return {
    project_ref: 'project:alpha',
    task_ref: 'task:alpha-001',
    target_ref: 'target:alpha-001',
    owner_ref: 'agent:alpha-worker',
    canary_ref: null,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    schema_version: AUTHORITY_ADMISSION_REQUEST_SCHEMA,
    request_ref: 'authority-request:alpha-001',
    subject_ref: 'agent:alpha-worker',
    action_id: 'read_projection',
    action_authority: 'A0',
    risk_class: 'R0',
    evidence_class: 'EV1',
    effect_count: 0,
    scope: scope(),
    authority_epoch: 7,
    idempotency_key: 'idempotency:alpha-001',
    expires_at: REQUEST_EXPIRY,
    ...overrides,
  };
}

function state(forRequest, overrides = {}) {
  return {
    schema_version: AUTHORITY_STATE_SCHEMA,
    state_ref: 'authority-state:alpha-001',
    authority_ref: 'authority-policy:alpha-001',
    subject_ref: forRequest.subject_ref,
    action_id: forRequest.action_id,
    scope: { ...forRequest.scope },
    authority_epoch: forRequest.authority_epoch,
    risk_ceiling: 'R2',
    evidence_floor: forRequest.evidence_class,
    evaluated_at: NOW,
    expires_at: STATE_EXPIRY,
    revoked: false,
    ...overrides,
  };
}

function approval(forRequest, overrides = {}) {
  return {
    schema_version: HUMAN_APPROVAL_SCHEMA,
    approval_ref: 'human-approval:alpha-001',
    approver_ref: 'human:owner-001',
    approver_kind: 'human',
    subject_ref: forRequest.subject_ref,
    request_ref: forRequest.request_ref,
    action_id: forRequest.action_id,
    scope: { ...forRequest.scope },
    authority_epoch: forRequest.authority_epoch,
    evidence_class: 'EV3',
    expires_at: STATE_EXPIRY,
    revoked: false,
    ...overrides,
  };
}

function guard(forRequest, overrides = {}) {
  return {
    schema_version: REPLAY_RATE_GUARD_SCHEMA,
    guard_ref: 'replay-guard:alpha-001',
    rate_limit_ref: 'rate-limit:alpha-001',
    request_ref: forRequest.request_ref,
    idempotency_key: forRequest.idempotency_key,
    authority_epoch: forRequest.authority_epoch,
    scope: { ...forRequest.scope },
    freshness: 'fresh',
    window_effect_limit: forRequest.effect_count,
    consumed_effect_count: 0,
    window_expires_at: forRequest.expires_at,
    duplicate_detected: false,
    replay_detected: false,
    rate_check: 'within_limit',
    rate_bypass_detected: false,
    ...overrides,
  };
}

function context(forRequest, overrides = {}) {
  return {
    now: NOW,
    authority_state: state(forRequest),
    human_approval: null,
    replay_rate_guard: guard(forRequest),
    stop: null,
    ...overrides,
  };
}

function r1OwnedAppend(overrides = {}) {
  return request({
    action_id: 'project_decision_ledger_append',
    action_authority: 'A1',
    risk_class: 'R1',
    evidence_class: 'EV2',
    effect_count: 1,
    ...overrides,
  });
}

function r2TaskUpdate(overrides = {}) {
  return request({
    action_id: 'bounded_task_field_update',
    action_authority: 'A3',
    risk_class: 'R2',
    evidence_class: 'EV3',
    effect_count: 1,
    scope: scope({ canary_ref: 'canary:alpha-001' }),
    ...overrides,
  });
}

test('canonical A0-A6, R0-R4, and EV1-EV3 axes are exported without conflation', () => {
  assert.equal(ACTION_AUTHORITY.A0, 'read_and_shadow_proposal_effect_0');
  assert.equal(ACTION_AUTHORITY.A6, 'approved_recipient_template_work_type_bounded_external_action');
  assert.equal(RISK_CLASS.R3, 'foreign_mutation_auto_done_or_physical_dispatch');
  assert.equal(EVIDENCE_CLASS.EV3, 'exact_human_approved_canary_evidence');
});

test('A0/R0/EV1/effect-0 exact read is admitted as a contract candidate only', () => {
  const result = evaluateAuthorityAdmission(request(), context(request()));
  assert.equal(result.schema_version, AUTHORITY_ADMISSION_RECEIPT_SCHEMA);
  assert.equal(result.status, 'ADMISSION_CANDIDATE');
  assert.equal(result.contract_admitted, true);
  assert.equal(result.authority_granted, false);
  assert.equal(result.effects_performed, 0);
  assert.equal(result.erp_mutation, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.exact_scope), true);
});

test('A0 Shadow proposal is a second effect-0 R0 action', () => {
  const candidate = request({ action_id: 'shadow_proposal' });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).status, 'ADMISSION_CANDIDATE');
});

test('R1 owned Project Decision Ledger append with EV2 and one effect is admitted', () => {
  const candidate = r1OwnedAppend();
  const result = evaluateAuthorityAdmission(candidate, context(candidate));
  assert.equal(result.status, 'ADMISSION_CANDIDATE');
  assert.equal(result.risk_class, 'R1');
  assert.equal(result.action_authority, 'A1');
});

test('R1 candidate-only artifact create is admitted only as its exact A2/R1 action', () => {
  const candidate = r1OwnedAppend({
    action_id: 'candidate_artifact_create',
    action_authority: 'A2',
  });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).status, 'ADMISSION_CANDIDATE');
});

test('R2 bounded Task update needs EV3 and exact separate human approval', () => {
  const candidate = r2TaskUpdate();
  const result = evaluateAuthorityAdmission(candidate, context(candidate, {
    human_approval: approval(candidate),
  }));
  assert.equal(result.status, 'ADMISSION_CANDIDATE');
  assert.equal(result.human_approval_ref, 'human-approval:alpha-001');
  assert.equal(result.action_authority, 'A3');
});

test('R2 bounded internal update requires an exact canary scope ref', () => {
  const candidate = r2TaskUpdate({ scope: scope() });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    human_approval: approval(candidate),
  })).reason_code, 'EXACT_CANARY_SCOPE_REQUIRED');
});

test('R2 approved Official Task create is distinct from R1 candidate artifact create', () => {
  const candidate = r2TaskUpdate({
    action_id: 'approved_official_task_create',
    action_authority: 'A2',
  });
  const result = evaluateAuthorityAdmission(candidate, context(candidate, {
    human_approval: approval(candidate),
  }));
  assert.equal(result.status, 'ADMISSION_CANDIDATE');
  assert.equal(result.risk_class, 'R2');
});

test('R0 requires exactly effect count zero', () => {
  const candidate = request({ effect_count: 1 });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'EFFECT_COUNT_EXCEEDED');
});

test('R1 requires owned scope', () => {
  const candidate = r1OwnedAppend({ scope: scope({ owner_ref: 'agent:other-worker' }) });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'OWNED_SCOPE_REQUIRED');
});

test('R1 and R2 expiry cannot exceed four hours', () => {
  const candidate = r1OwnedAppend({ expires_at: '2026-08-31T04:00:01.000Z' });
  const supplied = context(candidate, {
    authority_state: state(candidate, { expires_at: '2026-08-31T05:00:00.000Z' }),
  });
  assert.equal(evaluateAuthorityAdmission(candidate, supplied).reason_code, 'EXPIRY_EXCEEDS_FOUR_HOURS');
});

test('R2 missing human approval fails closed', () => {
  const candidate = r2TaskUpdate();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'EXACT_HUMAN_APPROVAL_REQUIRED');
});

test('R2 self approval fails closed', () => {
  const candidate = r2TaskUpdate();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    human_approval: approval(candidate, { approver_ref: candidate.subject_ref }),
  })).reason_code, 'SELF_APPROVAL_FORBIDDEN');
});

test('R2 human approval must bind the exact action and scope', () => {
  const candidate = r2TaskUpdate();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    human_approval: approval(candidate, { action_id: 'task_waiting_set' }),
  })).reason_code, 'HUMAN_APPROVAL_BINDING_MISMATCH');
});

test('unknown action fails closed before any state can grant it', () => {
  const candidate = request({ action_id: 'unknown_action' });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'UNKNOWN_ACTION');
});

test('wildcard action or scope is forbidden', () => {
  const wildcardAction = request({ action_id: 'read_*' });
  const wildcardScope = request({ scope: scope({ task_ref: 'task:*' }) });
  assert.equal(evaluateAuthorityAdmission(wildcardAction, context(wildcardAction)).reason_code, 'WILDCARD_FORBIDDEN');
  assert.equal(evaluateAuthorityAdmission(wildcardScope, context(wildcardScope)).reason_code, 'WILDCARD_SCOPE_FORBIDDEN');
});

test('expired request fails closed', () => {
  const candidate = request({ expires_at: NOW });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'REQUEST_EXPIRED');
});

test('stale current authority state fails closed', () => {
  const candidate = request();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    authority_state: state(candidate, { evaluated_at: '2026-08-30T23:54:59.999Z' }),
  })).reason_code, 'AUTHORITY_STATE_STALE_OR_EXPIRED');
});

test('revoked authority state fails closed', () => {
  const candidate = request();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    authority_state: state(candidate, { revoked: true }),
  })).reason_code, 'AUTHORITY_REVOKED');
});

test('epoch drift fails closed', () => {
  const candidate = request();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    authority_state: state(candidate, { authority_epoch: 8 }),
  })).reason_code, 'AUTHORITY_EPOCH_DRIFT');
});

test('risk ceiling fails closed', () => {
  const candidate = r2TaskUpdate();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    authority_state: state(candidate, { risk_ceiling: 'R1' }),
    human_approval: approval(candidate),
  })).reason_code, 'RISK_CEILING_EXCEEDED');
});

test('an evidence-floor downgrade in current state fails closed', () => {
  const candidate = r2TaskUpdate();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    authority_state: state(candidate, { evidence_floor: 'EV1' }),
    human_approval: approval(candidate),
  })).reason_code, 'EVIDENCE_DOWNGRADE');
});

test('duplicate and replay detection fail closed', () => {
  const candidate = request();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    replay_rate_guard: guard(candidate, { duplicate_detected: true }),
  })).reason_code, 'DUPLICATE_OR_REPLAY_DETECTED');
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    replay_rate_guard: guard(candidate, { replay_detected: true }),
  })).reason_code, 'DUPLICATE_OR_REPLAY_DETECTED');
});

test('rate-limit failure and bypass both fail closed', () => {
  const candidate = request();
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    replay_rate_guard: guard(candidate, { rate_check: 'exceeded' }),
  })).reason_code, 'RATE_LIMIT_REQUIRED');
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    replay_rate_guard: guard(candidate, { rate_bypass_detected: true }),
  })).reason_code, 'RATE_BYPASS_DETECTED');
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, {
    replay_rate_guard: guard(candidate, { consumed_effect_count: 1 }),
  })).reason_code, 'RATE_LIMIT_REQUIRED');
});

test('R3 auto-Done is non-grantable even when fields otherwise look valid', () => {
  const candidate = request({
    action_id: 'task_auto_done', action_authority: 'A4', risk_class: 'R3', evidence_class: 'EV3', effect_count: 1,
  });
  const result = evaluateAuthorityAdmission(candidate, context(candidate));
  assert.equal(result.reason_code, 'R3_NON_GRANTABLE_ACTION');
  assert.equal(result.action_class_grantable, false);
});

test('R3 foreign mutation and Work Unit dispatch are non-grantable', () => {
  for (const [actionId, actionAuthority] of [
    ['foreign_task_field_update', 'A3'],
    ['approved_work_unit_dispatch', 'A5'],
  ]) {
    const candidate = request({
      action_id: actionId, action_authority: actionAuthority, risk_class: 'R3', evidence_class: 'EV3', effect_count: 1,
    });
    assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'R3_NON_GRANTABLE_ACTION', actionId);
  }
});

test('R4 external actions cannot be authored into a request', () => {
  const draft = { ...request(), action_id: 'external_send', action_authority: 'A6', risk_class: 'R4', evidence_class: 'EV3', effect_count: 1 };
  delete draft.schema_version;
  const result = authorAdmissionRequest(draft);
  assert.equal(result.schema_version, AUTHORING_RESULT_SCHEMA);
  assert.equal(result.status, 'AUTHORING_REJECTED');
  assert.equal(result.reason_code, 'R4_UNREPRESENTABLE_ACTION');
  assert.equal(result.request, null);
});

test('every R4 external or irreversible action classifier refuses raw authoring attempts', () => {
  for (const actionId of R4_AUTHORING_DENY_ACTION_IDS) {
    const candidate = request({ action_id: actionId, action_authority: 'A6', risk_class: 'R4', evidence_class: 'EV3', effect_count: 1 });
    assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'R4_UNREPRESENTABLE_ACTION', actionId);
  }
  assert.equal(R4_AUTHORING_DENY_ACTION_IDS.includes('external_send'), true);
});

test('active all-subject STOP independently denies an otherwise valid request', () => {
  const candidate = request();
  const stop = {
    schema_version: STOP_DENY_SCHEMA,
    stop_ref: 'stop:alpha-001',
    active: true,
    subject_ref: candidate.subject_ref,
    deny_scope: 'all_subject',
  };
  const result = evaluateAuthorityAdmission(candidate, context(candidate, { stop }));
  assert.equal(result.status, 'DENIED_STOP');
  assert.equal(result.reason_code, 'STOP_SUBTRACTIVE_DENY');
  assert.equal(result.authority_granted, false);
});

test('exact STOP can deny one action/scope without creating an allow path', () => {
  const candidate = request();
  const stop = {
    schema_version: STOP_DENY_SCHEMA,
    stop_ref: 'stop:alpha-exact',
    active: true,
    subject_ref: candidate.subject_ref,
    deny_scope: 'exact_action_scope',
    action_id: candidate.action_id,
    scope: { ...candidate.scope },
  };
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, { stop })).status, 'DENIED_STOP');
  const nonmatching = { ...stop, action_id: 'shadow_proposal' };
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate, { stop: nonmatching })).status, 'ADMISSION_CANDIDATE');
});

test('judgment maturity, model, and effort are not request authority inputs', () => {
  const draft = { ...request() };
  delete draft.schema_version;
  draft.judgment_maturity = 'JM6';
  assert.equal(authorAdmissionRequest(draft).reason_code, 'REQUEST_SHAPE_INVALID');
  const candidate = request({ requested_model: 'model:high-capability' });
  assert.equal(evaluateAuthorityAdmission(candidate, context(candidate)).reason_code, 'REQUEST_SHAPE_INVALID');
});

test('hostile accessor input is refused without invoking it', () => {
  const candidate = request();
  Object.defineProperty(candidate, 'action_id', {
    enumerable: true,
    get() { throw new Error('must_not_run'); },
  });
  assert.equal(evaluateAuthorityAdmission(candidate, context(request())).reason_code, 'HOSTILE_OR_INVALID_INPUT');
});

test('identical pure inputs yield a deterministic deeply frozen receipt', () => {
  const candidate = request();
  const first = evaluateAuthorityAdmission(candidate, context(candidate));
  const replay = evaluateAuthorityAdmission(candidate, context(candidate));
  assert.deepEqual(replay, first);
  assert.equal(Object.isFrozen(replay), true);
  assert.equal(Object.isFrozen(replay.exact_scope), true);
});

test('the module has no filesystem, network, clock, process, or writer import/call surface', () => {
  const source = readFileSync(new URL('../src/authority_taxonomy.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "from 'node:fs'", "from 'node:http'", "from 'node:https'", 'fetch(', 'Date.now(',
    'writeFile', 'appendFile', 'spawn(', 'exec(', 'process.env', 'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
