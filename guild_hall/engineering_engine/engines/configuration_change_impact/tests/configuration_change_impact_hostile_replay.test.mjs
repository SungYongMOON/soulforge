import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  CCI_ERROR_CODES,
  adaptConfigurationChangeImpactProjectEvidence,
  configurationChangeImpactAdapter,
} from '../evaluator/configuration_change_impact_evaluator_adapter.mjs';
import {
  buildConfigurationChangeImpactPublicSyntheticBindingInput,
  buildConfigurationChangeImpactPublicSyntheticProjectProfile,
  buildConfigurationChangeImpactPublicSyntheticRequest,
} from '../fixtures/configuration_change_impact_public_synthetic.mjs';
import { compileConfigurationChangeImpactRules } from '../compiler/configuration_change_impact_compiler_adapter.mjs';
import {
  assembleEffectiveRuleSet,
  evaluate,
  resolveProfileBindings,
} from '../../../core/interfaces/domain_engine_adapter.mjs';

function expectCode(code, run) {
  assert.throws(run, (error) => error?.code === code, `expected ${code}`);
}

function makeSyntheticTypedFacts(request) {
  return adaptConfigurationChangeImpactProjectEvidence(
    buildConfigurationChangeImpactPublicSyntheticBindingInput(request),
  );
}

function evaluateThroughCore(request) {
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  return evaluate(configurationChangeImpactAdapter, assembled, makeSyntheticTypedFacts(request), {}, {});
}

test('replay returns the same frozen result and digests for the same typed facts', () => {
  const first = evaluateThroughCore(buildConfigurationChangeImpactPublicSyntheticRequest());
  const second = evaluateThroughCore(buildConfigurationChangeImpactPublicSyntheticRequest());
  assert.deepEqual(second, first);
  assert.equal(second.receipt.digests.input_sha256, first.receipt.digests.input_sha256);
  assert.equal(second.receipt.digests.domain_result_sha256, first.receipt.digests.domain_result_sha256);
  assert.equal(second.receipt.digests.assessment_sha256, first.receipt.digests.assessment_sha256);
});

test('hostile order and accessor-backed input are refused without executing getters', () => {
  const reordered = buildConfigurationChangeImpactPublicSyntheticRequest();
  [reordered.impact_records[0], reordered.impact_records[1]] = [reordered.impact_records[1], reordered.impact_records[0]];
  expectCode(CCI_ERROR_CODES.IMPACT_COVERAGE_REFUSED, () => evaluateThroughCore(reordered));

  const accessor = buildConfigurationChangeImpactPublicSyntheticBindingInput();
  let getterCalls = 0;
  Object.defineProperty(accessor, 'project_binding_ref', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return buildConfigurationChangeImpactPublicSyntheticBindingInput().project_binding_ref;
    },
  });
  expectCode(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, () => adaptConfigurationChangeImpactProjectEvidence(accessor));
  assert.equal(getterCalls, 0);

  const proxied = buildConfigurationChangeImpactPublicSyntheticBindingInput();
  expectCode(
    CCI_ERROR_CODES.TYPED_FACTS_REFUSED,
    () => adaptConfigurationChangeImpactProjectEvidence(new Proxy(proxied, {})),
  );

  const aliased = buildConfigurationChangeImpactPublicSyntheticBindingInput();
  aliased.source_snapshot_refs.observations.push(aliased.source_snapshot_refs.observations[0]);
  expectCode(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, () => adaptConfigurationChangeImpactProjectEvidence(aliased));
});

test('a stale or altered base rule set cannot enter through the Core evaluator seam', () => {
  const compiled = compileConfigurationChangeImpactRules([]).effective_rule_set;
  const altered = structuredClone(compiled);
  altered.source_packet_ref.content_id = `sha256:${'0'.repeat(64)}`;
  expectCode(
    CCI_ERROR_CODES.RULESET_REFUSED,
    () => configurationChangeImpactAdapter.evaluate(altered, makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest())),
  );
});

