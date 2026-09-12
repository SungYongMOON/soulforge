// Graph index generations in the Plan 17 project store: create-only writes,
// pull-based incremental extraction with carry-forward by exact reference, one
// pointer under a lock and an expected prior, rollback, grant-bound reads,
// degraded extractions that hold, lost locks, and refusals. Unit tests
// use a canned worker (named as such) that counts probe and extraction calls;
// the opt-in test repeats the replay and single-change cases with the real
// neo4j-graphrag worker and a local model.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { CANNED_LLM_DIGEST as LLM_DIGEST, CANNED_PACKAGES, CANNED_WORKER_SHA256, INDEX_MEMOS as MEMOS, INDEX_NOW as NOW, INDEX_PROJECT as PROJECT, READER_REQUEST as reader,
  cannedGraphWorker as cannedWorker, indexerRequest as indexer, makeGraphIndexStore as makeStore } from '../harness/fixtures/graph_index_fixture.mjs';
import { GRAPH_INDEX_AREAS, GRAPH_INDEX_BINDING_FILE, carryDecision, openGraphIndex, planExtractionBatches,
  selectGraphIndexGeneration, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';

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
    assert.deepEqual(fragment.model, { llm: 'local-model:tag', llm_digest: LLM_DIGEST, llm_pin_kind: 'model_digest',
      transport: 'ollama', think: false,
      options: { num_predict: 2048, seed: 7, temperature: 0 }, embedder: null, embedder_digest: null,
      tool: { worker_sha256: CANNED_WORKER_SHA256, packages: CANNED_PACKAGES } });
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

test('a degraded extraction holds the index; carry decisions and batch plans refuse what they cannot vouch for', async () => {
  const store = await makeStore();
  const degraded = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker({ invalidOutputs: 1 }));
  assert.deepEqual({ status: degraded.status, code: degraded.code, invalid: degraded.degraded.invalid_outputs },
    { status: 'HOLD', code: 'graph_extraction_degraded', invalid: 1 });
  assert.equal(existsSync(path.join(store.storeRoot, PROJECT, GRAPH_INDEX_AREAS.index, 'generations')), false, 'nothing was written');
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker());
  assert.equal(first.status, 'COMMITTED');
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  const row = view.manifest.documents[0], fragment = view.readFragment(row.doc_key), document = view.readDocument(row.doc_key);
  const decide = changed => carryDecision({ row, fragment: { ...fragment, ...changed }, document,
    projectKey: view.manifest.project_key, models: view.manifest.model });
  assert.equal(decide({}), 'carry');
  assert.equal(decide({ source_text_sha256: 'sha256:' + '0'.repeat(64) }), 'extract', 'a fragment admitted against other text is re-extracted');
  assert.equal(decide({ stats: { ...fragment.stats, chunks_mismatched: 1 } }), 'extract', 'a degraded fragment is never carried');
  assert.throws(() => decide({ doc_key: 'sha256:' + '0'.repeat(64) }), { code: 'graph_index_carry_invalid' });
  assert.throws(() => decide({ model: { ...fragment.model, llm_digest: 'sha256:' + '0'.repeat(64) } }), { code: 'graph_index_carry_invalid' });
  const documents = view.manifest.documents.map(item => view.readDocument(item.doc_key));
  assert.deepEqual(planExtractionBatches(documents).map(batch => batch.length), [2]);
  assert.deepEqual(planExtractionBatches(documents, { documents: 1, units: 100, characters: 100000 }).map(batch => batch.length), [1, 1]);
  assert.throws(() => planExtractionBatches(documents, { documents: 5, units: 1, characters: 100000 }), { code: 'graph_index_document_too_large' });
});

