import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createFeedbackRuntimeModel } from './feedback_runtime_model.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
const patch = 'diff --git a/src/value.mjs b/src/value.mjs\n--- a/src/value.mjs\n+++ b/src/value.mjs\n@@ -1 +1 @@\n-export const answer = 1;\n+export const answer = 2;\n';
const packet = () => ({ schema_version: 'soulforge.dev_worker_request.v0', task_id: 'synthetic.fix',
  summary: 'Synthetic fixture changes answer to two', allowed_write_paths: ['src/value.mjs'], acceptance_checks: ['check.answer'] });
const source = () => {
  const content = 'export const answer = 1;\n';
  return { path: 'src/value.mjs', base_commit: 'a'.repeat(40), blob_oid: 'b'.repeat(40),
    source_ref: 'git-blob.' + 'b'.repeat(40), sha256: sha(content), bytes: Buffer.byteLength(content), content };
};
const context = () => ({ run_ref: 'synthetic.run.' + Math.random().toString(16).slice(2),
  deadline_at: new Date(Date.now() + 30_000).toISOString(), signal: new AbortController().signal });
const refs = sources => sources.map(({ content, ...ref }) => ref);
const validationEvidence = () => [{ check_id: 'check.answer', capture_ref: 'capture.synthetic',
  stdout: 'Synthetic validator confirmed answer = 2\n', stderr: '',
  stdout_sha256: sha('Synthetic validator confirmed answer = 2\n'), stderr_sha256: sha(''), exit_code: 0 }];

async function fixture(t, { handler, ...overrides } = {}) {
  const calls = [], evidence = [], requests = [], authorities = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), prompt = JSON.parse(body.prompt);
    calls.push({ body, prompt, headers: req.headers, url: req.url });
    const visible = prompt.operation === 'propose' ? { binding: prompt.binding, patch }
      : { binding: prompt.binding, status: 'ACCEPT', summary: 'Synthetic review only' };
    if (handler) { await handler({ req, res, body, prompt, visible }); return; }
    res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(visible),
      thinking: 'hidden-fixture-must-not-escape', context: [12345] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const config = { enabled: true, purpose: 'synthetic_harness', endpoint: `http://127.0.0.1:${server.address().port}`, model: 'synthetic-fixture:1',
    leaderRef: 'g2.synthetic', authorRef: 'g1.author', patchReviewerRef: 'g1.patch-reviewer', finalReviewerRef: 'g1.final-reviewer',
    authorize: async (stage, binding) => { authorities.push({ stage, binding }); return true; },
    onRequest: async envelope => { requests.push(envelope); },
    loadValidationEvidence: async () => validationEvidence(),
    onExchange: async exchange => { evidence.push(exchange); }, ...overrides };
  const client = createFeedbackRuntimeModel(config);
  return { config, client, calls, evidence, requests, authorities, p: packet(), sources: [source()], ctx: context() };
}

async function propose(f) {
  return f.client.proposePatch({ packet: f.p, sources: f.sources, author_ref: f.config.authorRef, context: f.ctx });
}
async function inspect(f, proposed) {
  return f.client.inspectPatch({ packet: f.p, source_refs: refs(f.sources), patch: proposed.patch,
    patch_sha256: sha(proposed.patch), author_ref: f.config.authorRef, context: f.ctx });
}

