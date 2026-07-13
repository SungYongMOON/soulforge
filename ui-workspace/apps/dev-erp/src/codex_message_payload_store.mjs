import { constants as fsConstants } from "node:fs";
import * as nodeFs from "node:fs/promises";
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import { posix, win32 } from "node:path";

export const CODEX_MESSAGE_PAYLOAD_SCHEMA = "dev_erp.codex_message_payload.v1";
export const DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES = 1024 * 1024;

const MAX_CONFIGURED_PAYLOAD_BYTES = 16 * 1024 * 1024;
const SERVICE_DIRECTORY = ".dev-erp-codex-message-payloads-v1";
const ITEMS_DIRECTORY = "items";
const PAYLOAD_FILE = "payload.json";
const COMMIT_FILE = "committed";
const PAYLOAD_REF_RE = /^cmp_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{32}$/;
const PAYLOAD_REF_PREFIX_LENGTH = "cmp_".length;
const PAYLOAD_REF_ITEM_TAG_LENGTH = 12;
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ROLES = new Set(["user", "assistant", "error", "system"]);
const ENVELOPE_KEYS = new Set([
  "schema",
  "payload_ref",
  "item_id",
  "role",
  "byte_length",
  "sha256",
  "text",
]);
const WRITE_KEYS = new Set(["itemId", "role", "text"]);
const RESOLVE_KEYS = new Set(["itemId", "payloadRef"]);
const REMOVE_KEYS = new Set(["itemId", "payloadRef", "role", "byteLength", "sha256"]);
const WINDOWS_DEVICE_PATH_RE = /^(?:\\\\[?.]\\|\/\/[?.]\/)/;
const ITEM_TAG_DOMAIN = "dev-erp-codex-message-item-tag-v1\0";
const ITEM_DIRECTORY_DOMAIN = "dev-erp-codex-message-item-directory-v1\0";

export class CodexMessagePayloadStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = "CodexMessagePayloadStoreError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, code) {
  if (!isPlainObject(value)) throw new CodexMessagePayloadStoreError(code);
}

function assertExactKeys(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new CodexMessagePayloadStoreError(code);
  }
}

function normalizeItemId(value) {
  const itemId = String(value ?? "");
  if (!ITEM_ID_RE.test(itemId)) throw new CodexMessagePayloadStoreError("payload_item_id_invalid");
  return itemId;
}

function normalizeRole(value) {
  const role = String(value ?? "");
  if (!ROLES.has(role)) throw new CodexMessagePayloadStoreError("payload_role_invalid");
  return role;
}

function normalizeMaxBytes(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CONFIGURED_PAYLOAD_BYTES) {
    throw new CodexMessagePayloadStoreError("payload_max_bytes_invalid");
  }
  return value;
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

function normalizeText(value, maxBytes) {
  if (typeof value !== "string" || !isWellFormedUnicode(value)) {
    throw new CodexMessagePayloadStoreError("payload_text_invalid_utf8");
  }
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length < 1 || bytes.length > maxBytes) {
    throw new CodexMessagePayloadStoreError("payload_text_size_invalid");
  }
  return { text: value, bytes };
}

function detectPathStyle(value, { allowRealpathNamespace = false } = {}) {
  let path = String(value ?? "");
  if (!path || path.includes("\0")) return null;
  if (allowRealpathNamespace && /^\\\\\?\\UNC\\/i.test(path)) path = `\\\\${path.slice(8)}`;
  else if (allowRealpathNamespace && /^\\\\\?\\[A-Za-z]:\\/.test(path)) path = path.slice(4);
  if (WINDOWS_DEVICE_PATH_RE.test(path)) return null;
  if (/^[A-Za-z]:[\\/]/.test(path) || /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(path)) {
    return win32.isAbsolute(path) ? "windows" : null;
  }
  return posix.isAbsolute(path) ? "posix" : null;
}

function normalizeRealpathOutput(value, expectedStyle) {
  let normalized = String(value ?? "");
  if (expectedStyle === "windows") {
    if (/^\\\\\?\\UNC\\/i.test(normalized)) normalized = `\\\\${normalized.slice(8)}`;
    else if (/^\\\\\?\\[A-Za-z]:\\/.test(normalized)) normalized = normalized.slice(4);
  }
  return detectPathStyle(normalized, { allowRealpathNamespace: false }) === expectedStyle
    ? normalized
    : null;
}

