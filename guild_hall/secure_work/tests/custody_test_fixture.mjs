import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { runCustody } from "../custody_bridge.mjs";
import { initializeIngressAuthRegistry, issueIngressCredential } from
  "../../../ui-workspace/apps/dev-erp-mcp/src/ingress_access_admin.mjs";
import { createIngressMcpService, INGRESS_MCP_CONFIG_SCHEMA } from
  "../../../ui-workspace/apps/dev-erp-mcp/src/ingress_mcp_service.mjs";
import { createIngressMcpHttpServer } from "../../../ui-workspace/apps/dev-erp-mcp/ingress_server.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, body) => writeFile(path, JSON.stringify(body));

export async function fixture(t) {
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
  const hooks = { after: null };
  const observed = { ...service };
  for (const name of ["prepareUpload", "appendChunk", "finalizeUpload", "submissionStatus"]) {
    observed[name] = async (...args) => {
      const result = await service[name](...args);
      if (hooks.after) await hooks.after(name);
      return result;
    };
  }
  const server = await createIngressMcpHttpServer({ service: observed });
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
  return { root, outbox, state, registry, token: issued.token, request, body, server, hooks };
}
