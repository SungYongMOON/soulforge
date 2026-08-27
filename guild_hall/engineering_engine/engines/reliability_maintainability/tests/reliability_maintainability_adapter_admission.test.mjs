import assert from 'node:assert/strict';
import test from 'node:test';

import { adaptProjectEvidence, assembleEffectiveRuleSet, resolveProfileBindings } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { normalizeProfileOperations } from '../../../core/interfaces/profile_operation_canon.mjs';
import { assessReliabilityMaintainability, verifyReliabilityMaintainabilityResult } from '../evaluator/reliability_maintainability.mjs';
import { reliabilityMaintainabilityAdapter } from '../evaluator/reliability_maintainability_evaluator_adapter.mjs';
import { buildReliabilityMaintainabilityPublicSyntheticRequest } from '../fixtures/reliability_maintainability_public_synthetic.mjs';
import { compileReliabilityMaintainabilityRules } from '../compiler/reliability_maintainability_compiler_adapter.mjs';
import { createReliabilityMaintainabilityModuleManifest } from '../topology/reliability_maintainability_module_manifest.mjs';

const VALID_AT = '2026-08-26T00:00:00.000Z';
const KNOWN_AT = '2026-08-26T00:00:01.000Z';

function baseRuleset() {
  return structuredClone(compileReliabilityMaintainabilityRules([]).effective_rule_set);
}

function buildCoreTypedFacts(mutateRequest = () => {}) {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  request.cutoffs.valid_at = VALID_AT;
  request.cutoffs.known_at = KNOWN_AT;
  const coreProjectBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: request.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: request.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };
  mutateRequest(request, coreProjectBinding);
  return adaptProjectEvidence(
    coreProjectBinding,
    {
      source_refs: ['synthetic-core-rm-source-v1'],
      observations: [request],
    },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;
}

function expectClosed(code, operation) {
  assert.throws(operation, (error) => error?.code === code, `expected ${code}`);
}

function runtimeUnsafeWorkspacePath() {
  return ['/', 'workspace', '/', 'private', '/', 'rm-source'].join('');
}

function validProfileBinding() {
  const rule = {
    rule_id: 'RM-PROFILE-01',
    source_ref: 'synthetic-profile-source-v1',
    source_locator: '§4.1',
    source_modality: 'synthetic profile evidence candidate',
    allowed_evidence_kinds: ['fmeca_record'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['scope_ref'],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  };
  const operations = [{ op: 'add', rule }];
  return {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'synthetic_rm_profile',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_profile_01',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations(operations).operation_digest,
    source_refs: ['synthetic-profile-source-v1'],
    order: 0,
    operations,
  };
}

test('RED B1: actual Core adaptProjectEvidence typed facts are accepted by the E06 adapter', () => {
  assert.doesNotThrow(() => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), buildCoreTypedFacts()));
});

test('RED B1: raw request wrapper is refused instead of acting as TypedProjectFacts', () => {
  expectClosed('RM_TYPED_FACTS_RAW_WRAPPER_REFUSED', () => reliabilityMaintainabilityAdapter.evaluate(
    baseRuleset(),
    { request: buildReliabilityMaintainabilityPublicSyntheticRequest() },
  ));
});

test('RED B1: facts digest, project identity, binding revision, and time/cutoff mismatches fail closed', () => {
  const staleDigest = structuredClone(buildCoreTypedFacts());
  staleDigest.facts_digest = '0'.repeat(64);
  expectClosed('RM_TYPED_FACTS_DIGEST_MISMATCH', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), staleDigest));

  const hybrid = structuredClone(buildCoreTypedFacts());
  hybrid.facts_digest = '0'.repeat(64);
  hybrid.request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  expectClosed('RM_TYPED_FACTS_RAW_WRAPPER_REFUSED', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), hybrid));

  const projectMismatch = buildCoreTypedFacts((request) => {
    request.binding.project_binding_ref.entity_id = 'synthetic-other-project';
  });
  expectClosed('RM_TYPED_FACTS_PROJECT_MISMATCH', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), projectMismatch));

  const bindingMismatch = buildCoreTypedFacts((request) => {
    request.binding.project_binding_ref.revision_id = 'r2';
  });
  expectClosed('RM_TYPED_FACTS_BINDING_MISMATCH', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), bindingMismatch));

  const timeMismatch = buildCoreTypedFacts((request) => {
    request.cutoffs.valid_at = '2026-08-25T00:00:00.000Z';
  });
  expectClosed('RM_TYPED_FACTS_TIME_MISMATCH', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), timeMismatch));
});

