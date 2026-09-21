// Refresh pass: rebuilds a project's four management CSVs from mail custody, and a
// read-only preview of a draft rule's effect on matching. Both read
// `020_MGMT/021_자동화설정_운영규칙/mail_routing_rule.json` for every onboarded project
// (via `rule_store.mjs`) so held/yield decisions consider the whole rule set, not just
// the projects a caller selected to refresh.
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { assertSubjectOnlyFields, compileRule, compileRules, DEFAULT_MATCH_FIELDS } from './classifier.mjs';
import { listProjects, readRule, validateRule, LINEAGE_SCHEMA } from './rule_store.mjs';
import { buildContacts, buildHistory, buildReplyStatus, decodeCsv, domainOf, encodeCsv, LEDGER_SCHEMA, makeOrgLookup } from './ledgers.mjs';
// D-a/D-c/D-d (coordinator, fresh review round 2) + K2 (round 3): both `refresh()`'s
// own project-ledger attribution and `previewRule()` now call THE ONE classification
// function (`classifyProjectHits`, steps 1-5) directly, on custody read through the
// SAME loader (`loadRawMailRecords`) the common pipeline reads through -- no separate,
// narrower classifier of its own anywhere any more. `buildSystemSenderConfig`/
// `detectSystemSender` is the ONE merged system-sender check (D-d), consulted only
// AFTER classification -- for a mail `classifyProjectHits` left unresolved in
// `refresh()`'s own accounting, and for `previewRule()`'s `matched_from_system_senders`
// (K2).
import { addressesOfMail, buildSystemSenderConfig, classifyProjectHits, detectSystemSender } from './common_classifier.mjs';
import { loadRawMailRecords } from './common_events.mjs';
import { loadOwnerTables, ownerTableUsageEntry, resolveOwnerTablePaths } from './owner_tables.mjs';

export const REFRESH_RECEIPT_SCHEMA = 'soulforge.workspace_ledgers_refresh_receipt.v1';
export const REFRESH_STALE_LOCK_MS = 30 * 60 * 1000;
// Fresh-review-2 #9: scoped to `workspacesRoot`, not `receiptsDir` -- two callers with
// different receipts directories (the CLI and a UI adapter, say) must still serialise
// against each other, since they can both rewrite the same ledgers. A dot-prefixed
// name at the workspaces root, never a subfolder, so it can never look like (or sit
// inside) a project folder `listProjects` would enumerate.
const LOCK_FILE_NAME = '.workspace_ledgers_refresh.lock';

const CONTACTS_REL = '020_MGMT/023_연락처_이해관계자/연락처_장부.csv';
const RECV_REL = '020_MGMT/027_수신이력_이동이력/메일_수신이력.csv';
const SENT_REL = '020_MGMT/027_수신이력_이동이력/메일_발송이력.csv';
const REPLY_REL = '020_MGMT/027_수신이력_이동이력/회신_현황.csv';

// Owner-entered columns preserved by key across a refresh (Owner 2026-09-21 refresh contract).
const CONTACTS_KEY_INDEX = 5; // 메일
const CONTACTS_OTHER_EMAILS_INDEX = 6; // 다른메일
const CONTACTS_PRESERVE_INDICES = [12]; // 과제내역할(Owner기입) -- 비고(14) is machine-derived, not Owner-entered, and is not preserved
const HISTORY_KEY_INDEX = 0; // 이력키
const HISTORY_PRESERVE_INDICES = [4, 17]; // 단계, 작업상태
const REPLY_KEY_INDEX = 9; // 스레드
const REPLY_PRESERVE_INDICES = [10, 11]; // 처리상태(Owner기입), 메모

/**
 * fresh-review-6 #1: `ledgers.mjs`'s `buildContacts` keys the 연락처_장부.csv row on
 * a merged person's most-recently-active address (see `CONTACTS_KEY_INDEX`'s own
 * comment) -- which can change from one refresh to the next while the SAME merged
 * person is still present, simply because their next mail happened to arrive on a
 * DIFFERENT one of their already-merged addresses. An exact-key match alone then
 * makes a still-present person look like they left custody (Owner cell dropped) and a
 * "new" person arrived in their place. Returns every address this row's merged person
 * is known by -- the key column plus every space-separated entry in 다른메일 -- so
 * `preserveMerge` (below) can match an old row to a new row by ANY shared address,
 * not only by the one address that happens to be "primary" in each snapshot.
 */
// N1 (fresh-review-7): this module only ever WRITES 다른메일 space-separated, but it
// must READ whatever an Owner's editor actually left behind -- a comma or semicolon
// typed as a separator, a wrapped line, mixed case in an address. Split on any run of
// whitespace/comma/semicolon/newline, trim and lower-case both the primary and every
// alternate so a merely-cosmetic difference never defeats a real match.
function contactsAlternateKeys(row) {
  const primary = String(row[CONTACTS_KEY_INDEX] ?? '').trim().toLowerCase();
  const others = String(row[CONTACTS_OTHER_EMAILS_INDEX] ?? '')
    .split(/[\s,;]+/u)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
  return [primary, ...others].filter(Boolean);
}

export class RefreshError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'RefreshError';
    this.code = code;
  }
}
const fail = (code, detail) => { throw new RefreshError(code, detail); };

const sha256 = text => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const encodeJson = value => `${JSON.stringify(value, null, 2)}\n`;

/**
 * S-7 (fresh-review-4) + fresh-review-5 #6: a caught error's raw `.message` can (and,
 * for a filesystem error like ENOENT/EACCES, typically does) carry a full host-local
 * absolute path -- exactly the kind of value `nit10`'s `unreadable_dirs` redaction
 * already keeps out of this module's receipts. Every failure receipt that includes
 * `error.message` runs it through this first: `error.code` is kept verbatim (it is
 * never a path), but any absolute-path-shaped substring is cut down to its basename.
 *
 * Node's own fs errors always single-quote the offending path (`ENOENT: ... open
 * '<drive letter>:<backslash>Program Files<backslash>x.json'`), including when it
 * contains spaces -- so the first pass here matches a QUOTED span that starts like a
 * path (drive-letter, UNC `\\...`, or a POSIX `/...`) and redacts the whole span, not
 * just up to the first space. A second, unquoted pass is defense-in-depth for a path
 * this module's own code embeds in a message without quoting it.
 */
