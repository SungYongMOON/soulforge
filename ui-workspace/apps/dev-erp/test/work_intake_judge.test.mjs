// All native processes below are compiled/scripted synthetic CLI fixtures.
// The production judge and existing ACP binding/server are exercised unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fixture as acpFixture } from '../../../../guild_hall/tool_workshop/tests/claude_acp_fixture.mjs';
import { createWorkIntakeJudge, isWorkIntakeProviderJudge, verifyWorkIntakeJudgeReceipt } from '../src/work_intake_judge.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function request(patch = {}) {
  const body = { schema: 'soulforge.work_intake.synthetic_judge.v1', provenance: 'synthetic', project_ref: 'PROJECT_SYNTHETIC',
    window: { start: '2026-09-08T00:00:00Z', end: '2026-09-08T01:00:00Z' }, permission_refs: ['permission.synthetic'],
    event: { revision_ref: 'revision.synthetic', project_binding_ref: 'binding.synthetic',
      evidence_refs: ['revision.synthetic', 'binding.synthetic', 'fact.synthetic'],
      facts: [{ fact_ref: 'fact.synthetic', text: 'Synthetic supplier asks for a revised delivery estimate.' }] },
    linear_view: { evidence_refs: ['linear.synthetic.view'], tasks: [{ task_ref: 'task.synthetic', status: 'open',
      task_semantic_sha256: 'b'.repeat(64), evidence_refs: ['task.synthetic.evidence'],
      semantic_context: 'Synthetic current task: inspect a separate quality sample.' }] }, ...patch };
  return Object.freeze({ ...body, input_sha256: hash(canonical(body)) });
}
const answer = patch => ({ classification: 'NEW', reason_code: 'NEW_REQUEST', matched_task_ref: null,
  task_semantic_sha256: 'a'.repeat(64), action_semantic_sha256: 'c'.repeat(64),
  evidence_refs: ['revision.synthetic', 'binding.synthetic', 'fact.synthetic'], ...patch });

let fakeCli, fakeRoot;
function replyExecutable(nativePath) {
  if (fakeCli) return fakeCli;
  fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'work-intake-fake-cli-'));
  fakeCli = path.join(fakeRoot, process.platform === 'win32' ? 'work-intake-fake.exe' : 'work-intake-fake');
  if (process.platform === 'win32') {
    const original = fs.readFileSync(path.join(path.dirname(nativePath), 'FakeClaude.cs'), 'utf8');
    assert.ok(original.includes('text="synthetic reply"'));
    const source = original.replace('text="synthetic reply"', 'text=File.ReadAllText("work-intake-reply.json")')
      .replace('users++;File.WriteAllText', 'users++;File.WriteAllText("work-intake-prompt.json",line);File.WriteAllText')
      .replace('if(mode=="TEXT_BASH")', 'content.Add(new{type="thinking",thinking="SYNTHETIC_HIDDEN_THOUGHT"});if(mode=="TEXT_BASH")');
    const file = path.join(fakeRoot, 'WorkIntakeFake.cs'); fs.writeFileSync(file, source);
    const built = spawnSync(path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
      ['/nologo', '/target:exe', `/out:${fakeCli}`, '/reference:System.Web.Extensions.dll', file], { windowsHide: true, encoding: 'utf8' });
    assert.equal(built.status, 0, 'synthetic executable compilation');
  } else {
    const original = fs.readFileSync(nativePath, 'utf8');
    assert.ok(original.includes("text:'synthetic reply'"));
    fs.writeFileSync(fakeCli, original.replace("text:'synthetic reply'", "text:fs.readFileSync('work-intake-reply.json','utf8')")
      .replace("if(m.type!=='user')return;", "if(m.type!=='user')return;fs.writeFileSync('work-intake-prompt.json',line);"));
    fs.chmodSync(fakeCli, 0o700);
  }
  return fakeCli;
}
function cleanup(root, prefix) {
  const resolved = fs.realpathSync(root), parent = fs.realpathSync(os.tmpdir());
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith(prefix));
  fs.rmSync(resolved, { recursive: true, force: true });
}
test.after(() => { if (fakeRoot) cleanup(fakeRoot, 'work-intake-fake-cli-'); });

