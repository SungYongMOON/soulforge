// Nightly history step with synthetic sources and a fake writer: no model, no Hermes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, LOCK_FILE_NAME, acquireNightLock, historyNightCli } from '../../harness/history_night.mjs';
import { prepareHistoryExchange } from '../../src/knowledge_layer/history_exchange.mjs';

const lanes = () => Object.fromEntries(['mail', 'slack', 'linear', 'voice']
  .map(name => [name, { status: 'ok', read: 0 }]));
const record = (id, date, text) => ({ id, date, kind: 'mail', title: 'Synthetic title',
  sender: 'Person A', recipient: 'Person B', text, originrefs: [`synthetic:${id}`] });

function setup(t, rows, writerExtra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'history-night-synthetic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['out', 'work', 'receipts']) mkdirSync(join(dir, name));
  writeFileSync(join(dir, 'rules.md'), '# synthetic rules v1\nWrite short past-tense facts.\n');
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ project: 'DEMO-1', type: 'synthetic' }));
  const config = { schema: 'soulforge.history_night_config.v1', rules_file: join(dir, 'rules.md'),
    rules_version: 'synthetic rules v1', work_root: join(dir, 'work'),
    writer: { command: join(dir, 'never-run.exe'), profile: 'history-writer', writer_id: 'synthetic-writer',
      run_budget: 1200, ...writerExtra },
    projects: [{ project: 'DEMO-1', sources: join(dir, 'sources.json'), output_root: join(dir, 'out') }] };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  const state = { rows };
  const collector = async () => ({ records: state.rows, displayMetadata: {},
    coverage: { lanes: lanes(), excluded: [] }, sourceReceipts: [] });
  return { dir, state, collector, config };
}
const cacheFiles = env => {
  const dir = join(env.dir, 'work', 'DEMO-1', 'unit-cache');
  return existsSync(dir) ? readdirSync(dir) : [];
};
const headExists = env => existsSync(join(env.dir, 'out', '2026-09', 'history-head.json'));

// Answers from the query alone, like the real profile would: it copies the ids
// the skeleton line names and cites the first evidence id it was given.
function answer(query, text) {
  const lines = query.split('\n');
  const skeleton = JSON.parse(lines.find(line => line.startsWith('{"schema"')));
  const marker = lines.findIndex(line => line === '자료 배치:' || line === '하위 카드:');
  const payload = JSON.parse(lines[marker + 1]);
  const ids = lines[marker] === '자료 배치:'
    ? payload.user.threads.flatMap(thread => thread.records).map(row => row.source_id ?? row.id)
    : payload.map(card => card.card_id);
  return JSON.stringify({ ...skeleton, drafts: [{ packet_id: skeleton.drafts[0].packet_id,
    sentences: ids.length ? [{ text, evidence_ids: [ids[0]] }] : [] }] });
}
function fakeWriter(script = () => 'ok', { text = 'A synthetic fact happened.' } = {}) {
  const calls = [];
  const writer = async request => {
    const query = readFileSync(request.queryFile, 'utf8');
    calls.push({ layer: request.layer, key: request.key, attempt: request.attempt, length: query.length,
      timeoutMs: request.timeoutMs, retryHint: query.endsWith('JSON으로만 답하라.\n') });
    const mode = script(request, calls.length);
    if (mode === 'garbage') return { exit_code: 0, stdout: 'not json at all', error_code: null };
    if (mode === 'crash') return { exit_code: 1, stdout: '', error_code: null };
    if (mode === 'timeout') return { exit_code: null, stdout: '', error_code: 'ETIMEDOUT', timed_out: true };
    if (mode === 'throw') throw Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
    return { exit_code: 0, stdout: `thinking...\n${answer(query, text)}\n`, error_code: null };
  };
  return { writer, calls };
}
const silent = () => ({ write: () => {} });
async function run(env, writer, extra = [], options = {}) {
  const argv = ['--config', join(env.dir, 'config.json'), '--receipts', join(env.dir, 'receipts'),
    '--date', '2026-09-23', '--now', options.now ?? '2026-09-24T18:00:00Z', ...extra];
  const code = await historyNightCli(argv, { stdout: silent(), stderr: silent(), writer,
    collector: env.collector, clock: options.clock, isPidAlive: options.isPidAlive });
  const receipts = readdirSync(join(env.dir, 'receipts')).filter(name => name.endsWith('.json')).sort();
  const receipt = receipts.length ? JSON.parse(readFileSync(join(env.dir, 'receipts', receipts.at(-1)), 'utf8')) : null;
  rmSync(join(env.dir, 'receipts'), { recursive: true, force: true });
  mkdirSync(join(env.dir, 'receipts'));
  return { code, receipt };
}

