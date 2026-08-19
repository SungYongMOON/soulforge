import { isAbsolute, relative, resolve } from "node:path";
import { validateSlackBinding } from "./slack_history.mjs";
import { SlackArchiveError } from "./slack_archive_query.mjs";

export const SLACK_ARCHIVE_MCP_SERVER_NAME = "soulforge-slack-archive-query";
export const SLACK_ARCHIVE_MCP_PROTOCOL_VERSION = "2025-06-18";
export const SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION = "soulforge.slack_archive_mcp.binding.v0";

export const SLACK_ARCHIVE_MCP_INSTRUCTIONS =
  "Slack archive message and attachment metadata are retained history for the bound project channel. "
  + "This server is strictly read-only and queries local synthetic/retained archive state. "
  + "It cannot connect to Slack, post, edit, delete, or download files. "
  + "Coverage is PARTIAL; replies, deletions, older messages, and unallowlisted channels may be absent.";

export const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const JSON_RPC = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_REFUSED: -32000,
});

export const SLACK_ARCHIVE_MCP_TOOLS = Object.freeze([
  {
    name: "slack_archive_status",
    title: "Slack archive status",
    description: "Inspect bounded collection and archive status for the bound Slack project channel.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "slack_archive_search",
    title: "Search Slack archive",
    description: "Search bounded messages and previews in the retained archive for the bound project channel.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional search text, user ID, or attachment name",
          maxLength: 200,
        },
        user_id: {
          type: "string",
          description: "Optional Slack user ID filter (e.g. U00000001)",
        },
        since_message_ts: {
          type: "string",
          description: "Optional start Slack timestamp (e.g. 1720000000.000100)",
        },
        until_message_ts: {
          type: "string",
          description: "Optional end Slack timestamp (e.g. 1720000000.000900)",
        },
        since_message_time: {
          type: "string",
          description: "Optional start message posting time in canonical UTC ISO format",
        },
        until_message_time: {
          type: "string",
          description: "Optional end message posting time in canonical UTC ISO format",
        },
        since_received_at: {
          type: "string",
          description: "Optional start collection arrival time in canonical UTC ISO format",
        },
        until_received_at: {
          type: "string",
          description: "Optional end collection arrival time in canonical UTC ISO format",
        },
        has_attachments: {
          type: "boolean",
          description: "Filter for messages having attachments",
        },
        include_deleted: {
          type: "boolean",
          description: "Include deleted messages in results",
        },
        limit: {
          type: "integer",
          description: "Max results (1-100)",
          default: 20,
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "slack_archive_thread",
    title: "Get Slack thread",
    description: "Retrieve a message thread and its replies by root thread timestamp.",
    inputSchema: {
      type: "object",
      required: ["thread_ts"],
      properties: {
        thread_ts: {
          type: "string",
          description: "Root Slack timestamp of the thread (e.g. 1720000000.000100)",
        },
        limit: {
          type: "integer",
          description: "Max replies (1-200)",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "slack_archive_timeline",
    title: "Get Slack archive timeline",
    description: "Retrieve chronological timeline of messages ordered strictly by post time.",
    inputSchema: {
      type: "object",
      properties: {
        since_message_ts: {
          type: "string",
          description: "Optional start Slack timestamp",
        },
        until_message_ts: {
          type: "string",
          description: "Optional end Slack timestamp",
        },
        since_message_time: {
          type: "string",
          description: "Optional start message posting time in canonical UTC ISO format",
        },
        until_message_time: {
          type: "string",
          description: "Optional end message posting time in canonical UTC ISO format",
        },
        since_received_at: {
          type: "string",
          description: "Optional start collection arrival time in canonical UTC ISO format",
        },
        until_received_at: {
          type: "string",
          description: "Optional end collection arrival time in canonical UTC ISO format",
        },
        limit: {
          type: "integer",
          description: "Max messages (1-200)",
          default: 50,
          minimum: 1,
          maximum: 200,
        },
        direction: {
          type: "string",
          enum: ["asc", "desc"],
          default: "asc",
          description: "Ordering direction",
        },
        include_deleted: {
          type: "boolean",
          description: "Include deleted messages in timeline",
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "slack_archive_attachment_metadata",
    title: "Get Slack attachment metadata",
    description: "Retrieve metadata for attachments without raw bytes, local paths, or authenticated download URLs.",
    inputSchema: {
      type: "object",
      properties: {
        file_id: {
          type: "string",
          description: "Optional Slack file ID (e.g. F00000001)",
        },
        message_ts: {
          type: "string",
          description: "Optional message timestamp to list attachments for",
        },
        limit: {
          type: "integer",
          description: "Max results (1-100)",
          default: 50,
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
]);

export const SLACK_ARCHIVE_MCP_TOOLS_BY_NAME = new Map(
  SLACK_ARCHIVE_MCP_TOOLS.map((tool) => [tool.name, tool]),
);

const SLACK_USER_ID_RE = /^[UW][A-Z0-9]{2,31}$/u;
const SLACK_TIMESTAMP_RE = /^\d{10,16}\.\d{6}$/u;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;

const MCP_BINDING_ENVELOPE_KEYS = new Set([
  "schema_version",
  "feature_enabled",
  "private_root",
  "archive_path",
  "archive_sha256",
  "max_archive_bytes",
  "scope",
]);

const MCP_BINDING_SCOPE_KEYS = new Set([
  "binding_id",
  "workspace_id",
  "channel_id",
  "project_code",
]);

export function validateSlackArchiveMcpBinding(binding) {
  if (binding === null || typeof binding !== "object" || Array.isArray(binding) || Object.getPrototypeOf(binding) !== Object.prototype) {
    throw new SlackArchiveError("plain_object_required", "plain_object_required");
  }

  for (const key of Object.keys(binding)) {
    if (!MCP_BINDING_ENVELOPE_KEYS.has(key)) {
      throw new SlackArchiveError("extra_binding_field", "extra_binding_field");
    }
  }

  for (const requiredKey of MCP_BINDING_ENVELOPE_KEYS) {
    if (binding[requiredKey] === undefined || binding[requiredKey] === null) {
      throw new SlackArchiveError("missing_binding_field", "missing_binding_field");
    }
  }

  if (binding.schema_version !== SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION) {
    throw new SlackArchiveError("schema_version_invalid", "schema_version_invalid");
  }

  if (binding.feature_enabled !== true) {
    throw new SlackArchiveError("feature_disabled", "feature_disabled");
  }

  if (typeof binding.private_root !== "string" || !isAbsolute(binding.private_root)) {
    throw new SlackArchiveError("private_root_invalid", "private_root_invalid");
  }

  if (typeof binding.archive_path !== "string" || !isAbsolute(binding.archive_path)) {
    throw new SlackArchiveError("archive_path_invalid", "archive_path_invalid");
  }

  const normPrivateRoot = resolve(binding.private_root);
  const normArchivePath = resolve(binding.archive_path);
  const relArchive = relative(normPrivateRoot, normArchivePath);
  if (relArchive === "" || relArchive.startsWith("..") || isAbsolute(relArchive)) {
    throw new SlackArchiveError("archive_outside_private_root", "archive_outside_private_root");
  }

  if (typeof binding.archive_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(binding.archive_sha256)) {
    throw new SlackArchiveError("archive_sha256_invalid", "archive_sha256_invalid");
  }

  if (!Number.isSafeInteger(binding.max_archive_bytes) || binding.max_archive_bytes < 1 || binding.max_archive_bytes > 104857600) {
    throw new SlackArchiveError("max_archive_bytes_invalid", "max_archive_bytes_invalid");
  }

  const scope = binding.scope;
  if (scope === null || typeof scope !== "object" || Array.isArray(scope) || Object.getPrototypeOf(scope) !== Object.prototype) {
    throw new SlackArchiveError("plain_object_required", "plain_object_required");
  }

  for (const key of Object.keys(scope)) {
    if (!MCP_BINDING_SCOPE_KEYS.has(key)) {
      throw new SlackArchiveError("extra_scope_field", "extra_scope_field");
    }
  }

  for (const requiredKey of MCP_BINDING_SCOPE_KEYS) {
    if (scope[requiredKey] === undefined || scope[requiredKey] === null) {
      throw new SlackArchiveError("missing_scope_field", "missing_scope_field");
    }
  }

  if (typeof scope.binding_id !== "string" || !SAFE_REF_RE.test(scope.binding_id)) {
    throw new SlackArchiveError("safe_ref_invalid", "safe_ref_invalid");
  }
  if (typeof scope.workspace_id !== "string" || !/^T[A-Z0-9]{2,31}$/.test(scope.workspace_id)) {
    throw new SlackArchiveError("workspace_id_invalid", "workspace_id_invalid");
  }
  if (typeof scope.channel_id !== "string" || !/^C[A-Z0-9]{2,31}$/.test(scope.channel_id)) {
    throw new SlackArchiveError("channel_id_invalid", "channel_id_invalid");
  }
  if (typeof scope.project_code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(scope.project_code)) {
    throw new SlackArchiveError("project_code_invalid", "project_code_invalid");
  }

  return {
    schema_version: binding.schema_version,
    feature_enabled: true,
    private_root: normPrivateRoot,
    archive_path: normArchivePath,
    archive_sha256: binding.archive_sha256,
    max_archive_bytes: binding.max_archive_bytes,
    scope: {
      binding_id: scope.binding_id,
      workspace_id: scope.workspace_id,
      channel_id: scope.channel_id,
      project_code: scope.project_code,
    },
  };
}

const TOOL_ARGUMENT_RULES = Object.freeze({
  slack_archive_status: {
    allowedKeys: new Set([]),
    validate: () => {},
  },
  slack_archive_search: {
    allowedKeys: new Set([
      "query",
      "user_id",
      "since_message_ts",
      "until_message_ts",
      "since_message_time",
      "until_message_time",
      "since_received_at",
      "until_received_at",
      "has_attachments",
      "include_deleted",
      "limit",
    ]),
    validate: (args) => {
      if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > 200)) {
        throw new SlackArchiveError("invalid_arguments", "query_invalid");
      }
      if (args.user_id !== undefined && (typeof args.user_id !== "string" || !SLACK_USER_ID_RE.test(args.user_id))) {
        throw new SlackArchiveError("invalid_arguments", "user_id_invalid");
      }
      if (args.since_message_ts !== undefined && (typeof args.since_message_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.since_message_ts))) {
        throw new SlackArchiveError("invalid_arguments", "since_message_ts_invalid");
      }
      if (args.until_message_ts !== undefined && (typeof args.until_message_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.until_message_ts))) {
        throw new SlackArchiveError("invalid_arguments", "until_message_ts_invalid");
      }
      if (args.since_message_time !== undefined && (typeof args.since_message_time !== "string" || !UTC_RE.test(args.since_message_time))) {
        throw new SlackArchiveError("invalid_arguments", "since_message_time_invalid");
      }
      if (args.until_message_time !== undefined && (typeof args.until_message_time !== "string" || !UTC_RE.test(args.until_message_time))) {
        throw new SlackArchiveError("invalid_arguments", "until_message_time_invalid");
      }
      if (args.since_received_at !== undefined && (typeof args.since_received_at !== "string" || !UTC_RE.test(args.since_received_at))) {
        throw new SlackArchiveError("invalid_arguments", "since_received_at_invalid");
      }
      if (args.until_received_at !== undefined && (typeof args.until_received_at !== "string" || !UTC_RE.test(args.until_received_at))) {
        throw new SlackArchiveError("invalid_arguments", "until_received_at_invalid");
      }
      if (args.has_attachments !== undefined && typeof args.has_attachments !== "boolean") {
        throw new SlackArchiveError("invalid_arguments", "has_attachments_invalid");
      }
      if (args.include_deleted !== undefined && typeof args.include_deleted !== "boolean") {
        throw new SlackArchiveError("invalid_arguments", "include_deleted_invalid");
      }
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100)) {
        throw new SlackArchiveError("invalid_arguments", "limit_invalid");
      }
    },
  },
  slack_archive_thread: {
    allowedKeys: new Set(["thread_ts", "limit"]),
    requiredKeys: new Set(["thread_ts"]),
    validate: (args) => {
      if (typeof args.thread_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.thread_ts)) {
        throw new SlackArchiveError("invalid_arguments", "thread_ts_invalid");
      }
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 200)) {
        throw new SlackArchiveError("invalid_arguments", "limit_invalid");
      }
    },
  },
  slack_archive_timeline: {
    allowedKeys: new Set([
      "since_message_ts",
      "until_message_ts",
      "since_message_time",
      "until_message_time",
      "since_received_at",
      "until_received_at",
      "limit",
      "direction",
      "include_deleted",
    ]),
    validate: (args) => {
      if (args.since_message_ts !== undefined && (typeof args.since_message_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.since_message_ts))) {
        throw new SlackArchiveError("invalid_arguments", "since_message_ts_invalid");
      }
      if (args.until_message_ts !== undefined && (typeof args.until_message_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.until_message_ts))) {
        throw new SlackArchiveError("invalid_arguments", "until_message_ts_invalid");
      }
      if (args.since_message_time !== undefined && (typeof args.since_message_time !== "string" || !UTC_RE.test(args.since_message_time))) {
        throw new SlackArchiveError("invalid_arguments", "since_message_time_invalid");
      }
      if (args.until_message_time !== undefined && (typeof args.until_message_time !== "string" || !UTC_RE.test(args.until_message_time))) {
        throw new SlackArchiveError("invalid_arguments", "until_message_time_invalid");
      }
      if (args.since_received_at !== undefined && (typeof args.since_received_at !== "string" || !UTC_RE.test(args.since_received_at))) {
        throw new SlackArchiveError("invalid_arguments", "since_received_at_invalid");
      }
      if (args.until_received_at !== undefined && (typeof args.until_received_at !== "string" || !UTC_RE.test(args.until_received_at))) {
        throw new SlackArchiveError("invalid_arguments", "until_received_at_invalid");
      }
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 200)) {
        throw new SlackArchiveError("invalid_arguments", "limit_invalid");
      }
      if (args.direction !== undefined && args.direction !== "asc" && args.direction !== "desc") {
        throw new SlackArchiveError("invalid_arguments", "direction_invalid");
      }
      if (args.include_deleted !== undefined && typeof args.include_deleted !== "boolean") {
        throw new SlackArchiveError("invalid_arguments", "include_deleted_invalid");
      }
    },
  },
  slack_archive_attachment_metadata: {
    allowedKeys: new Set(["file_id", "message_ts", "limit"]),
    validate: (args) => {
      if (args.file_id !== undefined && (typeof args.file_id !== "string" || !SAFE_REF_RE.test(args.file_id))) {
        throw new SlackArchiveError("invalid_arguments", "file_id_invalid");
      }
      if (args.message_ts !== undefined && (typeof args.message_ts !== "string" || !SLACK_TIMESTAMP_RE.test(args.message_ts))) {
        throw new SlackArchiveError("invalid_arguments", "message_ts_invalid");
      }
      if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 100)) {
        throw new SlackArchiveError("invalid_arguments", "limit_invalid");
      }
    },
  },
});

