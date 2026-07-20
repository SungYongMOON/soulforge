import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse as parsePath,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const INGRESS_RECOVERY_MANIFEST_SCHEMA = "soulforge.ingress.recovery_manifest.v1";
export const INGRESS_RECOVERY_COMMIT_SCHEMA = "soulforge.ingress.recovery_commit.v1";
export const INGRESS_RECOVERY_CUSTODY_SCHEMA = "soulforge.ingress.recovery_custody.v1";
export const INGRESS_RECOVERY_RESULT_SCHEMA = "soulforge.ingress.recovery_result.v1";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_CUSTODY_JSON_BYTES = 16 * 1024 * 1024;
const MANIFEST_FILE = "manifest.json";
const COMMIT_FILE = "COMMITTED.json";
const RECOVERY_META_ROOT = ".ingress-recovery";
const ACTIVE_LOCK = /(?:^|\/)active\.lock(?:\.json)?$/iu;
const PARTIAL_FILE = /(?:^|\/)[^/]*\.partial-[^/]+$/iu;
const SQLITE_FILE = /(?:\.sqlite3?|\.db)(?:-(?:wal|shm|journal))?$/iu;
const PRIOR_BACKUP_ROOT = /^backups(?:\/|$)/iu;
const SECRET_TOKEN = /(?:^|[._-])(?:secret|secrets|token|tokens|password|passwords|passwd|credential|credentials|cookie|cookies|private[-_]?key|api[-_]?key)(?:[._-]|$)/iu;
const SECRET_SESSION_FILE = /\.session$/iu;
const SECRET_EXACT = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
]);
const SECRET_DIRECTORIES = new Set([".ssh", ".gnupg", ".aws", ".azure", ".kube"]);

export class IngressRecoveryError extends Error {
  constructor(code) {
    super(code);
    this.name = "IngressRecoveryError";
    this.code = code;
  }
}

function fail(code) {
  throw new IngressRecoveryError(code);
}

function canonicalPath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function inside(root, candidate) {
  const base = canonicalPath(root);
  const target = canonicalPath(candidate);
  return target === base || target.startsWith(`${base}${sep}`);
}

function overlaps(left, right) {
  return inside(left, right) || inside(right, left);
}

function requireAbsolutePath(value, code) {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) fail(code);
  const absolute = resolve(value);
  if (canonicalPath(absolute) === canonicalPath(parsePath(absolute).root)) fail(code);
  return absolute;
}

function requireSafeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

function requireDigest(value, code) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(code);
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function pathIdentityDigest(value) {
  return createHash("sha256")
    .update("soulforge.ingress.recovery.source_identity.v1\0", "utf8")
    .update(canonicalPath(value), "utf8")
    .digest("hex");
}

function statsMatch(left, right) {
  return Boolean(left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs);
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoLinkAncestors(path, code) {
  const absolute = resolve(path);
  const parsed = parsePath(absolute);
  let current = parsed.root;
  const segments = absolute.slice(parsed.root.length).split(/[\\/]+/u).filter(Boolean);
  for (const segment of segments) {
    current = join(current, segment);
    if (!(await pathExists(current))) return;
    const info = await lstat(current);
    if (info.isSymbolicLink()) fail(code);
  }
}

async function assertPlainDirectory(path, code) {
  await assertNoLinkAncestors(path, code);
  let info;
  let physical;
  try {
    info = await lstat(path, { bigint: true });
    physical = await realpath(path);
  } catch {
    fail(code);
  }
  if (!info.isDirectory() || info.isSymbolicLink() || canonicalPath(physical) !== canonicalPath(path)) fail(code);
  return { lexical: resolve(path), physical: resolve(physical), info };
}

async function assertPlainFile(path, root, code) {
  let info;
  let physical;
  try {
    info = await lstat(path, { bigint: true });
    physical = await realpath(path);
  } catch {
    fail(code);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail(code);
  if (canonicalPath(physical) !== canonicalPath(path) || (root && !inside(root, physical))) fail(code);
  if (info.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("recovery_file_too_large");
  return { lexical: resolve(path), physical: resolve(physical), info };
}

async function ensureDirectory(root, target) {
  const base = resolve(root);
  const destination = resolve(target);
  if (!inside(base, destination)) fail("recovery_destination_path_escape");
  await assertPlainDirectory(base, "recovery_destination_root_unsafe");
  let current = base;
  for (const segment of relative(base, destination).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    if (!(await pathExists(current))) {
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== "EEXIST") fail("recovery_destination_create_failed");
      }
    }
    await assertPlainDirectory(current, "recovery_destination_directory_unsafe");
  }
}

async function hashVerifiedFile(path, root, { captureBytes = false, code = "recovery_source_file_unsafe" } = {}) {
  const inspected = await assertPlainFile(path, root, code);
  let handle;
  const hash = createHash("sha256");
  const chunks = captureBytes ? [] : null;
  let total = 0;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !statsMatch(inspected.info, opened)) fail(code);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
      if (chunks) {
        if (total > MAX_CUSTODY_JSON_BYTES) fail("recovery_custody_record_too_large");
        chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      }
    }
    if (BigInt(total) !== opened.size) fail(code);
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail(code);
  } finally {
    try { await handle?.close(); } catch { /* sanitized failure path */ }
  }
  const after = await assertPlainFile(path, root, code);
  if (!statsMatch(inspected.info, after.info) || canonicalPath(after.physical) !== canonicalPath(inspected.physical)) fail(code);
  return {
    size: total,
    sha256: hash.digest("hex"),
    bytes: chunks ? Buffer.concat(chunks, total) : null,
  };
}

