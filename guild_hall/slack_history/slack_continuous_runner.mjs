import path from "node:path";

import { sha256Canonical } from "../shared/project_history_envelope.mjs";
import {
  applyBoundedSlackBackfill,
  createSlackBackfillCursor,
  createSlackMessageIdentity,
  createSlackRevision,
  resolveSlackProjectScope,
  validateSlackBackfillCursor,
} from "./slack_history.mjs";
import {
  acquireExclusiveLease,
  atomicWritePrivateJson,
  readPrivateJson,
  writeRawEventToCustody,
} from "./slack_custody.mjs";

export const SLACK_CONTINUOUS_BINDING_SCHEMA_VERSION = "soulforge.slack_continuous.binding.v1";
export const SLACK_CONTINUOUS_STATE_SCHEMA_VERSION = "soulforge.slack_continuous.state.v1";

const BINDING_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "binding_id",
  "workspace_id",
  "channel_id",
  "project_code",
  "channel",
  "credentials",
  "private_root",
  "data_root",
  "forbidden_roots",
  "writer",
]);
const CHANNEL_FIELDS = Object.freeze([
  "kind",
  "visibility",
  "is_shared",
  "is_ext_shared",
  "is_archived",
  "is_member",
]);
const CREDENTIAL_FIELDS = Object.freeze([
  "app_token_env",
  "bot_token_env",
  "app_token_file",
  "bot_token_file",
]);
const WRITER_FIELDS = Object.freeze(["authority_id", "epoch"]);
const HOLD_RECEIPT_FIELDS = Object.freeze([
  "page_id",
  "event_id",
  "retry_num",
  "retry_reason",
  "received_at",
  "raw_digest",
  "hold_reasons",
  "source_refs",
]);
const PAGE_EVIDENCE_RECEIPT_FIELDS = Object.freeze([
  "page_id",
  "page_evidence_digest",
]);
const RECORD_FIELDS = Object.freeze([
  "event_id",
  "retry_num",
  "retry_reason",
  "received_at",
  "workspace_id",
  "channel_id",
  "channel_kind",
  "is_private",
  "is_shared",
  "is_ext_shared",
  "is_archived",
  "is_member",
  "source_refs",
  "raw_event",
]);
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,255}$/u;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/u;
const WORKSPACE_ID_PATTERN = /^T[A-Z0-9]{2,31}$/u;
const CHANNEL_ID_PATTERN = /^C[A-Z0-9]{2,31}$/u;
const PROJECT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/u;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const TOKEN_VALUE_PATTERN = /^(?:xox[abprs]-|eyJ[A-Za-z0-9_-]{8,}\.)/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export class SlackContinuousError extends Error {
  constructor(code, target, message) {
    super(`${code} at ${target}: ${message}`);
    this.name = "SlackContinuousError";
    this.code = code;
    this.path = target;
  }
}

function fail(code, target, message) {
  throw new SlackContinuousError(code, target, message);
}

function plainRecord(value, target) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", target, "Expected a plain object");
  }
  return value;
}

function exactKeys(value, fields, target) {
  plainRecord(value, target);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length
    || actual.some((entry, index) => entry !== expected[index])) {
    fail("exact_keys_required", target, `Expected exact keys: ${expected.join(",")}`);
  }
}

function safeRef(value, target) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value)
    || /^(?:https?|file|data):/iu.test(value)
    || value.includes("/") || value.includes("\\")) {
    fail("safe_ref_required", target, "Expected an opaque non-locator reference");
  }
  return value;
}

function boolean(value, target) {
  if (typeof value !== "boolean") fail("boolean_required", target, "Expected a boolean");
}

function nullableAbsolutePath(value, target) {
  if (value === null) return;
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    fail("absolute_path_required", target, "Expected null or an absolute private path");
  }
}