function validateToolArguments(toolName, args) {
  if (args === null || typeof args !== "object" || Array.isArray(args) || Object.getPrototypeOf(args) !== Object.prototype) {
    return { valid: false, code: "invalid_arguments" };
  }

  const rules = TOOL_ARGUMENT_RULES[toolName];
  if (!rules) return { valid: false, code: "unknown_tool" };

  for (const key of Object.keys(args)) {
    if (!rules.allowedKeys.has(key)) {
      return { valid: false, code: "unknown_argument" };
    }
  }

  if (rules.requiredKeys) {
    for (const req of rules.requiredKeys) {
      if (args[req] === undefined || args[req] === null) {
        return { valid: false, code: "missing_required_argument" };
      }
    }
  }

  try {
    rules.validate(args);
    return { valid: true };
  } catch (error) {
    return { valid: false, code: error?.code || "invalid_arguments" };
  }
}

export function assertRuntimeBindingAllowed(index, runtimeBinding) {
  if (!runtimeBinding) {
    throw new SlackArchiveError("runtime_binding_required", "runtime_binding_required", 400);
  }
  if (!index || !index.binding) {
    throw new SlackArchiveError("archive_index_required", "archive_index_required", 400);
  }

  let scope;
  if (runtimeBinding.schema_version === SLACK_ARCHIVE_MCP_BINDING_SCHEMA_VERSION) {
    const validatedMcpBinding = validateSlackArchiveMcpBinding(runtimeBinding);
    scope = validatedMcpBinding.scope;
  } else {
    const validatedCanonical = validateSlackBinding(runtimeBinding);
    scope = {
      workspace_id: validatedCanonical.workspace_id,
      channel_id: validatedCanonical.channel_id,
      project_code: validatedCanonical.project_code,
      binding_id: validatedCanonical.binding_id,
    };
  }

  if (scope.workspace_id !== index.binding.workspace_id
    || scope.channel_id !== index.binding.channel_id) {
    throw new SlackArchiveError(
      "binding_scope_mismatch",
      "binding_scope_mismatch",
      403,
    );
  }
  if (scope.project_code !== index.binding.project_code) {
    throw new SlackArchiveError(
      "binding_project_mismatch",
      "binding_project_mismatch",
      403,
    );
  }
  return scope;
}

