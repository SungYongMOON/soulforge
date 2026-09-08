import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { fixture } from './claude_acp_fixture.mjs';
import { loadBinding, launchSpec, childEnvironment, sha256, readPinnedFile, regularPath, verifyCurrentCli } from '../src/claude_acp_policy.mjs';
import { callWorkspaceTool } from '../src/claude_acp_workspace.mjs';
import { createClaudeAcp, readJsonLines } from '../src/claude_acp_server.mjs';

test('binding rejects unknown capabilities, canonical roots, mutable authority, expired pins and drift', () => {
  const f = fixture();
  for (const change of [r => { r.tools.push('Bash'); }, r => { r.expiresAt = 1; }, r => { r.inputFiles = [{ path: 'x.txt', sha256: 'unknown' }]; }, r => { r.sourceHashes['claude_acp_server.mjs'] = '0'.repeat(64); }, r => { r.instructions.path = path.join(r.jobRoot, 'AGENTS.md'); }, r => { r.model = '--fallback'; }, r => { r.settings = {}; }]) {
    const old = structuredClone(f.raw); change(f.raw); f.pin(); assert.throws(f.load); Object.keys(f.raw).forEach(k => delete f.raw[k]); Object.assign(f.raw, old);
  }
  f.pin(); const binding = f.load(); fs.appendFileSync(f.bindingPath, ' ');
  assert.throws(() => launchSpec(binding), /FILE_CHANGED/);
  assert.throws(() => loadBinding(f.bindingPath, '0'.repeat(64)), /FILE_CHANGED/);
});
test('canonical workspace and mutable work-root binding placement are refused', () => {
  const f = fixture();
  f.raw.workRoot = path.join(f.root, '_workspaces', 'synthetic'); f.raw.jobRoot = path.join(f.raw.workRoot, 'JOBS', f.raw.jobRef);
  fs.mkdirSync(f.raw.jobRoot, { recursive: true }); f.pin(); assert.throws(f.load, /CANON_ROOT_FORBIDDEN/);
  f.raw.workRoot = path.join(f.root, 'mutable'); f.raw.jobRoot = path.join(f.raw.workRoot, 'JOBS', f.raw.jobRef);
  fs.mkdirSync(f.raw.jobRoot, { recursive: true }); const nested = path.join(f.raw.workRoot, 'binding.json');
  const bytes = Buffer.from(JSON.stringify(f.raw)); fs.writeFileSync(nested, bytes);
  assert.throws(() => loadBinding(nested, sha256(bytes)), /AUTHORITY_IN_WORK_ROOT/);
});
test('input paths are rejected while loading binding, before any CLI launch or workspace access', () => {
  const f = fixture();
  for (const value of ['../outside.md', '/absolute.md', 'bad\\slash.md', 'file.md:stream', 'CON.txt', '.hidden.md', 'nested/.secret.json', 'a./x.md', 'code.py', 'a//x.md', path.join(f.root, 'file.md')]) {
    f.raw.inputFiles = [{ path: value, sha256: '0'.repeat(64) }]; f.pin(); assert.throws(f.load, /WORKSPACE_PATH|WORKSPACE_FILE_TYPE/);
  }
  assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-argv.json')), false);
});
test('launch has strict MCP, zero builtins, disabled skills/hooks, exact model and no credential env', () => {
  const f = fixture(); const spec = launchSpec(f.load()); const value = flag => spec.args[spec.args.indexOf(flag) + 1];
  assert.equal(value('--tools'), ''); assert.equal(value('--setting-sources'), '');
  assert.ok(spec.args.includes('--strict-mcp-config')); assert.ok(spec.args.includes('--disable-slash-commands'));
  assert.ok(spec.args.includes('--no-session-persistence')); assert.equal(value('--permission-mode'), 'default');
  assert.equal(JSON.parse(value('--settings')).disableAllHooks, true);
  const mcp = JSON.parse(value('--mcp-config')); assert.deepEqual(Object.keys(mcp.mcpServers), ['soulforge_workspace']);
  assert.equal(spec.cwd, f.jobRoot); assert.equal(value('--model'), f.raw.model); assert.equal(spec.windowsHide, true);
  const env = childEnvironment({ PATH: 'public-path', HOME: 'public-home', BUZZ_PRIVATE_KEY: 'synthetic', ANTHROPIC_BASE_URL: 'bad', NODE_OPTIONS: '--import bad', CLAUDE_CONFIG_DIR: 'bad', ANTHROPIC_API_KEY: 'synthetic' });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CODE_DISABLE_AUTO_MEMORY', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'DISABLE_AUTOUPDATER', 'DISABLE_TELEMETRY', 'ENABLE_CLAUDEAI_MCP_SERVERS', 'HOME', 'PATH'].sort());
  assert.equal(env.ENABLE_CLAUDEAI_MCP_SERVERS, 'false');
});
test('workspace reads and create-only drafts preserve bytes and reject escape, foreign purpose and hidden types', () => {
  const f = fixture(); const b = f.load();
  const args = { path: 'draft.md', text: '안전한 초안\n', purpose: 'work_draft', jobRef: f.raw.jobRef };
  assert.equal(callWorkspaceTool(b, 'workspace_write_text', args).accepted, false);
  assert.equal(callWorkspaceTool(b, 'workspace_read_text', { path: 'draft.md' }).text, args.text);
  assert.throws(() => callWorkspaceTool(b, 'workspace_write_text', { ...args, text: 'overwrite' }));
  assert.equal(fs.readFileSync(path.join(f.jobRoot, 'draft.md'), 'utf8'), args.text);
  for (const p of ['../outside.md', 'a/../../outside.md', '.env', 'secret.json:stream', 'CON.txt', 'bad.py', '/absolute.md', 'a\\b.md', 'a./x.md']) assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: p }));
  assert.throws(() => callWorkspaceTool(b, 'workspace_write_text', { ...args, path: 'other.md', purpose: 'canon' }), /WRITE_PURPOSE/);
  assert.throws(() => callWorkspaceTool(b, 'workspace_write_text', { ...args, path: 'other.md', jobRef: 'foreign' }), /WRITE_PURPOSE/);
  assert.equal(fs.existsSync(path.join(f.jobRoot, 'other.md')), false);
  assert.throws(() => callWorkspaceTool(b, 'workspace_write_text', { ...args, path: 'large.md', text: 'a'.repeat(65537) }), /WRITE_CONTENT/);
  fs.writeFileSync(path.join(f.jobRoot, 'large.md'), 'a'.repeat(65537));
  assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: 'large.md' }), /INPUT_NOT_BOUND/);
});
test('junction, hardlink and replaced current root fail before content read or write', () => {
  const f = fixture(); f.raw.inputFiles = [{ path: 'hard.md', sha256: '0'.repeat(64) }]; f.pin(); const b = f.load(); const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.md'), 'synthetic private sentinel');
  fs.symlinkSync(outside, path.join(f.jobRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: 'linked/secret.md' }), /LINK_PATH/);
  fs.linkSync(path.join(outside, 'secret.md'), path.join(f.jobRoot, 'hard.md'));
  assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: 'hard.md' }), /UNSAFE_FILE/);
  fs.renameSync(f.jobRoot, `${f.jobRoot}-old`); fs.mkdirSync(f.jobRoot);
  assert.throws(() => callWorkspaceTool(b, 'workspace_list', {}), /ROOT_CHANGED/);
});
test('readable input bytes must match the current trusted input packet projection', () => {
  const f = fixture(); fs.writeFileSync(path.join(f.jobRoot, 'approved.md'), 'approved synthetic text'); fs.writeFileSync(path.join(f.jobRoot, 'other.md'), 'unapproved synthetic text');
  f.raw.inputFiles = [{ path: 'approved.md', sha256: sha256(Buffer.from('approved synthetic text')) }]; f.pin(); const b = f.load();
  assert.equal(callWorkspaceTool(b, 'workspace_read_text', { path: 'approved.md' }).text, 'approved synthetic text');
  assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: 'other.md' }), /INPUT_NOT_BOUND/);
  assert.deepEqual(callWorkspaceTool(b, 'workspace_list', {}).entries.map(entry => entry.name), ['approved.md']);
  fs.writeFileSync(path.join(f.jobRoot, 'approved.md'), 'changed synthetic text');
  assert.throws(() => callWorkspaceTool(b, 'workspace_read_text', { path: 'approved.md' }), /INPUT_BYTES_CHANGED/);
});
test('bounded admitted input read and restart do not adopt leftover drafts', () => {
  const f = fixture(); const b = f.load();
  callWorkspaceTool(b, 'workspace_write_text', { path: 'draft.md', text: 'draft', purpose: 'work_draft', jobRef: f.raw.jobRef });
  const reopened = f.load(); assert.throws(() => callWorkspaceTool(reopened, 'workspace_read_text', { path: 'draft.md' }), /INPUT_NOT_BOUND/);
  const bytes = Buffer.alloc(65537, 97); fs.writeFileSync(path.join(f.jobRoot, 'large.md'), bytes);
  f.raw.inputFiles = [{ path: 'large.md', sha256: sha256(bytes) }]; f.pin();
  assert.throws(() => callWorkspaceTool(f.load(), 'workspace_read_text', { path: 'large.md' }), /FILE_TOO_LARGE/);
});
test('allowlist independently filters actual tool execution', () => {
  const f = fixture({ tools: ['workspace_list'] }); const b = f.load();
  assert.throws(() => callWorkspaceTool(b, 'workspace_write_text', {}), /TOOL_DENIED/);
  assert.throws(() => callWorkspaceTool(b, 'Bash', {}), /TOOL_DENIED/);
  assert.deepEqual(callWorkspaceTool(b, 'workspace_list', {}), { entries: [] });
});
test('current instruction revocation stops tool execution without repinning', () => {
  const f = fixture(); const b = f.load(); fs.appendFileSync(f.raw.instructions.path, '\nchanged');
  assert.throws(() => callWorkspaceTool(b, 'workspace_list', {}), /FILE_CHANGED/);
});
test('unsupported native CLI fails before user input or main child launch', async () => {
  const f = fixture(); f.raw.cliPath = process.execPath; f.raw.cliSha256 = f.raw.nodeSha256; f.pin();
  const agent = createClaudeAcp(f.load(), () => {});
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 }); const s = await agent.dispatch('session/new', {});
    await assert.rejects(agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'must not run' }] }), /CLI_CAPABILITY_UNSUPPORTED/);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'child-argv.json')), false);
  } finally { agent.close(); }
});
test('real child gets protected argv/cwd and persistent in-memory ACP turns', async () => {
  const f = fixture(); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    const session = await agent.dispatch('session/new', { cwd: 'untrusted-client-home', mcpServers: [], _meta: { systemPrompt: 'untrusted profile override' } });
    for (let i = 0; i < 2; i++) assert.equal((await agent.dispatch('session/prompt', { sessionId: session.sessionId, prompt: [{ type: 'text', text: 'synthetic task' }] })).stopReason, 'end_turn');
    const captured = JSON.parse(fs.readFileSync(path.join(f.jobRoot, 'child-argv.json')));
    assert.equal(captured.cwd, f.jobRoot); assert.equal(captured.args[captured.args.indexOf('--system-prompt') + 1], 'synthetic instructions');
    assert.equal(captured.args[captured.args.indexOf('--tools') + 1], ''); assert.equal(captured.inheritedBuzz, null);
    assert.equal(captured.inheritedNode, null); assert.equal(captured.inheritedProvider, null); assert.equal(messages.length, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.jobRoot, 'received-controls.json'))), ['initialize', 'mcp_status', 'get_context_usage', 'mcp_status', 'get_context_usage']);
  } finally { agent.close(); }
});
for (const mode of ['BAD_TOOLS', 'NO_INIT']) test(`runtime ${mode} cannot report a successful verified turn`, async () => {
  const f = fixture({ mode }); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 }); const s = await agent.dispatch('session/new', { mcpServers: [] });
    await assert.rejects(agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'test' }] }), /CLI_MCP_INVENTORY_MISMATCH|CLI_INIT_CONTEXT/);
    assert.equal(messages.length, 0);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
  } finally { agent.close(); }
});
test('whole assistant frame is checked before a text block preceding Bash can escape', async () => {
  const f = fixture({ mode: 'TEXT_BASH' }); const messages = []; const agent = createClaudeAcp(f.load(), value => messages.push(value));
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 }); const s = await agent.dispatch('session/new', {});
    await assert.rejects(agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'test' }] }), /CLI_TOOL_INVENTORY_MISMATCH/);
    assert.equal(messages.length, 0);
  } finally { agent.close(); }
});
test('metadata preflight completes without sending any user or work prompt', async () => {
  const f = fixture(); const agent = createClaudeAcp(f.load(), () => assert.fail('no assistant output'));
  try {
    const result = await agent.preflight(); assert.equal(result.workPromptsSent, 0);
    assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.jobRoot, 'received-controls.json'))), ['initialize', 'mcp_status', 'get_context_usage']);
  } finally { agent.close(); }
});
test('standalone preflight CLI reports metadata only and preserves installed executable hardlinks', () => {
  const f = fixture(); const linked = path.join(f.root, process.platform === 'win32' ? 'pinned-cli.exe' : 'pinned-cli');
  fs.copyFileSync(f.raw.cliPath, linked); if (process.platform !== 'win32') fs.chmodSync(linked, 0o700);
  fs.linkSync(linked, `${linked}.alias`); f.raw.cliPath = linked; f.pin();
  const cli = fileURLToPath(new URL('../src/claude_acp_cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--preflight', '--binding', f.bindingPath, '--binding-sha256', sha256(fs.readFileSync(f.bindingPath))], { encoding: 'utf8', env: childEnvironment(), windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
  assert.equal(report.phase, 'METADATA_ONLY'); assert.equal(report.workPromptsSent, 0);
  assert.equal(fs.existsSync(path.join(f.jobRoot, 'received-user-count.txt')), false);
  assert.equal(fs.lstatSync(linked).nlink, 2);
});
test('installer hardlink exception cannot be selected for general files or a forged binding', () => {
  const f = fixture(); const b = f.load(); const input = path.join(f.jobRoot, 'input.md');
  fs.writeFileSync(input, 'synthetic input'); fs.linkSync(input, `${input}.alias`);
  const digest = sha256(fs.readFileSync(input));
  assert.throws(() => readPinnedFile(input, digest, 65536, 'pinned_runtime'), /UNSAFE_FILE/);
  assert.throws(() => regularPath(input, 'pinned_runtime'), /PATH_KIND/);
  assert.throws(() => verifyCurrentCli({ ...b, cliPath: input, cliSha256: digest }), /BINDING_REQUIRED/);
});
test('client cannot widen scope, resume another session, switch models or run slash commands', async () => {
  const f = fixture(); const agent = createClaudeAcp(f.load(), () => {});
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 });
    await assert.rejects(agent.dispatch('session/new', { mcpServers: [{ name: 'foreign' }] }), /CLIENT_SCOPE_OVERRIDE/);
    await assert.rejects(agent.dispatch('session/new', { _meta: { claudeCode: { options: { tools: ['Bash'] } } } }), /CLIENT_SCOPE_OVERRIDE/);
    const s = await agent.dispatch('session/new', {});
    await assert.rejects(agent.dispatch('session/set_model', { sessionId: s.sessionId, modelId: 'foreign' }), /ACP_METHOD_UNSUPPORTED/);
    await assert.rejects(agent.dispatch('session/load', { sessionId: 'foreign' }), /SESSION_UNKNOWN/);
    await assert.rejects(agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: '/model foreign' }] }), /PROMPT_LIMIT_OR_COMMAND/);
  } finally { agent.close(); }
});
test('one in-flight turn and cancellation closes its process without automatic replay', async () => {
  const f = fixture({ mode: 'WAIT' }); const agent = createClaudeAcp(f.load(), () => {});
  try {
    await agent.dispatch('initialize', { protocolVersion: 1 }); const s = await agent.dispatch('session/new', {});
    const pending = agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'wait' }] });
    await assert.rejects(agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'parallel denied' }] }), /TURN_BUSY/);
    for (let i = 0; i < 100 && !fs.existsSync(path.join(f.jobRoot, 'child-argv.json')); i++) await new Promise(resolve => setTimeout(resolve, 20));
    await agent.dispatch('session/cancel', { sessionId: s.sessionId });
    const cancelled = await pending;
    assert.equal(cancelled.stopReason, 'cancelled'); assert.equal(cancelled._meta.failure_meta.code, 'TURN_CANCELLED');
    assert.equal(cancelled._meta.failure_meta.directChildClosed, true);
    assert.deepEqual(await agent.dispatch('session/prompt', { sessionId: s.sessionId, prompt: [{ type: 'text', text: 'no replay' }] }), cancelled);
  } finally { agent.close(); }
});
test('bounded JSON lines handles split UTF8 and rejects oversized or truncated frames', () => {
  const input = new PassThrough(); const messages = []; const errors = [];
  readJsonLines(input, x => messages.push(x), x => errors.push(x));
  const bytes = Buffer.from('{"text":"한글"}\n'); input.write(bytes.subarray(0, 11)); input.write(bytes.subarray(11));
  assert.deepEqual(messages, [{ text: '한글' }]); input.write('x'.repeat(1024 * 1024 + 1)); assert.deepEqual(errors, ['PROTOCOL_FRAME']); input.destroy();
});
test('standalone MCP actual child exposes only the scoped tools and refuses outside access', async () => {
  const f = fixture({ tools: ['workspace_read_text'] });
  const cli = fileURLToPath(new URL('../src/claude_acp_cli.mjs', import.meta.url));
  const child = spawn(process.execPath, [cli, '--workspace-mcp', '--binding', f.bindingPath, '--binding-sha256', f.hash], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: childEnvironment() });
  const messages = []; const output = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP timeout')), 15000);
    readJsonLines(child.stdout, x => { messages.push(x); if (messages.length === 3) { clearTimeout(timer); resolve(); } }, reject);
  });
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workspace_read_text', arguments: { path: '../outside.md' } } })}\n`);
    await output;
    assert.deepEqual(messages.find(x => x.id === 2).result.tools.map(x => x.name), ['workspace_read_text']);
    assert.equal(messages.find(x => x.id === 3).result.isError, true);
  } finally { child.stdin.end(); await once(child, 'close'); }
});