function normalizedBoundaryPath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathWithin(parent, candidate, strict = false) {
  const relative = path.relative(
    normalizedBoundaryPath(parent),
    normalizedBoundaryPath(candidate),
  );
  if (relative === "") return !strict;
  return relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function pathsOverlap(left, right) {
  return isPathWithin(left, right) || isPathWithin(right, left);
}

function assertNoEmbeddedSecret(value, target, key = "") {
  if (typeof value === "string") {
    if (TOKEN_VALUE_PATTERN.test(value)) {
      fail("secret_value_forbidden", target, "Token-like values are forbidden in bindings");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    const childPath = `${target}.${childKey}`;
    if (/(?:access_token|client_secret|password|token_value|credential_value)/iu.test(childKey)) {
      fail("secret_field_forbidden", childPath, "Only token environment names or file paths are allowed");
    }
    assertNoEmbeddedSecret(childValue, childPath, childKey);
  }
  void key;
}

export function validateSlackContinuousBinding(binding) {
  exactKeys(binding, BINDING_FIELDS, "$binding");
  if (binding.schema_version !== SLACK_CONTINUOUS_BINDING_SCHEMA_VERSION) {
    fail("binding_schema_invalid", "$binding.schema_version", "Unexpected schema version");
  }
  if (binding.feature_enabled !== false) {
    fail("feature_must_remain_off", "$binding.feature_enabled", "This public harness cannot activate Slack");
  }
  safeRef(binding.binding_id, "$binding.binding_id");
  if (typeof binding.workspace_id !== "string" || !WORKSPACE_ID_PATTERN.test(binding.workspace_id)) {
    fail("workspace_id_invalid", "$binding.workspace_id", "Expected a stable Slack workspace ID");
  }
  if (typeof binding.channel_id !== "string" || !CHANNEL_ID_PATTERN.test(binding.channel_id)) {
    fail("channel_id_invalid", "$binding.channel_id", "Only one exact public channel ID is allowed");
  }
  if (typeof binding.project_code !== "string" || !PROJECT_CODE_PATTERN.test(binding.project_code)) {
    fail("project_code_invalid", "$binding.project_code", "Expected an exact project code");
  }
  exactKeys(binding.channel, CHANNEL_FIELDS, "$binding.channel");
  if (binding.channel.kind !== "project"
    || binding.channel.visibility !== "public"
    || binding.channel.is_shared !== false
    || binding.channel.is_ext_shared !== false
    || binding.channel.is_archived !== false
    || binding.channel.is_member !== true) {
    fail("unsafe_channel_binding", "$binding.channel", "Only joined, public, nonshared, nonarchived project channels are bindable");
  }
  exactKeys(binding.credentials, CREDENTIAL_FIELDS, "$binding.credentials");
  for (const key of ["app_token_env", "bot_token_env"]) {
    const value = binding.credentials[key];
    if (value !== null && (typeof value !== "string" || !ENV_NAME_PATTERN.test(value))) {
      fail("credential_env_name_invalid", `$binding.credentials.${key}`, "Expected null or an environment variable name");
    }
  }
  nullableAbsolutePath(binding.credentials.app_token_file, "$binding.credentials.app_token_file");
  nullableAbsolutePath(binding.credentials.bot_token_file, "$binding.credentials.bot_token_file");
  if (typeof binding.private_root !== "string" || !path.isAbsolute(binding.private_root)) {
    fail("absolute_private_root_required", "$binding.private_root", "Private owner root must be absolute");
  }
  if (typeof binding.data_root !== "string" || !path.isAbsolute(binding.data_root)) {
    fail("absolute_data_root_required", "$binding.data_root", "Private data root must be absolute");
  }
  if (!isPathWithin(binding.private_root, binding.data_root, true)) {
    fail(
      "data_root_not_strict_private_child",
      "$binding.data_root",
      "Data root must be a strict child of the declared private owner root",
    );
  }
  if (!Array.isArray(binding.forbidden_roots) || binding.forbidden_roots.length === 0
    || Object.keys(binding.forbidden_roots).length !== binding.forbidden_roots.length) {
    fail(
      "forbidden_roots_required",
      "$binding.forbidden_roots",
      "At least one dense forbidden public/runtime root is required",
    );
  }
  const normalizedForbiddenRoots = new Set();
  binding.forbidden_roots.forEach((forbiddenRoot, index) => {
    const target = `$binding.forbidden_roots[${index}]`;
    if (typeof forbiddenRoot !== "string" || !path.isAbsolute(forbiddenRoot)) {
      fail("absolute_forbidden_root_required", target, "Forbidden roots must be absolute");
    }
    const normalized = normalizedBoundaryPath(forbiddenRoot);
    if (normalizedForbiddenRoots.has(normalized)) {
      fail("duplicate_forbidden_root", target, "Forbidden roots must be unique after normalization");
    }
    normalizedForbiddenRoots.add(normalized);
    if (pathsOverlap(binding.data_root, forbiddenRoot)) {
      fail(
        "data_root_forbidden_overlap",
        "$binding.data_root",
        "Private data root must be disjoint from every forbidden public/runtime root",
      );
    }
  });
  exactKeys(binding.writer, WRITER_FIELDS, "$binding.writer");
  safeRef(binding.writer.authority_id, "$binding.writer.authority_id");
  if (!Number.isSafeInteger(binding.writer.epoch) || binding.writer.epoch < 1) {
    fail("writer_epoch_invalid", "$binding.writer.epoch", "Writer epoch must be a positive safe integer");
  }
  assertNoEmbeddedSecret(binding, "$binding");
  return binding;
}

export function digestSlackContinuousBinding(binding) {
  validateSlackContinuousBinding(binding);
  return sha256Canonical(binding);
}

function validateRecord(record, index) {
  const target = `$records[${index}]`;
  exactKeys(record, RECORD_FIELDS, target);
  safeRef(record.event_id, `${target}.event_id`);
  if (!Number.isSafeInteger(record.retry_num) || record.retry_num < 0 || record.retry_num > 1000) {
    fail("retry_num_invalid", `${target}.retry_num`, "Expected an integer from 0 to 1000");
  }
  if (record.retry_reason !== null) safeRef(record.retry_reason, `${target}.retry_reason`);
  if (typeof record.received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(record.received_at)
    || new Date(record.received_at).toISOString() !== record.received_at) {
    fail("received_at_invalid", `${target}.received_at`, "Expected canonical UTC milliseconds");
  }
  if (typeof record.workspace_id !== "string" || !WORKSPACE_ID_PATTERN.test(record.workspace_id)) {
    fail("workspace_id_invalid", `${target}.workspace_id`, "Expected a stable workspace ID");
  }
  if (typeof record.channel_id !== "string" || !/^[CGD][A-Z0-9]{2,31}$/u.test(record.channel_id)) {
    fail("channel_id_invalid", `${target}.channel_id`, "Expected a stable conversation ID");
  }
  if (!["project", "dm", "common", "unmapped"].includes(record.channel_kind)) {
    fail("channel_kind_invalid", `${target}.channel_kind`, "Unsupported channel classification");
  }
  for (const key of ["is_private", "is_shared", "is_ext_shared", "is_archived", "is_member"]) {
    boolean(record[key], `${target}.${key}`);
  }
  if (!Array.isArray(record.source_refs)) fail("source_refs_invalid", `${target}.source_refs`, "Expected an array");
  record.source_refs.forEach((sourceRef, sourceIndex) => safeRef(sourceRef, `${target}.source_refs[${sourceIndex}]`));
  if (new Set(record.source_refs).size !== record.source_refs.length) {
    fail("duplicate_source_ref", `${target}.source_refs`, "Source refs must be unique");
  }
  plainRecord(record.raw_event, `${target}.raw_event`);
  return record;
}

function fileHoldReason(rawEvent) {
  if ((Array.isArray(rawEvent.files) && rawEvent.files.length > 0)
    || (Array.isArray(rawEvent.attachments) && rawEvent.attachments.length > 0)) {
    return "file_bearing_event";
  }
  const stack = [rawEvent];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current)) {
      if (/(?:file_bytes|download_url|url_private|local_path|attachment_bytes)/iu.test(key)
        && value !== null && value !== "") {
        return "attachment_locator_or_bytes";
      }
      if (value !== null && typeof value === "object") stack.push(value);
    }
  }
  return null;
}

