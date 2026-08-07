#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { CompanyMailEventStore } from "./src/company_mail_store.mjs";
import { createCompanyMailMcpToolServer } from "./src/company_mail_tools.mjs";

export const COMPANY_MAIL_TUNNEL_AUTH_HEADER = "x-soulforge-mcp-token";

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

function hostName(req) {
  try {
    return new URL(`http://${req.headers.host || ""}`).hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  } catch {
    return "";
  }
}

function isLoopback(value) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(value).toLowerCase());
}

export function assertCompanyMailBindHost(host) {
  if (!isLoopback(host)) throw new Error("company_mail_bind_loopback_required");
}

function protectListen(server) {
  const nativeListen = server.listen;
  server.listen = function secureListen(...args) {
    const options = args[0];
    let host = null;
    if (options && typeof options === "object" && !ArrayBuffer.isView(options)) {
      host = Object.hasOwn(options, "path") ? null : String(options.host || "");
    } else if (typeof options === "number") {
      host = typeof args[1] === "string" ? args[1] : "";
    }
    if (host !== null) assertCompanyMailBindHost(host);
    return Reflect.apply(nativeListen, this, args);
  };
  return server;
}

function requiredSecret(value) {
  const token = String(value || "");
  if (token.length < 32 || token.length > 4096) throw new Error("company_mail_mcp_token_invalid");
  return token;
}

function sameToken(left, right) {
  const expected = Buffer.from(left, "utf8");
  const received = Buffer.from(right, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function requestHasValidToken(req, expectedToken) {
  const bearerMatch = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const tunnelHeader = req.headers[COMPANY_MAIL_TUNNEL_AUTH_HEADER];
  const candidates = [bearerMatch?.[1]?.trim()];
  if (Array.isArray(tunnelHeader)) candidates.push(...tunnelHeader);
  else candidates.push(tunnelHeader);
  return candidates.some((candidate) => candidate && sameToken(expectedToken, String(candidate).trim()));
}

export function createCompanyMailMcpHttpServer({ eventRoot, mailboxId, token, store = null } = {}) {
  const expectedToken = requiredSecret(token || process.env.SOULFORGE_COMPANY_MAIL_MCP_TOKEN);
  const eventStore = store || new CompanyMailEventStore({
    eventRoot: eventRoot || process.env.SOULFORGE_COMPANY_MAIL_EVENT_ROOT,
    mailboxId: mailboxId || process.env.SOULFORGE_COMPANY_MAIL_MAILBOX_ID,
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (!isLoopback(hostName(req))) return sendJson(res, 421, { error: "host_not_allowed" });
    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, service: "soulforge-company-mail-mcp", mode: "read_only" });
    }
    if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "not_found" });
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });

    if (!requestHasValidToken(req, expectedToken)) return sendJson(res, 401, { error: "mcp_auth_invalid" });

    const mcpServer = createCompanyMailMcpToolServer({ store: eventStore });
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

function option(name, fallback) {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const host = option("host", process.env.SOULFORGE_COMPANY_MAIL_MCP_HOST || "127.0.0.1");
  const port = Number(option("port", process.env.SOULFORGE_COMPANY_MAIL_MCP_PORT || 4314));
  const server = createCompanyMailMcpHttpServer();
  server.listen(port, host, () => {
    console.log(`[company-mail-mcp] listening on ${host}:${port}; read-only configured mailbox scope`);
  });
}
