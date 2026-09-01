// Workspace greenfield admission gate — pure, refs-only, and default OFF.
//
// The gate verifies only a caller-supplied closed evidence packet plus a
// separately trusted packet-digest pin. It never resolves a path, reads or
// writes bytes, creates a target store, changes ACLs, accepts an artifact, or
// invokes a service. Phase-specific results deliberately distinguish a packet
// ready to publish from one whose publication closure has been evidenced.

import { createHash } from "node:crypto";

export const GREENFIELD_ADMISSION_SCHEMA = "soulforge.workspace_greenfield_admission.v1";
export const GREENFIELD_ADMISSION_PHASES = Object.freeze([
  "pre_publish_readiness",
  "post_publish_closure",
]);
export const W_AUTH_CLASSIFICATIONS = Object.freeze(["accepted", "baseline"]);
export const LEGACY_FREEZE_APPLICABILITY = Object.freeze(["applicable", "not_applicable"]);
export const CANONICAL_TARGET_BACKUP_CLASSIFICATION = "authoritative";

const REF = /^[a-z][a-z0-9_.:/-]{1,160}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORBIDDEN_FIELD_NAME = /(?:^|_)(?:path|raw|secret|payload|body|transcript|prompt|token|password|cookie|credential)(?:_|$)/iu;
const SAFE_FORBIDDEN_FIELD_EXCEPTIONS = new Set(["content_sha256"]);

function fail(code, detail) {
  const error = new Error(detail === undefined ? code : `${code}:${detail}`);
  error.code = code;
  throw error;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) fail("packet_digest_input_invalid");
      return JSON.stringify(value);
    case "object": {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    default:
      return fail("packet_digest_input_invalid");
  }
}

// The pin is intentionally external to the packet. The caller that has the
// trusted plan/receipt must provide this value; a packet cannot bless itself.
export function computeWorkspaceGreenfieldAdmissionPacketDigest(packet) {
  return `sha256:${createHash("sha256").update(canonicalJson(packet), "utf8").digest("hex")}`;
}

function absolutePathLeak(value) {
  return typeof value === "string"
    && (/^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\")
      || value.startsWith("//") || value.startsWith("/") || value.includes("\\"));
}

function assertObject(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("packet_object_invalid", field);
  }
  return value;
}

function assertRef(value, field) {
  if (typeof value !== "string" || !REF.test(value) || value.startsWith("hold:")
      || absolutePathLeak(value)) {
    fail("ref_invalid", field);
  }
  return value;
}

function assertNullableRef(value, field) {
  if (value === null) return null;
  return assertRef(value, field);
}

function assertDigest(value, field) {
  if (typeof value !== "string" || !SHA256.test(value)) fail("digest_invalid", field);
  return value;
}

function assertClock(value, field) {
  if (typeof value !== "string" || !ISO.test(value)) fail("clock_invalid", field);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail("clock_invalid", field);
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u, (_match, fractional) => (
    `.${(fractional ?? "").padEnd(3, "0")}Z`
  ));
  if (new Date(timestamp).toISOString() !== normalized) fail("clock_invalid", field);
  return value;
}

function forbiddenFieldName(key) {
  return !SAFE_FORBIDDEN_FIELD_EXCEPTIONS.has(key) && FORBIDDEN_FIELD_NAME.test(key);
}

function assertExactKeys(value, keys, field) {
  assertObject(value, field);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (forbiddenFieldName(key)) fail("forbidden_packet_field", `${field}.${key}`);
    if (!allowed.has(key)) fail("packet_field_unrecognized", `${field}.${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail("packet_field_missing", `${field}.${key}`);
  }
}

function assertNoForbiddenFields(value, field = "packet") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenFields(entry, `${field}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenFieldName(key)) fail("forbidden_packet_field", `${field}.${key}`);
      assertNoForbiddenFields(entry, `${field}.${key}`);
    }
    return;
  }
  if (absolutePathLeak(value)) fail("absolute_path_forbidden", field);
}

