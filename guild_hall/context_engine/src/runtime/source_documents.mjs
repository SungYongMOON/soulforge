// Source documents for context preparation. Collected items stay with their
// collection owner; this module only turns exactly granted item revisions into
// bounded text units with deterministic identity, and compares coverage between
// preparations. It never discovers items, infers project attribution, accepts
// meaning or writes anywhere.
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { exactRefIdentityKey } from '../../../engineering_engine/kernel/identity.mjs';
import { isSafeSegment } from '../adapters/sources/guarded_files.mjs';

export const SOURCE_GRANT_SCHEMA = 'soulforge.context_source_grant.v1';
export const SOURCE_DOCUMENT_SCHEMA = 'soulforge.context_source_document.v1';
export const SOURCE_COVERAGE_SCHEMA = 'soulforge.context_source_coverage.v1';
export const SOURCE_KINDS = Object.freeze(['document', 'linear', 'mail', 'voice']);
export const SOURCE_PREPARATION_PURPOSE = 'context_preparation';
// Item evidence either pins one exact revision, or admits the latest revision the
// collection owner already holds for that exact item (items that evolve, e.g. an
// issue with new comments). Neither policy lets the APP find new items.
export const REVISION_POLICIES = Object.freeze(['exact', 'latest_in_custody']);
export const ITEM_STATUSES = Object.freeze(['prepared', 'missing', 'stale_grant', 'refused', 'failed']);
export const SOURCE_LIMITS = Object.freeze({ grant_items: 5000, document_units: 2000,
  unit_characters: 20000, document_characters: 400000, title_characters: 512, facts: 64 });

const SHA = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@+_-]{0,199}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;
// Line break after the valid_from name keeps the APP boundary test's literal import scan quiet.
const GRANT_FIELDS = ['schema_version', 'grant_id', 'project_ref', 'purposes', 'allowed_data_classes', 'valid_from',
  'valid_to', 'sources'];
const UNIT_FIELDS = ['unit_id', 'unit_kind', 'locator', 'text', 'occurred_at', 'speaker_ref'];
const ITEM_FIELDS = ['item_id', 'revision_policy', 'revision_sha256', 'data_class'];
// `path`: segments below the source root that the owner names for the item (a
// mail event file, a document, a voice date folder). `scope`: the part of a mixed
// recording that belongs to the project, in seconds from the recording start.
const ITEM_OPTIONAL_FIELDS = ['path', 'scope'];
export const PATH_REQUIRED_KINDS = Object.freeze(['document', 'mail']);
// Kinds whose unit locators anchor to a revision the document holds. The document
// adapter locates by path and line range only, so its units carry no revision to
// check; that is a property of the adapter, not a missing locator.
export const LOCATOR_REVISION_KINDS = Object.freeze(['linear', 'mail', 'voice']);
const validItemPath = path => Array.isArray(path) && path.length > 0 && path.length <= 16
  && path.every(isSafeSegment);
const validScope = scope => exactKeys(scope, ['start_seconds', 'end_seconds'])
  && Number.isFinite(scope.start_seconds) && Number.isFinite(scope.end_seconds)
  && scope.start_seconds >= 0 && scope.end_seconds > scope.start_seconds;

export class SourceDocumentError extends Error {
  constructor(code) { super(code); this.name = 'SourceDocumentError'; this.code = code; }
}
const fail = code => { throw new SourceDocumentError(code); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value, fields) => plain(value) && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const epoch = value => typeof value === 'string' && INSTANT.test(value) ? Date.parse(value) : NaN;
export const isInstant = value => Number.isFinite(epoch(value));
export const isSafeToken = value => typeof value === 'string' && TOKEN.test(value);
const itemKey = row => `${row.source_kind}\u0000${row.root_ref}\u0000${row.item_id}`;

// Text leaves the adapter as NFC with LF line ends and without NUL, so the same
// source bytes always produce the same unit text and digest.
export function normalizeText(value, max) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') fail('source_text_invalid');
  const text = value.normalize('NFC').replace(/\r\n?/gu, '\n').replace(/\u0000/gu, '').trim();
  return [...text].length > max ? [...text].slice(0, max).join('') : text;
}

