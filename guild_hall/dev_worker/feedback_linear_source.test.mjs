import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { sha256Canonical } from '../shared/project_history_envelope.mjs';
import { LINEAR_READ_OPERATIONS } from '../linear_history/linear_graphql_client.mjs';
import { runReceiptObjectKinds, validateLinearCollectRunReceipt } from '../linear_history/linear_collect_receipt.mjs';
import { identityDigestForBinding, readEvidenceRecordForIssue } from '../linear_history/linear_collect_runner.mjs';
import { createLinearReadEvidenceReader } from '../linear_history/linear_read_evidence_reader.mjs';
import { createLinearFeedbackSource } from './feedback_linear_source.mjs';

const ISSUE = 'f8091a2b-3c4d-4859-aa6b-465768798a9b';
const COMPLETED = '2026-09-07T00:00:00.000Z';
const NOW = '2026-09-07T00:05:00.000Z';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const roots = new Set();
after(async () => {
  for (const root of roots) {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^feedback-linear-[A-Za-z0-9]+$/u);
    await rm(root, { recursive: true, force: true });
  }
});
async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), 'utf8');
}
const delegation = () => ({ delegation_ref: 'delegation:synthetic-feedback', authority_revision: 'authority:1',
  issue_id: ISSUE, scope_ref: 'project:SYN', kind: 'improvement', status: 'CURRENT',
  selection_authority: 'internal_feedback_source', valid_from: COMPLETED, valid_until: '2026-09-08T00:00:00.000Z' });

// Synthetic committed collection metadata exercises the production reader. The
// issue custody object is deliberately unreadable: this seam never needs bodies.
async function fixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'feedback-linear-'));
  roots.add(path.resolve(temporary));
  const root = path.join(temporary, 'custody', 'synthetic-forge');
  const stateRoot = path.join(temporary, 'state');
  const binding = { lane_id: 'synthetic-linear', writer: { authority_id: 'synthetic-writer', epoch: 1 },
    workspace: { url_key: 'synthetic-forge', project_scope_map: [{ linear_project_id: 'project-1', project_scope_ref: 'project:SYN' }] } };
  const expectedBinding = { custody_root: root, state_root: stateRoot, lane_id: binding.lane_id,
    identity_digest: identityDigestForBinding(binding), writer_authority_id: binding.writer.authority_id,
    writer_epoch: 1, binding_sha256: DIGEST, workspace_url_key: 'synthetic-forge',
    organization_id: 'a8091a2b-3c4d-4859-aa6b-465768798a9b', project_scope_ref: 'project:SYN', project_code: 'SYN' };
  const issue = { id: ISSUE, identifier: 'SYN-1', updated_at: '2026-08-01T00:00:00.000Z',
    state_name: 'In Progress', project_id: 'project-1', title: 'Synthetic improvement', creator_id: ISSUE };
  const envelope = readEvidenceRecordForIssue(binding, issue).envelope;
  const digest = sha256Canonical(envelope);
  const wrapper = { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'read_evidence',
    object_id: ISSUE, content_sha256: digest, object: envelope };
  const cursor = { schema_version: 'soulforge.linear_collect.cursor.v1', watermark: COMPLETED, backfill: null, generation_seq: 2 };
  const state = { schema_version: 'soulforge.linear_collect.state.v1', lane_id: expectedBinding.lane_id,
    identity_digest: expectedBinding.identity_digest, writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, cursor, object_index: {
      [`issues:${ISSUE}`]: { content_sha256: envelope.issue_content_sha256, updated_at: issue.updated_at },
      [`read_evidence:${ISSUE}`]: { content_sha256: digest, updated_at: issue.updated_at },
    }, last_run_id: 'run-synthetic', last_completed_at: COMPLETED };
  const receipt = { schema_version: 'soulforge.linear_collect.run_receipt.v1', lane_id: expectedBinding.lane_id,
    run_id: state.last_run_id, generation_seq: 2, mode: 'apply', status: 'ok', writer_authority_id: expectedBinding.writer_authority_id,
    writer_epoch: 1, binding_sha256: DIGEST, workspace_url_key: expectedBinding.workspace_url_key,
    organization_id: expectedBinding.organization_id, started_at: COMPLETED, completed_at: COMPLETED, duration_ms: 0,
    window: { lower: '2026-09-06T23:45:00.000Z', upper: COMPLETED, phase: 'delta', order_observed: 'ascending' },
    cursor_before: { ...cursor, generation_seq: 1 }, cursor_after: cursor,
    read_calls: { total: 0, by_operation: Object.fromEntries(LINEAR_READ_OPERATIONS.map(key => [key, 0])) },
    objects: Object.fromEntries(runReceiptObjectKinds('soulforge.linear_collect.run_receipt.v1').map(key => [key, { observed: 0, created: 0, unchanged: 0 }])),
    custody_manifest_digest: DIGEST, coverage_gaps: ['polling_cannot_prove_hard_deletes'], error_codes: [],
    repository_writes: 0, private_writes: 3, network_used: false };
  validateLinearCollectRunReceipt(receipt);
  const stateFile = path.join(stateRoot, 'state', 'linear-collect.json');
  const receiptFile = path.join(stateRoot, 'receipts', `${state.last_run_id}.json`);
  const evidenceFile = path.join(root, 'read_evidence', ISSUE, `${digest.slice(7)}.json`);
  await save(stateFile, state);
  await save(receiptFile, receipt);
  await save(evidenceFile, wrapper);
  const issueFile = path.join(root, 'issues', ISSUE, `${envelope.issue_content_sha256.slice(7)}.json`);
  await mkdir(path.dirname(issueFile), { recursive: true });
  await writeFile(issueFile, 'invalid JSON; synthetic body must never be read');
  const live = { delegation: delegation(), now: Date.parse(NOW) };
  const options = { reader: createLinearReadEvidenceReader({ root, expectedBinding, now: () => live.now }),
    listDelegations: async () => [live.delegation], currentDelegation: async () => live.delegation, now: () => live.now };
  return { root, temporary, binding, issue, state, receipt, wrapper, stateFile, receiptFile, evidenceFile,
    expectedBinding, live, options, source: createLinearFeedbackSource(options) };
}

