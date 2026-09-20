// Integration tests for `harness/voice_question_cli.mjs`: synthetic
// fixtures only, no real state root, no model call.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { QUESTION_LEDGER_SCHEMA, readQuestionLedger, runVoiceQuestionCli } from '../harness/voice_question_cli.mjs';
import { readLedgerFile } from '../harness/voice_route_cli.mjs';
import { VOICE_ROUTE_LEDGER_SCHEMA } from '../harness/voice_routes.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readRootTable } from '../../path_registry/src/root_table.mjs';

const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256 = bytes => `sha256:${hex(bytes)}`;
const RECONCILE_SCHEMA = 'soulforge.voice_card_reconcile_receipt.v2';

async function estate() {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vqc-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vqc-control-')));
  const receiptsDir = path.join(controlRoot, 'reconcile-receipts');
  await mkdir(receiptsDir, { recursive: true });
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const tableSha256 = sha256(await readFile(tablePath));
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts_root'), derived_root: path.join(controlRoot, 'derived') }));
  const io = createAliasedStoreIo(readRootTable({ tablePath, expectedSha256: tableSha256 }));
  return { dataRoot, controlRoot, receiptsDir, tablePath, tableSha256, toolsPath, io };
}

const exceptionRow = (overrides = {}) => ({ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa', segment_id: 'c001',
  title: '구간 c001', clock: '2026-09-19T09:00:00+09:00', candidates: ['P24-049'], risk_markers: [],
  why: 'important_and_unresolved', modality: null, content_mismatches: [], receipt_ran_at: '2026-09-20T18:00:00.000Z',
  ...overrides });

async function writeReconcileReceipt(receiptsDir, name, { sessionId = 'sess1', runId = 'vcl_aaaaaaaaaaaaaaaa',
  ranAt = '2026-09-20T18:00:00.000Z', exceptions } = {}) {
  await writeFile(path.join(receiptsDir, name), JSON.stringify({
    schema_version: RECONCILE_SCHEMA, ran_at: ranAt, target_date: '2026-09-19',
    sessions: [{ session_id: sessionId, run_id: runId, outcome: 'reconciled', reason: null, segments: [] }],
    exception_review: exceptions ?? [exceptionRow({ receipt_ran_at: ranAt })], totals: {}, status: 'OK' }, null, 2));
}

