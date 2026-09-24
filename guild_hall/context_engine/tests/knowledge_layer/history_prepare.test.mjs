import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historyPrepareCli } from '../../src/history_prepare_cli.mjs';
import { prepareHistory, yesterdayKst } from '../../src/knowledge_layer/history_prepare.mjs';
import { runHistory } from '../../src/knowledge_layer/history.mjs';
import { hashText } from '../../src/knowledge_layer/data.mjs';

const lanes = () => Object.fromEntries(['mail', 'slack', 'linear', 'voice'].map(name => [name, { status: 'ok', read: 0 }]));
const record = (id, date, text, extra = {}) => ({ id, date, kind: 'mail', title: 'Synthetic title',
  sender: 'Person A', recipient: 'Person B', text, originrefs: [`synthetic:${id}`], ...extra });
const collected = (records, extra = {}) => ({ records, displayMetadata: {},
  coverage: { lanes: lanes(), excluded: [] }, sourceReceipts: [{ kind: 'synthetic', count: records.length }], ...extra });
const model = { model_id: 'synthetic-model', model_pin: hashText('pin'), prompt_version: 'v1', prompt_content: '',
  max_tokens: 4096, temperature: 0, max_calls: 30, per_call_timeout_ms: 10000, wall_timeout_ms: 60000,
  max_input_characters: 100000, max_output_characters: 100000 };
const root = () => { const dir = mkdtempSync(join(tmpdir(), 'history-prep-synthetic-'));
  return [dir, () => rmSync(dir, { recursive: true, force: true })]; };
const fakeGenerate = calls => async request => {
  calls.push(request);
  const payload = JSON.parse(request.user);
  if (request.layer === 'daily') {
    const source = payload.threads[0].records[0];
    return JSON.stringify({ events: [{ text: 'Recorded event', evidence: [{ source_id: source.id, quote: source.text.slice(0, 3) }] }] });
  }
  const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
  return JSON.stringify({ events: [{ text: 'Recorded summary', child_card_ids: child ? [child.card_id] : [],
    evidence: child?.evidence ?? [] }] });
};
function invoke(dir, calls, config = model) {
  return async ({ inputFile }) => ({ exitCode: 0,
    result: await runHistory({ input: JSON.parse(readFileSync(inputFile, 'utf8')),
      outputRoot: dir, config, generate: fakeGenerate(calls) }) });
}

test('KST yesterday and month-bounded prepare snapshot are deterministic with no model call', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  assert.equal(yesterdayKst(new Date('2026-09-23T14:59:59Z')), '2026-09-22');
  assert.equal(yesterdayKst(new Date('2026-09-23T15:00:00Z')), '2026-09-23');
  const observed = [];
  const options = { project: 'DEMO-1', outputRoot: dir, sourceConfig: { type: 'synthetic' }, mode: 'prepare',
    now: new Date('2026-09-24T03:00:00Z'), collector: async args => {
      observed.push(args); return collected([record('A', '2026-09-23', 'A source fact')]); } };
  const first = await prepareHistory(options);
  assert.equal(first.status, 'prepared'); assert.equal(first.history_calls, 0);
  assert.deepEqual(first.processing_dates, ['2026-09-23']);
  assert.deepEqual(observed[0], { project: 'DEMO-1', fromDate: '2026-09-01', throughDate: '2026-09-23',
    sourceConfig: { type: 'synthetic' } });
  const input = JSON.parse(readFileSync(join(dir, first.input_file), 'utf8'));
  assert.equal(input.as_of, '2026-09-23'); assert.equal(input.records.length, 1);
  const before = readdirSync(dir).sort();
  const second = await prepareHistory(options);
  assert.equal(second.input_file, first.input_file);
  assert.deepEqual(readdirSync(dir).sort(), before);
});

test('fully covered initial empty or AI-only day records no_sources without a history head', async t => {
  for (const excluded of [[], [{ kind: 'ai_work_note', reason: 'excluded' }]]) {
    const [dir, cleanup] = root(); t.after(cleanup);
    const options = { project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
      sourceConfig: {}, mode: 'run', collector: async () => collected([], {
        coverage: { lanes: lanes(), excluded } }),
      invokeHistory: async () => { throw new Error('no history call for empty day'); } };
    const first = await prepareHistory(options);
    assert.equal(first.status, 'no_sources'); assert.equal(first.history_calls, 0);
    assert.deepEqual(first.changed_days, []); assert.deepEqual(first.processing_dates, []);
    const receipt = JSON.parse(readFileSync(join(dir, first.receipt_file), 'utf8'));
    assert.equal(receipt.status, 'no_sources'); assert.deepEqual(receipt.coverage.excluded, excluded);
    assert.equal(readdirSync(dir).includes('history-head.json'), false);
    assert.equal(readdirSync(dir).includes('history-prepare-head.json'), false);
    const before = readdirSync(dir).sort();
    const again = await prepareHistory(options);
    assert.equal(again.status, 'no_sources'); assert.deepEqual(readdirSync(dir).sort(), before);
  }
});

