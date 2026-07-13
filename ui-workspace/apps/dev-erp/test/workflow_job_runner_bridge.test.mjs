import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkflowJobRunnerBridge } from '../src/workflow_job_runner_bridge.mjs';

test('bridge imports one fixed shared runner export and forwards the pinned digest', async () => {
  let imported;
  let call;
  const bridge = new WorkflowJobRunnerBridge({
    async moduleLoader(specifier) {
      imported = specifier;
      return {
        validateWorkflowJobOutcome(value) { return value; },
        validateWorkflowJobRequest(value) { return value; },
        validateWorkflowJobResult(value) { return value; },
        validateWorkflowReceipt(value) { return value; },
        async runWorkflowJob(request, adapters, options) {
          call = { request, adapters, options };
          return { schema: 'soulforge.workflow_job_outcome.v1', state: { status: 'blocked' } };
        },
      };
    },
  });
  const request = { workflow_id: 'report_authoring_v0' };
  const adapters = { fixed: true };
  const digest = 'a'.repeat(64);
  const outcome = await bridge.execute({ request, adapters, expectedBundleDigest: digest });
  assert.equal(imported, '../../../../guild_hall/workflow_runner/index.mjs');
  assert.deepEqual(call, { request, adapters, options: { expectedBundleDigest: digest } });
  assert.equal(outcome.state.status, 'blocked');
});

test('bridge has no alternate runner or chat fallback when the fixed import is absent', async () => {
  let imports = 0;
  const bridge = new WorkflowJobRunnerBridge({
    async moduleLoader() {
      imports += 1;
      throw new Error('fixed runner missing');
    },
  });
  const capability = await bridge.capability();
  assert.equal(capability.available, false);
  assert.equal(imports, 1);
  await assert.rejects(bridge.execute({
    request: { workflow_id: 'report_authoring_v0' },
    adapters: {},
    expectedBundleDigest: 'b'.repeat(64),
  }));
  assert.equal(imports, 2);
});
