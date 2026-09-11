// Graph index generations in the Plan 17 project store: create-only writes,
// pull-based incremental extraction with carry-forward by exact reference, one
// pointer under a lock and an expected prior, rollback, and refusals. Unit tests
// use a canned worker (named as such) that counts probe and extraction calls;
// the opt-in test repeats the replay and single-change cases with the real
// neo4j-graphrag worker and a local model.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { CANNED_LLM_DIGEST as LLM_DIGEST, INDEX_MEMOS as MEMOS, INDEX_NOW as NOW, INDEX_PROJECT as PROJECT, READER_REQUEST as reader,
  cannedGraphWorker as cannedWorker, indexerRequest as indexer, makeGraphIndexStore as makeStore } from '../harness/fixtures/graph_index_fixture.mjs';
import { GRAPH_INDEX_AREAS, GRAPH_INDEX_BINDING_FILE, openGraphIndex, selectGraphIndexGeneration,
  updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';

const update = (store, request, worker) => updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request,
  now: NOW, runWorker: worker.runWorker });
const generations = async store => (await readdir(path.join(store.storeRoot, PROJECT, GRAPH_INDEX_AREAS.index, 'generations'))).sort();

test('first update writes a complete generation; replay is a no-op without extraction', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  assert.deepEqual({ status: first.status, epoch: first.selection_epoch, counts: first.counts, changes: first.changes },
    { status: 'COMMITTED', epoch: 1, counts: { documents: 2, extracted: 2, carried: 0, units: 4, chunks: 4, entities: 4, entity_relationships: 0 },
      changes: { added: 2, changed: 0, removed: 0, unchanged: 0, unavailable: 0 } });
  assert.deepEqual({ probe: worker.calls.probe, extract: worker.calls.extract, docs: worker.calls.extracted.length }, { probe: 1, extract: 1, docs: 2 });
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  assert.equal(view.manifest.generation_id, 'g1');
  for (const row of view.manifest.documents) {
    const document = view.readDocument(row.doc_key), fragment = view.readFragment(row.doc_key);
    assert.equal(fragment.stats.chunks, document.units.length);
    assert.deepEqual(fragment.model, { llm: 'local-model:tag', llm_digest: LLM_DIGEST, think: false,
      options: { temperature: 0, seed: 7, num_predict: 2048 }, embedder: null, embedder_digest: null });
  }
  const replay = await update(store, indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), worker);
  assert.deepEqual({ status: replay.status, generation: replay.generation_id, epoch: replay.selection_epoch, unchanged: replay.changes.unchanged },
    { status: 'UNCHANGED', generation: 'g1', epoch: 1, unchanged: 2 });
  assert.deepEqual({ probe: worker.calls.probe, extract: worker.calls.extract }, { probe: 2, extract: 1 }, 'replay asks the model nothing');
  assert.deepEqual(await generations(store), ['g1']);
});

test('a changed source re-extracts only that document, carries the rest by reference and keeps history; rollback re-selects it', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  const firstManifest = await readFile(path.join(store.storeRoot, first.manifest_ref.path));
  await writeFile(path.join(store.sourceRoot, 'memo-b.md'), '# 전원 조건\n\n전원 조건은 30V로 다시 바뀌었다.\n');
  const second = await update(store, indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), worker);
  assert.deepEqual({ status: second.status, epoch: second.selection_epoch, extracted: second.counts.extracted, carried: second.counts.carried,
    changed: second.changes.changed, unchanged: second.changes.unchanged }, { status: 'COMMITTED', epoch: 2, extracted: 1, carried: 1, changed: 1, unchanged: 1 });
  assert.equal(worker.calls.extracted.length, 3, 'only the changed document went to the model');
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  const origins = Object.fromEntries(view.manifest.documents.map(row => [row.item_id, [row.origin, row.fragment.path.includes('/generations/g1/')]]));
  assert.deepEqual(origins, { 'memo-a': ['carried', true], 'memo-b': ['extracted', false] });
  assert.equal(view.manifest.supersedes.generation_id, 'g1');
  assert.ok((await readFile(path.join(store.storeRoot, first.manifest_ref.path))).equals(firstManifest), 'the earlier generation is untouched');
  const rollback = await selectGraphIndexGeneration({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexer({ generation_ref: first.manifest_ref, expected_prior: second.pointer_sha256 }) });
  assert.deepEqual({ status: rollback.status, generation: rollback.generation_id, epoch: rollback.selection_epoch },
    { status: 'COMMITTED', generation: 'g1', epoch: 3 });
  assert.equal(openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader }).manifest.generation_id, 'g1');
  const stale = await selectGraphIndexGeneration({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexer({ generation_ref: second.manifest_ref, expected_prior: second.pointer_sha256 }) });
  assert.deepEqual({ status: stale.status, code: stale.code }, { status: 'HOLD', code: 'graph_index_prior_mismatch' });
});

