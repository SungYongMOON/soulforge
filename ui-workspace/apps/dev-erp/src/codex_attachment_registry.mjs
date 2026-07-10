import { createHash, randomBytes } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { posix, win32 } from "node:path";

export const CODEX_ATTACHMENT_MANIFEST_SCHEMA = "dev_erp.codex_attachment_manifest.v1";
export const DEFAULT_ATTACHMENT_MAX_BYTES = 64 * 1024 * 1024;

const ATTACHMENT_ID_RE = /^att_[A-Za-z0-9_-]{32}$/;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ATTACHMENT_TYPES = new Set(["localImage", "localFile"]);
const RECORD_KEYS = new Set([
  "attachment_id",
  "item_id",
  "name",
  "stored_name",
  "size",
  "sha256",
  "type",
]);
const MANIFEST_KEYS = new Set(["schema", "item_id", "attachments"]);
const CLIENT_REFERENCE_KEYS = new Set(["attachment_id", "name", "size", "type"]);
const CLIENT_PATH_KEYS = new Set([
  "absolute_path",
  "cwd",
  "dir",
  "directory",
  "file_path",
  "local_path",
  "path",
  "realpath",
  "root",
  "stored_name",
  "workspace_root",
]);
const WINDOWS_DEVICE_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const WINDOWS_DEVICE_PATH_RE = /^(?:\\\\[?.]\\|\/\/[?.]\/)/;

export class AttachmentRegistryError extends Error {
  constructor(code) {
    super(code);
    this.name = "AttachmentRegistryError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, code) {
  if (!isPlainObject(value)) throw new AttachmentRegistryError(code);
}

function assertExactKeys(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new AttachmentRegistryError(code);
  }
}

function normalizeItemId(value) {
  const itemId = String(value ?? "");
  if (!ITEM_ID_RE.test(itemId)) throw new AttachmentRegistryError("attachment_item_id_invalid");
  return itemId;
}

function normalizeFilename(value, field) {
  const filename = String(value ?? "");
  if (!filename || filename.length > 255 || filename !== filename.trim()) {
    throw new AttachmentRegistryError(`${field}_invalid`);
  }
  if (
    filename === "."
    || filename === ".."
    || filename.includes("/")
    || filename.includes("\\")
    || filename.includes(":")
    || /[\x00-\x1f\x7f]/.test(filename)
    || /[. ]$/.test(filename)
    || WINDOWS_DEVICE_NAME_RE.test(filename)
    || posix.basename(filename) !== filename
    || win32.basename(filename) !== filename
  ) {
    throw new AttachmentRegistryError(`${field}_invalid`);
  }
  return filename;
}

export function validateAttachmentFilename(value) {
  return normalizeFilename(value, "attachment_name");
}

function normalizeMaxBytes(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AttachmentRegistryError("attachment_max_bytes_invalid");
  }
  return value;
}

function normalizeRecord(input, { maxBytes = DEFAULT_ATTACHMENT_MAX_BYTES } = {}) {
  assertPlainObject(input, "attachment_record_invalid");
  assertExactKeys(input, RECORD_KEYS, "attachment_record_unknown_field");
  const limit = normalizeMaxBytes(maxBytes);
  const attachmentId = validateAttachmentId(input.attachment_id);
  const itemId = normalizeItemId(input.item_id);
  const name = normalizeFilename(input.name, "attachment_name");
  const storedName = normalizeFilename(input.stored_name, "attachment_stored_name");
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > limit) {
    throw new AttachmentRegistryError("attachment_size_invalid");
  }
  const sha256 = String(input.sha256 ?? "");
  if (!SHA256_RE.test(sha256)) throw new AttachmentRegistryError("attachment_sha256_invalid");
  const type = String(input.type ?? "");
  if (!ATTACHMENT_TYPES.has(type)) throw new AttachmentRegistryError("attachment_type_invalid");
  return Object.freeze({
    attachment_id: attachmentId,
    item_id: itemId,
    name,
    stored_name: storedName,
    size: input.size,
    sha256,
    type,
  });
}

export function createOpaqueAttachmentId() {
  return `att_${randomBytes(24).toString("base64url")}`;
}

export function validateAttachmentId(value) {
  const attachmentId = String(value ?? "");
  if (!ATTACHMENT_ID_RE.test(attachmentId)) {
    throw new AttachmentRegistryError("attachment_id_invalid");
  }
  return attachmentId;
}

export function createAttachmentManifestRecord(input, options = {}) {
  return normalizeRecord(input, options);
}

