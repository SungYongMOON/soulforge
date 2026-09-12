// One preparation execution's own record. A preparation is only evidence when it
// says which code, which rules and which grant produced exactly which bytes, and
// when.
//
// The code digest is a computed closure, not a hand-kept list: it walks the
// relative imports out of the preparation entry and hashes every file it
// reaches, starting from this module's own location rather than a caller-supplied
// root. So the modules that actually produce prepared bytes are all covered -
// including the ones outside this module, such as the gateway mail body
// extractor that writes the mail unit text - and adding an adapter or a helper
// moves the digest without anyone remembering to update a list.
//
// Building a record only reads the preparation result; the preparer itself is
// unchanged and stays pure.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { DOCUMENT_SOURCE_ADAPTER } from '../adapters/sources/document_file_source.mjs';
import { LINEAR_SOURCE_ADAPTER } from '../adapters/sources/linear_custody_source.mjs';
import { MAIL_SOURCE_ADAPTER } from '../adapters/sources/mail_event_source.mjs';
import { VOICE_SOURCE_ADAPTER } from '../adapters/sources/voice_session_source.mjs';
import { ITEM_STATUSES, LOCATOR_REVISION_KINDS, PATH_REQUIRED_KINDS, REVISION_POLICIES, SOURCE_COVERAGE_SCHEMA,
  SOURCE_DOCUMENT_SCHEMA, SOURCE_GRANT_SCHEMA, SOURCE_KINDS, SOURCE_LIMITS, SOURCE_PREPARATION_PURPOSE,
  SourceDocumentError, isInstant, isSafeToken } from './source_documents.mjs';

export const PREPARATION_RUN_SCHEMA = 'soulforge.context_preparation_run.v1';
export const PREPARER_ID = 'context-engine/source-preparer';
// Deliberately independent of module_version: "the preparer changed" and "the
// validator changed" must be separately visible, because only the first one
// invalidates existing prepared bytes.
export const PREPARER_VERSION = '0.1.0';
export const PREPARER_ENTRY = './source_preparation.mjs';

export const ADAPTER_PROFILES = Object.freeze({ document: DOCUMENT_SOURCE_ADAPTER, linear: LINEAR_SOURCE_ADAPTER,
  mail: MAIL_SOURCE_ADAPTER, voice: VOICE_SOURCE_ADAPTER });

const REPO_ROOT = new URL('../../../../', import.meta.url);
// These patterns and the walk below intentionally mirror `release/closure.mjs`
// rather than importing it. That module is release tooling; importing it from a
// runtime module would pull the release surface into the runtime closure and
// therefore into the preparer's own digest, which must contain only the code
// that prepares. Keep the two in step when either changes.
const IMPORT_PATTERNS = Object.freeze([/\b(?:import|export)\s+[\w$*\s{},]+\s+from\s*['"]([^'"]+)['"]/gu,
  /\bimport\s*['"]([^'"]+)['"]/gu, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu]);
const CLOSURE_LIMIT = 200;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fail = code => { throw new SourceDocumentError(code); };
const refOf = url => decodeURIComponent(url.pathname.slice(REPO_ROOT.pathname.length));

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}

/**
 * Walks relative imports from `entries` and hashes every reachable file. Node
 * builtins are host runtime, not bytes we can pin; a bare package import would
 * be code we cannot account for, so it refuses rather than reporting a partial
 * closure. Paths outside the repository root are refused for the same reason.
 */
export function inspectCodeClosure(entries) {
  const queue = entries.map(entry => new URL(entry)), seen = new Map();
  while (queue.length > 0) {
    const url = queue.shift(), ref = refOf(url);
    if (seen.has(ref)) continue;
    if (!url.pathname.startsWith(REPO_ROOT.pathname) || seen.size >= CLOSURE_LIMIT) fail('preparer_code_closure_invalid');
    let body;
    try { body = readFileSync(url); } catch { return fail('preparer_code_closure_invalid'); }
    seen.set(ref, `sha256:${createHash('sha256').update(body).digest('hex')}`);
    const text = body.toString('utf8');
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier.startsWith('node:')) continue;
        if (!specifier.startsWith('.')) fail('preparer_code_closure_invalid');
        queue.push(new URL(specifier, url));
      }
    }
  }
  const files = [...seen.entries()].map(([ref, sha256]) => ({ ref, sha256 })).sort((a, b) => cmp(a.ref, b.ref));
  if (files.length === 0) fail('preparer_code_closure_invalid');
  return deepFreeze({ code_refs: files, code_digest: sha256Canonical(files) });
}

