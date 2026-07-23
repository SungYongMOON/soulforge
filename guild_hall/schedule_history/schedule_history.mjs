import { Buffer } from "node:buffer";

import {
  PROJECT_HISTORY_COVERAGE_STATES,
  canonicalJson,
  computeMetadataDigest,
  sha256Canonical,
  validateTypedRef,
} from "../shared/project_history_envelope.mjs";

export const SCHEDULE_SOURCE_BINDING_SCHEMA_VERSION =
  "soulforge.schedule_history_source_binding.v1";
export const SCHEDULE_REVISION_SCHEMA_VERSION =
  "soulforge.schedule_history_revision.v1";
export const SCHEDULE_APPEND_RECEIPT_SCHEMA_VERSION =
  "soulforge.schedule_history_append_receipt.v1";
export const SCHEDULE_COVERAGE_RECEIPT_SCHEMA_VERSION =
  "soulforge.schedule_history_coverage_receipt.v1";

export const SCHEDULE_HISTORY_COVERAGE_STATES =
  PROJECT_HISTORY_COVERAGE_STATES;

const ADAPTER_REVISION_REF = Object.freeze({
  entity_type: "adapter_revision",
  owner_surface: "schedule_history",
  entity_id: "schedule-history-adapter:v1",
});

const BINDING_INPUT_FIELDS = Object.freeze([
  "schedule_owner_ref",
  "schedule_ref",
  "writer_ref",
  "project_ref",
  "adapter_revision_ref",
  "source_mode",
  "activation",
  "live_authority",
]);

const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "binding_ref",
  ...BINDING_INPUT_FIELDS,
  "metadata_digest",
  "raw_payload_copied",
]);

const REVISION_INPUT_FIELDS = Object.freeze([
  "source_binding_ref",
  "source_row_ref",
  "revision_ref",
  "event_ref",
  "previous_revision_ref",
  "supersedes_event_ref",
  "expected_current_revision_ref",
  "canonical_record_ref",
  "source_sequence",
  "observed_at",
  "known_at",
  "recorded_at",
]);

const REVISION_FIELDS = Object.freeze([
  "schema_version",
  "source_binding_ref",
  "scoped_row_ref",
  ...REVISION_INPUT_FIELDS.filter((field) => field !== "source_binding_ref"),
  "record_digest",
  "raw_payload_copied",
]);

const APPEND_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "source_binding_ref",
  "scoped_row_ref",
  "event_ref",
  "revision_ref",
  "result",
  "expected_sequence",
  "observed_sequence",
  "gap_start_sequence",
  "gap_end_sequence",
  "record_digest",
  "ordered_history_digest",
  "metadata_digest",
  "raw_payload_copied",
]);

const COVERAGE_INPUT_FIELDS = Object.freeze([
  "source_binding_ref",
  "window_start",
  "window_end",
  "state",
  "gap_codes",
  "applicability_ref",
]);

const COVERAGE_FIELDS = Object.freeze([
  "schema_version",
  "lane",
  "source_binding_ref",
  "schedule_ref",
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

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UTC_MILLISECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SYNTHETIC_GAP_PATTERN =
  /^synthetic_[a-z0-9][a-z0-9._-]{0,117}$/u;
const FORBIDDEN_SEGMENT_PATTERN =
  /(?:^|[._:@+-])(?:api[_-]?key|bearer|body|cookie|credential|live|password|prod|production|raw|runs|secret|smartsheet|stage[_-]?log|tbd|token|transcript|unknown|unresolved)(?:$|[._:@+-])/iu;
const PATH_OR_URI_PATTERN =
  /^(?:[A-Za-z]:[\\/]|\\\\|\/|[A-Za-z][A-Za-z0-9+.-]*:\/\/)|[\\/]/u;

export class ScheduleHistoryError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ScheduleHistoryError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ScheduleHistoryError(code, path, message);
}

function inspectPlainObject(value, path) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  canonicalJson(value);
  return Reflect.ownKeys(value);
}

function assertExactKeys(value, expectedFields, path) {
  const keys = inspectPlainObject(value, path);
  const expected = new Set(expectedFields);
  for (const field of expectedFields) {
    if (!Object.hasOwn(value, field)) {
      fail("missing_field", `${path}.${field}`, "Required field is missing");
    }
  }
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) {
      fail("extra_field", `${path}.${String(key)}`, "Unknown field is not allowed");
    }
  }
}

function inspectArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain array");
  }
  canonicalJson(value);
  return value;
}

function canonicalClone(value) {
  return JSON.parse(canonicalJson(value));
}

function refsEqual(left, right) {
  if (left === null || right === null) return left === right;
  return canonicalJson(left) === canonicalJson(right);
}

