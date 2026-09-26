import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordFailedHistoryBatch, runHistory, renderHistory, historySourceLabel, normalizeHistoryInput,
  PARAGRAPH_MAX_SENTENCES, PARAGRAPH_MAX_CHARS } from '../../src/knowledge_layer/history.mjs';
import { bisectBatch, partitionDay } from '../../src/knowledge_layer/history_batches.mjs';
import { digest, hashText } from '../../src/knowledge_layer/data.mjs';

const config = { model_id: 'synthetic-model', model_pin: hashText('pin'), prompt_version: 'v1', prompt_content: '',
  max_tokens: 8192, temperature: 0, max_calls: 30, per_call_timeout_ms: 480000, wall_timeout_ms: 10800000,
  max_input_characters: 150000, max_output_characters: 100000 };
const record = (id, date, text, extra = {}) => ({ id, date, kind: 'mail', title: 'Synthetic title', sender: 'Sender',
  recipient: 'Recipient', text, originrefs: { source: `synthetic:${id}` }, ...extra });
const input = records => ({ project: 'DEMO-1', month: '2026-09', as_of: '2026-09-19', records });
function root() { const dir = mkdtempSync(join(tmpdir(), 'history-synthetic-')); return [dir, () => rmSync(dir, { recursive: true, force: true })]; }
function fake(calls, output = null) {
  return async request => {
    calls.push(request);
    if (output) return output(request);
    const payload = JSON.parse(request.user), child = payload.days?.[0]?.cards?.[0]
      ?? payload.weeks?.[0]?.cards?.[0] ?? payload.monthly?.cards?.[0];
    const source = payload.threads?.[0]?.records?.[0];
    const evidence = child?.evidence?.[0] ?? { source_id: source.id, quote: source.text.slice(0, 4) };
    return JSON.stringify({ events: [{ text: `${request.layer} past fact`,
      child_card_ids: child ? [child.card_id] : [], evidence: [evidence] }] });
  };
}
function cell(dir, fingerprint) { return JSON.parse(readFileSync(join(dir, `history-cell-${fingerprint.slice(7)}.json`), 'utf8')); }
function files(dir) { return new Map(readdirSync(dir).map(name => [name, readFileSync(join(dir, name))])); }

test('four layers, unchanged no-op, changed ancestor chain and immutable unrelated week', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-03', 'A source fact'), record('B', '2026-09-08', 'B source fact')];
  const calls = [], generate = fake(calls);
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate });
  assert.equal(first.status, 'generated'); assert.deepEqual(first.changed.map(c => c.layer),
    ['daily', 'daily', 'weekly', 'weekly', 'monthly', 'status']);
  assert.equal(first.calls, 6);
  const before = files(dir);
  const noOp = await runHistory({ input: input([...rows].reverse()), outputRoot: dir, config, generate });
  assert.equal(noOp.status, 'unchanged'); assert.equal(noOp.calls, 0);
  assert.deepEqual(files(dir), before);
  const changed = await runHistory({ input: input([record('A', '2026-09-03', 'A corrected source fact'), rows[1]]), outputRoot: dir, config, generate });
  assert.deepEqual(changed.changed.map(c => c.layer), ['daily', 'weekly', 'monthly', 'status']);
  const untouched = Object.keys(first.head.cells.weekly).find(k => k.startsWith('2026-09-07'));
  assert.equal(changed.head.cells.weekly[untouched], first.head.cells.weekly[untouched]);
  const oldWeek = `history-cell-${first.head.cells.weekly[untouched].slice(7)}.json`;
  assert.deepEqual(readFileSync(join(dir, oldWeek)), before.get(oldWeek));
  assert.equal(cell(dir, first.head.cells.daily['2026-09-03']).cards[0].text, 'daily past fact');
  assert.ok(cell(dir, changed.head.cells.status['2026-09']).cards[0].child_card_ids[0].startsWith('monthly:'));
});

test('deletion, late arrival, month edge, config invalidation and empty refusal', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const a = record('A', '2026-09-01', 'A fact'), b = record('B', '2026-09-08', 'B fact');
  const generate = fake([]);
  const first = await runHistory({ input: input([a, b]), outputRoot: dir, config, generate });
  const late = await runHistory({ input: input([a, b, record('C', '2026-09-06', 'Late fact')]), outputRoot: dir, config, generate });
  assert.deepEqual(late.changed.map(c => c.layer), ['daily', 'weekly', 'monthly', 'status']);
  const deleted = await runHistory({ input: input([a, b]), outputRoot: dir, config, generate });
  assert.equal(deleted.status, 'display_updated'); // old immutable cells are reusable without calls
  assert.equal(deleted.calls, 0);
  assert.deepEqual(deleted.head, first.head);
  const removed = await runHistory({ input: input([a]), outputRoot: dir, config, generate });
  assert.equal(removed.head.cells.daily['2026-09-08'], undefined);
  assert.deepEqual(removed.changed.map(c => c.layer), ['monthly', 'status']);
  const refusal = await runHistory({ input: input([]), outputRoot: dir, config, generate });
  assert.equal(refusal.status, 'refused_empty_input');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8')), removed.head);
  await assert.rejects(runHistory({ input: input([record('X', '2026-10-01', 'Other month')]), outputRoot: dir, config, generate }), /history_record_invalid/);
  await assert.rejects(runHistory({ input: { ...input([a]), project: 'DEMO-2' }, outputRoot: dir, config, generate }), /history_scope_mismatch/);
  const modelChanged = await runHistory({ input: input([a]), outputRoot: dir,
    config: { ...config, prompt_version: 'v2' }, generate });
  assert.deepEqual(modelChanged.changed.map(c => c.layer), ['daily', 'weekly', 'monthly', 'status']);
  const week = cell(dir, modelChanged.head.cells.weekly[Object.keys(modelChanged.head.cells.weekly)[0]]);
  assert.equal(week.partial, true); assert.equal(week.start, '2026-09-01');
});

test('bad evidence and malformed JSON are retained; transport failure preserves prior head', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-03', 'Original source')];
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate: fake([]) });
  const bad = await runHistory({ input: input([record('A', '2026-09-03', 'Changed source')]), outputRoot: dir, config,
    generate: fake([], r => r.layer === 'daily' ? JSON.stringify({ events: [{ text: 'Keep this sentence',
      evidence: [{ source_id: 'A', quote: 'no such quote' }, { source_id: 'MISSING', quote: 'x' }] }] }) : '{bad') });
  assert.equal(bad.status, 'generated');
  const day = cell(dir, bad.head.cells.daily['2026-09-03']);
  assert.equal(day.cards[0].text, 'Keep this sentence');
  assert.deepEqual(day.cards[0].flags.map(f => f.reason), ['quote_mismatch', 'source_missing']);
  const month = cell(dir, bad.head.cells.monthly['2026-09']);
  assert.equal(month.raw, '{bad'); assert.equal(month.format_flag, 'invalid_json');
  const view = readFileSync(join(dir, bad.head.view_file), 'utf8');
  assert.match(view, /형식 오류로 표시하지 못한 응답/);
  assert.doesNotMatch(view, /\{bad/);
  const failed = await runHistory({ input: input([record('A', '2026-09-03', 'Another change')]), outputRoot: dir, config,
    generate: async () => { throw new Error('transport down'); } });
  assert.equal(failed.status, 'failed'); assert.deepEqual(failed.head, bad.head);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8')), bad.head);
  assert.ok(readdirSync(dir).some(name => name.startsWith('history-attempt-')));
  assert.ok(first.head.cells.daily['2026-09-03'] !== bad.head.cells.daily['2026-09-03']);
});

test('provenance-only source change refreshes the day and ancestors without sending provenance to the model', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const calls = [], generate = fake(calls);
  const original = record('A', '2026-09-03', 'Same source text');
  const first = await runHistory({ input: input([original]), outputRoot: dir, config, generate });
  assert.equal(first.status, 'generated');
  const revised = { ...original, originrefs: [{ source: 'synthetic:new-revision' }] };
  calls.length = 0;
  const second = await runHistory({ input: input([revised]), outputRoot: dir, config, generate });
  assert.deepEqual(second.changed.map(c => c.layer), ['daily', 'weekly', 'monthly', 'status']);
  assert.equal(second.calls, 4);
  assert.ok(calls.every(call => !call.user.includes('synthetic:new-revision')));
  assert.deepEqual(cell(dir, second.head.cells.daily['2026-09-03']).cards[0].evidence[0].originrefs,
    [{ source: 'synthetic:new-revision' }]);
  assert.deepEqual(cell(dir, first.head.cells.daily['2026-09-03']).cards[0].evidence[0].originrefs,
    { source: 'synthetic:A' });
});

