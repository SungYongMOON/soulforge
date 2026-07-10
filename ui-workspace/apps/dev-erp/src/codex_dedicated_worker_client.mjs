import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  hkdfSync,
  KeyObject,
  randomBytes,
  timingSafeEqual,
  verify as verifyBytes,
} from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { CODEX_TASK_BRIDGE_VERSION, CODEX_TASK_PERMISSION_PROFILE_ID } from "./codex_bridge.mjs";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 130_000;
const DEFAULT_MAX_REQUEST_BYTES = 128 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 320 * 1024;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const NONCE_RE = /^[A-Za-z0-9_-]{43}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_RE = /^[a-f0-9]{40}$/;
const AUTH_VERSION = "dwh1";
const RESPONSE_AUTH_VERSION = "dwhr1";
const CHANNEL_AEAD_SCHEMA = "dev_erp.codex_worker_channel_aead.v1";
const CHANNEL_AEAD_FIELDS = Object.freeze(["schema", "iv", "ciphertext", "tag"]);
const AUTH_HEADERS = Object.freeze({
  version: "x-dev-erp-auth-version",
  timestamp: "x-dev-erp-auth-timestamp",
  clientNonce: "x-dev-erp-auth-nonce",
  channelNonce: "x-dev-erp-channel-nonce",
  contentSha256: "x-dev-erp-content-sha256",
  signature: "x-dev-erp-signature",
});
const RESPONSE_AUTH_HEADERS = Object.freeze({
  version: "x-dev-erp-response-version",
  contentSha256: "x-dev-erp-response-content-sha256",
  signature: "x-dev-erp-response-signature",
});
const MAX_KEY_FILE_BYTES = 16 * 1024;
const ATTESTATION_SCHEMA = "dev_erp.codex_dedicated_worker_attestation.v1";
const WORKER_RELEASE = "v0.5.0";
const WORKER_SCHEMA = "dev_erp.codex_dedicated_worker.v5";
const ATTESTATION_RESPONSE_FIELDS = Object.freeze(["ok", "algorithm", "attestation", "signature"]);
const ATTESTATION_PAYLOAD_FIELDS = Object.freeze([
  "schema", "nonce", "channel_nonce", "worker_release", "worker_schema", "source_commit", "source_tree_clean", "worker_pid", "execution_boundary",
  "listen_host", "listen_port", "bridge_mode", "skills_disabled", "worker_identity_hash", "identity_proof_source", "workspace_registry_revision",
  "workspace_registry_ready", "workspace_root_isolation_revision", "workspace_root_isolation_ready",
  "trust_domain_hash", "trust_domain_match", "codex_home_boundary_revision",
  "codex_home_ready", "attachment_root_boundary_revision", "attachment_root_ready", "forbidden_roots_ready",
  "forbidden_root_count", "permission_profile_id", "permission_profile_bridge_release", "filesystem_boundary_proven",
  "filesystem_boundary_proof_source", "filesystem_boundary_revision", "codex_command_identity_ready",
  "codex_command_revision", "codex_command_version", "codex_command_kind", "permission_profile_revision", "attestation_key_id",
]);

export function codexWorkerReleaseBindingRevision({
  workerUrl,
  expectedWorkerIdentityHash,
  expectedRuntimeIdentityHash,
  expectedAttestationKeyId,
  workerRelease = WORKER_RELEASE,
} = {}) {
  let url;
  try { url = new URL(String(workerUrl || "")); }
  catch { return null; }
  if (url.protocol !== "http:" || url.hostname !== LOOPBACK_HOST || !url.port
      || url.username || url.password || url.search || url.hash
      || (url.pathname !== "/" && url.pathname !== "")) return null;
  const workerIdentity = String(expectedWorkerIdentityHash || "").trim().toLowerCase();
  const runtimeIdentity = String(expectedRuntimeIdentityHash || "").trim().toLowerCase();
  const attestationKey = String(expectedAttestationKeyId || "").trim().toLowerCase();
  if (![workerIdentity, runtimeIdentity, attestationKey].every((value) => SHA256_RE.test(value))
      || workerRelease !== WORKER_RELEASE) return null;
  return createHash("sha256").update(Buffer.from(JSON.stringify({
    schema: "dev_erp.codex_worker_release_binding.v1",
    worker_url: `http://${LOOPBACK_HOST}:${url.port}`,
    expected_worker_identity_sha256: workerIdentity,
    expected_runtime_identity_sha256: runtimeIdentity,
    expected_attestation_key_sha256: attestationKey,
    worker_release: WORKER_RELEASE,
  }), "utf8")).digest("hex");
}

