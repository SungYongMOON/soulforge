// Reads mail custody JSONL events from caller-supplied directories (hiworks and
// gmail-sent custody share the same event shape: subject, from{name,address}|string,
// to[], cc[], received_at, body_text, attachments[], event_id) and classifies each
// event against compiled mail-routing rules in the same pass.
//
// `loadMailEvents`: no longer called by `refresh()` or `previewRule` (K2, coordinator
// fresh review round 3 -- both now read custody through `common_events.mjs`'s
// `loadRawMailRecords` + `cachedLoadRecords`, the same loader/window the common
// pipeline uses, so a rule preview matches exactly what the next refresh will write).
// Kept as a public export (`index.mjs`) for external/back-compat callers and its own
// tests -- only event metadata (subject, participants, attachment count,
// classification) ever leaves it. `body_text` and attachment names are read solely to
// build the text a rule's `match_fields` are tested against; both fall out of scope
// before it returns.
// The lower-level pieces it is now built from -- `collectCandidatesFromDirs` and
// `dedupeAndAssignIds`, both exported -- do NOT carry that same restriction: they are
// the shared custody-reading/id-derivation primitives `common_events.mjs`'s loader
// (the one both `refresh()` and the common pipeline read through) also uses, and that
// loader's whole purpose requires keeping `body_text` (spec section 1 step 4's
// supplier-body confirmation, now run by `refresh()` too -- D-a).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { classifyMail, DEFAULT_MATCH_FIELDS, MAX_BODY_TEXT_CHARS } from './classifier.mjs';
import { normalizeSubject } from './ledgers.mjs';

