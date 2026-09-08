import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createWorkIntakeStore, workIntakeExposureRequestDigest } from '../src/work_intake_store.mjs';
import { syntheticInput, syntheticResult, eventAttempt, END } from './work_intake_test_helpers.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
function setup(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'sf-intake-test-'));
  const stores = [];
  const open = () => {
    const store = createWorkIntakeStore({ directory, repositoryRoot, project_ref: 'P01' });
    assert.equal(store.status, 'OPEN'); stores.push(store); return store;
  };
  t.after(() => { for (const store of stores) store.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, open };
}
const access = { checkAccess: async (r) => ({ allowed: true, request_sha256: workIntakeExposureRequestDigest(r) }) };
const readback = { verifyReadback: async (r) => ({ verified: true, request_sha256: workIntakeExposureRequestDigest(r) }) };
const exposure = (result) => ({ attempt_ref: eventAttempt(result).attempt_id, recipient_ref: 'synthetic:reviewer',
  destination_ref: 'synthetic:review-view', permission_ref: 'synthetic:current-read', observed_at: END });

test('durable result, core ledger and source cursor survive a new store and exact replay', async (t) => {
  const { open } = setup(t); let store = open(); const result = await syntheticResult();
  const first = store.commitResult(result); assert.equal(first.status, 'COMMITTED');
  assert.equal(first.receipt.cursor_status, 'ADVANCED'); store.close(); store = open();
  assert.equal(store.inspect().run_count, 1); assert.equal(store.inspect().decision_capsule.record_count, 1);
  assert.deepEqual(store.inspect().cursors.map((r) => r.cursor), ['cursor:1', 'cursor:1']);
  assert.equal(store.commitResult(result).status, 'REPLAY'); assert.equal(store.inspect().attempt_count, 3);
});

test('partial reads and judge failures remain in denominator and recover without advancing on failure', async (t) => {
  const { open } = setup(t); let store = open();
  const partial = syntheticInput('run:partial'); partial.source_reads[0].status = 'partial';
  const first = store.commitResult(await syntheticResult(partial));
  assert.equal(first.status, 'COMMITTED'); assert.equal(first.receipt.cursor_status, 'NOT_ADVANCED');
  assert.equal(store.inspect().cursors.length, 0); assert.ok(store.inspect().failed_attempts >= 1);
  store.close(); store = open();
  assert.equal(store.commitResult(await syntheticResult(syntheticInput('run:recovery'))).receipt.cursor_status, 'ADVANCED');
  assert.equal(store.inspect().run_count, 2); assert.equal(store.inspect().attempt_count, 6);
});

test('same run ID with changed source bytes conflicts; caller-forged results cannot be committed', async (t) => {
  const store = setup(t).open(); const result = await syntheticResult(); store.commitResult(result);
  assert.ok(store.commitResult(structuredClone(result)).hold_codes.includes('STORE_RESULT_INVALID'));
  const input = syntheticInput(); input.events[0].revision_sha256 = 'e'.repeat(64);
  assert.ok(store.commitResult(await syntheticResult(input)).hold_codes.includes('STORE_RUN_CONFLICT'));
  assert.equal(store.inspect().run_count, 1);
});

test('stale cursor CAS does not activate stale proposals or advance source state', async (t) => {
  const store = setup(t).open(); store.commitResult(await syntheticResult());
  const stale = syntheticInput('run:stale'); stale.events[0].event_ref = 'event:2';
  const result = await syntheticResult(stale, { task_semantic_sha256: 'e'.repeat(64) });
  const stored = store.commitResult(result);
  assert.equal(stored.receipt.cursor_status, 'CONFLICT'); assert.equal(stored.receipt.decision_status, 'HOLD');
  assert.equal(store.inspect().decision_capsule.record_count, 1);
  assert.ok((await store.reserveExposure(exposure(result), access)).hold_codes.includes('STORE_PROPOSAL_NOT_ACTIVE'));
});

test('SQL insert failure rolls back already-staged source cursor and leaves a recoverable store', async (t) => {
  const { directory, open } = setup(t); let store = open();
  const db = new DatabaseSync(path.join(directory, 'work-intake.synthetic.sqlite'));
  db.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON intake_runs BEGIN SELECT RAISE(ABORT,'synthetic_disk_failure'); END;"); db.close();
  const result = await syntheticResult(); assert.equal(store.commitResult(result).status, 'HOLD');
  store.close(); store = open(); assert.equal(store.inspect().run_count, 0); assert.equal(store.inspect().cursors.length, 0);
  const recovered = new DatabaseSync(path.join(directory, 'work-intake.synthetic.sqlite'));
  recovered.exec('DROP TRIGGER synthetic_fail'); recovered.close();
  assert.equal(store.commitResult(result).receipt.cursor_status, 'ADVANCED');
});

