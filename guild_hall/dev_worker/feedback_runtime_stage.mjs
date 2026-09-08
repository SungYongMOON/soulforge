#!/usr/bin/env node
// App-local stage/checksum receipt only: no Pack admission, service registration,
// model startup, trust flags, deployment approval, or authority is created here.
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HWPX_SOURCE_FILES } from '../tool_workshop/src/claude_acp_policy.mjs';

const ENTRY = 'guild_hall/dev_worker/feedback_runtime_cli.mjs';
const STAGER = 'guild_hall/dev_worker/feedback_runtime_stage.mjs';
const ACP = 'guild_hall/tool_workshop/src/claude_acp_cli.mjs';
const DATA = [...HWPX_SOURCE_FILES.filter(file => !file.endsWith('.mjs')),
  'guild_hall/secure_work/src/soulforge_secure_work/feedback_currentness_pipe.py',
  'guild_hall/secure_work/src/soulforge_secure_work/ipc_pipe.py'];
const SEEDS = [ENTRY, ACP, STAGER, ...DATA];
const RECEIPT = 'feedback-runtime-stage.json';
const RESERVATION = '.feedback-runtime-stage-reservation';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
const fold = p => process.platform === 'win32' ? p.toLowerCase() : p;
const same = (a, b) => fold(path.resolve(a)) === fold(path.resolve(b));
const inside = (a, b) => { const r = path.relative(fold(a), fold(b)); return !r || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`)); };
const identity = s => `${s.dev}:${s.ino}:${s.mode}`;
const fingerprint = s => `${identity(s)}:${s.nlink}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;

function relativeFile(value) {
  if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(value)
    || value.split('/').some(p => p === '.' || p === '..' || /[. ]$/u.test(p) || /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/iu.test(p)
      || /^(?:_workmeta|_workspaces|private-state|\.git|\.env)$/iu.test(p)
      || /(?:^|[_.-])(?:credentials?|secrets?|passwords?|cookies?|tokens?)(?:[_.-]|$)/iu.test(p))) fail('STAGE_PATH_INVALID');
  return value;
}
async function ordinary(full, directory = false) {
  if (typeof full !== 'string' || !path.isAbsolute(full) || /[\u0000-\u001f]/u.test(full)) fail('STAGE_ROOT_INVALID');
  full = path.resolve(full);
  for (let current = full; ; current = path.dirname(current)) {
    const stat = await fs.lstat(current, { bigint: true });
    if (stat.isSymbolicLink() || !same(await fs.realpath(current), current)
      || (current === full && !directory ? !stat.isFile() || stat.nlink !== 1n : !stat.isDirectory())) fail('STAGE_PATH_UNSAFE');
    if (path.dirname(current) === current) break;
  }
  return full;
}
async function read(full, max = 5_000_000) {
  await ordinary(full);
  const before = await fs.lstat(full, { bigint: true });
  if (before.size > BigInt(max)) fail('STAGE_FILE_TOO_LARGE');
  const handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (fingerprint(before) !== fingerprint(await handle.stat({ bigint: true }))) fail('STAGE_SOURCE_CHANGED');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) { const r = await handle.read(bytes, length, bytes.length - length, length); if (!r.bytesRead) break; length += r.bytesRead; }
    if (length !== Number(before.size) || fingerprint(before) !== fingerprint(await handle.stat({ bigint: true }))
      || fingerprint(before) !== fingerprint(await fs.lstat(full, { bigint: true }))) fail('STAGE_SOURCE_CHANGED');
    await ordinary(full);
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}
async function externalTarget(target) {
  const root = await ordinary(target, true);
  if (root.split(path.sep).some(p => /^(?:_workmeta|_workspaces|private-state|\.git|\.codex|\.registry|\.workflow|\.party|\.mission|\.unit)$/iu.test(p))) fail('STAGE_TARGET_FORBIDDEN');
  for (let current = root; ; current = path.dirname(current)) {
    if (await fs.lstat(path.join(current, '.git')).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; })) fail('STAGE_TARGET_IN_REPOSITORY');
    if (path.dirname(current) === current) break;
  }
  return root;
}
function imports(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes), result = new Set();
  // Intentionally bounded ESM grammar: ordinary static imports/reexports and
  // literal dynamic imports. Unsupported computed imports fail closed.
  for (const m of source.matchAll(/^\s*(?:import\s+(?:[^;]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)["']([^"']+)["']/gmu)) result.add(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(([^)]*)\)/gu)) {
    const literal = /^\s*["']([^"']+)["']\s*$/u.exec(m[1]);
    if (!literal) fail('STAGE_COMPUTED_IMPORT_UNSUPPORTED');
    result.add(literal[1]);
  }
  return [...result];
}
async function closure(root) {
  const files = new Map(), pending = [...SEEDS]; let total = 0;
  while (pending.length) {
    const relative = relativeFile(pending.shift());
    if (files.has(relative)) continue;
    if ((!relative.endsWith('.mjs') && !DATA.includes(relative)) || files.size >= 256) fail('STAGE_CLOSURE_INVALID');
    const bytes = await read(path.join(root, relative)); total += bytes.length;
    if (total > 20_000_000) fail('STAGE_CLOSURE_TOO_LARGE');
    files.set(relative, bytes);
    if (!relative.endsWith('.mjs')) continue;
    for (const specifier of imports(bytes)) {
      if (specifier.startsWith('node:') && isBuiltin(specifier)) continue;
      if (specifier === 'yaml') continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('STAGE_DEPENDENCY_UNSUPPORTED');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      relativeFile(resolved); pending.push(resolved);
    }
  }
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
async function yamlPins(dependencyRoot) {
  const root = await ordinary(path.join(dependencyRoot, 'yaml'), true), pins = [];
  const walk = async (dir, relative = '') => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = relativeFile(relative ? `${relative}/${entry.name}` : entry.name), full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await ordinary(full, true); await walk(full, rel); }
      else { const bytes = await read(full); pins.push({ path: rel, sha256: sha(bytes), bytes: bytes.length }); }
      if (pins.length > 1000) fail('STAGE_DEPENDENCY_TOO_LARGE');
    }
  };
  await walk(root);
  const pkg = JSON.parse(await read(path.join(root, 'package.json')));
  if (pkg.name !== 'yaml' || typeof pkg.version !== 'string' || Object.keys(pkg.dependencies ?? {}).length) fail('STAGE_DEPENDENCY_UNSUPPORTED');
  return { name: 'yaml', version: pkg.version, files: pins.sort((a, b) => a.path.localeCompare(b.path)) };
}
async function create(full, bytes) {
  await ordinary(path.dirname(full), true);
  const handle = await fs.open(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  if (!(await read(full)).equals(Buffer.from(bytes))) fail('STAGE_WRITE_READBACK_FAILED');
}
async function treeFiles(root) {
  const result = [];
  const walk = async (dir, rel = '') => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await ordinary(full, true); await walk(full, name); }
      else { await ordinary(full); result.push(name); }
    }
  };
  await walk(root); return result.sort();
}

