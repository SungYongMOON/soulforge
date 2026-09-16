// Read-only source adapter over the Slack history lane's channel custody
// (<channel root>/state/slack-continuous.json, raw/sha256/<xx>/<digest>.json,
// attachments/...). One granted item is one root message named by its Slack
// timestamp; the document carries that message and the replies custody holds
// for it, each located by revision ref and raw digest. Held events (policy
// HOLD, raw body never written) are not documents and are not invented here;
// the adapter reports how many the channel holds as a fact on each document
// so the absence is visible. Nothing is moved or sent.
//
// With a derivation context (v4) the collected bytes of each attachment pointer
// are read from custody, verified against the pointer's digest and handed to the
// attachment text worker; what comes back becomes units of the same document,
// one per page, slide, table or sheet, each locating the attachment by file id
// and digest and the place inside it. The bytes are never copied anywhere but the
// derivation cache the tool configuration names. A pointer whose bytes custody
// does not hold, whose format the tools do not read or whose parse fails stays a
// digest and is counted; the document is not failed for it.
import { createHash } from 'node:crypto';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, SourceDocumentError, SOURCE_LIMITS } from '../../runtime/source_documents.mjs';
import { sha256Canonical } from '../../../../shared/project_history_envelope.mjs';

// v2: the locator digest key is raw_sha256 (a revision anchor); v1 documents keep their keys.
// v3: a text-less file share keeps its stored file metadata as a file_share unit (no body invented).
// v4: attachment bodies derived into units when a derivation context is given and at least one
//     attachment was derived; a document with nothing derived keeps the v3 profile and v3 bytes.
export const SLACK_SOURCE_ADAPTER = 'slack-custody-v3';
export const SLACK_SOURCE_ADAPTER_ATTACHMENTS = 'slack-custody-v4';
export const ATTACHMENT_UNIT_KINDS = Object.freeze(['attachment_page', 'attachment_slide', 'attachment_table', 'attachment_text']);
export const ATTACHMENT_OUTCOMES = Object.freeze(['derived', 'unsupported', 'failed', 'missing']);
export const SLACK_STATE_PATH = Object.freeze(['state', 'slack-continuous.json']);
const MAX_STATE_BYTES = 64 * 1024 * 1024;
const MAX_RAW_BYTES = 4 * 1024 * 1024;
const TS = /^\d{10,16}\.\d{6}$/u;
const SHA_HEX = /^sha256:([0-9a-f]{64})$/u;

class SlackSourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new SlackSourceError(code); };
const codeOf = error => (error instanceof SlackSourceError || error instanceof SourceReadError || error instanceof SourceDocumentError)
  ? error.code : 'slack_read_failed';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const slackTsToIso = ts => new Date(Math.round(Number(ts) * 1000)).toISOString();
const speaker = id => typeof id === 'string' && id ? `slack-user:${id}` : null;

/** Where custody keeps the bytes of one attachment: by content digest, two-character fan-out. */
export const attachmentBytesPath = hex => ['attachments', 'sha256', hex.slice(0, 2), `${hex}.bin`];

/** Reads and shape-checks the channel state: revisions and custody receipts. */
export async function readChannelState(root) {
  const { text } = await root.readText([...SLACK_STATE_PATH], MAX_STATE_BYTES);
  let state;
  try { state = JSON.parse(text); } catch { fail('slack_state_invalid'); }
  if (!plain(state) || !Array.isArray(state.revisions) || !Array.isArray(state.custody_receipts)) fail('slack_state_invalid');
  for (const rev of state.revisions) {
    if (!plain(rev) || !TS.test(rev.message_ts ?? '') || typeof rev.channel_id !== 'string' || typeof rev.revision_ref !== 'string'
      || (rev.thread_ts !== null && !TS.test(rev.thread_ts ?? '')) || !Array.isArray(rev.attachment_pointers)) fail('slack_state_invalid');
  }
  const rawDigests = state.custody_receipts.map(receipt => receipt?.raw_digest).filter(value => SHA_HEX.test(value ?? ''));
  return { state, rawDigests, held: Array.isArray(state.hold_receipts) ? state.hold_receipts.length : 0 };
}

