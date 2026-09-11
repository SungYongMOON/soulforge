import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BUDGET, EXECUTED, loadFixture, validateFixture, makeExecutorInput,
  evaluateObservation, runSuite } from '../harness/context_memory_harness.mjs';
import { makeBaseline, runBaseline } from '../harness/context_memory_baseline.mjs';

const fixture = loadFixture();
const gold = id => fixture.evaluation.gold.find(row => row.id === id);
const input = id => makeExecutorInput(fixture.runtime, id);
const measurements = { output_chars: 100, evidence: 1, paths: 0, additional_source_reads: 0 };

test('24 questions bind actor/purpose/time/source/locator/gold/rubric and byte digests', () => {
  assert.equal(validateFixture(fixture.runtime, fixture.evaluation), true);
  const corrupt = structuredClone(fixture.runtime);
  corrupt.questions[0].source_ids.push('missing-revision');
  assert.throws(() => validateFixture(corrupt, fixture.evaluation));
  const duplicate = structuredClone(fixture.runtime);
  duplicate.sources.push(duplicate.sources[0]);
  assert.throws(() => validateFixture(duplicate, fixture.evaluation));
});

test('ordinary executor inputs are allowlisted and never receive gold/counterexamples', async () => {
  const seen = [];
  await runSuite(fixture, async value => {
    seen.push(value);
    assert.deepEqual(Object.keys(value).sort(), ['budget', 'fixture_id', 'request', 'sources']);
    const serialized = JSON.stringify(value);
    assert.ok(!/"(?:gold|rubric|expected_status|counterexamples|oracle_refs)"/.test(serialized));
    return { status: 'NOT_AVAILABLE', returned_refs: [], used_refs: null, measurements };
  });
  assert.equal(seen.length, EXECUTED.length);
  const polluted = structuredClone(fixture.runtime);
  polluted.questions[0].gold = gold('Q01');
  assert.throws(() => makeExecutorInput(polluted, 'Q01'));
  const module = readFileSync(new URL('../harness/context_memory_baseline.mjs', import.meta.url), 'utf8');
  assert.ok(!module.includes('evaluation.json') && !module.includes('context_memory_harness'));
});

test('oracle is opt-in and normal mode misuse is rejected', () => {
  assert.throws(() => makeExecutorInput(fixture.runtime, 'Q23', { mode: 'baseline', oracle_refs: gold('Q23').include }));
  assert.throws(() => makeExecutorInput(fixture.runtime, 'Q23', { mode: 'oracle' }));
  assert.deepEqual(makeExecutorInput(fixture.runtime, 'Q23', { mode: 'oracle', oracle_refs: gold('Q23').include }).oracle_refs, ['S-CURRENT']);
  const result = evaluateObservation(gold('Q23'), { status: 'OK', returned_refs: ['S-CURRENT'],
    used_refs: ['S-CURRENT'], oracle_used: true, mode: 'baseline', measurements });
  assert.ok(result.violations.includes('ORACLE_MISUSE'));
});

test('executor cannot relabel evaluator-owned baseline as oracle', async () => {
  const report = await runSuite(fixture, async value => ({
    ...await runBaseline(value), mode: 'oracle', oracle_used: true,
  }));
  const executed = report.rows.filter(row => row.actual !== 'NOT_RUN');
  assert.equal(executed.length, 9);
  for (const row of executed) {
    assert.equal(row.metrics.evaluation, 'REJECTED');
    assert.ok(row.metrics.violations.includes('MODE_MISMATCH'));
    assert.ok(row.metrics.violations.includes('ORACLE_MISUSE'));
    assert.equal(row.metrics.retrieval, 'NOT_RUN');
  }
  assert.equal(report.conditions.D_oracle, 'NOT_RUN');
});

test('only evaluator-owned oracle permits oracle use; mismatched observation is rejected', () => {
  const observed = { status: 'OK', returned_refs: ['S-CURRENT'], used_refs: ['S-CURRENT'],
    mode: 'oracle', oracle_used: true, measurements };
  assert.equal(evaluateObservation(gold('Q23'), observed, BUDGET, 'oracle').evaluation, 'EVALUATED');
  assert.equal(evaluateObservation(gold('Q23'), { ...observed, mode: 'baseline' }, BUDGET, 'oracle').evaluation, 'REJECTED');
  assert.equal(evaluateObservation(gold('Q23'), { ...observed, oracle_used: false }).evaluation, 'REJECTED');
});

for (const id of ['Q01', 'Q05', 'Q07', 'Q09', 'Q11', 'Q12']) {
  test(id + ': actual accepted reader/query returns exact fixture revisions; replay is deterministic', async () => {
    const value = input(id), result = await runBaseline(value);
    assert.equal(result.status, 'OK');
    assert.equal(result.replay_equal, true);
    assert.match(result.query_digest, /^sha256:[0-9a-f]{64}$/);
    assert.match(result.result_digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.measurements.accepted_bundle_reads, 2);
    assert.equal(result.measurements.additional_source_reads, 0);
    assert.ok(Object.values(result.response.effects).every(count => count === 0));
    for (const hit of result.response.hits) {
      assert.equal(hit.source_revision_ref.revision_id, value.sources.find(s => s.id === hit.source_span_ref).revision);
    }
    const evaluated = evaluateObservation(gold(id), result);
    assert.equal(evaluated.retrieval, 'PASS');
    assert.equal(evaluated.utilization, 'NOT_RUN');
    assert.equal(evaluated.status, ['Q11', 'Q12'].includes(id) ? 'FAIL' : 'PASS');
    if (id === 'Q09') assert.equal(Object.hasOwn(result.response.hits[0], 'locator'), false);
  });
}

