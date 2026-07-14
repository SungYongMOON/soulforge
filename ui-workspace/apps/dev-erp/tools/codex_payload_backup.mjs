#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse as parsePath,
  resolve,
  sep,
} from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  CODEX_ATTACHMENT_MANIFEST_SCHEMA,
  parseAttachmentManifestJson,
} from "../src/codex_attachment_registry.mjs";
import {
  CODEX_MESSAGE_PAYLOAD_SCHEMA,
  DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES,
  validateMessagePayloadRef,
} from "../src/codex_message_payload_store.mjs";

export const CODEX_PAYLOAD_BACKUP_SCHEMA = "dev_erp.codex_payload_backup_generation.v1";
export const CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_SCHEMA = "dev_erp.codex_payload_backup_generation.v2";
export const CODEX_PAYLOAD_BACKUP_RESULT_SCHEMA = "dev_erp.codex_payload_backup_result.v1";
export const CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_RESULT_SCHEMA = "dev_erp.codex_payload_backup_result.v2";

const ATTACHMENT_MANIFEST_FILE = "codex-attachment-manifest.v1.json";
const MESSAGE_SERVICE_DIRECTORY = ".dev-erp-codex-message-payloads-v1";
const MESSAGE_ITEMS_DIRECTORY = "items";
const MESSAGE_PAYLOAD_FILE = "payload.json";
const MESSAGE_COMMIT_FILE = "committed";
const GENERATION_MANIFEST_FILE = "generation-manifest.v1.json";
const PRE_MIGRATION_GENERATION_MANIFEST_FILE = "generation-manifest.v2.json";
const GENERATION_COMMIT_FILE = "COMMITTED";
const RESTORE_COMMIT_FILE = "RESTORE_VERIFIED";
const DATABASE_OBJECT_FILE = "database.sqlite";
const MESSAGE_OBJECT_DIRECTORY = "message-objects";
const ATTACHMENT_OBJECT_DIRECTORY = "attachment-objects";
const ATTACHMENT_MANIFEST_OBJECT_DIRECTORY = "attachment-manifest-objects";
const DEFAULT_MAX_RECORDS = 100_000;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024 * 1024;
const DEFAULT_MAX_MESSAGE_ENVELOPE_BYTES = (16 * 1024 * 1024 * 6) + 4096;
const DEFAULT_MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const GENERATION_ID_RE = /^cpb_[A-Za-z0-9_-]{8,96}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OPAQUE_ATTACHMENT_ID_RE = /^att_[A-Za-z0-9_-]{32}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ITEM_DIRECTORY_DOMAIN = "dev-erp-codex-message-item-directory-v1\0";
const MESSAGE_ROLES = new Set(["user", "assistant", "error", "system"]);
const MESSAGE_ENVELOPE_KEYS = new Set([
  "schema",
  "payload_ref",
  "item_id",
  "role",
  "byte_length",
  "sha256",
  "text",
]);
const NETWORK_DRIVE_CACHE = new Map();

export class CodexPayloadBackupError extends Error {
  constructor(code) {
    super(code);
    this.name = "CodexPayloadBackupError";
    this.code = code;
  }
}

function fail(code) {
  throw new CodexPayloadBackupError(code);
}

function withRetargetStage(stage, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CodexPayloadBackupError && error.code === "source_file_retargeted") {
      fail(`${stage}_source_file_retargeted`);
    }
    throw error;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, allowed, code) {
  if (!isPlainObject(value)) fail(code);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(code);
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalPath(value) {
  const normalized = resolve(String(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isNetworkStoragePath(value) {
  const absolute = resolve(String(value));
  if (absolute.startsWith("\\\\")) return true;
  if (process.platform !== "win32") return false;
  const match = absolute.match(/^([A-Za-z]:)/);
  if (!match) return false;
  const drive = match[1].toUpperCase();
  if (NETWORK_DRIVE_CACHE.has(drive)) return NETWORK_DRIVE_CACHE.get(drive);
  let network = false;
  try {
    execFileSync("net.exe", ["use", drive], { stdio: "ignore", windowsHide: true, timeout: 5000 });
    network = true;
  } catch {
    network = false;
  }
  NETWORK_DRIVE_CACHE.set(drive, network);
  return network;
}

function isPathInside(root, candidate) {
  const base = canonicalPath(root);
  const target = canonicalPath(candidate);
  return target === base || target.startsWith(`${base}${sep}`);
}

function pathsOverlap(left, right) {
  return isPathInside(left, right) || isPathInside(right, left);
}

function requirePathInput(value, code) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(code);
  return resolve(value);
}

export function fileIdentityMatches(left, right, { includeMtime = true } = {}) {
  if (!left || !right || Number(left.size) !== Number(right.size)) return false;
  for (const key of ["dev", "ino"]) {
    if (Number.isSafeInteger(left[key]) && Number.isSafeInteger(right[key]) && left[key] !== right[key]) {
      return false;
    }
  }
  if (includeMtime && Number.isFinite(left.mtimeMs) && Number.isFinite(right.mtimeMs) && left.mtimeMs !== right.mtimeMs) {
    return false;
  }
  return true;
}

const identityMatches = fileIdentityMatches;

export function postReadFileMetadataMatches(left, right, { allowUnstableFileIds = false } = {}) {
  const stableMetadata = Boolean(
    left
    && right
    && Number(left.size) === Number(right.size)
    && (!Number.isFinite(left.mtimeMs) || !Number.isFinite(right.mtimeMs) || left.mtimeMs === right.mtimeMs),
  );
  return stableMetadata && (allowUnstableFileIds || fileIdentityMatches(left, right, { includeMtime: false }));
}

function directoryIdentityMatches(left, right) {
  if (!left || !right) return false;
  for (const key of ["dev", "ino"]) {
    if (Number.isSafeInteger(left[key]) && Number.isSafeInteger(right[key]) && left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function assertPlainDirectory(path, code) {
  let linkStat;
  try {
    linkStat = lstatSync(path);
  } catch {
    fail(code);
  }
  if (linkStat.isSymbolicLink()) fail("filesystem_link_forbidden");
  if (!linkStat.isDirectory()) fail(code);
  let real;
  let realStat;
  try {
    real = realpathSync(path);
    realStat = statSync(real);
  } catch {
    fail(code);
  }
  if (!realStat.isDirectory() || !directoryIdentityMatches(linkStat, realStat)) fail("filesystem_directory_retargeted");
  return { lexical: resolve(path), real: resolve(real), stat: realStat };
}

function assertNoLinkAncestors(path) {
  const absolute = resolve(path);
  const root = parsePath(absolute).root;
  const rest = absolute.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let current = root;
  for (const segment of rest) {
    current = join(current, segment);
    if (!existsSync(current)) break;
    let stat;
    try { stat = lstatSync(current); } catch { fail("filesystem_path_unavailable"); }
    if (stat.isSymbolicLink()) fail("filesystem_link_forbidden");
  }
}

function pinRoot(path, { create = false, code = "filesystem_root_invalid" } = {}) {
  const absolute = resolve(String(path ?? ""));
  if (!isAbsolute(absolute) || canonicalPath(absolute) === canonicalPath(parsePath(absolute).root)) fail(code);
  assertNoLinkAncestors(absolute);
  if (create && !existsSync(absolute)) {
    try { mkdirSync(absolute, { recursive: true, mode: 0o700 }); } catch { fail(code); }
    assertNoLinkAncestors(absolute);
  }
  return assertPlainDirectory(absolute, code);
}

function assertPinnedRootStable(root, code) {
  const current = assertPlainDirectory(root.lexical, code);
  const allowUnstableFileIds = isNetworkStoragePath(root.lexical);
  if (canonicalPath(current.real) !== canonicalPath(root.real)
      || (!allowUnstableFileIds && !directoryIdentityMatches(root.stat, current.stat))) {
    fail(code);
  }
}

function assertChildDirectory(path, parent, code) {
  if (!isPathInside(parent.real, path)) fail(code);
  const child = assertPlainDirectory(path, code);
  if (!isPathInside(parent.real, child.real)) fail("filesystem_junction_escape");
  return child;
}

function assertSafeComponent(value, pattern, code) {
  const component = String(value ?? "");
  if (!pattern.test(component) || basename(component) !== component || component === "." || component === "..") fail(code);
  return component;
}

function normalizeItemId(value) {
  return assertSafeComponent(value, ITEM_ID_RE, "item_id_invalid");
}

function normalizeGenerationId(value) {
  return assertSafeComponent(value, GENERATION_ID_RE, "generation_id_invalid");
}

function createGenerationId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `cpb_${stamp}_${randomBytes(9).toString("base64url")}`;
}

function safeItemDirectoryName(itemId) {
  return normalizeItemId(itemId).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "unknown";
}

function messageItemDirectoryName(itemId) {
  return createHash("sha256").update(ITEM_DIRECTORY_DOMAIN).update(normalizeItemId(itemId)).digest("hex");
}

function itemObjectKey(itemId) {
  return createHash("sha256").update("dev-erp-codex-backup-item-v1\0").update(normalizeItemId(itemId)).digest("hex");
}

function safeObjectPath(root, ...components) {
  const target = resolve(root.real, ...components);
  if (!isPathInside(root.real, target)) fail("backup_object_path_invalid");
  return target;
}

function readOpenFile(fd, maxBytes) {
  const chunks = [];
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let total = 0;
  for (;;) {
    const count = readSync(fd, buffer, 0, buffer.length, null);
    if (!Number.isInteger(count) || count < 0 || count > buffer.length) fail("file_read_failed");
    if (count === 0) break;
    total += count;
    if (total > maxBytes) fail("file_size_limit_exceeded");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks, total);
}

function inspectSourceFile(path, root, { maxBytes, expectedSize = null, emptyAllowed = false } = {}) {
  if (!isPathInside(root.real, path)) fail("source_path_escape");
  let before;
  let real;
  try {
    before = lstatSync(path);
    real = realpathSync(path);
  } catch {
    fail("source_file_unavailable");
  }
  if (before.isSymbolicLink()) fail("source_symlink_forbidden");
  if (!before.isFile()) fail("source_file_invalid");
  if (Number(before.nlink) !== 1) fail("source_hardlink_forbidden");
  if (!isPathInside(root.real, real)) fail("source_symlink_escape");
  if (!Number.isSafeInteger(before.size) || before.size < (emptyAllowed ? 0 : 1) || before.size > maxBytes) {
    fail("source_file_size_invalid");
  }
  if (expectedSize !== null && before.size !== expectedSize) fail("source_file_size_mismatch");
  return { before, real: resolve(real) };
}

function readVerifiedFile(path, root, options) {
  const inspected = inspectSourceFile(path, root, options);
  let fd = null;
  let handleStat;
  let bytes;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    handleStat = fstatSync(fd);
    if (!handleStat.isFile() || Number(handleStat.nlink) !== 1 || !identityMatches(inspected.before, handleStat)) {
      fail("source_file_retargeted");
    }
    bytes = readOpenFile(fd, options.maxBytes);
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("source_file_read_failed");
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* no raw OS error escapes */ }
  }
  let after;
  let finalReal;
  try {
    after = lstatSync(path);
    finalReal = realpathSync(path);
  } catch {
    fail("source_file_retargeted");
  }
  if (
    after.isSymbolicLink()
    || Number(after.nlink) !== 1
    || !postReadFileMetadataMatches(handleStat, after, {
      allowUnstableFileIds: isNetworkStoragePath(root.lexical),
    })
    || canonicalPath(finalReal) !== canonicalPath(inspected.real)
    || bytes.length !== handleStat.size
  ) {
    fail("source_file_retargeted");
  }
  return { bytes, size: bytes.length, sha256: sha256Bytes(bytes) };
}

function hashVerifiedFile(path, root, options) {
  const inspected = inspectSourceFile(path, root, options);
  let fd = null;
  let handleStat;
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let total = 0;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    handleStat = fstatSync(fd);
    if (!handleStat.isFile() || Number(handleStat.nlink) !== 1 || !identityMatches(inspected.before, handleStat)) {
      fail("source_file_retargeted");
    }
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!Number.isInteger(count) || count < 0 || count > buffer.length) fail("source_file_read_failed");
      if (count === 0) break;
      total += count;
      if (total > options.maxBytes) fail("file_size_limit_exceeded");
      hash.update(buffer.subarray(0, count));
    }
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("source_file_read_failed");
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* no raw OS error escapes */ }
  }
  let after;
  let finalReal;
  try {
    after = lstatSync(path);
    finalReal = realpathSync(path);
  } catch {
    fail("source_file_retargeted");
  }
  if (
    after.isSymbolicLink()
    || Number(after.nlink) !== 1
    || !postReadFileMetadataMatches(handleStat, after, {
      allowUnstableFileIds: isNetworkStoragePath(root.lexical),
    })
    || canonicalPath(finalReal) !== canonicalPath(inspected.real)
    || total !== handleStat.size
  ) {
    fail("source_file_retargeted");
  }
  return { size: total, sha256: hash.digest("hex") };
}