function fixture(t, { mode, output = answer(), options = {}, native = {} } = {}) {
  const f = acpFixture({ tools: ['workspace_read_text'], ...(mode ? { mode } : {}) });
  t.after(() => cleanup(f.root, 'soulforge-claude-scope-'));
  f.raw.cliPath = replyExecutable(f.raw.cliPath);
  f.raw.cliSha256 = hash(fs.readFileSync(f.raw.cliPath));
  f.raw.projectRef = 'PROJECT_SYNTHETIC';
  f.raw.roleRef = 'g1.work-intake-judge';
  Object.assign(f.raw, native);
  fs.writeFileSync(path.join(f.jobRoot, 'work-intake-reply.json'), typeof output === 'string' ? output : JSON.stringify(output));
  const calls = [], attempts = [], closures = [];
  const configured = {
    binding: { path: f.bindingPath, sha256: f.pin() }, model: 'claude-synthetic-test-model', roleRef: 'g1.work-intake-judge',
    authorize: async value => { calls.push(value.phase); return true; },
    onAttempt: async value => {
      attempts.push(value);
      assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-start-count.txt')), attempts.length > 1);
      return { status: 'RECORDED', input_sha256: value.input_sha256, attempt_ref: `attempt.synthetic.${attempts.length}` };
    },
    onClosed: async value => { closures.push(value); }, timeoutMs: 15000, ...options,
  };
  return { ...f, calls, attempts, closures, configured, judge: createWorkIntakeJudge(configured),
    prompts: () => fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')) ? fs.readFileSync(path.join(f.jobRoot, 'received-user-count.txt'), 'utf8') : '0' };
}

test('real ACP native synthetic executable receives semantic context and returns genuine snapshot-verifiable receipt', async t => {
  const f = fixture(t), input = request(), output = await f.judge(input);
  assert.equal(output.classification, 'NEW');
  assert.equal(output.model_receipt.kind, 'g1_acp');
  assert.equal(output.model_receipt.model_ref, f.raw.model);
  assert.equal(output.model_receipt.input_sha256, input.input_sha256);
  assert.equal(f.prompts(), '1');
  assert.equal(f.attempts.length, 1);
  assert.equal(f.closures.length, 1);
  assert.equal(f.closures[0].direct_child_closed, true);
  assert.equal(f.closures[0].reason_code, 'COMPLETED');
  const frame = JSON.parse(fs.readFileSync(path.join(f.jobRoot, 'work-intake-prompt.json'), 'utf8'));
  const prompt = frame.message.content[0].text;
  assert.ok(prompt.includes(input.event.facts[0].text));
  assert.ok(prompt.includes(input.linear_view.tasks[0].semantic_context));
  assert.equal(output.model_receipt.prompt_sha256_ref, hash(prompt));
  assert.ok(!JSON.stringify(output).includes('SYNTHETIC_HIDDEN_THOUGHT'));
  assert.ok(!JSON.stringify(output).includes('SYNTHETIC_PRIVATE_'));
  const copy = JSON.parse(JSON.stringify(output)), requestCopy = JSON.parse(JSON.stringify(input));
  assert.equal(isWorkIntakeProviderJudge(f.judge), true);
  assert.equal(verifyWorkIntakeJudgeReceipt(f.judge, copy.model_receipt, requestCopy, copy), true);
  assert.equal(verifyWorkIntakeJudgeReceipt(async () => output, copy.model_receipt, requestCopy, copy), false);
  assert.equal(verifyWorkIntakeJudgeReceipt(f.judge, { ...copy.model_receipt, model_ref: 'forged' }, requestCopy, copy), false);
  assert.equal(verifyWorkIntakeJudgeReceipt(f.judge, copy.model_receipt, requestCopy, { ...copy, reason_code: 'UNKNOWN' }), false);
  assert.equal(verifyWorkIntakeJudgeReceipt(f.judge, copy.model_receipt, request({ provenance: 'replay' }), copy), false);
  const sourceBound = request({ provenance: 'source_bound', schema: 'soulforge.work_intake.provider_judge.v1' });
  const sourceOutput = await f.judge(sourceBound);
  assert.equal(verifyWorkIntakeJudgeReceipt(f.judge, sourceOutput.model_receipt, sourceBound, sourceOutput), true);
});

test('semantic task match uses exact current evidence and completed-task follow-up is rejected', async t => {
  const result = answer({ classification: 'FOLLOW_UP', reason_code: 'EXISTING_TASK', matched_task_ref: 'task.synthetic',
    task_semantic_sha256: 'b'.repeat(64), evidence_refs: ['revision.synthetic', 'binding.synthetic', 'task.synthetic.evidence'] });
  const f = fixture(t, { output: result });
  assert.equal((await f.judge(request())).matched_task_ref, 'task.synthetic');
  const input = request(), changed = request({ linear_view: { ...input.linear_view, tasks: [{ ...input.linear_view.tasks[0], status: 'completed' }] } });
  await assert.rejects(f.judge(changed), { workIntakeCode: 'WORK_INTAKE_JUDGE_SEMANTICS_INVALID' });
  assert.equal(f.closures.length, 2);
  assert.ok(f.closures.every(item => item.direct_child_closed));
  assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '11');
});