test('RED B2: an outer TypedProjectFacts Proxy is rejected before any trap runs', () => {
  let trapHits = 0;
  const hostile = new Proxy(buildCoreTypedFacts(), {
    get() { trapHits += 1; throw new Error('outer typed facts trap'); },
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), hostile));
  assert.equal(trapHits, 0);
});

test('RED B2: nested effective-ruleset accessors and proxies are rejected before trap execution', () => {
  const accessorRuleset = baseRuleset();
  let accessorHits = 0;
  Object.defineProperty(accessorRuleset.ruleset_ref, 'content_id', {
    enumerable: true,
    configurable: true,
    get() { accessorHits += 1; throw new Error('ruleset ref getter'); },
  });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(accessorRuleset, buildCoreTypedFacts()));
  assert.equal(accessorHits, 0);

  const proxyRuleset = baseRuleset();
  let proxyHits = 0;
  proxyRuleset.rules = new Proxy(proxyRuleset.rules, {
    get() { proxyHits += 1; throw new Error('rules proxy'); },
  });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(proxyRuleset, buildCoreTypedFacts()));
  assert.equal(proxyHits, 0);
});

test('RED B2: nested provenance/facts cycles, aliases, custom prototypes, and accessors fail as closed RM errors', () => {
  const provenanceAccessor = baseRuleset();
  let provenanceHits = 0;
  Object.defineProperty(provenanceAccessor, 'profile_rule_provenance', {
    enumerable: true,
    configurable: true,
    get() { provenanceHits += 1; throw new Error('provenance getter'); },
  });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(provenanceAccessor, buildCoreTypedFacts()));
  assert.equal(provenanceHits, 0);

  const cycle = structuredClone(buildCoreTypedFacts());
  cycle.facts[0].cycle = cycle;
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), cycle));

  const alias = structuredClone(buildCoreTypedFacts());
  alias.facts[0].binding = alias.facts[0].manifest;
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), alias));

  const customPrototype = structuredClone(buildCoreTypedFacts());
  Object.setPrototypeOf(customPrototype.facts[0], { hostile: true });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), customPrototype));

  const nestedRefAccessor = structuredClone(buildCoreTypedFacts());
  let nestedRefHits = 0;
  Object.defineProperty(nestedRefAccessor.facts[0].domain_input.rows[0].stage_ref, 'entity_id', {
    enumerable: true,
    configurable: true,
    get() { nestedRefHits += 1; throw new Error('nested typed fact ref getter'); },
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), nestedRefAccessor));
  assert.equal(nestedRefHits, 0);
});

test('RED B2: toJSON, ownKeys, symbol, and custom-prototype effective-ruleset forgeries are refused without traps', () => {
  const toJsonRuleset = baseRuleset();
  let toJsonHits = 0;
  toJsonRuleset.rules[0].toJSON = () => {
    toJsonHits += 1;
    return { tampered: true };
  };
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(toJsonRuleset, buildCoreTypedFacts()));
  assert.equal(toJsonHits, 0);

  const hiddenProvenance = baseRuleset();
  let ownKeysHits = 0;
  hiddenProvenance.profile_rule_provenance = new Proxy({ 'RM-HIDDEN-01': {} }, {
    ownKeys() { ownKeysHits += 1; return []; },
  });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(hiddenProvenance, buildCoreTypedFacts()));
  assert.equal(ownKeysHits, 0);

  const symbolRuleset = baseRuleset();
  symbolRuleset[Symbol('hidden')] = true;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(symbolRuleset, buildCoreTypedFacts()));

  const hiddenRuleset = baseRuleset();
  Object.defineProperty(hiddenRuleset.ruleset_ref, 'hidden', {
    value: true,
    enumerable: false,
  });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(hiddenRuleset, buildCoreTypedFacts()));

  const aliasedRuleset = baseRuleset();
  aliasedRuleset.source_packet_ref = aliasedRuleset.ruleset_ref;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(aliasedRuleset, buildCoreTypedFacts()));

  const cyclicRuleset = baseRuleset();
  cyclicRuleset.ruleset_ref.self = cyclicRuleset.ruleset_ref;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(cyclicRuleset, buildCoreTypedFacts()));

  const prototypeRuleset = baseRuleset();
  Object.setPrototypeOf(prototypeRuleset.ruleset_ref, { hostile: true });
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(prototypeRuleset, buildCoreTypedFacts()));
});