function compareCanonical(left, right) {
  return Buffer.compare(
    Buffer.from(canonicalJson(left), "utf8"),
    Buffer.from(canonicalJson(right), "utf8"),
  );
}

function validateDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function validateCanonicalUtc(value, path) {
  if (typeof value !== "string" || !UTC_MILLISECONDS_PATTERN.test(value)) {
    fail(
      "timestamp_not_canonical_utc",
      path,
      "Expected canonical UTC ISO timestamp with milliseconds",
    );
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("timestamp_not_canonical_utc", path, "Timestamp is not a real UTC instant");
  }
  return value;
}

function validateBoundaryString(value, path) {
  if (typeof value !== "string") {
    fail("string_required", path, "Expected a string");
  }
  if (
    PATH_OR_URI_PATTERN.test(value)
    || value.includes("/")
    || value.includes("\\")
  ) {
    fail("path_or_uri_forbidden", path, "Paths, UNC locators, and URIs are forbidden");
  }
  if (FORBIDDEN_SEGMENT_PATTERN.test(value)) {
    fail(
      "raw_secret_or_live_sentinel",
      path,
      "Raw, secret, unresolved, provider-live, and log sentinels are forbidden",
    );
  }
  return value;
}

function validateRef(value, entityType, path, ownerSurface = null) {
  validateTypedRef(value, entityType, path);
  validateBoundaryString(value.entity_type, `${path}.entity_type`);
  validateBoundaryString(value.owner_surface, `${path}.owner_surface`);
  validateBoundaryString(value.entity_id, `${path}.entity_id`);
  if (ownerSurface !== null && value.owner_surface !== ownerSurface) {
    fail(
      "ref_owner_mismatch",
      `${path}.owner_surface`,
      `Expected owner surface ${ownerSurface}`,
    );
  }
  return value;
}

function validateNullableRef(value, entityType, path, ownerSurface = null) {
  if (value === null) return null;
  return validateRef(value, entityType, path, ownerSurface);
}

function assertSyntheticOwner(value, path) {
  if (!value.startsWith("synthetic_")) {
    fail(
      "synthetic_owner_required",
      path,
      "This feature-OFF package accepts synthetic owner surfaces only",
    );
  }
}

function deriveBindingRef(input) {
  const digest = sha256Canonical({
    schedule_owner_ref: input.schedule_owner_ref,
    schedule_ref: input.schedule_ref,
    writer_ref: input.writer_ref,
    project_ref: input.project_ref,
    adapter_revision_ref: input.adapter_revision_ref,
    source_mode: input.source_mode,
  });
  return {
    entity_type: "schedule_source_binding",
    owner_surface: "schedule_history",
    entity_id: `schedule-binding:${digest.slice("sha256:".length)}`,
  };
}

function validateAdapterRevisionRef(value, path) {
  validateRef(value, "adapter_revision", path, "schedule_history");
  if (!refsEqual(value, ADAPTER_REVISION_REF)) {
    fail(
      "adapter_revision_unsupported",
      path,
      "Only the pinned feature-OFF adapter revision is supported",
    );
  }
  return value;
}

export function createScheduleSourceBinding(input) {
  assertExactKeys(input, BINDING_INPUT_FIELDS, "$binding_input");
  const binding = {
    schema_version: SCHEDULE_SOURCE_BINDING_SCHEMA_VERSION,
    binding_ref: deriveBindingRef(input),
    ...canonicalClone(input),
    metadata_digest: "",
    raw_payload_copied: false,
  };
  binding.metadata_digest = computeMetadataDigest(binding);
  return validateScheduleSourceBinding(binding);
}

