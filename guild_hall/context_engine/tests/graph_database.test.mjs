// The graph database side of a project's index: the binding that names it, loading
// one generation into it, and searching that generation back. Unit tests use a
// canned database (named as such) that never speaks to a server; the opt-in test at
// the end repeats the same sequence against a real Neo4j and a local embedder.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cannedGraphDatabaseWorker as cannedDatabase, cannedGraphWorker as cannedWorker, indexerRequest as indexer,
  INDEX_NOW as NOW, makeGraphIndexStore as makeStore, READER_REQUEST as reader } from '../harness/fixtures/graph_index_fixture.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { validateGraphBinding, validateNeo4jBinding } from '../src/runtime/graph_extraction.mjs';
import { createGraphSearch, materializeGraphIndex } from '../src/runtime/graph_database.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';

const code = fn => { try { fn(); return null; } catch (error) { return error.code; } };

// One generation in a store, plus a view of it. `neo4j` and `embedder` decide
// whether that view's binding names a graph database at all.
async function prepared({ neo4j = true, embedder = { host: 'http://127.0.0.1:11434', model: 'embed:tag' } } = {}) {
  const store = await makeStore({ neo4j, embedder });
  const worker = cannedWorker();
  const first = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, now: NOW,
    runWorker: worker.runWorker, request: indexer({ generation_id: 'g1', expected_prior: null }) });
  assert.equal(first.status, 'COMMITTED');
  const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: reader });
  return { store, worker, first, view };
}

// The rows a canned database returns for the units of the view's own generation.
function unitRows(view, count = 2) {
  const rows = [];
  for (const row of view.manifest.documents) {
    for (const unit of view.readDocument(row.doc_key).units) {
      if (rows.length < count) rows.push({ sf_doc_key: row.doc_key, sf_unit_id: unit.unit_id, score: 1 - rows.length * 0.1, seed: rows.length === 0 });
    }
  }
  return rows;
}

test('the neo4j binding takes a loopback bolt address and a real one-line password file, and nothing else', async () => {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'ctx-neo4j-binding-')));
  const passwordFile = path.join(dir, 'neo4j_password.txt');
  await writeFile(passwordFile, 'synthetic-not-a-real-password\n');
  const base = { uri: 'bolt://127.0.0.1:7687', user: 'neo4j', password_file: passwordFile };

  assert.deepEqual({ ...validateNeo4jBinding(base) }, { ...base, database: null });
  assert.equal(validateNeo4jBinding(null), null, 'no graph database is a valid binding, not an error');
  assert.equal(validateNeo4jBinding({ ...base, uri: 'neo4j://localhost:7687' }).uri, 'neo4j://localhost:7687');

  assert.equal(code(() => validateNeo4jBinding({ ...base, uri: 'bolt://10.0.0.5:7687' })), 'graph_neo4j_endpoint_not_loopback');
  assert.equal(code(() => validateNeo4jBinding({ ...base, uri: 'bolt://graph.example.com:7687' })), 'graph_neo4j_endpoint_not_loopback');
  assert.equal(code(() => validateNeo4jBinding({ ...base, uri: 'http://127.0.0.1:7474' })), 'graph_neo4j_endpoint_not_loopback',
    'the browser endpoint is not the bolt endpoint');
  assert.equal(code(() => validateNeo4jBinding({ ...base, user: '' })), 'graph_neo4j_binding_invalid');
  assert.equal(code(() => validateNeo4jBinding({ ...base, database: 'not a token' })), 'graph_neo4j_binding_invalid');
  assert.equal(code(() => validateNeo4jBinding({ ...base, password_file: 'neo4j_password.txt' })), 'graph_neo4j_binding_invalid',
    'a relative password path depends on the working directory');
  assert.equal(code(() => validateNeo4jBinding({ ...base, password_file: path.join(dir, 'absent.txt') })), 'graph_neo4j_password_file_missing');
  assert.equal(code(() => validateNeo4jBinding({ ...base, password_file: dir })), 'graph_neo4j_password_file_refused');

  // A link would let the file the binding names and the file that is read differ.
  const link = path.join(dir, 'linked.txt');
  let linked = true;
  try { await symlink(passwordFile, link); } catch { linked = false; }
  if (linked) {
    assert.equal(code(() => validateNeo4jBinding({ ...base, password_file: link })), 'graph_neo4j_password_file_refused');
  }
  await rm(dir, { recursive: true, force: true });
});

test('a store binding carries the graph database into the view it opens', async () => {
  const withDatabase = await prepared();
  assert.equal(withDatabase.view().graph_binding.neo4j.uri, 'bolt://127.0.0.1:7687');
  const without = await prepared({ neo4j: false });
  assert.equal(without.view().graph_binding.neo4j, null);
  // The extraction binding is unchanged by the addition: an index still builds
  // without a database, and only loading and searching report it missing.
  assert.equal(validateGraphBinding(without.store.binding.graph).llm.model, 'local-model:tag');
});

