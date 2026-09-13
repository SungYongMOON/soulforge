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
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { cannedGraphDatabaseWorker as cannedDatabase, cannedGraphWorker as cannedWorker, indexerRequest as indexer,
  sharedGraphDatabase, INDEX_NOW as NOW, makeGraphIndexStore as makeStore,
  READER_REQUEST as reader } from '../harness/fixtures/graph_index_fixture.mjs';
import { openGraphIndex, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { validateAllowedModelHosts, validateGraphBinding, validateNeo4jBinding } from '../src/runtime/graph_extraction.mjs';
import { GRAPH_EXPANSION_LIMITS, createGraphSearch, inspectGraphDatabase, linkExplicitReferences, linkRelatedEvidence,
  materializeGraphIndex, narrowExpansion } from '../src/runtime/graph_database.mjs';
import { createGraphIndexRetriever, otherSourceRows } from '../src/runtime/graph_index_retrieval.mjs';
import { checkJudgement, quoteMatch, relationFromJudgement } from '../src/runtime/relation_judgement.mjs';

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

// One project's generation in its own store, ready to be loaded into a database
// shared with others. `seed` and `fsKey` are what make it a different project.
async function preparedProject({ seed, fsKey, memos }) {
  const projectRef = ref(seed);
  const store = await makeStore({ neo4j: true, embedder: { host: 'http://127.0.0.1:11434', model: 'embed:tag' },
    projectRef, fsKey, memos });
  const worker = cannedWorker();
  const request = extra => ({ actor_ref: 'actor:indexer', project_ref: projectRef, purpose: 'context_preparation', ...extra });
  const built = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, now: NOW,
    runWorker: worker.runWorker, request: request({ generation_id: `${fsKey}-g1`, expected_prior: null }) });
  assert.equal(built.status, 'COMMITTED');
  const view = () => openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: { actor_ref: 'actor:reader', project_ref: projectRef, purpose: 'context_query' } });
  return { store, worker, view, request, built, projectKey: store.projectKey };
}

