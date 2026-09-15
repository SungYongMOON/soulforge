// The shared-term registry: what it is made of, and what a reader may conclude
// from it. A term several projects use cannot decide which project a record
// belongs to; a term one project uses is a candidate and not a verdict; a term
// the registry has never seen is exactly that, and is said so rather than
// guessed at. The database side is a canned worker here -- these tests are about
// the rules, not about Neo4j.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listEntityProjects } from '../src/runtime/graph_database.mjs';
import { SHARED_TERMS_SCHEMA, classifyTerms, loadSharedTerms, normaliseTerm } from '../src/runtime/shared_terms.mjs';
import { MAX_TERM_WORDS, buildSharedTerms, readSeed, writeRegistry } from '../harness/estate_shared_terms.mjs';

const NOW = '2026-09-15T00:00:00.000Z';
const code = fn => { try { fn(); return null; } catch (error) { return error.code; } };

// A registry as the generator writes one: three terms two projects share, one
// term a single project uses, and the counts that came with them.
const REGISTRY = Object.freeze({
  schema: SHARED_TERMS_SCHEMA, generated_at: NOW,
  generation_refs: [{ project: 'P24-049', generation_id: 'p24049-graph-010' },
    { project: 'P26-014', generation_id: 'p26014-graph-001' }],
  terms: [
    { term: 'CDR', normalized: 'cdr', projects: ['P24-049', 'P26-014'], mention_count: 12, source: 'both' },
    { term: '수신부', normalized: '수신부', projects: ['P24-049', 'P26-014'], mention_count: 9, source: 'graph' },
    { term: '해상시험', normalized: '해상시험', projects: ['P23-027', 'P24-049', 'P26-014'], mention_count: 7, source: 'seed' },
    { term: '소나테크 사옥', normalized: '소나테크 사옥', projects: ['P26-014'], mention_count: 3, source: 'graph' },
  ],
  counts: { projects: 2, min_projects: 2, terms: 4, shared_terms: 3 },
});

test('a term several projects use is shared, a term one project uses is distinctive, and an unknown acronym is neither', () => {
  const rows = classifyTerms('CDR 회의에서 수신부 결선과 해상시험 일정을 정했고 SBC 보드는 다음 주에 온다.', REGISTRY);
  const byTerm = new Map(rows.map(row => [row.term, row]));
  assert.deepEqual([byTerm.get('CDR').kind, byTerm.get('수신부').kind, byTerm.get('해상시험').kind],
    ['shared', 'shared', 'shared'], 'three registered terms crossing two or more projects');
  assert.deepEqual(byTerm.get('CDR').projects, ['P24-049', 'P26-014'],
    'the projects come with the verdict, so a reader can see what the term does not narrow to');
  assert.equal(byTerm.has('소나테크 사옥'), false, 'a registered term the text does not contain is not reported');
  assert.equal(byTerm.get('SBC').kind, 'unregistered');
  assert.deepEqual(byTerm.get('SBC').projects, [], 'an unknown term carries no projects, not a guess');
  assert.deepEqual(rows.map(row => row.kind), ['shared', 'shared', 'shared', 'unregistered'],
    'shared first, then distinctive, then unregistered');
});

test('one project’s term is a candidate, and it is never labelled shared', () => {
  const rows = classifyTerms('소나테크 사옥 3층에서 본 시험', REGISTRY);
  assert.deepEqual(rows, [{ term: '소나테크 사옥', kind: 'distinctive', projects: ['P26-014'] }]);
});

test('a Korean term matches with a particle attached, and an ASCII term does not match inside a longer word', () => {
  assert.deepEqual(classifyTerms('수신부의 이득을 수신부에서 다시 쟀다', REGISTRY).map(row => row.term), ['수신부'],
    'no morphology: the term matches as a substring, which is what lets 조사 ride along');
  assert.deepEqual(classifyTerms('cdr 자료는 준비됐다', REGISTRY).map(row => row.kind), ['shared'],
    'matching ignores case on both sides');
  assert.deepEqual(classifyTerms('CDROM 이미지를 구웠다', REGISTRY).map(row => row.term), ['CDROM'],
    'CDR does not match inside CDROM; the whole token is reported as unregistered instead');
  assert.deepEqual(classifyTerms('과제 P26-014 회의', REGISTRY), [],
    'an identifier is not a term: a hyphen-joined token is left alone');
});