test('RED B4: Profile-array traps and runtime-composed unsafe public locators are refused before observation', () => {
  const profile = validProfileBinding();
  const profileArray = [profile];
  let profileAccessorHits = 0;
  Object.defineProperty(profileArray, '0', {
    enumerable: true,
    configurable: true,
    get() { profileAccessorHits += 1; throw new Error('profile array accessor'); },
  });
  expectClosed('RM_PROFILE_BINDINGS_INVALID', () => compileReliabilityMaintainabilityRules(profileArray));
  assert.equal(profileAccessorHits, 0);

  let profileProxyHits = 0;
  const profileProxy = new Proxy([validProfileBinding()], {
    get() { profileProxyHits += 1; throw new Error('profile array proxy'); },
  });
  expectClosed('RM_PROFILE_BINDINGS_INVALID', () => compileReliabilityMaintainabilityRules(profileProxy));
  assert.equal(profileProxyHits, 0);

  const unsafe = runtimeUnsafeWorkspacePath();
  const locatorProfile = validProfileBinding();
  locatorProfile.source_refs = [unsafe];
  locatorProfile.operations[0].rule.source_ref = unsafe;
  locatorProfile.operations[0].rule.source_locator = unsafe;
  locatorProfile.operation_digest = normalizeProfileOperations(locatorProfile.operations).operation_digest;
  expectClosed('RM_RULE_INVALID_FIELD', () => compileReliabilityMaintainabilityRules([locatorProfile]));

  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  request.manifest.test_receipt_ref = unsafe;
  request.binding.module_bindings[0].test_receipt_ref = unsafe;
  expectClosed('RELIABILITY_MAINTAINABILITY_INPUT_REFUSED', () => assessReliabilityMaintainability(request));

  const manifestInput = {
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: unsafe,
  };
  assert.throws(() => createReliabilityMaintainabilityModuleManifest(manifestInput));
});

test('RED B1/B2: exact base rules plus empty provenance pass, while derived rules remain held', () => {
  const accepted = baseRuleset();
  accepted.profile_rule_provenance = {};
  const acceptedResult = reliabilityMaintainabilityAdapter.evaluate(accepted, buildCoreTypedFacts());
  assert.equal(acceptedResult.assessment.effective_ruleset_digest, accepted.ruleset_ref.content_id);
  assert.equal(acceptedResult.domain_result.effective_ruleset_digest, accepted.ruleset_ref.content_id);
  assert.equal(acceptedResult.receipt.digests.effective_ruleset_sha256, accepted.ruleset_ref.content_id.slice('sha256:'.length));
  assert.deepEqual(acceptedResult.receipt.bindings.effective_ruleset_ref, accepted.ruleset_ref);

  const derived = baseRuleset();
  derived.ruleset_ref.revision_id = 'derived:r1';
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(derived, buildCoreTypedFacts()));
});

test('RED Evaluator 4-arguments: authority must be empty plain object and cutoffs must match facts', () => {
  const facts = buildCoreTypedFacts();
  const ruleset = baseRuleset();

  // Non-empty authority is refused
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, { requested_effects: ['filesystem_write'] });
  });

  // Hostile authority with accessor is refused before getter runs
  let authorityGetterHits = 0;
  const hostileAuthority = {};
  Object.defineProperty(hostileAuthority, 'trap', {
    enumerable: true,
    configurable: true,
    get() { authorityGetterHits += 1; throw new Error('authority getter trap'); },
  });
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, hostileAuthority);
  });
  assert.equal(authorityGetterHits, 0);

  // Authority proxy is refused before trap runs
  let authorityProxyHits = 0;
  const proxyAuthority = new Proxy({}, {
    get() { authorityProxyHits += 1; throw new Error('authority proxy trap'); },
  });
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, proxyAuthority);
  });
  assert.equal(authorityProxyHits, 0);

  // Valid matching cutoffs are accepted
  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, { valid_at: VALID_AT, known_at: KNOWN_AT });
  });

  // Mismatched cutoffs are refused
  expectClosed('RM_TYPED_FACTS_TIME_MISMATCH', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, { valid_at: '2026-08-01T00:00:00.000Z', known_at: KNOWN_AT });
  });
  expectClosed('RM_TYPED_FACTS_TIME_MISMATCH', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, { valid_at: VALID_AT, known_at: '2026-08-01T00:00:00.000Z' });
  });

  // Invalid calendar instant in cutoffs is refused
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, { valid_at: '2026-02-30T00:00:00.000Z', known_at: KNOWN_AT });
  });

  // Hostile cutoffs with accessor is refused before getter runs
  let cutoffsGetterHits = 0;
  const hostileCutoffs = { valid_at: VALID_AT };
  Object.defineProperty(hostileCutoffs, 'known_at', {
    enumerable: true,
    configurable: true,
    get() { cutoffsGetterHits += 1; throw new Error('cutoffs getter trap'); },
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, hostileCutoffs);
  });
  assert.equal(cutoffsGetterHits, 0);
});

