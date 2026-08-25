import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptLegacyProjectProfile } from '../interfaces/project_profile_adapter.mjs';
import { adaptProjectEvidence } from '../interfaces/domain_engine_adapter.mjs';
import { ContractError } from '../validators/errors.mjs';

function validLegacyEnvelope() {
  return {
    domain_engine_id: 'systems_engineering',
    project_code: 'PRJ-SYN-001',
    content_id: 'rev_hash_abc123456789012345678901234567890123456789012345678901234567890',
    extends_base_pin: 'org_synthetic_base_v0',
    source_refs: ['contracts/prj_syn_001.json'],
    operations: [{ op: 'condition', token: 'SW_SAFETY', condition: 'ENABLED' }],
    binding_revision_hash: 'bind_rev_987654321098765432109876543210987654321098765432109876543210',
    source_manifest_ref: 'docs/manifests/syn_001_manifest.json',
    authority_family: 'company_approved_procedure',
    valid_at: '2026-08-25T12:00:00.000Z',
    known_at: '2026-08-25T12:00:00.000Z',
    document_refs: ['docs/sys_spec.pdf'],
  };
}

test('Legacy Profile Adapter: adapted legacy envelope produces schema-valid project_binding and feeds adaptProjectEvidence', () => {
  const envelope = validLegacyEnvelope();
  const adapted = adaptLegacyProjectProfile(envelope);

  assert.equal(adapted.schema_version, 'soulforge.project_profile_adapter.v0');
  assert.equal(adapted.profile_bindings.length, 1);
  assert.equal(adapted.project_binding.schema_version, 'soulforge.project_binding.v0');
  assert.equal(adapted.project_binding.project_id, 'PRJ-SYN-001');
  assert.equal(adapted.project_binding.domain_engine_id, 'systems_engineering');
  assert.equal(adapted.project_binding.binding_revision_hash, envelope.binding_revision_hash);
  assert.equal(adapted.project_binding.source_manifest_ref, envelope.source_manifest_ref);

  // Feeds adaptProjectEvidence successfully
  const evidenceSnapshot = {
    source_refs: ['docs/manifests/syn_001_manifest.json'],
    observations: [{ observation_id: 'obs_1', status: 'valid' }],
  };
  const cutoffs = {
    valid_at: '2026-08-25T12:00:00.000Z',
    known_at: '2026-08-25T12:00:00.000Z',
  };

  const adaptedEvidence = adaptProjectEvidence(adapted.project_binding, evidenceSnapshot, cutoffs);
  assert.equal(adaptedEvidence.typed_project_facts.schema_version, 'soulforge.typed_project_facts.v0');
  assert.equal(adaptedEvidence.typed_project_facts.project_binding_ref.project_id, 'PRJ-SYN-001');
  assert.equal(adaptedEvidence.observation_receipt.schema_version, 'soulforge.project_observation_receipt.v0');
});

test('Legacy Profile Adapter Hostile: fails closed when domain_engine_id is missing', () => {
  const env = validLegacyEnvelope();
  delete env.domain_engine_id;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when project_id / profile_id is missing', () => {
  const env = validLegacyEnvelope();
  delete env.project_code;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when revision_hash / revision is missing', () => {
  const env = validLegacyEnvelope();
  delete env.content_id;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when extends_base_pin / extends is missing', () => {
  const env = validLegacyEnvelope();
  delete env.extends_base_pin;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when source_refs is missing or empty', () => {
  const env1 = validLegacyEnvelope();
  delete env1.source_refs;
  assert.throws(
    () => adaptLegacyProjectProfile(env1),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );

  const env2 = validLegacyEnvelope();
  env2.source_refs = [];
  assert.throws(
    () => adaptLegacyProjectProfile(env2),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when binding_revision_hash is missing (zero invented defaults)', () => {
  const env = validLegacyEnvelope();
  delete env.binding_revision_hash;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});

test('Legacy Profile Adapter Hostile: fails closed when source_manifest_ref is missing (zero invented defaults)', () => {
  const env = validLegacyEnvelope();
  delete env.source_manifest_ref;
  assert.throws(
    () => adaptLegacyProjectProfile(env),
    (err) => err instanceof ContractError && err.code === 'LEGACY_PROFILE_PROVENANCE_INCOMPLETE'
  );
});
