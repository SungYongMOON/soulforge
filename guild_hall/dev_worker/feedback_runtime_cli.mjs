#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { openFeedbackRuntime, pollFeedbackRuntime } from './feedback_runtime.mjs';

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Feedback runtime: worker|watchdog|inspect --deployment <absolute.json> --sha256 <deployment-bytes-hash> [--once | --cycles N]');
    console.log('Recovery: recover|retry --deployment <absolute.json> --sha256 <hash> --run-ref <ref> --proof <independent-readback.json> --proof-sha256 <hash>'); return;
  }
  const role = args.shift();
  if (['recover', 'retry'].includes(role)) {
    if (args.length !== 10 || args[0] !== '--deployment' || args[2] !== '--sha256' || args[4] !== '--run-ref'
      || args[6] !== '--proof' || args[8] !== '--proof-sha256') throw new Error('FEEDBACK_RUNTIME_ARGUMENTS');
    const runtime = await openFeedbackRuntime({ role: 'worker', deploymentPath: args[1], deploymentSha256: args[3] });
    try { console.log(JSON.stringify(await runtime.recover(args[5], { path: args[7], sha256: args[9] }, { retry: role === 'retry' }))); }
    finally { await runtime.close(); }
    return;
  }
  if (!['worker', 'watchdog', 'inspect'].includes(role) || args[0] !== '--deployment' || args[2] !== '--sha256'
    || ![4, 5, 6].includes(args.length)) throw new Error('FEEDBACK_RUNTIME_ARGUMENTS');
  const once = role === 'inspect' || args[4] === '--once';
  const cycles = args[4] === '--cycles' ? Number(args[5]) : null;
  if ((args.length === 5 && !once) || (args.length === 6 && (!Number.isInteger(cycles) || cycles < 1 || cycles > 1000))) throw new Error('FEEDBACK_RUNTIME_ARGUMENTS');
  const runtime = await openFeedbackRuntime({ role, deploymentPath: args[1], deploymentSha256: args[3] });
  if (once) {
    try { console.log(JSON.stringify(role === 'inspect' ? await runtime.inspect() : await runtime.runOnce())); }
    finally { await runtime.close(); }
    return;
  }
  const polling = pollFeedbackRuntime(runtime, { maxCycles: cycles, onStatus: value => console.log(JSON.stringify(value)) });
  process.once('SIGINT', () => void polling.stop()); process.once('SIGTERM', () => void polling.stop());
  await polling.done;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(JSON.stringify({ status: 'HOLD', code: /^[A-Z_]{1,100}$/u.test(error.feedbackCode ?? error.message ?? '') ? error.feedbackCode ?? error.message : 'FEEDBACK_RUNTIME_UNAVAILABLE' })); process.exitCode = 2;
});
