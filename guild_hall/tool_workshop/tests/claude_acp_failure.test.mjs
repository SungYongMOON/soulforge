import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from './claude_acp_fixture.mjs';
import { childEnvironment } from '../src/claude_acp_policy.mjs';
import { createClaudeAcp, readJsonLines } from '../src/claude_acp_server.mjs';

const prompt = sessionId => ({ sessionId, prompt: [{ type: 'text', text: 'synthetic failure canary' }] });
test('v3 packaging retains the exact production closure without inherited state and preserves v1/v2', () => {
  const read = file => JSON.parse(fs.readFileSync(new URL(`../../deployment_pack/lanes/${file}`, import.meta.url)));
  const v1 = read('tool_workshop_claude_acp_lane.spec.json'); const v2 = read('tool_workshop_claude_acp_v2_lane.spec.json'); const v3 = read('tool_workshop_claude_acp_v3_lane.spec.json');
  assert.equal(v1.lane_id, 'tool-workshop-claude-acp-v1'); assert.equal(v2.lane_id, 'tool-workshop-claude-acp-v2');
  assert.equal(v3.lane_id, 'tool-workshop-claude-acp-v3'); assert.equal(v3.schema, 'soulforge.source_lane_spec.v0');
  assert.deepEqual(v3.tracked_paths, v2.tracked_paths); assert.equal(v3.tracked_paths.length, 4);
  assert.deepEqual(v3.entry_points, v2.entry_points); assert.deepEqual(v3.tracked_excludes, []);
  assert.deepEqual(v3.carried_forward_prefixes, []); assert.deepEqual(v3.carried_forward_rationale, {});
});
test('typed native failure exposes only known subtype/code/class and ignores error prose', async () => {
  const f = fixture(); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  fs.writeFileSync(path.join(f.jobRoot, 'native-result.json'), JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, error: 'rate_limit', errors: ['SYNTHETIC_PRIVATE_ERROR'], token: 'SYNTHETIC_PRIVATE_TOKEN' }));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result._meta.failure_meta.nativeCode, 'rate_limit');
    assert.equal(result._meta.failure_meta.classification, 'rate_limit');
    assert.equal(result._meta.failure_meta.code, 'CLI_TURN_FAILED');
    assert.equal(JSON.stringify({ result, messages }).includes('SYNTHETIC_PRIVATE'), false);
    assert.match(messages[0].params.update.content.text, /rate_limit/);
  } finally { agent.close(); }
});

for (const [mode, file, frame, expected] of [
  ['FAIL_BEFORE_INIT', 'native-result.json', { type: 'result', subtype: 'error_max_budget_usd', is_error: true, errors: ['SYNTHETIC_PRIVATE budget detail'] }, { nativeSubtype: 'error_max_budget_usd', nativeCode: null, classification: 'budget_limit' }],
  ['synthetic instructions', 'native-assistant.json', { type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'SYNTHETIC_PRIVATE_AUTH_ERROR' }] } }, { nativeSubtype: null, nativeCode: 'authentication_failed', classification: 'authentication' }],
  ['synthetic instructions', 'native-result.json', { type: 'result', subtype: 'SYNTHETIC_PRIVATE_SUBTYPE', is_error: true, error: 'invalid api key or quota exhausted', errors: ['SYNTHETIC_PRIVATE_ERROR'] }, { nativeSubtype: null, nativeCode: null, classification: 'unknown' }],
]) test(`native ${expected.classification} is terminal and forwards no raw error or invented cause`, async () => {
  const f = fixture({ mode }); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  fs.writeFileSync(path.join(f.jobRoot, file), JSON.stringify(frame));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result._meta.failure_meta.code, 'CLI_TURN_FAILED');
    for (const [key, value] of Object.entries(expected)) assert.equal(result._meta.failure_meta[key], value);
    assert.equal(result._meta.auth.loggedIn, true); // Native failure never rewrites the separate auth observation.
    assert.equal(result._meta.failure_meta.directChildClosed, true);
    assert.equal(JSON.stringify({ result, messages }).includes('SYNTHETIC_PRIVATE'), false);
    assert.equal(JSON.stringify({ result, messages }).includes('invalid api key'), false);
    assert.equal(messages.length, 1);
  } finally { agent.close(); }
});