async function publishIssue(f) {
  const envelope = readEvidenceRecordForIssue(f.binding, f.issue).envelope;
  const digest = sha256Canonical(envelope);
  f.wrapper = { schema_version: 'soulforge.linear_collect.custody_object.v1', kind: 'read_evidence',
    object_id: ISSUE, content_sha256: digest, object: envelope };
  f.state.object_index[`issues:${ISSUE}`] = { content_sha256: envelope.issue_content_sha256, updated_at: f.issue.updated_at };
  f.state.object_index[`read_evidence:${ISSUE}`] = { content_sha256: digest, updated_at: f.issue.updated_at };
  f.evidenceFile = path.join(f.root, 'read_evidence', ISSUE, `${digest.slice(7)}.json`);
  await save(f.evidenceFile, f.wrapper);
  await save(f.stateFile, f.state);
}

test('an explicit current delegation projects exact committed metadata without execution authority or payload', async () => {
  const f = await fixture();
  const paths = [f.stateFile, f.receiptFile, f.evidenceFile];
  const before = await Promise.all(paths.map(file => readFile(file, 'utf8')));
  const snapshot = await f.source.snapshot();
  assert.equal(snapshot.status, 'CURRENT');
  assert.equal(snapshot.items.length, 1);
  assert.deepEqual(Object.keys(snapshot).sort(), ['items', 'snapshot_ref', 'status']);
  const item = snapshot.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['kind', 'scope_ref', 'semantic_sha256', 'source_ref', 'source_revision']);
  assert.equal(item.source_ref, `linear.issue:${ISSUE}`);
  assert.equal(item.kind, 'improvement');
  assert.equal(item.scope_ref, 'project:SYN');
  assert.match(item.semantic_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(await f.source.current(item.source_ref, item.semantic_sha256), true);
  assert.equal(f.source.execution_authority, false);
  assert.equal(JSON.stringify(snapshot).includes('Synthetic improvement'), false);
  assert.equal(JSON.stringify(snapshot).includes(f.temporary), false);
  assert.deepEqual(await Promise.all(paths.map(file => readFile(file, 'utf8'))), before);
});

test('a delegation revoked while a later issue is read invalidates the whole snapshot', async () => {
  const f = await fixture();
  const second = { ...delegation(), issue_id: 'b8091a2b-3c4d-4859-aa6b-465768798a9b', delegation_ref: 'delegation:second' };
  let first = delegation();
  const source = createLinearFeedbackSource({ ...f.options, listDelegations: async () => [first, second],
    currentDelegation: async ref => ref === second.delegation_ref ? second : first,
    reader: { async resolve({ issueId }) {
      const result = await f.options.reader.resolve({ issueId: ISSUE });
      if (issueId === second.issue_id) first = null;
      return { ...result, issue_id: issueId };
    } } });
  assert.equal((await source.snapshot()).status, 'HOLD');
});

