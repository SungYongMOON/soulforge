import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashWorkIntakeFacts } from '../src/work_intake_adapter.mjs';
import { runWorkIntakeRelationPair, evaluateWorkIntakeRelationPair,
  evaluateWorkIntakeRun, compareWorkIntakeEvaluations } from '../src/work_intake_evaluation.mjs';
import { scriptedJudge } from './work_intake_test_helpers.mjs';
import { workIntakeRelationFixtures, hashFixtureValue, fixtureRevisionCanonicalBytes,
  fixtureRevisionSha256, correctScriptedJudge, constantNewScriptedJudge,
  missingEvidenceScriptedJudge } from './work_intake_relation_fixtures.mjs';

const inputs = (fixture) => ({ before: fixture.beforeInput, after: fixture.afterInput });
const controls = (fixture, factory = correctScriptedJudge) => ({ before: factory(fixture.correctAnswers.before), after: factory(fixture.correctAnswers.after) });
const evaluate = (pair, fixture) => evaluateWorkIntakeRelationPair(pair, fixture.contract, fixture.contract_sha256);
const run = (fixture, factory) => runWorkIntakeRelationPair(inputs(fixture), controls(fixture, factory));
const repin = (fixture) => {
  fixture.contract = structuredClone(fixture.contract);
  fixture.contract.before_input_sha256 = hashFixtureValue(fixture.beforeInput);
  fixture.contract.after_input_sha256 = hashFixtureValue(fixture.afterInput);
  fixture.contract_sha256 = hashFixtureValue(fixture.contract);
};

test('three independently frozen valid relation pairs pass the scripted correct control', async () => {
  assert.equal(createHash('sha256').update(fixtureRevisionCanonicalBytes).digest('hex'), fixtureRevisionSha256);
  const fixtures = workIntakeRelationFixtures();
  assert.equal(fixtures.length, 3);
  for (const fixture of fixtures) {
    for (const side of ['before', 'after']) {
      const input = fixture[`${side}Input`], event = input.events[0];
      assert.equal(hashWorkIntakeFacts(event.facts), event.facts_sha256);
      assert.equal(createHash('sha256').update(fixture.sourceRevisionCanonicalBytes[side]).digest('hex'), event.revision_sha256);
      assert.equal(hashWorkIntakeFacts(input), fixture.contract[`${side}_input_sha256`]);
    }
    const pair = await run(fixture), result = evaluate(pair, fixture);
    assert.equal(pair.before.status, 'COMPLETED'); assert.equal(pair.after.status, 'COMPLETED');
    assert.equal(result.outcome, 'PASS', JSON.stringify(result));
    assert.equal(result.measured_model_utility, false);
    assert.equal(result.claim, 'contract_fixture_only');
    assert.equal(result.fixture_revision_sha256, fixtureRevisionSha256);
    assert.equal(result.contract_sha256, fixture.contract_sha256);
    assert.equal(result.rows.every((row) => row.input_valid && row.output_valid), true);
  }
});

test('task absent, open and completed context produce distinct frozen outcomes', async () => {
  const fixture = workIntakeRelationFixtures()[2];
  const opened = evaluate(await run(fixture), fixture);
  const completed = evaluate(await run(fixture.completedObservation), fixture.completedObservation);
  assert.equal(opened.outcome, 'PASS'); assert.equal(completed.outcome, 'PASS');
  assert.deepEqual(opened.rows.map((row) => row.classification), ['NEW', 'FOLLOW_UP']);
  assert.deepEqual(completed.rows.map((row) => row.classification), ['NEW', 'NO_ACTION']);
  assert.equal(opened.rows[0].input_sha256, completed.rows[0].input_sha256);
  assert.notEqual(opened.rows[1].input_sha256, completed.rows[1].input_sha256);
});

test('constant NEW is sensitive to neither withdrawal nor task context and fails those valid-output relations', async () => {
  const outcomes = [];
  for (const fixture of workIntakeRelationFixtures()) {
    const result = evaluate(await run(fixture, constantNewScriptedJudge), fixture);
    outcomes.push(result.outcome);
    assert.equal(result.rows.every((row) => row.input_valid && row.output_valid), true);
  }
  assert.deepEqual(outcomes, ['PASS', 'SEMANTIC_MISMATCH', 'SEMANTIC_MISMATCH']);
});

test('missing judge evidence is output validation failure, never semantic mismatch or pass', async () => {
  for (const fixture of workIntakeRelationFixtures()) {
    const result = evaluate(await run(fixture, missingEvidenceScriptedJudge), fixture);
    assert.equal(result.outcome, 'OUTPUT_VALIDATION_FAILED', JSON.stringify(result));
    assert.equal(result.passed, false);
    assert.equal(result.rows.every((row) => row.input_valid && !row.output_valid), true);
    assert.deepEqual(result.checks, { classification: null, task: null, action: null });
    assert.ok(result.rows.every((row) => row.reason_codes.includes('INVALID_JUDGE_OUTPUT')));
  }
});

