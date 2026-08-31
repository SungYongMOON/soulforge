// Synthetic-only, create-only recovery canary.
//
// The runner owns an ephemeral OS-temp workspace.  It never reads caller
// source data, writes a configured backup target, or emits paths/source bytes.
// Its output is a technical candidate receipt only; Human Owner acceptance is
// intentionally delegated to synthetic_recovery_canary_acceptance.mjs.

import { createHash } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { types } from "node:util";

import {
  SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF,
  SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
  SYNTHETIC_RECOVERY_CANARY_FIXTURE_SCHEMA,
  SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF,
  SYNTHETIC_RECOVERY_CANARY_SOURCE_REF,
  createSyntheticRecoveryCanaryFixture,
  disposeSyntheticRecoveryCanaryFixture,
} from "./synthetic_recovery_canary_fixture.mjs";

export const SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_SCHEMA =
  "soulforge.backup_controller.synthetic_recovery_canary_technical_receipt.v0";

export const SYNTHETIC_RECOVERY_CANARY_HOLD_CODES = Object.freeze({
  OPTIONS_INVALID: "SYNTHETIC_RECOVERY_CANARY_OPTIONS_INVALID",
  FIXTURE_INTEGRITY_INVALID: "SYNTHETIC_RECOVERY_CANARY_FIXTURE_INTEGRITY_INVALID",
  PATH_TRAVERSAL_REJECTED: "SYNTHETIC_RECOVERY_CANARY_PATH_TRAVERSAL_REJECTED",
  TARGET_OCCUPIED: "SYNTHETIC_RECOVERY_CANARY_TARGET_OCCUPIED",
  BACKUP_READBACK_MISMATCH: "SYNTHETIC_RECOVERY_CANARY_BACKUP_READBACK_MISMATCH",
  RESTORE_PARITY_MISMATCH: "SYNTHETIC_RECOVERY_CANARY_RESTORE_PARITY_MISMATCH",
  IO_FAILURE: "SYNTHETIC_RECOVERY_CANARY_IO_FAILURE",
  TECHNICAL_RECEIPT_INVALID: "SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_INVALID",
});

const H = SYNTHETIC_RECOVERY_CANARY_HOLD_CODES;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF = /^[a-z][a-z0-9._-]{1,160}$/u;
const SAFE_RELATIVE_PATH = /^[a-z0-9][a-z0-9._/-]{0,127}$/u;
const TEST_FAULTS = new Set([
  "backup_corruption",
  "occupied_backup_target",
  "manifest_traversal",
  "partial_restore",
]);
const TECHNICAL_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "fixture_ref",
  "source_ref",
  "project_scope_ref",
  "backup_restore_owner_ref",
  "source_manifest_digest",
  "backup_generation_ref",
  "backup_manifest_ref",
  "backup_manifest_digest",
  "restore_test_ref",
  "source_item_count",
  "source_byte_length",
  "backup_item_count",
  "backup_byte_length",
  "restored_item_count",
  "restored_byte_length",
  "recoverable_item_gap",
  "recoverable_byte_gap",
  "create_only",
  "overwrite_allowed",
  "manifest_hash_readback",
  "backup_hash_readback",
  "restore_manifest_hash_readback",
  "restore_hash_readback",
  "isolated_restore",
  "item_parity",
  "byte_parity",
  "elapsed_ms",
  "technical_state",
  "human_acceptance_state",
  "technical_receipt_digest",
]);

export class SyntheticRecoveryCanaryRunnerError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyntheticRecoveryCanaryRunnerError";
    this.code = code;
  }
}

function fail(code) {
  throw new SyntheticRecoveryCanaryRunnerError(code);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestCanonical(value) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function plainDescriptors(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) return null;
    if (Object.values(descriptors).some((descriptor) => !("value" in descriptor)
      || descriptor.get !== undefined || descriptor.set !== undefined)) return null;
    return descriptors;
  } catch {
    return null;
  }
}

