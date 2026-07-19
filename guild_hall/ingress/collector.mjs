import { constants } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const RUN_SCHEMA = "soulforge.ingress.staging_run.v1";
export const RECEIPT_SCHEMA = "soulforge.ingress.staging_receipt.v1";
export const CHECKPOINT_SCHEMA = "soulforge.ingress.staging_checkpoint.v1";
export const STORAGE_MANIFEST_SCHEMA = "soulforge.hpp_private_custody.v1";

export const LANE_CONFIG = Object.freeze({
  mail: Object.freeze({
    manifestLane: "mail",
    payloadRoot: "ingress/mailbox",
    incomingRoot: "ingress/mailbox/canary/incoming",
    receiptRoot: "state/receipts/mail",
    checkpointRoot: "state/checkpoints/mail",
    quarantineRoot: "quarantine/mail",
  }),
  voice: Object.freeze({
    manifestLane: "voice",
    payloadRoot: "ingress/voice",
    incomingRoot: "ingress/voice/canary/incoming",
    receiptRoot: "state/receipts/voice",
    checkpointRoot: "state/checkpoints/voice",
    quarantineRoot: "quarantine/voice",
  }),
  team_files: Object.freeze({
    manifestLane: "team_files",
    payloadRoot: "ingress/team_files",
    incomingRoot: "ingress/team_files/incoming",
    receiptRoot: "state/receipts/team_files",
    checkpointRoot: "state/checkpoints/team_files",
    quarantineRoot: "quarantine/team_files",
  }),
  structured_pc_work: Object.freeze({
    manifestLane: "pc_activity",
    payloadRoot: "ingress/pc_activity",
    incomingRoot: "ingress/pc_activity/work_events/incoming",
    receiptRoot: "state/receipts/pc_activity",
    checkpointRoot: "state/checkpoints/pc_activity",
    quarantineRoot: "quarantine/pc_activity",
  }),
  run_logs: Object.freeze({
    manifestLane: "run_logs",
    payloadRoot: "ingress/run_logs",
    incomingRoot: "ingress/run_logs/incoming",
    receiptRoot: "state/receipts/run_logs",
    checkpointRoot: "state/checkpoints/run_logs",
    quarantineRoot: "quarantine/run_logs",
  }),
});

const RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "lane",
  "source_owner_ref",
  "source_key",
  "source_identity_digest",
  "sha256",
  "size",
  "storage_ref",
  "checkpoint_ref",
  "project_state",
  "source_deleted",
  "source_overwritten",
]);
const CHECKPOINT_FIELDS = Object.freeze([
  "schema_version",
  "lane",
  "source_owner_ref",
  "source_key",
  "source_identity_digest",
  "sha256",
  "size",
  "storage_ref",
  "receipt_ref",
  "project_state",
  "complete",
]);
const SAFE_SOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function safeContractPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\\")
    || posix.isAbsolute(value)
    || posix.normalize(value) !== value
    || value === "."
    || value === ".."
    || value.startsWith("../")
  ) fail("invalid_storage_manifest");
  return value;
}

function sourceIdentifier(value, name) {
  if (value === undefined || value === null || value === "") fail(`${name}_required`);
  if (typeof value !== "string" || !SAFE_SOURCE_IDENTIFIER.test(value)) fail(`invalid_${name}`);
  return value;
}