/** Loads every raw event custody names, verifying each file against its digest, indexed by Slack ts. */
export async function readRawEvents(root, rawDigests) {
  const byTs = new Map();
  for (const digest of rawDigests) {
    const hex = SHA_HEX.exec(digest)[1];
    const { text, sha256 } = await root.readText(['raw', 'sha256', hex.slice(0, 2), `${hex}.json`], MAX_RAW_BYTES);
    if (sha256 !== digest) fail('slack_raw_digest_mismatch');
    let raw;
    try { raw = JSON.parse(text); } catch { fail('slack_raw_invalid'); }
    if (!plain(raw) || !TS.test(raw.ts ?? '')) fail('slack_raw_invalid');
    if (!byTs.has(raw.ts)) byTs.set(raw.ts, []);
    byTs.get(raw.ts).push({ digest, raw });
  }
  return byTs;
}

const latestRevision = revisions => [...revisions].sort((a, b) => String(a.revision_ts ?? '').localeCompare(String(b.revision_ts ?? ''))
  || a.revision_ref.localeCompare(b.revision_ref)).at(-1);

/** The stored metadata of a file share, one line per file, in pointer order. Nothing beyond what custody holds. */
export function fileShareText(pointers) {
  return pointers.map(pointer => `file ${pointer.file_id ?? '-'} | ${pointer.mime_type ?? '-'} | ${pointer.size_bytes ?? '-'} bytes | ${pointer.content_sha256}`).join('\n');
}

// A page or slide longer than one unit may hold is split at paragraph breaks,
// never mid-line, and each part says which part it is. Lengths are code points,
// the same measure the document bound uses.
export function splitUnitText(text, max = SOURCE_LIMITS.unit_characters) {
  const whole = String(text ?? '');
  if ([...whole].length <= max) return [whole];
  const parts = [];
  let current = '';
  for (const line of whole.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if ([...candidate].length <= max) { current = candidate; continue; }
    if (current) parts.push(current);
    // One line longer than the bound is cut by code points, in order.
    const chars = [...line];
    let rest = chars;
    while (rest.length > max) { parts.push(rest.slice(0, max).join('')); rest = rest.slice(max); }
    current = rest.join('');
  }
  if (current) parts.push(current);
  return parts;
}

const tableText = rows => (Array.isArray(rows) ? rows : []).map(row => (Array.isArray(row) ? row : []).map(cell => String(cell ?? '').replace(/\s+/gu, ' ').trim()).join(' | ')).join('\n');

/** Units for one derived extract: which kinds and locators each format yields. */
export function attachmentUnits({ extract, format, base, occurredAt, speakerRef }) {
  const units = [];
  const push = (kind, locator, text) => {
    const parts = splitUnitText(text);
    parts.forEach((part, index) => {
      if (!part.trim()) return;
      units.push({ unit_kind: kind, locator: parts.length > 1 ? { ...locator, part: index + 1 } : { ...locator }, text: part,
        occurred_at: occurredAt, speaker_ref: speakerRef });
    });
  };
  if (format === 'pdf') {
    for (const page of Array.isArray(extract?.pages) ? extract.pages : []) {
      if (!plain(page) || !Number.isSafeInteger(page.page)) continue;
      push('attachment_page', { ...base, page: page.page }, page.text);
    }
  } else if (format === 'pptx') {
    for (const slide of Array.isArray(extract?.slides) ? extract.slides : []) {
      if (!plain(slide) || !Number.isSafeInteger(slide.slide)) continue;
      push('attachment_slide', { ...base, slide: slide.slide }, slide.text);
      let table = 0;
      for (const shape of Array.isArray(slide.shapes) ? slide.shapes : []) {
        if (!plain(shape) || !Array.isArray(shape.table)) continue;
        table += 1;
        push('attachment_table', { ...base, slide: slide.slide, table, shape_id: Number.isSafeInteger(shape.shape_id) ? shape.shape_id : null }, tableText(shape.table));
      }
    }
  } else if (format === 'xlsx') {
    for (const sheet of Array.isArray(extract?.sheets) ? extract.sheets : []) {
      if (!plain(sheet) || typeof sheet.sheet !== 'string') continue;
      const rows = new Map();
      for (const cell of Array.isArray(sheet.cells) ? sheet.cells : []) {
        if (!plain(cell) || !Number.isSafeInteger(cell.row)) continue;
        if (!rows.has(cell.row)) rows.set(cell.row, []);
        rows.get(cell.row).push(`${cell.ref}=${String(cell.value ?? '').replace(/\s+/gu, ' ').trim()}`);
      }
      push('attachment_table', { ...base, sheet: sheet.sheet }, [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells.join(' | ')).join('\n'));
    }
  } else if (typeof extract?.text === 'string') {
    push('attachment_text', { ...base }, extract.text);
  }
  return units;
}