test('upper evidence must come from its cited child, while shorter exact child excerpts remain valid', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-03', 'Alpha text'), record('B', '2026-09-04', 'Beta text')];
  const mismatch = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') {
      const source = payload.threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Past fact kept', evidence: [{ source_id: source.id, quote: source.text }] }] });
    }
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    const switched = request.layer === 'monthly' ? { source_id: 'A', quote: 'Alpha' } : { source_id: 'B', quote: 'Beta' };
    return JSON.stringify({ events: [{ text: 'Mismatched but retained', child_card_ids: [child.card_id], evidence: [switched] }] });
  };
  const result = await runHistory({ input: input(rows), outputRoot: dir, config, generate: mismatch });
  assert.equal(result.status, 'generated');
  for (const layer of ['weekly', 'monthly', 'status']) {
    const fingerprint = Object.values(result.head.cells[layer])[0], card = cell(dir, fingerprint).cards[0];
    assert.equal(card.text, 'Mismatched but retained');
    assert.ok(card.flags.some(flag => flag.reason === 'child_evidence_mismatch'), layer);
  }
  const [validDir, validCleanup] = root(); t.after(validCleanup);
  const excerpt = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: 'A', quote: 'Alpha text' }] }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    const quote = request.layer === 'weekly' ? 'Alpha' : request.layer === 'monthly' ? 'Alph' : 'Alp';
    return JSON.stringify({ events: [{ text: 'Past fact', child_card_ids: [child.card_id], evidence: [{ source_id: 'A', quote }] }] });
  };
  const valid = await runHistory({ input: input([rows[0]]), outputRoot: validDir, config, generate: excerpt });
  for (const layer of ['weekly', 'monthly', 'status'])
    assert.ok(!cell(validDir, Object.values(valid.head.cells[layer])[0]).cards[0].flags.some(flag => flag.reason === 'child_evidence_mismatch'));
});

test('strict fenced JSON decodes and legacy raw cell display upgrades with zero model calls', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-03', 'Alpha fact')], calls = [];
  const fenced = async request => '```json\n' + await fake(calls)(request) + '\n```';
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate: fenced });
  assert.equal(first.status, 'generated'); assert.equal(first.calls, 4);
  const firstStatus = cell(dir, first.head.cells.status['2026-09']);
  assert.equal(firstStatus.response_format, 'json_fence'); assert.equal(firstStatus.cards[0].text, 'status past fact');
  // Synthetic legacy fixture: same raw answer was cached before fence decode.
  const statusName = `history-cell-${first.head.cells.status['2026-09'].slice(7)}.json`;
  const legacyCell = { ...firstStatus, cards: [], format_flag: 'invalid_json' };
  delete legacyCell.response_format; delete legacyCell.content_sha256;
  legacyCell.content_sha256 = digest(legacyCell);
  writeFileSync(join(dir, statusName), JSON.stringify(legacyCell));
  const legacyBytes = readFileSync(join(dir, statusName));
  const legacyHead = { ...first.head }; delete legacyHead.projection_file;
  writeFileSync(join(dir, 'history-head.json'), JSON.stringify(legacyHead));
  writeFileSync(join(dir, `history-head-${digest(legacyHead).slice(7)}.json`), JSON.stringify(legacyHead));
  rmSync(join(dir, first.head.projection_file));
  calls.length = 0;
  const upgraded = await runHistory({ input: input(rows), outputRoot: dir, config, generate: fenced });
  assert.equal(upgraded.status, 'display_updated'); assert.equal(upgraded.calls, 0); assert.equal(calls.length, 0);
  assert.deepEqual(readFileSync(join(dir, statusName)), legacyBytes);
  assert.deepEqual(upgraded.head.cells, legacyHead.cells);
  const projection = JSON.parse(readFileSync(join(dir, upgraded.head.projection_file), 'utf8'));
  assert.equal(projection.parser_version, 'strict_json_fence_v1');
  assert.equal(projection.cells.status['2026-09'].cards[0].text, 'status past fact');
  const before = files(dir);
  const again = await runHistory({ input: input(rows), outputRoot: dir, config, generate: fenced });
  assert.equal(again.status, 'unchanged'); assert.equal(again.calls, 0); assert.deepEqual(files(dir), before);
});

test('large repeated provenance is stored once in projection without changing cell bytes or model cache', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = Array.from({ length: 4 }, (_, index) => record(`SRC-${index + 1}`, '2026-09-03', `fact ${index + 1}`,
    { originrefs: [{ pointer: `synthetic:${index + 1}:` + 'P'.repeat(60000) }] }));
  const generate = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: 'Recorded facts',
      evidence: payload.threads.flatMap(thread => thread.records).map(row => ({ source_id: row.id, quote: row.text })) }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Recorded summary', child_card_ids: [child.card_id],
      evidence: child.evidence }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate });
  assert.equal(first.status, 'generated'); assert.equal(first.calls, 4);
  const projection = JSON.parse(readFileSync(join(dir, first.head.projection_file), 'utf8'));
  assert.equal(Object.keys(projection.originrefs_by_hash).length, rows.length);
  for (const layer of ['daily', 'weekly', 'monthly', 'status']) {
    const card = Object.values(projection.cells[layer])[0].cards[0];
    assert.equal(card.evidence.length, rows.length);
    for (let index = 0; index < rows.length; index++) {
      assert.equal(card.evidence[index].originrefs, undefined);
      assert.deepEqual(projection.originrefs_by_hash[card.evidence[index].originrefs_ref], rows[index].originrefs);
    }
  }
  const dayBytes = readFileSync(join(dir, `history-cell-${first.head.cells.daily['2026-09-03'].slice(7)}.json`));
  const before = files(dir);
  const same = await runHistory({ input: input(rows), outputRoot: dir, config,
    generate: async () => { throw new Error('no model call expected'); } });
  assert.equal(same.status, 'unchanged'); assert.equal(same.calls, 0);
  assert.deepEqual(readFileSync(join(dir, `history-cell-${first.head.cells.daily['2026-09-03'].slice(7)}.json`)), dayBytes);
  assert.deepEqual(files(dir), before);
});

test('explicit display metadata changes only the view and hides internal codes and addresses', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [
    record('S001', '2026-09-03', 'Same email', { sender: '"Alice (Org)"', recipient: 'bob@example.test' }),
    record('S002', '2026-09-03', 'Same email with another header', { sender: '"Alice" <alice@example.test>', recipient: 'bob@example.test' }),
    record('S003', '2026-09-03', 'Slack fact', { kind: 'slack', sender: 'slack-user:U1', recipient: '' }),
    record('EARLYV1', '2026-09-03', 'Voice fact', { kind: 'voice_card', title: 'derived candidate title', sender: 'unknown', recipient: '' }),
    record('S004', '2026-09-03', 'No attachment', { title: 'No attachment', sender: 'Alice <alice@example.test>', recipient: 'bob@example.test' }),
    record('S005', '2026-09-03', 'No attachment', { title: 'No attachment', sender: 'Alice <alice@example.test>', recipient: 'bob@example.test' }),
    record('S006', '2026-09-03', 'Different body', { title: 'No attachment', sender: 'Alice <alice@example.test>', recipient: 'bob@example.test' }),
  ];
  const generate = async request => {
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '담당자는 Alice <alice@example.test>에게 요청했다. S001 및 daily:2026-09-03:001 근거, S999 표기',
      evidence: rows.map(row => ({ source_id: row.id, quote: row.text })) }] });
    const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Recorded event', child_card_ids: [child.card_id], evidence: child.evidence }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate });
  const cellBytes = new Map(readdirSync(dir).filter(name => name.startsWith('history-cell-'))
    .map(name => [name, readFileSync(join(dir, name))]));
  const metadata = { source_attachments: { S001: ['first.pdf', 'second.pdf', 'third.pdf', 'fourth.pdf'],
    S004: [], S006: ['image001.png'] },
  source_body_sha256: { S001: hashText('shared body A'), S002: hashText('shared body A'),
    S004: hashText('shared body B'), S005: hashText('shared body B'), S006: hashText('distinct body C') },
  slack_names: { U1: 'Slack Person' }, person_names: { 'alice@example.test': 'Alice', 'bob@example.test': 'Bob' } };
  const second = await runHistory({ input: input(rows), outputRoot: dir, config, generate: async () => { throw new Error('no call'); },
    displayMetadata: metadata });
  assert.equal(second.status, 'display_updated'); assert.equal(second.calls, 0);
  assert.deepEqual(second.head.cells, first.head.cells);
  for (const [name, bytes] of cellBytes) assert.deepEqual(readFileSync(join(dir, name)), bytes);
  const view = readFileSync(join(dir, second.head.view_file), 'utf8');
  const dailyView = view.split('## 주별')[0];
  assert.equal(dailyView.split('first.pdf').length - 1, 1); // duplicate email copy shown once
  assert.match(dailyView, /first.pdf, second.pdf, third.pdf 외 1개/);
  assert.match(dailyView, /image001\.png/); // an unmarked attachment keeps its name
  assert.equal(dailyView.split('No attachment').length - 1, 2);
  assert.match(dailyView, /No attachment · 첨부: 없음/);
  assert.match(dailyView, /Slack Person/); assert.match(dailyView, /Alice → Bob/);
  assert.doesNotMatch(dailyView, /"Alice"|Alice \(Org\)/u);
  const slackLine = dailyView.split('\n').find(row => row.includes('Slack Person'));
  assert.match(slackLine, /2026-09-03 · Slack · Slack Person · Synthetic title/);
  assert.doesNotMatch(slackLine, /→|첨부명 미기록/);
  assert.match(dailyView, /담당자는 Alice\s*에게 요청했다/);
  assert.match(dailyView, /PLAUD · 2026-09-03 · 원제목 미확인/);
  assert.match(dailyView, /S999 표기/); // unrelated code is not broadly rewritten
  assert.doesNotMatch(view, /alice@example\.test|bob@example\.test|slack-user:U1|S001|S002|EARLYV1|daily:2026-09-03:001|voice_card|derived candidate title|\\\[/);
});