test('another committed poll leaves source keys unchanged despite new receipt and generation digests', async () => {
  const f = await fixture();
  const before = await f.source.snapshot();
  const readBefore = await f.options.reader.resolve({ issueId: ISSUE });
  f.receipt.cursor_before = structuredClone(f.state.cursor);
  f.state.cursor.generation_seq += 1;
  f.state.last_run_id = 'run-next-poll';
  f.receipt.run_id = f.state.last_run_id;
  f.receipt.generation_seq = f.state.cursor.generation_seq;
  f.receipt.cursor_after = f.state.cursor;
  await save(path.join(f.expectedBinding.state_root, 'receipts', `${f.state.last_run_id}.json`), f.receipt);
  await save(f.stateFile, f.state);
  const readAfter = await f.options.reader.resolve({ issueId: ISSUE });
  assert.equal(readAfter.status, 'CURRENT');
  assert.notEqual(readAfter.run_receipt_digest, readBefore.run_receipt_digest);
  assert.equal(readAfter.generation_seq, 3);
  assert.deepEqual(await f.source.snapshot(), before);
  assert.equal(await f.source.current(before.items[0].source_ref, before.items[0].semantic_sha256), true);
});

for (const [name, mutate] of [
  ['meaningful issue title', f => { f.issue.title = 'Changed synthetic requirement'; }],
  ['provider updated_at (conservative full-issue-hash limitation)', f => { f.issue.updated_at = '2026-08-02T00:00:00.000Z'; }],
  ['provider status (conservative full-issue-hash limitation)', f => { f.issue.state_name = 'Todo'; }],
]) {
  test(`${name} invalidates the old observation and produces a new key`, async () => {
    const f = await fixture();
    const before = (await f.source.snapshot()).items[0];
    mutate(f);
    await publishIssue(f);
    assert.equal(await f.source.current(before.source_ref, before.semantic_sha256), false);
    const snapshot = await f.source.snapshot();
    assert.equal(snapshot.status, 'CURRENT');
    assert.equal(snapshot.items[0].source_ref, before.source_ref);
    assert.notEqual(snapshot.items[0].semantic_sha256, before.semantic_sha256);
    assert.notEqual(snapshot.items[0].source_revision, before.source_revision);
  });
}

for (const [name, mutate] of [
  ['authority revision', d => { d.authority_revision = 'authority:2'; }],
  ['kind', d => { d.kind = 'bug'; }],
  ['delegation reference', d => { d.delegation_ref = 'delegation:replacement'; }],
]) {
  test(`${name} is bound to the observation key`, async () => {
    const f = await fixture();
    const before = (await f.source.snapshot()).items[0];
    mutate(f.live.delegation);
    assert.equal(await f.source.current(before.source_ref, before.semantic_sha256), false);
    const snapshot = await f.source.snapshot();
    assert.equal(snapshot.status, 'CURRENT');
    assert.notEqual(snapshot.items[0].semantic_sha256, before.semantic_sha256);
  });
}

test('empty explicit delegation list performs no discovery or provider reads', async () => {
  let reads = 0;
  const source = createLinearFeedbackSource({ reader: { async resolve() { reads += 1; throw Error('unexpected'); } },
    listDelegations: async () => [], currentDelegation: async () => null });
  const snapshot = await source.snapshot();
  assert.equal(snapshot.status, 'CURRENT');
  assert.deepEqual(snapshot.items, []);
  assert.equal(reads, 0);
  assert.equal(await source.current(`linear.issue:${ISSUE}`, 'a'.repeat(64)), false);
});

for (const [name, mutate] of [
  ['revoked', d => { d.status = 'REVOKED'; }],
  ['not current', d => { d.status = 'STALE'; }],
  ['expired', d => { d.valid_until = NOW; }],
  ['not started', d => { d.valid_from = '2026-09-07T01:00:00.000Z'; }],
  ['noncanonical date', d => { d.valid_until = '2026-09-08'; }],
  ['foreign scope', d => { d.scope_ref = 'project:OTHER'; }],
  ['issue identifier instead of UUID', d => { d.issue_id = 'SYN-1'; }],
  ['foreign issue UUID', d => { d.issue_id = 'b8091a2b-3c4d-4859-aa6b-465768798a9b'; }],
  ['execution selection authority', d => { d.selection_authority = 'execute'; }],
  ['keyword classification', d => { d.kind = 'self-improvement'; }],
  ['extra createdBy field', d => { d.createdBy = ISSUE; }],
  ['extra boolean authority', d => { d.execution_authority = true; }],
  ['extra symbol field', d => { d[Symbol('hidden')] = true; }],
  ['missing authority revision', d => { delete d.authority_revision; }],
  ['getter authority', d => { Object.defineProperty(d, 'authority_revision', { get: () => 'authority:1' }); }],
]) {
  test(`${name} delegation is held and cannot return a cached current observation`, async () => {
    const f = await fixture();
    const before = (await f.source.snapshot()).items[0];
    mutate(f.live.delegation);
    const snapshot = await f.source.snapshot();
    assert.equal(snapshot.status, 'HOLD');
    assert.deepEqual(snapshot.items, []);
    f.live.delegation = delegation();
    assert.equal(await f.source.current(before.source_ref, before.semantic_sha256), false);
  });
}

