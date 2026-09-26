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

// Input format v2: a large synthetic recording stays within the shared plain-data budget.
test('a 2,000-line synthetic recording prepares a whole month and its day packet, all within the plain-data budget', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const { digest, hashText } = await import('../../src/knowledge_layer/data.mjs');
  const { prepareHistoryExchange } = await import('../../src/knowledge_layer/history_exchange.mjs');
  const group = { source_kind: 'voice', session_id: '20260923_090000_demo', card_run_id: 'card-run',
    card_segment_id: 'seg-1', card_sha256: hashText('card'), manifest_sha256: hashText('manifest'),
    transcript_sha256: hashText('transcript'), transcript_path: ['2026-09-23', '20260923_090000_demo', 'transcript.jsonl'],
    source_root: '/synthetic/sessions', card_source_root: '/synthetic/cards', attribution: 'candidate_only_not_accepted',
    route_ledger_sha256: null, segment_title: '합성 구간', derived_title_only: true, semantic_fact_verified: false };
  const key = digest(group).slice(7, 23);
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: `voice_utterance:${'a'.repeat(16)}:${String(i).padStart(8, '0')}`,
    project: 'DEMO-1', date: '2026-09-23', kind: 'voice_utterance', title: '', sender: '발화자 미확인', recipient: '미기록',
    attachments: [], thread_ref: 'voice:' + 'a'.repeat(16), text: `합성 발화 ${i} 번째 문장입니다`, evidence_mode: 'source_id',
    originrefs: [{ voice_group: key, source_offsets: [[i, i * 2, i * 2 + 2]] }] }));
  const display = { voice_recordings: { [group.session_id]: { title: '합성 녹음', recorded_at: '2026-09-23T09:00:00+09:00' } } };
  const result = await prepareHistory({ ...options(dir, rows), collector: async () =>
    collected(rows, { voiceGroups: { [key]: group }, displayMetadata: display }) });
  assert.equal(result.status, 'source_frozen');
  const input = JSON.parse(readFileSync(join(dir, result.input_file), 'utf8'));
  assert.equal(input.schema, 'soulforge.history_input.v2');
  assert.deepEqual(Object.keys(input.voice_groups), [key]); assert.equal(input.records.length, 2000);
  // The whole compact day fits one bounded snapshot (the day packet digests it); the
  // old per-line bookkeeping (~800 characters a line) would not.
  assert.doesNotThrow(() => digest(input));
  assert.throws(() => digest({ ...input, records: input.records.map(row => ({ ...row,
    originrefs: [{ ...group, source_offsets: row.originrefs[0].source_offsets }] })) }), /knowledge_input_budget/);
  const out = mkdtempSync(join(tmpdir(), 'history-prep-exchange-')); t.after(() => rmSync(out, { recursive: true, force: true }));
  const displayMetadata = JSON.parse(readFileSync(join(dir, result.display_file), 'utf8'));
  const prepared = prepareHistoryExchange({ input, outputRoot: out, rulesText: 'Synthetic rules v1', displayMetadata });
  assert.equal(prepared.status, 'prepared'); assert.equal(prepared.packets[0].layer, 'daily');
  // Re-reading the stored input verifies its piecewise digest; an unchanged rerun is a no-op.
  const again = await prepareHistory({ ...options(dir, rows), collector: async () =>
    collected(rows, { voiceGroups: { [key]: group }, displayMetadata: display }) });
  assert.equal(again.input_file, result.input_file); assert.deepEqual(again.changed_days, []);
});

test('prepare records a collection note from the lane receipts in the display metadata', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const coverage = { lanes: { mail: { status: 'ok', counts: { oversize: 1 }, not_collected: ['mail_not_collected_before:2026-05'] },
    slack: { status: 'ok', counts: { held: 2, held_time_unknown: 1 } }, linear: { status: 'ok' },
    voice: { status: 'ok', sessions_without_card: 4 } }, excluded: [] };
  const result = await prepareHistory({ ...options(dir, []), collector: async () =>
    collected([record('A', '2026-09-23', 'A fact')], { coverage }) });
  const display = JSON.parse(readFileSync(join(dir, result.display_file), 'utf8'));
  assert.deepEqual(display.coverage_note, { voice_without_card: 4, slack_held: 3,
    mail_not_collected: ['mail_not_collected_before:2026-05'], mail_oversize: 1 });
});
