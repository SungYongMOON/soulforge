import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";

import { createIngressMcpService, IngressMcpError } from "./ingress_mcp_service.mjs";

export const INGRESS_MTLS_GATEWAY_SCHEMA = "soulforge.ingress.mtls_gateway_binding.v1";
export const INGRESS_MTLS_DEVICE_REGISTRY_SCHEMA = "soulforge.ingress.mtls_device_registry.v1";
const AUDIENCE = "hpp_ingress_mcp";
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const CONFIG_FIELDS = [
  "schema_version", "enabled", "audience", "listen_host", "allowed_client_ipv4", "listen_port", "public_url", "backend_url",
  "ingress_mcp_binding_path", "tls_cert_path", "tls_key_path", "client_ca_path", "device_registry_path",
  "max_requests_per_minute", "max_concurrent_requests_per_device", "max_body_bytes", "upstream_timeout_ms",
];
const REGISTRY_FIELDS = ["schema_version", "revision", "devices"];
const DEVICE_FIELDS = [
  "certificate_sha256", "credential_id", "account_id", "device_id", "allowed_agent_ids",
  "created_at", "expires_at", "revoked_at",
];
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

function fail(code, status = 400) {
  throw new IngressMcpError(code, status);
}

function comparable(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function safeId(value, code, max = 128) {
  const text = String(value ?? "");
  if (!ID.test(text) || text.length > max) fail(code);
  return text;
}

function dateTime(value, code) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) fail(code);
  return new Date(parsed).toISOString();
}

function absolute(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) fail(code);
  return resolve(value);
}

