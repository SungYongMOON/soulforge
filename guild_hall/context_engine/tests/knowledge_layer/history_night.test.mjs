// Nightly history step with synthetic sources and a fake writer: no model, no Hermes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT, LOCK_FILE_NAME, historyNightCli } from '../../harness/history_night.mjs';

const lanes = () => Object.fromEntries(['mail', 'slack', 'linear', 'voice']
  .map(name => [name, { status: 'ok', read: 0 }]));
const record = (id, date, text) => ({ id, date, kind: 'mail', title: 'Synthetic title',
  sender: 'Person A', recipient: 'Person B', text, originrefs: [`synthetic:${id}`] });

function setup(t, rows) {
  const dir = mkdtempSync(join(tmpdir(), 'history-night-synthetic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['out', 'work', 'receipts']) mkdirSync(join(dir, name));
  writeFileSync(join(dir, 'rules.md'), '# synthetic rules v1\nWrite short past-tense facts.\n');
  writeFileSync(join(dir, 'sources.json'), JSON.stringify({ project: 'DEMO-1', type: 'synthetic' }));
  const config = { schema: 'soulforge.history_night_config.v1', rules_file: join(dir, 'rules.md'),
    rules_version: 'synthetic rules v1', work_root: join(dir, 'work'),
    writer: { command: join(dir, 'never-run.exe'), profile: 'history-writer', run_budget: 1200 },
    projects: [{ project: 'DEMO-1', sources: join(dir, 'sources.json'), output_root: join(dir, 'out') }] };
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  const state = { rows };
  const collector = async () => ({ records: state.rows, displayMetadata: {},
    coverage: { lanes: lanes(), excluded: [] }, sourceReceipts: [] });
  return { dir, state, collector };
}

// Answers from the query alone, like the real profile would: it copies the ids
// the skeleton line names and cites the first evidence id it was given.
function answer(query) {
  const lines = query.split('\n');
  const skeleton = JSON.parse(lines.find(line => line.startsWith('{"schema"')));
  const marker = lines.findIndex(line => line === '자료 배치:' || line === '하위 카드:');
  const payload = JSON.parse(lines[marker + 1]);
  const ids = lines[marker] === '자료 배치:'
    ? payload.user.threads.flatMap(thread => thread.records).map(row => row.source_id ?? row.id)
    : payload.map(card => card.card_id);
  return JSON.stringify({ ...skeleton, drafts: [{ packet_id: skeleton.drafts[0].packet_id,
    sentences: ids.length ? [{ text: 'A synthetic fact happened.', evidence_ids: [ids[0]] }] : [] }] });
}
function fakeWriter(script = () => 'ok') {
  const calls = [];
  const writer = async request => {
    const query = readFileSync(request.queryFile, 'utf8');
    calls.push({ layer: request.layer, key: request.key, attempt: request.attempt, retryHint: query.endsWith('JSON으로만 답하라.\n') });
    const mode = script(request, calls.length);
    if (mode === 'garbage') return { exit_code: 0, stdout: 'not json at all', error_code: null };
    if (mode === 'crash') return { exit_code: 1, stdout: '', error_code: null };
    return { exit_code: 0, stdout: `thinking...\n${answer(query)}\n`, error_code: null };
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
  assert.equal(one.receipt.projects[0].status, 'finalized');
  assert.equal(one.receipt.projects[0].accepted_cells, 4);
  assert.equal(JSON.stringify(one.receipt).includes('synthetic source line'), false);
  assert.equal(JSON.stringify(one.receipt).includes('A synthetic fact'), false);
  const again = fakeWriter();
  const two = await run(env, again.writer);
  assert.equal(two.code, EXIT.OK);
  assert.equal(again.calls.length, 0);
  assert.equal(two.receipt.totals.calls, 0);
  assert.equal(two.receipt.projects[0].status, 'unchanged');
});

test('a bad first answer is retried once with the JSON-only hint and then accepted', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Retry source.')]);
  const fake = fakeWriter((request, n) => (n === 1 ? 'garbage' : 'ok'));
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.OK);
  assert.deepEqual(fake.calls.slice(0, 2).map(call => [call.layer, call.attempt, call.retryHint]),
    [['daily', 1, false], ['daily', 2, true]]);
  const daily = receipt.projects[0].units[0];
  assert.equal(daily.status, 'accepted');
  assert.deepEqual(daily.attempts.map(item => item.result), ['format_invalid_after_retry', 'accepted']);
});

