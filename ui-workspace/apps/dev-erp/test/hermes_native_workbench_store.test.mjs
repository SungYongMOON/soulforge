import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWorkbenchExecutionStore } from '../src/workbench_execution_store.mjs';

const sha = (digit) => `sha256:${digit.repeat(64)}`;
test('native response metadata survives reopening, has no candidate, and never reinterprets a synthetic ledger', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-workbench-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createWorkbenchExecutionStore({ root, mode: 'native_chat' });
  const input = { claim_key: sha('1'), basis_digest: sha('2'), request_id: `w_${'a'.repeat(32)}`,
    requester: 'member.0123456789abcdef', project_code: 'KVDS', revision_no: 1, revision_of: null,
    agent_id: 'agent.native', binding_digest: sha('3'), authority_epoch: 1,
    deadline_at: new Date(Date.now() + 60_000).toISOString(), instance_ref: 'instance.native' };
  const claimed = store.claim(input);
  const receipt = { response_observed: true, local_candidate_stored: false, official_task_done: false,
    acceptance_authority: false };
  assert.throws(() => store.settle({ ...claimed.run, state: 'succeeded', reason_code: null,
    candidate_bytes: Buffer.from('A model answer is not custody'), receipt }), /NATIVE_CUSTODY_NOT_ESTABLISHED/u);
  const settled = store.settle({ ...claimed.run, state: 'response_observed', reason_code: null, receipt });
  assert.equal(settled.run.observed_state, 'response_observed');
  assert.equal(settled.run.execution_mode, 'native_chat');
  assert.equal(settled.run.candidate_present, false);
  store.close();
  const reopened = createWorkbenchExecutionStore({ root, mode: 'native_chat' });
  assert.equal(reopened.read(input.request_id, 'new-instance').observed_state, 'response_observed');
  assert.equal(reopened.candidate(input.request_id, 'new-instance'), null);
  reopened.close();
  const before = await readFile(path.join(root, 'execution.sqlite'));
  assert.throws(() => createWorkbenchExecutionStore({ root }), /EXECUTION_FORMAT_INVALID/u);
  assert.deepEqual(await readFile(path.join(root, 'execution.sqlite')), before);
});
