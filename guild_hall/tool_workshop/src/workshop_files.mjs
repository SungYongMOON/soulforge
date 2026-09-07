import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function reject(code) { const error = new Error(code); error.code = code; throw error; }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function exactKeys(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !keys.includes(key))) reject('unexpected_fields');
}
export function directPath(value, directory = false) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) reject('absolute_path_required');
  const resolved = path.resolve(value);
  let current = resolved;
  for (;;) {
    const entry = lstatSync(current);
    if (entry.isSymbolicLink()) reject('path_link_forbidden');
    if (current === resolved && (directory ? !entry.isDirectory() : !entry.isFile() || entry.nlink !== 1)) reject('path_type_invalid');
    if (current === path.dirname(current)) break;
    current = path.dirname(current);
  }
  if (realpathSync(resolved).toLowerCase() !== resolved.toLowerCase()) reject('path_alias_forbidden');
  return resolved;
}
export function boundedRead(file, maxBytes, allowEmpty = false) {
  directPath(file);
  const entry = lstatSync(file);
  if ((!allowEmpty && entry.size < 1) || entry.size > maxBytes) reject('file_size_invalid');
  const bytes = readFileSync(file);
  if (bytes.length !== entry.size) reject('file_changed');
  return bytes;
}
export function disjointRoots(roots) {
  const normalized = roots.map(root => directPath(root, true).toLowerCase());
  for (let a = 0; a < normalized.length; a++) for (let b = a + 1; b < normalized.length; b++) {
    if (normalized[a] === normalized[b] || normalized[a].startsWith(normalized[b]+path.sep) || normalized[b].startsWith(normalized[a]+path.sep)) reject('roots_overlap');
  }
}
