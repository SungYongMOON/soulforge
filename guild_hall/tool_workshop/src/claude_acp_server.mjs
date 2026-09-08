import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertCurrent, launchSpec, REQUIRED_FLAGS, verifyCurrentCli, refuse } from './claude_acp_policy.mjs';

const FRAME_LIMIT = 1024 * 1024;
const CLOSE_WAIT_MS = 2000;
const TERMINAL_FAILURES = new Set(['CLI_TURN_FAILED', 'CLI_CLOSED', 'CLI_SPAWN', 'CLI_STDIN', 'CLI_CONTROL_TIMEOUT', 'CLI_OUTPUT_LIMIT', 'CLI_PROBE_TIMEOUT', 'CLI_PROBE_LIMIT', 'CLI_PROBE_SPAWN', 'CLI_FRAME', 'CLI_CONTROL_RESPONSE', 'CLI_CONTROL_UNSUPPORTED', 'CLI_UNVERIFIED_RESULT', 'CLI_UNVERIFIED_OUTPUT', 'CLI_EARLY_INIT', 'CLI_CONTENT_UNSUPPORTED', 'CLI_PREFLIGHT_REQUIRED', 'PROTOCOL_FRAME', 'PROTOCOL_TRUNCATED', 'PROTOCOL_IO', 'TURN_TIMEOUT', 'TURN_CANCELLED', 'AUTH_REQUIRED', 'AUTH_STATE_UNAVAILABLE', 'PRIOR_CHILD_CLOSE_UNCONFIRMED']);
function nativeFailure(frame) {
  // Inspect typed fields only. Never parse errors[], stderr or human prose for causes.
  const subtypes = ['error_during_execution', 'error_max_turns', 'error_max_budget_usd', 'error_max_structured_output_retries'];
  const codes = ['authentication_failed', 'billing_error', 'rate_limit', 'invalid_request', 'server_error', 'max_output_tokens', 'unknown'];
  const nativeSubtype = subtypes.includes(frame.subtype) ? frame.subtype : null;
  const nativeCode = codes.includes(frame.error) ? frame.error : null;
  const classes = new Map([['authentication_failed', 'authentication'], ['billing_error', 'billing'], ['rate_limit', 'rate_limit'], ['invalid_request', 'request'], ['server_error', 'server'], ['max_output_tokens', 'output_limit'], ['error_max_turns', 'turn_limit'], ['error_max_budget_usd', 'budget_limit'], ['error_max_structured_output_retries', 'structured_output_limit']]);
  return { nativeSubtype, nativeCode, classification: classes.get(nativeCode) ?? classes.get(nativeSubtype) ?? 'unknown' };
}
export function readJsonLines(stream, onMessage, onError) {
  let buffered = Buffer.alloc(0); let failed = false;
  stream.on('data', chunk => {
    if (failed) return;
    try {
      buffered = Buffer.concat([buffered, Buffer.from(chunk)]);
      for (;;) {
        const end = buffered.indexOf(10);
        if (end < 0) break;
        if (end > FRAME_LIMIT) refuse('FRAME_TOO_LARGE');
        const line = buffered.subarray(0, end); buffered = buffered.subarray(end + 1);
        if (line.length) onMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)));
      }
      if (buffered.length > FRAME_LIMIT) refuse('FRAME_TOO_LARGE');
    } catch { failed = true; onError('PROTOCOL_FRAME'); }
  });
  stream.on('end', () => { if (!failed && buffered.length) onError('PROTOCOL_TRUNCATED'); });
  stream.on('error', () => onError('PROTOCOL_IO'));
}
function helpProbe(spec, observe = child => child) {
  return new Promise((resolve, reject) => {
    const child = observe(spawn(spec.command, ['--help'], { cwd: spec.cwd, env: spec.env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] }));
    let output = ''; let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); reject(new Error('CLI_PROBE_TIMEOUT')); }, 15000);
    child.stdout.on('data', chunk => { output += chunk; if (Buffer.byteLength(output) > FRAME_LIMIT) { failed = true; child.kill(); clearTimeout(timer); reject(new Error('CLI_PROBE_LIMIT')); } });
    child.on('error', () => { clearTimeout(timer); reject(new Error('CLI_PROBE_SPAWN')); });
    child.on('close', code => {
      clearTimeout(timer); if (failed) return;
      if (code !== 0 || REQUIRED_FLAGS.some(flag => !output.includes(flag))) reject(new Error('CLI_CAPABILITY_UNSUPPORTED'));
      else resolve();
    });
  });
}
function authProbe(spec, observe) {
  return new Promise(resolve => {
    const child = observe(spawn(spec.command, ['auth', 'status', '--json'], { cwd: spec.cwd, env: spec.env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }));
    let output = Buffer.alloc(0); let settled = false;
    const finish = (classification, loggedIn = null, authMethod = null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); output = Buffer.alloc(0);
      resolve({ classification, loggedIn, authMethod });
    };
    const timer = setTimeout(() => { child.kill(); finish('timeout'); }, 15000);
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      if (settled) return;
      if (output.length + chunk.length > 16 * 1024) { child.kill(); finish('output_limit'); return; }
      output = Buffer.concat([output, chunk]);
    });
    child.stdout.on('error', () => { child.kill(); finish('io'); });
    child.on('error', () => finish('spawn'));
    child.on('close', code => {
      if (settled) return;
      try {
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output));
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.loggedIn !== 'boolean' || !['claude.ai', 'api_key', 'none'].includes(value.authMethod)) { finish('shape'); return; }
        if (value.loggedIn && code === 0 && value.authMethod !== 'none') finish('authenticated', true, value.authMethod);
        else if (!value.loggedIn && [0, 1].includes(code) && value.authMethod === 'none') finish('not_authenticated', false, 'none');
        else finish('inconsistent');
      } catch { finish('shape'); }
    });
  });
}

