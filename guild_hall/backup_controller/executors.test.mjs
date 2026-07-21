import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BackupControllerError } from "./controller.mjs";
import { buildRobocopyArgs, createFixedExecutorCatalog } from "./executors.mjs";
import { runFixedChild, robocopyExitCodeAccepted } from "./fixed_process.mjs";
import { createExternalReceiptStore } from "./receipts.mjs";

const NOW = new Date("2026-07-20T00:15:00.000Z");

async function resourcesFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sf-backup-executors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = {
    runtime_checkout_root: { kind: "directory", path: process.cwd() },
    hpp_data_root: { kind: "directory", path: path.join(root, "hpp") },
    hpp_recovery_policy: { kind: "pinned_file", path: path.join(root, "policy.json"), sha256: "a".repeat(64) },
    hpp_restore_test_root: { kind: "directory", path: path.join(root, "hpp-restore") },
    workspace_root: { kind: "onedrive_cloud_directory", path: path.join(root, "workspace"), reparse_profile: "microsoft_onedrive_cloud_0x9000601a" },
    erp_db_file: { kind: "file", path: path.join(root, "erp", "dev-erp.db") },
    project_metadata_root: { kind: "directory", path: path.join(root, "metadata") },
    cross_project_state_root: { kind: "directory", path: path.join(root, "private-state") },
    nas_hpp_backup_root: { kind: "raidrive_network_directory", path: path.join(root, "nas-hpp"), unc_prefix: "\\\\RaiDrive-test\\Synology" },
    nas_workspace_backup_root: { kind: "raidrive_network_directory", path: path.join(root, "nas-workspace"), unc_prefix: "\\\\RaiDrive-test\\Synology" },
    nas_erp_backup_root: { kind: "raidrive_network_directory", path: path.join(root, "nas-erp"), unc_prefix: "\\\\RaiDrive-test\\Synology" },
    nas_restore_root: { kind: "raidrive_network_directory", path: path.join(root, "nas-restore"), unc_prefix: "\\\\RaiDrive-test\\Synology" },
    nas_report_root: { kind: "raidrive_network_directory", path: path.join(root, "nas-report"), unc_prefix: "\\\\RaiDrive-test\\Synology" },
  };
  for (const resource of Object.values(resources)) {
    if (resource.kind !== "file" && resource.kind !== "pinned_file") await mkdir(resource.path, { recursive: true });
  }
  await mkdir(path.dirname(resources.erp_db_file.path), { recursive: true });
  await writeFile(resources.hpp_recovery_policy.path, "test-policy\n");
  return { root, resources };
}

function context(resources, stageId, commandId, index, previousFenceToken = null) {
  return {
    stage_id: stageId,
    command_id: commandId,
    operation_key: `backup-operation-${String(index).padStart(64, "0")}`,
    previous_fence_token: previousFenceToken,
    fence_token: randomUUID(),
    signal: new AbortController().signal,
    resources,
    period_key: "2026-07-20",
    attempt: 1,
    deadline_at: "2026-07-20T10:15:00.000Z",
    max_runtime_seconds: 60,
  };
}

