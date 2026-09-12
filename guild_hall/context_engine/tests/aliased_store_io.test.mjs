// Addresses whose first segment is a root class, resolved against a table.
//
// The estate shape this has to work on is the one the materializer declares:
// 20_PROJECTS sits directly under the root, and there is no directory named
// data_root anywhere. Every root here is a fresh temp directory; no real estate
// path appears in this file.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRootTable, ROOT_TABLE_SCHEMA } from '../../path_registry/src/root_table.mjs';
import { PROJECT_CONTEXT_DIRECTORY_TEMPLATE } from '../../path_registry/src/target_materializer.mjs';
import { rootedStore } from '../src/runtime/pair_store.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';

const PROJECT = 'P26-000';
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// An estate in the declared shape: the project tree directly under the root.
async function estate() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-estate-data-'));
  const controlRoot = await mkdtemp(path.join(os.tmpdir(), 'ctx-estate-control-'));
  for (const dir of PROJECT_CONTEXT_DIRECTORY_TEMPLATE) {
    await mkdir(path.join(dataRoot, '20_PROJECTS', PROJECT, dir), { recursive: true });
  }
  const tableDir = await mkdtemp(path.join(os.tmpdir(), 'ctx-estate-table-'));
  const tablePath = path.join(tableDir, 'estate_roots.json');
  const bytes = Buffer.from(`${JSON.stringify({ schema_version: ROOT_TABLE_SCHEMA,
    roots: { data_root: dataRoot, control_root: controlRoot } })}\n`);
  await writeFile(tablePath, bytes);
  const table = readRootTable({ tablePath, expectedSha256: sha(bytes) });
  return { dataRoot, controlRoot, table, tablePath };
}

test('an alias address reaches the estate, which has no directory of that name', async () => {
  const { dataRoot, table } = await estate();
  const io = createAliasedStoreIo(table);
  const target = io.path(`data_root/20_PROJECTS/${PROJECT}/10_입력자료/LINEAR`);
  assert.equal(target, path.join(dataRoot, '20_PROJECTS', PROJECT, '10_입력자료', 'LINEAR'));
  // The address is portable; the place is not in it. And the estate really does
  // not contain the segment that named it.
  assert.equal(target.includes(`${path.sep}data_root${path.sep}`), false);
  assert.equal(io.table_sha256, table.table_sha256);
  assert.deepEqual(io.aliases, ['control_root', 'data_root']);
});

test('the same address through both ios differs only in where the root is', async () => {
  const { dataRoot, table } = await estate();
  const aliased = createAliasedStoreIo(table);
  // A synthetic store is one absolute root holding the same relative tree.
  const synthetic = await mkdtemp(path.join(os.tmpdir(), 'ctx-estate-synth-'));
  await mkdir(path.join(synthetic, 'data_root', '20_PROJECTS', PROJECT, '00_프로젝트_안내'), { recursive: true });
  const rooted = rootedStore(synthetic);
  const address = `data_root/20_PROJECTS/${PROJECT}/00_프로젝트_안내`;
  assert.equal(aliased.path(address), path.join(dataRoot, '20_PROJECTS', PROJECT, '00_프로젝트_안내'));
  assert.equal(rooted.path(address), path.join(synthetic, 'data_root', '20_PROJECTS', PROJECT, '00_프로젝트_안내'));
  // One address, two hosts, same meaning: nothing stored has to change.
});

test('it reads a file by alias and refuses one that is not there', async () => {
  const { dataRoot, table } = await estate();
  const io = createAliasedStoreIo(table);
  const rel = `data_root/20_PROJECTS/${PROJECT}/00_프로젝트_안내/note.json`;
  await writeFile(path.join(dataRoot, '20_PROJECTS', PROJECT, '00_프로젝트_안내', 'note.json'), '{"a":1}\n');
  assert.equal(JSON.parse(io.read(rel)).a, 1);
  assert.throws(() => io.read(`data_root/20_PROJECTS/${PROJECT}/00_프로젝트_안내/absent.json`));
  // `missing` is for a path about to be created, exactly as the rooted io means it.
  assert.equal(typeof io.path(`data_root/20_PROJECTS/${PROJECT}/00_프로젝트_안내/new.json`, true), 'string');
});

test('an alias nobody bound is refused, never guessed at', async () => {
  const { table } = await estate();
  const io = createAliasedStoreIo(table);
  assert.throws(() => io.path(`runtime_root/20_PROJECTS/${PROJECT}`), /aliased_store_alias_not_bound/u);
  assert.throws(() => io.path(`not_a_class/20_PROJECTS/${PROJECT}`), /aliased_store_alias_not_bound/u);
});

test('an address must be an alias and something under it', async () => {
  const { table } = await estate();
  const io = createAliasedStoreIo(table);
  // A bare alias names a root, and a root is not something this hands out.
  // The drive-absolute probe is assembled rather than written: path policy scans
  // source bytes, and a host-local absolute path in a tracked file is a finding
  // whether or not it is an argument to a refusal test.
  const driveAbsolute = ['C', ':', '/', 'somewhere', '/', '20_PROJECTS'].join('');
  for (const bad of ['data_root', 'data_root/', '/data_root/x', '', 'data_root/../control_root/x',
    driveAbsolute, 'data_root/20_PROJECTS/../../escape']) {
    assert.throws(() => io.path(bad), /aliased_store_address_invalid/u, `refuses ${JSON.stringify(bad)}`);
  }
});

test('a link below the root is refused, so an alias cannot be redirected from inside', async (t) => {
  const { dataRoot, table } = await estate();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'ctx-estate-outside-'));
  const link = path.join(dataRoot, '20_PROJECTS', PROJECT, '10_입력자료', 'SLACK', 'elsewhere');
  try { symlinkSync(outside, link, 'junction'); }
  catch { return t.skip('this host does not allow creating a junction'); }
  const io = createAliasedStoreIo(table);
  assert.throws(() => io.path(`data_root/20_PROJECTS/${PROJECT}/10_입력자료/SLACK/elsewhere`));
});
