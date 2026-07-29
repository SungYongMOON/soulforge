import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export const AI_WORK_RECORD_EVENT_SCHEMA_VERSION =
  "soulforge.ai_work_record_event.v1";

const REQUIRED_FIELDS = Object.freeze([
  "schema_version",
  "event_id",
  "work_id",
  "idempotency_key",
  "event_kind",
  "sequence",
  "previous_event_digest",
  "event_digest",
  "project_ref",
  "task_ref",
  "actor",
  "started_at",
  "occurred_at",
  "recorded_at",
  "status",
  "purpose",
  "scope",
  "source_refs",
  "result_refs",
  "evidence_refs",
  "stop_conditions",
  "uncertainties",
  "metadata_boundary",
  "official_completion",
  "whole_chat_capture",
  "screen_capture",
  "keyboard_capture",
  "os_activity_capture",
]);
const OPTIONAL_FIELDS = Object.freeze(["closeout_kind", "correction_ref"]);
const ACTOR_FIELDS = Object.freeze([
  "node_id",
  "agent_id",
  "tool",
  "tool_version",
]);
const METADATA_REF_FIELDS = Object.freeze([
  "ref_kind",
  "ref_id",
  "path_ref",
  "digest",
  "state",
  "exit_code",
  "attempt",
  "occurred_at",
  "mapping_field",
  "mapping_alias",
]);
const CORRECTION_REF_FIELDS = Object.freeze([
  "event_id",
  "event_digest",
  "reason",
]);
const EVENT_KINDS = new Set([
  "start",
  "checkpoint",
  "closeout_pending",
  "closeout",
  "correction",
]);
const EVENT_STATUS = Object.freeze({
  start: "active",
  checkpoint: "active",
  closeout_pending: "closeout_pending",
  closeout: "closed",
  correction: "closed",
});
const CLOSEOUT_KINDS = new Set([
  "completed_candidate",
  "blocked",
  "handoff",
  "abandoned",
]);
const REF_KINDS = new Set([
  "source",
  "mapping",
  "tool_receipt",
  "command_receipt",
  "file",
  "git",
  "test",
  "build",
  "outbox",
  "packet",
  "result",
  "evidence",
]);
const RESULT_REF_KINDS = new Set(["result", "packet"]);
const EVIDENCE_REF_KINDS = new Set([
  "evidence",
  "tool_receipt",
  "command_receipt",
  "file",
  "git",
  "test",
  "build",
  "packet",
]);
const CORRECTION_SOURCE_REF_KINDS = new Set(["source", "mapping"]);
const MAPPING_FIELDS = new Set([
  "event_id",
  "work_id",
  "idempotency_key",
  "project_ref",
  "task_ref",
]);
const NATIVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,119}$/u;
const OPAQUE_REF_PATTERN = /^[^\r\n\u0000-\u001f\u007f]{1,240}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const DIGEST_ONLY_SOURCE_ID_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/iu;
const UTC_MILLISECONDS_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RELATIVE_PATH_PATTERN =
  /^[^:/\\%\r\n\u0000-\u001f\u007f]+(?:\/[^:/\\%\r\n\u0000-\u001f\u007f]+)*$/u;
const FORBIDDEN_FIELD_PATTERN =
  /^(?:raw_(?:payload|body|content|transcript|chat|message)|transcript|conversation_body|message_body|attachment_body|body_(?:text|html)|provider_payload|password|cookie|secret|token|credential|api[-_]?key|authorization|bearer|session[-_]?token|(?:access|refresh|auth)[-_]?token|client[-_]?secret|private[-_]?key|session[-_]?cookie)$/iu;
const FORBIDDEN_CONTENT_PATTERN =
  /(?:whole[ _-]+(?:conversation|task[ _-]*chat)|raw[ _-]+(?:conversation|task[ _-]*chat|transcript|payload|body)|screen[ _-]*(?:capture|recording)|keyboard[ _-]*(?:capture|logging)|keystroke[ _-]*(?:capture|logging)|(?:broad[ _-]+)?os[ _-]*(?:activity|monitoring|surveillance)|^(?:user|assistant)\s*:)/iu;
