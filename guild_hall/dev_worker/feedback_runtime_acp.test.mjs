import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fixture as nativeAcpFixture } from '../tool_workshop/tests/claude_acp_fixture.mjs';
import { createFeedbackRuntimeAcp, createFeedbackRuntimeAcpTestHarness } from './feedback_runtime_acp.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha(JSON.stringify(value));
const patch = 'diff --git a/src/a.mjs b/src/a.mjs\n--- a/src/a.mjs\n+++ b/src/a.mjs\n@@ -1 +1 @@\n-old\n+new\n';
const packet = { schema_version: 'soulforge.dev_worker_request.v0', task_id: 'synthetic.fix', summary: 'Synthetic repair',
  allowed_write_paths: ['src/a.mjs'], acceptance_checks: ['check.synthetic'] };
const sources = [{ path: 'src/a.mjs', base_commit: 'a'.repeat(40), blob_oid: 'b'.repeat(40), source_ref: 'source.synthetic',
  sha256: sha('old\n'), bytes: 4, content: 'old\n' }];
const sourceRefs = sources.map(({ content, ...ref }) => ref);
const context = () => ({ run_ref: 'run.synthetic.' + Math.random().toString(16).slice(2),
  deadline_at: new Date(Date.now() + 30_000).toISOString(), signal: new AbortController().signal });

