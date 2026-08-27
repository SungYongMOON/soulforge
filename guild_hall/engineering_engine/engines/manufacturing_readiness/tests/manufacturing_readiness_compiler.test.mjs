import assert from 'node:assert/strict';
import test from 'node:test';

import { compileManufacturingReadinessRules } from '../compiler/manufacturing_readiness_compiler_adapter.mjs';
import { manufacturingReadinessAdapter } from '../evaluator/manufacturing_readiness_evaluator_adapter.mjs';
import { buildManufacturingReadinessPublicSyntheticRequest } from '../fixtures/manufacturing_readiness_public_synthetic.mjs';
import { createManufacturingReadinessModuleManifest } from '../topology/manufacturing_readiness_module_manifest.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  loadDomainEngineAdapter,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';
import { createProjectBindingAdapter } from '../../../core/interfaces/project_binding_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';

function buildCoreTypedManufacturingFacts(kind = 'ready', projectBindingRef = null) {
  const request = buildManufacturingReadinessPublicSyntheticRequest(kind);
  if (projectBindingRef) request.project_binding_ref = projectBindingRef;
  return createProjectBindingAdapter('manufacturing_readiness', request.project_binding_ref)
    .adaptEvidence({
      source_refs: ['synthetic-public-source-snapshot-r1'],
      observations: request.facets,
    }, {
      valid_at: '2026-08-26T00:00:00.000Z',
      known_at: '2026-08-26T00:00:00.000Z',
    }).typed_project_facts;
}

function buildManifestInput() {
  return {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:manufacturing-readiness-public-synthetic-v0',
  };
}

function observedProxy(value) {
  let trapCalls = 0;
  return {
    value: new Proxy(value, {
      get(target, key, receiver) {
        trapCalls += 1;
        return Reflect.get(target, key, receiver);
      },
      getPrototypeOf(target) {
        trapCalls += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        trapCalls += 1;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        trapCalls += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    }),
    trapCalls: () => trapCalls,
  };
}

function assertDeepFrozen(value, path = 'value') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

test('compiler emits the base source-bound ruleset deterministically without a Profile', () => {
  const first = compileManufacturingReadinessRules();
  const second = compileManufacturingReadinessRules();

  assert.deepEqual(second, first);
  assert.equal(first.rule_count, 8);
  assert.equal(first.effective_rule_set.schema_version, 'soulforge.manufacturing_readiness.ruleset.v0');
  assert.equal(first.effective_rule_set.rules[0].rule_id, 'MR-BOM-01');
  assert.notEqual(first, second);
  assert.notEqual(first.effective_rule_set, second.effective_rule_set);
  assert.notEqual(first.effective_rule_set.rules[0], second.effective_rule_set.rules[0]);
  assertDeepFrozen(first);
  assert.throws(() => {
    first.effective_rule_set.schema_version = 'forged';
  }, TypeError);
});

test('Core Profile assembly and typed-fact evaluation use the existing Domain Adapter seam without Core changes', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  assert.equal(adapter, manufacturingReadinessAdapter);

  const organizationProfile = {
    profile_kind: 'organization',
    profile_id: 'synthetic_manufacturing_org',
    domain_engine_id: 'manufacturing_readiness',
    revision_or_hash: 'synthetic-mr-profile-r1',
    extends_or_base_pin: 'manufacturing-base-v0',
    source_refs: ['profiles/synthetic-manufacturing.json'],
    operations: [],
    order: 0,
  };
  const effective = assembleEffectiveRuleSet(
    adapter,
    resolveProfileBindings(organizationProfile, null),
    { evaluation_scope: 'public_synthetic' },
  );

  assert.equal(effective.domain_engine_id, 'manufacturing_readiness');
  assert.equal(effective.compilation_trace.organization_trace.profile_id, 'synthetic_manufacturing_org');
  assert.equal(effective.rule_count, 8);
  const typedFacts = buildCoreTypedManufacturingFacts();
  assert.equal(
    evaluate(adapter, effective, typedFacts).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );
  const tamperedDigest = structuredClone(typedFacts);
  tamperedDigest.facts_digest = '0'.repeat(64);
  assert.throws(
    () => evaluate(adapter, effective, tamperedDigest),
    (error) => error?.code === 'MR_TYPED_PROJECT_FACTS_INVALID',
  );
});

