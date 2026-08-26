import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileQualityReadinessRules,
  qualityReadinessCompilerAdapter,
  QR_COMPILER_ERROR_CODES,
} from '../compiler/quality_readiness_compiler_adapter.mjs';
import { qualityReadinessAdapter } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import {
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_SOURCE_PACKET_REF,
} from '../rules/quality_readiness_rules.mjs';
import {
  assembleEffectiveRuleSet,
  resolveProfileBindings,
  evaluate,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';

const VALID_QR_RULE = Object.freeze({
  rule_id: 'QR-TEST-01',
  source_ref: 'contracts/qr_org.json',
  source_locator: '§4.1',
  source_modality: 'mandatory verification of software quality metrics',
  allowed_artifact_tokens: ['delivery_acceptance_record'],
  required_authority_families: ['project_contract_baseline'],
  context_ref_fields: ['verification_plan_ref'],
  sufficiency_fields: ['quality_metric_summary_ref'],
});

const VALID_QR_RULE_2 = Object.freeze({
  rule_id: 'QR-TEST-02',
  source_ref: 'contracts/qr_proj.json',
  source_locator: '§5.2',
  source_modality: 'manufacturing flow inspection',
  allowed_artifact_tokens: [null, 'manufacturing_process_flow'],
  required_authority_families: ['applicable_law_and_regulation', 'company_approved_procedure'],
  context_ref_fields: ['flow_record_ref'],
  sufficiency_fields: ['inspection_log_ref'],
});

// Direct entry must agree with the Core seam, so the fixture digest comes from the same Core
// helper the compiler recomputes with. A local copy here is what let a null-stripped digest
// look correct on both sides at once.
function computeOpDigest(operations) {
  return normalizeProfileOperations(operations).operation_digest;
}

function makeValidBinding(overrides = {}) {
  const op = { op: 'add', rule: VALID_QR_RULE };
  const ops = overrides.operations !== undefined ? overrides.operations : [op];
  const digest = overrides.operation_digest !== undefined ? overrides.operation_digest : computeOpDigest(ops);
  const b = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'org_qr_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_01',
    extends_or_base_pin: 'qr_base:v0',
    operation_digest: digest,
    source_refs: ['contracts/qr_org.json'],
    order: 0,
    operations: ops,
    ...overrides,
  };
  return b;
}

test('QR Compiler: empty Profile preserves base ruleset and count', () => {
  const result = compileQualityReadinessRules([]);
  assert.equal(result.rule_count, QUALITY_READINESS_RULES.length);
  assert.equal(result.effective_rule_set.ruleset_ref.content_id, QUALITY_READINESS_RULESET_REF.content_id);
  assert.equal(result.effective_rule_set.rules.length, QUALITY_READINESS_RULES.length);
  assert.equal(Object.keys(result.profile_rule_provenance).length, 0);
});

