// Engineering MCP v0 read-only stdio seam.
//
// This module is deliberately only a transport boundary around an injected
// read facade. It discovers no files, opens no network endpoint, reads no
// credentials, and constructs no provider. Both the transport and the facade
// have to be enabled by their caller; importing this module has zero effects.

import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";

import { listContractTools } from "./contract.mjs";
import {
  FACADE_SCHEMA,
  FACADE_DISABLED_CODE,
  REQUEST_SHAPE_INVALID_CODE,
  isEngineeringMcpReadFacade,
} from "./facade.mjs";

export const STDIO_SERVER_SCHEMA = "soulforge.engineering_mcp_stdio_server.v0";
export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_NAME = "soulforge-engineering-mcp";
export const SERVER_VERSION = "0.1.0";

export const JSON_RPC_ERROR = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
});

const DEFAULT_MAX_REQUEST_BYTES = 16 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const DEFAULT_MAX_CALL_RESULT_BYTES = 32 * 1024;
const MAX_ID_STRING = 128;
const OPTIONAL_REQUEST_FIELDS = new Set(["limit", "cursor"]);
const FACADE_OUTCOME_CODES = new Set([
  FACADE_DISABLED_CODE,
  REQUEST_SHAPE_INVALID_CODE,
  "not_available",
]);

const READ_TOOLS = Object.freeze(listContractTools().filter((tool) => tool.kind === "read"));

const PROTECTED_KEYS = /(?:^|_)(?:path|absolute_?path|file_?path|host_?path|local_?path|raw|raw_?body|bytes?|base64|content_?base64|transcript|hidden_?reasoning|password|secret|credentials?|token_?value|cookie|private_?key)(?:$|_)/iu;
const PHYSICAL_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|file:\/\/|~[\\/]|\/(?:[^/\s]+\/)+)/u;
const SECRET_VALUE = /(?:^|[^A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u;

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validId(id) {
  return id === null
    || (typeof id === "number" && Number.isSafeInteger(id))
    || (typeof id === "string" && id.length <= MAX_ID_STRING && /^[\x21-\x7e]+$/u.test(id));
}

function isProtected(value, seen = new Set()) {
  if (typeof value === "string") return PHYSICAL_PATH.test(value) || SECRET_VALUE.test(value);
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => isProtected(entry, seen));
  for (const key of Object.keys(value)) {
    if (PROTECTED_KEYS.test(key) || isProtected(value[key], seen)) return true;
  }
  return false;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

function schemaFor(tool) {
  const properties = {};
  for (const field of tool.request_fields) {
    properties[field] = field === "limit"
      ? { type: "integer", minimum: 1, maximum: 100 }
      : { type: "string", minLength: 1, maxLength: 200 };
  }
  return Object.freeze({
    type: "object",
    properties: Object.freeze(properties),
    required: Object.freeze(tool.request_fields.filter((field) => !OPTIONAL_REQUEST_FIELDS.has(field))),
    additionalProperties: false,
  });
}

const TOOL_DESCRIPTORS = Object.freeze(READ_TOOLS.map((tool) => Object.freeze({
  name: tool.name,
  description: `${tool.summary} Authority ceiling: ${tool.authority_ceiling}`,
  inputSchema: schemaFor(tool),
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true }),
})));

function rpcError(id, code, message) {
  return Object.freeze({ jsonrpc: "2.0", id, error: Object.freeze({ code, message }) });
}

function rpcResult(id, result) {
  return Object.freeze({ jsonrpc: "2.0", id, result });
}

function toolOutcome(outcome) {
  const safe = Object.freeze(outcome.ok === true
    ? { ok: true, tool: outcome.tool, result: outcome.result }
    : { ok: false, code: outcome.code });
  return Object.freeze({
    content: Object.freeze([{ type: "text", text: JSON.stringify(safe) }]),
    structuredContent: safe,
    isError: safe.ok !== true,
  });
}

function disabledOutcome() {
  return Object.freeze({ ok: false, code: FACADE_DISABLED_CODE });
}

