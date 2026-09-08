// Fixed, pinned public-code validators only. This is not an OS sandbox: the
// trusted validator must not spawn descendants or access private/network state.
// SIGKILL targets the direct child only; interrupted reservations remain HOLD.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
const fold = value => process.platform === 'win32' ? value.toLowerCase() : value;
const same = (a, b) => fold(path.resolve(a)) === fold(path.resolve(b));
const inside = (a, b) => { const r = path.relative(fold(a), fold(b)); return !r || (!path.isAbsolute(r) && r !== '..' && !r.startsWith(`..${path.sep}`)); };
const overlap = (a, b) => inside(a, b) || inside(b, a);
const identity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
const unchanged = (a, b) => identity(a, b) && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

async function directorySnapshot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\u0000-\u001f]/u.test(value)) fail('CAPTURE_ROOT_INVALID');
  const full = path.resolve(value), root = path.parse(full).root, result = [];
  let current = root;
  for (const bit of ['', ...path.relative(root, full).split(path.sep).filter(Boolean)]) {
    current = path.join(current, bit);
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || !same(await fs.realpath(current), current)) fail('CAPTURE_ROOT_INVALID');
    result.push({ path: current, stat });
  }
  return result;
}

async function assertDirectory(snapshot) {
  const current = await directorySnapshot(snapshot.at(-1).path);
  if (snapshot.length !== current.length || snapshot.some((item, i) => !same(item.path, current[i].path) || !identity(item.stat, current[i].stat))) fail('CAPTURE_ROOT_CHANGED');
}

async function pinnedRead(full, maxBytes = 2_000_000) {
  const parents = await directorySnapshot(path.dirname(full));
  const before = await fs.lstat(full, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maxBytes)
    || !same(await fs.realpath(full), full)) fail('CAPTURE_FILE_INVALID');
  const handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!unchanged(before, await handle.stat({ bigint: true }))) fail('CAPTURE_FILE_CHANGED');
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length !== Number(before.size) || !unchanged(before, await handle.stat({ bigint: true }))
      || !unchanged(before, await fs.lstat(full, { bigint: true })) || !same(await fs.realpath(full), full)) fail('CAPTURE_FILE_CHANGED');
    await assertDirectory(parents);
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

function validatorPath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.mjs$/u.test(value)
    || value.split('/').some(bit => bit === '.' || bit === '..' || /[. ]$/u.test(bit)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(bit)
      || /^\.(?:env|git)(?:[.-]|$)/iu.test(bit)
      || /(?:^|[_.-])(?:credentials?|secrets?|passwords?|tokens?|cookies?|sessions?)(?:[_.-]|$)/iu.test(bit))
    || /(?:^|\/)(?:_workmeta|_workspaces|private-state)(?:\/|$)/iu.test(value)) fail('CAPTURE_VALIDATOR_INVALID');
  return value;
}

export function deriveValidatorCaptureId({ cwd, validator, sha256 }) {
  validatorPath(validator);
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !/^[a-f0-9]{64}$/u.test(sha256 ?? '')) fail('CAPTURE_OPTIONS_INVALID');
  return sha(JSON.stringify({ candidate: fold(path.resolve(cwd)), check_sha256: sha(JSON.stringify({ validator, sha256 })) }));
}

async function createReceipt(full, record, rootSnapshot) {
  await assertDirectory(rootSnapshot);
  const bytes = Buffer.from(JSON.stringify(record) + '\n');
  const handle = await fs.open(full, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n) fail('CAPTURE_FILE_INVALID');
    await handle.writeFile(bytes); await handle.sync();
    if (!identity(opened, await fs.lstat(full, { bigint: true }))) fail('CAPTURE_FILE_CHANGED');
  } finally { await handle.close(); }
  await assertDirectory(rootSnapshot);
  if (!(await pinnedRead(full)).equals(bytes)) fail('CAPTURE_READBACK_FAILED');
  return sha(bytes);
}

