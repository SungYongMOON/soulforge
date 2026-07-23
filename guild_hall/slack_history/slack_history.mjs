import { Buffer } from "node:buffer";

import {
  PROJECT_HISTORY_COVERAGE_STATES,
  canonicalJson,
  sha256Canonical,
} from "../shared/project_history_envelope.mjs";

export const SLACK_HISTORY_BINDING_SCHEMA_VERSION = "soulforge.slack_history.binding.v1";
export const SLACK_HISTORY_CURSOR_SCHEMA_VERSION = "soulforge.slack_history.cursor.v1";
export const SLACK_HISTORY_COVERAGE_SCHEMA_VERSION = "soulforge.slack_history.coverage.v1";

export const SLACK_HISTORY_COVERAGE_STATES = PROJECT_HISTORY_COVERAGE_STATES;
export const SLACK_HISTORY_REVISION_KINDS = Object.freeze([
  "message",
  "reply",
  "edit",
  "delete",
  "tombstone",
]);
export const SLACK_HISTORY_CHANNEL_KINDS = Object.freeze([
  "project",
  "dm",
  "general",
  "common",
  "unmapped",
]);
export const SLACK_HISTORY_EXCEPTION_KINDS = Object.freeze([
  "dm",
  "general",
  "common",
  "archived",
  "slack_connect",
]);

const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "binding_id",
  "binding_origin",
  "owner_approval_ref",
  "workspace_id",
  "channel_id",
  "project_code",
  "effective_from",
  "effective_to",
  "allowed_exceptions",
]);
const CHANNEL_FIELDS = Object.freeze([
  "workspace_id",
  "channel_id",
  "channel_name",
  "channel_kind",
  "joined",
  "allowlisted",
  "archived",
  "slack_connect",
  "explicit_rule_ref",
]);
const ATTACHMENT_FIELDS = Object.freeze([
  "file_id",
  "pointer_ref",
  "content_sha256",
  "size_bytes",
]);
const ACTOR_FIELDS = Object.freeze(["slack_user_id", "erp_account_ref"]);
const REVISION_INPUT_FIELDS = Object.freeze([
  "revision_kind",
  "workspace_id",
  "channel_id",
  "message_ts",
  "thread_ts",
  "revision_ts",
  "actor",
  "source_metadata_digest",
  "attachment_pointers",
  "supersedes_revision_ref",
]);
const REVISION_FIELDS = Object.freeze([
  ...REVISION_INPUT_FIELDS,
  "message_ref",
  "revision_ref",
]);
const DELIVERY_FIELDS = Object.freeze([
  "event_id",
  "retry_num",
  "retry_reason",
  "received_at",
  "revision",
]);
const DELIVERY_ATTEMPT_EVIDENCE_FIELDS = Object.freeze([
  "retry_num",
  "retry_reason",
  "received_at",
]);
const DELIVERY_EVIDENCE_FIELDS = Object.freeze([
  "event_id",
  "revision_ref",
  "attempts",
]);
const CURSOR_FIELDS = Object.freeze([
  "schema_version",
  "workspace_id",
  "channel_id",
  "binding_id",
  "window_start",
  "window_end",
  "sequence",
  "provider_cursor_digest",
  "accepted_pages",
  "delivery_evidence",
  "generation_digest",
]);
const ACCEPTED_PAGE_FIELDS = Object.freeze(["page_id", "page_digest"]);
const PAGE_FIELDS = Object.freeze([
  "page_id",
  "previous_cursor_digest",
  "next_cursor_digest",
  "deliveries",
]);
const COVERAGE_INPUT_FIELDS = Object.freeze([
  "workspace_id",
  "channel_id",
  "binding_id",
  "project_code",
  "window_start",
  "window_end",
  "state",
  "event_count",
  "gap_codes",
  "applicability_ref",
  "revision_refs",
]);
const COVERAGE_FIELDS = Object.freeze([
  "schema_version",
  ...COVERAGE_INPUT_FIELDS,
  "ordered_revision_digest",
  "metadata_digest",
  "raw_payload_copied",
]);

const SLACK_CONTAINER_ID_PATTERN = /^[A-Z][A-Z0-9]{2,31}$/u;
const SLACK_USER_ID_PATTERN = /^[UW][A-Z0-9]{2,31}$/u;
const SLACK_TIMESTAMP_PATTERN = /^\d{10,16}\.\d{6}$/u;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PROJECT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/u;
const GAP_CODE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export class SlackHistoryError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "SlackHistoryError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new SlackHistoryError(code, path, message);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function inspectRecord(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Custom and null prototypes are not allowed");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail("symbol_key_not_allowed", path, "Symbol keys are not allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}.${key}`, "Only enumerable data properties are allowed");
    }
  }
  return value;
}

function assertExactKeys(value, fields, path) {
  inspectRecord(value, path);
  const expected = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      fail("missing_field", `${path}.${field}`, "Required field is missing");
    }
  }
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) {
      fail("extra_field", `${path}.${field}`, "Unknown field is not allowed");
    }
  }
}

function inspectDenseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain array");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_not_allowed", `${path}[${index}]`, "Sparse arrays are not allowed");
    }
  }
  return value;
}

function validateBoolean(value, path) {
  if (typeof value !== "boolean") fail("boolean_required", path, "Expected a boolean");
  return value;
}