test('RED Evaluator: bare derived ruleset without Core compilation envelope is rejected as EFFECTIVE_RULESET_INVALID', () => {
  const derivedCompilation = compileReliabilityMaintainabilityRules([validProfileBinding()]);
  const bareDerivedRuleset = derivedCompilation.effective_rule_set;

  // Passing bare derived ruleset without Core compilation envelope must throw RM_EFFECTIVE_RULESET_INVALID
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(bareDerivedRuleset, buildCoreTypedFacts());
  });
});

test('RED Evaluator: Core compilation envelope must be structurally valid, and evaluating envelope-wrapped derived ruleset fails closed as PROFILE_EVALUATION_UNSUPPORTED', () => {
  const derivedProfile = validProfileBinding();
  const envelope = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(derivedProfile, null), {});

  // Evaluating derived envelope fails closed with PROFILE_EVALUATION_UNSUPPORTED (truthful hold)
  expectClosed('RM_PROFILE_EVALUATION_UNSUPPORTED', () => {
    reliabilityMaintainabilityAdapter.evaluate(envelope, buildCoreTypedFacts());
  });

  // Tampered assembly_digest in envelope is rejected as RM_EFFECTIVE_RULESET_INVALID
  const tamperedEnvelope = structuredClone(envelope);
  tamperedEnvelope.assembly_digest = 'a'.repeat(64);
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(tamperedEnvelope, buildCoreTypedFacts());
  });

  // Non-empty compilation_scope in trace is rejected
  const scopeEnvelope = structuredClone(envelope);
  scopeEnvelope.compilation_trace.compilation_scope = { extra_scope: 'invalid' };
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(scopeEnvelope, buildCoreTypedFacts());
  });
});

test('RED Evaluator: Core TypedProjectFacts accepts optional project_binding_ref fields (schema_version, source_manifest_ref, authority_family, document_refs, valid_at, known_at)', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-v0',
    authority_family: 'project_contract_baseline',
    document_refs: ['doc-1', 'doc-2'],
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  };
  const adapted = adaptProjectEvidence(
    coreBinding,
    {
      source_refs: ['synthetic-core-rm-source-v1'],
      observations: [req],
    },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), adapted);
  });

  // Invalid authority_family on project_binding_ref is rejected
  const badAuthBinding = structuredClone(adapted);
  badAuthBinding.project_binding_ref.authority_family = 'invented_authority_family';
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), badAuthBinding);
  });
});