test('incomplete runs keep the current generation: lost source, budget, wrong prior, held lock; a new model re-extracts all', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  const pointerOf = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader }).pointer_sha256;
  await rm(path.join(store.sourceRoot, 'memo-b.md'));
  const lost = await update(store, indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), worker);
  assert.deepEqual({ status: lost.status, code: lost.code, unavailable: lost.unavailable },
    { status: 'HOLD', code: 'source_incomplete', unavailable: [{ source_kind: 'document', root_ref: 'doc.synthetic', item_id: 'memo-b',
      status: 'missing', code: lost.unavailable[0].code }] });
  await writeFile(path.join(store.sourceRoot, 'memo-b.md'), MEMOS['memo-b.md']);
  await writeFile(path.join(store.sourceRoot, 'memo-a.md'), '# 시험 장비 A\n\n장표 제출이 하루 늦어졌다.\n');
  const partial = await update(store, indexer({ generation_id: 'g3', expected_prior: first.pointer_sha256 }), cannedWorker({ budgetExhausted: true }));
  assert.deepEqual({ status: partial.status, code: partial.code }, { status: 'HOLD', code: 'graph_budget_exhausted' });
  const wrongPrior = await update(store, indexer({ generation_id: 'g4', expected_prior: null }), worker);
  assert.deepEqual({ status: wrongPrior.status, code: wrongPrior.code }, { status: 'HOLD', code: 'graph_index_prior_mismatch' });
  const lockPath = path.join(store.storeRoot, PROJECT, '00_프로젝트_안내', 'graph_index.lock');
  await writeFile(lockPath, 'another writer');
  const locked = await update(store, indexer({ generation_id: 'g5', expected_prior: first.pointer_sha256 }), worker);
  assert.deepEqual({ status: locked.status, code: locked.code }, { status: 'HOLD', code: 'graph_index_locked' });
  assert.equal(await readFile(lockPath, 'utf8'), 'another writer', 'a foreign lock is never removed');
  await rm(lockPath);
  assert.equal(pointerOf(), first.pointer_sha256);
  assert.deepEqual(await generations(store), ['g1'], 'nothing was written by the refused runs');
  const newModel = cannedWorker({ digest: 'sha256:' + 'e'.repeat(64) });
  const rebuilt = await update(store, indexer({ generation_id: 'g6', expected_prior: first.pointer_sha256 }), newModel);
  assert.deepEqual({ status: rebuilt.status, extracted: rebuilt.counts.extracted, carried: rebuilt.counts.carried },
    { status: 'COMMITTED', extracted: 2, carried: 0 }, 'a new model revision never mixes with carried fragments');
});

