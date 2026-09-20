// Dev harness and lane entry point: run the conversation-list pipeline
// (`voice_conversation_list_cli.mjs`'s `runConversationList`) over one night's
// worth of PLAUD sessions, one session at a time, against the one local model
// this host runs.
//
// The plan for one night is: every session whose day folder is the target date
// (default: yesterday in Asia/Seoul), plus any session from the trailing
// `BACKLOG_WINDOW_DAYS` days that this lane has not yet finished, oldest day
// first. A session is skipped rather than run when its transcript never
// finished (`transcript_absent`), when it is shorter than
// `MIN_TRANSCRIPT_SECONDS` (`duration_below_30s`), or when it already has a
// verified run (`skipped_existing`, read the same way `voice_conversation_list_
// cli.mjs show` reads one). A session whose manifest cannot be read at all is
// reported `failed` (`session_manifest_unreadable`) rather than silently
// disappearing from the plan. Everything else runs through the same
// per-session pipeline the CLI's `run` command calls, sequentially -- there is
// one local model behind this, and a pass over two sessions at once would just
// make both wait for the same server. `--max-sessions` bounds how many
// sessions actually reach the model, not how many candidates this pass looks
// at: a night that is mostly skips still gets to do its real work.
//
// One receipt JSON lands in `--receipts` per night, naming every session this
// pass looked at and what became of it. A lock file in the same directory keeps
// two nightly runs from overlapping; a lock older than three hours is treated as
// abandoned and reclaimed, with a note of that in the receipt. `--dry` reports
// the same plan and classification without calling the model or writing
// anything -- not even the lock -- which is what a scheduled task's preflight
// runs before it registers.
//
// This harness writes only inside `--receipts` and the pipeline's own
// `derived_root`; it never touches the transcript, the semantic label run, or
// any project store.
//
// usage:
//   node voice_conversation_list_nightly.mjs --root-table <file> --tools-config <file>
//        --pipeline-config <file> --receipts <dir> [--date YYYY-MM-DD]
//        [--root-table-sha256 sha256:...] [--max-sessions N] [--dry]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { ConversationListError, readPipelineConfig } from '../src/runtime/voice_conversation_list.mjs';
import { VOICE_SESSIONS_ADDRESS } from './voice_segment_drafts.mjs';
import { readPrompts, readRun, runConversationList } from './voice_conversation_list_cli.mjs';

export const NIGHTLY_RECEIPT_SCHEMA = 'soulforge.voice_conversation_list_nightly_receipt.v1';
// How long a lock may sit before this lane treats it as abandoned rather than
// held by a run that is still going. Three hours is well past what one night's
// worth of sessions should ever take through one local model.
export const STALE_LOCK_MS = 3 * 60 * 60 * 1000;
// A conversation this short is not something the pipeline's boundary and nature
// steps have anything to work with; running it would spend calls to say so.
export const MIN_TRANSCRIPT_SECONDS = 30;
// How many days back this lane looks for a session it has not finished yet,
// beyond the target date itself.
export const BACKLOG_WINDOW_DAYS = 7;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;
// No `.json` extension: a receipt consumer that globs `*.json` in this
// directory must never trip over the lock file.
const LOCK_FILE_NAME = 'nightly.lock';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = code => { throw new ConversationListError(code); };

// ------------------------------------------------------------------ dates
/** "Today" as a calendar date in Asia/Seoul (fixed +09:00, no DST) for one instant. */
export function seoulDateFor(nowIso) {
  const at = Date.parse(nowIso);
  if (!Number.isFinite(at)) fail('voice_conversation_list_nightly_now_invalid');
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** One `YYYY-MM-DD` shifted by whole calendar days, in no particular time zone. */
export function shiftDate(dateStr, deltaDays) {
  if (!DATE_DIR.test(dateStr ?? '')) fail('voice_conversation_list_nightly_date_invalid');
  const [year, month, day] = dateStr.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() + deltaDays);
  return at.toISOString().slice(0, 10);
}