export function createSlackArchiveMcpHandlers({ index, runtimeBinding } = {}) {
  assertRuntimeBindingAllowed(index, runtimeBinding);

  return Object.freeze({
    slack_archive_status: async () => {
      assertRuntimeBindingAllowed(index, runtimeBinding);
      return index.status();
    },
    slack_archive_search: async (input = {}) => {
      assertRuntimeBindingAllowed(index, runtimeBinding);
      return index.search(input || {});
    },
    slack_archive_thread: async (input = {}) => {
      assertRuntimeBindingAllowed(index, runtimeBinding);
      return index.thread(input || {});
    },
    slack_archive_timeline: async (input = {}) => {
      assertRuntimeBindingAllowed(index, runtimeBinding);
      return index.timeline(input || {});
    },
    slack_archive_attachment_metadata: async (input = {}) => {
      assertRuntimeBindingAllowed(index, runtimeBinding);
      return index.attachment_metadata(input || {});
    },
  });
}

export function createSlackArchiveJsonRpcHandler({ index, runtimeBinding } = {}) {
  assertRuntimeBindingAllowed(index, runtimeBinding);
  const handlers = createSlackArchiveMcpHandlers({ index, runtimeBinding });
  let initialized = false;

  const toolDescriptor = (tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  });

  const callTool = async (params) => {
    const toolName = params?.name;
    const tool = SLACK_ARCHIVE_MCP_TOOLS_BY_NAME.get(toolName) ?? null;
    if (tool === null) {
      return {
        rpcError: {
          code: JSON_RPC.INVALID_PARAMS,
          message: "Unknown tool",
          data: { code: "unknown_tool" },
        },
      };
    }

    const args = params?.arguments ?? {};
    const validation = validateToolArguments(toolName, args);
    if (!validation.valid) {
      return {
        rpcError: {
          code: JSON_RPC.INVALID_PARAMS,
          message: "Invalid tool arguments",
          data: { code: validation.code },
        },
      };
    }

    const handler = handlers[toolName];
    if (!handler) {
      return {
        rpcError: {
          code: JSON_RPC.INTERNAL_ERROR,
          message: "Handler not implemented",
          data: { code: "handler_not_implemented" },
        },
      };
    }

    try {
      const outcome = await handler(args);
      return {
        result: {
          content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
          structuredContent: outcome,
          _meta: {
            workspace_id: index.binding.workspace_id,
            channel_id: index.binding.channel_id,
            project_code: index.binding.project_code,
            read_only: true,
          },
        },
      };
    } catch (error) {
      const code = error?.code || "tool_execution_failed";
      return {
        rpcError: {
          code: JSON_RPC.TOOL_REFUSED,
          message: "Tool execution failed",
          data: { code },
        },
      };
    }
  };

  return async function handleMessage(message) {
    if (message === null || typeof message !== "object" || Array.isArray(message)
      || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return { error: { code: JSON_RPC.INVALID_REQUEST, message: "Invalid JSON-RPC 2.0 request" } };
    }

    switch (message.method) {
      case "initialize": {
        const requestedVersion = message.params?.protocolVersion;
        if (requestedVersion !== undefined && requestedVersion !== null && requestedVersion !== SLACK_ARCHIVE_MCP_PROTOCOL_VERSION) {
          return {
            error: {
              code: JSON_RPC.INVALID_PARAMS,
              message: "Unsupported protocol version",
              data: { code: "unsupported_protocol_version" },
            },
          };
        }
        initialized = true;
        return {
          result: {
            protocolVersion: SLACK_ARCHIVE_MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: SLACK_ARCHIVE_MCP_SERVER_NAME,
              title: "Soulforge Slack Archive Query MCP",
              version: "0.1.0",
            },
            instructions: SLACK_ARCHIVE_MCP_INSTRUCTIONS,
            _meta: {
              workspace_id: index.binding.workspace_id,
              channel_id: index.binding.channel_id,
              project_code: index.binding.project_code,
              read_only: true,
              coverage_state: index.coverage_state,
            },
          },
        };
      }

      case "notifications/initialized":
        initialized = true;
        return { notification: true };

      case "ping":
        return { result: { _meta: { status: "ok", initialized } } };

      case "tools/list":
        if (!initialized) {
          return {
            error: {
              code: JSON_RPC.INVALID_REQUEST,
              message: "Server not initialized",
              data: { code: "server_not_initialized" },
            },
          };
        }
        return {
          result: {
            tools: SLACK_ARCHIVE_MCP_TOOLS.map(toolDescriptor),
            _meta: {
              workspace_id: index.binding.workspace_id,
              channel_id: index.binding.channel_id,
              project_code: index.binding.project_code,
            },
          },
        };

      case "tools/call": {
        if (!initialized) {
          return {
            error: {
              code: JSON_RPC.INVALID_REQUEST,
              message: "Server not initialized",
              data: { code: "server_not_initialized" },
            },
          };
        }
        const outcome = await callTool(message.params);
        return outcome.rpcError === undefined || outcome.rpcError === null
          ? { result: outcome.result }
          : { error: outcome.rpcError };
      }

      default:
        if (message.method.startsWith("notifications/")) return { notification: true };
        return {
          error: {
            code: JSON_RPC.METHOD_NOT_FOUND,
            message: "Method not found",
            data: { code: "method_not_found" },
          },
        };
    }
  };
}
