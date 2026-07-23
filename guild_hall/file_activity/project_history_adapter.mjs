import {
  canonicalJson,
  computeMetadataDigest,
  createProjectHistoryCoverageReceipt,
  createProjectHistoryEnvelope,
  sha256Canonical,
  validateTypedRef,
} from "../shared/project_history_envelope.mjs";

export const FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION =
  "soulforge.file_history_adapter_request.v1";
export const FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION =
  "soulforge.file_history_adapter_event.v1";
export const FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION =
  "soulforge.file_history_adapter_checkpoint.v1";
export const FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION =
  "soulforge.file_history_adapter_coverage.v1";
export const FILE_HISTORY_ADAPTER_STATE_SCHEMA_VERSION =
  "soulforge.file_history_adapter_state.v1";
export const FILE_HISTORY_EVENT_RECEIPT_SCHEMA_VERSION =
  "soulforge.file_history_event_receipt.v1";
export const FILE_HISTORY_CHECKPOINT_RECEIPT_SCHEMA_VERSION =
  "soulforge.file_history_checkpoint_receipt.v1";
export const FILE_HISTORY_SEQUENCE_GAP_RECEIPT_SCHEMA_VERSION =
  "soulforge.file_history_sequence_gap_receipt.v1";
export const FILE_HISTORY_ADAPTER_RESULT_SCHEMA_VERSION =
  "soulforge.file_history_adapter_result.v1";

export const FILE_HISTORY_NATIVE_BINDING_CANDIDATES = Object.freeze({
  file_observation: Object.freeze(["file_activity"]),
  file_reconciliation_event: Object.freeze(["file_activity"]),
  erp_upload_event: Object.freeze(["dev_erp"]),
});

export const FILE_HISTORY_ADAPTER_LIMITS = Object.freeze({
  events_per_request: 5_000,
  retained_event_receipts: 10_000,
  retained_checkpoint_receipts: 1_000,
});

const REQUEST_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "source_owner_ref",
  "project_ref",
  "prior_state",
  "checkpoint",
  "events",
  "coverage",
]);
const EVENT_FIELDS = Object.freeze([
  "schema_version",
  "sequence",
  "native_occurrence_ref",
  "event_ref",
  "source_revision_ref",
  "content_ref",
  "event_at",
  "valid_at",
  "observed_at",
  "known_at",
  "recorded_at",
  "classification_before",
  "classification_after",
  "supersedes_event_ref",
]);
const CHECKPOINT_FIELDS = Object.freeze([
  "schema_version",
  "checkpoint_ref",
  "checkpoint_digest",
  "through_sequence",
]);
const COVERAGE_FIELDS = Object.freeze([
  "schema_version",
  "window_start",
  "window_end",
  "state",
  "gap_codes",
  "applicability_ref",
]);
const STATE_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "source_owner_ref",
  "project_ref",
  "last_contiguous_sequence",
  "event_receipts",
  "checkpoint_receipts",
  "metadata_digest",
]);
const EVENT_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "sequence",
  "native_occurrence_ref",
  "event_ref",
  "event_digest",
  "metadata_digest",
]);
const CHECKPOINT_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "receipt_ref",
  "checkpoint_ref",
  "checkpoint_digest",
  "through_sequence",
  "metadata_digest",
]);

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const FORBIDDEN_SENTINEL_PATTERN =
  /(?:^|[._:@+-])(?:raw_?(?:body|payload|log|file)|body|payload|stage_?log|transcript|file_?bytes|bytes|secret|credentials?|password|cookies?|tokens?|api_?key|private_?key|\.?env)(?:$|[._:@+-])/iu;
const FILE_NAME_OR_PRIVATE_LOCATOR_PATTERN =
  /(?:^|[._:@+-])(?:_workspaces|_workmeta|private-state)(?:$|[._:@+-])|\.(?:csv|docx?|env|jsonl?|key|log|pdf|pem|pptx?|txt|xlsx?|xml|ya?ml|zip)$/iu;
const URI_OR_DRIVE_PATTERN =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|file:|[a-z]:|%2f|%5c|%3a)/iu;

