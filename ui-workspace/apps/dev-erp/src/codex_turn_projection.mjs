import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

export const CODEX_TURN_PROJECTION_SCHEMA = "dev_erp.codex_turn_projection.v1";
export const CODEX_TURN_PROJECTION_DESCRIPTOR_SCHEMA = "dev_erp.codex_turn_projection_descriptor.v1";
export const CODEX_TURN_PROJECTION_RECEIPT_SCHEMA = "dev_erp.codex_turn_projection_receipt.v1";

const MANIFEST_NAME = ".projection-manifest.json";
const OPERATION_LOCK_NAME = ".projection-operation-lock";
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ATTACHMENT_ID_RE = /^att_[A-Za-z0-9_-]{32}$/;
const PROJECTION_ID_RE = /^prj_[A-Za-z0-9_-]{32}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const SAFE_EXTENSION_RE = /^\.[A-Za-z0-9]{1,16}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DEVICE_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const ATTACHMENT_TYPES = new Set(["localImage", "localFile"]);
const ATTACHMENT_KEYS = new Set([
  "attachment_id",
  "name",
  "size",
  "sha256",
  "type",
  "source_path",
]);
const FILE_KEYS = new Set([
  "logical_path",
  "attachment_id",
  "name",
  "size",
  "sha256",
  "type",
]);
const MANIFEST_KEYS = new Set([
  "schema",
  "projection_id",
  "item_id",
  "project_id",
  "workspace_id",
  "workspace_revision",
  "workspace_root_fingerprint",
  "files",
]);
const DESCRIPTOR_KEYS = new Set([
  "schema",
  "projection_id",
  "item_id",
  "project_id",
  "workspace_id",
  "workspace_revision",
  "workspace_root_fingerprint",
  "revision",
  "manifest_sha256",
  "file_count",
  "total_bytes",
]);

export class CodexTurnProjectionError extends Error {
  constructor(code) {
    super(code);
    this.name = "CodexTurnProjectionError";
    this.code = code;
  }
}

function fail(code) {
  throw new CodexTurnProjectionError(code);
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value, code) {
  if (!isRecord(value)) fail(code);
}

function assertExactKeys(value, keys, code) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) fail(code);
  }
}

function cleanId(value, regex, code) {
  const text = String(value ?? "");
  if (!regex.test(text)) fail(code);
  return text;
}

function cleanHash(value, code) {
  const text = String(value ?? "");
  if (!SHA256_RE.test(text)) fail(code);
  return text;
}

function cleanProjectId(value) {
  const id = cleanId(value, ID_RE, "projection_project_id_invalid");
  if (DEVICE_NAME_RE.test(id) || /[. ]$/.test(id)) fail("projection_project_id_invalid");
  return id;
}

function cleanFilename(value) {
  const name = String(value ?? "");
  if (!name || name !== name.trim() || name.length > 255
      || name === "." || name === ".."
      || name.includes("/") || name.includes("\\") || name.includes(":")
      || CONTROL_RE.test(name) || /[. ]$/.test(name) || DEVICE_NAME_RE.test(name)
      || posix.basename(name) !== name || win32.basename(name) !== name) {
    fail("projection_attachment_name_invalid");
  }
  return name;
}

function pathInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function comparablePath(value) {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function statScalar(value) {
  if (typeof value === "bigint") return value.toString(10);
  return Number.isSafeInteger(value) ? String(value) : null;
}

function filesystemIdentity(stat) {
  const dev = statScalar(stat?.dev);
  const ino = statScalar(stat?.ino);
  if (dev === null || ino === null || (dev === "0" && ino === "0")) return null;
  return `${dev}:${ino}`;
}

function statsStable(before, after) {
  if (!before || !after || before.size !== after.size) return false;
  const beforeIdentity = filesystemIdentity(before);
  const afterIdentity = filesystemIdentity(after);
  if (beforeIdentity && afterIdentity && beforeIdentity !== afterIdentity) return false;
  for (const key of ["mtimeMs", "ctimeMs"]) {
    if (Number.isFinite(before[key]) && Number.isFinite(after[key]) && before[key] !== after[key]) return false;
  }
  return true;
}

function isSingleLinkFile(stat) {
  return typeof stat?.isFile === "function" && stat.isFile()
    && (stat.nlink === 1 || stat.nlink === 1n);
}

async function assertPlainDirectoryChain(path, code) {
  const lexical = resolve(path);
  const chain = [];
  for (let current = lexical;; current = dirname(current)) {
    chain.push(current);
    const parent = dirname(current);
    if (parent === current) break;
  }
  for (const candidate of chain.reverse()) {
    let link;
    try {
      link = await fs.lstat(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      fail(code);
    }
    if (!link.isDirectory() || link.isSymbolicLink()) fail(code);
    let real;
    try { real = await fs.realpath(candidate); }
    catch { fail(code); }
    if (!samePath(real, candidate)) fail(code);
  }
}

async function pinDirectory(path, { create = false, code = "projection_root_invalid" } = {}) {
  const raw = String(path ?? "");
  if (!raw || raw.includes("\0") || !isAbsolute(raw)) fail(code);
  const lexical = resolve(raw);
  try {
    await assertPlainDirectoryChain(lexical, code);
    if (create) await fs.mkdir(lexical, { recursive: true, mode: 0o700 });
    const link = await fs.lstat(lexical);
    if (!link.isDirectory() || link.isSymbolicLink()) fail(code);
    const real = await fs.realpath(lexical);
    if (!samePath(real, lexical)) fail(code);
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) fail(code);
    return Object.freeze({ lexical, real, identity: filesystemIdentity(stat) });
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail(code);
  }
}

async function acquireOperationLock(root) {
  const lockPath = join(root.real, OPERATION_LOCK_NAME);
  if (!pathInside(root.real, lockPath)) fail("projection_lock_path_invalid");
  try {
    await fs.mkdir(lockPath, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("projection_root_busy");
    fail("projection_lock_failed");
  }
  const lock = await pinDirectory(lockPath, { code: "projection_lock_unsafe" });
  if (!samePath(lock.real, lockPath) || !pathInside(root.real, lock.real)) fail("projection_lock_unsafe");
  return lock;
}

async function assertProjectionNamespace(root, projectId, revision, { allowOperationLock = false } = {}) {
  let rootEntries;
  try { rootEntries = await fs.readdir(root.real, { withFileTypes: true }); }
  catch { fail("projection_root_unavailable"); }
  const expectedRootNames = [projectId, ...(allowOperationLock ? [OPERATION_LOCK_NAME] : [])].sort();
  const actualRootNames = rootEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualRootNames) !== JSON.stringify(expectedRootNames)) {
    fail("projection_root_not_single_active");
  }
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) fail("projection_root_entry_unsafe");
  }
  const projectPath = join(root.real, projectId);
  let projectEntries;
  try { projectEntries = await fs.readdir(projectPath, { withFileTypes: true }); }
  catch { fail("projection_project_directory_invalid"); }
  if (projectEntries.length !== 1 || projectEntries[0].name !== revision
      || !projectEntries[0].isDirectory() || projectEntries[0].isSymbolicLink()) {
    fail("projection_project_not_single_revision");
  }
}

function normalizeAttachment(input) {
  assertRecord(input, "projection_attachment_invalid");
  assertExactKeys(input, ATTACHMENT_KEYS, "projection_attachment_unknown_field");
  const attachmentId = cleanId(input.attachment_id, ATTACHMENT_ID_RE, "projection_attachment_id_invalid");
  const name = cleanFilename(input.name);
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_ATTACHMENT_BYTES) {
    fail("projection_attachment_size_invalid");
  }
  const hash = cleanHash(input.sha256, "projection_attachment_sha256_invalid");
  const type = String(input.type ?? "");
  if (!ATTACHMENT_TYPES.has(type)) fail("projection_attachment_type_invalid");
  const sourcePath = String(input.source_path ?? "");
  if (!sourcePath || sourcePath.includes("\0") || !isAbsolute(sourcePath)) {
    fail("projection_attachment_source_invalid");
  }
  const extension = extname(name).toLowerCase();
  const safeExtension = extension && SAFE_EXTENSION_RE.test(extension) ? extension : "";
  return Object.freeze({
    attachment_id: attachmentId,
    name,
    size: input.size,
    sha256: hash,
    type,
    source_path: resolve(sourcePath),
    logical_path: `attachments/${attachmentId}${safeExtension}`,
  });
}

