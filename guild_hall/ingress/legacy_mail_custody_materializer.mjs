import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,127}$/u;
const RELATIVE_REF = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)(?!.*\\)(?!.*\/$)[^\u0000-\u001f\u007f:]+$/u;
const BINDING_SCHEMA = "soulforge.legacy_mail_custody_binding.v1";
const RESULT_SCHEMA = "soulforge.legacy_mail_custody_materialization_result.v1";

export class LegacyMailCustodyError extends Error {
  constructor(code) {
    super(code);
    this.name = "LegacyMailCustodyError";
    this.code = code;
  }
}

function fail(code) {
  throw new LegacyMailCustodyError(code);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(path) {
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(path, flags);
  try {
    const openedBefore = await handle.stat();
    if (!openedBefore.isFile() || openedBefore.nlink !== 1) fail("legacy_custody_opened_file_unsafe");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    const openedAfter = await handle.stat();
    if (!openedAfter.isFile() || openedAfter.nlink !== 1 || !sameIdentity(identity(openedBefore), identity(openedAfter))) {
      fail("legacy_custody_opened_file_unstable");
    }
    return { sha256: hash.digest("hex"), size: total, identity: identity(openedAfter) };
  } finally {
    await handle.close();
  }
}

function exactKeys(value, keys, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

function pathInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function pathsOverlap(left, right) {
  return pathInside(left, right) || pathInside(right, left);
}

function validateRelativeRef(value) {
  if (typeof value !== "string" || !RELATIVE_REF.test(value)) fail("legacy_custody_relative_ref_invalid");
  if (value.normalize("NFC") !== value) fail("legacy_custody_relative_ref_invalid");
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("legacy_custody_relative_ref_invalid");
  }
  return value;
}

export function manifestBasis(files) {
  return [...files]
    .map(({ relative_ref, sha256, size }) => ({ relative_ref, sha256, size }))
    .sort((left, right) => left.relative_ref < right.relative_ref ? -1 : left.relative_ref > right.relative_ref ? 1 : 0);
}

export function manifestDigest(files) {
  return sha256Bytes(canonical(manifestBasis(files)));
}

export function validateLegacyMailCustodyBinding(value) {
  exactKeys(value, [
    "schema_version",
    "snapshot_id",
    "source_root",
    "destination_root",
    "approval_ref",
    "expected_manifest_sha256",
    "files",
  ], "legacy_custody_binding_shape_invalid");
  if (value.schema_version !== BINDING_SCHEMA) fail("legacy_custody_binding_schema_invalid");
  if (!SAFE_ID.test(value.snapshot_id ?? "")) fail("legacy_custody_snapshot_id_invalid");
  if (!SAFE_ID.test(value.approval_ref ?? "")) fail("legacy_custody_approval_ref_invalid");
  if (!isAbsolute(value.source_root ?? "") || !isAbsolute(value.destination_root ?? "")) {
    fail("legacy_custody_root_absolute_required");
  }
  if (pathsOverlap(value.source_root, value.destination_root)) fail("legacy_custody_roots_overlap");
  if (!SHA256.test(value.expected_manifest_sha256 ?? "")) fail("legacy_custody_manifest_digest_invalid");
  if (!Array.isArray(value.files) || value.files.length === 0) fail("legacy_custody_files_invalid");

  const seenRefs = new Set();
  const files = value.files.map((entry) => {
    exactKeys(entry, ["relative_ref", "sha256", "size"], "legacy_custody_file_shape_invalid");
    const relativeRef = validateRelativeRef(entry.relative_ref);
    const comparisonRef = relativeRef.toLowerCase();
    if (seenRefs.has(comparisonRef)) fail("legacy_custody_relative_ref_duplicate");
    seenRefs.add(comparisonRef);
    if (!SHA256.test(entry.sha256 ?? "")) fail("legacy_custody_file_digest_invalid");
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("legacy_custody_file_size_invalid");
    return { relative_ref: relativeRef, sha256: entry.sha256, size: entry.size };
  });
  const digest = manifestDigest(files);
  if (digest !== value.expected_manifest_sha256) fail("legacy_custody_manifest_digest_mismatch");
  return { ...value, source_root: resolve(value.source_root), destination_root: resolve(value.destination_root), files, manifest_digest: digest };
}

async function plainDirectory(path, code) {
  let info;
  try {
    info = await lstat(path);
  } catch {
    fail(code);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail(code);
  const physical = await realpath(path).catch(() => fail(code));
  return { info, physical: resolve(physical) };
}

function identity(info) {
  return {
    dev: String(info.dev),
    ino: String(info.ino),
    size: info.size,
    mtime_ms: info.mtimeMs,
    ctime_ms: info.ctimeMs,
    nlink: info.nlink,
  };
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtime_ms === right.mtime_ms
    && left.ctime_ms === right.ctime_ms
    && left.nlink === right.nlink;
}

async function assertPlainPathChain(root, candidate, { lastFile = false, code }) {
  if (!pathInside(root, candidate) || resolve(root) === resolve(candidate)) fail(code);
  const segments = relative(resolve(root), resolve(candidate)).split(sep).filter(Boolean);
  let cursor = resolve(root);
  for (let index = 0; index < segments.length; index += 1) {
    cursor = join(cursor, segments[index]);
    const info = await lstat(cursor).catch(() => fail(code));
    const isLast = index === segments.length - 1;
    if (info.isSymbolicLink() || (isLast && lastFile ? !info.isFile() : !info.isDirectory())) fail(code);
  }
}

async function inspectSourceFile(sourceRootPhysical, entry) {
  const source = resolve(sourceRootPhysical, ...entry.relative_ref.split("/"));
  if (!pathInside(sourceRootPhysical, source) || source === sourceRootPhysical) fail("legacy_custody_source_escape");
  await assertPlainPathChain(sourceRootPhysical, source, { lastFile: true, code: "legacy_custody_source_not_plain_file" });
  let info;
  try {
    info = await lstat(source);
  } catch {
    fail("legacy_custody_source_missing");
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("legacy_custody_source_not_plain_file");
  const physical = resolve(await realpath(source).catch(() => fail("legacy_custody_source_not_plain_file")));
  if (!pathInside(sourceRootPhysical, physical)) fail("legacy_custody_source_escape");
  const before = identity(info);
  const digest = await hashFile(physical).catch(() => fail("legacy_custody_source_read_failed"));
  const afterInfo = await lstat(physical).catch(() => fail("legacy_custody_source_unstable"));
  const after = identity(afterInfo);
  if (!afterInfo.isFile() || afterInfo.isSymbolicLink() || !sameIdentity(before, after) || !sameIdentity(before, digest.identity)) {
    fail("legacy_custody_source_unstable");
  }
  if (digest.sha256 !== entry.sha256 || digest.size !== entry.size) fail("legacy_custody_source_digest_mismatch");
  return { ...entry, source: physical, identity: before };
}

async function inspectExistingObject(path, entry, destinationRoot = null) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("legacy_custody_destination_read_failed");
  }
  if (destinationRoot !== null) {
    await assertPlainPathChain(destinationRoot, path, { lastFile: true, code: "legacy_custody_destination_conflict" });
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("legacy_custody_destination_conflict");
  const before = identity(info);
  const digest = await hashFile(path).catch(() => fail("legacy_custody_destination_read_failed"));
  const afterInfo = await lstat(path).catch(() => fail("legacy_custody_destination_read_failed"));
  if (!afterInfo.isFile() || afterInfo.isSymbolicLink() || !sameIdentity(before, identity(afterInfo)) || !sameIdentity(before, digest.identity)) {
    fail("legacy_custody_destination_conflict");
  }
  if (digest.sha256 !== entry.sha256 || digest.size !== entry.size) fail("legacy_custody_destination_conflict");
  return true;
}

async function inspectOptionalDestinationRoot(path) {
  const absolute = resolve(path);
  const volumeRoot = parse(absolute).root;
  let cursor = volumeRoot;
  const rootInfo = await lstat(cursor).catch(() => fail("legacy_custody_destination_parent_unsafe"));
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail("legacy_custody_destination_parent_unsafe");
  const segments = relative(volumeRoot, absolute).split(sep).filter(Boolean);
  for (const segment of segments) {
    cursor = join(cursor, segment);
    try {
      const info = await lstat(cursor);
      if (!info.isDirectory() || info.isSymbolicLink()) fail("legacy_custody_destination_root_unsafe");
    } catch (error) {
      if (error instanceof LegacyMailCustodyError) throw error;
      if (error?.code === "ENOENT") return { missing: true, first_missing: cursor };
      fail("legacy_custody_destination_root_unsafe");
    }
  }
  return await plainDirectory(absolute, "legacy_custody_destination_root_unsafe");
}

async function inspectOptionalPlainDirectoryPath(root, candidate) {
  if (!pathInside(root, candidate)) fail("legacy_custody_destination_escape");
  let cursor = resolve(root);
  const segments = relative(resolve(root), resolve(candidate)).split(sep).filter(Boolean);
  for (const segment of segments) {
    cursor = join(cursor, segment);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error?.code === "ENOENT") return { missing: true };
      fail("legacy_custody_destination_root_unsafe");
    }
    if (!info.isDirectory() || info.isSymbolicLink()) fail("legacy_custody_destination_root_unsafe");
  }
  return { missing: false };
}

