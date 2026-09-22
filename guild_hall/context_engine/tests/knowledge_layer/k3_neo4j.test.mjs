import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createNeo4jGraph, createMemoryGraph, withdrawalFingerprint } from '../../src/knowledge_layer/index.mjs';
import { wikiFixture, wikiInput } from './wiki_fixture.mjs';
// Only test binding switches, never credentials or production configuration.
// Use a disposable loopback Neo4j with Query API + preprovisioned uniqueness
// constraints. Auth must be configured by its owner; no secret is read here.
const endpoint = process.env.SOULFORGE_KL_TEST_NEO4J_URL;
const enabled = process.env.SOULFORGE_KL_TEST_DISPOSABLE === '1';
async function storageContract(graph) {
  const ghost = (await wikiFixture().layer.generate(wikiInput('SYN-B'))).record;
  await assert.rejects(() => graph.commit('SYN-B', 'sha256:' + 'f'.repeat(64), ghost));
  assert.equal(await graph.testProjectCount(), 0, 'failed initial CAS must leave no project shell');
  const f = wikiFixture({ graph }), a = await f.layer.generate(wikiInput()), b = await f.layer.generate(wikiInput('SYN-B'));
  assert.equal(a.status, 'READY'); assert.equal(b.status, 'READY');
  assert.equal((await f.layer.readCurrent(wikiInput())).record.generation_id, a.record.generation_id);
  assert.equal((await f.layer.generate({ ...wikiInput(), expected_previous: a.record.generation_id })).unchanged, true);
  await graph.clearTestNamespace();
  const restored = await f.layer.restore({ input: wikiInput(), generation_id: a.record.generation_id });
  assert.deepEqual(restored.record, a.record);
  const withdrawnInput = wikiInput(); withdrawnInput.withdrawals = [withdrawalFingerprint(a.record.content.statements[0].text)];
  withdrawnInput.expected_previous = a.record.generation_id;
  const current = await f.layer.generate(withdrawnInput); assert.equal(current.record.content.statements.length, 2);
  await assert.rejects(() => graph.commit('SYN-A', null, a.record));
  assert.equal(await graph.testProjectCount(), 1);
  await graph.clearTestNamespace();
  await assert.rejects(() => f.layer.restore({ input: wikiInput(), generation_id: a.record.generation_id }), /wiki_restore_stale/);
  withdrawnInput.expected_previous = null;
  assert.equal((await f.layer.restore({ input: withdrawnInput, generation_id: current.record.generation_id })).status, 'READY');
}
test('shared storage contract against memory adapter', async () => { const graph = createMemoryGraph(); try { await storageContract(graph); } finally { await graph.clearTestNamespace(); } });
test('shared storage contract against isolated loopback Neo4j', { skip: !enabled ? 'explicit disposable Neo4j opt-in absent' : false }, async () => {
  assert.ok(endpoint, 'test endpoint required'); const url = new URL(endpoint);
  const graph = createNeo4jGraph({ enabled: true, test_only: true, endpoint, allowed_origins: [url.origin], namespace: 'kl-test-' + randomUUID(), timeout_ms: 10000 });
  try { await storageContract(graph); } finally { await graph.clearTestNamespace(); }
});
test('test-only Neo4j rejects non-test namespace before any transport', () => {
  let calls = 0;
  const config = { enabled: true, test_only: true, endpoint: 'http://localhost:7474/db/neo4j/query/v2',
    allowed_origins: ['http://localhost:7474'], namespace: 'kl-nontest-synthetic', timeout_ms: 1000, fetchImpl: () => { calls++; } };
  assert.throws(() => createNeo4jGraph(config), /graph_test_namespace_required/);
  assert.throws(() => createNeo4jGraph({ ...config, test_only: 'true' }), /graph_test_namespace_required/);
  assert.doesNotThrow(() => createNeo4jGraph({ ...config, namespace: 'kl-test-synthetic' })); assert.equal(calls, 0);
});
