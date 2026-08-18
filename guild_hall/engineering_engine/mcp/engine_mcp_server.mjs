#!/usr/bin/env node
// The engine's one outside door (설계 9.1A).
//
//   node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --profile <abs project_profile.json>
//
// Off unless told otherwise. Without `SOULFORGE_ENGINE_MCP=on` the process prints one line and
// leaves with code 3; write tools stay refused on top of that until `SOULFORGE_ENGINE_MCP_WRITE=on`
// as well. Two switches rather than one because "let an assistant read the rules" and "let an
// assistant write into the project" are different decisions and the Owner makes them separately.
// Turning either on is an Owner decision and is not done here, in any client config, or by any test.
//
// The protocol is JSON-RPC 2.0 over stdio, newline-delimited, hand-rolled: `initialize`, `ping`,
// `tools/list`, `tools/call`, and the `notifications/initialized` notification. No dependency is
// added for five methods.
//
// What the door does not do: judge, decide, or hold rules. Every tool calls a function that already
// exists elsewhere in this engine (9.1A: "MCP 도구는 로직을 갖지 않고 기존 순수 함수·runner를 그대로
// 부른다"). What the door does add is the record — every call appends one metadata-only line to a
// receipts file under `_workmeta`: which tool, digests of the arguments and the result, how long it
// took, which engine version. Never the payload.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ENGINE_MCP_ERROR_CODES, TOOL_CALL_RECEIPT_FILE, createEngineContext,
} from './engine_context.mjs';
import { ENGINE_MCP_TOOLS, ENGINE_MCP_TOOLS_BY_NAME } from './tools/index.mjs';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_NAME = 'soulforge-engineering-engine';
export const FEATURE_ENV = 'SOULFORGE_ENGINE_MCP';
export const WRITE_ENV = 'SOULFORGE_ENGINE_MCP_WRITE';
export const TOOL_CALL_RECEIPT_SCHEMA = 'soulforge.engine_mcp_tool_call_receipt.v0';

export const EXIT = Object.freeze({
  OK: 0,
  ARGUMENTS: 64,
  FEATURE_OFF: 3,
  PROFILE_REFUSED: 4,
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(HERE, '..');
const DEFAULT_REPO_ROOT = resolve(ENGINE_ROOT, '..', '..');

const JSON_RPC = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_REFUSED: -32000,
});

/** Stable stringify so two identical argument objects digest the same regardless of key order. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export const digestOf = (value) => createHash('sha256')
  .update(stableStringify(value ?? null), 'utf8').digest('hex').slice(0, 32);

function parseArguments(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) return { error: `unexpected argument: ${token}` };
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      return { error: `flag ${token} is missing its value` };
    }
    flags.set(token.slice(2), value);
    index += 1;
  }
  if (!flags.has('profile')) return { error: '--profile <abs project_profile.json> is required' };
  for (const key of flags.keys()) {
    if (!['profile', 'repo-root'].includes(key)) return { error: `unknown flag --${key}` };
  }
  return {
    profilePath: resolve(flags.get('profile')),
    repoRoot: resolve(flags.get('repo-root') ?? DEFAULT_REPO_ROOT),
  };
}

async function readEngineVersion() {
  try {
    return (await readFile(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8')).trim();
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------- the door

/**
 * One message handler bound to one context.
 *
 * Exported so the protocol can be exercised without a child process; the tests drive the real
 * process over stdio anyway, because "it works when spawned" is the claim that matters.
 */