async function loadBinding(bindingPath) {
  if (!isAbsolute(bindingPath ?? "")) fail("legacy_custody_binding_absolute_required");
  const bindingInfo = await lstat(bindingPath).catch(() => fail("legacy_custody_binding_read_failed"));
  if (!bindingInfo.isFile() || bindingInfo.isSymbolicLink()) fail("legacy_custody_binding_read_failed");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(bindingPath, "utf8"));
  } catch {
    fail("legacy_custody_binding_read_failed");
  }
  return validateLegacyMailCustodyBinding(parsed);
}

async function preflight(binding) {
  const sourceRoot = await plainDirectory(binding.source_root, "legacy_custody_source_root_unsafe");
  const destination = await inspectOptionalDestinationRoot(binding.destination_root);
  const destinationPhysical = destination.missing ? binding.destination_root : destination.physical;
  if (pathsOverlap(sourceRoot.physical, destinationPhysical)) fail("legacy_custody_roots_overlap");

  const inspected = [];
  const seenSourceIdentities = new Set();
  if (!destination.missing) {
    const objectParents = new Set(binding.files.map((entry) => join(
      binding.destination_root,
      "objects",
      "sha256",
      entry.sha256.slice(0, 2),
    )));
    for (const parent of objectParents) await inspectOptionalPlainDirectoryPath(binding.destination_root, parent);
    const snapshotsRoot = join(binding.destination_root, "snapshots");
    await inspectOptionalPlainDirectoryPath(binding.destination_root, snapshotsRoot);
    const snapshotTarget = join(snapshotsRoot, binding.snapshot_id);
    const targetState = await inspectOptionalPlainDirectoryPath(binding.destination_root, snapshotTarget);
    if (!targetState.missing) await verifySnapshot(snapshotTarget, snapshotBytes(binding));
  }
  for (const entry of binding.files) {
    const source = await inspectSourceFile(sourceRoot.physical, entry);
    // Windows/OneDrive-backed files can report colliding dev/ino pairs for
    // distinct real paths. Canonical realpath catches actual aliases without
    // turning that provider metadata collision into a false duplicate.
    const sourceIdentityKey = source.source.normalize("NFC").toLowerCase();
    if (seenSourceIdentities.has(sourceIdentityKey)) fail("legacy_custody_source_identity_duplicate");
    seenSourceIdentities.add(sourceIdentityKey);
    const objectPath = join(binding.destination_root, "objects", "sha256", entry.sha256.slice(0, 2), `${entry.sha256}.bin`);
    const exists = await inspectExistingObject(objectPath, entry, binding.destination_root);
    inspected.push({ ...source, object_path: objectPath, exists });
  }
  return { sourceRoot, inspected };
}

