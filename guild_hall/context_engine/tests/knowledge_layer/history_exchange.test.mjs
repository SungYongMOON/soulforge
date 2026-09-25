import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareHistoryExchange, finalizeHistoryExchange } from '../../src/knowledge_layer/history_exchange.mjs';
import { digest } from '../../src/knowledge_layer/data.mjs';

const root = () => { const dir = mkdtempSync(join(tmpdir(), 'history-exchange-synthetic-'));
  return [dir, () => rmSync(dir, { recursive: true, force: true })]; };
const record = (id, date, text) => ({ id, date, kind: 'mail', title: 'Synthetic title', sender: 'Person A',
  recipient: 'Person B', text, originrefs: [{ ref: `synthetic:${id}` }] });
const input = (rows = [record('A', '2026-09-14', 'A fact'), record('B', '2026-09-15', 'B fact')]) => ({
  project: 'DEMO-1', month: '2026-09', as_of: '2026-09-18', records: rows });
const rulesText = 'Synthetic history draft rule v1';
const manifest = prepared => JSON.parse(readFileSync(prepared.manifest_path, 'utf8'));
function envelope(prepared, text = 'Recorded fact') {
  return { schema: 'soulforge.history_external_draft.v1', prepare_id: prepared.prepare_id,
    drafts: prepared.packet_paths.map(path => { const packet = JSON.parse(readFileSync(path, 'utf8'));
      return { packet_id: packet.packet_id, sentences: [{ text, evidence_ids: [packet.allowed_evidence_ids[0]] }] }; }) };
}
function finalize(dir, prepared, data = input(), text = 'Recorded fact') {
  return finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: manifest(prepared), draft: envelope(prepared, text) });
}

test('one manifest finalizes sibling days in one CAS, then exposes only ready ancestors', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const data = input();
  const first = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  assert.equal(first.status, 'prepared'); assert.deepEqual(first.packets.map(packet => packet.layer), ['daily', 'daily']);
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  const daily = finalize(dir, first);
  assert.equal(daily.status, 'finalized'); assert.equal(daily.accepted_cells.length, 2);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, daily.draft_file), 'utf8')), envelope(first));
  assert.equal(daily.head.draft_file, daily.draft_file);
  assert.equal(Object.keys(daily.head.cells.daily).length, 2);
  assert.deepEqual(daily.upper_update_targets.weekly, ['2026-09-14_2026-09-18']);
  const dailyView = readFileSync(join(dir, daily.head.view_file), 'utf8');
  assert.match(dailyView, /외부 초안 · 의미 검증\/사람 수락 전/);
  assert.match(dailyView, /작성 대기/); assert.match(dailyView, /근거:/);
  const weeklyPacket = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  assert.deepEqual(weeklyPacket.packets.map(packet => packet.layer), ['weekly']);
  const weekly = finalize(dir, weeklyPacket, data, 'Weekly fact');
  assert.equal(weekly.accepted_cells[0].unused_evidence_ids.length, 1); // manual flow cites one of two daily cards
  assert.deepEqual(weekly.upper_update_targets.monthly, ['2026-09']);
  const monthPacket = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  assert.deepEqual(monthPacket.packets.map(packet => packet.layer), ['monthly']);
  finalize(dir, monthPacket, data, 'Monthly fact');
  const statusPacket = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  assert.deepEqual(statusPacket.packets.map(packet => packet.layer), ['status']);
  const status = finalize(dir, statusPacket, data, 'Recent recorded fact');
  assert.equal(status.head.status, 'ready'); assert.deepEqual(status.upper_update_targets.status, []);
  const same = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  assert.equal(same.status, 'unchanged'); assert.equal(same.packets.length, 0);
  const replay = finalize(dir, statusPacket, data, 'Recent recorded fact');
  assert.equal(replay.status, 'unchanged'); assert.equal(replay.accepted_cells.length, 0);
});

