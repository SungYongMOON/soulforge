import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { PREPARATION_PROFILE, PREPARATION_WORKER_SHA256 } from '../algorithms/preparation/pinned_pdf_v1.mjs';
import { pdfSourceUnits } from '../src/adapters/sources/document_file_source.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { validatePreparationRun } from '../src/runtime/preparation_validation.mjs';
import { SOURCE_GRANT_SCHEMA, SOURCE_LIMITS } from '../src/runtime/source_documents.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const ROOT_REF = 'document.synthetic';
const PDF_FIXTURE = new URL('../../../docs/architecture/workspace/examples/context-memory/t5-document-current.pdf', import.meta.url);
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const item = (itemId, filePath, overrides = {}) => ({ item_id: itemId, path: filePath,
  revision_policy: 'latest_in_custody', revision_sha256: null, data_class: 'public_synthetic', ...overrides });
const grant = items => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.document.pdf.1', project_ref: ref(1),
  purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
  sources: [{ kind: 'document', root_ref: ROOT_REF, items }] });
const pdfTools = interpreterPath => ({ pdf: { interpreterPath, extractionProfile: 'pdfplumber-tables-v1',
  disableSiteStartup: process.platform === 'win32' } });

test('a granted PDF uses the pinned parser and keeps page and table locators', {
  skip: !process.env.SOULFORGE_TEST_PDF_PYTHON && 'set SOULFORGE_TEST_PDF_PYTHON to an absolute interpreter with pdfplumber',
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-document-pdf-'));
  const folder = path.join(root, '검토 문서');
  await mkdir(folder, { recursive: true });
  const filePath = ['검토 문서', '시험 결과 메모.pdf'];
  await copyFile(PDF_FIXTURE, path.join(root, ...filePath));
  const bytes = await readFile(path.join(root, ...filePath));
  const sourceGrant = grant([item('review-memo', filePath)]);
  const preparation = await prepareSourceDocuments({ grant: sourceGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: pdfTools(process.env.SOULFORGE_TEST_PDF_PYTHON), runId: 'prep-document-pdf',
    clock: () => new Date(NOW) });
  const { run, ...out } = preparation;
  assert.deepEqual(out.coverage.counts, { prepared: 1, missing: 0, stale_grant: 0, refused: 0, failed: 0 });
  const [document] = out.documents;
  assert.equal(document.primary_revision_sha256, digest(bytes));
  assert.ok(document.units.some(unit => unit.unit_kind === 'pdf_paragraph' && Number.isSafeInteger(unit.locator.page_number)));
  assert.ok(document.units.some(unit => unit.unit_kind === 'pdf_table_cell' && Number.isSafeInteger(unit.locator.table_number)));
  assert.ok(document.units.every(unit => unit.locator.source_sha256 === digest(bytes)));
  assert.ok(document.components.some(component => component.kind === 'pdf_worker'
    && component.id === PREPARATION_PROFILE && component.sha256 === PREPARATION_WORKER_SHA256));
  assert.equal(document.facts.find(fact => fact.name === 'document.worker_sha256').value, PREPARATION_WORKER_SHA256);
  assert.equal(JSON.stringify(document).includes(process.env.SOULFORGE_TEST_PDF_PYTHON), false);
  assert.equal(JSON.stringify(document).includes(root), false);
  const report = validatePreparationRun({ run, preparation: out, grant: sourceGrant,
    validationRunId: 'validate-document-pdf', checkedAt: NOW });
  assert.equal(report.outcome, 'pass');

  const replay = await prepareSourceDocuments({ grant: sourceGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: pdfTools(process.env.SOULFORGE_TEST_PDF_PYTHON) });
  assert.deepEqual(replay.documents, out.documents);

  const staleGrant = grant([item('review-memo', filePath,
    { revision_policy: 'exact', revision_sha256: `sha256:${'0'.repeat(64)}` })]);
  const stale = await prepareSourceDocuments({ grant: staleGrant, roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: pdfTools(process.env.SOULFORGE_TEST_PDF_PYTHON) });
  assert.deepEqual(stale.coverage.items.map(row => [row.status, row.code]),
    [['stale_grant', 'granted_revision_absent']]);
  assert.equal(digest(await readFile(path.join(root, ...filePath))), digest(bytes));
});

