import {
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

export const ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION =
  "soulforge.project_history_actual_shadow_pilot_packet.v1";
export const ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION =
  "soulforge.project_history_actual_shadow_generation.v1";
export const CUSTODY_RECEIPT_PROOF_SCHEMA_VERSION =
  "soulforge.project_history_custody_receipt_proof.v1";
export const SHADOW_CLASSIFICATION_EVIDENCE_SCHEMA_VERSION =
  "soulforge.project_history_shadow_classification_evidence.v1";

export const ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE = Object.freeze({
  mail: "mail",
  voice: "voice",
  structured_pc_work: "structured_pc_work",
  file: "team_files",
  run_log: "run_logs",
});

export const ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE = Object.freeze({
  mail: "mail_occurrence",
  voice: "voice_recording",
  structured_pc_work: "bounded_pc_work_event",
  file: "file_observation",
  run_log: "bounded_run_event",
});

const PACKET_FIELDS = Object.freeze([
  "schema_version",
  "feature_state",
  "generation_id",
  "project_ref",
  "window_start",
  "window_end",
  "lanes",
]);
const LANE_FIELDS = Object.freeze([
  "lane",
  "custody_lane",
  "semantic_occurrence",
  "custody_receipt_proof",
]);
const SEMANTIC_OCCURRENCE_FIELDS = Object.freeze([
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
  "source_digest",
  "custody_receipt_ref",
  "custody_receipt_digest",
  "classification_evidence",
]);
const CUSTODY_RECEIPT_PROOF_FIELDS = Object.freeze([
  "schema_version",
  "receipt_schema_version",
  "receipt_ref",
  "custody_lane",
  "source_owner_ref",
  "source_identity_digest",
  "source_digest",
  "source_size",
  "project_state",
  "source_deleted",
  "source_overwritten",
  "receipt_digest",
  "proof_digest",
]);
const CLASSIFICATION_EVIDENCE_FIELDS = Object.freeze([
  "schema_version",
  "evidence_ref",
  "generation_id",
  "lane",
  "native_occurrence_ref",
  "event_ref",
  "custody_receipt_ref",
  "custody_receipt_digest",
  "source_digest",
  "project_ref",
  "classification_before",
  "classification_after",
  "shadow_only",
  "evidence_digest",
]);
const CLASSIFICATION_FIELDS = Object.freeze(["state", "project_ref"]);
const GENERATION_FIELDS = Object.freeze([
  "schema_version",
  "generation_id",
  "project_ref",
  "classification_state",
  "envelopes",
  "coverage_receipts",
  "ordered_event_digest",
  "source_attestation_digest",
  "raw_payload_copied",
  "accepted_history",
]);

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORBIDDEN_FIELD_TOKENS = new Set([
  "raw", "path", "uri", "url", "body", "transcript", "payload",
]);

export class ActualProjectHistoryShadowError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ActualProjectHistoryShadowError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ActualProjectHistoryShadowError(code, path, message);
}

function exactKeys(value, expected, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", path, "Fields do not match the actual Shadow contract");
  }
}

function denseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain dense array");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse_array_forbidden", `${path}[${index}]`, "Sparse arrays are forbidden");
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

function assertNoForbiddenFields(value, path = "$packet") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoForbiddenFields(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const forbidden = fieldTokens(key).find((token) => FORBIDDEN_FIELD_TOKENS.has(token));
    if (forbidden !== undefined) {
      fail("forbidden_field", `${path}.${key}`, `${forbidden} fields are forbidden recursively`);
    }
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function assertDigest(value, path) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail("digest_invalid", path, "Expected sha256 plus 64 lowercase hex characters");
  }
  return value;
}

function assertCanonicalUtc(value, path) {
  if (typeof value !== "string" || !UTC_MILLISECONDS_PATTERN.test(value)
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail("timestamp_invalid", path, "Expected canonical UTC ISO 8601 milliseconds");
  }
  return value;
}

function assertGenerationId(value, path) {
  validateTypedRef({
    entity_type: "shadow_generation",
    owner_surface: "project_history_actual_shadow",
    entity_id: value,
  }, "shadow_generation", path);
  return value;
}

function refsEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertRefEqual(left, right, path, code) {
  if (!refsEqual(left, right)) fail(code, path, "Typed refs must match byte-exactly");
}