test('unknown evidence, stale input/rules/head and missing sibling drafts reject without current head mutation', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const data = input(), prepared = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  const approved = manifest(prepared), draft = envelope(prepared);
  const badId = structuredClone(draft); badId.drafts[0].sentences[0].evidence_ids = ['FOREIGN'];
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: approved, draft: badId }), /history_exchange_evidence_invalid/);
  assert.equal(readdirSync(dir).includes('history-head.json'), false);
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText: rulesText + ' changed',
    prepared: approved, draft }), /history_exchange_manifest_mismatch/);
  assert.throws(() => finalizeHistoryExchange({ input: input([record('A', '2026-09-14', 'Changed')]),
    outputRoot: dir, rulesText, prepared: approved, draft }), /history_exchange_manifest_mismatch/);
  const missing = structuredClone(draft); missing.drafts.pop();
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: approved, draft: missing }), /history_exchange_draft_invalid/);
  const extraEnvelope = { ...draft, extra: 'unexpected' };
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: approved, draft: extraEnvelope }), /history_exchange_draft_invalid/);
  const extraEntry = structuredClone(draft); extraEntry.drafts[0].extra = 'unexpected';
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: approved, draft: extraEntry }), /history_exchange_draft_invalid/);
  const accepted = finalize(dir, prepared);
  const headBytes = readFileSync(join(dir, 'history-head.json'));
  const different = envelope(prepared, 'Conflicting revision');
  assert.throws(() => finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: approved, draft: different }), /history_exchange_stale_head/);
  assert.deepEqual(readFileSync(join(dir, 'history-head.json')), headBytes);
  assert.equal(accepted.head.cells.daily['2026-09-14'] !== undefined, true);
});

test('a changed day archives its prior version and removes old upper content from current view', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const original = input([record('A', '2026-09-14', 'Original')]);
  for (const label of ['Daily old', 'Weekly old', 'Monthly old', 'Status old']) {
    const prepared = prepareHistoryExchange({ input: original, outputRoot: dir, rulesText });
    finalize(dir, prepared, original, label);
  }
  const old = JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8'));
  const changed = input([record('A', '2026-09-14', 'Revised')]);
  const prepared = prepareHistoryExchange({ input: changed, outputRoot: dir, rulesText });
  assert.deepEqual(prepared.packets.map(packet => packet.layer), ['daily']);
  assert.deepEqual(prepared.upper_update_targets.weekly, ['2026-09-14_2026-09-18']);
  assert.deepEqual(prepared.upper_update_targets.monthly, ['2026-09']);
  assert.deepEqual(prepared.upper_update_targets.status, ['2026-09']);
  const updated = finalize(dir, prepared, changed, 'Daily new');
  assert.equal(updated.head.cells.weekly['2026-09-14_2026-09-18'], undefined);
  assert.equal(updated.head.cells.monthly['2026-09'], undefined);
  assert.equal(updated.head.cells.status['2026-09'], undefined);
  const view = readFileSync(join(dir, updated.head.view_file), 'utf8');
  assert.match(view, /Daily new/); assert.match(view, /작성 대기/);
  assert.doesNotMatch(view, /Weekly old|Monthly old|Status old/);
  assert.ok(readdirSync(dir).includes(`history-head-${digest(old).slice(7)}.json`));
});

test('advancing as_of with a new day retains unchanged daily and closed week revisions', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const firstInput = { ...input([record('A', '2026-09-14', 'Original')]), as_of: '2026-09-20' };
  for (const label of ['Daily', 'Weekly', 'Monthly', 'Status']) {
    const prepared = prepareHistoryExchange({ input: firstInput, outputRoot: dir, rulesText });
    finalize(dir, prepared, firstInput, label);
  }
  const prior = JSON.parse(readFileSync(join(dir, 'history-head.json'), 'utf8'));
  const nextInput = { ...input([record('A', '2026-09-14', 'Original'),
    record('B', '2026-09-21', 'New next-week fact')]), as_of: '2026-09-21' };
  const prepared = prepareHistoryExchange({ input: nextInput, outputRoot: dir, rulesText });
  assert.deepEqual(prepared.packets.map(packet => [packet.layer, packet.key]), [['daily', '2026-09-21']]);
  const updated = finalize(dir, prepared, nextInput, 'New day');
  assert.equal(updated.head.cells.daily['2026-09-14'], prior.cells.daily['2026-09-14']);
  assert.equal(updated.head.cells.weekly['2026-09-14_2026-09-20'], prior.cells.weekly['2026-09-14_2026-09-20']);
  assert.deepEqual(updated.upper_update_targets.weekly, ['2026-09-21_2026-09-21']);
});