function writeExclusiveBytes(path, bytes) {
  let fd = null;
  try {
    fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(fd, bytes, offset, bytes.length - offset, null);
      if (!Number.isInteger(count) || count <= 0) fail("destination_write_failed");
      offset += count;
    }
    fsyncSync(fd);
    const stat = fstatSync(fd);
    if (!stat.isFile() || Number(stat.nlink) !== 1 || stat.size !== bytes.length) fail("destination_write_verification_failed");
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail(error?.code === "EEXIST" ? "destination_collision" : "destination_write_failed");
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* no raw OS error escapes */ }
  }
}

function copyVerifiedFile(sourcePath, sourceRoot, destinationPath, options) {
  const inspected = inspectSourceFile(sourcePath, sourceRoot, options);
  let sourceFd = null;
  let destinationFd = null;
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let total = 0;
  let sourceStat;
  try {
    sourceFd = openSync(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    sourceStat = fstatSync(sourceFd);
    if (!sourceStat.isFile() || Number(sourceStat.nlink) !== 1 || !identityMatches(inspected.before, sourceStat)) {
      fail("source_file_retargeted");
    }
    destinationFd = openSync(destinationPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    for (;;) {
      const count = readSync(sourceFd, buffer, 0, buffer.length, null);
      if (!Number.isInteger(count) || count < 0 || count > buffer.length) fail("source_file_read_failed");
      if (count === 0) break;
      total += count;
      if (total > options.maxBytes) fail("file_size_limit_exceeded");
      hash.update(buffer.subarray(0, count));
      let offset = 0;
      while (offset < count) {
        const written = writeSync(destinationFd, buffer, offset, count - offset, null);
        if (!Number.isInteger(written) || written <= 0) fail("destination_write_failed");
        offset += written;
      }
    }
    fsyncSync(destinationFd);
    const destinationStat = fstatSync(destinationFd);
    if (!destinationStat.isFile() || Number(destinationStat.nlink) !== 1 || destinationStat.size !== total) {
      fail("destination_write_verification_failed");
    }
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail(error?.code === "EEXIST" ? "destination_collision" : "file_copy_failed");
  } finally {
    if (sourceFd !== null) try { closeSync(sourceFd); } catch { /* no raw OS error escapes */ }
    if (destinationFd !== null) try { closeSync(destinationFd); } catch { /* no raw OS error escapes */ }
  }
  let after;
  let finalReal;
  try {
    after = lstatSync(sourcePath);
    finalReal = realpathSync(sourcePath);
  } catch {
    fail("source_file_retargeted");
  }
  if (
    after.isSymbolicLink()
    || Number(after.nlink) !== 1
    || !postReadFileMetadataMatches(sourceStat, after, {
      allowUnstableFileIds: isNetworkStoragePath(sourceRoot.lexical),
    })
    || canonicalPath(finalReal) !== canonicalPath(inspected.real)
    || total !== sourceStat.size
  ) {
    fail("source_file_retargeted");
  }
  const digest = hash.digest("hex");
  if (options.expectedSha256 && digest !== options.expectedSha256) fail("source_file_hash_mismatch");
  if (options.expectedSize !== null && options.expectedSize !== undefined && total !== options.expectedSize) {
    fail("source_file_size_mismatch");
  }
  return { size: total, sha256: digest };
}

function syncDirectoryBestEffort(path) {
  let fd = null;
  try {
    fd = openSync(path, fsConstants.O_RDONLY);
    fsyncSync(fd);
  } catch {
    // Windows does not consistently allow directory handles. File fsync + same-volume rename
    // remain the publication boundary there.
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* best effort */ }
  }
}

function mkdirExclusive(path) {
  try { mkdirSync(path, { mode: 0o700 }); }
  catch (error) { fail(error?.code === "EEXIST" ? "destination_collision" : "destination_directory_create_failed"); }
  return assertPlainDirectory(path, "destination_directory_invalid");
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function databaseQuickCheck(path) {
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    const quickCheck = db.prepare("PRAGMA quick_check").get()?.quick_check ?? null;
    if (quickCheck !== "ok") fail("database_quick_check_failed");
    return quickCheck;
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("database_open_failed");
  } finally {
    try { db?.close(); } catch { /* no raw DB error escapes */ }
  }
}

function snapshotDatabase(sourceRoot, dbPath, destinationPath) {
  const inspected = inspectSourceFile(dbPath, sourceRoot, { maxBytes: DEFAULT_MAX_TOTAL_BYTES });
  let db;
  try {
    db = new DatabaseSync(inspected.real);
    db.exec("PRAGMA busy_timeout=10000");
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") fail("database_quick_check_failed");
    db.exec(`VACUUM INTO '${sqlString(destinationPath)}'`);
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("database_snapshot_failed");
  } finally {
    try { db?.close(); } catch { /* no raw DB error escapes */ }
  }
  let after;
  let finalReal;
  try {
    after = lstatSync(dbPath);
    finalReal = realpathSync(dbPath);
  } catch {
    fail("database_source_retargeted");
  }
  if (
    after.isSymbolicLink()
    || Number(after.nlink) !== 1
    || canonicalPath(finalReal) !== canonicalPath(inspected.real)
    || !identityMatches(inspected.before, after)
  ) {
    fail("database_source_retargeted");
  }
  let fd = null;
  try {
    fd = openSync(destinationPath, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0));
    fsyncSync(fd);
  } catch {
    fail("database_snapshot_sync_failed");
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* no raw OS error escapes */ }
  }
  const destinationRoot = assertPlainDirectory(dirname(destinationPath), "database_destination_invalid");
  const snapshot = hashVerifiedFile(destinationPath, destinationRoot, { maxBytes: DEFAULT_MAX_TOTAL_BYTES });
  databaseQuickCheck(destinationPath);
  return snapshot;
}

