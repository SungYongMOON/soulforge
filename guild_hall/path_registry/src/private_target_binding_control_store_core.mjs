// Private target-binding control-store — N2 default-OFF adapter.
//
// This module has no configured root, no environment/default fallback, and no
// startup effect. Its private packet may contain nine host-local physical
// paths, but every returned receipt has refs/digests/counts only. It never
// touches a target path; it writes immutable control records below a caller-
//injected private control root only.

import { createHash, randomUUID } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import {
  link, lstat, mkdir, open, readFile, readdir, realpath, rename, unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  KnowledgeRootResolverError,
  resolveKnowledgeRoot,
} from "../../shared/knowledge_root_resolver.mjs";
import { comparablePathIdentity } from "../../shared/physical_path_identity.mjs";
import { TARGET_SIBLING_BINDING_MAP } from "./path_registry_core.mjs";

export const PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA =
  "soulforge.private_target_binding_control_store.v0";
export const PRIVATE_TARGET_BINDING_SET_SCHEMA = "soulforge.private_target_binding_set.v0";
export const PRIVATE_TARGET_BINDING_LOCK_BREAK_SCHEMA =
  "soulforge.private_target_binding_lock_break.v0";
export const PRIVATE_TARGET_BINDING_REACTIVATION_SCHEMA =
  "soulforge.private_target_binding_reactivation.v0";
export const PRIVATE_TARGET_BINDING_ACL_ADMISSION_SCHEMA =
  "soulforge.private_target_binding_acl_admission.v0";
export const PRIVATE_TARGET_BINDING_TARGET_MAP = Object.freeze(
  Object.entries(TARGET_SIBLING_BINDING_MAP).map(([logicalPathId, target]) => Object.freeze({
    target_id: logicalPathId.slice("target.".length),
    logical_path_id: logicalPathId,
    physical_basename: target.physical_basename,
    physical_root_class: target.physical_root_class,
    parent_binding_ref: target.parent_binding_ref,
  })),
);
export const PRIVATE_TARGET_BINDING_TARGET_IDS = Object.freeze(
  PRIVATE_TARGET_BINDING_TARGET_MAP.map((entry) => entry.target_id),
);

const REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STORE_DIRECTORY = "private-target-binding-control-store-v0";
const GENERATIONS_DIRECTORY = "generations";
const RECEIPTS_DIRECTORY = "receipts";
const POINTER_EVENTS_DIRECTORY = "pointer-events";
const LOCKS_DIRECTORY = "locks";
const LOCK_BREAK_RECEIPTS_DIRECTORY = "lock-break-receipts";
const ACTIVE_POINTER_FILE = "active.json";
const ACTIVE_POINTER_REF = "pointer:private-target-binding/current";
const FORBIDDEN_FIELD_NAME = /(?:^|_)(?:raw|secret|payload|body|transcript|prompt|token|password|cookie|credential)(?:_|$)/iu;
const TARGET_BY_ID = new Map(
  PRIVATE_TARGET_BINDING_TARGET_MAP.map((entry) => [entry.target_id, entry]),
);
const TARGET_SUITE_PARENT_BINDING_REF = PRIVATE_TARGET_BINDING_TARGET_MAP[0].parent_binding_ref;
const CANONICAL_CONTROL_LOGICAL_REF = TARGET_BY_ID.get("control").logical_path_id;

class ControlStoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new ControlStoreError(code);
}

function hold(holdCode) {
  return Object.freeze({
    status: "hold",
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    hold_code: holdCode,
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  switch (typeof value) {
    case "string": return JSON.stringify(value);
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) fail("packet_digest_input_invalid");
      return JSON.stringify(value);
    case "object": {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    default:
      return fail("packet_digest_input_invalid");
  }
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digestHex(digest) {
  return digest.slice("sha256:".length);
}

function generationRef(digest) {
  return `generation:private-target-binding/${digestHex(digest)}`;
}

function revocationRef(digest) {
  return `revocation:private-target-binding/${digestHex(digest)}`;
}

function lockBreakRef(digest) {
  return `lock-break:private-target-binding/${digestHex(digest)}`;
}

export function computePrivateTargetBindingPacketDigest(packet) {
  return sha256(Buffer.from(canonicalJson(packet), "utf8"));
}

export function computePrivateTargetBindingLockBreakRequestDigest(packet) {
  return sha256(Buffer.from(canonicalJson(packet), "utf8"));
}

export function computePrivateTargetBindingReactivationRequestDigest(packet) {
  return sha256(Buffer.from(canonicalJson(packet), "utf8"));
}

export function computePrivateTargetBindingAclAdmissionPacketDigest(packet) {
  return sha256(Buffer.from(canonicalJson(packet), "utf8"));
}

export function computePrivateTargetControlRootIdentityCommitment({ realpath: path, dev, ino } = {}) {
  if (typeof path !== "string" || typeof dev !== "string" || typeof ino !== "string") {
    fail("control_root_identity_input_invalid");
  }
  return sha256(Buffer.from(
    `soulforge.private_target_control_root_identity.v0\0${path}\0${dev}\0${ino}`,
    "utf8",
  ));
}

function assertObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function assertExactKeys(value, expectedKeys, code) {
  assertObject(value, code);
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELD_NAME.test(key)) fail("forbidden_private_packet_field");
    if (!expected.has(key)) fail(`${code}_field_unrecognized`);
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) fail(`${code}_field_missing`);
  }
}

function absolutePathLeak(value) {
  return typeof value === "string" && (isAbsolute(value) || value.startsWith("\\\\")
    || value.startsWith("//") || value.includes("\\"));
}

function assertRef(value, code) {
  if (typeof value !== "string" || !REF.test(value) || value.startsWith("hold:")
      || absolutePathLeak(value)) fail(code);
  return value;
}

function assertNullableRef(value, code) {
  return value === null ? null : assertRef(value, code);
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function assertClock(value, code) {
  if (typeof value !== "string" || !ISO.test(value) || !Number.isFinite(Date.parse(value))
      || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

const LOCK_TTL_MS = 5 * 60 * 1000;

function assertOperationEnvelope(input, allowedKeys, requiredKeys) {
  assertObject(input, "request_envelope_invalid");
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail("request_envelope_field_unrecognized");
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(input, key)) fail("request_envelope_field_missing");
  }
}

function normalizePrivatePhysicalPath(value, physicalBasename) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail("physical_path_invalid");
  }
  if (value.startsWith("\\\\") || value.startsWith("//") || value.startsWith("\\\\?\\")) {
    fail("physical_path_unc_forbidden");
  }
  const drivePrefix = /^[A-Za-z]:[\\/]/u.test(value);
  const firstColon = value.indexOf(":");
  if ((firstColon >= 0 && (!drivePrefix || firstColon !== 1 || value.indexOf(":", 2) >= 0))
      || value.normalize("NFC") !== value || !isAbsolute(value)) {
    fail("physical_path_invalid");
  }
  const normalized = resolve(value);
  if (normalized !== value
      || (process.platform === "win32" && /^[a-z]:/u.test(value))
      || basename(normalized) !== physicalBasename) {
    fail("physical_path_invalid");
  }
  return normalized;
}