async function writeLedgerRow(controlRoot, sessionId, segmentId, { candidates = [{ project_code: 'P24-049',
  evidence_refs: [], basis: 'reconcile:v1 classification=exception' }], status = 'candidate' } = {}) {
  await mkdir(path.join(controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(controlRoot, 'voice-routes', `${sessionId}.json`), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: sessionId, updated_at: '2026-09-19T21:00:00.000Z',
    segments: [{ segment_id: segmentId, source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: '구간', description: null, derived_summary: true, nature: 'project_work', project_candidates: candidates,
      status, quality: { transcript: 'independent_fast', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:context-engine:voice-card-reconcile-v0', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
}

const common = est => ['--root-table', est.tablePath, '--root-table-sha256', est.tableSha256,
  '--tools-config', est.toolsPath, '--receipts', est.receiptsDir];

test('present writes markdown and updates the question ledger; a second present the next day does not re-add an already-answered question', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(p1.result.status, 'OK');
  assert.match(p1.result.markdown, /어제 애매한 것 1건/u);
  assert.match(p1.result.markdown, /질문 귀속/u);
  assert.match(p1.result.markdown, /\[q:q_/u);
  const ledger = readQuestionLedger(est.io);
  assert.equal(ledger.schema_version, QUESTION_LEDGER_SCHEMA);
  assert.equal(ledger.questions.length, 1);
  assert.equal(ledger.questions[0].status, 'presented');

  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');

  const p2 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-21T20:00:00.000Z']);
  assert.equal(p2.result.receipt.presented.length, 0);
  assert.equal(p2.result.receipt.resolved_by_reuse.length, 1);
  assert.match(p2.result.markdown, /없음/u);
});

test('--dry present writes nothing to the ledger or receipts, but still returns the markdown a real run would', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const dry = await runVoiceQuestionCli(['present', ...common(est), '--dry', '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(dry.result.status, 'OK');
  assert.equal(dry.result.receipt.dry, true);
  assert.match(dry.result.markdown, /질문 귀속/u);
  const ledger = readQuestionLedger(est.io);
  assert.equal(ledger.questions.length, 0, 'a dry present never writes the ledger');
  const files = await readdir(est.receiptsDir);
  assert.equal(files.filter(name => name.startsWith('q')).length, 0, 'a dry present writes no receipt either');
});

test('zero exceptions renders a bare "없음" line', async () => {
  const est = await estate();
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(p1.result.markdown, '없음');
});

test('an answer confirms the project for every target through the existing voice_route_cli writer, never a route write this file makes itself', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const row = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'confirmed');
  assert.equal(row.confirmed_by, 'actor:owner:someone');
  assert.equal(row.project_candidates[0].project_code, 'P24-049');
});

test('re-delivering the same answer to the same question is idempotent: no duplicate confirm, reported already_answered', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const first = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(first.result.receipt.already_answered, undefined);
  const second = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:10:00.000Z']);
  assert.equal(second.result.status, 'OK');
  assert.equal(second.result.receipt.already_answered, true);
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').confirmed_at, '2026-09-20T20:05:00.000Z',
    'the second delivery never re-confirmed (the timestamp is still the first answer\'s)');
});

test('CE-34: a target whose run_id has changed since the question was proposed is refused (question_targets_stale) and the question is withdrawn', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { runId: 'vcl_aaaaaaaaaaaaaaaa' });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  // The session was re-transcribed: a newer receipt (a genuinely later
  // ran_at, S9) reports a different run_id.
  await writeReconcileReceipt(est.receiptsDir, '20260921090000.json',
    { runId: 'vcl_bbbbbbbbbbbbbbbb', ranAt: '2026-09-21T09:00:00.000Z' });
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-21T09:05:00.000Z']);
  assert.equal(answer.result.status, 'FAILED');
  assert.equal(answer.result.receipt.error, 'question_targets_stale');
  const ledger = readQuestionLedger(est.io);
  assert.equal(ledger.questions.find(question => question.question_id === questionId).status, 'withdrawn');
  assert.equal(ledger.questions.find(question => question.question_id === questionId).withdrawn_reason,
    'question_targets_stale');
});

test('a machine actor (the reconcile actor, or an actor:context-engine:/bot:/machine: prefix) is refused, never answers', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  for (const by of ['actor:context-engine:voice-card-reconcile-v0', 'actor:bot:something', 'actor:machine:x']) {
    await assert.rejects(() => runVoiceQuestionCli(['answer', ...common(est), '--question', questionId,
      '--choice', 'P24-049', '--by', by, '--now', '2026-09-20T20:05:00.000Z']), /voice_question_actor_required/u);
  }
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate', 'never written');
});

test('a partial failure (one target confirms, another target does not exist to confirm) records per-target outcome and leaves the question presented, never answered', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ segment_id: 'c001' }), exceptionRow({ segment_id: 'c002' })] });
  // Only c001 has a ledger row with a real interval; c002 does not exist at
  // all, so `confirm` for it fails with an interval error.
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(p1.result.receipt.presented.length, 1);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'FAILED');
  assert.equal(answer.result.receipt.per_target.length, 2);
  assert.equal(answer.result.receipt.per_target.find(row => row.segment_id === 'c001').ok, true);
  assert.equal(answer.result.receipt.per_target.find(row => row.segment_id === 'c002').ok, false);
  const ledger = readQuestionLedger(est.io);
  const question = ledger.questions.find(item => item.question_id === questionId);
  assert.equal(question.status, 'presented');
  assert.ok(question.partial !== null, 'a partial note, not answered');
});

test('a not_work answer clears every offered candidate from the segment via set --drop-project, never confirm', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'not_work',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const row = ledger.segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'unclassified');
  assert.deepEqual(row.project_candidates, []);
});

