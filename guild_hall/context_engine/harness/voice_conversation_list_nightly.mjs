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
// pass looked at and what became of it. Every real (non-`--dry`) session row
// carries the session's own plan `date` (the day-folder it actually lives
// under, which for a backlog-window row is earlier than `target_date`) --
// `harness/estate_voice_card_reconcile.mjs`'s `--nightly-receipts` backlog
// mode reads it to know which day's mail/Linear window a session needs,
// falling back to the session id's own `YYYYMMDD_` prefix for a receipt
// written before this field existed. A lock file in the same directory keeps
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
// `--deadline HH:MM` bounds real (calls-a-model) work by wall clock rather
// than by session count: it names a local Asia/Seoul time of day, interpreted
// as the next occurrence after this run's own start -- a 00:00 start with
// `--deadline 04:00` stops at that same morning's 04:00, and a 23:30 start
// with `--deadline 01:00` stops at the 01:00 that follows midnight, not one
// already behind it (`nextDeadlineInstant`). `--deadline` equal to
// `--scheduled-start` is refused outright (S2, 2026-09-21 review): it would
// resolve to a full day later, silently granting a 24-hour runway. The
// deadline (minus `--no-start-within`'s margin, below) is only ever checked
// right before this pass would start a session's own card generation (never
// mid-classification, which is cheap file reads, not model calls); once it
// has passed, this pass stops for the night rather than starting another
// session, and the receipt's `deadline` block says how many sessions it
// finished and how many still-unrun ones it left. A session left this way
// carries no run yet, so the very same `classifySession` logic that already
// re-offers a session past `--max-sessions` offers it again the next night --
// nothing about the deadline needs its own separate pickup mechanism.
//
// A run that reaches its very first deadline check with zero sessions
// already attempted (the deadline, possibly anchored via `--scheduled-start`
// below, was already behind before this pass could start even one) exits
// with a *distinct* status and exit code (`SKIPPED_PAST_DEADLINE`, exit 4 --
// see `main`'s own doc) rather than the exit-0 `OK` a deadline reached
// mid-run gets (R1a, 2026-09-21 review): `OK`/0 is what Task Scheduler and a
// receipt-reading watcher both read as "ran fine", which a night that did
// zero real work is not, however clean the reason. Neither shape is
// `FAILED`: nothing went wrong, the deadline is simply doing its job.
//
// `--scheduled-start HH:MM` (optional) anchors the deadline to the *trigger*
// time rather than to whenever this process actually started -- see
// `nextDeadlineInstant`'s own doc. Without it, a task whose process started
// late (a machine that woke at 04:10 for a 00:00 trigger with a 04:00
// deadline) would compute "the next 04:00 after 04:10", i.e. tomorrow, and
// quietly get a fresh multi-hour runway it was never granted. With it, the
// deadline stays pinned to the scheduled 00:00's own day (04:00 that same
// morning), already behind the 04:10 wake-up, so this run stops immediately
// (`SKIPPED_PAST_DEADLINE`) -- everything left for the next night. The
// registrar passes this through from `-DailyAt` automatically.
//
// `--no-start-within MINUTES` (S4, 2026-09-21 review; default 30 once a
// deadline is set, 0 otherwise) holds back the *start* of a new session once
// fewer than that many minutes remain before the deadline -- the same stop
// as the deadline itself, just that many minutes earlier. This pass cannot
// interrupt a session already running: `runConversationList` (the pipeline
// `defaultRunSession` calls) takes no abort signal or wall-clock budget
// anywhere in its per-call loop, so a session that started just inside the
// margin and then runs long is not abandoned mid-flight -- it is left to
// finish, and if it finishes more than `HARD_STOP_GRACE_MINUTES` (60,
// currently not a flag) past the deadline, that overrun is only *recorded*
// (the session row's own `overran_hard_stop` and a `receipt.warnings` entry),
// never cut short and never re-offered with a partial card -- the card it
// produced is the real one.
//
// `--chain-reconcile` runs pass-2 reconcile (`estate_voice_card_reconcile.mjs`)
// and then the morning-question "present" step (`voice_question_cli.mjs
// present`) in this same process, immediately after card generation ends
// (normally, by deadline, or `SKIPPED_PAST_DEADLINE`) -- both against this
// same night's own `--receipts` directory (reconcile's `--nightly-receipts`
// backlog mode) and a separate `--reconcile-receipts` directory that becomes
// both reconcile's `--receipts` and present's `--receipts` (present reads its
// exception pool from exactly the directory reconcile just wrote to). This
// pass's own lock is held across the whole chain, not released before it
// (S5, 2026-09-21 review), so a second nightly run cannot start real
// card-generation work while the chain is still going; reconcile's own,
// separate lock being held by someone else (a concurrent manual reconcile
// run) is its own non-failure `LOCK_HELD` chain status, not a spurious
// failure of this pass. Neither call is retried or undone here, and a
// failure at either stage never re-runs or reverts card generation -- it is
// recorded in this receipt's `chain` block and makes this whole pass exit
// non-zero, the same as a session failure does. `--dry` propagates: a
// `--dry --chain-reconcile` run previews the whole chain (both sub-calls in
// their own `--dry`) without writing anything, which is what a registrar
// preflight checks before it registers this chained shape.
//
// usage:
//   node voice_conversation_list_nightly.mjs --root-table <file> --tools-config <file>
//        --pipeline-config <file> --receipts <dir> [--date YYYY-MM-DD]
//        [--root-table-sha256 sha256:...] [--max-sessions N]
//        [--deadline HH:MM [--scheduled-start HH:MM] [--no-start-within MINUTES]] [--dry]
//        [--chain-reconcile --reconcile-receipts <dir>
//         [--linear-root <alias address>] [--mail-root <alias address>]...
//         [--questions-cap N]]
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { ConversationListError, readPipelineConfig } from '../src/runtime/voice_conversation_list.mjs';
import { VOICE_SESSIONS_ADDRESS } from './voice_segment_drafts.mjs';
import { readPrompts, readRun, runConversationList } from './voice_conversation_list_cli.mjs';