function notAvailableOutcome() {
  return Object.freeze({ ok: false, code: "not_available" });
}

function normaliseFacadeOutcome(outcome, requestedName) {
  if (!outcome || typeof outcome !== "object") return notAvailableOutcome();
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(outcome));
  } catch {
    return notAvailableOutcome();
  }
  if (copy.ok === false && FACADE_OUTCOME_CODES.has(copy.code)
    && Object.keys(copy).every((key) => key === "ok" || key === "code")) {
    return deepFreeze(copy);
  }
  if (copy.ok === true && copy.tool === requestedName && isPlainObject(copy.result)
    && Object.keys(copy).every((key) => key === "ok" || key === "tool" || key === "result")) {
    return deepFreeze(copy);
  }
  return notAvailableOutcome();
}

function serialisedSize(value) {
  try {
    return byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function boundedPositiveInteger(value, fallback, name) {
  const selected = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(selected) || selected < 256) {
    const error = new Error(`${name}_invalid`);
    error.code = `${name}_invalid`;
    throw error;
  }
  return selected;
}

function validFacadeBinding(facade) {
  if (!isEngineeringMcpReadFacade(facade) || !Object.isFrozen(facade)) return false;
  const keys = Object.keys(facade).sort();
  return keys.length === 3
    && keys[0] === "dispatch"
    && keys[1] === "readLog"
    && keys[2] === "schema"
    && facade.schema === FACADE_SCHEMA
    && typeof facade.dispatch === "function"
    && typeof facade.readLog === "function";
}

export function createEngineeringMcpStdioServer(config = {}) {
  if (!isPlainObject(config)) throw new Error("config_shape_invalid");
  const enabled = config.enabled === true;
  const facade = config.facade ?? null;
  if (enabled && !validFacadeBinding(facade)) {
    throw new Error("explicit_facade_binding_required");
  }
  const maxRequestBytes = boundedPositiveInteger(
    config.max_request_bytes, DEFAULT_MAX_REQUEST_BYTES, "max_request_bytes");
  const maxResponseBytes = boundedPositiveInteger(
    config.max_response_bytes, DEFAULT_MAX_RESPONSE_BYTES, "max_response_bytes");
  const maxCallResultBytes = boundedPositiveInteger(
    config.max_call_result_bytes, DEFAULT_MAX_CALL_RESULT_BYTES, "max_call_result_bytes");

  function finish(response) {
    if (response === null || serialisedSize(response) <= maxResponseBytes) return response;
    return rpcError(response.id ?? null, JSON_RPC_ERROR.INTERNAL_ERROR, "bounded response refused");
  }

  function handle(message) {
    if (serialisedSize(message) > maxRequestBytes) {
      return rpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, "bounded request refused");
    }
    if (!isPlainObject(message) || message.jsonrpc !== "2.0"
      || typeof message.method !== "string" || message.method.length === 0
      || message.method.length > 80 || (("id" in message) && !validId(message.id))) {
      return rpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, "invalid JSON-RPC request");
    }
    const id = message.id;
    if (!("id" in message)) {
      return null;
    }

    if (message.method === "initialize") {
      if (message.params !== undefined && !isPlainObject(message.params)) {
        return rpcError(id, JSON_RPC_ERROR.INVALID_PARAMS, "invalid initialize params");
      }
      return finish(rpcResult(id, Object.freeze({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: Object.freeze({ tools: Object.freeze({ listChanged: false }) }),
        serverInfo: Object.freeze({ name: SERVER_NAME, version: SERVER_VERSION }),
        instructions: "Read-only metadata interface. It owns no task, context, artifact, review, or completion authority.",
        _meta: Object.freeze({
          schema: STDIO_SERVER_SCHEMA,
          enabled,
          read_tools: enabled ? READ_TOOLS.length : 0,
          write_tools_enabled: false,
        }),
      })));
    }

    if (message.method === "tools/list") {
      if (message.params !== undefined
        && (!isPlainObject(message.params) || Object.keys(message.params).length !== 0)) {
        return rpcError(id, JSON_RPC_ERROR.INVALID_PARAMS, "invalid tools/list params");
      }
      return finish(rpcResult(id, Object.freeze({
        tools: enabled ? TOOL_DESCRIPTORS : Object.freeze([]),
        _meta: Object.freeze({ enabled, write_tools_enabled: false }),
      })));
    }

    if (message.method === "tools/call") {
      if (!isPlainObject(message.params)
        || Object.keys(message.params).some((key) => key !== "name" && key !== "arguments")
        || typeof message.params.name !== "string"
        || !isPlainObject(message.params.arguments ?? {})) {
        return rpcError(id, JSON_RPC_ERROR.INVALID_PARAMS, "invalid tools/call params");
      }
      if (!enabled) return finish(rpcResult(id, toolOutcome(disabledOutcome())));
      if (isProtected(message.params.arguments ?? {})) {
        return finish(rpcResult(id, toolOutcome(Object.freeze({
          ok: false, code: REQUEST_SHAPE_INVALID_CODE,
        }))));
      }
      let outcome;
      try {
        outcome = facade.dispatch({ tool: message.params.name, args: message.params.arguments ?? {} });
      } catch {
        outcome = notAvailableOutcome();
      }
      if (outcome && typeof outcome.then === "function") outcome = notAvailableOutcome();
      outcome = normaliseFacadeOutcome(outcome, message.params.name);
      if (!outcome || typeof outcome !== "object" || isProtected(outcome)
        || serialisedSize(outcome) > maxCallResultBytes) {
        outcome = notAvailableOutcome();
      }
      return finish(rpcResult(id, toolOutcome(outcome)));
    }

    return rpcError(id, JSON_RPC_ERROR.METHOD_NOT_FOUND, "method not found");
  }

  return Object.freeze({
    schema: STDIO_SERVER_SCHEMA,
    enabled,
    max_request_bytes: maxRequestBytes,
    max_response_bytes: maxResponseBytes,
    handle,
  });
}