function projectionWithout(value, field) {
  const projection = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== field) projection[key] = child;
  }
  return projection;
}

export function computeCustodyReceiptProofDigest(proof) {
  canonicalJson(proof);
  exactKeys(proof, CUSTODY_RECEIPT_PROOF_FIELDS, "$custody_receipt_proof");
  return sha256Canonical(projectionWithout(proof, "proof_digest"));
}

export function computeShadowClassificationEvidenceDigest(evidence) {
  canonicalJson(evidence);
  exactKeys(evidence, CLASSIFICATION_EVIDENCE_FIELDS, "$classification_evidence");
  return sha256Canonical(projectionWithout(evidence, "evidence_digest"));
}

function validateClassification(value, expectedState, expectedProjectRef, path) {
  exactKeys(value, CLASSIFICATION_FIELDS, path);
  if (value.state !== expectedState) {
    fail("classification_state_invalid", `${path}.state`, `Expected ${expectedState}`);
  }
  if (expectedProjectRef === null) {
    if (value.project_ref !== null) {
      fail("classification_project_invalid", `${path}.project_ref`, "Unclassified evidence must use null project_ref");
    }
  } else {
    validateTypedRef(value.project_ref, "project", `${path}.project_ref`);
    assertRefEqual(value.project_ref, expectedProjectRef, `${path}.project_ref`, "classification_project_mismatch");
  }
}

function validateCustodyReceiptProof(proof, lane, custodyLane, path) {
  exactKeys(proof, CUSTODY_RECEIPT_PROOF_FIELDS, path);
  if (proof.schema_version !== CUSTODY_RECEIPT_PROOF_SCHEMA_VERSION) {
    fail("custody_proof_schema_invalid", `${path}.schema_version`, "Unexpected custody proof schema");
  }
  if (proof.receipt_schema_version !== "soulforge.ingress.staging_receipt.v1") {
    fail("custody_receipt_schema_invalid", `${path}.receipt_schema_version`, "Expected the bounded staging receipt schema");
  }
  validateTypedRef(proof.receipt_ref, "custody_receipt", `${path}.receipt_ref`);
  if (proof.custody_lane !== custodyLane) {
    fail("custody_lane_mismatch", `${path}.custody_lane`, `Expected ${custodyLane} for ${lane}`);
  }
  validateTypedRef(proof.source_owner_ref, "source_owner", `${path}.source_owner_ref`);
  assertDigest(proof.source_identity_digest, `${path}.source_identity_digest`);
  assertDigest(proof.source_digest, `${path}.source_digest`);
  if (!Number.isSafeInteger(proof.source_size) || proof.source_size < 0) {
    fail("source_size_invalid", `${path}.source_size`, "Expected a nonnegative safe integer");
  }
  if (proof.project_state !== "unclassified") {
    fail("custody_project_state_invalid", `${path}.project_state`, "Custody proof must precede project classification");
  }
  if (proof.source_deleted !== false || proof.source_overwritten !== false) {
    fail("source_preservation_required", path, "Custody proof must preserve the source");
  }
  assertDigest(proof.receipt_digest, `${path}.receipt_digest`);
  assertDigest(proof.proof_digest, `${path}.proof_digest`);
  if (proof.proof_digest !== computeCustodyReceiptProofDigest(proof)) {
    fail("proof_digest_mismatch", `${path}.proof_digest`, "Custody proof digest does not match its metadata");
  }
}