const PRIVATE_KEY_MARKER_PATTERN = /private[ _-]+key/iu;
const SECRET_VALUE_PATTERN =
  /(?:(?:^|[^A-Za-z0-9])(?:password|cookie|secret|token|credential|api[-_]?key|authorization|bearer|session[-_]?token|(?:access|refresh|auth)[-_]?token|client[-_]?secret|private[ _-]?key|session[-_]?cookie)\s*[:=]\s*\S+|\bBearer\s+\S+|\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}|\bghp_|\bxoxb-|\bAKIA|-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----)/iu;

export class AiWorkRecordEventError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "AiWorkRecordEventError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new AiWorkRecordEventError(code, path, message);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function defineEnumerableDataProperty(target, key, value) {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
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

function inspectPlainObject(value, path) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string") {
      fail("symbol_key_not_allowed", path, "Symbol keys are not allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(
        "data_property_required",
        `${path}.${key}`,
        "Only enumerable data properties are allowed",
      );
    }
  }
  return keys;
}

function assertExactKeys(value, required, optional, path) {
  const keys = inspectPlainObject(value, path);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      fail("missing_field", `${path}.${key}`, "Required field is missing");
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail("extra_field", `${path}.${key}`, "Unknown field is not allowed");
    }
    if (FORBIDDEN_FIELD_PATTERN.test(key)) {
      fail("forbidden_capture_field", `${path}.${key}`, "Raw or secret field is forbidden");
    }
  }
}

function scanPolicyValue(value, path, ancestors = new Set()) {
  if (typeof value === "string") {
    validateStringBoundary(value, path);
    return;
  }
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
  ) {
    return;
  }
  if (Array.isArray(value)) {
    inspectDenseArray(value, path);
    if (ancestors.has(value)) fail("policy_cycle", path, "Cycle detected");
    ancestors.add(value);
    try {
      value.forEach((entry, index) => (
        scanPolicyValue(entry, `${path}[${index}]`, ancestors)
      ));
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  if (value !== null && typeof value === "object") {
    const keys = inspectPlainObject(value, path);
    if (ancestors.has(value)) fail("policy_cycle", path, "Cycle detected");
    if (keys.includes("role") && keys.includes("content")) {
      fail(
        "chat_shape_forbidden",
        path,
        "Structured role/content chat shape is forbidden",
      );
    }
    ancestors.add(value);
    try {
      for (const key of keys) {
        if (FORBIDDEN_FIELD_PATTERN.test(key)) {
          fail(
            "forbidden_capture_field",
            `${path}.${key}`,
            "Raw or secret field is forbidden",
          );
        }
        scanPolicyValue(value[key], `${path}.${key}`, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  fail("policy_value_invalid", path, "Unsupported policy value");
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
      fail("array_extra_property", `${path}.${key}`, "Dense indices only");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(
        "data_property_required",
        `${path}[${key}]`,
        "Only enumerable data properties are allowed",
      );
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_not_allowed", `${path}[${index}]`, "Sparse array");
    }
  }
}

function serializeCanonical(value, path, ancestors) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    validateCanonicalString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      fail("canonical_number_not_safe_integer", path, "Safe integers only");
    }
    if (Object.is(value, -0)) {
      fail("canonical_negative_zero", path, "Negative zero is not allowed");
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    inspectDenseArray(value, path);
    if (ancestors.has(value)) fail("canonical_cycle", path, "Cycle detected");
    ancestors.add(value);
    try {
      return `[${value.map(
        (entry, index) => serializeCanonical(entry, `${path}[${index}]`, ancestors),
      ).join(",")}]`;
    } finally {
      ancestors.delete(value);
    }
  }
  if (value !== null && typeof value === "object") {
    const keys = inspectPlainObject(value, path);
    if (ancestors.has(value)) fail("canonical_cycle", path, "Cycle detected");
    ancestors.add(value);
    try {
      for (const key of keys) validateCanonicalString(key, `${path}.${key}`);
      const fields = [...keys].sort(utf8Compare).map((key) => (
        `${JSON.stringify(key)}:${serializeCanonical(
          value[key],
          `${path}.${key}`,
          ancestors,
        )}`
      ));
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(value);
    }
  }
  fail("canonical_unsupported_value", path, "Unsupported JSON value");
}

function validateCanonicalString(value, path) {
  if (!isWellFormedUnicode(value)) {
    fail("string_not_well_formed", path, "Unpaired UTF-16 surrogate");
  }
  if (value.normalize("NFC") !== value) {
    fail("string_not_nfc", path, "String must be NFC-normalized");
  }
}

export function canonicalJson(value) {
  return serializeCanonical(value, "$", new Set());
}

export function computeAiWorkRecordEventDigest(event) {
  const keys = inspectPlainObject(event, "$event");
  const payload = {};
  for (const key of keys) {
    if (key !== "event_digest") {
      defineEnumerableDataProperty(payload, key, event[key]);
    }
  }
  return `sha256:${createHash("sha256").update(
    Buffer.from(canonicalJson(payload), "utf8"),
  ).digest("hex")}`;
}

function validateNativeId(value, path) {
  if (typeof value !== "string" || !NATIVE_ID_PATTERN.test(value)) {
    fail(
      "native_id_required",
      path,
      "Expected 2..120 characters in the common A1 wire intersection",
    );
  }
  validateStringBoundary(value, path);
}

function validateOpaqueRef(value, path) {
  if (typeof value !== "string" || !OPAQUE_REF_PATTERN.test(value)) {
    fail("opaque_ref_required", path, "Expected a bounded opaque reference");
  }
  validateStringBoundary(value, path);
}

function validateStringBoundary(value, path) {
  validateCanonicalString(value, path);
  if (FORBIDDEN_CONTENT_PATTERN.test(value)) {
    fail("forbidden_capture_content", path, "Raw or surveillance content is forbidden");
  }
  if (
    PRIVATE_KEY_MARKER_PATTERN.test(value)
    || SECRET_VALUE_PATTERN.test(value)
  ) {
    fail("secret_like_content", path, "Secret-like content is forbidden");
  }
}

function validateBoundedText(value, path, maximum) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\r\n]/u.test(value)
  ) {
    fail("bounded_text_required", path, `Expected 1..${maximum} characters`);
  }
  validateStringBoundary(value, path);
}