async function absent(full) {
  const exists = await fs.lstat(full).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (exists) fail('CAPTURE_REPLAY_HOLD');
}

function childRun(validator, cwd, timeoutMs, maxLogBytes) {
  // Deliberately no PATH, HOME, NODE_OPTIONS, provider keys, or caller env spread.
  // libuv otherwise fills these Windows variables from the parent even when
  // omitted from an explicit env object. Empty entries suppress that fallback.
  const env = Object.freeze({ LANG: 'C', LC_ALL: 'C', ...(process.platform === 'win32'
    ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, HOMEDRIVE: '', HOMEPATH: '', LOGONSERVER: '',
      PATH: '', SYSTEMDRIVE: '', TEMP: '', USERDOMAIN: '', USERNAME: '', USERPROFILE: '' } : {}) });
  return new Promise(resolve => {
    let ended = false, failure = null, forceTimer;
    const streams = Object.fromEntries(['stdout', 'stderr'].map(key => [key, { chunks: [], bytes: 0, captured: 0, hash: createHash('sha256') }]));
    const child = spawn(process.execPath, [validator], { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (code, signal, closed) => {
      if (ended) return;
      ended = true; clearTimeout(timer); clearTimeout(forceTimer);
      const result = { exit_code: code, signal: signal ?? null, closed, failure };
      for (const [key, stream] of Object.entries(streams)) {
        result[key] = Buffer.concat(stream.chunks).toString('base64');
        result[`${key}_sha256`] = stream.hash.digest('hex');
        result[`${key}_bytes`] = stream.bytes;
        result[`${key}_captured_bytes`] = stream.captured;
      }
      resolve(result);
    };
    const stop = reason => {
      if (ended || forceTimer) return;
      failure = reason; child.kill('SIGKILL');
      forceTimer = setTimeout(() => {
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish(null, null, false);
      }, 1_000);
    };
    const timer = setTimeout(() => stop('CAPTURE_TIMEOUT'), timeoutMs);
    for (const key of ['stdout', 'stderr']) child[key].on('data', bytes => {
      const stream = streams[key]; stream.bytes += bytes.length; stream.hash.update(bytes);
      const kept = bytes.subarray(0, Math.max(0, maxLogBytes - stream.captured));
      if (kept.length) { stream.chunks.push(kept); stream.captured += kept.length; }
      if (stream.bytes > maxLogBytes) stop('CAPTURE_LOG_LIMIT');
    });
    child.on('error', () => { failure = 'CAPTURE_SPAWN_FAILED'; });
    child.on('close', (code, signal) => finish(code, signal, true));
  });
}

/**
 * Caller owns an existing protected noncanonical evidence directory. No folder
 * creation, ACL changes, Git calls, environment capture, or validator args.
 * Reservations and results are create-only. Every replay holds without rerun.
 * Complete stdout/stderr bytes use base64 (lossless also for non-UTF8 output).
 * An overflow stores only the bounded prefix and explicitly fails the capture.
 * Root/file readback detects observable drift, not adversarial OS-level races.
 */
export async function runCapturedValidator(options = {}) {
  const { validator, sha256, evidenceRoot, repoRoot, candidateRoot = process.cwd(), timeoutMs = 20_000, maxLogBytes = 65_536 } = options;
  validatorPath(validator);
  if (!/^[a-f0-9]{64}$/u.test(sha256 ?? '') || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000
    || !Number.isInteger(maxLogBytes) || maxLogBytes < 1 || maxLogBytes > 65_536) fail('CAPTURE_OPTIONS_INVALID');
  const candidateSnapshot = await directorySnapshot(candidateRoot), repoSnapshot = await directorySnapshot(repoRoot), evidenceSnapshot = await directorySnapshot(evidenceRoot);
  const candidate = candidateSnapshot.at(-1).path, repo = repoSnapshot.at(-1).path, evidence = evidenceSnapshot.at(-1).path;
  if (overlap(evidence, candidate) || overlap(evidence, repo)
    || evidence.split(path.sep).some(bit => /^(?:_workmeta|_workspaces|\.git)$/iu.test(bit))) fail('CAPTURE_ROOT_OVERLAP');
  // An evidence folder under another checkout is not an external evidence root.
  for (const entry of evidenceSnapshot) {
    const inRepo = await fs.lstat(path.join(entry.path, '.git')).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (inRepo) fail('CAPTURE_ROOT_OVERLAP');
  }
  const full = path.join(candidate, validator);
  if (sha(await pinnedRead(full)) !== sha256) fail('CAPTURE_VALIDATOR_CHANGED');
  const checkSha = sha(JSON.stringify({ validator, sha256 }));
  const key = deriveValidatorCaptureId({ cwd: candidate, validator, sha256 });
  const reservationPath = path.join(evidence, `feedback-validator-${key}.reservation.json`);
  const receiptPath = path.join(evidence, `feedback-validator-${key}.json`);
  const suffix = /^feedback-([a-f0-9]{24})$/u.exec(path.basename(candidate))?.[1];
  const binding = { candidate_path: candidate, candidate_ref: suffix ? `feedback.candidate.${suffix}` : `feedback.candidate.path.${sha(fold(candidate))}`,
    check_sha256: checkSha, validator_path: validator, validator_sha256: sha256 };
  await absent(reservationPath); await absent(receiptPath);
  await createReceipt(reservationPath, { ...binding, state: 'execution_unknown' }, evidenceSnapshot);
  await assertDirectory(candidateSnapshot); await assertDirectory(repoSnapshot);
  if (sha(await pinnedRead(full)) !== sha256) fail('CAPTURE_VALIDATOR_CHANGED');
  const result = await childRun(full, candidate, timeoutMs, maxLogBytes);
  if (!result.closed) fail('CAPTURE_CHILD_UNCONFIRMED');
  await assertDirectory(candidateSnapshot); await assertDirectory(repoSnapshot);
  if (sha(await pinnedRead(full)) !== sha256) fail('CAPTURE_VALIDATOR_CHANGED');
  const complete = result.stdout_bytes === result.stdout_captured_bytes && result.stderr_bytes === result.stderr_captured_bytes;
  const exitCode = result.failure || !complete || result.signal || !Number.isInteger(result.exit_code) ? 70 : result.exit_code;
  const record = { ...binding, state: 'child_closed', stream_encoding: 'base64', ...result, output_complete: complete,
    wrapper_exit_code: exitCode, timeout_ms: timeoutMs, max_log_bytes: maxLogBytes, os_sandbox: false, descendant_isolation: false };
  const receiptHash = await createReceipt(receiptPath, record, evidenceSnapshot);
  return Object.freeze({ exit_code: exitCode, validator_exit_code: result.exit_code, receipt_path: receiptPath, receipt_sha256: receiptHash,
    candidate_ref: binding.candidate_ref, check_sha256: checkSha, output_complete: complete });
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: node feedback_runtime_validator.mjs --validator <relative.mjs> --sha256 <hash> --evidence-root <absolute-existing-directory> --repo-root <absolute-source-repo>');
    return;
  }
  const keys = new Map([['--validator', 'validator'], ['--sha256', 'sha256'], ['--evidence-root', 'evidenceRoot'], ['--repo-root', 'repoRoot']]);
  const options = {};
  if (args.length !== 8) fail('CAPTURE_ARGUMENTS_INVALID');
  for (let i = 0; i < args.length; i += 2) {
    const key = keys.get(args[i]);
    if (!key || Object.hasOwn(options, key) || !args[i + 1]) fail('CAPTURE_ARGUMENTS_INVALID');
    options[key] = args[i + 1];
  }
  const result = await runCapturedValidator(options);
  console.log(JSON.stringify(result)); process.exitCode = result.exit_code;
}

if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ status: 'HOLD', code: error.feedbackCode ?? 'CAPTURE_FAILED' })); process.exitCode = 70;
});