function readDatabaseMessageRows(dbPath, maxRecords) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") fail("database_quick_check_failed");
    const table = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='codex_thread_message'").get();
    if (!table) return [];
    const columns = new Set(db.prepare("PRAGMA table_info(codex_thread_message)").all().map((row) => row.name));
    for (const name of ["id", "item_id", "role", "text", "payload_ref", "payload_byte_length", "payload_sha256"]) {
      if (!columns.has(name)) fail("database_message_schema_invalid");
    }
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM codex_thread_message").get()?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0 || count > maxRecords) fail("message_record_limit_exceeded");
    return db.prepare(
      `SELECT id,item_id,role,text,payload_ref,payload_byte_length,payload_sha256
       FROM codex_thread_message ORDER BY id`,
    ).all();
  } catch (error) {
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("database_message_read_failed");
  } finally {
    try { db?.close(); } catch { /* no raw DB error escapes */ }
  }
}

function parseMessageEnvelope(bytes, expected) {
  let document;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    document = JSON.parse(text);
  } catch {
    fail("message_payload_envelope_invalid");
  }
  assertExactKeys(document, MESSAGE_ENVELOPE_KEYS, "message_payload_envelope_invalid");
  if (document.schema !== CODEX_MESSAGE_PAYLOAD_SCHEMA) fail("message_payload_schema_invalid");
  if (
    document.payload_ref !== expected.payload_ref
    || document.item_id !== expected.item_id
    || document.role !== expected.role
  ) {
    fail("message_payload_identity_mismatch");
  }
  if (!MESSAGE_ROLES.has(document.role) || typeof document.text !== "string" || !isWellFormedUnicode(document.text)) {
    fail("message_payload_envelope_invalid");
  }
  const textBytes = Buffer.from(document.text, "utf8");
  if (
    !Number.isSafeInteger(document.byte_length)
    || document.byte_length !== textBytes.length
    || document.byte_length !== expected.byte_length
  ) {
    fail("message_payload_size_mismatch");
  }
  const digest = sha256Bytes(textBytes);
  if (!SHA256_RE.test(String(document.sha256 ?? "")) || document.sha256 !== digest || digest !== expected.sha256) {
    fail("message_payload_hash_mismatch");
  }
  return { envelope_bytes: bytes.length, envelope_sha256: sha256Bytes(bytes) };
}

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function normalizeMessageRow(row) {
  const itemId = normalizeItemId(row.item_id);
  const role = String(row.role ?? "");
  if (!MESSAGE_ROLES.has(role)) fail("database_message_role_invalid");
  const payloadRef = String(row.payload_ref ?? "");
  try { validateMessagePayloadRef(payloadRef, { itemId }); }
  catch { fail("database_message_payload_ref_invalid"); }
  if (String(row.text ?? "") !== payloadRef) fail("database_inline_message_payload_forbidden");
  const byteLength = Number(row.payload_byte_length);
  const sha256 = String(row.payload_sha256 ?? "");
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 16 * 1024 * 1024) {
    fail("database_message_size_invalid");
  }
  if (!SHA256_RE.test(sha256)) fail("database_message_hash_invalid");
  return {
    item_id: itemId,
    payload_ref: payloadRef,
    role,
    byte_length: byteLength,
    sha256,
  };
}

function normalizeLegacyMessageRow(row) {
  const id = Number(row.id);
  const itemId = normalizeItemId(row.item_id);
  const role = String(row.role ?? "");
  const noPayloadRef = row.payload_ref === null || row.payload_ref === "";
  if (
    !Number.isSafeInteger(id)
    || id < 1
    || !noPayloadRef
    || row.payload_byte_length !== null
    || row.payload_sha256 !== null
    || !MESSAGE_ROLES.has(role)
    || typeof row.text !== "string"
    || !isWellFormedUnicode(row.text)
  ) {
    fail("database_message_partial_state");
  }
  const bytes = Buffer.from(row.text, "utf8");
  if (bytes.length < 1 || bytes.length > DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES) {
    fail("database_message_partial_state");
  }
  return {
    id,
    item_id: itemId,
    role,
    byte_length: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function classifyDatabaseMessageRows(dbPath, maxRecords, { allowLegacyMessages }) {
  const complete = [];
  const legacy = [];
  const seenIds = new Set();
  for (const row of readDatabaseMessageRows(dbPath, maxRecords)) {
    if (allowLegacyMessages) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id < 1 || seenIds.has(id)) fail("database_message_partial_state");
      seenIds.add(id);
    }
    try {
      complete.push(normalizeMessageRow(row));
      continue;
    } catch (error) {
      if (!allowLegacyMessages) throw error;
    }
    legacy.push(normalizeLegacyMessageRow(row));
  }
  return { complete, legacy };
}

function collectMessages({
  dbPath,
  messageRoot,
  objectDirectory,
  maxRecords,
  maxEnvelopeBytes,
  budget,
  allowLegacyMessages,
}) {
  const classified = classifyDatabaseMessageRows(dbPath, maxRecords, { allowLegacyMessages });
  const rows = classified.complete;
  const seen = new Set();
  let items = null;
  if (rows.length || !allowLegacyMessages) {
    const service = assertChildDirectory(join(messageRoot.real, MESSAGE_SERVICE_DIRECTORY), messageRoot, "message_service_root_invalid");
    items = assertChildDirectory(join(service.real, MESSAGE_ITEMS_DIRECTORY), service, "message_items_root_invalid");
  }
  const inventory = [];
  for (const row of rows) {
    if (seen.has(row.payload_ref)) fail("database_duplicate_message_payload_ref");
    seen.add(row.payload_ref);
    const item = assertChildDirectory(
      join(items.real, messageItemDirectoryName(row.item_id)),
      items,
      "message_item_directory_invalid",
    );
    const payloadDirectory = assertChildDirectory(
      join(item.real, row.payload_ref),
      item,
      "message_payload_directory_invalid",
    );
    const marker = readVerifiedFile(join(payloadDirectory.real, MESSAGE_COMMIT_FILE), payloadDirectory, {
      maxBytes: 0,
      expectedSize: 0,
      emptyAllowed: true,
    });
    if (marker.size !== 0) fail("message_payload_commit_marker_invalid");
    const envelope = readVerifiedFile(join(payloadDirectory.real, MESSAGE_PAYLOAD_FILE), payloadDirectory, {
      maxBytes: maxEnvelopeBytes,
    });
    const verified = parseMessageEnvelope(envelope.bytes, row);
    budget.bytes += envelope.size;
    if (budget.bytes > budget.limit) fail("backup_total_size_limit_exceeded");
    const destination = join(objectDirectory.real, `${row.payload_ref}.payload`);
    writeExclusiveBytes(destination, envelope.bytes);
    inventory.push({ ...row, ...verified });
  }
  assertPinnedRootStable(messageRoot, "message_owner_root_retargeted");
  return { messages: inventory, legacyMessages: classified.legacy };
}