function validateTimestamp(value, path) {
  if (
    typeof value !== "string"
    || !UTC_MILLISECONDS_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    fail("timestamp_invalid", path, "Expected canonical UTC milliseconds");
  }
  return Date.parse(value);
}

function validateDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256:<64 lowercase hex>");
  }
}

function validateMetadataRef(value, path) {
  assertExactKeys(value, ["ref_kind", "ref_id"], METADATA_REF_FIELDS.slice(2), path);
  if (!REF_KINDS.has(value.ref_kind)) {
    fail("ref_kind_invalid", `${path}.ref_kind`, "Unknown metadata ref kind");
  }
  validateOpaqueRef(value.ref_id, `${path}.ref_id`);
  if (Object.hasOwn(value, "path_ref")) {
    validateBoundedText(value.path_ref, `${path}.path_ref`, 512);
    const segments = value.path_ref.split("/");
    if (
      !RELATIVE_PATH_PATTERN.test(value.path_ref)
      || value.path_ref.startsWith("/")
      || value.path_ref.includes("//")
      || value.path_ref.includes("\\")
      || value.path_ref.includes("%")
      || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value.path_ref)
      || segments.some((segment) => segment === "." || segment === "..")
    ) {
      fail(
        "path_ref_not_normalized_relative",
        `${path}.path_ref`,
        "Normalized relative metadata pointer required",
      );
    }
  }
  if (Object.hasOwn(value, "digest")) validateDigest(value.digest, `${path}.digest`);
  if (Object.hasOwn(value, "state")) validateNativeId(value.state, `${path}.state`);
  if (
    Object.hasOwn(value, "exit_code")
    && (!Number.isSafeInteger(value.exit_code)
      || value.exit_code < -2147483648
      || value.exit_code > 2147483647)
  ) {
    fail("exit_code_invalid", `${path}.exit_code`, "Expected signed 32-bit integer");
  }
  if (
    Object.hasOwn(value, "attempt")
    && (!Number.isSafeInteger(value.attempt) || value.attempt < 0)
  ) {
    fail("attempt_invalid", `${path}.attempt`, "Expected non-negative integer");
  }
  if (Object.hasOwn(value, "occurred_at")) {
    validateTimestamp(value.occurred_at, `${path}.occurred_at`);
  }
  if (value.ref_kind === "mapping") {
    if (DIGEST_ONLY_SOURCE_ID_PATTERN.test(value.ref_id)) {
      fail(
        "mapping_digest_only_source_forbidden",
        `${path}.ref_id`,
        "Mapping ref_id must be the exact source ID, not a digest-only token",
      );
    }
    if (
      !Object.hasOwn(value, "mapping_field")
      || !Object.hasOwn(value, "mapping_alias")
    ) {
      fail(
        "mapping_fields_required",
        path,
        "Mapping refs require mapping_field and mapping_alias",
      );
    }
    if (!MAPPING_FIELDS.has(value.mapping_field)) {
      fail("mapping_field_invalid", `${path}.mapping_field`, "Unknown mapped field");
    }
    validateNativeId(value.mapping_alias, `${path}.mapping_alias`);
  } else if (
    Object.hasOwn(value, "mapping_field")
    || Object.hasOwn(value, "mapping_alias")
  ) {
    fail(
      "mapping_fields_forbidden",
      path,
      "Only mapping refs use mapping fields",
    );
  }
}