function validateClassificationEvidence(evidence, packet, laneEntry, path) {
  exactKeys(evidence, CLASSIFICATION_EVIDENCE_FIELDS, path);
  if (evidence.schema_version !== SHADOW_CLASSIFICATION_EVIDENCE_SCHEMA_VERSION) {
    fail("classification_evidence_schema_invalid", `${path}.schema_version`, "Unexpected classification evidence schema");
  }
  validateTypedRef(evidence.evidence_ref, "classification_evidence", `${path}.evidence_ref`);
  if (evidence.generation_id !== packet.generation_id) {
    fail("generation_mismatch", `${path}.generation_id`, "Every classification proof must bind one generation");
  }
  if (evidence.lane !== laneEntry.lane) {
    fail("classification_lane_mismatch", `${path}.lane`, "Classification proof must bind its lane");
  }
  validateTypedRef(evidence.native_occurrence_ref, null, `${path}.native_occurrence_ref`);
  validateTypedRef(evidence.event_ref, "event", `${path}.event_ref`);
  validateTypedRef(evidence.custody_receipt_ref, "custody_receipt", `${path}.custody_receipt_ref`);
  assertDigest(evidence.custody_receipt_digest, `${path}.custody_receipt_digest`);
  assertDigest(evidence.source_digest, `${path}.source_digest`);
  validateTypedRef(evidence.project_ref, "project", `${path}.project_ref`);
  assertRefEqual(evidence.project_ref, packet.project_ref, `${path}.project_ref`, "project_mismatch");
  validateClassification(evidence.classification_before, "unclassified", null, `${path}.classification_before`);
  validateClassification(evidence.classification_after, "classified", packet.project_ref, `${path}.classification_after`);
  if (evidence.shadow_only !== true) {
    fail("shadow_evidence_required", `${path}.shadow_only`, "Classification evidence must be Shadow-only");
  }
  assertDigest(evidence.evidence_digest, `${path}.evidence_digest`);
  if (evidence.evidence_digest !== computeShadowClassificationEvidenceDigest(evidence)) {
    fail("classification_evidence_digest_mismatch", `${path}.evidence_digest`, "Classification evidence digest does not match its metadata");
  }
}

function validateLaneEntry(entry, packet, path) {
  exactKeys(entry, LANE_FIELDS, path);
  if (!PROJECT_HISTORY_LANES.includes(entry.lane)) {
    fail("lane_invalid", `${path}.lane`, "Lane is outside the five-lane contract");
  }
  const expectedCustodyLane = ACTUAL_SHADOW_CUSTODY_LANE_BY_HISTORY_LANE[entry.lane];
  if (entry.custody_lane !== expectedCustodyLane) {
    fail("custody_lane_mismatch", `${path}.custody_lane`, `Expected ${expectedCustodyLane}`);
  }

  const semantic = entry.semantic_occurrence;
  exactKeys(semantic, SEMANTIC_OCCURRENCE_FIELDS, `${path}.semantic_occurrence`);
  validateTypedRef(semantic.source_owner_ref, "source_owner", `${path}.semantic_occurrence.source_owner_ref`);
  validateTypedRef(semantic.native_occurrence_ref, null, `${path}.semantic_occurrence.native_occurrence_ref`);
  const expectedNativeType = ACTUAL_SHADOW_NATIVE_OCCURRENCE_TYPE_BY_HISTORY_LANE[entry.lane];
  if (semantic.native_occurrence_ref.entity_type !== expectedNativeType) {
    fail(
      "native_occurrence_type_mismatch",
      `${path}.semantic_occurrence.native_occurrence_ref.entity_type`,
      `Expected bounded pilot type ${expectedNativeType}`,
    );
  }
  validateTypedRef(semantic.event_ref, "event", `${path}.semantic_occurrence.event_ref`);
  if (semantic.source_revision_ref !== null) {
    validateTypedRef(semantic.source_revision_ref, "source_revision", `${path}.semantic_occurrence.source_revision_ref`);
  }
  if (semantic.content_ref !== null) {
    validateTypedRef(semantic.content_ref, "content", `${path}.semantic_occurrence.content_ref`);
  }
  if ((semantic.source_revision_ref === null) !== (semantic.content_ref === null)) {
    fail("source_content_pair_required", `${path}.semantic_occurrence`, "Source revision and content refs must be present together or both null");
  }
  assertDigest(semantic.source_digest, `${path}.semantic_occurrence.source_digest`);
  validateTypedRef(semantic.custody_receipt_ref, "custody_receipt", `${path}.semantic_occurrence.custody_receipt_ref`);
  assertDigest(semantic.custody_receipt_digest, `${path}.semantic_occurrence.custody_receipt_digest`);

  const proofPath = `${path}.custody_receipt_proof`;
  validateCustodyReceiptProof(entry.custody_receipt_proof, entry.lane, entry.custody_lane, proofPath);
  assertRefEqual(
    semantic.source_owner_ref,
    entry.custody_receipt_proof.source_owner_ref,
    `${path}.semantic_occurrence.source_owner_ref`,
    "source_owner_mismatch",
  );
  assertRefEqual(
    semantic.custody_receipt_ref,
    entry.custody_receipt_proof.receipt_ref,
    `${path}.semantic_occurrence.custody_receipt_ref`,
    "custody_receipt_ref_mismatch",
  );
  if (semantic.custody_receipt_digest !== entry.custody_receipt_proof.receipt_digest) {
    fail("custody_receipt_digest_mismatch", `${path}.semantic_occurrence.custody_receipt_digest`, "Semantic occurrence must bind the attested receipt-byte digest");
  }
  if (semantic.source_digest !== entry.custody_receipt_proof.source_digest) {
    fail("source_digest_mismatch", `${path}.semantic_occurrence.source_digest`, "Semantic and custody source digests must match");
  }

  const evidencePath = `${path}.semantic_occurrence.classification_evidence`;
  const evidence = semantic.classification_evidence;
  validateClassificationEvidence(evidence, packet, entry, evidencePath);
  assertRefEqual(evidence.native_occurrence_ref, semantic.native_occurrence_ref, `${evidencePath}.native_occurrence_ref`, "native_occurrence_mismatch");
  assertRefEqual(evidence.event_ref, semantic.event_ref, `${evidencePath}.event_ref`, "event_ref_mismatch");
  assertRefEqual(evidence.custody_receipt_ref, semantic.custody_receipt_ref, `${evidencePath}.custody_receipt_ref`, "custody_receipt_ref_mismatch");
  if (evidence.custody_receipt_digest !== semantic.custody_receipt_digest) {
    fail("custody_receipt_digest_mismatch", `${evidencePath}.custody_receipt_digest`, "Classification evidence must bind the attested receipt-byte digest");
  }
  if (evidence.source_digest !== semantic.source_digest) {
    fail("source_digest_mismatch", `${evidencePath}.source_digest`, "Classification evidence must bind the custody source digest");
  }
}