test('typed facts bind the exact project, Profile, and change identity before evaluation', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  const typedFacts = structuredClone(makeSyntheticTypedFacts(request));
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });

  const projectMismatch = structuredClone(typedFacts);
  projectMismatch.core_typed_project_facts.project_binding_ref.project_id = 'project:other';
  expectCode(
    CCI_ERROR_CODES.PROJECT_BINDING_MISMATCH,
    () => evaluate(configurationChangeImpactAdapter, assembled, projectMismatch, {}, {}),
  );

  const alternateProfile = buildConfigurationChangeImpactPublicSyntheticProjectProfile();
  alternateProfile.profile_id = 'synthetic-configuration-change-profile-other';
  const alternateBindings = resolveProfileBindings(null, alternateProfile);
  const alternateAssembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, alternateBindings, {
    compilation_scope: 'public_synthetic',
  });
  expectCode(
    CCI_ERROR_CODES.PROFILE_BINDING_MISMATCH,
    () => evaluate(configurationChangeImpactAdapter, alternateAssembled, typedFacts, {}, {}),
  );

  const changeMismatch = structuredClone(typedFacts);
  changeMismatch.core_observation_receipt.source_snapshot_refs.observations[0].change_identity.change_id = 'synthetic-ecn-other';
  expectCode(
    CCI_ERROR_CODES.CHANGE_IDENTITY_REFUSED,
    () => evaluate(configurationChangeImpactAdapter, assembled, changeMismatch, {}, {}),
  );
});

test('revision identity and path-bound evidence cannot be substituted by opaque references', () => {
  const sameRevision = buildConfigurationChangeImpactPublicSyntheticRequest();
  sameRevision.change.target_post_change_revision_ref = sameRevision.change.pre_change_revision_ref;
  expectCode(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, () => makeSyntheticTypedFacts(sameRevision));

  const missingRevision = buildConfigurationChangeImpactPublicSyntheticRequest();
  delete missingRevision.change.pre_change_revision_ref;
  expectCode(CCI_ERROR_CODES.TYPED_FACTS_REFUSED, () => makeSyntheticTypedFacts(missingRevision));

  const unrelatedEvidence = buildConfigurationChangeImpactPublicSyntheticRequest();
  const software = unrelatedEvidence.impact_records.find((row) => row.impact_kind === 'software');
  software.verification_evidence[0].change_id = 'synthetic-ecn-unrelated';
  expectCode(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, () => evaluateThroughCore(unrelatedEvidence));

  const wrongRelationshipPath = buildConfigurationChangeImpactPublicSyntheticRequest();
  const closure = wrongRelationshipPath.closure.closure_evidence[0];
  closure.relationship_path_refs = closure.relationship_path_refs.slice(0, -1);
  expectCode(CCI_ERROR_CODES.EVIDENCE_BINDING_REFUSED, () => evaluateThroughCore(wrongRelationshipPath));
});

test('compiler and evaluator reject hostile profile and typed-facts wrappers without getters', () => {
  const profile = buildConfigurationChangeImpactPublicSyntheticProjectProfile();
  let profileGetterCalls = 0;
  Object.defineProperty(profile, 'profile_id', {
    enumerable: true,
    configurable: true,
    get() {
      profileGetterCalls += 1;
      return 'synthetic-configuration-change-profile';
    },
  });
  expectCode(CCI_ERROR_CODES.PROFILE_BINDINGS_INVALID, () => compileConfigurationChangeImpactRules([profile]));
  assert.equal(profileGetterCalls, 0);
  expectCode(
    CCI_ERROR_CODES.PROFILE_BINDINGS_INVALID,
    () => compileConfigurationChangeImpactRules([new Proxy(buildConfigurationChangeImpactPublicSyntheticProjectProfile(), {})]),
  );

  const typedFacts = makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest());
  const accessorTypedFacts = structuredClone(typedFacts);
  let typedGetterCalls = 0;
  Object.defineProperty(accessorTypedFacts, 'identity_digest', {
    enumerable: true,
    configurable: true,
    get() {
      typedGetterCalls += 1;
      return typedFacts.identity_digest;
    },
  });
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  expectCode(
    CCI_ERROR_CODES.TYPED_FACTS_REFUSED,
    () => evaluate(configurationChangeImpactAdapter, assembled, accessorTypedFacts, {}, {}),
  );
  assert.equal(typedGetterCalls, 0);
});