test('manual retry calls only selected flagged days and retains upper revisions as stale', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-03', 'Alpha text'), record('B', '2026-09-04', 'Beta text'),
    record('C', '2026-09-08', 'Gamma text')];
  const initial = async request => {
    if (request.layer === 'daily' && ['2026-09-03', '2026-09-04'].includes(request.key)) return 'unclosed prose';
    if (request.layer === 'daily') return fake([])(request);
    return JSON.stringify({ events: [{ text: 'Prior summary', evidence: [] }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate: initial });
  const original = new Map(readdirSync(dir).filter(name => name.startsWith('history-cell-'))
    .map(name => [name, readFileSync(join(dir, name))]));
  const retryConfig = { ...config, max_tokens: 16384, max_calls: 2 };
  const calls = [];
  const retried = await runHistory({ input: input(rows), outputRoot: dir, config: retryConfig,
    retryDays: ['2026-09-04', '2026-09-03'], generate: async request => {
      calls.push(request);
      const source = JSON.parse(request.user).threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Rewritten past fact', evidence: [{ source_id: source.id, quote: source.text }] }] });
    } });
  assert.equal(retried.status, 'daily_retried'); assert.equal(retried.calls, 2);
  assert.deepEqual(calls.map(call => call.key), ['2026-09-03', '2026-09-04']);
  assert.ok(calls.every(call => call.response_format === 'history_events_json_schema_v1'));
  assert.deepEqual(retried.head.cells.weekly, first.head.cells.weekly);
  assert.deepEqual(retried.head.cells.monthly, first.head.cells.monthly);
  assert.deepEqual(retried.head.cells.status, first.head.cells.status);
  assert.equal(retried.head.cells.daily['2026-09-08'], first.head.cells.daily['2026-09-08']);
  for (const [name, bytes] of original) assert.deepEqual(readFileSync(join(dir, name)), bytes);
  const view = readFileSync(join(dir, retried.head.view_file), 'utf8');
  assert.match(view, /일별 재작성 전 요약/); assert.doesNotMatch(view.split('## 주별')[1], /하위 기록:/);
  const displayOnly = await runHistory({ input: input(rows), outputRoot: dir,
    config: { ...retryConfig, max_calls: 0 }, displayOnly: true,
    displayMetadata: { source_attachments: { A: ['fresh.txt'] } } });
  assert.equal(displayOnly.status, 'display_updated'); assert.equal(displayOnly.calls, 0);
  assert.equal(displayOnly.head.stale_summary, true);
  assert.deepEqual(displayOnly.head.cells, retried.head.cells);
  const changedDisplayInput = await runHistory({ input: input([rows[0], rows[1], record('C', '2026-09-08', 'Changed')]),
    outputRoot: dir, config: { ...retryConfig, max_calls: 0 }, displayOnly: true });
  assert.equal(changedDisplayInput.status, 'failed'); assert.equal(changedDisplayInput.calls, 0);
  const second = await runHistory({ input: input(rows), outputRoot: dir, config: retryConfig,
    retryDays: ['2026-09-03'], generate: async () => { throw new Error('must not call'); } });
  assert.equal(second.status, 'failed'); assert.equal(second.calls, 0);
  const changedInput = await runHistory({ input: input([rows[0], rows[1], record('C', '2026-09-08', 'Changed')]),
    outputRoot: dir, config: retryConfig, retryDays: ['2026-09-03'], generate: async () => { throw new Error('must not call'); } });
  assert.equal(changedInput.status, 'failed'); assert.equal(changedInput.calls, 0);
});

test('bounded day partition preserves whole threads or exact surrogate-safe record parts', () => {
  const rows = [record('A', '2026-09-17', '첫 줄🙂\n'.repeat(420), { thread_ref: 'thread:one' }),
    record('B', '2026-09-17', '둘째 줄\n'.repeat(180), { thread_ref: 'thread:one' }),
    record('C', '2026-09-17', '짧은 기록', { thread_ref: 'thread:two' })];
  const batches = partitionDay({ project: 'DEMO-1', day: '2026-09-17', rows, limit: 1200 });
  assert.ok(batches.length > 2);
  assert.deepEqual(partitionDay({ project: 'DEMO-1', day: '2026-09-17', rows, limit: 1200 }), batches);
  assert.ok(batches.every(batch => batch.characters <= 1200));
  for (const row of rows) {
    const pieces = batches.flatMap(batch => batch.user.threads.flatMap(thread => thread.records))
      .filter(part => part.id === row.id).sort((a, b) => a.part.start - b.part.start);
    assert.equal(pieces.map(part => part.text).join(''), row.text);
    assert.equal(pieces[0].part.start, 0); assert.equal(pieces.at(-1).part.end, row.text.length);
    for (const part of pieces) {
      assert.equal(part.text, row.text.slice(part.part.start, part.part.end));
      assert.ok(!(part.part.end < row.text.length && /[\uD800-\uDBFF]/u.test(row.text[part.part.end - 1])));
    }
    const provenance = batches.flatMap(batch => batch.parts).filter(part => part.source_id === row.id);
    assert.ok(provenance.every(part => part.part_sha256 === hashText(row.text.slice(part.start, part.end))));
    assert.ok(provenance.every(part => part.source_text_sha256 === hashText(row.text)));
  }
});

test('timeout bisection preserves Korean emoji, source offsets, and refuses one-codepoint input', () => {
  const row = record('A', '2026-09-17', '한🙂글\n'.repeat(150));
  const batch = partitionDay({ project: 'DEMO-1', day: '2026-09-17', rows: [row], limit: 1500 })[0];
  const halves = bisectBatch(batch);
  assert.equal(halves.length, 2);
  const original = batch.user.threads.flatMap(thread => thread.records).map(part => part.text).join('');
  const recovered = halves.flatMap(half => half.user.threads.flatMap(thread => thread.records)).map(part => part.text).join('');
  assert.equal(recovered, original);
  assert.ok(halves.every(half => half.parts.length && half.parts.every(part => {
    const text = row.text.slice(part.start, part.end);
    return part.part_sha256 === hashText(text) && part.source_text_sha256 === hashText(row.text);
  })));
  const offsets = halves.flatMap(half => half.parts).map(part => [part.start, part.end]);
  for (let i = 1; i < offsets.length; i++) assert.equal(offsets[i - 1][1], offsets[i][0]);
  const tiny = partitionDay({ project: 'DEMO-1', day: '2026-09-17', rows: [record('B', '2026-09-17', '🙂')], limit: 1200 })[0];
  assert.equal(bisectBatch(tiny), null);
});

test('batched day keeps good cards and raw failures; changing one part reuses other batches', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const long = '가'.repeat(1500) + 'X' + '나'.repeat(1500);
  const rows = [record('A', '2026-09-17', long), record('B', '2026-09-17', 'B'.repeat(800))];
  const bound = { ...config, daily_batch_characters: 1200, max_calls: 50 };
  const calls = [];
  const generate = async request => {
    calls.push(request);
    if (request.layer === 'daily') {
      if (request.user.includes('X')) return 'malformed batch response';
      const part = JSON.parse(request.user).threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'R&D &amp; owner', evidence: [{ source_id: part.id, quote: part.text.slice(0, 4) }] }] });
    }
    const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'R&D &amp; owner', child_card_ids: child ? [child.card_id] : [],
      evidence: child?.evidence ?? [] }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config: bound, generate });
  assert.equal(first.status, 'generated_partial');
  const firstDay = cell(dir, first.head.cells.daily['2026-09-17']);
  assert.ok(firstDay.batch_refs.length > 2); assert.equal(firstDay.batch_flags.length, 1);
  assert.ok(firstDay.cards.length > 0); assert.equal(new Set(firstDay.cards.map(card => card.card_id)).size, firstDay.cards.length);
  assert.ok(firstDay.cards.every(card => card.batch_ref && card.evidence[0].part_locators?.length));
  assert.equal(firstDay.source_text_sha256.A, hashText(long));
  const view = readFileSync(join(dir, first.head.view_file), 'utf8');
  assert.match(view, /일부 묶음의 응답을 받거나 읽지 못했습니다/); assert.match(view, /R&D & owner/); assert.doesNotMatch(view, /&amp;/);
  const oldBatchBytes = new Map(firstDay.batch_refs.map(ref => [ref, readFileSync(join(dir, `history-cell-${ref.slice(7)}.json`))]));
  calls.length = 0;
  const same = await runHistory({ input: input(rows), outputRoot: dir, config: bound, generate });
  assert.equal(same.status, 'partial_unchanged'); assert.equal(same.calls, 0);
  const changed = await runHistory({ input: input([record('A', '2026-09-17', long.replace('X', 'Y')), rows[1]]),
    outputRoot: dir, config: bound, generate });
  const nextDay = cell(dir, changed.head.cells.daily['2026-09-17']);
  assert.equal(changed.changed.filter(change => change.layer === 'daily_batch').length, 1);
  assert.equal(changed.calls, 4); // one batch and its week, month, status
  const shared = firstDay.batch_refs.filter(ref => nextDay.batch_refs.includes(ref));
  assert.equal(shared.length, firstDay.batch_refs.length - 1);
  for (const ref of shared) assert.deepEqual(readFileSync(join(dir, `history-cell-${ref.slice(7)}.json`)), oldBatchBytes.get(ref));
});

