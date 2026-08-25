import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfileBinding,
  assembleEffectiveRuleSet,
  resolveProfileBindings,
  loadDomainEngineAdapter,
  registerDomainEngineAdapter,
  CODES,
} from '../interfaces/domain_engine_adapter.mjs';

const VALID_ORG_PROFILE = Object.freeze({
  profile_kind: 'organization',
  profile_id: 'org_synthetic_01',
  domain_engine_id: 'systems_engineering',
  revision_or_hash: 'rev_org_1.0.0',
  extends_or_base_pin: 'systems_engineering:generic_se_base:v0',
  source_refs: ['docs/org_synthetic_01.json'],
  operations: [{ op: 'alias', token: 'SYSTEM_SPEC', alias: 'SYS_SPEC_ORG' }],
  order: 0,
});

const VALID_PROJ_PROFILE = Object.freeze({
  profile_kind: 'project',
  profile_id: 'proj_synthetic_01',
  domain_engine_id: 'systems_engineering',
  revision_or_hash: 'rev_proj_1.0.0',
  extends_or_base_pin: 'org_synthetic_01',
  source_refs: ['docs/proj_synthetic_01.json'],
  operations: [{ op: 'condition', token: 'SW_SAFETY_CRITICAL', condition: 'IS_SAFETY_CRITICAL' }],
  order: 1,
});

const MOCK_SE_ADAPTER = Object.freeze({
  domain_engine_id: 'systems_engineering',
  revision: '1.0.0',
  compile(bindings, scope) {
    return {
      schema_version: 'soulforge.se_rules.v0',
      rule_count: 10,
      rules: [{ id: 'R1', token: 'SYSTEM_SPEC' }],
    };
  },
  evaluate(rules, facts, authority, cutoffs) {
    return { ok: true, verdict: 'PASS' };
  },
});

registerDomainEngineAdapter('systems_engineering', MOCK_SE_ADAPTER);

test('Profile Provenance: rejects missing profile_id', () => {
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, profile_id: '' }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, profile_id: undefined }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
});

test('Profile Provenance: rejects missing or unversioned revision_or_hash', () => {
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, revision_or_hash: '' }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, revision_or_hash: 'unversioned' }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, revision_or_hash: undefined }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
});

test('Profile Provenance: rejects missing extends_or_base_pin', () => {
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, extends_or_base_pin: '' }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, extends_or_base_pin: null }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
});

test('Profile Provenance: rejects empty or missing source_refs', () => {
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, source_refs: [] }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, source_refs: [''] }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, source_refs: undefined }),
    (err) => err.code === CODES.PROFILE_PROVENANCE_MISSING
  );
});

test('Profile Provenance: rejects invalid or out-of-sequence order', () => {
  assert.throws(
    () => validateProfileBinding({ ...VALID_ORG_PROFILE, order: 1 }),
    (err) => err.code === CODES.PROFILE_ORDER_INVALID
  );
  assert.throws(
    () => validateProfileBinding({ ...VALID_PROJ_PROFILE, order: 2 }, 1),
    (err) => err.code === CODES.PROFILE_ORDER_INVALID
  );
});

test('Assembly Hostile: rejects cross-domain profile mismatch', () => {
  const foreignProfile = {
    ...VALID_ORG_PROFILE,
    domain_engine_id: 'quality_readiness',
  };
  assert.throws(
    () => assembleEffectiveRuleSet(MOCK_SE_ADAPTER, [foreignProfile]),
    (err) => err.code === CODES.DOMAIN_ENGINE_MISMATCH
  );
});

test('Assembly Hostile: rejects duplicate organization profiles and out-of-order project profiles', () => {
  assert.throws(
    () => assembleEffectiveRuleSet(MOCK_SE_ADAPTER, [VALID_ORG_PROFILE, VALID_ORG_PROFILE]),
    (err) => err.code === CODES.PROFILE_ORDER_INVALID
  );
  assert.throws(
    () => assembleEffectiveRuleSet(MOCK_SE_ADAPTER, [VALID_PROJ_PROFILE, VALID_ORG_PROFILE]),
    (err) => err.code === CODES.PROFILE_ORDER_INVALID
  );
});

test('Assembly Trace: preserves separate organization and project traces without flattening', () => {
  const result = assembleEffectiveRuleSet(MOCK_SE_ADAPTER, [VALID_ORG_PROFILE, VALID_PROJ_PROFILE]);
  assert.equal(result.compilation_trace.organization_trace.profile_id, 'org_synthetic_01');
  assert.equal(result.compilation_trace.project_trace.profile_id, 'proj_synthetic_01');
  assert.equal(result.compilation_trace.profiles.length, 2);
  assert.equal(typeof result.compilation_trace.effective_ruleset_digest, 'string');
  assert.equal(result.compilation_trace.effective_ruleset_digest.length, 64);
});
