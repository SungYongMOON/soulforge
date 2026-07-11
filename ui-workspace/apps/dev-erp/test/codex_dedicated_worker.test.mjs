import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  createCipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { createInterface } from "node:readline";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CodexDedicatedWorkerClient,
  CodexDedicatedWorkerClientError,
  verifyCodexDedicatedWorkerAttestation,
  verifyCodexWorkerTurnSelection,
} from "../src/codex_dedicated_worker_client.mjs";
import {
  createAttachmentManifest,
  createAttachmentManifestRecord,
  createOpaqueAttachmentId,
  publicAttachmentDescriptor,
} from "../src/codex_attachment_registry.mjs";
import { selectWorkerTurnModel } from "../src/codex_dedicated_worker.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER_ENTRY = join(APP_DIR, "tools", "codex_dedicated_worker.mjs");
const TOKEN = randomBytes(32).toString("base64url");
const ROTATED_TOKEN = randomBytes(32).toString("base64url");
const WRONG_KEY_TOKEN = randomBytes(32).toString("base64url");
const AUTH_VERSION = "dwh1";
const RESPONSE_AUTH_VERSION = "dwhr1";
const CHANNEL_AEAD_SCHEMA = "dev_erp.codex_worker_channel_aead.v1";

test("auto model selection upgrades a stale GPT-5.5 request when fresh GPT-5.6 is available", () => {
  const model = (slug, isDefault = false) => ({
    slug,
    hidden: false,
    is_default: isDefault,
    reasoning_efforts: [{ id: "medium", name: "Medium", description: "" }],
    default_reasoning_effort: "medium",
    service_tiers: [],
  });
  const request = {
    model: "gpt-5.5",
    model_selection_origin: "auto",
    effort: "medium",
    service_tier: null,
  };
  const upgraded = selectWorkerTurnModel({ models: [model("gpt-5.5", true), model("gpt-5.6-sol")] }, request);
  assert.equal(upgraded.model, "gpt-5.6-sol");
  assert.equal(upgraded.requestedModel, "gpt-5.5");
  assert.equal(upgraded.modelFallback, false);
  const fallback = selectWorkerTurnModel({ models: [model("gpt-5.5", true)], source: "fallback", degraded: true }, request);
  assert.equal(fallback.model, "gpt-5.5");
  assert.equal(fallback.modelFallback, true);
  const fallbackDespiteOtherDefault = selectWorkerTurnModel({
    models: [model("gpt-5.5"), model("gpt-5.4", true)],
  }, request);
  assert.equal(fallbackDespiteOtherDefault.model, "gpt-5.5");
  assert.equal(fallbackDespiteOtherDefault.modelFallback, true);
  const effortFallback = selectWorkerTurnModel({
    models: [model("gpt-5.5", true)],
  }, {
    ...request,
    model: "gpt-5.6-sol",
    effort: "ultra",
  });
  assert.equal(effortFallback.model, "gpt-5.5");
  assert.equal(effortFallback.effort, "medium");
  assert.equal(effortFallback.effortFallback, true);
  assert.throws(
    () => selectWorkerTurnModel({ models: [model("gpt-5.4", true)] }, request),
    /codex_required_model_unavailable/,
  );
  const explicit = selectWorkerTurnModel({ models: [model("gpt-5.5", true), model("gpt-5.6-sol")] }, {
    ...request,
    model_selection_origin: "explicit",
  });
  assert.equal(explicit.model, "gpt-5.5");
  assert.equal(explicit.modelFallback, false);
  assert.throws(
    () => selectWorkerTurnModel({ models: [model("gpt-5.5", true)] }, {
      ...request,
      model_selection_origin: "explicit",
      effort: "ultra",
    }),
    /unsupported_codex_effort/,
  );
});

test("worker response permits effort reselection only for automatic GPT-5.6 to GPT-5.5 fallback", () => {
  const result = {
    requested_model: "gpt-5.6-sol",
    model: "gpt-5.5",
    model_selection_origin: "auto",
    model_fallback: true,
    effort: "high",
  };
  const verified = verifyCodexWorkerTurnSelection(result, {
    requestedModel: "gpt-5.6-sol",
    selectionOrigin: "auto",
    requestedEffort: "ultra",
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.effectiveEffort, "high");
  assert.equal(verified.effortFallback, true);
  assert.equal(verifyCodexWorkerTurnSelection(result, {
    requestedModel: "gpt-5.6-sol",
    selectionOrigin: "explicit",
    requestedEffort: "ultra",
  }).ok, false);
  assert.equal(verifyCodexWorkerTurnSelection({ ...result, effort: "bad effort" }, {
    requestedModel: "gpt-5.6-sol",
    selectionOrigin: "auto",
    requestedEffort: "ultra",
  }).ok, false);
  assert.equal(verifyCodexWorkerTurnSelection({ ...result, requested_model: "gpt-5.5" }, {
    requestedModel: "gpt-5.5",
    selectionOrigin: "auto",
    requestedEffort: "ultra",
  }).ok, false);
});

function hmacRequestHeaders({
  token,
  method,
  path,
  body = "",
  channelNonce = "",
  timestamp = Date.now(),
  clientNonce = randomBytes(32).toString("base64url"),
}) {
  const timestampText = String(timestamp);
  const contentSha256 = createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
  const signature = createHmac("sha256", Buffer.from(token, "base64url")).update(Buffer.from(JSON.stringify([
    AUTH_VERSION,
    method,
    path,
    timestampText,
    clientNonce,
    channelNonce,
    contentSha256,
  ]), "utf8")).digest("base64url");
  return {
    "x-dev-erp-auth-version": AUTH_VERSION,
    "x-dev-erp-auth-timestamp": timestampText,
    "x-dev-erp-auth-nonce": clientNonce,
    "x-dev-erp-channel-nonce": channelNonce,
    "x-dev-erp-content-sha256": contentSha256,
    "x-dev-erp-signature": signature,
  };
}

function encryptedChannelRequest({ token, method, path, body, channelNonce }) {
  const timestamp = String(Date.now());
  const clientNonce = randomBytes(32).toString("base64url");
  const context = { method, path, timestamp, clientNonce, channelNonce };
  const info = Buffer.from(JSON.stringify([
    "dev_erp.codex_worker_channel_key.v1",
    "request",
    method,
    path,
    timestamp,
    clientNonce,
    channelNonce,
  ]), "utf8");
  const aad = Buffer.from(JSON.stringify([
    CHANNEL_AEAD_SCHEMA,
    "request",
    method,
    path,
    timestamp,
    clientNonce,
    channelNonce,
    "",
  ]), "utf8");
  const key = Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(token, "base64url"),
    Buffer.from(channelNonce, "base64url"),
    info,
    32,
  ));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(body, "utf8")), cipher.final()]);
  const wireBody = JSON.stringify({
    schema: CHANNEL_AEAD_SCHEMA,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  });
  return {
    context,
    wireBody,
    headers: {
      ...hmacRequestHeaders({
        token,
        method,
        path,
        body: wireBody,
        channelNonce,
        timestamp,
        clientNonce,
      }),
      "content-type": "application/json",
    },
  };
}