test('selected rebuild refreshes dependency-dirty weeks and decodes held fenced cards without touching other cells', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-04', 'Week one'), record('B', '2026-09-10', 'Week two'),
    record('C', '2026-09-14', 'Week three earlier'),
    record('D', '2026-09-17', '한🙂'.repeat(900)), record('E', '2026-09-18', '나🙂'.repeat(900))];
  const good = request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') {
      const part = payload.threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: part.id, quote: part.text.slice(0, 3) }] }] });
    }
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Past summary', child_card_ids: child ? [child.card_id] : [],
      evidence: child?.evidence ?? [] }] });
  };
  const initial = await runHistory({ input: input(rows), outputRoot: dir, config, generate: async request => {
    if (request.layer === 'daily' && ['2026-09-04', '2026-09-14'].includes(request.key)) return 'invalid reply';
    return '```json\n' + good(request) + '\n```';
  } });
  assert.equal(initial.status, 'generated');
  const oldWeekTwoRef = initial.head.cells.weekly['2026-09-07_2026-09-13'];
  // Simulate a legacy cached fence that was stored before display decoding.
  for (const [layer, key] of [['daily', '2026-09-10'], ['weekly', '2026-09-07_2026-09-13']]) {
    const ref = initial.head.cells[layer][key], file = join(dir, `history-cell-${ref.slice(7)}.json`);
    const held = JSON.parse(readFileSync(file, 'utf8'));
    held.cards = []; held.format_flag = 'invalid_json'; delete held.content_sha256;
    held.content_sha256 = digest(held); writeFileSync(file, JSON.stringify(held));
  }
  const retried = await runHistory({ input: input(rows), outputRoot: dir, config,
    retryDays: ['2026-09-04', '2026-09-14'], generate: async request => good(request) });
  assert.equal(retried.status, 'daily_retried'); assert.equal(retried.head.stale_summary, true);
  const bound = { ...config, daily_batch_characters: 1200, max_calls: 50 };
  const dry = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    rebuildDays: ['2026-09-17', '2026-09-18'], dryRun: true });
  assert.equal(dry.status, 'dry_run'); assert.deepEqual(dry.dirty_weeks,
    ['2026-09-01_2026-09-06', '2026-09-14_2026-09-19']);
  assert.deepEqual(dry.unknown_weeks, []); assert.ok(dry.batch_plan.every(item => item.batches.length > 1));
  const oldBytes = readFileSync(join(dir, `history-cell-${oldWeekTwoRef.slice(7)}.json`));
  const calls = [];
  const rebuilt = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    rebuildDays: ['2026-09-17', '2026-09-18'], generate: async request => { calls.push(request); return good(request); } });
  assert.equal(rebuilt.status, 'generated'); assert.equal(rebuilt.calls, dry.estimated_model_calls);
  assert.deepEqual(rebuilt.head.cells.weekly['2026-09-07_2026-09-13'], oldWeekTwoRef);
  assert.deepEqual(readFileSync(join(dir, `history-cell-${oldWeekTwoRef.slice(7)}.json`)), oldBytes);
  assert.notEqual(rebuilt.head.cells.weekly['2026-09-01_2026-09-06'], retried.head.cells.weekly['2026-09-01_2026-09-06']);
  assert.notEqual(rebuilt.head.cells.weekly['2026-09-14_2026-09-19'], retried.head.cells.weekly['2026-09-14_2026-09-19']);
  assert.equal(rebuilt.head.stale_summary, undefined);
  assert.ok(calls.filter(call => call.layer === 'weekly').length === 2);
  const monthRequest = JSON.parse(calls.find(call => call.layer === 'monthly').user);
  assert.ok(monthRequest.weeks.some(week => week.key === '2026-09-07_2026-09-13' && week.cards.length > 0));
  calls.length = 0;
  const noOp = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    generate: async request => { calls.push(request); return good(request); } });
  assert.equal(noOp.status, 'unchanged'); assert.equal(noOp.calls, 0); assert.equal(calls.length, 0);
});

test('a timed-out daily batch is preserved while its two cached halves complete once', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-17', 'A'.repeat(5200))];
  const bound = { ...config, daily_batch_characters: 1200, max_calls: 30 };
  let dailyCalls = 0;
  const generate = async request => {
    if (request.layer === 'daily') {
      dailyCalls++;
      if (dailyCalls === 3) throw Object.assign(new Error('synthetic timeout'), { code: 'ABORT_ERR' });
      const part = JSON.parse(request.user).threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: part.id, quote: part.text.slice(0, 3) }] }] });
    }
    const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Past summary', child_card_ids: child ? [child.card_id] : [],
      evidence: child?.evidence ?? [] }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config: bound, generate });
  assert.equal(first.status, 'generated');
  const day = cell(dir, first.head.cells.daily['2026-09-17']);
  assert.equal(day.batch_flags.length, 0); assert.ok(day.cards.length > 0);
  assert.equal(day.timeout_parent_refs.length, 1);
  const failed = cell(dir, day.timeout_parent_refs[0]);
  assert.equal(failed.format_flag, 'model_request_failed'); assert.equal(failed.response_received, false);
  assert.equal(failed.error_code, 'ABORT_ERR'); assert.equal(failed.raw, '');
  const halves = day.batch_refs.map(ref => cell(dir, ref)).filter(value => value.parent_ref === failed.fingerprint);
  assert.equal(halves.length, 2); assert.deepEqual(halves.map(value => value.half_index), [0, 1]);
  assert.ok(halves.every(value => value.format_flag === null));
  assert.equal(dailyCalls, day.batch_refs.length + 1);
  const before = files(dir);
  const noOp = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    generate: async () => { throw new Error('must not retry'); } });
  assert.equal(noOp.status, 'unchanged'); assert.equal(noOp.calls, 0);
  assert.deepEqual(files(dir), before);
  let clockReads = 0;
  t.mock.method(Date, 'now', () => ++clockReads === 1 ? 10000 : 12000);
  const expiredButCached = await runHistory({ input: input(rows), outputRoot: dir,
    config: { ...bound, wall_timeout_ms: 1000, max_calls: 0 },
    generate: async () => { throw new Error('cached halves need no budget'); } });
  assert.equal(expiredButCached.status, 'unchanged'); assert.equal(expiredButCached.calls, 0);
  assert.deepEqual(files(dir), before);
});

test('failed timeout halves and non-timeout errors stay partial with no recursive calls', async t => {
  for (const timeout of [true, false]) {
    const [dir, cleanup] = root(); t.after(cleanup);
    const rows = [record('A', '2026-09-17', 'C'.repeat(4600))];
    const bound = { ...config, daily_batch_characters: 1200, max_calls: 30 };
    let dailyCalls = 0;
    const generate = async request => {
      if (request.layer === 'daily') {
        dailyCalls++;
        if (dailyCalls === 1) throw Object.assign(new Error('synthetic request failure'),
          { code: timeout ? 'ABORT_ERR' : 'ECONNRESET' });
        if (timeout && dailyCalls === 2) throw Object.assign(new Error('child timeout'), { name: 'TimeoutError' });
        if (timeout && dailyCalls === 3) return '{invalid child json';
        const part = JSON.parse(request.user).threads[0].records[0];
        return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: part.id, quote: part.text.slice(0, 3) }] }] });
      }
      const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
      return JSON.stringify({ events: [{ text: 'Past summary', child_card_ids: child ? [child.card_id] : [],
        evidence: child?.evidence ?? [] }] });
    };
    const result = await runHistory({ input: input(rows), outputRoot: dir, config: bound, generate });
    assert.equal(result.status, 'generated_partial');
    const day = cell(dir, result.head.cells.daily['2026-09-17']);
    assert.equal(day.batch_flags.length, timeout ? 2 : 1);
    assert.equal(day.timeout_parent_refs?.length ?? 0, timeout ? 1 : 0);
    if (timeout) {
      const children = day.batch_refs.map(ref => cell(dir, ref)).filter(value => value.layer === 'daily_batch_half');
      assert.deepEqual(children.map(value => value.format_flag), ['model_request_failed', 'invalid_json']);
      assert.equal(children[0].error_code, 'TimeoutError');
    } else assert.equal(day.batch_flags[0].format_flag, 'model_request_failed');
    const before = dailyCalls;
    const noOp = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
      generate: async () => { throw new Error('must not recur'); } });
    assert.equal(noOp.status, 'partial_unchanged'); assert.equal(noOp.calls, 0); assert.equal(dailyCalls, before);
  }
});

