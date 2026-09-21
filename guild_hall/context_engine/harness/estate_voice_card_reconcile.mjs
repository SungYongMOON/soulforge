// Dev harness and lane entry point: the first slice of VOICE_RECORDING_LIBRARY_V0.md's
// "2026-09-20 운영 방침" -- for one night's conversation-list cards, look for
// mail and Linear corroboration from the target day plus one day either side,
// and turn each card segment into a classification
// (`provisional`/`candidate`/`exception`/`skip`, via
// `src/runtime/voice_attribution_policy.mjs`).
//
// What it writes and where:
//   - the voice route ledger (`harness/voice_routes.mjs`, address
//     `control_root/voice-routes`) gets a `candidate`-status row per non-`skip`
//     segment, through `voice_route_cli.mjs`'s own `import` and `set` commands
//     (never a status this harness invents, never `confirmed`) -- this harness
//     never writes the ledger file itself.
//   - the receipts directory gets one `soulforge.voice_card_reconcile_receipt.v2`
//     JSON naming every session and segment this pass looked at, its
//     classification, the mail/Linear refs (ids only, never body text or
//     transcript) that cued it, and an `exception_review` array: the
//     morning-briefing input, "어제 애매한 것 N건".
//
// `provisional` and `exception` are receipt-only labels. The ledger's
// `project_candidates[].basis` is a free-text field (already used that way by
// the pipeline's own import, which writes `strength=...` into it) and this pass
// writes its classification into that same free text as a trace, but the
// ledger's `status` enum never grows a fifth value for either of them: per
// VOICE_RECORDING_LIBRARY_V0.md, an extra ledger field is only worth adding once
// the schema is asked to hold one, and until then the receipt is the record of
// provisional/exception, not the ledger.
//
// A segment already `confirmed` by a person is never touched -- this pass reads
// the ledger before writing (in `--dry` too, so its `already_confirmed` total
// is honest, and a `--dry` pass that could not even read a session's ledger
// reports `FAILED` rather than a clean preview) and skips any segment a person
// has already decided. A project candidate a person already wrote by hand --
// `set --project X --basis "..."`, left at `candidate` rather than confirmed --
// is also left alone: this pass only ever overwrites a candidate whose
// existing basis is machine-written (`reconcile:...`, this pass's own, or
// `voice_conversation_list:...`, `import`'s), and records
// `skipped_human_candidate` or `set_partial_human_protected` rather than
// silently replacing it. If the existing ledger cannot be read at all, the
// session is aborted as `failed` (`ledger_unreadable`) rather than treated as
// having nothing confirmed.
//
// Two of a card's own project candidates both marked `strong` for different
// projects is a conflict this pass does not resolve
// (`src/runtime/voice_attribution_policy.mjs`'s `strong_conflict`): the
// segment becomes `exception` and this pass writes only `status: candidate`,
// leaving whatever project candidates the ledger already held untouched.
//
// Mail and Linear are read directly, not through a source-document admission
// grant: this pass is building a corroboration signal for a nightly pass, not
// admitting a document into a project's graph. The address convention
// (`--mail-root`/`--linear-root` as alias addresses, one root per mail source,
// one root holding a Linear custody folder per team) matches
// `harness/estate_inventory.mjs`, which reads the same two stores the same way.
//
// usage:
//   node estate_voice_card_reconcile.mjs --root-table <file> --tools-config <file>
//        --receipts <dir> [--date YYYY-MM-DD] [--mail-root <alias address>]...
//        [--linear-root <alias address>] [--sessions-address <alias address>]
//        [--root-table-sha256 sha256:...] [--now <iso>] [--dry]
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync,
  writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { classifyAttribution, linearCorroborates, mailCorroborates, projectAliasTerms,
  VOICE_ATTRIBUTION_POLICY_VERSION } from '../src/runtime/voice_attribution_policy.mjs';
import { readVoiceSession } from '../src/runtime/voice_session_read.mjs';
import { NIGHTLY_RECEIPT_SCHEMA, NIGHTLY_RECEIPT_SCHEMA_V1, defaultTargetDate, seoulDateFor, shiftDate }
  from './voice_conversation_list_nightly.mjs';
import { readRun } from './voice_conversation_list_cli.mjs';
import { VOICE_SESSIONS_ADDRESS } from './voice_segment_drafts.mjs';
import { latestPerObject, linearProjectsFor } from './estate_inventory.mjs';
import { readLedgerFile, runVoiceRouteCli } from './voice_route_cli.mjs';
import { VOICE_ROUTE_LIMITS, VOICE_ROUTES_ADDRESS } from './voice_routes.mjs';

// v2 (fresh review, same slice, pre-merge): the receipt shape changed
// (`reconciled_runs`, `not_considered`, `plan.mode`/`plan.dates`/
// `plan.date_derivation`, `target_date` nullable in backlog mode) enough
// that a v1-shaped body should not be read as v2 by anything that checks
// this string. No known external consumer reads this schema string yet.
export const RECONCILE_RECEIPT_SCHEMA = 'soulforge.voice_card_reconcile_receipt.v2';
// Who this pass writes the ledger as. Not a person: `confirm` stays a person's
// word, and this actor id only ever reaches `set`/`import`'s `judged_by`.
export const RECONCILE_ACTOR = 'actor:context-engine:voice-card-reconcile-v0';
// Independent of the nightly conversation-list lane's own lock: the two lanes
// read the same sessions but write different stores, and one running late must
// not block the other.
export const RECONCILE_STALE_LOCK_MS = 3 * 60 * 60 * 1000;
const LOCK_FILE_NAME = 'reconcile.lock';
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
// R3: the content-check gate's own read bound. `readVoiceSession` clamps any
// one call far below this (its own `max_characters_per_call`); this pass
// pages through `next_window` to gather more, but stops here rather than
// walking an entire multi-hour recording's transcript one page at a time for
// a single segment's worth of comparison text.
const MAX_TRANSCRIPT_WINDOW_CHARS = 200000;
// A hard ceiling on how many pages one session's read is ever allowed to take
// -- not expected to bind before MAX_TRANSCRIPT_WINDOW_CHARS does, but a
// caller that somehow returned `next_window` forever must not loop this pass
// forever either.
const MAX_TRANSCRIPT_WINDOW_PAGES = 64;
// A single JSONL mail-event line this large is not a normal row; it is
// skipped rather than parsed, so one corrupt or adversarial line cannot pull
// an unbounded string into memory.
const MAX_MAIL_LINE_BYTES = 8 * 1024 * 1024;
const MAIL_EVENT_SCHEMA = 'email.fetch.event.v1';
// `--now` may come from a scheduler or a human; it is never a path.
const PATH_SEPARATOR = /[\\/]/u;

export class VoiceCardReconcileError extends Error {
  constructor(code) { super(code); this.name = 'VoiceCardReconcileError'; this.code = code; }
}
const fail = code => { throw new VoiceCardReconcileError(code); };
const encode = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

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