test('one database holds two projects: a load replaces its own generation and leaves the other project alone', async () => {
  const alpha = await preparedProject({ seed: 11, fsKey: 'P-SYN-ALPHA' });
  const beta = await preparedProject({ seed: 12, fsKey: 'P-SYN-BETA',
    memos: { 'memo-c.md': '# 다른 과제 메모\n\n베타 과제의 시험 조건은 별개다.\n' } });
  const database = sharedGraphDatabase();

  const loadA = await materializeGraphIndex({ view: alpha.view(), binding: alpha.view().graph_binding, runWorker: database.runWorker });
  const loadB = await materializeGraphIndex({ view: beta.view(), binding: beta.view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual([loadA.loaded, loadB.loaded], [true, true]);
  // Loading the second project is not a refusal, and it removed nothing.
  assert.equal(loadB.removed_nodes, 0, "the second project's load deletes nothing");
  assert.deepEqual(loadB.other_projects.map(row => row.project_key), [alpha.projectKey],
    'the load reports what else the database holds, read back from it');
  assert.deepEqual(database.loaded(), { [alpha.projectKey]: 'P-SYN-ALPHA-g1', [beta.projectKey]: 'P-SYN-BETA-g1' });

  // Every request carried both halves of the scope; neither was left to the address.
  for (const request of database.calls.requests) {
    assert.equal(typeof request.project_key, 'string');
    assert.notEqual(request.project_key, '');
  }

  // A second generation of alpha: alpha's own rows are replaced, beta's are not.
  const betaRowsBefore = database.rows().filter(row => row.project === beta.projectKey);
  const again = await updateGraphIndex({ storeRoot: alpha.store.storeRoot, bindingSha256: alpha.store.bindingSha256,
    now: NOW, runWorker: cannedWorker({ digest: 'sha256:' + '7'.repeat(64) }).runWorker,
    request: alpha.request({ generation_id: 'P-SYN-ALPHA-g2', expected_prior: alpha.built.pointer_sha256 }) });
  assert.equal(again.status, 'COMMITTED');
  const replaced = await materializeGraphIndex({ view: alpha.view(), binding: alpha.view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual([replaced.loaded, replaced.superseded], [true, ['P-SYN-ALPHA-g1']]);
  assert.equal(replaced.removed_nodes > 0, true, "the replacement removed this project's previous nodes");
  assert.deepEqual(database.rows().filter(row => row.project === beta.projectKey), betaRowsBefore,
    "beta's rows are byte-identical after alpha was replaced");
  assert.deepEqual(database.rows().filter(row => row.project === alpha.projectKey).map(row => row.generation)
    .filter((value, index, all) => all.indexOf(value) === index), ['P-SYN-ALPHA-g2'],
    'alpha holds exactly one generation');

  // The inventory reads the same two projects back out of the database.
  const seen = await inspectGraphDatabase({ binding: alpha.view().graph_binding, runWorker: database.runWorker });
  assert.deepEqual(seen.projects.map(row => [row.project_key, row.generation_id]).sort(),
    [[alpha.projectKey, 'P-SYN-ALPHA-g2'], [beta.projectKey, 'P-SYN-BETA-g1']].sort());
  assert.equal(typeof seen.projects[0].loaded_at, 'string', 'when the database last wrote it is the database’s answer');
});

test('a search carries its own project, and a row from another project never becomes evidence', async () => {
  const alpha = await preparedProject({ seed: 21, fsKey: 'P-SYN-A2' });
  const beta = await preparedProject({ seed: 22, fsKey: 'P-SYN-B2',
    memos: { 'memo-c.md': '# 다른 과제 메모\n\n베타 과제의 시험 조건은 별개다.\n' } });
  const database = sharedGraphDatabase();
  await materializeGraphIndex({ view: alpha.view(), binding: alpha.view().graph_binding, runWorker: database.runWorker });
  await materializeGraphIndex({ view: beta.view(), binding: beta.view().graph_binding, runWorker: database.runWorker });

  // 1. The request names this view's project and generation, not the caller's choice.
  const search = createGraphSearch({ view: alpha.view(), binding: alpha.view().graph_binding, runWorker: database.runWorker });
  const answered = await search.vector('시험 조건', 5);
  assert.equal(answered.status, 'ok');
  assert.deepEqual([database.calls.requests.at(-1).project_key, database.calls.requests.at(-1).generation_id],
    [alpha.projectKey, 'P-SYN-A2-g1']);
  assert.equal(answered.retrieval.filter_stage, 'in_index_filter', 'where the scope was applied is reported');
  assert.equal(answered.hits.every(hit => hit.doc_key.startsWith('sha256:')), true);

  // 2. A database that leaks one of beta's rows: the retriever drops it, because
  //    alpha's own manifest does not hold that (document, unit) pair.
  const betaRow = database.rows().find(row => row.project === beta.projectKey);
  const leaky = sharedGraphDatabase({ leak: { sf_doc_key: betaRow.doc_key, sf_unit_id: betaRow.unit_id,
    sf_generation: betaRow.generation } });
  await materializeGraphIndex({ view: alpha.view(), binding: alpha.view().graph_binding, runWorker: leaky.runWorker });
  const retriever = createGraphIndexRetriever(alpha.view(), { runWorker: leaky.runWorker });
  const guarded = await retriever.vector('시험 조건', 5);
  assert.equal(guarded.hits.some(hit => hit.doc_key === betaRow.doc_key), false,
    "a foreign row offered by the database is not served as this project's evidence");
  assert.equal(guarded.receipt.not_in_generation, 1, 'and the row that was dropped is counted, not hidden');

  // 3. A project the database has not loaded is not answered from another's rows.
  const empty = await preparedProject({ seed: 23, fsKey: 'P-SYN-C2' });
  const unloaded = createGraphSearch({ view: empty.view(), binding: empty.view().graph_binding, runWorker: database.runWorker });
  const missing = await unloaded.vector('시험 조건', 5);
  assert.deepEqual([missing.status, missing.code, missing.hits.length], ['not_loaded', 'generation_not_materialized', 0]);
});

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

test('a model may be called off this host only at an origin the binding names', async () => {
  const mini = 'https://seabot-example.tailnet-example.ts.net';
  assert.deepEqual([...validateAllowedModelHosts([mini])], [mini]);
  assert.deepEqual([...validateAllowedModelHosts(undefined)], [], 'no list means this host only');
  assert.deepEqual([...validateAllowedModelHosts([`${mini}:8443`])], [`${mini}:8443`], 'a port is part of the origin');

  // Plaintext off-host would put document text on the wire in clear.
  assert.equal(code(() => validateAllowedModelHosts(['http://192.168.0.9:11434'])), 'graph_model_host_not_https');
  // A range, a path or a credential in the URL would all make the address unanswerable.
  assert.equal(code(() => validateAllowedModelHosts([`${mini}/v1`])), 'graph_model_hosts_invalid');
  assert.equal(code(() => validateAllowedModelHosts([`https://user:pw@host.example`])), 'graph_model_hosts_invalid');
  assert.equal(code(() => validateAllowedModelHosts(['not a url'])), 'graph_model_hosts_invalid');
  assert.equal(code(() => validateAllowedModelHosts([mini, mini])), 'graph_model_hosts_invalid');
  assert.equal(code(() => validateAllowedModelHosts(['https://127.0.0.1:11434'])), 'graph_model_host_redundant',
    'this host is always allowed; listing it would suggest the list is what permits it');

  const store = await makeStore();
  const base = store.binding.graph;
  // Listed: admitted. Unlisted: refused, for the LLM and the embedder alike.
  const listed = validateGraphBinding({ ...base, allowed_model_hosts: [mini],
    llm: { ...base.llm, host: `${mini}/` }, embedder: { host: `${mini}/`, model: 'embed:tag' } });
  assert.deepEqual([...listed.allowed_model_hosts], [mini]);
  assert.equal(code(() => validateGraphBinding({ ...base, llm: { ...base.llm, host: `${mini}/` } })),
    'graph_llm_binding_invalid', 'without the list the same address is refused');
  assert.equal(code(() => validateGraphBinding({ ...base, allowed_model_hosts: [mini],
    embedder: { host: 'https://other.example/', model: 'embed:tag' } })), 'graph_embedder_binding_invalid');
  // Loopback keeps working with no list at all, which is the default.
  assert.equal(validateGraphBinding(base).llm.host, 'http://127.0.0.1:11434');
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
    assert.deepEqual({ ...result.receipt, expansion: undefined }, { mode, requested_top_k: 5, returned: 3, admitted: 2,
      not_in_generation: 1, dropped_out_of_generation: 0, expansion: undefined });
    // Only the graph mode expands, so only it accounts for one.
    assert.equal(result.receipt.expansion === undefined, mode !== 'graph');
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

test('an explicit-reference link carries the identifier map, the rule and the generation, and answers with the edges', async () => {
  const { view } = await prepared();
  const current = view();
  const [first, second] = current.manifest.documents.map(row => row.doc_key);
  const identifiers = { 'SON-84': first, 'SON-92': second };
  const edge = { token: 'SON-92', source_unit_id: 'u0004', source_doc_key: first, target_doc_key: second };
  const database = cannedDatabase({ loaded: 'g1', edges: [edge] });

  const dry = await linkExplicitReferences({ view: current, binding: current.graph_binding, identifiers,
    runWorker: database.runWorker });
  assert.deepEqual({ status: dry.status, applied: dry.applied, rule: dry.rule, generation: dry.generation_id },
    { status: 'ok', applied: false, rule: 'L1-linear-identifier', generation: 'g1' });
  assert.deepEqual(dry.edges, [edge], 'the candidate rows come back as the worker reported them');
  assert.equal(dry.counts.created, 0, 'a dry run creates nothing');

  const applied = await linkExplicitReferences({ view: view(), binding: current.graph_binding, identifiers,
    apply: true, runWorker: database.runWorker });
  assert.equal(applied.applied, true);
  assert.equal(applied.counts.created, 1);

  // What left the APP: the same map, the rule, the view's own generation and project.
  const sent = database.calls.requests.filter(request => request.operation === 'link_explicit_refs');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(request => request.apply), [false, true]);
  for (const request of sent) {
    assert.deepEqual(request.identifiers, identifiers);
    assert.equal(request.rule, 'L1-linear-identifier');
    assert.equal(request.generation_id, 'g1');
    assert.equal(request.project_key, current.manifest.project_key);
  }

  // A target the generation does not hold is refused before the database is asked.
  const absent = 'sha256:' + 'b'.repeat(64);
  await assert.rejects(linkExplicitReferences({ view: view(), binding: current.graph_binding,
    identifiers: { 'SON-84': absent }, runWorker: database.runWorker }), error => error.code === 'graph_link_identifiers_invalid');
  await assert.rejects(linkExplicitReferences({ view: view(), binding: current.graph_binding, identifiers,
    rule: 'L9-name-similarity', runWorker: database.runWorker }), error => error.code === 'graph_link_rule_unknown');
  assert.equal(database.calls.link, 2, 'only the two well-formed requests were sent');
});

test('a graph row the expansion reached is admitted like any other, and only if this generation holds it', async () => {
  const { view } = await prepared();
  const current = view();
  const [seed, reached] = unitRows(current, 2);
  // What a real expansion returns: the seed, a chunk reached over a link, and a
  // row for a unit outside this generation. The seed flag does not change admission.
  const rows = [{ ...seed, seed: true }, { ...reached, seed: false },
    { sf_doc_key: 'sha256:' + 'c'.repeat(64), sf_unit_id: 'u-not-here', score: 0.4, seed: false }];
  const database = cannedDatabase({ hits: rows, loaded: 'g1' });
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });

  const result = await retriever.graph('전원 조건', 5);
  assert.equal(result.status, 'ok');
  assert.deepEqual({ ...result.receipt, expansion: undefined }, { mode: 'graph', requested_top_k: 5, returned: 3, admitted: 2,
    not_in_generation: 1, dropped_out_of_generation: 0, expansion: undefined }, 'a reached row counts as admitted; the foreign one does not');
  assert.deepEqual({ seeds: result.receipt.expansion.seeds, inflow: result.receipt.expansion.inflow },
    { seeds: 1, inflow: 2 }, 'the receipt reports the expansion the database applied');
  assert.deepEqual(result.hits.map(row => row.seed), [true, false]);
  // The reached row is evidence with the same provenance as the seed, not a weaker one.
  for (const row of result.hits) assert.ok(row.text && row.unit_id && row.item_id && row.revision_sha256);
});

test('a seed keeps the score it came with and a reached row keeps the one it inherited; the APP rescores and reorders neither', async () => {
  const { view } = await prepared();
  const current = view();
  const [first, second] = unitRows(current, 2);
  // The shape the expansion returns once seed and reached scores are kept apart: a
  // seed carries its own vector score even when a better-scoring seed also reached
  // it, and a reached chunk carries the best score among the seeds that reached it.
  // So a seed can sit above a reached row that scores higher, and that order is the
  // database's to decide -- this side must not sort or recompute it.
  const rows = [{ ...first, score: 0.804, seed: true }, { ...second, score: 0.846, seed: false }];
  const database = cannedDatabase({ hits: rows, loaded: 'g1' });
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });

  const result = await retriever.graph('전원 조건', 5);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.hits.map(row => [row.unit_id, row.score, row.seed]),
    [[first.sf_unit_id, 0.804, true], [second.sf_unit_id, 0.846, false]],
    'the lower-scored seed stays first and neither score is changed on the way out');
  assert.deepEqual(result.hits.map(row => row.rank), [1, 2]);
  assert.deepEqual({ ...result.receipt, expansion: undefined }, { mode: 'graph', requested_top_k: 5, returned: 2, admitted: 2,
    not_in_generation: 0, dropped_out_of_generation: 0, expansion: undefined });
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
// Related evidence (rule R1): a judged relation, checked before it is written.
// ---------------------------------------------------------------------------

// One well-formed relation between the first two units of the two fixture
// documents, as judgeRelatedEvidence would hand it over.
function relationOf(view, { relationKind = 'same_test_context', direction = 'a_to_b', evidenceA = null, evidenceB = null } = {}) {
  const [first, second] = view.manifest.documents;
  const unitOf = row => view.readDocument(row.doc_key).units[0].unit_id;
  return { a_doc_key: first.doc_key, a_unit_id: unitOf(first), b_doc_key: second.doc_key, b_unit_id: unitOf(second),
    judgement_id: `sha256:${'a'.repeat(64)}`, relation_kind: relationKind, direction,
    evidence_a_unit: evidenceA ?? unitOf(first), evidence_b_unit: evidenceB ?? unitOf(second),
    prompt_sha256: `sha256:${'b'.repeat(64)}`, model: 'local-model:tag', model_pin: `model_digest:sha256:${'c'.repeat(64)}` };
}

test('a judged relation reaches the database only when this generation holds both ends and both quoted units', async () => {
  const { view } = await prepared();
  const current = view();
  const database = cannedDatabase({ loaded: 'g1' });
  const relation = relationOf(current);
  const link = extra => linkRelatedEvidence({ view: view(), binding: current.graph_binding,
    relations: [{ ...relation, ...extra }], apply: true, runWorker: database.runWorker });

  const applied = await link({});
  assert.deepEqual({ status: applied.status, rule: applied.rule, applied: applied.applied, counts: applied.counts },
    { status: 'ok', rule: 'R1-local-judgement', applied: true, counts: { requested: 1, created: 1, existing: 0 } });
  const sent = database.calls.requests.at(-1);
  assert.deepEqual({ operation: sent.operation, generation: sent.generation_id, rule: sent.rule, rows: sent.relations.length },
    { operation: 'link_related_evidence', generation: 'g1', rule: 'R1-local-judgement', rows: 1 });
  assert.equal(sent.relations[0].relation_kind, 'same_test_context');

  const refused = async extra => link(extra).then(() => null, error => error.code);
  // A unit this generation does not hold, on either end or as a quote's source.
  assert.equal(await refused({ b_unit_id: 'u-not-here' }), 'graph_related_relations_invalid');
  assert.equal(await refused({ a_doc_key: `sha256:${'f'.repeat(64)}` }), 'graph_related_relations_invalid');
  // A quote attributed to a unit that is not in the record it is said to come from.
  assert.equal(await refused({ evidence_b_unit: 'u-not-here' }), 'graph_related_evidence_invalid');
  assert.equal(await refused({ evidence_a_unit: 'u-not-here' }), 'graph_related_evidence_invalid');
  // A kind this rule does not write, and a chunk joined to itself.
  assert.equal(await refused({ relation_kind: 'similar_topic' }), 'graph_related_kind_unknown');
  assert.equal(await refused({ b_doc_key: relation.a_doc_key, b_unit_id: relation.a_unit_id }), 'graph_related_relations_invalid');
  // A judgement id that is not a digest cannot be merged onto twice.
  assert.equal(await refused({ judgement_id: 'j-1' }), 'graph_related_relations_invalid');
  assert.equal(database.calls.related, 1, 'only the checked relation was sent to the database');
});

test('a judgement that names a different event, or quotes what its unit does not say, becomes no relation', async () => {
  const { view } = await prepared();
  const current = view();
  const [first, second] = current.manifest.documents;
  const pair = { a: { doc_key: first.doc_key, unit_id: current.readDocument(first.doc_key).units[0].unit_id },
    b: { doc_key: second.doc_key, unit_id: current.readDocument(second.doc_key).units[0].unit_id } };
  const textA = current.readDocument(first.doc_key).units[0].text;
  const textB = current.readDocument(second.doc_key).units[0].text;
  const answer = extra => ({ subject_a: 'A', subject_b: 'B', relation_kind: 'same_test_context', direction: 'symmetric',
    evidence_a: { unit_id: pair.a.unit_id, quote: textA.slice(0, 8) },
    evidence_b: { unit_id: pair.b.unit_id, quote: textB.slice(0, 8) },
    counter_conditions: [], unresolved: [], ...extra });

  const good = checkJudgement({ view: current, pair, answer: answer() });
  assert.deepEqual({ linkable: good.linkable, kind: good.relation_kind, a: good.checks.evidence_a.quote_match,
    b: good.checks.evidence_b.quote_match, reasons: good.reasons },
  { linkable: true, kind: 'same_test_context', a: 'exact', b: 'exact', reasons: [] });

  // Same date, different test: a kind that says so is kept and linked to nothing.
  const different = checkJudgement({ view: current, pair, answer: answer({ relation_kind: 'different_event' }) });
  assert.deepEqual({ linkable: different.linkable, kind: different.relation_kind, reasons: different.reasons },
    { linkable: false, kind: 'different_event', reasons: ['kind_not_linked:different_event'] });
  assert.equal(checkJudgement({ view: current, pair, answer: answer({ relation_kind: 'similar_topic' }) }).linkable, false);
  assert.equal(checkJudgement({ view: current, pair, answer: answer({ relation_kind: 'insufficient' }) }).linkable, false);

  // A quote the unit does not carry, and a quote attributed to a unit that is not there.
  const invented = checkJudgement({ view: current, pair,
    answer: answer({ evidence_b: { unit_id: pair.b.unit_id, quote: '이 문장은 원문에 없다' } }) });
  assert.deepEqual({ linkable: invented.linkable, match: invented.checks.evidence_b.quote_match, reasons: invented.reasons },
    { linkable: false, match: 'not_found', reasons: ['evidence_b_quote_not_in_unit'] });
  const elsewhere = checkJudgement({ view: current, pair,
    answer: answer({ evidence_a: { unit_id: 'u-not-here', quote: textA.slice(0, 8) } }) });
  assert.deepEqual({ linkable: elsewhere.linkable, reasons: elsewhere.reasons },
    { linkable: false, reasons: ['evidence_a_unit_unknown'] });
  // Whitespace is the one difference a quote may have; a paraphrase is not one.
  assert.equal(quoteMatch(textA.slice(0, 8).replace(/\s+/gu, '  '), textA), 'whitespace_normalised');
  assert.equal(quoteMatch('전혀 다른 문장', textA), 'not_found');

  // The edge a good judgement becomes: content-addressed, so the same judgement
  // twice is the same edge, and its claim is recorded as an inference.
  const relation = relationFromJudgement({ pair, judgement: good, promptSha256: `sha256:${'b'.repeat(64)}`,
    model: 'local-model:tag', modelPin: `server_props:sha256:${'c'.repeat(64)}` });
  assert.equal(relation.judgement_id, relationFromJudgement({ pair, judgement: good, promptSha256: `sha256:${'b'.repeat(64)}`,
    model: 'local-model:tag', modelPin: `server_props:sha256:${'c'.repeat(64)}` }).judgement_id);
  assert.deepEqual({ a: relation.a_doc_key, b: relation.b_doc_key, direction: relation.direction },
    { a: pair.a.doc_key, b: pair.b.doc_key, direction: 'symmetric' });
  // b_to_a swaps the ends rather than writing a backwards edge.
  const backwards = checkJudgement({ view: current, pair, answer: answer({ direction: 'b_to_a' }) });
  const swapped = relationFromJudgement({ pair, judgement: backwards, promptSha256: `sha256:${'b'.repeat(64)}`,
    model: 'local-model:tag', modelPin: `server_props:sha256:${'c'.repeat(64)}` });
  assert.deepEqual({ a: swapped.a_doc_key, b: swapped.b_doc_key, evidence_a: swapped.evidence_a_unit, direction: swapped.direction },
    { a: pair.b.doc_key, b: pair.a.doc_key, evidence_a: pair.b.unit_id, direction: 'a_to_b' });
});

test('an expansion budget is narrowed to this APP ceiling, carried to the database, and its rows come back as they were ordered', async () => {
  const { view } = await prepared();
  const current = view();
  const [seed, reached] = unitRows(current, 2);
  const rows = [{ ...seed, seed: true, via: 'seed', relevance: null },
    { ...reached, seed: false, score: 0.9, via: 'R1', relevance: 0.5 }];
  const database = cannedDatabase({ hits: rows, loaded: 'g1' });
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });

  // A: one rule. B: both. Same question, same seeds, the condition is the request.
  const withoutR1 = await retriever.graph('전원 조건', 5, { expansion: { enabled_rules: ['L1'] } });
  assert.deepEqual(database.calls.requests.at(-1).expansion, { enabled_rules: ['L1'] });
  const withR1 = await retriever.graph('전원 조건', 5, { expansion: { enabled_rules: ['L1', 'R1'], per_document_limit: 2 } });
  assert.deepEqual(database.calls.requests.at(-1).expansion, { enabled_rules: ['L1', 'R1'], per_document_limit: 2 });
  assert.equal(withoutR1.status, 'ok');
  assert.deepEqual(withR1.hits.map(row => [row.seed, row.via, row.score]), [[true, 'seed', rows[0].score], [false, 'R1', 0.9]],
    'the seed stays first and the reached row keeps the score it inherited');
  assert.equal(withR1.receipt.expansion.enabled_rules.join(','), 'L1,R1', 'the receipt says which rules this answer followed');
  assert.equal(withR1.receipt.returned, 2);

  // The ceiling is this side's, not the caller's: a request may lower a bound, never raise it.
  assert.deepEqual(narrowExpansion({ expansion_limit: 3 }),
    { enabled_rules: ['L1', 'R1'], expansion_limit: 3 });
  assert.deepEqual(narrowExpansion({ final_limit: 99 }).final_limit, GRAPH_EXPANSION_LIMITS.final_limit);
  assert.equal(narrowExpansion(null), null, 'no expansion in the request leaves the database its own defaults');
  const refused = value => { try { narrowExpansion(value); return null; } catch (error) { return error.code; } };
  assert.equal(refused({ enabled_rules: ['L1', 'L9'] }), 'graph_search_expansion_invalid');
  assert.equal(refused({ enabled_rules: ['L1', 'L1'] }), 'graph_search_expansion_invalid');
  assert.equal(refused({ per_document_limit: -1 }), 'graph_search_expansion_invalid');
  assert.equal(refused({ depth: 2 }), 'graph_search_expansion_invalid', 'a bound this APP does not have is not silently ignored');
});