test('oversized received half keeps only a hash and honest response metadata', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-17', 'D'.repeat(3000))];
  const bound = { ...config, daily_batch_characters: 1200, max_output_characters: 1000, max_calls: 20 };
  let dailyCalls = 0;
  const oversized = 'X'.repeat(1001);
  const result = await runHistory({ input: input(rows), outputRoot: dir, config: bound, generate: async request => {
    if (request.layer === 'daily') {
      dailyCalls++;
      if (dailyCalls === 1) throw Object.assign(new Error('timeout'), { code: 'ABORT_ERR' });
      if (dailyCalls === 2) return oversized;
      const part = JSON.parse(request.user).threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: part.id, quote: part.text.slice(0, 3) }] }] });
    }
    const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Past summary', child_card_ids: child ? [child.card_id] : [],
      evidence: child?.evidence ?? [] }] });
  } });
  assert.equal(result.status, 'generated_partial');
  const day = cell(dir, result.head.cells.daily['2026-09-17']);
  const half = day.batch_refs.map(ref => cell(dir, ref)).find(value => value.layer === 'daily_batch_half' && value.error_code === 'model_output_invalid');
  assert.equal(half.response_received, true); assert.equal(half.raw, '');
  assert.equal(half.raw_sha256, hashText(oversized)); assert.equal(half.raw_characters, oversized.length);
});

test('explicit prior ABORT_ERR import matches one missing batch and preserves successful immutable batches', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-17', 'B'.repeat(5100))];
  const generate = async request => {
    if (request.layer === 'daily') {
      const part = JSON.parse(request.user).threads[0].records[0];
      return JSON.stringify({ events: [{ text: 'Past fact', evidence: [{ source_id: part.id, quote: part.text.slice(0, 3) }] }] });
    }
    const payload = JSON.parse(request.user), child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: 'Past summary', child_card_ids: child ? [child.card_id] : [],
      evidence: child?.evidence ?? [] }] });
  };
  const first = await runHistory({ input: input(rows), outputRoot: dir, config, generate });
  const bound = { ...config, daily_batch_characters: 1200, max_calls: 30 };
  const dry = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    rebuildDays: ['2026-09-17'], dryRun: true });
  assert.ok(dry.batch_plan[0].batches.length > 3);
  const partialAttempt = await runHistory({ input: input(rows), outputRoot: dir,
    config: { ...bound, max_calls: 2 }, rebuildDays: ['2026-09-17'], generate });
  assert.equal(partialAttempt.status, 'failed'); assert.equal(partialAttempt.code, 'history_budget_exhausted');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8')), first.head);
  const third = partialAttempt.changed.at(-1).fingerprint;
  const syntheticFailedRun = { ...partialAttempt, code: 'history_generation_failed:ABORT_ERR', calls: 3 };
  const altered = { ...syntheticFailedRun, changed: [...syntheticFailedRun.changed.slice(0, -1),
    { ...syntheticFailedRun.changed.at(-1), fingerprint: hashText('wrong') }] };
  const bad = await recordFailedHistoryBatch({ input: input(rows), outputRoot: dir, config: bound, failedRun: altered });
  assert.equal(bad.status, 'failed'); assert.equal(bad.calls, 0);
  assert.equal(readdirSync(dir).includes(`history-cell-${third.slice(7)}.json`), false);
  const changedInput = await recordFailedHistoryBatch({ input: input([record('A', '2026-09-17', 'changed')]),
    outputRoot: dir, config: bound, failedRun: syntheticFailedRun });
  assert.equal(changedInput.status, 'failed'); assert.equal(changedInput.calls, 0);
  const successful = dry.batch_plan[0].batches.slice(0, 2).map(batch => batch.fingerprint);
  const originalBytes = successful.map(ref => readFileSync(join(dir, `history-cell-${ref.slice(7)}.json`)));
  const seeded = await recordFailedHistoryBatch({ input: input(rows), outputRoot: dir, config: bound,
    failedRun: syntheticFailedRun });
  assert.equal(seeded.status, 'failed_batch_recorded'); assert.equal(seeded.calls, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8')), first.head);
  const failed = cell(dir, third);
  assert.equal(failed.format_flag, 'model_request_failed'); assert.equal(failed.response_received, false);
  assert.equal(failed.error_code, 'ABORT_ERR'); assert.equal(failed.failed_run_sha256, digest(syntheticFailedRun));
  const failedBytes = readFileSync(join(dir, `history-cell-${third.slice(7)}.json`));
  const recoveryPlan = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    rebuildDays: ['2026-09-17'], dryRun: true });
  assert.equal(recoveryPlan.batch_plan[0].batches.find(batch => batch.fingerprint === third).recovery_calls, 2);
  assert.equal(recoveryPlan.estimated_model_calls, dry.batch_plan[0].batches.length - 3 + 2 + 3);
  const noBudget = await runHistory({ input: input(rows), outputRoot: dir,
    config: { ...bound, max_calls: 0 }, rebuildDays: ['2026-09-17'],
    generate: async () => { throw new Error('budget should prevent request'); } });
  assert.equal(noBudget.status, 'failed'); assert.equal(noBudget.calls, 0);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8')), first.head);
  const calls = [];
  const resumed = await runHistory({ input: input(rows), outputRoot: dir, config: bound,
    rebuildDays: ['2026-09-17'], generate: async request => { calls.push(request); return generate(request); } });
  assert.equal(resumed.status, 'generated');
  assert.equal(resumed.calls, dry.batch_plan[0].batches.length - 3 + 2 + 3); // remaining batches + halves + ancestors
  assert.equal(calls.filter(request => request.layer === 'daily').length, dry.batch_plan[0].batches.length - 3 + 2);
  for (let i = 0; i < successful.length; i++)
    assert.deepEqual(readFileSync(join(dir, `history-cell-${successful[i].slice(7)}.json`)), originalBytes[i]);
  assert.deepEqual(readFileSync(join(dir, `history-cell-${third.slice(7)}.json`)), failedBytes);
});

test('file handoff CLI help exposes prepare and finalize only', () => {
  const cli = fileURLToPath(new URL('../../src/history_cli.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /--prepare/); assert.match(help.stdout, /--finalize/);
  assert.doesNotMatch(help.stdout, /--dry-run|--binding/);
});

test('direct history input refuses explicit AI work memo kinds and roles but admits voice ASR', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  for (const kind of ['ai_work_note', ' AI_WORK_MEMO ', 'Ai_Memo', 'ai_note']) {
    await assert.rejects(runHistory({ input: input([record('A', '2026-09-03', 'Memo text', { kind })]),
      outputRoot: dir, config, generate: fake([]) }), /history_ai_work_memo_excluded/);
  }
  for (const extra of [{ producer_class: 'AI_WORK_NOTE' }, { source_role: ' ai_memo ' }, { ai_work_note: true }]) {
    await assert.rejects(runHistory({ input: input([record('A', '2026-09-03', 'Memo text', extra)]),
      outputRoot: dir, config, generate: fake([]) }), /history_ai_work_memo_excluded/);
  }
  const admitted = await runHistory({ input: input([record('V1', '2026-09-03', 'ASR text',
    { kind: 'voice_card', generated_by_ai: true })]), outputRoot: dir, config, generate: fake([]) });
  assert.equal(admitted.status, 'generated');
});

test('voice utterance IDs attach supplied text and provenance through child-only upper summaries', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const card = hashText('synthetic-card');
  const rows = [record('voice_utterance:synthetic:00000001', '2026-09-23', '첫 번째 발화입니다.',
    { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: [{ card_sha256: card,
      card_segment_id: 'segment-1', utterance_id: '00000001' }] }),
  record('voice_utterance:synthetic:00000002', '2026-09-23', '두 번째 발화입니다.',
    { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: [{ card_sha256: card,
      card_segment_id: 'segment-1', utterance_id: '00000002' }] })];
  const calls = [];
  const result = await runHistory({ input: { ...input(rows), as_of: '2026-09-23' }, outputRoot: dir,
    config, generate: async request => {
    calls.push(request);
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '두 발화가 기록되었다.',
      evidence: payload.threads.flatMap(thread => thread.records).map(row => ({ source_id: row.source_id })) }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: '발화가 있었다.', child_card_ids: [child.card_id] }] });
  } });
  assert.equal(result.status, 'generated');
  const daily = cell(dir, result.head.cells.daily['2026-09-23']).cards[0];
  assert.deepEqual(daily.evidence.map(item => item.quote), rows.map(row => row.text));
  assert.deepEqual(daily.evidence.map(item => item.originrefs), rows.map(row => row.originrefs));
  assert.deepEqual(daily.flags, []);
  const dailyRequest = calls.find(call => call.layer === 'daily');
  assert.match(dailyRequest.system, /cite only its exact source_id/);
  assert.equal(dailyRequest.response_format, 'history_events_voice_id_json_schema_v1');
  assert.ok(JSON.parse(dailyRequest.user).threads.every(thread => thread.records.every(row =>
    Object.keys(row).sort().join(',') === 'evidence_mode,source_id,text')));
  for (const layer of ['weekly', 'monthly', 'status']) {
    const upper = cell(dir, Object.values(result.head.cells[layer])[0]).cards[0];
    assert.deepEqual(upper.evidence.map(item => item.quote), rows.map(row => row.text));
    assert.ok(upper.evidence.every(item => item.inherited_from_child_card_id));
    assert.deepEqual(upper.flags, []);
  }
  const view = readFileSync(join(dir, result.head.view_file), 'utf8');
  assert.equal(view.split('## 주별')[0].split('PLAUD · 2026-09-23').length - 1, 1);
});

