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
import { validatePreparationRun } from '../src/runtime/preparation_validation.mjs';

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

// Voice is the only kind carrying a scope and an owner-named session path, and
// its units anchor to the transcript revision. The validator is exercised here
// because this file already builds real voice sessions.
test('a real voice preparation validates clean, and a re-pointed utterance locator does not', async () => {
  const v = await voiceRoot();
  const voiceGrant = grant('voice', 'voice.synthetic', [item(v.sessionId)]);
  const preparation = await prepareSourceDocuments({ grant: voiceGrant, roots: { 'voice.synthetic': v.root },
    now: NOW, runId: 'prep-voice-1', clock: () => new Date('2026-09-12T00:00:00.000Z') });
  const { run, ...rest } = preparation;
  const args = { validationRunId: 'val-voice-1', checkedAt: '2026-09-12T01:00:00.000Z' };
  const report = validatePreparationRun({ run, preparation: rest, grant: voiceGrant, ...args });
  const [document] = rest.documents;
  assert.equal(report.outcome, 'pass');
  const locators = report.checks.find(check => check.check_id === 'unit_locators');
  assert.deepEqual(locators.findings, []);
  assert.equal(locators.scope.checked, document.units.length);
  assert.deepEqual(locators.limits, []);

  const units = document.units.map((unit, index) => index === 0
    ? { ...unit, locator: { ...unit.locator, transcript_sha256: `sha256:${'c'.repeat(64)}` } } : unit);
  const moved = validatePreparationRun({ run, grant: voiceGrant,
    preparation: { ...rest, documents: [{ ...document, units }] }, validationRunId: 'val-voice-2',
    checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(moved.outcome, 'fail');
  assert.deepEqual(moved.checks.find(check => check.check_id === 'unit_locators').findings.map(f => f.code),
    ['locator_cites_unheld_revision']);
});

// A granted scope keys its own document, so the record must follow the scope.
test('a scoped voice grant records and validates the scoped document', async () => {
  const v = await voiceRoot();
  const scoped = grant('voice', 'voice.synthetic', [item(v.sessionId, { scope: { start_seconds: 0, end_seconds: 30 } })]);
  const preparation = await prepareSourceDocuments({ grant: scoped, roots: { 'voice.synthetic': v.root },
    now: NOW, runId: 'prep-voice-3', clock: () => new Date('2026-09-12T00:00:00.000Z') });
  const { run, ...rest } = preparation;
  const report = validatePreparationRun({ run, preparation: rest, grant: scoped,
    validationRunId: 'val-voice-3', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');
  assert.deepEqual(rest.documents[0].scope, { start_seconds: 0, end_seconds: 30 });
  // The same session without the scope is a different document and a different run.
  const whole = await prepareSourceDocuments({ grant: grant('voice', 'voice.synthetic', [item(v.sessionId)]),
    roots: { 'voice.synthetic': v.root }, now: NOW, runId: 'prep-voice-3',
    clock: () => new Date('2026-09-12T00:00:00.000Z') });
  assert.notEqual(whole.run.run_sha256, run.run_sha256);
  assert.notEqual(whole.documents[0].doc_key, rest.documents[0].doc_key);
});

// Real ASR writes millisecond offsets (local_asr.mjs roundMillis) and ffprobe
// writes a fractional duration, so honest voice output carries numbers that are
// not safe integers. Every synthetic transcript above uses whole-second PLAUD
// timestamps, which is why this case needs its own fixture.
async function fractionalVoiceRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-voice-frac-'));
  const sessionId = buildPlaudSessionId(new Date('2026-09-11T01:00:00.000Z'), 'frac0001abcdef');
  const dir = path.join(root, 'sessions', '2026-09-11', sessionId);
  await mkdir(dir, { recursive: true });
  const rows = [
    { schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: 0, start_seconds: 0.32,
      end_seconds: 4.875, speaker: 'UNKNOWN', content: '시험 장비 A 일정부터 보겠습니다.', source: 'whisper_cpp_independent_local' },
    { schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: 1, start_seconds: 4.875,
      end_seconds: 9.101, speaker: 'UNKNOWN', content: '응답기 장표는 다음 주에 올리겠습니다.', source: 'whisper_cpp_independent_local' },
  ];
  await writeFile(path.join(dir, 'transcript.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    provider_recording_id: 'frac0001abcdef', source_page_title: '소수 초 녹음',
    recorded_at_local: '2026-09-11T10:00:00+09:00', imported_at_local: '2026-09-11T11:30:00+09:00',
    duration_seconds: 9.101333,
    transcript: { status: 'provider_transcript_present_unverified',
      quality: 'provider_machine_transcript_unverified', segment_count: rows.length },
    canonicalization: { state: 'needs_local_transcription_project_match_and_minutes_review' } }));
  return { root, sessionId };
}

test('millisecond ASR offsets and a fractional duration still record and validate', async () => {
  const v = await fractionalVoiceRoot();
  const voiceGrant = grant('voice', 'voice.synthetic', [item(v.sessionId)]);
  const roots = { 'voice.synthetic': v.root };
  // The whole point: asking for a record must not abort preparation over numbers
  // the live writers legitimately produce.
  const preparation = await prepareSourceDocuments({ grant: voiceGrant, roots, now: NOW,
    runId: 'prep-voice-frac', clock: () => new Date('2026-09-12T00:00:00.000Z') });
  const { run, ...rest } = preparation;
  const [document] = rest.documents;
  assert.equal(rest.coverage.counts.prepared, 1);
  assert.equal(document.units[0].locator.start_seconds, 0.32);
  assert.equal(document.facts.find(fact => fact.name === 'voice.duration_seconds').value, 9.101333);
  const report = validatePreparationRun({ run, preparation: rest, grant: voiceGrant,
    validationRunId: 'val-voice-frac', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');

  // The fractions are bound, not skipped: nudging one moves the documents digest.
  const units = document.units.map((unit, index) => index === 0
    ? { ...unit, locator: { ...unit.locator, start_seconds: 0.33 } } : unit);
  const nudged = validatePreparationRun({ run, grant: voiceGrant,
    preparation: { ...rest, documents: [{ ...document, units }] },
    validationRunId: 'val-voice-frac-2', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(nudged.outcome, 'fail');
  assert.ok(nudged.checks.find(check => check.check_id === 'run_output_binding')
    .findings.some(finding => finding.code === 'run_documents_digest_mismatch'));
});

// Live writers do not normalise: macOS-style tools emit NFD Korean, and the PLAUD
// CLI speaker label is copied verbatim (plaud_ingest.mjs). Locator strings were
// the one part of a document the module left un-normalised, so honest decomposed
// text used to abort the whole preparation once a record was asked for.
test('decomposed Korean in a heading and a speaker label neither aborts nor splits identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-nfd-'));
  const heading = '설계 검토'.normalize('NFD');
  assert.notEqual(heading, heading.normalize('NFC'), 'the fixture must really be decomposed');
  await writeFile(path.join(root, 'memo.md'), `# ${heading}\n\n첫 문단입니다.\n`);
  const docGrant = grant('document', 'doc.synthetic', [item('memo', { path: ['memo.md'] })]);
  const preparation = await prepareSourceDocuments({ grant: docGrant, roots: { 'doc.synthetic': root }, now: NOW,
    runId: 'prep-nfd-1', clock: () => new Date('2026-09-12T00:00:00.000Z') });
  const { run, ...rest } = preparation;
  const [document] = rest.documents;
  const report = validatePreparationRun({ run, preparation: rest, grant: docGrant,
    validationRunId: 'val-nfd-1', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');
  // The same heading reaches text and locator.section, so both must be the same
  // string; leaving one decomposed made them silently unequal.
  const headingUnit = document.units.find(unit => unit.unit_kind === 'heading');
  assert.equal(headingUnit.text, headingUnit.text.normalize('NFC'));
  assert.equal(headingUnit.locator.section[0], headingUnit.text);
});

test('a decomposed speaker label does not destroy the other kinds in one grant', async () => {
  const v = await voiceRoot({ transcript: ['[0:00 - 0:10] 화자 1'.normalize('NFD') + ': 통합 일정부터 보겠습니다.',
    '[0:10 - 0:20] 화자 2: 다음 주에 올리겠습니다.'].join('\n') });
  const m = await mailRoot();
  const mixed = { schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.mixed', project_ref: ref(1),
    purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
    valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
    sources: [{ kind: 'voice', root_ref: 'voice.synthetic', items: [item(v.sessionId)] },
      { kind: 'mail', root_ref: 'mail.synthetic', items: [item('gmail-0001', { path: MAIL_FILE })] }] };
  const preparation = await prepareSourceDocuments({ grant: mixed, now: NOW, runId: 'prep-nfd-2',
    roots: { 'voice.synthetic': v.root, 'mail.synthetic': m.root }, clock: () => new Date('2026-09-12T00:00:00.000Z') });
  const { run, ...rest } = preparation;
  // One awkward string in one kind must not take the other kind down with it.
  assert.equal(rest.coverage.counts.prepared, 2);
  assert.deepEqual([...new Set(rest.documents.map(doc => doc.source_kind))].sort(), ['mail', 'voice']);
  const report = validatePreparationRun({ run, preparation: rest, grant: mixed,
    validationRunId: 'val-nfd-2', checkedAt: '2026-09-12T01:00:00.000Z' });
  assert.equal(report.outcome, 'pass');
});

// Provider metadata is copied verbatim, so a name truncated mid-surrogate-pair or
// a literal -0 offset reaches a locator, a title or a fact. Asking for a record
// must never cost the documents - least of all the other kinds in the same grant.
test('values the canonical hash refuses never cost a preparation its documents', async () => {
  const m = await mailRoot();
  const cases = {
    lone_surrogate_speaker: { speaker: '\ud83d' },
    lone_surrogate_title: { title: '녹음\ud83d' },
    negative_zero_offset: { negativeZero: true },
  };
  for (const [name, shape] of Object.entries(cases)) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ctx-src-odd-'));
    const sessionId = buildPlaudSessionId(new Date('2026-09-11T01:00:00.000Z'), 'odd00001abcdef');
    const dir = path.join(root, 'sessions', '2026-09-11', sessionId);
    await mkdir(dir, { recursive: true });
    const row = { schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: 0,
      start_seconds: 0, end_seconds: 4, speaker: shape.speaker ?? 'UNKNOWN', content: '일정부터 보겠습니다.',
      source: 'whisper_cpp_independent_local' };
    const line = shape.negativeZero
      ? JSON.stringify(row).replace('"start_seconds":0', '"start_seconds":-0.0') : JSON.stringify(row);
    await writeFile(path.join(dir, 'transcript.jsonl'), `${line}\n`);
    await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
      schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
      provider_recording_id: 'odd00001abcdef', source_page_title: shape.title ?? '녹음',
      recorded_at_local: '2026-09-11T10:00:00+09:00', imported_at_local: '2026-09-11T11:30:00+09:00',
      duration_seconds: 4,
      transcript: { status: 'provider_transcript_present_unverified',
        quality: 'provider_machine_transcript_unverified', segment_count: 1 },
      canonicalization: { state: 'needs_local_transcription_project_match_and_minutes_review' } }));
    const mixed = { schema_version: SOURCE_GRANT_SCHEMA, grant_id: 'grant.synthetic.odd', project_ref: ref(1),
      purposes: ['context_preparation'], allowed_data_classes: ['public_synthetic'],
      valid_from: '2026-09-01T00:00:00.000Z', valid_to: '2026-10-01T00:00:00.000Z',
      sources: [{ kind: 'voice', root_ref: 'voice.synthetic', items: [item(sessionId)] },
        { kind: 'mail', root_ref: 'mail.synthetic', items: [item('gmail-0001', { path: MAIL_FILE })] }] };
    const roots = { 'voice.synthetic': root, 'mail.synthetic': m.root };
    const without = await prepareSourceDocuments({ grant: mixed, roots, now: NOW });
    const withRecord = await prepareSourceDocuments({ grant: mixed, roots, now: NOW, runId: 'prep-odd',
      clock: () => new Date('2026-09-12T00:00:00.000Z') });
    // Asking for a record changes what you get alongside the documents, never the
    // documents themselves, and never the other kind in the grant.
    assert.equal(withRecord.coverage.counts.prepared, without.coverage.counts.prepared, name);
    assert.equal(withRecord.documents.length, without.documents.length, name);
    assert.ok(withRecord.documents.some(doc => doc.source_kind === 'mail'), `${name} keeps the mail document`);
    // These shapes are now hashable, so the record is emitted rather than refused.
    assert.notEqual(withRecord.run, null, `${name} still yields a record`);
    assert.equal(withRecord.run_unavailable, null, name);
    const report = validatePreparationRun({ run: withRecord.run, grant: mixed,
      preparation: { grant: withRecord.grant, documents: withRecord.documents,
        coverage: withRecord.coverage, changes: withRecord.changes },
      validationRunId: `val-${name}`, checkedAt: '2026-09-12T01:00:00.000Z' });
    assert.equal(report.outcome, 'pass', name);
  }
});
