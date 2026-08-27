import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessReliabilityMaintainability,
  verifyReliabilityMaintainabilityResult,
} from '../evaluator/reliability_maintainability.mjs';
import {
  verifyReliabilityMaintainabilityResult as verifyFromAdapter,
} from '../evaluator/reliability_maintainability_evaluator_adapter.mjs';
import {
  buildReliabilityMaintainabilityPublicSyntheticRequest,
} from '../fixtures/reliability_maintainability_public_synthetic.mjs';
import {
  compileReliabilityMaintainabilityRules,
} from '../compiler/reliability_maintainability_compiler_adapter.mjs';

function baseRuleset() {
  return structuredClone(compileReliabilityMaintainabilityRules([]).effective_rule_set);
}

test('RED B5: verifyReliabilityMaintainabilityResult is exported from evaluator and adapter', () => {
  assert.equal(typeof verifyReliabilityMaintainabilityResult, 'function');
  assert.equal(typeof verifyFromAdapter, 'function');
});

test('RED B5: verifyReliabilityMaintainabilityResult verifies valid evaluation result against trusted input', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const ruleset = baseRuleset();
  const result = assessReliabilityMaintainability(request);

  const verification = verifyReliabilityMaintainabilityResult(result, ruleset, request);
  assert.equal(verification.verified, true);
  assert.deepEqual(verification.ruleset_ref, result.receipt.bindings.ruleset_ref);
  assert.deepEqual(verification.source_packet_ref, result.receipt.bindings.source_packet_ref);
  assert.deepEqual(verification.digests, result.receipt.digests);
});

test('RED B5: verification fails if trusted input is missing or malformed', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const ruleset = baseRuleset();
  const result = assessReliabilityMaintainability(request);

  assert.throws(
    () => verifyReliabilityMaintainabilityResult(result, ruleset, null),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(result, ruleset, undefined),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
});

