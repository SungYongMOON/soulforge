// Step 4 (빠른 고리): turns the reconcile harness's exception pool into a
// bounded, human-readable morning question list, keeps the one ledger that
// remembers what was asked and answered, and applies a person's answer
// through the *existing* ledger writers -- this file never writes the voice
// route ledger itself, only `voice_route_cli.mjs`'s own `confirm`/`set`/
// `withdraw` commands do that, the same as `estate_voice_card_reconcile.mjs`
// already does.
//
// Presentation only: this prints markdown text. Sending it anywhere (Hermes,
// a DM, a gateway) is Step 4b and is not here -- a briefing lane can include
// this command's stdout once one exists to call it.
//
// usage:
//   node voice_question_cli.mjs present --root-table <file> --tools-config <file>
//        --receipts <reconcile receipts dir> [--date YYYY-MM-DD] [--cap 10]
//        [--root-table-sha256 sha256:...] [--now <iso>] [--dry] [--json]
//   node voice_question_cli.mjs answer  --root-table <file> --tools-config <file>
//        --receipts <reconcile receipts dir> --question <id>
//        --choice <code|other:<code>|none|not_work|split|confirm_content>
//        --by <actor> [--root-table-sha256 sha256:...] [--now <iso>] [--dry] [--json]
//
// `--receipts` is the reconcile harness's own `--receipts` directory (a
// plain filesystem path, never an `io`-aliased address -- reconcile's
// receipts never were one either); this file reads every
// `soulforge.voice_card_reconcile_receipt.v2` JSON it finds there for the
// exception pool and the latest-run-id staleness check, and writes its own
// receipts into the same directory under its own schema.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { selectQuestions } from '../src/runtime/voice_morning_questions.mjs';
import { runVoiceRouteCli } from './voice_route_cli.mjs';

export const QUESTION_LEDGER_SCHEMA = 'soulforge.voice_question_ledger.v0';
export const QUESTION_LEDGER_ADDRESS = 'control_root/voice-questions';
export const QUESTION_LEDGER_FILE = 'questions.v0.json';
export const QUESTION_CLI_RECEIPT_SCHEMA = 'soulforge.voice_question_cli_receipt.v1';
const RECONCILE_RECEIPT_SCHEMA = 'soulforge.voice_card_reconcile_receipt.v2';
const RECONCILE_ACTOR = 'actor:context-engine:voice-card-reconcile-v0';
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const MAX_QUESTIONS = 20000;
const DEFAULT_CAP = 10;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

export class VoiceQuestionError extends Error {
  constructor(code) { super(code); this.name = 'VoiceQuestionError'; this.code = code; }
}
const fail = code => { throw new VoiceQuestionError(code); };
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    flags.set(name, value);
  }
  return flags;
}

// ------------------------------------------------------------------ ledger
const ledgerDir = io => io.path(QUESTION_LEDGER_ADDRESS, true);
const ledgerFilePath = dir => path.join(dir, QUESTION_LEDGER_FILE);

/** `{ schema_version, questions: [] }`, or the file's own content if one exists and is readable. */
export function readQuestionLedger(io) {
  const file = ledgerFilePath(ledgerDir(io));
  if (!existsSync(file)) return { schema_version: QUESTION_LEDGER_SCHEMA, updated_at: null, questions: [] };
  const bytes = readFileSync(file);
  if (bytes.length > MAX_LEDGER_BYTES) fail('voice_question_ledger_too_large');
  let body;
  try { body = JSON.parse(bytes); } catch { fail('voice_question_ledger_unreadable'); }
  if (body?.schema_version !== QUESTION_LEDGER_SCHEMA || !Array.isArray(body.questions)) {
    fail('voice_question_ledger_invalid');
  }
  if (body.questions.length > MAX_QUESTIONS) fail('voice_question_ledger_too_large');
  return body;
}

/** Serialised (a `.lock` file alongside, the same shape every other ledger in this codebase uses), atomic rename. */
function writeQuestionLedger(io, ledger, now) {
  const dir = ledgerDir(io);
  mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, 'questions.lock');
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') fail('voice_question_ledger_locked'); throw error; }
  try {
    const body = { schema_version: QUESTION_LEDGER_SCHEMA, updated_at: now, questions: ledger.questions };
    const file = ledgerFilePath(dir);
    const staging = `${file}.writing`;
    writeFileSync(staging, encode(body));
    renameSync(staging, file);
  } finally { rmSync(lockFile, { force: true }); }
}

// -------------------------------------------------------------- receipts
/** Every JSON file in `dir`, chronological by name (the reconcile harness's own zero-padded-timestamp convention). */
function receiptFileNames(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter(entry => entry.endsWith('.json')).sort();
}

