import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION = "soulforge.project_history_envelope.v1";
export const PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION = "soulforge.project_history_coverage_receipt.v1";

export const PROJECT_HISTORY_LANES = Object.freeze([
  "mail",
  "voice",
  "structured_pc_work",
  "file",
  "run_log",
]);

export const PROJECT_HISTORY_LANE_RANK = Object.freeze(
  Object.fromEntries(PROJECT_HISTORY_LANES.map((lane, index) => [lane, index])),
);

export const PROJECT_HISTORY_COVERAGE_STATES = Object.freeze([
  "complete_with_events",
  "complete_no_events",
  "partial",
  "failed",
  "not_collected",
  "not_applicable",
]);

export const PROJECT_HISTORY_ENTITY_TYPES = Object.freeze([
  "source_owner",
  "event",
  "source_revision",
  "content",
  "project",
  "rule_revision",
]);

const ENVELOPE_FIELDS = Object.freeze([
  "schema_version",
  "occurrence_id",
  "lane",
  "source_owner_ref",
  "native_occurrence_ref",
  "event_ref",
  "source_revision_ref",
  "content_ref",
  "project_ref",
  "event_at",
  "valid_at",
  "observed_at",
  "known_at",
  "recorded_at",
  "classification_before",
  "classification_after",
  "supersedes_event_ref",
  "metadata_digest",
  "raw_payload_copied",
]);

const COVERAGE_FIELDS = Object.freeze([
  "schema_version",
  "lane",
  "source_owner_ref",
  "project_ref",
  "window_start",
  "window_end",
  "state",
  "event_count",
  "gap_codes",
  "applicability_ref",
  "ordered_event_digest",
  "metadata_digest",
  "raw_payload_copied",
]);

const TYPED_REF_FIELDS = Object.freeze(["entity_type", "owner_surface", "entity_id"]);
const CLASSIFICATION_FIELDS = Object.freeze(["state", "project_ref"]);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OCCURRENCE_ID_PATTERN = /^ph-occ:[0-9a-f]{64}$/u;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_TOKEN_PATTERN = /^[\p{L}\p{N}._:@+-]+$/u;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const GAP_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export class ProjectHistoryEnvelopeError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryEnvelopeError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryEnvelopeError(code, path, message);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function defineEnumerableDataProperty(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function inspectPlainObject(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Custom and null prototypes are not allowed");
  }

  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string") {
      fail("symbol_key_not_allowed", path, "Symbol keys are not allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}.${key}`, "Only enumerable data properties are allowed");
    }
  }
  return keys;
}

function assertExactKeys(value, expectedKeys, path) {
  const keys = inspectPlainObject(value, path);
  const expected = new Set(expectedKeys);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      fail("missing_field", `${path}.${key}`, "Required field is missing");
    }
  }
  for (const key of keys) {
    if (!expected.has(key)) {
      fail("extra_field", `${path}.${key}`, "Unknown field is not allowed");
    }
  }
}

function assertAllowedKeys(value, allowedKeys, path) {
  const keys = inspectPlainObject(value, path);
  const allowed = new Set(allowedKeys);
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail("extra_field", `${path}.${key}`, "Unknown field is not allowed");
    }
  }
}

function inspectDenseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain array");
  }

  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      fail("symbol_key_not_allowed", path, "Symbol keys are not allowed");
    }
    if (key === "length") continue;
    if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      fail("array_extra_property", `${path}.${key}`, "Array properties outside dense indices are not allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}[${key}]`, "Only enumerable data properties are allowed");
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_not_allowed", `${path}[${index}]`, "Sparse arrays are not allowed");
    }
  }
  return value;
}

