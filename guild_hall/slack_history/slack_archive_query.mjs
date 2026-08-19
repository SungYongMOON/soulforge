import { Buffer } from "node:buffer";

import {
  createSlackRevision,
  validateSlackBinding,
  validateSlackChannelFacts,
  validateSlackCoverageReceipt,
  validateSlackRevisionCollection,
} from "./slack_history.mjs";

export const SLACK_ARCHIVE_SCHEMA_VERSION = "soulforge.slack_archive.synthetic_fixture.v1";
export const SLACK_ARCHIVE_STATUS_SCHEMA_VERSION = "soulforge.slack_archive_status.v0";
export const SLACK_ARCHIVE_QUERY_SCHEMA_VERSION = "soulforge.slack_archive_query.v0";

export const DEFAULT_ARCHIVE_COVERAGE_GAPS = Object.freeze([
  "deletions_unproven",
  "thread_replies_not_collected",
  "unallowlisted_channels_omitted",
]);

export const SLACK_ARCHIVE_COVERAGE_NOTICE =
  "Coverage is PARTIAL; replies/deletes/older or unallowlisted data may be absent.";

const SLACK_USER_ID_PATTERN = /^[UW][A-Z0-9]{2,31}$/u;
const SLACK_TIMESTAMP_PATTERN = /^\d{10,16}\.\d{6}$/u;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;

export class SlackArchiveError extends Error {
  constructor(code, message = code, status = 400) {
    super(message ? `${code}: ${message}` : code);
    this.name = "SlackArchiveError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message = code, status = 400) {
  throw new SlackArchiveError(code, message, status);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function slackTsToMs(ts) {
  if (typeof ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(ts)) {
    fail("slack_timestamp_invalid", "Expected Slack timestamp");
  }
  const [secondsStr, microsStr] = ts.split(".");
  const seconds = Number.parseInt(secondsStr, 10);
  const micros = Number.parseInt(microsStr.padEnd(6, "0").slice(0, 6), 10);
  const millis = seconds * 1000 + Math.floor(micros / 1000);
  if (!Number.isSafeInteger(millis) || millis < 0) {
    fail("slack_timestamp_invalid", "Timestamp conversion overflow");
  }
  return millis;
}

export function slackTsToIso(ts) {
  return new Date(slackTsToMs(ts)).toISOString();
}

function inspectRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("plain_object_required", `Expected a plain object for ${label}`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", `Custom and null prototypes are not allowed for ${label}`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail("symbol_key_not_allowed", "Symbol keys are not allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", "Only enumerable data properties are allowed");
    }
  }
  return value;
}

function inspectDenseArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", `Expected a plain array for ${label}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_not_allowed", "Sparse arrays are not allowed");
    }
  }
  return value;
}

function validateUtc(value, label, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !UTC_MILLISECONDS_PATTERN.test(value)) {
    fail("timestamp_invalid", `Expected canonical UTC with milliseconds for ${label}`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail("timestamp_invalid", `Timestamp is not a real canonical UTC instant for ${label}`);
  }
  return value;
}

function validateSafeRef(value, label, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)) {
    fail("safe_ref_required", `Expected an opaque logical reference for ${label}`);
  }
  if (/^(?:https?|ftp|file|data):/iu.test(value)
    || value.includes("/")
    || value.includes("\\")
    || /^[A-Za-z]:/u.test(value)) {
    fail("locator_not_allowed", "Paths and locators are not allowed");
  }
  return value;
}

function validateDigest(value, label, nullable = false) {
  if (nullable && value === null) return value;
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", `Expected sha256 plus 64 lowercase hex characters for ${label}`);
  }
  return value;
}