function sourceIdentityDigest(lane, sourceOwnerRef, sourceKey) {
  return createHash("sha256")
    .update("soulforge.ingress.source_identity.v1\0", "utf8")
    .update(lane, "utf8")
    .update("\0", "utf8")
    .update(sourceOwnerRef, "utf8")
    .update("\0", "utf8")
    .update(sourceKey, "utf8")
    .digest("hex");
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

async function assertNormalPath(path, kind) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${kind}_missing`);
    throw error;
  }
  if (info.isSymbolicLink()) fail(`unsafe_${kind}`);
  if (kind === "data_root" && !info.isDirectory()) fail("data_root_not_directory");
  if (kind === "source" && !info.isFile()) fail("source_not_regular_file");
  const lexical = resolve(path);
  const physical = await realpath(path);
  if (comparable(lexical) !== comparable(physical)) fail(`unsafe_${kind}`);
  return physical;
}

async function inspectDirectoryChain(root, target, { create = false } = {}) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!inside(rootPath, targetPath)) fail("staging_path_escape");
  let current = rootPath;
  const parts = relative(rootPath, targetPath).split(sep).filter(Boolean);
  for (const part of parts) {
    current = resolve(current, part);
    if (!(await exists(current))) {
      if (!create) return;
      try {
        await mkdir(current);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("unsafe_staging_directory");
  }
  if (await exists(targetPath)) {
    const physical = await realpath(targetPath);
    if (!inside(await realpath(rootPath), physical)) fail("staging_path_escape");
  }
}

async function readStorageManifest(dataRoot, laneConfig) {
  const manifestPath = resolve(dataRoot, "storage_manifest.json");
  if (!inside(dataRoot, manifestPath)) fail("storage_manifest_path_escape");
  let info;
  try {
    info = await lstat(manifestPath);
  } catch (error) {
    if (error?.code === "ENOENT") fail("storage_manifest_missing");
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_storage_manifest");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("invalid_storage_manifest");
  }

  const manifestLane = laneConfig.manifestLane;
  const contract = manifest?.lane_contracts?.[manifestLane];
  if (
    manifest?.schema_version !== STORAGE_MANIFEST_SCHEMA
    || manifest?.custody_role !== "hpp_sole_writer"
    || manifest?.classification_policy !== "stable_object_identity_with_project_binding_events"
    || manifest?.cloud_sync_allowed !== false
    || manifest?.remote_direct_disk_access_allowed !== false
    || manifest?.raw_in_workmeta_allowed !== false
    || manifest?.workspace_or_workmeta_relocation !== false
    || !contract
  ) fail("invalid_storage_manifest");

  const payloadRoot = safeContractPath(manifest?.payload_roots?.[manifestLane]);
  const receiptBase = safeContractPath(manifest?.state_roots?.receipts);
  const checkpointBase = safeContractPath(manifest?.state_roots?.checkpoints);
  if (
    safeContractPath(contract.payload) !== laneConfig.payloadRoot
    || safeContractPath(contract.receipt) !== laneConfig.receiptRoot
    || safeContractPath(contract.checkpoint) !== laneConfig.checkpointRoot
    || safeContractPath(contract.quarantine) !== laneConfig.quarantineRoot
    || payloadRoot !== contract.payload
    || posix.join(receiptBase, manifestLane) !== contract.receipt
    || posix.join(checkpointBase, manifestLane) !== contract.checkpoint
  ) fail("invalid_storage_manifest");
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function sourceIdentity(path) {
  const info = await stat(path, { bigint: true });
  if (!info.isFile()) fail("source_not_regular_file");
  return info;
}

async function hashFile(path) {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function stableSourceDigest(path) {
  const before = await sourceIdentity(path);
  const sha256 = await hashFile(path);
  const after = await sourceIdentity(path);
  if (!sameIdentity(before, after)) fail("source_unstable");
  if (after.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("source_too_large");
  return { sha256, size: Number(after.size), identity: after };
}

async function inspectExistingPayload(dataRoot, path, expected) {
  if (!(await exists(path))) return false;
  await inspectDirectoryChain(dataRoot, dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_existing_payload");
  const digest = await stableSourceDigest(path);
  if (digest.sha256 !== expected.sha256 || digest.size !== expected.size) {
    fail("existing_payload_mismatch");
  }
  return true;
}

function exactObject(payload, expected, fields) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload).sort();
  const expectedKeys = [...fields].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index])
    && fields.every((field) => payload[field] === expected[field]);
}

async function inspectExistingJson(dataRoot, path, expected, fields, mismatchCode) {
  if (!(await exists(path))) return false;
  await inspectDirectoryChain(dataRoot, dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail(mismatchCode);
  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(mismatchCode);
  }
  if (!exactObject(payload, expected, fields)) fail(mismatchCode);
  return true;
}

async function removeTemporaryIfSafe(dataRoot, temporary) {
  try {
    await inspectDirectoryChain(dataRoot, dirname(temporary));
    if (!(await exists(temporary))) return;
    const info = await lstat(temporary);
    if (!info.isFile() || info.isSymbolicLink()) return;
    await rm(temporary);
  } catch {
    // A changed parent must not redirect cleanup outside the validated data root.
  }
}

async function installTemporary(dataRoot, temporary, target, mismatchVerifier) {
  try {
    await inspectDirectoryChain(dataRoot, dirname(target));
    await link(temporary, target);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    await mismatchVerifier();
    return false;
  } finally {
    await removeTemporaryIfSafe(dataRoot, temporary);
  }
}

async function writeImmutableJson(dataRoot, path, payload, fields, mismatchCode) {
  const parent = dirname(path);
  await inspectDirectoryChain(dataRoot, parent, { create: true });
  const temporary = `${path}.partial-${randomUUID()}`;
  try {
    await inspectDirectoryChain(dataRoot, parent);
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return await installTemporary(
      dataRoot,
      temporary,
      path,
      () => inspectExistingJson(dataRoot, path, payload, fields, mismatchCode),
    );
  } finally {
    await removeTemporaryIfSafe(dataRoot, temporary);
  }
}

async function copyImmutablePayload(dataRoot, sourcePath, target, expected, testHooks = {}) {
  const current = await sourceIdentity(sourcePath);
  if (!sameIdentity(current, expected.identity)) fail("source_unstable");
  const parent = dirname(target);
  await inspectDirectoryChain(dataRoot, parent, { create: true });
  if (typeof testHooks.afterPayloadParentPrepared === "function") {
    await testHooks.afterPayloadParentPrepared();
  }
  const temporary = `${target}.partial-${randomUUID()}`;
  try {
    await inspectDirectoryChain(dataRoot, parent);
    await copyFile(sourcePath, temporary, constants.COPYFILE_EXCL);
    const copied = await stableSourceDigest(temporary);
    const after = await sourceIdentity(sourcePath);
    if (
      !sameIdentity(after, expected.identity)
      || copied.sha256 !== expected.sha256
      || copied.size !== expected.size
    ) fail("source_unstable");
    if (typeof testHooks.afterPayloadTempVerified === "function") {
      await testHooks.afterPayloadTempVerified();
    }
    return await installTemporary(
      dataRoot,
      temporary,
      target,
      () => inspectExistingPayload(dataRoot, target, expected),
    );
  } finally {
    await removeTemporaryIfSafe(dataRoot, temporary);
  }
}

export async function stageIngressFile(options = {}) {
  const lane = String(options.lane || "");
  const laneConfig = LANE_CONFIG[lane];
  if (!laneConfig) fail("invalid_lane");
  const sourceOwnerRef = sourceIdentifier(options.sourceOwnerRef, "source_owner_ref");
  const sourceKey = sourceIdentifier(options.sourceKey, "source_key");
  if (typeof options.dataRoot !== "string" || !isAbsolute(options.dataRoot)) fail("data_root_must_be_absolute");
  if (typeof options.source !== "string" || options.source.length === 0) fail("source_required");

  const dataRoot = resolve(options.dataRoot);
  const sourcePath = resolve(options.source);
  const dataRootPhysical = await assertNormalPath(dataRoot, "data_root");
  const sourcePhysical = await assertNormalPath(sourcePath, "source");
  if (inside(dataRootPhysical, sourcePhysical)) fail("source_data_root_overlap");
  await readStorageManifest(dataRoot, laneConfig);

  const source = await stableSourceDigest(sourcePath);
  if (typeof options.afterSourceHash === "function") await options.afterSourceHash();
  const identityDigest = sourceIdentityDigest(lane, sourceOwnerRef, sourceKey);
  const shard = source.sha256.slice(0, 2);
  const storageRef = posix.join(laneConfig.incomingRoot, shard, source.sha256);
  const receiptRef = posix.join(laneConfig.receiptRoot, identityDigest, `${source.sha256}.json`);
  const checkpointRef = posix.join(laneConfig.checkpointRoot, identityDigest, `${source.sha256}.json`);
  const payloadPath = resolve(dataRoot, ...storageRef.split("/"));
  const receiptPath = resolve(dataRoot, ...receiptRef.split("/"));
  const checkpointPath = resolve(dataRoot, ...checkpointRef.split("/"));
  if (
    !inside(dataRoot, payloadPath)
    || !inside(dataRoot, receiptPath)
    || !inside(dataRoot, checkpointPath)
  ) fail("staging_path_escape");

  const receipt = {
    schema_version: RECEIPT_SCHEMA,
    lane,
    source_owner_ref: sourceOwnerRef,
    source_key: sourceKey,
    source_identity_digest: identityDigest,
    sha256: source.sha256,
    size: source.size,
    storage_ref: storageRef,
    checkpoint_ref: checkpointRef,
    project_state: "unclassified",
    source_deleted: false,
    source_overwritten: false,
  };
  const checkpoint = {
    schema_version: CHECKPOINT_SCHEMA,
    lane,
    source_owner_ref: sourceOwnerRef,
    source_key: sourceKey,
    source_identity_digest: identityDigest,
    sha256: source.sha256,
    size: source.size,
    storage_ref: storageRef,
    receipt_ref: receiptRef,
    project_state: "unclassified",
    complete: true,
  };

  const payloadExists = await inspectExistingPayload(dataRoot, payloadPath, source);
  const receiptExists = await inspectExistingJson(
    dataRoot,
    receiptPath,
    receipt,
    RECEIPT_FIELDS,
    "existing_receipt_mismatch",
  );
  const checkpointExists = await inspectExistingJson(
    dataRoot,
    checkpointPath,
    checkpoint,
    CHECKPOINT_FIELDS,
    "existing_checkpoint_mismatch",
  );

  let writesPerformed = 0;
  if (options.apply === true) {
    if (!payloadExists && await copyImmutablePayload(
      dataRoot,
      sourcePath,
      payloadPath,
      source,
      options.testHooks,
    )) writesPerformed += 1;
    if (!receiptExists && await writeImmutableJson(
      dataRoot,
      receiptPath,
      receipt,
      RECEIPT_FIELDS,
      "existing_receipt_mismatch",
    )) writesPerformed += 1;
    if (!checkpointExists && await writeImmutableJson(
      dataRoot,
      checkpointPath,
      checkpoint,
      CHECKPOINT_FIELDS,
      "existing_checkpoint_mismatch",
    )) writesPerformed += 1;
  }

  return {
    schema_version: RUN_SCHEMA,
    mode: options.apply === true ? "apply" : "dry_run",
    lane,
    status: payloadExists && receiptExists && checkpointExists
      ? "unchanged"
      : options.apply === true ? "staged" : "planned",
    sha256: source.sha256,
    size: source.size,
    source_identity_digest: identityDigest,
    storage_ref: storageRef,
    receipt_ref: receiptRef,
    checkpoint_ref: checkpointRef,
    project_state: "unclassified",
    writes_performed: writesPerformed,
    source_deleted: false,
    source_overwritten: false,
  };
}