export function validateScheduleSourceBinding(value) {
  assertExactKeys(value, BINDING_FIELDS, "$binding");
  if (value.schema_version !== SCHEDULE_SOURCE_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_invalid", "$binding.schema_version", "Schema version does not match");
  }

  validateRef(value.schedule_owner_ref, "source_owner", "$binding.schedule_owner_ref");
  assertSyntheticOwner(
    value.schedule_owner_ref.owner_surface,
    "$binding.schedule_owner_ref.owner_surface",
  );
  validateRef(
    value.schedule_ref,
    "schedule",
    "$binding.schedule_ref",
    value.schedule_owner_ref.owner_surface,
  );
  validateRef(value.writer_ref, "schedule_writer", "$binding.writer_ref");
  assertSyntheticOwner(value.writer_ref.owner_surface, "$binding.writer_ref.owner_surface");
  validateRef(value.project_ref, "project", "$binding.project_ref");
  assertSyntheticOwner(value.project_ref.owner_surface, "$binding.project_ref.owner_surface");
  validateAdapterRevisionRef(value.adapter_revision_ref, "$binding.adapter_revision_ref");

  if (value.source_mode !== "synthetic_only") {
    fail(
      "source_mode_forbidden",
      "$binding.source_mode",
      "Only synthetic_only source mode is permitted",
    );
  }
  if (value.activation !== false) {
    fail("activation_forbidden", "$binding.activation", "Adapter activation must remain false");
  }
  if (value.live_authority !== false) {
    fail(
      "live_authority_forbidden",
      "$binding.live_authority",
      "Live external-source authority is outside this package",
    );
  }
  if (value.raw_payload_copied !== false) {
    fail(
      "raw_payload_copied_must_be_false",
      "$binding.raw_payload_copied",
      "Raw payload copying is forbidden",
    );
  }

  validateRef(
    value.binding_ref,
    "schedule_source_binding",
    "$binding.binding_ref",
    "schedule_history",
  );
  const expectedBindingRef = deriveBindingRef(value);
  if (!refsEqual(value.binding_ref, expectedBindingRef)) {
    fail(
      "binding_ref_mismatch",
      "$binding.binding_ref",
      "Binding ref does not match the explicit source binding",
    );
  }

  validateDigest(value.metadata_digest, "$binding.metadata_digest");
  if (value.metadata_digest !== computeMetadataDigest(value)) {
    fail(
      "metadata_digest_mismatch",
      "$binding.metadata_digest",
      "Binding metadata digest does not match",
    );
  }
  return value;
}

export function deriveScopedScheduleRowRef(binding, sourceRowRef) {
  validateScheduleSourceBinding(binding);
  validateRef(
    sourceRowRef,
    "schedule_source_row",
    "$source_row_ref",
    binding.schedule_owner_ref.owner_surface,
  );
  const digest = sha256Canonical({
    schedule_owner_ref: binding.schedule_owner_ref,
    schedule_ref: binding.schedule_ref,
    source_row_ref: sourceRowRef,
  });
  return {
    entity_type: "schedule_row",
    owner_surface: "schedule_history",
    entity_id: `schedule-row:${digest.slice("sha256:".length)}`,
  };
}

export function createScheduleRevision(input, binding) {
  assertExactKeys(input, REVISION_INPUT_FIELDS, "$revision_input");
  validateScheduleSourceBinding(binding);
  if (!refsEqual(input.source_binding_ref, binding.binding_ref)) {
    fail(
      "source_binding_ref_mismatch",
      "$revision_input.source_binding_ref",
      "Revision must bind to the supplied source binding",
    );
  }

  const record = {
    schema_version: SCHEDULE_REVISION_SCHEMA_VERSION,
    source_binding_ref: canonicalClone(input.source_binding_ref),
    scoped_row_ref: deriveScopedScheduleRowRef(binding, input.source_row_ref),
    source_row_ref: canonicalClone(input.source_row_ref),
    revision_ref: canonicalClone(input.revision_ref),
    event_ref: canonicalClone(input.event_ref),
    previous_revision_ref: canonicalClone(input.previous_revision_ref),
    supersedes_event_ref: canonicalClone(input.supersedes_event_ref),
    expected_current_revision_ref: canonicalClone(input.expected_current_revision_ref),
    canonical_record_ref: canonicalClone(input.canonical_record_ref),
    source_sequence: input.source_sequence,
    observed_at: input.observed_at,
    known_at: input.known_at,
    recorded_at: input.recorded_at,
    record_digest: "",
    raw_payload_copied: false,
  };
  record.record_digest = computeRevisionDigest(record);
  return validateScheduleRevision(record, binding);
}

function computeRevisionDigest(record) {
  const digestable = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key !== "record_digest") digestable[key] = entry;
  }
  return sha256Canonical(digestable);
}

