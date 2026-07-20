#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";

export const PROJECT_HISTORY_COPY_BINDING_SCHEMA_VERSION =
  "soulforge.project_history_copy_binding.v1";
export const PROJECT_HISTORY_COPY_ARTIFACT_MANIFEST_SCHEMA_VERSION =
  "soulforge.project_history_copy_artifact_manifest.v1";

export const PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES = Object.freeze({
  csv: "project_history.csv",
  xlsx_input: "project_history.xlsx-input.json",
  xlsx: "project_history.xlsx",
  xlsx_readback: "project_history.xlsx-readback.json",
  manifest: "project_history.artifact-manifest.json",
});

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "binary");
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PATH_ID_PATTERN = /^(?=.{1,256}$)(?=.*[A-Za-z0-9])[A-Za-z0-9_@+.-]+$/u;
const EXACT_ID_PATTERN = /^(?=.{1,256}$)(?=.*[A-Za-z0-9])[A-Za-z0-9_:@+.-]+$/u;
const PRODUCTION_PATH_SEGMENTS = new Set([
  "active",
  "current",
  "live",
  "prod",
  "production",
  "runtime",
]);
const PHYSICAL_IDENTITY_FIELDS = Object.freeze([
  "platform",
  "realpath",
  "dev",
  "ino",
  "nlink",
  "file_id",
]);
const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "enabled",
  "accepted_history",
  "database_path",
  "database_identity",
  "database_sha256",
  "allowed_project_ids",
  "projection_root",
  "projection_root_identity",
  "binding_digest",
]);
const BINDING_BODY_FIELDS = Object.freeze(BINDING_FIELDS.filter((field) => field !== "binding_digest"));
const ARTIFACT_RECORD_FIELDS = Object.freeze(["filename", "size", "sha256"]);
const ARTIFACT_KEYS = Object.freeze(["csv", "xlsx_input", "xlsx", "xlsx_readback"]);
const ARTIFACT_MANIFEST_FIELDS = Object.freeze([
  "schema_version",
  "binding_digest",
  "project_id",
  "generation_id",
  "generation_digest",
  "database_before_sha256",
  "database_after_sha256",
  "ordered_event_digest",
  "ordered_row_digest",
  "artifacts",
  "artifact_manifest_digest",
]);
const ARTIFACT_MANIFEST_BODY_FIELDS = Object.freeze(
  ARTIFACT_MANIFEST_FIELDS.filter((field) => field !== "artifact_manifest_digest"),
);
const MAX_BINDING_BYTES = 1024 * 1024;

export class ProjectHistoryCopyBindingError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProjectHistoryCopyBindingError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectHistoryCopyBindingError(code, message);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail("plain_object_required", `${label} must be a plain object`);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", `${label} fields differ from the fixed contract`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", `${label} must be a canonical sha256 digest`);
  }
  return value;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePathForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalizePathForComparison(left) === normalizePathForComparison(right);
}

function assertAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", `${label} must be an absolute path`);
  }
  return path.resolve(value);
}

function assertExactIdentifier(value, label) {
  if (typeof value !== "string"
      || !EXACT_ID_PATTERN.test(value)
      || value === "."
      || value === ".."
      || value.includes("...")) {
    fail("identifier_invalid", `${label} is not a safe exact identifier`);
  }
  return value;
}

function artifactPathSegment(value, label) {
  assertExactIdentifier(value, label);
  if (PATH_ID_PATTERN.test(value) && value !== "." && value !== ".." && !value.includes("...")) {
    return value;
  }
  const digest = createHash("sha256").update(`${label}\0${value}`, "utf8").digest("hex");
  return `${label}-${digest}`;
}

function decimalStatValue(value) {
  return typeof value === "bigint" ? value.toString(10) : null;
}