// One pointer through the derivation: bytes from custody, digest checked, text
// worker run, units built. The outcome is data on the document, never a failure of it.
async function deriveOne({ root, derivation, pointer, anchor, occurredAt, speakerRef }) {
  const hex = SHA_HEX.exec(pointer.content_sha256)[1];
  const fileId = typeof pointer.file_id === 'string' ? pointer.file_id : null;
  const result = { file_id: fileId, content_sha256: pointer.content_sha256, outcome: 'failed', code: null, format: null, recipe: null, units: [] };
  let bytes;
  try {
    const read = await root.readBytes(attachmentBytesPath(hex), derivation.tools.max_attachment_bytes);
    if (read.sha256 !== pointer.content_sha256) { result.code = 'attachment_digest_mismatch'; return result; }
    bytes = read.bytes;
  } catch (error) {
    const code = codeOf(error);
    result.outcome = code === 'source_missing' ? 'missing' : code === 'source_too_large' ? 'unsupported' : 'failed';
    result.code = code;
    return result;
  }
  let derived;
  try {
    derived = await derivation.derive({ tools: derivation.tools, bytes, sha256: pointer.content_sha256,
      mime: typeof pointer.mime_type === 'string' ? pointer.mime_type : null, name: typeof pointer.name === 'string' ? pointer.name : null,
      source: { kind: 'slack', channel_id: anchor.channel_id, message_ts: anchor.message_ts, file_id: fileId } });
  } catch (error) {
    result.code = typeof error?.code === 'string' ? error.code : 'attachment_derivation_failed';
    return result;
  }
  result.format = typeof derived?.format === 'string' ? derived.format : null;
  result.recipe = plain(derived?.recipe) ? derived.recipe : null;
  if (derived?.status === 'unsupported_format') { result.outcome = 'unsupported'; result.code = 'unsupported_format'; return result; }
  if (derived?.status !== 'ok' || !plain(derived.extract) || derived.extract.status === 'error') {
    result.code = typeof derived?.extract?.code === 'string' ? derived.extract.code : 'attachment_extract_failed';
    return result;
  }
  const base = { ...anchor, file_id: fileId, content_sha256: pointer.content_sha256, format: result.format };
  result.units = attachmentUnits({ extract: derived.extract, format: result.format, base, occurredAt, speakerRef });
  result.outcome = 'derived';
  return result;
}

