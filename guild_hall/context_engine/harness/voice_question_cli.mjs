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
//        --choice <code|other:<code>|none|not_work|split|keep|confirm_content>
//        --by <actor> [--root-table-sha256 sha256:...] [--now <iso>] [--dry] [--json]
//
// `--receipts` is the reconcile harness's own `--receipts` directory (a
// plain filesystem path, never an `io`-aliased address -- reconcile's
// receipts never were one either); this file reads every
// `soulforge.voice_card_reconcile_receipt.v2` JSON it finds there for the
// exception pool and the latest-run-id staleness check, and writes its own
// receipts into the same directory under its own schema.
//
// `--choice` is validated against the *question's own kind* (S6), not a
// single global shape: 귀속 (attribution) accepts one of the question's own
// candidate codes, `other:<code>`, `none` or `not_work`; 내용확인 and 조건확인
// accept `confirm_content` or `none`; 분할 accepts `split` or `keep`.
// `other:<code>` additionally has to be a code this command has actually
// seen offered as a candidate somewhere in the receipts it read -- see
// `registeredProjectCodesFrom` below for exactly what that checks and why.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { selectQuestions, todayInTz } from '../src/runtime/voice_morning_questions.mjs';
import { isMachineWrittenBasis, readLedgerFile, runVoiceRouteCli } from './voice_route_cli.mjs';
import { VOICE_ROUTES_ADDRESS } from './voice_routes.mjs';

export const QUESTION_LEDGER_SCHEMA = 'soulforge.voice_question_ledger.v0';
export const QUESTION_LEDGER_ADDRESS = 'control_root/voice-questions';
export const QUESTION_LEDGER_FILE = 'questions.v0.json';
export const QUESTION_CLI_RECEIPT_SCHEMA = 'soulforge.voice_question_cli_receipt.v1';
export const QUESTION_ARCHIVE_SCHEMA = 'soulforge.voice_question_ledger_archive.v0';
const RECONCILE_RECEIPT_SCHEMA = 'soulforge.voice_card_reconcile_receipt.v2';
const RECONCILE_ACTOR = 'actor:context-engine:voice-card-reconcile-v0';
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const MAX_QUESTIONS = 20000;
const DEFAULT_CAP = 10;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
// R3: a lock older than this is presumed abandoned (a crashed process, a
// killed job) rather than genuinely still working -- the exact age
// `estate_voice_card_reconcile.mjs`'s own `acquireLock` (harness/
// estate_voice_card_reconcile.mjs:141-160) uses, mirrored here rather than
// shared because the two lanes must never share one lock file (that file's
// own comment explains why: blocking on each other is not either lane's
// job).
export const QUESTION_LEDGER_STALE_LOCK_MS = 3 * 60 * 60 * 1000;
// S7: an answered/withdrawn row this old is safe to move out of the live
// ledger into an append-only same-day archive file, so a ledger running for
// a long time never grows past MAX_LEDGER_BYTES/MAX_QUESTIONS on settled
// history alone. Never-settled (proposed/presented) rows are never archived
// regardless of age.
const STALE_ARCHIVE_MS = 90 * 24 * 60 * 60 * 1000;
const CODE_SHAPE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;

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

function settledAt(question) {
  if (question.status === 'answered' && typeof question.answered?.at === 'string') return question.answered.at;
  if (question.status === 'withdrawn' && typeof question.withdrawn_at === 'string') return question.withdrawn_at;
  return null;
}

/**
 * S7: moves answered/withdrawn rows older than `STALE_ARCHIVE_MS` out of
 * `questions` into an append-only same-day archive file
 * (`questions.archive.<date>.json`, same directory), and returns the
 * shrunk live list. A same-day archive file this pass cannot read (bad JSON,
 * wrong schema) is never overwritten -- today's newly-archived rows go to a
 * disambiguated sibling name instead, so a corrupt archive never loses
 * whatever it already held.
 */
