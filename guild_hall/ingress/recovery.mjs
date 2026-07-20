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
import { LANE_CONFIG, STORAGE_MANIFEST_SCHEMA } from "./collector.mjs";

export const INGRESS_RECOVERY_MANIFEST_SCHEMA = "soulforge.ingress.recovery_manifest.v2";
export const INGRESS_RECOVERY_COMMIT_SCHEMA = "soulforge.ingress.recovery_commit.v1";
export const INGRESS_RECOVERY_CUSTODY_SCHEMA = "soulforge.ingress.recovery_custody.v1";
export const INGRESS_RECOVERY_RESULT_SCHEMA = "soulforge.ingress.recovery_result.v1";
export const HPP_INGRESS_RECOVERY_POLICY_SCHEMA = "soulforge.hpp_ingress_recovery_policy.v1";

const LEGACY_INGRESS_RECOVERY_MANIFEST_SCHEMA = "soulforge.ingress.recovery_manifest.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_CUSTODY_JSON_BYTES = 16 * 1024 * 1024;
const MANIFEST_FILE = "manifest.json";
const COMMIT_FILE = "COMMITTED.json";
const RECOVERY_META_ROOT = ".ingress-recovery";
const ACTIVE_LOCK = /(?:^|\/)active\.lock(?:\.json)?$/iu;
const PARTIAL_FILE = /(?:^|\/)[^/]*\.partial-[^/]+$/iu;
const COORDINATION_FILE = /(?:^|\/)(?:[^/]*\.cas\.lock(?:\.recovery)?|[^/]*\.candidate-[^/]+|[^/]+\.recovery)$/iu;
const STATE_COORDINATION_FILE = /^state\/.+\.(?:lock|partial)$/iu;
const SQLITE_FILE = /(?:\.sqlite3?|\.db)(?:-(?:wal|shm|journal))?$/iu;
const PRIOR_BACKUP_ROOT = /^backups(?:\/|$)/iu;
const STRICT_LOCAL_READ = "strict_local_read";
const HASH_PINNED_NETWORK_READ = "hash_pinned_network_read";
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

const RECOVERY_POLICY_ID = "task-engine-hpp-five-lane-ingress-recovery";
const RECOVERY_POLICY_SCOPE = "five_lane_ingress_custody_continuity";
const RECOVERY_GUARD_PROFILE = "soulforge.ingress_recovery.fixed_guards.v1";
const RECOVERY_LANE_REFS = Object.freeze([
  Object.freeze({ writer_lane: "mail", manifest_lane: "mail", payload_ref: "ingress/mailbox", quarantine_ref: "quarantine/mail" }),
  Object.freeze({ writer_lane: "voice", manifest_lane: "voice", payload_ref: "ingress/voice", quarantine_ref: "quarantine/voice" }),
  Object.freeze({ writer_lane: "structured_pc_work", manifest_lane: "pc_activity", payload_ref: "ingress/pc_activity", quarantine_ref: "quarantine/pc_activity" }),
  Object.freeze({ writer_lane: "team_files", manifest_lane: "team_files", payload_ref: "ingress/team_files", quarantine_ref: "quarantine/team_files" }),
  Object.freeze({ writer_lane: "run_logs", manifest_lane: "run_logs", payload_ref: "ingress/run_logs", quarantine_ref: "quarantine/run_logs" }),
]);
const RECOVERY_STABLE_STATE_REFS = Object.freeze([
  Object.freeze({ ref: "state/receipts", required: true }),
  Object.freeze({ ref: "state/checkpoints", required: true }),
  Object.freeze({ ref: "state/leases", required: true }),
  Object.freeze({ ref: "state/mail_candidate", required: true }),
  Object.freeze({ ref: "state/outbox", required: true }),
]);
const RECOVERY_LEGACY_EMPTY_REFS = Object.freeze([
  Object.freeze({ ref: "quarantine/files", required_empty: true }),
]);
const RECOVERY_EXCLUDED_REFS = Object.freeze([
  "README.private.md",
  "backups",
  "config",
  "ingress-mcp",
  "manifests",
  "runtime",
  "state/backup_controller",
  "state/health",
]);
const RECOVERY_FORBIDDEN_CAPTURE_ROOTS = Object.freeze([
  "backups",
  "config",
  "ingress-mcp",
  "manifests",
  "runtime",
  "state/backup_controller",
  "state/health",
]);
const RECOVERY_WRITER_AUTHORITY_REF = "state/writer_authority/active.json";
const RECOVERY_WRITER_AUTHORITY_SCHEMA = "soulforge.ingress.writer_authority.v1";

export class IngressRecoveryError extends Error {
  constructor(code, mutationStatus = null) {
    super(code);
    this.name = "IngressRecoveryError";
    this.code = code;
    this.mutationStatus = mutationStatus;
  }
}

function fail(code) {
  throw new IngressRecoveryError(code);
}