function exactRecord(value, fields) {
  const descriptors = plainDescriptors(value);
  if (descriptors === null) return null;
  const keys = Object.keys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))
      || fields.some((key) => !(key in descriptors))) return null;
  return Object.fromEntries(fields.map((key) => [key, descriptors[key].value]));
}

function isSafeRef(value) {
  return typeof value === "string" && SAFE_REF.test(value);
}

function isDigest(value) {
  return typeof value === "string" && SHA256.test(value);
}

function isNonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function containedBy(parent, child) {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  const pathRelative = relative(parentPath, childPath);
  return pathRelative === "" || (!pathRelative.startsWith(`..${sep}`)
    && pathRelative !== ".." && !pathRelative.includes(`..${sep}`));
}

function disjoint(left, right) {
  return !containedBy(left, right) && !containedBy(right, left);
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !SAFE_RELATIVE_PATH.test(value)
      || value.includes("\\") || value.startsWith("/") || value.includes("//")) {
    fail(H.PATH_TRAVERSAL_REJECTED);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail(H.PATH_TRAVERSAL_REJECTED);
  }
  return value;
}

function safeChild(root, relativePath) {
  const normalized = safeRelativePath(relativePath);
  const target = resolve(root, ...normalized.split("/"));
  if (!containedBy(root, target)) fail(H.PATH_TRAVERSAL_REJECTED);
  return target;
}

async function writeCreateOnly(path, bytes) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureParent(root, relativePath) {
  const target = safeChild(root, relativePath);
  const parent = dirname(target);
  if (!containedBy(root, parent)) fail(H.PATH_TRAVERSAL_REJECTED);
  await mkdir(parent, { recursive: true });
  return target;
}

async function readSyntheticSourceManifest(sourceRoot) {
  const items = [];
  async function visit(relativeDirectory) {
    const directory = relativeDirectory === "" ? sourceRoot : safeChild(sourceRoot, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const relativePath = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      safeRelativePath(relativePath);
      const path = safeChild(sourceRoot, relativePath);
      const observed = await lstat(path);
      if (observed.isSymbolicLink()) fail(H.FIXTURE_INTEGRITY_INVALID);
      if (observed.isDirectory()) {
        await visit(relativePath);
      } else if (observed.isFile()) {
        const bytes = await readFile(path);
        items.push({
          relative_path: relativePath,
          byte_length: bytes.length,
          content_digest: digestBytes(bytes),
        });
      } else {
        fail(H.FIXTURE_INTEGRITY_INVALID);
      }
    }
  }
  await visit("");
  const frozenItems = Object.freeze(items.map((item) => Object.freeze(item)));
  const bytes = frozenItems.reduce((total, item) => total + item.byte_length, 0);
  const basis = {
    schema_version: "soulforge.backup_controller.synthetic_recovery_canary_source_manifest.v0",
    fixture_ref: SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
    items: frozenItems,
  };
  return deepFreeze({
    ...basis,
    item_count: frozenItems.length,
    byte_length: bytes,
    content_digest: digestCanonical(basis),
  });
}

function fixtureMatchesSource(fixture, sourceManifest) {
  if (fixture === null || typeof fixture !== "object"
      || fixture.schema_version !== SYNTHETIC_RECOVERY_CANARY_FIXTURE_SCHEMA
      || fixture.fixture_ref !== SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF
      || fixture.source_ref !== SYNTHETIC_RECOVERY_CANARY_SOURCE_REF
      || fixture.project_scope_ref !== SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF
      || fixture.backup_restore_owner_ref !== SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF
      || !Array.isArray(fixture.item_manifest?.items)
      || fixture.item_manifest.items.length !== sourceManifest.items.length) return false;
  return fixture.item_manifest.items.every((expected, index) => {
    const observed = sourceManifest.items[index];
    return expected !== null && typeof expected === "object"
      && expected.relative_path === observed.relative_path
      && expected.byte_length === observed.byte_length
      && expected.content_digest === observed.content_digest;
  });
}

