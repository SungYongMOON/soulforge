import { Buffer } from "node:buffer";

import {
  canonicalJson,
  computeMetadataDigest,
  createProjectHistoryCoverageReceipt,
  createProjectHistoryEnvelope,
  sha256Canonical,
  validateProjectHistoryCoverageReceipt,
  validateProjectHistoryEnvelope,
  validateTypedRef,
} from "../shared/project_history_envelope.mjs";
import { validateWorkflowReceipt } from "../workflow_runner/contract.mjs";

export const RUN_HISTORY_FEATURE_ENABLED = false;
export const REPORT_AUTHORING_INPUT_SCHEMA_VERSION = "soulforge.run_history_report_authoring_input.v1";
export const REPORT_AUTHORING_EVENT_SCHEMA_VERSION = "soulforge.run_history_report_authoring_event.v1";
export const RUN_HISTORY_REPLAY_RECEIPT_SCHEMA_VERSION = "soulforge.run_history_replay_receipt.v1";
export const RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION = "soulforge.run_history_coverage_evidence.v1";

export const REPORT_AUTHORING_WORKFLOW_REF = Object.freeze({
  entity_type: "workflow",
  owner_surface: "report_authoring_v0",
  entity_id: "workflow:report_authoring_v0",
});
export const REPORT_AUTHORING_RECEIPT_SCHEMA_REF = Object.freeze({
  entity_type: "schema_revision",
  owner_surface: "report_authoring_v0",
  entity_id: "schema:workflow_receipt.v1",
});
export const REPORT_AUTHORING_RECEIPT_VALIDATOR_REF = Object.freeze({
  entity_type: "validator",
  owner_surface: "report_authoring_v0",
  entity_id: "validator:validateWorkflowReceipt",
});
export const REPORT_AUTHORING_SOURCE_OWNER_REF = Object.freeze({
  entity_type: "source_owner",
  owner_surface: "report_authoring_v0",
  entity_id: "workflow:report_authoring_v0",
});

