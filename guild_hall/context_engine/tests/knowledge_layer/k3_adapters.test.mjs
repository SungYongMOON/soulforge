import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createFileArchive, createBoundedGenerator, createHttpGenerator, createNeo4jGraph, createMemoryGraph,
  createWikiKnowledgeLayer, withdrawalFingerprint } from '../../src/knowledge_layer/index.mjs';
import { digest } from '../../src/knowledge_layer/data.mjs';
import { BUDGET, extractiveFake, wikiFixture, wikiInput } from './wiki_fixture.mjs';
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
test('file archive preserves immutable JSON/Markdown and withdrawals across reconstruction', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kl-wiki-'));
  try {
    const archive = createFileArchive({ root }), f = wikiFixture({ archive }), input = wikiInput();
    const first = await f.layer.generate(input), files = readdirSync(root);
    assert.equal(files.filter(n => n.endsWith('.md')).length, 5); assert.equal(files.filter(n => n.endsWith('.json')).length, 1);
    const original = readFileSync(join(root, first.record.generation_id.slice(7) + '.json'), 'utf8');
    const fingerprint = withdrawalFingerprint(first.record.content.statements[0].text); await archive.addWithdrawals('SYN-A', [fingerprint]);
    const rebuilt = createFileArchive({ root }); assert.deepEqual(await rebuilt.getWithdrawals('SYN-A'), [fingerprint]);
    assert.deepEqual(await rebuilt.getWithdrawals('SYN-B'), []);
    assert.equal(readFileSync(join(root, first.record.generation_id.slice(7) + '.json'), 'utf8'), original);
    const graph = createMemoryGraph(), layer = createWikiKnowledgeLayer({ graph, archive: rebuilt, generator: f.generator });
    await assert.rejects(() => layer.restore({ input, generation_id: first.record.generation_id }), /wiki_restore_stale/);
    writeFileSync(join(root, first.record.generation_id.slice(7) + '.json'), '{}');
    await assert.rejects(() => rebuilt.get(first.record.generation_id), /archive_hash_mismatch/);
  } finally { assert.ok(relative(tmpdir(), root).startsWith('kl-wiki-')); rmSync(root, { recursive: true, force: true }); }
});
test('file archive cannot escape via malformed keys or withdrawal project ids', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kl-wiki-'));
  try {
    const a = createFileArchive({ root }); await assert.rejects(() => a.get('../outside'));
    await assert.rejects(() => a.addWithdrawals('../outside', ['sha256:' + 'a'.repeat(64)]));
    assert.equal(readdirSync(root).length, 0);
  } finally { assert.ok(relative(tmpdir(), root).startsWith('kl-wiki-')); rmSync(root, { recursive: true, force: true }); }
});
test('HTTP generator is disabled by default and refuses hosts outside the exact allowlist', async () => {
  let calls = 0; const options = { id: 'synthetic-http', model: 'test-model', endpoint: 'http://127.0.0.1:9001/chat',
    allowed_origins: ['http://127.0.0.1:9001'], budget: BUDGET, fetchImpl: async () => { calls++; return response({}); } };
  await assert.rejects(() => createHttpGenerator(options).generate({ units: [] }), /generation_disabled/); assert.equal(calls, 0);
  assert.throws(() => createHttpGenerator({ ...options, endpoint: 'https://outside.invalid/chat' }), /endpoint_not_allowed/);
  assert.throws(() => createHttpGenerator({ ...options, endpoint: 'https://outside.invalid/chat', allowed_origins: ['https://outside.invalid'] }), /endpoint_not_allowed/);
  assert.throws(() => createHttpGenerator({ ...options, endpoint: 'http://user:password@127.0.0.1:9001/chat' }), /endpoint_not_allowed/);
});
test('generator call budget is enforced per session, including failed attempts', async () => {
  let calls = 0; const g = createBoundedGenerator({ enabled: true, id: 'fake-count', budget: BUDGET, generate: () => { calls++; return { candidates: [] }; } });
  await g.generate({ units: [] }); await assert.rejects(() => g.generate({ units: [] }), /generation_call_budget/); assert.equal(calls, 1);
  const next = g.createSession(); await next.generate({ units: [] }); await assert.rejects(() => next.generate({ units: [] }), /generation_call_budget/); assert.equal(calls, 2);
  const broken = createBoundedGenerator({ enabled: true, id: 'fake-failure', budget: BUDGET, generate: () => { throw new Error('fake'); } });
  await assert.rejects(() => broken.generate({ units: [] })); await assert.rejects(() => broken.generate({ units: [] }), /generation_call_budget/);
});
test('HTTP generator sends only bounded units, refuses redirects/errors and caps response bytes', async () => {
  const options = { enabled: true, id: 'synthetic-http', model: 'test-model', endpoint: 'http://127.0.0.1:9001/chat',
    allowed_origins: ['http://127.0.0.1:9001'], budget: BUDGET };
  const model = createHttpGenerator({ ...options, fetchImpl: async (url, init) => {
    assert.equal(init.redirect, 'error'); assert.ok(init.signal); assert.equal(url, options.endpoint);
    const body = JSON.parse(init.body); assert.equal(body.model, 'test-model');
    return response({ choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }] });
  } });
  assert.deepEqual(await model.generate({ project_ref: 'SYN-A', units: [] }), { candidates: [] });
  const bad = createHttpGenerator({ ...options, fetchImpl: async () => new Response('', { status: 302 }) });
  await assert.rejects(() => bad.generate({ units: [] }));
  const huge = createHttpGenerator({ ...options, budget: { ...BUDGET, max_output_characters: 20 }, fetchImpl: async () => response({ text: 'x'.repeat(1000) }) });
  await assert.rejects(() => huge.generate({ units: [] }));
});
const constraints = [
  ['UNIQUENESS', ['KLProject'], ['namespace', 'project']],
  ['UNIQUENESS', ['KLGeneration'], ['namespace', 'project', 'generation']],
  ['UNIQUENESS', ['KLNode'], ['namespace', 'project', 'generation', 'node_id']],
];
test('Neo4j Query API wire is parameterized, checks constraints/errors and scopes all writes', async () => {
  const rows = new Map(), calls = [];
  const graph = createNeo4jGraph({ enabled: true, endpoint: 'http://127.0.0.1:7474/db/neo4j/query/v2',
    allowed_origins: ['http://127.0.0.1:7474'], namespace: 'kl-test-wire-12345678', timeout_ms: 1000,
    fetchImpl: async (url, init) => {
      const { statement, parameters: p } = JSON.parse(init.body); calls.push(statement);
      assert.equal(p.namespace, 'kl-test-wire-12345678'); assert.equal(init.redirect, 'error');
      if (statement.startsWith('SHOW')) return response({ data: { values: constraints } });
      if (statement.startsWith('MERGE')) {
        assert.ok(!statement.includes('SYN-A')); assert.ok(statement.includes('$expected')); assert.ok(statement.includes('$namespace'));
        assert.ok(statement.includes('cas_guard=1 / (CASE WHEN'));
        const prior = rows.get(p.project); if ((prior?.generation_id ?? '') !== p.expected && prior?.generation_id !== p.generation) return response({ errors: [{ code: 'Neo.ClientError.Statement.ArithmeticError' }] });
        rows.set(p.project, JSON.parse(p.payload)); return response({ data: { values: [[p.payload]] } });
      }
      if (statement.includes('DETACH DELETE')) { rows.clear(); return response({ data: { values: [[0]] } }); }
      return response({ data: { values: rows.has(p.project) ? [[JSON.stringify(rows.get(p.project))]] : [] } });
    } });
  const f = wikiFixture({ graph }), first = await f.layer.generate(wikiInput()); assert.equal(first.status, 'READY');
  const before = calls.length; await f.layer.readCurrent(wikiInput()); assert.ok(calls.slice(before).every(s => s.startsWith('MATCH')));
  await f.layer.generate(wikiInput('SYN-B')); assert.equal(rows.size, 2);
  await graph.clearTestNamespace(); assert.equal(rows.size, 0);
});
test('Neo4j remains off by default; public host, missing constraints and server errors refuse writes', async () => {
  let calls = 0;
  const options = { endpoint: 'http://127.0.0.1:7474/db/neo4j/query/v2', allowed_origins: ['http://127.0.0.1:7474'],
    namespace: 'kl-test-errors-12345', timeout_ms: 1000, fetchImpl: async () => { calls++; return response({ data: { values: [] } }); } };
  await assert.rejects(() => createNeo4jGraph(options).read('SYN-A'), /graph_disabled/); assert.equal(calls, 0);
  assert.throws(() => createNeo4jGraph({ ...options, endpoint: 'http://outside.invalid/db/neo4j/query/v2', allowed_origins: ['http://outside.invalid'] }));
  const record = (await wikiFixture().layer.generate(wikiInput())).record;
  await assert.rejects(() => createNeo4jGraph({ ...options, enabled: true }).commit('SYN-A', null, record), /graph_constraints_required/);
  const errors = createNeo4jGraph({ ...options, enabled: true, fetchImpl: async () => response({ errors: [{ code: 'synthetic' }], data: { values: [] } }) });
  await assert.rejects(() => errors.read('SYN-A'), /graph_query_failed/);
});
test('graph adapter rejects foreign project, unknown node kind, unknown edge and altered bytes', async () => {
  const record = (await wikiFixture().layer.generate(wikiInput())).record, graph = createMemoryGraph();
  await assert.rejects(() => graph.commit('SYN-B', null, record));
  const altered = structuredClone(record); altered.content.pages[0].markdown = 'tampered'; await assert.rejects(() => graph.commit('SYN-A', null, altered));
  const node = structuredClone(record); node.content.nodes[0].kind = 'OfficialDecision'; node.generation_id = digest(node.content);
  await assert.rejects(() => graph.commit('SYN-A', null, node), /graph_node_invalid/);
  const edge = structuredClone(record); edge.content.edges[0].kind = 'ACCEPTS'; edge.generation_id = digest(edge.content);
  await assert.rejects(() => graph.commit('SYN-A', null, edge), /graph_edge_invalid/);
  const authority = structuredClone(record); authority.content.knowledge_accepted = true; authority.generation_id = digest(authority.content);
  await assert.rejects(() => graph.commit('SYN-A', null, authority), /graph_authority_invalid/);
  const relabeled = structuredClone(record); relabeled.content.project_ref = 'SYN-B'; relabeled.generation_id = digest(relabeled.content);
  await assert.rejects(() => graph.commit('SYN-B', null, relabeled), /graph_project_invalid/);
});
