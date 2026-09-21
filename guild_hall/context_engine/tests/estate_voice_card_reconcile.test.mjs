// Integration tests for `harness/estate_voice_card_reconcile.mjs`: synthetic
// fixtures only, no real state root, no model call (this slice never opens one).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import {
  MAX_RECONCILED_INDEX_PAIRS, RECONCILE_RECEIPT_SCHEMA, RECONCILED_INDEX_FILE, RECONCILED_INDEX_SCHEMA,
  aliasTermsByCode, corroborationFor, runReconcile, runReconcileCli,
} from '../harness/estate_voice_card_reconcile.mjs';
import { NIGHTLY_RECEIPT_SCHEMA, NIGHTLY_RECEIPT_SCHEMA_V1 } from '../harness/voice_conversation_list_nightly.mjs';
import { readLedgerFile, runVoiceRouteCli } from '../harness/voice_route_cli.mjs';
import { VOICE_ROUTE_LEDGER_SCHEMA } from '../harness/voice_routes.mjs';

const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = bytes => `sha256:${hex(bytes)}`;

const CARD_SCHEMA = 'soulforge.voice_conversation_list.v0';
const segment = (overrides = {}) => ({ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0,
  end_seconds: 30, clock: '2026-09-19T09:00:00+09:00', clock_end: '2026-09-19T09:00:30+09:00',
  title: '시험 일정 공유', description: '다음 주 시험 일정을 공유합니다', derived_summary: true,
  nature: 'project_work', nature_unclear: false, key_terms: [], key_terms_typed: [], agenda_items: [],
  nature_marks: [], clue_table: [], term_marks: [], project_candidates: [], other_project_mentions: [],
  unclassified_reason: null, status: 'unclassified',
  quality: { transcript_kind: 'independent_fast', marks: [], correction_state: 'none', unreadable_ratio: 0, mean_token_probability: 0.9 },
  refs: { session_id: 'sess1', transcript_run_id: 'whispercpp_test_v1', semantic_run_id: 'lbl1', source_segment_ids: [1, 2], audio_ref: 'audio/source.mp3' },
  related_segment_ids: [], boundary: { reasons: [], qa_boundary: 'ok', processed_in_windows: 1 },
  revised_after_correction: false, ...overrides });

async function estate() {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcr-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcr-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcr-derived-')));
  const receiptsDir = path.join(controlRoot, 'reconcile-receipts');
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const tableSha256 = sha256(await readFile(tablePath));
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts_root'), derived_root: derivedRoot }));
  return { dataRoot, controlRoot, derivedRoot, receiptsDir, tablePath, tableSha256, toolsPath };
}

async function writeSessionDir(dataRoot, date, sessionId) {
  await mkdir(path.join(dataRoot, 'ingress', 'plaud', 'sessions', date, sessionId), { recursive: true });
}

// S4-0: the raw session a real `readVoiceSession` call needs -- a manifest
// declaring a completed independent local run, and that run's own transcript
// plus its manifest, in the exact shape `voice_session_read.mjs` reads
// (mirrors `voice_session_read.test.mjs`'s own fixtures). Only what the
// content-check gate's read path touches; nothing else about a real PLAUD
// session is modelled here.
const transcriptSegmentLine = ({ id, start, end, content }) => JSON.stringify({
  schema_version: 'soulforge.voice_transcript_segment.v0', segment_id: id, start_seconds: start,
  end_seconds: end, speaker: 'UNKNOWN', content, source: 'synthetic' });

async function writeRawSession(dataRoot, { date, sessionId, runId, duration, rows }) {
  const dir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', date, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'synthetic_import',
    source_page_title: '합성 세션', recorded_at_local: `${date}T09:00:00+09:00`, duration_seconds: duration,
    audio: { status: 'source_present', ref: 'sessions/x/audio/source.mp3' },
    transcript: { status: 'provider_transcript_present_unverified', evidence_role: 'auxiliary_unverified',
      quality: 'provider_machine_transcript_unverified', segment_count: rows.length,
      time_basis: 'seconds_from_recording_start_rounded_by_provider_cli' },
    provider_summary: { status: 'provider_output_present_untrusted', evidence_role: 'quarantined_untrusted' },
    speaker_diarization: { status: 'provider_labels_present_unverified', labels: ['UNKNOWN'],
      warning: 'Provider labels are alignment hints, not verified human identities.' },
    canonicalization: { state: 'independent_transcript_ready_project_match_and_review_required',
      plaud_transcript_is_canonical: false },
    meeting_context: { meeting_type: 'unclassified_voice_recording' },
    independent_transcription: { status: 'completed', run_id: runId,
      evidence_role: 'independent_machine_transcript_unverified', segment_count: rows.length } }, null, 2));
  // A provider transcript is required for the fallback chain even though
  // this test only ever exercises the independent (local) one.
  await writeFile(path.join(dir, 'transcript.jsonl'),
    `${rows.map(transcriptSegmentLine).join('\n')}\n`);
  const runDir = path.join(dir, 'analysis', 'local_asr', runId);
  await mkdir(runDir, { recursive: true });
  const bytes = Buffer.from(`${rows.map(transcriptSegmentLine).join('\n')}\n`);
  await writeFile(path.join(runDir, 'transcript.jsonl'), bytes);
  await writeFile(path.join(runDir, 'analysis_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.local_asr_run.v0', session_id: sessionId, run_id: runId, engine: 'whisper.cpp',
    model_id: 'synthetic-model', state: 'completed', segment_count: rows.length,
    transcript_sha256: hex(bytes), evidence_role: 'independent_machine_transcript_unverified',
    quality: 'machine_transcript_unverified_attention_required', claim_ceiling: 'observed' }, null, 2));
}

async function writeVoiceInboxAccess(controlRoot, { maxSecondsPerCall = 600, maxCharactersPerCall = 12000 } = {}) {
  await mkdir(path.join(controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(controlRoot, 'voice-routes', 'inbox_access.v0.json'), JSON.stringify({
    schema: 'soulforge.voice_inbox_access.v0', actor_ref: 'actor:owner:context-reader',
    purpose: 'voice_route_review', root: 'data_root/ingress/plaud/sessions', granted_by: 'synthetic',
    max_seconds_per_call: maxSecondsPerCall, max_characters_per_call: maxCharactersPerCall }, null, 2));
}

async function writeCard(derivedRoot, sessionId, runId, { verified = true, segments = [segment()] } = {}) {
  const dir = path.join(derivedRoot, 'voice', sessionId, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'conversation_list.v0.json'), JSON.stringify({ schema: CARD_SCHEMA,
    session_id: sessionId, run_id: runId, generated_at: '2026-09-19T20:00:00.000Z', verified, checks: [],
    transcript: { run_id: 'whispercpp_test_v1', sha256: `sha256:${'a'.repeat(64)}`, kind: 'independent_fast' },
    semantic_run: { run_id: 'lbl1', sha256: `sha256:${'b'.repeat(64)}` },
    model: { pin_kind: 'installed', digest: `sha256:${'c'.repeat(64)}`, alias: 'test-model' },
    prompts: {}, suppressed_segment_ids: [], remaining_work: [], segments, evidence_rows: [] }, null, 2));
  return path.join(dir, 'conversation_list.v0.json');
}

