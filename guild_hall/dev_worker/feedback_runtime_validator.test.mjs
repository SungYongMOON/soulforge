import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapturedValidator, deriveValidatorCaptureId } from './feedback_runtime_validator.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const wrapper = fileURLToPath(new URL('./feedback_runtime_validator.mjs', import.meta.url));
async function fixture(t, source = "console.log('validated');") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-capture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const candidateRoot = path.join(root, 'feedback-0123456789abcdef01234567'), repoRoot = path.join(root, 'repo'), evidenceRoot = path.join(root, 'evidence');
  await Promise.all([fs.mkdir(path.join(candidateRoot, 'checks'), { recursive: true }), fs.mkdir(repoRoot), fs.mkdir(evidenceRoot)]);
  const validator = 'checks/validate.mjs'; await fs.writeFile(path.join(candidateRoot, validator), source);
  return { root, candidateRoot, repoRoot, evidenceRoot, validator, sha256: hash(source) };
}
async function receipt(result) { return JSON.parse(await fs.readFile(result.receipt_path, 'utf8')); }
const code = expected => error => error.feedbackCode === expected;

test('captures exact bytes, hashes, candidate binding, metadata-only result and replay HOLD', async t => {
  const f = await fixture(t, "process.stdout.write(Buffer.from([0,255,65])); process.stderr.write('public warning');");
  const result = await runCapturedValidator(f), saved = await receipt(result);
  assert.equal(result.exit_code, 0); assert.equal(saved.exit_code, 0); assert.equal(saved.closed, true);
  assert.equal(saved.candidate_ref, 'feedback.candidate.0123456789abcdef01234567');
  assert.equal(saved.candidate_path, f.candidateRoot); assert.equal(saved.validator_sha256, f.sha256);
  assert.deepEqual(Buffer.from(saved.stdout, 'base64'), Buffer.from([0, 255, 65]));
  assert.equal(saved.stdout_sha256, hash(Buffer.from([0, 255, 65])));
  assert.equal(Buffer.from(saved.stderr, 'base64').toString(), 'public warning');
  assert.equal(saved.stderr_sha256, hash('public warning')); assert.equal(saved.output_complete, true);
  assert.equal(saved.stdout_bytes, 3); assert.equal(saved.stdout_captured_bytes, 3);
  assert.equal(result.receipt_sha256, hash(await fs.readFile(result.receipt_path)));
  assert.equal('stdout' in result, false);
  const id = deriveValidatorCaptureId({ cwd: f.candidateRoot, validator: f.validator, sha256: f.sha256 });
  assert.equal(path.basename(result.receipt_path), `feedback-validator-${id}.json`);
  const before = await fs.readFile(result.receipt_path);
  await assert.rejects(runCapturedValidator(f), code('CAPTURE_REPLAY_HOLD'));
  assert.deepEqual(await fs.readFile(result.receipt_path), before);
  assert.equal((await fs.readdir(f.evidenceRoot)).length, 2);
});

test('returns actual failing validator exit code and preserves both streams', async t => {
  const f = await fixture(t, "console.log('FAIL');console.error('expected mismatch');process.exitCode=9;");
  const result = await runCapturedValidator(f), saved = await receipt(result);
  assert.equal(result.exit_code, 9); assert.equal(saved.wrapper_exit_code, 9);
  assert.equal(Buffer.from(saved.stdout, 'base64').toString(), 'FAIL\n');
  assert.equal(Buffer.from(saved.stderr, 'base64').toString(), 'expected mismatch\n');
});

test('child receives sealed environment and candidate cwd without inherited Node flags', async t => {
  const f = await fixture(t, "console.log(JSON.stringify({cwd:process.cwd(),keys:Object.keys(process.env).filter(k=>process.env[k]!=='').sort(),argv:process.argv.slice(2),flags:process.execArgv}));");
  const saved = await receipt(await runCapturedValidator(f));
  const child = JSON.parse(Buffer.from(saved.stdout, 'base64'));
  assert.equal(child.cwd, f.candidateRoot); assert.deepEqual(child.argv, []); assert.deepEqual(child.flags, []);
  assert.ok(child.keys.every(key => ['LANG', 'LC_ALL', 'SYSTEMROOT', 'WINDIR'].includes(key.toUpperCase())), JSON.stringify(child.keys));
});

test('pin mismatch and invalid paths stop before reservation', async t => {
  const f = await fixture(t);
  await assert.rejects(runCapturedValidator({ ...f, sha256: '0'.repeat(64) }), code('CAPTURE_VALIDATOR_CHANGED'));
  for (const validator of ['../checks/validate.mjs', 'checks/../../escape.mjs', 'checks/validate.mjs:evil', 'checks/token.mjs', '_workspaces/check.mjs']) {
    await assert.rejects(runCapturedValidator({ ...f, validator }), code('CAPTURE_VALIDATOR_INVALID'));
  }
  assert.deepEqual(await fs.readdir(f.evidenceRoot), []);
});