test('materialize loads a generation once; the same generation again changes nothing', async () => {
  const { view } = await prepared();
  const database = cannedDatabase();
  const first = await materializeGraphIndex({ view: view(), binding: view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual({ status: first.status, loaded: first.loaded, generation: first.generation_id,
    fragments: first.counts.fragments }, { status: 'ok', loaded: true, generation: 'g1', fragments: 2 });
  assert.deepEqual(first.superseded, []);

  const again = await materializeGraphIndex({ view: view(), binding: view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual({ status: again.status, loaded: again.loaded, code: again.code },
    { status: 'ok', loaded: false, code: 'generation_already_loaded' });
  assert.equal(database.calls.materialize, 2, 'the database decides it already holds it; the APP does not guess');

  // What left the APP is the manifest's own fragments, read back by hash.
  const sent = database.calls.requests[0];
  assert.deepEqual(sent.fragments.map(fragment => fragment.doc_key).sort(),
    view().manifest.documents.map(row => row.doc_key).sort());
  assert.equal(sent.project_key, view().manifest.project_key);
  assert.ok(sent.fragments.every(fragment => Array.isArray(fragment.nodes) && Array.isArray(fragment.relationships)));
});

test('without a graph database, loading and searching say so instead of answering differently', async () => {
  const { view } = await prepared({ neo4j: false });
  const database = cannedDatabase();
  const load = await materializeGraphIndex({ view: view(), binding: view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual({ status: load.status, code: load.code }, { status: 'not_connected', code: 'graph_database_not_connected' });
  assert.equal(database.calls.materialize, 0, 'an unbound database is never called');

  const retriever = createGraphIndexRetriever(view());
  assert.equal(retriever.connected, false);
  for (const mode of ['vector', 'hybrid', 'graph']) {
    const result = await retriever[mode]('전원 조건');
    assert.deepEqual({ mode, status: result.status, code: result.code, hits: result.hits.length },
      { mode, status: 'not_connected', code: 'graph_database_not_connected', hits: 0 });
  }
  // Lexical still answers: the store search does not depend on the database.
  assert.equal(retriever.lexical('전원 조건').status, 'ok');
});

test('a bound database without an embedder cannot be searched, and says which piece is missing', async () => {
  const { view } = await prepared({ embedder: null });
  const search = createGraphSearch({ view: view(), binding: view().graph_binding, runWorker: cannedDatabase().runWorker });
  assert.equal(search.connected, false);
  assert.equal(search.code, 'graph_embedder_not_bound');
  assert.deepEqual(await search.vector('전원'), { status: 'not_connected', code: 'graph_embedder_not_bound', mode: 'vector', hits: [] });
});

test('vector, hybrid and graph search return only units this generation holds', async () => {
  const { view } = await prepared();
  const current = view();
  const rows = unitRows(current, 2);
  const foreign = { sf_doc_key: 'sha256:' + 'a'.repeat(64), sf_unit_id: 'u-not-here', score: 0.5, seed: false };
  const database = cannedDatabase({ hits: [...rows, foreign], loaded: 'g1' });
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });
  assert.equal(retriever.connected, true);

  for (const mode of ['vector', 'hybrid', 'graph']) {
    const result = await retriever[mode]('전원 조건', 5);
    assert.equal(result.status, 'ok', mode);
    assert.equal(result.hits.length, 2, `${mode}: the row from outside the generation is not served`);
    assert.deepEqual(result.receipt, { mode, requested_top_k: 5, returned: 3, admitted: 2,
      not_in_generation: 1, dropped_out_of_generation: 0 });
    // Every hit carries the provenance a citation needs, not just an id.
    for (const hit of result.hits) {
      assert.ok(hit.text && hit.unit_id && hit.item_id && hit.source_kind && hit.revision_sha256);
      assert.match(hit.doc_key, /^sha256:[0-9a-f]{64}$/u);
    }
    assert.equal(result.hits[0].seed, true);
    assert.deepEqual(result.searched_kinds, ['document']);
  }
  assert.deepEqual(database.calls.modes, ['vector', 'hybrid', 'graph']);
  assert.ok(database.calls.requests.every(request => request.generation_id === 'g1'),
    'every search is pinned to the generation the view selected');
});

test('a search before the generation is loaded reports that, and a bad request never reaches the database', async () => {
  const { view } = await prepared();
  const database = cannedDatabase({ hits: [] });
  const search = createGraphSearch({ view: view(), binding: view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual(await search.graph('전원 조건'),
    { status: 'not_loaded', code: 'generation_not_materialized', mode: 'graph', hits: [] });

  assert.equal((await search.vector('   ')).code, 'query_invalid');
  assert.equal((await search.vector('x'.repeat(8001))).code, 'query_invalid');
  assert.equal(await search.vector('전원', 0).then(() => null, error => error.code), 'graph_search_top_k_invalid');
  assert.equal(await search.vector('전원', 51).then(() => null, error => error.code), 'graph_search_top_k_invalid');
  assert.equal(database.calls.retrieve, 1, 'only the well-formed search was sent');
});

test('a view that stopped being current is not searched or loaded', async () => {
  const { store, view } = await prepared();
  const current = view();
  const database = cannedDatabase({ hits: [], loaded: 'g1' });
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });
  // The ACL changes under the open view: assertCurrent is what notices.
  await store.put(store.aclPath, { ...store.acl, revoked_actors: ['actor:reader'] });
  await assert.rejects(retriever.vector('전원 조건'), error => error.code === 'graph_index_acl_changed');
  await assert.rejects(materializeGraphIndex({ view: current, binding: current.graph_binding, runWorker: database.runWorker }),
    error => error.code === 'graph_index_acl_changed');
});

// ---------------------------------------------------------------------------
// Opt-in: the same sequence against a real Neo4j.
// ---------------------------------------------------------------------------
const PYTHON = process.env.SOULFORGE_TEST_GRAPHRAG_PYTHON;
const MODEL = process.env.SOULFORGE_TEST_GRAPHRAG_LLM;
const NEO4J_URI = process.env.SOULFORGE_TEST_NEO4J_URI;
const NEO4J_PASSWORD_FILE = process.env.SOULFORGE_TEST_NEO4J_PASSWORD_FILE;
const EMBEDDER = process.env.SOULFORGE_TEST_GRAPHRAG_EMBEDDER;
test('real Neo4j: one load, a no-op replay, and vector, hybrid and graph search that hit (opt-in)',
  { skip: PYTHON && MODEL && NEO4J_URI && NEO4J_PASSWORD_FILE && EMBEDDER ? false
    : 'set SOULFORGE_TEST_GRAPHRAG_PYTHON, SOULFORGE_TEST_GRAPHRAG_LLM, SOULFORGE_TEST_NEO4J_URI, SOULFORGE_TEST_NEO4J_PASSWORD_FILE and SOULFORGE_TEST_GRAPHRAG_EMBEDDER',
    timeout: 1800000 },
  async () => {
    const host = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
    const store = await makeStore({ neo4j: { uri: NEO4J_URI, user: process.env.SOULFORGE_TEST_NEO4J_USER || 'neo4j',
      password_file: realpathSync(NEO4J_PASSWORD_FILE) }, embedder: { host, model: EMBEDDER } });
    // The real worker embeds every chunk during extraction, so the vectors the
    // database indexes are the ones this generation recorded.
    const binding = { ...store.binding.graph, worker: { interpreter_path: PYTHON, timeout_ms: 900000 },
      llm: { ...store.binding.graph.llm, model: MODEL, keep_alive: process.env.SOULFORGE_TEST_GRAPHRAG_KEEP_ALIVE || '30s' } };
    const { sha256: bindingSha256 } = await store.put('graph_index_binding.json', { ...store.binding, graph: binding });
    // A fresh generation id per run: the database keeps exactly one generation, so
    // each run supersedes the last instead of colliding with it.
    const generationId = `g${Date.now()}`;
    const first = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256, now: NOW,
      request: indexer({ generation_id: generationId, expected_prior: null }) });
    assert.equal(first.status, 'COMMITTED', JSON.stringify(first));
    const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256, request: reader });
    assert.ok(view().manifest.counts.chunks > 0);

    const loaded = await materializeGraphIndex({ view: view(), binding: view().graph_binding });
    assert.deepEqual({ status: loaded.status, loaded: loaded.loaded }, { status: 'ok', loaded: true }, JSON.stringify(loaded));
    assert.equal(loaded.counts.chunks, view().manifest.counts.chunks, 'every chunk of the generation is in the database');
    assert.equal(loaded.counts.embedded_chunks, loaded.counts.chunks, 'and every one of them carries its vector');

    const replay = await materializeGraphIndex({ view: view(), binding: view().graph_binding });
    assert.deepEqual({ status: replay.status, loaded: replay.loaded, code: replay.code },
      { status: 'ok', loaded: false, code: 'generation_already_loaded' }, 'a second load of the same generation is a no-op');

    const retriever = createGraphIndexRetriever(view());
    const found = {};
    for (const mode of ['vector', 'hybrid', 'graph']) {
      const result = await retriever[mode]('전원 조건이 몇 볼트로 바뀌었나', 5);
      assert.equal(result.status, 'ok', `${mode}: ${JSON.stringify(result)}`);
      assert.ok(result.hits.length > 0, `${mode} returned no hit`);
      assert.equal(result.receipt.not_in_generation, 0, `${mode} returned a unit this generation does not hold`);
      // The text a hit carries is the store's own unit text, byte for byte: a
      // database round trip that re-encoded it would show up here first.
      const hit = result.hits[0];
      const unit = view().readDocument(hit.doc_key).units.find(row => row.unit_id === hit.unit_id);
      assert.equal(hit.text, unit.text, `${mode} returned text that is not the stored unit`);
      found[mode] = { hits: result.hits.length, top: hit.item_id };
    }
    assert.equal(found.graph.hits >= found.vector.hits, true, 'graph expansion returns at least its seed chunks');
    process.stdout.write(`# real graph database: ${JSON.stringify({ generation: generationId,
      loaded: loaded.counts, superseded: loaded.superseded, search: found })}\n`);
  });
