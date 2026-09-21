// Reads mail custody JSONL events from caller-supplied directories (hiworks and
// gmail-sent custody share the same event shape: subject, from{name,address}|string,
// to[], cc[], received_at, body_text, attachments[], event_id) and classifies each
// event against compiled mail-routing rules in the same pass.
//
// Only event metadata (subject, participants, attachment count, classification) ever
// leaves this module. `body_text` and attachment names are read solely to build the
// text a rule's `match_fields` are tested against; both fall out of scope before this
// module returns -- no caller ever receives mail body text or attachment names/bytes
// from here.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { classifyMail, MATCH_FIELDS, MAX_BODY_TEXT_CHARS } from './classifier.mjs';
import { normalizeSubject } from './ledgers.mjs';

export const DEFAULT_SYSTEM_SENDER_PATTERNS = Object.freeze([
  /@(plaud\.ai|slack\.com|linear\.app|hiworks\.com|accounts\.google\.com|smartsheet\.com|go\.mathworks\.com|marketing\.analog\.com)$/iu,
]);
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
 * S12: normalises a custody timestamp to a canonical UTC instant (`Date#toISOString`)
 * so every later comparison (sort, `<`/`>` for first/last-seen, `localeCompare`) is a
 * true chronological comparison rather than a lexical one -- a lexical comparison of
 * mixed `+09:00`/`Z` timestamps is wrong (a later UTC instant can sort as an earlier
 * string). An unparseable value passes through unchanged rather than being dropped;
 * downstream sort/compare on it is best-effort, not a hard failure.
 */
function normalizeTimestamp(raw) {
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
 */
export function loadMailEvents({ dirs, source, compiledRules, fields = MATCH_FIELDS,
  systemSenderPatterns = DEFAULT_SYSTEM_SENDER_PATTERNS, skipSubjectPatterns = DEFAULT_SKIP_SUBJECT_PATTERNS }) {
  const unreadableDirs = [];
  let scanned = 0, skippedSystem = 0;
  const candidates = [];

  const consumeRecord = ({ raw, canonicalHash }, into) => {
    const subject = String(raw.subject ?? '');
    if (!subject) return;
    into.scanned += 1;
    const from = parseAddressField(raw.from)[0] ?? null;
    if (isSystemSender(from, systemSenderPatterns) || isSkippedSubject(subject, skipSubjectPatterns)) {
      into.skippedSystem += 1;
      return;
    }
    const to = parseAddressField(raw.to);
    const cc = parseAddressField(raw.cc);
    const attachmentNames = Array.isArray(raw.attachments)
      ? raw.attachments.map(entry => String(typeof entry === 'string' ? entry : entry?.name ?? entry?.filename ?? '')).filter(Boolean)
      : [];
    // N-4: capped here, at read time -- not merely at match time (classifier.mjs's
    // own `fieldText` also bounds it, defense in depth) -- so a candidate never holds
    // more of a body in memory, for the whole pass, than matching could ever consult.
    const bodyText = String(raw.body_text ?? '').slice(0, MAX_BODY_TEXT_CHARS);
    const at = normalizeTimestamp(raw.received_at ?? raw.ingested_at);
    const rawEventId = String(raw.event_id ?? '').trim();
    into.candidates.push({ rawEventId, subject, from, to, cc, attachmentNames, bodyText, at, canonicalHash });
  };

  for (const dir of dirs) {
    // Buffered per directory (not per whole call): a mid-directory read failure (a
    // later file in an otherwise-readable directory) must not leave that directory's
    // already-consumed records silently mixed into the result while it is also
    // reported as unreadable -- either the whole directory's records commit, or none
    // of them do. This does not defeat the laziness above: only one directory's worth
    // of records is ever buffered at a time, not every directory's at once.
    const local = { candidates: [], scanned: 0, skippedSystem: 0 };
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
    skippedSystem += local.skippedSystem;
  }

  // S-4 (fresh-review-4): grouping is naturally scoped to THIS call (one source) --
  // a cross-source id collision (the same event_id present in both hiworks and
  // gmail-sent custody) is handled one level up, by `refresh.mjs`'s `classifyCustody`,
  // once both sources' events are in hand.
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

  const events = [];
  for (const { candidate, effectiveEventId } of survivors) {
    const { subject, from, to, cc, attachmentNames, bodyText, at, canonicalHash } = candidate;
    const eventId = effectiveEventId ?? syntheticEventId({ source, canonicalHash });
    const match = classifyMail({ subject, body_text: bodyText, attachment_names: attachmentNames }, compiledRules, { fields });
    events.push({ source, event_id: eventId, at, subject, from, to, cc, attachment_count: attachmentNames.length, match });
    // bodyText / attachmentNames / canonicalHash go out of scope here: never attached to `events`.
  }
  return { events, scanned, skippedSystem, duplicatesDropped, idCollisionsKept, unreadableDirs };
}