test('process exit with an uncommitted database transaction leaves no cursor after restart', async (t) => {
  const { directory, open } = setup(t); let store = open(); store.close();
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.argv[1]); db.exec(\"BEGIN IMMEDIATE; INSERT INTO intake_cursors VALUES ('gmail','scope:gmail','cursor:lost');\"); process.exit(23);",
    path.join(directory, 'work-intake.synthetic.sqlite')], { encoding: 'utf8' });
  assert.equal(child.status, 23); store = open(); assert.equal(store.inspect().cursors.length, 0);
  assert.equal(store.commitResult(await syntheticResult()).receipt.cursor_status, 'ADVANCED');
});

test('ACK unknown survives restart and requires exact verified readback before any retry', async (t) => {
  const { open } = setup(t); let store = open(); const result = await syntheticResult(); store.commitResult(result);
  const request = exposure(result); const reserved = await store.reserveExposure(request, access);
  assert.equal(reserved.status, 'RESERVED'); store.close(); store = open();
  assert.ok((await store.reserveExposure(request, access)).hold_codes.includes('EXPOSURE_ACK_UNKNOWN'));
  const reconcile = { exposure_key: reserved.exposure_key, reservation_ref: reserved.reservation_ref,
    state: 'NOT_DELIVERED', evidence_ref: 'synthetic:verified-absence', observed_at: END };
  assert.equal((await store.reconcileExposure(reconcile)).status, 'HOLD');
  assert.equal((await store.reconcileExposure(reconcile, readback)).status, 'RECORDED');
  const second = await store.reserveExposure(request, access); assert.equal(second.status, 'RESERVED');
  assert.notEqual(second.reservation_ref, reserved.reservation_ref);
  assert.ok((await store.reconcileExposure(reconcile, readback)).hold_codes.includes('STORE_RESERVATION_MISMATCH'));
  assert.equal((await store.reconcileExposure({ ...reconcile, reservation_ref: second.reservation_ref, state: 'ACKNOWLEDGED' }, readback)).status, 'RECORDED');
  assert.equal((await store.reserveExposure(request, access)).status, 'SUPPRESSED');
  assert.equal(store.inspect().external_effects, 0);
});

test('current denied/unavailable access and unbound readback cannot authorize exposure or retry', async (t) => {
  const store = setup(t).open(); const result = await syntheticResult(); store.commitResult(result);
  assert.equal((await store.reserveExposure(exposure(result), { checkAccess: async () => ({ allowed: true }) })).status, 'HOLD');
  assert.equal((await store.reserveExposure(exposure(result), { checkAccess: async () => { throw new Error('offline'); } })).status, 'HOLD');
  assert.equal(store.inspect().exposure_events.length, 0);
});

test('same candidate meaning from another source revision is not exposed twice', async (t) => {
  const store = setup(t).open(); const first = await syntheticResult(); store.commitResult(first);
  const reservation = await store.reserveExposure(exposure(first), access);
  await store.reconcileExposure({ ...reservation, state: 'ACKNOWLEDGED', evidence_ref: 'synthetic:ack', observed_at: END }, readback);
  const input = syntheticInput('run:revision2'); input.events[0].event_ref = 'event:another'; input.events[0].revision_sha256 = 'e'.repeat(64);
  for (const read of input.source_reads) read.cursor_before = read.cursor_after;
  const second = await syntheticResult(input); store.commitResult(second);
  assert.notEqual(eventAttempt(first).event_revision_sha256, eventAttempt(second).event_revision_sha256);
  assert.equal((await store.reserveExposure(exposure(second), access)).status, 'SUPPRESSED');
});

