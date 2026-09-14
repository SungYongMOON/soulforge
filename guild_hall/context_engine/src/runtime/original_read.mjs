// Read one item of one project's selected generation back to its original.
//
// The search CLI answers with one line per hit, which is enough to know that
// something exists and never enough to answer with it. This reads the item
// itself: the whole of every unit the collection owner's reader yields, and the
// attachment list the original carries whether or not the message had any words.
//
// What a caller may name is the project, the item, a unit, an attachment and a
// character bound. No path, no root, no query, no revision: the project code
// resolves through one fixed address form, the binding fixes the generation, the
// grant and the roots, and the generation's own manifest is the scope -- an item
// the manifest does not hold is `not_in_scope` rather than something this tool
// goes looking for.
//
// The text comes from re-reading the original through the same adapter that
// prepared it, not from re-parsing custody a second way. The document that
// re-read produces is then compared with the one the manifest recorded: equal
// keys mean the generation still describes what is there, and different keys are
// `revision_mismatch` -- both keys are shown and the read continues, because a
// reader who is told the original moved can still use what it says now.
import { createHash } from 'node:crypto';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { createAliasedStoreIo } from '../adapters/aliased_store_io.mjs';
import { openSourceRoot } from '../adapters/sources/guarded_files.mjs';
import { readChannelState } from '../adapters/sources/slack_custody_source.mjs';
import { openGraphIndex } from './graph_index_generation.mjs';
import { prepareSourceDocuments } from './source_preparation.mjs';
import { mailAttachmentEntries, openAttachmentRoots, readMailAttachment, readSlackAttachment,
  slackAttachmentEntries } from './attachment_access.mjs';
import { deriveAttachment, formatFor } from './attachment_derivation.mjs';

export const ORIGINAL_READ_SCHEMA = 'soulforge.context_estate_original_read.v1';
/** Every status this CLI may report. A caller adds none and renames none. */
export const ORIGINAL_READ_STATUSES = Object.freeze(['ok', 'attachments_none', 'attachment_list_unavailable',
  'bytes_not_collected', 'access_denied', 'hash_mismatch', 'unsupported_format', 'revision_mismatch',
  'not_in_scope', 'investigation_budget_exhausted']);
/** Kinds whose custody stores attachment pointers this tool can follow. */
export const ATTACHMENT_KINDS = Object.freeze(['slack', 'mail']);
export const DEFAULT_MAX_CHARACTERS = 6000;
const PROJECT_CODE = /^[A-Z][0-9A-Z]*(?:-[0-9A-Z]+)+$/u;
const BINDING_FILE = /^graph_index_binding(?:\.[a-z0-9]{1,32})?\.json$/u;
const GENERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;
const UNIT_ID = /^u\d{4}$/u;
const MAX_BINDING_BYTES = 1024 * 1024;
const MAX_GRANT_BYTES = 16 * 1024 * 1024;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export class OriginalReadError extends Error {
  constructor(code) { super(code); this.name = 'OriginalReadError'; this.code = code; }
}
const fail = code => { throw new OriginalReadError(code); };

/** The one address form a project code resolves to. Nothing else is accepted. */
export function bindingAddressFor(code, bindingFile = 'graph_index_binding.unified.json') {
  if (typeof code !== 'string' || !PROJECT_CODE.test(code)) fail('original_read_project_invalid');
  if (typeof bindingFile !== 'string' || !BINDING_FILE.test(bindingFile)) fail('original_read_binding_invalid');
  return `control_root/project-bindings/${code}/${bindingFile}`;
}

export { createAliasedStoreIo };

function readPinned(io, ref, maxBytes, code) {
  let bytes;
  try { bytes = io.read(ref.path, maxBytes); } catch { return fail(code); }
  if (sha256(bytes) !== ref.sha256) fail(code);
  return JSON.parse(bytes);
}

// The grant, narrowed to exactly the one item being read. The document key does
// not depend on the grant's digest, so a narrowed grant produces the same key the
// generation recorded; what it does change is how much custody is opened -- one
// source root, one item, instead of every source the project holds.
function narrowGrant(grant, row) {
  const source = (grant.sources ?? []).find(entry => entry.kind === row.source_kind && entry.root_ref === row.root_ref
    && (entry.items ?? []).some(item => item.item_id === row.item_id));
  if (!source) return null;
  const item = source.items.find(entry => entry.item_id === row.item_id);
  return { grant: { ...grant, sources: [{ kind: source.kind, root_ref: source.root_ref, items: [item] }] }, item };
}

