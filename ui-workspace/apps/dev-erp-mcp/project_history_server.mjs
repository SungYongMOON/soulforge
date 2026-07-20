#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  createProjectHistoryMcpService,
  ProjectHistoryMcpError,
} from "./src/project_history_service.mjs";
import { createProjectHistoryMcpToolServer } from "./src/project_history_tools.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_PORT = 4312;

function securityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  securityHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function normalizedHostname(value) {
  const hostname = value.toLowerCase();
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function actualRequestBaseUrl(req, server) {
  try {
    const address = server.address();
    if (address === null || typeof address !== "object"
        || normalizedHostname(address.address) !== "127.0.0.1"
        || req.socket.localPort !== address.port) {
      return null;
    }
    const requested = new URL(`http://${req.headers.host || ""}`);
    const requestedPort = requested.port === "" ? 80 : Number(requested.port);
    if (!LOOPBACK_HOSTS.has(normalizedHostname(requested.hostname))
        || requestedPort !== address.port
        || requested.username || requested.password
        || requested.pathname !== "/" || requested.search || requested.hash) {
      return null;
    }
    return new URL(`http://127.0.0.1:${address.port}/`);
  } catch {
    return null;
  }
}

function authorization(req) {
  return String(req.headers.authorization || "");
}

function downloadContentType(format) {
  return format === "csv"
    ? "text/csv; charset=utf-8"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function sendDownload(res, download) {
  securityHeaders(res);
  const status = download.partial ? 206 : 200;
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": downloadContentType(download.format),
    "Content-Disposition": `attachment; filename="${download.filename}"`,
    "Content-Length": download.bytes.length,
  };
  if (download.partial) headers["Content-Range"] = `bytes ${download.start}-${download.end}/${download.size}`;
  res.writeHead(status, headers);
  res.end(download.bytes);
}

export function assertProjectHistoryBindHost(host) {
  if (host !== "127.0.0.1") throw new Error("project_history_loopback_bind_required");
}

function protectListen(server) {
  const nativeListen = server.listen;
  server.listen = function loopbackOnly(...args) {
    const options = args[0];
    let host = "";
    if (options && typeof options === "object" && !ArrayBuffer.isView(options)) {
      if (Object.hasOwn(options, "path")) throw new Error("project_history_loopback_bind_required");
      host = String(options.host || "");
    } else if (typeof options === "number") {
      host = typeof args[1] === "string" ? args[1] : "";
    }
    assertProjectHistoryBindHost(host);
    return Reflect.apply(nativeListen, this, args);
  };
  return server;
}

function unavailable(res, status = 404) {
  return sendJson(res, status, { error: "project_history_unavailable" });
}

export function createProjectHistoryMcpHttpServer({
  service,
} = {}) {
  if (!service) throw new TypeError("project_history_service_required");

  const server = createServer(async (req, res) => {
    securityHeaders(res);
    const requestBaseUrl = actualRequestBaseUrl(req, server);
    if (requestBaseUrl === null) return unavailable(res, 421);
    if (req.headers.origin !== undefined && req.headers.origin !== requestBaseUrl.origin) {
      return unavailable(res, 403);
    }
    const url = new URL(req.url || "/", requestBaseUrl);

    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        service: "soulforge-project-history-mcp",
        feature_state: "off",
        exposure: "127.0.0.1-only",
        database_mode: "read_only_query_only",
      });
    }

    const download = /^\/download\/(sfphd_v1_[A-Za-z0-9_-]{43})$/u.exec(url.pathname);
    if (download && req.method === "GET") {
      try {
        return sendDownload(res, service.consumeDownload(download[1], req.headers.range));
      } catch (error) {
        return unavailable(res, error?.status === 416 ? 416 : 404);
      }
    }
    if (url.pathname.startsWith("/download/")) return unavailable(res);
    if (url.pathname !== "/mcp") return unavailable(res);

    try {
      service.authenticate(authorization(req));
    } catch {
      return unavailable(res);
    }

    const mcpServer = createProjectHistoryMcpToolServer({
      service,
      requestBaseUrl,
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
      if (!res.headersSent) unavailable(res, 500);
    }
  });
  return protectListen(server);
}

function parseArguments(argv) {
  const options = {};
  const values = new Map([
    ["--binding", "bindingPath"],
    ["--binding-digest", "bindingDigest"],
    ["--artifact-manifest", "artifactManifestPath"],
    ["--artifact-manifest-digest", "artifactManifestDigest"],
    ["--port", "port"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--pilot-copy") {
      if (options.pilotCopy) throw new Error("duplicate_argument");
      options.pilotCopy = true;
    } else if (values.has(argument)) {
      const key = values.get(argument);
      if (options[key] !== undefined) throw new Error("duplicate_argument");
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("argument_value_missing");
      options[key] = value;
      index += 1;
    } else {
      throw new Error("unknown_argument");
    }
  }
  return options;
}

function helpText() {
  return [
    "Feature-OFF localhost read-only Project History MCP.",
    "",
    "Usage:",
    "  $env:SOULFORGE_PROJECT_HISTORY_MCP_TOKEN=\"<ephemeral-random-token>\"",
    "  node project_history_server.mjs --pilot-copy --binding <private-binding.json> \\",
    "    --binding-digest <sha256:...> --artifact-manifest <artifact-manifest.json> \\",
    "    --artifact-manifest-digest <sha256:...> [--port 4312]",
    "",
    "The token is read only from the environment and is never printed. The server binds 127.0.0.1 only.",
    "The exact private binding and artifact-manifest digests pin the copied DB generation and four fixed artifacts.",
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  let service;
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
    } else {
      for (const key of [
        "bindingPath",
        "bindingDigest",
        "artifactManifestPath",
        "artifactManifestDigest",
      ]) {
        if (typeof options[key] !== "string" || options[key].length === 0) throw new Error("argument_required");
      }
      const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("port_invalid");
      service = createProjectHistoryMcpService({
        bindingPath: options.bindingPath,
        bindingDigest: options.bindingDigest,
        artifactManifestPath: options.artifactManifestPath,
        artifactManifestDigest: options.artifactManifestDigest,
        bearerToken: process.env.SOULFORGE_PROJECT_HISTORY_MCP_TOKEN,
        pilotCopy: options.pilotCopy === true,
      });
      const server = createProjectHistoryMcpHttpServer({ service });
      server.once("error", () => service.close());
      server.listen(port, "127.0.0.1", () => {
        process.stdout.write(`[soulforge-project-history-mcp] listening on 127.0.0.1:${port}; feature OFF; read-only copy\n`);
      });
    }
  } catch (error) {
    if (service) service.close();
    const code = error instanceof ProjectHistoryMcpError
      ? error.code
      : (typeof error?.message === "string" ? error.message : "project_history_mcp_start_failed");
    process.stderr.write(`${JSON.stringify({ status: "error", code })}\n`);
    process.exitCode = 1;
  }
}