function physicalIdentity(realpath, stat) {
  const dev = decimalStatValue(stat.dev);
  const ino = decimalStatValue(stat.ino);
  return Object.freeze({
    platform: process.platform,
    realpath,
    dev,
    ino,
    nlink: Number(stat.nlink),
    file_id: dev !== null && ino !== null ? `${dev}:${ino}` : null,
  });
}

function validatePhysicalIdentity(value, label, { standaloneFile }) {
  assertExactKeys(value, PHYSICAL_IDENTITY_FIELDS, label);
  if (typeof value.platform !== "string" || value.platform.length === 0
      || typeof value.realpath !== "string" || !path.isAbsolute(value.realpath)
      || (value.dev !== null && !/^(?:0|[1-9]\d*)$/u.test(value.dev))
      || (value.ino !== null && !/^(?:0|[1-9]\d*)$/u.test(value.ino))
      || !Number.isSafeInteger(value.nlink) || value.nlink < 1
      || (value.file_id !== null && typeof value.file_id !== "string")) {
    fail("physical_identity_invalid", `${label} is invalid`);
  }
  const expectedFileId = value.dev !== null && value.ino !== null
    ? `${value.dev}:${value.ino}`
    : null;
  if (value.file_id !== expectedFileId) {
    fail("physical_identity_invalid", `${label}.file_id does not match dev and ino`);
  }
  if (standaloneFile && value.nlink !== 1) {
    fail("sqlite_copy_hardlink_forbidden", "The copied database must have exactly one filesystem link");
  }
  return value;
}

function samePhysicalIdentity(left, right) {
  return left.platform === right.platform
    && samePath(left.realpath, right.realpath)
    && left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.file_id === right.file_id;
}

export function productionLookingPathReasons(filePath) {
  const resolved = path.resolve(filePath);
  const normalized = resolved.replace(/\\/gu, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const reasons = [];
  const resolvedRoot = path.parse(resolved).root;
  const systemRoot = path.parse(process.env.SystemRoot ?? "").root;
  if (
    process.platform === "win32"
    && /^[a-z]:\\$/iu.test(resolvedRoot)
    && systemRoot
    && !samePath(resolvedRoot, systemRoot)
  ) {
    reasons.push("live_drive");
  }
  if (normalized.startsWith("//")) reasons.push("unc_path");
  if (segments.some((segment) => PRODUCTION_PATH_SEGMENTS.has(segment))) {
    reasons.push("production_segment");
  }
  if (/(?:^|\/)ui-workspace\/apps\/dev-erp\/data(?:\/|$)/u.test(normalized)) {
    reasons.push("dev_erp_data_root");
  }
  if (/^(?:dev-erp|database)\.(?:db|sqlite|sqlite3)$/iu.test(path.basename(resolved))) {
    reasons.push("production_database_name");
  }
  return [...new Set(reasons)];
}

function inspectDirectPath(filePath, { directory, standaloneFile, label }) {
  const resolved = assertAbsolutePath(filePath, label);
  let entry;
  let real;
  try {
    entry = lstatSync(resolved, { bigint: true });
    real = realpathSync.native(resolved);
  } catch {
    fail(directory ? "projection_root_missing" : "sqlite_copy_missing", `${label} does not exist`);
  }
  if (entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile())) {
    fail(
      directory ? "projection_root_not_direct_directory" : "sqlite_copy_not_standalone_file",
      `${label} must be a direct, non-symlink ${directory ? "directory" : "regular file"}`,
    );
  }
  if (!samePath(real, resolved)) {
    fail(
      directory ? "projection_root_realpath_mismatch" : "sqlite_copy_realpath_mismatch",
      `${label} must resolve directly to itself`,
    );
  }
  const identity = physicalIdentity(real, entry);
  if (standaloneFile && identity.nlink !== 1) {
    fail("sqlite_copy_hardlink_forbidden", "The copied database must have exactly one filesystem link");
  }
  return Object.freeze({ path: resolved, identity });
}