test('a search asks for more rows than the ordinary ceiling only when it ranks the whole generation', async () => {
  const { view } = await prepared();
  const current = view();
  const database = cannedDatabase({ hits: unitRows(current, 2), loaded: 'g1' });
  const search = createGraphSearch({ view: current, binding: current.graph_binding, runWorker: database.runWorker });

  // The default is untouched: fifty rows, and the request says nothing about it.
  assert.equal((await search.vector('전원 조건', 50)).status, 'ok');
  assert.equal(database.calls.requests.at(-1).whole_generation, undefined, 'an ordinary search asks for no such thing');
  assert.equal(await search.vector('전원 조건', 51).then(() => null, error => error.code), 'graph_search_top_k_invalid');
  assert.equal(await search.vector('전원 조건', 8, { wholeGeneration: 'yes' }).then(() => null, error => error.code),
    'graph_search_top_k_invalid', 'the flag is a boolean, not anything truthy');

  // Asking for the whole generation raises the ceiling to what the generation
  // holds -- the data, not a larger fixed number -- and says so in the request.
  // The stand-in view is a generation of 153 chunks; createGraphSearch reads
  // nothing else from a view than its project key, its generation id, its chunk
  // count and assertCurrent.
  const large = { manifest: { generation_id: 'g1', project_key: current.manifest.project_key, counts: { chunks: 153 } },
    assertCurrent() {} };
  const wide = createGraphSearch({ view: large, binding: current.graph_binding, runWorker: database.runWorker });
  const whole = await wide.vector('전원 조건', 153, { wholeGeneration: true });
  assert.equal(whole.status, 'ok');
  assert.equal(whole.whole_generation, true);
  assert.deepEqual([database.calls.requests.at(-1).top_k, database.calls.requests.at(-1).whole_generation], [153, true]);
  assert.equal(await wide.vector('전원 조건', 154, { wholeGeneration: true }).then(() => null, error => error.code),
    'graph_search_top_k_invalid', 'the generation is the ceiling: one row more than it holds is refused');
  assert.equal(await wide.vector('전원 조건', 51).then(() => null, error => error.code), 'graph_search_top_k_invalid',
    'without the flag the ordinary ceiling still holds, however large the generation is');

  // The receipt carries it, so a ranking taken over the whole generation is never
  // read back as one taken over the first rows.
  const retriever = createGraphIndexRetriever(current, { runWorker: database.runWorker });
  const answered = await retriever.vector('전원 조건', 2, { wholeGeneration: true });
  assert.equal(answered.receipt.whole_generation, true);
  assert.equal((await retriever.vector('전원 조건', 2)).receipt.whole_generation, undefined);
});

