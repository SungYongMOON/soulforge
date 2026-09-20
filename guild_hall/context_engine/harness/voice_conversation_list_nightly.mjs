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
// cli.mjs show` reads one). Everything else runs through the same per-session
// pipeline the CLI's `run` command calls, sequentially -- there is one local
// model behind this, and a pass over two sessions at once would just make both
// wait for the same server.
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
//        [--max-sessions N] [--dry]
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
const LOCK_FILE_NAME = 'nightly.lock.json';

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
function listDirNames(io, address) {
  let where;
  try { where = io.path(address, true); } catch { return []; }
  let entries;
  try { entries = readdirSync(where, { withFileTypes: true }); } catch { return []; }
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

/**
 * The sessions one night looks at, in the order it looks at them: the target
 * date's own sessions first, then every session from the trailing backlog
 * window this lane has not already seen, oldest day first. Membership only --
 * whether a session actually needs a run is `classifySession`'s question, asked
 * once per candidate rather than while building this list, so a directory this
 * lane cannot read yet still shows up as a plan entry with its own reason.
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
 * is called. Returns `null` when the directory this lane found is not a
 * readable session at all (no manifest, or a manifest naming a different
 * session) -- that is not this session's outcome, it is not a session.
 */
export function classifySession({ io, tools, sessionsAddress = VOICE_SESSIONS_ADDRESS, date, sessionId }) {
  const address = `${sessionsAddress}/${date}/${sessionId}`;
  let manifest;
  try { manifest = JSON.parse(io.read(`${address}/session_manifest.json`, MAX_MANIFEST_BYTES)); }
  catch { return null; }
  if (manifest?.session_id !== sessionId) return null;
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

// ------------------------------------------------------------------- lock
/**
 * One receipts directory holds one lock. A fresh lock refuses this run; a
 * stale one (older than `STALE_LOCK_MS`, or unreadable) is reclaimed and the
 * previous holder is carried into the receipt rather than silently overwritten.
 */
export function acquireLock(receiptsDir, now) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  let existing = null;
  if (existsSync(lockFile)) {
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= STALE_LOCK_MS) return { held: true, existing, age_ms: ageMs };
    try {
      writeFileSync(lockFile, encode({ pid: process.pid, started_at: now, reclaimed_from: existing }));
    } catch { return { held: true, existing, age_ms: ageMs }; }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch { return { held: true, existing: null, age_ms: 0 }; }
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
/**
 * One night. `runSession` is the only place this ever calls a model; tests
 * replace it with a scripted function and never touch `createLocalChat`.
 */
export async function runNightly({ io, tools, config, prompts, promptDigests, configSha256,
  sessionsAddress = VOICE_SESSIONS_ADDRESS, receiptsDir, targetDate, maxSessions = null, dry = false,
  now = new Date().toISOString(), runSession = defaultRunSession, log = () => {} } = {}) {
  const plan = buildSessionPlan({ io, sessionsAddress, targetDate });
  const capped = typeof maxSessions === 'number' && maxSessions >= 0 ? plan.slice(0, maxSessions) : plan;

  if (dry) {
    const rows = [];
    for (const item of capped) {
      const described = classifySession({ io, tools, sessionsAddress, date: item.date, sessionId: item.session_id });
      if (described === null) continue;
      rows.push(described);
      const label = described.classification === 'run' ? 'would_run' : described.classification;
      log(`${item.date} ${item.session_id} ${label}${described.reason ? ` ${described.reason}` : ''}`);
    }
    return { status: 'DRY', lock: null, sessions: rows, receipt: null,
      totals: { considered: rows.length, would_run: rows.filter(row => row.classification === 'run').length,
        skipped_existing: rows.filter(row => row.classification === 'skipped_existing').length,
        skipped_short: rows.filter(row => row.classification === 'skipped_short').length,
        failed: rows.filter(row => row.classification === 'failed').length },
      plan: { candidates: plan.length, capped: capped.length } };
  }

  const lock = acquireLock(receiptsDir, now);
  if (lock.held) {
    log(`lock held, skipping this night (age_ms=${lock.age_ms ?? 'unknown'})`);
    return { status: 'LOCK_HELD', lock, sessions: [], receipt: null };
  }

  const rows = [];
  try {
    for (const item of capped) {
      const described = classifySession({ io, tools, sessionsAddress, date: item.date, sessionId: item.session_id });
      if (described === null) continue;
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
  } finally {
    releaseLock(receiptsDir);
  }

  const failed = rows.filter(row => row.outcome === 'failed').length;
  const receipt = { schema_version: NIGHTLY_RECEIPT_SCHEMA, ran_at: now, target_date: targetDate, dry: false,
    lock: { reclaimed_stale: lock.reclaimed === true,
      previous_lock: lock.reclaimed === true ? (lock.previous ?? null) : null,
      previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
    plan: { candidates: plan.length, capped: capped.length, max_sessions: maxSessions },
    sessions: rows,
    totals: { ran: rows.filter(row => row.outcome === 'ran').length,
      skipped_existing: rows.filter(row => row.outcome === 'skipped_existing').length,
      skipped_short: rows.filter(row => row.outcome === 'skipped_short').length,
      failed,
      llm_calls: rows.reduce((sum, row) => sum + (row.llm_calls ?? 0), 0),
      seconds: rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0) },
    status: failed > 0 ? 'FAILED' : 'OK' };
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

export async function runNightlyCli(argv, { runSession, now } = {}) {
  const flags = options(argv);
  const tablePath = String(flags.get('root-table') ?? '');
  if (!tablePath) fail('voice_conversation_list_nightly_root_table_required');
  const rootTable = readRootTable({ tablePath, expectedSha256: sha256(readFileSync(tablePath)) });
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
  const maxSessions = typeof maxSessionsFlag === 'string' && Number.isFinite(Number(maxSessionsFlag))
    ? Math.max(0, Math.trunc(Number(maxSessionsFlag))) : null;

  const lines = [];
  const result = await runNightly({ io, tools, config, prompts, promptDigests: digests,
    configSha256: hex(configBytes), receiptsDir, targetDate, maxSessions, dry, now: nowIso,
    ...(runSession ? { runSession } : {}), log: line => lines.push(line) });
  return { result, lines, targetDate };
}

async function main() {
  const { result, lines } = await runNightlyCli(process.argv.slice(2));
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (result.status === 'LOCK_HELD') return 3;
  return result.status === 'FAILED' ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[voice-conversation-list-nightly] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
