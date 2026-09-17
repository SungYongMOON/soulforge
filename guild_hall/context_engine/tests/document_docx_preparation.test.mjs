import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { DOCX_PREPARATION_PROFILE, DOCX_PREPARATION_WORKER_SHA256,
  preparePinnedDocxCandidate } from '../algorithms/preparation/pinned_docx_v1.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';

const python = process.env.SOULFORGE_TEST_DOCX_PYTHON ?? process.env.SOULFORGE_TEST_PDF_PYTHON;
const skip = python ? false : 'set SOULFORGE_TEST_DOCX_PYTHON to an absolute interpreter with python-docx';
const NOW = '2026-09-12T00:00:00.000Z';
const ROOT_REF = 'document.docx.synthetic';
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const item = (itemId, filePath, overrides = {}) => ({ item_id: itemId, path: filePath,
  revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic', ...overrides });
const grant = items => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.document.docx.1', project_ref: ref(1),
  purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
  sources: [{ kind: 'document', root_ref: ROOT_REF, items }] });
const tools = interpreterPath => ({ docx: { interpreterPath, extractionProfile: DOCX_PREPARATION_PROFILE,
  disableSiteStartup: process.platform === 'win32' } });

const FIXTURE_SCRIPT = String.raw`
import io, os, re, sys, zipfile
from pathlib import Path
sys.path.append(str(Path(sys.executable).parent / 'Lib' / 'site-packages'))
from docx import Document
from docx.enum.style import WD_STYLE_TYPE

out, kind = sys.argv[1], sys.argv[2]

def patch_document(fragment):
    source = out + '.source'
    os.replace(out, source)
    with zipfile.ZipFile(source, 'r') as old, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as new:
        for info in old.infolist():
            body = old.read(info.filename)
            if info.filename == 'word/document.xml':
                body = body.replace(b'</w:body>', fragment.encode('utf-8') + b'</w:body>')
            new.writestr(info, body)
    os.remove(source)

if kind == 'oversize':
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('word/styles.xml', b'x' * (17 * 1024 * 1024))
    raise SystemExit(0)
if kind == 'unsafe-path':
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('../outside.xml', b'<x/>')
    raise SystemExit(0)

document = Document()
if kind == 'normal':
    document.add_paragraph('Before table')
    table = document.add_table(rows=2, cols=2)
    for cell, value in zip([cell for row in table.rows for cell in row.cells], ['A1', 'B1', 'A2', 'B2']):
        cell.text = value
    document.add_paragraph('After table')
elif kind == 'hidden-direct':
    run = document.add_paragraph().add_run('Hidden direct')
    run.font.hidden = True
elif kind == 'hidden-inherited':
    base = document.styles.add_style('HiddenBase', WD_STYLE_TYPE.PARAGRAPH)
    base.font.hidden = True
    child = document.styles.add_style('HiddenChild', WD_STYLE_TYPE.PARAGRAPH)
    child.base_style = base
    paragraph = document.add_paragraph('Hidden inherited')
    paragraph.style = child
elif kind == 'hidden-mixed':
    run = document.add_paragraph().add_run('Still hidden')
    run.font.hidden = True
elif kind == 'merge':
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'left'
    table.cell(0, 1).text = 'right'
    table.cell(0, 0).merge(table.cell(0, 1))
elif kind == 'hmerge':
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'left'
    table.cell(0, 1).text = 'right'
    for cell, value in ((table.cell(0, 0), 'restart'), (table.cell(0, 1), 'continue')):
        node = OxmlElement('w:hMerge')
        node.set(qn('w:val'), value)
        cell._tc.get_or_add_tcPr().append(node)
elif kind == 'numbering':
    document.add_paragraph('Numbered paragraph', style='List Number')
elif kind == 'no-doc-defaults':
    document.add_paragraph('No document defaults')
elif kind in ('sdt', 'math', 'foreign', 'dtd-utf16'):
    document.add_paragraph('Visible')
else:
    raise SystemExit(2)
document.save(out)
if kind == 'no-doc-defaults':
    source = out + '.source'
    os.replace(out, source)
    with zipfile.ZipFile(source, 'r') as old, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as new:
        for info in old.infolist():
            body = old.read(info.filename)
            if info.filename == 'word/styles.xml':
                body, count = re.subn(br'<w:docDefaults>.*?</w:docDefaults>', b'', body, count=1, flags=re.DOTALL)
                if count != 1:
                    raise SystemExit(3)
            new.writestr(info, body)
    os.remove(source)
if kind == 'hidden-mixed':
    source = out + '.source'
    os.replace(out, source)
    with zipfile.ZipFile(source, 'r') as old, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as new:
        for info in old.infolist():
            body = old.read(info.filename)
            if info.filename == 'word/document.xml':
                body = body.replace(b'</w:rPr>', b'<w:webHidden w:val="0"/></w:rPr>', 1)
            new.writestr(info, body)
    os.remove(source)
if kind == 'sdt':
    patch_document('<w:sdt><w:sdtContent><w:p><w:r><w:t>wrapped</w:t></w:r></w:p></w:sdtContent></w:sdt>')
elif kind == 'math':
    patch_document('<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>')
elif kind == 'foreign':
    patch_document('<w:p><x:r xmlns:x="urn:foreign"><x:t>LOST CONTENT</x:t></x:r></w:p>')
elif kind == 'dtd-utf16':
    source = out + '.source'
    os.replace(out, source)
    xml = ('<?xml version="1.0" encoding="UTF-16"?>'
           '<!DOCTYPE w:document [<!ENTITY held "x">]>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
           '<w:body><w:p><w:r><w:t>&held;</w:t></w:r></w:p><w:sectPr/></w:body></w:document>').encode('utf-16')
    with zipfile.ZipFile(source, 'r') as old, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as new:
        for info in old.infolist():
            new.writestr(info, xml if info.filename == 'word/document.xml' else old.read(info.filename))
    os.remove(source)
`;