test('run baseline preserves outside-window records, catches late changes and trusted deletions', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  let rows = [record('A', '2026-09-10', 'Older source'), record('B', '2026-09-23', 'Target source')];
  const calls = [], options = { project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: { type: 'synthetic' }, mode: 'run',
    collector: async () => collected(rows), invokeHistory: invoke(dir, calls) };
  const first = await prepareHistory(options);
  assert.equal(first.status, 'completed'); assert.equal(first.history_calls, 6);
  assert.deepEqual(first.changed_days, ['2026-09-10', '2026-09-23']);
  const savedHead = JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8'));
  const unchanged = await prepareHistory({ ...options, invokeHistory: async () => { throw new Error('no model'); } });
  assert.equal(unchanged.status, 'unchanged'); assert.equal(unchanged.history_calls, 0);
  rows = [record('B', '2026-09-23', 'Target source')];
  const scoped = await prepareHistory({ ...options, fromDate: '2026-09-23' });
  assert.equal(scoped.status, 'unchanged'); assert.equal(scoped.history_calls, 0);
  const scopedInput = JSON.parse(readFileSync(join(dir, scoped.input_file), 'utf8'));
  assert.deepEqual(scopedInput.records.map(row => row.id), ['A', 'B']);
  rows = [];
  const deleted = await prepareHistory({ ...options, fromDate: '2026-09-23' });
  assert.deepEqual(deleted.changed_days, ['2026-09-23']);
  assert.deepEqual(deleted.processing_dates, ['2026-09-23']);
  const afterDelete = JSON.parse(readFileSync(join(dir, deleted.input_file), 'utf8'));
  assert.deepEqual(afterDelete.records.map(row => row.id), ['A']);
  assert.notDeepEqual(JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8')), savedHead);
});

test('missing source lane and explicit AI memo hold without erasing prior baseline', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const base = { project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: { type: 'synthetic' }, mode: 'run', collector: async () => collected([record('A', '2026-09-23', 'Original')]),
    invokeHistory: invoke(dir, []) };
  await prepareHistory(base);
  const headBytes = readFileSync(join(dir, 'history-prepare-head.json'));
  const held = await prepareHistory({ ...base, collector: async () => collected([], {
    coverage: { lanes: { ...lanes(), mail: { status: 'missing', error_code: 'reader_unavailable' } }, excluded: [] },
    sourceReceipts: [{ kind: 'mail', status: 'missing', code: 'reader_unavailable' }] }) });
  assert.equal(held.status, 'source_hold'); assert.equal(held.history_calls, 0);
  assert.equal(held.lane_statuses.mail, 'missing');
  const holdReceipt = JSON.parse(readFileSync(join(dir, held.receipt_file), 'utf8'));
  assert.equal(holdReceipt.status, 'source_hold'); assert.equal(holdReceipt.coverage.lanes.mail.error_code, 'reader_unavailable');
  assert.equal('records' in holdReceipt, false); assert.equal('input_file' in holdReceipt, false);
  await assert.rejects(prepareHistory({ ...base, collector: async () => ({ records: [], coverage: {} }) }),
    /history_prepare_source_invalid/);
  await assert.rejects(prepareHistory({ ...base, collector: async () => collected([]) }),
    /history_prepare_empty_or_duplicate/);
  await assert.rejects(prepareHistory({ ...base, collector: async () => collected([
    record('M', '2026-09-23', 'AI note', { kind: 'ai_work_note' })]) }), /history_ai_work_memo_excluded/);
  assert.deepEqual(readFileSync(join(dir, 'history-prepare-head.json')), headBytes);
});

test('same source with changed binding invokes history again while an identical binding skips it', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const calls = [], base = { project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: {}, mode: 'run', collector: async () => collected([record('A', '2026-09-23', 'Source fact')]),
    invokeHistory: invoke(dir, calls) };
  const first = await prepareHistory({ ...base, bindingFingerprint: hashText('binding-v1') });
  assert.equal(first.status, 'completed');
  const skipped = await prepareHistory({ ...base, bindingFingerprint: hashText('binding-v1'),
    invokeHistory: async () => { throw new Error('same binding must skip'); } });
  assert.equal(skipped.status, 'unchanged');
  let invoked = 0;
  const changed = await prepareHistory({ ...base, bindingFingerprint: hashText('binding-v2'),
    invokeHistory: async args => { invoked++; return invoke(dir, calls)(args); } });
  assert.equal(invoked, 1); assert.equal(changed.status, 'completed');
  assert.equal(changed.history_calls, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8')).binding_fingerprint,
    hashText('binding-v2'));
});

