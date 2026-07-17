import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  initializeIngressAuthRegistry,
  issueIngressCredential,
  revokeIngressCredential,
} from "../src/ingress_access_admin.mjs";
import { IngressClient } from "../src/ingress_client.mjs";
import { createIngressMcpService, INGRESS_MCP_CONFIG_SCHEMA } from "../src/ingress_mcp_service.mjs";
import { createIngressMcpHttpServer } from "../ingress_server.mjs";

const WORKER = resolve(import.meta.dirname, "fixtures", "virtual_team_client.mjs");
const TOOLS = [
  "ingress_get_submission_status",
  "ingress_get_upload_status",
  "ingress_prepare_file_upload",
  "ingress_publish_run_receipt",
  "ingress_publish_work_event",
  "ingress_whoami",
];

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listen(server, port = 0) {
  return new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => accept(server.address().port));
  });
}

function close(server) {
  return new Promise((accept) => server.close(accept));
}

function runWorker(inputPath, token) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [WORKER, inputPath], {
      cwd: resolve(import.meta.dirname, ".."),
      env: { ...process.env, SOULFORGE_INGRESS_TOKEN: token },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(`virtual_worker_failed:${stderr.trim()}`));
      try { accept(JSON.parse(stdout.trim())); }
      catch { reject(new Error(`virtual_worker_output_invalid:${stdout.trim()}`)); }
    });
  });
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-virtual-team-"));
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
  for (const name of ["tickets", "uploads", "indexes", "event_sources", "submissions", "quota_locks"]) {
    await mkdir(resolve(stateRoot, name), { recursive: true });
  }
  await json(outboxBindingPath, {
    schema_version: "soulforge.ingress.local_outbox_binding.v1",
    node_id: "HPP_VIRTUAL_TEAM",
    outbox_root: outboxRoot,
    lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      enabled: true,
      queue_root: resolve(outboxRoot, lane),
      source_owner_ref: "virtual_team_e2e",
    }])),
  });
  await initializeIngressAuthRegistry({ registryPath });
  const allCapabilities = [
    "upload:team_files", "publish:structured_pc_work", "publish:run_logs", "receipt:read",
  ];
  const people = [
    { key: "alice_pc1", account: "alice", device: "alice_work_pc", agent: "codex_primary", project: "PRJ_A", denied: "PRJ_B" },
    { key: "alice_pc2", account: "alice", device: "alice_mobile_pc", agent: "codex_secondary", project: "PRJ_A", denied: "PRJ_C" },
    { key: "bob_pc1", account: "bob", device: "bob_work_pc", agent: "codex_primary", project: "PRJ_B", denied: "PRJ_A" },
  ];
  for (const person of people) {
    const issued = await issueIngressCredential({
      registryPath,
      credentialId: `cred_${person.key}`,
      accountId: person.account,
      deviceId: person.device,
      agentId: person.agent,
      projectScopes: [person.project],
      capabilities: allCapabilities,
      expiresAt: Date.parse("2027-07-01T00:00:00.000Z"),
    });
    person.token = issued.token;
    person.filePath = resolve(root, `${person.key}.pdf`);
    await writeFile(person.filePath, Buffer.alloc(70_000 + people.indexOf(person), people.indexOf(person) + 1));
  }
  await json(configPath, {
    schema_version: INGRESS_MCP_CONFIG_SCHEMA,
    enabled: true,
    node_id: "HPP_VIRTUAL_TEAM",
    listen_host: "127.0.0.1",
    listen_port: 4312,
    public_url: "http://127.0.0.1:4312",
    local_outbox_binding_path: outboxBindingPath,
    auth_registry_path: registryPath,
    state_root: stateRoot,
    submission_root: submissionRoot,
    max_file_bytes: 1024 * 1024,
    chunk_bytes: 64 * 1024,
    ticket_ttl_seconds: 3600,
    max_open_uploads_per_credential: 8,
    max_pending_upload_bytes_per_credential: 8 * 1024 * 1024,
    max_retained_upload_bytes_per_credential: 64 * 1024 * 1024,
  });
  return { root, outboxRoot, stateRoot, submissionRoot, registryPath, configPath, people, lanes };
}