test('an unmodified Core TypedProjectFacts envelope evaluates through the E05 adapter', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(null, null), {
    evaluation_scope: 'public_synthetic',
  });
  const typedFacts = buildCoreTypedManufacturingFacts();

  assert.deepEqual(Object.keys(typedFacts).sort(), [
    'facts',
    'facts_digest',
    'known_at',
    'project_binding_ref',
    'schema_version',
    'valid_at',
  ]);
  assert.equal(
    evaluate(adapter, effective, typedFacts).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );
});

test('an unmodified Core-produced canonical ProjectBinding evaluates through the E05 adapter', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(null, null), {
    evaluation_scope: 'public_synthetic',
  });
  const typedFacts = buildCoreTypedManufacturingFacts();
  assert.deepEqual(Object.keys(typedFacts.project_binding_ref).sort(), [
    'authority_family',
    'binding_revision_hash',
    'document_refs',
    'domain_engine_id',
    'known_at',
    'project_id',
    'schema_version',
    'source_manifest_ref',
    'valid_at',
  ]);
  assert.equal(
    evaluate(adapter, effective, typedFacts).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );
});

test('an unmodified Core ProjectBinding with public strings evaluates through the E05 adapter', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(null, null), {
    evaluation_scope: 'public_synthetic',
  });
  const binding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'Project Alpha',
    domain_engine_id: 'manufacturing_readiness',
    binding_revision_hash: 'Binding Revision Alpha',
    source_manifest_ref: 'Source Manifest Alpha',
    authority_family: 'Manufacturing Owner',
    document_refs: ['Drawing A'],
  };
  const typedFacts = buildCoreTypedManufacturingFacts('ready', binding);
  assert.deepEqual(typedFacts.project_binding_ref, binding);
  assert.equal(
    evaluate(adapter, effective, typedFacts).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );
});

test('E05 admits only the exact Core effective-rule wrapper before unwrapping', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(null, null), {
    evaluation_scope: 'public_synthetic',
  });
  const typedFacts = buildCoreTypedManufacturingFacts();
  assert.equal(
    evaluate(adapter, effective, typedFacts).assessment.overall_state,
    'build_start_evidence_ready_for_owner_review',
  );

  const cases = [
    {
      label: 'extra outer public field',
      mutate(envelope) {
        envelope.unexpected_public_field = 'must-not-enter-e05';
      },
    },
    {
      label: 'forged assembly digest',
      mutate(envelope) {
        envelope.assembly_digest = '0'.repeat(64);
      },
    },
    {
      label: 'forged compilation-trace effective ruleset digest',
      mutate(envelope) {
        envelope.compilation_trace.effective_ruleset_digest = '0'.repeat(64);
      },
    },
  ];
  for (const candidate of cases) {
    const forged = structuredClone(effective);
    candidate.mutate(forged);
    assert.throws(
      () => evaluate(adapter, forged, typedFacts),
      (error) => error?.code === 'MR_EFFECTIVE_RULESET_INVALID',
      candidate.label,
    );
  }
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(null, typedFacts),
    (error) => error?.code === 'MR_EFFECTIVE_RULESET_INVALID',
    'non-object outer wrapper',
  );
});

test('Core-to-E05 evaluation refuses impossible UTC components and reversed fractional chronology', () => {
  const adapter = loadDomainEngineAdapter('manufacturing_readiness');
  const effective = assembleEffectiveRuleSet(adapter, resolveProfileBindings(null, null), {
    evaluation_scope: 'public_synthetic',
  });
  const cases = [
    {
      label: 'impossible UTC components',
      valid_at: '2026-99-99T99:99:99Z',
      known_at: '2026-99-99T99:99:99Z',
    },
    {
      label: 'known timestamp before fractional valid timestamp',
      valid_at: '2026-08-26T00:00:00.9Z',
      known_at: '2026-08-26T00:00:00Z',
    },
  ];
  for (const candidate of cases) {
    const typedFacts = structuredClone(buildCoreTypedManufacturingFacts());
    typedFacts.valid_at = candidate.valid_at;
    typedFacts.known_at = candidate.known_at;
    assert.throws(
      () => evaluate(adapter, effective, typedFacts),
      (error) => error?.code === 'MR_TYPED_PROJECT_FACTS_INVALID',
      candidate.label,
    );
  }
  const equivalentFractionalInstants = structuredClone(buildCoreTypedManufacturingFacts());
  equivalentFractionalInstants.valid_at = '2026-08-26T00:00:00.9Z';
  equivalentFractionalInstants.known_at = '2026-08-26T00:00:00.90Z';
  assert.throws(
    () => evaluate(adapter, effective, equivalentFractionalInstants),
    (error) => error?.code === 'MR_TYPED_PROJECT_FACTS_INVALID',
  );
});

