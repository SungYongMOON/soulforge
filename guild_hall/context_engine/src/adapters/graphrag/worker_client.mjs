// Spawns the pinned GraphRAG worker with an explicitly bound interpreter. The
// worker file is part of this APP; the interpreter (a venv with neo4j-graphrag)
// comes from a trusted binding and is never looked up on PATH. Proxy variables
// are dropped so loopback calls cannot be redirected; input and output are
// bounded, a worker that dies early is a refusal rather than a crash of the
// caller, and the result names the worker file's hash for the revision.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GRAPHRAG_WORKER_SCHEMA = 'soulforge.context_graphrag_worker.v1';
const WORKER_PATH = fileURLToPath(new URL('../../workers/graphrag_worker.py', import.meta.url));
// The worker reads at most 64 MiB; a larger request is refused before spawning.
export const MAX_WORKER_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export class GraphragWorkerError extends Error {
  constructor(code) { super(code); this.name = 'GraphragWorkerError'; this.code = code; }
}
const fail = code => { throw new GraphragWorkerError(code); };

export function validateWorkerBinding(binding) {
  if (!binding || typeof binding.interpreter_path !== 'string' || !isAbsolute(binding.interpreter_path)) fail('graphrag_interpreter_unbound');
  const interpreter = resolve(binding.interpreter_path);
  let stat;
  try { stat = lstatSync(interpreter); } catch { fail('graphrag_interpreter_missing'); }
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(interpreter) !== interpreter) fail('graphrag_interpreter_refused');
  const timeoutMs = binding.timeout_ms ?? 600000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) fail('graphrag_timeout_invalid');
  return Object.freeze({ interpreter, timeoutMs });
}

// -I ignores every PYTHON* variable, so UTF-8 mode is a flag (-X utf8), not env.
function workerEnv() {
  const keep = ['SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const env = Object.fromEntries(keep.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return { ...env, NO_PROXY: '*', no_proxy: '*' };
}

export async function runGraphragWorker({ binding, request }) {
  const { interpreter, timeoutMs } = validateWorkerBinding(binding);
  const payload = Buffer.from(JSON.stringify({ schema_version: GRAPHRAG_WORKER_SCHEMA, ...request }), 'utf8');
  if (payload.length > MAX_WORKER_REQUEST_BYTES) fail('graphrag_request_too_large');
  const workerSha256 = `sha256:${createHash('sha256').update(readFileSync(WORKER_PATH)).digest('hex')}`;
  return new Promise((resolvePromise, reject) => {
    let settled = false, killed = false, stdinFailed = false, size = 0, timer = null;
    const chunks = [];
    const settle = (action, value) => { if (!settled) { settled = true; clearTimeout(timer); action(value); } };
    const child = spawn(interpreter, ['-I', '-B', '-X', 'utf8', WORKER_PATH],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: workerEnv() });
    timer = setTimeout(() => { killed = true; child.kill(); }, timeoutMs);
    child.on('error', () => settle(reject, new GraphragWorkerError('graphrag_worker_unavailable')));
    // A worker that exits before reading everything breaks the pipe; without a
    // listener that error would end the calling process (and strand its locks).
    child.stdin.on('error', () => { stdinFailed = true; });
    child.stdout.on('data', bytes => {
      size += bytes.length;
      if (size > MAX_OUTPUT_BYTES) { killed = true; child.kill(); return; }
      chunks.push(bytes);
    });
    child.on('close', code => {
      if (killed) return settle(reject, new GraphragWorkerError(size > MAX_OUTPUT_BYTES ? 'graphrag_output_too_large' : 'graphrag_worker_timeout'));
      let output;
      try { output = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return settle(reject, new GraphragWorkerError(stdinFailed ? 'graphrag_worker_stdin_failed' : 'graphrag_output_invalid')); }
      settle(resolvePromise, { exit_code: code, output, worker_sha256: workerSha256 });
    });
    child.stdin.end(payload);
  });
}