function pythonArgs(script, ...args) {
  return process.platform === 'win32'
    ? ['-I', '-B', '-S', '-c', `import sys;from pathlib import Path;sys.path.append(str(Path(sys.executable).parent/'Lib'/'site-packages'));${script}`, ...args]
    : ['-I', '-B', '-c', script, ...args];
}

async function fixture(root, kind, name = `${kind}.docx`) {
  const target = path.join(root, name);
  const run = spawnSync(python, pythonArgs(FIXTURE_SCRIPT, target, kind), { windowsHide: true, encoding: 'utf8' });
  assert.equal(run.status, 0, `fixture ${kind} failed: ${run.stderr}`);
  return { name, target, bytes: await readFile(target) };
}

test('DOCX request accessors and byte-view shadows are refused without executing caller code', async () => {
  let requestGetterCalled = false;
  const accessorRequest = {};
  Object.defineProperty(accessorRequest, 'docxBytes', { enumerable: true, get() {
    requestGetterCalled = true; return Buffer.from('x');
  } });
  Object.defineProperty(accessorRequest, 'expectedSha256', { enumerable: true, value: '0'.repeat(64) });
  await assert.rejects(preparePinnedDocxCandidate(accessorRequest, {}),
    { code: 'docx_preparation_request_invalid' });
  assert.equal(requestGetterCalled, false);

  let byteGetterCalled = false;
  const bytes = Buffer.from('x');
  Object.defineProperty(bytes, 'byteLength', { get() { byteGetterCalled = true; return 1; } });
  await assert.rejects(preparePinnedDocxCandidate({ docxBytes: bytes, expectedSha256: digest(Buffer.from('x')).slice(7) }, {}),
    { code: 'docx_preparation_request_invalid' });
  assert.equal(byteGetterCalled, false);
});

