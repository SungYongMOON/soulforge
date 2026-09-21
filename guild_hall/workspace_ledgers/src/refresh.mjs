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
import { compileRule, compileRules, MATCH_FIELDS } from './classifier.mjs';
import { listProjects, readRule, validateRule, LINEAGE_SCHEMA } from './rule_store.mjs';
import { DEFAULT_SYSTEM_SENDER_PATTERNS, loadMailEvents } from './mail_events.mjs';
import { buildContacts, buildHistory, buildReplyStatus, decodeCsv, domainOf, encodeCsv, LEDGER_SCHEMA, makeOrgLookup } from './ledgers.mjs';

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
function contactsAlternateKeys(row) {
  const primary = row[CONTACTS_KEY_INDEX];
  const others = String(row[CONTACTS_OTHER_EMAILS_INDEX] ?? '').split(' ').filter(Boolean);
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

// Exported as a test seam (fresh-review-5 #6 asks for direct coverage of all three
// path shapes) -- not part of the module's documented public surface (`index.mjs`
// does not re-export it); every real caller reaches it only through a failure receipt.
export function redactHostPaths(message) {
  if (typeof message !== 'string') return message;
  let out = message.replace(QUOTED_HOST_PATH, (match, quote, innerPath) => `${quote}${path.basename(innerPath)}${quote}`);
  out = out.replace(UNQUOTED_WINDOWS_PATH, match => path.basename(match));
  out = out.replace(UNQUOTED_UNC_PATH, match => path.basename(match));
  out = out.replace(UNQUOTED_POSIX_PATH, (match, pre, p) => `${pre}${path.basename(p)}`);
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
  try { text = readFileSync(orgConfigPath, 'utf8'); }
  catch (error) { fail('workspace_ledgers_org_config_unreadable', error?.code ?? orgConfigPath); }
  try { return JSON.parse(text); }
  catch (error) { fail('workspace_ledgers_org_config_invalid_json', error.message); }
  return null;
}

/**
 * Nit #10/#11: the system-sender skip list used to be only the hardcoded vendor
 * domains in `mail_events.mjs`'s tracked source, with no way to extend it from
 * `refresh`/the CLI. When the org config names its own `system_sender_domains`, those
 * are *merged into* the built-in list (never a replacement -- the built-in vendor
 * domains are still real noise regardless of what an org config additionally names).
 * `previewRule` (fresh-review-3 #6) reads this too, when given `orgConfigPath`.
 */
function systemSenderPatternsFromConfig(orgConfig) {
  const domains = Array.isArray(orgConfig?.system_sender_domains)
    ? orgConfig.system_sender_domains.filter(domain => typeof domain === 'string' && domain.trim() !== '')
    : [];
  if (domains.length === 0) return DEFAULT_SYSTEM_SENDER_PATTERNS;
  const escaped = domains.map(domain => domain.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return [...DEFAULT_SYSTEM_SENDER_PATTERNS, new RegExp(`@(${escaped.join('|')})$`, 'iu')];
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
function readAllRuleJsonSafely(workspacesRoot) {
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
 */
function disambiguateCrossSourceIds(events) {
  const seen = new Set();
  return events.map(event => {
    if (!seen.has(event.event_id)) { seen.add(event.event_id); return event; }
    const basis = `${event.source}|${event.subject}|${event.at}|${event.from?.email ?? ''}`;
    return { ...event, event_id: `${event.event_id}~src:${event.source}~cs:${shortHash(basis)}` };
  });
}

/**
 * fresh-review-5 (design simplification): matching is a direct `classifyMail` call via
 * `mail_events.mjs` -- no bounded/timed classifier to hoist or share here any more.
 */
function classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields, systemSenderPatterns }) {
  assertNoOverlappingCustodyDirs(hiworksDirs, gmailSentDirs);
  const options = systemSenderPatterns ? { systemSenderPatterns } : {};
  const hiworks = loadMailEvents({ dirs: hiworksDirs, source: '하이웍스_수집', compiledRules, fields, ...options });
  const gmail = loadMailEvents({ dirs: gmailSentDirs, source: 'Gmail_보낸메일_수집', compiledRules, fields, ...options });
  const events = disambiguateCrossSourceIds([...hiworks.events, ...gmail.events]);
  return { events, hiworks, gmail };
}

/** fresh-review-3 #10: `dir` (a full host-local path) never leaves this module -- only its basename and which flag it came from. */
function redactUnreadableDirs(hiworksEntries, gmailEntries) {
  return [
    ...hiworksEntries.map(entry => ({ source: 'hiworks-events', dir: path.basename(entry.dir), code: entry.code })),
    ...gmailEntries.map(entry => ({ source: 'gmail-sent-events', dir: path.basename(entry.dir), code: entry.code })),
  ];
}

// ---------------------------------------------------------- S10: custody read cache
// `previewRule` is called interactively (a console iterating on one draft rule) and
// classifies the *same* custody window twice per call (once for the saved rules,
// once with the draft substituted); repeated calls in a short span very often share
// the "before" ruleset (and sometimes the exact same draft) entirely unchanged. This
// cache keys on the actual rule JSON compared, a cheap directory signature (file
// names + size + mtime, not content), and the resolved system-sender patterns
// (fresh-review-3 #6) -- a change to any of those invalidates the entry immediately;
// it never serves custody or rule state that could have changed.
// `refresh()` (which writes real files) intentionally never reads through this cache.
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
function systemSenderSignature(patterns) {
  return Array.isArray(patterns) ? patterns.map(pattern => `${pattern.source}//${pattern.flags}`).join(',') : 'default';
}

function cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields, ruleJsonList, systemSenderPatterns, now = Date.now() }) {
  const key = JSON.stringify({
    rules: ruleJsonList, fields, hiworks: dirsSignature(hiworksDirs), gmail: dirsSignature(gmailSentDirs),
    senders: systemSenderSignature(systemSenderPatterns),
  });
  const cached = custodyCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields, systemSenderPatterns });
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
 * `orgConfigPath` (fresh-review-3 #6, optional) resolves `system_sender_domains` the
 * same way `refresh()` does -- omitted, this uses the built-in default list only, as
 * before. Passing it keeps `previewRule`'s counts consistent with what an actual
 * `refresh()` against the same org config would produce; `saveRuleVersion` can render
 * `previewRule`'s counts straight into the rule's markdown (`measured`), so a mismatch
 * here would otherwise show up there.
 *
 * Saved rules (`beforeJson`, and every entry of `afterJson` except the draft itself)
 * are compiled without re-running the ReDoS timing canaries (fresh-review-3 #5) --
 * `validateRule` above already timed the draft when it validated it; re-timing
 * everything here would be redundant for the draft and non-deterministic validation of
 * already-trusted saved rules. Matching itself is a direct `classifyMail` call
 * (fresh-review-5 design simplification -- see `classifier.mjs`'s `classifyMail` doc).
 *
 * fresh-review-5 #7: a project whose OWN saved rule fails to read/compile is excluded
 * from the comparison set (same as `refresh()`), and is now surfaced in the return
 * value's `rule_failures` -- a previous version silently dropped this, but
 * `saveRuleVersion` can render `previewRule`'s return straight into the Owner-facing
 * rule `.md` as `measured` "fact"; a count computed while some other project's rule
 * was silently excluded needs to say so, not be presented as complete.
 */
export function previewRule({ workspacesRoot, code, draft, hiworksDirs = [], gmailSentDirs = [], fields = MATCH_FIELDS, orgConfigPath = null }) {
  const { ok: all, ruleFailures } = readAllRuleJsonSafely(workspacesRoot);
  const target = all.find(row => row.project.project_code === code);
  const folderName = target ? target.project.folder_name : draft.folder_name ?? null;
  const nextDraft = { ...draft, project_code: code, folder_name: folderName };
  const validation = validateRule(nextDraft, { folderName });
  if (!validation.valid) fail('workspace_ledgers_rule_invalid', validation.errors.join(','));

  const systemSenderPatterns = orgConfigPath ? systemSenderPatternsFromConfig(readOrgConfig(orgConfigPath)) : undefined;
  const beforeJson = all.map(row => row.json);
  const afterJson = target ? beforeJson.map(row => (row.project_code === code ? nextDraft : row)) : [...beforeJson, nextDraft];
  const compiledBefore = compileRules(beforeJson, { timeSafety: false });
  const compiledAfter = compileRules(afterJson, { timeSafety: false });

  const before = cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledBefore, fields, ruleJsonList: beforeJson, systemSenderPatterns });
  const after = cachedClassifyCustody({ hiworksDirs, gmailSentDirs, compiledRules: compiledAfter, fields, ruleJsonList: afterJson, systemSenderPatterns });
  const keyOf = (event, index) => (event.event_id ? `id:${event.event_id}` : `idx:${index}:${event.subject}`);
  const beforeByKey = new Map(before.events.map((event, index) => [keyOf(event, index), event]));
  const afterByKey = new Map(after.events.map((event, index) => [keyOf(event, index), event]));

  const sample = event => ({ at: event.at, subject: event.subject.length > 80 ? event.subject.slice(0, 80) : event.subject });
  let matchedBefore = 0, matchedAfter = 0;
  const movedIn = [], movedOut = [], newlyHeld = [];
  for (const [key, beforeEvent] of beforeByKey) {
    const afterEvent = afterByKey.get(key) ?? beforeEvent;
    const beforeHit = beforeEvent.match.hits.some(hit => hit.project_code === code);
    const afterHit = afterEvent.match.hits.some(hit => hit.project_code === code);
    if (beforeHit) matchedBefore += 1;
    if (afterHit) matchedAfter += 1;
    if (afterHit && !beforeHit) movedIn.push(sample(afterEvent));
    if (beforeHit && !afterHit) movedOut.push(sample(beforeEvent));
    if (afterHit && afterEvent.match.held && !(beforeHit && beforeEvent.match.held)) newlyHeld.push(sample(afterEvent));
  }
  return {
    matched_before: matchedBefore, matched_after: matchedAfter,
    moved_in: movedIn.length, moved_out: movedOut.length, newly_held: newlyHeld.length,
    // The raw custody window is identical for `before` and `after` -- only the rule
    // set differs -- so deduping the same repeated custody lines drops the same count
    // either way; reported once here rather than as a redundant before/after pair.
    duplicates_dropped: before.hiworks.duplicatesDropped + before.gmail.duplicatesDropped,
    id_collisions_kept: before.hiworks.idCollisionsKept + before.gmail.idCollisionsKept,
    // `samples` carries real mail subjects. It is here because the console UI needs
    // it, not for casual printing -- `cli.mjs`'s preview-rule prints counts only
    // unless the caller explicitly asks for `--show-samples`.
    samples: { moved_in: movedIn.slice(0, 10), moved_out: movedOut.slice(0, 10), newly_held: newlyHeld.slice(0, 10) },
    // fresh-review-5 #7: never render straight into an Owner-facing doc without
    // checking this first -- see `saveRuleVersion`'s `measured` handling.
    rule_failures: ruleFailures,
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
 * rawText, rawRowCount, collapsedIdenticalRows }` when the file is safe to merge
 * against. Checked, in order: encoding (no U+FFFD anywhere -- a common CP949/EUC-KR-
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
  return {
    present: true, ok: true, decoded: { headers: decoded.headers, rows: dedupedRows }, rawText,
    rawRowCount: decoded.rows.length, collapsedIdenticalRows,
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
    return { invalid: null, rows, preservedCount: 0, ownerCellsDroppedWithRow: 0, beforeRowCount: 0, collapsedIdenticalRows: 0, oldText: null };
  }
  if (!validated.ok) {
    return { invalid: { code: validated.code, conflictGroups: validated.conflictGroups ?? null }, rows: null,
      preservedCount: 0, ownerCellsDroppedWithRow: 0, beforeRowCount: 0, collapsedIdenticalRows: 0, oldText: null };
  }
  const { decoded, rawText, rawRowCount, collapsedIdenticalRows } = validated;
  const byKey = new Map();
  for (const oldRow of decoded.rows) byKey.set(oldRow[keyIndex], oldRow);
  let byAltKey = null;
  if (alternateKeysOf) {
    byAltKey = new Map();
    for (const oldRow of decoded.rows) {
      for (const altKey of alternateKeysOf(oldRow)) {
        if (altKey && !byAltKey.has(altKey)) byAltKey.set(altKey, oldRow);
      }
    }
  }
  const matchOldRow = newRow => {
    if (!alternateKeysOf) return byKey.get(newRow[keyIndex]);
    for (const altKey of alternateKeysOf(newRow)) {
      const found = byAltKey.get(altKey);
      if (found) return found;
    }
    return undefined;
  };

  let preservedCount = 0;
  const matchedOldRows = new Set();
  const merged = rows.map(newRow => {
    const oldRow = matchOldRow(newRow);
    if (!oldRow) return newRow;
    matchedOldRows.add(oldRow);
    const out = [...newRow];
    for (const index of preserveIndices) {
      const oldValue = oldRow[index];
      if (oldValue !== undefined && oldValue !== '') { out[index] = oldValue; preservedCount += 1; }
    }
    return out;
  });
  // S9 (fresh-review-6 #1: matched by identity -- alternate addresses included when
  // `alternateKeysOf` applies -- not merely by literal key-column equality): an old
  // row no fresh row matched means that mail/person/thread genuinely left the live
  // view (e.g. re-attributed elsewhere); any Owner-entered value on that row is not
  // carried forward -- it survives only in the history archive this refresh is about
  // to write, and this count says how many rows that happened to (never which rows,
  // to avoid surfacing subjects/names in the receipt).
  let ownerCellsDroppedWithRow = 0;
  for (const oldRow of decoded.rows) {
    if (matchedOldRows.has(oldRow)) continue;
    if (preserveIndices.some(index => oldRow[index] !== undefined && oldRow[index] !== '')) ownerCellsDroppedWithRow += 1;
  }
  return { invalid: null, rows: merged, preservedCount, ownerCellsDroppedWithRow, beforeRowCount: rawRowCount, collapsedIdenticalRows, oldText: rawText };
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
  allowEmpty, allowPartialSources = false, alternateKeysOf = null }) {
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
  // fresh-review-6 #4: the empty-refresh guard above only catches an EXACT zero --
  // with `allowPartialSources`, some custody source was unreadable and skipped
  // entirely, which can make a ledger's fresh row count crater to a small fraction of
  // what it was (a 6-row ledger rewritten to 1 row) without ever hitting exact zero.
  // Only checked when `allowPartialSources` is actually in effect for this run -- a
  // normal full-custody refresh can legitimately shrink a ledger a lot (mail
  // re-attributed elsewhere) and is not second-guessed here.
  const shrinkGuardApplies = allowPartialSources && merge.beforeRowCount > 0 && merge.rows.length > 0
    && merge.rows.length < merge.beforeRowCount * 0.5;
  if (shrinkGuardApplies && !allowEmpty) {
    return { failed: true, code: 'workspace_ledgers_ledger_partial_sources_shrink_blocked', before_rows: merge.beforeRowCount,
      after_rows: merge.rows.length, file: `${folder}/${relPath}`, written: false, changed: false };
  }
  const newText = encodeCsv(headers, merge.rows);
  const changed = merge.oldText !== newText;
  const result = { failed: false, rows: merge.rows.length, before_rows: merge.beforeRowCount,
    preserved_owner_cells: merge.preservedCount, owner_cells_dropped_with_row: merge.ownerCellsDroppedWithRow,
    collapsed_identical_rows: merge.collapsedIdenticalRows, empty_allowed_applied: emptyRefreshApplies && allowEmpty,
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
  fields = MATCH_FIELDS, dry = false, receiptsDir, now = new Date().toISOString(), allowEmpty = [], allowPartialSources = false }) {
  if (typeof workspacesRoot !== 'string' || workspacesRoot.trim() === '') fail('workspace_ledgers_workspaces_root_required');
  if (!Array.isArray(hiworksDirs) || !Array.isArray(gmailSentDirs)) fail('workspace_ledgers_refresh_dirs_required');
  if (typeof orgConfigPath !== 'string' || orgConfigPath.trim() === '') fail('workspace_ledgers_org_config_required');
  if (typeof receiptsDir !== 'string' || receiptsDir.trim() === '') fail('workspace_ledgers_receipts_dir_required');
  // S-5: the previous API accepted a bare boolean here and silently treated it (and
  // any other non-array) as an empty list -- a caller still passing `allowEmpty: true`
  // got no error and no override, which looks identical to "did not ask for one".
  if (!Array.isArray(allowEmpty)) fail('workspace_ledgers_allow_empty_must_be_list', typeof allowEmpty);
  const allowEmptyCodes = new Set(allowEmpty);
  const orgConfig = readOrgConfig(orgConfigPath);
  const { ourDomain } = makeOrgLookup(orgConfig);
  const systemSenderPatterns = systemSenderPatternsFromConfig(orgConfig);

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
  let eventsScannedHiworks = 0, eventsScannedGmail = 0, skippedSystemTotal = 0;
  let duplicatesDroppedTotal = 0, idCollisionsKeptTotal = 0, heldCount = 0, unattributed = 0;
  let unreadableDirsRedacted = [];
  let ruleFailures = [];

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

    // fresh-review-3 #5: saved rules are compiled without re-running the (non-
    // deterministic) ReDoS timing canaries -- they were already timed when saved
    // (`saveRuleVersion` -> `validateRule`, default `timeSafety: true`). Matching
    // itself is a direct `classifyMail` call (fresh-review-5 design simplification).
    const compiledRules = all.map(row => row.compiled);
    const { events, hiworks, gmail } = classifyCustody({ hiworksDirs, gmailSentDirs, compiledRules, fields, systemSenderPatterns });
    eventsScannedHiworks = hiworks.scanned; eventsScannedGmail = gmail.scanned;
    skippedSystemTotal = hiworks.skippedSystem + gmail.skippedSystem;
    duplicatesDroppedTotal = hiworks.duplicatesDropped + gmail.duplicatesDropped;
    idCollisionsKeptTotal = hiworks.idCollisionsKept + gmail.idCollisionsKept;
    unreadableDirsRedacted = redactUnreadableDirs(hiworks.unreadableDirs, gmail.unreadableDirs);

    // fresh-review-3 #1: pre-write gate. An unreadable custody directory stops every
    // write for this run -- not just the ones that happen to compute to zero rows --
    // unless the caller explicitly opted into a partial-sources run.
    if (unreadableDirsRedacted.length > 0 && !allowPartialSources) {
      const receipt = {
        ...baseReceipt(), status: 'failed',
        events_scanned: { hiworks: eventsScannedHiworks, gmail_sent: eventsScannedGmail },
        skipped_system: skippedSystemTotal, duplicates_dropped: duplicatesDroppedTotal, id_collisions_kept: idCollisionsKeptTotal,
        unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: false, allow_empty_applied_to: [],
        rule_failures: ruleFailures, held_two_projects: 0, unattributed: 0, ledger_failures: [], projects: [],
      };
      writeReceiptFile(receipt);
      return receipt;
    }

    const buckets = new Map();
    for (const event of events) {
      if (event.match.held) { heldCount += 1; continue; }
      if (event.match.hits.length === 0) { unattributed += 1; continue; }
      const hit = event.match.hits[0];
      const direction = event.source === 'Gmail_보낸메일_수집' || (event.from && domainOf(event.from.email) === ourDomain) ? 'sent' : 'received';
      const bucket = buckets.get(hit.project_code) ?? [];
      bucket.push({ ...event, direction, label: hit.label });
      buckets.set(hit.project_code, bucket);
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
        allowPartialSources, alternateKeysOf: contactsAlternateKeys,
      }));
      const recvResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, RECV_REL), lineagePath: path.join(lineageBase, '메일_수신이력.csv.lineage.json'),
        headers: history.headers, rows: history.received.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: RECV_REL, now, dry, allowEmpty: allowEmptyForProject, allowPartialSources,
      }));
      const sentResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, SENT_REL), lineagePath: path.join(lineageBase, '메일_발송이력.csv.lineage.json'),
        headers: history.headers, rows: history.sent.rows, keyIndex: HISTORY_KEY_INDEX, preserveIndices: HISTORY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: SENT_REL, now, dry, allowEmpty: allowEmptyForProject, allowPartialSources,
      }));
      const replyResult = recordResult(writeLedgerCsv({
        filePath: path.join(base, REPLY_REL), lineagePath: path.join(lineageBase, '회신_현황.csv.lineage.json'),
        headers: reply.headers, rows: reply.rows, keyIndex: REPLY_KEY_INDEX, preserveIndices: REPLY_PRESERVE_INDICES,
        code, folder: project.folder_name, relPath: REPLY_REL, now, dry, allowEmpty: allowEmptyForProject, allowPartialSources,
      }));
      if ([contactsResult, recvResult, sentResult, replyResult].some(result => result.empty_allowed_applied)) allowEmptyAppliedTo.add(code);

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
      unreadable_dirs: unreadableDirsRedacted, allow_partial_sources_applied: unreadableDirsRedacted.length > 0 && allowPartialSources,
      allow_empty_applied_to: [...allowEmptyAppliedTo],
      rule_failures: ruleFailures, held_two_projects: heldCount, unattributed, ledger_failures: ledgerFailures, projects: projectReports,
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
      rule_failures: ruleFailures, held_two_projects: heldCount, unattributed, ledger_failures: ledgerFailures, projects: projectReports,
    });
    throw error;
  } finally {
    releaseRefreshLock(workspacesRoot);
  }
}