function validateBindingSetPacket(value) {
  assertExactKeys(value, [
    "schema", "status", "binding_set_ref", "activation_ref", "writer_ref",
    "lock_break_authority_ref", "reactivation_authority_ref", "entries",
  ], "binding_set_packet");
  if (value.schema !== PRIVATE_TARGET_BINDING_SET_SCHEMA || value.status !== "closed") {
    fail("binding_set_packet_not_closed");
  }
  if (!Array.isArray(value.entries) || value.entries.length !== PRIVATE_TARGET_BINDING_TARGET_IDS.length) {
    fail("binding_set_entry_count_invalid");
  }
  const targetIds = new Set();
  const physicalPaths = new Set();
  const physicalParents = new Set();
  const bindingRefs = new Set();
  const bindingEpochs = new Set();
  const entries = value.entries.map((entry) => {
    assertExactKeys(entry, [
      "target_id", "logical_path_id", "binding_ref", "parent_binding_ref",
      "binding_epoch", "physical_path",
    ], "binding_set_entry");
    const target = TARGET_BY_ID.get(entry.target_id);
    if (typeof entry.target_id !== "string" || target === undefined
        || targetIds.has(entry.target_id)) {
      fail("binding_target_id_invalid");
    }
    targetIds.add(entry.target_id);
    const logicalPathId = assertRef(entry.logical_path_id, "logical_path_id_invalid");
    if (logicalPathId !== target.logical_path_id) fail("logical_path_id_target_mismatch");
    const bindingRef = assertRef(entry.binding_ref, "binding_ref_invalid");
    const parentBindingRef = assertRef(entry.parent_binding_ref, "parent_binding_ref_invalid");
    if (parentBindingRef !== TARGET_SUITE_PARENT_BINDING_REF) {
      fail("parent_binding_ref_target_suite_mismatch");
    }
    if (!Number.isInteger(entry.binding_epoch) || entry.binding_epoch < 1) {
      fail("binding_epoch_invalid");
    }
    const bindingEpoch = entry.binding_epoch;
    const physicalPath = normalizePrivatePhysicalPath(entry.physical_path, target.physical_basename);
    const physicalIdentity = comparablePathIdentity(physicalPath);
    const physicalParentIdentity = comparablePathIdentity(dirname(physicalPath));
    if (physicalPaths.has(physicalIdentity) || bindingRefs.has(bindingRef)) {
      fail("binding_set_entries_not_distinct");
    }
    physicalPaths.add(physicalIdentity);
    physicalParents.add(physicalParentIdentity);
    bindingRefs.add(bindingRef);
    bindingEpochs.add(bindingEpoch);
    return Object.freeze({
      target_id: entry.target_id,
      logical_path_id: logicalPathId,
      binding_ref: bindingRef,
      parent_binding_ref: parentBindingRef,
      binding_epoch: bindingEpoch,
      physical_path: physicalPath,
    });
  });
  if (targetIds.size !== PRIVATE_TARGET_BINDING_TARGET_IDS.length) fail("binding_target_id_missing");
  if (physicalParents.size !== 1) fail("binding_target_parent_mismatch");
  if (bindingEpochs.size !== 1) fail("binding_epoch_not_shared");
  return deepFreeze({
    schema: PRIVATE_TARGET_BINDING_SET_SCHEMA,
    status: "closed",
    binding_set_ref: assertRef(value.binding_set_ref, "binding_set_ref_invalid"),
    activation_ref: assertRef(value.activation_ref, "activation_ref_invalid"),
    writer_ref: assertRef(value.writer_ref, "writer_ref_invalid"),
    lock_break_authority_ref: assertRef(
      value.lock_break_authority_ref, "lock_break_authority_ref_invalid",
    ),
    reactivation_authority_ref: assertRef(
      value.reactivation_authority_ref, "reactivation_authority_ref_invalid",
    ),
    entries,
  });
}

function validateRegistrationRequest(input) {
  const packet = validateBindingSetPacket(input.binding_set_packet);
  const trustedPacketDigest = assertDigest(input.trusted_packet_digest, "trusted_packet_digest_invalid");
  if (computePrivateTargetBindingPacketDigest(input.binding_set_packet) !== trustedPacketDigest) {
    fail("trusted_packet_digest_mismatch");
  }
  const activationRef = assertRef(input.activation_ref, "activation_ref_invalid");
  const writerRef = assertRef(input.writer_ref, "writer_ref_invalid");
  if (activationRef !== packet.activation_ref || writerRef !== packet.writer_ref) {
    fail("activation_or_writer_ref_mismatch");
  }
  return Object.freeze({
    packet,
    trusted_packet_digest: trustedPacketDigest,
    activation_ref: activationRef,
    writer_ref: writerRef,
    expected_active_generation_ref: assertNullableRef(
      input.expected_active_generation_ref, "expected_active_generation_ref_invalid",
    ),
  });
}

function lockContext(input, request, nowMs, lockBreakAuthorityRef) {
  return Object.freeze({
    writer_ref: request.writer_ref,
    activation_ref: request.activation_ref,
    acquired_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + LOCK_TTL_MS).toISOString(),
    lock_break_request: input.lock_break_request ?? null,
    trusted_lock_break_request_digest: input.trusted_lock_break_request_digest,
    lock_break_authority_ref: lockBreakAuthorityRef,
  });
}

async function safeDirectory(path, { create, code }) {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
    return;
  } catch (error) {
    if (error instanceof ControlStoreError) throw error;
    if (error?.code !== "ENOENT" || create !== true) fail(code);
  }
  try {
    await mkdir(path);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
  } catch (error) {
    if (error instanceof ControlStoreError) throw error;
    fail(code);
  }
}

async function maybePlainFile(path, code) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
    return await readFile(path);
  } catch (error) {
    if (error instanceof ControlStoreError) throw error;
    if (error?.code === "ENOENT") return null;
    fail(code);
  }
}

function samePhysicalPath(left, right) {
  return comparablePathIdentity(left) === comparablePathIdentity(right);
}

async function captureTargetSuiteIdentity({
  target_suite_root, containment_root, control_root, packet,
}) {
  try {
    resolveKnowledgeRoot(target_suite_root, { containmentRoot: containment_root });
  } catch (error) {
    if (error instanceof KnowledgeRootResolverError) fail("target_suite_root_invalid");
    throw error;
  }
  const suiteRoot = resolve(target_suite_root);
  const controlRoot = resolve(control_root);
  const expectedControl = resolve(suiteRoot, "control");
  if (!samePhysicalPath(controlRoot, expectedControl)) fail("control_root_target_mismatch");
  try {
    resolveKnowledgeRoot(controlRoot, { containmentRoot: suiteRoot });
  } catch (error) {
    if (error instanceof KnowledgeRootResolverError) fail("control_root_invalid");
    throw error;
  }

  let suiteStat;
  let suiteRealpath;
  try {
    suiteStat = await lstat(suiteRoot);
    suiteRealpath = await realpath(suiteRoot);
  } catch {
    fail("target_suite_root_invalid");
  }
  if (!suiteStat.isDirectory() || suiteStat.isSymbolicLink() || suiteRealpath !== suiteRoot) {
    fail("target_suite_root_invalid");
  }
  const entries = [];
  const identityEntries = packet?.entries ?? PRIVATE_TARGET_BINDING_TARGET_MAP.map((target) => ({
    target_id: target.target_id,
    physical_path: resolve(suiteRoot, target.physical_basename),
  }));
  for (const entry of identityEntries) {
    const target = TARGET_BY_ID.get(entry.target_id);
    const expectedPath = resolve(suiteRoot, target.physical_basename);
    if (!samePhysicalPath(entry.physical_path, expectedPath)
        || !samePhysicalPath(dirname(entry.physical_path), suiteRoot)) {
      fail("target_path_not_direct_child");
    }
    let stat;
    let observedRealpath;
    try {
      stat = await lstat(entry.physical_path);
      observedRealpath = await realpath(entry.physical_path);
    } catch {
      fail("target_directory_unavailable");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || observedRealpath !== entry.physical_path
        || !samePhysicalPath(dirname(observedRealpath), suiteRealpath)) {
      fail("target_directory_unsafe");
    }
    entries.push(Object.freeze({
      target_id: entry.target_id,
      path: entry.physical_path,
      realpath: observedRealpath,
      dev: String(stat.dev),
      ino: String(stat.ino),
    }));
  }
  return Object.freeze({
    suite_root: suiteRoot,
    suite_realpath: suiteRealpath,
    suite_dev: String(suiteStat.dev),
    suite_ino: String(suiteStat.ino),
    control_root: controlRoot,
    entries: Object.freeze(entries),
  });
}

function validateWriterExclusiveAclAdmission(input, targetIdentity, writerRef, observedMs) {
  const value = input.acl_admission_packet;
  assertExactKeys(value, [
    "schema", "status", "control_root_ref", "control_root_identity_commitment",
    "acl_readback_ref", "acl_readback_digest", "sole_writer_ref",
    "wrong_writer_denied_ref", "authority_ref", "not_before", "expires_at",
  ], "acl_admission_packet");
  if (value.schema !== PRIVATE_TARGET_BINDING_ACL_ADMISSION_SCHEMA || value.status !== "closed") {
    fail("acl_admission_packet_invalid");
  }
  const trustedDigest = assertDigest(
    input.trusted_acl_admission_packet_digest, "trusted_acl_admission_digest_invalid",
  );
  if (computePrivateTargetBindingAclAdmissionPacketDigest(value) !== trustedDigest) {
    fail("trusted_acl_admission_digest_mismatch");
  }
  const controlIdentity = targetIdentity.entries.find((entry) => entry.target_id === "control");
  if (controlIdentity === undefined) fail("acl_admission_control_identity_missing");
  const expectedCommitment = computePrivateTargetControlRootIdentityCommitment({
    realpath: controlIdentity.realpath,
    dev: controlIdentity.dev,
    ino: controlIdentity.ino,
  });
  const normalized = {
    control_root_ref: assertRef(value.control_root_ref, "control_root_ref_invalid"),
    control_root_identity_commitment: assertDigest(
      value.control_root_identity_commitment, "control_root_identity_commitment_invalid",
    ),
    acl_readback_ref: assertRef(value.acl_readback_ref, "acl_readback_ref_invalid"),
    acl_readback_digest: assertDigest(value.acl_readback_digest, "acl_readback_digest_invalid"),
    sole_writer_ref: assertRef(value.sole_writer_ref, "acl_sole_writer_ref_invalid"),
    wrong_writer_denied_ref: assertRef(
      value.wrong_writer_denied_ref, "wrong_writer_denied_ref_invalid",
    ),
    authority_ref: assertRef(value.authority_ref, "acl_authority_ref_invalid"),
    not_before: assertClock(value.not_before, "acl_not_before_invalid"),
    expires_at: assertClock(value.expires_at, "acl_expires_at_invalid"),
  };
  if (normalized.control_root_ref !== CANONICAL_CONTROL_LOGICAL_REF
      || normalized.control_root_identity_commitment !== expectedCommitment
      || normalized.sole_writer_ref !== writerRef
      || observedMs < Date.parse(normalized.not_before)
      || observedMs > Date.parse(normalized.expires_at)) {
    fail("acl_admission_mismatch");
  }
  return Object.freeze({ ...normalized, trusted_digest: trustedDigest });
}

