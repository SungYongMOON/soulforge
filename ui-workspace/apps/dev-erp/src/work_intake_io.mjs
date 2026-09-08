import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readRuntimeBytes, readRuntimeJson, runtimeOrdinary, runtimeInside } from '../../../../guild_hall/dev_worker/feedback_runtime_io.mjs';

export const intakeHash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const intakeRef = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/_-]{0,127}$/u.test(value);
export const intakeCheck = (value, code) => { if (!value) throw Object.assign(new Error(code), { workIntakeCode: code }); };
export const intakePin = value => value && typeof value.path === 'string' && typeof value.sha256 === 'string'
  && /^(?:sha256:)?[a-f0-9]{64}$/u.test(value.sha256);
export const bareHash = value => value?.replace(/^sha256:/u, '');
export const intakeInside = runtimeInside;
export const intakeOrdinary = runtimeOrdinary;
export async function intakeRead(pin, { current = false, maxBytes = 1048576 } = {}) {
  intakeCheck(pin && (current ? pin.sha256 === null : intakePin(pin)), 'INTAKE_PIN_REQUIRED');
  return readRuntimeJson({ path: pin.path, sha256: current ? null : bareHash(pin.sha256) }, maxBytes);
}
export async function intakeBytes(pin, maxBytes = 1048576) {
  intakeCheck(intakePin(pin), 'INTAKE_PIN_REQUIRED');
  return readRuntimeBytes(pin.path, bareHash(pin.sha256), maxBytes);
}

// Only trusted deployment code supplies this fixed reader command; packet text
// cannot name an executable, argument, interpreter environment or destination.
export async function runIntakeReader({ executable, script, args, timeoutMs = 15000, maxBytes = 262144 }) {
  await intakeBytes(executable, 200 * 1024 * 1024); await intakeBytes(script, 1024 * 1024);
  const environment = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) environment[key] = process.env[key];
  return new Promise((resolve, reject) => execFile(executable.path, ['-I', '-B', script.path, ...args], {
    windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: maxBytes, encoding: 'utf8', env: environment,
  }, (error, stdout) => {
    if (error || Buffer.byteLength(stdout) > maxBytes) { reject(Object.assign(new Error('INTAKE_PACKET_READER_FAILED'), { workIntakeCode: 'INTAKE_PACKET_READER_FAILED' })); return; }
    try { resolve(JSON.parse(stdout)); } catch { reject(Object.assign(new Error('INTAKE_PACKET_READER_INVALID'), { workIntakeCode: 'INTAKE_PACKET_READER_INVALID' })); }
  }));
}