test("fixed catalog executes all five handlers and writes strict external receipts", async (t) => {
  const fx = await resourcesFixture(t);
  let runtimeCalls = 0;
  let copyCalls = 0;
  const verifyCalls = [];
  const runtimeOperation = async (operation, options) => {
    runtimeCalls += 1;
    if (operation === "backup_db") {
      const target = path.join(options.outDir, "scheduled_20260720T000000Z");
      const backupPath = path.join(target, "dev-erp.db");
      const bytes = Buffer.from("synthetic-sqlite-backup");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await mkdir(target, { recursive: true });
      await writeFile(backupPath, bytes);
      await writeFile(path.join(target, "manifest.json"), JSON.stringify({ kind: "runtime_db_backup_manifest", quick_check: "ok", backupPath, sha256 }));
      return { ok: true, kind: "backup_db", quick_check: "ok", backupPath, sha256, backup_bytes: bytes.length };
    }
    const bytes = await readFile(options.backupPath);
    return { ok: true, kind: "restore_test", quick_check: "ok", sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const hppRecoveryAdapter = {
    snapshot: async () => ({ ok: true, generation_id: "generation-test", manifest_sha256: "b".repeat(64), source_digest: "c".repeat(64), file_count: 3 }),
    verifyAnchored: async (options) => {
      verifyCalls.push(options);
      return {
        ok: true,
        generation_id: options.generation_id,
        manifest_sha256: options.expected_manifest_sha256,
        recovery_policy_sha256: options.expected_policy_sha256,
        file_count: 3,
        writes_performed: 0,
      };
    },
  };
  const catalog = createFixedExecutorCatalog({
    approvalRef: "approval-executor-test-v1",
    hppRecoveryAdapter,
    runtimeOperation,
    runRobocopy: async () => { copyCalls += 1; return { code: 1, stdout: "copied", stderr: "" }; },
    healthInspector: async () => ({ exists: true, type: "directory" }),
    clock: () => NOW,
  });
  const sequence = [
    ["hpp_snapshot_v1", "hpp_snapshot", 1],
    ["erp_backup_v1", "erp_backup", 2],
    ["backup_health_v1", "health", 3],
    ["isolated_restore_v1", "weekly_restore", 4],
    ["workspace_copy_v1", "workspace_copy", 5],
  ];
  const contexts = [];
  for (const [commandId, stageId, index] of sequence) {
    const current = context(fx.resources, stageId, commandId, index);
    contexts.push(current);
    const result = await catalog.executors[commandId](current);
    assert.equal(result.ok, true);
    assert.match(result.receipt_sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(runtimeCalls, 3);
  assert.equal(copyCalls, 3);
  assert.equal(verifyCalls.length, 1);
  assert.equal(verifyCalls[0].generation_id, "generation-test");
  assert.equal(verifyCalls[0].expected_policy_sha256, fx.resources.hpp_recovery_policy.sha256);
  const erpStore = createExternalReceiptStore(fx.resources.nas_report_root.path);
  const erpReceipt = await erpStore.read(contexts[1], { acceptedFenceTokens: [contexts[1].fence_token] });
  assert.equal(erpReceipt.receipt.result.database.quick_check, "ok");
  assert.match(erpReceipt.receipt.result.database.backup_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(erpReceipt.receipt.result).sort(), ["cross_project_state", "database", "project_metadata", "status"]);

  const retry = { ...contexts[1], previous_fence_token: contexts[1].fence_token, fence_token: randomUUID(), attempt: 2 };
  const reused = await catalog.executors.erp_backup_v1(retry);
  assert.equal(reused.reused, true);
  assert.equal(reused.receipt_sha256, erpReceipt.receipt_sha256);
  assert.equal(runtimeCalls, 3);
  assert.equal(copyCalls, 3);
});

test("ERP executor uses runtime_ops backup/restore and receipts the exact hash and quick_check", async (t) => {
  const fx = await resourcesFixture(t);
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(fx.resources.erp_db_file.path);
  database.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta(key,value) VALUES ('schema_version','dev_erp.v1'); CREATE TABLE item(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO item(value) VALUES ('proof');");
  database.close();
  const catalog = createFixedExecutorCatalog({
    approvalRef: "approval-runtime-ops-proof-v1",
    runRobocopy: async () => ({ code: 0, stdout: "", stderr: "" }),
    clock: () => NOW,
  });
  const current = context(fx.resources, "erp_backup", "erp_backup_v1", 6);
  const result = await catalog.executors.erp_backup_v1(current);
  assert.equal(result.ok, true);
  const external = await createExternalReceiptStore(fx.resources.nas_report_root.path).read(current, { acceptedFenceTokens: [current.fence_token] });
  assert.equal(external.receipt.result.database.quick_check, "ok");
  assert.match(external.receipt.result.database.backup_sha256, /^[a-f0-9]{64}$/);
  assert.ok(external.receipt.result.database.bytes > 0);
});

test("HPP retry verifies and reuses its stable committed generation before writing a receipt", async (t) => {
  const fx = await resourcesFixture(t);
  const current = context(fx.resources, "hpp_snapshot", "hpp_snapshot_v1", 8);
  const generationId = `bc-${current.operation_key.slice(-32)}`;
  const generationRoot = path.join(fx.resources.nas_hpp_backup_root.path, "generations", generationId);
  const manifestSha256 = "d".repeat(64);
  await mkdir(generationRoot, { recursive: true });
  await writeFile(path.join(generationRoot, "COMMITTED.json"), `${JSON.stringify({ schema_version: "soulforge.ingress.recovery_commit.v1", generation_id: generationId, manifest_sha256: manifestSha256 })}\n`);
  let snapshotCalls = 0;
  let verifyCalls = 0;
  let verifyOptions;
  const catalog = createFixedExecutorCatalog({
    approvalRef: "approval-hpp-reuse-test-v1",
    hppRecoveryAdapter: {
      snapshot: async () => { snapshotCalls += 1; return null; },
      verifyAnchored: async (options) => {
        verifyCalls += 1;
        verifyOptions = options;
        return {
          ok: true,
          generation_id: generationId,
          manifest_sha256: options.expected_manifest_sha256,
          recovery_policy_sha256: options.expected_policy_sha256,
          source_digest: "e".repeat(64),
          file_count: 4,
          writes_performed: 0,
        };
      },
    },
    clock: () => NOW,
  });
  const output = await catalog.executors.hpp_snapshot_v1(current);
  assert.equal(output.ok, true);
  assert.equal(snapshotCalls, 0);
  assert.equal(verifyCalls, 1);
  assert.equal(verifyOptions.generation_id, generationId);
  assert.equal(verifyOptions.expected_policy_sha256, fx.resources.hpp_recovery_policy.sha256);
  const external = await createExternalReceiptStore(fx.resources.nas_report_root.path).read(current, { acceptedFenceTokens: [current.fence_token] });
  assert.equal(external.receipt.result.reused_committed_generation, true);
  assert.equal(external.receipt.result.manifest_sha256, manifestSha256);
});

test("robocopy contract is copy-only, excludes junctions/secrets, and accepts only codes 0-3", () => {
  const args = buildRobocopyArgs(["C:", "source"].join("\\"), ["C:", "destination"].join("\\"), "metadata");
  assert.ok(args.includes("/XJ"));
  assert.ok(args.includes(".git"));
  assert.ok(args.includes(".env"));
  assert.equal(args.some((arg) => ["/MIR", "/PURGE"].includes(arg.toUpperCase())), false);
  for (const code of [0, 1, 2, 3]) assert.equal(robocopyExitCodeAccepted(code), true);
  for (const code of [-1, 4, 7, 8]) assert.equal(robocopyExitCodeAccepted(code), false);
});

test("executor approval token is exactly recovery-compatible", () => {
  assert.throws(() => createFixedExecutorCatalog({ approvalRef: "approval:colon-is-not-recovery-safe" }), (error) => error instanceof BackupControllerError && error.code === "executor_approval_ref_required");
  assert.doesNotThrow(() => createFixedExecutorCatalog({ approvalRef: "approval-recovery-safe-v1" }));
});

test("AbortSignal invokes fixed child-tree termination and waits for exit", async () => {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let terminated = false;
  const abortController = new AbortController();
  const running = runFixedChild({
    file: "fixed-test.exe",
    args: ["fixed"],
    signal: abortController.signal,
    spawnImpl: () => child,
    terminateTree: async (target) => {
      terminated = true;
      assert.equal(target.pid, 4242);
      target.emit("exit", 1, null);
    },
  });
  abortController.abort();
  await assert.rejects(running, (error) => error instanceof BackupControllerError && error.code === "fixed_child_aborted");
  assert.equal(terminated, true);
});

test("AbortSignal fails closed when tree termination or child exit is not confirmed", async () => {
  const makeChild = () => {
    const child = new EventEmitter();
    child.pid = 4243;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  };
  const rejectedTermination = new AbortController();
  const first = runFixedChild({ file: "fixed-test.exe", args: ["fixed"], signal: rejectedTermination.signal, spawnImpl: makeChild, terminateTree: async () => { throw new Error("taskkill failed"); }, terminationTimeoutMs: 50 });
  rejectedTermination.abort();
  await assert.rejects(first, (error) => error instanceof BackupControllerError && error.code === "fixed_child_termination_failed");

  const missingExit = new AbortController();
  const second = runFixedChild({ file: "fixed-test.exe", args: ["fixed"], signal: missingExit.signal, spawnImpl: makeChild, terminateTree: async () => {}, terminationTimeoutMs: 50 });
  missingExit.abort();
  await assert.rejects(second, (error) => error instanceof BackupControllerError && error.code === "fixed_child_exit_unconfirmed");
});

test("robocopy failure code prevents an external success receipt", async (t) => {
  const fx = await resourcesFixture(t);
  const catalog = createFixedExecutorCatalog({ approvalRef: "approval-robocopy-fail-v1", runRobocopy: async () => ({ code: 4, stdout: "", stderr: "" }), clock: () => NOW });
  const current = context(fx.resources, "workspace_copy", "workspace_copy_v1", 7);
  await assert.rejects(catalog.executors.workspace_copy_v1(current), (error) => error instanceof BackupControllerError && error.code === "robocopy_failed");
  assert.equal(await createExternalReceiptStore(fx.resources.nas_report_root.path).read(current), null);
});
