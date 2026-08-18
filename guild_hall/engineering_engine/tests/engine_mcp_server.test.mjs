import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stageSyntheticProject } from '../fixtures/engine_mcp_synthetic_project.mjs';

const SERVER = fileURLToPath(new URL('../mcp/engine_mcp_server.mjs', import.meta.url));
const PROTOCOL_VERSION = '2025-06-18';
const ENGINE_VERSION = readFileSync(
  fileURLToPath(new URL('../topology/ENGINE_VERSION', import.meta.url)), 'utf8').trim();

function stage() {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_server_'));
  return { root, staged: stageSyntheticProject(root) };
}

/**
 * Drives the real process over stdio: writes every request, closes stdin, reads the replies.
 *
 * The claim being tested is "a client can talk to this", so the test talks to it the way a client
 * would rather than calling the handler in-process.
 */
function runServer({ root, profilePath, env = {}, requests = [] }) {
  return new Promise((settle, reject) => {
    const child = spawn(process.execPath,
      [SERVER, '--profile', profilePath, '--repo-root', root],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      const responses = stdout.split('\n').filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
      settle({ status, stdout, stderr, responses });
    });
    for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();
  });
}

const ON = { SOULFORGE_ENGINE_MCP: 'on' };
const OFF_WRITE = { SOULFORGE_ENGINE_MCP_WRITE: '' };

