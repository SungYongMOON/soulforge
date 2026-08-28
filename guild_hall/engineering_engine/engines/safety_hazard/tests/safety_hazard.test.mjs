import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assessSafetyHazard,
  SAFETY_HAZARD_ERROR_CODES,
} from '../evaluator/safety_hazard.mjs';
import {
  SAFETY_HAZARD_PUBLIC_SYNTHETIC_FIXTURE,
  buildSafetyHazardPublicSyntheticRequest,
} from '../fixtures/safety_hazard_public_synthetic.mjs';

const isFrozenDeep = (value) => {
  if (!value || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isFrozenDeep);
};

test('Safety Hazard: public synthetic fixture evaluates deterministically without accepting risk', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const before = structuredClone(request);
  const first = assessSafetyHazard(request);
  const second = assessSafetyHazard(buildSafetyHazardPublicSyntheticRequest());

  assert.deepEqual(request, before, 'the evaluator must not mutate its caller input');
  assert.deepEqual(first, second, 'the same public fixture must replay byte-for-byte');
  assert.ok(isFrozenDeep(first), 'result must be deeply frozen');
  assert.deepEqual(
    Object.fromEntries(first.domain_result.results.map((row) => [row.case_id, row.state])),
    SAFETY_HAZARD_PUBLIC_SYNTHETIC_FIXTURE.expected.states_by_case,
  );
  assert.deepEqual(first.domain_result.counts, SAFETY_HAZARD_PUBLIC_SYNTHETIC_FIXTURE.expected.counts);
  assert.equal(first.assessment.overall_state, 'evidence_gaps_require_human_review');
  assert.equal(first.receipt.effects.acceptance_actions, 0);
  assert.equal(first.receipt.effects.human_authority_mutations, 0);
  assert.equal(first.receipt.effects.filesystem_reads, 0);
  assert.equal(first.receipt.effects.filesystem_writes, 0);
  assert.equal(first.receipt.effects.network_calls, 0);
  assert.equal(first.receipt.effects.model_calls, 0);
  assert.equal(JSON.stringify(first).includes('risk_accepted'), false);
  assert.equal(JSON.stringify(first).includes('accepted_by_engine'), false);
  assert.equal(JSON.stringify(first).includes('authority_decision'), false);
});

test('Safety Hazard: row order is normalized before digesting and evaluation', () => {
  const baseline = assessSafetyHazard(buildSafetyHazardPublicSyntheticRequest());
  const reordered = buildSafetyHazardPublicSyntheticRequest();
  reordered.domain_input.rows.reverse();
  const replay = assessSafetyHazard(reordered);

  assert.deepEqual(replay, baseline);
  assert.equal(replay.receipt.digests.input_sha256, baseline.receipt.digests.input_sha256);
});

test('Safety Hazard: explicit non-applicability needs an exact basis ref', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const row = request.domain_input.rows.find((candidate) => candidate.case_id === 'HAZARD_IDENTITY');
  row.applicability.project_binding = false;
  row.not_applicable_basis_ref = structuredClone(row.evidence.hazard_identity_ref);

  const result = assessSafetyHazard(request);
  const observed = result.domain_result.results.find((candidate) => candidate.case_id === 'HAZARD_IDENTITY');
  assert.equal(observed.state, 'not_applicable');
  assert.equal(observed.evidence_claim_ceiling, 'not_applicable');
});

test('Safety Hazard: a non-human authority is refused rather than treated as acceptance evidence', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const row = request.domain_input.rows.find((candidate) => candidate.case_id === 'HUMAN_AUTHORITY_EVIDENCE');
  row.acceptance_authority_binding.authority_kind = 'ai_agent';

  assert.throws(
    () => assessSafetyHazard(request),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.ACCEPTANCE_AUTHORITY_NOT_HUMAN,
  );
});

test('Safety Hazard: a closed lifecycle row with no closure evidence remains a missing-evidence result', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const row = request.domain_input.rows.find((candidate) => candidate.case_id === 'CLOSURE_EVIDENCE');
  row.presence_state = 'absence_confirmed';
  row.evidence = {};

  const result = assessSafetyHazard(request);
  const observed = result.domain_result.results.find((candidate) => candidate.case_id === 'CLOSURE_EVIDENCE');
  assert.equal(observed.state, 'gap_missing');
  assert.ok(observed.missing_evidence_fields.includes('closure_evidence_ref'));
});

