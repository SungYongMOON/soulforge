import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import { createHash } from "node:crypto";
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

export function createSlackWebApiPollingTransport({
  apiCall,
  binding,
  hosted_file_transport: hostedFileTransport = null,
}) {
  const adapter = createSlackWebApiCompatibleAdapter({ apiCall });
  if (!binding || typeof binding !== "object") fail("binding_required", "A validated Slack binding is required");
  const transport = {
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
  };
  if (hostedFileTransport !== null) {
    if (typeof hostedFileTransport?.fetchHostedFile !== "function") {
      fail("hosted_file_transport_invalid", "Hosted file transport must expose fetchHostedFile");
    }
    transport.fetchHostedFile = (request) => hostedFileTransport.fetchHostedFile(request);
  }
  return Object.freeze(transport);
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

const SLACK_ACCESS_TOKEN_PATTERN = /^xox[bp]-[A-Za-z0-9-]{10,}$/u;

export async function loadSlackAccessToken(credentials, environment = process.env, options = {}) {
  const envName = credentials?.access_token_env ?? credentials?.bot_token_env;
  const filePath = credentials?.access_token_file ?? credentials?.bot_token_file;
  const fromEnvironment = envName ? String(environment[envName] ?? "").trim() : "";
  let fromFile = "";
  if (!fromEnvironment && filePath) fromFile = await readApprovedCredentialFile(filePath, options);
  const token = fromEnvironment || fromFile;
  if (!SLACK_ACCESS_TOKEN_PATTERN.test(token)) {
    fail("access_token_unavailable", "A valid Slack access token was not available from the approved private source");
  }
  return token;
}

export async function loadSlackBotToken(credentials, environment = process.env, options = {}) {
  let token;
  try {
    token = await loadSlackAccessToken(credentials, environment, options);
  } catch (error) {
    if (error instanceof SlackTransportError && error.code === "access_token_unavailable") {
      fail("bot_token_unavailable", "A valid bot token was not available from the approved private source");
    }
    throw error;
  }
  if (!/^xoxb-[A-Za-z0-9-]{10,}$/u.test(token)) {
    fail("bot_token_unavailable", "A valid bot token was not available from the approved private source");
  }
  return token;
}

export function createSlackWebApiCall({
  access_token: accessToken,
  bot_token: legacyBotToken,
  fetch_impl: fetchImpl = globalThis.fetch,
  timeout_ms: timeoutMs = 15_000,
}) {
  const token = accessToken ?? legacyBotToken;
  if (!SLACK_ACCESS_TOKEN_PATTERN.test(String(token ?? ""))) {
    fail("access_token_invalid", "A Slack bot or user access token is required");
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
          authorization: `Bearer ${token}`,
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

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

function assertSlackFileUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("attachment_url_invalid", "Slack file locator was invalid");
  }
  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(["files.slack.com", "files-origin.slack.com"]);
  if (parsed.protocol !== "https:"
    || !allowedHosts.has(host)
    || !["", "443"].includes(parsed.port)
    || parsed.username !== ""
    || parsed.password !== "") {
    fail("attachment_url_not_slack_owned", "Slack file locator failed the exact HTTPS host and port guard");
  }
  return parsed.href;
}

function attachmentPolicy(policy) {
  if (!policy || typeof policy !== "object") fail("attachment_policy_required", "Attachment policy is required");
  for (const key of [
    "max_file_bytes",
    "timeout_ms",
    "max_retries",
    "max_retry_after_seconds",
  ]) {
    if (!Number.isSafeInteger(policy[key])) fail("attachment_policy_invalid", "Attachment policy limits must be integers");
  }
  if (!Array.isArray(policy.allowed_mime_types) || !Array.isArray(policy.allowed_file_types)) {
    fail("attachment_policy_invalid", "Attachment policy allowlists are required");
  }
  return policy;
}

function retryAfterSeconds(response, policy) {
  const raw = String(headerValue(response?.headers, "retry-after") ?? "");
  if (!/^\d{1,3}$/u.test(raw)) fail("attachment_retry_after_invalid", "Slack retry delay was absent or invalid");
  const seconds = Number.parseInt(raw, 10);
  if (seconds > policy.max_retry_after_seconds) {
    fail("attachment_retry_after_exceeds_limit", "Slack retry delay exceeded the binding limit");
  }
  return seconds;
}

async function boundedSlackFetch({
  fetchImpl,
  request,
  policy,
  sleepImpl,
  operation,
}) {
  for (let attempt = 0; attempt <= policy.max_retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeout_ms);
    timeout.unref?.();
    try {
      const response = await fetchImpl(request.url, {
        ...request.options,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status === 429) {
        if (attempt >= policy.max_retries) {
          fail("attachment_retry_exhausted", `${operation} exhausted its bounded retry count`);
        }
        const seconds = retryAfterSeconds(response, policy);
        clearTimeout(timeout);
        await sleepImpl(seconds * 1000);
        continue;
      }
      return { response, controller, timeout };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof SlackTransportError) throw error;
      if (controller.signal.aborted) {
        fail("attachment_timeout", `${operation} exceeded its bounded timeout`);
      }
      fail("attachment_network_failed", `${operation} failed`);
    }
  }
  fail("attachment_retry_exhausted", `${operation} exhausted its bounded retry count`);
}