function pathApi(style) {
  return style === "windows" ? win32 : posix;
}

function canonicalPath(value, style) {
  const api = pathApi(style);
  let normalized = api.normalize(String(value));
  const root = api.parse(normalized).root;
  while (normalized.length > root.length && normalized.endsWith(api.sep)) normalized = normalized.slice(0, -1);
  return style === "windows" ? normalized.toLowerCase() : normalized;
}

export function isMessagePayloadPathInside(root, target) {
  const style = detectPathStyle(root);
  if (!style || detectPathStyle(target) !== style) return false;
  const api = pathApi(style);
  const canonicalRoot = canonicalPath(root, style);
  const canonicalTarget = canonicalPath(target, style);
  return canonicalTarget === canonicalRoot || canonicalTarget.startsWith(`${canonicalRoot}${api.sep}`);
}

function normalizeOwnerRoot(value) {
  const root = String(value ?? "");
  const style = detectPathStyle(root);
  if (!style) throw new CodexMessagePayloadStoreError("payload_owner_root_invalid");
  const api = pathApi(style);
  const normalized = api.normalize(root);
  if (canonicalPath(normalized, style) === canonicalPath(api.parse(normalized).root, style)) {
    throw new CodexMessagePayloadStoreError("payload_owner_root_too_broad");
  }
  return { lexicalRoot: normalized, style, api };
}

function itemTag(itemId) {
  return createHash("sha256").update(ITEM_TAG_DOMAIN).update(itemId).digest().subarray(0, 9).toString("base64url");
}

function itemDirectoryName(itemId) {
  return createHash("sha256").update(ITEM_DIRECTORY_DOMAIN).update(itemId).digest("hex");
}

function createPayloadRef(itemId, randomSource) {
  const random = randomSource(24);
  if (!Buffer.isBuffer(random) || random.length !== 24) {
    throw new CodexMessagePayloadStoreError("payload_random_source_invalid");
  }
  return `cmp_${itemTag(itemId)}_${random.toString("base64url")}`;
}

export function createOpaqueMessagePayloadRef(itemId) {
  return createPayloadRef(normalizeItemId(itemId), nodeRandomBytes);
}