export class CodexDedicatedWorkerClientError extends Error {
  constructor(code, { status = 0 } = {}) {
    super(code);
    this.name = "CodexDedicatedWorkerClientError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 0) {
  throw new CodexDedicatedWorkerClientError(code, { status });
}

function boundedInteger(value, fallback, min, max, code) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(code);
  return number;
}

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { fail("worker_base_url_invalid"); }
  if (url.protocol !== "http:"
      || url.hostname !== LOOPBACK_HOST
      || !url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== "/" && url.pathname !== "")) fail("worker_base_url_invalid");
  return `http://${LOOPBACK_HOST}:${url.port}`;
}

function normalizeToken(value) {
  if (typeof value !== "string" || value !== value.trim() || !TOKEN_RE.test(value)) fail("worker_token_invalid");
  return decodeCanonicalBase64url(value, 32, "worker_token_invalid");
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requestAuthCanonical({ method, path, timestamp, clientNonce, channelNonce, contentSha256 }) {
  return Buffer.from(JSON.stringify([
    AUTH_VERSION,
    method,
    path,
    timestamp,
    clientNonce,
    channelNonce,
    contentSha256,
  ]), "utf8");
}

function responseAuthCanonical(context, status, contentSha256) {
  return Buffer.from(JSON.stringify([
    RESPONSE_AUTH_VERSION,
    AUTH_VERSION,
    context.method,
    context.path,
    context.clientNonce,
    context.channelNonce,
    String(status),
    contentSha256,
  ]), "utf8");
}

function normalizeChannelNonce(value) {
  if (value === undefined || value === null || value === "") return "";
  decodeCanonicalBase64url(value, 32, "worker_channel_invalid");
  if (!NONCE_RE.test(value)) fail("worker_channel_invalid");
  return value;
}

function channelKeyInfo(context, direction) {
  return Buffer.from(JSON.stringify([
    "dev_erp.codex_worker_channel_key.v1",
    direction,
    context.method,
    context.path,
    context.timestamp,
    context.clientNonce,
    context.channelNonce,
  ]), "utf8");
}

function channelAad(context, direction, status = "") {
  return Buffer.from(JSON.stringify([
    CHANNEL_AEAD_SCHEMA,
    direction,
    context.method,
    context.path,
    context.timestamp,
    context.clientNonce,
    context.channelNonce,
    status === "" ? "" : String(status),
  ]), "utf8");
}

function deriveChannelAeadKey(token, context, direction) {
  const channelNonce = normalizeChannelNonce(context.channelNonce);
  if (!channelNonce) fail("worker_channel_required");
  return Buffer.from(hkdfSync(
    "sha256",
    token,
    Buffer.from(channelNonce, "base64url"),
    channelKeyInfo(context, direction),
    32,
  ));
}

function encryptChannelPayload(token, context, direction, status, plaintextBytes) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveChannelAeadKey(token, context, direction),
    iv,
    { authTagLength: 16 },
  );
  cipher.setAAD(channelAad(context, direction, status));
  const ciphertext = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
  return Buffer.from(JSON.stringify({
    schema: CHANNEL_AEAD_SCHEMA,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  }), "utf8");
}

function decryptChannelPayload(token, context, direction, status, wireBytes, maxPlaintextBytes) {
  let value;
  try { value = JSON.parse(wireBytes.toString("utf8")); }
  catch { fail("worker_encrypted_response_invalid", status); }
  if (!hasExactFields(value, CHANNEL_AEAD_FIELDS) || value.schema !== CHANNEL_AEAD_SCHEMA) {
    fail("worker_encrypted_response_invalid", status);
  }
  const iv = decodeCanonicalBase64url(value.iv, 12, "worker_encrypted_response_invalid");
  const ciphertext = decodeCanonicalBase64urlBounded(
    value.ciphertext,
    maxPlaintextBytes + 32,
    "worker_encrypted_response_invalid",
  );
  const tag = decodeCanonicalBase64url(value.tag, 16, "worker_encrypted_response_invalid");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveChannelAeadKey(token, context, direction),
      iv,
      { authTagLength: 16 },
    );
    decipher.setAAD(channelAad(context, direction, status));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.length > maxPlaintextBytes) fail("worker_response_too_large", status);
    return plaintext;
  } catch (error) {
    if (error instanceof CodexDedicatedWorkerClientError) throw error;
    fail("worker_encrypted_response_authentication_invalid", status);
  }
}