test('a "none" answer records the ledger as answered with no route write at all', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'none',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate', 'untouched');
  const questionLedger = readQuestionLedger(est.io);
  assert.equal(questionLedger.questions.find(item => item.question_id === questionId).status, 'answered');
});

test('a content/split/modality question is ledger-only when answered -- no route write for any choice', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ why: 'content_mismatch' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'confirm_content',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const ledger = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  assert.equal(ledger.segments.find(item => item.segment_id === 'c001').status, 'candidate', 'never confirmed by a content answer');
});

test('an unknown question id is refused', async () => {
  const est = await estate();
  await assert.rejects(() => runVoiceQuestionCli(['answer', ...common(est), '--question', 'q_doesnotexist',
    '--choice', 'none', '--by', 'actor:owner:someone', '--now', '2026-09-20T20:00:00.000Z']), /voice_question_not_found/u);
});

// ------------------------------------------------------------- R1 (fresh review of 4d80006d)
test('R1: confirm via answer leaves an existing title/nature/quality exactly as they were', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001'); // title '구간', nature project_work, quality independent_fast
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  const row = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(row.title, '구간', 'title untouched, never overwritten by a generic confirm');
  assert.equal(row.nature, 'project_work');
  assert.equal(row.quality.transcript, 'independent_fast');
});

test('R1: confirm via answer fills a missing title/nature/quality only enough to satisfy confirm, using the question\'s own representative title', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  // No pre-existing ledger row at all -- confirm must fill title/nature/quality from scratch.
  await mkdir(path.join(est.controlRoot, 'voice-routes'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    schema_version: VOICE_ROUTE_LEDGER_SCHEMA, session_id: 'sess1', updated_at: null,
    segments: [{ segment_id: 'c001', source_segment_ids: [1, 2], start_seconds: 0, end_seconds: 30,
      title: null, description: null, derived_summary: true, nature: 'undetermined', project_candidates: [],
      status: 'candidate', quality: { transcript: 'unknown', correction_state: 'none' },
      transcript_ref: null, audio_ref: null, related_segment_ids: [], draft_source: null,
      judged_by: 'actor:context-engine:voice-card-reconcile-v0', judged_at: '2026-09-19T21:00:00.000Z',
      confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const row = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(row.title, '구간 c001', 'filled from the question\'s own representative title, never a fabricated one');
  assert.equal(row.nature, 'project_work');
  assert.equal(row.quality.transcript, 'independent_fast');
});

// ------------------------------------------------------------- R3 (stale lock reclaim)
test('R3: a stale questions.lock (older than QUESTION_LEDGER_STALE_LOCK_MS) is reclaimed, not left blocking forever', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await mkdir(path.join(est.controlRoot, 'voice-questions'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-questions', 'questions.lock'),
    JSON.stringify({ pid: 999999, started_at: '2026-09-20T10:00:00.000Z' }));
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(p1.result.status, 'OK', 'a lock 10 hours old is reclaimed rather than refused');
  assert.equal(p1.result.receipt.lock?.reclaimed_stale, true);
  assert.equal(p1.result.receipt.lock?.previous_lock.pid, 999999);
});

test('R3: a fresh questions.lock (younger than QUESTION_LEDGER_STALE_LOCK_MS) still blocks a write', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await mkdir(path.join(est.controlRoot, 'voice-questions'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-questions', 'questions.lock'),
    JSON.stringify({ pid: 999999, started_at: '2026-09-20T19:55:00.000Z' }));
  await assert.rejects(() => runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']),
    /voice_question_ledger_locked/u);
});

// ------------------------------------------------------------- S4 (partial preserved across present)
test('S4: a partial-failure record on a presented question survives the next present (not wiped to null)', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ segment_id: 'c001' }), exceptionRow({ segment_id: 'c002' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001'); // c002 has no row -> its confirm fails
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'FAILED');
  // A second present the next day re-derives the same still-unanswered question.
  const p2 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-21T20:00:00.000Z']);
  assert.equal(p2.result.receipt.presented[0], questionId, 'same group, same id, re-presented (not answered)');
  const ledger = readQuestionLedger(est.io);
  const question = ledger.questions.find(item => item.question_id === questionId);
  assert.ok(question.partial !== null, 'the partial-failure record from the first answer attempt is preserved');
  assert.equal(question.partial.per_target.find(row => row.segment_id === 'c001').ok, true);
});

// ------------------------------------------------------------- S5 (retry skips already-ok targets)
test('S5: retrying the same choice after a partial failure only re-applies the target that failed, skipping the one that already succeeded', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ segment_id: 'c001' }), exceptionRow({ segment_id: 'c002' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const first = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(first.result.status, 'FAILED');
  const afterFirst = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger;
  const firstConfirmedAt = afterFirst.segments.find(item => item.segment_id === 'c001').confirmed_at;
  // Fix c002 so a retry of the same choice can succeed this time --
  // `writeLedgerRow` replaces the whole file, so c001's already-confirmed
  // row is added back alongside the new c002 row rather than lost.
  await writeFile(path.join(est.controlRoot, 'voice-routes', 'sess1.json'), JSON.stringify({
    ...afterFirst, segments: [...afterFirst.segments, { segment_id: 'c002', source_segment_ids: [1, 2],
      start_seconds: 0, end_seconds: 30, title: '구간', description: null, derived_summary: true,
      nature: 'project_work', project_candidates: [{ project_code: 'P24-049', evidence_refs: [],
        basis: 'reconcile:v1 classification=exception' }], status: 'candidate',
      quality: { transcript: 'independent_fast', correction_state: 'none' }, transcript_ref: null, audio_ref: null,
      related_segment_ids: [], draft_source: null, judged_by: 'actor:context-engine:voice-card-reconcile-v0',
      judged_at: '2026-09-19T21:00:00.000Z', confirmed_by: null, confirmed_at: null, withdrawn: [] }] }, null, 2));
  const second = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:10:00.000Z']);
  assert.equal(second.result.status, 'OK');
  const c001Row = second.result.receipt.per_target.find(row => row.segment_id === 'c001');
  assert.equal(c001Row.skipped, true, 'c001 already succeeded last time, so it is skipped, not re-confirmed');
  const c001AfterRetry = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(c001AfterRetry.confirmed_at, firstConfirmedAt, 'c001 was never re-confirmed (timestamp unchanged)');
});

