import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";
import { checkServerIdentity, connect as tlsConnect } from "node:tls";

import { comparablePathIdentity as comparable } from "../../../../guild_hall/shared/physical_path_identity.mjs";
import { IngressClient, IngressClientError } from "./ingress_client.mjs";

export const INGRESS_MTLS_CLIENT_SCHEMA = "soulforge.ingress.mtls_client_binding.v1";
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const MAX_REQUEST_BYTES = 16 * 1024 ** 2;
const FIELDS = [
  "schema_version", "audience", "base_url", "ca_cert_path", "client_cert_path", "client_key_path",
  "server_certificate_sha256", "expected_account_id", "expected_device_id", "expected_agent_id",
];

function fail(code) {
  throw new IngressClientError(code, 400);
}

function officeLanIpv4(value) {
  if (isIP(value) !== 4) return false;
  const parts = value.split(".").map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function exactFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_mtls_client_binding");
  const actual = Object.keys(value).sort();
  const expected = [...FIELDS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid_mtls_client_binding");
  }
}

function safeId(value) {
  const text = String(value ?? "");
  if (!ID.test(text) || text.length > 80) fail("invalid_mtls_client_binding");
  return text;
}

function absolute(value) {
  if (typeof value !== "string" || !isAbsolute(value)) fail("invalid_mtls_client_binding");
  return resolve(value);
}

async function normalFile(path) {
  let info;
  try { info = await lstat(path); } catch { fail("mtls_client_material_unsafe"); }
  if (!info.isFile() || info.isSymbolicLink()
    || comparable(await realpath(path)) !== comparable(resolve(path))) fail("mtls_client_material_unsafe");
}

export async function loadIngressMtlsClientBinding(bindingPath) {
  const path = absolute(bindingPath);
  await normalFile(path);
  let raw;
  try { raw = JSON.parse(await readFile(path, "utf8")); } catch { fail("invalid_mtls_client_binding"); }
  exactFields(raw);
  let baseUrl;
  try { baseUrl = new URL(String(raw.base_url || "")); } catch { fail("invalid_mtls_client_binding"); }
  if (raw.schema_version !== INGRESS_MTLS_CLIENT_SCHEMA || raw.audience !== "hpp_ingress_mcp"
    || baseUrl.protocol !== "https:" || !officeLanIpv4(baseUrl.hostname)
    || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || !["", "/"].includes(baseUrl.pathname)
    || !HASH.test(String(raw.server_certificate_sha256 || ""))) fail("invalid_mtls_client_binding");
  const binding = {
    schemaVersion: INGRESS_MTLS_CLIENT_SCHEMA,
    audience: "hpp_ingress_mcp",
    baseUrl,
    caCertPath: absolute(raw.ca_cert_path),
    clientCertPath: absolute(raw.client_cert_path),
    clientKeyPath: absolute(raw.client_key_path),
    serverCertificateSha256: raw.server_certificate_sha256,
    expectedAccountId: safeId(raw.expected_account_id),
    expectedDeviceId: safeId(raw.expected_device_id),
    expectedAgentId: safeId(raw.expected_agent_id),
  };
  for (const file of [binding.caCertPath, binding.clientCertPath, binding.clientKeyPath]) await normalFile(file);
  return binding;
}

function peerFingerprint(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createIngressMtlsFetch({ binding, syntheticLoopbackAddress = null } = {}) {
  if (!binding) throw new TypeError("mtls_client_binding_required");
  if (syntheticLoopbackAddress !== null && syntheticLoopbackAddress !== "127.0.0.1") {
    throw new TypeError("mtls_synthetic_loopback_invalid");
  }
  const [ca, cert, key] = await Promise.all([
    readFile(binding.caCertPath), readFile(binding.clientCertPath), readFile(binding.clientKeyPath),
  ]);
  return async (input, init = {}) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== binding.baseUrl.origin) throw new IngressClientError("mtls_client_origin_mismatch", 400);
    const requestHeaders = Object.fromEntries(request.headers.entries());
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : null;
    if (body && body.length > MAX_REQUEST_BYTES) throw new IngressClientError("mtls_client_request_too_large", 413);
    if (["POST", "PUT", "PATCH"].includes(request.method)) requestHeaders["content-length"] = String(body?.length || 0);
    return new Promise((accept, reject) => {
      const verifyPeer = (_hostname, peer) => {
        const identityError = checkServerIdentity(url.hostname, peer);
        if (identityError) return identityError;
        if (!peer?.raw || peerFingerprint(peer.raw) !== binding.serverCertificateSha256) {
          const error = new Error("mtls_server_certificate_pin_mismatch");
          error.code = "mtls_server_certificate_pin_mismatch";
          return error;
        }
        return undefined;
      };
      const options = {
        protocol: "https:",
        hostname: url.hostname,
        port: Number(url.port || 443),
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: requestHeaders,
        ca,
        cert,
        key,
        minVersion: "TLSv1.3",
        checkServerIdentity: verifyPeer,
      };
      if (syntheticLoopbackAddress) {
        options.createConnection = (connectionOptions, callback) => tlsConnect({
          ...connectionOptions,
          host: syntheticLoopbackAddress,
          port: Number(url.port || 443),
          servername: undefined,
          ca,
          cert,
          key,
          minVersion: "TLSv1.3",
          rejectUnauthorized: true,
          checkServerIdentity: verifyPeer,
        }, callback);
      }
      const req = httpsRequest(options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
            else if (value !== undefined) headers.append(name, value);
          }
          accept(new Response(Buffer.concat(chunks), { status: res.statusCode || 502, headers }));
        });
      });
      req.on("error", reject);
      const abort = () => req.destroy(new Error("AbortError"));
      if (request.signal.aborted) return abort();
      request.signal.addEventListener("abort", abort, { once: true });
      req.once("close", () => request.signal.removeEventListener("abort", abort));
      req.end(body || undefined);
    });
  };
}

export async function createBoundIngressClient({ bindingPath, token, syntheticLoopbackAddress = null } = {}) {
  const binding = await loadIngressMtlsClientBinding(bindingPath);
  const fetchImpl = await createIngressMtlsFetch({ binding, syntheticLoopbackAddress });
  const client = new IngressClient({ baseUrl: binding.baseUrl, token, fetchImpl });
  return {
    binding,
    client,
    async verifyIdentity() {
      const identity = await client.whoami();
      if (identity.account_id !== binding.expectedAccountId || identity.device_id !== binding.expectedDeviceId
        || identity.agent_id !== binding.expectedAgentId) throw new IngressClientError("mtls_client_identity_mismatch", 403);
      return identity;
    },
  };
}