function validateMetadataRefList(value, path) {
  inspectDenseArray(value, path);
  if (value.length > 64) fail("ref_list_too_long", path, "At most 64 refs");
  const seen = new Set();
  const sourceByAlias = new Map();
  const aliasBySource = new Map();
  value.forEach((entry, index) => {
    validateMetadataRef(entry, `${path}[${index}]`);
    const canonical = canonicalJson(entry);
    if (seen.has(canonical)) {
      fail("duplicate_ref", `${path}[${index}]`, "Duplicate metadata ref");
    }
    seen.add(canonical);
    if (entry.ref_kind === "mapping") {
      const aliasKey = `${entry.mapping_field}\u0000${entry.mapping_alias}`;
      const sourceKey = `${entry.mapping_field}\u0000${entry.ref_id}`;
      const priorSource = sourceByAlias.get(aliasKey);
      if (priorSource !== undefined && priorSource !== entry.ref_id) {
        fail(
          "mapping_alias_conflict",
          `${path}[${index}]`,
          "One mapped field alias cannot identify multiple source IDs",
        );
      }
      const priorAlias = aliasBySource.get(sourceKey);
      if (priorAlias !== undefined && priorAlias !== entry.mapping_alias) {
        fail(
          "mapping_source_conflict",
          `${path}[${index}]`,
          "One source ID cannot map to multiple aliases for the same field",
        );
      }
      sourceByAlias.set(aliasKey, entry.ref_id);
      aliasBySource.set(sourceKey, entry.mapping_alias);
    }
  });
}

function validateNoteList(value, path) {
  inspectDenseArray(value, path);
  if (value.length > 32) fail("note_list_too_long", path, "At most 32 notes");
  const seen = new Set();
  value.forEach((entry, index) => {
    validateBoundedText(entry, `${path}[${index}]`, 160);
    if (seen.has(entry)) {
      fail("duplicate_note", `${path}[${index}]`, "Duplicate note");
    }
    seen.add(entry);
  });
}

function validateCorrectionRef(value, path) {
  assertExactKeys(value, CORRECTION_REF_FIELDS, [], path);
  validateNativeId(value.event_id, `${path}.event_id`);
  validateDigest(value.event_digest, `${path}.event_digest`);
  validateBoundedText(value.reason, `${path}.reason`, 160);
}

export function validateAiWorkRecordIdAliasMapping(
  sourceId,
  mappingField,
  alias,
  sourceRefs,
) {
  validateOpaqueRef(sourceId, "$mapping.source_id");
  if (DIGEST_ONLY_SOURCE_ID_PATTERN.test(sourceId)) {
    fail(
      "mapping_digest_only_source_forbidden",
      "$mapping.source_id",
      "Digest-only source IDs are unsupported by the v1 exact mapping contract",
    );
  }
  if (!MAPPING_FIELDS.has(mappingField)) {
    fail("mapping_field_invalid", "$mapping.mapping_field", "Unknown mapped field");
  }
  validateNativeId(alias, "$mapping.alias");
  validateMetadataRefList(sourceRefs, "$mapping.source_refs");
  if (sourceId === alias) {
    return {
      mapping_required: false,
      mapping_ref: null,
    };
  }
  const mappingRef = sourceRefs.find((ref) => (
    ref.ref_kind === "mapping"
    && ref.ref_id === sourceId
    && ref.mapping_field === mappingField
    && ref.mapping_alias === alias
  ));
  if (!mappingRef) {
    fail(
      "id_mapping_required",
      "$mapping.source_refs",
      "Changed or out-of-intersection source IDs require an exact reversible mapping ref",
    );
  }
  return {
    mapping_required: true,
    mapping_ref: mappingRef,
  };
}

