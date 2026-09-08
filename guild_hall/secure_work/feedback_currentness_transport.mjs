// Installer-only local transport. Model envelopes never supply this binding or
// callbacks. Kernel peer authentication is performed by the pinned Pipe helper;
// the existing publication validator checks metadata after that boundary.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuntimeBytes, runtimeExact as exact } from '../dev_worker/feedback_runtime_io.mjs';
import { validateAuthenticatedCurrentnessMetadata } from './feedback_currentness_contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, 'src/soulforge_secure_work/feedback_currentness_pipe.py');
const PIPE = path.join(HERE, 'src/soulforge_secure_work/ipc_pipe.py');
const FIELDS = ['publisher_ref', 'producer_ref', 'scope_ref', 'issue_id', 'issue_content_sha256',
  'body_sha256', 'generation', 'review_ref', 'index_sha256'];
const BINDING = ['pipe_name', 'server_sid', 'client_sid', 'python_executable', 'python_sha256',
  'bridge_sha256', 'ipc_pipe_sha256', 'timeout_ms', 'valid_until'];
const SHA = /^[a-f0-9]{64}$/u, SID = /^S-1-[0-9]+(?:-[0-9]+)+$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
const fail = (code = 'FEEDBACK_CURRENTNESS_HOLD') => {throw Object.assign(new Error(code), {code});};
const require = (value, code) => {if (!value) fail(code);};

function pinnedSync(file, expected, limit) {
  require(path.isAbsolute(file) && !/^(?:\\\\|\/\/)/u.test(file));
  for (let current = file; ; current = path.dirname(current)) {
    const entry = lstatSync(current);
    require(!entry.isSymbolicLink() && (current === file ? entry.isFile() && entry.nlink === 1 : entry.isDirectory()));
    if (current === path.dirname(current)) break;
  }
  require(realpathSync(file).toLowerCase() === path.resolve(file).toLowerCase());
  const identity = value => `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}:${value.nlink}`;
  const before = lstatSync(file);
  require(before.size > 0 && before.size <= limit);
  const bytes = readFileSync(file);
  require(bytes.length === before.size && identity(before) === identity(lstatSync(file))
    && createHash('sha256').update(bytes).digest('hex') === expected, 'FEEDBACK_CURRENTNESS_PIN_CHANGED');
}

function expectedShape(value) {
  require(exact(value, FIELDS));
  for (const key of ['publisher_ref', 'producer_ref', 'scope_ref', 'issue_id', 'review_ref']) require(typeof value[key] === 'string' && REF.test(value[key]));
  require(typeof value.issue_content_sha256 === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/u.test(value.issue_content_sha256)
    && SHA.test(value.body_sha256) && SHA.test(value.index_sha256)
    && Number.isSafeInteger(value.generation) && value.generation > 0);
}

function metadataShape(value, challenge) {
  require(exact(value, ['challenge', ...FIELDS, 'observed_at', 'valid_until', 'execution_authority']));
  expectedShape(Object.fromEntries(FIELDS.map(key => [key, value[key]])));
  require(value.challenge === challenge && value.execution_authority === false
    && typeof value.observed_at === 'string' && value.observed_at.length <= 32
    && typeof value.valid_until === 'string' && value.valid_until.length <= 32);
}