export function validateMessagePayloadRef(value, { itemId } = {}) {
  const payloadRef = String(value ?? "");
  if (!PAYLOAD_REF_RE.test(payloadRef)) {
    throw new CodexMessagePayloadStoreError("payload_ref_invalid");
  }
  if (itemId !== undefined) {
    const normalizedItemId = normalizeItemId(itemId);
    const actualTag = Buffer.from(
      payloadRef.slice(PAYLOAD_REF_PREFIX_LENGTH, PAYLOAD_REF_PREFIX_LENGTH + PAYLOAD_REF_ITEM_TAG_LENGTH),
      "ascii",
    );
    const expectedTag = Buffer.from(itemTag(normalizedItemId), "ascii");
    if (actualTag.length !== expectedTag.length || !timingSafeEqual(actualTag, expectedTag)) {
      throw new CodexMessagePayloadStoreError("payload_cross_item_forbidden");
    }
  }
  return payloadRef;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function identityMatches(left, right) {
  if (!left || !right || Number(left.size) !== Number(right.size)) return false;
  for (const key of ["dev", "ino"]) {
    if (Number.isSafeInteger(left[key]) && Number.isSafeInteger(right[key]) && left[key] !== right[key]) return false;
  }
  if (Number.isFinite(left.mtimeMs) && Number.isFinite(right.mtimeMs) && left.mtimeMs !== right.mtimeMs) return false;
  return true;
}

function directoryIdentityMatches(left, right) {
  for (const key of ["dev", "ino"]) {
    if (Number.isSafeInteger(left?.[key]) && Number.isSafeInteger(right?.[key]) && left[key] !== right[key]) return false;
  }
  return true;
}

function assertDirectoryStat(stat, code) {
  if (typeof stat?.isDirectory !== "function" || !stat.isDirectory()) {
    throw new CodexMessagePayloadStoreError(code);
  }
}

function assertPlainDirectoryLstat(stat, code) {
  if (typeof stat?.isSymbolicLink !== "function") {
    throw new CodexMessagePayloadStoreError(code);
  }
  if (stat.isSymbolicLink()) {
    throw new CodexMessagePayloadStoreError("payload_symlink_forbidden");
  }
  assertDirectoryStat(stat, code);
}

function mapFilesystemError(error, fallback) {
  if (error instanceof CodexMessagePayloadStoreError) return error;
  return new CodexMessagePayloadStoreError(fallback);
}

async function mkdirExclusiveOrExisting(fs, target, mode) {
  try {
    await fs.mkdir(target, { mode });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

async function verifyOwnedDirectory({ fs, lexicalPath, parentReal, style, expectedReal = null }) {
  const linkStat = await fs.lstat(lexicalPath);
  assertPlainDirectoryLstat(linkStat, "payload_directory_invalid");
  const rawReal = await fs.realpath(lexicalPath);
  const real = normalizeRealpathOutput(rawReal, style);
  if (!real || !isMessagePayloadPathInside(parentReal, real)) {
    throw new CodexMessagePayloadStoreError("payload_junction_escape");
  }
  if (expectedReal && canonicalPath(real, style) !== canonicalPath(expectedReal, style)) {
    throw new CodexMessagePayloadStoreError("payload_directory_retargeted");
  }
  const realStat = await fs.stat(real);
  assertDirectoryStat(realStat, "payload_directory_invalid");
  return { real, stat: realStat };
}

async function writeExclusiveFile(fs, target, bytes) {
  let handle;
  try {
    handle = await fs.open(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o600,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await handle.stat();
    if (typeof stat?.isFile !== "function" || !stat.isFile() || Number(stat.nlink) !== 1 || stat.size !== bytes.length) {
      throw new CodexMessagePayloadStoreError("payload_exclusive_write_verification_failed");
    }
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* path-bearing OS errors are intentionally suppressed */ }
    }
  }
}

async function readOpenFileBounded(handle, maxBytes) {
  const chunks = [];
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let total = 0;
  for (;;) {
    const result = await handle.read(buffer, 0, buffer.length, null);
    const bytesRead = Number(result?.bytesRead ?? 0);
    if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) {
      throw new CodexMessagePayloadStoreError("payload_read_failed");
    }
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes) throw new CodexMessagePayloadStoreError("payload_stored_size_invalid");
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks, total);
}

async function readVerifiedFile({ fs, candidate, parentReal, style, maxBytes, expectedSize = null }) {
  const beforeLink = await fs.lstat(candidate);
  if (typeof beforeLink?.isSymbolicLink !== "function" || beforeLink.isSymbolicLink()) {
    throw new CodexMessagePayloadStoreError("payload_symlink_forbidden");
  }
  if (typeof beforeLink?.isFile !== "function" || !beforeLink.isFile()) {
    throw new CodexMessagePayloadStoreError("payload_stored_file_invalid");
  }
  if (Number(beforeLink.nlink) !== 1) {
    throw new CodexMessagePayloadStoreError("payload_hardlink_forbidden");
  }
  if (beforeLink.size > maxBytes || (expectedSize !== null && beforeLink.size !== expectedSize)) {
    throw new CodexMessagePayloadStoreError("payload_stored_size_invalid");
  }
  const rawReal = await fs.realpath(candidate);
  const real = normalizeRealpathOutput(rawReal, style);
  if (!real || !isMessagePayloadPathInside(parentReal, real)) {
    throw new CodexMessagePayloadStoreError("payload_symlink_escape");
  }

  let handle;
  let handleStat;
  let bytes;
  try {
    handle = await fs.open(candidate, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    handleStat = await handle.stat();
    if (typeof handleStat?.isFile !== "function" || !handleStat.isFile()) {
      throw new CodexMessagePayloadStoreError("payload_stored_file_invalid");
    }
    if (Number(handleStat.nlink) !== 1) {
      throw new CodexMessagePayloadStoreError("payload_hardlink_forbidden");
    }
    if (!identityMatches(beforeLink, handleStat)) {
      throw new CodexMessagePayloadStoreError("payload_target_changed");
    }
    bytes = await readOpenFileBounded(handle, maxBytes);
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* path-bearing OS errors are intentionally suppressed */ }
    }
  }

  const afterLink = await fs.lstat(candidate);
  const finalRawReal = await fs.realpath(candidate);
  const finalReal = normalizeRealpathOutput(finalRawReal, style);
  if (
    !finalReal
    || canonicalPath(finalReal, style) !== canonicalPath(real, style)
    || !identityMatches(handleStat, afterLink)
    || Number(afterLink.nlink) !== 1
  ) {
    throw new CodexMessagePayloadStoreError("payload_target_changed");
  }
  if (bytes.length !== handleStat.size || (expectedSize !== null && bytes.length !== expectedSize)) {
    throw new CodexMessagePayloadStoreError("payload_target_changed");
  }
  return bytes;
}

