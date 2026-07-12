#!/usr/bin/env node

import { constants as fsConstants, promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";

import {
  FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
  FILE_OBSERVATION_PACKET_SCHEMA,
  FILE_RECONCILE_EVENT_SCHEMA,
  FILE_RECONCILE_RECEIPT_SCHEMA,
  FILE_REVISION_STATE_SCHEMA,
  FILE_REVISION_CHECKPOINT_SCHEMA,
  canonicalPacketDigest,
  durableReceiptIdFor,
  reconcileObservationPacketsWithArtifacts,
  restoreRevisionStateCheckpoint,
  scanWorkspace,
  validateDurableReceiptArtifact,
} from "./file_activity.mjs";

const FILE_ACTIVITY_JSON_BYTE_LIMITS = Object.freeze({
  scan_cache: 64 * 1024 * 1024,
  observation_packet: 64 * 1024 * 1024,
  receipt_partition: 64 * 1024 * 1024,
  event_partition: 64 * 1024 * 1024,
  life_tree_projection: 64 * 1024 * 1024,
  revision_state: 256 * 1024 * 1024,
  revision_checkpoint: 256 * 1024 * 1024,
});

const BOOLEAN_FLAGS = new Set(["binding-valid", "operational-primary", "write-outbox", "apply", "full", "json"]);
const FLAGS_BY_COMMAND = {
  scan: new Set([
    "repo-root",
    "project",
    "binding",
    "node",
    "node-role",
    "root",
    "binding-valid",
    "operational-primary",
    "write-outbox",
    "full",
    "observed-at",
    "ingested-at",
    "scan-id",
    "max-immediate-bytes",
    "byte-budget",
    "max-entries",
    "cache-ttl-ms",
    "json",
  ]),
  reconcile: new Set([
    "repo-root",
    "project",
    "binding",
    "node",
    "node-role",
    "binding-valid",
    "operational-primary",
    "apply",
    "packet",
    "state-ref",
    "absence-threshold",
    "deletion-grace-ms",
    "received-at",
    "json",
  ]),
  rebuild: new Set([
    "repo-root",
    "project",
    "binding",
    "node",
    "node-role",
    "binding-valid",
    "operational-primary",
    "apply",
    "checkpoint",
    "state-ref",
    "json",
  ]),
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "--help" || command === "help") {
    printUsage(0);
    return;
  }
  if (!FLAGS_BY_COMMAND[command]) {
    printUsage(1);
    return;
  }
  const args = parseArgs(rest, FLAGS_BY_COMMAND[command]);
  const repoRoot = path.resolve(String(args["repo-root"] ?? process.cwd()));
  const projectCode = requireArg(args, "project");
  const workspaceBindingId = requireArg(args, "binding");
  const nodeId = requireArg(args, "node");
  const nodeRole = requireArg(args, "node-role");
  assertSafeIdentifier(projectCode, "project");
  assertSafeIdentifier(workspaceBindingId, "binding");
  assertSafeIdentifier(nodeId, "node");
  if (!["work_pc", "tool_pc", "portable_dev_pc", "always_on_node"].includes(nodeRole)) {
    throw new Error("file_activity_node_role_invalid");
  }

  await assertProjectWorkmetaExists(repoRoot, projectCode);

  if (command === "scan") {
    await runScan({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args });
    return;
  }
  if (command === "reconcile") {
    await runReconcile({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args });
    return;
  }
  await runRebuild({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args });
}

