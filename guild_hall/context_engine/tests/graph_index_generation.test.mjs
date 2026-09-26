// Graph index generations in the Plan 17 project store: create-only writes,
// pull-based incremental extraction with carry-forward by exact reference, one
// pointer under a lock and an expected prior, rollback, grant-bound reads,
// degraded extractions that hold, lost locks, and refusals. Unit tests
// use a canned worker (named as such) that counts probe and extraction calls;
// the opt-in test repeats the replay and single-change cases with the real
// neo4j-graphrag worker and a local model.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile, readFile, readdir, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { CANNED_LLM_DIGEST as LLM_DIGEST, CANNED_PACKAGES, CANNED_REJECTED_SHAPE, CANNED_REEMBEDDING, CANNED_REEMBED_DIGEST, CANNED_RULES_SHA256, CANNED_WORKER_SHA256,
  INDEX_MEMOS as MEMOS, INDEX_NOW as NOW, INDEX_PROJECT as PROJECT, READER_REQUEST as reader,
  cannedGraphWorker as cannedWorker, indexerRequest as indexer, makeGraphIndexStore as makeStore } from '../harness/fixtures/graph_index_fixture.mjs';
import { GRAPH_CHECKPOINT_MAX_AGE_MS, GRAPH_EXTRACTION_BATCH, GRAPH_EXTRACTION_CHECKPOINT_AREA, GRAPH_INDEX_AREAS, admitCheckpoint,
  extractionCheckpointKey, extractionRevisionSha256, graphProfilePin, GRAPH_INDEX_BINDING_FILE, carryDecision, extractionBatchLimits, openGraphIndex, planExtractionBatches,
  KNOWN_RULE_EQUIVALENT_WORKERS, reembedGraphIndex, sameModelRevision, selectGraphIndexGeneration,
  updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';

const update = (store, request, worker) => updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request,
  now: NOW, runWorker: worker.runWorker });
const generations = async store => (await readdir(path.join(store.storeRoot, PROJECT, GRAPH_INDEX_AREAS.index, 'generations'))).sort();

test('first update writes a complete generation; replay is a no-op without extraction', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  assert.deepEqual({ status: first.status, epoch: first.selection_epoch, counts: first.counts, changes: first.changes },
    { status: 'COMMITTED', epoch: 1, counts: { documents: 2, extracted: 2, carried: 0, units: 4, chunks: 4, entities: 4, entity_relationships: 0,
      excluded: 0, from_checkpoint: 0 },
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
      // Two parts, not one: the rules that decided this extraction, and the build
      // that ran them. Only the first is what a later run compares against.
      tool: { revision_kind: 'extraction_rules_v1', rules_sha256: CANNED_RULES_SHA256,
        worker_sha256: CANNED_WORKER_SHA256, packages: CANNED_PACKAGES } });
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

test('a degraded extraction leaves out only the refused document; carry decisions and batch plans refuse what they cannot vouch for', async () => {
  const refusing = await makeStore(), store = await makeStore();
  // One refused call inside a one-batch extraction: the document it belongs to is
  // left out and named, the other is committed. Refusing everything holds, and
  // writes no generation at all.
  const allRefused = await update(refusing, indexer({ generation_id: 'g0', expected_prior: null }),
    cannedWorker({ refuseTitles: ['시험 장비', '전원'] }));
  assert.deepEqual({ status: allRefused.status, code: allRefused.code, excluded: allRefused.excluded.length },
    { status: 'HOLD', code: 'graph_extraction_degraded', excluded: 2 });
  assert.equal(existsSync(path.join(refusing.storeRoot, PROJECT, GRAPH_INDEX_AREAS.index, 'generations')), false, 'nothing was written');
  const degraded = await update(refusing, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker({ invalidOutputs: 1 }));
  assert.deepEqual({ status: degraded.status, documents: degraded.counts.documents, excluded: degraded.counts.excluded,
    reason: degraded.excluded[0].reason, invalid: degraded.llm.invalid_outputs },
  { status: 'COMMITTED', documents: 1, excluded: 1, reason: 'extraction_refused', invalid: 1 });
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

// A binding may make worker calls smaller, never larger: one call carries one
// timeout, and a slow model host gets smaller calls rather than a longer wait.
test('the binding lowers the extraction batch bounds; a bound above the program constant is refused', async () => {
  const store = await makeStore(), worker = cannedWorker();
  const small = { ...store.binding, graph: { ...store.binding.graph, extraction_batch: { units: 2 } } };
  const { sha256 } = await store.put(GRAPH_INDEX_BINDING_FILE, small);
  const first = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: sha256, now: NOW, runWorker: worker.runWorker,
    request: indexer({ generation_id: 'g1', expected_prior: null }) });
  assert.equal(first.status, 'COMMITTED');
  assert.deepEqual(worker.calls.batches, [1, 1], 'two documents of two units each: one document per call under units: 2');
  assert.deepEqual(extractionBatchLimits({ units: 1 }), { ...GRAPH_EXTRACTION_BATCH, units: 1 });
  assert.equal(extractionBatchLimits(undefined), GRAPH_EXTRACTION_BATCH);
  for (const bad of [{ units: GRAPH_EXTRACTION_BATCH.units + 1 }, { units: 0 }, { pages: 3 }, { documents: 1.5 }, 'x']) {
    assert.throws(() => extractionBatchLimits(bad), { code: 'graph_index_binding_invalid' });
  }
  const tooLarge = { ...store.binding, graph: { ...store.binding.graph, extraction_batch: { documents: GRAPH_EXTRACTION_BATCH.documents + 1 } } };
  const { sha256: badSha } = await store.put(GRAPH_INDEX_BINDING_FILE, tooLarge);
  const held = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: badSha, now: NOW, runWorker: worker.runWorker,
    request: indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }) });
  assert.deepEqual({ status: held.status, code: held.code }, { status: 'HOLD', code: 'graph_index_binding_invalid' });
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
  assert.equal(currentView.manifest.template_version, 'project-context-template-v2');

  // Not a blanket skip: an area every declared layout requires is still demanded.
  const broken = await makeStore(), worker3 = cannedWorker();
  await rm(path.join(broken.storeRoot, PROJECT, '20_문서검색'), { recursive: true });
  const refused = await update(broken, indexer({ generation_id: 'g1', expected_prior: null }), worker3);
  assert.equal(refused.status, 'HOLD');
  assert.equal(refused.code, 'graph_index_template_invalid');
});

