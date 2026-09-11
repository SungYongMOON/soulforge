// Voice, mail and document source adapters over synthetic lane-shaped files.
// Voice segments come from the voice lane's own PLAUD transcript parser and
// session-id builder; mail rows follow email.fetch.event.v1.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlaudSessionId, parsePlaudTranscript } from '../../voice_capture/plaud_ingest.mjs';
import { ref } from '../harness/fixtures/accepted_context_fixture.mjs';
import { prepareSourceDocuments } from '../src/runtime/source_preparation.mjs';
import { SOURCE_GRANT_SCHEMA, validateSourceDocument } from '../src/runtime/source_documents.mjs';
import { splitQuotedHistory } from '../src/adapters/sources/mail_event_source.mjs';

const NOW = '2026-09-12T00:00:00.000Z';
const sha = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const item = (item_id, extra = {}) => ({ item_id, revision_policy: 'latest_in_custody', revision_sha256: null,
  data_class: 'public_synthetic', ...extra });
const grant = (kind, root_ref, items) => ({ schema_version: SOURCE_GRANT_SCHEMA, grant_id: `grant.synthetic.${kind}`,
  project_ref: ref(1), purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
  valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z', sources: [{ kind, root_ref, items }] });
const status = out => Object.fromEntries(out.coverage.items.map(row => [row.item_id, [row.status, row.code]]));

// ---------------------------------------------------------------- voice
const PROVIDER_TRANSCRIPT = [
  '[0:00 - 0:10] 화자 1: 시험 장비 A의 통합 일정부터 보겠습니다.',
  '[0:10 - 0:25] 화자 2: 응답기 장표는 다음 주 화요일까지 초안을 올리겠습니다.',
  '[0:25 - 0:40] 화자 1: 지난번 검토에서 바뀐 전원 조건도 같이 반영해 주세요.',
  '[0:40 - 0:55] 화자 3: 이제 다른 과제 예산 건으로 넘어가겠습니다.',
].join('\n');

async function voiceRoot({ transcript = PROVIDER_TRANSCRIPT, duplicateDate = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-voice-'));
  const sessionId = buildPlaudSessionId(new Date('2026-09-11T01:00:00.000Z'), 'synth0001abcdef');
  const write = async (date) => {
    const dir = path.join(root, 'sessions', date, sessionId);
    await mkdir(dir, { recursive: true });
    const rows = parsePlaudTranscript(transcript);
    await writeFile(path.join(dir, 'transcript.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({ schema_version: 'soulforge.voice_capture_session.v0',
      session_id: sessionId, source: 'plaud_cli_import', provider_recording_id: 'synth0001abcdef',
      source_page_title: '합성 회의 녹음', recorded_at_local: '2026-09-11T10:00:00+09:00',
      imported_at_local: '2026-09-11T11:30:00+09:00', duration_seconds: 55,
      transcript: { status: 'provider_transcript_present_unverified', quality: 'provider_machine_transcript_unverified',
        segment_count: rows.length }, canonicalization: { state: 'needs_local_transcription_project_match_and_minutes_review' } }));
    return dir;
  };
  const dir = await write('2026-09-11');
  if (duplicateDate) await write(duplicateDate);
  return { root, sessionId, dir };
}

test('voice sessions become utterance units with absolute times, hashed speaker labels and a capture time', async () => {
  const v = await voiceRoot();
  const out = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item(v.sessionId)]),
    roots: { 'voice.synthetic': v.root }, now: NOW });
  const doc = out.documents[0];
  assert.ok(validateSourceDocument(doc));
  assert.equal(doc.units.length, 4);
  assert.ok(doc.units.every(unit => unit.unit_kind === 'utterance'));
  assert.equal(doc.units[1].occurred_at, '2026-09-11T01:00:10.000Z');
  assert.equal(doc.units[1].locator.speaker_label, '화자 2');
  assert.match(doc.units[1].speaker_ref, /^voice\.label:[0-9a-f]{16}$/u);
  assert.equal(doc.valid_at, '2026-09-11T01:00:00.000Z');
  assert.equal(doc.known_at, '2026-09-11T02:30:00.000Z');
  assert.equal(doc.facts.find(fact => fact.name === 'voice.transcript_quality').value, 'provider_machine_transcript_unverified');
  assert.equal(doc.scope, null);
});

test('a mixed recording admits only the granted interval and keys it separately', async () => {
  const v = await voiceRoot();
  const roots = { 'voice.synthetic': v.root };
  const whole = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item(v.sessionId)]), roots, now: NOW });
  const scoped = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic',
    [item(v.sessionId, { scope: { start_seconds: 10, end_seconds: 40 } })]), roots, now: NOW });
  const doc = scoped.documents[0];
  assert.deepEqual(doc.units.map(unit => unit.locator.segment_id), [2, 3]);
  assert.ok(!doc.units.some(unit => unit.text.includes('예산')));
  assert.deepEqual(doc.scope, { start_seconds: 10, end_seconds: 40 });
  assert.notEqual(doc.doc_key, whole.documents[0].doc_key);
  const silent = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic',
    [item(v.sessionId, { scope: { start_seconds: 60, end_seconds: 90 } })]), roots, now: NOW });
  assert.deepEqual(status(silent)[v.sessionId], ['missing', 'scope_without_speech']);
});

