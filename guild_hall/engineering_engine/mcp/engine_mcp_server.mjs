#!/usr/bin/env node
// The engine's one outside door (설계 9.1A).
//
//   node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --registry <abs registry.json>
//   node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --profile  <abs project_profile.json>
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
// Three things this file adds on top of the tools:
//
//   * which project a call is about. `--registry` names many projects and every tool takes an
//     optional `project_code`; `--profile` is the same thing with a registry of one (부록 B).
//   * who is calling. `--principal` carries `{principal_ref, role}` from the assistant or gateway
//     layer that actually authenticated somebody; without it the door answers the public rule
//     class and refuses everything else with `SE_MCP_PRINCIPAL_REQUIRED` (9.1F). The engine never
//     authenticates and has no tool that edits permissions.
//   * the record. Every call that reaches a tool appends one metadata-only line to a receipts file
//     under `_workmeta`: which tool, which project, who asked, allowed or refused and why, digests
//     of the arguments and the result, how long it took, which engine version. Never the payload.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ACCESS_ERROR_CODES, DEFAULT_ACCESS_TABLE_V0, decideToolAccess, redactFields, resolveAccessView,
  validateAccessTable, validatePrincipal, viewSeesClass,
} from './access_table.mjs';
import {
  ENGINE_MCP_ERROR_CODES, TOOL_CALL_RECEIPT_FILE,
} from './engine_context.mjs';
import { createProjectContexts } from './engine_contexts.mjs';
import {
  REGISTRY_ERROR_CODES, loadProjectRegistry, loadRegistryProfiles, registryOfOne,
  validateProjectRegistry,
} from './project_registry.mjs';
import { ENGINE_MCP_TOOLS, ENGINE_MCP_TOOLS_BY_NAME, TOOL_DESCRIPTORS } from './tools/index.mjs';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_NAME = 'soulforge-engineering-engine';
export const FEATURE_ENV = 'SOULFORGE_ENGINE_MCP';
export const WRITE_ENV = 'SOULFORGE_ENGINE_MCP_WRITE';
export const TOOL_CALL_RECEIPT_SCHEMA = 'soulforge.engine_mcp_tool_call_receipt.v0';
export const ACCESS_TABLE_FILE = 'access_table.json';

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

/**
 * Which refusals stay JSON-RPC errors.
 *
 * A caller who passed a bad stage code has a tool result to read and fix (MCP calls that an
 * `isError` result, so the model sees it); a caller who is not allowed in, or who is asking while
 * another writer holds the lane, is not having a conversation about arguments. Those stay -32000.
 */
const PROTOCOL_REFUSAL_CODES = new Set([
  ENGINE_MCP_ERROR_CODES.WRITE_TOOLS_DISABLED,
  ENGINE_MCP_ERROR_CODES.LANE_BUSY,
  ENGINE_MCP_ERROR_CODES.WORKMETA_POLICY_REFUSED,
  ACCESS_ERROR_CODES.PRINCIPAL_REQUIRED,
  ACCESS_ERROR_CODES.PERMISSION_DENIED,
  ACCESS_ERROR_CODES.CLASS_EXCEEDED,
  REGISTRY_ERROR_CODES.PROJECT_UNKNOWN,
]);

