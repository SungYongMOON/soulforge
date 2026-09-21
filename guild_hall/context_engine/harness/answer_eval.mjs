// Re-runnable, deterministic answer evaluation for the local answering bot:
// the I/O half. `src/runtime/answer_eval.mjs` owns every rule; this file owns
// reading files, running one command per question, writing one receipt, and
// printing two tables.
//
// Why it exists: on 2026-09-20 three golden questions were run by hand across
// two models over a whole day, compared in prose, and the numeric cells were
// never filled in. A change to what the bot can see needs an answer to
// "better or worse than last time" in minutes.
//
// Two modes, and the first one is the point:
//   --answers-dir  score answer files that already exist. No model, no
//                  command, nothing to be running -- so a run from last week
//                  whose answers were saved can be scored today, and the two
//                  receipts compared.
//   --ask-command  produce the answers first, by running one command per
//                  question. The command template is a JSON argv array with
//                  `{prompt_file}`/`{answer_file}` placeholders; it is run
//                  through `execFile` with no shell and never by string
//                  concatenation, under a timeout, one question at a time
//                  (the local model server has one slot -- two at once would
//                  just make both wait).
// This harness knows nothing about any particular bot. Teaching it would be
// the bug: the template is the seam.
//
// The receipt is keys and numbers only -- no prompt text, no answer text, no
// matched substring, no answers directory, no argument vector. It is meant to
// be safe to paste into a public log; the answer itself is identified by its
// sha256 and its length.
//
// exit codes: 0 ran | 2 usage/validation | 3 regression vs --compare when
// --fail-on-regression is set | 4 an ask-command failed or timed out. 4 wins
// over 3: a run that could not produce some of its answers has numbers that
// are not worth comparing.
//
// usage:
//   node answer_eval.mjs --questions <file.json> --answers-dir <dir>
//        --label <text> --receipts <dir> [--compare latest|<receipt.json>]
//        [--fail-on-regression] [--only id,id] [--dry]
//   node answer_eval.mjs --questions <file.json> --ask-command <file.json>
//        --label <text> --receipts <dir> [...]
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, closeSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANSWER_EVAL_RECEIPT_SCHEMA, ANSWER_EVAL_TOOL_VERSION, AnswerEvalError, MAX_ANSWER_BYTES,
  compareRuns, resolveArgv, scoreAnswer, sha256Hex, summarize, validateAskCommand,
  validateLabel, validateQuestionSet,
} from '../src/runtime/answer_eval.mjs';

export const MAX_QUESTION_FILE_BYTES = 1024 * 1024;
export const MAX_ASK_COMMAND_FILE_BYTES = 64 * 1024;
// A bot that writes megabytes to stdout should not take this harness down
// with it; the answer itself is read from a file, not from stdout.
const MAX_ASK_STDIO_BYTES = 1024 * 1024;
// Environment names every spawned process gets regardless of the template's
// own allowlist, because without them a child process does not reliably start
// at all on the host it is started from. Values are copied, never inspected.
const BASELINE_ENV = Object.freeze(process.platform === 'win32'
  ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'windir', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']
  : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL']);

const fail = (code, detail) => { throw new AnswerEvalError(code, detail); };
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// ------------------------------------------------------------------ files
function readCapped(file, cap) {
  const size = statSync(file).size;
  if (size <= cap) {
    const bytes = readFileSync(file);
    return { bytes, truncated: false };
  }
  // Read exactly the cap rather than the whole file: an accidentally huge
  // answer is scored on its first megabyte and says so, instead of either
  // being refused outright or pulling the file into memory whole.
  const handle = openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(cap);
    const read = readSync(handle, bytes, 0, cap, 0);
    return { bytes: bytes.subarray(0, read), truncated: true };
  } finally { closeSync(handle); }
}