function classifyRecord(binding, record) {
  const reasons = [];
  if (record.is_private) reasons.push("private_channel");
  if (record.is_shared || record.is_ext_shared) reasons.push("slack_connect_or_shared");
  if (record.is_archived) reasons.push("archived_channel");
  if (!record.is_member) reasons.push("channel_not_joined");
  const fileReason = fileHoldReason(record.raw_event);
  if (fileReason !== null) reasons.push(fileReason);
  const scope = resolveSlackProjectScope({
    binding: {
      schema_version: "soulforge.slack_history.binding.v1",
      binding_id: binding.binding_id,
      binding_origin: "private",
      owner_approval_ref: binding.writer.authority_id,
      workspace_id: binding.workspace_id,
      channel_id: binding.channel_id,
      project_code: binding.project_code,
      effective_from: "1970-01-01T00:00:00.000Z",
      effective_to: null,
      allowed_exceptions: [],
    },
    channel: {
      workspace_id: record.workspace_id,
      channel_id: record.channel_id,
      channel_name: "redacted-channel",
      channel_kind: record.channel_kind,
      joined: record.is_member,
      allowlisted: record.workspace_id === binding.workspace_id
        && record.channel_id === binding.channel_id,
      archived: record.is_archived,
      slack_connect: record.is_shared || record.is_ext_shared,
      explicit_rule_ref: null,
    },
    occurred_at: record.received_at,
  });
  reasons.push(...scope.hold_reasons);
  return [...new Set(reasons)].sort();
}