// ------------------------------------------------------------------- lock
// A small, deliberate copy of `voice_conversation_list_nightly.mjs`'s lock
// shape under this lane's own file name: the two lanes must never share one
// lock file, since blocking on each other is not this lane's job.
export function acquireLock(receiptsDir, now) {
  mkdirSync(receiptsDir, { recursive: true });
  const lockFile = path.join(receiptsDir, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    const ageMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs <= RECONCILE_STALE_LOCK_MS) return { held: true, existing, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { fail(error?.code ?? 'voice_card_reconcile_lock_unavailable'); }
    try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' }); }
    catch (error) {
      if (error?.code === 'EEXIST') return { held: true, existing, age_ms: ageMs };
      fail(error?.code ?? 'voice_card_reconcile_lock_unavailable');
    }
    return { held: false, reclaimed: true, previous: existing, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encode({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) {
    if (error?.code === 'EEXIST') return { held: true, existing: null, age_ms: 0 };
    fail(error?.code ?? 'voice_card_reconcile_lock_unavailable');
  }
  return { held: false, reclaimed: false, previous: null, age_ms: null };
}

export function releaseLock(receiptsDir) {
  try { rmSync(path.join(receiptsDir, LOCK_FILE_NAME), { force: true }); } catch { /* nothing to release */ }
}

// -------------------------------------------------------------- sessions
export class DirListError extends Error {
  constructor(code, causeCode = null) { super(code); this.name = 'DirListError'; this.code = code; this.cause_code = causeCode; }
}

/**
 * Directory names directly below one address. A directory that simply does
 * not exist yet (`ENOENT` on the `readdir`) lists as empty -- that is the
 * ordinary shape of "nothing here yet" (no sessions today, no mail filed for
 * this source yet). Anything else -- the alias itself unresolvable (a wrong
 * `--sessions-address`/`--mail-root`/`--linear-root`), a permission refusal,
 * the address renamed to a file -- is not silently read as "empty"; it is
 * thrown, the same distinction `voice_conversation_list_nightly.mjs`'s own
 * `listDirNames` already makes for exactly this reason.
 */
function listDirNamesOrThrow(io, address) {
  let where;
  try { where = io.path(address, true); }
  catch (error) { throw new DirListError('voice_card_reconcile_alias_unresolvable', error?.code ?? null); }
  let entries;
  try { entries = readdirSync(where, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new DirListError('voice_card_reconcile_dir_unreadable', error?.code ?? null);
  }
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

/**
 * The same listing, for a source this pass treats as optional corroboration
 * input rather than core session data: a bad `--mail-root`/`--linear-root`
 * value, or one team's `projects`/`issues` folder gone missing, does not stop
 * the night -- but it is not silently read as "checked, found nothing"
 * either. `unreadable` collects `{ address, code, cause_code }` for the
 * receipt's `sources_unreadable`, so a reader can tell "no exceptions" from
 * "this source was never actually read".
 */
function listDirNamesReporting(io, address, unreadable) {
  try { return listDirNamesOrThrow(io, address); }
  catch (error) { unreadable.push({ address, code: error.code, cause_code: error.cause_code ?? null }); return []; }
}

/** File (not directory) names directly below one address, with the same ENOENT-benign, else-reported shape. */
function listFileNamesReporting(io, address, unreadable) {
  let where;
  try { where = io.path(address, true); }
  catch (error) {
    unreadable.push({ address, code: 'voice_card_reconcile_alias_unresolvable', cause_code: error?.code ?? null });
    return [];
  }
  try {
    return readdirSync(where, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    unreadable.push({ address, code: 'voice_card_reconcile_dir_unreadable', cause_code: error?.code ?? null });
    return [];
  }
}

// -------------------------------------------------------------- S2-5 backlog
// A session_id may not contain this character (safe-segment id patterns
// elsewhere in this file are alphanumerics, '.', '_', '-' only), so it cannot
// collide with either half of the pair it separates.
const RECONCILED_PAIR_SEP = String.fromCharCode(31);
const reconciledPairKey = (sessionId, runId) => `${sessionId}${RECONCILED_PAIR_SEP}${runId}`;

// A PLAUD session id's own leading `YYYYMMDD_` (every real session id in this
// estate carries one) read as a date. Used only as a fallback for a nightly
// receipt session row with no `date` of its own (R2) -- a receipt written
// before that field existed.
const SESSION_ID_DATE_PREFIX = /^(\d{4})(\d{2})(\d{2})_/u;
const dateFromSessionId = sessionId => {
  const match = SESSION_ID_DATE_PREFIX.exec(sessionId);
  return match === null ? null : `${match[1]}-${match[2]}-${match[3]}`;
};

/**
 * Every session_id a nightly-lane receipt in `nightlyReceiptsDir` (the same
 * plain directory path the nightly lane's own `--receipts` names -- not an
 * `io` alias address, since the nightly lane's receipts are not addressed
 * through the root table either) reported settled, across every receipt file
 * found there, deduplicated. `--date` remains this harness's fallback/manual
 * mode; this is the alternative session source `--nightly-receipts` selects,
 * reaching whatever the nightly lane actually finished (any date, any
 * backlog night) rather than only today's own date folder.
 *
 * "Settled" (S4) is outcome `ran` or `skipped_existing`, either way with
 * `verified: true`: a `skipped_existing` row's card is exactly as usable as
 * one this pass freshly ran, and excluding it meant a session whose original
 * `ran` receipt had aged out (or was never in this directory to begin with)
 * was never reconciled at all. The pair-dedupe against this harness's own
 * past receipts (`readAlreadyReconciledPairs`) is what stops rework, not a
 * narrower candidate set here. Every other row (short, absent, failed,
 * unverified) is named in the returned `notConsidered`, with its reason,
 * unless some other receipt in this same directory shows that same
 * session_id settled -- receipt filenames sort chronologically (the nightly
 * lane's own zero-padded timestamp, like this harness's), so the last row
 * seen for a session_id is its most recent outcome.
 *
 * Each settled row's own `date` (R2) -- not the receipt's `target_date` --
 * decides which day's mail/Linear window it needs: a backlog receipt's
 * sessions can span up to the nightly lane's own `BACKLOG_WINDOW_DAYS`
 * earlier dates than the night the receipt itself ran on. A row from before
 * `date` existed falls back to `dateFromSessionId`; `derivation` counts which
 * source every settled row's date actually came from, for the receipt to
 * show its work.
 *
 * A directory that simply does not exist yet (the nightly lane has never run)
 * plans zero sessions, the same as an absent date folder does; any other
 * read failure is a real configuration error and is thrown.
 */
function collectBacklogSessions(nightlyReceiptsDir) {
  let names;
  try { names = readdirSync(nightlyReceiptsDir); }
  catch (error) {
    if (error?.code === 'ENOENT') {
      return { sessionIds: [], dates: [], derivation: { declared: 0, session_id_prefix: 0, undated: 0 },
        notConsidered: [] };
    }
    throw new DirListError('voice_card_reconcile_nightly_receipts_unreadable', error?.code ?? null);
  }
  const ids = new Set(), dates = new Set();
  const derivation = { declared: 0, session_id_prefix: 0, undated: 0 };
  const unsettled = new Map();
  for (const name of names.filter(entry => entry.endsWith('.json')).sort()) {
    let body;
    try { body = JSON.parse(readFileSync(path.join(nightlyReceiptsDir, name), 'utf8')); } catch { continue; }
    // nit 5 (2026-09-21 review): the nightly receipt schema moved to v2
    // (`status` gained `SKIPPED_PAST_DEADLINE`, and the receipt gained
    // `chain`/`backlog`/`warnings`) -- this reader only ever touches the
    // unchanged `sessions` array below, so both versions are accepted
    // rather than this pass silently going blind to every v2 receipt.
    if ((body?.schema_version !== NIGHTLY_RECEIPT_SCHEMA && body?.schema_version !== NIGHTLY_RECEIPT_SCHEMA_V1)
      || !Array.isArray(body.sessions)) continue;
    for (const row of body.sessions) {
      if (typeof row?.session_id !== 'string') continue;
      const settled = (row.outcome === 'ran' || row.outcome === 'skipped_existing') && row.verified === true;
      if (!settled) {
        unsettled.set(row.session_id, row.reason ?? row.outcome ?? 'nightly_lane_reason_unknown');
        continue;
      }
      ids.add(row.session_id);
      unsettled.delete(row.session_id);
      let date = DATE_DIR.test(row.date ?? '') ? row.date : null;
      if (date !== null) derivation.declared += 1;
      else {
        date = dateFromSessionId(row.session_id);
        if (date !== null) derivation.session_id_prefix += 1; else derivation.undated += 1;
      }
      if (date !== null) dates.add(date);
    }
  }
  const notConsidered = [...unsettled.entries()].map(([session_id, reason]) => ({ session_id, reason }))
    .sort((a, b) => a.session_id.localeCompare(b.session_id));
  return { sessionIds: [...ids].sort(), dates: [...dates].sort(), derivation, notConsidered };
}

// A compact cache of every `(session_id, run_id)` pair this harness has ever
// finished reconciling, so a backlog pass across months of nightly history
// does not have to re-parse every past receipt just to skip what it already
// did. Bounded (S3): only the newest `MAX_RECONCILED_INDEX_PAIRS` are kept,
// oldest evicted first, and `evicted_total` (cumulative, carried forward on
// every write) says how many across this index's whole life -- an evicted
// pair is not lost in any harmful sense, it is simply reconciled again the
// next time its session_id turns up in the nightly lane's receipts.
export const RECONCILED_INDEX_FILE = 'reconciled_runs.index.json';
export const RECONCILED_INDEX_SCHEMA = 'soulforge.voice_card_reconcile_runs_index.v1';
export const MAX_RECONCILED_INDEX_PAIRS = 5000;

function readReconciledIndex(receiptsDir) {
  let body;
  try { body = JSON.parse(readFileSync(path.join(receiptsDir, RECONCILED_INDEX_FILE), 'utf8')); }
  catch { return null; }
  if (body?.schema_version !== RECONCILED_INDEX_SCHEMA || !Array.isArray(body.pairs)) return null;
  const pairs = body.pairs.filter(row => typeof row?.session_id === 'string' && typeof row?.run_id === 'string'
    && typeof row?.recorded_at === 'string');
  return { pairs, evicted_total: Number.isSafeInteger(body.evicted_total) ? body.evicted_total : 0 };
}

/**
 * Every `(session_id, run_id)` pair a past run of *this* harness already
 * recorded as reconciled. Used only in `--nightly-receipts` backlog mode:
 * reconcile re-evaluates today's own date-folder sessions every night
 * regardless (mail arriving, a person confirming or withdrawing something
 * changes what the right answer is even for the same run_id), but a backlog
 * scan across months of nightly history must not silently redo everything it
 * already finished every single pass -- exactly the pairs a person or the
 * nightly lane has not touched since are skipped, and a session whose run_id
 * changed (S2-1 staleness, a fresh transcript, ...) is reconciled again
 * because its new run_id was never recorded.
 *
 * Reads the compact index above (S3) when one is present and this harness
 * can make sense of it; falls back once to a full scan of every past receipt
 * in `receiptsDir` otherwise (a directory with no index yet, or one this
 * harness does not recognise) -- slower, but the same pairs the index would
 * have reported, ignoring any file that does not declare this harness's own
 * schema. `writeReconciledIndex` always rewrites the index after a non-dry
 * pass, index-derived or freshly scanned, so the slow path is paid at most
 * once per directory.
 */
function readAlreadyReconciledPairs(receiptsDir) {
  const index = readReconciledIndex(receiptsDir);
  if (index !== null) return { pairs: index.pairs, evictedTotal: index.evicted_total, fromIndex: true };
  const pairs = [];
  let names;
  try { names = readdirSync(receiptsDir); } catch { return { pairs: [], evictedTotal: 0, fromIndex: false }; }
  for (const name of names.filter(entry => entry.endsWith('.json') && entry !== RECONCILED_INDEX_FILE)) {
    let body;
    try { body = JSON.parse(readFileSync(path.join(receiptsDir, name), 'utf8')); } catch { continue; }
    if (body?.schema_version !== RECONCILE_RECEIPT_SCHEMA || !Array.isArray(body.reconciled_runs)) continue;
    const recordedAt = typeof body.ran_at === 'string' ? body.ran_at : '1970-01-01T00:00:00.000Z';
    for (const pair of body.reconciled_runs) {
      if (typeof pair?.session_id === 'string' && typeof pair?.run_id === 'string') {
        pairs.push({ session_id: pair.session_id, run_id: pair.run_id, recorded_at: recordedAt });
      }
    }
  }
  return { pairs, evictedTotal: 0, fromIndex: false };
}

/**
 * Rewrites the pair index: `priorPairs` (whatever `readAlreadyReconciledPairs`
 * found, index or full scan) plus this pass's own newly-reconciled pairs,
 * deduplicated by `(session_id, run_id)` -- a repeated pair keeps the newer
 * `recorded_at` -- then bounded to the newest `MAX_RECONCILED_INDEX_PAIRS`.
 * Called after every non-dry backlog pass, even one that reconciled nothing
 * new, so a directory that only ever had a full scan gets an index from then
 * on. Written through a staging file and rename, the same as the ledger.
 */
function writeReconciledIndex(receiptsDir, priorPairs, priorEvictedTotal, additions, now) {
  const byKey = new Map(priorPairs.map(row => [reconciledPairKey(row.session_id, row.run_id), row]));
  for (const pair of additions) {
    byKey.set(reconciledPairKey(pair.session_id, pair.run_id),
      { session_id: pair.session_id, run_id: pair.run_id, recorded_at: now });
  }
  const ordered = [...byKey.values()].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)
    || reconciledPairKey(a.session_id, a.run_id).localeCompare(reconciledPairKey(b.session_id, b.run_id)));
  const evictedThisWrite = Math.max(0, ordered.length - MAX_RECONCILED_INDEX_PAIRS);
  const kept = evictedThisWrite > 0 ? ordered.slice(evictedThisWrite) : ordered;
  const body = { schema_version: RECONCILED_INDEX_SCHEMA, updated_at: now, pairs: kept,
    evicted_total: priorEvictedTotal + evictedThisWrite };
  mkdirSync(receiptsDir, { recursive: true });
  const file = path.join(receiptsDir, RECONCILED_INDEX_FILE);
  const staging = `${file}.writing`;
  writeFileSync(staging, encode(body));
  renameSync(staging, file);
}

// -------------------------------------------------------------------- mail
function fromDisplayOf(from) {
  if (!Array.isArray(from)) return '';
  return from.map(row => `${row?.name ?? ''} ${row?.address ?? ''}`).join(' ').trim();
}

/**
 * Mail events from `mailRoots` (each an alias address holding `<year>/<month>.jsonl`
 * files directly, the same convention `harness/estate_inventory.mjs` reads)
 * whose `received_at` falls on one of `seoulDays`. Only `event_id`, `subject`,
 * `from` and `received_at` are ever read out of a row; `body_text` and every
 * other field the collector wrote are never touched. Every root or year
 * folder this pass could not actually read is named in the returned
 * `unreadable` list rather than folded into "no mail this window".
 */
async function readMailWindow({ io, mailRoots, seoulDays }) {
  const events = [];
  const unreadable = [];
  let scanned = 0;
  for (const root of mailRoots) {
    for (const year of listDirNamesReporting(io, root, unreadable)) {
      const yearAddress = `${root}/${year}`;
      const files = listFileNamesReporting(io, yearAddress, unreadable);
      for (const file of files.filter(name => name.endsWith('.jsonl')).sort()) {
        const address = `${root}/${year}/${file}`;
        let where;
        try { where = io.path(address); } catch { continue; }
        const reader = createInterface({ input: createReadStream(where), crlfDelay: Infinity });
        for await (const line of reader) {
          if (!line.trim()) continue;
          if (Buffer.byteLength(line, 'utf8') > MAX_MAIL_LINE_BYTES) continue;
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event?.schema_version !== MAIL_EVENT_SCHEMA || typeof event.event_id !== 'string') continue;
          scanned += 1;
          const day = typeof event.received_at === 'string' ? seoulDateFor(event.received_at) : null;
          if (day === null || !seoulDays.has(day)) continue;
          events.push({ event_id: event.event_id, subject: String(event.subject ?? ''),
            fromDisplay: fromDisplayOf(event.from), received_at: event.received_at, day });
        }
      }
    }
  }
  return { events, scanned, unreadable };
}

// ------------------------------------------------------------------ linear
const readJson = (io, address, max = MAX_JSON_BYTES) => JSON.parse(io.read(address, max));

/** Every `.json` custody record under one folder, read the way `estate_inventory.mjs` reads them. */
function custodyRecords(io, address, unreadable) {
  const rows = [];
  const walk = rel => {
    for (const entry of listDirNames2(io, rel, unreadable)) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory) { walk(child); continue; }
      if (!entry.name.endsWith('.json')) continue;
      try { rows.push({ record: readJson(io, child) }); } catch { /* unreadable record: not a corroboration source */ }
    }
  };
  walk(address);
  return rows;
}
function listDirNames2(io, address, unreadable) {
  let where;
  try { where = io.path(address, true); }
  catch (error) { unreadable.push({ address, code: 'voice_card_reconcile_alias_unresolvable', cause_code: error?.code ?? null }); return []; }
  if (!existsSync(where)) return []; // not yet created for this team/kind: ordinary, not an error
  if (!statSync(where).isDirectory()) {
    unreadable.push({ address, code: 'voice_card_reconcile_dir_unreadable', cause_code: 'not_a_directory' });
    return [];
  }
  try {
    return readdirSync(where, { withFileTypes: true }).map(entry => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  } catch (error) {
    unreadable.push({ address, code: 'voice_card_reconcile_dir_unreadable', cause_code: error?.code ?? null });
    return [];
  }
}

/** Whether `${address}` exists and is a directory -- used only to detect
 * which Linear layout is present, never to read its content. */
function hasCustodyDir(io, address) {
  let where;
  try { where = io.path(address, true); } catch { return false; }
  try { return existsSync(where) && statSync(where).isDirectory(); } catch { return false; }
}

/**
 * Linear projects and same-window issues under `linearRoot`. Two layouts are
 * recognised, detected rather than assumed:
 *   - `single_team`: `linearRoot` itself directly holds `issues/`/`projects/`
 *     custody folders -- `linearRoot` already names one team.
 *   - `multi_team`: `linearRoot`'s own immediate children are team folders,
 *     each holding its own `issues/`/`projects/` -- the layout
 *     `harness/estate_inventory.mjs` reads, and whose `latestPerObject` is
 *     reused here unchanged.
 * This distinction exists because of the 2026-09-18 first real run's own
 * anomaly: `--linear-root` was pointed straight at a team's own folder
 * (`.../linear/sonartech-team-1`, which directly holds `issues/`/
 * `projects/`), but this reader assumed only `multi_team` -- it walked
 * `sonartech-team-1`'s own entries (`issues`, `projects`, `comments`, ...)
 * as if each one were a *team name*, found no `issues/`/`projects/` folder
 * under any of them, and reported `linear_issues_scanned: 0` with no error
 * at all, because a computed path that simply does not exist reads as
 * ordinary ("not yet created for this team/kind"), not as unreadable.
 * `layout` (`single_team`/`multi_team`/`empty`/`unrecognized`) is returned
 * so a caller can record which one a given root actually was.
 * `unrecognized` -- `linearRoot` resolves to a non-empty directory but
 * neither shape's `issues`/`projects` folder was ever found anywhere under
 * it -- is a named coverage gap (`linear_layout_unrecognized` in
 * `unreadable`), never a silent zero.
 *
 * An issue is in the window by its own `updated_at` (falling back to
 * `created_at`), read in Asia/Seoul days -- the target day plus one day
 * either side. Only `identifier`, `title`, `project_id` and that time are
 * ever read out of an issue; no comment, no change-log entry, no
 * description. Every team/kind folder this pass could not actually read is
 * named in the returned `unreadable` list.
 */
function readLinearWindow({ io, linearRoot, seoulDays }) {
  const projects = [], issues = [], unreadable = [];
  let scanned = 0;

  const readTeam = teamAddress => {
    for (const row of latestPerObject(custodyRecords(io, `${teamAddress}/projects`, unreadable))) {
      projects.push({ id: row.object_id ?? null, name: row.object?.name ?? null });
    }
    for (const row of latestPerObject(custodyRecords(io, `${teamAddress}/issues`, unreadable))) {
      scanned += 1;
      const when = row.object?.updated_at ?? row.object?.created_at ?? null;
      const day = typeof when === 'string' ? seoulDateFor(when) : null;
      if (day === null || !seoulDays.has(day)) continue;
      issues.push({ identifier: row.object?.identifier ?? null, title: row.object?.title ?? null,
        project_id: row.object?.project_id ?? null, day });
    }
  };

  let layout;
  if (hasCustodyDir(io, `${linearRoot}/issues`) || hasCustodyDir(io, `${linearRoot}/projects`)) {
    layout = 'single_team';
    readTeam(linearRoot);
  } else {
    const teamDirs = listDirNamesReporting(io, linearRoot, unreadable);
    const teamsWithCustody = teamDirs.filter(team =>
      hasCustodyDir(io, `${linearRoot}/${team}/issues`) || hasCustodyDir(io, `${linearRoot}/${team}/projects`));
    if (teamsWithCustody.length > 0) {
      layout = 'multi_team';
      for (const team of teamsWithCustody) readTeam(`${linearRoot}/${team}`);
    } else if (teamDirs.length === 0) {
      // Nothing under linearRoot at all (missing, or genuinely empty): the
      // ordinary "no Linear collected yet" shape, not a coverage gap.
      layout = 'empty';
    } else {
      // linearRoot exists and has entries, but none of them is a team
      // folder either shape recognises -- named, not silently zero.
      layout = 'unrecognized';
      unreadable.push({ address: linearRoot, code: 'linear_layout_unrecognized', cause_code: null });
    }
  }

  return { projects, issues, scanned, unreadable, layout };
}

// -------------------------------------------------------------- corroboration
/** Alias terms per project code, from every Linear project name that starts with that code. */
export function aliasTermsByCode(codes, projects) {
  const map = new Map();
  for (const code of codes) {
    const names = projects.filter(row => typeof row.name === 'string' && row.name.trim().startsWith(code))
      .map(row => row.name);
    map.set(code, [...new Set(names.flatMap(name => projectAliasTerms(name, code)))]);
  }
  return map;
}

/**
 * The independent sources, from the day window `mailEvents`/`linearIssues`
 * were already filtered to, that corroborate one segment -- across every
 * project code its card already named. `refsByCode` lets the caller build one
 * ledger `set` per project with only that project's own refs; `corroboration`
 * is what `classifyAttribution` reads -- corroboration of any of the segment's
 * candidates is enough to move the whole segment to `provisional`.
 */
export function corroborationFor({ segment, mailEvents, linearIssues, aliasByCode, linearIdsByCode }) {
  const refsByCode = new Map();
  const segmentText = `${segment.title ?? ''}\n${segment.description ?? ''}`;
  for (const candidate of segment.project_candidates ?? []) {
    const code = candidate.project_code;
    const refs = [];
    const aliasTerms = aliasByCode.get(code) ?? [];
    for (const event of mailEvents) {
      if (mailCorroborates({ subject: event.subject, fromDisplay: event.fromDisplay }, aliasTerms, code)) {
        refs.push(`mail:${event.event_id}`);
      }
    }
    const linearIds = linearIdsByCode.get(code) ?? [];
    for (const issue of linearIssues) {
      if (issue.project_id === null || !linearIds.includes(issue.project_id) || issue.identifier === null) continue;
      if (linearCorroborates({ title: issue.title }, segmentText, aliasTerms)) refs.push(`linear:${issue.identifier}`);
    }
    refsByCode.set(code, [...new Set(refs)]);
  }
  const allRefs = [...new Set([...refsByCode.values()].flat())];
  return { corroboration: { corroborated: allRefs.length > 0, refs: allRefs }, refsByCode };
}

// -------------------------------------------------------------- ledger write
// S6 (fresh review): v1's mail/Linear corroboration never promotes a
// classification any more (see voice_attribution_policy.mjs) -- it is a cue,
// so the basis text says `cues=<n>`, not `corroborated=<bool>`, which read
// as a claim this candidate had been confirmed by an independent source
// rather than merely pointed at by one.
const basisFor = ({ classification, candidate, refs }) => {
  const cardBasis = Array.isArray(candidate?.basis) ? candidate.basis.join('+') : 'none';
  const text = `reconcile:${VOICE_ATTRIBUTION_POLICY_VERSION} classification=${classification}`
    + ` card_strength=${candidate?.strength ?? 'none'} card_basis=${cardBasis || 'none'}`
    + ` cues=${refs.length}`;
  return [...text].slice(0, VOICE_ROUTE_LIMITS.basis_characters).join('').trim();
};

const evidenceRefsFor = ({ candidate, refs }) => {
  const cardRefs = Array.isArray(candidate?.evidence_row_ids) ? candidate.evidence_row_ids.map(id => `evidence_row:${id}`) : [];
  return [...new Set([...cardRefs, ...refs])].slice(0, VOICE_ROUTE_LIMITS.evidence_refs);
};

/** The existing ledger's own basis text for one segment's one project candidate, or `null` if there is none yet. */
function existingCandidateBasis(existingLedger, segmentId, projectCode) {
  const row = existingLedger?.segments?.find(item => item.segment_id === segmentId);
  const found = row?.project_candidates?.find(item => item.project_code === projectCode);
  return typeof found?.basis === 'string' ? found.basis : null;
}

// A candidate whose existing basis starts with one of these was written by a
// machine, not a person: `reconcile:` is this pass's own basis, and
// `voice_conversation_list:` is `voice_route_cli.mjs`'s `import` command
// seeding a fresh row straight from the card (see its `ledgerSegmentFrom`).
// Both are safe for this pass to overwrite; anything else -- most often a
// person's own `set --project X --basis "..."`, left at `candidate` rather
// than confirmed -- is not, and `writeSegment` below leaves it alone.
const MACHINE_BASIS_PREFIXES = Object.freeze(['reconcile:', 'voice_conversation_list:']);
const isMachineWrittenBasis = basis => basis === null || MACHINE_BASIS_PREFIXES.some(prefix => basis.startsWith(prefix));

/**
 * One or more 'set' calls, through the CLI's own command -- never a direct
 * ledger write. `skipProjects` is `strong_conflict`'s case: `--status
 * candidate` only, no `--project` at all, so whatever project candidates the
 * ledger already held (from a person, from a previous pass, or nothing) are
 * left exactly as they were.
 *
 * Otherwise, one card project candidate is one `set --project`, except a
 * candidate whose *existing* ledger basis is not machine-written
 * (`isMachineWrittenBasis`) is left untouched and counted in `skipped_human`
 * instead -- which is why a segment this pass once wrote only `status:
 * candidate` for (a `strong_conflict` night) is not stuck forever: the row
 * `import` seeded still carries its own `voice_conversation_list:` basis,
 * recognised as machine-written, so a later night where the conflict is gone
 * can still overwrite it.
 */
function writeSegment({ tablePath, tableSha256, sessionId, segment, classification, refsByCode, now,
  existingLedger, skipProjects = false, withdrawnCodes = new Set() }) {
  const common = ['--root-table', tablePath, '--root-table-sha256', tableSha256, '--session', sessionId,
    '--segment', segment.segment_id, '--by', RECONCILE_ACTOR, '--now', now];
  const candidates = skipProjects ? [] : (Array.isArray(segment.project_candidates) ? segment.project_candidates : []);
  const existingRow = existingLedger?.segments?.find(item => item.segment_id === segment.segment_id) ?? null;
  const currentCodes = new Set(candidates.map(candidate => candidate.project_code));
  let calls = 0;
  const skippedHuman = [], skippedWithdrawn = [];

  if (candidates.length === 0) {
    runVoiceRouteCli(['set', ...common, '--status', 'candidate']);
    calls += 1;
  } else {
    for (const candidate of candidates) {
      // A person already took this project back for this segment (S2-4);
      // this pass does not re-propose it, whatever the card still says.
      if (withdrawnCodes.has(candidate.project_code)) {
        skippedWithdrawn.push(candidate.project_code);
        continue;
      }
      const existingBasis = existingCandidateBasis(existingLedger, segment.segment_id, candidate.project_code);
      if (!isMachineWrittenBasis(existingBasis)) {
        skippedHuman.push(candidate.project_code);
        continue;
      }
      const refs = refsByCode.get(candidate.project_code) ?? [];
      const argv = ['set', ...common, '--status', 'candidate', '--project', candidate.project_code,
        '--basis', basisFor({ classification, candidate, refs })];
      for (const ref of evidenceRefsFor({ candidate, refs })) argv.push('--evidence', ref);
      runVoiceRouteCli(argv);
      calls += 1;
    }
  }

  // A candidate this pass itself wrote (or `import` seeded) on an earlier
  // night, for a project the current card no longer lists at all, is retired
  // via the ledger's own `--drop-project` rather than left to sit forever --
  // this is exactly what closed CE-33's A/B strong-conflict case (B stayed in
  // the ledger even after the next card was A-only). Never touches a
  // candidate a person wrote by hand, and `skipProjects` (a `strong_conflict`
  // night) retires nothing either: that night writes only `status: candidate`
  // and leaves every existing project candidate exactly where it was.
  const retired = [];
  if (!skipProjects) {
    for (const existingCandidate of existingRow?.project_candidates ?? []) {
      if (currentCodes.has(existingCandidate.project_code)) continue;
      if (!isMachineWrittenBasis(existingCandidate.basis)) continue;
      runVoiceRouteCli(['set', ...common, '--status', 'candidate', '--drop-project', existingCandidate.project_code]);
      calls += 1;
      retired.push(existingCandidate.project_code);
    }
  }

  return { calls, skipped_human: skippedHuman, skipped_withdrawn: skippedWithdrawn.sort(), retired: retired.sort() };
}

// ---------------------------------------------------------- content check
/**
 * R3/S11: one session's transcript rows, read once per session (per
 * `runReconcile` call -- `cache` lives for the whole pass, not across
 * passes) and reused for every segment's own content-check window, rather
 * than one fresh `readVoiceSession` call -- itself re-opening the source
 * root and re-parsing the transcript file -- per segment. Pages through
 * `next_window` (never a guessed stride) until the transcript is exhausted,
 * `MAX_TRANSCRIPT_WINDOW_PAGES` pages is reached, or the accumulated
 * character count passes `MAX_TRANSCRIPT_WINDOW_CHARS`; any of the latter
 * two, or any individual page `readVoiceSession` itself reported as
 * `truncated`, or a read that failed outright, marks the session
 * `truncated: true` -- a segment whose own window happens to sit entirely in
 * the part that *was* read faithfully is still marked unverified rather than
 * risk a false `confirmed`/`mismatch` built on a partial read.
 */
async function readSessionTranscriptCached(cache, { io, sessionId, derivedRoot, now }) {
  if (cache.has(sessionId)) return cache.get(sessionId);
  const rows = [];
  let truncated = false;
  let window = { from: 0, to: null };
  let totalChars = 0;
  for (let page = 0; window !== null && page < MAX_TRANSCRIPT_WINDOW_PAGES; page += 1) {
    let read;
    try { read = await readVoiceSession({ io, sessionId, derivedRoot, from: window.from, to: window.to, now }); }
    catch { truncated = true; break; }
    if (read.status === 'window_without_speech') { window = null; break; }
    if (read.status !== 'ok') { truncated = true; break; }
    let rowTruncated = false;
    for (const row of read.segments ?? []) {
      rows.push(row);
      totalChars += Number.isSafeInteger(row.shown) ? row.shown : 0;
      if (row.truncated === true) rowTruncated = true;
    }
    // A row `readVoiceSession` itself reported as character-clipped mid-
    // utterance is already an incomplete read -- `next_window`'s own
    // `character_bound` case re-requests the same starting point with a
    // fresh budget rather than an offset into what was already shown, so
    // paging further here would not make progress, only spend calls
    // reading the same partial text again.
    if (rowTruncated) { truncated = true; break; }
    if (totalChars >= MAX_TRANSCRIPT_WINDOW_CHARS) { truncated = read.next_window !== null; break; }
    window = read.next_window === null ? null : { from: read.next_window.from, to: read.next_window.to ?? null };
  }
  if (window !== null) truncated = true; // the page-count guard tripped before next_window ran out
  const cached = Object.freeze({ rows, truncated });
  cache.set(sessionId, cached);
  return cached;
}

/**
 * The transcript text of exactly one segment's own window, sliced from the
 * cached session rows above -- `null` (never an empty string) when nothing
 * in the cache overlaps this window at all, or when the session-level read
 * was truncated (R3: content-check must not trust a partial read, even for a
 * segment whose own window looks intact).
 */
function segmentTranscriptText(cached, { startSeconds, endSeconds }) {
  if (cached.truncated) return null;
  const inWindow = cached.rows.filter(row => row.end_seconds > startSeconds && row.start_seconds < endSeconds);
  if (inWindow.length === 0) return null;
  return inWindow.map(row => row.text).join(' ');
}

// -------------------------------------------------------------------- run
/**
 * One night's reconcile pass. `runVoiceRouteCliFor` is the seam tests use to
 * inspect (or refuse) every ledger call without touching a real ledger file.
 */
export async function runReconcile({ io, tools, tablePath, tableSha256, sessionsAddress = VOICE_SESSIONS_ADDRESS,
  mailRoots = [], linearRoot = 'data_root/ingress/linear', receiptsDir, targetDate = null,
  nightlyReceiptsDir = null, dry = false,
  now = new Date().toISOString(), lock = null, log = () => {} } = {}) {
  const backlogMode = nightlyReceiptsDir !== null;
  // `--date` is the fallback/manual mode's own required input; in backlog
  // mode the sessions (and the dates whose mail/Linear window matters) come
  // from the nightly lane's receipts instead, so `--date` is not required --
  // but if given anyway (nothing here forbids it), it still has to be a
  // real date.
  if (!backlogMode && !DATE_DIR.test(targetDate ?? '')) fail('voice_card_reconcile_date_invalid');
  if (backlogMode && targetDate !== null && !DATE_DIR.test(targetDate)) fail('voice_card_reconcile_date_invalid');

  // A wrong `--sessions-address` (or its alias gone from the root table), or
  // a wrong `--nightly-receipts` (S2-5), is a configuration error, not "no
  // sessions today": it fails the whole pass, the same distinction
  // `buildSessionPlan` already makes for the nightly conversation-list lane.
  let sessionIds = [], sessionsErrorCode = null, backlogDates = [], backlogDateDerivation = null, notConsidered = [];
  if (backlogMode) {
    try {
      ({ sessionIds, dates: backlogDates, derivation: backlogDateDerivation, notConsidered }
        = collectBacklogSessions(nightlyReceiptsDir));
    }
    catch (error) {
      sessionsErrorCode = typeof error?.code === 'string' ? error.code : 'voice_card_reconcile_nightly_receipts_unreadable';
    }
  } else {
    try { sessionIds = listDirNamesOrThrow(io, `${sessionsAddress}/${targetDate}`); }
    catch (error) { sessionsErrorCode = error.code; }
  }
  const seoulDays = backlogMode
    ? new Set(backlogDates.flatMap(date => [shiftDate(date, -1), date, shiftDate(date, 1)]))
    : new Set([shiftDate(targetDate, -1), targetDate, shiftDate(targetDate, 1)]);
  const mail = sessionsErrorCode === null ? await readMailWindow({ io, mailRoots, seoulDays })
    : { events: [], scanned: 0, unreadable: [] };
  const linear = sessionsErrorCode === null ? readLinearWindow({ io, linearRoot, seoulDays })
    : { projects: [], issues: [], scanned: 0, unreadable: [], layout: null };
  // Only consulted in backlog mode; a plain --date pass re-evaluates today's
  // sessions every time regardless (see collectBacklogSessions's own doc).
  // Read in `--dry` too, so a backlog preview does not claim work a real pass
  // would actually skip.
  const reconciledIndexRead = backlogMode ? readAlreadyReconciledPairs(receiptsDir)
    : { pairs: [], evictedTotal: 0, fromIndex: false };
  const alreadyReconciled = new Set(reconciledIndexRead.pairs.map(row => reconciledPairKey(row.session_id, row.run_id)));
  const reconciledRunsThisPass = [];

  const sessions = [];
  const exceptionReview = [];
  const totals = { sessions: sessionIds.length, cards_read: 0, segments_considered: 0,
    provisional: 0, candidate: 0, exception: 0, skip: 0, already_confirmed: 0, confirmed_at_write: 0,
    ledger_calls: 0, failed: 0, human_protected_candidates: 0, segment_identity_changed: 0, retired_candidates: 0,
    withdrawn_projects_skipped: 0,
    // S3-1/S3-4: a unique-strong segment classifyAttribution returned
    // `provisional` for, with no transcript window text to check its card
    // dates/amounts against -- an honest "not checked" count, not a claim
    // every provisional segment's content was verified.
    content_unverified: 0,
    // R1: the card named no date or amount at all -- there was nothing this
    // gate could have checked either way, which is not the same fact as
    // "checked and nothing was wrong" (`confirmed`) or "something was named
    // but could not be checked" (`content_unverified`).
    content_nothing_to_check: 0,
    // R3: a content check this pass forced to `unverified` because the
    // transcript window it read was still truncated after paging up to the
    // bound below.
    content_window_truncated: 0 };
  // Every project code this estate's Linear projects declare -- "P24-049
  // SAS 처리장치 ..." names project P24-049 -- for classifyAttribution's
  // new-project-candidate check (step 4). Computed once, from the same
  // `linear.projects` table `aliasTermsByCode`/`projectAliasTerms` already
  // read for this pass (this estate has no other project/alias source) --
  // the boundary after a matched code mirrors `mailCodesIn`'s own (anything
  // that is not itself an identifier character), not "must be followed by
  // whitespace", so "P24-049(SAS)" or "P24-049_v2" register the code too.
  const registeredProjectCodes = (() => {
    const leading = /^[A-Za-z][0-9A-Za-z]*(?:-[0-9A-Za-z]+)+/u;
    const continues = ch => ch !== '' && /[0-9A-Za-z-]/u.test(ch);
    const codes = new Set();
    for (const row of linear.projects) {
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      const match = leading.exec(name);
      if (match !== null && !continues(name.slice(match[0].length, match[0].length + 1))) codes.add(match[0]);
    }
    return codes;
  })();
  totals.registered_project_codes_count = registeredProjectCodes.size;
  // S8: an empty registry almost always means this pass could not load one
  // at all (no Linear projects in the day window, or a coverage gap), not
  // that this estate genuinely has zero projects -- `classifyAttribution`
  // itself already skips the new-project check in that case; this is the
  // one place that says so in the receipt, since the module has no receipt
  // of its own to write it into.
  const newProjectCheckState = registeredProjectCodes.size > 0 ? 'enabled' : 'disabled_no_registry';
  // R3/S11: one session's transcript, read (and paged) at most once per pass
  // and reused across every one of its segments -- see
  // `readSessionTranscriptCached`'s own doc.
  const transcriptCache = new Map();
  // Alias terms depend on which project codes actually appear on a card, which
  // is only known after the card is read -- so they are built once codes are seen.
  const aliasCache = new Map();
  const aliasFor = code => {
    if (!aliasCache.has(code)) {
      const ids = linearProjectsFor(code, linear.projects);
      aliasCache.set(code, { alias: (aliasTermsByCode([code], linear.projects)).get(code) ?? [], ids });
    }
    return aliasCache.get(code);
  };

  // Read regardless of `--dry`: a preview whose `already_confirmed`/protected
  // totals do not match what a real pass would see is not a preview.
  let routesDir = null;
  try { routesDir = io.path(VOICE_ROUTES_ADDRESS, true); } catch { routesDir = null; }

  for (const sessionId of sessionIds) {
    let found;
    try { found = readRun({ derivedRoot: tools.derived_root, sessionId }); }
    catch (error) {
      const reason = error?.code === 'voice_conversation_run_absent' ? 'no_card' : (error?.code ?? 'card_unreadable');
      sessions.push({ session_id: sessionId, run_id: null, outcome: 'skipped', reason, segments: [] });
      log(`${sessionId} skipped ${reason}`);
      continue;
    }
    if (found.list?.verified !== true) {
      sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'skipped', reason: 'card_not_verified', segments: [] });
      log(`${sessionId} skipped card_not_verified`);
      continue;
    }
    // S2-5: this exact (session_id, run_id) pair was already fully
    // reconciled by an earlier backlog pass. A --date pass never reaches
    // here (alreadyReconciled is empty outside backlog mode) -- today's own
    // sessions are always re-evaluated.
    if (alreadyReconciled.has(reconciledPairKey(sessionId, found.run_id))) {
      sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'skipped', reason: 'already_reconciled_run', segments: [] });
      log(`${sessionId} skipped already_reconciled_run`);
      continue;
    }
    totals.cards_read += 1;

    // The existing ledger decides what a person already confirmed and which
    // candidates a person already wrote by hand -- if it cannot be read at
    // all, this pass has no safe basis for either question, in `--dry` or
    // not, so the session is aborted rather than treated as having nothing
    // confirmed and nothing protected.
    let existingLedger = null, ledgerReadCode = null;
    if (routesDir === null) ledgerReadCode = 'voice_card_reconcile_routes_dir_unavailable';
    else {
      try { existingLedger = readLedgerFile(routesDir, sessionId).ledger; }
      catch (error) { ledgerReadCode = typeof error?.code === 'string' ? error.code : 'voice_route_ledger_unreadable'; }
    }
    if (ledgerReadCode !== null) {
      sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'failed', reason: 'ledger_unreadable',
        detail: ledgerReadCode, segments: [] });
      totals.failed += 1;
      log(`${sessionId} failed ledger_unreadable ${ledgerReadCode}`);
      continue;
    }
    const confirmedIds = new Set((existingLedger?.segments ?? []).filter(row => row.status === 'confirmed')
      .map(row => row.segment_id));

    // Always run through the CLI's own `import` -- with `--dry` in dry mode,
    // so it writes nothing there -- rather than skip it: `import`'s
    // `identity_changed` (a machine-drafted row this run's card would reuse a
    // segment_id for, but over a different stretch of the recording) has to
    // be known before the per-segment loop decides what to write, and a
    // `--dry` preview that never checked is not a preview of what a real pass
    // would actually do.
    let identityChanged = new Set();
    try {
      const imported = runVoiceRouteCli(['import', '--root-table', tablePath, '--root-table-sha256', tableSha256,
        '--tools-config', tools.tools_config_path, '--session', sessionId, '--run', found.run_id,
        '--by', RECONCILE_ACTOR, '--now', now, ...(dry ? ['--dry'] : [])]);
      identityChanged = new Set(imported?.identity_changed ?? []);
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'voice_card_reconcile_import_failed';
      sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'failed', reason: code, segments: [] });
      totals.failed += 1;
      log(`${sessionId} failed ${code}`);
      continue;
    }

    const segmentRows = [];
    for (const segment of found.list.segments ?? []) {
      totals.segments_considered += 1;
      const codesOnSegment = (segment.project_candidates ?? []).map(row => row.project_code);
      const aliasByCode = new Map(), linearIdsByCode = new Map();
      for (const code of codesOnSegment) {
        const { alias, ids } = aliasFor(code);
        aliasByCode.set(code, alias); linearIdsByCode.set(code, ids);
      }
      const { corroboration, refsByCode } = corroborationFor({ segment, mailEvents: mail.events,
        linearIssues: linear.issues, aliasByCode, linearIdsByCode });
      // A project a person already took back for this exact segment (S2-4:
      // `withdraw`, or an explicit A->B correction) is not this pass's to
      // re-propose. It is filtered into the classifier's own input rather
      // than checked after the fact: a withdrawn `strong` candidate reads as
      // `weak` here, so the segment cannot ride straight to `provisional` on
      // a candidate a person has already said no to -- classifyAttribution's
      // own check order is unchanged, only what it is handed is.
      const existingSegmentRow = existingLedger?.segments?.find(item => item.segment_id === segment.segment_id) ?? null;
      const withdrawnCodes = new Set((existingSegmentRow?.withdrawn ?? []).map(entry => entry.project_code));
      const classifiedSegment = withdrawnCodes.size === 0 ? segment : { ...segment,
        project_candidates: (segment.project_candidates ?? []).map(candidate => withdrawnCodes.has(candidate.project_code)
          && candidate.strength === 'strong' ? { ...candidate, strength: 'weak' } : candidate) };
      // S3-1 step 1 (input validity): `import` already named this exact
      // segment_id as reusing a scope from a different run
      // (`identityChanged`, S2-2) -- the one stale reason this harness can
      // give classifyAttribution today. Passed through rather than checked
      // only here, so `result.input` is the one place -- receipt included --
      // that says a segment's classification is not this pass's to act on.
      const staleReason = identityChanged.has(segment.segment_id) ? 'segment_identity_changed' : null;
      // S3-1 step 5 (content verification gate): only worth the read for a
      // segment that could actually reach the gate -- a unique strong
      // candidate, the same narrow condition classifyAttribution itself
      // checks before using it. Read-only, through the same access-declared
      // path (`voice_session_read.mjs`) the answer CLI uses; a session with
      // no grant, or nothing found for this exact window, is `null` text --
      // classifyAttribution then answers `content_check: 'unverified'`,
      // never a false claim of a mismatch it could not actually check.
      const strongCodesOnSegment = new Set((classifiedSegment.project_candidates ?? [])
        .filter(row => row?.strength === 'strong' && typeof row.project_code === 'string' && row.project_code !== '')
        .map(row => row.project_code));
      let transcriptText = null, windowTruncated = false;
      if (strongCodesOnSegment.size === 1) {
        try {
          const cached = await readSessionTranscriptCached(transcriptCache,
            { io, sessionId, derivedRoot: tools.derived_root, now });
          if (cached.truncated) windowTruncated = true;
          transcriptText = segmentTranscriptText(cached, { startSeconds: segment.start_seconds, endSeconds: segment.end_seconds });
        } catch { transcriptText = null; } // unreadable here reads as "not supplied", never a hard failure
      }
      const result = classifyAttribution(classifiedSegment, corroboration,
        { staleReason, transcriptText, registeredProjectCodes });
      totals[result.classification] = (totals[result.classification] ?? 0) + 1;
      if (result.content_check === 'unverified') totals.content_unverified += 1;
      else if (result.content_check === 'nothing_to_check') totals.content_nothing_to_check += 1;
      if (windowTruncated && result.content_check === 'unverified') totals.content_window_truncated += 1;

      let ledgerWrite = 'none', writeError = null, skippedHuman = [], skippedWithdrawn = [], retiredCandidates = [];
      if (result.classification !== 'skip') {
        // S3-1 step 1: `result.input.valid === false` is this pass's one
        // gate for "not this pass's to write" -- today that is only ever
        // `import`'s own `identity_changed` refusal (a machine-drafted row
        // this run's card would reuse a segment_id for, but over a different
        // stretch of the recording; writing here would attach this run's
        // judgement to the wrong conversation, left for a person to
        // resolve), carried through as `staleReason` above, but any future
        // stale reason classifyAttribution is ever handed reaches the same
        // gate without a second check having to be added here.
        if (result.input.valid === false) {
          ledgerWrite = result.input.reason === 'segment_identity_changed' ? 'skipped_segment_identity_changed'
            : 'skipped_stale_input';
          totals.segment_identity_changed += 1;
        }
        else if (confirmedIds.has(segment.segment_id)) { ledgerWrite = 'skipped_confirmed'; totals.already_confirmed += 1; }
        else if (dry) { ledgerWrite = 'skipped_dry'; }
        else {
          // The confirmedIds check above is only as fresh as the read this
          // session started with; a person can confirm a segment at any
          // moment this loop is still working through the others. Re-reading
          // right before the write -- not relying only on that start-of-
          // session snapshot -- is what actually catches it, and
          // `applySegmentDecision`'s own `voice_route_segment_confirmed_locked`
          // guard (its every call already re-reads the file fresh) is the
          // backstop for the gap between this re-check and the write itself.
          let confirmedNow = false;
          try { confirmedNow = readLedgerFile(routesDir, sessionId).ledger.segments
            .some(row => row.segment_id === segment.segment_id && row.status === 'confirmed'); }
          catch { confirmedNow = false; } // unreadable here is caught the same as any other write failure below
          if (confirmedNow) {
            ledgerWrite = 'skipped_confirmed_at_write';
            totals.confirmed_at_write += 1;
          } else {
            try {
              const written = writeSegment({ tablePath, tableSha256, sessionId, segment,
                classification: result.classification, refsByCode, now, existingLedger,
                skipProjects: result.reason === 'strong_conflict', withdrawnCodes });
              totals.ledger_calls += written.calls;
              totals.human_protected_candidates += written.skipped_human.length;
              totals.withdrawn_projects_skipped += written.skipped_withdrawn.length;
              totals.retired_candidates += written.retired.length;
              skippedHuman = written.skipped_human;
              skippedWithdrawn = written.skipped_withdrawn;
              retiredCandidates = written.retired;
              // N7: `written.calls` mixes two different kinds of write --
              // setting a status/project for a card candidate, and retiring a
              // stale one (S2-3) -- and only the first kind is what
              // `set_partial_human_protected` used to mean. A night where
              // every card candidate was withdrawn-skipped, and the only
              // ledger call this pass made was retiring a candidate the card
              // no longer lists, is not "a human candidate was protected" --
              // nothing here even looked at a human-written row.
              const wroteCandidate = written.calls - written.retired.length > 0;
              if (written.calls === 0) {
                // Nothing at all was written for this segment -- every
                // candidate was skipped, not partially. Human protection is
                // named even alongside a withdrawn skip, same as before.
                ledgerWrite = written.skipped_human.length > 0 ? 'skipped_human_candidate' : 'skipped_withdrawn_project';
              } else if (written.skipped_human.length > 0) {
                ledgerWrite = 'set_partial_human_protected';
              } else if (!wroteCandidate) {
                ledgerWrite = written.skipped_withdrawn.length > 0 ? 'retired_withdrawn_only' : 'retired_only';
              } else if (written.skipped_withdrawn.length > 0) {
                ledgerWrite = 'set_partial_withdrawn_project';
              } else {
                ledgerWrite = 'set';
              }
            } catch (error) {
              const code = typeof error?.code === 'string' ? error.code : 'voice_card_reconcile_write_failed';
              if (code === 'voice_route_segment_confirmed_locked') {
                ledgerWrite = 'skipped_confirmed_at_write';
                totals.confirmed_at_write += 1;
              } else {
                ledgerWrite = 'failed';
                writeError = code;
                totals.failed += 1;
              }
            }
          }
        }
      }
      const row = { segment_id: segment.segment_id, classification: result.classification, reason: result.reason,
        risk_markers: result.risk_markers, cue_refs: corroboration.refs, ledger_write: ledgerWrite,
        write_error: writeError, skipped_human_candidates: skippedHuman,
        skipped_withdrawn_projects: skippedWithdrawn, retired_candidates: retiredCandidates,
        // S3-1/S3-4: the modality tag (never a present decision when set),
        // the content-check gate's own state, and the new-project signal --
        // all carried into the receipt so the morning question (and the
        // answer CLI's read path, S3-4) never has to re-derive them.
        modality: result.modality, content_check: result.content_check, content_mismatches: result.content_mismatches,
        new_project_signal: result.new_project_signal, input: result.input,
        project_candidates: (segment.project_candidates ?? []).map(row2 => row2.project_code) };
      segmentRows.push(row);
      if (result.classification === 'exception') {
        // S4-1: every field the morning-question selector needs to name and
        // group this exception without re-opening the card -- `run_id` and
        // `clock` (the segment's own declared start-of-conversation time)
        // are new here, additive to the existing fields.
        exceptionReview.push({ session_id: sessionId, run_id: found.run_id, segment_id: segment.segment_id,
          title: segment.title, clock: segment.clock ?? null,
          candidates: (segment.project_candidates ?? []).map(row2 => row2.project_code),
          risk_markers: result.risk_markers, why: result.reason, modality: result.modality,
          content_mismatches: result.content_mismatches, receipt_ran_at: now });
      }
      log(`${sessionId} ${segment.segment_id} ${result.classification}${ledgerWrite !== 'none' ? ` ${ledgerWrite}` : ''}`);
    }
    sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'reconciled', reason: null, segments: segmentRows });
    reconciledRunsThisPass.push({ session_id: sessionId, run_id: found.run_id });
  }

  const sourcesUnreadable = [...mail.unreadable, ...linear.unreadable];
  const receipt = { schema_version: RECONCILE_RECEIPT_SCHEMA, ran_at: now, target_date: targetDate, dry,
    policy_version: VOICE_ATTRIBUTION_POLICY_VERSION,
    // S8: this pass's own project registry state, once, rather than only
    // implied by a totals count a reader would have to know the meaning of.
    new_project_check: newProjectCheckState,
    lock: lock === null ? null : { reclaimed_stale: lock.reclaimed === true,
      previous_lock: lock.reclaimed === true ? (lock.previous ?? null) : null,
      previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
    plan: backlogMode
      ? { mode: 'backlog', nightly_receipts_dir: nightlyReceiptsDir, dates: backlogDates,
          date_derivation: backlogDateDerivation, error: sessionsErrorCode }
      : { mode: 'date', sessions_address: `${sessionsAddress}/${targetDate}`, error: sessionsErrorCode },
    sources: { mail_roots: [...mailRoots], linear_root: linearRoot, mail_events_scanned: mail.scanned,
      mail_events_in_window: mail.events.length, linear_issues_scanned: linear.scanned,
      linear_issues_in_window: linear.issues.length, linear_layout: linear.layout ?? null,
      // A source named here was never actually read this pass -- its absence
      // from `exception_review`/`sessions` is not "checked, found nothing".
      sources_unreadable: sourcesUnreadable },
    seoul_days: [...seoulDays].sort(), sessions, exception_review: exceptionReview, totals,
    // S4: every nightly-lane session row this pass saw but never settled
    // (anywhere in `--nightly-receipts`) and so never reconciled at all --
    // named with the reason, not silently absent from both this receipt and
    // the nightly lane's own. Backlog mode only; a --date pass has no
    // nightly-receipts rows to compare against.
    not_considered: notConsidered,
    // S2-5: every (session_id, run_id) this pass actually finished
    // reconciling, so a later backlog pass -- reading this same receipt back
    // via `readAlreadyReconciledPairs`, or more often its compact index
    // (`reconciled_runs.index.json`, S3) -- does not redo it.
    reconciled_runs: reconciledRunsThisPass,
    status: sessionsErrorCode !== null || totals.failed > 0 ? 'FAILED' : 'OK' };
  if (!dry) {
    mkdirSync(receiptsDir, { recursive: true });
    writeFileSync(path.join(receiptsDir, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(receipt));
    // Refreshed every non-dry pass, backlog or not -- a --date pass makes no
    // pairs to add, but still normalises a directory that only ever had a
    // full scan onto an index, so the very next backlog pass pays the slow
    // path at most once.
    if (backlogMode) {
      writeReconciledIndex(receiptsDir, reconciledIndexRead.pairs, reconciledIndexRead.evictedTotal,
        reconciledRunsThisPass, now);
    }
  }
  return receipt;
}

// -------------------------------------------------------------------- CLI
export async function runReconcileCli(argv, { now, log: onLine } = {}) {
  const flags = options(argv);
  const tablePath = String(flags.get('root-table') ?? '');
  if (!tablePath) fail('voice_card_reconcile_root_table_required');
  const expectedRootTableSha256 = flags.get('root-table-sha256');
  const tableSha256 = typeof expectedRootTableSha256 === 'string' ? expectedRootTableSha256
    : sha256(readFileSync(tablePath));
  const rootTable = readRootTable({ tablePath, expectedSha256: tableSha256 });
  const io = createAliasedStoreIo(rootTable);

  const toolsPath = String(flags.get('tools-config') ?? '');
  if (!toolsPath) fail('voice_card_reconcile_tools_config_required');
  const tools = { ...readToolsConfig(readFileSync(toolsPath)), tools_config_path: toolsPath };
  if (!tools.derived_root) fail('voice_card_reconcile_derived_root_required');

  const receiptsDir = String(flags.get('receipts') ?? '');
  if (!receiptsDir) fail('voice_card_reconcile_receipts_required');
  const dry = flags.get('dry') === true;
  const nowFlag = flags.get('now');
  const nowIso = now ?? (typeof nowFlag === 'string' ? nowFlag : new Date().toISOString());
  // A scheduler or a human supplies this; it is never a path, and it always
  // has to be a real instant -- a lock's staleness and every timestamp this
  // pass writes are computed from it.
  if (!Number.isFinite(Date.parse(nowIso)) || PATH_SEPARATOR.test(nowIso)) fail('voice_card_reconcile_now_invalid');
  // S2-5: `--nightly-receipts <dir>` switches this pass to backlog mode --
  // sessions come from the nightly lane's own receipts instead of a single
  // day's session listing, so an explicit `--date` is optional (kept only as
  // the window-validation input `runReconcile` already accepts) and the
  // usual "yesterday" default is not forced onto a backlog pass.
  const nightlyReceiptsFlag = flags.get('nightly-receipts');
  const nightlyReceiptsDir = typeof nightlyReceiptsFlag === 'string' ? nightlyReceiptsFlag : null;
  const dateFlag = flags.get('date');
  const targetDate = typeof dateFlag === 'string' ? dateFlag
    : (nightlyReceiptsDir !== null ? null : defaultTargetDate(nowIso));
  const sessionsAddress = String(flags.get('sessions-address') ?? VOICE_SESSIONS_ADDRESS);
  const mailRoots = listOf(flags.get('mail-root'));
  const linearRoot = String(flags.get('linear-root') ?? 'data_root/ingress/linear');

  // A line is kept in `lines` for a caller that reads the return value (tests,
  // programmatic callers), and also handed to `onLine` the moment it is
  // produced -- `main` below passes one that writes straight to stdout, the
  // same streaming shape `voice_conversation_list_nightly.mjs`'s CLI uses.
  const lines = [];
  const log = line => { lines.push(line); if (onLine) onLine(line); };

  if (dry) {
    const receipt = await runReconcile({ io, tools, tablePath, tableSha256, sessionsAddress, mailRoots, linearRoot,
      receiptsDir, targetDate, nightlyReceiptsDir, dry: true, now: nowIso, log });
    // A `--dry` preview that could not even read every session's ledger is
    // not a preview of a run that would succeed -- it fails the same way a
    // real pass would, exit code included, rather than reporting `DRY`/0
    // over a session it never actually looked at.
    return { result: { status: receipt.status === 'FAILED' ? 'FAILED' : 'DRY', receipt }, lines, targetDate };
  }

  const lock = acquireLock(receiptsDir, nowIso);
  if (lock.held) {
    return { result: { status: 'LOCK_HELD', receipt: null, lock }, lines: [`lock held, skipping this night (age_ms=${lock.age_ms ?? 'unknown'})`], targetDate };
  }
  let receipt;
  try {
    receipt = await runReconcile({ io, tools, tablePath, tableSha256, sessionsAddress, mailRoots, linearRoot,
      receiptsDir, targetDate, nightlyReceiptsDir, dry: false, now: nowIso, lock, log });
  } finally {
    releaseLock(receiptsDir);
  }
  return { result: { status: receipt.status, receipt, lock }, lines, targetDate };
}

async function main() {
  const { result } = await runReconcileCli(process.argv.slice(2), { log: line => process.stdout.write(`${line}\n`) });
  if (result.status === 'LOCK_HELD') return 3;
  return result.status === 'FAILED' ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, error => {
    process.stderr.write(`[estate-voice-card-reconcile] ${error?.code ?? error?.message ?? 'failed'}\n`);
    process.exitCode = 2;
  });
}