function archiveOldQuestions(dir, questions, now) {
  const cutoff = Date.parse(now) - STALE_ARCHIVE_MS;
  const keep = [], archivable = [];
  for (const question of questions) {
    const at = settledAt(question);
    if (at !== null && Number.isFinite(Date.parse(at)) && Date.parse(at) < cutoff) archivable.push(question);
    else keep.push(question);
  }
  if (archivable.length === 0) return questions;
  const dateStamp = now.slice(0, 10);
  let archiveFile = path.join(dir, `questions.archive.${dateStamp}.json`);
  let existing = { schema_version: QUESTION_ARCHIVE_SCHEMA, questions: [] };
  if (existsSync(archiveFile)) {
    let readOk = false;
    try {
      const body = JSON.parse(readFileSync(archiveFile));
      if (body?.schema_version === QUESTION_ARCHIVE_SCHEMA && Array.isArray(body.questions)) { existing = body; readOk = true; }
    } catch { /* fall through: readOk stays false, a disambiguated sibling is used below */ }
    if (!readOk) {
      let counter = 2;
      while (existsSync(archiveFile)) { archiveFile = path.join(dir, `questions.archive.${dateStamp}-${counter}.json`); counter += 1; }
    }
  }
  const byId = new Map(existing.questions.map(question => [question.question_id, question]));
  for (const question of archivable) byId.set(question.question_id, question);
  const merged = { schema_version: QUESTION_ARCHIVE_SCHEMA, updated_at: now, questions: [...byId.values()] };
  const staging = `${archiveFile}.writing`;
  writeFileSync(staging, encode(merged));
  renameSync(staging, archiveFile);
  return keep;
}

/**
 * Serialised (a `.lock` file alongside), atomic rename. A lock older than
 * `QUESTION_LEDGER_STALE_LOCK_MS` is reclaimed rather than blocking forever
 * (R3, mirroring `estate_voice_card_reconcile.mjs`'s own `acquireLock`).
 * S7: before writing, archives old settled rows if the ledger would
 * otherwise exceed `MAX_LEDGER_BYTES`/`MAX_QUESTIONS` -- the live file is
 * never left over bound, and never written as something a later
 * `readQuestionLedger` call would refuse as unreadable/too-large.
 * Returns `null` when no lock was ever held stale, or `{ reclaimed_stale:
 * true, previous_lock, previous_lock_age_ms }` when one was -- callers fold
 * this into their own receipt (mirroring reconcile's own `lock` field).
 */
function writeQuestionLedger(io, ledger, now) {
  const dir = ledgerDir(io);
  mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, 'questions.lock');
  let reclaimed = null;
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= QUESTION_LEDGER_STALE_LOCK_MS) fail('voice_question_ledger_locked');
    try { rmSync(lockFile, { force: true }); } catch (error) { fail(error?.code ?? 'voice_question_ledger_locked'); }
    reclaimed = { reclaimed_stale: true, previous_lock: existing, previous_lock_age_ms: ageMs };
  }
  try {
    writeFileSync(lockFile,
      encode({ pid: process.pid, started_at: now, ...(reclaimed ? { reclaimed_from: reclaimed.previous_lock } : {}) }),
      { flag: 'wx' });
  } catch (error) { if (error?.code === 'EEXIST') fail('voice_question_ledger_locked'); throw error; }
  try {
    let questions = ledger.questions;
    let body = { schema_version: QUESTION_LEDGER_SCHEMA, updated_at: now, questions };
    if (questions.length > MAX_QUESTIONS || encode(body).length > MAX_LEDGER_BYTES) {
      questions = archiveOldQuestions(dir, questions, now);
      body = { schema_version: QUESTION_LEDGER_SCHEMA, updated_at: now, questions };
    }
    const file = ledgerFilePath(dir);
    const staging = `${file}.writing`;
    writeFileSync(staging, encode(body));
    renameSync(staging, file);
  } finally { rmSync(lockFile, { force: true }); }
  return reclaimed;
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

/**
 * S9: one pass over every reconcile receipt in `receiptsDir`, building the
 * latest (chronologically last) `run_id` *and that same receipt's own
 * `ran_at`* per `session_id` it mentions. Built once per command rather than
 * re-walking the directory once per target (the old `currentRunIdFor` did
 * exactly that) -- the directory read and every receipt's JSON.parse cost
 * the same regardless of how many targets ask.
 */
function buildCurrentRunIndex(receiptsDir) {
  const index = new Map();
  for (const name of receiptFileNames(receiptsDir)) {
    const body = readReconcileReceipt(receiptsDir, name);
    if (body === null || !Array.isArray(body.sessions)) continue;
    const ranAt = typeof body.ran_at === 'string' ? body.ran_at : null;
    for (const row of body.sessions) {
      if (typeof row?.session_id !== 'string' || typeof row.run_id !== 'string') continue;
      index.set(row.session_id, { run_id: row.run_id, receipt_ran_at: ranAt });
    }
  }
  return index;
}

