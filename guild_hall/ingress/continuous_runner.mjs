import {
  lstat,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { stageIngressFile } from "./collector.mjs";
import { syncCopyOnlyMirror } from "../voice_capture/copy_only_mirror.mjs";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const CONTINUOUS_BINDING_SCHEMA = "soulforge.ingress.continuous_binding.v1";
export const CONTINUOUS_HEALTH_SCHEMA = "soulforge.ingress.continuous_health.v1";
export const CONTINUOUS_RUN_RECEIPT_SCHEMA = "soulforge.ingress.continuous_run_receipt.v1";
export const CONTINUOUS_LEASE_SCHEMA = "soulforge.ingress.continuous_lease.v1";
export const CONTINUOUS_EPOCH_SCHEMA = "soulforge.ingress.continuous_epoch.v1";
export const CONTINUOUS_QUEUE_ACK_SCHEMA = "soulforge.ingress.continuous_queue_ack.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const LANE_VALUES = new Set(["team_files", "structured_pc_work", "run_logs"]);
const TOP_FIELDS = [
  "schema_version",
  "enabled",
  "scheduler_enabled",
  "node_id",
  "data_root",
  "poll_interval_seconds",
  "lease_ttl_seconds",
  "voice",
  "queues",
];
const VOICE_FIELDS = [
  "enabled",
  "source_root",
  "destination_root",
  "legacy_root",
  "state_root",
  "checkpoint_path",
  "receipt_root",
  "source_owner_ref",
  "lanes",
  "max_new_files",
  "max_new_bytes",
];
const QUEUE_FIELDS = [
  "binding_id",
  "enabled",
  "lane",
  "source_root",
  "ack_root",
  "source_owner_ref",
  "max_files_per_run",
  "max_bytes_per_run",
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function safeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function integerInRange(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
  return value;
}

function absolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value)) fail(code);
  return resolve(value);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNormalDirectory(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code);
  const physical = await realpath(path);
  if (comparable(physical) !== comparable(resolve(path))) fail(code);
  return physical;
}

async function assertNormalFile(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail(code);
  const physical = await realpath(path);
  if (comparable(physical) !== comparable(resolve(path))) fail(code);
  return physical;
}