function createRequestAuthentication(token, {
  method,
  path,
  bodyBytes,
  channelNonce,
  encryptBody,
}) {
  const timestamp = String(Date.now());
  const clientNonce = randomBytes(32).toString("base64url");
  const normalizedChannel = normalizeChannelNonce(channelNonce);
  const context = Object.freeze({
    method,
    path,
    timestamp,
    clientNonce,
    channelNonce: normalizedChannel,
  });
  const wireBodyBytes = encryptBody
    ? encryptChannelPayload(token, context, "request", "", bodyBytes)
    : bodyBytes;
  const contentSha256 = sha256Bytes(wireBodyBytes);
  const signature = createHmac("sha256", token).update(requestAuthCanonical({
    method,
    path,
    timestamp,
    clientNonce,
    channelNonce: normalizedChannel,
    contentSha256,
  })).digest("base64url");
  return Object.freeze({
    context,
    bodyBytes: wireBodyBytes,
    headers: Object.freeze({
      [AUTH_HEADERS.version]: AUTH_VERSION,
      [AUTH_HEADERS.timestamp]: timestamp,
      [AUTH_HEADERS.clientNonce]: clientNonce,
      [AUTH_HEADERS.channelNonce]: normalizedChannel,
      [AUTH_HEADERS.contentSha256]: contentSha256,
      [AUTH_HEADERS.signature]: signature,
    }),
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value, fields) {
  return isRecord(value)
    && Object.keys(value).length === fields.length
    && Object.keys(value).every((key) => fields.includes(key));
}

function decodeCanonicalBase64url(value, bytes, code) {
  if (typeof value !== "string" || !BASE64URL_RE.test(value)) fail(code);
  let decoded;
  try { decoded = Buffer.from(value, "base64url"); }
  catch { fail(code); }
  if (decoded.length !== bytes || decoded.toString("base64url") !== value) fail(code);
  return decoded;
}

function decodeCanonicalBase64urlBounded(value, maxBytes, code) {
  if (typeof value !== "string" || !BASE64URL_RE.test(value)) fail(code);
  let decoded;
  try { decoded = Buffer.from(value, "base64url"); }
  catch { fail(code); }
  if (decoded.length > maxBytes || decoded.toString("base64url") !== value) fail(code);
  return decoded;
}

function normalizeAttestationNonce(value) {
  decodeCanonicalBase64url(value, 32, "worker_attestation_nonce_invalid");
  if (!NONCE_RE.test(value)) fail("worker_attestation_nonce_invalid");
  return value;
}

function normalizeAttestationPublicKey(value) {
  try {
    let publicKey;
    if (value instanceof KeyObject) {
      publicKey = value;
    } else {
      try { publicKey = createPublicKey(value); }
      catch (firstError) {
        if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw firstError;
        publicKey = createPublicKey({ key: Buffer.from(value), format: "der", type: "spki" });
      }
    }
    if (publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
      fail("worker_attestation_public_key_invalid");
    }
    return publicKey;
  } catch (error) {
    if (error instanceof CodexDedicatedWorkerClientError) throw error;
    fail("worker_attestation_public_key_invalid");
  }
}

function loadAttestationPublicKeyFile(path) {
  try {
    if (typeof path !== "string" || !isAbsolute(path) || path !== path.trim()) {
      fail("worker_attestation_public_key_file_invalid");
    }
    const lexical = resolve(path);
    const entry = lstatSync(lexical);
    const real = realpathSync(lexical);
    const same = process.platform === "win32"
      ? lexical.toLowerCase() === resolve(real).toLowerCase()
      : lexical === resolve(real);
    if (!entry.isFile() || entry.isSymbolicLink() || !same || entry.size < 1 || entry.size > MAX_KEY_FILE_BYTES
        || (Number.isSafeInteger(entry.nlink) && entry.nlink !== 1)) {
      fail("worker_attestation_public_key_file_invalid");
    }
    return normalizeAttestationPublicKey(readFileSync(real));
  } catch (error) {
    if (error instanceof CodexDedicatedWorkerClientError) throw error;
    fail("worker_attestation_public_key_file_invalid");
  }
}

function publicKeyId(publicKey) {
  return createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
}

function canonicalAttestationPayload(value) {
  if (!hasExactFields(value, ATTESTATION_PAYLOAD_FIELDS)) fail("worker_attestation_payload_invalid");
  const ordered = {};
  for (const field of ATTESTATION_PAYLOAD_FIELDS) ordered[field] = value[field];
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

export function verifyCodexDedicatedWorkerAttestation(response, {
  publicKey,
  expectedNonce,
  expectedListenPort = null,
  requireChannel = true,
} = {}) {
  const nonce = normalizeAttestationNonce(expectedNonce);
  const key = normalizeAttestationPublicKey(publicKey);
  if (expectedListenPort !== null
      && (!Number.isInteger(expectedListenPort) || expectedListenPort < 1 || expectedListenPort > 65535)) {
    fail("worker_attestation_expected_port_invalid");
  }
  if (!hasExactFields(response, ATTESTATION_RESPONSE_FIELDS)
      || response.ok !== true
      || response.algorithm !== "Ed25519") fail("worker_attestation_response_invalid");
  const value = response.attestation;
  const canonical = canonicalAttestationPayload(value);
  if (requireChannel) {
    try { decodeCanonicalBase64url(value.channel_nonce, 32, "worker_attestation_payload_invalid"); }
    catch (error) { throw error; }
  } else if (value.channel_nonce !== "") {
    fail("worker_attestation_payload_invalid");
  }
  if (value.schema !== ATTESTATION_SCHEMA
      || value.nonce !== nonce
      || (requireChannel ? !NONCE_RE.test(value.channel_nonce) : value.channel_nonce !== "")
      || value.worker_release !== WORKER_RELEASE
      || value.worker_schema !== WORKER_SCHEMA
      || !SOURCE_COMMIT_RE.test(value.source_commit)
      || typeof value.source_tree_clean !== "boolean"
      || !Number.isInteger(value.worker_pid) || value.worker_pid < 1
      || value.execution_boundary !== "dedicated_worker"
      || value.listen_host !== LOOPBACK_HOST
      || !Number.isInteger(value.listen_port) || value.listen_port < 1 || value.listen_port > 65535
      || !new Set(["app-server", "mock"]).has(value.bridge_mode)
      || value.skills_disabled !== true
      || !SHA256_RE.test(value.worker_identity_hash)
      || !new Set(["windows_whoami", "os_userinfo"]).has(value.identity_proof_source)
      || !SHA256_RE.test(value.workspace_registry_revision)
      || value.workspace_registry_ready !== true
      || !SHA256_RE.test(value.workspace_root_isolation_revision)
      || value.workspace_root_isolation_ready !== true
      || !SHA256_RE.test(value.trust_domain_hash)
      || value.trust_domain_match !== true
      || !SHA256_RE.test(value.codex_home_boundary_revision)
      || value.codex_home_ready !== true
      || !SHA256_RE.test(value.attachment_root_boundary_revision)
      || value.attachment_root_ready !== true
      || value.forbidden_roots_ready !== true
      || !Number.isInteger(value.forbidden_root_count) || value.forbidden_root_count < 5 || value.forbidden_root_count > 39
      || value.permission_profile_id !== CODEX_TASK_PERMISSION_PROFILE_ID
      || value.permission_profile_bridge_release !== CODEX_TASK_BRIDGE_VERSION.release
      || value.filesystem_boundary_proven !== true
      || !new Set(["codex_sandbox_exact_path_probe_v3", "mock_test_boundary"]).has(value.filesystem_boundary_proof_source)
      || !SHA256_RE.test(value.filesystem_boundary_revision)
      || value.codex_command_identity_ready !== true
      || !SHA256_RE.test(value.codex_command_revision)
      || typeof value.codex_command_version !== "string" || !value.codex_command_version || value.codex_command_version.length > 160
      || typeof value.codex_command_kind !== "string" || !value.codex_command_kind || value.codex_command_kind.length > 64
      || !SHA256_RE.test(value.permission_profile_revision)
      || !SHA256_RE.test(value.attestation_key_id)
      || value.attestation_key_id !== publicKeyId(key)) {
    fail(value?.nonce === nonce ? "worker_attestation_payload_invalid" : "worker_attestation_nonce_mismatch");
  }
  if (expectedListenPort !== null && value.listen_port !== expectedListenPort) {
    fail("worker_attestation_port_mismatch");
  }
  const signature = decodeCanonicalBase64url(response.signature, 64, "worker_attestation_signature_invalid");
  let verified = false;
  try { verified = verifyBytes(null, canonical, key, signature); }
  catch { fail("worker_attestation_signature_invalid"); }
  if (!verified) fail("worker_attestation_signature_invalid");
  return Object.freeze({
    ok: true,
    verified: true,
    algorithm: "Ed25519",
    attestation: Object.freeze({ ...value }),
    signature: response.signature,
  });
}

function requestSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) controller.abort(externalSignal.reason);
  else externalSignal?.addEventListener?.("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("worker_client_timeout"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener?.("abort", onAbort);
    },
  };
}