test('RED Blocker 1: Core compilation envelope enforces complete trace closure, profile matrix, and provenance cross-binding', () => {
  const orgProfile = validProfileBinding();
  const projOps = [{
    op: 'add',
    rule: {
      ...validProfileBinding().operations[0].rule,
      rule_id: 'RM-PROFILE-02',
    },
  }];
  const projProfile = {
    ...validProfileBinding(),
    profile_kind: 'project',
    profile_id: 'synthetic_rm_project_profile',
    order: 1,
    operation_digest: normalizeProfileOperations(projOps).operation_digest,
    operations: projOps,
  };
  const envBoth = assembleEffectiveRuleSet(
    reliabilityMaintainabilityAdapter,
    resolveProfileBindings(orgProfile, projProfile),
    {},
  );

  // Valid 2-profile envelope fails closed with RM_PROFILE_EVALUATION_UNSUPPORTED
  expectClosed('RM_PROFILE_EVALUATION_UNSUPPORTED', () => {
    reliabilityMaintainabilityAdapter.evaluate(envBoth, buildCoreTypedFacts());
  });

  // Mismatched domain_engine_id in envelope is rejected
  const badDomainEnvelope = structuredClone(envBoth);
  badDomainEnvelope.domain_engine_id = 'pcb_compliance';
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badDomainEnvelope, buildCoreTypedFacts());
  });

  // Mismatched domain_adapter_revision in trace is rejected
  const badAdapterRevEnvelope = structuredClone(envBoth);
  badAdapterRevEnvelope.compilation_trace.domain_adapter_revision = 'invalid.compiler.revision.v99';
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badAdapterRevEnvelope, buildCoreTypedFacts());
  });

  // Extra field on envelope is rejected (closed keys)
  const extraKeyEnvelope = structuredClone(envBoth);
  extraKeyEnvelope.attacker_extra_field = 'forged';
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(extraKeyEnvelope, buildCoreTypedFacts());
  });

  // Extra field on compilation_trace is rejected (closed keys)
  const extraTraceKeyEnvelope = structuredClone(envBoth);
  extraTraceKeyEnvelope.compilation_trace.attacker_trace_field = 'forged';
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(extraTraceKeyEnvelope, buildCoreTypedFacts());
  });

  // Organization trace nullability mismatch: null when org profile exists
  const nullOrgTraceEnvelope = structuredClone(envBoth);
  nullOrgTraceEnvelope.compilation_trace.organization_trace = null;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(nullOrgTraceEnvelope, buildCoreTypedFacts());
  });

  // Project trace nullability mismatch: null when proj profile exists
  const nullProjTraceEnvelope = structuredClone(envBoth);
  nullProjTraceEnvelope.compilation_trace.project_trace = null;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(nullProjTraceEnvelope, buildCoreTypedFacts());
  });

  // 0-profile envelope: non-null organization_trace is rejected
  const env0 = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(null, null), {});
  const badOrgOn0Env = structuredClone(env0);
  badOrgOn0Env.compilation_trace.organization_trace = structuredClone(envBoth.compilation_trace.organization_trace);
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badOrgOn0Env, buildCoreTypedFacts());
  });

  // Reordered profile trace (project then organization) is rejected
  const badOrderEnvelope = structuredClone(envBoth);
  badOrderEnvelope.compilation_trace.profiles = [
    envBoth.compilation_trace.profiles[1],
    envBoth.compilation_trace.profiles[0],
  ];
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badOrderEnvelope, buildCoreTypedFacts());
  });

  // Duplicate profile identity in trace is rejected
  const dupProfileEnvelope = structuredClone(envBoth);
  dupProfileEnvelope.compilation_trace.profiles = [
    envBoth.compilation_trace.profiles[0],
    envBoth.compilation_trace.profiles[0],
  ];
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(dupProfileEnvelope, buildCoreTypedFacts());
  });

  // Provenance operation_index gap/tamper is rejected
  const badIndexEnvelope = structuredClone(envBoth);
  const derivedRuleId = Object.keys(badIndexEnvelope.effective_rule_set.profile_rule_provenance)[0];
  badIndexEnvelope.effective_rule_set.profile_rule_provenance[derivedRuleId].operation_index = 99;
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badIndexEnvelope, buildCoreTypedFacts());
  });

  // Forged operation_item_digest in profile_rule_provenance is rejected
  const badItemDigestEnvelope = structuredClone(envBoth);
  badItemDigestEnvelope.effective_rule_set.profile_rule_provenance[derivedRuleId].operation_item_digest = 'f'.repeat(64);
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badItemDigestEnvelope, buildCoreTypedFacts());
  });

  // Stale outer trace operation_digest vs inner reconstructed ops is rejected
  const badGroupDigestEnvelope = structuredClone(envBoth);
  badGroupDigestEnvelope.compilation_trace.profiles[0].operation_digest = 'e'.repeat(64);
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(badGroupDigestEnvelope, buildCoreTypedFacts());
  });
});

