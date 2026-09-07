import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeWorkbenchExecutionFixture } from './helpers/workbench_execution_fixture.mjs';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';
import { createWorkbenchExecutionService } from '../src/workbench_execution_service.mjs';

async function context(t, options) {
  const fixture = await makeWorkbenchExecutionFixture(options);
  const store = createWorkbenchExecutionStore({ root: fixture.executionRoot });
  const service = createWorkbenchExecutionService({ enabled: true, intakeStore: fixture.intakeStore, intakeSources: fixture.intakeSources,
    executionSources: fixture.executionSources, executionStore: store });
  t.after(async () => { await service.close(); await rm(fixture.root, { recursive: true, force: true }); });
  return { ...fixture, store, service };
}

async function terminal(fixture, requestId = fixture.record.request_id) {
  let state;
  for (let i = 0; i < 80; i++) {
    state = await fixture.service.status(requestId, fixture.access);
    // An expired read projects HOLD before the timer commits terminal state.
    // Wait for the durable transition; the projection is not a settled run.
    if (state.execution_state !== 'running'
      && fixture.store.read(requestId, 'test-terminal-reader')?.state !== 'running') return state;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Synthetic run did not settle: ${JSON.stringify(state)}`);
}
async function workerStarted(fixture) {
  for (let i = 0; i < 30; i++) {
    const state = await fixture.service.status(fixture.record.request_id, fixture.access);
    if (state.execution_started) return;
    assert.equal(state.execution_state, 'running');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Synthetic worker did not start');
}
async function revision(fixture) {
  const request = { ...fixture.record.request, idempotency_key: `${fixture.record.request.idempotency_key}.retry2`,
    revision_of: fixture.record.request_id, revision_no: 2 };
  const result = await fixture.intakeStore.record(request, { trusted_evidence: await fixture.intakeSources.evidence({ ...fixture.access, request }),
    request_id: `w_${'b'.repeat(32)}`, created_at: new Date().toISOString() });
  assert.equal(result.status, 'RECORDED'); return result.record;
}

test('real CEC admission and fixed worker produce a durable synthetic candidate, never Official Done or remote ACK', async t => {
  const fixture = await context(t);
  const result = await fixture.service.start(fixture.record.request_id, fixture.access);
  assert.equal(result.status, 'EXECUTION_RECORDED');
  assert.equal(result.execution_started, false);
  let settled;
  for (let i = 0; i < 80; i++) {
    settled = await fixture.service.status(fixture.record.request_id, fixture.access);
    if (settled.execution_state !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(settled.execution_state, 'succeeded', JSON.stringify(settled));
  assert.equal(settled.local_candidate_stored, true);
  assert.equal(settled.remote_submission_ack, false);
  assert.equal(settled.official_task_done, false);
  const candidate = await fixture.service.candidate(fixture.record.request_id, fixture.access);
  assert.match(candidate.bytes.toString(), /500500/u);
  assert.match(candidate.bytes.toString(), /합성 실행 검증 후보/u);
  assert.equal((await fixture.service.start(fixture.record.request_id, fixture.access)).replayed, true);
});

test('cancel fences the real worker; an explicitly recorded subsequent revision can run successfully', async t => {
  const fixture = await context(t, { delayMs: 1000, timeoutMs: 3000 });
  await fixture.service.start(fixture.record.request_id, fixture.access);
  await workerStarted(fixture);
  const cancelled = await fixture.service.cancel(fixture.record.request_id, fixture.access);
  assert.equal(cancelled.execution_state, 'cancelled');
  assert.equal(cancelled.local_candidate_stored, false);
  const next = await revision(fixture);
  const retry = await fixture.service.start(next.request_id, fixture.access);
  assert.equal(retry.attempt_no, 2); assert.equal(retry.fencing_epoch, 2);
  const result = await terminal(fixture, next.request_id);
  assert.equal(result.execution_state, 'succeeded'); assert.equal(result.local_candidate_stored, true);
  assert.equal((await fixture.service.status(fixture.record.request_id, fixture.access)).execution_state, 'cancelled');
});

test('real worker timeout leaves durable HOLD and no candidate', async t => {
  const fixture = await context(t, { delayMs: 3000, timeoutMs: 1500 });
  await fixture.service.start(fixture.record.request_id, fixture.access);
  const result = await terminal(fixture);
  assert.equal(result.execution_state, 'hold'); assert.equal(result.local_candidate_stored, false);
  assert.equal(result.execution_started, true);
  assert.ok(['RUN_DEADLINE_EXPIRED', 'EXECUTION_TIMEOUT'].includes(result.hold_code), JSON.stringify(result));
});

test('authority revoked while the worker runs prevents final candidate publication', async t => {
  const fixture = await context(t, { delayMs: 800, timeoutMs: 2500 });
  await fixture.service.start(fixture.record.request_id, fixture.access);
  await workerStarted(fixture);
  fixture.documents.authority_current.revoked_pin_refs = ['pin.synthetic.agent'];
  await writeFile(join(fixture.sourceRoot, 'execution-authority_current.json'), JSON.stringify(fixture.documents.authority_current));
  const result = await terminal(fixture);
  assert.equal(result.execution_state, 'hold'); assert.equal(result.local_candidate_stored, false);
  assert.equal(result.hold_code, 'SOURCE_DIGEST_MISMATCH');
  assert.equal(result.execution_started, true);
});

test('session revocation prevents worker start and separate executor approval is mandatory', async t => {
  const fixture = await context(t);
  await assert.rejects(fixture.service.start(fixture.record.request_id, { ...fixture.access, checkSession: async () => false }), { workbenchCode: 'AUTH_REQUIRED' });
  assert.equal(fixture.store.read(fixture.record.request_id, 'test'), null);
  const disabled = createWorkbenchExecutionService({ enabled: false, intakeStore: fixture.intakeStore, intakeSources: fixture.intakeSources });
  await assert.rejects(disabled.start(fixture.record.request_id, fixture.access), { workbenchCode: 'SYNTHETIC_EXECUTION_DISABLED' });
  let current = true;
  await fixture.service.start(fixture.record.request_id, { ...fixture.access, checkSession: async () => current });
  current = false;
  const held = await terminal(fixture);
  assert.equal(held.execution_state, 'hold'); assert.equal(held.execution_started, false); assert.equal(held.hold_code, 'AUTH_REQUIRED');
});

test('shutdown holds active work and restart replays it without calling another worker', async t => {
  const fixture = await context(t, { delayMs: 1500, timeoutMs: 3000 });
  await fixture.service.start(fixture.record.request_id, fixture.access);
  await fixture.service.close();
  const restartedStore = createWorkbenchExecutionStore({ root: fixture.executionRoot });
  const restarted = createWorkbenchExecutionService({ enabled: true, intakeStore: fixture.intakeStore, intakeSources: fixture.intakeSources,
    executionSources: fixture.executionSources, executionStore: restartedStore });
  t.after(() => restarted.close());
  const result = await restarted.start(fixture.record.request_id, fixture.access);
  assert.equal(result.replayed, true); assert.equal(result.execution_state, 'hold');
  assert.equal(result.hold_code, 'SERVER_SHUTDOWN'); assert.equal(result.local_candidate_stored, false);
  await restarted.close();
});

test('prevalidated-looking packets cannot bypass task, role, capability, epoch, code or current Todo checks', async t => {
  const mutations = [
    f => { f.documents.task_authorization.state = 'revoked'; },
    f => { f.documents.authority_current.current_authority_epoch = 8; },
    f => { f.documents.executor_current.current_assignment_epoch = 12; },
    f => { f.documents.executor_binding.executor_ref = 'executor.hermes'; },
    f => { f.documents.roles.roles[0].status = 'inactive'; },
    f => { f.documents.capabilities.actor_bindings[0].capability_refs = []; },
    f => { f.documents.packet.forge_issued_work_brief.problem = 'Different unapproved synthetic brief'; },
    f => { f.documents.packet.linear_official_task_read_evidence.task_status = 'InProgress'; },
    f => { f.approval.executor_code_sha256 = `sha256:${'0'.repeat(64)}`; },
    f => { f.executionBinding.mode = 'real'; },
  ];
  for (const mutate of mutations) {
    const fixture = await makeWorkbenchExecutionFixture();
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    mutate(fixture); await fixture.repinExecution();
    await assert.rejects(fixture.sources().authorize({ record: fixture.record, requester: fixture.requester, canAccessProject: async () => true }),
      error => typeof error.workbenchCode === 'string');
    assert.deepEqual(await readdir(fixture.executionRoot), []);
  }
});

test('status never downgrades session or project access loss during authorization into readable metadata', async t => {
  for (const loss of ['session', 'project']) {
    const fixture = await context(t);
    let allowed = true;
    const access = { requester: fixture.requester, checkSession: async () => loss !== 'session' || allowed,
      canAccessProject: async () => loss !== 'project' || allowed };
    const boundary = createWorkbenchExecutionService({ enabled: true, intakeStore: fixture.intakeStore, intakeSources: fixture.intakeSources,
      executionStore: fixture.store, executionSources: { authorize: async input => {
        const result = await fixture.executionSources.authorize(input); allowed = false; return result;
      } } });
    await assert.rejects(boundary.status(fixture.record.request_id, access), { workbenchCode: 'AUTH_REQUIRED' });
  }
});