async function parseSlackJson(fetchState, operation) {
  try {
    return await fetchState.response.json();
  } catch (error) {
    if (fetchState.controller.signal.aborted) {
      fail("attachment_timeout", `${operation} exceeded its bounded timeout`);
    }
    fail("attachment_response_invalid", `${operation} returned invalid JSON`);
  } finally {
    clearTimeout(fetchState.timeout);
  }
}

function validateHostedFileMetadata(file, declaredFile, workspaceId, policy) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    fail("attachment_metadata_invalid", "files.info returned no file metadata");
  }
  if (file.id !== declaredFile.id || !/^F[A-Z0-9]{2,31}$/u.test(String(file.id ?? ""))) {
    fail("attachment_file_id_mismatch", "files.info returned a different file ID");
  }
  const workspaceClaims = [file.team_id, file.user_team].filter((value) => value !== undefined && value !== null);
  if (workspaceClaims.length === 0 || workspaceClaims.some((value) => value !== workspaceId)) {
    fail("attachment_workspace_mismatch", "Slack file metadata did not match the bound workspace");
  }
  if (file.mode !== "hosted"
    || file.is_external !== false
    || ![null, undefined, ""].includes(file.external_type)
    || file.file_access !== "visible"
    || file.deleted === true) {
    fail("attachment_not_safe_hosted_file", "Slack file state is not an allowed hosted-file state");
  }
  const size = file.size;
  const mimeType = String(file.mimetype ?? "").toLowerCase();
  const fileType = String(file.filetype ?? "").toLowerCase();
  if (!Number.isSafeInteger(size) || size < 0 || size !== declaredFile.size) {
    fail("attachment_declared_size_mismatch", "Slack file size did not match the message declaration");
  }
  if (size > policy.max_file_bytes) fail("attachment_file_too_large", "Slack file exceeded the per-file byte limit");
  if (mimeType !== declaredFile.mimetype || !policy.allowed_mime_types.includes(mimeType)) {
    fail("attachment_mime_not_allowed", "Slack file MIME type was mismatched or not allowed");
  }
  if (fileType !== declaredFile.filetype || !policy.allowed_file_types.includes(fileType)) {
    fail("attachment_type_not_allowed", "Slack file type was mismatched or not allowed");
  }
  const locator = file.url_private_download || file.url_private;
  if (typeof locator !== "string" || locator.length === 0) {
    fail("attachment_locator_missing", "Slack hosted file had no private download locator");
  }
  const revisionBasis = {
    file_id: file.id,
    timestamp: String(file.timestamp ?? file.created ?? ""),
    size_bytes: size,
    mime_type: mimeType,
    file_type: fileType,
  };
  if (!/^\d{1,20}$/u.test(revisionBasis.timestamp)) {
    fail("attachment_revision_unknown", "Slack file metadata had no stable revision timestamp");
  }
  return {
    file_id: file.id,
    revision_ref: `slack-file-rev:${sha256Canonical(revisionBasis).slice("sha256:".length)}`,
    size_bytes: size,
    mime_type: mimeType,
    file_type: fileType,
    download_url: assertSlackFileUrl(locator),
  };
}