// Reads the preparer's own closure. No argument: the only tree it can report is
// the one it is running from.
export function inspectPreparerCode() {
  return inspectCodeClosure([new URL(PREPARER_ENTRY, import.meta.url)]);
}

// An inventory is only usable if its digest is the digest of its own refs. That
// makes `preparer_code_refs` load-bearing rather than decoration: a record
// cannot carry this tree's digest beside a fabricated file list.
export function codeInventoryConsistent(code) {
  // An empty inventory is refused for the same reason inspectCodeClosure refuses
  // one: a record claiming that nothing prepared it is wrong, not merely stale.
  return Array.isArray(code?.code_refs) && code.code_refs.length > 0 && SHA.test(code?.code_digest ?? '')
    && code.code_refs.every(row => typeof row?.ref === 'string' && SHA.test(row?.sha256 ?? ''))
    && sha256Canonical(code.code_refs.map(({ ref, sha256 }) => ({ ref, sha256 }))) === code.code_digest;
}

// The rule surface the preparation actually ran under, hashed from the live
// constants. A changed limit, kind, policy or adapter profile moves this digest,
// so a record cannot silently inherit an older rule set.
export function preparationRulesDigest() {
  if (cmp(Object.keys(ADAPTER_PROFILES).sort().join(','), [...SOURCE_KINDS].sort().join(',')) !== 0) {
    fail('adapter_profile_coverage_invalid');
  }
  return sha256Canonical({ grant_schema: SOURCE_GRANT_SCHEMA, document_schema: SOURCE_DOCUMENT_SCHEMA,
    coverage_schema: SOURCE_COVERAGE_SCHEMA, purpose: SOURCE_PREPARATION_PURPOSE, source_kinds: [...SOURCE_KINDS],
    revision_policies: [...REVISION_POLICIES], item_statuses: [...ITEM_STATUSES], limits: { ...SOURCE_LIMITS },
    path_required_kinds: [...PATH_REQUIRED_KINDS], locator_revision_kinds: [...LOCATOR_REVISION_KINDS],
    adapter_profiles: { ...ADAPTER_PROFILES } });
}

// The canonical hash refuses whatever canonical JSON cannot render unambiguously
// across languages. Three revisions of this module tried to enumerate that list -
// non-safe-integer numbers, then non-NFC strings - and each time the list was
// short by something honest input carries (a lone surrogate in a provider speaker
// label, a literal -0 offset, a decomposed object key). So this does not enumerate.
//
// `encode` builds one ASCII string per value and hands the hash nothing but that
// string, so it cannot fall behind a list it never consults. Every part is length-
// or terminator-delimited and every string and key travels as its exact UTF-8
// bytes, so two values that differ in anything a serialized reader can carry get
// different encodings. It is not injective over every JavaScript value: it reads
// own enumerable string keys and an array's length, so sparse-array hole
// positions, non-index array properties, symbol keys, non-enumerable properties,
// a null prototype against a plain object, two same-named constructors and two
// accessors named but not called all share an encoding with their twin. None of
// those survives JSON, which is the shape everything here is read back from.
// The canonical hash refuses some of them outright, as ambiguous; this accepts
// them and treats them as their serialized form.
// Recursion is bounded and cycle-aware, because "hands the hash anything" has to
// include a value that points at itself or nests deeper than the stack. Both
// encode a marker instead of recursing: two such values share an encoding, and
// it costs nothing - neither can
// match an honest digest, so both still read as a difference. No honest value
// comes close: the deepest thing here is a document's locator, about five levels.
const ENCODE_MAX_DEPTH = 64;
const hex = text => Buffer.from(text, 'utf8').toString('hex');
function encode(value, depth = 0, open = new Set()) {
  const recur = child => encode(child, depth + 1, open);
  if (value !== null && typeof value === 'object') {
    if (open.has(value)) return '!c;';
    if (depth >= ENCODE_MAX_DEPTH) return '!d;';
  }
  if (value === null) return 'z;';
  if (value === undefined) return 'u;';
  const kind = typeof value;
  if (kind === 'boolean') return value ? 't;' : 'f;';
  // -0 and 0 are different values and must not share an encoding.
  if (kind === 'number') return `n${Object.is(value, -0) ? '-0' : String(value)};`;
  if (kind === 'bigint') return `g${value};`;
  if (kind === 'string') return `s${hex(value)};`;
  if (kind === 'symbol' || kind === 'function') return `w${hex(String(value))};`;
  open.add(value);
  try {
    if (Array.isArray(value)) return `a${value.length};${value.map(recur).join('')}`;
    return encodeObject(value, recur);
  } finally { open.delete(value); }
}

