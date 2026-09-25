import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historyPrepareCli } from '../../src/history_prepare_cli.mjs';
import { prepareHistory, yesterdayKst } from '../../src/knowledge_layer/history_prepare.mjs';

const lanes = () => Object.fromEntries(['mail', 'slack', 'linear', 'voice']
  .map(name => [name, { status: 'ok', read: 0 }]));
const record = (id, date, text, extra = {}) => ({ id, date, kind: 'mail',
  title: 'Synthetic title', sender: 'Person A', recipient: 'Person B', text,
  originrefs: [`synthetic:${id}`], ...extra });
const collected = (records, extra = {}) => ({ records, displayMetadata: {},
  coverage: { lanes: lanes(), excluded: [] },
  sourceReceipts: [{ kind: 'synthetic', count: records.length }], ...extra });
const root = () => {
  const dir = mkdtempSync(join(tmpdir(), 'history-prep-synthetic-'));
  return [dir, () => rmSync(dir, { recursive: true, force: true })];
};
const options = (dir, rows) => ({ project: 'DEMO-1', date: '2026-09-23',
  outputRoot: dir, sourceConfig: { type: 'synthetic' },
  collector: async () => collected(rows) });

test('KST yesterday and source snapshot stay deterministic without a history run', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  assert.equal(yesterdayKst(new Date('2026-09-23T14:59:59Z')), '2026-09-22');
  assert.equal(yesterdayKst(new Date('2026-09-23T15:00:00Z')), '2026-09-23');
  const observed = [];
  const request = { project: 'DEMO-1', outputRoot: dir, sourceConfig: { type: 'synthetic' },
    now: new Date('2026-09-24T03:00:00Z'), collector: async args => {
      observed.push(args); return collected([record('A', '2026-09-23', 'A source fact')]); } };
  const first = await prepareHistory(request);
  assert.equal(first.status, 'source_frozen'); assert.equal(first.history_calls, 0);
  assert.deepEqual(first.processing_dates, ['2026-09-23']);
  assert.deepEqual(observed[0], { project: 'DEMO-1', fromDate: '2026-09-01',
    throughDate: '2026-09-23', sourceConfig: { type: 'synthetic' } });
  assert.equal(JSON.parse(readFileSync(join(dir, first.input_file), 'utf8')).records.length, 1);
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  const head = JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8'));
  assert.equal(head.input_file, first.input_file);
  assert.equal(JSON.parse(readFileSync(join(dir, first.receipt_file), 'utf8')).status, 'source_frozen');
  const repeated = await prepareHistory(request);
  assert.equal(repeated.input_file, first.input_file);
  assert.deepEqual(repeated.changed_days, []);
  const steady = readdirSync(dir).sort();
  await prepareHistory(request);
  assert.deepEqual(readdirSync(dir).sort(), steady);
});

test('initial trusted empty or AI-only exclusion freezes no history head', async t => {
  for (const excluded of [[], [{ kind: 'ai_work_note', reason: 'excluded' }]]) {
    const [dir, cleanup] = root(); t.after(cleanup);
    const first = await prepareHistory({ ...options(dir, []), collector: async () => collected([], {
      coverage: { lanes: lanes(), excluded } }) });
    assert.equal(first.status, 'no_sources');
    assert.deepEqual(first.processing_dates, []);
    assert.equal(JSON.parse(readFileSync(join(dir, first.receipt_file), 'utf8')).status, 'no_sources');
    assert.equal(readdirSync(dir).includes('history-prepare-head.json'), false);
  }
});

test('scoped source preparation preserves outside records and records trusted deletions', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const original = [record('A', '2026-09-10', 'Older source'),
    record('B', '2026-09-23', 'Target source')];
  const first = await prepareHistory(options(dir, original));
  assert.deepEqual(first.changed_days, ['2026-09-10', '2026-09-23']);
  const scoped = await prepareHistory({ ...options(dir, [original[1]]), fromDate: '2026-09-23' });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, scoped.input_file), 'utf8'))
    .records.map(row => row.id), ['A', 'B']);
  const deleted = await prepareHistory({ ...options(dir, []), fromDate: '2026-09-23' });
  assert.deepEqual(deleted.changed_days, ['2026-09-23']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, deleted.input_file), 'utf8'))
    .records.map(row => row.id), ['A']);
  assert.equal(JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8'))
    .input_file, deleted.input_file);
});

test('a moved source ID updates both dated positions without touching unrelated records', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  await prepareHistory(options(dir, [record('MOVE', '2026-09-05', 'Moved source'),
    record('KEEP', '2026-09-10', 'Unrelated source'),
    record('TARGET', '2026-09-23', 'Target source')]));
  const moved = await prepareHistory({ ...options(dir, [
    record('MOVE', '2026-09-22', 'Moved source'),
    record('TARGET', '2026-09-23', 'Target source')]), fromDate: '2026-09-20' });
  assert.deepEqual(moved.changed_days, ['2026-09-05', '2026-09-22']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, moved.input_file), 'utf8'))
    .records.map(row => [row.id, row.date]), [
    ['KEEP', '2026-09-10'], ['MOVE', '2026-09-22'], ['TARGET', '2026-09-23']]);
});

test('source HOLD and memo refusal leave the prepared baseline unchanged', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  await prepareHistory(options(dir, [record('A', '2026-09-23', 'Original')]));
  const before = readFileSync(join(dir, 'history-prepare-head.json'));
  const held = await prepareHistory({ ...options(dir, []), collector: async () => collected([], {
    coverage: { lanes: { ...lanes(), mail: { status: 'missing' } }, excluded: [] } }) });
  assert.equal(held.status, 'source_hold'); assert.equal(held.history_calls, 0);
  await assert.rejects(prepareHistory({ ...options(dir, [record('M', '2026-09-23',
    'AI note', { kind: 'ai_work_note' })]) }), /history_ai_work_memo_excluded/u);
  assert.deepEqual(readFileSync(join(dir, 'history-prepare-head.json')), before);
  await assert.rejects(prepareHistory({ ...options(dir, []), mode: 'run' }),
    /history_prepare_request_invalid/u);
});

test('source CLI exposes only prepare and requires no model binding or subprocess', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const sourceFile = join(dir, 'sources.json');
  writeFileSync(sourceFile, JSON.stringify({ type: 'synthetic' }));
  let out = '', err = '';
  assert.equal(await historyPrepareCli(['--help'], {
    stdout: { write: value => { out += value; } } }), 0);
  assert.match(out, /--prepare/u);
  out = '';
  const code = await historyPrepareCli(['--prepare', '--project', 'DEMO-1',
    '--sources', sourceFile, '--output-root', dir], {
    now: new Date('2026-09-24T03:00:00Z'),
    collector: async () => collected([record('A', '2026-09-23', 'A source')]),
    stdout: { write: value => { out += value; } }, stderr: { write: value => { err += value; } } });
  assert.equal(code, 0, err); assert.equal(JSON.parse(out).status, 'source_frozen');
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  err = '';
  assert.equal(await historyPrepareCli(['--run', '--project', 'DEMO-1',
    '--sources', sourceFile, '--output-root', dir], {
    stderr: { write: value => { err += value; } } }), 2);
  assert.match(err, /history_prepare_mode_invalid/u);
  err = '';
  assert.equal(await historyPrepareCli(['--prepare', '--project', 'DEMO-1',
    '--sources', sourceFile, '--output-root', dir, '--binding', sourceFile], {
    stderr: { write: value => { err += value; } } }), 2);
  assert.match(err, /history_prepare_arguments_invalid/u);
});