function verifyResponseAuthentication(response, bodyBytes, token, context) {
  const version = response.headers.get(RESPONSE_AUTH_HEADERS.version);
  const contentSha256 = response.headers.get(RESPONSE_AUTH_HEADERS.contentSha256);
  const encodedSignature = response.headers.get(RESPONSE_AUTH_HEADERS.signature);
  const genericCode = response.status === 401
    ? "worker_authentication_failed"
    : "worker_response_authentication_invalid";
  if (version !== RESPONSE_AUTH_VERSION
      || typeof contentSha256 !== "string" || !SHA256_RE.test(contentSha256)
      || typeof encodedSignature !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(encodedSignature)) {
    fail(genericCode, response.status);
  }
  const actualContentSha256 = sha256Bytes(bodyBytes);
  const declared = Buffer.from(contentSha256, "hex");
  const actual = Buffer.from(actualContentSha256, "hex");
  if (declared.length !== actual.length || !timingSafeEqual(declared, actual)) {
    fail("worker_response_content_hash_mismatch", response.status);
  }
  const signature = decodeCanonicalBase64url(
    encodedSignature,
    32,
    "worker_response_authentication_invalid",
  );
  const expected = createHmac("sha256", token)
    .update(responseAuthCanonical(context, response.status, contentSha256))
    .digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    fail("worker_response_authentication_invalid", response.status);
  }
}