test('oversized assistant output terminates once with no partial offending frame text', async () => {
  const f = fixture(); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  fs.writeFileSync(path.join(f.jobRoot, 'native-assistant.json'), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(256 * 1024 + 1) }] } }));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result._meta.failure_meta.code, 'CLI_OUTPUT_LIMIT');
    assert.equal(messages.length, 1); assert.ok(messages[0].params.update.content.text.length < 200);
    assert.deepEqual(await agent.dispatch('session/prompt', prompt(sessionId)), result);
  } finally { agent.close(); }
});

test('unknown direct-child closure blocks another run until the actual close is observed', async t => {
  const f = fixture({ mode: 'WAIT' }); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  const kill = ChildProcess.prototype.kill; const withheld = new Set();
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const pending = agent.dispatch('session/prompt', prompt(sessionId));
    for (let i = 0; i < 200 && !fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), true);
    t.mock.method(ChildProcess.prototype, 'kill', function () { withheld.add(this); return false; });
    await agent.dispatch('session/cancel', { sessionId });
    const cancelled = await pending;
    assert.equal(cancelled.stopReason, 'cancelled');
    assert.equal(cancelled._meta.failure_meta.directChildClosed, false);
    const fresh = await agent.dispatch('session/new', {});
    const blocked = await agent.dispatch('session/prompt', prompt(fresh.sessionId));
    assert.equal(blocked._meta.failure_meta.code, 'PRIOR_CHILD_CLOSE_UNCONFIRMED');
    assert.equal(blocked._meta.failure_meta.directChildClosed, false);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '1');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '1');
    t.mock.restoreAll();
    await Promise.all([...withheld].map(child => new Promise(resolve => { child.once('close', resolve); kill.call(child); })));
    withheld.clear();
    fs.writeFileSync(path.join(f.jobRoot, 'fake-auth-mode.txt'), 'false');
    const afterClose = await agent.dispatch('session/new', {});
    assert.equal((await agent.dispatch('session/prompt', prompt(afterClose.sessionId)))._meta.failure_meta.code, 'AUTH_REQUIRED');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '11');
  } finally {
    t.mock.restoreAll();
    await Promise.all([...withheld].map(child => new Promise(resolve => { child.once('close', resolve); kill.call(child); })));
    agent.close();
  }
});

test('an auth observation that expires during metadata checks cannot authorize a prompt', async t => {
  const f = fixture({ mode: 'WAIT_CONTEXT' }); const agent = createClaudeAcp(f.load(), () => {});
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const pending = agent.dispatch('session/prompt', prompt(sessionId));
    const controls = path.join(f.jobRoot, 'received-controls.json');
    for (let i = 0; i < 200 && (!fs.existsSync(controls) || !fs.readFileSync(controls, 'utf8').includes('get_context_usage')); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(fs.readFileSync(controls, 'utf8'), /get_context_usage/);
    t.mock.timers.tick(31000);
    const result = await pending;
    assert.equal(result._meta.failure_meta.code, 'AUTH_STATE_UNAVAILABLE');
    assert.ok(result._meta.auth.expiresAt < Date.now());
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
  } finally { t.mock.timers.reset(); agent.close(); }
});

test('a revoked binding after a successful prompt cannot launch another auth or model attempt', async () => {
  const f = fixture(); const agent = createClaudeAcp(f.load(), () => {});
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    await agent.dispatch('session/prompt', prompt(sessionId));
    fs.appendFileSync(f.bindingPath, ' ');
    await assert.rejects(agent.dispatch('session/prompt', prompt(sessionId)), /FILE_CHANGED/);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '1');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'received-user-count.txt'), 'utf8'), '1');
  } finally { agent.close(); }
});