test('first night writes every layer; unchanged input makes zero writer calls', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'A synthetic source line.')]);
  const first = fakeWriter();
  const one = await run(env, first.writer);
  assert.equal(one.code, EXIT.OK);
  assert.equal(one.receipt.status, 'OK');
  assert.deepEqual(first.calls.map(call => call.layer), ['daily', 'weekly', 'monthly', 'status']);
  assert.deepEqual(one.receipt.projects[0].finalized_layers, ['daily', 'weekly', 'monthly', 'status']);
  assert.equal(one.receipt.writer.writer_id, 'synthetic-writer');
  assert.equal(JSON.stringify(one.receipt).includes('synthetic source line'), false);
  assert.equal(JSON.stringify(one.receipt).includes('A synthetic fact'), false);
  assert.deepEqual(readdirSync(join(env.dir, 'work', 'DEMO-1', 'calls')), []);
  const again = fakeWriter();
  const two = await run(env, again.writer);
  assert.equal(two.code, EXIT.OK);
  assert.equal(again.calls.length, 0);
  assert.equal(two.receipt.projects[0].status, 'unchanged');
});

test('a bad first answer is retried once with the JSON-only hint and then accepted', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Retry source.')]);
  const fake = fakeWriter((request, n) => (n === 1 ? 'garbage' : 'ok'));
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.OK);
  assert.deepEqual(fake.calls.slice(0, 2).map(call => [call.layer, call.attempt, call.retryHint]),
    [['daily', 1, false], ['daily', 2, true]]);
  assert.deepEqual(receipt.projects[0].units[0].attempts.map(item => item.result),
    ['format_invalid_after_retry', 'accepted']);
});

test('two parsed-but-rejected answers mark the batch unprocessed and the day is still finalized', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Unprocessed source.')]);
  const fake = fakeWriter(request => (request.layer === 'daily' ? 'garbage' : 'ok'));
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.OK);
  const project = receipt.projects[0];
  assert.equal(project.units[0].status, 'unprocessed');
  assert.equal(project.units[0].attempts.length, 2);
  assert.equal(project.unprocessed_batches, 1);
  assert.equal(receipt.totals.unprocessed, 1);
  assert.ok(project.finalized_layers.includes('daily'));
});

for (const mode of ['crash', 'timeout', 'throw']) {
  test(`a transport failure (${mode}) is deferred, never cached or finalized, and the day is prepared again`, async t => {
    const env = setup(t, [record('A', '2026-09-23', 'Transport source.')]);
    const broken = fakeWriter(() => mode);
    const failed = await run(env, broken.writer);
    assert.equal(failed.code, EXIT.FAILED);
    assert.equal(failed.receipt.status, 'FAILED');
    assert.equal(broken.calls.length, 1);
    const project = failed.receipt.projects[0];
    assert.equal(project.status, 'transport_failed');
    assert.equal(project.units[0].status, 'transport_failed');
    assert.equal(project.unprocessed_batches, 0);
    assert.deepEqual(cacheFiles(env), []);
    assert.equal(headExists(env), false);
    const good = fakeWriter();
    const next = await run(env, good.writer);
    assert.equal(next.code, EXIT.OK);
    assert.equal(good.calls[0].layer, 'daily');
    assert.equal(next.receipt.projects[0].units[0].status, 'accepted');
    assert.equal(headExists(env), true);
  });
}

test('a transport failure after earlier progress is PARTIAL, not FAILED', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Progress source.')]);
  const fake = fakeWriter(request => (request.layer === 'weekly' ? 'crash' : 'ok'));
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.PARTIAL);
  assert.deepEqual(receipt.projects[0].finalized_layers, ['daily']);
  assert.equal(receipt.projects[0].status, 'transport_failed');
});

test('a rejected upper packet does not hold back the day and is retried next night', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Upper source.')]);
  const fake = fakeWriter(request => (request.layer === 'weekly' ? 'garbage' : 'ok'));
  const first = await run(env, fake.writer);
  assert.equal(first.code, EXIT.PARTIAL);
  const project = first.receipt.projects[0];
  assert.deepEqual(project.finalized_layers, ['daily']);
  assert.deepEqual(project.pending, [{ layer: 'weekly', reason: 'format_invalid_after_retry' }]);
  assert.equal(headExists(env), true);
  const good = fakeWriter();
  const second = await run(env, good.writer);
  assert.equal(second.code, EXIT.OK);
  assert.deepEqual(good.calls.map(call => call.layer), ['weekly', 'monthly', 'status']);
});