export function validateAiWorkRecordEvent(event) {
  scanPolicyValue(event, "$event");
  assertExactKeys(event, REQUIRED_FIELDS, OPTIONAL_FIELDS, "$event");
  if (event.schema_version !== AI_WORK_RECORD_EVENT_SCHEMA_VERSION) {
    fail("schema_version_invalid", "$event.schema_version", "Unexpected schema");
  }
  validateNativeId(event.event_id, "$event.event_id");
  validateNativeId(event.work_id, "$event.work_id");
  validateNativeId(event.idempotency_key, "$event.idempotency_key");
  if (!EVENT_KINDS.has(event.event_kind)) {
    fail("event_kind_invalid", "$event.event_kind", "Unexpected event kind");
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
    fail("sequence_invalid", "$event.sequence", "Expected non-negative integer");
  }
  if (event.previous_event_digest !== null) {
    validateDigest(event.previous_event_digest, "$event.previous_event_digest");
  }
  validateDigest(event.event_digest, "$event.event_digest");
  validateNativeId(event.project_ref, "$event.project_ref");
  validateNativeId(event.task_ref, "$event.task_ref");
  assertExactKeys(event.actor, ACTOR_FIELDS, [], "$event.actor");
  for (const key of ACTOR_FIELDS) {
    validateNativeId(event.actor[key], `$event.actor.${key}`);
  }
  const startedAt = validateTimestamp(event.started_at, "$event.started_at");
  const occurredAt = validateTimestamp(event.occurred_at, "$event.occurred_at");
  const recordedAt = validateTimestamp(event.recorded_at, "$event.recorded_at");
  if (occurredAt < startedAt) {
    fail("event_before_start", "$event.occurred_at", "Event precedes work start");
  }
  if (recordedAt < occurredAt) {
    fail("recorded_before_occurrence", "$event.recorded_at", "Record precedes event");
  }
  if (event.status !== EVENT_STATUS[event.event_kind]) {
    fail("status_kind_mismatch", "$event.status", "Status does not match event kind");
  }
  validateBoundedText(event.purpose, "$event.purpose", 160);
  validateBoundedText(event.scope, "$event.scope", 240);
  validateMetadataRefList(event.source_refs, "$event.source_refs");
  validateMetadataRefList(event.result_refs, "$event.result_refs");
  validateMetadataRefList(event.evidence_refs, "$event.evidence_refs");
  validateNoteList(event.stop_conditions, "$event.stop_conditions");
  validateNoteList(event.uncertainties, "$event.uncertainties");
  for (const [listName, refs] of [
    ["result_refs", event.result_refs],
    ["evidence_refs", event.evidence_refs],
  ]) {
    const mappingIndex = refs.findIndex((ref) => ref.ref_kind === "mapping");
    if (mappingIndex !== -1) {
      fail(
        "mapping_ref_wrong_list",
        `$event.${listName}[${mappingIndex}]`,
        "ID mapping refs belong in source_refs",
      );
    }
  }
  for (const [index, ref] of event.source_refs.entries()) {
    if (
      ref.ref_kind === "mapping"
      && ref.mapping_alias !== event[ref.mapping_field]
    ) {
      fail(
        "mapping_alias_mismatch",
        `$event.source_refs[${index}].mapping_alias`,
        "Mapping alias must equal the bound A1 field",
      );
    }
  }
  if (event.metadata_boundary !== "metadata_only") {
    fail("metadata_boundary_invalid", "$event.metadata_boundary", "metadata_only required");
  }
  for (const key of [
    "official_completion",
    "whole_chat_capture",
    "screen_capture",
    "keyboard_capture",
    "os_activity_capture",
  ]) {
    if (event[key] !== false) {
      fail("authority_or_capture_forbidden", `$event.${key}`, "Must remain false");
    }
  }
  if (event.event_kind === "start") {
    if (event.sequence !== 0 || event.previous_event_digest !== null) {
      fail("start_chain_invalid", "$event.sequence", "Start must be sequence 0 root");
    }
  } else if (event.sequence < 1 || event.previous_event_digest === null) {
    fail("non_start_chain_invalid", "$event.sequence", "Non-start must extend a chain");
  }
  if (event.event_kind === "closeout") {
    if (!Object.hasOwn(event, "closeout_kind")) {
      fail(
        "closeout_kind_required",
        "$event.closeout_kind",
        "Closeout outcome is required",
      );
    }
    if (!CLOSEOUT_KINDS.has(event.closeout_kind)) {
      fail(
        "closeout_kind_invalid",
        "$event.closeout_kind",
        "Unknown closeout outcome",
      );
    }
    if (!event.result_refs.some((ref) => RESULT_REF_KINDS.has(ref.ref_kind))) {
      fail(
        "terminal_result_ref_required",
        "$event.result_refs",
        "Closeout requires a result or packet ref",
      );
    }
    if (!event.evidence_refs.some((ref) => EVIDENCE_REF_KINDS.has(ref.ref_kind))) {
      fail(
        "terminal_evidence_ref_required",
        "$event.evidence_refs",
        "Closeout requires an evidence-capable ref",
      );
    }
    if (
      event.closeout_kind === "blocked"
      && event.stop_conditions.length === 0
    ) {
      fail(
        "blocked_stop_condition_required",
        "$event.stop_conditions",
        "Blocked closeout requires a stop condition",
      );
    }
    if (
      event.closeout_kind === "handoff"
      && !event.result_refs.some((ref) => ref.ref_kind === "packet")
    ) {
      fail(
        "handoff_packet_required",
        "$event.result_refs",
        "Handoff requires a packet result",
      );
    }
    if (
      event.closeout_kind === "abandoned"
      && event.stop_conditions.length === 0
      && event.uncertainties.length === 0
    ) {
      fail(
        "abandoned_reason_required",
        "$event",
        "Abandoned closeout requires a stop condition or uncertainty",
      );
    }
  } else if (Object.hasOwn(event, "closeout_kind")) {
    fail(
      "closeout_kind_forbidden",
      "$event.closeout_kind",
      "Only closeout events use closeout_kind",
    );
  }
  if (event.event_kind === "correction") {
    if (!Object.hasOwn(event, "correction_ref")) {
      fail("correction_ref_required", "$event.correction_ref", "Correction target required");
    }
    validateCorrectionRef(event.correction_ref, "$event.correction_ref");
    if (
      event.correction_ref.event_id === event.event_id
      || event.correction_ref.event_digest === event.event_digest
    ) {
      fail("correction_self_reference", "$event.correction_ref", "Self reference forbidden");
    }
    if (
      event.result_refs.length !== 0
      || event.evidence_refs.length !== 0
      || event.stop_conditions.length !== 0
      || event.uncertainties.length !== 0
    ) {
      fail(
        "correction_projection_forbidden",
        "$event",
        "Correction is audit-only and cannot carry projection fields",
      );
    }
    const disallowedSourceIndex = event.source_refs.findIndex(
      (ref) => !CORRECTION_SOURCE_REF_KINDS.has(ref.ref_kind),
    );
    if (disallowedSourceIndex !== -1) {
      fail(
        "correction_source_ref_kind_forbidden",
        `$event.source_refs[${disallowedSourceIndex}].ref_kind`,
        "Correction source refs are limited to source or mapping annotations",
      );
    }
  } else if (Object.hasOwn(event, "correction_ref")) {
    fail("correction_ref_forbidden", "$event.correction_ref", "Only corrections use this field");
  }
  const expectedDigest = computeAiWorkRecordEventDigest(event);
  if (event.event_digest !== expectedDigest) {
    fail("event_digest_mismatch", "$event.event_digest", "Canonical digest mismatch");
  }
  return event;
}

