import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  link,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const WRITER_AUTHORITY_SCHEMA = "soulforge.ingress.writer_authority.v1";
export const WRITER_LEASE_SCHEMA = "soulforge.ingress.writer_lease.v1";
export const WRITER_AUTHORITY_RESULT_SCHEMA = "soulforge.ingress.writer_authority_result.v1";
export const WRITER_AUTHORITY_CAS_LOCK_SCHEMA = "soulforge.ingress.writer_authority_cas_lock.v1";
export const WRITER_AUTHORITY_CAS_LOCK_TTL_MS = 60 * 1000;
export const WRITER_AUTHORITY_ID = "task-engine-hpp-production-ingress";
export const WRITER_AUTHORITY_SCOPE = "raw_ingress_custody_only";
export const WRITER_AUTHORITY_ABSENT_DIGEST = "0".repeat(64);
export const WRITER_AUTHORITY_LANES = Object.freeze([
  "mail",
  "voice",
  "structured_pc_work",
  "team_files",
  "run_logs",
]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ACTIVE_MODES = new Set(["primary", "fallback"]);
const MODES = new Set(["off", ...ACTIVE_MODES]);
const TRANSITIONS = new Set(["initialize", "freeze", "revoke", "promote", "failback"]);
const RECORD_FIELDS = [
  "schema_version",
  "authority_id",
  "authority_scope",
  "epoch",
  "transition",
  "mode",
  "node_id",
  "primary_node_id",
  "fallback_node_id",
  "lanes",
  "not_before",
  "expires_at",
  "owner_approval_ref",
  "previous_digest",
  "revoked_digest",
  "revoked_epoch",
  "revoked_mode",
  "revoked_node_id",
  "request_digest",
  "record_digest",
];
const LEASE_FIELDS = [
  "schema_version",
  "authority_id",
  "authority_scope",
  "authority_digest",
  "epoch",
  "mode",
  "node_id",
  "lane",
  "not_before",
  "expires_at",
  "lease_digest",
];
const LOCK_FIELDS = [
  "schema_version",
  "token",
  "created_at",
  "expires_at",
  "owner_host",
  "owner_pid",
  "identity",
];
const LOCK_IDENTITY_FIELDS = ["dev", "ino", "birthtime_ns"];
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
const CONTINUOUS_LEASE_SCHEMA = "soulforge.ingress.continuous_lease.v1";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactFields(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
}

function safeId(value, code = "writer_authority_invalid_node") {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function sha256Digest(value, code = "writer_authority_invalid_digest") {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function utcTimestamp(value, code = "writer_authority_invalid_timestamp") {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function ownerApprovalRef(value) {
  if (typeof value !== "string"
    || value.length < 1
    || value.length > 512
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)) fail("writer_authority_invalid_owner_approval_ref");
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

function assertExpiredLocalDeadOwner(owner, nowMs, codes) {
  if (Date.parse(owner.expires_at) > nowMs) fail(codes.held);
  if (owner.owner_host !== hostIdentity(hostname(), codes.invalid)) fail(codes.remote);
  if (processIsAlive(owner.owner_pid)) fail(codes.alive);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function digestObject(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function digestRecord(record) {
  const { record_digest: ignored, ...body } = record;
  return digestObject(body);
}

function digestLease(lease) {
  const { lease_digest: ignored, ...body } = lease;
  return digestObject(body);
}

function fileIdentity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    birthtime_ns: String(info.birthtimeNs),
  };
}

function sameFileIdentity(left, right) {
  return LOCK_IDENTITY_FIELDS.every((field) => left?.[field] === right?.[field]);
}

function validateLockRecord(lock) {
  exactFields(lock, LOCK_FIELDS, "writer_authority_lock_invalid");
  exactFields(lock.identity, LOCK_IDENTITY_FIELDS, "writer_authority_lock_invalid");
  if (lock.schema_version !== WRITER_AUTHORITY_CAS_LOCK_SCHEMA
    || typeof lock.token !== "string"
    || !/^[a-f0-9-]{36}$/.test(lock.token)
    || LOCK_IDENTITY_FIELDS.some((field) => !/^\d+$/.test(lock.identity[field]))) {
    fail("writer_authority_lock_invalid");
  }
  const createdAt = Date.parse(utcTimestamp(lock.created_at, "writer_authority_lock_invalid"));
  const expiresAt = Date.parse(utcTimestamp(lock.expires_at, "writer_authority_lock_invalid"));
  hostIdentity(lock.owner_host, "writer_authority_lock_invalid");
  ownerPid(lock.owner_pid, "writer_authority_lock_invalid");
  if (expiresAt <= createdAt) fail("writer_authority_lock_invalid");
  return lock;
}

function exactLanes(value) {
  return Array.isArray(value)
    && value.length === WRITER_AUTHORITY_LANES.length
    && value.every((lane, index) => lane === WRITER_AUTHORITY_LANES[index]);
}

function validateRevocation(record) {
  const values = [record.revoked_digest, record.revoked_epoch, record.revoked_mode, record.revoked_node_id];
  const allNull = values.every((value) => value === null);
  const noneNull = values.every((value) => value !== null);
  if (!allNull && !noneNull) fail("writer_authority_invalid_record");
  if (allNull) return;
  sha256Digest(record.revoked_digest, "writer_authority_invalid_record");
  if (!Number.isSafeInteger(record.revoked_epoch)
    || record.revoked_epoch < 1
    || record.revoked_epoch >= record.epoch
    || !ACTIVE_MODES.has(record.revoked_mode)) fail("writer_authority_invalid_record");
  safeId(record.revoked_node_id, "writer_authority_invalid_record");
  const expected = record.revoked_mode === "primary" ? record.primary_node_id : record.fallback_node_id;
  if (record.revoked_node_id !== expected) fail("writer_authority_invalid_record");
}

function validateRecord(record) {
  exactFields(record, RECORD_FIELDS, "writer_authority_invalid_record");
  if (record.schema_version !== WRITER_AUTHORITY_SCHEMA
    || record.authority_id !== WRITER_AUTHORITY_ID
    || record.authority_scope !== WRITER_AUTHORITY_SCOPE
    || !Number.isSafeInteger(record.epoch)
    || record.epoch < 1
    || !TRANSITIONS.has(record.transition)
    || !MODES.has(record.mode)
    || !exactLanes(record.lanes)) fail("writer_authority_invalid_record");
  safeId(record.node_id, "writer_authority_invalid_record");
  safeId(record.primary_node_id, "writer_authority_invalid_record");
  safeId(record.fallback_node_id, "writer_authority_invalid_record");
  if (record.primary_node_id === record.fallback_node_id
    || ![record.primary_node_id, record.fallback_node_id].includes(record.node_id)) {
    fail("writer_authority_invalid_record");
  }
  if ((record.mode === "primary" && record.node_id !== record.primary_node_id)
    || (record.mode === "fallback" && record.node_id !== record.fallback_node_id)) {
    fail("writer_authority_invalid_record");
  }
  const notBefore = Date.parse(utcTimestamp(record.not_before, "writer_authority_invalid_record"));
  const expiresAt = Date.parse(utcTimestamp(record.expires_at, "writer_authority_invalid_record"));
  if (expiresAt <= notBefore) fail("writer_authority_invalid_record");
  ownerApprovalRef(record.owner_approval_ref);
  sha256Digest(record.request_digest, "writer_authority_invalid_record");
  sha256Digest(record.record_digest, "writer_authority_invalid_record");
  if (record.epoch === 1) {
    if (record.previous_digest !== null || record.transition !== "initialize") fail("writer_authority_invalid_record");
  } else {
    sha256Digest(record.previous_digest, "writer_authority_invalid_record");
    if (record.transition === "initialize") fail("writer_authority_invalid_record");
  }
  validateRevocation(record);
  if (record.transition === "initialize"
    && (record.mode !== "off" || record.revoked_digest !== null)) fail("writer_authority_invalid_record");
  if (["freeze", "revoke"].includes(record.transition)
    && (record.mode !== "off"
      || record.revoked_digest !== record.previous_digest
      || record.revoked_epoch !== record.epoch - 1
      || record.revoked_node_id !== record.node_id)) fail("writer_authority_invalid_record");
  if (record.transition === "promote" && !ACTIVE_MODES.has(record.mode)) fail("writer_authority_invalid_record");
  if (record.transition === "failback"
    && (record.mode !== "primary"
      || record.revoked_epoch !== record.epoch - 2
      || record.revoked_mode !== "fallback"
      || record.revoked_node_id !== record.fallback_node_id)) fail("writer_authority_invalid_record");
  if (digestRecord(record) !== record.record_digest) fail("writer_authority_digest_invalid");
  return record;
}

function validateLeaseShape(lease) {
  exactFields(lease, LEASE_FIELDS, "writer_authority_invalid_lease");
  if (lease.schema_version !== WRITER_LEASE_SCHEMA
    || lease.authority_id !== WRITER_AUTHORITY_ID
    || lease.authority_scope !== WRITER_AUTHORITY_SCOPE
    || !Number.isSafeInteger(lease.epoch)
    || lease.epoch < 1
    || !ACTIVE_MODES.has(lease.mode)) fail("writer_authority_invalid_lease");
  sha256Digest(lease.authority_digest, "writer_authority_invalid_lease");
  safeId(lease.node_id, "writer_authority_invalid_lease");
  if (!WRITER_AUTHORITY_LANES.includes(lease.lane)) fail("writer_authority_invalid_lease");
  const notBefore = Date.parse(utcTimestamp(lease.not_before, "writer_authority_invalid_lease"));
  const expiresAt = Date.parse(utcTimestamp(lease.expires_at, "writer_authority_invalid_lease"));
  if (expiresAt <= notBefore) fail("writer_authority_invalid_lease");
  sha256Digest(lease.lease_digest, "writer_authority_invalid_lease");
  if (digestLease(lease) !== lease.lease_digest) fail("writer_authority_invalid_lease");
  return lease;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function optionalLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNormalDirectory(path) {
  const info = await optionalLstat(path);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) fail("writer_authority_path_unsafe");
  try {
    if (comparable(await realpath(path)) !== comparable(resolve(path))) fail("writer_authority_path_unsafe");
  } catch (error) {
    if (error?.code === "writer_authority_path_unsafe") throw error;
    fail("writer_authority_path_unsafe");
  }
}

async function assertNormalFile(path) {
  const info = await optionalLstat(path);
  if (!info || !info.isFile() || info.isSymbolicLink()) fail("writer_authority_path_unsafe");
  try {
    if (comparable(await realpath(path)) !== comparable(resolve(path))) fail("writer_authority_path_unsafe");
  } catch (error) {
    if (error?.code === "writer_authority_path_unsafe") throw error;
    fail("writer_authority_path_unsafe");
  }
}

async function normalizePaths(options) {
  if (typeof options.stateRoot !== "string"
    || typeof options.recordPath !== "string"
    || !isAbsolute(options.stateRoot)
    || !isAbsolute(options.recordPath)) fail("writer_authority_absolute_path_required");
  const stateRoot = resolve(options.stateRoot);
  const recordPath = resolve(options.recordPath);
  if (recordPath === stateRoot || !inside(stateRoot, recordPath)) fail("writer_authority_path_escape");
  await assertNormalDirectory(stateRoot);
  let current = stateRoot;
  for (const part of relative(stateRoot, dirname(recordPath)).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    await assertNormalDirectory(current);
  }
  return {
    stateRoot,
    recordPath,
    lockPath: `${recordPath}.cas.lock`,
    recoveryPath: `${recordPath}.cas.lock.recovery`,
    continuousLeasePath: resolve(stateRoot, "state", "leases", "continuous_ingress", "active.lock.json"),
  };
}

async function readJsonFile(path, code) {
  await assertNormalFile(path);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(code);
  }
}

async function readRecord(paths, { optional = false } = {}) {
  const info = await optionalLstat(paths.recordPath);
  if (!info) {
    if (optional) return null;
    fail("writer_authority_record_missing");
  }
  return validateRecord(await readJsonFile(paths.recordPath, "writer_authority_invalid_record"));
}

async function inspectLock(path, code = "writer_authority_lock_invalid") {
  await assertNormalFile(path);
  const info = await lstat(path, { bigint: true });
  const identity = fileIdentity(info);
  let lock;
  try {
    lock = validateLockRecord(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "writer_authority_lock_invalid") throw error;
    fail(code);
  }
  if (!sameFileIdentity(lock.identity, identity)) fail(code);
  return { lock, identity };
}

async function removePathWithIdentity(path, identity, { missingOk = false } = {}) {
  const info = await optionalLstat(path);
  if (!info) {
    if (missingOk) return false;
    fail("writer_authority_lock_lost");
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("writer_authority_path_unsafe");
  const current = fileIdentity(await lstat(path, { bigint: true }));
  if (!sameFileIdentity(current, identity)) fail("writer_authority_lock_lost");
  await rm(path);
  return true;
}

async function assertNoActiveContinuousLease(paths, nowMs) {
  const info = await optionalLstat(paths.continuousLeasePath);
  if (!info) return;
  if (!info.isFile() || info.isSymbolicLink()) fail("writer_authority_continuous_lease_invalid");
  const lease = await readJsonFile(
    paths.continuousLeasePath,
    "writer_authority_continuous_lease_invalid",
  );
  exactFields(lease, CONTINUOUS_LEASE_FIELDS, "writer_authority_continuous_lease_invalid");
  const acquiredAt = Date.parse(lease.acquired_at);
  const expiresAt = Date.parse(lease.expires_at);
  if (lease.schema_version !== CONTINUOUS_LEASE_SCHEMA
    || !Number.isSafeInteger(lease.lease_epoch)
    || lease.lease_epoch < 0
    || typeof lease.fence_token !== "string"
    || !/^[A-Za-z0-9_.-]{1,128}$/.test(lease.fence_token)
    || !Number.isFinite(acquiredAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= acquiredAt) fail("writer_authority_continuous_lease_invalid");
  safeId(lease.node_id, "writer_authority_continuous_lease_invalid");
  hostIdentity(lease.owner_host, "writer_authority_continuous_lease_invalid");
  ownerPid(lease.owner_pid, "writer_authority_continuous_lease_invalid");
  if (lease.owner_host !== hostIdentity(hostname(), "writer_authority_continuous_lease_invalid")) {
    fail("writer_authority_continuous_lease_remote_owner");
  }
  if (processIsAlive(lease.owner_pid) || expiresAt > nowMs) {
    fail("writer_authority_continuous_lease_active");
  }
}

function currentExpectation(current, primaryNodeId) {
  return current
    ? { epoch: current.epoch, digest: current.record_digest, nodeId: current.node_id }
    : { epoch: 0, digest: WRITER_AUTHORITY_ABSENT_DIGEST, nodeId: primaryNodeId };
}

function normalizeNow(value) {
  const resolved = typeof value === "function" ? value() : value ?? Date.now();
  if (!Number.isFinite(resolved)) fail("writer_authority_invalid_now");
  return Number(resolved);
}

function normalizeTransitionRequest(current, options) {
  const action = String(options.action || "");
  if (!TRANSITIONS.has(action)) fail("writer_authority_invalid_transition");
  const primaryNodeId = safeId(current?.primary_node_id ?? options.primaryNodeId);
  const fallbackNodeId = safeId(current?.fallback_node_id ?? options.fallbackNodeId);
  if (primaryNodeId === fallbackNodeId) fail("writer_authority_duplicate_nodes");
  if ((options.primaryNodeId !== undefined && options.primaryNodeId !== primaryNodeId)
    || (options.fallbackNodeId !== undefined && options.fallbackNodeId !== fallbackNodeId)) {
    fail("writer_authority_identity_binding_mismatch");
  }
  const actual = currentExpectation(current, primaryNodeId);
  if (options.apply === true
    && (options.expectedCurrentEpoch === undefined
      || options.expectedCurrentDigest === undefined
      || options.expectedNodeId === undefined)) fail("writer_authority_cas_expectation_required");
  const expectedEpoch = options.expectedCurrentEpoch ?? actual.epoch;
  if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 0) fail("writer_authority_invalid_expected_epoch");
  const expectedCurrentDigest = sha256Digest(options.expectedCurrentDigest ?? actual.digest);
  const expectedNodeId = safeId(options.expectedNodeId ?? actual.nodeId);
  const notBefore = utcTimestamp(options.notBefore);
  const expiresAt = utcTimestamp(options.expiresAt);
  const notBeforeMs = Date.parse(notBefore);
  const expiresAtMs = Date.parse(expiresAt);
  if (expiresAtMs <= notBeforeMs) fail("writer_authority_invalid_validity_window");
  const approvalRef = ownerApprovalRef(options.ownerApprovalRef);
  let targetMode = options.targetMode ?? null;
  let targetNodeId = options.targetNodeId ?? null;
  if (["initialize", "freeze", "revoke"].includes(action)) {
    if (targetMode !== null || targetNodeId !== null) fail("writer_authority_transition_target_forbidden");
  } else if (action === "promote") {
    if (!ACTIVE_MODES.has(targetMode)) fail("writer_authority_invalid_target_mode");
    targetNodeId = safeId(targetNodeId);
  } else {
    if (targetMode !== null && targetMode !== "primary") fail("writer_authority_invalid_target_mode");
    targetMode = "primary";
    targetNodeId = safeId(targetNodeId);
  }
  if (targetMode !== null) {
    const exactTarget = targetMode === "primary" ? primaryNodeId : fallbackNodeId;
    if (targetNodeId !== exactTarget) fail("writer_authority_wrong_node");
  }
  const requestBody = {
    authority_id: WRITER_AUTHORITY_ID,
    authority_scope: WRITER_AUTHORITY_SCOPE,
    action,
    expected_current_epoch: expectedEpoch,
    expected_current_digest: expectedCurrentDigest,
    expected_node_id: expectedNodeId,
    primary_node_id: primaryNodeId,
    fallback_node_id: fallbackNodeId,
    target_mode: targetMode,
    target_node_id: targetNodeId,
    not_before: notBefore,
    expires_at: expiresAt,
    owner_approval_ref: approvalRef,
  };
  return {
    ...requestBody,
    expectedEpoch,
    expectedCurrentDigest,
    expectedNodeId,
    primaryNodeId,
    fallbackNodeId,
    targetMode,
    targetNodeId,
    approvalRef,
    requestDigest: digestObject(requestBody),
  };
}

function assertTransitionFresh(request, nowMs) {
  if (Date.parse(request.expires_at) <= nowMs) fail("writer_authority_expired");
}

function isReplay(current, request) {
  if (!current
    || current.request_digest !== request.requestDigest
    || current.transition !== request.action
    || current.epoch !== request.expectedEpoch + 1) return false;
  return request.action === "initialize"
    ? request.expectedCurrentDigest === WRITER_AUTHORITY_ABSENT_DIGEST && current.previous_digest === null
    : current.previous_digest === request.expectedCurrentDigest;
}

function assertCas(current, request) {
  const actual = currentExpectation(current, request.primaryNodeId);
  if (request.expectedEpoch !== actual.epoch) fail("writer_authority_stale_epoch");
  if (request.expectedCurrentDigest !== actual.digest) fail("writer_authority_stale_digest");
  if (request.expectedNodeId !== actual.nodeId) fail("writer_authority_wrong_node");
  if (!current && request.action !== "initialize") fail("writer_authority_transition_forbidden");
  if (current && request.action === "initialize") fail("writer_authority_transition_forbidden");
}

function buildRecord(current, request) {
  let mode;
  let nodeId;
  let revokedDigest = current?.revoked_digest ?? null;
  let revokedEpoch = current?.revoked_epoch ?? null;
  let revokedMode = current?.revoked_mode ?? null;
  let revokedNodeId = current?.revoked_node_id ?? null;
  if (request.action === "initialize") {
    mode = "off";
    nodeId = request.primaryNodeId;
  } else if (["freeze", "revoke"].includes(request.action)) {
    if (!ACTIVE_MODES.has(current.mode)) fail("writer_authority_transition_forbidden");
    mode = "off";
    nodeId = current.node_id;
    revokedDigest = current.record_digest;
    revokedEpoch = current.epoch;
    revokedMode = current.mode;
    revokedNodeId = current.node_id;
  } else if (request.action === "promote") {
    if (current.mode !== "off") fail("writer_authority_transition_forbidden");
    if (current.revoked_mode === "fallback" && request.targetMode === "primary") {
      fail("writer_authority_failback_required");
    }
    mode = request.targetMode;
    nodeId = request.targetNodeId;
  } else {
    if (current.mode !== "off"
      || current.transition !== "revoke"
      || current.revoked_epoch !== current.epoch - 1
      || current.revoked_mode !== "fallback"
      || current.revoked_node_id !== request.fallbackNodeId
      || current.node_id !== request.fallbackNodeId
      || request.targetNodeId !== request.primaryNodeId) fail("writer_authority_transition_forbidden");
    mode = "primary";
    nodeId = request.primaryNodeId;
  }
  const record = {
    schema_version: WRITER_AUTHORITY_SCHEMA,
    authority_id: WRITER_AUTHORITY_ID,
    authority_scope: WRITER_AUTHORITY_SCOPE,
    epoch: current ? current.epoch + 1 : 1,
    transition: request.action,
    mode,
    node_id: nodeId,
    primary_node_id: request.primaryNodeId,
    fallback_node_id: request.fallbackNodeId,
    lanes: [...WRITER_AUTHORITY_LANES],
    not_before: request.not_before,
    expires_at: request.expires_at,
    owner_approval_ref: request.approvalRef,
    previous_digest: current?.record_digest ?? null,
    revoked_digest: revokedDigest,
    revoked_epoch: revokedEpoch,
    revoked_mode: revokedMode,
    revoked_node_id: revokedNodeId,
    request_digest: request.requestDigest,
    record_digest: "",
  };
  record.record_digest = digestRecord(record);
  return validateRecord(record);
}

function sanitizedTransitionResult(record, request, { apply, status, writesPerformed }) {
  return {
    schema_version: WRITER_AUTHORITY_RESULT_SCHEMA,
    operation_mode: apply ? "apply" : "dry_run",
    status,
    action: request.action,
    epoch: record.epoch,
    authority_mode: record.mode,
    node_id: record.node_id,
    authority_digest: record.record_digest,
    authority_scope: WRITER_AUTHORITY_SCOPE,
    previous_digest: record.previous_digest,
    revoked_digest: record.revoked_digest,
    expected_current_epoch: request.expectedEpoch,
    expected_current_digest: request.expectedCurrentDigest,
    expected_node_id: request.expectedNodeId,
    lanes: [...record.lanes],
    writes_performed: writesPerformed,
  };
}

async function createCasLockCandidate(paths, nowMs) {
  const temporary = `${paths.lockPath}.candidate-${randomUUID()}`;
  let handle;
  let identity;
  try {
    handle = await open(temporary, "wx", 0o600);
    identity = fileIdentity(await handle.stat({ bigint: true }));
    const lock = validateLockRecord({
      schema_version: WRITER_AUTHORITY_CAS_LOCK_SCHEMA,
      token: randomUUID(),
      created_at: new Date(nowMs).toISOString(),
      expires_at: new Date(nowMs + WRITER_AUTHORITY_CAS_LOCK_TTL_MS).toISOString(),
      owner_host: hostIdentity(hostname(), "writer_authority_lock_invalid"),
      owner_pid: process.pid,
      identity,
    });
    await handle.writeFile(`${JSON.stringify(lock)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    const inspected = await inspectLock(temporary);
    if (inspected.lock.token !== lock.token) fail("writer_authority_lock_invalid");
    return { temporary, ...inspected };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (identity) await removePathWithIdentity(temporary, identity, { missingOk: true }).catch(() => {});
    throw error;
  }
}

async function publishCasLock(paths, nowMs) {
  const candidate = await createCasLockCandidate(paths, nowMs);
  try {
    try {
      await link(candidate.temporary, paths.lockPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      return null;
    }
    const installed = await inspectLock(paths.lockPath);
    if (installed.lock.token !== candidate.lock.token
      || !sameFileIdentity(installed.identity, candidate.identity)) fail("writer_authority_lock_lost");
    return installed;
  } finally {
    await removePathWithIdentity(candidate.temporary, candidate.identity, { missingOk: true });
  }
}

async function recoverStaleCasLock(paths, nowMs) {
  await assertNoActiveContinuousLease(paths, nowMs);
  let observed = null;
  if (await optionalLstat(paths.lockPath)) observed = await inspectLock(paths.lockPath);
  let marker;
  if (!(await optionalLstat(paths.recoveryPath))) {
    if (!observed) fail("writer_authority_cas_race");
    assertExpiredLocalDeadOwner(observed.lock, nowMs, {
      held: "writer_authority_cas_race",
      remote: "writer_authority_lock_remote_owner",
      alive: "writer_authority_lock_owner_alive",
      invalid: "writer_authority_lock_invalid",
    });
    try {
      await link(paths.lockPath, paths.recoveryPath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EEXIST") fail("writer_authority_cas_race");
      throw error;
    }
    marker = await inspectLock(paths.recoveryPath);
    if (!sameFileIdentity(marker.identity, observed.identity) || marker.lock.token !== observed.lock.token) {
      await removePathWithIdentity(paths.recoveryPath, marker.identity, { missingOk: true });
      fail("writer_authority_cas_race");
    }
  } else {
    marker = await inspectLock(paths.recoveryPath);
  }
  assertExpiredLocalDeadOwner(marker.lock, nowMs, {
    held: "writer_authority_cas_race",
    remote: "writer_authority_lock_remote_owner",
    alive: "writer_authority_lock_owner_alive",
    invalid: "writer_authority_lock_invalid",
  });
  await assertNoActiveContinuousLease(paths, nowMs);
  if (await optionalLstat(paths.lockPath)) {
    const current = await inspectLock(paths.lockPath);
    if (!sameFileIdentity(current.identity, marker.identity) || current.lock.token !== marker.lock.token) {
      await removePathWithIdentity(paths.recoveryPath, marker.identity, { missingOk: true });
      fail("writer_authority_cas_race");
    }
    await removePathWithIdentity(paths.lockPath, marker.identity);
  }
  return marker;
}

async function acquireCasLock(paths, nowMs) {
  let recoveryMarker = null;
  if (await optionalLstat(paths.recoveryPath)) {
    recoveryMarker = await recoverStaleCasLock(paths, nowMs);
  }
  let installed = await publishCasLock(paths, nowMs);
  if (!installed) {
    recoveryMarker = await recoverStaleCasLock(paths, nowMs);
    installed = await publishCasLock(paths, nowMs);
    if (!installed) fail("writer_authority_cas_race");
  }
  if (recoveryMarker) {
    await removePathWithIdentity(paths.recoveryPath, recoveryMarker.identity, { missingOk: true });
  } else if (await optionalLstat(paths.recoveryPath)) {
    await removePathWithIdentity(paths.lockPath, installed.identity, { missingOk: true });
    fail("writer_authority_cas_race");
  }
  return installed;
}

async function releaseCasLock(paths, held) {
  if (await optionalLstat(paths.recoveryPath)) fail("writer_authority_lock_lost");
  const current = await inspectLock(paths.lockPath, "writer_authority_lock_lost");
  if (current.lock.token !== held.lock.token || !sameFileIdentity(current.identity, held.identity)) {
    fail("writer_authority_lock_lost");
  }
  await removePathWithIdentity(paths.lockPath, held.identity);
}

async function withCasLock(paths, nowMs, callback) {
  const held = await acquireCasLock(paths, nowMs);
  let result;
  let failure;
  try {
    result = await callback();
  } catch (error) {
    failure = error;
  }
  if (failure?.preserve_writer_authority_lock !== true) {
    try {
      await releaseCasLock(paths, held);
    } catch (error) {
      if (!failure) failure = error;
    }
  }
  if (failure) throw failure;
  return result;
}

async function assertCurrentUnchanged(paths, expected) {
  const current = await readRecord(paths, { optional: true });
  if (expected === null) {
    if (current !== null) fail("writer_authority_stale_digest");
    return;
  }
  if (!current || current.epoch !== expected.epoch) fail("writer_authority_stale_epoch");
  if (current.record_digest !== expected.record_digest) fail("writer_authority_stale_digest");
  if (current.node_id !== expected.node_id) fail("writer_authority_wrong_node");
}

async function runCrashPoint(testHooks, name, context) {
  if (typeof testHooks?.[name] !== "function") return;
  if (await testHooks[name](context) !== "simulate_process_crash") return;
  const error = new Error("writer_authority_simulated_process_crash");
  error.code = "writer_authority_simulated_process_crash";
  error.preserve_writer_authority_lock = true;
  throw error;
}

async function atomicReplaceRecord(paths, previous, record, testHooks) {
  const temporary = join(dirname(paths.recordPath), `.${basename(paths.recordPath)}.partial-${randomUUID()}`);
  if (!inside(paths.stateRoot, temporary)) fail("writer_authority_path_escape");
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await assertNormalFile(temporary);
    await assertCurrentUnchanged(paths, previous);
    await runCrashPoint(testHooks, "beforeAuthorityRecordReplace", { previous, record });
    await rename(temporary, paths.recordPath);
    await runCrashPoint(testHooks, "afterAuthorityRecordReplace", { previous, record });
    const stored = await readRecord(paths);
    if (stored.record_digest !== record.record_digest
      || JSON.stringify(canonicalize(stored)) !== JSON.stringify(canonicalize(record))) {
      fail("writer_authority_postwrite_recheck_failed");
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export async function transitionWriterAuthority(options = {}) {
  const paths = await normalizePaths(options);
  const nowMs = normalizeNow(options.now);
  if (options.apply !== true) {
    const current = await readRecord(paths, { optional: true });
    const request = normalizeTransitionRequest(current, options);
    if (isReplay(current, request)) {
      return sanitizedTransitionResult(current, request, { apply: false, status: "unchanged", writesPerformed: 0 });
    }
    assertTransitionFresh(request, nowMs);
    await assertNoActiveContinuousLease(paths, nowMs);
    assertCas(current, request);
    const record = buildRecord(current, request);
    return sanitizedTransitionResult(record, request, { apply: false, status: "planned", writesPerformed: 0 });
  }
  return withCasLock(paths, nowMs, async () => {
    const current = await readRecord(paths, { optional: true });
    const request = normalizeTransitionRequest(current, options);
    if (isReplay(current, request)) {
      return sanitizedTransitionResult(current, request, { apply: true, status: "unchanged", writesPerformed: 0 });
    }
    assertTransitionFresh(request, nowMs);
    await assertNoActiveContinuousLease(paths, nowMs);
    assertCas(current, request);
    const record = buildRecord(current, request);
    await atomicReplaceRecord(paths, current, record, options.testHooks);
    return sanitizedTransitionResult(record, request, { apply: true, status: "updated", writesPerformed: 1 });
  });
}

function leaseInputs(options) {
  const nodeId = safeId(options.nodeId);
  const lane = String(options.lane || "");
  const mode = String(options.mode || "");
  if (!WRITER_AUTHORITY_LANES.includes(lane)) fail("writer_authority_wrong_lane");
  if (!ACTIVE_MODES.has(mode)) fail("writer_authority_wrong_mode");
  return { nodeId, lane, mode };
}

function assertActiveAuthority(record, request, nowMs) {
  if (record.mode === "off") fail("writer_authority_mode_off");
  if (nowMs < Date.parse(record.not_before)) fail("writer_authority_not_yet_active");
  if (nowMs >= Date.parse(record.expires_at)) fail("writer_authority_expired");
  if (!record.lanes.includes(request.lane)) fail("writer_authority_wrong_lane");
  if (record.mode !== request.mode) fail("writer_authority_wrong_mode");
  if (record.node_id !== request.nodeId) fail("writer_authority_wrong_node");
}

export async function acquireWriterLease(options = {}) {
  const paths = await normalizePaths(options);
  if (await optionalLstat(paths.lockPath) || await optionalLstat(paths.recoveryPath)) {
    fail("writer_authority_transition_in_progress");
  }
  const request = leaseInputs(options);
  const nowMs = normalizeNow(options.now);
  const record = await readRecord(paths);
  assertActiveAuthority(record, request, nowMs);
  const lease = {
    schema_version: WRITER_LEASE_SCHEMA,
    authority_id: WRITER_AUTHORITY_ID,
    authority_scope: WRITER_AUTHORITY_SCOPE,
    authority_digest: record.record_digest,
    epoch: record.epoch,
    mode: record.mode,
    node_id: record.node_id,
    lane: request.lane,
    not_before: record.not_before,
    expires_at: record.expires_at,
    lease_digest: "",
  };
  lease.lease_digest = digestLease(lease);
  return validateLeaseShape(lease);
}

export async function validateWriterLease(options = {}) {
  const paths = await normalizePaths(options);
  const request = leaseInputs(options);
  const phase = options.phase ?? "before_payload";
  if (!new Set(["before_payload", "after_payload"]).has(phase)) fail("writer_authority_invalid_lease_phase");
  const lease = validateLeaseShape(options.lease);
  if (lease.node_id !== request.nodeId) fail("writer_authority_wrong_node");
  if (lease.lane !== request.lane) fail("writer_authority_wrong_lane");
  if (lease.mode !== request.mode) fail("writer_authority_wrong_mode");
  const nowMs = normalizeNow(options.now);
  if (nowMs < Date.parse(lease.not_before)) fail("writer_authority_not_yet_active");
  if (nowMs >= Date.parse(lease.expires_at)) fail("writer_authority_expired");
  const record = await readRecord(paths);
  if (record.mode === "off") fail("writer_authority_mode_off");
  if (nowMs < Date.parse(record.not_before)) fail("writer_authority_not_yet_active");
  if (nowMs >= Date.parse(record.expires_at)) fail("writer_authority_expired");
  if (lease.epoch !== record.epoch) fail("writer_authority_stale_epoch");
  if (lease.authority_digest !== record.record_digest) fail("writer_authority_stale_digest");
  assertActiveAuthority(record, request, nowMs);
  if (lease.not_before !== record.not_before || lease.expires_at !== record.expires_at) {
    fail("writer_authority_stale_digest");
  }
  return {
    schema_version: WRITER_AUTHORITY_RESULT_SCHEMA,
    status: "valid",
    phase,
    epoch: record.epoch,
    authority_mode: record.mode,
    node_id: record.node_id,
    lane: request.lane,
    authority_digest: record.record_digest,
    expires_at: record.expires_at,
  };
}

export const assertWriterLease = validateWriterLease;
