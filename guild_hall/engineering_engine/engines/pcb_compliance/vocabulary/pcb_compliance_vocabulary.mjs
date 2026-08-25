// Domain-local vocabulary only. These tokens are evidence-field names, not shared artifact
// vocabulary or a claim that any field proves product acceptance or standard compliance.

export const PCB_COMPLIANCE_COVERAGE_AREAS = Object.freeze([
  "approved_standard_applicability",
  "fabrication_and_assembly",
  "inspection",
  "protection_and_handling",
  "tools_and_measurement",
  "traceability_and_rework",
]);

export const PCB_CONTROLLED_BODY_ACCESS_STATES = Object.freeze([
  "metadata_only",
  "owner_approved_lawful",
  "unavailable",
]);

export const PCB_OBSERVATION_STATES = Object.freeze([
  "absent_confirmed",
  "conflict",
  "present",
  "unknown",
]);

export const PCB_COMPLIANCE_EVIDENCE_KEYS = Object.freeze([
  "applicable_criteria_ref",
  "approved_instruction_ref",
  "build_record_ref",
  "inspection_record_ref",
  "lawful_access_authorization_ref",
  "manufacturing_documentation_ref",
  "nonconformance_record_ref",
  "standard_applicability_ref",
  "standard_revision_ref",
  "tool_control_ref",
]);

export const isPcbCoverageArea = (value) => PCB_COMPLIANCE_COVERAGE_AREAS.includes(value);
export const isPcbControlledBodyAccessState = (value) => PCB_CONTROLLED_BODY_ACCESS_STATES.includes(value);
export const isPcbObservationState = (value) => PCB_OBSERVATION_STATES.includes(value);