function assertNoSqliteSidecars(dbPath) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(`${dbPath}${suffix}`)) {
      fail("sqlite_sidecar_present", "A standalone copy cannot have WAL, SHM, or journal sidecars");
    }
  }
}

function readStableFileSnapshot(
  filePath,
  expectedIdentity = null,
  maxBytes = Number.MAX_SAFE_INTEGER,
  beforeDatabaseOpen = null,
) {
  const direct = inspectDirectPath(filePath, {
    directory: false,
    standaloneFile: true,
    label: "copied database",
  });
  if (expectedIdentity !== null && !samePhysicalIdentity(direct.identity, expectedIdentity)) {
    fail("database_identity_mismatch", "The copied database physical identity changed");
  }
  if (beforeDatabaseOpen !== null) {
    const hookResult = beforeDatabaseOpen();
    if (hookResult !== null && typeof hookResult === "object"
        && typeof hookResult.then === "function") {
      fail("test_hook_async_forbidden", "Database-open boundary hook must be synchronous");
    }
  }
  const descriptor = openSync(direct.path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maxBytes)) {
      fail("sqlite_copy_not_standalone_file", "The copied database snapshot is not a bounded standalone file");
    }
    const beforeIdentity = physicalIdentity(direct.identity.realpath, before);
    if (!samePhysicalIdentity(beforeIdentity, direct.identity)) {
      fail("database_identity_mismatch", "The opened database differs from the pinned direct file");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const afterIdentity = physicalIdentity(direct.identity.realpath, after);
    const finalDirect = inspectDirectPath(direct.path, {
      directory: false,
      standaloneFile: true,
      label: "copied database",
    });
    if (!samePhysicalIdentity(beforeIdentity, afterIdentity)
        || !samePhysicalIdentity(afterIdentity, finalDirect.identity)
        || bytes.length !== Number(after.size)) {
      fail("database_snapshot_changed", "The copied database changed while it was being hashed");
    }
    return Object.freeze({
      path: direct.path,
      identity: finalDirect.identity,
      bytes,
      sha256: sha256Bytes(bytes),
    });
  } finally {
    closeSync(descriptor);
  }
}

function assertStandaloneSqliteSemantics(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    if (Number(db.prepare("PRAGMA query_only").get().query_only) !== 1) {
      fail("query_only_guard_failed", "SQLite query_only could not be enabled");
    }
    const databases = db.prepare("PRAGMA database_list").all();
    if (databases.length !== 1 || databases[0].name !== "main") {
      fail("attached_database_forbidden", "The copy must expose only one standalone main database");
    }
    const journalMode = String(db.prepare("PRAGMA journal_mode").get().journal_mode).toLowerCase();
    if (journalMode === "wal") {
      fail("wal_mode_copy_forbidden", "The standalone copy must not retain WAL journal mode");
    }
    const integrity = db.prepare("PRAGMA integrity_check(1)").get().integrity_check;
    if (integrity !== "ok") fail("sqlite_integrity_failed", "The copied database failed integrity_check");
    return Object.freeze({ journal_mode: journalMode, query_only: true });
  } finally {
    db.close();
  }
}

