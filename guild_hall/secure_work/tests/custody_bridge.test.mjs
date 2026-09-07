import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import test from "node:test";
import { runCustody } from "../custody_bridge.mjs";
import { initializeIngressAuthRegistry, issueIngressCredential } from
  "../../../ui-workspace/apps/dev-erp-mcp/src/ingress_access_admin.mjs";
import { createIngressMcpService, INGRESS_MCP_CONFIG_SCHEMA } from
  "../../../ui-workspace/apps/dev-erp-mcp/src/ingress_mcp_service.mjs";
import { createIngressMcpHttpServer } from "../../../ui-workspace/apps/dev-erp-mcp/ingress_server.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, body) => writeFile(path, JSON.stringify(body));

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "secure-work-ingress-test-"));
  const outbox = resolve(root, "outbox");
  const state = resolve(root, "state");
  const registry = resolve(root, "synthetic-auth.json");
  const lanes = ["team_files", "structured_pc_work", "run_logs"];
  for (const lane of lanes) {
    for (const dir of [resolve(outbox, lane), resolve(outbox, "state", "receipts", lane), resolve(outbox, "state", "acks", lane)]) {
      await mkdir(dir, { recursive: true });
    }
  }
  for (const name of ["tickets", "uploads", "indexes", "event_sources", "submissions", "quota_locks"]) {
    await mkdir(resolve(state, name), { recursive: true });
  }
  const bindingPath = resolve(root, "outbox-binding.json");
  await json(bindingPath, { schema_version: "soulforge.ingress.local_outbox_binding.v1", node_id: "SYNTHETIC",
    outbox_root: outbox, lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      enabled: true, queue_root: resolve(outbox, lane), source_owner_ref: "synthetic_m10",
    }])) });
  await initializeIngressAuthRegistry({ registryPath: registry });
  const principal = { account_id: "synthetic.account", device_id: "synthetic.device", agent_id: "synthetic.agent" };
  const issued = await issueIngressCredential({ registryPath: registry, credentialId: "synthetic.credential",
    accountId: principal.account_id, deviceId: principal.device_id, agentId: principal.agent_id,
    projectScopes: ["synthetic.project", "other.project"], capabilities: ["upload:team_files", "receipt:read"],
    expiresAt: Date.now() + 3600000 });
  const configPath = resolve(root, "ingress.json");
  await json(configPath, { schema_version: INGRESS_MCP_CONFIG_SCHEMA, enabled: true, node_id: "SYNTHETIC",
    listen_host: "127.0.0.1", listen_port: 4312, public_url: "http://127.0.0.1:4312",
    local_outbox_binding_path: bindingPath, auth_registry_path: registry,
    state_root: state, submission_root: resolve(state, "submissions"), max_file_bytes: 1048576,
    chunk_bytes: 65536, ticket_ttl_seconds: 3600, max_open_uploads_per_credential: 8,
    max_pending_upload_bytes_per_credential: 8388608, max_retained_upload_bytes_per_credential: 67108864 });
  const service = await createIngressMcpService({ configPath });
  const server = await createIngressMcpHttpServer({ service });
  await new Promise((yes, no) => { server.once("error", no); server.listen(0, "127.0.0.1", yes); });
  const url = `http://127.0.0.1:${server.address().port}`;
  service.config.publicUrl = new URL(url);
  t.after(async () => {
    await new Promise((yes) => server.close(yes));
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("secure-work-ingress-test-"));
    await rm(root, { recursive: true, force: true });
  });
  const body = Buffer.alloc(70001, 83);
  const file = resolve(root, "candidate.md");
  await writeFile(file, body);
  const request = { action: "upload", binding: { project_hint: "synthetic.project", occurrence_id: "synthetic.occurrence",
    idempotency_key: "synthetic:idempotency", input_revision: "r1", sha256: hash(body), size: body.length,
    route_sha256: hash(url) }, candidate_path: file, principal, authorization_expires_at: Date.now() / 1000 + 120,
    submission_id: null, ingress_url: url };
  return { root, outbox, state, registry, token: issued.token, request, body };
}

test("existing IngressClient uploads exact candidate once, recovers lost reply and reads only the bound ACK", async (t) => {
  const f = await fixture(t);
  const options = { token: f.token, authorize: () => true };
  const first = await runCustody(f.request, options);
  assert.equal(first.status, "pending_server_ack");
  // Replay after an imagined caller crash: server idempotency retains one submission.
  const replay = await runCustody(f.request, options);
  assert.equal(replay.submission_id, first.submission_id);
  const files = await readdir(resolve(f.state, "submissions"));
  assert.equal(files.length, 1);
  const record = JSON.parse(await readFile(resolve(f.state, "submissions", files[0])));
  assert.equal(record.sha256, f.request.binding.sha256);
  assert.equal(record.official_completion, false);
  const payloads = (await readdir(resolve(f.outbox, "team_files"))).filter((name) => name.endsWith(".payload"));
  assert.equal(payloads.length, 1);
  assert.deepEqual(await readFile(resolve(f.outbox, "team_files", payloads[0])), f.body);
  for (const delta of [{ input_revision: "r2" }, { project_hint: "other.project" }]) {
    await assert.rejects(runCustody({ ...f.request, binding: { ...f.request.binding, ...delta } }, options));
  }
  await json(resolve(f.outbox, "state", "acks", "team_files", `${record.outbox_occurrence_id}.json`), {
    source_key: record.outbox_occurrence_id, sha256: record.sha256, size: record.size,
  });
  const status = { ...f.request, action: "status", submission_id: first.submission_id };
  const verified = await runCustody(status, options);
  assert.equal(verified.status, "verified_server_ack");
  assert.equal(verified.official_history_written, false);
  assert.equal(verified.source_deleted, false);
  assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
  await assert.rejects(runCustody({ ...status, principal: { ...status.principal, agent_id: "other.agent" } }, options));
});