function validateSafeRef(value, path, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)) {
    fail("safe_ref_required", path, "Expected an opaque logical reference");
  }
  if (/^(?:https?|ftp|file|data):/iu.test(value)
    || value.includes("/")
    || value.includes("\\")
    || /^[A-Za-z]:/u.test(value)) {
    fail("locator_not_allowed", path, "Paths and locators are not allowed");
  }
  return value;
}

function validateContainerId(value, path) {
  if (typeof value !== "string" || !SLACK_CONTAINER_ID_PATTERN.test(value)) {
    fail("slack_container_id_invalid", path, "Expected a stable Slack workspace or channel ID");
  }
  return value;
}

function validateSlackUserId(value, path) {
  if (typeof value !== "string" || !SLACK_USER_ID_PATTERN.test(value)) {
    fail("slack_user_id_invalid", path, "Expected a stable Slack user ID");
  }
  return value;
}

function validateSlackTimestamp(value, path) {
  if (typeof value !== "string" || !SLACK_TIMESTAMP_PATTERN.test(value)) {
    fail("slack_timestamp_invalid", path, "Expected a Slack timestamp with six fractional digits");
  }
  return value;
}

function validateUtc(value, path) {
  if (typeof value !== "string" || !UTC_MILLISECONDS_PATTERN.test(value)) {
    fail("timestamp_invalid", path, "Expected canonical UTC with milliseconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("timestamp_invalid", path, "Timestamp is not a real canonical UTC instant");
  }
  return value;
}

function validateDigest(value, path, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function validateProjectCode(value, path) {
  if (typeof value !== "string" || !PROJECT_CODE_PATTERN.test(value)) {
    fail("project_code_invalid", path, "Expected an explicit project code");
  }
  return value;
}

function validateNullableInteger(value, path) {
  if (value === null) return value;
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("nonnegative_integer_required", path, "Expected null or a nonnegative safe integer");
  }
  return value;
}

function canonicalUniqueStrings(values, path, validator) {
  inspectDenseArray(values, path);
  const copy = values.map((value, index) => validator(value, `${path}[${index}]`));
  if (new Set(copy).size !== copy.length) {
    fail("duplicate_value", path, "Values must be unique");
  }
  return copy.sort(utf8Compare);
}

function refsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function validateSlackBinding(value) {
  assertExactKeys(value, BINDING_FIELDS, "$binding");
  if (value.schema_version !== SLACK_HISTORY_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_version_invalid", "$binding.schema_version", "Schema version does not match");
  }
  validateSafeRef(value.binding_id, "$binding.binding_id");
  if (!["synthetic", "private"].includes(value.binding_origin)) {
    fail("binding_origin_invalid", "$binding.binding_origin", "Expected synthetic or private");
  }
  validateSafeRef(value.owner_approval_ref, "$binding.owner_approval_ref");
  validateContainerId(value.workspace_id, "$binding.workspace_id");
  validateContainerId(value.channel_id, "$binding.channel_id");
  validateProjectCode(value.project_code, "$binding.project_code");
  validateUtc(value.effective_from, "$binding.effective_from");
  if (value.effective_to !== null) validateUtc(value.effective_to, "$binding.effective_to");
  if (value.effective_to !== null
    && Date.parse(value.effective_from) >= Date.parse(value.effective_to)) {
    fail("binding_window_invalid", "$binding", "effective_from must precede effective_to");
  }
  const exceptions = canonicalUniqueStrings(
    value.allowed_exceptions,
    "$binding.allowed_exceptions",
    (entry, path) => {
      if (!SLACK_HISTORY_EXCEPTION_KINDS.includes(entry)) {
        fail("binding_exception_invalid", path, "Exception kind is not recognized");
      }
      return entry;
    },
  );
  if (!refsEqual(exceptions, value.allowed_exceptions)) {
    fail("binding_exceptions_not_canonical", "$binding.allowed_exceptions", "Exceptions must use canonical order");
  }
  return value;
}

export function validateSlackChannelFacts(value) {
  assertExactKeys(value, CHANNEL_FIELDS, "$channel");
  validateContainerId(value.workspace_id, "$channel.workspace_id");
  validateContainerId(value.channel_id, "$channel.channel_id");
  if (typeof value.channel_name !== "string" || !SAFE_NAME_PATTERN.test(value.channel_name)) {
    fail("channel_name_invalid", "$channel.channel_name", "Channel name is display metadata only");
  }
  if (!SLACK_HISTORY_CHANNEL_KINDS.includes(value.channel_kind)) {
    fail("channel_kind_invalid", "$channel.channel_kind", "Channel kind is not recognized");
  }
  validateBoolean(value.joined, "$channel.joined");
  validateBoolean(value.allowlisted, "$channel.allowlisted");
  validateBoolean(value.archived, "$channel.archived");
  validateBoolean(value.slack_connect, "$channel.slack_connect");
  validateSafeRef(value.explicit_rule_ref, "$channel.explicit_rule_ref", true);
  return value;
}

export function resolveSlackProjectScope({ binding, channel, occurred_at: occurredAt }) {
  validateSlackBinding(binding);
  validateSlackChannelFacts(channel);
  validateUtc(occurredAt, "$occurred_at");

  const holdReasons = [];
  if (binding.workspace_id !== channel.workspace_id || binding.channel_id !== channel.channel_id) {
    holdReasons.push("unmapped_channel");
  }
  const occurred = Date.parse(occurredAt);
  if (occurred < Date.parse(binding.effective_from)
    || (binding.effective_to !== null && occurred >= Date.parse(binding.effective_to))) {
    holdReasons.push("outside_effective_window");
  }
  if (!channel.joined) holdReasons.push("channel_not_joined");
  if (!channel.allowlisted) holdReasons.push("channel_not_allowlisted");

  const explicitRulePresent = channel.explicit_rule_ref !== null;
  if (channel.channel_kind === "unmapped") {
    holdReasons.push("unmapped_channel_kind");
  } else if (channel.channel_kind !== "project"
    && !(explicitRulePresent && binding.allowed_exceptions.includes(channel.channel_kind))) {
    holdReasons.push(`${channel.channel_kind}_requires_explicit_rule`);
  }
  if (channel.archived
    && !(explicitRulePresent && binding.allowed_exceptions.includes("archived"))) {
    holdReasons.push("archived_requires_explicit_rule");
  }
  if (channel.slack_connect
    && !(explicitRulePresent && binding.allowed_exceptions.includes("slack_connect"))) {
    holdReasons.push("slack_connect_requires_explicit_rule");
  }

  const reasons = [...new Set(holdReasons)].sort(utf8Compare);
  if (reasons.length > 0) {
    return {
      status: "HOLD",
      project_code: null,
      binding_id: binding.binding_id,
      hold_reasons: reasons,
    };
  }
  return {
    status: "ALLOW",
    project_code: binding.project_code,
    binding_id: binding.binding_id,
    hold_reasons: [],
  };
}

export function assessSlackCollectorActivation(input = undefined) {
  const resolved = input ?? { feature_enabled: false, runtime_binding: null };
  assertExactKeys(resolved, ["feature_enabled", "runtime_binding"], "$activation");
  validateBoolean(resolved.feature_enabled, "$activation.feature_enabled");

  if (!resolved.feature_enabled) {
    if (resolved.runtime_binding !== null) validateSlackBinding(resolved.runtime_binding);
    return {
      status: "OFF",
      coverage_state: "not_collected",
      gap_codes: ["feature_off"],
      network_enabled: false,
      write_enabled: false,
    };
  }
  if (resolved.runtime_binding === null) {
    fail("private_binding_required", "$activation.runtime_binding", "Enabled validation requires an explicit private binding");
  }
  validateSlackBinding(resolved.runtime_binding);
  if (resolved.runtime_binding.binding_origin !== "private") {
    fail("private_binding_required", "$activation.runtime_binding.binding_origin", "Synthetic binding cannot enable a live collector");
  }
  return {
    status: "BOUND_READ_ONLY",
    coverage_state: "not_collected",
    gap_codes: ["live_transport_not_present"],
    network_enabled: false,
    write_enabled: false,
  };
}

export function createSlackMessageIdentity({ workspace_id: workspaceId, channel_id: channelId, message_ts: messageTs }) {
  validateContainerId(workspaceId, "$message.workspace_id");
  validateContainerId(channelId, "$message.channel_id");
  validateSlackTimestamp(messageTs, "$message.message_ts");
  const basis = {
    workspace_id: workspaceId,
    channel_id: channelId,
    message_ts: messageTs,
  };
  return {
    ...basis,
    message_ref: `slack-msg:${sha256Canonical(basis).slice("sha256:".length)}`,
  };
}

function validateAttachmentPointer(value, path) {
  assertExactKeys(value, ATTACHMENT_FIELDS, path);
  validateSafeRef(value.file_id, `${path}.file_id`);
  validateSafeRef(value.pointer_ref, `${path}.pointer_ref`);
  validateDigest(value.content_sha256, `${path}.content_sha256`, true);
  validateNullableInteger(value.size_bytes, `${path}.size_bytes`);
  return value;
}

function canonicalAttachmentPointers(value, path) {
  inspectDenseArray(value, path);
  const pointers = value.map((pointer, index) => {
    validateAttachmentPointer(pointer, `${path}[${index}]`);
    return { ...pointer };
  }).sort((left, right) => utf8Compare(left.file_id, right.file_id));
  const ids = pointers.map((pointer) => pointer.file_id);
  if (new Set(ids).size !== ids.length) {
    fail("duplicate_attachment_pointer", path, "Attachment file IDs must be unique");
  }
  return pointers;
}

function validateActor(value, path) {
  assertExactKeys(value, ACTOR_FIELDS, path);
  validateSlackUserId(value.slack_user_id, `${path}.slack_user_id`);
  validateSafeRef(value.erp_account_ref, `${path}.erp_account_ref`, true);
  return value;
}

export function createSlackRevision(value) {
  assertExactKeys(value, REVISION_INPUT_FIELDS, "$revision");
  if (!SLACK_HISTORY_REVISION_KINDS.includes(value.revision_kind)) {
    fail("revision_kind_invalid", "$revision.revision_kind", "Revision kind is not recognized");
  }
  const identity = createSlackMessageIdentity(value);
  validateSlackTimestamp(value.revision_ts, "$revision.revision_ts");
  validateActor(value.actor, "$revision.actor");
  validateDigest(value.source_metadata_digest, "$revision.source_metadata_digest", true);
  validateSafeRef(value.supersedes_revision_ref, "$revision.supersedes_revision_ref", true);

  if (value.thread_ts !== null) validateSlackTimestamp(value.thread_ts, "$revision.thread_ts");
  if (value.revision_kind === "message" && value.thread_ts !== null) {
    fail("message_thread_invalid", "$revision.thread_ts", "A root message has no thread_ts");
  }
  if (value.revision_kind === "reply"
    && (value.thread_ts === null || value.thread_ts === value.message_ts)) {
    fail("reply_thread_invalid", "$revision.thread_ts", "A reply requires a distinct root thread_ts");
  }

  const isInitial = value.revision_kind === "message" || value.revision_kind === "reply";
  if (isInitial && value.supersedes_revision_ref !== null) {
    fail("initial_revision_supersedes", "$revision.supersedes_revision_ref", "Initial message and reply revisions cannot supersede");
  }
  if (!isInitial && value.supersedes_revision_ref === null) {
    fail("revision_supersession_required", "$revision.supersedes_revision_ref", "Edit/delete/tombstone requires a prior revision");
  }

  const isRemoval = value.revision_kind === "delete" || value.revision_kind === "tombstone";
  if (isRemoval && value.source_metadata_digest !== null) {
    fail("removal_content_forbidden", "$revision.source_metadata_digest", "Removal revisions cannot retain content metadata");
  }
  if (!isRemoval && value.source_metadata_digest === null) {
    fail("revision_content_required", "$revision.source_metadata_digest", "Message/reply/edit requires a metadata digest");
  }

  const attachmentPointers = canonicalAttachmentPointers(value.attachment_pointers, "$revision.attachment_pointers");
  if (isRemoval && attachmentPointers.length > 0) {
    fail("removal_attachment_forbidden", "$revision.attachment_pointers", "Removal revisions cannot retain attachment pointers");
  }

  const normalized = {
    revision_kind: value.revision_kind,
    workspace_id: value.workspace_id,
    channel_id: value.channel_id,
    message_ts: value.message_ts,
    thread_ts: value.thread_ts,
    revision_ts: value.revision_ts,
    actor: { ...value.actor },
    source_metadata_digest: value.source_metadata_digest,
    attachment_pointers: attachmentPointers,
    supersedes_revision_ref: value.supersedes_revision_ref,
  };
  const revisionRef = `slack-rev:${sha256Canonical(normalized).slice("sha256:".length)}`;
  return {
    ...normalized,
    message_ref: identity.message_ref,
    revision_ref: revisionRef,
  };
}

function validateCreatedRevision(value, path) {
  assertExactKeys(value, REVISION_FIELDS, path);
  const input = Object.fromEntries(REVISION_INPUT_FIELDS.map((field) => [field, value[field]]));
  const expected = createSlackRevision(input);
  if (!refsEqual(expected, value)) {
    fail("revision_not_canonical", path, "Revision does not match its canonical identity");
  }
  return value;
}

function createDeliveryAttempt(value, path) {
  assertExactKeys(value, DELIVERY_FIELDS, path);
  validateSafeRef(value.event_id, `${path}.event_id`);
  if (!Number.isSafeInteger(value.retry_num) || value.retry_num < 0 || value.retry_num > 1000) {
    fail("retry_num_invalid", `${path}.retry_num`, "Retry number must be between 0 and 1000");
  }
  validateSafeRef(value.retry_reason, `${path}.retry_reason`, true);
  validateUtc(value.received_at, `${path}.received_at`);
  const revision = createSlackRevision(value.revision);
  return {
    event_id: value.event_id,
    retry_num: value.retry_num,
    retry_reason: value.retry_reason,
    received_at: value.received_at,
    revision,
  };
}

function validateDeliveryAttemptEvidence(value, path) {
  assertExactKeys(value, DELIVERY_ATTEMPT_EVIDENCE_FIELDS, path);
  if (!Number.isSafeInteger(value.retry_num) || value.retry_num < 0 || value.retry_num > 1000) {
    fail("retry_num_invalid", `${path}.retry_num`, "Retry number must be between 0 and 1000");
  }
  validateSafeRef(value.retry_reason, `${path}.retry_reason`, true);
  validateUtc(value.received_at, `${path}.received_at`);
  return value;
}

function validateDeliveryEvidence(value, path) {
  assertExactKeys(value, DELIVERY_EVIDENCE_FIELDS, path);
  validateSafeRef(value.event_id, `${path}.event_id`);
  validateSafeRef(value.revision_ref, `${path}.revision_ref`);
  inspectDenseArray(value.attempts, `${path}.attempts`);
  if (value.attempts.length === 0) {
    fail("delivery_attempt_required", `${path}.attempts`, "Delivery evidence requires at least one attempt");
  }
  let priorRetryNum = -1;
  value.attempts.forEach((attempt, index) => {
    validateDeliveryAttemptEvidence(attempt, `${path}.attempts[${index}]`);
    if (attempt.retry_num <= priorRetryNum) {
      fail("delivery_attempt_order_invalid", `${path}.attempts`, "Attempts must be unique and ordered by retry number");
    }
    priorRetryNum = attempt.retry_num;
  });
  return value;
}

function mergeSlackDeliveryEvidence(existingEvidence, deliveries) {
  inspectDenseArray(existingEvidence, "$existing_delivery_evidence");
  inspectDenseArray(deliveries, "$deliveries");
  const byEvent = new Map();

  existingEvidence.forEach((evidence, index) => {
    validateDeliveryEvidence(evidence, `$existing_delivery_evidence[${index}]`);
    if (byEvent.has(evidence.event_id)) {
      fail("duplicate_delivery_evidence", `$existing_delivery_evidence[${index}].event_id`, "Event IDs must be unique");
    }
    byEvent.set(evidence.event_id, {
      revision_ref: evidence.revision_ref,
      attempts: new Map(evidence.attempts.map((attempt) => [attempt.retry_num, { ...attempt }])),
    });
  });

  for (let index = 0; index < deliveries.length; index += 1) {
    const attempt = createDeliveryAttempt(deliveries[index], `$deliveries[${index}]`);
    const existing = byEvent.get(attempt.event_id);
    const attemptEvidence = {
      retry_num: attempt.retry_num,
      retry_reason: attempt.retry_reason,
      received_at: attempt.received_at,
    };
    if (!existing) {
      byEvent.set(attempt.event_id, {
        revision_ref: attempt.revision.revision_ref,
        attempts: new Map([[attempt.retry_num, attemptEvidence]]),
      });
      continue;
    }
    if (existing.revision_ref !== attempt.revision.revision_ref) {
      fail("delivery_retry_conflict", `$deliveries[${index}]`, "One event_id cannot identify different revisions");
    }
    if (existing.attempts.has(attempt.retry_num)
      && !refsEqual(existing.attempts.get(attempt.retry_num), attemptEvidence)) {
      fail("delivery_retry_evidence_conflict", `$deliveries[${index}]`, "Retry evidence conflicts for the same retry number");
    }
    existing.attempts.set(attempt.retry_num, attemptEvidence);
  }

  const deliveryEvidence = [...byEvent.entries()]
    .sort(([left], [right]) => utf8Compare(left, right))
    .map(([eventId, evidence]) => ({
      event_id: eventId,
      revision_ref: evidence.revision_ref,
      attempts: [...evidence.attempts.values()].sort(
        (left, right) => left.retry_num - right.retry_num,
      ),
    }));
  const receipts = deliveryEvidence.map((evidence) => {
    const retryNumbers = evidence.attempts.map((attempt) => attempt.retry_num);
    const received = evidence.attempts.map((attempt) => attempt.received_at).sort(utf8Compare);
    return {
      delivery_ref: `slack-delivery:${sha256Canonical({ event_id: evidence.event_id }).slice("sha256:".length)}`,
      event_id: evidence.event_id,
      revision_ref: evidence.revision_ref,
      attempt_count: evidence.attempts.length,
      retry_numbers: retryNumbers,
      first_received_at: received[0],
      last_received_at: received.at(-1),
    };
  });
  return { delivery_evidence: deliveryEvidence, delivery_receipts: receipts };
}

export function dedupeSlackDeliveries(deliveries) {
  return mergeSlackDeliveryEvidence([], deliveries).delivery_receipts;
}

function revisionOrder(left, right) {
  const timestampOrder = utf8Compare(left.revision_ts, right.revision_ts);
  return timestampOrder === 0 ? utf8Compare(left.revision_ref, right.revision_ref) : timestampOrder;
}

export function validateSlackRevisionCollection(revisions) {
  inspectDenseArray(revisions, "$revisions");
  const byRef = new Map();
  const byMessage = new Map();
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = validateCreatedRevision(revisions[index], `$revisions[${index}]`);
    const existing = byRef.get(revision.revision_ref);
    if (existing && !refsEqual(existing, revision)) {
      fail("revision_ref_conflict", `$revisions[${index}]`, "One revision ref cannot carry different evidence");
    }
    byRef.set(revision.revision_ref, revision);
    const group = byMessage.get(revision.message_ref) ?? [];
    group.push(revision);
    byMessage.set(revision.message_ref, group);
  }

  const successorByRef = new Map();
  for (const revision of byRef.values()) {
    if (revision.supersedes_revision_ref === null) continue;
    const prior = byRef.get(revision.supersedes_revision_ref);
    if (!prior) {
      fail("superseded_revision_missing", "$revisions", "Every superseded revision must be present in the bounded generation");
    }
    if (prior.message_ref !== revision.message_ref) {
      fail("cross_message_supersession", "$revisions", "A revision cannot supersede another logical message");
    }
    if (prior.revision_ts >= revision.revision_ts) {
      fail("revision_time_not_append_only", "$revisions", "A superseding revision must have a later revision_ts");
    }
    if (prior.thread_ts !== revision.thread_ts) {
      fail("thread_lineage_changed", "$revisions", "Thread identity cannot change across revisions");
    }
    if (prior.revision_kind === "tombstone") {
      fail("tombstone_not_terminal", "$revisions", "A tombstone cannot be superseded");
    }
    if (successorByRef.has(prior.revision_ref)
      && successorByRef.get(prior.revision_ref) !== revision.revision_ref) {
      fail("revision_branch_not_allowed", "$revisions", "Slack message revisions must form one append-only chain");
    }
    successorByRef.set(prior.revision_ref, revision.revision_ref);
  }

  for (const group of byMessage.values()) {
    const initial = group.filter((revision) => revision.supersedes_revision_ref === null);
    if (initial.length !== 1 || !["message", "reply"].includes(initial[0].revision_kind)) {
      fail("message_initial_revision_invalid", "$revisions", "Every message needs exactly one message or reply initial revision");
    }
  }

  for (const revision of byRef.values()) {
    const seen = new Set();
    let current = revision;
    while (current.supersedes_revision_ref !== null) {
      if (seen.has(current.revision_ref)) {
        fail("revision_cycle", "$revisions", "Revision lineage contains a cycle");
      }
      seen.add(current.revision_ref);
      current = byRef.get(current.supersedes_revision_ref);
    }
  }
  return revisions;
}