export function createMessageHandler(context) {
  const receiptPath = join(context.profile.receipts_dir, TOOL_CALL_RECEIPT_FILE);
  let initialised = false;

  const toolDescriptor = (tool) => ({
    name: tool.name,
    title: tool.title_ko,
    description: tool.description_ko,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title_ko,
      readOnlyHint: !tool.write,
      destructiveHint: false,
      idempotentHint: !tool.write,
      openWorldHint: false,
    },
  });

  const appendReceipt = async (row) => {
    try {
      await context.appendLine(receiptPath, stableStringify(row));
    } catch (error) {
      // A receipt that cannot be written is worth saying out loud, but it is not a reason to
      // answer a read differently than it was answered.
      process.stderr.write(`engine-mcp: receipt not written (${error?.code ?? 'unknown'})\n`);
    }
  };

  const callTool = async (params) => {
    const toolName = params?.name;
    const tool = ENGINE_MCP_TOOLS_BY_NAME.get(toolName) ?? null;
    if (tool === null) {
      return { rpcError: { code: JSON_RPC.INVALID_PARAMS, message: 'unknown tool', data: { tool: toolName ?? null } } };
    }
    const args = params?.arguments ?? {};
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return { rpcError: { code: JSON_RPC.INVALID_PARAMS, message: 'arguments must be an object', data: { tool: tool.name } } };
    }
    const started = Date.now();
    let outcome;
    let rpcError = null;
    try {
      const result = await tool.handler(args, context);
      outcome = {
        content: [{ type: 'text', text: result.markdown }],
        structuredContent: { engine_version: context.engine_version, ...result.structured },
        _meta: { engine_version: context.engine_version },
      };
    } catch (error) {
      const code = error?.code ?? ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID;
      rpcError = {
        code: JSON_RPC.TOOL_REFUSED,
        message: error?.message ?? String(error),
        data: { code, detail: error?.detail ?? null, engine_version: context.engine_version },
      };
    }
    await appendReceipt({
      schema_version: TOOL_CALL_RECEIPT_SCHEMA,
      logged_at: new Date().toISOString(),
      engine_version: context.engine_version,
      project_code: context.profile.project_code,
      tool: tool.name,
      write: tool.write,
      write_enabled: context.write_enabled,
      status: rpcError === null ? 'OK' : 'REFUSED',
      error_code: rpcError === null ? null : rpcError.data.code,
      args_digest: digestOf(args),
      result_digest: rpcError === null ? digestOf(outcome.structuredContent) : null,
      duration_ms: Date.now() - started,
    });
    return rpcError === null ? { result: outcome } : { rpcError };
  };

  return async function handle(message) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)
      || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return { error: { code: JSON_RPC.INVALID_REQUEST, message: 'not a JSON-RPC 2.0 request' } };
    }
    switch (message.method) {
      case 'initialize':
        return {
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: SERVER_NAME,
              title: 'Soulforge 체계공학 판단 엔진',
              version: context.engine_version,
              engine_version: context.engine_version,
            },
            instructions: '엔진은 판단만 한다. 쓰기 도구는 Owner가 따로 켠다.',
            _meta: {
              engine_version: context.engine_version,
              project_code: context.profile.project_code,
              write_tools_enabled: context.write_enabled,
            },
          },
        };
      case 'notifications/initialized':
        initialised = true;
        return { notification: true };
      case 'ping':
        return { result: { _meta: { engine_version: context.engine_version, initialised } } };
      case 'tools/list':
        return {
          result: {
            tools: ENGINE_MCP_TOOLS.map(toolDescriptor),
            _meta: { engine_version: context.engine_version },
          },
        };
      case 'tools/call': {
        const outcome = await callTool(message.params);
        return outcome.rpcError === undefined || outcome.rpcError === null
          ? { result: outcome.result } : { error: outcome.rpcError };
      }
      default:
        if (message.method.startsWith('notifications/')) return { notification: true };
        return { error: { code: JSON_RPC.METHOD_NOT_FOUND, message: 'unknown method', data: { method: message.method } } };
    }
  };
}

// ---------------------------------------------------------------- process

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error !== undefined) {
    process.stderr.write(`engine-mcp: ${parsed.error}\n`);
    process.exitCode = EXIT.ARGUMENTS;
    return;
  }
  if (process.env[FEATURE_ENV] !== 'on') {
    process.stderr.write(
      `engine-mcp: refused — this door is off; set ${FEATURE_ENV}=on to start it (Owner decision).\n`);
    process.exitCode = EXIT.FEATURE_OFF;
    return;
  }
  const engineVersion = await readEngineVersion();

  let context;
  try {
    context = await createEngineContext({
      profile_path: parsed.profilePath,
      repo_root: parsed.repoRoot,
      engine_root: ENGINE_ROOT,
      engine_version: engineVersion,
      write_enabled: process.env[WRITE_ENV] === 'on',
    });
  } catch (error) {
    process.stderr.write(`engine-mcp: profile refused (${error?.code ?? 'unknown'}): ${error?.message ?? error}\n`);
    process.exitCode = EXIT.PROFILE_REFUSED;
    return;
  }

  const handle = createMessageHandler(context);
  const write = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`);
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of reader) {
    const text = line.trim();
    if (text.length === 0) continue;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: JSON_RPC.PARSE_ERROR, message: 'parse error' } });
      continue;
    }
    let outcome;
    try {
      outcome = await handle(message);
    } catch (error) {
      outcome = { error: { code: JSON_RPC.INTERNAL_ERROR, message: error?.message ?? 'internal error' } };
    }
    if (outcome.notification === true) continue;
    const id = message?.id ?? null;
    if (id === null && outcome.result !== undefined) continue;
    write(outcome.result !== undefined
      ? { jsonrpc: '2.0', id, result: outcome.result }
      : { jsonrpc: '2.0', id, error: outcome.error });
  }
}

/** True when this file is the process entry point, on Windows drive letters included. */
export function isDirectInvocation(entryPath, moduleUrl) {
  if (typeof entryPath !== 'string' || entryPath.length === 0) return false;
  try {
    const entryUrl = new URL(`file://${entryPath.startsWith('/') ? '' : '/'}${entryPath.split('\\').join('/')}`).href;
    const normalise = (value) => value.replace(/^file:\/\/\/[A-Za-z]:/u,
      (prefix) => prefix.toLowerCase());
    return normalise(entryUrl) === normalise(moduleUrl);
  } catch {
    return false;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`engine-mcp: ${error?.message ?? String(error)}\n`);
    process.exitCode = 70;
  });
}