test('untrusted output cannot invent evidence, return a receipt, or exceed the output boundary', async t => {
  for (const [output, code] of [
    [answer({ evidence_refs: ['revision.synthetic', 'binding.synthetic', 'invented.evidence'] }), 'WORK_INTAKE_JUDGE_EVIDENCE_UNBOUND'],
    [answer({ model_receipt: {} }), 'WORK_INTAKE_JUDGE_OUTPUT_INVALID'],
    ['not-json', 'WORK_INTAKE_JUDGE_OUTPUT_INVALID'],
    ['x'.repeat(32769), 'WORK_INTAKE_JUDGE_OUTPUT_LIMIT'],
  ]) {
    const f = fixture(t, { output });
    await assert.rejects(f.judge(request()), { workIntakeCode: code });
    assert.equal(f.closures[0].direct_child_closed, true);
  }
});

test('recorded durable attempt acknowledgement is mandatory before native process or prompt', async t => {
  const f = fixture(t, { options: { onAttempt: async () => ({ status: 'RECORDED', input_sha256: '0'.repeat(64), attempt_ref: 'attempt.bad' }) } });
  await assert.rejects(f.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_ATTEMPT_UNRECORDED' });
  assert.equal(f.prompts(), '0');
  assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-start-count.txt')), false);
  assert.equal(f.closures[0].direct_child_closed, true);
});

test('current authority is checked before native work and after native reply', async t => {
  const before = fixture(t, { options: { authorize: async () => false } });
  await assert.rejects(before.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_AUTHORITY_DENIED' });
  assert.equal(before.prompts(), '0');
  const after = fixture(t, { options: { authorize: async ({ phase }) => phase !== 'after_prompt' } });
  await assert.rejects(after.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_AUTHORITY_DENIED' });
  assert.equal(after.prompts(), '1');
  assert.equal(after.closures[0].direct_child_closed, true);
});

test('input snapshot digest, size, native project/model/tools and production factory injection fail closed', async t => {
  const f = fixture(t);
  await assert.rejects(f.judge({ ...request(), input_sha256: 'f'.repeat(64) }), { workIntakeCode: 'WORK_INTAKE_JUDGE_INPUT_DIGEST' });
  await assert.rejects(f.judge(request({ event: { ...request().event, facts: [{ text: 'x'.repeat(65537) }] } })), { workIntakeCode: 'WORK_INTAKE_JUDGE_INPUT_LIMIT' });
  assert.throws(() => createWorkIntakeJudge({ ...f.configured, dependencies: {} }), { workIntakeCode: 'WORK_INTAKE_JUDGE_CONFIG_INVALID' });
  for (const native of [{ model: 'wrong-model' }, { projectRef: 'OTHER_PROJECT' }, { tools: ['workspace_write_text'] }]) {
    const bad = fixture(t, { native });
    await assert.rejects(bad.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_BINDING_INVALID' });
    assert.equal(bad.prompts(), '0');
  }
});

test('native timeout cancellation confirms actual direct-child closure and permits a fresh later session', async t => {
  const f = fixture(t, { mode: 'WAIT', options: { timeoutMs: 2500 } });
  await assert.rejects(f.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_TIMEOUT' });
  assert.equal(f.prompts(), '1');
  assert.equal(f.closures[0].direct_child_closed, true);
  const next = fixture(t);
  assert.equal((await next.judge(request())).classification, 'NEW');
});

test('concurrent provider calls serialize through native child closure with fresh sessions', async t => {
  const sequence = [];
  const make = name => fixture(t, { options: {
    onAttempt: async value => { sequence.push(`start.${name}`); return { status: 'RECORDED', input_sha256: value.input_sha256, attempt_ref: `attempt.${name}` }; },
    onClosed: async value => { assert.equal(value.direct_child_closed, true); sequence.push(`close.${name}`); },
  } });
  const first = make('one'), second = make('two');
  await Promise.all([first.judge(request()), second.judge(request())]);
  assert.deepEqual(sequence, ['start.one', 'close.one', 'start.two', 'close.two']);
});

// Last: an unacknowledged closure record poisons this process by design. A new
// runtime must reconcile its durable UNKNOWN before constructing another worker.
test('failed closure persistence keeps provider unavailable and never returns an accepted receipt', async t => {
  const f = fixture(t, { options: { onClosed: async () => { throw new Error('synthetic persistence failure'); } } });
  await assert.rejects(f.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_CLOSURE_UNKNOWN' });
  await assert.rejects(f.judge(request()), { workIntakeCode: 'WORK_INTAKE_JUDGE_CLOSURE_UNKNOWN' });
  assert.equal(f.prompts(), '1');
});
