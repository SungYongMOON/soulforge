import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

import { comparablePathIdentity } from "./physical_path_identity.mjs";
import {
  PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION,
  PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION,
  PROJECT_HISTORY_LANES,
  canonicalJson,
  createProjectHistoryCoverageReceipt,
  createProjectHistoryEnvelope,
  sha256Canonical,
  sortProjectHistoryEnvelopes,
  validateProjectHistoryCoverageReceipt,
  validateProjectHistoryEnvelopeCollection,
  validateTypedRef,
} from "./project_history_envelope.mjs";
import {
  ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE,
  ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE,
} from "./project_history_actual_shadow.mjs";

export const PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION =
  "soulforge.project_history_receipt_adapter_request.v2";
export const PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION =
  "soulforge.project_history_receipt_adapter_generation.v2";
export const PROJECT_HISTORY_RECEIPT_SOURCE_ATTESTATION_SCHEMA_VERSION =
  "soulforge.project_history_receipt_source_attestation.v2";
export const PROJECT_HISTORY_WRITER_AUTHORITY_ATTESTATION_SCHEMA_VERSION =
  "soulforge.project_history_writer_authority_attestation.v2";
export const PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION =
  "soulforge.project_history_shadow_adapter_authority_record.v1";
export const STAGING_RECEIPT_SCHEMA_VERSION = "soulforge.ingress.staging_receipt.v1";
export const VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION = "soulforge.voice.copy_only_receipt.v1";

// v1 envelopes and coverage receipts are exact-field contracts. Authority is
// therefore carried by immutable source rows and this separate generation-bound
// attestation instead of adding fields that would weaken those contracts.
export const PROJECT_HISTORY_RECEIPT_ADAPTER_V2_EXPORT_CONTRACT = Object.freeze({
  envelope_schema_version: PROJECT_HISTORY_ENVELOPE_SCHEMA_VERSION,
  coverage_schema_version: PROJECT_HISTORY_COVERAGE_RECEIPT_SCHEMA_VERSION,
  authority_binding: "separate_immutable_attestation",
  authority_source: "externally_pinned_private_shadow_adapter_record",
  source_attestation_carries_authority: true,
  event_and_coverage_authority_rows: true,
  shadow_only: true,
  raw_payload_copied: false,
  accepted_history: false,
  raw_ingress_authority_reused: false,
  classification_epoch_implemented: false,
  projector_epoch_implemented: false,
  live_authority_claim: "none_for_pure_generation_validation",
  pure_generation_validation_grants_live_authority: false,
});

const REQUEST_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "generation_id",
  "generated_at",
  "receipt_root",
  "project_ref",
  "window_start",
  "window_end",
  "classification_state",
  "required_writer_epoch",
  "writer_authority",
  "coverage",
  "occurrences",
  "raw_payload_copied",
  "accepted_history",
]);
const WRITER_AUTHORITY_FIELDS = Object.freeze([
  "epoch",
  "digest",
  "node_id",
  "issued_at",
  "expires_at",
  "revoked",
]);
const REQUEST_COVERAGE_FIELDS = Object.freeze([
  "lane",
  "source_owner_ref",
  "project_ref",
  "state",
  "gap_codes",
]);
const REQUEST_OCCURRENCE_FIELDS = Object.freeze([
  "lane",
  "project_ref",
  "receipt_path",
  "expected_receipt_digest",
  "custody_receipt_ref",
  "source_owner_ref",
  "native_occurrence_ref",
  "event_ref",
  "source_revision_ref",
  "content_ref",
  "event_at",
  "valid_at",
  "observed_at",
  "known_at",
  "recorded_at",
  "classification_evidence_ref",
]);
const STAGING_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "lane",
  "source_owner_ref",
  "source_key",
  "source_identity_digest",
  "sha256",
  "size",
  "storage_ref",
  "checkpoint_ref",
  "project_state",
  "source_deleted",
  "source_overwritten",
]);
const VOICE_RECEIPT_FIELDS = Object.freeze([
  "schema_version",
  "receipt_id",
  "captured_at",
  "source_owner_ref",
  "source_key",
  "sha256",
  "size",
  "source_mtime_ms",
  "custody_kind",
  "storage_ref",
  "project_state",
  "source_deleted",
  "source_overwritten",
]);
const SOURCE_ATTESTATION_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "lane",
  "custody_lane",
  "project_ref",
  "source_owner_ref",
  "native_occurrence_ref",
  "event_ref",
  "classification_evidence_ref",
  "custody_receipt_ref",
  "receipt_schema_version",
  "receipt_normalization",
  "receipt_digest",
  "receipt_locator_digest",
  "source_identity_digest",
  "source_digest",
  "source_size",
  "project_state",
  "source_deleted",
  "source_overwritten",
  "writer_epoch",
  "writer_authority_digest",
  "writer_node_id",
  "raw_payload_copied",
  "attestation_digest",
]);
const EVENT_AUTHORITY_FIELDS = Object.freeze([
  "lane",
  "event_ref",
  "event_metadata_digest",
  "source_attestation_digest",
  "writer_epoch",
  "writer_authority_digest",
  "writer_node_id",
]);
const COVERAGE_AUTHORITY_FIELDS = Object.freeze([
  "lane",
  "coverage_metadata_digest",
  "writer_epoch",
  "writer_authority_digest",
  "writer_node_id",
]);
const AUTHORITY_ATTESTATION_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "project_ref",
  "generation_binding_digest",
  "authority_scope",
  "classification_epoch",
  "projector_epoch",
  "production_authority_granted",
  "raw_ingress_authority_reused",
  "writer_epoch",
  "writer_authority_digest",
  "writer_node_id",
  "issued_at",
  "expires_at",
  "event_metadata",
  "coverage_metadata",
  "raw_payload_copied",
  "accepted_history",
  "attestation_digest",
]);
const SHADOW_ADAPTER_AUTHORITY_RECORD_FIELDS = Object.freeze([
  "schema_version",
  "authority_scope",
  "feature_state",
  "classification_state",
  "epoch",
  "node_id",
  "not_before",
  "expires_at",
  "revoked",
  "owner_approval_ref",
  "classification_epoch",
  "projector_epoch",
  "production_authority_granted",
  "raw_ingress_authority_reused",
  "accepted_history",
]);
const GENERATION_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "generated_at",
  "project_ref",
  "classification_state",
  "envelopes",
  "coverage_receipts",
  "source_attestations",
  "source_attestation_digest",
  "authority_attestation",
  "ordered_event_digest",
  "request_digest",
  "generation_digest",
  "raw_payload_copied",
  "accepted_history",
]);

const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const BARE_DIGEST = /^[0-9a-f]{64}$/u;
const SAFE_SOURCE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const GAP_CODE = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_SHADOW_AUTHORITY_BYTES = 64 * 1024;
const SHADOW_AUTHORITY_SNAPSHOT_SCHEMA_VERSION =
  "soulforge.project_history_shadow_adapter_authority_snapshot.v1";
const SHADOW_AUTHORITY_PUBLICATION_LOCK_SPEC_SCHEMA_VERSION =
  "soulforge.project_history_shadow_adapter_authority_publication_lock_spec.v1";
const shadowAuthoritySnapshotState = new WeakMap();
const COVERAGE_STATES = Object.freeze([
  "complete_with_events",
  "complete_no_events",
  "partial",
  "not_collected",
]);
const FORBIDDEN_REQUEST_FIELD_TOKENS = new Set([
  "body",
  "secret",
  "password",
  "credential",
  "cookie",
  "transcript",
  "payload",
  "token",
]);
const AUTHORITY_TUPLE_FIELDS = Object.freeze([
  "writer_epoch",
  "writer_authority_digest",
  "writer_node_id",
]);

export class ProjectHistoryReceiptAdapterV2Error extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryReceiptAdapterV2Error";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryReceiptAdapterV2Error(code, path, message);
}

function exactKeys(value, fields, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("exact_fields_required", path, "Fields do not match the v2 contract");
  }
  return value;
}

function denseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain dense array");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      fail("sparse_array_forbidden", `${path}[${index}]`, "Sparse arrays are forbidden");
    }
  }
  return value;
}

function fieldTokens(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function assertNoForbiddenRequestFields(value, path = "$request") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenRequestFields(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key !== "raw_payload_copied") {
      const forbidden = fieldTokens(key).find((token) => FORBIDDEN_REQUEST_FIELD_TOKENS.has(token)
        || token === "raw");
      if (forbidden !== undefined) {
        fail("forbidden_field", `${path}.${key}`, `${forbidden} fields are forbidden recursively`);
      }
    }
    assertNoForbiddenRequestFields(child, `${path}.${key}`);
  }
}

function assertCanonicalUtc(value, path) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    fail("timestamp_not_canonical_utc", path, "Expected canonical UTC ISO timestamp with milliseconds");
  }
  return value;
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function assertBareDigest(value, path) {
  if (typeof value !== "string" || !BARE_DIGEST.test(value)) {
    fail("bare_digest_invalid", path, "Expected 64 lowercase hex characters");
  }
  return value;
}