function normalizeInputs({
  itemId,
  projectId,
  workspaceId,
  workspaceRevision,
  workspaceRootFingerprint,
  attachments,
} = {}) {
  const rows = attachments ?? [];
  if (!Array.isArray(rows) || rows.length > MAX_ATTACHMENTS) fail("projection_attachments_invalid");
  const normalized = rows.map(normalizeAttachment).sort((left, right) => (
    left.attachment_id.localeCompare(right.attachment_id)
  ));
  const seen = new Set();
  let totalBytes = 0;
  for (const row of normalized) {
    if (seen.has(row.attachment_id)) fail("projection_attachment_duplicate");
    seen.add(row.attachment_id);
    totalBytes += row.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) fail("projection_total_size_invalid");
  }
  return Object.freeze({
    item_id: cleanId(itemId, ITEM_ID_RE, "projection_item_id_invalid"),
    project_id: cleanProjectId(projectId),
    workspace_id: cleanId(workspaceId, ID_RE, "projection_workspace_id_invalid"),
    workspace_revision: cleanHash(workspaceRevision, "projection_workspace_revision_invalid"),
    workspace_root_fingerprint: cleanHash(workspaceRootFingerprint, "projection_workspace_root_fingerprint_invalid"),
    attachments: Object.freeze(normalized),
    total_bytes: totalBytes,
  });
}

function manifestFile(row) {
  return Object.freeze({
    logical_path: row.logical_path,
    attachment_id: row.attachment_id,
    name: row.name,
    size: row.size,
    sha256: row.sha256,
    type: row.type,
  });
}

function buildManifest(input, projectionId) {
  return Object.freeze({
    schema: CODEX_TURN_PROJECTION_SCHEMA,
    projection_id: projectionId,
    item_id: input.item_id,
    project_id: input.project_id,
    workspace_id: input.workspace_id,
    workspace_revision: input.workspace_revision,
    workspace_root_fingerprint: input.workspace_root_fingerprint,
    files: Object.freeze(input.attachments.map(manifestFile)),
  });
}

function manifestBytes(manifest) {
  return Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
}

function descriptorFromManifest(manifest, revision) {
  const totalBytes = manifest.files.reduce((sum, row) => sum + row.size, 0);
  return Object.freeze({
    schema: CODEX_TURN_PROJECTION_DESCRIPTOR_SCHEMA,
    projection_id: manifest.projection_id,
    item_id: manifest.item_id,
    project_id: manifest.project_id,
    workspace_id: manifest.workspace_id,
    workspace_revision: manifest.workspace_revision,
    workspace_root_fingerprint: manifest.workspace_root_fingerprint,
    revision,
    manifest_sha256: revision,
    file_count: manifest.files.length,
    total_bytes: totalBytes,
  });
}