// v2 (2026-09-21 review, N5): `status` gained `SKIPPED_PAST_DEADLINE` and the
// receipt gained `chain`/`backlog`/`warnings` and a richer `deadline` block --
// a v1-shaped reader that does not know any of that should not silently
// misread a v2 receipt as something it is not. `NIGHTLY_RECEIPT_SCHEMA_V1` is
// kept so a reader across the version boundary (`estate_voice_card_
// reconcile.mjs`'s `--nightly-receipts` backlog mode, which only ever reads
// the unchanged `sessions` array) can accept both explicitly instead of
// silently going blind to every receipt this file writes from now on.
export const NIGHTLY_RECEIPT_SCHEMA_V1 = 'soulforge.voice_conversation_list_nightly_receipt.v1';
export const NIGHTLY_RECEIPT_SCHEMA = 'soulforge.voice_conversation_list_nightly_receipt.v2';
// How long a lock may sit before this lane treats it as abandoned rather than
// held by a run that is still going, when no `--deadline` is configured (see
// `staleLockMsFor` for the deadline-derived threshold used when one is).
// Three hours is well past what one night's worth of sessions should ever
// take through one local model with no deadline bounding them.
export const STALE_LOCK_MS = 3 * 60 * 60 * 1000;
// A deadline-derived stale-lock threshold (S5-1, 2026-09-21 review) is never
// let below this floor -- a short deadline span should not make this lane
// treat its own still-legitimate lock as abandoned sooner than a run with no
// deadline at all would have.
export const MIN_DEADLINE_STALE_LOCK_MS = 8 * 60 * 60 * 1000;
// A deliberately generous allowance folded into the deadline-derived
// stale-lock threshold for how long the chain (reconcile + present) itself
// might run once card generation ends -- both are bounded, cheap-read passes,
// but neither is timed by this file.
export const CHAIN_ALLOWANCE_MS = 30 * 60 * 1000;
// A conversation this short is not something the pipeline's boundary and nature
// steps have anything to work with; running it would spend calls to say so.
export const MIN_TRANSCRIPT_SECONDS = 30;
// How many days back this lane looks for a session it has not finished yet,
// beyond the target date itself.
export const BACKLOG_WINDOW_DAYS = 7;
// How many nights ahead counts as "about to age out" for `aging_out_soon`/
// plan reordering (R1b/R1c, 2026-09-21 review).
export const AGING_SOON_NIGHTS = 2;
// The furthest `aged_out_unprocessed` (R1b-1, 2026-09-21 review) ever looks
// back, regardless of how large the gap since the last receipt measures --
// a receipts directory that has not run in months must not make this pass
// scan an unbounded number of days.
export const MAX_AGED_OUT_LOOKBACK_DAYS = 7;
// `--no-start-within`'s default when `--deadline` is set and the caller gave
// no explicit value (S4, 2026-09-21 review): do not *start* a session this
// close to the deadline.
export const DEFAULT_NO_START_WITHIN_MINUTES = 30;
// How far past the deadline a session that already started is allowed to
// keep running before this pass records a warning about it (S4). Not an
// abort: see `defaultRunSession`'s neighbouring doc for why this pass never
// interrupts a session already in flight.
export const HARD_STOP_GRACE_MINUTES = 60;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;
// No `.json` extension: a receipt consumer that globs `*.json` in this
// directory must never trip over the lock file.
const LOCK_FILE_NAME = 'nightly.lock';
// S1-1 (2026-09-21 review): `renameSync` over an existing target has been
// measured to fail with `EPERM` on Windows when another process (an AV
// scanner, a person's own `type`/editor, a backup agent) has the file open --
// these three codes are the ones worth a short retry rather than an
// immediate throw.
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_RETRY_ATTEMPTS = 4;
const RENAME_RETRY_DELAY_MS = 50;

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hex = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = code => { throw new ConversationListError(code); };

/** A synchronous sleep (Node's `Atomics.wait` on a throwaway `SharedArrayBuffer`) -- there is
 * no async/await anywhere in this file's receipt-writing path, and adding one just for a
 * handful of short retries would ripple `async` through callers that have no other reason to be. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Writes via a temp file in the same directory, then `rename`s it into place
 * (S1, 2026-09-21 review) -- a crash or kill mid-write leaves the temp file
 * orphaned, never a half-written receipt at the real path. The temp name
 * includes a random id so two writes racing in the same millisecond (two
 * receipt writes in one run, or two runs against the same directory) never
 * collide on the same temp path.
 *
 * S1-1 (2026-09-21 review): a `rename` over an existing target has been
 * measured to fail with `EPERM` on Windows when something else briefly has
 * the file open -- retried a few times with a short delay rather than
 * thrown straight through (which used to escape `runNightly` entirely,
 * leaving `chain: RUNNING` on disk forever, an orphaned temp file, and a
 * clean night reported as failed). If every retry still fails, this falls
 * back to a direct, non-atomic overwrite of the target -- a receipt that is
 * momentarily not atomically replaced is still far better than one that
 * never gets written at all. The temp file is always removed in `finally`,
 * whichever path was taken (a no-op once `rename` already moved it away).
 * `deps` exists only for tests to inject a scripted rename/sleep without
 * touching the real filesystem or actually waiting.
 */