function prefixedDigest(value, path) {
  return `sha256:${assertBareDigest(value, path)}`;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function refsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertRefEqual(left, right, path, code = "ref_mismatch") {
  if (!refsEqual(left, right)) fail(code, path, "Typed refs must match byte-exactly");
}

function validateGenerationId(value, path) {
  validateTypedRef({
    entity_type: "shadow_generation",
    owner_surface: "project_history_receipt_adapter_v2",
    entity_id: value,
  }, "shadow_generation", path);
  return value;
}

function validateWriterNodeId(value, path) {
  validateTypedRef({
    entity_type: "node",
    owner_surface: "project_history_writer_authority",
    entity_id: value,
  }, "node", path);
  return value;
}

function validateLane(value, path) {
  if (!PROJECT_HISTORY_LANES.includes(value)) {
    fail("lane_invalid", path, "Lane is outside the five-lane contract");
  }
  return value;
}

function validateGapCodes(value, path) {
  denseArray(value, path);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const gap = value[index];
    if (typeof gap !== "string" || gap.normalize("NFC") !== gap || !GAP_CODE.test(gap)) {
      fail("gap_code_invalid", `${path}[${index}]`, "Gap codes must be canonical lowercase safe tokens");
    }
    if (seen.has(gap)) fail("duplicate_gap_code", `${path}[${index}]`, "Gap codes must be unique");
    seen.add(gap);
  }
  return [...value].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function validateReceiptRelativePath(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")
      || posix.isAbsolute(value) || posix.normalize(value) !== value
      || value === "." || value === ".." || value.startsWith("../")
      || value.endsWith("/") || !value.endsWith(".json")) {
    fail("receipt_path_invalid", path, "Expected a canonical POSIX-relative JSON receipt path");
  }
  return value;
}

function validateReceiptRoot(value, path) {
  if (typeof value !== "string" || value.length === 0 || !isAbsolute(value)
      || comparablePathIdentity(resolve(value)) !== comparablePathIdentity(value)) {
    fail("receipt_root_invalid", path, "Expected a normalized absolute receipt root");
  }
  return value;
}

function authorityFileIdentity(real, stat) {
  return {
    realpath: real,
    dev: stat.dev,
    ino: stat.ino,
    nlink: stat.nlink,
    size: stat.size,
    mtime_ns: stat.mtimeNs,
    ctime_ns: stat.ctimeNs,
  };
}

function sameAuthorityFileIdentity(left, right) {
  return comparablePathIdentity(left.realpath) === comparablePathIdentity(right.realpath)
    && left.dev === right.dev
    && left.ino === right.ino
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtime_ns === right.mtime_ns
    && left.ctime_ns === right.ctime_ns;
}

function validateShadowAdapterAuthorityRecord(record) {
  exactKeys(record, SHADOW_ADAPTER_AUTHORITY_RECORD_FIELDS, "$shadow_authority_record");
  if (record.schema_version !== PROJECT_HISTORY_SHADOW_ADAPTER_AUTHORITY_RECORD_SCHEMA_VERSION
      || record.authority_scope !== "project_history_shadow_adapter"
      || record.feature_state !== "off"
      || record.classification_state !== "shadow"
      || record.production_authority_granted !== false
      || record.raw_ingress_authority_reused !== false
      || record.accepted_history !== false) {
    fail("shadow_authority_boundary_invalid", "$shadow_authority_record", "Authority must remain separate feature-OFF Shadow metadata");
  }
  if (record.classification_epoch !== null || record.projector_epoch !== null) {
    fail("shadow_authority_production_epoch_forbidden", "$shadow_authority_record", "Production classification/projector epochs are not implemented by this adapter");
  }
  if (!Number.isSafeInteger(record.epoch) || record.epoch < 1) {
    fail("shadow_authority_epoch_invalid", "$shadow_authority_record.epoch", "Shadow adapter epoch must be positive");
  }
  validateWriterNodeId(record.node_id, "$shadow_authority_record.node_id");
  assertCanonicalUtc(record.not_before, "$shadow_authority_record.not_before");
  assertCanonicalUtc(record.expires_at, "$shadow_authority_record.expires_at");
  if (record.not_before >= record.expires_at) {
    fail("shadow_authority_window_invalid", "$shadow_authority_record", "Authority window is invalid");
  }
  validateTypedRef(record.owner_approval_ref, "owner_approval", "$shadow_authority_record.owner_approval_ref");
  if (!record.owner_approval_ref.owner_surface.startsWith("private_")) {
    fail("shadow_authority_owner_invalid", "$shadow_authority_record.owner_approval_ref", "Authority owner must be a private owner surface");
  }
  if (record.revoked !== false) {
    fail("shadow_authority_revoked", "$shadow_authority_record.revoked", "Revoked Shadow adapter authority is invalid");
  }
  return record;
}