async function revalidateTargetSuiteIdentity(identity) {
  let suiteStat;
  let suiteRealpath;
  try {
    suiteStat = await lstat(identity.suite_root);
    suiteRealpath = await realpath(identity.suite_root);
  } catch {
    fail("target_identity_changed");
  }
  if (!suiteStat.isDirectory() || suiteStat.isSymbolicLink()
      || suiteRealpath !== identity.suite_realpath
      || String(suiteStat.dev) !== identity.suite_dev
      || String(suiteStat.ino) !== identity.suite_ino) {
    fail("target_identity_changed");
  }
  for (const expected of identity.entries) {
    let stat;
    let observedRealpath;
    try {
      stat = await lstat(expected.path);
      observedRealpath = await realpath(expected.path);
    } catch {
      fail("target_identity_changed");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()
        || observedRealpath !== expected.realpath
        || String(stat.dev) !== expected.dev
        || String(stat.ino) !== expected.ino) {
      fail("target_identity_changed");
    }
  }
}

function targetSuiteIdentityCommitment(identity) {
  return sha256(Buffer.from(canonicalJson({
    suite_realpath: identity.suite_realpath,
    suite_dev: identity.suite_dev,
    suite_ino: identity.suite_ino,
    targets: identity.entries
      .map((entry) => ({
        target_id: entry.target_id,
        realpath: entry.realpath,
        dev: entry.dev,
        ino: entry.ino,
      }))
      .sort((left, right) => left.target_id.localeCompare(right.target_id)),
  }), "utf8"));
}

async function captureStoreDirectoryIdentity(path, parentRealpath) {
  let stat;
  let observedRealpath;
  try {
    stat = await lstat(path);
    observedRealpath = await realpath(path);
  } catch {
    fail("control_store_lane_unsafe");
  }
  if (!stat.isDirectory() || stat.isSymbolicLink() || observedRealpath !== path
      || dirname(observedRealpath) !== parentRealpath) {
    fail("control_store_lane_unsafe");
  }
  return Object.freeze({
    path,
    realpath: observedRealpath,
    parent_realpath: parentRealpath,
    dev: String(stat.dev),
    ino: String(stat.ino),
  });
}

async function revalidateStoreDirectoryIdentity(identity) {
  let stat;
  let observedRealpath;
  try {
    stat = await lstat(identity.path);
    observedRealpath = await realpath(identity.path);
  } catch {
    fail("control_store_lane_changed");
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || observedRealpath !== identity.realpath
      || dirname(observedRealpath) !== identity.parent_realpath
      || String(stat.dev) !== identity.dev || String(stat.ino) !== identity.ino) {
    fail("control_store_lane_changed");
  }
}

async function revalidateStoreLane(layout, laneIdentity) {
  await revalidateStoreDirectoryIdentity(layout.store_identity);
  if (laneIdentity !== undefined) await revalidateStoreDirectoryIdentity(laneIdentity);
}

async function admittedStoreLayout({ control_root, target_suite_root }) {
  let admission;
  try {
    admission = resolveKnowledgeRoot(control_root, { containmentRoot: target_suite_root });
  } catch (error) {
    if (error instanceof KnowledgeRootResolverError) fail(`control_root_${error.code}`);
    throw error;
  }
  if (admission.status !== "resolved") fail("control_root_admission_failed");
  const controlRoot = resolve(control_root);
  const storeRoot = join(controlRoot, STORE_DIRECTORY);
  await safeDirectory(storeRoot, { create: true, code: "control_store_root_unsafe" });
  let names;
  try {
    names = await readdir(storeRoot);
  } catch {
    fail("control_store_root_unavailable");
  }
  const allowedNames = new Set([
    GENERATIONS_DIRECTORY,
    RECEIPTS_DIRECTORY,
    POINTER_EVENTS_DIRECTORY,
    LOCKS_DIRECTORY,
    LOCK_BREAK_RECEIPTS_DIRECTORY,
    ACTIVE_POINTER_FILE,
  ]);
  if (names.some((name) => !allowedNames.has(name))) fail("control_store_foreign_entry");
  const generationRoot = join(storeRoot, GENERATIONS_DIRECTORY);
  const receiptRoot = join(storeRoot, RECEIPTS_DIRECTORY);
  const pointerEventRoot = join(storeRoot, POINTER_EVENTS_DIRECTORY);
  const lockRoot = join(storeRoot, LOCKS_DIRECTORY);
  const lockBreakReceiptRoot = join(storeRoot, LOCK_BREAK_RECEIPTS_DIRECTORY);
  await safeDirectory(generationRoot, { create: true, code: "generation_root_unsafe" });
  await safeDirectory(receiptRoot, { create: true, code: "receipt_root_unsafe" });
  await safeDirectory(pointerEventRoot, { create: true, code: "pointer_event_root_unsafe" });
  await safeDirectory(lockRoot, { create: true, code: "lock_root_unsafe" });
  await safeDirectory(lockBreakReceiptRoot, { create: true, code: "lock_break_receipt_root_unsafe" });
  const controlRealpath = await realpath(controlRoot);
  const storeIdentity = await captureStoreDirectoryIdentity(storeRoot, controlRealpath);
  const storeRealpath = storeIdentity.realpath;
  return Object.freeze({
    generation_root: generationRoot,
    receipt_root: receiptRoot,
    pointer_event_root: pointerEventRoot,
    lock_root: lockRoot,
    lock_break_receipt_root: lockBreakReceiptRoot,
    active_pointer_path: join(storeRoot, ACTIVE_POINTER_FILE),
    store_identity: storeIdentity,
    generation_identity: await captureStoreDirectoryIdentity(generationRoot, storeRealpath),
    receipt_identity: await captureStoreDirectoryIdentity(receiptRoot, storeRealpath),
    pointer_event_identity: await captureStoreDirectoryIdentity(pointerEventRoot, storeRealpath),
    lock_identity: await captureStoreDirectoryIdentity(lockRoot, storeRealpath),
    lock_break_receipt_identity: await captureStoreDirectoryIdentity(
      lockBreakReceiptRoot, storeRealpath,
    ),
  });
}

async function createOrReadExact(path, bytes, collisionCode, layout, laneIdentity) {
  await revalidateStoreLane(layout, laneIdentity);
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let temporaryCreated = false;
  try {
    const handle = await open(
      temporaryPath,
      FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL,
      0o600,
    );
    temporaryCreated = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await revalidateStoreLane(layout, laneIdentity);
    try {
      await link(temporaryPath, path);
    } catch (error) {
      if (error?.code !== "EEXIST") fail(collisionCode);
    }
    await revalidateStoreLane(layout, laneIdentity);
    const existing = await maybePlainFile(path, collisionCode);
    if (existing === null || !existing.equals(bytes)) fail(collisionCode);
  } catch (error) {
    if (temporaryCreated) {
      try {
        await revalidateStoreLane(layout, laneIdentity);
        await unlink(temporaryPath);
        temporaryCreated = false;
      } catch {
        // A unique module-origin temporary remains an explicit fail-closed
        // repair blocker; it is never mistaken for a completed immutable file.
      }
    }
    throw error;
  }
  await revalidateStoreLane(layout, laneIdentity);
  const readback = await maybePlainFile(path, collisionCode);
  if (readback === null || !readback.equals(bytes)) fail(`${collisionCode}_readback`);
  if (temporaryCreated) {
    await revalidateStoreLane(layout, laneIdentity);
    try {
      await unlink(temporaryPath);
    } catch {
      fail(`${collisionCode}_temporary_cleanup`);
    }
  }
}

function validateLockRecord(value) {
  assertExactKeys(value, [
    "schema", "record_type", "lock_owner_ref", "activation_ref", "acquired_at", "expires_at",
  ], "active_lock");
  if (value.schema !== PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA
      || value.record_type !== "active_lock") fail("active_lock_invalid");
  const record = {
    schema: value.schema,
    record_type: value.record_type,
    lock_owner_ref: assertRef(value.lock_owner_ref, "lock_owner_ref_invalid"),
    activation_ref: assertRef(value.activation_ref, "lock_activation_ref_invalid"),
    acquired_at: assertClock(value.acquired_at, "lock_acquired_at_invalid"),
    expires_at: assertClock(value.expires_at, "lock_expires_at_invalid"),
  };
  if (Date.parse(record.expires_at) <= Date.parse(record.acquired_at)) fail("active_lock_invalid");
  return Object.freeze(record);
}