test('derived Profile rule evaluation fails closed until E05 accepts a later evaluator revision', () => {
  const profile = {
    profile_kind: 'organization',
    profile_id: 'synthetic_manufacturing_profile_delta',
    domain_engine_id: 'manufacturing_readiness',
    revision_or_hash: 'synthetic-mr-profile-delta-r1',
    extends_or_base_pin: 'manufacturing-base-v0',
    source_refs: ['profiles/synthetic-manufacturing-delta.json'],
    operations: [{
      op: 'add',
      rule: {
        rule_id: 'MR-ORG-01',
        facet_id: 'tooling',
        source_ref: 'profiles/synthetic-manufacturing-delta.json',
        source_locator: 'synthetic-section-1',
      },
    }],
    order: 0,
  };
  const effective = assembleEffectiveRuleSet(
    manufacturingReadinessAdapter,
    resolveProfileBindings(profile, null),
    {},
  );
  assert.throws(
    () => evaluate(
      manufacturingReadinessAdapter,
      effective,
      buildCoreTypedManufacturingFacts(),
    ),
    (error) => error?.code === 'MR_PROFILE_EVALUATION_UNSUPPORTED',
  );
});

test('domain-local manifest factory requires caller-pinned build and test identity', () => {
  const manifest = createManufacturingReadinessModuleManifest(buildManifestInput());
  assert.equal(manifest.module_id, 'soulforge.engineering_engine.manufacturing_readiness');
  assert.equal(manifest.execution_mode, 'deterministic_only');
  assert.throws(() => createManufacturingReadinessModuleManifest({ ...manifest, module_version: 'latest' }));
});

test('compiler, evaluator adapter, and manifest factory refuse Proxy input before handler traps', () => {
  const compilerInput = observedProxy([]);
  assert.throws(
    () => compileManufacturingReadinessRules(compilerInput.value),
    (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
  );
  assert.equal(compilerInput.trapCalls(), 0);

  const adapterInput = observedProxy(buildCoreTypedManufacturingFacts());
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(
      compileManufacturingReadinessRules().effective_rule_set,
      adapterInput.value,
    ),
    (error) => error?.code === 'MR_TYPED_PROJECT_FACTS_INVALID',
  );
  assert.equal(adapterInput.trapCalls(), 0);

  const manifestInput = observedProxy(buildManifestInput());
  assert.throws(
    () => createManufacturingReadinessModuleManifest(manifestInput.value),
    (error) => error?.code === 'MR_MODULE_MANIFEST_INVALID',
  );
  assert.equal(manifestInput.trapCalls(), 0);
});