const INPUT_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "workflow_ref",
  "receipt_schema_ref",
  "receipt_validator_ref",
  "receipt_ref",
  "event_ref",
  "receipt",
  "project_ref",
  "observed_at",
  "known_at",
  "recorded_at",
]);
const EVENT_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "job_id",
  "workflow_ref",
  "receipt_schema_ref",
  "receipt_validator_ref",
  "receipt_ref",
  "full_receipt_digest",
  "envelope",
  "metadata_digest",
  "raw_payload_copied",
]);
const COVERAGE_INPUT_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "coverage_policy_ref",
  "lane",
  "source_owner_ref",
  "project_ref",
  "window_start",
  "window_end",
  "state",
  "event_count",
  "gap_codes",
  "applicability_ref",
]);
const COVERAGE_EVIDENCE_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "coverage_policy_ref",
  "coverage_receipt",
  "metadata_digest",
  "raw_payload_copied",
]);
const REPLAY_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "feature_enabled",
  "added_count",
  "replayed_count",
  "deduped_job_refs",
  "ordered_event_digest",
  "metadata_digest",
  "raw_payload_copied",
]);

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RAW_OR_LOG_HINT = /(?:^|[:._-])(?:raw(?:[_-]?(?:body|log|payload))?|stage[_-]?log|transcript|task[_-]?chat|full[_-]?conversation|conversation[_-]?(?:body|text)|message[_-]?body|screen[_-]?capture|keystroke)(?:$|[:._-])/iu;
const SECRET_HINT = /(?:^|[:._=\s-])(?:secret|password|passwd|credential|access[_-]?token|refresh[_-]?token|api[_-]?key)(?:$|[:._=\s-])/iu;
const SECRET_VALUE = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u;
const WINDOWS_ABSOLUTE_PATH = /(?:^|[\s"'=])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+)/u;
const POSIX_ABSOLUTE_PATH = /(?:^|[\s"'=])\/(?:Users|Volumes|home|root|var|tmp|mnt|srv|opt|etc|private)(?:\/|$)/u;
const PATH_OR_RECURSION_HINT = /(?:file:\/\/|(?:^|[:._-])(?:_workspaces|_workmeta|runs)[\\/]|runs[\\/]\*{1,2})/iu;

export class RunHistoryError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "RunHistoryError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new RunHistoryError(code, path, message);
}

function exactObject(value, fields, path) {
  try {
    canonicalJson(value);
  } catch (error) {
    fail("canonical_value_invalid", path, error.message);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const allowed = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail("missing_field", `${path}.${field}`, "Required field is missing");
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail("extra_field", `${path}.${field}`, "Unknown field is not allowed");
  }
  return value;
}

function refsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertExactRef(actual, expected, path) {
  validateTypedRef(actual, expected.entity_type, path);
  if (!refsEqual(actual, expected)) fail("typed_ref_binding_mismatch", path, "Typed ref is outside the exact report-authoring allowlist");
  return actual;
}

function validateBoundaryString(value, path) {
  if (RAW_OR_LOG_HINT.test(value)) fail("raw_or_log_ref_forbidden", path, "Raw, stage-log, transcript, or task-chat hints are forbidden");
  if (SECRET_HINT.test(value) || SECRET_VALUE.test(value)) fail("secret_ref_forbidden", path, "Secret or credential hints are forbidden");
  if (WINDOWS_ABSOLUTE_PATH.test(value) || POSIX_ABSOLUTE_PATH.test(value) || PATH_OR_RECURSION_HINT.test(value)) {
    fail("path_ref_forbidden", path, "Absolute, workspace, run-directory, and recursive paths are forbidden");
  }
}

function validateBoundaryStrings(value, path = "$") {
  if (typeof value === "string") {
    validateBoundaryString(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateBoundaryStrings(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) validateBoundaryStrings(entry, `${path}.${key}`);
  }
}

function validateFeatureOff(value, path) {
  if (value !== false) fail("feature_must_remain_off", path, "Run-history activation is not authorized");
}

function validateJobId(value, path) {
  if (typeof value !== "string" || !JOB_ID.test(value)) fail("job_id_invalid", path, "Invalid report-authoring job_id");
  return value;
}

function validateDigest(value, path) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail("digest_invalid", path, "Expected sha256:<64 lowercase hex>");
  return value;
}

function reportAuthoringJobRef(jobId) {
  return {
    entity_type: "workflow_job",
    owner_surface: "report_authoring_v0",
    entity_id: `job:${jobId}`,
  };
}

function expectedReceiptRef(jobId) {
  return {
    entity_type: "workflow_receipt",
    owner_surface: "report_authoring_v0",
    entity_id: `receipt:${jobId}`,
  };
}

function expectedEventRef(jobId) {
  return {
    entity_type: "event",
    owner_surface: "report_authoring_v0",
    entity_id: `receipt_event:${jobId}`,
  };
}

function validateProjectRef(value, path) {
  if (value === null) return null;
  return validateTypedRef(value, "project", path);
}

function validateReportAuthoringReceipt(receipt) {
  if (receipt?.schema?.includes?.("five_field")) {
    fail("five_field_native_occurrence_ineligible", "$input.receipt.schema", "Five-field records are not eligible native run occurrences");
  }
  if (receipt?.schema !== "soulforge.workflow_receipt.v1"
    || receipt?.workflow_id !== "report_authoring_v0"
    || receipt?.binding_revision !== "report_authoring_v0.binding.v1") {
    fail("run_schema_not_allowed", "$input.receipt", "Only the exact report_authoring_v0 workflow receipt is allowed");
  }
  try {
    validateWorkflowReceipt(receipt);
  } catch (error) {
    fail("report_authoring_receipt_invalid", "$input.receipt", error.code ?? error.message);
  }
  validateBoundaryStrings(receipt, "$input.receipt");
  return receipt;
}

export function validateReportAuthoringRunEvent(value) {
  exactObject(value, EVENT_FIELDS, "$event");
  if (value.schema_version !== REPORT_AUTHORING_EVENT_SCHEMA_VERSION) {
    fail("event_schema_invalid", "$event.schema_version", "Unexpected run-history event schema");
  }
  validateFeatureOff(value.feature_enabled, "$event.feature_enabled");
  validateJobId(value.job_id, "$event.job_id");
  assertExactRef(value.workflow_ref, REPORT_AUTHORING_WORKFLOW_REF, "$event.workflow_ref");
  assertExactRef(value.receipt_schema_ref, REPORT_AUTHORING_RECEIPT_SCHEMA_REF, "$event.receipt_schema_ref");
  assertExactRef(value.receipt_validator_ref, REPORT_AUTHORING_RECEIPT_VALIDATOR_REF, "$event.receipt_validator_ref");
  assertExactRef(value.receipt_ref, expectedReceiptRef(value.job_id), "$event.receipt_ref");
  validateDigest(value.full_receipt_digest, "$event.full_receipt_digest");
  validateProjectHistoryEnvelope(value.envelope);
  if (value.envelope.lane !== "run_log") fail("lane_mismatch", "$event.envelope.lane", "Report-authoring receipts belong only to run_log");
  assertExactRef(value.envelope.source_owner_ref, REPORT_AUTHORING_SOURCE_OWNER_REF, "$event.envelope.source_owner_ref");
  assertExactRef(value.envelope.native_occurrence_ref, reportAuthoringJobRef(value.job_id), "$event.envelope.native_occurrence_ref");
  assertExactRef(value.envelope.event_ref, expectedEventRef(value.job_id), "$event.envelope.event_ref");
  if (value.envelope.content_ref?.entity_id !== value.full_receipt_digest) {
    fail("receipt_digest_binding_mismatch", "$event.envelope.content_ref", "Content ref must bind the full canonical receipt digest");
  }
  const expectedRevision = {
    entity_type: "source_revision",
    owner_surface: "report_authoring_v0",
    entity_id: `revision:${value.full_receipt_digest}`,
  };
  assertExactRef(value.envelope.source_revision_ref, expectedRevision, "$event.envelope.source_revision_ref");
  if (value.raw_payload_copied !== false) fail("raw_payload_copied_must_be_false", "$event.raw_payload_copied", "Raw payload copying is forbidden");
  validateDigest(value.metadata_digest, "$event.metadata_digest");
  if (computeMetadataDigest(value) !== value.metadata_digest) {
    fail("metadata_digest_mismatch", "$event.metadata_digest", "Event metadata digest does not match");
  }
  validateBoundaryStrings(value, "$event");
  return value;
}

export function adaptReportAuthoringReceipt(input) {
  exactObject(input, INPUT_FIELDS, "$input");
  if (input.schema_version !== REPORT_AUTHORING_INPUT_SCHEMA_VERSION) {
    fail("input_schema_invalid", "$input.schema_version", "Unexpected adapter input schema");
  }
  validateFeatureOff(input.feature_enabled, "$input.feature_enabled");
  assertExactRef(input.workflow_ref, REPORT_AUTHORING_WORKFLOW_REF, "$input.workflow_ref");
  assertExactRef(input.receipt_schema_ref, REPORT_AUTHORING_RECEIPT_SCHEMA_REF, "$input.receipt_schema_ref");
  assertExactRef(input.receipt_validator_ref, REPORT_AUTHORING_RECEIPT_VALIDATOR_REF, "$input.receipt_validator_ref");
  validateReportAuthoringReceipt(input.receipt);
  const jobId = validateJobId(input.receipt.job_id, "$input.receipt.job_id");
  assertExactRef(input.receipt_ref, expectedReceiptRef(jobId), "$input.receipt_ref");
  assertExactRef(input.event_ref, expectedEventRef(jobId), "$input.event_ref");
  validateProjectRef(input.project_ref, "$input.project_ref");
  validateBoundaryStrings(input, "$input");

  const fullReceiptDigest = sha256Canonical(input.receipt);
  const classification = input.project_ref === null
    ? { state: "unclassified", project_ref: null }
    : { state: "classified", project_ref: input.project_ref };
  const envelope = createProjectHistoryEnvelope({
    lane: "run_log",
    source_owner_ref: REPORT_AUTHORING_SOURCE_OWNER_REF,
    native_occurrence_ref: reportAuthoringJobRef(jobId),
    event_ref: input.event_ref,
    source_revision_ref: {
      entity_type: "source_revision",
      owner_surface: "report_authoring_v0",
      entity_id: `revision:${fullReceiptDigest}`,
    },
    content_ref: {
      entity_type: "content",
      owner_surface: "report_authoring_v0",
      entity_id: fullReceiptDigest,
    },
    project_ref: input.project_ref,
    event_at: input.receipt.completed_at,
    valid_at: input.receipt.completed_at,
    observed_at: input.observed_at,
    known_at: input.known_at,
    recorded_at: input.recorded_at,
    classification_before: null,
    classification_after: classification,
    supersedes_event_ref: null,
  });

  const event = {
    schema_version: REPORT_AUTHORING_EVENT_SCHEMA_VERSION,
    feature_enabled: false,
    job_id: jobId,
    workflow_ref: REPORT_AUTHORING_WORKFLOW_REF,
    receipt_schema_ref: REPORT_AUTHORING_RECEIPT_SCHEMA_REF,
    receipt_validator_ref: REPORT_AUTHORING_RECEIPT_VALIDATOR_REF,
    receipt_ref: input.receipt_ref,
    full_receipt_digest: fullReceiptDigest,
    envelope,
    metadata_digest: "",
    raw_payload_copied: false,
  };
  event.metadata_digest = computeMetadataDigest(event);
  return validateReportAuthoringRunEvent(event);
}

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sortedEvents(events) {
  return [...events].sort((left, right) => {
    let result = utf8Compare(left.job_id, right.job_id);
    if (result !== 0) return result;
    result = utf8Compare(left.envelope.known_at, right.envelope.known_at);
    if (result !== 0) return result;
    return utf8Compare(left.metadata_digest, right.metadata_digest);
  });
}

function validateEventArray(value, path) {
  if (!Array.isArray(value)) fail("array_required", path, "Expected an event array");
  value.forEach((event) => validateReportAuthoringRunEvent(event));
  return value;
}

export function replayRunHistoryEvents(currentEvents, incomingEvents) {
  validateEventArray(currentEvents, "$current_events");
  validateEventArray(incomingEvents, "$incoming_events");
  const byJobId = new Map();
  const byEventRef = new Map();
  const events = [];

  function adopt(event, incoming, counters) {
    const previous = byJobId.get(event.job_id);
    if (previous) {
      if (previous.full_receipt_digest !== event.full_receipt_digest) {
        fail("job_id_immutable_conflict", "$incoming_events", "The same job_id has a different full receipt digest");
      }
      if (previous.metadata_digest !== event.metadata_digest) {
        fail("job_event_conflict", "$incoming_events", "The same job_id reused different immutable event metadata");
      }
      if (incoming) counters.replayed += 1;
      return;
    }
    const eventKey = canonicalJson(event.envelope.event_ref);
    if (byEventRef.has(eventKey)) fail("event_ref_conflict", "$incoming_events", "One event_ref cannot identify multiple jobs");
    byJobId.set(event.job_id, event);
    byEventRef.set(eventKey, event);
    events.push(event);
    if (incoming) counters.added += 1;
  }

  const counters = { added: 0, replayed: 0 };
  currentEvents.forEach((event) => adopt(event, false, counters));
  incomingEvents.forEach((event) => adopt(event, true, counters));
  const ordered = sortedEvents(events);
  const dedupedJobRefs = incomingEvents
    .filter((event, index) => incomingEvents.findIndex((candidate) => candidate.job_id === event.job_id) < index
      || currentEvents.some((candidate) => candidate.job_id === event.job_id))
    .map((event) => reportAuthoringJobRef(event.job_id))
    .sort((left, right) => utf8Compare(canonicalJson(left), canonicalJson(right)));
  const uniqueDedupedJobRefs = dedupedJobRefs.filter((ref, index) => (
    index === 0 || canonicalJson(ref) !== canonicalJson(dedupedJobRefs[index - 1])
  ));
  const receipt = {
    schema_version: RUN_HISTORY_REPLAY_RECEIPT_SCHEMA_VERSION,
    feature_enabled: false,
    added_count: counters.added,
    replayed_count: counters.replayed,
    deduped_job_refs: uniqueDedupedJobRefs,
    ordered_event_digest: sha256Canonical(ordered.map((event) => event.metadata_digest)),
    metadata_digest: "",
    raw_payload_copied: false,
  };
  receipt.metadata_digest = computeMetadataDigest(receipt);
  validateRunHistoryReplayReceipt(receipt);
  return { events: ordered, receipt };
}

export function validateRunHistoryReplayReceipt(value) {
  exactObject(value, REPLAY_RECEIPT_FIELDS, "$replay_receipt");
  if (value.schema_version !== RUN_HISTORY_REPLAY_RECEIPT_SCHEMA_VERSION) {
    fail("replay_receipt_schema_invalid", "$replay_receipt.schema_version", "Unexpected replay receipt schema");
  }
  validateFeatureOff(value.feature_enabled, "$replay_receipt.feature_enabled");
  for (const field of ["added_count", "replayed_count"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      fail("replay_count_invalid", `$replay_receipt.${field}`, "Replay counts must be nonnegative safe integers");
    }
  }
  if (!Array.isArray(value.deduped_job_refs)) fail("array_required", "$replay_receipt.deduped_job_refs", "Expected an array");
  let previous = null;
  const seen = new Set();
  value.deduped_job_refs.forEach((ref, index) => {
    validateTypedRef(ref, "workflow_job", `$replay_receipt.deduped_job_refs[${index}]`);
    if (ref.owner_surface !== "report_authoring_v0") {
      fail("typed_ref_binding_mismatch", `$replay_receipt.deduped_job_refs[${index}]`, "Unexpected workflow job owner");
    }
    if (!ref.entity_id.startsWith("job:") || !JOB_ID.test(ref.entity_id.slice("job:".length))) {
      fail("dedupe_job_ref_invalid", `$replay_receipt.deduped_job_refs[${index}]`, "Dedupe ref must bind an exact report-authoring job_id");
    }
    const canonical = canonicalJson(ref);
    if (seen.has(canonical)) fail("dedupe_ref_duplicate", "$replay_receipt.deduped_job_refs", "Dedupe refs must be unique");
    if (previous !== null && utf8Compare(previous, canonical) > 0) {
      fail("dedupe_refs_not_ordered", "$replay_receipt.deduped_job_refs", "Dedupe refs must use canonical UTF-8 order");
    }
    seen.add(canonical);
    previous = canonical;
  });
  if ((value.replayed_count === 0) !== (value.deduped_job_refs.length === 0)) {
    fail("dedupe_count_mismatch", "$replay_receipt", "Replay count and deduped job refs must agree");
  }
  validateDigest(value.ordered_event_digest, "$replay_receipt.ordered_event_digest");
  validateDigest(value.metadata_digest, "$replay_receipt.metadata_digest");
  if (value.raw_payload_copied !== false) fail("raw_payload_copied_must_be_false", "$replay_receipt.raw_payload_copied", "Raw payload copying is forbidden");
  if (computeMetadataDigest(value) !== value.metadata_digest) {
    fail("metadata_digest_mismatch", "$replay_receipt.metadata_digest", "Replay receipt metadata digest does not match");
  }
  return value;
}

export function createRunHistoryCoverageEvidence(input, runEvents = []) {
  exactObject(input, COVERAGE_INPUT_FIELDS, "$coverage_input");
  if (input.schema_version !== RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION) {
    fail("coverage_input_schema_invalid", "$coverage_input.schema_version", "Unexpected coverage evidence schema");
  }
  validateFeatureOff(input.feature_enabled, "$coverage_input.feature_enabled");
  validateTypedRef(input.coverage_policy_ref, "rule_revision", "$coverage_input.coverage_policy_ref");
  if (input.lane !== "run_log") fail("lane_mismatch", "$coverage_input.lane", "Coverage evidence is run_log only");
  assertExactRef(input.source_owner_ref, REPORT_AUTHORING_SOURCE_OWNER_REF, "$coverage_input.source_owner_ref");
  validateProjectRef(input.project_ref, "$coverage_input.project_ref");
  validateEventArray(runEvents, "$run_events");
  const envelopes = runEvents.map((event) => event.envelope);
  const coverageReceipt = createProjectHistoryCoverageReceipt({
    lane: input.lane,
    source_owner_ref: input.source_owner_ref,
    project_ref: input.project_ref,
    window_start: input.window_start,
    window_end: input.window_end,
    state: input.state,
    event_count: input.event_count,
    gap_codes: input.gap_codes,
    applicability_ref: input.applicability_ref,
  }, envelopes);
  const evidence = {
    schema_version: RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION,
    feature_enabled: false,
    coverage_policy_ref: input.coverage_policy_ref,
    coverage_receipt: coverageReceipt,
    metadata_digest: "",
    raw_payload_copied: false,
  };
  evidence.metadata_digest = computeMetadataDigest(evidence);
  return validateRunHistoryCoverageEvidence(evidence, runEvents);
}

export function validateRunHistoryCoverageEvidence(value, runEvents = []) {
  exactObject(value, COVERAGE_EVIDENCE_FIELDS, "$coverage_evidence");
  if (value.schema_version !== RUN_HISTORY_COVERAGE_EVIDENCE_SCHEMA_VERSION) {
    fail("coverage_evidence_schema_invalid", "$coverage_evidence.schema_version", "Unexpected coverage evidence schema");
  }
  validateFeatureOff(value.feature_enabled, "$coverage_evidence.feature_enabled");
  validateTypedRef(value.coverage_policy_ref, "rule_revision", "$coverage_evidence.coverage_policy_ref");
  validateEventArray(runEvents, "$run_events");
  validateProjectHistoryCoverageReceipt(value.coverage_receipt, runEvents.map((event) => event.envelope));
  if (value.coverage_receipt.lane !== "run_log") fail("lane_mismatch", "$coverage_evidence.coverage_receipt.lane", "Coverage evidence is run_log only");
  assertExactRef(value.coverage_receipt.source_owner_ref, REPORT_AUTHORING_SOURCE_OWNER_REF, "$coverage_evidence.coverage_receipt.source_owner_ref");
  if (value.raw_payload_copied !== false) fail("raw_payload_copied_must_be_false", "$coverage_evidence.raw_payload_copied", "Raw payload copying is forbidden");
  validateDigest(value.metadata_digest, "$coverage_evidence.metadata_digest");
  if (computeMetadataDigest(value) !== value.metadata_digest) {
    fail("metadata_digest_mismatch", "$coverage_evidence.metadata_digest", "Coverage evidence metadata digest does not match");
  }
  validateBoundaryStrings(value, "$coverage_evidence");
  return value;
}