/** Stable stringify so two identical argument objects digest the same regardless of key order. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export const digestOf = (value) => createHash('sha256')
  .update(stableStringify(value ?? null), 'utf8').digest('hex').slice(0, 32);

export function parseArguments(argv) {
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
  const known = ['profile', 'registry', 'repo-root', 'principal', 'access-table'];
  for (const key of flags.keys()) {
    if (!known.includes(key)) return { error: `unknown flag --${key}` };
  }
  if (flags.has('profile') === flags.has('registry')) {
    return {
      error: flags.has('profile')
        ? '--profile and --registry are alternatives, not a pair'
        : '--registry <abs registry.json> or --profile <abs project_profile.json> is required',
    };
  }
  let principal = null;
  if (flags.has('principal')) {
    let raw;
    try {
      raw = JSON.parse(flags.get('principal'));
    } catch {
      return { error: '--principal takes a JSON object {"principal_ref":…,"role":…}' };
    }
    try {
      principal = validatePrincipal(raw);
    } catch (error) {
      return { error: `--principal refused: ${error?.message ?? String(error)}` };
    }
  }
  return {
    profilePath: flags.has('profile') ? resolve(flags.get('profile')) : null,
    registryPath: flags.has('registry') ? resolve(flags.get('registry')) : null,
    accessTablePath: flags.has('access-table') ? resolve(flags.get('access-table')) : null,
    repoRoot: resolve(flags.get('repo-root') ?? DEFAULT_REPO_ROOT),
    principal,
  };
}

async function readEngineVersion() {
  try {
    return (await readFile(join(ENGINE_ROOT, 'topology', 'ENGINE_VERSION'), 'utf8')).trim();
  } catch {
    return '0.0.0';
  }
}

/**
 * The registry this process serves, from either flag.
 *
 * `--profile` is not a second code path: it builds a registry of one and everything downstream is
 * the multi-project path with one row in it.
 */
export async function loadServedRegistry({ registryPath, profilePath, repoRoot }) {
  if (registryPath !== null) {
    const { registry, profiles } = await loadProjectRegistry({
      registry_path: registryPath, repo_root: repoRoot,
    });
    return { registry, profiles, source: 'registry' };
  }
  const raw = JSON.parse(await readFile(profilePath, 'utf8'));
  const single = validateProjectRegistry(registryOfOne({
    project_code: typeof raw?.project_code === 'string' ? raw.project_code : 'unknown',
    profile_path: profilePath,
  }), { repo_root: repoRoot });
  const profiles = await loadRegistryProfiles(single, { repo_root: repoRoot });
  return { registry: single, profiles, source: 'profile' };
}

/** The access table beside the registry, the one a flag names, or the built-in default. */
export async function loadAccessTable({ accessTablePath, registryPath }) {
  const path = accessTablePath
    ?? (registryPath === null ? null : join(dirname(registryPath), ACCESS_TABLE_FILE));
  if (path === null) return { table: DEFAULT_ACCESS_TABLE_V0, path: null };
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    // A table the Owner explicitly named and that cannot be read is a refusal; one that merely
    // might have been sitting beside the registry is not.
    if (accessTablePath !== null) throw error;
    return { table: DEFAULT_ACCESS_TABLE_V0, path: null };
  }
  return { table: validateAccessTable(JSON.parse(text)), path };
}

// ---------------------------------------------------------------- the door

/**
 * One message handler bound to one served registry.
 *
 * Exported so the protocol can be exercised without a child process; the tests drive the real
 * process over stdio anyway, because "it works when spawned" is the claim that matters.
 */