test('the rows of a search that came from another source are ranked among themselves, and keep the rank the search gave', () => {
  const hits = [{ rank: 1, doc_key: 'sha256:a', source_kind: 'linear', unit_id: 'u0' },
    { rank: 2, doc_key: 'sha256:a', source_kind: 'linear', unit_id: 'u1' },
    { rank: 3, doc_key: 'sha256:b', source_kind: 'linear', unit_id: 'u0' },
    { rank: 4, doc_key: 'sha256:c', source_kind: 'slack', unit_id: 'u0' },
    { rank: 5, doc_key: 'sha256:d', source_kind: 'mail', unit_id: 'u0' },
    { rank: 6, doc_key: 'sha256:e', source_kind: 'slack', unit_id: 'u0' }];

  // The document the question started from is dropped, and so is every kind that
  // was not asked for. What is left is renumbered, and the rank the search gave is
  // kept beside it: "first among the other sources" and "first of the search" are
  // different facts and the receipt has to be able to say which it means.
  assert.deepEqual(otherSourceRows(hits, { excludeDocKey: 'sha256:a', kinds: ['slack'] })
    .map(row => [row.doc_key, row.rank, row.search_rank]), [['sha256:c', 1, 4], ['sha256:e', 2, 6]]);
  assert.deepEqual(otherSourceRows(hits, { excludeDocKey: 'sha256:a' }).map(row => row.doc_key),
    ['sha256:b', 'sha256:c', 'sha256:d', 'sha256:e'], 'no kinds named means every other source');
  assert.deepEqual(otherSourceRows(hits, { excludeDocKey: 'sha256:a', limit: 2 }).map(row => row.rank), [1, 2]);
  assert.deepEqual(otherSourceRows([], { excludeDocKey: 'sha256:a' }), [],
    'a search that reached no other source is an empty ranking, not an error');
  assert.deepEqual(otherSourceRows(hits, { excludeDocKey: 'sha256:a', kinds: ['voice'] }), [],
    'a kind nothing was found in leaves nothing, and nothing else is admitted in its place');
  assert.deepEqual(hits.map(row => row.rank), [1, 2, 3, 4, 5, 6], 'the search result itself is not changed');
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
