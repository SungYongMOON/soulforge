// Explicit local source readback for the accepted reader's existing provider seam.
// No discovery, admission, acceptance, model call or persistent write.
import { open } from 'node:fs/promises';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

const unavailable = () => { throw new Error('source_unavailable'); };
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const stamp = stat => Object.fromEntries(['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, stat[key]]));
const exact = isDeepStrictEqual;

export async function readSourceBytesBounded(file, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 131072) unavailable();
  const buffer = Buffer.alloc(maxBytes + 1);
  let length = 0;
  while (length < buffer.length) {
    const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
    if (!bytesRead) break;
    length += bytesRead;
  }
  return buffer.subarray(0, length);
}

/**
 * entries: caller-held private {binding, source_root, path, data_class} objects.
 * authorize(binding,data_class) returns a fresh boolean grant decision; it must
 * consult the same owner/ACL revision as authoritySnapshot(), never mail text.
 * Existing accepted generation/receipt checks remain in createAcceptedContextReader.
 */
export function createExactSourceReadback({ entries, authorize, authoritySnapshot, maxBytes = 131072 } = {}) {
  const configured = Array.isArray(entries) && entries.length <= 100 && typeof authorize === 'function'
    && typeof authoritySnapshot === 'function' && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 131072;
  const bound = configured ? structuredClone(entries) : [];
  let attempts = 0, loads = 0, loadedBytes = 0;
  return Object.freeze({
    metrics: () => ({ source_read_attempts: attempts, source_body_loads: loads, source_bytes_loaded: loadedBytes }),
    async readSourceRevision(binding) {
      if (!configured) return unavailable();
      const matches = bound.filter(entry => exact(entry.binding, binding));
      if (matches.length !== 1) return unavailable();
      const entry = matches[0];
      const beforeAuthority = structuredClone(authoritySnapshot());
      const guard = () => {
        if (!exact(beforeAuthority, authoritySnapshot()) || authorize(structuredClone(binding), entry.data_class) !== true
          || !exact(beforeAuthority, authoritySnapshot())) unavailable();
      };
      guard();
      if (!isAbsolute(entry.source_root) || !isAbsolute(entry.path) || typeof entry.data_class !== 'string') unavailable();
      const root = resolve(entry.source_root), path = resolve(entry.path), rel = relative(root, path);
      if (!rel || rel.startsWith('..') || isAbsolute(rel) || /(?:^|[\\/])(?:\.env(?:\..*)?|credentials?|secrets?)(?:[\\/]|$)/i.test(rel)) unavailable();
      let cursor = path;
      while (true) {
        if (lstatSync(cursor).isSymbolicLink() || realpathSync(cursor) !== cursor) unavailable();
        if (cursor === root) break;
        cursor = dirname(cursor);
      }
      const before = lstatSync(path, { bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maxBytes)) unavailable();
      attempts++;
      const file = await open(path, 'r');
      try {
        guard();
        if (!exact(stamp(before), stamp(await file.stat({ bigint: true })))) unavailable();
        loads++;
        const bytes = await readSourceBytesBounded(file, maxBytes); loadedBytes += bytes.length;
        guard();
        if (!exact(stamp(before), stamp(await file.stat({ bigint: true }))) || !exact(stamp(before), stamp(lstatSync(path, { bigint: true })))
          || hash(bytes) !== binding.source_revision_ref?.content_id || bytes.length > maxBytes) unavailable();
        const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        guard();
        return { binding: structuredClone(binding), body };
      } finally { await file.close(); }
    },
  });
}