function validateLockBreakRequest(value, trustedDigest, existing, context) {
  assertExactKeys(value, [
    "schema", "status", "break_ref", "stale_lock_owner_ref", "stale_lock_activation_ref",
    "stale_lock_acquired_at", "stale_lock_expires_at", "breaker_writer_ref",
    "breaker_activation_ref", "authorized_by_ref", "not_before", "expires_at",
  ], "lock_break_request");
  if (value.schema !== PRIVATE_TARGET_BINDING_LOCK_BREAK_SCHEMA || value.status !== "authorized") {
    fail("lock_break_request_invalid");
  }
  const digest = assertDigest(trustedDigest, "trusted_lock_break_digest_invalid");
  if (computePrivateTargetBindingLockBreakRequestDigest(value) !== digest) {
    fail("trusted_lock_break_digest_mismatch");
  }
  const normalized = {
    schema: value.schema,
    status: value.status,
    break_ref: assertRef(value.break_ref, "lock_break_ref_invalid"),
    stale_lock_owner_ref: assertRef(value.stale_lock_owner_ref, "stale_lock_owner_ref_invalid"),
    stale_lock_activation_ref: assertRef(
      value.stale_lock_activation_ref, "stale_lock_activation_ref_invalid",
    ),
    stale_lock_acquired_at: assertClock(value.stale_lock_acquired_at, "stale_lock_acquired_at_invalid"),
    stale_lock_expires_at: assertClock(value.stale_lock_expires_at, "stale_lock_expires_at_invalid"),
    breaker_writer_ref: assertRef(value.breaker_writer_ref, "breaker_writer_ref_invalid"),
    breaker_activation_ref: assertRef(value.breaker_activation_ref, "breaker_activation_ref_invalid"),
    authorized_by_ref: assertRef(value.authorized_by_ref, "lock_break_authority_ref_invalid"),
    not_before: assertClock(value.not_before, "lock_break_not_before_invalid"),
    expires_at: assertClock(value.expires_at, "lock_break_expires_at_invalid"),
  };
  const observedMs = Date.parse(context.acquired_at);
  if (normalized.stale_lock_owner_ref !== existing.lock_owner_ref
      || normalized.stale_lock_activation_ref !== existing.activation_ref
      || normalized.stale_lock_acquired_at !== existing.acquired_at
      || normalized.stale_lock_expires_at !== existing.expires_at
      || normalized.breaker_writer_ref !== context.writer_ref
      || normalized.breaker_activation_ref !== context.activation_ref
      || normalized.authorized_by_ref !== context.lock_break_authority_ref
      || observedMs < Date.parse(normalized.not_before)
      || observedMs > Date.parse(normalized.expires_at)
      || observedMs <= Date.parse(existing.expires_at)) {
    fail("lock_break_request_mismatch");
  }
  return Object.freeze({ request: deepFreeze(normalized), digest });
}

function validateReactivationRequest(
  input, candidate, active, observedMs, storedReactivationAuthorityRef,
) {
  const value = input.reactivation_request;
  assertExactKeys(value, [
    "schema", "status", "reactivation_ref", "revoked_generation_ref",
    "revocation_head_ref", "new_binding_set_ref", "new_packet_digest",
    "authorized_by_ref", "not_before", "expires_at",
  ], "reactivation_request");
  if (value.schema !== PRIVATE_TARGET_BINDING_REACTIVATION_SCHEMA
      || value.status !== "authorized") fail("reactivation_request_invalid");
  const digest = assertDigest(
    input.trusted_reactivation_request_digest, "trusted_reactivation_digest_invalid",
  );
  if (computePrivateTargetBindingReactivationRequestDigest(value) !== digest) {
    fail("trusted_reactivation_digest_mismatch");
  }
  const normalized = {
    reactivation_ref: assertRef(value.reactivation_ref, "reactivation_ref_invalid"),
    revoked_generation_ref: assertRef(value.revoked_generation_ref, "revoked_generation_ref_invalid"),
    revocation_head_ref: assertRef(value.revocation_head_ref, "revocation_head_ref_invalid"),
    new_binding_set_ref: assertRef(value.new_binding_set_ref, "new_binding_set_ref_invalid"),
    new_packet_digest: assertDigest(value.new_packet_digest, "new_packet_digest_invalid"),
    authorized_by_ref: assertRef(value.authorized_by_ref, "reactivation_authority_ref_invalid"),
    not_before: assertClock(value.not_before, "reactivation_not_before_invalid"),
    expires_at: assertClock(value.expires_at, "reactivation_expires_at_invalid"),
  };
  if (active.state !== "revoked"
      || normalized.revoked_generation_ref !== active.previous_generation_ref
      || normalized.revocation_head_ref !== active.revocation_head_ref
      || normalized.new_binding_set_ref !== candidate.binding_set_ref
      || normalized.new_packet_digest !== candidate.packet_digest
      || normalized.authorized_by_ref !== storedReactivationAuthorityRef
      || observedMs < Date.parse(normalized.not_before)
      || observedMs > Date.parse(normalized.expires_at)) {
    fail("reactivation_request_mismatch");
  }
  return Object.freeze({ ...normalized, digest });
}

async function writeLockBreakReceipt(layout, validated, archivedLock) {
  const record = {
    ...validated.request,
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "lock_break_receipt",
    break_request_digest: validated.digest,
    archived_lock_ref: archivedLock.ref,
    archived_lock_digest: archivedLock.digest,
  };
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const digest = sha256(bytes);
  await createOrReadExact(
    join(layout.lock_break_receipt_root, `${digestHex(digest)}.json`),
    bytes,
    "lock_break_receipt_divergence",
    layout,
    layout.lock_break_receipt_identity,
  );
  return Object.freeze({ ref: lockBreakRef(digest), digest });
}