test('without a registry there is no verdict at all', () => {
  assert.deepEqual(classifyTerms('CDR 회의에서 수신부를 봤다', null), [], 'no registry means no rows, not unregistered rows');
  assert.deepEqual(classifyTerms('CDR 회의', undefined), []);
  assert.deepEqual(classifyTerms('', REGISTRY), []);
  assert.equal(code(() => classifyTerms('가'.repeat(200001), REGISTRY)), 'shared_terms_text_too_large',
    'more text than one call scans is refused, never silently cut short');
});

test('a missing registry reads as none; a file that is not a registry is refused rather than read as none', async () => {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-terms-')));
  assert.equal(loadSharedTerms(path.join(dir, 'absent.json')), null);
  assert.equal(loadSharedTerms(''), null, 'no path is no registry');

  const file = path.join(dir, 'shared_terms.v0.json');
  await writeFile(file, JSON.stringify(REGISTRY));
  const loaded = loadSharedTerms(file);
  assert.deepEqual([loaded.schema, loaded.terms.length, loaded.generation_refs.length], [SHARED_TERMS_SCHEMA, 4, 2]);
  assert.deepEqual(classifyTerms('CDR 회의', loaded).map(row => row.kind), ['shared'],
    'a registry read from disk classifies the same as one held in memory');

  await writeFile(file, '{"schema": "something.else.v0"}');
  assert.equal(code(() => loadSharedTerms(file)), 'shared_terms_schema_unknown');
  await writeFile(file, JSON.stringify({ ...REGISTRY, terms: [{ term: 'CDR', normalized: 'cdr', projects: ['P26-014'] }] }));
  assert.equal(code(() => loadSharedTerms(file)), 'shared_terms_invalid', 'a row without its counts is not a row');
  await writeFile(file, 'not json');
  assert.equal(code(() => loadSharedTerms(file)), 'shared_terms_unreadable');
});

// The database's answer, as the worker returns it: names normalised, the projects
// that hold each name, and how often. Two project keys the bindings know and one
// they do not.
const ALPHA = 'alpha-entity\u001falpha-revision\u001fsha256:a1\u001fsha256';
const BETA = 'beta-entity\u001fbeta-revision\u001fsha256:b2\u001fsha256';
const OUTSIDE = 'outside-entity\u001foutside-revision\u001fsha256:c3\u001fsha256';
const CODES = new Map([[ALPHA, 'P24-049'], [BETA, 'P26-014']]);

const WORKER_ANSWER = Object.freeze({
  status: 'ok',
  generations: [{ project_key: ALPHA, generation_id: 'p24049-graph-010' },
    { project_key: BETA, generation_id: 'p26014-graph-001' },
    { project_key: OUTSIDE, generation_id: 'other-graph-001' }],
  terms: [
    { normalized: 'cdr', names: ['CDR', 'cdr'],
      projects: [{ project_key: ALPHA, generation_id: 'p24049-graph-010', mentions: 5 },
        { project_key: BETA, generation_id: 'p26014-graph-001', mentions: 7 }], mention_count: 12 },
    { normalized: '수신부', names: ['수신부'],
      projects: [{ project_key: ALPHA, generation_id: 'p24049-graph-010', mentions: 4 },
        { project_key: BETA, generation_id: 'p26014-graph-001', mentions: 5 }], mention_count: 9 },
    { normalized: '앰프', names: ['앰프'],
      projects: [{ project_key: BETA, generation_id: 'p26014-graph-001', mentions: 2 },
        { project_key: OUTSIDE, generation_id: 'other-graph-001', mentions: 6 }], mention_count: 8 },
    { normalized: '소나테크 사옥', names: ['소나테크 사옥'],
      projects: [{ project_key: BETA, generation_id: 'p26014-graph-001', mentions: 3 }], mention_count: 3 },
    { normalized: '수조시험', names: ['수조시험'],
      projects: [{ project_key: ALPHA, generation_id: 'p24049-graph-010', mentions: 1 }], mention_count: 1 },
  ],
  counts: { entity_rows: 9, terms: 5, skipped_rows: 1 },
  packages: { neo4j: '6.0.0' },
});

