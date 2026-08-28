import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleEffectiveRuleSet, resolveProfileBindings } from '../../../core/interfaces/domain_engine_adapter.mjs';
import {
  buildQualityReadinessTypedFacts,
  qualityReadinessCanonicalDataDigest,
} from '../binding/quality_readiness_typed_facts.mjs';
import {
  qualityReadinessAdapter,
  verifyQualityReadinessAssessmentResult,
} from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { verifyQualityReadinessAssessmentResultShape } from '../evaluator/quality_readiness.mjs';
import {
  buildQualityReadinessDeepeningPublicSynthetic,
  qualityReadinessSyntheticRef,
} from '../fixtures/quality_readiness_deepening_public_synthetic.mjs';
import { buildQualityReadinessPublicSyntheticRequest } from '../fixtures/quality_readiness_public_synthetic.mjs';
import { buildQualityReadinessGuidance, QUALITY_READINESS_GUIDANCE_CODES } from '../guidance/quality_readiness_guidance.mjs';
import { callQualityReadinessReadTool, QUALITY_READINESS_MCP_CODES } from '../mcp/quality_readiness_read_tools.mjs';
import {
  projectQualityReadinessObservations,
  QUALITY_READINESS_OBSERVATION_CODES,
} from '../observation/quality_readiness_observation.mjs';
import {
  QUALITY_READINESS_RULES,
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_SOURCE_PACKET_REF,
} from '../rules/quality_readiness_rules.mjs';

const deepFrozen = (value) => {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
};

function assessmentChain() {
  const fixture = buildQualityReadinessDeepeningPublicSynthetic();
  const assessment = qualityReadinessAdapter.evaluate(fixture.assembly, fixture.typed_facts, {}, {});
  const replayContext = { effective_rule_set: fixture.assembly, typed_facts: fixture.typed_facts };
  const observationInput = {
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_run_ref: qualityReadinessSyntheticRef('qr-replay-verifier-observation', 'r1', 'a'),
    known_at: fixture.typed_facts.typed_project_facts.known_at,
  };
  const observation = projectQualityReadinessObservations(observationInput);
  const guidanceInput = {
    effective_rule_set: fixture.assembly,
    typed_facts: fixture.typed_facts,
    assessment_run: assessment,
    observation_projection: observation,
  };
  const guidance = buildQualityReadinessGuidance(guidanceInput);
  return { fixture, assessment, replayContext, observation, guidance, observationInput, guidanceInput };
}

function recloseAssessmentOutputDigests(assessment) {
  assessment.receipt.digests.assessment_sha256 = qualityReadinessCanonicalDataDigest(
    assessment.assessment,
    'soulforge.quality_readiness.assessment.v0',
  );
  assessment.receipt.digests.domain_result_sha256 = qualityReadinessCanonicalDataDigest(
    assessment.domain_result,
    'soulforge.quality_readiness.domain_result.v0',
  );
  return assessment;
}

function distinctReplayContext(fixture) {
  const profile = structuredClone(fixture.profile);
  profile.profile_id = 'qr_public_synthetic_org_replay_b';
  const [binding] = resolveProfileBindings(profile, null);
  const assembly = assembleEffectiveRuleSet(qualityReadinessAdapter, [binding], {});
  const request = structuredClone(fixture.request);
  request.binding.ruleset_ref = structuredClone(assembly.effective_rule_set.ruleset_ref);
  request.binding.ruleset_revision = assembly.effective_rule_set.ruleset_ref.revision_id;
  const typed_facts = buildQualityReadinessTypedFacts({
    request,
    compilation_trace: assembly.compilation_trace,
    valid_at: fixture.typed_facts.typed_project_facts.valid_at,
    known_at: fixture.typed_facts.typed_project_facts.known_at,
  });
  return { effective_rule_set: assembly, typed_facts };
}