function readJsonFile(file, cap, codes) {
  let bytes;
  try { bytes = readFileSync(file); }
  catch (error) { fail(codes.unreadable, error?.code ?? 'unknown'); }
  if (bytes.length > cap) fail(codes.tooLarge);
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); }
  catch { fail(codes.invalidJson); }
  return { body, bytes };
}

// ------------------------------------------------------------ answers dir
const ANSWERS_MAP_FILE = 'answers.json';

/**
 * Where one question's answer lives, and whatever the run already recorded
 * about producing it. Either `answers.json` maps question ids to paths (plus
 * optional `elapsed_seconds`/`tool_calls` a previous run measured), or the
 * convention `<id>.md` applies. A mapped path is resolved against the answers
 * directory and refused if it leaves it -- a question set is a hand-written
 * file, and a hand-written file should not be able to name an arbitrary spot
 * on the host.
 */
export function resolveAnswerPlan(answersDir, questionIds) {
  const mapFile = path.join(answersDir, ANSWERS_MAP_FILE);
  const plan = new Map();
  if (!existsSync(mapFile)) {
    for (const id of questionIds) plan.set(id, { file: path.join(answersDir, `${id}.md`), elapsed_seconds: null, tool_calls: null });
    return plan;
  }
  const { body } = readJsonFile(mapFile, MAX_QUESTION_FILE_BYTES, {
    unreadable: 'answer_eval_answers_map_unreadable', tooLarge: 'answer_eval_answers_map_too_large',
    invalidJson: 'answer_eval_answers_map_invalid_json' });
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('answer_eval_answers_map_invalid');
  const root = path.resolve(answersDir);
  for (const id of questionIds) {
    const entry = body[id];
    if (entry === undefined) { plan.set(id, { file: null, elapsed_seconds: null, tool_calls: null }); continue; }
    const raw = typeof entry === 'string' ? { path: entry } : entry;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.path !== 'string' || raw.path === '') {
      fail('answer_eval_answers_map_entry_invalid', id);
    }
    const resolved = path.resolve(root, raw.path);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) fail('answer_eval_answer_path_escapes', id);
    const numberOrNull = (value, code) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(code, id);
      return value;
    };
    plan.set(id, { file: resolved,
      elapsed_seconds: numberOrNull(raw.elapsed_seconds, 'answer_eval_answers_map_elapsed_invalid'),
      tool_calls: numberOrNull(raw.tool_calls, 'answer_eval_answers_map_tool_calls_invalid') });
  }
  return plan;
}

// ------------------------------------------------------------ ask command
/**
 * Runs one question through the ask command. Returns the answer text or a
 * reason it has none; never throws for an ordinary failure of the bot, since
 * "this question failed" is a result the receipt has to carry.
 *
 * `execFile` with an argv array and no `shell` -- the prompt reaches the
 * command only as the contents of a file whose path is substituted in, so no
 * question text is ever parsed as a command. The environment is the template's
 * allowlist plus the baseline a process needs to start, and nothing else.
 */