function normalizeManifest(value) {
  assertRecord(value, "projection_manifest_invalid");
  assertExactKeys(value, MANIFEST_KEYS, "projection_manifest_unknown_field");
  if (value.schema !== CODEX_TURN_PROJECTION_SCHEMA) fail("projection_manifest_schema_invalid");
  const normalized = {
    schema: CODEX_TURN_PROJECTION_SCHEMA,
    projection_id: cleanId(value.projection_id, PROJECTION_ID_RE, "projection_id_invalid"),
    item_id: cleanId(value.item_id, ITEM_ID_RE, "projection_item_id_invalid"),
    project_id: cleanProjectId(value.project_id),
    workspace_id: cleanId(value.workspace_id, ID_RE, "projection_workspace_id_invalid"),
    workspace_revision: cleanHash(value.workspace_revision, "projection_workspace_revision_invalid"),
    workspace_root_fingerprint: cleanHash(value.workspace_root_fingerprint, "projection_workspace_root_fingerprint_invalid"),
  };
  if (!Array.isArray(value.files) || value.files.length > MAX_ATTACHMENTS) fail("projection_manifest_files_invalid");
  const seen = new Set();
  let totalBytes = 0;
  const files = value.files.map((row) => {
    assertRecord(row, "projection_manifest_file_invalid");
    assertExactKeys(row, FILE_KEYS, "projection_manifest_file_unknown_field");
    const attachmentId = cleanId(row.attachment_id, ATTACHMENT_ID_RE, "projection_attachment_id_invalid");
    const name = cleanFilename(row.name);
    const extension = extname(name).toLowerCase();
    const safeExtension = extension && SAFE_EXTENSION_RE.test(extension) ? extension : "";
    const expectedLogical = `attachments/${attachmentId}${safeExtension}`;
    if (row.logical_path !== expectedLogical || posix.normalize(row.logical_path) !== row.logical_path) {
      fail("projection_logical_path_invalid");
    }
    if (seen.has(attachmentId)) fail("projection_attachment_duplicate");
    seen.add(attachmentId);
    if (!Number.isSafeInteger(row.size) || row.size < 1 || row.size > MAX_ATTACHMENT_BYTES) {
      fail("projection_attachment_size_invalid");
    }
    totalBytes += row.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) fail("projection_total_size_invalid");
    const type = String(row.type ?? "");
    if (!ATTACHMENT_TYPES.has(type)) fail("projection_attachment_type_invalid");
    return Object.freeze({
      logical_path: expectedLogical,
      attachment_id: attachmentId,
      name,
      size: row.size,
      sha256: cleanHash(row.sha256, "projection_attachment_sha256_invalid"),
      type,
    });
  });
  const sorted = [...files].sort((left, right) => left.attachment_id.localeCompare(right.attachment_id));
  if (JSON.stringify(files) !== JSON.stringify(sorted)) fail("projection_manifest_order_invalid");
  return Object.freeze({ ...normalized, files: Object.freeze(files) });
}

function normalizeDescriptor(value) {
  assertRecord(value, "projection_descriptor_invalid");
  assertExactKeys(value, DESCRIPTOR_KEYS, "projection_descriptor_unknown_field");
  if (value.schema !== CODEX_TURN_PROJECTION_DESCRIPTOR_SCHEMA) fail("projection_descriptor_schema_invalid");
  const descriptor = {
    schema: CODEX_TURN_PROJECTION_DESCRIPTOR_SCHEMA,
    projection_id: cleanId(value.projection_id, PROJECTION_ID_RE, "projection_id_invalid"),
    item_id: cleanId(value.item_id, ITEM_ID_RE, "projection_item_id_invalid"),
    project_id: cleanProjectId(value.project_id),
    workspace_id: cleanId(value.workspace_id, ID_RE, "projection_workspace_id_invalid"),
    workspace_revision: cleanHash(value.workspace_revision, "projection_workspace_revision_invalid"),
    workspace_root_fingerprint: cleanHash(value.workspace_root_fingerprint, "projection_workspace_root_fingerprint_invalid"),
    revision: cleanHash(value.revision, "projection_revision_invalid"),
    manifest_sha256: cleanHash(value.manifest_sha256, "projection_manifest_sha256_invalid"),
  };
  if (descriptor.manifest_sha256 !== descriptor.revision) fail("projection_manifest_revision_mismatch");
  if (!Number.isSafeInteger(value.file_count) || value.file_count < 0 || value.file_count > MAX_ATTACHMENTS) {
    fail("projection_file_count_invalid");
  }
  if (!Number.isSafeInteger(value.total_bytes) || value.total_bytes < 0 || value.total_bytes > MAX_TOTAL_BYTES) {
    fail("projection_total_size_invalid");
  }
  return Object.freeze({ ...descriptor, file_count: value.file_count, total_bytes: value.total_bytes });
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, null);
    if (!Number.isInteger(result?.bytesWritten) || result.bytesWritten < 1) fail("projection_target_write_failed");
    offset += result.bytesWritten;
  }
}

