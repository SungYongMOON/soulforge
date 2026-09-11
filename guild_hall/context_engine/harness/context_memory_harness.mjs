// Evaluation-only harness. The executor receives only makeExecutorInput output.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runBaseline } from './context_memory_baseline.mjs';

export const FIXTURE = new URL('../../../docs/architecture/workspace/examples/context-memory/', import.meta.url);
export const BUDGET = Object.freeze({ output_chars: 12000, evidence: 12, paths: 6, additional_source_reads: 2 });
export const EXECUTED = Object.freeze(['Q01', 'Q02', 'Q03', 'Q05', 'Q07', 'Q09', 'Q11', 'Q12', 'Q21']);
export const digest = value => createHash('sha256').update(value).digest('hex');
const json = name => JSON.parse(readFileSync(new URL(name, FIXTURE), 'utf8'));
const exactKeys = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
const questionKeys = ['id', 'question', 'project', 'task', 'actor', 'purpose', 'valid_at', 'known_at', 'source_ids', 'request_context'];
const sourceKeys = ['id', 'project', 'revision', 'locator', 'body', 'kind', 'valid_at', 'known_at', 'state'];

export function loadFixture() {
  const runtime = json('runtime.json'), evaluation = json('evaluation.json'), lock = json('digests.json');
  for (const name of ['runtime.json', 'evaluation.json']) {
    assert.equal(digest(readFileSync(new URL(name, FIXTURE))), lock.files[name], name + ' digest changed');
  }
  validateFixture(runtime, evaluation);
  assert.deepEqual(lock.sources, runtime.sources.map(source => ({ id: source.id,
    revision: source.revision, locator: source.locator, sha256: digest(source.body) })));
  return { runtime, evaluation, lock };
}

export function validateFixture(runtime, evaluation) {
  exactKeys(runtime, ['fixture_id', 'budget', 'sources', 'questions']);
  assert.equal(runtime.fixture_id, 'context-memory-t0-v1');
  assert.equal(evaluation.fixture_id, runtime.fixture_id);
  assert.deepEqual(runtime.budget, BUDGET);
  const ids = Array.from({ length: 24 }, (_, index) => 'Q' + String(index + 1).padStart(2, '0'));
  assert.deepEqual(runtime.questions.map(q => q.id), ids);
  assert.deepEqual(evaluation.gold.map(g => g.id), ids);
  const sources = new Map(runtime.sources.map(s => [s.id, s]));
  assert.equal(sources.size, runtime.sources.length);
  for (const source of runtime.sources) {
    exactKeys(source, sourceKeys);
    assert.ok(['P-A', 'P-B'].includes(source.project));
    assert.ok(source.body && source.kind && source.revision && /^paragraph:\d+$/.test(source.locator));
    assert.ok(['active', 'superseded', 'retracted', 'unavailable'].includes(source.state));
    assert.ok(Number.isFinite(Date.parse(source.valid_at)) && Number.isFinite(Date.parse(source.known_at)));
    assert.ok(Date.parse(source.valid_at) <= Date.parse(source.known_at));
  }
  for (const request of runtime.questions) {
    exactKeys(request, questionKeys);
    assert.ok(request.question && request.actor && ['work', 'improvement'].includes(request.purpose));
    assert.ok(['P-A', null].includes(request.project) && request.task === 'T-A1');
    assert.ok(Number.isFinite(Date.parse(request.valid_at)) && Number.isFinite(Date.parse(request.known_at)));
    assert.ok(Date.parse(request.valid_at) <= Date.parse(request.known_at));
    assert.ok(Array.isArray(request.request_context));
    assert.equal(new Set(request.source_ids).size, request.source_ids.length);
    request.source_ids.forEach(id => assert.ok(sources.has(id), 'unresolved source: ' + id));
    const gold = evaluation.gold.find(g => g.id === request.id);
    assert.ok(['OK', 'HOLD', 'NOT_AVAILABLE'].includes(gold.expected_status));
    if (gold.accepted_statuses) {
      assert.equal(gold.id, 'Q03');
      assert.deepEqual(gold.accepted_statuses, ['HOLD', 'NOT_AVAILABLE']);
    }
    assert.ok(gold.rubric.length && gold.rubric.every(item => typeof item === 'string' && item.length > 10));
    assert.ok(Array.isArray(gold.include) && Array.isArray(gold.exclude));
    for (const id of [...gold.include, ...gold.exclude]) {
      assert.ok(sources.has(id) && request.source_ids.includes(id), request.id + ' unresolved gold: ' + id);
    }
    assert.ok(!gold.include.some(id => gold.exclude.includes(id)));
  }
  return true;
}

