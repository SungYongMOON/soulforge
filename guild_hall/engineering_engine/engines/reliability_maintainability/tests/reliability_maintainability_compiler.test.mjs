import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RM_COMPILER_ERROR_CODES,
  compileReliabilityMaintainabilityRules,
  reliabilityMaintainabilityCompilerAdapter,
} from '../compiler/reliability_maintainability_compiler_adapter.mjs';
import { reliabilityMaintainabilityAdapter } from '../evaluator/reliability_maintainability_evaluator_adapter.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULES,
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
} from '../rules/reliability_maintainability_rules.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import { buildReliabilityMaintainabilityPublicSyntheticRequest } from '../fixtures/reliability_maintainability_public_synthetic.mjs';

const VALID_RM_RULE = Object.freeze({
  rule_id: 'RM-TEST-01',
  source_ref: 'source-rm-org-v1',
  source_locator: '§4.1',
  source_modality: 'bound maintainability evidence candidate',
  allowed_evidence_kinds: ['fmeca_record'],
  required_authority_families: ['project_contract_baseline'],
  context_ref_fields: ['maintenance_scope_ref'],
  sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
});

const VALID_RM_RULE_2 = Object.freeze({
  rule_id: 'RM-TEST-02',
  source_ref: 'source-rm-project-v1',
  source_locator: '§5.2',
  source_modality: 'bound supportability evidence candidate',
  allowed_evidence_kinds: [null, 'logistics_support_analysis'],
  required_authority_families: ['company_approved_procedure', 'project_contract_baseline'],
  context_ref_fields: ['support_scope_ref'],
  sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
});

function operationDigest(operations) {
  return normalizeProfileOperations(operations).operation_digest;
}

function makeValidBinding(overrides = {}) {
  const operations = overrides.operations ?? [{ op: 'add', rule: VALID_RM_RULE }];
  return {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'org_rm_01',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_rm_01',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: overrides.operation_digest ?? operationDigest(operations),
    source_refs: ['source-rm-org-v1'],
    order: 0,
    operations,
    ...overrides,
  };
}

test('R&M compiler: empty Profile preserves reviewed base ruleset and count', () => {
  const result = compileReliabilityMaintainabilityRules([]);
  assert.equal(result.rule_count, RELIABILITY_MAINTAINABILITY_RULES.length);
  assert.equal(result.effective_rule_set.ruleset_ref.content_id, RELIABILITY_MAINTAINABILITY_RULESET_REF.content_id);
  assert.deepEqual(result.effective_rule_set.rules, RELIABILITY_MAINTAINABILITY_RULES);
  assert.equal(Object.keys(result.profile_rule_provenance).length, 0);
});

test('R&M compiler: Core Profile assembly preserves provenance and changes derived digests', () => {
  const profile = {
    profile_kind: 'organization',
    profile_id: 'org_rm_01',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_rm_01',
    extends_or_base_pin: 'rm_base:v0',
    source_refs: ['source-rm-org-v1'],
    operations: [{ op: 'add', rule: VALID_RM_RULE }],
    order: 0,
  };
  const base = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(null, null), {});
  const [binding] = resolveProfileBindings(profile, null);
  const derived = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, [binding], {});
  assert.equal(derived.rule_count, RELIABILITY_MAINTAINABILITY_RULES.length + 1);
  assert.notEqual(derived.assembly_digest, base.assembly_digest);
  assert.notEqual(derived.effective_rule_set.ruleset_ref.content_id, RELIABILITY_MAINTAINABILITY_RULESET_REF.content_id);
  const added = derived.effective_rule_set.rules.find((rule) => rule.rule_id === 'RM-TEST-01');
  assert.deepEqual(added, VALID_RM_RULE);
  const provenance = derived.effective_rule_set.profile_rule_provenance['RM-TEST-01'];
  assert.equal(provenance.profile_kind, 'organization');
  assert.equal(provenance.profile_id, 'org_rm_01');
  assert.equal(provenance.operation_digest, binding.operation_digest);
  assert.ok(provenance.operation_item_digest);
});

test('R&M compiler: organization/project operations replay deterministically without caller mutation', () => {
  const org = {
    profile_kind: 'organization', profile_id: 'org_rm_alpha', domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_org_01', extends_or_base_pin: 'rm_base:v0', source_refs: ['source-rm-org-v1'],
    operations: [{ op: 'add', rule: VALID_RM_RULE }], order: 0,
  };
  const project = {
    profile_kind: 'project', profile_id: 'project_rm_beta', domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_project_01', extends_or_base_pin: 'org_rm_alpha', source_refs: ['source-rm-project-v1'],
    operations: [{ op: 'add', rule: VALID_RM_RULE_2 }], order: 1,
  };
  const before = JSON.stringify({ org, project });
  const first = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(org, project), {});
  const second = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(org, project), {});
  assert.equal(first.assembly_digest, second.assembly_digest);
  assert.equal(first.effective_rule_set.ruleset_ref.content_id, second.effective_rule_set.ruleset_ref.content_id);
  assert.equal(first.effective_rule_set.profile_rule_provenance['RM-TEST-02'].profile_kind, 'project');
  assert.equal(JSON.stringify({ org, project }), before);
});