test('RED B5: verification rejects claim-only mutations, state tampering, effect tampering, and digest tampering', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const ruleset = baseRuleset();
  const result = assessReliabilityMaintainability(request);

  // 1. Claim-only mutation on assessment
  const forgedCeiling = structuredClone(result);
  forgedCeiling.assessment.canon_claim_ceiling = 'observed';
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(forgedCeiling, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 2. Result state mutation
  const forgedState = structuredClone(result);
  forgedState.domain_result.results[0].state = 'satisfied';
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(forgedState, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 3. Non-zero effects in receipt
  const forgedEffects = structuredClone(result);
  forgedEffects.receipt.effects.filesystem = 1;
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(forgedEffects, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 4. Tampered binding in receipt
  const forgedBinding = structuredClone(result);
  forgedBinding.receipt.bindings.ruleset_ref.content_id = 'sha256:' + 'f'.repeat(64);
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(forgedBinding, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 5. Rehashed digest mutation (tampering outcome and recomputing receipt digests)
  const rehashed = structuredClone(result);
  rehashed.domain_result.results[0].state = 'satisfied';
  rehashed.receipt.digests.domain_result_sha256 = '0'.repeat(64);
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(rehashed, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
});

test('RED Blocker 3: Zero-trap hostile inputs, extra ruleset keys, and custom prototypes fail with declared R&M errors', () => {
  const request = buildReliabilityMaintainabilityPublicSyntheticRequest();
  const ruleset = baseRuleset();
  const result = assessReliabilityMaintainability(request);

  // Proxy rawResult
  let resultTrapHits = 0;
  const proxyResult = new Proxy(structuredClone(result), {
    get() { resultTrapHits += 1; throw new Error('trap'); },
  });
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(proxyResult, ruleset, request),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
  assert.equal(resultTrapHits, 0);

  // Proxy suppliedEffectiveRuleSet
  let rulesetTrapHits = 0;
  const proxyRuleset = new Proxy(baseRuleset(), {
    get() { rulesetTrapHits += 1; throw new Error('trap'); },
  });
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(result, proxyRuleset, request),
    (err) => err.code === 'RM_EFFECTIVE_RULESET_INVALID' || err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
  assert.equal(rulesetTrapHits, 0);

  // Proxy rawTrustedInput
  let inputTrapHits = 0;
  const proxyInput = new Proxy(buildReliabilityMaintainabilityPublicSyntheticRequest(), {
    get() { inputTrapHits += 1; throw new Error('trap'); },
  });
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(result, ruleset, proxyInput),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
  assert.equal(inputTrapHits, 0);

  // Extra keys on supplied effective ruleset
  const extraKeyRuleset = { ...baseRuleset(), attacker: true };
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(result, extraKeyRuleset, request),
    (err) => err.code === 'RM_EFFECTIVE_RULESET_INVALID' || err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
});

test('RED Blocker 3: Real Core TypedProjectFacts verification, provenance tampering rejection, and deep-frozen detached return', async () => {
  const VALID_AT = '2026-08-26T00:00:00.000Z';
  const KNOWN_AT = '2026-08-26T00:00:01.000Z';
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;

  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-verification-v0',
    authority_family: 'project_contract_baseline',
    document_refs: ['doc-v1', 'doc-v2'],
    valid_at: VALID_AT,
    known_at: KNOWN_AT,
  };

  const { adaptProjectEvidence } = await import('../../../core/interfaces/domain_engine_adapter.mjs');
  const typedFacts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const ruleset = baseRuleset();
  const coreResult = verifyFromAdapter
    ? (await import('../evaluator/reliability_maintainability_evaluator_adapter.mjs')).reliabilityMaintainabilityAdapter.evaluate(ruleset, typedFacts)
    : null;

  // Real Core TypedProjectFacts verification succeeds
  const verification = verifyReliabilityMaintainabilityResult(coreResult, ruleset, typedFacts);
  assert.equal(verification.verified, true);
  assert.equal(Object.isFrozen(verification), true);
  assert.equal(Object.isFrozen(verification.ruleset_ref), true);
  assert.equal(Object.isFrozen(verification.source_packet_ref), true);
  assert.equal(Object.isFrozen(verification.digests), true);
  assert.notEqual(verification.ruleset_ref, coreResult.receipt.bindings.ruleset_ref);
  assert.notEqual(verification.source_packet_ref, coreResult.receipt.bindings.source_packet_ref);
  assert.notEqual(verification.digests, coreResult.receipt.digests);

  // Provenance tampering in domain_result is rejected
  const tamperedProvResult = structuredClone(coreResult);
  tamperedProvResult.domain_result.project_facts_provenance.project_binding_ref.source_manifest_ref = 'forged-manifest';
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(tamperedProvResult, ruleset, typedFacts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // Verified output is detached: mutations on input do not affect verification object
  assert.throws(() => {
    verification.verified = false;
  }, TypeError);
  assert.throws(() => {
    verification.digests.input_sha256 = 'tampered';
  }, TypeError);
});

test('RED: verifyReliabilityMaintainabilityResult rejects cross-envelope results and bare-vs-envelope mismatches', async () => {
  const VALID_AT = '2026-08-26T00:00:00.000Z';
  const KNOWN_AT = '2026-08-26T00:00:01.000Z';
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;

  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-verification-v0',
  };

  const { adaptProjectEvidence, assembleEffectiveRuleSet, resolveProfileBindings } = await import('../../../core/interfaces/domain_engine_adapter.mjs');
  const { normalizeProfileOperations } = await import('../../../core/interfaces/profile_operation_canon.mjs');
  const { reliabilityMaintainabilityAdapter } = await import('../evaluator/reliability_maintainability_evaluator_adapter.mjs');

  const typedFacts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [req] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const profileA = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'rm_profile_zero_alpha',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_a_v1',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ['profile-source-alpha'],
    order: 0,
    operations: [],
  };

  const profileB = {
    schema_version: 'soulforge.engineering_profile_binding.v0',
    profile_kind: 'organization',
    profile_id: 'rm_profile_zero_beta',
    domain_engine_id: 'reliability_maintainability',
    revision_or_hash: 'rev_b_v1',
    extends_or_base_pin: 'rm_base:v0',
    operation_digest: normalizeProfileOperations([]).operation_digest,
    source_refs: ['profile-source-beta'],
    order: 0,
    operations: [],
  };

  const envA = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(profileA, null), {});
  const envB = assembleEffectiveRuleSet(reliabilityMaintainabilityAdapter, resolveProfileBindings(profileB, null), {});
  const bareRuleset = baseRuleset();

  const resultA = reliabilityMaintainabilityAdapter.evaluate(envA, typedFacts);
  const resultBare = reliabilityMaintainabilityAdapter.evaluate(bareRuleset, typedFacts);

  // Cross verification between envA result and envB envelope fails
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(resultA, envB, typedFacts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // Cross verification between envA result and bare ruleset fails
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(resultA, bareRuleset, typedFacts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // Cross verification between bare result and envA envelope fails
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(resultBare, envA, typedFacts),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // Matching verifications succeed
  assert.doesNotThrow(() => {
    verifyReliabilityMaintainabilityResult(resultA, envA, typedFacts);
  });
  assert.doesNotThrow(() => {
    verifyReliabilityMaintainabilityResult(resultBare, bareRuleset, typedFacts);
  });
});

test('RED: verifyReliabilityMaintainabilityResult verifies source-native null results and rejects null-tampering/omission', async () => {
  const VALID_AT = '2026-08-26T00:00:00.000Z';
  const KNOWN_AT = '2026-08-26T00:00:01.000Z';
  const req = buildReliabilityMaintainabilityPublicSyntheticRequest();
  req.cutoffs.valid_at = VALID_AT;
  req.cutoffs.known_at = KNOWN_AT;
  const relRow = req.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  relRow.evidence_kind = null;

  const ruleset = baseRuleset();
  const directResult = assessReliabilityMaintainability(req);

  // 1. Direct result verification with direct request trusted input
  const directVerify = verifyReliabilityMaintainabilityResult(directResult, ruleset, req);
  assert.equal(directVerify.verified, true);
  assert.deepEqual(directVerify.digests, directResult.receipt.digests);

  // 2. Core TypedProjectFacts verification with source-native projection
  const coreBinding = {
    schema_version: 'soulforge.project_binding.v0',
    project_id: req.binding.project_binding_ref.entity_id,
    domain_engine_id: 'reliability_maintainability',
    binding_revision_hash: req.binding.project_binding_ref.revision_id,
    source_manifest_ref: 'manifest-verification-v0',
  };

  const reqForFacts = structuredClone(req);
  const rowForFacts = reqForFacts.domain_input.rows.find((r) => r.case_id === 'RELIABILITY_SATISFIED');
  delete rowForFacts.evidence_kind;
  rowForFacts.evidence_kind_projection = 'source_native';

  const { adaptProjectEvidence } = await import('../../../core/interfaces/domain_engine_adapter.mjs');
  const typedFacts = adaptProjectEvidence(
    coreBinding,
    { source_refs: ['synthetic-core-rm-source-v1'], observations: [reqForFacts] },
    { valid_at: VALID_AT, known_at: KNOWN_AT },
  ).typed_project_facts;

  const { reliabilityMaintainabilityAdapter } = await import('../evaluator/reliability_maintainability_evaluator_adapter.mjs');
  const coreResult = reliabilityMaintainabilityAdapter.evaluate(ruleset, typedFacts);

  const coreVerify = verifyReliabilityMaintainabilityResult(coreResult, ruleset, typedFacts);
  assert.equal(coreVerify.verified, true);
  assert.deepEqual(coreVerify.digests, coreResult.receipt.digests);

  // 3. Result tampering: mutating evidence_kind null to concrete string is rejected
  const tamperedKind = structuredClone(directResult);
  tamperedKind.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind = 'reliability_allocation_model';
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(tamperedKind, ruleset, req),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 4. Result tampering: omitting evidence_kind is rejected
  const tamperedOmit = structuredClone(directResult);
  delete tamperedOmit.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind;
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(tamperedOmit, ruleset, req),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );

  // 5. Result tampering: replacing null with marker object { source_native: true } is rejected
  const tamperedMarker = structuredClone(directResult);
  tamperedMarker.domain_result.results.find((r) => r.case_id === 'RELIABILITY_SATISFIED').evidence_kind = { source_native: true };
  assert.throws(
    () => verifyReliabilityMaintainabilityResult(tamperedMarker, ruleset, req),
    (err) => err.code === 'RELIABILITY_MAINTAINABILITY_INPUT_REFUSED',
  );
});