test('Q02 cross-project request fails before bundle IO; no foreign evidence in nominal result', async () => {
  const value = input('Q02');
  assert.ok(value.sources.some(s => s.project === 'P-B'));
  const nominal = await runBaseline(value);
  assert.ok(!nominal.returned_refs.includes('S-LURE'));
  value.request.project = 'P-B';
  const f = makeBaseline(value);
  assert.equal((await f.reader.query(f.queryRequest)).status, 'NOT_AVAILABLE');
  assert.equal((await f.query.query(f.queryRequest)).status, 'NOT_AVAILABLE');
  assert.equal(f.counts.accepted_bundle_reads, 0);
});

test('Q03 unauthorized actor and unauthorized purpose reject before bundle IO', async () => {
  for (const override of [{ actor: 'actor-unauthorized' }, { actor: 'actor-a', purpose: 'external-transmission' }]) {
    const value = input('Q03'); Object.assign(value.request, override);
    const f = makeBaseline(value);
    assert.equal((await f.reader.query(f.queryRequest)).status, 'NOT_AVAILABLE');
    assert.equal(f.counts.accepted_bundle_reads, 0);
    assert.equal(f.counts.source_body_reads, 0);
  }
});

test('Q21 exposes current rank/omission gap without exceeding fixed evidence count', async () => {
  const result = await runBaseline(input('Q21'));
  assert.equal(result.measurements.evidence, BUDGET.evidence);
  assert.ok(result.measurements.output_chars <= BUDGET.output_chars);
  const metrics = evaluateObservation(gold('Q21'), result);
  assert.equal(metrics.retrieval, 'FAIL');
  assert.ok(metrics.missing.includes('S-DETAIL-10'));
  assert.ok(metrics.excluded.includes('S-APPENDIX'));
  assert.ok(result.response.cursor);
});

test('budget overflow and unmeasured dimensions are detected in every fixed dimension', () => {
  for (const field of Object.keys(BUDGET)) {
    const result = evaluateObservation(gold('Q01'), { status: 'OK', returned_refs: ['S-TASK'],
      used_refs: null, measurements: { ...measurements, [field]: BUDGET[field] + 1 } });
    assert.ok(result.violations.includes('BUDGET_EXCEEDED:' + field));
    const missing = { ...measurements }; delete missing[field];
    assert.ok(evaluateObservation(gold('Q01'), { status: 'OK', returned_refs: ['S-TASK'], measurements: missing })
      .violations.includes('MISSING_MEASUREMENT:' + field));
  }
  const f = makeBaseline(input('Q21'));
  return f.query.query({ ...f.queryRequest, budget: { max_units: 101 } }).then(result => assert.equal(result.status, 'HOLD'));
});

test('evaluation negatives separate invalid retrieval, insufficient coverage, utilization and oracle misuse', () => {
  for (const counterexample of fixture.evaluation.counterexamples) {
    const observation = { ...counterexample, measurements,
      mode: 'baseline', oracle_used: counterexample.id === 'CE-ORACLE-MISUSE' };
    const result = evaluateObservation(gold(counterexample.question_id), observation);
    if (counterexample.id === 'CE-Q02-CROSS-PROJECT' || counterexample.id === 'CE-Q07-DISCARDED') {
      assert.equal(result.retrieval, 'FAIL'); assert.ok(result.violations.includes('EXCLUDED_EVIDENCE'));
    } else if (counterexample.id === 'CE-Q12-COVERAGE') assert.equal(result.status, 'FAIL');
    else if (counterexample.id === 'CE-Q23-UTILIZATION') {
      assert.equal(result.retrieval, 'PASS'); assert.equal(result.utilization, 'FAIL');
    } else assert.ok(result.violations.includes('ORACLE_MISUSE'));
  }
});

test('baseline keeps 15 deferred questions and all A/B/C/D comparisons explicitly NOT_RUN', async () => {
  const report = await runSuite(fixture);
  assert.equal(report.rows.length, 24);
  assert.equal(report.rows.filter(row => row.actual === 'NOT_RUN').length, 15);
  assert.equal(report.rows.filter(row => row.metrics?.retrieval === 'FAIL').length, 1);
  assert.equal(report.rows.filter(row => row.metrics?.status === 'FAIL').length, 3);
  assert.ok(report.rows.every(row => row.reason));
  assert.ok(Object.entries(report.conditions).filter(([key]) => key !== 'current_code_reader').every(([, value]) => value === 'NOT_RUN'));
});
