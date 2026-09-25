// Explicit private file handoff for history drafts. This CLI has no model or
// network transport; authoring happens outside the repository process.
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeHistoryExchange, prepareHistoryExchange } from './knowledge_layer/history_exchange.mjs';

const DEFAULT_RULES = fileURLToPath(new URL('../HISTORY_DRAFT_FORMAT.md', import.meta.url));
const HELP = `History draft file handoff (no model invocation)
Usage:
  node guild_hall/context_engine/src/history_cli.mjs --help
  node guild_hall/context_engine/src/history_cli.mjs --prepare --input <absolute JSON> --output-root <existing absolute private dir> [--rules <absolute text>] [--display-metadata <absolute JSON>]
  node guild_hall/context_engine/src/history_cli.mjs --finalize --input <absolute JSON> --prepared <absolute manifest JSON> --draft <absolute draft JSON> --output-root <existing absolute private dir> [--rules <absolute text>] [--display-metadata <absolute JSON>]

The default rules file is guild_hall/context_engine/HISTORY_DRAFT_FORMAT.md.
--prepare writes immutable source packets and one manifest. Write a draft file
for every packet_id in that manifest, then --finalize accepts them together.
Neither command invokes a model, discovers a service, or starts a subprocess.
`;
const fail = code => { throw new Error(code); };
function readFile(path, maxBytes) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('history_path_absolute_required');
  let stat;
  try { stat = lstatSync(path); } catch { fail('history_input_file_invalid'); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes)
    fail('history_input_file_invalid');
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (bytes.length !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino
    || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
    fail('history_input_file_changed');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('history_input_file_encoding_invalid'); }
}
function readJson(path, maxBytes) {
  try { return JSON.parse(readFile(path, maxBytes)); }
  catch (error) {
    if (String(error?.message ?? '').startsWith('history_')) throw error;
    fail('history_input_json_invalid');
  }
}
function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  const mode = argv[0];
  if (!['--prepare', '--finalize'].includes(mode)) fail('history_mode_invalid');
  const parsed = { mode };
  for (let i = 1; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!['--input', '--output-root', '--rules', '--display-metadata', '--prepared', '--draft'].includes(flag)
      || !value || Object.hasOwn(parsed, flag)) fail('history_arguments_invalid');
    parsed[flag] = value;
  }
  if (!parsed['--input'] || !parsed['--output-root']
    || typeof parsed['--output-root'] !== 'string' || !isAbsolute(parsed['--output-root'])
    || (mode === '--finalize' && (!parsed['--prepared'] || !parsed['--draft']))
    || (mode === '--prepare' && (parsed['--prepared'] || parsed['--draft'])))
    fail('history_arguments_invalid');
  return parsed;
}
export async function historyCli(argv = process.argv.slice(2),
  { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const parsed = parseArgs(argv);
    if (parsed.mode === 'help') { stdout.write(HELP); return 0; }
    const input = readJson(parsed['--input'], 20_000_000);
    const rulesText = readFile(parsed['--rules'] ?? DEFAULT_RULES, 100_000);
    const displayMetadata = parsed['--display-metadata']
      ? readJson(parsed['--display-metadata'], 2_000_000) : {};
    const common = { input, outputRoot: parsed['--output-root'], rulesText, displayMetadata };
    const result = parsed.mode === '--prepare'
      ? await prepareHistoryExchange(common)
      : await finalizeHistoryExchange({ ...common,
        prepared: readJson(parsed['--prepared'], 2_000_000),
        draft: readJson(parsed['--draft'], 2_000_000) });
    stdout.write(JSON.stringify(result) + '\n');
    return ['prepared', 'finalized', 'unchanged'].includes(result.status) ? 0 : 2;
  } catch (error) {
    const code = String(error?.message ?? 'history_error');
    stderr.write(JSON.stringify({ status: 'hold', code: /^[a-z0-9_:-]{1,120}$/u.test(code)
      ? code : 'history_error' }) + '\n');
    return 2;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase())
  process.exitCode = await historyCli();