// S-c (coordinator, fresh review round 3): kept as its own named list (not just baked
// into the regex below) so `systemSenderPatternsFromConfig` can filter it per-domain
// for `system_sender_exclude_domains`, and drop it entirely for `system_sender_builtin:
// false`.
export const DEFAULT_SYSTEM_SENDER_DOMAINS = Object.freeze([
  'plaud.ai', 'slack.com', 'linear.app', 'hiworks.com', 'accounts.google.com', 'smartsheet.com', 'go.mathworks.com', 'marketing.analog.com',
]);
function domainAlternationPattern(domains) {
  const escaped = domains.map(domain => domain.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return new RegExp(`@(${escaped.join('|')})$`, 'iu');
}
export const DEFAULT_SYSTEM_SENDER_PATTERNS = Object.freeze([domainAlternationPattern(DEFAULT_SYSTEM_SENDER_DOMAINS)]);
export const DEFAULT_SKIP_SUBJECT_PATTERNS = Object.freeze([/\[Plaud-AutoFlow\]/iu]);
const MAX_LINE_BYTES = 4 * 1024 * 1024;

// Matches only the `"Name" <addr>` shape (angle brackets required). A greedy
// `([^"'<]*)` name capture with an *optional* trailing `<...>` (as a single combined
// pattern) mis-parses a bare `user@domain` string: backtracking finds the shortest
// valid split, which is not "whole string is the address" but a split partway through
// the local part -- e.g. `staff@client.example` used to yield name `staf`, email
// `f@client.example`. Requiring the closing `>` here, and handling the bare-address
// case as its own branch below, avoids that trap.
const ANGLE_ADDRESS = /^"?'?([^"'<]*?)'?"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>$/u;

/**
 * S6: splits a multi-recipient field string (`"홍 <a@b.com>, 김 <c@d.com>"`) on
 * top-level commas/semicolons -- respecting a quoted display name (`"Kim, S." <..>`)
 * and an angle-bracketed address, neither of which should be split on. Not a general
 * RFC 5322 address-list parser; good enough for custody's own recorded from/to/cc text.
 */
function splitAddressList(raw) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let angleDepth = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') { inQuotes = !inQuotes; current += char; continue; }
    if (!inQuotes && char === '<') { angleDepth += 1; current += char; continue; }
    if (!inQuotes && char === '>') { angleDepth = Math.max(0, angleDepth - 1); current += char; continue; }
    if (!inQuotes && angleDepth === 0 && (char === ',' || char === ';')) { parts.push(current); current = ''; continue; }
    current += char;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

function parseAddressString(raw) {
  const trimmed = String(raw ?? '').trim();
  const angleMatch = trimmed.match(ANGLE_ADDRESS);
  if (angleMatch) return { name: angleMatch[1].trim(), email: angleMatch[2].toLowerCase() };
  // S6: a bare-address fallback must actually BE a bare address. Any leftover
  // whitespace or `<` means this fragment was not a clean `"Name" <addr>` pair and was
  // not a clean bare address either (an unrecognised or malformed residue) -- dropped
  // rather than mis-recorded as if it were an address.
  if (/[\s<]/u.test(trimmed)) return null;
  return { name: '', email: trimmed.toLowerCase() };
}

/**
 * Parses a from/to/cc field (string `"Name" <addr>`, a comma/semicolon-separated list
 * of those, or bare `addr`, or object `{name|display_name, address|email}`, or an
 * array of any of those) into `{name, email}` records. Entries without a usable `@`
 * address, or an unparseable residue, are dropped.
 */
export function parseAddressField(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap(value => {
    if (typeof value === 'string') return splitAddressList(value).map(parseAddressString);
    return [{ name: String(value?.name ?? value?.display_name ?? '').trim(), email: String(value?.address ?? value?.email ?? '').toLowerCase() }];
  }).filter(person => person !== null && person.email.includes('@'))
    .map(person => ({ ...person, name: person.name.replace(/^['"]+|['"]+$/gu, '').split('/')[0].trim() }));
}

function isSystemSender(from, patterns) {
  return Boolean(from) && patterns.some(pattern => pattern.test(from.email));
}
function isSkippedSubject(subject, patterns) {
  return patterns.some(pattern => pattern.test(subject));
}

/**
 * D-d (coordinator, fresh review round 2): the legacy org-config key
 * `system_sender_domains` (a flat array of domains -- historically the ONLY
 * system-sender signal `refresh()`'s own custody loading consulted) merges into the
 * built-in `DEFAULT_SYSTEM_SENDER_PATTERNS` list here, in ONE function, so both this
 * loader's own (now-optional, see `loadMailEvents`'s own doc) pre-filter AND
 * `common_classifier.mjs`'s `buildSystemSenderConfig` (the common pipeline's own
 * system-sender check, folded into the ONE classification function's downstream
 * bucket resolution) read the exact same merged legacy-domain list -- moved here
 * (previously a `refresh.mjs`-private function) so `common_classifier.mjs` can import
 * it without a circular dependency (this module never imports from either).
 * `common_ledgers.system_notification_sources` (the OTHER existing org-config key,
 * named/labelled sources) is a separate, additional signal folded in by
 * `buildSystemSenderConfig` itself, not here -- this function only ever produces the
 * legacy, unnamed-domain half of the merge.
 *
 * S-c (coordinator, fresh review round 3): two more top-level org-config keys, same
 * level as `system_sender_domains`:
 * - `system_sender_builtin: false` drops `DEFAULT_SYSTEM_SENDER_DOMAINS` entirely from
 *   the merge (an org whose own domain collides with a built-in one, or that wants to
 *   own the whole list itself, opts out completely). Any value other than the literal
 *   `false` (including omitted) keeps the built-in list, matching every other
 *   opt-in-by-default org-config boolean in this codebase.
 * - `system_sender_exclude_domains` (array of domain strings) removes specific
 *   domains from the BUILT-IN list only. `system_sender_domains` (the org's own
 *   additions) is never filtered by this -- re-adding an excluded domain there wins,
 *   not a silent no-op, since an operator explicitly listing a domain is a stronger
 *   signal than a generic exclusion.
 */
export function systemSenderPatternsFromConfig(orgConfig) {
  const builtinEnabled = orgConfig?.system_sender_builtin !== false;
  const excludeDomains = new Set(
    (Array.isArray(orgConfig?.system_sender_exclude_domains) ? orgConfig.system_sender_exclude_domains : [])
      .filter(domain => typeof domain === 'string' && domain.trim() !== '')
      .map(domain => domain.trim().toLowerCase()),
  );
  const builtinDomains = builtinEnabled ? DEFAULT_SYSTEM_SENDER_DOMAINS.filter(domain => !excludeDomains.has(domain)) : [];
  const configDomains = Array.isArray(orgConfig?.system_sender_domains)
    ? orgConfig.system_sender_domains.filter(domain => typeof domain === 'string' && domain.trim() !== '').map(domain => domain.trim().toLowerCase())
    : [];
  const allDomains = [...new Set([...builtinDomains, ...configDomains])];
  return allDomains.length === 0 ? [] : [domainAlternationPattern(allDomains)];
}

/**
 * S12: normalises a custody timestamp to a canonical UTC instant (`Date#toISOString`)
 * so every later comparison (sort, `<`/`>` for first/last-seen, `localeCompare`) is a
 * true chronological comparison rather than a lexical one -- a lexical comparison of
 * mixed `+09:00`/`Z` timestamps is wrong (a later UTC instant can sort as an earlier
 * string). An unparseable value passes through unchanged rather than being dropped;
 * downstream sort/compare on it is best-effort, not a hard failure. Exported (D-c,
 * coordinator) so `common_events.mjs`'s loader normalises a custody timestamp
 * identically, rather than a second, potentially-drifting copy.
 */
export function normalizeTimestamp(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

const sha256Hex = text => createHash('sha256').update(text).digest('hex');

/**
 * N-1 (fresh-review-4): a stable, key-order-independent serialisation of a parsed JSON
 * value -- object keys sorted recursively, arrays kept in their own order (array order
 * is meaningful; object key order is not). Used (below) to hash a custody record's
 * *content*, not its raw on-disk byte sequence, so the same mail re-serialised with a
 * different key order (a common effect of custody being re-exported by a different
 * tool version) still hashes identically and collapses as the same duplicate, instead
 * of silently becoming two permanently-distinct synthetic ids for one real mail.
 */
function canonicalJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * S7 / fresh-review-2 #3: a content-derived id for an event whose custody record
 * carries no `event_id`. Built from a hash of the *entire canonicalised record*
 * (N-1), not a handful of derived fields, so two records that differ in any way at
 * all -- including fields this module does not otherwise inspect, like recipients --
 * get different ids, while a re-serialisation with reordered keys does not.
 * (fresh-review-3 #8: only the hash is ever held in memory, never the raw line text
 * itself -- see `readJsonlDir`.) This is vanishingly unlikely to collide in the
 * general case, not a cryptographic uniqueness guarantee; two genuinely identical
 * records still hash the same, which is correct (see the canonical-hash collapse in
 * `loadMailEvents` below) -- `refresh.mjs`'s pre-write duplicate-key check on the
 * freshly built rows is the remaining safety net for any other cause.
 */
function syntheticEventId({ source, canonicalHash }) {
  return `synthetic:${sha256Hex(`${source}|${canonicalHash}`).slice(0, 16)}`;
}

/**
 * S8 (fresh-review-3): lazily yields `{ raw, canonicalHash }` for every JSONL record
 * directly under `dir` (`*.jsonl` files, sorted by name) -- a generator, so a large
 * custody directory's files are read and discarded one at a time rather than all held
 * in memory together, and only a hash of each record's canonicalised content is ever
 * kept (never the raw line text itself: `body_text` is already necessarily held per
 * candidate for matching, and holding the entire raw line as well, for every
 * candidate, for the whole pass, doubled that for no benefit once a hash suffices for
 * identity). N-1: the hash is of the canonicalised (sorted-key) object, not the raw
 * line bytes, so re-serialisation order never defeats de-duplication.
 *
 * The one part of this that must NOT be lazy: `readdirSync(dir)` itself. It is called
 * eagerly, synchronously, at the top of this function (before the generator's first
 * `yield`), so a directory that cannot even be listed -- most dangerously, a
 * `--hiworks-events` typo pointing at a path that does not exist -- throws
 * synchronously from *this call*, not from the first iteration step. `loadMailEvents`
 * wraps the call (not just iteration) in `try`, and treats any thrown error as
 * `unreadableDirs`, never as "this directory is simply empty".
 */
function* readJsonlDir(dir) {
  const names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort();
  for (const name of names) {
    const text = readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) continue;
      let raw;
      try { raw = JSON.parse(line); } catch { continue; }
      yield { raw, canonicalHash: sha256Hex(canonicalJsonStringify(raw)) };
    }
  }
}

/** Cheap, order-independent identity fingerprint for a candidate: normalised subject + timestamp + sender address. Deliberately excludes attachment count -- real custody has been observed recording the same `event_id` twice with only the attachment count differing, and that must still count as one mail, not two. */
function fingerprintOf(candidate) {
  return `${normalizeSubject(candidate.subject)}|${candidate.at}|${candidate.from?.email ?? ''}`;
}

/** Collapses one fingerprint-agreeing group (genuine duplicates) to its single best candidate: most attachments wins, a tie keeps the later line. Returns `{ kept, droppedCount }`. */
function collapseDuplicateGroup(group) {
  let kept = group[0];
  let droppedCount = 0;
  for (const candidate of group.slice(1)) {
    droppedCount += 1;
    if (candidate.attachmentNames.length >= kept.attachmentNames.length) kept = candidate;
  }
  return { kept, droppedCount };
}

/**
 * N-5 (fresh-review-4): a short, stable hash of a fingerprint -- used (below) to
 * disambiguate an id-collision subgroup's effective id. Previously the disambiguating
 * suffix was a positional ordinal (`#2`, `#3`, ...) assigned by iterating fingerprints
 * in sorted-string order; that made the suffix depend on *how many* other subgroups
 * exist and where each one's fingerprint happens to sort, not just on the subgroup's
 * own content -- a newly-arriving colliding mail whose fingerprint sorts earlier than
 * an existing subgroup's could shift that EXISTING subgroup's ordinal, silently
 * changing its downstream 이력키 even though nothing about that subgroup's own data
 * changed. A hash of the fingerprint itself never depends on any other subgroup, so an
 * existing subgroup's effective id never moves just because a new one appeared.
 */
function collisionSuffix(fingerprint) {
  return sha256Hex(fingerprint).slice(0, 8);
}

/**
 * Loads and classifies mail events from `dirs` (each a directory directly holding
 * `*.jsonl` custody files). `source` is a caller-chosen label attached to every
 * returned event (e.g. `하이웍스_수집`, `Gmail_보낸메일_수집`). `compiledRules` and
 * `fields` are passed straight to classification per (deduped) candidate via a direct
 * `classifyMail` call -- fresh-review-5 (design simplification): matching used to run
 * under a per-mail `node:vm` timeout, removed by coordinator decision after three
 * review rounds (fresh-review-3/4/5) showed that machinery creating worse failure
 * modes (a timeout on one project's term deleting an unrelated project's ledger row)
 * than the ReDoS risk it guarded against, for a loopback Owner-only tool. See
 * `classifier.mjs`'s `classifyMail` doc for what still guards against a bad regex
 * (draft-time canary timing, static shape checks, and the read-time/match-time
 * `MAX_BODY_TEXT_CHARS` bound below).
 *
 * Custody itself repeats mails: the same `event_id` can appear on more than one line
 * (across files or within one), and the real hiworks custody has been observed doing
 * exactly this. Candidates sharing a non-empty `event_id` are grouped and checked
 * against a cheap fingerprint (`fingerprintOf`) before being treated as duplicates --
 * an `event_id` *coincidentally* shared by two genuinely different mails (a namespace
 * collision across sources, or corrupt custody) is not silently collapsed. A group
 * whose members all share one fingerprint is a real duplicate: the richer (most
 * attachments; ties keep the later line) candidate survives, counted in
 * `duplicatesDropped`. A group with more than one distinct fingerprint keeps every
 * fingerprint-subgroup, counted in `id_collisions_kept`; each subgroup's effective id
 * is disambiguated by a stable hash of its own fingerprint (N-5, above), never by an
 * ordinal that depends on the other subgroups present.
 *
 * A missing `event_id` never groups with a *different* raw line, but two records with
 * no `event_id` that are content-identical (N-1: canonicalised, so key reordering does
 * not defeat this) are still the same repeated mail (custody is append-only, so this
 * recurs on every future run) -- they are grouped by a hash of their canonicalised
 * content and collapsed exactly like any other duplicate, also counted in
 * `duplicatesDropped`. A no-id candidate that survives gets a content-derived synthetic
 * id (`syntheticEventId`).
 *
 * Returns `{ events, scanned, skippedSystem, duplicatesDropped, idCollisionsKept,
 * unreadableDirs }`. `events[]` never carries `body_text` or attachment names -- only
 * `attachment_count` and the classification result. `at` is always a UTC instant
 * (S12). N-4: `body_text` is capped to `MAX_BODY_TEXT_CHARS` the moment it is read off
 * a candidate, not merely at match time -- candidates held in memory for the whole
 * pass never carry more of a body than matching could ever consult anyway.
 *
 * D-c (coordinator, fresh review round 2): the raw-candidate reading and the
 * id-derivation/dedup/collision logic below are factored into `collectCandidatesFromDirs`
 * and `dedupeAndAssignIds` (both exported) so `common_events.mjs`'s loader -- the one
 * `refresh()` and the common pipeline both now read custody through -- uses the exact
 * SAME synthetic-id recipe and collision-suffix rule this function always has, not a
 * second, simpler one that could assign a different id to the same no-`event_id` mail.
 * This function is now used only by `previewRule` (a per-rule comparison tool, not a
 * second production classifier); its own system-sender/skip-subject pre-filter is
 * unaffected by that split and still applies only here.
 */
export function loadMailEvents({ dirs, source, compiledRules, fields = DEFAULT_MATCH_FIELDS,
  systemSenderPatterns = DEFAULT_SYSTEM_SENDER_PATTERNS, skipSubjectPatterns = DEFAULT_SKIP_SUBJECT_PATTERNS }) {
  const skip = candidate => isSystemSender(candidate.from, systemSenderPatterns) || isSkippedSubject(candidate.subject, skipSubjectPatterns);
  const { candidates, scanned, skipped: skippedSystem, unreadableDirs } = collectCandidatesFromDirs(dirs, { skip });
  const { records, duplicatesDropped, idCollisionsKept } = dedupeAndAssignIds({ candidates, source });

  const events = records.map(record => {
    const { subject, from, to, cc, attachmentNames, bodyText, at, event_id: eventId } = record;
    const match = classifyMail({ subject, body_text: bodyText, attachment_names: attachmentNames }, compiledRules, { fields });
    return { source, event_id: eventId, at, subject, from, to, cc, attachment_count: attachmentNames.length, match };
    // bodyText / attachmentNames go out of scope here: never attached to `events`.
  });
  return { events, scanned, skippedSystem, duplicatesDropped, idCollisionsKept, unreadableDirs };
}

/**
 * D-c: reads every `*.jsonl` record directly under each of `dirs` (sorted by name,
 * per directory) into raw candidates -- `{ rawEventId, subject, from, to, cc,
 * attachmentNames, bodyText, at, canonicalHash }`, always carrying `bodyText`
 * (bounded to `MAX_BODY_TEXT_CHARS` at read time -- N-4) and every parsed address,
 * regardless of caller. `skip(candidate)` (optional) is a caller-supplied predicate --
 * `loadMailEvents` uses it for its own system-sender/skip-subject pre-filter;
 * `common_events.mjs`'s loader (the one both `refresh()` and the common pipeline read
 * through) passes none, since neither path pre-filters any mail out of classification
 * any more (D-d: a mail is only ever judged "system" AFTER the one classification
 * function has had a chance to attribute it via an explicit reading/bundle decision).
 * A directory that cannot even be listed is reported in `unreadableDirs`, never
 * silently treated as empty (S8's own per-directory-atomic-commit contract, preserved
 * from the original `loadMailEvents`).
 */
export function collectCandidatesFromDirs(dirs, { skip = null } = {}) {
  const unreadableDirs = [];
  let scanned = 0, skipped = 0;
  const candidates = [];

  const consumeRecord = ({ raw, canonicalHash }, into) => {
    const subject = String(raw.subject ?? '');
    if (!subject) return;
    into.scanned += 1;
    const from = parseAddressField(raw.from)[0] ?? null;
    const to = parseAddressField(raw.to);
    const cc = parseAddressField(raw.cc);
    const attachmentNames = Array.isArray(raw.attachments)
      ? raw.attachments.map(entry => String(typeof entry === 'string' ? entry : entry?.name ?? entry?.filename ?? '')).filter(Boolean)
      : [];
    const bodyText = String(raw.body_text ?? '').slice(0, MAX_BODY_TEXT_CHARS);
    const at = normalizeTimestamp(raw.received_at ?? raw.ingested_at);
    const rawEventId = String(raw.event_id ?? '').trim();
    const candidate = { rawEventId, subject, from, to, cc, attachmentNames, bodyText, at, canonicalHash };
    if (skip && skip(candidate)) { into.skipped += 1; return; }
    into.candidates.push(candidate);
  };

  for (const dir of dirs) {
    // Buffered per directory (not per whole call): a mid-directory read failure (a
    // later file in an otherwise-readable directory) must not leave that directory's
    // already-consumed records silently mixed into the result while it is also
    // reported as unreadable -- either the whole directory's records commit, or none
    // of them do. This does not defeat the laziness above: only one directory's worth
    // of records is ever buffered at a time, not every directory's at once.
    const local = { candidates: [], scanned: 0, skipped: 0 };
    try {
      const iterator = readJsonlDir(dir);
      // Forces `readdirSync` (and, for a non-empty directory, the first file's first
      // line) to run *now*, so a directory-level error surfaces from this very call --
      // everything after this first step stays lazy, one record at a time, per S8.
      const probe = iterator.next();
      if (!probe.done) {
        consumeRecord(probe.value, local);
        for (const record of iterator) consumeRecord(record, local);
      }
    } catch (error) {
      unreadableDirs.push({ dir, code: error?.code ?? 'workspace_ledgers_mail_dir_unreadable' });
      continue;
    }
    candidates.push(...local.candidates);
    scanned += local.scanned;
    skipped += local.skipped;
  }
  return { candidates, scanned, skipped, unreadableDirs };
}

/**
 * D-c: the id-derivation/dedup/collision-suffix logic, generic over any candidate
 * array shaped like `collectCandidatesFromDirs`'s output (`rawEventId`, `subject`,
 * `from`, `at`, `canonicalHash`, plus whatever else the caller wants carried through
 * unchanged). `source` is folded into a synthetic (no-`event_id`) candidate's id the
 * same way it always was. Grouping/collision handling is scoped to THIS call (one
 * source) -- a cross-source id collision (the same `event_id` present in both hiworks
 * and gmail-sent custody) is handled one level up, once both sources' resolved
 * records are in hand (`disambiguateCrossSourceIds`, exported from `refresh.mjs` and
 * reused by `common_refresh.mjs` for the same reason -- D-c).
 *
 * Returns `{ records, duplicatesDropped, idCollisionsKept }` -- `records` are the
 * input candidates (every original field preserved) plus a resolved `event_id`.
 */
export function dedupeAndAssignIds({ candidates, source }) {
  const byRawId = new Map();
  const byCanonicalHash = new Map();
  candidates.forEach(candidate => {
    if (candidate.rawEventId === '') {
      const list = byCanonicalHash.get(candidate.canonicalHash) ?? [];
      list.push(candidate);
      byCanonicalHash.set(candidate.canonicalHash, list);
      return;
    }
    const list = byRawId.get(candidate.rawEventId) ?? [];
    list.push(candidate);
    byRawId.set(candidate.rawEventId, list);
  });

  let duplicatesDropped = 0;
  let idCollisionsKept = 0;
  const survivors = []; // { candidate, effectiveEventId: string | null }

  for (const [rawId, group] of byRawId) {
    if (group.length === 1) { survivors.push({ candidate: group[0], effectiveEventId: rawId }); continue; }
    const byFingerprint = new Map();
    for (const candidate of group) {
      const fp = fingerprintOf(candidate);
      const list = byFingerprint.get(fp) ?? [];
      list.push(candidate);
      byFingerprint.set(fp, list);
    }
    const fingerprints = [...byFingerprint.keys()];
    if (fingerprints.length > 1) idCollisionsKept += fingerprints.length - 1;
    for (const fp of fingerprints) {
      const { kept, droppedCount } = collapseDuplicateGroup(byFingerprint.get(fp));
      duplicatesDropped += droppedCount;
      // N-5: no subgroup keeps the bare rawId once a real collision is known to exist
      // for this rawId -- every subgroup's id depends only on rawId + its OWN
      // fingerprint, never on how many sibling subgroups exist or their sort order.
      const effectiveEventId = fingerprints.length === 1 ? rawId : `${rawId}~fp:${collisionSuffix(fp)}`;
      survivors.push({ candidate: kept, effectiveEventId });
    }
  }
  for (const group of byCanonicalHash.values()) {
    const { kept, droppedCount } = collapseDuplicateGroup(group);
    duplicatesDropped += droppedCount;
    survivors.push({ candidate: kept, effectiveEventId: null });
  }

  const records = survivors.map(({ candidate, effectiveEventId }) => ({
    ...candidate,
    event_id: effectiveEventId ?? syntheticEventId({ source, canonicalHash: candidate.canonicalHash }),
  }));
  return { records, duplicatesDropped, idCollisionsKept };
}
