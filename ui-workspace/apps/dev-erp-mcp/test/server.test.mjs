import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { assertSafeBindHost, createErpMcpHttpServer } from "../server.mjs";
import { ErpClient } from "../src/erp_client.mjs";

const TICKET = `sfup_v1_${"a".repeat(43)}`;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function fakeErp(state) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === `/api/mcp/uploads/${TICKET}` && req.method === "PUT") {
      state.upload = await readBody(req);
      return send(res, 201, {
        ok: true,
        artifact: {
          artifact_id: "mcp_art_1",
          item_id: "TASK-1",
          name: "done.pdf",
          size: state.upload.length,
          sha256: "b".repeat(64),
          storage_ref: "erp-mcp-artifact:mcp_art_1",
        },
      });
    }
    if (req.headers.authorization !== "Bearer good-token") return send(res, 401, { error: "mcp_auth_invalid" });
    if (url.pathname === "/api/mcp/whoami") return send(res, 200, { username: "alice", capabilities: ["agenda:read"] });
    if (url.pathname === "/api/mcp/agenda") return send(res, 200, { date: url.searchParams.get("date"), tasks: [{ id: "TASK-1" }] });
    if (url.pathname === "/api/mcp/uploads/prepare" && req.method === "POST") {
      state.prepareBody = JSON.parse((await readBody(req)).toString("utf8"));
      return send(res, 201, {
        ok: true,
        already_uploaded: false,
        artifact_id: "mcp_art_1",
        expires_at: "2026-07-13T03:10:00.000Z",
        upload_path: `/api/mcp/uploads/${TICKET}`,
      });
    }
    if (url.pathname === "/api/mcp/work-sessions" && req.method === "POST") {
      state.workSession = JSON.parse((await readBody(req)).toString("utf8"));
      return send(res, 201, { ok: true, replayed: false, session: { work_session_id: "mcp_ws_1", item_id: "TASK-1" } });
    }
    return send(res, 404, { error: "not_found" });
  });
}

async function mcpClient(url, token = "good-token") {
  const client = new Client({ name: "erp-mcp-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

test("Streamable HTTP MCP exposes bounded ERP tools with per-user bearer auth", async () => {
  const state = {};
  const erp = fakeErp(state);
  const erpPort = await listen(erp);
  let sidecar;
  let connected;
  try {
    sidecar = createErpMcpHttpServer({
      erpBaseUrl: `http://127.0.0.1:${erpPort}`,
      publicUrl: "http://127.0.0.1:4311",
    });
    const sidecarPort = await listen(sidecar);
    const base = `http://127.0.0.1:${sidecarPort}`;
    connected = await mcpClient(base);

    const tools = await connected.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "erp_get_mail_detail",
      "erp_get_my_agenda",
      "erp_get_task_context",
      "erp_list_mail",
      "erp_list_task_artifacts",
      "erp_prepare_artifact_upload",
      "erp_publish_work_session",
      "erp_whoami",
    ]);
    const byName = Object.fromEntries(tools.tools.map((tool) => [tool.name, tool]));
    assert.equal(byName.erp_publish_work_session.annotations.idempotentHint, true);
    assert.equal(byName.erp_prepare_artifact_upload.annotations.idempotentHint, false);
    const agenda = await connected.client.callTool({ name: "erp_get_my_agenda", arguments: { date: "tomorrow" } });
    const agendaPayload = JSON.parse(agenda.content[0].text);
    assert.equal(agendaPayload.date, "tomorrow");
    assert.equal(agendaPayload.tasks[0].id, "TASK-1");

    const work = await connected.client.callTool({
      name: "erp_publish_work_session",
      arguments: {
        item_id: "TASK-1",
        idempotency_key: "test-session-0001",
        summary: "Finished the draft",
        outputs: [],
        next_actions: [],
        stop_conditions: [],
        artifact_ids: [],
      },
    });
    assert.equal(JSON.parse(work.content[0].text).session.work_session_id, "mcp_ws_1");
    assert.equal(state.workSession.summary, "Finished the draft");

    const unauthenticated = await fetch(`${base}/mcp`, { method: "POST" });
    assert.equal(unauthenticated.status, 401);
    const invalid = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: "Bearer bad-token" } });
    assert.equal(invalid.status, 401);
  } finally {
    if (connected) {
      await connected.transport.close();
      await connected.client.close();
    }
    if (sidecar) await close(sidecar);
    await close(erp);
  }
});

