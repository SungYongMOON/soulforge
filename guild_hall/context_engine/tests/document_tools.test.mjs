import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as toolsModule from '../src/runtime/document_tools.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { runPreparationFlow } from '../harness/preparation_flow.mjs';
import { prepareSyncSources } from '../harness/estate_graph_sync.mjs';
import { readOriginal } from '../src/runtime/original_read.mjs';
import { GRAPH_INDEX_BINDING_FILE, updateGraphIndex } from '../src/runtime/graph_index_generation.mjs';
import { cannedGraphWorker, indexerRequest, makeGraphIndexStore, INDEX_NOW } from '../harness/fixtures/graph_index_fixture.mjs';

const interpreter = path.resolve(os.tmpdir(), process.platform === 'win32' ? 'python.exe' : 'python');
const option = extractionProfile => ({ interpreterPath: interpreter, extractionProfile,
  ...(process.platform === 'win32' ? { disableSiteStartup: true } : {}) });

test('document tool schema admits absent or exact PDF/DOCX host bindings only', () => {
  assert.equal(typeof toolsModule.validateDocumentTools, 'function');
  const validate = toolsModule.validateDocumentTools;
  assert.equal(validate(undefined), null);
  assert.equal(validate(null), null);
  const both = validate({ pdf: option('pdfplumber-tables-v1'), docx: option('python-docx-structure-v1') });
  assert.deepEqual(Object.keys(both).sort(), ['docx', 'pdf']);
  assert.equal(Object.isFrozen(both) && Object.isFrozen(both.pdf), true);
  for (const value of [
    {}, { other: option('pdfplumber-tables-v1') },
    { pdf: { ...option('pdfplumber-tables-v1'), command: 'anything' } },
    { pdf: option('wrong-profile') },
    { pdf: { ...option('pdfplumber-tables-v1'), interpreterPath: 'relative/python' } },
    { docx: { ...option('python-docx-structure-v1'), disableSiteStartup: 'yes' } },
  ]) assert.throws(() => validate(value), { code: 'document_tools_invalid' });
});

test('document tool interpreter paths are fully qualified for the host platform', () => {
  const validate = toolsModule.validateDocumentTools;
  if (process.platform === 'win32') {
    const slash = String.fromCharCode(92);
    const drive = `${path.parse(process.cwd()).root.slice(0, 2)}${slash}tools${slash}python.exe`;
    const unc = `${slash}${slash}server${slash}share${slash}python.exe`;
    assert.equal(validate({ pdf: { ...option('pdfplumber-tables-v1'), interpreterPath: drive } }).pdf.interpreterPath, drive);
    assert.equal(validate({ docx: { ...option('python-docx-structure-v1'), interpreterPath: unc } }).docx.interpreterPath, unc);
    for (const rootedWithoutDrive of ['/python.exe', `${slash}python.exe`, 'C:python.exe']) {
      assert.throws(() => validate({ pdf: { ...option('pdfplumber-tables-v1'), interpreterPath: rootedWithoutDrive } }),
        { code: 'document_tools_invalid' });
    }
  } else {
    assert.equal(validate({ pdf: { ...option('pdfplumber-tables-v1'), interpreterPath: '/usr/bin/python' } }).pdf.interpreterPath,
      '/usr/bin/python');
  }
});

test('document tool schema rejects accessors without running caller code and source preparation fails before grant work', async () => {
  let called = false;
  const value = {};
  Object.defineProperty(value, 'pdf', { enumerable: true, get() { called = true; return option('pdfplumber-tables-v1'); } });
  assert.throws(() => toolsModule.validateDocumentTools(value), { code: 'document_tools_invalid' });
  assert.equal(called, false);
  await assert.rejects(prepareSourceDocuments({ documentTools: {} }), { code: 'document_tools_invalid' });
});

test('preparation, graph, sync and original-read binding entrypoints reject malformed document tools early', async t => {
  const malformed = { pdf: { interpreterPath: interpreter, extractionProfile: 'wrong-profile' } };
  await assert.rejects(prepareSyncSources({ binding: { document_tools: malformed } }), { code: 'graph_sync_binding_invalid' });

  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-document-tools-binding-'));
  t.after(async () => { assert.equal(path.dirname(root), os.tmpdir()); await rm(root, { recursive: true, force: true }); });
  const bindingBytes = Buffer.from(JSON.stringify({ document_tools: malformed }));
  await writeFile(path.join(root, GRAPH_INDEX_BINDING_FILE), bindingBytes);
  const bindingSha256 = `sha256:${createHash('sha256').update(bindingBytes).digest('hex')}`;
  await assert.rejects(runPreparationFlow({ storeRoot: root, bindingSha256,
    request: {}, runId: 'bad-tools-run', validationRunId: 'bad-tools-val', now: INDEX_NOW }),
  { code: 'preparation_flow_binding_invalid' });

  const store = await makeGraphIndexStore();
  t.after(async () => { for (const dir of [store.storeRoot, store.sourceRoot]) {
    assert.equal(path.dirname(dir), os.tmpdir()); await rm(dir, { recursive: true, force: true });
  } });
  store.binding.document_tools = malformed;
  store.bindingSha256 = (await store.put(GRAPH_INDEX_BINDING_FILE, store.binding)).sha256;
  const worker = cannedGraphWorker();
  const rejected = await updateGraphIndex({ storeRoot: store.storeRoot, bindingSha256: store.bindingSha256,
    request: indexerRequest({ generation_id: 'bad-tools', expected_prior: null }), now: INDEX_NOW,
    runWorker: worker.runWorker });
  assert.deepEqual([rejected.status, rejected.code], ['HOLD', 'graph_index_binding_invalid']);
  assert.equal(worker.calls.probe + worker.calls.extract, 0);

  const project = 'P01-001';
  const address = `control_root/project-bindings/${project}/graph_index_binding.unified.json`;
  const io = { read(ref) { if (ref === address) return bindingBytes; throw Object.assign(new Error('not reached'), { code: 'ENOENT' }); } };
  await assert.rejects(readOriginal({ io, project, itemId: 'memo' }), { code: 'original_read_binding_invalid' });
});