function phaseSuccessStatus(phase) {
  return phase === "pre_publish_readiness" ? "pre_publish_ready" : "post_publish_closed";
}

function phaseHoldStatus(phase) {
  return phase === "pre_publish_readiness" ? "pre_publish_hold" : "post_publish_hold";
}

function gatePass(extra = {}) {
  return deepFreeze({ status: "pass", ...extra });
}

function gateNotApplicable() {
  return deepFreeze({ status: "not_applicable", applicability: "not_applicable" });
}

function gateHold(holdCode) {
  return deepFreeze({ status: "hold", hold_code: holdCode });
}

function evaluateGate(validator) {
  try {
    return { gate: gatePass(), value: validator() };
  } catch (error) {
    return { gate: gateHold(error?.code || "gate_invalid"), value: null };
  }
}

function validateWAuth(value) {
  const keys = [
    "w_auth_ref", "subject_ref", "input_source_revision_ref", "input_source_digest",
    "scope_ref", "classification", "owner_ref", "reviewer_ref", "evidence_ref",
    "input_authority_acceptance_ref", "issued_at", "supersession_ref", "baseline_ref",
  ];
  assertExactKeys(value, keys, "w_auth");
  if (!W_AUTH_CLASSIFICATIONS.includes(value.classification)) {
    fail("w_auth_classification_not_accepted_or_baseline");
  }
  const normalized = {
    w_auth_ref: assertRef(value.w_auth_ref, "w_auth.w_auth_ref"),
    subject_ref: assertRef(value.subject_ref, "w_auth.subject_ref"),
    input_source_revision_ref: assertRef(
      value.input_source_revision_ref, "w_auth.input_source_revision_ref",
    ),
    input_source_digest: assertDigest(value.input_source_digest, "w_auth.input_source_digest"),
    scope_ref: assertRef(value.scope_ref, "w_auth.scope_ref"),
    classification: value.classification,
    owner_ref: assertRef(value.owner_ref, "w_auth.owner_ref"),
    reviewer_ref: assertRef(value.reviewer_ref, "w_auth.reviewer_ref"),
    evidence_ref: assertRef(value.evidence_ref, "w_auth.evidence_ref"),
    input_authority_acceptance_ref: assertRef(
      value.input_authority_acceptance_ref, "w_auth.input_authority_acceptance_ref",
    ),
    issued_at: assertClock(value.issued_at, "w_auth.issued_at"),
    supersession_ref: assertNullableRef(value.supersession_ref, "w_auth.supersession_ref"),
    baseline_ref: assertNullableRef(value.baseline_ref, "w_auth.baseline_ref"),
  };
  if (normalized.classification === "accepted" && normalized.baseline_ref !== null) {
    fail("w_auth_baseline_ref_unexpected");
  }
  if (normalized.classification === "baseline" && normalized.baseline_ref === null) {
    fail("w_auth_baseline_ref_missing");
  }
  return deepFreeze(normalized);
}