function serializeCanonical(value, path, ancestors) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "string") {
    if (!isWellFormedUnicode(value)) {
      fail("canonical_string_not_well_formed", path, "String contains an unpaired UTF-16 surrogate");
    }
    if (value.normalize("NFC") !== value) {
      fail("canonical_string_not_nfc", path, "String must already be NFC-normalized");
    }
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("canonical_number_not_safe_integer", path, "Only safe integers are allowed");
    }
    if (Object.is(value, -0)) {
      fail("canonical_negative_zero", path, "Negative zero is not allowed");
    }
    return String(value);
  }

  if (Array.isArray(value)) {
    inspectDenseArray(value, path);
    if (ancestors.has(value)) {
      fail("canonical_cycle", path, "Cyclic values are not allowed");
    }
    ancestors.add(value);
    try {
      const entries = value.map((entry, index) => serializeCanonical(entry, `${path}[${index}]`, ancestors));
      return `[${entries.join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }

  if (typeof value === "object" && value !== null) {
    const keys = inspectPlainObject(value, path);
    if (ancestors.has(value)) {
      fail("canonical_cycle", path, "Cyclic values are not allowed");
    }
    ancestors.add(value);
    try {
      for (const key of keys) {
        if (!isWellFormedUnicode(key)) {
          fail("canonical_key_not_well_formed", `${path}.${key}`, "Object key contains an unpaired UTF-16 surrogate");
        }
        if (key.normalize("NFC") !== key) {
          fail("canonical_key_not_nfc", `${path}.${key}`, "Object key must already be NFC-normalized");
        }
      }
      const fields = [...keys].sort(utf8Compare).map((key) => (
        `${JSON.stringify(key)}:${serializeCanonical(value[key], `${path}.${key}`, ancestors)}`
      ));
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }

  fail("canonical_unsupported_value", path, "Unsupported canonical JSON value");
}

export function canonicalJson(value) {
  return serializeCanonical(value, "$", new Set());
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value) {
  return `sha256:${sha256Hex(Buffer.from(canonicalJson(value), "utf8"))}`;
}

export function computeMetadataDigest(value) {
  inspectPlainObject(value, "$metadata");
  canonicalJson(value);
  const projection = {};
  for (const key of Object.keys(value)) {
    if (key !== "metadata_digest") defineEnumerableDataProperty(projection, key, value[key]);
  }
  return sha256Canonical(projection);
}

function validateSafeToken(value, path, maxLength = 256) {
  if (typeof value !== "string" || value.length === 0) {
    fail("safe_token_required", path, "Expected a non-empty logical token");
  }
  if (!isWellFormedUnicode(value)) {
    fail("safe_token_not_well_formed", path, "Token contains an unpaired UTF-16 surrogate");
  }
  if ([...value].length > maxLength) {
    fail("safe_token_too_long", path, `Token exceeds ${maxLength} characters`);
  }
  if (value.normalize("NFC") !== value) {
    fail("safe_token_not_nfc", path, "Token must already be NFC-normalized");
  }
  if (!SAFE_TOKEN_PATTERN.test(value) || !/[\p{L}\p{N}]/u.test(value)) {
    fail("unsafe_token", path, "Token contains whitespace, control, path, wildcard, or placeholder characters");
  }
  if (/^(?:unknown|any|tbd|null|unspecified)$/iu.test(value)) {
    fail("fuzzy_token", path, "Fuzzy sentinel tokens are not allowed");
  }
  if (/^(?:https?|ftp|file|mailto|urn|data):/iu.test(value)
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)
    || /^[A-Za-z]:/u.test(value)
    || value === "."
    || value === ".."
    || value.includes("...")) {
    fail("locator_token_not_allowed", path, "Paths, URIs, drive locators, and fuzzy tokens are not allowed");
  }
  return value;
}

export function validateTypedRef(value, expectedEntityType = null, path = "$ref") {
  assertExactKeys(value, TYPED_REF_FIELDS, path);
  validateSafeToken(value.entity_type, `${path}.entity_type`, 64);
  validateSafeToken(value.owner_surface, `${path}.owner_surface`, 256);
  validateSafeToken(value.entity_id, `${path}.entity_id`, 256);

  if (!ENTITY_TYPE_PATTERN.test(value.entity_type)) {
    fail("entity_type_invalid", `${path}.entity_type`, "Entity type must be a lower_snake token");
  }
  if (expectedEntityType !== null && value.entity_type !== expectedEntityType) {
    fail("entity_type_mismatch", `${path}.entity_type`, `Expected ${expectedEntityType}`);
  }
  if (value.entity_type === "content" && !DIGEST_PATTERN.test(value.entity_id)) {
    fail("content_id_invalid", `${path}.entity_id`, "Content ID must be sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function validateNullableTypedRef(value, expectedEntityType, path) {
  if (value === null) return null;
  return validateTypedRef(value, expectedEntityType, path);
}

function validateLane(value, path) {
  if (!PROJECT_HISTORY_LANES.includes(value)) {
    fail("lane_invalid", path, "Lane is outside the five-lane contract");
  }
  return value;
}

function validateCoverageState(value, path) {
  if (!PROJECT_HISTORY_COVERAGE_STATES.includes(value)) {
    fail("coverage_state_invalid", path, "Coverage state is not recognized");
  }
  return value;
}

function validateCanonicalUtc(value, path, allowUnknown = false) {
  if (allowUnknown && value === "unknown") return value;
  if (typeof value !== "string" || !UTC_MILLISECONDS_PATTERN.test(value)) {
    fail("timestamp_not_canonical_utc", path, "Expected canonical UTC ISO timestamp with milliseconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("timestamp_not_canonical_utc", path, "Timestamp is not a real canonical UTC instant");
  }
  return value;
}

function validateDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function refsEqual(left, right) {
  if (left === null || right === null) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function validateClassification(value, path) {
  if (value === null) return null;
  assertExactKeys(value, CLASSIFICATION_FIELDS, path);
  if (value.state !== "classified" && value.state !== "unclassified") {
    fail("classification_state_invalid", `${path}.state`, "Expected classified or unclassified");
  }
  validateNullableTypedRef(value.project_ref, "project", `${path}.project_ref`);
  if (value.state === "classified" && value.project_ref === null) {
    fail("classified_project_required", `${path}.project_ref`, "Classified state requires a project ref");
  }
  if (value.state === "unclassified" && value.project_ref !== null) {
    fail("unclassified_project_must_be_null", `${path}.project_ref`, "Unclassified state requires null project ref");
  }
  return value;
}

export function deriveOccurrenceId(lane, nativeOccurrenceRef) {
  validateLane(lane, "$occurrence.lane");
  validateTypedRef(nativeOccurrenceRef, null, "$occurrence.native_occurrence_ref");
  const canonical = canonicalJson({ lane, native_occurrence_ref: nativeOccurrenceRef });
  return `ph-occ:${sha256Hex(Buffer.from(canonical, "utf8"))}`;
}

export function validateProjectHistoryEnvelope(value) {
  assertExactKeys(value, ENVELOPE_FIELDS, "$envelope");

  if (value.schema_version !== PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION) {
    fail("envelope_schema_version_invalid", "$envelope.schema_version", "Schema version does not match");
  }
  validateLane(value.lane, "$envelope.lane");
  validateTypedRef(value.source_owner_ref, "source_owner", "$envelope.source_owner_ref");
  validateTypedRef(value.native_occurrence_ref, null, "$envelope.native_occurrence_ref");
  validateTypedRef(value.event_ref, "event", "$envelope.event_ref");
  validateNullableTypedRef(value.source_revision_ref, "source_revision", "$envelope.source_revision_ref");
  validateNullableTypedRef(value.content_ref, "content", "$envelope.content_ref");
  validateNullableTypedRef(value.project_ref, "project", "$envelope.project_ref");

  if ((value.source_revision_ref === null) !== (value.content_ref === null)) {
    fail("revision_content_pair_required", "$envelope", "Source revision and content refs must both be present or both be null");
  }

  validateCanonicalUtc(value.event_at, "$envelope.event_at", true);
  validateCanonicalUtc(value.valid_at, "$envelope.valid_at", true);
  if (value.observed_at !== null) {
    validateCanonicalUtc(value.observed_at, "$envelope.observed_at");
  }
  validateCanonicalUtc(value.known_at, "$envelope.known_at");
  validateCanonicalUtc(value.recorded_at, "$envelope.recorded_at");
  if (Date.parse(value.recorded_at) > Date.parse(value.known_at)) {
    fail("recorded_after_known", "$envelope.recorded_at", "recorded_at must be earlier than or equal to known_at");
  }

  validateClassification(value.classification_before, "$envelope.classification_before");
  validateClassification(value.classification_after, "$envelope.classification_after");
  if (value.classification_after !== null
    && !refsEqual(value.classification_after.project_ref, value.project_ref)) {
    fail("classification_after_project_mismatch", "$envelope.classification_after.project_ref", "After classification must equal top-level project ref");
  }

  validateNullableTypedRef(value.supersedes_event_ref, "event", "$envelope.supersedes_event_ref");
  if (value.supersedes_event_ref !== null && refsEqual(value.event_ref, value.supersedes_event_ref)) {
    fail("event_self_supersede", "$envelope.supersedes_event_ref", "An event cannot supersede itself");
  }

  if (value.raw_payload_copied !== false) {
    fail("raw_payload_copied_must_be_false", "$envelope.raw_payload_copied", "Raw payload copying is forbidden");
  }

  if (typeof value.occurrence_id !== "string" || !OCCURRENCE_ID_PATTERN.test(value.occurrence_id)) {
    fail("occurrence_id_invalid", "$envelope.occurrence_id", "Occurrence ID has the wrong shape");
  }
  const expectedOccurrenceId = deriveOccurrenceId(value.lane, value.native_occurrence_ref);
  if (value.occurrence_id !== expectedOccurrenceId) {
    fail("occurrence_id_mismatch", "$envelope.occurrence_id", "Occurrence ID does not match lane and native occurrence ref");
  }

  validateDigest(value.metadata_digest, "$envelope.metadata_digest");
  const expectedMetadataDigest = computeMetadataDigest(value);
  if (value.metadata_digest !== expectedMetadataDigest) {
    fail("metadata_digest_mismatch", "$envelope.metadata_digest", "Metadata digest does not match the envelope");
  }
  return value;
}

export function createProjectHistoryEnvelope(input) {
  assertAllowedKeys(input, ENVELOPE_FIELDS, "$input");
  if (Object.hasOwn(input, "schema_version")
    && input.schema_version !== PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION) {
    fail("envelope_schema_version_invalid", "$input.schema_version", "Schema version does not match");
  }
  if (Object.hasOwn(input, "raw_payload_copied") && input.raw_payload_copied !== false) {
    fail("raw_payload_copied_must_be_false", "$input.raw_payload_copied", "Raw payload copying is forbidden");
  }

  const occurrenceId = deriveOccurrenceId(input.lane, input.native_occurrence_ref);
  if (Object.hasOwn(input, "occurrence_id") && input.occurrence_id !== occurrenceId) {
    fail("occurrence_id_mismatch", "$input.occurrence_id", "Provided occurrence ID does not match derived identity");
  }

  const envelope = {
    schema_version: PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION,
    occurrence_id: occurrenceId,
    lane: input.lane,
    source_owner_ref: input.source_owner_ref,
    native_occurrence_ref: input.native_occurrence_ref,
    event_ref: input.event_ref,
    source_revision_ref: input.source_revision_ref,
    content_ref: input.content_ref,
    project_ref: input.project_ref,
    event_at: input.event_at,
    valid_at: input.valid_at,
    observed_at: input.observed_at,
    known_at: input.known_at,
    recorded_at: input.recorded_at,
    classification_before: input.classification_before,
    classification_after: input.classification_after,
    supersedes_event_ref: input.supersedes_event_ref,
    metadata_digest: "",
    raw_payload_copied: false,
  };
  envelope.metadata_digest = computeMetadataDigest(envelope);

  if (Object.hasOwn(input, "metadata_digest") && input.metadata_digest !== envelope.metadata_digest) {
    fail("metadata_digest_mismatch", "$input.metadata_digest", "Provided metadata digest does not match derived metadata");
  }
  return validateProjectHistoryEnvelope(envelope);
}

function typedRefKey(value) {
  return canonicalJson(value);
}

export function validateProjectHistoryEnvelopeCollection(envelopes) {
  inspectDenseArray(envelopes, "$envelopes");
  const eventRefs = new Set();
  const metadataDigests = new Set();
  const byEventRef = new Map();

  for (let index = 0; index < envelopes.length; index += 1) {
    const envelope = validateProjectHistoryEnvelope(envelopes[index]);
    const eventKey = typedRefKey(envelope.event_ref);
    if (eventRefs.has(eventKey)) {
      fail("duplicate_event_ref", `$envelopes[${index}].event_ref`, "Event refs must be unique");
    }
    eventRefs.add(eventKey);
    byEventRef.set(eventKey, envelope);

    if (metadataDigests.has(envelope.metadata_digest)) {
      fail("duplicate_metadata_digest", `$envelopes[${index}].metadata_digest`, "Metadata digests must be unique");
    }
    metadataDigests.add(envelope.metadata_digest);
  }

  for (const envelope of byEventRef.values()) {
    if (envelope.supersedes_event_ref === null) continue;
    const target = byEventRef.get(typedRefKey(envelope.supersedes_event_ref));
    if (target && envelope.occurrence_id !== target.occurrence_id) {
      fail(
        "supersession_occurrence_mismatch",
        "$envelopes",
        "An in-collection supersession target must describe the same occurrence",
      );
    }
    if (target && !refsEqual(target.classification_after, envelope.classification_before)) {
      fail(
        "classification_supersession_mismatch",
        "$envelopes",
        "A superseding event classification_before must equal the target classification_after",
      );
    }
  }

  const colors = new Map();
  function visit(eventKey) {
    const color = colors.get(eventKey);
    if (color === "gray") {
      fail("supersession_cycle", "$envelopes", "Supersession cycle detected in the provided collection");
    }
    if (color === "black") return;
    colors.set(eventKey, "gray");
    const envelope = byEventRef.get(eventKey);
    if (envelope?.supersedes_event_ref !== null) {
      const targetKey = typedRefKey(envelope.supersedes_event_ref);
      if (byEventRef.has(targetKey)) visit(targetKey);
    }
    colors.set(eventKey, "black");
  }

  for (const eventKey of byEventRef.keys()) visit(eventKey);
  return envelopes;
}

function compareEnvelope(left, right) {
  let result = utf8Compare(left.known_at, right.known_at);
  if (result !== 0) return result;
  result = utf8Compare(left.recorded_at, right.recorded_at);
  if (result !== 0) return result;
  result = PROJECT_HISTORY_LANE_RANK[left.lane] - PROJECT_HISTORY_LANE_RANK[right.lane];
  if (result !== 0) return result;

  if (left.project_ref === null && right.project_ref !== null) return -1;
  if (left.project_ref !== null && right.project_ref === null) return 1;
  if (left.project_ref !== null && right.project_ref !== null) {
    result = utf8Compare(canonicalJson(left.project_ref), canonicalJson(right.project_ref));
    if (result !== 0) return result;
  }

  result = utf8Compare(left.occurrence_id, right.occurrence_id);
  if (result !== 0) return result;
  result = utf8Compare(canonicalJson(left.event_ref), canonicalJson(right.event_ref));
  if (result !== 0) return result;
  return utf8Compare(left.metadata_digest, right.metadata_digest);
}

export function sortProjectHistoryEnvelopes(envelopes) {
  validateProjectHistoryEnvelopeCollection(envelopes);
  return [...envelopes].sort(compareEnvelope);
}

function validateGapCode(value, path) {
  if (typeof value !== "string"
    || value.normalize("NFC") !== value
    || [...value].length > 128
    || !GAP_CODE_PATTERN.test(value)) {
    fail("gap_code_invalid", path, "Gap code must be a lowercase safe token of at most 128 characters");
  }
  return value;
}

function validateGapCodes(value, path) {
  inspectDenseArray(value, path);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    validateGapCode(value[index], `${path}[${index}]`);
    if (seen.has(value[index])) {
      fail("duplicate_gap_code", `${path}[${index}]`, "Gap codes must be unique");
    }
    seen.add(value[index]);
  }
  const sorted = [...value].sort(utf8Compare);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== sorted[index]) {
      fail("gap_codes_not_canonical_order", path, "Gap codes must use UTF-8 byte order");
    }
  }
  return value;
}

function canonicalGapCodes(value) {
  inspectDenseArray(value, "$input.gap_codes");
  const copy = [...value];
  for (let index = 0; index < copy.length; index += 1) {
    validateGapCode(copy[index], `$input.gap_codes[${index}]`);
  }
  const unique = new Set(copy);
  if (unique.size !== copy.length) {
    fail("duplicate_gap_code", "$input.gap_codes", "Gap codes must be unique");
  }
  return copy.sort(utf8Compare);
}

function expectedEventCount(state, envelopes) {
  if (state === "complete_with_events" || state === "partial") return envelopes.length;
  if (state === "complete_no_events") return 0;
  return null;
}

function validateCoverageMatrix(receipt) {
  const { state, event_count: count, gap_codes: gaps, applicability_ref: applicability } = receipt;
  if (state === "complete_with_events") {
    if (!Number.isSafeInteger(count) || count < 1 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_with_events requires count >= 1, no gaps, and null applicability");
    }
  } else if (state === "complete_no_events") {
    if (count !== 0 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_no_events requires zero count, no gaps, and null applicability");
    }
  } else if (state === "partial") {
    if (!Number.isSafeInteger(count) || count < 0 || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "partial requires an exact nonnegative count, gaps, and null applicability");
    }
  } else if (state === "failed" || state === "not_collected") {
    if (count !== null || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", `${state} requires null count, gaps, and null applicability`);
    }
  } else if (state === "not_applicable") {
    if (count !== null || gaps.length !== 0 || applicability === null) {
      fail("coverage_matrix_invalid", "$coverage", "not_applicable requires null count, no gaps, and a rule revision");
    }
  }
}

function validateCoverageBinding(receipt, envelopes) {
  const sorted = sortProjectHistoryEnvelopes(envelopes);
  const expectedCount = expectedEventCount(receipt.state, sorted);
  if (receipt.event_count !== expectedCount) {
    fail("coverage_event_count_mismatch", "$coverage.event_count", "Event count does not match bound envelopes");
  }
  if ((receipt.event_count === null || receipt.event_count === 0) && sorted.length !== 0) {
    fail("coverage_events_forbidden", "$envelopes", "This coverage state cannot bind envelopes");
  }

  const start = Date.parse(receipt.window_start);
  const end = Date.parse(receipt.window_end);
  for (let index = 0; index < sorted.length; index += 1) {
    const envelope = sorted[index];
    if (envelope.lane !== receipt.lane) {
      fail("coverage_lane_mismatch", `$envelopes[${index}].lane`, "Envelope lane differs from receipt scope");
    }
    if (!refsEqual(envelope.source_owner_ref, receipt.source_owner_ref)) {
      fail("coverage_source_owner_mismatch", `$envelopes[${index}].source_owner_ref`, "Envelope source owner differs from receipt scope");
    }
    if (!refsEqual(envelope.project_ref, receipt.project_ref)) {
      fail("coverage_project_mismatch", `$envelopes[${index}].project_ref`, "Envelope project differs from receipt scope");
    }
    const known = Date.parse(envelope.known_at);
    if (known < start || known >= end) {
      fail("coverage_known_at_outside_window", `$envelopes[${index}].known_at`, "known_at is outside the half-open coverage window");
    }
  }

  const expectedDigest = sha256Canonical(sorted.map((envelope) => envelope.metadata_digest));
  if (receipt.ordered_event_digest !== expectedDigest) {
    fail("ordered_event_digest_mismatch", "$coverage.ordered_event_digest", "Ordered event digest does not match bound envelopes");
  }
}

export function validateProjectHistoryCoverageReceipt(value, envelopes = []) {
  assertExactKeys(value, COVERAGE_FIELDS, "$coverage");
  if (value.schema_version !== PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION) {
    fail("coverage_schema_version_invalid", "$coverage.schema_version", "Schema version does not match");
  }
  validateLane(value.lane, "$coverage.lane");
  validateTypedRef(value.source_owner_ref, "source_owner", "$coverage.source_owner_ref");
  validateNullableTypedRef(value.project_ref, "project", "$coverage.project_ref");
  validateCanonicalUtc(value.window_start, "$coverage.window_start");
  validateCanonicalUtc(value.window_end, "$coverage.window_end");
  if (Date.parse(value.window_start) >= Date.parse(value.window_end)) {
    fail("coverage_window_invalid", "$coverage", "Coverage window must have start before end");
  }
  validateCoverageState(value.state, "$coverage.state");
  if (value.event_count !== null
    && (!Number.isSafeInteger(value.event_count) || value.event_count < 0)) {
    fail("coverage_event_count_invalid", "$coverage.event_count", "Event count must be null or an exact nonnegative safe integer");
  }
  validateGapCodes(value.gap_codes, "$coverage.gap_codes");
  validateNullableTypedRef(value.applicability_ref, "rule_revision", "$coverage.applicability_ref");
  validateCoverageMatrix(value);
  validateDigest(value.ordered_event_digest, "$coverage.ordered_event_digest");
  if (value.raw_payload_copied !== false) {
    fail("raw_payload_copied_must_be_false", "$coverage.raw_payload_copied", "Raw payload copying is forbidden");
  }
  validateDigest(value.metadata_digest, "$coverage.metadata_digest");
  const expectedMetadataDigest = computeMetadataDigest(value);
  if (value.metadata_digest !== expectedMetadataDigest) {
    fail("metadata_digest_mismatch", "$coverage.metadata_digest", "Metadata digest does not match the coverage receipt");
  }
  validateCoverageBinding(value, envelopes);
  return value;
}

export function createProjectHistoryCoverageReceipt(input, envelopes = []) {
  assertAllowedKeys(input, COVERAGE_FIELDS, "$input");
  if (Object.hasOwn(input, "schema_version")
    && input.schema_version !== PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION) {
    fail("coverage_schema_version_invalid", "$input.schema_version", "Schema version does not match");
  }
  if (Object.hasOwn(input, "raw_payload_copied") && input.raw_payload_copied !== false) {
    fail("raw_payload_copied_must_be_false", "$input.raw_payload_copied", "Raw payload copying is forbidden");
  }

  validateCoverageState(input.state, "$input.state");
  const sortedEnvelopes = sortProjectHistoryEnvelopes(envelopes);
  const eventCount = expectedEventCount(input.state, sortedEnvelopes);
  const eventDigest = sha256Canonical(sortedEnvelopes.map((envelope) => envelope.metadata_digest));
  const gapCodes = canonicalGapCodes(input.gap_codes);

  if (Object.hasOwn(input, "event_count") && input.event_count !== eventCount) {
    fail("coverage_event_count_mismatch", "$input.event_count", "Provided count does not match bound envelopes and state");
  }
  if (Object.hasOwn(input, "ordered_event_digest") && input.ordered_event_digest !== eventDigest) {
    fail("ordered_event_digest_mismatch", "$input.ordered_event_digest", "Provided digest does not match bound envelopes");
  }

  const receipt = {
    schema_version: PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION,
    lane: input.lane,
    source_owner_ref: input.source_owner_ref,
    project_ref: input.project_ref,
    window_start: input.window_start,
    window_end: input.window_end,
    state: input.state,
    event_count: eventCount,
    gap_codes: gapCodes,
    applicability_ref: input.applicability_ref,
    ordered_event_digest: eventDigest,
    metadata_digest: "",
    raw_payload_copied: false,
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  if (Object.hasOwn(input, "metadata_digest") && input.metadata_digest !== receipt.metadata_digest) {
    fail("metadata_digest_mismatch", "$input.metadata_digest", "Provided metadata digest does not match derived metadata");
  }
  return validateProjectHistoryCoverageReceipt(receipt, sortedEnvelopes);
}