// Each ACP session owns one in-memory Claude process. No resume, shared history or disk transcript.
export function createClaudeAcp(binding, send) {
  const sessions = new Map(); let initialized = false; let active = false; let probePassed = false; let closed = false;
  const fixedModel = () => ({
    models: { currentModelId: binding.model, availableModels: [{ modelId: binding.model, name: binding.model }] },
    configOptions: [{ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: binding.model, options: [{ value: binding.model, name: binding.model }] }],
  });
  const sendUpdate = (id, text) => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: id, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } });
  function observeChild(session, child) {
    const closure = new Promise(resolve => child.once('close', () => { session.children.delete(child); if (session.child === child) session.child = null; resolve(); }));
    session.children.set(child, closure);
    return child;
  }
  const failSession = (session, code, details) => {
    session.failed = true;
    session.failureError ??= Object.assign(new Error(code), { code, details });
    for (const child of session.children.keys()) { try { child.kill(); } catch { /* Closure remains unconfirmed. */ } }
    if (session.pending) { clearTimeout(session.pending.timer); session.pending.reject(session.failureError); session.pending = null; }
    for (const pending of session.controls?.values() ?? []) { clearTimeout(pending.timer); pending.reject(session.failureError); }
    session.controls?.clear();
  };
  async function awaitClosure(session) {
    let timer;
    try { await Promise.race([Promise.all(session.children.values()), new Promise(resolve => { timer = setTimeout(resolve, CLOSE_WAIT_MS); })]); }
    finally { clearTimeout(timer); }
    return session.children.size === 0;
  }
  async function terminalFailure(session, error) {
    error = session.failureError ?? error;
    const code = error.code ?? error.message;
    failSession(session, code, error.details);
    const directChildClosed = await awaitClosure(session) && !(code === 'PRIOR_CHILD_CLOSE_UNCONFIRMED' && [...sessions.values()].some(other => other.children.size));
    if (!TERMINAL_FAILURES.has(code)) throw error;
    const cancelled = code === 'TURN_CANCELLED';
    session.terminal ??= { stopReason: cancelled ? 'cancelled' : 'end_turn', _meta: { source: 'scoped_adapter_terminal', accepted: false, ...(session.auth ? { auth: session.auth } : {}), failure_meta: {
      status: cancelled ? 'cancelled' : 'failed', code, retryable: false, directChildClosed,
      nativeSubtype: error.details?.nativeSubtype ?? null, nativeCode: error.details?.nativeCode ?? null,
      classification: error.details?.classification ?? 'adapter',
    } } };
    // Buzz parses end_turn as a terminal transport result and does not requeue it.
    // This explicit failure notice is necessary because Buzz ignores custom _meta.
    if (!cancelled && !session.noticeSent) {
      session.noticeSent = true;
      const detail = error.details?.nativeCode ?? error.details?.nativeSubtype;
      sendUpdate(session.id, `Claude 작업을 완료하지 못했습니다 (${code}${detail ? `: ${detail}` : ''}). 이 요청은 자동 재시도하지 않습니다. 결과물 완료 또는 수락을 의미하지 않습니다.`);
    }
    return session.terminal;
  }
  function control(session, request) {
    if (!session.child || session.failed) refuse('SESSION_CLOSED');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      session.controls.set(id, { resolve, reject, timer: setTimeout(() => failSession(session, 'CLI_CONTROL_TIMEOUT'), 5000) });
      session.child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: id, request })}\n`);
    });
  }
  async function verifyMetadata(session, first = false) {
    verifyCurrentCli(binding);
    if (first) {
      const init = await control(session, { subtype: 'initialize', hooks: {}, sdkMcpServers: [], agents: {}, skills: [] });
      if (!Array.isArray(init.commands) || init.commands.length !== 0 || init.current_permission_mode !== 'default') refuse('CLI_INIT_CONTEXT');
    }
    const expected = new Set(binding.tools);
    let status;
    for (let attempt = 0; attempt < 20; attempt++) {
      status = await control(session, { subtype: 'mcp_status' });
      if (!Array.isArray(status.mcpServers) || status.mcpServers.length !== 1 || status.mcpServers[0].name !== 'soulforge_workspace') refuse('CLI_MCP_INVENTORY_MISMATCH');
      if (status.mcpServers[0].status !== 'pending') break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const server = status.mcpServers[0];
    if (server.status !== 'connected' || !Array.isArray(server.tools) || server.tools.length !== expected.size || server.tools.some(tool => !expected.has(tool.name)) || new Set(server.tools.map(tool => tool.name)).size !== expected.size) refuse('CLI_MCP_INVENTORY_MISMATCH');
    const context = await control(session, { subtype: 'get_context_usage' });
    const fullNames = new Set(binding.tools.map(name => `mcp__soulforge_workspace__${name}`));
    if (context.model !== binding.model || !Array.isArray(context.memoryFiles) || context.memoryFiles.length || !Array.isArray(context.agents) || context.agents.length || !Array.isArray(context.mcpTools) || context.mcpTools.length !== fullNames.size || context.mcpTools.some(tool => tool.serverName !== 'soulforge_workspace' || !fullNames.has(tool.name)) || new Set(context.mcpTools.map(tool => tool.name)).size !== fullNames.size) refuse('CLI_CONTEXT_INVENTORY_MISMATCH');
    // CLI 2.1.226 exposes MCP/model/memory before a prompt, but not systemTools.
    // Enforce the fixed --tools argument separately; never invent a pre-prompt builtin readback.
    for (const field of ['systemTools', 'deferredBuiltinTools']) if (context[field] !== undefined && (!Array.isArray(context[field]) || context[field].some(tool => tool.name !== 'EndConversation'))) refuse('CLI_BUILTIN_INVENTORY_MISMATCH');
    if ((context.skills?.totalSkills ?? 0) !== 0 || (context.slashCommands?.totalCommands ?? 0) !== 0) refuse('CLI_CONTEXT_INVENTORY_MISMATCH');
    assertCurrent(binding);
    session.preflight = { model: context.model, mcpTools: [...fullNames], memoryFileCount: 0, builtinInventoryObserved: Array.isArray(context.systemTools), workPromptsSent: 0 };
    return session.preflight;
  }
  function handleFrame(session, frame) {
    if (session.failed) return;
    try {
      assertCurrent(binding);
      if (!frame || typeof frame !== 'object') refuse('CLI_FRAME');
      if (frame.type === 'control_response') {
        const response = frame.response;
        const pending = session.controls.get(response?.request_id);
        if (!pending || response.subtype !== 'success' || !response.response || typeof response.response !== 'object' || Array.isArray(response.response)) refuse('CLI_CONTROL_RESPONSE');
        session.controls.delete(response.request_id); clearTimeout(pending.timer); pending.resolve(response.response); return;
      }
      if (frame.type === 'system' && frame.subtype === 'init') {
        const expected = new Set(binding.tools.map(name => `mcp__soulforge_workspace__${name}`));
        const names = frame.tools;
        if (!Array.isArray(names) || new Set(names).size !== names.length || names.some(name => name !== 'EndConversation' && !expected.has(name)) || [...expected].some(name => !names.includes(name))) refuse('CLI_TOOL_INVENTORY_MISMATCH');
        if (frame.cwd !== binding.jobRoot || frame.model !== binding.model || !Array.isArray(frame.mcp_servers) || frame.mcp_servers.length !== 1 || frame.mcp_servers[0].name !== 'soulforge_workspace' || frame.mcp_servers[0].status !== 'connected') refuse('CLI_RUNTIME_MISMATCH');
        if (!session.preflight) refuse('CLI_EARLY_INIT');
        session.observed = true; return;
      }
      if (frame.type === 'control_request') {
        // Never let a CLI permission request turn the host into a broad permission approver.
        if (frame.request?.subtype !== 'can_use_tool' || typeof frame.request_id !== 'string') refuse('CLI_CONTROL_UNSUPPORTED');
        session.child.stdin.write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: frame.request_id, response: { behavior: 'deny', message: 'This harness grants only the fixed workspace tool contract.' } } })}\n`);
        return;
      }
      if (frame.type === 'assistant') {
        if (!session.observed || !session.pending) refuse('CLI_UNVERIFIED_OUTPUT');
        if (!Array.isArray(frame.message?.content)) refuse('CLI_FRAME');
        let frameBytes = 0;
        for (const block of frame.message.content) {
          if (!block || typeof block !== 'object') refuse('CLI_FRAME');
          if (block.type === 'text') {
            if (typeof block.text !== 'string') refuse('CLI_FRAME');
            frameBytes += Buffer.byteLength(block.text);
          } else if (block.type === 'tool_use') {
            if (!binding.tools.some(name => block.name === `mcp__soulforge_workspace__${name}`) && block.name !== 'EndConversation') refuse('CLI_TOOL_INVENTORY_MISMATCH');
          } else if (!['thinking', 'redacted_thinking'].includes(block.type)) refuse('CLI_CONTENT_UNSUPPORTED');
        }
        if (frame.error !== undefined) { failSession(session, 'CLI_TURN_FAILED', nativeFailure(frame)); return; }
        if (session.pending.outputBytes + frameBytes > 256 * 1024) refuse('CLI_OUTPUT_LIMIT');
        session.pending.outputBytes += frameBytes;
        for (const block of frame.message.content) if (block.type === 'text') sendUpdate(session.id, block.text);
        return;
      }
      if (frame.type === 'result') {
        if (!session.pending || !session.preflight) refuse('CLI_UNVERIFIED_RESULT');
        if (frame.is_error || frame.subtype !== 'success') { failSession(session, 'CLI_TURN_FAILED', nativeFailure(frame)); return; }
        if (!session.observed) refuse('CLI_UNVERIFIED_RESULT');
        const pending = session.pending; session.pending = null; clearTimeout(pending.timer);
        pending.resolve({ stopReason: 'end_turn', _meta: { source: 'claude_cli_observed', effectiveCwd: binding.jobRoot, tools: binding.tools, model: binding.model, accepted: false, auth: session.auth } });
      }
    } catch (error) { failSession(session, error.code ?? error.message ?? 'CLI_PROTOCOL'); }
  }
  async function start(session, spec = launchSpec(binding)) {
    if (!probePassed) { await helpProbe(spec, child => observeChild(session, child)); probePassed = true; }
    assertCurrent(binding);
    verifyCurrentCli(binding);
    if (closed || session.failed) refuse('SESSION_CLOSED');
    const child = observeChild(session, spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }));
    session.child = child;
    child.stdin.on('error', () => failSession(session, 'CLI_STDIN'));
    // Diagnostics may contain source text or auth data. Drain without forwarding or recording.
    child.stderr.on('data', () => {});
    child.on('error', () => failSession(session, 'CLI_SPAWN'));
    child.on('close', () => { if (!session.failed) failSession(session, 'CLI_CLOSED'); });
    readJsonLines(child.stdout, frame => handleFrame(session, frame), code => failSession(session, code));
    try { return await verifyMetadata(session, true); }
    catch (error) { failSession(session, error.code ?? error.message); throw error; }
  }
  async function dispatch(method, params = {}) {
    if (closed) refuse('SESSION_CLOSED');
    assertCurrent(binding);
    if (method === 'initialize') {
      // ACP negotiation returns our latest supported version for newer clients.
      if (initialized || !Number.isSafeInteger(params?.protocolVersion) || params.protocolVersion < 1) refuse('ACP_VERSION');
      initialized = true;
      return { protocolVersion: 1, agentInfo: { name: 'soulforge-scoped-claude', version: '0.1.0' }, agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcpCapabilities: { http: false, sse: false } }, authMethods: [], _meta: { requestedProtocolVersion: params.protocolVersion, authority: 'fixed_binding', configured: true, runtimeObserved: false } };
    }
    if (!initialized) refuse('ACP_NOT_INITIALIZED');
    if (method === 'session/new') {
      if (sessions.size >= 8) refuse('SESSION_LIMIT');
      if (['mcpServers', 'additionalDirectories'].some(key => params[key] !== undefined && (!Array.isArray(params[key]) || params[key].length !== 0)) || params._meta?.claudeCode || params._meta?.additionalRoots) refuse('CLIENT_SCOPE_OVERRIDE');
      // Buzz's default home cwd and display/system-prompt metadata are not authority.
      const id = randomUUID(); sessions.set(id, { id, child: null, children: new Map(), observed: false, failed: false, pending: null, controls: new Map() });
      return { sessionId: id, ...fixedModel(), _meta: { effectiveCwd: binding.jobRoot, configuredTools: binding.tools, runtimeObserved: false } };
    }
    const session = sessions.get(params.sessionId);
    if (!session) refuse('SESSION_UNKNOWN');
    if (method === 'session/cancel') { if (!session.failed) failSession(session, 'TURN_CANCELLED'); await awaitClosure(session); return {}; }
    // Buzz reasserts the configured model after session/new. Acknowledge only
    // the pinned value without forwarding any configuration or authority change.
    if (method === 'session/set_model') {
      if (params.modelId !== binding.model || Object.keys(params).some(key => !['sessionId', 'modelId'].includes(key))) refuse('ACP_METHOD_UNSUPPORTED');
      return fixedModel();
    }
    if (method === 'session/set_config_option') {
      if (params.configId !== 'model' || params.value !== binding.model || Object.keys(params).some(key => !['sessionId', 'configId', 'value'].includes(key))) refuse('ACP_METHOD_UNSUPPORTED');
      return fixedModel();
    }
    if (method !== 'session/prompt') refuse('ACP_METHOD_UNSUPPORTED');
    if (!Array.isArray(params.prompt) || !params.prompt.length || params.prompt.length > 16 || params.prompt.some(block => !block || block.type !== 'text' || typeof block.text !== 'string' || Object.keys(block).some(key => !['type', 'text', 'annotations'].includes(key)))) refuse('PROMPT_TYPE');
    const text = params.prompt.map(block => block.text).join('\n');
    if (Buffer.byteLength(text) > 128 * 1024 || text.trimStart().startsWith('/')) refuse('PROMPT_LIMIT_OR_COMMAND');
    if (session.terminal) return session.terminal;
    if (active) refuse('TURN_BUSY');
    active = true;
    try {
      if (session.failed) throw session.failureError;
      if ([...sessions.values()].some(other => other.failed && other.children.size)) refuse('PRIOR_CHILD_CLOSE_UNCONFIRMED');
      const currentSpec = launchSpec(binding);
      // Retain the exact launch environment for this in-memory native session.
      const spec = session.launch ??= currentSpec;
      if (!probePassed) { await helpProbe(spec, child => observeChild(session, child)); probePassed = true; }
      if (closed || session.failed) throw session.failureError ?? new Error('SESSION_CLOSED');
      const auth = await authProbe(spec, child => observeChild(session, child));
      const checkedAt = Date.now();
      session.auth = { ...auth, source: 'claude_cli_auth_status', checkedAt, expiresAt: Math.min(checkedAt + 30000, binding.expiresAt), cliSha256: binding.cliSha256, bindingSha256: binding.bindingSha256, sourceHashes: binding.sourceHashes };
      launchSpec(binding); // Recheck current binding, runtime and all source bytes after the probe.
      if (closed || session.failed) throw session.failureError ?? new Error('SESSION_CLOSED');
      if (auth.loggedIn === false) refuse('AUTH_REQUIRED');
      if (auth.loggedIn !== true) refuse('AUTH_STATE_UNAVAILABLE');
      if (!session.child) await start(session, spec);
      else {
        try { await verifyMetadata(session); }
        catch (error) { failSession(session, error.code ?? error.message); throw error; }
      }
      if (!session.preflight || session.failed || !session.child) refuse('CLI_PREFLIGHT_REQUIRED');
      if (session.auth.expiresAt <= Date.now()) refuse('AUTH_STATE_UNAVAILABLE');
      return await new Promise((resolve, reject) => {
        session.pending = { resolve, reject, outputBytes: 0, timer: setTimeout(() => failSession(session, 'TURN_TIMEOUT'), 120000) };
        session.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })}\n`);
      });
    } catch (error) { return await terminalFailure(session, error); }
    finally { active = false; }
  }
  return { dispatch,
    async preflight() {
      if (initialized || sessions.size || active || closed) refuse('PREFLIGHT_STATE');
      initialized = true; active = true;
      const id = randomUUID(); const session = { id, child: null, children: new Map(), observed: false, failed: false, pending: null, controls: new Map() }; sessions.set(id, session);
      try { return await start(session); } finally { failSession(session, 'PREFLIGHT_FINISHED'); await awaitClosure(session); active = false; }
    },
    close() { closed = true; for (const session of sessions.values()) failSession(session, 'SESSION_CLOSED'); } };
}