test('access, binding and integrity refusals', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const refused = async (request, code, overrides = {}) => {
    const result = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request, now: NOW,
      runWorker: worker.runWorker, ...overrides });
    assert.deepEqual({ status: result.status, code: result.code }, { status: 'HOLD', code }, code);
  };
  await refused(indexer({ generation_id: 'g1', expected_prior: null }), 'graph_index_binding_mismatch', { bindingSha256: 'sha256:' + '0'.repeat(64) });
  await refused({ ...reader, generation_id: 'g1', expected_prior: null }, 'graph_index_access_refused');
  await refused(indexer({ project_ref: ref(2), generation_id: 'g1', expected_prior: null }), 'graph_index_request_refused');
  await refused(indexer({ generation_id: '../g1', expected_prior: null }), 'graph_index_request_refused');
  assert.equal(worker.calls.probe + worker.calls.extract, 0, 'no worker starts before admission');
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  assert.equal(first.status, 'COMMITTED');
  const fragmentPath = path.join(store.storeRoot, openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: reader }).manifest.documents[0].fragment.path);
  const original = await readFile(fragmentPath);
  await writeFile(fragmentPath, Buffer.concat([original, Buffer.from(' ')]));
  assert.throws(() => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader }),
    { code: 'graph_index_file_mismatch' });
  await refused(indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), 'graph_index_file_mismatch');
  await writeFile(fragmentPath, original);
  await store.put(store.aclPath, { ...store.acl, revoked_actors: ['actor:indexer'] });
  await refused(indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), 'graph_index_access_refused');
  await store.put(store.aclPath, store.acl);
  await rm(path.join(store.storeRoot, PROJECT, '60_업무경험'), { recursive: true });
  await refused(indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), 'graph_index_template_invalid');
  const inside = await makeStore({ sourceInsideStore: true });
  const insideResult = await updateGraphIndex({ storeRoot: inside.storeRoot, bindingSha256: inside.bindingSha256,
    request: indexer({ generation_id: 'g1', expected_prior: null }), now: NOW, runWorker: worker.runWorker });
  assert.deepEqual({ status: insideResult.status, code: insideResult.code }, { status: 'HOLD', code: 'graph_index_binding_invalid' });
  const real = await makeStore({ dataClass: 'project_restricted', aclDataClasses: ['project_restricted'] });
  const realResult = await updateGraphIndex({ storeRoot: real.storeRoot, bindingSha256: real.bindingSha256,
    request: indexer({ generation_id: 'g1', expected_prior: null }), now: NOW, runWorker: worker.runWorker });
  assert.deepEqual({ status: realResult.status, code: realResult.code }, { status: 'HOLD', code: 'real_source_preparation_not_admitted' });
});

const PYTHON = process.env.SOULFORGE_TEST_GRAPHRAG_PYTHON;
const MODEL = process.env.SOULFORGE_TEST_GRAPHRAG_LLM;
test('real neo4j-graphrag index: replay asks the model nothing and one change re-extracts one document (opt-in)',
  { skip: PYTHON && MODEL ? false : 'set SOULFORGE_TEST_GRAPHRAG_PYTHON and SOULFORGE_TEST_GRAPHRAG_LLM to run the real worker', timeout: 1800000 },
  async () => {
    const store = await makeStore();
    const host = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
    const embedder = process.env.SOULFORGE_TEST_GRAPHRAG_EMBEDDER || null;
    const binding = { ...store.binding, graph: { worker: { interpreter_path: PYTHON, timeout_ms: 900000 },
      llm: { host, model: MODEL, max_calls: 50, keep_alive: process.env.SOULFORGE_TEST_GRAPHRAG_KEEP_ALIVE || '30s' },
      embedder: embedder ? { host, model: embedder } : null } };
    const { sha256: bindingSha256 } = await store.put(GRAPH_INDEX_BINDING_FILE, binding);
    const run = request => updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request, now: NOW });
    const first = await run(indexer({ generation_id: 'g1', expected_prior: null }));
    assert.equal(first.status, 'COMMITTED', JSON.stringify(first));
    const replay = await run(indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }));
    assert.deepEqual({ status: replay.status, generation: replay.generation_id }, { status: 'UNCHANGED', generation: 'g1' });
    await writeFile(path.join(store.sourceRoot, 'memo-b.md'), '# 전원 조건\n\n전원 조건은 30V로 다시 바뀌었다.\n');
    const changed = await run(indexer({ generation_id: 'g3', expected_prior: first.pointer_sha256 }));
    assert.deepEqual({ status: changed.status, extracted: changed.counts.extracted, carried: changed.counts.carried },
      { status: 'COMMITTED', extracted: 1, carried: 1 });
    const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request: reader });
    const changedDoc = view.manifest.documents.find(row => row.origin === 'extracted');
    assert.equal(changed.llm.calls, changedDoc.units, 'one model call per unit of the changed document only');
    process.stdout.write(`# graph index real run: ${JSON.stringify({ first: { counts: first.counts, llm: first.llm },
      replay: replay.status, changed: { counts: changed.counts, llm: changed.llm }, model: view.manifest.model })}\n`);
  });