function rawMessageShape(rawEvent, target) {
  if (rawEvent.type !== "message") {
    fail("unsupported_event_type", `${target}.type`, "Only Slack message events are supported");
  }
  const subtype = rawEvent.subtype ?? null;
  if (![null, "message_changed", "message_deleted", "tombstone"].includes(subtype)) {
    fail("unsupported_message_subtype", `${target}.subtype`, "Unsupported message subtype");
  }
  return subtype;
}

function latestRevisionFor(revisions, workspaceId, channelId, messageTs) {
  const identity = createSlackMessageIdentity({
    workspace_id: workspaceId,
    channel_id: channelId,
    message_ts: messageTs,
  });
  return revisions
    .filter((revision) => revision.message_ref === identity.message_ref)
    .sort((left, right) => left.revision_ts.localeCompare(right.revision_ts))
    .at(-1) ?? null;
}

function deliveryFromRecord(record, revisions) {
  const raw = record.raw_event;
  const subtype = rawMessageShape(raw, "$record.raw_event");
  let messageTs;
  let revisionTs;
  let threadTs;
  let user;
  let revisionKind;
  let sourceMetadataDigest;
  let supersedesRevisionRef = null;

  if (subtype === null) {
    messageTs = raw.ts;
    revisionTs = raw.ts;
    threadTs = raw.thread_ts ?? null;
    user = raw.user;
    revisionKind = threadTs === null || threadTs === messageTs ? "message" : "reply";
    if (revisionKind === "message") threadTs = null;
    sourceMetadataDigest = sha256Canonical(raw);
  } else if (subtype === "message_changed") {
    messageTs = raw.message?.ts;
    revisionTs = raw.message?.edited?.ts;
    threadTs = raw.message?.thread_ts ?? null;
    user = raw.message?.edited?.user ?? raw.message?.user;
    revisionKind = "edit";
    sourceMetadataDigest = sha256Canonical(raw);
  } else {
    messageTs = raw.deleted_ts;
    revisionTs = raw.event_ts;
    threadTs = raw.previous_message?.thread_ts ?? null;
    user = raw.user ?? raw.previous_message?.user;
    revisionKind = subtype === "tombstone" ? "tombstone" : "delete";
    sourceMetadataDigest = null;
  }

  if (subtype !== null) {
    const prior = latestRevisionFor(revisions, record.workspace_id, record.channel_id, messageTs);
    if (prior === null) {
      fail("prior_revision_required", "$record.raw_event", "Edit/delete/tombstone requires retained prior evidence");
    }
    supersedesRevisionRef = prior.revision_ref;
    if (threadTs === null) threadTs = prior.thread_ts;
  }
  const revisionInput = {
    revision_kind: revisionKind,
    workspace_id: record.workspace_id,
    channel_id: record.channel_id,
    message_ts: messageTs,
    thread_ts: threadTs,
    revision_ts: revisionTs,
    actor: {
      slack_user_id: user,
      erp_account_ref: null,
    },
    source_metadata_digest: sourceMetadataDigest,
    attachment_pointers: [],
    supersedes_revision_ref: supersedesRevisionRef,
  };
  const revision = createSlackRevision(revisionInput);
  revisions.push(revision);
  return {
    event_id: record.event_id,
    retry_num: record.retry_num,
    retry_reason: record.retry_reason,
    received_at: record.received_at,
    revision: revisionInput,
  };
}

