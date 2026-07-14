import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CODEX_DEDICATED_WORKER_VERSION } from "../src/codex_dedicated_worker.mjs";
import { CODEX_TASK_BRIDGE_VERSION } from "../src/codex_bridge.mjs";
import { codexWorkerReleaseBindingRevision } from "../src/codex_dedicated_worker_client.mjs";
import { inspectCodexPayloadOwner } from "../src/codex_payload_owner.mjs";
import { openStore } from "../src/store.mjs";
import {
  CODEX_SHARE_BOUNDARY_RECEIPT_SCHEMA,
  runRuntimeReleaseAudit,
  validateCodexShareBoundaryReceipt,
} from "../tools/runtime_release_audit.mjs";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

test("UNC share receipt binds the exact registry, worker, v4 projection probe, and mutation control", () => {
  const workerIdentity = "a".repeat(64);
  const registryRevision = "b".repeat(64);
  const uncRows = [{ workspace_id: "team_unc", root_kind: "unc", allowed_write_prefixes: ["Output"] }];
  const receipt = {
    schema: CODEX_SHARE_BOUNDARY_RECEIPT_SCHEMA,
    registry_revision: registryRevision,
    trust_domain_id: "team-domain",
    worker_identity_sha256: workerIdentity,
    worker_release: CODEX_DEDICATED_WORKER_VERSION.release,
    bridge_release: CODEX_TASK_BRIDGE_VERSION.release,
    permission_probe_source: "codex_sandbox_turn_projection_probe_v4",
    verified_at: new Date().toISOString(),
    mutation_control: "acl_turn_lock",
    server_share_target_nonoverlap: true,
    ntfs_ads_clear: true,
    workspaces: [{
      workspace_id: "team_unc",
      root_kind: "unc",
      read_probe: true,
      approved_write_probe: "pass",
      sibling_read_deny: true,
      parent_enumeration_deny: true,
      outside_read_deny: true,
      outside_write_deny: true,
      junction_deny: true,
      hardlink_deny: true,
    }],
  };
  const context = {
    registryRevision,
    trustDomainId: "team-domain",
    expectedWorkerIdentityHash: workerIdentity,
    uncRows,
  };
  assert.deepEqual(validateCodexShareBoundaryReceipt(receipt, context), { ok: true, workspace_count: 1 });
  assert.equal(validateCodexShareBoundaryReceipt({ ...receipt, schema: "dev_erp.codex_share_boundary_receipt.v1" }, context).error, "receipt_schema_invalid");
  assert.equal(validateCodexShareBoundaryReceipt({ ...receipt, mutation_control: "none" }, context).error, "receipt_boundary_unproven");
  assert.equal(validateCodexShareBoundaryReceipt({ ...receipt, worker_identity_sha256: "c".repeat(64) }, context).error, "receipt_binding_mismatch");
  assert.equal(validateCodexShareBoundaryReceipt({ ...receipt, permission_probe_source: "codex_sandbox_exact_path_probe_v3" }, context).error, "receipt_binding_mismatch");
  assert.equal(validateCodexShareBoundaryReceipt({ ...receipt, raw_root: "forbidden" }, context).error, "receipt_schema_invalid");
});