test('effective ruleset provenance entries and digest are validated, not merely shaped as an array', () => {
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const assembled = structuredClone(assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  }));
  assembled.effective_rule_set.profile_provenance[0].source_refs = ['file:private-profile-source'];
  expectCode(
    CCI_ERROR_CODES.PROFILE_PROVENANCE_INVALID,
    () => evaluate(configurationChangeImpactAdapter, assembled, makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest()), {}, {}),
  );
});

test('every published Effective Rule Set envelope and compilation-trace field is integrity-bound', () => {
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const canonical = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  const typedFacts = makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest());
  const mutations = [
    ['outer schema', (value) => { value.schema_version = 'soulforge.effective_rule_set.tampered.v0'; }],
    ['outer domain', (value) => { value.domain_engine_id = 'other_domain'; }],
    ['outer rule count', (value) => { value.rule_count += 1; }],
    ['outer assembly digest', (value) => { value.assembly_digest = '0'.repeat(64); }],
    ['trace schema', (value) => { value.compilation_trace.schema_version = 'soulforge.compilation_trace.tampered.v0'; }],
    ['trace domain', (value) => { value.compilation_trace.domain_engine_id = 'other_domain'; }],
    ['trace adapter revision', (value) => { value.compilation_trace.domain_adapter_revision = 'tampered'; }],
    ['trace effective digest', (value) => { value.compilation_trace.effective_ruleset_digest = '0'.repeat(64); }],
    ['trace rule count', (value) => { value.compilation_trace.rule_count += 1; }],
    ['trace project pin', (value) => { value.compilation_trace.project_trace.profile_id = 'tampered-profile'; }],
    ['trace scope', (value) => { value.compilation_trace.compilation_scope.compilation_scope = 'tampered_scope'; }],
  ];
  for (const [label, mutate] of mutations) {
    const altered = structuredClone(canonical);
    mutate(altered);
    expectCode(
      CCI_ERROR_CODES.RULESET_REFUSED,
      () => configurationChangeImpactAdapter.evaluate(altered, typedFacts),
    );
    assert.ok(label);
  }
});

test('Core receipt source provenance is bound to the exact facts and source refs evaluated', () => {
  const bindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const assembled = assembleEffectiveRuleSet(configurationChangeImpactAdapter, bindings, {
    compilation_scope: 'public_synthetic',
  });
  const alteredSourceRefs = structuredClone(makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest()));
  alteredSourceRefs.core_observation_receipt.source_snapshot_refs.source_refs = ['ref:synthetic-other-source'];
  expectCode(
    CCI_ERROR_CODES.TYPED_FACTS_REFUSED,
    () => evaluate(configurationChangeImpactAdapter, assembled, alteredSourceRefs, {}, {}),
  );

  const alteredEvidence = structuredClone(makeSyntheticTypedFacts(buildConfigurationChangeImpactPublicSyntheticRequest()));
  alteredEvidence.core_observation_receipt.source_snapshot_refs.observations[0]
    .request.impact_records[0].verification_evidence[0].evidence_ref = 'ref:synthetic-altered-evidence';
  expectCode(
    CCI_ERROR_CODES.TYPED_FACTS_REFUSED,
    () => evaluate(configurationChangeImpactAdapter, assembled, alteredEvidence, {}, {}),
  );
});