async function createLockFile(lockPath, record, layout) {
  await revalidateStoreLane(layout, layout.lock_identity);
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  const handle = await open(
    lockPath,
    FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({ path: lockPath, bytes, break_receipt: null });
}

async function createActiveLock(layout, context) {
  const lockPath = join(layout.lock_root, "active.lock");
  const breakingPath = join(layout.lock_root, "active.breaking.lock");
  const record = {
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "active_lock",
    lock_owner_ref: context.writer_ref,
    activation_ref: context.activation_ref,
    acquired_at: context.acquired_at,
    expires_at: context.expires_at,
  };
  await revalidateStoreLane(layout, layout.lock_identity);
  if (await maybePlainFile(breakingPath, "active_lock_break_marker_invalid") !== null) {
    fail("active_lock_break_in_progress");
  }
  try {
    return await createLockFile(lockPath, record, layout);
  } catch (error) {
    if (error?.code !== "EEXIST") fail("active_lock_create_failed");
  }
  await revalidateStoreLane(layout, layout.lock_identity);
  const existingBytes = await maybePlainFile(lockPath, "active_lock_invalid");
  if (existingBytes === null) fail("active_lock_invalid");
  let existing;
  try {
    existing = validateLockRecord(JSON.parse(existingBytes.toString("utf8")));
  } catch (error) {
    if (error instanceof ControlStoreError) throw error;
    fail("active_lock_invalid");
  }
  if (Date.parse(context.acquired_at) <= Date.parse(existing.expires_at)) {
    fail("active_pointer_busy");
  }
  if (context.lock_break_request === undefined || context.lock_break_request === null
      || context.trusted_lock_break_request_digest === undefined) {
    fail("stale_lock_break_required");
  }
  const validatedBreak = validateLockBreakRequest(
    context.lock_break_request,
    context.trusted_lock_break_request_digest,
    existing,
    context,
  );
  await revalidateStoreLane(layout, layout.lock_identity);
  try {
    await rename(lockPath, breakingPath);
  } catch {
    fail("active_lock_break_race");
  }
  await revalidateStoreLane(layout, layout.lock_identity);
  const archivedBytes = await maybePlainFile(breakingPath, "active_lock_break_readback_failed");
  if (archivedBytes === null || !archivedBytes.equals(existingBytes)) {
    fail("active_lock_break_readback_failed");
  }
  const archivedDigest = sha256(archivedBytes);
  const archiveName = `stale-${randomUUID()}.json`;
  const archivePath = join(layout.lock_root, archiveName);
  const archiveRef = `lock-archive:private-target-binding/${archiveName.slice(6, -5)}`;
  let breakReceipt;
  let reacquired;
  try {
    breakReceipt = await writeLockBreakReceipt(layout, validatedBreak, {
      ref: archiveRef,
      digest: archivedDigest,
    });
    reacquired = await createLockFile(lockPath, record, layout);
  } catch (error) {
    // Restore only when no successor owns active.lock. Never unlink or
    // overwrite a successor created by another contender.
    try {
      await revalidateStoreLane(layout, layout.lock_identity);
      const successor = await maybePlainFile(lockPath, "active_lock_recovery_readback_failed");
      if (successor === null) await rename(breakingPath, lockPath);
    } catch {
      // Preserve the original failure; a retained breaking marker is a
      // fail-closed recovery state, not authority for manual deletion.
    }
    if (error?.code === "EEXIST") fail("active_pointer_busy");
    throw error;
  }
  await revalidateStoreLane(layout, layout.lock_identity);
  try {
    await rename(breakingPath, archivePath);
  } catch {
    fail("active_lock_archive_failed");
  }
  return Object.freeze({ ...reacquired, break_receipt: breakReceipt });
}

async function releaseActiveLock(layout, lock) {
  await revalidateStoreLane(layout, layout.lock_identity);
  const bytes = await maybePlainFile(lock.path, "active_lock_release_failed");
  if (bytes === null || !bytes.equals(lock.bytes)) fail("active_lock_release_failed");
  try {
    await revalidateStoreLane(layout, layout.lock_identity);
    await unlink(lock.path);
  } catch {
    fail("active_lock_release_failed");
  }
}

async function withActiveLock(layout, context, callback) {
  const lock = await createActiveLock(layout, context);
  let result;
  let operationError;
  try {
    result = await callback(lock.break_receipt);
  } catch (error) {
    operationError = error;
  }
  try {
    await releaseActiveLock(layout, lock);
  } catch (releaseError) {
    if (operationError === undefined) operationError = releaseError;
  }
  if (operationError !== undefined) throw operationError;
  return result;
}

function storedPacketFromGeneration(record) {
  return {
    schema: PRIVATE_TARGET_BINDING_SET_SCHEMA,
    status: "closed",
    binding_set_ref: record.binding_set_ref,
    activation_ref: record.activation_ref,
    writer_ref: record.writer_ref,
    lock_break_authority_ref: record.lock_break_authority_ref,
    reactivation_authority_ref: record.reactivation_authority_ref,
    entries: record.entries,
  };
}

function validateStoredGeneration(value, expectedDigest) {
  assertExactKeys(value, [
    "schema", "record_type", "binding_set_ref", "packet_digest", "activation_ref", "writer_ref",
    "parent_generation_ref", "lock_break_authority_ref", "reactivation_authority_ref",
    "target_suite_identity_commitment", "entries",
  ], "generation_record");
  if (value.schema !== PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA
      || value.record_type !== "binding_generation") fail("generation_record_invalid");
  const packet = validateBindingSetPacket(storedPacketFromGeneration(value));
  const packetDigest = assertDigest(value.packet_digest, "generation_packet_digest_invalid");
  if (computePrivateTargetBindingPacketDigest(storedPacketFromGeneration(value)) !== packetDigest) {
    fail("generation_packet_digest_mismatch");
  }
  const digest = assertDigest(expectedDigest, "generation_digest_invalid");
  return Object.freeze({
    generation_digest: digest,
    generation_ref: generationRef(digest),
    packet_digest: packetDigest,
    binding_set_ref: packet.binding_set_ref,
    activation_ref: packet.activation_ref,
    writer_ref: packet.writer_ref,
    lock_break_authority_ref: packet.lock_break_authority_ref,
    reactivation_authority_ref: packet.reactivation_authority_ref,
    target_suite_identity_commitment: assertDigest(
      value.target_suite_identity_commitment, "target_suite_identity_commitment_invalid",
    ),
    parent_generation_ref: assertNullableRef(value.parent_generation_ref, "generation_parent_ref_invalid"),
    entries: packet.entries,
  });
}

async function readGenerations(layout) {
  await revalidateStoreLane(layout, layout.generation_identity);
  let names;
  try {
    names = await readdir(layout.generation_root);
  } catch {
    fail("generation_root_unavailable");
  }
  const records = [];
  for (const name of names.sort()) {
    const match = name.match(/^([0-9a-f]{64})\.json$/u);
    if (!match) fail("generation_store_foreign_entry");
    const digest = `sha256:${match[1]}`;
    await revalidateStoreLane(layout, layout.generation_identity);
    const bytes = await maybePlainFile(join(layout.generation_root, name), "generation_file_unsafe");
    if (bytes === null || sha256(bytes) !== digest) fail("generation_content_divergence");
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("generation_record_invalid");
    }
    records.push(validateStoredGeneration(parsed, digest));
  }
  return records;
}

function validateStoredRevocation(value, expectedDigest) {
  assertExactKeys(value, [
    "schema", "record_type", "revoke_ref", "activation_ref", "writer_ref",
    "expected_active_generation_ref", "rollback_to_generation_ref", "prior_generation_digest",
    "revoked_generation_ref", "revoked_binding_set_ref", "revoked_binding_refs",
    "revoked_packet_digest", "prior_revocation_ref",
  ], "revocation_record");
  if (value.schema !== PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA
      || value.record_type !== "revocation_receipt") fail("revocation_record_invalid");
  const digest = assertDigest(expectedDigest, "revocation_digest_invalid");
  if (!Array.isArray(value.revoked_binding_refs)
      || value.revoked_binding_refs.length !== PRIVATE_TARGET_BINDING_TARGET_IDS.length) {
    fail("revoked_binding_refs_invalid");
  }
  const revokedBindingRefs = value.revoked_binding_refs.map((entry) => (
    assertRef(entry, "revoked_binding_ref_invalid")
  ));
  if (new Set(revokedBindingRefs).size !== revokedBindingRefs.length) {
    fail("revoked_binding_refs_invalid");
  }
  return Object.freeze({
    revocation_digest: digest,
    revocation_ref: revocationRef(digest),
    revoke_ref: assertRef(value.revoke_ref, "revoke_ref_invalid"),
    activation_ref: assertRef(value.activation_ref, "activation_ref_invalid"),
    writer_ref: assertRef(value.writer_ref, "writer_ref_invalid"),
    expected_active_generation_ref: assertRef(
      value.expected_active_generation_ref, "expected_active_generation_ref_invalid",
    ),
    rollback_to_generation_ref: assertNullableRef(
      value.rollback_to_generation_ref, "rollback_to_generation_ref_invalid",
    ),
    prior_generation_digest: assertDigest(value.prior_generation_digest, "prior_generation_digest_invalid"),
    revoked_generation_ref: assertRef(value.revoked_generation_ref, "revoked_generation_ref_invalid"),
    revoked_binding_set_ref: assertRef(value.revoked_binding_set_ref, "revoked_binding_set_ref_invalid"),
    revoked_binding_refs: Object.freeze(revokedBindingRefs),
    revoked_packet_digest: assertDigest(value.revoked_packet_digest, "revoked_packet_digest_invalid"),
    prior_revocation_ref: assertNullableRef(value.prior_revocation_ref, "prior_revocation_ref_invalid"),
  });
}

async function readRevocationReceipts(layout) {
  await revalidateStoreLane(layout, layout.receipt_identity);
  let names;
  try {
    names = await readdir(layout.receipt_root);
  } catch {
    fail("receipt_root_unavailable");
  }
  const records = [];
  for (const name of names.sort()) {
    const match = name.match(/^([0-9a-f]{64})\.json$/u);
    if (!match) fail("receipt_store_foreign_entry");
    const digest = `sha256:${match[1]}`;
    await revalidateStoreLane(layout, layout.receipt_identity);
    const bytes = await maybePlainFile(join(layout.receipt_root, name), "revocation_receipt_unsafe");
    if (bytes === null || sha256(bytes) !== digest) fail("revocation_receipt_divergence");
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("revocation_record_invalid");
    }
    records.push(validateStoredRevocation(parsed, digest));
  }
  return records;
}

function validateRevocationHead(records, revocations, activePointer) {
  if (records.length > 0 && activePointer === null) fail("active_pointer_missing_for_existing_records");
  if (activePointer === null) {
    if (revocations.length > 0) fail("revocation_head_missing");
    return;
  }
  if (revocations.length === 0) {
    if (activePointer.revocation_head_ref !== null) fail("revocation_head_unrecognized");
    return;
  }
  if (activePointer.revocation_head_ref === null) fail("revocation_head_missing");
  const byRef = new Map(revocations.map((record) => [record.revocation_ref, record]));
  if (byRef.size !== revocations.length) fail("revocation_chain_duplicate");
  const visited = new Set();
  let cursor = activePointer.revocation_head_ref;
  while (cursor !== null) {
    if (visited.has(cursor)) fail("revocation_chain_cycle");
    const record = byRef.get(cursor);
    if (record === undefined) fail("revocation_head_unrecognized");
    visited.add(cursor);
    cursor = record.prior_revocation_ref;
  }
  if (visited.size !== revocations.length) fail("revocation_chain_orphan");
}

