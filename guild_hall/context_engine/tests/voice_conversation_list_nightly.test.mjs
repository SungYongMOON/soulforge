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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT_TABLE_SCHEMA, readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import {
  BACKLOG_WINDOW_DAYS, MIN_TRANSCRIPT_SECONDS, NIGHTLY_RECEIPT_SCHEMA, STALE_LOCK_MS,
  acquireLock, buildSessionPlan, classifySession, defaultTargetDate, releaseLock, runNightly,
  runNightlyCli, seoulDateFor, shiftDate,
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

async function writeExistingRun(derivedRoot, sessionId,
  { runId = 'vcl_aaaaaaaaaaaaaaaa', verified = true, generatedAt = '2026-01-01T00:00:00.000Z' } = {}) {
  const dir = path.join(derivedRoot, 'voice', sessionId, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'conversation_list.v0.json'),
    JSON.stringify({ generated_at: generatedAt, verified, session_id: sessionId, run_id: runId }));
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

// --------------------------------------------------------- classification
test('classifySession: no manifest, or a manifest naming a different session, is not a session', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  await mkdir(path.join(est.dataRoot, 'ingress', 'plaud', 'sessions', '2026-09-20', 'S_empty'), { recursive: true });
  assert.equal(classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_empty' }), null);

  await writeSession(est.dataRoot, '2026-09-20', 'S_mismatched');
  await writeFile(path.join(est.dataRoot, 'ingress', 'plaud', 'sessions', '2026-09-20', 'S_mismatched', 'session_manifest.json'),
    JSON.stringify({ session_id: 'S_someone_else', duration_seconds: 40,
      independent_transcription: { status: 'completed' } }));
  assert.equal(classifySession({ io, tools, sessionsAddress: SESSIONS_ADDRESS, date: '2026-09-20', sessionId: 'S_mismatched' }), null);
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

// -------------------------------------------------------------------- lock
test('acquireLock: a fresh lock is held; releasing it frees the next acquire', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  const now = '2026-09-20T18:00:00.000Z';
  const first = acquireLock(receiptsDir, now);
  assert.equal(first.held, false);
  const second = acquireLock(receiptsDir, now);
  assert.equal(second.held, true);
  releaseLock(receiptsDir);
  assert.equal(existsSync(path.join(receiptsDir, 'nightly.lock.json')), false);
  const third = acquireLock(receiptsDir, now);
  assert.equal(third.held, false);
});

test('acquireLock: a lock older than the stale threshold is reclaimed, not held', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  const startedAt = new Date(Date.parse('2026-09-20T18:00:00.000Z') - STALE_LOCK_MS - 1000).toISOString();
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, 'nightly.lock.json'), JSON.stringify({ pid: 999, started_at: startedAt }));
  const reclaimed = acquireLock(receiptsDir, '2026-09-20T18:00:00.000Z');
  assert.equal(reclaimed.held, false);
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(reclaimed.previous.pid, 999);
  const held = JSON.parse(readFileSync(path.join(receiptsDir, 'nightly.lock.json'), 'utf8'));
  assert.equal(held.reclaimed_from.pid, 999);
});

test('acquireLock: a corrupt lock file is treated as stale rather than left unreadable forever', () => {
  const receiptsDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'vcln-lock-')));
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, 'nightly.lock.json'), 'not json');
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
  assert.equal(existsSync(path.join(est.receiptsDir, 'nightly.lock.json')), false, 'the lock is released');

  const receipt = result.receipt;
  assert.equal(receipt.schema_version, NIGHTLY_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'OK');
  assert.equal(receipt.totals.ran, 1);
  assert.equal(receipt.totals.skipped_short, 1);
  assert.equal(receipt.totals.skipped_existing, 1);
  assert.equal(receipt.totals.failed, 0);
  assert.equal(receipt.totals.llm_calls, 7);
  assert.equal(receipt.totals.seconds, 3);
  const ranRow = receipt.sessions.find(row => row.session_id === 'S_run');
  assert.equal(ranRow.outcome, 'ran');
  assert.equal(ranRow.run_id, 'vcl_1111111111111111');
  const existingRow = receipt.sessions.find(row => row.session_id === 'S_existing');
  assert.equal(existingRow.outcome, 'skipped_existing');
  assert.equal(existingRow.run_id, existingRunId);
  const shortRow = receipt.sessions.find(row => row.session_id === 'S_short');
  assert.equal(shortRow.outcome, 'skipped_short');
  assert.equal(shortRow.reason, 'duration_below_30s');

  const written = await readdir(est.receiptsDir);
  const receiptFiles = written.filter(name => name.endsWith('.json') && name !== 'nightly.lock.json');
  assert.equal(receiptFiles.length, 1);
  const onDisk = JSON.parse(await readFile(path.join(est.receiptsDir, receiptFiles[0]), 'utf8'));
  assert.deepEqual(onDisk, receipt);
});

test('runNightly: a failed per-session run is reported and FAILs the night without stopping the others', async () => {
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
  assert.deepEqual(calls.sort(), ['S_bad', 'S_ok']);
  const badRow = result.receipt.sessions.find(row => row.session_id === 'S_bad');
  assert.equal(badRow.outcome, 'failed');
  assert.equal(badRow.reason, 'voice_pipeline_prompt_absent');
  assert.equal(result.receipt.sessions.find(row => row.session_id === 'S_ok').outcome, 'ran');
  assert.equal(existsSync(path.join(est.receiptsDir, 'nightly.lock.json')), false, 'the lock is released even after a failure');
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
  assert.deepEqual(written, ['nightly.lock.json']);
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

test('runNightly: --max-sessions caps the plan before any classification or run', async () => {
  const est = await estate();
  const { io, tools } = await ioAndToolsFor(est);
  const target = '2026-09-20';
  await writeSession(est.dataRoot, target, 'S_a', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_b', { durationSeconds: 40 });
  await writeSession(est.dataRoot, target, 'S_c', { durationSeconds: 40 });

  const calls = [];
  const result = await runNightly({ io, tools, ...DUMMY_PIPELINE, sessionsAddress: SESSIONS_ADDRESS,
    receiptsDir: est.receiptsDir, targetDate: target, maxSessions: 2, now: '2026-09-20T18:00:00.000Z',
    runSession: async ({ sessionId }) => { calls.push(sessionId); return { run_id: 'vcl_3333333333333333', verified: true, llm_calls: 1, elapsed_ms: 1 }; },
    log: () => {} });

  assert.equal(result.status, 'OK');
  assert.equal(calls.length, 2);
  assert.equal(result.receipt.sessions.length, 2);
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
  assert.ok(written.some(name => name.endsWith('.json') && name !== 'nightly.lock.json'));
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