async function copyVerifiedAttachment(row, target) {
  let sourceHandle;
  let targetHandle;
  try {
    const lexicalBefore = await fs.lstat(row.source_path);
    if (!isSingleLinkFile(lexicalBefore)) fail("projection_source_link_unsafe");
    const sourceReal = await fs.realpath(row.source_path);
    sourceHandle = await fs.open(sourceReal, "r");
    const before = await sourceHandle.stat();
    if (!isSingleLinkFile(before) || !statsStable(lexicalBefore, before)) fail("projection_source_link_unsafe");
    if (before.size !== row.size) fail("projection_source_size_mismatch");

    targetHandle = await fs.open(target, "wx", 0o400);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let measured = 0;
    for (;;) {
      const result = await sourceHandle.read(buffer, 0, buffer.length, null);
      const bytesRead = Number(result?.bytesRead ?? 0);
      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) fail("projection_source_read_failed");
      if (bytesRead === 0) break;
      measured += bytesRead;
      if (measured > row.size || measured > MAX_ATTACHMENT_BYTES) fail("projection_source_size_mismatch");
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      await writeAll(targetHandle, chunk);
    }
    await targetHandle.sync();
    const measuredHash = hash.digest("hex");
    if (measured !== row.size) fail("projection_source_size_mismatch");
    if (measuredHash !== row.sha256) fail("projection_source_hash_mismatch");

    const afterHandle = await sourceHandle.stat();
    const lexicalAfter = await fs.lstat(row.source_path);
    const finalReal = await fs.realpath(row.source_path);
    if (!isSingleLinkFile(afterHandle) || !isSingleLinkFile(lexicalAfter)
        || !statsStable(before, afterHandle) || !statsStable(before, lexicalAfter)
        || !samePath(sourceReal, finalReal)) {
      fail("projection_source_changed");
    }
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail("projection_source_unavailable");
  } finally {
    try { await targetHandle?.close(); } catch {}
    try { await sourceHandle?.close(); } catch {}
  }
}

async function readAndHashPlainFile(path, { expectedSize, expectedHash, root }) {
  let handle;
  try {
    const lexical = await fs.lstat(path);
    if (!isSingleLinkFile(lexical)) fail("projection_file_link_unsafe");
    const real = await fs.realpath(path);
    if (!pathInside(root, real)) fail("projection_file_escape");
    handle = await fs.open(real, "r");
    const before = await handle.stat();
    if (!isSingleLinkFile(before) || !statsStable(lexical, before)) fail("projection_file_link_unsafe");
    if (before.size !== expectedSize) fail("projection_file_size_mismatch");
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let size = 0;
    for (;;) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      const bytesRead = Number(result?.bytesRead ?? 0);
      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) fail("projection_file_read_failed");
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > expectedSize || size > MAX_ATTACHMENT_BYTES) fail("projection_file_size_mismatch");
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    const lexicalAfter = await fs.lstat(path);
    if (!isSingleLinkFile(after) || !isSingleLinkFile(lexicalAfter)
        || !statsStable(before, after) || !statsStable(before, lexicalAfter)) {
      fail("projection_file_changed");
    }
    if (size !== expectedSize) fail("projection_file_size_mismatch");
    if (hash.digest("hex") !== expectedHash) fail("projection_file_hash_mismatch");
    return real;
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail("projection_file_unavailable");
  } finally {
    try { await handle?.close(); } catch {}
  }
}