// The estate seam: the same update and read over an aliased io, where the store
// is `data_root/...` and the binding lives under `control_root/...`, and the
// binding may name an admission by address and digest.
test('an aliased estate indexes through the same contract; a mispinned admission holds before any read', async t => {
  const fixture = await import('../harness/fixtures/graph_index_fixture.mjs');
  const { makeSyntheticEstate } = await import('../harness/preparation_flow.mjs');
  const estate = await makeSyntheticEstate({ fixture, now: NOW });
  t.after(() => estate.cleanup());
  const worker = cannedWorker();
  const base = { io: estate.io, bindingAddress: estate.bindingAddress, bindingSha256: estate.bindingSha256, now: NOW, runWorker: worker.runWorker };
  const first = await updateGraphIndex({ ...base, request: indexer({ generation_id: 'g1', expected_prior: null }) });
  assert.deepEqual({ status: first.status, documents: first.counts.documents, extracted: first.counts.extracted },
    { status: 'COMMITTED', documents: 2, extracted: 2 });
  const view = openGraphIndex({ ...base, request: reader });
  assert.equal(view.manifest.generation_id, 'g1');
  assert.equal(view.manifest.admission, null, 'a synthetic grant needs no admission');
  assert.match(view.manifest.documents[0].document.path, /^data_root\/20_PROJECTS\//u);
  // A store address is never a physical path.
  assert.equal(JSON.stringify(view.manifest).includes(os.tmpdir()), false);
  // The binding names an admission whose bytes do not match the pin: held, no generation written.
  const bindingBytes = await readFile(estate.io.path(estate.bindingAddress));
  const binding = JSON.parse(bindingBytes);
  const pinned = { ...binding, admission: { path: 'control_root/project-bindings/synthetic/admission.json', sha256: 'sha256:' + '1'.repeat(64) } };
  const pinnedBytes = Buffer.from(JSON.stringify(pinned));
  await writeFile(estate.io.path('control_root/project-bindings/synthetic/admission.json', true), '{}');
  await writeFile(estate.io.path(estate.bindingAddress), pinnedBytes);
  const sha = `sha256:${createHash('sha256').update(pinnedBytes).digest('hex')}`;
  const held = await updateGraphIndex({ ...base, bindingSha256: sha, request: indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }) });
  assert.deepEqual({ status: held.status, code: held.code }, { status: 'HOLD', code: 'graph_index_admission_mismatch' });
  await writeFile(estate.io.path(estate.bindingAddress), bindingBytes);
  assert.equal(openGraphIndex({ ...base, request: reader }).manifest.generation_id, 'g1');
});

// ---------------------------------------------------------------------------
// Re-embedding: one generation's extraction reused, its search vectors replaced.
// ---------------------------------------------------------------------------