const FORBIDDEN_TEXT_PATTERNS = Object.freeze([
  /https?:\/\/[a-z0-9.-]*slack\.com\/files-(?:pri|pub|upload)\/[^\s"']+/iu,
  /https?:\/\/files\.slack\.com\/[^\s"']+/iu,
  /slack:\/\/[^\s"']+/iu,
  /^[A-Za-z]:[\\/]/u,
  /(?:^|[\\/])(?:etc|var|usr|home|Windows|Program Files|AppData)(?:[\\/]|$)/iu,
  /\.\.[\\/]/u,
  /xox[baprs]-[0-9A-Za-z-]{10,}/iu,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/iu,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/iu,
  /-----BEGIN\s+(?:RSA|OPENSSH|EC|PRIVATE)\s+KEY-----/iu,
]);

export function assertSafeArchiveOutput(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_TEXT_PATTERNS) {
      if (pattern.test(value)) {
        fail("unsafe_output_detected", "Forbidden URL, path, or credential detected in output");
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSafeArchiveOutput(value[index]);
    }
    return value;
  }
  if (typeof value === "object") {
    if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      fail("attachment_bytes_forbidden", "Binary and attachment byte payloads are forbidden in query output");
    }
    for (const key of Object.keys(value)) {
      assertSafeArchiveOutput(value[key]);
    }
    return value;
  }
  fail("unsafe_output_detected", "Unsupported value type in output");
}

function compareSlackTimestamps(left, right) {
  const leftSeconds = Number.parseFloat(left);
  const rightSeconds = Number.parseFloat(right);
  if (leftSeconds !== rightSeconds) return leftSeconds - rightSeconds;
  return utf8Compare(left, right);
}

function normalizeAttachmentPointer(pointer, label) {
  inspectRecord(pointer, label);
  const allowedKeys = new Set(["file_id", "pointer_ref", "content_sha256", "size_bytes", "mime_type"]);
  for (const key of Object.keys(pointer)) {
    if (!allowedKeys.has(key)) {
      fail("extra_attachment_field", "Unknown attachment field");
    }
  }
  validateSafeRef(pointer.file_id, "file_id");
  validateSafeRef(pointer.pointer_ref, "pointer_ref");
  validateDigest(pointer.content_sha256, "content_sha256", true);
  if (pointer.size_bytes !== null && pointer.size_bytes !== undefined) {
    if (!Number.isSafeInteger(pointer.size_bytes) || pointer.size_bytes < 0) {
      fail("size_bytes_invalid", "size_bytes must be a non-negative integer");
    }
  }
  if (typeof pointer.mime_type !== "string"
    || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u.test(pointer.mime_type)) {
    fail("mime_type_invalid", "mime_type must be a valid MIME type string");
  }
  return {
    file_id: pointer.file_id,
    pointer_ref: pointer.pointer_ref,
    content_sha256: pointer.content_sha256 ?? null,
    size_bytes: pointer.size_bytes ?? null,
    mime_type: pointer.mime_type,
  };
}

export function validateArchiveRecord(record, label = "record") {
  inspectRecord(record, label);
  const allowedKeys = new Set([
    "revision_kind",
    "workspace_id",
    "channel_id",
    "message_ts",
    "thread_ts",
    "revision_ts",
    "actor",
    "source_metadata_digest",
    "text",
    "attachment_pointers",
    "supersedes_revision_ref",
    "message_ref",
    "revision_ref",
    "received_at",
  ]);

  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      fail("extra_record_field", "Unknown archive record field");
    }
  }

  const rawRevision = {
    revision_kind: record.revision_kind,
    workspace_id: record.workspace_id,
    channel_id: record.channel_id,
    message_ts: record.message_ts,
    thread_ts: record.thread_ts,
    revision_ts: record.revision_ts,
    actor: record.actor,
    source_metadata_digest: record.source_metadata_digest,
    attachment_pointers: (record.attachment_pointers || []).map((p, idx) =>
      normalizeAttachmentPointer(p, `attachment_pointers[${idx}]`)),
    supersedes_revision_ref: record.supersedes_revision_ref,
  };

  const canonicalRevision = createSlackRevision(rawRevision);

  if (record.message_ref && record.message_ref !== canonicalRevision.message_ref) {
    fail("message_ref_mismatch", "Message ref does not match canonical message identity");
  }
  if (record.revision_ref && record.revision_ref !== canonicalRevision.revision_ref) {
    fail("revision_ref_mismatch", "Revision ref does not match canonical revision identity");
  }

  let safeText = null;
  if (record.text !== undefined && record.text !== null) {
    if (typeof record.text !== "string") {
      fail("text_invalid", "Text must be a string");
    }
    if (record.text.length > 50000) {
      fail("text_too_long", "Text exceeds maximum allowed length of 50000 characters");
    }
    assertSafeArchiveOutput(record.text);
    safeText = record.text;
  }

  let receivedAt = null;
  if (record.received_at !== undefined && record.received_at !== null) {
    receivedAt = validateUtc(record.received_at, "received_at");
  }

  return {
    ...canonicalRevision,
    text: safeText,
    received_at: receivedAt,
  };
}