function parseEnvelope(bytes, { itemId, payloadRef, maxBytes }) {
  let text;
  let value;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new CodexMessagePayloadStoreError("payload_envelope_invalid");
  }
  assertPlainObject(value, "payload_envelope_invalid");
  assertExactKeys(value, ENVELOPE_KEYS, "payload_envelope_unknown_field");
  if (value.schema !== CODEX_MESSAGE_PAYLOAD_SCHEMA) {
    throw new CodexMessagePayloadStoreError("payload_envelope_schema_invalid");
  }
  if (value.payload_ref !== payloadRef) {
    throw new CodexMessagePayloadStoreError("payload_envelope_ref_mismatch");
  }
  if (value.item_id !== itemId) {
    throw new CodexMessagePayloadStoreError("payload_cross_item_forbidden");
  }
  const role = normalizeRole(value.role);
  const normalized = normalizeText(value.text, maxBytes);
  if (!Number.isSafeInteger(value.byte_length) || value.byte_length !== normalized.bytes.length) {
    throw new CodexMessagePayloadStoreError("payload_envelope_size_mismatch");
  }
  if (!SHA256_RE.test(String(value.sha256 ?? "")) || value.sha256 !== sha256(normalized.bytes)) {
    throw new CodexMessagePayloadStoreError("payload_envelope_hash_mismatch");
  }
  return Object.freeze({
    payload_ref: payloadRef,
    role,
    text: normalized.text,
    byte_length: normalized.bytes.length,
    sha256: value.sha256,
  });
}

function safeReadError(error) {
  return error instanceof CodexMessagePayloadStoreError ? error.code : "payload_unavailable";
}