test("artifact bytes use one-time raw upload URL outside MCP JSON", async () => {
  const state = {};
  const erp = fakeErp(state);
  const erpPort = await listen(erp);
  let sidecar;
  let connected;
  try {
    sidecar = createErpMcpHttpServer({
      erpBaseUrl: `http://127.0.0.1:${erpPort}`,
      publicUrl: "http://127.0.0.1:4311",
    });
    const sidecarPort = await listen(sidecar);
    const base = `http://127.0.0.1:${sidecarPort}`;
    connected = await mcpClient(base);
    const prepared = await connected.client.callTool({
      name: "erp_prepare_artifact_upload",
      arguments: {
        item_id: "TASK-1",
        filename: "done.pdf",
        size: 5,
        sha256: "b".repeat(64),
        kind: "report",
      },
    });
    const payload = JSON.parse(prepared.content[0].text);
    assert.equal(payload.upload_path, undefined);
    assert.equal(payload.upload_url, `http://127.0.0.1:4311/upload/${TICKET}`);
    assert.equal(JSON.stringify(payload).includes("base64"), false);

    // Replace the documented public origin with this ephemeral test listener.
    const uploadUrl = `${base}${new URL(payload.upload_url).pathname}`;
    const response = await fetch(uploadUrl, { method: "PUT", body: Buffer.from("hello") });
    assert.equal(response.status, 201);
    assert.deepEqual(state.upload, Buffer.from("hello"));

    const malformed = await fetch(`${base}/upload/%`, { method: "PUT", body: Buffer.from("hello") });
    assert.equal(malformed.status, 400);
    const healthAfterMalformedPath = await fetch(`${base}/health`);
    assert.equal(healthAfterMalformedPath.status, 200);
  } finally {
    if (connected) {
      await connected.transport.close();
      await connected.client.close();
    }
    if (sidecar) await close(sidecar);
    await close(erp);
  }
});

test("non-loopback plaintext public MCP URL is rejected by default", () => {
  assert.throws(
    () => createErpMcpHttpServer({ erpBaseUrl: "http://127.0.0.1:4300", publicUrl: "http://172.16.10.196:4311" }),
    /public_https_required/,
  );
  assert.throws(() => assertSafeBindHost("0.0.0.0"), /bind_loopback_required/);
  assert.doesNotThrow(() => assertSafeBindHost("127.0.0.1"));
  assert.doesNotThrow(() => assertSafeBindHost("0.0.0.0", { allowInsecureHttp: true }));
  assert.throws(() => new ErpClient({ baseUrl: "http://172.16.10.196:4300" }), /erp_https_required/);
  assert.doesNotThrow(() => new ErpClient({ baseUrl: "https://erp.example.test" }));
  assert.doesNotThrow(() => new ErpClient({
    baseUrl: "http://172.16.10.196:4300",
    allowInsecureHttp: true,
  }));

  const server = createErpMcpHttpServer({ erpBaseUrl: "http://127.0.0.1:4300" });
  assert.throws(() => server.listen(0, "0.0.0.0"), /bind_loopback_required/);
});

test("ERP upstream client rejects origin changes and redirect following", async () => {
  const optionsSeen = [];
  const client = new ErpClient({
    baseUrl: "http://127.0.0.1:4300",
    fetchImpl: async (_url, options) => {
      optionsSeen.push(options);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.throws(() => client.url("https://example.test/escape"), /invalid_erp_path/);
  await client.request("/api/mcp/whoami", { token: "synthetic-token" });
  await client.upload("/api/mcp/uploads/synthetic-ticket", Buffer.from("x"));
  assert.deepEqual(optionsSeen.map((options) => options.redirect), ["error", "error"]);
});