function context(binding, assertCurrent) {
  require(process.platform === 'win32', 'FEEDBACK_CURRENTNESS_PLATFORM_UNSUPPORTED');
  require(exact(binding, BINDING) && typeof assertCurrent === 'function', 'FEEDBACK_CURRENTNESS_BINDING');
  const original = binding, serialized = JSON.stringify(binding);
  binding = structuredClone(binding);
  require(typeof binding.pipe_name === 'string' && /^soulforge-secure-[a-z0-9-]{16,80}$/u.test(binding.pipe_name)
    && SID.test(binding.server_sid) && SID.test(binding.client_sid)
    && typeof binding.python_executable === 'string' && path.isAbsolute(binding.python_executable)
    && ['python_sha256', 'bridge_sha256', 'ipc_pipe_sha256'].every(key => SHA.test(binding[key]))
    && Number.isSafeInteger(binding.timeout_ms) && binding.timeout_ms >= 100 && binding.timeout_ms <= 5000
    && typeof binding.valid_until === 'string' && binding.valid_until.length <= 32
    && Number.isFinite(Date.parse(binding.valid_until)), 'FEEDBACK_CURRENTNESS_BINDING');
  const snapshots = new Set();
  function sourcePins() {
    pinnedSync(binding.python_executable, binding.python_sha256, 128 * 1024 * 1024);
    pinnedSync(BRIDGE, binding.bridge_sha256, 65536);
    pinnedSync(PIPE, binding.ipc_pipe_sha256, 65536);
  }
  function current() {
    require(JSON.stringify(original) === serialized, 'FEEDBACK_CURRENTNESS_BINDING_CHANGED');
    require(Date.now() < Date.parse(binding.valid_until), 'FEEDBACK_CURRENTNESS_EXPIRED');
    const value = assertCurrent();
    require(value !== false && !(value && typeof value.then === 'function'), 'FEEDBACK_CURRENTNESS_REVOKED');
    // No caller callback runs after these checks and before the guarded action.
    for (const check of snapshots) check();
  }
  async function pins() {
    current();
    await readRuntimeBytes(binding.python_executable, binding.python_sha256, 128 * 1024 * 1024);
    const bridge = await readRuntimeBytes(BRIDGE, binding.bridge_sha256, 65536);
    const pipe = await readRuntimeBytes(PIPE, binding.ipc_pipe_sha256, 65536);
    current();
    sourcePins();
    return {bridge, pipe};
  }
  function snapshot(root) {
    const check = () => {
      sourcePins();
      require(JSON.stringify(readdirSync(root).sort()) === JSON.stringify(['feedback_currentness_pipe.py', 'ipc_pipe.py']), 'FEEDBACK_CURRENTNESS_PIN_CHANGED');
      pinnedSync(path.join(root, 'feedback_currentness_pipe.py'), binding.bridge_sha256, 65536);
      pinnedSync(path.join(root, 'ipc_pipe.py'), binding.ipc_pipe_sha256, 65536);
    };
    snapshots.add(check);
    return () => snapshots.delete(check);
  }
  current();
  return {binding, current, pins, snapshot};
}

function frame(value) {
  const body = Buffer.from(JSON.stringify(value), 'ascii');
  require(body.length > 0 && body.length <= 4096, 'FEEDBACK_CURRENTNESS_FRAME_LIMIT');
  const prefix = Buffer.alloc(4); prefix.writeUInt32BE(body.length);
  return Buffer.concat([prefix, body]);
}