async function runScan({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args }) {
  const rootPath = path.resolve(repoRoot, requireArg(args, "root"));
  const stateDirectory = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "local",
    "file_activity",
    projectCode,
    workspaceBindingId,
    nodeId,
  );
  const cachePath = path.join(stateDirectory, "scan_cache.json");
  const lockPath = path.join(stateDirectory, "scan.lock");

  const writeOutbox = args["write-outbox"] === true;
  const executeScan = async () => {
    await assertNoSymlinkPath(repoRoot, cachePath);
    let cacheReadReset = false;
    let previousCache = null;
    try {
      previousCache = await readJsonIfPresent(
        cachePath,
        "file_activity_scan_cache_read_failed",
        FILE_ACTIVITY_JSON_BYTE_LIMITS.scan_cache,
      );
    } catch (error) {
      if (args.full !== true) throw error;
      cacheReadReset = true;
    }
    const scanned = await scanWorkspace({
      projectCode,
      workspaceBindingId,
      nodeId,
      nodeRole,
      rootPath,
      bindingValid: args["binding-valid"] === true,
      operationalPrimary: args["operational-primary"] === true,
      observedAt: args["observed-at"],
      ingestedAt: args["ingested-at"],
      scanId: args["scan-id"],
      immediateHashBytes: optionalNumber(args["max-immediate-bytes"]),
      byteBudget: optionalNumber(args["byte-budget"]),
      maxEntries: optionalNumber(args["max-entries"]),
      verifiedHashTtlMs: optionalNumber(args["cache-ttl-ms"]),
      forceRehash: args.full === true,
      previousCache,
    });
    const packetRef = packetOutputRef(scanned.packet);
    const packetPath = resolveRepoRef(repoRoot, packetRef);
    const packet = { ...scanned.packet, packet_ref: packetRef };
    if (writeOutbox) {
      await assertNoSymlinkPath(repoRoot, packetPath);
      await assertNoSymlinkPath(repoRoot, cachePath);
      await writeJsonImmutable(
        packetPath,
        packet,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.observation_packet,
        "file_activity_packet_write_size_limit_exceeded",
      );
      await writeJsonAtomic(
        cachePath,
        scanned.next_cache,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.scan_cache,
        "file_activity_scan_cache_write_size_limit_exceeded",
      );
    }
    return {
      packet,
      packetRef,
      cacheChainState: cacheReadReset ? "reset_requires_rebinding" : scanned.cache_chain_state,
    };
  };
  const result = writeOutbox
    ? await withNodeLock(lockPath, executeScan)
    : await executeScan();

  printJson({
    schema_version: FILE_OBSERVATION_PACKET_SCHEMA,
    status: writeOutbox ? "written" : "dry_run_no_write",
    activation_state: "candidate_not_scheduled",
    write_outbox: writeOutbox,
    full_rehash: args.full === true,
    cache_chain_state: result.cacheChainState,
    scan_id: result.packet.scan_id,
    packet_ref: result.packetRef,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    node_id: nodeId,
    node_role: nodeRole,
    coverage: result.packet.coverage,
    counts: result.packet.counts,
    boundary: result.packet.boundary,
    side_effects: {
      packet_written: writeOutbox,
      cache_written: writeOutbox,
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  });
}