test('a stable source ID moved into the scan window replaces its old date and keeps unrelated outside records', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  let rows = [record('MOVE', '2026-09-05', 'Moved source'), record('KEEP', '2026-09-10', 'Unrelated source'),
    record('TARGET', '2026-09-23', 'Target source')];
  const calls = [], base = { project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: {}, mode: 'run', collector: async () => collected(rows), invokeHistory: invoke(dir, calls) };
  await prepareHistory(base);
  rows = [record('MOVE', '2026-09-22', 'Moved source'), record('TARGET', '2026-09-23', 'Target source')];
  const moved = await prepareHistory({ ...base, fromDate: '2026-09-20' });
  assert.equal(moved.status, 'completed');
  assert.deepEqual(moved.changed_days, ['2026-09-05', '2026-09-22']);
  assert.deepEqual(moved.processing_dates, ['2026-09-05', '2026-09-22', '2026-09-23']);
  const current = JSON.parse(readFileSync(join(dir, moved.input_file), 'utf8'));
  assert.deepEqual(current.records.map(row => [row.id, row.date]),
    [['KEEP', '2026-09-10'], ['MOVE', '2026-09-22'], ['TARGET', '2026-09-23']]);
});

test('partial history head advances only when it matches the prepared input', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const text = 'Long synthetic source '.repeat(110);
  const config = { ...model, daily_batch_characters: 1200 };
  const partial = await prepareHistory({ project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: {}, mode: 'run', collector: async () => collected([record('A', '2026-09-23', text)]),
    invokeHistory: async ({ inputFile }) => ({ exitCode: 2,
      result: await runHistory({ input: JSON.parse(readFileSync(inputFile, 'utf8')), outputRoot: dir,
        config, generate: async request => request.layer === 'daily' ? '{invalid' : JSON.stringify({ events: [] }) }) }) });
  assert.equal(partial.status, 'prepared_partial'); assert.equal(partial.history_status, 'generated_partial');
  assert.ok(JSON.parse(readFileSync(join(dir, 'history-prepare-head.json'), 'utf8')).history_head_sha256);
  const prior = readFileSync(join(dir, 'history-prepare-head.json'));
  const failed = await prepareHistory({ project: 'DEMO-1', date: '2026-09-23', outputRoot: dir,
    sourceConfig: {}, mode: 'run', collector: async () => collected([record('A', '2026-09-23', text + ' change')]),
    invokeHistory: async () => ({ exitCode: 2, result: { status: 'failed', calls: 0 } }) });
  assert.equal(failed.status, 'history_failed');
  assert.deepEqual(readFileSync(join(dir, 'history-prepare-head.json')), prior);
});

test('CLI help and prepare mode do not call the model', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const sourceFile = join(dir, 'sources.json'), bindingFile = join(dir, 'binding.json');
  writeFileSync(sourceFile, JSON.stringify({ type: 'synthetic' })); writeFileSync(bindingFile, JSON.stringify(model));
  let out = '', err = '';
  const help = await historyPrepareCli(['--help'], { stdout: { write: text => { out += text; } } });
  assert.equal(help, 0); assert.match(out, /--prepare/);
  out = '';
  const code = await historyPrepareCli(['--prepare', '--project', 'DEMO-1', '--sources', sourceFile,
    '--output-root', dir, '--binding', bindingFile], {
    now: new Date('2026-09-24T03:00:00Z'), collector: async () => collected([record('A', '2026-09-23', 'A source')]),
    invokeHistory: async () => { throw new Error('must not call'); },
    stdout: { write: text => { out += text; } }, stderr: { write: text => { err += text; } } });
  assert.equal(code, 0, err); assert.equal(JSON.parse(out).status, 'prepared');
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  out = '';
  const held = await historyPrepareCli(['--prepare', '--project', 'DEMO-1', '--sources', sourceFile,
    '--output-root', dir, '--binding', bindingFile], {
    now: new Date('2026-09-24T03:00:00Z'), collector: async () => collected([], {
      coverage: { lanes: { ...lanes(), voice: { status: 'error', error_code: 'reader_error' } }, excluded: [] } }),
    stdout: { write: text => { out += text; } }, stderr: { write: text => { err += text; } } });
  assert.equal(held, 2); assert.equal(JSON.parse(out).status, 'source_hold');
});
