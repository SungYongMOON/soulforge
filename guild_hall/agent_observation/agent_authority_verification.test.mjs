import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AGENT_WORKFORCE_REVISION_EVENT_SCHEMA } from './agent_workforce_revision_catalog.mjs';
import {
  AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
  AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
  AGENT_AUTHORITY_VERIFICATION_HOLD_CODES as H,
  VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA,
  computeUnverifiedAgentApprovalClaimDigest,
  verifyAgentWorkforceAuthorityClaim,
} from './agent_authority_verification.mjs';

const sha = (character) => `sha256:${character.repeat(64)}`;

const bindings = Object.freeze({
  lineage_digest: sha('1'),
  family_ref: 'agent-family:kvds-se',
  family_digest: sha('2'),
  mark_ref: 'agent-mark:kvds-se-i',
  mark_digest: sha('3'),
  deployment_ref: 'agent-deployment:kvds-se-i',
  deployment_digest: sha('4'),
  memory_generation_ref: 'memory-generation:kvds-se-i',
  memory_digest: sha('5'),
});

function projection(over = {}) {
  return {
    project_scope_ref: 'project:kvds',
    project_scope_refs: ['project:kvds', 'project:msh'],
    ...bindings,
    authority_receipt_ref: 'approval-receipt:kvds-se-i',
    authority_receipt_verified: false,
    ...over,
  };
}

function event(over = {}) {
  return {
    schema_version: AGENT_WORKFORCE_REVISION_EVENT_SCHEMA,
    event_ref: 'agent-catalog-event:kvds-se-i/approval-claim',
    catalog_state: 'approval_claim',
    authority_receipt_ref: 'approval-receipt:kvds-se-i',
    authority_receipt_verified: false,
    authority_evidence_class: 'caller_supplied_ref_only',
    recorded_at: '2026-08-31T01:01:00.000Z',
    ...bindings,
    family_version: '1.0.0',
    family_lifecycle_claim: 'approved',
    supersedes_family_ref: null,
    rollback_family_ref: null,
    mark_version: '1.0.0',
    supersedes_mark_ref: null,
    rollback_mark_ref: null,
    deployment_version: '1.0.0',
    supersedes_deployment_ref: null,
    rollback_deployment_ref: null,
    memory_version: '1.0.0',
    parent_memory_generation_ref: null,
    supersedes_memory_generation_ref: null,
    project_scope_refs: ['project:kvds', 'project:msh'],
    effect_boundary: {
      persists_catalog: false,
      verifies_authority_receipt: false,
      approves_or_promotes: false,
      starts_runtime_or_run: false,
      mutates_task_or_project: false,
      performs_external_call: false,
    },
    ...over,
  };
}

function pin(claim = projection(), over = {}) {
  const digested = computeUnverifiedAgentApprovalClaimDigest(claim, 'project:kvds');
  assert.equal(digested.status, 'UNVERIFIED_CLAIM_DIGESTED');
  return {
    schema_version: AGENT_AUTHORITY_TRUSTED_PIN_SCHEMA,
    pin_ref: 'authority-pin:kvds-se-i',
    verification_receipt_ref: 'verification-receipt:kvds-se-i',
    owner_ref: 'owner:human-owner',
    authority_ref: 'authority:agent-deployment-approval/v1',
    verifier_ref: 'verifier:authority-gate/v1',
    project_scope_ref: 'project:kvds',
    ...bindings,
    approval_claim_digest: digested.claim_digest,
    authority_receipt_ref: 'approval-receipt:kvds-se-i',
    authority_receipt_digest: sha('6'),
    claim_ceiling: 'validated_private',
    issued_at: '2026-08-31T01:02:00.000Z',
    verified_at: '2026-08-31T01:03:00.000Z',
    expires_at: '2026-08-31T02:02:00.000Z',
    receipt_epoch: 7,
    trusted_authority_epoch: 7,
    revoked: false,
    ...over,
  };
}

function currentState(over = {}) {
  return {
    schema_version: AGENT_AUTHORITY_CURRENT_STATE_SCHEMA,
    evaluation_ref: 'authority-state-evaluation:kvds-se-i',
    evaluated_at: '2026-08-31T01:04:00.000Z',
    authority_ref: 'authority:agent-deployment-approval/v1',
    current_authority_epoch: 7,
    revoked_pin_refs: [],
    claim_ceiling: 'validated_private',
    ...over,
  };
}