function initialState(binding, bindingDigest) {
  return {
    schema_version: SLACK_CONTINUOUS_STATE_SCHEMA_VERSION,
    binding_digest: bindingDigest,
    writer_authority_id: binding.writer.authority_id,
    writer_epoch: binding.writer.epoch,
    provider_cursor_token: null,
    cursor: createSlackBackfillCursor({
      workspace_id: binding.workspace_id,
      channel_id: binding.channel_id,
      binding_id: binding.binding_id,
      window_start: "1970-01-01T00:00:00.000Z",
      window_end: "9999-12-31T23:59:59.999Z",
    }),
    revisions: [],
    custody_receipts: [],
    hold_receipts: [],
    page_evidence_receipts: [],
  };
}

function validateLoadedState(state, binding, bindingDigest) {
  plainRecord(state, "$state");
  if (state.schema_version !== SLACK_CONTINUOUS_STATE_SCHEMA_VERSION) {
    fail("state_schema_invalid", "$state.schema_version", "Unexpected state schema");
  }
  if (state.binding_digest !== bindingDigest) {
    fail("state_binding_fence", "$state.binding_digest", "State belongs to a different binding digest");
  }
  if (state.writer_authority_id !== binding.writer.authority_id
    || state.writer_epoch !== binding.writer.epoch) {
    fail("state_writer_fence", "$state.writer_epoch", "State belongs to another writer authority or epoch");
  }
  validateSlackBackfillCursor(state.cursor);
  if (!Array.isArray(state.revisions)
    || !Array.isArray(state.custody_receipts)
    || !Array.isArray(state.hold_receipts)
    || !Array.isArray(state.page_evidence_receipts)) {
    fail("state_collection_invalid", "$state", "State collections must be arrays");
  }
  validateHoldReceipts(
    state.hold_receipts,
    new Set(state.cursor.delivery_evidence.map((evidence) => evidence.event_id)),
  );
  validatePageEvidenceReceipts(state.page_evidence_receipts, state.cursor.accepted_pages);
  return state;
}

function assertWriterFence(binding, {
  expected_binding_digest: expectedBindingDigest,
  writer_authority_id: writerAuthorityId,
  writer_epoch: writerEpoch,
}) {
  const actualDigest = digestSlackContinuousBinding(binding);
  if (expectedBindingDigest !== actualDigest) {
    fail("binding_digest_fence", "$expected_binding_digest", "Apply requires the exact private binding digest");
  }
  if (writerAuthorityId !== binding.writer.authority_id || writerEpoch !== binding.writer.epoch) {
    fail("writer_authority_fence", "$writer", "Apply requires the exact writer authority and epoch");
  }
  return actualDigest;
}

function receiptKey(receipt) {
  return receipt.raw_digest;
}

function validateDigest(value, target) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail("digest_invalid", target, "Expected a sha256 digest");
  }
}

function validatePageEvidenceReceipt(receipt, target) {
  exactKeys(receipt, PAGE_EVIDENCE_RECEIPT_FIELDS, target);
  safeRef(receipt.page_id, `${target}.page_id`);
  validateDigest(receipt.page_evidence_digest, `${target}.page_evidence_digest`);
  return receipt;
}

function validatePageEvidenceReceipts(receipts, acceptedPages) {
  const expectedPageIds = new Set(acceptedPages.map((page) => page.page_id));
  const retainedPageIds = new Set();
  receipts.forEach((receipt, index) => {
    validatePageEvidenceReceipt(receipt, `$state.page_evidence_receipts[${index}]`);
    if (retainedPageIds.has(receipt.page_id)) {
      fail(
        "duplicate_page_evidence_receipt",
        `$state.page_evidence_receipts[${index}].page_id`,
        "Page evidence receipts must have unique page IDs",
      );
    }
    if (!expectedPageIds.has(receipt.page_id)) {
      fail(
        "page_evidence_coverage_mismatch",
        `$state.page_evidence_receipts[${index}].page_id`,
        "Page evidence receipt does not match an accepted page",
      );
    }
    retainedPageIds.add(receipt.page_id);
  });
  if (retainedPageIds.size !== expectedPageIds.size) {
    fail(
      "page_evidence_coverage_mismatch",
      "$state.page_evidence_receipts",
      "Every accepted page requires one immutable page evidence receipt",
    );
  }
}

