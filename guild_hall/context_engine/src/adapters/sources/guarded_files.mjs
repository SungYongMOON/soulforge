// Guarded read-only access below one trusted source root, with the same rules as
// exact_source_readback: no link or reparse point on the path, regular single-link
// files, bounded size, identity unchanged across the read, strict UTF-8.
// Nothing is created, moved or written.
import { open, readdir } from 'node:fs/promises';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

export const SOURCE_READ_MAX_BYTES = 64 * 1024 * 1024;
// A streamed, filtered read may cover a much larger file; each kept line still
// obeys SOURCE_READ_MAX_BYTES.
export const SOURCE_STREAM_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const SECRET = /^(?:\.env(?:\..*)?|credentials?|secrets?)$/iu;
const RESERVED = /[<>:"/\\|?*]/u;
// Real file names (Korean, spaces) are allowed; separators, control characters,
// dot segments, Windows-reserved characters and trailing dots/spaces are not.
export function isSafeSegment(part) {
  return typeof part === 'string' && part.length > 0 && part.length <= 255 && part !== '.' && part !== '..'
    && !RESERVED.test(part) && ![...part].some(ch => ch.codePointAt(0) < 32 || ch.codePointAt(0) === 127)
    && !/[. ]$/u.test(part) && part.trim() === part;
}
const SEGMENT = { test: isSafeSegment };
const stamp = stat => Object.fromEntries(['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, stat[key]]));

export class SourceReadError extends Error {
  constructor(code) { super(code); this.name = 'SourceReadError'; this.code = code; }
}
const fail = code => { throw new SourceReadError(code); };

export function openSourceRoot(rootPath) {
  if (typeof rootPath !== 'string' || !isAbsolute(rootPath)) fail('source_root_invalid');
  const root = resolve(rootPath);
  let rootStat;
  try { rootStat = lstatSync(root); } catch { fail('source_root_unavailable'); }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || realpathSync(root) !== root) fail('source_root_unavailable');
  const target = segments => {
    if (!Array.isArray(segments) || !segments.every(part => typeof part === 'string' && SEGMENT.test(part) && !SECRET.test(part))) {
      fail('source_path_refused');
    }
    return join(root, ...segments);
  };
  // Every existing component between the target and the root must be itself.
  const assertPlainChain = path => {
    for (let cursor = path; ; cursor = dirname(cursor)) {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || realpathSync(cursor) !== cursor) fail('source_path_refused');
      if (cursor === root) return;
      if (dirname(cursor) === cursor) fail('source_path_refused');
    }
  };
  return Object.freeze({
    root,
    async list(segments) {
      const path = target(segments);
      try { assertPlainChain(path); } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error instanceof SourceReadError ? error : new SourceReadError('source_path_refused');
      }
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter(entry => SEGMENT.test(entry.name) && !SECRET.test(entry.name))
        .map(entry => ({ name: entry.name, directory: entry.isDirectory(), file: entry.isFile() }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async readText(segments, maxBytes) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > SOURCE_READ_MAX_BYTES) fail('source_read_bounds');
      const path = target(segments);
      try { assertPlainChain(path); } catch (error) {
        if (error?.code === 'ENOENT') fail('source_missing');
        throw error instanceof SourceReadError ? error : new SourceReadError('source_path_refused');
      }
      const before = lstatSync(path, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n) fail('source_path_refused');
      if (before.size > BigInt(maxBytes)) fail('source_too_large');
      const file = await open(path, 'r');
      try {
        if (!isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))) fail('source_changed_during_read');
        const buffer = Buffer.alloc(Number(before.size) + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
          if (!bytesRead) break;
          length += bytesRead;
        }
        const bytes = buffer.subarray(0, length);
        if (bytes.length !== Number(before.size)
          || !isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))
          || !isDeepStrictEqual(stamp(before), stamp(lstatSync(path, { bigint: true })))) fail('source_changed_during_read');
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('source_encoding_invalid'); }
        return { text, bytes: bytes.length, sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex') };
      } finally { await file.close(); }
    },
    // Streams a line-oriented file and keeps only the lines `filter` accepts, so
    // a month of mail events far past the whole-file bound can still yield the
    // few rows one grant names. The same guards as readText: plain chain, single
    // link, size bound (a larger one, per line and per file), identity unchanged
    // across the read, strict UTF-8. Nothing but the kept lines is retained.
    async readLines(segments, { maxBytes = SOURCE_STREAM_MAX_BYTES, maxLineBytes = SOURCE_READ_MAX_BYTES, filter } = {}) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > SOURCE_STREAM_MAX_BYTES
        || !Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1 || maxLineBytes > SOURCE_READ_MAX_BYTES
        || typeof filter !== 'function') fail('source_read_bounds');
      const path = target(segments);
      try { assertPlainChain(path); } catch (error) {
        if (error?.code === 'ENOENT') fail('source_missing');
        throw error instanceof SourceReadError ? error : new SourceReadError('source_path_refused');
      }
      const before = lstatSync(path, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n) fail('source_path_refused');
      if (before.size > BigInt(maxBytes)) fail('source_too_large');
      const file = await open(path, 'r');
      try {
        if (!isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))) fail('source_changed_during_read');
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const chunk = Buffer.alloc(8 * 1024 * 1024);
        const kept = [];
        let carry = '', position = 0, scanned = 0;
        for (;;) {
          const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
          if (!bytesRead) break;
          position += bytesRead;
          let text;
          try { text = decoder.decode(chunk.subarray(0, bytesRead), { stream: true }); } catch { fail('source_encoding_invalid'); }
          const parts = (carry + text).split('\n');
          carry = parts.pop();
          if (Buffer.byteLength(carry) > maxLineBytes) fail('source_line_too_long');
          for (const line of parts) {
            scanned += 1;
            if (Buffer.byteLength(line) > maxLineBytes) fail('source_line_too_long');
            if (filter(line)) kept.push(line);
          }
        }
        try { carry += decoder.decode(); } catch { fail('source_encoding_invalid'); }
        if (carry.length) { scanned += 1; if (filter(carry)) kept.push(carry); }
        if (position !== Number(before.size)
          || !isDeepStrictEqual(stamp(before), stamp(await file.stat({ bigint: true })))
          || !isDeepStrictEqual(stamp(before), stamp(lstatSync(path, { bigint: true })))) fail('source_changed_during_read');
        return { lines: kept, bytes: position, scanned };
      } finally { await file.close(); }
    },
  });
}