async function ensureDirectoryChain(root, target, { create = false } = {}) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!inside(rootPath, targetPath)) fail("continuous_state_path_escape");
  await assertNormalDirectory(rootPath, "continuous_data_root_unsafe");
  let current = rootPath;
  for (const part of relative(rootPath, targetPath).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (!(await exists(current))) {
      if (!create) fail("continuous_state_directory_missing");
      try {
        await mkdir(current);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("continuous_state_directory_unsafe");
  }
}

async function atomicJson(root, path, payload) {
  const target = resolve(path);
  if (!inside(resolve(root), target)) fail("continuous_state_path_escape");
  await ensureDirectoryChain(root, dirname(target), { create: true });
  if (await exists(target)) {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) fail("continuous_state_target_unsafe");
  }
  const temporary = `${target}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readJson(path, code) {
  await assertNormalFile(path, code);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(code);
  }
}

function normalizeVoice(value, dataRoot) {
  exactFields(value, VOICE_FIELDS, "invalid_continuous_voice_binding");
  if (typeof value.enabled !== "boolean") fail("invalid_continuous_voice_binding");
  const result = {
    enabled: value.enabled,
    sourceRoot: absolutePath(value.source_root, "invalid_continuous_voice_binding"),
    destinationRoot: absolutePath(value.destination_root, "invalid_continuous_voice_binding"),
    legacyRoot: value.legacy_root === null ? null : absolutePath(value.legacy_root, "invalid_continuous_voice_binding"),
    stateRoot: absolutePath(value.state_root, "invalid_continuous_voice_binding"),
    checkpointPath: absolutePath(value.checkpoint_path, "invalid_continuous_voice_binding"),
    receiptRoot: absolutePath(value.receipt_root, "invalid_continuous_voice_binding"),
    sourceOwnerRef: safeId(value.source_owner_ref, "invalid_continuous_voice_binding"),
    lanes: Array.isArray(value.lanes) ? [...new Set(value.lanes.map((lane) => safeId(lane, "invalid_continuous_voice_binding")))].sort() : null,
    maxNewFiles: integerInRange(value.max_new_files, 1, 10000, "invalid_continuous_voice_binding"),
    maxNewBytes: integerInRange(value.max_new_bytes, 1, Number.MAX_SAFE_INTEGER, "invalid_continuous_voice_binding"),
  };
  if (!result.lanes?.length) fail("invalid_continuous_voice_binding");
  if (inside(dataRoot, result.sourceRoot) || !inside(dataRoot, result.destinationRoot)) {
    fail("invalid_continuous_voice_binding");
  }
  if (!inside(dataRoot, result.stateRoot)
    || !inside(result.stateRoot, result.checkpointPath)
    || !inside(result.stateRoot, result.receiptRoot)) fail("invalid_continuous_voice_binding");
  if (result.legacyRoot && !inside(result.destinationRoot, result.legacyRoot)) fail("invalid_continuous_voice_binding");
  return result;
}

function normalizeQueue(value, dataRoot) {
  exactFields(value, QUEUE_FIELDS, "invalid_continuous_queue_binding");
  if (typeof value.enabled !== "boolean" || !LANE_VALUES.has(value.lane)) fail("invalid_continuous_queue_binding");
  const result = {
    bindingId: safeId(value.binding_id, "invalid_continuous_queue_binding"),
    enabled: value.enabled,
    lane: value.lane,
    sourceRoot: absolutePath(value.source_root, "invalid_continuous_queue_binding"),
    ackRoot: absolutePath(value.ack_root, "invalid_continuous_queue_binding"),
    sourceOwnerRef: safeId(value.source_owner_ref, "invalid_continuous_queue_binding"),
    maxFilesPerRun: integerInRange(value.max_files_per_run, 1, 10000, "invalid_continuous_queue_binding"),
    maxBytesPerRun: integerInRange(value.max_bytes_per_run, 1, Number.MAX_SAFE_INTEGER, "invalid_continuous_queue_binding"),
  };
  if (inside(dataRoot, result.sourceRoot)) fail("continuous_queue_data_root_overlap");
  const outboxRoot = dirname(result.sourceRoot);
  if (inside(dataRoot, result.ackRoot)
    || !inside(outboxRoot, result.ackRoot)
    || inside(result.sourceRoot, result.ackRoot)) fail("continuous_queue_ack_root_invalid");
  return result;
}

export async function loadContinuousBinding(bindingPath) {
  const path = absolutePath(bindingPath, "continuous_binding_path_absolute_required");
  const raw = await readJson(path, "invalid_continuous_binding");
  exactFields(raw, TOP_FIELDS, "invalid_continuous_binding");
  if (raw.schema_version !== CONTINUOUS_BINDING_SCHEMA
    || typeof raw.enabled !== "boolean"
    || typeof raw.scheduler_enabled !== "boolean") {
    fail("invalid_continuous_binding");
  }
  const dataRoot = absolutePath(raw.data_root, "invalid_continuous_binding");
  const binding = {
    schemaVersion: CONTINUOUS_BINDING_SCHEMA,
    enabled: raw.enabled,
    schedulerEnabled: raw.scheduler_enabled,
    nodeId: safeId(raw.node_id, "invalid_continuous_binding"),
    dataRoot,
    pollIntervalSeconds: integerInRange(raw.poll_interval_seconds, 30, 86400, "invalid_continuous_binding"),
    leaseTtlSeconds: integerInRange(raw.lease_ttl_seconds, 60, 172800, "invalid_continuous_binding"),
    voice: normalizeVoice(raw.voice, dataRoot),
    queues: Array.isArray(raw.queues) ? raw.queues.map((queue) => normalizeQueue(queue, dataRoot)) : null,
  };
  if (!binding.queues || binding.leaseTtlSeconds < binding.pollIntervalSeconds * 2) fail("invalid_continuous_binding");
  const ids = binding.queues.map((queue) => queue.bindingId);
  if (new Set(ids).size !== ids.length) fail("duplicate_continuous_queue_binding");
  await assertNormalDirectory(binding.dataRoot, "continuous_data_root_unsafe");
  if (binding.voice.enabled) await assertNormalDirectory(binding.voice.sourceRoot, "continuous_voice_source_unsafe");
  for (const queue of binding.queues.filter((item) => item.enabled)) {
    await assertNormalDirectory(queue.sourceRoot, "continuous_queue_source_unsafe");
    await assertNormalDirectory(queue.ackRoot, "continuous_queue_ack_root_unsafe");
  }
  return binding;
}

async function readOptionalJson(path, fallback, code) {
  if (!(await exists(path))) return fallback;
  return readJson(path, code);
}

async function acquireLease(binding, nowMs) {
  const leaseRoot = resolve(binding.dataRoot, "state", "leases", "continuous_ingress");
  await ensureDirectoryChain(binding.dataRoot, leaseRoot, { create: true });
  const lockPath = resolve(leaseRoot, "active.lock.json");
  const epochPath = resolve(leaseRoot, "epoch.json");
  const token = randomUUID();
  const provisional = {
    schema_version: CONTINUOUS_LEASE_SCHEMA,
    node_id: binding.nodeId,
    lease_epoch: 0,
    fence_token: token,
    acquired_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + binding.leaseTtlSeconds * 1000).toISOString(),
  };
  let ownsLock = false;
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(provisional, null, 2)}\n`, "utf8");
    } finally {
      await handle.close();
    }
    ownsLock = true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const current = await readOptionalJson(lockPath, null, "continuous_lease_invalid");
    const expiry = Date.parse(current?.expires_at || "");
    if (!Number.isFinite(expiry) || expiry > nowMs) fail("continuous_lease_held");
    const stalePath = resolve(leaseRoot, `stale-${randomUUID()}.json`);
    try {
      await rename(lockPath, stalePath);
    } catch (renameError) {
      if (renameError?.code === "ENOENT") fail("continuous_lease_race");
      throw renameError;
    }
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(provisional, null, 2)}\n`, "utf8");
      } finally {
        await handle.close();
      }
      ownsLock = true;
    } catch {
      fail("continuous_lease_race");
    }
  }
  try {
    const epochRecord = await readOptionalJson(
      epochPath,
      { schema_version: CONTINUOUS_EPOCH_SCHEMA, last_epoch: 0 },
      "continuous_epoch_invalid",
    );
    if (epochRecord?.schema_version !== CONTINUOUS_EPOCH_SCHEMA
      || !Number.isSafeInteger(epochRecord.last_epoch)
      || epochRecord.last_epoch < 0) fail("continuous_epoch_invalid");
    const epoch = epochRecord.last_epoch + 1;
    await atomicJson(binding.dataRoot, epochPath, {
      schema_version: CONTINUOUS_EPOCH_SCHEMA,
      last_epoch: epoch,
      updated_at: new Date(nowMs).toISOString(),
    });
    const lease = { ...provisional, lease_epoch: epoch };
    await atomicJson(binding.dataRoot, lockPath, lease);
    return { leaseRoot, lockPath, epochPath, lease };
  } catch (error) {
    if (ownsLock) {
      try {
        const current = await readJson(lockPath, "continuous_lease_cleanup_invalid");
        if (current?.fence_token === token) await rm(lockPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") error.cleanup_error = cleanupError?.code || "continuous_lease_cleanup_failed";
      }
    }
    throw error;
  }
}

async function assertLeaseHeld(binding, leaseContext, nowMs) {
  const current = await readJson(leaseContext.lockPath, "continuous_lease_lost");
  if (current?.schema_version !== CONTINUOUS_LEASE_SCHEMA
    || current.node_id !== binding.nodeId
    || current.lease_epoch !== leaseContext.lease.lease_epoch
    || current.fence_token !== leaseContext.lease.fence_token
    || Date.parse(current.expires_at) <= nowMs) fail("continuous_lease_lost");
}

async function releaseLease(binding, leaseContext) {
  try {
    const current = await readJson(leaseContext.lockPath, "continuous_lease_lost");
    if (current.fence_token !== leaseContext.lease.fence_token
      || current.lease_epoch !== leaseContext.lease.lease_epoch) fail("continuous_lease_lost");
    await rm(leaseContext.lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

async function collectQueueFiles(queue) {
  const files = [];
  const stack = [queue.sourceRoot];
  let withheldLinks = 0;
  while (stack.length) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (!inside(queue.sourceRoot, path)) fail("continuous_queue_path_escape");
      const info = await lstat(path, { bigint: true });
      if (info.isSymbolicLink()) {
        withheldLinks += 1;
      } else if (info.isDirectory()) {
        stack.push(path);
      } else if (info.isFile()) {
        if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("continuous_queue_source_too_large");
        files.push({
          path,
          relativePath: relative(queue.sourceRoot, path).split(sep).join("/"),
          size: Number(info.size),
          mtimeNs: String(info.mtimeNs),
          ctimeNs: String(info.ctimeNs),
        });
      }
    }
  }
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { files, withheldLinks };
}

function queueSourceKey(queue, relativePath) {
  const directPayload = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,127})\.payload$/.exec(relativePath);
  if (directPayload) return directPayload[1];
  return createHash("sha256")
    .update("soulforge.ingress.continuous_source.v1\0", "utf8")
    .update(queue.bindingId, "utf8")
    .update("\0", "utf8")
    .update(relativePath, "utf8")
    .digest("hex");
}

const QUEUE_ACK_FIELDS = [
  "schema_version",
  "binding_id",
  "lane",
  "source_owner_ref",
  "source_key",
  "source_ref",
  "sha256",
  "size",
  "source_mtime_ns",
  "source_ctime_ns",
  "storage_ref",
  "receipt_ref",
  "checkpoint_ref",
  "server_node_id",
  "lease_epoch",
  "acknowledged_at",
  "source_deleted",
  "source_overwritten",
];

function exactObject(payload, expected, fields) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload).sort();
  const expectedKeys = [...fields].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && fields.every((field) => expected[field] === undefined || payload[field] === expected[field]);
}

function queueAckPath(queue, sourceKey) {
  const path = resolve(queue.ackRoot, `${sourceKey}.json`);
  if (!inside(queue.ackRoot, path)) fail("continuous_queue_ack_path_escape");
  return path;
}

async function readQueueAck(binding, queue, file, sourceKey) {
  const path = queueAckPath(queue, sourceKey);
  if (!(await exists(path))) return null;
  const ack = await readJson(path, "continuous_queue_ack_invalid");
  if (!exactObject(ack, {
    schema_version: CONTINUOUS_QUEUE_ACK_SCHEMA,
    binding_id: queue.bindingId,
    lane: queue.lane,
    source_owner_ref: queue.sourceOwnerRef,
    source_key: sourceKey,
    source_ref: file.relativePath,
    server_node_id: binding.nodeId,
    source_deleted: false,
    source_overwritten: false,
  }, QUEUE_ACK_FIELDS)
    || !/^[a-f0-9]{64}$/.test(ack.sha256)
    || !Number.isSafeInteger(ack.size)
    || ack.size < 0
    || ack.size !== file.size
    || ack.source_mtime_ns !== file.mtimeNs
    || ack.source_ctime_ns !== file.ctimeNs
    || !Number.isSafeInteger(ack.lease_epoch)
    || ack.lease_epoch < 1
    || !Number.isFinite(Date.parse(ack.acknowledged_at))) fail("continuous_queue_ack_invalid");
  return ack;
}

async function writeQueueAck(queue, sourceKey, ack) {
  const path = queueAckPath(queue, sourceKey);
  await ensureDirectoryChain(queue.ackRoot, dirname(path));
  const temporary = `${path}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(ack, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await link(temporary, path);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const current = await readJson(path, "continuous_queue_ack_invalid");
      if (!exactObject(current, ack, QUEUE_ACK_FIELDS)) fail("continuous_queue_ack_conflict");
      return false;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function processQueue(binding, queue, leaseContext, now, testHooks = {}) {
  const discovered = await collectQueueFiles(queue);
  const result = {
    binding_id: queue.bindingId,
    lane: queue.lane,
    discovered_files: discovered.files.length,
    processed_files: 0,
    processed_bytes: 0,
    staged_files: 0,
    unchanged_files: 0,
    acknowledged_files: 0,
    acknowledgements_written: 0,
    writes_performed: 0,
    withheld_links: discovered.withheldLinks,
    coverage_complete: true,
    gap_reasons: [],
  };
  for (const file of discovered.files) {
    const sourceKey = queueSourceKey(queue, file.relativePath);
    const existingAck = await readQueueAck(binding, queue, file, sourceKey);
    if (existingAck) {
      result.acknowledged_files += 1;
      continue;
    }
    if (result.processed_files >= queue.maxFilesPerRun) {
      result.coverage_complete = false;
      result.gap_reasons.push("file_limit_reached");
      break;
    }
    if (result.processed_bytes + file.size > queue.maxBytesPerRun) {
      result.coverage_complete = false;
      result.gap_reasons.push("byte_limit_reached");
      break;
    }
    await assertLeaseHeld(binding, leaseContext, now());
    const staged = await stageIngressFile({
      lane: queue.lane,
      source: file.path,
      sourceOwnerRef: queue.sourceOwnerRef,
      sourceKey,
      dataRoot: binding.dataRoot,
      apply: true,
    });
    result.processed_files += 1;
    result.processed_bytes += file.size;
    result.writes_performed += staged.writes_performed;
    if (staged.status === "unchanged") result.unchanged_files += 1;
    else result.staged_files += 1;
    if (typeof testHooks.afterQueueFile === "function") await testHooks.afterQueueFile({ queue, file, staged });
    await assertLeaseHeld(binding, leaseContext, now());
    const ack = {
      schema_version: CONTINUOUS_QUEUE_ACK_SCHEMA,
      binding_id: queue.bindingId,
      lane: queue.lane,
      source_owner_ref: queue.sourceOwnerRef,
      source_key: sourceKey,
      source_ref: file.relativePath,
      sha256: staged.sha256,
      size: staged.size,
      source_mtime_ns: file.mtimeNs,
      source_ctime_ns: file.ctimeNs,
      storage_ref: staged.storage_ref,
      receipt_ref: staged.receipt_ref,
      checkpoint_ref: staged.checkpoint_ref,
      server_node_id: binding.nodeId,
      lease_epoch: leaseContext.lease.lease_epoch,
      acknowledged_at: new Date(now()).toISOString(),
      source_deleted: false,
      source_overwritten: false,
    };
    if (await writeQueueAck(queue, sourceKey, ack)) {
      result.acknowledgements_written += 1;
      result.writes_performed += 1;
    }
    await assertLeaseHeld(binding, leaseContext, now());
  }
  if (result.withheld_links > 0) {
    result.coverage_complete = false;
    result.gap_reasons.push("source_links_withheld");
  }
  result.gap_reasons = [...new Set(result.gap_reasons)].sort();
  return result;
}

function runId(nodeId, epoch, startedAt) {
  return `${startedAt.replace(/[-:.]/g, "").replace("Z", "Z")}_${nodeId}_${String(epoch).padStart(8, "0")}`;
}

export async function runContinuousIngress(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const binding = await loadContinuousBinding(options.bindingPath);
  const checkedAt = new Date(now()).toISOString();
  if (options.apply !== true || !binding.enabled) {
    return {
      schema_version: CONTINUOUS_RUN_RECEIPT_SCHEMA,
      status: binding.enabled ? "dry_run_no_write" : "disabled_no_write",
      node_id: binding.nodeId,
      checked_at: checkedAt,
      voice_enabled: binding.voice.enabled,
      enabled_queue_count: binding.queues.filter((queue) => queue.enabled).length,
      writes_performed: 0,
      lease_acquired: false,
      continuous_scheduler_enabled: binding.schedulerEnabled,
    };
  }

  const leaseContext = await acquireLease(binding, now());
  const startedAt = new Date(now()).toISOString();
  const id = runId(binding.nodeId, leaseContext.lease.lease_epoch, startedAt);
  const queueResults = [];
  let voiceResult = null;
  let finalStatus = "ok";
  const errors = [];
  try {
    if (typeof options.testHooks?.afterLeaseAcquired === "function") {
      await options.testHooks.afterLeaseAcquired({ binding, leaseContext });
    }
    await assertLeaseHeld(binding, leaseContext, now());
    if (binding.voice.enabled) {
      try {
        voiceResult = await syncCopyOnlyMirror({
          sourceRoot: binding.voice.sourceRoot,
          destinationRoot: binding.voice.destinationRoot,
          legacyRoot: binding.voice.legacyRoot,
          stateRoot: binding.voice.stateRoot,
          checkpointPath: binding.voice.checkpointPath,
          receiptRoot: binding.voice.receiptRoot,
          sourceOwnerRef: binding.voice.sourceOwnerRef,
          lanes: binding.voice.lanes,
          maxNewFiles: binding.voice.maxNewFiles,
          maxNewBytes: binding.voice.maxNewBytes,
          assertFence: async (context) => {
            await assertLeaseHeld(binding, leaseContext, now());
            if (typeof options.testHooks?.onVoiceFence === "function") {
              await options.testHooks.onVoiceFence(context);
            }
          },
        });
        if (voiceResult.limit_reached) finalStatus = "degraded";
      } catch (error) {
        finalStatus = "degraded";
        errors.push({ binding_id: "voice", code: error?.code || "voice_collection_failed" });
      }
      await assertLeaseHeld(binding, leaseContext, now());
    }
    for (const queue of binding.queues.filter((item) => item.enabled)) {
      try {
        const result = await processQueue(binding, queue, leaseContext, now, options.testHooks);
        queueResults.push(result);
        if (!result.coverage_complete) finalStatus = "degraded";
      } catch (error) {
        finalStatus = "degraded";
        errors.push({ binding_id: queue.bindingId, code: error?.code || "queue_collection_failed" });
      }
      await assertLeaseHeld(binding, leaseContext, now());
    }
    const completedAt = new Date(now()).toISOString();
    const writesPerformed = queueResults.reduce((sum, result) => sum + result.writes_performed, 0)
      + Number(voiceResult?.copied_new || 0)
      + Number(voiceResult?.copied_version || 0)
      + Number(voiceResult?.receipts_written || 0);
    const receipt = {
      schema_version: CONTINUOUS_RUN_RECEIPT_SCHEMA,
      run_id: id,
      status: finalStatus,
      node_id: binding.nodeId,
      lease_epoch: leaseContext.lease.lease_epoch,
      started_at: startedAt,
      completed_at: completedAt,
      voice: voiceResult,
      queues: queueResults,
      errors,
      writes_performed: writesPerformed,
      source_deleted: false,
      source_overwritten: false,
      erp_written: false,
      mcp_written: false,
      project_promoted: false,
      mail_fetched: false,
      continuous_scheduler_enabled: binding.schedulerEnabled,
    };
    const receiptPath = resolve(binding.dataRoot, "state", "receipts", "continuous_ingress", `${id}.json`);
    await assertLeaseHeld(binding, leaseContext, now());
    await atomicJson(binding.dataRoot, receiptPath, receipt);
    const health = {
      schema_version: CONTINUOUS_HEALTH_SCHEMA,
      status: finalStatus,
      node_id: binding.nodeId,
      lease_epoch: leaseContext.lease.lease_epoch,
      observed_at: completedAt,
      last_run_id: id,
      voice_enabled: binding.voice.enabled,
      queue_count: binding.queues.filter((queue) => queue.enabled).length,
      gap_count: errors.length
        + queueResults.filter((result) => !result.coverage_complete).length
        + Number(Boolean(voiceResult?.limit_reached)),
      continuous_scheduler_enabled: binding.schedulerEnabled,
      mail_status: "credential_pending_off",
      erp_enabled: false,
      mcp_enabled: false,
      project_promoter_enabled: false,
    };
    const healthPath = resolve(binding.dataRoot, "state", "health", "continuous_ingress.json");
    await atomicJson(binding.dataRoot, healthPath, health);
    return receipt;
  } finally {
    await releaseLease(binding, leaseContext);
  }
}