function baseEffectiveRuleSet() {
  return {
    schema_version: 'soulforge.quality_readiness.ruleset.v0',
    ruleset_ref: structuredClone(QUALITY_READINESS_RULESET_REF),
    source_packet_ref: structuredClone(QUALITY_READINESS_SOURCE_PACKET_REF),
    rules: structuredClone(QUALITY_READINESS_RULES),
  };
}

function assertAllDownstreamReject({ fixture, assessment, observation, guidance }) {
  assert.throws(
    () => verifyQualityReadinessAssessmentResult(assessment, {
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
    }),
    (error) => error?.code === 'QR_EVALUATION_INPUT_REFUSED',
  );
  assert.throws(
    () => projectQualityReadinessObservations({
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
      assessment_run: assessment,
      observation_run_ref: qualityReadinessSyntheticRef('qr-replay-verifier-forged-observation', 'r1', 'b'),
      known_at: fixture.typed_facts.typed_project_facts.known_at,
    }),
    (error) => error?.code === QUALITY_READINESS_OBSERVATION_CODES.BOUNDARY,
  );
  assert.throws(
    () => buildQualityReadinessGuidance({
      effective_rule_set: fixture.assembly,
      typed_facts: fixture.typed_facts,
      assessment_run: assessment,
      observation_projection: observation,
    }),
    (error) => error?.code === QUALITY_READINESS_GUIDANCE_CODES.BOUNDARY,
  );
  assert.throws(
    () => callQualityReadinessReadTool({
      name: 'observe_status',
      input: {
        effective_rule_set: fixture.assembly,
        typed_facts: fixture.typed_facts,
        assessment_run: assessment,
        observation_projection: observation,
      },
    }),
    (error) => error?.code === QUALITY_READINESS_MCP_CODES.REQUEST_INVALID,
  );
  assert.throws(
    () => callQualityReadinessReadTool({
      name: 'guidance_next_steps',
      input: {
        effective_rule_set: fixture.assembly,
        typed_facts: fixture.typed_facts,
        assessment_run: assessment,
        observation_projection: observation,
        guidance,
      },
    }),
    (error) => error?.code === QUALITY_READINESS_MCP_CODES.REQUEST_INVALID,
  );
}

test('B3: fixed-point replay rejects self-rehashed results at every dependent QR seam', () => {
  const { fixture, assessment, observation, guidance } = assessmentChain();
  const forged = structuredClone(assessment);
  forged.domain_result.results[0].reason_code = 'context_facts_missing';
  recloseAssessmentOutputDigests(forged);
  assert.equal(verifyQualityReadinessAssessmentResultShape(forged).domain_result.results[0].reason_code, 'context_facts_missing');
  assertAllDownstreamReject({ fixture, assessment: forged, observation, guidance });
});

