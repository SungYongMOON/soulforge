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
import { classifyMail, MATCH_FIELDS } from './classifier.mjs';
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

/**
 * S7 / fresh-review-2 fix #3: a content-derived id for an event whose custody record
 * carries no `event_id`. Hashes the *entire raw custody line* (not a handful of
 * derived fields) so two lines that differ in any way at all -- including fields this
 * module does not otherwise inspect, like recipients -- get different ids; only two
 * genuinely byte-identical lines can still collide, which is correct (they are the
 * same record repeated). This is vanishingly unlikely to collide in the general case,
 * not a cryptographic uniqueness guarantee -- `refresh.mjs`'s pre-write duplicate-key
 * check on the freshly built rows is the actual safety net if it ever does.
 */
function syntheticEventId({ source, rawLine }) {
  const digest = createHash('sha256').update(`${source}|${rawLine}`).digest('hex');
  return `synthetic:${digest.slice(0, 16)}`;
}

/**
 * Every parsed JSONL record directly under `dir` (`*.jsonl` files, sorted by name),
 * paired with its own raw line text. A plain (non-generator) function: `readdirSync`
 * and every `readFileSync` run eagerly inside this call, so any directory-read error
 * -- including a directory that does not exist at all (a `--hiworks-events` typo, most
 * dangerously) -- is thrown synchronously from *this call* and cannot slip past a
 * `try` that only wraps a generator's lazy construction. `loadMailEvents` below is the
 * only caller, and always treats a thrown error here as `unreadableDirs`, never as
 * "this directory is simply empty".
 */
function readJsonlDir(dir) {
  const names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort();
  const records = [];
  for (const name of names) {
    const text = readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) continue;
      try { records.push({ raw: JSON.parse(line), rawLine: line }); } catch { /* skip malformed line */ }
    }
  }
  return records;
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
 * Loads and classifies mail events from `dirs` (each a directory directly holding
 * `*.jsonl` custody files). `source` is a caller-chosen label attached to every
 * returned event (e.g. `하이웍스_수집`, `Gmail_보낸메일_수집`). `compiledRules` and
 * `fields` are passed straight to `classifyMail` per (deduped) candidate.
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
 * fingerprint-subgroup, counted in `id_collisions_kept`; every subgroup after the
 * first gets its `event_id` disambiguated (`<id>#2`, `<id>#3`, ...) so two genuinely
 * different mails never collide on the same downstream 이력키. A missing `event_id`
 * is never grouped with another missing one -- each such candidate gets its own
 * content-derived synthetic id (see `syntheticEventId`).
 *
 * Returns `{ events, scanned, skippedSystem, duplicatesDropped, idCollisionsKept,
 * unreadableDirs }`. `events[]` never carries `body_text` or attachment names -- only
 * `attachment_count` and the classification result. `at` is always a UTC instant (S12).
 */
export function loadMailEvents({ dirs, source, compiledRules, fields = MATCH_FIELDS,
  systemSenderPatterns = DEFAULT_SYSTEM_SENDER_PATTERNS, skipSubjectPatterns = DEFAULT_SKIP_SUBJECT_PATTERNS }) {
  const unreadableDirs = [];
  let scanned = 0, skippedSystem = 0;
  const candidates = [];
  for (const dir of dirs) {
    let records;
    try { records = readJsonlDir(dir); }
    catch (error) { unreadableDirs.push({ dir, code: error?.code ?? 'workspace_ledgers_mail_dir_unreadable' }); continue; }
    for (const { raw, rawLine } of records) {
      const subject = String(raw.subject ?? '');
      if (!subject) continue;
      scanned += 1;
      const from = parseAddressField(raw.from)[0] ?? null;
      if (isSystemSender(from, systemSenderPatterns) || isSkippedSubject(subject, skipSubjectPatterns)) {
        skippedSystem += 1;
        continue;
      }
      const to = parseAddressField(raw.to);
      const cc = parseAddressField(raw.cc);
      const attachmentNames = Array.isArray(raw.attachments)
        ? raw.attachments.map(entry => String(typeof entry === 'string' ? entry : entry?.name ?? entry?.filename ?? '')).filter(Boolean)
        : [];
      const bodyText = String(raw.body_text ?? '');
      const at = normalizeTimestamp(raw.received_at ?? raw.ingested_at);
      const rawEventId = String(raw.event_id ?? '').trim();
      candidates.push({ rawEventId, subject, from, to, cc, attachmentNames, bodyText, at, rawLine });
    }
  }

  // Group by raw event_id (non-empty only); a missing id never groups with another.
  const byRawId = new Map();
  const noIdCandidates = [];
  candidates.forEach(candidate => {
    if (candidate.rawEventId === '') { noIdCandidates.push(candidate); return; }
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
    let subgroupIndex = 0;
    for (const fingerprintGroup of byFingerprint.values()) {
      subgroupIndex += 1;
      const { kept, droppedCount } = collapseDuplicateGroup(fingerprintGroup);
      duplicatesDropped += droppedCount;
      if (subgroupIndex === 1) {
        survivors.push({ candidate: kept, effectiveEventId: rawId });
      } else {
        idCollisionsKept += 1;
        survivors.push({ candidate: kept, effectiveEventId: `${rawId}#${subgroupIndex}` });
      }
    }
  }
  for (const candidate of noIdCandidates) survivors.push({ candidate, effectiveEventId: null });

  const events = [];
  for (const { candidate, effectiveEventId } of survivors) {
    const { subject, from, to, cc, attachmentNames, bodyText, at, rawLine } = candidate;
    const match = classifyMail({ subject, body_text: bodyText, attachment_names: attachmentNames }, compiledRules, { fields });
    const eventId = effectiveEventId ?? syntheticEventId({ source, rawLine });
    events.push({ source, event_id: eventId, at, subject, from, to, cc, attachment_count: attachmentNames.length, match });
    // bodyText / attachmentNames go out of scope here: never attached to `events`.
  }
  return { events, scanned, skippedSystem, duplicatesDropped, idCollisionsKept, unreadableDirs };
}