test('constant NEW with the matching known task is rejected by the unchanged adapter output contract', async () => {
  const fixture = workIntakeRelationFixtures()[2];
  const pair = await runWorkIntakeRelationPair(inputs(fixture), {
    before: correctScriptedJudge(fixture.correctAnswers.before),
    after: scriptedJudge({ task_semantic_sha256: fixture.correctAnswers.before.task_semantic_sha256 }),
  });
  const result = evaluate(pair, fixture);
  assert.equal(result.outcome, 'OUTPUT_VALIDATION_FAILED');
  assert.equal(result.rows[1].input_valid, true);
  assert.ok(result.rows[1].reason_codes.includes('EXISTING_TASK_MISCLASSIFIED_NEW'));
});

test('paraphrase requires stable task and action identity as well as classification', async () => {
  for (const semanticKey of ['task_semantic_sha256', 'action_semantic_sha256']) {
    const fixture = workIntakeRelationFixtures()[0];
    const pair = await runWorkIntakeRelationPair(inputs(fixture), {
      before: correctScriptedJudge(fixture.correctAnswers.before),
      after: correctScriptedJudge({ ...fixture.correctAnswers.after, [semanticKey]: 'e'.repeat(64) }),
    });
    const result = evaluate(pair, fixture);
    assert.equal(result.outcome, 'SEMANTIC_MISMATCH');
    assert.equal(result.checks.classification, true);
    assert.equal(result.checks[semanticKey.split('_')[0]], false);
  }
});

test('failed execution and valid explicit HOLD remain distinct from malformed output', async () => {
  const fixture = workIntakeRelationFixtures()[0];
  const failed = await runWorkIntakeRelationPair(inputs(fixture), { before: async () => { throw new Error('synthetic'); }, after: correctScriptedJudge(fixture.correctAnswers.after) });
  assert.equal(evaluate(failed, fixture).outcome, 'JUDGE_EXECUTION_FAILED');
  const held = await runWorkIntakeRelationPair(inputs(fixture), {
    before: correctScriptedJudge(fixture.correctAnswers.before),
    after: scriptedJudge({ classification: 'HOLD', reason_code: 'INSUFFICIENT_EVIDENCE', task_semantic_sha256: null, action_semantic_sha256: null }),
  });
  const result = evaluate(held, fixture);
  assert.equal(result.outcome, 'SEMANTIC_MISMATCH');
  assert.equal(result.rows[1].output_valid, true);
});

test('invalid facts, stale revision and unbound scope cannot be counted as valid semantic experiments', async () => {
  for (const mutate of [
    (input) => { input.events[0].facts[0].text = 'Tampered without hash.'; },
    (input) => { input.events[0].revision_state = 'superseded'; },
    (input) => { input.events[0].scope_ref = 'scope:unknown'; },
  ]) {
    const fixture = workIntakeRelationFixtures()[0];
    mutate(fixture.beforeInput); mutate(fixture.afterInput); repin(fixture);
    // Repinning a malicious test contract does not bypass adapter input validity.
    const result = evaluate(await run(fixture), fixture);
    assert.equal(result.status, 'HOLD');
    assert.ok(result.hold_codes.includes('RELATION_INPUT_NOT_VALID') || result.hold_codes.includes('RELATION_INVARIANT_MISMATCH'));
  }
});

test('copied pairs, substituted snapshots and changed expectations fail closed', async () => {
  const fixture = workIntakeRelationFixtures()[0], pair = await run(fixture);
  assert.ok(evaluate(structuredClone(pair), fixture).hold_codes.includes('INVALID_RELATION_PAIR'));
  assert.ok(evaluate({ ...pair, after: pair.before }, fixture).hold_codes.includes('INVALID_RELATION_PAIR'));
  const changed = structuredClone(fixture.contract); changed.expected_after = 'NO_ACTION';
  assert.ok(evaluateWorkIntakeRelationPair(pair, changed, fixture.contract_sha256).hold_codes.includes('RELATION_CONTRACT_DIGEST_MISMATCH'));
  const fingerprint = structuredClone(fixture.contract); fingerprint.after_input_sha256 = '0'.repeat(64);
  assert.ok(evaluateWorkIntakeRelationPair(pair, fingerprint, hashFixtureValue(fingerprint)).hold_codes.includes('RELATION_INPUT_BINDING_MISMATCH'));
  assert.ok(evaluateWorkIntakeRelationPair(pair, fixture.contract).hold_codes.includes('RELATION_CONTRACT_DIGEST_MISMATCH'));
});

