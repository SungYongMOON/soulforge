// The pass that keeps the unified database level with custody, tested where it
// decides things: what changed in the grant, which items a pass stops offering,
// what "completed" is allowed to mean, and what happens to a judged relation
// whose evidence moved. The parts that talk to a store, a model or a database are
// exercised by the harness's own runs; these are the rules underneath them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GRAPH_SYNC_CANDIDATE_SCHEMA, GRAPH_SYNC_PENDING_SCHEMA, SYNC_LIMITS, aliasAddressFor, clearCompleted,
  grantDifference, holdBack, nextGenerationId, readLedger, refreshCandidates } from '../harness/estate_graph_sync.mjs';

const NOW = '2026-09-14T00:00:00.000Z';
const grant = sources => ({ sources });
const items = (root, ids) => ({ root_ref: root, items: ids.map(id => ({ item_id: id })) });

test('a grant difference says what arrived, what custody no longer holds, and what a narrowed admission took away', () => {
  const before = grant([items('linear.custody', ['a', 'b']), items('slack.channel', ['1.1', '2.2']),
    items('mail.hiworks.company', ['m1'])]);
  // custody gained a Linear issue, lost a Slack message, and the admission stopped
  // naming the mail root at all -- which reaches this side as an absent source.
  const after = grant([items('linear.custody', ['a', 'b', 'c']), items('slack.channel', ['1.1'])]);
  const difference = grantDifference(before, after);
  assert.deepEqual(difference.added, [{ root_ref: 'linear.custody', item_id: 'c' }]);
  assert.deepEqual(difference.removed, [{ root_ref: 'mail.hiworks.company', item_id: 'm1' },
    { root_ref: 'slack.channel', item_id: '2.2' }]);
  assert.equal(difference.changed, true);
  assert.equal(grantDifference(before, before).changed, false, 'nothing new is not a change');
});

test('the next generation id follows this project\u2019s own numbering and ignores everything else', () => {
  assert.equal(nextGenerationId('p26014-graph', []), 'p26014-graph-001');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-001', 'p26014-graph-002']), 'p26014-graph-003');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-007', 'p24049-graph-099', 'other']), 'p26014-graph-008',
    'another project\u2019s generations in the same store do not move this one\u2019s number');
  assert.equal(nextGenerationId('p26014-graph', ['p26014-graph-1']), 'p26014-graph-001', 'only the three-digit form counts');
});

test('an item a pass could not get in is offered again next time, and stops being offered after a bound', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ctx-sync-ledger-'));
  let ledger = readLedger(dir, 'P26-014');
  assert.deepEqual([ledger.schema_version, Object.keys(ledger.items).length], [GRAPH_SYNC_PENDING_SCHEMA, 0],
    'no ledger is an empty ledger, not a failure');

  const row = { root_ref: 'mail.hiworks.company', item_id: 'm1', code: 'extraction_refused', now: NOW };
  for (let pass = 1; pass < SYNC_LIMITS.item_attempts; pass++) {
    const state = holdBack(ledger, row);
    assert.deepEqual([state.attempts, state.state], [pass, 'pending'],
      'while it is still being retried the item is pending, with the code that held it');
  }
  const last = holdBack(ledger, row);
  assert.deepEqual([last.attempts, last.state, last.code], [SYNC_LIMITS.item_attempts, 'failed', 'extraction_refused']);
  assert.equal(last.first_seen, NOW, 'when it first failed is kept');

  // Getting in clears it. Nothing else is touched.
  ledger = holdBack(ledger, { ...row, item_id: 'm2' }) && ledger;
  clearCompleted(ledger, [{ root_ref: 'mail.hiworks.company', item_id: 'm1' }]);
  assert.deepEqual(Object.keys(ledger.items), ['mail.hiworks.company|m2']);

  // A ledger written by this pass reads back as the same ledger.
  await writeFile(path.join(dir, 'pending.json'), `${JSON.stringify({ ...ledger, updated_at: NOW }, null, 2)}\n`);
  assert.deepEqual(readLedger(dir, 'P26-014').items, ledger.items);
  assert.deepEqual(readLedger(dir, 'P24-049').items, {}, 'a ledger belongs to the project it names');
  // A file that is not a ledger is not read as one.
  await writeFile(path.join(dir, 'pending.json'), '{"items": {"x|y": {}}}');
  assert.deepEqual(readLedger(dir, 'P26-014').items, {});
});