async function copyVerifiedFile(sourcePath, sourceRoot, destinationPath, expected) {
  const inspected = await assertPlainFile(sourcePath, sourceRoot, "recovery_source_file_unsafe");
  let source;
  let destination;
  const hash = createHash("sha256");
  let total = 0;
  try {
    source = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await source.stat({ bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !statsMatch(inspected.info, opened)) {
      fail("recovery_source_file_changed");
    }
    destination = await open(
      destinationPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      total += bytesRead;
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await destination.write(buffer, offset, bytesRead - offset, null);
        if (bytesWritten <= 0) fail("recovery_destination_write_failed");
        offset += bytesWritten;
      }
    }
    await destination.sync();
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail(error?.code === "EEXIST" ? "recovery_destination_collision" : "recovery_file_copy_failed");
  } finally {
    try { await source?.close(); } catch { /* sanitized failure path */ }
    try { await destination?.close(); } catch { /* sanitized failure path */ }
  }
  const digest = hash.digest("hex");
  if (total !== expected.size || digest !== expected.sha256) fail("recovery_source_file_changed");
  const after = await assertPlainFile(sourcePath, sourceRoot, "recovery_source_file_unsafe");
  if (!statsMatch(inspected.info, after.info) || canonicalPath(after.physical) !== canonicalPath(inspected.physical)) {
    fail("recovery_source_file_changed");
  }
}

async function writeExclusiveBytes(path, bytes) {
  let handle;
  try {
    handle = await open(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail(error?.code === "EEXIST" ? "recovery_destination_collision" : "recovery_destination_write_failed");
  } finally {
    try { await handle?.close(); } catch { /* sanitized failure path */ }
  }
}

function isSecretLikeRef(ref) {
  const segments = ref.split("/");
  return segments.some((segment) => {
    const lower = segment.toLowerCase();
    return SECRET_EXACT.has(lower)
      || SECRET_DIRECTORIES.has(lower)
      || lower.startsWith(".env.")
      || /\.(?:pem|key|p12|pfx)$/iu.test(lower)
      || SECRET_SESSION_FILE.test(lower)
      || SECRET_TOKEN.test(lower);
  });
}

function isCheckpointRef(ref) {
  return /(?:^|\/)checkpoints?(?:\/|$)/iu.test(ref) || /(?:^|\/)[^/]*checkpoint[^/]*\.json$/iu.test(ref);
}

function isCustodyJsonRef(ref) {
  return ref.startsWith("state/leases/continuous_ingress/")
    || ref.startsWith("state/receipts/continuous_ingress/")
    || isCheckpointRef(ref);
}

function epochValues(value, key = "") {
  const values = [];
  if (Array.isArray(value)) {
    for (const item of value) values.push(...epochValues(item));
    return values;
  }
  if (!value || typeof value !== "object") return values;
  for (const [childKey, child] of Object.entries(value)) {
    if (/^(?:lease_epoch|custody_epoch|last_epoch)$/u.test(childKey)) {
      if (!Number.isSafeInteger(child) || child < 0) fail("recovery_custody_epoch_invalid");
      values.push(child);
    } else if (child && typeof child === "object") {
      values.push(...epochValues(child, childKey));
    }
  }
  return values;
}

function safeRelativeRef(value, code) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")) fail(code);
  if (posix.isAbsolute(value) || posix.normalize(value) !== value || value === ".." || value.startsWith("../")) fail(code);
  return value;
}

function sqliteRuntimePaths(path) {
  return new Set([path, `${path}-wal`, `${path}-shm`, `${path}-journal`].map(canonicalPath));
}

async function inspectSqliteSource(sqlitePath) {
  if (sqlitePath === null || sqlitePath === undefined) return null;
  const path = requireAbsolutePath(sqlitePath, "recovery_sqlite_path_absolute_required");
  if (isSecretLikeRef(basename(path))) fail("recovery_sqlite_secret_like_name_forbidden");
  await assertNoLinkAncestors(path, "recovery_sqlite_path_unsafe");
  const parent = await assertPlainDirectory(dirname(path), "recovery_sqlite_parent_unsafe");
  const main = await hashVerifiedFile(path, parent.physical, { code: "recovery_sqlite_source_unsafe" });
  const runtime = [];
  for (const suffix of ["-wal", "-journal"]) {
    const sidecar = `${path}${suffix}`;
    if (!(await pathExists(sidecar))) continue;
    const item = await hashVerifiedFile(sidecar, parent.physical, { code: "recovery_sqlite_sidecar_unsafe" });
    runtime.push({ suffix, size: item.size, sha256: item.sha256 });
  }
  runtime.sort((left, right) => left.suffix.localeCompare(right.suffix));
  let db;
  try {
    // SQLite may create WAL/SHM sidecars even for SQLITE_OPEN_READONLY. The
    // immutable URI keeps planning observational; apply performs the actual
    // WAL-aware VACUUM snapshot.
    db = new DatabaseSync(immutableSqliteLocation(path), { readOnly: true });
    db.exec("PRAGMA query_only=ON");
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") fail("recovery_sqlite_quick_check_failed");
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail("recovery_sqlite_open_failed");
  } finally {
    try { db?.close(); } catch { /* sanitized failure path */ }
  }
  return {
    path,
    identity_digest: pathIdentityDigest(path),
    main: { size: main.size, sha256: main.sha256 },
    runtime,
  };
}

