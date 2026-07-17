import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class IngressClientError extends Error {
  constructor(code, status = 502, detail = null) {
    super(code);
    this.name = "IngressClientError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function loopback(value) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(value).toLowerCase());
}

function cleanBaseUrl(value) {
  const url = new URL(String(value || "http://127.0.0.1:4312"));
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError("invalid_ingress_url");
  if (url.protocol === "http:" && !loopback(url.hostname)) throw new TypeError("ingress_https_required");
  if (url.username || url.password || url.search || url.hash) throw new TypeError("invalid_ingress_url");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

async function identity(path) {
  const info = await stat(path, { bigint: true });
  if (!info.isFile()) throw new IngressClientError("ingress_source_not_regular_file", 400);
  if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new IngressClientError("ingress_source_too_large", 413);
  return info;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function digestFile(path) {
  const before = await identity(path);
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  const after = await identity(path);
  if (!sameIdentity(before, after)) throw new IngressClientError("ingress_source_changed", 409);
  return { identity: after, sha256: hash.digest("hex"), size: Number(after.size) };
}

function toolPayload(result) {
  let payload = result?.structuredContent;
  if (!payload && result?.content?.[0]?.type === "text") {
    try { payload = JSON.parse(result.content[0].text); } catch {}
  }
  if (result?.isError) throw new IngressClientError(payload?.error || "ingress_tool_failed", 400, payload);
  if (!payload || typeof payload !== "object") throw new IngressClientError("ingress_tool_contract_invalid", 502);
  return payload;
}

export class IngressClient {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
    this.baseUrl = cleanBaseUrl(baseUrl);
    this.token = String(token || "");
    if (!/^sfig_v1_[A-Za-z0-9_-]{43}$/.test(this.token)) throw new TypeError("ingress_token_required");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1000, Math.min(120000, Number(timeoutMs) || 30000));
    this.client = null;
    this.transport = null;
  }

  async connect() {
    if (this.client) return this;
    this.client = new Client({ name: "soulforge-ingress-client", version: "0.1.0" });
    this.transport = new StreamableHTTPClientTransport(new URL(`${this.baseUrl.pathname}/mcp`.replace(/\/+/g, "/"), this.baseUrl), {
      requestInit: { headers: { Authorization: `Bearer ${this.token}` } },
    });
    try {
      await this.client.connect(this.transport);
    } catch (error) {
      this.client = null;
      this.transport = null;
      throw new IngressClientError("ingress_mcp_unreachable", 502, error?.name || null);
    }
    return this;
  }

  async close() {
    try { await this.client?.close(); } finally {
      this.client = null;
      this.transport = null;
    }
  }

  async call(name, args) {
    await this.connect();
    return toolPayload(await this.client.callTool({ name, arguments: args }));
  }

  endpoint(path) {
    const url = new URL(String(path), `${this.baseUrl.toString().replace(/\/$/, "")}/`);
    if (url.origin !== this.baseUrl.origin) throw new TypeError("invalid_ingress_path");
    return url;
  }

  async raw(path, { method = "GET", body, headers = {} } = {}) {
    let response;
    try {
      response = await this.fetchImpl(this.endpoint(path), {
        method,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...headers },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new IngressClientError("ingress_http_unreachable", 502, error?.name || null);
    }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new IngressClientError(payload?.error || "ingress_http_failed", response.status, payload);
    return payload;
  }

  async whoami() {
    return this.call("ingress_whoami", {});
  }

  async publishWorkEvent(input) {
    return this.call("ingress_publish_work_event", input);
  }

  async publishRunReceipt(input) {
    return this.call("ingress_publish_run_receipt", input);
  }

  async submissionStatus(submissionId) {
    return this.call("ingress_get_submission_status", { submission_id: submissionId });
  }

  async uploadFile({ path, projectHint, occurrenceId, idempotencyKey, mediaType }) {
    const source = await digestFile(path);
    const filename = String(path).replace(/\\/g, "/").split("/").pop();
    const prepared = await this.call("ingress_prepare_file_upload", {
      project_hint: projectHint,
      occurrence_id: occurrenceId,
      idempotency_key: idempotencyKey,
      filename,
      size: source.size,
      sha256: source.sha256,
      media_type: mediaType,
    });
    const uploadUrl = new URL(prepared.upload_url);
    if (uploadUrl.origin !== this.baseUrl.origin || !/^\/ingress\/uploads\/sfigup_[A-Za-z0-9_-]{32}$/.test(uploadUrl.pathname)) {
      throw new IngressClientError("ingress_upload_url_invalid", 502);
    }
    let offset = Number(prepared.received_size);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.size) {
      throw new IngressClientError("ingress_upload_offset_invalid", 502);
    }
    const chunkBytes = Number(prepared.chunk_bytes);
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw new IngressClientError("ingress_chunk_contract_invalid", 502);
    const handle = await open(path, "r");
    try {
      while (offset < source.size) {
        const bytes = Buffer.alloc(Math.min(chunkBytes, source.size - offset));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
        if (bytesRead !== bytes.length) throw new IngressClientError("ingress_source_read_incomplete", 409);
        try {
          const progress = await this.raw(`${uploadUrl.pathname}?offset=${offset}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(bytes.length),
            },
            body: bytes,
          });
          if (progress.received_size !== offset + bytes.length) throw new IngressClientError("ingress_progress_invalid", 502);
          offset = progress.received_size;
        } catch (error) {
          if (error.code !== "upload_offset_conflict" || !Number.isSafeInteger(error.detail?.received_size)
            || error.detail.received_size < 0 || error.detail.received_size > source.size) throw error;
          offset = error.detail.received_size;
        }
      }
    } finally {
      await handle.close();
    }
    const after = await identity(path);
    if (!sameIdentity(source.identity, after)) throw new IngressClientError("ingress_source_changed", 409);
    return this.raw(`${uploadUrl.pathname}/finalize`, { method: "POST" });
  }
}