async function runReconcile({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args }) {
  const packetArgs = asArray(args.packet);
  if (packetArgs.length === 0) throw new Error("file_activity_packet_required");
  const allowedPacketRoot = path.resolve(
    repoRoot,
    "_workmeta",
    projectCode,
    "reports",
    "file_activity",
    "observations",
  );
  const packets = [];
  const durableDuplicates = [];
  for (const packetArg of packetArgs) {
    const packetPath = path.resolve(repoRoot, String(packetArg));
    assertContained(packetPath, allowedPacketRoot, "file_activity_packet_ref_outside_observation_root");
    await assertNoSymlinkPath(repoRoot, packetPath);
    const packet = await readJsonRequired(
      packetPath,
      "file_activity_packet_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.observation_packet,
    );
    const existingReceipt = await findDurableReceiptForPacket({
      repoRoot,
      projectCode,
      workspaceBindingId,
      packet,
    });
    if (existingReceipt) {
      durableDuplicates.push(existingReceipt);
    } else {
      packets.push(packet);
    }
  }

  const stateRef = mutableStateRef(args["state-ref"], projectCode);
  const statePath = resolveRepoRef(repoRoot, stateRef);
  const allowedStateRoot = path.resolve(repoRoot, "_workmeta", projectCode, "reports", "file_activity");
  assertContained(statePath, allowedStateRoot, "file_activity_state_ref_outside_project_root");
  const receivedAt = String(args["received-at"] ?? new Date().toISOString());

  if (durableDuplicates.length > 0 && packets.length === 0) {
    if (
      args["binding-valid"] !== true
      || args["operational-primary"] !== true
      || nodeRole !== "always_on_node"
    ) {
      throw new Error("file_activity_reconcile_requires_operational_primary_always_on_node");
    }
    await assertNoSymlinkPath(repoRoot, statePath);
    const previousState = await readJsonIfPresent(
      statePath,
      "file_activity_revision_state_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
    );
    if (!previousState) throw new Error("file_activity_durable_receipt_state_missing");
    const validated = reconcileObservationPacketsWithArtifacts({
      projectCode,
      workspaceBindingId,
      reconcilerNodeId: nodeId,
      reconcilerNodeRole: nodeRole,
      bindingValid: true,
      operationalPrimary: true,
      receivedAt,
      previousState,
      packets: [],
    });
    printJson({
      schema_version: FILE_REVISION_STATE_SCHEMA,
      status: "durable_receipt_duplicate_noop",
      activation_state: "candidate_not_scheduled",
      apply: args.apply === true,
      project_code: projectCode,
      workspace_binding_id: workspaceBindingId,
      state_ref: stateRef,
      counts: validated.state.counts,
      storage_bounds: validated.state.storage_bounds,
      durable_duplicate_count: durableDuplicates.length,
      receipt_ids: durableDuplicates.map((entry) => entry.receipt_id).sort(),
      side_effects: {
        state_written: false,
        receipt_partition_written: false,
        event_partition_written: false,
        checkpoint_written: false,
        life_tree_projection_written: false,
        live_scheduler_enabled: false,
        transport_enabled: false,
      },
    });
    return;
  }
  const lockPath = path.join(
    repoRoot,
    "guild_hall",
    "state",
    "local",
    "file_activity",
    projectCode,
    workspaceBindingId,
    nodeId,
    "reconcile.lock",
  );

  const apply = args.apply === true;
  const executeReconcile = async () => {
    await assertNoSymlinkPath(repoRoot, statePath);
    const previousState = await readJsonIfPresent(
      statePath,
      "file_activity_revision_state_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
    );
    const reconciled = reconcileObservationPacketsWithArtifacts({
      projectCode,
      workspaceBindingId,
      reconcilerNodeId: nodeId,
      reconcilerNodeRole: nodeRole,
      bindingValid: args["binding-valid"] === true,
      operationalPrimary: args["operational-primary"] === true,
      receivedAt,
      previousState,
      packets,
      absenceThreshold: optionalNumber(args["absence-threshold"]),
      deletionGraceMs: optionalNumber(args["deletion-grace-ms"]),
    });
    if (apply) {
      const artifactPaths = {
        receipts: reconciled.artifacts.refs.receipt_refs.map((ref) => resolveRepoRef(repoRoot, ref)),
        event: resolveRepoRef(repoRoot, reconciled.artifacts.refs.event_ref),
        checkpoint: resolveRepoRef(repoRoot, reconciled.artifacts.refs.checkpoint_ref),
        projection: resolveRepoRef(repoRoot, reconciled.artifacts.refs.projection_ref),
      };
      for (const artifactPath of [...artifactPaths.receipts, artifactPaths.event, artifactPaths.checkpoint, artifactPaths.projection]) {
        assertContained(artifactPath, allowedStateRoot, "file_activity_artifact_ref_outside_project_root");
        await assertNoSymlinkPath(repoRoot, artifactPath);
      }
      await assertNoSymlinkPath(repoRoot, statePath);
      for (const artifact of reconciled.artifacts.receipt_artifacts) {
        serializeJsonWithinLimit(
          artifact.value,
          FILE_ACTIVITY_JSON_BYTE_LIMITS.receipt_partition,
          "file_activity_receipt_partition_write_size_limit_exceeded",
        );
      }
      serializeJsonWithinLimit(
        reconciled.artifacts.event_partition,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.event_partition,
        "file_activity_event_partition_write_size_limit_exceeded",
      );
      serializeJsonWithinLimit(
        reconciled.artifacts.checkpoint,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_checkpoint,
        "file_activity_revision_checkpoint_write_size_limit_exceeded",
      );
      serializeJsonWithinLimit(
        reconciled.artifacts.projection,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.life_tree_projection,
        "file_activity_life_tree_projection_write_size_limit_exceeded",
      );
      serializeJsonWithinLimit(
        reconciled.state,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
        "file_activity_revision_state_write_size_limit_exceeded",
      );
      for (let index = 0; index < reconciled.artifacts.receipt_artifacts.length; index += 1) {
        await assertJsonImmutableCompatible(
          artifactPaths.receipts[index],
          reconciled.artifacts.receipt_artifacts[index].value,
          FILE_ACTIVITY_JSON_BYTE_LIMITS.receipt_partition,
          "file_activity_receipt_partition_write_size_limit_exceeded",
        );
      }
      await assertJsonImmutableCompatible(
        artifactPaths.event,
        reconciled.artifacts.event_partition,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.event_partition,
        "file_activity_event_partition_write_size_limit_exceeded",
      );
      await assertJsonImmutableCompatible(
        artifactPaths.checkpoint,
        reconciled.artifacts.checkpoint,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_checkpoint,
        "file_activity_revision_checkpoint_write_size_limit_exceeded",
      );
      await writeJsonImmutableIdempotent(
        artifactPaths.event,
        reconciled.artifacts.event_partition,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.event_partition,
        "file_activity_event_partition_write_size_limit_exceeded",
      );
      await writeJsonImmutableIdempotent(
        artifactPaths.checkpoint,
        reconciled.artifacts.checkpoint,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_checkpoint,
        "file_activity_revision_checkpoint_write_size_limit_exceeded",
      );
      await writeJsonAtomic(
        statePath,
        reconciled.state,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
        "file_activity_revision_state_write_size_limit_exceeded",
      );
      await writeJsonAtomic(
        artifactPaths.projection,
        reconciled.artifacts.projection,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.life_tree_projection,
        "file_activity_life_tree_projection_write_size_limit_exceeded",
      );
      // Durable receipts are the terminal commit markers. They are published only
      // after every immutable artifact and both mutable consumers are durable.
      for (let index = 0; index < reconciled.artifacts.receipt_artifacts.length; index += 1) {
        await writeJsonImmutableIdempotent(
          artifactPaths.receipts[index],
          reconciled.artifacts.receipt_artifacts[index].value,
          FILE_ACTIVITY_JSON_BYTE_LIMITS.receipt_partition,
          "file_activity_receipt_partition_write_size_limit_exceeded",
        );
      }
    }
    return reconciled;
  };
  const reconciled = apply
    ? await withNodeLock(lockPath, executeReconcile)
    : await executeReconcile();
  const { state, artifacts } = reconciled;

  printJson({
    schema_version: FILE_REVISION_STATE_SCHEMA,
    status: apply ? "written" : "dry_run_no_write",
    activation_state: "candidate_not_scheduled",
    apply,
    state_ref: stateRef,
    reconcile_id: artifacts.reconcile_id,
    artifact_refs: artifacts.refs,
    artifact_schemas: {
      receipt: FILE_RECONCILE_RECEIPT_SCHEMA,
      event: FILE_RECONCILE_EVENT_SCHEMA,
      checkpoint: FILE_REVISION_CHECKPOINT_SCHEMA,
      projection: FILE_ACTIVITY_LIFE_TREE_PROJECTION_SCHEMA,
    },
    durable_duplicate_count: durableDuplicates.length,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    reconciler: state.reconciler,
    counts: state.counts,
    boundary: state.boundary,
    side_effects: {
      state_written: apply,
      receipt_partition_written: apply,
      event_partition_written: apply,
      checkpoint_written: apply,
      life_tree_projection_written: apply,
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  });
}

async function runRebuild({ repoRoot, projectCode, workspaceBindingId, nodeId, nodeRole, args }) {
  if (
    args["binding-valid"] !== true
    || args["operational-primary"] !== true
    || nodeRole !== "always_on_node"
  ) {
    throw new Error("file_activity_rebuild_requires_operational_primary_always_on_node");
  }
  const checkpointRef = normalizeProjectArtifactRef(
    requireArg(args, "checkpoint"),
    projectCode,
    "checkpoints",
    "file_activity_checkpoint_ref_invalid",
  );
  const checkpointPath = resolveRepoRef(repoRoot, checkpointRef);
  const checkpointRoot = path.resolve(repoRoot, "_workmeta", projectCode, "reports", "file_activity", "checkpoints");
  assertContained(checkpointPath, checkpointRoot, "file_activity_checkpoint_ref_outside_checkpoint_root");
  await assertNoSymlinkPath(repoRoot, checkpointPath);
  const checkpoint = await readJsonRequired(
    checkpointPath,
    "file_activity_revision_checkpoint_read_failed",
    FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_checkpoint,
  );
  const state = restoreRevisionStateCheckpoint(checkpoint, {
    projectCode,
    workspaceBindingId,
    reconcilerNodeId: nodeId,
  });
  const stateRef = mutableStateRef(args["state-ref"], projectCode);
  const statePath = resolveRepoRef(repoRoot, stateRef);
  const allowedStateRoot = path.resolve(repoRoot, "_workmeta", projectCode, "reports", "file_activity");
  assertContained(statePath, allowedStateRoot, "file_activity_state_ref_outside_project_root");
  const apply = args.apply === true;
  if (apply) {
    const lockPath = path.join(
      repoRoot,
      "guild_hall",
      "state",
      "local",
      "file_activity",
      projectCode,
      workspaceBindingId,
      nodeId,
      "reconcile.lock",
    );
    await withNodeLock(lockPath, async () => {
      await assertNoSymlinkPath(repoRoot, statePath);
      await writeJsonAtomic(
        statePath,
        state,
        FILE_ACTIVITY_JSON_BYTE_LIMITS.revision_state,
        "file_activity_revision_state_write_size_limit_exceeded",
      );
    });
  }
  printJson({
    schema_version: FILE_REVISION_STATE_SCHEMA,
    checkpoint_schema_version: FILE_REVISION_CHECKPOINT_SCHEMA,
    status: apply ? "rebuilt_from_checkpoint" : "dry_run_rebuild_no_write",
    activation_state: "candidate_not_scheduled",
    apply,
    checkpoint_ref: checkpointRef,
    checkpoint_id: checkpoint.checkpoint_id,
    state_ref: stateRef,
    project_code: projectCode,
    workspace_binding_id: workspaceBindingId,
    reconciler: state.reconciler,
    counts: state.counts,
    storage_bounds: state.storage_bounds,
    boundary: state.boundary,
    side_effects: {
      state_written: apply,
      live_scheduler_enabled: false,
      transport_enabled: false,
    },
  });
}

export async function withNodeLock(lockPath, callback) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await fs.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("file_activity_node_lock_busy");
    throw new Error("file_activity_node_lock_failed");
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() })}\n`, "utf8");
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true }).catch(() => {});
  }
}

async function writeJsonAtomic(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  } catch {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new Error("file_activity_atomic_state_write_failed");
  }
}

async function writeJsonImmutable(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await fs.link(temporaryPath, filePath);
    await fs.rm(temporaryPath, { force: true });
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (error?.code === "EEXIST") throw new Error("file_activity_immutable_packet_exists");
    throw new Error("file_activity_atomic_packet_write_failed");
  }
}

async function writeJsonImmutableIdempotent(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  const existing = await readTextIfPresent(filePath, maxBytes);
  if (existing !== null) {
    if (existing === serialized) return;
    throw new Error("file_activity_immutable_artifact_conflict");
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${randomBytes(8).toString("hex")}`;
  try {
    await fs.writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
    await fs.link(temporaryPath, filePath);
    await fs.rm(temporaryPath, { force: true });
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (error?.code === "EEXIST") {
      const racedExisting = await readTextIfPresent(filePath, maxBytes);
      if (racedExisting === serialized) return;
      throw new Error("file_activity_immutable_artifact_conflict");
    }
    throw new Error("file_activity_atomic_artifact_write_failed");
  }
}