function safeResult(binding, mode, status, preflightResult, extra = {}) {
  const uniqueObjects = new Set(binding.files.map((entry) => entry.sha256)).size;
  const existingObjects = new Set(preflightResult.inspected.filter((entry) => entry.exists).map((entry) => entry.sha256)).size;
  const totalBytes = binding.files.reduce((sum, entry) => sum + entry.size, 0);
  return {
    schema_version: RESULT_SCHEMA,
    status,
    mode,
    snapshot_id: binding.snapshot_id,
    file_count: binding.files.length,
    unique_object_count: uniqueObjects,
    total_bytes: totalBytes,
    existing_object_count: existingObjects,
    new_object_count: uniqueObjects - existingObjects,
    manifest_sha256: binding.manifest_digest,
    source_verified: true,
    source_write_count: 0,
    delete_count: 0,
    overwrite_count: 0,
    ...extra,
  };
}

async function ensurePlainDirectoryTree(path) {
  const absolute = resolve(path);
  const volumeRoot = parse(absolute).root;
  let cursor = volumeRoot;
  const segments = relative(volumeRoot, absolute).split(sep).filter(Boolean);
  for (const segment of segments) {
    cursor = join(cursor, segment);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error?.code !== "ENOENT") fail("legacy_custody_destination_root_unsafe");
      try {
        await mkdir(cursor, { recursive: false });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") fail("legacy_custody_destination_create_failed");
      }
      info = await lstat(cursor).catch(() => fail("legacy_custody_destination_create_failed"));
    }
    if (!info.isDirectory() || info.isSymbolicLink()) fail("legacy_custody_destination_root_unsafe");
  }
  return plainDirectory(absolute, "legacy_custody_destination_root_unsafe");
}