export function validateSourceGrant(grant, { now = null } = {}) {
  if (!exactKeys(grant, GRANT_FIELDS) || grant.schema_version !== SOURCE_GRANT_SCHEMA
    || !TOKEN.test(grant.grant_id ?? '') || exactRefIdentityKey(grant.project_ref) === null
    || !Array.isArray(grant.purposes) || !grant.purposes.every(p => TOKEN.test(p))
    || !grant.purposes.includes(SOURCE_PREPARATION_PURPOSE)
    || !Array.isArray(grant.allowed_data_classes) || grant.allowed_data_classes.length === 0
    || !grant.allowed_data_classes.every(c => TOKEN.test(c))
    || !isInstant(grant.valid_from) || !isInstant(grant.valid_to)
    || epoch(grant.valid_from) >= epoch(grant.valid_to) || !Array.isArray(grant.sources)) fail('source_grant_invalid');
  if (now !== null && (!isInstant(now) || epoch(now) < epoch(grant.valid_from)
    || epoch(now) >= epoch(grant.valid_to))) fail('source_grant_not_current');
  const seen = new Set(); let count = 0;
  for (const source of grant.sources) {
    if (!exactKeys(source, ['kind', 'root_ref', 'items']) || !SOURCE_KINDS.includes(source.kind)
      || !TOKEN.test(source.root_ref ?? '') || !Array.isArray(source.items)) fail('source_grant_invalid');
    for (const item of source.items) {
      const optional = ITEM_OPTIONAL_FIELDS.filter(field => plain(item) && Object.hasOwn(item, field));
      if (!exactKeys(item, [...ITEM_FIELDS, ...optional])
        || !TOKEN.test(item.item_id ?? '') || !REVISION_POLICIES.includes(item.revision_policy)
        || (item.revision_policy === 'exact' ? !SHA.test(item.revision_sha256 ?? '') : item.revision_sha256 !== null)
        || !grant.allowed_data_classes.includes(item.data_class)
        || (Object.hasOwn(item, 'path') && !validItemPath(item.path))
        || (PATH_REQUIRED_KINDS.includes(source.kind) && !Object.hasOwn(item, 'path'))
        || (Object.hasOwn(item, 'scope') && (source.kind !== 'voice' || !validScope(item.scope)))) fail('source_grant_invalid');
      const key = itemKey({ source_kind: source.kind, root_ref: source.root_ref, item_id: item.item_id });
      if (seen.has(key) || ++count > SOURCE_LIMITS.grant_items) fail('source_grant_invalid');
      seen.add(key);
    }
  }
  return Object.freeze({ grant: structuredClone(grant), grant_sha256: sha256Canonical(grant),
    project_key: exactRefIdentityKey(grant.project_ref) });
}

export function sourceDocumentKey({ projectKey, sourceKind, rootRef, itemId, compositeRevisionSha256, adapterProfile, scope = null }) {
  if (typeof projectKey !== 'string' || !SOURCE_KINDS.includes(sourceKind) || !TOKEN.test(rootRef ?? '')
    || !TOKEN.test(itemId ?? '') || !SHA.test(compositeRevisionSha256 ?? '') || !TOKEN.test(adapterProfile ?? '')
    || (scope !== null && !validScope(scope))) {
    fail('source_document_key_invalid');
  }
  return sha256Canonical({ schema: SOURCE_DOCUMENT_SCHEMA, project_key: projectKey, source_kind: sourceKind,
    root_ref: rootRef, item_id: itemId, composite_revision_sha256: compositeRevisionSha256, adapter_profile: adapterProfile,
    scope: scope === null ? null : { start_seconds: scope.start_seconds, end_seconds: scope.end_seconds } });
}

function normalizeStrings(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeStrings(child)]));
  }
  return value;
}