async function workerInputs(f, baseUrl) {
  const paths = [];
  for (const person of f.people) {
    const inputPath = resolve(f.root, `${person.key}.input.json`);
    await json(inputPath, {
      base_url: baseUrl,
      file_path: person.filePath,
      filename: `${person.key}.pdf`,
      media_type: "application/pdf",
      project_hint: person.project,
      denied_project: person.denied,
      task_ref: `TASK_${person.key}`,
      file_occurrence: `file_${person.key}`,
      file_idempotency: `upload:${person.key}:0001`,
      work_occurrence: `work_${person.key}`,
      work_idempotency: `work:${person.key}:0001`,
      run_occurrence: `run_${person.key}`,
      run_idempotency: `run:${person.key}:0001`,
    });
    paths.push(inputPath);
  }
  return paths;
}

async function installSyntheticAcks(f) {
  for (const filename of await readdir(f.submissionRoot)) {
    const submission = JSON.parse(await readFile(resolve(f.submissionRoot, filename), "utf8"));
    await json(resolve(f.outboxRoot, "state", "acks", submission.lane, `${submission.outbox_occurrence_id}.json`), {
      source_key: submission.outbox_occurrence_id,
      sha256: submission.sha256,
      size: submission.size,
    });
  }
}

test("three isolated virtual work PCs exercise every MCP function with account/project isolation and restart recovery", async () => {
  const f = await fixture();
  let server;
  try {
    let service = await createIngressMcpService({ configPath: f.configPath });
    server = await createIngressMcpHttpServer({ service });
    const port = await listen(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    service.config.publicUrl = new URL(baseUrl);
    const inputs = await workerInputs(f, baseUrl);
    const results = await Promise.all(f.people.map((person, index) => runWorker(inputs[index], person.token)));
    for (const [index, result] of results.entries()) {
      assert.equal(result.identity.account_id, f.people[index].account);
      assert.equal(result.identity.device_id, f.people[index].device);
      assert.equal(result.identity.agent_id, f.people[index].agent);
      assert.deepEqual(result.tools, TOOLS);
      assert.equal(result.initial_resume_offset, 0);
      assert.deepEqual(result.statuses, ["pending_server_ack", "pending_server_ack", "pending_server_ack"]);
      assert.equal(result.denied_project_error, "project_scope_forbidden");
      assert.equal(result.token_exposed, false);
    }
    for (const lane of f.lanes) {
      assert.equal((await readdir(resolve(f.outboxRoot, lane))).filter((name) => name.endsWith(".payload")).length, 3);
    }

    const alice = new IngressClient({ baseUrl, token: f.people[0].token });
    const aliceSecondDevice = new IngressClient({ baseUrl, token: f.people[1].token });
    const bob = new IngressClient({ baseUrl, token: f.people[2].token });
    try {
      assert.equal((await aliceSecondDevice.submissionStatus(results[0].submissions[0])).submission_id, results[0].submissions[0]);
      await assert.rejects(bob.submissionStatus(results[0].submissions[0]), /submission_not_found/);
    } finally {
      await Promise.all([alice.close(), aliceSecondDevice.close(), bob.close()]);
    }

    await installSyntheticAcks(f);
    await close(server);
    server = null;
    service = await createIngressMcpService({ configPath: f.configPath });
    service.config.publicUrl = new URL(baseUrl);
    server = await createIngressMcpHttpServer({ service });
    await listen(server, port);
    const replay = await runWorker(inputs[0], f.people[0].token);
    assert.equal(replay.prepare_replayed, true);
    assert.deepEqual(replay.statuses, ["verified_server_ack", "verified_server_ack", "verified_server_ack"]);

    await revokeIngressCredential({ registryPath: f.registryPath, credentialId: "cred_bob_pc1" });
    const revoked = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${f.people[2].token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(revoked.status, 401);

    for (const person of f.people) {
      assert.equal((await readFile(person.filePath)).length >= 70_000, true);
    }
  } finally {
    if (server) await close(server);
    await rm(f.root, { recursive: true, force: true });
  }
});