export function replaySlackDeliveries({
  existing_revisions: existingRevisions = [],
  existing_delivery_evidence: existingDeliveryEvidence = [],
  deliveries = [],
}) {
  inspectDenseArray(existingRevisions, "$existing_revisions");
  inspectDenseArray(existingDeliveryEvidence, "$existing_delivery_evidence");
  inspectDenseArray(deliveries, "$deliveries");
  const byRevision = new Map();
  for (let index = 0; index < existingRevisions.length; index += 1) {
    const revision = validateCreatedRevision(existingRevisions[index], `$existing_revisions[${index}]`);
    byRevision.set(revision.revision_ref, revision);
  }
  for (let index = 0; index < deliveries.length; index += 1) {
    const attempt = createDeliveryAttempt(deliveries[index], `$deliveries[${index}]`);
    const existing = byRevision.get(attempt.revision.revision_ref);
    if (existing && !refsEqual(existing, attempt.revision)) {
      fail("revision_ref_conflict", `$deliveries[${index}].revision`, "Revision replay conflicts with retained evidence");
    }
    byRevision.set(attempt.revision.revision_ref, attempt.revision);
  }
  const revisions = [...byRevision.values()].sort(revisionOrder);
  validateSlackRevisionCollection(revisions);
  const mergedDeliveries = mergeSlackDeliveryEvidence(existingDeliveryEvidence, deliveries);
  const revisionRefs = new Set(revisions.map((revision) => revision.revision_ref));
  mergedDeliveries.delivery_evidence.forEach((evidence, index) => {
    if (!revisionRefs.has(evidence.revision_ref)) {
      fail(
        "delivery_revision_missing",
        `$delivery_evidence[${index}].revision_ref`,
        "Delivery evidence must point to a retained revision",
      );
    }
  });
  return {
    revisions,
    delivery_evidence: mergedDeliveries.delivery_evidence,
    delivery_receipts: mergedDeliveries.delivery_receipts,
    generation_digest: sha256Canonical(revisions.map((revision) => revision.revision_ref)),
  };
}