function unitRow(unit) {
  if (!plain(unit) || typeof unit.unit_kind !== 'string' || !TOKEN.test(unit.unit_kind) || !plain(unit.locator)
    || (unit.occurred_at !== null && unit.occurred_at !== undefined && !isInstant(unit.occurred_at))
    || (unit.speaker_ref !== null && unit.speaker_ref !== undefined && !TOKEN.test(unit.speaker_ref))) fail('source_unit_invalid');
  // Locator strings get the same NFC treatment as unit text. The document adapter
  // puts the very same heading into both, so leaving one decomposed made them
  // unequal; a provider speaker label arrives however the provider wrote it.
  return { unit_kind: unit.unit_kind, locator: normalizeStrings(structuredClone(unit.locator)),
    text: normalizeText(unit.text, SOURCE_LIMITS.unit_characters), occurred_at: unit.occurred_at ?? null,
    speaker_ref: unit.speaker_ref ?? null };
}

// Builds one frozen source document. `components` are the exact revisions that
// make up the composite revision (e.g. an issue snapshot plus its comments).
export function buildSourceDocument({ admitted, sourceKind, rootRef, item, adapterProfile, primaryRevisionSha256,
  components, title = '', validAt, knownAt, timeBasis, facts = [], units }) {
  if (!admitted?.grant || !SHA.test(primaryRevisionSha256 ?? '') || !Array.isArray(components)
    || !components.every(row => plain(row) && TOKEN.test(row.kind ?? '') && TOKEN.test(row.id ?? '') && SHA.test(row.sha256 ?? ''))
    || (validAt !== null && !isInstant(validAt)) || (knownAt !== null && !isInstant(knownAt)) || !TOKEN.test(timeBasis ?? '')
    || !Array.isArray(facts) || facts.length > SOURCE_LIMITS.facts || !Array.isArray(units)
    || units.length === 0 || units.length > SOURCE_LIMITS.document_units) fail('source_document_invalid');
  const sortedComponents = [...components].sort((a, b) => `${a.kind}\u0000${a.id}`.localeCompare(`${b.kind}\u0000${b.id}`))
    .map(({ kind, id, sha256 }) => ({ kind, id, sha256 }));
  const compositeRevisionSha256 = sha256Canonical({ primary: primaryRevisionSha256, components: sortedComponents });
  // Unit ids are assigned after empty units are dropped so ids stay contiguous.
  const rows = units.map(unitRow).filter(row => row.text.length > 0)
    .map(row => ({ unit_id: '', ...row })).map((row, index) => ({ ...row, unit_id: `u${String(index).padStart(4, '0')}` }));
  const characters = rows.reduce((sum, row) => sum + [...row.text].length, 0);
  if (rows.length === 0 || characters > SOURCE_LIMITS.document_characters) fail('source_document_bounds');
  const factRows = facts.map(fact => {
    if (!exactKeys(fact, ['name', 'value', 'at']) || !TOKEN.test(fact.name) || (fact.at !== null && !isInstant(fact.at))
      || !['string', 'number', 'boolean'].includes(typeof fact.value) && fact.value !== null) fail('source_document_invalid');
    return { name: fact.name, value: typeof fact.value === 'string' ? normalizeText(fact.value, 512) : fact.value, at: fact.at };
  });
  const scope = item.scope ?? null;
  const docKey = sourceDocumentKey({ projectKey: admitted.project_key, sourceKind, rootRef, itemId: item.item_id,
    compositeRevisionSha256, adapterProfile, scope });
  const body = { schema_version: SOURCE_DOCUMENT_SCHEMA, doc_key: docKey, grant_id: admitted.grant.grant_id,
    grant_sha256: admitted.grant_sha256, project_key: admitted.project_key, source_kind: sourceKind, root_ref: rootRef,
    item_id: item.item_id, scope: scope === null ? null : { ...scope }, revision_policy: item.revision_policy,
    primary_revision_sha256: primaryRevisionSha256,
    composite_revision_sha256: compositeRevisionSha256, components: sortedComponents, data_class: item.data_class,
    adapter_profile: adapterProfile, title: normalizeText(title, SOURCE_LIMITS.title_characters),
    valid_at: validAt, known_at: knownAt, time_basis: timeBasis, facts: factRows, units: rows, characters };
  return deepFreeze({ ...body, text_sha256: sha256Canonical(rows.map(({ unit_id, text }) => [unit_id, text])) });
}