test('explicit correction supersedes prior proposal; missing correction target fails the whole decision group', async (t) => {
  const store = setup(t).open(); const first = await syntheticResult(); store.commitResult(first);
  const input = syntheticInput('run:correction');
  for (const read of input.source_reads) read.cursor_before = read.cursor_after;
  input.events[0].correction = { supersedes_cycle_ref: eventAttempt(first).shadow_cycle.cycle_id, category: 'EVIDENCE_CORRECTION' };
  const corrected = await syntheticResult(input, { classification: 'NO_ACTION', reason_code: 'NO_NEW_REQUEST', action_semantic_sha256: null });
  assert.equal(store.commitResult(corrected).receipt.decision_status, 'RECORDED');
  assert.equal(store.inspect().decision_capsule.active_proposals.length, 0);
  assert.equal((await store.reserveExposure(exposure(first), access)).status, 'HOLD');
  const missing = syntheticInput('run:missing'); missing.events[0].correction = { supersedes_cycle_ref: 'cycle:missing', category: 'EVIDENCE_CORRECTION' };
  const stored = store.commitResult(await syntheticResult(missing)); assert.equal(stored.receipt.decision_status, 'HOLD');
  assert.equal(stored.receipt.cursor_status, 'NOT_ADVANCED');
});

test('store rejects forbidden roots and altered persisted receipt; ephemeral facts never enter storage', async (t) => {
  const { directory, open } = setup(t); const store = open(); await store.commitResult(await syntheticResult());
  assert.equal(createWorkIntakeStore({ directory: repositoryRoot, repositoryRoot, project_ref: 'P01' }).status, 'HOLD');
  assert.equal(createWorkIntakeStore({ directory, repositoryRoot, project_ref: 'P02' }).status, 'HOLD');
  const db = new DatabaseSync(path.join(directory, 'work-intake.synthetic.sqlite'));
  const row = db.prepare('SELECT payload FROM intake_runs').get(); assert.equal(row.payload.includes('Synthetic request:'), false);
  db.exec('DROP TRIGGER intake_runs_no_update'); db.prepare('UPDATE intake_runs SET receipt=?').run('{}'); db.close();
  assert.ok(store.inspect().hold_codes.includes('STORE_INTEGRITY_FAILED'));
});

test('semantic HOLD can recover on the same raw revision after restart', async (t) => {
  const { open } = setup(t); let store = open();
  const first = await syntheticResult(syntheticInput('run:semantic-hold'), {
    classification: 'HOLD', reason_code: 'INSUFFICIENT_EVIDENCE', action_semantic_sha256: null,
  });
  assert.equal(store.commitResult(first).receipt.cursor_status, 'NOT_ADVANCED'); store.close(); store = open();
  const recovered = await syntheticResult(syntheticInput('run:recovered'));
  assert.equal(eventAttempt(first).event_revision_sha256, eventAttempt(recovered).event_revision_sha256);
  assert.equal(store.commitResult(recovered).receipt.cursor_status, 'ADVANCED');
  assert.equal((await store.reserveExposure(exposure(recovered), access)).status, 'RESERVED');
});

test('latest NO_ACTION without an explicit correction still fences exposure of an old proposal', async (t) => {
  const { open } = setup(t); let store = open(); const first = await syntheticResult(); store.commitResult(first);
  const next = syntheticInput('run:no-action'); for (const read of next.source_reads) read.cursor_before = read.cursor_after;
  const result = await syntheticResult(next, { classification: 'NO_ACTION', reason_code: 'NO_NEW_REQUEST', action_semantic_sha256: null });
  assert.equal(store.commitResult(result).receipt.cursor_status, 'ADVANCED'); store.close(); store = open();
  assert.ok((await store.reserveExposure(exposure(first), access)).hold_codes.includes('STORE_PROPOSAL_STALE'));
});

test('concurrent store instances cannot reserve the same exposure twice', async (t) => {
  const { open } = setup(t); const left = open(), right = open(); const result = await syntheticResult(); left.commitResult(result);
  const replies = await Promise.all([left.reserveExposure(exposure(result), access), right.reserveExposure(exposure(result), access)]);
  assert.equal(replies.filter((r) => r.status === 'RESERVED').length, 1);
  assert.equal(replies.filter((r) => r.hold_codes?.includes('EXPOSURE_ACK_UNKNOWN')).length, 1);
});

test('optional source failure preserves failed denominator without blocking independent required cursors', async (t) => {
  const store = setup(t).open(); const input = syntheticInput(); input.permission_refs.push('perm:slack');
  input.source_reads.push({ ...input.source_reads[0], source: 'slack', scope_ref: 'scope:slack',
    status: 'partial', permission_ref: 'perm:slack', evidence_refs: ['read:slack'] });
  const result = await syntheticResult(input); assert.equal(eventAttempt(result).classification, 'NEW');
  const saved = store.commitResult(result); assert.equal(saved.receipt.cursor_status, 'ADVANCED_PARTIAL');
  assert.deepEqual(store.inspect().cursors.map((r) => r.source), ['gmail', 'linear']);
  assert.equal(store.inspect().failed_attempts, 1);
});
