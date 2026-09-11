// Spawns the pinned GraphRAG worker with an explicitly bound interpreter. The
// worker file is part of this APP; the interpreter (a venv with neo4j-graphrag)
// comes from a trusted binding and is never looked up on PATH. Proxy variables
// are dropped so loopback calls cannot be redirected; output is bounded.
import { spawn } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GRAPHRAG_WORKER_SCHEMA = 'soulforge.context_graphrag_worker.v1';
const WORKER_PATH = fileURLToPath(new URL('../../workers/graphrag_worker.py', import.meta.url));
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
  return new Promise((resolvePromise, reject) => {
    const child = spawn(interpreter, ['-I', '-B', '-X', 'utf8', WORKER_PATH],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, env: workerEnv() });
    const chunks = []; let size = 0; let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill(); }, timeoutMs);
    child.on('error', () => { clearTimeout(timer); reject(new GraphragWorkerError('graphrag_worker_unavailable')); });
    child.stdout.on('data', bytes => {
      size += bytes.length;
      if (size > MAX_OUTPUT_BYTES) { killed = true; child.kill(); return; }
      chunks.push(bytes);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (killed) return reject(new GraphragWorkerError(size > MAX_OUTPUT_BYTES ? 'graphrag_output_too_large' : 'graphrag_worker_timeout'));
      let output;
      try { output = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new GraphragWorkerError('graphrag_output_invalid')); }
      resolvePromise({ exit_code: code, output });
    });
    child.stdin.end(payload);
  });
}