async function helper(ctx, mode, extra, onFrame) {
  const bytes = await ctx.pins();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-feedback-currentness-'));
  let child, removeSnapshot;
  try {
    await fs.writeFile(path.join(root, 'feedback_currentness_pipe.py'), bytes.bridge, {flag: 'wx', mode: 0o600});
    await fs.writeFile(path.join(root, 'ipc_pipe.py'), bytes.pipe, {flag: 'wx', mode: 0o600});
    removeSnapshot = ctx.snapshot(root);
    ctx.current();
    child = spawn(ctx.binding.python_executable, ['-I', '-S', '-B', path.join(root, 'feedback_currentness_pipe.py'), mode], {
      cwd: root, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      env: {SystemRoot: process.env.SystemRoot ?? '', TEMP: root, TMP: root, HOME: root, USERPROFILE: root},
    });
  } catch (error) {removeSnapshot?.(); await fs.rm(root, {recursive: true, force: true}); throw error;}
  let terminal = false, failure = null, buffer = Buffer.alloc(0), pending = 0, chain = Promise.resolve();
  let closedByCaller = false, exited = false;
  let resolveDone, rejectDone, resolveHalted;
  const halted = new Promise(resolve => {resolveHalted = resolve;});
  const done = new Promise((resolve, reject) => {resolveDone = resolve; rejectDone = reject;});
  // Consumers attach immediately, but an early process error must not cause an
  // unhandled rejection while startup is still delivering the first frame.
  done.catch(() => {});
  function stop(error = null) {
    if (terminal) return;
    terminal = true; failure = error;
    resolveHalted();
    child.stdin.destroy(); child.kill();
  }
  function send(value) {
    require(!terminal, 'FEEDBACK_CURRENTNESS_CLOSED');
    ctx.current();
    child.stdin.write(frame(value));
  }
  const tick = setInterval(() => {try {ctx.current();} catch {stop(new Error('FEEDBACK_CURRENTNESS_REVOKED'));}}, 25);
  child.stdin.on('error', () => stop(new Error('FEEDBACK_CURRENTNESS_CLOSED')));
  child.stderr.on('data', () => stop(new Error('FEEDBACK_CURRENTNESS_PROTOCOL')));
  child.on('error', () => stop(new Error('FEEDBACK_CURRENTNESS_PROCESS')));
  child.stdout.on('data', chunk => {
    try {
      require(!terminal && buffer.length + chunk.length <= 8192, 'FEEDBACK_CURRENTNESS_FRAME_LIMIT');
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        require(size > 0 && size <= 4096, 'FEEDBACK_CURRENTNESS_FRAME_LIMIT');
        if (buffer.length < 4 + size) break;
        const raw = buffer.subarray(4, size + 4).toString('utf8'); buffer = buffer.subarray(size + 4);
        const value = JSON.parse(raw);
        // Pinned helper emits canonical ASCII JSON only. This also rejects
        // duplicate keys, non-finite numbers and noncanonical hidden fields.
        require(JSON.stringify(value) === raw && ++pending <= 4, 'FEEDBACK_CURRENTNESS_PROTOCOL');
        chain = chain.then(async () => {require(!terminal); ctx.current(); await onFrame(value, send);}).catch(error => stop(error)).finally(() => {pending--;});
      }
    } catch {stop(new Error('FEEDBACK_CURRENTNESS_PROTOCOL'));}
  });
  child.on('close', async code => {
    exited = true;
    clearInterval(tick);
    resolveHalted();
    await chain;
    try {ctx.current();} catch {failure ??= new Error('FEEDBACK_CURRENTNESS_PIN_CHANGED');}
    terminal = true;
    removeSnapshot();
    await fs.rm(root, {recursive: true, force: true}).catch(() => {failure ??= new Error('FEEDBACK_CURRENTNESS_CLEANUP');});
    if (failure || code !== 0 && !closedByCaller || buffer.length) rejectDone(failure ?? new Error('FEEDBACK_CURRENTNESS_CLOSED'));
    else resolveDone();
  });
  send(Object.fromEntries(['pipe_name', 'server_sid', 'client_sid', 'timeout_ms', 'valid_until'].map(key => [key, ctx.binding[key]]).concat(Object.entries(extra))));
  return {done, halted, stop, async close() {
    if (!terminal && !exited) closedByCaller = true;
    stop(); await done.catch(() => {});
  }};
}

export function createFeedbackCurrentnessClient({binding, assertCurrent}) {
  const ctx = context(binding, assertCurrent), children = new Set();
  let closed = false, busy = false, requestFinished = Promise.resolve();
  return Object.freeze({async request(expected) {
    require(!closed && !busy, 'FEEDBACK_CURRENTNESS_CLOSED');
    expectedShape(expected); expected = structuredClone(expected);
    const challenge = randomBytes(16).toString('hex');
    busy = true;
    let releaseRequest;
    requestFinished = new Promise(resolve => {releaseRequest = resolve;});
    let process, result, timedOut = false;
    const timer = setTimeout(() => {timedOut = true; process?.stop(new Error('FEEDBACK_CURRENTNESS_TIMEOUT'));}, ctx.binding.timeout_ms);
    try {
      process = await helper(ctx, 'client', {challenge}, value => {
        require(!result && exact(value, ['kind', 'peer_sid', 'metadata']) && value.kind === 'result'
          && value.peer_sid === ctx.binding.server_sid, 'FEEDBACK_CURRENTNESS_PEER');
        metadataShape(value.metadata, challenge);
        validateAuthenticatedCurrentnessMetadata(value.metadata, {...expected, challenge}, {maxAgeMs: Math.min(1000, ctx.binding.timeout_ms)});
        result = value.metadata;
      });
      children.add(process);
      if (closed || timedOut) process.stop(new Error('FEEDBACK_CURRENTNESS_CLOSED'));
      await process.done;
      require(result, 'FEEDBACK_CURRENTNESS_PROTOCOL');
      await ctx.pins();
      require(!closed && !timedOut, 'FEEDBACK_CURRENTNESS_TIMEOUT');
      validateAuthenticatedCurrentnessMetadata(result, {...expected, challenge}, {maxAgeMs: Math.min(1000, ctx.binding.timeout_ms)});
      return structuredClone(result);
    } finally {clearTimeout(timer); if (process) {await process.close(); children.delete(process);} busy = false; releaseRequest();}
  }, async close() {
    closed = true;
    await Promise.all([...children].map(child => child.close()));
    await requestFinished;
  }});
}

