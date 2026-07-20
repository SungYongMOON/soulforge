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
import { hostname } from "node:os";
import { stageIngressFile } from "./collector.mjs";
import {
  MAIL_BRIDGE_TIMEOUT_MS,
  runMailBridge,
  sanitizedMailFailure,
} from "./mail_bridge.mjs";
import { acquireWriterLease, validateWriterLease } from "./writer_authority.mjs";
import { syncCopyOnlyMirror } from "../voice_capture/copy_only_mirror.mjs";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const CONTINUOUS_BINDING_SCHEMA = "soulforge.ingress.continuous_binding.v1";
export const CONTINUOUS_BINDING_SCHEMA_V2 = "soulforge.ingress.continuous_binding.v2";
export const CONTINUOUS_HEALTH_SCHEMA = "soulforge.ingress.continuous_health.v1";
export const CONTINUOUS_HEALTH_SCHEMA_V2 = "soulforge.ingress.continuous_health.v2";
export const CONTINUOUS_RUN_RECEIPT_SCHEMA = "soulforge.ingress.continuous_run_receipt.v1";
export const CONTINUOUS_RUN_RECEIPT_SCHEMA_V2 = "soulforge.ingress.continuous_run_receipt.v2";
export const CONTINUOUS_LEASE_SCHEMA = "soulforge.ingress.continuous_lease.v1";
export const CONTINUOUS_EPOCH_SCHEMA = "soulforge.ingress.continuous_epoch.v1";
export const CONTINUOUS_QUEUE_ACK_SCHEMA = "soulforge.ingress.continuous_queue_ack.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const LANE_VALUES = new Set(["team_files", "structured_pc_work", "run_logs"]);
const AUTHORITY_LANE_ORDER = ["mail", "voice", "structured_pc_work", "team_files", "run_logs"];
const AUTHORITY_MODES = new Set(["primary", "fallback"]);
const MAIL_LEASE_MARGIN_MS = 60 * 1000;
const TOP_FIELDS_V1 = [
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
const TOP_FIELDS_V2 = [
  ...TOP_FIELDS_V1,
  "writer_authority_record_path",
  "writer_mode",
  "mail",
];
const MAIL_FIELDS = [
  "enabled",
  "python_executable",
  "team_cli_path",
  "team_cli_sha256",
  "collector_tree_sha256",
  "register_path",
  "register_sha256",
  "private_config_root",
  "limit",
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
const CONTINUOUS_LEASE_FIELDS = [
  "schema_version",
  "node_id",
  "owner_host",
  "owner_pid",
  "lease_epoch",
  "fence_token",
  "acquired_at",
  "expires_at",
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

function sha256(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function hostIdentity(value, code) {
  if (typeof value !== "string"
    || value.length < 1
    || value.length > 255
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)) fail(code);
  return value;
}

function ownerPid(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(code);
  return value;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function validateContinuousLease(value, code = "continuous_lease_invalid") {
  exactFields(value, CONTINUOUS_LEASE_FIELDS, code);
  if (value.schema_version !== CONTINUOUS_LEASE_SCHEMA
    || !Number.isSafeInteger(value.lease_epoch)
    || value.lease_epoch < 0
    || typeof value.fence_token !== "string"
    || !/^[A-Za-z0-9_.-]{1,128}$/.test(value.fence_token)) fail(code);
  safeId(value.node_id, code);
  hostIdentity(value.owner_host, code);
  ownerPid(value.owner_pid, code);
  const acquiredAt = Date.parse(value.acquired_at);
  const expiresAt = Date.parse(value.expires_at);
  if (!Number.isFinite(acquiredAt) || !Number.isFinite(expiresAt) || expiresAt <= acquiredAt) fail(code);
  return value;
}

function fileIdentity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    birthtimeNs: String(info.birthtimeNs),
  };
}

function sameFileIdentity(left, right) {
  return left?.dev === right?.dev
    && left?.ino === right?.ino
    && left?.birthtimeNs === right?.birthtimeNs;
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

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
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

async function atomicJson(root, path, payload, assertFence = async () => {}, fenceContext = null) {
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
    await assertFence(fenceContext);
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

function stableReadIdentity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    size: String(info.size),
    mtimeNs: String(info.mtimeNs),
    ctimeNs: String(info.ctimeNs),
    birthtimeNs: String(info.birthtimeNs),
  };
}

function sameStableReadIdentity(left, right) {
  return ["dev", "ino", "size", "mtimeNs", "ctimeNs", "birthtimeNs"]
    .every((field) => left?.[field] === right?.[field]);
}

async function readStableBinding(path, testHooks = {}) {
  await assertNormalFile(path, "invalid_continuous_binding");
  const before = await lstat(path, { bigint: true });
  const beforeIdentity = stableReadIdentity(before);
  const handle = await open(path, "r");
  let openedIdentity;
  let bytes;
  try {
    const opened = await handle.stat({ bigint: true });
    openedIdentity = stableReadIdentity(opened);
    if (!opened.isFile() || !sameStableReadIdentity(beforeIdentity, openedIdentity)) {
      fail("continuous_binding_unstable");
    }
    if (typeof testHooks.afterBindingOpened === "function") {
      await testHooks.afterBindingOpened({ path });
    }
    bytes = await handle.readFile();
    const afterRead = stableReadIdentity(await handle.stat({ bigint: true }));
    if (!sameStableReadIdentity(openedIdentity, afterRead)) fail("continuous_binding_unstable");
  } finally {
    await handle.close();
  }
  await assertNormalFile(path, "continuous_binding_unstable");
  const afterPath = stableReadIdentity(await lstat(path, { bigint: true }));
  if (!sameStableReadIdentity(beforeIdentity, afterPath)
    || !sameStableReadIdentity(openedIdentity, afterPath)) {
    fail("continuous_binding_unstable");
  }
  return bytes;
}

function normalizeBindingDigest(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) fail("continuous_binding_digest_required");
    return null;
  }
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    fail("continuous_binding_digest_invalid");
  }
  return value;
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