async function assertJsonImmutableCompatible(filePath, value, maxBytes, sizeErrorCode) {
  const serialized = serializeJsonWithinLimit(value, maxBytes, sizeErrorCode);
  const existing = await readTextIfPresent(filePath, maxBytes);
  if (existing !== null && existing !== serialized) {
    throw new Error("file_activity_immutable_artifact_conflict");
  }
}

async function readTextIfPresent(filePath, maxBytes) {
  let fileStat;
  try {
    fileStat = await fs.lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("file_activity_immutable_artifact_read_failed");
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > maxBytes) {
    throw new Error("file_activity_immutable_artifact_read_failed");
  }
  const raw = await fs.readFile(filePath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new Error("file_activity_immutable_artifact_read_failed");
  }
  return raw;
}

async function readJsonIfPresent(filePath, errorCode, maxBytes) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
  } catch {
    return null;
  }
  return readJsonRequired(filePath, errorCode, maxBytes);
}

async function readJsonRequired(filePath, errorCode, maxBytes) {
  let fileStat;
  try {
    fileStat = await fs.lstat(filePath);
  } catch {
    throw new Error(errorCode);
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > maxBytes) {
    throw new Error(`${errorCode}_size_limit_exceeded`);
  }
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw new Error(`${errorCode}_size_limit_exceeded`);
    }
    return JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch (error) {
    if (error?.message === `${errorCode}_size_limit_exceeded`) throw error;
    throw new Error(errorCode);
  }
}