test('R&M compiler hostile: malformed IDs, operations, source refs, vocabulary, and order fail closed', () => {
  const invalidId = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, rule_id: '__proto__' } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([invalidId]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD);

  const unsupported = makeValidBinding({ operations: [{ op: 'remove', rule_id: 'RM-REL-01' }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([unsupported]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED);

  const flat = makeValidBinding({ operations: [{ op: 'add', rule_id: 'RM-FLAT-01' }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([flat]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.OPERATION_MALFORMED);

  const unbound = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, source_ref: 'source-rm-other-v1' } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([unbound]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND);

  const qualityToken = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, allowed_evidence_kinds: ['manufacturing_process_flow'] } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([qualityToken]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD);

  const unsorted = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, allowed_evidence_kinds: ['fmeca_record', null] } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([unsorted]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD);

  const duplicate = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, rule_id: 'RM-REL-01' } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([duplicate]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID);
});

test('R&M compiler hostile: Core provenance, profile order, paths, proxies, and accessors fail closed', () => {
  const digestMismatch = makeValidBinding({ operation_digest: 'b'.repeat(64) });
  assert.throws(() => compileReliabilityMaintainabilityRules([digestMismatch]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);

  const projectFirst = makeValidBinding({ profile_kind: 'project', order: 0, profile_id: 'project_rm_01' });
  assert.doesNotThrow(() => compileReliabilityMaintainabilityRules([projectFirst]));
  const invalidOrder = makeValidBinding({ profile_kind: 'project', order: 1, profile_id: 'project_rm_02' });
  assert.throws(() => compileReliabilityMaintainabilityRules([invalidOrder]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);

  const wrongDomain = makeValidBinding({ domain_engine_id: 'quality_readiness' });
  assert.throws(() => compileReliabilityMaintainabilityRules([wrongDomain]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);

  const unsafeFileUri = ['file:', '', '', 'etc', 'passwd'].join('/');
  const unsafePath = makeValidBinding({ operations: [{ op: 'add', rule: { ...VALID_RM_RULE, source_locator: unsafeFileUri } }] });
  assert.throws(() => compileReliabilityMaintainabilityRules([unsafePath]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.RULE_INVALID_FIELD);

  const proxy = new Proxy(makeValidBinding(), {});
  assert.throws(() => compileReliabilityMaintainabilityRules([proxy]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);

  const accessor = makeValidBinding();
  Object.defineProperty(accessor, 'profile_id', { enumerable: true, configurable: true, get() { return 'org_rm_01'; } });
  assert.throws(() => compileReliabilityMaintainabilityRules([accessor]),
    (error) => error.code === RM_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID);
});

test('R&M Core Interface uses the base adapter but fails closed for derived evaluation', () => {
  const base = compileReliabilityMaintainabilityRules([]).effective_rule_set;
  const facts = { request: buildReliabilityMaintainabilityPublicSyntheticRequest() };
  assert.doesNotThrow(() => evaluate(reliabilityMaintainabilityAdapter, base, facts, {}));

  const tampered = { ...base, rules: [...base.rules, VALID_RM_RULE] };
  assert.throws(() => evaluate(reliabilityMaintainabilityAdapter, tampered, facts, {}),
    (error) => error.code === 'RM_PROFILE_EVALUATION_UNSUPPORTED');

  const derived = compileReliabilityMaintainabilityRules([makeValidBinding()]).effective_rule_set;
  assert.throws(() => evaluate(reliabilityMaintainabilityAdapter, derived, facts, {}),
    (error) => error.code === 'RM_PROFILE_EVALUATION_UNSUPPORTED');
});

test('R&M compiler preserves null as source-native and does not conflate it with no evidence kind', () => {
  const sourceNative = { ...VALID_RM_RULE, allowed_evidence_kinds: [null] };
  const none = { ...VALID_RM_RULE, allowed_evidence_kinds: [] };
  const profileFor = (rule) => ({
    profile_kind: 'organization', profile_id: 'org_rm_null', domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_rm_null', extends_or_base_pin: 'rm_base:v0', source_refs: ['source-rm-org-v1'],
    operations: [{ op: 'add', rule }], order: 0,
  });
  const sourceAssembly = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter,
    resolveProfileBindings(profileFor(sourceNative), null), {});
  const noneAssembly = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter,
    resolveProfileBindings(profileFor(none), null), {});
  assert.notEqual(sourceAssembly.assembly_digest, noneAssembly.assembly_digest);
  assert.notEqual(sourceAssembly.effective_rule_set.ruleset_ref.content_id, noneAssembly.effective_rule_set.ruleset_ref.content_id);
  assert.deepEqual(sourceAssembly.effective_rule_set.rules.find((rule) => rule.rule_id === 'RM-TEST-01').allowed_evidence_kinds, [null]);
  assert.deepEqual(noneAssembly.effective_rule_set.rules.find((rule) => rule.rule_id === 'RM-TEST-01').allowed_evidence_kinds, []);
});

test('direct compiler adapter is registered against the expected Domain Engine identity', () => {
  assert.equal(reliabilityMaintainabilityCompilerAdapter.domain_engine_id, 'reliability_maintainability');
  assert.equal(reliabilityMaintainabilityAdapter.domain_engine_id, 'reliability_maintainability');
  assert.equal(RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF.entity_id, 'reliability-maintainability-source-packet-v0');
});