async function scanSourcePlane(sourceRoot, sqlitePath = null) {
  const pinned = await assertPlainDirectory(sourceRoot, "recovery_source_root_unsafe");
  const database = await inspectSqliteSource(sqlitePath);
  const sqlitePaths = database ? sqliteRuntimePaths(database.path) : new Set();
  const inventory = [];
  const exclusions = {
    active_lock_files: 0,
    ephemeral_files: 0,
    secret_like_entries: 0,
    sqlite_runtime_files: 0,
    prior_backup_roots: 0,
  };
  let maxObservedEpoch = 0;

  async function walk(directory, prefix = "") {
    await assertPlainDirectory(directory, "recovery_source_directory_unsafe");
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      fail("recovery_source_directory_read_failed");
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const ref = prefix ? `${prefix}/${entry.name}` : entry.name;
      safeRelativeRef(ref, "recovery_source_ref_invalid");
      const path = resolve(directory, entry.name);
      if (!inside(pinned.physical, path)) fail("recovery_source_path_escape");
      const info = await lstat(path, { bigint: true });
      if (info.isSymbolicLink()) fail("recovery_source_link_forbidden");
      const physical = await realpath(path);
      if (canonicalPath(physical) !== canonicalPath(path) || !inside(pinned.physical, physical)) {
        fail("recovery_source_reparse_or_escape");
      }
      if (ref === RECOVERY_META_ROOT || ref.startsWith(`${RECOVERY_META_ROOT}/`)) {
        fail("recovery_reserved_path_conflict");
      }
      // A new recovery generation is self-contained. Recursively copying older
      // backup generations would duplicate archives and can also encounter
      // inactive SQLite/WAL sets that are not the declared live database.
      if (PRIOR_BACKUP_ROOT.test(ref)) {
        if (ref === "backups") exclusions.prior_backup_roots += 1;
        continue;
      }
      if (isSecretLikeRef(ref)) {
        exclusions.secret_like_entries += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(path, ref);
        continue;
      }
      if (!entry.isFile() || info.nlink !== 1n) fail("recovery_source_special_file_forbidden");
      if (ACTIVE_LOCK.test(ref)) {
        exclusions.active_lock_files += 1;
        continue;
      }
      if (PARTIAL_FILE.test(ref)) {
        exclusions.ephemeral_files += 1;
        continue;
      }
      if (sqlitePaths.has(canonicalPath(path))) {
        exclusions.sqlite_runtime_files += 1;
        continue;
      }
      if (SQLITE_FILE.test(entry.name)) fail("recovery_sqlite_must_be_declared");
      const captureBytes = isCustodyJsonRef(ref);
      const hashed = await hashVerifiedFile(path, pinned.physical, {
        captureBytes,
        code: "recovery_source_file_unsafe",
      });
      if (captureBytes) {
        let document;
        try {
          document = JSON.parse(hashed.bytes.toString("utf8"));
        } catch {
          fail("recovery_custody_record_invalid");
        }
        for (const epoch of epochValues(document)) maxObservedEpoch = Math.max(maxObservedEpoch, epoch);
      }
      inventory.push({
        kind: "source_file",
        restore_ref: ref,
        object_ref: `objects/sha256/${hashed.sha256.slice(0, 2)}/${hashed.sha256}`,
        size: hashed.size,
        sha256: hashed.sha256,
      });
    }
  }

  await walk(pinned.physical);
  inventory.sort((left, right) => left.restore_ref.localeCompare(right.restore_ref));
  const checkpoints = inventory
    .filter((item) => isCheckpointRef(item.restore_ref))
    .map(({ restore_ref, size, sha256 }) => ({ restore_ref, size, sha256 }));
  const checkpointInventoryDigest = sha256Bytes(stableJson(checkpoints));
  const sourceDigest = sha256Bytes(stableJson({
    inventory: inventory.map(({ restore_ref, size, sha256 }) => ({ restore_ref, size, sha256 })),
    database: database ? {
      identity_digest: database.identity_digest,
      main: database.main,
      runtime: database.runtime,
    } : null,
    custody: {
      max_observed_epoch: maxObservedEpoch,
      checkpoint_count: checkpoints.length,
      checkpoint_inventory_digest: checkpointInventoryDigest,
    },
  }));
  return {
    sourceRoot: pinned.physical,
    sourceIdentityDigest: pathIdentityDigest(pinned.physical),
    sourceDigest,
    inventory,
    exclusions,
    database,
    custody: {
      max_observed_epoch: maxObservedEpoch,
      checkpoint_count: checkpoints.length,
      checkpoint_inventory_digest: checkpointInventoryDigest,
    },
  };
}