function mergePageEvidenceReceipt(existingReceipts, newReceipt) {
  const byPageId = new Map(existingReceipts.map((receipt) => [receipt.page_id, receipt]));
  validatePageEvidenceReceipt(newReceipt, "$new_page_evidence_receipt");
  const retained = byPageId.get(newReceipt.page_id);
  if (retained !== undefined
    && retained.page_evidence_digest !== newReceipt.page_evidence_digest) {
    fail(
      "page_evidence_conflict",
      "$new_page_evidence_receipt",
      "An accepted page ID was replayed with different validated record evidence",
    );
  }
  if (retained === undefined) byPageId.set(newReceipt.page_id, newReceipt);
  return [...byPageId.values()].sort((left, right) => left.page_id.localeCompare(right.page_id));
}

function holdPageEventKey(receipt) {
  return `${receipt.page_id}\u0000${receipt.event_id}`;
}

function holdEventEvidenceDigest(receipt) {
  return sha256Canonical({
    event_id: receipt.event_id,
    retry_num: receipt.retry_num,
    retry_reason: receipt.retry_reason,
    received_at: receipt.received_at,
    raw_digest: receipt.raw_digest,
    hold_reasons: receipt.hold_reasons,
    source_refs: receipt.source_refs,
  });
}

function validateCanonicalSafeRefs(values, target, { required = false } = {}) {
  if (!Array.isArray(values) || Object.keys(values).length !== values.length
    || (required && values.length === 0)) {
    fail("canonical_ref_array_required", target, "Expected a dense canonical reference array");
  }
  values.forEach((value, index) => safeRef(value, `${target}[${index}]`));
  const canonical = [...new Set(values)].sort();
  if (canonical.length !== values.length
    || canonical.some((value, index) => value !== values[index])) {
    fail("canonical_ref_array_required", target, "References must be unique and canonically ordered");
  }
}

function validateHoldReceipt(receipt, target) {
  exactKeys(receipt, HOLD_RECEIPT_FIELDS, target);
  safeRef(receipt.page_id, `${target}.page_id`);
  safeRef(receipt.event_id, `${target}.event_id`);
  if (!Number.isSafeInteger(receipt.retry_num) || receipt.retry_num < 0 || receipt.retry_num > 1000) {
    fail("retry_num_invalid", `${target}.retry_num`, "Expected an integer from 0 to 1000");
  }
  if (receipt.retry_reason !== null) safeRef(receipt.retry_reason, `${target}.retry_reason`);
  if (typeof receipt.received_at !== "string" || !UTC_MILLISECONDS_PATTERN.test(receipt.received_at)
    || new Date(receipt.received_at).toISOString() !== receipt.received_at) {
    fail("received_at_invalid", `${target}.received_at`, "Expected canonical UTC milliseconds");
  }
  validateDigest(receipt.raw_digest, `${target}.raw_digest`);
  validateCanonicalSafeRefs(receipt.hold_reasons, `${target}.hold_reasons`, { required: true });
  validateCanonicalSafeRefs(receipt.source_refs, `${target}.source_refs`);
  return receipt;
}

function validateHoldReceipts(receipts, acceptedEventIds) {
  const byPageEvent = new Set();
  const byEvent = new Map();
  receipts.forEach((receipt, index) => {
    validateHoldReceipt(receipt, `$state.hold_receipts[${index}]`);
    const pageEventKey = holdPageEventKey(receipt);
    if (byPageEvent.has(pageEventKey)) {
      fail(
        "duplicate_hold_page_event",
        `$state.hold_receipts[${index}]`,
        "One page/event pair may have only one HOLD receipt",
      );
    }
    byPageEvent.add(pageEventKey);
    const evidenceDigest = holdEventEvidenceDigest(receipt);
    const retainedDigest = byEvent.get(receipt.event_id);
    if (retainedDigest !== undefined && retainedDigest !== evidenceDigest) {
      fail(
        "hold_event_id_conflict",
        `$state.hold_receipts[${index}].event_id`,
        "One held event_id cannot identify different metadata evidence",
      );
    }
    if (acceptedEventIds.has(receipt.event_id)) {
      fail(
        "hold_event_id_conflict",
        `$state.hold_receipts[${index}].event_id`,
        "One event_id cannot be both accepted and held",
      );
    }
    byEvent.set(receipt.event_id, evidenceDigest);
  });
}