function backupManifest(sourceManifest) {
  const basis = {
    schema_version: "soulforge.backup_controller.synthetic_recovery_canary_backup_manifest.v0",
    fixture_ref: SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
    source_manifest_digest: sourceManifest.content_digest,
    item_count: sourceManifest.item_count,
    byte_length: sourceManifest.byte_length,
    items: sourceManifest.items,
  };
  return deepFreeze({ ...basis, manifest_digest: digestCanonical(basis) });
}

async function writeAndReadManifest(root, manifest) {
  const bytes = Buffer.from(canonical(manifest), "utf8");
  const path = safeChild(root, "manifest.json");
  await writeCreateOnly(path, bytes);
  const readback = await readFile(path);
  if (!readback.equals(bytes) || digestBytes(readback) !== digestBytes(bytes)) {
    return { ok: false, manifest_digest: null, bytes };
  }
  let parsed;
  try {
    parsed = JSON.parse(readback.toString("utf8"));
  } catch {
    return { ok: false, manifest_digest: null, bytes };
  }
  if (canonical(parsed) !== canonical(manifest)) {
    return { ok: false, manifest_digest: null, bytes };
  }
  return { ok: true, manifest_digest: digestBytes(bytes), bytes };
}

async function readManifestReadback(root, expectedBytes) {
  const observed = await readFile(safeChild(root, "manifest.json"));
  if (!observed.equals(expectedBytes) || digestBytes(observed) !== digestBytes(expectedBytes)) return false;
  try {
    return canonical(JSON.parse(observed.toString("utf8"))) === expectedBytes.toString("utf8");
  } catch {
    return false;
  }
}

