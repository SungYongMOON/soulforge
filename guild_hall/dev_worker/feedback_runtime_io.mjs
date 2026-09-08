import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const runtimeHash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const runtimeRef = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u.test(value);
export const runtimeFail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
export function runtimeCheck(condition, code) { if (!condition) runtimeFail(code); }
export const runtimeExact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export const runtimeInside = (a, b) => { const r = path.relative(a, b); return !r || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`)); };
export async function runtimeOrdinary(target, directory = false) {
  runtimeCheck(typeof target === 'string' && path.isAbsolute(target) && !/^(?:\\\\|\/\/)/u.test(target), 'FEEDBACK_RUNTIME_PATH_INVALID');
  target = path.resolve(target);
  for (let p = target; ; p = path.dirname(p)) {
    const stat = await fs.lstat(p);
    runtimeCheck(!stat.isSymbolicLink() && (p === target && !directory ? stat.isFile() && stat.nlink === 1 : stat.isDirectory()), 'FEEDBACK_RUNTIME_PATH_UNSAFE');
    if (path.dirname(p) === p) break;
  }
  runtimeCheck(same(await fs.realpath(target), target), 'FEEDBACK_RUNTIME_PATH_UNSAFE');
  return target;
}
export async function readRuntimeBytes(file, expected = null, maxBytes = 1_048_576) {
  await runtimeOrdinary(file);
  const identity = s => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.nlink}`;
  const before = await fs.lstat(file);
  runtimeCheck(before.size <= maxBytes, 'FEEDBACK_RUNTIME_SIZE_LIMIT');
  const handle = await fs.open(file, 'r');
  try {
    runtimeCheck(identity(await handle.stat()) === identity(before), 'FEEDBACK_RUNTIME_FILE_CHANGED');
    const bytes = await handle.readFile();
    runtimeCheck(identity(await handle.stat()) === identity(before) && identity(await fs.lstat(file)) === identity(before), 'FEEDBACK_RUNTIME_FILE_CHANGED');
    await runtimeOrdinary(file);
    if (expected !== null) runtimeCheck(/^[a-f0-9]{64}$/u.test(expected) && runtimeHash(bytes) === expected, 'FEEDBACK_RUNTIME_PIN_CHANGED');
    return bytes;
  } finally { await handle.close(); }
}
export async function readRuntimeJson(descriptor, maxBytes) {
  runtimeCheck(runtimeExact(descriptor, ['path', 'sha256']) && descriptor.path.endsWith('.json')
    && !/(?:^|[\\/_.-])(?:credentials?|secrets?|passwords?|cookies?|tokens?|sessions?)(?:[\\/_.-]|$)/iu.test(descriptor.path), 'FEEDBACK_RUNTIME_DESCRIPTOR_INVALID');
  const bytes = await readRuntimeBytes(descriptor.path, descriptor.sha256, maxBytes);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function writeRuntimeEvidence(root, kind, identity, value) {
  runtimeCheck(/^[a-z][a-z0-9-]{0,39}$/u.test(kind), 'FEEDBACK_RUNTIME_EVIDENCE_KIND');
  await runtimeOrdinary(root, true);
  const ref = `feedback.${kind}.${runtimeHash(identity).slice(0, 32)}`;
  const target = path.join(root, `${ref}.json`), bytes = Buffer.from(JSON.stringify(value));
  runtimeCheck(bytes.length <= 2_000_000, 'FEEDBACK_RUNTIME_EVIDENCE_SIZE');
  try {
    const file = await fs.open(target, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const stored = await readRuntimeBytes(target, runtimeHash(bytes), 2_000_000);
  return { ref, sha256: runtimeHash(stored) };
}