test('a projection is not authority until a separate exact trusted pin verifies every binding', () => {
  const claim = projection();
  assert.equal(claim.authority_receipt_verified, false);
  const receipt = verifyAgentWorkforceAuthorityClaim(claim, pin(claim), currentState());
  assert.equal(receipt.status, 'VERIFIED_ACTIVE_BINDING');
  assert.equal(receipt.schema_version, VERIFIED_AGENT_ACTIVE_BINDING_SCHEMA);
  assert.equal(receipt.project_scope_ref, 'project:kvds');
  assert.equal(receipt.family_ref, bindings.family_ref);
  assert.equal(receipt.mark_ref, bindings.mark_ref);
  assert.equal(receipt.deployment_ref, bindings.deployment_ref);
  assert.equal(receipt.memory_generation_ref, bindings.memory_generation_ref);
  assert.equal(receipt.claim_ceiling, 'validated_private');
  assert.equal(receipt.authority_state_evaluation_ref, 'authority-state-evaluation:kvds-se-i');
  assert.equal(receipt.authority_evaluated_at, '2026-08-31T01:04:00.000Z');
  assert.equal(receipt.current_authority_epoch, 7);
  assert.equal(receipt.effect_boundary.catalog_mutation, false);
  assert.equal(receipt.effect_boundary.runtime_or_task_call, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.effect_boundary), true);
  assert.throws(() => { receipt.project_scope_ref = 'project:other'; }, TypeError);
});

test('the exact catalog event and its per-project projection produce the same canonical claim digest', () => {
  const projected = computeUnverifiedAgentApprovalClaimDigest(projection(), 'project:kvds');
  const emitted = computeUnverifiedAgentApprovalClaimDigest(event(), 'project:kvds');
  assert.equal(projected.status, 'UNVERIFIED_CLAIM_DIGESTED');
  assert.equal(emitted.status, 'UNVERIFIED_CLAIM_DIGESTED');
  assert.equal(projected.claim_digest, emitted.claim_digest);
  assert.equal(emitted.authority_granted, false);
});

test('verification is replay-safe and deterministic without mutable verifier state', () => {
  const claim = event();
  const trusted = pin(claim);
  const state = currentState();
  const first = verifyAgentWorkforceAuthorityClaim(claim, trusted, state);
  const replay = verifyAgentWorkforceAuthorityClaim(claim, trusted, state);
  assert.deepEqual(replay, first);
  assert.equal(replay.receipt_digest, first.receipt_digest);
});

test('candidate, self-asserted verification and authority-bearing event effects never become active', () => {
  for (const [claim, code] of [
    [event({ catalog_state: 'candidate', authority_receipt_ref: null }), H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED],
    [projection({ authority_receipt_verified: true }), H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED],
    [event({ effect_boundary: { ...event().effect_boundary, approves_or_promotes: true } }), H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED],
  ]) assert.equal(verifyAgentWorkforceAuthorityClaim(claim, pin(), currentState()).hold_code, code);
});

test('claim digest, receipt ref and every lineage binding must match the trusted pin exactly', () => {
  const claim = projection();
  const base = pin(claim);
  const state = currentState();
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, approval_claim_digest: sha('9') }, state).hold_code, H.CLAIM_DIGEST_MISMATCH);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, authority_receipt_ref: 'approval-receipt:other' }, state).hold_code, H.AUTHORITY_RECEIPT_MISMATCH);
  for (const [field, value] of [
    ['lineage_digest', sha('a')],
    ['family_ref', 'agent-family:other'],
    ['family_digest', sha('b')],
    ['mark_ref', 'agent-mark:other'],
    ['mark_digest', sha('c')],
    ['deployment_ref', 'agent-deployment:other'],
    ['deployment_digest', sha('d')],
    ['memory_generation_ref', 'memory-generation:other'],
    ['memory_digest', sha('e')],
  ]) assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, [field]: value }, state).hold_code, H.BINDING_MISMATCH, field);
});