async function readVerifiedManifest(path, { root, expectedHash }) {
  let handle;
  try {
    const lexical = await fs.lstat(path);
    if (!isSingleLinkFile(lexical) || lexical.size < 2 || lexical.size > MAX_MANIFEST_BYTES) {
      fail("projection_manifest_link_unsafe");
    }
    const real = await fs.realpath(path);
    if (!pathInside(root, real)) fail("projection_manifest_escape");
    handle = await fs.open(real, "r");
    const before = await handle.stat();
    if (!isSingleLinkFile(before) || !statsStable(lexical, before)) fail("projection_manifest_link_unsafe");
    const chunks = [];
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(16 * 1024);
    let size = 0;
    for (;;) {
      const result = await handle.read(buffer, 0, buffer.length, null);
      const bytesRead = Number(result?.bytesRead ?? 0);
      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) {
        fail("projection_manifest_read_failed");
      }
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > MAX_MANIFEST_BYTES) fail("projection_manifest_size_invalid");
      const chunk = Buffer.from(buffer.subarray(0, bytesRead));
      chunks.push(chunk);
      hash.update(chunk);
    }
    const after = await handle.stat();
    const lexicalAfter = await fs.lstat(path);
    if (!isSingleLinkFile(after) || !isSingleLinkFile(lexicalAfter)
        || !statsStable(before, after) || !statsStable(before, lexicalAfter)) {
      fail("projection_manifest_changed");
    }
    if (size !== before.size) fail("projection_manifest_size_invalid");
    if (hash.digest("hex") !== expectedHash) fail("projection_manifest_hash_mismatch");
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail("projection_manifest_unavailable");
  } finally {
    try { await handle?.close(); } catch {}
  }
}

async function inspectProjectionDirectory({ projectionRoot, descriptor, allowOperationLock = false }) {
  const normalizedDescriptor = normalizeDescriptor(descriptor);
  const root = await pinDirectory(projectionRoot, { code: "projection_root_invalid" });
  await assertProjectionNamespace(root, normalizedDescriptor.project_id, normalizedDescriptor.revision, {
    allowOperationLock,
  });
  const projectPath = join(root.real, normalizedDescriptor.project_id);
  if (!pathInside(root.real, projectPath)) fail("projection_project_path_invalid");
  const project = await pinDirectory(projectPath, { code: "projection_project_directory_invalid" });
  if (!pathInside(root.real, project.real)) fail("projection_project_path_invalid");
  const projectionPath = join(project.real, normalizedDescriptor.revision);
  if (!pathInside(project.real, projectionPath)) fail("projection_path_invalid");
  const projection = await pinDirectory(projectionPath, { code: "projection_unavailable" });
  if (!samePath(projection.real, projectionPath) || !pathInside(project.real, projection.real)) {
    fail("projection_path_retargeted");
  }

  const rawManifest = await readVerifiedManifest(join(projection.real, MANIFEST_NAME), {
    root: projection.real,
    expectedHash: normalizedDescriptor.revision,
  });
  let parsed;
  try { parsed = JSON.parse(rawManifest.toString("utf8")); }
  catch { fail("projection_manifest_json_invalid"); }
  const manifest = normalizeManifest(parsed);
  const expectedDescriptor = descriptorFromManifest(manifest, normalizedDescriptor.revision);
  if (JSON.stringify(expectedDescriptor) !== JSON.stringify(normalizedDescriptor)) {
    fail("projection_descriptor_mismatch");
  }

  let rootEntries;
  let attachmentEntries;
  const attachmentDir = join(projection.real, "attachments");
  try {
    rootEntries = await fs.readdir(projection.real, { withFileTypes: true });
    attachmentEntries = await fs.readdir(attachmentDir, { withFileTypes: true });
  } catch {
    fail("projection_tree_invalid");
  }
  const rootNames = rootEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(rootNames) !== JSON.stringify([MANIFEST_NAME, "attachments"].sort())) {
    fail("projection_tree_unexpected_entry");
  }
  const attachmentDirectoryEntry = rootEntries.find((entry) => entry.name === "attachments");
  const manifestEntry = rootEntries.find((entry) => entry.name === MANIFEST_NAME);
  if (!attachmentDirectoryEntry?.isDirectory() || attachmentDirectoryEntry.isSymbolicLink()
      || !manifestEntry?.isFile() || manifestEntry.isSymbolicLink()) {
    fail("projection_tree_link_unsafe");
  }
  const expectedNames = manifest.files.map((row) => basename(row.logical_path)).sort();
  const actualNames = attachmentEntries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)
      || attachmentEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    fail("projection_tree_unexpected_entry");
  }

  const internalFiles = [];
  for (const row of manifest.files) {
    const target = join(projection.real, ...row.logical_path.split("/"));
    if (!pathInside(projection.real, target)) fail("projection_file_escape");
    const real = await readAndHashPlainFile(target, {
      expectedSize: row.size,
      expectedHash: row.sha256,
      root: projection.real,
    });
    internalFiles.push(Object.freeze({ ...row, path: real }));
  }
  await assertProjectionNamespace(root, normalizedDescriptor.project_id, normalizedDescriptor.revision, {
    allowOperationLock,
  });
  return Object.freeze({
    descriptor: normalizedDescriptor,
    manifest,
    internal: Object.freeze({
      path: projection.real,
      project_root: project.real,
      projection_identity: projection.identity,
      files: Object.freeze(internalFiles),
    }),
  });
}