/**
 * S6: the only project-code data a reconcile receipt (schema v2) actually
 * carries per exception row is that row's own `candidates` -- there is no
 * separate registry export in that schema (`totals.registered_project_
 * codes_count` there is a count only, not a list). This module has no other
 * source of "every project code that exists" to check an `other:<code>`
 * answer against, so it uses the union of every candidate code seen across
 * the whole exception pool this command read as a stand-in registry: an
 * `other:<code>` naming something no reconcile pass has ever suggested for
 * anyone is refused, while an empty union (no candidates anywhere yet) never
 * blocks -- matching "when count > 0" literally.
 */
function registeredProjectCodesFrom(pool) {
  const codes = new Set();
  for (const row of pool) {
    if (!Array.isArray(row?.candidates)) continue;
    for (const code of row.candidates) if (typeof code === 'string') codes.add(code);
  }
  return codes;
}

// -------------------------------------------------------------- present
/**
 * S8: a title is free text a person or the attribution policy wrote about a
 * recording -- never trusted as safe to drop straight into a markdown line.
 * Newlines/carriage returns are collapsed to spaces (so a title can never
 * forge a second line, a fake list item or a fake `[q:...]` pointer line),
 * `|` is replaced (the character this codebase's own segment-line format
 * elsewhere uses as a field separator), a leading "N. "/"N) " is stripped
 * (so a title cannot masquerade as this list's own numbering), and the
 * result is capped at 80 characters on one line.
 */
function sanitizeTitleForLine(title) {
  if (typeof title !== 'string') return '(제목 없음)';
  let value = title.replace(/[\r\n]+/gu, ' ').replace(/\|/gu, '/').replace(/^\s*\d+[.)]\s*/u, '').trim();
  if (value === '') return '(제목 없음)';
  if (value.length > 80) value = `${value.slice(0, 79)}…`;
  return value;
}