// ------------------------------------------------------------- S6 (choice validated against kind/options)
test('S6: a choice shape that is valid in general but wrong for this question\'s kind is refused before any write', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ why: 'content_mismatch' })] }); // kind 내용확인: only confirm_content/none
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  await assert.rejects(() => runVoiceQuestionCli(['answer', ...common(est), '--question', questionId,
    '--choice', 'split', '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']),
    /voice_question_choice_invalid/u);
  const row = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'candidate', 'refused before any write');
});

test('S6: 분할 accepts split/keep', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ why: 'needs_split' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'keep',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
});

test('S6: other:<code> is refused as question_project_unregistered when the receipts never offered that code anywhere', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  await assert.rejects(() => runVoiceQuestionCli(['answer', ...common(est), '--question', questionId,
    '--choice', 'other:P99-999', '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']),
    /voice_question_project_unregistered/u);
});

test('S6: other:<code> is accepted when that code was offered as a candidate somewhere in the receipts', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ segment_id: 'c001', candidates: ['P24-049'] }),
    exceptionRow({ segment_id: 'c002', session_id: 'sess2', candidates: ['P26-014'] })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented.find(id => {
    const q = readQuestionLedger(est.io).questions.find(item => item.question_id === id);
    return q.targets[0].session_id === 'sess1';
  });
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'other:P26-014',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK', 'P26-014 was offered on a different segment, so it is a registered code');
});