async function documentFor({ admitted, source, item, root: rootRev, rootRaw, replies, held, custody = null, derivation = null }) {
  const locator = { channel_id: rootRev.channel_id, message_ts: rootRev.message_ts, revision_ref: rootRev.revision_ref, raw_sha256: rootRaw.digest };
  const messageText = String(rootRaw.raw.text ?? '');
  const rootPointers = rootRev.attachment_pointers.filter(pointer => plain(pointer) && SHA_HEX.test(pointer.content_sha256 ?? ''));
  const rootSpeaker = speaker(rootRev.actor?.slack_user_id ?? rootRaw.raw.user);
  const units = [
    // A message with text is its text. A file share without text is not given a
    // body: its unit is the stored file metadata (id, type, size, digest), stated
    // as such, so the message keeps its place and its references without a word
    // being invented. The attachment bytes are handled below, and only under a
    // derivation context.
    ...(messageText.trim() ? [{ unit_kind: 'message', locator: { ...locator, part: 'text' }, text: messageText,
      occurred_at: slackTsToIso(rootRev.message_ts), speaker_ref: rootSpeaker }]
      : [{ unit_kind: 'file_share', locator: { ...locator, part: 'files' }, text: fileShareText(rootPointers),
        occurred_at: slackTsToIso(rootRev.message_ts), speaker_ref: rootSpeaker }]),
    ...replies.map(({ rev, rawEntry }) => ({ unit_kind: 'reply',
      locator: { channel_id: rev.channel_id, message_ts: rev.message_ts, thread_ts: rev.thread_ts, revision_ref: rev.revision_ref, raw_sha256: rawEntry.digest, part: 'text' },
      text: String(rawEntry.raw.text ?? ''), occurred_at: slackTsToIso(rev.message_ts), speaker_ref: speaker(rev.actor?.slack_user_id ?? rawEntry.raw.user) })),
  ];
  const carriers = [{ rev: rootRev, rawEntry: rootRaw }, ...replies];
  const pointers = carriers.flatMap(({ rev }) => rev.attachment_pointers)
    .filter(pointer => plain(pointer) && SHA_HEX.test(pointer.content_sha256 ?? ''));
  const components = [
    ...replies.map(({ rev, rawEntry }) => ({ kind: 'reply', id: rev.message_ts, sha256: rawEntry.digest })),
    ...pointers.map((pointer, index) => ({ kind: 'attachment', id: pointer.file_id ?? `f${index}`, sha256: pointer.content_sha256 })),
  ];
  const at = slackTsToIso(rootRev.message_ts);
  // Attachment bodies: only with a derivation context, pointer by pointer in
  // carrier order, each pointer once even when two revisions name the same bytes.
  const derived = [];
  if (derivation !== null && custody !== null) {
    const seen = new Set();
    for (const { rev, rawEntry } of carriers) {
      for (const pointer of rev.attachment_pointers) {
        if (!plain(pointer) || !SHA_HEX.test(pointer.content_sha256 ?? '') || seen.has(pointer.content_sha256)) continue;
        seen.add(pointer.content_sha256);
        const anchor = { channel_id: rev.channel_id, message_ts: rev.message_ts, revision_ref: rev.revision_ref };
        derived.push(await deriveOne({ root: custody, derivation, pointer, anchor, occurredAt: slackTsToIso(rev.message_ts),
          speakerRef: speaker(rev.actor?.slack_user_id ?? rawEntry.raw.user) }));
      }
    }
    for (const row of derived) units.push(...row.units);
  }
  const counted = outcome => derived.filter(row => row.outcome === outcome).length;
  const derivedRows = derived.filter(row => row.outcome === 'derived');
  const facts = [
    { name: 'slack.channel_id', value: rootRev.channel_id, at: null },
    { name: 'slack.workspace_id', value: rootRev.workspace_id ?? null, at: null },
    { name: 'slack.reply_count', value: replies.length, at },
    { name: 'slack.attachment_count', value: pointers.length, at: null },
    { name: 'slack.attachment_names', value: pointers.map(p => String(p.mime_type ?? '')).filter(Boolean).join(' | ') || null, at: null },
    { name: 'slack.edited', value: rootRaw.raw.edited ? true : false, at },
    { name: 'slack.reaction_count', value: Array.isArray(rootRaw.raw.reactions) ? rootRaw.raw.reactions.length : 0, at },
    { name: 'slack.channel_held_events', value: held, at: null },
    // True only when at least one attachment's bytes were read from custody and
    // turned into units of this document; otherwise the bytes stay digests.
    { name: 'slack.attachment_bodies_processed', value: derivedRows.length > 0, at: null },
    { name: 'slack.message_has_text', value: messageText.trim().length > 0, at: null },
    // The derivation counts appear only where there was something to derive, so a
    // message without attachments is the same document with or without the context.
    ...(derivation === null || pointers.length === 0 ? [] : [
      { name: 'slack.attachment_derived_count', value: derivedRows.length, at: null },
      { name: 'slack.attachment_unsupported_count', value: counted('unsupported'), at: null },
      { name: 'slack.attachment_failed_count', value: counted('failed'), at: null },
      { name: 'slack.attachment_missing_count', value: counted('missing'), at: null },
      { name: 'slack.attachment_unit_count', value: derivedRows.reduce((total, row) => total + row.units.length, 0), at: null },
      // How the text was made: the recipe of every derived attachment, so a
      // different worker or interpreter is a different document, never a silent swap.
      { name: 'slack.attachment_recipes_sha256', value: derivedRows.length === 0 ? null
        : sha256Canonical(derivedRows.map(row => ({ content_sha256: row.content_sha256, format: row.format, recipe: row.recipe }))
          .sort((a, b) => a.content_sha256.localeCompare(b.content_sha256))), at: null },
    ]),
  ];
  const document = buildSourceDocument({ admitted, sourceKind: 'slack', rootRef: source.root_ref, item,
    adapterProfile: derivedRows.length > 0 ? SLACK_SOURCE_ADAPTER_ATTACHMENTS : SLACK_SOURCE_ADAPTER,
    primaryRevisionSha256: rootRaw.digest, components,
    title: messageText.split('\n')[0] || `slack file share ${rootRev.message_ts}`,
    validAt: at, knownAt: null, timeBasis: 'slack_message_ts', facts, units });
  return { document, attachments: derived.map(({ units: rows, ...row }) => ({ ...row, units: rows.length })) };
}