function encodeObject(value, recur) {
  // Anything that is not a plain object is encoded as what it is rather than
  // rebuilt as one: rebuilding made a Date collide with {} and invoked getters.
  const prototype = Object.getPrototypeOf(value);
  const shape = prototype === Object.prototype || prototype === null ? 'o'
    : `c${hex(prototype?.constructor?.name ?? 'unknown')}:`;
  const keys = Object.keys(value).sort();
  const body = keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // An accessor is named, never called: calling it would let the value under
    // inspection run code and decide its own digest.
    return descriptor && !('value' in descriptor)
      ? `${hex(key)};A;` : `${hex(key)};${recur(value[key])}`;
  }).join('');
  return `${shape}${keys.length};${body}`;
}

/**
 * A digest over any value at all, for the digests this module itself both writes
 * and checks (documents, the change set, the record body, the report body).
 * Asking for one never throws on a value; distinct values get distinct digests
 * except for the shapes listed above `encode`, none of which survives JSON. It
 * deliberately does not agree with
 * sha256Canonical: nothing compares a value hashed one way against a value
 * hashed the other, and `matchesCanonical` is what checks the digests the rest of
 * the module writes with sha256Canonical.
 */
export function totalDigest(value) {
  return `sha256:${createHash('sha256').update(encode(value)).digest('hex')}`;
}

/**
 * Does `value` canonically hash to `stated`? This is the recomputation check for
 * the digests source_documents.mjs writes with sha256Canonical. A value that hash
 * refuses simply does not match - which is the right answer for a tampered field,
 * and is why no caller has to guard against the refusal list either.
 */
export function matchesCanonical(value, stated) {
  try { return sha256Canonical(value) === stated; } catch { return false; }
}

// Binds each prepared document whole. Keying on the document key and the text
// digest alone would leave title, facts, times, components and locators free to
// be rewritten after preparation without moving this value.
export function documentsDigest(documents) {
  if (!Array.isArray(documents)) fail('preparation_run_invalid');
  const rows = documents.map(document => {
    if (!SHA.test(document?.doc_key ?? '') || !SHA.test(document?.text_sha256 ?? '')) fail('preparation_run_invalid');
    return [document.doc_key, totalDigest(document)];
  }).sort((a, b) => cmp(a[0], b[0]));
  if (new Set(rows.map(row => row[0])).size !== rows.length) fail('preparation_run_invalid');
  return totalDigest(rows);
}

// `startedAt`/`endedAt` are what the caller observed around its own preparation
// call; the record states them rather than inventing a clock of its own.
export function buildPreparationRun({ preparation, runId, startedAt, endedAt, previousCoverage = null,
  code = inspectPreparerCode() } = {}) {
  const grant = preparation?.grant, coverage = preparation?.coverage;
  if (!isSafeToken(runId) || !isInstant(startedAt) || !isInstant(endedAt) || Date.parse(endedAt) < Date.parse(startedAt)
    // project_key is the composite exact-ref identity key, not a single token.
    || !isSafeToken(grant?.grant_id) || !SHA.test(grant?.grant_sha256 ?? '') || !(grant?.project_key?.length > 0)
    || coverage?.schema_version !== SOURCE_COVERAGE_SCHEMA || !SHA.test(coverage?.coverage_sha256 ?? '')
    || coverage.project_key !== grant.project_key || coverage.grant_sha256 !== grant.grant_sha256
    || !codeInventoryConsistent(code)) fail('preparation_run_invalid');
  const body = { schema_version: PREPARATION_RUN_SCHEMA, preparation_run_id: runId, preparer_id: PREPARER_ID,
    preparer_version: PREPARER_VERSION, preparer_code_digest: code.code_digest,
    preparer_code_refs: code.code_refs.map(({ ref, sha256 }) => ({ ref, sha256 })),
    preparation_rules_digest: preparationRulesDigest(), adapter_profiles: { ...ADAPTER_PROFILES },
    project_key: grant.project_key, grant_id: grant.grant_id, grant_sha256: grant.grant_sha256,
    coverage_sha256: coverage.coverage_sha256, documents_sha256: documentsDigest(preparation.documents),
    document_count: preparation.documents.length,
    // `changes` is not decoration: a reader gates on changes.unavailable to hold an
    // incomplete source set, so an unbound change set could turn incomplete into
    // complete. It is a function of the previous coverage too, so that is named.
    previous_coverage_sha256: previousCoverage === null ? null : (previousCoverage.coverage_sha256 ?? null),
    changes_sha256: totalDigest(preparation.changes ?? null),
    started_at: startedAt, ended_at: endedAt };
  return deepFreeze({ ...body, run_sha256: totalDigest(body) });
}
