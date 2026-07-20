import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { BackupControllerError } from "./controller.mjs";
import { runFixedChild, robocopyExitCodeAccepted } from "./fixed_process.mjs";
import { createExternalReceiptStore, validateExternalReceipt } from "./receipts.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const OS_TRANSIENT_DIRECTORIES = Object.freeze(["$RECYCLE.BIN", "System Volume Information", ".Trash-*", "lost+found"]);
const SECRET_DIRECTORIES = Object.freeze([".git", ".codex", "secret", "secrets", "credentials", "tokens", "cookies"]);
const SECRET_FILES = Object.freeze([".env", ".env.*", "*.pem", "*.key", "*credential*", "*token*", "*cookie*", "config.toml"]);

function fail(code) {
  throw new BackupControllerError(code);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function runRuntimeWorkerDefault(operation, options, signal, runtimeCheckoutRoot) {
  if (signal?.aborted) fail("runtime_operation_aborted");
  const workerRef = path.join(runtimeCheckoutRoot, "guild_hall", "backup_controller", "runtime_ops_worker.mjs");
  const worker = new Worker(pathToFileURL(workerRef), { workerData: { operation, options } });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => {
      void worker.terminate().finally(() => finish(reject, new BackupControllerError("runtime_operation_aborted")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (message) => finish(resolve, message));
    worker.once("error", (error) => finish(reject, error));
    worker.once("exit", (code) => {
      if (code !== 0) finish(reject, new BackupControllerError("runtime_worker_failed"));
    });
  });
}

export function buildRobocopyArgs(source, destination, profile) {
  const excludedDirectories = profile === "metadata"
    ? [...OS_TRANSIENT_DIRECTORIES, ...SECRET_DIRECTORIES]
    : [...OS_TRANSIENT_DIRECTORIES, ...SECRET_DIRECTORIES];
  return [
    source,
    destination,
    "/E",
    "/COPY:DAT",
    "/DCOPY:DAT",
    "/R:2",
    "/W:5",
    "/XJ",
    "/FFT",
    "/NP",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/XD",
    ...excludedDirectories,
    "/XF",
    ...SECRET_FILES,
  ];
}

async function runRobocopyDefault({ source, destination, profile, signal }) {
  const result = await runFixedChild({ file: "robocopy.exe", args: buildRobocopyArgs(source, destination, profile), signal });
  if (!robocopyExitCodeAccepted(result.code)) fail("robocopy_failed");
  return result;
}

async function runRecoveryWorkerDefault(operation, options, signal, runtimeCheckoutRoot) {
  if (signal?.aborted) fail("hpp_recovery_aborted");
  const workerRef = path.join(runtimeCheckoutRoot, "guild_hall", "backup_controller", "recovery_worker.mjs");
  const worker = new Worker(pathToFileURL(workerRef), { workerData: { operation, options } });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => {
      void worker.terminate().finally(() => finish(reject, new BackupControllerError("hpp_recovery_aborted")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (message) => finish(resolve, message));
    worker.once("error", (error) => finish(reject, error));
    worker.once("exit", (code) => {
      if (code !== 0) finish(reject, new BackupControllerError("hpp_recovery_worker_failed"));
    });
  });
}

function loadDefaultHppRecoveryAdapter(runtimeCheckoutRoot) {
  return Object.freeze({
    snapshot: (options) => runRecoveryWorkerDefault("snapshot", { ...options, signal: undefined, now: options.now.toISOString() }, options.signal, runtimeCheckoutRoot),
    verifyAnchored: (options) => runRecoveryWorkerDefault("verify_anchored", { ...options, signal: undefined }, options.signal, runtimeCheckoutRoot),
  });
}

async function readLatestStageReceipt(reportRoot, stageId) {
  const root = path.join(reportRoot, "backup-controller-receipts");
  const names = await readdir(root).catch(() => []);
  let latest = null;
  for (const name of names.filter((item) => /^backup-operation-[a-f0-9]{64}\.json$/.test(item))) {
    let receipt;
    try {
      receipt = validateExternalReceipt(JSON.parse(await readFile(path.join(root, name), "utf8")));
    } catch {
      continue;
    }
    if (receipt.stage_id === stageId && (!latest || receipt.completed_at > latest.completed_at)) latest = receipt;
  }
  return latest;
}

async function assertPlainFile(candidate, parent) {
  const info = await lstat(candidate);
  const physical = await realpath(candidate);
  if (!info.isFile() || info.isSymbolicLink() || path.resolve(candidate).toLowerCase() !== path.resolve(physical).toLowerCase() || !inside(parent, candidate)) fail("runtime_backup_artifact_unsafe");
}

async function findExistingRuntimeBackup(operationRoot) {
  const outDir = path.join(operationRoot, "db");
  const children = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  const manifests = [];
  for (const child of children) {
    if (!child.isDirectory() || child.isSymbolicLink()) continue;
    const manifestRef = path.join(outDir, child.name, "manifest.json");
    try {
      const manifest = JSON.parse(await readFile(manifestRef, "utf8"));
      if (manifest?.kind !== "runtime_db_backup_manifest" || manifest.quick_check !== "ok" || typeof manifest.backupPath !== "string" || !SHA256.test(manifest.sha256)) continue;
      await assertPlainFile(manifest.backupPath, outDir);
      manifests.push(manifest);
    } catch {
      // An incomplete operation is not reusable; the caller fails closed below.
    }
  }
  if (children.length > 0 && manifests.length !== 1) fail("runtime_backup_partial_or_ambiguous");
  return manifests[0] ?? null;
}

async function readStableHppCommit(backupRoot, operationKey) {
  const generationId = `bc-${operationKey.slice(-32)}`;
  const generationRoot = path.join(backupRoot, "generations", generationId);
  const commitRef = path.join(generationRoot, "COMMITTED.json");
  let bytes;
  try {
    bytes = await readFile(commitRef);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("hpp_snapshot_commit_read_failed");
  }
  await assertPlainFile(commitRef, generationRoot);
  let commit;
  try {
    commit = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("hpp_snapshot_commit_invalid");
  }
  const keys = commit && typeof commit === "object" && !Array.isArray(commit) ? Object.keys(commit).sort() : [];
  if (keys.join("\0") !== ["generation_id", "manifest_sha256", "schema_version"].sort().join("\0")
    || commit.schema_version !== "soulforge.ingress.recovery_commit.v1"
    || commit.generation_id !== generationId
    || !SHA256.test(commit.manifest_sha256)) fail("hpp_snapshot_commit_invalid");
  return commit;
}

async function copyLane(runRobocopy, source, destination, profile, signal) {
  const copied = await runRobocopy({ source, destination, profile, signal });
  if (!robocopyExitCodeAccepted(copied.code)) fail("robocopy_failed");
  return { status: "ok", robocopy_code: copied.code, output_sha256: sha256Bytes(`${copied.stdout ?? ""}\n${copied.stderr ?? ""}`) };
}

function receiptResult(external) {
  return { ok: true, receipt_at: external.receipt.completed_at, receipt_sha256: external.receipt_sha256, reused: true };
}

export function createFixedExecutorCatalog({
  approvalRef,
  hppRecoveryAdapter,
  runtimeOperation = runRuntimeWorkerDefault,
  runRobocopy = runRobocopyDefault,
  healthInspector = async (resource) => {
    const info = await stat(resource.path);
    return { exists: true, type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other" };
  },
  clock = () => new Date(),
} = {}) {
  if (typeof approvalRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/.test(approvalRef)) fail("executor_approval_ref_required");

  async function withReceipt(context, operation) {
    const store = createExternalReceiptStore(context.resources.nas_report_root.path);
    const acceptedFenceTokens = [context.fence_token, context.previous_fence_token].filter(Boolean);
    const existing = await store.read(context, { acceptedFenceTokens });
    if (existing) return receiptResult(existing);
    const result = await operation();
    if (context.signal?.aborted) fail("executor_aborted");
    const external = await store.write(context, result, clock());
    return { ...receiptResult(external), reused: false };
  }

  const executors = {
    hpp_snapshot_v1: (context) => withReceipt(context, async () => {
      const adapter = hppRecoveryAdapter ?? loadDefaultHppRecoveryAdapter(context.resources.runtime_checkout_root.path);
      if (context.signal?.aborted) fail("executor_aborted");
      const common = {
        source_root: context.resources.hpp_data_root.path,
        recovery_policy_path: context.resources.hpp_recovery_policy.path,
        expected_policy_sha256: context.resources.hpp_recovery_policy.sha256,
        backup_root: context.resources.nas_hpp_backup_root.path,
        restore_root: context.resources.hpp_restore_test_root.path,
        operation_key: context.operation_key,
        fence_token: context.fence_token,
        approval_ref: approvalRef,
        now: clock(),
        signal: context.signal,
      };
      const committed = await readStableHppCommit(common.backup_root, context.operation_key);
      const snapshot = committed
        ? await adapter.verifyAnchored({
          ...common,
          generation_id: committed.generation_id,
          expected_manifest_sha256: committed.manifest_sha256,
        })
        : await adapter.snapshot(common);
      if (context.signal?.aborted || snapshot?.ok !== true || !SHA256.test(snapshot.manifest_sha256)) fail("hpp_snapshot_failed");
      if (committed && (snapshot.manifest_sha256 !== committed.manifest_sha256 || Number(snapshot.writes_performed ?? 0) !== 0)) fail("hpp_snapshot_reuse_verification_failed");
      return {
        status: "ok",
        generation_id: snapshot.generation_id ?? committed?.generation_id,
        manifest_sha256: snapshot.manifest_sha256,
        source_digest: snapshot.source_digest,
        file_count: snapshot.file_count,
        reused_committed_generation: Boolean(committed),
      };
    }),

    erp_backup_v1: (context) => withReceipt(context, async () => {
      const operationRoot = path.join(context.resources.nas_erp_backup_root.path, context.operation_key);
      const outDir = path.join(operationRoot, "db");
      let database = await findExistingRuntimeBackup(operationRoot);
      if (!database) {
        await mkdir(outDir, { recursive: true });
        database = await runtimeOperation("backup_db", {
          dbPath: context.resources.erp_db_file.path,
          outDir,
          latestDir: null,
          tag: "scheduled",
          now: `${context.period_key}T00:00:00.000Z`,
        }, context.signal, context.resources.runtime_checkout_root.path);
      }
      if (database?.ok !== true || database.quick_check !== "ok" || !SHA256.test(database.sha256) || typeof database.backupPath !== "string") fail("erp_backup_failed");
      await assertPlainFile(database.backupPath, outDir);
      const verified = await runtimeOperation("restore_test", { backupPath: database.backupPath, nasRoot: null, reportDir: null }, context.signal, context.resources.runtime_checkout_root.path);
      if (verified?.ok !== true || verified.quick_check !== "ok" || verified.sha256 !== database.sha256) fail("erp_backup_verification_failed");
      const projectMetadata = await copyLane(runRobocopy, context.resources.project_metadata_root.path, path.join(operationRoot, "project_metadata"), "metadata", context.signal);
      const crossProjectState = await copyLane(runRobocopy, context.resources.cross_project_state_root.path, path.join(operationRoot, "cross_project_state"), "metadata", context.signal);
      return {
        status: "ok",
        database: { status: "ok", backup_sha256: database.sha256, bytes: database.backup_bytes, quick_check: verified.quick_check },
        project_metadata: projectMetadata,
        cross_project_state: crossProjectState,
      };
    }),

    workspace_copy_v1: (context) => withReceipt(context, async () => ({
      status: "ok",
      workspace: await copyLane(runRobocopy, context.resources.workspace_root.path, path.join(context.resources.nas_workspace_backup_root.path, context.operation_key, "workspace"), "workspace", context.signal),
    })),

    backup_health_v1: (context) => withReceipt(context, async () => {
      const lanes = {};
      for (const resourceId of ["nas_hpp_backup_root", "nas_workspace_backup_root", "nas_erp_backup_root", "nas_restore_root", "nas_report_root"]) {
        const observed = await healthInspector(context.resources[resourceId], context.signal);
        if (observed?.exists !== true || observed.type !== "directory") fail("backup_health_failed");
        lanes[resourceId] = "ok";
      }
      const hppReceipt = await readLatestStageReceipt(context.resources.nas_report_root.path, "hpp_snapshot");
      const erpReceipt = await readLatestStageReceipt(context.resources.nas_report_root.path, "erp_backup");
      if (hppReceipt?.period_key !== context.period_key || !SHA256.test(hppReceipt.result?.manifest_sha256)) fail("backup_health_hpp_receipt_missing");
      if (erpReceipt?.period_key !== context.period_key || !SHA256.test(erpReceipt.result?.database?.backup_sha256) || erpReceipt.result?.database?.quick_check !== "ok") fail("backup_health_erp_receipt_missing");
      return { status: "ok", lanes, current_receipts: { hpp_snapshot: "ok", erp_backup: "ok" } };
    }),

    isolated_restore_v1: (context) => withReceipt(context, async () => {
      const adapter = hppRecoveryAdapter ?? loadDefaultHppRecoveryAdapter(context.resources.runtime_checkout_root.path);
      const snapshotReceipt = await readLatestStageReceipt(context.resources.nas_report_root.path, "hpp_snapshot");
      const erpReceipt = await readLatestStageReceipt(context.resources.nas_report_root.path, "erp_backup");
      if (!snapshotReceipt
        || !SAFE_ID.test(snapshotReceipt.result?.generation_id ?? "")
        || !SHA256.test(snapshotReceipt.result?.manifest_sha256)
        || !erpReceipt) fail("restore_anchor_missing");
      const hpp = await adapter.verifyAnchored({
        backup_root: context.resources.nas_hpp_backup_root.path,
        generation_id: snapshotReceipt.result.generation_id,
        restore_root: context.resources.hpp_restore_test_root.path,
        recovery_policy_path: context.resources.hpp_recovery_policy.path,
        expected_policy_sha256: context.resources.hpp_recovery_policy.sha256,
        expected_manifest_sha256: snapshotReceipt.result.manifest_sha256,
        signal: context.signal,
      });
      if (hpp?.ok !== true || hpp.manifest_sha256 !== snapshotReceipt.result.manifest_sha256 || Number(hpp.writes_performed ?? 0) !== 0) fail("hpp_restore_verification_failed");
      const erpOperationRoot = path.join(context.resources.nas_erp_backup_root.path, erpReceipt.operation_key);
      const database = await findExistingRuntimeBackup(erpOperationRoot);
      if (!database) fail("erp_restore_anchor_missing");
      const erp = await runtimeOperation("restore_test", { backupPath: database.backupPath, nasRoot: null, reportDir: null }, context.signal, context.resources.runtime_checkout_root.path);
      if (erp?.ok !== true || erp.quick_check !== "ok" || erp.sha256 !== erpReceipt.result?.database?.backup_sha256) fail("erp_restore_verification_failed");
      return {
        status: "ok",
        hpp: { manifest_sha256: hpp.manifest_sha256, file_count: hpp.file_count, writes_performed: 0 },
        erp: { backup_sha256: erp.sha256, quick_check: erp.quick_check },
      };
    }),
  };

  const receiptReconciler = async (context) => {
    const store = createExternalReceiptStore(context.resources.nas_report_root.path);
    const external = await store.read(context, { acceptedFenceTokens: [context.expected_fence_token] });
    return external ? receiptResult(external) : null;
  };
  return Object.freeze({ executors: Object.freeze(executors), receiptReconciler });
}