test('evaluator adapter refuses non-empty or hostile authority and cutoff arguments it does not own', () => {
  const effective = compileManufacturingReadinessRules().effective_rule_set;
  const typedFacts = buildCoreTypedManufacturingFacts();
  let authorityTrapCalls = 0;
  const authorityProxy = new Proxy({}, {
    ownKeys(target) {
      authorityTrapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(effective, typedFacts, authorityProxy),
    (error) => error?.code === 'MR_EVALUATION_INPUT_REQUIRED',
  );
  assert.equal(authorityTrapCalls, 0);
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(effective, typedFacts, {}, { valid_at: '2026-08-26T00:00:00Z' }),
    (error) => error?.code === 'MR_EVALUATION_INPUT_REQUIRED',
  );
});

test('compiler, evaluator adapter, and manifest factory close remaining structural hostile variants', () => {
  let compilerGetterCalls = 0;
  const compilerAccessor = [];
  Object.defineProperty(compilerAccessor, '0', {
    enumerable: true,
    get() {
      compilerGetterCalls += 1;
      return {};
    },
  });
  const compilerVariants = [
    ['accessor', compilerAccessor],
    ['custom prototype', (() => {
      const value = [];
      Object.setPrototypeOf(value, Object.create(Array.prototype));
      return value;
    })()],
    ['symbol', (() => {
      const value = [];
      value[Symbol('hostile')] = true;
      return value;
    })()],
    ['hidden', (() => {
      const value = [];
      Object.defineProperty(value, 'hidden', { enumerable: false, value: true });
      return value;
    })()],
    ['sparse', new Array(1)],
    ['cycle', (() => {
      const value = [];
      value.push(value);
      return value;
    })()],
    ['revoked Proxy', (() => {
      const revocable = Proxy.revocable([], {});
      revocable.revoke();
      return revocable.proxy;
    })()],
  ];
  for (const [label, value] of compilerVariants) {
    assert.throws(
      () => compileManufacturingReadinessRules(value),
      (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
      `compiler ${label}`,
    );
  }
  assert.equal(compilerGetterCalls, 0);

  let adapterGetterCalls = 0;
  const adapterAccessor = structuredClone(buildCoreTypedManufacturingFacts());
  Object.defineProperty(adapterAccessor, 'facts', {
    enumerable: true,
    configurable: true,
    get() {
      adapterGetterCalls += 1;
      return [];
    },
  });
  const adapterVariants = [
    ['accessor', adapterAccessor],
    ['custom prototype', (() => {
      const value = structuredClone(buildCoreTypedManufacturingFacts());
      Object.setPrototypeOf(value, Object.create(Object.prototype));
      return value;
    })()],
    ['symbol', (() => {
      const value = structuredClone(buildCoreTypedManufacturingFacts());
      value[Symbol('hostile')] = true;
      return value;
    })()],
    ['hidden', (() => {
      const value = structuredClone(buildCoreTypedManufacturingFacts());
      Object.defineProperty(value, 'hidden', { enumerable: false, value: true });
      return value;
    })()],
    ['sparse', (() => {
      const value = structuredClone(buildCoreTypedManufacturingFacts());
      value.facts = new Array(8);
      return value;
    })()],
    ['cycle', (() => {
      const value = structuredClone(buildCoreTypedManufacturingFacts());
      value.facts[0].cycle = value.facts[0];
      return value;
    })()],
    ['revoked Proxy', (() => {
      const revocable = Proxy.revocable(structuredClone(buildCoreTypedManufacturingFacts()), {});
      revocable.revoke();
      return revocable.proxy;
    })()],
  ];
  const effective = compileManufacturingReadinessRules().effective_rule_set;
  for (const [label, value] of adapterVariants) {
    assert.throws(
      () => manufacturingReadinessAdapter.evaluate(effective, value),
      (error) => error?.code === 'MR_TYPED_PROJECT_FACTS_INVALID',
      `adapter ${label}`,
    );
  }
  assert.equal(adapterGetterCalls, 0);

  let manifestGetterCalls = 0;
  const manifestAccessor = buildManifestInput();
  Object.defineProperty(manifestAccessor, 'module_version', {
    enumerable: true,
    configurable: true,
    get() {
      manifestGetterCalls += 1;
      return '0.1.0';
    },
  });
  const manifestVariants = [
    ['accessor', manifestAccessor],
    ['custom prototype', (() => {
      const value = buildManifestInput();
      Object.setPrototypeOf(value, Object.create(Object.prototype));
      return value;
    })()],
    ['symbol', (() => {
      const value = buildManifestInput();
      value[Symbol('hostile')] = true;
      return value;
    })()],
    ['hidden', (() => {
      const value = buildManifestInput();
      Object.defineProperty(value, 'hidden', { enumerable: false, value: true });
      return value;
    })()],
    ['sparse', (() => {
      const value = buildManifestInput();
      value.supported_project_classifications = new Array(1);
      return value;
    })()],
    ['cycle', (() => {
      const value = buildManifestInput();
      value.dependency_versions.self = value.dependency_versions;
      return value;
    })()],
    ['revoked Proxy', (() => {
      const revocable = Proxy.revocable(buildManifestInput(), {});
      revocable.revoke();
      return revocable.proxy;
    })()],
  ];
  for (const [label, value] of manifestVariants) {
    assert.throws(
      () => createManufacturingReadinessModuleManifest(value),
      (error) => error?.code === 'MR_MODULE_MANIFEST_INVALID',
      `manifest ${label}`,
    );
  }
  assert.equal(manifestGetterCalls, 0);
});

test('compiler refuses Profile rules whose source is not pinned by that Profile', () => {
  const operations = [{
    op: 'add',
    rule: {
      rule_id: 'MR-ORG-UNBOUND-01',
      facet_id: 'materials',
      source_ref: 'profiles/not-pinned-source.json',
      source_locator: 'synthetic-section-1',
    },
  }];
  assert.throws(
    () => compileManufacturingReadinessRules([{
      schema_version: 'soulforge.engineering_profile_binding.v0',
      profile_kind: 'organization',
      profile_id: 'synthetic-unbound-source-profile',
      domain_engine_id: 'manufacturing_readiness',
      revision_or_hash: 'synthetic-unbound-r1',
      extends_or_base_pin: 'manufacturing-base-v0',
      operation_digest: normalizeProfileOperations(operations).operation_digest,
      source_refs: ['profiles/allowed-source.json'],
      order: 0,
      operations,
    }]),
    (error) => error?.code === 'MR_RULE_SOURCE_REF_UNBOUND',
  );
});

test('compiler refuses local paths and credential-shaped Profile source tokens', () => {
  const hostileTokens = [
    ['C:', 'tmp', 'secret.txt'].join('/'),
    'sk-syntheticcredential1234',
    'github_pat_syntheticcredential1234',
  ];

  for (const [index, token] of hostileTokens.entries()) {
    const sourceRefOperations = [{
      op: 'add',
      rule: {
        rule_id: `MR-ORG-UNSAFE-REF-${index}`,
        facet_id: 'materials',
        source_ref: token,
        source_locator: 'synthetic-section-1',
      },
    }];
    assert.throws(
      () => compileManufacturingReadinessRules([{
        schema_version: 'soulforge.engineering_profile_binding.v0',
        profile_kind: 'organization',
        profile_id: `synthetic-unsafe-ref-profile-${index}`,
        domain_engine_id: 'manufacturing_readiness',
        revision_or_hash: `synthetic-unsafe-ref-r${index}`,
        extends_or_base_pin: 'manufacturing-base-v0',
        operation_digest: normalizeProfileOperations(sourceRefOperations).operation_digest,
        source_refs: ['profiles/allowed-source.json'],
        order: 0,
        operations: sourceRefOperations,
      }]),
      (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
      `rule source_ref ${token}`,
    );

    const sourceLocatorOperations = [{
      op: 'add',
      rule: {
        rule_id: `MR-ORG-UNSAFE-LOCATOR-${index}`,
        facet_id: 'materials',
        source_ref: 'profiles/allowed-source.json',
        source_locator: token,
      },
    }];
    assert.throws(
      () => compileManufacturingReadinessRules([{
        schema_version: 'soulforge.engineering_profile_binding.v0',
        profile_kind: 'organization',
        profile_id: `synthetic-unsafe-locator-profile-${index}`,
        domain_engine_id: 'manufacturing_readiness',
        revision_or_hash: `synthetic-unsafe-locator-r${index}`,
        extends_or_base_pin: 'manufacturing-base-v0',
        operation_digest: normalizeProfileOperations(sourceLocatorOperations).operation_digest,
        source_refs: ['profiles/allowed-source.json'],
        order: 0,
        operations: sourceLocatorOperations,
      }]),
      (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
      `rule source_locator ${token}`,
    );

    const emptyOperations = [];
    assert.throws(
      () => compileManufacturingReadinessRules([{
        schema_version: 'soulforge.engineering_profile_binding.v0',
        profile_kind: 'organization',
        profile_id: `synthetic-unsafe-binding-profile-${index}`,
        domain_engine_id: 'manufacturing_readiness',
        revision_or_hash: `synthetic-unsafe-binding-r${index}`,
        extends_or_base_pin: 'manufacturing-base-v0',
        operation_digest: normalizeProfileOperations(emptyOperations).operation_digest,
        source_refs: [token],
        order: 0,
        operations: emptyOperations,
      }]),
      (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
      `binding source_refs ${token}`,
    );
  }
});

test('compiler verifies the Core canonical Profile operation digest before recording provenance', () => {
  const operations = [{
    op: 'add',
    rule: {
      rule_id: 'MR-ORG-DIGEST-01',
      facet_id: 'materials',
      source_ref: 'profiles/synthetic-digest-profile.json',
      source_locator: 'synthetic-section-1',
    },
  }];
  const binding = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'synthetic-digest-profile',
    domain_engine_id: 'manufacturing_readiness',
    revision_or_hash: 'synthetic-digest-r1',
    extends_or_base_pin: 'manufacturing-base-v0',
    source_refs: ['profiles/synthetic-digest-profile.json'],
    operations,
    order: 0,
  };
  assert.throws(
    () => compileManufacturingReadinessRules([{
      ...binding,
      operation_digest: 'a'.repeat(64),
    }]),
    (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
  );

  const verifiedDigest = normalizeProfileOperations(operations).operation_digest;
  const compiled = compileManufacturingReadinessRules([{
    ...binding,
    operation_digest: verifiedDigest,
  }]);
  assert.equal(
    compiled.effective_rule_set.profile_rule_provenance['MR-ORG-DIGEST-01'].operation_digest,
    verifiedDigest,
  );
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(
      compiled.effective_rule_set,
      buildCoreTypedManufacturingFacts(),
    ),
    (error) => error?.code === 'MR_PROFILE_EVALUATION_UNSUPPORTED',
  );
});

test('compiler rejects an otherwise-valid Profile binding with an undeclared public field', () => {
  assert.throws(
    () => compileManufacturingReadinessRules([{
      schema_version: 'soulforge.engineering_profile_binding.v0',
      profile_kind: 'organization',
      profile_id: 'synthetic-closed-profile',
      domain_engine_id: 'manufacturing_readiness',
      revision_or_hash: 'synthetic-closed-profile-r1',
      extends_or_base_pin: 'manufacturing-base-v0',
      operation_digest: 'synthetic-closed-operation-digest-r1',
      source_refs: ['profiles/synthetic-closed-profile.json'],
      operations: [],
      order: 0,
      unexpected_public_field: 'must-not-enter-compiler',
    }]),
    (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
  );
});

test('evaluator rejects a forged base ruleset whose source semantics drift under the same rule id', () => {
  const forged = structuredClone(compileManufacturingReadinessRules().effective_rule_set);
  forged.rules[0].source_locators = ['forged-locator'];
  assert.throws(
    () => manufacturingReadinessAdapter.evaluate(
      forged,
      buildCoreTypedManufacturingFacts(),
    ),
    (error) => error?.code === 'MR_EFFECTIVE_RULESET_INVALID',
  );
});

test('evaluator adapter rejects extra ruleset fields, nested ref fields, and malformed profile provenance', () => {
  const typedFacts = buildCoreTypedManufacturingFacts();
  const cases = [
    {
      label: 'extra visible ruleset field',
      mutate(ruleset) {
        ruleset.unexpected_public_field = 'must-not-enter-base-evaluation';
      },
    },
    {
      label: 'extra nested ruleset ref field',
      mutate(ruleset) {
        ruleset.ruleset_ref.unexpected_public_field = 'must-not-enter-base-evaluation';
      },
    },
    {
      label: 'extra nested source-packet ref field',
      mutate(ruleset) {
        ruleset.source_packet_ref.unexpected_public_field = 'must-not-enter-base-evaluation';
      },
    },
    {
      label: 'extra nested source-inventory ref field',
      mutate(ruleset) {
        ruleset.source_inventory_ref.unexpected_public_field = 'must-not-enter-base-evaluation';
      },
    },
    {
      label: 'null profile provenance',
      mutate(ruleset) {
        ruleset.profile_rule_provenance = null;
      },
    },
    {
      label: 'array profile provenance',
      mutate(ruleset) {
        ruleset.profile_rule_provenance = [];
      },
    },
    {
      label: 'malformed derived Profile provenance entry',
      mutate(ruleset) {
        ruleset.profile_rule_provenance = {
          'MR-ORG-MALFORMED-01': { profile_kind: 'organization' },
        };
      },
    },
  ];
  for (const candidate of cases) {
    const ruleset = structuredClone(compileManufacturingReadinessRules().effective_rule_set);
    candidate.mutate(ruleset);
    assert.throws(
      () => manufacturingReadinessAdapter.evaluate(ruleset, typedFacts),
      (error) => error?.code === 'MR_EFFECTIVE_RULESET_INVALID',
      candidate.label,
    );
  }
});

test('compiler gives a closed profile error when provenance needed for a derived rule is missing', () => {
  assert.throws(
    () => compileManufacturingReadinessRules([{
      schema_version: 'soulforge.engineering_profile_binding.v0',
      profile_kind: 'organization',
      profile_id: 'synthetic-missing-provenance',
      domain_engine_id: 'manufacturing_readiness',
      revision_or_hash: 'synthetic-missing-provenance-r1',
      extends_or_base_pin: 'manufacturing-base-v0',
      source_refs: ['profiles/synthetic-missing-provenance.json'],
      order: 0,
      operations: [{
        op: 'add',
        rule: {
          rule_id: 'MR-ORG-MISSING-PROVENANCE-01',
          facet_id: 'tooling',
          source_ref: 'profiles/synthetic-missing-provenance.json',
          source_locator: 'synthetic-section-1',
        },
      }],
    }]),
    (error) => error?.code === 'MR_PROFILE_BINDINGS_INVALID',
  );
});