const EMBEDDER = Object.freeze({ host: 'http://127.0.0.1:11434', model: 'embed:tag' });
const SECOND_EMBEDDER = Object.freeze({ host: 'http://127.0.0.1:11434', model: 'embed8:tag' });
// The re-embedding reads a second binding beside the first: same project, same
// grant, a different embedder. The original binding is never rewritten, which is
// how the selected generation stays readable exactly as it was.
async function secondBinding(store, embedder = SECOND_EMBEDDER) {
  const address = 'graph_index_binding.second.json';
  const { sha256 } = await store.put(address, { ...store.binding,
    graph: { ...store.binding.graph, embedder } });
  return { bindingAddress: address, bindingSha256: sha256 };
}
const reembed = async (store, request, worker, binding = null) => reembedGraphIndex({ storeRoot: store.storeRoot,
  ...(binding ?? { bindingSha256: store.bindingSha256 }), request, now: NOW, runWorker: worker.runWorker });
const open = (store, extra = {}) => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader, ...extra });
const codeOf = fn => { try { fn(); return null; } catch (error) { return error.code; } };

test('a re-embedding reuses the extraction as it stands and changes only the vectors and the embedder half of the revision', async () => {
  const store = await makeStore({ embedder: EMBEDDER }), worker = cannedWorker();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  assert.equal(first.status, 'COMMITTED');
  const before = open(store);
  const priorFragments = new Map(before.manifest.documents.map(row => [row.doc_key, before.readFragment(row.doc_key)]));
  const priorRows = new Map(before.manifest.documents.map(row => [row.doc_key, row]));

  const result = await reembed(store, indexer({ generation_id: 'g2', source_generation_id: 'g1' }), worker,
    await secondBinding(store));
  assert.deepEqual({ status: result.status, moved: result.pointer_moved, source: result.source_generation_id,
    llm: result.llm.calls, reembedded: result.counts.reembedded, extracted: result.counts.extracted,
    dimensions: result.embedding.dimensions, model: result.embedding.model, digest: result.embedding.digest },
  { status: 'WRITTEN', moved: false, source: 'g1', llm: 0, reembedded: 2, extracted: 0,
    dimensions: CANNED_REEMBEDDING.length, model: SECOND_EMBEDDER.model, digest: CANNED_REEMBED_DIGEST });
  // Nothing asked the extraction model anything, and every chunk went once to the embedder.
  assert.deepEqual({ extract: worker.calls.extract, probe: worker.calls.probe, embed: worker.calls.embed,
    embedded: worker.calls.embedded.length }, { extract: 1, probe: 1, embed: 1, embedded: 4 });
  assert.deepEqual(await generations(store), ['g1', 'g2']);
  // The pointer did not move: g1 is still what this project has selected.
  assert.deepEqual([open(store).manifest.generation_id, open(store).selected], ['g1', true]);

  // Read back through the original binding: a derived generation is not a second
  // store, and the binding that made it is not the only one that may read it.
  const after = open(store, { generationRef: result.manifest_ref });
  assert.equal(after.manifest.model.embedder, SECOND_EMBEDDER.model);
  assert.deepEqual({ generation: after.manifest.generation_id, selected: after.selected,
    embedder: after.manifest.model.embedder_digest, llm: after.manifest.model.llm_digest,
    source: after.manifest.model.embedding_source, derived: after.manifest.derived_from.generation_id,
    reused: after.manifest.derived_from.reused, coverage: after.manifest.coverage_sha256 === before.manifest.coverage_sha256,
    grant: JSON.stringify(after.manifest.grant) === JSON.stringify(before.manifest.grant) },
  { generation: 'g2', selected: false, embedder: CANNED_REEMBED_DIGEST, llm: LLM_DIGEST, source: 'reembed',
    derived: 'g1', reused: 'extraction', coverage: true, grant: true });

  const CHANGED = ['sf_embedder', 'sf_embedder_digest', 'sf_revision_sha256'];
  const differing = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).sort();
  for (const row of after.manifest.documents) {
    const prior = priorFragments.get(row.doc_key), fragment = after.readFragment(row.doc_key);
    assert.deepEqual(fragment.extraction_reused_from, { generation_id: 'g1', fragment_sha256: prior.fragment_sha256 });
    assert.notEqual(fragment.fragment_sha256, prior.fragment_sha256, 'a new revision is a new fragment digest');
    assert.deepEqual(row.document, priorRows.get(row.doc_key).document, 'the document is carried by reference, not rewritten');
    assert.equal(row.origin, 'reembedded');
    assert.deepEqual(fragment.stats, prior.stats);
    assert.deepEqual(fragment.nodes.map(node => [node.id, node.label]), prior.nodes.map(node => [node.id, node.label]));
    assert.deepEqual(fragment.relationships.map(rel => [rel.type, rel.start_node_id, rel.end_node_id]),
      prior.relationships.map(rel => [rel.type, rel.start_node_id, rel.end_node_id]));
    for (const [index, node] of fragment.nodes.entries()) {
      assert.deepEqual(differing(prior.nodes[index].properties, node.properties), CHANGED,
        'every property but the embedder half of the revision is the extraction as it stands');
      assert.equal(node.properties.sf_model_digest, LLM_DIGEST);
      if (node.label !== 'Chunk') continue;
      assert.deepEqual(node.embedding, [...CANNED_REEMBEDDING]);
      assert.equal(node.embedding_ref.dimensions, CANNED_REEMBEDDING.length);
      assert.notEqual(node.embedding_ref.sha256, prior.nodes[index].embedding_ref.sha256);
    }
    for (const [index, rel] of fragment.relationships.entries()) {
      assert.deepEqual(differing(prior.relationships[index].properties, rel.properties), CHANGED);
    }
  }
  // The source generation's own files are byte for byte what they were.
  for (const row of before.manifest.documents) {
    assert.deepEqual(open(store).readFragment(row.doc_key), priorFragments.get(row.doc_key));
  }
});