/**
 * One granted Slack channel root. Returns the documents and one result per item.
 * `derivation` (optional) is the attachment derivation context; with it each
 * result of a prepared item also lists what happened to its attachments.
 */
export async function readSlackSourceDocuments({ admitted, source, rootPath, derivation = null }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'slack', root_ref: source.root_ref, item_id: item.item_id, status, ...extra });
  if (derivation !== null && (!plain(derivation) || !plain(derivation.tools) || typeof derivation.derive !== 'function')) {
    for (const item of source.items) outcome(item, 'failed', { code: 'attachment_derivation_invalid' });
    return { documents, results };
  }
  let root, channel, rawByTs;
  try {
    root = openSourceRoot(rootPath);
    channel = await readChannelState(root);
    rawByTs = await readRawEvents(root, channel.rawDigests);
  } catch (error) {
    for (const item of source.items) outcome(item, 'failed', { code: codeOf(error) });
    return { documents, results };
  }
  const { state, held } = channel;
  for (const item of source.items) {
    try {
      if (!TS.test(item.item_id)) { outcome(item, 'failed', { code: 'slack_item_not_a_ts' }); continue; }
      const own = state.revisions.filter(rev => rev.message_ts === item.item_id && (rev.thread_ts === null || rev.thread_ts === rev.message_ts));
      if (own.length === 0) { outcome(item, 'missing', { code: 'source_missing' }); continue; }
      const rootRev = latestRevision(own);
      const rawCandidates = rawByTs.get(rootRev.message_ts) ?? [];
      const rootRaw = item.revision_policy === 'exact' ? rawCandidates.find(entry => entry.digest === item.revision_sha256) : rawCandidates.at(-1);
      if (!rootRaw) { outcome(item, item.revision_policy === 'exact' ? 'stale_grant' : 'missing', { code: item.revision_policy === 'exact' ? 'granted_revision_absent' : 'source_missing' }); continue; }
      const replies = state.revisions.filter(rev => rev.thread_ts === item.item_id && rev.message_ts !== item.item_id)
        .sort((a, b) => a.message_ts.localeCompare(b.message_ts))
        .map(rev => ({ rev, rawEntry: (rawByTs.get(rev.message_ts) ?? []).at(-1) }))
        .filter(entry => entry.rawEntry);
      // A message with no text, no reply text and no stored attachment pointer has
      // nothing a document can carry: refused by rule, not invented and not failed.
      const anyPointer = rootRev.attachment_pointers.some(pointer => plain(pointer) && SHA_HEX.test(pointer.content_sha256 ?? ''));
      if (!String(rootRaw.raw.text ?? '').trim() && !anyPointer && !replies.some(r => String(r.rawEntry.raw.text ?? '').trim())) {
        outcome(item, 'refused', { code: 'slack_message_without_content' }); continue;
      }
      const { document, attachments } = await documentFor({ admitted, source, item, root: rootRev, rootRaw, replies, held, custody: root, derivation });
      documents.push(document);
      outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key,
        ...(derivation === null ? {} : { attachments }) });
    } catch (error) {
      outcome(item, 'failed', { code: codeOf(error) });
    }
  }
  return { documents, results };
}

/** Root message timestamps custody holds for this channel, for a caller drafting a grant. */
export async function listSlackRootMessages(rootPath) {
  const root = openSourceRoot(rootPath);
  const { state } = await readChannelState(root);
  return [...new Set(state.revisions.filter(rev => rev.thread_ts === null || rev.thread_ts === rev.message_ts).map(rev => rev.message_ts))].sort();
}

export const rawDigestOf = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
