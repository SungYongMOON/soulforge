// Developer-only demonstration; imports synthetic fixtures, never production IO.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileArchive, createMemoryGraph } from '../src/knowledge_layer/index.mjs';
import { evaluateKnowledgeAnswers, fixtureAnswers, readCorpus } from './knowledge_layer_eval.mjs';
import { wikiFixture, wikiInput } from '../tests/knowledge_layer/wiki_fixture.mjs';
export async function runKnowledgeDemo(out) {
  if (typeof out !== 'string' || !isAbsolute(out) || !existsSync(out) || readdirSync(out).length) throw new Error('empty_owned_output_directory_required');
  const corpus = readCorpus(), projects = new Map(), graph = createMemoryGraph();
  for (const project of ['SYN-A', 'SYN-B']) {
    const directory = join(out, project); mkdirSync(directory);
    const f = wikiFixture({ graph, archive: createFileArchive({ root: directory }) });
    const result = await f.layer.generate(wikiInput(project)); projects.set(project, result.record.content);
  }
  const answers = corpus.questions.map(q => ({ id: q.id, project_ref: q.project_ref,
    text: projects.get(q.project_ref).pages.find(p => p.page_id.startsWith('source:') && p.source_unit_ids.includes(q.unit_id)).markdown }));
  const result = { before: evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'headings') }),
    reference: evaluateKnowledgeAnswers({ corpus, answers: fixtureAnswers(corpus, 'reference') }),
    after: evaluateKnowledgeAnswers({ corpus, answers }), generator: 'deterministic-extractive-fake',
    graph: 'memory-fake', live_quality_measured: false, pages: [...projects.values()].reduce((n,c) => n + c.pages.length, 0) };
  writeFileSync(join(out, 'evaluation.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runKnowledgeDemo(process.argv[2]);
  process.stdout.write(JSON.stringify({ before: result.before.summary, reference: result.reference.summary,
    after: result.after.summary, pages: result.pages, live_quality_measured: false }) + '\n');
}