async function writeResponse(output, response) {
  if (response === null) return;
  const line = `${JSON.stringify(response)}\n`;
  if (output.write(line) === false) await once(output, "drain");
}

export async function runEngineeringMcpStdio({ server, input, output }) {
  if (!server || typeof server.handle !== "function") throw new Error("server_binding_required");
  if (!input || typeof input[Symbol.asyncIterator] !== "function") throw new Error("input_stream_required");
  if (!output || typeof output.write !== "function") throw new Error("output_stream_required");

  const decoder = new StringDecoder("utf8");
  let pending = "";
  let discardingOversize = false;

  async function refuseOversize() {
    await writeResponse(output, rpcError(
      null, JSON_RPC_ERROR.INVALID_REQUEST, "bounded request refused"));
  }

  async function processLine(line) {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (text.trim().length === 0) return;
    if (byteLength(text) > server.max_request_bytes) {
      await refuseOversize();
      return;
    }
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      await writeResponse(output, rpcError(null, JSON_RPC_ERROR.PARSE_ERROR, "parse error"));
      return;
    }
    await writeResponse(output, server.handle(message));
  }

  for await (const chunk of input) {
    let text = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    while (text.length > 0) {
      if (discardingOversize) {
        const newline = text.indexOf("\n");
        if (newline === -1) break;
        discardingOversize = false;
        text = text.slice(newline + 1);
        continue;
      }

      const newline = text.indexOf("\n");
      if (newline !== -1) {
        const line = `${pending}${text.slice(0, newline)}`;
        pending = "";
        text = text.slice(newline + 1);
        await processLine(line);
        continue;
      }

      pending += text;
      text = "";
      if (byteLength(pending) > server.max_request_bytes) {
        pending = "";
        discardingOversize = true;
        await refuseOversize();
      }
    }
  }

  pending += decoder.end();
  if (!discardingOversize && pending.length > 0) await processLine(pending);
}
