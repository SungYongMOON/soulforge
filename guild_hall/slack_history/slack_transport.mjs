import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import fs from "node:fs/promises";
import path from "node:path";

export class SlackTransportError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "SlackTransportError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SlackTransportError(code, message);
}

function assertLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    fail("transport_limit_invalid", "limit must be an integer from 1 to 1000");
  }
}

export function createSyntheticSlackTransport(records) {
  if (!Array.isArray(records)) fail("synthetic_records_invalid", "records must be an array");
  const retained = structuredClone(records);
  return Object.freeze({
    kind: "synthetic",
    async pull({ cursor_token: cursorToken = null, limit }) {
      assertLimit(limit);
      const offset = cursorToken === null
        ? 0
        : Number.parseInt(cursorToken.replace(/^synthetic:/u, ""), 10);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > retained.length) {
        fail("synthetic_cursor_invalid", "cursor token is outside the fixture");
      }
      const pageRecords = retained.slice(offset, offset + limit);
      const nextOffset = offset + pageRecords.length;
      const nextToken = nextOffset >= retained.length ? null : `synthetic:${nextOffset}`;
      return {
        page_id: `synthetic-page:${offset}:${nextOffset}`,
        previous_cursor_digest: cursorToken === null ? null : sha256Canonical(cursorToken),
        next_cursor_digest: nextToken === null ? null : sha256Canonical(nextToken),
        next_cursor_token: nextToken,
        records: structuredClone(pageRecords),
      };
    },
  });
}

export function createSlackWebApiCompatibleAdapter({ apiCall }) {
  if (typeof apiCall !== "function") {
    fail("api_call_required", "apiCall(method, params) must be injected");
  }
  return Object.freeze({
    kind: "web_api",
    async inspectAuth() {
      return apiCall("auth.test", {});
    },
    async inspectChannel({ channel_id: channelId }) {
      return apiCall("conversations.info", {
        channel: channelId,
        include_num_members: false,
      });
    },
    async pullHistoryPage({ channel_id: channelId, cursor_token: cursorToken = null, limit }) {
      assertLimit(limit);
      return apiCall("conversations.history", {
        channel: channelId,
        cursor: cursorToken ?? undefined,
        inclusive: true,
        limit,
      });
    },
  });
}

function messageOccurredAt(message) {
  const timestamp = Number.parseFloat(String(message?.edited?.ts ?? message?.ts ?? ""));
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    fail("message_timestamp_invalid", "Slack message has no valid source timestamp");
  }
  return new Date(Math.round(timestamp * 1000)).toISOString();
}

function validateChannelAgainstBinding(channel, binding) {
  if (!channel || channel.id !== binding.channel_id) {
    fail("channel_identity_mismatch", "Slack returned a different channel");
  }
  if (channel.is_private === true
    || channel.is_shared === true
    || channel.is_ext_shared === true
    || channel.is_archived === true
    || channel.is_member !== true) {
    fail("unsafe_live_channel", "Only a joined, public, nonshared, active channel is allowed");
  }
}

function webMessageRecord(message, binding, channel) {
  if (!message || message.type !== "message" || typeof message.ts !== "string") {
    fail("web_api_message_invalid", "conversations.history returned an unsupported item");
  }
  const digest = sha256Canonical(message).slice("sha256:".length);
  return {
    event_id: `EvWeb:${digest.slice(0, 24)}`,
    retry_num: 0,
    retry_reason: null,
    received_at: messageOccurredAt(message),
    workspace_id: binding.workspace_id,
    channel_id: binding.channel_id,
    channel_kind: "project",
    is_private: channel.is_private === true,
    is_shared: channel.is_shared === true,
    is_ext_shared: channel.is_ext_shared === true,
    is_archived: channel.is_archived === true,
    is_member: channel.is_member === true,
    source_refs: [`slack-web:${digest.slice(0, 32)}`],
    raw_event: structuredClone(message),
  };
}

export function createSlackWebApiPollingTransport({ apiCall, binding }) {
  const adapter = createSlackWebApiCompatibleAdapter({ apiCall });
  if (!binding || typeof binding !== "object") fail("binding_required", "A validated Slack binding is required");
  return Object.freeze({
    kind: "web_api",
    async pull({ cursor_token: cursorToken = null, limit }) {
      assertLimit(limit);
      const authResponse = await adapter.inspectAuth();
      if (authResponse?.ok !== true || authResponse.team_id !== binding.workspace_id) {
        fail("token_workspace_mismatch", "Slack token is not bound to the configured workspace");
      }
      const channelResponse = await adapter.inspectChannel({ channel_id: binding.channel_id });
      if (channelResponse?.ok !== true) fail("channel_probe_failed", "conversations.info did not succeed");
      validateChannelAgainstBinding(channelResponse.channel, binding);
      const historyResponse = await adapter.pullHistoryPage({
        channel_id: binding.channel_id,
        cursor_token: cursorToken,
        limit: Math.min(limit, 15),
      });
      if (historyResponse?.ok !== true || !Array.isArray(historyResponse.messages)) {
        fail("history_pull_failed", "conversations.history did not return a message page");
      }
      const nextToken = String(historyResponse.response_metadata?.next_cursor ?? "").trim() || null;
      const records = historyResponse.messages.map((message) => webMessageRecord(
        message,
        binding,
        channelResponse.channel,
      ));
      const pageBasis = {
        channel_id: binding.channel_id,
        cursor_digest: cursorToken === null ? null : sha256Canonical(cursorToken),
        next_cursor_digest: nextToken === null ? null : sha256Canonical(nextToken),
        event_ids: records.map((record) => record.event_id),
      };
      return {
        page_id: `slack-web-page:${sha256Canonical(pageBasis).slice("sha256:".length, "sha256:".length + 24)}`,
        previous_cursor_digest: cursorToken === null ? null : sha256Canonical(cursorToken),
        next_cursor_digest: nextToken === null ? null : sha256Canonical(nextToken),
        next_cursor_token: nextToken,
        records,
        coverage_gaps: [
          "polling_cannot_prove_deleted_messages",
          "polling_cannot_reconstruct_pre_activation_edit_history",
        ],
      };
    },
  });
}

function normalizedBoundaryPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathWithin(parent, candidate, strict = false) {
  const relative = path.relative(
    normalizedBoundaryPath(parent),
    normalizedBoundaryPath(candidate),
  );
  if (relative === "") return !strict;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function readApprovedCredentialFile(filePath, options) {
  const privateRoot = options?.private_root;
  const dataRoot = options?.data_root;
  const forbiddenRoots = options?.forbidden_roots;
  if (typeof privateRoot !== "string"
    || !path.isAbsolute(privateRoot)
    || (dataRoot !== undefined && (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)))
    || !Array.isArray(forbiddenRoots)
    || forbiddenRoots.some((root) => typeof root !== "string" || !path.isAbsolute(root))) {
    fail("credential_boundary_required", "Credential file loading requires validated private boundaries");
  }
  if (!isPathWithin(privateRoot, filePath, true)
    || (dataRoot && (isPathWithin(dataRoot, filePath) || isPathWithin(filePath, dataRoot)))
    || forbiddenRoots.some((root) => isPathWithin(root, filePath) || isPathWithin(filePath, root))) {
    fail("credential_file_outside_owner", "Credential file is outside its approved private boundary");
  }

  const rootInfo = await fs.lstat(privateRoot);
  const fileInfo = await fs.lstat(filePath);
  if (!rootInfo.isDirectory()
    || rootInfo.isSymbolicLink()
    || !fileInfo.isFile()
    || fileInfo.isSymbolicLink()
    || fileInfo.nlink !== 1
    || fileInfo.size < 1
    || fileInfo.size > 4096) {
    fail("credential_file_unsafe", "Credential source must be a bounded normal file under a normal private root");
  }
  const [realRoot, realFile] = await Promise.all([
    fs.realpath(privateRoot),
    fs.realpath(filePath),
  ]);
  if (!isPathWithin(realRoot, realFile, true)
    || (dataRoot && (isPathWithin(dataRoot, realFile) || isPathWithin(realFile, dataRoot)))
    || forbiddenRoots.some((root) => isPathWithin(root, realFile) || isPathWithin(realFile, root))) {
    fail("credential_file_identity_escape", "Credential source resolves outside its approved private boundary");
  }

  const handle = await fs.open(filePath, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile()
      || opened.nlink !== 1
      || String(opened.dev) !== String(fileInfo.dev)
      || String(opened.ino) !== String(fileInfo.ino)
      || opened.size !== fileInfo.size) {
      fail("credential_file_identity_changed", "Credential source changed before it was opened");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (String(after.dev) !== String(opened.dev)
      || String(after.ino) !== String(opened.ino)
      || after.nlink !== 1
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs) {
      fail("credential_file_identity_changed", "Credential source changed while it was read");
    }
    return bytes.toString("utf8").replace(/^\uFEFF/u, "").trim();
  } finally {
    await handle.close();
  }
}

export async function loadSlackBotToken(credentials, environment = process.env, options = {}) {
  const envName = credentials?.bot_token_env;
  const filePath = credentials?.bot_token_file;
  const fromEnvironment = envName ? String(environment[envName] ?? "").trim() : "";
  let fromFile = "";
  if (!fromEnvironment && filePath) fromFile = await readApprovedCredentialFile(filePath, options);
  const token = fromEnvironment || fromFile;
  if (!/^xoxb-[A-Za-z0-9-]{10,}$/u.test(token)) {
    fail("bot_token_unavailable", "A valid bot token was not available from the approved private source");
  }
  return token;
}

export function createSlackWebApiCall({
  bot_token: botToken,
  fetch_impl: fetchImpl = globalThis.fetch,
  timeout_ms: timeoutMs = 15_000,
}) {
  if (!/^xoxb-[A-Za-z0-9-]{10,}$/u.test(String(botToken ?? ""))) {
    fail("bot_token_invalid", "A bot token is required");
  }
  if (typeof fetchImpl !== "function") fail("fetch_unavailable", "fetch implementation is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    fail("slack_timeout_invalid", "Slack request timeout must be an integer from 100 to 60000 milliseconds");
  }
  return async function apiCall(method, params) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();
    let response;
    let body;
    try {
      response = await fetchImpl(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${botToken}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(
          Object.entries(params ?? {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
        ),
        signal: controller.signal,
      });
      if (!response.ok) fail("slack_http_failed", `Slack HTTP status ${response.status}`);
      body = await response.json();
    } catch (error) {
      if (error instanceof SlackTransportError) throw error;
      if (controller.signal.aborted) {
        fail("slack_http_timeout", "Slack request exceeded its bounded timeout");
      }
      fail("slack_http_failed", "Slack request failed");
    } finally {
      clearTimeout(timeout);
    }
    if (body?.ok !== true) {
      const safeCode = /^[a-z0-9_]{1,80}$/u.test(String(body?.error ?? "")) ? body.error : "unknown_error";
      fail("slack_api_failed", safeCode);
    }
    return body;
  };
}
