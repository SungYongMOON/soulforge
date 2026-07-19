import {
  PROJECT_HISTORY_LANES,
  canonicalJson,
  createProjectHistoryCoverageReceipt,
  createProjectHistoryEnvelope,
  sha256Canonical,
  sortProjectHistoryEnvelopes,
  validateProjectHistoryCoverageReceipt,
  validateProjectHistoryEnvelope,
  validateProjectHistoryEnvelopeCollection,
} from "./project_history_envelope.mjs";

export const TASK_ENGINE_PUBLIC_GATE_MAP_SCHEMA_VERSION = "soulforge.task_engine_public_gate_map.v1";
export const PROJECT_HISTORY_READINESS_SCHEMA_VERSION = "soulforge.project_history_readiness.v1";

export const TASK_ENGINE_PUBLIC_GATE_ORDER = Object.freeze([
  "C00A", "C00Q", "C00B", "P0", "H00", "H01", "H02", "H03", "H04", "H05", "H06", "P1",
]);

export const PROJECT_HISTORY_READINESS_PROFILES = Object.freeze({
  mail: Object.freeze({
    phase_id: "H01",
    native_occurrence_entity_types: Object.freeze(["mail_occurrence"]),
    candidate_owner_surfaces: Object.freeze([]),
    binding_state: "owner_ratification_required",
  }),
  voice: Object.freeze({
    phase_id: "H02",
    native_occurrence_entity_types: Object.freeze(["voice_recording"]),
    candidate_owner_surfaces: Object.freeze(["voice_capture"]),
    binding_state: "mapping_ratification_required",
  }),
  structured_pc_work: Object.freeze({
    phase_id: "H03",
    native_occurrence_entity_types: Object.freeze(["erp_mcp_work_session"]),
    candidate_owner_surfaces: Object.freeze(["dev_erp"]),
    binding_state: "schedule_branch_hold",
  }),
  file: Object.freeze({
    phase_id: "H04",
    native_occurrence_entity_types: Object.freeze([
      "file_observation", "file_reconciliation_event", "erp_upload_event",
    ]),
    candidate_owner_surfaces: Object.freeze(["file_activity", "dev_erp"]),
    binding_state: "subtype_ratification_required",
  }),
  run_log: Object.freeze({
    phase_id: "H05",
    native_occurrence_entity_types: Object.freeze(["workflow_job"]),
    candidate_owner_surfaces: Object.freeze(["report_authoring_v0"]),
    binding_state: "schema_ratification_required",
  }),
});

const GATE_ENTRY_FIELDS = Object.freeze([
  "gate_id", "status", "evidence_ref", "evidence_scope", "progression_accepted",
  "blocking_reasons", "private_locator_copied",
]);
const GATE_MAP_FIELDS = Object.freeze([
  "schema_version", "map_id", "entries", "activation_allowed", "private_locator_copied",
]);
const GATE_STATUSES = new Set([
  "historical_blocker_accepted", "retained_formal_pass_receipt", "blocked", "hold",
]);
const CURRENT_GATE_ENTRY_CONTRACTS = Object.freeze({
  C00A: Object.freeze({ status: "historical_blocker_accepted", evidence_ref: "task_engine_c00a_public_result_c00q_next_owner_packet_v1", evidence_scope: "public_static", blocking_reasons: Object.freeze(["current_execution_authority_absent"]) }),
  C00Q: Object.freeze({ status: "retained_formal_pass_receipt", evidence_ref: "task_engine_c00q_formal_acceptance_pass_v1", evidence_scope: "public_synthetic", blocking_reasons: Object.freeze(["current_execution_authority_expired"]) }),
  C00B: Object.freeze({ status: "blocked", evidence_ref: "task_engine_c00b_live_binding_actual_inventory_result_v1", evidence_scope: "private_metadata_ref", blocking_reasons: Object.freeze(["formal_pass_receipt_absent"]) }),
  P0: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["c00b_formal_pass_required"]) }),
  H00: Object.freeze({ status: "hold", evidence_ref: "project_history_envelope_v0_candidate", evidence_scope: "public_static", blocking_reasons: Object.freeze(["owner_ratification_required"]) }),
  H01: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["mail_owner_mapping_required"]) }),
  H02: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["voice_mapping_ratification_required"]) }),
  H03: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["external_schedule_owner_required"]) }),
  H04: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["file_subtype_mapping_required"]) }),
  H05: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["run_schema_ratification_required"]) }),
  H06: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["five_lane_acceptance_required"]) }),
  P1: Object.freeze({ status: "hold", evidence_ref: "none", evidence_scope: "none", blocking_reasons: Object.freeze(["h06_formal_pass_required"]) }),
});
const EVIDENCE_SCOPES = new Set(["public_static", "public_synthetic", "private_metadata_ref", "none"]);
const FORMAL_RECEIPT_EVIDENCE_SCOPES = new Set(["public_synthetic", "private_metadata_ref"]);
const EVIDENCE_REF_TOKEN = /^(?:none|(?:task_engine|project_history)_[a-z0-9]+(?:_[a-z0-9]+)*)$/u;
const REASON_TOKEN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const SYNTHETIC_PROJECT_ID_TOKEN = /^synthetic-project-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const PREREQUISITES = Object.freeze({
  C00A: Object.freeze([]),
  C00Q: Object.freeze(["C00A"]),
  C00B: Object.freeze(["C00Q"]),
  P0: Object.freeze(["C00B"]),
  H00: Object.freeze(["P0"]),
  H01: Object.freeze(["H00"]),
  H02: Object.freeze(["H00"]),
  H03: Object.freeze(["H00"]),
  H04: Object.freeze(["H00"]),
  H05: Object.freeze(["H00"]),
  H06: Object.freeze(["H01", "H02", "H03", "H04", "H05"]),
  P1: Object.freeze(["H06"]),
});