export function createMessageHandler(runtime) {
  const { projects, shared } = runtime;
  const engineVersion = runtime.engine_version;
  const writeEnabled = runtime.write_enabled === true;
  let initialised = false;

  const toolDescriptor = (tool) => ({
    name: tool.name,
    title: tool.title_ko,
    description: tool.description_ko,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title_ko,
      readOnlyHint: !tool.write,
      // Nothing in this door deletes or replaces: every write is create-only and an existing
      // output is refused rather than overwritten. That is what makes the false honest.
      destructiveHint: false,
      idempotentHint: tool.idempotent,
      openWorldHint: false,
    },
    _meta: { data_class: tool.data_class, write: tool.write },
  });

  /** The tools this caller is told about: hidden if refused, hidden if the write switch is off. */
  const visibleTools = (view, projectStatus) => ENGINE_MCP_TOOLS.filter((tool) =>
    decideToolAccess({
      view, tool, write_enabled: writeEnabled, project_status: projectStatus,
    }).allowed);

  const defaultContext = async () => {
    const code = projects.registry.default_project;
    return code === null ? null : projects.get(code);
  };

  const appendReceipt = async (context, row) => {
    if (context === null) return;
    try {
      await context.appendLine(join(context.profile.receipts_dir, TOOL_CALL_RECEIPT_FILE),
        stableStringify(row), { field: 'tool_call_receipt', invalidate: false });
    } catch (error) {
      // A receipt that cannot be written is worth saying out loud, but it is not a reason to
      // answer a read differently than it was answered.
      process.stderr.write(`engine-mcp: receipt not written (${error?.code ?? 'unknown'})\n`);
    }
  };

  /** An argument or state refusal, as the tool result MCP expects rather than a protocol error. */
  const refusalResult = (code, message, detail) => ({
    content: [{ type: 'text', text: `거절 (${code}): ${message}` }],
    structuredContent: {
      engine_version: engineVersion,
      error: true,
      error_code: code,
      message,
      detail: detail ?? null,
    },
    isError: true,
    _meta: { engine_version: engineVersion, error_code: code },
  });

  /** The standing of the caller when no project has been resolved yet. */
  const registryView = () => resolveAccessView({
    table: shared.access_table, principal: shared.principal, project_code: null,
  });

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
    let context = null;
    let projectCode = null;
    let decisionReason = null;
    let outcome = null;
    let rpcError = null;
    let isErrorResult = null;
    let errorCode = null;

    try {
      projectCode = projects.resolveProjectCode(args.project_code);
      context = await projects.get(projectCode);
      const decision = decideToolAccess({
        view: context.view,
        tool,
        write_enabled: writeEnabled,
        project_status: projects.statusOf(projectCode) ?? 'active',
      });
      if (!decision.allowed) {
        decisionReason = decision.reason;
        const error = new Error('this caller may not use this tool here');
        error.code = decision.code;
        error.detail = { tool: tool.name, role: context.view.role, ...(decision.detail ?? {}) };
        throw error;
      }
      // A write tool takes the project's lane; a second holder is refused, never queued
      // (contracts/lane_1d §4.3). The lock is skipped when writes are off because the call is
      // about to be refused anyway and a lock file would be litter.
      const run = () => tool.handler(args, context);
      const result = tool.write === true && writeEnabled
        ? await context.withWriteLock(tool.name, run)
        : await run();

      const shownStructured = viewSeesClass(context.view, 'confidential_contract')
        ? { value: result.structured, redacted: [] }
        : redactFields(result.structured, tool.confidential_fields);
      outcome = {
        content: [{ type: 'text', text: result.markdown }],
        structuredContent: {
          engine_version: engineVersion,
          project_code: projectCode,
          ...shownStructured.value,
          ...(shownStructured.redacted.length === 0 ? {} : {
            _redacted: {
              data_class: 'confidential_contract',
              fields: [...shownStructured.redacted],
              role: context.view.role,
            },
          }),
        },
        _meta: { engine_version: engineVersion, project_code: projectCode },
      };
    } catch (error) {
      errorCode = error?.code ?? ENGINE_MCP_ERROR_CODES.ARGUMENTS_INVALID;
      const message = error?.message ?? String(error);
      const detail = error?.detail ?? null;
      if (PROTOCOL_REFUSAL_CODES.has(errorCode)) {
        rpcError = {
          code: JSON_RPC.TOOL_REFUSED,
          message,
          data: { code: errorCode, detail, engine_version: engineVersion },
        };
      } else {
        // An argument or state error is a tool result, not a protocol failure: the caller can
        // read it, fix the argument, and call again (9.1E ⑪).
        isErrorResult = refusalResult(errorCode, message, detail);
      }
    }

    await appendReceipt(context, {
      schema_version: TOOL_CALL_RECEIPT_SCHEMA,
      logged_at: new Date().toISOString(),
      engine_version: engineVersion,
      project_code: projectCode ?? (context?.profile?.project_code ?? null),
      tool: tool.name,
      write: tool.write,
      write_enabled: writeEnabled,
      data_class: tool.data_class,
      principal_ref: context?.view?.principal_ref ?? shared.principal?.principal_ref ?? null,
      role: context?.view?.role ?? shared.principal?.role ?? null,
      access_decision: outcome === null ? 'refused' : 'allowed',
      access_reason: decisionReason,
      status: outcome === null ? 'REFUSED' : 'OK',
      error_code: outcome === null ? errorCode : null,
      args_digest: digestOf(args),
      result_digest: outcome === null ? null : digestOf(outcome.structuredContent),
      duration_ms: Date.now() - started,
    });

    if (rpcError !== null) return { rpcError };
    return { result: outcome ?? isErrorResult };
  };

  return async function handle(message) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)
      || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return { error: { code: JSON_RPC.INVALID_REQUEST, message: 'not a JSON-RPC 2.0 request' } };
    }
    switch (message.method) {
      case 'initialize': {
        const context = await defaultContext();
        return {
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              // The two switches are read once at start and this process cannot toggle them, so
              // the tool list cannot change inside a session. Declaring `listChanged: true` would
              // promise a notification that would never arrive.
              tools: { listChanged: false },
            },
            serverInfo: {
              name: SERVER_NAME,
              title: 'Soulforge 체계공학 판단 엔진',
              version: engineVersion,
              engine_version: engineVersion,
            },
            instructions: '엔진은 판단만 한다. 쓰기 도구는 Owner가 따로 켠다. 신원(principal)이 없으면 공개 규칙만 열린다.',
            _meta: {
              engine_version: engineVersion,
              project_code: context?.profile?.project_code ?? null,
              projects: projects.registry.projects.length,
              default_project: projects.registry.default_project,
              write_tools_enabled: writeEnabled,
              principal_role: (context?.view ?? registryView()).role,
              principal_present: shared.principal !== null,
            },
          },
        };
      }
      case 'notifications/initialized':
        initialised = true;
        return { notification: true };
      case 'ping':
        return { result: { _meta: { engine_version: engineVersion, initialised } } };
      case 'tools/list': {
        const context = await defaultContext();
        const view = context?.view ?? registryView();
        const status = context === null ? 'active'
          : projects.statusOf(context.profile.project_code) ?? 'active';
        const tools = visibleTools(view, status);
        return {
          result: {
            tools: tools.map(toolDescriptor),
            _meta: {
              engine_version: engineVersion,
              tools_total: ENGINE_MCP_TOOLS.length,
              tools_hidden: ENGINE_MCP_TOOLS.length - tools.length,
              write_tools_enabled: writeEnabled,
              principal_role: view?.role ?? null,
            },
          },
        };
      }
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
  const writeEnabled = process.env[WRITE_ENV] === 'on';

  let projects;
  let shared;
  try {
    const served = await loadServedRegistry(parsed);
    const access = await loadAccessTable(parsed);
    shared = {
      principal: parsed.principal,
      access_table: access.table,
      access_table_path: access.path === null ? null : pointerOf(parsed.repoRoot, access.path),
      access_table_source: access.table.source,
      registry_source: served.source,
      registry_path: parsed.registryPath === null ? null
        : pointerOf(parsed.repoRoot, parsed.registryPath),
      protocol_version: PROTOCOL_VERSION,
      server_name: SERVER_NAME,
      feature_env: FEATURE_ENV,
      write_env: WRITE_ENV,
      tools: TOOL_DESCRIPTORS,
    };
    projects = createProjectContexts({
      registry: served.registry,
      profiles: served.profiles,
      repo_root: parsed.repoRoot,
      engine_root: ENGINE_ROOT,
      engine_version: engineVersion,
      write_enabled: writeEnabled,
      access_table: access.table,
      principal: parsed.principal,
      shared,
    });
    // A door that half-opens is worse than one that does not: the default project is built now so
    // a broken profile is an exit code rather than a refusal on the first question.
    if (served.registry.default_project !== null) {
      await projects.get(served.registry.default_project);
    }
  } catch (error) {
    process.stderr.write(
      `engine-mcp: refused (${error?.code ?? 'unknown'}): ${error?.message ?? error}\n`);
    process.exitCode = EXIT.PROFILE_REFUSED;
    return;
  }

  const handle = createMessageHandler({
    projects, shared, engine_version: engineVersion, write_enabled: writeEnabled,
  });
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

/** A repo-relative pointer, or null when the path is outside the repository. */
function pointerOf(repoRoot, absolute) {
  const left = String(absolute).split('\\').join('/');
  const right = String(repoRoot).split('\\').join('/').replace(/\/$/u, '');
  return left.toLowerCase().startsWith(`${right.toLowerCase()}/`)
    ? left.slice(right.length + 1) : null;
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