export function inspectStandaloneProjectHistoryCopy(
  dbPath,
  {
    expectedIdentity = null,
    expectedSha256 = null,
    verifySqlite = true,
    beforeDatabaseOpen = null,
  } = {},
) {
  const resolved = assertAbsolutePath(dbPath, "copied database path");
  const productionReasons = productionLookingPathReasons(resolved);
  if (productionReasons.length > 0) {
    fail("production_database_refused", `The database path is live/production-looking (${productionReasons.join(",")})`);
  }
  assertNoSqliteSidecars(resolved);
  if (beforeDatabaseOpen !== null && typeof beforeDatabaseOpen !== "function") {
    fail("test_hook_invalid", "Database-open boundary hook must be a function");
  }
  const snapshot = readStableFileSnapshot(
    resolved,
    expectedIdentity,
    Number.MAX_SAFE_INTEGER,
    beforeDatabaseOpen,
  );
  if (snapshot.bytes.length < SQLITE_HEADER.length
      || !snapshot.bytes.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
    fail("sqlite_header_invalid", "The existing file is not an initialized SQLite database");
  }
  if (expectedSha256 !== null) {
    assertDigest(expectedSha256, "expected database sha256");
    if (snapshot.sha256 !== expectedSha256) {
      fail("database_hash_mismatch", "The copied database bytes differ from the private binding");
    }
  }
  const sqlite = verifySqlite ? assertStandaloneSqliteSemantics(snapshot.path) : null;
  assertNoSqliteSidecars(resolved);
  const finalSnapshot = readStableFileSnapshot(resolved, snapshot.identity);
  if (finalSnapshot.sha256 !== snapshot.sha256) {
    fail("database_snapshot_changed", "The copied database changed during standalone inspection");
  }
  return Object.freeze({
    path: snapshot.path,
    identity: snapshot.identity,
    sha256: snapshot.sha256,
    sqlite,
  });
}

function inspectProjectionRoot(projectionRoot, expectedIdentity = null) {
  const direct = inspectDirectPath(projectionRoot, {
    directory: true,
    standaloneFile: false,
    label: "projection root",
  });
  if (expectedIdentity !== null && !samePhysicalIdentity(direct.identity, expectedIdentity)) {
    fail("projection_root_identity_mismatch", "The projection root physical identity changed");
  }
  return direct;
}

function validateAllowedProjectIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) {
    fail("allowed_project_ids_invalid", "allowed_project_ids must be a non-empty bounded array");
  }
  const ids = value.map((entry, index) => assertExactIdentifier(entry, `allowed_project_ids[${index}]`));
  const sorted = [...ids].sort();
  if (new Set(ids).size !== ids.length || ids.some((entry, index) => entry !== sorted[index])) {
    fail("allowed_project_ids_invalid", "allowed_project_ids must be unique and canonically sorted");
  }
  return ids;
}

function bindingBody(value) {
  return Object.fromEntries(BINDING_BODY_FIELDS.map((field) => [field, value[field]]));
}

export function createProjectHistoryCopyBinding({
  dbPath,
  projectionRoot,
  allowedProjectIds,
  enabled = true,
  acceptedHistory = false,
}) {
  if (enabled !== true) fail("binding_must_be_enabled", "A new binding must set enabled=true");
  if (acceptedHistory !== false) {
    fail("accepted_history_forbidden", "Copied-ERP projection binding must set accepted_history=false");
  }
  if (!Array.isArray(allowedProjectIds)) {
    fail("allowed_project_ids_invalid", "allowedProjectIds must be a non-empty array");
  }
  const ids = [...validateAllowedProjectIds([...allowedProjectIds].sort())];
  const database = inspectStandaloneProjectHistoryCopy(path.resolve(dbPath));
  const root = inspectProjectionRoot(path.resolve(projectionRoot));
  const body = {
    schema_version: PROJECT_HISTORY_COPY_BINDING_SCHEMA_VERSION,
    enabled: true,
    accepted_history: false,
    database_path: database.path,
    database_identity: database.identity,
    database_sha256: database.sha256,
    allowed_project_ids: ids,
    projection_root: root.path,
    projection_root_identity: root.identity,
  };
  return Object.freeze({ ...body, binding_digest: sha256Canonical(body) });
}