function fixture(overrides = {}, mode = 'success') {
  const calls = [], exchanges = [], requests = [], loaded = [], roles = ['author', 'patchReviewer', 'finalReviewer'];
  let instances = 0, active = 0, maxActive = 0;
  const options = { purpose: 'synthetic_harness', provider: 'g1_acp', group: 'G1', enabled: true, model: 'claude-synthetic',
    leaderRef: 'g1.coordinator', authorRef: 'g1.author', patchReviewerRef: 'g1.patchReviewer', finalReviewerRef: 'g1.finalReviewer',
    bindings: Object.fromEntries(roles.map(name => [name, { path: path.join(tmpdir(), `synthetic-acp-${name}.json`), sha256: sha(name) }])),
    authorize: async () => true, onRequest: async value => requests.push(value), onExchange: async value => exchanges.push(value),
    loadValidationEvidence: async () => [{ check_id: 'check.synthetic', capture_ref: 'capture.synthetic',
      stdout: 'Synthetic success\n', stderr: '', stdout_sha256: sha('Synthetic success\n'), stderr_sha256: sha(''), exit_code: 0 }],
    ...overrides };
  const dependencies = {
    loadBinding(file, hash) {
      loaded.push({ file, hash });
      const role = roles.find(name => options.bindings[name].path === file);
      return { model: mode === 'wrong-bound-model' ? 'other-model' : options.model,
        roleRef: mode === 'wrong-role' ? 'other-role' : `g1.${role}`, bindingSha256: hash,
        tools: mode === 'write-tool' ? ['workspace_write_text'] : ['workspace_read_text'],
        inputFiles: mode === 'foreign-input' ? [{ path: 'raw.json', sha256: sha('raw') }] : [] };
    },
    createClaudeAcp(binding, send) {
      const id = `session.synthetic.${++instances}`; let cancelled = false, open = false, resolveWait;
      return {
        async dispatch(method, params) {
          calls.push({ id, method, params });
          if (method === 'initialize') return { protocolVersion: 1 };
          if (method === 'session/new') return { sessionId: id, models: { currentModelId: binding.model } };
          if (method === 'session/cancel') {
            cancelled = true; if (open) { open = false; active--; }
            resolveWait?.({ stopReason: 'cancelled', _meta: { failure_meta: { directChildClosed: true } } }); return {};
          }
          if (method === 'session/prompt' && cancelled) return { stopReason: 'cancelled',
            _meta: { failure_meta: { directChildClosed: mode !== 'unclosed' } } };
          assert.equal(method, 'session/prompt');
          open = true; active++; maxActive = Math.max(active, maxActive);
          if (mode === 'wait') return new Promise(resolve => { resolveWait = resolve; });
          const text = params.prompt[0].text, prompt = JSON.parse(text.slice(text.indexOf('\n\n') + 2));
          send({ method: 'session/update', params: { sessionId: id, update: {
            sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hidden-never-export' } } } });
          const visible = prompt.operation === 'propose' ? { binding: prompt.binding, patch }
            : { binding: prompt.binding, status: 'ACCEPT', summary: 'Synthetic review evidence' };
          send({ method: 'session/update', params: { sessionId: mode === 'wrong-session' ? 'wrong' : id,
            update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: JSON.stringify(visible) } } } });
          await new Promise(resolve => setTimeout(resolve, 5));
          return mode === 'failed-terminal' ? { stopReason: 'end_turn', _meta: { source: 'scoped_adapter_terminal',
            accepted: false, failure_meta: { directChildClosed: true } } }
            : { stopReason: 'end_turn', _meta: { source: 'claude_cli_observed', model: binding.model, accepted: false } };
        },
        close() { calls.push({ id, method: 'close' }); },
      };
    },
  };
  return { options, dependencies, calls, exchanges, requests, loaded, ctx: context(),
    client: () => createFeedbackRuntimeAcpTestHarness(options, dependencies), stats: () => ({ instances, active, maxActive }) };
}
const propose = (client, ctx) => client.proposePatch({ packet, sources, author_ref: 'g1.author', context: ctx });

test('fake ACP exercises G1 authored patch and independent reviews in fresh sessions with full evidence', async () => {
  const f = fixture(), client = f.client(), proposed = await propose(client, f.ctx);
  const inspected = await client.inspectPatch({ packet, source_refs: sourceRefs, patch: proposed.patch, patch_sha256: sha(patch),
    author_ref: 'g1.author', context: f.ctx });
  const candidate = { candidate_ref: 'candidate.synthetic', packet_sha256: digest(packet), patch_sha256: sha(patch), patch_review_ref: inspected.review_ref };
  const validation = { status: 'PASS', validation_ref: 'validation.synthetic',
    checks: [{ check_id: 'check.synthetic', passed: true, log_ref: 'log.synthetic' }] };
  const reviewed = await client.review(candidate, validation, packet, f.ctx);
  assert.deepEqual(f.stats(), { instances: 3, active: 0, maxActive: 1 });
  assert.equal(f.loaded.length, 3); assert.equal(f.exchanges.length, 3);
  assert.equal(f.requests.length, 3);
  for (const [index, request] of f.requests.entries()) {
    assert.equal(request.request_ref, f.exchanges[index].request_ref);
    assert.equal(request.request_ref, f.exchanges[index].model_receipt.request_ref);
  }
  for (const id of new Set(f.calls.map(call => call.id))) assert.deepEqual(f.calls.filter(call => call.id === id).map(call => call.method),
    ['initialize', 'session/new', 'session/prompt', 'session/cancel', 'session/prompt', 'close']);
  assert.equal(JSON.stringify(f.exchanges).includes('hidden-never-export'), false);
  assert.deepEqual(f.exchanges.map(item => item.model_receipt.actor_ref), ['g1.author', 'g1.patchReviewer', 'g1.finalReviewer']);
  assert.equal(reviewed.model_receipt.transport, 'g1-claude-acp-synthetic-harness');
  assert.equal(reviewed.model_receipt.transport_binding.group, 'G1'); assert.equal(reviewed.canonical_accepted, false);
  assert.match(f.exchanges[2].request.prompt, /Synthetic success/);
});

test('production uses concrete binding loader; test injection and G2 group are not operating routes', async () => {
  const f = fixture();
  assert.throws(() => createFeedbackRuntimeAcp(f.options), { feedbackCode: 'FEEDBACK_ACP_CONFIG_INVALID' });
  assert.throws(() => createFeedbackRuntimeAcpTestHarness({ ...f.options, group: 'G2' }, f.dependencies), { feedbackCode: 'FEEDBACK_ACP_GROUP_INVALID' });
  assert.throws(() => createFeedbackRuntimeAcpTestHarness({ ...f.options, purpose: undefined }, f.dependencies));
  const production = createFeedbackRuntimeAcp({ ...f.options, purpose: undefined });
  await assert.rejects(propose(production, f.ctx), { feedbackCode: 'FEEDBACK_ACP_BINDING_INVALID' });
  assert.equal(f.loaded.length, 0); assert.equal(f.calls.length, 0);
});

test('fixed binding model/role, no extra inputs or write tools, and separate role pins fail closed', async () => {
  for (const mode of ['wrong-bound-model', 'wrong-role', 'write-tool', 'foreign-input']) {
    const f = fixture({}, mode);
    await assert.rejects(propose(f.client(), f.ctx), { feedbackCode: 'FEEDBACK_ACP_BINDING_INVALID' });
    assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.options.bindings.patchReviewer = f.options.bindings.author;
  assert.throws(() => f.client(), { feedbackCode: 'FEEDBACK_ACP_CONFIG_INVALID' });
});

test('current authorization runs again immediately before native turn and revocation starts none', async () => {
  let count = 0;
  const f = fixture({ authorize: async () => ++count < 3 });
  await assert.rejects(propose(f.client(), f.ctx), { feedbackCode: 'FEEDBACK_MODEL_INPUT_DENIED' });
  assert.equal(f.stats().active, 0); assert.equal(f.stats().instances, 1);
  // Only the cancelled-session closure inspection may be called afterward.
  assert.equal(f.calls.filter(call => call.method === 'session/prompt').length, 1);
  assert.equal(f.exchanges.length, 0);
});

test('timeout, cancellation, terminal failure and incorrect session output are not success', async () => {
  for (const [mode, expected] of [['wait', 'FEEDBACK_MODEL_TIMEOUT'], ['failed-terminal', 'FEEDBACK_ACP_TURN_FAILED'],
    ['wrong-session', 'FEEDBACK_ACP_OUTPUT_INVALID']]) {
    const f = fixture({ timeoutMs: mode === 'wait' ? 10 : 1000 }, mode);
    await assert.rejects(propose(f.client(), f.ctx), { feedbackCode: expected });
    assert.equal(f.exchanges.length, 0); assert.equal(f.stats().active, 0);
    assert.equal(f.requests.length, 1);
  }
  const f = fixture({}, 'wait'), ctl = new AbortController(); f.ctx.signal = ctl.signal;
  const running = propose(f.client(), f.ctx); setTimeout(() => ctl.abort(), 10);
  await assert.rejects(running, { feedbackCode: 'FEEDBACK_MODEL_INTERRUPTED' }); assert.equal(f.stats().active, 0);
});

test('unconfirmed closure quarantines that adapter and cannot dispatch another run', async () => {
  const f = fixture({}, 'unclosed'), client = f.client();
  await assert.rejects(propose(client, f.ctx), { feedbackCode: 'FEEDBACK_ACP_CLOSURE_UNKNOWN' });
  await assert.rejects(propose(client, context()), { feedbackCode: 'FEEDBACK_ACP_CLOSURE_UNKNOWN' });
  assert.equal(f.stats().instances, 1); assert.equal(f.exchanges.length, 0);
});

test('shared transport gate serializes simultaneous fake ACP instances including close', async () => {
  const f = fixture(), a = f.client(), b = f.client();
  await Promise.all([propose(a, context()), propose(b, context())]);
  assert.equal(f.stats().instances, 2); assert.equal(f.stats().maxActive, 1); assert.equal(f.stats().active, 0);
});

test('production default ACP loader and adapter execute pinned native fake CLI for proposal and independent review', async t => {
  const roles = ['author', 'patchReviewer', 'finalReviewer'];
  const fixtures = roles.map(() => nativeAcpFixture({ tools: ['workspace_read_text'] }));
  t.after(() => {
    for (const f of fixtures) {
      const resolved = path.resolve(f.root), relative = path.relative(path.resolve(tmpdir()), resolved);
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
      assert.match(path.basename(resolved), /^soulforge-claude-scope-/u);
      rmSync(resolved, { recursive: true, force: true });
    }
  });
  // Reuse the approved fake CLI protocol. Its fixed prose cannot satisfy the
  // feedback JSON contract, so this test-local copy changes only fake output.
  const cliPath = path.join(fixtures[0].root, process.platform === 'win32' ? 'feedback-fake.exe' : 'feedback-fake');
  if (process.platform === 'win32') {
    const original = readFileSync(path.join(path.dirname(fixtures[0].raw.cliPath), 'FakeClaude.cs'), 'utf8');
    const helper = `static string FeedbackReply(Dictionary<string,object> m){
var message=(Dictionary<string,object>)m["message"];var blocks=(System.Collections.IList)message["content"];
var block=(Dictionary<string,object>)blocks[0];string text=(string)block["text"];
var prompt=json.Deserialize<Dictionary<string,object>>(text.Substring(text.IndexOf("\\n\\n")+2));
return json.Serialize((string)prompt["operation"]=="propose"?(object)new {binding=prompt["binding"],patch=File.ReadAllText("feedback-patch.txt")}:new {binding=prompt["binding"],status="ACCEPT",summary="Native fake CLI independent review"});}
`;
    assert.ok(original.includes('text="synthetic reply"'));
    const source = original.replace('static void Main(string[] args)', helper + 'static void Main(string[] args)')
      .replace('text="synthetic reply"', 'text=FeedbackReply(m)')
      .replace('if(mode=="TEXT_BASH")', 'content.Add(new{type="thinking",thinking="synthetic-hidden-block"});if(mode=="TEXT_BASH")');
    const sourceFile = path.join(fixtures[0].root, 'FeedbackFake.cs'); writeFileSync(sourceFile, source);
    const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    const built = spawnSync(compiler, ['/nologo', '/target:exe', `/out:${cliPath}`, '/reference:System.Web.Extensions.dll', sourceFile],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(built.status, 0, 'test-local native fake CLI compiles');
  } else {
    const original = readFileSync(fixtures[0].raw.cliPath, 'utf8');
    assert.ok(original.includes("text:'synthetic reply'"));
    const helper = `function feedbackReply(m){const text=m.message.content[0].text;const p=JSON.parse(text.slice(text.indexOf('\\n\\n')+2));return JSON.stringify(p.operation==='propose'?{binding:p.binding,patch:fs.readFileSync('feedback-patch.txt','utf8')}:{binding:p.binding,status:'ACCEPT',summary:'Native fake CLI independent review'});}\n`;
    writeFileSync(cliPath, original.replace('const names=[];', helper + 'const names=[];')
      .replace("text:'synthetic reply'", 'text:feedbackReply(m)'));
    chmodSync(cliPath, 0o700);
  }
  const bindings = {};
  for (const [index, f] of fixtures.entries()) {
    f.raw.roleRef = `g1.${roles[index]}`; f.raw.cliPath = cliPath; f.raw.cliSha256 = sha(readFileSync(cliPath));
    writeFileSync(path.join(f.jobRoot, 'feedback-patch.txt'), patch);
    bindings[roles[index]] = { path: f.bindingPath, sha256: f.pin() };
  }
  const exchanges = [], requests = [], client = createFeedbackRuntimeAcp({ provider: 'g1_acp', group: 'G1', enabled: true,
    model: fixtures[0].raw.model, leaderRef: 'g1.coordinator', authorRef: 'g1.author', patchReviewerRef: 'g1.patchReviewer',
    finalReviewerRef: 'g1.finalReviewer', bindings, authorize: async () => true,
    loadValidationEvidence: async () => [{ check_id: 'check.synthetic', capture_ref: 'capture.native', stdout: 'Native fixture validation\n',
      stderr: '', stdout_sha256: sha('Native fixture validation\n'), stderr_sha256: sha(''), exit_code: 0 }],
    onRequest: async envelope => requests.push(envelope), onExchange: async exchange => exchanges.push(exchange), timeoutMs: 30_000 });
  const ctx = context(), proposed = await propose(client, ctx);
  const inspected = await client.inspectPatch({ packet, source_refs: sourceRefs, patch: proposed.patch,
    patch_sha256: sha(patch), author_ref: 'g1.author', context: ctx });
  assert.equal(proposed.patch, patch); assert.equal(inspected.status, 'ACCEPT');
  assert.equal(inspected.reviewer_ref, 'g1.patchReviewer'); assert.equal(inspected.canonical_accepted, false);
  const candidate = { candidate_ref: 'candidate.native', packet_sha256: digest(packet), patch_sha256: sha(patch), patch_review_ref: inspected.review_ref };
  const validation = { status: 'PASS', validation_ref: 'validation.native', checks: [{ check_id: 'check.synthetic', passed: true, log_ref: 'log.native' }] };
  const final = await client.review(candidate, validation, packet, ctx);
  assert.equal(final.status, 'ACCEPT'); assert.equal(final.reviewer_ref, 'g1.finalReviewer');
  assert.equal(exchanges.length, 3);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].request_ref, exchanges[0].model_receipt.request_ref);
  assert.equal(requests[1].request_ref, exchanges[1].model_receipt.request_ref);
  assert.equal(requests[2].request_ref, exchanges[2].model_receipt.request_ref);
  assert.match(exchanges[2].request.prompt, /Native fixture validation/u);
  assert.equal(exchanges[0].model_receipt.transport, 'g1-claude-acp');
  assert.equal(exchanges[1].model_receipt.transport_binding.binding_sha256, bindings.patchReviewer.sha256);
  assert.equal(JSON.stringify(exchanges).includes('synthetic-hidden-block'), false);
  assert.equal(JSON.stringify(exchanges).includes('SYNTHETIC_PRIVATE_'), false);
  for (const f of fixtures) {
    assert.equal(readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '1');
    assert.equal(readFileSync(path.join(f.jobRoot, 'received-user-count.txt'), 'utf8'), '1');
    assert.equal(readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '1');
  }
});