test('receipt output retains the safe typed-facts identity rather than collapsing project/Profile variants', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  const firstTypedFacts = makeSyntheticTypedFacts(request);
  const firstBindings = resolveProfileBindings(null, buildConfigurationChangeImpactPublicSyntheticProjectProfile());
  const firstEffectiveRuleSet = assembleEffectiveRuleSet(configurationChangeImpactAdapter, firstBindings, {
    compilation_scope: 'public_synthetic',
  });
  const first = evaluate(configurationChangeImpactAdapter, firstEffectiveRuleSet, firstTypedFacts, {}, {});

  const alternateInput = buildConfigurationChangeImpactPublicSyntheticBindingInput(request);
  alternateInput.project_binding_ref.project_id = 'project:synthetic-configuration-change-other';
  alternateInput.project_profile.profile_id = 'synthetic-configuration-change-profile-other';
  alternateInput.source_snapshot_refs.observations[0].project_binding_ref = structuredClone(alternateInput.project_binding_ref);
  alternateInput.source_snapshot_refs.observations[0].project_profile = structuredClone(alternateInput.project_profile);
  const alternateTypedFacts = adaptConfigurationChangeImpactProjectEvidence(alternateInput);
  const alternateBindings = resolveProfileBindings(null, alternateInput.project_profile);
  const alternateEffectiveRuleSet = assembleEffectiveRuleSet(configurationChangeImpactAdapter, alternateBindings, {
    compilation_scope: 'public_synthetic',
  });
  const alternate = evaluate(configurationChangeImpactAdapter, alternateEffectiveRuleSet, alternateTypedFacts, {}, {});

  assert.notEqual(
    first.receipt.bindings.typed_facts_identity_digest,
    alternate.receipt.bindings.typed_facts_identity_digest,
  );
  assert.notDeepEqual(first, alternate);
});

test('graph reachability cannot be contradicted and an incomplete graph cannot close a change', () => {
  const contradicted = buildConfigurationChangeImpactPublicSyntheticRequest();
  const requirements = contradicted.impact_records.find((row) => row.impact_kind === 'requirements');
  requirements.impact_state = 'not_affected';
  requirements.affected_item_refs = [];
  requirements.propagation_evidence = [];
  requirements.verification_evidence = [];
  expectCode(CCI_ERROR_CODES.PROPAGATION_CONFLICT, () => evaluateThroughCore(contradicted));

  const incomplete = buildConfigurationChangeImpactPublicSyntheticRequest();
  incomplete.propagation_graph.complete = false;
  incomplete.closure.state = 'open';
  incomplete.closure.closure_evidence = [];
  const result = evaluateThroughCore(incomplete);
  assert.equal(result.assessment.overall_state, 'hold');
  assert.equal(result.assessment.evidence_claim_ceiling, 'unknown');
  assert.equal(result.domain_result.propagation_graph.complete, false);
});

test('a complete graph refuses evidence that claims propagation outside its reachable projection', () => {
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  request.propagation_graph.edges = request.propagation_graph.edges.filter(
    (edge) => edge.to_item_ref !== 'item:synthetic-closure_evidence',
  );
  expectCode(CCI_ERROR_CODES.PROPAGATION_REFUSED, () => evaluateThroughCore(request));
});

test('an incomplete graph cannot retain affected claims for an unreachable impact category', () => {
  for (const impactState of ['affected_verified', 'affected_pending', 'conflict']) {
    for (const tamperField of ['change_id', 'change_identity_digest']) {
      const request = buildConfigurationChangeImpactPublicSyntheticRequest();
      request.propagation_graph.complete = false;
      request.propagation_graph.edges = request.propagation_graph.edges.filter(
        (edge) => edge.to_item_ref !== 'item:synthetic-closure_evidence',
      );
      request.closure.state = 'open';
      request.closure.closure_evidence = [];

      const closureImpact = request.impact_records.find(
        (row) => row.impact_kind === 'closure_evidence',
      );
      closureImpact.impact_state = impactState;
      if (impactState === 'affected_pending') {
        closureImpact.verification_evidence = [];
      }
      const evidence = impactState === 'affected_pending'
        ? closureImpact.propagation_evidence[0]
        : closureImpact.verification_evidence[0];
      evidence[tamperField] = tamperField === 'change_id'
        ? 'synthetic-ecn-unrelated'
        : `sha256:${'0'.repeat(64)}`;

      expectCode(CCI_ERROR_CODES.PROPAGATION_REFUSED, () => evaluateThroughCore(request));
    }
  }
});