test('DOCX body-table-body preparation preserves structural positions, identity and replay', { skip }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-docx-normal-'));
  const source = await fixture(root, 'normal', 'review memo.docx');
  const sourceGrant = grant([item('review-memo', [source.name])]);
  const first = await prepareSourceDocuments({ grant: sourceGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: tools(python) });
  assert.deepEqual(first.coverage.counts, { prepared: 1, missing: 0, stale_grant: 0, refused: 0, failed: 0 });
  const [document] = first.documents;
  assert.equal(document.primary_revision_sha256, digest(source.bytes));
  assert.deepEqual(document.units.map(unit => unit.text), ['Before table', 'A1', 'B1', 'A2', 'B2', 'After table']);
  assert.deepEqual(document.units.map(unit => unit.locator.block_index), [1, 2, 2, 2, 2, 3]);
  assert.deepEqual(document.units.filter(unit => unit.unit_kind === 'docx_table_cell')
    .map(unit => [unit.locator.table_index, unit.locator.row_number, unit.locator.column_number]),
  [[1, 1, 1], [1, 1, 2], [1, 2, 1], [1, 2, 2]]);
  assert.ok(document.units.every(unit => unit.locator.part === 'word/document.xml'
    && unit.locator.source_sha256 === digest(source.bytes) && !Object.hasOwn(unit.locator, 'page_number')));
  assert.ok(document.components.some(component => component.kind === 'docx_worker'
    && component.id === DOCX_PREPARATION_PROFILE && component.sha256 === DOCX_PREPARATION_WORKER_SHA256));
  assert.equal(JSON.stringify(document).includes(root), false);
  assert.equal(JSON.stringify(document).includes(python), false);

  const replay = await prepareSourceDocuments({ grant: sourceGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: tools(python) });
  assert.deepEqual(replay.documents, first.documents);
  const staleGrant = grant([item('review-memo', [source.name],
    { revision_policy: 'exact', revision_sha256: `sha256:${'0'.repeat(64)}` })]);
  const stale = await prepareSourceDocuments({ grant: staleGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: tools(python) });
  assert.deepEqual(stale.coverage.items.map(row => [row.status, row.code]),
    [['stale_grant', 'granted_revision_absent']]);
  assert.equal(digest(await readFile(source.target)), digest(source.bytes));
});

test('DOCX with styles but no docDefaults uses visible unnumbered defaults', { skip }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-docx-no-defaults-'));
  const source = await fixture(root, 'no-doc-defaults');
  const out = await prepareSourceDocuments({ grant: grant([item('no-defaults', [source.name])]),
    roots: { [ROOT_REF]: root }, now: NOW, documentTools: tools(python) });
  assert.deepEqual(out.coverage.items.map(row => [row.status, row.code]), [['prepared', null]]);
  assert.deepEqual(out.documents[0].units.map(unit => unit.text), ['No document defaults']);
});

test('DOCX refuses hidden, wrapped, math and merged content without a partial document', { skip }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-docx-refuse-'));
  const cases = [
    ['hidden-direct', 'docx_hidden_text_unsupported'],
    ['hidden-inherited', 'docx_hidden_text_unsupported'],
    ['hidden-mixed', 'docx_hidden_text_unsupported'],
    ['sdt', 'docx_sdt_unsupported'],
    ['math', 'docx_math_unsupported'],
    ['merge', 'docx_table_merge_unsupported'],
    ['hmerge', 'docx_table_merge_unsupported'],
    ['foreign', 'docx_structure_unsupported'],
    ['numbering', 'docx_numbering_unsupported'],
    ['dtd-utf16', 'docx_xml_directive_unsupported'],
  ];
  for (const [kind] of cases) await fixture(root, kind);
  const out = await prepareSourceDocuments({ grant: grant(cases.map(([kind]) => item(kind, [`${kind}.docx`]))),
    roots: { [ROOT_REF]: root }, now: NOW, documentTools: tools(python) });
  assert.equal(out.documents.length, 0);
  assert.deepEqual(out.coverage.items.map(row => [row.item_id, row.status, row.code]),
    cases.sort(([a], [b]) => a.localeCompare(b)).map(([kind, code]) => [kind, 'refused', code]));
});