export async function askOne({ command, question, workDir, runner = execFile } = {}) {
  const promptFile = path.join(workDir, `${question.id}.prompt.txt`);
  const answerFile = path.join(workDir, `${question.id}.answer.md`);
  rmSync(answerFile, { force: true });
  writeFileSync(promptFile, `${question.prompt}\n`);
  const argv = resolveArgv(command.argv, { promptFile, answerFile });
  const env = {};
  for (const name of [...BASELINE_ENV, ...command.env]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  const startedAt = process.hrtime.bigint();
  const outcome = await new Promise(resolve => {
    runner(argv[0], argv.slice(1), {
      cwd: workDir, env, timeout: Math.round(command.timeout_seconds * 1000),
      maxBuffer: MAX_ASK_STDIO_BYTES, windowsHide: true, encoding: 'utf8',
    }, error => {
      if (!error) return resolve({ failed: false, reason: null });
      if (error.killed === true || error.signal) return resolve({ failed: true, reason: 'ask_command_timeout' });
      const code = Number.isInteger(error.code) ? error.code : null;
      return resolve({ failed: true, reason: code === null ? 'ask_command_failed' : `ask_command_exit:${code}` });
    });
  });
  const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
  if (outcome.failed) return { text: null, sha256: null, truncated: false, elapsed_seconds: elapsedSeconds, reason: outcome.reason };
  if (!existsSync(answerFile)) {
    return { text: null, sha256: null, truncated: false, elapsed_seconds: elapsedSeconds, reason: 'ask_command_answer_absent' };
  }
  const { bytes, truncated } = readCapped(answerFile, MAX_ANSWER_BYTES);
  return { text: bytes.toString('utf8'), sha256: sha256(bytes), truncated, elapsed_seconds: elapsedSeconds, reason: null };
}

// ---------------------------------------------------------------- receipt
function receiptName(startedAt) {
  return `${startedAt.replace(/[-:.]/gu, '').slice(0, 15)}.json`;
}

/** Through a neighbour and a rename, so a reader never sees half a receipt. */
export function writeReceipt(receiptsDir, receipt) {
  mkdirSync(receiptsDir, { recursive: true });
  let file = path.join(receiptsDir, receiptName(receipt.started_at));
  for (let suffix = 1; existsSync(file) && suffix < 1000; suffix += 1) {
    file = path.join(receiptsDir, `${receiptName(receipt.started_at).slice(0, -5)}-${suffix}.json`);
  }
  const staging = `${file}.writing`;
  writeFileSync(staging, encode(receipt));
  renameSync(staging, file);
  return file;
}

/** The newest receipt in a directory, by filename (which is its start instant). */
export function latestReceipt(receiptsDir, { exclude = null } = {}) {
  if (!existsSync(receiptsDir)) return null;
  const names = readdirSync(receiptsDir).filter(name => name.endsWith('.json')
    && (exclude === null || path.join(receiptsDir, name) !== exclude)).sort();
  return names.length === 0 ? null : path.join(receiptsDir, names[names.length - 1]);
}

// ----------------------------------------------------------------- tables
const pct = share => (share === null ? '    -' : `${Math.round(share * 100).toString().padStart(4, ' ')}%`);
const minutes = seconds => (seconds === null ? '      -' : (seconds / 60).toFixed(2).padStart(7, ' '));
const FLAG_NAMES = Object.freeze({ clarification_instead_of_answer: 'clarification', over_time: 'over-time',
  answer_truncated: 'truncated', answer_absent: 'absent' });

function flagsOf(row) {
  const names = Object.entries(FLAG_NAMES).filter(([key]) => row.flags[key] === true).map(([, name]) => name);
  if (row.outcome === 'failed') names.unshift(row.reason ?? 'failed');
  return names.length === 0 ? '-' : names.join(',');
}

export function renderTable(receipt) {
  const width = Math.max(10, ...receipt.results.map(row => row.question_id.length));
  const header = `${'question'.padEnd(width)}  found  cited  errors  minutes  chars  flags`;
  const rule = '-'.repeat(header.length);
  const lines = [header, rule];
  for (const row of receipt.results) {
    lines.push(`${row.question_id.padEnd(width)}  ${pct(row.found.share)}  ${pct(row.cited.share)}  `
      + `${String(row.errors.count).padStart(6, ' ')}  ${minutes(row.elapsed_seconds)}  `
      + `${String(row.answer_chars).padStart(5, ' ')}  ${flagsOf(row)}`);
  }
  const totals = receipt.totals;
  lines.push(rule);
  lines.push(`${'mean/total'.padEnd(width)}  ${pct(totals.mean_found)}  ${pct(totals.mean_cited)}  `
    + `${String(totals.errors_total).padStart(6, ' ')}  ${totals.minutes_total.toFixed(2).padStart(7, ' ')}`);
  for (const row of receipt.results) {
    const missed = [...row.found.missed_keys.map(key => `found/${key}`), ...row.cited.missed_keys.map(key => `cited/${key}`)];
    if (missed.length > 0) lines.push(`missed ${row.question_id}: ${missed.join(', ')}`);
    if (row.errors.count > 0) lines.push(`wrong  ${row.question_id}: ${row.errors.keys.join(', ')}`);
  }
  return lines;
}

const delta = value => (value === null ? '     ' : `${value >= 0 ? '+' : '-'}${Math.round(Math.abs(value) * 100).toString().padStart(3, ' ')}%`);

export function renderComparison(comparison) {
  const width = Math.max(10, ...comparison.questions.map(row => row.question_id.length));
  const header = `${'question'.padEnd(width)}  found  cited  errors  state`;
  const rule = '-'.repeat(header.length);
  const lines = [`compared against ${comparison.previous_label ?? 'unlabeled'} (${comparison.previous_started_at ?? 'unknown'})`,
    header, rule];
  for (const row of comparison.questions) {
    lines.push(`${row.question_id.padEnd(width)}  ${delta(row.found_delta)}  ${delta(row.cited_delta)}  `
      + `${(row.errors_delta === null ? '' : (row.errors_delta >= 0 ? `+${row.errors_delta}` : String(row.errors_delta))).padStart(6, ' ')}  `
      + `${row.regressed ? 'REGRESSED' : row.state}`);
  }
  lines.push(rule);
  lines.push(`${'mean/total'.padEnd(width)}  ${delta(comparison.totals.mean_found_delta)}  ${delta(comparison.totals.mean_cited_delta)}  `
    + `${(comparison.totals.errors_delta >= 0 ? `+${comparison.totals.errors_delta}` : String(comparison.totals.errors_delta)).padStart(6, ' ')}`);
  const newlyMissed = comparison.questions.flatMap(row => row.newly_missed.map(key => `${row.question_id}/${key}`));
  const newlyFound = comparison.questions.flatMap(row => row.newly_found.map(key => `${row.question_id}/${key}`));
  lines.push(`newly missed: ${newlyMissed.length === 0 ? 'none' : newlyMissed.join(', ')}`);
  lines.push(`newly found:  ${newlyFound.length === 0 ? 'none' : newlyFound.join(', ')}`);
  return lines;
}

// -------------------------------------------------------------------- run
/**
 * One evaluation. `askRunner` is the only place this ever starts a process;
 * tests hand in their own (or point the template at a small script) and
 * nothing here knows what a bot is.
 */
export async function runAnswerEval({ questionsFile, answersDir = null, askCommandFile = null, label = 'unlabeled',
  receiptsDir = null, only = null, dry = false, now = new Date().toISOString(), askRunner = execFile,
  log = () => {} } = {}) {
  validateLabel(label);
  if ((answersDir === null) === (askCommandFile === null)) fail('answer_eval_mode_required');
  const { body, bytes } = readJsonFile(questionsFile, MAX_QUESTION_FILE_BYTES, {
    unreadable: 'answer_eval_questions_unreadable', tooLarge: 'answer_eval_questions_too_large',
    invalidJson: 'answer_eval_questions_invalid_json' });
  const set = validateQuestionSet(body);
  const questionsSha256 = sha256(bytes);

  let questions = set.questions;
  if (only !== null) {
    const wanted = new Set(only);
    const known = new Set(questions.map(question => question.id));
    for (const id of wanted) if (!known.has(id)) fail('answer_eval_only_unknown', id);
    questions = questions.filter(question => wanted.has(question.id));
    if (questions.length === 0) fail('answer_eval_only_empty');
  }

  const mode = answersDir === null ? 'ask_command' : 'answers_dir';
  let command = null;
  let askSummary = null;
  if (mode === 'ask_command') {
    const ask = readJsonFile(askCommandFile, MAX_ASK_COMMAND_FILE_BYTES, {
      unreadable: 'answer_eval_ask_command_unreadable', tooLarge: 'answer_eval_ask_command_too_large',
      invalidJson: 'answer_eval_ask_command_invalid_json' });
    command = validateAskCommand(ask.body);
    // The argument vector can name host paths, so the receipt carries its
    // digest and shape rather than the vector itself.
    askSummary = { argv_sha256: sha256(Buffer.from(JSON.stringify(command.argv))), argv_length: command.argv.length,
      timeout_seconds: command.timeout_seconds, env_names: [...command.env].sort() };
  }

  let plan = null;
  if (mode === 'answers_dir') {
    if (!existsSync(answersDir)) fail('answer_eval_answers_dir_absent');
    plan = resolveAnswerPlan(answersDir, questions.map(question => question.id));
  }

  if (dry) {
    log(`dry: set ${set.set_id} (${questionsSha256}) mode ${mode} label ${label}`);
    for (const question of questions) {
      const where = mode === 'answers_dir'
        ? (() => { const entry = plan.get(question.id); return entry.file === null ? 'no answer mapped'
          : (existsSync(entry.file) ? 'answer present' : 'answer file absent'); })()
        : `would run ${askSummary.argv_length}-arg command, timeout ${command.timeout_seconds}s`;
      log(`  ${question.id}: prompt ${question.prompt.length} chars, `
        + `must_find ${question.must_find.length}, must_cite ${question.must_cite.length}, `
        + `must_not ${question.must_not.length}, ${where}`);
    }
    return { status: 'DRY', receipt: null, receiptFile: null, comparison: null, questions: questions.length };
  }

  if (receiptsDir === null) fail('answer_eval_receipts_required');

  const results = [];
  let workDir = null;
  try {
    if (mode === 'ask_command') workDir = mkdtempSync(path.join(os.tmpdir(), 'answer-eval-'));
    for (const question of questions) {
      // Serial on purpose: one local model server, one slot.
      let scored;
      if (mode === 'answers_dir') {
        const entry = plan.get(question.id);
        if (entry.file === null || !existsSync(entry.file)) {
          scored = scoreAnswer({ question, clarification: set.clarification, answerText: null,
            outcome: 'absent', reason: 'answer_file_absent' });
        } else {
          const { bytes: answerBytes, truncated } = readCapped(entry.file, MAX_ANSWER_BYTES);
          scored = scoreAnswer({ question, clarification: set.clarification, answerText: answerBytes.toString('utf8'),
            answerSha256: sha256(answerBytes), answerTruncated: truncated,
            elapsedSeconds: entry.elapsed_seconds, toolCalls: entry.tool_calls });
        }
      } else {
        const asked = await askOne({ command, question, workDir, runner: askRunner });
        scored = scoreAnswer({ question, clarification: set.clarification, answerText: asked.text,
          answerSha256: asked.sha256, answerTruncated: asked.truncated, elapsedSeconds: asked.elapsed_seconds,
          outcome: asked.reason === null ? 'answered' : 'failed', reason: asked.reason });
      }
      results.push(scored);
      log(`${question.id} found=${pct(scored.found.share).trim()} cited=${pct(scored.cited.share).trim()} `
        + `errors=${scored.errors.count} flags=${flagsOf(scored)}`);
    }
  } finally {
    if (workDir !== null) rmSync(workDir, { recursive: true, force: true });
  }

  // Every question absent is a wiring mistake (wrong directory, wrong naming
  // convention), not a result about the bot -- reported as a validation
  // refusal rather than as a receipt full of zeroes that a later comparison
  // would read as a catastrophic regression.
  if (mode === 'answers_dir' && results.length > 0 && results.every(row => row.flags.answer_absent)) {
    fail('answer_eval_answers_all_absent');
  }

  const totals = summarize(results);
  const askFailures = results.filter(row => row.outcome === 'failed').length;
  const receipt = {
    schema_version: ANSWER_EVAL_RECEIPT_SCHEMA,
    tool_version: ANSWER_EVAL_TOOL_VERSION,
    label,
    mode,
    set_id: set.set_id,
    questions_sha256: questionsSha256,
    questions_created_at: set.created_at,
    started_at: now,
    finished_at: new Date().toISOString(),
    ask_command: askSummary,
    selection: { only: only === null ? null : [...only], questions: results.length, set_questions: set.questions.length },
    results,
    totals,
    status: askFailures > 0 ? 'ASK_FAILED' : 'OK',
  };
  const receiptFile = writeReceipt(receiptsDir, receipt);
  return { status: receipt.status, receipt, receiptFile, comparison: null, ask_failures: askFailures };
}

// -------------------------------------------------------------------- CLI
function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const next = argv[index + 1];
    flags.set(token.slice(2), next === undefined || next.startsWith('--') ? true : (index++, next));
  }
  return flags;
}