export function verifyProjectHistoryCopyBinding(value, { expectedDigest = null } = {}) {
  assertExactKeys(value, BINDING_FIELDS, "project-history copy binding");
  if (value.schema_version !== PROJECT_HISTORY_COPY_BINDING_SCHEMA_VERSION
      || value.enabled !== true
      || value.accepted_history !== false) {
    fail("binding_boundary_invalid", "Binding must be enabled, feature-OFF, and accepted_history=false");
  }
  const databasePath = assertAbsolutePath(value.database_path, "binding database_path");
  const projectionRoot = assertAbsolutePath(value.projection_root, "binding projection_root");
  validatePhysicalIdentity(value.database_identity, "database_identity", { standaloneFile: true });
  validatePhysicalIdentity(value.projection_root_identity, "projection_root_identity", { standaloneFile: false });
  if (!samePath(value.database_identity.realpath, databasePath)
      || !samePath(value.projection_root_identity.realpath, projectionRoot)) {
    fail("binding_realpath_mismatch", "Binding paths differ from their pinned realpaths");
  }
  assertDigest(value.database_sha256, "database_sha256");
  validateAllowedProjectIds(value.allowed_project_ids);
  assertDigest(value.binding_digest, "binding_digest");
  const computed = sha256Canonical(bindingBody(value));
  if (value.binding_digest !== computed) fail("binding_digest_mismatch", "Binding digest is invalid");
  if (expectedDigest !== null) {
    assertDigest(expectedDigest, "expected binding digest");
    if (computed !== expectedDigest) fail("binding_digest_mismatch", "Binding does not match the externally pinned digest");
  }
  return value;
}

function readStableJsonFile(filePath, label) {
  const resolved = assertAbsolutePath(filePath, `${label} path`);
  let before;
  let after;
  let real;
  let bytes;
  try {
    before = lstatSync(resolved, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
        || before.size < 1n || before.size > BigInt(MAX_BINDING_BYTES)) {
      fail("binding_file_invalid", `${label} must be a bounded standalone file`);
    }
    bytes = readFileSync(resolved);
    after = lstatSync(resolved, { bigint: true });
    real = realpathSync.native(resolved);
  } catch (error) {
    if (error instanceof ProjectHistoryCopyBindingError) throw error;
    fail("binding_file_invalid", `${label} could not be read`);
  }
  const beforeIdentity = physicalIdentity(real, before);
  const afterIdentity = physicalIdentity(real, after);
  if (!samePath(real, resolved)
      || !samePhysicalIdentity(beforeIdentity, afterIdentity)
      || bytes.length !== Number(after.size)) {
    fail("binding_file_changed", `${label} changed while it was being read`);
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, ""));
  } catch {
    fail("binding_json_invalid", `${label} is not strict UTF-8 JSON`);
  }
}

export function readProjectHistoryCopyBinding(bindingPath, { expectedDigest = null } = {}) {
  return verifyProjectHistoryCopyBinding(
    readStableJsonFile(bindingPath, "project-history copy binding"),
    { expectedDigest },
  );
}

export function writeProjectHistoryCopyBinding(bindingPath, binding, { overwrite = false } = {}) {
  verifyProjectHistoryCopyBinding(binding);
  const resolved = assertAbsolutePath(bindingPath, "binding output path");
  mkdirSync(path.dirname(resolved), { recursive: true });
  const bytes = Buffer.from(`${canonicalJson(binding)}\n`, "utf8");
  writeFileSync(resolved, bytes, { flag: overwrite ? "w" : "wx", mode: 0o600 });
  return Object.freeze({
    path: resolved,
    binding_digest: binding.binding_digest,
    file_sha256: sha256Bytes(bytes),
    size: bytes.length,
  });
}

export function resolveProjectHistoryCopyArtifactPaths(binding, { projectId, generationId }) {
  verifyProjectHistoryCopyBinding(binding);
  assertExactIdentifier(projectId, "project_id");
  assertExactIdentifier(generationId, "generation_id");
  if (!binding.allowed_project_ids.includes(projectId)) {
    fail("project_not_allowed", "The exact project ID is not authorized by the private binding");
  }
  inspectProjectionRoot(binding.projection_root, binding.projection_root_identity);
  const directory = path.join(
    binding.projection_root,
    artifactPathSegment(projectId, "project"),
    artifactPathSegment(generationId, "generation"),
  );
  return Object.freeze({
    directory,
    csvPath: path.join(directory, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.csv),
    xlsxInputPath: path.join(directory, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_input),
    xlsxPath: path.join(directory, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx),
    xlsxReadbackPath: path.join(directory, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.xlsx_readback),
    artifactManifestPath: path.join(directory, PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES.manifest),
  });
}