function serializeJsonWithinLimit(value, maxBytes, errorCode) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) throw new Error(errorCode);
  return serialized;
}

async function assertProjectWorkmetaExists(repoRoot, projectCode) {
  const projectRoot = path.resolve(repoRoot, "_workmeta", projectCode);
  await assertNoSymlinkPath(repoRoot, projectRoot);
  try {
    const stat = await fs.lstat(projectRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
  } catch {
    throw new Error("file_activity_project_workmeta_missing");
  }
}

async function findDurableReceiptForPacket({ repoRoot, projectCode, workspaceBindingId, packet }) {
  const receiptId = durableReceiptIdFor({
    projectCode,
    workspaceBindingId,
    scanId: packet?.scan_id,
  });
  const receiptRoot = path.resolve(repoRoot, "_workmeta", projectCode, "reports", "file_activity", "receipts");
  await assertNoSymlinkPath(repoRoot, receiptRoot);
  let monthEntries;
  try {
    monthEntries = await fs.readdir(receiptRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("file_activity_durable_receipt_partition_read_failed");
  }
  if (monthEntries.length > 240) throw new Error("file_activity_durable_receipt_month_limit_exceeded");
  const receiptFileName = `${receiptId.slice("receipt:".length)}.json`;
  const matches = [];
  for (const entry of monthEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}$/u.test(entry.name)) {
      throw new Error("file_activity_durable_receipt_partition_layout_invalid");
    }
    const candidatePath = path.join(receiptRoot, entry.name, receiptFileName);
    const raw = await readJsonIfPresent(
      candidatePath,
      "file_activity_durable_receipt_read_failed",
      FILE_ACTIVITY_JSON_BYTE_LIMITS.receipt_partition,
    );
    if (!raw) continue;
    matches.push(validateDurableReceiptArtifact(raw, { projectCode, workspaceBindingId }));
  }
  if (matches.length > 1) throw new Error("file_activity_durable_receipt_duplicate_partition_conflict");
  if (matches.length === 0) return null;
  const receipt = matches[0];
  const packetDigest = canonicalPacketDigest(packet);
  if (receipt.packet_digest !== packetDigest) throw new Error("file_activity_scan_digest_conflict");
  if (
    receipt.scan_id !== packet.scan_id
    || receipt.node_id !== packet.node_id
    || receipt.node_role !== packet.node_role
    || receipt.node_sequence !== packet.node_sequence
    || receipt.packet_observed_at !== packet.observed_at
    || receipt.packet_ingested_at !== packet.ingested_at
  ) {
    throw new Error("file_activity_durable_receipt_packet_mismatch");
  }
  return receipt;
}

