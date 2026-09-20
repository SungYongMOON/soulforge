// SAFE_PROJECTION_SCHEMA_V1: the only shape the salpi auditor may read.
//
// The schema has no free-text field at all. Every string is a value from a fixed list, a UTC
// timestamp, a sha256 digest, a semver or a `mail_pipeline:<source>:<12 hex>` scope fingerprint,
// so a mail subject, a body, an address or a path has nowhere to go. Unknown keys fail closed,
// and a key that looks like content (body, raw, transcript, ...) fails with its own code so the
// producer defect is visible. Rejections never echo the offending
// key or value.
//
// Generic entry checks (snapshot, accessor/proxy refusal, depth, secret and local-path scans) are
// reused from the agent observation owner instead of being rewritten here.

import {
  UTC_MS, deepFreeze, digestOf, guardEntry, hold, isCount, isDenseArray, isPlainObject, isSafeRef,
  snapshotInput, TOO_DEEP, ACCESSOR_FOUND, TOO_LARGE, HOSTILE_INPUT, MAX_SCAN_DEPTH,
} from '../../agent_observation/guard_primitives.mjs';

export const SAFE_PROJECTION_SCHEMA_VERSION = 'soulforge.salpi.safe_projection.v1';
export const MAIL_PIPELINE_PROJECTION_TYPE = 'mail_pipeline_audit';
export const PROJECTION_CLAIM_CEILING = 'metadata_projection_only';

export const PROJECTION_STATUSES = Object.freeze(['consistent', 'mismatch', 'incomplete', 'unavailable']);
export const COVERAGE_STATES = Object.freeze(['complete', 'partial', 'unavailable']);
export const MAIL_INPUTS = Object.freeze(['raw_store', 'event_store', 'receipt', 'dedupe_state', 'cursor_state']);

export const MAIL_METRIC_KEYS = Object.freeze([
  'raw_count', 'event_count', 'event_count_mail', 'event_count_ads', 'event_count_quarantine',
  'receipt_fetched', 'receipt_new_events', 'receipt_duplicates', 'receipt_raw_written', 'receipt_event_written',
  'dedupe_key_count', 'dedupe_orphan_count', 'cursor_seen',
]);
export const MAIL_FLAG_KEYS = Object.freeze(['dedupe_present', 'receipt_partial', 'receipt_dry_run']);
export const MAIL_TIMESTAMP_KEYS = Object.freeze(['receipt_finished_at', 'dedupe_updated_at', 'cursor_updated_at']);
export const MAIL_DIGEST_KEYS = Object.freeze(['receipt', 'dedupe_state', 'cursor_state']);
// Closed value lists. A projection string that is not one of these fixed values is rejected, so
// even a well-formed-looking locator, hold code or producer id cannot carry text.
export const MAIL_PRODUCER_IDS = Object.freeze(['salpi_mail_pipeline_projector']);
export const MAIL_INPUT_LOCATORS = Object.freeze({
  raw_store: 'mail_store:raw',
  event_store: 'mail_store:events',
  receipt: 'mail_receipt:last_run_summary',
  dedupe_state: 'mail_state:dedupe',
  cursor_state: 'mail_state:cursor',
});
export const MAIL_PRODUCER_HOLD_CODES = Object.freeze([
  'mail_event_line_unparseable', 'mail_receipt_unreadable', 'mail_dedupe_state_unreadable', 'mail_cursor_state_unreadable',
]);
export const MAIL_SCOPE_REF = /^mail_pipeline:(?:gmail|hiworks|o365):[0-9a-f]{12}$/u;

export const SAFETY_KEYS = Object.freeze([
  'raw_payload_copied', 'message_bodies_returned', 'identities_returned', 'absolute_paths_returned',
]);

const TOP_KEYS = Object.freeze([
  'schema_version', 'projection_type', 'producer', 'observed_at', 'scope_ref', 'status', 'metrics', 'flags',
  'timestamps', 'coverage', 'digests', 'locators', 'hold_codes', 'safety', 'claim_ceiling',
]);
const PRODUCER_KEYS = Object.freeze(['id', 'version']);
const COVERAGE_KEYS = Object.freeze(['state', 'missing_inputs']);

