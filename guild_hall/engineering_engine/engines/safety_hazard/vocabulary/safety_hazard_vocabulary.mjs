// Closed domain vocabulary. These tokens classify caller-supplied evidence; they do not
// calculate a matrix, prescribe a mitigation, or decide that risk is acceptable.
export const SAFETY_HAZARD_SEVERITY_BANDS = Object.freeze([
  'catastrophic',
  'critical',
  'marginal',
  'negligible',
  'unclassified',
]);

export const SAFETY_HAZARD_PROBABILITY_BANDS = Object.freeze([
  'frequent',
  'probable',
  'occasional',
  'remote',
  'improbable',
  'eliminated',
  'unclassified',
]);

export const SAFETY_HAZARD_RISK_BANDS = Object.freeze([
  'high',
  'serious',
  'medium',
  'low',
  'eliminated',
  'unclassified',
]);

export const SAFETY_HAZARD_LIFECYCLE_STATUSES = Object.freeze([
  'identified',
  'analyzed',
  'mitigation_planned',
  'mitigation_implemented',
  'verification_pending',
  'residual_risk_review',
  'closure_evidence_pending',
  'closed',
]);

export const SAFETY_HAZARD_PRESENCE_STATES = Object.freeze([
  'present',
  'absence_confirmed',
  'unknown',
]);

export const SAFETY_HAZARD_RESULT_STATES = Object.freeze([
  'satisfied',
  'gap_missing',
  'gap_unknown',
  'gap_conflict',
  'not_applicable',
]);

export const SAFETY_HAZARD_EVIDENCE_FIELDS = Object.freeze([
  'hazard_identity_ref',
  'hazard_analysis_ref',
  'severity_assessment_ref',
  'probability_assessment_ref',
  'risk_assessment_ref',
  'mitigation_plan_ref',
  'selected_mitigation_ref',
  'expected_risk_reduction_ref',
  'mitigation_implementation_ref',
  'verification_method_ref',
  'verification_evidence_ref',
  'effectiveness_result_ref',
  'residual_risk_assessment_ref',
  'residual_risk_basis_ref',
  'written_acceptance_record_ref',
  'hazard_tracking_ref',
  'lifecycle_status_ref',
  'change_review_ref',
  'closure_criteria_ref',
  'closure_evidence_ref',
  'closure_review_ref',
]);

const includes = (values, value) => typeof value === 'string' && values.includes(value);

export const isSafetyHazardSeverityBand = (value) => includes(SAFETY_HAZARD_SEVERITY_BANDS, value);
export const isSafetyHazardProbabilityBand = (value) => includes(SAFETY_HAZARD_PROBABILITY_BANDS, value);
export const isSafetyHazardRiskBand = (value) => includes(SAFETY_HAZARD_RISK_BANDS, value);
export const isSafetyHazardLifecycleStatus = (value) => includes(SAFETY_HAZARD_LIFECYCLE_STATUSES, value);
export const isSafetyHazardPresenceState = (value) => includes(SAFETY_HAZARD_PRESENCE_STATES, value);
export const isSafetyHazardEvidenceField = (value) => includes(SAFETY_HAZARD_EVIDENCE_FIELDS, value);
