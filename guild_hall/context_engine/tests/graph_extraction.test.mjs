// Graph extraction: the APP's fixed contract around neo4j-graphrag. Unit tests
// feed a canned worker output (named as such) to check binding refusal and
// fragment admission; the opt-in test runs the real worker with neo4j-graphrag
// and a local model on a synthetic document.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { admitGraphFragment, extractGraphFragments, probeGraphModels, validateGraphBinding } from '../src/runtime/graph_extraction.mjs';
import { GRAPH_EXTRACTION_PROFILE } from '../profiles/graph_extraction_v1.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const MEMO = '# 시험 장비 A 설계 메모\n\n요청자가 응답기 장표를 다음 주 화요일까지 요청했다.\n\n## 전원 조건\n\n전원 조건은 28V로 바뀌었고 이전 24V 조건은 취소한다.\n';

async function syntheticDocuments() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-graph-'));
  await writeFile(path.join(root, 'memo.md'), MEMO);
  const out = await prepareSourceDocuments({ now: NOW, roots: { 'doc.synthetic': root }, grant: {
    schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.graph', project_ref: ref(1), purposes: ['context_preparation'],
    allowed_data_classes: ['public_synthetic'], valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
    sources: [{ kind: 'document', root_ref: 'doc.synthetic', items: [{ item_id: 'memo', revision_policy: 'latest_in_custody',
      revision_sha256: null, data_class: 'public_synthetic', path: ['memo.md'] }] }] } });
  return { documents: out.documents, projectKey: out.grant.project_key };
}

const BINDING = { worker: { interpreter_path: path.join(os.tmpdir(), 'unused-python.exe') },
  llm: { host: 'http://127.0.0.1:11434', model: 'local-model:tag', max_calls: 20 }, embedder: null };
const LLM_DIGEST = 'sha256:' + 'b'.repeat(64);

// Canned worker output shaped like graphrag_worker.py's extract result.
function cannedWorkerOutput(document, { createdAt = '2026-09-12T00:00:00+00:00', models } = {}) {
  const [u0, u1] = document.units;
  const chunk = unit => `${document.doc_key}:${unit.unit_id}`;
  const node = (id, label, properties) => ({ id, label, properties, embedding_properties: {} });
  const rel = (start_node_id, type, end_node_id) => ({ start_node_id, end_node_id, type, properties: {} });
  return { status: 'ok', models: models ?? { llm: { model: 'local-model:tag', digest: LLM_DIGEST } },
    llm_calls: [{ call: 1, status: 'ok', input_sha256: 'sha256:' + '1'.repeat(64), prompt_tokens: 10, output_tokens: 5,
      elapsed_ms: 7, done_reason: 'length', thinking_characters: 0, leaked_text: u0.text }],
    budget_exhausted: false, llm_errors: 0, fragments: [{ doc_key: document.doc_key,
      tool_pruning: { nodes: { NOT_IN_SCHEMA: 2 }, relationships: { INVALID_PATTERN: 1 }, properties: {}, 'bad key': 3 },
      nodes: [
        node(document.doc_key, 'Document', { path: document.doc_key, createdAt }),
        { ...node(chunk(u0), 'Chunk', { text: u0.text, index: 0, sf_unit_id: u0.unit_id }),
          embedding_properties: { embedding: [0.25, -0.5, 0.125] } },
        node(chunk(u1), 'Chunk', { text: 'rewritten text', index: 1, sf_unit_id: u1.unit_id }),
        node(`${chunk(u0)}:0`, 'Equipment', { name: '시험 장비 A', weight: 1.5, tags: ['a', { nested: 1 }] }),
        node(`${chunk(u0)}:1`, 'Deliverable', { name: '응답기 장표' }),
        node('floating:9', 'Decision', { name: 'no chunk' }),
        node(`${chunk(u0)}:2`, 'Document', { name: '이전 장표' }),
        node(`${chunk(u0)}:3`, 'Person', { name: '요청자' }),
        node(`${chunk(u1)}:0`, 'Constraint', { name: '전원 조건', value: '28V' }),
      ], relationships: [
        rel(chunk(u0), 'FROM_DOCUMENT', document.doc_key), rel(chunk(u1), 'FROM_DOCUMENT', document.doc_key),
        rel(`${chunk(u0)}:0`, 'FROM_CHUNK', chunk(u0)), rel(`${chunk(u0)}:1`, 'FROM_CHUNK', chunk(u0)),
        rel(`${chunk(u0)}:1`, 'CONCERNS', `${chunk(u0)}:0`), rel(`${chunk(u0)}:1`, 'REFERENCES', 'elsewhere'),
        rel(`${chunk(u0)}:2`, 'FROM_CHUNK', chunk(u0)), rel(`${chunk(u0)}:3`, 'FROM_CHUNK', chunk(u0)),
        rel(`${chunk(u1)}:0`, 'FROM_CHUNK', chunk(u1)),
      ] }] };
}