export function validateActualFiveLaneShadowPilotPacket(packet) {
  canonicalJson(packet);
  assertNoForbiddenFields(packet);
  exactKeys(packet, PACKET_FIELDS, "$packet");
  if (packet.schema_version !== ACTUAL_SHADOW_PILOT_PACKET_SCHEMA_VERSION) {
    fail("packet_schema_invalid", "$packet.schema_version", "Unexpected actual Shadow pilot packet schema");
  }
  if (packet.feature_state !== "off") {
    fail("feature_must_be_off", "$packet.feature_state", "Actual Shadow generation is feature-OFF only");
  }
  assertGenerationId(packet.generation_id, "$packet.generation_id");
  validateTypedRef(packet.project_ref, "project", "$packet.project_ref");
  assertCanonicalUtc(packet.window_start, "$packet.window_start");
  assertCanonicalUtc(packet.window_end, "$packet.window_end");
  if (packet.window_start >= packet.window_end) {
    fail("coverage_window_invalid", "$packet", "Coverage window must have start before end");
  }
  denseArray(packet.lanes, "$packet.lanes");
  if (packet.lanes.length !== PROJECT_HISTORY_LANES.length) {
    fail("lane_count_invalid", "$packet.lanes", "Expected exactly one semantic occurrence and receipt proof per lane");
  }

  const seenLanes = new Set();
  const nativeOccurrenceLanes = new Map();
  const envelopes = [];
  for (let index = 0; index < packet.lanes.length; index += 1) {
    const entry = packet.lanes[index];
    validateLaneEntry(entry, packet, `$packet.lanes[${index}]`);
    envelopes.push(createEnvelope(packet, entry));
    if (seenLanes.has(entry.lane)) {
      fail("duplicate_lane", `$packet.lanes[${index}].lane`, "Every history lane must appear exactly once");
    }
    seenLanes.add(entry.lane);
    const nativeKey = canonicalJson(entry.semantic_occurrence.native_occurrence_ref);
    const priorLane = nativeOccurrenceLanes.get(nativeKey);
    if (priorLane !== undefined && priorLane !== entry.lane) {
      fail("cross_lane_occurrence_conflict", `$packet.lanes[${index}]`, "One native occurrence cannot be counted in two lanes");
    }
    nativeOccurrenceLanes.set(nativeKey, entry.lane);
  }
  for (const lane of PROJECT_HISTORY_LANES) {
    if (!seenLanes.has(lane)) fail("missing_lane", "$packet.lanes", `Missing ${lane}`);
    const laneEnvelopes = envelopes.filter((envelope) => envelope.lane === lane);
    createProjectHistoryCoverageReceipt({
      lane,
      source_owner_ref: laneEnvelopes[0].source_owner_ref,
      project_ref: packet.project_ref,
      window_start: packet.window_start,
      window_end: packet.window_end,
      state: "complete_with_events",
      gap_codes: [],
      applicability_ref: null,
    }, laneEnvelopes);
  }
  validateProjectHistoryEnvelopeCollection(envelopes);
  return packet;
}