async function cannedBinding() {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-terms-secret-')));
  const passwordFile = path.join(dir, 'neo4j_password.txt');
  await writeFile(passwordFile, 'not-read-by-a-canned-worker\n');
  return { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
    llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 50 }, embedder: null,
    neo4j: { uri: 'bolt://127.0.0.1:7687', user: 'neo4j', password_file: passwordFile, database: null } };
}

test('the database is asked one read-only question, and its answer keeps its shape on the way back', async () => {
  const requests = [];
  const runWorker = async ({ request }) => { requests.push(request); return { exit_code: 0, output: WORKER_ANSWER }; };
  const seen = await listEntityProjects({ binding: await cannedBinding(), runWorker });
  assert.deepEqual(requests.map(request => request.operation), ['entity_projects'], 'one call, one operation');
  assert.equal(Object.hasOwn(requests[0], 'query'), false, 'no Cypher crosses this boundary');
  assert.deepEqual([seen.status, seen.terms.length, seen.generations.length], ['ok', 5, 3]);
  assert.deepEqual(seen.terms[0].projects.map(row => row.mentions), [5, 7]);
  assert.equal(seen.counts.entity_rows, 9);

  const unbound = await listEntityProjects({ binding: { ...(await cannedBinding()), neo4j: null }, runWorker });
  assert.deepEqual([unbound.status, unbound.code, unbound.terms], ['not_connected', 'graph_database_not_connected', []],
    'no database is an answer, not a crash');
});

test('a term is registered when two projects the bindings know use it, and a project they do not know is left out', () => {
  const registry = buildSharedTerms({ terms: WORKER_ANSWER.terms, generations: WORKER_ANSWER.generations,
    codeForKey: CODES, seed: [], minProjects: 2, now: NOW });
  assert.equal(registry.schema, SHARED_TERMS_SCHEMA);
  assert.deepEqual(registry.terms.map(row => row.term), ['CDR', '수신부'],
    'only the names both known projects hold; 앰프 crossed into a project no binding named');
  assert.deepEqual(registry.terms[0], { term: 'CDR', normalized: 'cdr', projects: ['P24-049', 'P26-014'],
    mention_count: 12, source: 'graph' });
  assert.deepEqual(registry.generation_refs, [{ project: 'P24-049', generation_id: 'p24049-graph-010' },
    { project: 'P26-014', generation_id: 'p26014-graph-001' }], 'the generation each registered project was read at');
  assert.equal(registry.counts.unknown_project_rows, 1, 'the row that pointed outside is counted, not hidden');
  assert.deepEqual([registry.counts.graph_terms, registry.counts.terms, registry.counts.shared_terms,
    registry.counts.graph_below_min], [5, 2, 2, 3]);
  assert.equal(registry.generated_at, NOW);
});