test('graph bindings are loopback-only and bounded before any worker starts', async () => {
  const never = async () => { throw new Error('worker must not start'); };
  const { documents, projectKey } = await syntheticDocuments();
  for (const [binding, code] of [
    [{ ...BINDING, llm: { ...BINDING.llm, host: 'http://10.0.0.5:11434' } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, llm: { ...BINDING.llm, host: 'https://example.invalid' } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, llm: { ...BINDING.llm, max_calls: 0 } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, llm: { ...BINDING.llm, model: 'bad model name' } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, llm: { ...BINDING.llm, think: 'max' } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, llm: { ...BINDING.llm, options: null } }, 'graph_llm_binding_invalid'],
    [{ ...BINDING, embedder: { host: 'http://192.168.0.2:11434', model: 'embed' } }, 'graph_embedder_binding_invalid'],
  ]) {
    await assert.rejects(extractGraphFragments({ documents, projectKey, profile: GRAPH_EXTRACTION_PROFILE, binding, runWorker: never }), { code });
  }
  const bound = validateGraphBinding(BINDING);
  assert.deepEqual({ keep_alive: bound.llm.keep_alive, think: bound.llm.think, options: bound.llm.options },
    { keep_alive: '0s', think: false, options: { temperature: 0, seed: 7, num_predict: 2048 } });
  assert.equal(validateGraphBinding({ ...BINDING, llm: { ...BINDING.llm, think: null } }).llm.think, null);
  await assert.rejects(extractGraphFragments({ documents, projectKey: 'other-project', profile: GRAPH_EXTRACTION_PROFILE,
    binding: BINDING, runWorker: never }), { code: 'graph_documents_invalid' });
});

test('canned worker output: fragment admission keeps chunk-anchored profile entities with provenance only', async () => {
  const { documents, projectKey } = await syntheticDocuments();
  const document = documents[0];
  const run = options => extractGraphFragments({ documents, projectKey, profile: GRAPH_EXTRACTION_PROFILE, binding: BINDING,
    runWorker: async () => ({ exit_code: 0, output: cannedWorkerOutput(document, options) }) });
  const first = await run();
  const second = await run({ createdAt: '2026-09-12T09:30:00+00:00' });
  assert.equal(first.status, 'ok');
  const fragment = first.fragments[0];
  assert.deepEqual(fragment.nodes.map(node => node.label), ['Chunk', 'Deliverable', 'Document', 'Equipment']);
  assert.deepEqual({ chunks: fragment.stats.chunks, entities: fragment.stats.entities,
    without_chunk: fragment.stats.entities_without_chunk, reserved: fragment.stats.entities_reserved_label,
    outside_schema: fragment.stats.entities_outside_schema, dropped_rels: fragment.stats.relationships_outside_fragment,
    mismatched: fragment.stats.chunks_mismatched, entity_relationships: fragment.stats.entity_relationships },
  { chunks: 1, entities: 2, without_chunk: 2, reserved: 1, outside_schema: 1, dropped_rels: 5, mismatched: 1, entity_relationships: 1 });
  const byLabel = label => fragment.nodes.find(node => node.label === label);
  assert.deepEqual(byLabel('Document').properties.createdAt, undefined, 'the tool timestamp is not part of the fragment');
  assert.deepEqual({ text: byLabel('Chunk').properties.text, index: byLabel('Chunk').properties.index },
    { text: document.units[0].text, index: 0 });
  assert.deepEqual({ embedded: fragment.stats.embedded_chunks, dimensions: byLabel('Chunk').embedding_ref.dimensions,
    vector: byLabel('Chunk').embedding }, { embedded: 1, dimensions: 3, vector: [0.25, -0.5, 0.125] });
  const equipment = byLabel('Equipment');
  assert.deepEqual({ weight: equipment.properties.weight, tags: equipment.properties.tags }, { weight: '1.5', tags: undefined },
    'hashable property values only');
  assert.deepEqual({ project: equipment.properties.sf_project, state: equipment.properties.sf_claim_state,
    unit: equipment.properties.sf_unit_id, model: equipment.properties.sf_model, digest: equipment.properties.sf_model_digest,
    profile: equipment.properties.sf_profile_version },
  { project: projectKey, state: 'observed', unit: document.units[0].unit_id, model: 'local-model:tag', digest: LLM_DIGEST,
    profile: GRAPH_EXTRACTION_PROFILE.profile_version });
  assert.deepEqual(fragment.tool_pruning, { nodes: { NOT_IN_SCHEMA: 2 }, relationships: { INVALID_PATTERN: 1 }, properties: {} });
  assert.deepEqual({ think: first.model.think, digest: first.model.llm_digest }, { think: false, digest: LLM_DIGEST });
  assert.equal(fragment.fragment_sha256, second.fragments[0].fragment_sha256, 'same input, same fragment despite the tool clock');
  assert.deepEqual({ calls: first.llm.calls, truncated: first.llm.truncated }, { calls: 1, truncated: 1 });
  assert.equal(JSON.stringify(first.llm.trace).includes(document.units[0].text), false, 'only named trace fields leave the worker');
  const failed = await extractGraphFragments({ documents, projectKey, profile: GRAPH_EXTRACTION_PROFILE, binding: BINDING,
    runWorker: async () => ({ exit_code: 3, output: { status: 'error', code: 'llm_endpoint_not_loopback' } }) });
  assert.deepEqual({ status: failed.status, code: failed.code, fragments: failed.fragments.length },
    { status: 'failed', code: 'llm_endpoint_not_loopback', fragments: 0 });
  for (const models of [{}, { llm: { model: 'other-model:tag', digest: LLM_DIGEST } }, { llm: { model: 'local-model:tag', digest: 'latest' } },
    { llm: { model: 'local-model:tag', digest: LLM_DIGEST }, embedder: { model: 'embed', digest: LLM_DIGEST } }]) {
    await assert.rejects(run({ models }), { code: 'graph_worker_models_invalid' });
  }
  const probed = await probeGraphModels({ binding: BINDING, runWorker: async ({ request }) => ({ exit_code: 0,
    output: { status: 'ok', models: { llm: { model: request.models.llm.model, digest: LLM_DIGEST } } } }) });
  assert.deepEqual(probed, first.model, 'the probe reports the same model revision the extraction stamps');
  await assert.rejects(probeGraphModels({ binding: BINDING, runWorker: async () => ({ exit_code: 3,
    output: { status: 'error', code: 'llm_model_not_installed' } }) }), { code: 'llm_model_not_installed' });
  await assert.rejects(extractGraphFragments({ documents, projectKey, profile: GRAPH_EXTRACTION_PROFILE, binding: BINDING,
    expectedModels: { ...probed, llm_digest: 'sha256:' + 'f'.repeat(64) },
    runWorker: async () => ({ exit_code: 0, output: cannedWorkerOutput(document) }) }), { code: 'graph_model_changed' });
  const models = { llm: 'local-model:tag', llm_digest: LLM_DIGEST, think: false, options: {}, embedder: null, embedder_digest: null };
  assert.throws(() => admitGraphFragment({ fragment: { ...cannedWorkerOutput(document).fragments[0], doc_key: 'sha256:' + '0'.repeat(64) },
    document, projectKey, profile: GRAPH_EXTRACTION_PROFILE, models }), { code: 'graph_fragment_shape_invalid' });
  const withoutDocument = cannedWorkerOutput(document).fragments[0];
  assert.throws(() => admitGraphFragment({ fragment: { ...withoutDocument, nodes: withoutDocument.nodes.slice(1) },
    document, projectKey, profile: GRAPH_EXTRACTION_PROFILE, models }), { code: 'graph_fragment_document_mismatch' });
});

