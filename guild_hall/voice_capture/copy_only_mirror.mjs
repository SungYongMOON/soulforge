import { constants } from "node:fs";
import {
  copyFile,
  lstat,
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
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { comparablePathIdentity as comparable } from "../shared/physical_path_identity.mjs";

export const CHECKPOINT_SCHEMA = "soulforge.voice.copy_only_checkpoint.v1";
export const RECEIPT_SCHEMA = "soulforge.voice.copy_only_receipt.v1";
const SAFE_LANE = /^[A-Za-z0-9_.-]+$/;
const VERIFICATION_MODES = new Set(["full_audit", "incremental"]);
const RECEIPT_FIELDS = [
  "schema_version",
  "receipt_id",
  "captured_at",
  "source_owner_ref",
  "source_key",
  "sha256",
  "size",
  "source_mtime_ms",
  "custody_kind",
  "storage_ref",
  "project_state",
  "source_deleted",
  "source_overwritten",
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

function normalizeLanes(values) {
  const lanes = [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))].sort();
  if (!lanes.length || lanes.some((lane) => !SAFE_LANE.test(lane) || lane === "." || lane === "..")) {
    fail("invalid_lane_allowlist");
  }
  return lanes;
}

function normalizeRequiredSourcePrefixes(values, lanes) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) fail("invalid_required_source_prefixes");
  const prefixes = [...new Set(values.map((value) => String(value).trim().replace(/\\/gu, "/")))].sort();
  for (const prefix of prefixes) {
    const parts = prefix.split("/");
    if (!prefix
      || prefix.startsWith("/")
      || parts.some((part) => !part || part === "." || part === "..")
      || !lanes.includes(parts[0])) {
      fail("invalid_required_source_prefixes");
    }
  }
  return prefixes;
}

function normalizeVerificationMode(value) {
  const mode = value === undefined ? "full_audit" : String(value);
  if (!VERIFICATION_MODES.has(mode)) fail("invalid_verification_mode");
  return mode;
}

function normalizeFullAuditIntervalSeconds(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 3600 || value > 30 * 24 * 60 * 60) {
    fail("invalid_full_audit_interval_seconds");
  }
  return value;
}

function effectiveVerificationMode(requestedMode, checkpoint, intervalSeconds, observedAt) {
  if (requestedMode !== "incremental" || intervalSeconds === null) return requestedMode;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) fail("invalid_observed_at");
  if (!checkpoint.last_full_audit_at) return "full_audit";
  const lastAuditMs = Date.parse(checkpoint.last_full_audit_at);
  if (!Number.isFinite(lastAuditMs) || lastAuditMs > observedMs) fail("invalid_checkpoint_full_audit_at");
  return observedMs - lastAuditMs >= intervalSeconds * 1000 ? "full_audit" : "incremental";
}

async function assertNormalExistingDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("unsafe_directory");
  const physical = await realpath(path);
  const lexical = resolve(path);
  if (comparable(physical) !== comparable(lexical)) fail("unsafe_directory");
}