export function sealAiWorkRecordEvent(event) {
  inspectPlainObject(event, "$event");
  const sealed = { ...event };
  delete sealed.event_digest;
  sealed.event_digest = computeAiWorkRecordEventDigest(sealed);
  return validateAiWorkRecordEvent(sealed);
}

function hold(noOpCount, reasonCode, atIndex, detail = null) {
  return {
    decision: "HOLD",
    reason_code: reasonCode,
    at_index: atIndex,
    accepted_count: 0,
    no_op_count: noOpCount,
    persistence: "forbidden",
    acknowledgement: "hold",
    terminal_projection: null,
    events: [],
    chain_event_count: 0,
    detail,
  };
}

function copyTerminalProjection(event) {
  return {
    closeout_event_id: event.event_id,
    closeout_event_digest: event.event_digest,
    closeout_kind: event.closeout_kind,
    status: event.status,
    result_refs: event.result_refs.map((ref) => ({ ...ref })),
    evidence_refs: event.evidence_refs.map((ref) => ({ ...ref })),
    stop_conditions: [...event.stop_conditions],
    uncertainties: [...event.uncertainties],
    official_completion: false,
  };
}

function registerChainMappings(event, sourceByAlias, aliasBySource) {
  for (const [listName, refs] of [
    ["source_refs", event.source_refs],
    ["result_refs", event.result_refs],
    ["evidence_refs", event.evidence_refs],
  ]) {
    for (const [index, ref] of refs.entries()) {
      if (ref.ref_kind !== "mapping") continue;
      const aliasKey = `${ref.mapping_field}\u0000${ref.mapping_alias}`;
      const sourceKey = `${ref.mapping_field}\u0000${ref.ref_id}`;
      const priorSource = sourceByAlias.get(aliasKey);
      if (priorSource !== undefined && priorSource !== ref.ref_id) {
        return {
          code: "mapping_alias_conflict",
          path: `$event.${listName}[${index}]`,
        };
      }
      const priorAlias = aliasBySource.get(sourceKey);
      if (priorAlias !== undefined && priorAlias !== ref.mapping_alias) {
        return {
          code: "mapping_source_conflict",
          path: `$event.${listName}[${index}]`,
        };
      }
      sourceByAlias.set(aliasKey, ref.ref_id);
      aliasBySource.set(sourceKey, ref.mapping_alias);
    }
  }
  return null;
}