const stringFlag = (flags, name) => {
  const value = flags.get(name);
  return typeof value === 'string' ? value : null;
};

export async function runAnswerEvalCli(argv, { now, askRunner, log: onLine } = {}) {
  const flags = options(argv);
  const lines = [];
  const log = line => { lines.push(line); if (onLine) onLine(line); };

  const questionsFile = stringFlag(flags, 'questions');
  if (questionsFile === null) fail('answer_eval_questions_required');
  const answersDir = stringFlag(flags, 'answers-dir');
  const askCommandFile = stringFlag(flags, 'ask-command');
  const receiptsDir = stringFlag(flags, 'receipts');
  const label = stringFlag(flags, 'label') ?? 'unlabeled';
  const dry = flags.get('dry') === true;
  const failOnRegression = flags.get('fail-on-regression') === true;
  const onlyRaw = stringFlag(flags, 'only');
  const only = onlyRaw === null ? null : onlyRaw.split(',').map(item => item.trim()).filter(item => item !== '');
  if (only !== null && only.length === 0) fail('answer_eval_only_empty');
  const compare = stringFlag(flags, 'compare');
  if (flags.get('compare') === true) fail('answer_eval_compare_invalid');

  const result = await runAnswerEval({ questionsFile, answersDir, askCommandFile, label, receiptsDir,
    only, dry, ...(now ? { now } : {}), ...(askRunner ? { askRunner } : {}), log });
  if (result.status === 'DRY') return { result, lines, exitCode: 0 };

  for (const line of renderTable(result.receipt)) log(line);

  let comparison = null;
  if (compare !== null) {
    const file = compare === 'latest' ? latestReceipt(receiptsDir, { exclude: result.receiptFile }) : compare;
    if (file === null) {
      log('compare: no earlier receipt in this directory');
    } else {
      const previous = readJsonFile(file, MAX_QUESTION_FILE_BYTES, {
        unreadable: 'answer_eval_compare_unreadable', tooLarge: 'answer_eval_compare_too_large',
        invalidJson: 'answer_eval_compare_invalid_json' }).body;
      if (previous?.schema_version !== ANSWER_EVAL_RECEIPT_SCHEMA) fail('answer_eval_compare_schema_unknown', String(previous?.schema_version));
      comparison = compareRuns(previous, result.receipt);
      for (const line of renderComparison(comparison)) log(line);
    }
  }

  // An ask-command failure outranks a regression: a run that could not
  // produce some of its answers has numbers not worth comparing.
  let exitCode = 0;
  if (result.ask_failures > 0) exitCode = 4;
  else if (failOnRegression && comparison !== null && comparison.regressed) exitCode = 3;
  return { result, comparison, lines, exitCode };
}

async function main() {
  const { exitCode } = await runAnswerEvalCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
  return exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[answer-eval] ${error?.code ?? error?.message ?? 'failed'}`
      + `${error?.detail ? ` (${error.detail})` : ''}\n`);
    process.exitCode = 2;
  });
}
