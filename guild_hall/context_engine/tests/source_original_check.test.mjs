// The real-data admission gate and the original-comparison checker.
//
// The gate: a grant that reaches beyond public_synthetic is refused without an
// admission, and admitted only by a record that names this project, these
// classes and these roots, inside a stated local-only boundary.
// The checker: a prepared mail or Linear document is compared with the raw
// original the collection owner holds - fields, body, comments, history, time,
// locator - and a stored document that no longer matches its original fails,
// while what the preparer leaves out on purpose is listed as an exclusion.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { LINEAR_ROOT_REF, syntheticLinearCustody } from '../harness/fixtures/linear_custody_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA } from '../src/runtime/source_documents.mjs';
import { REAL_DATA_ADMISSION_SCHEMA, validateRealDataAdmission } from '../src/runtime/real_data_admission.mjs';
import { checkDocumentsAgainstOriginals, SOURCE_CHECK_SCHEMA, CHECKER_ID } from '../src/runtime/source_original_check.mjs';
import { totalDigest } from '../src/runtime/preparation_run.mjs';
import { exactRefIdentityKey } from '../../engineering_engine/core/validators/identity.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const CLASS = 'synthetic_company_shaped';
const item = (item_id, extra = {}) => ({ item_id, revision_policy: 'latest_in_custody', revision_sha256: null, data_class: CLASS, ...extra });
const grant = (kind, root_ref, items, classes = [CLASS]) => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: `grant.check.${kind}`,
  project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: classes,
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind, root_ref, items }] });
const admission = (extra = {}) => ({ schema_version: REAL_DATA_ADMISSION_SCHEMA, admission_id: 'admission.check.1', project_ref: ref(1),
  data_classes: [CLASS], source_refs: ['mail.check', LINEAR_ROOT_REF], processing: 'local_only', external_transfer: false,
  model_calls: 'none', authorized_by: 'owner_chat_test', authorized_at: '2026-09-01T00:00:00.000Z',
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', ...extra });

const MAIL_FILE = ['company', 'mail', 'events', 'hiworks', '2026', '2026-09.jsonl'];
const mailRow = (event_id, subject, body_text, extra = {}) => ({ schema_version: 'email.fetch.event.v1', event_id, source: 'hiworks',
  provider_message_id: `pm-${event_id}`, thread_id: 'thread-check-1', subject,
  from: [{ name: '요청자', address: 'requester@example.invalid' }], to: [{ name: '담당자', address: 'owner@example.invalid' }],
  cc: [{ name: '참조', address: 'cc@example.invalid' }], received_at: '2026-09-10T00:00:00.000Z', body_text, body_html: null, attachments: [],
  ingested_at: '2026-09-10T00:05:00.000Z', ingest_status: 'ok', raw: null, metadata: null, ...extra });
async function mailRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-check-mail-'));
  const file = path.join(root, ...MAIL_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  const rows = [
    mailRow('hw-0001', '검토 요청: 시험 장비 A', '설계 검토 의견을 금요일까지 주세요.\n첨부 사양을 참고해 주세요.\n\n-----Original Message-----\n보낸 사람: 이전 담당\n지난 요청입니다.',
      { attachments: [{ type: 'file', name: 'spec-a.pdf', mime: 'application/pdf', size: 1024, content_sha256: sha('spec-a') }] }),
    mailRow('hw-0002', 'HTML만 있는 메일', null, { body_html: '<html><body><p>본문은 <b>HTML</b>로만 왔습니다.</p></body></html>',
      received_at: '2026-09-10T02:00:00.000Z' }),
    mailRow('hw-0003', '두 번 들어온 메일', '같은 이벤트가 두 줄.', { received_at: '2026-09-10T03:00:00.000Z' }),
    mailRow('hw-0003', '두 번 들어온 메일', '같은 이벤트가 두 줄.', { received_at: '2026-09-10T03:00:00.000Z', ingested_at: '2026-09-10T04:00:00.000Z' }),
  ];
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { root, file };
}

test('a grant beyond public_synthetic is refused without an admission and admitted with one', async () => {
  const m = await mailRoot();
  const roots = { 'mail.check': m.root };
  const g = grant('mail', 'mail.check', [item('hw-0001', { path: MAIL_FILE })]);
  await assert.rejects(prepareSourceDocuments({ grant: g, roots, now: NOW }), error => error.code === 'real_source_preparation_not_admitted');
  const prepared = await prepareSourceDocuments({ grant: g, roots, now: NOW, admission: admission() });
  assert.equal(prepared.documents.length, 1);
  assert.equal(prepared.admission.admission_id, 'admission.check.1');
  assert.match(prepared.admission.admission_sha256, /^sha256:[0-9a-f]{64}$/u);
  // A synthetic-only grant needs no admission and records none.
  const synthetic = grant('mail', 'mail.check', [{ ...item('hw-0001', { path: MAIL_FILE }), data_class: 'public_synthetic' }], ['public_synthetic']);
  assert.equal((await prepareSourceDocuments({ grant: synthetic, roots, now: NOW })).admission, null);
});

test('an admission is judged against the exact grant: project, classes, roots, validity and boundary', () => {
  const admitted = { project_key: exactRefIdentityKey(ref(1)), grant: grant('mail', 'mail.check', [item('hw-0001', { path: MAIL_FILE })]) };
  const ok = validateRealDataAdmission(admission(), { admitted, now: NOW });
  assert.equal(ok.admission_id, 'admission.check.1');
  assert.deepEqual(ok.data_classes, [CLASS]);
  const refuse = (extra, code, now = NOW, adm = admitted) => assert.throws(
    () => validateRealDataAdmission(admission(extra), { admitted: adm, now }), error => error.code === code, code);
  refuse({ external_transfer: true }, 'real_data_admission_invalid');
  refuse({ processing: 'anywhere' }, 'real_data_admission_invalid');
  refuse({ model_calls: 'cloud' }, 'real_data_admission_invalid');
  refuse({ data_classes: ['public_synthetic'] }, 'real_data_admission_invalid');
  refuse({ valid_to: '2026-08-01T00:00:00.000Z' }, 'real_data_admission_invalid');
  refuse({}, 'real_data_admission_not_current', '2026-11-01T00:00:00.000Z');
  refuse({}, 'real_data_admission_not_current', '2026-08-01T00:00:00.000Z');
  refuse({ project_ref: ref(2) }, 'real_data_admission_project_mismatch');
  refuse({ data_classes: ['other_class'] }, 'real_data_admission_class_refused');
  refuse({ source_refs: ['mail.elsewhere'] }, 'real_data_admission_source_refused');
  // An extra field is not an admission either.
  refuse({ note: 'x' }, 'real_data_admission_invalid');
});

test('an admission for another class or another root refuses the grant through the preparer', async () => {
  const m = await mailRoot();
  const roots = { 'mail.check': m.root };
  const g = grant('mail', 'mail.check', [item('hw-0001', { path: MAIL_FILE })]);
  await assert.rejects(prepareSourceDocuments({ grant: g, roots, now: NOW, admission: admission({ data_classes: ['other_class'] }) }),
    error => error.code === 'real_data_admission_class_refused');
  await assert.rejects(prepareSourceDocuments({ grant: g, roots, now: NOW, admission: admission({ source_refs: ['mail.elsewhere'] }) }),
    error => error.code === 'real_data_admission_source_refused');
  await assert.rejects(prepareSourceDocuments({ grant: { ...g, project_ref: ref(2) }, roots, now: NOW, admission: admission() }),
    error => error.code === 'real_data_admission_project_mismatch');
});

test('mail documents are checked against their raw rows: fields, body, attachments, time, and duplicates and HTML are exclusions', async () => {
  const m = await mailRoot();
  const roots = { 'mail.check': m.root };
  const g = grant('mail', 'mail.check', [item('hw-0001', { path: MAIL_FILE }), item('hw-0002', { path: MAIL_FILE }), item('hw-0003', { path: MAIL_FILE })]);
  const prepared = await prepareSourceDocuments({ grant: g, roots, now: NOW, admission: admission() });
  assert.equal(prepared.documents.length, 3);
  const report = await checkDocumentsAgainstOriginals({ documents: prepared.documents, grant: { ...g, project_key: prepared.grant.project_key },
    roots, checkRunId: 'check-mail-1', checkedAt: NOW });
  assert.equal(report.schema_version, SOURCE_CHECK_SCHEMA);
  assert.equal(report.checker_id, CHECKER_ID);
  assert.equal(report.outcome, 'pass', JSON.stringify(report.documents.map(d => d.checks), null, 1));
  assert.equal(report.counts.pass, 3);
  const byItem = id => report.documents.find(d => d.item_id === id);
  const ids = d => d.checks.map(c => c.id);
  assert.deepEqual(ids(byItem('hw-0001')), ['original_found', 'locator_valid', 'fields_preserved', 'body_preserved', 'attachments_preserved', 'time_preserved', 'relations_preserved']);
  assert.ok(byItem('hw-0001').exclusions.some(e => e.includes('attachment bodies')));
  assert.ok(byItem('hw-0002').exclusions.some(e => e.includes('HTML')));
  assert.ok(byItem('hw-0003').exclusions.some(e => e.includes('appears 2 times')));
  const { report_sha256, ...body } = report;
  assert.equal(totalDigest(body), report_sha256);
  // A stored document whose body drifted from its original fails, and only that document.
  const drifted = prepared.documents.map(d => d.item_id !== 'hw-0001' ? d : { ...d,
    units: d.units.map(u => u.unit_kind === 'body' ? { ...u, text: '설계 검토 의견은 다음 달까지 주세요.' } : u) });
  const failing = await checkDocumentsAgainstOriginals({ documents: drifted, grant: { ...g, project_key: prepared.grant.project_key },
    roots, checkRunId: 'check-mail-2', checkedAt: NOW });
  assert.equal(failing.outcome, 'fail');
  assert.equal(failing.counts.fail, 1);
  assert.equal(byItemOf(failing, 'hw-0001').checks.find(c => c.id === 'body_preserved').outcome, 'fail');
  // A document naming a revision the file does not hold cannot be found.
  const wrongRevision = prepared.documents.map(d => d.item_id !== 'hw-0002' ? d : { ...d, primary_revision_sha256: sha('nope') });
  const absent = await checkDocumentsAgainstOriginals({ documents: wrongRevision, grant: { ...g, project_key: prepared.grant.project_key },
    roots, checkRunId: 'check-mail-3', checkedAt: NOW });
  assert.equal(byItemOf(absent, 'hw-0002').checks[0].id, 'original_found');
  assert.equal(byItemOf(absent, 'hw-0002').outcome, 'fail');
  function byItemOf(rep, id) { return rep.documents.find(d => d.item_id === id); }
});

test('Linear documents are checked against custody: title, description, every comment and history entry, time and relations', async () => {
  const x = await syntheticLinearCustody();
  const ids = [x.issue('SYN-1'), x.issue('SYN-3')];
  const g = grant('linear', LINEAR_ROOT_REF, ids.map(id => item(id)));
  const prepared = await prepareSourceDocuments({ grant: g, roots: x.roots, now: NOW, admission: admission() });
  assert.equal(prepared.documents.length, 2);
  const report = await checkDocumentsAgainstOriginals({ documents: prepared.documents, grant: { ...g, project_key: prepared.grant.project_key },
    roots: x.roots, checkRunId: 'check-linear-1', checkedAt: NOW });
  assert.equal(report.outcome, 'pass', JSON.stringify(report.documents.map(d => d.checks), null, 1));
  const first = report.documents[0];
  assert.deepEqual(first.checks.map(c => c.id), ['original_found', 'locator_valid', 'fields_preserved', 'comments_preserved', 'history_preserved', 'time_preserved', 'relations_preserved']);
  assert.ok(first.exclusions.some(e => e.includes('history entries are rendered')));
  // Dropping a comment unit from the stored document is a finding against custody.
  const withComment = prepared.documents.find(d => d.units.some(u => u.unit_kind === 'comment'));
  assert.ok(withComment, 'fixture holds at least one commented issue');
  const dropped = prepared.documents.map(d => d !== withComment ? d : { ...d, units: d.units.filter(u => u.unit_kind !== 'comment') });
  const failing = await checkDocumentsAgainstOriginals({ documents: dropped, grant: { ...g, project_key: prepared.grant.project_key },
    roots: x.roots, checkRunId: 'check-linear-2', checkedAt: NOW });
  assert.equal(failing.outcome, 'fail');
  assert.equal(failing.documents.find(d => d.item_id === withComment.item_id).checks.find(c => c.id === 'comments_preserved').outcome, 'fail');
});

test('a kind without a checker is reported not_run, never pass, and an ungranted document is a finding', async () => {
  const m = await mailRoot();
  const roots = { 'mail.check': m.root };
  const g = grant('mail', 'mail.check', [item('hw-0001', { path: MAIL_FILE })]);
  const prepared = await prepareSourceDocuments({ grant: g, roots, now: NOW, admission: admission() });
  // A granted document of a kind that has no checker yet: not_run, stated as such.
  const wider = { ...g, sources: [...g.sources, { kind: 'document', root_ref: 'doc.other', items: [item('other', { path: ['other.md'] })] }] };
  const foreign = { ...prepared.documents[0], source_kind: 'document', root_ref: 'doc.other', item_id: 'other' };
  const report = await checkDocumentsAgainstOriginals({ documents: [foreign, { ...prepared.documents[0], item_id: 'not-granted' }],
    grant: { ...wider, project_key: prepared.grant.project_key }, roots, checkRunId: 'check-mixed', checkedAt: NOW });
  assert.equal(report.documents[0].outcome, 'not_run');
  assert.equal(report.documents[0].checks[0].id, 'checker_connected');
  assert.equal(report.documents[1].checks[0].id, 'item_granted');
  assert.equal(report.documents[1].outcome, 'fail');
  assert.equal(report.outcome, 'fail');
  // These altered documents no longer validate, so the report binds to no digest and says so.
  assert.equal(report.documents_sha256, null);
  assert.equal(report.counts.documents_invalid, true);
});