function validateGenesisStore(value, field) {
  const keys = [
    "store_ref", "binding_ref", "parent_binding_ref", "binding_epoch_ref",
    "empty_readback_ref", "acl_readback_ref", "sole_writer_ref", "generation_ref",
    "no_legacy_import_receipt_ref", "legacy_rows_imported", "backup_classification",
    "backup_classification_ref", "synthetic_restore_gate_ref",
    "synthetic_restore_evidence_ref", "rollback_ref",
  ];
  assertExactKeys(value, keys, field);
  if (value.backup_classification !== CANONICAL_TARGET_BACKUP_CLASSIFICATION) {
    fail("genesis_backup_classification_not_authoritative");
  }
  if (value.legacy_rows_imported !== false) fail("genesis_legacy_rows_imported");
  return deepFreeze({
    store_ref: assertRef(value.store_ref, `${field}.store_ref`),
    binding_ref: assertRef(value.binding_ref, `${field}.binding_ref`),
    parent_binding_ref: assertRef(value.parent_binding_ref, `${field}.parent_binding_ref`),
    binding_epoch_ref: assertRef(value.binding_epoch_ref, `${field}.binding_epoch_ref`),
    empty_readback_ref: assertRef(value.empty_readback_ref, `${field}.empty_readback_ref`),
    acl_readback_ref: assertRef(value.acl_readback_ref, `${field}.acl_readback_ref`),
    sole_writer_ref: assertRef(value.sole_writer_ref, `${field}.sole_writer_ref`),
    generation_ref: assertRef(value.generation_ref, `${field}.generation_ref`),
    no_legacy_import_receipt_ref: assertRef(
      value.no_legacy_import_receipt_ref, `${field}.no_legacy_import_receipt_ref`,
    ),
    backup_classification_ref: assertRef(
      value.backup_classification_ref, `${field}.backup_classification_ref`,
    ),
    synthetic_restore_gate_ref: assertRef(
      value.synthetic_restore_gate_ref, `${field}.synthetic_restore_gate_ref`,
    ),
    synthetic_restore_evidence_ref: assertRef(
      value.synthetic_restore_evidence_ref, `${field}.synthetic_restore_evidence_ref`,
    ),
    rollback_ref: assertRef(value.rollback_ref, `${field}.rollback_ref`),
  });
}

function validateGenesis(value) {
  assertExactKeys(value, [
    "genesis_ref", "authority_ref", "approved_correction_supersession_policy_ref",
    "target_workspaces", "target_workmeta",
  ], "genesis");
  const targetWorkspaces = validateGenesisStore(value.target_workspaces, "genesis.target_workspaces");
  const targetWorkmeta = validateGenesisStore(value.target_workmeta, "genesis.target_workmeta");
  if (targetWorkspaces.store_ref === targetWorkmeta.store_ref) fail("genesis_target_store_conflated");
  if (targetWorkspaces.binding_ref === targetWorkmeta.binding_ref) fail("genesis_target_binding_conflated");
  if (targetWorkspaces.generation_ref !== targetWorkmeta.generation_ref) fail("genesis_generation_mismatch");
  return deepFreeze({
    genesis_ref: assertRef(value.genesis_ref, "genesis.genesis_ref"),
    authority_ref: assertRef(value.authority_ref, "genesis.authority_ref"),
    approved_correction_supersession_policy_ref: assertRef(
      value.approved_correction_supersession_policy_ref,
      "genesis.approved_correction_supersession_policy_ref",
    ),
    target_workspaces: targetWorkspaces,
    target_workmeta: targetWorkmeta,
  });
}

