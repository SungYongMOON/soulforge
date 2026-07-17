#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createIngressMcpService, IngressMcpError } from "./src/ingress_mcp_service.mjs";
import { createIngressMcpToolServer } from "./src/ingress_tools.mjs";

const TICKET_RE = /^\/ingress\/uploads\/(sfigup_[A-Za-z0-9_-]{32})(\/finalize)?$/;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  res.end(body);
}

function hostName(req) {
  try { return new URL(`http://${req.headers.host || ""}`).hostname.toLowerCase(); }
  catch { return ""; }
}

function authorization(req) {
  const value = String(req.headers.authorization || "");
  return /^Bearer\s+\S+$/i.test(value) ? value : "";
}

async function readChunk(req, maxBytes) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/octet-stream")) {
    throw new IngressMcpError("upload_content_type_invalid", 415);
  }
  const length = Number(req.headers["content-length"]);
  if (!Number.isSafeInteger(length) || length < 1 || length > maxBytes) {
    throw new IngressMcpError("upload_chunk_length_invalid", length > maxBytes ? 413 : 400);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes || total > length) throw new IngressMcpError("upload_chunk_too_large", 413);
    chunks.push(chunk);
  }
  if (total !== length) throw new IngressMcpError("upload_chunk_length_mismatch", 400);
  return Buffer.concat(chunks);
}

function protectListen(server) {
  const nativeListen = server.listen;
  server.listen = function loopbackOnly(...args) {
    const options = args[0];
    let host = null;
    if (options && typeof options === "object" && !ArrayBuffer.isView(options)) {
      host = Object.hasOwn(options, "path") ? null : String(options.host || "");
    } else if (typeof options === "number") {
      host = typeof args[1] === "string" ? args[1] : "";
    }
    if (host !== null && host !== "127.0.0.1") throw new Error("ingress_mcp_loopback_bind_required");
    return Reflect.apply(nativeListen, this, args);
  };
  return server;
}

function errorResponse(res, error) {
  const status = Number.isSafeInteger(error?.status) ? error.status : 500;
  return sendJson(res, status, { error: error?.code || "ingress_mcp_failed" });
}

export async function createIngressMcpHttpServer({ configPath, service: providedService = null } = {}) {
  const service = providedService || await createIngressMcpService({ configPath });
  if (!service.config.enabled) throw new Error("ingress_mcp_feature_off");
  const allowedHosts = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
    service.config.publicUrl.hostname.toLowerCase(),
  ]);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!allowedHosts.has(hostName(req))) return sendJson(res, 421, { error: "host_not_allowed" });
    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        service: "soulforge-ingress-mcp",
        node_id: service.config.nodeId,
        exposure: "loopback_only",
        official_history_writer: false,
      });
    }

    const upload = url.pathname.match(TICKET_RE);
    if (upload) {
      let principal;
      try {
        principal = await service.authenticate(authorization(req));
      } catch (error) {
        return errorResponse(res, error);
      }
      const ticketId = upload[1];
      try {
        if (!upload[2] && req.method === "GET") {
          return sendJson(res, 200, await service.uploadStatus(principal, ticketId));
        }
        if (!upload[2] && req.method === "PUT") {
          const offset = Number(url.searchParams.get("offset"));
          const bytes = await readChunk(req, service.config.chunkBytes);
          return sendJson(res, 200, await service.appendChunk(principal, ticketId, offset, bytes));
        }
        if (upload[2] && req.method === "POST") {
          if (req.headers["transfer-encoding"] || Number(req.headers["content-length"] || 0) !== 0) {
            return sendJson(res, 400, { error: "finalize_body_forbidden" });
          }
          return sendJson(res, 200, await service.finalizeUpload(principal, ticketId));
        }
        return sendJson(res, 405, { error: "method_not_allowed" });
      } catch (error) {
        if (error?.code === "upload_offset_conflict") {
          return sendJson(res, 409, { error: error.code, received_size: error.receivedSize });
        }
        return errorResponse(res, error);
      }
    }

    if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "not_found" });
    let principal;
    try {
      principal = await service.authenticate(authorization(req));
    } catch (error) {
      return errorResponse(res, error);
    }
    const mcpServer = createIngressMcpToolServer({
      service,
      principal,
      publicUrl: service.config.publicUrl,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) sendJson(res, 500, { error: "mcp_transport_failed" });
    }
  });
  return protectListen(server);
}

function configArgument(args) {
  if (args.length !== 2 || args[0] !== "--config" || !args[1]) throw new Error("usage: --config <absolute-path>");
  return args[1];
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const service = await createIngressMcpService({ configPath: configArgument(process.argv.slice(2)) });
    const server = await createIngressMcpHttpServer({ service });
    server.listen(service.config.listenPort, service.config.listenHost, () => {
      console.log(`[soulforge-ingress-mcp] listening loopback on ${service.config.listenHost}:${service.config.listenPort}`);
    });
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "error", code: error?.code || error?.message || "ingress_mcp_start_failed" })}\n`);
    process.exitCode = 1;
  }
}
