// Local, create-only working-data generations. This never activates a collector.
// The shared data lease excludes cooperating writers for the complete capture.
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmdirSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { acquireDataLease, externalDirectory } from "./runtime_paths.mjs";

export const DATA_BACKUP_FORMAT = "sonar-intel-data-backup-v1";
export const RESTORE_COLLECTION_MARKER = "collection-disabled-after-restore";
const COMMIT_FORMAT = "sonar-intel-data-backup-commit-v1";
const ALLOWED = new Set(["intel.db", "intel.jsonl", "analysis.json", "last_run.json", ...["openalex", "semantic_scholar", "epo_ops", "kipris"].map((source) => `budget-${source}.json`)]);
const HASH = /^[a-f0-9]{64}$/;
const MAX_METADATA_BYTES = 64 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code, details = {}) => { throw Object.assign(new Error(code), { code, ...details }); };
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const statOrNull = (file) => { try { return lstatSync(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.nlink === b.nlink && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

function directory(value, required = true) {
  if (typeof value !== "string" || value.includes("\0")) fail("recovery_directory_invalid");
  const dir = externalDirectory(value, { required });
  // lstat also catches dangling links which existsSync treats as absent.
  for (let current = dir; ; current = path.dirname(current)) {
    const info = statOrNull(current);
    if (info && (info.isSymbolicLink() || !info.isDirectory())) fail("recovery_directory_unsafe");
    if (path.dirname(current) === current) break;
  }
  return dir;
}

function disjoint(left, right) {
  const inside = (a, b) => { const rel = path.relative(a, b); return !rel || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
  if (inside(left, right) || inside(right, left)) fail("recovery_directory_overlap");
}

function freshDirectory(value) {
  const dir = directory(value, false);
  if (statOrNull(dir)) fail("recovery_destination_exists");
  if (!statOrNull(path.dirname(dir))?.isDirectory()) fail("recovery_parent_missing");
  return dir;
}

function pinDirectory(dir) {
  const initial = lstatSync(directory(dir));
  return () => {
    const current = lstatSync(directory(dir));
    if (initial.dev !== current.dev || initial.ino !== current.ino) fail("recovery_directory_changed");
  };
}

function regularFile(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("recovery_file_unsafe");
  return info;
}

// Stream hashes/copies: data bytes never enter receipts or error messages.
function inspectFile(file, destination = null, expected = null) {
  const initial = regularFile(file);
  const source = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let output;
  try {
    if (!sameFile(initial, fstatSync(source))) fail("recovery_file_changed");
    if (destination !== null) output = openSync(destination, "wx");
    const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
    let size = 0, count;
    while ((count = readSync(source, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
      size += count;
      if (output !== undefined) {
        let offset = 0;
        while (offset < count) offset += writeSync(output, buffer, offset, count - offset);
      }
    }
    if (!sameFile(initial, fstatSync(source)) || !sameFile(initial, regularFile(file))) fail("recovery_file_changed");
    const result = { size, sha256: hash.digest("hex") };
    if (expected && (expected.size !== size || expected.sha256 !== result.sha256)) fail("recovery_file_digest_mismatch");
    return result;
  } finally {
    if (output !== undefined) closeSync(output);
    closeSync(source);
  }
}

function readMetadata(file) {
  const initial = regularFile(file);
  if (initial.size > MAX_METADATA_BYTES) fail("recovery_metadata_too_large");
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!sameFile(initial, fstatSync(fd))) fail("recovery_file_changed");
    const bytes = readFileSync(fd);
    if (!sameFile(initial, fstatSync(fd)) || !sameFile(initial, regularFile(file))) fail("recovery_file_changed");
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { fail("recovery_metadata_invalid"); }
    return { bytes, value };
  } finally { closeSync(fd); }
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail("recovery_metadata_invalid");
}

function runtimeFile(name) {
  return name === "data-operation.lock" || name === RESTORE_COLLECTION_MARKER || /^intel\.db-(?:wal|shm)$/.test(name)
    || /^analysis\.\d+\.tmp$/.test(name)
    || [...ALLOWED].some((base) => name === `${base}.lock` || name === `${base}.tmp` || new RegExp(`^${base.replaceAll(".", "\\.")}\\.\\d+\\.pending$`).test(name));
}

function sourceInventory(dataDir) {
  const names = readdirSync(directory(dataDir)).sort();
  const included = [], excluded = { rebuildable: 0, runtime: 0 };
  let unknownCount = 0;
  for (const name of names) {
    const info = lstatSync(path.join(dataDir, name));
    if (info.isSymbolicLink()) fail("recovery_file_unsafe");
    if (name === "export" && info.isDirectory()) { excluded.rebuildable += 1; continue; }
    if (ALLOWED.has(name)) { regularFile(path.join(dataDir, name)); included.push(name); }
    else if (runtimeFile(name) && info.isFile() && info.nlink === 1) excluded.runtime += 1;
    else unknownCount += 1;
  }
  // Unknown paths are counted from metadata; their contents are never opened.
  if (unknownCount) fail("recovery_unclassified_entries", { unknownCount });
  const cores = included.filter((name) => name === "intel.db" || name === "intel.jsonl");
  if (cores.length !== 1) fail(cores.length ? "recovery_core_ambiguous" : "recovery_core_missing");
  return { core: cores[0] === "intel.db" ? "sqlite" : "jsonl", excluded,
    files: included.map((name) => ({ path: name, ...inspectFile(path.join(dataDir, name)) })) };
}

function validateManifest(manifest) {
  exactKeys(manifest, ["format", "core", "files", "excluded"]);
  if (manifest.format !== DATA_BACKUP_FORMAT || !["sqlite", "jsonl"].includes(manifest.core)) fail("recovery_metadata_invalid");
  exactKeys(manifest.excluded, ["rebuildable", "runtime"]);
  if (Object.values(manifest.excluded).some((count) => !Number.isSafeInteger(count) || count < 0)) fail("recovery_metadata_invalid");
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > ALLOWED.size) fail("recovery_metadata_invalid");
  const names = [];
  for (const entry of manifest.files) {
    exactKeys(entry, ["path", "size", "sha256"]);
    if (!ALLOWED.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== "string" || !HASH.test(entry.sha256)) fail("recovery_metadata_invalid");
    names.push(entry.path);
  }
  if (new Set(names).size !== names.length || names.join("\0") !== [...names].sort().join("\0")) fail("recovery_metadata_invalid");
  if (names.filter((name) => /^intel\.(?:db|jsonl)$/.test(name)).join() !== (manifest.core === "sqlite" ? "intel.db" : "intel.jsonl")) fail("recovery_core_ambiguous");
  if (!Number.isSafeInteger(manifest.files.reduce((total, file) => total + file.size, 0))) fail("recovery_metadata_invalid");
}

function verifyFiles(dir, files, controls = []) {
  directory(dir);
  const expected = [...files.map((file) => file.path), ...controls].sort();
  if (readdirSync(dir).sort().join("\0") !== expected.join("\0")) fail("recovery_file_set_mismatch");
  for (const file of files) inspectFile(path.join(dir, file.path), null, file);
  for (const control of controls) if (regularFile(path.join(dir, control)).size !== 0) fail("recovery_control_invalid");
}

function verifyGeneration(backupDir, expectedManifestSha256, committed) {
  const root = directory(backupDir), assertRoot = pinDirectory(root);
  const expected = ["data", "manifest.json", ...(committed ? ["COMMITTED.json"] : [])].sort();
  if (readdirSync(root).sort().join("\0") !== expected.join("\0")) fail("recovery_generation_incomplete_or_extra");
  const { bytes, value: manifest } = readMetadata(path.join(root, "manifest.json"));
  const manifestSha256 = digest(bytes);
  if (expectedManifestSha256 !== undefined && (typeof expectedManifestSha256 !== "string" || !HASH.test(expectedManifestSha256) || expectedManifestSha256 !== manifestSha256)) fail("recovery_manifest_digest_mismatch");
  validateManifest(manifest);
  if (committed) {
    const { value: commit } = readMetadata(path.join(root, "COMMITTED.json"));
    exactKeys(commit, ["format", "manifestSha256"]);
    if (commit.format !== COMMIT_FORMAT || commit.manifestSha256 !== manifestSha256) fail("recovery_commit_invalid");
  }
  verifyFiles(path.join(root, "data"), manifest.files);
  assertRoot();
  return { format: DATA_BACKUP_FORMAT, manifestSha256, backend: manifest.core, files: manifest.files,
    fileCount: manifest.files.length, byteCount: manifest.files.reduce((total, file) => total + file.size, 0), excluded: manifest.excluded };
}

export function verifyBackup({ backupDir, expectedManifestSha256 } = {}) {
  return verifyGeneration(backupDir, expectedManifestSha256, true);
}

export async function backupData({ dataDir, backupDir } = {}) {
  const source = directory(dataDir), destination = freshDirectory(backupDir);
  disjoint(source, destination);
  const release = acquireDataLease(source);
  try {
    const assertSource = pinDirectory(source);
    const before = sourceInventory(source);
    mkdirSync(destination); // Exclusive: a pre-existing destination is never overwritten.
    const assertDestination = pinDirectory(destination), data = path.join(destination, "data");
    mkdirSync(data);
    const files = [];
    for (const entry of before.files) {
      assertSource(); assertDestination();
      if (entry.path === "intel.db") {
        // Reuse the existing WAL-aware logical exporter only inside fresh staging.
        const { backupRuntimeDb } = await import("../../dev-erp/tools/runtime_ops.mjs");
        const staging = path.join(destination, ".sqlite-staging");
        mkdirSync(staging);
        const exported = backupRuntimeDb({ dbPath: path.join(source, entry.path), outDir: staging, latestDir: null, tag: "sonar" });
        if (!exported.ok) fail("recovery_sqlite_export_failed");
        const exportedDir = path.dirname(exported.backupPath);
        if (path.dirname(exportedDir) !== staging || path.dirname(exported.manifestPath) !== exportedDir) fail("recovery_sqlite_staging_invalid");
        const copy = inspectFile(exported.backupPath, path.join(data, entry.path), { size: exported.backup_bytes, sha256: exported.sha256 });
        files.push({ path: entry.path, ...copy });
        // Delete only the two known files created by this exporter invocation.
        assertDestination(); directory(exportedDir);
        regularFile(exported.manifestPath); regularFile(exported.backupPath);
        unlinkSync(exported.manifestPath); unlinkSync(exported.backupPath);
        rmdirSync(exportedDir); rmdirSync(staging);
      } else {
        files.push({ path: entry.path, ...inspectFile(path.join(source, entry.path), path.join(data, entry.path), entry) });
      }
    }
    assertSource(); assertDestination();
    if (JSON.stringify(sourceInventory(source).files) !== JSON.stringify(before.files)) fail("recovery_source_changed");
    const manifest = { format: DATA_BACKUP_FORMAT, core: before.core, files, excluded: before.excluded };
    writeFileSync(path.join(destination, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    const verified = verifyGeneration(destination, undefined, false);
    writeFileSync(path.join(destination, "COMMITTED.json"), jsonBytes({ format: COMMIT_FORMAT, manifestSha256: verified.manifestSha256 }), { flag: "wx" });
    return verifyBackup({ backupDir: destination, expectedManifestSha256: verified.manifestSha256 });
  } finally { release(); }
}

export function restoreData({ backupDir, dataDir, expectedManifestSha256 } = {}) {
  const source = directory(backupDir), destination = freshDirectory(dataDir);
  disjoint(source, destination);
  const verified = verifyBackup({ backupDir: source, expectedManifestSha256 });
  const assertSource = pinDirectory(source);
  mkdirSync(destination);
  const assertDestination = pinDirectory(destination);
  // Even an interrupted restore cannot enable collection with an older budget.
  writeFileSync(path.join(destination, RESTORE_COLLECTION_MARKER), "", { flag: "wx" });
  for (const file of verified.files) {
    assertSource(); assertDestination();
    inspectFile(path.join(source, "data", file.path), path.join(destination, file.path), file);
  }
  verifyFiles(destination, verified.files, [RESTORE_COLLECTION_MARKER]);
  verifyBackup({ backupDir: source, expectedManifestSha256: verified.manifestSha256 });
  assertSource(); assertDestination();
  return { ...verified, collection_disabled: true, budget_reconciliation_required: verified.files.some((file) => file.path.startsWith("budget-")),
    restore_control: RESTORE_COLLECTION_MARKER };
}