function listPlainChildDirectories(root) {
  let names;
  try { names = readdirSync(root.real).sort(); }
  catch { fail("attachment_root_read_failed"); }
  const directories = [];
  for (const name of names) {
    if (!name || name === "." || name === ".." || basename(name) !== name) fail("attachment_directory_name_invalid");
    const candidate = join(root.real, name);
    let stat;
    try { stat = lstatSync(candidate); } catch { fail("attachment_directory_unavailable"); }
    if (stat.isSymbolicLink()) fail("source_symlink_forbidden");
    if (!stat.isDirectory()) fail("attachment_root_entry_invalid");
    directories.push(assertChildDirectory(candidate, root, "attachment_directory_invalid"));
  }
  return directories;
}

function attachmentFilesFromManifest(parsed) {
  return parsed.attachments.map((row) => ({
    attachment_id: row.attachment_id,
    size: row.size,
    sha256: row.sha256,
    type: row.type,
  }));
}

function collectAttachments({ attachmentRoot, objectDirectory, manifestObjectDirectory, maxRecords, maxAttachmentBytes, budget }) {
  const firstDirectoryNames = readdirSync(attachmentRoot.real).sort();
  const directories = listPlainChildDirectories(attachmentRoot);
  const seenItems = new Set();
  const seenAttachments = new Set();
  const inventory = [];
  let count = 0;
  for (const directory of directories) {
    const manifestPath = join(directory.real, ATTACHMENT_MANIFEST_FILE);
    const manifestFile = readVerifiedFile(manifestPath, directory, { maxBytes: MAX_MANIFEST_BYTES });
    let parsed;
    try {
      parsed = parseAttachmentManifestJson(manifestFile.bytes.toString("utf8"), { maxBytes: maxAttachmentBytes });
    } catch {
      fail("attachment_manifest_invalid");
    }
    if (parsed.schema !== CODEX_ATTACHMENT_MANIFEST_SCHEMA) fail("attachment_manifest_schema_invalid");
    const itemId = normalizeItemId(parsed.item_id);
    if (basename(directory.lexical) !== safeItemDirectoryName(itemId)) fail("attachment_item_directory_mismatch");
    if (seenItems.has(itemId)) fail("attachment_duplicate_item_manifest");
    seenItems.add(itemId);
    count += parsed.attachments.length;
    if (count > maxRecords) fail("attachment_record_limit_exceeded");
    for (const row of parsed.attachments) {
      if (!OPAQUE_ATTACHMENT_ID_RE.test(row.attachment_id) || seenAttachments.has(row.attachment_id)) {
        fail("attachment_duplicate_or_invalid_id");
      }
      seenAttachments.add(row.attachment_id);
      const destination = join(objectDirectory.real, `${row.attachment_id}.payload`);
      const copied = copyVerifiedFile(join(directory.real, row.stored_name), directory, destination, {
        maxBytes: maxAttachmentBytes,
        expectedSize: row.size,
        expectedSha256: row.sha256,
      });
      budget.bytes += copied.size;
      if (budget.bytes > budget.limit) fail("backup_total_size_limit_exceeded");
    }
    const secondManifest = readVerifiedFile(manifestPath, directory, { maxBytes: MAX_MANIFEST_BYTES });
    if (secondManifest.sha256 !== manifestFile.sha256 || secondManifest.size !== manifestFile.size) {
      fail("attachment_manifest_changed_during_backup");
    }
    budget.bytes += manifestFile.size;
    if (budget.bytes > budget.limit) fail("backup_total_size_limit_exceeded");
    writeExclusiveBytes(join(manifestObjectDirectory.real, `${itemObjectKey(itemId)}.manifest`), manifestFile.bytes);
    inventory.push({
      item_id: itemId,
      manifest_bytes: manifestFile.size,
      manifest_sha256: manifestFile.sha256,
      files: attachmentFilesFromManifest(parsed),
    });
  }
  const secondDirectoryNames = readdirSync(attachmentRoot.real).sort();
  if (JSON.stringify(firstDirectoryNames) !== JSON.stringify(secondDirectoryNames)) {
    fail("attachment_root_changed_during_backup");
  }
  assertPinnedRootStable(attachmentRoot, "attachment_root_retargeted");
  return inventory;
}

function sumInventory(inventory, field) {
  let total = 0;
  for (const row of inventory) {
    if (field === "message") total += row.byte_length;
    else for (const file of row.files) total += file.size;
  }
  return total;
}

function validatePositiveLimit(value, fallback, code) {
  const normalized = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) fail(code);
  return normalized;
}

function safeCleanupPartial(path, parent, prefix) {
  try {
    if (isPathInside(parent.real, path) && basename(path).startsWith(prefix)) rmSync(path, { recursive: true, force: true });
  } catch {
    // An incomplete, uncommitted directory is safer than widening cleanup scope.
  }
}