test('tampered current head or view is refused before preparing or finalizing', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const data = input([record('A', '2026-09-14', 'Original')]);
  const prepared = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  const accepted = finalize(dir, prepared, data);
  const headFile = join(dir, 'history-head.json'), headBytes = readFileSync(headFile, 'utf8');
  writeFileSync(headFile, JSON.stringify({ ...accepted.head, status: 'changed' }));
  assert.throws(() => prepareHistoryExchange({ input: data, outputRoot: dir, rulesText }), /history_head_corrupt/);
  writeFileSync(headFile, headBytes);
  const viewFile = join(dir, accepted.head.view_file), viewBytes = readFileSync(viewFile, 'utf8');
  writeFileSync(viewFile, viewBytes + 'tampered');
  assert.throws(() => prepareHistoryExchange({ input: data, outputRoot: dir, rulesText }), /history_view_corrupt/);
  assert.throws(() => finalize(dir, prepared, data), /history_view_corrupt/);
});

test('trusted empty input makes no initial packet and cannot erase existing history', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const empty = input([]);
  const initial = prepareHistoryExchange({ input: empty, outputRoot: dir, rulesText });
  assert.equal(initial.status, 'unchanged'); assert.deepEqual(initial.packets, []);
  assert.deepEqual(readdirSync(dir), []);
  const data = input([record('A', '2026-09-14', 'Original')]);
  const prepared = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  finalize(dir, prepared, data);
  const headBefore = readFileSync(join(dir, 'history-head.json'));
  const refused = prepareHistoryExchange({ input: empty, outputRoot: dir, rulesText });
  assert.equal(refused.status, 'refused_empty_input'); assert.deepEqual(refused.packets, []);
  assert.deepEqual(readFileSync(join(dir, 'history-head.json')), headBefore);
});

test('authored empty sentences remain empty and can advance every layer', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const data = input([record('A', '2026-09-14', 'Greeting only')]);
  for (const layer of ['daily', 'weekly', 'monthly', 'status']) {
    const prepared = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
    assert.deepEqual(prepared.packets.map(packet => packet.layer), [layer]);
    const draft = { schema: 'soulforge.history_external_draft.v1', prepare_id: prepared.prepare_id,
      drafts: [{ packet_id: prepared.packets[0].packet_id, sentences: [] }] };
    const accepted = finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
      prepared: manifest(prepared), draft });
    assert.equal(accepted.status, 'finalized');
    assert.deepEqual(accepted.accepted_cells[0].unused_evidence_ids, layer === 'daily' ? ['A'] : []);
    assert.match(readFileSync(join(dir, accepted.head.view_file), 'utf8'), /외부 초안에 문장 없음/);
    if (layer === 'status') assert.equal(accepted.head.status, 'ready');
  }
  assert.equal(prepareHistoryExchange({ input: data, outputRoot: dir, rulesText }).status, 'unchanged');
});

test('finalize counts unquoted daily sources and retains one unprocessed batch', t => {
  const [dir, cleanup] = root(); t.after(cleanup);
  const data = input([record('A', '2026-09-14', 'First fact'),
    record('B', '2026-09-14', 'Second fact')]);
  const prepared = prepareHistoryExchange({ input: data, outputRoot: dir, rulesText });
  const draft = { schema: 'soulforge.history_external_draft.v1',
    prepare_id: prepared.prepare_id, drafts: [{ packet_id: prepared.packets[0].packet_id,
      sentences: [], unprocessed_batches: [{ batch_index: 1, reason: 'format_invalid_after_retry' }] }] };
  const accepted = finalizeHistoryExchange({ input: data, outputRoot: dir, rulesText,
    prepared: manifest(prepared), draft });
  assert.deepEqual(accepted.source_coverage, [{ date: '2026-09-14',
    total_sources: 2, unquoted_sources: 2 }]);
  assert.deepEqual(accepted.accepted_cells[0].unprocessed_batches, draft.drafts[0].unprocessed_batches);
  const view = readFileSync(join(dir, accepted.head.view_file), 'utf8');
  assert.match(view, /미처리 묶음: 1번\(JSON 형식 오류\)/);
  assert.match(view, /2026-09-14: 인용 안 된 자료 2 \/ 전체 자료 2/);
});