function mergeHoldReceipts(existingReceipts, newReceipts, acceptedEventIds) {
  validateHoldReceipts(existingReceipts, acceptedEventIds);
  const byPageEvent = new Map(
    existingReceipts.map((receipt) => [holdPageEventKey(receipt), receipt]),
  );
  const evidenceByEvent = new Map(
    existingReceipts.map((receipt) => [receipt.event_id, holdEventEvidenceDigest(receipt)]),
  );
  newReceipts.forEach((receipt, index) => {
    validateHoldReceipt(receipt, `$new_hold_receipts[${index}]`);
    if (acceptedEventIds.has(receipt.event_id)) {
      fail(
        "hold_event_id_conflict",
        `$new_hold_receipts[${index}].event_id`,
        "One event_id cannot be both accepted and held",
      );
    }
    const evidenceDigest = holdEventEvidenceDigest(receipt);
    const retainedEventDigest = evidenceByEvent.get(receipt.event_id);
    if (retainedEventDigest !== undefined && retainedEventDigest !== evidenceDigest) {
      fail(
        "hold_event_id_conflict",
        `$new_hold_receipts[${index}].event_id`,
        "One held event_id cannot identify different metadata evidence",
      );
    }
    const pageEventKey = holdPageEventKey(receipt);
    const retainedReceipt = byPageEvent.get(pageEventKey);
    if (retainedReceipt !== undefined
      && sha256Canonical(retainedReceipt) !== sha256Canonical(receipt)) {
      fail(
        "hold_receipt_conflict",
        `$new_hold_receipts[${index}]`,
        "A held page/event pair was replayed with different metadata evidence",
      );
    }
    if (retainedReceipt === undefined) byPageEvent.set(pageEventKey, receipt);
    evidenceByEvent.set(receipt.event_id, evidenceDigest);
  });
  return [...byPageEvent.values()].sort(
    (left, right) => holdPageEventKey(left).localeCompare(holdPageEventKey(right)),
  );
}