function createCodexPayloadBackupGeneration({
  dbPath,
  attachmentRoot,
  messagePayloadRoot,
  backupRoot,
  generationId = null,
  now = new Date(),
  maxRecords = DEFAULT_MAX_RECORDS,
  maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
  maxMessageEnvelopeBytes = DEFAULT_MAX_MESSAGE_ENVELOPE_BYTES,
  maxAttachmentBytes = DEFAULT_MAX_ATTACHMENT_BYTES,
  allowLegacyMessages = false,
} = {}) {
  const recordsLimit = validatePositiveLimit(maxRecords, DEFAULT_MAX_RECORDS, "max_records_invalid");
  const totalLimit = validatePositiveLimit(maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, "max_total_bytes_invalid");
  const envelopeLimit = validatePositiveLimit(maxMessageEnvelopeBytes, DEFAULT_MAX_MESSAGE_ENVELOPE_BYTES, "max_message_bytes_invalid");
  const attachmentLimit = validatePositiveLimit(maxAttachmentBytes, DEFAULT_MAX_ATTACHMENT_BYTES, "max_attachment_bytes_invalid");
  const id = normalizeGenerationId(generationId || createGenerationId(now));
  const databasePath = requirePathInput(dbPath, "database_path_required");
  const attachmentPath = requirePathInput(attachmentRoot, "attachment_root_required");
  const messagePath = requirePathInput(messagePayloadRoot, "message_owner_root_required");
  const backupPath = requirePathInput(backupRoot, "backup_root_required");
  for (const source of [dirname(databasePath), attachmentPath, messagePath]) {
    if (pathsOverlap(backupPath, source)) fail("backup_root_overlaps_source");
  }
  if (pathsOverlap(attachmentPath, messagePath)) fail("payload_source_roots_overlap");
  const databaseRoot = pinRoot(dirname(databasePath), { code: "database_root_invalid" });
  const attachments = pinRoot(attachmentPath, { code: "attachment_root_invalid" });
  const messages = pinRoot(messagePath, { code: "message_owner_root_invalid" });
  const backups = pinRoot(backupPath, { create: true, code: "backup_root_invalid" });
  for (const source of [databaseRoot.real, attachments.real, messages.real]) {
    if (pathsOverlap(backups.real, source)) fail("backup_root_overlaps_source");
  }
  if (pathsOverlap(attachments.real, messages.real)) fail("payload_source_roots_overlap");
  const finalDirectory = safeObjectPath(backups, id);
  if (existsSync(finalDirectory)) fail("generation_collision");
  const partialPrefix = `.partial-${id}-`;
  const partialDirectory = safeObjectPath(backups, `${partialPrefix}${randomBytes(6).toString("hex")}`);
  let partial;
  try {
    partial = mkdirExclusive(partialDirectory);
    const messageObjects = mkdirExclusive(join(partial.real, MESSAGE_OBJECT_DIRECTORY));
    const attachmentObjects = mkdirExclusive(join(partial.real, ATTACHMENT_OBJECT_DIRECTORY));
    const attachmentManifestObjects = mkdirExclusive(join(partial.real, ATTACHMENT_MANIFEST_OBJECT_DIRECTORY));
    const databaseObjectPath = join(partial.real, DATABASE_OBJECT_FILE);
    const database = snapshotDatabase(databaseRoot, databasePath, databaseObjectPath);
    const budget = { bytes: database.size, limit: totalLimit };
    if (budget.bytes > budget.limit) fail("backup_total_size_limit_exceeded");
    const collectedMessages = collectMessages({
      dbPath: databaseObjectPath,
      messageRoot: messages,
      objectDirectory: messageObjects,
      maxRecords: recordsLimit,
      maxEnvelopeBytes: envelopeLimit,
      budget,
      allowLegacyMessages,
    });
    const messageInventory = collectedMessages.messages;
    const legacyMessageInventory = collectedMessages.legacyMessages;
    const attachmentInventory = collectAttachments({
      attachmentRoot: attachments,
      objectDirectory: attachmentObjects,
      manifestObjectDirectory: attachmentManifestObjects,
      maxRecords: recordsLimit,
      maxAttachmentBytes: attachmentLimit,
      budget,
    });
    assertPinnedRootStable(databaseRoot, "database_root_retargeted");
    assertPinnedRootStable(backups, "backup_root_retargeted");
    const totals = {
      message_count: messageInventory.length + legacyMessageInventory.length,
      message_bytes: sumInventory(messageInventory, "message")
        + legacyMessageInventory.reduce((sum, row) => sum + row.byte_length, 0),
      attachment_count: attachmentInventory.reduce((sum, row) => sum + row.files.length, 0),
      attachment_bytes: sumInventory(attachmentInventory, "attachment"),
      generation_payload_bytes: budget.bytes,
    };
    if (allowLegacyMessages) {
      totals.externalized_message_count = messageInventory.length;
      totals.legacy_message_count = legacyMessageInventory.length;
      totals.legacy_message_bytes = legacyMessageInventory.reduce((sum, row) => sum + row.byte_length, 0);
    }
    const manifest = {
      schema: allowLegacyMessages ? CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_SCHEMA : CODEX_PAYLOAD_BACKUP_SCHEMA,
      generation_id: id,
      created_at: now.toISOString(),
      database: {
        bytes: database.size,
        sha256: database.sha256,
        quick_check: "ok",
      },
      messages: messageInventory,
      ...(allowLegacyMessages ? { legacy_messages: legacyMessageInventory } : {}),
      attachments: attachmentInventory,
      totals,
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (manifestBytes.length > MAX_MANIFEST_BYTES) fail("generation_manifest_too_large");
    if (budget.bytes + manifestBytes.length + 65 > budget.limit) fail("backup_total_size_limit_exceeded");
    const manifestSha256 = sha256Bytes(manifestBytes);
    writeExclusiveBytes(join(
      partial.real,
      allowLegacyMessages ? PRE_MIGRATION_GENERATION_MANIFEST_FILE : GENERATION_MANIFEST_FILE,
    ), manifestBytes);
    writeExclusiveBytes(join(partial.real, GENERATION_COMMIT_FILE), Buffer.from(`${manifestSha256}\n`, "ascii"));
    syncDirectoryBestEffort(partial.real);
    renameSync(partial.real, finalDirectory);
    syncDirectoryBestEffort(backups.real);
    return Object.freeze({
      schema: allowLegacyMessages ? CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_RESULT_SCHEMA : CODEX_PAYLOAD_BACKUP_RESULT_SCHEMA,
      kind: allowLegacyMessages ? "pre_migration_backup" : "backup",
      ok: true,
      generation_id: id,
      created_at: now.toISOString(),
      manifest_sha256: manifestSha256,
      database: Object.freeze({ bytes: database.size, sha256: database.sha256, quick_check: "ok" }),
      messages: Object.freeze({
        count: manifest.totals.message_count,
        bytes: manifest.totals.message_bytes,
        ...(allowLegacyMessages ? {
          externalized_count: manifest.totals.externalized_message_count,
          legacy_count: manifest.totals.legacy_message_count,
        } : {}),
      }),
      attachments: Object.freeze({ count: manifest.totals.attachment_count, bytes: manifest.totals.attachment_bytes }),
    });
  } catch (error) {
    safeCleanupPartial(partialDirectory, backups, partialPrefix);
    if (error instanceof CodexPayloadBackupError) throw error;
    fail("backup_generation_failed");
  }
}

export function createCodexPayloadBackup(options = {}) {
  return createCodexPayloadBackupGeneration({ ...options, allowLegacyMessages: false });
}

export function createPreMigrationCodexPayloadBackup(options = {}) {
  return createCodexPayloadBackupGeneration({ ...options, allowLegacyMessages: true });
}

const TOP_MANIFEST_KEYS = new Set(["schema", "generation_id", "created_at", "database", "messages", "attachments", "totals"]);
const PRE_MIGRATION_TOP_MANIFEST_KEYS = new Set([
  "schema",
  "generation_id",
  "created_at",
  "database",
  "messages",
  "legacy_messages",
  "attachments",
  "totals",
]);
const DATABASE_MANIFEST_KEYS = new Set(["bytes", "sha256", "quick_check"]);
const MESSAGE_MANIFEST_KEYS = new Set(["item_id", "payload_ref", "role", "byte_length", "sha256", "envelope_bytes", "envelope_sha256"]);
const LEGACY_MESSAGE_MANIFEST_KEYS = new Set(["id", "item_id", "role", "byte_length", "sha256"]);
const ATTACHMENT_GROUP_KEYS = new Set(["item_id", "manifest_bytes", "manifest_sha256", "files"]);
const ATTACHMENT_FILE_KEYS = new Set(["attachment_id", "size", "sha256", "type"]);
const TOTALS_KEYS = new Set(["message_count", "message_bytes", "attachment_count", "attachment_bytes", "generation_payload_bytes"]);
const PRE_MIGRATION_TOTALS_KEYS = new Set([
  ...TOTALS_KEYS,
  "externalized_message_count",
  "legacy_message_count",
  "legacy_message_bytes",
]);

function validateGenerationManifest(document, generationId, maxRecords, maxTotalBytes) {
  const preMigration = document?.schema === CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_SCHEMA;
  if (!preMigration && document?.schema !== CODEX_PAYLOAD_BACKUP_SCHEMA) {
    fail("generation_manifest_identity_invalid");
  }
  assertExactKeys(
    document,
    preMigration ? PRE_MIGRATION_TOP_MANIFEST_KEYS : TOP_MANIFEST_KEYS,
    "generation_manifest_invalid",
  );
  if (document.generation_id !== generationId) {
    fail("generation_manifest_identity_invalid");
  }
  if (typeof document.created_at !== "string" || !Number.isFinite(Date.parse(document.created_at))) fail("generation_manifest_time_invalid");
  assertExactKeys(document.database, DATABASE_MANIFEST_KEYS, "generation_database_manifest_invalid");
  if (
    !Number.isSafeInteger(document.database.bytes)
    || document.database.bytes < 1
    || !SHA256_RE.test(String(document.database.sha256 ?? ""))
    || document.database.quick_check !== "ok"
  ) fail("generation_database_manifest_invalid");
  if (!Array.isArray(document.messages) || document.messages.length > maxRecords) fail("generation_messages_manifest_invalid");
  const seenMessages = new Set();
  const messages = document.messages.map((row) => {
    assertExactKeys(row, MESSAGE_MANIFEST_KEYS, "generation_message_manifest_invalid");
    const normalized = normalizeMessageRow({
      item_id: row.item_id,
      role: row.role,
      text: row.payload_ref,
      payload_ref: row.payload_ref,
      payload_byte_length: row.byte_length,
      payload_sha256: row.sha256,
    });
    if (seenMessages.has(normalized.payload_ref)) fail("generation_duplicate_message_ref");
    seenMessages.add(normalized.payload_ref);
    if (!Number.isSafeInteger(row.envelope_bytes) || row.envelope_bytes < 1 || !SHA256_RE.test(String(row.envelope_sha256 ?? ""))) {
      fail("generation_message_manifest_invalid");
    }
    return { ...normalized, envelope_bytes: row.envelope_bytes, envelope_sha256: row.envelope_sha256 };
  });
  const legacyMessages = preMigration ? document.legacy_messages : [];
  if (!Array.isArray(legacyMessages) || messages.length + legacyMessages.length > maxRecords) {
    fail("generation_legacy_messages_manifest_invalid");
  }
  const seenLegacyIds = new Set();
  const normalizedLegacyMessages = legacyMessages.map((row) => {
    assertExactKeys(row, LEGACY_MESSAGE_MANIFEST_KEYS, "generation_legacy_message_manifest_invalid");
    if (!Number.isSafeInteger(row.id) || row.id < 1 || seenLegacyIds.has(row.id)) {
      fail("generation_legacy_message_manifest_invalid");
    }
    seenLegacyIds.add(row.id);
    const itemId = normalizeItemId(row.item_id);
    const role = String(row.role ?? "");
    if (
      !MESSAGE_ROLES.has(role)
      || !Number.isSafeInteger(row.byte_length)
      || row.byte_length < 1
      || row.byte_length > DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES
      || !SHA256_RE.test(String(row.sha256 ?? ""))
    ) {
      fail("generation_legacy_message_manifest_invalid");
    }
    return { id: row.id, item_id: itemId, role, byte_length: row.byte_length, sha256: row.sha256 };
  });
  if (!Array.isArray(document.attachments) || document.attachments.length > maxRecords) fail("generation_attachments_manifest_invalid");
  const seenItems = new Set();
  const seenAttachments = new Set();
  let attachmentCount = 0;
  const attachments = document.attachments.map((group) => {
    assertExactKeys(group, ATTACHMENT_GROUP_KEYS, "generation_attachment_group_invalid");
    const itemId = normalizeItemId(group.item_id);
    if (seenItems.has(itemId)) fail("generation_duplicate_attachment_item");
    seenItems.add(itemId);
    if (!Number.isSafeInteger(group.manifest_bytes) || group.manifest_bytes < 1 || !SHA256_RE.test(String(group.manifest_sha256 ?? ""))) {
      fail("generation_attachment_group_invalid");
    }
    if (!Array.isArray(group.files)) fail("generation_attachment_files_invalid");
    attachmentCount += group.files.length;
    if (attachmentCount > maxRecords) fail("generation_attachment_record_limit_exceeded");
    const files = group.files.map((file) => {
      assertExactKeys(file, ATTACHMENT_FILE_KEYS, "generation_attachment_file_invalid");
      const attachmentId = assertSafeComponent(file.attachment_id, OPAQUE_ATTACHMENT_ID_RE, "generation_attachment_id_invalid");
      if (seenAttachments.has(attachmentId)) fail("generation_duplicate_attachment_id");
      seenAttachments.add(attachmentId);
      if (!Number.isSafeInteger(file.size) || file.size < 1 || !SHA256_RE.test(String(file.sha256 ?? ""))) {
        fail("generation_attachment_file_invalid");
      }
      if (!new Set(["localImage", "localFile"]).has(file.type)) fail("generation_attachment_type_invalid");
      return { attachment_id: attachmentId, size: file.size, sha256: file.sha256, type: file.type };
    });
    return {
      item_id: itemId,
      manifest_bytes: group.manifest_bytes,
      manifest_sha256: group.manifest_sha256,
      files,
    };
  });
  assertExactKeys(
    document.totals,
    preMigration ? PRE_MIGRATION_TOTALS_KEYS : TOTALS_KEYS,
    "generation_totals_invalid",
  );
  const expectedTotals = {
    message_count: messages.length + normalizedLegacyMessages.length,
    message_bytes: sumInventory(messages, "message")
      + normalizedLegacyMessages.reduce((sum, row) => sum + row.byte_length, 0),
    attachment_count: attachmentCount,
    attachment_bytes: sumInventory(attachments, "attachment"),
  };
  if (preMigration) {
    expectedTotals.externalized_message_count = messages.length;
    expectedTotals.legacy_message_count = normalizedLegacyMessages.length;
    expectedTotals.legacy_message_bytes = normalizedLegacyMessages.reduce((sum, row) => sum + row.byte_length, 0);
  }
  for (const [key, expected] of Object.entries(expectedTotals)) {
    if (document.totals[key] !== expected) fail("generation_totals_mismatch");
  }
  const expectedGenerationPayloadBytes = document.database.bytes
    + messages.reduce((sum, row) => sum + row.envelope_bytes, 0)
    + attachments.reduce((sum, group) => sum + group.manifest_bytes + group.files.reduce((fileSum, file) => fileSum + file.size, 0), 0);
  if (
    !Number.isSafeInteger(document.totals.generation_payload_bytes)
    || document.totals.generation_payload_bytes !== expectedGenerationPayloadBytes
    || document.totals.generation_payload_bytes > maxTotalBytes
  ) {
    fail("generation_totals_invalid");
  }
  return {
    ...document,
    messages,
    legacy_messages: normalizedLegacyMessages,
    attachments,
    pre_migration: preMigration,
  };
}

function readCommittedGeneration(backupRoot, generationId, maxRecords, maxTotalBytes, { expectPreMigration }) {
  const generation = assertChildDirectory(join(backupRoot.real, generationId), backupRoot, "generation_unavailable");
  const v1ManifestPath = join(generation.real, GENERATION_MANIFEST_FILE);
  const v2ManifestPath = join(generation.real, PRE_MIGRATION_GENERATION_MANIFEST_FILE);
  const present = [v1ManifestPath, v2ManifestPath].filter((path) => existsSync(path));
  if (present.length !== 1) fail("generation_manifest_file_ambiguous");
  const manifestFile = readVerifiedFile(present[0], generation, { maxBytes: MAX_MANIFEST_BYTES });
  const commitFile = readVerifiedFile(join(generation.real, GENERATION_COMMIT_FILE), generation, { maxBytes: 65 });
  if (commitFile.bytes.toString("ascii") !== `${manifestFile.sha256}\n`) fail("generation_commit_invalid");
  let document;
  try { document = JSON.parse(manifestFile.bytes.toString("utf8")); }
  catch { fail("generation_manifest_json_invalid"); }
  const manifest = validateGenerationManifest(document, generationId, maxRecords, maxTotalBytes);
  const expectedFilename = manifest.pre_migration ? PRE_MIGRATION_GENERATION_MANIFEST_FILE : GENERATION_MANIFEST_FILE;
  if (basename(present[0]) !== expectedFilename) fail("generation_manifest_filename_schema_mismatch");
  if (manifest.pre_migration !== expectPreMigration) fail("generation_manifest_mode_mismatch");
  return { generation, manifest, manifest_sha256: manifestFile.sha256 };
}

function compareDatabaseRowsToManifest(dbPath, manifestMessages, manifestLegacyMessages, maxRecords, { preMigration }) {
  const rows = classifyDatabaseMessageRows(dbPath, maxRecords, { allowLegacyMessages: preMigration });
  if (rows.complete.length !== manifestMessages.length) fail("restored_database_pointer_count_mismatch");
  for (let index = 0; index < rows.complete.length; index += 1) {
    const left = rows.complete[index];
    const right = manifestMessages[index];
    for (const key of ["item_id", "payload_ref", "role", "byte_length", "sha256"]) {
      if (left[key] !== right[key]) fail("restored_database_pointer_mismatch");
    }
  }
  if (rows.legacy.length !== manifestLegacyMessages.length) fail("restored_database_legacy_count_mismatch");
  for (let index = 0; index < rows.legacy.length; index += 1) {
    const left = rows.legacy[index];
    const right = manifestLegacyMessages[index];
    for (const key of ["id", "item_id", "role", "byte_length", "sha256"]) {
      if (left[key] !== right[key]) fail("restored_database_legacy_metadata_mismatch");
    }
  }
}

function restoreMessages({ generation, restoreRoot, messages, maxEnvelopeBytes }) {
  const sourceObjects = assertChildDirectory(join(generation.real, MESSAGE_OBJECT_DIRECTORY), generation, "message_objects_unavailable");
  const owner = mkdirExclusive(join(restoreRoot.real, "message-payloads"));
  const service = mkdirExclusive(join(owner.real, MESSAGE_SERVICE_DIRECTORY));
  const items = mkdirExclusive(join(service.real, MESSAGE_ITEMS_DIRECTORY));
  for (const row of messages) {
    const sourcePath = join(sourceObjects.real, `${row.payload_ref}.payload`);
    const source = readVerifiedFile(sourcePath, sourceObjects, {
      maxBytes: maxEnvelopeBytes,
      expectedSize: row.envelope_bytes,
    });
    if (source.sha256 !== row.envelope_sha256) fail("message_object_hash_mismatch");
    parseMessageEnvelope(source.bytes, row);
    const itemPath = join(items.real, messageItemDirectoryName(row.item_id));
    const item = existsSync(itemPath) ? assertChildDirectory(itemPath, items, "restore_message_item_invalid") : mkdirExclusive(itemPath);
    const payloadDirectory = mkdirExclusive(join(item.real, row.payload_ref));
    writeExclusiveBytes(join(payloadDirectory.real, MESSAGE_PAYLOAD_FILE), source.bytes);
    writeExclusiveBytes(join(payloadDirectory.real, MESSAGE_COMMIT_FILE), Buffer.alloc(0));
  }
  return owner;
}

function validateAttachmentManifestAgainstInventory(parsed, group) {
  if (parsed.item_id !== group.item_id || parsed.attachments.length !== group.files.length) {
    fail("attachment_manifest_inventory_mismatch");
  }
  for (let index = 0; index < parsed.attachments.length; index += 1) {
    const record = parsed.attachments[index];
    const expected = group.files[index];
    for (const key of ["attachment_id", "size", "sha256", "type"]) {
      if (record[key] !== expected[key]) fail("attachment_manifest_inventory_mismatch");
    }
  }
}

function restoreAttachments({ generation, restoreRoot, attachments, maxAttachmentBytes }) {
  const sourceObjects = assertChildDirectory(join(generation.real, ATTACHMENT_OBJECT_DIRECTORY), generation, "attachment_objects_unavailable");
  const sourceManifests = assertChildDirectory(
    join(generation.real, ATTACHMENT_MANIFEST_OBJECT_DIRECTORY),
    generation,
    "attachment_manifest_objects_unavailable",
  );
  const owner = mkdirExclusive(join(restoreRoot.real, "attachments"));
  for (const group of attachments) {
    const manifestFile = readVerifiedFile(join(sourceManifests.real, `${itemObjectKey(group.item_id)}.manifest`), sourceManifests, {
      maxBytes: MAX_MANIFEST_BYTES,
      expectedSize: group.manifest_bytes,
    });
    if (manifestFile.sha256 !== group.manifest_sha256) fail("attachment_manifest_object_hash_mismatch");
    let parsed;
    try { parsed = parseAttachmentManifestJson(manifestFile.bytes.toString("utf8"), { maxBytes: maxAttachmentBytes }); }
    catch { fail("attachment_manifest_object_invalid"); }
    validateAttachmentManifestAgainstInventory(parsed, group);
    const item = mkdirExclusive(join(owner.real, safeItemDirectoryName(group.item_id)));
    for (const record of parsed.attachments) {
      copyVerifiedFile(
        join(sourceObjects.real, `${record.attachment_id}.payload`),
        sourceObjects,
        join(item.real, record.stored_name),
        { maxBytes: maxAttachmentBytes, expectedSize: record.size, expectedSha256: record.sha256 },
      );
    }
    writeExclusiveBytes(join(item.real, ATTACHMENT_MANIFEST_FILE), manifestFile.bytes);
  }
  return owner;
}

function verifyRestoredMessages({
  dbPath,
  messageRoot,
  expected,
  expectedLegacy,
  preMigration,
  maxRecords,
  maxEnvelopeBytes,
}) {
  compareDatabaseRowsToManifest(dbPath, expected, expectedLegacy, maxRecords, { preMigration });
  const rows = classifyDatabaseMessageRows(dbPath, maxRecords, { allowLegacyMessages: preMigration }).complete;
  const service = assertChildDirectory(join(messageRoot.real, MESSAGE_SERVICE_DIRECTORY), messageRoot, "restored_message_service_invalid");
  const items = assertChildDirectory(join(service.real, MESSAGE_ITEMS_DIRECTORY), service, "restored_message_items_invalid");
  for (const row of rows) {
    const item = assertChildDirectory(join(items.real, messageItemDirectoryName(row.item_id)), items, "restored_message_item_invalid");
    const payload = assertChildDirectory(join(item.real, row.payload_ref), item, "restored_message_payload_invalid");
    const marker = readVerifiedFile(join(payload.real, MESSAGE_COMMIT_FILE), payload, { maxBytes: 0, expectedSize: 0, emptyAllowed: true });
    if (marker.size !== 0) fail("restored_message_commit_invalid");
    const envelope = readVerifiedFile(join(payload.real, MESSAGE_PAYLOAD_FILE), payload, { maxBytes: maxEnvelopeBytes });
    parseMessageEnvelope(envelope.bytes, row);
  }
}

function verifyRestoredAttachments({ attachmentRoot, expected, maxAttachmentBytes }) {
  const directories = listPlainChildDirectories(attachmentRoot);
  if (directories.length !== expected.length) fail("restored_attachment_item_count_mismatch");
  const expectedByItem = new Map(expected.map((group) => [group.item_id, group]));
  for (const directory of directories) {
    const manifest = readVerifiedFile(join(directory.real, ATTACHMENT_MANIFEST_FILE), directory, { maxBytes: MAX_MANIFEST_BYTES });
    let parsed;
    try { parsed = parseAttachmentManifestJson(manifest.bytes.toString("utf8"), { maxBytes: maxAttachmentBytes }); }
    catch { fail("restored_attachment_manifest_invalid"); }
    const group = expectedByItem.get(parsed.item_id);
    if (!group || manifest.sha256 !== group.manifest_sha256 || manifest.size !== group.manifest_bytes) {
      fail("restored_attachment_manifest_mismatch");
    }
    validateAttachmentManifestAgainstInventory(parsed, group);
    for (const record of parsed.attachments) {
      const file = readVerifiedFile(join(directory.real, record.stored_name), directory, {
        maxBytes: maxAttachmentBytes,
        expectedSize: record.size,
      });
      if (file.sha256 !== record.sha256) fail("restored_attachment_hash_mismatch");
    }
  }
}

function restoreAndVerifyCodexPayloadBackupGeneration({
  backupRoot,
  generationId,
  restoreRoot,
  now = new Date(),
  maxRecords = DEFAULT_MAX_RECORDS,
  maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
  maxMessageEnvelopeBytes = DEFAULT_MAX_MESSAGE_ENVELOPE_BYTES,
  maxAttachmentBytes = DEFAULT_MAX_ATTACHMENT_BYTES,
  expectPreMigration = false,
} = {}) {
  const recordsLimit = validatePositiveLimit(maxRecords, DEFAULT_MAX_RECORDS, "max_records_invalid");
  const totalLimit = validatePositiveLimit(maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, "max_total_bytes_invalid");
  const envelopeLimit = validatePositiveLimit(maxMessageEnvelopeBytes, DEFAULT_MAX_MESSAGE_ENVELOPE_BYTES, "max_message_bytes_invalid");
  const attachmentLimit = validatePositiveLimit(maxAttachmentBytes, DEFAULT_MAX_ATTACHMENT_BYTES, "max_attachment_bytes_invalid");
  const id = normalizeGenerationId(generationId);
  const backupPath = requirePathInput(backupRoot, "backup_root_required");
  const restorePath = requirePathInput(restoreRoot, "restore_root_required");
  if (pathsOverlap(backupPath, restorePath)) fail("restore_root_overlaps_backup");
  const backups = pinRoot(backupPath, { code: "backup_root_invalid" });
  const restores = pinRoot(restorePath, { create: true, code: "restore_root_invalid" });
  if (pathsOverlap(backups.real, restores.real)) fail("restore_root_overlaps_backup");
  const committed = withRetargetStage("generation", () => readCommittedGeneration(
    backups,
    id,
    recordsLimit,
    totalLimit,
    { expectPreMigration },
  ));
  const finalDirectory = safeObjectPath(restores, id);
  if (existsSync(finalDirectory)) fail("restore_collision");
  const partialPrefix = `.partial-restore-${id}-`;
  const partialDirectory = safeObjectPath(restores, `${partialPrefix}${randomBytes(6).toString("hex")}`);
  let stage = "partial_create";
  try {
    const partial = mkdirExclusive(partialDirectory);
    stage = "database_copy";
    const databaseDestination = join(partial.real, DATABASE_OBJECT_FILE);
    const databaseCopy = withRetargetStage("database", () => copyVerifiedFile(
      join(committed.generation.real, DATABASE_OBJECT_FILE),
      committed.generation,
      databaseDestination,
      {
        maxBytes: DEFAULT_MAX_TOTAL_BYTES,
        expectedSize: committed.manifest.database.bytes,
        expectedSha256: committed.manifest.database.sha256,
      },
    ));
    if (databaseCopy.sha256 !== committed.manifest.database.sha256) fail("database_object_hash_mismatch");
    stage = "database_verify";
    databaseQuickCheck(databaseDestination);
    compareDatabaseRowsToManifest(
      databaseDestination,
      committed.manifest.messages,
      committed.manifest.legacy_messages,
      recordsLimit,
      { preMigration: committed.manifest.pre_migration },
    );
    stage = "message_restore";
    const messageRoot = withRetargetStage("message_restore", () => restoreMessages({
      generation: committed.generation,
      restoreRoot: partial,
      messages: committed.manifest.messages,
      maxEnvelopeBytes: envelopeLimit,
    }));
    stage = "attachment_restore";
    const attachmentRoot = withRetargetStage("attachment_restore", () => restoreAttachments({
      generation: committed.generation,
      restoreRoot: partial,
      attachments: committed.manifest.attachments,
      maxAttachmentBytes: attachmentLimit,
    }));
    stage = "message_verify";
    withRetargetStage("message_verify", () => verifyRestoredMessages({
      dbPath: databaseDestination,
      messageRoot,
      expected: committed.manifest.messages,
      expectedLegacy: committed.manifest.legacy_messages,
      preMigration: committed.manifest.pre_migration,
      maxRecords: recordsLimit,
      maxEnvelopeBytes: envelopeLimit,
    }));
    stage = "attachment_verify";
    withRetargetStage("attachment_verify", () => verifyRestoredAttachments({
      attachmentRoot,
      expected: committed.manifest.attachments,
      maxAttachmentBytes: attachmentLimit,
    }));
    stage = "commit_marker";
    writeExclusiveBytes(join(partial.real, RESTORE_COMMIT_FILE), Buffer.from(`${committed.manifest_sha256}\n`, "ascii"));
    syncDirectoryBestEffort(partial.real);
    stage = "root_stability";
    assertPinnedRootStable(backups, "backup_root_retargeted");
    assertPinnedRootStable(restores, "restore_root_retargeted");
    stage = "publish";
    renameSync(partial.real, finalDirectory);
    syncDirectoryBestEffort(restores.real);
    return Object.freeze({
      schema: expectPreMigration ? CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_RESULT_SCHEMA : CODEX_PAYLOAD_BACKUP_RESULT_SCHEMA,
      kind: expectPreMigration ? "pre_migration_restore_verify" : "restore_verify",
      ok: true,
      generation_id: id,
      verified_at: now.toISOString(),
      manifest_sha256: committed.manifest_sha256,
      database: Object.freeze({
        bytes: committed.manifest.database.bytes,
        sha256: committed.manifest.database.sha256,
        quick_check: "ok",
      }),
      messages: Object.freeze({
        count: committed.manifest.totals.message_count,
        bytes: committed.manifest.totals.message_bytes,
        ...(committed.manifest.pre_migration ? {
          externalized_count: committed.manifest.totals.externalized_message_count,
          legacy_count: committed.manifest.totals.legacy_message_count,
        } : {}),
      }),
      attachments: Object.freeze({
        count: committed.manifest.totals.attachment_count,
        bytes: committed.manifest.totals.attachment_bytes,
      }),
    });
  } catch (error) {
    safeCleanupPartial(partialDirectory, restores, partialPrefix);
    if (error instanceof CodexPayloadBackupError) throw error;
    fail(`restore_${stage}_failed`);
  }
}

export function restoreAndVerifyCodexPayloadBackup(options = {}) {
  return restoreAndVerifyCodexPayloadBackupGeneration({ ...options, expectPreMigration: false });
}

export function restoreAndVerifyPreMigrationCodexPayloadBackup(options = {}) {
  return restoreAndVerifyCodexPayloadBackupGeneration({ ...options, expectPreMigration: true });
}

export function parseCodexPayloadBackupCli(argv = process.argv.slice(2)) {
  const empty = (command, help) => ({
    command,
    help,
    dbPath: null,
    attachmentRoot: null,
    messagePayloadRoot: null,
    backupRoot: null,
    generationId: null,
    restoreRoot: null,
  });
  if (argv.length === 0 || (argv.length === 1 && new Set(["--help", "-h"]).has(argv[0]))) {
    return empty("help", true);
  }
  const command = argv[0];
  const backupCommands = new Set(["backup", "backup-pre-migration"]);
  const restoreCommands = new Set(["restore-verify", "pre-migration-restore-verify"]);
  if (!backupCommands.has(command) && !restoreCommands.has(command)) fail("cli_argument_invalid");
  const allowed = backupCommands.has(command)
    ? new Set(["--db", "--attachment-root", "--message-root", "--backup-root", "--generation-id"])
    : new Set(["--backup-root", "--generation-id", "--restore-root"]);
  const propertyByFlag = {
    "--db": "dbPath",
    "--attachment-root": "attachmentRoot",
    "--message-root": "messagePayloadRoot",
    "--backup-root": "backupRoot",
    "--generation-id": "generationId",
    "--restore-root": "restoreRoot",
  };
  const options = empty(command, false);
  const seen = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      if (seen.has("help")) fail("cli_argument_invalid");
      seen.add("help");
      options.help = true;
      continue;
    }
    if (!allowed.has(token) || seen.has(token)) fail("cli_argument_invalid");
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) fail("cli_argument_invalid");
    seen.add(token);
    options[propertyByFlag[token]] = value;
    index += 1;
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
  node tools/codex_payload_backup.mjs backup --db <db> --attachment-root <root> --message-root <root> --backup-root <root> [--generation-id <id>]
  node tools/codex_payload_backup.mjs backup-pre-migration --db <db> --attachment-root <root> --message-root <root> --backup-root <root> [--generation-id <id>]
  node tools/codex_payload_backup.mjs restore-verify --backup-root <root> --generation-id <id> --restore-root <root>
  node tools/codex_payload_backup.mjs pre-migration-restore-verify --backup-root <root> --generation-id <id> --restore-root <root>