test('evidence must already exist outside candidate, source repo and every checkout', async t => {
  const f = await fixture(t);
  for (const evidenceRoot of [f.candidateRoot, f.repoRoot, f.root]) {
    await assert.rejects(runCapturedValidator({ ...f, evidenceRoot }), code('CAPTURE_ROOT_OVERLAP'));
  }
  const otherRepo = path.join(f.root, 'other'); await fs.mkdir(otherRepo); await fs.mkdir(path.join(otherRepo, '.git'));
  await fs.mkdir(path.join(otherRepo, 'evidence'));
  await assert.rejects(runCapturedValidator({ ...f, evidenceRoot: path.join(otherRepo, 'evidence') }), code('CAPTURE_ROOT_OVERLAP'));
  for (const bit of ['_workmeta', '_workspaces', '.git']) {
    const forbidden = path.join(f.root, bit); await fs.mkdir(forbidden);
    await assert.rejects(runCapturedValidator({ ...f, evidenceRoot: forbidden }), code('CAPTURE_ROOT_OVERLAP'));
  }
  const missing = path.join(f.root, 'missing');
  await assert.rejects(runCapturedValidator({ ...f, evidenceRoot: missing }));
  await assert.rejects(fs.lstat(missing), { code: 'ENOENT' });
});

test('hardlinked validator denied before execution', async t => {
  const f = await fixture(t);
  await fs.link(path.join(f.candidateRoot, f.validator), path.join(f.root, 'validator-link.mjs'));
  await assert.rejects(runCapturedValidator(f), code('CAPTURE_FILE_INVALID'));
  assert.deepEqual(await fs.readdir(f.evidenceRoot), []);
});

test('junction/symlink evidence root is rejected', async t => {
  const f = await fixture(t), alias = path.join(f.root, 'alias');
  await fs.symlink(f.evidenceRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runCapturedValidator({ ...f, evidenceRoot: alias }), code('CAPTURE_ROOT_INVALID'));
});

test('unconfirmed reservation alone prevents another execution', async t => {
  const f = await fixture(t), id = deriveValidatorCaptureId({ cwd: f.candidateRoot, ...f });
  const reservation = path.join(f.evidenceRoot, `feedback-validator-${id}.reservation.json`);
  await fs.writeFile(reservation, 'unconfirmed', { flag: 'wx' });
  await assert.rejects(runCapturedValidator(f), code('CAPTURE_REPLAY_HOLD'));
  assert.equal(await fs.readFile(reservation, 'utf8'), 'unconfirmed');
  assert.equal((await fs.readdir(f.evidenceRoot)).length, 1);
});

test('concurrent calls reserve at most one child', async t => {
  const f = await fixture(t);
  const results = await Promise.allSettled([runCapturedValidator(f), runCapturedValidator(f)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await fs.readdir(f.evidenceRoot)).length, 2);
});

test('output overflow is bounded and cannot report validator pass', async t => {
  const f = await fixture(t, "process.stdout.write('x'.repeat(10000));");
  const result = await runCapturedValidator({ ...f, maxLogBytes: 100 }), saved = await receipt(result);
  assert.notEqual(result.exit_code, 0); assert.equal(saved.failure, 'CAPTURE_LOG_LIMIT');
  assert.equal(saved.stdout_captured_bytes, 100); assert.ok(saved.stdout_bytes > 100);
  assert.equal(saved.output_complete, false); assert.equal(Buffer.from(saved.stdout, 'base64').length, 100);
});

test('timeout closes direct child and records failure without descendant isolation claim', async t => {
  const f = await fixture(t, "setInterval(()=>{},1000);");
  const start = Date.now(), result = await runCapturedValidator({ ...f, timeoutMs: 100 }), saved = await receipt(result);
  assert.notEqual(result.exit_code, 0); assert.equal(saved.failure, 'CAPTURE_TIMEOUT');
  assert.equal(saved.closed, true); assert.equal(saved.descendant_isolation, false); assert.ok(Date.now() - start < 5000);
});

test('capture failure after child pass holds and preserves reservation', async t => {
  const f = await fixture(t, "await new Promise(r=>setTimeout(r,200));");
  // Simulate an external collision after observing the create-only reservation.
  const finalId = deriveValidatorCaptureId({ cwd: f.candidateRoot, ...f });
  const pending = runCapturedValidator(f);
  const reservation = path.join(f.evidenceRoot, `feedback-validator-${finalId}.reservation.json`);
  for (let i = 0; i < 100; i++) {
    if (await fs.lstat(reservation).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  const occupied = path.join(f.evidenceRoot, `feedback-validator-${finalId}.json`);
  await fs.writeFile(occupied, 'occupied', { flag: 'wx' });
  await assert.rejects(pending, { code: 'EEXIST' });
  assert.equal(await fs.readFile(occupied, 'utf8'), 'occupied');
  await assert.rejects(runCapturedValidator(f), code('CAPTURE_REPLAY_HOLD'));
});

test('CLI enforces fixed args and returns real child exit code', async t => {
  const f = await fixture(t, 'process.exitCode=7;');
  const cli = spawnSync(process.execPath, [wrapper, '--validator', f.validator, '--sha256', f.sha256, '--evidence-root', f.evidenceRoot, '--repo-root', f.repoRoot],
    { cwd: f.candidateRoot, encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(cli.status, 7); assert.equal(JSON.parse(cli.stdout).validator_exit_code, 7);
  const bad = spawnSync(process.execPath, [wrapper, '--validator', f.validator], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(bad.status, 70); assert.equal(JSON.parse(bad.stderr).code, 'CAPTURE_ARGUMENTS_INVALID');
});