test('a re-embedded generation still carries its extraction forward; a model that actually changed does not', async () => {
  // `sameModelRevision` compares every field the probe reported and ignores what a
  // stored record carries beyond them. The derivation note a re-embedding writes is
  // the case that mattered: comparing the records whole made 153 chunks unreusable.
  const tool = { revision_kind: 'extraction_rules_v1', rules_sha256: CANNED_RULES_SHA256,
    worker_sha256: CANNED_WORKER_SHA256, packages: CANNED_PACKAGES };
  const probed = { llm: 'local-model:tag', llm_digest: LLM_DIGEST, embedder: 'embed8:tag',
    embedder_digest: CANNED_REEMBED_DIGEST, tool };
  assert.equal(sameModelRevision({ ...probed, embedding_source: 'reembed' }, probed), true,
    'how the vectors came to be is not part of the model revision; the embedder and its digest are');
  assert.equal(sameModelRevision({ ...probed, embedder_digest: LLM_DIGEST }, probed), false);
  const { embedder_digest: dropped, ...missing } = probed;
  assert.equal(sameModelRevision(missing, probed), false, 'a record that lacks a field the probe reported is not the same revision');

  // The whole worker file is a record, not the gate. A build that changed its
  // search or its logging kept the rules, and a stored extraction still stands.
  assert.equal(sameModelRevision({ ...probed, tool: { ...tool, worker_sha256: 'sha256:' + '4'.repeat(64) } }, probed), true,
    'a different build with the same rules is the same rules');
  assert.equal(sameModelRevision({ ...probed, tool: { ...tool, rules_sha256: 'sha256:' + '5'.repeat(64) } }, probed), false,
    'a changed rule is a changed revision, whatever the file hash says');
  assert.equal(sameModelRevision({ ...probed, tool: { ...tool, packages: { ...CANNED_PACKAGES, 'neo4j-graphrag': '9.9.9' } } }, probed),
    false, 'the tool version that did the extraction is part of it');

  // A record written before the rules had a name carries only the file hash. It is
  // accepted only when that exact build's rules were measured and are these rules.
  const [legacyWorker, legacyRules] = Object.entries(KNOWN_RULE_EQUIVALENT_WORKERS)[0];
  const legacy = { ...probed, tool: { worker_sha256: legacyWorker, packages: CANNED_PACKAGES } };
  assert.equal(sameModelRevision(legacy, { ...probed, tool: { ...tool, rules_sha256: legacyRules } }), true,
    'the build that wrote the first eleven generations had these rules, measured from its own bytes');
  assert.equal(sameModelRevision(legacy, probed), false,
    'and it is not accepted against rules it was never measured to have');
  assert.equal(sameModelRevision({ ...probed, tool: { worker_sha256: 'sha256:' + '6'.repeat(64), packages: CANNED_PACKAGES } }, probed),
    false, 'a build nobody measured carries no claim about its rules');

  // End to end: build, re-embed, select the derived generation, then update through
  // the second embedder's binding. The extraction is carried, not run again.
  const store = await makeStore({ embedder: EMBEDDER });
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker());
  const second = await secondBinding(store);
  const derived = await reembed(store, indexer({ generation_id: 'g2', source_generation_id: 'g1' }), cannedWorker(), second);
  assert.equal(derived.status, 'WRITTEN');
  const selected = await selectGraphIndexGeneration({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexer({ generation_ref: derived.manifest_ref, expected_prior: first.pointer_sha256 }) });
  assert.equal(selected.status, 'COMMITTED');
  assert.equal(open(store).manifest.model.embedding_source, 'reembed', 'the selected generation carries the derivation note');

  // The worker that answers this update reports the re-embedder as the bound one.
  const worker = cannedWorker({ embedderDigest: CANNED_REEMBED_DIGEST });
  await writeFile(path.join(store.sourceRoot, 'memo-b.md'), '# 전원 조건\n\n전원 조건은 32V로 다시 바뀌었다.\n');
  const third = await updateGraphIndex({ storeRoot: store.storeRoot, bindingAddress: second.bindingAddress,
    bindingSha256: second.bindingSha256, now: NOW, runWorker: worker.runWorker,
    request: indexer({ generation_id: 'g3', expected_prior: selected.pointer_sha256 }) });
  assert.deepEqual({ status: third.status, extracted: third.counts.extracted, carried: third.counts.carried },
    { status: 'COMMITTED', extracted: 1, carried: 1 }, 'only the document whose text changed went to the model');
  assert.equal(worker.calls.extracted.length, 1);
  const carriedRow = open(store, { generationRef: third.manifest_ref }).manifest.documents.find(row => row.origin === 'carried');
  assert.equal(carriedRow.fragment.path.includes('/generations/g2/'), true,
    'the carried fragment is the re-embedded one, by reference');

  // The negative: an embedder that really is a different one carries nothing.
  const other = cannedWorker({ embedderDigest: 'sha256:' + '3'.repeat(64) });
  const fourth = await updateGraphIndex({ storeRoot: store.storeRoot, bindingAddress: second.bindingAddress,
    bindingSha256: second.bindingSha256, now: NOW, runWorker: other.runWorker,
    request: indexer({ generation_id: 'g4', expected_prior: third.pointer_sha256 }) });
  assert.deepEqual({ status: fourth.status, extracted: fourth.counts.extracted, carried: fourth.counts.carried },
    { status: 'COMMITTED', extracted: 2, carried: 0 });
});