test('a judged relation is never applied by a pass, and goes stale when the unit it quoted moved', () => {
  const candidate = { judgement_id: 'sha256:' + 'd'.repeat(64), relation_kind: 'condition_material_for',
    direction: 'a_to_b', a: { item_id: 'SON-41', unit_id: 'u0001', doc_key: 'sha256:' + '1'.repeat(64) },
    b: { item_id: '1785902897.750169', unit_id: 'u0000', doc_key: 'sha256:' + '2'.repeat(64) } };
  const manifest = { generation_id: 'p26014-graph-002', documents: [
    { item_id: 'SON-41', doc_key: 'sha256:' + '1'.repeat(64) },
    { item_id: '1785902897.750169', doc_key: 'sha256:' + '2'.repeat(64) }] };
  const held = { schema_version: GRAPH_SYNC_CANDIDATE_SCHEMA, project_code: 'P26-014', approved: [], candidates: [candidate] };

  const same = refreshCandidates({ held, project: 'P26-014', manifest, now: NOW });
  assert.deepEqual(same.counts, { candidates: 1, stale: 0, approved: 0, applied_by_this_pass: 0 });
  assert.equal(same.body.candidates[0].review_state, 'candidate');

  // The Slack message was edited: its document key moved, so the judgement was
  // made about text this generation no longer holds.
  const moved = { ...manifest, documents: [manifest.documents[0], { item_id: '1785902897.750169', doc_key: 'sha256:' + '9'.repeat(64) }] };
  const stale = refreshCandidates({ held, project: 'P26-014', manifest: moved, now: NOW });
  assert.deepEqual([stale.counts.candidates, stale.counts.stale], [0, 1]);
  assert.deepEqual([stale.body.candidates[0].review_state, stale.body.candidates[0].stale_reason,
    stale.body.candidates[0].marked_stale_at], ['stale', 'b:revision_changed', NOW]);

  // The item left the grant entirely: also stale, and said differently.
  const gone = { ...manifest, documents: [manifest.documents[0]] };
  assert.equal(refreshCandidates({ held, project: 'P26-014', manifest: gone, now: NOW })
    .body.candidates[0].stale_reason, 'b:not_in_generation');

  // Approval is a person's field: a pass reads it and writes it back untouched.
  const approved = { ...held, approved: [{ judgement_id: candidate.judgement_id, approved_by: 'actor:owner' }] };
  const kept = refreshCandidates({ held: approved, project: 'P26-014', manifest, now: NOW });
  assert.deepEqual(kept.body.approved, approved.approved);
  assert.equal(kept.counts.applied_by_this_pass, 0, 'a pass applies none of them, approved or not');
  // A file that is not a candidate file starts an empty one rather than being read.
  assert.deepEqual(refreshCandidates({ held: { candidates: 'not a list' }, project: 'P26-014', manifest, now: NOW })
    .body.candidates, []);
});

test('an absolute source root becomes the alias address of the root table that holds it, or nothing', () => {
  // The path shapes are built rather than written: a Windows absolute path in a
  // tracked file is a host address, and this test is about the rule, not a host.
  const sep = String.fromCharCode(92);
  const win = (...parts) => parts.join(sep);
  const drive = `${String.fromCharCode(68)}:`;
  const data = win(drive, 'Soulforge-data'), control = win(drive, 'Soulforge-control');
  const table = { roots: { data_root: data, control_root: control } };
  assert.equal(aliasAddressFor(table, win(data, 'ingress', 'slack', 'channels', 'P26-014')),
    'data_root/ingress/slack/channels/P26-014');
  assert.equal(aliasAddressFor(table, data), 'data_root');
  assert.equal(aliasAddressFor(table, `${data}${sep}`), 'data_root');
  assert.equal(aliasAddressFor(table, win(drive, 'Elsewhere', 'ingress')), null,
    'a root the table does not hold has no address, and is reported rather than guessed at');
  assert.equal(aliasAddressFor(table, win(`${data}-other`, 'x')), null, 'a prefix is not a parent');
});