export function atomicWriteFileSync(filePath, buffer, deps = {}) {
  const { renameFn = renameSync, writeFn = writeFileSync, removeFn = rmSync, sleepFn = sleepSync,
    retries = RENAME_RETRY_ATTEMPTS, delayMs = RENAME_RETRY_DELAY_MS } = deps;
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${randomUUID()}`);
  writeFn(tmpPath, buffer);
  try {
    for (let attempt = 0; ; attempt++) {
      try { renameFn(tmpPath, filePath); return; }
      catch (error) {
        if (!RETRYABLE_RENAME_CODES.has(error?.code)) throw error; // a real error, not a transient lock
        if (attempt >= retries - 1) break; // retries exhausted: fall through to the direct-overwrite fallback
        sleepFn(delayMs);
      }
    }
    writeFn(filePath, buffer);
  } finally {
    try { removeFn(tmpPath, { force: true }); } catch { /* best-effort cleanup only */ }
  }
}

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

// -------------------------------------------------------------- deadline
const DEADLINE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/u;

function seoulMsFor(iso, invalidCode) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) fail(invalidCode);
  return ms + 9 * 60 * 60 * 1000;
}

/**
 * The most recent local Asia/Seoul wall-clock instant matching `hhmm`
 * ("HH:MM") at or before `anchorIso` -- "at or before", so a call made
 * exactly at that minute anchors to itself, not the day before. The mirror
 * image of `nextDeadlineInstant`'s own forward search, used to find which
 * calendar day a *scheduled* start actually falls on when the process that
 * woke up to run it did not start on time.
 */
function lastOccurrenceAtOrBefore(anchorIso, hhmm) {
  const match = DEADLINE_HHMM.exec(hhmm ?? '');
  if (match === null) fail('voice_conversation_list_nightly_scheduled_start_invalid');
  const seoulAnchorMs = seoulMsFor(anchorIso, 'voice_conversation_list_nightly_scheduled_start_invalid');
  const seoulAnchor = new Date(seoulAnchorMs);
  const candidateSeoulMs = Date.UTC(seoulAnchor.getUTCFullYear(), seoulAnchor.getUTCMonth(), seoulAnchor.getUTCDate(),
    Number(match[1]), Number(match[2]), 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const resolvedSeoulMs = candidateSeoulMs > seoulAnchorMs ? candidateSeoulMs - oneDayMs : candidateSeoulMs;
  return new Date(resolvedSeoulMs - 9 * 60 * 60 * 1000).toISOString();
}

/**
 * The next local Asia/Seoul wall-clock instant matching `hhmm` ("HH:MM")
 * strictly after the anchor -- "next occurrence after start", never the one
 * already behind it. Uses the same fixed +09:00 arithmetic `seoulDateFor`/
 * `shiftDate` already use, so a deadline and this lane's own "today" never
 * disagree about what calendar day it is.
 *
 * `scheduledStart` ("HH:MM", optional) anchors the search to the *scheduled*
 * trigger time instead of to `nowIso` itself (`nowIso` is still what decides
 * which calendar day that scheduled start falls on, via
 * `lastOccurrenceAtOrBefore`). This matters for a task whose process actually
 * started well after its trigger fired -- a machine that woke at 04:10 for a
 * 00:00 trigger with a 04:00 deadline must not get a fresh multi-hour runway
 * computed from *when it happened to wake up* (that would compute "the next
 * 04:00 after 04:10", i.e. tomorrow); anchored to the 00:00 trigger, the
 * deadline is today's 04:00, already behind the 04:10 wake-up, so this run
 * stops immediately rather than silently getting a day it was never granted.
 * Left out, `nowIso` is its own anchor -- this function's original,
 * unanchored behaviour, unchanged for every existing caller.
 */
export function nextDeadlineInstant(nowIso, hhmm, scheduledStart = null) {
  const match = DEADLINE_HHMM.exec(hhmm ?? '');
  if (match === null) fail('voice_conversation_list_nightly_deadline_invalid');
  // S2 (2026-09-21 review): a deadline equal to the scheduled start would
  // resolve to "the next occurrence of that same time", i.e. a full day
  // later -- silently granting this run a 24-hour runway instead of the
  // same-night stop its own two values look like they should mean.
  if (scheduledStart !== null && scheduledStart === hhmm) {
    fail('voice_conversation_list_nightly_deadline_equals_scheduled_start');
  }
  const anchorIso = scheduledStart !== null ? lastOccurrenceAtOrBefore(nowIso, scheduledStart) : nowIso;
  const seoulAnchorMs = seoulMsFor(anchorIso, 'voice_conversation_list_nightly_deadline_invalid');
  const seoulAnchor = new Date(seoulAnchorMs);
  const candidateSeoulMs = Date.UTC(seoulAnchor.getUTCFullYear(), seoulAnchor.getUTCMonth(), seoulAnchor.getUTCDate(),
    Number(match[1]), Number(match[2]), 0, 0);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const deadlineSeoulMs = candidateSeoulMs <= seoulAnchorMs ? candidateSeoulMs + oneDayMs : candidateSeoulMs;
  return new Date(deadlineSeoulMs - 9 * 60 * 60 * 1000).toISOString();
}

/**
 * Milliseconds from the *scheduled* start (via `scheduledStart`, the same
 * anchor `nextDeadlineInstant` itself uses -- `now` only when there is no
 * `scheduledStart`) to `deadlineAt`. Shared by `staleLockMsFor` (S5-1) and
 * the `--no-start-within` margin-exceeds-span guard (nit 3) so both read the
 * same "how long is this run's legitimate window" number.
 */
function deadlineSpanMs({ scheduledStart, deadlineAt, now }) {
  const anchorIso = scheduledStart !== null ? lastOccurrenceAtOrBefore(now, scheduledStart) : now;
  return Date.parse(deadlineAt) - Date.parse(anchorIso);
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
/**
 * The last calendar day (`YYYY-MM-DD`) a backlog candidate can carry and
 * still be more than `nightsAhead` nights from falling out of the
 * `backlogWindowDays`-day window, as of `targetDate`. A candidate whose
 * `date` is at or before this threshold will drop out of the window within
 * `nightsAhead` future nights if it is not run before then (R1b/R1c,
 * 2026-09-21 review) -- see `buildSessionPlan`'s and `backlogAgingReport`'s
 * own doc for what that is used for.
 */
export function agingOutSoonThreshold(targetDate, backlogWindowDays = BACKLOG_WINDOW_DAYS,
  nightsAhead = AGING_SOON_NIGHTS) {
  return shiftDate(targetDate, nightsAhead - backlogWindowDays - 1);
}

export function buildSessionPlan({ io, sessionsAddress = VOICE_SESSIONS_ADDRESS, targetDate,
  backlogWindowDays = BACKLOG_WINDOW_DAYS, agingSoonNights = AGING_SOON_NIGHTS } = {}) {
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
  // R1c (2026-09-21 review): a backlog candidate within `agingSoonNights` of
  // falling out of the window goes *before* the new day's own sessions --
  // otherwise a plan bigger than `--max-sessions` every night can push the
  // very oldest backlog candidates past the cap night after night until they
  // age out unprocessed and silently vanish (see `agingOutSoonThreshold`).
  // `backlog` is already oldest-first, so the urgent slice is exactly its own
  // prefix; nothing about the ordering *within* either slice changes.
  const agingThreshold = agingOutSoonThreshold(targetDate, backlogWindowDays, agingSoonNights);
  const urgentBacklog = backlog.filter(item => item.date <= agingThreshold);
  const restBacklog = backlog.filter(item => item.date > agingThreshold);
  return [...urgentBacklog, ...primary, ...restBacklog];
}

/**
 * How many nights `aged_out_unprocessed` (R1b-1, 2026-09-21 review) looks
 * back: the gap, in whole days, since the newest prior nightly receipt's own
 * `ran_at` found in `receiptsDir` (either schema version -- see
 * `NIGHTLY_RECEIPT_SCHEMA_V1`) to `now`'s own Seoul calendar day. Looking at
 * only the single most-recently-fallen-out day (the original R1b shape)
 * silently loses coverage the moment one night is missed entirely: that
 * night never ran to check its own edge day, and by the *following* night
 * that day is already two days past the edge, not one, so a check that only
 * ever looks one day back never catches it. No prior receipt at all (a fresh
 * receipts directory, or one this pass could not read) falls back to the
 * full `MAX_AGED_OUT_LOOKBACK_DAYS`, which is also this function's ceiling
 * regardless of how large a real gap measures -- a receipts directory idle
 * for months must not make this pass scan an unbounded number of days.
 */
function agedOutLookbackNights(receiptsDir, now) {
  let entries;
  try { entries = readdirSync(receiptsDir); } catch { return MAX_AGED_OUT_LOOKBACK_DAYS; }
  let newestRanAtMs = null;
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    let body;
    try { body = JSON.parse(readFileSync(path.join(receiptsDir, name), 'utf8')); } catch { continue; }
    if (body?.schema_version !== NIGHTLY_RECEIPT_SCHEMA && body?.schema_version !== NIGHTLY_RECEIPT_SCHEMA_V1) continue;
    const ranAtMs = typeof body.ran_at === 'string' ? Date.parse(body.ran_at) : NaN;
    if (Number.isFinite(ranAtMs) && (newestRanAtMs === null || ranAtMs > newestRanAtMs)) newestRanAtMs = ranAtMs;
  }
  if (newestRanAtMs === null) return MAX_AGED_OUT_LOOKBACK_DAYS;
  const previousSeoulDate = seoulDateFor(new Date(newestRanAtMs).toISOString());
  const todaySeoulDate = seoulDateFor(now);
  const gapDays = Math.round(
    (Date.parse(`${todaySeoulDate}T00:00:00.000Z`) - Date.parse(`${previousSeoulDate}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000));
  return Math.min(MAX_AGED_OUT_LOOKBACK_DAYS, Math.max(1, gapDays));
}

/**
 * Backlog-aging visibility (R1b, 2026-09-21 review). `aging_out_soon` counts
 * candidates already in tonight's `plan` that still need a run (classified
 * fresh here, not read off `classifyPlan`'s own `--max-sessions`-capped pass,
 * so the count is accurate even when the cap would stop classification
 * before reaching them) and will fall out of the backlog window within
 * `AGING_SOON_NIGHTS` nights if not run tonight. `aged_out_unprocessed`
 * (R1b-1) looks back `agedOutLookbackNights` calendar days from the window
 * edge -- every one of those, not just the single newest -- and reports any
 * session there still lacking a verified run, grouped by date; the scan
 * stops (recording `error`) at the first day it cannot read rather than
 * silently reporting a partial answer as if it were complete.
 */