function hasAcceptedPrerequisiteReceipt(entry) {
  if (entry.gate_id === "C00A") return entry.status === "historical_blocker_accepted";
  return entry.status === "retained_formal_pass_receipt";
}

export class ProjectHistoryReadinessError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = "ProjectHistoryReadinessError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new ProjectHistoryReadinessError(code, path, message);
}

function exactKeys(value, expected, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("plain_object_required", path, "Expected a plain object");
  }
  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key !== "string") fail("symbol_key_not_allowed", path, "Symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}.${key}`, "Only enumerable data properties are allowed");
    }
  }
  const keys = ownKeys.sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    fail("exact_fields_required", path, "Fields do not match the public contract");
  }
}

function denseArray(value, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail("array_required", path, "Expected a plain array");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("symbol_key_not_allowed", path, "Symbol keys are forbidden");
    if (key === "length") continue;
    if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) {
      fail("array_extra_property", `${path}.${key}`, "Only dense array indices are allowed");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail("data_property_required", `${path}[${key}]`, "Only enumerable data properties are allowed");
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail("sparse_array_not_allowed", `${path}[${index}]`, "Sparse arrays are forbidden");
  }
  return value;
}

function safeMapId(value, path) {
  if (typeof value !== "string" || !/^task-engine-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    fail("map_id_invalid", path, "Map IDs must be opaque task-engine-* identifiers");
  }
  return value;
}

function safeSyntheticProjectId(value, path) {
  if (typeof value !== "string" || !SYNTHETIC_PROJECT_ID_TOKEN.test(value)) {
    fail("synthetic_project_id_invalid", path, "Synthetic project IDs must use the synthetic-project-* grammar");
  }
  return value;
}

function safeEvidenceRef(value, path) {
  if (typeof value !== "string" || !EVIDENCE_REF_TOKEN.test(value)) {
    fail("evidence_ref_invalid", path, "Evidence refs must be task_engine_* or project_history_* opaque identifiers");
  }
  return value;
}

function validateReasons(value, path) {
  denseArray(value, path);
  const unique = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const reason = value[index];
    if (typeof reason !== "string" || !REASON_TOKEN.test(reason)) {
      fail("blocking_reason_invalid", `${path}[${index}]`, "Expected a lowercase public-safe reason token");
    }
    if (unique.has(reason)) fail("blocking_reason_duplicate", `${path}[${index}]`, "Reasons must be unique");
    unique.add(reason);
  }
  if (value.some((entry, index) => index > 0 && value[index - 1].localeCompare(entry) > 0)) {
    fail("blocking_reasons_not_sorted", path, "Reasons must be sorted");
  }
}