// ------------------------------------------------------------- S7 (ledger bound + archival)
test('S7: an over-bound ledger archives 90+ day old answered rows to a same-day archive file, keeping the live file under bound', async () => {
  const est = await estate();
  // Exactly MAX_QUESTIONS (20000) old answered rows -- readable as-is (the
  // read guard only refuses *over* bound), but merging in one freshly
  // presented question pushes the write to 20001, over bound, which must
  // trigger archival rather than either refusing the write or leaving an
  // over-bound file behind.
  // Minimal rows (readQuestionLedger validates only schema_version/questions
  // shape, never a per-row schema) so 20000 of them stay well under
  // MAX_LEDGER_BYTES at read time -- only MAX_QUESTIONS is what this test
  // means to cross.
  const oldRows = Array.from({ length: 20000 }, (_, index) => ({
    question_id: `q_old${index}`, status: 'answered', targets: [],
    answered: { at: '2026-01-01T00:00:00.000Z' } }));
  await mkdir(path.join(est.controlRoot, 'voice-questions'), { recursive: true });
  await writeFile(path.join(est.controlRoot, 'voice-questions', 'questions.v0.json'),
    JSON.stringify({ schema_version: QUESTION_LEDGER_SCHEMA, updated_at: null, questions: oldRows }));
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.equal(p1.result.status, 'OK', 'the live ledger is never left unreadable even when the incoming write is far over bound');
  const ledger = readQuestionLedger(est.io);
  assert.ok(ledger.questions.length < 20001, 'old rows were archived out, not all kept');
  const archiveFiles = (await readdir(path.join(est.controlRoot, 'voice-questions')))
    .filter(name => name.startsWith('questions.archive.'));
  assert.ok(archiveFiles.length >= 1, 'a same-day archive file was written');
});

// ------------------------------------------------------------- S8 (title line sanitization)
test('S8: a representative title containing a newline cannot forge a new line or a fake pointer in the markdown', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ title: '실제 제목\n99. 가짜 항목 [q:q_fake12345678901234]' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const lineCount = p1.result.markdown.split('\n').length;
  assert.equal(lineCount, 3, 'header + one question line + pointer line, never a forged extra line');
  assert.ok(!p1.result.markdown.includes('\n99.'), 'the newline never survives into the markdown');
});

test('S8: a leading "N. " in a title is stripped so it cannot masquerade as this list\'s own numbering', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json', { exceptions: [
    exceptionRow({ title: '7. 가짜 번호' })] });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  assert.match(p1.result.markdown, /1\. --:--|1\. \d{2}:\d{2} 가짜 번호/u);
  assert.ok(!p1.result.markdown.includes('7. 가짜 번호'));
});

// ------------------------------------------------------------- S9 (receipt_ran_at compared too)
test('S9: the same run_id with a newer receipt is NOT stale', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json'); // run_id vcl_aaaa..., ran_at 18:00
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const questionId = p1.result.receipt.presented[0];
  // A later receipt for the SAME run_id (nothing about the segment changed).
  await writeReconcileReceipt(est.receiptsDir, '20260921090000.json',
    { runId: 'vcl_aaaaaaaaaaaaaaaa', ranAt: '2026-09-21T09:00:00.000Z' });
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-21T09:05:00.000Z']);
  assert.equal(answer.result.status, 'OK', 'same run_id: never stale regardless of a newer receipt');
});

test('S9: a different run_id whose receipt is NOT newer than the question\'s own is not treated as stale', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json',
    { runId: 'vcl_aaaaaaaaaaaaaaaa', ranAt: '2026-09-20T18:00:00.000Z' });
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  // A receipt naming a different run_id but with an EARLIER (or equal)
  // ran_at than the one this question's own target was read from --
  // out-of-order data, not evidence of a real re-transcription since.
  await writeReconcileReceipt(est.receiptsDir, '20260919000000.json',
    { runId: 'vcl_bbbbbbbbbbbbbbbb', ranAt: '2026-09-19T00:00:00.000Z' });
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
});