test('DOCX corrupt and decompression-bound inputs fail explicitly; unbound and invalid tools stay closed', { skip }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-docx-bounds-'));
  await writeFile(path.join(root, 'corrupt.docx'), 'not a zip');
  await fixture(root, 'oversize');
  await fixture(root, 'unsafe-path');
  const sourceGrant = grant([item('corrupt', ['corrupt.docx']), item('oversize', ['oversize.docx']),
    item('unsafe-path', ['unsafe-path.docx'])]);
  const out = await prepareSourceDocuments({ grant: sourceGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: tools(python) });
  assert.deepEqual(out.coverage.items.map(row => [row.item_id, row.status, row.code]), [
    ['corrupt', 'failed', 'docx_unreadable'], ['oversize', 'failed', 'docx_zip_bounds_exceeded'],
    ['unsafe-path', 'failed', 'docx_zip_member_unsafe'],
  ]);
  const unbound = await prepareSourceDocuments({ grant: grant([item('corrupt', ['corrupt.docx'])]),
    roots: { [ROOT_REF]: root }, now: NOW });
  assert.deepEqual(unbound.coverage.items.map(row => [row.status, row.code]),
    [['failed', 'docx_preparation_not_connected']]);
  const invalid = await prepareSourceDocuments({ grant: grant([item('corrupt', ['corrupt.docx'])]),
    roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: { docx: { interpreterPath: 'relative/python', extractionProfile: DOCX_PREPARATION_PROFILE } } });
  assert.deepEqual(invalid.coverage.items.map(row => [row.status, row.code]),
    [['failed', 'docx_preparation_tool_invalid']]);
});

const PINNED_DOCX = new URL('../algorithms/preparation/pinned_docx_v1.mjs', import.meta.url);
const FAKE_WORKER = `
import json, pathlib, sys, time
sys.stdin.buffer.read()
pathlib.Path(__file__).with_suffix('.started').write_text('started', encoding='utf-8')
time.sleep(0.5)
print(json.dumps({'status':'extracted','engine':'python-docx','profile':'python-docx-structure-v1',
  'engine_version':'1.2.0','block_count':1,'unit_count':1,'character_count':1,
  'blocks':[{'kind':'paragraph','block_index':1,'paragraph_index':1,'text':'x'}]}, separators=(',',':')))
`;

async function isolatedPinnedDocx() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-docx-worker-guard-'));
  const preparation = path.join(root, 'guild_hall', 'context_engine', 'algorithms', 'preparation');
  const workers = path.join(root, 'guild_hall', 'context_engine', 'src', 'workers');
  await mkdir(preparation, { recursive: true });
  await mkdir(workers, { recursive: true });
  const pinnedPath = path.join(preparation, 'pinned_docx_v1.mjs');
  const workerPath = path.join(workers, 'document_docx_extract.py');
  await copyFile(PINNED_DOCX, pinnedPath);
  await writeFile(workerPath, FAKE_WORKER);
  const pinned = await import(pathToFileURL(pinnedPath).href);
  return { pinned, workerPath, startedPath: workerPath.replace(/\.py$/u, '.started') };
}

async function waitForFile(file) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { await readFile(file); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('isolated worker did not start');
}

test('DOCX fixed worker changes before launch and during parsing are refused from isolated copies', { skip }, async () => {
  const requestBytes = Buffer.from('synthetic-docx-bytes');
  const request = { docxBytes: requestBytes, expectedSha256: digest(requestBytes).slice(7) };
  const options = tools(python).docx;

  const before = await isolatedPinnedDocx();
  await writeFile(before.workerPath, `${FAKE_WORKER}\n# changed before launch\n`);
  await assert.rejects(before.pinned.preparePinnedDocxCandidate(request, options),
    { code: 'docx_preparation_worker_changed' });

  const during = await isolatedPinnedDocx();
  const pending = during.pinned.preparePinnedDocxCandidate(request, options);
  await waitForFile(during.startedPath);
  await writeFile(during.workerPath, `${FAKE_WORKER}\n# changed during parsing\n`);
  await assert.rejects(pending, { code: 'docx_preparation_worker_changed' });
});