test('a changed grant blocks reads and rollback of older generations until the index is rebuilt; readers need every data class', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  const narrowed = JSON.parse(await readFile(path.join(store.storeRoot, store.binding.grant.path), 'utf8'));
  narrowed.sources[0].items = narrowed.sources[0].items.filter(item => item.item_id === 'memo-a');
  const grant = await store.put(`${PROJECT}/00_프로젝트_안내/grants/grant.synthetic.index.v2.json`, narrowed);
  const { sha256: bindingSha256 } = await store.put(GRAPH_INDEX_BINDING_FILE, { ...store.binding, grant });
  const readerView = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request: reader });
  assert.throws(readerView, { code: 'graph_index_grant_changed' }, 'the broader earlier generation is not served under the narrowed grant');
  const rollback = await selectGraphIndexGeneration({ storeRoot: store.storeRoot, bindingSha256,
    request: indexer({ generation_ref: first.manifest_ref, expected_prior: first.pointer_sha256 }) });
  assert.deepEqual({ status: rollback.status, code: rollback.code }, { status: 'HOLD', code: 'graph_index_grant_changed' });
  const rebuilt = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256, now: NOW, runWorker: worker.runWorker,
    request: indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }) });
  assert.deepEqual({ status: rebuilt.status, documents: rebuilt.counts.documents, carried: rebuilt.counts.carried,
    extracted: rebuilt.counts.extracted, removed: rebuilt.changes.removed },
  { status: 'COMMITTED', documents: 1, carried: 1, extracted: 0, removed: 1 }, 'a rebuild under the new grant carries what stays');
  assert.deepEqual(readerView().manifest.documents.map(item => item.item_id), ['memo-a']);
  await store.put(store.aclPath, { ...store.acl, actors: store.acl.actors.map(actor => actor.actor_ref === 'actor:reader'
    ? { ...actor, grant: { ...actor.grant, allowed_data_classes: [] } } : actor) });
  assert.throws(readerView, { code: 'graph_index_access_refused' }, 'a reader must be admitted to every data class in the generation');
});

test('writers: concurrent updates commit once, a lost lock holds, and a failed release after the commit is reported', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const both = await Promise.all([update(store, indexer({ generation_id: 'ga', expected_prior: null }), worker),
    update(store, indexer({ generation_id: 'gb', expected_prior: null }), worker)]);
  assert.deepEqual(both.map(result => result.status).sort(), ['COMMITTED', 'HOLD']);
  assert.equal(both.find(result => result.status === 'HOLD').code, 'graph_index_locked');
  const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  const current = view().pointer_sha256;
  await writeFile(path.join(store.sourceRoot, 'memo-a.md'), '# 시험 장비 A\n\n장표 제출이 하루 늦어졌다.\n');
  const lockPath = path.join(store.storeRoot, PROJECT, '00_프로젝트_안내', 'graph_index.lock');
  const lost = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, now: NOW, runWorker: worker.runWorker,
    request: indexer({ generation_id: 'gc', expected_prior: current }), hooks: { beforeCommit: () => writeFile(lockPath, 'someone else') } });
  assert.deepEqual({ status: lost.status, code: lost.code }, { status: 'HOLD', code: 'graph_index_lock_lost' });
  assert.equal(view().pointer_sha256, current, 'the pointer did not move');
  assert.equal(await readFile(lockPath, 'utf8'), 'someone else', 'a lock no longer ours is left alone');
  await rm(lockPath);
  const cleanupFailed = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, now: NOW,
    runWorker: worker.runWorker, request: indexer({ generation_id: 'gd', expected_prior: current }), hooks: { afterCommit: () => rm(lockPath) } });
  assert.deepEqual({ status: cleanupFailed.status, code: cleanupFailed.code }, { status: 'COMMITTED_CLEANUP_FAILED', code: 'graph_index_lock_lost' });
  assert.equal(view().manifest.generation_id, 'gd', 'the committed generation is current');
  assert.equal(view().manifest.writer.epoch, 2);
  assert.match(view().manifest.writer.acl_sha256, /^sha256:/u);
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

// The compatibility this versioning exists for. A store formed before a source
// kind was declared must keep working the moment the kind is added, and the
// generation must say which layout it was read at rather than leaving a reader
// to guess. Removing a directory every version requires is still refused.
test('a store formed under the older layout still indexes, and says which layout it held', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const linear = path.join(store.storeRoot, PROJECT, '10_입력자료', 'LINEAR');
  assert.equal(existsSync(linear), true, 'the fixture builds the current layout');
  // Make it exactly the older layout: the kind that did not exist yet is absent.
  await rm(linear, { recursive: true });
  const older = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  assert.equal(older.status, 'COMMITTED');
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  assert.equal(view.manifest.template_version, 'project-context-template-v0');

  // The same store with the kind present is read as today's layout.
  const current = await makeStore(), worker2 = cannedWorker();
  await update(current, indexer({ generation_id: 'g1', expected_prior: null }), worker2);
  const currentView = openGraphIndex({ storeRoot: current.storeRoot, bindingSha256: current.bindingSha256, request: reader });
  assert.equal(currentView.manifest.template_version, 'project-context-template-v1');

  // Not a blanket skip: an area every declared layout requires is still demanded.
  const broken = await makeStore(), worker3 = cannedWorker();
  await rm(path.join(broken.storeRoot, PROJECT, '20_문서검색'), { recursive: true });
  const refused = await update(broken, indexer({ generation_id: 'g1', expected_prior: null }), worker3);
  assert.equal(refused.status, 'HOLD');
  assert.equal(refused.code, 'graph_index_template_invalid');
});