export async function startFeedbackCurrentnessServer({binding, assertCurrent, assertCurrentPublication}) {
  require(typeof assertCurrentPublication === 'function', 'FEEDBACK_CURRENTNESS_BINDING');
  const ctx = context(binding, assertCurrent);
  const callbacks = new Set();
  let readyResolve, readyReject, phase = 'starting', activeChallenge = null, requestTimer = null;
  const ready = new Promise((resolve, reject) => {readyResolve = resolve; readyReject = reject;});
  let process;
  process = await helper(ctx, 'server', {}, async (value, send) => {
    if (value.kind === 'ready') {
      require(exact(value, ['kind']) && ['starting', 'idle'].includes(phase));
      phase = 'idle'; readyResolve(); return;
    }
    if (value.kind === 'complete') {
      require(exact(value, ['kind', 'challenge']) && phase === 'response' && value.challenge === activeChallenge);
      clearTimeout(requestTimer); activeChallenge = null; phase = 'starting'; return;
    }
    require(exact(value, ['kind', 'peer_sid', 'challenge']) && value.kind === 'request' && phase === 'idle'
      && value.peer_sid === ctx.binding.client_sid && /^[a-f0-9]{32}$/u.test(value.challenge), 'FEEDBACK_CURRENTNESS_PEER');
    // Read-only connections are independent. The client owns a fresh nonce and
    // checks exact reply binding/freshness; no lifetime request quota is needed.
    activeChallenge = value.challenge; phase = 'checking';
    requestTimer = setTimeout(() => process.stop(new Error('FEEDBACK_CURRENTNESS_TIMEOUT')), ctx.binding.timeout_ms);
    await ctx.pins();
    const valuePromise = Promise.resolve().then(() => assertCurrentPublication(value.challenge));
    callbacks.add(valuePromise);
    valuePromise.finally(() => callbacks.delete(valuePromise)).catch(() => {});
    // A stalled trusted callback cannot retain the authenticated pipe forever.
    const metadata = await Promise.race([valuePromise, process.halted.then(() => fail('FEEDBACK_CURRENTNESS_CLOSED'))]);
    ctx.current(); metadataShape(metadata, value.challenge);
    const expected = Object.fromEntries(['challenge', ...FIELDS].map(key => [key, metadata[key]]));
    validateAuthenticatedCurrentnessMetadata(metadata, expected, {maxAgeMs: Math.min(1000, ctx.binding.timeout_ms)});
    await ctx.pins();
    phase = 'response'; send({kind: 'response', challenge: value.challenge, metadata});
  });
  process.done.catch(error => readyReject(error));
  const startup = setTimeout(() => {process.stop(new Error('FEEDBACK_CURRENTNESS_TIMEOUT')); readyReject(new Error('FEEDBACK_CURRENTNESS_TIMEOUT'));}, ctx.binding.timeout_ms);
  try {await ready;} catch (error) {await process.close(); throw error;} finally {clearTimeout(startup);}
  // Passive lifetime observation: settle only after the owned child and its
  // snapshot are gone. Explicit close resolves; expiry or failure rejects.
  const closed = process.done.finally(() => {clearTimeout(requestTimer);});
  closed.catch(() => {});
  // Halting the pipe does not cancel the trusted callback's original Promise.
  // Keep the installed caller's protection hooks until drained resolves. A
  // callback that never settles keeps drained pending; closed/close stay bounded.
  const drained = closed.catch(() => {}).then(async () => {
    await Promise.allSettled([...callbacks]);
  });
  return Object.freeze({closed, drained, async close() {clearTimeout(requestTimer); await process.close();}});
}