test('temporary fake HTTP exercises three separate stateless calls and exact evidence pins', async t => {
  const f = await fixture(t);
  // Unselected fields never enter the model, including final local paths.
  f.p.extra_body = 'private-fixture-excluded';
  const proposed = await propose(f), inspected = await inspect(f, proposed);
  const candidate = { candidate_ref: 'candidate.synthetic', packet_sha256: digest(f.p), patch_sha256: sha(patch),
    patch_review_ref: inspected.review_ref, worktree_path: 'private-fixture-excluded' };
  const validation = { status: 'PASS', validation_ref: 'validation.synthetic',
    checks: [{ check_id: 'check.answer', passed: true, log_ref: 'log.synthetic' }] };
  const reviewed = await f.client.review(candidate, validation, f.p, f.ctx);
  assert.deepEqual(f.authorities.map(item => item.stage), ['propose', 'propose', 'patch-review', 'patch-review', 'final-review', 'final-review']);
  assert.deepEqual(f.calls.map(item => item.prompt.binding.actor_ref), ['g1.author', 'g1.patch-reviewer', 'g1.final-reviewer']);
  assert.equal(f.calls.length, 3); assert.equal(f.evidence.length, 3);
  assert.equal(f.requests.length, 3);
  for (const [index, envelope] of f.requests.entries()) {
    assert.equal(envelope.request_ref, f.evidence[index].request_ref);
    assert.equal(envelope.request_ref, f.evidence[index].model_receipt.request_ref);
    assert.equal(envelope.request_sha256, digest(envelope.request));
    assert.deepEqual(envelope.request, f.calls[index].body);
    assert.ok(Object.isFrozen(envelope)); assert.ok(Object.isFrozen(envelope.request));
  }
  for (const call of f.calls) {
    assert.equal(call.url, '/api/generate'); assert.equal(call.body.stream, false); assert.equal(call.body.format, 'json');
    assert.equal(call.body.model, f.config.model); assert.equal(call.headers.authorization, undefined);
    assert.equal(call.body.context, undefined); assert.equal(call.body.keep_alive, undefined);
    assert.equal(JSON.stringify(call).includes('private-fixture-excluded'), false);
  }
  assert.equal(JSON.stringify(f.evidence).includes('hidden-fixture-must-not-escape'), false);
  assert.equal(f.evidence[0].model_receipt.request_sha256, digest(f.calls[0].body));
  assert.equal(reviewed.validation_sha256, digest(validation)); assert.equal(reviewed.candidate_sha256, digest(candidate));
  assert.equal(reviewed.validation_evidence_sha256, digest(validationEvidence()));
  assert.equal(f.authorities[4].binding.validation_evidence_sha256, digest(validationEvidence()));
  assert.deepEqual(f.calls[2].prompt.data.validation.evidence, validationEvidence());
  assert.equal(reviewed.validation_evidence_refs[0].log_ref, validation.checks[0].log_ref);
  assert.equal(reviewed.canonical_accepted, false); assert.equal(reviewed.official_done, false);
  assert.equal(inspected.patch_sha256, sha(patch));
  assert.equal(f.calls[1].prompt.data.sources[0].content, f.sources[0].content);
  assert.equal(f.calls[2].prompt.data.patch, patch);
  f.client.clearRun(f.ctx.run_ref); assert.equal(f.client.state().retained_runs, 0);
});

test('disabled/missing authority, alias reviewer and non-loopback endpoints are rejected before HTTP', async t => {
  const f = await fixture(t);
  for (const change of [{ purpose: undefined }, { purpose: 'production' }, { enabled: false }, { authorize: undefined }, { onRequest: undefined }, { onExchange: undefined }, { model: '' },
    { leaderRef: undefined }, { patchReviewerRef: f.config.authorRef }, { finalReviewerRef: f.config.authorRef },
    ...['https://127.0.0.1', 'http://192.0.2.1', 'http://example.invalid', 'http://user:pass@127.0.0.1',
      'http://127.0.0.1/?x=1', 'http://127.0.0.1/#x', 'http://127.0.0.1/api/chat'].map(endpoint => ({ endpoint }))]) {
    assert.throws(() => createFeedbackRuntimeModel({ ...f.config, ...change }));
  }
  assert.equal(f.calls.length, 0);
});

test('authorization is current for each request; revocation prevents patch reviewer dispatch', async t => {
  let allowed = true;
  const f = await fixture(t, { authorize: async () => allowed });
  const proposed = await propose(f); allowed = false;
  await assert.rejects(inspect(f, proposed), { feedbackCode: 'FEEDBACK_MODEL_INPUT_DENIED' });
  assert.equal(f.calls.length, 1);
});

test('shared gate across clients queues calls and rechecks authorization after waiting', async t => {
  let active = 0, maxActive = 0, allowedSecond = true;
  const f = await fixture(t, { handler: async ({ res, body, visible }) => {
    active++; maxActive = Math.max(active, maxActive);
    await new Promise(resolve => setTimeout(resolve, 20)); allowedSecond = false;
    active--; res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(visible) }));
  } });
  const second = createFeedbackRuntimeModel({ ...f.config, authorize: async () => allowedSecond });
  const outputs = await Promise.allSettled([propose(f), second.proposePatch({ packet: f.p, sources: f.sources,
    author_ref: f.config.authorRef, context: context() })]);
  assert.equal(outputs[0].status, 'fulfilled'); assert.equal(outputs[1].reason.feedbackCode, 'FEEDBACK_MODEL_INPUT_DENIED');
  assert.equal(maxActive, 1); assert.equal(f.calls.length, 1);
});