// Where each allowed key may appear. A key allowed in one object is still unknown in another.
const KEYS_BY_SECTION = Object.freeze({
  '': TOP_KEYS,
  producer: PRODUCER_KEYS,
  metrics: MAIL_METRIC_KEYS,
  flags: MAIL_FLAG_KEYS,
  timestamps: MAIL_TIMESTAMP_KEYS,
  coverage: COVERAGE_KEYS,
  digests: MAIL_DIGEST_KEYS,
  safety: SAFETY_KEYS,
});

// A key that is not allowed AND looks like content, identity, secret or location data.
export const CONTENT_LIKE_KEY = /(?:^|_)(?:body|bodies|raw|payload|content|source_text|text|chunk|chunks|transcript|attachment|attachments|subject|snippet|from|to|cc|bcc|sender|recipient|email|address|message|messages|html|header|headers|record|row|rows|secret|credential|credentials|token|password|cookie|api_key|private_key|path|paths|prompt|log)(?:_|$)/iu;

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/u;
const MAX_COUNT = 100_000_000;
const MAX_LIST = 8;
const MAX_SERIALIZED_BYTES = 32 * 1024;

export const PROJECTION_HOLD_CODES = Object.freeze({
  tooDeep: 'SALPI_PROJECTION_TOO_DEEP',
  accessor: 'SALPI_PROJECTION_ACCESSOR_FORBIDDEN',
  tooLarge: 'SALPI_PROJECTION_TOO_LARGE',
  hostileInput: 'SALPI_PROJECTION_HOSTILE_INPUT',
  unknownField: 'SALPI_PROJECTION_UNKNOWN_FIELD',
  rawField: 'SALPI_PROJECTION_RAW_FIELD_FORBIDDEN',
  secret: 'SALPI_PROJECTION_SECRET_VALUE_FORBIDDEN',
  localPath: 'SALPI_PROJECTION_ABSOLUTE_PATH_FORBIDDEN',
  missingField: 'SALPI_PROJECTION_REQUIRED_FIELD_MISSING',
  schemaVersion: 'SALPI_PROJECTION_SCHEMA_VERSION_UNSUPPORTED',
  projectionType: 'SALPI_PROJECTION_TYPE_UNSUPPORTED',
  invalidValue: 'SALPI_PROJECTION_VALUE_INVALID',
  safety: 'SALPI_PROJECTION_SAFETY_DECLARATION_INVALID',
});

const H = PROJECTION_HOLD_CODES;