test('voice revisions: exact transcript pins, re-derived transcripts change, ambiguous and named folders', async () => {
  const v = await voiceRoot();
  const roots = { 'voice.synthetic': v.root };
  const transcriptSha = sha(parsePlaudTranscript(PROVIDER_TRANSCRIPT).map(row => JSON.stringify(row)).join('\n') + '\n');
  const pinned = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic',
    [item(v.sessionId, { revision_policy: 'exact', revision_sha256: transcriptSha })]), roots, now: NOW });
  assert.equal(pinned.documents[0].primary_revision_sha256, transcriptSha);
  await appendFile(path.join(v.dir, 'transcript.jsonl'), JSON.stringify(parsePlaudTranscript('[0:55 - 1:00] 화자 2: 추가 확인입니다.')[0]) + '\n');
  const stale = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic',
    [item(v.sessionId, { revision_policy: 'exact', revision_sha256: transcriptSha })]), roots, now: NOW });
  assert.deepEqual(status(stale)[v.sessionId], ['stale_grant', 'granted_revision_absent']);
  const latest = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item(v.sessionId)]), roots, now: NOW,
    previousCoverage: pinned.coverage });
  assert.equal(latest.changes.changed.length, 1);
  const named = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic',
    [item(v.sessionId, { path: ['sessions', '2026-09-11', v.sessionId] })]), roots, now: NOW });
  assert.equal(named.documents.length, 1);
  const twin = await voiceRoot({ duplicateDate: '2026-09-12' });
  const ambiguous = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item(twin.sessionId)]),
    roots: { 'voice.synthetic': twin.root }, now: NOW });
  assert.deepEqual(status(ambiguous)[twin.sessionId], ['failed', 'session_ambiguous']);
  const absent = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item('20260101T000000_plaud_cli_none0000')]),
    roots, now: NOW });
  assert.equal(Object.values(status(absent))[0][0], 'missing');
});

// ----------------------------------------------------------------- mail
const MAIL_FILE = ['acme', 'mail', 'events', 'gmail', '2026', '09.jsonl'];
const mailRow = (event_id, subject, body_text, extra = {}) => ({ schema_version: 'email.fetch.event.v1', event_id, source: 'gmail',
  provider_message_id: `pm-${event_id}`, thread_id: 'thread-syn-1', subject,
  from: [{ name: '요청자', address: 'requester@example.invalid' }], to: [{ name: '담당자', address: 'owner@example.invalid' }],
  cc: [], received_at: '2026-09-10T00:00:00.000Z', body_text, body_html: null, attachments: [],
  ingested_at: '2026-09-10T00:05:00.000Z', ingest_status: 'ok', raw: null, metadata: null, ...extra });

async function mailRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-mail-'));
  const file = path.join(root, ...MAIL_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  const rows = [
    mailRow('gmail-0001', '합성 요청: 시험 장비 A 설계 검토', '설계 검토 의견을 금요일까지 주세요.\n첨부 사양을 참고해 주세요.\n\n-----Original Message-----\n보낸 사람: 이전 담당\n지난달 요청은 취소합니다.',
      { attachments: [{ type: 'file', name: 'spec-a.pdf', mime: 'application/pdf', size: 1024, content_sha256: sha('spec-a') }] }),
    mailRow('gmail-0002', 'Re: 합성 요청', '확인했습니다. 수요일에 공유하겠습니다.\n> 설계 검토 의견을 금요일까지 주세요.\n> 첨부 사양을 참고해 주세요.',
      { received_at: '2026-09-10T03:00:00.000Z', from: [{ name: '담당자', address: 'owner@example.invalid' }] }),
  ];
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { root, file };
}

test('mail events keep header, new body and quoted history apart and never let other mails change them', async () => {
  const m = await mailRoot();
  const roots = { 'mail.synthetic': m.root };
  const mailGrant = grant('mail', 'mail.synthetic', [item('gmail-0001', { path: MAIL_FILE }), item('gmail-0002', { path: MAIL_FILE })]);
  const first = await prepareSourceDocuments({ grant: mailGrant, roots, now: NOW });
  const request = first.documents.find(doc => doc.item_id === 'gmail-0001');
  assert.deepEqual(request.units.map(unit => unit.unit_kind), ['header', 'body', 'quoted']);
  assert.equal(request.units[1].text, '설계 검토 의견을 금요일까지 주세요.\n첨부 사양을 참고해 주세요.');
  assert.match(request.units[2].text, /지난달 요청은 취소합니다/u);
  assert.equal(request.known_at, '2026-09-10T00:05:00.000Z');
  assert.equal(request.facts.find(fact => fact.name === 'mail.attachment_names').value, 'spec-a.pdf');
  assert.equal(request.components.length, 1);
  assert.match(request.units[0].speaker_ref, /^mail\.address:[0-9a-f]{16}$/u);
  const reply = first.documents.find(doc => doc.item_id === 'gmail-0002');
  assert.equal(reply.units.find(unit => unit.unit_kind === 'body').text, '확인했습니다. 수요일에 공유하겠습니다.');
  // A later mail appended to the same month file leaves both documents unchanged.
  await appendFile(m.file, JSON.stringify(mailRow('gmail-0003', '다른 건', '다른 과제 이야기')) + '\n');
  const second = await prepareSourceDocuments({ grant: mailGrant, roots, now: NOW, previousCoverage: first.coverage });
  assert.equal(second.changes.unchanged.length, 2);
  assert.equal(second.changes.changed.length, 0);
});

