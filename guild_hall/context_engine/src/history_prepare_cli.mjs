// Manual night preparation only. No scheduler, source discovery, or model call
// occurs in --prepare; --run delegates to the existing explicit history CLI.
import { lstatSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHistory } from './knowledge_layer/history_prepare.mjs';
import { digest } from './knowledge_layer/data.mjs';

const HELP = `History night preparation (manual, project-scoped)
Usage:
  node guild_hall/context_engine/src/history_prepare_cli.mjs --help
  node guild_hall/context_engine/src/history_prepare_cli.mjs --prepare --project CODE [--date YYYY-MM-DD] [--from-date YYYY-MM-DD] --sources <absolute JSON> --output-root <existing absolute private dir> --binding <absolute JSON>
  node guild_hall/context_engine/src/history_prepare_cli.mjs --run --project CODE [--date YYYY-MM-DD] [--from-date YYYY-MM-DD] --sources <absolute JSON> --output-root <existing absolute private dir> --binding <absolute JSON>

With no --date, the target is yesterday in KST. With no --from-date, collection starts on the first day of the target month. All four source lanes must report status ok, including trusted empty lanes.
`;
const fail = code => { throw new Error(code); };
function readJson(file, limit) {
  if (typeof file !== 'string' || !isAbsolute(file)) fail('history_prepare_path_absolute_required');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) fail('history_prepare_file_invalid');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  const mode = argv[0]; if (!['--prepare', '--run'].includes(mode)) fail('history_prepare_mode_invalid');
  const args = { mode };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!['--project', '--date', '--from-date', '--sources', '--output-root', '--binding'].includes(flag)
      || !value || args[flag]) fail('history_prepare_arguments_invalid');
    args[flag] = value;
  }
  if (!args['--project'] || !args['--sources'] || !args['--output-root'] || !args['--binding'])
    fail('history_prepare_arguments_invalid');
  return args;
}
async function invokeExistingHistory({ inputFile, displayFile, outputRoot }, bindingPath) {
  const cli = fileURLToPath(new URL('./history_cli.mjs', import.meta.url));
  const argv = [cli, '--run', '--input', inputFile, '--output-root', outputRoot,
    '--binding', bindingPath, '--display-metadata', displayFile];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 2_000_000) child.kill(); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 2_000_000) child.kill(); });
    child.on('error', reject);
    child.on('close', code => {
      let result;
      try { result = JSON.parse(stdout.trim()); }
      catch { result = { status: 'failed', code: 'history_subprocess_result_invalid' }; }
      resolve({ exitCode: code, result });
    });
  });
}
export async function historyPrepareCli(argv = process.argv.slice(2), {
  collector, invokeHistory, stdout = process.stdout, stderr = process.stderr, now = new Date() } = {}) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.mode === 'help') { stdout.write(HELP); return 0; }
    const sourceConfig = readJson(parsed['--sources'], 2_000_000);
    const bindingFingerprint = digest(readJson(parsed['--binding'], 100_000));
    const nativeCollector = collector ?? (await import('./knowledge_layer/history_sources.mjs')).collectHistorySources;
    const result = await prepareHistory({ project: parsed['--project'], date: parsed['--date'],
      fromDate: parsed['--from-date'], sourceConfig, outputRoot: parsed['--output-root'],
      mode: parsed.mode.slice(2), collector: nativeCollector,
      invokeHistory: invokeHistory ?? (args => invokeExistingHistory(args, parsed['--binding'])),
      bindingFingerprint, now });
    stdout.write(JSON.stringify(result) + '\n');
    return ['history_failed', 'prepared_partial', 'source_hold'].includes(result.status) ? 2 : 0;
  } catch (error) {
    stderr.write(JSON.stringify({ status: 'hold', code: String(error?.message ?? 'history_prepare_error').slice(0, 120) }) + '\n');
    return 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase())
  process.exitCode = await historyPrepareCli();