function generationRecord(request, targetIdentityCommitment) {
  return {
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "binding_generation",
    binding_set_ref: request.packet.binding_set_ref,
    packet_digest: request.trusted_packet_digest,
    activation_ref: request.activation_ref,
    writer_ref: request.writer_ref,
    lock_break_authority_ref: request.packet.lock_break_authority_ref,
    reactivation_authority_ref: request.packet.reactivation_authority_ref,
    target_suite_identity_commitment: targetIdentityCommitment,
    parent_generation_ref: request.expected_active_generation_ref,
    entries: request.packet.entries,
  };
}

function findGeneration(records, ref) {
  return records.find((record) => record.generation_ref === ref) ?? null;
}

function assertGenerationReuseSafe(candidate, records) {
  for (const record of records) {
    if (record.generation_digest === candidate.generation_digest) {
      if (record.packet_digest !== candidate.packet_digest
          || record.parent_generation_ref !== candidate.parent_generation_ref) {
        fail("generation_divergence");
      }
      return record;
    }
    if (record.binding_set_ref === candidate.binding_set_ref) fail("binding_set_ref_reuse");
    const existingRefs = new Set(record.entries.map((entry) => entry.binding_ref));
    if (candidate.entries.some((entry) => existingRefs.has(entry.binding_ref))) {
      fail("binding_ref_reuse");
    }
  }
  return null;
}

function assertBindingIdentityNotRevoked(candidate, revocations) {
  const candidateBindingRefs = new Set(candidate.entries.map((entry) => entry.binding_ref));
  for (const revocation of revocations) {
    if (revocation.revoked_generation_ref === candidate.generation_ref
        || revocation.revoked_binding_set_ref === candidate.binding_set_ref
        || revocation.revoked_packet_digest === candidate.packet_digest
        || revocation.revoked_binding_refs.some((ref) => candidateBindingRefs.has(ref))) {
      fail("binding_identity_revoked");
    }
  }
}

function assertTargetSuiteLineage(records, activePointer, expectedCommitment) {
  for (const record of records) {
    if (record.target_suite_identity_commitment !== expectedCommitment) {
      fail("target_suite_identity_mismatch");
    }
  }
  if (activePointer !== null
      && activePointer.target_suite_identity_commitment !== expectedCommitment) {
    fail("target_suite_identity_mismatch");
  }
}

function activePointerRecord({
  generation, previous_generation_ref, transition_ref = null, revocation_head_ref = null,
  reactivation_request_digest = null,
}) {
  return {
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "active_pointer",
    state: "active",
    active_generation_ref: generation.generation_ref,
    active_generation_digest: generation.generation_digest,
    binding_set_ref: generation.binding_set_ref,
    activation_ref: generation.activation_ref,
    writer_ref: generation.writer_ref,
    previous_generation_ref,
    transition_ref,
    revocation_head_ref,
    lock_break_authority_ref: generation.lock_break_authority_ref,
    reactivation_authority_ref: generation.reactivation_authority_ref,
    reactivation_request_digest,
    target_suite_identity_commitment: generation.target_suite_identity_commitment,
  };
}

function revokedPointerRecord({
  previous_generation_ref, activation_ref, writer_ref, transition_ref,
  lock_break_authority_ref, reactivation_authority_ref, target_suite_identity_commitment,
}) {
  return {
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "active_pointer",
    state: "revoked",
    active_generation_ref: null,
    active_generation_digest: null,
    binding_set_ref: null,
    activation_ref,
    writer_ref,
    previous_generation_ref,
    transition_ref,
    revocation_head_ref: transition_ref,
    lock_break_authority_ref,
    reactivation_authority_ref,
    reactivation_request_digest: null,
    target_suite_identity_commitment,
  };
}

function validateActivePointer(value) {
  assertExactKeys(value, [
    "schema", "record_type", "state", "active_generation_ref", "active_generation_digest",
    "binding_set_ref", "activation_ref", "writer_ref", "previous_generation_ref", "transition_ref",
    "revocation_head_ref", "lock_break_authority_ref",
    "reactivation_authority_ref", "reactivation_request_digest",
    "target_suite_identity_commitment",
  ], "active_pointer");
  if (value.schema !== PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA
      || value.record_type !== "active_pointer"
      || (value.state !== "active" && value.state !== "revoked")) fail("active_pointer_invalid");
  const normalized = {
    state: value.state,
    active_generation_ref: assertNullableRef(value.active_generation_ref, "active_generation_ref_invalid"),
    active_generation_digest: value.active_generation_digest === null
      ? null : assertDigest(value.active_generation_digest, "active_generation_digest_invalid"),
    binding_set_ref: assertNullableRef(value.binding_set_ref, "active_binding_set_ref_invalid"),
    activation_ref: assertRef(value.activation_ref, "active_activation_ref_invalid"),
    writer_ref: assertRef(value.writer_ref, "active_writer_ref_invalid"),
    previous_generation_ref: assertNullableRef(value.previous_generation_ref, "previous_generation_ref_invalid"),
    transition_ref: assertNullableRef(value.transition_ref, "transition_ref_invalid"),
    revocation_head_ref: assertNullableRef(value.revocation_head_ref, "revocation_head_ref_invalid"),
    lock_break_authority_ref: assertRef(
      value.lock_break_authority_ref, "lock_break_authority_ref_invalid",
    ),
    reactivation_authority_ref: assertRef(
      value.reactivation_authority_ref, "reactivation_authority_ref_invalid",
    ),
    reactivation_request_digest: value.reactivation_request_digest === null
      ? null : assertDigest(value.reactivation_request_digest, "reactivation_request_digest_invalid"),
    target_suite_identity_commitment: value.target_suite_identity_commitment === null
      ? null : assertDigest(
        value.target_suite_identity_commitment, "target_suite_identity_commitment_invalid",
      ),
  };
  if (normalized.state === "active") {
    if (normalized.active_generation_ref === null || normalized.active_generation_digest === null
        || normalized.binding_set_ref === null
        || normalized.target_suite_identity_commitment === null) fail("active_pointer_invalid");
  } else if (normalized.active_generation_ref !== null || normalized.active_generation_digest !== null
      || normalized.binding_set_ref !== null || normalized.previous_generation_ref === null
      || normalized.transition_ref === null
      || normalized.revocation_head_ref !== normalized.transition_ref
      || normalized.reactivation_request_digest !== null
      || normalized.target_suite_identity_commitment === null) {
    fail("active_pointer_invalid");
  }
  return Object.freeze(normalized);
}

async function readActivePointer(layout) {
  await revalidateStoreLane(layout);
  const bytes = await maybePlainFile(layout.active_pointer_path, "active_pointer_unsafe");
  if (bytes === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("active_pointer_invalid");
  }
  return Object.freeze({ ...validateActivePointer(parsed), bytes });
}

function samePointer(left, right) {
  if (left === null || right === null) return left === right;
  const fields = (value) => ({
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "active_pointer",
    state: value.state,
    active_generation_ref: value.active_generation_ref,
    active_generation_digest: value.active_generation_digest,
    binding_set_ref: value.binding_set_ref,
    activation_ref: value.activation_ref,
    writer_ref: value.writer_ref,
    previous_generation_ref: value.previous_generation_ref,
    transition_ref: value.transition_ref,
    revocation_head_ref: value.revocation_head_ref,
    lock_break_authority_ref: value.lock_break_authority_ref,
    reactivation_authority_ref: value.reactivation_authority_ref,
    reactivation_request_digest: value.reactivation_request_digest,
    target_suite_identity_commitment: value.target_suite_identity_commitment,
  });
  return canonicalJson(fields(left)) === canonicalJson(fields(right));
}

async function compareAndSwapActivePointer(layout, expected, desired) {
  const observed = await readActivePointer(layout);
  if (!samePointer(observed, expected)) fail("active_pointer_compare_failed");
  const bytes = Buffer.from(`${canonicalJson(desired)}\n`, "utf8");
  const digest = sha256(bytes);
  await createOrReadExact(
    join(layout.pointer_event_root, `${digestHex(digest)}.json`), bytes, "pointer_event_collision",
    layout, layout.pointer_event_identity,
  );
  const pendingPath = join(layout.lock_root, `pointer-${digestHex(digest)}.pending`);
  await createOrReadExact(
    pendingPath, bytes, "active_pointer_pending_collision", layout, layout.lock_identity,
  );
  const beforeRename = await readActivePointer(layout);
  if (!samePointer(beforeRename, expected)) fail("active_pointer_compare_failed");
  try {
    await revalidateStoreLane(layout, layout.lock_identity);
    await rename(pendingPath, layout.active_pointer_path);
  } catch {
    fail("active_pointer_cas_failed");
  }
  const readbackBytes = await maybePlainFile(layout.active_pointer_path, "active_pointer_readback_failed");
  if (readbackBytes === null || !readbackBytes.equals(bytes)) fail("active_pointer_readback_failed");
  const readback = await readActivePointer(layout);
  if (!samePointer(readback, desired)) fail("active_pointer_readback_failed");
  return Object.freeze({ pointer_digest: digest });
}