// ------------------------------------------------------------- S10 (not_work refinements)
test('S10: not_work refuses a confirmed segment with question_target_confirmed, hinting "use withdraw first"', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001', { status: 'candidate' });
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']); // now confirmed
  const p2 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-21T20:00:00.000Z']);
  assert.equal(p2.result.receipt.presented.length + p2.result.receipt.resolved_by_reuse.length, 1);
  // Force a fresh not_work question over the now-confirmed segment by
  // presenting a new exception group directly against the ledger.
  const ledger = readQuestionLedger(est.io);
  const answeredId = ledger.questions.find(item => item.status === 'answered').question_id;
  const forcedLedger = { schema_version: QUESTION_LEDGER_SCHEMA, updated_at: null, questions: [
    { question_id: 'q_forced0000000000000', kind: '귀속', targets: [{ session_id: 'sess1', run_id: 'vcl_aaaaaaaaaaaaaaaa',
      segment_id: 'c001', receipt_ran_at: '2026-09-20T18:00:00.000Z' }], options: ['P24-049', '다른 과제', '업무 아님'],
      representative: { time: '09:00', title: '구간' }, status: 'presented', first_seen: '2026-09-20T20:00:00.000Z',
      presented_on: ['2026-09-20'], answered: null, reopened_from: answeredId, withdrawn_reason: null, partial: null }] };
  await writeFile(path.join(est.controlRoot, 'voice-questions', 'questions.v0.json'), JSON.stringify(forcedLedger));
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', 'q_forced0000000000000',
    '--choice', 'not_work', '--by', 'actor:owner:someone', '--now', '2026-09-21T20:05:00.000Z']);
  assert.equal(answer.result.status, 'FAILED');
  assert.equal(answer.result.receipt.per_target[0].error, 'voice_question_target_confirmed');
  assert.equal(answer.result.receipt.per_target[0].hint, 'use withdraw first');
});

test('S10: not_work drops only machine-written candidates, never a human-named one, and reads the current ledger row', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001', { candidates: [
    { project_code: 'P24-049', evidence_refs: [], basis: 'reconcile:v1 classification=exception' },
    { project_code: 'P26-014', evidence_refs: [], basis: '사람이 직접 확인함' }] });
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const answer = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'not_work',
    '--by', 'actor:owner:someone', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(answer.result.status, 'OK');
  const row = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.deepEqual(row.project_candidates.map(candidate => candidate.project_code), ['P26-014'],
    'the human-named P26-014 candidate survives; only the machine-written P24-049 one was dropped');
});

// ------------------------------------------------------------- Nits
test('nit: --cap 0 and negative cap are both refused, not treated as "present nothing"', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await assert.rejects(() => runVoiceQuestionCli(['present', ...common(est), '--cap', '0',
    '--now', '2026-09-20T20:00:00.000Z']), /voice_question_cap_invalid/u);
  await assert.rejects(() => runVoiceQuestionCli(['present', ...common(est), '--cap', '-1',
    '--now', '2026-09-20T20:00:00.000Z']), /voice_question_cap_invalid/u);
});

test('nit: answer --dry reports would_apply per target, never a fake ok:true', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  const p1 = await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const questionId = p1.result.receipt.presented[0];
  const dry = await runVoiceQuestionCli(['answer', ...common(est), '--question', questionId, '--choice', 'P24-049',
    '--by', 'actor:owner:someone', '--dry', '--now', '2026-09-20T20:05:00.000Z']);
  assert.equal(dry.result.receipt.per_target[0].would_apply, true);
  assert.equal(dry.result.receipt.per_target[0].ok, undefined, 'never a fake ok field in a dry preview');
  const row = readLedgerFile(path.join(est.controlRoot, 'voice-routes'), 'sess1').ledger
    .segments.find(item => item.segment_id === 'c001');
  assert.equal(row.status, 'candidate', 'a dry answer never actually writes');
});

test('nit: two present receipts written at the exact same instant never overwrite each other', async () => {
  const est = await estate();
  await writeReconcileReceipt(est.receiptsDir, '20260920180000.json');
  await writeLedgerRow(est.controlRoot, 'sess1', 'c001');
  await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  await runVoiceQuestionCli(['present', ...common(est), '--now', '2026-09-20T20:00:00.000Z']);
  const files = (await readdir(est.receiptsDir)).filter(name => name.startsWith('q2026'));
  assert.equal(files.length, 2, 'both receipts exist, one disambiguated with a -2 suffix');
});
