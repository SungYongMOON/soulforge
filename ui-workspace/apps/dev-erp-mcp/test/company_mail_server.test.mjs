import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { assertCompanyMailBindHost, COMPANY_MAIL_TUNNEL_AUTH_HEADER, createCompanyMailMcpHttpServer } from "../company_mail_server.mjs";
import { appendCompanyMailRuntimeSettings } from "../company_mail_runtime_config_cli.mjs";
import { assertTunnelId, renderCompanyMailTunnelProfile, writeCompanyMailTunnelProfile } from "../company_mail_tunnel_profile_cli.mjs";
import { buildCompanyMailChildEnvironment, loadCompanyMailRuntimeEnvironment } from "../company_mail_tunnel_runtime.mjs";
import { sanitizeCompanyMailProcessEnvironment } from "../company_mail_stdio_server.mjs";

const TOKEN = "synthetic-company-mail-token-0000000000000001";

function fixtureEvent({ id, mailboxId, mailboxEmail, subject, body, bodyHtml, receivedAt }) {
  return {
    schema_version: "mail_event.v1",
    event_id: id,
    source: "hiworks",
    provider_message_id: `<${id}@example.test>`,
    subject,
    from: [{ name: "Sender", address: "sender@example.test" }],
    to: [{ name: "Mailbox", address: mailboxEmail }],
    cc: [],
    received_at: receivedAt,
    body_text: body || "",
    body_html: bodyHtml || `<p>${body}</p>`,
    attachments: [{ type: "attachment", name: "report.pdf", mime: "application/pdf", size: 42, url: "https://private.invalid/report.pdf", local_path: ["D:", "secret", "report.pdf"].join("\\") }],
    ingested_at: receivedAt,
    ingest_status: "ok",
    raw: { uidl: `uidl-${id}`, headers: { authorization: "secret" } },
    metadata: {
      uidl: `uidl-${id}`,
      mailbox: { id: mailboxId, email: mailboxEmail, display_name: "Mailbox", provider: "hiworks", workspace: "private-path" },
    },
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function connect(base, token = TOKEN) {
  const client = new Client({ name: "company-mail-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, transport };
}

async function connectThroughTunnel(base, token = TOKEN) {
  const client = new Client({ name: "company-mail-tunnel-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { [COMPANY_MAIL_TUNNEL_AUTH_HEADER]: token } },
  });
  await client.connect(transport);
  return { client, transport };
}

test("company mail MCP is read-only and isolates the configured mailbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-"));
  const allowed = fixtureEvent({
    id: "event-allowed",
    mailboxId: "mailbox-owner",
    mailboxEmail: "owner@example.test",
    subject: "Owner visible subject",
    body: "Owner visible body",
    receivedAt: "2026-08-06T11:46:07.000Z",
  });
  const foreign = fixtureEvent({
    id: "event-foreign",
    mailboxId: "mailbox-team-member",
    mailboxEmail: "team@example.test",
    subject: "Foreign secret subject",
    body: "Foreign secret body",
    receivedAt: "2026-08-06T11:47:07.000Z",
  });
  const htmlOnly = fixtureEvent({
    id: "event-html-only",
    mailboxId: "mailbox-owner",
    mailboxEmail: "owner@example.test",
    subject: "HTML only",
    body: "",
    bodyHtml: "<style>hidden</style><p>Readable &amp; safe</p><script>ignore me</script>",
    receivedAt: "2026-08-06T11:45:07.000Z",
  });
  await writeFile(join(root, "events.jsonl"), `${JSON.stringify(allowed)}\n${JSON.stringify(htmlOnly)}\n${JSON.stringify(foreign)}\n`, "utf8");

  let server;
  let connected;
  try {
    server = createCompanyMailMcpHttpServer({ eventRoot: root, mailboxId: "mailbox-owner", token: TOKEN });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    connected = await connect(base);

    const tools = await connected.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "company_mail_read",
      "company_mail_search",
      "company_mail_status",
    ]);
    assert.equal(tools.tools.every((tool) => tool.annotations.readOnlyHint === true), true);

    const status = await connected.client.callTool({ name: "company_mail_status", arguments: {} });
    const statusPayload = JSON.parse(status.content[0].text);
    assert.equal(statusPayload.event_count, 2);
    assert.equal(statusPayload.mailbox.email, "owner@example.test");
    assert.equal(statusPayload.readable_body_present_count, 2);
    assert.equal(statusPayload.rows_scanned, undefined);

    const search = await connected.client.callTool({ name: "company_mail_search", arguments: { query: "visible", limit: 10 } });
    const searchPayload = JSON.parse(search.content[0].text);
    assert.equal(searchPayload.matched_count, 1);
    assert.equal(searchPayload.results[0].id, "event-allowed");
    assert.equal(JSON.stringify(searchPayload).includes("Foreign secret"), false);

    const detail = await connected.client.callTool({ name: "company_mail_read", arguments: { event_id: "event-allowed" } });
    const detailPayload = JSON.parse(detail.content[0].text);
    assert.equal(detailPayload.body_text, "Owner visible body");
    assert.equal(detailPayload.attachments[0].name, "report.pdf");
    assert.equal(detailPayload.attachments[0].url, undefined);
    assert.equal(JSON.stringify(detailPayload).includes(["D:", "secret"].join("\\")), false);
    assert.equal(JSON.stringify(detailPayload).includes("authorization"), false);

    const htmlDetail = await connected.client.callTool({ name: "company_mail_read", arguments: { event_id: "event-html-only" } });
    const htmlPayload = JSON.parse(htmlDetail.content[0].text);
    assert.equal(htmlPayload.body_text, "Readable & safe");
    assert.equal(JSON.stringify(htmlPayload).includes("ignore me"), false);

    const foreignRead = await connected.client.callTool({ name: "company_mail_read", arguments: { event_id: "event-foreign" } });
    assert.equal(foreignRead.isError, true);

    const invalid = await fetch(`${base}/mcp`, { method: "POST", headers: { Authorization: "Bearer invalid-token-value-that-is-long-enough" } });
    assert.equal(invalid.status, 401);
    const discoveryProbe = await fetch(`${base}/mcp`);
    assert.equal(discoveryProbe.status, 405);
  } finally {
    if (connected) {
      await connected.transport.close();
      await connected.client.close();
    }
    if (server) await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("company mail MCP rejects non-loopback listeners and malformed custody rows", async () => {
  assert.throws(() => assertCompanyMailBindHost("0.0.0.0"), /company_mail_bind_loopback_required/);
  assert.doesNotThrow(() => assertCompanyMailBindHost("127.0.0.1"));

  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-invalid-"));
  await writeFile(join(root, "events.jsonl"), "{not-json}\n", "utf8");
  let server;
  let connected;
  try {
    server = createCompanyMailMcpHttpServer({ eventRoot: root, mailboxId: "mailbox-owner", token: TOKEN });
    assert.throws(() => server.listen(0, "0.0.0.0"), /company_mail_bind_loopback_required/);
    const port = await listen(server);
    connected = await connect(`http://127.0.0.1:${port}`);
    const status = await connected.client.callTool({ name: "company_mail_status", arguments: {} });
    assert.equal(status.isError, true);
    assert.equal(status.content[0].text, JSON.stringify({ error: "company_mail_json_invalid" }));
  } finally {
    if (connected) {
      await connected.transport.close();
      await connected.client.close();
    }
    if (server?.listening) await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("company mail MCP accepts the tunnel-only header without trusting a forwarded bearer", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-tunnel-"));
  const event = fixtureEvent({
    id: "event-tunnel",
    mailboxId: "mailbox-owner",
    mailboxEmail: "owner@example.test",
    subject: "Tunnel visible subject",
    body: "Tunnel visible body",
    receivedAt: "2026-08-06T11:46:07.000Z",
  });
  await writeFile(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");

  let server;
  let connected;
  try {
    server = createCompanyMailMcpHttpServer({ eventRoot: root, mailboxId: "mailbox-owner", token: TOKEN });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    connected = await connectThroughTunnel(base);
    const status = await connected.client.callTool({ name: "company_mail_status", arguments: {} });
    assert.equal(JSON.parse(status.content[0].text).event_count, 1);

    const rejected = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: "Bearer forwarded-chatgpt-user-token-that-is-not-local-auth",
        [COMPANY_MAIL_TUNNEL_AUTH_HEADER]: "invalid-local-tunnel-token-that-is-long-enough",
      },
    });
    assert.equal(rejected.status, 401);
  } finally {
    if (connected) {
      await connected.transport.close();
      await connected.client.close();
    }
    if (server) await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("tunnel profile contains only loopback targets and environment secret references", async () => {
  const tunnelId = "tunnel_0123456789abcdef0123456789abcdef";
  assert.equal(assertTunnelId(tunnelId), tunnelId);
  assert.throws(() => assertTunnelId("tunnel_not-real"), /company_mail_tunnel_id_invalid/);

  const profile = renderCompanyMailTunnelProfile({ tunnelId });
  assert.match(profile, /channel: main/);
  assert.match(profile, /url: http:\/\/127\.0\.0\.1:4314\/mcp/);
  assert.match(profile, /api_key: env:CONTROL_PLANE_API_KEY/);
  assert.match(profile, /X-Soulforge-MCP-Token: env:SOULFORGE_COMPANY_MAIL_MCP_TOKEN/g);
  assert.equal(profile.includes(TOKEN), false);
  assert.equal(profile.includes("0.0.0.0"), false);

  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-profile-"));
  const output = join(root, "profile.yaml");
  try {
    await writeCompanyMailTunnelProfile({ tunnelId, output });
    assert.equal(await readFile(output, "utf8"), profile);
    await assert.rejects(
      () => writeCompanyMailTunnelProfile({ tunnelId, output }),
      (error) => error?.code === "EEXIST",
    );
    await assert.rejects(
      () => writeCompanyMailTunnelProfile({ tunnelId, output: "relative-profile.yaml" }),
      /company_mail_tunnel_profile_absolute_output_required/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime configuration adds a local token without exposing or overwriting credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-runtime-"));
  const events = join(root, "events");
  const envFile = join(root, ".env.local");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(events));
  await writeFile(envFile, "CONTROL_PLANE_API_KEY=synthetic-control-plane-key-that-is-long-enough\n", "utf8");
  const syntheticToken = "synthetic-runtime-token-000000000000000000000000";
  try {
    const configured = await appendCompanyMailRuntimeSettings({
      envFile,
      eventRoot: events,
      mailboxId: "mailbox-owner",
      token: syntheticToken,
    });
    assert.equal(configured.secret_values_printed, false);
    assert.equal(JSON.stringify(configured).includes(syntheticToken), false);
    const loaded = await loadCompanyMailRuntimeEnvironment(envFile);
    assert.equal(loaded.values.CONTROL_PLANE_API_KEY.startsWith("synthetic-control"), true);
    assert.equal(loaded.values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN, syntheticToken);
    assert.equal(loaded.values.SOULFORGE_COMPANY_MAIL_MAILBOX_ID, "mailbox-owner");
    await assert.rejects(
      () => appendCompanyMailRuntimeSettings({ envFile, eventRoot: events, mailboxId: "mailbox-owner", token: syntheticToken }),
      /company_mail_runtime_setting_already_exists/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("company mail child environments allowlist only OS runtime values and required mail credentials", () => {
  const parent = {
    PATH: "synthetic-path",
    SYSTEMROOT: "synthetic-system-root",
    UNRELATED_SECRET: "must-not-cross-process-boundary",
    CONTROL_PLANE_API_KEY: "synthetic-control-plane-key-that-is-long-enough",
  };
  const values = {
    CONTROL_PLANE_API_KEY: "synthetic-control-plane-key-that-is-long-enough",
    SOULFORGE_COMPANY_MAIL_MCP_TOKEN: "synthetic-runtime-token-000000000000000000000000",
    SOULFORGE_COMPANY_MAIL_EVENT_ROOT: "synthetic-event-root",
    SOULFORGE_COMPANY_MAIL_MAILBOX_ID: "mailbox-owner",
  };
  const serverEnvironment = buildCompanyMailChildEnvironment(values, "server", parent);
  assert.equal(serverEnvironment.UNRELATED_SECRET, undefined);
  assert.equal(serverEnvironment.CONTROL_PLANE_API_KEY, undefined);
  assert.equal(serverEnvironment.SOULFORGE_COMPANY_MAIL_MCP_TOKEN, values.SOULFORGE_COMPANY_MAIL_MCP_TOKEN);

  const tunnelEnvironment = buildCompanyMailChildEnvironment(values, "tunnel", parent);
  assert.equal(tunnelEnvironment.UNRELATED_SECRET, undefined);
  assert.equal(tunnelEnvironment.CONTROL_PLANE_API_KEY, values.CONTROL_PLANE_API_KEY);
  assert.equal(tunnelEnvironment.SOULFORGE_COMPANY_MAIL_EVENT_ROOT, undefined);

  const sanitized = sanitizeCompanyMailProcessEnvironment({ ...parent, TEMP: "synthetic-temp" });
  assert.deepEqual(sanitized, {
    PATH: "synthetic-path",
    SYSTEMROOT: "synthetic-system-root",
    TEMP: "synthetic-temp",
  });
});

test("stdio company mail MCP exposes only the three read-only tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "soulforge-company-mail-stdio-"));
  const event = fixtureEvent({
    id: "event-stdio",
    mailboxId: "mailbox-owner",
    mailboxEmail: "owner@example.test",
    subject: "Stdio visible subject",
    body: "Stdio visible body",
    receivedAt: "2026-08-06T11:46:07.000Z",
  });
  await writeFile(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
  const client = new Client({ name: "company-mail-stdio-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "company_mail_stdio_server.mjs"), "--event-root", root, "--mailbox-id", "mailbox-owner"],
    env: {
      ...process.env,
      CONTROL_PLANE_API_KEY: "synthetic-key-that-must-not-be-needed-by-mail-tools",
    },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "company_mail_read",
      "company_mail_search",
      "company_mail_status",
    ]);
    assert.equal(tools.tools.every((tool) => tool.annotations.readOnlyHint === true), true);
    const status = await client.callTool({ name: "company_mail_status", arguments: {} });
    assert.equal(JSON.parse(status.content[0].text).event_count, 1);
  } finally {
    await transport.close();
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});