export function validateSourceDocument(document) {
  if (!plain(document) || document.schema_version !== SOURCE_DOCUMENT_SCHEMA || !SHA.test(document.doc_key ?? '')
    || !Array.isArray(document.units) || !document.units.every(unit => exactKeys(unit, UNIT_FIELDS))) return false;
  const expected = sourceDocumentKey({ projectKey: document.project_key, sourceKind: document.source_kind,
    rootRef: document.root_ref, itemId: document.item_id, compositeRevisionSha256: document.composite_revision_sha256,
    adapterProfile: document.adapter_profile, scope: document.scope ?? null });
  return expected === document.doc_key
    && document.text_sha256 === sha256Canonical(document.units.map(({ unit_id, text }) => [unit_id, text]));
}

// Coverage is what one preparation actually held per granted item. It is the
// pull-side memory the next preparation compares against; it grants nothing.
export function buildSourceCoverage({ projectKey, grantSha256, results }) {
  if (typeof projectKey !== 'string' || !SHA.test(grantSha256 ?? '') || !Array.isArray(results)) fail('source_coverage_invalid');
  const items = results.map(result => {
    if (!plain(result) || !SOURCE_KINDS.includes(result.source_kind) || !TOKEN.test(result.root_ref ?? '')
      || !TOKEN.test(result.item_id ?? '') || !ITEM_STATUSES.includes(result.status)) fail('source_coverage_invalid');
    const prepared = result.status === 'prepared';
    if (prepared && (!SHA.test(result.composite_revision_sha256 ?? '') || !SHA.test(result.doc_key ?? ''))) fail('source_coverage_invalid');
    return { source_kind: result.source_kind, root_ref: result.root_ref, item_id: result.item_id, status: result.status,
      code: prepared ? null : String(result.code ?? result.status), composite_revision_sha256: prepared ? result.composite_revision_sha256 : null,
      doc_key: prepared ? result.doc_key : null };
  }).sort((a, b) => itemKey(a).localeCompare(itemKey(b)));
  if (new Set(items.map(itemKey)).size !== items.length) fail('source_coverage_invalid');
  const counts = Object.fromEntries(ITEM_STATUSES.map(status => [status, items.filter(row => row.status === status).length]));
  const body = { schema_version: SOURCE_COVERAGE_SCHEMA, project_key: projectKey, grant_sha256: grantSha256, counts, items };
  return deepFreeze({ ...body, coverage_sha256: sha256Canonical(body) });
}

// Pull-based comparison between the previous coverage and this preparation.
// Only prepared rows carry a revision; anything else is reported, never guessed.
export function detectSourceChanges(previousCoverage, currentCoverage) {
  const index = coverage => new Map((coverage?.items ?? []).map(row => [itemKey(row), row]));
  if (currentCoverage?.schema_version !== SOURCE_COVERAGE_SCHEMA
    || (previousCoverage !== null && previousCoverage?.schema_version !== SOURCE_COVERAGE_SCHEMA)
    || (previousCoverage !== null && previousCoverage.project_key !== currentCoverage.project_key)) fail('source_coverage_invalid');
  const before = index(previousCoverage), after = index(currentCoverage);
  const result = { added: [], changed: [], removed: [], unchanged: [], unavailable: [] };
  for (const [key, row] of after) {
    const prior = before.get(key);
    const ref = { source_kind: row.source_kind, root_ref: row.root_ref, item_id: row.item_id };
    if (row.status !== 'prepared') result.unavailable.push({ ...ref, status: row.status, code: row.code });
    else if (!prior || prior.status !== 'prepared') result.added.push({ ...ref, doc_key: row.doc_key });
    else if (prior.composite_revision_sha256 !== row.composite_revision_sha256) {
      result.changed.push({ ...ref, previous_doc_key: prior.doc_key, doc_key: row.doc_key });
    } else result.unchanged.push({ ...ref, doc_key: row.doc_key });
  }
  for (const [key, row] of before) if (!after.has(key) && row.status === 'prepared') {
    result.removed.push({ source_kind: row.source_kind, root_ref: row.root_ref, item_id: row.item_id, previous_doc_key: row.doc_key });
  }
  return deepFreeze(result);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