function validateAcceptedPage(value, path) {
  assertExactKeys(value, ACCEPTED_PAGE_FIELDS, path);
  validateSafeRef(value.page_id, `${path}.page_id`);
  validateDigest(value.page_digest, `${path}.page_digest`);
  return value;
}

export function validateSlackBackfillCursor(value) {
  assertExactKeys(value, CURSOR_FIELDS, "$cursor");
  if (value.schema_version !== SLACK_HISTORY_CURSOR_SCHEMA_VERSION) {
    fail("cursor_schema_version_invalid", "$cursor.schema_version", "Schema version does not match");
  }
  validateContainerId(value.workspace_id, "$cursor.workspace_id");
  validateContainerId(value.channel_id, "$cursor.channel_id");
  validateSafeRef(value.binding_id, "$cursor.binding_id");
  validateUtc(value.window_start, "$cursor.window_start");
  validateUtc(value.window_end, "$cursor.window_end");
  if (Date.parse(value.window_start) >= Date.parse(value.window_end)) {
    fail("cursor_window_invalid", "$cursor", "Cursor window must be half-open and nonempty");
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    fail("cursor_sequence_invalid", "$cursor.sequence", "Sequence must be a nonnegative safe integer");
  }
  validateDigest(value.provider_cursor_digest, "$cursor.provider_cursor_digest", true);
  validateDigest(value.generation_digest, "$cursor.generation_digest");
  inspectDenseArray(value.accepted_pages, "$cursor.accepted_pages");
  const pageIds = new Set();
  value.accepted_pages.forEach((page, index) => {
    validateAcceptedPage(page, `$cursor.accepted_pages[${index}]`);
    if (pageIds.has(page.page_id)) {
      fail("duplicate_accepted_page", `$cursor.accepted_pages[${index}].page_id`, "Accepted page IDs must be unique");
    }
    pageIds.add(page.page_id);
  });
  if (value.sequence !== value.accepted_pages.length) {
    fail("cursor_sequence_mismatch", "$cursor.sequence", "Sequence must equal accepted page count");
  }
  inspectDenseArray(value.delivery_evidence, "$cursor.delivery_evidence");
  let priorEventId = null;
  value.delivery_evidence.forEach((evidence, index) => {
    validateDeliveryEvidence(evidence, `$cursor.delivery_evidence[${index}]`);
    if (priorEventId !== null && utf8Compare(priorEventId, evidence.event_id) >= 0) {
      fail(
        "delivery_evidence_order_invalid",
        "$cursor.delivery_evidence",
        "Delivery evidence must use unique event IDs in canonical order",
      );
    }
    priorEventId = evidence.event_id;
  });
  return value;
}