test('RED Blocker 2: Project binding provenance is deeply bound into result and receipt, and byte mutations alter digests deterministically', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBindingA = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-alpha',
    authority_family: 'project_contract_baseline',
    document_refs: ['doc-alpha-1', 'doc-alpha-2'],
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  };
  const factsA = adaptProjectEvidence(
    coreBindingA,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const resultA = reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), factsA);

  // Result and receipt must contain project_facts_provenance
  assert.ok(resultA.domain_result.project_facts_provenance, 'domain_result must carry project_facts_provenance');
  assert.ok(resultA.receipt.project_facts_provenance, 'receipt must carry project_facts_provenance');
  assert.equal(resultA.domain_result.project_facts_provenance.project_binding_ref.source_manifest_ref, 'manifest-alpha');
  assert.deepEqual(resultA.domain_result.project_facts_provenance.project_binding_ref.document_refs, ['doc-alpha-1', 'doc-alpha-2']);
  assert.equal(resultA.receipt.project_facts_provenance.project_binding_ref.authority_family, 'project_contract_baseline');

  // Mutation of document_refs changes result_sha256 deterministically
  const coreBindingB = {
    ...coreBindingA,
    document_refs: ['doc-alpha-1', 'doc-alpha-3'],
  };
  const factsB = adaptProjectEvidence(
    coreBindingB,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const resultB = reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), factsB);
  assert.notEqual(resultA.receipt.digests.result_sha256, resultB.receipt.digests.result_sha256);
  assert.notEqual(resultA.receipt.digests.domain_result_sha256, resultB.receipt.digests.domain_result_sha256);

  // Unsorted document_refs are rejected
  const unsortedBinding = structuredClone(factsA);
  unsortedBinding.project_binding_ref.document_refs = ['doc-alpha-2', 'doc-alpha-1'];
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), unsortedBinding);
  });

  // Duplicate document_refs are rejected
  const dupDocsBinding = structuredClone(factsA);
  dupDocsBinding.project_binding_ref.document_refs = ['doc-alpha-1', 'doc-alpha-1'];
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), dupDocsBinding);
  });

  // Temporal mismatch between project_binding_ref.valid_at and cutoffs is rejected
  const timeMismatchBinding = structuredClone(factsA);
  timeMismatchBinding.project_binding_ref.valid_at = '2020-01-01T00:00:00.000Z';
  expectClosed('RM_TYPED_FACTS_TIME_MISMATCH', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), timeMismatchBinding);
  });

  // Extra unsupported field on project_binding_ref is rejected
  const extraFieldBinding = structuredClone(factsA);
  extraFieldBinding.project_binding_ref.unsupported_field = 'forged';
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), extraFieldBinding);
  });
});

test('RED Blocker 1: Core project binding required-field parity (schema_version and source_manifest_ref mandatory)', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;

  const validCoreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };

  const facts = adaptProjectEvidence(
    validCoreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  // Valid complete required set passes
  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), facts);
  });

  // Omission of schema_version fails RM_TYPED_FACTS_INVALID
  const noSchemaVer = structuredClone(facts);
  delete noSchemaVer.project_binding_ref.schema_version;
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), noSchemaVer);
  });

  // Wrong schema_version fails RM_TYPED_FACTS_INVALID
  const wrongSchemaVer = structuredClone(facts);
  wrongSchemaVer.project_binding_ref.schema_version = 'soulforge.wrong_binding.v0';
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), wrongSchemaVer);
  });

  // Omission of source_manifest_ref fails RM_TYPED_FACTS_INVALID
  const noSourceManifest = structuredClone(facts);
  delete noSourceManifest.project_binding_ref.source_manifest_ref;
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), noSourceManifest);
  });

  // Empty string source_manifest_ref fails RM_TYPED_FACTS_INVALID
  const emptySourceManifest = structuredClone(facts);
  emptySourceManifest.project_binding_ref.source_manifest_ref = '';
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), emptySourceManifest);
  });
});

test('RED Blocker 2: Direct adapter calls with explicit null authority or cutoffs are refused zero-trap', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };
  const facts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;
  const ruleset = baseRuleset();

  // Explicit null authority fails RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, null, {});
  });
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, null, undefined);
  });
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, null, null);
  });

  // Explicit null cutoffs fails RM_TYPED_FACTS_INVALID
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, null);
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, undefined, null);
  });

  // Array authority / cutoffs are refused
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, [], {});
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, []);
  });

  // Symbol keys on authority / cutoffs are refused
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, { [Symbol('auth')]: 1 }, {});
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, { [Symbol('cut')]: 1 });
  });

  // Custom prototype on authority / cutoffs are refused
  const protoAuth = Object.create({ inherited: true });
  expectClosed('RELIABILITY_MAINTAINABILITY_AUTHORITY_REFUSED', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, protoAuth, {});
  });
  const protoCutoffs = Object.create({ inherited: true });
  expectClosed('RM_TYPED_FACTS_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, {}, protoCutoffs);
  });

  // Omitted/undefined parameters succeed
  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts);
  });
  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(ruleset, facts, undefined, undefined);
  });
});