export function validateSlackArchiveCoverage(coverage) {
  if (coverage === null || typeof coverage !== "object" || Array.isArray(coverage)) {
    fail("coverage_required", "Archive coverage object is required");
  }

  let receipt;
  try {
    receipt = validateSlackCoverageReceipt(coverage);
  } catch (error) {
    if (error instanceof SlackArchiveError) throw error;
    fail(error?.code || "coverage_invalid", error?.message || "Coverage receipt validation failed");
  }

  // Enforce archive-v0 extra invariant: validated state must be partial and gap_codes non-empty array
  if (receipt.state !== "partial") {
    fail("coverage_state_unsupported", "Only partial coverage state is supported in v0 archive query");
  }
  if (!Array.isArray(receipt.gap_codes) || receipt.gap_codes.length === 0) {
    fail("gap_codes_required", "gap_codes must be a non-empty array for partial coverage");
  }

  return receipt;
}

export function validateSlackArchiveEnvelope(envelope) {
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("plain_object_required", "Archive envelope must be a plain object");
  }
  inspectRecord(envelope, "archive envelope");

  const allowedKeys = new Set(["schema_version", "binding", "coverage", "records"]);
  for (const key of Object.keys(envelope)) {
    if (!allowedKeys.has(key)) {
      fail("extra_envelope_field", "Unknown envelope field");
    }
  }

  for (const req of allowedKeys) {
    if (envelope[req] === undefined || envelope[req] === null) {
      fail("missing_envelope_field", `Missing required envelope field: ${req}`);
    }
  }

  if (envelope.schema_version !== SLACK_ARCHIVE_SCHEMA_VERSION) {
    fail("schema_version_invalid", "Unsupported archive schema version");
  }

  const validatedBinding = validateSlackBinding(envelope.binding);
  const validatedCoverage = validateSlackArchiveCoverage(envelope.coverage);

  if (validatedCoverage.workspace_id !== validatedBinding.workspace_id
    || validatedCoverage.channel_id !== validatedBinding.channel_id
    || validatedCoverage.binding_id !== validatedBinding.binding_id
    || validatedCoverage.project_code !== validatedBinding.project_code) {
    fail("coverage_scope_mismatch", "Coverage scope does not match archive binding");
  }

  inspectDenseArray(envelope.records, "envelope.records");
  if (envelope.records.length === 0) {
    fail("records_required", "Archive must contain at least one record");
  }

  const validatedRecords = [];
  for (let idx = 0; idx < envelope.records.length; idx += 1) {
    const validated = validateArchiveRecord(envelope.records[idx], `records[${idx}]`);
    if (validated.workspace_id !== validatedBinding.workspace_id
      || validated.channel_id !== validatedBinding.channel_id) {
      fail("archive_scope_mismatch", "Record workspace/channel does not match binding");
    }
    validatedRecords.push(validated);
  }

  return {
    schema_version: envelope.schema_version,
    binding: validatedBinding,
    coverage: validatedCoverage,
    records: validatedRecords,
  };
}