function readReconcileReceipt(dir, name) {
  let bytes;
  try { bytes = readFileSync(path.join(dir, name)); } catch { return null; }
  if (bytes.length > MAX_RECEIPT_BYTES) return null;
  let body;
  try { body = JSON.parse(bytes); } catch { return null; }
  if (body?.schema_version !== RECONCILE_RECEIPT_SCHEMA) return null;
  return body;
}

/**
 * Every exception row across every reconcile receipt in `receiptsDir` --
 * S4-1's own contract is "never truncate the pool", so every receipt this
 * pass can read contributes its rows, not only the most recent one. Reading
 * in chronological order means a later receipt's row for the same target
 * naturally overwrites an earlier one's once the caller groups by target
 * (`voice_morning_questions.mjs`'s own `targetsFor`), so the freshest
 * `receipt_ran_at` for a given segment always wins without this function
 * having to decide that itself.
 */
export function readExceptionPool(receiptsDir) {
  const pool = [];
  for (const name of receiptFileNames(receiptsDir)) {
    const body = readReconcileReceipt(receiptsDir, name);
    if (body === null || !Array.isArray(body.exception_review)) continue;
    for (const row of body.exception_review) pool.push(row);
  }
  return pool;
}

/** The most recent reconcile receipt's own `run_id` for `sessionId`, or `null` if none mention it. */
function currentRunIdFor(receiptsDir, sessionId) {
  let found = null;
  for (const name of receiptFileNames(receiptsDir)) {
    const body = readReconcileReceipt(receiptsDir, name);
    if (body === null || !Array.isArray(body.sessions)) continue;
    const row = body.sessions.find(item => item?.session_id === sessionId && typeof item.run_id === 'string');
    if (row !== undefined) found = row.run_id;
  }
  return found;
}

// -------------------------------------------------------------- present
function markdownFor({ presented, carriedOverCount, urgentOverflowCount }) {
  if (presented.length === 0) {
    return { text: '없음', lines: ['없음'] };
  }
  const lines = [`어제 애매한 것 ${presented.length}건 (이월 ${carriedOverCount}, 긴급 초과 ${urgentOverflowCount})`];
  presented.forEach((question, index) => {
    const time = typeof question.representative.time === 'string' ? question.representative.time.slice(11, 16) : '--:--';
    const title = question.representative.title ?? '(제목 없음)';
    lines.push(`${index + 1}. ${time} ${title} — 질문 ${question.kind} — 선택지: ${question.options.join(' / ')}`);
  });
  lines.push(`[q:${presented.map(question => question.question_id).join(' q:')}]`);
  return { text: lines.join('\n'), lines };
}

export async function runQuestionPresent({ io, tools, receiptsDir, targetDate, cap, dry, now }) {
  const pool = readExceptionPool(receiptsDir);
  const ledger = readQuestionLedger(io);
  const result = selectQuestions({ exceptions: pool, ledger, now, cap });
  const markdown = markdownFor({ presented: result.presented, carriedOverCount: result.carried_over.length,
    urgentOverflowCount: result.urgent_overflow.length });

  if (!dry) {
    // Merge: every presented/carried/urgent_overflow question replaces its
    // same-id row in the ledger (or is added fresh); every other existing
    // row (already `answered`/`withdrawn`, or simply not touched by today's
    // pool at all) is left exactly as it was -- this pass proposes and
    // presents, it never answers or withdraws anything on its own.
    const touched = new Map();
    for (const question of [...result.presented, ...result.carried_over, ...result.urgent_overflow]) {
      touched.set(question.question_id, { question_id: question.question_id, kind: question.kind,
        targets: question.targets, options: question.options, candidates: question.candidates ?? [],
        representative: question.representative,
        status: question.presented_on !== undefined && question.presented_on.includes(
          new Date(now).toISOString().slice(0, 10)) ? 'presented' : 'proposed',
        first_seen: question.first_seen, presented_on: question.presented_on ?? question.previously_presented_on ?? [],
        answered: null, reopened_from: question.reopened_from, withdrawn_reason: null, partial: null });
    }
    const merged = [...ledger.questions.filter(question => !touched.has(question.question_id)), ...touched.values()];
    writeQuestionLedger(io, { questions: merged }, now);
  }

  const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'present', ran_at: now, target_date: targetDate,
    cap, dry, metrics: result.metrics, presented: result.presented.map(question => question.question_id),
    carried_over: result.carried_over.map(question => question.question_id),
    urgent_overflow: result.urgent_overflow.map(question => question.question_id),
    resolved_by_reuse: result.resolved_by_reuse.map(question => question.question_id), status: 'OK' };
  if (!dry) writeReceipt(receiptsDir, now, receipt);
  return { receipt, markdown };
}

