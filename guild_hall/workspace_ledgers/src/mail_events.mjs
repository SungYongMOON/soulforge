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

/** S7: a stable content-derived id for an event whose custody record carries no `event_id`, so two such events never collide on the same 이력키 (`ledgers.mjs`'s `historyKey`). */
function syntheticEventId({ source, at, subject, fromEmail }) {
  const digest = createHash('sha256').update([source, at, normalizeSubject(subject), fromEmail].join('|')).digest('hex');
  return `synthetic:${digest.slice(0, 16)}`;
}

function* readJsonlDir(dir) {
  let names;
  try { names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort(); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  for (const name of names) {
    const text = readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) continue;
      try { yield JSON.parse(line); } catch { /* skip malformed line */ }
    }
  }
}

/**
 * Loads and classifies mail events from `dirs` (each a directory directly holding
 * `*.jsonl` custody files). `source` is a caller-chosen label attached to every
 * returned event (e.g. `하이웍스_수집`, `Gmail_보낸메일_수집`). `compiledRules` and
 * `fields` are passed straight to `classifyMail` per (deduped) candidate.
 *
 * Custody itself repeats mails: the same `event_id` can appear on more than one
 * line (across files or within one), and the real hiworks custody has been observed
 * doing exactly this. Candidates are deduped by their raw (non-empty) `event_id`
 * *before* classification -- classifying, then counting, would double-count a
 * repeated mail. Within one `event_id` group, the candidate with the most
 * attachments is kept; a tie keeps the later line (custody append order). A missing
 * `event_id` is never grouped with another missing one -- each such candidate is
 * unique on its own and gets its own synthesised id (S7) below.
 *
 * Returns `{ events, scanned, skippedSystem, duplicatesDropped, unreadableDirs }`.
 * `events[]` never carries `body_text` or attachment names -- only
 * `attachment_count` and the classification result. `event_id` is synthesised (S7)
 * when custody recorded none; `at` is always a UTC instant (S12).
 */
export function loadMailEvents({ dirs, source, compiledRules, fields = MATCH_FIELDS,
  systemSenderPatterns = DEFAULT_SYSTEM_SENDER_PATTERNS, skipSubjectPatterns = DEFAULT_SKIP_SUBJECT_PATTERNS }) {
  const unreadableDirs = [];
  let scanned = 0, skippedSystem = 0;
  const candidates = [];
  for (const dir of dirs) {
    let iterator;
    try { iterator = readJsonlDir(dir); } catch (error) { unreadableDirs.push({ dir, code: error?.code ?? 'workspace_ledgers_mail_dir_unreadable' }); continue; }
    for (const raw of iterator) {
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
      candidates.push({ rawEventId, subject, from, to, cc, attachmentNames, bodyText, at });
    }
  }

  const byDedupKey = new Map();
  let duplicatesDropped = 0;
  candidates.forEach((candidate, index) => {
    const key = candidate.rawEventId !== '' ? `id:${candidate.rawEventId}` : `noid:${index}`;
    const existing = byDedupKey.get(key);
    if (!existing) { byDedupKey.set(key, candidate); return; }
    duplicatesDropped += 1;
    // most attachments wins; a tie keeps the later line (this candidate, since the
    // forEach walks candidates in the order they were read from custody).
    if (candidate.attachmentNames.length >= existing.attachmentNames.length) byDedupKey.set(key, candidate);
  });

  const events = [];
  for (const candidate of byDedupKey.values()) {
    const { rawEventId, subject, from, to, cc, attachmentNames, bodyText, at } = candidate;
    const match = classifyMail({ subject, body_text: bodyText, attachment_names: attachmentNames }, compiledRules, { fields });
    const eventId = rawEventId !== '' ? rawEventId : syntheticEventId({ source, at, subject, fromEmail: from?.email ?? '' });
    events.push({ source, event_id: eventId, at, subject, from, to, cc, attachment_count: attachmentNames.length, match });
    // bodyText / attachmentNames go out of scope here: never attached to `events`.
  }
  return { events, scanned, skippedSystem, duplicatesDropped, unreadableDirs };
}