export async function createCodexMessagePayloadStore({
  root,
  maxBytes = DEFAULT_CODEX_MESSAGE_PAYLOAD_MAX_BYTES,
  fs = nodeFs,
  randomBytes = nodeRandomBytes,
  enableMigrationCleanup = false,
} = {}) {
  const limit = normalizeMaxBytes(maxBytes);
  if (!fs || !["lstat", "stat", "realpath", "mkdir", "open"].every((name) => typeof fs[name] === "function")) {
    throw new CodexMessagePayloadStoreError("payload_filesystem_invalid");
  }
  if (typeof randomBytes !== "function") {
    throw new CodexMessagePayloadStoreError("payload_random_source_invalid");
  }
  if (typeof enableMigrationCleanup !== "boolean") {
    throw new CodexMessagePayloadStoreError("payload_cleanup_option_invalid");
  }
  if (enableMigrationCleanup && !["readdir", "unlink", "rmdir"].every((name) => typeof fs[name] === "function")) {
    throw new CodexMessagePayloadStoreError("payload_cleanup_unavailable");
  }
  const { lexicalRoot, style, api } = normalizeOwnerRoot(root);
  const cleanupOwnedPayloads = new Map();

  let rootReal;
  let rootIdentity;
  let serviceReal;
  let serviceIdentity;
  let itemsReal;
  let itemsIdentity;
  const serviceLexical = api.join(lexicalRoot, SERVICE_DIRECTORY);
  const itemsLexical = api.join(serviceLexical, ITEMS_DIRECTORY);
  try {
    const rawRootReal = await fs.realpath(lexicalRoot);
    rootReal = normalizeRealpathOutput(rawRootReal, style);
    if (!rootReal) throw new CodexMessagePayloadStoreError("payload_owner_root_invalid");
    rootIdentity = await fs.stat(rootReal);
    assertDirectoryStat(rootIdentity, "payload_owner_root_invalid");

    await mkdirExclusiveOrExisting(fs, serviceLexical, 0o700);
    const service = await verifyOwnedDirectory({ fs, lexicalPath: serviceLexical, parentReal: rootReal, style });
    serviceReal = service.real;
    serviceIdentity = service.stat;

    await mkdirExclusiveOrExisting(fs, itemsLexical, 0o700);
    const items = await verifyOwnedDirectory({ fs, lexicalPath: itemsLexical, parentReal: serviceReal, style });
    itemsReal = items.real;
    itemsIdentity = items.stat;
  } catch (error) {
    throw mapFilesystemError(error, "payload_store_initialization_failed");
  }

  async function assertStoreStable() {
    try {
      const rawCurrentRoot = await fs.realpath(lexicalRoot);
      const currentRoot = normalizeRealpathOutput(rawCurrentRoot, style);
      const currentRootStat = currentRoot ? await fs.stat(currentRoot) : null;
      if (
        !currentRoot
        || canonicalPath(currentRoot, style) !== canonicalPath(rootReal, style)
        || !directoryIdentityMatches(rootIdentity, currentRootStat)
      ) {
        throw new CodexMessagePayloadStoreError("payload_owner_root_retargeted");
      }
      const service = await verifyOwnedDirectory({
        fs,
        lexicalPath: serviceLexical,
        parentReal: currentRoot,
        style,
        expectedReal: serviceReal,
      });
      if (!directoryIdentityMatches(serviceIdentity, service.stat)) {
        throw new CodexMessagePayloadStoreError("payload_service_root_retargeted");
      }
      const items = await verifyOwnedDirectory({
        fs,
        lexicalPath: itemsLexical,
        parentReal: service.real,
        style,
        expectedReal: itemsReal,
      });
      if (!directoryIdentityMatches(itemsIdentity, items.stat)) {
        throw new CodexMessagePayloadStoreError("payload_items_root_retargeted");
      }
    } catch (error) {
      throw mapFilesystemError(error, "payload_store_unavailable");
    }
  }

  async function ensureItemDirectory(itemId, { create }) {
    // Descend from the pinned real directory, not the owner-facing lexical alias. This keeps a
    // later junction retarget of the approved root from redirecting the file operation.
    const lexical = api.join(itemsReal, itemDirectoryName(itemId));
    try {
      if (create) await mkdirExclusiveOrExisting(fs, lexical, 0o700);
      return await verifyOwnedDirectory({ fs, lexicalPath: lexical, parentReal: itemsReal, style });
    } catch (error) {
      throw mapFilesystemError(error, "payload_item_directory_unavailable");
    }
  }

  async function failAfterOwnedWrite(error, cleanupReceipt) {
    if (!enableMigrationCleanup || !cleanupReceipt) throw mapFilesystemError(error, "payload_write_failed");
    try {
      await removeVerifiedMessagePayload(cleanupReceipt);
    } catch {
      const cleanupError = new CodexMessagePayloadStoreError("payload_write_cleanup_failed");
      Object.defineProperty(cleanupError, "cleanup_receipt", {
        value: cleanupReceipt,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      throw cleanupError;
    }
    throw new CodexMessagePayloadStoreError("payload_write_failed");
  }

  async function writeMessagePayload(input) {
    assertPlainObject(input, "payload_write_request_invalid");
    assertExactKeys(input, WRITE_KEYS, "payload_write_request_unknown_field");
    const itemId = normalizeItemId(input.itemId);
    const role = normalizeRole(input.role);
    const normalized = normalizeText(input.text, limit);
    await assertStoreStable();
    const item = await ensureItemDirectory(itemId, { create: true });

    let payloadRef;
    let refLexical;
    let refDirectory;
    let cleanupReceipt = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      payloadRef = createPayloadRef(itemId, randomBytes);
      refLexical = api.join(item.real, payloadRef);
      let created;
      try {
        created = await mkdirExclusiveOrExisting(fs, refLexical, 0o700);
      } catch (error) {
        throw mapFilesystemError(error, "payload_write_failed");
      }
      if (!created) continue;
      if (enableMigrationCleanup) {
        cleanupReceipt = Object.freeze({
          itemId,
          payloadRef,
          role,
          byteLength: normalized.bytes.length,
          sha256: sha256(normalized.bytes),
        });
        cleanupOwnedPayloads.set(payloadRef, { ...cleanupReceipt, published: false });
      }
      try {
        refDirectory = await verifyOwnedDirectory({ fs, lexicalPath: refLexical, parentReal: item.real, style });
      } catch (error) {
        await failAfterOwnedWrite(error, cleanupReceipt);
      }
      break;
    }
    if (!refDirectory) throw new CodexMessagePayloadStoreError("payload_ref_collision");

    const envelope = {
      schema: CODEX_MESSAGE_PAYLOAD_SCHEMA,
      payload_ref: payloadRef,
      item_id: itemId,
      role,
      byte_length: normalized.bytes.length,
      sha256: sha256(normalized.bytes),
      text: normalized.text,
    };
    const envelopeBytes = Buffer.from(JSON.stringify(envelope), "utf8");
    const maxEnvelopeBytes = (limit * 6) + 4096;
    if (envelopeBytes.length > maxEnvelopeBytes) {
      await failAfterOwnedWrite(new CodexMessagePayloadStoreError("payload_envelope_size_invalid"), cleanupReceipt);
    }

    try {
      await writeExclusiveFile(fs, api.join(refDirectory.real, PAYLOAD_FILE), envelopeBytes);
      // The zero-byte marker is the atomic publication point. An interrupted write has no marker
      // and is never returned by resolveAuthorizedMessagePayload.
      await writeExclusiveFile(fs, api.join(refDirectory.real, COMMIT_FILE), Buffer.alloc(0));
      if (enableMigrationCleanup) cleanupOwnedPayloads.get(payloadRef).published = true;
      await assertStoreStable();
      await verifyOwnedDirectory({
        fs,
        lexicalPath: refLexical,
        parentReal: item.real,
        style,
        expectedReal: refDirectory.real,
      });
    } catch (error) {
      await failAfterOwnedWrite(error, cleanupReceipt);
    }

    const metadata = Object.freeze({
      payload_ref: payloadRef,
      role,
      byte_length: normalized.bytes.length,
      sha256: envelope.sha256,
    });
    return metadata;
  }

  // Authorization is deliberately a caller boundary: the server must first authorize access to
  // itemId, then call this only exported read method with that same itemId and the opaque reference.
  async function resolveAuthorizedMessagePayload(input) {
    try {
      assertPlainObject(input, "payload_resolve_request_invalid");
      assertExactKeys(input, RESOLVE_KEYS, "payload_resolve_request_unknown_field");
      const itemId = normalizeItemId(input.itemId);
      const payloadRef = validateMessagePayloadRef(input.payloadRef, { itemId });
      await assertStoreStable();
      const item = await ensureItemDirectory(itemId, { create: false });
      const refLexical = api.join(item.real, payloadRef);
      const refDirectory = await verifyOwnedDirectory({
        fs,
        lexicalPath: refLexical,
        parentReal: item.real,
        style,
      });
      const marker = await readVerifiedFile({
        fs,
        candidate: api.join(refDirectory.real, COMMIT_FILE),
        parentReal: refDirectory.real,
        style,
        maxBytes: 0,
        expectedSize: 0,
      });
      if (marker.length !== 0) throw new CodexMessagePayloadStoreError("payload_commit_marker_invalid");
      const envelopeBytes = await readVerifiedFile({
        fs,
        candidate: api.join(refDirectory.real, PAYLOAD_FILE),
        parentReal: refDirectory.real,
        style,
        maxBytes: (limit * 6) + 4096,
      });
      const payload = parseEnvelope(envelopeBytes, { itemId, payloadRef, maxBytes: limit });
      await assertStoreStable();
      return Object.freeze({ ok: true, payload });
    } catch (error) {
      return Object.freeze({ ok: false, error: safeReadError(error) });
    }
  }

  // This capability is exposed only when explicitly enabled. It recognizes refs written by this
  // exact store instance and is retry-safe across failures after marker or payload removal.
  async function removeVerifiedMessagePayload(input) {
    assertPlainObject(input, "payload_remove_request_invalid");
    assertExactKeys(input, REMOVE_KEYS, "payload_remove_request_unknown_field");
    const itemId = normalizeItemId(input.itemId);
    const payloadRef = validateMessagePayloadRef(input.payloadRef, { itemId });
    const role = normalizeRole(input.role);
    const byteLength = Number(input.byteLength);
    const expectedSha256 = String(input.sha256 ?? "");
    if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > limit || !SHA256_RE.test(expectedSha256)) {
      throw new CodexMessagePayloadStoreError("payload_remove_metadata_invalid");
    }
    const owned = cleanupOwnedPayloads.get(payloadRef);
    if (!owned) throw new CodexMessagePayloadStoreError("payload_cleanup_not_owned");
    if (
      owned.itemId !== itemId
      || owned.role !== role
      || owned.byteLength !== byteLength
      || owned.sha256 !== expectedSha256
    ) {
      throw new CodexMessagePayloadStoreError("payload_cleanup_metadata_mismatch");
    }

    try {
      await assertStoreStable();
      const item = await ensureItemDirectory(itemId, { create: false });
      const refLexical = api.join(item.real, payloadRef);
      for (let step = 0; step < 4; step += 1) {
        let refDirectory;
        try {
          refDirectory = await verifyOwnedDirectory({
            fs,
            lexicalPath: refLexical,
            parentReal: item.real,
            style,
          });
        } catch (error) {
          if (error?.code === "ENOENT") {
            cleanupOwnedPayloads.delete(payloadRef);
            return Object.freeze({ ok: true, payload_ref: payloadRef });
          }
          throw error;
        }
        const names = (await fs.readdir(refDirectory.real)).slice().sort();
        const committedShape = names.length === 2 && names[0] === COMMIT_FILE && names[1] === PAYLOAD_FILE;
        const uncommittedShape = names.length === 1 && names[0] === PAYLOAD_FILE;
        const markerOnlyShape = names.length === 1 && names[0] === COMMIT_FILE;
        const emptyShape = names.length === 0;
        const ownedIncompleteShape = !owned.published
          && names.length <= 2
          && names.every((name) => name === COMMIT_FILE || name === PAYLOAD_FILE);
        if (
          (!owned.published && !ownedIncompleteShape)
          || (owned.published && !committedShape && !uncommittedShape && !emptyShape)
          || (owned.published && markerOnlyShape)
        ) {
          throw new CodexMessagePayloadStoreError("payload_cleanup_object_shape_invalid");
        }
        if (owned.published && committedShape) {
          const marker = await readVerifiedFile({
            fs,
            candidate: api.join(refDirectory.real, COMMIT_FILE),
            parentReal: refDirectory.real,
            style,
            maxBytes: 0,
            expectedSize: 0,
          });
          if (marker.length !== 0) throw new CodexMessagePayloadStoreError("payload_commit_marker_invalid");
        }
        if (owned.published && (committedShape || uncommittedShape)) {
          const envelopeBytes = await readVerifiedFile({
            fs,
            candidate: api.join(refDirectory.real, PAYLOAD_FILE),
            parentReal: refDirectory.real,
            style,
            maxBytes: (limit * 6) + 4096,
          });
          const payload = parseEnvelope(envelopeBytes, { itemId, payloadRef, maxBytes: limit });
          if (payload.role !== role || payload.byte_length !== byteLength || payload.sha256 !== expectedSha256) {
            throw new CodexMessagePayloadStoreError("payload_cleanup_metadata_mismatch");
          }
        }
        await assertStoreStable();
        await verifyOwnedDirectory({
          fs,
          lexicalPath: refLexical,
          parentReal: item.real,
          style,
          expectedReal: refDirectory.real,
        });
        if (names.includes(COMMIT_FILE)) await fs.unlink(api.join(refDirectory.real, COMMIT_FILE));
        else if (names.includes(PAYLOAD_FILE)) await fs.unlink(api.join(refDirectory.real, PAYLOAD_FILE));
        else await fs.rmdir(refDirectory.real);
      }
      cleanupOwnedPayloads.delete(payloadRef);
      await assertStoreStable();
      return Object.freeze({ ok: true, payload_ref: payloadRef });
    } catch (error) {
      throw mapFilesystemError(error, "payload_cleanup_failed");
    }
  }

  const store = {
    writeMessagePayload,
    resolveAuthorizedMessagePayload,
  };
  if (enableMigrationCleanup) store.removeVerifiedMessagePayload = removeVerifiedMessagePayload;
  return Object.freeze(store);
}