export class FileHistoryAdapterError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "FileHistoryAdapterError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new FileHistoryAdapterError(code, path, message);
}

function inspectRecord(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
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

function requireExactKeys(value, fields, path) {
  const keys = inspectRecord(value, path);
  const expected = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      fail("missing_field", `${path}.${field}`, "Required field is missing");
    }
  }
  for (const key of keys) {
    if (!expected.has(key)) {
      fail("extra_field", `${path}.${key}`, "Unknown field is not allowed");
    }
  }
}

function inspectDenseArray(value, path, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain array");
  }
  if (value.length > maximum) {
    fail("array_limit_exceeded", path, `Array exceeds the limit of ${maximum}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_not_allowed", `${path}[${index}]`, "Sparse arrays are not allowed");
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key)
      || Number(key) >= value.length) {
      fail("array_extra_property", `${path}.${String(key)}`, "Array has an unexpected property");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}[${key}]`, "Only enumerable data properties are allowed");
    }
  }
  return value;
}

function assertBoundarySafeString(value, path) {
  if (value.includes("/") || value.includes("\\")
    || value === "." || value === ".."
    || URI_OR_DRIVE_PATTERN.test(value)
    || /%(?:2f|5c|3a)/iu.test(value)
    || FILE_NAME_OR_PRIVATE_LOCATOR_PATTERN.test(value)) {
    fail("locator_or_path_forbidden", path, "Path-like, absolute, UNC, URI, or encoded locator strings are forbidden");
  }
  if (FORBIDDEN_SENTINEL_PATTERN.test(value)) {
    fail("raw_secret_sentinel_forbidden", path, "Raw, transcript, file-byte, log, or secret sentinels are forbidden");
  }
}

function assertBoundarySafe(value, path = "$request") {
  if (typeof value === "string") {
    assertBoundarySafeString(value, path);
    return;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (Array.isArray(value)) {
    inspectDenseArray(value, path);
    for (let index = 0; index < value.length; index += 1) {
      assertBoundarySafe(value[index], `${path}[${index}]`);
    }
    return;
  }
  const keys = inspectRecord(value, path);
  for (const key of keys) assertBoundarySafe(value[key], `${path}.${key}`);
}

function validateDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hexadecimal characters");
  }
  return value;
}

function validateNonnegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("nonnegative_safe_integer_required", path, "Expected a nonnegative safe integer");
  }
  return value;
}

function validatePositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("positive_safe_integer_required", path, "Expected a positive safe integer");
  }
  return value;
}