function hmacResponseHeaders({ token, method, path, requestHeaders, status, body }) {
  const contentSha256 = createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
  const signature = createHmac("sha256", Buffer.from(token, "base64url"))
    .update(Buffer.from(JSON.stringify([
      RESPONSE_AUTH_VERSION,
      AUTH_VERSION,
      method,
      path,
      requestHeaders["x-dev-erp-auth-nonce"],
      requestHeaders["x-dev-erp-channel-nonce"],
      String(status),
      contentSha256,
    ]), "utf8"))
    .digest("base64url");
  return {
    "content-type": "application/json",
    "x-dev-erp-response-version": RESPONSE_AUTH_VERSION,
    "x-dev-erp-response-content-sha256": contentSha256,
    "x-dev-erp-response-signature": signature,
  };
}

function minimalChildEnv(extra) {
  const env = {};
  for (const key of [
    "APPDATA", "COMSPEC", "HOME", "LOCALAPPDATA", "PATH", "PATHEXT", "SystemDrive",
    "SystemRoot", "TEMP", "TMP", "USERPROFILE", "WINDIR", "windir",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, ...extra };
}

function waitForReady(child, stderr) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`worker_ready_timeout:${stderr()}`)), 30_000);
    const reader = createInterface({ input: child.stdout });
    const finish = (callback, value) => {
      clearTimeout(timer);
      reader.close();
      child.removeListener("exit", onExit);
      callback(value);
    };
    const onExit = (code) => finish(reject, new Error(`worker_exited:${code}:${stderr()}`));
    child.once("exit", onExit);
    reader.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); }
      catch { return; }
      if (message?.event === "codex_dedicated_worker_ready") finish(resolve, message);
    });
  });
}

async function stopChild(child) {
  if (!child) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  let timer;
  await Promise.race([
    exited,
    new Promise((resolve) => { timer = setTimeout(resolve, 5000); }),
  ]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) child.kill();
}

async function waitForPath(path, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("fixture_path_timeout");
}

function auth(overrides = {}) {
  return {
    authenticated: true,
    account_id: "acct-a",
    roles: ["member"],
    project_id: "P26-014",
    ...overrides,
  };
}

function item(overrides = {}) {
  return {
    id: "ITEM-001",
    project_id: "P26-014",
    title: "Dedicated worker fixture",
    status: "open",
    due: "",
    assignee_ref: "owner",
    work_type: "implementation",
    completion_criteria: "Return a bounded result.",
    ...overrides,
  };
}

function turnWithBinding(client, binding, payload, options) {
  return client.turn({
    ...payload,
    expected_workspace_revision: binding.workspace_revision,
    expected_root_fingerprint: binding.root_fingerprint,
  }, options);
}