test('display-only PLAUD trace shows exact card title, local links, and every utterance range without model calls', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const card = hashText('synthetic-card');
  const utterance = (number, start, end) => record(`voice_utterance:synthetic:${number}`, '2026-09-23',
    `합성 발화 ${number}`, { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: [{
      card_sha256: card, card_segment_id: 'segment-1', source_segment_ids: [number],
      source_offsets: [[number, start, end]], attribution: 'candidate_only_not_accepted' }] });
  const rows = [utterance(1, 12.5, 14.25), utterance(2, 14.25, 16.75)];
  const generate = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '합성 기록', evidence:
      payload.threads.flatMap(thread => thread.records).map(row => ({ source_id: row.source_id })) }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: '합성 요약', child_card_ids: [child.card_id] }] });
  };
  const inputData = { ...input(rows), as_of: '2026-09-23' };
  const first = await runHistory({ input: inputData, outputRoot: dir, config, generate });
  const beforeCell = readFileSync(join(dir, `history-cell-${first.head.cells.daily['2026-09-23'].slice(7)}.json`));
  const fallback = readFileSync(join(dir, first.head.view_file), 'utf8').split('## 주별')[0];
  assert.match(fallback, /PLAUD · 2026-09-23 · 원제목 미확인/);
  assert.match(fallback, /발화 1 00:12–00:15; 발화 2 00:14–00:17/);
  const audioPath = join(dir, 'audio (draft) #1.mp3'), transcriptPath = join(dir, 'notes #1.txt');
  const updated = await runHistory({ input: inputData, outputRoot: dir, config, displayOnly: true,
    displayMetadata: { voice_sources: { [rows[0].id]: { title: 'Meeting &#91;Test&#93; &lt;script&gt;',
      recorded_at: '2026-09-23T09:10:11+09:00', session_id: 'synthetic-session',
      audio_path: audioPath, transcript_path: transcriptPath } } } });
  assert.equal(updated.status, 'display_updated'); assert.equal(updated.calls, 0);
  assert.deepEqual(updated.head.cells, first.head.cells);
  assert.deepEqual(readFileSync(join(dir, `history-cell-${first.head.cells.daily['2026-09-23'].slice(7)}.json`)), beforeCell);
  const view = readFileSync(join(dir, updated.head.view_file), 'utf8').split('## 주별')[0];
  assert.equal(view.split('PLAUD · 2026-09-23T09:10:11+09:00').length - 1, 1);
  assert.ok(view.includes(String.raw`Meeting \[Test\] \<script\>`));
  assert.match(view, /발화 1 00:12–00:15; 발화 2 00:14–00:17/);
  assert.doesNotMatch(view, /&#|synthetic-session|세션 /);
  assert.match(view, /과제 귀속 후보\(미수락\)/);
  assert.match(view, /\[녹음\]\(<[^>]*audio%20\(draft\)%20%231\.mp3>\)/);
  assert.match(view, /\[전사\]\(<[^>]*notes%20%231\.txt>\)/);
  await assert.rejects(runHistory({ input: inputData, outputRoot: dir, config, displayOnly: true,
    displayMetadata: { voice_sources: { [rows[0].id]: { title: 'Synthetic',
      audio_path: 'https://example.test/audio.mp3' } } } }), /history_display_metadata_invalid/);
});

test('foreign or missing voice IDs never acquire evidence; mixed mail quote checks remain', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const voice = record('voice_utterance:synthetic:00000001', '2026-09-23', '원문 발화',
    { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: ['synthetic:utterance'] });
  const foreign = record('voice_utterance:synthetic:00000002', '2026-09-24', '다른 날짜 발화',
    { kind: 'voice_utterance', evidence_mode: 'source_id' });
  const mail = record('MAIL-1', '2026-09-23', '메일 원문');
  const result = await runHistory({ input: { ...input([voice, foreign, mail]), as_of: '2026-09-24' },
    outputRoot: dir, config, generate: async request => {
      const payload = JSON.parse(request.user);
      if (request.layer === 'daily' && request.key === '2026-09-23') return JSON.stringify({ events: [{
        text: '검토 대상 문장', evidence: [
          { source_id: voice.id, quote: '모델이 지어낸 문구' },
          { source_id: foreign.id }, { source_id: 'unknown-id' },
          { source_id: mail.id, quote: '다른 메일 문구' }] }] });
      if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '다른 날짜',
        evidence: [{ source_id: payload.threads[0].records[0].source_id }] }] });
      return JSON.stringify({ events: [] });
    } });
  const daily = cell(dir, result.head.cells.daily['2026-09-23']).cards[0];
  assert.deepEqual(daily.flags.map(flag => flag.reason),
    ['voice_quote_not_allowed', 'source_not_in_cell', 'source_missing', 'quote_mismatch']);
  assert.equal(daily.evidence[0].quote, voice.text);
  assert.deepEqual(daily.evidence[0].originrefs, voice.originrefs);
  assert.equal(daily.evidence[1].quote, ''); assert.deepEqual(daily.evidence[1].originrefs, []);
  assert.equal(daily.evidence[2].quote, ''); assert.deepEqual(daily.evidence[2].originrefs, []);
  assert.equal(daily.evidence[3].quote, '다른 메일 문구');
  await assert.rejects(runHistory({ input: input([record('M', '2026-09-23', '메일',
    { evidence_mode: 'source_id' })]), outputRoot: dir, config, generate: fake([]) }), /history_record_invalid/);
});

test('mixed upper child-only response inherits voice but flags omitted mail quote', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const voice = record('voice_utterance:synthetic:00000001', '2026-09-23', '원문 발화',
    { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: ['synthetic:unit'] });
  const mail = record('MAIL-1', '2026-09-23', '메일 원문');
  const result = await runHistory({ input: { ...input([voice, mail]), as_of: '2026-09-23' },
    outputRoot: dir, config, generate: async request => {
      if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '함께 기록됨', evidence: [
        { source_id: voice.id }, { source_id: mail.id, quote: '메일 원문' }] }] });
      const payload = JSON.parse(request.user);
      const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
      return JSON.stringify({ events: [{ text: '발화가 기록됨', child_card_ids: [child.card_id] }] });
    } });
  const daily = cell(dir, result.head.cells.daily['2026-09-23']).cards[0];
  assert.deepEqual(daily.flags, []); assert.equal(daily.evidence.length, 2);
  const weekly = cell(dir, Object.values(result.head.cells.weekly)[0]).cards[0];
  assert.deepEqual(weekly.evidence.map(item => item.source_id), [voice.id]);
  assert.equal(weekly.evidence[0].quote, voice.text);
  assert.ok(weekly.flags.some(flag => flag.reason === 'quote_missing' && flag.source_id === mail.id));
  assert.ok(!weekly.evidence.some(item => item.source_id === mail.id));
});

test('view groups same-cell sentences with identical evidence sets into one paragraph; cells unchanged', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const rows = [record('A', '2026-09-23', 'Alpha source text'), record('B', '2026-09-23', 'Bravo source text')];
  const cite = (payload, id) => {
    const row = payload.threads.flatMap(thread => thread.records).find(item => (item.source_id ?? item.id) === id);
    return { source_id: id, quote: row.text.slice(0, 5) };
  };
  const generate = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [
      { text: '첫 문장.', evidence: [cite(payload, 'A')] },
      { text: '둘째 문장.', evidence: [cite(payload, 'B')] },
      { text: '셋째 문장.', evidence: [cite(payload, 'A')] },
      { text: '넷째 문장.', evidence: [cite(payload, 'A'), cite(payload, 'B')] }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: '요약.', child_card_ids: [child.card_id], evidence: [child.evidence[0]] }] });
  };
  const inputData = { ...input(rows), as_of: '2026-09-23' };
  const first = await runHistory({ input: inputData, outputRoot: dir, config, generate });
  const stored = cell(dir, first.head.cells.daily['2026-09-23']);
  assert.deepEqual(stored.cards.map(card => card.text), ['첫 문장.', '둘째 문장.', '셋째 문장.', '넷째 문장.']);
  const daily = readFileSync(join(dir, first.head.view_file), 'utf8').split('## 주별')[0];
  const bullets = daily.split('\n').filter(text => text.startsWith('- '));
  assert.deepEqual(bullets, ['- 첫 문장. 셋째 문장.', '- 둘째 문장.', '- 넷째 문장.']);
  assert.equal(daily.split('<a id=').length - 1, 4);
  const evidence = daily.split('\n').filter(text => text.startsWith('  - 근거: '));
  assert.equal(evidence.length, 4);
  assert.equal(evidence.filter(text => text.includes('Synthetic title')).length, 4);
  const second = mkdtempSync(join(tmpdir(), 'history-synthetic-')); t.after(() => rmSync(second, { recursive: true, force: true }));
  const again = await runHistory({ input: inputData, outputRoot: second, config, generate });
  assert.equal(again.head.view_file, first.head.view_file);
  assert.deepEqual(again.head.cells, first.head.cells);
  assert.deepEqual(readFileSync(join(second, again.head.view_file)), readFileSync(join(dir, first.head.view_file)));
});

