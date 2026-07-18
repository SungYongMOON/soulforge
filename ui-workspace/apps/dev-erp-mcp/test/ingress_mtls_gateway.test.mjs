import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import test from "node:test";

import { createIngressMcpHttpServer } from "../ingress_server.mjs";
import { IngressClient } from "../src/ingress_client.mjs";
import {
  generateIngressToken,
  hashIngressToken,
  INGRESS_MCP_AUTH_SCHEMA,
  INGRESS_MCP_CONFIG_SCHEMA,
  createIngressMcpService,
} from "../src/ingress_mcp_service.mjs";
import { createIngressMtlsFetch, loadIngressMtlsClientBinding } from "../src/ingress_mtls_client.mjs";
import { preflightIngressMtlsCanary, probeIngressMtlsCanary } from "../src/ingress_mtls_canary.mjs";
import {
  enrollIngressMtlsDevice,
  initializeIngressMtlsDeviceRegistry,
  listIngressMtlsDevices,
  revokeIngressMtlsDevice,
} from "../src/ingress_mtls_device_admin.mjs";
import {
  createIngressMtlsGateway,
  createIngressMtlsGatewayHandler,
  INGRESS_MTLS_GATEWAY_SCHEMA,
  loadIngressMtlsGatewayConfig,
} from "../src/ingress_mtls_gateway.mjs";

const SYNTHETIC_LAN_IP = "172.20.0.10";

function opensslPath() {
  const bundled = process.platform === "win32" && process.env.ProgramFiles
    ? resolve(process.env.ProgramFiles, "Git", "usr", "bin", "openssl.exe")
    : null;
  const executableName = process.platform === "win32" ? "openssl.exe" : "openssl";
  const pathCandidates = String(process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => resolve(entry, executableName));
  const candidates = [bundled, ...pathCandidates].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      execFileSync(candidate, ["version"], { stdio: "ignore" });
      return realpathSync(candidate);
    } catch {}
  }
  return null;
}

function run(openssl, args) {
  execFileSync(openssl, args, { stdio: "ignore" });
}

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function freePort() {
  return new Promise((accept, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : accept(port));
    });
  });
}

function listen(server, port, host = "127.0.0.1") {
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, host, accept);
  });
}

function close(server) {
  return new Promise((accept) => server.close(accept));
}

function capturedResponse() {
  let status = null;
  let body = "";
  return {
    headersSent: false,
    writableEnded: false,
    writeHead(value) {
      status = value;
      this.headersSent = true;
    },
    end(value = "") {
      body += value;
      this.writableEnded = true;
    },
    destroy() {
      this.writableEnded = true;
    },
    result() {
      return { status, body: body ? JSON.parse(body) : null };
    },
  };
}

async function certificates(root, openssl) {
  const caKey = resolve(root, "ca.key");
  const caCert = resolve(root, "ca.crt");
  run(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", caKey, "-out", caCert,
    "-days", "2", "-subj", "/CN=Soulforge Synthetic Ingress CA",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ]);

  async function leaf(name, extendedKeyUsage, subjectAltName = null) {
    const key = resolve(root, `${name}.key`);
    const csr = resolve(root, `${name}.csr`);
    const cert = resolve(root, `${name}.crt`);
    const ext = resolve(root, `${name}.ext`);
    run(openssl, ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", csr, "-subj", `/CN=${name}`]);
    const lines = [
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      `extendedKeyUsage=${extendedKeyUsage}`,
    ];
    if (subjectAltName) lines.push(`subjectAltName=${subjectAltName}`);
    await writeFile(ext, `${lines.join("\n")}\n`, "utf8");
    run(openssl, [
      "x509", "-req", "-in", csr, "-CA", caCert, "-CAkey", caKey, "-CAcreateserial",
      "-out", cert, "-days", "1", "-extfile", ext,
    ]);
    return { key, cert };
  }

  return {
    caCert,
    server: await leaf("synthetic-hpp", "serverAuth", `IP:${SYNTHETIC_LAN_IP}`),
    client: await leaf("synthetic-seat-a", "clientAuth"),
    unregistered: await leaf("synthetic-seat-unregistered", "clientAuth"),
  };
}