function assertClientError(code, status) {
  return (error) => {
    assert.ok(error instanceof CodexDedicatedWorkerClientError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  };
}

test("dedicated Codex worker is loopback/authenticated, reauthorizes logical workspaces, and never returns raw paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dev-erp-dedicated-worker-"));
  const codexHome = join(dir, "codex-home");
  const workspaceRoot = join(dir, "team", "approved", "project-a");
  const docsRoot = join(workspaceRoot, "docs");
  const attachmentRoot = join(dir, "attachments");
  const messagePayloadRoot = join(dir, "messages");
  const itemAttachmentRoot = join(attachmentRoot, "ITEM-001");
  const registryOwner = join(dir, "registry-owner");
  const registryPath = join(registryOwner, "codex-workspaces.runtime.json");
  const workerKeyOwner = join(dir, "worker-key-owner");
  const attestationPrivateKeyPath = join(workerKeyOwner, "worker-attestation-private.pem");
  const attestationPublicKeyPath = join(dir, "erp-attestation-public.pem");
  const oldRefKey = randomBytes(32).toString("base64url");
  const newRefKey = randomBytes(32).toString("base64url");
  const wrongOldRefKey = randomBytes(32).toString("base64url");
  const oldKeyring = JSON.stringify({ active_kid: "ref-old", keys: { "ref-old": oldRefKey } });
  const rotatedKeyring = JSON.stringify({
    active_kid: "ref-new",
    keys: { "ref-new": newRefKey, "ref-old": oldRefKey },
  });
  const wrongKeyring = JSON.stringify({
    active_kid: "ref-new",
    keys: { "ref-new": newRefKey, "ref-old": wrongOldRefKey },
  });
  const attestationKeys = generateKeyPairSync("ed25519");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(docsRoot, { recursive: true });
  mkdirSync(itemAttachmentRoot, { recursive: true });
  mkdirSync(messagePayloadRoot, { recursive: true });
  mkdirSync(registryOwner, { recursive: true });
  mkdirSync(workerKeyOwner, { recursive: true });
  chmodSync(workerKeyOwner, 0o700);
  writeFileSync(attestationPrivateKeyPath, attestationKeys.privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(attestationPublicKeyPath, attestationKeys.publicKey.export({ type: "spki", format: "pem" }));
  chmodSync(attestationPrivateKeyPath, 0o600);
  const identityProbe = spawnSync(process.execPath, [WORKER_ENTRY, "--identity-hash"], {
    cwd: APP_DIR,
    env: minimalChildEnv({ NODE_ENV: "test" }),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(identityProbe.status, 0);
  assert.match(identityProbe.stdout.trim(), /^[a-f0-9]{64}$/);
  assert.equal(identityProbe.stderr, "");
  const keyProbe = spawnSync(process.execPath, [WORKER_ENTRY, "--attestation-public-key-fingerprint"], {
    cwd: APP_DIR,
    env: minimalChildEnv({
      NODE_ENV: "test",
      DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE: attestationPrivateKeyPath,
    }),
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(keyProbe.status, 0);
  assert.equal(keyProbe.stdout.trim(), createHash("sha256")
    .update(attestationKeys.publicKey.export({ type: "spki", format: "der" }))
    .digest("hex"));
  assert.equal(keyProbe.stderr, "");
  writeFileSync(join(docsRoot, "fixture.txt"), "fixture", "utf8");
  const attachmentRecords = [
    { name: "evidence.txt", extension: ".txt", type: "localFile", bytes: Buffer.from("worker local file fixture") },
    { name: "figure.png", extension: ".png", type: "localImage", bytes: Buffer.from("worker local image fixture") },
  ].map(({ name, extension, type, bytes }) => {
    const attachmentId = createOpaqueAttachmentId();
    const record = createAttachmentManifestRecord({
      attachment_id: attachmentId,
      item_id: "ITEM-001",
      name,
      stored_name: `${attachmentId}${extension}`,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      type,
    });
    writeFileSync(join(itemAttachmentRoot, record.stored_name), bytes);
    return record;
  });
  writeFileSync(join(itemAttachmentRoot, "codex-attachment-manifest.v1.json"), `${JSON.stringify(createAttachmentManifest({
    item_id: "ITEM-001",
    attachments: attachmentRecords,
  }), null, 2)}\n`, "utf8");
  const registryDocument = (root) => ({
    schema: "dev_erp.codex_workspace_registry.v1",
    machine_id: "dedicated-worker-test",
    trust_domain_id: "dedicated-worker-domain",
    workspaces: [{
      workspace_id: "team_project_a",
      label: "Team project A",
      root_kind: "local",
      root,
      allowed_project_ids: ["P26-014"],
      allowed_account_ids: ["acct-a"],
      allowed_write_prefixes: ["docs"],
    }],
  });
  writeFileSync(registryPath, JSON.stringify(registryDocument(workspaceRoot)), "utf8");

  const baseWorkerEnv = minimalChildEnv({
    NODE_ENV: "test",
    DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE: attestationPrivateKeyPath,
    DEV_ERP_CODEX_WORKER_HOST: "127.0.0.1",
    DEV_ERP_CODEX_WORKER_PORT: "0",
    DEV_ERP_CODEX_WORKER_BRIDGE: "mock",
    DEV_ERP_CODEX_HOME: codexHome,
    DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: attachmentRoot,
    DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT: messagePayloadRoot,
    DEV_ERP_CODEX_WORKSPACE_REGISTRY: registryPath,
    DEV_ERP_CODEX_TRUST_DOMAIN: "dedicated-worker-domain",
    DEV_ERP_CODEX_MOCK_DELAY_MS: "150",
    DEV_ERP_CODEX_MOCK_WRITE_FILE: "1",
  });
  const launchWorker = (token, keyring) => {
    const child = spawn(process.execPath, [WORKER_ENTRY], {
      cwd: APP_DIR,
      env: {
        ...baseWorkerEnv,
        DEV_ERP_CODEX_WORKER_TOKEN: token,
        DEV_ERP_CODEX_WORKER_REF_KEYS_JSON: keyring,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16 * 1024); });
    return { child, stderr: () => stderr };
  };
  const initialWorker = launchWorker(TOKEN, oldKeyring);
  const child = initialWorker.child;
  let rotatedWorker = null;
  let wrongKeyWorker = null;
  let restartReplayChannel = null;

  try {
    const ready = await waitForReady(child, initialWorker.stderr);
    assert.equal(ready.host, "127.0.0.1");
    assert.equal(ready.pid, child.pid);
    assert.notEqual(ready.pid, process.pid);
    const baseUrl = `http://127.0.0.1:${ready.port}`;
    const client = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      timeoutMs: 10_000,
      attestationPublicKeyFile: attestationPublicKeyPath,
    });

    let response = await fetch(`${baseUrl}/v1/health`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "authentication_headers_invalid" });
    response = await fetch(`${baseUrl}/v1/health`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "authorization_header_forbidden" });

    let capturedHealthRequest = null;
    const captureClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      fetchImpl: async (url, options) => {
        capturedHealthRequest = { url, options: { ...options, headers: { ...options.headers } } };
        return fetch(url, options);
      },
    });
    assert.equal((await captureClient.health()).ok, true);
    assert.equal(Object.hasOwn(capturedHealthRequest.options.headers, "authorization"), false);
    assert.equal(JSON.stringify(capturedHealthRequest.options.headers).includes(TOKEN), false);
    response = await fetch(capturedHealthRequest.url, capturedHealthRequest.options);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { ok: false, error: "authentication_nonce_replayed" });

    const staleHeaders = hmacRequestHeaders({
      token: TOKEN,
      method: "GET",
      path: "/v1/health",
      timestamp: Date.now() - 60_000,
    });
    response = await fetch(`${baseUrl}/v1/health`, { headers: staleHeaders });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "authentication_timestamp_stale" });

    const health = await client.health();
    assert.equal(health.release, "v0.5.0");
    assert.equal(health.schema, "dev_erp.codex_dedicated_worker.v5");
    assert.equal(health.execution_boundary, "dedicated_worker");
    assert.equal(health.worker_pid, child.pid);
    assert.equal(health.listen_host, "127.0.0.1");
    assert.equal(health.codex_home_ready, true);
    assert.equal(health.attachment_root_ready, true);
    assert.equal(health.workspace_registry_ready, true);
    assert.equal(health.trust_domain_match, true);
    assert.equal(health.identity.proof_source, process.platform === "win32" ? "windows_whoami" : "os_userinfo");
    assert.equal(Object.hasOwn(health.identity, "name"), false);
    assert.match(health.identity.hash, /^[a-f0-9]{64}$/);
    assert.match(health.source_commit, /^[a-f0-9]{40}$/);
    assert.equal(typeof health.source_tree_clean, "boolean");
    assert.equal(health.forbidden_roots_ready, true);
    assert.ok(health.forbidden_root_count >= 5);
    assert.equal(health.capabilities.attachment_refs, "opaque_item_bound");
    assert.equal(health.capabilities.skills, false);

    const responseBodyTamperClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      fetchImpl: async (url, options) => {
        const original = await fetch(url, options);
        const body = `${await original.text()} `;
        return new Response(body, { status: original.status, headers: original.headers });
      },
    });
    await assert.rejects(
      responseBodyTamperClient.health(),
      assertClientError("worker_response_content_hash_mismatch", 200),
    );

    const responseStatusTamperClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      fetchImpl: async (url, options) => {
        const original = await fetch(url, options);
        return new Response(await original.text(), { status: 201, headers: original.headers });
      },
    });
    await assert.rejects(
      responseStatusTamperClient.health(),
      assertClientError("worker_response_authentication_invalid", 201),
    );

    let cachedAuthenticatedHealth = null;
    const responseNonceReplayClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      fetchImpl: async (url, options) => {
        if (!cachedAuthenticatedHealth) {
          const original = await fetch(url, options);
          cachedAuthenticatedHealth = {
            body: await original.text(),
            status: original.status,
            headers: new Headers(original.headers),
          };
        }
        return new Response(cachedAuthenticatedHealth.body, {
          status: cachedAuthenticatedHealth.status,
          headers: cachedAuthenticatedHealth.headers,
        });
      },
    });
    assert.equal((await responseNonceReplayClient.health()).ok, true);
    await assert.rejects(
      responseNonceReplayClient.health(),
      assertClientError("worker_response_authentication_invalid", 200),
    );

    const nonce = randomBytes(32).toString("base64url");
    const attested = await client.attest(nonce);
    assert.equal(attested.verified, true);
    assert.equal(attested.attestation.nonce, nonce);
    assert.equal(attested.attestation.worker_release, "v0.5.0");
    assert.equal(attested.attestation.worker_schema, "dev_erp.codex_dedicated_worker.v5");
    assert.equal(attested.attestation.worker_pid, child.pid);
    assert.equal(attested.attestation.listen_port, ready.port);
    assert.equal(attested.attestation.bridge_mode, "mock");
    assert.equal(attested.attestation.skills_disabled, true);
    assert.equal(attested.attestation.source_commit, health.source_commit);
    assert.equal(attested.attestation.worker_identity_hash, health.identity.hash);
    assert.equal(attested.attestation.codex_command_identity_ready, true);
    assert.match(attested.attestation.codex_command_revision, /^[a-f0-9]{64}$/);
    assert.match(attested.attestation.filesystem_boundary_revision, /^[a-f0-9]{64}$/);
    assert.match(attested.attestation.permission_profile_revision, /^[a-f0-9]{64}$/);
    assert.match(attested.attestation.channel_nonce, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Object.hasOwn(attested.attestation, "identity_name"), false);

    const healthOnlyAttestation = await client.attest(randomBytes(32).toString("base64url"), { issueChannel: false });
    assert.equal(healthOnlyAttestation.attestation.channel_nonce, "");

    const { verified: _verified, ...rawAttestation } = attested;
    assert.equal(verifyCodexDedicatedWorkerAttestation(rawAttestation, {
      publicKey: readFileSync(attestationPublicKeyPath),
      expectedNonce: nonce,
      expectedListenPort: ready.port,
    }).verified, true);
    assert.equal(verifyCodexDedicatedWorkerAttestation(rawAttestation, {
      publicKey: attestationKeys.publicKey.export({ type: "spki", format: "der" }),
      expectedNonce: nonce,
    }).verified, true);
    assert.throws(
      () => verifyCodexDedicatedWorkerAttestation(rawAttestation, {
        publicKey: readFileSync(attestationPublicKeyPath),
        expectedNonce: randomBytes(32).toString("base64url"),
      }),
      assertClientError("worker_attestation_nonce_mismatch", 0),
    );
    assert.throws(
      () => verifyCodexDedicatedWorkerAttestation(rawAttestation, {
        publicKey: readFileSync(attestationPublicKeyPath),
        expectedNonce: nonce,
        expectedListenPort: ready.port === 65535 ? 65534 : ready.port + 1,
      }),
      assertClientError("worker_attestation_port_mismatch", 0),
    );
    const mismatchedPort = ready.port === 65535 ? 65534 : ready.port + 1;
    const portReplacementClient = new CodexDedicatedWorkerClient({
      baseUrl: `http://127.0.0.1:${mismatchedPort}`,
      token: TOKEN,
      attestationPublicKey: readFileSync(attestationPublicKeyPath),
      fetchImpl: async (_url, options) => {
        const body = JSON.stringify(rawAttestation);
        return new Response(body, {
          status: 200,
          headers: hmacResponseHeaders({
            token: TOKEN,
            method: "POST",
            path: "/v1/attest",
            requestHeaders: options.headers,
            status: 200,
            body,
          }),
        });
      },
    });
    await assert.rejects(
      portReplacementClient.attest(nonce),
      assertClientError("worker_attestation_port_mismatch", 0),
    );

    const replayClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      attestationPublicKey: readFileSync(attestationPublicKeyPath),
      fetchImpl: async () => new Response(JSON.stringify(rawAttestation), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    });
    await assert.rejects(
      replayClient.attest(randomBytes(32).toString("base64url")),
      assertClientError("worker_response_authentication_invalid", 200),
    );

    let fakeObservedHeaders = null;
    const tokenOnlyFake = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      attestationPublicKey: readFileSync(attestationPublicKeyPath),
      fetchImpl: async (_url, options) => {
        fakeObservedHeaders = { ...options.headers };
        const requested = JSON.parse(options.body);
        const forged = {
          ...rawAttestation,
          attestation: { ...rawAttestation.attestation, nonce: requested.nonce },
        };
        return new Response(JSON.stringify(forged), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await assert.rejects(
      tokenOnlyFake.attest(randomBytes(32).toString("base64url")),
      assertClientError("worker_response_authentication_invalid", 200),
    );
    assert.equal(Object.hasOwn(fakeObservedHeaders, "authorization"), false);
    assert.equal(JSON.stringify(fakeObservedHeaders).includes(TOKEN), false);

    let redirectMode = null;
    const redirectClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      fetchImpl: async (_url, options) => {
        redirectMode = options.redirect;
        return new Response("", { status: 302, headers: { location: "http://127.0.0.1:9/steal" } });
      },
    });
    await assert.rejects(
      redirectClient.health(),
      assertClientError("worker_response_authentication_invalid", 302),
    );
    assert.equal(redirectMode, "error");

    const models = await client.models({ channel: attested });
    assert.equal(models.source, "mock_fallback");
    assert.deepEqual(models.models.map((model) => model.slug), ["gpt-5.5"]);
    await assert.rejects(
      client.models({ channel: attested }),
      assertClientError("channel_invalid_or_replayed", 409),
    );
    assert.equal((await client.models()).source, "mock_fallback");

    const rootBinding = await client.resolve({
      workspace_id: "team_project_a",
      authorization: auth(),
      relative_path: "",
    });

    let protectedTurnRequestBody = "";
    let protectedTurnResponseBody = "";
    const confidentialityClient = new CodexDedicatedWorkerClient({
      baseUrl,
      token: TOKEN,
      timeoutMs: 10_000,
      attestationPublicKeyFile: attestationPublicKeyPath,
      fetchImpl: async (url, options) => {
        const result = await fetch(url, options);
        if (String(url).endsWith("/v1/turn")) {
          protectedTurnRequestBody = String(options.body || "");
          protectedTurnResponseBody = await result.clone().text();
        }
        return result;
      },
    });
    const protectedOpened = await turnWithBinding(confidentialityClient, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: [],
      item: item(),
      initial: true,
      user_message: "",
      model: "gpt-5.5",
      effort: "medium",
    });
    assert.equal(protectedOpened.ok, true);
    assert.equal(JSON.parse(protectedTurnRequestBody).schema, CHANNEL_AEAD_SCHEMA);
    assert.equal(JSON.parse(protectedTurnResponseBody).schema, CHANNEL_AEAD_SCHEMA);
    for (const plaintext of ["team_project_a", "acct-a", "Dedicated worker fixture", "thread_ref"]) {
      assert.equal(protectedTurnRequestBody.includes(plaintext), false);
      assert.equal(protectedTurnResponseBody.includes(plaintext), false);
    }

    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth({ account_id: "acct-b" }), relative_path: "docs" }),
      assertClientError("workspace_principal_forbidden", 403),
    );
    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth({ project_id: "P26-999" }), relative_path: "docs" }),
      assertClientError("workspace_project_forbidden", 403),
    );

    const invalidFieldChannel = await client.attest(randomBytes(32).toString("base64url"));
    const invalidFieldRequest = encryptedChannelRequest({
      token: TOKEN,
      method: "POST",
      path: "/v1/resolve",
      body: JSON.stringify({
        workspace_id: "team_project_a",
        authorization: auth(),
        relative_path: "docs",
        cwd: workspaceRoot,
      }),
      channelNonce: invalidFieldChannel.attestation.channel_nonce,
    });
    response = await fetch(`${baseUrl}/v1/resolve`, {
      method: "POST",
      headers: invalidFieldRequest.headers,
      body: invalidFieldRequest.wireBody,
    });
    assert.equal(response.status, 400);
    const rawFieldBody = await response.text();
    assert.doesNotMatch(rawFieldBody, new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(rawFieldBody, /invalid_request/);

    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth(), relative_path: workspaceRoot }),
      assertClientError("invalid_relative_path", 400),
    );

    const resolved = await client.resolve({
      workspace_id: "team_project_a",
      authorization: auth(),
      relative_path: "docs",
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.workspace_id, "team_project_a");
    assert.equal(resolved.relative_path, "docs");
    assert.equal(resolved.target_is_directory, true);
    assert.equal(Object.hasOwn(resolved, "path"), false);

    const rawResolveBody = JSON.stringify({
      workspace_id: "team_project_a",
      authorization: auth(),
      relative_path: "docs",
    });
    const pathTamperChannel = await client.attest(randomBytes(32).toString("base64url"));
    const pathBoundRequest = encryptedChannelRequest({
      token: TOKEN,
      method: "POST",
      path: "/v1/resolve",
      body: rawResolveBody,
      channelNonce: pathTamperChannel.attestation.channel_nonce,
    });
    response = await fetch(`${baseUrl}/v1/turn`, {
      method: "POST",
      headers: pathBoundRequest.headers,
      body: pathBoundRequest.wireBody,
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "authentication_signature_invalid" });
    response = await fetch(`${baseUrl}/v1/resolve`, {
      method: "POST",
      headers: pathBoundRequest.headers,
      body: pathBoundRequest.wireBody,
    });
    assert.equal(response.status, 200);

    const bodyTamperChannel = await client.attest(randomBytes(32).toString("base64url"));
    const bodyBoundRequest = encryptedChannelRequest({
      token: TOKEN,
      method: "POST",
      path: "/v1/resolve",
      body: rawResolveBody,
      channelNonce: bodyTamperChannel.attestation.channel_nonce,
    });
    response = await fetch(`${baseUrl}/v1/resolve`, {
      method: "POST",
      headers: bodyBoundRequest.headers,
      body: `${bodyBoundRequest.wireBody} `,
    });
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /authentication_content_hash_mismatch/);
    response = await fetch(`${baseUrl}/v1/resolve`, {
      method: "POST",
      headers: bodyBoundRequest.headers,
      body: bodyBoundRequest.wireBody,
    });
    assert.equal(response.status, 200);

    const wrongAeadChannel = await client.attest(randomBytes(32).toString("base64url"));
    const wrongAeadRequest = encryptedChannelRequest({
      token: WRONG_KEY_TOKEN,
      method: "POST",
      path: "/v1/resolve",
      body: rawResolveBody,
      channelNonce: wrongAeadChannel.attestation.channel_nonce,
    });
    const wrongAeadHeaders = {
      ...hmacRequestHeaders({
        token: TOKEN,
        method: wrongAeadRequest.context.method,
        path: wrongAeadRequest.context.path,
        body: wrongAeadRequest.wireBody,
        channelNonce: wrongAeadRequest.context.channelNonce,
        timestamp: wrongAeadRequest.context.timestamp,
        clientNonce: wrongAeadRequest.context.clientNonce,
      }),
      "content-type": "application/json",
    };
    response = await fetch(`${baseUrl}/v1/resolve`, {
      method: "POST",
      headers: wrongAeadHeaders,
      body: wrongAeadRequest.wireBody,
    });
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /encrypted_payload_authentication_failed/);

    const staleRegistryChannel = await client.attest(randomBytes(32).toString("base64url"));
    const relabeledRegistry = registryDocument(workspaceRoot);
    relabeledRegistry.workspaces[0].label = "Changed after attestation";
    writeFileSync(registryPath, JSON.stringify(relabeledRegistry), "utf8");
    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth(), relative_path: "" }, { channel: staleRegistryChannel }),
      assertClientError("channel_workspace_registry_mismatch", 409),
    );

    writeFileSync(registryPath, JSON.stringify(registryDocument(workspaceRoot)), "utf8");
    const staleTreeChannel = await client.attest(randomBytes(32).toString("base64url"));
    writeFileSync(join(docsRoot, "changed-after-attestation.txt"), "changed", "utf8");
    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth(), relative_path: "" }, { channel: staleTreeChannel }),
      assertClientError("channel_workspace_registry_mismatch", 409),
    );
    rmSync(join(docsRoot, "changed-after-attestation.txt"), { force: true });

    writeFileSync(registryPath, JSON.stringify(registryDocument(messagePayloadRoot)), "utf8");
    await assert.rejects(
      client.resolve({ workspace_id: "team_project_a", authorization: auth(), relative_path: "" }),
      assertClientError("workspace_root_boundary_overlap", 503),
    );
    writeFileSync(registryPath, JSON.stringify(registryDocument(workspaceRoot)), "utf8");
    assert.equal((await client.resolve({
      workspace_id: "team_project_a",
      authorization: auth(),
      relative_path: "docs",
    })).ok, true);

    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item({ project_id: "P26-999" }),
        initial: true,
        user_message: "",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("item_project_mismatch", 403),
    );

    const autoFallback = await turnWithBinding(client, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: [],
      item: item(),
      initial: true,
      user_message: "",
      model: "gpt-5.6",
      model_selection_origin: "auto",
      effort: "ultra",
      timeout_ms: 5000,
    });
    assert.equal(autoFallback.requested_model, "gpt-5.6");
    assert.equal(autoFallback.model, "gpt-5.5");
    assert.equal(autoFallback.model_selection_origin, "auto");
    assert.equal(autoFallback.model_fallback, true);
    assert.equal(autoFallback.effort, "high");

    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: true,
        user_message: "",
        model: "gpt-5.6",
        model_selection_origin: "explicit",
        effort: "medium",
        timeout_ms: 5000,
      }),
      assertClientError("unsupported_codex_model", 400),
    );

    const noStaticWritePolicy = registryDocument(workspaceRoot);
    noStaticWritePolicy.workspaces[0].allowed_write_prefixes = [];
    writeFileSync(registryPath, JSON.stringify(noStaticWritePolicy), "utf8");
    const noStaticWriteBinding = await client.resolve({
      workspace_id: "team_project_a",
      authorization: auth(),
      relative_path: "",
    });
    await assert.rejects(
      turnWithBinding(client, noStaticWriteBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: ["docs"],
        item: item(),
        initial: true,
        user_message: "",
        model: "gpt-5.5",
        effort: "medium",
        timeout_ms: 5000,
      }),
      assertClientError("workspace_write_prefix_forbidden", 403),
    );
    writeFileSync(registryPath, JSON.stringify(registryDocument(workspaceRoot)), "utf8");

    const opened = await turnWithBinding(client, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: ["docs"],
      item: item(),
      initial: true,
      user_message: "",
      model: "gpt-5.5",
      effort: "medium",
      timeout_ms: 5000,
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.created, true);
    assert.equal(opened.effective_access, "workspace-write");
    assert.equal(readFileSync(join(docsRoot, "codex-mock-write.txt"), "utf8"), "bounded mock write\n");
    assert.match(opened.thread_ref, /^dwr2\.ref-old\./);
    assert.ok(opened.thread_ref.length > 200);
    assert.equal(opened.thread_ref.includes("thread_id"), false);
    assert.equal(opened.thread_ref.includes("mock"), false);
    assert.equal(opened.thread_ref.includes("team_project_a"), false);
    assert.equal(opened.thread_ref.includes("ITEM-001"), false);
    assert.equal(Object.hasOwn(opened, "threadId"), false);
    assert.equal(Object.hasOwn(opened, "cwd"), false);

    const mockWriteMarker = join(docsRoot, "codex-mock-write.txt");
    const immutableSource = join(workspaceRoot, "source.txt");
    rmSync(mockWriteMarker, { force: true });
    writeFileSync(immutableSource, "before", "utf8");
    const concurrentOutsideMutation = turnWithBinding(client, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: ["docs"],
      item: item(),
      initial: false,
      thread_ref: opened.thread_ref,
      user_message: "bounded write with concurrent outside mutation",
      model: "gpt-5.5",
      effort: "medium",
      timeout_ms: 5000,
    });
    await waitForPath(mockWriteMarker);
    writeFileSync(immutableSource, "changed outside approved prefix", "utf8");
    await assert.rejects(
      concurrentOutsideMutation,
      assertClientError("workspace_immutable_tree_changed", 409),
    );

    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: opened.thread_ref,
        user_message: "raw attachment path field must fail",
        model: "gpt-5.5",
        effort: "medium",
        attachments: [{ attachment_id: attachmentRecords[0].attachment_id, path: workspaceRoot }],
      }),
      assertClientError("client_attachment_path_forbidden", 400),
    );

    const followup = await turnWithBinding(client, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: [],
      item: item(),
      initial: false,
      thread_ref: opened.thread_ref,
      user_message: `Do not return this absolute path: ${workspaceRoot}`,
      model: "gpt-5.5",
      effort: "medium",
      timeout_ms: 5000,
      attachments: attachmentRecords.map((record) => publicAttachmentDescriptor(record)),
    });
    assert.equal(followup.ok, true);
    assert.deepEqual(followup.attachments, attachmentRecords.map((record) => publicAttachmentDescriptor(record)));
    assert.doesNotMatch(followup.text, new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.match(followup.text, /\[path redacted\]/);

    const tamperedRef = `${opened.thread_ref.slice(0, -1)}${opened.thread_ref.endsWith("A") ? "B" : "A"}`;
    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: tamperedRef,
        user_message: "tampered",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("invalid_thread_ref", 400),
    );

    const unknownKidParts = opened.thread_ref.split(".");
    unknownKidParts[1] = "ref-missing";
    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: unknownKidParts.join("."),
        user_message: "unknown key id",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("invalid_thread_ref", 400),
    );

    const controller = new AbortController();
    const aborted = turnWithBinding(client, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: [],
      item: item(),
      initial: false,
      thread_ref: opened.thread_ref,
      user_message: "abort this request",
      model: "gpt-5.5",
      effort: "medium",
      timeout_ms: 5000,
    }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(aborted, assertClientError("worker_request_aborted", 0));
    assert.equal((await client.health()).ok, true);

    const oversizedChannel = await client.attest(randomBytes(32).toString("base64url"));
    const oversizedRequest = encryptedChannelRequest({
      token: TOKEN,
      method: "POST",
      path: "/v1/turn",
      body: JSON.stringify({ oversized: "x".repeat(140 * 1024) }),
      channelNonce: oversizedChannel.attestation.channel_nonce,
    });
    response = await fetch(`${baseUrl}/v1/turn`, {
      method: "POST",
      headers: oversizedRequest.headers,
      body: oversizedRequest.wireBody,
    });
    assert.equal(response.status, 413);
    assert.doesNotMatch(await response.text(), /request_too_large/);

    writeFileSync(join(workspaceRoot, "AGENTS.md"), "untrusted workspace instruction", "utf8");
    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: opened.thread_ref,
        user_message: "workspace instruction surface must fail",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("workspace_tree_protected_entry", 503),
    );
    rmSync(join(workspaceRoot, "AGENTS.md"), { force: true });

    mkdirSync(join(codexHome, "plugins"));
    await assert.rejects(
      client.health(),
      assertClientError("codex_home_profile_unsafe", 503),
    );
    await assert.rejects(
      turnWithBinding(client, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: opened.thread_ref,
        user_message: "must fail after unsafe profile drift",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("codex_home_profile_unsafe", 503),
    );
    rmSync(join(codexHome, "plugins"), { recursive: true, force: true });
    assert.equal((await client.health()).ok, true);

    const allPublicOutput = JSON.stringify({ ready, health, models, resolved, opened, followup, stderr: initialWorker.stderr() });
    for (const forbidden of [workspaceRoot, codexHome, registryPath, attachmentRoot, messagePayloadRoot, ...attachmentRecords.map((record) => join(itemAttachmentRoot, record.stored_name))]) {
      assert.equal(allPublicOutput.toLowerCase().includes(forbidden.toLowerCase()), false);
    }
    assert.equal(initialWorker.stderr(), "");

    restartReplayChannel = await client.attest(randomBytes(32).toString("base64url"));

    await stopChild(child);
    rotatedWorker = launchWorker(ROTATED_TOKEN, rotatedKeyring);
    const rotatedReady = await waitForReady(rotatedWorker.child, rotatedWorker.stderr);
    const rotatedBaseUrl = `http://127.0.0.1:${rotatedReady.port}`;
    const rotatedClient = new CodexDedicatedWorkerClient({
      baseUrl: rotatedBaseUrl,
      token: ROTATED_TOKEN,
      timeoutMs: 10_000,
      attestationPublicKeyFile: attestationPublicKeyPath,
    });
    response = await fetch(`${rotatedBaseUrl}/v1/health`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 401);
    const restartedChannelHeaders = hmacRequestHeaders({
      token: ROTATED_TOKEN,
      method: "GET",
      path: "/v1/models",
      channelNonce: restartReplayChannel.attestation.channel_nonce,
    });
    response = await fetch(`${rotatedBaseUrl}/v1/models`, { headers: restartedChannelHeaders });
    assert.equal(response.status, 409);
    assert.doesNotMatch(await response.text(), /channel_invalid_or_replayed/);
    const resumedAfterBearerAndRefRotation = await turnWithBinding(rotatedClient, rootBinding, {
      workspace_id: "team_project_a",
      authorization: auth(),
      working_relative_path: "docs",
      relative_write_prefixes: [],
      item: item(),
      initial: false,
      thread_ref: opened.thread_ref,
      user_message: "resume with a rotated bearer and previous ref key",
      model: "gpt-5.5",
      effort: "medium",
      timeout_ms: 5000,
    });
    assert.equal(resumedAfterBearerAndRefRotation.ok, true);
    assert.match(resumedAfterBearerAndRefRotation.thread_ref, /^dwr2\.ref-new\./);
    assert.equal(rotatedWorker.stderr(), "");

    await stopChild(rotatedWorker.child);
    wrongKeyWorker = launchWorker(WRONG_KEY_TOKEN, wrongKeyring);
    const wrongKeyReady = await waitForReady(wrongKeyWorker.child, wrongKeyWorker.stderr);
    const wrongKeyClient = new CodexDedicatedWorkerClient({
      baseUrl: `http://127.0.0.1:${wrongKeyReady.port}`,
      token: WRONG_KEY_TOKEN,
      timeoutMs: 10_000,
      attestationPublicKeyFile: attestationPublicKeyPath,
    });
    await assert.rejects(
      turnWithBinding(wrongKeyClient, rootBinding, {
        workspace_id: "team_project_a",
        authorization: auth(),
        working_relative_path: "docs",
        relative_write_prefixes: [],
        item: item(),
        initial: false,
        thread_ref: opened.thread_ref,
        user_message: "wrong key material must fail",
        model: "gpt-5.5",
        effort: "medium",
      }),
      assertClientError("invalid_thread_ref", 400),
    );
    assert.equal(wrongKeyWorker.stderr(), "");
  } finally {
    await stopChild(child);
    await stopChild(rotatedWorker?.child);
    await stopChild(wrongKeyWorker?.child);
    rmSync(dir, { recursive: true, force: true });
  }
});