const QUOTED_HOST_PATH = /(['"])((?:[A-Za-z]:[\\/]|\\\\|\/)[^'"]*)\1/gu;
const UNQUOTED_WINDOWS_PATH = /[A-Za-z]:[\\/][^\s'"]+/gu;
const UNQUOTED_UNC_PATH = /\\\\[^\s'"]+/gu;
// A leading `/` alone is too common in ordinary prose (dates, fractions, "and/or") to
// treat as a path; requiring a second `/` further in keeps this to things that look
// like an actual multi-segment filesystem path.
const UNQUOTED_POSIX_PATH = /(^|[\s(])(\/[^\s'")]+\/[^\s'")]*)/gu;

// `path.basename` is platform-bound: on a POSIX host it does not split a Windows or UNC
// path on backslashes, so a drive-letter path in an error message survived redaction
// whole on the Linux CI runner. A failure receipt can carry either shape regardless of
// the host that reads it, so split on both separators ourselves.
function lastPathSegment(value) {
  const parts = String(value).split(/[\\/]+/u).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(value);
}

// Exported as a test seam (fresh-review-5 #6 asks for direct coverage of all three
// path shapes) -- not part of the module's documented public surface (`index.mjs`
// does not re-export it); every real caller reaches it only through a failure receipt.
export function redactHostPaths(message) {
  if (typeof message !== 'string') return message;
  let out = message.replace(QUOTED_HOST_PATH, (match, quote, innerPath) => `${quote}${lastPathSegment(innerPath)}${quote}`);
  out = out.replace(UNQUOTED_WINDOWS_PATH, match => lastPathSegment(match));
  out = out.replace(UNQUOTED_UNC_PATH, match => lastPathSegment(match));
  out = out.replace(UNQUOTED_POSIX_PATH, (match, pre, p) => `${pre}${lastPathSegment(p)}`);
  return out;
}

function atomicWriteText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const staging = `${filePath}.writing-${process.pid}-${Date.now()}`;
  writeFileSync(staging, text);
  renameSync(staging, filePath);
}

// -------------------------------------------------------------------------- lock
export function acquireRefreshLock(workspacesRoot, now) {
  mkdirSync(workspacesRoot, { recursive: true });
  const lockFile = path.join(workspacesRoot, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let existing;
    try { existing = JSON.parse(readFileSync(lockFile, 'utf8')); } catch { existing = {}; }
    const startedAt = typeof existing?.started_at === 'string' ? Date.parse(existing.started_at) : NaN;
    // fresh-review-3 #12: a lock whose recorded start is in the *future* relative to
    // `now` (clock skew, or corrupted data) must not be treated as fresh just because
    // clamping a negative age to 0 makes it look brand new -- it is stale immediately.
    const ageMs = Number.isFinite(startedAt) ? (Date.parse(now) - startedAt) : Number.POSITIVE_INFINITY;
    if (ageMs >= 0 && ageMs <= REFRESH_STALE_LOCK_MS) return { held: true, age_ms: ageMs };
    try { rmSync(lockFile, { force: true }); } catch (error) { fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
    try { writeFileSync(lockFile, encodeJson({ pid: process.pid, started_at: now, reclaimed_from: existing }), { flag: 'wx' }); }
    catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: ageMs }; fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
    return { held: false, reclaimed: true, age_ms: ageMs };
  }
  try { writeFileSync(lockFile, encodeJson({ pid: process.pid, started_at: now }), { flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') return { held: true, age_ms: 0 }; fail('workspace_ledgers_refresh_lock_unavailable', error?.code); }
  return { held: false, reclaimed: false, age_ms: null };
}
export function releaseRefreshLock(workspacesRoot) {
  try { rmSync(path.join(workspacesRoot, LOCK_FILE_NAME), { force: true }); } catch { /* nothing to release */ }
}

// ------------------------------------------------------------------ shared reading
function readOrgConfig(orgConfigPath) {
  let text;
  // N3 (fresh-review-7): the fallback used to be the full path when the caught error
  // had no `.code` -- the same host-local-path leak `redactHostPaths` exists to close
  // everywhere else in this module's own error messages.
  try { text = readFileSync(orgConfigPath, 'utf8'); }
  catch (error) { fail('workspace_ledgers_org_config_unreadable', error?.code ?? path.basename(orgConfigPath)); }
  try { return JSON.parse(text); }
  catch (error) { fail('workspace_ledgers_org_config_invalid_json', error.message); }
  return null;
}

/** Finds `{ list, index }` of the term named `label` within a rule json's `exact`/`hint` arrays, or `null`. */
function locateTermByLabel(ruleJson, label) {
  if (!ruleJson || typeof label !== 'string') return null;
  const exact = Array.isArray(ruleJson.exact) ? ruleJson.exact : [];
  const exactIndex = exact.findIndex(term => term?.label === label);
  if (exactIndex !== -1) return { list: 'exact', index: exactIndex };
  const hint = Array.isArray(ruleJson.hint) ? ruleJson.hint : [];
  const hintIndex = hint.findIndex(term => term?.label === label);
  if (hintIndex !== -1) return { list: 'hint', index: hintIndex };
  return null;
}
const shortHash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 8);

/**
 * S-8 (fresh-review-4): compiles each onboarded project's saved rule *individually*,
 * catching a failure per rule instead of letting one bad rule (a hand-edited/corrupted
 * json, or a term that somehow became invalid after it was saved) abort reading every
 * other project's rule too. A project whose rule fails to read or compile is excluded
 * from the returned `ok` list -- it neither participates in classification for ANY
 * project this run, nor gets its own ledgers written -- and is recorded in
 * `ruleFailures` as `{ project_code, code, term_ref }`.
 *
 * fresh-review-5 #9: `term_ref` is `{ list, index, label_hash }` (which list the failing
 * term is in, its position, and a short hash of its label), never the label text
 * itself. A receipt is written to disk and can be surfaced to a UI; a rule's term
 * labels are Owner-authored routing keywords and may themselves be real project code
 * names, partner names, or other identifying text -- the same reason `previewRule`'s
 * `samples` are never printed by default. `null` when the failure was not term-specific
 * (e.g. the json itself failed to parse) or the failing label could not be located.
 * Shared by both `refresh()` and `previewRule()`.
 */
export function readAllRuleJsonSafely(workspacesRoot) {
  const projects = listProjects({ workspacesRoot });
  const ok = [];
  const ruleFailures = [];
  for (const project of projects) {
    let json;
    try {
      json = readRule({ workspacesRoot, code: project.project_code }).json;
      const compiled = compileRule(json, { timeSafety: false });
      ok.push({ project, json, compiled });
    } catch (error) {
      const located = locateTermByLabel(json, error?.detail);
      ruleFailures.push({
        project_code: project.project_code,
        code: error?.code ?? 'workspace_ledgers_rule_unreadable',
        term_ref: located ? { list: located.list, index: located.index, label_hash: shortHash(error.detail) } : null,
      });
    }
  }
  return { ok, ruleFailures };
}

/**
 * S-4 (fresh-review-4) + fresh-review-5 #5: the common, easy-to-make mistake -- an
 * operator pointing `--hiworks-events` and `--gmail-sent-events` at the very same
 * directory -- is rejected immediately with a clear usage error rather than being
 * allowed to silently double-count and then collide every event_id against itself.
 * Compared by `fs.realpathSync.native()` (the actual OS-resolved target), not the
 * literal path string -- this repo's own custody layout uses junctions/symlinks in
 * places, and two differently-spelled paths that resolve to the same real directory
 * are exactly the same mistake a literal-string (or even a `path.resolve`d) comparison
 * would miss. Case-folded only on `win32` (POSIX paths are case-sensitive). A
 * directory that does not exist yet falls back to the resolved (non-real) path --
 * `loadMailEvents` reports that as `unreadableDirs` separately regardless. Only the
 * offending directory's *basename* is named, consistent with `nit10`'s redaction.
 */
function realDirIdentity(dir) {
  let real;
  try { real = realpathSync.native(dir); } catch { real = path.resolve(dir); }
  return process.platform === 'win32' ? real.toLowerCase() : real;
}
// Exported so `common_refresh.mjs`'s classification pass can run the exact same
// realpath-based overlap guard on the exact same two custody-directory lists, rather
// than a second, potentially-drifting reimplementation (coordinator, 2026-09-21).
export function assertNoOverlappingCustodyDirs(hiworksDirs, gmailSentDirs) {
  const hiworksSet = new Set(hiworksDirs.map(realDirIdentity));
  const overlap = gmailSentDirs.find(dir => hiworksSet.has(realDirIdentity(dir)));
  if (overlap) fail('workspace_ledgers_custody_dirs_overlap', path.basename(overlap));
}

/**
 * S-4 (fresh-review-4), second half: the directory-identity check above catches an
 * operator's typo, but not the rarer case of a genuinely different mail (or the same
 * mail synced by both channels) coincidentally carrying the exact same `event_id` in
 * both the hiworks and gmail-sent custody. `mail_events.mjs` dedupes/disambiguates
 * within one source only, so that collision is invisible until the two sources' events
 * are merged here. The FIRST occurrence of a given `event_id` in the merged list (in
 * concatenation order: hiworks events before gmail events -- a fixed, source-identity-
 * based convention, not a count that depends on how much custody exists) keeps its id
 * unchanged -- this is by far the common, non-colliding case, and changing every id's
 * shape would shift every already-written real ledger's key.
 *
 * fresh-review-5 #4: every occurrence AFTER the first used to be suffixed with a
 * positional `#count` (`~src:<source>#2`, `#3`, ...); this module now folds a stable
 * hash of the event's own content into the suffix instead, so a repeat's effective id
 * depends only on that event's own data, never on how many other repeats exist or in
 * what order they were read -- the same reasoning as N-5's fix to the per-source
 * disambiguation in `mail_events.mjs`.
 *
 * Exported (D-c, coordinator fresh review round 2) so `common_refresh.mjs`'s own
 * custody merge (and `refresh()`'s own new classification loop, below) run the exact
 * same cross-source collision pass on the exact same two merged-record lists, rather
 * than a second, potentially-drifting reimplementation. Works on any object shaped
 * like `{ event_id, source, subject, at, from }` -- an event (`mail_events.mjs`) and a
 * raw record (`common_events.mjs`) both qualify structurally.
 */
export function disambiguateCrossSourceIds(events) {
  const seen = new Set();
  return events.map(event => {
    if (!seen.has(event.event_id)) { seen.add(event.event_id); return event; }
    const basis = `${event.source}|${event.subject}|${event.at}|${event.from?.email ?? ''}`;
    return { ...event, event_id: `${event.event_id}~src:${event.source}~cs:${shortHash(basis)}` };
  });
}

/** fresh-review-3 #10: `dir` (a full host-local path) never leaves this module -- only its basename and which flag it came from. */
function redactUnreadableDirs(hiworksEntries, gmailEntries) {
  return [
    ...hiworksEntries.map(entry => ({ source: 'hiworks-events', dir: path.basename(entry.dir), code: entry.code })),
    ...gmailEntries.map(entry => ({ source: 'gmail-sent-events', dir: path.basename(entry.dir), code: entry.code })),
  ];
}

// ---------------------------------------------------------- S10: custody read cache
// `previewRule` is called interactively (a console iterating on one draft rule).
// K2 (coordinator, fresh review round 3): `previewRule` now reads custody through the
// exact same loader `refresh()` uses (`loadRawMailRecords`, no system-sender/
// skip-subject pre-filter of any kind) -- and, unlike the OLD `loadMailEvents`-based
// design, a raw record does not depend on which rule set is being compared, so the
// SAME records are reused for both the "before" and "after" classification passes in
// one call, and this cache only ever needs to key on the custody DIRECTORIES (a cheap
// signature -- file names + size + mtime, not content), not on the rule set or any
// system-sender config any more. `refresh()` (which writes real files) intentionally
// never reads through this cache.
export const CUSTODY_CACHE_TTL_MS = 60 * 1000;
const CUSTODY_CACHE_MAX_ENTRIES = 20;
const custodyCache = new Map();

/** Test/host seam: drops every cached entry, so a test never observes another test's cached read. */
export function clearCustodyCache() { custodyCache.clear(); }

function dirSignature(dir) {
  let names;
  try { names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort(); }
  catch { return `${dir}::absent`; }
  const parts = names.map(name => {
    try { const stat = statSync(path.join(dir, name)); return `${name}:${stat.size}:${stat.mtimeMs}`; }
    catch { return `${name}:unreadable`; }
  });
  return `${dir}::${parts.join(',')}`;
}
function dirsSignature(dirs) { return dirs.map(dirSignature).join('|'); }

/**
 * K2: the one custody read `previewRule` needs -- `loadRawMailRecords` per source
 * (the same loader `refresh()`'s own classification loop uses), merged and
 * cross-source-disambiguated the same way. Cached by directory signature only
 * (records are rule-independent, unlike the retired `loadMailEvents`-based design).
 */
function cachedLoadRecords({ hiworksDirs, gmailSentDirs, now = Date.now() }) {
  const key = JSON.stringify({ hiworks: dirsSignature(hiworksDirs), gmail: dirsSignature(gmailSentDirs) });
  const cached = custodyCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  assertNoOverlappingCustodyDirs(hiworksDirs, gmailSentDirs);
  const hiworks = loadRawMailRecords({ dirs: hiworksDirs, source: '하이웍스_수집' });
  const gmail = loadRawMailRecords({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집' });
  const records = disambiguateCrossSourceIds([...hiworks.records, ...gmail.records]);
  const value = { records, hiworks, gmail };
  custodyCache.set(key, { value, expiresAt: now + CUSTODY_CACHE_TTL_MS });
  if (custodyCache.size > CUSTODY_CACHE_MAX_ENTRIES) custodyCache.delete(custodyCache.keys().next().value);
  return value;
}

// ----------------------------------------------------------------- preview-rule
/**
 * Read-only comparison of one project's saved rule against a draft, over the full
 * custody window. Classification always considers every onboarded project's rule (so
 * held/yield behaviour is accurate), but only `code`'s hit/miss transitions are
 * reported. Never writes.
 *
 * K2 (coordinator, fresh review round 3 -- settles round 2's R2): this function now
 * reads custody through the EXACT SAME loader `refresh()`'s own classification loop
 * uses (`common_events.mjs`'s `loadRawMailRecords`, via the shared `cachedLoadRecords`
 * above) -- no system-sender/skip-subject pre-filter of any kind, and classification
 * runs through `classifyProjectHits` (steps 1-5, tables and step 4 included) exactly
 * as `refresh()` runs it, so `matched_after` for `code` is what the NEXT `refresh()`
 * call against the same inputs will actually write, not an approximation of it.
 * `bundleTablePath`/`readingTablePath`/`vendorTablePath` (also resolvable from the org
 * config -- S-b, see `owner_tables.mjs`'s `resolveOwnerTablePaths`) feed steps 2-4 the
 * same way they do for `refresh()`; a table-attributed mail simply shows up as a hit
 * directly now (the round-2 `table_attributed` supplementary field is retired -- it
 * would only ever have duplicated what `matched_after` itself already counts).
 *
 * `orgConfigPath` (fresh-review-3 #6, optional) resolves the merged system-sender
 * config (`common_classifier.mjs`'s `buildSystemSenderConfig`) the same way `refresh()`
 * does -- omitted, this uses the built-in default list only. It is used for TWO
 * things now: resolving `common_ledgers.owner_tables` (S-b) when no explicit table
 * path is given, and computing `matched_from_system_senders` (K2) -- never to filter
 * or exclude anything from matching any more.
 *
 * `matched_from_system_senders` (K2): of the mails counted in `matched_after`, how
 * many are from a sender the merged system-sender config would call "system". A
 * mail's own subject rule (or a table decision) can still legitimately attribute a
 * system-sender-domain mail to a project (D-d) -- this field lets the Owner SEE that
 * happening, rather than it being silently invisible the way the old pre-filter used
 * to make it (by dropping such mail before it was ever compared at all).
 *
 * Saved rules (`beforeJson`, and every entry of `afterJson` except the draft itself)
 * are compiled without re-running the ReDoS timing canaries (fresh-review-3 #5) --
 * `validateRule` above already timed the draft when it validated it; re-timing
 * everything here would be redundant for the draft and non-deterministic validation of
 * already-trusted saved rules.
 *
 * fresh-review-5 #7: a project whose OWN saved rule fails to read/compile is excluded
 * from the comparison set (same as `refresh()`), and is now surfaced in the return
 * value's `rule_failures` -- a previous version silently dropped this, but
 * `saveRuleVersion` can render `previewRule`'s return straight into the Owner-facing
 * rule `.md` as `measured` "fact"; a count computed while some other project's rule
 * was silently excluded needs to say so, not be presented as complete.
 */
export function previewRule({ workspacesRoot, code, draft, hiworksDirs = [], gmailSentDirs = [], fields = DEFAULT_MATCH_FIELDS, orgConfigPath = null,
  bundleTablePath = null, readingTablePath = null, vendorTablePath = null }) {
  assertSubjectOnlyFields(fields);
  const { ok: all, ruleFailures } = readAllRuleJsonSafely(workspacesRoot);
  const target = all.find(row => row.project.project_code === code);
  const folderName = target ? target.project.folder_name : draft.folder_name ?? null;
  const nextDraft = { ...draft, project_code: code, folder_name: folderName };
  const validation = validateRule(nextDraft, { folderName });
  if (!validation.valid) fail('workspace_ledgers_rule_invalid', validation.errors.join(','));

  const orgConfig = orgConfigPath ? readOrgConfig(orgConfigPath) : null;
  const systemSenderConfig = buildSystemSenderConfig(orgConfig ?? {});
  const resolvedTables = resolveOwnerTablePaths({ bundleTablePath, readingTablePath, vendorTablePath }, { orgConfig, workspacesRoot });
  const owner = loadOwnerTables(resolvedTables);

  const beforeJson = all.map(row => row.json);
  const afterJson = target ? beforeJson.map(row => (row.project_code === code ? nextDraft : row)) : [...beforeJson, nextDraft];
  const compiledBefore = compileRules(beforeJson, { timeSafety: false });
  const compiledAfter = compileRules(afterJson, { timeSafety: false });

  // K2: ONE custody read (records are rule-independent) -- classified twice, once per
  // rule set, through the exact same `classifyProjectHits` `refresh()` itself calls.
  const { records, hiworks, gmail } = cachedLoadRecords({ hiworksDirs, gmailSentDirs });
  const classifyEach = compiledRules => records.map(record => classifyProjectHits(
    { id: record.event_id, subject: record.subject, body: record.body_text, addresses: addressesOfMail(record), at: record.at },
    { compiledRules, bundles: owner.bundles, readings: owner.readings, vendorLookup: owner.vendors, fields },
  ));
  const beforeResults = classifyEach(compiledBefore);
  const afterResults = classifyEach(compiledAfter);

  const sample = record => ({ at: record.at, subject: record.subject.length > 80 ? record.subject.slice(0, 80) : record.subject });
  let matchedBefore = 0, matchedAfter = 0, matchedFromSystemSenders = 0;
  const movedIn = [], movedOut = [], newlyHeld = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const beforeR = beforeResults[index];
    const afterR = afterResults[index];
    // `hits` is empty on a hold (`classifyProjectHits`'s own step-1 contract) -- a
    // held mail never actually becomes a project row, so it correctly does not count
    // toward matched_before/matched_after either (K2: matched_after must equal what
    // refresh() will write). Whether `code` was one of the COLLIDING projects is
    // read off `candidates` instead, for `newly_held` specifically.
    const beforeHit = beforeR.hits.some(hit => hit.project_code === code);
    const afterHit = afterR.hits.some(hit => hit.project_code === code);
    const beforeInvolvedInHold = beforeR.held && beforeR.candidates.includes(code);
    const afterInvolvedInHold = afterR.held && afterR.candidates.includes(code);
    if (beforeHit) matchedBefore += 1;
    if (afterHit) {
      matchedAfter += 1;
      const mailForSystemCheck = { fromDomain: domainOf(record.from?.email ?? ''), from: record.from, subject: record.subject };
      if (detectSystemSender(mailForSystemCheck, systemSenderConfig)) matchedFromSystemSenders += 1;
    }
    if (afterHit && !beforeHit) movedIn.push(sample(record));
    if (beforeHit && !afterHit) movedOut.push(sample(record));
    if (afterInvolvedInHold && !beforeInvolvedInHold) newlyHeld.push(sample(record));
  }
  return {
    matched_before: matchedBefore, matched_after: matchedAfter,
    // K2: how many of `matched_after` are from a system-sender domain -- visible now
    // that there is no pre-filter to silently hide them.
    matched_from_system_senders: matchedFromSystemSenders,
    moved_in: movedIn.length, moved_out: movedOut.length, newly_held: newlyHeld.length,
    // The raw custody window is identical for `before` and `after` -- only the rule
    // set differs -- so deduping the same repeated custody lines drops the same count
    // either way; reported once here rather than as a redundant before/after pair.
    duplicates_dropped: hiworks.duplicatesDropped + gmail.duplicatesDropped,
    id_collisions_kept: (hiworks.idCollisionsKept ?? 0) + (gmail.idCollisionsKept ?? 0),
    // `samples` carries real mail subjects. It is here because the console UI needs
    // it, not for casual printing -- `cli.mjs`'s preview-rule prints counts only
    // unless the caller explicitly asks for `--show-samples`.
    samples: { moved_in: movedIn.slice(0, 10), moved_out: movedOut.slice(0, 10), newly_held: newlyHeld.slice(0, 10) },
    // fresh-review-5 #7: never render straight into an Owner-facing doc without
    // checking this first -- see `saveRuleVersion`'s `measured` handling.
    rule_failures: ruleFailures,
    owner_table_failures: owner.failures,
  };
}

// -------------------------------------------------------------------- CSV write
const REPLACEMENT_CHARACTER = '�';

function rowsEqual(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }

/**
 * Classifies one group of >=2 rows that all share the same key: `'identical'` (every
 * column matches -- a pure duplicate, safe to collapse), `'machine_only_diff'` (every
 * `preserveIndices` -- Owner-entered -- column agrees across the group; only other,
 * machine-owned columns differ), or `'conflict'` (a `preserveIndices` column itself
 * disagrees -- genuinely ambiguous which Owner edit is authoritative).
 */
function classifyDuplicateGroup(groupRows, preserveIndices) {
  if (groupRows.every(row => rowsEqual(row, groupRows[0]))) return 'identical';
  if (preserveIndices.every(index => groupRows.every(row => row[index] === groupRows[0][index]))) return 'machine_only_diff';
  return 'conflict';
}

/**
 * R4 (fail-closed) + the duplicate-key follow-up: strictly validates an existing
 * ledger CSV before any merge is attempted, so a corrupted or hand-broken file is
 * never merged into and never silently overwritten. Returns `{ present: false }`
 * when there is nothing to validate yet (first refresh), `{ present: true, ok: false,
 * code, conflictGroups? }` on a violation, or `{ present: true, ok: true, decoded,
 * rawText, beforeRowCount, collapsedIdenticalRows }` when the file is safe to merge
 * against (`beforeRowCount` is the row count AFTER collapsing duplicates -- S2). Checked, in order: encoding (no U+FFFD anywhere -- a common CP949/EUC-KR-
 * as-UTF-8 mojibake signature), the header row equals the builder's own headers
 * exactly, every row has exactly the header's column count.
 *
 * Custody itself repeats mails (`mail_events.mjs` now dedupes on read), and the
 * already-shipped ledgers this module first met still carry the resulting duplicate-
 * key rows. A key's duplicate rows are handled per `classifyDuplicateGroup`:
 * `'identical'` rows collapse to one (counted in `collapsedIdenticalRows`);
 * `'machine_only_diff'` rows also collapse to one representative (the later line) --
 * this refresh's freshly-built row supersedes every machine-owned column anyway, so
 * which duplicate is picked does not matter; only a genuine `'conflict'` (the
 * Owner-entered columns themselves disagree) still fails closed.
 */
function validateExistingCsv({ existingPath, headers, keyIndex, preserveIndices }) {
  if (!existsSync(existingPath)) return { present: false };
  const rawText = readFileSync(existingPath, 'utf8');
  if (rawText.includes(REPLACEMENT_CHARACTER)) return { present: true, ok: false, code: 'workspace_ledgers_ledger_encoding' };
  const decoded = decodeCsv(rawText);
  if (JSON.stringify(decoded.headers) !== JSON.stringify(headers)) {
    return { present: true, ok: false, code: 'workspace_ledgers_ledger_header_mismatch' };
  }
  if (decoded.rows.some(row => row.length !== headers.length)) {
    return { present: true, ok: false, code: 'workspace_ledgers_ledger_row_shape' };
  }

  const groupsByKey = new Map();
  decoded.rows.forEach(row => {
    const key = row[keyIndex];
    const group = groupsByKey.get(key) ?? [];
    group.push(row);
    groupsByKey.set(key, group);
  });

  let collapsedIdenticalRows = 0;
  let conflictGroups = 0;
  const dedupedRows = [];
  for (const groupRows of groupsByKey.values()) {
    if (groupRows.length === 1) { dedupedRows.push(groupRows[0]); continue; }
    const classification = classifyDuplicateGroup(groupRows, preserveIndices);
    if (classification === 'conflict') { conflictGroups += 1; continue; }
    if (classification === 'identical') collapsedIdenticalRows += groupRows.length - 1;
    dedupedRows.push(groupRows[groupRows.length - 1]); // later line represents the group
  }
  if (conflictGroups > 0) return { present: true, ok: false, code: 'workspace_ledgers_ledger_duplicate_key', conflictGroups };
  // S2 (fresh-review-7): `beforeRowCount` is reported to callers (including the shrink
  // guard below) as "how many rows this ledger had" -- that must be the count AFTER
  // collapsing legacy duplicate rows, not the raw line count. A ledger carrying old
  // duplicate-key rows (round-trip debt from before `collapsedIdenticalRows` existed)
  // otherwise inflates the baseline and can silently change whether a later shrink
  // looks past or under the 50% guard.
  return {
    present: true, ok: true, decoded: { headers: decoded.headers, rows: dedupedRows }, rawText,
    beforeRowCount: dedupedRows.length, collapsedIdenticalRows,
  };
}

/**
 * `alternateKeysOf` (fresh-review-6 #1, optional -- contacts.csv only) returns every
 * address a row's merged person is known by; when supplied, an old row is matched to
 * a new row whenever ANY of their addresses overlap, not only when their exact key
 * columns agree. The exact-key column is always included as one of `alternateKeysOf`'s
 * own entries, so an unchanged key still matches exactly as before -- this only
 * changes behaviour for the case where the *identity* is the same but the *primary*
 * (most-recently-active) address flipped to a different one of that identity's own
 * already-merged addresses. Every other ledger (history, reply) omits
 * `alternateKeysOf` and keeps plain exact-key matching, unaffected.
 */
function preserveMerge({ existingPath, headers, rows, keyIndex, preserveIndices, alternateKeysOf = null }) {
  const validated = validateExistingCsv({ existingPath, headers, keyIndex, preserveIndices });
  if (!validated.present) {
    return { invalid: null, rows, preservedCount: 0, ownerCellsDroppedWithRow: 0, ownerCellsAmbiguous: 0, beforeRowCount: 0, collapsedIdenticalRows: 0, oldText: null };
  }
  if (!validated.ok) {
    return { invalid: { code: validated.code, conflictGroups: validated.conflictGroups ?? null }, rows: null,
      preservedCount: 0, ownerCellsDroppedWithRow: 0, ownerCellsAmbiguous: 0, beforeRowCount: 0, collapsedIdenticalRows: 0, oldText: null };
  }
  const { decoded, rawText, beforeRowCount, collapsedIdenticalRows } = validated;
  const byKey = new Map();
  for (const oldRow of decoded.rows) byKey.set(oldRow[keyIndex], oldRow);

  // fresh-review-7 R2: an alternate address is only ever safe to match on when it
  // resolves to exactly ONE old row and does not equal a DIFFERENT old row's own exact
  // key column -- either collision means a fresh row reaching that address could
  // silently inherit the wrong old row's Owner cells (the reported incident: an old
  // row's stale alternate address kept shadowing a second old row that was later keyed
  // exactly on that same address, because the index was first-wins by file order with
  // no collision check). Such an address is removed from the index entirely -- never
  // used for matching, by either pass below -- and counted, regardless of whether any
  // fresh row this run actually goes on to need it.
  let byAltKey = null;
  let ownerCellsAmbiguous = 0;
  if (alternateKeysOf) {
    byAltKey = new Map();
    const unsafeAltKeys = new Set();
    for (const oldRow of decoded.rows) {
      for (const altKey of alternateKeysOf(oldRow)) {
        if (!altKey || unsafeAltKeys.has(altKey)) continue;
        const existing = byAltKey.get(altKey);
        if (existing === undefined) { byAltKey.set(altKey, oldRow); continue; }
        if (existing === oldRow) continue; // the same row listing its own alt key twice
        byAltKey.delete(altKey);
        unsafeAltKeys.add(altKey);
      }
    }
    for (const [altKey, oldRow] of byAltKey) {
      const keyOwner = byKey.get(altKey);
      if (keyOwner && keyOwner !== oldRow) { byAltKey.delete(altKey); unsafeAltKeys.add(altKey); }
    }
    ownerCellsAmbiguous += unsafeAltKeys.size;
  }

  // fresh-review-7 R1: two passes, so an old row is matched to AT MOST ONE fresh row --
  // the bug report was a formerly-merged old row (primary + alternate addresses, one
  // Owner cell) splitting into two separate fresh people and BOTH silently inheriting
  // the same Owner cell. Pass 1 (exact key-column match) always wins and runs for every
  // fresh row first, consuming whichever old row it lands on. Pass 2 (alternate-address
  // match) only ever looks at fresh rows pass 1 left unmatched, and only at old rows
  // pass 1 did not already consume -- so a split's OTHER half legitimately gets no
  // match at all (not ambiguous -- pass 1 already, unambiguously, resolved it). Within
  // pass 2 itself, a fresh row reaching more than one still-available old row, or two
  // fresh rows both reaching the very same one, is exactly the unsafe shape R2 already
  // guards the index against: neither/none of the contenders gets a match, and each
  // contended attempt is counted rather than resolved by whichever fresh row happened
  // to be processed first.
  const consumedOldRows = new Set();
  const matchedOldRowOf = new Array(rows.length).fill(undefined);
  rows.forEach((newRow, index) => {
    const oldRow = byKey.get(newRow[keyIndex]);
    if (oldRow && !consumedOldRows.has(oldRow)) { matchedOldRowOf[index] = oldRow; consumedOldRows.add(oldRow); }
  });

  if (byAltKey) {
    const candidateOf = new Map(); // fresh-row index -> its one unambiguous candidate
    rows.forEach((newRow, index) => {
      if (matchedOldRowOf[index] !== undefined) return;
      const candidates = new Set();
      for (const altKey of alternateKeysOf(newRow)) {
        const found = byAltKey.get(altKey);
        if (found && !consumedOldRows.has(found)) candidates.add(found);
      }
      if (candidates.size === 1) candidateOf.set(index, [...candidates][0]);
      else if (candidates.size > 1) ownerCellsAmbiguous += 1; // this fresh row itself is torn between old identities
    });
    const wantedBy = new Map();
    for (const [index, oldRow] of candidateOf) {
      const contenders = wantedBy.get(oldRow) ?? [];
      contenders.push(index);
      wantedBy.set(oldRow, contenders);
    }
    for (const [oldRow, indices] of wantedBy) {
      if (indices.length === 1) { matchedOldRowOf[indices[0]] = oldRow; consumedOldRows.add(oldRow); }
      else ownerCellsAmbiguous += indices.length; // genuine contention: none of them get it
    }
  }

  let preservedCount = 0;
  const merged = rows.map((newRow, index) => {
    const oldRow = matchedOldRowOf[index];
    if (!oldRow) return newRow;
    const out = [...newRow];
    for (const preserveIndex of preserveIndices) {
      const oldValue = oldRow[preserveIndex];
      if (oldValue !== undefined && oldValue !== '') { out[preserveIndex] = oldValue; preservedCount += 1; }
    }
    return out;
  });
  // S9 (fresh-review-6 #1: matched by identity -- alternate addresses included when
  // `alternateKeysOf` applies -- not merely by literal key-column equality): an old
  // row no fresh row ended up matched to -- whether it genuinely left the live view
  // (e.g. re-attributed elsewhere) or lost a pass-2 contention above -- carries its
  // Owner-entered value no further; it survives only in the history archive this
  // refresh is about to write, and this count says how many rows that happened to
  // (never which rows, to avoid surfacing subjects/names in the receipt).
  let ownerCellsDroppedWithRow = 0;
  for (const oldRow of decoded.rows) {
    if (consumedOldRows.has(oldRow)) continue;
    if (preserveIndices.some(index => oldRow[index] !== undefined && oldRow[index] !== '')) ownerCellsDroppedWithRow += 1;
  }
  return { invalid: null, rows: merged, preservedCount, ownerCellsDroppedWithRow, ownerCellsAmbiguous, beforeRowCount, collapsedIdenticalRows, oldText: rawText };
}

/**
 * S13: archives `bytes` under `<historyDir>/<baseName>.<stamp>.csv`, create-only like
 * `rule_store.mjs`'s history archive. If that exact name is already taken (two
 * refreshes sharing the same `now` stamp, e.g. two calls in the same process tick),
 * a numeric counter suffix is appended until a free name is found, rather than
 * overwriting the earlier archive.
 */
function archiveHistoryCreateOnly({ historyDir, baseName, stamp, bytes }) {
  mkdirSync(historyDir, { recursive: true });
  for (let counter = 0; counter <= 1000; counter += 1) {
    const suffix = counter === 0 ? '' : `-${counter}`;
    const candidate = path.join(historyDir, `${baseName}.${stamp}${suffix}.csv`);
    try { writeFileSync(candidate, bytes, { flag: 'wx' }); return candidate; }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
  }
  // fresh-review-6 #2: `redactHostPaths` only redacts a QUOTED span (Node's own fs
  // errors always quote), or an unquoted span with no spaces -- an unquoted detail
  // string containing a space (the common case for a real host path) left a fragment
  // behind. Passed as a basename directly here instead, so there is no host-local
  // path substring in the thrown error's message to begin with.
  fail('workspace_ledgers_history_archive_exhausted', `${path.basename(historyDir)}/${baseName}.${stamp}`);
  return null;
}

/** Count of rows whose `keyIndex` value repeats within `rows` itself (independent of any existing file). */
function countDuplicateKeys(rows, keyIndex) {
  const seen = new Set();
  let count = 0;
  for (const row of rows) {
    const key = row[keyIndex];
    if (seen.has(key)) count += 1; else seen.add(key);
  }
  return count;
}

// Exported (not just a `refresh()`-internal helper) so `common_refresh.mjs` can write
// the common-folder/vendor/work-tag/general-work ledgers through the exact same
// fail-closed-validate + Owner-column-preserve + create-only-history-archive +
// atomic-write path the four per-project ledgers already use, rather than a second,
// divergent implementation of the same contract (spec Step 1's "hard rules": every new
// ledger gets the same Owner-data guarantees as the existing ones).
export function writeLedgerCsv({ filePath, lineagePath, headers, rows, keyIndex, preserveIndices, code, folder, relPath, now, dry,
  allowEmpty, partialSourcesInEffect = false, alternateKeysOf = null }) {
  // Fresh-review-2 #3 (second half): a broken key source (a synthetic id collision
  // that somehow still occurred, or any future bug) must not silently produce two
  // rows under one key and write a corrupt ledger -- caught here, before this file's
  // existing content is even read, let alone merged into.
  const freshDuplicateCount = countDuplicateKeys(rows, keyIndex);
  if (freshDuplicateCount > 0) {
    return { failed: true, code: 'workspace_ledgers_ledger_fresh_duplicate_key', fresh_duplicate_count: freshDuplicateCount,
      file: `${folder}/${relPath}`, written: false, changed: false };
  }
  const merge = preserveMerge({ existingPath: filePath, headers, rows, keyIndex, preserveIndices, alternateKeysOf });
  if (merge.invalid) {
    // R4: fail closed for this one file -- do not write, do not archive, do not touch
    // lineage. The file is left exactly as it was found. `conflict_groups` counts how
    // many distinct keys had rows disagreeing on an Owner-entered column -- the reason
    // this file, specifically, could not be safely deduped and merged.
    return { failed: true, code: merge.invalid.code, conflict_groups: merge.invalid.conflictGroups,
      file: `${folder}/${relPath}`, written: false, changed: false };
  }
  // Fresh-review-2 #1 (second half): zero fresh rows where the existing ledger had
  // content is exactly what a missing/misconfigured custody directory (or any other
  // silent input failure) produces -- indistinguishable, from here, from a genuinely
  // mail-free refresh. Fail closed unless the caller explicitly opted in (S4: scoped
  // per project by the caller -- `allowEmpty` here is already that per-project boolean).
  const emptyRefreshApplies = merge.rows.length === 0 && merge.beforeRowCount > 0;
  if (emptyRefreshApplies && !allowEmpty) {
    return { failed: true, code: 'workspace_ledgers_ledger_empty_refresh_blocked', before_rows: merge.beforeRowCount,
      after_rows: merge.rows.length, file: `${folder}/${relPath}`, written: false, changed: false };
  }
  // fresh-review-6 #4 + fresh-review-7 R3: the empty-refresh guard above only catches
  // an EXACT zero -- when some custody source was unreadable and skipped entirely, a
  // ledger's fresh row count can crater to a small fraction of what it was (a 6-row
  // ledger rewritten to 1 row) without ever hitting exact zero. `partialSourcesInEffect`
  // is the caller's already-computed "an unreadable dir actually forced a partial run"
  // boolean (unreadable dirs non-empty AND the caller passed allowPartialSources) --
  // R3: gating on the raw `allowPartialSources` REQUEST flag instead used to block a
  // legitimate large shrink (a rule change moving most mail elsewhere) on any run where
  // the caller passed the flag out of habit but every custody dir was, in fact,
  // perfectly readable. A normal full-custody refresh can legitimately shrink a ledger
  // a lot and is not second-guessed here.
  const shrinkGuardApplies = partialSourcesInEffect && merge.beforeRowCount > 0 && merge.rows.length > 0
    && merge.rows.length < merge.beforeRowCount * 0.5;
  if (shrinkGuardApplies && !allowEmpty) {
    return { failed: true, code: 'workspace_ledgers_ledger_partial_sources_shrink_blocked', before_rows: merge.beforeRowCount,
      after_rows: merge.rows.length, file: `${folder}/${relPath}`, written: false, changed: false };
  }
  const newText = encodeCsv(headers, merge.rows);
  const changed = merge.oldText !== newText;
  const result = { failed: false, rows: merge.rows.length, before_rows: merge.beforeRowCount,
    preserved_owner_cells: merge.preservedCount, owner_cells_dropped_with_row: merge.ownerCellsDroppedWithRow,
    owner_cells_ambiguous: merge.ownerCellsAmbiguous, collapsed_identical_rows: merge.collapsedIdenticalRows,
    empty_allowed_applied: emptyRefreshApplies && allowEmpty,
    // S1: a shrink the guard WOULD have blocked, but that `allowEmpty` overrode for this
    // project, used to leave no trace at all in the receipt -- indistinguishable from a
    // shrink that never came close to the guard in the first place.
    shrink_allowed_applied: shrinkGuardApplies && allowEmpty,
    changed, sha256: sha256(newText) };
  if (dry || !changed) return { ...result, written: false };
  if (merge.oldText !== null) {
    const stamp = now.replace(/[:.]/gu, '-');
    archiveHistoryCreateOnly({ historyDir: path.join(path.dirname(filePath), 'history'), baseName: path.basename(filePath), stamp, bytes: merge.oldText });
  }
  atomicWriteText(filePath, newText);
  const lineage = {
    schema_version: LINEAGE_SCHEMA, project_code: code, object: `_workspaces/${folder}/${relPath}`, folder_name: folder,
    format: 'csv utf-8 bom crlf', ledger_schema: LEDGER_SCHEMA, sha256: result.sha256, bytes: Buffer.byteLength(newText),
    rows: merge.rows.length, previous_sha256: merge.oldText ? sha256(merge.oldText) : null,
    status: 'refreshed_from_custody', written_at: now,
  };
  atomicWriteText(lineagePath, encodeJson(lineage));
  return { ...result, written: true };
}

// ------------------------------------------------------------------------ refresh
/**
 * Rewrites every selected project's four management CSVs from custody, preserving
 * Owner-entered columns by key. `projects` (array of codes) restricts which projects
 * are *written*; classification always considers every onboarded project's rule.
 * Returns the receipt body (also written to `receiptsDir` unless the caller wants it
 * suppressed -- this function always writes the receipt, dry or not, so a `--dry`
 * pass leaves an audit trail of what it previewed).
 *
 * `allowEmpty` (fresh-review-3 #4) is a *list of project codes*, not a global switch
 * -- only those projects may have a ledger rebuilt down to zero rows when it
 * previously had content; every code that actually needed the override is echoed back
 * in `receipt.allow_empty_applied_to`.
 *
 * fresh-review-3 #1: custody is classified *before* any file is written, and if any
 * custody directory could not be read at all, this function writes the failed receipt
 * and writes nothing else -- no ledger, no lineage, not even a header-only file for a
 * brand-new project -- unless `allowPartialSources` is explicitly passed, in which
 * case the run proceeds on whatever custody *was* readable and
 * `receipt.allow_partial_sources_applied` is `true`. This closes the gap where a
 * `--hiworks-events` typo used to let every other project's ledger already get
 * rewritten (and only fail the empty-refresh guard, or not even that, on a
 * still-being-onboarded project) before the run's overall failure was ever visible.
 *
 * R4: a single ledger file that fails strict validation (see `validateExistingCsv`)
 * is skipped -- left untouched, recorded in `receipt.ledger_failures` -- while every
 * other file for every other project still refreshes normally. `receipt.status` is
 * `'failed'` whenever `ledger_failures` is non-empty, when any custody directory could
 * not be read (`unreadable_dirs`, always true regardless of `allowPartialSources` --
 * the override changes what got written, not the visibility of the problem), or when
 * any project's saved rule failed to read/compile (`rule_failures`, S-8 -- that project
 * is excluded from classification and from being written this run, every other project
 * still refreshes). This function still returns the receipt rather than throwing for
 * any of those, so a caller sees exactly what succeeded and what did not; the CLI maps
 * `status: 'failed'` to exit code 2. If something unexpected throws mid-run instead, a
 * best-effort failure receipt (`status: 'failed'`, an `error` field with any host-local
 * path in its message redacted to a basename -- S-7 -- and whatever project reports had
 * already completed -- fresh-review-3 #7) is still written before the error propagates;
 * the lock-held case (fresh-review-3 #14) gets the same treatment even though it never
 * reaches the main try block.
 *
 * fresh-review-5 (design simplification, coordinator decision): there is no longer a
 * per-mail match timeout or a cumulative match-time run budget -- both were removed
 * after three review rounds showed that machinery creating worse failure modes (a
 * wall-clock interruption on one project's term deleting an unrelated project's ledger
 * row) than the ReDoS risk it guarded against, for this loopback, Owner-only tool.
 */
export function refresh({ workspacesRoot, workmetaRoot, hiworksDirs, gmailSentDirs, orgConfigPath, projects: onlyProjects = null,
  fields = DEFAULT_MATCH_FIELDS, dry = false, receiptsDir, now = new Date().toISOString(), allowEmpty = [], allowPartialSources = false,
  // A1: dependency-injected table attribution (spec section 1 steps 2-3), plumbed
  // through as independently-defaulted optional params -- every existing positional/
  // keyword name above this line is unchanged. `bundleTablePath`/`readingTablePath`/
  // `vendorTablePath` omitted (all `null`, the default): no table is read and step
  // 2/3/4 table-or-vendor attribution never fires. Supplying any of the three opts
  // in (also resolvable from the org config -- S-b, see `owner_tables.mjs`'s
  // `resolveOwnerTablePaths`); `allowDegradedOwnerTables` (default `false`) mirrors
  // `refreshCommon`'s own R4 gate. `vendorTablePath`: needed for step 4 (a
  // supplier-type vendor mail whose body contains exactly one project's exact
  // keyword) to attribute anything at all here -- omitted, step 4 never fires,
  // matching its own vendor-gated contract (`classifyProjectHits`'s own doc).
  //
  // D-a/D-c/D-d (coordinator, fresh review round 2): `refresh()`'s own project
  // attribution now calls `common_classifier.mjs`'s `classifyProjectHits` -- THE ONE
  // function that runs the whole classification order 1-5 -- on custody read through
  // the SAME loader (`common_events.mjs`'s `loadRawMailRecords`) the common pipeline
  // reads through, so a mail id `triage list`/`appendReadingDecision` shows a reader is
  // the exact same id `refresh()` derives for the exact same physical mail, and a
  // system-sender mail with an explicit reading decision is rescued here exactly the
  // way the common pipeline already rescues it (see this function's own classification
  // loop, below, for exactly how).
  //
  // K1 (coordinator, fresh review round 3 -- settles round 2's D-b/R1): `fields` is
  // accepted only for backward compatibility -- step 1 matches the SUBJECT ONLY, full
  // stop, and this param cannot widen or narrow that any more. Anything other than
  // exactly `DEFAULT_MATCH_FIELDS` (`['subject']`, checked by value) throws
  // `workspace_ledgers_fields_not_supported` immediately, before the lock is even
  // acquired. A rule's own `match_fields` stays schema-valid (`compileRule` still
  // accepts it) but is never consulted for ledger placement -- see
  // `classifier.mjs`'s own doc on `DEFAULT_MATCH_FIELDS` for why. See this module's
  // own README section for the full list of caller-visible behaviour changes.
  bundleTablePath = null, readingTablePath = null, vendorTablePath = null, allowDegradedOwnerTables = false }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('workspace_ledgers_receipts_dir_required');
  // K1: refuse before any lock/write/receipt -- the same "pure usage error, no
  // receipt at all" treatment the other required-argument checks above already get.
  try { assertSubjectOnlyFields(fields); }
  catch (error) { fail(error.code, JSON.stringify(fields)); }
  // S-5: the previous API accepted a bare boolean here and silently treated it (and
  // any other non-array) as an empty list -- a caller still passing `allowEmpty: true`
  // got no error and no override, which looks identical to "did not ask for one".
  if (!Array.isArray(allowEmpty)) fail('workspace_ledgers_allow_empty_must_be_list', typeof allowEmpty);
  const allowEmptyCodes = new Set(allowEmpty);
  const orgConfig = readOrgConfig(orgConfigPath);
  const { ourDomain } = makeOrgLookup(orgConfig);
  // D-d (coordinator, fresh review round 2): the ONE merged system-sender check (named
  // `common_ledgers.system_notification_sources` + legacy `system_sender_domains`) --
  // see `buildSystemSenderConfig`'s own doc. Computed here, outside the lock/try block,
  // the same precedent `orgConfig` itself already sets (a malformed org config throws
  // immediately, no receipt -- see `readOrgConfig (fresh-review-7 N3)`'s own test).
  const systemSenderConfig = buildSystemSenderConfig(orgConfig);

  const writeReceiptFile = body => {
    try {
      mkdirSync(receiptsDir, { recursive: true });
      const stamp = now.replace(/[:.]/gu, '-');
      atomicWriteText(path.join(receiptsDir, `refresh-${stamp}${dry ? '-dry' : ''}.json`), encodeJson(body));
    } catch { /* best effort: a receipt-write failure must never mask the original error */ }
  };
  const baseReceipt = () => ({ schema_version: REFRESH_RECEIPT_SCHEMA, generated_at: now, dry, fields });

  // fresh-review-3 #14: the lock-held case throws before the main try block below --
  // it still gets a receipt of its own, since "refresh did not run because another
  // one is in progress" is exactly the kind of thing an audit trail should say.
  let lock;
  try {
    lock = acquireRefreshLock(workspacesRoot, now);
  } catch (error) {
    writeReceiptFile({ ...baseReceipt(), status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_refresh_lock_unavailable', message: redactHostPaths(error?.message ?? String(error)) } });
    throw error;
  }
  if (lock.held) {
    writeReceiptFile({ ...baseReceipt(), status: 'failed',
      error: { code: 'workspace_ledgers_refresh_lock_held', message: 'refresh lock already held' } });
    fail('workspace_ledgers_refresh_lock_held');
  }

  // fresh-review-3 #7: hoisted so the catch block below can still report whatever
  // completed before an unexpected throw, instead of a bare {status, error}.
  const projectReports = [];
  const ledgerFailures = [];
  const allowEmptyAppliedTo = new Set();
  const shrinkAllowedAppliedTo = new Set(); // S1
  let eventsScannedHiworks = 0, eventsScannedGmail = 0, skippedSystemTotal = 0;
  let duplicatesDroppedTotal = 0, idCollisionsKeptTotal = 0, heldCount = 0, unattributed = 0;
  let unreadableDirsRedacted = [];
  let ruleFailures = [];
  // R3: the boolean the shrink guard must actually gate on -- an unreadable custody
  // dir DID force a partial run, not merely "the caller happened to pass the flag".
  let partialSourcesInEffect = false;
  // A1 (2026-09-21 night addition): hoisted for the same reason every other running
  // total above is -- the catch block below must still report whatever this run had
  // already computed before an unexpected throw.
  let ownerTableFailures = [];
  let ownerTablesUsed = [];
  let tableAttributedTotal = 0;
  // S3 (coordinator, fresh review round 2): scoped to PROJECT-ledger mail only (this
  // function never sees common-folder mail at all) -- deliberately, distinctly named
  // from `common_refresh.mjs`'s own `commonSearchEligibleAttributions`
  // (`common_search_eligible_attributions` in that receipt), which counts a different,
  // overlapping population (every mail the common pass classifies, project-bucket
  // mail included). The two must never be summed by a caller.
  let projectSearchEligibleAttributions = 0;

  try {
    // S-8: a bad saved rule for one project is excluded (recorded in ruleFailures),
    // never aborts reading every other project's rule.
    const readAll = readAllRuleJsonSafely(workspacesRoot);
    const all = readAll.ok;
    ruleFailures = readAll.ruleFailures;
    // fresh-review-6 #2: basename only -- see the same fix's note on the history-
    // archive-exhausted fail() above.
    if (all.length === 0 && ruleFailures.length === 0) fail('workspace_ledgers_no_projects_found', path.basename(workspacesRoot));
    const selectedCodes = Array.isArray(onlyProjects) && onlyProjects.length > 0 ? new Set(onlyProjects) : null;
    if (selectedCodes) {
      for (const code of selectedCodes) if (!all.some(row => row.project.project_code === code)) fail('workspace_ledgers_unknown_project', code);
    }
    // S-5 + fresh-review-5 #8: every code named in allowEmpty must be a real,
    // currently-onboarded project -- the same treatment `--projects` already gets --
    // so a typo'd code silently granting no override (and looking identical to "did
    // not ask for one") is instead a loud, immediate usage error. A code that names a
    // REAL project excluded THIS run only because its own rule failed to compile
    // (`ruleFailures`) is a different situation, not a typo -- it gets its own code
    // pointing at that, not `unknown_project`.
    for (const code of allowEmptyCodes) {
      if (all.some(row => row.project.project_code === code)) continue;
      if (ruleFailures.some(entry => entry.project_code === code)) fail('workspace_ledgers_allow_empty_targets_rule_failure', code);
      fail('workspace_ledgers_unknown_project', code);
    }

    // A1 (2026-09-21 night addition) + S-b (round 3): load the Owner tables
    // `refresh()`'s own project attribution now also consults, the same
    // fail-closed-per-table contract `owner_tables.mjs` already documents (missing/
    // empty -> skip; bad header/encoding -> `ownerTableFailures`, never thrown).
    // `resolveOwnerTablePaths` prefers an explicit `bundleTablePath`/`readingTablePath`/
    // `vendorTablePath` param, falling back to `orgConfig.common_ledgers.owner_tables`
    // when a param is omitted -- all three still `null` in the end (no explicit param,
    // no org-config entry either) reads no table at all, unchanged from before this
    // addition.
    const resolvedTables = resolveOwnerTablePaths({ bundleTablePath, readingTablePath, vendorTablePath }, { orgConfig, workspacesRoot });
    const owner = loadOwnerTables(resolvedTables);
    ownerTableFailures = owner.failures;
    // S-b: the receipt-safe summary of which table files this run actually used
    // (basename + sha256, never a host-local path) -- so a caller can confirm
    // `refresh` and `refreshCommon` ran against the same table set without either
    // receipt leaking where those files live on disk.
    ownerTablesUsed = ['bundle', 'reading', 'vendor']
      .map(table => ownerTableUsageEntry(table, resolvedTables[`${table}TablePath`]))
      .filter(Boolean);

    // fresh-review-3 #5: saved rules are compiled without re-running the (non-
    // deterministic) ReDoS timing canaries -- they were already timed when saved
    // (`saveRuleVersion` -> `validateRule`, default `timeSafety: true`). Matching
    // itself is a direct `classifyMail` call (fresh-review-5 design simplification).
    const compiledRules = all.map(row => row.compiled);
    // D-a/D-c: custody read through the SAME loader the common pipeline (and, as of
    // K2, `previewRule` too) reads through (`loadRawMailRecords`), with the same S-4
    // directory-overlap guard and the same cross-source id-collision disambiguation.
    assertNoOverlappingCustodyDirs(hiworksDirs, gmailSentDirs);
    const hiworks = loadRawMailRecords({ dirs: hiworksDirs, source: '하이웍스_수집' });
    const gmail = loadRawMailRecords({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집' });
    const records = disambiguateCrossSourceIds([...hiworks.records, ...gmail.records]);
    eventsScannedHiworks = hiworks.scanned; eventsScannedGmail = gmail.scanned;
    duplicatesDroppedTotal = hiworks.duplicatesDropped + gmail.duplicatesDropped;
    idCollisionsKeptTotal = (hiworks.idCollisionsKept ?? 0) + (gmail.idCollisionsKept ?? 0);
    unreadableDirsRedacted = redactUnreadableDirs(hiworks.unreadableDirs, gmail.unreadableDirs);
    partialSourcesInEffect = unreadableDirsRedacted.length > 0 && allowPartialSources;

    // fresh-review-3 #1: pre-write gate. An unreadable custody directory stops every
    // write for this run -- not just the ones that happen to compute to zero rows --
    // unless the caller explicitly opted into a partial-sources run.
    if (unreadableDirsRedacted.length > 0 && !allowPartialSources) {
      const receipt = {
        ...baseReceipt(), status: 'failed',
        events_scanned: { hiworks: eventsScannedHiworks, gmail_sent: eventsScannedGmail },
        skipped_system: skippedSystemTotal, duplicates_dropped: duplicatesDroppedTotal, id_collisions_kept: idCollisionsKeptTotal,
        unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: false, allow_empty_applied_to: [],
        shrink_allowed_applied_to: [],
        rule_failures: ruleFailures, held_two_projects: 0, unattributed: 0, ledger_failures: [], projects: [],
        owner_table_failures: ownerTableFailures, owner_tables_used: ownerTablesUsed, table_attributed_mails: 0,
        project_search_eligible_attributions: 0,
      };
      writeReceiptFile(receipt);
      return receipt;
    }

    // A1 (2026-09-21 night addition), mirrors `refreshCommon`'s own R4 gate: a
    // malformed Owner table would otherwise silently degrade classification -- mail
    // that used to attribute via that table falls back to `unattributed` instead, and
    // this run would then rewrite every project ledger to match (losing that mail from
    // every project's ledgers, not merely leaving it stale). Blocks every write for the
    // whole run (receipt only, `status: 'failed'`, the failing table(s) named) unless
    // the caller explicitly opts back into the old (degraded but writing) behaviour via
    // `allowDegradedOwnerTables: true`.
    if (ownerTableFailures.length > 0 && !allowDegradedOwnerTables) {
      const receipt = {
        ...baseReceipt(), status: 'failed',
        events_scanned: { hiworks: eventsScannedHiworks, gmail_sent: eventsScannedGmail },
        skipped_system: skippedSystemTotal, duplicates_dropped: duplicatesDroppedTotal, id_collisions_kept: idCollisionsKeptTotal,
        unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: partialSourcesInEffect, allow_empty_applied_to: [],
        shrink_allowed_applied_to: [],
        rule_failures: ruleFailures, held_two_projects: 0, unattributed: 0, ledger_failures: [], projects: [],
        owner_table_failures: ownerTableFailures, owner_tables_used: ownerTablesUsed, table_attributed_mails: 0,
        project_search_eligible_attributions: 0,
        degraded_owner_tables_allowed: false,
      };
      writeReceiptFile(receipt);
      return receipt;
    }

    // D-a/D-b/D-d: THE one classification pass. Every custody record (system-sender or
    // not) is offered to `classifyProjectHits` first -- steps 1-3 can rescue even a
    // system-sender mail via an explicit title/bundle/reading decision (D-d's own M3
    // case: "system sender + Owner-confirmed include") -- and only a record classification
    // left fully unresolved (no hits, not held) is THEN checked against the merged
    // system-sender list, purely for this receipt's own accounting. This is the same
    // order the common pipeline already used (`resolvePrimaryBucket` only ever runs
    // after `classifyProjectHits`); `refresh()` previously pre-filtered system-sender
    // mail BEFORE it was ever offered a chance to match a rule/table -- that pre-filter
    // is gone (D-d).
    const buckets = new Map();
    for (const record of records) {
      const addresses = addressesOfMail(record);
      const result = classifyProjectHits(
        { id: record.event_id, subject: record.subject, body: record.body_text, addresses, at: record.at },
        { compiledRules, bundles: owner.bundles, readings: owner.readings, vendorLookup: owner.vendors, fields },
      );
      if (result.held) { heldCount += 1; continue; }
      if (result.hits.length === 0) {
        const mailForSystemCheck = { fromDomain: domainOf(record.from?.email ?? ''), from: record.from, subject: record.subject };
        if (detectSystemSender(mailForSystemCheck, systemSenderConfig)) skippedSystemTotal += 1;
        else unattributed += 1;
        continue;
      }
      // A1: `basis` tells apart a subject-rule hit ('제목') from a bundle-table hit
      // ('묶음 확정'), a reading-table hit ('판독...'), and a step-4 supplier-body
      // tie-break ('본문: ...') -- `table_attributed_mails` counts the middle two.
      if (result.basis === '묶음 확정' || (result.basis ?? '').startsWith('판독')) tableAttributedTotal += 1;
      // A2 item 5: "검색 근거로 쓸 수 있는 귀속" -- an approved subject-rule hit, an
      // approved bundle-table hit, or a reading-table hit whose OWN Owner확인 cell is
      // filled in count as search/RAG-eligible; a bare (not-yet-Owner-confirmed)
      // reading decision, and a step-4 body tie-break, do not.
      const readingOwnerConfirmed = result.reading && String(result.reading.ownerConfirmed ?? '').trim() !== '';
      if (result.basis === '제목' || result.basis === '묶음 확정' || readingOwnerConfirmed) projectSearchEligibleAttributions += 1;
      const direction = record.source === 'Gmail_보낸메일_수집' || (record.from && domainOf(record.from.email) === ourDomain) ? 'sent' : 'received';
      // A1: a hit can name more than one project (공유 A;B, or -- new, D-a -- a
      // shared subject-rule outcome is impossible, but a shared bundle/reading hit
      // still is) -- every hit gets its own bucket entry, so the mail lands in EACH
      // named project's ledgers.
      for (const hit of result.hits) {
        const bucket = buckets.get(hit.project_code) ?? [];
        bucket.push({ ...record, direction, label: hit.label, attachment_count: record.attachment_names.length });
        buckets.set(hit.project_code, bucket);
      }
    }
    for (const bucket of buckets.values()) bucket.sort((a, b) => a.at.localeCompare(b.at));

    const presenceByEmail = new Map();
    for (const [code, mails] of buckets) {
      for (const mail of mails) {
        for (const person of [mail.from, ...mail.to, ...mail.cc].filter(Boolean)) {
          const set = presenceByEmail.get(person.email) ?? new Set();
          set.add(code);
          presenceByEmail.set(person.email, set);
        }
      }
    }

    const recordResult = result => {
      if (result.failed) {
        ledgerFailures.push({
          file: result.file, code: result.code, conflict_groups: result.conflict_groups ?? null,
          fresh_duplicate_count: result.fresh_duplicate_count ?? null,
          before_rows: result.before_rows ?? null, after_rows: result.after_rows ?? null,
        });
      }
      return result;
    };
    for (const { project, json } of all) {
      const code = project.project_code;
      if (selectedCodes && !selectedCodes.has(code)) continue;
      const mails = buckets.get(code) ?? [];
      const base = path.join(workspacesRoot, project.folder_name);
      const lineageBase = path.join(workmetaRoot, project.folder_name, 'lineage');
      const allowEmptyForProject = allowEmptyCodes.has(code);

      const contacts = buildContacts({ code, mails, orgConfig, presenceByEmail });
      const history = buildHistory({ code, mails, orgConfig, ruleVersion: json.rule_version });
      const reply = buildReplyStatus({ code, mails, orgConfig, now });

      const contactsResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, CONTACTS_REL), lineagePath: path.join(lineageBase, '연락처_장부.csv.lineage.json'),
        headers: contacts.headers, rows: contacts.rows, keyIndex: CONTACTS_KEY_INDEX, preserveIndices: CONTACTS_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: CONTACTS_REL, now, dry, allowEmpty: allowEmptyForProject,
        partialSourcesInEffect, alternateKeysOf: contactsAlternateKeys,
      }));
      const recvResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, RECV_REL), lineagePath: path.join(lineageBase, '메일_수신이력.csv.lineage.json'),
        headers: history.headers, rows: history.received.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: RECV_REL, now, dry, allowEmpty: allowEmptyForProject, partialSourcesInEffect,
      }));
      const sentResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, SENT_REL), lineagePath: path.join(lineageBase, '메일_발송이력.csv.lineage.json'),
        headers: history.headers, rows: history.sent.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: SENT_REL, now, dry, allowEmpty: allowEmptyForProject, partialSourcesInEffect,
      }));
      const replyResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, REPLY_REL), lineagePath: path.join(lineageBase, '회신_현황.csv.lineage.json'),
        headers: reply.headers, rows: reply.rows, keyIndex: REPLY_KEY_INDEX, preserveIndices: REPLY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: REPLY_REL, now, dry, allowEmpty: allowEmptyForProject, partialSourcesInEffect,
      }));
      if ([contactsResult, recvResult, sentResult, replyResult].some(result => result.empty_allowed_applied)) allowEmptyAppliedTo.add(code);
      if ([contactsResult, recvResult, sentResult, replyResult].some(result => result.shrink_allowed_applied)) shrinkAllowedAppliedTo.add(code); // S1

      projectReports.push({
        project_code: code, folder_name: project.folder_name, rule_version: json.rule_version,
        mails: mails.length, received: recvResult.failed ? null : recvResult.rows, sent: sentResult.failed ? null : sentResult.rows,
        people: contactsResult.failed ? null : contactsResult.rows,
        need_reply: reply.rows.filter(row => row[1] === '답필요').length, waiting_reply: reply.rows.filter(row => row[1] === '회신대기').length,
        contacts: contactsResult, received_history: recvResult, sent_history: sentResult, reply_status: replyResult,
      });
    }

    const receipt = {
      ...baseReceipt(),
      status: (ledgerFailures.length > 0 || unreadableDirsRedacted.length > 0 || ruleFailures.length > 0) ? 'failed' : 'ok',
      events_scanned: { hiworks: eventsScannedHiworks, gmail_sent: eventsScannedGmail },
      skipped_system: skippedSystemTotal, duplicates_dropped: duplicatesDroppedTotal, id_collisions_kept: idCollisionsKeptTotal,
      unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: partialSourcesInEffect,
      allow_empty_applied_to: [...allowEmptyAppliedTo], shrink_allowed_applied_to: [...shrinkAllowedAppliedTo],
      rule_failures: ruleFailures, held_two_projects: heldCount, unattributed, ledger_failures: ledgerFailures, projects: projectReports,
      // A1/A2 (2026-09-21 night addition): both `0` when `bundleTablePath`/
      // `readingTablePath` were never supplied (no table read at all this run).
      owner_table_failures: ownerTableFailures, owner_tables_used: ownerTablesUsed, table_attributed_mails: tableAttributedTotal,
      project_search_eligible_attributions: projectSearchEligibleAttributions,
    };
    writeReceiptFile(receipt);
    return receipt;
  } catch (error) {
    // S5 / fresh-review-3 #7: whatever went wrong, the run still leaves an audit
    // trail -- including whatever project reports had already completed. S-7: the
    // error message is redacted the same way any other receipt field would be.
    writeReceiptFile({
      ...baseReceipt(), status: 'failed',
      error: { code: error?.code ?? 'workspace_ledgers_refresh_unexpected_error', message: redactHostPaths(error?.message ?? String(error)) },
      events_scanned: { hiworks: eventsScannedHiworks, gmail_sent: eventsScannedGmail },
      skipped_system: skippedSystemTotal, duplicates_dropped: duplicatesDroppedTotal, id_collisions_kept: idCollisionsKeptTotal,
      unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: false, allow_empty_applied_to: [...allowEmptyAppliedTo],
      shrink_allowed_applied_to: [...shrinkAllowedAppliedTo],
      rule_failures: ruleFailures, held_two_projects: heldCount, unattributed, ledger_failures: ledgerFailures, projects: projectReports,
      owner_table_failures: ownerTableFailures, owner_tables_used: ownerTablesUsed, table_attributed_mails: tableAttributedTotal,
      project_search_eligible_attributions: projectSearchEligibleAttributions,
    });
    throw error;
  } finally {
    releaseRefreshLock(workspacesRoot);
  }
}