export function makeExecutorInput(runtime, id, options = {}) {
  exactKeys(runtime, ['fixture_id', 'budget', 'sources', 'questions']);
  const request = runtime.questions.find(q => q.id === id);
  assert.ok(request, 'unknown question');
  exactKeys(request, questionKeys);
  const sources = request.source_ids.map(sourceId => {
    const source = runtime.sources.find(s => s.id === sourceId);
    assert.ok(source, 'missing source'); exactKeys(source, sourceKeys); return structuredClone(source);
  });
  const input = { fixture_id: runtime.fixture_id, request: structuredClone(request),
    budget: structuredClone(BUDGET), sources };
  // Oracle is an explicit test condition only. Normal calls cannot smuggle gold.
  exactKeys(options, Object.hasOwn(options, 'oracle_refs') ? ['mode', 'oracle_refs'] : Object.hasOwn(options, 'mode') ? ['mode'] : []);
  const mode = options.mode || 'baseline';
  assert.ok(['baseline', 'candidate', 'oracle'].includes(mode));
  if (mode === 'oracle') {
    assert.ok(Array.isArray(options.oracle_refs), 'oracle requires explicit references');
    assert.ok(options.oracle_refs.every(ref => sources.some(s => s.id === ref)));
    input.oracle_refs = structuredClone(options.oracle_refs);
  } else assert.ok(!Object.hasOwn(options, 'oracle_refs'), 'oracle refs forbidden for normal executor');
  return input;
}

export function evaluateObservation(gold, observed, budget = BUDGET, executionMode = 'baseline') {
  // This argument belongs to the evaluator, never to the returned observation.
  assert.ok(['baseline', 'candidate', 'oracle'].includes(executionMode));
  if (!observed) return { retrieval: 'NOT_RUN', utilization: 'NOT_RUN', status: 'NOT_RUN', violations: [] };
  const violations = [];
  if (Object.hasOwn(observed, 'mode') && observed.mode !== executionMode) violations.push('MODE_MISMATCH');
  if (executionMode !== 'oracle' && observed.oracle_used === true) violations.push('ORACLE_MISUSE');
  if (violations.length) return { evaluation: 'REJECTED', execution_mode: executionMode,
    retrieval: 'NOT_RUN', utilization: 'NOT_RUN', status: 'NOT_RUN', semantic_rubric: 'NOT_RUN', violations };
  const refs = observed.returned_refs || [];
  const missing = gold.include.filter(id => !refs.includes(id));
  const excluded = gold.exclude.filter(id => refs.includes(id));
  if (excluded.length) violations.push('EXCLUDED_EVIDENCE');
  const statusMatches = (gold.accepted_statuses || [gold.expected_status]).includes(observed.status);
  if (!statusMatches) violations.push('STATUS_MISMATCH');
  if (observed.measurements) {
    for (const field of Object.keys(budget)) {
      const value = observed.measurements[field];
      if (!Number.isInteger(value) || value < 0) violations.push('MISSING_MEASUREMENT:' + field);
      else if (value > budget[field]) violations.push('BUDGET_EXCEEDED:' + field);
    }
  } else violations.push('MISSING_MEASUREMENTS');
  const used = observed.used_refs;
  const utilization = used === null || used === undefined ? 'NOT_RUN'
    : gold.include.every(id => used.includes(id)) && !gold.exclude.some(id => used.includes(id)) ? 'PASS' : 'FAIL';
  return { evaluation: 'EVALUATED', execution_mode: executionMode,
    retrieval: missing.length || excluded.length ? 'FAIL' : 'PASS', utilization,
    status: statusMatches ? 'PASS' : 'FAIL', envelope_exact_match: observed.status === gold.expected_status,
    missing, excluded, violations,
    // Reference-use is a mechanical metric; prose rubric needs a separate evaluator.
    semantic_rubric: 'NOT_RUN' };
}

