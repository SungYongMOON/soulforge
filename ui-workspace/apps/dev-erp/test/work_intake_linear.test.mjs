import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, link } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorkIntakeLinearReader } from '../src/work_intake_linear.mjs';
import { createLinearReadEvidenceReader } from '../../../../guild_hall/linear_history/linear_read_evidence_reader.mjs';
import { sha256Canonical } from '../../../../guild_hall/shared/project_history_envelope.mjs';
import { createWorkIntakeLinearFixture, LINEAR_FIXTURE_IDS } from './helpers/work_intake_linear_fixture.mjs';

async function fixture(t, options) { const f = await createWorkIntakeLinearFixture(options); t.after(() => f.close()); return f; }
const held = (value, code) => {
  assert.equal(value.status, 'HOLD'); if (code) assert.equal(value.hold_code, code);
  assert.deepEqual(value.observations, []); assert.equal(value.execution_authority, false);
};

test('complete current metadata enumeration preserves existing observations and polling gap without raw issue reads', async t => {
  const f = await fixture(t), reader = createWorkIntakeLinearReader(f.options), perIssue = createLinearReadEvidenceReader(f.options);
  const files = [f.stateFile, f.receiptFile, ...[...f.records.values()].flatMap(record => [record.evidenceFile, record.issueFile])];
  const before = await Promise.all(files.map(file => readFile(file)));
  const result = await reader.snapshot();
  assert.equal(result.status, 'CURRENT'); assert.equal(result.project_ref, 'SYN'); assert.equal(result.scope_ref, 'project:SYN');
  assert.equal(result.enumerated_count, 3); assert.equal(result.foreign_scope_count, 1); assert.equal(result.observations.length, 2);
  assert.equal(result.coverage, 'complete_committed_index'); assert.deepEqual(result.coverage_gaps, ['polling_cannot_prove_hard_deletes']);
  assert.equal(result.generation_seq, 2); assert.equal(result.observed_at, f.receipt.completed_at); assert.equal(result.watermark, f.state.cursor.watermark);
  assert.equal(result.state_sha256, sha256Canonical(f.state).slice(7));
  assert.equal(result.run_receipt_digest, sha256Canonical(f.receipt));
  for (const observation of result.observations) assert.deepEqual(observation, await perIssue.resolve({ issueId: observation.issue_id }));
  assert.equal(await reader.current(result), true); assert.equal(Object.isFrozen(result.observations[0]), true);
  const { snapshot_sha256, ...body } = result; assert.equal(snapshot_sha256, sha256Canonical(body).slice(7));
  for (const forbidden of [f.temporary, 'RAW_ISSUE_BODY', 'task_semantic_sha256', 'title', 'summary', 'description']) {
    assert.equal(JSON.stringify(result).includes(forbidden), false, forbidden);
  }
  assert.deepEqual(await Promise.all(files.map(file => readFile(file))), before);
});

test('project-selected limit and independent global enumeration limit never produce truncated CURRENT results', async t => {
  const f = await fixture(t);
  assert.equal((await createWorkIntakeLinearReader({ ...f.options, maximumIssues: 2 }).snapshot()).status, 'CURRENT');
  held(await createWorkIntakeLinearReader({ ...f.options, maximumIssues: 1 }).snapshot(), 'WORK_INTAKE_LINEAR_PROJECT_LIMIT');
  held(await createWorkIntakeLinearReader({ ...f.options, maximumIssues: 128, maximumEnumeratedIssues: 2 }).snapshot(), 'WORK_INTAKE_LINEAR_ENUMERATION_LIMIT');
  for (const options of [{ maximumIssues: 0 }, { maximumIssues: 1.5 }, { maximumEnumeratedIssues: 0 }, { maxAgeMs: 0 }]) {
    held(await createWorkIntakeLinearReader({ ...f.options, ...options }).snapshot(), 'WORK_INTAKE_LINEAR_BINDING_INVALID');
  }
});