test('an identifier and a record title are not terms, however many projects hold them', () => {
  const held = mentions => [{ project_key: ALPHA, generation_id: 'p24049-graph-010', mentions },
    { project_key: BETA, generation_id: 'p26014-graph-001', mentions }];
  const terms = [
    { normalized: 'p24-049', names: ['P24-049'], projects: held(5), mention_count: 10 },
    { normalized: 'son-1421', names: ['SON-1421'], projects: held(4), mention_count: 8 },
    { normalized: 'plaud-autoflow', names: ['Plaud-AutoFlow'], projects: held(3), mention_count: 6 },
    { normalized: 're: [군집] 저주파 sas 저장연동반 sw 추가 수정 요청사항 송부', names: ['RE: [군집] 저주파 SAS 저장연동반 SW 추가 수정 요청사항 송부'],
      projects: held(24), mention_count: 48 },
    { normalized: '해상시험', names: ['해상시험'], projects: held(2), mention_count: 4 },
  ];
  const at = maxTermCharacters => buildSharedTerms({ terms, generations: [], codeForKey: CODES, seed: [],
    minProjects: 2, maxTermCharacters, now: NOW });
  const registry = at(24);
  assert.deepEqual(registry.terms.map(row => row.term), ['Plaud-AutoFlow', '해상시험'],
    'the project code and the Linear key are identifiers, and the mail subject is a record title');
  assert.deepEqual([registry.counts.graph_names, registry.counts.identifier_dropped,
    registry.counts.too_long_dropped, registry.counts.too_many_words_dropped, registry.counts.graph_terms],
  [5, 2, 1, 0, 2], 'what was left out is counted by the reason it was left out');
  assert.equal(at(200).terms.some(row => row.term.startsWith('RE:')), false,
    'the character bound is a flag, but a title is also more words than a term is: raising it brings nothing back');
  assert.equal(at(200).terms.some(row => row.term === 'P24-049'), false, 'raising the bound never admits an identifier');
  assert.equal(code(() => at(1)), 'shared_terms_max_characters_invalid');

  // Short enough to pass the character bound, and still a sentence rather than a term.
  const title = { normalized: '모델 관련 내용 검토 및 회신', names: ['모델 관련 내용 검토 및 회신'], projects: held(8), mention_count: 16 };
  const withTitle = buildSharedTerms({ terms: [...terms, title], generations: [], codeForKey: CODES, seed: [],
    minProjects: 2, now: NOW });
  assert.equal(withTitle.terms.some(row => row.term.startsWith('모델 관련')), false);
  assert.deepEqual([withTitle.counts.too_many_words_dropped, withTitle.counts.max_term_words], [1, MAX_TERM_WORDS]);
});

test('the seed adds what the graph has not shown yet, and says so when the graph has shown it', () => {
  const seed = readSeed(Buffer.from(JSON.stringify({ schema: 'soulforge.context_shared_terms_seed.v0', terms: [
    { term: '소나테크 사옥', projects: ['P24-049', 'P26-014'], note: '두 과제 회의록에 같은 형태로 나옴' },
    { term: '해상시험', projects: ['P23-027', 'P26-014'] },
  ] })));
  const registry = buildSharedTerms({ terms: WORKER_ANSWER.terms, generations: WORKER_ANSWER.generations,
    codeForKey: CODES, seed, minProjects: 2, now: NOW });
  const bySource = new Map(registry.terms.map(row => [row.term, row]));
  assert.equal(bySource.get('CDR').source, 'graph');
  assert.deepEqual([bySource.get('소나테크 사옥').source, bySource.get('소나테크 사옥').projects,
    bySource.get('소나테크 사옥').mention_count], ['both', ['P24-049', 'P26-014'], 3],
  'a term the graph reached in one project only is kept when the seed declares it, with the graph’s own count');
  assert.deepEqual([bySource.get('해상시험').source, bySource.get('해상시험').projects,
    bySource.get('해상시험').mention_count], ['seed', ['P23-027', 'P26-014'], 0],
  'a term no generation carries yet is a seed row with no mentions');
  assert.deepEqual([registry.counts.seed_terms, registry.counts.terms], [2, 4]);
  assert.deepEqual(registry.terms.map(row => row.projects.length), [2, 2, 2, 2], 'every registered row crosses two projects');
});