async function rereadOriginal({ io, binding, row, now }) {
  const narrowed = narrowGrant(readPinned(io, binding.grant, MAX_GRANT_BYTES, 'original_read_grant_unavailable'), row);
  if (narrowed === null) return { document: null, code: 'item_not_in_grant', rootPath: null };
  const rootPath = binding.source_roots?.[row.root_ref] ?? null;
  if (typeof rootPath !== 'string') return { document: null, code: 'source_root_unbound', rootPath: null };
  const admission = binding.admission
    ? readPinned(io, binding.admission, MAX_BINDING_BYTES, 'original_read_admission_unavailable') : null;
  let prepared;
  try {
    prepared = await prepareSourceDocuments({ grant: narrowed.grant, roots: { [row.root_ref]: rootPath },
      now, admission });
  } catch (error) { return { document: null, code: String(error?.code ?? 'original_reread_failed'), rootPath }; }
  const document = prepared.documents[0] ?? null;
  const result = prepared.coverage.items[0] ?? null;
  return { document, rootPath, item: narrowed.item,
    code: document ? null : String(result?.code ?? result?.status ?? 'original_absent') };
}

// ---------------------------------------------------------------- units
function renderUnits(document, { unitId, maxChars }) {
  const wanted = unitId === null ? document.units : document.units.filter(unit => unit.unit_id === unitId);
  const rows = [];
  let budget = maxChars;
  for (const unit of wanted) {
    const characters = [...unit.text].length;
    const shown = budget <= 0 ? 0 : Math.min(characters, budget);
    budget -= shown;
    rows.push({ unit_id: unit.unit_id, unit_kind: unit.unit_kind, occurred_at: unit.occurred_at ?? null,
      characters, shown, truncated: shown < characters,
      text: shown === characters ? unit.text : [...unit.text].slice(0, shown).join('') });
  }
  return { units: rows, requested_unit_found: unitId === null || rows.length > 0,
    characters_total: document.units.reduce((sum, unit) => sum + [...unit.text].length, 0),
    characters_shown: rows.reduce((sum, row) => sum + row.shown, 0) };
}

// ---------------------------------------------------------- attachments
async function slackAttachments({ rootPath, itemId }) {
  const root = openSourceRoot(rootPath);
  const { state } = await readChannelState(root);
  const revisions = state.revisions.filter(revision => revision.message_ts === itemId || revision.thread_ts === itemId);
  const pointers = revisions.sort((a, b) => a.message_ts.localeCompare(b.message_ts))
    .flatMap(revision => revision.attachment_pointers ?? []);
  return slackAttachmentEntries(pointers);
}

async function mailRow({ rootPath, document }) {
  const locator = document.units[0]?.locator ?? null;
  if (!locator || !Array.isArray(locator.path)) return null;
  const root = openSourceRoot(rootPath);
  const { lines } = await root.readLines(locator.path, { filter: line => line.includes(locator.event_id) });
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row?.event_id !== locator.event_id) continue;
    if (sha256Canonical(row) === document.primary_revision_sha256) return row;
  }
  return null;
}

async function attachmentList({ document, row, rootPath, sourceKind, tools }) {
  if (!ATTACHMENT_KINDS.includes(sourceKind)) {
    return { status: 'attachment_list_unavailable', entries: [],
      detail: `custody for ${sourceKind} stores no attachment pointer this tool can follow` };
  }
  const entries = sourceKind === 'slack'
    ? await slackAttachments({ rootPath, itemId: document.item_id })
    : (row === null ? null : mailAttachmentEntries(row));
  if (entries === null) return { status: 'attachment_list_unavailable', entries: [], detail: 'original revision not found for this item' };
  if (entries.length === 0) return { status: 'attachments_none', entries: [], detail: null };
  const roots = tools === null ? null : openAttachmentRoots(tools.mail_attachments_layout?.roots ?? {});
  for (const entry of entries) {
    const probed = sourceKind === 'slack'
      ? await readSlackAttachment({ channelRoot: rootPath, entry, maxBytes: 1, probeOnly: true })
      : (roots === null ? { status: 'bytes_not_collected', detail: 'no attachment root declared' }
        : await readMailAttachment({ attachmentRoots: roots, entry, maxBytes: 1, probeOnly: true }));
    entry.status = probed.status;
    entry.detail = probed.detail;
    if (entry.status === 'ok') entry.format = formatFor({ mime: entry.mime, name: entry.name });
    delete entry.local_path;
  }
  return { status: 'ok', entries, detail: null };
}