export function reduceAiWorkRecordEvents(input, priorInput = []) {
  inspectDenseArray(input, "$events");
  inspectDenseArray(priorInput, "$prior_events");
  const chainEvents = [];
  const acceptedEvents = [];
  const byEventId = new Map();
  const byIdempotencyKey = new Map();
  const sourceByAlias = new Map();
  const aliasBySource = new Map();
  let noOpCount = 0;
  let lifecycle = "empty";
  let terminalProjection = null;
  if (input.length === 0) {
    return hold(noOpCount, "batch_event_required", 0);
  }
  const records = [
    ...priorInput.map((event, index) => ({ event, index, prior: true })),
    ...input.map((event, index) => ({ event, index, prior: false })),
  ];
  for (const record of records) {
    const { event, index, prior } = record;
    try {
      validateAiWorkRecordEvent(event);
    } catch (error) {
      if (error instanceof AiWorkRecordEventError) {
        return hold(
          noOpCount,
          prior ? "prior_history_invalid" : error.code,
          prior ? null : index,
          error.message,
        );
      }
      throw error;
    }
    const mappingConflict = registerChainMappings(
      event,
      sourceByAlias,
      aliasBySource,
    );
    if (mappingConflict) {
      return hold(
        noOpCount,
        mappingConflict.code,
        prior ? null : index,
        `${mappingConflict.code} at ${mappingConflict.path}`,
      );
    }
    const replay = byEventId.get(event.event_id);
    if (replay) {
      if (replay.event_digest !== event.event_digest) {
        return hold(noOpCount, "event_id_conflict", prior ? null : index);
      }
      if (!prior) noOpCount += 1;
      continue;
    }
    if (byIdempotencyKey.has(event.idempotency_key)) {
      return hold(
        noOpCount,
        "idempotency_key_conflict",
        prior ? null : index,
      );
    }
    if (chainEvents.length === 0) {
      if (event.event_kind !== "start") {
        return hold(noOpCount, "start_event_required", prior ? null : index);
      }
    } else {
      const previous = chainEvents.at(-1);
      if (
        event.work_id !== previous.work_id
        || event.project_ref !== previous.project_ref
        || event.started_at !== previous.started_at
      ) {
        return hold(noOpCount, "work_identity_conflict", prior ? null : index);
      }
      if (event.sequence !== previous.sequence + 1) {
        return hold(
          noOpCount,
          "sequence_gap_or_conflict",
          prior ? null : index,
        );
      }
      if (event.previous_event_digest !== previous.event_digest) {
        return hold(
          noOpCount,
          "previous_event_digest_mismatch",
          prior ? null : index,
        );
      }
      if (
        event.occurred_at < previous.occurred_at
        || event.recorded_at < previous.recorded_at
      ) {
        return hold(noOpCount, "event_time_regression", prior ? null : index);
      }
      if (
        previous.task_ref !== "pending"
        && event.task_ref !== previous.task_ref
      ) {
        return hold(noOpCount, "task_ref_conflict", prior ? null : index);
      }
    }

    if (lifecycle === "empty") {
      if (event.event_kind !== "start") {
        return hold(noOpCount, "start_event_required", prior ? null : index);
      }
      lifecycle = "open";
    } else if (lifecycle === "open") {
      if (event.event_kind === "checkpoint") {
        // Remain open.
      } else if (event.event_kind === "closeout_pending") {
        lifecycle = "pending";
      } else if (event.event_kind === "closeout") {
        return hold(
          noOpCount,
          "closeout_pending_required",
          prior ? null : index,
        );
      } else if (event.event_kind === "correction") {
        return hold(
          noOpCount,
          "correction_before_closeout",
          prior ? null : index,
        );
      } else {
        return hold(noOpCount, "duplicate_start", prior ? null : index);
      }
    } else if (lifecycle === "pending") {
      if (event.event_kind === "closeout") {
        lifecycle = "closed";
      } else if (event.event_kind === "checkpoint") {
        return hold(
          noOpCount,
          "checkpoint_after_closeout_pending",
          prior ? null : index,
        );
      } else if (event.event_kind === "closeout_pending") {
        return hold(
          noOpCount,
          "duplicate_closeout_pending",
          prior ? null : index,
        );
      } else if (event.event_kind === "correction") {
        return hold(
          noOpCount,
          "correction_before_closeout",
          prior ? null : index,
        );
      } else {
        return hold(
          noOpCount,
          "event_after_closeout_pending",
          prior ? null : index,
        );
      }
    } else if (event.event_kind !== "correction") {
      return hold(noOpCount, "event_after_closeout", prior ? null : index);
    }

    if (event.event_kind === "correction") {
      const corrected = byEventId.get(event.correction_ref.event_id);
      if (!corrected) {
        return hold(noOpCount, "correction_target_missing", prior ? null : index);
      }
      if (corrected.event_digest !== event.correction_ref.event_digest) {
        return hold(
          noOpCount,
          "correction_target_digest_mismatch",
          prior ? null : index,
        );
      }
      if (corrected.work_id !== event.work_id) {
        return hold(
          noOpCount,
          "correction_target_work_mismatch",
          prior ? null : index,
        );
      }
    }
    chainEvents.push(event);
    if (!prior) acceptedEvents.push(event);
    byEventId.set(event.event_id, event);
    byIdempotencyKey.set(event.idempotency_key, event);
    if (event.event_kind === "closeout") {
      terminalProjection = copyTerminalProjection(event);
    }
  }
  const acceptedCount = acceptedEvents.length;
  if (acceptedCount === 0 && noOpCount !== input.length) {
    return hold(noOpCount, "batch_not_all_replays", null);
  }
  return {
    decision: acceptedCount > 0 ? "accept" : "no_op",
    reason_code: null,
    at_index: null,
    accepted_count: acceptedCount,
    no_op_count: noOpCount,
    persistence: acceptedCount > 0 ? "append_accepted" : "none",
    acknowledgement: acceptedCount > 0 ? "ack_after_persist" : "ack_no_op",
    terminal_projection: terminalProjection,
    events: [...acceptedEvents],
    chain_event_count: chainEvents.length,
    detail: null,
  };
}