const PYTHON = process.env.SOULFORGE_TEST_GRAPHRAG_PYTHON;
const MODEL = process.env.SOULFORGE_TEST_GRAPHRAG_LLM;
test('real neo4j-graphrag extraction with a local model produces admitted chunk-anchored fragments (opt-in)',
  { skip: PYTHON && MODEL ? false : 'set SOULFORGE_TEST_GRAPHRAG_PYTHON and SOULFORGE_TEST_GRAPHRAG_LLM to run the real worker', timeout: 900000 },
  async () => {
    const host = process.env.SOULFORGE_TEST_OLLAMA_HOST || 'http://127.0.0.1:11434';
    const embedderModel = process.env.SOULFORGE_TEST_GRAPHRAG_EMBEDDER || null;
    const { documents, projectKey } = await syntheticDocuments();
    const result = await extractGraphFragments({ documents, projectKey, profile: GRAPH_EXTRACTION_PROFILE,
      binding: { worker: { interpreter_path: PYTHON, timeout_ms: 900000 },
        llm: { host, model: MODEL, max_calls: 20, keep_alive: process.env.SOULFORGE_TEST_GRAPHRAG_KEEP_ALIVE || '30s' },
        embedder: embedderModel ? { host, model: embedderModel } : null } });
    assert.ok(['ok', 'partial'].includes(result.status), JSON.stringify({ status: result.status, code: result.code }));
    const fragment = result.fragments[0];
    assert.equal(fragment.stats.chunks, documents[0].units.length);
    assert.equal(fragment.stats.chunks_mismatched, 0);
    assert.match(result.model.llm_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.ok(fragment.stats.entities >= 1, 'the local model proposed no entity at all');
    for (const node of fragment.nodes.filter(row => !['Document', 'Chunk'].includes(row.label))) {
      assert.ok(documents[0].units.some(unit => unit.unit_id === node.properties.sf_unit_id));
    }
    assert.ok(result.llm.calls >= 1 && result.llm.trace.every(row => /^sha256:/u.test(row.input_sha256)));
    if (embedderModel) assert.equal(fragment.stats.embedded_chunks, fragment.stats.chunks);
    process.stdout.write(`# graphrag real run: ${JSON.stringify({ model: result.model, stats: fragment.stats,
      tool_pruning: fragment.tool_pruning, llm: { calls: result.llm.calls, errors: result.llm.errors, truncated: result.llm.truncated,
        thinking_characters: result.llm.thinking_characters, prompt_tokens: result.llm.prompt_tokens,
        output_tokens: result.llm.output_tokens, elapsed_ms: result.llm.elapsed_ms },
      labels: [...new Set(fragment.nodes.map(node => node.label))] })}\n`);
  });
