import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { IngressClient } from "../src/ingress_client.mjs";
import {
  createIngressMcpService,
  generateIngressToken,
  hashIngressToken,
  INGRESS_MCP_AUTH_SCHEMA,
  INGRESS_MCP_CONFIG_SCHEMA,
} from "../src/ingress_mcp_service.mjs";
import { createIngressMcpHttpServer } from "../ingress_server.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listen(server) {
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => accept(server.address().port));
  });
}

function close(server) {
  return new Promise((accept) => server.close(accept));
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-server-"));
  const outboxRoot = resolve(root, "outbox");
  const stateRoot = resolve(root, "mcp-state");
  const submissionRoot = resolve(stateRoot, "submissions");
  const registryPath = resolve(root, "auth.json");
  const outboxBindingPath = resolve(root, "outbox.json");
  const configPath = resolve(root, "config.json");
  const lanes = ["team_files", "structured_pc_work", "run_logs"];
  await mkdir(outboxRoot);
  for (const lane of lanes) {
    await mkdir(resolve(outboxRoot, lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "receipts", lane), { recursive: true });
    await mkdir(resolve(outboxRoot, "state", "acks", lane), { recursive: true });
  }
  for (const name of ["tickets", "uploads", "indexes", "event_sources", "submissions"]) {
    await mkdir(resolve(stateRoot, name), { recursive: true });
  }
  await json(outboxBindingPath, {
    schema_version: "soulforge.ingress.local_outbox_binding.v1",
    node_id: "HPP_TEST",
    outbox_root: outboxRoot,
    lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      enabled: true,
      queue_root: resolve(outboxRoot, lane),
      source_owner_ref: "ingress_mcp_test",
    }])),
  });
  const token = generateIngressToken();
  const foreignToken = generateIngressToken();
  const credential = (credentialId, accountId, value) => ({
    credential_id: credentialId,
    account_id: accountId,
    device_id: `${credentialId}_device`,
    agent_id: `${credentialId}_agent`,
    token_hash: hashIngressToken(value),
    project_scopes: ["PRJ_A"],
    capabilities: ["publish:run_logs", "publish:structured_pc_work", "receipt:read", "upload:team_files"],
    created_at: "2026-07-01T00:00:00.000Z",
    expires_at: "2027-07-01T00:00:00.000Z",
    revoked_at: null,
  });
  await json(registryPath, {
    schema_version: INGRESS_MCP_AUTH_SCHEMA,
    revision: "rev_1",
    tokens: [credential("cred_main", "person_main", token), credential("cred_foreign", "person_foreign", foreignToken)],
  });
  await json(configPath, {
    schema_version: INGRESS_MCP_CONFIG_SCHEMA,
    enabled: true,
    node_id: "HPP_TEST",
    listen_host: "127.0.0.1",
    listen_port: 4312,
    public_url: "http://127.0.0.1:4312",
    local_outbox_binding_path: outboxBindingPath,
    auth_registry_path: registryPath,
    state_root: stateRoot,
    submission_root: submissionRoot,
    max_file_bytes: 1024 * 1024,
    chunk_bytes: 64 * 1024,
    ticket_ttl_seconds: 600,
  });
  return { root, outboxRoot, stateRoot, configPath, token, foreignToken };
}

function eventInput() {
  return {
    project_hint: "PRJ_A",
    occurrence_id: "work_http_01",
    idempotency_key: "work:http:0001",
    event_kind: "work_checkpoint",
    occurred_at: "2026-07-17T10:00:00.000Z",
    task_ref: "TASK_01",
    summary: "Loopback MCP integration event",
    outputs: [],
    verification: "integration test",
    next_actions: [],
    stop_conditions: ["no LAN binding"],
  };
}

test("loopback MCP and resumable HTTP client place bounded evidence in the existing local outbox", async () => {
  const f = await fixture();
  let server;
  let client;
  try {
    const service = await createIngressMcpService({ configPath: f.configPath });
    server = await createIngressMcpHttpServer({ service });
    const port = await listen(server);
    service.config.publicUrl = new URL(`http://127.0.0.1:${port}`);
    const baseUrl = `http://127.0.0.1:${port}`;
    client = new IngressClient({ baseUrl, token: f.token });
    assert.equal((await client.whoami()).account_id, "person_main");
    const tools = await client.client.listTools();
    assert.deepEqual(tools.tools.map((entry) => entry.name).sort(), [
      "ingress_get_submission_status",
      "ingress_get_upload_status",
      "ingress_prepare_file_upload",
      "ingress_publish_run_receipt",
      "ingress_publish_work_event",
      "ingress_whoami",
    ]);

    const bytes = Buffer.alloc(150_000, 0x5a);
    const sourcePath = resolve(f.root, "pilot.pdf");
    await writeFile(sourcePath, bytes);
    const uploaded = await client.uploadFile({
      path: sourcePath,
      projectHint: "PRJ_A",
      occurrenceId: "file_http_01",
      idempotencyKey: "upload:http:0001",
      mediaType: "application/pdf",
    });
    assert.equal(uploaded.status, "pending_server_ack");
    assert.deepEqual(await readFile(sourcePath), bytes);
    assert.deepEqual(await readFile(resolve(f.outboxRoot, "team_files", "mcp_cred_main_file_http_01.payload")), bytes);

    const work = await client.publishWorkEvent(eventInput());
    assert.equal(work.lane, "structured_pc_work");
    assert.equal(work.status, "pending_server_ack");
    const run = await client.publishRunReceipt({
      ...eventInput(),
      occurrence_id: "run_http_01",
      idempotency_key: "run:http:0001",
      event_kind: "validation_receipt",
    });
    assert.equal(run.lane, "run_logs");

    const noBearer = await fetch(`${baseUrl}/ingress/uploads/${uploaded.ticket_id || "sfigup_" + "a".repeat(32)}`);
    assert.equal(noBearer.status, 401);
    const health = await fetch(`${baseUrl}/health`);
    assert.deepEqual(await health.json(), {
      ok: true,
      service: "soulforge-ingress-mcp",
      node_id: "HPP_TEST",
      exposure: "loopback_only",
      official_history_writer: false,
    });
  } finally {
    await client?.close();
    if (server) await close(server);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("feature-off configs and non-loopback listen attempts cannot activate the ingress server", async () => {
  const f = await fixture();
  let server;
  try {
    const config = JSON.parse(await readFile(f.configPath, "utf8"));
    config.enabled = false;
    await json(f.configPath, config);
    await assert.rejects(createIngressMcpHttpServer({ configPath: f.configPath }), /ingress_mcp_feature_off/);
    config.enabled = true;
    await json(f.configPath, config);
    const service = await createIngressMcpService({ configPath: f.configPath });
    server = await createIngressMcpHttpServer({ service });
    assert.throws(() => server.listen(0, "0.0.0.0"), /ingress_mcp_loopback_bind_required/);
  } finally {
    if (server?.listening) await close(server);
    await rm(f.root, { recursive: true, force: true });
  }
});
