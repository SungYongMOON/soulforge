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
//   - the receipts directory gets one `soulforge.voice_card_reconcile_receipt.v1`
//     JSON naming every session and segment this pass looked at, its
//     classification, the mail/Linear refs (ids only, never body text or
//     transcript) that corroborated it, and an `exception_review` array: the
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
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readRootTable } from '../../path_registry/src/root_table.mjs';
import { createAliasedStoreIo } from '../src/adapters/aliased_store_io.mjs';
import { readToolsConfig } from '../src/runtime/attachment_derivation.mjs';
import { classifyAttribution, linearCorroborates, mailCorroborates, projectAliasTerms,
  VOICE_ATTRIBUTION_POLICY_VERSION } from '../src/runtime/voice_attribution_policy.mjs';
import { NIGHTLY_RECEIPT_SCHEMA, defaultTargetDate, seoulDateFor, shiftDate } from './voice_conversation_list_nightly.mjs';
import { readRun } from './voice_conversation_list_cli.mjs';
import { VOICE_SESSIONS_ADDRESS } from './voice_segment_drafts.mjs';
import { latestPerObject, linearProjectsFor } from './estate_inventory.mjs';
import { readLedgerFile, runVoiceRouteCli } from './voice_route_cli.mjs';
import { VOICE_ROUTE_LIMITS, VOICE_ROUTES_ADDRESS } from './voice_routes.mjs';

export const RECONCILE_RECEIPT_SCHEMA = 'soulforge.voice_card_reconcile_receipt.v1';
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

/**
 * Every session_id a nightly-lane receipt in `nightlyReceiptsDir` (the same
 * plain directory path the nightly lane's own `--receipts` names -- not an
 * `io` alias address, since the nightly lane's receipts are not addressed
 * through the root table either) reported outcome `ran` and `verified:
 * true`, across every receipt file found there, deduplicated. `--date`
 * remains this harness's fallback/manual mode; this is the alternative
 * session source `--nightly-receipts` selects, reaching whatever the nightly
 * lane actually finished (any date, any backlog night) rather than only
 * today's own date folder.
 *
 * A directory that simply does not exist yet (the nightly lane has never run)
 * plans zero sessions, the same as an absent date folder does; any other
 * read failure is a real configuration error and is thrown.
 */
function collectBacklogSessions(nightlyReceiptsDir) {
  let names;
  try { names = readdirSync(nightlyReceiptsDir); }
  catch (error) {
    if (error?.code === 'ENOENT') return { sessionIds: [], dates: [] };
    throw new DirListError('voice_card_reconcile_nightly_receipts_unreadable', error?.code ?? null);
  }
  const ids = new Set(), dates = new Set();
  for (const name of names.filter(entry => entry.endsWith('.json'))) {
    let body;
    try { body = JSON.parse(readFileSync(path.join(nightlyReceiptsDir, name), 'utf8')); } catch { continue; }
    if (body?.schema_version !== NIGHTLY_RECEIPT_SCHEMA || !Array.isArray(body.sessions)) continue;
    let contributed = false;
    for (const row of body.sessions) {
      if (row?.outcome === 'ran' && row?.verified === true && typeof row.session_id === 'string') {
        ids.add(row.session_id);
        contributed = true;
      }
    }
    // The mail/Linear day window has to cover every night this pass actually
    // draws sessions from, not just one caller-given date.
    if (contributed && DATE_DIR.test(body.target_date ?? '')) dates.add(body.target_date);
  }
  return { sessionIds: [...ids].sort(), dates: [...dates].sort() };
}

/**
 * Every `(session_id, run_id)` pair a past run of *this* harness already
 * recorded as reconciled, read from every receipt already sitting in
 * `receiptsDir`. Used only in `--nightly-receipts` backlog mode: reconcile
 * re-evaluates today's own date-folder sessions every night regardless (mail
 * arriving, a person confirming or withdrawing something changes what the
 * right answer is even for the same run_id), but a backlog scan across
 * months of nightly history must not silently redo everything it already
 * finished every single pass -- exactly the pairs a person or the nightly
 * lane has not touched since are skipped, and a session whose run_id changed
 * (S2-1 staleness, a fresh transcript, ...) is reconciled again because its
 * new run_id was never recorded.
 */