function officeLanIpv4(value) {
  if (isIP(value) !== 4) return false;
  const parts = value.split(".").map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function normalizedRemoteIpv4(socket) {
  const remoteAddress = typeof socket?.remoteAddress === "string" ? socket.remoteAddress : "";
  if (isIP(remoteAddress) === 4) return remoteAddress;
  if (!remoteAddress.toLowerCase().startsWith("::ffff:")) return null;
  const mapped = remoteAddress.slice(7);
  return isIP(mapped) === 4 ? mapped : null;
}

async function normalFile(path, code) {
  let info;
  try { info = await lstat(path); } catch { fail(code); }
  if (!info.isFile() || info.isSymbolicLink()
    || comparable(await realpath(path)) !== comparable(resolve(path))) fail(code);
}

async function readJson(path, code) {
  await normalFile(path, code);
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { fail(code); }
}

function cleanUrl(value, { protocol, host, port, code }) {
  let url;
  try { url = new URL(String(value || "")); } catch { fail(code); }
  if (url.protocol !== protocol || url.username || url.password || url.search || url.hash
    || !["", "/"].includes(url.pathname) || (host && url.hostname !== host)
    || (port && Number(url.port || (protocol === "https:" ? 443 : 80)) !== port)) fail(code);
  return url;
}

export async function loadIngressMtlsGatewayConfig(configPath) {
  const path = absolute(configPath, "mtls_gateway_config_absolute_required");
  const raw = await readJson(path, "invalid_mtls_gateway_config");
  exactFields(raw, CONFIG_FIELDS, "invalid_mtls_gateway_config");
  const allowedClientIpv4 = raw.allowed_client_ipv4;
  if (raw.schema_version !== INGRESS_MTLS_GATEWAY_SCHEMA || typeof raw.enabled !== "boolean"
    || raw.audience !== AUDIENCE || !officeLanIpv4(raw.listen_host)
    || (allowedClientIpv4 !== null && !officeLanIpv4(allowedClientIpv4))
    || (raw.enabled && (allowedClientIpv4 === null || allowedClientIpv4 === raw.listen_host))) {
    fail("invalid_mtls_gateway_config");
  }
  const listenPort = Number(raw.listen_port);
  if (!Number.isSafeInteger(listenPort) || listenPort < 1024 || listenPort > 65535) fail("invalid_mtls_gateway_config");
  const publicUrl = cleanUrl(raw.public_url, {
    protocol: "https:", host: raw.listen_host, port: listenPort, code: "invalid_mtls_gateway_config",
  });
  const backendUrl = cleanUrl(raw.backend_url, {
    protocol: "http:", host: "127.0.0.1", port: null, code: "invalid_mtls_gateway_config",
  });
  const backendPort = Number(backendUrl.port);
  if (!Number.isSafeInteger(backendPort) || backendPort < 1024 || backendPort > 65535) {
    fail("invalid_mtls_gateway_config");
  }
  const config = {
    schemaVersion: INGRESS_MTLS_GATEWAY_SCHEMA,
    enabled: raw.enabled,
    audience: AUDIENCE,
    listenHost: raw.listen_host,
    allowedClientIpv4,
    listenPort,
    publicUrl,
    backendUrl,
    ingressMcpBindingPath: absolute(raw.ingress_mcp_binding_path, "invalid_mtls_gateway_config"),
    tlsCertPath: absolute(raw.tls_cert_path, "invalid_mtls_gateway_config"),
    tlsKeyPath: absolute(raw.tls_key_path, "invalid_mtls_gateway_config"),
    clientCaPath: absolute(raw.client_ca_path, "invalid_mtls_gateway_config"),
    deviceRegistryPath: absolute(raw.device_registry_path, "invalid_mtls_gateway_config"),
    maxRequestsPerMinute: Number(raw.max_requests_per_minute),
    maxConcurrentRequestsPerDevice: Number(raw.max_concurrent_requests_per_device),
    maxBodyBytes: Number(raw.max_body_bytes),
    upstreamTimeoutMs: Number(raw.upstream_timeout_ms),
  };
  if (!Number.isSafeInteger(config.maxRequestsPerMinute) || config.maxRequestsPerMinute < 10
    || config.maxRequestsPerMinute > 10000
    || !Number.isSafeInteger(config.maxConcurrentRequestsPerDevice) || config.maxConcurrentRequestsPerDevice < 1
    || config.maxConcurrentRequestsPerDevice > 100
    || !Number.isSafeInteger(config.maxBodyBytes) || config.maxBodyBytes < 64 * 1024
    || config.maxBodyBytes > 16 * 1024 ** 2
    || !Number.isSafeInteger(config.upstreamTimeoutMs) || config.upstreamTimeoutMs < 1000
    || config.upstreamTimeoutMs > 300000) fail("invalid_mtls_gateway_config");
  for (const file of [config.ingressMcpBindingPath, config.deviceRegistryPath]) {
    await normalFile(file, "mtls_gateway_input_unsafe");
  }
  if (config.enabled) {
    for (const file of [config.tlsCertPath, config.tlsKeyPath, config.clientCaPath]) {
      await normalFile(file, "mtls_gateway_input_unsafe");
    }
  }
  return config;
}

export function normalizeIngressMtlsDeviceRegistry(raw) {
  exactFields(raw, REGISTRY_FIELDS, "invalid_mtls_device_registry");
  if (raw.schema_version !== INGRESS_MTLS_DEVICE_REGISTRY_SCHEMA
    || !Array.isArray(raw.devices) || raw.devices.length > 10000) fail("invalid_mtls_device_registry");
  safeId(raw.revision, "invalid_mtls_device_registry");
  const fingerprints = new Set();
  const activeCredentials = new Set();
  return raw.devices.map((entry) => {
    exactFields(entry, DEVICE_FIELDS, "invalid_mtls_device_registry");
    const normalized = {
      certificateSha256: String(entry.certificate_sha256 || ""),
      credentialId: safeId(entry.credential_id, "invalid_mtls_device_registry", 40),
      accountId: safeId(entry.account_id, "invalid_mtls_device_registry", 80),
      deviceId: safeId(entry.device_id, "invalid_mtls_device_registry", 80),
      allowedAgentIds: entry.allowed_agent_ids,
      createdAt: dateTime(entry.created_at, "invalid_mtls_device_registry"),
      expiresAt: dateTime(entry.expires_at, "invalid_mtls_device_registry"),
      revokedAt: entry.revoked_at === null ? null : dateTime(entry.revoked_at, "invalid_mtls_device_registry"),
    };
    const created = Date.parse(normalized.createdAt);
    const expires = Date.parse(normalized.expiresAt);
    const revoked = normalized.revokedAt === null ? null : Date.parse(normalized.revokedAt);
    if (!HASH.test(normalized.certificateSha256) || fingerprints.has(normalized.certificateSha256)
      || !Array.isArray(normalized.allowedAgentIds) || normalized.allowedAgentIds.length < 1
      || normalized.allowedAgentIds.length > 20 || created >= expires || (revoked !== null && revoked < created)) {
      fail("invalid_mtls_device_registry");
    }
    fingerprints.add(normalized.certificateSha256);
    const agents = normalized.allowedAgentIds.map((agent) => (
      safeId(agent, "invalid_mtls_device_registry", 80)
    ));
    if (new Set(agents).size !== agents.length) fail("invalid_mtls_device_registry");
    normalized.allowedAgentIds = [...agents].sort();
    if (normalized.revokedAt === null) {
      if (activeCredentials.has(normalized.credentialId)) fail("invalid_mtls_device_registry");
      activeCredentials.add(normalized.credentialId);
    }
    return normalized;
  });
}

function fingerprint(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function connectionHeaders(headers) {
  const value = Array.isArray(headers.connection) ? headers.connection.join(",") : headers.connection;
  return new Set(String(value || "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
}

function requestHeaders(headers, config) {
  const nominated = connectionHeaders(headers);
  const output = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || nominated.has(name) || name === "host" || name === "forwarded"
      || name === "x-real-ip" || name.startsWith("x-forwarded-") || name.startsWith("x-soulforge-")) continue;
    output[name] = value;
  }
  output.host = config.backendUrl.host;
  output["x-forwarded-proto"] = "https";
  return output;
}

function responseHeaders(headers) {
  const nominated = connectionHeaders(headers);
  const output = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (HOP_BY_HOP.has(name) || nominated.has(name)) continue;
    output[name] = value;
  }
  return output;
}

function sendJson(res, status, error) {
  if (res.headersSent || res.writableEnded) return res.destroy();
  const body = JSON.stringify({ error });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function requestTarget(req) {
  try {
    if (typeof req.url !== "string" || !req.url.startsWith("/") || req.url.startsWith("//")) return null;
    const url = new URL(req.url, "https://ingress.invalid");
    if (url.pathname === "/health" || url.pathname === "/mcp" || url.pathname.startsWith("/ingress/uploads/")) {
      return req.url;
    }
  } catch {}
  return null;
}

export function createIngressMtlsGatewayHandler({ config, authService, now = () => Date.now() } = {}) {
  if (!config || !authService) throw new TypeError("mtls_gateway_context_required");
  const rate = new Map();
  const concurrent = new Map();

  async function device(req) {
    if (!req.socket.authorized) fail("mtls_client_certificate_required", 401);
    const peer = req.socket.getPeerCertificate(true);
    if (!peer?.raw) fail("mtls_client_certificate_required", 401);
    const certificateSha256 = fingerprint(peer.raw);
    const registry = normalizeIngressMtlsDeviceRegistry(await readJson(
      config.deviceRegistryPath, "invalid_mtls_device_registry",
    ));
    const enrolled = registry.find((entry) => entry.certificateSha256 === certificateSha256);
    if (!enrolled || enrolled.revokedAt || Date.parse(enrolled.expiresAt) <= now()) {
      fail("mtls_device_not_enrolled", 403);
    }
    return { ...enrolled, certificateSha256 };
  }

  function consumeRate(key) {
    const current = now();
    let value = rate.get(key);
    if (!value || current - value.windowStart >= 60000) value = { windowStart: current, count: 0 };
    if (value.count >= config.maxRequestsPerMinute) fail("mtls_rate_limited", 429);
    value.count += 1;
    rate.set(key, value);
  }

  function enter(key, res) {
    const count = concurrent.get(key) || 0;
    if (count >= config.maxConcurrentRequestsPerDevice) fail("mtls_concurrency_limited", 429);
    concurrent.set(key, count + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const remaining = (concurrent.get(key) || 1) - 1;
      if (remaining <= 0) concurrent.delete(key); else concurrent.set(key, remaining);
    };
    res.once("finish", release);
    res.once("close", release);
  }

  return async (req, res) => {
    try {
      if (normalizedRemoteIpv4(req.socket) !== config.allowedClientIpv4) {
        return sendJson(res, 403, "mtls_source_ip_not_allowed");
      }
      if (String(req.headers.host || "").toLowerCase() !== config.publicUrl.host.toLowerCase()) {
        return sendJson(res, 421, "host_not_allowed");
      }
      const target = requestTarget(req);
      if (!target) return sendJson(res, 404, "not_found");
      const enrolled = await device(req);
      consumeRate(enrolled.certificateSha256);
      enter(enrolled.certificateSha256, res);
      const hasBody = ["POST", "PUT", "PATCH"].includes(req.method || "");
      const length = Number(req.headers["content-length"] || 0);
      if (req.headers["transfer-encoding"] || !Number.isSafeInteger(length) || length < 0
        || (hasBody && req.headers["content-length"] === undefined)
        || length > config.maxBodyBytes) return sendJson(res, length > config.maxBodyBytes ? 413 : 400, "request_body_bound_invalid");
      if (new URL(target, "https://ingress.invalid").pathname !== "/health") {
        const principal = await authService.authenticate(String(req.headers.authorization || ""));
        if (principal.credentialId !== enrolled.credentialId || principal.accountId !== enrolled.accountId
          || principal.deviceId !== enrolled.deviceId || !enrolled.allowedAgentIds.includes(principal.agentId)) {
          return sendJson(res, 403, "mtls_bearer_identity_mismatch");
        }
      }
      let timedOut = false;
      const upstream = httpRequest({
        host: config.backendUrl.hostname,
        port: Number(config.backendUrl.port),
        method: req.method,
        path: target,
        headers: requestHeaders(req.headers, config),
      }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, responseHeaders(upstreamRes.headers));
        upstreamRes.on("error", () => res.destroy());
        upstreamRes.pipe(res);
      });
      upstream.setTimeout(config.upstreamTimeoutMs, () => {
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
    } catch (error) {
      sendJson(res, Number.isSafeInteger(error?.status) ? error.status : 500, error?.code || "mtls_gateway_failed");
    }
  };
}

function protectListen(server, config, allowSyntheticLoopback) {
  const nativeListen = server.listen;
  server.listen = function exactLanListen(...args) {
    const options = args[0];
    let host = null;
    if (options && typeof options === "object" && !ArrayBuffer.isView(options)) {
      host = Object.hasOwn(options, "path") ? null : String(options.host || "");
    } else if (typeof options === "number") {
      host = typeof args[1] === "string" ? args[1] : "";
    }
    const permitted = host === config.listenHost || (allowSyntheticLoopback === true && host === "127.0.0.1");
    if (host === null || !permitted) throw new Error("mtls_gateway_exact_lan_bind_required");
    return Reflect.apply(nativeListen, this, args);
  };
  return server;
}

export async function createIngressMtlsGateway({
  configPath,
  authService: providedAuthService = null,
  now = () => Date.now(),
  allowSyntheticLoopback = false,
} = {}) {
  const config = await loadIngressMtlsGatewayConfig(configPath);
  if (!config.enabled) throw new Error("mtls_gateway_feature_off");
  const authService = providedAuthService || await createIngressMcpService({ configPath: config.ingressMcpBindingPath });
  let cert;
  let key;
  let ca;
  try {
    [cert, key, ca] = await Promise.all([
      readFile(config.tlsCertPath), readFile(config.tlsKeyPath), readFile(config.clientCaPath),
    ]);
  } catch { throw new Error("mtls_gateway_material_unavailable"); }
  let server;
  try {
    server = createHttpsServer({
      cert,
      key,
      ca,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
    }, createIngressMtlsGatewayHandler({
      config: allowSyntheticLoopback === true ? { ...config, allowedClientIpv4: "127.0.0.1" } : config,
      authService,
      now,
    }));
  } catch { throw new Error("mtls_gateway_material_invalid"); }
  server.on("upgrade", (_req, socket) => socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  return protectListen(server, config, allowSyntheticLoopback);
}
