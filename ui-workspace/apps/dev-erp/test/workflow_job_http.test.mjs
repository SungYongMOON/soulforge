import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createWorkflowJobHttpController } from '../src/workflow_job_http.mjs';

function request({ method = 'GET', headers = {}, body = Buffer.alloc(0) } = {}) {
  const req = Readable.from(body.byteLength ? [body] : []);
  req.method = method;
  req.headers = headers;
  return req;
}

function response() {
  return {
    status: null,
    headers: null,
    chunks: [],
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(chunk) {
      if (chunk) this.chunks.push(Buffer.from(chunk));
    },
    json() {
      return JSON.parse(Buffer.concat(this.chunks).toString('utf8'));
    },
  };
}

function service(overrides = {}) {
  return {
    async createInput(value) { return { input_handle: 'wfi_test', observed: value }; },
    async createJob(value) { return { job_id: 'wfj_test', replayed: false, observed: value }; },
    async listJobs(value) { return { jobs: [], next_offset: null, observed: value }; },
    async getJob(value) { return { job_id: value.jobId }; },
    async result(value) { return { job_id: value.jobId, artifact_refs: [] }; },
    async cancel(value) { return { job_id: value.jobId, status: 'cancelled' }; },
    async resumeReceipt(value) { return { job_id: value.jobId, operation: 'resume_receipt' }; },
    async readArtifact() { return { media_type: 'text/markdown; charset=utf-8', bytes: Buffer.from('# report'), filename: 'report.md' }; },
    ...overrides,
  };
}

function controller({ enabled = true, serviceOverride = {} } = {}) {
  return createWorkflowJobHttpController({
    service: service(serviceOverride),
    getCapability: async () => ({
      schema: 'dev_erp.report_workflow_capability.v1',
      workflow_id: 'report_authoring_v0',
      enabled,
      blockers: enabled ? [] : ['route_flag_disabled'],
    }),
    resolvePrincipal: async () => ({ accountId: 'acct_test' }),
    canAccessProject: async () => true,
  });
}

test('capability is readable while the candidate route remains off', async () => {
  const res = response();
  const handled = await controller({ enabled: false })(
    request(),
    res,
    new URL('http://localhost/api/workflow-jobs/capabilities'),
  );
  assert.equal(handled, true);
  assert.equal(res.status, 200);
  assert.equal(res.json().enabled, false);
});

test('disabled capability fails closed before accepting an input body', async () => {
  let called = false;
  const res = response();
  await controller({
    enabled: false,
    serviceOverride: { async createInput() { called = true; } },
  })(
    request({ method: 'POST', headers: { 'content-type': 'text/markdown' }, body: Buffer.from('secret body') }),
    res,
    new URL('http://localhost/api/workflow-inputs?project_code=P00-000_INBOX&role=source'),
  );
  assert.equal(res.status, 503);
  assert.equal(called, false);
});

test('raw input rejects compression and a declared byte overrun', async () => {
  for (const headers of [
    { 'content-type': 'text/markdown', 'content-encoding': 'gzip' },
    { 'content-type': 'text/markdown', 'content-length': '393217' },
  ]) {
    const res = response();
    await controller()(
      request({ method: 'POST', headers, body: Buffer.from('x') }),
      res,
      new URL('http://localhost/api/workflow-inputs?project_code=P00-000_INBOX&role=source'),
    );
    assert.ok([413, 415].includes(res.status));
  }
});

test('raw input accepts the exact aggregate boundary without JSON or base64 expansion', async () => {
  const body = Buffer.alloc(393_216, 0x61);
  let observed;
  const res = response();
  await controller({
    serviceOverride: { async createInput(value) { observed = value; return { input_handle: 'wfi_test' }; } },
  })(
    request({
      method: 'POST',
      headers: { 'content-type': 'text/markdown', 'content-length': String(body.byteLength) },
      body,
    }),
    res,
    new URL('http://localhost/api/workflow-inputs?project_code=P00-000_INBOX&role=source'),
  );
  assert.equal(res.status, 201);
  assert.equal(observed.bytes.byteLength, 393_216);
  assert.equal(observed.bytes.equals(body), true);
});

test('create forwards one fixed JSON request and the idempotency header', async () => {
  const body = Buffer.from(JSON.stringify({
    schema: 'dev_erp.workflow_job_create.v1',
    project_code: 'P00-000_INBOX',
    mode: 'full_authoring',
    report_type: 'analysis',
    audience: 'internal_review',
    input_handles: ['wfi_test'],
  }));
  let observed;
  const res = response();
  await controller({
    serviceOverride: { async createJob(value) { observed = value; return { job_id: 'wfj_test', replayed: false }; } },
  })(
    request({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.byteLength),
        'idempotency-key': 'wfi_' + '7'.repeat(32),
      },
      body,
    }),
    res,
    new URL('http://localhost/api/workflow-jobs'),
  );
  assert.equal(res.status, 202);
  assert.equal(observed.idempotencyKey, 'wfi_' + '7'.repeat(32));
  assert.deepEqual(Object.keys(observed.request).sort(), [
    'audience',
    'input_handles',
    'mode',
    'project_code',
    'report_type',
    'schema',
  ]);
});

test('HTTP rejects non-UTF-8 JSON charset and malformed UTF-8 before calling the service', async () => {
  for (const [contentType, body] of [
    ['application/json; charset=windows-1252', Buffer.from('{}')],
    ['application/json; charset=utf-8', Buffer.from([0xc3, 0x28])],
  ]) {
    let called = false;
    const res = response();
    await controller({ serviceOverride: { async createJob() { called = true; } } })(
      request({ method: 'POST', headers: { 'content-type': contentType, 'idempotency-key': 'wfi_' + '8'.repeat(32) }, body }),
      res,
      new URL('http://localhost/api/workflow-jobs'),
    );
    assert.ok([400, 415].includes(res.status));
    assert.equal(called, false);
  }
});

test('artifact body is streamed only through an ACL-checked service lookup', async () => {
  let observed;
  const res = response();
  await controller({
    serviceOverride: { async readArtifact(value) { observed = value; return { media_type: 'text/markdown; charset=utf-8', bytes: Buffer.from('# report'), filename: 'report.md' }; } },
  })(
    request(),
    res,
    new URL('http://localhost/api/workflow-jobs/wfj_test/artifacts/final_report_md?project_code=P00-000_INBOX'),
  );
  assert.equal(res.status, 200);
  assert.equal(observed.accountId, 'acct_test');
  assert.equal(observed.jobId, 'wfj_test');
  assert.equal(observed.projectCode, 'P00-000_INBOX');
  assert.equal(observed.role, 'final_report_md');
  assert.equal(Buffer.concat(res.chunks).toString('utf8'), '# report');
});
