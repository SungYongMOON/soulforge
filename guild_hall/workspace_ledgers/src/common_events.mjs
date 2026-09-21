// Raw mail-record loader for the common-folder classification pass
// (`common_refresh.mjs`, `triage.mjs`). Deliberately separate from `mail_events.mjs`'s
// `loadMailEvents`: that function's documented contract is that body text and
// attachment names never leave it (only per-project attribution metadata does) --
// this loader's whole job, by contrast, is org-wide classification and Owner/AI
// triage reading, which explicitly needs the body (spec section 1 step 4's
// supplier-body confirmation) and a preview of it (spec section 7's `listUnclassified`).
// Keeping this as its own module means `mail_events.mjs`'s existing invariant (and its
// tests) are untouched.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MAX_BODY_TEXT_CHARS } from './classifier.mjs';
import { parseAddressField } from './mail_events.mjs';
import { normalizeSubject } from './ledgers.mjs';

const MAX_LINE_BYTES = 4 * 1024 * 1024;

function normalizeTimestamp(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

/** Cheap identity fingerprint for a record with no `event_id` -- same shape as `mail_events.mjs`'s, kept independent so a change to one never silently changes the other's dedup behaviour. */
function fingerprintOf(record) {
  return `${normalizeSubject(record.subject)}|${record.at}|${record.from?.email ?? ''}`;
}

/**
 * Reads every `*.jsonl` file directly under `dir` (sorted by name) into raw records.
 * `source` is a caller-chosen label attached to every record (matches
 * `mail_events.mjs`'s convention -- `하이웍스_수집`/`Gmail_보낸메일_수집`).
 *
 * Dedup: a repeated non-empty `event_id` keeps its first occurrence (custody itself
 * repeats mails -- the same event can appear on more than one line); two records that
 * both lack an `event_id` but share a normalised-subject+timestamp+sender fingerprint
 * are treated as the same repeated mail too. This is simpler than
 * `mail_events.mjs`'s id-collision/fingerprint-subgroup handling (no id-collision
 * disambiguation) -- acceptable here because this loader's output ids are never
 * written into a ledger's own key column (the common-ledger row key is a hash of
 * `source|file|event_id`, not the event_id alone) and triage decisions are keyed by
 * the full custody `event_id`, not a disambiguated one.
 *
 * Returns `{ records, scanned, duplicatesDropped, unreadableDirs }`. Every record
 * keeps `body_text` (bounded to `MAX_BODY_TEXT_CHARS`, same bound `classifier.mjs`
 * matches against) and every parsed address -- this loader's whole purpose is to
 * support classification and read-only triage preview, unlike `mail_events.mjs`.
 */
export function loadRawMailRecords({ dirs, source }) {
  const unreadableDirs = [];
  let scanned = 0;
  const byRawId = new Map();
  const byFingerprint = new Map();
  const order = [];

  for (const dir of dirs) {
    let names;
    try { names = readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort(); }
    catch (error) { unreadableDirs.push({ dir, code: error?.code ?? 'workspace_ledgers_mail_dir_unreadable' }); continue; }
    for (const name of names) {
      const text = readFileSync(path.join(dir, name), 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) continue;
        let raw;
        try { raw = JSON.parse(line); } catch { continue; }
        const subject = String(raw.subject ?? '');
        if (!subject) continue;
        scanned += 1;
        const from = parseAddressField(raw.from)[0] ?? null;
        const to = parseAddressField(raw.to);
        const cc = parseAddressField(raw.cc);
        const attachmentNames = Array.isArray(raw.attachments)
          ? raw.attachments.map(entry => String(typeof entry === 'string' ? entry : entry?.name ?? entry?.filename ?? '')).filter(Boolean)
          : [];
        const body = String(raw.body_text ?? '').slice(0, MAX_BODY_TEXT_CHARS);
        const at = normalizeTimestamp(raw.received_at ?? raw.ingested_at);
        const rawEventId = String(raw.event_id ?? '').trim();
        const record = { source, event_id: rawEventId, subject, from, to, cc, attachment_names: attachmentNames, body_text: body, at };
        if (rawEventId !== '') {
          if (!byRawId.has(rawEventId)) { byRawId.set(rawEventId, record); order.push(record); }
          continue;
        }
        const fp = fingerprintOf(record);
        if (!byFingerprint.has(fp)) { byFingerprint.set(fp, record); order.push({ ...record, event_id: `synthetic:${sha256Prefix(source, fp)}` }); }
      }
    }
  }
  const duplicatesDropped = scanned - order.length;
  return { records: order, scanned, duplicatesDropped, unreadableDirs };
}

function sha256Prefix(source, text) {
  return createHash('sha256').update(`${source}|${text}`).digest('hex').slice(0, 16);
}