test('digest mutation, wrong source content and replay never trigger another request', async t => {
  const f = await fixture(t), bad = source(); bad.content += 'drift';
  await assert.rejects(f.client.proposePatch({ packet: f.p, sources: [bad], author_ref: f.config.authorRef, context: f.ctx }));
  assert.equal(f.calls.length, 0);
  const proposed = await propose(f);
  await assert.rejects(propose(f));
  f.p.summary += 'drift'; await assert.rejects(inspect(f, proposed));
  assert.equal(f.calls.length, 1);
});

test('two authorized model instances still never overlap HTTP requests', async t => {
  let active = 0, maxActive = 0;
  const f = await fixture(t, { handler: async ({ res, body, visible }) => {
    active++; maxActive = Math.max(active, maxActive);
    await new Promise(resolve => setTimeout(resolve, 15));
    active--; res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(visible) }));
  } });
  const second = createFeedbackRuntimeModel(f.config);
  await Promise.all([propose(f), second.proposePatch({ packet: f.p, sources: f.sources,
    author_ref: f.config.authorRef, context: context() })]);
  assert.equal(f.calls.length, 2); assert.equal(maxActive, 1);
});

test('review refusal remains advisory and final evidence drift is rejected before dispatch', async t => {
  const refusal = await fixture(t, { handler: async ({ res, body, prompt, visible }) => {
    if (prompt.operation === 'patch-review') visible.status = 'REJECT';
    res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(visible) }));
  } });
  const rejected = await inspect(refusal, await propose(refusal));
  assert.equal(rejected.status, 'REJECT'); assert.equal(rejected.canonical_accepted, false);
  refusal.client.clearRun(refusal.ctx.run_ref);
  const f = await fixture(t), reviewed = await inspect(f, await propose(f));
  const candidate = { candidate_ref: 'candidate.synthetic', packet_sha256: digest(f.p), patch_sha256: '0'.repeat(64),
    patch_review_ref: reviewed.review_ref };
  const validation = { status: 'PASS', validation_ref: 'validation.synthetic',
    checks: [{ check_id: 'check.answer', passed: true, log_ref: 'log.synthetic' }] };
  await assert.rejects(f.client.review(candidate, validation, f.p, f.ctx), { feedbackCode: 'FEEDBACK_MODEL_RUN_INVALID' });
  assert.equal(f.calls.length, 2);
});

test('strict visible JSON and echo bindings reject injected fields, hidden-only output, and forged verdicts', async t => {
  for (const transform of [v => ({ ...v, commands: ['do-not-run'] }), v => ({ ...v, binding: { ...v.binding, packet_sha256: '0'.repeat(64) } }),
    () => '```json\n{}\n```', () => null]) {
    const f = await fixture(t, { handler: async ({ res, body, visible }) => {
      res.end(JSON.stringify({ model: body.model, done: true, response: JSON.stringify(transform(visible)) }));
    } });
    await assert.rejects(propose(f)); assert.equal(f.evidence.length, 0);
  }
  const f = await fixture(t, { handler: async ({ res, body }) => res.end(JSON.stringify({ model: body.model, done: true, thinking: JSON.stringify({ patch }) })) });
  await assert.rejects(propose(f), { feedbackCode: 'FEEDBACK_MODEL_RESPONSE_INVALID' });
});