test('a chunk the embedder will not take holds the re-embedding, and a source that is not the selected generation never reaches it', async () => {
  const store = await makeStore({ embedder: EMBEDDER });
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker());
  assert.equal(first.status, 'COMMITTED');
  const refusing = cannedWorker({ embedRefuses: ['u0001'] });
  const held = await reembed(store, indexer({ generation_id: 'g2', source_generation_id: 'g1' }), refusing);
  assert.deepEqual({ status: held.status, code: held.code }, { status: 'HOLD', code: 'embed_input_refused' });
  assert.equal(held.refused[0].unit_id, 'u0001', 'a chunk too long is named with its size, never cut in silence');
  assert.equal(Number.isSafeInteger(held.refused[0].characters), true);
  assert.deepEqual(await generations(store), ['g1'], 'a partial re-embedding is not a generation');

  const wrongSource = cannedWorker();
  const refused = await reembed(store, indexer({ generation_id: 'g3', source_generation_id: 'g0' }), wrongSource);
  assert.deepEqual({ status: refused.status, code: refused.code, embed: wrongSource.calls.embed },
    { status: 'HOLD', code: 'graph_index_source_not_selected', embed: 0 });
});

test('a generation opened by name is held to the grant, the access and the store area the selected one is', async () => {
  const store = await makeStore({ embedder: EMBEDDER }), worker = cannedWorker();
  await update(store, indexer({ generation_id: 'g1', expected_prior: null }), worker);
  const derived = await reembed(store, indexer({ generation_id: 'g2', source_generation_id: 'g1' }), worker);
  assert.equal(derived.status, 'WRITTEN');
  assert.equal(open(store, { generationRef: derived.manifest_ref }).manifest.generation_id, 'g2');

  // A ref outside this project's index area is not a generation, whatever it holds.
  assert.equal(codeOf(() => open(store, { generationRef: { path: `${PROJECT}/00_프로젝트_안내/acl.json`,
    sha256: derived.manifest_ref.sha256 } })), 'graph_index_ref_invalid');
  // A ref whose bytes are not the ones it names is refused before it is read as one.
  assert.equal(codeOf(() => open(store, { generationRef: { ...derived.manifest_ref, sha256: `sha256:${'0'.repeat(64)}` } })),
    'graph_index_file_mismatch');
  // The ACL admits the named generation no differently from the selected one.
  await store.put(store.aclPath, { ...store.acl, revoked_actors: ['actor:reader'] });
  assert.equal(codeOf(() => open(store, { generationRef: derived.manifest_ref })), 'graph_index_access_refused');
  assert.equal(codeOf(() => open(store)), 'graph_index_access_refused');
  // And so is the grant the generation was built from.
  await store.put(store.aclPath, store.acl);
  const moved = await store.put(GRAPH_INDEX_BINDING_FILE, { ...store.binding,
    grant: { ...store.binding.grant, sha256: `sha256:${'1'.repeat(64)}` } });
  assert.equal(codeOf(() => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: moved.sha256, request: reader,
    generationRef: derived.manifest_ref })), 'graph_index_grant_changed');
});