export async function materializeCodexTurnProjection({
  projectionRoot,
  itemId,
  projectId,
  workspaceId,
  workspaceRevision,
  workspaceRootFingerprint,
  attachments,
} = {}) {
  const input = normalizeInputs({
    itemId,
    projectId,
    workspaceId,
    workspaceRevision,
    workspaceRootFingerprint,
    attachments,
  });
  const root = await pinDirectory(projectionRoot, { create: true, code: "projection_root_invalid" });
  const projectionId = `prj_${randomBytes(24).toString("base64url")}`;
  const manifest = buildManifest(input, projectionId);
  const bytes = manifestBytes(manifest);
  const revision = sha256(bytes);
  const descriptor = descriptorFromManifest(manifest, revision);
  const lock = await acquireOperationLock(root);
  const stagedProjectPath = join(lock.real, input.project_id);
  const stagedProjectionPath = join(stagedProjectPath, revision);
  const finalProjectPath = join(root.real, input.project_id);
  if (!pathInside(lock.real, stagedProjectPath) || !pathInside(stagedProjectPath, stagedProjectionPath)
      || !pathInside(root.real, finalProjectPath)) fail("projection_path_invalid");

  let projectPublished = false;
  let lockReleased = false;
  try {
    let initialEntries;
    try { initialEntries = await fs.readdir(root.real, { withFileTypes: true }); }
    catch { fail("projection_root_unavailable"); }
    if (initialEntries.length !== 1 || initialEntries[0].name !== OPERATION_LOCK_NAME
        || !initialEntries[0].isDirectory() || initialEntries[0].isSymbolicLink()) {
      fail("projection_root_not_empty");
    }
    await fs.mkdir(join(stagedProjectionPath, "attachments"), { recursive: true, mode: 0o700 });
    const temporary = await pinDirectory(stagedProjectionPath, { code: "projection_temporary_directory_invalid" });
    if (!samePath(temporary.real, stagedProjectionPath) || !pathInside(lock.real, temporary.real)) {
      fail("projection_temporary_directory_retargeted");
    }
    for (const row of input.attachments) {
      const target = join(temporary.real, ...row.logical_path.split("/"));
      if (!pathInside(temporary.real, target)) fail("projection_file_escape");
      await copyVerifiedAttachment(row, target);
      await readAndHashPlainFile(target, {
        expectedSize: row.size,
        expectedHash: row.sha256,
        root: temporary.real,
      });
    }
    const manifestPath = join(temporary.real, MANIFEST_NAME);
    let manifestHandle;
    try {
      manifestHandle = await fs.open(manifestPath, "wx", 0o400);
      await writeAll(manifestHandle, bytes);
      await manifestHandle.sync();
    } catch (error) {
      if (error instanceof CodexTurnProjectionError) throw error;
      fail("projection_manifest_write_failed");
    } finally {
      try { await manifestHandle?.close(); } catch {}
    }
    await fs.rename(stagedProjectPath, finalProjectPath).catch((error) => {
      if (new Set(["EEXIST", "ENOTEMPTY", "EPERM"]).has(error?.code)) fail("projection_collision");
      fail("projection_publish_failed");
    });
    projectPublished = true;
    try { await fs.rmdir(lock.real); }
    catch { fail("projection_lock_release_failed"); }
    lockReleased = true;
    const opened = await inspectProjectionDirectory({ projectionRoot: root.real, descriptor });
    if (opened.descriptor.revision !== revision) fail("projection_publish_verification_failed");
    return descriptor;
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail("projection_materialize_failed");
  } finally {
    if (!projectPublished && !lockReleased) {
      try { await fs.rm(lock.real, { recursive: true, force: true }); } catch {}
    }
  }
}