export function validateScheduleRevision(value, binding) {
  assertExactKeys(value, REVISION_FIELDS, "$revision");
  validateScheduleSourceBinding(binding);
  if (value.schema_version !== SCHEDULE_REVISION_SCHEMA_VERSION) {
    fail("revision_schema_invalid", "$revision.schema_version", "Schema version does not match");
  }
  validateRef(
    value.source_binding_ref,
    "schedule_source_binding",
    "$revision.source_binding_ref",
    "schedule_history",
  );
  if (!refsEqual(value.source_binding_ref, binding.binding_ref)) {
    fail(
      "source_binding_ref_mismatch",
      "$revision.source_binding_ref",
      "Revision source binding does not match",
    );
  }

  const sourceOwner = binding.schedule_owner_ref.owner_surface;
  validateRef(
    value.source_row_ref,
    "schedule_source_row",
    "$revision.source_row_ref",
    sourceOwner,
  );
  validateRef(
    value.scoped_row_ref,
    "schedule_row",
    "$revision.scoped_row_ref",
    "schedule_history",
  );
  const expectedRowRef = deriveScopedScheduleRowRef(binding, value.source_row_ref);
  if (!refsEqual(value.scoped_row_ref, expectedRowRef)) {
    fail(
      "scoped_row_ref_mismatch",
      "$revision.scoped_row_ref",
      "Scoped row ref does not match owner, schedule, and source row",
    );
  }

  validateRef(value.revision_ref, "source_revision", "$revision.revision_ref", sourceOwner);
  validateRef(value.event_ref, "event", "$revision.event_ref", sourceOwner);
  validateNullableRef(
    value.previous_revision_ref,
    "source_revision",
    "$revision.previous_revision_ref",
    sourceOwner,
  );
  validateNullableRef(
    value.supersedes_event_ref,
    "event",
    "$revision.supersedes_event_ref",
    sourceOwner,
  );
  validateNullableRef(
    value.expected_current_revision_ref,
    "source_revision",
    "$revision.expected_current_revision_ref",
    sourceOwner,
  );
  validateRef(
    value.canonical_record_ref,
    "content",
    "$revision.canonical_record_ref",
    sourceOwner,
  );

  if (!Number.isSafeInteger(value.source_sequence) || value.source_sequence < 1) {
    fail(
      "source_sequence_invalid",
      "$revision.source_sequence",
      "Source sequence must be a positive safe integer",
    );
  }
  validateCanonicalUtc(value.observed_at, "$revision.observed_at");
  validateCanonicalUtc(value.known_at, "$revision.known_at");
  validateCanonicalUtc(value.recorded_at, "$revision.recorded_at");
  if (Date.parse(value.recorded_at) > Date.parse(value.known_at)) {
    fail(
      "recorded_after_known",
      "$revision.recorded_at",
      "recorded_at must be earlier than or equal to known_at",
    );
  }
  if (value.raw_payload_copied !== false) {
    fail(
      "raw_payload_copied_must_be_false",
      "$revision.raw_payload_copied",
      "Raw payload copying is forbidden",
    );
  }
  validateDigest(value.record_digest, "$revision.record_digest");
  if (value.record_digest !== computeRevisionDigest(value)) {
    fail(
      "record_digest_mismatch",
      "$revision.record_digest",
      "Canonical full-record digest does not match",
    );
  }
  return value;
}

function sortScheduleRevisions(records) {
  return [...records].sort((left, right) => {
    let result = compareCanonical(left.scoped_row_ref, right.scoped_row_ref);
    if (result !== 0) return result;
    result = left.source_sequence - right.source_sequence;
    if (result !== 0) return result;
    result = Buffer.compare(Buffer.from(left.known_at), Buffer.from(right.known_at));
    if (result !== 0) return result;
    return compareCanonical(left.event_ref, right.event_ref);
  });
}

export function validateScheduleRevisionCollection(records, binding) {
  inspectArray(records, "$records");
  validateScheduleSourceBinding(binding);
  const eventRefs = new Set();
  const revisionRefs = new Set();
  const recordDigests = new Set();
  const rows = new Map();

  for (let index = 0; index < records.length; index += 1) {
    const record = validateScheduleRevision(records[index], binding);
    const eventKey = canonicalJson(record.event_ref);
    const revisionKey = canonicalJson(record.revision_ref);
    if (eventRefs.has(eventKey)) {
      fail("duplicate_event_ref", `$records[${index}].event_ref`, "Event ref must be unique");
    }
    if (revisionRefs.has(revisionKey)) {
      fail(
        "duplicate_revision_ref",
        `$records[${index}].revision_ref`,
        "Revision ref must be unique",
      );
    }
    if (recordDigests.has(record.record_digest)) {
      fail(
        "duplicate_record_digest",
        `$records[${index}].record_digest`,
        "Full-record digest must be unique",
      );
    }
    eventRefs.add(eventKey);
    revisionRefs.add(revisionKey);
    recordDigests.add(record.record_digest);

    const rowKey = canonicalJson(record.scoped_row_ref);
    if (!rows.has(rowKey)) rows.set(rowKey, []);
    rows.get(rowKey).push(record);
  }

  for (const rowRecords of rows.values()) {
    rowRecords.sort((left, right) => left.source_sequence - right.source_sequence);
    for (let index = 0; index < rowRecords.length; index += 1) {
      const record = rowRecords[index];
      const previous = rowRecords[index - 1] ?? null;
      if (previous === null) {
        if (
          record.previous_revision_ref !== null
          || record.supersedes_event_ref !== null
          || record.expected_current_revision_ref !== null
        ) {
          fail(
            "initial_revision_link_invalid",
            "$records",
            "First observed row revision must have null predecessor refs",
          );
        }
      } else {
        if (record.source_sequence <= previous.source_sequence) {
          fail(
            "source_sequence_not_forward",
            "$records",
            "Row source sequence must move forward",
          );
        }
        if (
          !refsEqual(record.previous_revision_ref, previous.revision_ref)
          || !refsEqual(record.expected_current_revision_ref, previous.revision_ref)
          || !refsEqual(record.supersedes_event_ref, previous.event_ref)
        ) {
          fail(
            "revision_chain_mismatch",
            "$records",
            "Revision chain must point to the prior observed row revision and event",
          );
        }
      }
    }
  }
  return records;
}