test('an oversize upper query is a recorded deferral, not a thrown failure', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Short.')], { max_query_characters: 3000 });
  const fake = fakeWriter(() => 'ok', { text: '긴 문장 '.repeat(500) });
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.PARTIAL);
  const project = receipt.projects[0];
  assert.deepEqual(project.finalized_layers, ['daily']);
  assert.deepEqual(project.pending, [{ layer: 'weekly', reason: 'upper_oversize' }]);
  assert.equal(project.units.find(unit => unit.layer === 'weekly').status, 'oversize');
  assert.deepEqual(fake.calls.map(call => call.layer), ['daily']);
});

test('the daily batch budget leaves room for the prompt so no query exceeds the limit', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'x'.repeat(9000))], { max_query_characters: 2600 });
  const fake = fakeWriter();
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.OK);
  const daily = fake.calls.filter(call => call.layer === 'daily');
  assert.ok(daily.length >= 4);
  assert.ok(fake.calls.every(call => call.length <= 2600), JSON.stringify(fake.calls.map(call => call.length)));
  assert.ok(receipt.projects[0].finalized_layers.includes('daily'));
});

test('a direct prepare of an upper layer with no head yet is unchanged, not a crash', async t => {
  const env = setup(t, []);
  const result = prepareHistoryExchange({ input: { project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23',
    records: [record('A', '2026-09-23', 'Only a day.')] }, outputRoot: join(env.dir, 'out'),
  rulesText: 'rules', layers: ['weekly'] });
  assert.equal(result.status, 'unchanged');
  assert.throws(() => prepareHistoryExchange({ input: { project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23',
    records: [record('A', '2026-09-23', 'x')] }, outputRoot: join(env.dir, 'out'), rulesText: 'rules',
  layers: ['yearly'] }), /history_exchange_request_invalid/u);
});

test('the no-start cutoff leaves unstarted batches for the next night without repeating finished ones', async t => {
  const env = setup(t, [record('A', '2026-09-22', 'Day one.'), record('B', '2026-09-23', 'Day two.')]);
  let now = Date.parse('2026-09-24T18:00:00Z');
  const clock = () => new Date(now).toISOString();
  const fake = fakeWriter(() => { now += 2 * 60 * 60 * 1000; return 'ok'; });
  const stopped = await run(env, fake.writer, ['--deadline', '05:00', '--no-start-within', '5'], { clock });
  assert.equal(stopped.code, EXIT.PARTIAL);
  assert.equal(stopped.receipt.deadline.stopped, true);
  // a call must be able to finish before the deadline: 1200 s budget + 120 s margin = 22 minutes
  assert.equal(stopped.receipt.deadline.no_start_within_minutes, 22);
  assert.ok(fake.calls[0].timeoutMs <= Date.parse(stopped.receipt.deadline.at) - Date.parse('2026-09-24T18:00:00Z'));
  assert.equal(fake.calls.length, 1);
  assert.equal(stopped.receipt.projects[0].status, 'deferred_deadline');
  assert.deepEqual(stopped.receipt.projects[0].units.map(unit => unit.status), ['accepted', 'not_started']);
  assert.equal(headExists(env), false);
  const next = fakeWriter();
  const resumed = await run(env, next.writer);
  assert.equal(resumed.code, EXIT.OK);
  assert.equal(resumed.receipt.projects[0].units[0].status, 'cached_accepted');
  assert.equal(next.calls.filter(call => call.layer === 'daily').length, 1);
});

test('past the cutoff before any project starts is SKIPPED_PAST_DEADLINE', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Late.')]);
  const fake = fakeWriter();
  const { code, receipt } = await run(env, fake.writer, ['--deadline', '05:00'], { now: '2026-09-24T19:50:00Z' });
  assert.equal(code, EXIT.SKIPPED_PAST_DEADLINE);
  assert.equal(receipt.status, 'SKIPPED_PAST_DEADLINE');
  assert.equal(fake.calls.length, 0);
});

test('lock: held refuses, unreadable refuses, dead owner or aged lock is healed by rename-aside', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Locked.')]);
  const lockFile = () => join(env.dir, 'receipts', LOCK_FILE_NAME);
  const fresh = JSON.stringify({ pid: 424242, started_at: '2026-09-24T17:30:00Z', token: 'other' });
  writeFileSync(lockFile(), fresh);
  const fake = fakeWriter();
  const held = await run(env, fake.writer, [], { isPidAlive: () => true });
  assert.equal(held.code, EXIT.LOCK_HELD);
  assert.equal(fake.calls.length, 0);
  writeFileSync(lockFile(), 'not json');
  assert.equal((await run(env, fake.writer, [], { isPidAlive: () => false })).code, EXIT.LOCK_HELD);
  writeFileSync(lockFile(), fresh);
  const dead = await run(env, fake.writer, [], { isPidAlive: () => false });
  assert.equal(dead.code, EXIT.OK);
  assert.equal(dead.receipt.lock.healed_stale, 'owner_dead');
  env.state.rows = [record('A', '2026-09-23', 'Locked, changed.')];
  writeFileSync(lockFile(), JSON.stringify({ pid: 424242, started_at: '2026-09-24T10:00:00Z', token: 'old' }));
  const aged = await run(env, fake.writer, [], { isPidAlive: () => true });
  assert.equal(aged.code, EXIT.OK);
  assert.equal(aged.receipt.lock.healed_stale, 'aged_out');
});