async function withHealthServer(bodyFactory, run) {
  const server = createServer((request, response) => {
    const body = JSON.stringify(bodyFactory(server.address()?.port));
    response.writeHead(request.url === "/api/health" ? 200 : 404, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  try {
    return await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function auditOptions(root, port, overrides = {}) {
  return {
    sourceRoot: root,
    runtimeRoot: root,
    appRoot: APP_DIR,
    dbPath: join(root, "missing.db"),
    metaPath: join(root, "missing-real-meta.json"),
    workspacesDir: join(root, "_workspaces"),
    codexTurnProjectionRoot: root,
    nasRoot: false,
    expectedCommit: "a".repeat(40),
    codexWorkerExpectedRuntimeIdentityHash: "c".repeat(64),
    requireLive: true,
    port,
    ...overrides,
  };
}

function attestationKeyOptions(root) {
  const keys = generateKeyPairSync("ed25519");
  const path = join(root, "worker-attestation-public.pem");
  writeFileSync(path, keys.publicKey.export({ type: "spki", format: "pem" }));
  return {
    codexWorkerAttestationPublicKeyFile: path,
    codexWorkerExpectedAttestationKeyId: createHash("sha256")
      .update(keys.publicKey.export({ type: "spki", format: "der" }))
      .digest("hex"),
  };
}

test("runtime release audit requires an exact worker loopback URL and keeps identity proof metadata-only", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-worker-audit-config-"));
  const identityMarker = "not-a-valid-private-identity-marker";
  try {
    const result = await withHealthServer(() => ({ ok: true, schema: "fixture.health.v1" }), (port) => (
      runRuntimeReleaseAudit(auditOptions(root, port, {
        codexWorkerUrl: `http://localhost:${port}`,
        codexWorkerExpectedIdentityHash: identityMarker,
        codexWorkerExpectedRuntimeIdentityHash: "invalid-runtime-identity",
        codexTurnProjectionRoot: "relative-turn-projection",
      }))
    ));
    assert.equal(result.checks.codex_worker_boundary.worker_url_configured, true);
    assert.equal(result.checks.codex_worker_boundary.loopback_url_valid, false);
    assert.equal(result.checks.codex_worker_boundary.expected_identity_sha256_configured, false);
    assert.equal(result.checks.codex_worker_boundary.expected_runtime_identity_sha256_configured, false);
    assert.ok(result.blockers.some((issue) => issue.code === "codex_worker_url_not_loopback"));
    assert.ok(result.blockers.some((issue) => issue.code === "codex_worker_expected_identity_missing"));
    assert.ok(result.blockers.some((issue) => issue.code === "codex_worker_expected_runtime_identity_missing"));
    assert.equal(result.checks.codex_runtime_isolation.turn_projection_root_configured, false);
    assert.ok(result.blockers.some((issue) => issue.code === "codex_turn_projection_root_invalid"));
    assert.equal(JSON.stringify(result).includes(identityMarker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("core-only live release requires the worker to stay explicitly unconfigured and fail-closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-core-only-audit-"));
  try {
    const payloadBase = join(root, "_workspaces", "system", "dev-erp");
    const attachmentRoot = join(payloadBase, "codex-task-attachments");
    const messageRoot = join(payloadBase, "codex-message-payloads");
    mkdirSync(attachmentRoot, { recursive: true });
    mkdirSync(messageRoot, { recursive: true });
    const payloadOwner = inspectCodexPayloadOwner({
      backendRoot: root,
      workspaceOwnerRoot: join(root, "_workspaces", "system"),
      ownerBase: payloadBase,
      roots: [attachmentRoot, messageRoot],
    });
    const health = {
      ok: true,
      schema: "fixture.health.v1",
      attestation: {
        source_commit: "a".repeat(40),
        codex_bridge: CODEX_TASK_BRIDGE_VERSION.release,
        codex_execution_boundary: "worker_unattested",
        codex_worker_configured: false,
        codex_worker_ready: false,
        codex_payload_owner_configured: true,
        codex_payload_roots_safe: true,
        codex_payload_owner_revision: payloadOwner.revision,
      },
    };
    const result = await withHealthServer(() => health, (port) => runRuntimeReleaseAudit(auditOptions(root, port, {
      workspacesDir: join(root, "_workspaces"),
      coreOnlyRelease: true,
      codexWorkerExpectedRuntimeIdentityHash: null,
      codexTurnProjectionRoot: null,
    })));
    const codes = new Set(result.blockers.map((issue) => issue.code));
    assert.equal(result.release_mode, "core_only");
    assert.equal(result.checks.codex_worker_boundary.worker_disabled_configuration, true);
    assert.equal(result.checks.live_server.attestation.worker_configured, false);
    assert.equal(codes.has("core_only_worker_configuration_present"), false);
    assert.equal(codes.has("live_core_only_worker_not_disabled"), false);
    assert.equal(codes.has("codex_worker_process_isolation_missing"), false);
    assert.equal(codes.has("live_codex_worker_not_ready"), false);
    assert.equal(codes.has("codex_dedicated_home_missing"), false);
    assert.equal(codes.has("live_codex_payload_owner_mismatch"), false);

    const configured = await withHealthServer(() => health, (port) => runRuntimeReleaseAudit(auditOptions(root, port, {
      workspacesDir: join(root, "_workspaces"),
      coreOnlyRelease: true,
      codexWorkerUrl: `http://127.0.0.1:${port}`,
      codexWorkerExpectedRuntimeIdentityHash: null,
      codexTurnProjectionRoot: null,
    })));
    assert.ok(configured.blockers.some((issue) => issue.code === "core_only_worker_configuration_present"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime release audit projects and validates every dedicated-worker live attestation", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-worker-audit-live-"));
  const identityMarker = "e".repeat(64);
  const identityNameMarker = "PRIVATE-WORKER-NAME";
  const tokenMarker = "PRIVATE-WORKER-TOKEN-MARKER";
  try {
    const payloadBase = join(root, "_workspaces", "system", "dev-erp");
    const attachmentRoot = join(payloadBase, "codex-task-attachments");
    const messageRoot = join(payloadBase, "codex-message-payloads");
    mkdirSync(attachmentRoot, { recursive: true });
    mkdirSync(messageRoot, { recursive: true });
    const payloadOwner = inspectCodexPayloadOwner({
      backendRoot: root,
      workspaceOwnerRoot: join(root, "_workspaces", "system"),
      ownerBase: payloadBase,
      roots: [attachmentRoot, messageRoot],
    });
    assert.equal(payloadOwner.roots_safe, true);
    const keyOptions = attestationKeyOptions(root);
    const result = await withHealthServer((port) => ({
      ok: true,
      schema: "fixture.health.v1",
      worker_token: tokenMarker,
      attestation: {
        codex_execution_boundary: "dedicated_worker",
        codex_worker_ready: true,
        codex_worker_release: CODEX_DEDICATED_WORKER_VERSION.release,
        codex_worker_attestation_verified: true,
        codex_worker_attestation_key_match: true,
        codex_worker_source_commit_match: true,
        codex_worker_source_tree_clean: true,
        codex_worker_identity_match: true,
        codex_worker_process_separate: true,
        codex_worker_identity_separate: true,
        codex_worker_registry_revision_match: true,
        codex_worker_root_isolation_ready: true,
        codex_worker_projection_root_ready: true,
        codex_worker_denied_read_roots_ready: true,
        codex_worker_payload_deny_binding_match: true,
        codex_worker_forbidden_roots_ready: true,
        codex_worker_permission_profile_match: true,
        codex_worker_filesystem_boundary_proven: true,
        codex_worker_command_identity_match: true,
        codex_worker_release_binding_revision: codexWorkerReleaseBindingRevision({
          workerUrl: `http://127.0.0.1:${port}`,
          expectedWorkerIdentityHash: identityMarker,
          expectedRuntimeIdentityHash: "c".repeat(64),
          expectedAttestationKeyId: keyOptions.codexWorkerExpectedAttestationKeyId,
        }),
        codex_worker_bridge_mode: "app-server",
        codex_payload_owner_configured: true,
        codex_payload_roots_safe: true,
        codex_payload_owner_revision: payloadOwner.revision,
        worker_identity_hash: identityMarker,
        worker_identity_name: identityNameMarker,
      },
    }), (port) => runRuntimeReleaseAudit(auditOptions(root, port, {
      codexWorkerUrl: `http://127.0.0.1:${port}`,
      codexWorkerExpectedIdentityHash: identityMarker,
      ...keyOptions,
    })));

    assert.equal(result.checks.codex_worker_boundary.loopback_url_valid, true);
    assert.equal(result.checks.codex_runtime_isolation.turn_projection_root_configured, true);
    assert.equal(result.checks.codex_runtime_isolation.turn_projection_root_directory_available, true);
    assert.equal(result.checks.live_server.attestation.execution_boundary, "dedicated_worker");
    assert.equal(result.checks.live_server.attestation.worker_ready, true);
    assert.equal(result.checks.live_server.attestation.worker_release_match, true);
    assert.equal(result.checks.live_server.attestation.worker_attestation_verified, true);
    assert.equal(result.checks.live_server.attestation.worker_attestation_key_match, true);
    assert.equal(result.checks.live_server.attestation.worker_source_commit_match, true);
    assert.equal(result.checks.live_server.attestation.worker_source_tree_clean, true);
    assert.equal(result.checks.live_server.attestation.worker_identity_match, true);
    assert.equal(result.checks.live_server.attestation.worker_process_separate, true);
    assert.equal(result.checks.live_server.attestation.worker_identity_separate, true);
    assert.equal(result.checks.live_server.attestation.worker_registry_revision_match, true);
    assert.equal(result.checks.live_server.attestation.worker_root_isolation_ready, true);
    assert.equal(result.checks.live_server.attestation.worker_projection_root_ready, true);
    assert.equal(result.checks.live_server.attestation.worker_denied_read_roots_ready, true);
    assert.equal(result.checks.live_server.attestation.worker_payload_deny_binding_match, true);
    assert.equal(result.checks.live_server.attestation.worker_permission_profile_match, true);
    assert.equal(result.checks.live_server.attestation.worker_filesystem_boundary_proven, true);
    assert.equal(result.checks.live_server.attestation.worker_command_identity_match, true);
    assert.equal(result.checks.live_server.attestation.worker_release_binding_match, true);
    assert.equal(result.checks.live_server.attestation.worker_bridge_mode_match, true);
    assert.equal(result.checks.live_server.attestation.payload_owner_revision_match, true);
    const workerBlockers = new Set([
      "codex_worker_process_isolation_missing",
      "live_codex_worker_not_ready",
      "live_codex_worker_release_mismatch",
      "live_codex_worker_attestation_unverified",
      "live_codex_worker_attestation_key_mismatch",
      "live_codex_worker_source_commit_mismatch",
      "live_codex_worker_source_tree_dirty",
      "live_codex_worker_identity_mismatch",
      "live_codex_worker_process_not_separate",
      "live_codex_worker_identity_not_separate",
      "live_codex_worker_registry_revision_mismatch",
      "live_codex_worker_root_isolation_unready",
      "live_codex_worker_projection_root_unready",
      "live_codex_worker_denied_read_roots_unready",
      "live_codex_worker_payload_deny_binding_mismatch",
      "live_codex_worker_forbidden_roots_unready",
      "live_codex_worker_permission_profile_mismatch",
      "live_codex_worker_filesystem_boundary_unproven",
      "live_codex_worker_command_identity_mismatch",
      "live_codex_worker_release_binding_mismatch",
      "live_codex_worker_bridge_mode_invalid",
    ]);
    assert.equal(result.blockers.some((issue) => workerBlockers.has(issue.code)), false);
    assert.equal(result.blockers.some((issue) => issue.code === "live_codex_payload_owner_mismatch"), false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(identityMarker), false);
    assert.equal(serialized.includes(identityNameMarker), false);
    assert.equal(serialized.includes(tokenMarker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime release audit fails closed for each invalid dedicated-worker attestation", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-worker-audit-invalid-"));
  try {
    const keyOptions = attestationKeyOptions(root);
    const result = await withHealthServer(() => ({
      ok: true,
      schema: "fixture.health.v1",
      attestation: {
        codex_execution_boundary: "in_process",
        codex_worker_ready: false,
        codex_worker_release: "wrong-release",
        codex_worker_attestation_verified: false,
        codex_worker_attestation_key_match: false,
        codex_worker_source_commit_match: false,
        codex_worker_source_tree_clean: false,
        codex_worker_identity_match: false,
        codex_worker_process_separate: false,
        codex_worker_identity_separate: false,
        codex_worker_registry_revision_match: false,
        codex_worker_root_isolation_ready: false,
        codex_worker_projection_root_ready: false,
        codex_worker_denied_read_roots_ready: false,
        codex_worker_payload_deny_binding_match: false,
        codex_worker_forbidden_roots_ready: false,
        codex_worker_permission_profile_match: false,
        codex_worker_filesystem_boundary_proven: false,
        codex_worker_command_identity_match: false,
        codex_worker_release_binding_revision: "0".repeat(64),
        codex_worker_bridge_mode: "mock",
      },
    }), (port) => runRuntimeReleaseAudit(auditOptions(root, port, {
      codexWorkerUrl: `http://127.0.0.1:${port}`,
      codexWorkerExpectedIdentityHash: "f".repeat(64),
      ...keyOptions,
    })));
    const codes = new Set(result.blockers.map((issue) => issue.code));
    for (const code of [
      "codex_worker_process_isolation_missing",
      "live_codex_worker_not_ready",
      "live_codex_worker_release_mismatch",
      "live_codex_worker_attestation_unverified",
      "live_codex_worker_attestation_key_mismatch",
      "live_codex_worker_source_commit_mismatch",
      "live_codex_worker_source_tree_dirty",
      "live_codex_worker_identity_mismatch",
      "live_codex_worker_process_not_separate",
      "live_codex_worker_identity_not_separate",
      "live_codex_worker_registry_revision_mismatch",
      "live_codex_worker_root_isolation_unready",
      "live_codex_worker_projection_root_unready",
      "live_codex_worker_denied_read_roots_unready",
      "live_codex_worker_payload_deny_binding_mismatch",
      "live_codex_worker_forbidden_roots_unready",
      "live_codex_worker_permission_profile_mismatch",
      "live_codex_worker_filesystem_boundary_unproven",
      "live_codex_worker_command_identity_mismatch",
      "live_codex_worker_release_binding_mismatch",
      "live_codex_worker_bridge_mode_invalid",
    ]) assert.ok(codes.has(code), `expected blocker ${code}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime release audit blocks active ERP grants outside the registry static write ceiling", async () => {
  const root = mkdtempSync(join(tmpdir(), "dev-erp-worker-audit-write-ceiling-"));
  try {
    const appRoot = join(root, "runtime-app");
    const registryPath = join(appRoot, "data", "codex-workspaces.runtime.json");
    const workspaceRoot = join(root, "approved-share");
    const dbPath = join(root, "data", "dev-erp.db");
    for (const directory of [dirname(registryPath), workspaceRoot, dirname(dbPath)]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(registryPath, JSON.stringify({
      schema: "dev_erp.codex_workspace_registry.v1",
      machine_id: "write-ceiling-test",
      trust_domain_id: "write-ceiling-domain",
      workspaces: [{
        workspace_id: "project_write",
        label: "Project write",
        root_kind: "local",
        root: workspaceRoot,
        allowed_project_ids: ["P26-WRITE"],
        allowed_roles: ["admin"],
        allowed_write_prefixes: [],
      }],
    }));
    const store = openStore(dbPath);
    store.upsertProject({ id: "P26-WRITE", title: "Write ceiling", health: "ok", class: "active" });
    store.createAccount({ username: "owner", password: "ownerpass123", roles: ["admin"] });
    const item = store.createItem({ project_id: "P26-WRITE", title: "Grant fixture", created_by: "owner" }).item;
    store.upsertCodexTaskBinding({
      item_id: item.id,
      thread_id: "thread_write_ceiling",
      mode: "worker",
      workspace_id: "project_write",
      workspace_revision: "a".repeat(64),
      workspace_root_fingerprint: "b".repeat(64),
    });
    const now = Date.now();
    assert.equal(store.approveCodexWorkspaceWrite({
      item_id: item.id,
      relative_prefix: "Output",
      approved_by: "owner",
      reason: "fixture",
      approved_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
    }).ok, true);
    store.db.close();

    const result = await runRuntimeReleaseAudit({
      sourceRoot: root,
      runtimeRoot: root,
      appRoot,
      dbPath,
      metaPath: join(root, "missing-meta.json"),
      workspacesDir: join(root, "_workspaces"),
      workspaceRegistryPath: registryPath,
      codexTrustDomain: "write-ceiling-domain",
      nasRoot: false,
      requireLive: true,
      port: 65534,
    });
    const issue = result.blockers.find((entry) => entry.code === "codex_active_write_grant_outside_static_policy");
    assert.ok(issue);
    assert.equal(result.checks.codex_workspace_registry.active_write_grants.outside_static_policy_count, 1);
    assert.equal(JSON.stringify(issue).includes("Output"), false);
    assert.equal(JSON.stringify(result).includes(workspaceRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