test('RED Blocker 3: Two valid Core zero-op profile envelopes produce distinct bound result/receipt bytes and fail cross-verification', async () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };
  const facts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const profileA = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'synthetic_rm_profile_zero_a',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_zero_a_v1',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ['synthetic-profile-source-a'],
    order: 0,
    operations: [],
  };

  const profileB = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'synthetic_rm_profile_zero_b',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_zero_b_v1',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ['synthetic-profile-source-b'],
    order: 0,
    operations: [],
  };

  const envA = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(profileA, null), {});
  const envB = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(profileB, null), {});

  const resultA = reliabilityMaintainabilityAdapter.evaluate(envA, facts);
  const resultB = reliabilityMaintainabilityAdapter.evaluate(envB, facts);

  // Result bytes and digests must differ between zero-op envelope A and envelope B
  assert.notEqual(resultA.receipt.digests.result_sha256, resultB.receipt.digests.result_sha256);
  assert.notEqual(resultA.assessment.effective_ruleset_digest, resultB.assessment.effective_ruleset_digest);
  assert.notEqual(resultA.domain_result.effective_ruleset_digest, resultB.domain_result.effective_ruleset_digest);
  assert.notEqual(resultA.receipt.digests.effective_ruleset_sha256, resultB.receipt.digests.effective_ruleset_sha256);
  assert.notEqual(resultA.receipt.digests.input_sha256, resultB.receipt.digests.input_sha256);

  // Cross-verification must fail
  const { verifyReliabilityMaintainabilityResult } = assessReliabilityMaintainability ? (await import('../evaluator/reliability_maintainability.mjs')) : {};
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(resultA, envB, facts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(resultB, envA, facts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // Self-verification must succeed
  assert.doesNotThrow(() => {
    verifyReliabilityMaintainabilityResult(resultA, envA, facts);
  });
  assert.doesNotThrow(() => {
    verifyReliabilityMaintainabilityResult(resultB, envB, facts);
  });
});

test('RED Blocker 4: Optional base_ruleset_ref must not be discarded and must match exact canonical closed ref', async () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };
  const facts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const env0 = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(null, null), {});

  // Reclosed Core envelope carrying a forged optional base_ruleset_ref is rejected
  const forgedRefEnv = structuredClone(env0);
  forgedRefEnv.effective_rule_set.base_ruleset_ref = {
    entity_id: 'reliability-maintainability-ruleset-v0',
    revision_id: '1.0.0',
    content_id: 'sha256:' + '0'.repeat(64),
    content_hash_alg: 'sha256',
  };
  const { withoutNulls, arrayOrderRules } = await import('../../../core/interfaces/domain_engine_adapter.mjs');
  const { canonicalise } = await import('../../../core/validators/canonical.mjs');
  const { sha256Hex } = await import('../../../core/validators/fingerprint.mjs');
  const clean = withoutNulls(forgedRefEnv.effective_rule_set);
  const reclosedDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(clean, arrayOrderRules(clean))}`);
  forgedRefEnv.assembly_digest = reclosedDigest;
  forgedRefEnv.compilation_trace.effective_ruleset_digest = reclosedDigest;

  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(forgedRefEnv, facts);
  });

  // Reclosed Core envelope with malformed base_ruleset_ref (missing required ref fields) is rejected
  const malformedRefEnv = structuredClone(env0);
  malformedRefEnv.effective_rule_set.base_ruleset_ref = {
    entity_id: 'reliability-maintainability-ruleset-v0',
    revision_id: '1.0.0',
    content_id: 'sha256:not-valid-hex',
    content_hash_alg: 'sha256',
  };
  const cleanMal = withoutNulls(malformedRefEnv.effective_rule_set);
  const reclosedMalDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanMal, arrayOrderRules(cleanMal))}`);
  malformedRefEnv.assembly_digest = reclosedMalDigest;
  malformedRefEnv.compilation_trace.effective_ruleset_digest = reclosedMalDigest;

  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(malformedRefEnv, facts);
  });

  // Bare ruleset carrying base_ruleset_ref is rejected
  const bareWithBaseRef = baseRuleset();
  bareWithBaseRef.base_ruleset_ref = structuredClone(bareWithBaseRef.ruleset_ref);
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(bareWithBaseRef, facts);
  });

  // Reclosed Core envelope with exact canonical base_ruleset_ref is accepted
  const validCanonicalRefEnv = structuredClone(env0);
  validCanonicalRefEnv.effective_rule_set.base_ruleset_ref = structuredClone(validCanonicalRefEnv.effective_rule_set.ruleset_ref);
  const cleanValid = withoutNulls(validCanonicalRefEnv.effective_rule_set);
  const reclosedValidDigest = sha256Hex(`soulforge.effective_rule_set.v0\n${canonicalise(cleanValid, arrayOrderRules(cleanValid))}`);
  validCanonicalRefEnv.assembly_digest = reclosedValidDigest;
  validCanonicalRefEnv.compilation_trace.effective_ruleset_digest = reclosedValidDigest;

  assert.doesNotThrow(() => {
    reliabilityMaintainabilityAdapter.evaluate(validCanonicalRefEnv, facts);
  });
});