test('QR Compiler: accepted add operation changes rule_count, ruleset_ref, assembly_digest, and contains added rule', () => {
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_qr_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_01',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE }],
    order: 0,
  };

  const bindingsEmpty = resolveProfileBindings(null, null);
  const assemblyEmpty = assembleEffectiveRuleSet(qualityReadinessAdapter, bindingsEmpty, {});

  const bindingsWithAdd = resolveProfileBindings(orgProfile, null);
  const assemblyWithAdd = assembleEffectiveRuleSet(qualityReadinessAdapter, bindingsWithAdd, {});

  // 1. rule_count changes
  assert.equal(assemblyWithAdd.rule_count, QUALITY_READINESS_RULES.length + 1);
  assert.notEqual(assemblyWithAdd.rule_count, assemblyEmpty.rule_count);

  // 2. derived ruleset_ref changes
  const effectiveRuleSet = assemblyWithAdd.effective_rule_set;
  assert.notEqual(effectiveRuleSet.ruleset_ref.content_id, QUALITY_READINESS_RULESET_REF.content_id);
  assert.equal(effectiveRuleSet.ruleset_ref.entity_id, 'quality-readiness-ruleset-derived-v0');

  // 3. Core assembly_digest and effective_ruleset_digest change
  assert.notEqual(assemblyWithAdd.assembly_digest, assemblyEmpty.assembly_digest);
  assert.notEqual(
    assemblyWithAdd.compilation_trace.effective_ruleset_digest,
    assemblyEmpty.compilation_trace.effective_ruleset_digest
  );

  // 4. contains exact added rule
  const addedRule = effectiveRuleSet.rules.find((r) => r.rule_id === 'QR-TEST-01');
  assert.ok(addedRule, 'Added rule must be present in effective rules');
  assert.equal(addedRule.rule_id, 'QR-TEST-01');
  assert.equal(addedRule.source_ref, 'contracts/qr_org.json');
  assert.deepEqual(addedRule.allowed_artifact_tokens, ['delivery_acceptance_record']);

  // 5. separate deterministic provenance exists with binding operation_digest and operation_item_digest
  const prov = effectiveRuleSet.profile_rule_provenance['QR-TEST-01'];
  assert.ok(prov, 'Profile provenance must exist for added rule');
  assert.equal(prov.profile_id, 'org_qr_01');
  assert.equal(prov.profile_kind, 'organization');
  assert.equal(prov.order, 0);
  assert.equal(prov.operation_digest, bindingsWithAdd[0].operation_digest);
  assert.ok(prov.operation_item_digest);
});

test('QR Compiler: replay is byte/digest deterministic and caller inputs remain unmodified', () => {
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_qr_replay',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_replay',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE }],
    order: 0,
  };

  const inputCopy = JSON.parse(JSON.stringify(orgProfile));

  const run1 = assembleEffectiveRuleSet(qualityReadinessAdapter, [orgProfile], {});
  const run2 = assembleEffectiveRuleSet(qualityReadinessAdapter, [orgProfile], {});

  assert.equal(run1.assembly_digest, run2.assembly_digest);
  assert.equal(run1.effective_rule_set.ruleset_ref.content_id, run2.effective_rule_set.ruleset_ref.content_id);
  assert.deepEqual(orgProfile, inputCopy, 'Caller input must not be mutated');
});