test('a typed error never overrides the foreign-tool safety rejection', async () => {
  const f = fixture(); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  fs.writeFileSync(path.join(f.jobRoot, 'native-assistant.json'), JSON.stringify({ type: 'assistant', error: 'authentication_failed', message: { content: [{ type: 'text', text: 'synthetic private' }, { type: 'tool_use', name: 'Bash' }] } }));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    await assert.rejects(agent.dispatch('session/prompt', prompt(sessionId)), /CLI_TOOL_INVENTORY_MISMATCH/);
    assert.equal(messages.length, 0);
  } finally { agent.close(); }
});

test('cancellation during native auth probe closes it without sending a work prompt or failure notice', async () => {
  const f = fixture({ auth: 'wait' }); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const pending = agent.dispatch('session/prompt', prompt(sessionId));
    for (let i = 0; i < 200 && !fs.existsSync(path.join(f.jobRoot, 'auth-probe-count.txt')); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'auth-probe-count.txt')), true);
    await agent.dispatch('session/cancel', { sessionId });
    const cancelled = await pending;
    assert.equal(cancelled.stopReason, 'cancelled'); assert.equal(cancelled._meta.failure_meta.directChildClosed, true);
    assert.equal(messages.length, 0);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
  } finally { agent.close(); }
});
test('native failed turn ends once, preserves failure on replay, and never respawns or leaks native prose', async () => {
  const f = fixture({ mode: 'FAIL_RESULT' }); const messages = [];
  const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 2 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result.stopReason, 'end_turn');
    assert.equal(result._meta.accepted, false);
    assert.equal(result._meta.failure_meta.code, 'CLI_TURN_FAILED');
    assert.equal(result._meta.failure_meta.nativeSubtype, 'error_during_execution');
    assert.equal(result._meta.failure_meta.retryable, false);
    assert.equal(result._meta.failure_meta.directChildClosed, true);
    assert.equal(messages.length, 1);
    assert.match(messages[0].params.update.content.text, /CLI_TURN_FAILED/);
    for (let i = 0; i < 4; i++) assert.deepEqual(await agent.dispatch('session/prompt', prompt(sessionId)), result);
    assert.equal(messages.length, 1);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '1');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'received-user-count.txt'), 'utf8'), '1');
    assert.equal(JSON.stringify({ result, messages }).includes('SYNTHETIC_PRIVATE_FAILURE_DO_NOT_FORWARD'), false);
  } finally { agent.close(); }
});

for (const [auth, classification] of [['wrong-shape', 'shape'], ['bad-method', 'shape'], ['malformed', 'shape'], ['wrong-exit', 'inconsistent'], ['oversized', 'output_limit']]) test(`unavailable auth ${auth} never sends a work prompt or reports an account diagnosis`, async () => {
  const f = fixture({ auth }); const messages = [];
  const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result.stopReason, 'end_turn'); assert.equal(result._meta.accepted, false);
    assert.equal(result._meta.failure_meta.code, 'AUTH_STATE_UNAVAILABLE');
    assert.equal(result._meta.auth.classification, classification);
    assert.equal(result._meta.auth.loggedIn, null); assert.equal(result._meta.auth.authMethod, null);
    assert.equal(result._meta.failure_meta.directChildClosed, true);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-argv.json')), false);
    assert.equal(JSON.stringify({ result, messages }).includes('SYNTHETIC_PRIVATE'), false);
  } finally { agent.close(); }
});

test('persistent session rechecks current authentication for every prompt and never reuses a prior positive result', async () => {
  const f = fixture(); const agent = createClaudeAcp(f.load(), () => {});
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const first = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(first._meta.auth.loggedIn, true); assert.equal(first._meta.auth.authMethod, 'claude.ai');
    fs.writeFileSync(path.join(f.jobRoot, 'fake-auth-mode.txt'), 'false');
    const second = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(second._meta.failure_meta.code, 'AUTH_REQUIRED');
    assert.equal(second._meta.auth.loggedIn, false);
    assert.equal(second._meta.failure_meta.directChildClosed, true);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '11');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'received-user-count.txt'), 'utf8'), '1');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '1');
    const fresh = await agent.dispatch('session/new', {});
    fs.writeFileSync(path.join(f.jobRoot, 'fake-auth-mode.txt'), 'authenticated');
    assert.equal((await agent.dispatch('session/prompt', prompt(fresh.sessionId)))._meta.auth.loggedIn, true);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '11');
  } finally { agent.close(); }
});