const nextStage = id => ['Q06', 'Q08', 'Q10'].includes(id) ? 'T1/T2'
  : ['Q20', 'Q23', 'Q24'].includes(id) ? 'T4' : 'T3';
const gaps = {
  Q01: 'No typed task identity in reader output; source body is not consumed.',
  Q02: 'Project-bound manifest fixture is not a measured cross-project ranking pipeline.',
  Q03: 'Reader rejects actor/purpose before accepted bundle IO; live ACL binding not exercised.',
  Q05: 'Active source metadata is returned; valid decision answer not assembled.',
  Q07: 'Historical membership excluded; explicit correction explanation not assembled.',
  Q09: 'Source revision/span returned but paragraph locator/body resolution absent.',
  Q11: 'Both sources can be returned; no conflict field or explanation.',
  Q12: 'Accepted snapshot coverage does not express requested historical corpus coverage.',
  Q21: 'max_units only; serialized characters, required conflicts and omission reasons not bounded by reader.',
};

export async function runSuite({ runtime, evaluation, lock }, execute = runBaseline) {
  const executionMode = 'baseline';
  const rows = [];
  for (const gold of evaluation.gold) {
    const question = runtime.questions.find(q => q.id === gold.id);
    if (!EXECUTED.includes(gold.id)) {
      rows.push({ id: gold.id, expected: gold.expected_status, expected_include: gold.include,
        expected_exclude: gold.exclude, actual: 'NOT_RUN', reason: 'Progress gate defers execution to ' + nextStage(gold.id) });
      continue;
    }
    // No gold or counterexample object is passed to the query seam.
    const executorInput = makeExecutorInput(runtime, gold.id, { mode: executionMode });
    const inputDigest = digest(JSON.stringify(executorInput));
    const observation = await execute(executorInput);
    rows.push({ id: gold.id, expected: gold.expected_status, accepted_statuses: gold.accepted_statuses || [gold.expected_status], expected_include: gold.include,
      expected_exclude: gold.exclude, actual: observation.status, returned_refs: observation.returned_refs,
      input_digest: inputDigest, query_digest: observation.query_digest, result_digest: observation.result_digest,
      metrics: evaluateObservation(gold, observation, BUDGET, executionMode), replay_equal: observation.replay_equal,
      measurements: observation.measurements, full_question: 'NOT_RUN', reason: gaps[question.id] });
  }
  return { fixture_id: runtime.fixture_id, fixture_digests: lock.files,
    policy_revision: 'context-memory-t0-rubric-v1', budget: BUDGET,
    profile: { requested_model: 'gpt-6-astra', requested_reasoning: 'medium', observed_model: 'UNKNOWN',
      observed_reasoning: 'UNKNOWN', tier: 'UNKNOWN', tokens: 'UNKNOWN', cost: 'UNKNOWN', model_calls: 0 },
    conditions: { current_code_reader: 'RUN', A_off: 'NOT_RUN', B_ranked: 'NOT_RUN', C_typed: 'NOT_RUN', D_oracle: 'NOT_RUN' }, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Exit 0 means measurement completed, never that all question semantics passed.
  console.log(JSON.stringify(await runSuite(loadFixture()), null, 2));
}