function validateLegacyFreeze(value) {
  const keys = [
    "applicability", "origin_kind", "applicability_reason_ref", "origin_ref", "custody_ref",
    "admission_ref", "legacy_freeze_ref", "current_binding_ref", "scope_ref",
    "writer_quiescence_ref", "readback_ref", "source_pointer_ref",
    "input_source_revision_ref", "input_source_digest", "retention_ref",
    "expiry_release_rule_ref", "authority_ref",
  ];
  assertExactKeys(value, keys, "legacy_freeze");
  if (!LEGACY_FREEZE_APPLICABILITY.includes(value.applicability)) {
    fail("legacy_freeze_applicability_invalid");
  }
  const common = {
    applicability: value.applicability,
    origin_kind: value.origin_kind,
    applicability_reason_ref: assertRef(value.applicability_reason_ref, "legacy_freeze.applicability_reason_ref"),
    origin_ref: assertRef(value.origin_ref, "legacy_freeze.origin_ref"),
    custody_ref: assertRef(value.custody_ref, "legacy_freeze.custody_ref"),
    admission_ref: assertRef(value.admission_ref, "legacy_freeze.admission_ref"),
    scope_ref: assertRef(value.scope_ref, "legacy_freeze.scope_ref"),
    input_source_revision_ref: assertRef(
      value.input_source_revision_ref, "legacy_freeze.input_source_revision_ref",
    ),
    input_source_digest: assertDigest(value.input_source_digest, "legacy_freeze.input_source_digest"),
  };
  const legacyOnlyFields = [
    "legacy_freeze_ref", "current_binding_ref", "writer_quiescence_ref", "readback_ref",
    "source_pointer_ref", "retention_ref", "expiry_release_rule_ref", "authority_ref",
  ];
  if (value.applicability === "not_applicable") {
    if (value.origin_kind !== "external_nonlegacy") {
      fail("legacy_freeze_non_applicable_origin_invalid");
    }
    for (const field of legacyOnlyFields) {
      if (value[field] !== null) {
        fail(field === "current_binding_ref"
          ? "legacy_freeze_non_applicable_current_binding_present"
          : "legacy_freeze_non_applicable_has_legacy_evidence", field);
      }
    }
    return deepFreeze(common);
  }
  if (value.origin_kind !== "legacy") fail("legacy_freeze_applicable_origin_invalid");
  return deepFreeze({
    ...common,
    legacy_freeze_ref: assertRef(value.legacy_freeze_ref, "legacy_freeze.legacy_freeze_ref"),
    current_binding_ref: assertRef(value.current_binding_ref, "legacy_freeze.current_binding_ref"),
    writer_quiescence_ref: assertRef(
      value.writer_quiescence_ref, "legacy_freeze.writer_quiescence_ref",
    ),
    readback_ref: assertRef(value.readback_ref, "legacy_freeze.readback_ref"),
    source_pointer_ref: assertRef(value.source_pointer_ref, "legacy_freeze.source_pointer_ref"),
    retention_ref: assertRef(value.retention_ref, "legacy_freeze.retention_ref"),
    expiry_release_rule_ref: assertRef(
      value.expiry_release_rule_ref, "legacy_freeze.expiry_release_rule_ref",
    ),
    authority_ref: assertRef(value.authority_ref, "legacy_freeze.authority_ref"),
  });
}

function assertCandidate(value, field, candidate, prefix) {
  const revision = assertRef(value.candidate_revision_ref, `${field}.candidate_revision_ref`);
  const digest = assertDigest(value.candidate_content_digest, `${field}.candidate_content_digest`);
  const codePrefix = prefix === "candidate" ? "candidate" : `${prefix}_candidate`;
  if (revision !== candidate.revision_ref) fail(`${codePrefix}_revision_mismatch`);
  if (digest !== candidate.content_digest) fail(`${codePrefix}_digest_mismatch`);
}

