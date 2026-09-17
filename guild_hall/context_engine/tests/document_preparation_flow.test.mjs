import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeGraphIndexStore, indexerRequest, READER_REQUEST, INDEX_NOW, INDEX_PROJECT,
  cannedGraphWorker } from '../harness/fixtures/graph_index_fixture.mjs';
import { runPreparationFlow } from '../harness/preparation_flow.mjs';
import { readPreparationGeneration } from '../src/runtime/preparation_store.mjs';
import { GRAPH_INDEX_BINDING_FILE, updateGraphIndex, openGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { createGraphIndexRetriever } from '../src/runtime/graph_index_retrieval.mjs';
import { readOriginal } from '../src/runtime/original_read.mjs';
import { rootedStore } from '../src/runtime/pair_store.mjs';

const python = process.env.SOULFORGE_TEST_PDF_PYTHON;
const skip = python ? false : 'set SOULFORGE_TEST_PDF_PYTHON for the real local PDF parser';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const pdfUrl = new URL('../../../docs/architecture/workspace/examples/context-memory/t5-document-current.pdf', import.meta.url);
async function pdfStore(t, withTools = true) {
  const pdf = await readFile(pdfUrl);
  const store = await makeGraphIndexStore({ memos: { 'current.pdf': pdf }, writeOperations: ['index', 'prepare'] });
  t.after(async () => {
    for (const dir of [store.storeRoot, store.sourceRoot]) {
      assert.equal(path.dirname(dir), os.tmpdir());
      await rm(dir, { recursive: true, force: true });
    }
  });
  if (withTools) {
    store.binding.document_tools = { pdf: { interpreterPath: python, extractionProfile: 'pdfplumber-tables-v1',
      disableSiteStartup: process.platform === 'win32' } };
    store.bindingSha256 = (await store.put(GRAPH_INDEX_BINDING_FILE, store.binding)).sha256;
  }
  return { ...store, pdf, originalSha: sha(pdf) };
}

test('real PDF preparation reaches inactive store and validates without a graph or accepted pointer', { skip }, async t => {
  const store = await pdfStore(t);
  const request = indexerRequest();
  const receipt = await runPreparationFlow({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request, runId: 'pdf-prep', validationRunId: 'pdf-val', now: INDEX_NOW });
  assert.equal(receipt.steps.prepare.documents, 1);
  assert.equal(receipt.steps.prepare.coverage.prepared, 1);
  assert.equal(receipt.steps.validate.outcome, 'pass');
  const back = await readPreparationGeneration({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request, generationId: 'pdf-prep' });
  assert.equal(back.documents[0].primary_revision_sha256, store.originalSha);
  assert.ok(back.documents[0].units.some(u => /28/.test(u.text)));
  assert.ok(back.documents[0].units.some(u => u.unit_kind === 'pdf_table_cell'));
  for (const u of back.documents[0].units) {
    assert.deepEqual(u.locator.path, ['current.pdf']);
    assert.ok(Number.isInteger(u.locator.page_number) && u.locator.page_number > 0);
  }
  // Integrity is not independent source-fidelity evidence; keep that gap visible.
  assert.notEqual(receipt.steps.source_check.outcome, 'pass');
  await assert.rejects(readFile(path.join(store.storeRoot, INDEX_PROJECT, '00_프로젝트_안내/graph_index_current.json')),
    error => error.code === 'ENOENT');
  assert.equal(sha(await readFile(path.join(store.sourceRoot, 'current.pdf'))), store.originalSha);
});

test('real PDF -> canned graph extraction -> lexical evidence and replay, with no live model or database', { skip }, async t => {
  const store = await pdfStore(t);
  const worker = cannedGraphWorker();
  const first = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'pdf-g1', expected_prior: null }), now: INDEX_NOW, runWorker: worker.runWorker });
  assert.equal(first.status, 'COMMITTED');
  const view = openGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256, request: READER_REQUEST });
  const retriever = createGraphIndexRetriever(view);
  const found = retriever.lexical('28');
  assert.ok(found.hits.length > 0);
  assert.ok(found.hits.every(hit => hit.item_id === 'current.pdf' && hit.locator.page_number >= 1));
  await store.put('control_root/project-bindings/' + store.fsKey + '/graph_index_binding.unified.json', store.binding);
  const original = await readOriginal({ io: rootedStore(store.storeRoot), project: store.fsKey,
    itemId: 'current.pdf', actorRef: READER_REQUEST.actor_ref, now: INDEX_NOW, tools: null });
  assert.equal(original.status, 'ok');
  assert.equal(original.internal.parser_calls_scope, 'attachment_derivation_only');
  assert.ok(original.units.some(unit => /28/.test(unit.text)));
  const beforeCalls = worker.calls.extract;
  const replay = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'pdf-g2', expected_prior: first.pointer_sha256 }), now: INDEX_NOW,
    runWorker: worker.runWorker });
  assert.equal(replay.status, 'UNCHANGED');
  assert.equal(worker.calls.extract, beforeCalls);
  assert.equal(sha(await readFile(path.join(store.sourceRoot, 'current.pdf'))), store.originalSha);
});

test('unconnected PDF keeps graph generation unavailable before any model extraction', async t => {
  const store = await pdfStore(t, false), worker = cannedGraphWorker();
  const result = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'no-pdf', expected_prior: null }), now: INDEX_NOW, runWorker: worker.runWorker });
  assert.equal(result.status, 'HOLD');
  assert.equal(worker.calls.extract, 0);
});