test('B3: fixed-point replay covers input/binding digests, receipt binding keys, and both Core cutoff modes', () => {
  const { fixture, assessment, replayContext } = assessmentChain();
  const before = JSON.stringify({ fixture: fixture.typed_facts, context: replayContext });
  const verified = verifyQualityReadinessAssessmentResult(assessment, replayContext);
  assert.equal(deepFrozen(verified), true);
  assert.equal(JSON.stringify({ fixture: fixture.typed_facts, context: replayContext }), before);
  const withCoreCutoffs = qualityReadinessAdapter.evaluate(
    fixture.assembly,
    fixture.typed_facts,
    {},
    structuredClone(fixture.typed_facts.assessment_context.cutoffs),
  );
  assert.equal(withCoreCutoffs.receipt.bindings.core_supplied_cutoffs_match, true);
  assert.equal(
    JSON.stringify(verifyQualityReadinessAssessmentResult(withCoreCutoffs, replayContext)),
    JSON.stringify(withCoreCutoffs),
  );
  for (const mutate of [
    (result) => { result.receipt.digests.input_sha256 = '1'.repeat(64); },
    (result) => { result.receipt.digests.binding_sha256 = '2'.repeat(64); },
    (result) => { delete result.receipt.bindings.typed_facts_sha256; },
    (result) => { result.receipt.bindings.unexpected = true; },
    (result) => { delete result.receipt.bindings.module_binding_revision; },
    (result) => { result.receipt.bindings.core_supplied_cutoffs_match = false; },
  ]) {
    const forged = structuredClone(withCoreCutoffs);
    mutate(forged);
    assert.throws(() => verifyQualityReadinessAssessmentResult(forged, replayContext));
  }
  for (const mutate of [
    (result) => { delete result.receipt.schema_version; },
    (result) => { result.receipt.unexpected = true; },
    (result) => { delete result.receipt.digests.assessment_sha256; },
    (result) => { result.receipt.digests.unexpected = '3'.repeat(64); },
    (result) => { result.receipt.counts.total += 1; },
    (result) => { result.receipt.effects.network = 1; },
    (result) => { result.receipt.bindings.evaluation_input_lane = 'base_raw_request'; },
  ]) {
    const forged = structuredClone(assessment);
    mutate(forged);
    assert.throws(() => verifyQualityReadinessAssessmentResult(forged, replayContext));
  }
  const baseAssessment = qualityReadinessAdapter.evaluate(
    baseEffectiveRuleSet(),
    buildQualityReadinessPublicSyntheticRequest(),
    {},
  );
  assert.equal(verifyQualityReadinessAssessmentResultShape(baseAssessment).receipt.bindings.evaluation_input_lane, 'base_raw_request');
  for (const mutate of [
    (result) => { delete result.receipt.bindings.module_binding_revision; },
    (result) => { result.receipt.bindings.unexpected = true; },
  ]) {
    const forged = structuredClone(baseAssessment);
    mutate(forged);
    assert.throws(() => verifyQualityReadinessAssessmentResultShape(forged));
  }
});

test('B4: fixed-point replay refuses raised lanes, cross-paired replay material, and hostile replay wrappers', () => {
  const { fixture, assessment, replayContext } = assessmentChain();
  const laneFlip = structuredClone(assessment);
  laneFlip.receipt.bindings.profile_evaluation_lane = 'official_public';
  for (const result of laneFlip.domain_result.results) result.canon_claim_ceiling = 'source_supported';
  laneFlip.assessment.canon_claim_ceiling = 'source_supported';
  laneFlip.domain_result.canon_claim_ceiling = 'source_supported';
  recloseAssessmentOutputDigests(laneFlip);
  assert.equal(verifyQualityReadinessAssessmentResultShape(laneFlip).assessment.canon_claim_ceiling, 'source_supported');
  assert.throws(() => verifyQualityReadinessAssessmentResult(laneFlip, replayContext));

  const replayB = distinctReplayContext(fixture);
  assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, replayB));
  assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, {
    effective_rule_set: fixture.assembly,
    typed_facts: replayB.typed_facts,
  }));
  assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, {
    effective_rule_set: replayB.effective_rule_set,
    typed_facts: fixture.typed_facts,
  }));
  for (const context of [
    { typed_facts: fixture.typed_facts },
    { effective_rule_set: fixture.assembly, typed_facts: fixture.typed_facts, extra: true },
  ]) assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, context));

  let proxyTraps = 0;
  const proxy = new Proxy({}, {
    get() { proxyTraps += 1; throw new Error('replay context Proxy trap must not run'); },
    ownKeys() { proxyTraps += 1; throw new Error('replay context Proxy trap must not run'); },
  });
  assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, proxy));
  assert.equal(proxyTraps, 0);
  let accessorTraps = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'effective_rule_set', {
    enumerable: true,
    get() { accessorTraps += 1; throw new Error('replay context accessor must not run'); },
  });
  Object.defineProperty(accessor, 'typed_facts', { enumerable: true, value: fixture.typed_facts });
  assert.throws(() => verifyQualityReadinessAssessmentResult(assessment, accessor));
  assert.equal(accessorTraps, 0);
});