async function ensurePlainOwnedDirectory(path, root) {
  if (!pathInside(root, path)) fail("legacy_custody_destination_escape");
  const rootChecked = await ensurePlainDirectoryTree(root);
  const checked = await ensurePlainDirectoryTree(path);
  if (!pathInside(rootChecked.physical, checked.physical)) fail("legacy_custody_destination_escape");
  return checked;
}

async function removeOwnedTemp(path, ownerRoot, prefix, recursive = false) {
  const absolute = resolve(path);
  if (!pathInside(ownerRoot, absolute) || !absolute.split(sep).at(-1)?.startsWith(prefix)) return;
  if (recursive) await rm(absolute, { recursive: true, force: true }).catch(() => {});
  else await unlink(absolute).catch(() => {});
}

async function publishObject(binding, entry, invocationId) {
  if (await inspectExistingObject(entry.object_path, entry, binding.destination_root)) return false;
  const parent = dirname(entry.object_path);
  await ensurePlainOwnedDirectory(parent, binding.destination_root);
  const temp = join(parent, `.legacy-custody-${invocationId}-${entry.sha256}.partial`);
  try {
    await copyFile(entry.source, temp, fsConstants.COPYFILE_EXCL);
    const copied = await inspectExistingObject(temp, entry);
    if (!copied) fail("legacy_custody_copy_verify_failed");
    const sourceAfter = await lstat(entry.source).catch(() => fail("legacy_custody_source_unstable"));
    if (!sameIdentity(entry.identity, identity(sourceAfter))) fail("legacy_custody_source_unstable");
    try {
      await link(temp, entry.object_path);
      await unlink(temp);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await removeOwnedTemp(temp, parent, `.legacy-custody-${invocationId}-`);
      await inspectExistingObject(entry.object_path, entry, binding.destination_root);
    }
    await inspectExistingObject(entry.object_path, entry, binding.destination_root);
    return true;
  } catch (error) {
    await removeOwnedTemp(temp, parent, `.legacy-custody-${invocationId}-`);
    if (error instanceof LegacyMailCustodyError) throw error;
    fail("legacy_custody_copy_failed");
  }
}