export async function openVerifiedCodexTurnProjection({ projectionRoot, descriptor } = {}) {
  const inspected = await inspectProjectionDirectory({ projectionRoot, descriptor });
  const result = {
    ok: true,
    descriptor: inspected.descriptor,
    manifest: inspected.manifest,
  };
  Object.defineProperty(result, "internal", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: inspected.internal,
  });
  return Object.freeze(result);
}

export async function removeCodexTurnProjection({ projectionRoot, descriptor } = {}) {
  const normalizedDescriptor = normalizeDescriptor(descriptor);
  const root = await pinDirectory(projectionRoot, { code: "projection_root_invalid" });
  const lock = await acquireOperationLock(root);
  let lockReleased = false;
  try {
    const inspected = await inspectProjectionDirectory({
      projectionRoot: root.real,
      descriptor: normalizedDescriptor,
      allowOperationLock: true,
    });
    const deletingPath = join(
      inspected.internal.project_root,
      `.${inspected.descriptor.revision}.${randomBytes(12).toString("hex")}.deleting`,
    );
    if (!pathInside(inspected.internal.project_root, deletingPath)) fail("projection_cleanup_path_invalid");
    await fs.rename(inspected.internal.path, deletingPath);
    const moved = await pinDirectory(deletingPath, { code: "projection_cleanup_retargeted" });
    if (!samePath(moved.real, deletingPath) || !pathInside(inspected.internal.project_root, moved.real)
        || (inspected.internal.projection_identity && moved.identity
          && inspected.internal.projection_identity !== moved.identity)) {
      fail("projection_cleanup_retargeted");
    }
    await fs.rm(moved.real, { recursive: true, force: false });
    try { await fs.rmdir(inspected.internal.project_root); }
    catch { fail("projection_cleanup_project_not_empty"); }
    try { await fs.rmdir(lock.real); }
    catch { fail("projection_lock_release_failed"); }
    lockReleased = true;
    let remaining;
    try { remaining = await fs.readdir(root.real); }
    catch { fail("projection_root_unavailable"); }
    if (remaining.length !== 0) fail("projection_cleanup_root_not_empty");
    return Object.freeze({
      ok: true,
      removed: true,
      receipt: publicCodexTurnProjectionReceipt(inspected.descriptor),
    });
  } catch (error) {
    if (error instanceof CodexTurnProjectionError) throw error;
    fail("projection_cleanup_failed");
  } finally {
    if (!lockReleased) {
      try { await fs.rmdir(lock.real); } catch {}
    }
  }
}

export function publicCodexTurnProjectionReceipt(descriptor) {
  const row = normalizeDescriptor(descriptor);
  return Object.freeze({
    schema: CODEX_TURN_PROJECTION_RECEIPT_SCHEMA,
    projection_id: row.projection_id,
    item_id: row.item_id,
    project_id: row.project_id,
    workspace_id: row.workspace_id,
    workspace_revision: row.workspace_revision,
    workspace_root_fingerprint: row.workspace_root_fingerprint,
    projection_revision: row.revision,
    manifest_sha256: row.manifest_sha256,
    file_count: row.file_count,
    total_bytes: row.total_bytes,
  });
}