test('declared dimensions, independent authorship, frozen time and invariant pins are enforced', async () => {
  const fixture = workIntakeRelationFixtures()[0], pair = await run(fixture);
  for (const mutate of [
    (contract) => { contract.changed_dimensions = ['run_id']; },
    (contract) => { contract.changed_dimensions.push('linear_tasks'); },
    (contract) => { contract.provenance.author_ref = contract.provenance.producer_author_ref; },
    (contract) => { contract.provenance.frozen_at = '2030-01-01T00:00:00.000Z'; },
    (contract) => { contract.invariant_pins.project_ref = 'P02'; },
    (contract) => { contract.semantic_relation.task = 'UNCHECKED'; },
  ]) {
    const contract = structuredClone(fixture.contract); mutate(contract);
    assert.equal(evaluateWorkIntakeRelationPair(pair, contract, hashFixtureValue(contract)).status, 'HOLD');
  }
});

test('undeclared source observation drift is refused even when source status is a declared dimension', async () => {
  const fixture = workIntakeRelationFixtures()[2];
  fixture.afterInput.source_reads[1].cursor_after = 'cursor:changed'; repin(fixture);
  const result = evaluate(await run(fixture), fixture);
  assert.ok(result.hold_codes.includes('RELATION_INVARIANT_MISMATCH'));
});

test('both input snapshots are fixed before the first asynchronous judge call', async () => {
  const fixture = workIntakeRelationFixtures()[0];
  const pair = await runWorkIntakeRelationPair(inputs(fixture), {
    before: async (request) => {
      fixture.afterInput.events[0].facts[0].text = 'Caller mutation after capture.';
      return correctScriptedJudge(fixture.correctAnswers.before)(request);
    },
    after: correctScriptedJudge(fixture.correctAnswers.after),
  });
  assert.equal(evaluate(pair, fixture).outcome, 'PASS');
  assert.notEqual(hashFixtureValue(fixture.afterInput), pair.after.input_sha256);
  const hostile = {}; Object.defineProperty(hostile, 'before', { enumerable: true, get() { throw new Error('hostile'); } });
  hostile.after = fixture.afterInput;
  assert.equal((await runWorkIntakeRelationPair(hostile, controls(fixture))).status, 'HOLD');
});

test('a changed judge prompt cannot masquerade as a controlled input relation', async () => {
  const fixture = workIntakeRelationFixtures()[0];
  const pair = await runWorkIntakeRelationPair(inputs(fixture), {
    before: correctScriptedJudge(fixture.correctAnswers.before),
    after: async (request) => {
      const answer = await correctScriptedJudge(fixture.correctAnswers.after)(request);
      answer.model_receipt.prompt_sha256_ref = 'e'.repeat(64);
      return answer;
    },
  });
  assert.equal(pair.after.status, 'COMPLETED');
  assert.ok(evaluate(pair, fixture).hold_codes.includes('RELATION_JUDGE_DIMENSIONS_MISMATCH'));
});

test('actual-provider labels cannot enter the scripted synthetic result gate', async () => {
  const fixture = workIntakeRelationFixtures()[0];
  const pair = await runWorkIntakeRelationPair(inputs(fixture), {
    before: correctScriptedJudge(fixture.correctAnswers.before),
    after: async (request) => {
      const answer = await correctScriptedJudge(fixture.correctAnswers.after)(request);
      answer.model_receipt.kind = 'provider'; answer.model_receipt.model_ref = 'actual:model';
      return answer;
    },
  });
  const result = evaluate(pair, fixture);
  assert.equal(result.outcome, 'OUTPUT_VALIDATION_FAILED');
  assert.ok(result.rows[1].reason_codes.includes('JUDGE_RECEIPT_UNBOUND'));
  assert.equal(result.measured_model_utility, false);
});

test('changed valid snapshots still refuse the existing same-input A/B comparison', async () => {
  const fixture = workIntakeRelationFixtures()[0], pair = await run(fixture);
  const reports = ['before', 'after'].map((side) => {
    const result = pair[side], attempt = result.attempts.find((entry) => entry.kind === 'event');
    return evaluateWorkIntakeRun(result, {
      partition: 'evaluation', case_set_ref: 'fixture:relation-ab-refusal',
      verdict_provenance: { kind: 'independent_synthetic_fixture', author_ref: 'fixture:independent', producer_author_ref: 'fixture:producer',
        frozen_at: fixture.contract.provenance.frozen_at, source_snapshot_sha256: result.snapshot_sha256, development_event_identities: [] },
      cases: [{ case_id: 'fixture:paraphrase', partition: 'evaluation', event_identity: attempt.event_identity,
        expected_classification: 'NEW', expected_project_ref: 'P01', verdict_ref: 'fixture:preserve' }],
      evaluated_at: result.observed_at,
    });
  });
  assert.equal(reports.every((value) => value.status === 'EVALUATED'), true);
  assert.ok(compareWorkIntakeEvaluations(reports).hold_codes.includes('IMMUTABLE_INPUT_MISMATCH'));
});