test('actual adapter stdio sends one explicit failure notice before its terminal response and replay has no notice or JSON-RPC error', async () => {
  const f = fixture({ mode: 'FAIL_RESULT' });
  const cli = fileURLToPath(new URL('../src/claude_acp_cli.mjs', import.meta.url));
  const child = spawn(process.execPath, [cli, '--binding', f.bindingPath, '--binding-sha256', f.hash], { env: childEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = []; const pending = new Map(); let nextId = 0;
  const rejectAll = error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); };
  const closed = new Promise(resolve => child.on('close', code => { rejectAll(new Error('synthetic adapter closed')); resolve(code); }));
  child.on('error', rejectAll); child.stdin.on('error', rejectAll); child.stderr.on('data', () => {});
  readJsonLines(child.stdout, message => {
    messages.push(message); const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id); entry.resolve(message); }
  }, code => rejectAll(new Error(code)));
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, timer: setTimeout(() => { child.kill(); reject(new Error('synthetic request timeout')); }, 15000) });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  try {
    assert.equal((await request('initialize', { protocolVersion: 2 })).result.protocolVersion, 1);
    const { sessionId } = (await request('session/new', { mcpServers: [] })).result;
    const first = await request('session/prompt', prompt(sessionId));
    assert.equal(first.error, undefined); assert.equal(first.result.stopReason, 'end_turn');
    assert.equal(first.result._meta.failure_meta.status, 'failed');
    assert.equal(messages.at(-2).method, 'session/update');
    assert.match(messages.at(-2).params.update.content.text, /CLI_TURN_FAILED/);
    const replay = await request('session/prompt', prompt(sessionId));
    assert.deepEqual(replay.result, first.result);
    assert.equal(messages.filter(message => message.method === 'session/update').length, 1);
    assert.equal(messages.some(message => message.error), false);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'child-start-count.txt'), 'utf8'), '1');
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '1');
  } finally {
    child.stdin.end(); const timer = setTimeout(() => child.kill(), 3000);
    try { await closed; } finally { clearTimeout(timer); }
  }
});

test('authentication is checked before a work prompt in the fixed child context and false is terminal', async () => {
  const f = fixture({ auth: 'false' }); const messages = [];
  const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 2 });
    const { sessionId } = await agent.dispatch('session/new', {});
    const result = await agent.dispatch('session/prompt', prompt(sessionId));
    assert.equal(result.stopReason, 'end_turn');
    assert.equal(result._meta.failure_meta.code, 'AUTH_REQUIRED');
    assert.equal(result._meta.auth.loggedIn, false);
    assert.equal(result._meta.auth.authMethod, 'none');
    assert.equal(result._meta.auth.source, 'claude_cli_auth_status');
    assert.equal(result._meta.auth.cliSha256, f.raw.cliSha256);
    assert.equal(result._meta.auth.bindingSha256, f.hash);
    assert.deepEqual(result._meta.auth.sourceHashes, f.raw.sourceHashes);
    assert.ok(result._meta.auth.expiresAt > result._meta.auth.checkedAt);
    assert.ok(result._meta.auth.expiresAt <= f.raw.expiresAt);
    const argv = JSON.parse(fs.readFileSync(path.join(f.jobRoot, 'auth-argv.json')));
    assert.deepEqual(argv.args, ['auth', 'status', '--json']);
    assert.equal(argv.cwd, f.jobRoot);
    assert.equal(argv.inheritedBuzz, null); assert.equal(argv.inheritedNode, null); assert.equal(argv.inheritedProvider, null);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-argv.json')), false);
    assert.equal(result._meta.failure_meta.directChildClosed, true);
    assert.equal(JSON.stringify({ result, messages }).includes('SYNTHETIC_PRIVATE'), false);
    assert.deepEqual(await agent.dispatch('session/prompt', prompt(sessionId)), result);
    assert.equal(fs.readFileSync(path.join(f.jobRoot, 'auth-probe-count.txt'), 'utf8'), '1');
    assert.equal(messages.length, 1);
  } finally { agent.close(); }
});
