#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { openWorkIntakeRuntime } from '../src/work_intake_runtime.mjs';

export async function runWorkIntakeCli(argv) {
  const [command, ...rest] = argv;
  if (command === '--help') return { usage: 'work_intake_cli.mjs run|inspect|poll --deployment ABS.json --sha256 SHA [--interval-ms N]',
    boundary: 'Company discovery candidates only; no official task, release issuance, scheduler registration or acceptance.' };
  if (!['run', 'inspect', 'poll'].includes(command)) throw new Error('ARGUMENTS');
  const flags = {};
  for (let n = 0; n < rest.length; n += 2) {
    if (!['--deployment', '--sha256', '--interval-ms'].includes(rest[n]) || !rest[n + 1] || flags[rest[n]]) throw new Error('ARGUMENTS');
    flags[rest[n]] = rest[n + 1];
  }
  if (!flags['--deployment'] || !flags['--sha256'] || Object.keys(flags).length !== (command === 'poll' ? 3 : 2)) throw new Error('ARGUMENTS');
  const runtime = await openWorkIntakeRuntime({ deploymentPath: flags['--deployment'], deploymentSha256: flags['--sha256'], readOnly: command === 'inspect' });
  try {
    if (command === 'run') return await runtime.runOnce();
    if (command === 'inspect') return await runtime.inspect();
    const interval = Number(flags['--interval-ms']);
    if (!Number.isInteger(interval) || interval < 1000 || interval > 3600000) throw new Error('INTERVAL');
    let stopped = false, wake;
    const stop = () => { stopped = true; wake?.(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try { while (!stopped) {
      try { process.stdout.write(`${JSON.stringify(await runtime.runOnce())}\n`); }
      catch { process.stdout.write('{"status":"HELD","reason":"INTAKE_UNAVAILABLE"}\n'); }
      if (!stopped) await new Promise(resolve => { const timer = setTimeout(resolve, interval); wake = () => { clearTimeout(timer); resolve(); }; });
    } } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    return { status: 'STOPPED' };
  } finally { runtime.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runWorkIntakeCli(process.argv.slice(2)))}\n`); }
  catch { process.stdout.write('{"status":"HELD","reason":"INTAKE_UNAVAILABLE"}\n'); process.exitCode = 1; }
}