export function createSlackBackfillCursor({
  workspace_id: workspaceId,
  channel_id: channelId,
  binding_id: bindingId,
  window_start: windowStart,
  window_end: windowEnd,
}) {
  const cursor = {
    schema_version: SLACK_HISTORY_CURSOR_SCHEMA_VERSION,
    workspace_id: workspaceId,
    channel_id: channelId,
    binding_id: bindingId,
    window_start: windowStart,
    window_end: windowEnd,
    sequence: 0,
    provider_cursor_digest: null,
    accepted_pages: [],
    delivery_evidence: [],
    generation_digest: sha256Canonical([]),
  };
  return validateSlackBackfillCursor(cursor);
}

function normalizeBackfillPage(value, path) {
  assertExactKeys(value, PAGE_FIELDS, path);
  validateSafeRef(value.page_id, `${path}.page_id`);
  validateDigest(value.previous_cursor_digest, `${path}.previous_cursor_digest`, true);
  validateDigest(value.next_cursor_digest, `${path}.next_cursor_digest`, true);
  inspectDenseArray(value.deliveries, `${path}.deliveries`);
  value.deliveries.forEach((delivery, index) => createDeliveryAttempt(delivery, `${path}.deliveries[${index}]`));
  return {
    page: value,
    page_digest: sha256Canonical(value),
  };
}