test('a malformed PDF is an explicit failed item and its source bytes stay unchanged', {
  skip: !process.env.SOULFORGE_TEST_PDF_PYTHON && 'set SOULFORGE_TEST_PDF_PYTHON to an absolute interpreter with pdfplumber',
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-document-broken-pdf-'));
  const bytes = Buffer.from('%PDF-1.4\nnot a readable document\n', 'utf8');
  await writeFile(path.join(root, 'broken.pdf'), bytes);
  const out = await prepareSourceDocuments({ grant: grant([item('broken', ['broken.pdf'])]), roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: pdfTools(process.env.SOULFORGE_TEST_PDF_PYTHON) });
  assert.equal(out.documents.length, 0);
  assert.deepEqual(out.coverage.items.map(row => [row.status, row.code]), [['failed', 'pdf_unreadable']]);
  assert.equal(digest(await readFile(path.join(root, 'broken.pdf'))), digest(bytes));
  assert.equal(JSON.stringify(out).includes(root), false);
  assert.equal(JSON.stringify(out).includes(process.env.SOULFORGE_TEST_PDF_PYTHON), false);
});

test('document tool wiring is host-only and leaves legacy text and unsupported formats explicit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-document-boundary-'));
  await writeFile(path.join(root, 'memo.md'), '# Memo\n\nText stays available.\n');
  await writeFile(path.join(root, 'input.pdf'), '%PDF-1.4 synthetic');
  await writeFile(path.join(root, 'input.docx'), 'synthetic');
  const items = [item('memo', ['memo.md']), item('pdf', ['input.pdf']), item('docx', ['input.docx'])];
  const unbound = await prepareSourceDocuments({ grant: grant(items), roots: { [ROOT_REF]: root }, now: NOW });
  assert.deepEqual(Object.fromEntries(unbound.coverage.items.map(row => [row.item_id, [row.status, row.code]])), {
    docx: ['failed', 'docx_preparation_not_connected'], memo: ['prepared', null],
    pdf: ['failed', 'pdf_preparation_not_connected'],
  });
  assert.deepEqual(unbound.documents[0].units.map(unit => [unit.unit_kind, unit.text]),
    [['heading', 'Memo'], ['paragraph', 'Text stays available.']]);

  const invalid = await prepareSourceDocuments({ grant: grant([item('pdf', ['input.pdf'])]), roots: { [ROOT_REF]: root }, now: NOW,
    documentTools: { pdf: { interpreterPath: 'caller/relative/python', extractionProfile: PREPARATION_PROFILE } } });
  assert.deepEqual(invalid.coverage.items.map(row => [row.status, row.code]),
    [['failed', 'pdf_preparation_tool_invalid']]);
});

const page = overrides => ({ page_number: 1, text: '', width: 612, height: 792,
  coordinate_system: 'top-left-points', paragraphs: [], words: [], tables: [], ...overrides });
const extraction = pages => ({ pages });

test('PDF preparation fails closed for mixed empty pages and source-document bounds', () => {
  const locatorArgs = [['memo.pdf'], `sha256:${'a'.repeat(64)}`];
  const textPage = page({ paragraphs: [{ paragraph_number: 1, text: 'visible', bbox: [1, 1, 20, 10] }] });
  const emptyPage = page({ page_number: 2 });
  assert.throws(() => pdfSourceUnits(extraction([textPage, emptyPage]), ...locatorArgs),
    { code: 'pdf_page_content_unavailable' });

  const oversized = 'x'.repeat(SOURCE_LIMITS.unit_characters + 1);
  assert.throws(() => pdfSourceUnits(extraction([page({ text: oversized,
    paragraphs: [{ paragraph_number: 1, text: oversized, bbox: [1, 1, 20, 10] }] })]), ...locatorArgs),
  { code: 'pdf_preparation_unit_limit_exceeded' });

  const paragraphs = Array.from({ length: SOURCE_LIMITS.document_units + 1 }, (_, index) =>
    ({ paragraph_number: index + 1, text: 'x', bbox: [1, 1, 20, 10] }));
  assert.throws(() => pdfSourceUnits(extraction([page({ text: 'x', paragraphs })]), ...locatorArgs),
    { code: 'pdf_preparation_document_limit_exceeded' });
});
