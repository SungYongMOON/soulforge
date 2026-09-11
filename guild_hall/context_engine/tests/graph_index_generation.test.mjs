// Graph index generations in the Plan 17 project store: create-only writes,
// pull-based incremental extraction with carry-forward by exact reference, one
// pointer under a lock and an expected prior, rollback, and refusals. Unit tests
// use a canned worker (named as such) that counts probe and extraction calls;
// the opt-in test repeats the replay and single-change cases with the real
// neo4j-graphrag worker and a local model.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { exactRefIdentityKey } from '../../engineering_engine/kernel/identity.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE as TEMPLATE } from '../../path_registry/src/target_materializer.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { GRAPH_INDEX_AREAS, GRAPH_INDEX_BINDING_FILE, GRAPH_INDEX_BINDING_MODE, graphProfilePin, openGraphIndex,
  selectGraphIndexGeneration, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const FS_KEY = 'P-SYN-GRAPH';
const PROJECT = `data_root/20_PROJECTS/${FS_KEY}`;
const MEMOS = {
  'memo-a.md': '# 시험 장비 A 설계 메모\n\n요청자가 응답기 장표를 다음 주 화요일까지 요청했다.\n',
  'memo-b.md': '# 전원 조건\n\n전원 조건은 28V로 바뀌었고 이전 24V 조건은 취소한다.\n',
};
const LLM_DIGEST = 'sha256:' + 'c'.repeat(64);
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const indexer = extra => ({ actor_ref: 'actor:indexer', project_ref: ref(1), purpose: 'context_preparation', ...extra });
const reader = { actor_ref: 'actor:reader', project_ref: ref(1), purpose: 'context_query' };

async function makeStore({ dataClass = 'public_synthetic', aclDataClasses = ['public_synthetic'], sourceInsideStore = false } = {}) {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-index-store-'));
  const sourceRoot = sourceInsideStore ? path.join(storeRoot, 'sources') : await mkdtemp(path.join(os.tmpdir(), 'ctx-index-src-'));
  await mkdir(sourceRoot, { recursive: true });
  for (const [name, text] of Object.entries(MEMOS)) await writeFile(path.join(sourceRoot, name), text);
  for (const dir of TEMPLATE) await mkdir(path.join(storeRoot, PROJECT, dir), { recursive: true });
  const put = async (rel, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    await mkdir(path.dirname(path.join(storeRoot, rel)), { recursive: true });
    await writeFile(path.join(storeRoot, rel), bytes);
    return { path: rel, sha256: sha(bytes) };
  };
  const projectKey = exactRefIdentityKey(ref(1));
  const grant = await put(`${PROJECT}/00_프로젝트_안내/grants/grant.synthetic.index.json`, { schema_version: SOURCE_GRANT_SCHEMA,
    grant_id: 'grant.synthetic.index', project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: [dataClass],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind: 'document', root_ref: 'doc.synthetic',
      items: Object.keys(MEMOS).map(name => ({ item_id: name.replace('.md', ''), revision_policy: 'latest_in_custody', revision_sha256: null,
        data_class: dataClass, path: [name] })) }] });
  const aclPath = `${PROJECT}/00_프로젝트_안내/acl.json`;
  const acl = { actors: [
    { actor_ref: 'actor:indexer', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_preparation', 'context_query'], allowed_data_classes: aclDataClasses } },
    { actor_ref: 'actor:reader', grant: { allowed_projects: [projectKey], allowed_scopes: ['project'],
      allowed_purposes: ['context_query'], allowed_data_classes: aclDataClasses } }], revoked_actors: [] };
  await put(aclPath, acl);
  const binding = { mode: GRAPH_INDEX_BINDING_MODE, project_ref: ref(1), approved_fs_key: FS_KEY, acl_path: aclPath,
    write_authority: { actors: ['actor:indexer'], operations: ['index'] }, grant, source_roots: { 'doc.synthetic': sourceRoot },
    graph: { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
      llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 50 }, embedder: null },
    profile: graphProfilePin() };
  const { sha256: bindingSha256 } = await put(GRAPH_INDEX_BINDING_FILE, binding);
  return { storeRoot, sourceRoot, bindingSha256, binding, put, acl, aclPath };
}

// Canned worker: answers the probe with one model revision and the extraction
// with one chunk and one equipment entity per unit.
function cannedWorker({ digest = LLM_DIGEST, budgetExhausted = false } = {}) {
  const calls = { probe: 0, extract: 0, extracted: [] };
  async function runWorker({ request }) {
    if (request.operation === 'probe') {
      calls.probe++;
      return { exit_code: 0, output: { status: 'ok', models: { llm: { model: request.models.llm.model, digest } } } };
    }
    calls.extract++;
    const fragments = request.documents.map(document => {
      calls.extracted.push(document.doc_key);
      const nodes = [{ id: document.doc_key, label: 'Document', properties: {}, embedding_properties: {} }], relationships = [];
      document.units.forEach((unit, index) => {
        const chunk = `${document.doc_key}:${unit.unit_id}`;
        nodes.push({ id: chunk, label: 'Chunk', properties: { text: unit.text, index, sf_unit_id: unit.unit_id }, embedding_properties: {} });
        nodes.push({ id: `${chunk}:0`, label: 'Equipment', properties: { name: `장비 ${index}` }, embedding_properties: {} });
        relationships.push({ start_node_id: chunk, end_node_id: document.doc_key, type: 'FROM_DOCUMENT', properties: {} });
        relationships.push({ start_node_id: `${chunk}:0`, end_node_id: chunk, type: 'FROM_CHUNK', properties: {} });
      });
      return { doc_key: document.doc_key, nodes, relationships, tool_pruning: { nodes: {}, relationships: {}, properties: {} } };
    });
    const units = request.documents.flatMap(document => document.units);
    return { exit_code: 0, output: { status: 'ok', models: { llm: { model: request.profile.llm.model, digest } }, fragments,
      budget_exhausted: budgetExhausted, llm_calls: units.map((unit, index) => ({ call: index + 1,
        status: budgetExhausted && index > 0 ? 'budget_exhausted' : 'ok', input_sha256: 'sha256:' + 'd'.repeat(64),
        prompt_tokens: 10, output_tokens: 5, elapsed_ms: 3 })) } };
  }
  return { runWorker, calls };
}

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