// Partial commit, checkpoints and refusal diagnostics. One document per worker
// call, so "a batch" and "a document" are the same thing and a refusal is exact.
async function oneDocumentBatches() {
  const store = await makeStore();
  const { sha256 } = await store.put(GRAPH_INDEX_BINDING_FILE,
    { ...store.binding, graph: { ...store.binding.graph, extraction_batch: { documents: 1 } } });
  return { ...store, bindingSha256: sha256 };
}
const checkpointFiles = async store => {
  try { return await readdir(path.join(store.storeRoot, PROJECT, GRAPH_EXTRACTION_CHECKPOINT_AREA)); } catch { return []; }
};

test('one refused batch leaves the others committed; the refused document is listed with its reason and text-free shape', async () => {
  const store = await oneDocumentBatches(), refusing = cannedWorker({ refuseTitles: ['전원'] });
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), refusing);
  assert.deepEqual(refusing.calls.batches, [1, 1], 'both batches ran; the refusal in one did not stop the other');
  assert.deepEqual({ status: first.status, documents: first.counts.documents, excluded: first.counts.excluded },
    { status: 'COMMITTED', documents: 1, excluded: 1 });
  const [left] = first.excluded;
  assert.deepEqual({ item_id: left.item_id, root_ref: left.root_ref, reason: left.reason, calls: left.calls.map(row => row.status),
    shape: left.rejected_shapes[0] },
  { item_id: 'memo-b', root_ref: 'doc.synthetic', reason: 'extraction_refused', calls: ['invalid_output', 'invalid_output'],
    shape: { ...CANNED_REJECTED_SHAPE } });
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  assert.deepEqual(view.manifest.documents.map(row => row.item_id), ['memo-a']);
  assert.deepEqual(view.manifest.excluded, [{ doc_key: left.doc_key, source_kind: 'document', root_ref: 'doc.synthetic',
    item_id: 'memo-b', reason: 'extraction_refused' }]);
  const quality = view.readQuality();
  assert.deepEqual(quality.excluded.map(row => [row.item_id, row.reason]), [['memo-b', 'extraction_refused']]);
  const said = JSON.stringify({ excluded: first.excluded, quality: quality.excluded, manifest: view.manifest.excluded });
  for (const text of ['전원', '28V', '24V', '시험 장비']) assert.equal(said.includes(text), false, `no source text: ${text}`);

  // The same refusal again: nothing new to write, so the selected generation stands.
  const again = await update(store, indexer({ generation_id: 'g2', expected_prior: first.pointer_sha256 }), refusing);
  assert.deepEqual({ status: again.status, generation: again.generation_id, excluded: again.excluded.map(row => row.item_id),
    previously: again.excluded[0].previously_excluded }, { status: 'UNCHANGED', generation: 'g1', excluded: ['memo-b'], previously: true });
  assert.deepEqual(refusing.calls.batches, [1, 1, 1], 'only the left-out document was asked about again');
  assert.deepEqual(await generations(store), ['g1']);

  // The model stops refusing: only that document is extracted, the rest carried.
  const cooperative = cannedWorker();
  const healed = await update(store, indexer({ generation_id: 'g3', expected_prior: first.pointer_sha256 }), cooperative);
  assert.deepEqual({ status: healed.status, extracted: healed.counts.extracted, carried: healed.counts.carried, excluded: healed.counts.excluded,
    calls: cooperative.calls.batches }, { status: 'COMMITTED', extracted: 1, carried: 1, excluded: 0, calls: [1] });
});

