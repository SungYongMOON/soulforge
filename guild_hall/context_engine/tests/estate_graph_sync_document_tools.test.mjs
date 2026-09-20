import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as sync from '../harness/estate_graph_sync.mjs';
import { makeGraphIndexStore, INDEX_NOW } from '../harness/fixtures/graph_index_fixture.mjs';

const pdfPython = process.env.SOULFORGE_TEST_PDF_PYTHON;
const docxPython = process.env.SOULFORGE_TEST_DOCX_PYTHON;
const skip = pdfPython && docxPython ? false : 'set explicit PDF and DOCX parser interpreters';
const pdfUrl = new URL('../../../docs/architecture/workspace/examples/context-memory/t5-document-current.pdf', import.meta.url);
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('graph sync preflight forwards the binding document tools to real PDF and DOCX parsers', { skip }, async t => {
  assert.equal(typeof sync.prepareSyncSources, 'function');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-doc-tools-'));
  const docxPath = path.join(dir, 'trial.docx');
  t.after(async () => { assert.equal(path.dirname(dir), os.tmpdir()); await rm(dir, { recursive: true, force: true }); });
  await promisify(execFile)(docxPython, ['-I', '-X', 'utf8', '-c',
    "from docx import Document;import sys;d=Document();d.add_paragraph('DOCX paragraph');t=d.add_table(rows=1,cols=1);t.cell(0,0).text='DOCX cell';d.save(sys.argv[1])",
    docxPath], { timeout: 30000, maxBuffer: 1024 * 1024 });
  const pdf = await readFile(pdfUrl), docx = await readFile(docxPath);
  const store = await makeGraphIndexStore({ memos: { 'trial.pdf': pdf, 'trial.docx': docx }, writeOperations: ['index', 'prepare'] });
  t.after(async () => { for (const root of [store.storeRoot, store.sourceRoot]) {
    assert.equal(path.dirname(root), os.tmpdir()); await rm(root, { recursive: true, force: true });
  } });
  store.binding.document_tools = {
    pdf: { interpreterPath: pdfPython, extractionProfile: 'pdfplumber-tables-v1',
      disableSiteStartup: process.platform === 'win32' },
    docx: { interpreterPath: docxPython, extractionProfile: 'python-docx-structure-v1',
      disableSiteStartup: process.platform === 'win32' },
  };
  const grant = JSON.parse(await readFile(path.join(store.storeRoot, store.binding.grant.path), 'utf8'));
  const prepared = await sync.prepareSyncSources({ binding: store.binding, grant, roots: store.binding.source_roots,
    now: INDEX_NOW, admission: null });
  assert.deepEqual(prepared.coverage.counts, { prepared: 2, missing: 0, stale_grant: 0, refused: 0, failed: 0 });
  assert.deepEqual(prepared.documents.map(document => document.item_id).sort(), ['trial.docx', 'trial.pdf']);
  assert.equal(sha(await readFile(path.join(store.sourceRoot, 'trial.pdf'))), sha(pdf));
  assert.equal(sha(await readFile(path.join(store.sourceRoot, 'trial.docx'))), sha(docx));
});
