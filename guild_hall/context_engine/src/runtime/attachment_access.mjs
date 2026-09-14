// Attachment bytes, reached only through the pointer the original carries.
//
// Custody stores an attachment beside the message that referenced it, and the
// reference is the only way in: a Slack file id resolves to a stored pointer and
// that pointer's digest names the file on disk; a mail attachment names a path
// the collector wrote, which is opened only after it is proved to be inside a
// declared attachment root. Nothing here searches a disk by file name, and
// nothing widens a root: a path outside the declared roots is `access_denied`,
// not a fallback.
//
// Every read is bounded, refuses links and multi-link files, re-checks that the
// file did not change under it, and re-hashes what it read against the pointer.
// A digest that does not match is `hash_mismatch` and the bytes are dropped: the
// point of custody is that the reference and the bytes agree.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isSafeSegment } from '../adapters/sources/guarded_files.mjs';

export const ATTACHMENT_ACCESS_SCHEMA = 'soulforge.context_attachment_access.v1';
/** The statuses this module may put on one attachment. A caller adds no others. */
export const ATTACHMENT_STATUSES = Object.freeze(['ok', 'bytes_not_collected', 'access_denied', 'hash_mismatch']);
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const SHA_PREFIXED = /^sha256:([0-9a-f]{64})$/u;
const SHA_BARE = /^([0-9a-f]{64})$/u;
const FILE_ID = /^[A-Za-z0-9._-]{1,64}$/u;
const stamp = stat => Object.fromEntries(['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, stat[key]]));

export class AttachmentAccessError extends Error {
  constructor(code) { super(code); this.name = 'AttachmentAccessError'; this.code = code; }
}
const fail = code => { throw new AttachmentAccessError(code); };

/** `sha256:<hex>` for a digest written either way, or null. Mail writes bare hex; Slack writes the prefix. */
export function normalizeDigest(value) {
  if (typeof value !== 'string') return null;
  const match = SHA_PREFIXED.exec(value) ?? SHA_BARE.exec(value);
  return match ? `sha256:${match[1]}` : null;
}
const digestOf = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// Every existing component between the file and the root must be itself: no
// junction, no symlink, no reparse point standing in for a directory.
function assertPlainChain(target, root) {
  for (let cursor = target; ; cursor = dirname(cursor)) {
    let stat;
    try { stat = lstatSync(cursor); } catch { fail('attachment_missing'); }
    if (stat.isSymbolicLink() || realpathSync(cursor) !== cursor) fail('attachment_path_refused');
    if (cursor === root) return;
    if (dirname(cursor) === cursor) fail('attachment_path_refused');
  }
}

/** Reads one bounded file whose identity does not change across the read. */
export async function readBoundedFile(target, root, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ATTACHMENT_BYTES) fail('attachment_read_bounds');
  assertPlainChain(target, root);
  const before = lstatSync(target, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n) fail('attachment_path_refused');
  if (before.size > BigInt(maxBytes)) fail('attachment_too_large');
  const file = await open(target, 'r');
  try {
    if (!isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))) fail('attachment_changed_during_read');
    const buffer = Buffer.alloc(Number(before.size));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== buffer.length
      || !isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))
      || !isDeepStrictEqual(stamp(before), stamp(lstatSync(target, { bigint: true })))) fail('attachment_changed_during_read');
    return buffer;
  } finally { await file.close(); }
}

/** An absolute directory, as itself, reached without a link. */
export function admitRoot(rootPath) {
  if (typeof rootPath !== 'string' || !isAbsolute(rootPath)) fail('attachment_root_invalid');
  const root = resolve(rootPath);
  let stat;
  try { stat = lstatSync(root); } catch { return fail('attachment_root_unavailable'); }
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(root) !== root) fail('attachment_root_unavailable');
  return root;
}

// Windows compares path spellings case-insensitively; a containment test that
// does not is a way past the fence rather than a stricter one.
const within = (child, root) => {
  const left = process.platform === 'win32' ? child.toLowerCase() : child;
  const right = process.platform === 'win32' ? root.toLowerCase() : root;
  return left.startsWith(right.endsWith(sep) ? right : right + sep);
};

/** The declared attachment roots, admitted once. `roots` maps a source root_ref to an absolute directory. */
export function openAttachmentRoots(roots) {
  const admitted = new Map();
  for (const [rootRef, value] of Object.entries(roots ?? {})) {
    let root;
    try { root = admitRoot(value); } catch { continue; }
    admitted.set(rootRef, root);
  }
  return Object.freeze({
    size: admitted.size,
    refs: Object.freeze([...admitted.keys()]),
    /** The declared root that holds this absolute path, or null. */
    holderOf(absolutePath) {
      if (typeof absolutePath !== 'string' || !isAbsolute(absolutePath)) return null;
      const target = resolve(absolutePath);
      for (const [rootRef, root] of admitted) if (within(target, root)) return { root_ref: rootRef, root, target };
      return null;
    },
  });
}

// Whether the bytes are there, without reading or hashing them. Listing an
// attachment should not cost the file: a list says what custody holds, and
// `hash_mismatch` is reserved for a read that actually compared.
function probe(target, root) {
  try {
    assertPlainChain(target, root);
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n) return { status: 'access_denied', detail: 'not a plain single-link file', bytes: null };
    return { status: 'ok', detail: null, bytes: null, size_on_disk: Number(stat.size) };
  } catch (error) {
    if (error?.code === 'attachment_missing') return { status: 'bytes_not_collected', detail: 'bytes absent in custody', bytes: null };
    return { status: 'access_denied', detail: error?.code ?? 'unreadable', bytes: null };
  }
}