function registrationReceipt(
  status, request, generation, pointerDigest, lockBreakReceipt = null, reactivation = null,
) {
  return deepFreeze({
    status,
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    binding_set_ref: request.packet.binding_set_ref,
    packet_digest: request.trusted_packet_digest,
    generation_ref: generation.generation_ref,
    generation_digest: generation.generation_digest,
    active_pointer_ref: ACTIVE_POINTER_REF,
    active_pointer_digest: pointerDigest,
    active_generation_ref: generation.generation_ref,
    previous_generation_ref: generation.parent_generation_ref,
    binding_count: generation.entries.length,
    activation_ref: request.activation_ref,
    writer_ref: request.writer_ref,
    lock_break_ref: lockBreakReceipt?.ref ?? null,
    lock_break_digest: lockBreakReceipt?.digest ?? null,
    reactivation_ref: reactivation?.reactivation_ref ?? null,
    reactivation_digest: reactivation?.digest ?? null,
  });
}

const REGISTER_REQUEST_KEYS = Object.freeze([
  "enabled", "binding_set_packet", "trusted_packet_digest", "activation_ref", "writer_ref",
  "expected_active_generation_ref", "target_suite_root", "control_root", "containment_root",
  "lock_break_request", "trusted_lock_break_request_digest",
  "reactivation_request", "trusted_reactivation_request_digest",
  "acl_admission_packet", "trusted_acl_admission_packet_digest",
]);
const REGISTER_REQUIRED_KEYS = Object.freeze([
  "enabled", "binding_set_packet", "trusted_packet_digest", "activation_ref", "writer_ref",
  "expected_active_generation_ref", "target_suite_root", "control_root", "containment_root",
  "acl_admission_packet", "trusted_acl_admission_packet_digest",
]);

async function registerPrivateTargetBindingSetImpl(input = {}) {
  if (input?.enabled !== true) return hold("adapter_default_off");
  try {
    assertOperationEnvelope(input, REGISTER_REQUEST_KEYS, REGISTER_REQUIRED_KEYS);
    const operationNow = Date.now();
    if (!Number.isFinite(operationNow)) fail("host_clock_invalid");
    const request = validateRegistrationRequest(input);
    const targetIdentity = await captureTargetSuiteIdentity({ ...input, packet: request.packet });
    const targetCommitment = targetSuiteIdentityCommitment(targetIdentity);
    validateWriterExclusiveAclAdmission(
      input, targetIdentity, request.writer_ref, operationNow,
    );
    const layout = await admittedStoreLayout(input);
    const record = generationRecord(request, targetCommitment);
    const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
    const generationDigest = sha256(bytes);
    const candidate = Object.freeze({
      generation_digest: generationDigest,
      generation_ref: generationRef(generationDigest),
      packet_digest: request.trusted_packet_digest,
      binding_set_ref: request.packet.binding_set_ref,
      activation_ref: request.activation_ref,
      writer_ref: request.writer_ref,
      lock_break_authority_ref: request.packet.lock_break_authority_ref,
      reactivation_authority_ref: request.packet.reactivation_authority_ref,
      target_suite_identity_commitment: targetCommitment,
      parent_generation_ref: request.expected_active_generation_ref,
      binding_epoch: request.packet.entries[0].binding_epoch,
      entries: request.packet.entries,
    });
    const preRecords = await readGenerations(layout);
    const preRevocations = await readRevocationReceipts(layout);
    const preActive = await readActivePointer(layout);
    validateRevocationHead(preRecords, preRevocations, preActive);
    assertTargetSuiteLineage(preRecords, preActive, targetCommitment);
    let preAuthorityGeneration = null;
    if (preRecords.length > 0) {
      if (preActive === null) fail("active_pointer_missing_for_existing_records");
      const authorityGenerationRef = preActive.state === "active"
        ? preActive.active_generation_ref : preActive.previous_generation_ref;
      preAuthorityGeneration = findGeneration(preRecords, authorityGenerationRef);
      if (preAuthorityGeneration === null
          || preActive.lock_break_authority_ref
            !== preAuthorityGeneration.lock_break_authority_ref
          || preActive.reactivation_authority_ref
            !== preAuthorityGeneration.reactivation_authority_ref) {
        fail("stored_authority_lineage_invalid");
      }
      if (candidate.lock_break_authority_ref !== preAuthorityGeneration.lock_break_authority_ref
          || candidate.reactivation_authority_ref
            !== preAuthorityGeneration.reactivation_authority_ref) {
        fail("stored_authority_lineage_mismatch");
      }
    }
    const lockBreakAuthorityRef = preAuthorityGeneration?.lock_break_authority_ref
      ?? candidate.lock_break_authority_ref;
    return await withActiveLock(
      layout,
      lockContext(input, request, operationNow, lockBreakAuthorityRef),
      async (lockBreakReceipt) => {
      const records = await readGenerations(layout);
      const revocations = await readRevocationReceipts(layout);
      assertBindingIdentityNotRevoked(candidate, revocations);
      const existing = assertGenerationReuseSafe(candidate, records);
      const active = await readActivePointer(layout);
      validateRevocationHead(records, revocations, active);
      assertTargetSuiteLineage(records, active, targetCommitment);
      if (!samePointer(active, preActive)) fail("active_pointer_compare_failed");
      if (preAuthorityGeneration !== null) {
        const authorityGenerationRef = active.state === "active"
          ? active.active_generation_ref : active.previous_generation_ref;
        const currentAuthorityGeneration = findGeneration(records, authorityGenerationRef);
        if (currentAuthorityGeneration === null
            || currentAuthorityGeneration.lock_break_authority_ref
              !== preAuthorityGeneration.lock_break_authority_ref
            || currentAuthorityGeneration.reactivation_authority_ref
              !== preAuthorityGeneration.reactivation_authority_ref) {
          fail("stored_authority_lineage_changed");
        }
      }
      let reactivation = null;
      if (active?.state === "revoked") {
        if (request.expected_active_generation_ref !== null
            || input.reactivation_request === undefined
            || input.trusted_reactivation_request_digest === undefined) {
          fail("active_pointer_revoked");
        }
        reactivation = validateReactivationRequest(
          input, candidate, active, operationNow,
          preAuthorityGeneration.reactivation_authority_ref,
        );
      } else if (input.reactivation_request !== undefined
          || input.trusted_reactivation_request_digest !== undefined) {
        fail("reactivation_unexpected");
      }
      const desiredPointer = activePointerRecord({
        generation: candidate,
        previous_generation_ref: reactivation === null
          ? request.expected_active_generation_ref : active.previous_generation_ref,
        transition_ref: reactivation?.reactivation_ref ?? null,
        revocation_head_ref: active?.revocation_head_ref ?? null,
        reactivation_request_digest: reactivation?.digest ?? null,
      });
      if (active?.state === "active" && active.active_generation_ref === candidate.generation_ref) {
        if (existing === null) fail("active_generation_unrecognized");
        if (!samePointer(active, desiredPointer)) fail("active_pointer_compare_failed");
        return registrationReceipt(
          "no_op", request, candidate, sha256(active.bytes), lockBreakReceipt, reactivation,
        );
      }
      const activeRef = active?.active_generation_ref ?? null;
      if (activeRef !== request.expected_active_generation_ref) fail("active_pointer_compare_failed");
      if (request.expected_active_generation_ref !== null
          && findGeneration(records, request.expected_active_generation_ref) === null) {
        fail("expected_generation_unrecognized");
      }
      if (existing === null && records.length > 0) {
        const maximumEpoch = Math.max(...records.map((entry) => entry.entries[0].binding_epoch));
        if (candidate.binding_epoch <= maximumEpoch) fail("binding_epoch_not_monotonic");
      }
      if (existing === null) {
        await revalidateTargetSuiteIdentity(targetIdentity);
        await createOrReadExact(
          join(layout.generation_root, `${digestHex(generationDigest)}.json`),
          bytes,
          "generation_content_divergence",
          layout,
          layout.generation_identity,
        );
      }
      await revalidateTargetSuiteIdentity(targetIdentity);
      const pointerResult = await compareAndSwapActivePointer(layout, active, desiredPointer);
      return registrationReceipt(
        reactivation === null ? "applied" : "reactivated",
        request,
        candidate,
        pointerResult.pointer_digest,
        lockBreakReceipt,
        reactivation,
      );
      },
    );
  } catch (error) {
    return hold(error instanceof ControlStoreError ? error.code : "control_store_operation_failed");
  }
}

function validateRevocationRequest(input) {
  return Object.freeze({
    activation_ref: assertRef(input.activation_ref, "activation_ref_invalid"),
    writer_ref: assertRef(input.writer_ref, "writer_ref_invalid"),
    revoke_ref: assertRef(input.revoke_ref, "revoke_ref_invalid"),
    expected_active_generation_ref: assertRef(
      input.expected_active_generation_ref, "expected_active_generation_ref_invalid",
    ),
    rollback_to_generation_ref: assertNullableRef(
      input.rollback_to_generation_ref, "rollback_to_generation_ref_invalid",
    ),
  });
}