function refsEqual(left, right) {
  if (left === null || right === null) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function refKey(value) {
  return canonicalJson(value);
}

function ensureOwnerSurface(ref, ownerSurface, path) {
  if (ref.owner_surface !== ownerSurface) {
    fail("typed_ref_owner_mismatch", `${path}.owner_surface`, "Typed ref owner must match the request source owner");
  }
}

function validateNativeOccurrenceRef(value, sourceOwnerRef, path) {
  validateTypedRef(value, null, path);
  const allowedOwners = FILE_HISTORY_NATIVE_BINDING_CANDIDATES[value.entity_type];
  if (!allowedOwners || !allowedOwners.includes(value.owner_surface)) {
    fail("native_occurrence_binding_not_candidate", path, "Native occurrence type and owner are outside the feature-OFF exact candidate allowlist");
  }
  ensureOwnerSurface(value, sourceOwnerRef.owner_surface, path);
  return value;
}

function typedReceiptRef(entityType, sourceOwnerRef, surface) {
  const digest = sha256Canonical(surface).slice("sha256:".length);
  return {
    entity_type: entityType,
    owner_surface: sourceOwnerRef.owner_surface,
    entity_id: `${entityType}:${digest}`,
  };
}

function validateSourceScope(sourceOwnerRef, projectRef) {
  validateTypedRef(sourceOwnerRef, "source_owner", "$request.source_owner_ref");
  if (!Object.values(FILE_HISTORY_NATIVE_BINDING_CANDIDATES)
    .some((owners) => owners.includes(sourceOwnerRef.owner_surface))) {
    fail(
      "source_owner_not_candidate",
      "$request.source_owner_ref.owner_surface",
      "Source owner is outside the feature-OFF file binding candidate set",
    );
  }
  if (projectRef !== null) validateTypedRef(projectRef, "project", "$request.project_ref");
}

function validateEventInput(event, request, index) {
  const path = `$request.events[${index}]`;
  requireExactKeys(event, EVENT_FIELDS, path);
  if (event.schema_version !== FILE_HISTORY_ADAPTER_EVENT_SCHEMA_VERSION) {
    fail("event_schema_invalid", `${path}.schema_version`, "Event schema version does not match");
  }
  validatePositiveInteger(event.sequence, `${path}.sequence`);
  validateNativeOccurrenceRef(event.native_occurrence_ref, request.source_owner_ref, `${path}.native_occurrence_ref`);
  validateTypedRef(event.event_ref, "event", `${path}.event_ref`);
  ensureOwnerSurface(event.event_ref, request.source_owner_ref.owner_surface, `${path}.event_ref`);
  if (event.source_revision_ref !== null) {
    validateTypedRef(event.source_revision_ref, "source_revision", `${path}.source_revision_ref`);
    ensureOwnerSurface(event.source_revision_ref, request.source_owner_ref.owner_surface, `${path}.source_revision_ref`);
  }
  if (event.content_ref !== null) {
    validateTypedRef(event.content_ref, "content", `${path}.content_ref`);
    ensureOwnerSurface(event.content_ref, request.source_owner_ref.owner_surface, `${path}.content_ref`);
  }
  if ((event.source_revision_ref === null) !== (event.content_ref === null)) {
    fail("revision_content_pair_required", path, "Revision and content refs must both be present or both be null");
  }
  if (event.supersedes_event_ref !== null) {
    validateTypedRef(event.supersedes_event_ref, "event", `${path}.supersedes_event_ref`);
    ensureOwnerSurface(event.supersedes_event_ref, request.source_owner_ref.owner_surface, `${path}.supersedes_event_ref`);
  }

  return createProjectHistoryEnvelope({
    lane: "file",
    source_owner_ref: request.source_owner_ref,
    native_occurrence_ref: event.native_occurrence_ref,
    event_ref: event.event_ref,
    source_revision_ref: event.source_revision_ref,
    content_ref: event.content_ref,
    project_ref: request.project_ref,
    event_at: event.event_at,
    valid_at: event.valid_at,
    observed_at: event.observed_at,
    known_at: event.known_at,
    recorded_at: event.recorded_at,
    classification_before: event.classification_before,
    classification_after: event.classification_after,
    supersedes_event_ref: event.supersedes_event_ref,
  });
}

function validateCheckpointInput(checkpoint, request) {
  if (checkpoint === null) return null;
  requireExactKeys(checkpoint, CHECKPOINT_FIELDS, "$request.checkpoint");
  if (checkpoint.schema_version !== FILE_HISTORY_ADAPTER_CHECKPOINT_SCHEMA_VERSION) {
    fail("checkpoint_schema_invalid", "$request.checkpoint.schema_version", "Checkpoint schema version does not match");
  }
  validateTypedRef(checkpoint.checkpoint_ref, "file_revision_checkpoint", "$request.checkpoint.checkpoint_ref");
  ensureOwnerSurface(
    checkpoint.checkpoint_ref,
    request.source_owner_ref.owner_surface,
    "$request.checkpoint.checkpoint_ref",
  );
  validateDigest(checkpoint.checkpoint_digest, "$request.checkpoint.checkpoint_digest");
  validateNonnegativeInteger(checkpoint.through_sequence, "$request.checkpoint.through_sequence");
  return checkpoint;
}

function validateCoverageInput(coverage) {
  requireExactKeys(coverage, COVERAGE_FIELDS, "$request.coverage");
  if (coverage.schema_version !== FILE_HISTORY_ADAPTER_COVERAGE_SCHEMA_VERSION) {
    fail("coverage_schema_invalid", "$request.coverage.schema_version", "Coverage input schema version does not match");
  }
  inspectDenseArray(coverage.gap_codes, "$request.coverage.gap_codes");
  return coverage;
}

function createEventReceipt(envelope, sequence, sourceOwnerRef) {
  const identitySurface = {
    sequence,
    native_occurrence_ref: envelope.native_occurrence_ref,
    event_ref: envelope.event_ref,
    event_digest: envelope.metadata_digest,
  };
  const receipt = {
    schema_version: FILE_HISTORY_EVENT_RECEIPT_SCHEMA_VERSION,
    receipt_ref: typedReceiptRef("file_event_receipt", sourceOwnerRef, identitySurface),
    ...identitySurface,
    metadata_digest: "",
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return receipt;
}

function validateEventReceipt(receipt, sourceOwnerRef, path) {
  requireExactKeys(receipt, EVENT_RECEIPT_FIELDS, path);
  if (receipt.schema_version !== FILE_HISTORY_EVENT_RECEIPT_SCHEMA_VERSION) {
    fail("event_receipt_schema_invalid", `${path}.schema_version`, "Event receipt schema version does not match");
  }
  validatePositiveInteger(receipt.sequence, `${path}.sequence`);
  validateNativeOccurrenceRef(receipt.native_occurrence_ref, sourceOwnerRef, `${path}.native_occurrence_ref`);
  validateTypedRef(receipt.event_ref, "event", `${path}.event_ref`);
  ensureOwnerSurface(receipt.event_ref, sourceOwnerRef.owner_surface, `${path}.event_ref`);
  validateDigest(receipt.event_digest, `${path}.event_digest`);
  validateTypedRef(receipt.receipt_ref, "file_event_receipt", `${path}.receipt_ref`);
  ensureOwnerSurface(receipt.receipt_ref, sourceOwnerRef.owner_surface, `${path}.receipt_ref`);
  const expectedRef = typedReceiptRef("file_event_receipt", sourceOwnerRef, {
    sequence: receipt.sequence,
    native_occurrence_ref: receipt.native_occurrence_ref,
    event_ref: receipt.event_ref,
    event_digest: receipt.event_digest,
  });
  if (!refsEqual(receipt.receipt_ref, expectedRef)) {
    fail("event_receipt_ref_mismatch", `${path}.receipt_ref`, "Event receipt ref does not match its immutable identity");
  }
  validateDigest(receipt.metadata_digest, `${path}.metadata_digest`);
  if (receipt.metadata_digest !== computeMetadataDigest(receipt)) {
    fail("event_receipt_digest_mismatch", `${path}.metadata_digest`, "Event receipt digest does not match");
  }
  return receipt;
}

function createCheckpointReceipt(checkpoint, sourceOwnerRef) {
  const identitySurface = {
    checkpoint_ref: checkpoint.checkpoint_ref,
    checkpoint_digest: checkpoint.checkpoint_digest,
    through_sequence: checkpoint.through_sequence,
  };
  const receipt = {
    schema_version: FILE_HISTORY_CHECKPOINT_RECEIPT_SCHEMA_VERSION,
    receipt_ref: typedReceiptRef("file_checkpoint_receipt", sourceOwnerRef, identitySurface),
    ...identitySurface,
    metadata_digest: "",
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return receipt;
}

function validateCheckpointReceipt(receipt, sourceOwnerRef, path) {
  requireExactKeys(receipt, CHECKPOINT_RECEIPT_FIELDS, path);
  if (receipt.schema_version !== FILE_HISTORY_CHECKPOINT_RECEIPT_SCHEMA_VERSION) {
    fail("checkpoint_receipt_schema_invalid", `${path}.schema_version`, "Checkpoint receipt schema version does not match");
  }
  validateTypedRef(receipt.receipt_ref, "file_checkpoint_receipt", `${path}.receipt_ref`);
  ensureOwnerSurface(receipt.receipt_ref, sourceOwnerRef.owner_surface, `${path}.receipt_ref`);
  validateTypedRef(receipt.checkpoint_ref, "file_revision_checkpoint", `${path}.checkpoint_ref`);
  ensureOwnerSurface(receipt.checkpoint_ref, sourceOwnerRef.owner_surface, `${path}.checkpoint_ref`);
  validateDigest(receipt.checkpoint_digest, `${path}.checkpoint_digest`);
  validateNonnegativeInteger(receipt.through_sequence, `${path}.through_sequence`);
  const expectedRef = typedReceiptRef("file_checkpoint_receipt", sourceOwnerRef, {
    checkpoint_ref: receipt.checkpoint_ref,
    checkpoint_digest: receipt.checkpoint_digest,
    through_sequence: receipt.through_sequence,
  });
  if (!refsEqual(receipt.receipt_ref, expectedRef)) {
    fail("checkpoint_receipt_ref_mismatch", `${path}.receipt_ref`, "Checkpoint receipt ref does not match its immutable identity");
  }
  validateDigest(receipt.metadata_digest, `${path}.metadata_digest`);
  if (receipt.metadata_digest !== computeMetadataDigest(receipt)) {
    fail("checkpoint_receipt_digest_mismatch", `${path}.metadata_digest`, "Checkpoint receipt digest does not match");
  }
  return receipt;
}

function emptyState(request) {
  const state = {
    schema_version: FILE_HISTORY_ADAPTER_STATE_SCHEMA_VERSION,
    feature_enabled: false,
    source_owner_ref: request.source_owner_ref,
    project_ref: request.project_ref,
    last_contiguous_sequence: 0,
    event_receipts: [],
    checkpoint_receipts: [],
    metadata_digest: "",
  };
  state.metadata_digest = computeMetadataDigest(state);
  return state;
}

export function validateFileHistoryAdapterState(state, expectedScope = null) {
  requireExactKeys(state, STATE_FIELDS, "$state");
  if (state.schema_version !== FILE_HISTORY_ADAPTER_STATE_SCHEMA_VERSION) {
    fail("state_schema_invalid", "$state.schema_version", "State schema version does not match");
  }
  if (state.feature_enabled !== false) {
    fail("feature_must_remain_off", "$state.feature_enabled", "The file history adapter is feature-OFF");
  }
  validateTypedRef(state.source_owner_ref, "source_owner", "$state.source_owner_ref");
  if (state.project_ref !== null) validateTypedRef(state.project_ref, "project", "$state.project_ref");
  if (expectedScope
    && (!refsEqual(state.source_owner_ref, expectedScope.source_owner_ref)
      || !refsEqual(state.project_ref, expectedScope.project_ref))) {
    fail("state_scope_mismatch", "$state", "Prior state scope differs from the request");
  }
  validateNonnegativeInteger(state.last_contiguous_sequence, "$state.last_contiguous_sequence");
  inspectDenseArray(
    state.event_receipts,
    "$state.event_receipts",
    FILE_HISTORY_ADAPTER_LIMITS.retained_event_receipts,
  );
  inspectDenseArray(
    state.checkpoint_receipts,
    "$state.checkpoint_receipts",
    FILE_HISTORY_ADAPTER_LIMITS.retained_checkpoint_receipts,
  );

  const eventRefs = new Set();
  for (let index = 0; index < state.event_receipts.length; index += 1) {
    const receipt = validateEventReceipt(
      state.event_receipts[index],
      state.source_owner_ref,
      `$state.event_receipts[${index}]`,
    );
    if (receipt.sequence !== index + 1) {
      fail("state_sequence_not_contiguous", `$state.event_receipts[${index}].sequence`, "State event receipts must be contiguous and ordered from sequence 1");
    }
    const key = refKey(receipt.event_ref);
    if (eventRefs.has(key)) {
      fail("state_duplicate_event_ref", `$state.event_receipts[${index}].event_ref`, "State event refs must be unique");
    }
    eventRefs.add(key);
  }
  if (state.last_contiguous_sequence !== state.event_receipts.length) {
    fail("state_cursor_mismatch", "$state.last_contiguous_sequence", "Cursor must equal the contiguous event receipt count");
  }

  let priorCheckpointSequence = -1;
  const checkpointRefs = new Set();
  const checkpointDigests = new Set();
  for (let index = 0; index < state.checkpoint_receipts.length; index += 1) {
    const receipt = validateCheckpointReceipt(
      state.checkpoint_receipts[index],
      state.source_owner_ref,
      `$state.checkpoint_receipts[${index}]`,
    );
    if (receipt.through_sequence < priorCheckpointSequence
      || receipt.through_sequence > state.last_contiguous_sequence) {
      fail("state_checkpoint_order_invalid", `$state.checkpoint_receipts[${index}]`, "Checkpoint receipts must be ordered and cannot exceed the cursor");
    }
    priorCheckpointSequence = receipt.through_sequence;
    const ref = refKey(receipt.checkpoint_ref);
    if (checkpointRefs.has(ref) || checkpointDigests.has(receipt.checkpoint_digest)) {
      fail("state_duplicate_checkpoint_identity", `$state.checkpoint_receipts[${index}]`, "Checkpoint ref and digest identities must be unique");
    }
    checkpointRefs.add(ref);
    checkpointDigests.add(receipt.checkpoint_digest);
  }

  validateDigest(state.metadata_digest, "$state.metadata_digest");
  if (state.metadata_digest !== computeMetadataDigest(state)) {
    fail("state_digest_mismatch", "$state.metadata_digest", "State digest does not match");
  }
  assertBoundarySafe(state, "$state");
  return state;
}

function createSequenceGapReceipt({
  sourceOwnerRef,
  checkpoint,
  expectedSequence,
  observedSequence,
  envelope,
}) {
  const identitySurface = {
    checkpoint_ref: checkpoint?.checkpoint_ref ?? null,
    checkpoint_digest: checkpoint?.checkpoint_digest ?? null,
    expected_sequence: expectedSequence,
    observed_sequence: observedSequence,
    event_ref: envelope.event_ref,
    event_digest: envelope.metadata_digest,
  };
  const receipt = {
    schema_version: FILE_HISTORY_SEQUENCE_GAP_RECEIPT_SCHEMA_VERSION,
    gap_ref: typedReceiptRef("file_sequence_gap", sourceOwnerRef, identitySurface),
    ...identitySurface,
    metadata_digest: "",
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return receipt;
}

function requireCheckpointForCoverage(checkpoint, coverage, envelopeCount) {
  const countBearing = coverage.state === "complete_with_events"
    || coverage.state === "complete_no_events"
    || coverage.state === "partial";
  if (countBearing && checkpoint === null) {
    fail("checkpoint_required_for_counted_coverage", "$request.checkpoint", "Count-bearing coverage requires an immutable checkpoint ref and digest");
  }
  if (!countBearing && checkpoint !== null) {
    fail("checkpoint_forbidden_for_null_count_coverage", "$request.checkpoint", "Null-count coverage cannot present a completed checkpoint");
  }
  if (envelopeCount > 0 && !countBearing) {
    fail("events_forbidden_for_null_count_coverage", "$request.events", "Null-count coverage cannot bind events");
  }
}

export function adaptFileHistoryReferences(request) {
  requireExactKeys(request, REQUEST_FIELDS, "$request");
  if (request.schema_version !== FILE_HISTORY_ADAPTER_REQUEST_SCHEMA_VERSION) {
    fail("request_schema_invalid", "$request.schema_version", "Request schema version does not match");
  }
  if (request.feature_enabled !== false) {
    fail("feature_must_remain_off", "$request.feature_enabled", "The file history adapter is feature-OFF");
  }
  validateSourceScope(request.source_owner_ref, request.project_ref);
  inspectDenseArray(
    request.events,
    "$request.events",
    FILE_HISTORY_ADAPTER_LIMITS.events_per_request,
  );
  const checkpoint = validateCheckpointInput(request.checkpoint, request);
  const coverage = validateCoverageInput(request.coverage);

  const priorState = request.prior_state === null
    ? emptyState(request)
    : structuredClone(validateFileHistoryAdapterState(request.prior_state, request));
  assertBoundarySafe(request);

  const stateEventByRef = new Map(
    priorState.event_receipts.map((receipt) => [refKey(receipt.event_ref), receipt]),
  );
  const stateEventBySequence = new Map(
    priorState.event_receipts.map((receipt) => [receipt.sequence, receipt]),
  );
  const currentEnvelopeByRef = new Map();
  const currentEnvelopeBySequence = new Map();
  const envelopes = [];
  const actions = [];
  const gapReceipts = [];
  let expectedSequence = priorState.last_contiguous_sequence + 1;
  let priorInputSequence = 0;

  for (let index = 0; index < request.events.length; index += 1) {
    const event = request.events[index];
    if (event.sequence < priorInputSequence) {
      fail("request_sequence_order_invalid", `$request.events[${index}].sequence`, "Events must use nondecreasing producer sequence order");
    }
    priorInputSequence = event.sequence;
    const envelope = validateEventInput(event, request, index);
    const eventKey = refKey(envelope.event_ref);
    const existingCurrentByRef = currentEnvelopeByRef.get(eventKey);
    const existingCurrentBySequence = currentEnvelopeBySequence.get(event.sequence);
    if (existingCurrentByRef && existingCurrentByRef.metadata_digest !== envelope.metadata_digest) {
      fail("event_ref_digest_conflict", `$request.events[${index}].event_ref`, "Same event ref has a different full-record digest");
    }
    if (existingCurrentByRef && existingCurrentByRef.sequence !== event.sequence) {
      fail("event_ref_sequence_conflict", `$request.events[${index}].sequence`, "Same event ref is reused at a different sequence");
    }
    if (existingCurrentBySequence
      && (refKey(existingCurrentBySequence.event_ref) !== eventKey
        || existingCurrentBySequence.metadata_digest !== envelope.metadata_digest)) {
      fail("event_sequence_conflict", `$request.events[${index}].sequence`, "Producer sequence is reused for a different event");
    }
    if (!existingCurrentByRef) {
      const trackedEnvelope = { ...envelope, sequence: event.sequence };
      currentEnvelopeByRef.set(eventKey, trackedEnvelope);
      currentEnvelopeBySequence.set(event.sequence, trackedEnvelope);
      envelopes.push(envelope);
    }

    const existingByRef = stateEventByRef.get(eventKey);
    const existingBySequence = stateEventBySequence.get(event.sequence);
    if (existingByRef) {
      if (existingByRef.event_digest !== envelope.metadata_digest) {
        fail("event_ref_digest_conflict", `$request.events[${index}].event_ref`, "Same event ref conflicts with the retained immutable digest");
      }
      if (existingByRef.sequence !== event.sequence) {
        fail("event_ref_sequence_conflict", `$request.events[${index}].sequence`, "Same event ref conflicts with the retained sequence");
      }
      actions.push({
        sequence: event.sequence,
        event_ref: envelope.event_ref,
        event_digest: envelope.metadata_digest,
        outcome: "replay_noop",
        receipt_ref: existingByRef.receipt_ref,
        gap_ref: null,
      });
      continue;
    }
    if (existingBySequence) {
      fail("event_sequence_conflict", `$request.events[${index}].sequence`, "Producer sequence conflicts with a retained event");
    }
    if (existingCurrentByRef) {
      const accepted = stateEventByRef.get(eventKey);
      actions.push({
        sequence: event.sequence,
        event_ref: envelope.event_ref,
        event_digest: envelope.metadata_digest,
        outcome: "replay_noop",
        receipt_ref: accepted?.receipt_ref ?? null,
        gap_ref: null,
      });
      continue;
    }
    if (event.sequence < expectedSequence) {
      fail("stale_unrecognized_sequence", `$request.events[${index}].sequence`, "Stale sequence is not an exact retained replay");
    }
    if (event.sequence > expectedSequence) {
      const gapReceipt = createSequenceGapReceipt({
        sourceOwnerRef: request.source_owner_ref,
        checkpoint,
        expectedSequence,
        observedSequence: event.sequence,
        envelope,
      });
      gapReceipts.push(gapReceipt);
      actions.push({
        sequence: event.sequence,
        event_ref: envelope.event_ref,
        event_digest: envelope.metadata_digest,
        outcome: "sequence_gap_held",
        receipt_ref: null,
        gap_ref: gapReceipt.gap_ref,
      });
      continue;
    }

    const eventReceipt = createEventReceipt(envelope, event.sequence, request.source_owner_ref);
    priorState.event_receipts.push(eventReceipt);
    stateEventByRef.set(eventKey, eventReceipt);
    stateEventBySequence.set(event.sequence, eventReceipt);
    priorState.last_contiguous_sequence = event.sequence;
    expectedSequence += 1;
    actions.push({
      sequence: event.sequence,
      event_ref: envelope.event_ref,
      event_digest: envelope.metadata_digest,
      outcome: "applied",
      receipt_ref: eventReceipt.receipt_ref,
      gap_ref: null,
    });
  }

  requireCheckpointForCoverage(checkpoint, coverage, envelopes.length);
  if (gapReceipts.length > 0
    && (coverage.state !== "partial" || coverage.gap_codes.length === 0)) {
    fail("sequence_gap_requires_partial_coverage", "$request.coverage", "Sequence gaps require partial coverage and a caller-supplied D25 gap code");
  }

  let checkpointAction = "not_supplied";
  if (checkpoint !== null) {
    if (checkpoint.through_sequence !== priorState.last_contiguous_sequence) {
      fail("checkpoint_cursor_mismatch", "$request.checkpoint.through_sequence", "Checkpoint must end at the retained contiguous sequence");
    }
    const byRef = new Map(
      priorState.checkpoint_receipts.map((receipt) => [refKey(receipt.checkpoint_ref), receipt]),
    );
    const byDigest = new Map(
      priorState.checkpoint_receipts.map((receipt) => [receipt.checkpoint_digest, receipt]),
    );
    const existing = byRef.get(refKey(checkpoint.checkpoint_ref));
    if (existing) {
      if (existing.checkpoint_digest !== checkpoint.checkpoint_digest
        || existing.through_sequence !== checkpoint.through_sequence) {
        fail("checkpoint_ref_digest_conflict", "$request.checkpoint", "Same checkpoint ref has different immutable metadata");
      }
      checkpointAction = "replay_noop";
    } else if (byDigest.has(checkpoint.checkpoint_digest)) {
      fail("checkpoint_digest_ref_conflict", "$request.checkpoint", "Same checkpoint digest is aliased by a different ref");
    } else {
      if (priorState.checkpoint_receipts.length >= FILE_HISTORY_ADAPTER_LIMITS.retained_checkpoint_receipts) {
        fail("checkpoint_receipt_limit_exceeded", "$request.checkpoint", "Checkpoint receipt state limit reached");
      }
      priorState.checkpoint_receipts.push(
        createCheckpointReceipt(checkpoint, request.source_owner_ref),
      );
      priorState.checkpoint_receipts.sort((left, right) => (
        left.through_sequence - right.through_sequence
        || refKey(left.checkpoint_ref).localeCompare(refKey(right.checkpoint_ref))
      ));
      checkpointAction = "applied";
    }
  }
  if (priorState.event_receipts.length > FILE_HISTORY_ADAPTER_LIMITS.retained_event_receipts) {
    fail("event_receipt_limit_exceeded", "$request.events", "Event receipt state limit reached");
  }

  priorState.metadata_digest = computeMetadataDigest(priorState);
  validateFileHistoryAdapterState(priorState, request);
  const coverageReceipt = createProjectHistoryCoverageReceipt({
    lane: "file",
    source_owner_ref: request.source_owner_ref,
    project_ref: request.project_ref,
    window_start: coverage.window_start,
    window_end: coverage.window_end,
    state: coverage.state,
    gap_codes: coverage.gap_codes,
    applicability_ref: coverage.applicability_ref,
  }, envelopes);

  const result = {
    schema_version: FILE_HISTORY_ADAPTER_RESULT_SCHEMA_VERSION,
    feature_enabled: false,
    source_owner_ref: request.source_owner_ref,
    project_ref: request.project_ref,
    envelopes,
    coverage_receipt: coverageReceipt,
    actions,
    gap_receipts: gapReceipts,
    checkpoint_action: checkpointAction,
    state: priorState,
    metadata_digest: "",
  };
  result.metadata_digest = computeMetadataDigest(result);
  return result;
}

export const reduceFileHistoryAdapter = adaptFileHistoryReferences;
