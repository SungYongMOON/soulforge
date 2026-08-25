import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  stageSyntheticProject, stageSyntheticRegistry,
} from '../fixtures/engine_mcp_synthetic_project.mjs';

const SERVER = fileURLToPath(new URL('../mcp/engine_mcp_server.mjs', import.meta.url));
const PROTOCOL_VERSION = '2025-06-18';
const ENGINE_VERSION = readFileSync(
  fileURLToPath(new URL('../../../topology/ENGINE_VERSION', import.meta.url)), 'utf8').trim();

const OWNER = JSON.stringify({ principal_ref: 'owner_test', role: 'owner' });
const HW = JSON.stringify({ principal_ref: 'hw_test', role: 'hw' });

function stage() {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_server_'));
  return { root, staged: stageSyntheticProject(root) };
}

function stageRegistry(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'engine_mcp_server_reg_'));
  return { root, staged: stageSyntheticRegistry(root, options) };
}

/**
 * Drives the real process over stdio: writes every request, closes stdin, reads the replies.
 *
 * The claim being tested is "a client can talk to this", so the test talks to it the way a client
 * would rather than calling the handler in-process.
 */
function runServer({ root, profilePath = null, registryPath = null, principal = null,
  env = {}, requests = [] }) {
  return new Promise((settle, reject) => {
    const flags = [SERVER];
    if (registryPath !== null) flags.push('--registry', registryPath);
    if (profilePath !== null) flags.push('--profile', profilePath);
    flags.push('--repo-root', root);
    if (principal !== null) flags.push('--principal', principal);
    const child = spawn(process.execPath, flags,
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
const ON_WRITE = { SOULFORGE_ENGINE_MCP: 'on', SOULFORGE_ENGINE_MCP_WRITE: 'on' };

const readReceipts = (receiptsDir) => readFileSync(join(receiptsDir, 'mcp_tool_calls.jsonl'), 'utf8')
  .split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));

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
    assert.match(refused.stderr, /refused/u);
    // The line names the file and the reason, so the manual's troubleshooting row is true — and it
    // does not print the path it failed on, which is what a raw fs error would have done.
    assert.match(refused.stderr, /project_profile/u);
    assert.match(refused.stderr, /ENOENT/u);
    assert.equal(/[A-Za-z]:[\/]/u.test(refused.stderr), false, 'no local path on stderr');
    assert.equal(refused.stderr.includes('registry row'), false,
      'a --profile start is not told about registry rows');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('neither flag, or both, is an argument error rather than a guess', async () => {
  const { root, staged } = stage();
  try {
    const both = await runServer({
      root,
      profilePath: staged.profile_path,
      registryPath: join(root, '_workmeta', 'system', 'engine', 'project_registry.json'),
      env: { ...ON, ...OFF_WRITE },
      requests: [],
    });
    assert.equal(both.status, 64);
    assert.match(both.stderr, /alternatives/u);

    const neither = await runServer({ root, env: { ...ON, ...OFF_WRITE }, requests: [] });
    assert.equal(neither.status, 64);
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
      principal: OWNER,
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
    assert.equal(initialize._meta.principal_role, 'owner');
    assert.equal(initialize._meta.projects, 1);

    assert.equal(session.responses[1].result._meta.initialised, true);

    const list = session.responses[2].result;
    // Fifteen of twenty-three: the eight write tools are hidden while the write switch is off, and
    // the list says how many it withheld rather than pretending they do not exist.
    assert.equal(list.tools.length, 15);
    assert.equal(list._meta.tools_total, 23);
    assert.equal(list._meta.tools_hidden, 8);
    const byName = new Map(list.tools.map((tool) => [tool.name, tool]));
    assert.equal(byName.has('judge_run'), false);
    assert.equal(byName.get('rules_stage').annotations.readOnlyHint, true);
    assert.equal(byName.get('rules_stage').annotations.idempotentHint, true);
    assert.equal(byName.get('rules_stage').annotations.destructiveHint, false);
    for (const tool of list.tools) {
      assert.equal(typeof tool.title, 'string');
      assert.equal(tool.inputSchema.type, 'object');
      assert.equal(tool.inputSchema.properties.project_code.type, 'string');
    }

    assert.equal(session.responses[3].error.code, -32601);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('with the write switch on the write tools are listed and honestly annotated', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
      env: ON_WRITE,
      requests: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
    });
    const list = session.responses[0].result;
    assert.equal(list.tools.length, 23);
    assert.equal(list._meta.tools_hidden, 0);
    const byName = new Map(list.tools.map((tool) => [tool.name, tool]));
    assert.equal(byName.get('judge_run').annotations.readOnlyHint, false);
    assert.equal(byName.get('judge_run').annotations.destructiveHint, false);
    assert.equal(byName.get('judge_run').annotations.idempotentHint, true);
    assert.equal(byName.get('observe_scan').annotations.idempotentHint, false);
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
      principal: OWNER,
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
    assert.equal(stageAnswer.structuredContent.project_code, 'SYN-000');
    assert.equal(stageAnswer.structuredContent.stage_code, '030_SRR');
    assert.ok(stageAnswer.structuredContent.work_items.length > 0);

    assert.equal(session.responses[3].error.code, -32602);

    // An unknown stage is an argument the caller can fix, so it comes back as a tool result the
    // model can read rather than as a protocol failure (9.1E ⑪).
    const badStage = session.responses[4].result;
    assert.equal(badStage.isError, true);
    assert.equal(badStage.structuredContent.error_code, 'ENGINE_MCP_STAGE_UNKNOWN');
    assert.equal(session.responses[4].error, undefined);

    const receipts = readReceipts(staged.receipts_dir);
    // One line per call that reached a tool, refusals included. The call naming a tool that does
    // not exist reached none, so it leaves no tool receipt — only a protocol error.
    assert.equal(receipts.length, 3);
    assert.deepEqual(receipts.map((row) => row.tool),
      ['rules_stage', 'observe_status', 'rules_stage']);
    assert.deepEqual(receipts.map((row) => row.status), ['OK', 'OK', 'REFUSED']);
    for (const row of receipts) {
      assert.equal(row.schema_version, 'soulforge.engine_mcp_tool_call_receipt.v0');
      assert.equal(row.engine_version, ENGINE_VERSION);
      assert.equal(row.principal_ref, 'owner_test');
      assert.equal(row.role, 'owner');
      assert.equal(row.project_code, 'SYN-000');
      assert.equal(typeof row.args_digest, 'string');
      assert.ok(Number.isInteger(row.duration_ms));
      // Metadata only: nothing that could carry a document, a path or an answer.
      for (const forbidden of ['arguments', 'result', 'content', 'structuredContent', 'markdown',
        'file_ref', 'path', 'work_items']) {
        assert.equal(Object.hasOwn(row, forbidden), false, `receipt carries ${forbidden}`);
      }
    }
    assert.deepEqual(receipts.map((row) => row.access_decision), ['allowed', 'allowed', 'refused']);
    assert.equal(receipts[2].access_reason, null, 'the refusal was the stage, not the permission');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a write tool is hidden and refused while the write switch is off', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
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
              revision_label: 'mcp_protocol_01',
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
    const receipts = readReceipts(staged.receipts_dir);
    assert.deepEqual(receipts.map((row) => row.error_code),
      ['WRITE_TOOLS_DISABLED', 'WRITE_TOOLS_DISABLED']);
    assert.deepEqual(receipts.map((row) => row.write_enabled), [false, false]);
    assert.deepEqual(receipts.map((row) => row.access_reason),
      ['WRITE_DISABLED', 'WRITE_DISABLED']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('without a principal the door answers the public rule class and refuses the rest', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'rules_stage', arguments: { stage_code: '030_SRR' } },
        },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'project_status', arguments: {} } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
      ],
    });
    assert.equal(session.status, 0, session.stderr);
    const list = session.responses[0].result;
    assert.deepEqual(list.tools.map((tool) => tool.name).sort(),
      ['engine_status', 'rules_card', 'rules_layers', 'rules_stage', 'rules_version', 'whoami']);
    assert.equal(list._meta.principal_role, null);

    assert.equal(session.responses[1].result.structuredContent.stage_code, '030_SRR');
    assert.equal(session.responses[2].error.code, -32000);
    assert.equal(session.responses[2].error.data.code, 'SE_MCP_PRINCIPAL_REQUIRED');
    assert.equal(session.responses[3].result.structuredContent.anonymous, true);

    const receipts = readReceipts(staged.receipts_dir);
    const refused = receipts.find((row) => row.tool === 'project_status');
    assert.equal(refused.access_decision, 'refused');
    assert.equal(refused.access_reason, 'PRINCIPAL_REQUIRED');
    assert.equal(refused.principal_ref, null);
    assert.equal(refused.role, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a registry serves several projects from one process, by project code', async () => {
  const { root, staged } = stageRegistry({
    project_codes: ['SYN-000', 'SYN-001'], statuses: { 'SYN-001': 'paused' },
  });
  try {
    const session = await runServer({
      root,
      registryPath: staged.registry_path,
      principal: OWNER,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'projects_list', arguments: {} } },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'observe_status', arguments: { project_code: 'SYN-001' } },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'observe_status', arguments: { project_code: 'SYN-404' } },
        },
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'engine_status', arguments: {} } },
      ],
    });
    assert.equal(session.status, 0, session.stderr);
    assert.equal(session.responses[0].result._meta.projects, 2);
    assert.equal(session.responses[0].result._meta.default_project, 'SYN-000');

    const listed = session.responses[1].result.structuredContent;
    assert.equal(listed.counts.total, 2);
    assert.equal(listed.counts.paused, 1);
    assert.deepEqual(listed.projects.map((row) => row.project_code), ['SYN-000', 'SYN-001']);

    // The answer is about the project the call named, not the default one.
    assert.equal(session.responses[2].result.structuredContent.project_code, 'SYN-001');
    assert.match(session.responses[2].result.structuredContent.observations_dir, /SYN-001/u);

    assert.equal(session.responses[3].error.code, -32000);
    assert.equal(session.responses[3].error.data.code, 'SE_MCP_PROJECT_UNKNOWN');
    // The refusal counts the registry rather than listing it: project resolution happens before
    // the access decision, so a listed refusal would be an enumeration channel.
    assert.equal(session.responses[3].error.data.detail.known_count, 2);
    assert.equal(Object.hasOwn(session.responses[3].error.data.detail, 'known'), false);

    const status = session.responses[4].result.structuredContent;
    assert.equal(status.registry.source, 'registry');
    assert.equal(status.registry.projects, 2);
    assert.equal(status.access.table_source, 'file');

    // Each project's receipts land in that project's own metadata folder.
    const first = readReceipts(staged.by_code.get('SYN-000').receipts_dir);
    const second = readReceipts(staged.by_code.get('SYN-001').receipts_dir);
    assert.deepEqual(second.map((row) => row.tool), ['observe_status']);
    assert.ok(first.every((row) => row.receipts_of_project === 'SYN-000'));
    // The call that named no known project still left a line — in the default project's receipts,
    // where an auditor is already looking — with the project it asked for left null.
    const unresolved = first.filter((row) => row.project_code === null);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].error_code, 'SE_MCP_PROJECT_UNKNOWN');
    assert.equal(unresolved[0].access_decision, 'refused');
    assert.equal(unresolved[0].role, 'owner');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a refusal that never reached a project is still one line per call', async () => {
  const { root, staged } = stageRegistry({ project_codes: ['SYN-000'] });
  try {
    const session = await runServer({
      root,
      registryPath: staged.registry_path,
      principal: HW,
      env: { ...ON, ...OFF_WRITE },
      requests: [1, 2, 3, 4].map((id) => ({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'observe_status', arguments: { project_code: `SYN-40${id}` } },
      })),
    });
    assert.equal(session.status, 0, session.stderr);
    for (const response of session.responses) {
      assert.equal(response.error.data.code, 'SE_MCP_PROJECT_UNKNOWN');
    }
    const receipts = readReceipts(staged.by_code.get('SYN-000').receipts_dir);
    assert.equal(receipts.length, 4, 'an access log with holes in it is not an access log');
    for (const row of receipts) {
      assert.equal(row.tool, 'observe_status');
      assert.equal(row.status, 'REFUSED');
      assert.equal(row.access_decision, 'refused');
      assert.equal(row.error_code, 'SE_MCP_PROJECT_UNKNOWN');
      assert.equal(row.principal_ref, 'hw_test');
      assert.equal(row.role, 'hw');
      assert.equal(row.project_code, null);
      assert.equal(row.receipts_of_project, 'SYN-000');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a discipline role is shown no confidential field and cannot confirm observations', async () => {
  const { root, staged } = stageRegistry({ project_codes: ['SYN-000'] });
  try {
    const session = await runServer({
      root,
      registryPath: staged.registry_path,
      principal: HW,
      env: ON_WRITE,
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'observe_status', arguments: {} } },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'observe_confirm',
            arguments: {
              sheet_json_path: join(staged.by_code.get('SYN-000').observations_dir,
                'confirmation_sheet.json'),
              decisions: [],
            },
          },
        },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'access_table', arguments: {} } },
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'projects_list', arguments: {} } },
      ],
    });
    assert.equal(session.status, 0, session.stderr);

    // Write tools are on, so the one write tool this role holds is listed; the Owner-only ones
    // are not, and neither is the permission table.
    const listed = session.responses[0].result.tools.map((tool) => tool.name);
    assert.ok(listed.includes('observe_register'));
    assert.ok(!listed.includes('observe_confirm'));
    assert.ok(!listed.includes('access_table'));

    const status = session.responses[1].result.structuredContent;
    assert.equal(status.observations_dir, null, 'a path is a ⓒ item');
    assert.equal(status.files.auto, null);
    assert.deepEqual(status._redacted.fields.sort(),
      ['files.auto', 'observations_dir'].sort());
    assert.equal(status._redacted.role, 'hw');
    // The counts are ⓑ and stay: what is withheld is the naming, not the judgement.
    assert.equal(status.counts.merged_observations, 1);

    assert.equal(session.responses[2].error.data.code, 'SE_MCP_PERMISSION_DENIED');
    assert.equal(session.responses[3].error.data.code, 'SE_MCP_PERMISSION_DENIED');
    assert.equal(session.responses[4].result.structuredContent.projects[0].profile, null);

    const receipts = readReceipts(staged.by_code.get('SYN-000').receipts_dir);
    const refused = receipts.filter((row) => row.access_decision === 'refused');
    assert.deepEqual(refused.map((row) => row.access_reason),
      ['PERMISSION_DENIED', 'PERMISSION_DENIED']);
    assert.ok(receipts.every((row) => row.role === 'hw' && row.principal_ref === 'hw_test'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a caller with no principal is told the engine, not the projects behind it', async () => {
  const { root, staged } = stageRegistry({ project_codes: ['SYN-000', 'SYN-001'] });
  try {
    const session = await runServer({
      root,
      registryPath: staged.registry_path,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'engine_status', arguments: {} } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'rules_layers', arguments: {} } },
      ],
    });
    assert.equal(session.status, 0, session.stderr);

    const status = session.responses[0].result.structuredContent;
    // What the engine is stays public: version, protocol, switches, rule-layer versions.
    assert.equal(status.engine_version, ENGINE_VERSION);
    assert.equal(status.protocol.version, PROTOCOL_VERSION);
    assert.equal(status.switches.write_enabled, false);
    assert.ok(status.release.rule_layers.length > 0);
    assert.ok(status.release.rule_layers.every((row) => typeof row.spec_version === 'string'));
    // What the projects are does not.
    assert.equal(status.project.project_code, null);
    assert.equal(status.project.prime, null);
    assert.equal(status.project.business_type, null);
    assert.equal(status.project.quality_grade, null);
    assert.equal(status.registry.projects, null);
    assert.equal(status.registry.default_project, null);
    assert.equal(status.access.table_path, null);
    assert.equal(status.project_code, null, 'not even in the envelope');
    assert.deepEqual(status._redacted.data_classes, ['team_judgment', 'confidential_contract']);
    assert.ok(status._redacted.fields.includes('project.project_code'));
    assert.equal(session.responses[0].result.content[0].text.includes('SYN-000'), false);

    const layers = session.responses[1].result.structuredContent;
    assert.equal(layers.project_code, null);
    assert.equal(layers.prime, null);
    assert.ok(layers.layers.length > 0);
    assert.equal(layers.layers[0].file_name, null, 'a rule file name names the project');
    assert.equal(typeof layers.layers[0].spec_version, 'string', 'the version stays public');
    assert.equal(session.responses[1].result.content[0].text.includes('SYN-000'), false);
    assert.equal(session.responses[1].result.content[0].text.includes('compiled_variant.json'),
      false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a team role still sees the project identity those two tools carry', async () => {
  const { root, staged } = stageRegistry({ project_codes: ['SYN-000'] });
  try {
    const session = await runServer({
      root,
      registryPath: staged.registry_path,
      principal: HW,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'engine_status', arguments: {} } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'rules_layers', arguments: {} } },
      ],
    });
    const status = session.responses[0].result.structuredContent;
    assert.equal(status.project.project_code, 'SYN-000');
    assert.equal(status.registry.projects, 1);
    assert.equal(status.project_code, 'SYN-000');
    // ⓒ is still withheld from a team role: where the material lives is Owner/PM.
    assert.equal(status.receipts_root, null);
    assert.equal(status.access.table_path, null);
    assert.deepEqual(status._redacted.data_classes, ['confidential_contract']);

    const layers = session.responses[1].result.structuredContent;
    assert.equal(layers.project_code, 'SYN-000');
    assert.equal(typeof layers.layers[0].file_name, 'string');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an argument the schema does not declare is refused by name, as a tool result', async () => {
  const { root, staged } = stage();
  try {
    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
      env: { ...ON, ...OFF_WRITE },
      requests: [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'rules_stage', arguments: { stage_code: '030_SRR', stage: '030_SRR' } },
        },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'next_steps', arguments: {} } },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'rules_stage', arguments: [] } },
      ],
    });
    assert.equal(session.status, 0, session.stderr);

    const unknown = session.responses[0].result;
    assert.equal(unknown.isError, true);
    assert.equal(unknown.structuredContent.error_code, 'ENGINE_MCP_ARGUMENTS_INVALID');
    assert.deepEqual(unknown.structuredContent.detail.unknown, ['stage']);

    // A missing required argument says which one, in the arguments vocabulary — not in the
    // profile's, which is what a caller used to be told.
    const missing = session.responses[1].result;
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.error_code, 'ENGINE_MCP_ARGUMENTS_INVALID');
    assert.deepEqual(missing.structuredContent.detail.missing, ['stage_code']);

    // Arguments that are not an object at all stay a protocol error.
    assert.equal(session.responses[2].error.code, -32602);

    const receipts = readReceipts(staged.receipts_dir);
    assert.equal(receipts.length, 2, 'both tool-level refusals are logged');
    assert.ok(receipts.every((row) => row.error_code === 'ENGINE_MCP_ARGUMENTS_INVALID'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a lane another process holds refuses the call rather than queueing it', async () => {
  const { root, staged } = stage();
  try {
    // Written the way another server process would have written it, and left there: the engine
    // reports a held lane and never removes somebody else's lock.
    const lockPath = join(staged.runs_root, 'locks', 'observe_confirm.lock.json');
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, `${JSON.stringify({
      schema_version: 'soulforge.engine_mcp_write_lock.v0',
      lock_id: 'another_process',
      tool: 'observe_confirm',
      acquired_at: new Date().toISOString(),
    })}\n`);

    const session = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
      env: ON_WRITE,
      requests: [{
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'observe_confirm',
          arguments: {
            sheet_json_path: join(staged.observations_dir, 'confirmation_sheet.json'),
            decisions: [],
          },
        },
      }],
    });
    assert.equal(session.status, 0, session.stderr);
    assert.equal(session.responses[0].error.code, -32000);
    assert.equal(session.responses[0].error.data.code, 'SE_MCP_LANE_BUSY');
    assert.equal(session.responses[0].error.data.detail.stale, false);
    assert.equal(readFileSync(lockPath, 'utf8').includes('another_process'), true);

    const receipts = readReceipts(staged.receipts_dir);
    assert.equal(receipts[0].error_code, 'SE_MCP_LANE_BUSY');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the file door works through the real process: ticket, register, download, sweep', async () => {
  const { root, staged } = stage();
  try {
    // Session one: ask for a place to put a file. A separate process from the registration on
    // purpose — that is how it will actually be used, and it proves the ledger is on disk rather
    // than in one process's memory.
    const opened = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
      env: ON_WRITE,
      requests: [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'file_ticket', arguments: { purpose: 'upload', note: 'smoke' } },
        },
      ],
    });
    assert.equal(opened.status, 0, opened.stderr);
    const listed = opened.responses[0].result.tools.map((tool) => tool.name);
    for (const name of ['file_ticket', 'file_put', 'file_register', 'file_get',
      'file_tickets_list', 'file_tickets_gc']) {
      assert.ok(listed.includes(name), `${name} should be listed with the write switch on`);
    }
    const ticket = opened.responses[1].result.structuredContent;
    assert.equal(ticket.purpose, 'upload');

    // A person drops a file in the folder the ticket named.
    const folder = join(staged.project_root, ...ticket.folder_ref.split('/'));
    writeFileSync(join(folder, 'SSRS_final.pdf'), 'synthetic bytes', 'utf8');

    // Session two: register it, take a copy back out, and ask what the sweep would do.
    const used = await runServer({
      root,
      profilePath: staged.profile_path,
      principal: OWNER,
      env: ON_WRITE,
      requests: [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'file_register',
            arguments: { ticket_id: ticket.ticket_id, artifact_type_id: 'ssrs', stage_code: '030_SRR' },
          },
        },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'file_tickets_list', arguments: {} } },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'file_tickets_gc', arguments: {} } },
      ],
    });
    assert.equal(used.status, 0, used.stderr);

    const registered = used.responses[0].result.structuredContent;
    assert.equal(registered.observation_state, 'observed');
    assert.equal(registered.counts.moved, 1);
    assert.equal(registered.counts.observations, 1);
    assert.equal(registered.task_number, 3004);
    assert.match(used.responses[0].result.content[0].text, /등록 완료/u);
    assert.equal(readFileSync(
      join(staged.project_root, ...registered.registered[0].file_ref.split('/')), 'utf8'),
    'synthetic bytes');

    assert.equal(used.responses[1].result.structuredContent.counts.used, 1);
    // Nothing is due for the sweep yet, and the sweep reports rather than moves by default.
    assert.equal(used.responses[2].result.structuredContent.dry_run, true);
    assert.equal(used.responses[2].result.structuredContent.counts.moved, 0);

    // One receipt line per call, both sessions, with the caller on every line.
    const receipts = readReceipts(staged.receipts_dir);
    const fileCalls = receipts.filter((row) => row.tool.startsWith('file_'));
    assert.equal(fileCalls.length, 4);
    for (const row of fileCalls) {
      assert.equal(row.principal_ref, 'owner_test');
      assert.equal(row.access_decision, 'allowed');
      assert.equal(row.status, 'OK');
      assert.equal(row.write_enabled, true);
    }
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