function validatePromotion(value, phase) {
  const keys = [
    "promotion_ref", "phase_operation_ref", "input_w_auth_ref", "logical_artifact_ref",
    "candidate_relation", "candidate_revision_ref", "candidate_content_digest", "staging", "byte_hash_readback",
    "independent_review", "authority_acceptance", "publication", "active_pointer",
  ];
  assertExactKeys(value, keys, "promotion");
  const candidate = {
    revision_ref: assertRef(value.candidate_revision_ref, "promotion.candidate_revision_ref"),
    content_digest: assertDigest(value.candidate_content_digest, "promotion.candidate_content_digest"),
  };
  if (value.candidate_relation !== "exact_copy" && value.candidate_relation !== "derived_revision") {
    fail("candidate_relation_invalid");
  }
  const staging = value.staging;
  assertExactKeys(staging, [
    "staging_ref", "candidate_surface", "candidate_revision_ref", "candidate_content_digest",
  ], "promotion.staging");
  assertRef(staging.staging_ref, "promotion.staging.staging_ref");
  if (staging.candidate_surface === "target_canonical") {
    fail("candidate_inside_target_before_acceptance");
  }
  if (staging.candidate_surface !== "external_noncanonical_staging") {
    fail("candidate_surface_invalid");
  }
  assertCandidate(staging, "promotion.staging", candidate, "candidate");

  const byteReadback = value.byte_hash_readback;
  assertExactKeys(byteReadback, [
    "byte_readback_ref", "candidate_revision_ref", "candidate_content_digest",
  ], "promotion.byte_hash_readback");
  assertRef(byteReadback.byte_readback_ref, "promotion.byte_hash_readback.byte_readback_ref");
  assertCandidate(byteReadback, "promotion.byte_hash_readback", candidate, "candidate");

  const review = value.independent_review;
  assertExactKeys(review, [
    "producer_ref", "build_ref", "reviewer_ref", "independence_receipt_ref", "review_ref",
    "candidate_revision_ref", "candidate_content_digest",
  ], "promotion.independent_review");
  const producerRef = assertRef(review.producer_ref, "promotion.independent_review.producer_ref");
  const reviewerRef = assertRef(review.reviewer_ref, "promotion.independent_review.reviewer_ref");
  if (producerRef === reviewerRef) fail("reviewer_not_independent");
  assertRef(review.build_ref, "promotion.independent_review.build_ref");
  assertRef(review.independence_receipt_ref, "promotion.independent_review.independence_receipt_ref");
  assertRef(review.review_ref, "promotion.independent_review.review_ref");
  assertCandidate(review, "promotion.independent_review", candidate, "review");

  const acceptance = value.authority_acceptance;
  assertExactKeys(acceptance, [
    "authority_ref", "acceptance_ref", "candidate_revision_ref", "candidate_content_digest",
  ], "promotion.authority_acceptance");
  assertRef(acceptance.authority_ref, "promotion.authority_acceptance.authority_ref");
  assertRef(acceptance.acceptance_ref, "promotion.authority_acceptance.acceptance_ref");
  assertCandidate(acceptance, "promotion.authority_acceptance", candidate, "acceptance");

  if (phase === "pre_publish_readiness") {
    if (value.publication !== null) fail("pre_publish_contains_publication");
    if (value.active_pointer !== null) fail("pre_publish_contains_active_pointer");
  } else {
    if (value.publication === null) fail("post_publish_publication_missing");
    assertExactKeys(value.publication, [
      "atomic_publish_ref", "publisher_ref", "target_workspaces_binding_ref",
      "target_workmeta_binding_ref", "generation_ref", "correction_supersession_policy_ref",
      "target_bytes_ref", "canonical_lineage_ref",
      "candidate_revision_ref", "candidate_content_digest",
    ], "promotion.publication");
    assertRef(value.publication.atomic_publish_ref, "promotion.publication.atomic_publish_ref");
    assertRef(value.publication.publisher_ref, "promotion.publication.publisher_ref");
    assertRef(value.publication.target_workspaces_binding_ref, "promotion.publication.target_workspaces_binding_ref");
    assertRef(value.publication.target_workmeta_binding_ref, "promotion.publication.target_workmeta_binding_ref");
    assertRef(value.publication.generation_ref, "promotion.publication.generation_ref");
    assertRef(
      value.publication.correction_supersession_policy_ref,
      "promotion.publication.correction_supersession_policy_ref",
    );
    assertRef(value.publication.target_bytes_ref, "promotion.publication.target_bytes_ref");
    assertRef(value.publication.canonical_lineage_ref, "promotion.publication.canonical_lineage_ref");
    assertCandidate(value.publication, "promotion.publication", candidate, "publication");

    if (value.active_pointer === null) fail("post_publish_active_pointer_missing");
    assertExactKeys(value.active_pointer, [
      "active_pointer_ref", "pointer_readback_ref", "candidate_revision_ref", "candidate_content_digest",
    ], "promotion.active_pointer");
    assertRef(value.active_pointer.active_pointer_ref, "promotion.active_pointer.active_pointer_ref");
    assertRef(value.active_pointer.pointer_readback_ref, "promotion.active_pointer.pointer_readback_ref");
    assertCandidate(value.active_pointer, "promotion.active_pointer", candidate, "active_pointer");
  }

  return deepFreeze({
    promotion_ref: assertRef(value.promotion_ref, "promotion.promotion_ref"),
    phase_operation_ref: assertRef(value.phase_operation_ref, "promotion.phase_operation_ref"),
    input_w_auth_ref: assertRef(value.input_w_auth_ref, "promotion.input_w_auth_ref"),
    logical_artifact_ref: assertRef(value.logical_artifact_ref, "promotion.logical_artifact_ref"),
    candidate_relation: value.candidate_relation,
    candidate_revision_ref: candidate.revision_ref,
    candidate_content_digest: candidate.content_digest,
    publication: phase === "post_publish_closure" ? deepFreeze({
      publisher_ref: value.publication.publisher_ref,
      target_workspaces_binding_ref: value.publication.target_workspaces_binding_ref,
      target_workmeta_binding_ref: value.publication.target_workmeta_binding_ref,
      generation_ref: value.publication.generation_ref,
      correction_supersession_policy_ref: value.publication.correction_supersession_policy_ref,
    }) : null,
  });
}