function canonicalPacket(packet) {
  return {
    schema_version: packet.schema_version,
    feature_state: packet.feature_state,
    generation_id: packet.generation_id,
    project_ref: packet.project_ref,
    window_start: packet.window_start,
    window_end: packet.window_end,
    lanes: PROJECT_HISTORY_LANES.map((lane) => packet.lanes.find((entry) => entry.lane === lane)),
  };
}

export function computeSourceAttestationDigest(packet) {
  validateActualFiveLaneShadowPilotPacket(packet);
  return sha256Canonical(canonicalPacket(packet));
}

function eventKey(envelope) {
  return canonicalJson(envelope.event_ref);
}

export function replayActualProjectHistoryShadow(currentEnvelopes, incomingEnvelopes) {
  canonicalJson(currentEnvelopes);
  canonicalJson(incomingEnvelopes);
  denseArray(currentEnvelopes, "$current");
  denseArray(incomingEnvelopes, "$incoming");
  validateProjectHistoryEnvelopeCollection(currentEnvelopes);
  validateProjectHistoryEnvelopeCollection(incomingEnvelopes);

  const byEvent = new Map(currentEnvelopes.map((envelope) => [eventKey(envelope), envelope]));
  let addedCount = 0;
  let replayedCount = 0;
  for (const envelope of incomingEnvelopes) {
    const key = eventKey(envelope);
    const prior = byEvent.get(key);
    if (prior === undefined) {
      byEvent.set(key, envelope);
      addedCount += 1;
    } else if (canonicalJson(prior) === canonicalJson(envelope)) {
      replayedCount += 1;
    } else {
      fail("event_ref_conflict", "$incoming", "The same event ref has different immutable metadata");
    }
  }

  const merged = [...byEvent.values()];
  const laneByNativeOccurrence = new Map();
  for (const envelope of merged) {
    const key = canonicalJson(envelope.native_occurrence_ref);
    const priorLane = laneByNativeOccurrence.get(key);
    if (priorLane !== undefined && priorLane !== envelope.lane) {
      fail("cross_lane_occurrence_conflict", "$history", "One native occurrence cannot be counted in two lanes");
    }
    laneByNativeOccurrence.set(key, envelope.lane);
  }
  validateProjectHistoryEnvelopeCollection(merged);
  const envelopes = sortProjectHistoryEnvelopes(merged);
  return {
    envelopes,
    added_count: addedCount,
    replayed_count: replayedCount,
    ordered_event_digest: sha256Canonical(envelopes.map((envelope) => envelope.metadata_digest)),
  };
}

function createEnvelope(packet, laneEntry) {
  const semantic = laneEntry.semantic_occurrence;
  const evidence = semantic.classification_evidence;
  return createProjectHistoryEnvelope({
    lane: laneEntry.lane,
    source_owner_ref: semantic.source_owner_ref,
    native_occurrence_ref: semantic.native_occurrence_ref,
    event_ref: semantic.event_ref,
    source_revision_ref: semantic.source_revision_ref,
    content_ref: semantic.content_ref,
    project_ref: packet.project_ref,
    event_at: semantic.event_at,
    valid_at: semantic.valid_at,
    observed_at: semantic.observed_at,
    known_at: semantic.known_at,
    recorded_at: semantic.recorded_at,
    classification_before: evidence.classification_before,
    classification_after: evidence.classification_after,
    supersedes_event_ref: null,
  });
}