export function parseAttachmentManifest(document, options = {}) {
  assertPlainObject(document, "attachment_manifest_invalid");
  assertExactKeys(document, MANIFEST_KEYS, "attachment_manifest_unknown_field");
  if (document.schema !== CODEX_ATTACHMENT_MANIFEST_SCHEMA) {
    throw new AttachmentRegistryError("attachment_manifest_schema_invalid");
  }
  const itemId = normalizeItemId(document.item_id);
  if (!Array.isArray(document.attachments)) {
    throw new AttachmentRegistryError("attachment_manifest_attachments_invalid");
  }
  const seen = new Set();
  const attachments = document.attachments.map((input) => {
    const record = normalizeRecord(input, options);
    if (record.item_id !== itemId) throw new AttachmentRegistryError("attachment_manifest_item_mismatch");
    if (seen.has(record.attachment_id)) throw new AttachmentRegistryError("attachment_manifest_duplicate_id");
    seen.add(record.attachment_id);
    return record;
  });
  return Object.freeze({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id: itemId,
    attachments: Object.freeze(attachments),
  });
}

export function parseAttachmentManifestJson(text, options = {}) {
  let document;
  try {
    document = JSON.parse(String(text ?? ""));
  } catch {
    throw new AttachmentRegistryError("attachment_manifest_json_invalid");
  }
  return parseAttachmentManifest(document, options);
}

export function createAttachmentManifest({ item_id, attachments = [] } = {}, options = {}) {
  return parseAttachmentManifest({
    schema: CODEX_ATTACHMENT_MANIFEST_SCHEMA,
    item_id,
    attachments,
  }, options);
}

export function appendAttachmentManifestRecord(manifest, input, options = {}) {
  const current = parseAttachmentManifest(manifest, options);
  const record = normalizeRecord(input, options);
  if (record.item_id !== current.item_id) {
    throw new AttachmentRegistryError("attachment_manifest_item_mismatch");
  }
  if (current.attachments.some((row) => row.attachment_id === record.attachment_id)) {
    throw new AttachmentRegistryError("attachment_manifest_duplicate_id");
  }
  return createAttachmentManifest({
    item_id: current.item_id,
    attachments: [...current.attachments, record],
  }, options);
}

export function publicAttachmentDescriptor(input, options = {}) {
  const record = normalizeRecord(input, options);
  return Object.freeze({
    attachment_id: record.attachment_id,
    name: record.name,
    size: record.size,
    type: record.type,
  });
}

export function parseClientAttachmentReference(input) {
  if (!isPlainObject(input)) return { ok: false, error: "attachment_reference_invalid" };
  for (const key of Object.keys(input)) {
    const normalizedKey = key.toLowerCase();
    if (CLIENT_PATH_KEYS.has(normalizedKey)) return { ok: false, error: "client_attachment_path_forbidden" };
    if (!CLIENT_REFERENCE_KEYS.has(key)) return { ok: false, error: "attachment_reference_unknown_field" };
  }
  let attachmentId;
  try {
    attachmentId = validateAttachmentId(input.attachment_id);
  } catch (error) {
    return { ok: false, error: error.code || "attachment_id_invalid" };
  }
  const claims = {};
  if (Object.hasOwn(input, "name")) claims.name = input.name;
  if (Object.hasOwn(input, "size")) claims.size = input.size;
  if (Object.hasOwn(input, "type")) claims.type = input.type;
  return { ok: true, attachment_id: attachmentId, claims };
}

function detectPathStyle(value) {
  const path = String(value ?? "");
  if (!path || path.includes("\0") || WINDOWS_DEVICE_PATH_RE.test(path)) return null;
  if (/^[A-Za-z]:[\\/]/.test(path) || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(path)) {
    return win32.isAbsolute(path) ? "windows" : null;
  }
  return posix.isAbsolute(path) ? "posix" : null;
}

function canonicalPath(value, style) {
  const api = style === "windows" ? win32 : posix;
  let normalized = api.normalize(String(value));
  const root = api.parse(normalized).root;
  while (normalized.length > root.length && normalized.endsWith(api.sep)) normalized = normalized.slice(0, -1);
  return style === "windows" ? normalized.toLowerCase() : normalized;
}

function pathIsInside(base, target, style) {
  const api = style === "windows" ? win32 : posix;
  const canonicalBase = canonicalPath(base, style);
  const canonicalTarget = canonicalPath(target, style);
  return canonicalTarget === canonicalBase || canonicalTarget.startsWith(`${canonicalBase}${api.sep}`);
}

function statsMatch(before, after) {
  if (before.size !== after.size) return false;
  for (const key of ["dev", "ino"]) {
    if (Number.isSafeInteger(before[key]) && Number.isSafeInteger(after[key]) && before[key] !== after[key]) return false;
  }
  if (Number.isFinite(before.mtimeMs) && Number.isFinite(after.mtimeMs) && before.mtimeMs !== after.mtimeMs) return false;
  return true;
}

function isSingleLinkFile(stat) {
  if (typeof stat?.isFile !== "function" || !stat.isFile()) return false;
  return stat.nlink === 1 || stat.nlink === 1n;
}

async function hashOpenFile(handle, maxBytes) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  for (;;) {
    const result = await handle.read(buffer, 0, buffer.length, null);
    const bytesRead = Number(result?.bytesRead ?? 0);
    if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) {
      throw new AttachmentRegistryError("attachment_read_failed");
    }
    if (bytesRead === 0) break;
    size += bytesRead;
    if (size > maxBytes) throw new AttachmentRegistryError("attachment_size_invalid");
    hash.update(buffer.subarray(0, bytesRead));
  }
  return { size, sha256: hash.digest("hex") };
}