test('mail revisions and absence are reported per item; Korean client headers split history', async () => {
  const m = await mailRoot();
  const roots = { 'mail.synthetic': m.root };
  const out = await prepareSourceDocuments({ grant: grant('mail', 'mail.synthetic', [
    item('gmail-0001', { path: MAIL_FILE, revision_policy: 'exact', revision_sha256: sha('not this row') }),
    item('gmail-9999', { path: MAIL_FILE }),
    item('gmail-0002', { path: ['acme', 'mail', 'events', 'gmail', '2026', '10.jsonl'] }),
  ]), roots, now: NOW });
  assert.deepEqual(status(out), { 'gmail-0001': ['stale_grant', 'granted_revision_absent'],
    'gmail-9999': ['missing', 'source_missing'], 'gmail-0002': ['missing', 'source_missing'] });
  const split = splitQuotedHistory('회신 드립니다.\n\n보낸 사람: 요청자\n받는 사람: 담당자\n보낸 날짜: 2026-09-01\n원래 요청');
  assert.equal(split.body, '회신 드립니다.');
  assert.match(split.quoted, /^보낸 사람: 요청자/u);
  assert.deepEqual(splitQuotedHistory('본문만 있습니다.'), { body: '본문만 있습니다.', quoted: '' });
});

// -------------------------------------------------------------- document
test('documents keep heading sections, refuse unsupported formats and track file revisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-doc-'));
  const dir = path.join(root, '과제 문서');
  await mkdir(dir, { recursive: true });
  const markdown = '# 시험 장비 A 설계 메모\n\n개요 문단입니다.\n\n## 전원 조건\n\n28V 조건으로 바뀌었습니다.\n이전 24V 조건은 폐기합니다.\n\n## 일정\n\n다음 주 검토.\n';
  await writeFile(path.join(dir, '설계 메모 v2.md'), markdown);
  await writeFile(path.join(dir, 'notes.txt'), 'first paragraph\n\nsecond paragraph\n');
  await writeFile(path.join(dir, 'spec.pdf'), '%PDF-1.4 synthetic');
  await writeFile(path.join(dir, 'report.hwpx'), 'synthetic');
  const roots = { 'doc.synthetic': root };
  const docGrant = grant('document', 'doc.synthetic', [item('memo-v2', { path: ['과제 문서', '설계 메모 v2.md'] }),
    item('notes', { path: ['과제 문서', 'notes.txt'] }), item('spec', { path: ['과제 문서', 'spec.pdf'] }),
    item('report', { path: ['과제 문서', 'report.hwpx'] }), item('gone', { path: ['과제 문서', 'gone.md'] })]);
  const out = await prepareSourceDocuments({ grant: docGrant, roots, now: NOW });
  assert.deepEqual(status(out), { 'memo-v2': ['prepared', null], notes: ['prepared', null],
    spec: ['failed', 'pdf_preparation_not_connected'], report: ['refused', 'unsupported_document_format'],
    gone: ['missing', 'source_missing'] });
  const memo = out.documents.find(doc => doc.item_id === 'memo-v2');
  assert.equal(memo.title, '시험 장비 A 설계 메모');
  assert.equal(memo.valid_at, null);
  assert.equal(memo.time_basis, 'untimed_document');
  const power = memo.units.find(unit => unit.text.startsWith('28V'));
  assert.deepEqual(power.locator.section, ['시험 장비 A 설계 메모', '전원 조건']);
  assert.equal(power.text, '28V 조건으로 바뀌었습니다.\n이전 24V 조건은 폐기합니다.');
  assert.equal(out.documents.find(doc => doc.item_id === 'notes').units.length, 2);
  await writeFile(path.join(dir, '설계 메모 v2.md'), markdown.replace('다음 주 검토.', '다음 주 목요일 검토.'));
  const edited = await prepareSourceDocuments({ grant: docGrant, roots, now: NOW, previousCoverage: out.coverage });
  assert.deepEqual(edited.changes.changed.map(row => row.item_id), ['memo-v2']);
  await assert.rejects(prepareSourceDocuments({ grant: grant('document', 'doc.synthetic', [item('escape', { path: ['..', 'x.md'] })]),
    roots, now: NOW }), { code: 'source_grant_invalid' });
});