function assertApplyAuthorization(options, plan) {
  requireDigest(options.expectedSourceIdentity, "recovery_expected_source_identity_required");
  requireDigest(options.expectedSourceDigest, "recovery_expected_source_digest_required");
  requireSafeId(options.approvalRef, "recovery_approval_ref_required");
  if (options.expectedSourceIdentity !== plan.sourceIdentityDigest) fail("recovery_source_identity_mismatch");
  if (options.expectedSourceDigest !== plan.sourceDigest) fail("recovery_source_digest_mismatch");
}

function dryRunResult(plan) {
  return {
    schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
    ok: true,
    operation: "snapshot",
    status: "dry_run_no_write",
    source_identity_digest: plan.sourceIdentityDigest,
    source_digest: plan.sourceDigest,
    file_count: plan.inventory.length,
    byte_count: plan.inventory.reduce((sum, item) => sum + item.size, 0),
    database_declared: Boolean(plan.database),
    max_observed_custody_epoch: plan.custody.max_observed_epoch,
    checkpoint_count: plan.custody.checkpoint_count,
    exclusions: plan.exclusions,
    writes_performed: 0,
    source_deleted: false,
    source_overwritten: false,
  };
}

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function immutableSqliteLocation(path) {
  const location = pathToFileURL(path);
  location.searchParams.set("immutable", "1");
  return location;
}

async function quickCheckDatabase(path, code) {
  let db;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA query_only=ON");
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") fail(code);
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail(code);
  } finally {
    try { db?.close(); } catch { /* sanitized failure path */ }
  }
}

async function snapshotDatabase(database, generationRoot) {
  const temporary = resolve(generationRoot, `sqlite-${randomUUID()}.partial`);
  let db;
  try {
    // A database with no runtime journal can be opened immutable so even apply
    // does not manufacture source sidecars. A declared live WAL/journal needs
    // SQLite's normal read-only locking so VACUUM INTO sees committed runtime
    // state rather than ignoring it.
    const sourceLocation = database.runtime.length === 0
      ? immutableSqliteLocation(database.path)
      : database.path;
    db = new DatabaseSync(sourceLocation, { readOnly: true });
    db.exec("PRAGMA busy_timeout=10000");
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok") {
      fail("recovery_sqlite_quick_check_failed");
    }
    const beforeVersion = db.prepare("PRAGMA data_version").get()?.data_version;
    db.exec(`VACUUM INTO '${sqlString(temporary)}'`);
    const afterVersion = db.prepare("PRAGMA data_version").get()?.data_version;
    if (beforeVersion !== afterVersion) fail("recovery_sqlite_changed_during_snapshot");
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail("recovery_sqlite_snapshot_failed");
  } finally {
    try { db?.close(); } catch { /* sanitized failure path */ }
  }
  try {
    await quickCheckDatabase(temporary, "recovery_sqlite_snapshot_invalid");
    const root = await assertPlainDirectory(generationRoot, "recovery_generation_unsafe");
    const hashed = await hashVerifiedFile(temporary, root.physical, { code: "recovery_sqlite_snapshot_invalid" });
    const objectRef = `database/sha256/${hashed.sha256.slice(0, 2)}/${hashed.sha256}.sqlite3`;
    const objectPath = resolve(generationRoot, ...objectRef.split("/"));
    await ensureDirectory(generationRoot, dirname(objectPath));
    if (await pathExists(objectPath)) fail("recovery_destination_collision");
    await rename(temporary, objectPath);
    return {
      kind: "sqlite_vacuum_snapshot",
      restore_ref: `${RECOVERY_META_ROOT}/sqlite/database.sqlite3`,
      object_ref: objectRef,
      size: hashed.size,
      sha256: hashed.sha256,
      quick_check: "ok",
    };
  } finally {
    await rm(temporary, { force: true });
  }
}

async function copyInventoryObjects(plan, generationRoot) {
  let writes = 0;
  for (const item of plan.inventory) {
    const sourcePath = resolve(plan.sourceRoot, ...item.restore_ref.split("/"));
    const objectPath = resolve(generationRoot, ...item.object_ref.split("/"));
    if (!inside(generationRoot, objectPath)) fail("recovery_object_path_escape");
    await ensureDirectory(generationRoot, dirname(objectPath));
    if (await pathExists(objectPath)) {
      const verified = await hashVerifiedFile(objectPath, generationRoot, { code: "recovery_object_collision" });
      if (verified.size !== item.size || verified.sha256 !== item.sha256) fail("recovery_object_collision");
      continue;
    }
    await copyVerifiedFile(sourcePath, plan.sourceRoot, objectPath, item);
    writes += 1;
  }
  return writes;
}

function custodyObject(plan) {
  const payload = Buffer.from(`${JSON.stringify({
    schema_version: INGRESS_RECOVERY_CUSTODY_SCHEMA,
    max_observed_custody_epoch: plan.custody.max_observed_epoch,
    checkpoint_count: plan.custody.checkpoint_count,
    checkpoint_inventory_digest: plan.custody.checkpoint_inventory_digest,
  }, null, 2)}\n`, "utf8");
  const digest = sha256Bytes(payload);
  return {
    payload,
    entry: {
      kind: "custody_checkpoint",
      restore_ref: `${RECOVERY_META_ROOT}/custody_checkpoint.json`,
      object_ref: `recovery/sha256/${digest.slice(0, 2)}/${digest}.json`,
      size: payload.length,
      sha256: digest,
    },
  };
}