function backlogAgingReport({ io, tools, sessionsAddress, targetDate, plan, receiptsDir, now,
  backlogWindowDays = BACKLOG_WINDOW_DAYS, configSha256 = null, promptDigests = null }) {
  const agingThreshold = agingOutSoonThreshold(targetDate, backlogWindowDays);
  const agingOutSoon = plan
    .filter(item => item.date !== targetDate && item.date <= agingThreshold)
    .filter(item => classifySession({ io, tools, sessionsAddress, date: item.date, sessionId: item.session_id,
      configSha256, promptDigests }).classification === 'run')
    .length;

  const lookbackNights = agedOutLookbackNights(receiptsDir, now);
  const byDate = [];
  let agedOutErrorCode = null;
  for (let night = 1; night <= lookbackNights; night++) {
    const agedOutDate = shiftDate(targetDate, -(backlogWindowDays + night));
    try {
      const sessionIds = listDirNames(io, `${sessionsAddress}/${agedOutDate}`)
        .filter(sessionId => classifySession({ io, tools, sessionsAddress, date: agedOutDate, sessionId,
          configSha256, promptDigests }).classification === 'run');
      if (sessionIds.length > 0) byDate.push({ date: agedOutDate, count: sessionIds.length, session_ids: sessionIds });
    } catch (error) {
      agedOutErrorCode = typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_aging_check_failed';
      break;
    }
  }
  return { aging_out_soon: agingOutSoon,
    aged_out_unprocessed: { lookback_nights: lookbackNights,
      count: byDate.reduce((sum, entry) => sum + entry.count, 0), by_date: byDate, error: agedOutErrorCode } };
}

// ------------------------------------------------------------ classification
/**
 * Whether an existing verified run is still the answer for what the session
 * currently declares, checked only against what is already in hand -- the
 * existing run's own `run_manifest.json` (already read by `readRun`, not a
 * new file) and the two things a caller of this whole night already computed
 * once (`configSha256`, `promptDigests`). Returns the field name that
 * disagreed, or `null` when nothing checked here disagrees.
 *
 * Deliberately narrower than `runIdFor`'s own canonical hash: recomputing
 * that exactly would mean re-reading the transcript and semantic-label run
 * and pinning the model, which is exactly the model-free, cheap-read shape
 * this whole classification step exists to keep. Transcript identity is
 * compared by the *transcript run id* the session currently declares
 * (`independent_transcription.run_id`, already read from the session
 * manifest) against the run's own recorded `manifest.transcript.run_id` --
 * not by re-hashing the transcript bytes. The model/prompt pin itself is not
 * compared either (pinning would call the model service); only the prompt
 * *file* digests are, since the caller already has them for the real run.
 */
export function staleReasonFor({ manifest, transcriptRunId, configSha256 = null, promptDigests = null }) {
  if (manifest === null) return 'manifest_unreadable';
  if (typeof transcriptRunId === 'string' && transcriptRunId
    && manifest.transcript?.run_id !== transcriptRunId) return 'transcript_run_id';
  if (configSha256 !== null && manifest.config_sha256 !== `sha256:${configSha256}`) return 'config';
  if (promptDigests !== null) {
    for (const [name, digest] of Object.entries(promptDigests)) {
      if (manifest.prompts?.[name] !== digest) return 'prompts';
    }
  }
  return null;
}

/**
 * What this pass will do with one candidate session, decided before any model
 * is called. Every candidate this lane found becomes a row -- a manifest that
 * cannot be read or that names a different session is `failed`
 * (`session_manifest_unreadable`) rather than a session that quietly vanishes
 * from the plan. `configSha256`/`promptDigests`, when given, additionally bind
 * an existing verified run to the inputs the night is actually running with
 * (see `staleReasonFor`); a run whose inputs have moved on is planned `run`
 * again (`existing_run_stale:<field>`) instead of `skipped_existing`, and its
 * old run directory is never touched, let alone deleted.
 */