// Walks every object key once. Unknown keys fail closed; content-like unknown keys get their own
// code. Arrays may only hold scalars (locators, codes, inputs), so an object inside an array is
// itself a smuggling attempt.
function classifyKeys(value, section, depth) {
  if (depth > MAX_SCAN_DEPTH) return H.tooDeep;
  if (Array.isArray(value)) {
    for (const item of value) if (item !== null && typeof item === 'object') return H.unknownField;
    return null;
  }
  if (!isPlainObject(value)) return null;
  const allowed = KEYS_BY_SECTION[section];
  for (const [key, item] of Object.entries(value)) {
    if (allowed === undefined || !allowed.includes(key)) {
      return CONTENT_LIKE_KEY.test(key) ? H.rawField : H.unknownField;
    }
    if (item !== null && typeof item === 'object') {
      const nested = section === '' ? key : `${section}.${key}`;
      if (!Array.isArray(item) && KEYS_BY_SECTION[nested] === undefined) return H.unknownField;
      const found = classifyKeys(item, nested, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

const invalid = () => hold(H.invalidValue);

function checkClosedMap(map, keys, predicate) {
  if (!isPlainObject(map)) return false;
  return Object.entries(map).every(([key, item]) => keys.includes(key) && predicate(item));
}

function checkList(list, predicate) {
  return isDenseArray(list) && list.length <= MAX_LIST && list.every(predicate)
    && new Set(list).size === list.length;
}

const LOCATOR_VALUES = Object.freeze(Object.values(MAIL_INPUT_LOCATORS));
export const isSafeLocator = (value) => LOCATOR_VALUES.includes(value);

// Returns { status: 'OK', value, digest } with a deep-frozen copy, or { status: 'HOLD', hold_code }.
export function validateSafeProjection(rawInput) {
  const snapshot = snapshotInput(rawInput);
  if (snapshot === TOO_DEEP) return hold(H.tooDeep);
  if (snapshot === ACCESSOR_FOUND) return hold(H.accessor);
  if (snapshot === TOO_LARGE) return hold(H.tooLarge);
  if (snapshot === HOSTILE_INPUT) return hold(H.hostileInput);
  if (!isPlainObject(snapshot)) return hold(H.unknownField, 'input_not_object');

  let serialized;
  try { serialized = JSON.stringify(snapshot); } catch { return hold(H.hostileInput); }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) return hold(H.tooLarge);

  const keyProblem = classifyKeys(snapshot, '', 0);
  if (keyProblem !== null) return hold(keyProblem);

  // Reused generic guard: secret-looking and local-path-looking values anywhere.
  const guarded = guardEntry(snapshot, TOP_KEYS, H);
  if (guarded.status !== 'OK') return hold(guarded.hold_code);
  const p = guarded.value;

  for (const key of TOP_KEYS) if (!(key in p)) return hold(H.missingField);
  if (p.schema_version !== SAFE_PROJECTION_SCHEMA_VERSION) return hold(H.schemaVersion);
  if (p.projection_type !== MAIL_PIPELINE_PROJECTION_TYPE) return hold(H.projectionType);
  if (p.claim_ceiling !== PROJECTION_CLAIM_CEILING) return invalid();

  if (!isPlainObject(p.safety) || SAFETY_KEYS.some((key) => p.safety[key] !== false)
    || Object.keys(p.safety).length !== SAFETY_KEYS.length) return hold(H.safety);

  if (!isPlainObject(p.producer) || !MAIL_PRODUCER_IDS.includes(p.producer.id)
    || typeof p.producer.version !== 'string' || !SEMVER.test(p.producer.version)) return invalid();
  if (typeof p.observed_at !== 'string' || !UTC_MS.test(p.observed_at)) return invalid();
  if (typeof p.scope_ref !== 'string' || !MAIL_SCOPE_REF.test(p.scope_ref) || !isSafeRef(p.scope_ref)) return invalid();
  if (!PROJECTION_STATUSES.includes(p.status)) return invalid();

  if (!checkClosedMap(p.metrics, MAIL_METRIC_KEYS, (v) => isCount(v, MAX_COUNT))) return invalid();
  if (!checkClosedMap(p.flags, MAIL_FLAG_KEYS, (v) => typeof v === 'boolean')) return invalid();
  if (!checkClosedMap(p.timestamps, MAIL_TIMESTAMP_KEYS, (v) => typeof v === 'string' && UTC_MS.test(v))) return invalid();
  if (!checkClosedMap(p.digests, MAIL_DIGEST_KEYS, (v) => typeof v === 'string' && SHA256.test(v))) return invalid();
  if (p.metrics.cursor_seen !== undefined && p.metrics.cursor_seen > 1) return invalid();

  if (!isPlainObject(p.coverage) || !COVERAGE_STATES.includes(p.coverage.state)
    || !checkList(p.coverage.missing_inputs, (v) => MAIL_INPUTS.includes(v))) return invalid();
  const missingCount = p.coverage.missing_inputs.length;
  const expectedState = missingCount === 0 ? 'complete' : missingCount === MAIL_INPUTS.length ? 'unavailable' : 'partial';
  if (p.coverage.state !== expectedState) return invalid();

  if (!checkList(p.locators, isSafeLocator)) return invalid();
  if (!checkList(p.hold_codes, (v) => MAIL_PRODUCER_HOLD_CODES.includes(v))) return invalid();

  const value = deepFreeze(p);
  return { status: 'OK', value, digest: digestOf(value) };
}