function writeReceipt(receiptsDir, now, receipt) {
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, `q${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(receipt));
}

// --------------------------------------------------------------- answer
// A basis prefix `set --project` writes for a machine-basis candidate
// (`voice_route_cli.mjs`'s own `MACHINE_BASIS_PREFIXES`, duplicated here for
// the same reason `estate_voice_card_reconcile.mjs`'s copy is -- this file
// already imports that one, the other direction would be circular) --
// naming it here documents exactly which `--by` values `answer` refuses,
// not a claim this check proves an actor's real identity.
const MACHINE_BY = /^actor:(context-engine|bot|machine):/u;

function isMachineActor(by) {
  return by === RECONCILE_ACTOR || MACHINE_BY.test(by ?? '');
}

/**
 * Applies one answer to one segment, through the existing ledger writers
 * only. `attribution` questions (귀속): a code in the offered set, or
 * `other:<code>`, both call `confirm --project <code>`. `not_work` clears
 * every candidate this question offered via `set --drop-project` (one call
 * per code) and leaves the segment `unclassified` if nothing else is on it
 * -- there is no "not work" status in the ledger schema, so this is the
 * closest an existing writer gets, documented rather than invented
 * silently. `none` records the answer in the question ledger only, no
 * route write at all -- a person looked and is explicitly deferring, which
 * is different from every other choice a group offers.
 * Content (내용확인), split (분할) and modality (조건확인) questions have no
 * project decision to write at all: every choice for them is ledger-only.
 */
function applyChoice({ kind, choice, target, tablePath, tableSha256, by, now }) {
  // `not_work` never reaches here -- `runQuestionAnswer` routes it to
  // `applyNotWork` below instead, since only that caller knows the
  // question's own candidate codes to drop.
  if (kind !== '귀속' || choice === 'none') return { calls: 0, error: null };
  const common = ['--root-table', tablePath, '--root-table-sha256', tableSha256, '--session', target.session_id,
    '--segment', target.segment_id, '--by', by, '--now', now];
  try {
    const code = choice.startsWith('other:') ? choice.slice('other:'.length) : choice;
    runVoiceRouteCli(['confirm', ...common, '--project', code, '--basis', `voice_question_cli:${kind} 사람 답변`,
      '--title', '사람 확인', '--nature', 'project_work', '--quality', 'independent_fast']);
    return { calls: 1, error: null };
  } catch (error) {
    return { calls: 0, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' };
  }
}

function applyNotWork({ target, candidates, tablePath, tableSha256, by, now }) {
  const common = ['--root-table', tablePath, '--root-table-sha256', tableSha256, '--session', target.session_id,
    '--segment', target.segment_id, '--by', by, '--now', now];
  if (candidates.length === 0) {
    try { runVoiceRouteCli(['set', ...common, '--status', 'unclassified']); return { calls: 1, error: null }; }
    catch (error) { return { calls: 0, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' }; }
  }
  let calls = 0;
  for (const code of candidates) {
    try { runVoiceRouteCli(['set', ...common, '--status', 'unclassified', '--drop-project', code]); calls += 1; }
    catch (error) { return { calls, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' }; }
  }
  return { calls, error: null };
}

const VALID_CHOICE = /^(other:[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+|not_work|none|split|confirm_content|[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+)$/u;

export async function runQuestionAnswer({ io, tools, receiptsDir, questionId, choice, by, dry, now }) {
  if (isMachineActor(by)) fail('voice_question_actor_required');
  if (!ACTOR.test(by ?? '')) fail('voice_question_actor_required');
  if (!VALID_CHOICE.test(choice ?? '')) fail('voice_question_choice_invalid');
  const ledger = readQuestionLedger(io);
  const question = ledger.questions.find(item => item.question_id === questionId);
  if (question === undefined) fail('voice_question_not_found');

  // Idempotent re-delivery: an already-answered question with the SAME
  // choice is reported OK without touching anything again -- a repeated
  // `confirm` would not be wrong (the writer itself no-ops on a re-confirm
  // of the same project), but re-running every target's writer call again
  // for no reason is not "no duplicate confirms" either, so this checks
  // status first and returns before calling anything.
  if (question.status === 'answered' && question.answered?.choice === choice) {
    const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'answer', ran_at: now,
      question_id: questionId, choice, by, dry, already_answered: true, per_target: [], status: 'OK' };
    if (!dry) writeReceipt(receiptsDir, now, receipt);
    return { receipt };
  }

  // CE-34: every target's run_id must still match the latest reconcile
  // receipt for its session -- a session re-transcribed since this question
  // was proposed means the segment this question named may no longer be the
  // same conversation at all.
  const staleTargets = question.targets.filter(target => currentRunIdFor(receiptsDir, target.session_id) !== target.run_id);
  if (staleTargets.length > 0) {
    if (!dry) {
      const withdrawn = ledger.questions.map(item => item.question_id === questionId
        ? { ...item, status: 'withdrawn', withdrawn_reason: 'question_targets_stale' } : item);
      writeQuestionLedger(io, { questions: withdrawn }, now);
    }
    const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'answer', ran_at: now,
      question_id: questionId, choice, by, dry, stale_targets: staleTargets.map(target => target.segment_id),
      per_target: [], status: 'FAILED', error: 'question_targets_stale' };
    if (!dry) writeReceipt(receiptsDir, now, receipt);
    return { receipt };
  }

  const tablePath = tools.root_table_path, tableSha256 = tools.root_table_sha256;
  const perTarget = [];
  if (question.kind === '귀속' && choice === 'not_work') {
    for (const target of question.targets) {
      const outcome = dry ? { calls: 0, error: null }
        : applyNotWork({ target, candidates: question.candidates ?? [], tablePath, tableSha256, by, now });
      perTarget.push({ segment_id: target.segment_id, ok: outcome.error === null, error: outcome.error });
    }
  } else {
    for (const target of question.targets) {
      const outcome = dry ? { calls: 0, error: null }
        : applyChoice({ kind: question.kind, choice, target, tablePath, tableSha256, by, now });
      perTarget.push({ segment_id: target.segment_id, ok: outcome.error === null, error: outcome.error });
    }
  }
  const allOk = perTarget.every(row => row.ok);
  if (!dry) {
    const updated = ledger.questions.map(item => {
      if (item.question_id !== questionId) return item;
      if (!allOk) return { ...item, status: 'presented', partial: { at: now, per_target: perTarget } };
      return { ...item, status: 'answered', partial: null, answered: { by, at: now, choice } };
    });
    writeQuestionLedger(io, { questions: updated }, now);
  }
  const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'answer', ran_at: now,
    question_id: questionId, choice, by, dry, per_target: perTarget, status: allOk ? 'OK' : 'FAILED' };
  if (!dry) writeReceipt(receiptsDir, now, receipt);
  return { receipt };
}

// ------------------------------------------------------------------- CLI
export async function runVoiceQuestionCli(argv, { now, log: onLine } = {}) {
  const command = argv[0];
  if (!['present', 'answer'].includes(command)) fail('voice_question_command_unknown');
  const flags = options(argv.slice(1));
  const tablePath = String(flags.get('root-table') ?? '');
  if (!tablePath) fail('voice_question_root_table_required');
  const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const expected = flags.get('root-table-sha256');
  const tableSha256 = typeof expected === 'string' ? expected : sha256(readFileSync(tablePath));
  const rootTable = readRootTable({ tablePath, expectedSha256: tableSha256 });
  const io = createAliasedStoreIo(rootTable);
  const toolsPath = String(flags.get('tools-config') ?? '');
  if (!toolsPath) fail('voice_question_tools_config_required');
  const tools = { ...readToolsConfig(readFileSync(toolsPath)), root_table_path: tablePath, root_table_sha256: tableSha256 };
  const receiptsDir = String(flags.get('receipts') ?? '');
  if (!receiptsDir) fail('voice_question_receipts_required');
  const dry = flags.get('dry') === true;
  const nowFlag = flags.get('now');
  const nowIso = now ?? (typeof nowFlag === 'string' ? nowFlag : new Date().toISOString());
  if (!Number.isFinite(Date.parse(nowIso))) fail('voice_question_now_invalid');
  const json = flags.get('json') === true;
  const log = line => { if (onLine) onLine(line); };

  if (command === 'present') {
    const dateFlag = flags.get('date');
    const targetDate = typeof dateFlag === 'string' ? dateFlag : null;
    if (targetDate !== null && !DATE_DIR.test(targetDate)) fail('voice_question_date_invalid');
    const capFlag = flags.get('cap');
    const cap = capFlag === undefined ? DEFAULT_CAP : Number.parseInt(String(capFlag), 10);
    if (!Number.isSafeInteger(cap) || cap < 0) fail('voice_question_cap_invalid');
    const { receipt, markdown } = await runQuestionPresent({ io, tools, receiptsDir, targetDate, cap, dry, now: nowIso });
    log(markdown.text);
    return { result: { status: receipt.status, receipt, markdown: markdown.text } };
  }

  const questionId = String(flags.get('question') ?? '');
  if (!questionId) fail('voice_question_id_required');
  const choice = String(flags.get('choice') ?? '');
  const by = flags.get('by') === undefined ? null : String(flags.get('by'));
  const { receipt } = await runQuestionAnswer({ io, tools, receiptsDir, questionId, choice, by, dry, now: nowIso });
  log(json ? JSON.stringify(receipt) : `${receipt.status} ${receipt.question_id}${receipt.error ? ` ${receipt.error}` : ''}`);
  return { result: { status: receipt.status, receipt } };
}

async function main() {
  const { result } = await runVoiceQuestionCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
  return result.status === 'OK' ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[voice-question] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