test('two failed answers mark the batch unprocessed and the day is still finalized', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Unprocessed source.')]);
  const fake = fakeWriter(request => (request.layer === 'daily' ? 'crash' : 'ok'));
  const { code, receipt } = await run(env, fake.writer);
  assert.equal(code, EXIT.OK);
  const project = receipt.projects[0];
  assert.equal(project.units[0].status, 'unprocessed');
  assert.equal(project.units[0].attempts.length, 2);
  assert.equal(project.unprocessed_batches, 1);
  assert.equal(receipt.totals.unprocessed, 1);
  assert.equal(fake.calls.filter(call => call.layer === 'daily').length, 2);
});

test('the no-start cutoff leaves unstarted batches for the next night without repeating finished ones', async t => {
  const env = setup(t, [record('A', '2026-09-22', 'Day one.'), record('B', '2026-09-23', 'Day two.')]);
  let now = Date.parse('2026-09-24T18:00:00Z');
  const clock = () => new Date(now).toISOString();
  const fake = fakeWriter(() => { now += 2 * 60 * 60 * 1000; return 'ok'; });
  const stopped = await run(env, fake.writer, ['--deadline', '05:00', '--no-start-within', '20'], { clock });
  assert.equal(stopped.code, EXIT.PARTIAL);
  assert.equal(stopped.receipt.status, 'PARTIAL');
  assert.equal(stopped.receipt.deadline.stopped, true);
  assert.equal(fake.calls.length, 1);
  assert.equal(stopped.receipt.projects[0].status, 'deferred_deadline');
  assert.deepEqual(stopped.receipt.projects[0].units.map(unit => unit.status), ['accepted', 'not_started']);
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

test('a held lock refuses the run; a lock whose owner pid is dead is healed', async t => {
  const env = setup(t, [record('A', '2026-09-23', 'Locked.')]);
  const lockFile = join(env.dir, 'receipts', LOCK_FILE_NAME);
  writeFileSync(lockFile, JSON.stringify({ pid: 424242, started_at: 'x', token: 'other' }));
  const fake = fakeWriter();
  const held = await run(env, fake.writer, [], { isPidAlive: () => true });
  assert.equal(held.code, EXIT.LOCK_HELD);
  assert.equal(held.receipt.status, 'LOCK_HELD');
  assert.equal(fake.calls.length, 0);
  writeFileSync(join(env.dir, 'receipts', LOCK_FILE_NAME), 'not json');
  const unreadable = await run(env, fake.writer, [], { isPidAlive: () => false });
  assert.equal(unreadable.code, EXIT.LOCK_HELD);
  writeFileSync(join(env.dir, 'receipts', LOCK_FILE_NAME), JSON.stringify({ pid: 424242, started_at: 'x', token: 'other' }));
  const healed = await run(env, fake.writer, [], { isPidAlive: () => false });
  assert.equal(healed.code, EXIT.OK);
  assert.equal(healed.receipt.lock.healed_stale, true);
});

test('usage and config problems exit CONFIG_INVALID before anything runs', async t => {
  const env = setup(t, []);
  const quiet = { stdout: silent(), stderr: silent() };
  assert.equal(await historyNightCli(['--config', join(env.dir, 'config.json')], quiet), EXIT.CONFIG_INVALID);
  assert.equal(await historyNightCli(['--config', join(env.dir, 'config.json'), '--receipts', join(env.dir, 'receipts'),
    '--config-sha256', `sha256:${'0'.repeat(64)}`], quiet), EXIT.CONFIG_INVALID);
  assert.equal(await historyNightCli(['--config', join(env.dir, 'config.json'), '--receipts', join(env.dir, 'receipts'),
    '--projects', 'OTHER-1'], quiet), EXIT.CONFIG_INVALID);
  assert.deepEqual(readdirSync(join(env.dir, 'receipts')), []);
});