export function validateTaskEnginePublicGateMap(value) {
  exactKeys(value, GATE_MAP_FIELDS, "$gate_map");
  if (value.schema_version !== TASK_ENGINE_PUBLIC_GATE_MAP_SCHEMA_VERSION) {
    fail("gate_map_schema_invalid", "$gate_map.schema_version", "Unexpected schema version");
  }
  safeMapId(value.map_id, "$gate_map.map_id");
  if (value.activation_allowed !== false || value.private_locator_copied !== false) {
    fail("gate_map_boundary_invalid", "$gate_map", "Public map cannot grant activation or copy private locators");
  }
  denseArray(value.entries, "$gate_map.entries");
  if (value.entries.length !== TASK_ENGINE_PUBLIC_GATE_ORDER.length) {
    fail("gate_map_entry_count_invalid", "$gate_map.entries", "Every fixed gate must appear exactly once");
  }

  const byGate = new Map();
  for (let index = 0; index < value.entries.length; index += 1) {
    const entry = value.entries[index];
    const path = `$gate_map.entries[${index}]`;
    exactKeys(entry, GATE_ENTRY_FIELDS, path);
    if (entry.gate_id !== TASK_ENGINE_PUBLIC_GATE_ORDER[index]) {
      fail("gate_order_invalid", `${path}.gate_id`, "Gate order must be canonical");
    }
    if (!GATE_STATUSES.has(entry.status)) fail("gate_status_invalid", `${path}.status`, "Unknown gate status");
    const currentContract = CURRENT_GATE_ENTRY_CONTRACTS[entry.gate_id];
    if (entry.status !== currentContract.status) {
      fail("current_gate_status_mismatch", `${path}.status`, "This V1 map is a fail-closed snapshot of the current gate states");
    }
    if (entry.status === "historical_blocker_accepted" && entry.gate_id !== "C00A") {
      fail("historical_status_gate_invalid", `${path}.status`, "Only C00A may retain the accepted historical blocker outcome");
    }
    if (entry.status === "retained_formal_pass_receipt" && entry.gate_id === "C00A") {
      fail("formal_receipt_gate_invalid", `${path}.status`, "C00A uses its accepted historical blocker outcome, not a formal PASS receipt");
    }
    safeEvidenceRef(entry.evidence_ref, `${path}.evidence_ref`);
    if (!EVIDENCE_SCOPES.has(entry.evidence_scope)) fail("evidence_scope_invalid", `${path}.evidence_scope`, "Unknown evidence scope");
    if (typeof entry.progression_accepted !== "boolean") fail("progression_flag_invalid", `${path}.progression_accepted`, "Expected boolean");
    if (entry.progression_accepted) {
      fail("public_map_progression_forbidden", path, "A public evidence map cannot grant gate progression");
    }
    if ((entry.evidence_ref === "none") !== (entry.evidence_scope === "none")) {
      fail("evidence_ref_scope_mismatch", path, "Evidence ref and scope must both be none or both be concrete");
    }
    if (hasAcceptedPrerequisiteReceipt(entry) && entry.evidence_ref === "none") {
      fail("accepted_receipt_evidence_required", path, "An accepted prerequisite receipt must reference concrete evidence");
    }
    if (entry.status === "historical_blocker_accepted" && entry.evidence_scope !== "public_static") {
      fail("historical_receipt_scope_invalid", `${path}.evidence_scope`, "C00A historical evidence must use public_static scope");
    }
    if (entry.status === "retained_formal_pass_receipt"
        && !FORMAL_RECEIPT_EVIDENCE_SCOPES.has(entry.evidence_scope)) {
      fail("formal_receipt_scope_invalid", `${path}.evidence_scope`, "Retained formal receipts require public_synthetic or private_metadata_ref scope");
    }
    if (entry.private_locator_copied !== false) fail("private_locator_forbidden", path, "Public entries cannot contain private locators");
    validateReasons(entry.blocking_reasons, `${path}.blocking_reasons`);
    if (entry.blocking_reasons.length === 0) {
      fail("nonpass_without_blocker", path, "A non-progressing gate must state why");
    }
    if (entry.evidence_ref !== currentContract.evidence_ref
        || entry.evidence_scope !== currentContract.evidence_scope) {
      fail("current_gate_evidence_mismatch", path, "Evidence ref and scope must match the reviewed current-state snapshot");
    }
    if (entry.blocking_reasons.length !== currentContract.blocking_reasons.length
        || entry.blocking_reasons.some((reason, reasonIndex) => reason !== currentContract.blocking_reasons[reasonIndex])) {
      fail("current_gate_reasons_mismatch", `${path}.blocking_reasons`, "Blocking reasons must match the reviewed current-state snapshot");
    }
    byGate.set(entry.gate_id, entry);
  }

  for (const gateId of TASK_ENGINE_PUBLIC_GATE_ORDER) {
    const entry = byGate.get(gateId);
    if (!hasAcceptedPrerequisiteReceipt(entry)) continue;
    for (const prerequisite of PREREQUISITES[gateId]) {
      if (!hasAcceptedPrerequisiteReceipt(byGate.get(prerequisite))) {
        fail("prerequisite_receipt_missing", `$gate_map.${gateId}`, `${prerequisite} has no accepted prerequisite receipt`);
      }
    }
  }
  return value;
}