function mutableStateRef(value, projectCode) {
  const leaf = value === undefined
    ? "revision_state.json"
    : String(value).replace(`_workmeta/${projectCode}/reports/file_activity/`, "");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/u.test(leaf)
    || leaf.includes("..")
    || String(value ?? "").includes("\\")
  ) {
    throw new Error("file_activity_state_ref_invalid");
  }
  return `_workmeta/${projectCode}/reports/file_activity/${leaf}`;
}

function normalizeProjectArtifactRef(value, projectCode, partition, errorCode) {
  const normalized = String(value).normalize("NFC");
  const prefix = `_workmeta/${projectCode}/reports/file_activity/${partition}/`;
  const suffix = normalized.slice(prefix.length);
  if (
    !normalized.startsWith(prefix)
    || normalized.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(normalized)
    || !/^\d{4}-\d{2}\/[a-f0-9]{64}\.json$/u.test(suffix)
  ) {
    throw new Error(errorCode);
  }
  return normalized;
}

async function assertNoSymlinkPath(rootPath, candidatePath) {
  assertContained(candidatePath, rootPath, "file_activity_write_ref_outside_project_root");
  const relative = path.relative(rootPath, candidatePath);
  let current = rootPath;
  for (const segment of [null, ...relative.split(path.sep).filter(Boolean)]) {
    if (segment !== null) current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error("file_activity_write_symlink_path_blocked");
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (error?.message === "file_activity_write_symlink_path_blocked") throw error;
      throw new Error("file_activity_write_path_check_failed");
    }
  }
}