function createAppendReceipt(record, result, expectedSequence, records) {
  const hasGap = result === "accepted_with_gap";
  const receipt = {
    schema_version: SCHEDULE_APPEND_RECEIPT_SCHEMA_VERSION,
    source_binding_ref: canonicalClone(record.source_binding_ref),
    scoped_row_ref: canonicalClone(record.scoped_row_ref),
    event_ref: canonicalClone(record.event_ref),
    revision_ref: canonicalClone(record.revision_ref),
    result,
    expected_sequence: expectedSequence,
    observed_sequence: record.source_sequence,
    gap_start_sequence: hasGap ? expectedSequence : null,
    gap_end_sequence: hasGap ? record.source_sequence - 1 : null,
    record_digest: record.record_digest,
    ordered_history_digest: sha256Canonical(
      sortScheduleRevisions(records).map((entry) => entry.record_digest),
    ),
    metadata_digest: "",
    raw_payload_copied: false,
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return validateScheduleAppendReceipt(receipt, records);
}

export function validateScheduleAppendReceipt(value, records = null) {
  assertExactKeys(value, APPEND_RECEIPT_FIELDS, "$append_receipt");
  if (value.schema_version !== SCHEDULE_APPEND_RECEIPT_SCHEMA_VERSION) {
    fail(
      "append_receipt_schema_invalid",
      "$append_receipt.schema_version",
      "Schema version does not match",
    );
  }
  validateRef(
    value.source_binding_ref,
    "schedule_source_binding",
    "$append_receipt.source_binding_ref",
    "schedule_history",
  );
  validateRef(
    value.scoped_row_ref,
    "schedule_row",
    "$append_receipt.scoped_row_ref",
    "schedule_history",
  );
  validateRef(value.event_ref, "event", "$append_receipt.event_ref");
  validateRef(value.revision_ref, "source_revision", "$append_receipt.revision_ref");
  assertSyntheticOwner(
    value.event_ref.owner_surface,
    "$append_receipt.event_ref.owner_surface",
  );
  assertSyntheticOwner(
    value.revision_ref.owner_surface,
    "$append_receipt.revision_ref.owner_surface",
  );
  if (!["accepted", "accepted_with_gap", "identical_replay"].includes(value.result)) {
    fail(
      "append_result_invalid",
      "$append_receipt.result",
      "Append result is not recognized",
    );
  }
  if (
    !Number.isSafeInteger(value.expected_sequence)
    || value.expected_sequence < 1
    || !Number.isSafeInteger(value.observed_sequence)
    || value.observed_sequence < 1
  ) {
    fail(
      "append_sequence_invalid",
      "$append_receipt",
      "Expected and observed sequence must be positive safe integers",
    );
  }
  if (value.result === "accepted_with_gap") {
    if (
      value.observed_sequence <= value.expected_sequence
      || value.gap_start_sequence !== value.expected_sequence
      || value.gap_end_sequence !== value.observed_sequence - 1
    ) {
      fail(
        "append_gap_invalid",
        "$append_receipt",
        "Gap bounds must cover the exact missing ordered sequence",
      );
    }
  } else {
    if (value.observed_sequence !== value.expected_sequence) {
      fail(
        "append_non_gap_sequence_mismatch",
        "$append_receipt",
        "Accepted and identical replay receipts require equal expected and observed sequence",
      );
    }
    if (value.gap_start_sequence !== null || value.gap_end_sequence !== null) {
      fail(
        "append_gap_forbidden",
        "$append_receipt",
        "Non-gap receipts must not contain gap bounds",
      );
    }
  }
  validateDigest(value.record_digest, "$append_receipt.record_digest");
  validateDigest(
    value.ordered_history_digest,
    "$append_receipt.ordered_history_digest",
  );
  if (records !== null) {
    inspectArray(records, "$records");
    const expectedHistoryDigest = sha256Canonical(
      sortScheduleRevisions(records).map((entry) => entry.record_digest),
    );
    if (value.ordered_history_digest !== expectedHistoryDigest) {
      fail(
        "ordered_history_digest_mismatch",
        "$append_receipt.ordered_history_digest",
        "History digest does not match the supplied records",
      );
    }
    const boundRecord = records.find((record) =>
      refsEqual(record.source_binding_ref, value.source_binding_ref)
      && refsEqual(record.scoped_row_ref, value.scoped_row_ref)
      && refsEqual(record.event_ref, value.event_ref)
      && refsEqual(record.revision_ref, value.revision_ref)
      && record.record_digest === value.record_digest);
    if (!boundRecord) {
      fail(
        "append_record_binding_mismatch",
        "$append_receipt",
        "Append receipt must bind one exact immutable revision record",
      );
    }
    if (boundRecord.source_sequence !== value.observed_sequence) {
      fail(
        "append_record_sequence_mismatch",
        "$append_receipt.observed_sequence",
        "Observed sequence must equal the bound immutable revision sequence",
      );
    }
  }
  if (value.raw_payload_copied !== false) {
    fail(
      "raw_payload_copied_must_be_false",
      "$append_receipt.raw_payload_copied",
      "Raw payload copying is forbidden",
    );
  }
  validateDigest(value.metadata_digest, "$append_receipt.metadata_digest");
  if (value.metadata_digest !== computeMetadataDigest(value)) {
    fail(
      "metadata_digest_mismatch",
      "$append_receipt.metadata_digest",
      "Append receipt digest does not match",
    );
  }
  return value;
}

export function appendScheduleRevision(records, candidate, binding) {
  validateScheduleRevisionCollection(records, binding);
  validateScheduleRevision(candidate, binding);

  const sameEvent = records.find((record) => refsEqual(record.event_ref, candidate.event_ref));
  const sameRevision = records.find((record) =>
    refsEqual(record.revision_ref, candidate.revision_ref));
  if (
    sameEvent
    && sameRevision === sameEvent
    && sameEvent.record_digest === candidate.record_digest
  ) {
    const stableRecords = sortScheduleRevisions(records).map(canonicalClone);
    return {
      records: stableRecords,
      receipt: createAppendReceipt(
        candidate,
        "identical_replay",
        candidate.source_sequence,
        stableRecords,
      ),
    };
  }
  if (sameEvent) {
    fail(
      "event_ref_conflict",
      "$candidate.event_ref",
      "The immutable event ref already has a different full-record digest",
    );
  }
  if (sameRevision) {
    fail(
      "revision_ref_conflict",
      "$candidate.revision_ref",
      "The immutable revision ref already has a different full-record digest",
    );
  }

  const rowRecords = records
    .filter((record) => refsEqual(record.scoped_row_ref, candidate.scoped_row_ref))
    .sort((left, right) => left.source_sequence - right.source_sequence);
  const current = rowRecords.at(-1) ?? null;
  const expectedSequence = current === null ? 1 : current.source_sequence + 1;

  if (current === null) {
    if (
      candidate.previous_revision_ref !== null
      || candidate.supersedes_event_ref !== null
      || candidate.expected_current_revision_ref !== null
    ) {
      fail(
        "initial_revision_link_invalid",
        "$candidate",
        "First observed row revision must have null predecessor refs",
      );
    }
  } else {
    if (!refsEqual(candidate.expected_current_revision_ref, current.revision_ref)) {
      fail(
        "stale_expected_revision",
        "$candidate.expected_current_revision_ref",
        "Expected current revision does not match the latest observed revision",
      );
    }
    if (!refsEqual(candidate.previous_revision_ref, current.revision_ref)) {
      fail(
        "previous_revision_mismatch",
        "$candidate.previous_revision_ref",
        "Previous revision ref does not match current revision",
      );
    }
    if (!refsEqual(candidate.supersedes_event_ref, current.event_ref)) {
      fail(
        "supersedes_event_mismatch",
        "$candidate.supersedes_event_ref",
        "Superseded event ref does not match the current event",
      );
    }
    if (candidate.source_sequence <= current.source_sequence) {
      fail(
        "source_sequence_not_forward",
        "$candidate.source_sequence",
        "Source sequence must move forward",
      );
    }
    if (refsEqual(candidate.canonical_record_ref, current.canonical_record_ref)) {
      fail(
        "canonical_record_unchanged",
        "$candidate.canonical_record_ref",
        "Canonical-equivalent input must replay the existing immutable event",
      );
    }
  }

  const nextRecords = sortScheduleRevisions([...records, candidate]).map(canonicalClone);
  validateScheduleRevisionCollection(nextRecords, binding);
  const result = candidate.source_sequence > expectedSequence
    ? "accepted_with_gap"
    : "accepted";
  return {
    records: nextRecords,
    receipt: createAppendReceipt(candidate, result, expectedSequence, nextRecords),
  };
}

function validateGapCodes(value, path) {
  inspectArray(value, path);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const code = value[index];
    if (
      typeof code !== "string"
      || code.normalize("NFC") !== code
      || !SYNTHETIC_GAP_PATTERN.test(code)
    ) {
      fail(
        "synthetic_gap_code_invalid",
        `${path}[${index}]`,
        "Pre-ratification gap codes must be explicit synthetic_ tokens",
      );
    }
    validateBoundaryString(code, `${path}[${index}]`);
    if (seen.has(code)) {
      fail("duplicate_gap_code", `${path}[${index}]`, "Gap codes must be unique");
    }
    seen.add(code);
  }
  const sorted = [...value].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  if (canonicalJson(sorted) !== canonicalJson(value)) {
    fail("gap_codes_not_sorted", path, "Gap codes must be in UTF-8 byte order");
  }
  return value;
}