function credential(credentialId, accountId, deviceId, agentId, token) {
  return {
    credential_id: credentialId,
    account_id: accountId,
    device_id: deviceId,
    agent_id: agentId,
    token_hash: hashIngressToken(token),
    project_scopes: ["PRJ_A"],
    capabilities: ["publish:run_logs", "publish:structured_pc_work", "receipt:read", "upload:team_files"],
    created_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2027-07-01T00:00:00.000Z",
    revoked_at: null,
  };
}

async function fixture(t) {
  const openssl = opensslPath();
  if (!openssl) {
    t.skip("OpenSSL unavailable");
    return null;
  }
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-mtls-"));
  const certs = await certificates(root, openssl);
  const outboxRoot = resolve(root, "outbox");
  const stateRoot = resolve(root, "mcp-state");
  const submissionRoot = resolve(stateRoot, "submissions");
  const registryPath = resolve(root, "auth.json");
  const deviceRegistryPath = resolve(root, "devices.json");
  const outboxBindingPath = resolve(root, "outbox.json");
  const configPath = resolve(root, "ingress.json");
  const gatewayPath = resolve(root, "gateway.json");
  const clientBindingPath = resolve(root, "client.json");
  const unregisteredBindingPath = resolve(root, "unregistered-client.json");
  const backendPort = await freePort();
  const gatewayPort = await freePort();
  const lanes = ["team_files", "structured_pc_work", "run_logs"];
  await mkdir(outboxRoot);
  for (const lane of lanes) {
    await mkdir(resolve(outboxRoot, lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "receipts", lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "acks", lane), { recursive: true });
  }
  for (const part of ["tickets", "uploads", "indexes", "event_sources", "submissions", "quota_locks"]) {
    await mkdir(resolve(stateRoot, part), { recursive: true });
  }
  await json(outboxBindingPath, {
    schema_version: "soulforge.ingress.local_outbox_binding.v1",
    node_id: "HPP_SYNTHETIC",
    outbox_root: outboxRoot,
    lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      enabled: true,
      queue_root: resolve(outboxRoot, lane),
      source_owner_ref: "mtls_synthetic_test",
    }])),
  });
  const token = generateIngressToken();
  const foreignToken = generateIngressToken();
  await json(registryPath, {
    schema_version: INGRESS_MCP_AUTH_SCHEMA,
    revision: "rev_synthetic_1",
    tokens: [
      credential("cred_seat_a", "person_a", "workpc_a", "codex_a", token),
      credential("cred_seat_b", "person_b", "workpc_b", "codex_b", foreignToken),
    ],
  });
  await initializeIngressMtlsDeviceRegistry({ registryPath: deviceRegistryPath });
  const clientX509 = new X509Certificate(await readFile(certs.client.cert));
  await enrollIngressMtlsDevice({
    registryPath: deviceRegistryPath,
    certificatePath: certs.client.cert,
    credentialId: "cred_seat_a",
    accountId: "person_a",
    deviceId: "workpc_a",
    allowedAgentIds: ["codex_a"],
    expiresAt: Math.min(Date.now() + 12 * 60 * 60 * 1000, Date.parse(clientX509.validTo) - 1000),
  });
  await json(configPath, {
    schema_version: INGRESS_MCP_CONFIG_SCHEMA,
    enabled: true,
    node_id: "HPP_SYNTHETIC",
    listen_host: "127.0.0.1",
    listen_port: backendPort,
    public_url: `https://${SYNTHETIC_LAN_IP}:${gatewayPort}`,
    local_outbox_binding_path: outboxBindingPath,
    auth_registry_path: registryPath,
    state_root: stateRoot,
    submission_root: submissionRoot,
    max_file_bytes: 1024 * 1024,
    chunk_bytes: 64 * 1024,
    ticket_ttl_seconds: 600,
    max_open_uploads_per_credential: 8,
    max_pending_upload_bytes_per_credential: 8 * 1024 * 1024,
    max_retained_upload_bytes_per_credential: 64 * 1024 * 1024,
  });
  const gateway = {
    schema_version: INGRESS_MTLS_GATEWAY_SCHEMA,
    enabled: true,
    audience: "hpp_ingress_mcp",
    listen_host: SYNTHETIC_LAN_IP,
    allowed_client_ipv4: "172.20.0.11",
    listen_port: gatewayPort,
    public_url: `https://${SYNTHETIC_LAN_IP}:${gatewayPort}`,
    backend_url: `http://127.0.0.1:${backendPort}`,
    ingress_mcp_binding_path: configPath,
    tls_cert_path: certs.server.cert,
    tls_key_path: certs.server.key,
    client_ca_path: certs.caCert,
    device_registry_path: deviceRegistryPath,
    max_requests_per_minute: 100,
    max_concurrent_requests_per_device: 8,
    max_body_bytes: 1024 * 1024,
    upstream_timeout_ms: 10000,
  };
  await json(gatewayPath, gateway);
  const serverPin = sha256(new X509Certificate(await readFile(certs.server.cert)).raw);
  const clientBinding = (cert, key, pin = serverPin) => ({
    schema_version: "soulforge.ingress.mtls_client_binding.v1",
    audience: "hpp_ingress_mcp",
    base_url: `https://${SYNTHETIC_LAN_IP}:${gatewayPort}`,
    ca_cert_path: certs.caCert,
    client_cert_path: cert,
    client_key_path: key,
    server_certificate_sha256: pin,
    expected_account_id: "person_a",
    expected_device_id: "workpc_a",
    expected_agent_id: "codex_a",
  });
  await json(clientBindingPath, clientBinding(certs.client.cert, certs.client.key));
  await json(unregisteredBindingPath, clientBinding(certs.unregistered.cert, certs.unregistered.key));
  return {
    root, certs, outboxRoot, configPath, gatewayPath, gateway, clientBindingPath, unregisteredBindingPath,
    deviceRegistryPath, token, foreignToken, backendPort, gatewayPort,
    async cleanup() { await rm(root, { recursive: true, force: true }); },
  };
}