function snapshotBytes(binding) {
  const rows = manifestBasis(binding.files).map((entry) => JSON.stringify({
    ...entry,
    object_ref: `objects/sha256/${entry.sha256.slice(0, 2)}/${entry.sha256}.bin`,
  }));
  const index = `${rows.join("\n")}\n`;
  const manifest = `${JSON.stringify({
    schema_version: "soulforge.legacy_mail_custody_snapshot.v1",
    snapshot_id: binding.snapshot_id,
    manifest_sha256: binding.manifest_digest,
    file_count: binding.files.length,
    unique_object_count: new Set(binding.files.map((entry) => entry.sha256)).size,
    total_bytes: binding.files.reduce((sum, entry) => sum + entry.size, 0),
    index_sha256: sha256Bytes(index),
  }, null, 2)}\n`;
  const commit = `${JSON.stringify({
    schema_version: "soulforge.legacy_mail_custody_commit.v1",
    snapshot_id: binding.snapshot_id,
    manifest_sha256: sha256Bytes(manifest),
    index_sha256: sha256Bytes(index),
  }, null, 2)}\n`;
  return { index, manifest, commit };
}

async function verifySnapshot(path, bytes) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    fail("legacy_custody_snapshot_conflict");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("legacy_custody_snapshot_conflict");
  await plainDirectory(path, "legacy_custody_snapshot_conflict");
  const names = ["index.jsonl", "manifest.json", "COMMITTED.json"];
  for (const name of names) {
    const file = join(path, name);
    const info = await lstat(file).catch(() => fail("legacy_custody_snapshot_conflict"));
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail("legacy_custody_snapshot_conflict");
    const actual = await readFile(file, "utf8").catch(() => fail("legacy_custody_snapshot_conflict"));
    const expected = name === "index.jsonl" ? bytes.index : name === "manifest.json" ? bytes.manifest : bytes.commit;
    if (actual !== expected) fail("legacy_custody_snapshot_conflict");
  }
  return true;
}

async function publishSnapshot(binding, invocationId) {
  const snapshotsRoot = join(binding.destination_root, "snapshots");
  await ensurePlainOwnedDirectory(snapshotsRoot, binding.destination_root);
  const finalPath = join(snapshotsRoot, binding.snapshot_id);
  const bytes = snapshotBytes(binding);
  if (await verifySnapshot(finalPath, bytes)) return { published: false, final_path: finalPath, directory_identity: null };
  const temp = join(snapshotsRoot, `.legacy-custody-${invocationId}-${binding.snapshot_id}.partial`);
  let finalCreated = false;
  let finalDirectoryIdentity = null;
  try {
    await mkdir(temp, { recursive: false });
    await writeFile(join(temp, "index.jsonl"), bytes.index, { flag: "wx" });
    await writeFile(join(temp, "manifest.json"), bytes.manifest, { flag: "wx" });
    await writeFile(join(temp, "COMMITTED.json"), bytes.commit, { flag: "wx" });
    await mkdir(finalPath, { recursive: false });
    finalCreated = true;
    const createdInfo = await lstat(finalPath);
    finalDirectoryIdentity = { dev: String(createdInfo.dev), ino: String(createdInfo.ino) };
    await link(join(temp, "index.jsonl"), join(finalPath, "index.jsonl"));
    await link(join(temp, "manifest.json"), join(finalPath, "manifest.json"));
    await link(join(temp, "COMMITTED.json"), join(finalPath, "COMMITTED.json"));
    await removeOwnedTemp(temp, snapshotsRoot, `.legacy-custody-${invocationId}-`, true);
    await verifySnapshot(finalPath, bytes);
    return { published: true, final_path: finalPath, directory_identity: finalDirectoryIdentity, bytes };
  } catch (error) {
    await removeOwnedTemp(temp, snapshotsRoot, `.legacy-custody-${invocationId}-`, true);
    if (finalCreated) {
      await cleanupOwnedSnapshotDirectory({
        published: true,
        final_path: finalPath,
        directory_identity: finalDirectoryIdentity,
        bytes,
      }, snapshotsRoot);
    }
    if (error?.code === "EEXIST" && await verifySnapshot(finalPath, bytes)) {
      return { published: false, final_path: finalPath, directory_identity: null };
    }
    if (error instanceof LegacyMailCustodyError) throw error;
    fail("legacy_custody_snapshot_publish_failed");
  }
}