async function reconcileTree(root, manifest) {
  let recoveredItemCount = 0;
  let recoveredByteLength = 0;
  for (const item of manifest.items) {
    try {
      const path = safeChild(root, item.relative_path);
      const observed = await lstat(path);
      if (!observed.isFile() || observed.isSymbolicLink()) continue;
      const bytes = await readFile(path);
      if (bytes.length !== item.byte_length || digestBytes(bytes) !== item.content_digest) continue;
      recoveredItemCount += 1;
      recoveredByteLength += bytes.length;
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return Object.freeze({
    recovered_item_count: recoveredItemCount,
    recovered_byte_length: recoveredByteLength,
    item_parity: recoveredItemCount === manifest.item_count,
    byte_parity: recoveredByteLength === manifest.byte_length,
  });
}

async function corruptOneBackupItem(root, manifest) {
  const first = manifest.items[0];
  const path = safeChild(root, first.relative_path);
  const bytes = await readFile(path);
  const altered = Buffer.from(bytes);
  altered[0] ^= 0xff;
  await writeFile(path, altered);
}

function normalizeOptions(rawOptions) {
  if (rawOptions === undefined) return Object.freeze({ test_fault: null });
  const record = exactRecord(rawOptions, ["test_fault"]);
  if (record === null || (record.test_fault !== null && !TEST_FAULTS.has(record.test_fault))) {
    fail(H.OPTIONS_INVALID);
  }
  return Object.freeze(record);
}

function refsFor(sourceManifest) {
  const shortDigest = sourceManifest.content_digest.slice(7, 31);
  return Object.freeze({
    backup_generation_ref: `backup.synthetic-recovery-canary.${shortDigest}`,
    backup_manifest_ref: `manifest.synthetic-recovery-canary.${shortDigest}`,
    restore_test_ref: `restore-test.synthetic-recovery-canary.${shortDigest}`,
  });
}

function buildTechnicalReceipt(state, elapsedMs, technicalState) {
  const sourceItemCount = state.source_manifest?.item_count ?? 0;
  const sourceByteLength = state.source_manifest?.byte_length ?? 0;
  const restoredItemCount = state.restored_item_count ?? 0;
  const restoredByteLength = state.restored_byte_length ?? 0;
  const base = {
    schema_version: SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_SCHEMA,
    fixture_ref: SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF,
    source_ref: SYNTHETIC_RECOVERY_CANARY_SOURCE_REF,
    project_scope_ref: SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF,
    backup_restore_owner_ref: SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF,
    source_manifest_digest: state.source_manifest?.content_digest ?? null,
    backup_generation_ref: state.refs?.backup_generation_ref ?? null,
    backup_manifest_ref: state.refs?.backup_manifest_ref ?? null,
    backup_manifest_digest: state.backup_manifest_digest ?? null,
    restore_test_ref: state.refs?.restore_test_ref ?? null,
    source_item_count: sourceItemCount,
    source_byte_length: sourceByteLength,
    backup_item_count: state.backup_item_count ?? 0,
    backup_byte_length: state.backup_byte_length ?? 0,
    restored_item_count: restoredItemCount,
    restored_byte_length: restoredByteLength,
    recoverable_item_gap: Math.max(0, sourceItemCount - restoredItemCount),
    recoverable_byte_gap: Math.max(0, sourceByteLength - restoredByteLength),
    create_only: true,
    overwrite_allowed: false,
    manifest_hash_readback: state.manifest_hash_readback === true,
    backup_hash_readback: state.backup_hash_readback === true,
    restore_manifest_hash_readback: state.restore_manifest_hash_readback === true,
    restore_hash_readback: state.restore_hash_readback === true,
    isolated_restore: state.isolated_restore === true,
    item_parity: state.item_parity === true,
    byte_parity: state.byte_parity === true,
    elapsed_ms: Math.max(0, Math.floor(elapsedMs)),
    technical_state: technicalState,
    human_acceptance_state: "pending",
  };
  return deepFreeze({ ...base, technical_receipt_digest: digestCanonical(base) });
}

export function syntheticRecoveryCanaryTechnicalReceiptDigest(receipt) {
  const record = exactRecord(receipt, TECHNICAL_RECEIPT_FIELDS);
  if (record === null) return null;
  const { technical_receipt_digest: _ignored, ...basis } = record;
  return digestCanonical(basis);
}

export function validateSyntheticRecoveryCanaryTechnicalReceipt(rawReceipt) {
  const receipt = exactRecord(rawReceipt, TECHNICAL_RECEIPT_FIELDS);
  if (receipt === null
      || receipt.schema_version !== SYNTHETIC_RECOVERY_CANARY_TECHNICAL_RECEIPT_SCHEMA
      || receipt.fixture_ref !== SYNTHETIC_RECOVERY_CANARY_FIXTURE_REF
      || receipt.source_ref !== SYNTHETIC_RECOVERY_CANARY_SOURCE_REF
      || receipt.project_scope_ref !== SYNTHETIC_RECOVERY_CANARY_PROJECT_SCOPE_REF
      || receipt.backup_restore_owner_ref !== SYNTHETIC_RECOVERY_CANARY_BACKUP_RESTORE_OWNER_REF
      || !isNonnegativeInteger(receipt.source_item_count)
      || !isNonnegativeInteger(receipt.source_byte_length)
      || !isNonnegativeInteger(receipt.backup_item_count)
      || !isNonnegativeInteger(receipt.backup_byte_length)
      || !isNonnegativeInteger(receipt.restored_item_count)
      || !isNonnegativeInteger(receipt.restored_byte_length)
      || !isNonnegativeInteger(receipt.recoverable_item_gap)
      || !isNonnegativeInteger(receipt.recoverable_byte_gap)
      || !isNonnegativeInteger(receipt.elapsed_ms)
      || receipt.create_only !== true || receipt.overwrite_allowed !== false
      || typeof receipt.manifest_hash_readback !== "boolean"
      || typeof receipt.backup_hash_readback !== "boolean"
      || typeof receipt.restore_manifest_hash_readback !== "boolean"
      || typeof receipt.restore_hash_readback !== "boolean"
      || typeof receipt.isolated_restore !== "boolean"
      || typeof receipt.item_parity !== "boolean"
      || typeof receipt.byte_parity !== "boolean"
      || !["synthetic_technical_restore_candidate", "hold"].includes(receipt.technical_state)
      || receipt.human_acceptance_state !== "pending"
      || !isDigest(receipt.technical_receipt_digest)
      || syntheticRecoveryCanaryTechnicalReceiptDigest(receipt) !== receipt.technical_receipt_digest) {
    return Object.freeze({ valid: false, hold_code: H.TECHNICAL_RECEIPT_INVALID });
  }

  const allRefsPresent = [
    receipt.source_manifest_digest,
    receipt.backup_generation_ref,
    receipt.backup_manifest_ref,
    receipt.backup_manifest_digest,
    receipt.restore_test_ref,
  ].every((value) => value !== null);
  const allRefsValid = (receipt.source_manifest_digest === null || isDigest(receipt.source_manifest_digest))
    && (receipt.backup_manifest_digest === null || isDigest(receipt.backup_manifest_digest))
    && [receipt.backup_generation_ref, receipt.backup_manifest_ref, receipt.restore_test_ref]
      .every((value) => value === null || isSafeRef(value));
  if (!allRefsValid) return Object.freeze({ valid: false, hold_code: H.TECHNICAL_RECEIPT_INVALID });

  if (receipt.technical_state === "synthetic_technical_restore_candidate"
      && (!allRefsPresent || !receipt.manifest_hash_readback || !receipt.backup_hash_readback
        || !receipt.restore_manifest_hash_readback || !receipt.restore_hash_readback
        || !receipt.isolated_restore || !receipt.item_parity || !receipt.byte_parity
        || receipt.backup_item_count !== receipt.source_item_count
        || receipt.backup_byte_length !== receipt.source_byte_length
        || receipt.restored_item_count !== receipt.source_item_count
        || receipt.restored_byte_length !== receipt.source_byte_length
        || receipt.recoverable_item_gap !== 0 || receipt.recoverable_byte_gap !== 0)) {
    return Object.freeze({ valid: false, hold_code: H.TECHNICAL_RECEIPT_INVALID });
  }
  return deepFreeze({ valid: true, receipt });
}

export async function runSyntheticRecoveryCanary(rawOptions = undefined) {
  const startedAt = Date.now();
  const state = {
    source_manifest: null,
    refs: null,
    backup_manifest_digest: null,
    backup_item_count: 0,
    backup_byte_length: 0,
    restored_item_count: 0,
    restored_byte_length: 0,
    manifest_hash_readback: false,
    backup_hash_readback: false,
    restore_manifest_hash_readback: false,
    restore_hash_readback: false,
    isolated_restore: false,
    item_parity: false,
    byte_parity: false,
  };
  let fixture = null;
  try {
    const options = normalizeOptions(rawOptions);
    fixture = await createSyntheticRecoveryCanaryFixture();
    state.source_manifest = await readSyntheticSourceManifest(fixture.source_root);
    state.refs = refsFor(state.source_manifest);
    if (!fixtureMatchesSource(fixture, state.source_manifest)) fail(H.FIXTURE_INTEGRITY_INVALID);

    const manifest = backupManifest(state.source_manifest);
    const activeManifest = options.test_fault === "manifest_traversal"
      ? deepFreeze({ ...manifest, items: Object.freeze([
        { ...manifest.items[0], relative_path: "../escaped.bin" },
        ...manifest.items.slice(1),
      ]) })
      : manifest;
    for (const item of activeManifest.items) safeRelativePath(item.relative_path);

    const backupParent = join(fixture.workspace_root, "backup");
    const backupRoot = join(backupParent, "generation");
    const restoreParent = join(fixture.workspace_root, "restore");
    const restoreRoot = join(restoreParent, "isolated-generation");
    if (!disjoint(backupRoot, restoreRoot)) fail(H.PATH_TRAVERSAL_REJECTED);
    await mkdir(backupParent, { recursive: false });
    if (options.test_fault === "occupied_backup_target") {
      await mkdir(backupRoot, { recursive: true });
    }
    try {
      await mkdir(backupRoot, { recursive: false });
    } catch (error) {
      if (error && error.code === "EEXIST") fail(H.TARGET_OCCUPIED);
      throw error;
    }

    for (const item of activeManifest.items) {
      const source = safeChild(fixture.source_root, item.relative_path);
      const target = await ensureParent(backupRoot, item.relative_path);
      await copyFile(source, target, FS_CONSTANTS.COPYFILE_EXCL);
    }
    const backupManifestReadback = await writeAndReadManifest(backupRoot, activeManifest);
    if (!backupManifestReadback.ok) fail(H.BACKUP_READBACK_MISMATCH);
    state.backup_manifest_digest = backupManifestReadback.manifest_digest;
    state.manifest_hash_readback = true;

    if (options.test_fault === "backup_corruption") {
      await corruptOneBackupItem(backupRoot, activeManifest);
    }
    const backupReconciliation = await reconcileTree(backupRoot, activeManifest);
    state.backup_item_count = backupReconciliation.recovered_item_count;
    state.backup_byte_length = backupReconciliation.recovered_byte_length;
    state.backup_hash_readback = backupReconciliation.item_parity && backupReconciliation.byte_parity;
    if (!state.backup_hash_readback) fail(H.BACKUP_READBACK_MISMATCH);

    await mkdir(restoreParent, { recursive: false });
    await mkdir(restoreRoot, { recursive: false });
    state.isolated_restore = true;
    await copyFile(safeChild(backupRoot, "manifest.json"), safeChild(restoreRoot, "manifest.json"),
      FS_CONSTANTS.COPYFILE_EXCL);
    state.restore_manifest_hash_readback = await readManifestReadback(restoreRoot, backupManifestReadback.bytes);
    if (!state.restore_manifest_hash_readback) fail(H.RESTORE_PARITY_MISMATCH);
    for (const [index, item] of activeManifest.items.entries()) {
      if (options.test_fault === "partial_restore" && index === activeManifest.items.length - 1) continue;
      const source = safeChild(backupRoot, item.relative_path);
      const target = await ensureParent(restoreRoot, item.relative_path);
      await copyFile(source, target, FS_CONSTANTS.COPYFILE_EXCL);
    }
    const restoreReconciliation = await reconcileTree(restoreRoot, activeManifest);
    state.restored_item_count = restoreReconciliation.recovered_item_count;
    state.restored_byte_length = restoreReconciliation.recovered_byte_length;
    state.restore_hash_readback = restoreReconciliation.item_parity && restoreReconciliation.byte_parity;
    state.item_parity = restoreReconciliation.item_parity;
    state.byte_parity = restoreReconciliation.byte_parity;
    if (!state.restore_hash_readback) fail(H.RESTORE_PARITY_MISMATCH);

    const receipt = buildTechnicalReceipt(state, Date.now() - startedAt,
      "synthetic_technical_restore_candidate");
    return deepFreeze({ status: "SYNTHETIC_TECHNICAL_RESTORE_CANDIDATE", receipt });
  } catch (error) {
    const holdCode = error instanceof SyntheticRecoveryCanaryRunnerError
      ? error.code : H.IO_FAILURE;
    const receipt = buildTechnicalReceipt(state, Date.now() - startedAt, "hold");
    return deepFreeze({ status: "HOLD", hold_code: holdCode, receipt });
  } finally {
    if (fixture !== null) {
      try {
        await disposeSyntheticRecoveryCanaryFixture(fixture);
      } catch {
        // The public result must not contain a local temporary path or error.
      }
    }
  }
}
