// Read-only source adapter over the Slack history lane's channel custody
// (<channel root>/state/slack-continuous.json, raw/sha256/<xx>/<digest>.json,
// attachments/...). One granted item is one root message named by its Slack
// timestamp; the document carries that message and the replies custody holds
// for it, each located by revision ref and raw digest. Held events (policy
// HOLD, raw body never written) are not documents and are not invented here;
// the adapter reports how many the channel holds as a fact on each document
// so the absence is visible. Nothing is moved or sent.
import { createHash } from 'node:crypto';
import { openSourceRoot, SourceReadError } from './guarded_files.mjs';
import { buildSourceDocument, SourceDocumentError } from '../../runtime/source_documents.mjs';

export const SLACK_SOURCE_ADAPTER = 'slack-custody-v1';
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

function documentFor({ admitted, source, item, root: rootRev, rootRaw, replies, held }) {
  const locator = { channel_id: rootRev.channel_id, message_ts: rootRev.message_ts, revision_ref: rootRev.revision_ref, raw_digest: rootRaw.digest };
  const units = [
    { unit_kind: 'message', locator: { ...locator, part: 'text' }, text: String(rootRaw.raw.text ?? ''),
      occurred_at: slackTsToIso(rootRev.message_ts), speaker_ref: speaker(rootRev.actor?.slack_user_id ?? rootRaw.raw.user) },
    ...replies.map(({ rev, rawEntry }) => ({ unit_kind: 'reply',
      locator: { channel_id: rev.channel_id, message_ts: rev.message_ts, thread_ts: rev.thread_ts, revision_ref: rev.revision_ref, raw_digest: rawEntry.digest, part: 'text' },
      text: String(rawEntry.raw.text ?? ''), occurred_at: slackTsToIso(rev.message_ts), speaker_ref: speaker(rev.actor?.slack_user_id ?? rawEntry.raw.user) })),
  ];
  const pointers = [rootRev, ...replies.map(r => r.rev)].flatMap(rev => rev.attachment_pointers)
    .filter(pointer => plain(pointer) && SHA_HEX.test(pointer.content_sha256 ?? ''));
  const components = [
    ...replies.map(({ rev, rawEntry }) => ({ kind: 'reply', id: rev.message_ts, sha256: rawEntry.digest })),
    ...pointers.map((pointer, index) => ({ kind: 'attachment', id: pointer.file_id ?? `f${index}`, sha256: pointer.content_sha256 })),
  ];
  const at = slackTsToIso(rootRev.message_ts);
  const facts = [
    { name: 'slack.channel_id', value: rootRev.channel_id, at: null },
    { name: 'slack.workspace_id', value: rootRev.workspace_id ?? null, at: null },
    { name: 'slack.reply_count', value: replies.length, at },
    { name: 'slack.attachment_count', value: pointers.length, at: null },
    { name: 'slack.attachment_names', value: pointers.map(p => String(p.mime_type ?? '')).filter(Boolean).join(' | ') || null, at: null },
    { name: 'slack.edited', value: rootRaw.raw.edited ? true : false, at },
    { name: 'slack.reaction_count', value: Array.isArray(rootRaw.raw.reactions) ? rootRaw.raw.reactions.length : 0, at },
    { name: 'slack.channel_held_events', value: held, at: null },
  ];
  return buildSourceDocument({ admitted, sourceKind: 'slack', rootRef: source.root_ref, item,
    adapterProfile: SLACK_SOURCE_ADAPTER, primaryRevisionSha256: rootRaw.digest, components,
    title: String(rootRaw.raw.text ?? '').split('\n')[0] || `slack message ${rootRev.message_ts}`,
    validAt: at, knownAt: null, timeBasis: 'slack_message_ts', facts, units });
}

/** One granted Slack channel root. Returns the documents and one result per item. */
export async function readSlackSourceDocuments({ admitted, source, rootPath }) {
  const results = [], documents = [];
  const outcome = (item, status, extra = {}) => results.push({ source_kind: 'slack', root_ref: source.root_ref, item_id: item.item_id, status, ...extra });
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
      const document = documentFor({ admitted, source, item, root: rootRev, rootRaw, replies, held });
      documents.push(document);
      outcome(item, 'prepared', { composite_revision_sha256: document.composite_revision_sha256, doc_key: document.doc_key });
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
