import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { stageFeedbackRuntime, verifyFeedbackRuntimeStage } from './feedback_runtime_stage.mjs';
import { HWPX_SOURCE_FILES } from '../tool_workshop/src/claude_acp_policy.mjs';

const entry = 'guild_hall/dev_worker/feedback_runtime_cli.mjs';
const stager = 'guild_hall/dev_worker/feedback_runtime_stage.mjs';
const acp = 'guild_hall/tool_workshop/src/claude_acp_cli.mjs';
const stageFile = fileURLToPath(new URL('./feedback_runtime_stage.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const errorCode = expected => error => error.feedbackCode === expected;

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-stage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source'), targetRoot = path.join(root, 'installed'), dependencyRoot = path.join(root, 'dependencies');
  await Promise.all([fs.mkdir(sourceRoot), fs.mkdir(targetRoot), fs.mkdir(path.join(dependencyRoot, 'yaml'), { recursive: true })]);
  const put = async (relative, content) => { await fs.mkdir(path.dirname(path.join(sourceRoot, relative)), { recursive: true }); await fs.writeFile(path.join(sourceRoot, relative), content); };
  await put(stager, await fs.readFile(stageFile));
  await put(entry, "import {mode} from './runtime.mjs';\nif(process.argv[2]==='--help')console.log('worker|watchdog '+mode);\n");
  await put('guild_hall/dev_worker/runtime.mjs', "import yaml from 'yaml';\nexport const mode=typeof yaml;\nexport async function adapter(){return import('./adapter.mjs');}\n");
  await put('guild_hall/dev_worker/adapter.mjs', 'export const adapter = true;\n');
  await put(acp, 'export const acp = true;\n');
  await put('guild_hall/tool_workshop/src/claude_acp_policy.mjs',
    `export const HWPX_SOURCE_FILES=${JSON.stringify(HWPX_SOURCE_FILES)};\n`);
  const dataFiles = [...HWPX_SOURCE_FILES.filter(file => !file.endsWith('.mjs')),
    'guild_hall/secure_work/src/soulforge_secure_work/feedback_currentness_pipe.py',
    'guild_hall/secure_work/src/soulforge_secure_work/ipc_pipe.py'];
  for (const file of dataFiles) await put(file, '# synthetic data closure; never executed\n');
  await fs.writeFile(path.join(dependencyRoot, 'yaml/package.json'), JSON.stringify({ name: 'yaml', version: '0.0.0-synthetic', main: 'index.js' }));
  await fs.writeFile(path.join(dependencyRoot, 'yaml/index.js'), 'module.exports={};\n');
  return { root, sourceRoot, targetRoot, dependencyRoot, put, dataFiles };
}

test('stages closure and literal dynamic dependency, then installed worker/watchdog help and verify CLI run', async t => {
  const f = await fixture(t), result = await stageFeedbackRuntime(f);
  assert.equal(result.status, 'VERIFIED_STAGE_ONLY'); assert.equal(result.activation, false);
  assert.equal(result.file_count, 6 + f.dataFiles.length);
  const help = spawnSync(process.execPath, [path.join(f.targetRoot, entry), '--help'], { cwd: f.targetRoot, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /worker\|watchdog/u);
  const verify = spawnSync(process.execPath, [path.join(f.targetRoot, stager), 'verify', '--target-root', f.targetRoot], { cwd: f.targetRoot, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(verify.status, 0, verify.stderr); assert.equal(JSON.parse(verify.stdout).activation, false);
  assert.equal((await fs.lstat(path.join(f.targetRoot, 'node_modules'))).isSymbolicLink(), true);
  assert.equal(await fs.realpath(path.join(f.targetRoot, 'node_modules')), await fs.realpath(f.dependencyRoot));
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_TARGET_NOT_EMPTY'));
});

test('refuses populated or foreign repo/control target without changes', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.targetRoot, 'existing'), 'preserve');
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_TARGET_NOT_EMPTY'));
  assert.deepEqual(await fs.readdir(f.targetRoot), ['existing']);
  const foreign = path.join(f.root, 'foreign'); await fs.mkdir(path.join(foreign, '.git'), { recursive: true });
  const foreignTarget = path.join(foreign, 'target'); await fs.mkdir(foreignTarget);
  await assert.rejects(stageFeedbackRuntime({ ...f, targetRoot: foreignTarget }), errorCode('STAGE_TARGET_IN_REPOSITORY'));
  for (const control of ['_workmeta', '_workspaces', 'private-state', '.workflow']) {
    const target = path.join(f.root, control); await fs.mkdir(target);
    await assert.rejects(stageFeedbackRuntime({ ...f, targetRoot: target }), errorCode('STAGE_TARGET_FORBIDDEN'));
  }
});

test('rejects junction target and linked source file', async t => {
  const f = await fixture(t), alias = path.join(f.root, 'target-alias');
  await fs.symlink(f.targetRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stageFeedbackRuntime({ ...f, targetRoot: alias }), errorCode('STAGE_PATH_UNSAFE'));
  await fs.link(path.join(f.sourceRoot, entry), path.join(f.root, 'entry-hardlink.mjs'));
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_PATH_UNSAFE'));
  assert.deepEqual(await fs.readdir(f.targetRoot), []);
});

test('unknown bare dependency and computed import are not silently staged', async t => {
  const f = await fixture(t);
  await f.put('guild_hall/dev_worker/runtime.mjs', "import x from 'unapproved-library';\nexport const mode=x;\n");
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_DEPENDENCY_UNSUPPORTED'));
  await f.put('guild_hall/dev_worker/runtime.mjs', "export const mode=1;\nexport async function x(name){return import(name);}\n");
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_COMPUTED_IMPORT_UNSUPPORTED'));
  assert.deepEqual(await fs.readdir(f.targetRoot), []);
});

test('verify detects code and dependency byte drift plus unexpected files', async t => {
  const f = await fixture(t); await stageFeedbackRuntime(f);
  const installed = path.join(f.targetRoot, 'guild_hall/dev_worker/adapter.mjs'), before = await fs.readFile(installed);
  await fs.appendFile(installed, '// changed\n');
  await assert.rejects(verifyFeedbackRuntimeStage(f), errorCode('STAGE_CODE_CHANGED'));
  await fs.writeFile(installed, before);
  const dep = path.join(f.dependencyRoot, 'yaml/index.js'), depBefore = await fs.readFile(dep);
  await fs.appendFile(dep, '// changed\n');
  await assert.rejects(verifyFeedbackRuntimeStage(f), errorCode('STAGE_DEPENDENCY_CHANGED'));
  await fs.writeFile(dep, depBefore);
  await fs.writeFile(path.join(f.targetRoot, 'unexpected.json'), '{}');
  await assert.rejects(verifyFeedbackRuntimeStage(f), errorCode('STAGE_UNEXPECTED_FILES'));
});

test('concurrent staging cannot overwrite target or silently adopt partial output', async t => {
  const f = await fixture(t);
  const outcomes = await Promise.allSettled([stageFeedbackRuntime(f), stageFeedbackRuntime(f)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
  assert.equal((await verifyFeedbackRuntimeStage(f)).status, 'VERIFIED_STAGE_ONLY');
});

test('source change during copy leaves an unaccepted partial stage and cannot be replayed over', async t => {
  const f = await fixture(t);
  const pending = stageFeedbackRuntime(f);
  // Attach rejection observation immediately while waiting for the reservation.
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  const reservation = path.join(f.targetRoot, '.feedback-runtime-stage-reservation');
  let observed = false;
  for (let i = 0; i < 1000; i++) {
    if (await fs.lstat(reservation).then(() => true, () => false)) { observed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(observed, true);
  await fs.appendFile(path.join(f.sourceRoot, entry), '// concurrent edit\n');
  const result = await outcome;
  assert.equal(result.error?.feedbackCode, 'STAGE_SOURCE_CHANGED');
  await assert.rejects(fs.lstat(path.join(f.targetRoot, 'feedback-runtime-stage.json')), { code: 'ENOENT' });
  await assert.rejects(stageFeedbackRuntime(f), errorCode('STAGE_TARGET_NOT_EMPTY'));
});

test('real runtime installed CLI startup resolves full code/yaml and ACP closure from temp stage', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-real-stage-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await stageFeedbackRuntime({ sourceRoot: repository, targetRoot: root, dependencyRoot: path.join(repository, 'node_modules') });
  assert.ok(result.file_count > 10); assert.equal(result.entrypoints.worker, entry); assert.equal(result.entrypoints.watchdog, entry);
  const cli = spawnSync(process.execPath, [path.join(root, entry), '--help'], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /worker\|watchdog\|inspect/u);
  const acpHelp = spawnSync(process.execPath, [path.join(root, acp), '--help'], { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  assert.equal(acpHelp.status, 0, acpHelp.stderr); assert.match(acpHelp.stdout, /scoped Claude ACP/u);
  const importAdapter = spawnSync(process.execPath, ['--input-type=module', '-e', "const m=await import('./guild_hall/dev_worker/feedback_runtime_acp.mjs');if(typeof m.createFeedbackRuntimeAcp!=='function')process.exitCode=1;"],
    { cwd: root, encoding: 'utf8', timeout: 10_000, windowsHide: true });
  assert.equal(importAdapter.status, 0, importAdapter.stderr);
  assert.equal((await verifyFeedbackRuntimeStage({ targetRoot: root })).manifest_sha256, result.manifest_sha256);
});