export function assertProjectHistoryCopyBindingTarget(binding, {
  bindingDigest,
  dbPath,
  projectId,
  generationId,
  artifactPaths = {},
  requireDatabaseHash = true,
}) {
  verifyProjectHistoryCopyBinding(binding, { expectedDigest: bindingDigest });
  if (!samePath(dbPath, binding.database_path)) {
    fail("database_path_mismatch", "The requested database path differs from the private binding");
  }
  const expectedPaths = resolveProjectHistoryCopyArtifactPaths(binding, { projectId, generationId });
  for (const [key, value] of Object.entries(artifactPaths)) {
    if (!(key in expectedPaths) || typeof value !== "string" || !samePath(value, expectedPaths[key])) {
      fail("projection_root_mismatch", `${key} is outside the exact bound project/generation artifact directory`);
    }
  }
  const database = inspectStandaloneProjectHistoryCopy(binding.database_path, {
    expectedIdentity: binding.database_identity,
    expectedSha256: requireDatabaseHash ? binding.database_sha256 : null,
  });
  return Object.freeze({ binding, database, artifactPaths: expectedPaths });
}

export function artifactRecord(filename, bytes) {
  if (typeof filename !== "string" || filename.length === 0 || path.basename(filename) !== filename) {
    fail("artifact_filename_invalid", "Artifact filename must be one plain basename");
  }
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return Object.freeze({ filename, size: content.length, sha256: sha256Bytes(content) });
}

function artifactManifestBody(value) {
  return Object.fromEntries(ARTIFACT_MANIFEST_BODY_FIELDS.map((field) => [field, value[field]]));
}

export function createProjectHistoryCopyArtifactManifest({
  binding,
  projectId,
  generationId,
  generationDigest,
  databaseBeforeSha256,
  databaseAfterSha256,
  orderedEventDigest,
  orderedRowDigest,
  artifacts,
}) {
  verifyProjectHistoryCopyBinding(binding);
  const body = {
    schema_version: PROJECT_HISTORY_COPY_ARTIFACT_MANIFEST_SCHEMA_VERSION,
    binding_digest: binding.binding_digest,
    project_id: projectId,
    generation_id: generationId,
    generation_digest: generationDigest,
    database_before_sha256: databaseBeforeSha256,
    database_after_sha256: databaseAfterSha256,
    ordered_event_digest: orderedEventDigest,
    ordered_row_digest: orderedRowDigest,
    artifacts,
  };
  const manifest = { ...body, artifact_manifest_digest: sha256Canonical(body) };
  return verifyProjectHistoryCopyArtifactManifest(manifest, { binding });
}

