import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  initializeIngressAuthRegistry,
  issueIngressCredential,
  listIngressCredentials,
  revokeIngressCredential,
} from "../src/ingress_access_admin.mjs";
import {
  createIngressMcpService,
  INGRESS_MCP_CONFIG_SCHEMA,
} from "../src/ingress_mcp_service.mjs";

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("credential lifecycle separates person, device, and AI and never lists token material", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-admin-"));
  const registryPath = resolve(root, "auth.json");
  try {
    const initialized = await initializeIngressAuthRegistry({ registryPath, now: 1_752_750_000_000 });
    assert.equal(initialized.credential_count, 0);
    const issued = await issueIngressCredential({
      registryPath,
      credentialId: "cred_alice_pc1_codex",
      accountId: "alice",
      deviceId: "alice_pc1",
      agentId: "codex_primary",
      projectScopes: ["PRJ_A", "PRJ_B"],
      capabilities: ["upload:team_files", "publish:structured_pc_work", "receipt:read"],
      expiresAt: Date.parse("2027-07-01T00:00:00.000Z"),
      now: Date.parse("2026-07-17T00:00:00.000Z"),
    });
    assert.match(issued.token, /^sfig_v1_[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.credential.account_id, "alice");
    assert.equal(issued.credential.device_id, "alice_pc1");
    assert.equal(issued.credential.agent_id, "codex_primary");
    assert.equal(Object.hasOwn(issued.credential, "token_hash"), false);

    const listed = await listIngressCredentials({ registryPath });
    assert.equal(listed.credentials.length, 1);
    assert.equal(listed.token_hashes_exposed, false);
    assert.equal(JSON.stringify(listed).includes(issued.token), false);
    assert.equal(listed.credentials.some((entry) => Object.hasOwn(entry, "token_hash")), false);

    await assert.rejects(issueIngressCredential({
      registryPath,
      credentialId: "cred_alice_pc1_codex",
      accountId: "alice",
      deviceId: "alice_pc2",
      agentId: "codex_secondary",
      projectScopes: ["PRJ_A"],
      capabilities: ["receipt:read"],
      expiresAt: Date.parse("2027-07-01T00:00:00.000Z"),
    }), /credential_id_conflict/);

    const revoked = await revokeIngressCredential({
      registryPath,
      credentialId: "cred_alice_pc1_codex",
      revokedAt: Date.parse("2026-07-17T01:00:00.000Z"),
      now: Date.parse("2026-07-17T01:00:00.000Z"),
    });
    assert.equal(revoked.status, "revoked");
    assert.equal((await revokeIngressCredential({ registryPath, credentialId: "cred_alice_pc1_codex" })).status, "already_revoked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service observes registry revocation without restart and registry locking fails closed", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "soulforge-ingress-admin-live-"));
  const registryPath = resolve(root, "auth.json");
  const outboxRoot = resolve(root, "outbox");
  const stateRoot = resolve(root, "state");
  const configPath = resolve(root, "config.json");
  const outboxBindingPath = resolve(root, "outbox.json");
  try {
    await initializeIngressAuthRegistry({ registryPath });
    const issued = await issueIngressCredential({
      registryPath,
      credentialId: "cred_bob_pc1_codex",
      accountId: "bob",
      deviceId: "bob_pc1",
      agentId: "codex_primary",
      projectScopes: ["PRJ_A"],
      capabilities: ["receipt:read"],
      expiresAt: Date.parse("2027-07-01T00:00:00.000Z"),
    });
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
      submission_root: resolve(stateRoot, "submissions"),
      max_file_bytes: 1024,
      chunk_bytes: 64 * 1024,
      ticket_ttl_seconds: 600,
    });
    const service = await createIngressMcpService({ configPath });
    assert.equal((await service.authenticate(issued.token)).accountId, "bob");
    await revokeIngressCredential({ registryPath, credentialId: "cred_bob_pc1_codex" });
    await assert.rejects(service.authenticate(issued.token), /ingress_auth_invalid/);

    await writeFile(`${registryPath}.lock`, "synthetic-lock\n", "utf8");
    await assert.rejects(revokeIngressCredential({ registryPath, credentialId: "cred_bob_pc1_codex" }), /auth_registry_locked/);
    assert.equal(JSON.parse(await readFile(registryPath, "utf8")).tokens[0].credential_id, "cred_bob_pc1_codex");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
