#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadBinding, refuse } from './claude_acp_policy.mjs';
import { callWorkspaceTool, workspaceTools } from './claude_acp_workspace.mjs';
import { createClaudeAcp, readJsonLines } from './claude_acp_server.mjs';

export function runProtocol(binding, { mcp = false, input = process.stdin, output = process.stdout } = {}) {
  const send = value => output.write(`${JSON.stringify(value)}\n`);
  const agent = mcp ? null : createClaudeAcp(binding, send);
  const lifecycle=new AbortController();
  const close=()=>{lifecycle.abort();agent?.close();};
  let initialized = false;
  const fatal = () => { close(); input.destroy(); process.exitCode = 2; };
  readJsonLines(input, message => {
    const hasId = Object.hasOwn(message ?? {}, 'id');
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (hasId && typeof message.id !== 'string' && !Number.isSafeInteger(message.id))) { fatal(); return; }
    if (!hasId) {
      if (message.method === 'session/cancel') agent?.dispatch(message.method, message.params).catch(() => {});
      return;
    }
    Promise.resolve().then(async () => {
      if (!mcp) return agent.dispatch(message.method, message.params);
      if (message.method === 'initialize') {
        if (initialized || !['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(message.params?.protocolVersion)) refuse('MCP_VERSION');
        initialized = true;
        return { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'soulforge_workspace', version: '0.1.0' } };
      }
      if (!initialized) refuse('MCP_NOT_INITIALIZED');
      if (message.method === 'ping') return {};
      if (message.method === 'tools/list') return { tools: workspaceTools(binding) };
      if (message.method === 'tools/call') {
        try { const result=await callWorkspaceTool(binding, message.params?.name, message.params?.arguments ?? {},{signal:lifecycle.signal});return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false }; }
        catch (error) { return { content: [{ type: 'text', text: /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'WORKSPACE_REFUSED' }], isError: true }; }
      }
      refuse('MCP_METHOD_UNSUPPORTED');
    }).then(result => send({ jsonrpc: '2.0', id: message.id, result }), error => send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: /^[A-Z_]+$/.test(error.code ?? error.message ?? '') ? error.code ?? error.message : 'REQUEST_REFUSED' } }));
  }, fatal);
  input.on('end',close);input.on('close',close);
  return { close };
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Soulforge scoped Claude ACP: [--workspace-mcp | --preflight] --binding <absolute-file> --binding-sha256 <sha256>\n'); return;
  }
  const mcp = args[0] === '--workspace-mcp'; const preflight = args[0] === '--preflight'; if (mcp || preflight) args = args.slice(1);
  if (args.length !== 4 || args[0] !== '--binding' || args[2] !== '--binding-sha256') refuse('ARGUMENTS');
  const binding = loadBinding(args[1], args[3]);
  if (preflight) {
    const agent = createClaudeAcp(binding, () => refuse('UNEXPECTED_PREFLIGHT_OUTPUT'));
    try { process.stdout.write(`${JSON.stringify({ kind: 'scoped_claude_metadata_preflight', phase: 'METADATA_ONLY', ...await agent.preflight() })}\n`); }
    finally { agent.close(); }
  } else runProtocol(binding, { mcp });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`${/^[A-Z_]+$/.test(error.code ?? error.message ?? '') ? error.code ?? error.message : 'STARTUP_REFUSED'}\n`); process.exitCode = 2; });
}