function packetOutputRef(packet) {
  const ingested = new Date(packet.ingested_at);
  const year = String(ingested.getUTCFullYear());
  const month = String(ingested.getUTCMonth() + 1).padStart(2, "0");
  const stamp = packet.ingested_at.replace(/[-:.TZ]/gu, "").slice(0, 14);
  const scanSuffix = createHash("sha256").update(packet.scan_id, "utf8").digest("hex").slice(0, 24);
  return `_workmeta/${packet.project_code}/reports/file_activity/observations/${packet.node_id}/${year}/${month}/${stamp}_${scanSuffix}.json`;
}

function resolveRepoRef(repoRoot, ref) {
  const resolved = path.resolve(repoRoot, ref);
  assertContained(resolved, repoRoot, "file_activity_ref_outside_repo");
  return resolved;
}

function assertContained(candidatePath, rootPath, errorCode) {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(errorCode);
}

function parseArgs(argv, allowedFlags) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error("file_activity_unexpected_argument");
    const equalsAt = token.indexOf("=");
    const key = token.slice(2, equalsAt === -1 ? undefined : equalsAt);
    if (!allowedFlags.has(key)) throw new Error(`file_activity_unknown_flag_${key}`);
    let value;
    if (equalsAt !== -1) {
      value = token.slice(equalsAt + 1);
    } else if (BOOLEAN_FLAGS.has(key)) {
      value = true;
    } else {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`file_activity_flag_value_required_${key}`);
      value = next;
      index += 1;
    }
    if (args[key] === undefined) args[key] = value;
    else if (Array.isArray(args[key])) args[key].push(value);
    else args[key] = [args[key], value];
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (value === undefined || value === true || Array.isArray(value)) {
    throw new Error(`file_activity_required_${key}`);
  }
  return String(value);
}

function assertSafeIdentifier(value, field) {
  const normalized = String(value).normalize("NFC");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized)) {
    throw new Error(`file_activity_${field}_invalid`);
  }
}

function optionalNumber(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || value === true || value === "") throw new Error("file_activity_numeric_flag_invalid");
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("file_activity_numeric_flag_invalid");
  return number;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(exitCode) {
  const lines = [
    "Usage:",
    "  node guild_hall/file_activity/cli.mjs scan --project <code> --binding <id> --node <id> --node-role <role> --root <dir> --binding-valid [--operational-primary] [--write-outbox] [--full] [--cache-ttl-ms <=86400000] [limits/times]",
    "  node guild_hall/file_activity/cli.mjs reconcile --project <code> --binding <id> --node <id> --node-role always_on_node --binding-valid --operational-primary --packet <_workmeta/...json>... [--apply] [--received-at <UTC>] [--state-ref <leaf.json>]",
    "  node guild_hall/file_activity/cli.mjs rebuild --project <code> --binding <id> --node <id> --node-role always_on_node --binding-valid --operational-primary --checkpoint <_workmeta/.../checkpoints/YYYY-MM/id.json> [--apply] [--state-ref <leaf.json>]",
    "",
    "Roles: work_pc | tool_pc | portable_dev_pc | always_on_node",
    "Dry-run is the default. --write-outbox writes an immutable packet/cache; reconcile --apply writes partitions/checkpoint/projection/state; rebuild --apply restores checkpoint state only.",
    "Durable metadata stays below _workmeta/<project>/reports/file_activity/**; local locks/cache stay below guild_hall/state/local/file_activity/**.",
    "The always-on operational primary is the sole revision-state reconciler.",
    "Checkpoint rebuild does not replay a tail and is not graph compaction; use the latest reviewed checkpoint only.",
    "ERP input_upload events are a separate authoritative adapter and are not scanner observations.",
    "This CLI is an activation candidate only; it does not install a scheduler, watcher, or transport.",
  ];
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${lines.join("\n")}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "file_activity_failed"}\n`);
  process.exitCode = 1;
});