backup-pre-migration is the only mode that accepts pure legacy inline messages. It still rejects partial states and keeps legacy bodies only in the SQLite snapshot.
The JSON result contains hashes, byte counts, and opaque IDs only. It never emits source or restore paths, message text, attachment names, or file bodies.
`);
}

function safeCliError(error, kind) {
  const safeKinds = new Set([
    "backup",
    "backup-pre-migration",
    "restore-verify",
    "pre-migration-restore-verify",
  ]);
  const safeKind = safeKinds.has(kind) ? kind : "invalid";
  return {
    schema: new Set(["backup-pre-migration", "pre-migration-restore-verify"]).has(safeKind)
      ? CODEX_PAYLOAD_PRE_MIGRATION_BACKUP_RESULT_SCHEMA
      : CODEX_PAYLOAD_BACKUP_RESULT_SCHEMA,
    kind: safeKind,
    ok: false,
    error: error instanceof CodexPayloadBackupError ? error.code : "operation_failed",
  };
}

export function runCodexPayloadBackupCli(options = parseCodexPayloadBackupCli()) {
  if (options.command === "backup") return createCodexPayloadBackup(options);
  if (options.command === "backup-pre-migration") return createPreMigrationCodexPayloadBackup(options);
  if (options.command === "restore-verify") return restoreAndVerifyCodexPayloadBackup(options);
  if (options.command === "pre-migration-restore-verify") return restoreAndVerifyPreMigrationCodexPayloadBackup(options);
  return safeCliError(new CodexPayloadBackupError("unknown_command"), options.command);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  let options = null;
  try {
    options = parseCodexPayloadBackupCli();
    if (options.help) {
      printHelp();
    } else {
      const result = runCodexPayloadBackupCli(options);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } catch (error) {
    const kind = options?.command || process.argv[2] || "invalid";
    console.log(JSON.stringify(safeCliError(error, kind), null, 2));
    process.exitCode = 1;
  }
}