test('a seed row without the projects it was seen in is refused, and so is one that is not a seed', () => {
  const seed = bytes => code(() => readSeed(Buffer.from(JSON.stringify(bytes))));
  assert.equal(seed({ schema: 'soulforge.context_shared_terms_seed.v0', terms: [{ term: 'CDR' }] }), 'shared_terms_seed_invalid');
  assert.equal(seed({ schema: 'soulforge.context_shared_terms_seed.v0', terms: [{ term: 'CDR', projects: [] }] }), 'shared_terms_seed_invalid');
  assert.equal(seed({ schema: 'soulforge.context_shared_terms_seed.v0', terms: [{ term: 'CDR', projects: ['not a code'] }] }), 'shared_terms_seed_invalid');
  assert.equal(seed({ schema: 'soulforge.context_shared_terms_seed.v0',
    terms: [{ term: 'CDR', projects: ['P26-014'] }, { term: 'cdr', projects: ['P24-049'] }] }), 'shared_terms_seed_invalid',
  'the same term twice under different cases would make two rows of one term');
  assert.equal(seed({ schema: 'something.else.v0', terms: [] }), 'shared_terms_seed_schema_unknown');
  assert.deepEqual(readSeed(Buffer.from(JSON.stringify({ schema: 'soulforge.context_shared_terms_seed.v0',
    terms: [{ term: ' 케이블 ', projects: ['P26-014', 'P26-014'] }] }))),
  [{ term: '케이블', normalized: '케이블', projects: ['P26-014'] }], 'a term is trimmed and its projects deduplicated');
});

test('a lowered bound registers more terms, and a raised one registers fewer', () => {
  const at = minProjects => buildSharedTerms({ terms: WORKER_ANSWER.terms, generations: WORKER_ANSWER.generations,
    codeForKey: CODES, seed: [], minProjects, now: NOW }).terms.map(row => row.term);
  assert.deepEqual(at(1), ['CDR', '수신부', '소나테크 사옥', '앰프', '수조시험'],
    'at one project the registry is every name, which is why two is the default');
  assert.deepEqual(at(3), [], 'no name reaches three known projects here');
  assert.equal(code(() => buildSharedTerms({ codeForKey: CODES, minProjects: 0, now: NOW })), 'shared_terms_min_projects_invalid');
  assert.equal(code(() => buildSharedTerms({ codeForKey: CODES, minProjects: 2 })), 'shared_terms_generated_at_invalid');
});

test('the registry is written as a derived file: overwritten in place, with one step back beside it', async () => {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-terms-out-')));
  const target = path.join(dir, 'context-read', 'shared_terms.v0.json');
  const first = buildSharedTerms({ terms: WORKER_ANSWER.terms, generations: WORKER_ANSWER.generations,
    codeForKey: CODES, seed: [], minProjects: 2, now: NOW });
  const wroteFirst = writeRegistry(target, first);
  assert.equal(wroteFirst.previous_kept, false, 'the first write has nothing to keep');

  const second = buildSharedTerms({ terms: WORKER_ANSWER.terms.slice(0, 1), generations: WORKER_ANSWER.generations,
    codeForKey: CODES, seed: [], minProjects: 2, now: '2026-09-16T00:00:00.000Z' });
  const wroteSecond = writeRegistry(target, second);
  assert.equal(wroteSecond.previous_kept, true);
  assert.deepEqual(loadSharedTerms(target).terms.map(row => row.term), ['CDR'], 'the file holds the newest pass');
  assert.deepEqual(JSON.parse(await readFile(`${target}.prev`, 'utf8')).terms.map(row => row.term), ['CDR', '수신부'],
    'the pass before it is still readable beside it');
  assert.equal(loadSharedTerms(target).generated_at, '2026-09-16T00:00:00.000Z');
});

test('normalising a term is trim, case-fold and collapsed whitespace, and nothing else', () => {
  assert.equal(normaliseTerm('  CDR   회의 '), 'cdr 회의');
  assert.equal(normaliseTerm('수신부\n\t앰프'), '수신부 앰프');
  assert.equal(normaliseTerm(null), '');
});
