// Read-only source adapter over the mail collector's normalized event sink
// (<mailbox root>/.../events/<source>/<yyyy>/<mm>.jsonl, schema email.fetch.event.v1).
// The owner names the event file and event id; body text is normalized by the
// gateway's own reader, and the new message is kept apart from quoted history so
// earlier requests are not read as the current one. Nothing is moved or sent.
import { createHash } from 'node:crypto';
import { mailBodyTextFromRecord } from '../../../../gateway/mail_body_excerpt.mjs';
import { sha256Canonical } from '../../../../shared/project_history_envelope.mjs';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, isInstant, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const MAIL_SOURCE_ADAPTER = 'mail-event-v1';
const MAX_EVENT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_BODY_CHARACTERS = 200000;

class MailSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new MailSourceError(code); };
const codeOf = error => (error instanceof MailSourceError || error instanceof SourceReadError
  || error instanceof SourceDocumentError) ? error.code : 'adapter_failed';
const addressRef = address => `mail.address:${createHash('sha256').update(String(address).trim().toLowerCase()).digest('hex').slice(0, 16)}`;
const addresses = list => Array.isArray(list) && list.every(row => row && typeof row.address === 'string' && typeof row.name === 'string');
const render = list => list.map(row => (row.name && row.name !== row.address ? `${row.name} <${row.address}>` : row.address)).join(', ');

// Common reply/forward separators (Korean and English clients) and '>' quoting.
const SEPARATOR = /^-{2,}\s*(original message|원본 메일|원본 메시지|forwarded message|전달된 메시지)\s*-{2,}\s*$/iu;
const WROTE = /^on .{4,200} wrote:\s*$/iu;
const HEADER_FROM = /^(from|보낸 사람|보낸사람)\s*:/iu;
const HEADER_DATE = /^(sent|date|보낸 날짜|날짜)\s*:/iu;
export function splitQuotedHistory(text) {
  const lines = text.split('\n');
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index].trim();
    const header = HEADER_FROM.test(line) && lines.slice(index + 1, index + 5).some(next => HEADER_DATE.test(next.trim()));
    const quoted = line.startsWith('>') && lines.slice(index).filter(next => next.trim()).every(next => next.trim().startsWith('>'));
    if (SEPARATOR.test(line) || WROTE.test(line) || header || quoted) {
      return { body: lines.slice(0, index).join('\n').trim(), quoted: lines.slice(index).join('\n').trim() };
    }
  }
  return { body: text.trim(), quoted: '' };
}

function eventRows(text, eventId) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.includes(eventId)) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.event_id === eventId) rows.push({ row, sha256: sha256Canonical(row) });
  }
  return rows;
}

function documentFor({ admitted, source, item, chosen }) {
  const row = chosen.row;
  if (typeof row.subject !== 'string' || !addresses(row.from) || !addresses(row.to) || !addresses(row.cc)
    || !isInstant(row.received_at) || !Array.isArray(row.attachments)) fail('mail_event_shape_invalid');
  const { body, quoted } = splitQuotedHistory(mailBodyTextFromRecord(row, { maxChars: MAX_BODY_CHARACTERS }) ?? '');
  const sender = row.from[0]?.address ?? null;
  const locator = { event_id: row.event_id, path: [...item.path], event_sha256: chosen.sha256 };
  const units = [
    { unit_kind: 'header', locator: { ...locator, part: 'header' }, occurred_at: row.received_at,
      speaker_ref: sender ? addressRef(sender) : null,
      text: [`Subject: ${row.subject}`, `From: ${render(row.from)}`, `To: ${render(row.to)}`,
        row.cc.length ? `Cc: ${render(row.cc)}` : '', `Date: ${row.received_at}`].filter(Boolean).join('\n') },
    { unit_kind: 'body', locator: { ...locator, part: 'body' }, text: body, occurred_at: row.received_at,
      speaker_ref: sender ? addressRef(sender) : null },
    { unit_kind: 'quoted', locator: { ...locator, part: 'quoted_history' }, text: quoted, occurred_at: null, speaker_ref: null },
  ];
  const attachments = row.attachments.filter(att => att && typeof att === 'object');
  const components = attachments.map((att, index) => ({ kind: 'attachment', id: `a${index}`, sha256: att.content_sha256 }))
    .filter(component => /^sha256:[0-9a-f]{64}$/u.test(component.sha256 ?? ''));
  const facts = [
    { name: 'mail.source', value: String(row.source ?? ''), at: null },
    { name: 'mail.thread_id', value: row.thread_id ?? null, at: null },
    { name: 'mail.provider_message_id', value: String(row.provider_message_id ?? ''), at: null },
    { name: 'mail.from', value: sender, at: row.received_at },
    { name: 'mail.to_count', value: row.to.length, at: null },
    { name: 'mail.cc_count', value: row.cc.length, at: null },
    { name: 'mail.attachment_count', value: attachments.length, at: null },
    { name: 'mail.attachment_names', value: attachments.map(att => String(att.name ?? '')).filter(Boolean).join(' | ') || null, at: null },
    { name: 'mail.has_quoted_history', value: quoted.length > 0, at: null },
  ];
  return buildSourceDocument({ admitted, sourceKind: 'mail', rootRef: source.root_ref, item,
    adapterProfile: MAIL_SOURCE_ADAPTER, primaryRevisionSha256: chosen.sha256,
    components, title: row.subject, validAt: row.received_at, knownAt: isInstant(row.ingested_at) ? row.ingested_at : null,
    timeBasis: 'mail_received_at', facts, units });
}

export async function readMailSourceDocuments({ admitted, source, rootPath }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'mail', root_ref: source.root_ref,
    item_id: item.item_id, status, ...extra });
  let root;
  try { root = openSourceRoot(rootPath); } catch (error) {
    for (const item of source.items) outcome(item, 'failed', { code: codeOf(error) });
    return { documents, results };
  }
  const files = new Map();
  for (const item of source.items) {
    try {
      const key = item.path.join('/');
      if (!files.has(key)) {
        try { files.set(key, await root.readText(item.path, MAX_EVENT_FILE_BYTES)); } catch (error) {
          if (error?.code !== 'source_missing') throw error;
          files.set(key, null);
        }
      }
      if (files.get(key) === null) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const file = files.get(key);
      const rows = eventRows(file.text, item.item_id)
        .sort((a, b) => String(a.row.ingested_at ?? '').localeCompare(String(b.row.ingested_at ?? '')) || a.sha256.localeCompare(b.sha256));
      if (rows.length === 0) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const chosen = item.revision_policy === 'exact' ? rows.find(row => row.sha256 === item.revision_sha256) : rows.at(-1);
      if (!chosen) { outcome(item, 'stale_grant', { code: 'granted_revision_absent' }); continue; }
      // The revision is the event row itself (plus attachment digests). The month
      // file digest is left out so other mails in that file never look like a change.
      const document = documentFor({ admitted, source, item, chosen });
      documents.push(document);
      outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key });
    } catch (error) {
      outcome(item, 'failed', { code: codeOf(error) });
    }
  }
  return { documents, results };
}