function expectedCoverageCount(state, records) {
  if (state === "complete_with_events" || state === "partial") return records.length;
  if (state === "complete_no_events") return 0;
  return null;
}

function validateCoverageMatrix(receipt) {
  const count = receipt.event_count;
  const gaps = receipt.gap_codes;
  const applicability = receipt.applicability_ref;
  if (receipt.state === "complete_with_events") {
    if (!Number.isSafeInteger(count) || count < 1 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_with_events matrix mismatch");
    }
  } else if (receipt.state === "complete_no_events") {
    if (count !== 0 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_no_events matrix mismatch");
    }
  } else if (receipt.state === "partial") {
    if (!Number.isSafeInteger(count) || count < 0 || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "partial matrix mismatch");
    }
  } else if (receipt.state === "failed" || receipt.state === "not_collected") {
    if (count !== null || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", `${receipt.state} matrix mismatch`);
    }
  } else if (receipt.state === "not_applicable") {
    if (count !== null || gaps.length !== 0 || applicability === null) {
      fail("coverage_matrix_invalid", "$coverage", "not_applicable matrix mismatch");
    }
  }
}

function sortedCoverageRecords(records) {
  return [...records].sort((left, right) => {
    let result = Buffer.compare(Buffer.from(left.known_at), Buffer.from(right.known_at));
    if (result !== 0) return result;
    result = Buffer.compare(Buffer.from(left.recorded_at), Buffer.from(right.recorded_at));
    if (result !== 0) return result;
    result = compareCanonical(left.scoped_row_ref, right.scoped_row_ref);
    if (result !== 0) return result;
    result = left.source_sequence - right.source_sequence;
    if (result !== 0) return result;
    result = compareCanonical(left.event_ref, right.event_ref);
    if (result !== 0) return result;
    return Buffer.compare(
      Buffer.from(left.record_digest, "utf8"),
      Buffer.from(right.record_digest, "utf8"),
    );
  });
}