test('voice evidence line names the transcript the card read, display-only', async t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const card = hashText('synthetic-card');
  const rows = [record('voice_utterance:synthetic:00000001', '2026-09-23', '합성 발화', { kind: 'voice_utterance',
    evidence_mode: 'source_id', originrefs: [{ card_sha256: card, card_segment_id: 'segment-1',
      source_segment_ids: [1], source_offsets: [[1, 0, 2]] }] })];
  const generate = async request => {
    const payload = JSON.parse(request.user);
    if (request.layer === 'daily') return JSON.stringify({ events: [{ text: '합성 기록', evidence:
      payload.threads.flatMap(thread => thread.records).map(row => ({ source_id: row.source_id })) }] });
    const child = (payload.days?.[0] ?? payload.weeks?.[0] ?? payload.monthly).cards[0];
    return JSON.stringify({ events: [{ text: '합성 요약', child_card_ids: [child.card_id] }] });
  };
  const inputData = { ...input(rows), as_of: '2026-09-23' };
  const first = await runHistory({ input: inputData, outputRoot: dir, config, generate });
  const dailyOf = head => readFileSync(join(dir, head.view_file), 'utf8').split('## 주별')[0];
  assert.match(dailyOf(first.head), /PLAUD · 2026-09-23 · 원제목 미확인 · 자체 전사 · 발화 1/);
  const label = async (entry, expected) => {
    const result = await runHistory({ input: inputData, outputRoot: dir, config, displayOnly: true,
      displayMetadata: { voice_sources: { [rows[0].id]: { title: 'Synthetic recording', ...entry } } } });
    assert.equal(result.calls, 0); assert.deepEqual(result.head.cells, first.head.cells);
    assert.ok(dailyOf(result.head).includes(`PLAUD · 2026-09-23 · Synthetic recording · ${expected} · 발화 1`));
  };
  await label({ transcript_source: 'plaud' }, 'PLAUD 전사');
  await label({ transcript_source: 'whisper', transcript_fallback: 'plaud_transcript_absent' }, '자체 전사(PLAUD 없음)');
  await label({ transcript_source: 'whisper' }, '자체 전사');
  await label({}, '자체 전사');
  await label({ transcript_source: 'whisper', transcript_fallback: 'plaud_transcript_unusable' }, '자체 전사(PLAUD 사용 불가)');
  await label({ transcript_source: 'whisper', transcript_fallback: 'synthetic_other' }, '자체 전사(대체 사유 미상)');
  await label({ transcript_source: 'synthetic_engine' }, '전사 출처 미상');
});