function readStableShadowAuthorityRecord(
  authorityPath,
  expectedDigest,
  { expectedIdentity = null, expectedBytes = null } = {},
) {
  if (typeof authorityPath !== "string" || authorityPath.length === 0 || !isAbsolute(authorityPath)) {
    fail("shadow_authority_path_required", "$authority.path", "An absolute private authority path is required");
  }
  const resolved = resolve(authorityPath);
  if (comparablePathIdentity(resolved) !== comparablePathIdentity(authorityPath)) {
    fail("shadow_authority_path_invalid", "$authority.path", "Authority path must already be normalized");
  }
  assertDigest(expectedDigest, "$authority.expected_digest");

  let descriptor;
  try {
    const pathBefore = lstatSync(resolved, { bigint: true });
    const realBefore = realpathSync.native(resolved);
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1n
        || pathBefore.size < 1n || pathBefore.size > BigInt(MAX_SHADOW_AUTHORITY_BYTES)
        || comparablePathIdentity(realBefore) !== comparablePathIdentity(resolved)) {
      fail("shadow_authority_record_invalid", "$authority.path", "Authority must be a bounded direct standalone file");
    }
    const pathIdentityBefore = authorityFileIdentity(realBefore, pathBefore);
    if (expectedIdentity !== null && !sameAuthorityFileIdentity(pathIdentityBefore, expectedIdentity)) {
      fail("shadow_authority_identity_changed", "$authority.path", "Authority file identity changed");
    }

    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    descriptor = openSync(resolved, constants.O_RDONLY | noFollow);
    const openedBefore = fstatSync(descriptor, { bigint: true });
    const openedIdentityBefore = authorityFileIdentity(realBefore, openedBefore);
    if (!openedBefore.isFile() || openedBefore.nlink !== 1n
        || !sameAuthorityFileIdentity(pathIdentityBefore, openedIdentityBefore)) {
      fail("shadow_authority_identity_changed", "$authority.path", "Authority identity changed during open");
    }
    const bytes = readFileSync(descriptor);
    const openedAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(resolved, { bigint: true });
    const realAfter = realpathSync.native(resolved);
    const openedIdentityAfter = authorityFileIdentity(realBefore, openedAfter);
    const pathIdentityAfter = authorityFileIdentity(realAfter, pathAfter);
    if (!sameAuthorityFileIdentity(openedIdentityBefore, openedIdentityAfter)
        || !sameAuthorityFileIdentity(openedIdentityAfter, pathIdentityAfter)
        || bytes.length !== Number(openedAfter.size)) {
      fail("shadow_authority_record_changed", "$authority.path", "Authority changed during its stable read");
    }
    const digest = sha256Bytes(bytes);
    if (digest !== expectedDigest) {
      fail("shadow_authority_digest_mismatch", "$authority.expected_digest", "Authority bytes do not match the external digest");
    }
    if (expectedBytes !== null && !bytes.equals(expectedBytes)) {
      fail("shadow_authority_record_changed", "$authority.path", "Authority bytes changed after the initial pin");
    }
    let record;
    try {
      record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, ""));
    } catch {
      fail("shadow_authority_json_invalid", "$authority.path", "Authority record is not strict UTF-8 JSON");
    }
    return {
      path: resolved,
      identity: pathIdentityAfter,
      bytes,
      digest,
      record: validateShadowAdapterAuthorityRecord(record),
    };
  } catch (error) {
    if (error instanceof ProjectHistoryReceiptAdapterV2Error) throw error;
    fail(
      expectedIdentity === null ? "shadow_authority_record_invalid" : "shadow_authority_record_changed",
      "$authority.path",
      "Authority record could not be opened as the pinned file",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertShadowAuthorityMatchesRequest(authority, request) {
  const mirror = request.writer_authority;
  if (authority.record.epoch !== request.required_writer_epoch
      || authority.record.epoch !== mirror.epoch
      || authority.record.node_id !== mirror.node_id
      || authority.record.not_before !== mirror.issued_at
      || authority.record.expires_at !== mirror.expires_at
      || mirror.revoked !== false
      || authority.digest !== mirror.digest) {
    fail("shadow_authority_tuple_mismatch", "$request.writer_authority", "Request mirror does not match the externally pinned authority tuple");
  }
  const operationTime = Date.now();
  if (!Number.isFinite(operationTime)
      || operationTime < Date.parse(authority.record.not_before)
      || operationTime >= Date.parse(authority.record.expires_at)) {
    fail(
      "stale_writer_authority",
      "$authority.operation_time",
      "Trusted current operation time is outside the external authority window",
    );
  }
  return Object.freeze({
    epoch: authority.record.epoch,
    digest: authority.digest,
    node_id: authority.record.node_id,
    issued_at: authority.record.not_before,
    expires_at: authority.record.expires_at,
    revoked: false,
    authority_scope: authority.record.authority_scope,
    classification_epoch: null,
    projector_epoch: null,
    production_authority_granted: false,
    raw_ingress_authority_reused: false,
  });
}

export function openProjectHistoryShadowAdapterAuthorityV1({
  authorityPath,
  authorityDigest,
  request,
} = {}) {
  validateProjectHistoryReceiptAdapterRequestV2(request);
  const boundRequest = JSON.parse(canonicalJson(canonicalRequest(request)));
  const state = readStableShadowAuthorityRecord(authorityPath, authorityDigest);
  const authority = assertShadowAuthorityMatchesRequest(state, boundRequest);
  const snapshot = Object.freeze({
    schema_version: SHADOW_AUTHORITY_SNAPSHOT_SCHEMA_VERSION,
    authority_digest: authority.digest,
    writer_epoch: authority.epoch,
    writer_node_id: authority.node_id,
    classification_epoch: null,
    projector_epoch: null,
  });
  shadowAuthoritySnapshotState.set(snapshot, Object.freeze({
    ...state,
    bound_request: boundRequest,
    bound_request_canonical: canonicalJson(boundRequest),
  }));
  return snapshot;
}

export function assertProjectHistoryShadowAdapterAuthorityCurrentV1(snapshot, request) {
  const state = snapshot !== null && typeof snapshot === "object"
    ? shadowAuthoritySnapshotState.get(snapshot)
    : null;
  if (!state) {
    fail("shadow_authority_evidence_required", "$authority_snapshot", "Builder requires an externally opened authority snapshot");
  }
  validateProjectHistoryReceiptAdapterRequestV2(request);
  const boundRequest = canonicalRequest(request);
  if (canonicalJson(boundRequest) !== state.bound_request_canonical) {
    fail("shadow_authority_request_mismatch", "$authority_snapshot", "Authority snapshot is bound to a different request");
  }
  const current = readStableShadowAuthorityRecord(state.path, state.digest, {
    expectedIdentity: state.identity,
    expectedBytes: state.bytes,
  });
  return assertShadowAuthorityMatchesRequest(current, boundRequest);
}

export function assertProjectHistoryShadowProjectionAuthorityCurrentV1(snapshot) {
  const state = snapshot !== null && typeof snapshot === "object"
    ? shadowAuthoritySnapshotState.get(snapshot)
    : null;
  if (!state) {
    fail(
      "shadow_authority_evidence_required",
      "$authority_snapshot",
      "Projector requires an externally opened authority snapshot",
    );
  }
  const current = readStableShadowAuthorityRecord(state.path, state.digest, {
    expectedIdentity: state.identity,
    expectedBytes: state.bytes,
  });
  return assertShadowAuthorityMatchesRequest(current, state.bound_request);
}

export function getProjectHistoryShadowProjectionAuthorityPublicationLockSpecV1(snapshot) {
  const state = snapshot !== null && typeof snapshot === "object"
    ? shadowAuthoritySnapshotState.get(snapshot)
    : null;
  if (!state) {
    fail(
      "shadow_authority_evidence_required",
      "$authority_snapshot",
      "Projector publication requires an externally opened authority snapshot",
    );
  }
  const current = readStableShadowAuthorityRecord(state.path, state.digest, {
    expectedIdentity: state.identity,
    expectedBytes: state.bytes,
  });
  assertShadowAuthorityMatchesRequest(current, state.bound_request);
  return Object.freeze({
    schema_version: SHADOW_AUTHORITY_PUBLICATION_LOCK_SPEC_SCHEMA_VERSION,
    path: state.path,
    dev: String(state.identity.dev),
    ino: String(state.identity.ino),
    nlink: Number(state.identity.nlink),
    size: Number(state.identity.size),
    sha256: state.digest,
    not_before_unix_ms: Date.parse(state.record.not_before),
    expires_at_unix_ms: Date.parse(state.record.expires_at),
  });
}

function eventKey(value) {
  return canonicalJson(value.event_ref ?? value);
}

function nativeKey(value) {
  return canonicalJson(value.native_occurrence_ref ?? value);
}

function occurrenceIdentityKey(value) {
  return canonicalJson({
    event_ref: value.event_ref,
    native_occurrence_ref: value.native_occurrence_ref,
  });
}

function occurrenceEvidenceKey(attestation) {
  const {
    generation_id: ignoredGenerationId,
    native_occurrence_ref: ignoredNativeOccurrenceRef,
    event_ref: ignoredEventRef,
    writer_epoch: ignoredWriterEpoch,
    writer_authority_digest: ignoredWriterAuthorityDigest,
    writer_node_id: ignoredWriterNodeId,
    attestation_digest: ignoredAttestationDigest,
    ...evidence
  } = attestation;
  return canonicalJson(evidence);
}

function reusableOccurrenceEvidenceKeys(attestation) {
  return [
    `evidence:${occurrenceEvidenceKey(attestation)}`,
    `custody_receipt_ref:${canonicalJson(attestation.custody_receipt_ref)}`,
    `receipt_locator_digest:${attestation.receipt_locator_digest}`,
    `source_identity_digest:${attestation.source_identity_digest}`,
    `classification_evidence_ref:${canonicalJson(attestation.classification_evidence_ref)}`,
  ];
}

function bindOccurrenceEvidence(generation, bindings, path) {
  for (let index = 0; index < generation.envelopes.length; index += 1) {
    const envelope = generation.envelopes[index];
    const attestation = generation.source_attestations[index];
    const evidence = occurrenceEvidenceKey(attestation);
    const priorEventEvidence = bindings.evidenceByEventRef.get(eventKey(envelope));
    if (priorEventEvidence !== undefined && priorEventEvidence !== evidence) {
      fail("occurrence_evidence_conflict", `${path}.source_attestations[${index}]`, "Event ref reused different receipt or source evidence");
    }
    bindings.evidenceByEventRef.set(eventKey(envelope), evidence);
    const priorNativeEvidence = bindings.evidenceByNativeRef.get(nativeKey(envelope));
    if (priorNativeEvidence !== undefined && priorNativeEvidence !== evidence) {
      fail("occurrence_evidence_conflict", `${path}.source_attestations[${index}]`, "Native occurrence reused different receipt or source evidence");
    }
    bindings.evidenceByNativeRef.set(nativeKey(envelope), evidence);

    const occurrenceIdentity = occurrenceIdentityKey(envelope);
    for (const evidenceIdentity of reusableOccurrenceEvidenceKeys(attestation)) {
      const priorOccurrenceIdentity = bindings.occurrenceByEvidence.get(evidenceIdentity);
      if (priorOccurrenceIdentity !== undefined && priorOccurrenceIdentity !== occurrenceIdentity) {
        fail("occurrence_evidence_reuse", `${path}.source_attestations[${index}]`, "Receipt or source occurrence evidence reused for a different event/native occurrence");
      }
      bindings.occurrenceByEvidence.set(evidenceIdentity, occurrenceIdentity);
    }
  }
}

function validateWriterAuthority(authority, request) {
  exactKeys(authority, WRITER_AUTHORITY_FIELDS, "$request.writer_authority");
  if (!Number.isSafeInteger(authority.epoch) || authority.epoch < 1) {
    fail("writer_authority_epoch_invalid", "$request.writer_authority.epoch", "Epoch must be a positive safe integer");
  }
  if (authority.epoch !== request.required_writer_epoch) {
    fail("stale_writer_authority_epoch", "$request.writer_authority.epoch", "Authority epoch does not match the required fence");
  }
  assertDigest(authority.digest, "$request.writer_authority.digest");
  validateWriterNodeId(authority.node_id, "$request.writer_authority.node_id");
  assertCanonicalUtc(authority.issued_at, "$request.writer_authority.issued_at");
  assertCanonicalUtc(authority.expires_at, "$request.writer_authority.expires_at");
  if (authority.issued_at >= authority.expires_at) {
    fail("writer_authority_window_invalid", "$request.writer_authority", "Authority issue time must precede expiry");
  }
  if (authority.revoked !== false) {
    fail("writer_authority_revoked", "$request.writer_authority.revoked", "Revoked authority is invalid");
  }
  // Pure packet consistency only: this metadata relation never grants live
  // authority. Live open/recheck paths use trusted current operation time.
  if (request.generated_at < authority.issued_at || request.generated_at >= authority.expires_at) {
    fail("stale_writer_authority", "$request.generated_at", "Generation time is outside the authority window");
  }
}

function validateCoverageMatrix(entry, count, path) {
  const gaps = entry.gap_codes;
  if (entry.state === "complete_with_events") {
    if (count < 1 || gaps.length !== 0) {
      fail("coverage_matrix_invalid", path, "complete_with_events requires one or more events and no gaps");
    }
  } else if (entry.state === "complete_no_events") {
    if (count !== 0 || gaps.length !== 0) {
      fail("coverage_matrix_invalid", path, "complete_no_events requires zero events and no gaps");
    }
  } else if (entry.state === "partial") {
    if (gaps.length === 0) fail("coverage_matrix_invalid", path, "partial requires explicit gaps");
  } else if (entry.state === "not_collected") {
    if (count !== 0 || gaps.length === 0) {
      fail("coverage_matrix_invalid", path, "not_collected requires zero events and explicit gaps");
    }
  }
}

function canonicalRequest(request) {
  const coverageByLane = new Map(request.coverage.map((entry) => [entry.lane, entry]));
  const occurrences = [...request.occurrences].sort((left, right) => {
    const leftKey = canonicalJson(left);
    const rightKey = canonicalJson(right);
    return Buffer.compare(Buffer.from(leftKey), Buffer.from(rightKey));
  });
  return {
    schema_version: request.schema_version,
    feature_state: request.feature_state,
    generation_id: request.generation_id,
    generated_at: request.generated_at,
    receipt_root: request.receipt_root,
    project_ref: request.project_ref,
    window_start: request.window_start,
    window_end: request.window_end,
    classification_state: request.classification_state,
    required_writer_epoch: request.required_writer_epoch,
    writer_authority: request.writer_authority,
    coverage: PROJECT_HISTORY_LANES.map((lane) => ({
      ...coverageByLane.get(lane),
      gap_codes: validateGapCodes(coverageByLane.get(lane).gap_codes, `$request.coverage.${lane}.gap_codes`),
    })),
    occurrences,
    raw_payload_copied: false,
    accepted_history: false,
  };
}

export function validateProjectHistoryReceiptAdapterRequestV2(request) {
  canonicalJson(request);
  assertNoForbiddenRequestFields(request);
  exactKeys(request, REQUEST_FIELDS, "$request");
  if (request.schema_version !== PROJECT_HISTORY_RECEIPT_ADAPTER_REQUEST_SCHEMA_VERSION) {
    fail("request_schema_invalid", "$request.schema_version", "Unexpected receipt adapter request schema");
  }
  if (request.feature_state !== "off" || request.classification_state !== "shadow") {
    fail("shadow_only_required", "$request", "The receipt adapter is feature-OFF Shadow only");
  }
  if (request.raw_payload_copied !== false || request.accepted_history !== false) {
    fail("shadow_boundary_invalid", "$request", "Raw copying and accepted history are forbidden");
  }
  validateGenerationId(request.generation_id, "$request.generation_id");
  assertCanonicalUtc(request.generated_at, "$request.generated_at");
  validateReceiptRoot(request.receipt_root, "$request.receipt_root");
  validateTypedRef(request.project_ref, "project", "$request.project_ref");
  assertCanonicalUtc(request.window_start, "$request.window_start");
  assertCanonicalUtc(request.window_end, "$request.window_end");
  if (request.window_start >= request.window_end) {
    fail("coverage_window_invalid", "$request", "Window start must precede window end");
  }
  if (!Number.isSafeInteger(request.required_writer_epoch) || request.required_writer_epoch < 1) {
    fail("required_writer_epoch_invalid", "$request.required_writer_epoch", "Required epoch must be a positive safe integer");
  }
  validateWriterAuthority(request.writer_authority, request);

  denseArray(request.coverage, "$request.coverage");
  if (request.coverage.length !== PROJECT_HISTORY_LANES.length) {
    fail("coverage_lane_count_invalid", "$request.coverage", "Exactly five coverage declarations are required");
  }
  const coverageByLane = new Map();
  for (let index = 0; index < request.coverage.length; index += 1) {
    const entry = request.coverage[index];
    const path = `$request.coverage[${index}]`;
    exactKeys(entry, REQUEST_COVERAGE_FIELDS, path);
    validateLane(entry.lane, `${path}.lane`);
    if (coverageByLane.has(entry.lane)) fail("duplicate_coverage_lane", `${path}.lane`, "Coverage lanes must be unique");
    coverageByLane.set(entry.lane, entry);
    validateTypedRef(entry.source_owner_ref, "source_owner", `${path}.source_owner_ref`);
    validateTypedRef(entry.project_ref, "project", `${path}.project_ref`);
    assertRefEqual(entry.project_ref, request.project_ref, `${path}.project_ref`, "mixed_project");
    if (!COVERAGE_STATES.includes(entry.state)) {
      fail("coverage_state_invalid", `${path}.state`, "Coverage state is outside the continuous Shadow subset");
    }
    validateGapCodes(entry.gap_codes, `${path}.gap_codes`);
  }
  for (const lane of PROJECT_HISTORY_LANES) {
    if (!coverageByLane.has(lane)) fail("missing_coverage_lane", "$request.coverage", `Missing ${lane}`);
  }

  denseArray(request.occurrences, "$request.occurrences");
  const eventRefs = new Set();
  const nativeLanes = new Map();
  const receiptPaths = new Set();
  const receiptRefs = new Set();
  const evidenceRefs = new Set();
  const occurrenceCounts = new Map(PROJECT_HISTORY_LANES.map((lane) => [lane, 0]));
  for (let index = 0; index < request.occurrences.length; index += 1) {
    const occurrence = request.occurrences[index];
    const path = `$request.occurrences[${index}]`;
    exactKeys(occurrence, REQUEST_OCCURRENCE_FIELDS, path);
    validateLane(occurrence.lane, `${path}.lane`);
    validateTypedRef(occurrence.project_ref, "project", `${path}.project_ref`);
    assertRefEqual(occurrence.project_ref, request.project_ref, `${path}.project_ref`, "mixed_project");
    validateReceiptRelativePath(occurrence.receipt_path, `${path}.receipt_path`);
    assertDigest(occurrence.expected_receipt_digest, `${path}.expected_receipt_digest`);
    validateTypedRef(occurrence.custody_receipt_ref, "custody_receipt", `${path}.custody_receipt_ref`);
    validateTypedRef(occurrence.source_owner_ref, "source_owner", `${path}.source_owner_ref`);
    validateTypedRef(occurrence.native_occurrence_ref, null, `${path}.native_occurrence_ref`);
    const nativeRef = nativeKey(occurrence);
    const priorLane = nativeLanes.get(nativeRef);
    if (priorLane !== undefined) {
      fail(priorLane === occurrence.lane ? "duplicate_native_occurrence" : "cross_lane_occurrence_conflict",
        `${path}.native_occurrence_ref`, "Native occurrences must be unique to one lane and event");
    }
    nativeLanes.set(nativeRef, occurrence.lane);
    if (occurrence.native_occurrence_ref.entity_type
        !== ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[occurrence.lane]) {
      fail(
        "native_occurrence_type_mismatch",
        `${path}.native_occurrence_ref.entity_type`,
        "Native occurrence type must match its lane",
      );
    }
    validateTypedRef(occurrence.event_ref, "event", `${path}.event_ref`);
    if (occurrence.source_revision_ref !== null) {
      validateTypedRef(occurrence.source_revision_ref, "source_revision", `${path}.source_revision_ref`);
    }
    if (occurrence.content_ref !== null) {
      validateTypedRef(occurrence.content_ref, "content", `${path}.content_ref`);
    }
    if ((occurrence.source_revision_ref === null) !== (occurrence.content_ref === null)) {
      fail("source_content_pair_required", path, "Source revision and content refs must both be present or both be null");
    }
    for (const field of ["event_at", "valid_at", "observed_at", "known_at", "recorded_at"]) {
      assertCanonicalUtc(occurrence[field], `${path}.${field}`);
    }
    if (occurrence.recorded_at > occurrence.known_at) {
      fail("recorded_after_known", `${path}.recorded_at`, "recorded_at must not follow known_at");
    }
    if (occurrence.known_at < request.window_start || occurrence.known_at >= request.window_end) {
      fail("known_at_outside_window", `${path}.known_at`, "known_at must fall inside the half-open request window");
    }
    validateTypedRef(occurrence.classification_evidence_ref, "classification_evidence", `${path}.classification_evidence_ref`);

    const eventRef = eventKey(occurrence);
    if (eventRefs.has(eventRef)) fail("duplicate_event_ref", `${path}.event_ref`, "Event refs must be unique");
    eventRefs.add(eventRef);
    if (receiptPaths.has(occurrence.receipt_path)) {
      fail("duplicate_receipt_path", `${path}.receipt_path`, "One exact receipt file cannot count twice");
    }
    receiptPaths.add(occurrence.receipt_path);
    const receiptRef = canonicalJson(occurrence.custody_receipt_ref);
    if (receiptRefs.has(receiptRef)) fail("duplicate_receipt_ref", `${path}.custody_receipt_ref`, "Receipt refs must be unique");
    receiptRefs.add(receiptRef);
    const evidenceRef = canonicalJson(occurrence.classification_evidence_ref);
    if (evidenceRefs.has(evidenceRef)) fail("duplicate_classification_evidence_ref", `${path}.classification_evidence_ref`, "Evidence refs must be unique");
    evidenceRefs.add(evidenceRef);

    const coverage = coverageByLane.get(occurrence.lane);
    assertRefEqual(occurrence.source_owner_ref, coverage.source_owner_ref, `${path}.source_owner_ref`, "coverage_source_owner_mismatch");
    occurrenceCounts.set(occurrence.lane, occurrenceCounts.get(occurrence.lane) + 1);
  }

  for (const lane of PROJECT_HISTORY_LANES) {
    validateCoverageMatrix(coverageByLane.get(lane), occurrenceCounts.get(lane), `$request.coverage.${lane}`);
  }
  return request;
}

async function inspectNormalReceiptRoot(root) {
  let info;
  try {
    info = await lstat(root);
  } catch {
    fail("receipt_root_unavailable", "$request.receipt_root", "Receipt root does not exist");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("unsafe_receipt_root", "$request.receipt_root", "Receipt root must be a normal directory");
  }
  const physical = await realpath(root);
  if (comparablePathIdentity(physical) !== comparablePathIdentity(resolve(root))) {
    fail("receipt_root_reparse_forbidden", "$request.receipt_root", "Receipt root must not traverse a symlink or reparse point");
  }
  return { dev: info.dev, ino: info.ino, physical };
}

function inside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

async function readExactReceipt(root, receiptPath, rootIdentity) {
  const target = resolve(root, ...receiptPath.split("/"));
  if (!inside(root, target)) fail("receipt_path_escape", "$request.occurrences.receipt_path", "Receipt path escaped its root");

  const currentRoot = await inspectNormalReceiptRoot(root);
  if (currentRoot.dev !== rootIdentity.dev || currentRoot.ino !== rootIdentity.ino
      || comparablePathIdentity(currentRoot.physical) !== comparablePathIdentity(rootIdentity.physical)) {
    fail("receipt_root_changed", "$request.receipt_root", "Receipt root identity changed during adaptation");
  }

  let cursor = root;
  const segments = receiptPath.split("/");
  let before;
  for (let index = 0; index < segments.length; index += 1) {
    cursor = resolve(cursor, segments[index]);
    try {
      before = await lstat(cursor);
    } catch {
      fail("receipt_unavailable", `$request.occurrences.receipt_path:${receiptPath}`, "Exact receipt file does not exist");
    }
    if (before.isSymbolicLink()) {
      fail("receipt_reparse_forbidden", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt path cannot traverse a symlink or reparse point");
    }
    if (index < segments.length - 1 && !before.isDirectory()) {
      fail("receipt_parent_not_directory", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt parent is not a directory");
    }
  }
  if (!before.isFile()) fail("receipt_not_regular_file", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt must be a regular file");
  if (before.size > MAX_RECEIPT_BYTES) fail("receipt_too_large", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt exceeds the metadata-only byte ceiling");
  const physical = await realpath(target);
  if (comparablePathIdentity(physical) !== comparablePathIdentity(target)) {
    fail("receipt_reparse_forbidden", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt path cannot resolve through a reparse point");
  }

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(before, opened)) {
      fail("receipt_changed_during_open", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt identity changed during open");
    }
    const bytes = await handle.readFile();
    const after = await lstat(target);
    if (!sameIdentity(opened, after)) {
      fail("receipt_changed_during_read", `$request.occurrences.receipt_path:${receiptPath}`, "Receipt identity changed during read");
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProjectHistoryReceiptAdapterV2Error) throw error;
    fail("receipt_open_failed", `$request.occurrences.receipt_path:${receiptPath}`, "Exact receipt file could not be opened safely");
  } finally {
    await handle?.close();
  }
}

function assertCanonicalContractPath(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\")
      || posix.isAbsolute(value) || posix.normalize(value) !== value
      || value === "." || value === ".." || value.startsWith("../")) {
    fail("receipt_contract_path_invalid", path, "Receipt contract locator is not canonical relative metadata");
  }
}

function normalizeStagingReceipt(receipt, occurrence, path) {
  exactKeys(receipt, STAGING_RECEIPT_FIELDS, path);
  const expectedCustodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[occurrence.lane];
  if (receipt.lane !== expectedCustodyLane) {
    fail("receipt_lane_mismatch", `${path}.lane`, "Staging receipt lane does not match the requested occurrence lane");
  }
  if (typeof receipt.source_owner_ref !== "string" || !SAFE_SOURCE_IDENTIFIER.test(receipt.source_owner_ref)
      || typeof receipt.source_key !== "string" || !SAFE_SOURCE_IDENTIFIER.test(receipt.source_key)) {
    fail("staging_source_identity_invalid", path, "Staging source identifiers do not match the producer contract");
  }
  const expectedIdentity = createHash("sha256")
    .update("soulforge.ingress.source_identity.v1\0", "utf8")
    .update(receipt.lane, "utf8")
    .update("\0", "utf8")
    .update(receipt.source_owner_ref, "utf8")
    .update("\0", "utf8")
    .update(receipt.source_key, "utf8")
    .digest("hex");
  assertBareDigest(receipt.source_identity_digest, `${path}.source_identity_digest`);
  if (receipt.source_identity_digest !== expectedIdentity) {
    fail("source_identity_digest_mismatch", `${path}.source_identity_digest`, "Staging identity digest does not match its exact fields");
  }
  assertBareDigest(receipt.sha256, `${path}.sha256`);
  if (!Number.isSafeInteger(receipt.size) || receipt.size < 0) fail("source_size_invalid", `${path}.size`, "Expected a nonnegative safe integer");
  assertCanonicalContractPath(receipt.storage_ref, `${path}.storage_ref`);
  assertCanonicalContractPath(receipt.checkpoint_ref, `${path}.checkpoint_ref`);
  if (receipt.project_state !== "unclassified" || receipt.source_deleted !== false || receipt.source_overwritten !== false) {
    fail("source_preservation_required", path, "Receipt must preserve unclassified source custody");
  }
  return {
    custody_lane: receipt.lane,
    receipt_normalization: "staging_receipt_v1",
    source_owner_id: receipt.source_owner_ref,
    source_identity_digest: prefixedDigest(receipt.source_identity_digest, `${path}.source_identity_digest`),
    source_digest: prefixedDigest(receipt.sha256, `${path}.sha256`),
    source_size: receipt.size,
    project_state: receipt.project_state,
    source_deleted: receipt.source_deleted,
    source_overwritten: receipt.source_overwritten,
  };
}

function normalizeVoiceReceipt(receipt, occurrence, path) {
  exactKeys(receipt, VOICE_RECEIPT_FIELDS, path);
  if (occurrence.lane !== "voice") {
    fail("receipt_lane_mismatch", path, "Voice copy-only receipts can normalize only into the voice lane");
  }
  if (typeof receipt.source_owner_ref !== "string" || receipt.source_owner_ref.length === 0
      || typeof receipt.source_key !== "string" || receipt.source_key.length === 0) {
    fail("voice_source_identity_invalid", path, "Voice receipt source identity is missing");
  }
  assertCanonicalUtc(receipt.captured_at, `${path}.captured_at`);
  assertBareDigest(receipt.sha256, `${path}.sha256`);
  const expectedReceiptId = createHash("sha256")
    .update(`${receipt.source_owner_ref}\0${receipt.source_key}\0${receipt.sha256}`, "utf8")
    .digest("hex");
  assertBareDigest(receipt.receipt_id, `${path}.receipt_id`);
  if (receipt.receipt_id !== expectedReceiptId) {
    fail("voice_receipt_id_mismatch", `${path}.receipt_id`, "Voice receipt identity does not match its exact fields");
  }
  if (!Number.isSafeInteger(receipt.size) || receipt.size < 0
      || typeof receipt.source_mtime_ms !== "number" || !Number.isFinite(receipt.source_mtime_ms)
      || receipt.source_mtime_ms < 0) {
    fail("voice_source_stat_invalid", path, "Voice receipt source stat is invalid");
  }
  if (!["live_copy", "legacy_verified", "immutable_version"].includes(receipt.custody_kind)) {
    fail("voice_custody_kind_invalid", `${path}.custody_kind`, "Voice custody kind is not recognized");
  }
  assertCanonicalContractPath(receipt.storage_ref, `${path}.storage_ref`);
  if (receipt.project_state !== "unclassified" || receipt.source_deleted !== false || receipt.source_overwritten !== false) {
    fail("source_preservation_required", path, "Receipt must preserve unclassified source custody");
  }
  return {
    custody_lane: "voice",
    receipt_normalization: "voice_copy_only_receipt_v1",
    source_owner_id: receipt.source_owner_ref,
    source_identity_digest: prefixedDigest(receipt.receipt_id, `${path}.receipt_id`),
    source_digest: prefixedDigest(receipt.sha256, `${path}.sha256`),
    source_size: receipt.size,
    project_state: receipt.project_state,
    source_deleted: receipt.source_deleted,
    source_overwritten: receipt.source_overwritten,
  };
}

function parseAndNormalizeReceipt(bytes, occurrence, index) {
  const actualDigest = sha256Bytes(bytes);
  if (actualDigest !== occurrence.expected_receipt_digest) {
    fail("receipt_digest_mismatch", `$request.occurrences[${index}].expected_receipt_digest`, "Exact receipt bytes do not match the expected digest");
  }
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("receipt_json_invalid", `$receipt[${index}]`, "Receipt is not valid JSON");
  }
  assertNoForbiddenRequestFields(receipt, `$receipt[${index}]`);
  if (receipt?.schema_version === STAGING_RECEIPT_SCHEMA_VERSION) {
    return { receipt, actualDigest, normalized: normalizeStagingReceipt(receipt, occurrence, `$receipt[${index}]`) };
  }
  if (receipt?.schema_version === VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION) {
    return { receipt, actualDigest, normalized: normalizeVoiceReceipt(receipt, occurrence, `$receipt[${index}]`) };
  }
  fail("receipt_schema_unsupported", `$receipt[${index}].schema_version`, "Only staging receipt v1 and voice copy-only receipt v1 are supported");
}

function withoutField(value, field) {
  const result = {};
  for (const [key, child] of Object.entries(value)) if (key !== field) result[key] = child;
  return result;
}

export function computeProjectHistoryReceiptSourceAttestationDigest(attestation) {
  exactKeys(attestation, SOURCE_ATTESTATION_FIELDS, "$source_attestation");
  return sha256Canonical(withoutField(attestation, "attestation_digest"));
}

export function computeProjectHistoryWriterAuthorityAttestationDigest(attestation) {
  exactKeys(attestation, AUTHORITY_ATTESTATION_FIELDS, "$authority_attestation");
  return sha256Canonical(withoutField(attestation, "attestation_digest"));
}

function authorityTuple(authority) {
  return {
    writer_epoch: authority.epoch,
    writer_authority_digest: authority.digest,
    writer_node_id: authority.node_id,
  };
}

function buildSourceAttestation(request, occurrence, normalized, receiptDigest, authority) {
  const attestation = {
    schema_version: PROJECT_HISTORY_RECEIPT_SOURCE_ATTESTATION_SCHEMA_VERSION,
    generation_id: request.generation_id,
    lane: occurrence.lane,
    custody_lane: normalized.custody_lane,
    project_ref: request.project_ref,
    source_owner_ref: occurrence.source_owner_ref,
    native_occurrence_ref: occurrence.native_occurrence_ref,
    event_ref: occurrence.event_ref,
    classification_evidence_ref: occurrence.classification_evidence_ref,
    custody_receipt_ref: occurrence.custody_receipt_ref,
    receipt_schema_version: normalized.receipt_schema_version,
    receipt_normalization: normalized.receipt_normalization,
    receipt_digest: receiptDigest,
    receipt_locator_digest: sha256Canonical({ receipt_root: request.receipt_root, receipt_path: occurrence.receipt_path }),
    source_identity_digest: normalized.source_identity_digest,
    source_digest: normalized.source_digest,
    source_size: normalized.source_size,
    project_state: normalized.project_state,
    source_deleted: normalized.source_deleted,
    source_overwritten: normalized.source_overwritten,
    ...authorityTuple(authority),
    raw_payload_copied: false,
    attestation_digest: "",
  };
  attestation.attestation_digest = computeProjectHistoryReceiptSourceAttestationDigest(attestation);
  return attestation;
}

function createEnvelope(request, occurrence) {
  return createProjectHistoryEnvelope({
    lane: occurrence.lane,
    source_owner_ref: occurrence.source_owner_ref,
    native_occurrence_ref: occurrence.native_occurrence_ref,
    event_ref: occurrence.event_ref,
    source_revision_ref: occurrence.source_revision_ref,
    content_ref: occurrence.content_ref,
    project_ref: occurrence.project_ref,
    event_at: occurrence.event_at,
    valid_at: occurrence.valid_at,
    observed_at: occurrence.observed_at,
    known_at: occurrence.known_at,
    recorded_at: occurrence.recorded_at,
    classification_before: { state: "unclassified", project_ref: null },
    classification_after: { state: "classified", project_ref: request.project_ref },
    supersedes_event_ref: null,
  });
}

function generationBindingProjection(generation) {
  return {
    schema_version: generation.schema_version,
    generation_id: generation.generation_id,
    generated_at: generation.generated_at,
    project_ref: generation.project_ref,
    classification_state: generation.classification_state,
    envelopes: generation.envelopes,
    coverage_receipts: generation.coverage_receipts,
    source_attestations: generation.source_attestations,
    source_attestation_digest: generation.source_attestation_digest,
    ordered_event_digest: generation.ordered_event_digest,
    request_digest: generation.request_digest,
    raw_payload_copied: generation.raw_payload_copied,
    accepted_history: generation.accepted_history,
  };
}

export function computeProjectHistoryReceiptAdapterGenerationBindingDigest(generation) {
  return sha256Canonical(generationBindingProjection(generation));
}

export function computeProjectHistoryReceiptAdapterGenerationDigest(generation) {
  exactKeys(generation, GENERATION_FIELDS, "$generation");
  return sha256Canonical(withoutField(generation, "generation_digest"));
}

function buildAuthorityAttestation(request, generation, authority) {
  const tuple = authorityTuple(authority);
  const eventMetadata = generation.envelopes.map((envelope) => {
    const source = generation.source_attestations.find((entry) => refsEqual(entry.event_ref, envelope.event_ref));
    return {
      lane: envelope.lane,
      event_ref: envelope.event_ref,
      event_metadata_digest: envelope.metadata_digest,
      source_attestation_digest: source.attestation_digest,
      ...tuple,
    };
  });
  const coverageMetadata = generation.coverage_receipts.map((coverage) => ({
    lane: coverage.lane,
    coverage_metadata_digest: coverage.metadata_digest,
    ...tuple,
  }));
  const attestation = {
    schema_version: PROJECT_HISTORY_WRITER_AUTHORITY_ATTESTATION_SCHEMA_VERSION,
    generation_id: request.generation_id,
    project_ref: request.project_ref,
    generation_binding_digest: computeProjectHistoryReceiptAdapterGenerationBindingDigest(generation),
    authority_scope: authority.authority_scope,
    classification_epoch: authority.classification_epoch,
    projector_epoch: authority.projector_epoch,
    production_authority_granted: authority.production_authority_granted,
    raw_ingress_authority_reused: authority.raw_ingress_authority_reused,
    ...tuple,
    issued_at: authority.issued_at,
    expires_at: authority.expires_at,
    event_metadata: eventMetadata,
    coverage_metadata: coverageMetadata,
    raw_payload_copied: false,
    accepted_history: false,
    attestation_digest: "",
  };
  attestation.attestation_digest = computeProjectHistoryWriterAuthorityAttestationDigest(attestation);
  return attestation;
}

export async function buildProjectHistoryReceiptAdapterGenerationV2(request, {
  authoritySnapshot,
  beforeFinalAuthorityRecheck = null,
} = {}) {
  validateProjectHistoryReceiptAdapterRequestV2(request);
  if (beforeFinalAuthorityRecheck !== null && typeof beforeFinalAuthorityRecheck !== "function") {
    fail("authority_recheck_hook_invalid", "$options.beforeFinalAuthorityRecheck", "Authority recheck hook must be a function");
  }
  const normalizedRequest = canonicalRequest(request);
  const authority = assertProjectHistoryShadowAdapterAuthorityCurrentV1(
    authoritySnapshot,
    normalizedRequest,
  );
  const root = resolve(normalizedRequest.receipt_root);
  const rootIdentity = await inspectNormalReceiptRoot(root);
  const envelopeRows = [];

  for (let index = 0; index < normalizedRequest.occurrences.length; index += 1) {
    const occurrence = normalizedRequest.occurrences[index];
    const bytes = await readExactReceipt(root, occurrence.receipt_path, rootIdentity);
    const result = parseAndNormalizeReceipt(bytes, occurrence, index);
    result.normalized.receipt_schema_version = result.receipt.schema_version;
    if (result.normalized.source_owner_id !== occurrence.source_owner_ref.entity_id) {
      fail("receipt_source_owner_mismatch", `$request.occurrences[${index}].source_owner_ref`, "Explicit source owner does not match the exact receipt");
    }
    if (occurrence.content_ref !== null && occurrence.content_ref.entity_id !== result.normalized.source_digest) {
      fail("receipt_content_ref_mismatch", `$request.occurrences[${index}].content_ref`, "Explicit content ref does not match the receipt source digest");
    }
    envelopeRows.push({
      envelope: createEnvelope(normalizedRequest, occurrence),
      sourceAttestation: buildSourceAttestation(
        normalizedRequest,
        occurrence,
        result.normalized,
        result.actualDigest,
        authority,
      ),
    });
  }

  const envelopes = sortProjectHistoryEnvelopes(envelopeRows.map((row) => row.envelope));
  const sourceByEvent = new Map(envelopeRows.map((row) => [eventKey(row.envelope), row.sourceAttestation]));
  const sourceAttestations = envelopes.map((envelope) => sourceByEvent.get(eventKey(envelope)));
  const coverageByLane = new Map(normalizedRequest.coverage.map((entry) => [entry.lane, entry]));
  const coverageReceipts = PROJECT_HISTORY_LANES.map((lane) => {
    const declaration = coverageByLane.get(lane);
    const laneEnvelopes = envelopes.filter((envelope) => envelope.lane === lane);
    return createProjectHistoryCoverageReceipt({
      lane,
      source_owner_ref: declaration.source_owner_ref,
      project_ref: declaration.project_ref,
      window_start: normalizedRequest.window_start,
      window_end: normalizedRequest.window_end,
      state: declaration.state,
      gap_codes: declaration.gap_codes,
      applicability_ref: null,
    }, laneEnvelopes);
  });

  const generation = {
    schema_version: PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION,
    generation_id: normalizedRequest.generation_id,
    generated_at: normalizedRequest.generated_at,
    project_ref: normalizedRequest.project_ref,
    classification_state: "shadow",
    envelopes,
    coverage_receipts: coverageReceipts,
    source_attestations: sourceAttestations,
    source_attestation_digest: sha256Canonical(sourceAttestations.map((entry) => entry.attestation_digest)),
    authority_attestation: null,
    ordered_event_digest: sha256Canonical(envelopes.map((envelope) => envelope.metadata_digest)),
    request_digest: sha256Canonical(normalizedRequest),
    generation_digest: "",
    raw_payload_copied: false,
    accepted_history: false,
  };
  if (beforeFinalAuthorityRecheck !== null) await beforeFinalAuthorityRecheck();
  const finalAuthority = assertProjectHistoryShadowAdapterAuthorityCurrentV1(
    authoritySnapshot,
    normalizedRequest,
  );
  if (canonicalJson(authorityTuple(finalAuthority)) !== canonicalJson(authorityTuple(authority))) {
    fail("shadow_authority_tuple_changed", "$authority_snapshot", "Authority tuple changed before generation finalization");
  }
  generation.authority_attestation = buildAuthorityAttestation(
    normalizedRequest,
    generation,
    finalAuthority,
  );
  generation.generation_digest = computeProjectHistoryReceiptAdapterGenerationDigest(generation);
  return validateProjectHistoryReceiptAdapterGenerationV2(generation);
}

function validateAuthorityTuple(value, expected, path) {
  for (const field of AUTHORITY_TUPLE_FIELDS) {
    if (value[field] !== expected[field]) fail("authority_tuple_mismatch", `${path}.${field}`, "Authority tuple is not generation-consistent");
  }
}

function validateSourceAttestation(attestation, generation, envelope, path) {
  exactKeys(attestation, SOURCE_ATTESTATION_FIELDS, path);
  if (attestation.schema_version !== PROJECT_HISTORY_RECEIPT_SOURCE_ATTESTATION_SCHEMA_VERSION) {
    fail("source_attestation_schema_invalid", `${path}.schema_version`, "Unexpected source attestation schema");
  }
  if (attestation.generation_id !== generation.generation_id || attestation.lane !== envelope.lane) {
    fail("source_attestation_binding_invalid", path, "Source attestation must bind its generation and lane");
  }
  validateLane(attestation.lane, `${path}.lane`);
  if (attestation.custody_lane !== ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[attestation.lane]) {
    fail("custody_lane_mismatch", `${path}.custody_lane`, "Custody lane does not match history lane");
  }
  validateTypedRef(attestation.project_ref, "project", `${path}.project_ref`);
  assertRefEqual(attestation.project_ref, generation.project_ref, `${path}.project_ref`, "mixed_project");
  validateTypedRef(attestation.source_owner_ref, "source_owner", `${path}.source_owner_ref`);
  validateTypedRef(attestation.native_occurrence_ref, null, `${path}.native_occurrence_ref`);
  validateTypedRef(attestation.event_ref, "event", `${path}.event_ref`);
  validateTypedRef(attestation.classification_evidence_ref, "classification_evidence", `${path}.classification_evidence_ref`);
  validateTypedRef(attestation.custody_receipt_ref, "custody_receipt", `${path}.custody_receipt_ref`);
  assertRefEqual(attestation.source_owner_ref, envelope.source_owner_ref, `${path}.source_owner_ref`);
  assertRefEqual(attestation.native_occurrence_ref, envelope.native_occurrence_ref, `${path}.native_occurrence_ref`);
  assertRefEqual(attestation.event_ref, envelope.event_ref, `${path}.event_ref`);
  if (![STAGING_RECEIPT_SCHEMA_VERSION, VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION].includes(attestation.receipt_schema_version)
      || !["staging_receipt_v1", "voice_copy_only_receipt_v1"].includes(attestation.receipt_normalization)) {
    fail("receipt_normalization_invalid", path, "Source attestation normalization is unsupported");
  }
  if ((attestation.receipt_schema_version === VOICE_COPY_ONLY_RECEIPT_SCHEMA_VERSION)
      !== (attestation.receipt_normalization === "voice_copy_only_receipt_v1")) {
    fail("receipt_normalization_schema_mismatch", path, "Normalizer must match receipt schema explicitly");
  }
  assertDigest(attestation.receipt_digest, `${path}.receipt_digest`);
  assertDigest(attestation.receipt_locator_digest, `${path}.receipt_locator_digest`);
  assertDigest(attestation.source_identity_digest, `${path}.source_identity_digest`);
  assertDigest(attestation.source_digest, `${path}.source_digest`);
  if (!Number.isSafeInteger(attestation.source_size) || attestation.source_size < 0
      || attestation.project_state !== "unclassified"
      || attestation.source_deleted !== false || attestation.source_overwritten !== false
      || attestation.raw_payload_copied !== false) {
    fail("source_attestation_boundary_invalid", path, "Source attestation violates metadata-only preserved custody");
  }
  if (attestation.writer_epoch !== generation.authority_attestation.writer_epoch
      || attestation.writer_authority_digest !== generation.authority_attestation.writer_authority_digest
      || attestation.writer_node_id !== generation.authority_attestation.writer_node_id) {
    fail("source_authority_mismatch", path, "Source attestation authority differs from the generation authority");
  }
  assertDigest(attestation.writer_authority_digest, `${path}.writer_authority_digest`);
  validateWriterNodeId(attestation.writer_node_id, `${path}.writer_node_id`);
  if (!Number.isSafeInteger(attestation.writer_epoch) || attestation.writer_epoch < 1) {
    fail("writer_authority_epoch_invalid", `${path}.writer_epoch`, "Writer epoch must be positive");
  }
  assertDigest(attestation.attestation_digest, `${path}.attestation_digest`);
  if (attestation.attestation_digest !== computeProjectHistoryReceiptSourceAttestationDigest(attestation)) {
    fail("source_attestation_digest_mismatch", `${path}.attestation_digest`, "Source attestation digest does not match metadata");
  }
}

function validateAuthorityAttestation(attestation, generation) {
  exactKeys(attestation, AUTHORITY_ATTESTATION_FIELDS, "$generation.authority_attestation");
  if (attestation.schema_version !== PROJECT_HISTORY_WRITER_AUTHORITY_ATTESTATION_SCHEMA_VERSION) {
    fail("authority_attestation_schema_invalid", "$generation.authority_attestation.schema_version", "Unexpected authority attestation schema");
  }
  if (attestation.generation_id !== generation.generation_id) {
    fail("authority_generation_mismatch", "$generation.authority_attestation.generation_id", "Authority must bind this generation");
  }
  validateTypedRef(attestation.project_ref, "project", "$generation.authority_attestation.project_ref");
  assertRefEqual(attestation.project_ref, generation.project_ref, "$generation.authority_attestation.project_ref", "mixed_project");
  assertDigest(attestation.generation_binding_digest, "$generation.authority_attestation.generation_binding_digest");
  if (attestation.generation_binding_digest !== computeProjectHistoryReceiptAdapterGenerationBindingDigest(generation)) {
    fail("generation_binding_digest_mismatch", "$generation.authority_attestation.generation_binding_digest", "Authority is not bound to this generation core");
  }
  if (attestation.authority_scope !== "project_history_shadow_adapter"
      || attestation.classification_epoch !== null
      || attestation.projector_epoch !== null
      || attestation.production_authority_granted !== false
      || attestation.raw_ingress_authority_reused !== false) {
    fail(
      "authority_scope_invalid",
      "$generation.authority_attestation",
      "Generation authority must remain separate feature-OFF Shadow authority without production epochs",
    );
  }
  if (!Number.isSafeInteger(attestation.writer_epoch) || attestation.writer_epoch < 1) {
    fail("writer_authority_epoch_invalid", "$generation.authority_attestation.writer_epoch", "Writer epoch must be positive");
  }
  assertDigest(attestation.writer_authority_digest, "$generation.authority_attestation.writer_authority_digest");
  validateWriterNodeId(attestation.writer_node_id, "$generation.authority_attestation.writer_node_id");
  assertCanonicalUtc(attestation.issued_at, "$generation.authority_attestation.issued_at");
  assertCanonicalUtc(attestation.expires_at, "$generation.authority_attestation.expires_at");
  // Historical attestation consistency is deterministic and carries no live
  // capability; live projection always requires the opaque current snapshot.
  if (attestation.issued_at >= attestation.expires_at
      || generation.generated_at < attestation.issued_at || generation.generated_at >= attestation.expires_at) {
    fail("stale_writer_authority", "$generation.authority_attestation", "Generation time is outside the authority window");
  }
  if (attestation.raw_payload_copied !== false || attestation.accepted_history !== false) {
    fail("authority_boundary_invalid", "$generation.authority_attestation", "Authority attestation must remain metadata-only Shadow");
  }

  denseArray(attestation.event_metadata, "$generation.authority_attestation.event_metadata");
  if (attestation.event_metadata.length !== generation.envelopes.length) {
    fail("event_authority_count_mismatch", "$generation.authority_attestation.event_metadata", "Every event requires one authority row");
  }
  const expectedTuple = {
    writer_epoch: attestation.writer_epoch,
    writer_authority_digest: attestation.writer_authority_digest,
    writer_node_id: attestation.writer_node_id,
  };
  for (let index = 0; index < attestation.event_metadata.length; index += 1) {
    const row = attestation.event_metadata[index];
    const envelope = generation.envelopes[index];
    const source = generation.source_attestations[index];
    exactKeys(row, EVENT_AUTHORITY_FIELDS, `$generation.authority_attestation.event_metadata[${index}]`);
    if (row.lane !== envelope.lane || !refsEqual(row.event_ref, envelope.event_ref)
        || row.event_metadata_digest !== envelope.metadata_digest
        || row.source_attestation_digest !== source.attestation_digest) {
      fail("event_authority_binding_mismatch", `$generation.authority_attestation.event_metadata[${index}]`, "Event authority row does not bind the exact event and source attestation");
    }
    validateAuthorityTuple(row, expectedTuple, `$generation.authority_attestation.event_metadata[${index}]`);
  }

  denseArray(attestation.coverage_metadata, "$generation.authority_attestation.coverage_metadata");
  if (attestation.coverage_metadata.length !== PROJECT_HISTORY_LANES.length) {
    fail("coverage_authority_count_mismatch", "$generation.authority_attestation.coverage_metadata", "Exactly five coverage authority rows are required");
  }
  for (let index = 0; index < attestation.coverage_metadata.length; index += 1) {
    const row = attestation.coverage_metadata[index];
    const coverage = generation.coverage_receipts[index];
    exactKeys(row, COVERAGE_AUTHORITY_FIELDS, `$generation.authority_attestation.coverage_metadata[${index}]`);
    if (row.lane !== coverage.lane || row.coverage_metadata_digest !== coverage.metadata_digest) {
      fail("coverage_authority_binding_mismatch", `$generation.authority_attestation.coverage_metadata[${index}]`, "Coverage authority row does not bind the exact receipt");
    }
    validateAuthorityTuple(row, expectedTuple, `$generation.authority_attestation.coverage_metadata[${index}]`);
  }
  assertDigest(attestation.attestation_digest, "$generation.authority_attestation.attestation_digest");
  if (attestation.attestation_digest !== computeProjectHistoryWriterAuthorityAttestationDigest(attestation)) {
    fail("authority_attestation_digest_mismatch", "$generation.authority_attestation.attestation_digest", "Authority attestation digest does not match metadata");
  }
}

export function validateProjectHistoryReceiptAdapterGenerationV2(generation) {
  canonicalJson(generation);
  exactKeys(generation, GENERATION_FIELDS, "$generation");
  if (generation.schema_version !== PROJECT_HISTORY_RECEIPT_ADAPTER_GENERATION_SCHEMA_VERSION) {
    fail("generation_schema_invalid", "$generation.schema_version", "Unexpected receipt adapter generation schema");
  }
  validateGenerationId(generation.generation_id, "$generation.generation_id");
  assertCanonicalUtc(generation.generated_at, "$generation.generated_at");
  validateTypedRef(generation.project_ref, "project", "$generation.project_ref");
  if (generation.classification_state !== "shadow"
      || generation.raw_payload_copied !== false || generation.accepted_history !== false) {
    fail("generation_boundary_invalid", "$generation", "Generation must remain metadata-only Shadow");
  }
  denseArray(generation.envelopes, "$generation.envelopes");
  validateProjectHistoryEnvelopeCollection(generation.envelopes);
  const sorted = sortProjectHistoryEnvelopes(generation.envelopes);
  if (canonicalJson(sorted) !== canonicalJson(generation.envelopes)) {
    fail("envelope_order_invalid", "$generation.envelopes", "Envelopes must use canonical history order");
  }
  for (let index = 0; index < generation.envelopes.length; index += 1) {
    const envelope = generation.envelopes[index];
    assertRefEqual(envelope.project_ref, generation.project_ref, `$generation.envelopes[${index}].project_ref`, "mixed_project");
    if (envelope.classification_before?.state !== "unclassified"
        || envelope.classification_before?.project_ref !== null
        || envelope.classification_after?.state !== "classified"
        || !refsEqual(envelope.classification_after?.project_ref, generation.project_ref)
        || envelope.supersedes_event_ref !== null || envelope.raw_payload_copied !== false) {
      fail("shadow_event_boundary_invalid", `$generation.envelopes[${index}]`, "Events must remain initial metadata-only Shadow classification events");
    }
  }
  const nativeLanes = new Map();
  for (const envelope of generation.envelopes) {
    const key = nativeKey(envelope);
    const prior = nativeLanes.get(key);
    if (prior !== undefined) {
      fail(prior === envelope.lane ? "duplicate_native_occurrence" : "cross_lane_occurrence_conflict", "$generation.envelopes", "Native occurrences must be unique");
    }
    nativeLanes.set(key, envelope.lane);
  }

  denseArray(generation.coverage_receipts, "$generation.coverage_receipts");
  if (generation.coverage_receipts.length !== PROJECT_HISTORY_LANES.length) {
    fail("coverage_lane_count_invalid", "$generation.coverage_receipts", "Exactly five coverage receipts are required");
  }
  for (let index = 0; index < PROJECT_HISTORY_LANES.length; index += 1) {
    const lane = PROJECT_HISTORY_LANES[index];
    const receipt = generation.coverage_receipts[index];
    const laneEnvelopes = generation.envelopes.filter((envelope) => envelope.lane === lane);
    validateProjectHistoryCoverageReceipt(receipt, laneEnvelopes);
    if (receipt.lane !== lane || !COVERAGE_STATES.includes(receipt.state)) {
      fail("coverage_order_or_state_invalid", `$generation.coverage_receipts[${index}]`, "Coverage must use canonical lane order and the v2 state subset");
    }
    assertRefEqual(receipt.project_ref, generation.project_ref, `$generation.coverage_receipts[${index}].project_ref`, "mixed_project");
  }

  denseArray(generation.source_attestations, "$generation.source_attestations");
  if (generation.source_attestations.length !== generation.envelopes.length) {
    fail("source_attestation_count_mismatch", "$generation.source_attestations", "Every event requires one source attestation");
  }
  exactKeys(generation.authority_attestation, AUTHORITY_ATTESTATION_FIELDS, "$generation.authority_attestation");
  for (let index = 0; index < generation.source_attestations.length; index += 1) {
    validateSourceAttestation(generation.source_attestations[index], generation, generation.envelopes[index], `$generation.source_attestations[${index}]`);
  }
  validateAuthorityAttestation(generation.authority_attestation, generation);
  assertDigest(generation.source_attestation_digest, "$generation.source_attestation_digest");
  const sourceDigest = sha256Canonical(generation.source_attestations.map((entry) => entry.attestation_digest));
  if (generation.source_attestation_digest !== sourceDigest) {
    fail("source_attestation_set_digest_mismatch", "$generation.source_attestation_digest", "Source attestation set digest does not match rows");
  }
  assertDigest(generation.ordered_event_digest, "$generation.ordered_event_digest");
  const eventDigest = sha256Canonical(generation.envelopes.map((envelope) => envelope.metadata_digest));
  if (generation.ordered_event_digest !== eventDigest) {
    fail("ordered_event_digest_mismatch", "$generation.ordered_event_digest", "Ordered event digest does not match envelopes");
  }
  assertDigest(generation.request_digest, "$generation.request_digest");
  assertDigest(generation.generation_digest, "$generation.generation_digest");
  if (generation.generation_digest !== computeProjectHistoryReceiptAdapterGenerationDigest(generation)) {
    fail("generation_digest_mismatch", "$generation.generation_digest", "Generation digest does not match immutable metadata");
  }
  return generation;
}

export function replayProjectHistoryReceiptAdapterGenerationsV2(currentGenerations, incomingGeneration) {
  denseArray(currentGenerations, "$current_generations");
  validateProjectHistoryReceiptAdapterGenerationV2(incomingGeneration);
  const generations = [];
  const byGenerationId = new Map();
  const byEventRef = new Map();
  const envelopeByNativeRef = new Map();
  const occurrenceEvidenceBindings = {
    evidenceByEventRef: new Map(),
    evidenceByNativeRef: new Map(),
    occurrenceByEvidence: new Map(),
  };
  let highestEpoch = 0;
  let highestAuthority = null;

  for (let index = 0; index < currentGenerations.length; index += 1) {
    const generation = validateProjectHistoryReceiptAdapterGenerationV2(currentGenerations[index]);
    assertRefEqual(
      generation.project_ref,
      incomingGeneration.project_ref,
      `$current_generations[${index}].project_ref`,
      "mixed_project",
    );
    if (byGenerationId.has(generation.generation_id)) {
      fail("duplicate_generation_id", `$current_generations[${index}].generation_id`, "Current generations contain a duplicate ID");
    }
    byGenerationId.set(generation.generation_id, generation);
    generations.push(generation);
    const authority = generation.authority_attestation;
    if (authority.writer_epoch > highestEpoch) {
      highestEpoch = authority.writer_epoch;
      highestAuthority = authority;
    } else if (authority.writer_epoch === highestEpoch && highestAuthority
        && (authority.writer_authority_digest !== highestAuthority.writer_authority_digest
          || authority.writer_node_id !== highestAuthority.writer_node_id)) {
      fail("writer_authority_epoch_conflict", `$current_generations[${index}].authority_attestation`, "One epoch cannot name two writer authorities");
    }
    for (const envelope of generation.envelopes) {
      const priorEvent = byEventRef.get(eventKey(envelope));
      if (priorEvent !== undefined && canonicalJson(priorEvent) !== canonicalJson(envelope)) {
        fail("event_ref_conflict", `$current_generations[${index}].envelopes`, "Event ref has conflicting immutable metadata");
      }
      byEventRef.set(eventKey(envelope), envelope);
      const priorNative = envelopeByNativeRef.get(nativeKey(envelope));
      if (priorNative !== undefined && priorNative.lane !== envelope.lane) {
        fail("cross_lane_occurrence_conflict", `$current_generations[${index}].envelopes`, "Native occurrence crossed lanes");
      }
      if (priorNative !== undefined && eventKey(priorNative) !== eventKey(envelope)) {
        fail("native_occurrence_conflict", `$current_generations[${index}].envelopes`, "Native occurrence mapped to a different event");
      }
      envelopeByNativeRef.set(nativeKey(envelope), envelope);
    }
    bindOccurrenceEvidence(generation, occurrenceEvidenceBindings, `$current_generations[${index}]`);
  }

  generations.sort((left, right) => Buffer.compare(Buffer.from(left.generated_at), Buffer.from(right.generated_at))
    || Buffer.compare(Buffer.from(left.generation_id), Buffer.from(right.generation_id)));

  const priorGeneration = byGenerationId.get(incomingGeneration.generation_id);
  if (priorGeneration !== undefined) {
    if (canonicalJson(priorGeneration) !== canonicalJson(incomingGeneration)) {
      fail("generation_id_conflict", "$incoming_generation", "Generation ID has conflicting immutable metadata");
    }
    return {
      generations,
      added_count: 0,
      replayed_count: 1,
      collection_digest: sha256Canonical(generations.map((entry) => entry.generation_digest)),
    };
  }

  assertRefEqual(
    incomingGeneration.project_ref,
    generations[0]?.project_ref ?? incomingGeneration.project_ref,
    "$incoming_generation.project_ref",
    "mixed_project",
  );
  const incomingAuthority = incomingGeneration.authority_attestation;
  if (incomingAuthority.writer_epoch < highestEpoch) {
    fail("stale_writer_authority_epoch", "$incoming_generation.authority_attestation.writer_epoch", "Incoming generation uses an older writer epoch");
  }
  if (incomingAuthority.writer_epoch === highestEpoch && highestAuthority
      && (incomingAuthority.writer_authority_digest !== highestAuthority.writer_authority_digest
        || incomingAuthority.writer_node_id !== highestAuthority.writer_node_id)) {
    fail("writer_authority_epoch_conflict", "$incoming_generation.authority_attestation", "One epoch cannot name two writer authorities");
  }
  for (const envelope of incomingGeneration.envelopes) {
    const priorEvent = byEventRef.get(eventKey(envelope));
    if (priorEvent !== undefined && canonicalJson(priorEvent) !== canonicalJson(envelope)) {
      fail("event_ref_conflict", "$incoming_generation.envelopes", "Event ref has conflicting immutable metadata");
    }
    const priorNative = envelopeByNativeRef.get(nativeKey(envelope));
    if (priorNative !== undefined && priorNative.lane !== envelope.lane) {
      fail("cross_lane_occurrence_conflict", "$incoming_generation.envelopes", "Native occurrence crossed lanes");
    }
    if (priorNative !== undefined && eventKey(priorNative) !== eventKey(envelope)) {
      fail("native_occurrence_conflict", "$incoming_generation.envelopes", "Native occurrence mapped to a different event");
    }
  }
  bindOccurrenceEvidence(incomingGeneration, occurrenceEvidenceBindings, "$incoming_generation");
  generations.push(incomingGeneration);
  generations.sort((left, right) => Buffer.compare(Buffer.from(left.generated_at), Buffer.from(right.generated_at))
    || Buffer.compare(Buffer.from(left.generation_id), Buffer.from(right.generation_id)));
  return {
    generations,
    added_count: 1,
    replayed_count: 0,
    collection_digest: sha256Canonical(generations.map((entry) => entry.generation_digest)),
  };
}

export const adaptProjectHistoryReceiptsV2 = buildProjectHistoryReceiptAdapterGenerationV2;
export const buildContinuousProjectHistoryShadowGenerationV2 = buildProjectHistoryReceiptAdapterGenerationV2;
export const validateContinuousProjectHistoryShadowGenerationV2 = validateProjectHistoryReceiptAdapterGenerationV2;
export const replayContinuousProjectHistoryShadowGenerationsV2 = replayProjectHistoryReceiptAdapterGenerationsV2;
