import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateKnowledgeAnswers, fixtureAnswers, readCorpus } from '../../harness/knowledge_layer_eval.mjs';
test('small corpus covers two projects and three source kinds per project', () => {
  const c = readCorpus();
  assert.deepEqual([...new Set(c.units.map(u => u.project_ref))], ['SYN-A', 'SYN-B']);
  for (const project of ['SYN-A', 'SYN-B']) assert.deepEqual(c.units.filter(u => u.project_ref === project).map(u => u.source_kind).sort(), ['document', 'mail', 'voice']);
  assert.equal(c.questions.length, 6);
});
test('headings baseline and full-source reference have the same pins and separate scores', () => {
  const corpus = readCorpus();
  const before = evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'headings') });
  const after = evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'reference') });
  assert.equal(before.corpus_sha256, after.corpus_sha256);
  assert.equal(before.summary.mean_found, 0); assert.equal(after.summary.mean_found, 1);
  assert.equal(before.summary.mean_cited, 1); assert.equal(after.summary.mean_cited, 1);
  assert.equal(after.summary.errors_total, 0);
  assert.deepEqual(after, evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'reference') }));
});
test('missing answers remain in the denominator and forbidden claims are counted', () => {
  const corpus = readCorpus(), answers = fixtureAnswers(corpus, 'reference');
  answers[0].text += ' 모든 승인 완료';
  const result = evaluateKnowledgeAnswers({ corpus, answers: answers.slice(0, 1) });
  assert.equal(result.summary.questions, 6); assert.equal(result.summary.answers_absent, 5);
  assert.equal(result.summary.errors_total, 1);
});
test('foreign project, duplicate answer, unknown ID and budget overflow are refused', () => {
  const corpus = readCorpus(), answer = fixtureAnswers(corpus, 'reference')[0];
  for (const answers of [[{ ...answer, project_ref: 'SYN-B' }], [answer, answer], [{ ...answer, id: 'unknown' }]])
    assert.throws(() => evaluateKnowledgeAnswers({ corpus, answers }));
  assert.throws(() => evaluateKnowledgeAnswers({ corpus, answers: [answer], budget: 1 }));
});
test('knowledge layer tests are wired into both root acceptance modes', () => {
  const runner = readFileSync(new URL('../../../validate/run_root_acceptance.mjs', import.meta.url), 'utf8');
  assert.equal(runner.split('["knowledge-layer", "npm run validate:knowledge-layer"]').length - 1, 2);
});
