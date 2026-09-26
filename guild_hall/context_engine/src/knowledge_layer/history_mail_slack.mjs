// Bounded, read-only native source readers for one explicitly configured project.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { mailBodyTextFromRecord } from '../../../gateway/mail_body_excerpt.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { splitQuotedHistory } from '../adapters/sources/mail_event_source.mjs';
import { SOURCE_READ_MAX_BYTES, SOURCE_STREAM_MAX_BYTES, openSourceRoot } from '../adapters/sources/guarded_files.mjs';
import { readChannelState } from '../adapters/sources/slack_custody_source.mjs';
import { mailAttributionFor, readMailAttributionIndex } from '../runtime/mail_routes.mjs';
import { isAiWorkMemoRecord } from './history.mjs';

const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SHA = /^sha256:([0-9a-f]{64})$/u;
const TS = /^\d{10,16}\.\d{6}$/u;
const PROJECT = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const DEFAULTS = Object.freeze({ max_files: 128, max_bytes: 256 * 1024 * 1024, max_rows: 100000 });
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const validDay = day => typeof day === 'string' && DAY.test(day)
  && Number.isFinite(Date.parse(day + 'T00:00:00Z'))
  && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && Number.isFinite(Date.parse(value));
const kstDay = instantValue => new Date(Date.parse(instantValue) + 9 * 3600000).toISOString().slice(0, 10);
const nativeId = (prefix, value) => prefix + ':' + createHash('sha256').update(value).digest('hex').slice(0, 32);
const limits = config => {
  const chosen = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const value = config[key] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1 || value > fallback) fail('history_source_bounds_invalid');
    chosen[key] = value;
  }
  return chosen;
};
function scope({ project, fromDate, throughDate, config }) {
  if (!PROJECT.test(project ?? '') || !plain(config) || config.project !== project)
    fail('history_source_project_mismatch');
  if (!validDay(fromDate) || !validDay(throughDate) || fromDate > throughDate)
    fail('history_source_window_invalid');
  return limits(config);
}
const inWindow = (at, fromDate, throughDate) => {
  if (!instant(at)) fail('history_source_timestamp_invalid');
  const day = kstDay(at);
  return day >= fromDate && day <= throughDate;
};
function absolute(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('history_source_path_invalid');
  return path;
}
// The index reader is synchronous. Bind its explicit paths to plain files and a
// fixed size; event and Slack payload reads use openSourceRoot's stronger guard.
function readPlain(path, maxBytes) {
  absolute(path);
  if (/(?:^|[/\\])(?:\.env(?:\.[^/\\]*)?|[^/\\]*(?:credential|secret)[^/\\]*)$/iu.test(path))
    fail('history_source_path_refused');
  const full = resolve(path);
  let stat;
  try {
    for (let cursor = full; ; cursor = dirname(cursor)) {
      const member = lstatSync(cursor);
      if (member.isSymbolicLink() || realpathSync(cursor) !== cursor)
        fail('history_source_path_refused');
      if (dirname(cursor) === cursor) break;
    }
    stat = lstatSync(full);
  }
  catch (error) {
    if (error?.code === 'history_source_path_refused') throw error;
    fail('history_source_file_missing');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || realpathSync(full) !== full) fail('history_source_path_refused');
  if (stat.size > maxBytes) fail('history_source_file_large');
  const bytes = readFileSync(full), after = lstatSync(full);
  if (bytes.length !== stat.size || after.dev !== stat.dev || after.ino !== stat.ino
    || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size)
    fail('history_source_changed_during_read');
  return bytes;
}
const OWNER_TABLE_VIRTUAL_DIR = 'history-owner-tables';
function indexIo(ownerTablePaths = null) {
  return { read: (path, maxBytes) => {
    if (ownerTablePaths !== null && path.startsWith(OWNER_TABLE_VIRTUAL_DIR + '/')) {
      const name = path.slice(OWNER_TABLE_VIRTUAL_DIR.length + 1);
      if (!Object.hasOwn(ownerTablePaths, name)) fail('mail_owner_table_path_missing');
      return readPlain(ownerTablePaths[name], maxBytes);
    }
    return readPlain(path, maxBytes);
  } };
}
function ownerTablePaths(config) {
  if (config.owner_table_paths === undefined) return null;
  if (config.owner_tables_dir !== undefined) fail('mail_owner_table_config_conflict');
  const paths = config.owner_table_paths;
  if (!plain(paths) || Object.keys(paths).length > 10000
    || !Object.entries(paths).every(([name, path]) =>
      /^(?!\.{1,2}$)[^/\\:*?"<>|]{1,255}$/u.test(name)
      && typeof path === 'string' && isAbsolute(path)))
    fail('mail_owner_table_paths_invalid');
  return paths;
}
function textForMail(row) {
  // The gateway helper cuts at maxChars. A source body beyond the fixed bound is
  // refused before it can be silently shortened.
  if (typeof row.body_text === 'string' && row.body_text.length > 2_000_000
    || typeof row.body_html === 'string' && row.body_html.length > 2_000_000)
    fail('mail_body_too_large');
  const normalized = mailBodyTextFromRecord(row, { maxChars: 2_000_001 }) ?? '';
  if (normalized.length > 2_000_000) fail('mail_body_too_large');
  return { body: splitQuotedHistory(normalized).body, normalizedSha: sha(normalized) };
}
const addresses = list => Array.isArray(list)
  ? list.filter(item => plain(item) && typeof item.address === 'string').map(item => item.address) : [];
const displayString = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
function addPersonNames(displayMetadata, list) {
  for (const item of list) if (plain(item) && displayString(item.address)
    && displayString(item.name) && item.name !== item.address)
    displayMetadata.person_names[item.address.toLowerCase()] = item.name;
}
const metadata = () => ({ source_attachments: {}, source_body_sha256: {}, slack_names: {}, person_names: {} });
const bodyInlineImage = item => item.type === 'inline_attachment'
  || item.metadata?.body_inline_image === true;
const result = (records, displayMetadata, excluded, counts, extra = {}) => ({
  records: records.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  displayMetadata, excluded,
  receipt: { status: 'ok', counts: { records: records.length, excluded: excluded.length, ...counts }, ...extra },
});
function mailExcluded(row, config) {
  if (isAiWorkMemoRecord(row))
    return 'explicit_ai_work_note';
  const senders = config.ai_note_senders ?? [], prefixes = config.ai_note_subject_prefixes ?? [];
  if (!Array.isArray(senders) || !senders.every(v => typeof v === 'string')
    || !Array.isArray(prefixes) || !prefixes.every(v => typeof v === 'string'))
    fail('mail_ai_exclusions_invalid');
  if ((row.from ?? []).some(item => senders.some(sender => sender.toLowerCase() === String(item.address).toLowerCase()))) return 'configured_ai_sender';
  if (prefixes.some(prefix => prefix && row.subject.startsWith(prefix))) return 'configured_ai_subject';
  return null;
}

export async function readMailHistory({ project, fromDate, throughDate, config, now = new Date() } = {}) {
  const bound = scope({ project, fromDate, throughDate, config });
  if (!Array.isArray(config.event_dirs) || !config.event_dirs.length
    || !config.event_dirs.every(path => typeof path === 'string' && isAbsolute(path))
    || !Array.isArray(config.strengths) || !config.strengths.length
    || !config.strengths.every(v => ['confirmed', 'unconfirmed'].includes(v))
    || typeof config.index_path !== 'string' || !isAbsolute(config.index_path))
    fail('mail_config_invalid');
  const at = now instanceof Date ? now.toISOString() : now;
  if (!instant(at)) fail('history_source_timestamp_invalid');
  const tablePaths = ownerTablePaths(config);
  const index = readMailAttributionIndex({ io: indexIo(tablePaths), address: config.index_path,
    maxAgeHours: config.max_age_hours ?? 36, now: at,
    orgConfigAddress: config.org_config_path ? absolute(config.org_config_path) : null,
    ownerTablesDir: tablePaths !== null ? OWNER_TABLE_VIRTUAL_DIR
      : config.owner_tables_dir ? absolute(config.owner_tables_dir) : null });
  const routed = mailAttributionFor(index, project);
  const wanted = new Set([...routed].filter(([, strength]) => config.strengths.includes(strength)).map(([id]) => id));
  const files = [];
  for (const directory of config.event_dirs) {
    const root = openSourceRoot(directory);
    const entries = await root.list([]);
    for (const entry of entries) {
      if (!entry.file) continue;
      const full = /^(\d{4})-(\d{2})\.jsonl$/u.exec(entry.name);
      const short = /^(\d{2})\.jsonl$/u.exec(entry.name);
      if (!full && !short) continue;
      const year = full?.[1] ?? basename(directory), month = full?.[2] ?? short[1];
      if (!/^\d{4}$/u.test(year) || year !== basename(directory)
        || !/^(0[1-9]|1[0-2])$/u.test(month))
        fail('mail_event_filename_invalid');
      files.push({ root, name: entry.name, directory, month: year + '-' + month });
    }
  }
  // The sink partitions by the calendar month in received_at (including its
  // offset). At a KST month edge that can be an adjacent month, while a day in
  // the middle of September cannot come from an August partition.
  const firstPossible = new Date(Date.parse(fromDate + 'T00:00:00Z') - 86400000).toISOString().slice(0, 7);
  const lastPossible = new Date(Date.parse(throughDate + 'T00:00:00Z') + 86400000).toISOString().slice(0, 7);
  const windowFiles = files.filter(file => file.month >= firstPossible && file.month <= lastPossible);
  if (windowFiles.length > bound.max_files) fail('mail_file_budget_exceeded');
  if (wanted.size) {
    const present = new Set(windowFiles.map(file => file.month));
    const month = new Date(fromDate.slice(0, 7) + '-01T00:00:00Z');
    const end = throughDate.slice(0, 7);
    while (month.toISOString().slice(0, 7) <= end) {
      const name = month.toISOString().slice(0, 7);
      if (!present.has(name)) fail('mail_event_files_missing');
      month.setUTCMonth(month.getUTCMonth() + 1);
    }
  }
  const selected = new Map(), displayMetadata = metadata(), excludedById = new Map();
  let scannedBytes = 0, scannedRows = 0, matchedRows = 0, selectedBytes = 0;
  // A month of events is streamed line by line with no whole-file budget (one
  // month can pass 256 MiB). Budgets apply to what is selected: each routed event
  // line is bounded by max_line_bytes (default 4 MiB) and all selected lines
  // together by max_bytes. Unrouted lines are only bounded by the adapter's own
  // per-line ceiling and are never kept.
  const lineBytes = config.max_line_bytes ?? 4 * 1024 * 1024;
  if (!Number.isSafeInteger(lineBytes) || lineBytes < 1 || lineBytes > SOURCE_READ_MAX_BYTES) fail('history_source_bounds_invalid');
  for (const file of wanted.size ? windowFiles : []) {
    const scan = await file.root.readLines([file.name], { maxBytes: SOURCE_STREAM_MAX_BYTES, maxLineBytes: SOURCE_READ_MAX_BYTES,
      filter: line => [...wanted].some(id => line.includes(id)) });
    scannedBytes += scan.bytes; scannedRows += scan.scanned;
    for (const line of scan.lines) {
      let row;
      try { row = JSON.parse(line); } catch { fail('mail_event_invalid'); }
      if (!plain(row) || !wanted.has(row.event_id)) continue;
      matchedRows += 1;
      if (matchedRows > bound.max_rows) fail('mail_row_budget_exceeded');
      const size = Buffer.byteLength(line);
      if (size > lineBytes) fail('mail_event_too_large');
      selectedBytes += size;
      if (selectedBytes > bound.max_bytes) fail('mail_byte_budget_exceeded');
      if (!inWindow(row.received_at, fromDate, throughDate)) continue;
      if (typeof row.subject !== 'string' || !Array.isArray(row.attachments)
        || !Array.isArray(row.from) || !Array.isArray(row.to) || !Array.isArray(row.cc)
        || !instant(row.ingested_at)) fail('mail_event_shape_invalid');
      const reason = mailExcluded(row, config);
      const id = nativeId('mail', row.event_id);
      if (reason) {
        if (selected.has(row.event_id)) fail('mail_duplicate_classification_conflict');
        excludedById.set(id, { id, kind: 'mail', reason }); continue;
      }
      if (excludedById.has(id)) fail('mail_duplicate_classification_conflict');
      const { body, normalizedSha } = textForMail(row), bodySha = sha(body);
      const prior = selected.get(row.event_id);
      if (prior && (!normalizedSha || !body || !prior.body))
        fail('mail_duplicate_empty_body');
      if (prior && prior.normalizedSha !== normalizedSha) fail('mail_duplicate_body_conflict');
      const lineSha = sha(line);
      const candidate = { row, body, bodySha, normalizedSha, lineSha, path: join(file.directory, file.name) };
      if (!prior || row.ingested_at < prior.row.ingested_at
        || row.ingested_at === prior.row.ingested_at && lineSha < prior.lineSha)
        selected.set(row.event_id, candidate);
    }
  }
  const records = [];
  for (const [eventId, picked] of selected) {
    const { row, body, bodySha, lineSha, path } = picked, id = nativeId('mail', eventId);
    const attachments = row.attachments.filter(item => plain(item) && ['binary_attachment','file'].includes(item.type)
      && !bodyInlineImage(item) && typeof item.name === 'string')
      .map(item => item.name);
    if (attachments.some(name => !displayString(name))) fail('mail_attachment_name_invalid');
    displayMetadata.source_attachments[id] = attachments;
    displayMetadata.source_body_sha256[id] = bodySha;
    addPersonNames(displayMetadata, [...row.from, ...row.to, ...row.cc]);
    records.push({ id, project, date: kstDay(row.received_at), kind: 'mail', title: row.subject,
      sender: addresses(row.from).join(', '), recipient: addresses(row.to).join(', '),
      attachments, ...(typeof row.thread_id === 'string' ? { thread_ref: 'mail:' + row.thread_id } : {}),
      text: body, text_sha256: bodySha,
      originrefs: [{ source_kind: 'mail', event_id: eventId, event_path: path,
        event_sha256: lineSha,
        attribution: { projects: [...index.byMail.get(eventId).projects],
          strength: index.byMail.get(eventId).strength, basis: index.byMail.get(eventId).basis },
        attachment_metadata: row.attachments.filter(plain).map(item => ({
          type: 'binary_attachment', name: String(item.name ?? ''),
          content_sha256: item.content_sha256 ?? null,
          body_inline_image: bodyInlineImage(item) })) }] });
  }
  return result(records, displayMetadata, [...excludedById.values()], { files: wanted.size ? windowFiles.length : 0, rows: scannedRows,
    matched_rows: matchedRows, attributed: wanted.size, bytes: scannedBytes },
  { index_sha256: index.index_sha256, index_content_sha256: index.content_sha256 });
}

function slackExcluded(raw, config) {
  if (isAiWorkMemoRecord(raw))
    return 'explicit_ai_work_note';
  const users = config.ai_note_user_ids ?? [], markers = config.ai_note_markers ?? [];
  if (!Array.isArray(users) || !users.every(v => typeof v === 'string')
    || !Array.isArray(markers) || !markers.every(v => typeof v === 'string'))
    fail('slack_ai_exclusions_invalid');
  if (users.includes(raw.user)) return 'configured_ai_user';
  if (markers.some(marker => marker && typeof raw.text === 'string' && raw.text.includes(marker)))
    return 'configured_ai_marker';
  return null;
}
function latest(rows) {
  return [...rows].sort((a, b) => String(a.revision_ts ?? '').localeCompare(String(b.revision_ts ?? ''))
    || a.revision_ref.localeCompare(b.revision_ref)).at(-1);
}
const VOLATILE = new Set(['reply_count', 'reply_users', 'reply_users_count', 'latest_reply',
  'reactions', 'pinned_to', 'pinned_info', 'is_locked', 'saved', 'subscribed',
  'last_read', 'unread_count']);
function identityView(value) {
  if (!plain(value) && !Array.isArray(value)) return value;
  if (Array.isArray(value)) return value.map(identityView);
  return Object.fromEntries(Object.entries(value)
    .filter(([key, child]) => !VOLATILE.has(key)
      && !(key === 'thread_ts' && typeof value.ts === 'string' && child === value.ts))
    .map(([key, child]) => [key, identityView(child)]));
}
const messageOf = raw => raw.subtype === 'message_changed' && plain(raw.message) ? raw.message : raw;
export async function readSlackHistory({ project, fromDate, throughDate, config } = {}) {
  const bound = scope({ project, fromDate, throughDate, config });
  if (!Array.isArray(config.channels) || !config.channels.length
    || !config.channels.every(item => plain(item) && typeof item.root === 'string'
      && isAbsolute(item.root) && typeof item.channel_id === 'string' && item.channel_id))
    fail('slack_config_invalid');
  const namesById = config.names_path ? JSON.parse(readPlain(absolute(config.names_path), 4 * 1024 * 1024)) : {};
  if (!plain(namesById) || Object.keys(namesById).length > 10000
    || !Object.entries(namesById).every(([id, name]) => id && displayString(name)))
    fail('slack_names_invalid');
  const displayMetadata = metadata(), records = [], excluded = [];
  let files = 0, bytes = 0, revisions = 0, held = 0, heldTotal = 0, heldTimeUnknown = 0;
  const roots = new Set();
  for (const channel of config.channels) {
    if (roots.has(channel.root)) fail('slack_channel_duplicate_root');
    roots.add(channel.root);
    const root = openSourceRoot(channel.root);
    const { state, held: heldHere } = await readChannelState(root);
    heldTotal += heldHere;
    for (const receipt of state.hold_receipts ?? []) {
      if (!instant(receipt?.received_at)) { heldTimeUnknown += 1; continue; }
      if (!inWindow(receipt.received_at, fromDate, throughDate)) continue;
      held += 1;
      if (typeof receipt?.event_id === 'string' && receipt.event_id)
        excluded.push({ id: nativeId('slack-hold', channel.channel_id + ':' + receipt.event_id),
          kind: 'slack', reason: 'custody_hold' });
    }
    if (state.channel_id && state.channel_id !== channel.channel_id) fail('slack_channel_mismatch');
    const relevant = state.revisions.filter(rev => {
      if (rev.channel_id !== channel.channel_id) fail('slack_channel_mismatch');
      return TS.test(rev.message_ts) && inWindow(new Date(Number(rev.message_ts) * 1000).toISOString(), fromDate, throughDate);
    });
    if (relevant.length > bound.max_rows - revisions) fail('slack_row_budget_exceeded');
    revisions += relevant.length;
    const byTs = new Map();
    for (const rev of relevant) {
      if (!byTs.has(rev.message_ts)) byTs.set(rev.message_ts, []);
      byTs.get(rev.message_ts).push(rev);
    }
    const receipts = new Map();
    for (const receipt of state.custody_receipts) if (SHA.test(receipt?.raw_digest ?? ''))
      receipts.set(receipt.raw_digest, receipt);
    const desired = [...byTs.values()].map(latest).filter(rev => !['delete', 'tombstone'].includes(rev.revision_kind));
    const wantedDigests = new Set(desired.map(rev => rev.source_metadata_digest));
    const rawByIdentity = new Map();
    // Revision metadata hashes the stable Slack identity view; custody addresses
    // canonical raw bytes. Filter revisions first, then resolve only within this
    // explicitly named channel's bounded custody receipts.
    for (const [digest] of receipts) {
      if (rawByIdentity.size === wantedDigests.size) break;
      const hex = SHA.exec(digest)[1];
      if (++files > bound.max_files) fail('slack_file_budget_exceeded');
      const remaining = bound.max_bytes - bytes;
      if (remaining < 1) fail('slack_byte_budget_exceeded');
      const item = await root.readText(['raw', 'sha256', hex.slice(0, 2), hex + '.json'],
        Math.min(remaining, 4 * 1024 * 1024));
      bytes += item.bytes;
      if (item.sha256 !== digest) fail('slack_raw_digest_mismatch');
      let raw;
      try { raw = JSON.parse(item.text); } catch { fail('slack_raw_invalid'); }
      if (!plain(raw)) fail('slack_raw_invalid');
      const identities = [sha256Canonical(identityView(raw)), sha256Canonical(raw), digest];
      for (const identity of identities) if (wantedDigests.has(identity)) {
        if (!rawByIdentity.has(identity)) rawByIdentity.set(identity, { digest, raw });
      }
    }
    for (const [ts, list] of byTs) {
      const rev = latest(list);
      if (['delete', 'tombstone'].includes(rev.revision_kind)) {
        excluded.push({ id: nativeId('slack', channel.channel_id + ':' + ts), kind: 'slack',
          reason: 'deleted_or_held_revision' }); continue;
      }
      const selected = rawByIdentity.get(rev.source_metadata_digest);
      if (!selected) fail('slack_custody_missing');
      const { raw, digest } = selected, message = messageOf(raw);
      if (!plain(message) || message.ts !== ts || typeof message.text !== 'string') fail('slack_raw_invalid');
      const id = nativeId('slack', channel.channel_id + ':' + ts), reason = isAiWorkMemoRecord(raw) || isAiWorkMemoRecord(message)
        ? 'explicit_ai_work_note' : slackExcluded(message, config);
      if (reason) { excluded.push({ id, kind: 'slack', reason }); continue; }
      const pointers = rev.attachment_pointers.filter(plain);
      const attachments = Array.isArray(message.files) ? message.files.filter(plain)
        .map(file => String(file.name ?? file.title ?? '')).filter(Boolean) : [];
      if (attachments.some(name => !displayString(name))) fail('slack_attachment_name_invalid');
      displayMetadata.source_attachments[id] = attachments;
      displayMetadata.source_body_sha256[id] = sha(message.text);
      const user = rev.actor?.slack_user_id ?? message.user ?? '';
      if (namesById[user]) displayMetadata.slack_names[user] = namesById[user];
      const thread = rev.thread_ts ?? ts;
      records.push({ id, project, date: kstDay(new Date(Number(ts) * 1000).toISOString()), kind: 'slack',
        title: message.text.split('\n')[0].slice(0, 200) || 'Slack file share',
        sender: user, recipient: channel.channel_id, attachments,
        thread_ref: 'slack:' + channel.channel_id + ':' + thread,
        text: message.text, text_sha256: sha(message.text),
        originrefs: [{ source_kind: 'slack', channel_id: channel.channel_id, message_ts: ts,
          thread_ts: thread, revision_ref: rev.revision_ref, raw_sha256: digest,
          source_root: channel.root, source_metadata_digest: rev.source_metadata_digest,
          attachment_pointers: pointers,
          attachment_metadata: (Array.isArray(message.files) ? message.files.filter(plain) : [])
            .map(file => ({ type: 'binary_attachment', name: String(file.name ?? file.title ?? '') })) }] });
    }
  }
  const output = result(records, displayMetadata, excluded, { channels: config.channels.length,
    revisions, files, bytes, held, held_total: heldTotal, held_time_unknown: heldTimeUnknown });
  // A custody HOLD is an irreversible per-event exclusion (slack_history README:
  // the held raw event is never written or recoverable), so it cannot be waited
  // out. Held events are excluded and counted (held, held_time_unknown, excluded
  // custody_hold); the fully custodied messages of the window are still returned.
  return output;
}