test('cross-project, wrong ceiling, not-yet-valid, expired and revoked pins fail closed', () => {
  const claim = projection();
  const base = pin(claim);
  const state = currentState();
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, project_scope_ref: 'project:other' }, state).hold_code, H.PROJECT_SCOPE_MISMATCH);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, claim_ceiling: 'canon_entry' }, state).hold_code, H.CLAIM_CEILING_MISMATCH);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, verified_at: '2026-08-31T01:05:00.000Z' }, state).hold_code, H.AUTHORITY_PIN_NOT_YET_VALID);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, verified_at: base.expires_at }, state).hold_code, H.AUTHORITY_PIN_EXPIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, verified_at: '2026-13-45T99:99:99.999Z' }, state).hold_code, H.INVALID_FIELD_VALUE);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, revoked: true }, state).hold_code, H.AUTHORITY_PIN_REVOKED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...base, trusted_authority_epoch: 8 }, state).hold_code, H.AUTHORITY_PIN_REVOKED);
});

test('a historical pin needs a separate current authority state and fails after expiry or later revocation', () => {
  const claim = projection();
  const trusted = pin(claim);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted).hold_code, H.TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted, currentState({
    evaluated_at: trusted.expires_at,
  })).hold_code, H.AUTHORITY_PIN_EXPIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted, currentState({
    revoked_pin_refs: [trusted.pin_ref],
  })).hold_code, H.AUTHORITY_PIN_REVOKED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted, currentState({
    current_authority_epoch: trusted.receipt_epoch + 1,
  })).hold_code, H.AUTHORITY_PIN_REVOKED);
});

test('missing, raw, local-path, secret, accessor and hostile proxy inputs are HOLD, never throws', () => {
  const claim = projection();
  const trusted = pin(claim);
  const state = currentState();
  assert.equal(verifyAgentWorkforceAuthorityClaim({}, trusted, state).hold_code, H.UNVERIFIED_APPROVAL_CLAIM_REQUIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, {}, state).hold_code, H.TRUSTED_AUTHORITY_PIN_REQUIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted).hold_code, H.TRUSTED_CURRENT_AUTHORITY_STATE_REQUIRED);
  assert.equal(verifyAgentWorkforceAuthorityClaim({ ...claim, raw_body: 'body' }, trusted, state).hold_code, H.RAW_OR_UNKNOWN_FIELD_FORBIDDEN);
  const localPathProbe = ["C:", "private", "verifier"].join("\\");
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...trusted, verifier_ref: localPathProbe }, state).hold_code, H.LOCAL_PATH_VALUE_FORBIDDEN);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, { ...trusted, authority_ref: 'Bearer abcdefghijklmnop' }, state).hold_code, H.SECRET_VALUE_FORBIDDEN);
  const accessor = { ...trusted };
  Object.defineProperty(accessor, 'owner_ref', { enumerable: true, get: () => 'owner:forged' });
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, accessor, state).hold_code, H.ACCESSOR_PROPERTY_FORBIDDEN);
  const hostile = new Proxy({}, { ownKeys() { throw new Error('refuse'); } });
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, hostile, state).hold_code, H.HOSTILE_INPUT_REFUSED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(hostile, trusted, state).hold_code, H.HOSTILE_INPUT_REFUSED);
  assert.equal(verifyAgentWorkforceAuthorityClaim(claim, trusted, hostile).hold_code, H.HOSTILE_INPUT_REFUSED);
});

test('the verifier owns no filesystem, network, clock, persistence, runtime, task or promotion path', () => {
  const source = readFileSync(new URL('./agent_authority_verification.mjs', import.meta.url), 'utf8');
  for (const forbidden of [
    "from 'node:fs'", "from 'node:http'", "from 'node:https'", 'fetch(', 'Date.now(',
    'setTimeout(', 'writeFile', 'appendFile', 'spawn(', 'exec(', 'process.env',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  const receipt = verifyAgentWorkforceAuthorityClaim(projection(), pin(), currentState());
  assert.deepEqual(receipt.effect_boundary, {
    catalog_mutation: false,
    persistence_write: false,
    runtime_or_task_call: false,
    approval_or_promotion: false,
    external_or_clock_call: false,
    receipt_body_read: false,
  });
});