export function createSlackArchiveIndex({
  binding,
  records = [],
  coverage = null,
  channel_facts = null,
} = {}) {
  if (!binding) fail("binding_required", "Archive index requires an explicit binding");
  const validatedBinding = validateSlackBinding(binding);

  if (channel_facts !== null && channel_facts !== undefined) {
    validateSlackChannelFacts(channel_facts);
    if (channel_facts.workspace_id !== validatedBinding.workspace_id
      || channel_facts.channel_id !== validatedBinding.channel_id) {
      fail("binding_scope_mismatch", "Channel facts workspace/channel must match binding");
    }
  }

  let validatedCoverage;
  if (coverage) {
    validatedCoverage = validateSlackArchiveCoverage(coverage);
    if (validatedCoverage.workspace_id !== validatedBinding.workspace_id
      || validatedCoverage.channel_id !== validatedBinding.channel_id
      || validatedCoverage.binding_id !== validatedBinding.binding_id
      || validatedCoverage.project_code !== validatedBinding.project_code) {
      fail("coverage_scope_mismatch", "Coverage scope does not match archive binding");
    }
  } else {
    validatedCoverage = {
      state: "partial",
      gap_codes: [...DEFAULT_ARCHIVE_COVERAGE_GAPS],
    };
  }

  inspectDenseArray(records, "records");

  const validatedRecords = [];
  for (let index = 0; index < records.length; index += 1) {
    const validated = validateArchiveRecord(records[index], `records[${index}]`);
    if (validated.workspace_id !== validatedBinding.workspace_id
      || validated.channel_id !== validatedBinding.channel_id) {
      fail("archive_scope_mismatch", "Archive record workspace/channel does not match binding");
    }
    validatedRecords.push(validated);
  }

  const rawRevisions = validatedRecords.map((r) => ({
    revision_kind: r.revision_kind,
    workspace_id: r.workspace_id,
    channel_id: r.channel_id,
    message_ts: r.message_ts,
    thread_ts: r.thread_ts,
    revision_ts: r.revision_ts,
    actor: r.actor,
    source_metadata_digest: r.source_metadata_digest,
    attachment_pointers: r.attachment_pointers,
    supersedes_revision_ref: r.supersedes_revision_ref,
    message_ref: r.message_ref,
    revision_ref: r.revision_ref,
  }));
  validateSlackRevisionCollection(rawRevisions);

  const messagesByRef = new Map();
  const messagesByTs = new Map();
  const revisionsByRef = new Map();
  const attachmentMap = new Map();
  const threadsMap = new Map();

  for (const record of validatedRecords) {
    revisionsByRef.set(record.revision_ref, record);
    let msg = messagesByRef.get(record.message_ref);
    if (!msg) {
      msg = {
        workspace_id: record.workspace_id,
        channel_id: record.channel_id,
        project_code: validatedBinding.project_code,
        message_ref: record.message_ref,
        message_ts: record.message_ts,
        thread_ts: record.thread_ts,
        revisions: [],
        latest_revision: null,
        is_deleted: false,
        actor: record.actor,
        source_metadata_digest: record.source_metadata_digest,
        text: record.text,
        attachment_pointers: record.attachment_pointers,
        received_at: record.received_at,
      };
      messagesByRef.set(record.message_ref, msg);
      messagesByTs.set(record.message_ts, msg);
    }
    msg.revisions.push(record);
  }

  let earliestMessageTs = null;
  let latestMessageTs = null;
  let earliestReceivedAt = null;
  let latestReceivedAt = null;
  let deletedCount = 0;
  let activeCount = 0;

  for (const msg of messagesByRef.values()) {
    msg.revisions.sort((a, b) => compareSlackTimestamps(a.revision_ts, b.revision_ts));
    const latest = msg.revisions.at(-1);
    msg.latest_revision = latest;
    msg.actor = latest.actor;
    msg.revision_ts = latest.revision_ts;
    msg.revision_kind = latest.revision_kind;

    if (latest.revision_kind === "delete" || latest.revision_kind === "tombstone") {
      msg.is_deleted = true;
      msg.source_metadata_digest = null;
      msg.text = null;
      msg.attachment_pointers = [];
      deletedCount += 1;
    } else {
      msg.is_deleted = false;
      msg.source_metadata_digest = latest.source_metadata_digest;
      msg.text = latest.text;
      msg.attachment_pointers = latest.attachment_pointers;
      activeCount += 1;
    }

    const recTimes = msg.revisions.map((r) => r.received_at).filter(Boolean).sort(utf8Compare);
    msg.received_at = recTimes[0] ?? null;
    msg.latest_received_at = recTimes.at(-1) ?? null;

    if (earliestMessageTs === null || compareSlackTimestamps(msg.message_ts, earliestMessageTs) < 0) {
      earliestMessageTs = msg.message_ts;
    }
    if (latestMessageTs === null || compareSlackTimestamps(msg.message_ts, latestMessageTs) > 0) {
      latestMessageTs = msg.message_ts;
    }

    for (const rec of recTimes) {
      if (earliestReceivedAt === null || utf8Compare(rec, earliestReceivedAt) < 0) {
        earliestReceivedAt = rec;
      }
      if (latestReceivedAt === null || utf8Compare(rec, latestReceivedAt) > 0) {
        latestReceivedAt = rec;
      }
    }

    if (!msg.is_deleted) {
      for (const attachment of msg.attachment_pointers) {
        if (!attachmentMap.has(attachment.file_id)) {
          attachmentMap.set(attachment.file_id, {
            ...attachment,
            message_ts: msg.message_ts,
            workspace_id: msg.workspace_id,
            channel_id: msg.channel_id,
            project_code: validatedBinding.project_code,
          });
        }
      }
    }

    const threadKey = msg.thread_ts || msg.message_ts;
    let threadGroup = threadsMap.get(threadKey);
    if (!threadGroup) {
      threadGroup = { root: null, replies: [] };
      threadsMap.set(threadKey, threadGroup);
    }
    if (msg.thread_ts === null || msg.thread_ts === msg.message_ts) {
      threadGroup.root = msg;
    } else {
      threadGroup.replies.push(msg);
    }
  }

  for (const threadGroup of threadsMap.values()) {
    threadGroup.replies.sort((a, b) => compareSlackTimestamps(a.message_ts, b.message_ts));
  }

  const timeline = [...messagesByRef.values()].sort((a, b) => {
    const tsComp = compareSlackTimestamps(a.message_ts, b.message_ts);
    return tsComp === 0 ? utf8Compare(a.message_ref, b.message_ref) : tsComp;
  });

  function safeMessageSummary(msg) {
    return {
      workspace_id: msg.workspace_id,
      channel_id: msg.channel_id,
      project_code: msg.project_code,
      message_ref: msg.message_ref,
      message_ts: msg.message_ts,
      message_time: slackTsToIso(msg.message_ts),
      thread_ts: msg.thread_ts,
      revision_ts: msg.revision_ts,
      revision_kind: msg.revision_kind,
      actor: {
        slack_user_id: msg.actor.slack_user_id,
        erp_account_ref: msg.actor.erp_account_ref,
      },
      text: msg.text,
      source_metadata_digest: msg.source_metadata_digest,
      attachment_pointers: msg.attachment_pointers.map((p) => ({
        file_id: p.file_id,
        pointer_ref: p.pointer_ref,
        content_sha256: p.content_sha256,
        size_bytes: p.size_bytes,
        mime_type: p.mime_type,
      })),
      received_at: msg.received_at,
      is_deleted: msg.is_deleted,
      revision_count: msg.revisions.length,
    };
  }

  function matchTimeFilters(msg, {
    since_message_ts = null,
    until_message_ts = null,
    since_message_time = null,
    until_message_time = null,
    since_received_at = null,
    until_received_at = null,
  }) {
    if (since_message_ts && compareSlackTimestamps(msg.message_ts, since_message_ts) < 0) return false;
    if (until_message_ts && compareSlackTimestamps(msg.message_ts, until_message_ts) > 0) return false;

    if (since_message_time) {
      const msgIso = slackTsToIso(msg.message_ts);
      if (utf8Compare(msgIso, since_message_time) < 0) return false;
    }
    if (until_message_time) {
      const msgIso = slackTsToIso(msg.message_ts);
      if (utf8Compare(msgIso, until_message_time) > 0) return false;
    }

    if (since_received_at) {
      if (msg.received_at === null || utf8Compare(msg.received_at, since_received_at) < 0) return false;
    }
    if (until_received_at) {
      if (msg.received_at === null || utf8Compare(msg.received_at, until_received_at) > 0) return false;
    }

    return true;
  }

  return Object.freeze({
    binding: validatedBinding,
    coverage_state: validatedCoverage.state,
    coverage_gaps: validatedCoverage.gap_codes,

    status() {
      const res = {
        schema_version: SLACK_ARCHIVE_STATUS_SCHEMA_VERSION,
        workspace_id: validatedBinding.workspace_id,
        channel_id: validatedBinding.channel_id,
        project_code: validatedBinding.project_code,
        coverage_state: this.coverage_state,
        coverage_gaps: [...this.coverage_gaps],
        coverage_notice: SLACK_ARCHIVE_COVERAGE_NOTICE,
        retained_messages_count: messagesByRef.size,
        retained_revisions_count: validatedRecords.length,
        active_messages_count: activeCount,
        deleted_messages_count: deletedCount,
        thread_count: [...threadsMap.values()].filter((t) => t.replies.length > 0).length,
        attachment_count: attachmentMap.size,
        earliest_message_ts: earliestMessageTs,
        latest_message_ts: latestMessageTs,
        earliest_message_time: earliestMessageTs ? slackTsToIso(earliestMessageTs) : null,
        latest_message_time: latestMessageTs ? slackTsToIso(latestMessageTs) : null,
        earliest_received_at: earliestReceivedAt,
        latest_received_at: latestReceivedAt,
        read_only: true,
        mode: "archive_query",
      };
      return assertSafeArchiveOutput(res);
    },

    search({
      query = null,
      user_id = null,
      since_message_ts = null,
      until_message_ts = null,
      since_message_time = null,
      until_message_time = null,
      since_received_at = null,
      until_received_at = null,
      has_attachments = null,
      include_deleted = false,
      limit = 20,
    } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        fail("limit_invalid", "Limit must be a safe integer between 1 and 100");
      }
      if (query !== null && (typeof query !== "string" || query.length > 200)) {
        fail("query_invalid", "Query must be a string up to 200 characters");
      }
      if (user_id !== null && (typeof user_id !== "string" || !SLACK_USER_ID_PATTERN.test(user_id))) {
        fail("user_id_invalid", "user_id must be a valid Slack user ID");
      }
      if (since_message_ts !== null && (typeof since_message_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(since_message_ts))) {
        fail("since_message_ts_invalid", "since_message_ts must be a valid Slack timestamp");
      }
      if (until_message_ts !== null && (typeof until_message_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(until_message_ts))) {
        fail("until_message_ts_invalid", "until_message_ts must be a valid Slack timestamp");
      }
      if (since_message_time !== null && (typeof since_message_time !== "string" || !UTC_MILLISECONDS_PATTERN.test(since_message_time))) {
        fail("since_message_time_invalid", "since_message_time must be canonical UTC with milliseconds");
      }
      if (until_message_time !== null && (typeof until_message_time !== "string" || !UTC_MILLISECONDS_PATTERN.test(until_message_time))) {
        fail("until_message_time_invalid", "until_message_time must be canonical UTC with milliseconds");
      }
      if (since_received_at !== null && (typeof since_received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(since_received_at))) {
        fail("since_received_at_invalid", "since_received_at must be canonical UTC with milliseconds");
      }
      if (until_received_at !== null && (typeof until_received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(until_received_at))) {
        fail("until_received_at_invalid", "until_received_at must be canonical UTC with milliseconds");
      }

      const qLower = query ? query.toLowerCase().trim() : null;

      const filtered = timeline.filter((msg) => {
        if (!include_deleted && msg.is_deleted) return false;
        if (user_id && msg.actor.slack_user_id !== user_id) return false;
        if (has_attachments === true && msg.attachment_pointers.length === 0) return false;
        if (has_attachments === false && msg.attachment_pointers.length > 0) return false;

        if (!matchTimeFilters(msg, {
          since_message_ts,
          until_message_ts,
          since_message_time,
          until_message_time,
          since_received_at,
          until_received_at,
        })) {
          return false;
        }

        if (qLower) {
          const matchText = msg.text ? msg.text.toLowerCase().includes(qLower) : false;
          const matchActor = msg.actor.slack_user_id.toLowerCase().includes(qLower);
          const matchAttachment = msg.attachment_pointers.some((p) =>
            p.mime_type.toLowerCase().includes(qLower));
          if (!matchText && !matchActor && !matchAttachment) return false;
        }

        return true;
      });

      const totalMatches = filtered.length;
      const results = filtered.slice(0, limit).map(safeMessageSummary);

      const res = {
        schema_version: SLACK_ARCHIVE_QUERY_SCHEMA_VERSION,
        workspace_id: validatedBinding.workspace_id,
        channel_id: validatedBinding.channel_id,
        project_code: validatedBinding.project_code,
        ordering_field: "message_ts",
        time_dimension: "message_time",
        total_matches: totalMatches,
        returned_count: results.length,
        truncated: totalMatches > results.length,
        results,
        coverage_notice: SLACK_ARCHIVE_COVERAGE_NOTICE,
      };
      return assertSafeArchiveOutput(res);
    },

    thread({ thread_ts, limit = 50 } = {}) {
      if (typeof thread_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(thread_ts)) {
        fail("thread_ts_invalid", "thread_ts must be a valid Slack timestamp");
      }
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        fail("limit_invalid", "Limit must be a safe integer between 1 and 200");
      }

      const threadGroup = threadsMap.get(thread_ts);
      let root = threadGroup?.root || messagesByTs.get(thread_ts) || null;
      const allReplies = threadGroup?.replies || [];

      const returnedReplies = allReplies.slice(0, limit).map(safeMessageSummary);

      const res = {
        schema_version: SLACK_ARCHIVE_QUERY_SCHEMA_VERSION,
        workspace_id: validatedBinding.workspace_id,
        channel_id: validatedBinding.channel_id,
        project_code: validatedBinding.project_code,
        thread_ts,
        root_message: root ? safeMessageSummary(root) : null,
        reply_count: allReplies.length,
        returned_reply_count: returnedReplies.length,
        truncated: allReplies.length > returnedReplies.length,
        replies: returnedReplies,
        coverage_notice: SLACK_ARCHIVE_COVERAGE_NOTICE,
      };
      return assertSafeArchiveOutput(res);
    },

    timeline({
      since_message_ts = null,
      until_message_ts = null,
      since_message_time = null,
      until_message_time = null,
      since_received_at = null,
      until_received_at = null,
      limit = 50,
      direction = "asc",
      include_deleted = false,
    } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        fail("limit_invalid", "Limit must be a safe integer between 1 and 200");
      }
      if (direction !== "asc" && direction !== "desc") {
        fail("direction_invalid", "Direction must be 'asc' or 'desc'");
      }
      if (since_message_ts !== null && (typeof since_message_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(since_message_ts))) {
        fail("since_message_ts_invalid", "since_message_ts must be a valid Slack timestamp");
      }
      if (until_message_ts !== null && (typeof until_message_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(until_message_ts))) {
        fail("until_message_ts_invalid", "until_message_ts must be a valid Slack timestamp");
      }
      if (since_message_time !== null && (typeof since_message_time !== "string" || !UTC_MILLISECONDS_PATTERN.test(since_message_time))) {
        fail("since_message_time_invalid", "since_message_time must be canonical UTC with milliseconds");
      }
      if (until_message_time !== null && (typeof until_message_time !== "string" || !UTC_MILLISECONDS_PATTERN.test(until_message_time))) {
        fail("until_message_time_invalid", "until_message_time must be canonical UTC with milliseconds");
      }
      if (since_received_at !== null && (typeof since_received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(since_received_at))) {
        fail("since_received_at_invalid", "since_received_at must be canonical UTC with milliseconds");
      }
      if (until_received_at !== null && (typeof until_received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(until_received_at))) {
        fail("until_received_at_invalid", "until_received_at must be canonical UTC with milliseconds");
      }

      let items = timeline.filter((msg) => {
        if (!include_deleted && msg.is_deleted) return false;
        return matchTimeFilters(msg, {
          since_message_ts,
          until_message_ts,
          since_message_time,
          until_message_time,
          since_received_at,
          until_received_at,
        });
      });

      if (direction === "desc") {
        items = [...items].reverse();
      }

      const totalInWindow = items.length;
      const returnedItems = items.slice(0, limit).map(safeMessageSummary);

      const res = {
        schema_version: SLACK_ARCHIVE_QUERY_SCHEMA_VERSION,
        workspace_id: validatedBinding.workspace_id,
        channel_id: validatedBinding.channel_id,
        project_code: validatedBinding.project_code,
        ordering_field: "message_ts",
        time_dimension: "message_time",
        direction,
        total_in_window: totalInWindow,
        returned_count: returnedItems.length,
        truncated: totalInWindow > returnedItems.length,
        messages: returnedItems,
        coverage_notice: SLACK_ARCHIVE_COVERAGE_NOTICE,
      };
      return assertSafeArchiveOutput(res);
    },

    attachment_metadata({ file_id = null, message_ts = null, limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        fail("limit_invalid", "Limit must be a safe integer between 1 and 100");
      }
      if (file_id !== null && (typeof file_id !== "string" || !SAFE_REF_PATTERN.test(file_id))) {
        fail("file_id_invalid", "file_id must be a safe ref");
      }
      if (message_ts !== null && (typeof message_ts !== "string" || !SLACK_TIMESTAMP_PATTERN.test(message_ts))) {
        fail("message_ts_invalid", "message_ts must be a valid Slack timestamp");
      }

      let matches = [];
      if (file_id) {
        const item = attachmentMap.get(file_id);
        if (item) matches.push(item);
      } else if (message_ts) {
        const msg = messagesByTs.get(message_ts);
        if (msg && !msg.is_deleted) {
          matches = msg.attachment_pointers.map((p) => ({
            ...p,
            message_ts: msg.message_ts,
            workspace_id: msg.workspace_id,
            channel_id: msg.channel_id,
            project_code: validatedBinding.project_code,
          }));
        }
      } else {
        matches = [...attachmentMap.values()];
      }

      const totalMatches = matches.length;
      const returnedAttachments = matches.slice(0, limit).map((a) => ({
        file_id: a.file_id,
        pointer_ref: a.pointer_ref,
        message_ts: a.message_ts,
        content_sha256: a.content_sha256 ?? null,
        size_bytes: a.size_bytes ?? null,
        mime_type: a.mime_type,
      }));

      const res = {
        schema_version: SLACK_ARCHIVE_QUERY_SCHEMA_VERSION,
        workspace_id: validatedBinding.workspace_id,
        channel_id: validatedBinding.channel_id,
        project_code: validatedBinding.project_code,
        total_matches: totalMatches,
        returned_count: returnedAttachments.length,
        truncated: totalMatches > returnedAttachments.length,
        attachments: returnedAttachments,
        coverage_notice: SLACK_ARCHIVE_COVERAGE_NOTICE,
      };
      return assertSafeArchiveOutput(res);
    },
  });
}