test('Safety Hazard: mismatched source binding and private-path sentinel fail closed', () => {
  const mismatched = buildSafetyHazardPublicSyntheticRequest();
  mismatched.binding.source_packet_ref.revision_id = 'r999';
  assert.throws(
    () => assessSafetyHazard(mismatched),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED,
  );

  const hostile = buildSafetyHazardPublicSyntheticRequest();
  hostile.domain_input.rows[0].case_id = ['C:', 'private', 'hazard'].join('\\');
  assert.throws(
    () => assessSafetyHazard(hostile),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
  );
});

test('Safety Hazard: accessor-backed hostile input is refused without invoking the accessor', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  Object.defineProperty(request.domain_input.rows[0], 'case_id', {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error('hostile accessor must not run');
    },
  });

  assert.throws(
    () => assessSafetyHazard(request),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
  );
});

test('Safety Hazard: floating revisions and secret-like strings are refused', () => {
  const floating = buildSafetyHazardPublicSyntheticRequest();
  floating.binding.common_knowledge_revision = 'latest';
  assert.throws(
    () => assessSafetyHazard(floating),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.BINDING_REFUSED,
  );

  const secretLike = buildSafetyHazardPublicSyntheticRequest();
  secretLike.domain_input.rows[0].case_id = 'Bearer synthetic-token-value';
  assert.throws(
    () => assessSafetyHazard(secretLike),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
  );
});

test('Safety Hazard: a valid source conflict outranks rule-ineligible lifecycle and unclassified risk states', () => {
  const request = buildSafetyHazardPublicSyntheticRequest();
  const sourceConflict = request.domain_input.rows.find((candidate) => candidate.case_id === 'VERIFICATION_CONFLICT');
  const target = request.domain_input.rows.find((candidate) => candidate.case_id === 'RISK_MISSING');
  target.lifecycle_status = 'identified';
  target.risk_characterization.risk = 'unclassified';
  target.conflict_claims = structuredClone(sourceConflict.conflict_claims);

  const result = assessSafetyHazard(request);
  const observed = result.domain_result.results.find((candidate) => candidate.case_id === 'RISK_MISSING');
  assert.equal(observed.state, 'gap_conflict');
  assert.equal(observed.conflict_claim_count, 2);
  assert.equal(observed.governing_authority_family, 'project_contract_baseline');
});

test('Safety Hazard: malformed lifecycle and risk literals remain input refusals even when conflict evidence is present', () => {
  const lifecycle = buildSafetyHazardPublicSyntheticRequest();
  const sourceConflict = lifecycle.domain_input.rows.find((candidate) => candidate.case_id === 'VERIFICATION_CONFLICT');
  const lifecycleTarget = lifecycle.domain_input.rows.find((candidate) => candidate.case_id === 'RISK_MISSING');
  lifecycleTarget.lifecycle_status = 'not-a-lifecycle-token';
  lifecycleTarget.conflict_claims = structuredClone(sourceConflict.conflict_claims);
  assert.throws(
    () => assessSafetyHazard(lifecycle),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
  );

  const risk = buildSafetyHazardPublicSyntheticRequest();
  const riskSourceConflict = risk.domain_input.rows.find((candidate) => candidate.case_id === 'VERIFICATION_CONFLICT');
  const riskTarget = risk.domain_input.rows.find((candidate) => candidate.case_id === 'RISK_MISSING');
  riskTarget.risk_characterization.risk = 'not-a-risk-token';
  riskTarget.conflict_claims = structuredClone(riskSourceConflict.conflict_claims);
  assert.throws(
    () => assessSafetyHazard(risk),
    (error) => error.code === SAFETY_HAZARD_ERROR_CODES.INPUT_REFUSED,
  );
});

test('Safety Hazard: zero-write runner emits deterministic JSON only', () => {
  const runner = fileURLToPath(new URL('../tools/safety_hazard_runner.mjs', import.meta.url));
  const first = spawnSync(process.execPath, [runner], { encoding: 'utf8' });
  const second = spawnSync(process.execPath, [runner], { encoding: 'utf8' });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stderr, '');
  assert.equal(first.stdout, second.stdout);
  const result = JSON.parse(first.stdout);
  assert.equal(result.receipt.effects.filesystem_reads, 0);
  assert.equal(result.receipt.effects.filesystem_writes, 0);
  assert.equal(result.receipt.effects.network_calls, 0);
  assert.equal(result.receipt.effects.rag_queries, 0);
});