test('accepted batches are checkpointed: a run held by a failed call is resumed without asking the model about them again', async () => {
  const store = await oneDocumentBatches();
  const failing = cannedWorker({ failTitles: ['전원'] });
  const held = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), failing);
  assert.deepEqual({ status: held.status, code: held.code, written: held.checkpoints.written },
    { status: 'HOLD', code: 'graph_worker_timeout', written: 1 });
  assert.equal(existsSync(path.join(store.storeRoot, PROJECT, GRAPH_INDEX_AREAS.index, 'generations')), false, 'a held run writes no generation');
  const kept = await checkpointFiles(store);
  assert.equal(kept.length, 1, 'the accepted document was kept');
  assert.deepEqual({ files: held.checkpoints.files, bytes: held.checkpoints.bytes > 0 }, { files: 1, bytes: true },
    'a held run reports the checkpoint area it leaves');
  const body = JSON.parse(await readFile(path.join(store.storeRoot, PROJECT, GRAPH_EXTRACTION_CHECKPOINT_AREA, kept[0]), 'utf8'));

  const resumed = cannedWorker();
  const done = await update(store, indexer({ generation_id: 'g2', expected_prior: null }), resumed);
  assert.deepEqual({ status: done.status, from_checkpoint: done.counts.from_checkpoint, reused: done.checkpoints.reused,
    extracted: done.counts.extracted, calls: resumed.calls.extracted.length },
  { status: 'COMMITTED', from_checkpoint: 1, reused: 1, extracted: 2, calls: 1 });
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  assert.deepEqual(view.manifest.documents.map(row => [row.item_id, row.from_checkpoint === true]),
    [['memo-a', true], ['memo-b', false]]);
  for (const row of view.manifest.documents) assert.equal(view.readFragment(row.doc_key).stats.chunks, 2);

  // The committed generation holds both fragments now: both checkpoints are pruned.
  assert.deepEqual({ pruned: done.checkpoints.pruned, files: done.checkpoints.files, left: (await checkpointFiles(store)).length },
    { pruned: 2, files: 0, left: 0 });

  // A checkpoint is re-verified, never trusted: an altered one is a miss.
  const admit = value => admitCheckpoint({ bytes: Buffer.from(JSON.stringify(value)), key: body.key,
    document: view.readDocument(body.fragment.doc_key), projectKey: view.manifest.project_key, models: view.manifest.model });
  assert.ok(admit(body), 'the stored checkpoint verifies as it is');
  const altered = structuredClone(body);
  altered.fragment.nodes[0].properties.title = 'altered';
  assert.equal(admit(altered), null, 'a changed node breaks its own fragment hash');
  assert.equal(admit({ ...body, key: 'sha256:' + '0'.repeat(64) }), null, 'a checkpoint under another key is not this one');
  assert.equal(admit({ ...body, fragment: { ...body.fragment, model: { ...body.fragment.model, llm_digest: 'sha256:' + '0'.repeat(64) } } }),
    null, 'another model revision is never reused');
});

test('a refused answer’s outline is kept only when it carries no text', async () => {
  const store = await oneDocumentBatches();
  const leaky = cannedWorker({ refuseTitles: ['전원'], rejectedShape: { ...CANNED_REJECTED_SHAPE,
    skeleton: '{"nodes": [{"id": "전원 28V"', unknown_top_level_key_names: ['entities', '전원조건', 'x y'] } });
  const result = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), leaky);
  const [shape] = result.excluded[0].rejected_shapes;
  assert.equal(Object.hasOwn(shape, 'skeleton'), false, 'an outline with text in it is dropped whole');
  assert.deepEqual(shape.unknown_top_level_key_names, ['entities']);
  assert.equal(JSON.stringify(result.excluded).includes('전원'), false);
});

test('when a refusal cannot be placed on a record, the whole batch is left out rather than guessed', async () => {
  const store = await makeStore();
  // One batch of both documents; the refused one's call trace comes back one row short.
  const unplaceable = cannedWorker({ refuseTitles: ['전원'], dropTraceRows: 1 });
  const held = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), unplaceable);
  assert.deepEqual({ status: held.status, code: held.code, excluded: held.excluded.map(row => row.reason) },
    { status: 'HOLD', code: 'graph_extraction_degraded', excluded: ['extraction_unattributed', 'extraction_unattributed'] });
  // The same refusal with a whole trace is placed on its own document.
  const placeable = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker({ refuseTitles: ['전원'] }));
  assert.deepEqual({ status: placeable.status, excluded: placeable.excluded.map(row => [row.item_id, row.reason]) },
    { status: 'COMMITTED', excluded: [['memo-b', 'extraction_refused']] });
});

