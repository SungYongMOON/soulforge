// Slack attachment bodies as units (adapter v4): with a derivation context the
// bytes custody holds for a pointer become page, slide, table or text units of
// the message's document; without one nothing changes byte for byte. The
// derivation here is canned - no interpreter, no worker - so what is tested is
// the adapter's handling: digest check, per-format units and locators, the
// counted outcomes, the profile switch, determinism, and the original checker's
// verification of the bytes those units name.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA, SOURCE_LIMITS } from '../src/runtime/source_documents.mjs';
import { REAL_DATA_ADMISSION_SCHEMA } from '../src/runtime/real_data_admission.mjs';
import { checkDocumentsAgainstOriginals } from '../src/runtime/source_original_check.mjs';
import { derivationContext } from '../src/runtime/attachment_derivation.mjs';
import { derivationFromBinding } from '../src/runtime/graph_index_generation.mjs';
import { readSlackSourceDocuments, splitUnitText, attachmentUnits, SLACK_SOURCE_ADAPTER,
  SLACK_SOURCE_ADAPTER_ATTACHMENTS, ATTACHMENT_UNIT_KINDS } from '../src/adapters/sources/slack_custody_source.mjs';
import { openSourceRoot } from '../src/adapters/sources/guarded_files.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const CLASS = 'synthetic_company_shaped';
const ROOT_REF = 'slack.attach';
const item = (item_id, extra = {}) => ({ item_id, revision_policy: 'latest_in_custody', revision_sha256: null, data_class: CLASS, ...extra });
const grant = items => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.attach.slack', project_ref: ref(1),
  purposes: ['context_preparation'], allowed_data_classes: [CLASS], valid_from: '2026-09-01T00:00:00.000Z',
  valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind: 'slack', root_ref: ROOT_REF, items }] });
const admission = () => ({ schema_version: REAL_DATA_ADMISSION_SCHEMA, admission_id: 'admission.attach.1', project_ref: ref(1),
  data_classes: [CLASS], source_refs: [ROOT_REF], processing: 'local_only', external_transfer: false, model_calls: 'none',
  authorized_by: 'owner_chat_test', authorized_at: '2026-09-01T00:00:00.000Z', valid_from: '2026-09-01T00:00:00.000Z',
  valid_to: '2026-10-01T00:00:00.000Z' });

// Fake attachment bytes: their digest is what the pointer records, so the
// adapter's digest check is real even though the parser is not.
const PDF_BYTES = Buffer.from('%PDF-1.4 synthetic hardware requirement specification');
const PPTX_BYTES = Buffer.from('PK synthetic design review deck');
const OLE_BYTES = Buffer.from('\xd0\xcf\x11\xe0 synthetic encrypted deck', 'latin1');
const PNG_BYTES = Buffer.from('\x89PNG synthetic image', 'latin1');
const digestOf = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const ROOT_TS = '1786359478.268549', REPLY_TS = '1786359600.000100', ALONE_TS = '1786400000.000200';