test('stale query files from a killed run are removed before the next call', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Stale query.')]);
  mkdirSync(join(env.dir, 'work', 'DEMO-1', 'calls'), { recursive: true });
  writeFileSync(join(env.dir, 'work', 'DEMO-1', 'calls', 'query-left-behind.txt'), 'old source text');
  const { code } = await run(env, fakeWriter().writer);
  assert.equal(code, EXIT.OK);
  assert.deepEqual(readdirSync(join(env.dir, 'work', 'DEMO-1', 'calls')), []);
});

test('usage, config and missing writer identity exit CONFIG_INVALID before anything runs', async t => {
  const env = setup(t, []);
  const quiet = { stdout: silent(), stderr: silent() };
  const base = ['--config', join(env.dir, 'config.json'), '--receipts', join(env.dir, 'receipts')];
  assert.equal(await historyNightCli(['--config', join(env.dir, 'config.json')], quiet), EXIT.CONFIG_INVALID);
  assert.equal(await historyNightCli([...base, '--config-sha256', `sha256:${'0'.repeat(64)}`], quiet), EXIT.CONFIG_INVALID);
  assert.equal(await historyNightCli([...base, '--projects', 'OTHER-1'], quiet), EXIT.CONFIG_INVALID);
  const { writer_id, ...anonymous } = env.config.writer;
  writeFileSync(join(env.dir, 'config.json'), JSON.stringify({ ...env.config, writer: anonymous }));
  assert.equal(await historyNightCli(base, quiet), EXIT.CONFIG_INVALID);
  assert.deepEqual(readdirSync(join(env.dir, 'receipts')), []);
});

test('the default writer kills the whole process tree on timeout and reports ETIMEDOUT', async () => {
  const { EventEmitter } = await import('node:events');
  const { hermesWriter } = await import('../../harness/history_night.mjs');
  const killed = [], spawned = [];
  const spawner = (command, args) => {
    spawned.push(args);
    const child = new EventEmitter();
    child.pid = 4242; child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    return child;
  };
  const writer = hermesWriter({ command: 'hermes', profile: 'history-writer', runBudget: 1200, spawner,
    killTree: child => { killed.push(child.pid); return 'taskkill'; }, killGraceMs: 10 });
  const result = await writer({ queryFile: 'q.txt', workDir: '.', timeoutMs: 10 });
  assert.deepEqual(killed, [4242]);
  assert.deepEqual(result, { exit_code: null, stdout: '', error_code: 'ETIMEDOUT', timed_out: true });
  assert.deepEqual(spawned[0].slice(0, 5), ['-p', 'history-writer', 'chat', '-Q', '--query-file']);
});

test('lock heal re-checks the moved lock and puts back a lock replaced after it was read', t => {
  const dir = mkdtempSync(join(tmpdir(), 'history-night-lock-synthetic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, LOCK_FILE_NAME);
  writeFileSync(file, JSON.stringify({ pid: 424242, started_at: '2026-09-24T17:30:00Z', token: 'stale' }));
  const live = JSON.stringify({ pid: 434343, started_at: '2026-09-24T17:31:00Z', token: 'live' });
  // The stale owner is judged dead, but a live run replaces the lock before the rename.
  const result = acquireNightLock(dir, { now: '2026-09-24T17:32:00Z',
    isPidAlive: () => { writeFileSync(file, live); return false; } });
  assert.equal(result.acquired, false); assert.equal(result.reason, 'history_night_lock_held');
  assert.equal(readFileSync(file, 'utf8'), live);
  assert.deepEqual(readdirSync(dir), [LOCK_FILE_NAME]);
  // The unchanged stale lock is still healed.
  const healed = acquireNightLock(dir, { now: '2026-09-24T17:32:00Z', isPidAlive: () => false });
  assert.equal(healed.acquired, true); assert.equal(healed.healed, 'owner_dead');
  assert.deepEqual(readdirSync(dir), [LOCK_FILE_NAME]);
});