async function unlinkExactOwnedFile(path, expected) {
  const before = await lstat(path).catch(() => null);
  if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 1) return false;
  const actual = await readFile(path, "utf8").catch(() => null);
  if (actual !== expected) return false;
  const after = await lstat(path).catch(() => null);
  if (!after?.isFile() || after.isSymbolicLink() || !sameIdentity(identity(before), identity(after))) return false;
  await unlink(path).catch(() => {});
  return true;
}

async function cleanupOwnedSnapshotDirectory(publication, snapshotsRoot) {
  if (!publication?.published
    || !publication.directory_identity
    || !publication.bytes
    || !pathInside(snapshotsRoot, publication.final_path)) return;
  const current = await lstat(publication.final_path).catch(() => null);
  if (!current?.isDirectory()
    || current.isSymbolicLink()
    || String(current.dev) !== publication.directory_identity.dev
    || String(current.ino) !== publication.directory_identity.ino) return;
  await unlinkExactOwnedFile(join(publication.final_path, "COMMITTED.json"), publication.bytes.commit);
  await unlinkExactOwnedFile(join(publication.final_path, "manifest.json"), publication.bytes.manifest);
  await unlinkExactOwnedFile(join(publication.final_path, "index.jsonl"), publication.bytes.index);
  await rmdir(publication.final_path).catch(() => {});
}

export async function materializeLegacyMailCustody({ bindingPath, apply = false, approvalRef = null, afterSnapshotPublished = null }) {
  const binding = await loadBinding(bindingPath);
  if (apply && approvalRef !== binding.approval_ref) fail("legacy_custody_approval_mismatch");
  if (!apply && approvalRef !== null) fail("legacy_custody_approval_not_allowed_in_dry_run");
  const inspected = await preflight(binding);
  if (!apply) return safeResult(binding, "dry_run", "ready", inspected, { snapshot_published: false, objects_written: 0 });

  await ensurePlainOwnedDirectory(binding.destination_root, binding.destination_root);
  const invocationId = randomUUID().replaceAll("-", "");
  let objectsWritten = 0;
  const seen = new Set();
  for (const entry of inspected.inspected) {
    if (seen.has(entry.sha256)) continue;
    seen.add(entry.sha256);
    objectsWritten += Number(await publishObject(binding, entry, invocationId));
  }
  const publication = await publishSnapshot(binding, invocationId);
  let verified;
  try {
    if (afterSnapshotPublished !== null) {
      if (typeof afterSnapshotPublished !== "function") fail("legacy_custody_test_hook_invalid");
      await afterSnapshotPublished({ snapshot_published: publication.published });
    }
    verified = await preflight(binding);
  } catch (error) {
    await cleanupOwnedSnapshotDirectory(publication, join(binding.destination_root, "snapshots"));
    throw error;
  }
  return safeResult(binding, "apply", "committed", verified, { snapshot_published: publication.published, objects_written: objectsWritten });
}

function parseArgs(argv) {
  const options = { bindingPath: null, apply: false, approvalRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--binding") options.bindingPath = argv[++index] ?? null;
    else if (arg === "--approval-ref") options.approvalRef = argv[++index] ?? null;
    else if (arg === "--apply") options.apply = true;
    else fail("legacy_custody_cli_argument_invalid");
  }
  if (!options.bindingPath) fail("legacy_custody_binding_required");
  return options;
}

export async function runLegacyMailCustodyCli(argv = process.argv.slice(2)) {
  try {
    const result = await materializeLegacyMailCustody(parseArgs(argv));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof LegacyMailCustodyError ? error.code : "legacy_custody_unexpected_failure";
    process.stderr.write(`${JSON.stringify({ schema_version: RESULT_SCHEMA, status: "blocked", error_code: code })}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runLegacyMailCustodyCli();
}