function revocationRecord(request, current, currentGeneration) {
  return {
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    record_type: "revocation_receipt",
    revoke_ref: request.revoke_ref,
    activation_ref: request.activation_ref,
    writer_ref: request.writer_ref,
    expected_active_generation_ref: request.expected_active_generation_ref,
    rollback_to_generation_ref: request.rollback_to_generation_ref,
    prior_generation_digest: current.active_generation_digest,
    revoked_generation_ref: currentGeneration.generation_ref,
    revoked_binding_set_ref: currentGeneration.binding_set_ref,
    revoked_binding_refs: currentGeneration.entries.map((entry) => entry.binding_ref).sort(),
    revoked_packet_digest: currentGeneration.packet_digest,
    prior_revocation_ref: current.revocation_head_ref,
  };
}

function sameRevocationRequest(record, request) {
  return record.revoke_ref === request.revoke_ref
    && record.activation_ref === request.activation_ref
    && record.writer_ref === request.writer_ref
    && record.expected_active_generation_ref === request.expected_active_generation_ref
    && record.rollback_to_generation_ref === request.rollback_to_generation_ref;
}

function revocationReceipt(
  status, request, digest, priorGenerationRef, activeGenerationRef, pointerDigest,
  lockBreakReceipt = null,
) {
  return deepFreeze({
    status,
    schema: PRIVATE_TARGET_BINDING_CONTROL_STORE_SCHEMA,
    revoke_ref: request.revoke_ref,
    revocation_ref: revocationRef(digest),
    revocation_digest: digest,
    active_pointer_ref: ACTIVE_POINTER_REF,
    active_pointer_digest: pointerDigest,
    previous_generation_ref: priorGenerationRef,
    active_generation_ref: activeGenerationRef,
    binding_count: activeGenerationRef === null ? 0 : PRIVATE_TARGET_BINDING_TARGET_IDS.length,
    activation_ref: request.activation_ref,
    writer_ref: request.writer_ref,
    lock_break_ref: lockBreakReceipt?.ref ?? null,
    lock_break_digest: lockBreakReceipt?.digest ?? null,
  });
}

const REVOKE_REQUEST_KEYS = Object.freeze([
  "enabled", "activation_ref", "writer_ref", "revoke_ref",
  "expected_active_generation_ref", "rollback_to_generation_ref", "target_suite_root",
  "control_root", "containment_root", "lock_break_request",
  "trusted_lock_break_request_digest",
  "acl_admission_packet", "trusted_acl_admission_packet_digest",
]);
const REVOKE_REQUIRED_KEYS = Object.freeze([
  "enabled", "activation_ref", "writer_ref", "revoke_ref",
  "expected_active_generation_ref", "rollback_to_generation_ref", "target_suite_root",
  "control_root", "containment_root",
  "acl_admission_packet", "trusted_acl_admission_packet_digest",
]);

async function revokeOrRollbackPrivateTargetBindingSetImpl(input = {}) {
  if (input?.enabled !== true) return hold("adapter_default_off");
  try {
    assertOperationEnvelope(input, REVOKE_REQUEST_KEYS, REVOKE_REQUIRED_KEYS);
    const operationNow = Date.now();
    if (!Number.isFinite(operationNow)) fail("host_clock_invalid");
    const request = validateRevocationRequest(input);
    const targetIdentity = await captureTargetSuiteIdentity({ ...input, packet: null });
    const targetCommitment = targetSuiteIdentityCommitment(targetIdentity);
    validateWriterExclusiveAclAdmission(input, targetIdentity, request.writer_ref, operationNow);
    const layout = await admittedStoreLayout(input);
    const preRecords = await readGenerations(layout);
    const preRevocations = await readRevocationReceipts(layout);
    const preActive = await readActivePointer(layout);
    validateRevocationHead(preRecords, preRevocations, preActive);
    assertTargetSuiteLineage(preRecords, preActive, targetCommitment);
    if (preActive === null || preActive.state !== "active") fail("active_pointer_compare_failed");
    const preActiveGeneration = findGeneration(preRecords, preActive.active_generation_ref);
    if (preActiveGeneration === null
        || preActiveGeneration.generation_digest !== preActive.active_generation_digest) {
      fail("active_generation_unrecognized");
    }
    return await withActiveLock(
      layout,
      lockContext(
        input, request, operationNow, preActiveGeneration.lock_break_authority_ref,
      ),
      async (lockBreakReceipt) => {
      const records = await readGenerations(layout);
      const revocations = await readRevocationReceipts(layout);
      const current = await readActivePointer(layout);
      validateRevocationHead(records, revocations, current);
      assertTargetSuiteLineage(records, current, targetCommitment);
      if (!samePointer(current, preActive)) fail("active_pointer_compare_failed");
      const priorReceipt = revocations.find((record) => sameRevocationRequest(record, request)) ?? null;
      const reusedRevokeRef = revocations.find((record) => record.revoke_ref === request.revoke_ref) ?? null;
      if (reusedRevokeRef !== null && !sameRevocationRequest(reusedRevokeRef, request)) {
        fail("revoke_ref_reuse");
      }
      if (priorReceipt !== null && current !== null
          && current.previous_generation_ref === request.expected_active_generation_ref
          && current.transition_ref === priorReceipt.revocation_ref
          && ((request.rollback_to_generation_ref === null && current.state === "revoked")
            || (request.rollback_to_generation_ref !== null && current.state === "active"
              && current.active_generation_ref === request.rollback_to_generation_ref))) {
        return revocationReceipt(
          "no_op",
          request,
          priorReceipt.revocation_digest,
          request.expected_active_generation_ref,
          request.rollback_to_generation_ref,
          sha256(current.bytes),
          lockBreakReceipt,
        );
      }
      if (current === null || current.state !== "active"
          || current.active_generation_ref !== request.expected_active_generation_ref) {
        fail("active_pointer_compare_failed");
      }
      if (current.activation_ref !== request.activation_ref || current.writer_ref !== request.writer_ref) {
        fail("active_pointer_authority_mismatch");
      }
      const currentGeneration = findGeneration(records, current.active_generation_ref);
      if (currentGeneration === null || currentGeneration.generation_digest !== current.active_generation_digest) {
        fail("active_generation_unrecognized");
      }
      if (currentGeneration.lock_break_authority_ref
          !== preActiveGeneration.lock_break_authority_ref) {
        fail("lock_break_authority_mismatch");
      }
      const boundTargetIdentity = await captureTargetSuiteIdentity({
        ...input,
        packet: { entries: currentGeneration.entries },
      });
      if (request.rollback_to_generation_ref !== null) {
        if (currentGeneration.parent_generation_ref !== request.rollback_to_generation_ref
            || findGeneration(records, request.rollback_to_generation_ref) === null) {
          fail("rollback_target_not_prior_generation");
        }
      }
      const record = revocationRecord(request, current, currentGeneration);
      const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
      const digest = sha256(bytes);
      const transitionRef = revocationRef(digest);
      await revalidateTargetSuiteIdentity(boundTargetIdentity);
      await createOrReadExact(
        join(layout.receipt_root, `${digestHex(digest)}.json`), bytes,
        "revocation_receipt_divergence", layout, layout.receipt_identity,
      );
      const next = request.rollback_to_generation_ref === null
        ? revokedPointerRecord({
          previous_generation_ref: current.active_generation_ref,
          activation_ref: request.activation_ref,
          writer_ref: request.writer_ref,
          transition_ref: transitionRef,
          lock_break_authority_ref: currentGeneration.lock_break_authority_ref,
          reactivation_authority_ref: currentGeneration.reactivation_authority_ref,
          target_suite_identity_commitment:
            currentGeneration.target_suite_identity_commitment,
        })
        : activePointerRecord({
          generation: findGeneration(records, request.rollback_to_generation_ref),
          previous_generation_ref: current.active_generation_ref,
          transition_ref: transitionRef,
          revocation_head_ref: transitionRef,
        });
      await revalidateTargetSuiteIdentity(boundTargetIdentity);
      const pointerResult = await compareAndSwapActivePointer(layout, current, next);
      return revocationReceipt(
        request.rollback_to_generation_ref === null ? "revoked" : "rolled_back",
        request,
        digest,
        current.active_generation_ref,
        request.rollback_to_generation_ref,
        pointerResult.pointer_digest,
        lockBreakReceipt,
      );
      },
    );
  } catch (error) {
    return hold(error instanceof ControlStoreError ? error.code : "control_store_operation_failed");
  }
}

export function registerPrivateTargetBindingSet(input) {
  return registerPrivateTargetBindingSetImpl(input);
}

export function revokeOrRollbackPrivateTargetBindingSet(input) {
  return revokeOrRollbackPrivateTargetBindingSetImpl(input);
}