export async function stageFeedbackRuntime({ sourceRoot, targetRoot, dependencyRoot } = {}) {
  const source = await ordinary(sourceRoot, true), target = await externalTarget(targetRoot);
  // Reuse of a caller-selected node_modules junction is explicit; its resolved
  // backing tree and yaml bytes are pinned, not the surrounding checkout.
  if (typeof dependencyRoot !== 'string' || !path.isAbsolute(dependencyRoot)) fail('STAGE_DEPENDENCY_INVALID');
  const dependency = await ordinary(await fs.realpath(dependencyRoot), true);
  if (inside(source, target) || inside(target, source) || inside(target, dependency) || inside(dependency, target)) fail('STAGE_ROOT_OVERLAP');
  if ((await fs.readdir(target)).length) fail('STAGE_TARGET_NOT_EMPTY');
  const targetIdentity = identity(await fs.lstat(target, { bigint: true }));
  const files = await closure(source), yaml = await yamlPins(dependency);
  if ((await fs.readdir(target)).length) fail('STAGE_TARGET_NOT_EMPTY');
  await create(path.join(target, RESERVATION), 'stage-only; incomplete until verified manifest\n');
  for (const [relative, bytes] of files) {
    let dir = target;
    for (const bit of relative.split('/').slice(0, -1)) {
      dir = path.join(dir, bit);
      await fs.mkdir(dir).catch(e => { if (e.code !== 'EEXIST') throw e; }); await ordinary(dir, true);
    }
    await create(path.join(target, relative), bytes);
  }
  await fs.symlink(dependency, path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // Re-read the entire source snapshot before recording success. A concurrently
  // edited source/dependency leaves a populated HOLD directory, never overwritten.
  for (const [relative, bytes] of files) if (!(await read(path.join(source, relative))).equals(bytes)) fail('STAGE_SOURCE_CHANGED');
  if (JSON.stringify(await yamlPins(dependency)) !== JSON.stringify(yaml)) fail('STAGE_DEPENDENCY_CHANGED');
  if (identity(await fs.lstat(target, { bigint: true })) !== targetIdentity) fail('STAGE_TARGET_CHANGED');
  const manifest = { stage_only: true, activation: false, entrypoints: { worker: ENTRY, watchdog: ENTRY, acp: ACP, verify: STAGER },
    dependency_root: dependency, yaml, files: [...files].map(([relative, bytes]) => ({ path: relative, sha256: sha(bytes), bytes: bytes.length })) };
  await create(path.join(target, RECEIPT), JSON.stringify(manifest) + '\n');
  return verifyFeedbackRuntimeStage({ targetRoot: target });
}

export async function verifyFeedbackRuntimeStage({ targetRoot } = {}) {
  const target = await externalTarget(targetRoot), manifestBytes = await read(path.join(target, RECEIPT));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.stage_only !== true || manifest.activation !== false || JSON.stringify(manifest.entrypoints) !== JSON.stringify({ worker: ENTRY, watchdog: ENTRY, acp: ACP, verify: STAGER })
    || !Array.isArray(manifest.files) || !manifest.files.length) fail('STAGE_MANIFEST_INVALID');
  const dependency = await ordinary(manifest.dependency_root, true), link = path.join(target, 'node_modules');
  if (!(await fs.lstat(link)).isSymbolicLink() || !same(await fs.realpath(link), dependency)) fail('STAGE_DEPENDENCY_CHANGED');
  if (inside(target, dependency) || inside(dependency, target)) fail('STAGE_ROOT_OVERLAP');
  const files = await closure(target), pins = [...files].map(([relative, bytes]) => ({ path: relative, sha256: sha(bytes), bytes: bytes.length }));
  if (JSON.stringify(pins) !== JSON.stringify(manifest.files)) fail('STAGE_CODE_CHANGED');
  if (JSON.stringify(await yamlPins(dependency)) !== JSON.stringify(manifest.yaml)) fail('STAGE_DEPENDENCY_CHANGED');
  if (JSON.stringify(await treeFiles(target)) !== JSON.stringify([...files.keys(), RECEIPT, RESERVATION].sort())) fail('STAGE_UNEXPECTED_FILES');
  if ((await read(path.join(target, RESERVATION))).toString() !== 'stage-only; incomplete until verified manifest\n') fail('STAGE_RESERVATION_CHANGED');
  return { status: 'VERIFIED_STAGE_ONLY', activation: false, file_count: pins.length, yaml_version: manifest.yaml.version,
    manifest_sha256: sha(manifestBytes), entrypoints: manifest.entrypoints };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { console.log('stage --source-root <absolute> --target-root <existing-empty-absolute> --dependency-root <existing-node_modules> | verify --target-root <absolute>'); return; }
  const mode = args[0], options = {}, keys = new Map([['--source-root', 'sourceRoot'], ['--target-root', 'targetRoot'], ['--dependency-root', 'dependencyRoot']]);
  if (!['stage', 'verify'].includes(mode) || args.length !== (mode === 'stage' ? 7 : 3)) fail('STAGE_ARGUMENTS_INVALID');
  for (let i = 1; i < args.length; i += 2) {
    const key = keys.get(args[i]); if (!key || Object.hasOwn(options, key) || !args[i + 1] || (mode === 'verify' && key !== 'targetRoot')) fail('STAGE_ARGUMENTS_INVALID'); options[key] = args[i + 1];
  }
  console.log(JSON.stringify(await (mode === 'stage' ? stageFeedbackRuntime(options) : verifyFeedbackRuntimeStage(options))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(JSON.stringify({ status: 'HOLD', code: error.feedbackCode ?? 'STAGE_FAILED' })); process.exitCode = 2;
});