test('final review requires bound full validator output; missing, altered or extra capture data prevents HTTP', async t => {
  for (const port of [undefined, async () => [], async () => validationEvidence().map(capture => ({ ...capture, stdout: 'altered' })),
    async () => validationEvidence().map(capture => ({ ...capture, check_id: 'check.other' })),
    async () => validationEvidence().map(capture => ({ ...capture, exit_code: 1 })),
    async () => validationEvidence().map(capture => ({ ...capture, raw_body: 'excluded' })),
    async () => validationEvidence().map(capture => ({ ...capture, capture_ref: 'capture.other' }))]) {
    const f = await fixture(t, { loadValidationEvidence: port }), inspected = await inspect(f, await propose(f));
    const candidate = { candidate_ref: 'candidate.synthetic', packet_sha256: digest(f.p), patch_sha256: sha(patch),
      patch_review_ref: inspected.review_ref };
    const validation = { status: 'PASS', validation_ref: 'validation.synthetic', checks: [{ check_id: 'check.answer',
      passed: true, log_ref: 'log.synthetic', capture_ref: 'capture.synthetic',
      stdout_sha256: validationEvidence()[0].stdout_sha256, stderr_sha256: sha('') }] };
    await assert.rejects(f.client.review(candidate, validation, f.p, f.ctx), {
      feedbackCode: port ? 'FEEDBACK_MODEL_VALIDATION_EVIDENCE_INVALID' : 'FEEDBACK_MODEL_VALIDATION_EVIDENCE_REQUIRED',
    });
    assert.equal(f.calls.length, 2); assert.equal(f.evidence.length, 2);
  }
});

test('HTTP failures/redirects, response cap, timeout and abort fail closed', async t => {
  for (const status of [302, 500]) {
    const f = await fixture(t, { handler: async ({ res }) => { res.writeHead(status, { location: 'http://192.0.2.1' }); res.end('not-exposed'); } });
    await assert.rejects(propose(f), { feedbackCode: 'FEEDBACK_MODEL_HTTP_FAILED' }); assert.equal(f.calls.length, 1);
  }
  const overflow = await fixture(t, { maxBytes: 8000, handler: async ({ res }) => res.end('x'.repeat(9000)) });
  await assert.rejects(propose(overflow), { feedbackCode: 'FEEDBACK_MODEL_OUTPUT_LIMIT' });
  const timeout = await fixture(t, { timeoutMs: 10, handler: async () => {} });
  await assert.rejects(propose(timeout), { feedbackCode: 'FEEDBACK_MODEL_TIMEOUT' });
  assert.equal(timeout.requests.length, 1); assert.equal(timeout.evidence.length, 0);
  assert.equal(JSON.parse(timeout.requests[0].request.prompt).data.sources[0].content, source().content);
  const aborted = await fixture(t), ctl = new AbortController(); ctl.abort(); aborted.ctx.signal = ctl.signal;
  await assert.rejects(propose(aborted), { feedbackCode: 'FEEDBACK_MODEL_INTERRUPTED' }); assert.equal(aborted.calls.length, 0);
  const mid = await fixture(t, { handler: async () => {} }), midCtl = new AbortController(); mid.ctx.signal = midCtl.signal;
  const running = propose(mid); setTimeout(() => midCtl.abort(), 20);
  await assert.rejects(running, { feedbackCode: 'FEEDBACK_MODEL_INTERRUPTED' });
});

test('evidence failure after dispatch is unknown and cannot silently retry the same run', async t => {
  const f = await fixture(t, { onExchange: async () => { throw new Error('synthetic persistence failure'); } });
  await assert.rejects(propose(f), { feedbackCode: 'FEEDBACK_MODEL_EVIDENCE_UNKNOWN' });
  await assert.rejects(propose(f), { feedbackCode: 'FEEDBACK_MODEL_RUN_INVALID' });
  assert.equal(f.calls.length, 1);
});

test('request persistence precedes model dispatch and persistence failure or authority revocation prevents it', async t => {
  const failed = await fixture(t, { onRequest: async () => { throw new Error('synthetic write failure'); } });
  await assert.rejects(propose(failed), { feedbackCode: 'FEEDBACK_MODEL_REQUEST_EVIDENCE_FAILED' });
  assert.equal(failed.calls.length, 0); assert.equal(failed.evidence.length, 0);
  let allowed = true; const retained = [];
  const revoked = await fixture(t, { authorize: async () => allowed,
    onRequest: async envelope => { retained.push(envelope); allowed = false; } });
  await assert.rejects(propose(revoked), { feedbackCode: 'FEEDBACK_MODEL_INPUT_DENIED' });
  assert.equal(retained.length, 1); assert.equal(revoked.calls.length, 0);
  const denied = await fixture(t, { authorize: async () => false });
  await assert.rejects(propose(denied), { feedbackCode: 'FEEDBACK_MODEL_INPUT_DENIED' });
  assert.equal(denied.requests.length, 0); assert.equal(denied.calls.length, 0);
});