test('the door is shut unless the feature flag says otherwise', async () => {
  const { root, staged } = stage();
  try {
    const shut = await runServer({
      root,
      profilePath: staged.profile_path,
      env: { SOULFORGE_ENGINE_MCP: '', ...OFF_WRITE },
      requests: [{ jsonrpc: '2.0', id: 1, method: 'ping' }],
    });
    assert.equal(shut.status, 3);
    assert.equal(shut.responses.length, 0);
    assert.equal(shut.stderr.trim().split('\n').length, 1);
    assert.match(shut.stderr, /SOULFORGE_ENGINE_MCP=on/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a profile it cannot accept stops the process rather than starting a half-bound door', async () => {
  const { root, staged } = stage();
  try {
    const refused = await runServer({
      root,
      profilePath: join(staged.outputs_root, 'no_such_profile.json'),
      env: { ...ON, ...OFF_WRITE },
      requests: [{ jsonrpc: '2.0', id: 1, method: 'ping' }],
    });
    assert.equal(refused.status, 4);
    assert.match(refused.stderr, /profile refused/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('initialize, initialized, ping and tools/list speak JSON-RPC 2.0 and carry the engine version', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'test-client', version: '0' },
          },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
        { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        { jsonrpc: '2.0', id: 4, method: 'no/such/method' },
      ],
    });
    assert.equal(session.status, 0, session.stderr);
    // Four replies, not five: a notification is answered with silence.
    assert.equal(session.responses.length, 4);
    assert.deepEqual(session.responses.map((row) => row.id), [1, 2, 3, 4]);
    for (const row of session.responses) assert.equal(row.jsonrpc, '2.0');

    const initialize = session.responses[0].result;
    assert.equal(initialize.protocolVersion, PROTOCOL_VERSION);
    assert.equal(initialize.serverInfo.engine_version, ENGINE_VERSION);
    assert.equal(initialize.serverInfo.version, ENGINE_VERSION);
    assert.equal(initialize.capabilities.tools.listChanged, false);
    assert.equal(initialize._meta.write_tools_enabled, false);

    assert.equal(session.responses[1].result._meta.initialised, true);

    const list = session.responses[2].result;
    assert.equal(list.tools.length, 13);
    assert.equal(list._meta.engine_version, ENGINE_VERSION);
    const byName = new Map(list.tools.map((tool) => [tool.name, tool]));
    assert.equal(byName.get('rules_stage').annotations.readOnlyHint, true);
    // Write tools stay listed even while they are off: hiding them would make "off" look like
    // "absent", and a caller cannot ask for something it is never told exists.
    assert.equal(byName.get('judge_run').annotations.readOnlyHint, false);
    for (const tool of list.tools) {
      assert.equal(typeof tool.title, 'string');
      assert.equal(tool.inputSchema.type, 'object');
    }

    assert.equal(session.responses[3].error.code, -32601);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tools/call returns markdown content plus structured JSON, and leaves one receipt line per call', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION } },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'rules_stage', arguments: { stage_code: '030_SRR' } },
        },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'observe_status', arguments: {} } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'no_such_tool', arguments: {} } },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'rules_stage', arguments: { stage_code: '999_ZZZ' } },
        },
      ],
    });
    assert.equal(session.status, 0, session.stderr);

    const stageAnswer = session.responses[1].result;
    assert.equal(stageAnswer.content.length, 1);
    assert.equal(stageAnswer.content[0].type, 'text');
    assert.match(stageAnswer.content[0].text, /030_SRR/u);
    assert.equal(stageAnswer.structuredContent.engine_version, ENGINE_VERSION);
    assert.equal(stageAnswer.structuredContent.stage_code, '030_SRR');
    assert.ok(stageAnswer.structuredContent.work_items.length > 0);

    assert.equal(session.responses[3].error.code, -32602);
    assert.equal(session.responses[4].error.code, -32000);
    assert.equal(session.responses[4].error.data.code, 'ENGINE_MCP_STAGE_UNKNOWN');

    const receipts = readFileSync(
      join(staged.receipts_dir, 'mcp_tool_calls.jsonl'), 'utf8')
      .split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
    // One line per call that reached a tool, refusals included. The call naming a tool that does
    // not exist reached none, so it leaves no tool receipt — only a protocol error.
    assert.equal(receipts.length, 3);
    assert.deepEqual(receipts.map((row) => row.tool),
      ['rules_stage', 'observe_status', 'rules_stage']);
    assert.deepEqual(receipts.map((row) => row.status), ['OK', 'OK', 'REFUSED']);
    for (const row of receipts) {
      assert.equal(row.schema_version, 'soulforge.engine_mcp_tool_call_receipt.v0');
      assert.equal(row.engine_version, ENGINE_VERSION);
      assert.equal(typeof row.args_digest, 'string');
      assert.ok(Number.isInteger(row.duration_ms));
      // Metadata only: nothing that could carry a document, a path or an answer.
      for (const forbidden of ['arguments', 'result', 'content', 'structuredContent', 'markdown',
        'file_ref', 'path', 'work_items']) {
        assert.equal(Object.hasOwn(row, forbidden), false, `receipt carries ${forbidden}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a write tool is listed but refused while the write switch is off', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'judge_run',
            arguments: {
              stage_codes: ['030_SRR'],
              known_at: '2026-08-18T15:00:00.000Z',
              revision_label: 'mcp_protocol_test_01',
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'observe_register',
            arguments: {
              file_ref: '030_SRR/031_x/03_Out/a.pdf',
              artifact_type_id: 'semp',
              stage_code: '030_SRR',
            },
          },
        },
      ],
    });
    assert.equal(session.status, 0, session.stderr);
    for (const response of session.responses) {
      assert.equal(response.error.code, -32000);
      assert.equal(response.error.data.code, 'WRITE_TOOLS_DISABLED');
      assert.equal(response.error.data.engine_version, ENGINE_VERSION);
    }
    const receipts = readFileSync(join(staged.receipts_dir, 'mcp_tool_calls.jsonl'), 'utf8')
      .split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
    assert.deepEqual(receipts.map((row) => row.error_code),
      ['WRITE_TOOLS_DISABLED', 'WRITE_TOOLS_DISABLED']);
    assert.deepEqual(receipts.map((row) => row.write_enabled), [false, false]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a malformed line is answered as a parse error and does not stop the session', async () => {
  const { root, staged } = stage();
  try {
    const child = spawn(process.execPath,
      [SERVER, '--profile', staged.profile_path, '--repo-root', root],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...ON, ...OFF_WRITE } });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stdin.write('{not json\n');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' })}\n`);
    child.stdin.end();
    const status = await new Promise((settle) => child.on('close', settle));
    const responses = stdout.split('\n').filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));
    assert.equal(status, 0);
    assert.equal(responses[0].error.code, -32700);
    assert.equal(responses[1].id, 9);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