async function readBoundedResponse(response, maxBytes, token, authContext) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    fail("worker_response_too_large", response.status);
  }
  const chunks = [];
  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        fail("worker_response_too_large", response.status);
      }
      chunks.push(Buffer.from(value));
    }
  }
  const bodyBytes = Buffer.concat(chunks, bytes);
  verifyResponseAuthentication(response, bodyBytes, token, authContext);
  const plaintextBytes = authContext.channelNonce
    ? decryptChannelPayload(
      token,
      authContext,
      "response",
      response.status,
      bodyBytes,
      maxBytes,
    )
    : bodyBytes;
  let value;
  try { value = JSON.parse(plaintextBytes.toString("utf8")); }
  catch { fail("worker_response_invalid", response.status); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("worker_response_invalid", response.status);
  if (!response.ok) {
    const code = typeof value.error === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(value.error)
      ? value.error
      : "worker_request_failed";
    fail(code, response.status);
  }
  return value;
}

export class CodexDedicatedWorkerClient {
  #baseUrl;
  #token;
  #timeoutMs;
  #maxRequestBytes;
  #maxResponseBytes;
  #fetch;
  #attestationPublicKey;
  #listenPort;

  constructor({
    baseUrl,
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRequestBytes = DEFAULT_MAX_REQUEST_BYTES,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    attestationPublicKey = null,
    attestationPublicKeyFile = null,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (typeof fetchImpl !== "function") fail("worker_fetch_unavailable");
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#listenPort = Number(new URL(this.#baseUrl).port);
    this.#token = normalizeToken(token);
    this.#timeoutMs = boundedInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 310_000, "worker_timeout_invalid");
    this.#maxRequestBytes = boundedInteger(maxRequestBytes, DEFAULT_MAX_REQUEST_BYTES, 4096, 1024 * 1024, "worker_request_limit_invalid");
    this.#maxResponseBytes = boundedInteger(maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES, 4096, 1024 * 1024, "worker_response_limit_invalid");
    if (attestationPublicKey && attestationPublicKeyFile) fail("worker_attestation_public_key_ambiguous");
    this.#attestationPublicKey = attestationPublicKeyFile
      ? loadAttestationPublicKeyFile(attestationPublicKeyFile)
      : (attestationPublicKey ? normalizeAttestationPublicKey(attestationPublicKey) : null);
    this.#fetch = fetchImpl;
    Object.freeze(this);
  }

  async #request(path, {
    method = "GET",
    body = null,
    channelNonce = "",
    signal = null,
    timeoutMs = null,
  } = {}) {
    let payload;
    if (body !== null) {
      try { payload = JSON.stringify(body); }
      catch { fail("worker_request_invalid"); }
      if (Buffer.byteLength(payload, "utf8") > this.#maxRequestBytes) fail("worker_request_too_large");
    }
    const bodyBytes = Buffer.from(payload ?? "", "utf8");
    const requestAuth = createRequestAuthentication(this.#token, {
      method,
      path,
      bodyBytes,
      channelNonce,
      encryptBody: Boolean(channelNonce && payload !== undefined),
    });
    if (requestAuth.bodyBytes.length > this.#maxRequestBytes) fail("worker_request_too_large");
    const wirePayload = payload === undefined ? undefined : requestAuth.bodyBytes.toString("utf8");
    const boundedTimeout = boundedInteger(timeoutMs, this.#timeoutMs, 1000, 310_000, "worker_timeout_invalid");
    const operationSignal = requestSignal(signal, boundedTimeout);
    const requestUrl = `${this.#baseUrl}${path}`;
    try {
      const response = await this.#fetch(requestUrl, {
        method,
        headers: {
          ...requestAuth.headers,
          ...(wirePayload === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(wirePayload === undefined ? {} : { body: wirePayload }),
        redirect: "error",
        signal: operationSignal.signal,
      });
      if (response.redirected || (response.url && response.url !== requestUrl)) {
        fail("worker_redirect_forbidden", response.status);
      }
      return await readBoundedResponse(
        response,
        this.#maxResponseBytes,
        this.#token,
        requestAuth.context,
      );
    } catch (error) {
      if (error instanceof CodexDedicatedWorkerClientError) throw error;
      if (operationSignal.timedOut()) fail("worker_request_timeout");
      if (operationSignal.signal.aborted) fail("worker_request_aborted");
      fail("worker_unavailable");
    } finally {
      operationSignal.cleanup();
    }
  }

  health({ signal = null, timeoutMs = null } = {}) {
    return this.#request("/v1/health", { method: "GET", signal, timeoutMs });
  }

  async attest(nonce, { signal = null, timeoutMs = null, issueChannel = true } = {}) {
    const expectedNonce = normalizeAttestationNonce(nonce);
    if (typeof issueChannel !== "boolean") fail("worker_attestation_channel_policy_invalid");
    if (!this.#attestationPublicKey) fail("worker_attestation_public_key_required");
    const response = await this.#request("/v1/attest", {
      method: "POST",
      body: { nonce: expectedNonce, issue_channel: issueChannel },
      signal,
      timeoutMs,
    });
    return verifyCodexDedicatedWorkerAttestation(response, {
      publicKey: this.#attestationPublicKey,
      expectedNonce,
      expectedListenPort: this.#listenPort,
      requireChannel: issueChannel,
    });
  }

  async #resolveVerifiedChannel(channel, { signal, timeoutMs }) {
    let verified = channel;
    if (verified === undefined || verified === null) {
      verified = await this.attest(randomBytes(32).toString("base64url"), { signal, timeoutMs });
    }
    if (!isRecord(verified)
        || verified.verified !== true
        || !isRecord(verified.attestation)
        || verified.attestation.listen_port !== this.#listenPort) {
      fail("worker_verified_channel_invalid");
    }
    return normalizeChannelNonce(verified.attestation.channel_nonce);
  }

  async models({ signal = null, timeoutMs = null, channel = null } = {}) {
    const channelNonce = await this.#resolveVerifiedChannel(channel, { signal, timeoutMs });
    return this.#request("/v1/models", { method: "GET", channelNonce, signal, timeoutMs });
  }

  async resolve(payload, { signal = null, timeoutMs = null, channel = null } = {}) {
    const channelNonce = await this.#resolveVerifiedChannel(channel, { signal, timeoutMs });
    return this.#request("/v1/resolve", {
      method: "POST",
      body: payload,
      channelNonce,
      signal,
      timeoutMs,
    });
  }

  async turn(payload, { signal = null, timeoutMs = null, channel = null } = {}) {
    const channelNonce = await this.#resolveVerifiedChannel(channel, { signal, timeoutMs });
    return this.#request("/v1/turn", {
      method: "POST",
      body: payload,
      channelNonce,
      signal,
      timeoutMs,
    });
  }
}