test('a checkpoint key moves with the profile schema, the rules, the worker build and the unit boundaries', async () => {
  const store = await makeStore();
  await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker());
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  const document = view.readDocument(view.manifest.documents[0].doc_key), models = view.manifest.model;
  const key = changes => extractionCheckpointKey({ document, projectKey: view.manifest.project_key, models, ...changes });
  const base = key({});
  assert.equal(key({ profile: graphProfilePin() }), base, 'the default profile is the pinned one');
  assert.notEqual(key({ profile: { ...graphProfilePin(), schema_sha256: 'sha256:' + '1'.repeat(64) } }), base, 'profile schema');
  assert.notEqual(key({ models: { ...models, tool: { ...models.tool, rules_sha256: 'sha256:' + '2'.repeat(64) } } }), base, 'rules');
  assert.notEqual(key({ models: { ...models, tool: { ...models.tool, worker_sha256: 'sha256:' + '3'.repeat(64) } } }), base, 'worker build');
  assert.notEqual(key({ models: { ...models, options: { ...models.options, seed: 8 } } }), base, 'model options');
  const joined = { ...document, units: [{ ...document.units[0], text: document.units.map(unit => unit.text).join('') }] };
  assert.notEqual(extractionCheckpointKey({ document: joined, projectKey: view.manifest.project_key, models }), base,
    'the same text cut at other unit boundaries');
  // What a ledger compares to decide whether to offer a given-up document again:
  // the rules and the model, not the worker file.
  const revision = extractionRevisionSha256(models);
  assert.equal(extractionRevisionSha256({ ...models, tool: { ...models.tool, worker_sha256: 'sha256:' + '3'.repeat(64) } }), revision);
  assert.notEqual(extractionRevisionSha256({ ...models, tool: { ...models.tool, rules_sha256: 'sha256:' + '2'.repeat(64) } }), revision);
});

test('after a commit, embodied and aged-out checkpoints are pruned; nothing else in the area is touched', async () => {
  const store = await oneDocumentBatches();
  await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker({ failTitles: ['전원'] }));
  const area = path.join(store.storeRoot, PROJECT, GRAPH_EXTRACTION_CHECKPOINT_AREA);
  const orphan = path.join(area, `${'9'.repeat(64)}.json`), recent = path.join(area, `${'8'.repeat(64)}.json`);
  const other = path.join(area, 'README.txt');
  for (const file of [orphan, recent, other]) await writeFile(file, '{}');
  const old = new Date(Date.now() - GRAPH_CHECKPOINT_MAX_AGE_MS - 60_000);
  await utimes(orphan, old, old);
  const done = await update(store, indexer({ generation_id: 'g2', expected_prior: null }), cannedWorker());
  assert.deepEqual({ status: done.status, pruned: done.checkpoints.pruned, files: done.checkpoints.files },
    { status: 'COMMITTED', pruned: 3, files: 1 }, 'two embodied + one orphan pruned; the recent unknown one is kept');
  assert.deepEqual((await readdir(area)).sort(), ['8'.repeat(64) + '.json', 'README.txt']);
});

test('a generation that leaves documents out must account for every prepared item', async () => {
  const store = await oneDocumentBatches();
  const first = await update(store, indexer({ generation_id: 'g1', expected_prior: null }), cannedWorker({ refuseTitles: ['전원'] }));
  assert.equal(first.status, 'COMMITTED');
  const manifest = JSON.parse(await readFile(path.join(store.storeRoot, first.manifest_ref.path), 'utf8'));
  const forged = async (id, change) => {
    const body = { ...manifest, generation_id: id, ...change };
    return store.put(`${PROJECT}/${GRAPH_INDEX_AREAS.index}/generations/${id}/generation.json`, body);
  };
  const open = generationRef => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader,
    generationRef });
  assert.equal(open(first.manifest_ref).manifest.excluded.length, 1, 'the committed generation accounts for all of it');
  const gx1 = await forged('gx1', { excluded: [] });
  assert.throws(() => open(gx1), { code: 'graph_index_manifest_incomplete' }, 'a silently dropped document');
  const gx2 = await forged('gx2', { excluded: [...manifest.excluded, { ...manifest.excluded[0] }] });
  assert.throws(() => open(gx2), { code: 'graph_index_manifest_invalid' }, 'a document named twice');
  const gx3 = await forged('gx3', { excluded: [{ ...manifest.excluded[0], doc_key: manifest.documents[0].doc_key }] });
  assert.throws(() => open(gx3), { code: 'graph_index_manifest_invalid' }, 'a document both held and left out');
  const { excluded, ...legacy } = manifest;
  const legacyRef = await store.put(`${PROJECT}/${GRAPH_INDEX_AREAS.index}/generations/gx4/generation.json`,
    { ...legacy, generation_id: 'gx4' });
  assert.equal(open(legacyRef).manifest.generation_id, 'gx4', 'a generation from before `excluded` is read as before');
});