export function validateActualFiveLaneShadowGeneration(generation) {
  canonicalJson(generation);
  exactKeys(generation, GENERATION_FIELDS, "$generation");
  if (generation.schema_version !== ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION) {
    fail("generation_schema_invalid", "$generation.schema_version", "Unexpected actual Shadow generation schema");
  }
  assertGenerationId(generation.generation_id, "$generation.generation_id");
  validateTypedRef(generation.project_ref, "project", "$generation.project_ref");
  if (generation.classification_state !== "shadow") {
    fail("classification_state_invalid", "$generation.classification_state", "Generation must remain Shadow");
  }
  if (generation.raw_payload_copied !== false || generation.accepted_history !== false) {
    fail("generation_boundary_invalid", "$generation", "Raw copying and accepted-history promotion are forbidden");
  }
  assertDigest(generation.source_attestation_digest, "$generation.source_attestation_digest");
  denseArray(generation.envelopes, "$generation.envelopes");
  denseArray(generation.coverage_receipts, "$generation.coverage_receipts");
  if (generation.envelopes.length !== PROJECT_HISTORY_LANES.length
      || generation.coverage_receipts.length !== PROJECT_HISTORY_LANES.length) {
    fail("generation_lane_count_invalid", "$generation", "Generation requires five envelopes and five coverage receipts");
  }
  validateProjectHistoryEnvelopeCollection(generation.envelopes);
  const replay = replayActualProjectHistoryShadow([], generation.envelopes);
  if (canonicalJson(replay.envelopes) !== canonicalJson(generation.envelopes)) {
    fail("envelope_order_invalid", "$generation.envelopes", "Envelopes must use canonical history ordering");
  }
  if (generation.ordered_event_digest !== replay.ordered_event_digest) {
    fail("ordered_event_digest_mismatch", "$generation.ordered_event_digest", "Generation digest does not match its envelopes");
  }

  for (let index = 0; index < PROJECT_HISTORY_LANES.length; index += 1) {
    const lane = PROJECT_HISTORY_LANES[index];
    const laneEnvelopes = generation.envelopes.filter((envelope) => envelope.lane === lane);
    if (laneEnvelopes.length !== 1) {
      fail("one_event_per_lane_required", `$generation.envelopes.${lane}`, "Generation requires one event per lane");
    }
    const envelope = laneEnvelopes[0];
    assertRefEqual(envelope.project_ref, generation.project_ref, `$generation.envelopes.${lane}.project_ref`, "project_mismatch");
    validateClassification(envelope.classification_before, "unclassified", null, `$generation.envelopes.${lane}.classification_before`);
    validateClassification(envelope.classification_after, "classified", generation.project_ref, `$generation.envelopes.${lane}.classification_after`);
    if (envelope.supersedes_event_ref !== null || envelope.raw_payload_copied !== false) {
      fail("initial_shadow_event_required", `$generation.envelopes.${lane}`, "Actual pilot events must remain initial metadata-only Shadow events");
    }

    const receipt = generation.coverage_receipts[index];
    validateProjectHistoryCoverageReceipt(receipt, laneEnvelopes);
    if (receipt.lane !== lane || receipt.state !== "complete_with_events" || receipt.event_count !== 1) {
      fail("coverage_order_or_state_invalid", `$generation.coverage_receipts[${index}]`, "Coverage must bind one event in canonical lane order");
    }
  }
  return generation;
}

export function buildActualFiveLaneShadowGeneration(packet) {
  validateActualFiveLaneShadowPilotPacket(packet);
  const normalizedPacket = canonicalPacket(packet);
  const incoming = normalizedPacket.lanes.map((entry) => createEnvelope(normalizedPacket, entry));
  const replay = replayActualProjectHistoryShadow([], incoming);
  const coverageReceipts = PROJECT_HISTORY_LANES.map((lane) => {
    const laneEnvelopes = replay.envelopes.filter((envelope) => envelope.lane === lane);
    return createProjectHistoryCoverageReceipt({
      lane,
      source_owner_ref: laneEnvelopes[0].source_owner_ref,
      project_ref: normalizedPacket.project_ref,
      window_start: normalizedPacket.window_start,
      window_end: normalizedPacket.window_end,
      state: "complete_with_events",
      gap_codes: [],
      applicability_ref: null,
    }, laneEnvelopes);
  });

  return validateActualFiveLaneShadowGeneration({
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: normalizedPacket.generation_id,
    project_ref: normalizedPacket.project_ref,
    classification_state: "shadow",
    envelopes: replay.envelopes,
    coverage_receipts: coverageReceipts,
    ordered_event_digest: replay.ordered_event_digest,
    source_attestation_digest: sha256Canonical(normalizedPacket),
    raw_payload_copied: false,
    accepted_history: false,
  });
}