test("scope or capability revoked after prepare blocks bytes at sending boundary", async (t) => {
  for (const field of ["project_scopes", "capabilities"]) {
    await t.test(field, async (t) => {
      const f = await fixture(t);
      let writes = 0;
      const guardedFetch = async (url, options) => {
        if (options.method === "PUT") writes++;
        const response = await fetch(url, options);
        if (String(options.body).includes("ingress_prepare_file_upload")) {
          const registry = JSON.parse(await readFile(f.registry));
          registry.tokens[0][field] = field === "capabilities" ? ["receipt:read"] : ["other.project"];
          await json(f.registry, registry);
        }
        return response;
      };
      await assert.rejects(runCustody(f.request, { token: f.token, fetchImpl: guardedFetch, authorize: () => true }));
      assert.equal(writes, 0);
      assert.equal((await readdir(resolve(f.state, "submissions"))).length, 0);
    });
  }
});

test("untrusted oversize reply and changed candidate are denied without candidate upload", async (t) => {
  const f = await fixture(t);
  await assert.rejects(runCustody(f.request, { token: f.token, authorize: () => true,
    fetchImpl: async () => new Response("S".repeat(32769), { status: 200, headers: { "content-type": "application/json" } }) }));
  await writeFile(f.request.candidate_path, Buffer.alloc(f.body.length, 84));
  await assert.rejects(runCustody(f.request, { token: f.token, authorize: () => true }));
  assert.equal((await readdir(resolve(f.state, "submissions"))).length, 0);
});

test("request proof fields alone never authorize the bridge", async () => {
  let calls = 0;
  await assert.rejects(runCustody({ authorization_expires_at: Date.now() / 1000 + 120,
    principal: { account_id: "synthetic" } }, { token: "synthetic", fetchImpl: () => { calls++; } }));
  assert.equal(calls, 0);
});

test("authority is current after the remote status response for upload and status-only returns", async t => {
  for (const action of ["upload", "status"]) {
    for (const mode of ["revoked", "principal_changed", "expired"]) {
      await t.test(`${action}/${mode}`, async t => {
        let currentTime = Date.now();
        t.mock.method(Date, "now", () => currentTime);
        const f = await fixture(t);
        let allowed = true;
        let remoteStatusResponses = 0;
        const installAck = async () => {
          const [name] = await readdir(resolve(f.state, "submissions"));
          const record = JSON.parse(await readFile(resolve(f.state, "submissions", name)));
          await json(resolve(f.outbox, "state", "acks", "team_files", `${record.outbox_occurrence_id}.json`), {
            source_key: record.outbox_occurrence_id, sha256: record.sha256, size: record.size,
          });
        };
        const request = { ...f.request, action };
        if (action === "status") {
          const first = await runCustody(f.request, { token: f.token, authorize: () => true });
          request.submission_id = first.submission_id;
          await installAck();
        }
        request.authorization_expires_at = currentTime / 1000 + 1;
        const afterResponseFetch = async (url, options) => {
          const response = await fetch(url, options);
          if (new URL(url).pathname.endsWith("/finalize")) await installAck();
          if (String(options.body).includes("ingress_get_submission_status")) {
            const result = await response.clone().json();
            assert.equal(result.result.structuredContent.status, "verified_server_ack");
            remoteStatusResponses++;
            if (mode === "revoked") allowed = false;
            else if (mode === "expired") currentTime += 2000;
            else {
              const registry = JSON.parse(await readFile(f.registry));
              registry.tokens[0].agent_id = "changed.agent";
              await json(f.registry, registry);
            }
          }
          return response;
        };
        await assert.rejects(runCustody(request, { token: f.token, authorize: () => allowed,
          fetchImpl: afterResponseFetch }));
        assert.equal(remoteStatusResponses, 1);
        // The request was sent: denial of a local return does not undo custody.
        assert.equal((await readdir(resolve(f.state, "submissions"))).length, 1);
        const payloads = (await readdir(resolve(f.outbox, "team_files"))).filter(n => n.endsWith(".payload"));
        assert.equal(payloads.length, 1);
        assert.deepEqual(await readFile(resolve(f.outbox, "team_files", payloads[0])), f.body);
      });
    }
  }
});