export function applyBoundedSlackBackfill({
  cursor,
  pages,
  existing_revisions: existingRevisions = [],
  max_pages: maxPages,
  max_events: maxEvents,
}) {
  validateSlackBackfillCursor(cursor);
  inspectDenseArray(pages, "$pages");
  inspectDenseArray(existingRevisions, "$existing_revisions");
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1000) {
    fail("max_pages_invalid", "$max_pages", "max_pages must be between 1 and 1000");
  }
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 100000) {
    fail("max_events_invalid", "$max_events", "max_events must be between 1 and 100000");
  }

  const retained = replaySlackDeliveries({
    existing_revisions: existingRevisions,
    deliveries: [],
  });
  if (retained.generation_digest !== cursor.generation_digest) {
    fail(
      "cursor_generation_mismatch",
      "$cursor.generation_digest",
      "Cursor generation digest does not match retained revisions",
    );
  }
  retained.revisions.forEach((revision, index) => {
    if (revision.workspace_id !== cursor.workspace_id || revision.channel_id !== cursor.channel_id) {
      fail(
        "backfill_scope_mismatch",
        `$existing_revisions[${index}]`,
        "Retained revision is outside the cursor workspace/channel",
      );
    }
  });
  replaySlackDeliveries({
    existing_revisions: retained.revisions,
    existing_delivery_evidence: cursor.delivery_evidence,
    deliveries: [],
  });

  let revisions = retained.revisions;
  let deliveryEvidence = cursor.delivery_evidence.map((evidence) => ({
    ...evidence,
    attempts: evidence.attempts.map((attempt) => ({ ...attempt })),
  }));
  let providerCursorDigest = cursor.provider_cursor_digest;
  const acceptedPages = cursor.accepted_pages.map((page) => ({ ...page }));
  const acceptedById = new Map(acceptedPages.map((page) => [page.page_id, page.page_digest]));
  let processedPages = 0;
  let processedEvents = 0;
  let replayedPages = 0;
  const gapCodes = [];

  for (let index = 0; index < pages.length; index += 1) {
    const normalized = normalizeBackfillPage(pages[index], `$pages[${index}]`);
    const acceptedDigest = acceptedById.get(normalized.page.page_id);
    if (acceptedDigest) {
      if (acceptedDigest !== normalized.page_digest) {
        fail("accepted_page_conflict", `$pages[${index}]`, "Accepted page ID was replayed with different evidence");
      }
      replayedPages += 1;
      continue;
    }
    if (processedPages >= maxPages) {
      gapCodes.push("bounded_page_limit");
      break;
    }
    if (processedEvents + normalized.page.deliveries.length > maxEvents) {
      gapCodes.push("bounded_event_limit");
      break;
    }
    if (normalized.page.previous_cursor_digest !== providerCursorDigest) {
      fail("backfill_cursor_chain_mismatch", `$pages[${index}].previous_cursor_digest`, "Page does not continue the accepted cursor");
    }
    normalized.page.deliveries.forEach((delivery, deliveryIndex) => {
      const attempt = createDeliveryAttempt(
        delivery,
        `$pages[${index}].deliveries[${deliveryIndex}]`,
      );
      if (attempt.revision.workspace_id !== cursor.workspace_id
        || attempt.revision.channel_id !== cursor.channel_id) {
        fail(
          "backfill_scope_mismatch",
          `$pages[${index}].deliveries[${deliveryIndex}].revision`,
          "Page revision is outside the cursor workspace/channel",
        );
      }
    });

    const replay = replaySlackDeliveries({
      existing_revisions: revisions,
      existing_delivery_evidence: deliveryEvidence,
      deliveries: normalized.page.deliveries,
    });
    revisions = replay.revisions;
    deliveryEvidence = replay.delivery_evidence;
    providerCursorDigest = normalized.page.next_cursor_digest;
    acceptedPages.push({
      page_id: normalized.page.page_id,
      page_digest: normalized.page_digest,
    });
    acceptedById.set(normalized.page.page_id, normalized.page_digest);
    processedPages += 1;
    processedEvents += normalized.page.deliveries.length;
  }

  const nextCursor = {
    schema_version: SLACK_HISTORY_CURSOR_SCHEMA_VERSION,
    workspace_id: cursor.workspace_id,
    channel_id: cursor.channel_id,
    binding_id: cursor.binding_id,
    window_start: cursor.window_start,
    window_end: cursor.window_end,
    sequence: acceptedPages.length,
    provider_cursor_digest: providerCursorDigest,
    accepted_pages: acceptedPages,
    delivery_evidence: deliveryEvidence,
    generation_digest: sha256Canonical(revisions.map((revision) => revision.revision_ref)),
  };
  validateSlackBackfillCursor(nextCursor);
  return {
    cursor: nextCursor,
    revisions,
    processed_pages: processedPages,
    processed_events: processedEvents,
    replayed_pages: replayedPages,
    gap_codes: [...new Set(gapCodes)].sort(utf8Compare),
  };
}