async function readBoundedFileBody(fetchState, metadata, policy) {
  const { response, controller, timeout } = fetchState;
  let activeReader = null;
  try {
    if (response.status >= 300 && response.status < 400) {
      fail("attachment_redirect_forbidden", "Authenticated file downloads never follow redirects");
    }
    if (!response.ok) fail("attachment_download_http_failed", "Slack file download returned a non-success status");
    const contentLength = headerValue(response.headers, "content-length");
    if (contentLength !== null && contentLength !== undefined) {
      if (!/^\d+$/u.test(String(contentLength))) {
        fail("attachment_content_length_invalid", "Slack file Content-Length was invalid");
      }
      const declaredLength = Number.parseInt(String(contentLength), 10);
      if (!Number.isSafeInteger(declaredLength)
        || declaredLength > policy.max_file_bytes
        || declaredLength !== metadata.size_bytes) {
        fail("attachment_content_length_mismatch", "Slack file Content-Length violated declared bounds");
      }
    }
    const responseMime = String(headerValue(response.headers, "content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (responseMime && responseMime !== metadata.mime_type) {
      fail("attachment_response_mime_mismatch", "Slack file response MIME type differed from files.info");
    }

    const chunks = [];
    const digest = createHash("sha256");
    let size = 0;
    const retainChunk = (value) => {
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > policy.max_file_bytes || size > metadata.size_bytes) {
        fail("attachment_stream_too_large", "Slack file stream exceeded its byte cap");
      }
      digest.update(chunk);
      chunks.push(chunk);
    };
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      activeReader = reader;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        retainChunk(value);
      }
      activeReader = null;
    } else if (response.body && typeof response.body[Symbol.asyncIterator] === "function") {
      for await (const chunk of response.body) retainChunk(chunk);
    } else if (typeof response.arrayBuffer === "function") {
      retainChunk(new Uint8Array(await response.arrayBuffer()));
    } else {
      fail("attachment_body_unreadable", "Slack file response had no readable byte stream");
    }
    if (size !== metadata.size_bytes) {
      fail("attachment_stream_truncated", "Slack file stream did not match its declared size");
    }
    return {
      ...metadata,
      bytes: Buffer.concat(chunks, size),
      content_sha256: `sha256:${digest.digest("hex")}`,
    };
  } catch (error) {
    controller.abort();
    if (activeReader !== null) await activeReader.cancel().catch(() => {});
    else if (typeof response.body?.destroy === "function") response.body.destroy();
    if (error instanceof SlackTransportError) throw error;
    if (controller.signal.aborted) fail("attachment_timeout", "Slack file download exceeded its bounded timeout");
    fail("attachment_network_failed", "Slack file download failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function createSlackHostedFileTransport({
  access_token: accessToken,
  bot_token: legacyBotToken,
  fetch_impl: fetchImpl = globalThis.fetch,
  policy,
  sleep_impl: sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const token = accessToken ?? legacyBotToken;
  if (!SLACK_ACCESS_TOKEN_PATTERN.test(String(token ?? ""))) {
    fail("access_token_invalid", "A Slack bot or user access token is required");
  }
  if (typeof fetchImpl !== "function" || typeof sleepImpl !== "function") {
    fail("attachment_transport_invalid", "Fetch and sleep implementations are required");
  }
  const retainedPolicy = attachmentPolicy(policy);
  return Object.freeze({
    kind: "slack_hosted_files",
    async fetchHostedFile({ declared_file: declaredFile, workspace_id: workspaceId }) {
      if (!declaredFile || typeof declaredFile !== "object") {
        fail("attachment_declaration_invalid", "A bounded message file declaration is required");
      }
      const infoState = await boundedSlackFetch({
        fetchImpl,
        policy: retainedPolicy,
        sleepImpl,
        operation: "files.info",
        request: {
          url: "https://slack.com/api/files.info",
          options: {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ file: String(declaredFile.id ?? "") }),
          },
        },
      });
      if (!infoState.response.ok) {
        clearTimeout(infoState.timeout);
        fail("attachment_files_info_http_failed", "files.info returned a non-success status");
      }
      const infoBody = await parseSlackJson(infoState, "files.info");
      if (infoBody?.ok !== true) {
        const safeCode = /^[a-z0-9_]{1,80}$/u.test(String(infoBody?.error ?? ""))
          ? infoBody.error
          : "unknown_error";
        fail("attachment_files_info_failed", `files.info failed with ${safeCode}`);
      }
      const metadata = validateHostedFileMetadata(
        infoBody.file,
        declaredFile,
        workspaceId,
        retainedPolicy,
      );
      const downloadState = await boundedSlackFetch({
        fetchImpl,
        policy: retainedPolicy,
        sleepImpl,
        operation: "file download",
        request: {
          url: metadata.download_url,
          options: {
            method: "GET",
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        },
      });
      return readBoundedFileBody(downloadState, metadata, retainedPolicy);
    },
  });
}