async function writeCustodyObject(plan, generationRoot) {
  const object = custodyObject(plan);
  const path = resolve(generationRoot, ...object.entry.object_ref.split("/"));
  await ensureDirectory(generationRoot, dirname(path));
  await writeExclusiveBytes(path, object.payload);
  return object.entry;
}

function generationId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
  return `igr_${stamp}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function manifestDocument({ id, approvalRef, now, plan, custody, database }) {
  return {
    schema_version: INGRESS_RECOVERY_MANIFEST_SCHEMA,
    generation_id: id,
    created_at: now.toISOString(),
    approval_ref: approvalRef,
    source_identity_digest: plan.sourceIdentityDigest,
    source_digest: plan.sourceDigest,
    inventory: plan.inventory,
    database_snapshot: database,
    custody: {
      max_observed_epoch: plan.custody.max_observed_epoch,
      checkpoint_count: plan.custody.checkpoint_count,
      checkpoint_inventory_digest: plan.custody.checkpoint_inventory_digest,
      object: custody,
    },
    exclusions: plan.exclusions,
    source_deleted: false,
    source_overwritten: false,
    live_root_overwritten: false,
  };
}

export async function planIngressRecoverySnapshot(options = {}) {
  const sourceRoot = requireAbsolutePath(options.sourceRoot, "recovery_source_root_absolute_required");
  const backupRoot = requireAbsolutePath(options.backupRoot, "recovery_backup_root_absolute_required");
  await assertPlainDirectory(sourceRoot, "recovery_source_root_unsafe");
  await assertPlainDirectory(backupRoot, "recovery_backup_root_unsafe");
  if (overlaps(sourceRoot, backupRoot)) fail("recovery_source_backup_overlap");
  if (options.sqlitePath) {
    const sqlitePath = requireAbsolutePath(options.sqlitePath, "recovery_sqlite_path_absolute_required");
    if (inside(backupRoot, sqlitePath) || inside(sqlitePath, backupRoot)) fail("recovery_sqlite_backup_overlap");
  }
  return scanSourcePlane(sourceRoot, options.sqlitePath ?? null);
}

async function cleanupOwnedSnapshotStaging(generationsRoot, staging) {
  if (!staging || !inside(generationsRoot, staging.path)) fail("recovery_snapshot_cleanup_unsafe");
  const info = await lstat(staging.path, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return;
  let physical;
  try { physical = await realpath(staging.path); } catch { fail("recovery_snapshot_cleanup_unsafe"); }
  if (!info.isDirectory()
    || info.isSymbolicLink()
    || canonicalPath(physical) !== canonicalPath(staging.path)
    || !sameDirectoryIdentity(info, staging.identity)) fail("recovery_snapshot_cleanup_unsafe");
  await rm(staging.path, { recursive: true, force: true });
}

export async function createIngressRecoverySnapshot(options = {}) {
  const plan = await planIngressRecoverySnapshot(options);
  if (options.apply !== true) return dryRunResult(plan);
  assertApplyAuthorization(options, plan);

  const backupRoot = requireAbsolutePath(options.backupRoot, "recovery_backup_root_absolute_required");
  const id = options.generationId === undefined
    ? generationId(options.now instanceof Date ? options.now : new Date())
    : requireSafeId(options.generationId, "recovery_generation_id_invalid");
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isFinite(now.getTime())) fail("recovery_time_invalid");
  const generationsRoot = resolve(backupRoot, "generations");
  await ensureDirectory(backupRoot, generationsRoot);
  const finalRoot = resolve(generationsRoot, id);
  const partialRoot = resolve(generationsRoot, `.partial-${id}-${randomUUID()}`);
  if (!inside(generationsRoot, finalRoot) || !inside(generationsRoot, partialRoot)) fail("recovery_generation_path_escape");
  if (await pathExists(finalRoot)) fail("recovery_generation_collision");
  let staging = null;
  try {
    await mkdir(partialRoot, { mode: 0o700 });
    const inspected = await assertPlainDirectory(partialRoot, "recovery_generation_unsafe");
    staging = { path: inspected.physical, identity: inspected.info };
    if (typeof options.testHooks?.afterSnapshotStagingCreated === "function") {
      await options.testHooks.afterSnapshotStagingCreated({ path: staging.path });
    }
    const objectWrites = await copyInventoryObjects(plan, staging.path);
    const custody = await writeCustodyObject(plan, staging.path);
    const databaseSnapshot = plan.database ? await snapshotDatabase(plan.database, staging.path) : null;

    const after = await scanSourcePlane(plan.sourceRoot, plan.database?.path ?? null);
    if (after.sourceIdentityDigest !== plan.sourceIdentityDigest || after.sourceDigest !== plan.sourceDigest) {
      fail("recovery_source_changed_during_snapshot");
    }
    const manifest = manifestDocument({
      id,
      approvalRef: options.approvalRef,
      now,
      plan,
      custody,
      database: databaseSnapshot,
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const manifestSha256 = sha256Bytes(manifestBytes);
    await writeExclusiveBytes(resolve(staging.path, MANIFEST_FILE), manifestBytes);
    const commitBytes = Buffer.from(`${JSON.stringify({
      schema_version: INGRESS_RECOVERY_COMMIT_SCHEMA,
      generation_id: id,
      manifest_sha256: manifestSha256,
    }, null, 2)}\n`, "utf8");
    await writeExclusiveBytes(resolve(staging.path, COMMIT_FILE), commitBytes);
    if (await pathExists(finalRoot)) fail("recovery_generation_collision");
    await rename(staging.path, finalRoot);
    await assertPlainDirectory(finalRoot, "recovery_generation_unsafe");
    return {
      schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
      ok: true,
      operation: "snapshot",
      status: "snapshot_created",
      generation_id: id,
      manifest_sha256: manifestSha256,
      source_identity_digest: plan.sourceIdentityDigest,
      source_digest: plan.sourceDigest,
      file_count: plan.inventory.length,
      byte_count: plan.inventory.reduce((sum, item) => sum + item.size, 0),
      database_included: Boolean(databaseSnapshot),
      max_observed_custody_epoch: plan.custody.max_observed_epoch,
      checkpoint_count: plan.custody.checkpoint_count,
      exclusions: plan.exclusions,
      writes_performed: objectWrites + 3 + Number(Boolean(databaseSnapshot)),
      source_deleted: false,
      source_overwritten: false,
    };
  } catch (error) {
    if (staging) await cleanupOwnedSnapshotStaging(generationsRoot, staging);
    throw error;
  }
}

function exactKeys(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function validateInventoryEntry(value, expectedKind = null) {
  exactKeys(value, ["kind", "restore_ref", "object_ref", "size", "sha256"], "recovery_manifest_inventory_invalid");
  if (expectedKind && value.kind !== expectedKind) fail("recovery_manifest_inventory_invalid");
  if (!new Set(["source_file", "custody_checkpoint"]).has(value.kind)) fail("recovery_manifest_inventory_invalid");
  safeRelativeRef(value.restore_ref, "recovery_manifest_restore_ref_invalid");
  safeRelativeRef(value.object_ref, "recovery_manifest_object_ref_invalid");
  if (!Number.isSafeInteger(value.size) || value.size < 0 || !SHA256.test(value.sha256)) {
    fail("recovery_manifest_inventory_invalid");
  }
  const expectedObject = value.kind === "source_file"
    ? `objects/sha256/${value.sha256.slice(0, 2)}/${value.sha256}`
    : `recovery/sha256/${value.sha256.slice(0, 2)}/${value.sha256}.json`;
  if (value.object_ref !== expectedObject) fail("recovery_manifest_object_ref_invalid");
  if (value.kind === "source_file" && (isSecretLikeRef(value.restore_ref) || ACTIVE_LOCK.test(value.restore_ref))) {
    fail("recovery_manifest_forbidden_file");
  }
  if (value.kind === "source_file"
    && (value.restore_ref === RECOVERY_META_ROOT || value.restore_ref.startsWith(`${RECOVERY_META_ROOT}/`))) {
    fail("recovery_manifest_forbidden_file");
  }
  return value;
}

function validateDatabaseEntry(value) {
  if (value === null) return null;
  exactKeys(value, ["kind", "restore_ref", "object_ref", "size", "sha256", "quick_check"], "recovery_manifest_database_invalid");
  if (value.kind !== "sqlite_vacuum_snapshot"
    || value.restore_ref !== `${RECOVERY_META_ROOT}/sqlite/database.sqlite3`
    || value.quick_check !== "ok"
    || !Number.isSafeInteger(value.size)
    || value.size < 1
    || !SHA256.test(value.sha256)
    || value.object_ref !== `database/sha256/${value.sha256.slice(0, 2)}/${value.sha256}.sqlite3`) {
    fail("recovery_manifest_database_invalid");
  }
  return value;
}

function validateManifest(document, generation) {
  exactKeys(document, [
    "schema_version",
    "generation_id",
    "created_at",
    "approval_ref",
    "source_identity_digest",
    "source_digest",
    "inventory",
    "database_snapshot",
    "custody",
    "exclusions",
    "source_deleted",
    "source_overwritten",
    "live_root_overwritten",
  ], "recovery_manifest_invalid");
  if (document.schema_version !== INGRESS_RECOVERY_MANIFEST_SCHEMA
    || document.generation_id !== generation
    || !Number.isFinite(Date.parse(document.created_at))
    || !SAFE_ID.test(document.approval_ref)
    || !SHA256.test(document.source_identity_digest)
    || !SHA256.test(document.source_digest)
    || document.source_deleted !== false
    || document.source_overwritten !== false
    || document.live_root_overwritten !== false
    || !Array.isArray(document.inventory)) fail("recovery_manifest_invalid");
  const refs = new Set();
  let previous = null;
  for (const entry of document.inventory) {
    validateInventoryEntry(entry, "source_file");
    if (refs.has(entry.restore_ref) || (previous !== null && previous.localeCompare(entry.restore_ref) >= 0)) {
      fail("recovery_manifest_inventory_invalid");
    }
    refs.add(entry.restore_ref);
    previous = entry.restore_ref;
  }
  const database = validateDatabaseEntry(document.database_snapshot);
  exactKeys(document.custody, [
    "max_observed_epoch",
    "checkpoint_count",
    "checkpoint_inventory_digest",
    "object",
  ], "recovery_manifest_custody_invalid");
  if (!Number.isSafeInteger(document.custody.max_observed_epoch)
    || document.custody.max_observed_epoch < 0
    || !Number.isSafeInteger(document.custody.checkpoint_count)
    || document.custody.checkpoint_count < 0
    || !SHA256.test(document.custody.checkpoint_inventory_digest)) fail("recovery_manifest_custody_invalid");
  const custody = validateInventoryEntry(document.custody.object, "custody_checkpoint");
  if (custody.restore_ref !== `${RECOVERY_META_ROOT}/custody_checkpoint.json`) fail("recovery_manifest_custody_invalid");
  if (refs.has(custody.restore_ref) || (database && refs.has(database.restore_ref))) fail("recovery_manifest_restore_ref_collision");
  exactKeys(document.exclusions, [
    "active_lock_files",
    "ephemeral_files",
    "prior_backup_roots",
    "secret_like_entries",
    "sqlite_runtime_files",
  ], "recovery_manifest_exclusions_invalid");
  if (Object.values(document.exclusions).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    fail("recovery_manifest_exclusions_invalid");
  }
  const checkpoints = document.inventory
    .filter((item) => isCheckpointRef(item.restore_ref))
    .map(({ restore_ref, size, sha256 }) => ({ restore_ref, size, sha256 }));
  if (checkpoints.length !== document.custody.checkpoint_count
    || sha256Bytes(stableJson(checkpoints)) !== document.custody.checkpoint_inventory_digest) {
    fail("recovery_manifest_custody_invalid");
  }
  return { document, custody, database };
}

async function loadGeneration(backupRoot, generation) {
  const root = await assertPlainDirectory(backupRoot, "recovery_backup_root_unsafe");
  const id = requireSafeId(generation, "recovery_generation_id_invalid");
  const generationRoot = resolve(root.physical, "generations", id);
  if (!inside(root.physical, generationRoot)) fail("recovery_generation_path_escape");
  await assertPlainDirectory(generationRoot, "recovery_generation_unsafe");
  const manifestPath = resolve(generationRoot, MANIFEST_FILE);
  const commitPath = resolve(generationRoot, COMMIT_FILE);
  const manifestFile = await hashVerifiedFile(manifestPath, generationRoot, {
    captureBytes: true,
    code: "recovery_manifest_unsafe",
  });
  let document;
  let commit;
  try {
    document = JSON.parse(manifestFile.bytes.toString("utf8"));
    const commitFile = await hashVerifiedFile(commitPath, generationRoot, {
      captureBytes: true,
      code: "recovery_commit_unsafe",
    });
    commit = JSON.parse(commitFile.bytes.toString("utf8"));
  } catch {
    fail("recovery_manifest_invalid");
  }
  exactKeys(commit, ["schema_version", "generation_id", "manifest_sha256"], "recovery_commit_invalid");
  if (commit.schema_version !== INGRESS_RECOVERY_COMMIT_SCHEMA
    || commit.generation_id !== id
    || commit.manifest_sha256 !== manifestFile.sha256) fail("recovery_commit_invalid");
  const validated = validateManifest(document, id);
  return {
    root: generationRoot,
    id,
    manifestSha256: manifestFile.sha256,
    ...validated,
  };
}

async function verifyGenerationObjects(generation) {
  const entries = [
    ...generation.document.inventory,
    generation.custody,
    ...(generation.database ? [generation.database] : []),
  ];
  for (const entry of entries) {
    const objectPath = resolve(generation.root, ...entry.object_ref.split("/"));
    if (!inside(generation.root, objectPath)) fail("recovery_manifest_object_ref_invalid");
    const hashed = await hashVerifiedFile(objectPath, generation.root, { code: "recovery_backup_object_unsafe" });
    if (hashed.size !== entry.size || hashed.sha256 !== entry.sha256) fail("recovery_backup_object_hash_mismatch");
    if (entry.kind === "sqlite_vacuum_snapshot") {
      await quickCheckDatabase(objectPath, "recovery_sqlite_snapshot_invalid");
    }
    if (entry.kind === "custody_checkpoint") {
      const checked = await hashVerifiedFile(objectPath, generation.root, {
        captureBytes: true,
        code: "recovery_backup_object_unsafe",
      });
      let document;
      try { document = JSON.parse(checked.bytes.toString("utf8")); } catch { fail("recovery_custody_object_invalid"); }
      exactKeys(document, [
        "schema_version",
        "max_observed_custody_epoch",
        "checkpoint_count",
        "checkpoint_inventory_digest",
      ], "recovery_custody_object_invalid");
      if (document.schema_version !== INGRESS_RECOVERY_CUSTODY_SCHEMA
        || document.max_observed_custody_epoch !== generation.document.custody.max_observed_epoch
        || document.checkpoint_count !== generation.document.custody.checkpoint_count
        || document.checkpoint_inventory_digest !== generation.document.custody.checkpoint_inventory_digest) {
        fail("recovery_custody_object_invalid");
      }
    }
  }
  return entries;
}

async function assertEmptyRestoreRoot(path) {
  const root = await assertPlainDirectory(path, "recovery_restore_root_unsafe");
  const entries = await readdir(root.physical);
  if (entries.length !== 0) fail("recovery_restore_root_not_empty");
  return root;
}

function sameDirectoryIdentity(left, right) {
  return Boolean(left && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.birthtimeNs === right.birthtimeNs);
}

async function createRestoreStaging(restoreRoot) {
  const name = `.partial-ingress-restore-${randomUUID()}`;
  const path = resolve(restoreRoot, name);
  if (!inside(restoreRoot, path)) fail("recovery_restore_path_escape");
  try {
    await mkdir(path, { mode: 0o700 });
  } catch {
    fail("recovery_restore_staging_create_failed");
  }
  const inspected = await assertPlainDirectory(path, "recovery_restore_staging_unsafe");
  return { name, path: inspected.physical, identity: inspected.info };
}

async function cleanupOwnedRestoreStaging(restoreRoot, staging) {
  if (!staging || !inside(restoreRoot, staging.path)) fail("recovery_restore_cleanup_unsafe");
  const info = await lstat(staging.path, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return;
  let physical;
  try { physical = await realpath(staging.path); } catch { fail("recovery_restore_cleanup_unsafe"); }
  if (!info.isDirectory()
    || info.isSymbolicLink()
    || canonicalPath(physical) !== canonicalPath(staging.path)
    || !sameDirectoryIdentity(info, staging.identity)) fail("recovery_restore_cleanup_unsafe");
  await rm(staging.path, { recursive: true, force: true });
}

async function copyBackupObject(generation, entry, restoreRoot) {
  const sourcePath = resolve(generation.root, ...entry.object_ref.split("/"));
  const destinationPath = resolve(restoreRoot, ...entry.restore_ref.split("/"));
  if (!inside(restoreRoot, destinationPath)) fail("recovery_restore_path_escape");
  await ensureDirectory(restoreRoot, dirname(destinationPath));
  await copyVerifiedFile(sourcePath, generation.root, destinationPath, entry);
  const verified = await hashVerifiedFile(destinationPath, restoreRoot, { code: "recovery_restored_file_unsafe" });
  if (verified.size !== entry.size || verified.sha256 !== entry.sha256) fail("recovery_restored_file_hash_mismatch");
  if (entry.kind === "sqlite_vacuum_snapshot") {
    await quickCheckDatabase(destinationPath, "recovery_restored_sqlite_invalid");
  }
}

export async function verifyIngressRecoveryRestore(options = {}) {
  const backupRoot = requireAbsolutePath(options.backupRoot, "recovery_backup_root_absolute_required");
  const restoreRoot = requireAbsolutePath(options.restoreRoot, "recovery_restore_root_absolute_required");
  if (overlaps(backupRoot, restoreRoot)) fail("recovery_backup_restore_overlap");
  const restore = await assertEmptyRestoreRoot(restoreRoot);
  const generation = await loadGeneration(backupRoot, options.generationId);
  const entries = await verifyGenerationObjects(generation);
  const manifest = generation.document;
  let restoredSubdirectory = null;
  if (options.apply === true) {
    requireDigest(options.expectedSourceIdentity, "recovery_expected_source_identity_required");
    requireDigest(options.expectedSourceDigest, "recovery_expected_source_digest_required");
    requireSafeId(options.approvalRef, "recovery_approval_ref_required");
    if (options.expectedSourceIdentity !== manifest.source_identity_digest) fail("recovery_source_identity_mismatch");
    if (options.expectedSourceDigest !== manifest.source_digest) fail("recovery_source_digest_mismatch");
    if (options.approvalRef !== manifest.approval_ref) fail("recovery_approval_ref_mismatch");
    const staging = await createRestoreStaging(restore.physical);
    let stagingPublished = false;
    try {
      for (let index = 0; index < entries.length; index += 1) {
        await copyBackupObject(generation, entries[index], staging.path);
        if (typeof options.testHooks?.afterRestoreObject === "function") {
          await options.testHooks.afterRestoreObject({ index });
        }
      }
      const beforePublish = await readdir(restore.physical);
      if (beforePublish.length !== 1 || beforePublish[0] !== staging.name) {
        fail("recovery_restore_root_changed");
      }
      const finalName = "restored";
      const finalPath = resolve(restore.physical, finalName);
      if (!inside(restore.physical, finalPath) || await pathExists(finalPath)) {
        fail("recovery_restore_destination_collision");
      }
      await rename(staging.path, finalPath);
      stagingPublished = true;
      restoredSubdirectory = finalName;
      const afterPublish = await readdir(restore.physical);
      if (afterPublish.length !== 1 || afterPublish[0] !== finalName) {
        fail("recovery_restore_root_changed");
      }
    } catch (error) {
      if (!stagingPublished) await cleanupOwnedRestoreStaging(restore.physical, staging);
      throw error;
    }
  }
  return {
    schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
    ok: true,
    operation: "restore_test",
    status: options.apply === true ? "restore_verified" : "dry_run_verified_no_write",
    generation_id: generation.id,
    manifest_sha256: generation.manifestSha256,
    source_identity_digest: manifest.source_identity_digest,
    source_digest: manifest.source_digest,
    file_count: manifest.inventory.length,
    database_included: Boolean(generation.database),
    max_observed_custody_epoch: manifest.custody.max_observed_epoch,
    checkpoint_count: manifest.custody.checkpoint_count,
    verified_file_count: entries.length,
    writes_performed: options.apply === true ? entries.length : 0,
    restore_subdirectory: restoredSubdirectory,
    live_root_overwritten: false,
  };
}