async function ensureNormalDirectory(path, { create = false } = {}) {
  const target = resolve(path);
  if (await exists(target)) {
    await assertNormalExistingDirectory(target);
    return;
  }
  if (!create) fail("directory_missing");
  const missing = [];
  let current = target;
  while (!(await exists(current))) {
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) fail("directory_root_missing");
    current = parent;
  }
  await assertNormalExistingDirectory(current);
  for (const next of missing.reverse()) {
    await mkdir(next);
    await assertNormalExistingDirectory(next);
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(path) {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function sameDigestMetadata(left, right) {
  return left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

export async function stableDigestFile(path, operations = {}) {
  const statFile = operations.statFile || stat;
  const digestFile = operations.digestFile || sha256;
  const before = await statFile(path);
  if (!before.isFile()) fail("source_not_regular_file");
  const digest = await digestFile(path);
  const after = await statFile(path);
  if (sameDigestMetadata(before, after)) {
    return {
      sha256: digest,
      size: after.size,
      mtime_ms: after.mtimeMs,
      ctime_ms: after.ctimeMs,
    };
  }
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    fail("source_changed_during_hash");
  }

  // Reading a locally available OneDrive reparse file can hydrate or retag the
  // file and change only ctime. Settle that metadata-only transition once, but
  // accept it only when a second complete digest is identical and its own
  // size/mtime/ctime snapshot remains stable.
  const settledDigest = await digestFile(path);
  const settled = await statFile(path);
  if (!sameDigestMetadata(after, settled) || settledDigest !== digest) {
    fail("source_changed_during_hash");
  }
  return {
    sha256: settledDigest,
    size: settled.size,
    mtime_ms: settled.mtimeMs,
    ctime_ms: settled.ctimeMs,
  };
}

async function stableDigest(path) {
  return stableDigestFile(path);
}

async function collectLaneFiles(sourceRoot, lanes) {
  const files = [];
  for (const lane of lanes) {
    const laneRoot = resolve(sourceRoot, lane);
    if (!inside(sourceRoot, laneRoot)) fail("source_path_escape");
    if (!(await exists(laneRoot))) continue;
    const laneInfo = await lstat(laneRoot);
    if (!laneInfo.isDirectory() || laneInfo.isSymbolicLink()) fail("unsafe_source_lane");
    const stack = [laneRoot];
    while (stack.length) {
      const current = stack.pop();
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const path = resolve(current, entry.name);
        if (!inside(laneRoot, path)) fail("source_path_escape");
        const info = await lstat(path);
        if (info.isSymbolicLink()) fail("unsafe_source_link");
        if (info.isDirectory()) stack.push(path);
        else if (info.isFile()) {
          files.push({
            path,
            key: relative(sourceRoot, path).split(sep).join("/"),
            size: info.size,
            mtime_ms: info.mtimeMs,
            ctime_ms: info.ctimeMs,
          });
        }
      }
    }
  }
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

async function refreshSourceFileMetadata(file) {
  const info = await lstat(file.path);
  if (info.isSymbolicLink()) fail("unsafe_source_link");
  if (!info.isFile()) fail("source_not_regular_file");
  return {
    ...file,
    size: info.size,
    mtime_ms: info.mtimeMs,
    ctime_ms: info.ctimeMs,
  };
}

function sameSourceMetadata(left, right) {
  return left.size === right.size
    && left.mtime_ms === right.mtime_ms
    && left.ctime_ms === right.ctime_ms;
}

async function readCheckpoint(path) {
  try {
    if (!(await exists(path))) return { schema_version: CHECKPOINT_SCHEMA, files: {} };
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_checkpoint_file");
    const payload = JSON.parse(await readFile(path, "utf8"));
    if (payload?.schema_version !== CHECKPOINT_SCHEMA || !payload.files || typeof payload.files !== "object") {
      fail("invalid_checkpoint");
    }
    return payload;
  } catch (error) {
    if (error?.code) throw error;
    fail("invalid_checkpoint");
  }
}

async function atomicJson(path, payload, assertFence, fenceContext) {
  if (await exists(path)) {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_json_target");
  }
  const temporary = `${path}.partial-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await assertFence(fenceContext);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function ensureSafeDirectoryChain(root, target, { create = false } = {}) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (!inside(rootPath, targetPath)) fail("directory_path_escape");
  const relativePath = relative(rootPath, targetPath);
  let current = rootPath;
  for (const part of relativePath ? relativePath.split(sep) : []) {
    current = resolve(current, part);
    if (!(await exists(current))) {
      if (!create) fail("directory_missing");
      await mkdir(current);
    }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("unsafe_directory_chain");
  }
  const physicalRoot = await realpath(rootPath);
  const physicalTarget = await realpath(targetPath);
  if (!inside(physicalRoot, physicalTarget)) fail("physical_path_escape");
}

async function safeStoredDigest(root, path) {
  if (!inside(root, path)) fail("stored_path_escape");
  await ensureSafeDirectoryChain(root, dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("stored_not_regular_file");
  return stableDigest(path);
}

async function safeStoredMetadata(root, path, expectedSize) {
  if (!inside(root, path)) fail("stored_path_escape");
  await ensureSafeDirectoryChain(root, dirname(path));
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("stored_not_regular_file");
  if (info.size !== expectedSize) fail("checkpoint_custody_mismatch");
}

function receiptMatches(existing, expected) {
  const existingKeys = Object.keys(existing || {}).sort();
  const expectedKeys = Object.keys(expected || {}).sort();
  return existingKeys.length === expectedKeys.length
    && existingKeys.every((field, index) => field === expectedKeys[index])
    && RECEIPT_FIELDS.every((field) => existing?.[field] === expected?.[field]);
}

function receiptId(sourceOwnerRef, sourceKey, digest) {
  return createHash("sha256").update(`${sourceOwnerRef}\0${sourceKey}\0${digest}`).digest("hex");
}

async function readReceiptByIdentity(receiptRoot, sourceOwnerRef, sourceKey, digest) {
  const id = receiptId(sourceOwnerRef, sourceKey, digest);
  const path = resolve(receiptRoot, `${id}.json`);
  if (!inside(receiptRoot, path)) fail("receipt_path_escape");
  if (!(await exists(path))) return null;
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_receipt_file");
  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("invalid_existing_receipt");
  }
  const keys = Object.keys(payload || {}).sort();
  if (keys.length !== RECEIPT_FIELDS.length || !keys.every((key, index) => key === [...RECEIPT_FIELDS].sort()[index])) {
    fail("existing_receipt_mismatch");
  }
  if (
    payload.schema_version !== RECEIPT_SCHEMA
    || payload.receipt_id !== id
    || payload.source_owner_ref !== sourceOwnerRef
    || payload.source_key !== sourceKey
    || payload.sha256 !== digest
  ) fail("existing_receipt_mismatch");
  return payload;
}

async function writeReceipt(receiptRoot, receipt, assertFence) {
  const id = receiptId(receipt.source_owner_ref, receipt.source_key, receipt.sha256);
  const path = resolve(receiptRoot, `${id}.json`);
  if (!inside(receiptRoot, path)) fail("receipt_path_escape");
  const payload = { schema_version: RECEIPT_SCHEMA, receipt_id: id, ...receipt };
  if (await exists(path)) {
    let existing;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) fail("unsafe_receipt_file");
      existing = JSON.parse(await readFile(path, "utf8"));
    } catch {
      fail("invalid_existing_receipt");
    }
    if (!receiptMatches(existing, payload)) fail("existing_receipt_mismatch");
    return false;
  }
  await ensureSafeDirectoryChain(receiptRoot, dirname(path), { create: true });
  await atomicJson(path, payload, assertFence, {
    phase: "before_receipt_publish",
    artifact: "receipt",
    source_key: receipt.source_key,
    target: path,
  });
  return true;
}

async function verifiedCopy(destinationRoot, sourcePath, destinationPath, expected, assertFence, fenceContext) {
  await ensureSafeDirectoryChain(destinationRoot, dirname(destinationPath), { create: true });
  const temporary = `${destinationPath}.partial-${randomUUID()}`;
  try {
    await copyFile(sourcePath, temporary, constants.COPYFILE_EXCL);
    const copied = await stableDigest(temporary);
    if (copied.sha256 !== expected.sha256 || copied.size !== expected.size) fail("copy_hash_mismatch");
    if (await exists(destinationPath)) fail("destination_race");
    await ensureSafeDirectoryChain(destinationRoot, dirname(destinationPath));
    await assertFence(fenceContext);
    await rename(temporary, destinationPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function storageRef(root, path) {
  return relative(root, path).split(sep).join("/");
}

function receiptFromCheckpoint(row) {
  return {
    captured_at: row.captured_at,
    source_owner_ref: row.source_owner_ref,
    source_key: row.source_key,
    sha256: row.sha256,
    size: row.size,
    source_mtime_ms: row.source_mtime_ms,
    custody_kind: row.custody_kind,
    storage_ref: row.storage_ref,
    project_state: row.project_state,
    source_deleted: row.source_deleted,
    source_overwritten: row.source_overwritten,
  };
}

async function verifyCustodyEntry(destinationRoot, receiptRoot, entry, assertFence) {
  const storedPath = resolve(destinationRoot, String(entry.storage_ref || ""));
  if (!inside(destinationRoot, storedPath) || !(await exists(storedPath))) fail("checkpoint_custody_missing");
  const stored = await safeStoredDigest(destinationRoot, storedPath);
  if (stored.sha256 !== entry.sha256 || stored.size !== entry.size) fail("checkpoint_custody_mismatch");
  return writeReceipt(receiptRoot, receiptFromCheckpoint(entry), assertFence);
}

async function verifyPreviousCustody(destinationRoot, receiptRoot, previous, assertFence) {
  let receiptsWritten = 0;
  const history = Array.isArray(previous.custody_history) ? previous.custody_history : [];
  for (const entry of [...history, previous]) {
    if (await verifyCustodyEntry(destinationRoot, receiptRoot, entry, assertFence)) receiptsWritten += 1;
  }
  return receiptsWritten;
}

async function verifyPreviousCustodyMetadata(destinationRoot, receiptRoot, previous, assertFence) {
  let receiptsWritten = 0;
  let hashedCount = 0;
  let metadataCheckedCount = 0;
  const history = Array.isArray(previous.custody_history) ? previous.custody_history : [];
  for (const entry of [...history, previous]) {
    const storedPath = resolve(destinationRoot, String(entry.storage_ref || ""));
    if (!inside(destinationRoot, storedPath) || !(await exists(storedPath))) fail("checkpoint_custody_missing");
    await safeStoredMetadata(destinationRoot, storedPath, entry.size);
    metadataCheckedCount += 1;
    const receipt = receiptFromCheckpoint(entry);
    const existing = await readReceiptByIdentity(
      receiptRoot,
      receipt.source_owner_ref,
      receipt.source_key,
      receipt.sha256,
    );
    if (existing) {
      const id = receiptId(receipt.source_owner_ref, receipt.source_key, receipt.sha256);
      const expected = { schema_version: RECEIPT_SCHEMA, receipt_id: id, ...receipt };
      if (!receiptMatches(existing, expected)) fail("existing_receipt_mismatch");
      continue;
    }
    const stored = await safeStoredDigest(destinationRoot, storedPath);
    hashedCount += 1;
    if (stored.sha256 !== entry.sha256 || stored.size !== entry.size) fail("checkpoint_custody_mismatch");
    if (await writeReceipt(receiptRoot, receipt, assertFence)) receiptsWritten += 1;
  }
  return { receiptsWritten, hashedCount, metadataCheckedCount };
}

function checkpointObservedMetadata(previous) {
  return {
    size: Number.isSafeInteger(previous?.source_observed_size)
      ? previous.source_observed_size
      : previous?.size,
    mtime_ms: Number.isFinite(previous?.source_observed_mtime_ms)
      ? previous.source_observed_mtime_ms
      : previous?.source_mtime_ms,
    ctime_ms: Number.isFinite(previous?.source_observed_ctime_ms)
      ? previous.source_observed_ctime_ms
      : null,
  };
}

function sourceMetadataMatchesCheckpoint(file, previous) {
  if (!previous || previous.source_present === false) return false;
  const observed = checkpointObservedMetadata(previous);
  return observed.size === file.size
    && observed.mtime_ms === file.mtime_ms
    && (observed.ctime_ms === null || observed.ctime_ms === file.ctime_ms);
}

function validateCheckpointIdentity(checkpoint, sourceOwnerRef, lanes) {
  if (checkpoint.source_owner_ref && checkpoint.source_owner_ref !== sourceOwnerRef) fail("checkpoint_identity_mismatch");
  if (Array.isArray(checkpoint.lanes) && checkpoint.lanes.join("\0") !== lanes.join("\0")) fail("checkpoint_lane_mismatch");
  for (const [key, row] of Object.entries(checkpoint.files || {})) {
    const entries = [...(Array.isArray(row?.custody_history) ? row.custody_history : []), row];
    for (const entry of entries) {
      if (!entry || entry.source_owner_ref !== sourceOwnerRef || entry.source_key !== key) {
        fail("checkpoint_identity_mismatch");
      }
    }
  }
}

export async function syncCopyOnlyMirror(options) {
  const sourceRoot = resolve(String(options.sourceRoot || ""));
  const destinationRoot = resolve(String(options.destinationRoot || ""));
  const legacyRoot = options.legacyRoot ? resolve(String(options.legacyRoot)) : null;
  const stateRoot = resolve(String(options.stateRoot || ""));
  const checkpointPath = resolve(String(options.checkpointPath || ""));
  const receiptRoot = resolve(String(options.receiptRoot || ""));
  const sourceOwnerRef = String(options.sourceOwnerRef || "").trim();
  const lanes = normalizeLanes(options.lanes);
  const requiredSourcePrefixes = normalizeRequiredSourcePrefixes(options.requiredSourcePrefixes, lanes);
  const requestedVerificationMode = normalizeVerificationMode(options.verificationMode);
  const fullAuditIntervalSeconds = normalizeFullAuditIntervalSeconds(options.fullAuditIntervalSeconds);
  const maxNewFiles = Number.isSafeInteger(options.maxNewFiles) ? options.maxNewFiles : 250;
  const maxNewBytes = Number.isSafeInteger(options.maxNewBytes) ? options.maxNewBytes : 2 * 1024 * 1024 * 1024;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const assertFence = typeof options.assertFence === "function" ? options.assertFence : async () => {};

  if (!sourceOwnerRef || !/^[A-Za-z0-9_.:-]+$/.test(sourceOwnerRef)) fail("invalid_source_owner_ref");
  if (maxNewFiles < 1 || maxNewBytes < 1) fail("invalid_copy_limit");
  if (inside(sourceRoot, destinationRoot) || inside(destinationRoot, sourceRoot)) fail("source_destination_overlap");
  if (!inside(stateRoot, checkpointPath) || !inside(stateRoot, receiptRoot)) fail("state_path_escape");

  const sourceInfo = await lstat(sourceRoot);
  if (!sourceInfo.isDirectory()) fail("source_root_not_directory");
  await ensureNormalDirectory(destinationRoot, { create: true });
  await ensureNormalDirectory(stateRoot, { create: true });
  await ensureNormalDirectory(receiptRoot, { create: true });
  await ensureSafeDirectoryChain(stateRoot, dirname(checkpointPath), { create: true });
  if (legacyRoot) {
    if (!inside(destinationRoot, legacyRoot)) fail("legacy_path_escape");
    if (await exists(legacyRoot)) await ensureSafeDirectoryChain(destinationRoot, legacyRoot);
  }

  const checkpoint = await readCheckpoint(checkpointPath);
  validateCheckpointIdentity(checkpoint, sourceOwnerRef, lanes);
  const cycleObservedAt = now();
  const verificationMode = effectiveVerificationMode(
    requestedVerificationMode,
    checkpoint,
    fullAuditIntervalSeconds,
    cycleObservedAt,
  );
  const files = await collectLaneFiles(sourceRoot, lanes);
  if (requiredSourcePrefixes.length > 0) {
    const required = (file) => requiredSourcePrefixes.some(
      (prefix) => file.key === prefix || file.key.startsWith(`${prefix}/`),
    );
    files.sort((left, right) => Number(required(right)) - Number(required(left)) || left.key.localeCompare(right.key));
  }
  const requiredFiles = files.filter((file) => requiredSourcePrefixes.some(
    (prefix) => file.key === prefix || file.key.startsWith(`${prefix}/`),
  ));
  const requiredPrefixHits = new Set(requiredSourcePrefixes.filter((prefix) => requiredFiles.some(
    (file) => file.key === prefix || file.key.startsWith(`${prefix}/`),
  )));
  const observedSources = new Map();
  const metadataFastPathFiles = [];
  const summary = {
    schema_version: "soulforge.voice.copy_only_run.v1",
    requested_verification_mode: requestedVerificationMode,
    verification_mode: verificationMode,
    full_audit_complete: verificationMode === "full_audit" ? false : null,
    scanned: files.length,
    source_files_hashed: 0,
    source_files_metadata_unchanged: 0,
    retained_custody_entries_hashed: 0,
    retained_custody_entries_metadata_checked: 0,
    seeded_legacy: 0,
    copied_new: 0,
    copied_version: 0,
    unchanged: 0,
    receipts_written: 0,
    bytes_copied: 0,
    source_missing_since_checkpoint: 0,
    limit_reached: false,
  };
  const currentKeys = new Set(files.map((file) => file.key));

  for (const previous of Object.values(checkpoint.files)) {
    await assertFence({ phase: "before_previous_custody", source_key: previous.source_key });
    const retainedCount = 1 + (Array.isArray(previous.custody_history) ? previous.custody_history.length : 0);
    if (verificationMode === "full_audit") {
      summary.receipts_written += await verifyPreviousCustody(destinationRoot, receiptRoot, previous, assertFence);
      summary.retained_custody_entries_hashed += retainedCount;
    } else {
      const verified = await verifyPreviousCustodyMetadata(
        destinationRoot,
        receiptRoot,
        previous,
        assertFence,
      );
      summary.receipts_written += verified.receiptsWritten;
      summary.retained_custody_entries_hashed += verified.hashedCount;
      summary.retained_custody_entries_metadata_checked += verified.metadataCheckedCount;
    }
    await assertFence({ phase: "after_previous_custody", source_key: previous.source_key });
  }

  for (const file of files) {
    await assertFence({ phase: "before_source_file", source_key: file.key });
    const currentFile = await refreshSourceFileMetadata(file);
    const previous = checkpoint.files[file.key];
    if (verificationMode === "incremental" && sourceMetadataMatchesCheckpoint(currentFile, previous)) {
      const observed = checkpointObservedMetadata(previous);
      observedSources.set(file.key, {
        sha256: previous.sha256,
        size: observed.size,
        mtime_ms: observed.mtime_ms,
      });
      checkpoint.files[file.key] = {
        ...previous,
        source_present: true,
        source_observed_size: currentFile.size,
        source_observed_mtime_ms: currentFile.mtime_ms,
        source_observed_ctime_ms: currentFile.ctime_ms,
      };
      metadataFastPathFiles.push(currentFile);
      delete checkpoint.files[file.key].source_missing_observed_at;
      summary.unchanged += 1;
      summary.source_files_metadata_unchanged += 1;
      await assertFence({ phase: "after_source_file", source_key: file.key });
      continue;
    }
    if (verificationMode === "incremental" && previous) {
      const retainedCount = 1 + (Array.isArray(previous.custody_history) ? previous.custody_history.length : 0);
      summary.receipts_written += await verifyPreviousCustody(
        destinationRoot,
        receiptRoot,
        previous,
        assertFence,
      );
      summary.retained_custody_entries_hashed += retainedCount;
    }
    const source = await stableDigest(currentFile.path);
    summary.source_files_hashed += 1;
    observedSources.set(file.key, source);
    if (previous?.sha256 === source.sha256 && previous?.size === source.size) {
      checkpoint.files[file.key] = {
        ...previous,
        source_present: true,
        source_observed_size: source.size,
        source_observed_mtime_ms: source.mtime_ms,
        source_observed_ctime_ms: source.ctime_ms,
      };
      delete checkpoint.files[file.key].source_missing_observed_at;
      summary.unchanged += 1;
      await assertFence({ phase: "after_source_file", source_key: file.key });
      continue;
    }

    let destinationPath = null;
    let custodyKind = "live_copy";
    const legacyPath = legacyRoot ? resolve(legacyRoot, ...file.key.split("/")) : null;
    if (!previous && legacyPath && inside(legacyRoot, legacyPath) && (await exists(legacyPath))) {
      const legacy = await safeStoredDigest(destinationRoot, legacyPath);
      if (legacy.sha256 !== source.sha256 || legacy.size !== source.size) fail("legacy_seed_mismatch");
      destinationPath = legacyPath;
      custodyKind = "legacy_verified";
      summary.seeded_legacy += 1;
    } else {
      if (summary.copied_new + summary.copied_version >= maxNewFiles || summary.bytes_copied + source.size > maxNewBytes) {
        summary.limit_reached = true;
        break;
      }
      const livePath = resolve(destinationRoot, "live_workspace_capture", ...file.key.split("/"));
      let copiedPayload = false;
      if (!inside(destinationRoot, livePath)) fail("destination_path_escape");
      if (!(await exists(livePath))) {
        destinationPath = livePath;
        await verifiedCopy(destinationRoot, file.path, destinationPath, source, assertFence, {
          phase: "before_payload_publish",
          artifact: "payload",
          source_key: file.key,
          target: destinationPath,
        });
        summary.copied_new += 1;
        copiedPayload = true;
      } else {
        const live = await safeStoredDigest(destinationRoot, livePath);
        if (live.sha256 === source.sha256 && live.size === source.size) {
          destinationPath = livePath;
          summary.unchanged += 1;
        } else {
          destinationPath = resolve(destinationRoot, "versions", `${file.key}.${source.sha256}`);
          if (!inside(destinationRoot, destinationPath)) fail("destination_path_escape");
          if (!(await exists(destinationPath))) {
            await verifiedCopy(destinationRoot, file.path, destinationPath, source, assertFence, {
              phase: "before_payload_publish",
              artifact: "payload",
              source_key: file.key,
              target: destinationPath,
            });
            summary.copied_version += 1;
            copiedPayload = true;
          } else {
            const version = await safeStoredDigest(destinationRoot, destinationPath);
            if (version.sha256 !== source.sha256 || version.size !== source.size) fail("existing_version_mismatch");
          }
          custodyKind = "immutable_version";
        }
      }
      if (copiedPayload) summary.bytes_copied += source.size;
    }

    const existingReceipt = await readReceiptByIdentity(receiptRoot, sourceOwnerRef, file.key, source.sha256);
    const capturedAt = existingReceipt?.captured_at || now();
    const receipt = {
      captured_at: capturedAt,
      source_owner_ref: sourceOwnerRef,
      source_key: file.key,
      sha256: source.sha256,
      size: source.size,
      source_mtime_ms: existingReceipt?.source_mtime_ms ?? source.mtime_ms,
      custody_kind: custodyKind,
      storage_ref: storageRef(destinationRoot, destinationPath),
      project_state: "unclassified",
      source_deleted: false,
      source_overwritten: false,
    };
    if (await writeReceipt(receiptRoot, receipt, assertFence)) summary.receipts_written += 1;
    const custodyHistory = previous
      ? [...(Array.isArray(previous.custody_history) ? previous.custody_history : []), receiptFromCheckpoint(previous)]
      : [];
    checkpoint.files[file.key] = {
      ...receipt,
      source_present: true,
      source_observed_size: source.size,
      source_observed_mtime_ms: source.mtime_ms,
      source_observed_ctime_ms: source.ctime_ms,
      custody_history: custodyHistory,
    };
    await assertFence({ phase: "after_source_file", source_key: file.key });
  }

  for (const file of metadataFastPathFiles) {
    const confirmed = await refreshSourceFileMetadata(file);
    if (!sameSourceMetadata(file, confirmed)) fail("source_changed_during_incremental_scan");
  }

  for (const [key, value] of Object.entries(checkpoint.files)) {
    if (!currentKeys.has(key) && value.source_present !== false) {
      checkpoint.files[key] = { ...value, source_present: false, source_missing_observed_at: now() };
      summary.source_missing_since_checkpoint += 1;
    }
  }
  checkpoint.schema_version = CHECKPOINT_SCHEMA;
  checkpoint.source_owner_ref = sourceOwnerRef;
  checkpoint.lanes = lanes;
  if (verificationMode === "full_audit") {
    summary.full_audit_complete = !summary.limit_reached && observedSources.size === files.length;
    if (summary.full_audit_complete) checkpoint.last_full_audit_at = cycleObservedAt;
  }
  checkpoint.updated_at = now();
  await assertFence({ phase: "before_checkpoint", source_key: null });
  await atomicJson(checkpointPath, checkpoint, assertFence, {
    phase: "before_checkpoint_publish",
    artifact: "checkpoint",
    source_key: null,
    target: checkpointPath,
  });
  await assertFence({ phase: "after_checkpoint", source_key: null });
  const verifiedRequiredFiles = requiredFiles.filter((file) => {
    const source = observedSources.get(file.key);
    const entry = checkpoint.files[file.key];
    return Boolean(source
      && entry
      && entry.source_present === true
      && entry.sha256 === source.sha256
      && entry.size === source.size);
  }).length;
  summary.required_coverage = {
    requested_prefix_count: requiredSourcePrefixes.length,
    matched_prefix_count: requiredPrefixHits.size,
    source_file_count: requiredFiles.length,
    verified_file_count: verifiedRequiredFiles,
    complete: requiredSourcePrefixes.length === 0
      || (requiredPrefixHits.size === requiredSourcePrefixes.length
        && verifiedRequiredFiles === requiredFiles.length),
  };
  return summary;
}