test('RED Blocker 5: Unique trace source_refs and exact insertion-order parity across profile, summary, and provenance', () => {
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-core-v0',
  };
  const facts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const profileZero = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'synthetic_rm_profile_zero',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_zero_v1',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ['src-1', 'src-2'],
    order: 0,
    operations: [],
  };

  const envZero = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(profileZero, null), {});

  // Duplicate source_refs in profile trace
  const dupProfileSrcEnv = structuredClone(envZero);
  dupProfileSrcEnv.compilation_trace.profiles[0].source_refs = ['src-1', 'src-1'];
  dupProfileSrcEnv.compilation_trace.organization_trace.source_refs = ['src-1', 'src-1'];
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(dupProfileSrcEnv, facts);
  });

  // Duplicate source_refs in organization_trace
  const dupOrgSrcEnv = structuredClone(envZero);
  dupOrgSrcEnv.compilation_trace.organization_trace.source_refs = ['src-1', 'src-1'];
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(dupOrgSrcEnv, facts);
  });

  // Reordered source_refs in organization_trace vs profile trace
  const reorderedOrgSrcEnv = structuredClone(envZero);
  reorderedOrgSrcEnv.compilation_trace.organization_trace.source_refs = ['src-2', 'src-1'];
  expectClosed('RM_EFFECTIVE_RULESET_INVALID', () => {
    reliabilityMaintainabilityAdapter.evaluate(reorderedOrgSrcEnv, facts);
  });
});

test('RED: Core TypedProjectFacts with source-native transport projection evaluates, retains literal null, and verifies', () => {
  const concreteFacts = buildCoreTypedFacts();
  const concreteResult = reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), concreteFacts);

  const typedFacts = buildCoreTypedFacts((request) => {
    const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    delete relRow.evidence_kind;
    relRow.evidence_kind_projection = 'source_native';
  });

  const result = reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), typedFacts);

  // Retains literal null
  const relResult = result.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  assert.equal(relResult.evidence_kind, null, 'domain_result result must carry literal null');
  assert.equal(relResult.state, 'satisfied');

  // Digests differ from concrete
  assert.notEqual(result.receipt.digests.domain_result_sha256, concreteResult.receipt.digests.domain_result_sha256);
  assert.notEqual(result.receipt.digests.input_sha256, concreteResult.receipt.digests.input_sha256);
  assert.notEqual(result.receipt.digests.result_sha256, concreteResult.receipt.digests.result_sha256);

  // Deterministic replay
  const replayResult = reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), typedFacts);
  assert.deepEqual(result, replayResult);
  assert.equal(JSON.stringify(result), JSON.stringify(replayResult));

  // Verification succeeds with TypedProjectFacts trusted input
  const verification = verifyReliabilityMaintainabilityResult(result, baseRuleset(), typedFacts);
  assert.equal(verification.verified, true);
  assert.deepEqual(verification.digests, result.receipt.digests);

  // Hostile: row with both evidence_kind and evidence_kind_projection fails closed
  const hybridFacts = buildCoreTypedFacts((request) => {
    const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    relRow.evidence_kind_projection = 'source_native';
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), hybridFacts));

  // Hostile: malformed projection string
  const badProjFacts = buildCoreTypedFacts((request) => {
    const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    delete relRow.evidence_kind;
    relRow.evidence_kind_projection = 'invalid_projection';
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), badProjFacts));

  // Hostile: missing both evidence_kind and evidence_kind_projection
  const missingBothFacts = buildCoreTypedFacts((request) => {
    const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    delete relRow.evidence_kind;
  });
  expectClosed('RM_TYPED_FACTS_INVALID', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), missingBothFacts));

  // Hostile: injecting marker object directly as evidence_kind
  const markerFacts = buildCoreTypedFacts((request) => {
    const relRow = request.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
    relRow.evidence_kind = { source_native: true };
  });
  expectClosed('RELIABILITY_MAINTAINABILITY_VOCABULARY_REFUSED', () => reliabilityMaintainabilityAdapter.evaluate(baseRuleset(), markerFacts));
});
