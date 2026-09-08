import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isSafeRef } from '../agent_observation/guard_primitives.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u;
const SHA = /^sha256:[a-f0-9]{64}$/u;
const safeSegment = (value) => typeof value === 'string' && ID.test(value) && !value.endsWith('.')
  && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value);
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const check = (value, code) => { if (!value) fail(code); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const contains = (a, b) => { const relative = path.relative(a, b); return !relative || (relative !== '..'
  && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const identity = (stat) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.nlink}`;

/** Fixed-role create-only working bytes; no execution, ledger, promotion or acceptance.
 * ownerApprovalRef IDENTIFIES a binding already authorized by the caller. Its
 * presence/string syntax does not prove permission. Each caller fixes its own
 * role allowlist and applies content/metadata policy before calling this port.
 * The port never provisions the root, follows a caller path, deletes partial
 * writes, overwrites an existing role, or returns a local storage path.
 */
export function createProtectedWorkingBytes({ root, repositoryRoot, storageClass, ownerApprovalRef, roles } = {}) {
  check(typeof root === 'string' && path.isAbsolute(root) && path.normalize(root) === root
    && path.parse(root).root !== root && typeof repositoryRoot === 'string' && path.isAbsolute(repositoryRoot)
    && storageClass === 'owner_approved_shared_worksite' && typeof ownerApprovalRef === 'string'
    && isSafeRef(ownerApprovalRef), 'protected_bytes_binding_required');
  check(!contains(repositoryRoot, root) && !contains(root, repositoryRoot), 'protected_bytes_repository_overlap');
  check(!root.split(path.sep).some((segment) => ['_workmeta', '_workspaces', '.git', '.workflow', '.registry', 'guild_hall', 'docs']
    .includes(segment.toLowerCase())), 'protected_bytes_forbidden_root');
  let fixedRoles;
  try { fixedRoles = structuredClone(roles); } catch { fail('protected_bytes_roles_invalid'); }
  check(fixedRoles && typeof fixedRoles === 'object' && !Array.isArray(fixedRoles)
    && Object.keys(fixedRoles).length > 0 && Object.keys(fixedRoles).length <= 16, 'protected_bytes_roles_invalid');
  const filenames = new Set();
  for (const [role, spec] of Object.entries(fixedRoles)) {
    check(safeSegment(role) && spec && Object.keys(spec).length === 3 && safeSegment(spec.filename)
      && Number.isSafeInteger(spec.maxBytes) && spec.maxBytes > 0 && spec.maxBytes <= 32 * 1024 * 1024
      && typeof spec.mediaType === 'string' && /^[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+$/u.test(spec.mediaType)
      && !filenames.has(spec.filename.toLowerCase()), 'protected_bytes_roles_invalid');
    filenames.add(spec.filename.toLowerCase()); Object.freeze(spec);
  }
  Object.freeze(fixedRoles);
  let rootIdentity;
  async function checkRoot() {
    const repository = await lstat(repositoryRoot);
    check(repository.isDirectory() && !repository.isSymbolicLink()
      && samePath(await realpath(repositoryRoot), path.resolve(repositoryRoot)), 'protected_bytes_repository_unsafe');
    for (let cursor = root; ; cursor = path.dirname(cursor)) {
      const stat = await lstat(cursor);
      check(stat.isDirectory() && !stat.isSymbolicLink(), 'protected_bytes_root_unsafe');
      if (cursor === root) {
        const observed = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
        check(!rootIdentity || rootIdentity === observed, 'protected_bytes_root_changed');
        rootIdentity ??= observed;
      }
      if (path.dirname(cursor) === cursor) break;
    }
    check(samePath(await realpath(root), root), 'protected_bytes_root_unsafe');
  }
  async function groupDirectory(groupId, create = false) {
    check(safeSegment(groupId), 'protected_bytes_group_invalid');
    await checkRoot();
    const target = path.join(root, groupId);
    if (create) await mkdir(target);
    const stat = await lstat(target);
    check(stat.isDirectory() && !stat.isSymbolicLink() && samePath(await realpath(target), target), 'protected_bytes_group_unsafe');
    return target;
  }
  function roleSpec(role) {
    check(typeof role === 'string' && Object.hasOwn(fixedRoles, role), 'protected_bytes_role_forbidden');
    return fixedRoles[role];
  }
  async function readStored(groupId, role) {
    const spec = roleSpec(role);
    const target = path.join(await groupDirectory(groupId), spec.filename);
    const before = await lstat(target);
    check(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= spec.maxBytes,
      'protected_bytes_file_unsafe');
    const file = await open(target, 'r');
    try {
      check(identity(await file.stat()) === identity(before), 'protected_bytes_file_changed');
      const bytes = await file.readFile();
      check(identity(await file.stat()) === identity(before) && identity(await lstat(target)) === identity(before),
        'protected_bytes_file_changed');
      return bytes;
    } finally { await file.close(); }
  }
  return Object.freeze({
    async createGroup(groupId) { await groupDirectory(groupId, true); return Object.freeze({ groupId }); },
    async writeRole({ groupId, role, bytes }) {
      const spec = roleSpec(role);
      check(Buffer.isBuffer(bytes) && bytes.length <= spec.maxBytes, 'protected_bytes_size_invalid');
      const immutableBytes = Buffer.from(bytes);
      const file = await open(path.join(await groupDirectory(groupId), spec.filename), 'wx', 0o400);
      try { await file.writeFile(immutableBytes); await file.sync(); } finally { await file.close(); }
      const stored = await readStored(groupId, role);
      check(stored.equals(immutableBytes), 'protected_bytes_readback_failed');
      return Object.freeze({ sha256: digest(stored), size: stored.length, mediaType: spec.mediaType });
    },
    async readRole({ groupId, role, expectedSha256, expectedSize }) {
      const spec = roleSpec(role);
      check(SHA.test(expectedSha256) && (expectedSize === undefined || (Number.isSafeInteger(expectedSize)
        && expectedSize >= 0 && expectedSize <= spec.maxBytes)), 'protected_bytes_read_pin_required');
      const bytes = await readStored(groupId, role);
      check(digest(bytes) === expectedSha256 && (expectedSize === undefined || bytes.length === expectedSize),
        'protected_bytes_digest_mismatch');
      return { bytes, sha256: expectedSha256, size: bytes.length, mediaType: spec.mediaType };
    },
  });
}
