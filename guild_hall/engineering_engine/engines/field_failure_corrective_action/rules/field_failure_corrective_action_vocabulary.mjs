// Public-safe vocabulary for the Field Failure and Corrective Action (FFCA) domain.
// These tokens classify deterministic evidence rows; they never confer disposition,
// technical-change, release, or closure authority.

export const FFCA_CASE_KINDS = Object.freeze([
  "car",
  "field_failure",
  "ncr",
]);

export const FFCA_APPLICABILITY_STATES = Object.freeze([
  "applicable",
  "not_applicable",
  "unknown",
]);

export const FFCA_OBSERVATION_STATES = Object.freeze([
  "absent",
  "conflict",
  "present",
  "unknown",
]);

export const FFCA_CHANGE_STATES = Object.freeze([
  "not_required",
  "required",
  "unknown",
]);

export const FFCA_ASSESSMENT_STATES = Object.freeze([
  "conflict",
  "missing",
  "not_applicable",
  "satisfied",
  "unknown",
]);

export const FFCA_CLOSURE_READINESS_STATES = Object.freeze([
  "not_ready",
  "ready_for_human_decision",
]);

export const FFCA_LINK_FIELDS = Object.freeze([
  "affected_asset_refs",
  "affected_lot_refs",
  "configuration_refs",
  "evidence_receipt_refs",
  "test_refs",
]);

export const FFCA_FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  "closure_approval_ref",
  "quality_disposition_approval_ref",
  "quality_disposition_ref",
  "technical_change_approval_ref",
  "technical_change_disposition_ref",
]);

export function isFfcaCaseKind(value) {
  return typeof value === "string" && FFCA_CASE_KINDS.includes(value);
}

export function isFfcaApplicabilityState(value) {
  return typeof value === "string" && FFCA_APPLICABILITY_STATES.includes(value);
}

export function isFfcaObservationState(value) {
  return typeof value === "string" && FFCA_OBSERVATION_STATES.includes(value);
}

export function isFfcaChangeState(value) {
  return typeof value === "string" && FFCA_CHANGE_STATES.includes(value);
}