// Direct view rendering over synthetic cells (no model, no storage).
function viewOf(rows, { daily = [], weekly = [], monthly = null } = {}, options = {}) {
  const data = normalizeHistoryInput({ project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23', records: rows });
  const byId = new Map(data.records.map(row => [row.id, row]));
  const card = (layer, key, index, text, ids, { children = [], flags = [] } = {}) => ({
    card_id: `${layer}:${key}:${String(index).padStart(3, '0')}`, text,
    evidence: ids.map(id => ({ source_id: id, quote: byId.get(id).text, originrefs: byId.get(id).originrefs })),
    source_ids: [...new Set(ids)].sort(), source_display: [...new Set(ids)].sort().map(id => ({
      ...historySourceLabel(byId.get(id)), text_sha256: byId.get(id).text_sha256 })),
    child_card_ids: children, flags });
  const cellOf = (layer, key, specs, extra = {}) => ({ layer, key, ...extra,
    cards: specs.map((spec, index) => card(layer, key, index + 1, ...spec)) });
  const dailyMap = new Map(daily.map(([key, specs]) => [key, cellOf('daily', key, specs)]));
  const weeklyMap = new Map(weekly.map(([key, specs]) => [key, cellOf('weekly', key, specs,
    { start: key.slice(0, 10), end: key.slice(11) })]));
  const month = monthly ? cellOf('monthly', '2026-09', monthly) : null;
  return renderHistory(data, dailyMap, weeklyMap, month, null, {}, false, { external: true, ...options });
}
const bulletsOf = view => view.split('## 자료 인용 현황')[0].split('\n').filter(text => text.startsWith('- '));
const evidenceOf = view => view.split('\n').filter(text => text.startsWith('  - 근거: ') || text.startsWith('  - 하위 기록: '));

test('paragraph grouping is bounded by sentence count and characters, deterministically', () => {
  const rows = [record('A', '2026-09-23', 'Alpha source text')];
  const many = Array.from({ length: PARAGRAPH_MAX_SENTENCES + 2 }, (_, index) => [`문장${index + 1}.`, ['A']]);
  const bullets = bulletsOf(viewOf(rows, { daily: [['2026-09-23', many]] }));
  assert.equal(bullets.length, 2);
  assert.equal(bullets[0], '- ' + many.slice(0, PARAGRAPH_MAX_SENTENCES).map(([text]) => text).join(' '));
  assert.equal(bullets[1], '- ' + many.slice(PARAGRAPH_MAX_SENTENCES).map(([text]) => text).join(' '));
  const long = '가'.repeat(Math.floor(PARAGRAPH_MAX_CHARS / 2));
  const wide = bulletsOf(viewOf(rows, { daily: [['2026-09-23', [[long, ['A']], [long, ['A']], [long, ['A']]]]] }));
  assert.equal(wide.length, 2);
  assert.deepEqual(bulletsOf(viewOf(rows, { daily: [['2026-09-23', many]] })), bullets);
});

test('a flagged sentence sharing an evidence set stays its own paragraph', () => {
  const rows = [record('A', '2026-09-23', 'Alpha source text')];
  const view = viewOf(rows, { daily: [['2026-09-23', [['첫 문장.', ['A']],
    ['검토 문장.', ['A'], { flags: [{ reason: 'quote_mismatch', source_id: 'A' }] }], ['셋째 문장.', ['A']]]]] });
  assert.deepEqual(bulletsOf(view), ['- 첫 문장. 셋째 문장.', '- 검토 문장.']);
  assert.equal(view.split('  - 검토: ').length - 1, 1);
});

test('week and month cards citing the same lower records group; different children stay apart', () => {
  const rows = [record('A', '2026-09-22', 'Alpha source text'), record('B', '2026-09-23', 'Bravo source text')];
  const day = [['2026-09-22', [['일별 A.', ['A']]]], ['2026-09-23', [['일별 B.', ['B']]]]];
  const d1 = 'daily:2026-09-22:001', d2 = 'daily:2026-09-23:001', w = 'weekly:2026-09-21_2026-09-23:001';
  const view = viewOf(rows, { daily: day,
    weekly: [['2026-09-21_2026-09-23', [['주 첫째.', ['A'], { children: [d1] }], ['주 둘째.', ['B'], { children: [d2] }],
      ['주 셋째.', ['A'], { children: [d1] }]]]],
    monthly: [['월 첫째.', ['A'], { children: [w] }], ['월 둘째.', ['A'], { children: [w] }]] });
  const weekly = bulletsOf(view.split('## 주별')[1].split('## 월별')[0]);
  assert.deepEqual(weekly, ['- 주 첫째. 주 셋째.', '- 주 둘째.']);
  assert.deepEqual(bulletsOf(view.split('## 월별')[1].split('## 최근')[0]), ['- 월 첫째. 월 둘째.']);
});

test('the same cell shows the same set of evidence lines with and without grouping', () => {
  const rows = [record('A', '2026-09-23', 'Alpha source text'), record('B', '2026-09-23', 'Bravo source text')];
  const cells = { daily: [['2026-09-23', [['하나.', ['A']], ['둘.', ['B']], ['셋.', ['A']], ['넷.', ['A', 'B']],
    ['다섯.', ['A'], { flags: [{ reason: 'quote_missing', source_id: 'A' }] }]]]] };
  const grouped = viewOf(rows, cells), flat = viewOf(rows, cells, { groupParagraphs: false });
  assert.ok(bulletsOf(grouped).length < bulletsOf(flat).length);
  assert.deepEqual(new Set(evidenceOf(grouped)), new Set(evidenceOf(flat)));
  assert.equal(grouped.split('<a id=').length, flat.split('<a id=').length);
});

test('a same-day weak voice attribution is shown on its evidence line', () => {
  const card = hashText('synthetic-card');
  const voice = (attribution, n, extra = {}) => record(`voice_utterance:synthetic:0000000${n}`, '2026-09-23', '합성 발화',
    { kind: 'voice_utterance', evidence_mode: 'source_id', originrefs: [{ card_sha256: card, card_segment_id: `seg-${n}`,
      source_offsets: [[n, 0, 2]], attribution, ...extra }] });
  const rows = [voice('weak_same_day_context', 1, { attribution_reason: { rule: 'same_day_context.v1', written_sources_that_day: 1,
    matches: [{ kind: 'participant', term: '가나다', field: 'transcript' }] } }), voice('candidate_only_not_accepted', 2)];
  const view = viewOf(rows, { daily: [['2026-09-23', [['약한 귀속 문장.', [rows[0].id]], ['후보 문장.', [rows[1].id]]]]] });
  const lines = evidenceOf(view);
  assert.ok(lines[0].includes('같은 날 기록·참여자 이름 일치(귀속 약함)'));
  assert.ok(!lines[0].includes('과제 귀속 후보(미수락)'));
  assert.ok(lines[1].includes('과제 귀속 후보(미수락)') && !lines[1].includes('귀속 약함'));
});

test('input format v2 compaction renders the same voice evidence lines as per-line bookkeeping', async () => {
  const { digest: dg } = await import('../../src/knowledge_layer/data.mjs');
  const { HISTORY_INPUT_SCHEMA } = await import('../../src/knowledge_layer/history.mjs');
  const session = '20260923_090000_demo';
  const groupFor = (segment, attribution, extra = {}) => ({ source_kind: 'voice', source_root: '/synthetic/sessions',
    card_source_root: '/synthetic/cards', session_id: session, card_run_id: 'card-run', card_segment_id: segment,
    card_sha256: hashText('card'), manifest_sha256: hashText('manifest'), transcript_sha256: hashText('transcript'),
    transcript_path: ['2026-09-23', session, 'transcript.jsonl'], attribution, route_ledger_sha256: null, ...extra,
    segment_title: '합성 구간', derived_title_only: true, semantic_fact_verified: false });
  const groups = [groupFor('seg-1', 'candidate_only_not_accepted'), groupFor('seg-2', 'weak_same_day_context',
    { attribution_reason: { rule: 'same_day_context.v1', written_sources_that_day: 1, matches: [{ kind: 'project_term', term: '합성체계', field: 'transcript' }] } })];
  const lines = [[0, 1, 0, 2, '첫 발화'], [0, 2, 2, 4, '둘째 발화'], [1, 3, 4, 6, '셋째 발화']];
  const base = ([g, uid, , , text]) => ({ id: `voice_utterance:${String(g).repeat(16)}:${String(uid).padStart(8, '0')}`,
    date: '2026-09-23', kind: 'voice_utterance', title: '', sender: '발화자 미확인', recipient: '미기록', attachments: [],
    thread_ref: `voice:${String(g).repeat(16)}`, text, evidence_mode: 'source_id' });
  const old = lines.map(line => ({ ...base(line), originrefs: [{ ...groups[line[0]], source_segment_ids: [line[1]],
    source_offsets: [[line[1], line[2], line[3]]] }] }));
  const keys = groups.map(group => dg(group).slice(7, 23));
  const compact = lines.map(line => ({ ...base(line), originrefs: [{ voice_group: keys[line[0]], source_offsets: [[line[1], line[2], line[3]]] }] }));
  const entry = { title: '합성 녹음', recorded_at: '2026-09-23T09:00:00+09:00', transcript_source: 'plaud',
    transcript_path: join(tmpdir(), 'synthetic', 'transcript.jsonl'), audio_path: join(tmpdir(), 'synthetic', 'a.ogg') };
  const view = (records, extra, display) => {
    const data = normalizeHistoryInput({ project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23', records, ...extra });
    const byId = new Map(data.records.map(row => [row.id, row]));
    const card = (index, text, ids) => ({ card_id: `daily:2026-09-23:00${index}`, text, child_card_ids: [], flags: [],
      evidence: ids.map(id => ({ source_id: id, quote: byId.get(id).text, originrefs: byId.get(id).originrefs })),
      source_ids: [...ids].sort(), source_display: [...ids].sort().map(id => ({ ...historySourceLabel(byId.get(id)), text_sha256: byId.get(id).text_sha256 })) });
    const ids = data.records.map(row => row.id);
    const daily = new Map([['2026-09-23', { layer: 'daily', key: '2026-09-23',
      cards: [card(1, '두 발화.', [ids[0], ids[1]]), card(2, '약한 귀속.', [ids[2]])] }]]);
    return renderHistory(data, daily, new Map(), null, null, display, false, { external: true })
      .split('\n').filter(text => text.startsWith('  - 근거: '));
  };
  const before = view(old, {}, { voice_sources: Object.fromEntries(old.map(row => [row.id, entry])) });
  const after = view(compact, { schema: HISTORY_INPUT_SCHEMA, voice_groups: Object.fromEntries(keys.map((key, i) => [key, groups[i]])) },
    { voice_recordings: { [session]: entry } });
  assert.equal(before.length, 2); assert.deepEqual(after, before);
  assert.ok(after[0].includes('발화 1 00:00–00:02; 발화 2 00:02–00:04') && after[0].includes('PLAUD 전사') && after[0].includes('합성 녹음'));
  assert.ok(after[1].includes('(귀속 약함)'));
});

test('input format v2: explicit version in the fingerprint; a tampered or missing voice group is refused', async () => {
  const { digest: dg, hashText: ht } = await import('../../src/knowledge_layer/data.mjs');
  const { HISTORY_INPUT_SCHEMA, historyInputFingerprint } = await import('../../src/knowledge_layer/history.mjs');
  const rows = [record('A', '2026-09-23', 'Alpha source text')];
  const data = normalizeHistoryInput({ ...input(rows), as_of: '2026-09-23' });
  assert.equal(HISTORY_INPUT_SCHEMA, 'soulforge.history_input.v2');
  assert.equal(historyInputFingerprint({ ...input(rows), as_of: '2026-09-23' }), dg({ input_format: HISTORY_INPUT_SCHEMA,
    project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23', records_sha256: ht(data.records.map(row => dg(row)).join('\n')) }));
  assert.throws(() => normalizeHistoryInput({ ...input(rows), schema: 'soulforge.history_input.v1' }), /history_input_invalid/);
  const group = { source_kind: 'voice', session_id: 'demo', card_segment_id: 'seg-1' };
  const voice = key => record('voice_utterance:synthetic:00000001', '2026-09-19', '발화', { kind: 'voice_utterance',
    evidence_mode: 'source_id', originrefs: [{ voice_group: key, source_offsets: [[1, 0, 2]] }] });
  const key = dg(group).slice(7, 23);
  assert.equal(normalizeHistoryInput({ ...input([voice(key)]), voice_groups: { [key]: group } }).voice_groups[key].session_id, 'demo');
  assert.throws(() => normalizeHistoryInput({ ...input([voice(key)]), voice_groups: { [key]: { ...group, session_id: 'other' } } }), /history_voice_group_invalid/);
  assert.throws(() => normalizeHistoryInput(input([voice(key)])), /history_voice_group_invalid/);
});

test('the view shows a code-generated collection note and marks an oversize mail on its evidence line', () => {
  const rows = [record('A', '2026-09-23', '[본문 크기 초과·미포함]', { originrefs: [{ oversize: { reason: 'event_line_bytes', line_bytes: 9 } }] }),
    record('B', '2026-09-23', 'Bravo source text')];
  const data = normalizeHistoryInput({ project: 'DEMO-1', month: '2026-09', as_of: '2026-09-23', records: rows });
  const byId = new Map(data.records.map(row => [row.id, row]));
  const card = (index, id) => ({ card_id: `daily:2026-09-23:00${index}`, text: `문장 ${index}.`, child_card_ids: [], flags: [],
    evidence: [{ source_id: id, quote: byId.get(id).text, originrefs: byId.get(id).originrefs }], source_ids: [id],
    source_display: [{ ...historySourceLabel(byId.get(id)), text_sha256: byId.get(id).text_sha256 }] });
  const daily = new Map([['2026-09-23', { layer: 'daily', key: '2026-09-23', cards: [card(1, 'A'), card(2, 'B')] }]]);
  const note = { voice_without_card: 3, slack_held: 2, mail_not_collected: ['mail_not_collected_before:2026-05'], mail_oversize: 1 };
  const view = renderHistory(data, daily, new Map(), null, null, { coverage_note: note }, false, { external: true });
  assert.ok(view.includes('> 수집 현황: 녹음 카드 없음 3건 · 보류 Slack 2건 · 수집 전 기간(메일 2026-05 이전) · 크기 초과 메일 1건'));
  const evidence = view.split('\n').filter(text => text.startsWith('  - 근거: '));
  assert.ok(evidence[0].endsWith(' · 본문 크기 초과·미포함')); assert.ok(!evidence[1].includes('본문 크기 초과'));
  const quiet = renderHistory(data, daily, new Map(), null, null, { coverage_note: { voice_without_card: 0, slack_held: 0, mail_not_collected: [], mail_oversize: 0 } }, false, { external: true });
  assert.ok(!quiet.includes('수집 현황'));
  assert.throws(() => renderHistory(data, daily, new Map(), null, null, { coverage_note: { other: 1 } }), /history_display_metadata_invalid/);
});
