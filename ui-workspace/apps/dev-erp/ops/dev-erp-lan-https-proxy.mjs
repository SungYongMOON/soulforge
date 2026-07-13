#!/usr/bin/env node

import { statSync, readFileSync } from "node:fs";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function optionValue(argv, name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
}

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--${name} must be an integer from 1 to 65535.`);
  }
  return port;
}

function parseTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600_000) {
    throw new Error("--timeout-ms must be an integer from 100 to 600000.");
  }
  return timeoutMs;
}

function existingFile(value, name) {
  if (!value) throw new Error(`--${name} is required.`);
  try {
    const path = resolve(value);
    if (!statSync(path).isFile()) throw new Error("not_file");
    return path;
  } catch {
    throw new Error(`--${name} must identify an existing file.`);
  }
}

export function parseProxyOptions(argv = process.argv.slice(2), { checkFiles = true } = {}) {
  const known = new Set([
    "listen-host", "port", "upstream-host", "upstream-port",
    "tls-cert", "tls-key", "tls-ca", "timeout-ms",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    if (!token?.startsWith("--") || !known.has(token.slice(2))) {
      throw new Error("Unsupported proxy option.");
    }
    if (index + 1 >= argv.length || argv[index + 1]?.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }
  }

  const listenHost = optionValue(argv, "listen-host");
  if (isIP(listenHost) !== 4 || listenHost === "0.0.0.0" || listenHost.startsWith("127.")) {
    throw new Error("--listen-host must be one exact non-loopback IPv4 address.");
  }
  const upstreamHost = optionValue(argv, "upstream-host", "127.0.0.1");
  if (upstreamHost !== "127.0.0.1") {
    throw new Error("--upstream-host must be 127.0.0.1.");
  }

  const certValue = optionValue(argv, "tls-cert");
  const keyValue = optionValue(argv, "tls-key");
  if (Boolean(certValue) !== Boolean(keyValue)) {
    throw new Error("--tls-cert and --tls-key must be provided together.");
  }

  const path = (value, name) => checkFiles ? existingFile(value, name) : value;
  return {
    listenHost,
    port: parsePort(optionValue(argv, "port", "4300"), "port"),
    upstreamHost,
    upstreamPort: parsePort(optionValue(argv, "upstream-port", "4300"), "upstream-port"),
    tlsCertPath: path(certValue, "tls-cert"),
    tlsKeyPath: path(keyValue, "tls-key"),
    tlsCaPath: optionValue(argv, "tls-ca") ? path(optionValue(argv, "tls-ca"), "tls-ca") : null,
    timeoutMs: parseTimeout(optionValue(argv, "timeout-ms", "120000")),
  };
}

function connectionHeaderNames(headers) {
  const value = Array.isArray(headers.connection) ? headers.connection.join(",") : headers.connection;
  return new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function secureSetCookie(value) {
  if (Array.isArray(value)) return value.map(secureSetCookie);
  if (typeof value !== "string" || /(?:^|;)\s*secure(?:;|$)/i.test(value)) return value;
  return `${value}; Secure`;
}

export function proxyRequestHeaders(headers, {
  upstreamHost,
  upstreamPort,
  listenHost,
  listenPort,
  remoteAddress,
}) {
  const nominated = connectionHeaderNames(headers);
  const output = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || nominated.has(name)) continue;
    if (name === "forwarded" || name === "x-real-ip" || name.startsWith("x-forwarded-")) continue;
    if (name === "host") continue;
    output[name] = value;
  }
  output.host = `${upstreamHost}:${upstreamPort}`;
  output["x-forwarded-proto"] = "https";
  output["x-forwarded-host"] = `${listenHost}:${listenPort}`;
  output["x-forwarded-port"] = String(listenPort);
  output["x-forwarded-for"] = remoteAddress || "unknown";
  return output;
}

export function proxyResponseHeaders(headers) {
  const nominated = connectionHeaderNames(headers);
  const output = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || nominated.has(name)) continue;
    output[name] = name === "set-cookie" ? secureSetCookie(value) : value;
  }
  return output;
}

function sendJson(res, statusCode, error) {
  if (res.headersSent || res.writableEnded) {
    if (!res.destroyed) res.destroy();
    return;
  }
  const body = JSON.stringify({ error });
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function requestPath(req) {
  try {
    if (typeof req.url !== "string" || !req.url.startsWith("/") || req.url.startsWith("//")) return null;
    return new URL(req.url || "/", "https://dev-erp.invalid").pathname;
  } catch {
    return null;
  }
}

export function createProxyHandler({
  upstreamHost = "127.0.0.1",
  upstreamPort,
  listenHost,
  listenPort,
  timeoutMs = 120_000,
  caCertificate = null,
  request = httpRequest,
}) {
  return (req, res) => {
    const pathname = requestPath(req);
    if (!pathname) return sendJson(res, 400, "invalid_request_target");
    if (pathname === "/dev-erp-ca.crt" && caCertificate) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
        return res.end();
      }
      res.writeHead(200, {
        "content-type": "application/x-x509-ca-cert",
        "content-disposition": 'attachment; filename="dev-erp-ca.crt"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-length": caCertificate.length,
      });
      return req.method === "HEAD" ? res.end() : res.end(caCertificate);
    }

    let timedOut = false;
    const upstream = request({
      host: upstreamHost,
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: proxyRequestHeaders(req.headers, {
        upstreamHost,
        upstreamPort,
        listenHost,
        listenPort,
        remoteAddress: req.socket.remoteAddress,
      }),
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, proxyResponseHeaders(upstreamRes.headers));
      upstreamRes.on("error", () => {
        if (!res.destroyed) res.destroy();
      });
      upstreamRes.pipe(res);
    });
    upstream.setTimeout(timeoutMs, () => {
      timedOut = true;
      upstream.destroy();
      sendJson(res, 504, "upstream_timeout");
    });
    upstream.on("error", () => {
      if (!timedOut) sendJson(res, 502, "upstream_unavailable");
    });
    req.on("aborted", () => upstream.destroy());
    req.on("error", () => upstream.destroy());
    req.pipe(upstream);
  };
}

export function rejectUpgrade(_req, socket) {
  socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
}

export function createLanHttpsProxy(options) {
  let cert;
  let key;
  let caCertificate = null;
  try {
    cert = readFileSync(options.tlsCertPath);
    key = readFileSync(options.tlsKeyPath);
    if (options.tlsCaPath) caCertificate = readFileSync(options.tlsCaPath);
  } catch {
    throw new Error("TLS material could not be loaded.");
  }

  let server;
  try {
    server = createHttpsServer({ cert, key, minVersion: "TLSv1.2" }, createProxyHandler({
      upstreamHost: options.upstreamHost,
      upstreamPort: options.upstreamPort,
      listenHost: options.listenHost,
      listenPort: options.port,
      timeoutMs: options.timeoutMs,
      caCertificate,
    }));
  } catch {
    throw new Error("TLS material is invalid or mismatched.");
  }
  server.on("upgrade", rejectUpgrade);
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  return server;
}

async function runCli() {
  let options;
  let server;
  try {
    options = parseProxyOptions();
    server = createLanHttpsProxy(options);
  } catch (error) {
    console.error(`[dev-erp-lan-proxy] ${error.message}`);
    process.exitCode = 2;
    return;
  }

  server.once("error", (error) => {
    console.error(`[dev-erp-lan-proxy] listen failed (${error?.code || "unknown"}).`);
    process.exitCode = 2;
  });
  server.listen(options.port, options.listenHost, () => {
    console.log(`[dev-erp-lan-proxy] https://${options.listenHost}:${options.port} -> http://${options.upstreamHost}:${options.upstreamPort}`);
  });
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  await runCli();
}