async function writeMailEvent(dataRoot, source, month, row) {
  const dir = path.join(dataRoot, 'ingress', 'mail', source, '2026');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${month}.jsonl`), `${JSON.stringify(row)}\n`, { flag: 'a' });
}

async function writeLinearProject(dataRoot, team, projectId, object) {
  const dir = path.join(dataRoot, 'ingress', 'linear', team, 'projects', projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${'0'.repeat(64)}.json`), JSON.stringify({ object_id: projectId, object }));
}

async function writeLinearIssue(dataRoot, team, issueId, object) {
  const dir = path.join(dataRoot, 'ingress', 'linear', team, 'issues', issueId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${'1'.repeat(64)}.json`), JSON.stringify({ object_id: issueId, object }));
}

const mailEvent = (eventId, subject, receivedAt, from = [{ name: 'Someone', address: 'a@example.com' }]) => ({
  schema_version: 'email.fetch.event.v1', event_id: eventId, source: 'gmail', subject, from, to: [], cc: [],
  attachments: [], received_at: receivedAt, ingested_at: receivedAt, body_text: '본문은 절대 읽히지 않아야 한다' });

// S2-5: a synthetic nightly-lane receipt, the same shape
// `voice_conversation_list_nightly.mjs`'s own CLI writes -- only the fields
// `collectBacklogSessions` actually reads are populated with real values.
// R2: a real nightly row names its own plan date (a backlog-window row can be
// days earlier than the receipt's own `target_date`) -- a row here that does
// not set one of its own defaults to this receipt's `target_date`, which is
// right for the ordinary same-night case every existing fixture call models.
async function writeNightlyReceipt(nightlyReceiptsDir, name, { targetDate, sessions }) {
  await mkdir(nightlyReceiptsDir, { recursive: true });
  await writeFile(path.join(nightlyReceiptsDir, name), JSON.stringify({
    schema_version: NIGHTLY_RECEIPT_SCHEMA, ran_at: `${targetDate}T21:00:00.000Z`, target_date: targetDate,
    dry: false, lock: { reclaimed_stale: false, previous_lock: null, previous_lock_age_ms: null },
    plan: { candidates: sessions.length, processed: sessions.length, max_sessions: 50, error: null },
    sessions: sessions.map(row => ({ ...row, date: row.date ?? targetDate })),
    totals: { ran: sessions.filter(row => row.outcome === 'ran').length, ran_unverified: 0,
      llm_calls: 0, seconds: 0 } }, null, 2));
}

const nightlyRow = (sessionId, runId, overrides = {}) => ({ session_id: sessionId, date: null, title: 'title',
  duration_seconds: 30, outcome: 'ran', reason: null, llm_calls: 1, seconds: 1, run_id: runId, verified: true,
  ...overrides });

// -------------------------------------------------------------- pure helpers
test('aliasTermsByCode builds terms only from project names starting with the code', () => {
  const projects = [{ id: 'p1', name: 'P24-049 SAS 처리장치 (저주파 SAS)' }, { id: 'p2', name: 'P23-043 다른 과제' }];
  const map = aliasTermsByCode(['P24-049'], projects);
  assert.deepEqual(map.get('P24-049'), ['sas', '처리장치', '저주파']);
});

test('corroborationFor finds a mail and a linear ref independently and de-duplicates within a project', () => {
  const seg = segment({ title: 'SAS 처리장치 검토', description: '',
    project_candidates: [{ project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] }] });
  const result = corroborationFor({ segment: seg,
    mailEvents: [{ event_id: 'evt-1', subject: 'SAS 처리장치 검토', fromDisplay: '' },
      { event_id: 'evt-2', subject: '점심 메뉴', fromDisplay: '' }],
    linearIssues: [{ identifier: 'ENG-1', title: 'SAS 처리장치 저주파 준비', project_id: 'p1' }],
    aliasByCode: new Map([['P24-049', ['sas', '처리장치']]]), linearIdsByCode: new Map([['P24-049', ['p1']]]) });
  assert.equal(result.corroboration.corroborated, true);
  assert.deepEqual(result.corroboration.refs.sort(), ['linear:ENG-1', 'mail:evt-1']);
  assert.deepEqual(result.refsByCode.get('P24-049').sort(), ['linear:ENG-1', 'mail:evt-1']);
});

test('corroborationFor returns nothing for a segment with no project candidates', () => {
  const result = corroborationFor({ segment: segment({ project_candidates: [] }), mailEvents: [], linearIssues: [],
    aliasByCode: new Map(), linearIdsByCode: new Map() });
  assert.deepEqual(result.corroboration, { corroborated: false, refs: [] });
});

// -------------------------------------------------------------------- dry
test('--dry classifies and reports but writes no lock, receipt or ledger', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
    segment({ segment_id: 'c002', nature: 'idea', title: '아이디어', description: '' }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  assert.equal(result.status, 'DRY');
  assert.equal(result.receipt.dry, true);
  assert.equal(result.receipt.sessions[0].segments.find(row => row.segment_id === 'c001').classification, 'provisional');
  assert.equal(result.receipt.sessions[0].segments.find(row => row.segment_id === 'c001').ledger_write, 'skipped_dry');
  assert.equal(result.receipt.sessions[0].segments.find(row => row.segment_id === 'c002').classification, 'skip');
  const entries = await readdir(est.receiptsDir).catch(() => null);
  assert.equal(entries, null); // the whole directory was never created
});

// -------------------------------------------------------------------- real run
test('a real run writes candidate-status ledger rows and a receipt, never confirmed', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.schema_version, VOICE_ROUTE_LEDGER_SCHEMA);
  const row = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'candidate');
  assert.equal(row.confirmed_by, null);
  assert.equal(row.project_candidates.length, 1);
  assert.equal(row.project_candidates[0].project_code, 'P24-049');
  assert.match(row.project_candidates[0].basis, /^reconcile:v1 classification=provisional/u);
  const receiptFiles = (await readdir(est.receiptsDir)).filter(name => name !== 'reconcile.lock');
  assert.equal(receiptFiles.length, 1);
  const receipt = JSON.parse(await readFile(path.join(est.receiptsDir, receiptFiles[0]), 'utf8'));
  assert.equal(receipt.schema_version, RECONCILE_RECEIPT_SCHEMA);
  assert.equal(receipt.totals.provisional, 1);
});

test('mail and Linear corroboration write refs as cues (never body text), without promoting a weak candidate (v1)', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [3] }] }),
  ] });
  await writeMailEvent(est.dataRoot, 'gmail', '09', mailEvent('evt-1', 'SAS 처리장치 검토 요청', '2026-09-19T02:00:00.000Z'));
  await writeLinearProject(est.dataRoot, 'acme', 'proj-1', { name: 'P24-049 SAS 처리장치 (저주파 SAS)', updated_at: '2026-09-01T00:00:00.000Z' });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--mail-root', 'data_root/ingress/mail/gmail', '--linear-root', 'data_root/ingress/linear',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const row = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'candidate'); // never 'provisional' -- that classification is a receipt-only label
  assert.ok(row.project_candidates[0].evidence_refs.includes('mail:evt-1'));
  assert.match(row.project_candidates[0].basis, /cues=1/u);
  assert.ok(!JSON.stringify(ledger).includes('절대 읽히지 않아야 한다'));
  const receiptFiles = (await readdir(est.receiptsDir)).filter(name => name !== 'reconcile.lock');
  const receipt = JSON.parse(await readFile(path.join(est.receiptsDir, receiptFiles[0]), 'utf8'));
  assert.equal(receipt.sources.mail_events_in_window, 1);
  assert.ok(!JSON.stringify(receipt).includes('절대 읽히지 않아야 한다'));
});

test('a weak, uncorroborated candidate with a risk marker becomes exception and lands in exception_review', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: '예산 확정', description: '금요일 마감',
      project_candidates: [{ project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.exception_review.length, 1);
  assert.equal(result.receipt.exception_review[0].segment_id, 'c001');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate');
});

test('a segment a person already confirmed is left untouched', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // A person confirms the segment before the reconcile pass ever runs.
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '사람이 확인한 제목', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: ['evidence_row:1'], basis: '사람 확인' }],
      status: 'confirmed', quality: { transcript: 'independent_fast', correction_state: 'human_corrected' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:owner:someone', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: 'actor:owner:someone', confirmed_at: '2026-09-19T21:00:00.000Z', withdrawn: [] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.totals.already_confirmed, 1);
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const row = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'confirmed');
  assert.equal(row.title, '사람이 확인한 제목');
  assert.equal(row.confirmed_by, 'actor:owner:someone');
});

test('--dry reads the existing ledger too, so already_confirmed is faithful to a real run', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '사람이 확인한 제목', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: [], basis: '사람 확인' }],
      status: 'confirmed', quality: { transcript: 'independent_fast', correction_state: 'human_corrected' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:owner:someone', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: 'actor:owner:someone', confirmed_at: '2026-09-19T21:00:00.000Z', withdrawn: [] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  assert.equal(result.status, 'DRY');
  assert.equal(result.receipt.totals.already_confirmed, 1);
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.ledger_write, 'skipped_confirmed');
});

test('a session whose existing ledger cannot be read is aborted (failed, ledger_unreadable), in --dry and for real, without touching it', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  const ledgerFile = path.join(est.controlRoot, 'voice-routes', 'sess1.json');
  await writeFile(ledgerFile, '{ not valid json');

  const dryRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  // A --dry preview over a session it could not even read is not a clean
  // preview: it fails the same way (and the same exit-code mapping) a real
  // pass over the same broken ledger would, rather than reporting DRY/0.
  assert.equal(dryRun.result.status, 'FAILED');
  assert.equal(dryRun.result.receipt.sessions[0].outcome, 'failed');
  assert.equal(dryRun.result.receipt.sessions[0].reason, 'ledger_unreadable');
  assert.equal(dryRun.result.receipt.sessions[0].segments.length, 0);

  const realRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(realRun.result.status, 'FAILED');
  assert.equal(realRun.result.receipt.totals.failed, 1);
  assert.equal(await readFile(ledgerFile, 'utf8'), '{ not valid json'); // never touched
});

test('a session whose import fails is reported failed and its segments are never written', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  // The card's own session_id disagrees with the directory it lives under --
  // `import` refuses to merge it (voice_route_session_mismatch) rather than
  // silently accepting the wrong recording's list into this session's ledger.
  const dir = path.join(est.derivedRoot, 'voice', 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'conversation_list.v0.json'), JSON.stringify({ schema: CARD_SCHEMA,
    session_id: 'a-different-session', run_id: 'vcl_aaaaaaaaaaaaaaaa', generated_at: '2026-09-19T20:00:00.000Z',
    verified: true, checks: [], transcript: { run_id: 'whispercpp_test_v1', sha256: `sha256:${'a'.repeat(64)}`, kind: 'independent_fast' },
    semantic_run: { run_id: 'lbl1', sha256: `sha256:${'b'.repeat(64)}` },
    model: { pin_kind: 'installed', digest: `sha256:${'c'.repeat(64)}`, alias: 'test-model' },
    prompts: {}, suppressed_segment_ids: [], remaining_work: [], segments: [segment()], evidence_rows: [] }));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.receipt.sessions[0].outcome, 'failed');
  assert.equal(result.receipt.sessions[0].reason, 'voice_route_session_mismatch');
  assert.equal(result.receipt.sessions[0].segments.length, 0);
  const { existed } = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1');
  assert.equal(existed, false); // import never got far enough to write anything
});

test('two strong candidates for different projects become exception/strong_conflict and no ledger project is written', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', project_candidates: [
      { project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] },
      { project_code: 'P23-043', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [2] },
    ] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'exception');
  assert.equal(row.reason, 'strong_conflict');
  assert.equal(result.receipt.exception_review.length, 1);
  assert.equal(result.receipt.exception_review[0].why, 'strong_conflict');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const ledgerRow = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(ledgerRow.status, 'candidate');
  // Neither conflicting project got a reconcile-written basis: whatever is
  // there is exactly what `import` seeded from the card, untouched by `set`.
  for (const candidate of ledgerRow.project_candidates) assert.ok(!candidate.basis.startsWith('reconcile:'));
});

test('a strong_conflict segment that later resolves to a single strong candidate is overwritten, not stuck as human-protected', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', status: 'candidate', project_candidates: [
      { project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] },
      { project_code: 'P23-043', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [2] },
    ] }),
  ] });
  const nightOne = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(nightOne.result.status, 'OK');
  const afterNightOne = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(afterNightOne.project_candidates.find(item => item.project_code === 'P24-049').basis
    .startsWith('voice_conversation_list:'), true); // import's own machine-written basis, from the conflict night

  // The card is regenerated and the conflict is gone: only P24-049 is strong now.
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const nightTwo = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-21T18:00:00.000Z']);
  assert.equal(nightTwo.result.status, 'OK');
  const row = nightTwo.result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'provisional');
  assert.equal(row.ledger_write, 'set'); // not skipped_human_candidate, even though import never confirmed anything here
  // S2-3: the conflicting P23-043 candidate the card no longer lists is
  // retired now that this night actually touches this segment's candidates.
  assert.deepEqual(row.retired_candidates, ['P23-043']);
  const ledgerRow = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.match(ledgerRow.project_candidates.find(item => item.project_code === 'P24-049').basis, /^reconcile:v1/u);
  assert.equal(ledgerRow.project_candidates.find(item => item.project_code === 'P23-043'), undefined, 'B is gone');
  assert.equal(ledgerRow.project_candidates.length, 1);
});

test('a candidate a person already wrote by hand is never overwritten, and is reported skipped_human_candidate', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '내가 확인 중', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: [], basis: '사람이 직접 확인함, 아직 확정 전' }],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:owner:someone', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.totals.human_protected_candidates, 1);
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.ledger_write, 'skipped_human_candidate');
  assert.deepEqual(row.skipped_human_candidates, ['P24-049']);
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const ledgerRow = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(ledgerRow.project_candidates[0].basis, '사람이 직접 확인함, 아직 확정 전');
});

test('a segment with one human-protected candidate and one new candidate is set_partial_human_protected', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', project_candidates: [
      { project_code: 'P24-049', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [1] },
      { project_code: 'P23-043', strength: 'weak', basis: ['key_terms'], evidence_row_ids: [2] },
    ] }),
  ] });
  // Only P24-049 exists in the ledger already, written by a person; P23-043 is new to this ledger.
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '내가 확인 중', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: [], basis: '사람이 직접 확인함, 아직 확정 전' }],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:owner:someone', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.ledger_write, 'set_partial_human_protected');
  assert.deepEqual(row.skipped_human_candidates, ['P24-049']);
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const ledgerRow = ledger.segments.find(item => item.segment_id === 'c001');
  const p24 = ledgerRow.project_candidates.find(item => item.project_code === 'P24-049');
  const p23 = ledgerRow.project_candidates.find(item => item.project_code === 'P23-043');
  assert.equal(p24.basis, '사람이 직접 확인함, 아직 확정 전'); // untouched
  assert.match(p23.basis, /^reconcile:v1/u); // newly written
});

// -------------------------------------------------------- S2-2 segment identity
test('a regenerated card reusing a segment_id for a different stretch of the recording is skipped (segment_identity_changed), old row untouched, in --dry and for real', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_bbbbbbbbbbbbbbbb', { segments: [
    segment({ segment_id: 'c001', source_segment_ids: [5, 6], start_seconds: 120, end_seconds: 160,
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // A prior night's machine-drafted row for the same segment_id, over the
  // completely different scope an earlier run's boundary step drew.
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '이전 회차 구간', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: [], basis: 'voice_conversation_list:vcl_aaaaaaaaaaaaaaaa:c001 strength=strong basis=key_terms' }],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: { kind: 'conversation_list', run_id: 'vcl_aaaaaaaaaaaaaaaa', unit_id: 'c001' },
      judged_by: 'actor:context-engine:voice-card-reconcile-v0', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));

  const dryRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  assert.equal(dryRun.result.status, 'DRY');
  const dryRow = dryRun.result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(dryRow.ledger_write, 'skipped_segment_identity_changed');
  assert.equal(dryRun.result.receipt.totals.segment_identity_changed, 1);

  const realRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(realRun.result.status, 'OK');
  const realRow = realRun.result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(realRow.ledger_write, 'skipped_segment_identity_changed');
  assert.equal(realRun.result.receipt.totals.segment_identity_changed, 1);
  const ledgerRow = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.deepEqual(ledgerRow.source_segment_ids, [1, 2]); // the old scope, exactly
  assert.equal(ledgerRow.title, '이전 회차 구간');
});

// -------------------------------------------------------- S2-3 vanished candidates
test('a machine candidate the current card no longer lists is retired; a human candidate never is, even if the card also drops it', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '지난 회차', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [
        { project_code: 'P23-043', evidence_refs: [], basis: 'reconcile:v0 classification=candidate corroborated=false' },
        { project_code: 'P26-014', evidence_refs: [], basis: '사람이 직접 확인함' },
      ],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:context-engine:voice-card-reconcile-v0', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.deepEqual(row.retired_candidates, ['P23-043']);
  assert.equal(result.receipt.totals.retired_candidates, 1);
  const ledgerRow = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  const codes = ledgerRow.project_candidates.map(item => item.project_code).sort();
  assert.deepEqual(codes, ['P24-049', 'P26-014']); // P23-043 gone, P26-014 (human, absent from card) kept
});

test('N7: a night that only retires a stale machine candidate behind a withdrawn card candidate is not mislabelled set_partial_human_protected', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  // The card now proposes only P24-049 -- withdrawn, so every card candidate
  // is skipped and this pass never calls `set --project` for anything.
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const routesDir = path.join(est.controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  await writeFile(path.join(routesDir, 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '지난 회차', description: null, derived_summary: true, nature: 'project_work',
      // A stale machine candidate the current card no longer lists at all
      // (S2-3 retires it) -- no human candidate anywhere on this row.
      project_candidates: [
        { project_code: 'P23-043', evidence_refs: [], basis: 'reconcile:v0 classification=candidate corroborated=false' },
      ],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:context-engine:voice-card-reconcile-v0', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null,
      withdrawn: [{ project_code: 'P24-049', withdrawn_by: 'actor:owner:someone', withdrawn_at: '2026-09-19T22:00:00.000Z' }] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  // The only ledger call this pass made was retiring P23-043; nothing here
  // ever looked at a human-written candidate, so it must not say so.
  assert.equal(row.ledger_write, 'retired_withdrawn_only');
  assert.deepEqual(row.retired_candidates, ['P23-043']);
  assert.deepEqual(row.skipped_withdrawn_projects, ['P24-049']);
  assert.deepEqual(row.skipped_human_candidates, []);
  const ledgerRow = readLedgerFile(routesDir, 'sess1').ledger.segments.find(item => item.segment_id === 'c001');
  assert.deepEqual(ledgerRow.project_candidates, [], 'the stale machine candidate is gone and nothing replaced it');
});

// -------------------------------------------------------------------- S3
test('S3: a unique strong candidate with no transcript access declared reads content_check unverified, counted in totals, and still writes as usual', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: '9월 20일까지 완료', description: '',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // No voice-inbox access declaration written for this estate at all --
  // readVoiceSession answers access_denied, and the gate reads that as
  // "nothing to check", not a manufactured mismatch.
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'provisional');
  assert.equal(row.content_check, 'unverified');
  assert.equal(result.receipt.totals.content_unverified, 1);
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate');
});

test('S4-0: a transcript window read that comes back character-truncated forces content_check unverified, counted as window_truncated (R3, real access)', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  // A real access declaration, but with a character budget far smaller than
  // the one utterance this session holds -- `readVoiceSession` itself
  // reports that row `truncated: true`, and the caching read gate must not
  // trust the partial text it did get.
  await writeVoiceInboxAccess(est.controlRoot, { maxSecondsPerCall: 600, maxCharactersPerCall: 40 });
  await writeRawSession(est.dataRoot, { date: '2026-09-19', sessionId: 'sess1', runId: 'whispercpp_test_v1',
    duration: 30, rows: [{ id: 1, start: 0, end: 30, content: `9월 20일까지 완료하기로 했습니다. ${'다'.repeat(200)}` }] });
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: '9월 20일까지 완료', description: '', start_seconds: 0, end_seconds: 30,
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'provisional');
  assert.equal(row.content_check, 'unverified');
  assert.equal(result.receipt.totals.content_window_truncated, 1);
  assert.equal(result.receipt.totals.content_unverified, 1);
});

test('S3: an identifier-shaped token with no card candidate, matching no Linear-registered project code, is exception/new_project_candidate -- a registered one is not', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: 'XZ-77 신규 거래처 협의', description: '', project_candidates: [] }),
    segment({ segment_id: 'c002', title: 'P24-049 관련 후속 논의', description: '', project_candidates: [] }),
  ] });
  await writeLinearProject(est.dataRoot, 'acme', 'proj-1', { name: 'P24-049 SAS 처리장치', updated_at: '2026-09-01T00:00:00.000Z' });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--linear-root', 'data_root/ingress/linear', '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const segments = result.receipt.sessions[0].segments;
  const newProject = segments.find(item => item.segment_id === 'c001');
  assert.equal(newProject.classification, 'exception');
  assert.equal(newProject.reason, 'new_project_candidate');
  const registered = segments.find(item => item.segment_id === 'c002');
  assert.notEqual(registered.reason, 'new_project_candidate');
  const exceptionEntry = result.receipt.exception_review.find(row => row.segment_id === 'c001');
  assert.equal(exceptionEntry.why, 'new_project_candidate');
});

test('S8: registered_project_codes_count and new_project_check land in the receipt, and the check is disabled with no Linear projects loaded at all', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: 'XZ-77 신규 거래처 협의', description: '', project_candidates: [] }),
  ] });
  // No writeLinearProject call at all -- registeredProjectCodes ends up empty.
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.new_project_check, 'disabled_no_registry');
  assert.equal(result.receipt.totals.registered_project_codes_count, 0);
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.notEqual(row.reason, 'new_project_candidate', 'the check is disabled, not permissive');
});

test('R1: a card with no date or amount at all is content_check nothing_to_check, counted separately from unverified', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: '담당자 논의', description: '',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'provisional');
  assert.equal(row.content_check, 'nothing_to_check');
  assert.equal(result.receipt.totals.content_nothing_to_check, 1);
  assert.equal(result.receipt.totals.content_unverified, 0);
});

test('S3: a modality-tagged risk marker reaches the receipt and exception_review as conditional_or_reported, not important_and_unresolved', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001', title: '만약 승인되면 발주', description: '', project_candidates: [] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  assert.equal(row.classification, 'exception');
  assert.equal(row.reason, 'conditional_or_reported');
  assert.equal(row.modality, 'conditional');
  const exceptionEntry = result.receipt.exception_review.find(item => item.segment_id === 'c001');
  assert.equal(exceptionEntry.modality, 'conditional');
});

// -------------------------------------------------------------- S2-4 withdraw
test('a withdrawn project is never re-proposed by reconcile, and a strong card candidate for it does not read as strong', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // A person confirmed P24-049, then took it back.
  const routesDir = path.join(est.controlRoot, 'voice-routes');
  await mkdir(routesDir, { recursive: true });
  await writeFile(path.join(routesDir, 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '사람이 확인했던 제목', description: null, derived_summary: true, nature: 'project_work',
      project_candidates: [{ project_code: 'P24-049', evidence_refs: [], basis: '사람이 직접 확인함' }],
      status: 'candidate', quality: { transcript: 'independent_fast', correction_state: 'human_corrected' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:owner:someone', judged_at: '2026-09-19T21:00:00.000Z', confirmed_by: null, confirmed_at: null,
      withdrawn: [{ project_code: 'P24-049', withdrawn_by: 'actor:owner:someone', withdrawn_at: '2026-09-19T22:00:00.000Z' }] }] }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  // The card's own strength was `strong`, but with the project withdrawn it
  // must not ride the strong-candidate path to `provisional` unchallenged.
  assert.notEqual(row.classification, 'provisional');
  assert.equal(row.ledger_write, 'skipped_withdrawn_project');
  assert.deepEqual(row.skipped_withdrawn_projects, ['P24-049']);
  assert.equal(result.receipt.totals.withdrawn_projects_skipped, 1);
  const ledgerRow = readLedgerFile(routesDir, 'sess1').ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(ledgerRow.project_candidates[0].basis, '사람이 직접 확인함'); // untouched
  assert.equal(ledgerRow.title, '사람이 확인했던 제목'); // untouched
});


test('--nightly-receipts reconciles every session three nightly receipts report as ran/verified, across three different dates, instead of one --date folder', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess-a', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeCard(est.derivedRoot, 'sess-b', 'vcl_bbbbbbbbbbbbbbbb', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeCard(est.derivedRoot, 'sess-c', 'vcl_cccccccccccccccc', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // Deliberately no writeSessionDir for any of these -- a --date pass would
  // find zero sessions for any single day; only the nightly receipts name them.
  await writeNightlyReceipt(nightlyReceiptsDir, 'r1.json', { targetDate: '2026-09-17',
    sessions: [nightlyRow('sess-a', 'vcl_aaaaaaaaaaaaaaaa')] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r2.json', { targetDate: '2026-09-18',
    sessions: [nightlyRow('sess-b', 'vcl_bbbbbbbbbbbbbbbb')] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r3.json', { targetDate: '2026-09-19',
    sessions: [nightlyRow('sess-c', 'vcl_cccccccccccccccc')] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.plan.mode, 'backlog');
  assert.equal(result.receipt.plan.nightly_receipts_dir, nightlyReceiptsDir);
  assert.deepEqual(result.receipt.plan.dates, ['2026-09-17', '2026-09-18', '2026-09-19']);
  const bySession = Object.fromEntries(result.receipt.sessions.map(row => [row.session_id, row]));
  assert.equal(bySession['sess-a'].outcome, 'reconciled');
  assert.equal(bySession['sess-b'].outcome, 'reconciled');
  assert.equal(bySession['sess-c'].outcome, 'reconciled');
  assert.deepEqual(new Set(result.receipt.reconciled_runs.map(row => row.session_id)),
    new Set(['sess-a', 'sess-b', 'sess-c']));
  for (const sessionId of ['sess-a', 'sess-b', 'sess-c']) {
    const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), sessionId).ledger;
    assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate');
  }
});

// nit 5 (2026-09-21 review): the nightly receipt schema moved to v2, and
// this reader must not go blind to every v1-shaped receipt already sitting
// in a real receipts directory -- both versions are accepted since this
// reader only ever touches the `sessions` array, unchanged across the bump.
test('--nightly-receipts accepts both the old (v1) and current (v2) nightly receipt schema_version', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess-v1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeCard(est.derivedRoot, 'sess-v2', 'vcl_bbbbbbbbbbbbbbbb', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // A receipt written by a pre-bump nightly harness -- `schema_version` is
  // literally the old string, not `NIGHTLY_RECEIPT_SCHEMA_V1`-derived, so
  // this genuinely exercises the on-disk shape rather than the constant.
  await mkdir(nightlyReceiptsDir, { recursive: true });
  await writeFile(path.join(nightlyReceiptsDir, 'v1.json'), JSON.stringify({
    schema_version: 'soulforge.voice_conversation_list_nightly_receipt.v1', ran_at: '2026-09-17T21:00:00.000Z',
    target_date: '2026-09-17', dry: false, lock: {}, plan: { candidates: 1, processed: 1, max_sessions: 50, error: null },
    sessions: [nightlyRow('sess-v1', 'vcl_aaaaaaaaaaaaaaaa', { date: '2026-09-17' })],
    totals: { ran: 1, ran_unverified: 0, llm_calls: 0, seconds: 0 } }, null, 2));
  assert.equal(NIGHTLY_RECEIPT_SCHEMA_V1, 'soulforge.voice_conversation_list_nightly_receipt.v1');
  await writeNightlyReceipt(nightlyReceiptsDir, 'v2.json', { targetDate: '2026-09-18',
    sessions: [nightlyRow('sess-v2', 'vcl_bbbbbbbbbbbbbbbb')] });
  assert.notEqual(NIGHTLY_RECEIPT_SCHEMA, NIGHTLY_RECEIPT_SCHEMA_V1); // the two really do differ

  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-20T18:00:00.000Z']);

  assert.equal(result.status, 'OK');
  const bySession = Object.fromEntries(result.receipt.sessions.map(row => [row.session_id, row]));
  assert.equal(bySession['sess-v1'].outcome, 'reconciled', 'the v1-schema receipt was not silently ignored');
  assert.equal(bySession['sess-v2'].outcome, 'reconciled');
});

test('a (session_id, run_id) pair a backlog pass already reconciled is skipped by the next pass, but reconciled again once its run_id changes', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_1111111111111111', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r1.json', { targetDate: '2026-09-18',
    sessions: [nightlyRow('sess1', 'vcl_1111111111111111')] });
  const first = (await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T05:00:00.000Z'])).result;
  assert.equal(first.status, 'OK');
  assert.equal(first.receipt.sessions[0].outcome, 'reconciled');
  assert.deepEqual(first.receipt.reconciled_runs, [{ session_id: 'sess1', run_id: 'vcl_1111111111111111' }]);

  // A second backlog pass, same receipts directory, same run: it must not be
  // redone (no fresh ledger_write on a segment already settled), and it is
  // reported skipped with the S2-5 reason rather than silently dropped.
  const second = (await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T06:00:00.000Z'])).result;
  assert.equal(second.status, 'OK');
  assert.equal(second.receipt.sessions[0].outcome, 'skipped');
  assert.equal(second.receipt.sessions[0].reason, 'already_reconciled_run');
  assert.deepEqual(second.receipt.reconciled_runs, []);

  // The session gets re-transcribed (S2-1): a new run_id lands in the card
  // and a new nightly receipt reports it. That pair was never recorded, so
  // it is reconciled again even though the session_id repeats.
  await writeCard(est.derivedRoot, 'sess1', 'vcl_2222222222222222', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r2.json', { targetDate: '2026-09-19',
    sessions: [nightlyRow('sess1', 'vcl_2222222222222222')] });
  const third = (await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T20:00:00.000Z'])).result;
  assert.equal(third.status, 'OK');
  assert.equal(third.receipt.sessions[0].outcome, 'reconciled');
  assert.equal(third.receipt.sessions[0].run_id, 'vcl_2222222222222222');
  assert.deepEqual(third.receipt.reconciled_runs, [{ session_id: 'sess1', run_id: 'vcl_2222222222222222' }]);
});

test('S3: a backlog pass reads and rewrites the compact reconciled-pairs index, and a second pass needs no other receipt to skip an already-done pair', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_3333333333333333', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r1.json', { targetDate: '2026-09-18',
    sessions: [nightlyRow('sess1', 'vcl_3333333333333333')] });
  const first = (await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T05:00:00.000Z'])).result;
  assert.equal(first.status, 'OK');
  const indexPath = path.join(est.receiptsDir, 'reconciled_runs.index.json');
  const indexAfterFirst = JSON.parse(await readFile(indexPath, 'utf8'));
  assert.deepEqual(indexAfterFirst.pairs.map(row => [row.session_id, row.run_id]), [['sess1', 'vcl_3333333333333333']]);
  assert.equal(indexAfterFirst.evicted_total, 0);

  // Delete every reconcile receipt but keep the index. A second backlog pass
  // still recognises the pair as already done, which it can only be reading
  // from the index -- the receipt that originally recorded the pair is gone.
  for (const name of await readdir(est.receiptsDir)) {
    if (name.endsWith('.json') && name !== 'reconciled_runs.index.json') await rm(path.join(est.receiptsDir, name));
  }
  const second = (await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T06:00:00.000Z'])).result;
  assert.equal(second.status, 'OK');
  assert.equal(second.receipt.sessions[0].outcome, 'skipped');
  assert.equal(second.receipt.sessions[0].reason, 'already_reconciled_run');
});

test('S3: the reconciled-pairs index is bounded -- a write past the cap evicts the oldest pair and records the eviction', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess-new', 'vcl_4444444444444444', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await writeNightlyReceipt(nightlyReceiptsDir, 'r1.json', { targetDate: '2026-09-18',
    sessions: [nightlyRow('sess-new', 'vcl_4444444444444444')] });

  // A pre-filled index already at the cap, strictly oldest-first.
  await mkdir(est.receiptsDir, { recursive: true });
  const seedTime = index => new Date(Date.parse('2020-01-01T00:00:00.000Z') + index).toISOString();
  const seeded = Array.from({ length: MAX_RECONCILED_INDEX_PAIRS }, (_, index) => ({
    session_id: `seed-${String(index).padStart(5, '0')}`, run_id: 'vcl_0000000000000000', recorded_at: seedTime(index) }));
  await writeFile(path.join(est.receiptsDir, RECONCILED_INDEX_FILE), JSON.stringify({
    schema_version: RECONCILED_INDEX_SCHEMA, updated_at: seedTime(MAX_RECONCILED_INDEX_PAIRS - 1), pairs: seeded,
    evicted_total: 3 }, null, 2));

  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-19T05:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const index = JSON.parse(await readFile(path.join(est.receiptsDir, RECONCILED_INDEX_FILE), 'utf8'));
  assert.equal(index.pairs.length, MAX_RECONCILED_INDEX_PAIRS, 'still capped, not grown past the limit');
  // The one new pair pushed the total to cap+1; exactly the single oldest
  // seeded pair (seed-00000) is gone, every other seeded pair is untouched,
  // and the running eviction count carried forward and grew by one.
  assert.ok(!index.pairs.some(row => row.session_id === 'seed-00000'), 'the oldest pair was evicted');
  assert.ok(index.pairs.some(row => row.session_id === 'seed-00001'), 'the next-oldest pair was kept');
  assert.ok(index.pairs.some(row => row.session_id === 'sess-new'), 'this pass’s own new pair is in the index');
  assert.equal(index.evicted_total, 4, 'the prior evicted_total (3) plus this write’s one eviction');
});

test('S4: a nightly-reported skipped_existing (verified) session is a backlog candidate too, and a session settled nowhere is named in not_considered with its reason', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  await writeCard(est.derivedRoot, 'sess-existing', 'vcl_eeeeeeeeeeeeeeee', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // Night 1: sess-never is reported skipped_short -- not settled yet.
  await writeNightlyReceipt(nightlyReceiptsDir, 'r1.json', { targetDate: '2026-09-17',
    sessions: [nightlyRow('sess-never', null, { outcome: 'skipped_short', reason: 'duration_below_30s', verified: null })] });
  // Night 2: the only receipt that ever mentions sess-existing reports it
  // skipped_existing (a verified run already existed) -- never `ran` at all,
  // and no receipt reporting a `ran` outcome for it exists anywhere. sess-never
  // fails this night too, still unsettled -- its most recent reason.
  await writeNightlyReceipt(nightlyReceiptsDir, 'r2.json', { targetDate: '2026-09-18',
    sessions: [
      nightlyRow('sess-existing', 'vcl_eeeeeeeeeeeeeeee', { outcome: 'skipped_existing' }),
      nightlyRow('sess-never', null, { outcome: 'failed', reason: 'voice_conversation_list_nightly_run_failed', verified: null }),
    ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  const bySession = Object.fromEntries(result.receipt.sessions.map(row => [row.session_id, row]));
  assert.equal(bySession['sess-existing'].outcome, 'reconciled');
  assert.equal(bySession['sess-never'], undefined, 'never settled, so never reached the reconcile loop at all');
  assert.deepEqual(result.receipt.not_considered,
    [{ session_id: 'sess-never', reason: 'voice_conversation_list_nightly_run_failed' }]);
});

test('R2: a nightly row missing `date` (a receipt from before that field existed) derives its mail/Linear window from the session_id prefix, not the receipt\'s own target_date', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts');
  const sessionId = '20260910_plaud_cli_of_aaaaa';
  await writeCard(est.derivedRoot, sessionId, 'vcl_dddddddddddddddd', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  await mkdir(nightlyReceiptsDir, { recursive: true });
  // Hand-written, the pre-R2 shape: no `date` field on the session row at
  // all, and the receipt's own target_date (09-19) is nine days later than
  // the session's real day (09-10) -- exactly the gap R2 closes.
  await writeFile(path.join(nightlyReceiptsDir, 'old.json'), JSON.stringify({
    schema_version: NIGHTLY_RECEIPT_SCHEMA, ran_at: '2026-09-19T21:00:00.000Z', target_date: '2026-09-19',
    dry: false, lock: { reclaimed_stale: false, previous_lock: null, previous_lock_age_ms: null },
    plan: { candidates: 1, processed: 1, max_sessions: 50, error: null },
    sessions: [{ session_id: sessionId, title: 't', duration_seconds: 30, outcome: 'ran', reason: null,
      llm_calls: 1, seconds: 1, run_id: 'vcl_dddddddddddddddd', verified: true }],
    totals: { ran: 1, ran_unverified: 0, llm_calls: 0, seconds: 0 } }, null, 2));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir,
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.receipt.plan.dates, ['2026-09-10'], 'the session\'s own day, not the receipt\'s target_date');
  assert.deepEqual(result.receipt.plan.date_derivation, { declared: 0, session_id_prefix: 1, undated: 0 });
  assert.deepEqual(result.receipt.seoul_days, ['2026-09-09', '2026-09-10', '2026-09-11']);
  assert.equal(result.receipt.sessions[0].outcome, 'reconciled');
});

test('a --nightly-receipts directory that does not exist yet plans zero sessions in backlog mode, cleanly, not an error', async () => {
  const est = await estate();
  const nightlyReceiptsDir = path.join(est.controlRoot, 'nightly-receipts-never-written');
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--nightly-receipts', nightlyReceiptsDir, '--dry']);
  assert.equal(result.status, 'DRY');
  assert.equal(result.receipt.plan.mode, 'backlog');
  assert.equal(result.receipt.totals.sessions, 0);
  assert.deepEqual(result.receipt.sessions, []);
  assert.deepEqual(result.receipt.plan.dates, []);
});

test('a session with no card, or an unverified one, is skipped and reported with a reason', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'no-card');
  await writeSessionDir(est.dataRoot, '2026-09-19', 'unverified');
  await writeCard(est.derivedRoot, 'unverified', 'vcl_bbbbbbbbbbbbbbbb', { verified: false });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  const byId = Object.fromEntries(result.receipt.sessions.map(row => [row.session_id, row]));
  assert.equal(byId['no-card'].outcome, 'skipped');
  assert.equal(byId['no-card'].reason, 'no_card');
  assert.equal(byId.unverified.outcome, 'skipped');
  assert.equal(byId.unverified.reason, 'card_not_verified');
});

test('a date folder that simply does not exist yet plans zero sessions, cleanly, not an error', async () => {
  const est = await estate();
  // No writeSessionDir call at all for this date: the whole plaud/sessions
  // tree, or just this one day, may not exist yet -- ordinary, not a failure.
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19', '--dry']);
  assert.equal(result.status, 'DRY');
  assert.equal(result.receipt.totals.sessions, 0);
  assert.deepEqual(result.receipt.sessions, []);
});

test('a wrong --sessions-address (an alias never bound in this root table) fails the whole pass with a code, not sessions=0', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  const dryRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--sessions-address', 'project_work_root/ingress/plaud/sessions', '--dry']);
  assert.equal(dryRun.result.status, 'FAILED');
  assert.equal(dryRun.result.receipt.plan.error, 'voice_card_reconcile_alias_unresolvable');
  assert.deepEqual(dryRun.result.receipt.sessions, []);

  const realRun = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--sessions-address', 'project_work_root/ingress/plaud/sessions', '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(realRun.result.status, 'FAILED');
  assert.equal(realRun.result.receipt.plan.error, 'voice_card_reconcile_alias_unresolvable');
});

test('a wrong --mail-root or --linear-root is recorded as a coverage gap, not a silent "no exceptions" and not a run failure', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--mail-root', 'project_work_root/ingress/mail/gmail', '--linear-root', 'project_work_root/ingress/linear',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK'); // a corroboration source being unreadable does not fail the run
  const gaps = result.receipt.sources.sources_unreadable;
  assert.equal(gaps.length, 2);
  assert.ok(gaps.some(gap => gap.address === 'project_work_root/ingress/mail/gmail'));
  assert.ok(gaps.some(gap => gap.address === 'project_work_root/ingress/linear'));
  for (const gap of gaps) assert.equal(gap.code, 'voice_card_reconcile_alias_unresolvable');
  // Zero exceptions is not the same claim as "every source was actually read".
  assert.deepEqual(result.receipt.exception_review, []);
});

// ---------------------------------------------------------- linear layout
// The 2026-09-18 first real run's own anomaly: `--linear-root` pointed
// straight at a team's own folder (single_team), but the reader used to
// assume only the nested layout (multi_team) and silently found nothing.
test('single_team: --linear-root pointed directly at a team folder (issues/projects live right under it) is still read, not silently zero', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-18', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
  ] });
  // writeLinearProject/writeLinearIssue's own shape already mirrors the real
  // custody file names (object_id + a 64-hex-char content-hash file); here
  // 'sonartech-team-1' is passed as --linear-root directly, one level
  // deeper than the default, matching the real 09-18 invocation exactly.
  await writeLinearProject(est.dataRoot, 'sonartech-team-1', 'proj-1',
    { name: 'P24-049 SAS 처리장치', updated_at: '2026-09-17T00:00:00.000Z' });
  await writeLinearIssue(est.dataRoot, 'sonartech-team-1', 'issue-1',
    { identifier: 'ENG-1', title: '동기화 일정', project_id: 'proj-1', updated_at: '2026-09-18T09:00:00.000Z' });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-18',
    '--linear-root', 'data_root/ingress/linear/sonartech-team-1', '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.sources.linear_layout, 'single_team');
  assert.equal(result.receipt.sources.linear_issues_scanned, 1);
  assert.equal(result.receipt.sources.linear_issues_in_window, 1);
  assert.equal(result.receipt.totals.registered_project_codes_count, 1,
    'the projects/ reader shares readLinearWindow\'s output, so the same fix un-blocks it too');
  assert.deepEqual(result.receipt.sources.sources_unreadable, []);
});

test('multi_team: --linear-root at the parent of team folders is still read exactly as before (regression)', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  await writeLinearProject(est.dataRoot, 'acme', 'proj-1', { name: 'P24-049 SAS', updated_at: '2026-09-01T00:00:00.000Z' });
  await writeLinearIssue(est.dataRoot, 'acme', 'issue-1',
    { identifier: 'ENG-1', title: '동기화 일정', project_id: 'proj-1', updated_at: '2026-09-19T09:00:00.000Z' });
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--linear-root', 'data_root/ingress/linear', '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.sources.linear_layout, 'multi_team');
  assert.equal(result.receipt.sources.linear_issues_scanned, 1);
});

test('empty: no Linear data collected yet under --linear-root is "empty", not a coverage gap', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.sources.linear_layout, 'empty');
  assert.deepEqual(result.receipt.sources.sources_unreadable, []);
});

test('unrecognized: a non-empty --linear-root with no issues/projects folder anywhere under it is a named coverage gap, not silent 0', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  // Real entries exist under linearRoot (comments/, labels/, ...), but none
  // of them -- nor linearRoot itself -- is an issues/projects custody folder.
  await mkdir(path.join(est.dataRoot, 'ingress', 'linear', 'sonartech-team-1', 'comments', 'c1'), { recursive: true });
  await writeFile(path.join(est.dataRoot, 'ingress', 'linear', 'sonartech-team-1', 'comments', 'c1', `${'2'.repeat(64)}.json`),
    JSON.stringify({ object_id: 'c1', object: { body: 'x' } }));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--linear-root', 'data_root/ingress/linear/sonartech-team-1', '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK'); // a coverage gap does not fail the run
  assert.equal(result.receipt.sources.linear_layout, 'unrecognized');
  assert.equal(result.receipt.sources.linear_issues_scanned, 0);
  const gaps = result.receipt.sources.sources_unreadable;
  assert.ok(gaps.some(gap => gap.address === 'data_root/ingress/linear/sonartech-team-1'
    && gap.code === 'linear_layout_unrecognized'));
});

// -------------------------------------------------------------------- lock
test('a held lock stops a second real run and is reported', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  await mkdir(est.receiptsDir, { recursive: true });
  await writeFile(path.join(est.receiptsDir, 'reconcile.lock'),
    JSON.stringify({ pid: 999999, started_at: '2026-09-20T17:59:00.000Z' }));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'LOCK_HELD');
});

test('a stale lock is reclaimed rather than blocking the run, and the reclaim is recorded in the receipt', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  await mkdir(est.receiptsDir, { recursive: true });
  await writeFile(path.join(est.receiptsDir, 'reconcile.lock'),
    JSON.stringify({ pid: 999999, started_at: '2026-09-20T10:00:00.000Z' }));
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.lock.reclaimed_stale, true);
  assert.equal(result.receipt.lock.previous_lock.pid, 999999);
  assert.equal(result.receipt.lock.previous_lock_age_ms, 8 * 60 * 60 * 1000);
});

test('a fresh (non-reclaimed) lock is recorded in the receipt as not reclaimed', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa');
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z']);
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.lock.reclaimed_stale, false);
  assert.equal(result.receipt.lock.previous_lock, null);
});

// ---------------------------------------------------------------------- now
test('an unparseable --now, or one containing a path separator, is refused', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  const base = ['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19'];
  await assert.rejects(() => runReconcileCli([...base, '--now', 'not-a-real-instant']));
  await assert.rejects(() => runReconcileCli([...base, '--now', '2026-09-20T18:00:00.000Z/../evil']));
  await assert.rejects(() => runReconcileCli([...base, '--now', '2026\\09\\20']));
});

// --------------------------------------------------------------------- log
test('an injected log callback receives every line, in the same order, as the returned lines', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
    segment({ segment_id: 'c002', nature: 'idea', title: '아이디어', description: '' }),
  ] });
  const streamed = [];
  const { result, lines } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z'], { log: line => streamed.push(line) });
  assert.equal(result.status, 'OK');
  assert.ok(lines.length > 0);
  assert.deepEqual(streamed, lines);
});

// -------------------------------------------------------- confirm mid-loop
test('a human confirm landing between two segments is caught by the write-time re-check: skipped_confirmed_at_write, not a crash, row stays confirmed', async () => {
  const est = await estate();
  await writeSessionDir(est.dataRoot, '2026-09-19', 'sess1');
  await writeCard(est.derivedRoot, 'sess1', 'vcl_aaaaaaaaaaaaaaaa', { segments: [
    segment({ segment_id: 'c001',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [1] }] }),
    segment({ segment_id: 'c002', title: '두 번째 구간', description: '',
      project_candidates: [{ project_code: 'P24-049', strength: 'strong', basis: ['key_terms'], evidence_row_ids: [2] }] }),
  ] });
  const routesDir = path.join(est.controlRoot, 'voice-routes');
  let fired = false;
  // Simulates a person confirming c002 in the moment reconcile has just
  // finished c001 but has not yet reached c002 -- the exact race the
  // write-time re-check (and applySegmentDecision's own lock, as a backstop)
  // exists for. `confirm` is synchronous, so the ledger file is updated on
  // disk before this callback returns control to the loop.
  const hookLog = line => {
    if (!fired && line.includes(' c001 ')) {
      fired = true;
      runVoiceRouteCli(['confirm', '--routes-dir', routesDir, '--session', 'sess1', '--segment', 'c002',
        '--project', 'P24-049', '--basis', '사람이 회의에서 직접 확인함', '--title', '두 번째 구간(사람 확인)',
        '--nature', 'project_work', '--quality', 'independent_fast', '--by', 'actor:owner',
        '--now', '2026-09-20T17:59:59.000Z']);
    }
  };
  const { result } = await runReconcileCli(['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
    '--tools-config', est.toolsPath, '--receipts', est.receiptsDir, '--date', '2026-09-19',
    '--now', '2026-09-20T18:00:00.000Z'], { log: hookLog });
  assert.equal(fired, true, 'the hook actually fired');
  assert.equal(result.status, 'OK'); // a race caught cleanly is not a run failure
  const c001Row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c001');
  const c002Row = result.receipt.sessions[0].segments.find(item => item.segment_id === 'c002');
  assert.equal(c001Row.ledger_write, 'set');
  assert.equal(c002Row.ledger_write, 'skipped_confirmed_at_write');
  assert.equal(result.receipt.totals.confirmed_at_write, 1);
  const ledger = readLedgerFile(routesDir, 'sess1').ledger;
  const ledgerC002 = ledger.segments.find(item => item.segment_id === 'c002');
  assert.equal(ledgerC002.status, 'confirmed');
  assert.equal(ledgerC002.confirmed_by, 'actor:owner');
  assert.equal(ledgerC002.title, '두 번째 구간(사람 확인)'); // the human's write, untouched
});