function markMutationStatus(error, mutationStatus) {
  if (error && typeof error === "object") error.mutationStatus = mutationStatus;
  return error;
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

function compareCodeUnits(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
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

function fileStatIdentity(value) {
  return value ? {
    dev: value.dev,
    ino: value.ino,
    nlink: value.nlink,
    size: value.size,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
    regular_file: value.isFile(),
  } : null;
}

function observedFileStat(value, phase, fixture) {
  const identity = fileStatIdentity(value);
  return typeof fixture === "function" ? (fixture({ phase, identity }) ?? identity) : identity;
}

function statsMatch(left, right, {
  allowInodeDrift = false,
  allowCtimeHydration = false,
} = {}) {
  return Boolean(left && right
    && left.regular_file === true
    && right.regular_file === true
    && left.dev === right.dev
    && (allowInodeDrift || left.ino === right.ino)
    && left.nlink === 1n
    && right.nlink === 1n
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && (allowCtimeHydration || left.ctimeNs === right.ctimeNs));
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

async function hashVerifiedFile(path, root, {
  captureBytes = false,
  code = "recovery_source_file_unsafe",
  immutableBackupExpected = null,
  backupStatFixture = null,
  verificationProfile = STRICT_LOCAL_READ,
} = {}) {
  const inspected = await assertPlainFile(path, root, code);
  if (!new Set([STRICT_LOCAL_READ, HASH_PINNED_NETWORK_READ]).has(verificationProfile)) fail(code);
  const allowInodeDrift = verificationProfile === HASH_PINNED_NETWORK_READ;
  if (allowInodeDrift && immutableBackupExpected === null) fail(code);
  if (allowInodeDrift
    && (!Number.isSafeInteger(immutableBackupExpected?.size) || !SHA256.test(immutableBackupExpected?.sha256))) {
    fail(code);
  }
  let handle;
  const hash = createHash("sha256");
  const chunks = captureBytes ? [] : null;
  let total = 0;
  try {
    handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat({ bigint: true });
    if (!statsMatch(
      observedFileStat(inspected.info, "before", backupStatFixture),
      observedFileStat(opened, "opened", backupStatFixture),
      { allowInodeDrift, allowCtimeHydration: allowInodeDrift },
    )) fail(code);
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
  if (!statsMatch(
    observedFileStat(inspected.info, "before", backupStatFixture),
    observedFileStat(after.info, "after", backupStatFixture),
    { allowInodeDrift, allowCtimeHydration: allowInodeDrift },
  ) || canonicalPath(after.physical) !== canonicalPath(inspected.physical)) fail(code);
  const digest = hash.digest("hex");
  if (immutableBackupExpected
    && (total !== immutableBackupExpected.size || digest !== immutableBackupExpected.sha256)) {
    fail(immutableBackupExpected.code ?? code);
  }
  return {
    size: total,
    sha256: digest,
    bytes: chunks ? Buffer.concat(chunks, total) : null,
  };
}

async function copyVerifiedFile(sourcePath, sourceRoot, destinationPath, expected, {
  verificationProfile = STRICT_LOCAL_READ,
  backupStatFixture = null,
} = {}) {
  if (!new Set([STRICT_LOCAL_READ, HASH_PINNED_NETWORK_READ]).has(verificationProfile)) {
    fail("recovery_source_file_unsafe");
  }
  const immutableBackup = verificationProfile === HASH_PINNED_NETWORK_READ;
  const inspected = await assertPlainFile(sourcePath, sourceRoot, "recovery_source_file_unsafe");
  let source;
  let destination;
  const hash = createHash("sha256");
  let total = 0;
  try {
    source = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await source.stat({ bigint: true });
    if (!statsMatch(
      observedFileStat(inspected.info, "before", immutableBackup ? backupStatFixture : null),
      observedFileStat(opened, "opened", immutableBackup ? backupStatFixture : null),
      { allowInodeDrift: immutableBackup, allowCtimeHydration: immutableBackup },
    )) {
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
  if (!statsMatch(
    observedFileStat(inspected.info, "before", immutableBackup ? backupStatFixture : null),
    observedFileStat(after.info, "after", immutableBackup ? backupStatFixture : null),
    { allowInodeDrift: immutableBackup, allowCtimeHydration: immutableBackup },
  ) || canonicalPath(after.physical) !== canonicalPath(inspected.physical)) {
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

function exactStringMap(value, expected, code) {
  exactKeys(value, Object.keys(expected), code);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) fail(code);
    safeRelativeRef(value[key], code);
  }
}

function sourceDatabaseDocument(database) {
  return database ? {
    identity_digest: database.identity_digest,
    main: database.main,
    runtime: database.runtime,
  } : null;
}

function recoveryPolicyDocument(policy) {
  return {
    schema_version: policy.document.schema_version,
    policy_id: policy.document.policy_id,
    sha256: policy.sha256,
    legacy_empty_refs: policy.document.legacy_empty_refs,
  };
}

function storageManifestDocument(storage) {
  return {
    schema_version: storage.document.schema_version,
    size: storage.size,
    sha256: storage.sha256,
  };
}

function sourceDigestDocument(inventory, database, custody, recoveryPolicy, storageManifest, writerAuthority) {
  return {
    inventory: inventory.map(({ restore_ref, size, sha256 }) => ({ restore_ref, size, sha256 })),
    database: sourceDatabaseDocument(database),
    recovery_policy: recoveryPolicy,
    storage_manifest: storageManifest,
    writer_authority: writerAuthority,
    custody: {
      max_observed_epoch: custody.max_observed_epoch,
      checkpoint_count: custody.checkpoint_count,
      checkpoint_inventory_digest: custody.checkpoint_inventory_digest,
    },
  };
}

function sourceDigestValue(inventory, database, custody, recoveryPolicy, storageManifest, writerAuthority) {
  return sha256Bytes(stableJson(sourceDigestDocument(
    inventory,
    database,
    custody,
    recoveryPolicy,
    storageManifest,
    writerAuthority,
  )));
}

function exactArray(value, expected, code) {
  if (!Array.isArray(value)
    || value.length !== expected.length
    || value.some((item, index) => stableJson(item) !== stableJson(expected[index]))) fail(code);
}

function exactRelativeStringMap(value, keys, code) {
  exactKeys(value, keys, code);
  for (const key of keys) safeRelativeRef(value[key], code);
}

function validateRecoveryPolicy(document) {
  exactKeys(document, [
    "schema_version",
    "policy_id",
    "scope",
    "guard_profile",
    "storage_manifest",
    "lane_refs",
    "stable_state_refs",
    "legacy_empty_refs",
    "writer_authority",
    "excluded_refs",
    "forbidden_capture_roots",
  ], "recovery_policy_invalid");
  if (document.schema_version !== HPP_INGRESS_RECOVERY_POLICY_SCHEMA
    || document.policy_id !== RECOVERY_POLICY_ID
    || document.scope !== RECOVERY_POLICY_SCOPE
    || document.guard_profile !== RECOVERY_GUARD_PROFILE) fail("recovery_policy_invalid");
  exactKeys(document.storage_manifest, ["ref", "schema_version", "sha256"], "recovery_policy_invalid");
  if (document.storage_manifest.ref !== "storage_manifest.json"
    || document.storage_manifest.schema_version !== STORAGE_MANIFEST_SCHEMA
    || !SHA256.test(document.storage_manifest.sha256)) fail("recovery_policy_invalid");
  exactArray(document.lane_refs, RECOVERY_LANE_REFS, "recovery_policy_invalid");
  exactArray(document.stable_state_refs, RECOVERY_STABLE_STATE_REFS, "recovery_policy_invalid");
  exactArray(document.legacy_empty_refs, RECOVERY_LEGACY_EMPTY_REFS, "recovery_policy_invalid");
  exactKeys(document.writer_authority, [
    "record_ref",
    "schema_version",
    "required",
    "expected_sha256",
  ], "recovery_policy_invalid");
  if (document.writer_authority.record_ref !== RECOVERY_WRITER_AUTHORITY_REF
    || document.writer_authority.schema_version !== RECOVERY_WRITER_AUTHORITY_SCHEMA
    || typeof document.writer_authority.required !== "boolean"
    || (document.writer_authority.expected_sha256 !== null
      && !SHA256.test(document.writer_authority.expected_sha256))) fail("recovery_policy_invalid");
  exactArray(document.excluded_refs, RECOVERY_EXCLUDED_REFS, "recovery_policy_invalid");
  exactArray(document.forbidden_capture_roots, RECOVERY_FORBIDDEN_CAPTURE_ROOTS, "recovery_policy_invalid");
  const included = [
    ...document.lane_refs.flatMap((lane) => [lane.payload_ref, lane.quarantine_ref]),
    ...document.stable_state_refs.map((item) => item.ref),
    document.writer_authority.record_ref,
  ];
  for (const ref of [
    ...included,
    ...document.legacy_empty_refs.map((item) => item.ref),
    ...document.excluded_refs,
    ...document.forbidden_capture_roots,
  ]) {
    safeRelativeRef(ref, "recovery_policy_invalid");
  }
  for (const ref of included) {
    if (document.forbidden_capture_roots.some((root) => ref === root || ref.startsWith(`${root}/`))) {
      fail("recovery_policy_invalid");
    }
  }
  for (const { ref } of document.legacy_empty_refs) {
    if (included.some((root) => ref === root || ref.startsWith(`${root}/`) || root.startsWith(`${ref}/`))
      || document.forbidden_capture_roots.some((root) => ref === root || ref.startsWith(`${root}/`))) {
      fail("recovery_policy_invalid");
    }
  }
  return document;
}

async function readRecoveryPolicy(policyPath, { sourceRoot = null, backupRoot = null, restoreRoot = null } = {}) {
  const path = requireAbsolutePath(policyPath, "recovery_policy_path_absolute_required");
  if ((sourceRoot && inside(sourceRoot, path))
    || (backupRoot && inside(backupRoot, path))
    || (restoreRoot && inside(restoreRoot, path))) fail("recovery_policy_path_overlap");
  if (isSecretLikeRef(basename(path))) fail("recovery_policy_secret_like_name_forbidden");
  await assertNoLinkAncestors(path, "recovery_policy_path_unsafe");
  const parent = await assertPlainDirectory(dirname(path), "recovery_policy_parent_unsafe");
  const checked = await hashVerifiedFile(path, parent.physical, {
    captureBytes: true,
    code: "recovery_policy_unsafe",
  });
  let document;
  try { document = JSON.parse(checked.bytes.toString("utf8")); } catch { fail("recovery_policy_invalid"); }
  validateRecoveryPolicy(document);
  return { path, document, size: checked.size, sha256: checked.sha256 };
}

function validateStorageManifest(document, policy) {
  exactKeys(document, [
    "schema_version",
    "custody_role",
    "cloud_sync_allowed",
    "remote_direct_disk_access_allowed",
    "payload_roots",
    "state_roots",
    "lane_contracts",
    "classification_policy",
    "raw_in_workmeta_allowed",
    "workspace_or_workmeta_relocation",
    "config_roots",
    "runtime_roots",
    "voice_transfer_service_enabled",
  ], "recovery_storage_manifest_invalid");
  if (document.schema_version !== STORAGE_MANIFEST_SCHEMA
    || document.custody_role !== "hpp_sole_writer"
    || document.cloud_sync_allowed !== false
    || document.remote_direct_disk_access_allowed !== false
    || document.classification_policy !== "stable_object_identity_with_project_binding_events"
    || document.raw_in_workmeta_allowed !== false
    || document.workspace_or_workmeta_relocation !== false
    || typeof document.voice_transfer_service_enabled !== "boolean") {
    fail("recovery_storage_manifest_invalid");
  }
  exactRelativeStringMap(document.config_roots, ["mail_private"], "recovery_storage_manifest_invalid");
  exactRelativeStringMap(document.runtime_roots, [
    "erp",
    "file_activity",
    "mail_fetch",
    "mcp",
    "voice",
  ], "recovery_storage_manifest_invalid");
  const payloadRoots = Object.fromEntries(policy.document.lane_refs.map((lane) => [lane.manifest_lane, lane.payload_ref]));
  exactStringMap(document.payload_roots, payloadRoots, "recovery_storage_manifest_invalid");
  exactStringMap(document.state_roots, {
    receipts: "state/receipts",
    checkpoints: "state/checkpoints",
    leases: "state/leases",
    mail_candidate: "state/mail_candidate",
    outbox: "state/outbox",
  }, "recovery_storage_manifest_invalid");
  exactKeys(document.lane_contracts, policy.document.lane_refs.map((lane) => lane.manifest_lane), "recovery_storage_manifest_invalid");
  for (const laneRef of policy.document.lane_refs) {
    const lane = LANE_CONFIG[laneRef.writer_lane];
    const contract = document.lane_contracts[laneRef.manifest_lane];
    exactKeys(contract, [
      "payload",
      "receipt",
      "checkpoint",
      "quarantine",
      ...(laneRef.writer_lane === "voice" ? ["acceptance_state"] : []),
    ], "recovery_storage_manifest_invalid");
    if (contract.payload !== laneRef.payload_ref
      || contract.receipt !== lane.receiptRoot
      || contract.checkpoint !== lane.checkpointRoot
      || contract.quarantine !== laneRef.quarantine_ref) fail("recovery_storage_manifest_invalid");
    for (const key of ["payload", "receipt", "checkpoint", "quarantine"]) {
      safeRelativeRef(contract[key], "recovery_storage_manifest_invalid");
    }
  }
  return document;
}

async function readStorageManifest(sourceRoot, policy) {
  const path = resolve(sourceRoot, "storage_manifest.json");
  const checked = await hashVerifiedFile(path, sourceRoot, {
    captureBytes: true,
    code: "recovery_storage_manifest_unsafe",
  });
  let document;
  try { document = JSON.parse(checked.bytes.toString("utf8")); } catch { fail("recovery_storage_manifest_invalid"); }
  if (checked.sha256 !== policy.document.storage_manifest.sha256) fail("recovery_storage_manifest_sha256_mismatch");
  validateStorageManifest(document, policy);
  return {
    document,
    size: checked.size,
    sha256: checked.sha256,
  };
}

async function readDirectoryEntries(directory, code) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { fail(code); }
  entries.sort((left, right) => compareCodeUnits(left.name, right.name));
  return entries;
}

async function assertDirectEntry(root, entry, kind, code) {
  const path = resolve(root, entry.name);
  if (!inside(root, path)) fail(code);
  const info = await lstat(path, { bigint: true });
  if (info.isSymbolicLink()
    || (kind === "directory" ? !entry.isDirectory() : !entry.isFile())) fail(code);
  const physical = await realpath(path);
  if (canonicalPath(physical) !== canonicalPath(path) || !inside(root, physical)) fail(code);
  if (kind === "file" && info.nlink !== 1n) fail(code);
  return { path, info, physical };
}

async function preflightExactChildren(root, allowed, required, code) {
  const entries = await readDirectoryEntries(root, code);
  const observed = new Set(entries.map((entry) => entry.name));
  for (const entry of entries) {
    if (!allowed.has(entry.name)) fail(code);
    await assertDirectEntry(root, entry, "directory", code);
  }
  for (const name of required) if (!observed.has(name)) fail(code);
  return observed;
}

async function preflightSourceShape(sourceRoot, policy) {
  const topIncluded = new Set([
    "storage_manifest.json",
    ...policy.document.lane_refs.flatMap((lane) => [lane.payload_ref, lane.quarantine_ref]),
    ...policy.document.stable_state_refs.map((item) => item.ref),
    policy.document.writer_authority.record_ref,
  ].map((ref) => ref.split("/")[0]));
  const topExcluded = new Set(policy.document.excluded_refs.filter((ref) => !ref.includes("/")));
  const allowedTop = new Set([...topIncluded, ...topExcluded]);
  const entries = await readDirectoryEntries(sourceRoot, "recovery_source_directory_read_failed");
  const observed = new Map(entries.map((entry) => [entry.name, entry]));
  for (const entry of entries) {
    if (!allowedTop.has(entry.name)) fail("recovery_source_top_level_undeclared");
    const kind = entry.name === "storage_manifest.json" || entry.name === "README.private.md" ? "file" : "directory";
    await assertDirectEntry(sourceRoot, entry, kind, kind === "file"
      ? "recovery_source_file_unsafe"
      : "recovery_declared_root_unsafe");
  }
  for (const name of topIncluded) {
    if (!observed.has(name)) fail("recovery_declared_root_missing");
  }

  const ingressAllowed = new Set(policy.document.lane_refs.map((lane) => lane.payload_ref.split("/")[1]));
  const quarantineLaneChildren = policy.document.lane_refs.map((lane) => lane.quarantine_ref.split("/")[1]);
  const legacyEmptyChildren = policy.document.legacy_empty_refs.map((item) => item.ref.split("/")[1]);
  const quarantineAllowed = new Set([...quarantineLaneChildren, ...legacyEmptyChildren]);
  await preflightExactChildren(resolve(sourceRoot, "ingress"), ingressAllowed, ingressAllowed, "recovery_ingress_child_undeclared");
  await preflightExactChildren(resolve(sourceRoot, "quarantine"), quarantineAllowed, quarantineAllowed, "recovery_quarantine_child_undeclared");
  for (const item of policy.document.legacy_empty_refs) {
    const directory = resolve(sourceRoot, ...item.ref.split("/"));
    await assertPlainDirectory(directory, "recovery_legacy_empty_ref_unsafe");
    const entries = await readDirectoryEntries(directory, "recovery_legacy_empty_ref_unsafe");
    if (item.required_empty && entries.length !== 0) fail("recovery_legacy_empty_ref_not_empty");
  }

  const stableStateChildren = new Set(policy.document.stable_state_refs.map((item) => item.ref.split("/")[1]));
  const allowedStateChildren = new Set([
    ...stableStateChildren,
    "backup_controller",
    "health",
    "writer_authority",
  ]);
  const requiredStateChildren = new Set(policy.document.stable_state_refs
    .filter((item) => item.required)
    .map((item) => item.ref.split("/")[1]));
  const stateChildren = await preflightExactChildren(
    resolve(sourceRoot, "state"),
    allowedStateChildren,
    requiredStateChildren,
    "recovery_state_child_undeclared",
  );
  return {
    topLevel: new Set(observed.keys()),
    stateChildren,
  };
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
  runtime.sort((left, right) => compareCodeUnits(left.suffix, right.suffix));
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

function policyIncludeDirectories(policy) {
  return [
    ...policy.document.lane_refs.flatMap((lane) => [lane.payload_ref, lane.quarantine_ref]),
    ...policy.document.stable_state_refs.map((item) => item.ref),
  ];
}

function refInsideExactInclude(policy, ref) {
  return policyIncludeDirectories(policy).some((root) => ref === root || ref.startsWith(`${root}/`))
    || ref === policy.document.writer_authority.record_ref;
}

function inventoryEntry(ref, hashed) {
  return {
    kind: "source_file",
    restore_ref: ref,
    object_ref: `objects/sha256/${hashed.sha256.slice(0, 2)}/${hashed.sha256}`,
    size: hashed.size,
    sha256: hashed.sha256,
  };
}

function absentWriterAuthority() {
  return {
    record_ref: RECOVERY_WRITER_AUTHORITY_REF,
    present: false,
    file_sha256: null,
    epoch: null,
    record_digest: null,
  };
}

function validateWriterAuthorityRecord(document, hashed) {
  const fields = [
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
  exactKeys(document, fields, "recovery_writer_authority_invalid");
  if (document.schema_version !== RECOVERY_WRITER_AUTHORITY_SCHEMA
    || document.authority_id !== "task-engine-hpp-production-ingress"
    || document.authority_scope !== "raw_ingress_custody_only"
    || !Number.isSafeInteger(document.epoch)
    || document.epoch < 1
    || !new Set(["off", "primary", "fallback"]).has(document.mode)
    || !Array.isArray(document.lanes)
    || stableJson(document.lanes) !== stableJson(RECOVERY_LANE_REFS.map((lane) => lane.writer_lane))
    || !SHA256.test(document.record_digest)) fail("recovery_writer_authority_invalid");
  const { record_digest: ignored, ...body } = document;
  if (sha256Bytes(stableJson(body)) !== document.record_digest) fail("recovery_writer_authority_invalid");
  return {
    record_ref: RECOVERY_WRITER_AUTHORITY_REF,
    present: true,
    file_sha256: hashed.sha256,
    epoch: document.epoch,
    record_digest: document.record_digest,
  };
}

async function scanSourcePlane(sourceRoot, recoveryPolicyPath, sqlitePath = null, testHooks = {}) {
  const pinned = await assertPlainDirectory(sourceRoot, "recovery_source_root_unsafe");
  const policy = await readRecoveryPolicy(recoveryPolicyPath, { sourceRoot: pinned.physical });
  const shape = await preflightSourceShape(pinned.physical, policy);
  if (typeof testHooks.beforeIncludedFileRead === "function") {
    await testHooks.beforeIncludedFileRead({ ref: "storage_manifest.json" });
  }
  const storage = await readStorageManifest(pinned.physical, policy);
  const database = await inspectSqliteSource(sqlitePath);
  if (database && inside(pinned.physical, database.path)) {
    const ref = relative(pinned.physical, database.path).split(sep).join("/");
    safeRelativeRef(ref, "recovery_sqlite_outside_declared_root");
    if (!refInsideExactInclude(policy, ref)) fail("recovery_sqlite_outside_declared_root");
  }
  const sqlitePaths = database ? sqliteRuntimePaths(database.path) : new Set();
  const inventory = [inventoryEntry("storage_manifest.json", storage)];
  const exclusions = {
    active_lock_files: 0,
    ephemeral_files: 0,
    secret_like_entries: 0,
    sqlite_runtime_files: 0,
    prior_backup_roots: shape.topLevel.has("backups") ? 1 : 0,
  };
  let maxObservedEpoch = 0;

  async function walkIncluded(directory, prefix) {
    await assertPlainDirectory(directory, "recovery_source_directory_unsafe");
    const entries = await readDirectoryEntries(directory, "recovery_source_directory_read_failed");
    for (const entry of entries) {
      const ref = `${prefix}/${entry.name}`;
      safeRelativeRef(ref, "recovery_source_ref_invalid");
      if (isSecretLikeRef(ref)) fail("recovery_included_secret_like_entry");
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
      if (ACTIVE_LOCK.test(ref)) {
        exclusions.active_lock_files += 1;
        continue;
      }
      if (PARTIAL_FILE.test(ref) || COORDINATION_FILE.test(ref) || STATE_COORDINATION_FILE.test(ref)) {
        exclusions.ephemeral_files += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await walkIncluded(path, ref);
        continue;
      }
      if (!entry.isFile() || info.nlink !== 1n) fail("recovery_source_special_file_forbidden");
      if (sqlitePaths.has(canonicalPath(path))) {
        exclusions.sqlite_runtime_files += 1;
        continue;
      }
      if (SQLITE_FILE.test(entry.name)) fail("recovery_sqlite_must_be_declared");
      if (typeof testHooks.beforeIncludedFileRead === "function") {
        await testHooks.beforeIncludedFileRead({ ref });
      }
      const captureBytes = isCustodyJsonRef(ref);
      const hashed = await hashVerifiedFile(path, pinned.physical, {
        captureBytes,
        code: "recovery_source_file_unsafe",
      });
      if (captureBytes) {
        let document;
        try { document = JSON.parse(hashed.bytes.toString("utf8")); } catch { fail("recovery_custody_record_invalid"); }
        for (const epoch of epochValues(document)) maxObservedEpoch = Math.max(maxObservedEpoch, epoch);
      }
      inventory.push(inventoryEntry(ref, hashed));
    }
  }

  for (const ref of policyIncludeDirectories(policy)) {
    await walkIncluded(resolve(pinned.physical, ...ref.split("/")), ref);
  }

  let writerAuthority = absentWriterAuthority();
  const writerPolicy = policy.document.writer_authority;
  const writerDirectory = resolve(pinned.physical, "state", "writer_authority");
  if (shape.stateChildren.has("writer_authority")) {
    const entries = await readDirectoryEntries(writerDirectory, "recovery_writer_authority_directory_unsafe");
    let active = null;
    for (const entry of entries) {
      const ref = `state/writer_authority/${entry.name}`;
      safeRelativeRef(ref, "recovery_writer_authority_child_undeclared");
      if (isSecretLikeRef(ref)) fail("recovery_included_secret_like_entry");
      if (entry.name !== "active.json" && !isForbiddenCoordinationRef(ref)) {
        fail("recovery_writer_authority_child_undeclared");
      }
      const path = resolve(writerDirectory, entry.name);
      const info = await lstat(path, { bigint: true });
      if (info.isSymbolicLink()) fail("recovery_writer_authority_unsafe");
      const physical = await realpath(path);
      if (canonicalPath(physical) !== canonicalPath(path) || !inside(pinned.physical, physical)) {
        fail("recovery_writer_authority_unsafe");
      }
      if (entry.name === "active.json") {
        if (!entry.isFile() || info.nlink !== 1n) fail("recovery_writer_authority_unsafe");
        active = path;
      } else if (ACTIVE_LOCK.test(ref)) {
        exclusions.active_lock_files += 1;
      } else {
        exclusions.ephemeral_files += 1;
      }
    }
    if (active) {
      if (typeof testHooks.beforeIncludedFileRead === "function") {
        await testHooks.beforeIncludedFileRead({ ref: RECOVERY_WRITER_AUTHORITY_REF });
      }
      const hashed = await hashVerifiedFile(active, pinned.physical, {
        captureBytes: true,
        code: "recovery_writer_authority_unsafe",
      });
      if (writerPolicy.expected_sha256 !== null && hashed.sha256 !== writerPolicy.expected_sha256) {
        fail("recovery_writer_authority_sha256_mismatch");
      }
      let document;
      try { document = JSON.parse(hashed.bytes.toString("utf8")); } catch { fail("recovery_writer_authority_invalid"); }
      writerAuthority = validateWriterAuthorityRecord(document, hashed);
      inventory.push(inventoryEntry(RECOVERY_WRITER_AUTHORITY_REF, hashed));
    }
  }
  if (!writerAuthority.present && (writerPolicy.required || writerPolicy.expected_sha256 !== null)) {
    fail("recovery_writer_authority_missing");
  }

  inventory.sort((left, right) => compareCodeUnits(left.restore_ref, right.restore_ref));
  const checkpoints = inventory
    .filter((item) => isCheckpointRef(item.restore_ref))
    .map(({ restore_ref, size, sha256 }) => ({ restore_ref, size, sha256 }));
  const checkpointInventoryDigest = sha256Bytes(stableJson(checkpoints));
  const custody = {
    max_observed_epoch: maxObservedEpoch,
    checkpoint_count: checkpoints.length,
    checkpoint_inventory_digest: checkpointInventoryDigest,
  };
  const recoveryPolicy = recoveryPolicyDocument(policy);
  const storageManifest = storageManifestDocument(storage);
  const sourceDigest = sourceDigestValue(
    inventory,
    database,
    custody,
    recoveryPolicy,
    storageManifest,
    writerAuthority,
  );
  return {
    sourceRoot: pinned.physical,
    recoveryPolicyPath: policy.path,
    sourceIdentityDigest: pathIdentityDigest(pinned.physical),
    sourceDigest,
    inventory,
    exclusions,
    database,
    custody,
    recoveryPolicy,
    storageManifest,
    writerAuthority,
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
    recovery_policy_sha256: plan.recoveryPolicy.sha256,
    storage_manifest_sha256: plan.storageManifest.sha256,
    writer_authority_present: plan.writerAuthority.present,
    writer_authority_epoch: plan.writerAuthority.epoch,
    writer_authority_digest: plan.writerAuthority.record_digest,
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
  const copied = new Map();
  for (const item of plan.inventory) {
    const prior = copied.get(item.object_ref);
    if (prior) {
      if (prior.size !== item.size || prior.sha256 !== item.sha256) {
        fail("recovery_object_collision");
      }
      continue;
    }
    const sourcePath = resolve(plan.sourceRoot, ...item.restore_ref.split("/"));
    const objectPath = resolve(generationRoot, ...item.object_ref.split("/"));
    if (!inside(generationRoot, objectPath)) fail("recovery_object_path_escape");
    await ensureDirectory(generationRoot, dirname(objectPath));
    if (await pathExists(objectPath)) fail("recovery_object_collision");
    await copyVerifiedFile(sourcePath, plan.sourceRoot, objectPath, item);
    copied.set(item.object_ref, { size: item.size, sha256: item.sha256 });
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
    source_database: sourceDatabaseDocument(plan.database),
    recovery_policy: plan.recoveryPolicy,
    storage_manifest: plan.storageManifest,
    writer_authority: plan.writerAuthority,
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

function commitDocumentBytes(id, manifestSha256) {
  return Buffer.from(`${JSON.stringify({
    schema_version: INGRESS_RECOVERY_COMMIT_SCHEMA,
    generation_id: id,
    manifest_sha256: manifestSha256,
  }, null, 2)}\n`, "utf8");
}

export async function planIngressRecoverySnapshot(options = {}) {
  const sourceRoot = requireAbsolutePath(options.sourceRoot, "recovery_source_root_absolute_required");
  const backupRoot = requireAbsolutePath(options.backupRoot, "recovery_backup_root_absolute_required");
  const recoveryPolicyPath = requireAbsolutePath(
    options.recoveryPolicyPath,
    "recovery_policy_path_absolute_required",
  );
  await assertPlainDirectory(sourceRoot, "recovery_source_root_unsafe");
  await assertPlainDirectory(backupRoot, "recovery_backup_root_unsafe");
  if (overlaps(sourceRoot, backupRoot)) fail("recovery_source_backup_overlap");
  if (inside(sourceRoot, recoveryPolicyPath) || inside(backupRoot, recoveryPolicyPath)) {
    fail("recovery_policy_path_overlap");
  }
  if (options.sqlitePath) {
    const sqlitePath = requireAbsolutePath(options.sqlitePath, "recovery_sqlite_path_absolute_required");
    if (inside(backupRoot, sqlitePath) || inside(sqlitePath, backupRoot)) fail("recovery_sqlite_backup_overlap");
  }
  return scanSourcePlane(
    sourceRoot,
    recoveryPolicyPath,
    options.sqlitePath ?? null,
    options.testHooks,
  );
}

async function assertOwnedDirectory(parent, staging, code, { missingOk = false } = {}) {
  if (!staging || !staging.identity || !inside(parent, staging.path)) fail(code);
  const info = await lstat(staging.path, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT" && missingOk) return null;
    throw error;
  });
  if (!info) return;
  let physical;
  try { physical = await realpath(staging.path); } catch { fail(code); }
  if (!info.isDirectory()
    || info.isSymbolicLink()
    || canonicalPath(physical) !== canonicalPath(staging.path)
    || !sameDirectoryIdentity(info, staging.identity)) fail(code);
  return info;
}

async function cleanupOwnedSnapshotStaging(generationsRoot, staging) {
  const owned = await assertOwnedDirectory(generationsRoot, staging, "recovery_snapshot_cleanup_unsafe", { missingOk: true });
  if (!owned) return;
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
  const controlDirectoryCreated = !(await pathExists(generationsRoot));
  await ensureDirectory(backupRoot, generationsRoot);
  const finalRoot = resolve(generationsRoot, id);
  const partialRoot = resolve(generationsRoot, `.partial-${id}-${randomUUID()}`);
  if (!inside(generationsRoot, finalRoot) || !inside(generationsRoot, partialRoot)) fail("recovery_generation_path_escape");
  if (await pathExists(finalRoot)) fail("recovery_generation_collision");
  let staging = null;
  let stagingRenamed = false;
  let publicationCommitted = false;
  try {
    await mkdir(partialRoot, { mode: 0o700 });
    staging = { path: partialRoot, identity: null };
    staging.identity = await lstat(partialRoot, { bigint: true });
    if (typeof options.testHooks?.afterSnapshotStagingMkdir === "function") {
      await options.testHooks.afterSnapshotStagingMkdir({ path: partialRoot });
    }
    const inspected = await assertPlainDirectory(partialRoot, "recovery_generation_unsafe");
    if (!sameDirectoryIdentity(inspected.info, staging.identity)) fail("recovery_generation_unsafe");
    staging = { path: inspected.physical, identity: inspected.info };
    if (typeof options.testHooks?.afterSnapshotStagingCreated === "function") {
      await options.testHooks.afterSnapshotStagingCreated({ path: staging.path });
    }
    const objectWrites = await copyInventoryObjects(plan, staging.path);
    const custody = await writeCustodyObject(plan, staging.path);
    const databaseSnapshot = plan.database ? await snapshotDatabase(plan.database, staging.path) : null;

    const after = await scanSourcePlane(
      plan.sourceRoot,
      plan.recoveryPolicyPath,
      plan.database?.path ?? null,
      options.testHooks,
    );
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
    const commitBytes = commitDocumentBytes(id, manifestSha256);
    if (typeof options.testHooks?.beforeSnapshotPublication === "function") {
      await options.testHooks.beforeSnapshotPublication({ path: staging.path });
    }
    const stagedGeneration = generationFromDocument(staging.path, id, manifestSha256, manifest);
    await verifyGenerationManifestFile(stagedGeneration, manifestBytes.length, options.testHooks);
    await verifyGenerationObjects(stagedGeneration, options.testHooks);
    await verifyExactGenerationTree(stagedGeneration, { committed: false });
    if (typeof options.testHooks?.afterSnapshotVerificationBeforePublication === "function") {
      await options.testHooks.afterSnapshotVerificationBeforePublication({ path: staging.path });
    }
    await assertOwnedDirectory(generationsRoot, staging, "recovery_generation_publication_identity_mismatch");
    await verifyGenerationManifestFile(stagedGeneration, manifestBytes.length, options.testHooks);
    await verifyGenerationObjects(stagedGeneration, options.testHooks);
    await verifyExactGenerationTree(stagedGeneration, { committed: false });
    if (await pathExists(finalRoot)) fail("recovery_generation_collision");
    await rename(staging.path, finalRoot);
    stagingRenamed = true;
    const finalGeneration = { ...stagedGeneration, root: finalRoot };
    if (typeof options.testHooks?.afterSnapshotRenameBeforeCommitVerification === "function") {
      await options.testHooks.afterSnapshotRenameBeforeCommitVerification({ path: finalRoot });
    }
    await verifyGenerationManifestFile(finalGeneration, manifestBytes.length, options.testHooks);
    await verifyGenerationObjects(finalGeneration, options.testHooks);
    await verifyExactGenerationTree(finalGeneration, { committed: false });
    await writeExclusiveBytes(resolve(finalRoot, COMMIT_FILE), commitBytes);
    publicationCommitted = true;
    return {
      schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
      ok: true,
      operation: "snapshot",
      status: "snapshot_created",
      generation_id: id,
      manifest_sha256: manifestSha256,
      source_identity_digest: plan.sourceIdentityDigest,
      source_digest: plan.sourceDigest,
      recovery_policy_sha256: plan.recoveryPolicy.sha256,
      storage_manifest_sha256: plan.storageManifest.sha256,
      writer_authority_present: plan.writerAuthority.present,
      writer_authority_epoch: plan.writerAuthority.epoch,
      writer_authority_digest: plan.writerAuthority.record_digest,
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
    if (stagingRenamed) {
      throw markMutationStatus(error, publicationCommitted
        ? "published_commit_reached"
        : "renamed_uncommitted_generation");
    }
    if (staging) {
      try {
        await cleanupOwnedSnapshotStaging(generationsRoot, staging);
      } catch (cleanupError) {
        throw markMutationStatus(cleanupError, "cleanup_not_confirmed");
      }
      throw markMutationStatus(error, "owned_staging_cleaned");
    }
    throw markMutationStatus(error, controlDirectoryCreated ? "control_directory_created" : "no_write_claim");
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

function validateSourceDatabase(value) {
  if (value === null) return null;
  exactKeys(value, ["identity_digest", "main", "runtime"], "recovery_manifest_source_database_invalid");
  exactKeys(value.main, ["size", "sha256"], "recovery_manifest_source_database_invalid");
  if (!SHA256.test(value.identity_digest)
    || !Number.isSafeInteger(value.main.size)
    || value.main.size < 1
    || !SHA256.test(value.main.sha256)
    || !Array.isArray(value.runtime)) fail("recovery_manifest_source_database_invalid");
  let previous = null;
  for (const entry of value.runtime) {
    exactKeys(entry, ["suffix", "size", "sha256"], "recovery_manifest_source_database_invalid");
    if (!new Set(["-wal", "-journal"]).has(entry.suffix)
      || !Number.isSafeInteger(entry.size)
      || entry.size < 0
      || !SHA256.test(entry.sha256)
      || (previous !== null && compareCodeUnits(previous, entry.suffix) >= 0)) {
      fail("recovery_manifest_source_database_invalid");
    }
    previous = entry.suffix;
  }
  return value;
}

function isForbiddenCoordinationRef(ref) {
  return ACTIVE_LOCK.test(ref)
    || PARTIAL_FILE.test(ref)
    || COORDINATION_FILE.test(ref)
    || STATE_COORDINATION_FILE.test(ref);
}

function validateRecoveryPolicyDescriptor(value) {
  exactKeys(value, [
    "schema_version",
    "policy_id",
    "sha256",
    "legacy_empty_refs",
  ], "recovery_manifest_policy_invalid");
  if (value.schema_version !== HPP_INGRESS_RECOVERY_POLICY_SCHEMA
    || value.policy_id !== RECOVERY_POLICY_ID
    || !SHA256.test(value.sha256)) fail("recovery_manifest_policy_invalid");
  exactArray(value.legacy_empty_refs, RECOVERY_LEGACY_EMPTY_REFS, "recovery_manifest_policy_invalid");
  return value;
}

function validateStorageManifestDescriptor(value) {
  exactKeys(value, ["schema_version", "size", "sha256"], "recovery_manifest_storage_invalid");
  if (value.schema_version !== STORAGE_MANIFEST_SCHEMA
    || !Number.isSafeInteger(value.size)
    || value.size < 1
    || !SHA256.test(value.sha256)) fail("recovery_manifest_storage_invalid");
  return value;
}

function validateWriterAuthorityDescriptor(value) {
  exactKeys(value, [
    "record_ref",
    "present",
    "file_sha256",
    "epoch",
    "record_digest",
  ], "recovery_manifest_writer_authority_invalid");
  if (value.record_ref !== RECOVERY_WRITER_AUTHORITY_REF || typeof value.present !== "boolean") {
    fail("recovery_manifest_writer_authority_invalid");
  }
  if (value.present) {
    if (!SHA256.test(value.file_sha256)
      || !Number.isSafeInteger(value.epoch)
      || value.epoch < 1
      || !SHA256.test(value.record_digest)) fail("recovery_manifest_writer_authority_invalid");
  } else if (value.file_sha256 !== null || value.epoch !== null || value.record_digest !== null) {
    fail("recovery_manifest_writer_authority_invalid");
  }
  return value;
}

function recoveryManifestRefAllowed(ref) {
  if (ref === "storage_manifest.json" || ref === RECOVERY_WRITER_AUTHORITY_REF) return true;
  return [
    ...RECOVERY_LANE_REFS.flatMap((lane) => [lane.payload_ref, lane.quarantine_ref]),
    ...RECOVERY_STABLE_STATE_REFS.map((item) => item.ref),
  ].some((root) => ref.startsWith(`${root}/`));
}

function validateManifest(document, generation) {
  const legacy = document?.schema_version === LEGACY_INGRESS_RECOVERY_MANIFEST_SCHEMA;
  exactKeys(document, [
    "schema_version",
    "generation_id",
    "created_at",
    "approval_ref",
    "source_identity_digest",
    "source_digest",
    ...(legacy ? [] : [
      "source_database",
      "recovery_policy",
      "storage_manifest",
      "writer_authority",
    ]),
    "inventory",
    "database_snapshot",
    "custody",
    "exclusions",
    "source_deleted",
    "source_overwritten",
    "live_root_overwritten",
  ], "recovery_manifest_invalid");
  if (!new Set([INGRESS_RECOVERY_MANIFEST_SCHEMA, LEGACY_INGRESS_RECOVERY_MANIFEST_SCHEMA]).has(document.schema_version)
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
  let legacyForbiddenCoordinationCount = 0;
  for (const entry of document.inventory) {
    validateInventoryEntry(entry, "source_file");
    const order = legacy
      ? (previous === null ? -1 : previous.localeCompare(entry.restore_ref))
      : (previous === null ? -1 : compareCodeUnits(previous, entry.restore_ref));
    if (refs.has(entry.restore_ref) || order >= 0) {
      fail("recovery_manifest_inventory_invalid");
    }
    refs.add(entry.restore_ref);
    previous = entry.restore_ref;
    if (!legacy && !recoveryManifestRefAllowed(entry.restore_ref)) {
      fail("recovery_manifest_forbidden_file");
    }
    if (isForbiddenCoordinationRef(entry.restore_ref)) {
      if (!legacy) fail("recovery_manifest_forbidden_file");
      legacyForbiddenCoordinationCount += 1;
    }
  }
  const sourceDatabase = legacy ? null : validateSourceDatabase(document.source_database);
  const recoveryPolicy = legacy ? null : validateRecoveryPolicyDescriptor(document.recovery_policy);
  const storageManifest = legacy ? null : validateStorageManifestDescriptor(document.storage_manifest);
  const writerAuthority = legacy ? null : validateWriterAuthorityDescriptor(document.writer_authority);
  if (!legacy) {
    const storageEntry = document.inventory.find((entry) => entry.restore_ref === "storage_manifest.json");
    const writerEntry = document.inventory.find((entry) => entry.restore_ref === RECOVERY_WRITER_AUTHORITY_REF);
    if (!storageEntry
      || storageEntry.size !== storageManifest.size
      || storageEntry.sha256 !== storageManifest.sha256
      || writerAuthority.present !== Boolean(writerEntry)
      || (writerEntry && writerEntry.sha256 !== writerAuthority.file_sha256)) {
      fail("recovery_manifest_bound_object_mismatch");
    }
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
  if (!legacy
    && sourceDigestValue(
      document.inventory,
      sourceDatabase,
      document.custody,
      recoveryPolicy,
      storageManifest,
      writerAuthority,
    ) !== document.source_digest) {
    fail("recovery_manifest_source_digest_mismatch");
  }
  return {
    document,
    custody,
    database,
    legacy,
    legacyForbiddenCoordinationCount,
    manifestValidation: legacy
      ? "legacy_external_anchor_required"
      : "recovery_policy_bound_source_digest_recomputed",
  };
}

function generationFromDocument(root, id, manifestSha256, document) {
  return {
    root,
    id,
    manifestSha256,
    ...validateManifest(document, id),
  };
}

async function verifyGenerationManifestFile(generation, size, testHooks = {}) {
  await hashVerifiedFile(resolve(generation.root, MANIFEST_FILE), generation.root, {
    code: "recovery_manifest_unsafe",
    immutableBackupExpected: {
      size,
      sha256: generation.manifestSha256,
      code: "recovery_manifest_sha256_mismatch",
    },
    backupStatFixture: testHooks.backupStatFixture,
    verificationProfile: HASH_PINNED_NETWORK_READ,
  });
}

async function loadGenerationRoot(generationRoot, generation, options = {}) {
  const id = requireSafeId(generation, "recovery_generation_id_invalid");
  await assertPlainDirectory(generationRoot, "recovery_generation_unsafe");
  const manifestPath = resolve(generationRoot, MANIFEST_FILE);
  const commitPath = resolve(generationRoot, COMMIT_FILE);
  let document;
  let commit;
  try {
    const expectedCommitBytes = options.expectedManifestSha256
      ? commitDocumentBytes(id, options.expectedManifestSha256)
      : null;
    const commitFile = await hashVerifiedFile(commitPath, generationRoot, {
      captureBytes: true,
      code: "recovery_commit_unsafe",
      immutableBackupExpected: expectedCommitBytes ? {
        size: expectedCommitBytes.length,
        sha256: sha256Bytes(expectedCommitBytes),
        code: "recovery_manifest_sha256_mismatch",
      } : null,
      backupStatFixture: options.testHooks?.backupStatFixture,
      verificationProfile: expectedCommitBytes ? HASH_PINNED_NETWORK_READ : STRICT_LOCAL_READ,
    });
    commit = JSON.parse(commitFile.bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof IngressRecoveryError) throw error;
    fail("recovery_manifest_invalid");
  }
  exactKeys(commit, ["schema_version", "generation_id", "manifest_sha256"], "recovery_commit_invalid");
  if (commit.schema_version !== INGRESS_RECOVERY_COMMIT_SCHEMA
    || commit.generation_id !== id
    || !SHA256.test(commit.manifest_sha256)) fail("recovery_commit_invalid");
  if (options.expectedManifestSha256 !== undefined
    && options.expectedManifestSha256 !== commit.manifest_sha256) {
    fail("recovery_manifest_sha256_mismatch");
  }
  const manifestFile = await hashVerifiedFile(manifestPath, generationRoot, {
    captureBytes: true,
    code: "recovery_manifest_unsafe",
    immutableBackupExpected: {
      size: Number((await lstat(manifestPath, { bigint: true })).size),
      sha256: commit.manifest_sha256,
      code: "recovery_commit_invalid",
    },
    backupStatFixture: options.testHooks?.backupStatFixture,
    verificationProfile: HASH_PINNED_NETWORK_READ,
  });
  try { document = JSON.parse(manifestFile.bytes.toString("utf8")); } catch { fail("recovery_manifest_invalid"); }
  return generationFromDocument(generationRoot, id, manifestFile.sha256, document);
}

async function loadGeneration(backupRoot, generation, options = {}) {
  const root = await assertPlainDirectory(backupRoot, "recovery_backup_root_unsafe");
  const id = requireSafeId(generation, "recovery_generation_id_invalid");
  const generationRoot = resolve(root.physical, "generations", id);
  if (!inside(root.physical, generationRoot)) fail("recovery_generation_path_escape");
  return loadGenerationRoot(generationRoot, id, options);
}

async function verifyGenerationObjects(generation, testHooks = {}) {
  const entries = [
    ...generation.document.inventory,
    generation.custody,
    ...(generation.database ? [generation.database] : []),
  ];
  for (const entry of entries) {
    const objectPath = resolve(generation.root, ...entry.object_ref.split("/"));
    if (!inside(generation.root, objectPath)) fail("recovery_manifest_object_ref_invalid");
    await hashVerifiedFile(objectPath, generation.root, {
      code: "recovery_backup_object_unsafe",
      immutableBackupExpected: {
        size: entry.size,
        sha256: entry.sha256,
        code: "recovery_backup_object_hash_mismatch",
      },
      backupStatFixture: testHooks.backupStatFixture,
      verificationProfile: HASH_PINNED_NETWORK_READ,
    });
    if (entry.kind === "sqlite_vacuum_snapshot") {
      await quickCheckDatabase(objectPath, "recovery_sqlite_snapshot_invalid");
    }
    if (entry.kind === "custody_checkpoint") {
      const checked = await hashVerifiedFile(objectPath, generation.root, {
        captureBytes: true,
        code: "recovery_backup_object_unsafe",
        immutableBackupExpected: {
          size: entry.size,
          sha256: entry.sha256,
          code: "recovery_backup_object_hash_mismatch",
        },
        backupStatFixture: testHooks.backupStatFixture,
        verificationProfile: HASH_PINNED_NETWORK_READ,
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

function expectedTree(refs) {
  const files = new Set(refs);
  const directories = new Set();
  for (const ref of files) {
    safeRelativeRef(ref, "recovery_expected_tree_invalid");
    const parts = ref.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }
  return { files, directories };
}

async function assertExactTree(root, refs, code) {
  const pinned = await assertPlainDirectory(root, code);
  const expected = expectedTree(refs);
  const observedFiles = new Set();
  const observedDirectories = new Set();
  async function walk(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const ref = prefix ? `${prefix}/${entry.name}` : entry.name;
      safeRelativeRef(ref, code);
      const path = resolve(directory, entry.name);
      const info = await lstat(path, { bigint: true });
      if (info.isSymbolicLink()) fail(code);
      const physical = await realpath(path);
      if (canonicalPath(physical) !== canonicalPath(path) || !inside(pinned.physical, physical)) fail(code);
      if (entry.isDirectory()) {
        if (!expected.directories.has(ref)) fail(code);
        observedDirectories.add(ref);
        await walk(path, ref);
      } else if (entry.isFile() && info.nlink === 1n) {
        if (!expected.files.has(ref)) fail(code);
        observedFiles.add(ref);
      } else {
        fail(code);
      }
    }
  }
  await walk(pinned.physical);
  if (observedFiles.size !== expected.files.size
    || observedDirectories.size !== expected.directories.size) fail(code);
}

async function verifyExactGenerationTree(generation, { committed = true } = {}) {
  const entries = [
    ...generation.document.inventory,
    generation.custody,
    ...(generation.database ? [generation.database] : []),
  ];
  await assertExactTree(generation.root, [
    MANIFEST_FILE,
    ...(committed ? [COMMIT_FILE] : []),
    ...new Set(entries.map((entry) => entry.object_ref)),
  ], "recovery_generation_tree_mismatch");
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

async function createRestoreStaging(restoreRoot, testHooks = {}) {
  const name = `.partial-ingress-restore-${randomUUID()}`;
  const path = resolve(restoreRoot, name);
  if (!inside(restoreRoot, path)) fail("recovery_restore_path_escape");
  let staging = null;
  try {
    await mkdir(path, { mode: 0o700 });
    staging = { name, path, identity: null };
    staging.identity = await lstat(path, { bigint: true });
    if (typeof testHooks.afterRestoreStagingMkdir === "function") {
      await testHooks.afterRestoreStagingMkdir({ path });
    }
    const inspected = await assertPlainDirectory(path, "recovery_restore_staging_unsafe");
    if (!sameDirectoryIdentity(inspected.info, staging.identity)) fail("recovery_restore_staging_unsafe");
    return { name, path: inspected.physical, identity: inspected.info };
  } catch (error) {
    if (!staging) {
      if (error instanceof IngressRecoveryError) throw error;
      fail("recovery_restore_staging_create_failed");
    }
    try {
      await cleanupOwnedRestoreStaging(restoreRoot, staging);
    } catch (cleanupError) {
      throw markMutationStatus(cleanupError, "cleanup_not_confirmed");
    }
    throw markMutationStatus(error, "owned_staging_cleaned");
  }
}

async function cleanupOwnedRestoreStaging(restoreRoot, staging) {
  const owned = await assertOwnedDirectory(restoreRoot, staging, "recovery_restore_cleanup_unsafe", { missingOk: true });
  if (!owned) return;
  await rm(staging.path, { recursive: true, force: true });
}

async function quarantineOwnedRestorePublication(restoreRoot, finalPath, identity) {
  const published = { path: finalPath, identity };
  await assertOwnedDirectory(restoreRoot, published, "recovery_restore_publication_quarantine_unsafe");
  const name = `.rejected-ingress-restore-${randomUUID()}`;
  const path = resolve(restoreRoot, name);
  if (!inside(restoreRoot, path) || await pathExists(path)) {
    fail("recovery_restore_publication_quarantine_unsafe");
  }
  await rename(finalPath, path);
  return name;
}

async function copyBackupObject(generation, entry, restoreRoot, testHooks = {}) {
  const sourcePath = resolve(generation.root, ...entry.object_ref.split("/"));
  const destinationPath = resolve(restoreRoot, ...entry.restore_ref.split("/"));
  if (!inside(restoreRoot, destinationPath)) fail("recovery_restore_path_escape");
  await ensureDirectory(restoreRoot, dirname(destinationPath));
  await copyVerifiedFile(sourcePath, generation.root, destinationPath, entry, {
    verificationProfile: HASH_PINNED_NETWORK_READ,
    backupStatFixture: testHooks.backupStatFixture,
  });
  const verified = await hashVerifiedFile(destinationPath, restoreRoot, { code: "recovery_restored_file_unsafe" });
  if (verified.size !== entry.size || verified.sha256 !== entry.sha256) fail("recovery_restored_file_hash_mismatch");
  if (entry.kind === "sqlite_vacuum_snapshot") {
    await quickCheckDatabase(destinationPath, "recovery_restored_sqlite_invalid");
  }
}

async function verifyExactRestoredTree(entries, restoreRoot) {
  await assertExactTree(
    restoreRoot,
    entries.map((entry) => entry.restore_ref),
    "recovery_restored_tree_mismatch",
  );
  for (const entry of entries) {
    const path = resolve(restoreRoot, ...entry.restore_ref.split("/"));
    const checked = await hashVerifiedFile(path, restoreRoot, { code: "recovery_restored_file_unsafe" });
    if (checked.size !== entry.size || checked.sha256 !== entry.sha256) {
      fail("recovery_restored_file_hash_mismatch");
    }
  }
}

export async function verifyIngressRecoveryRestore(options = {}) {
  const backupRoot = requireAbsolutePath(options.backupRoot, "recovery_backup_root_absolute_required");
  const restoreRoot = requireAbsolutePath(options.restoreRoot, "recovery_restore_root_absolute_required");
  if (overlaps(backupRoot, restoreRoot)) fail("recovery_backup_restore_overlap");
  if (options.apply === true || options.expectedManifestSha256 !== undefined) {
    requireDigest(options.expectedManifestSha256, "recovery_expected_manifest_sha256_required");
  }
  const restore = await assertEmptyRestoreRoot(restoreRoot);
  const generation = await loadGeneration(backupRoot, options.generationId, {
    expectedManifestSha256: options.expectedManifestSha256,
    testHooks: options.testHooks,
  });
  let suppliedPolicy = null;
  if (!generation.legacy || options.recoveryPolicyPath !== undefined) {
    suppliedPolicy = await readRecoveryPolicy(options.recoveryPolicyPath, { backupRoot, restoreRoot });
  }
  if (!generation.legacy) {
    const suppliedDescriptor = recoveryPolicyDocument(suppliedPolicy);
    if (stableJson(suppliedDescriptor) !== stableJson(generation.document.recovery_policy)
      || suppliedPolicy.document.storage_manifest.sha256 !== generation.document.storage_manifest.sha256) {
      fail("recovery_policy_manifest_binding_mismatch");
    }
  }
  const entries = await verifyGenerationObjects(generation, options.testHooks);
  await verifyExactGenerationTree(generation);
  const manifest = generation.document;
  let restoredSubdirectory = null;
  if (options.apply === true) {
    requireDigest(options.expectedSourceIdentity, "recovery_expected_source_identity_required");
    requireDigest(options.expectedSourceDigest, "recovery_expected_source_digest_required");
    requireSafeId(options.approvalRef, "recovery_approval_ref_required");
    if (generation.legacyForbiddenCoordinationCount > 0) {
      fail("recovery_legacy_manifest_forbidden_file");
    }
    if (options.expectedSourceIdentity !== manifest.source_identity_digest) fail("recovery_source_identity_mismatch");
    if (options.expectedSourceDigest !== manifest.source_digest) fail("recovery_source_digest_mismatch");
    if (options.approvalRef !== manifest.approval_ref) fail("recovery_approval_ref_mismatch");
    await assertEmptyRestoreRoot(restore.physical);
    const staging = await createRestoreStaging(restore.physical, options.testHooks);
    let stagingPublished = false;
    let finalPath = null;
    try {
      for (let index = 0; index < entries.length; index += 1) {
        await copyBackupObject(generation, entries[index], staging.path, options.testHooks);
        if (typeof options.testHooks?.afterRestoreObject === "function") {
          await options.testHooks.afterRestoreObject({ index });
        }
      }
      if (typeof options.testHooks?.beforeRestorePublication === "function") {
        await options.testHooks.beforeRestorePublication({ path: staging.path });
      }
      await verifyExactRestoredTree(entries, staging.path);
      if (typeof options.testHooks?.afterRestoreVerificationBeforePublication === "function") {
        await options.testHooks.afterRestoreVerificationBeforePublication({ path: staging.path });
      }
      await assertOwnedDirectory(restore.physical, staging, "recovery_restore_publication_identity_mismatch");
      await verifyExactRestoredTree(entries, staging.path);
      const beforePublish = await readdir(restore.physical);
      if (beforePublish.length !== 1 || beforePublish[0] !== staging.name) {
        fail("recovery_restore_root_changed");
      }
      const finalName = "restored";
      finalPath = resolve(restore.physical, finalName);
      if (!inside(restore.physical, finalPath) || await pathExists(finalPath)) {
        fail("recovery_restore_destination_collision");
      }
      await rename(staging.path, finalPath);
      stagingPublished = true;
      if (typeof options.testHooks?.afterRestoreRenameBeforeVerification === "function") {
        await options.testHooks.afterRestoreRenameBeforeVerification({ path: finalPath });
      }
      try {
        await verifyExactRestoredTree(entries, finalPath);
      } catch (verificationError) {
        try {
          await quarantineOwnedRestorePublication(restore.physical, finalPath, staging.identity);
        } catch (quarantineError) {
          throw markMutationStatus(quarantineError, "published_restore_quarantine_not_confirmed");
        }
        throw markMutationStatus(verificationError, "published_restore_quarantined");
      }
      restoredSubdirectory = finalName;
    } catch (error) {
      if (error?.mutationStatus) throw error;
      if (!stagingPublished) {
        try {
          await cleanupOwnedRestoreStaging(restore.physical, staging);
        } catch (cleanupError) {
          throw markMutationStatus(cleanupError, "cleanup_not_confirmed");
        }
        throw markMutationStatus(error, "owned_staging_cleaned");
      }
      throw markMutationStatus(error, "published_restore_verification_failed");
    }
  } else {
    await assertEmptyRestoreRoot(restore.physical);
  }
  return {
    schema_version: INGRESS_RECOVERY_RESULT_SCHEMA,
    ok: true,
    operation: "restore_test",
    status: options.apply === true
      ? "restore_verified"
      : (!options.expectedManifestSha256
        ? "observed_unanchored_no_write"
        : (generation.legacyForbiddenCoordinationCount > 0
          ? "observed_anchored_legacy_forbidden_no_write"
          : "dry_run_verified_no_write")),
    generation_id: generation.id,
    manifest_sha256: generation.manifestSha256,
    manifest_validation: generation.manifestValidation,
    legacy_forbidden_coordination_count: generation.legacyForbiddenCoordinationCount,
    source_identity_digest: manifest.source_identity_digest,
    source_digest: manifest.source_digest,
    recovery_policy_sha256: manifest.recovery_policy?.sha256 ?? null,
    storage_manifest_sha256: manifest.storage_manifest?.sha256 ?? null,
    writer_authority_present: manifest.writer_authority?.present ?? null,
    writer_authority_epoch: manifest.writer_authority?.epoch ?? null,
    writer_authority_digest: manifest.writer_authority?.record_digest ?? null,
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