export async function runSlackContinuousIngress({
  binding,
  expected_binding_digest: expectedBindingDigest,
  writer_authority_id: writerAuthorityId,
  writer_epoch: writerEpoch,
  transport,
  dry_run: dryRun = false,
  max_events: maxEvents = 100,
  test_fail_before_state_rename: failBeforeStateRename = false,
}) {
  validateSlackContinuousBinding(binding);
  if (transport === null || typeof transport !== "object" || typeof transport.pull !== "function") {
    fail("transport_invalid", "$transport", "Expected an injected pull transport");
  }
  if (transport.kind !== "synthetic") {
    fail("live_transport_feature_off", "$transport.kind", "Live Slack transport remains feature-OFF");
  }
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1000) {
    fail("max_events_invalid", "$max_events", "Expected an integer from 1 to 1000");
  }
  const bindingDigest = assertWriterFence(binding, {
    expected_binding_digest: expectedBindingDigest,
    writer_authority_id: writerAuthorityId,
    writer_epoch: writerEpoch,
  });

  let lease = null;
  try {
    let state;
    if (dryRun) {
      state = initialState(binding, bindingDigest);
    } else {
      lease = await acquireExclusiveLease({
        data_root: binding.data_root,
        binding_digest: bindingDigest,
        authority_id: writerAuthorityId,
        epoch: writerEpoch,
      });
      state = await readPrivateJson(binding.data_root, ["state", "slack-continuous.json"]);
      state = state === null
        ? initialState(binding, bindingDigest)
        : validateLoadedState(state, binding, bindingDigest);
    }

    const page = await transport.pull({
      cursor_token: state.provider_cursor_token,
      limit: maxEvents,
    });
    if (!Array.isArray(page.records)) {
      fail("transport_page_invalid", "$transport.page.records", "Transport page records must be an array");
    }
    const workingRevisions = structuredClone(state.revisions);
    const deliveries = [];
    const acceptedRecords = [];
    const newHoldReceipts = [];
    const validatedRecordEvidence = [];
    page.records.forEach((candidate, index) => {
      const record = validateRecord(candidate, index);
      const rawDigest = sha256Canonical(record.raw_event);
      const holdReasons = classifyRecord(binding, record);
      validatedRecordEvidence.push({
        event_id: record.event_id,
        retry_num: record.retry_num,
        retry_reason: record.retry_reason,
        received_at: record.received_at,
        workspace_id: record.workspace_id,
        channel_id: record.channel_id,
        channel_kind: record.channel_kind,
        is_private: record.is_private,
        is_shared: record.is_shared,
        is_ext_shared: record.is_ext_shared,
        is_archived: record.is_archived,
        is_member: record.is_member,
        source_refs: [...record.source_refs].sort(),
        raw_digest: rawDigest,
        disposition: holdReasons.length > 0 ? "hold" : "accepted",
        hold_reasons: holdReasons,
      });
      if (holdReasons.length > 0) {
        newHoldReceipts.push({
          page_id: page.page_id,
          event_id: record.event_id,
          retry_num: record.retry_num,
          retry_reason: record.retry_reason,
          received_at: record.received_at,
          raw_digest: rawDigest,
          hold_reasons: holdReasons,
          source_refs: [...record.source_refs].sort(),
        });
        return;
      }
      deliveries.push(deliveryFromRecord(record, workingRevisions));
      acceptedRecords.push({ record, raw_digest: rawDigest });
    });

    const mergedPageEvidenceReceipts = mergePageEvidenceReceipt(
      state.page_evidence_receipts,
      {
        page_id: page.page_id,
        page_evidence_digest: sha256Canonical(validatedRecordEvidence),
      },
    );
    const acceptedEventIds = new Set([
      ...state.cursor.delivery_evidence.map((evidence) => evidence.event_id),
      ...deliveries.map((delivery) => delivery.event_id),
    ]);
    const mergedHoldReceipts = mergeHoldReceipts(
      state.hold_receipts,
      newHoldReceipts,
      acceptedEventIds,
    );

    const applied = applyBoundedSlackBackfill({
      cursor: state.cursor,
      pages: [{
        page_id: page.page_id,
        previous_cursor_digest: page.previous_cursor_digest,
        next_cursor_digest: page.next_cursor_digest,
        deliveries,
      }],
      existing_revisions: state.revisions,
      max_pages: 1,
      max_events: Math.max(1, maxEvents),
    });
    validatePageEvidenceReceipts(mergedPageEvidenceReceipts, applied.cursor.accepted_pages);

    const newCustodyReceipts = [];
    if (!dryRun && applied.processed_pages === 1) {
      for (const accepted of acceptedRecords) {
        const custody = await writeRawEventToCustody({
          data_root: binding.data_root,
          raw_event: accepted.record.raw_event,
        });
        if (custody.raw_digest !== accepted.raw_digest) {
          fail("raw_digest_mismatch", "$custody", "Custody digest differs from normalized raw digest");
        }
        newCustodyReceipts.push({
          raw_digest: custody.raw_digest,
          raw_ref: custody.raw_ref,
          source_refs: [...accepted.record.source_refs].sort(),
        });
      }
    } else if (dryRun) {
      newCustodyReceipts.push(...acceptedRecords.map((accepted) => ({
        raw_digest: accepted.raw_digest,
        raw_ref: `slack-raw:${accepted.raw_digest.slice("sha256:".length)}`,
        source_refs: [...accepted.record.source_refs].sort(),
      })));
    }

    const custodyByKey = new Map(state.custody_receipts.map((receipt) => [receiptKey(receipt), receipt]));
    newCustodyReceipts.forEach((receipt) => custodyByKey.set(receiptKey(receipt), receipt));
    const nextState = {
      ...state,
      provider_cursor_token: applied.processed_pages === 1
        ? page.next_cursor_token
        : state.provider_cursor_token,
      cursor: applied.cursor,
      revisions: applied.revisions,
      custody_receipts: [...custodyByKey.values()].sort((left, right) => receiptKey(left).localeCompare(receiptKey(right))),
      hold_receipts: mergedHoldReceipts,
      page_evidence_receipts: mergedPageEvidenceReceipts,
    };
    const stateDigest = sha256Canonical(nextState);
    if (!dryRun && applied.processed_pages === 1) {
      await atomicWritePrivateJson(
        binding.data_root,
        ["state", "slack-continuous.json"],
        nextState,
        { fail_before_rename: failBeforeStateRename },
      );
    }
    return {
      mode: dryRun ? "dry_run" : "apply",
      feature_status: "OFF",
      binding_digest: bindingDigest,
      state_digest: stateDigest,
      pulled_count: page.records.length,
      accepted_count: acceptedRecords.length,
      held_count: newHoldReceipts.length,
      processed_pages: applied.processed_pages,
      replayed_pages: applied.replayed_pages,
      revision_count: applied.revisions.length,
      repository_writes: 0,
      private_writes: dryRun
        ? 0
        : newCustodyReceipts.length + (applied.processed_pages === 1 ? 1 : 0),
      network_used: false,
    };
  } finally {
    await lease?.release();
  }
}