function readAlreadyReconciledPairs(receiptsDir) {
  const seen = new Set();
  let names;
  try { names = readdirSync(receiptsDir); } catch { return seen; }
  for (const name of names.filter(entry => entry.endsWith('.json'))) {
    let body;
    try { body = JSON.parse(readFileSync(path.join(receiptsDir, name), 'utf8')); } catch { continue; }
    if (body?.schema_version !== RECONCILE_RECEIPT_SCHEMA || !Array.isArray(body.reconciled_runs)) continue;
    for (const pair of body.reconciled_runs) {
      if (typeof pair?.session_id === 'string' && typeof pair?.run_id === 'string') {
        seen.add(reconciledPairKey(pair.session_id, pair.run_id));
      }
    }
  }
  return seen;
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

/**
 * Linear projects and same-window issues under `linearRoot` (one team folder
 * per subdirectory, each with `projects/` and `issues/` custody folders -- the
 * layout `harness/estate_inventory.mjs` reads, and whose `latestPerObject` is
 * reused here unchanged). An issue is in the window by its own `updated_at`
 * (falling back to `created_at`), read in Asia/Seoul days -- the target day
 * plus one day either side. Only `identifier`, `title`, `project_id` and that
 * time are ever read out of an issue; no comment, no change-log entry, no
 * description. Every team/kind folder this pass could not actually read is
 * named in the returned `unreadable` list.
 */
function readLinearWindow({ io, linearRoot, seoulDays }) {
  const projects = [], issues = [], unreadable = [];
  let scanned = 0;
  for (const team of listDirNamesReporting(io, linearRoot, unreadable)) {
    for (const row of latestPerObject(custodyRecords(io, `${linearRoot}/${team}/projects`, unreadable))) {
      projects.push({ id: row.object_id ?? null, name: row.object?.name ?? null });
    }
    for (const row of latestPerObject(custodyRecords(io, `${linearRoot}/${team}/issues`, unreadable))) {
      scanned += 1;
      const when = row.object?.updated_at ?? row.object?.created_at ?? null;
      const day = typeof when === 'string' ? seoulDateFor(when) : null;
      if (day === null || !seoulDays.has(day)) continue;
      issues.push({ identifier: row.object?.identifier ?? null, title: row.object?.title ?? null,
        project_id: row.object?.project_id ?? null, day });
    }
  }
  return { projects, issues, scanned, unreadable };
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
const basisFor = ({ classification, candidate, refs }) => {
  const cardBasis = Array.isArray(candidate?.basis) ? candidate.basis.join('+') : 'none';
  const text = `reconcile:${VOICE_ATTRIBUTION_POLICY_VERSION} classification=${classification}`
    + ` card_strength=${candidate?.strength ?? 'none'} card_basis=${cardBasis || 'none'}`
    + ` corroborated=${refs.length > 0}`;
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
  let sessionIds = [], sessionsErrorCode = null, backlogDates = [];
  if (backlogMode) {
    try { ({ sessionIds, dates: backlogDates } = collectBacklogSessions(nightlyReceiptsDir)); }
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
    : { projects: [], issues: [], scanned: 0, unreadable: [] };
  // Only consulted in backlog mode; a plain --date pass re-evaluates today's
  // sessions every time regardless (see collectBacklogSessions's own doc).
  // Read in `--dry` too, so a backlog preview does not claim work a real pass
  // would actually skip.
  const alreadyReconciled = backlogMode ? readAlreadyReconciledPairs(receiptsDir) : new Set();
  const reconciledRunsThisPass = [];

  const sessions = [];
  const exceptionReview = [];
  const totals = { sessions: sessionIds.length, cards_read: 0, segments_considered: 0,
    provisional: 0, candidate: 0, exception: 0, skip: 0, already_confirmed: 0, confirmed_at_write: 0,
    ledger_calls: 0, failed: 0, human_protected_candidates: 0, segment_identity_changed: 0, retired_candidates: 0,
    withdrawn_projects_skipped: 0 };
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
      const result = classifyAttribution(classifiedSegment, corroboration);
      totals[result.classification] = (totals[result.classification] ?? 0) + 1;

      let ledgerWrite = 'none', writeError = null, skippedHuman = [], skippedWithdrawn = [], retiredCandidates = [];
      if (result.classification !== 'skip') {
        // `import` already refused to reuse this segment_id for this run's
        // scope (a machine-drafted row addressing a different stretch of the
        // recording): writing to it here would attach this run's judgement to
        // the wrong conversation. Left for a person to resolve.
        if (identityChanged.has(segment.segment_id)) {
          ledgerWrite = 'skipped_segment_identity_changed';
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
              if (written.calls > 0) {
                ledgerWrite = written.skipped_human.length === 0 && written.skipped_withdrawn.length === 0
                  ? 'set' : 'set_partial_human_protected';
              } else if (written.skipped_withdrawn.length > 0 && written.skipped_human.length === 0) {
                ledgerWrite = 'skipped_withdrawn_project';
              } else {
                ledgerWrite = 'skipped_human_candidate';
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
        risk_markers: result.risk_markers, corroboration_refs: corroboration.refs, ledger_write: ledgerWrite,
        write_error: writeError, skipped_human_candidates: skippedHuman,
        skipped_withdrawn_projects: skippedWithdrawn, retired_candidates: retiredCandidates,
        project_candidates: (segment.project_candidates ?? []).map(row2 => row2.project_code) };
      segmentRows.push(row);
      if (result.classification === 'exception') {
        exceptionReview.push({ session_id: sessionId, segment_id: segment.segment_id, title: segment.title,
          candidates: (segment.project_candidates ?? []).map(row2 => row2.project_code),
          risk_markers: result.risk_markers, why: result.reason });
      }
      log(`${sessionId} ${segment.segment_id} ${result.classification}${ledgerWrite !== 'none' ? ` ${ledgerWrite}` : ''}`);
    }
    sessions.push({ session_id: sessionId, run_id: found.run_id, outcome: 'reconciled', reason: null, segments: segmentRows });
    reconciledRunsThisPass.push({ session_id: sessionId, run_id: found.run_id });
  }

  const sourcesUnreadable = [...mail.unreadable, ...linear.unreadable];
  const receipt = { schema_version: RECONCILE_RECEIPT_SCHEMA, ran_at: now, target_date: targetDate, dry,
    policy_version: VOICE_ATTRIBUTION_POLICY_VERSION,
    lock: lock === null ? null : { reclaimed_stale: lock.reclaimed === true,
      previous_lock: lock.reclaimed === true ? (lock.previous ?? null) : null,
      previous_lock_age_ms: lock.reclaimed === true ? (lock.age_ms ?? null) : null },
    plan: backlogMode
      ? { mode: 'backlog', nightly_receipts_dir: nightlyReceiptsDir, dates: backlogDates, error: sessionsErrorCode }
      : { mode: 'date', sessions_address: `${sessionsAddress}/${targetDate}`, error: sessionsErrorCode },
    sources: { mail_roots: [...mailRoots], linear_root: linearRoot, mail_events_scanned: mail.scanned,
      mail_events_in_window: mail.events.length, linear_issues_scanned: linear.scanned,
      linear_issues_in_window: linear.issues.length,
      // A source named here was never actually read this pass -- its absence
      // from `exception_review`/`sessions` is not "checked, found nothing".
      sources_unreadable: sourcesUnreadable },
    seoul_days: [...seoulDays].sort(), sessions, exception_review: exceptionReview, totals,
    // S2-5: every (session_id, run_id) this pass actually finished
    // reconciling, so a later backlog pass -- reading this same receipt back
    // via `readAlreadyReconciledPairs` -- does not redo it.
    reconciled_runs: reconciledRunsThisPass,
    status: sessionsErrorCode !== null || totals.failed > 0 ? 'FAILED' : 'OK' };
  if (!dry) {
    mkdirSync(receiptsDir, { recursive: true });
    writeFileSync(path.join(receiptsDir, `${now.replace(/[-:.]/gu, '').slice(0, 15)}.json`), encode(receipt));
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