async function slackRoot({ replyPointer = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-slack-attach-'));
  const rawEvent = (ts, text, extra = {}) => ({ type: 'message', ts, text, user: 'U0SYN00001', team: 'T0SYN0001', ...extra });
  const events = [
    rawEvent(ROOT_TS, 'HRS v5 열람·검토용 PDF입니다. 총 2쪽입니다.', { files: [{ id: 'F0SYNPDF01' }] }),
    rawEvent(REPLY_TS, '발표 자료도 같이 올립니다.', { thread_ts: ROOT_TS, files: [{ id: 'F0SYNPPT01' }, { id: 'F0SYNOLE01' }, { id: 'F0SYNPNG01' }] }),
    rawEvent(ALONE_TS, '첨부 없는 공지입니다.'),
  ];
  const pointer = (file_id, bytes, mime, size = bytes.length) => ({ content_sha256: digestOf(bytes), file_id, mime_type: mime,
    pointer_ref: `slack-file-sha256:${digestOf(bytes).slice(7, 19)}`, size_bytes: size });
  const pointersByTs = {
    [ROOT_TS]: [pointer('F0SYNPDF01', PDF_BYTES, 'application/pdf')],
    [REPLY_TS]: replyPointer ? [
      pointer('F0SYNPPT01', PPTX_BYTES, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      pointer('F0SYNOLE01', OLE_BYTES, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      pointer('F0SYNPNG01', PNG_BYTES, 'image/png')] : [],
    [ALONE_TS]: [],
  };
  const receipts = [], revisions = [];
  for (const raw of events) {
    const bytes = Buffer.from(JSON.stringify(raw));
    const digest = sha(bytes.toString()).slice('sha256:'.length);
    await mkdir(path.join(root, 'raw', 'sha256', digest.slice(0, 2)), { recursive: true });
    await writeFile(path.join(root, 'raw', 'sha256', digest.slice(0, 2), `${digest}.json`), bytes);
    receipts.push({ raw_digest: `sha256:${digest}`, raw_ref: `slack-raw:${digest}`, source_refs: [`slack-web:${digest.slice(0, 32)}`] });
    const isReply = raw.thread_ts && raw.thread_ts !== raw.ts;
    revisions.push({ actor: { erp_account_ref: null, slack_user_id: raw.user }, channel_id: 'C0SYN0001', message_ref: `slack-msg:${digest}`,
      message_ts: raw.ts, revision_kind: isReply ? 'reply' : 'message', revision_ref: `slack-rev:${digest}`, revision_ts: raw.ts,
      source_metadata_digest: `sha256:${digest}`, supersedes_revision_ref: null, thread_ts: isReply ? raw.thread_ts : null,
      workspace_id: 'T0SYN0001', attachment_pointers: pointersByTs[raw.ts] });
  }
  // The bytes custody holds: the PDF and the two decks; the PNG pointer has no bytes on disk.
  for (const bytes of [PDF_BYTES, PPTX_BYTES, OLE_BYTES]) {
    const hex = digestOf(bytes).slice(7);
    await mkdir(path.join(root, 'attachments', 'sha256', hex.slice(0, 2)), { recursive: true });
    await writeFile(path.join(root, 'attachments', 'sha256', hex.slice(0, 2), `${hex}.bin`), bytes);
  }
  const state = { schema_version: 'soulforge.slack_history.continuous_state.v1', revisions, custody_receipts: receipts,
    hold_receipts: [], attachment_receipts: [], page_evidence_receipts: [], cursor: {}, writer_authority_id: 'synthetic', writer_epoch: 1 };
  await mkdir(path.join(root, 'state'), { recursive: true });
  await writeFile(path.join(root, 'state', 'slack-continuous.json'), JSON.stringify(state, null, 2));
  return root;
}

// A canned derivation: what the real one returns, keyed by the bytes it was handed.
const TOOLS = Object.freeze({ derived_root: path.join(os.tmpdir(), 'ctx-slack-attach-derived'), max_attachment_bytes: 1024 * 1024,
  formats: { pdf: true, pptx: true } });
const RECIPE = format => ({ format, text_worker_sha256: sha('worker'), interpreter_sha256: sha('python') });
const calls = [];
async function cannedDerive({ bytes, sha256, mime }) {
  calls.push({ sha256, mime });
  if (bytes.equals(PDF_BYTES)) {
    return { status: 'ok', format: 'pdf', recipe: RECIPE('pdf'), extract: { status: 'ok', format: 'pdf',
      pages: [{ page: 1, text: '예인몸체 하드웨어 요구사항 명세서\n상태: 오프·대기·운용' }, { page: 2, text: '요구식별자 형식 R-TB_PETB-HMR-001' }, { page: 3, text: '   ' }] } };
  }
  if (bytes.equals(PPTX_BYTES)) {
    return { status: 'ok', format: 'pptx', recipe: RECIPE('pptx'), extract: { status: 'ok', format: 'pptx',
      slides: [{ slide: 1, text: '설계 검토 발표', shapes: [{ shape_id: 3, text: '설계 검토 발표', table: null }] },
        { slide: 2, text: '', shapes: [{ shape_id: 7, text: '', table: [['항목', '값'], ['채널 수', '64'], ['간섭', '미결']] }] }] } };
  }
  if (bytes.equals(OLE_BYTES)) {
    return { status: 'ok', format: 'pptx', recipe: RECIPE('pptx'), extract: { status: 'error', code: 'parse_failed', error_type: 'PackageNotFoundError' } };
  }
  return { status: 'unsupported_format', format: null, recipe: null, extract: null };
}

async function prepare(root, { derivation = derivationContext({ tools: TOOLS, derive: cannedDerive }), items = [item(ROOT_TS), item(ALONE_TS)] } = {}) {
  return prepareSourceDocuments({ grant: grant(items), roots: { [ROOT_REF]: root }, now: NOW, admission: admission(),
    runId: 'prep-attach', clock: () => new Date(NOW), derivation });
}

test('without a derivation context the adapter is unchanged: v3 profile, no attachment units, bodies not processed', async () => {
  const root = await slackRoot();
  const prepared = await prepare(root, { derivation: null });
  const doc = prepared.documents.find(d => d.item_id === ROOT_TS);
  assert.equal(doc.adapter_profile, SLACK_SOURCE_ADAPTER);
  assert.deepEqual(doc.units.map(u => u.unit_kind), ['message', 'reply']);
  assert.equal(doc.facts.find(f => f.name === 'slack.attachment_bodies_processed').value, false);
  assert.equal(doc.facts.some(f => f.name === 'slack.attachment_derived_count'), false);
  assert.deepEqual(prepared.attachment_reports, []);
  assert.equal(Object.keys(prepared).includes('attachment_reports'), false, 'reports ride beside the result, not in it');
});

test('with a derivation context attachment bytes become page, slide and table units with locators', async () => {
  const root = await slackRoot();
  calls.length = 0;
  const prepared = await prepare(root);
  const doc = prepared.documents.find(d => d.item_id === ROOT_TS);
  assert.equal(doc.adapter_profile, SLACK_SOURCE_ADAPTER_ATTACHMENTS);
  assert.deepEqual(doc.units.map(u => u.unit_kind), ['message', 'reply', 'attachment_page', 'attachment_page', 'attachment_slide', 'attachment_table']);
  const page1 = doc.units[2];
  assert.equal(page1.locator.file_id, 'F0SYNPDF01');
  assert.equal(page1.locator.content_sha256, digestOf(PDF_BYTES));
  assert.deepEqual([page1.locator.format, page1.locator.page, page1.locator.message_ts], ['pdf', 1, ROOT_TS]);
  assert.equal(page1.text, '예인몸체 하드웨어 요구사항 명세서\n상태: 오프·대기·운용');
  assert.equal(doc.units[3].locator.page, 2, 'the blank third page yields no unit');
  const table = doc.units[5];
  assert.deepEqual([table.locator.slide, table.locator.table, table.locator.shape_id, table.locator.message_ts], [2, 1, 7, REPLY_TS]);
  assert.equal(table.text, '항목 | 값\n채널 수 | 64\n간섭 | 미결');
  // Facts: what was derived, what was not, and the recipe the text depends on.
  const fact = name => doc.facts.find(f => f.name === name)?.value;
  assert.equal(fact('slack.attachment_bodies_processed'), true);
  assert.equal(fact('slack.attachment_count'), 4);
  assert.equal(fact('slack.attachment_derived_count'), 2);
  assert.equal(fact('slack.attachment_failed_count'), 1, 'the OLE deck: parse failed');
  assert.equal(fact('slack.attachment_missing_count'), 1, 'the PNG pointer: no bytes in custody');
  assert.equal(fact('slack.attachment_unsupported_count'), 0);
  assert.equal(fact('slack.attachment_unit_count'), 4);
  assert.match(fact('slack.attachment_recipes_sha256'), /^sha256:[0-9a-f]{64}$/u);
  // Components still list every pointer, derived or not.
  assert.equal(doc.components.filter(c => c.kind === 'attachment').length, 4);
  // Every derivation call was made with the pointer's digest, once per distinct digest.
  assert.deepEqual(calls.map(c => c.sha256), [digestOf(PDF_BYTES), digestOf(PPTX_BYTES), digestOf(OLE_BYTES)]);
  // The outcomes travel beside the result.
  const report = prepared.attachment_reports.find(r => r.item_id === ROOT_TS);
  assert.deepEqual(report.attachments.map(a => [a.file_id, a.outcome, a.code, a.units]),
    [['F0SYNPDF01', 'derived', null, 2], ['F0SYNPPT01', 'derived', null, 2], ['F0SYNOLE01', 'failed', 'parse_failed', 0], ['F0SYNPNG01', 'missing', 'source_missing', 0]]);
  // A message without attachments keeps the v3 profile and v3 facts even under derivation.
  const alone = prepared.documents.find(d => d.item_id === ALONE_TS);
  assert.equal(alone.adapter_profile, SLACK_SOURCE_ADAPTER);
  assert.equal(alone.facts.some(f => f.name === 'slack.attachment_derived_count'), false);
});

test('the same custody and derivation give the same document twice, and a v3 document is byte-identical to before', async () => {
  const root = await slackRoot();
  const a = await prepare(root), b = await prepare(root);
  assert.equal(JSON.stringify(a.documents), JSON.stringify(b.documents));
  const plain = await prepare(root, { derivation: null });
  const alone = key => JSON.stringify(key.documents.find(d => d.item_id === ALONE_TS));
  assert.equal(alone(a), alone(plain), 'a message with no attachment is untouched by the derivation context');
});

test('bytes that do not match the pointer digest are not derived and are counted as failed', async () => {
  const root = await slackRoot();
  const hex = digestOf(PDF_BYTES).slice(7);
  await writeFile(path.join(root, 'attachments', 'sha256', hex.slice(0, 2), `${hex}.bin`), Buffer.from('tampered'));
  const prepared = await prepare(root, { items: [item(ROOT_TS)] });
  const doc = prepared.documents[0];
  const report = prepared.attachment_reports[0].attachments.find(a => a.file_id === 'F0SYNPDF01');
  assert.deepEqual([report.outcome, report.code], ['failed', 'attachment_digest_mismatch']);
  assert.equal(doc.units.some(u => u.unit_kind === 'attachment_page'), false);
  assert.equal(doc.facts.find(f => f.name === 'slack.attachment_failed_count').value, 2);
});

test('a page longer than one unit is split at line breaks into numbered parts', () => {
  const max = SOURCE_LIMITS.unit_characters;
  const text = Array.from({ length: 5 }, (_, i) => `줄 ${i} ${'가'.repeat(Math.floor(max / 2))}`).join('\n');
  const parts = splitUnitText(text);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every(part => [...part].length <= max));
  assert.equal(parts.join('\n'), text, 'nothing lost, nothing added');
  const units = attachmentUnits({ extract: { pages: [{ page: 9, text }] }, format: 'pdf', base: { file_id: 'F' }, occurredAt: NOW, speakerRef: null });
  assert.deepEqual(units.map(u => u.locator.part), parts.map((_, i) => i + 1));
  assert.ok(units.every(u => u.locator.page === 9));
  assert.deepEqual(splitUnitText('short'), ['short']);
});

test('the original checker verifies the bytes derived units name and passes a v4 document', async () => {
  const root = await slackRoot();
  const prepared = await prepare(root, { items: [item(ROOT_TS)] });
  const check = await checkDocumentsAgainstOriginals({ documents: prepared.documents, grant: { ...grant([item(ROOT_TS)]), project_key: prepared.grant.project_key },
    roots: { [ROOT_REF]: root }, checkRunId: 'check-attach', checkedAt: NOW, preparedAt: NOW });
  const row = check.documents[0];
  const by = id => row.checks.find(c => c.id === id);
  assert.equal(by('attachment_bytes_preserved').outcome, 'pass');
  assert.equal(by('relations_preserved').outcome, 'pass');
  assert.equal(by('attachments_preserved').outcome, 'pass');
  assert.ok(row.exclusions.some(line => line.startsWith('attachment text derived by recipe sha256:')));
  assert.ok(row.exclusions.some(line => line.includes('2 attachment(s) not derived')));
  assert.equal(check.outcome, 'pass');
});

test('the original checker fails a v4 document whose attachment bytes changed after preparation', async () => {
  const root = await slackRoot();
  const prepared = await prepare(root, { items: [item(ROOT_TS)] });
  const hex = digestOf(PDF_BYTES).slice(7);
  await writeFile(path.join(root, 'attachments', 'sha256', hex.slice(0, 2), `${hex}.bin`), Buffer.from('replaced after preparation'));
  const check = await checkDocumentsAgainstOriginals({ documents: prepared.documents, grant: { ...grant([item(ROOT_TS)]), project_key: prepared.grant.project_key },
    roots: { [ROOT_REF]: root }, checkRunId: 'check-attach-2', checkedAt: NOW, preparedAt: NOW });
  const bytes = check.documents[0].checks.find(c => c.id === 'attachment_bytes_preserved');
  assert.equal(bytes.outcome, 'fail');
  assert.match(bytes.detail, /custody bytes differ from the digest/u);
  assert.equal(check.outcome, 'fail');
});

test('the original checker refuses a claim of processed bodies without derived units', async () => {
  const root = await slackRoot();
  const prepared = await prepare(root, { derivation: null, items: [item(ROOT_TS)] });
  const forged = JSON.parse(JSON.stringify(prepared.documents[0]));
  forged.facts.find(f => f.name === 'slack.attachment_bodies_processed').value = true;
  const check = await checkDocumentsAgainstOriginals({ documents: [forged], grant: { ...grant([item(ROOT_TS)]), project_key: prepared.grant.project_key },
    roots: { [ROOT_REF]: root }, checkRunId: 'check-attach-3', checkedAt: NOW, preparedAt: NOW });
  const row = check.documents[0];
  assert.equal(row.checks.find(c => c.id === 'relations_preserved').outcome, 'fail');
  assert.equal(row.checks.find(c => c.id === 'attachment_bytes_preserved').outcome, 'fail');
});

test('a derivation context that is not one is refused per item, and the binding reference is read by digest', async () => {
  const root = await slackRoot();
  const output = await readSlackSourceDocuments({ admitted: { grant: grant([item(ROOT_TS)]), project_key: 'x', grant_sha256: sha('g') },
    source: grant([item(ROOT_TS)]).sources[0], rootPath: root, derivation: { tools: null } });
  assert.deepEqual(output.results.map(r => r.code), ['attachment_derivation_invalid']);
  assert.throws(() => derivationContext({ tools: null }), { code: 'tools_config_unreadable' });
  assert.throws(() => derivationContext({ tools: TOOLS, derive: 'no' }), { code: 'attachment_derivation_invalid' });
  // From a binding: absent means none; a digest that does not match the bytes is refused.
  assert.equal(derivationFromBinding({ binding: {}, readRaw: () => { throw new Error('unreached'); } }), null);
  // Host paths are assembled at run time: the path policy scans source bytes for
  // absolute Windows paths, and these are synthetic values, not host facts.
  const win = (...parts) => parts.join(String.fromCharCode(92));
  const toolsBytes = Buffer.from(JSON.stringify({ schema: 'soulforge.context_read_tools.v0', interpreter_path: win('C:', 'py', 'python.exe'),
    soffice_path: win('C:', 'lo', 'soffice.exe'), receipts_root: win('C:', 'r'), derived_root: win('C:', 'd'), python_packages: {}, formats: { pdf: true },
    max_attachment_bytes: 1024 }));
  const binding = { attachments: { tools_config: { path: 'control_root/context-read/tools.v0.json', sha256: digestOf(toolsBytes) } } };
  const context = derivationFromBinding({ binding, readRaw: () => toolsBytes, derive: cannedDerive });
  assert.equal(context.tools.derived_root, win('C:', 'd'));
  assert.equal(context.derive, cannedDerive);
  assert.throws(() => derivationFromBinding({ binding, readRaw: () => Buffer.from('{}'), derive: cannedDerive }), { code: 'graph_index_tools_config_mismatch' });
  assert.throws(() => derivationFromBinding({ binding: { attachments: { tools_config: { path: '../x', sha256: sha('a') } } }, readRaw: () => toolsBytes }),
    { code: 'graph_index_binding_invalid' });
  assert.ok(ATTACHMENT_UNIT_KINDS.includes('attachment_page'));
  const guard = openSourceRoot(root);
  const read = await guard.readBytes(['attachments', 'sha256', digestOf(PDF_BYTES).slice(7, 9), `${digestOf(PDF_BYTES).slice(7)}.bin`], 1024);
  assert.equal(read.sha256, digestOf(PDF_BYTES));
  assert.ok(Buffer.isBuffer(read.bytes));
});