test('duplicate issue or delegation references and oversized or sparse lists are held before reads', async () => {
  const f = await fixture();
  const grant = delegation();
  for (const entries of [[grant, { ...grant, delegation_ref: 'delegation:second' }],
    [grant, { ...grant, issue_id: 'b8091a2b-3c4d-4859-aa6b-465768798a9b' }], Array(257).fill(grant), Array(1)]) {
    let reads = 0;
    const source = createLinearFeedbackSource({ ...f.options, listDelegations: async () => entries,
      reader: { async resolve() { reads += 1; throw Error('unexpected'); } } });
    assert.equal((await source.snapshot()).status, 'HOLD');
    assert.equal(reads, 0);
  }
});

for (const port of ['reader', 'listDelegations', 'currentDelegation']) {
  test(`${port} exceptions clear all cached evidence and never expose provider errors`, async () => {
    const f = await fixture();
    let broken = false;
    const error = () => { throw Error('synthetic raw diagnostic must not escape'); };
    const source = createLinearFeedbackSource({ ...f.options,
      reader: { resolve: args => broken && port === 'reader' ? error() : f.options.reader.resolve(args) },
      listDelegations: async () => broken && port === 'listDelegations' ? error() : [f.live.delegation],
      currentDelegation: async () => broken && port === 'currentDelegation' ? error() : f.live.delegation });
    const before = (await source.snapshot()).items[0];
    broken = true;
    if (port !== 'listDelegations') assert.equal(await source.current(before.source_ref, before.semantic_sha256), false);
    const held = await source.snapshot();
    assert.equal(held.status, 'HOLD');
    assert.equal(JSON.stringify(held).includes('raw diagnostic'), false);
    broken = false;
    assert.equal(await source.current(before.source_ref, before.semantic_sha256), false);
    assert.equal((await source.snapshot()).status, 'CURRENT');
  });
}

test('real metadata corruption or stale collection evidence invalidates cached observations', async () => {
  const f = await fixture();
  const item = (await f.source.snapshot()).items[0];
  await writeFile(f.stateFile, 'invalid synthetic metadata');
  assert.equal(await f.source.current(item.source_ref, item.semantic_sha256), false);
  assert.equal((await f.source.snapshot()).status, 'HOLD');
  await save(f.stateFile, f.state);
  assert.equal(await f.source.current(item.source_ref, item.semantic_sha256), false);
  assert.equal((await f.source.snapshot()).status, 'CURRENT');
  f.live.now = Date.parse('2026-09-07T01:00:00.000Z');
  assert.equal(await f.source.current(item.source_ref, item.semantic_sha256), false);
  assert.equal((await f.source.snapshot()).status, 'HOLD');
});

for (const action of ['snapshot', 'current']) {
  for (const change of ['revoke', 'revise', 'expire']) {
    test(`${change} during a reader await is rechecked before ${action} returns`, async () => {
      const f = await fixture();
      let changeAfterRead = false;
      const source = createLinearFeedbackSource({ ...f.options, reader: { async resolve(args) {
        const result = await f.options.reader.resolve(args);
        if (changeAfterRead) {
          if (change === 'revoke') f.live.delegation = null;
          if (change === 'revise') f.live.delegation.authority_revision = 'authority:2';
          if (change === 'expire') f.live.now = Date.parse(f.live.delegation.valid_until);
        }
        return result;
      } } });
      const before = (await source.snapshot()).items[0];
      changeAfterRead = true;
      if (action === 'snapshot') assert.equal((await source.snapshot()).status, 'HOLD');
      else assert.equal(await source.current(before.source_ref, before.semantic_sha256), false);
    });
  }
}

test('provider creator identity and purported self-echo flags cannot suppress an explicitly delegated issue', async () => {
  const f = await fixture();
  f.issue.created_by_feedback_cycle = true;
  f.issue.is_self_echo = true;
  await publishIssue(f);
  const snapshot = await f.source.snapshot();
  assert.equal(snapshot.status, 'CURRENT');
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].source_ref, `linear.issue:${ISSUE}`);
  assert.equal(JSON.stringify(snapshot).includes('is_self_echo'), false);
  assert.equal(f.source.execution_authority, false);
});

test('resolver output cannot promote observation into execution or redirect its exact issue/scope', async () => {
  const f = await fixture();
  for (const patch of [{ execution_authority: true }, { status: 'STALE' }, { issue_id: 'SYN-1' },
    { project_scope_ref: 'project:OTHER' }, { issue_content_sha256: 'not-a-hash' }]) {
    const source = createLinearFeedbackSource({ ...f.options, reader: { async resolve(args) {
      return { ...await f.options.reader.resolve(args), ...patch };
    } } });
    assert.equal((await source.snapshot()).status, 'HOLD');
    assert.equal(source.execution_authority, false);
  }
});