function typedRef(entityType, ownerSurface, entityId) {
  return { entity_type: entityType, owner_surface: ownerSurface, entity_id: entityId };
}

function classification(projectRef) {
  return projectRef === null
    ? { state: "unclassified", project_ref: null }
    : { state: "classified", project_ref: projectRef };
}

export function buildSyntheticFiveLaneShadowFixture(options = {}) {
  const projectEntityId = options.project_entity_id ?? "synthetic-project-alpha";
  safeSyntheticProjectId(projectEntityId, "$options.project_entity_id");
  const projectRef = typedRef("project", "synthetic_project_registry", projectEntityId);
  const envelopes = PROJECT_HISTORY_LANES.map((lane, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const owner = `synthetic_${lane}_owner`;
    const nativeType = PROJECT_HISTORY_READINESS_PROFILES[lane].native_occurrence_entity_types[0];
    return createProjectHistoryEnvelope({
      lane,
      source_owner_ref: typedRef("source_owner", "synthetic_source_registry", `source:${lane}`),
      native_occurrence_ref: typedRef(nativeType, owner, `native:${lane}:${suffix}`),
      event_ref: typedRef("event", "synthetic_history_writer", `event:${lane}:${suffix}`),
      source_revision_ref: typedRef("source_revision", owner, `revision:${lane}:${suffix}`),
      content_ref: typedRef("content", "synthetic_content_registry", sha256Canonical({ lane, suffix })),
      project_ref: projectRef,
      event_at: `2026-07-19T00:00:${suffix}.000Z`,
      valid_at: `2026-07-19T00:00:${suffix}.000Z`,
      observed_at: `2026-07-19T00:03:${suffix}.000Z`,
      known_at: `2026-07-19T00:02:${suffix}.000Z`,
      recorded_at: `2026-07-19T00:01:${suffix}.000Z`,
      classification_before: classification(null),
      classification_after: classification(projectRef),
      supersedes_event_ref: null,
    });
  });
  return {
    schema_version: PROJECT_HISTORY_READINESS_SCHEMA_VERSION,
    project_ref: projectRef,
    envelopes: sortProjectHistoryEnvelopes(envelopes),
    raw_payload_copied: false,
  };
}

function eventKey(envelope) {
  return canonicalJson(envelope.event_ref);
}

function sourceOccurrenceKey(envelope) {
  return canonicalJson(envelope.native_occurrence_ref);
}

export function replayProjectHistoryShadow(currentEnvelopes, incomingEnvelopes) {
  denseArray(currentEnvelopes, "$current");
  denseArray(incomingEnvelopes, "$incoming");
  validateProjectHistoryEnvelopeCollection(currentEnvelopes);
  for (const envelope of incomingEnvelopes) validateProjectHistoryEnvelope(envelope);

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
  const primaryLaneByOccurrence = new Map();
  for (const envelope of merged) {
    const key = sourceOccurrenceKey(envelope);
    const priorLane = primaryLaneByOccurrence.get(key);
    if (priorLane !== undefined && priorLane !== envelope.lane) {
      fail("cross_lane_occurrence_conflict", "$history", "One native occurrence cannot be counted in two lanes");
    }
    primaryLaneByOccurrence.set(key, envelope.lane);
  }
  const sorted = sortProjectHistoryEnvelopes(merged);
  return {
    envelopes: sorted,
    added_count: addedCount,
    replayed_count: replayedCount,
    ordered_event_digest: sha256Canonical(sorted.map((envelope) => envelope.metadata_digest)),
    raw_payload_copied: false,
  };
}

export function buildSyntheticH06CoverageFixture(envelopes, options = {}) {
  denseArray(envelopes, "$envelopes");
  validateProjectHistoryEnvelopeCollection(envelopes);
  const windowStart = options.window_start ?? "2026-07-19T00:00:00.000Z";
  const windowEnd = options.window_end ?? "2026-07-20T00:00:00.000Z";
  const receipts = PROJECT_HISTORY_LANES.map((lane) => {
    const laneEnvelopes = envelopes.filter((envelope) => envelope.lane === lane);
    if (laneEnvelopes.length === 0) fail("lane_fixture_missing", `$envelopes.${lane}`, "Synthetic H06 fixture requires every lane");
    const first = laneEnvelopes[0];
    return createProjectHistoryCoverageReceipt({
      lane,
      source_owner_ref: first.source_owner_ref,
      project_ref: first.project_ref,
      window_start: windowStart,
      window_end: windowEnd,
      state: "complete_with_events",
      gap_codes: [],
      applicability_ref: null,
    }, laneEnvelopes);
  });
  return validateSyntheticH06CoverageFixture({
    schema_version: PROJECT_HISTORY_READINESS_SCHEMA_VERSION,
    envelopes: sortProjectHistoryEnvelopes(envelopes),
    receipts,
    raw_payload_copied: false,
  });
}