/** The entry a caller named: a 1-based index, a Slack file id, or the first 12 hex of the digest. */
export function selectAttachment(entries, selector) {
  const text = String(selector ?? '').trim();
  if (/^\d+$/u.test(text)) return entries.find(entry => entry.index === Number.parseInt(text, 10)) ?? null;
  const lower = text.toLowerCase();
  return entries.find(entry => (entry.file_id ?? '').toLowerCase() === lower)
    ?? entries.find(entry => (entry.sha256 ?? '').replace(/^sha256:/u, '').startsWith(lower) && lower.length >= 8)
    ?? entries.find(entry => (entry.name ?? '').toLowerCase() === lower)
    ?? null;
}

async function openAttachment({ entry, sourceKind, rootPath, row, tools, render, now }) {
  if (tools === null) return { status: 'access_denied', detail: 'no tool configuration bound', extract: null, internal: { parser_calls: 0, render_calls: 0 } };
  const raw = sourceKind === 'mail'
    ? (row?.attachments ?? [])[entry.index - 1] ?? null
    : null;
  const opened = sourceKind === 'slack'
    ? await readSlackAttachment({ channelRoot: rootPath, entry, maxBytes: tools.max_attachment_bytes })
    : await readMailAttachment({ attachmentRoots: openAttachmentRoots(tools.mail_attachments_layout?.roots ?? {}),
      entry: { ...entry, local_path: typeof raw?.local_path === 'string' ? raw.local_path : null },
      maxBytes: tools.max_attachment_bytes });
  if (opened.status !== 'ok') {
    return { status: opened.status, detail: opened.detail, extract: null, internal: { parser_calls: 0, render_calls: 0 } };
  }
  const derived = await deriveAttachment({ tools, bytes: opened.bytes, sha256: opened.sha256, mime: entry.mime,
    name: entry.name, render, now: () => new Date(now),
    source: { kind: sourceKind, item_id: entry.item_id ?? null, file_id: entry.file_id, name: entry.name } });
  return { status: derived.status, detail: derived.render_unavailable ?? null, format: derived.format,
    extract: derived.extract, pages: derived.pages, cache: derived.cache, internal: derived.internal };
}

// ---------------------------------------------------------------- read
/**
 * One item, read back. `tools` is the parsed tool configuration (null when the
 * caller only wants text); `now` is the instant the grant and admission are
 * checked against.
 */
