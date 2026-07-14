#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { ErpClient } from "./src/erp_client.mjs";
import { createErpMcpToolServer } from "./src/tools.mjs";

const UPLOAD_MAX = 25 * 1024 * 1024;
const UPLOAD_TICKET_RE = /^sfup_v1_[A-Za-z0-9_-]{43}$/;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

async function readRawBody(req, maxBytes = UPLOAD_MAX) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("upload_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function hostName(req) {
  try { return new URL(`http://${req.headers.host || ""}`).hostname.toLowerCase(); }
  catch { return ""; }
}

function loopbackHost(value) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(value).toLowerCase());
}

export function assertSafeBindHost(host, { allowInsecureHttp = false } = {}) {
  if (!loopbackHost(host) && !allowInsecureHttp) throw new Error("bind_loopback_required");
}

function protectListen(server, { allowInsecureHttp }) {
  const nativeListen = server.listen;
  server.listen = function secureListen(...args) {
    const options = args[0];
    let host = null;
    if (options && typeof options === "object" && !ArrayBuffer.isView(options)) {
      host = Object.hasOwn(options, "path") ? null : String(options.host || "");
    } else if (typeof options === "number") {
      host = typeof args[1] === "string" ? args[1] : "";
    }
    if (host !== null) assertSafeBindHost(host, { allowInsecureHttp });
    return Reflect.apply(nativeListen, this, args);
  };
  return server;
}

export function createErpMcpHttpServer({
  erpBaseUrl = process.env.ERP_MCP_ERP_BASE_URL || "http://127.0.0.1:4300",
  publicUrl = process.env.ERP_MCP_PUBLIC_URL || "http://127.0.0.1:4311",
  allowedHosts = process.env.ERP_MCP_ALLOWED_HOSTS || "",
  allowInsecureHttp = process.env.ERP_MCP_ALLOW_INSECURE_HTTP === "1",
  erpClient = null,
} = {}) {
  const publicEndpoint = new URL(publicUrl);
  if (publicEndpoint.protocol !== "https:" && !loopbackHost(publicEndpoint.hostname) && !allowInsecureHttp) {
    throw new Error("public_https_required");
  }
  const allowed = new Set(
    ["127.0.0.1", "localhost", "::1", publicEndpoint.hostname, ...String(allowedHosts).split(",")]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const client = erpClient || new ErpClient({ baseUrl: erpBaseUrl, allowInsecureHttp });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!allowed.has(hostName(req))) return sendJson(res, 421, { error: "host_not_allowed" });
    if (url.pathname === "/health" && req.method === "GET") return sendJson(res, 200, { ok: true, service: "soulforge-erp-mcp" });

    if (url.pathname.startsWith("/upload/") && req.method === "PUT") {
      let ticket;
      try {
        ticket = decodeURIComponent(url.pathname.slice("/upload/".length));
      } catch {
        return sendJson(res, 400, { error: "upload_ticket_malformed" });
      }
      if (!UPLOAD_TICKET_RE.test(ticket)) return sendJson(res, 401, { error: "upload_ticket_invalid" });
      try {
        const bytes = await readRawBody(req);
        const result = await client.upload(`/api/mcp/uploads/${encodeURIComponent(ticket)}`, bytes);
        return sendJson(res, 201, result);
      } catch (error) {
        return sendJson(res, error?.status || 502, { error: error?.code || error?.message || "upload_failed" });
      }
    }

    if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "not_found" });
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return sendJson(res, 401, { error: "mcp_auth_required" });
    const token = match[1].trim();
    try {
      await client.request("/api/mcp/whoami", { token });
    } catch (error) {
      return sendJson(res, error?.status === 401 ? 401 : 502, { error: error?.code || "mcp_auth_failed" });
    }

    const mcpServer = createErpMcpToolServer({ erpClient: client, token, publicUrl: publicEndpoint });
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
  return protectListen(server, { allowInsecureHttp });
}

function option(name, fallback) {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const host = option("host", process.env.ERP_MCP_HOST || "127.0.0.1");
  const port = Number(option("port", process.env.ERP_MCP_PORT || 4311));
  const server = createErpMcpHttpServer();
  server.listen(port, host, () => {
    console.log(`[dev-erp-mcp] listening on ${host}:${port}; ERP API ${process.env.ERP_MCP_ERP_BASE_URL || "http://127.0.0.1:4300"}`);
  });
}