test('missing either half of paired issue/read-evidence index is incomplete even for foreign scope', async t => {
  for (const prefix of ['issues', 'read_evidence']) {
    for (const id of [LINEAR_FIXTURE_IDS[0], LINEAR_FIXTURE_IDS[2]]) {
      const f = await fixture(t); delete f.state.object_index[`${prefix}:${id}`]; await f.publish();
      held(await createWorkIntakeLinearReader(f.options).snapshot(), 'WORK_INTAKE_LINEAR_INDEX_COVERAGE_MISMATCH');
    }
  }
});

test('one corrupt or missing per-issue observation holds the whole batch with no partial output', async t => {
  for (const id of [LINEAR_FIXTURE_IDS[0], LINEAR_FIXTURE_IDS[2]]) {
    const f = await fixture(t), record = f.records.get(id);
    record.wrapper.content_sha256 = `sha256:${'0'.repeat(64)}`;
    await f.save(record.evidenceFile, record.wrapper);
    held(await createWorkIntakeLinearReader(f.options).snapshot(), 'WORK_INTAKE_LINEAR_ITEM_NOT_CURRENT');
  }
  const f = await fixture(t);
  f.state.object_index[`read_evidence:${LINEAR_FIXTURE_IDS[0]}`].content_sha256 = `sha256:${'0'.repeat(64)}`; await f.publish();
  held(await createWorkIntakeLinearReader(f.options).snapshot(), 'WORK_INTAKE_LINEAR_ITEM_NOT_CURRENT');
});

test('unsupported states and mismatched issue update/hash never become metadata task semantics', async t => {
  for (const change of ['status', 'update', 'hash']) {
    const f = await fixture(t), id = LINEAR_FIXTURE_IDS[0];
    if (change === 'status') {
      f.records.get(id).wrapper.object.evidence.task_status = 'Mystery'; await f.publishEnvelope(id);
    } else {
      f.state.object_index[`issues:${id}`][change === 'update' ? 'updated_at' : 'content_sha256'] = change === 'update'
        ? f.receipt.completed_at : `sha256:${'0'.repeat(64)}`; await f.publish();
    }
    held(await createWorkIntakeLinearReader(f.options).snapshot(), 'WORK_INTAKE_LINEAR_ITEM_NOT_CURRENT');
  }
});

test('receipt, writer, organization and current binding replacement fail closed', async t => {
  for (const mutate of [f => { f.receipt.binding_sha256 = `sha256:${'b'.repeat(64)}`; }, f => { f.receipt.organization_id = LINEAR_FIXTURE_IDS[0]; },
    f => { f.receipt.workspace_url_key = 'other-forge'; }, f => { f.receipt.writer_epoch = 2; }, f => { f.state.writer_epoch = 2; },
    f => { f.state.identity_digest = `sha256:${'0'.repeat(64)}`; }]) {
    const f = await fixture(t), reader = createWorkIntakeLinearReader(f.options), baseline = await reader.snapshot();
    mutate(f); await f.publish(); held(await reader.snapshot()); assert.equal(await reader.current(baseline), false);
  }
});

test('stale watermark, future clock, unfinished cursor and extra collection gaps hold', async t => {
  const f = await fixture(t);
  held(await createWorkIntakeLinearReader({ ...f.options, maxAgeMs: 60000 }).snapshot(), 'WORK_INTAKE_LINEAR_STALE');
  const oldState = structuredClone(f.state), oldReceipt = structuredClone(f.receipt);
  for (const mutate of [() => { f.state.cursor.watermark = '2026-09-08T01:00:00.000Z'; f.receipt.cursor_after = f.state.cursor; },
    () => { f.state.cursor.watermark = '2026-09-07T00:00:00.000Z'; f.receipt.cursor_after = f.state.cursor; },
    () => { f.receipt.coverage_gaps.push('catalog_continuation_pending'); },
    () => { f.state.cursor.backfill = { lower: f.receipt.window.lower, upper: f.receipt.window.upper,
      resume_watermark: f.state.cursor.watermark, stall_count: 0 }; f.receipt.cursor_after = f.state.cursor; },
    () => { f.receipt.cursor_before.generation_seq = 0; },
    () => { f.state.last_completed_at = '2026-09-08T00:01:00.000Z'; }]) {
    Object.assign(f.state, structuredClone(oldState)); Object.assign(f.receipt, structuredClone(oldReceipt));
    mutate(); await f.publish(); held(await createWorkIntakeLinearReader(f.options).snapshot());
  }
});