export function createScheduleCoverageReceipt(input, records, binding) {
  assertExactKeys(input, COVERAGE_INPUT_FIELDS, "$coverage_input");
  validateScheduleRevisionCollection(records, binding);
  if (!refsEqual(input.source_binding_ref, binding.binding_ref)) {
    fail(
      "source_binding_ref_mismatch",
      "$coverage_input.source_binding_ref",
      "Coverage must bind to the supplied source binding",
    );
  }
  if (!SCHEDULE_HISTORY_COVERAGE_STATES.includes(input.state)) {
    fail("coverage_state_invalid", "$coverage_input.state", "Coverage state is not recognized");
  }
  inspectArray(input.gap_codes, "$coverage_input.gap_codes");
  const gapCodes = [...input.gap_codes].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const sortedRecords = sortedCoverageRecords(records);
  const receipt = {
    schema_version: SCHEDULE_COVERAGE_RECEIPT_SCHEMA_VERSION,
    lane: "structured_pc_work",
    source_binding_ref: canonicalClone(binding.binding_ref),
    schedule_ref: canonicalClone(binding.schedule_ref),
    project_ref: canonicalClone(binding.project_ref),
    window_start: input.window_start,
    window_end: input.window_end,
    state: input.state,
    event_count: expectedCoverageCount(input.state, sortedRecords),
    gap_codes: gapCodes,
    applicability_ref: canonicalClone(input.applicability_ref),
    ordered_event_digest: sha256Canonical(
      sortedRecords.map((record) => record.record_digest),
    ),
    metadata_digest: "",
    raw_payload_copied: false,
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  return validateScheduleCoverageReceipt(receipt, sortedRecords, binding);
}

export function validateScheduleCoverageReceipt(value, records, binding) {
  assertExactKeys(value, COVERAGE_FIELDS, "$coverage");
  validateScheduleRevisionCollection(records, binding);
  if (value.schema_version !== SCHEDULE_COVERAGE_RECEIPT_SCHEMA_VERSION) {
    fail("coverage_schema_invalid", "$coverage.schema_version", "Schema version does not match");
  }
  if (value.lane !== "structured_pc_work") {
    fail("coverage_lane_invalid", "$coverage.lane", "External schedule remains in H03");
  }
  validateRef(
    value.source_binding_ref,
    "schedule_source_binding",
    "$coverage.source_binding_ref",
    "schedule_history",
  );
  if (!refsEqual(value.source_binding_ref, binding.binding_ref)) {
    fail(
      "source_binding_ref_mismatch",
      "$coverage.source_binding_ref",
      "Coverage source binding does not match",
    );
  }
  validateRef(
    value.schedule_ref,
    "schedule",
    "$coverage.schedule_ref",
    binding.schedule_owner_ref.owner_surface,
  );
  validateRef(value.project_ref, "project", "$coverage.project_ref");
  if (
    !refsEqual(value.schedule_ref, binding.schedule_ref)
    || !refsEqual(value.project_ref, binding.project_ref)
  ) {
    fail(
      "coverage_scope_mismatch",
      "$coverage",
      "Coverage schedule and project must exactly match the binding",
    );
  }
  validateCanonicalUtc(value.window_start, "$coverage.window_start");
  validateCanonicalUtc(value.window_end, "$coverage.window_end");
  if (Date.parse(value.window_start) >= Date.parse(value.window_end)) {
    fail("coverage_window_invalid", "$coverage", "Coverage window must be half-open");
  }
  if (!SCHEDULE_HISTORY_COVERAGE_STATES.includes(value.state)) {
    fail("coverage_state_invalid", "$coverage.state", "Coverage state is not recognized");
  }
  if (
    value.event_count !== null
    && (!Number.isSafeInteger(value.event_count) || value.event_count < 0)
  ) {
    fail(
      "coverage_event_count_invalid",
      "$coverage.event_count",
      "Event count must be null or a nonnegative safe integer",
    );
  }
  validateGapCodes(value.gap_codes, "$coverage.gap_codes");
  validateNullableRef(
    value.applicability_ref,
    "rule_revision",
    "$coverage.applicability_ref",
  );
  if (
    value.applicability_ref !== null
    && !value.applicability_ref.owner_surface.startsWith("synthetic_")
  ) {
    fail(
      "synthetic_owner_required",
      "$coverage.applicability_ref.owner_surface",
      "Applicability rule must remain synthetic before D25 ratification",
    );
  }
  validateCoverageMatrix(value);

  const sortedRecords = sortedCoverageRecords(records);
  const expectedCount = expectedCoverageCount(value.state, sortedRecords);
  if (value.event_count !== expectedCount) {
    fail(
      "coverage_event_count_mismatch",
      "$coverage.event_count",
      "Event count does not match bound revisions and state",
    );
  }
  if ((value.event_count === null || value.event_count === 0) && records.length !== 0) {
    fail(
      "coverage_events_forbidden",
      "$records",
      "This coverage state cannot bind revision events",
    );
  }
  const start = Date.parse(value.window_start);
  const end = Date.parse(value.window_end);
  for (let index = 0; index < sortedRecords.length; index += 1) {
    const record = sortedRecords[index];
    const knownAt = Date.parse(record.known_at);
    if (knownAt < start || knownAt >= end) {
      fail(
        "coverage_known_at_outside_window",
        `$records[${index}].known_at`,
        "known_at is outside the half-open coverage window",
      );
    }
  }
  const expectedDigest = sha256Canonical(
    sortedRecords.map((record) => record.record_digest),
  );
  if (value.ordered_event_digest !== expectedDigest) {
    fail(
      "ordered_event_digest_mismatch",
      "$coverage.ordered_event_digest",
      "Ordered event digest does not match bound revisions",
    );
  }
  if (value.raw_payload_copied !== false) {
    fail(
      "raw_payload_copied_must_be_false",
      "$coverage.raw_payload_copied",
      "Raw payload copying is forbidden",
    );
  }
  validateDigest(value.metadata_digest, "$coverage.metadata_digest");
  if (value.metadata_digest !== computeMetadataDigest(value)) {
    fail(
      "metadata_digest_mismatch",
      "$coverage.metadata_digest",
      "Coverage metadata digest does not match",
    );
  }
  return value;
}