function eventInput(overrides = {}) {
  return {
    project_hint: "PRJ_A",
    occurrence_id: "mtls_work_01",
    idempotency_key: "mtls:work:0001",
    event_kind: "work_checkpoint",
    occurred_at: "2026-07-17T10:00:00.000Z",
    task_ref: "TASK_01",
    summary: "Synthetic physical-seat boundary test",
    outputs: [],
    verification: "mTLS gateway E2E",
    next_actions: [],
    stop_conditions: ["no real LAN activation"],
    ...overrides,
  };
}

test("device enrollment accepts clientAuth public certs, hides full fingerprints, and revokes immediately", async (t) => {
  const openssl = opensslPath();
  if (!openssl) return t.skip("OpenSSL unavailable");
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-device-admin-"));
  try {
    const certs = await certificates(root, openssl);
    const registryPath = resolve(root, "devices.json");
    await initializeIngressMtlsDeviceRegistry({ registryPath });
    const x509 = new X509Certificate(await readFile(certs.client.cert));
    const enrolled = await enrollIngressMtlsDevice({
      registryPath,
      certificatePath: certs.client.cert,
      credentialId: "cred_a",
      accountId: "person_a",
      deviceId: "workpc_a",
      allowedAgentIds: ["codex_a"],
      expiresAt: Date.parse(x509.validTo) - 1000,
    });
    assert.equal(enrolled.device.certificate_ref.length, "sha256:".length + 12);
    assert.equal((await listIngressMtlsDevices({ registryPath })).full_fingerprints_exposed, false);
    await assert.rejects(enrollIngressMtlsDevice({
      registryPath,
      certificatePath: certs.server.cert,
      credentialId: "cred_server",
      accountId: "person_a",
      deviceId: "workpc_a",
      allowedAgentIds: ["codex_a"],
      expiresAt: Date.now() + 60_000,
    }), /device_certificate_invalid/);
    assert.equal((await revokeIngressMtlsDevice({ registryPath, credentialId: "cred_a" })).status, "revoked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source IPv4 guard normalizes mapped addresses and runs before certificate or bearer auth", async () => {
  let certificateChecks = 0;
  let bearerChecks = 0;
  const handler = createIngressMtlsGatewayHandler({
    config: {
      allowedClientIpv4: "10.20.30.40",
      publicUrl: new URL("https://10.20.30.10:8443"),
    },
    authService: {
      async authenticate() {
        bearerChecks += 1;
        throw new Error("unexpected_bearer_auth");
      },
    },
  });

  for (const remoteAddress of ["10.20.30.41", "::ffff:10.20.30.41", "2001:db8::1", undefined]) {
    const res = capturedResponse();
    const socket = { remoteAddress };
    Object.defineProperty(socket, "authorized", {
      get() {
        certificateChecks += 1;
        throw new Error("unexpected_certificate_auth");
      },
    });
    await handler({ socket, headers: {}, url: "/health", method: "GET" }, res);
    assert.deepEqual(res.result(), { status: 403, body: { error: "mtls_source_ip_not_allowed" } });
  }
  assert.equal(certificateChecks, 0);
  assert.equal(bearerChecks, 0);

  for (const remoteAddress of ["10.20.30.40", "::ffff:10.20.30.40"]) {
    const res = capturedResponse();
    const socket = { remoteAddress };
    Object.defineProperty(socket, "authorized", {
      get() {
        certificateChecks += 1;
        return false;
      },
    });
    await handler({
      socket,
      headers: { host: "10.20.30.10:8443" },
      url: "/health",
      method: "GET",
    }, res);
    assert.deepEqual(res.result(), { status: 401, body: { error: "mtls_client_certificate_required" } });
  }
  assert.equal(certificateChecks, 2);
  assert.equal(bearerChecks, 0);
});

test("synthetic private-LAN mTLS gateway carries all ingress tools and rejects identity, pin, route, and size attacks", async (t) => {
  const f = await fixture(t);
  if (!f) return;
  let backend;
  let gateway;
  let client;
  try {
    const service = await createIngressMcpService({ configPath: f.configPath });
    backend = await createIngressMcpHttpServer({ service });
    gateway = await createIngressMtlsGateway({
      configPath: f.gatewayPath,
      authService: service,
      allowSyntheticLoopback: true,
    });
    const tlsErrors = [];
    gateway.on("tlsClientError", (error) => tlsErrors.push(`${error.code || "tls_error"}:${error.message}`));
    assert.throws(() => gateway.listen(f.gatewayPort, "0.0.0.0"), /mtls_gateway_exact_lan_bind_required/);
    await listen(backend, f.backendPort);
    const backendHealth = await fetch(`http://127.0.0.1:${f.backendPort}/health`);
    assert.equal(backendHealth.status, 200);
    await listen(gateway, f.gatewayPort);

    const binding = await loadIngressMtlsClientBinding(f.clientBindingPath);
    const fetchImpl = await createIngressMtlsFetch({ binding, syntheticLoopbackAddress: "127.0.0.1" });
    let health;
    try {
      health = await fetchImpl(new URL("/health", binding.baseUrl));
    } catch (error) {
      assert.fail(`registered mTLS health failed: ${error.code || error.message}; server=${tlsErrors.join("|")}`);
    }
    assert.equal(health.status, 200, await health.text());
    let initialize;
    try {
      initialize = await fetchImpl(new URL("/mcp", binding.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${f.token}`,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "synthetic-probe", version: "1.0.0" },
          },
        }),
      });
    } catch (error) {
      assert.fail(`registered mTLS initialize failed: ${error.code || error.message}; server=${tlsErrors.join("|")}`);
    }
    assert.equal(initialize.status, 200, await initialize.text());
    t.diagnostic("mTLS initialize passed");
    client = new IngressClient({ baseUrl: binding.baseUrl, token: f.token, fetchImpl });
    const identity = await client.whoami();
    t.diagnostic("SDK identity passed");
    assert.deepEqual(
      { account_id: identity.account_id, device_id: identity.device_id, agent_id: identity.agent_id },
      { account_id: "person_a", device_id: "workpc_a", agent_id: "codex_a" },
    );
    const source = resolve(f.root, "physical-seat-synthetic.xlsx");
    const sourceBytes = Buffer.alloc(150_000, 0x5a);
    await writeFile(source, sourceBytes);
    const uploaded = await client.uploadFile({
      path: source,
      projectHint: "PRJ_A",
      occurrenceId: "mtls_file_01",
      idempotencyKey: "mtls:file:0001",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    assert.equal(uploaded.status, "pending_server_ack");
    assert.deepEqual(await readFile(source), sourceBytes);
    assert.deepEqual(await readFile(resolve(f.outboxRoot, "team_files", "mcp_cred_seat_a_mtls_file_01.payload")), sourceBytes);
    t.diagnostic("file upload passed");
    const work = await client.publishWorkEvent(eventInput());
    const run = await client.publishRunReceipt(eventInput({
      occurrence_id: "mtls_run_01",
      idempotency_key: "mtls:run:0001",
      event_kind: "validation_receipt",
    }));
    assert.equal(work.lane, "structured_pc_work");
    assert.equal(run.lane, "run_logs");
    assert.equal((await client.submissionStatus(work.submission_id)).status, "pending_server_ack");
    t.diagnostic("event lanes passed");

    const preflight = await preflightIngressMtlsCanary({ bindingPath: f.clientBindingPath });
    assert.equal(preflight.status, "ready_for_owner_coordinated_probe");
    assert.equal(preflight.live_probe_performed, false);
    const probe = await probeIngressMtlsCanary({
      bindingPath: f.clientBindingPath,
      token: f.token,
      syntheticLoopbackAddress: "127.0.0.1",
    });
    assert.equal(probe.status, "read_only_identity_verified");
    assert.equal(probe.write_performed, false);
    t.diagnostic("canary probe passed");

    const unregistered = await loadIngressMtlsClientBinding(f.unregisteredBindingPath);
    const unregisteredFetch = await createIngressMtlsFetch({
      binding: unregistered,
      syntheticLoopbackAddress: "127.0.0.1",
    });
    const unregisteredHealth = await unregisteredFetch(new URL("/health", unregistered.baseUrl));
    assert.equal(unregisteredHealth.status, 403);
    t.diagnostic("unregistered cert rejected");

    const mismatch = await fetchImpl(new URL("/mcp", binding.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${f.foreignToken}`, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(mismatch.status, 403);
    assert.deepEqual(await mismatch.json(), { error: "mtls_bearer_identity_mismatch" });
    t.diagnostic("identity mismatch rejected");

    const badHost = await fetchImpl(new URL("/health", binding.baseUrl), { headers: { Host: "bad.invalid" } });
    assert.equal(badHost.status, 421);
    t.diagnostic("host guard passed");
    const blockedRoute = await fetchImpl(new URL("/private", binding.baseUrl));
    assert.equal(blockedRoute.status, 404);
    t.diagnostic("route guard passed");
    let tooLargeResult;
    try {
      const tooLarge = await fetchImpl(new URL("/mcp", binding.baseUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${f.token}`, "content-type": "application/json" },
        body: Buffer.alloc(f.gateway.max_body_bytes + 1, 0x31),
      });
      tooLargeResult = tooLarge.status;
    } catch (error) {
      tooLargeResult = error.code;
    }
    assert.ok([413, "ECONNRESET", "EPIPE"].includes(tooLargeResult), `unexpected oversized result: ${tooLargeResult}`);
    t.diagnostic("route and size guards passed");

    const badPinPath = resolve(f.root, "bad-pin.json");
    const rawBinding = JSON.parse(await readFile(f.clientBindingPath, "utf8"));
    rawBinding.server_certificate_sha256 = "0".repeat(64);
    await json(badPinPath, rawBinding);
    const badPin = await loadIngressMtlsClientBinding(badPinPath);
    const badPinFetch = await createIngressMtlsFetch({ binding: badPin, syntheticLoopbackAddress: "127.0.0.1" });
    await assert.rejects(badPinFetch(new URL("/health", badPin.baseUrl)), /certificate|pin|socket|TLS/i);
    t.diagnostic("pin mismatch rejected");

    await revokeIngressMtlsDevice({ registryPath: f.deviceRegistryPath, credentialId: "cred_seat_a" });
    const revoked = await fetchImpl(new URL("/health", binding.baseUrl));
    assert.equal(revoked.status, 403);
    t.diagnostic("revocation passed");
  } finally {
    await client?.close();
    if (gateway?.listening) await close(gateway);
    if (backend?.listening) await close(backend);
    await f.cleanup();
  }
});

test("gateway config stays feature-OFF and rejects non-office or VPN-style endpoints", async (t) => {
  const f = await fixture(t);
  if (!f) return;
  try {
    const off = {
      ...f.gateway,
      enabled: false,
      allowed_client_ipv4: null,
      tls_cert_path: resolve(f.root, "not-materialized-server.crt"),
      tls_key_path: resolve(f.root, "not-materialized-server.key"),
      client_ca_path: resolve(f.root, "not-materialized-ca.crt"),
    };
    await json(f.gatewayPath, off);
    const offConfig = await loadIngressMtlsGatewayConfig(f.gatewayPath);
    assert.equal(offConfig.enabled, false);
    assert.equal(offConfig.allowedClientIpv4, null);
    await assert.rejects(createIngressMtlsGateway({ configPath: f.gatewayPath }), /mtls_gateway_feature_off/);
    for (const allowedClientIpv4 of [null, SYNTHETIC_LAN_IP, "127.0.0.1", "100.64.0.10", "203.0.113.10", "172.20.0.999"]) {
      await json(f.gatewayPath, { ...f.gateway, allowed_client_ipv4: allowedClientIpv4 });
      await assert.rejects(loadIngressMtlsGatewayConfig(f.gatewayPath), /invalid_mtls_gateway_config/);
    }
    for (const address of ["0.0.0.0", "127.0.0.1", "100.64.0.10", "203.0.113.10"] ) {
      await json(f.gatewayPath, {
        ...off,
        listen_host: address,
        public_url: `https://${address}:${f.gatewayPort}`,
      });
      await assert.rejects(loadIngressMtlsGatewayConfig(f.gatewayPath), /invalid_mtls_gateway_config/);
    }
  } finally {
    await f.cleanup();
  }
});

test("per-certificate request rate is bounded before the loopback backend", async (t) => {
  const f = await fixture(t);
  if (!f) return;
  let backend;
  let gateway;
  try {
    await json(f.gatewayPath, { ...f.gateway, max_requests_per_minute: 10 });
    const service = await createIngressMcpService({ configPath: f.configPath });
    backend = await createIngressMcpHttpServer({ service });
    gateway = await createIngressMtlsGateway({
      configPath: f.gatewayPath,
      authService: service,
      allowSyntheticLoopback: true,
    });
    await listen(backend, f.backendPort);
    await listen(gateway, f.gatewayPort);
    const binding = await loadIngressMtlsClientBinding(f.clientBindingPath);
    const fetchImpl = await createIngressMtlsFetch({ binding, syntheticLoopbackAddress: "127.0.0.1" });
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await fetchImpl(new URL("/health", binding.baseUrl))).status, 200);
    }
    const limited = await fetchImpl(new URL("/health", binding.baseUrl));
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: "mtls_rate_limited" });
  } finally {
    if (gateway?.listening) await close(gateway);
    if (backend?.listening) await close(backend);
    await f.cleanup();
  }
});