test('committed empty index is CURRENT only with complete current receipt and valid binding', async t => {
  const f = await fixture(t, { issues: [] }), reader = createWorkIntakeLinearReader(f.options);
  const empty = await reader.snapshot(); assert.equal(empty.status, 'CURRENT'); assert.deepEqual(empty.observations, []);
  assert.equal(empty.enumerated_count, 0); assert.equal(empty.coverage, 'complete_committed_index');
  assert.equal(await reader.current(empty), true);
  f.receipt.objects.issues.observed = 1; f.receipt.objects.issues.unchanged = 1; await f.publish();
  held(await reader.snapshot(), 'WORK_INTAKE_LINEAR_INDEX_COVERAGE_MISMATCH');
  f.receipt.objects.issues.observed = 0; f.receipt.objects.issues.unchanged = 0; f.receipt.coverage_gaps = ['run_deadline_reached']; await f.publish();
  held(await reader.snapshot(), 'WORK_INTAKE_LINEAR_COVERAGE_INCOMPLETE');
  held(await createWorkIntakeLinearReader({ ...f.options, expectedBinding: { ...f.expectedBinding, organization_id: 'not-an-id' } }).snapshot(), 'WORK_INTAKE_LINEAR_BINDING_INVALID');
});

test('foreign scope alone is skipped; valid empty project coverage retains global counts', async t => {
  const f = await fixture(t);
  const reader = createWorkIntakeLinearReader({ ...f.options, expectedBinding: { ...f.expectedBinding, project_scope_ref: 'project:THIRD', project_code: 'THIRD' } });
  const snapshot = await reader.snapshot(); assert.equal(snapshot.status, 'CURRENT'); assert.equal(snapshot.project_ref, 'THIRD');
  assert.equal(snapshot.enumerated_count, 3); assert.equal(snapshot.foreign_scope_count, 3); assert.deepEqual(snapshot.observations, []);
});

test('generation or receipt replacement during enumeration is detected before CURRENT leaves the reader', async t => {
  for (const kind of ['state', 'receipt']) {
    const f = await fixture(t); let calls = 0;
    const reader = createWorkIntakeLinearReader({ ...f.options, now: () => {
      if (++calls === 2) {
        if (kind === 'state') { f.state.cursor.generation_seq++; writeFileSync(f.stateFile, JSON.stringify(f.state)); }
        else { f.receipt.custody_manifest_digest = `sha256:${'d'.repeat(64)}`; writeFileSync(f.receiptFile, JSON.stringify(f.receipt)); }
      }
      return new Date('2026-09-08T00:05:00.000Z');
    } });
    held(await reader.snapshot());
  }
});

test('current re-enumerates and detects changes beyond selected task metadata', async t => {
  const f = await fixture(t), reader = createWorkIntakeLinearReader(f.options), baseline = await reader.snapshot();
  assert.equal(await reader.current({ ...baseline, project_ref: 'OTHER' }), false);
  f.state.object_index['comments:synthetic'] = { content_sha256: `sha256:${'b'.repeat(64)}`, updated_at: f.receipt.completed_at };
  await f.publish(); assert.equal(await reader.current(baseline), false);
  const after = await reader.snapshot(); assert.equal(after.status, 'CURRENT'); assert.notEqual(after.snapshot_sha256, baseline.snapshot_sha256);
  assert.deepEqual(after.observations, baseline.observations);
});

test('nonordinary metadata files and invalid paths cannot be read or expose local paths', async t => {
  const f = await fixture(t);
  await link(f.stateFile, path.join(f.temporary, 'linked-state.json'));
  const result = await createWorkIntakeLinearReader(f.options).snapshot(); held(result, 'WORK_INTAKE_LINEAR_PATH_INVALID');
  assert.equal(JSON.stringify(result).includes(f.temporary), false);
  held(await createWorkIntakeLinearReader({ ...f.options, root: f.stateRoot }).snapshot(), 'WORK_INTAKE_LINEAR_BINDING_INVALID');
});
