#!/usr/bin/env node
// Isolated copy and pin manifest, never Pack admission or service activation.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isBuiltin, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HWPX_SOURCE_FILES } from '../../../../guild_hall/tool_workshop/src/claude_acp_policy.mjs';
import { intakeOrdinary, intakeBytes, intakeHash, intakeCheck as check, intakeInside } from '../src/work_intake_io.mjs';

const SEEDS = [...HWPX_SOURCE_FILES, 'ui-workspace/apps/dev-erp/tools/work_intake_cli.mjs', 'ui-workspace/apps/dev-erp/tools/work_intake_stage.mjs',
  'ui-workspace/apps/dev-erp/tools/work_intake_packet_reader.py', 'ui-workspace/apps/dev-erp/src/work_intake_http.mjs',
  'guild_hall/tool_workshop/src/claude_acp_cli.mjs', 'guild_hall/tool_workshop/src/claude_acp_workspace.mjs',
  'ui-workspace/apps/dev-erp/docs/WORK_INTAKE_RUNTIME.md', 'ui-workspace/apps/dev-erp/docs/WORK_INTAKE_SHADOW_ADAPTER.md'];
const safeRelative = value => typeof value === 'string' && /^[A-Za-z0-9_.@/-]+$/u.test(value)
  && !path.posix.isAbsolute(value) && value.split('/').every(bit => bit && bit !== '..' && bit !== '.')
  && !value.split('/').some(bit => ['_workmeta', '_workspaces', 'private-state', '.git', '.env'].includes(bit));
async function read(file) { await intakeOrdinary(file); const bytes = await fs.readFile(file); check(bytes.length <= 2000000, 'INTAKE_STAGE_FILE_LIMIT'); return bytes; }
export async function stageWorkIntake({ sourceRoot, targetRoot, dependencyRoot }) {
  await intakeOrdinary(sourceRoot, true); await intakeOrdinary(targetRoot, true);
  check(!intakeInside(sourceRoot, targetRoot) && !intakeInside(targetRoot, sourceRoot), 'INTAKE_STAGE_OVERLAP');
  check(!targetRoot.split(/[\\/]/u).some(bit => ['_workmeta', '_workspaces', 'private-state', '.git'].includes(bit)), 'INTAKE_STAGE_TARGET');
  for (let parent = path.resolve(targetRoot); ; parent = path.dirname(parent)) {
    check(!await fs.lstat(path.join(parent, '.git')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), 'INTAKE_STAGE_TARGET_REPOSITORY');
    if (path.dirname(parent) === parent) break;
  }
  check((await fs.readdir(targetRoot)).length === 0, 'INTAKE_STAGE_TARGET_NOT_EMPTY');
  const dependencies = await fs.realpath(dependencyRoot); await intakeOrdinary(dependencies, true);
  const sourceFiles = new Map(), packages = new Set(), pending = [...SEEDS];
  while (pending.length) {
    const relative = pending.shift(); check(safeRelative(relative), 'INTAKE_STAGE_SOURCE_PATH');
    if (sourceFiles.has(relative)) continue;
    check(sourceFiles.size < 400, 'INTAKE_STAGE_CLOSURE_LIMIT');
    const bytes = await read(path.join(sourceRoot, relative)); sourceFiles.set(relative, bytes);
    if (!relative.endsWith('.mjs')) continue;
    const text = bytes.toString('utf8');
    const imports = [...text.matchAll(/^\s*(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)["']([^"']+)["']/gmu)].map(match => match[1]);
    for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu)) imports.push(match[1]);
    for (const name of imports) {
      if (isBuiltin(name)) continue;
      if (name.startsWith('.')) pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)));
      else packages.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
    }
    for (const match of text.matchAll(/new URL\(\s*["'](\.{1,2}\/[^"']+\.(?:json|yaml))["']\s*,\s*import\.meta\.url\s*\)/gu))
      pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
  const manifest = { version: 1, kind: 'company_work_discovery_isolated_candidate', files: [], packages: [],
    external_requirements: ['Pinned E14 original kit; not vendored', 'Pinned compatible Python environment', 'Independent current source/release/actor bindings'], operational_activation: false };
  let totalBytes = 0;
  async function create(relative, bytes) {
    check(safeRelative(relative), 'INTAKE_STAGE_TARGET_PATH'); totalBytes += bytes.length; check(totalBytes <= 50000000, 'INTAKE_STAGE_SIZE_LIMIT');
    const target = path.join(targetRoot, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await intakeOrdinary(path.dirname(target), true);
    const handle = await fs.open(target, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await intakeBytes({ path: target, sha256: intakeHash(bytes) }, 2000000);
    manifest.files.push({ path: relative, sha256: intakeHash(bytes), bytes: bytes.length });
  }
  for (const [relative, bytes] of sourceFiles) await create(relative, bytes);
  const require = createRequire(path.join(dependencies, '__intake_stage__.cjs'));
  const packageQueue = [...packages], copied = new Set();
  while (packageQueue.length) {
    const name = packageQueue.shift(); if (copied.has(name)) continue;
    check(safeRelative(name) && copied.size < 32, 'INTAKE_STAGE_DEPENDENCY_LIMIT');
    const packageRoot = await fs.realpath(path.dirname(require.resolve(`${name}/package.json`)));
    await intakeOrdinary(packageRoot, true);
    const pkg = JSON.parse(await read(path.join(packageRoot, 'package.json')));
    check(pkg.name === name && typeof pkg.version === 'string', 'INTAKE_STAGE_DEPENDENCY_INVALID');
    copied.add(name); manifest.packages.push({ name, version: pkg.version }); packageQueue.push(...Object.keys(pkg.dependencies ?? {}));
    let count = 0;
    async function walk(dir, prefix = '') {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name, file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await intakeOrdinary(file, true); await walk(file, relative); }
        else { check(++count <= 2000, 'INTAKE_STAGE_DEPENDENCY_LIMIT'); await create(`node_modules/${name}/${relative}`, await read(file)); }
      }
    }
    await walk(packageRoot);
  }
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await fs.writeFile(path.join(targetRoot, 'work-intake-stage.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await stageWorkIntake({ sourceRoot: process.argv[2], targetRoot: process.argv[3], dependencyRoot: process.argv[4] });
    console.log(JSON.stringify({ status: 'STAGED', files: result.files.length, packages: result.packages, operational_activation: false }));
  } catch { console.log('{"status":"HOLD","code":"INTAKE_STAGE_FAILED"}'); process.exitCode = 1; }
}
