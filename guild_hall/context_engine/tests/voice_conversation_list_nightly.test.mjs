// The nightly voice conversation-list lane: what it plans, what it skips, and
// what a lock and a `--dry` run do and do not write.
//
// The per-session pipeline is never called here -- every test that reaches the
// "run" branch injects its own `runSession`, so no test in this file can call a
// model. Every root is a fresh temp directory.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA, readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import {
  BACKLOG_WINDOW_DAYS, MIN_TRANSCRIPT_SECONDS, NIGHTLY_RECEIPT_SCHEMA, STALE_LOCK_MS,
  acquireLock, buildSessionPlan, classifySession, defaultTargetDate, nextDeadlineInstant, releaseLock, runNightly,
  staleReasonFor, runNightlyCli, seoulDateFor, shiftDate,
} from '../harness/voice_conversation_list_nightly.mjs';

const PROMPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'voice_conversation_list');
const SESSIONS_ADDRESS = 'data_root/ingress/plaud/sessions';
const hex = bytes => createHash('sha256').update(bytes).digest('hex');

/** One estate: a data root for sessions, a control root for its config files. */
async function estate() {
  const dataRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcln-data-')));
  const controlRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcln-control-')));
  const derivedRoot = realpathSync(await mkdtemp(path.join(os.tmpdir(), 'vcln-derived-')));
  const receiptsDir = path.join(controlRoot, 'receipts');
  const tablePath = path.join(controlRoot, 'root_table.json');
  await writeFile(tablePath, `${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  const toolsPath = path.join(controlRoot, 'tools.v0.json');
  await writeFile(toolsPath, JSON.stringify({ schema: 'soulforge.context_read_tools.v0',
    interpreter_path: path.join(controlRoot, 'python.exe'), soffice_path: path.join(controlRoot, 'soffice.exe'),
    python_packages: {}, formats: {}, max_attachment_bytes: 1024 * 1024,
    receipts_root: path.join(controlRoot, 'receipts_root'), derived_root: derivedRoot }));
  const configPath = path.join(controlRoot, 'voice_pipeline.v0.json');
  await writeFile(configPath, JSON.stringify({ schema: 'soulforge.voice_conversation_pipeline.v0',
    model: { host: 'http://127.0.0.1:18080', model: 'test-model', transport: 'openai_chat', think: false,
      options: { temperature: 0, seed: 7, num_predict: 512 }, timeout_ms: 120000 },
    prompts_dir: PROMPTS, limits: { llm_calls: 60 } }));
  return { dataRoot, controlRoot, derivedRoot, receiptsDir, tablePath, toolsPath, configPath };
}

async function ioAndToolsFor(est) {
  const rootTable = readRootTable({ tablePath: est.tablePath,
    expectedSha256: `sha256:${hex(await readFile(est.tablePath))}` });
  const io = createAliasedStoreIo(rootTable);
  const tools = readToolsConfig(await readFile(est.toolsPath));
  return { io, tools };
}

async function writeSession(dataRoot, date, sessionId,
  { title = '테스트 세션', durationSeconds = 40, transcriptStatus = 'completed' } = {}) {
  const dir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', date, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'session_manifest.json'), JSON.stringify({
    schema_version: 'soulforge.voice_capture_session.v0', session_id: sessionId, source: 'plaud_cli_import',
    source_page_title: title, recorded_at_local: `${date}T09:00:00+09:00`, duration_seconds: durationSeconds,
    independent_transcription: transcriptStatus === null ? undefined
      : { status: transcriptStatus, run_id: 'whispercpp_test_v1' } }));
}

/** A session directory whose manifest cannot be read at all: broken JSON. */
async function writeMalformedSession(dataRoot, date, sessionId) {
  const dir = path.join(dataRoot, 'ingress', 'plaud', 'sessions', date, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'session_manifest.json'), '{ not json');
}

/** Replaces the target date's own directory entry with a plain file. */
async function makeDateEntryAFile(dataRoot, date) {
  const parent = path.join(dataRoot, 'ingress', 'plaud', 'sessions');
  await mkdir(parent, { recursive: true });
  await writeFile(path.join(parent, date), 'not a directory');
}

// The manifest defaults match what `writeSession`'s own default declares
// (`independent_transcription.run_id: 'whispercpp_test_v1'`) and what
// `DUMMY_PIPELINE` below computes (`configSha256: 'deadbeef'`, empty
// `promptDigests`), so every existing "skipped_existing" test stays fresh by
// default; the new staleness tests override one field at a time.
async function writeExistingRun(derivedRoot, sessionId,
  { runId = 'vcl_aaaaaaaaaaaaaaaa', verified = true, generatedAt = '2026-01-01T00:00:00.000Z',
    transcriptRunId = 'whispercpp_test_v1', configSha256 = 'deadbeef', prompts = {} } = {}) {
  const dir = path.join(derivedRoot, 'voice', sessionId, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'conversation_list.v0.json'),
    JSON.stringify({ generated_at: generatedAt, verified, session_id: sessionId, run_id: runId }));
  await writeFile(path.join(dir, 'run_manifest.json'), JSON.stringify({
    transcript: { run_id: transcriptRunId }, config_sha256: `sha256:${configSha256}`, prompts }));
  return runId;
}

// ------------------------------------------------------------------- dates
test('seoulDateFor and shiftDate move by whole calendar days', () => {
  assert.equal(seoulDateFor('2026-09-20T14:30:00.000Z'), '2026-09-20');
  assert.equal(seoulDateFor('2026-09-20T15:30:00.000Z'), '2026-09-21');
  assert.equal(shiftDate('2026-09-20', -1), '2026-09-19');
  assert.equal(shiftDate('2026-09-20', -7), '2026-09-13');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(defaultTargetDate('2026-09-20T15:30:00.000Z'), '2026-09-20');
  assert.equal(defaultTargetDate('2026-09-20T14:30:00.000Z'), '2026-09-19');
});

// -------------------------------------------------------------------- plan
test('buildSessionPlan: target date first, then the backlog window oldest first, deduped', async () => {
  const est = await estate();
  const { io } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_target_b');
  await writeSession(est.dataRoot, target, 'S_target_a');
  await writeSession(est.dataRoot, shiftDate(target, -2), 'S_backlog_recent');
  await writeSession(est.dataRoot, shiftDate(target, -5), 'S_backlog_old');
  // Outside the backlog window: must never appear.
  await writeSession(est.dataRoot, shiftDate(target, -(BACKLOG_WINDOW_DAYS + 3)), 'S_too_old');
  // Same session id already seen on the target date: must not appear twice.
  await writeSession(est.dataRoot, shiftDate(target, -1), 'S_target_a');

  const plan = buildSessionPlan({ io, sessionsAddress: SESSIONS_ADDRESS, targetDate: target });
  assert.deepEqual(plan.map(item => item.session_id),
    ['S_target_a', 'S_target_b', 'S_backlog_old', 'S_backlog_recent']);
  assert.equal(plan.find(item => item.session_id === 'S_backlog_old').date, shiftDate(target, -5));
  assert.equal(plan.find(item => item.session_id === 'S_backlog_recent').date, shiftDate(target, -2));
  assert.ok(!plan.some(item => item.session_id === 'S_too_old'));
});

test('buildSessionPlan: an absent sessions root plans nothing rather than throwing', async () => {
  const est = await estate();
  const { io } = await ioAndToolsFor(est);
  const plan = buildSessionPlan({ io, sessionsAddress: SESSIONS_ADDRESS, targetDate: '2026-09-20' });
  assert.deepEqual(plan, []);
});

test('buildSessionPlan: the target-date entry being a file (not ENOENT) throws rather than reads as empty', async () => {
  const est = await estate();
  const { io } = await ioAndToolsFor(est);
  await makeDateEntryAFile(est.dataRoot, '2026-09-20');
  assert.throws(() => buildSessionPlan({ io, sessionsAddress: SESSIONS_ADDRESS, targetDate: '2026-09-20' }),
    error => error.code === 'voice_conversation_list_nightly_sessions_root_unreadable');
});

// --------------------------------------------------------- classification
test('classifySession: an unreadable or mismatched manifest is failed, not a vanished session', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await mkdir(path.join(est.dataRoot, 'ingress', 'plaud', 'sessions', '2026-09-20', 'S_empty'), { recursive: true });
  const empty = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_empty' });
  assert.equal(empty.classification, 'failed');
  assert.equal(empty.reason, 'session_manifest_unreadable');

  await writeMalformedSession(est.dataRoot, '2026-09-20', 'S_broken');
  const broken = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_broken' });
  assert.equal(broken.classification, 'failed');
  assert.equal(broken.reason, 'session_manifest_unreadable');

  await writeSession(est.dataRoot, '2026-09-20', 'S_mismatched');
  await writeFile(path.join(est.dataRoot, 'ingress', 'plaud', 'sessions', '2026-09-20', 'S_mismatched', 'session_manifest.json'),
    JSON.stringify({ session_id: 'S_someone_else', duration_seconds: 40,
      independent_transcription: { status: 'completed' } }));
  const mismatched = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_mismatched' });
  assert.equal(mismatched.classification, 'failed');
  assert.equal(mismatched.reason, 'session_manifest_unreadable');
});

test('classifySession: transcript absent or short is skipped_short, with the exact reason', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_no_transcript', { transcriptStatus: null });
  const absent = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_no_transcript' });
  assert.equal(absent.classification, 'skipped_short');
  assert.equal(absent.reason, 'transcript_absent');

  await writeSession(est.dataRoot, '2026-09-20', 'S_short', { durationSeconds: MIN_TRANSCRIPT_SECONDS - 1 });
  const short = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_short' });
  assert.equal(short.classification, 'skipped_short');
  assert.equal(short.reason, 'duration_below_30s');

  await writeSession(est.dataRoot, '2026-09-20', 'S_no_duration', { durationSeconds: null });
  const noDuration = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_no_duration' });
  assert.equal(noDuration.classification, 'skipped_short');
  assert.equal(noDuration.reason, 'duration_below_30s');
});

test('classifySession: a long enough completed session with no run is classified to run', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_fresh', { durationSeconds: MIN_TRANSCRIPT_SECONDS });
  const described = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_fresh' });
  assert.equal(described.classification, 'run');
  assert.equal(described.reason, null);
  assert.equal(described.existing_run_id, null);
  assert.equal(described.title, '테스트 세션');
});

test('classifySession: a verified existing run is skipped_existing; an unverified one still runs', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_verified');
  const verifiedRunId = await writeExistingRun(est.derivedRoot, 'S_verified', { verified: true });
  const verified = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_verified' });
  assert.equal(verified.classification, 'skipped_existing');
  assert.equal(verified.existing_run_id, verifiedRunId);

  await writeSession(est.dataRoot, '2026-09-20', 'S_partial');
  const partialRunId = await writeExistingRun(est.derivedRoot, 'S_partial',
    { runId: 'vcl_bbbbbbbbbbbbbbbb', verified: false });
  const partial = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_partial' });
  assert.equal(partial.classification, 'run');
  assert.equal(partial.existing_run_id, partialRunId);
});

// ---------------------------------------------------------- S2-1 staleness
test('staleReasonFor checks transcript run id, config sha and prompt digests, each independently', () => {
  const fresh = { transcript: { run_id: 'whispercpp_test_v1' }, config_sha256: 'sha256:deadbeef', prompts: { boundary: 'd1' } };
  assert.equal(staleReasonFor({ manifest: fresh, transcriptRunId: 'whispercpp_test_v1',
    configSha256: 'deadbeef', promptDigests: { boundary: 'd1' } }), null);
  assert.equal(staleReasonFor({ manifest: fresh, transcriptRunId: 'whispercpp_test_v2' }), 'transcript_run_id');
  assert.equal(staleReasonFor({ manifest: fresh, transcriptRunId: 'whispercpp_test_v1', configSha256: 'cafefeed' }), 'config');
  assert.equal(staleReasonFor({ manifest: fresh, transcriptRunId: 'whispercpp_test_v1',
    promptDigests: { boundary: 'd2' } }), 'prompts');
  assert.equal(staleReasonFor({ manifest: null, transcriptRunId: 'whispercpp_test_v1' }), 'manifest_unreadable');
  // Omitted signals are not checked -- a caller with no configSha256/promptDigests
  // to compare against does not manufacture staleness out of absence.
  assert.equal(staleReasonFor({ manifest: fresh, transcriptRunId: 'whispercpp_test_v1' }), null);
});

test('classifySession: a re-transcribed session (new independent_transcription.run_id) is run again, not skipped_existing', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_retranscribed');
  const oldRunId = await writeExistingRun(est.derivedRoot, 'S_retranscribed', { verified: true });
  // The session now declares a different transcript run than the card was built from.
  await writeFile(path.join(est.dataRoot, 'ingress', 'plaud', 'sessions', '2026-09-20', 'S_retranscribed', 'session_manifest.json'),
    JSON.stringify({ schema_version: 'soulforge.voice_capture_session.v0', session_id: 'S_retranscribed',
      source: 'plaud_cli_import', source_page_title: 't', recorded_at_local: '2026-09-20T09:00:00+09:00',
      duration_seconds: 40, independent_transcription: { status: 'completed', run_id: 'whispercpp_test_v2_redo' } }));
  const described = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20',
    sessionId: 'S_retranscribed', configSha256: 'deadbeef', promptDigests: {} });
  assert.equal(described.classification, 'run');
  assert.equal(described.reason, 'existing_run_stale:transcript_run_id');
  assert.equal(described.existing_run_id, oldRunId);
  // The stale run directory is a record, not a mistake to clean up here.
  assert.equal(existsSync(path.join(est.derivedRoot, 'voice', 'S_retranscribed', oldRunId, 'conversation_list.v0.json')), true);
});

test('classifySession: a changed pipeline config sha, or a changed prompt file digest, is also existing_run_stale', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_config_changed');
  await writeExistingRun(est.derivedRoot, 'S_config_changed', { verified: true, configSha256: 'oldconfig' });
  const configChanged = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20',
    sessionId: 'S_config_changed', configSha256: 'newconfig', promptDigests: {} });
  assert.equal(configChanged.classification, 'run');
  assert.equal(configChanged.reason, 'existing_run_stale:config');

  await writeSession(est.dataRoot, '2026-09-20', 'S_prompt_changed');
  await writeExistingRun(est.derivedRoot, 'S_prompt_changed', { verified: true, prompts: { boundary: 'old-digest' } });
  const promptChanged = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20',
    sessionId: 'S_prompt_changed', configSha256: 'deadbeef', promptDigests: { boundary: 'new-digest' } });
  assert.equal(promptChanged.classification, 'run');
  assert.equal(promptChanged.reason, 'existing_run_stale:prompts');
});

test('classifySession: a verified run with no readable run_manifest.json is treated as stale rather than trusted blindly', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_no_manifest');
  const dir = path.join(est.derivedRoot, 'voice', 'S_no_manifest', 'vcl_aaaaaaaaaaaaaaaa');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'conversation_list.v0.json'),
    JSON.stringify({ generated_at: '2026-01-01T00:00:00.000Z', verified: true, session_id: 'S_no_manifest', run_id: 'vcl_aaaaaaaaaaaaaaaa' }));
  // No run_manifest.json written at all -- a partial or very old run directory.
  const described = classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_no_manifest' });
  assert.equal(described.classification, 'run');
  assert.equal(described.reason, 'existing_run_stale:manifest_unreadable');
});

// -------------------------------------------------------------------- lock
test('acquireLock: a fresh lock is held; releasing it frees the next acquire', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  const now = '2026-09-20T18:00:00.000Z';
  const first = acquireLock(receiptsDir, now);
  assert.equal(first.held, false);
  assert.equal(existsSync(path.join(receiptsDir, 'nightly.lock')), true);
  const second = acquireLock(receiptsDir, now);
  assert.equal(second.held, true);
  releaseLock(receiptsDir);
  assert.equal(existsSync(path.join(receiptsDir, 'nightly.lock')), false);
  const third = acquireLock(receiptsDir, now);
  assert.equal(third.held, false);
});

test('acquireLock: a lock older than the stale threshold is reclaimed, not held', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  const startedAt = new Date(Date.parse('2026-09-20T18:00:00.000Z') - STALE_LOCK_MS - 1000).toISOString();
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, 'nightly.lock'), JSON.stringify({ pid: 999, started_at: startedAt }));
  const reclaimed = acquireLock(receiptsDir, '2026-09-20T18:00:00.000Z');
  assert.equal(reclaimed.held, false);
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.previous.pid, 999);
  const held = JSON.parse(readFileSync(path.join(receiptsDir, 'nightly.lock'), 'utf8'));
  assert.equal(held.reclaimed_from.pid, 999);
});

test('acquireLock: a corrupt lock file is treated as stale rather than left unreadable forever', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, 'nightly.lock'), 'not json');
  const reclaimed = acquireLock(receiptsDir, '2026-09-20T18:00:00.000Z');
  assert.equal(reclaimed.held, false);
  assert.equal(reclaimed.reclaimed, true);
});

// ------------------------------------------------------------------ runNightly
const DUMMY_PIPELINE = { config: {}, prompts: {}, promptDigests: {}, configSha256: 'deadbeef' };

test('runNightly: runs the fresh session, skips the rest, writes one receipt, releases the lock', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_short', { durationSeconds: 5 });
  await writeSession(est.dataRoot, target, 'S_existing');
  const existingRunId = await writeExistingRun(est.derivedRoot, 'S_existing', { verified: true });

  const calls = [];
  const runSession = async ({ sessionId }) => {
    calls.push(sessionId);
    return { run_id: 'vcl_1111111111111111', verified: true, llm_calls: 7, elapsed_ms: 2500 };
  };
  const lines = [];
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession, log: line => lines.push(line) });

  assert.equal(result.status, 'OK');
  assert.deepEqual(calls, ['S_run']);
  assert.equal(lines.length, 3);
  assert.equal(existsSync(path.join(est.receiptsDir, 'nightly.lock')), false, 'the lock is released');

  const receipt = result.receipt;
  assert.equal(receipt.schema_version, NIGHTLY_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'OK');
  assert.equal(receipt.plan.error, null);
  assert.equal(receipt.totals.ran, 1);
  assert.equal(receipt.totals.skipped_short, 1);
  assert.equal(receipt.totals.transcript_absent, 0);
  assert.equal(receipt.totals.skipped_existing, 1);
  assert.equal(receipt.totals.failed, 0);
  assert.equal(receipt.totals.llm_calls, 7);
  assert.equal(receipt.totals.seconds, 3);
  const ranRow = receipt.sessions.find(row => row.session_id === 'S_run');
  assert.equal(ranRow.outcome, 'ran');
  assert.equal(ranRow.run_id, 'vcl_1111111111111111');
  // R2: every row names its own plan date, not just the night's target_date
  // -- this is what a backlog reconcile pass reads to pick the right
  // mail/Linear window for a session that may be days older than tonight.
  assert.equal(ranRow.date, target);
  const existingRow = receipt.sessions.find(row => row.session_id === 'S_existing');
  assert.equal(existingRow.outcome, 'skipped_existing');
  assert.equal(existingRow.run_id, existingRunId);
  assert.equal(existingRow.date, target);
  const shortRow = receipt.sessions.find(row => row.session_id === 'S_short');
  assert.equal(shortRow.outcome, 'skipped_short');
  assert.equal(shortRow.reason, 'duration_below_30s');
  assert.equal(shortRow.date, target);

  const written = await readdir(est.receiptsDir);
  const receiptFiles = written.filter(name => name.endsWith('.json'));
  assert.equal(receiptFiles.length, 1);
  assert.ok(!written.includes('nightly.lock.json'), 'the lock is not a .json file');
  const onDisk = JSON.parse(await readFile(path.join(est.receiptsDir, receiptFiles[0]), 'utf8'));
  assert.deepEqual(onDisk, receipt);
});

test('runNightly: transcript_absent is counted separately from duration_below_30s within skipped_short', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_absent', { transcriptStatus: null });
  await writeSession(est.dataRoot, target, 'S_short', { durationSeconds: 5 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { throw new Error('must not run'); }, log: () => {} });
  assert.equal(result.receipt.totals.skipped_short, 2);
  assert.equal(result.receipt.totals.transcript_absent, 1);
});

test('runNightly: a session with an unreadable manifest is reported failed, not dropped', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeMalformedSession(est.dataRoot, target, 'S_broken');
  await writeSession(est.dataRoot, target, 'S_ok', { durationSeconds: 40 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_5555555555555555', verified: true, llm_calls: 1, elapsed_ms: 1 }),
    log: () => {} });
  assert.equal(result.status, 'FAILED');
  const row = result.receipt.sessions.find(item => item.session_id === 'S_broken');
  assert.equal(row.outcome, 'failed');
  assert.equal(row.reason, 'session_manifest_unreadable');
  assert.equal(result.receipt.totals.failed, 1);
  assert.equal(result.receipt.totals.ran, 1);
});

test('runNightly: a run that finishes but comes back verified: false is ran_unverified, counted separately, and FAILs the night', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_unverified', { durationSeconds: 40 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_6666666666666666', verified: false, llm_calls: 3, elapsed_ms: 100 }),
    log: () => {} });
  assert.equal(result.status, 'FAILED'); // a night with real, unresolved work in it is not OK
  const row = result.receipt.sessions.find(item => item.session_id === 'S_unverified');
  assert.equal(row.outcome, 'ran_unverified');
  assert.equal(row.verified, false);
  assert.equal(result.receipt.totals.ran, 0);
  assert.equal(result.receipt.totals.ran_unverified, 1);
  assert.equal(result.receipt.totals.failed, 0); // it is not the same outcome as a thrown error either
});

test('runNightly: a failed per-session run is reported and FAILs the night, and sessions run in plan order', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_ok', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_bad', { durationSeconds: 40 });

  const calls = [];
  const runSession = async ({ sessionId }) => {
    calls.push(sessionId);
    if (sessionId === 'S_bad') { const error = new Error('boom'); error.code = 'voice_pipeline_prompt_absent'; throw error; }
    return { run_id: 'vcl_2222222222222222', verified: true, llm_calls: 3, elapsed_ms: 1000 };
  };
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession, log: () => {} });

  assert.equal(result.status, 'FAILED');
  // Plan order is alphabetical directory order ('S_bad' before 'S_ok'); asserting
  // the exact order (not a sorted copy) is what actually proves sessions ran
  // sequentially in plan order rather than in some other order that happens to
  // contain the same two ids.
  assert.deepEqual(calls, ['S_bad', 'S_ok']);
  const badRow = result.receipt.sessions.find(row => row.session_id === 'S_bad');
  assert.equal(badRow.outcome, 'failed');
  assert.equal(badRow.reason, 'voice_pipeline_prompt_absent');
  assert.equal(result.receipt.sessions.find(row => row.session_id === 'S_ok').outcome, 'ran');
  assert.equal(existsSync(path.join(est.receiptsDir, 'nightly.lock')), false, 'the lock is released even after a failure');
});

test('runNightly: a held lock blocks the run, calls no session, and writes no receipt', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_run', { durationSeconds: 40 });
  acquireLock(est.receiptsDir, '2026-09-20T17:59:00.000Z');

  let called = false;
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: '2026-09-20', now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { called = true; return {}; }, log: () => {} });

  assert.equal(result.status, 'LOCK_HELD');
  assert.equal(called, false);
  const written = await readdir(est.receiptsDir);
  assert.deepEqual(written, ['nightly.lock']);
});

test('runNightly: reclaiming a stale lock records the previous holder and its age in the receipt', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const now = '2026-09-20T18:00:00.000Z';
  const staleStartedAt = new Date(Date.parse(now) - STALE_LOCK_MS - 5000).toISOString();
  mkdirSync(est.receiptsDir, { recursive: true });
  writeFileSync(path.join(est.receiptsDir, 'nightly.lock'), JSON.stringify({ pid: 4242, started_at: staleStartedAt }));

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now,
    runSession: async () => ({ run_id: 'vcl_6666666666666666', verified: true, llm_calls: 1, elapsed_ms: 1 }),
    log: () => {} });

  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.lock.reclaimed_stale, true);
  assert.equal(result.receipt.lock.previous_lock.pid, 4242);
  assert.ok(result.receipt.lock.previous_lock_age_ms > STALE_LOCK_MS);
});

test('runNightly: an unreadable sessions root fails the night (exit-mapped 2) with a plan-level reason, and writes a receipt', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await makeDateEntryAFile(est.dataRoot, '2026-09-20');

  let called = false;
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: '2026-09-20', now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { called = true; return {}; }, log: () => {} });

  assert.equal(result.status, 'FAILED');
  assert.equal(called, false);
  assert.equal(result.receipt.plan.error, 'voice_conversation_list_nightly_sessions_root_unreadable');
  assert.deepEqual(result.receipt.sessions, []);
  assert.equal(existsSync(path.join(est.receiptsDir, 'nightly.lock')), false, 'the lock is released even after a plan failure');
});

test('runNightly --dry: an unreadable sessions root is reported FAILED too, and still writes nothing', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await makeDateEntryAFile(est.dataRoot, '2026-09-20');
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: '2026-09-20', dry: true, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { throw new Error('must not be called'); }, log: () => {} });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.plan.error, 'voice_conversation_list_nightly_sessions_root_unreadable');
  assert.equal(existsSync(est.receiptsDir), false);
});

test('runNightly --dry: a session_manifest_unreadable row makes the whole preview FAILED, not DRY/exit 0', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeMalformedSession(est.dataRoot, target, 'S_broken');
  await writeSession(est.dataRoot, target, 'S_ok', { durationSeconds: 40 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, dry: true, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { throw new Error('must not be called'); }, log: () => {} });
  // A plan-level problem (an unreadable root) already returned FAILED before
  // this fix; a single broken session's own row, found while otherwise
  // walking a readable plan, did not -- this closes that gap.
  assert.equal(result.status, 'FAILED');
  assert.equal(result.receipt, null);
  const row = result.sessions.find(item => item.session_id === 'S_broken');
  assert.equal(row.classification, 'failed');
  assert.equal(row.reason, 'session_manifest_unreadable');
});

test('runNightly --dry: reports the plan, calls no session, and writes nothing at all', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_short', { durationSeconds: 5 });
  await writeSession(est.dataRoot, target, 'S_existing');
  await writeExistingRun(est.derivedRoot, 'S_existing', { verified: true });

  let called = false;
  const lines = [];
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, dry: true, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { called = true; return {}; }, log: line => lines.push(line) });

  assert.equal(result.status, 'DRY');
  assert.equal(called, false);
  assert.equal(result.receipt, null);
  assert.equal(result.totals.would_run, 1);
  assert.equal(result.totals.skipped_existing, 1);
  assert.equal(result.totals.skipped_short, 1);
  assert.equal(lines.length, 3);
  assert.ok(lines.some(line => line.includes('would_run')));

  assert.equal(existsSync(est.receiptsDir), false, 'a dry run creates no receipts directory');
  const derivedContents = await readdir(path.join(est.derivedRoot, 'voice', 'S_existing')).catch(() => []);
  assert.deepEqual(derivedContents.filter(name => name !== 'vcl_aaaaaaaaaaaaaaaa'), []);
});

test('runNightly: --max-sessions counts only run-classified sessions against the cap', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  // Alphabetical plan order: S_a_existing, S_b_short, S_c_run, S_d_run, S_e_run.
  // A cap of 1 must let the skip/existing sessions *before* the cap point
  // through, and stop right after the first run -- not after one candidate,
  // and not by refusing to count skips that happened first.
  await writeSession(est.dataRoot, target, 'S_a_existing');
  await writeExistingRun(est.derivedRoot, 'S_a_existing', { verified: true });
  await writeSession(est.dataRoot, target, 'S_b_short', { durationSeconds: 5 });
  await writeSession(est.dataRoot, target, 'S_c_run', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_d_run', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_e_run', { durationSeconds: 40 });

  const calls = [];
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, maxSessions: 1, now: '2026-09-20T18:00:00.000Z',
    runSession: async ({ sessionId }) => { calls.push(sessionId);
      return { run_id: 'vcl_3333333333333333', verified: true, llm_calls: 1, elapsed_ms: 1 }; },
    log: () => {} });

  assert.equal(result.status, 'OK');
  assert.deepEqual(calls, ['S_c_run']);
  assert.equal(result.receipt.totals.ran, 1);
  assert.equal(result.receipt.totals.skipped_existing, 1);
  assert.equal(result.receipt.totals.skipped_short, 1);
  // S_d_run and S_e_run were never reached this night (the cap stopped
  // classification there) -- they are simply absent from this receipt, left
  // for the plan to pick up again.
  assert.ok(!result.receipt.sessions.some(row => row.session_id === 'S_d_run'));
  assert.ok(!result.receipt.sessions.some(row => row.session_id === 'S_e_run'));
});

// --------------------------------------------------------------------- CLI
test('runNightlyCli: end-to-end with real config files, an injected runSession, and no model calls', async () => {
  const est = await estate();
  const target = '2026-09-19';
  await writeSession(est.dataRoot, target, 'S_cli_run', { durationSeconds: 40 });
  const now = '2026-09-20T00:00:00.000Z'; // Seoul 09:00 on the 20th: default target date is the 19th.

  let called = false;
  const argv = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir];
  const { result, lines, targetDate } = await runNightlyCli(argv, { now,
    runSession: async ({ sessionId }) => { called = true; return { run_id: 'vcl_4444444444444444', verified: true, llm_calls: 2, elapsed_ms: 500 }; } });

  assert.equal(targetDate, target);
  assert.equal(called, true);
  assert.equal(result.status, 'OK');
  assert.equal(lines.length, 1);
  const written = await readdir(est.receiptsDir);
  assert.ok(written.some(name => name.endsWith('.json') && name !== 'nightly.lock'));
});

test('runNightlyCli: an injected log callback receives every line, in the same order, as the returned lines', async () => {
  const est = await estate();
  const target = '2026-09-19';
  await writeSession(est.dataRoot, target, 'S_cli_stream_a', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_cli_stream_b', { durationSeconds: 5 }); // skipped_short
  const now = '2026-09-20T00:00:00.000Z';

  const argv = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir];
  const streamed = [];
  const { result, lines } = await runNightlyCli(argv, { now,
    runSession: async () => ({ run_id: 'vcl_5555555555555555', verified: true, llm_calls: 1, elapsed_ms: 10 }),
    log: line => streamed.push(line) });

  assert.equal(result.status, 'OK');
  assert.ok(lines.length > 0);
  assert.deepEqual(streamed, lines);
});

test('runNightlyCli: an explicit --root-table-sha256 that does not match the file is refused', async () => {
  const est = await estate();
  const argv = ['--root-table', est.tablePath, '--root-table-sha256', `sha256:${'0'.repeat(64)}`,
    '--tools-config', est.toolsPath, '--pipeline-config', est.configPath, '--receipts', est.receiptsDir];
  await assert.rejects(() => runNightlyCli(argv, { now: '2026-09-20T00:00:00.000Z' }));
});

test('runNightlyCli: --max-sessions 0 or a non-numeric value is a usage error', async () => {
  const est = await estate();
  const base = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir];
  await assert.rejects(() => runNightlyCli([...base, '--max-sessions', '0'], { now: '2026-09-20T00:00:00.000Z' }));
  await assert.rejects(() => runNightlyCli([...base, '--max-sessions', 'abc'], { now: '2026-09-20T00:00:00.000Z' }));
});

test('runNightlyCli --dry: the same argv, in dry mode, calls no model and writes nothing', async () => {
  const est = await estate();
  const target = '2026-09-19';
  await writeSession(est.dataRoot, target, 'S_cli_dry', { durationSeconds: 40 });
  const now = '2026-09-20T00:00:00.000Z';

  const argv = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir, '--dry'];
  const { result } = await runNightlyCli(argv, { now,
    runSession: async () => { throw new Error('must not be called in dry mode'); } });

  assert.equal(result.status, 'DRY');
  assert.equal(existsSync(est.receiptsDir), false);
});

// --------------------------------------------------------------- deadline
test('nextDeadlineInstant: a 22:00 start with a 00:00 deadline lands on the midnight that follows, not the one behind it', () => {
  assert.equal(nextDeadlineInstant('2026-09-20T13:00:00.000Z', '00:00'), '2026-09-20T15:00:00.000Z');
});

test('nextDeadlineInstant: a deadline later the same Seoul day stays on that day', () => {
  // Start 09:00 Seoul (2026-09-20T00:00:00.000Z); deadline 23:00 Seoul, same calendar day.
  assert.equal(nextDeadlineInstant('2026-09-20T00:00:00.000Z', '23:00'), '2026-09-20T14:00:00.000Z');
});

test('nextDeadlineInstant: a deadline already behind the start time rolls to tomorrow, never today again', () => {
  // Start 22:00 Seoul (2026-09-20T13:00:00.000Z); deadline 06:00 Seoul is hours behind -> next day's 06:00 Seoul.
  assert.equal(nextDeadlineInstant('2026-09-20T13:00:00.000Z', '06:00'), '2026-09-20T21:00:00.000Z');
});

test('nextDeadlineInstant: rejects a malformed HH:MM or a non-instant now', () => {
  assert.throws(() => nextDeadlineInstant('2026-09-20T13:00:00.000Z', '24:00'),
    error => error.code === 'voice_conversation_list_nightly_deadline_invalid');
  assert.throws(() => nextDeadlineInstant('2026-09-20T13:00:00.000Z', 'midnight'),
    error => error.code === 'voice_conversation_list_nightly_deadline_invalid');
  assert.throws(() => nextDeadlineInstant('2026-09-20T13:00:00.000Z', ''),
    error => error.code === 'voice_conversation_list_nightly_deadline_invalid');
  assert.throws(() => nextDeadlineInstant('not-a-date', '00:00'),
    error => error.code === 'voice_conversation_list_nightly_deadline_invalid');
});

test('runNightly: a deadline reached before a session stops the night cleanly (status OK, not a failure)', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  // Alphabetical plan order: S_run_a before S_run_b.
  await writeSession(est.dataRoot, target, 'S_run_a', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_run_b', { durationSeconds: 40 });

  const now = '2026-09-20T13:00:00.000Z'; // 22:00 Seoul; --deadline 00:00 -> 2026-09-20T15:00:00.000Z
  const clockTimes = ['2026-09-20T13:05:00.000Z', '2026-09-20T15:00:00.000Z'];
  let clockCalls = 0;
  const clock = () => clockTimes[Math.min(clockCalls++, clockTimes.length - 1)];

  const calls = [];
  const runSession = async ({ sessionId }) => { calls.push(sessionId);
    return { run_id: `vcl_${sessionId}`, verified: true, llm_calls: 1, elapsed_ms: 1 }; };

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now, deadline: '00:00', clock, runSession, log: () => {} });

  assert.equal(result.status, 'OK'); // a deadline stop alone is never a failure
  assert.deepEqual(calls, ['S_run_a']);
  assert.equal(result.receipt.deadline.configured, '00:00');
  assert.equal(result.receipt.deadline.at, '2026-09-20T15:00:00.000Z');
  assert.equal(result.receipt.deadline.stopped, true);
  assert.equal(result.receipt.deadline.sessions_done, 1);
  assert.equal(result.receipt.deadline.sessions_left, 1);
  assert.ok(!result.receipt.sessions.some(row => row.session_id === 'S_run_b'),
    'the session past the deadline is left out of tonight\'s receipt entirely, not marked failed or skipped');
});

test('runNightly: a session left behind by a deadline stop is picked up by the very next run, through the existing backlog mechanism', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run_a', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_run_b', { durationSeconds: 40 });

  const clockTimes = ['2026-09-20T13:05:00.000Z', '2026-09-20T15:00:00.000Z'];
  let clockCalls = 0;
  const stoppingClock = () => clockTimes[Math.min(clockCalls++, clockTimes.length - 1)];
  const firstCalls = [];
  const first = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T13:00:00.000Z', deadline: '00:00',
    clock: stoppingClock, runSession: async ({ sessionId }) => { firstCalls.push(sessionId);
      return { run_id: `vcl_${sessionId}_1`, verified: true, llm_calls: 1, elapsed_ms: 1 }; }, log: () => {} });
  assert.equal(first.status, 'OK');
  assert.deepEqual(firstCalls, ['S_run_a']);
  // The injected `runSession` above (like every other test in this file)
  // never actually writes a run to `derivedRoot` -- only the real pipeline
  // does. Recording S_run_a's run here stands in for that real write, so the
  // second run's own `classifySession` (not this test) is what proves the
  // pickup: S_run_b still has no run at all and is offered again unprompted.
  await writeExistingRun(est.derivedRoot, 'S_run_a', { runId: 'vcl_aaaa111111111111', verified: true });

  // Next run: no deadline pressure. It must find S_run_b again (no verified
  // run exists for it yet) and must not re-run S_run_a (it already has one).
  const secondCalls = [];
  const second = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-21T13:00:00.000Z',
    runSession: async ({ sessionId }) => { secondCalls.push(sessionId);
      return { run_id: `vcl_${sessionId}_2`, verified: true, llm_calls: 1, elapsed_ms: 1 }; }, log: () => {} });

  assert.equal(second.status, 'OK');
  assert.deepEqual(secondCalls, ['S_run_b']);
  assert.equal(second.receipt.sessions.find(row => row.session_id === 'S_run_b').outcome, 'ran');
  assert.equal(second.receipt.sessions.find(row => row.session_id === 'S_run_a').outcome, 'skipped_existing');
});

test('runNightly: a configured deadline that is never reached during the run changes nothing about the outcome', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T13:00:00.000Z', deadline: '00:00',
    clock: () => '2026-09-20T13:01:00.000Z', // always well before the 15:00Z deadline
    runSession: async () => ({ run_id: 'vcl_x', verified: true, llm_calls: 1, elapsed_ms: 1 }), log: () => {} });
  assert.equal(result.status, 'OK');
  assert.equal(result.receipt.deadline.stopped, false);
  assert.equal(result.receipt.deadline.sessions_done, 1);
  assert.equal(result.receipt.deadline.sessions_left, 0);
});

test('runNightly --dry: with no deadline configured, the receipt carries no deadline block (default behaviour unchanged)', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await writeSession(est.dataRoot, '2026-09-20', 'S_run', { durationSeconds: 40 });
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: '2026-09-20', now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_x', verified: true, llm_calls: 1, elapsed_ms: 1 }), log: () => {} });
  assert.equal(result.receipt.deadline, null);
  assert.equal(result.receipt.chain, null);
});

// ------------------------------------------------------------------ chain
function chainStub(script) {
  const calls = [];
  const fn = async args => { calls.push(args); return script(args, calls.length); };
  fn.calls = calls;
  return fn;
}

test('runNightly --chain-reconcile: runs after card generation, against this same receipts dir, and forwards every pass-through argument', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const reconcileReceiptsDir = path.join(est.controlRoot, 'reconcile-receipts');

  // Ordering is captured (not asserted) inside the stub: an assertion thrown
  // in here would be swallowed by `runChain`'s own defensive catch and turn
  // into a confusing `chain.status === 'FAILED'` in the caller instead of
  // this test's own failure message, so the snapshot is checked afterward.
  let snapshotAtChainStart = null;
  const runReconcileChain = chainStub(() => {
    const written = readdirSync(est.receiptsDir).filter(name => name.endsWith('.json'));
    snapshotAtChainStart = written.length === 1
      ? JSON.parse(readFileSync(path.join(est.receiptsDir, written[0]), 'utf8')) : null;
    return { status: 'OK', stage: null, reason: null, reconcile: { status: 'OK' }, present: { status: 'OK' } };
  });

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_run', verified: true, llm_calls: 1, elapsed_ms: 1 }), log: () => {},
    chainReconcile: true, tablePath: est.tablePath, rootTableSha256: `sha256:${hex(await readFile(est.tablePath))}`,
    toolsConfigPath: est.toolsPath, reconcileReceiptsDir,
    linearRoot: 'data_root/ingress/linear-custom', mailRoots: ['data_root/ingress/mail-a', 'data_root/ingress/mail-b'],
    questionsCap: 5, runReconcileChain });

  assert.equal(result.status, 'OK');
  // Ordering: by the time the chain ran, this night's own receipt was
  // already the one and only file on disk, with tonight's real outcome in it.
  assert.ok(snapshotAtChainStart !== null);
  assert.equal(snapshotAtChainStart.sessions[0].session_id, 'S_run');
  assert.equal(snapshotAtChainStart.sessions[0].outcome, 'ran');
  assert.equal(runReconcileChain.calls.length, 1);
  const call = runReconcileChain.calls[0];
  assert.equal(call.tablePath, est.tablePath);
  assert.equal(call.toolsConfigPath, est.toolsPath);
  assert.equal(call.nightlyReceiptsDir, est.receiptsDir);
  assert.equal(call.reconcileReceiptsDir, reconcileReceiptsDir);
  assert.equal(call.linearRoot, 'data_root/ingress/linear-custom');
  assert.deepEqual(call.mailRoots, ['data_root/ingress/mail-a', 'data_root/ingress/mail-b']);
  assert.equal(call.questionsCap, 5);
  assert.equal(call.dry, false);
  assert.deepEqual(result.receipt.chain, { status: 'OK', stage: null, reason: null,
    reconcile: { status: 'OK' }, present: { status: 'OK' } });

  // And the chain's outcome landed in the very receipt already on disk (a
  // second write to the same path, not a second file).
  const written = (await readdir(est.receiptsDir)).filter(name => name.endsWith('.json'));
  assert.equal(written.length, 1);
  const onDisk = JSON.parse(await readFile(path.join(est.receiptsDir, written[0]), 'utf8'));
  assert.deepEqual(onDisk.chain, result.receipt.chain);
});

test('runNightly --chain-reconcile: a reconcile or present failure is recorded in the receipt and FAILs the night, without touching card generation results', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const reconcileReceiptsDir = path.join(est.controlRoot, 'reconcile-receipts');

  const runReconcileChain = chainStub(() =>
    ({ status: 'FAILED', stage: 'present', reason: 'voice_question_ledger_locked', reconcile: { status: 'OK' }, present: { status: 'FAILED' } }));

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_run', verified: true, llm_calls: 1, elapsed_ms: 1 }), log: () => {},
    chainReconcile: true, tablePath: est.tablePath, rootTableSha256: `sha256:${hex(await readFile(est.tablePath))}`,
    toolsConfigPath: est.toolsPath, reconcileReceiptsDir, runReconcileChain });

  assert.equal(result.status, 'FAILED'); // non-zero exit at the CLI boundary
  assert.equal(result.receipt.chain.status, 'FAILED');
  assert.equal(result.receipt.chain.stage, 'present');
  // Card generation itself is untouched: the session still shows as cleanly ran.
  const row = result.receipt.sessions.find(item => item.session_id === 'S_run');
  assert.equal(row.outcome, 'ran');
  assert.equal(row.verified, true);
});

test('runNightly --chain-reconcile: a chain function that throws (instead of returning a status) is still caught, recorded, and never reruns card generation', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const calls = [];
  const runReconcileChain = async () => { calls.push(1);
    throw Object.assign(new Error('boom'), { code: 'voice_card_reconcile_root_table_required' }); };

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_run', verified: true, llm_calls: 1, elapsed_ms: 1 }), log: () => {},
    chainReconcile: true, tablePath: est.tablePath, rootTableSha256: `sha256:${hex(await readFile(est.tablePath))}`,
    toolsConfigPath: est.toolsPath, reconcileReceiptsDir: path.join(est.controlRoot, 'reconcile-receipts'),
    runReconcileChain });

  assert.equal(calls.length, 1);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.receipt.chain.status, 'FAILED');
  assert.equal(result.receipt.chain.stage, 'chain');
  assert.equal(result.receipt.chain.reason, 'voice_card_reconcile_root_table_required');
  const row = result.receipt.sessions.find(item => item.session_id === 'S_run');
  assert.equal(row.outcome, 'ran'); // card generation itself is untouched
});

test('runNightly --dry --chain-reconcile: dry propagates into both chain sub-calls, and nothing real is written', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_run', { durationSeconds: 40 });
  const reconcileReceiptsDir = path.join(est.controlRoot, 'reconcile-receipts');

  const runReconcileChain = chainStub(args => {
    assert.equal(args.dry, true);
    return { status: 'OK', stage: null, reason: null, reconcile: { status: 'DRY' }, present: { status: 'DRY' } };
  });

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, now: '2026-09-20T18:00:00.000Z', dry: true,
    runSession: async () => { throw new Error('must not be called in dry mode'); }, log: () => {},
    chainReconcile: true, tablePath: est.tablePath, rootTableSha256: `sha256:${hex(await readFile(est.tablePath))}`,
    toolsConfigPath: est.toolsPath, reconcileReceiptsDir, runReconcileChain });

  assert.equal(result.status, 'DRY');
  assert.equal(runReconcileChain.calls.length, 1);
  assert.deepEqual(result.chain, { status: 'OK', stage: null, reason: null, reconcile: { status: 'DRY' }, present: { status: 'DRY' } });
  assert.equal(existsSync(est.receiptsDir), false);
});

test('runNightlyCli --chain-reconcile: rejects when --reconcile-receipts is missing, and a malformed --deadline is a usage error', async () => {
  const est = await estate();
  const base = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir];
  await assert.rejects(() => runNightlyCli([...base, '--chain-reconcile'], { now: '2026-09-20T18:00:00.000Z' }),
    error => error.code === 'voice_conversation_list_nightly_reconcile_receipts_required');
  await assert.rejects(() => runNightlyCli([...base, '--deadline', 'not-a-time'], { now: '2026-09-20T18:00:00.000Z' }),
    error => error.code === 'voice_conversation_list_nightly_deadline_invalid');
});

test('runNightlyCli --chain-reconcile: end-to-end argv wiring reaches the injected chain with repeated --mail-root values', async () => {
  const est = await estate();
  const target = '2026-09-19';
  await writeSession(est.dataRoot, target, 'S_cli_chain', { durationSeconds: 40 });
  const reconcileReceiptsDir = path.join(est.controlRoot, 'reconcile-receipts');
  const runReconcileChain = chainStub(() =>
    ({ status: 'OK', stage: null, reason: null, reconcile: { status: 'OK' }, present: { status: 'OK' } }));

  const argv = ['--root-table', est.tablePath, '--tools-config', est.toolsPath,
    '--pipeline-config', est.configPath, '--receipts', est.receiptsDir,
    '--chain-reconcile', '--reconcile-receipts', reconcileReceiptsDir,
    '--mail-root', 'data_root/ingress/mail-a', '--mail-root', 'data_root/ingress/mail-b',
    '--questions-cap', '3'];
  const { result } = await runNightlyCli(argv, { now: '2026-09-20T00:00:00.000Z',
    runSession: async () => ({ run_id: 'vcl_cli', verified: true, llm_calls: 1, elapsed_ms: 1 }), runReconcileChain });

  assert.equal(result.status, 'OK');
  assert.equal(runReconcileChain.calls.length, 1);
  assert.deepEqual(runReconcileChain.calls[0].mailRoots, ['data_root/ingress/mail-a', 'data_root/ingress/mail-b']);
  assert.equal(runReconcileChain.calls[0].questionsCap, 3);
  assert.equal(runReconcileChain.calls[0].reconcileReceiptsDir, reconcileReceiptsDir);
});

test('runNightly --chain-reconcile: the real (non-stubbed) reconcile and present CLIs wire together end-to-end with zero sessions', async () => {
  // No `runReconcileChain` injected: this exercises `defaultRunReconcileChain`
  // itself, its dynamic imports of `estate_voice_card_reconcile.mjs` and
  // `voice_question_cli.mjs`, and the real argv each one is called with --
  // proof the chain works, not just that this file's own stub-based tests
  // above agree with each other.
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const reconcileReceiptsDir = path.join(est.controlRoot, 'reconcile-receipts');

  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: '2026-09-20', now: '2026-09-20T18:00:00.000Z',
    runSession: async () => { throw new Error('must not be called: no sessions plan this night'); }, log: () => {},
    chainReconcile: true, tablePath: est.tablePath, rootTableSha256: `sha256:${hex(await readFile(est.tablePath))}`,
    toolsConfigPath: est.toolsPath, reconcileReceiptsDir });

  assert.equal(result.status, 'OK');
  assert.ok(result.receipt.chain !== null);
  assert.equal(result.receipt.chain.status, 'OK');
  assert.equal(result.receipt.chain.reconcile.status, 'OK');
  assert.equal(result.receipt.chain.present.status, 'OK');
  // present's own receipt lands in the *reconcile* receipts dir (where it
  // read its exception pool from), never in this night's own `--receipts`.
  const presentReceipts = (await readdir(reconcileReceiptsDir)).filter(name => name.endsWith('.json'));
  assert.ok(presentReceipts.length >= 1);
});