function validateCoverageState(value, path) {
  if (!SLACK_HISTORY_COVERAGE_STATES.includes(value)) {
    fail("coverage_state_invalid", path, "Coverage state is not recognized");
  }
  return value;
}

function validateGapCode(value, path) {
  if (typeof value !== "string" || !GAP_CODE_PATTERN.test(value)) {
    fail("gap_code_invalid", path, "Gap code must be a lower-case logical token");
  }
  return value;
}

function validateCoverageMatrix(value) {
  const { state, event_count: count, gap_codes: gaps, applicability_ref: applicability, revision_refs: revisions } = value;
  if (state === "complete_with_events") {
    if (count !== revisions.length || count < 1 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_with_events requires exact positive count and no gaps");
    }
  } else if (state === "complete_no_events") {
    if (count !== 0 || revisions.length !== 0 || gaps.length !== 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "complete_no_events requires exact zero count and no gaps");
    }
  } else if (state === "partial") {
    if (count !== revisions.length || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", "partial requires exact count and explicit gaps");
    }
  } else if (state === "failed" || state === "not_collected") {
    if (count !== null || revisions.length !== 0 || gaps.length === 0 || applicability !== null) {
      fail("coverage_matrix_invalid", "$coverage", `${state} requires null count and explicit gaps`);
    }
  } else if (state === "not_applicable") {
    if (count !== null || revisions.length !== 0 || gaps.length !== 0 || applicability === null) {
      fail("coverage_matrix_invalid", "$coverage", "not_applicable requires an applicability ref and no events or gaps");
    }
  }
}