export function classifySession({ io, tools, sessionsAddress = VOICE_SESSIONS_ADDRESS, date, sessionId,
  configSha256 = null, promptDigests = null }) {
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
    const staleField = staleReasonFor({ manifest: existing.manifest,
      transcriptRunId: manifest.independent_transcription?.run_id ?? null, configSha256, promptDigests });
    if (staleField === null) {
      return { ...base, classification: 'skipped_existing', reason: null, existing_run_id: existing.run_id };
    }
    return { ...base, classification: 'run', reason: `existing_run_stale:${staleField}`, existing_run_id: existing.run_id };
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
function classifyPlan({ io, tools, sessionsAddress, plan, maxSessions, configSha256 = null, promptDigests = null }) {
  const rows = [];
  let runCount = 0;
  for (const item of plan) {
    if (maxSessions !== null && runCount >= maxSessions) break;
    const described = classifySession({ io, tools, sessionsAddress, date: item.date, sessionId: item.session_id,
      configSha256, promptDigests });
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
 * stale one (older than `staleLockMs` -- `STALE_LOCK_MS` by default, or a
 * larger value `staleLockMsFor` derives when a deadline is configured, see
 * S5-1 below -- or unreadable) is reclaimed atomically -- the stale file is
 * removed and a fresh one created with `wx`, so two passes racing on the
 * same stale lock cannot both believe they reclaimed it -- and the previous
 * holder is carried into the receipt rather than silently overwritten. A
 * `wx` failure other than "someone just created it" (`EEXIST`) is a real
 * error, thrown rather than reported as merely held.
 */
export function acquireLock(receiptsDir, now, staleLockMs = STALE_LOCK_MS) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= staleLockMs) return { held: true, existing, age_ms: ageMs };
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

/**
 * S5-1 (2026-09-21 review): the fixed 3-hour `STALE_LOCK_MS` is well short of
 * what a legitimate deadline-bounded run can actually take (a 00:00 start
 * with a 04:00 deadline, the default 60-minute hard-stop grace and a chained
 * reconcile/present pass can hold this lock for roughly 5.5 hours) -- a
 * second, manual invocation could treat that live lock as abandoned,
 * reclaim it, and then have the *first* run's own `releaseLock` delete the
 * second run's brand-new lock out from under it. The threshold is derived
 * from the *scheduled* start (via `scheduledStart`, the same anchor
 * `nextDeadlineInstant` uses -- never from `now`, so a late-starting run
 * does not get a smaller allowance than an on-time one) to the deadline,
 * plus the hard-stop grace and, when chaining, `CHAIN_ALLOWANCE_MS` --
 * always floored at `MIN_DEADLINE_STALE_LOCK_MS` so a short deadline span
 * never makes this lane more trigger-happy about its own lock than the
 * no-deadline default already is. No `--deadline` configured falls back to
 * the fixed `STALE_LOCK_MS`, unchanged from before this review.
 */
export function staleLockMsFor({ deadline, scheduledStart = null, deadlineAt = null, now, chainReconcile = false }) {
  if (deadline === null) return STALE_LOCK_MS;
  const spanMs = deadlineSpanMs({ scheduledStart, deadlineAt, now });
  const graceMs = HARD_STOP_GRACE_MINUTES * 60 * 1000;
  const chainMs = chainReconcile ? CHAIN_ALLOWANCE_MS : 0;
  return Math.max(MIN_DEADLINE_STALE_LOCK_MS, spanMs + graceMs + chainMs);
}

/**
 * Removes the lock unconditionally when `ownership` is not given (the prior,
 * simpler behaviour -- still what a direct caller with no run of its own to
 * protect, such as a test, wants). Given `ownership` (`{ pid, started_at }`,
 * exactly the shape `acquireLock` itself just wrote), S5-1 (2026-09-21
 * review): removes the lock *only* when the file currently on disk still
 * has that same pid and started_at -- otherwise this run's own lock was
 * already reclaimed by someone else (its age outlived a stale-lock
 * threshold that turned out too short for how long this run actually took),
 * and deleting whatever is there now would delete a live lock that is not
 * this run's to delete.
 */
export function releaseLock(receiptsDir, ownership = null) {
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (ownership !== null) {
    let current;
    try { current = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { return; }
    if (current?.pid !== ownership.pid || current?.started_at !== ownership.started_at) return;
  }
  try { rmSync(lockFile, { force: true }); } catch { /* nothing to release */ }
}

// ------------------------------------------------------------- per-session
/** The real per-session run: the same call the CLI's `run` command makes. */
async function defaultRunSession({ io, tools, config, prompts, promptDigests, configSha256, sessionId }) {
  const result = await runConversationList({ io, tools, config, prompts, promptDigests, configSha256, sessionId });
  return { run_id: result.run_id, verified: result.list.verified === true,
    llm_calls: result.manifest.calls.total, elapsed_ms: result.manifest.elapsed_ms };
}

// --------------------------------------------------------------- chain
/**
 * Pass-2 reconcile, then the morning-question "present" step -- the two real
 * calls `--chain-reconcile` makes, each the exact same CLI entry point a
 * human running them by hand would call
 * (`estate_voice_card_reconcile.mjs`'s and `voice_question_cli.mjs`'s own
 * `runReconcileCli`/`runVoiceQuestionCli`), imported lazily so a plain
 * (non-chaining) nightly run never loads either module. `present`'s
 * `--receipts` is always the same `reconcileReceiptsDir` reconcile itself
 * just wrote to -- that is where `present` reads its exception pool from,
 * not this night's own `--receipts`. `linearRoot` is passed through only
 * when the caller actually gave one; left out, reconcile applies its own
 * documented default (`data_root/ingress/linear`) rather than this file
 * repeating that default and risking the two drifting apart. present never
 * runs when reconcile did not reach `OK`/`DRY`; nothing here retries or
 * undoes either call.
 */
async function defaultRunReconcileChain({ tablePath, rootTableSha256, toolsConfigPath, nightlyReceiptsDir,
  reconcileReceiptsDir, linearRoot, mailRoots = [], questionsCap = null, dry, now, log }) {
  let reconcileResult;
  try {
    const { runReconcileCli } = await import('./estate_voice_card_reconcile.mjs');
    const reconcileArgv = ['--root-table', tablePath,
      // N2 (2026-09-21 review): a programmatic caller with no sha in hand
      // (not this file's own CLI wrapper, which always resolves one) must
      // never put a literal `null` into this argv -- omitted, reconcile's
      // own CLI falls back to hashing the table file itself, its documented
      // default for this exact flag.
      ...(rootTableSha256 ? ['--root-table-sha256', rootTableSha256] : []),
      '--tools-config', toolsConfigPath, '--receipts', reconcileReceiptsDir,
      '--nightly-receipts', nightlyReceiptsDir, '--now', now,
      ...(linearRoot ? ['--linear-root', linearRoot] : []),
      ...mailRoots.flatMap(root => ['--mail-root', root]),
      ...(dry ? ['--dry'] : [])];
    const reconcileRun = await runReconcileCli(reconcileArgv, { log: line => log(`[reconcile] ${line}`) });
    reconcileResult = reconcileRun.result;
  } catch (error) {
    return { status: 'FAILED', stage: 'reconcile',
      reason: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_chain_reconcile_failed',
      reconcile: null, present: null };
  }
  if (reconcileResult.status === 'LOCK_HELD') {
    // S5 (2026-09-21 review): reconcile's own, separate lock
    // (`reconcile.lock`) held by another process -- a concurrent manual
    // reconcile run, say -- is not this chain's failure. `present` is
    // skipped rather than reading a stale exception pool reconcile never
    // touched this pass.
    return { status: 'LOCK_HELD', stage: 'reconcile', reason: 'reconcile_lock_held',
      reconcile: { status: 'LOCK_HELD' }, present: null };
  }
  if (reconcileResult.status !== 'OK' && reconcileResult.status !== 'DRY') {
    return { status: 'FAILED', stage: 'reconcile', reason: reconcileResult.status,
      reconcile: { status: reconcileResult.status }, present: null };
  }

  try {
    const { runVoiceQuestionCli } = await import('./voice_question_cli.mjs');
    const presentArgv = ['present', '--root-table', tablePath,
      ...(rootTableSha256 ? ['--root-table-sha256', rootTableSha256] : []),
      '--tools-config', toolsConfigPath, '--receipts', reconcileReceiptsDir, '--now', now,
      ...(questionsCap !== null ? ['--cap', String(questionsCap)] : []),
      ...(dry ? ['--dry'] : [])];
    const presentRun = await runVoiceQuestionCli(presentArgv, { log: line => log(`[present] ${line}`) });
    const presentStatus = presentRun.result.status;
    if (presentStatus !== 'OK' && presentStatus !== 'DRY') {
      return { status: 'FAILED', stage: 'present', reason: presentStatus,
        reconcile: { status: reconcileResult.status }, present: { status: presentStatus } };
    }
    return { status: 'OK', stage: null, reason: null,
      reconcile: { status: reconcileResult.status }, present: { status: presentStatus } };
  } catch (error) {
    return { status: 'FAILED', stage: 'present',
      reason: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_chain_present_failed',
      reconcile: { status: reconcileResult.status }, present: null };
  }
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
 * `clock` is read fresh (never cached) every time this checks whether a
 * threshold has passed -- tests inject a scripted one so a deadline stop is
 * provable without an actual multi-hour wait. `chainReconcile` needs real
 * file paths (`tablePath`/`rootTableSha256`/`toolsConfigPath`,
 * `reconcileReceiptsDir`), not the already-resolved `io`/`tools` this
 * function otherwise runs on, because its two sub-calls are the reconcile and
 * present CLIs, each reading its own root table and tools config from disk.
 *
 * `noStartWithinMinutes` (S4, 2026-09-21 review; `null` picks the default --
 * `DEFAULT_NO_START_WITHIN_MINUTES` when a deadline is set, otherwise no
 * margin) holds back the *start* of a new session once fewer than that many
 * minutes remain before the deadline. This pass never interrupts a session
 * already running -- `defaultRunSession`'s pipeline (`runConversationList`)
 * takes no abort signal or wall-clock budget anywhere in its per-call loop
 * (checked directly against its source), so a session that started just
 * inside the margin and then runs long is only ever *recorded*, via
 * `HARD_STOP_GRACE_MINUTES`, never abandoned mid-flight -- see the loop body
 * below for exactly what that recording is.
 */
export async function runNightly({ io, tools, config, prompts, promptDigests, configSha256,
  sessionsAddress = VOICE_SESSIONS_ADDRESS, receiptsDir, targetDate, maxSessions = null, dry = false,
  now = new Date().toISOString(), runSession = defaultRunSession, log = () => {},
  deadline = null, scheduledStart = null, noStartWithinMinutes = null, clock = () => new Date().toISOString(),
  chainReconcile = false, runReconcileChain = defaultRunReconcileChain,
  tablePath = null, rootTableSha256 = null, toolsConfigPath = null, reconcileReceiptsDir = null,
  linearRoot = null, mailRoots = [], questionsCap = null } = {}) {
  if (chainReconcile && (!tablePath || !toolsConfigPath || !reconcileReceiptsDir)) {
    fail('voice_conversation_list_nightly_chain_config_required');
  }
  // Anchored to `scheduledStart` (the registered trigger time), not to `now`
  // (when this process actually happened to start), when given -- see
  // `nextDeadlineInstant`'s own doc for why that distinction matters for a
  // late-starting run.
  const deadlineAt = deadline !== null ? nextDeadlineInstant(now, deadline, scheduledStart) : null;
  const effectiveNoStartWithinMinutes = noStartWithinMinutes !== null ? noStartWithinMinutes
    : (deadline !== null ? DEFAULT_NO_START_WITHIN_MINUTES : 0);
  // nit 3 (2026-09-21 review): a margin at or past the whole scheduled-
  // start-to-deadline span would eat this run's entire legitimate window --
  // `stopStartingAt` below would then fall at or before the scheduled start
  // itself, so this pass could never start a single session no matter how
  // on time it was.
  if (deadlineAt !== null) {
    const spanMs = deadlineSpanMs({ scheduledStart, deadlineAt, now });
    if (effectiveNoStartWithinMinutes * 60 * 1000 >= spanMs) fail('voice_conversation_list_nightly_no_start_within_exceeds_span');
  }
  // The instant this pass stops *starting* new sessions -- the deadline
  // itself when no margin applies, or that many minutes earlier. Checked in
  // place of the raw deadline everywhere a "may this pass start one more
  // session" question is asked; `deadlineAt` itself stays the value the
  // receipt reports as the actual configured deadline.
  const stopStartingAt = deadlineAt !== null
    ? new Date(Date.parse(deadlineAt) - effectiveNoStartWithinMinutes * 60 * 1000).toISOString() : null;
  const hardStopAt = deadlineAt !== null
    ? new Date(Date.parse(deadlineAt) + HARD_STOP_GRACE_MINUTES * 60 * 1000).toISOString() : null;
  // nit 4 (2026-09-21 review): a single session's worst case if every model
  // call in its budget actually spent the full per-call timeout -- not a
  // prediction of how long a session actually takes (most finish in a
  // fraction of this), a ceiling this pipeline's own config already commits
  // to. `null` when the pipeline config does not declare both numbers.
  const worstCaseSessionMinutes = Number.isFinite(config?.limits?.llm_calls) && Number.isFinite(config?.model?.timeout_ms)
    ? Math.round((config.limits.llm_calls * config.model.timeout_ms) / 60000) : null;

  // A defensive catch around the *call itself*, not just inside the default
  // implementation: an injected `runReconcileChain` (a test double, or a
  // future caller's own wiring) that throws instead of returning a
  // structured result must still be recorded in the receipt and still exit
  // non-zero -- never an uncaught rejection that skips the second write below
  // and leaves the chain's fate undocumented.
  const runChain = async chainDry => {
    try { return await runReconcileChain({ tablePath, rootTableSha256, toolsConfigPath,
      nightlyReceiptsDir: receiptsDir, reconcileReceiptsDir, linearRoot, mailRoots, questionsCap,
      dry: chainDry, now: clock(), log }); }
    catch (error) {
      return { status: 'FAILED', stage: 'chain',
        reason: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_chain_failed',
        reconcile: null, present: null };
    }
  };
  const deadlineReceiptBlock = extra => (deadline !== null
    ? { configured: deadline, scheduled_start: scheduledStart, at: deadlineAt,
      no_start_within_minutes: effectiveNoStartWithinMinutes, stop_starting_at: stopStartingAt,
      hard_stop_at: hardStopAt, worst_case_session_minutes: worstCaseSessionMinutes, ...extra }
    : null);
  const agingCheckFailed = error => ({ aging_out_soon: null,
    aged_out_unprocessed: { lookback_nights: null, count: null, by_date: [],
      error: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_aging_check_failed' } });

  if (dry) {
    let plan = [], planError = null;
    try { plan = buildSessionPlan({ io, sessionsAddress, targetDate }); }
    catch (error) {
      planError = typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_plan_failed';
      plan = [];
    }
    const rows = [];
    let backlog = null;
    if (planError === null) {
      try { backlog = backlogAgingReport({ io, tools, sessionsAddress, targetDate, plan, receiptsDir, now,
        configSha256, promptDigests }); }
      catch (error) { backlog = agingCheckFailed(error); }
      for (const { item, described } of classifyPlan({ io, tools, sessionsAddress, plan, maxSessions, configSha256, promptDigests })) {
        rows.push(described);
        const label = described.classification === 'run' ? 'would_run' : described.classification;
        log(`${item.date} ${item.session_id} ${label}${described.reason ? ` ${described.reason}` : ''}`);
      }
    }
    // A session `classifySession` could not even classify (an unreadable or
    // mismatched manifest, `session_manifest_unreadable`) is `failed` here
    // too, the same as a real pass would report it -- a --dry preview that
    // hides that behind DRY/exit 0 is not a preview a preflight can trust.
    const anyRowFailed = rows.some(row => row.classification === 'failed');
    // The chain previews too (both sub-calls in their own `--dry`), against
    // whatever this receipts directory already holds from a prior real
    // night -- this run wrote nothing new to it, `--dry` never does.
    const chain = chainReconcile ? await runChain(true) : null;
    const chainIsFailure = chain !== null && chain.status !== 'OK' && chain.status !== 'DRY' && chain.status !== 'LOCK_HELD';
    return { status: planError !== null || anyRowFailed || chainIsFailure ? 'FAILED' : 'DRY',
      lock: null, sessions: rows, receipt: null,
      totals: { considered: rows.length, would_run: rows.filter(row => row.classification === 'run').length,
        ...totalsFor(rows, 'classification', 'skipped_short') },
      plan: { candidates: plan.length, processed: rows.length, max_sessions: maxSessions, error: planError },
      deadline: deadlineReceiptBlock({}), backlog, chain };
  }

  // S5-1 (2026-09-21 review): derived from this run's own deadline
  // configuration, not the fixed 3-hour default, so a legitimately long
  // (deadline + grace + chain) hold of this lock is never mistaken for
  // abandoned by a second, manual invocation.
  const staleLockMs = staleLockMsFor({ deadline, scheduledStart, deadlineAt, now, chainReconcile });
  const lock = acquireLock(receiptsDir, now, staleLockMs);
  if (lock.held) {
    log(`lock held, skipping this night (age_ms=${lock.age_ms ?? 'unknown'})`);
    return { status: 'LOCK_HELD', lock, sessions: [], receipt: null };
  }

  let plan = [], planError = null, deadlineStopped = false, attemptedCount = 0, sessionsLeft = 0;
  const rows = [];
  const warnings = [];
  let backlog = null;
  // Held across the chain (S5, 2026-09-21 review), not just the loop below:
  // releasing this lock before the chain runs would let a second nightly run
  // start real card-generation work while this pass's chain is still
  // reading/writing, which is exactly the race that made a concurrent
  // reconcile's own `LOCK_HELD` look like a spurious failure of this run.
  try {
    try { plan = buildSessionPlan({ io, sessionsAddress, targetDate }); }
    catch (error) {
      planError = typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_plan_failed';
      plan = [];
      log(`sessions plan unreadable: ${planError}`);
    }
    if (planError === null) {
      try { backlog = backlogAgingReport({ io, tools, sessionsAddress, targetDate, plan, receiptsDir, now,
        configSha256, promptDigests }); }
      catch (error) { backlog = agingCheckFailed(error); }
      // nit 4 (2026-09-21 review): a static fact of this pipeline's own
      // config, checked once regardless of what tonight's plan turns out to
      // hold -- not a per-session measurement, so it belongs here rather
      // than inside the loop below.
      if (deadline !== null && worstCaseSessionMinutes !== null
        && worstCaseSessionMinutes > effectiveNoStartWithinMinutes + HARD_STOP_GRACE_MINUTES) {
        warnings.push({ code: 'worst_case_session_exceeds_margin',
          detail: `a session's worst case (${worstCaseSessionMinutes}m, from pipeline limits.llm_calls x `
            + `model.timeout_ms) exceeds no_start_within (${effectiveNoStartWithinMinutes}m) + hard-stop grace `
            + `(${HARD_STOP_GRACE_MINUTES}m) -- a session starting right at the margin could still run well `
            + 'past the hard stop' });
      }
      const describedRows = classifyPlan({ io, tools, sessionsAddress, plan, maxSessions, configSha256, promptDigests });
      for (let index = 0; index < describedRows.length; index++) {
        const { item, described } = describedRows[index];
        if (described.classification !== 'run') {
          const row = { session_id: item.session_id, date: item.date, title: described.title,
            duration_seconds: described.duration_seconds,
            outcome: described.classification, reason: described.reason, llm_calls: null, seconds: null,
            run_id: described.existing_run_id, verified: described.classification === 'skipped_existing' ? true : null };
          rows.push(row);
          log(`${item.date} ${row.session_id} ${row.outcome}${row.reason ? ` ${row.reason}` : ''}`);
          continue;
        }
        // Checked only here, right before this pass would actually start a
        // session's own card generation (the model-calling step) -- never
        // during classification, which is cheap file reads regardless of how
        // close the deadline is. A stop here leaves this row (and every plan
        // entry after it) out of `rows` entirely, not marked `failed` or
        // `skipped` -- the session still has no verified run, so the plan's
        // own `classifySession` offers it again next time, unprompted.
        // `stopStartingAt` folds in the start margin (S4): the same stop
        // fires that many minutes early when one is configured.
        if (stopStartingAt !== null && Date.parse(clock()) >= Date.parse(stopStartingAt)) {
          deadlineStopped = true;
          // N1 (2026-09-21 review): counts only the classified rows that
          // still needed a run, not every remaining plan entry -- a
          // `skipped_existing`/`skipped_short` row left uniterated is not
          // pending work.
          sessionsLeft = describedRows.slice(index).filter(entry => entry.described.classification === 'run').length;
          log(`deadline ${deadline} (margin ${effectiveNoStartWithinMinutes}m) reached before ${item.session_id}; stopping for tonight`);
          break;
        }
        attemptedCount += 1;
        let row;
        try {
          const ran = await runSession({ io, tools, config, prompts, promptDigests, configSha256, sessionId: item.session_id });
          // A pipeline pass that finished without throwing but did not come
          // out `verified` (a budget ran out, a check failed) is not the same
          // outcome as one that did -- counting it as plain `ran` let a night
          // with real, unresolved work in it still report OK.
          row = { session_id: item.session_id, date: item.date, title: described.title,
            duration_seconds: described.duration_seconds,
            outcome: ran.verified === true ? 'ran' : 'ran_unverified', reason: null,
            llm_calls: Number.isFinite(ran.llm_calls) ? ran.llm_calls : null,
            seconds: Number.isFinite(ran.elapsed_ms) ? Math.round(ran.elapsed_ms / 1000) : null,
            run_id: ran.run_id ?? null, verified: ran.verified === true };
        } catch (error) {
          row = { session_id: item.session_id, date: item.date, title: described.title,
            duration_seconds: described.duration_seconds,
            outcome: 'failed', reason: typeof error?.code === 'string' ? error.code : 'voice_conversation_list_nightly_run_failed',
            llm_calls: null, seconds: null, run_id: null, verified: null };
        }
        // S4 fallback: this pass cannot interrupt `runSession` mid-flight (see
        // this function's own doc), so an overrun is recorded, never
        // abandoned -- the session's own outcome above is untouched.
        if (hardStopAt !== null && Date.parse(clock()) >= Date.parse(hardStopAt)) {
          row.overran_hard_stop = true;
          warnings.push({ code: 'session_overran_hard_stop', session_id: item.session_id,
            detail: `finished past the hard stop (deadline ${deadlineAt} + ${HARD_STOP_GRACE_MINUTES}m grace); `
              + 'the pipeline cannot be interrupted cleanly, so it ran to completion instead of being abandoned' });
        }
        rows.push(row);
        log(`${item.date} ${row.session_id} ${row.outcome}${row.reason ? ` ${row.reason}` : ''}`
          + ` calls=${row.llm_calls ?? '-'} sec=${row.seconds ?? '-'}`);
      }
    }

    const failed = rows.filter(row => row.outcome === 'failed').length;
    const ranUnverified = rows.filter(row => row.outcome === 'ran_unverified').length;
    // R1a (2026-09-21 review): a run that never got to start a single session
    // because the (possibly margin-anchored) deadline had already passed is
    // its own status, not `OK` -- `OK`/exit 0 is what Task Scheduler reads as
    // "ran fine", which a night that did zero real work is not, however
    // clean the reason. A genuine failure (an unreadable plan, or a session
    // classification failure that happened before the deadline was even
    // checked) still outranks it.
    const cardGenStatus = planError !== null || failed > 0 || ranUnverified > 0 ? 'FAILED'
      : (deadlineStopped && attemptedCount === 0) ? 'SKIPPED_PAST_DEADLINE' : 'OK';
    const baseReceipt = { schema_version: NIGHTLY_RECEIPT_SCHEMA, ran_at: now, target_date: targetDate, dry: false,
      lock: { reclaimed_stale: lock.reclaimed === true,
        previous_lock: lock.reclaimed === true ? (lock.previous ?? null) : null,
        previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
      plan: { candidates: plan.length, processed: rows.length, max_sessions: maxSessions, error: planError },
      deadline: deadlineReceiptBlock({ stopped: deadlineStopped, sessions_done: rows.length, sessions_left: sessionsLeft }),
      backlog, sessions: rows, warnings,
      totals: { ran: rows.filter(row => row.outcome === 'ran').length, ran_unverified: ranUnverified,
        ...totalsFor(rows, 'outcome', 'skipped_short'),
        llm_calls: rows.reduce((sum, row) => sum + (row.llm_calls ?? 0), 0),
        seconds: rows.reduce((sum, row) => sum + (row.seconds ?? 0), 0) },
      // S1 (2026-09-21 review): a placeholder, not `null`, when chaining --
      // `null` here is indistinguishable from "this night never chained at
      // all", so a crash mid-chain (between this write and the next one)
      // would read as a clean, non-chained night rather than an interrupted
      // one. Overwritten below with the real result once the chain finishes.
      chain: chainReconcile ? { status: 'RUNNING', started_at: clock() } : null,
      // No distinct PARTIAL status: this receipt's only consumers today are the
      // registrar's preflight gate and a human reading the receipt, and both
      // already know what to do with FAILED. A PARTIAL value would need that
      // (unowned by this change) gate updated to treat it as "do not register"
      // too, which is exactly the registrar edit this fix does not make -- so
      // an unverified run, or a deadline stop by itself, folds into OK/FAILED/
      // SKIPPED_PAST_DEADLINE the same way a full clean night or a real
      // failure already does; a deadline stop is never by itself a reason for
      // FAILED (`SKIPPED_PAST_DEADLINE` is not `FAILED`).
      status: cardGenStatus };
    const receiptPath = path.join(receiptsDir, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`);
    mkdirSync(receiptsDir, { recursive: true });
    atomicWriteFileSync(receiptPath, encode(baseReceipt));
    if (!chainReconcile) return { status: baseReceipt.status, lock, sessions: rows, receipt: baseReceipt };

    // The chain runs after this receipt is already on disk (reconcile's own
    // `--nightly-receipts` backlog mode reads tonight's sessions from exactly
    // this file) -- but still under this function's own lock (S5; see the
    // comment above the lock's own `try`). Its outcome is folded into the
    // same receipt file with a second atomic write, never a second file, so
    // a failure there is recorded in the one receipt this night produced,
    // not a partial extra artifact next to it.
    const chain = await runChain(false);
    const chainIsFailure = chain.status !== 'OK' && chain.status !== 'DRY' && chain.status !== 'LOCK_HELD';
    const receipt = { ...baseReceipt, chain, status: chainIsFailure ? 'FAILED' : baseReceipt.status };
    atomicWriteFileSync(receiptPath, encode(receipt));
    return { status: receipt.status, lock, sessions: rows, receipt };
  } finally {
    // S5-1: only removes the lock if it is still exactly the one this run
    // itself wrote (`acquireLock` above always used this same `now` as
    // `started_at`) -- if the derived `staleLockMs` still turned out too
    // short and someone else's run already reclaimed it, that live lock is
    // left alone rather than deleted out from under it.
    releaseLock(receiptsDir, { pid: process.pid, started_at: now });
  }
}

// -------------------------------------------------------------------- CLI
// Same shape as `estate_voice_card_reconcile.mjs`'s own local `options()`:
// repeated flags accumulate into an array (`listOf`) rather than last-wins,
// which is what `--mail-root` (chain pass-through, repeatable) needs. Every
// existing single-value flag keeps behaving exactly as before -- only a flag
// actually repeated on the command line is affected.
function options(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    const value = next === undefined || next.startsWith('--') ? true : (index++, next);
    if (flags.has(name)) flags.set(name, [...[flags.get(name)].flat(), value]);
    else flags.set(name, value);
  }
  return flags;
}
const listOf = value => (value === undefined || value === true ? [] : [value].flat().map(String));

export async function runNightlyCli(argv, { runSession, runReconcileChain, clock, now, log: onLine } = {}) {
  const flags = options(argv);
  const tablePath = String(flags.get('root-table') ?? '');
  if (!tablePath) fail('voice_conversation_list_nightly_root_table_required');
  const expectedRootTableSha256 = flags.get('root-table-sha256');
  const resolvedRootTableSha256 = typeof expectedRootTableSha256 === 'string' ? expectedRootTableSha256
    : sha256(readFileSync(tablePath));
  const rootTable = readRootTable({ tablePath, expectedSha256: resolvedRootTableSha256 });
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
  // S3 (2026-09-21 review): `--deadline`/`--scheduled-start`/`--no-start-
  // within` given with no value (the `options()` parser then hands back
  // `true`) or repeated (an array) must fail loud, the same as `--max-
  // sessions`/`--questions-cap` already do -- silently falling back to
  // "disabled" here is exactly how a deadline stops applying without anyone
  // noticing.
  const deadlineFlag = flags.get('deadline');
  let deadline = null;
  if (deadlineFlag !== undefined) {
    if (typeof deadlineFlag !== 'string') fail('voice_conversation_list_nightly_deadline_usage_invalid');
    deadline = deadlineFlag;
  }
  // nit 1 (2026-09-21 review): format-checked here even when `--deadline` is
  // not given (a lone, malformed `--scheduled-start` used to pass through
  // silently unvalidated, since `nextDeadlineInstant` -- the only other place
  // that checks its shape -- is never called without a deadline), and both
  // this and `--no-start-within` are refused outright without `--deadline`
  // (neither has any effect without one, so accepting them silently is its
  // own way of hiding a mistake).
  const scheduledStartFlag = flags.get('scheduled-start');
  let scheduledStart = null;
  if (scheduledStartFlag !== undefined) {
    if (typeof scheduledStartFlag !== 'string') fail('voice_conversation_list_nightly_scheduled_start_usage_invalid');
    if (!DEADLINE_HHMM.test(scheduledStartFlag)) fail('voice_conversation_list_nightly_scheduled_start_invalid');
    scheduledStart = scheduledStartFlag;
  }
  const noStartWithinFlag = flags.get('no-start-within');
  let noStartWithinMinutes = null;
  if (noStartWithinFlag !== undefined) {
    if (typeof noStartWithinFlag !== 'string') fail('voice_conversation_list_nightly_no_start_within_usage_invalid');
    // nit 2: `Number('')` is `0`, not `NaN` -- an empty value must not
    // silently become "no margin" instead of a usage error.
    if (!/^\d+$/.test(noStartWithinFlag)) fail('voice_conversation_list_nightly_no_start_within_invalid');
    noStartWithinMinutes = Number(noStartWithinFlag);
  }
  if (deadline === null && scheduledStart !== null) fail('voice_conversation_list_nightly_scheduled_start_requires_deadline');
  if (deadline === null && noStartWithinMinutes !== null) fail('voice_conversation_list_nightly_no_start_within_requires_deadline');

  const chainReconcile = flags.get('chain-reconcile') === true;
  const reconcileReceiptsFlag = flags.get('reconcile-receipts');
  const reconcileReceiptsDir = typeof reconcileReceiptsFlag === 'string' ? reconcileReceiptsFlag : null;
  if (chainReconcile && !reconcileReceiptsDir) fail('voice_conversation_list_nightly_reconcile_receipts_required');
  const linearRootFlag = flags.get('linear-root');
  const linearRoot = typeof linearRootFlag === 'string' ? linearRootFlag : null;
  const mailRoots = listOf(flags.get('mail-root'));
  const questionsCapFlag = flags.get('questions-cap');
  let questionsCap = null;
  if (questionsCapFlag !== undefined) {
    const parsed = typeof questionsCapFlag === 'string' ? Number(questionsCapFlag) : NaN;
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      fail('voice_conversation_list_nightly_questions_cap_invalid');
    }
    questionsCap = parsed;
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
    deadline, scheduledStart, noStartWithinMinutes, chainReconcile, tablePath,
    rootTableSha256: resolvedRootTableSha256, toolsConfigPath: toolsPath,
    reconcileReceiptsDir, linearRoot, mailRoots, questionsCap,
    ...(runSession ? { runSession } : {}), ...(runReconcileChain ? { runReconcileChain } : {}),
    ...(clock ? { clock } : {}), log });
  return { result, lines, targetDate };
}

// Exit codes: 0 OK, 2 FAILED (a real problem -- an unreadable plan, a session
// failure, an unverified run, or a chain failure), 3 LOCK_HELD (another
// nightly run already holds this receipts directory's lock), 4
// SKIPPED_PAST_DEADLINE (R1a, 2026-09-21 review -- the deadline had already
// passed before this pass started a single session; distinct from both 0,
// which Task Scheduler and a watcher would read as "ran fine", and 2, since
// nothing actually failed). R1a-1 (2026-09-21 review): this process's own
// exit code reaching Task Scheduler at all is not automatic -- it depends on
// the registrar's hidden-launcher command line actually propagating it
// (`powershell.exe -Command "& node ...; exit $LASTEXITCODE"`,
// `ops/register-voice-conversation-list-task.ps1`'s `$CommandScript`; without
// that trailing `exit`, PowerShell's own `-Command` exit code does not carry
// the native command's code at all, measured end to end through the hidden
// launcher to collapse every non-zero code here to a bare 1). This file has
// no way to verify that from its own side; a receipt-reading watcher (this
// receipt's own `status` field) remains the one signal this file itself can
// vouch for directly.
async function main() {
  const { result } = await runNightlyCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
  if (result.status === 'LOCK_HELD') return 3;
  if (result.status === 'SKIPPED_PAST_DEADLINE') return 4;
  return result.status === 'FAILED' ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[voice-conversation-list-nightly] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
