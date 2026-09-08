import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createProtectedWorkingBytes } from './protected_working_bytes.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const roles = { instruction: { filename: 'instruction.txt', maxBytes: 64, mediaType: 'text/plain' },
  validator_trace: { filename: 'validator-trace.txt', maxBytes: 128, mediaType: 'text/plain' } };
async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'protected-working-bytes-'));
  const root = path.join(parent, 'working'); await mkdir(root);
  t.after(() => rm(parent, { recursive: true, force: true }));
  const config = { root, repositoryRoot, storageClass: 'owner_approved_shared_worksite', ownerApprovalRef: 'approval.synthetic-port', roles };
  return { parent, root, config, port: createProtectedWorkingBytes(config) };
}

test('shared port writes exact role bytes once and restores them under independent approved roots', async (t) => {
  const f = await fixture(t);
  await f.port.createGroup('work.synthetic-1');
  const bytes = Buffer.from('A bounded instruction.');
  const ref = await f.port.writeRole({ groupId: 'work.synthetic-1', role: 'instruction', bytes });
  assert.equal(ref.sha256, hash(bytes));
  assert.equal(ref.size, bytes.length);
  assert.deepEqual((await f.port.readRole({ groupId: 'work.synthetic-1', role: 'instruction', expectedSha256: ref.sha256 })).bytes, bytes);
  await assert.rejects(f.port.writeRole({ groupId: 'work.synthetic-1', role: 'instruction', bytes: Buffer.from('replacement') }));
  const restored = path.join(f.parent, 'restored'); await mkdir(restored);
  const readback = createProtectedWorkingBytes({ ...f.config, root: restored });
  await readback.createGroup('work.synthetic-1');
  await copyFile(path.join(f.root, 'work.synthetic-1', 'instruction.txt'), path.join(restored, 'work.synthetic-1', 'instruction.txt'));
  assert.deepEqual((await readback.readRole({ groupId: 'work.synthetic-1', role: 'instruction', expectedSha256: ref.sha256, expectedSize: ref.size })).bytes, bytes);
  assert.equal(Object.values(ref).some(value => typeof value === 'string' && value.includes(f.root)), false);
});

test('role policies are caller-fixed snapshots; paths, device names, unknown roles and missing hash pins fail', async (t) => {
  const f = await fixture(t);
  await f.port.createGroup('work.synthetic-2');
  for (const group of ['../foreign', 'a/b', 'CON', 'NUL.txt', 'trailing.']) await assert.rejects(f.port.createGroup(group));
  for (const filename of ['../foreign', 'a/b', 'C:escape', 'COM1.log', 'trailing.']) {
    assert.throws(() => createProtectedWorkingBytes({ ...f.config, roles: { instruction: { ...roles.instruction, filename } } }));
  }
  await assert.rejects(f.port.writeRole({ groupId: 'work.synthetic-2', role: 'arbitrary', bytes: Buffer.from('x') }));
  await assert.rejects(f.port.writeRole({ groupId: 'work.synthetic-2', role: 'instruction', bytes: Buffer.alloc(65) }));
  await assert.rejects(f.port.readRole({ groupId: 'work.synthetic-2', role: 'instruction' }));
  const mutable = structuredClone(roles);
  const port = createProtectedWorkingBytes({ ...f.config, roles: mutable });
  mutable.instruction.filename = 'foreign.txt'; mutable.extra = { ...roles.instruction };
  await port.writeRole({ groupId: 'work.synthetic-2', role: 'instruction', bytes: Buffer.from('fixed') });
  assert.equal(await readFile(path.join(f.root, 'work.synthetic-2', 'instruction.txt'), 'utf8'), 'fixed');
  await assert.rejects(readFile(path.join(f.root, 'work.synthetic-2', 'foreign.txt')));
});

test('unprovisioned/public/canonical roots and post-write corruption are refused', async (t) => {
  const f = await fixture(t);
  assert.throws(() => createProtectedWorkingBytes({ ...f.config, root: path.join(repositoryRoot, 'public-log') }));
  for (const segment of ['_workmeta', '_workspaces', '.git', 'docs']) {
    assert.throws(() => createProtectedWorkingBytes({ ...f.config, root: path.join(f.parent, segment, 'logs') }));
  }
  const missing = createProtectedWorkingBytes({ ...f.config, root: path.join(f.parent, 'unprovisioned') });
  await assert.rejects(missing.createGroup('work.synthetic'));
  await f.port.createGroup('work.synthetic-3');
  const ref = await f.port.writeRole({ groupId: 'work.synthetic-3', role: 'instruction', bytes: Buffer.from('original') });
  const file = path.join(f.root, 'work.synthetic-3', 'instruction.txt');
  await chmod(file, 0o600); await writeFile(file, 'changed');
  await assert.rejects(f.port.readRole({ groupId: 'work.synthetic-3', role: 'instruction', expectedSha256: ref.sha256 }));
});

test('linked groups are never followed', async (t) => {
  const f = await fixture(t);
  const foreign = path.join(f.parent, 'foreign'); await mkdir(foreign);
  const link = path.join(f.root, 'work.link');
  await symlink(foreign, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.port.writeRole({ groupId: 'work.link', role: 'instruction', bytes: Buffer.from('never') }));
  await assert.rejects(readFile(path.join(foreign, 'instruction.txt')));
});
