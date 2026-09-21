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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { classifyMail, MATCH_FIELDS } from './classifier.mjs';

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

function parseAddressString(raw) {
  const trimmed = String(raw ?? '').trim();
  const angleMatch = trimmed.match(ANGLE_ADDRESS);
  if (angleMatch) return { name: angleMatch[1].trim(), email: angleMatch[2].toLowerCase() };
  return { name: '', email: trimmed.toLowerCase() };
}

/**
 * Parses a from/to/cc field (string `"Name" <addr>` or bare `addr`, or object
 * `{name|display_name, address|email}`, or an array of any of those) into
 * `{name, email}` records. Entries without a usable `@` address are dropped.
 */
export function parseAddressField(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(value => {
    if (typeof value === 'string') return parseAddressString(value);
    return { name: String(value?.name ?? value?.display_name ?? '').trim(), email: String(value?.address ?? value?.email ?? '').toLowerCase() };
  }).filter(person => person.email.includes('@'))
    .map(person => ({ ...person, name: person.name.replace(/^['"]+|['"]+$/gu, '').split('/')[0].trim() }));
}

function isSystemSender(from, patterns) {
  return Boolean(from) && patterns.some(pattern => pattern.test(from.email));
}
function isSkippedSubject(subject, patterns) {
  return patterns.some(pattern => pattern.test(subject));
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
 * `fields` are passed straight to `classifyMail` per event.
 *
 * Returns `{ events, scanned, skippedSystem, unreadableDirs }`. `events[]` never
 * carries `body_text` or attachment names -- only `attachment_count` and the
 * classification result.
 */
export function loadMailEvents({ dirs, source, compiledRules, fields = MATCH_FIELDS,
  systemSenderPatterns = DEFAULT_SYSTEM_SENDER_PATTERNS, skipSubjectPatterns = DEFAULT_SKIP_SUBJECT_PATTERNS }) {
  const events = [];
  const unreadableDirs = [];
  let scanned = 0, skippedSystem = 0;
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
      const match = classifyMail({ subject, body_text: bodyText, attachment_names: attachmentNames }, compiledRules, { fields });
      events.push({
        source,
        event_id: String(raw.event_id ?? ''),
        at: String(raw.received_at ?? raw.ingested_at ?? ''),
        subject,
        from,
        to,
        cc,
        attachment_count: attachmentNames.length,
        match,
      });
      // bodyText / attachmentNames go out of scope here: never attached to `events`.
    }
  }
  return { events, scanned, skippedSystem, unreadableDirs };
}
