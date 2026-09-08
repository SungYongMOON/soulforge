#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { openFeedbackDispatch } from './feedback_dispatch.mjs';

export async function runFeedbackReadboxCli(argv) {
  const [command, ...args] = argv;
  if (command === '--help') return { usage: 'feedback_readbox_cli.mjs prepare|send|receipt|authorize|tick|poll --config ABS.json --config-sha256 SHA [--ref REF --sha256 SHA | --dispatch-ref REF --envelope-sha256 SHA]',
    boundary: 'Independent candidate; no credential loading, model startup, service registration or human acceptance.' };
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1] || flags[args[i]] !== undefined) throw new Error('INVALID_ARGUMENTS');
    flags[args[i]] = args[i + 1];
  }
  const required = ['--config', '--config-sha256'];
  const extra = { prepare: ['--ref', '--sha256'], send: ['--dispatch-ref'], receipt: ['--dispatch-ref'],
    authorize: ['--dispatch-ref', '--envelope-sha256'], tick: [], poll: ['--interval-ms'] }[command];
  if (!extra || Object.keys(flags).length !== required.length + extra.length || [...required, ...extra].some(k => !flags[k])) throw new Error('INVALID_ARGUMENTS');
  const dispatch = await openFeedbackDispatch({ configPath: flags['--config'], configSha256: flags['--config-sha256'], readOnly: command === 'authorize' });
  try {
    if (command === 'prepare') return await dispatch.prepare({ ref: flags['--ref'], sha256: flags['--sha256'] });
    if (command === 'send') return await dispatch.send(flags['--dispatch-ref']);
    if (command === 'receipt') return await dispatch.reconcile(flags['--dispatch-ref']);
    if (command === 'authorize') return await dispatch.authorizeNative(flags['--dispatch-ref'], flags['--envelope-sha256']);
    if (command === 'tick') return { state: 'TICK_COMPLETE', results: await dispatch.tick() };
    const interval = Number(flags['--interval-ms']);
    if (!Number.isInteger(interval) || interval < 1000 || interval > 3600000) throw new Error('INVALID_INTERVAL');
    let stopped = false, wake;
    const stop = () => { stopped = true; wake?.(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try { while (!stopped) {
      try { const results = await dispatch.tick(); process.stdout.write(`${JSON.stringify({ state: 'TICK_COMPLETE', results })}\n`); }
      catch { process.stdout.write('{"state":"HELD","code":"CURRENT_AUTHORITY_OR_SOURCE_UNAVAILABLE"}\n'); }
      if (!stopped) await new Promise(resolve => { const timer = setTimeout(resolve, interval); wake = () => { clearTimeout(timer); resolve(); }; });
    } } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    return { state: 'STOPPED' };
  } finally { dispatch.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await runFeedbackReadboxCli(process.argv.slice(2)))}\n`); }
  catch { process.stdout.write('{"status":"DENIED","code":"FEEDBACK_READBOX_HELD"}\n'); process.exitCode = 1; }
}
