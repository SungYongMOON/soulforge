// Development-only evaluator. Runtime modules never import this or its gold.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateQuestionSet, scoreAnswer, summarize } from '../src/runtime/answer_eval.mjs';

export const CORPUS_URL = new URL('../../../docs/architecture/workspace/examples/knowledge_layer/corpus.json', import.meta.url);
export const readCorpus = () => JSON.parse(readFileSync(CORPUS_URL, 'utf8'));
const sha = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function evaluateKnowledgeAnswers({ corpus, answers, model_id = 'deterministic-fixture-v1', budget = 12000 }) {
  if (!Array.isArray(answers) || typeof model_id !== 'string' || !model_id || !Number.isSafeInteger(budget) || budget <= 0) throw new Error('invalid_evaluation');
  const ids = new Set();
  for (const answer of answers) {
    const question = corpus.questions.find(q => q.id === answer.id);
    if (!question || question.project_ref !== answer.project_ref || ids.has(answer.id)
      || typeof answer.text !== 'string' || answer.text.length > budget) throw new Error('invalid_evaluation_answer');
    ids.add(answer.id);
  }
  const set = validateQuestionSet({ schema: 'soulforge.context_answer_eval_questions.v1', set_id: corpus.id,
    created_at: corpus.created_at, questions: corpus.questions.map(({ project_ref, unit_id, ...q }) => q) });
  const results = set.questions.map(question => scoreAnswer({ question, clarification: set.clarification,
    answerText: answers.find(a => a.id === question.id)?.text ?? null }));
  return { corpus_sha256: sha(corpus), model_id, budget, results, summary: summarize(results),
    claim: 'deterministic_fixture_evaluation_not_live_model_quality' };
}
export function fixtureAnswers(corpus, mode) {
  if (!['headings', 'reference'].includes(mode)) throw new Error('invalid_baseline_mode');
  return corpus.questions.map(q => {
    const unit = corpus.units.find(u => u.unit_id === q.unit_id && u.project_ref === q.project_ref);
    return { id: q.id, project_ref: q.project_ref, text: (mode === 'headings' ? unit.text.split('\n')[0] : unit.text) + ' [' + unit.unit_id + ']' };
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const corpus = readCorpus();
  process.stdout.write(JSON.stringify({ before: evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'headings') }),
    reference: evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'reference') }) }, null, 2) + '\n');
}