function validateNonWorkspace(value, packet) {
  assertExactKeys(value, ["branch_ref", "target_store_operations"], "non_workspace");
  const branchRef = assertRef(value.branch_ref, "non_workspace.branch_ref");
  if (!Array.isArray(value.target_store_operations)) fail("nw_target_store_operations_invalid");
  if (value.target_store_operations.length !== 0) fail("nw_target_store_access_forbidden");
  for (const field of ["w_auth", "genesis", "legacy_freeze", "promotion"]) {
    if (Object.hasOwn(packet, field)) fail("nw_target_store_access_forbidden");
  }
  return deepFreeze({ branch_ref: branchRef });
}

function validateReplay(value, expectedOperationRef) {
  const keys = [
    "phase_operation_ref", "idempotency_key_ref", "original_request_digest",
    "replay_request_digest", "prior_receipt_digest", "replay_readback_digest",
    "replay_receipt_ref", "replay_outcome",
  ];
  assertExactKeys(value, keys, "replay");
  const phaseOperationRef = assertRef(value.phase_operation_ref, "replay.phase_operation_ref");
  if (phaseOperationRef !== expectedOperationRef) fail("replay_operation_mismatch");
  assertRef(value.idempotency_key_ref, "replay.idempotency_key_ref");
  const originalRequestDigest = assertDigest(value.original_request_digest, "replay.original_request_digest");
  const replayRequestDigest = assertDigest(value.replay_request_digest, "replay.replay_request_digest");
  if (originalRequestDigest !== replayRequestDigest) fail("replay_request_digest_mismatch");
  const priorReceiptDigest = assertDigest(value.prior_receipt_digest, "replay.prior_receipt_digest");
  const replayReadbackDigest = assertDigest(value.replay_readback_digest, "replay.replay_readback_digest");
  if (priorReceiptDigest !== replayReadbackDigest) fail("replay_receipt_digest_mismatch");
  assertRef(value.replay_receipt_ref, "replay.replay_receipt_ref");
  if (value.replay_outcome !== "no_op") fail("replay_not_idempotent");
  return deepFreeze({ phase_operation_ref: phaseOperationRef });
}

function gateSet({ trustedPacketPin, wAuth, genesis, legacyFreeze, promotion, branchScope, replay, payload }) {
  return {
    trusted_packet_pin: trustedPacketPin,
    w_auth: wAuth,
    canonical_empty_state_genesis: genesis,
    legacy_freeze: legacyFreeze,
    one_artifact_promotion: promotion,
    branch_scope: branchScope,
    replay_idempotency: replay,
    payload_boundary: payload,
  };
}

function result(packet, phase, packetDigest, gates) {
  const blockers = Object.entries(gates)
    .filter(([, gate]) => gate.status === "hold")
    .map(([gate, outcome]) => ({ gate, hold_code: outcome.hold_code }));
  const ready = blockers.length === 0;
  return deepFreeze({
    status: ready ? phaseSuccessStatus(phase) : phaseHoldStatus(phase),
    completion_state: ready
      ? (phase === "pre_publish_readiness" ? "not_published" : "published_closed")
      : "blocked",
    schema: GREENFIELD_ADMISSION_SCHEMA,
    phase,
    branch: packet.branch,
    packet_ref: packet.packet_ref,
    packet_digest: packetDigest,
    gates,
    blockers,
    authority_boundary: {
      filesystem_effect: false,
      binding_write: false,
      target_store_write: false,
      acceptance_authority: false,
    },
  });
}

