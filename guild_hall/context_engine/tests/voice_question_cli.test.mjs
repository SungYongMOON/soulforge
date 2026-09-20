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
  exceptions = [exceptionRow()] } = {}) {
  await writeFile(path.join(receiptsDir, name), JSON.stringify({
    schema_version: RECONCILE_SCHEMA, ran_at: '2026-09-20T18:00:00.000Z', target_date: '2026-09-19',
    sessions: [{ session_id: sessionId, run_id: runId, outcome: 'reconciled', reason: null, segments: [] }],
    exception_review: exceptions, totals: {}, status: 'OK' }, null, 2));
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
  // The session was re-transcribed: a newer receipt reports a different run_id.
  await writeReconcileReceipt(est.receiptsDir, '20260921090000.json', { runId: 'vcl_bbbbbbbbbbbbbbbb' });
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