export async function readOriginal({ io, project, itemId, unitId = null, maxChars = DEFAULT_MAX_CHARACTERS,
  wantAttachments = false, attachmentSelector = null, render = false, tools = null,
  bindingFile = 'graph_index_binding.unified.json', generationId = null,
  actorRef = 'actor:owner:context-reader', now = new Date().toISOString() } = {}) {
  if (typeof itemId !== 'string' || !ITEM_ID.test(itemId)) fail('original_read_item_invalid');
  if (unitId !== null && !UNIT_ID.test(unitId)) fail('original_read_unit_invalid');
  if (!Number.isSafeInteger(maxChars) || maxChars < 100 || maxChars > 400000) fail('original_read_max_chars_invalid');
  const bindingAddress = bindingAddressFor(project, bindingFile);
  let bindingBytes;
  try { bindingBytes = io.read(bindingAddress, MAX_BINDING_BYTES); } catch { fail('original_read_binding_unavailable'); }
  const binding = JSON.parse(bindingBytes);
  let generationRef;
  if (generationId !== null) {
    if (!GENERATION_ID.test(generationId)) fail('original_read_generation_invalid');
    const address = `data_root/20_PROJECTS/${binding.approved_fs_key}/20_문서검색/검색_색인/generations/`
      + `${generationId}/generation.json`;
    try { generationRef = { path: address, sha256: sha256(io.read(address, 64 * 1024 * 1024)) }; }
    catch { fail('original_read_generation_unavailable'); }
  }
  const view = openGraphIndex({ io, bindingAddress, bindingSha256: sha256(bindingBytes),
    request: { actor_ref: actorRef, project_ref: binding.project_ref, purpose: 'context_query' },
    ...(generationRef ? { generationRef } : {}) });
  const head = {
    schema_version: ORIGINAL_READ_SCHEMA, read_at: now, project_code: project,
    binding: { address: bindingAddress, sha256: sha256(bindingBytes) },
    generation: { generation_id: view.manifest.generation_id, selected: view.selected,
      documents: view.manifest.counts.documents },
  };
  const rows = view.manifest.documents.filter(row => row.item_id === itemId)
    .sort((a, b) => a.doc_key.localeCompare(b.doc_key));
  if (rows.length === 0) {
    return Object.freeze({ ...head, status: 'not_in_scope', item: { item_id: itemId },
      units: [], attachments: { status: 'attachment_list_unavailable', entries: [] }, attachment: null,
      internal: { parser_calls: 0, render_calls: 0, model_calls: 0 } });
  }
  const row = rows[0];
  const reread = await rereadOriginal({ io, binding, row, now });
  const stored = reread.document === null ? view.readDocument(row.doc_key) : null;
  const document = reread.document ?? stored;
  const matches = reread.document !== null && reread.document.doc_key === row.doc_key;
  const status = matches ? 'ok' : 'revision_mismatch';
  const rendered = renderUnits(document, { unitId, maxChars });
  const internal = { parser_calls: 0, render_calls: 0, model_calls: 0 };
  let attachments = { status: 'attachment_list_unavailable', entries: [], detail: 'not requested' };
  let attachment = null;
  if (wantAttachments || attachmentSelector !== null) {
    const source = reread.rootPath;
    const eventRow = row.source_kind === 'mail' && source !== null && reread.document !== null
      ? await mailRow({ rootPath: source, document: reread.document }) : null;
    attachments = source === null
      ? { status: 'attachment_list_unavailable', entries: [], detail: 'source root unbound' }
      : await attachmentList({ document, row: eventRow, rootPath: source, sourceKind: row.source_kind, tools });
    if (attachmentSelector !== null) {
      const entry = attachments.status === 'ok' ? selectAttachment(attachments.entries, attachmentSelector) : null;
      if (entry === null) {
        attachment = { selector: String(attachmentSelector), status: attachments.status === 'ok' ? 'access_denied' : attachments.status,
          detail: attachments.status === 'ok' ? 'no attachment matches that selector' : attachments.detail };
      } else {
        const opened = await openAttachment({ entry: { ...entry, item_id: row.item_id }, sourceKind: row.source_kind,
          rootPath: source, row: eventRow, tools, render, now });
        internal.parser_calls += opened.internal.parser_calls;
        internal.render_calls += opened.internal.render_calls;
        attachment = { selector: String(attachmentSelector), index: entry.index, file_id: entry.file_id, name: entry.name,
          mime: entry.mime, size_bytes: entry.size_bytes, sha256: entry.sha256, ...opened, internal: undefined };
        delete attachment.internal;
      }
    }
  }
  return Object.freeze({
    ...head, status,
    item: {
      source_kind: row.source_kind, root_ref: row.root_ref, item_id: row.item_id, title: document.title,
      occurred_at: document.valid_at ?? null, data_class: row.data_class,
      primary_revision_sha256: document.primary_revision_sha256,
      doc_key: document.doc_key, manifest_doc_key: row.doc_key, doc_key_matches: matches,
      units_total: document.units.length, characters_total: rendered.characters_total,
      units_from: reread.document !== null ? 'original_reread' : 'generation_document',
      reread_code: reread.code, duplicates_in_manifest: rows.length - 1,
    },
    units: rendered.units, requested_unit_found: rendered.requested_unit_found,
    characters_shown: rendered.characters_shown, attachments, attachment, internal,
  });
}