export function createSlackCoverageReceipt(value) {
  assertExactKeys(value, COVERAGE_INPUT_FIELDS, "$coverage_input");
  validateContainerId(value.workspace_id, "$coverage_input.workspace_id");
  validateContainerId(value.channel_id, "$coverage_input.channel_id");
  validateSafeRef(value.binding_id, "$coverage_input.binding_id");
  validateProjectCode(value.project_code, "$coverage_input.project_code");
  validateUtc(value.window_start, "$coverage_input.window_start");
  validateUtc(value.window_end, "$coverage_input.window_end");
  if (Date.parse(value.window_start) >= Date.parse(value.window_end)) {
    fail("coverage_window_invalid", "$coverage_input", "Coverage window must be half-open and nonempty");
  }
  validateCoverageState(value.state, "$coverage_input.state");
  validateNullableInteger(value.event_count, "$coverage_input.event_count");
  validateSafeRef(value.applicability_ref, "$coverage_input.applicability_ref", true);
  const gapCodes = canonicalUniqueStrings(value.gap_codes, "$coverage_input.gap_codes", validateGapCode);
  const revisionRefs = canonicalUniqueStrings(
    value.revision_refs,
    "$coverage_input.revision_refs",
    (entry, path) => validateSafeRef(entry, path),
  );

  const normalized = {
    workspace_id: value.workspace_id,
    channel_id: value.channel_id,
    binding_id: value.binding_id,
    project_code: value.project_code,
    window_start: value.window_start,
    window_end: value.window_end,
    state: value.state,
    event_count: value.event_count,
    gap_codes: gapCodes,
    applicability_ref: value.applicability_ref,
    revision_refs: revisionRefs,
  };
  validateCoverageMatrix(normalized);

  const receipt = {
    schema_version: SLACK_HISTORY_COVERAGE_SCHEMA_VERSION,
    ...normalized,
    ordered_revision_digest: sha256Canonical(revisionRefs),
    metadata_digest: "",
    raw_payload_copied: false,
  };
  receipt.metadata_digest = sha256Canonical(
    Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "metadata_digest")),
  );
  return receipt;
}

export function validateSlackCoverageReceipt(value) {
  assertExactKeys(value, COVERAGE_FIELDS, "$coverage");
  if (value.schema_version !== SLACK_HISTORY_COVERAGE_SCHEMA_VERSION) {
    fail("coverage_schema_version_invalid", "$coverage.schema_version", "Schema version does not match");
  }
  const input = Object.fromEntries(COVERAGE_INPUT_FIELDS.map((field) => [field, value[field]]));
  validateCoverageState(value.state, "$coverage.state");
  validateCoverageMatrix(input);
  if (value.raw_payload_copied !== false) {
    fail("raw_payload_copied_must_be_false", "$coverage.raw_payload_copied", "Raw payload copying is forbidden");
  }
  validateDigest(value.ordered_revision_digest, "$coverage.ordered_revision_digest");
  validateDigest(value.metadata_digest, "$coverage.metadata_digest");
  const expected = createSlackCoverageReceipt(input);
  if (!refsEqual(expected, value)) {
    fail("coverage_not_canonical", "$coverage", "Coverage receipt does not match canonical evidence");
  }
  return value;
}