export function verifyProjectHistoryCopyArtifactManifest(
  value,
  { binding, expectedDigest = null } = {},
) {
  assertExactKeys(value, ARTIFACT_MANIFEST_FIELDS, "project-history artifact manifest");
  if (value.schema_version !== PROJECT_HISTORY_COPY_ARTIFACT_MANIFEST_SCHEMA_VERSION) {
    fail("artifact_manifest_schema_invalid", "Unexpected artifact manifest schema version");
  }
  for (const [label, digest] of [
    ["binding_digest", value.binding_digest],
    ["generation_digest", value.generation_digest],
    ["database_before_sha256", value.database_before_sha256],
    ["database_after_sha256", value.database_after_sha256],
    ["ordered_event_digest", value.ordered_event_digest],
    ["ordered_row_digest", value.ordered_row_digest],
    ["artifact_manifest_digest", value.artifact_manifest_digest],
  ]) assertDigest(digest, label);
  assertExactIdentifier(value.project_id, "manifest project_id");
  assertExactIdentifier(value.generation_id, "manifest generation_id");
  assertExactKeys(value.artifacts, ARTIFACT_KEYS, "artifact manifest artifacts");
  for (const key of ARTIFACT_KEYS) {
    const record = value.artifacts[key];
    assertExactKeys(record, ARTIFACT_RECORD_FIELDS, `artifact ${key}`);
    if (record.filename !== PROJECT_HISTORY_COPY_ARTIFACT_FILENAMES[key]
        || !Number.isSafeInteger(record.size) || record.size < 1) {
      fail("artifact_record_invalid", `Artifact ${key} filename or size is invalid`);
    }
    assertDigest(record.sha256, `artifact ${key} sha256`);
  }
  const computed = sha256Canonical(artifactManifestBody(value));
  if (computed !== value.artifact_manifest_digest) {
    fail("artifact_manifest_digest_mismatch", "Artifact manifest digest is invalid");
  }
  if (expectedDigest !== null) {
    assertDigest(expectedDigest, "expected artifact manifest digest");
    if (computed !== expectedDigest) {
      fail("artifact_manifest_digest_mismatch", "Artifact manifest differs from the externally pinned digest");
    }
  }
  if (binding !== undefined) {
    verifyProjectHistoryCopyBinding(binding);
    if (value.binding_digest !== binding.binding_digest
        || value.database_before_sha256 !== binding.database_sha256
        || !binding.allowed_project_ids.includes(value.project_id)) {
      fail("artifact_binding_mismatch", "Artifact manifest does not match the private binding");
    }
  }
  return value;
}

export function readProjectHistoryCopyArtifactManifest(
  manifestPath,
  { binding, expectedDigest = null } = {},
) {
  return verifyProjectHistoryCopyArtifactManifest(
    readStableJsonFile(manifestPath, "project-history artifact manifest"),
    { binding, expectedDigest },
  );
}

function parseArgs(argv) {
  const options = { allowedProjectIds: [] };
  const valueFlags = new Map([
    ["--db", "dbPath"],
    ["--projection-root", "projectionRoot"],
    ["--out", "bindingPath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") options.help = true;
    else if (token === "--project") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail("argument_value_missing", "--project needs a value");
      options.allowedProjectIds.push(value);
      index += 1;
    } else if (valueFlags.has(token)) {
      const key = valueFlags.get(token);
      if (options[key] !== undefined) fail("duplicate_argument", `${token} was supplied twice`);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) fail("argument_value_missing", `${token} needs a value`);
      options[key] = value;
      index += 1;
    } else {
      fail("unknown_argument", `Unknown argument ${token}`);
    }
  }
  return options;
}

function helpText() {
  return [
    "Create one private, exact copied-ERP projection binding.",
    "",
    "Usage:",
    "  node tools/project_history_copy_binding.mjs --db <absolute-copy.sqlite> \\",
    "    --projection-root <absolute-existing-directory> --project <exact-id> [--project <id>] \\",
    "    --out <absolute-private-binding.json>",
    "",
    "The DB must be a direct sidecar-free single-link copy and must not look live/production.",
    "The binding always records enabled=true and accepted_history=false.",
  ].join("\n");
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
      process.exit(0);
    }
    for (const key of ["dbPath", "projectionRoot", "bindingPath"]) {
      if (typeof options[key] !== "string" || options[key].length === 0) {
        fail("argument_required", `${key} is required`);
      }
    }
    if (options.allowedProjectIds.length === 0) fail("argument_required", "At least one --project is required");
    const binding = createProjectHistoryCopyBinding(options);
    const written = writeProjectHistoryCopyBinding(path.resolve(options.bindingPath), binding);
    process.stdout.write(`${JSON.stringify({ ok: true, ...written }, null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "binding_failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exit(1);
  }
}