function topLevelHold(phase, code) {
  const phaseKnown = GREENFIELD_ADMISSION_PHASES.includes(phase);
  return deepFreeze({
    status: phaseKnown ? phaseHoldStatus(phase) : "hold",
    completion_state: "blocked",
    schema: GREENFIELD_ADMISSION_SCHEMA,
    ...(phaseKnown ? { phase } : {}),
    hold_code: code,
    authority_boundary: {
      filesystem_effect: false,
      binding_write: false,
      target_store_write: false,
      acceptance_authority: false,
    },
  });
}

// `trusted_packet_digest` must come from an independently trusted plan/receipt
// surface. This function only compares it; it never treats its own digest as
// trusted authority.
export function evaluateWorkspaceGreenfieldAdmission(packet = {}, {
  phase,
  trusted_packet_digest: trustedPacketDigest,
} = {}) {
  if (!GREENFIELD_ADMISSION_PHASES.includes(phase)) return topLevelHold(phase, "phase_invalid");
  if (packet === null || typeof packet !== "object" || Array.isArray(packet)) {
    return topLevelHold(phase, "packet_object_invalid");
  }
  if (trustedPacketDigest === undefined) return topLevelHold(phase, "trusted_packet_digest_missing");
  try {
    assertDigest(trustedPacketDigest, "trusted_packet_digest");
  } catch (error) {
    return topLevelHold(phase, error?.code || "trusted_packet_digest_invalid");
  }
  let packetDigest;
  try {
    packetDigest = computeWorkspaceGreenfieldAdmissionPacketDigest(packet);
  } catch (error) {
    return topLevelHold(phase, error?.code || "packet_digest_input_invalid");
  }
  if (packetDigest !== trustedPacketDigest) return topLevelHold(phase, "trusted_packet_digest_mismatch");
  if (packet.schema !== GREENFIELD_ADMISSION_SCHEMA) return topLevelHold(phase, "schema_invalid");
  if (packet.branch !== "workspace" && packet.branch !== "non_workspace") {
    return topLevelHold(phase, "branch_invalid");
  }
  try {
    assertRef(packet.packet_ref, "packet.packet_ref");
  } catch (error) {
    return topLevelHold(phase, error?.code || "packet_invalid");
  }

  if (packet.branch === "non_workspace") {
    if (phase !== "pre_publish_readiness") return topLevelHold(phase, "phase_not_applicable_to_non_workspace");
    const payload = evaluateGate(() => {
      assertNoForbiddenFields(packet);
      assertExactKeys(packet, ["schema", "branch", "packet_ref", "non_workspace", "replay"], "packet");
      return true;
    });
    const branchScope = evaluateGate(() => validateNonWorkspace(packet.non_workspace, packet));
    const replay = evaluateGate(() => validateReplay(
      packet.replay,
      branchScope.value?.branch_ref || "invalid.non-workspace-branch",
    ));
    const notApplicable = gateNotApplicable();
    return result(packet, phase, packetDigest, gateSet({
      trustedPacketPin: gatePass(),
      wAuth: notApplicable,
      genesis: notApplicable,
      legacyFreeze: notApplicable,
      promotion: notApplicable,
      branchScope: branchScope.gate,
      replay: replay.gate,
      payload: payload.gate,
    }));
  }

  const payload = evaluateGate(() => {
    assertNoForbiddenFields(packet);
    assertExactKeys(packet, [
      "schema", "branch", "packet_ref", "w_auth", "genesis", "legacy_freeze", "promotion", "replay",
    ], "packet");
    return true;
  });
  const wAuth = evaluateGate(() => validateWAuth(packet.w_auth));
  const genesis = evaluateGate(() => validateGenesis(packet.genesis));
  const legacyFreeze = evaluateGate(() => validateLegacyFreeze(packet.legacy_freeze));
  const promotion = evaluateGate(() => validatePromotion(packet.promotion, phase));
  const branchScope = evaluateGate(() => {
    if (Object.hasOwn(packet, "non_workspace")) fail("workspace_branch_scope_invalid");
    return true;
  });
  const replay = evaluateGate(() => validateReplay(
    packet.replay,
    promotion.value?.phase_operation_ref || "invalid.workspace-phase-operation",
  ));

  if (wAuth.value !== null && promotion.value !== null) {
    if (wAuth.value.w_auth_ref !== promotion.value.input_w_auth_ref) {
      promotion.gate = gateHold("promotion_input_w_auth_mismatch");
    } else if (wAuth.value.subject_ref !== promotion.value.logical_artifact_ref) {
      promotion.gate = gateHold("promotion_logical_artifact_mismatch");
    } else if (promotion.value.candidate_relation === "exact_copy"
        && promotion.value.candidate_revision_ref !== wAuth.value.input_source_revision_ref) {
      promotion.gate = gateHold("exact_copy_candidate_revision_mismatch");
    } else if (promotion.value.candidate_relation === "exact_copy"
        && promotion.value.candidate_content_digest !== wAuth.value.input_source_digest) {
      promotion.gate = gateHold("exact_copy_candidate_digest_mismatch");
    } else if (promotion.value.candidate_relation === "derived_revision"
        && promotion.value.candidate_revision_ref === wAuth.value.input_source_revision_ref) {
      promotion.gate = gateHold("derived_revision_candidate_not_distinct");
    }
  }
  if (genesis.value !== null && promotion.value !== null
      && promotion.value.publication !== null) {
    const publication = promotion.value.publication;
    if (publication.publisher_ref !== genesis.value.target_workspaces.sole_writer_ref) {
      promotion.gate = gateHold("publication_workspace_sole_writer_mismatch");
    } else if (publication.publisher_ref !== genesis.value.target_workmeta.sole_writer_ref) {
      promotion.gate = gateHold("publication_workmeta_sole_writer_mismatch");
    } else if (publication.target_workspaces_binding_ref !== genesis.value.target_workspaces.binding_ref) {
      promotion.gate = gateHold("publication_workspaces_binding_mismatch");
    } else if (publication.target_workmeta_binding_ref !== genesis.value.target_workmeta.binding_ref) {
      promotion.gate = gateHold("publication_workmeta_binding_mismatch");
    } else if (publication.generation_ref !== genesis.value.target_workspaces.generation_ref
        || publication.generation_ref !== genesis.value.target_workmeta.generation_ref) {
      promotion.gate = gateHold("publication_generation_mismatch");
    } else if (publication.correction_supersession_policy_ref
        !== genesis.value.approved_correction_supersession_policy_ref) {
      promotion.gate = gateHold("publication_correction_supersession_policy_mismatch");
    }
  }
  if (genesis.value !== null
      && genesis.value.target_workspaces.sole_writer_ref !== genesis.value.target_workmeta.sole_writer_ref) {
    genesis.gate = gateHold("genesis_sole_writer_mismatch");
  }
  if (legacyFreeze.value !== null && wAuth.value !== null) {
    if (legacyFreeze.value.scope_ref !== wAuth.value.scope_ref) {
      legacyFreeze.gate = gateHold("legacy_freeze_scope_mismatch");
    } else if (legacyFreeze.value.input_source_revision_ref !== wAuth.value.input_source_revision_ref) {
      legacyFreeze.gate = gateHold("legacy_freeze_input_source_revision_mismatch");
    } else if (legacyFreeze.value.input_source_digest !== wAuth.value.input_source_digest) {
      legacyFreeze.gate = gateHold("legacy_freeze_input_source_digest_mismatch");
    }
  }

  return result(packet, phase, packetDigest, gateSet({
    trustedPacketPin: gatePass(),
    wAuth: wAuth.gate,
    genesis: genesis.gate,
    legacyFreeze: legacyFreeze.gate,
    promotion: promotion.gate,
    branchScope: branchScope.gate,
    replay: replay.gate,
    payload: payload.gate,
  }));
}