// ---------------------------------------------------------------- slack
/** The attachment list a Slack revision carries, in pointer order, without opening a byte. */
export function slackAttachmentEntries(pointers) {
  return (pointers ?? []).filter(pointer => pointer && typeof pointer === 'object')
    .map((pointer, index) => ({
      index: index + 1, kind: 'slack_file', name: null, file_id: typeof pointer.file_id === 'string' ? pointer.file_id : null,
      mime: typeof pointer.mime_type === 'string' ? pointer.mime_type : null,
      size_bytes: Number.isSafeInteger(pointer.size_bytes) ? pointer.size_bytes : null,
      sha256: normalizeDigest(pointer.content_sha256), status: null, detail: null,
    }));
}

/**
 * Slack bytes: file id -> stored pointer -> `attachments/sha256/<xx>/<hex>.bin`.
 * The stored pointer must agree with the revision's pointer before the bytes are
 * opened, so a rewritten pointer file cannot redirect a read.
 */
export async function readSlackAttachment({ channelRoot, entry, maxBytes, probeOnly = false }) {
  const root = admitRoot(channelRoot);
  if (entry.sha256 === null) return { status: 'bytes_not_collected', detail: 'pointer carries no digest', bytes: null };
  if (entry.file_id !== null && !FILE_ID.test(entry.file_id)) return { status: 'access_denied', detail: 'file id shape', bytes: null };
  const hex = SHA_PREFIXED.exec(entry.sha256)[1];
  if (entry.file_id !== null) {
    const pointerPath = join(root, 'attachments', 'file_ids', `${entry.file_id}.json`);
    let stored = null;
    try { stored = JSON.parse((await readBoundedFile(pointerPath, root, 1024 * 1024)).toString('utf8')); }
    catch (error) {
      if (error?.code === 'attachment_missing') return { status: 'bytes_not_collected', detail: 'stored pointer absent', bytes: null };
      return { status: 'access_denied', detail: error?.code ?? 'pointer unreadable', bytes: null };
    }
    if (normalizeDigest(stored?.content_sha256) !== entry.sha256) {
      return { status: 'hash_mismatch', detail: 'stored pointer names another digest', bytes: null };
    }
  }
  const binPath = join(root, 'attachments', 'sha256', hex.slice(0, 2), `${hex}.bin`);
  if (probeOnly) return probe(binPath, root);
  let bytes;
  try { bytes = await readBoundedFile(binPath, root, maxBytes); }
  catch (error) {
    if (error?.code === 'attachment_missing') return { status: 'bytes_not_collected', detail: 'bytes absent in custody', bytes: null };
    return { status: 'access_denied', detail: error?.code ?? 'unreadable', bytes: null };
  }
  const actual = digestOf(bytes);
  if (actual !== entry.sha256) return { status: 'hash_mismatch', detail: 'bytes differ from pointer', bytes: null };
  return { status: 'ok', detail: null, bytes, sha256: actual, source: { kind: 'slack_file', file_id: entry.file_id } };
}

// ---------------------------------------------------------------- mail
/** The attachment list a mail event row carries. `local_path` is not shown; only whether one was recorded. */
export function mailAttachmentEntries(row) {
  return (row?.attachments ?? []).filter(att => att && typeof att === 'object')
    .map((att, index) => ({
      index: index + 1, kind: typeof att.type === 'string' ? att.type : 'file',
      name: typeof att.name === 'string' && att.name ? att.name : null, file_id: null,
      mime: typeof att.mime === 'string' ? att.mime : null,
      size_bytes: Number.isSafeInteger(att.size) ? att.size : null,
      sha256: normalizeDigest(att.content_sha256), status: null, detail: null,
      blocked_extension: att?.metadata?.blocked_extension === true,
      local_path: typeof att.local_path === 'string' && att.local_path ? att.local_path : null,
    }));
}

/**
 * Mail bytes: the collector recorded an absolute path, so the path is checked
 * against the declared attachment roots before anything is opened. A path
 * outside every declared root is refused -- it is not a reason to declare a new
 * root at read time.
 */
export async function readMailAttachment({ attachmentRoots, entry, maxBytes, probeOnly = false }) {
  if (entry.sha256 === null || entry.local_path === null) {
    return { status: 'bytes_not_collected', detail: entry.blocked_extension ? 'blocked extension, bytes never fetched' : 'no digest or stored path', bytes: null };
  }
  const holder = attachmentRoots.holderOf(entry.local_path);
  if (holder === null) return { status: 'access_denied', detail: 'stored path outside every declared attachment root', bytes: null };
  // The last segment is a real file name (Korean, spaces); the same shape rule
  // the source reader uses applies here, so a crafted name cannot walk.
  const relative = holder.target.slice(holder.root.length + 1).split(sep);
  if (relative.length === 0 || !relative.every(segment => isSafeSegment(segment))) {
    return { status: 'access_denied', detail: 'stored path segment refused', bytes: null };
  }
  if (probeOnly) return probe(holder.target, holder.root);
  let bytes;
  try { bytes = await readBoundedFile(holder.target, holder.root, maxBytes); }
  catch (error) {
    if (error?.code === 'attachment_missing') return { status: 'bytes_not_collected', detail: 'bytes absent at stored path', bytes: null };
    return { status: 'access_denied', detail: error?.code ?? 'unreadable', bytes: null };
  }
  const actual = digestOf(bytes);
  if (actual !== entry.sha256) return { status: 'hash_mismatch', detail: 'bytes differ from recorded digest', bytes: null };
  return { status: 'ok', detail: null, bytes, sha256: actual, source: { kind: 'mail_file', root_ref: holder.root_ref, name: entry.name } };
}
