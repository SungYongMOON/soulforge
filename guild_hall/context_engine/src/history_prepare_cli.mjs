// Manual source preparation only. No scheduler, model, or subprocess.
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHistory } from './knowledge_layer/history_prepare.mjs';

const HELP = `History night preparation (manual, project-scoped)
Usage:
  node guild_hall/context_engine/src/history_prepare_cli.mjs --help
  node guild_hall/context_engine/src/history_prepare_cli.mjs --prepare --project CODE [--date YYYY-MM-DD] [--from-date YYYY-MM-DD] --sources <absolute JSON> --output-root <existing absolute private dir>

With no --date, the target is yesterday in KST. With no --from-date, collection starts on the first day of the target month. All four source lanes must report status ok, including trusted empty lanes. A source_frozen result returns the input_file for history_cli.mjs --prepare; it does not finalize a draft.
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
  const mode = argv[0]; if (mode !== '--prepare') fail('history_prepare_mode_invalid');
  const args = { mode };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!['--project', '--date', '--from-date', '--sources', '--output-root'].includes(flag)
      || !value || args[flag]) fail('history_prepare_arguments_invalid');
    args[flag] = value;
  }
  if (!args['--project'] || !args['--sources'] || !args['--output-root'])
    fail('history_prepare_arguments_invalid');
  return args;
}
export async function historyPrepareCli(argv = process.argv.slice(2), {
  collector, stdout = process.stdout, stderr = process.stderr, now = new Date() } = {}) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.mode === 'help') { stdout.write(HELP); return 0; }
    const sourceConfig = readJson(parsed['--sources'], 2_000_000);
    const nativeCollector = collector ?? (await import('./knowledge_layer/history_sources.mjs')).collectHistorySources;
    const result = await prepareHistory({ project: parsed['--project'], date: parsed['--date'],
      fromDate: parsed['--from-date'], sourceConfig, outputRoot: parsed['--output-root'],
      collector: nativeCollector, now });
    stdout.write(JSON.stringify(result) + '\n');
    return result.status === 'source_hold' ? 2 : 0;
  } catch (error) {
    stderr.write(JSON.stringify({ status: 'hold', code: String(error?.message ?? 'history_prepare_error').slice(0, 120) }) + '\n');
    return 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase())
  process.exitCode = await historyPrepareCli();
