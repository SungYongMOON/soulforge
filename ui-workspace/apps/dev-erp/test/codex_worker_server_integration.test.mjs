import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { readWorkerIdentity, startCodexDedicatedWorker } from "../src/codex_dedicated_worker.mjs";

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, child, stderr) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${stderr()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`server_not_ready:${stderr()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

async function waitForStartedAudit(dbPath, itemId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const count = db.prepare(
        "SELECT COUNT(*) AS n FROM codex_turn_audit WHERE item_id=? AND outcome='started'",
      ).get(itemId).n;
      db.close();
      if (count > 0) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("started_audit_timeout");
}

test("ERP delegates model, workspace, attachment, and turn execution to the attested dedicated worker", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-worker-integration-"));
  const workerHome = join(root, "worker-home");
  const workspaceRoot = join(root, "team-share", "project-56");
  const payloadOwner = join(root, "_workspaces", "system", "dev-erp");
  const attachmentRoot = join(payloadOwner, "codex-task-attachments");
  const messageRoot = join(payloadOwner, "codex-message-payloads");
  const registryOwner = join(root, "registry-owner");
  const registryPath = join(registryOwner, "codex-workspaces.runtime.json");
  const workerKeyOwner = join(root, "worker-keys");
  const workerAttestationPrivateKey = join(workerKeyOwner, "attestation-private.pem");
  const erpAttestationPublicKey = join(root, "erp-attestation-public.pem");
  const dbPath = join(root, "erp", "dev-erp.db");
  const token = randomBytes(32).toString("base64url");
  const workerIdentity = readWorkerIdentity();
  const refKeyring = JSON.stringify({
    active_kid: "integration",
    keys: { integration: randomBytes(32).toString("base64url") },
  });
  const attestationKeys = generateKeyPairSync("ed25519");
  const attestationKeyId = createHash("sha256")
    .update(attestationKeys.publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  const trustDomain = "worker-integration-domain";
  for (const directory of [
    workerHome, workspaceRoot, join(workspaceRoot, "Output"), attachmentRoot, messageRoot, dirname(dbPath), workerKeyOwner, registryOwner,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  chmodSync(workerKeyOwner, 0o700);
  writeFileSync(workerAttestationPrivateKey, attestationKeys.privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(erpAttestationPublicKey, attestationKeys.publicKey.export({ type: "spki", format: "pem" }));
  chmodSync(workerAttestationPrivateKey, 0o600);
  const registryDocument = (label = "Project 56 team share") => ({
    schema: "dev_erp.codex_workspace_registry.v1",
    machine_id: "worker-integration-machine",
    trust_domain_id: trustDomain,
    workspaces: [{
      workspace_id: "project_56",
      label,
      root_kind: "local",
      root: workspaceRoot,
      default_access: "read-only",
      allowed_project_ids: ["P56-TEST"],
      allowed_roles: ["admin"],
      allowed_write_prefixes: ["Output"],
    }],
  });
  writeFileSync(registryPath, JSON.stringify(registryDocument()));

  const envKeys = [
    "DEV_ERP_CODEX_WORKER_TOKEN", "DEV_ERP_CODEX_WORKER_PORT", "DEV_ERP_CODEX_WORKER_HOST",
    "DEV_ERP_CODEX_WORKER_BRIDGE", "DEV_ERP_CODEX_HOME", "DEV_ERP_CODEX_WORKSPACE_REGISTRY",
    "DEV_ERP_CODEX_TRUST_DOMAIN", "DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT", "DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT",
    "DEV_ERP_CODEX_WORKER_REF_KEYS_JSON", "DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE",
    "DEV_ERP_CODEX_MOCK_DELAY_MS", "DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let worker = null;
  let erp = null;
  try {
    Object.assign(process.env, {
      DEV_ERP_CODEX_WORKER_TOKEN: token,
      DEV_ERP_CODEX_WORKER_REF_KEYS_JSON: refKeyring,
      DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE: workerAttestationPrivateKey,
      DEV_ERP_CODEX_WORKER_PORT: "0",
      DEV_ERP_CODEX_WORKER_HOST: "127.0.0.1",
      DEV_ERP_CODEX_WORKER_BRIDGE: "mock",
      DEV_ERP_CODEX_HOME: workerHome,
      DEV_ERP_CODEX_WORKSPACE_REGISTRY: registryPath,
      DEV_ERP_CODEX_TRUST_DOMAIN: trustDomain,
      DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: attachmentRoot,
      DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT: messageRoot,
      DEV_ERP_CODEX_MOCK_DELAY_MS: "700",
    });
    worker = await startCodexDedicatedWorker();
    const erpPort = await freePort();
    let stderrText = "";
    const erpEnv = {
      ...process.env,
      DEV_ERP_AUTOSYNC: "0",
      DEV_ERP_NO_TLS: "1",
      DEV_ERP_BACKEND_ROOT: root,
      DEV_ERP_CODEX_TASK_BRIDGE: "worker",
      DEV_ERP_CODEX_WORKER_URL: `http://127.0.0.1:${worker.address.port}`,
      DEV_ERP_CODEX_WORKER_TOKEN: token,
      DEV_ERP_CODEX_WORKER_EXPECTED_IDENTITY_HASH: workerIdentity.hash,
      DEV_ERP_CODEX_WORKER_EXPECTED_RUNTIME_IDENTITY_SHA256: createHash("sha256").update("mock_codex_command_revision").digest("hex"),
      DEV_ERP_CODEX_WORKER_ATTEST_PUBLIC_KEY_FILE: erpAttestationPublicKey,
      DEV_ERP_CODEX_WORKER_EXPECTED_ATTESTATION_KEY_ID: attestationKeyId,
      DEV_ERP_CODEX_WORKSPACE_REGISTRY: registryPath,
      DEV_ERP_CODEX_TRUST_DOMAIN: trustDomain,
      DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT: attachmentRoot,
      DEV_ERP_CODEX_MESSAGE_PAYLOAD_ROOT: messageRoot,
      DEV_ERP_CODEX_HOME: workerHome,
    };
    delete erpEnv.DEV_ERP_CODEX_WORKER_REF_KEYS_JSON;
    delete erpEnv.DEV_ERP_CODEX_WORKER_ATTEST_PRIVATE_KEY_FILE;
    erp = spawn(process.execPath, ["server.mjs", "--db", dbPath, "--port", String(erpPort)], {
      cwd: APP_ROOT,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: erpEnv,
    });
    erp.stderr.on("data", (chunk) => { stderrText += chunk.toString(); });
    const base = `http://127.0.0.1:${erpPort}`;
    const initialHealth = await waitForHttp(`${base}/api/health`, erp, () => stderrText);
    const health = await initialHealth.json();
    assert.equal(health.attestation.codex_execution_boundary, "dedicated_worker");
    assert.equal(health.attestation.codex_worker_ready, true);
    assert.equal(health.attestation.codex_worker_attestation_verified, true);
    assert.equal(health.attestation.codex_worker_attestation_key_match, true);
    assert.equal(health.attestation.codex_worker_source_commit_match, true);
    assert.equal(health.attestation.codex_worker_identity_match, true);
    assert.equal(health.attestation.codex_worker_process_separate, true);
    assert.equal(health.attestation.codex_worker_identity_separate, true);
    assert.equal(health.attestation.codex_worker_command_identity_match, true);
    assert.equal(JSON.stringify(health).includes(workerIdentity.name), false);
    assert.equal(JSON.stringify(health).includes(workerIdentity.hash), false);

    const bootstrap = await fetch(`${base}/api/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "ownerpass123" }),
    });
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get("set-cookie").split(";", 1)[0];
    const request = (path, options = {}) => fetch(`${base}${path}`, {
      ...options,
      headers: { cookie, ...(options.headers || {}) },
    });
    let response = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "P56-TEST", title: "GPT-5.6 worker test" }),
    });
    assert.equal(response.status, 200);
    response = await request("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: "P56-TEST", title: "Use the team workspace safely" }),
    });
    assert.equal(response.status, 200);
    const item = (await response.json()).item;

    const capabilities = await (await request(`/api/codex-task/capabilities?item_id=${encodeURIComponent(item.id)}`)).json();
    assert.equal(capabilities.dedicated_worker.ready, true);
    assert.deepEqual(capabilities.model_options, ["gpt-5.5"]);
    assert.equal(capabilities.model_catalog_source, "mock_fallback");
    assert.deepEqual(capabilities.skills, []);

    response = await request("/api/codex-task/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_id: item.id, workspace_id: "project_56" }),
    });
    assert.equal(response.status, 200, await response.clone().text());

    response = await request(`/api/codex-task/attachment?item_id=${encodeURIComponent(item.id)}&filename=worker-note.txt`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from("bounded worker attachment", "utf8"),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const attachment = (await response.json()).attachment;

    const driftTurn = request("/api/codex-task/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        workspace_id: "project_56",
        message: "This result must not persist across a registry policy revision.",
      }),
    });
    await waitForStartedAudit(dbPath, item.id);
    await new Promise((resolve) => setTimeout(resolve, 250));
    writeFileSync(registryPath, JSON.stringify(registryDocument("Project 56 policy changed")));
    const driftResponse = await driftTurn;
    assert.equal(driftResponse.status, 502, await driftResponse.clone().text());
    writeFileSync(registryPath, JSON.stringify(registryDocument()));

    response = await request("/api/codex-task/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        workspace_id: "project_56",
        message: "Inspect the attached note without exposing host paths.",
        attachments: [attachment],
      }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const publicState = await response.json();
    const publicText = JSON.stringify(publicState);
    assert.equal(publicText.includes("dwr2."), false);
    assert.equal(publicText.includes(workspaceRoot), false);
    assert.equal(publicText.includes(workerHome), false);
    assert.equal("thread_id" in publicState.binding, false);

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const binding = db.prepare("SELECT thread_id,mode FROM codex_thread_binding WHERE item_id=?").get(item.id);
      assert.match(binding.thread_id, /^dwr2\./);
      assert.ok(binding.thread_id.length > 200);
      assert.equal(binding.mode, "worker");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM codex_turn_audit WHERE item_id=? AND outcome='started'").get(item.id).n, 0);
      assert.ok(db.prepare("SELECT COUNT(*) AS n FROM codex_turn_audit WHERE item_id=? AND outcome='completed'").get(item.id).n >= 2);
      assert.ok(db.prepare("SELECT COUNT(*) AS n FROM codex_turn_audit WHERE item_id=? AND outcome='failed'").get(item.id).n >= 1);
      const audits = db.prepare(
        "SELECT model,effective_model,model_selection_origin,model_fallback,outcome FROM codex_turn_audit WHERE item_id=? ORDER BY id",
      ).all(item.id);
      const completedAudits = audits.filter((row) => row.outcome === "completed");
      assert.ok(completedAudits.every((row) => row.model === "gpt-5.5" && row.effective_model === "gpt-5.5"));
      assert.ok(audits.every((row) => row.model_selection_origin === "auto" && row.model_fallback === 0));
    } finally {
      db.close();
    }

    const replacedAttachmentRoot = `${attachmentRoot}-previous`;
    renameSync(attachmentRoot, replacedAttachmentRoot);
    mkdirSync(attachmentRoot, { recursive: true });
    response = await request(`/api/codex-task/capabilities?item_id=${encodeURIComponent(item.id)}`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "codex_payload_owner_unready" });
  } finally {
    if (erp) await stopChild(erp);
    if (worker) await worker.close();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    rmSync(root, { recursive: true, force: true });
  }
});