test('the published schema is parseable and names the same six required root fields', () => {
  const schemaPath = fileURLToPath(new URL('../schemas/configuration_change_impact_schema_v0.json', import.meta.url));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$id, 'soulforge.configuration_change_impact.input.v0');
  assert.deepEqual(schema.required, ['schema_version', 'change', 'propagation_graph', 'impact_records', 'approval', 'closure']);
  assert.equal(schema.additionalProperties, false);
});

test('the schema compiles and validates the public synthetic graph fixture', () => {
  const schemaPath = fileURLToPath(new URL('../schemas/configuration_change_impact_schema_v0.json', import.meta.url));
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
  const request = buildConfigurationChangeImpactPublicSyntheticRequest();
  assert.equal(validator(request), true, JSON.stringify(validator.errors));

  const missingGraph = structuredClone(request);
  delete missingGraph.propagation_graph;
  assert.equal(validator(missingGraph), false, 'a missing propagation graph must fail the public schema');

  const fileReference = structuredClone(request);
  fileReference.change.change_request_ref = 'file:private-change-request';
  assert.equal(validator(fileReference), false, 'a file reference must fail the public schema before runtime admission');

  const reordered = structuredClone(request);
  [reordered.impact_records[0], reordered.impact_records[1]] = [reordered.impact_records[1], reordered.impact_records[0]];
  assert.equal(validator(reordered), false, 'the fixed impact-record order must fail the public schema');

  const unresolvedClosure = structuredClone(request);
  unresolvedClosure.closure.state = 'open';
  assert.equal(validator(unresolvedClosure), false, 'an open closure must not retain closure evidence in the public schema');

  const thirtyThreeSeeds = structuredClone(request);
  thirtyThreeSeeds.change.seed_item_refs = Array.from(
    { length: 33 },
    (_, index) => `item:synthetic-seed-${String(index).padStart(2, '0')}`,
  );
  assert.equal(validator(thirtyThreeSeeds), false, '33 seed refs must fail the public schema');
  expectCode(CCI_ERROR_CODES.INPUT_REFUSED, () => makeSyntheticTypedFacts(thirtyThreeSeeds));
});

test('runtime closes canonical-order and graph-key constraints that JSON Schema cannot express', () => {
  const schemaPath = fileURLToPath(new URL('../schemas/configuration_change_impact_schema_v0.json', import.meta.url));
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(readFileSync(schemaPath, 'utf8')));

  const unsortedSeeds = buildConfigurationChangeImpactPublicSyntheticRequest();
  unsortedSeeds.change.seed_item_refs = [
    'item:synthetic-requirements',
    'item:synthetic-bom',
  ];
  assert.equal(validator(unsortedSeeds), true, 'JSON Schema cannot order reference arrays lexically');
  expectCode(CCI_ERROR_CODES.INPUT_REFUSED, () => makeSyntheticTypedFacts(unsortedSeeds));

  const unsortedNodes = buildConfigurationChangeImpactPublicSyntheticRequest();
  unsortedNodes.propagation_graph.nodes.reverse();
  assert.equal(validator(unsortedNodes), true, 'JSON Schema cannot order graph nodes by item reference');
  expectCode(CCI_ERROR_CODES.NODE_REFUSED, () => evaluateThroughCore(unsortedNodes));
});

test('the local topology names every graph, schema, contract, and adapter seam', () => {
  const topologyPath = fileURLToPath(new URL('../topology/configuration_change_impact_topology.json', import.meta.url));
  const topology = JSON.parse(readFileSync(topologyPath, 'utf8'));
  const ids = new Set(topology.nodes.map((node) => node.id));
  for (const requiredId of ['domain_contract', 'schema', 'propagation_graph', 'compiler', 'evaluator', 'manifest', 'integration_request']) {
    assert.equal(ids.has(requiredId), true, `missing topology node ${requiredId}`);
  }
  for (const node of topology.nodes) {
    const path = fileURLToPath(new URL(`../${node.path}`, import.meta.url));
    assert.equal(existsSync(path), true, `topology path must exist: ${node.path}`);
  }
});