export function validateSyntheticH06CoverageFixture(value) {
  exactKeys(value, ["schema_version", "envelopes", "receipts", "raw_payload_copied"], "$fixture");
  if (value.schema_version !== PROJECT_HISTORY_READINESS_SCHEMA_VERSION) {
    fail("readiness_schema_invalid", "$fixture.schema_version", "Unexpected schema version");
  }
  if (value.raw_payload_copied !== false) fail("raw_payload_forbidden", "$fixture.raw_payload_copied", "Fixture is metadata-only");
  denseArray(value.envelopes, "$fixture.envelopes");
  denseArray(value.receipts, "$fixture.receipts");
  validateProjectHistoryEnvelopeCollection(value.envelopes);
  replayProjectHistoryShadow([], value.envelopes);
  const projects = new Set();
  for (let index = 0; index < value.envelopes.length; index += 1) {
    const envelope = value.envelopes[index];
    if (!PROJECT_HISTORY_READINESS_PROFILES[envelope.lane]
      .native_occurrence_entity_types.includes(envelope.native_occurrence_ref.entity_type)) {
      fail("native_occurrence_type_invalid", `$fixture.envelopes[${index}].native_occurrence_ref.entity_type`, "Native occurrence type is not allowed for this lane");
    }
    if (!SYNTHETIC_PROJECT_ID_TOKEN.test(envelope.project_ref?.entity_id ?? "")) {
      fail("synthetic_project_id_invalid", `$fixture.envelopes[${index}].project_ref.entity_id`, "H06 readiness accepts synthetic-project-* identifiers only");
    }
    if (envelope.classification_before.state !== "unclassified"
        || envelope.classification_before.project_ref !== null
        || envelope.classification_after.state !== "classified"
        || envelope.supersedes_event_ref !== null) {
      fail("synthetic_classification_transition_required", `$fixture.envelopes[${index}]`, "Readiness requires one initial unclassified-to-classified Shadow event per lane");
    }
    if (envelope.project_ref === null
        || envelope.project_ref.owner_surface !== "synthetic_project_registry"
        || envelope.source_owner_ref.owner_surface !== "synthetic_source_registry"
        || envelope.event_ref.owner_surface !== "synthetic_history_writer"
        || envelope.content_ref?.owner_surface !== "synthetic_content_registry"
        || !envelope.native_occurrence_ref.owner_surface.startsWith("synthetic_")
        || !envelope.source_revision_ref?.owner_surface.startsWith("synthetic_")) {
      fail("synthetic_provenance_required", `$fixture.envelopes[${index}]`, "H06 readiness fixture accepts synthetic owners only");
    }
    projects.add(canonicalJson(envelope.project_ref));
  }
  if (projects.size !== 1) fail("single_project_required", "$fixture.envelopes", "All five lanes must bind one synthetic project");
  if (value.receipts.length !== PROJECT_HISTORY_LANES.length) {
    fail("coverage_receipt_count_invalid", "$fixture.receipts", "Expected one receipt for every lane");
  }
  for (let index = 0; index < PROJECT_HISTORY_LANES.length; index += 1) {
    const lane = PROJECT_HISTORY_LANES[index];
    const receipt = value.receipts[index];
    const laneEnvelopes = value.envelopes.filter((envelope) => envelope.lane === lane);
    if (laneEnvelopes.length !== 1) fail("one_event_per_lane_required", `$fixture.envelopes.${lane}`, "Readiness fixture requires one event per lane");
    if (receipt.lane !== lane) fail("coverage_lane_order_invalid", `$fixture.receipts[${index}]`, "Receipt order must match the lane contract");
    if (receipt.state !== "complete_with_events" || receipt.event_count !== 1) {
      fail("synthetic_coverage_state_invalid", `$fixture.receipts[${index}]`, "Readiness coverage must bind its one synthetic event");
    }
    validateProjectHistoryCoverageReceipt(receipt, laneEnvelopes);
  }
  return value;
}
