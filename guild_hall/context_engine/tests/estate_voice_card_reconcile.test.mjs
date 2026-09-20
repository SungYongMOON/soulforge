// Integration tests for `harness/estate_voice_card_reconcile.mjs`: synthetic
// fixtures only, no real state root, no model call (this slice never opens one).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import {
  RECONCILE_RECEIPT_SCHEMA, aliasTermsByCode, corroborationFor, runReconcile, runReconcileCli,
} from '../harness/estate_voice_card_reconcile.mjs';
import { readLedgerFile } from '../harness/voice_route_cli.mjs';
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
  assert.match(row.project_candidates[0].basis, /^reconcile:v0 classification=provisional/u);
  const receiptFiles = (await readdir(est.receiptsDir)).filter(name => name !== 'reconcile.lock');
  assert.equal(receiptFiles.length, 1);
  const receipt = JSON.parse(await readFile(path.join(est.receiptsDir, receiptFiles[0]), 'utf8'));
  assert.equal(receipt.schema_version, RECONCILE_RECEIPT_SCHEMA);
  assert.equal(receipt.totals.provisional, 1);
});

test('mail and Linear corroboration turn a weak candidate provisional and write refs, never body text', async () => {
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
  assert.equal(row.status, 'candidate');
  assert.ok(row.project_candidates[0].evidence_refs.includes('mail:evt-1'));
  assert.match(row.project_candidates[0].basis, /corroborated=true/u);
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
      confirmed_by: 'actor:owner:someone', confirmed_at: '2026-09-19T21:00:00.000Z' }] }, null, 2));
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
      confirmed_by: 'actor:owner:someone', confirmed_at: '2026-09-19T21:00:00.000Z' }] }, null, 2));
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
      confirmed_by: null, confirmed_at: null }] }, null, 2));
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