test('QR Compiler: set-valued rule arrays require canonical sorted order and unsorted permutations fail closed', () => {
  // 1. Correct canonical sorted order is accepted
  const bindingSorted = makeValidBinding({
    source_refs: ['contracts/qr_proj.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE_2 }],
  });
  const resSorted = compileQualityReadinessRules([bindingSorted]);
  assert.equal(resSorted.rule_count, QUALITY_READINESS_RULES.length + 1);

  // 2. Permuted unsorted required_authority_families fails closed
  const rulePermutedAuthority = {
    ...VALID_QR_RULE_2,
    required_authority_families: ['company_approved_procedure', 'applicable_law_and_regulation'], // 'c' before 'a' -> unsorted
  };
  const bindingPermutedAuth = makeValidBinding({
    source_refs: ['contracts/qr_proj.json'],
    operations: [{ op: 'add', rule: rulePermutedAuthority }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingPermutedAuth]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD
  );

  // 3. Permuted unsorted allowed_artifact_tokens fails closed (null must precede non-null)
  const rulePermutedTokens = {
    ...VALID_QR_RULE_2,
    allowed_artifact_tokens: ['manufacturing_process_flow', null], // string before null -> unsorted
  };
  const bindingPermutedTokens = makeValidBinding({
    source_refs: ['contracts/qr_proj.json'],
    operations: [{ op: 'add', rule: rulePermutedTokens }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingPermutedTokens]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD
  );
});

test('QR Compiler: separate organization and project additions preserve ordered provenance', () => {
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_qr_alpha',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_org_01',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE }],
    order: 0,
  };

  const projProfile = {
    profile_kind: 'project',
    profile_id: 'PROJ_BETA',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_proj_01',
    extends_or_base_pin: 'org_qr_alpha',
    source_refs: ['contracts/qr_proj.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE_2 }],
    order: 1,
  };

  const bindings = resolveProfileBindings(orgProfile, projProfile);
  const assembly = assembleEffectiveRuleSet(qualityReadinessAdapter, bindings, {});

  assert.equal(assembly.rule_count, QUALITY_READINESS_RULES.length + 2);

  const prov = assembly.effective_rule_set.profile_rule_provenance;
  assert.equal(prov['QR-TEST-01'].profile_kind, 'organization');
  assert.equal(prov['QR-TEST-01'].profile_id, 'org_qr_alpha');
  assert.equal(prov['QR-TEST-01'].order, 0);

  assert.equal(prov['QR-TEST-02'].profile_kind, 'project');
  assert.equal(prov['QR-TEST-02'].profile_id, 'PROJ_BETA');
  assert.equal(prov['QR-TEST-02'].order, 1);
});

test('QR Compiler Hostile: reserved rule_id (__proto__, constructor, prototype) fails closed (F1 RED/GREEN)', () => {
  for (const reserved of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'invalid_no_prefix']) {
    const reservedRule = {
      ...VALID_QR_RULE,
      rule_id: reserved,
    };
    const binding = makeValidBinding({
      operations: [{ op: 'add', rule: reservedRule }],
    });
    assert.throws(
      () => compileQualityReadinessRules([binding]),
      (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD,
      `rule_id "${reserved}" must be rejected`
    );
  }
});

test('QR Compiler Hostile: direct entry operation_digest mismatch fails closed and matches Core contract (F2)', () => {
  // 1. Mismatched operation_digest is rejected
  const mismatchedBinding = makeValidBinding({
    operation_digest: 'b'.repeat(64), // Mismatch
  });
  assert.throws(
    () => compileQualityReadinessRules([mismatchedBinding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // 2. Core resolveProfileBindings digest matches QR compiler expected digest
  const orgProfile = {
    profile_kind: 'organization',
    profile_id: 'org_qr_f2',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_f2',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE }],
    order: 0,
  };
  const [coreBinding] = resolveProfileBindings(orgProfile, null);
  const qrCompiled = compileQualityReadinessRules([coreBinding]);
  assert.equal(coreBinding.operation_digest, qrCompiled.effective_rule_set.profile_rule_provenance['QR-TEST-01'].operation_digest);
});

test('QR Compiler Hostile: binding order and duplicate profile kinds fail closed (F3)', () => {
  const orgBinding = makeValidBinding({ profile_kind: 'organization', order: 0 });
  const projBinding = makeValidBinding({
    profile_kind: 'project',
    profile_id: 'proj_01',
    source_refs: ['contracts/qr_proj.json'],
    operations: [{ op: 'add', rule: VALID_QR_RULE_2 }],
    order: 1,
  });

  // Project before organization
  assert.throws(
    () => compileQualityReadinessRules([{ ...projBinding, order: 0 }, { ...orgBinding, order: 1 }]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Duplicate organization profiles
  assert.throws(
    () => compileQualityReadinessRules([orgBinding, { ...orgBinding, profile_id: 'org_02', order: 1 }]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Nonsequential order
  assert.throws(
    () => compileQualityReadinessRules([{ ...orgBinding, order: 1 }]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );
});

test('QR Compiler Hostile: direct entry rejects invented or missing binding provenance', () => {
  // Missing profile_id
  const missingProfileId = makeValidBinding({ profile_id: undefined });
  delete missingProfileId.profile_id;
  assert.throws(
    () => compileQualityReadinessRules([missingProfileId]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Missing domain_engine_id
  const missingDomain = makeValidBinding({ domain_engine_id: undefined });
  delete missingDomain.domain_engine_id;
  assert.throws(
    () => compileQualityReadinessRules([missingDomain]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Cross-domain mismatch
  const wrongDomain = makeValidBinding({ domain_engine_id: 'systems_engineering' });
  assert.throws(
    () => compileQualityReadinessRules([wrongDomain]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Unversioned revision
  const unversioned = makeValidBinding({ revision_or_hash: 'unversioned' });
  assert.throws(
    () => compileQualityReadinessRules([unversioned]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Malformed operation_digest
  const badDigest = makeValidBinding({ operation_digest: 'not_a_sha256' });
  assert.throws(
    () => compileQualityReadinessRules([badDigest]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Extra unexpected key on binding
  const extraKeyBinding = makeValidBinding({ invented_property: 'extra' });
  assert.throws(
    () => compileQualityReadinessRules([extraKeyBinding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );
});

test('QR Compiler Hostile: direct entry rejects proxy, accessor, and non-plain data', () => {
  // Proxy binding
  const proxyBinding = new Proxy(makeValidBinding(), {});
  assert.throws(
    () => compileQualityReadinessRules([proxyBinding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );

  // Accessor getter on binding
  const accessorBinding = makeValidBinding();
  Object.defineProperty(accessorBinding, 'profile_id', {
    get() { return 'org_qr_01'; },
    enumerable: true,
    configurable: true,
  });
  assert.throws(
    () => compileQualityReadinessRules([accessorBinding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );
});

test('QR Compiler Hostile: unsupported operation kinds fail closed', () => {
  const bindingWithAlias = makeValidBinding({
    operations: [{ op: 'alias', token: 'STAGE_01', alias: 'STAGE_SRR' }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingWithAlias]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED
  );

  const bindingWithCondition = makeValidBinding({
    operations: [{ op: 'condition', token: 'sw_only' }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingWithCondition]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED
  );

  const bindingWithRemove = makeValidBinding({
    operations: [{ op: 'remove', rule_id: 'QR-FAR-01' }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingWithRemove]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.OPERATION_UNSUPPORTED
  );
});

test('QR Compiler Hostile: flat legacy add shape fails closed (RED/GREEN probe reproduction)', () => {
  const flatAddBinding = makeValidBinding({
    operations: [{ op: 'add', rule_id: 'QR-FLAT-01', requirement: 'Flat requirement' }],
  });

  assert.throws(
    () => compileQualityReadinessRules([flatAddBinding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.OPERATION_MALFORMED
  );
});

test('QR Compiler Hostile: duplicate rule_id against base rules fails closed', () => {
  const duplicateBaseRule = {
    ...VALID_QR_RULE,
    rule_id: 'QR-FAR-01', // Already in base rules
  };
  const binding = makeValidBinding({
    operations: [{ op: 'add', rule: duplicateBaseRule }],
  });
  assert.throws(
    () => compileQualityReadinessRules([binding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID
  );
});

test('QR Compiler Hostile: duplicate rule_id across profile operations fails closed', () => {
  const binding = makeValidBinding({
    operations: [
      { op: 'add', rule: VALID_QR_RULE },
      { op: 'add', rule: { ...VALID_QR_RULE } },
    ],
  });
  assert.throws(
    () => compileQualityReadinessRules([binding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_DUPLICATE_ID
  );
});

test('QR Compiler Hostile: unbound source_ref fails closed', () => {
  const unboundRule = {
    ...VALID_QR_RULE,
    source_ref: 'contracts/unbound_file.json',
  };
  const binding = makeValidBinding({
    source_refs: ['contracts/qr_org.json'], // unbound_file.json is missing
    operations: [{ op: 'add', rule: unboundRule }],
  });
  assert.throws(
    () => compileQualityReadinessRules([binding]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_SOURCE_REF_UNBOUND
  );
});

test('QR Compiler Hostile: unsafe paths and secret-bearing values fail closed', () => {
  // Absolute Windows path
  const winPathRule = {
    ...VALID_QR_RULE,
    source_locator: ['C:', 'secret', 'spec.pdf'].join('\\'),
  };
  const bindingWin = makeValidBinding({
    operations: [{ op: 'add', rule: winPathRule }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingWin]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD
  );

  // File URI
  const fileUriRule = {
    ...VALID_QR_RULE,
    source_locator: ['file:', '', '', 'etc', 'passwd'].join('/'),
  };
  const bindingUri = makeValidBinding({
    operations: [{ op: 'add', rule: fileUriRule }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingUri]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD
  );

  // Secret token
  const secretRule = {
    ...VALID_QR_RULE,
    source_modality: 'Bearer secret_token_value_12345678',
  };
  const bindingSecret = makeValidBinding({
    operations: [{ op: 'add', rule: secretRule }],
  });
  assert.throws(
    () => compileQualityReadinessRules([bindingSecret]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.RULE_INVALID_FIELD
  );
});

test('QR Evaluator Hostile: forged base ref, extra fields, missing source_packet_ref, and tampered rules fail closed (F4/F5)', () => {
  const facts = { request: buildQualityReadinessPublicSyntheticRequest() };

  // 1. Base rules evaluate successfully
  const validBase = {
    schema_version: 'soulforge.quality_readiness.ruleset.v0',
    ruleset_ref: QUALITY_READINESS_RULESET_REF,
    source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
    rules: QUALITY_READINESS_RULES,
  };
  assert.doesNotThrow(() => {
    evaluate(qualityReadinessAdapter, validBase, facts, {});
  });

  // 2. F4: Extra field on rule row fails closed
  const extraRuleKey = QUALITY_READINESS_RULES.map((r, i) => (
    i === 0 ? { ...r, unexpected_extra_key: 'malicious' } : r
  ));
  assert.throws(
    () => evaluate(qualityReadinessAdapter, { ...validBase, rules: extraRuleKey }, facts, {}),
    (err) => err.code === 'QR_EFFECTIVE_RULESET_INVALID'
  );

  // 3. F5: Missing or null source_packet_ref fails closed
  const missingSourcePacket = { ...validBase };
  delete missingSourcePacket.source_packet_ref;
  assert.throws(
    () => evaluate(qualityReadinessAdapter, missingSourcePacket, facts, {}),
    (err) => err.code === 'QR_EFFECTIVE_RULESET_INVALID'
  );
  assert.throws(
    () => evaluate(qualityReadinessAdapter, { ...validBase, source_packet_ref: null }, facts, {}),
    (err) => err.code === 'QR_EFFECTIVE_RULESET_INVALID'
  );

  // 4. F5: Drifted source_packet_ref fails closed
  const driftedSourcePacket = {
    ...validBase,
    source_packet_ref: {
      ...QUALITY_READINESS_SOURCE_PACKET_REF,
      content_id: 'sha256:drifted_hash',
    },
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, driftedSourcePacket, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );

  // 5. Forged base ref with added rule
  const forgedAddedRule = {
    ...validBase,
    rules: [...QUALITY_READINESS_RULES, VALID_QR_RULE],
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, forgedAddedRule, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );

  // 6. Forged base ref with reordered rules
  const forgedReordered = {
    ...validBase,
    rules: [...QUALITY_READINESS_RULES].reverse(),
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, forgedReordered, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );

  // 7. Forged base ref with tampered single rule field
  const tamperedRules = QUALITY_READINESS_RULES.map((r, i) => (
    i === 0 ? { ...r, source_locator: 'tampered_locator' } : r
  ));
  const forgedTampered = {
    ...validBase,
    rules: tamperedRules,
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, forgedTampered, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );

  // 8. Forged base ref with missing rule (8 rules instead of 9)
  const forgedMissing = {
    ...validBase,
    rules: QUALITY_READINESS_RULES.slice(0, 8),
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, forgedMissing, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );

  // 9. Unexpected extra field on ruleset
  const extraFieldRuleset = {
    ...validBase,
    forged_extra_field: true,
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, extraFieldRuleset, facts, {}),
    (err) => err.code === 'QR_EFFECTIVE_RULESET_INVALID'
  );

  // 10. Accessor/getter on effective ruleset
  const accessorRuleset = { ...validBase };
  let accessorReads = 0;
  Object.defineProperty(accessorRuleset, 'ruleset_ref', {
    get() {
      accessorReads += 1;
      return QUALITY_READINESS_RULESET_REF;
    },
    enumerable: true,
    configurable: true,
  });
  assert.throws(
    () => evaluate(qualityReadinessAdapter, accessorRuleset, facts, {}),
    (err) => err.code === 'EVALUATION_FAILED'
  );
  assert.equal(accessorReads, 0);

  // 11. Derived ruleset with non-empty provenance
  const derivedRuleset = {
    schema_version: 'soulforge.quality_readiness.ruleset.v0',
    ruleset_ref: {
      entity_id: 'quality-readiness-ruleset-derived-v0',
      revision_id: 'derived:1234567890',
      content_id: 'sha256:derived_ruleset_hash',
      content_hash_alg: 'sha256',
    },
    source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
    rules: [...QUALITY_READINESS_RULES, VALID_QR_RULE],
    profile_rule_provenance: { 'QR-TEST-01': { profile_id: 'org_01' } },
  };
  assert.throws(
    () => evaluate(qualityReadinessAdapter, derivedRuleset, facts, {}),
    (err) => err.code === 'QR_PROFILE_EVALUATION_UNSUPPORTED'
  );
});

// ---------------------------------------------------------------- null-bearing Profile seam
//
// A QR rule binds `allowed_artifact_tokens: [null]` to accept source-native evidence and `[]`
// to accept no artifact at all. Core used to strip the null before the compiler ever saw it,
// so these two Profiles arrived identical and shared one operation digest.

const SOURCE_NATIVE_RULE = Object.freeze({
  rule_id: 'QR-NULLSEAM-01',
  source_ref: 'contracts/qr_org.json',
  source_locator: '§7.4',
  source_modality: 'source-native evidence is accepted for this duty',
  allowed_artifact_tokens: [null],
  required_authority_families: ['company_approved_procedure'],
  context_ref_fields: ['scope_ref'],
  sufficiency_fields: [],
});

const NO_ARTIFACT_RULE = Object.freeze({
  ...SOURCE_NATIVE_RULE,
  allowed_artifact_tokens: [],
});

function nullSeamProfile(rule) {
  return {
    profile_kind: 'organization',
    profile_id: 'org_qr_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'rev_qr_01',
    extends_or_base_pin: 'qr_base:v0',
    source_refs: ['contracts/qr_org.json'],
    operations: [{ op: 'add', rule }],
    order: 0,
  };
}

test('QR Seam: allowed_artifact_tokens [null] survives Core normalisation into the compiled rule', () => {
  const profile = nullSeamProfile(SOURCE_NATIVE_RULE);
  const inputCopy = JSON.parse(JSON.stringify(profile));

  const [binding] = resolveProfileBindings(profile, null);
  assert.deepEqual(binding.operations[0].rule.allowed_artifact_tokens, [null], 'binding must keep [null]');

  const assembly = assembleEffectiveRuleSet(qualityReadinessAdapter, [binding], {});
  const compiled = assembly.effective_rule_set.rules.find((r) => r.rule_id === 'QR-NULLSEAM-01');
  assert.ok(compiled, 'added rule must be present');
  assert.deepEqual(compiled.allowed_artifact_tokens, [null], 'compiled rule must keep [null]');

  assert.deepEqual(profile, inputCopy, 'caller profile must not be mutated');
  assert.equal(Object.isFrozen(binding.operations[0].rule.allowed_artifact_tokens), true);
  assert.equal(Object.isFrozen(compiled.allowed_artifact_tokens), true);
});

test('QR Seam: the same rule with [] stays [] and is not widened to source-native', () => {
  const [binding] = resolveProfileBindings(nullSeamProfile(NO_ARTIFACT_RULE), null);
  assert.deepEqual(binding.operations[0].rule.allowed_artifact_tokens, []);

  const assembly = assembleEffectiveRuleSet(qualityReadinessAdapter, [binding], {});
  const compiled = assembly.effective_rule_set.rules.find((r) => r.rule_id === 'QR-NULLSEAM-01');
  assert.deepEqual(compiled.allowed_artifact_tokens, []);
});

test('QR Seam: [null] and [] separate at every digest the seam publishes', () => {
  const [sourceNativeBinding] = resolveProfileBindings(nullSeamProfile(SOURCE_NATIVE_RULE), null);
  const [noArtifactBinding] = resolveProfileBindings(nullSeamProfile(NO_ARTIFACT_RULE), null);

  // 1. Core Profile operation digest
  assert.notEqual(sourceNativeBinding.operation_digest, noArtifactBinding.operation_digest);

  const sourceNative = assembleEffectiveRuleSet(qualityReadinessAdapter, [sourceNativeBinding], {});
  const noArtifact = assembleEffectiveRuleSet(qualityReadinessAdapter, [noArtifactBinding], {});

  // 2. QR derived ruleset ref
  assert.notEqual(
    sourceNative.effective_rule_set.ruleset_ref.content_id,
    noArtifact.effective_rule_set.ruleset_ref.content_id
  );
  assert.notEqual(
    sourceNative.effective_rule_set.ruleset_ref.revision_id,
    noArtifact.effective_rule_set.ruleset_ref.revision_id
  );

  // 3. Core effective ruleset digest and assembly digest
  assert.notEqual(
    sourceNative.compilation_trace.effective_ruleset_digest,
    noArtifact.compilation_trace.effective_ruleset_digest
  );
  assert.notEqual(sourceNative.assembly_digest, noArtifact.assembly_digest);

  // 4. Per-operation provenance digest
  const sourceNativeProv = sourceNative.effective_rule_set.profile_rule_provenance['QR-NULLSEAM-01'];
  const noArtifactProv = noArtifact.effective_rule_set.profile_rule_provenance['QR-NULLSEAM-01'];
  assert.notEqual(sourceNativeProv.operation_item_digest, noArtifactProv.operation_item_digest);
  assert.notEqual(sourceNativeProv.operation_digest, noArtifactProv.operation_digest);
  assert.equal(sourceNativeProv.operation_digest, sourceNativeBinding.operation_digest);
});

test('QR Seam: null-bearing Profile replays to identical digests', () => {
  const profile = nullSeamProfile(SOURCE_NATIVE_RULE);
  const first = assembleEffectiveRuleSet(qualityReadinessAdapter, resolveProfileBindings(profile, null), {});
  const second = assembleEffectiveRuleSet(qualityReadinessAdapter, resolveProfileBindings(profile, null), {});

  assert.equal(first.assembly_digest, second.assembly_digest);
  assert.equal(
    first.effective_rule_set.ruleset_ref.content_id,
    second.effective_rule_set.ruleset_ref.content_id
  );
  assert.equal(
    first.compilation_trace.effective_ruleset_digest,
    second.compilation_trace.effective_ruleset_digest
  );
});

test('QR Seam: direct compiler entry and the Core-mediated seam agree on a null-bearing Profile', () => {
  const directBinding = makeValidBinding({
    operations: [{ op: 'add', rule: SOURCE_NATIVE_RULE }],
  });
  const direct = compileQualityReadinessRules([directBinding]);

  const [coreBinding] = resolveProfileBindings(nullSeamProfile(SOURCE_NATIVE_RULE), null);
  const coreMediated = assembleEffectiveRuleSet(qualityReadinessAdapter, [coreBinding], {});

  assert.equal(directBinding.operation_digest, coreBinding.operation_digest, 'both entries compute one digest');
  assert.equal(
    direct.effective_rule_set.ruleset_ref.content_id,
    coreMediated.effective_rule_set.ruleset_ref.content_id,
    'both entries derive the same ruleset ref'
  );
  assert.equal(direct.rule_count, coreMediated.rule_count);

  const directRule = direct.effective_rule_set.rules.find((r) => r.rule_id === 'QR-NULLSEAM-01');
  const coreRule = coreMediated.effective_rule_set.rules.find((r) => r.rule_id === 'QR-NULLSEAM-01');
  assert.deepEqual(directRule.allowed_artifact_tokens, [null]);
  assert.deepEqual(coreRule.allowed_artifact_tokens, [null]);
  assert.deepEqual(directRule, coreRule);
});

test('QR Seam: a binding whose digest was taken over null-stripped operations fails closed', () => {
  const nullStrippedOps = [{ op: 'add', rule: { ...SOURCE_NATIVE_RULE, allowed_artifact_tokens: [] } }];
  const forged = makeValidBinding({
    operations: [{ op: 'add', rule: SOURCE_NATIVE_RULE }],
    operation_digest: computeOpDigest(nullStrippedOps),
  });

  assert.throws(
    () => compileQualityReadinessRules([forged]),
    (err) => err.code === QR_COMPILER_ERROR_CODES.PROFILE_BINDINGS_INVALID
  );
});