/** The default target date: yesterday, read in Asia/Seoul. */
export function defaultTargetDate(nowIso) {
  return shiftDate(seoulDateFor(nowIso), -1);
}

// ------------------------------------------------------------------ plan
/** Wraps a cause that is not the benign "this directory does not exist yet". */
function sessionsRootError(cause) {
  const error = new ConversationListError('voice_conversation_list_nightly_sessions_root_unreadable');
  error.cause_code = typeof cause?.code === 'string' ? cause.code : null;
  return error;
}

/**
 * Directory names directly below one address. A directory that simply does
 * not exist yet (`ENOENT`) lists as empty -- that is the ordinary shape of "no
 * sessions here yet". Anything else (the sessions root renamed to a file, a
 * permission refusal, a moved subtree) is not silently read as "empty"; it is
 * thrown, so a plan that could not actually be built never gets reported as a
 * plan with nothing in it.
 */
function listDirNames(io, address) {
  let where;
  try { where = io.path(address, true); }
  catch (error) { throw sessionsRootError(error); }
  let entries;
  try { entries = readdirSync(where, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw sessionsRootError(error);
  }
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

/**
 * The sessions one night looks at, in the order it looks at them: the target
 * date's own sessions first, then every session from the trailing backlog
 * window this lane has not already seen, oldest day first. Membership only --
 * whether a session actually needs a run is `classifySession`'s question, asked
 * once per candidate rather than while building this list, so a directory this
 * lane cannot read yet still shows up as a plan entry with its own reason.
 *
 * Throws `voice_conversation_list_nightly_sessions_root_unreadable` when a
 * directory this lane needed to list could not be listed for any reason other
 * than it simply not existing yet; the caller decides what a broken plan means
 * for the night's status.
 */
export function buildSessionPlan({ io, sessionsAddress = VOICE_SESSIONS_ADDRESS, targetDate,
  backlogWindowDays = BACKLOG_WINDOW_DAYS } = {}) {
  if (!DATE_DIR.test(targetDate ?? '')) fail('voice_conversation_list_nightly_date_invalid');
  const primary = listDirNames(io, `${sessionsAddress}/${targetDate}`)
    .map(sessionId => ({ date: targetDate, session_id: sessionId }));
  const seen = new Set(primary.map(item => item.session_id));
  const windowStart = shiftDate(targetDate, -backlogWindowDays);
  const backlogDates = listDirNames(io, sessionsAddress)
    .filter(name => DATE_DIR.test(name) && name >= windowStart && name < targetDate).sort();
  const backlog = [];
  for (const date of backlogDates) {
    for (const sessionId of listDirNames(io, `${sessionsAddress}/${date}`)) {
      if (seen.has(sessionId)) continue;
      seen.add(sessionId);
      backlog.push({ date, session_id: sessionId });
    }
  }
  return [...primary, ...backlog];
}

// ------------------------------------------------------------ classification
/**
 * What this pass will do with one candidate session, decided before any model
 * is called. Every candidate this lane found becomes a row -- a manifest that
 * cannot be read or that names a different session is `failed`
 * (`session_manifest_unreadable`) rather than a session that quietly vanishes
 * from the plan.
 */
export function classifySession({ io, tools, sessionsAddress = VOICE_SESSIONS_ADDRESS, date, sessionId }) {
  const address = `${sessionsAddress}/${date}/${sessionId}`;
  const unreadable = () => ({ session_id: sessionId, date, title: sessionId, duration_seconds: null,
    existing_run_id: null, classification: 'failed', reason: 'session_manifest_unreadable' });
  let manifest;
  try { manifest = JSON.parse(io.read(`${address}/session_manifest.json`, MAX_MANIFEST_BYTES)); }
  catch { return unreadable(); }
  if (manifest?.session_id !== sessionId) return unreadable();
  const title = typeof manifest.source_page_title === 'string' && manifest.source_page_title.trim()
    ? manifest.source_page_title : sessionId;
  const durationSeconds = Number.isFinite(manifest.duration_seconds) ? manifest.duration_seconds : null;
  const base = { session_id: sessionId, date, title, duration_seconds: durationSeconds, existing_run_id: null };

  if (manifest.independent_transcription?.status !== 'completed') {
    return { ...base, classification: 'skipped_short', reason: 'transcript_absent' };
  }
  if (durationSeconds === null || durationSeconds < MIN_TRANSCRIPT_SECONDS) {
    return { ...base, classification: 'skipped_short', reason: 'duration_below_30s' };
  }

  // Read the same way the CLI's `show` command reads one: newest run by
  // `generated_at`. No runs at all is not a failure here, it is this session's
  // first night.
  let existing = null;
  try { existing = readRun({ derivedRoot: tools.derived_root, sessionId }); }
  catch (error) {
    if (error?.code !== 'voice_conversation_run_absent') {
      return { ...base, classification: 'failed', reason: typeof error?.code === 'string' ? error.code : 'existing_run_check_failed' };
    }
  }
  if (existing !== null && existing.list?.verified === true) {
    return { ...base, classification: 'skipped_existing', reason: null, existing_run_id: existing.run_id };
  }
  return { ...base, classification: 'run', reason: null, existing_run_id: existing?.run_id ?? null };
}

/**
 * Classifies plan items in order, stopping once `maxSessions` of them have
 * been classified `run` (`null` means no cap). Skip, existing and failed
 * classifications never count against the cap and never stop this pass from
 * reaching the sessions that do need a run -- the cap bounds how much work
 * reaches the model, not how much of the plan this pass is allowed to look at.
 */
function classifyPlan({ io, tools, sessionsAddress, plan, maxSessions }) {
  const rows = [];
  let runCount = 0;
  for (const item of plan) {
    if (maxSessions !== null && runCount >= maxSessions) break;
    const described = classifySession({ io, tools, sessionsAddress, date: item.date, sessionId: item.session_id });
    rows.push({ item, described });
    if (described.classification === 'run') runCount += 1;
  }
  return rows;
}

// ------------------------------------------------------------------- lock
function wrapLockError(cause) {
  const error = new ConversationListError('voice_conversation_list_nightly_lock_unavailable');
  error.cause_code = typeof cause?.code === 'string' ? cause.code : null;
  return error;
}

/**
 * One receipts directory holds one lock. A fresh lock refuses this run; a
 * stale one (older than `STALE_LOCK_MS`, or unreadable) is reclaimed
 * atomically -- the stale file is removed and a fresh one created with `wx`,
 * so two passes racing on the same stale lock cannot both believe they
 * reclaimed it -- and the previous holder is carried into the receipt rather
 * than silently overwritten. A `wx` failure other than "someone just created
 * it" (`EEXIST`) is a real error, thrown rather than reported as merely held.
 */
export function acquireLock(receiptsDir, now) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= STALE_LOCK_MS) return { held: true, existing, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { throw wrapLockError(error); }
    try {
      writeFileSync(lockFile, encode({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') return { held: true, existing, age_ms: ageMs };
      throw wrapLockError(error);
    }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { held: true, existing: null, age_ms: 0 };
    throw wrapLockError(error);
  }
  return { held: false, reclaimed: false, previous: null, age_ms: null };
}

export function releaseLock(receiptsDir) {
  try { rmSync(path.join(receiptsDir, LOCK_FILE_NAME), { force: true }); } catch { /* nothing to release */ }
}

// ------------------------------------------------------------- per-session
/** The real per-session run: the same call the CLI's `run` command makes. */
async function defaultRunSession({ io, tools, config, prompts, promptDigests, configSha256, sessionId }) {
  const result = await runConversationList({ io, tools, config, prompts, promptDigests, configSha256, sessionId });
  return { run_id: result.run_id, verified: result.list.verified === true,
    llm_calls: result.manifest.calls.total, elapsed_ms: result.manifest.elapsed_ms };
}

// -------------------------------------------------------------------- run
const totalsFor = (rows, classificationKey, transcriptAbsentClassification) => ({
  skipped_existing: rows.filter(row => row[classificationKey] === 'skipped_existing').length,
  skipped_short: rows.filter(row => row[classificationKey] === 'skipped_short').length,
  transcript_absent: rows.filter(row => row[classificationKey] === transcriptAbsentClassification
    && row.reason === 'transcript_absent').length,
  failed: rows.filter(row => row[classificationKey] === 'failed').length });

/**
 * One night. `runSession` is the only place this ever calls a model; tests
 * replace it with a scripted function and never touch `createLocalChat`.
 */
export async function runNightly({ io, tools, config, prompts, promptDigests, configSha256,
  sessionsAddress = VOICE_SESSIONS_ADDRESS, receiptsDir, targetDate, maxSessions = null, dry = false,
  now = new Date().toISOString(), runSession = defaultRunSession, log = () => {} } = {}) {
  if (dry) {
    let plan = [], planError = null;
    try { plan = buildSessionPlan({ io, sessionsAddress, targetDate }); }
    catch (error) {
      planError = typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_plan_failed';
      plan = [];
    }
    const rows = [];
    if (planError === null) {
      for (const { item, described } of classifyPlan({ io, tools, sessionsAddress, plan, maxSessions })) {
        rows.push(described);
        const label = described.classification === 'run' ? 'would_run' : described.classification;
        log(`${item.date} ${item.session_id} ${label}${described.reason ? ` ${described.reason}` : ''}`);
      }
    }
    return { status: planError === null ? 'DRY' : 'FAILED', lock: null, sessions: rows, receipt: null,
      totals: { considered: rows.length, would_run: rows.filter(row => row.classification === 'run').length,
        ...totalsFor(rows, 'classification', 'skipped_short') },
      plan: { candidates: plan.length, processed: rows.length, max_sessions: maxSessions, error: planError } };
  }

  const lock = acquireLock(receiptsDir, now);
  if (lock.held) {
    log(`lock held, skipping this night (age_ms=${lock.age_ms ?? 'unknown'})`);
    return { status: 'LOCK_HELD', lock, sessions: [], receipt: null };
  }

  let plan = [], planError = null;
  const rows = [];
  try {
    try { plan = buildSessionPlan({ io, sessionsAddress, targetDate }); }
    catch (error) {
      planError = typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_plan_failed';
      plan = [];
      log(`sessions plan unreadable: ${planError}`);
    }
    if (planError === null) {
      for (const { item, described } of classifyPlan({ io, tools, sessionsAddress, plan, maxSessions })) {
        if (described.classification !== 'run') {
          const row = { session_id: item.session_id, title: described.title, duration_seconds: described.duration_seconds,
            outcome: described.classification, reason: described.reason, llm_calls: null, seconds: null,
            run_id: described.existing_run_id, verified: described.classification === 'skipped_existing' ? true : null };
          rows.push(row);
          log(`${item.date} ${row.session_id} ${row.outcome}${row.reason ? ` ${row.reason}` : ''}`);
          continue;
        }
        let row;
        try {
          const ran = await runSession({ io, tools, config, prompts, promptDigests, configSha256, sessionId: item.session_id });
          row = { session_id: item.session_id, title: described.title, duration_seconds: described.duration_seconds,
            outcome: 'ran', reason: null, llm_calls: Number.isFinite(ran.llm_calls) ? ran.llm_calls : null,
            seconds: Number.isFinite(ran.elapsed_ms) ? Math.round(ran.elapsed_ms / 1000) : null,
            run_id: ran.run_id ?? null, verified: ran.verified === true };
        } catch (error) {
          row = { session_id: item.session_id, title: described.title, duration_seconds: described.duration_seconds,
            outcome: 'failed', reason: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_run_failed',
            llm_calls: null, seconds: null, run_id: null, verified: null };
        }
        rows.push(row);
        log(`${item.date} ${row.session_id} ${row.outcome}${row.reason ? ` ${row.reason}` : ''}`
          + ` calls=${row.llm_calls ?? '-'} sec=${row.seconds ?? '-'}`);
      }
    }
  } finally {
    releaseLock(receiptsDir);
  }

  const failed = rows.filter(row => row.outcome === 'failed').length;
  const receipt = { schema_version: NIGHTLY_RECEIPT_SCHEMA, ran_at: now, target_date: targetDate, dry: false,
    lock: { reclaimed_stale: lock.reclaimed === true,
      previous_lock: lock.reclaimed === true ? (lock.previous ?? null) : null,
      previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
    plan: { candidates: plan.length, processed: rows.length, max_sessions: maxSessions, error: planError },
    sessions: rows,
    totals: { ran: rows.filter(row => row.outcome === 'ran').length,
      ...totalsFor(rows, 'outcome', 'skipped_short'),
      llm_calls: rows.reduce((sum, row) => sum + (row.llm_calls ?? 0), 0),
      seconds: rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0) },
    status: planError !== null ? 'FAILED' : (failed > 0 ? 'FAILED' : 'OK') };
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(path.join(receiptsDir, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(receipt));
  return { status: receipt.status, lock, sessions: rows, receipt };
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

export async function runNightlyCli(argv, { runSession, now, log: onLine } = {}) {
  const flags = options(argv);
  const tablePath = String(flags.get('root-table') ?? '');
  if (!tablePath) fail('voice_conversation_list_nightly_root_table_required');
  const expectedRootTableSha256 = flags.get('root-table-sha256');
  const rootTable = readRootTable({ tablePath,
    expectedSha256: typeof expectedRootTableSha256 === 'string' ? expectedRootTableSha256 : sha256(readFileSync(tablePath)) });
  const io = createAliasedStoreIo(rootTable);

  const toolsPath = String(flags.get('tools-config') ?? '');
  if (!toolsPath) fail('voice_conversation_list_nightly_tools_config_required');
  const tools = readToolsConfig(readFileSync(toolsPath));
  if (!tools.derived_root) fail('voice_conversation_list_nightly_derived_root_required');

  const pipelinePath = String(flags.get('pipeline-config') ?? '');
  if (!pipelinePath) fail('voice_conversation_list_nightly_pipeline_config_required');
  const configBytes = readFileSync(pipelinePath);
  if (configBytes.length > MAX_CONFIG_BYTES) fail('voice_conversation_list_nightly_pipeline_config_too_large');
  const config = readPipelineConfig(configBytes);
  const { prompts, digests } = readPrompts(config.prompts_dir);

  const receiptsDir = String(flags.get('receipts') ?? '');
  if (!receiptsDir) fail('voice_conversation_list_nightly_receipts_required');
  const dry = flags.get('dry') === true;
  const nowIso = now ?? new Date().toISOString();
  const dateFlag = flags.get('date');
  const targetDate = typeof dateFlag === 'string' ? dateFlag : defaultTargetDate(nowIso);
  const maxSessionsFlag = flags.get('max-sessions');
  let maxSessions = null;
  if (maxSessionsFlag !== undefined) {
    const parsed = typeof maxSessionsFlag === 'string' ? Number(maxSessionsFlag) : NaN;
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      fail('voice_conversation_list_nightly_max_sessions_invalid');
    }
    maxSessions = parsed;
  }

  // A line is kept in `lines` for a caller that reads the return value (tests,
  // programmatic callers), and also handed to `onLine` the moment it is
  // produced -- `main` below passes one that writes straight to stdout, so a
  // long night's progress is visible as it happens rather than only after the
  // whole run (or a 56-minute silence) ends.
  const lines = [];
  const log = line => { lines.push(line); if (onLine) onLine(line); };
  const result = await runNightly({ io, tools, config, prompts, promptDigests: digests,
    configSha256: hex(configBytes), receiptsDir, targetDate, maxSessions, dry, now: nowIso,
    ...(runSession ? { runSession } : {}), log });
  return { result, lines, targetDate };
}

async function main() {
  const { result } = await runNightlyCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
  if (result.status === 'LOCK_HELD') return 3;
  return result.status === 'FAILED' ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[voice-conversation-list-nightly] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