function markdownFor({ presented, carriedOverCount, urgentOverflowCount }) {
  if (presented.length === 0) {
    return { text: '없음', lines: ['없음'] };
  }
  const lines = [`어제 애매한 것 ${presented.length}건 (이월 ${carriedOverCount}, 긴급 초과 ${urgentOverflowCount})`];
  presented.forEach((question, index) => {
    const time = typeof question.representative.time === 'string' ? question.representative.time.slice(11, 16) : '--:--';
    const title = sanitizeTitleForLine(question.representative.title);
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

  let lock = null;
  if (!dry) {
    // Merge: every presented/carried/urgent_overflow question replaces its
    // same-id row in the ledger (or is added fresh); every other existing
    // row (already `answered`/`withdrawn`, or simply not touched by today's
    // pool at all) is left exactly as it was -- this pass proposes and
    // presents, it never answers or withdraws anything on its own.
    // S4: `partial` (a prior answer attempt's partial-failure record) is
    // carried forward from the existing ledger row, never reset to `null`
    // here -- only `runQuestionAnswer` ever clears or replaces it.
    const existingById = new Map(ledger.questions.map(question => [question.question_id, question]));
    const today = todayInTz(now, 'Asia/Seoul');
    const touched = new Map();
    for (const question of [...result.presented, ...result.carried_over, ...result.urgent_overflow]) {
      const existingRow = existingById.get(question.question_id);
      touched.set(question.question_id, { question_id: question.question_id, kind: question.kind,
        targets: question.targets, options: question.options, candidates: question.candidates ?? [],
        representative: question.representative,
        status: question.presented_on !== undefined && question.presented_on.includes(today) ? 'presented' : 'proposed',
        first_seen: question.first_seen, presented_on: question.presented_on ?? question.previously_presented_on ?? [],
        answered: null, reopened_from: question.reopened_from, withdrawn_reason: null,
        partial: existingRow?.partial ?? null });
    }
    const merged = [...ledger.questions.filter(question => !touched.has(question.question_id)), ...touched.values()];
    lock = writeQuestionLedger(io, { questions: merged }, now);
  }

  const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'present', ran_at: now, target_date: targetDate,
    cap, dry, lock, metrics: result.metrics, presented: result.presented.map(question => question.question_id),
    carried_over: result.carried_over.map(question => question.question_id),
    urgent_overflow: result.urgent_overflow.map(question => question.question_id),
    resolved_by_reuse: result.resolved_by_reuse.map(question => question.question_id), status: 'OK' };
  if (!dry) writeReceipt(receiptsDir, now, receipt);
  return { receipt, markdown };
}

/** A receipt file name with full (ms) precision, disambiguated by a counter
 * (nit): two commands whose `now` shares the same second -- or, in a test,
 * the exact same instant -- must never overwrite each other's receipt. */
function writeReceipt(receiptsDir, now, receipt) {
  mkdirSync(receiptsDir, { recursive: true });
  const base = now.replace(/[^0-9]/gu, '');
  let file = path.join(receiptsDir, `q${base}.json`);
  let counter = 2;
  while (existsSync(file)) { file = path.join(receiptsDir, `q${base}-${counter}.json`); counter += 1; }
  writeFileSync(file, encode(receipt));
}

// --------------------------------------------------------------- answer
// A basis prefix `set --project` writes for a machine-basis candidate
// (`voice_route_cli.mjs`'s own `MACHINE_BASIS_PREFIXES`, imported directly
// here -- this file already imports `voice_route_cli.mjs`, so this is not
// the circular direction `estate_voice_card_reconcile.mjs`'s own duplicated
// copy avoids) -- naming it here documents exactly which `--by` values
// `answer` refuses, not a claim this check proves an actor's real identity.
const MACHINE_BY = /^actor:(context-engine|bot|machine):/u;

function isMachineActor(by) {
  return by === RECONCILE_ACTOR || MACHINE_BY.test(by ?? '');
}

/** The voice route ledger's own current row for one segment, read fresh --
 * never the question's own snapshot, which can be stale by the time a
 * person answers (S10, and R1's own title/nature/quality check). `null`
 * when the session has no ledger file yet or the segment is not in it. */
function currentSegmentRow(io, sessionId, segmentId) {
  const dir = io.path(VOICE_ROUTES_ADDRESS, true);
  const { ledger } = readLedgerFile(dir, sessionId);
  return ledger.segments.find(segment => segment.segment_id === segmentId) ?? null;
}

function neutralTitlePlaceholder(representativeTitle) {
  const cleaned = typeof representativeTitle === 'string' ? representativeTitle.replace(/[\r\n]+/gu, ' ').trim() : '';
  return cleaned === '' ? '카드 제목 미정' : cleaned;
}

/**
 * Applies one `귀속` (attribution) answer to one segment, through
 * `voice_route_cli.mjs`'s existing `confirm` writer only. `other:<code>`
 * and a direct candidate code both call `confirm --project <code>`; `none`
 * and `not_work` never reach here (`not_work` is routed to `applyNotWork`
 * below instead, since only that caller knows the question's own candidate
 * codes; `none` records the answer in the question ledger only).
 *
 * R1: `confirm` (`applySegmentDecision` in `voice_route_cli.mjs`) refuses
 * only three things -- a null title, an `undetermined` nature, an `unknown`
 * transcript quality -- and everything else on the row is left as it was
 * (a flag that is not passed keeps the row's own current value). This used
 * to pass `--title '사람 확인' --nature project_work --quality
 * independent_fast` unconditionally, which silently overwrote a real title/
 * nature/quality the row already had. Now each is passed only when the
 * current row would otherwise block the confirm:
 *   - a missing title becomes the question's own representative title (the
 *     same text this question was shown under), never a fabricated one;
 *   - a missing nature becomes `project_work` -- this question kind (귀속)
 *     only ever asks about a project-attribution decision, so that is the
 *     one nature a confirm through here can honestly default to;
 *   - a missing (`unknown`) quality becomes `independent_fast` -- a person
 *     judged it, quickly, from their own reading of the question, which is
 *     what that tier names; confirm always refuses `unknown`, so this is
 *     the one field that is never really optional here, documented rather
 *     than silently chosen.
 */
function applyChoice({ io, kind, choice, target, representativeTitle, tablePath, tableSha256, by, now }) {
  if (kind !== '귀속' || choice === 'none') return { calls: 0, error: null };
  const common = ['--root-table', tablePath, '--root-table-sha256', tableSha256, '--session', target.session_id,
    '--segment', target.segment_id, '--by', by, '--now', now];
  const row = currentSegmentRow(io, target.session_id, target.segment_id);
  const extra = [];
  if (row === null || row.title === null) extra.push('--title', neutralTitlePlaceholder(representativeTitle));
  if (row === null || row.nature === 'undetermined') extra.push('--nature', 'project_work');
  if (row === null || row.quality?.transcript === 'unknown') extra.push('--quality', 'independent_fast');
  try {
    const code = choice.startsWith('other:') ? choice.slice('other:'.length) : choice;
    runVoiceRouteCli(['confirm', ...common, '--project', code, '--basis', `voice_question_cli:${kind} 사람 답변`, ...extra]);
    return { calls: 1, error: null };
  } catch (error) {
    return { calls: 0, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' };
  }
}

/**
 * S10: `not_work` never touches a segment that is already `confirmed` -- a
 * person's confirmation is their word on record, and a fast default-path
 * "업무 아님" answer is not the way to take it back; `withdraw`
 * (`voice_route_cli.mjs`'s own command) is. It drops only machine-written
 * candidates (a basis starting with `reconcile:`/`voice_conversation_
 * list:`), never a candidate a person named by hand through `set` -- that
 * was a considered act this answer must not erase. And it reads the
 * *current* ledger row's candidates, never the question's own snapshot,
 * since the row may have changed since this question was first proposed.
 */
function applyNotWork({ io, target, tablePath, tableSha256, by, now }) {
  const common = ['--root-table', tablePath, '--root-table-sha256', tableSha256, '--session', target.session_id,
    '--segment', target.segment_id, '--by', by, '--now', now];
  const row = currentSegmentRow(io, target.session_id, target.segment_id);
  if (row !== null && row.status === 'confirmed') {
    return { calls: 0, error: 'voice_question_target_confirmed', hint: 'use withdraw first' };
  }
  const machineCandidates = (row?.project_candidates ?? [])
    .filter(candidate => isMachineWrittenBasis(candidate.basis))
    .map(candidate => candidate.project_code);
  if (machineCandidates.length === 0) {
    try { runVoiceRouteCli(['set', ...common, '--status', 'unclassified']); return { calls: 1, error: null }; }
    catch (error) { return { calls: 0, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' }; }
  }
  let calls = 0;
  for (const code of machineCandidates) {
    try { runVoiceRouteCli(['set', ...common, '--status', 'unclassified', '--drop-project', code]); calls += 1; }
    catch (error) { return { calls, error: typeof error?.code === 'string' ? error.code : 'voice_question_cli_write_failed' }; }
  }
  return { calls, error: null };
}

/** Dry-run predictions (nit): `--dry answer` never claims `ok:true` for a
 * write it never made -- it reports `would_apply` (whether a real run would
 * even attempt a route write for this target) alongside `error` (a
 * refusal this command can already tell, read-only, that a real run would
 * hit -- e.g. S10's `voice_question_target_confirmed`). */
function predictChoiceOutcome({ kind, choice }) {
  if (kind !== '귀속' || choice === 'none') return { would_apply: false, error: null };
  return { would_apply: true, error: null };
}
function predictNotWorkOutcome({ io, target }) {
  const row = currentSegmentRow(io, target.session_id, target.segment_id);
  if (row !== null && row.status === 'confirmed') {
    return { would_apply: false, error: 'voice_question_target_confirmed', hint: 'use withdraw first' };
  }
  return { would_apply: true, error: null };
}

/**
 * S6: validates `choice` against the *question's own* kind and options,
 * before any write. 귀속 accepts one of the question's own offered codes,
 * `other:<code>` (checked against `registeredProjectCodesFrom`'s stand-in
 * registry), `none` or `not_work`; 내용확인/조건확인 accept `confirm_content`
 * or `none`; 분할 accepts `split` or `keep`. Anything else -- including a
 * shape that would have matched under the old kind-blind regex, such as
 * `split` for a 귀속 question -- is `voice_question_choice_invalid`.
 * Returns an error code, or `null` when `choice` is valid for this question.
 */
function validateChoice({ kind, choice, options: offered, receiptsDir }) {
  if (typeof choice !== 'string' || choice === '') return 'voice_question_choice_invalid';
  if (kind === '귀속') {
    if (choice === 'none' || choice === 'not_work') return null;
    if (choice.startsWith('other:')) {
      const code = choice.slice('other:'.length);
      if (!CODE_SHAPE.test(code)) return 'voice_question_choice_invalid';
      const registered = registeredProjectCodesFrom(readExceptionPool(receiptsDir));
      if (registered.size > 0 && !registered.has(code)) return 'voice_question_project_unregistered';
      return null;
    }
    return offered.includes(choice) ? null : 'voice_question_choice_invalid';
  }
  if (kind === '내용확인' || kind === '조건확인') {
    return choice === 'confirm_content' || choice === 'none' ? null : 'voice_question_choice_invalid';
  }
  if (kind === '분할') {
    return choice === 'split' || choice === 'keep' ? null : 'voice_question_choice_invalid';
  }
  return 'voice_question_choice_invalid';
}

export async function runQuestionAnswer({ io, tools, receiptsDir, questionId, choice, by, dry, now }) {
  if (isMachineActor(by)) fail('voice_question_actor_required');
  if (!ACTOR.test(by ?? '')) fail('voice_question_actor_required');
  const ledger = readQuestionLedger(io);
  const question = ledger.questions.find(item => item.question_id === questionId);
  if (question === undefined) fail('voice_question_not_found');

  const choiceError = validateChoice({ kind: question.kind, choice, options: question.options ?? [], receiptsDir });
  if (choiceError !== null) fail(choiceError);

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

  // CE-34/S9: a target is stale only when the latest reconcile receipt that
  // knows its session names a *different* run_id *and* that receipt is
  // itself newer than the receipt this question's own target was read from
  // -- the same run_id with a newer receipt changed nothing about the
  // segment, so it is not stale; no receipt at all mentioning the session
  // keeps the prior conservative default (treated as stale, since there is
  // no evidence the session still exists the way this question named it).
  const currentRunIndex = buildCurrentRunIndex(receiptsDir);
  const staleTargets = question.targets.filter(target => {
    const current = currentRunIndex.get(target.session_id) ?? { run_id: null, receipt_ran_at: null };
    if (current.run_id === target.run_id) return false;
    if (current.run_id === null) return true;
    if (typeof current.receipt_ran_at !== 'string' || typeof target.receipt_ran_at !== 'string') return true;
    return current.receipt_ran_at > target.receipt_ran_at;
  });
  if (staleTargets.length > 0) {
    if (!dry) {
      const withdrawn = ledger.questions.map(item => item.question_id === questionId
        ? { ...item, status: 'withdrawn', withdrawn_reason: 'question_targets_stale', withdrawn_at: now } : item);
      writeQuestionLedger(io, { questions: withdrawn }, now);
    }
    const receipt = { schema_version: QUESTION_CLI_RECEIPT_SCHEMA, command: 'answer', ran_at: now,
      question_id: questionId, choice, by, dry, stale_targets: staleTargets.map(target => target.segment_id),
      per_target: [], status: 'FAILED', error: 'question_targets_stale' };
    if (!dry) writeReceipt(receiptsDir, now, receipt);
    return { receipt };
  }

  const tablePath = tools.root_table_path, tableSha256 = tools.root_table_sha256;
  const isNotWork = question.kind === '귀속' && choice === 'not_work';
  // S5: a prior partial-failure retry -- for the *same* choice as this
  // attempt only (a different choice this time is a fresh attempt, not a
  // retry) -- skips targets that already succeeded rather than re-running
  // every writer call again; only the targets that failed last time (or
  // were never attempted) are retried.
  const previousPartial = question.partial?.choice === choice ? question.partial : null;
  const okSegments = new Set((previousPartial?.per_target ?? [])
    .filter(row => row.ok === true).map(row => row.segment_id));

  const perTarget = [];
  for (const target of question.targets) {
    if (okSegments.has(target.segment_id)) {
      perTarget.push({ segment_id: target.segment_id, ...(dry ? { would_apply: false } : { ok: true }),
        error: null, skipped: true });
      continue;
    }
    if (dry) {
      const predicted = isNotWork ? predictNotWorkOutcome({ io, target }) : predictChoiceOutcome({ kind: question.kind, choice });
      perTarget.push({ segment_id: target.segment_id, would_apply: predicted.would_apply, error: predicted.error,
        ...(predicted.hint ? { hint: predicted.hint } : {}) });
      continue;
    }
    const outcome = isNotWork
      ? applyNotWork({ io, target, tablePath, tableSha256, by, now })
      : applyChoice({ io, kind: question.kind, choice, target, representativeTitle: question.representative?.title,
          tablePath, tableSha256, by, now });
    perTarget.push({ segment_id: target.segment_id, ok: outcome.error === null, error: outcome.error,
      ...(outcome.hint ? { hint: outcome.hint } : {}) });
  }
  const allOk = perTarget.every(row => row.error === null);
  if (!dry) {
    const updated = ledger.questions.map(item => {
      if (item.question_id !== questionId) return item;
      if (!allOk) return { ...item, status: 'presented', partial: { at: now, choice, per_target: perTarget } };
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
    // nit: 0 and negative are both refused -- "present nothing today" is
    // not what `--cap 0` means, it means the caller passed a cap that
    // cannot select anything, which is a usage error, not an empty day.
    if (!Number.isSafeInteger(cap) || cap < 1) fail('voice_question_cap_invalid');
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