function expectedResolutionError(error) {
  return error instanceof AttachmentRegistryError ? error.code : "attachment_unavailable";
}

// The resolved path is intentionally kept under a non-enumerable `internal` property.
// JSON.stringify(result) therefore emits only the public-safe descriptor.
export async function resolveAttachment({
  itemDir,
  itemId,
  manifest,
  reference,
  fs = nodeFs,
  maxBytes = DEFAULT_ATTACHMENT_MAX_BYTES,
} = {}) {
  const clientReference = parseClientAttachmentReference(reference);
  if (!clientReference.ok) return clientReference;

  let normalizedItemId;
  let parsedManifest;
  let limit;
  try {
    normalizedItemId = normalizeItemId(itemId);
    parsedManifest = parseAttachmentManifest(manifest, { maxBytes });
    limit = normalizeMaxBytes(maxBytes);
  } catch (error) {
    return { ok: false, error: expectedResolutionError(error) };
  }
  if (parsedManifest.item_id !== normalizedItemId) {
    return { ok: false, error: "attachment_cross_item_forbidden" };
  }
  const record = parsedManifest.attachments.find((row) => row.attachment_id === clientReference.attachment_id);
  if (!record) return { ok: false, error: "attachment_unknown" };
  if (record.item_id !== normalizedItemId) return { ok: false, error: "attachment_cross_item_forbidden" };

  const descriptor = publicAttachmentDescriptor(record, { maxBytes });
  for (const [key, value] of Object.entries(clientReference.claims)) {
    if (value !== descriptor[key]) return { ok: false, error: "attachment_client_metadata_mismatch" };
  }

  const style = detectPathStyle(itemDir);
  if (!style) return { ok: false, error: "attachment_item_directory_invalid" };
  if (!["realpath", "stat", "lstat", "open"].every((name) => typeof fs?.[name] === "function")) {
    return { ok: false, error: "attachment_filesystem_invalid" };
  }
  const api = style === "windows" ? win32 : posix;
  const lexicalRoot = api.normalize(String(itemDir));
  const candidate = api.join(lexicalRoot, record.stored_name);
  if (!pathIsInside(lexicalRoot, candidate, style)) {
    return { ok: false, error: "attachment_path_escape" };
  }

  let realRoot;
  let realTarget;
  try {
    realRoot = await fs.realpath(lexicalRoot);
    realTarget = await fs.realpath(candidate);
    if (detectPathStyle(realRoot) !== style || detectPathStyle(realTarget) !== style) {
      return { ok: false, error: "attachment_path_style_mismatch" };
    }
    const rootStat = await fs.stat(realRoot);
    if (typeof rootStat?.isDirectory !== "function" || !rootStat.isDirectory()) {
      return { ok: false, error: "attachment_item_directory_invalid" };
    }
  } catch {
    return { ok: false, error: "attachment_unavailable" };
  }
  if (!pathIsInside(realRoot, realTarget, style)) {
    return { ok: false, error: "attachment_symlink_escape" };
  }

  let handle;
  let lexicalBefore;
  let before;
  let measured;
  try {
    lexicalBefore = await fs.lstat(candidate);
    if (!isSingleLinkFile(lexicalBefore)) throw new AttachmentRegistryError("attachment_link_unsafe");
    handle = await fs.open(realTarget, "r");
    before = await handle.stat();
    if (!isSingleLinkFile(before) || !statsMatch(lexicalBefore, before)) {
      throw new AttachmentRegistryError("attachment_link_unsafe");
    }
    if (before.size !== record.size || before.size > limit) {
      throw new AttachmentRegistryError("attachment_size_mismatch");
    }
    measured = await hashOpenFile(handle, limit);
  } catch (error) {
    return { ok: false, error: expectedResolutionError(error) };
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* no path-bearing error escapes */ }
    }
  }
  if (measured.size !== record.size) return { ok: false, error: "attachment_size_mismatch" };
  if (measured.sha256 !== record.sha256) return { ok: false, error: "attachment_hash_mismatch" };

  try {
    const finalRealTarget = await fs.realpath(candidate);
    const after = await fs.stat(realTarget);
    const lexicalAfter = await fs.lstat(candidate);
    if (canonicalPath(finalRealTarget, style) !== canonicalPath(realTarget, style)) {
      return { ok: false, error: "attachment_target_changed" };
    }
    if (!isSingleLinkFile(after) || !isSingleLinkFile(lexicalAfter)
        || !statsMatch(before, after) || !statsMatch(before, lexicalAfter)) {
      return { ok: false, error: "attachment_target_changed" };
    }
  } catch {
    return { ok: false, error: "attachment_target_changed" };
  }

  const result = { ok: true, attachment: descriptor };
  Object.defineProperty(result, "internal", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      path: realTarget,
      attachment_id: record.attachment_id,
      size: record.size,
      sha256: record.sha256,
      type: record.type,
    }),
  });
  return Object.freeze(result);
}