function normalizeOptionalAbsolutePath(value, code) {
  if (value === null) return null;
  return absolutePath(value, code);
}

function normalizeMail(value, dataRoot) {
  exactFields(value, MAIL_FIELDS, "invalid_continuous_mail_binding");
  if (typeof value.enabled !== "boolean") fail("invalid_continuous_mail_binding");
  const result = {
    enabled: value.enabled,
    pythonExecutable: normalizeOptionalAbsolutePath(value.python_executable, "invalid_continuous_mail_binding"),
    teamCliPath: normalizeOptionalAbsolutePath(value.team_cli_path, "invalid_continuous_mail_binding"),
    teamCliSha256: value.team_cli_sha256 === null
      ? null
      : sha256(value.team_cli_sha256, "invalid_continuous_mail_binding"),
    collectorTreeSha256: value.collector_tree_sha256 === null
      ? null
      : sha256(value.collector_tree_sha256, "invalid_continuous_mail_binding"),
    registerPath: normalizeOptionalAbsolutePath(value.register_path, "invalid_continuous_mail_binding"),
    registerSha256: value.register_sha256 === null
      ? null
      : sha256(value.register_sha256, "invalid_continuous_mail_binding"),
    privateConfigRoot: normalizeOptionalAbsolutePath(value.private_config_root, "invalid_continuous_mail_binding"),
    limit: integerInRange(value.limit, 1, 1000, "invalid_continuous_mail_binding"),
    dataRoot,
  };
  if (result.enabled && [
    result.pythonExecutable,
    result.teamCliPath,
    result.teamCliSha256,
    result.collectorTreeSha256,
    result.registerPath,
    result.registerSha256,
    result.privateConfigRoot,
  ].some((item) => item === null)) fail("invalid_continuous_mail_binding");
  if (result.privateConfigRoot !== null) {
    if (comparable(result.privateConfigRoot) !== comparable(resolve(dataRoot, "config"))) {
      fail("continuous_mail_private_config_root_mismatch");
    }
    if (result.registerPath !== null && !inside(result.privateConfigRoot, result.registerPath)) {
      fail("continuous_mail_register_outside_private_config");
    }
  }
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

export async function loadContinuousBinding(bindingPath, options = {}) {
  const path = absolutePath(bindingPath, "continuous_binding_path_absolute_required");
  const expectedDigest = normalizeBindingDigest(options.bindingDigest);
  const bytes = await readStableBinding(path, options.testHooks);
  const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (expectedDigest !== null && actualDigest !== expectedDigest) {
    fail("continuous_binding_digest_mismatch");
  }
  let raw;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid_continuous_binding");
  }
  const isV1 = raw?.schema_version === CONTINUOUS_BINDING_SCHEMA;
  const isV2 = raw?.schema_version === CONTINUOUS_BINDING_SCHEMA_V2;
  if (!isV1 && !isV2) fail("invalid_continuous_binding");
  exactFields(raw, isV2 ? TOP_FIELDS_V2 : TOP_FIELDS_V1, "invalid_continuous_binding");
  if (typeof raw.enabled !== "boolean" || typeof raw.scheduler_enabled !== "boolean") {
    fail("invalid_continuous_binding");
  }
  const dataRoot = absolutePath(raw.data_root, "invalid_continuous_binding");
  const writerAuthorityRecordPath = isV2
    ? absolutePath(raw.writer_authority_record_path, "invalid_continuous_binding")
    : null;
  if (writerAuthorityRecordPath
    && (writerAuthorityRecordPath === dataRoot || !inside(dataRoot, writerAuthorityRecordPath))) {
    fail("continuous_writer_authority_path_invalid");
  }
  const binding = {
    bindingDigest: actualDigest,
    schemaVersion: raw.schema_version,
    enabled: raw.enabled,
    schedulerEnabled: raw.scheduler_enabled,
    nodeId: safeId(raw.node_id, "invalid_continuous_binding"),
    dataRoot,
    pollIntervalSeconds: integerInRange(raw.poll_interval_seconds, 30, 86400, "invalid_continuous_binding"),
    leaseTtlSeconds: integerInRange(raw.lease_ttl_seconds, 60, 172800, "invalid_continuous_binding"),
    voice: normalizeVoice(raw.voice, dataRoot),
    queues: Array.isArray(raw.queues) ? raw.queues.map((queue) => normalizeQueue(queue, dataRoot)) : null,
  };
  if (isV2) {
    binding.writerAuthorityRecordPath = writerAuthorityRecordPath;
    if (!AUTHORITY_MODES.has(raw.writer_mode)) fail("invalid_continuous_binding");
    binding.writerMode = raw.writer_mode;
    binding.mail = normalizeMail(raw.mail, dataRoot);
  }
  if (!binding.queues || binding.leaseTtlSeconds < binding.pollIntervalSeconds * 2) fail("invalid_continuous_binding");
  if (isV2
    && binding.mail.enabled
    && binding.leaseTtlSeconds * 1000 < MAIL_BRIDGE_TIMEOUT_MS + MAIL_LEASE_MARGIN_MS) {
    fail("continuous_mail_lease_ttl_too_short");
  }
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

function isV2Binding(binding) {
  return binding.schemaVersion === CONTINUOUS_BINDING_SCHEMA_V2;
}

function enabledHistoryLanes(binding) {
  if (!isV2Binding(binding)) return [];
  const enabled = new Set();
  if (binding.mail.enabled) enabled.add("mail");
  if (binding.voice.enabled) enabled.add("voice");
  for (const queue of binding.queues.filter((item) => item.enabled)) enabled.add(queue.lane);
  return AUTHORITY_LANE_ORDER.filter((lane) => enabled.has(lane));
}

function authorityOptions(binding, lane, nowMs) {
  return {
    stateRoot: binding.dataRoot,
    recordPath: binding.writerAuthorityRecordPath,
    nodeId: binding.nodeId,
    lane,
    mode: binding.writerMode,
    now: nowMs,
  };
}

async function acquireAuthorityContext(binding, now) {
  const leases = new Map();
  let summary = null;
  for (const lane of enabledHistoryLanes(binding)) {
    const lease = await acquireWriterLease(authorityOptions(binding, lane, now()));
    const validation = await validateWriterLease({
      ...authorityOptions(binding, lane, now()),
      lease,
      phase: "before_payload",
    });
    const current = {
      epoch: validation.epoch,
      digest: validation.authority_digest,
      nodeId: validation.node_id,
      mode: validation.authority_mode,
    };
    if (summary && (summary.epoch !== current.epoch
      || summary.digest !== current.digest
      || summary.nodeId !== current.nodeId
      || summary.mode !== current.mode)) fail("continuous_writer_authority_snapshot_changed");
    summary = current;
    leases.set(lane, lease);
  }
  if (binding.mail.enabled) {
    const mailLease = leases.get("mail");
    if (!mailLease
      || Date.parse(mailLease.expires_at) - now() < MAIL_BRIDGE_TIMEOUT_MS + MAIL_LEASE_MARGIN_MS) {
      fail("continuous_mail_authority_window_too_short");
    }
  }
  return { leases, summary };
}

async function validateAuthorityLane(binding, authorityContext, lane, phase, now) {
  if (!isV2Binding(binding)) return null;
  const lease = authorityContext?.leases.get(lane);
  if (!lease) fail("continuous_writer_authority_lease_missing");
  const validation = await validateWriterLease({
    ...authorityOptions(binding, lane, now()),
    lease,
    phase,
  });
  const summary = authorityContext.summary;
  if (!summary
    || validation.epoch !== summary.epoch
    || validation.authority_digest !== summary.digest
    || validation.node_id !== summary.nodeId
    || validation.authority_mode !== summary.mode) fail("continuous_writer_authority_snapshot_changed");
  return validation;
}

async function validateAllAuthorityLanes(binding, authorityContext, phase, now) {
  for (const lane of enabledHistoryLanes(binding)) {
    await validateAuthorityLane(binding, authorityContext, lane, phase, now);
  }
}

async function readOptionalJson(path, fallback, code) {
  if (!(await exists(path))) return fallback;
  return readJson(path, code);
}

async function inspectContinuousLease(path, code = "continuous_lease_invalid") {
  await assertNormalFile(path, code);
  const identity = fileIdentity(await lstat(path, { bigint: true }));
  let lease;
  try {
    lease = validateContinuousLease(JSON.parse(await readFile(path, "utf8")), code);
  } catch (error) {
    if (error?.code) throw error;
    fail(code);
  }
  return { lease, identity };
}

async function removeContinuousPathWithIdentity(path, identity, { missingOk = false } = {}) {
  const info = await optionalLstat(path);
  if (!info) {
    if (missingOk) return false;
    fail("continuous_lease_lost");
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("continuous_lease_invalid");
  const current = fileIdentity(await lstat(path, { bigint: true }));
  if (!sameFileIdentity(current, identity)) fail("continuous_lease_lost");
  await rm(path);
  return true;
}

async function createContinuousLeaseCandidate(lockPath, lease) {
  const temporary = `${lockPath}.candidate-${randomUUID()}`;
  let handle;
  let identity;
  try {
    handle = await open(temporary, "wx");
    identity = fileIdentity(await handle.stat({ bigint: true }));
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    const candidate = await inspectContinuousLease(temporary);
    if (candidate.lease.fence_token !== lease.fence_token) fail("continuous_lease_invalid");
    return { temporary, ...candidate };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (identity) {
      await removeContinuousPathWithIdentity(temporary, identity, { missingOk: true }).catch(() => {});
    }
    throw error;
  }
}

async function publishContinuousLease(lockPath, lease) {
  const candidate = await createContinuousLeaseCandidate(lockPath, lease);
  try {
    try {
      await link(candidate.temporary, lockPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      return null;
    }
    const installed = await inspectContinuousLease(lockPath);
    if (installed.lease.fence_token !== lease.fence_token
      || !sameFileIdentity(installed.identity, candidate.identity)) fail("continuous_lease_lost");
    return installed;
  } finally {
    await removeContinuousPathWithIdentity(candidate.temporary, candidate.identity, { missingOk: true });
  }
}

function assertRecoverableContinuousOwner(lease, nowMs) {
  if (Date.parse(lease.expires_at) > nowMs) fail("continuous_lease_held");
  if (lease.owner_host !== hostIdentity(hostname(), "continuous_lease_invalid")) {
    fail("continuous_lease_remote_owner");
  }
  if (processIsAlive(lease.owner_pid)) fail("continuous_lease_held");
}

async function recoverExpiredContinuousLease(paths, nowMs) {
  let observed = null;
  if (await optionalLstat(paths.lockPath)) observed = await inspectContinuousLease(paths.lockPath);
  let marker;
  if (!(await optionalLstat(paths.recoveryPath))) {
    if (!observed) fail("continuous_lease_race");
    assertRecoverableContinuousOwner(observed.lease, nowMs);
    try {
      await link(paths.lockPath, paths.recoveryPath);
    } catch (error) {
      if (!new Set(["EEXIST", "ENOENT"]).has(error?.code)) throw error;
    }
  }
  marker = await inspectContinuousLease(paths.recoveryPath);
  assertRecoverableContinuousOwner(marker.lease, nowMs);
  if (observed && (!sameFileIdentity(marker.identity, observed.identity)
    || marker.lease.fence_token !== observed.lease.fence_token)) fail("continuous_lease_race");

  const staleId = createHash("sha256").update(marker.lease.fence_token, "utf8").digest("hex").slice(0, 24);
  const stalePath = resolve(paths.leaseRoot, `stale-${staleId}.json`);
  if (await optionalLstat(stalePath)) {
    const stale = await inspectContinuousLease(stalePath);
    if (!sameFileIdentity(stale.identity, marker.identity)) fail("continuous_lease_race");
  } else {
    try {
      await link(paths.recoveryPath, stalePath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const stale = await inspectContinuousLease(stalePath);
    if (!sameFileIdentity(stale.identity, marker.identity)) fail("continuous_lease_race");
  }

  if (await optionalLstat(paths.lockPath)) {
    const current = await inspectContinuousLease(paths.lockPath);
    if (!sameFileIdentity(current.identity, marker.identity)
      || current.lease.fence_token !== marker.lease.fence_token) {
      await removeContinuousPathWithIdentity(paths.recoveryPath, marker.identity, { missingOk: true });
      fail("continuous_lease_race");
    }
    await removeContinuousPathWithIdentity(paths.lockPath, marker.identity);
  }
  return marker;
}

async function acquireLease(binding, nowMs) {
  const leaseRoot = resolve(binding.dataRoot, "state", "leases", "continuous_ingress");
  await ensureDirectoryChain(binding.dataRoot, leaseRoot, { create: true });
  const lockPath = resolve(leaseRoot, "active.lock.json");
  const recoveryPath = resolve(leaseRoot, "active.lock.json.recovery");
  const epochPath = resolve(leaseRoot, "epoch.json");
  const token = randomUUID();
  const provisional = validateContinuousLease({
    schema_version: CONTINUOUS_LEASE_SCHEMA,
    node_id: binding.nodeId,
    owner_host: hostIdentity(hostname(), "continuous_lease_invalid"),
    owner_pid: process.pid,
    lease_epoch: 0,
    fence_token: token,
    acquired_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + binding.leaseTtlSeconds * 1000).toISOString(),
  });
  const paths = { leaseRoot, lockPath, recoveryPath, epochPath };
  let ownsLock = false;
  let recoveryMarker = null;
  try {
    if (await optionalLstat(recoveryPath)) {
      recoveryMarker = await recoverExpiredContinuousLease(paths, nowMs);
    }
    let installed = await publishContinuousLease(lockPath, provisional);
    if (!installed) {
      recoveryMarker = await recoverExpiredContinuousLease(paths, nowMs);
      installed = await publishContinuousLease(lockPath, provisional);
      if (!installed) fail("continuous_lease_race");
    }
    if (recoveryMarker) {
      await removeContinuousPathWithIdentity(recoveryPath, recoveryMarker.identity, { missingOk: true });
    } else if (await optionalLstat(recoveryPath)) {
      const marker = await inspectContinuousLease(recoveryPath);
      await removeContinuousPathWithIdentity(lockPath, installed.identity, { missingOk: true });
      if (sameFileIdentity(marker.identity, installed.identity)) {
        await removeContinuousPathWithIdentity(recoveryPath, marker.identity, { missingOk: true });
      }
      fail("continuous_lease_race");
    }
    ownsLock = true;
  } catch (error) {
    throw error;
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
    const lease = validateContinuousLease({ ...provisional, lease_epoch: epoch });
    await atomicJson(binding.dataRoot, lockPath, lease);
    const installed = await inspectContinuousLease(lockPath);
    if (installed.lease.fence_token !== lease.fence_token) fail("continuous_lease_lost");
    return { leaseRoot, lockPath, recoveryPath, epochPath, lease, lockIdentity: installed.identity };
  } catch (error) {
    if (ownsLock) {
      try {
        const current = await inspectContinuousLease(lockPath, "continuous_lease_cleanup_invalid");
        if (current.lease.fence_token === token
          && current.lease.owner_host === provisional.owner_host
          && current.lease.owner_pid === provisional.owner_pid) {
          await removeContinuousPathWithIdentity(lockPath, current.identity, { missingOk: true });
        }
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") error.cleanup_error = cleanupError?.code || "continuous_lease_cleanup_failed";
      }
    }
    throw error;
  }
}

async function assertLeaseHeld(binding, leaseContext, nowMs) {
  const current = await inspectContinuousLease(leaseContext.lockPath, "continuous_lease_lost");
  if (current.lease.node_id !== binding.nodeId
    || current.lease.owner_host !== leaseContext.lease.owner_host
    || current.lease.owner_pid !== leaseContext.lease.owner_pid
    || current.lease.lease_epoch !== leaseContext.lease.lease_epoch
    || current.lease.fence_token !== leaseContext.lease.fence_token
    || Date.parse(current.lease.expires_at) <= nowMs) fail("continuous_lease_lost");
}

async function assertLaneFences(binding, leaseContext, authorityContext, lane, phase, now) {
  await assertLeaseHeld(binding, leaseContext, now());
  await validateAuthorityLane(binding, authorityContext, lane, phase, now);
}

async function assertFinalLanePublication(
  binding,
  leaseContext,
  authorityContext,
  lane,
  now,
  testHook,
  context,
) {
  await assertLaneFences(binding, leaseContext, authorityContext, lane, "before_payload", now);
  if (typeof testHook === "function") await testHook(context);
  await assertLaneFences(binding, leaseContext, authorityContext, lane, "after_payload", now);
}

async function assertFinalRunPublication(binding, leaseContext, authorityContext, now, testHook, context) {
  await assertLeaseHeld(binding, leaseContext, now());
  await validateAllAuthorityLanes(binding, authorityContext, "before_payload", now);
  if (typeof testHook === "function") await testHook(context);
  await assertLeaseHeld(binding, leaseContext, now());
  await validateAllAuthorityLanes(binding, authorityContext, "after_payload", now);
}

async function releaseLease(binding, leaseContext) {
  try {
    if (await optionalLstat(leaseContext.recoveryPath)) fail("continuous_lease_lost");
    const current = await inspectContinuousLease(leaseContext.lockPath, "continuous_lease_lost");
    if (current.lease.fence_token !== leaseContext.lease.fence_token
      || current.lease.owner_host !== leaseContext.lease.owner_host
      || current.lease.owner_pid !== leaseContext.lease.owner_pid
      || current.lease.lease_epoch !== leaseContext.lease.lease_epoch) fail("continuous_lease_lost");
    await removeContinuousPathWithIdentity(leaseContext.lockPath, current.identity);
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

async function writeQueueAck(queue, sourceKey, ack, assertFence) {
  const path = queueAckPath(queue, sourceKey);
  await ensureDirectoryChain(queue.ackRoot, dirname(path));
  const temporary = `${path}.partial-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(ack, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await assertFence({
        phase: "before_queue_ack_publish",
        artifact: "queue_ack",
        source_key: sourceKey,
        target: path,
      });
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

async function processQueue(binding, queue, leaseContext, authorityContext, now, testHooks = {}) {
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
  const assertQueuePublication = async (context) => assertFinalLanePublication(
    binding,
    leaseContext,
    authorityContext,
    queue.lane,
    now,
    testHooks.onQueueFence,
    context,
  );
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
    await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "before_payload", now);
    const staged = await stageIngressFile({
      lane: queue.lane,
      source: file.path,
      sourceOwnerRef: queue.sourceOwnerRef,
      sourceKey,
      dataRoot: binding.dataRoot,
      apply: true,
      assertFence: assertQueuePublication,
    });
    result.processed_files += 1;
    result.processed_bytes += file.size;
    result.writes_performed += staged.writes_performed;
    if (staged.status === "unchanged") result.unchanged_files += 1;
    else result.staged_files += 1;
    if (typeof testHooks.afterQueueFile === "function") await testHooks.afterQueueFile({ queue, file, staged });
    await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "after_payload", now);
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
    await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "before_payload", now);
    if (await writeQueueAck(queue, sourceKey, ack, assertQueuePublication)) {
      result.acknowledgements_written += 1;
      result.writes_performed += 1;
    }
    await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "after_payload", now);
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

function fencingError(error) {
  const code = String(error?.code || "");
  return code === "continuous_lease_lost"
    || code.startsWith("writer_authority_")
    || code.startsWith("continuous_writer_authority_");
}

function disabledMailResult() {
  return {
    ...sanitizedMailFailure("mail_disabled"),
    status: "disabled",
    error_codes: [],
  };
}

function authorityReceiptFields(binding, authorityContext) {
  if (!isV2Binding(binding)) return {};
  return {
    writer_authority_epoch: authorityContext.summary?.epoch ?? null,
    writer_authority_digest: authorityContext.summary?.digest ?? null,
    writer_authority_node_id: authorityContext.summary?.nodeId ?? null,
    writer_authority_mode: authorityContext.summary?.mode ?? null,
  };
}

export async function runContinuousIngress(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const bindingDigest = normalizeBindingDigest(options.bindingDigest, { required: options.apply === true });
  const binding = await loadContinuousBinding(options.bindingPath, {
    bindingDigest,
    testHooks: options.testHooks,
  });
  const checkedAt = new Date(now()).toISOString();
  if (options.apply !== true || !binding.enabled) {
    const result = {
      schema_version: isV2Binding(binding) ? CONTINUOUS_RUN_RECEIPT_SCHEMA_V2 : CONTINUOUS_RUN_RECEIPT_SCHEMA,
      status: binding.enabled ? "dry_run_no_write" : "disabled_no_write",
      node_id: binding.nodeId,
      checked_at: checkedAt,
      voice_enabled: binding.voice.enabled,
      enabled_queue_count: binding.queues.filter((queue) => queue.enabled).length,
      writes_performed: 0,
      lease_acquired: false,
      continuous_scheduler_enabled: binding.schedulerEnabled,
      config_digest: binding.bindingDigest,
    };
    if (isV2Binding(binding)) {
      Object.assign(result, {
        mail_enabled: binding.mail.enabled,
        writer_authority_epoch: null,
        writer_authority_digest: null,
        writer_authority_node_id: null,
        writer_authority_mode: null,
      });
    }
    return result;
  }

  const leaseContext = await acquireLease(binding, now());
  const startedAt = new Date(now()).toISOString();
  const id = runId(binding.nodeId, leaseContext.lease.lease_epoch, startedAt);
  const queueResults = [];
  let mailResult = isV2Binding(binding) ? disabledMailResult() : null;
  let voiceResult = null;
  let finalStatus = "ok";
  const errors = [];
  let authorityContext = { leases: new Map(), summary: null };
  try {
    if (isV2Binding(binding)) authorityContext = await acquireAuthorityContext(binding, now);
    if (typeof options.testHooks?.afterLeaseAcquired === "function") {
      await options.testHooks.afterLeaseAcquired({ binding, leaseContext, authorityContext });
    }
    await assertLeaseHeld(binding, leaseContext, now());
    await validateAllAuthorityLanes(binding, authorityContext, "before_payload", now);
    if (isV2Binding(binding) && binding.mail.enabled) {
      await assertLaneFences(binding, leaseContext, authorityContext, "mail", "before_payload", now);
      try {
        mailResult = await runMailBridge(binding.mail, { executor: options.mailExecutor });
        if (mailResult.status !== "ok") {
          finalStatus = "degraded";
          for (const code of mailResult.error_codes) errors.push({ binding_id: "mail", code });
        }
      } catch (error) {
        if (fencingError(error)) throw error;
        const code = error?.code || "mail_collection_failed";
        mailResult = sanitizedMailFailure(code);
        finalStatus = "degraded";
        errors.push({ binding_id: "mail", code });
      }
      await assertLaneFences(binding, leaseContext, authorityContext, "mail", "after_payload", now);
    }
    if (binding.voice.enabled) {
      await assertLaneFences(binding, leaseContext, authorityContext, "voice", "before_payload", now);
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
            await assertFinalLanePublication(
              binding,
              leaseContext,
              authorityContext,
              "voice",
              now,
              options.testHooks?.onVoiceFence,
              context,
            );
          },
        });
        if (voiceResult.limit_reached) finalStatus = "degraded";
      } catch (error) {
        if (fencingError(error)) throw error;
        finalStatus = "degraded";
        errors.push({ binding_id: "voice", code: error?.code || "voice_collection_failed" });
      }
      await assertLaneFences(binding, leaseContext, authorityContext, "voice", "after_payload", now);
    }
    for (const queue of binding.queues.filter((item) => item.enabled)) {
      await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "before_payload", now);
      try {
        const result = await processQueue(
          binding,
          queue,
          leaseContext,
          authorityContext,
          now,
          options.testHooks,
        );
        queueResults.push(result);
        if (!result.coverage_complete) finalStatus = "degraded";
      } catch (error) {
        if (fencingError(error)) throw error;
        finalStatus = "degraded";
        errors.push({ binding_id: queue.bindingId, code: error?.code || "queue_collection_failed" });
      }
      await assertLaneFences(binding, leaseContext, authorityContext, queue.lane, "after_payload", now);
    }
    const completedAt = new Date(now()).toISOString();
    const writesPerformedLowerBound = queueResults.reduce((sum, result) => sum + result.writes_performed, 0)
      + Number(voiceResult?.copied_new || 0)
      + Number(voiceResult?.copied_version || 0)
      + Number(voiceResult?.receipts_written || 0)
      + Number(mailResult?.total_new_events || 0);
    const writesPerformedExact = !isV2Binding(binding) || mailResult?.write_count_known !== false;
    const receipt = {
      schema_version: isV2Binding(binding) ? CONTINUOUS_RUN_RECEIPT_SCHEMA_V2 : CONTINUOUS_RUN_RECEIPT_SCHEMA,
      run_id: id,
      status: finalStatus,
      node_id: binding.nodeId,
      lease_epoch: leaseContext.lease.lease_epoch,
      ...authorityReceiptFields(binding, authorityContext),
      started_at: startedAt,
      completed_at: completedAt,
      ...(isV2Binding(binding) ? { mail: mailResult } : {}),
      voice: voiceResult,
      queues: queueResults,
      errors,
      writes_performed: writesPerformedExact ? writesPerformedLowerBound : null,
      ...(isV2Binding(binding) ? {
        writes_performed_lower_bound: writesPerformedLowerBound,
        writes_performed_exact: writesPerformedExact,
      } : {}),
      source_deleted: false,
      source_overwritten: false,
      erp_written: false,
      mcp_written: false,
      project_promoted: false,
      mail_fetched: Boolean(mailResult?.spawned),
      continuous_scheduler_enabled: binding.schedulerEnabled,
    };
    const receiptPath = resolve(binding.dataRoot, "state", "receipts", "continuous_ingress", `${id}.json`);
    await assertLeaseHeld(binding, leaseContext, now());
    await validateAllAuthorityLanes(binding, authorityContext, "after_payload", now);
    await atomicJson(
      binding.dataRoot,
      receiptPath,
      receipt,
      (context) => assertFinalRunPublication(
        binding,
        leaseContext,
        authorityContext,
        now,
        options.testHooks?.onRunMetadataFence,
        context,
      ),
      { phase: "before_run_receipt_publish", artifact: "run_receipt", target: receiptPath },
    );
    await assertLeaseHeld(binding, leaseContext, now());
    await validateAllAuthorityLanes(binding, authorityContext, "after_payload", now);
    const health = {
      schema_version: isV2Binding(binding) ? CONTINUOUS_HEALTH_SCHEMA_V2 : CONTINUOUS_HEALTH_SCHEMA,
      status: finalStatus,
      node_id: binding.nodeId,
      lease_epoch: leaseContext.lease.lease_epoch,
      ...authorityReceiptFields(binding, authorityContext),
      observed_at: completedAt,
      last_run_id: id,
      voice_enabled: binding.voice.enabled,
      queue_count: binding.queues.filter((queue) => queue.enabled).length,
      gap_count: errors.length
        + queueResults.filter((result) => !result.coverage_complete).length
        + Number(Boolean(voiceResult?.limit_reached)),
      continuous_scheduler_enabled: binding.schedulerEnabled,
      mail_status: isV2Binding(binding) ? mailResult.status : "credential_pending_off",
      ...(isV2Binding(binding) ? {
        mail_enabled: binding.mail.enabled,
        mail_write_count_known: mailResult.write_count_known,
      } : {}),
      erp_enabled: false,
      mcp_enabled: false,
      project_promoter_enabled: false,
    };
    const healthPath = resolve(binding.dataRoot, "state", "health", "continuous_ingress.json");
    await assertLeaseHeld(binding, leaseContext, now());
    await validateAllAuthorityLanes(binding, authorityContext, "after_payload", now);
    await atomicJson(
      binding.dataRoot,
      healthPath,
      health,
      (context) => assertFinalRunPublication(
        binding,
        leaseContext,
        authorityContext,
        now,
        options.testHooks?.onRunMetadataFence,
        context,
      ),
      { phase: "before_health_publish", artifact: "health", target: healthPath },
    );
    await assertLeaseHeld(binding, leaseContext, now());
    await validateAllAuthorityLanes(binding, authorityContext, "after_payload", now);
    return receipt;
  } finally {
    await releaseLease(binding, leaseContext);
  }
}
