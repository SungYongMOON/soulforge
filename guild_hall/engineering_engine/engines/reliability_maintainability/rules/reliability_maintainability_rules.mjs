// E06 Reliability and Maintainability candidate rule metadata. This file carries only
// source locators and public-safe rule semantics; it never carries source bodies, project
// payloads, target values, acceptance decisions, or Quality evidence conclusions.
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA =
  'soulforge.reliability_maintainability.ruleset.v0';
export const RELIABILITY_MAINTAINABILITY_RULESET_REVISION =
  'soulforge.reliability_maintainability.ruleset.v0';

export const RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'reliability-maintainability-source-packet-v0',
  revision_id: 'reliability-maintainability-source-packet-v0',
  content_id: 'sha256:43fa083f920cc973ce5c2d5b485eebcbd62b342edb70e9fead9e2065145e9b0e',
  content_hash_alg: 'sha256',
});

export const RELIABILITY_MAINTAINABILITY_SOURCE_IDS = Object.freeze([
  'S1-NASA-STD-8729.1A',
  'S2-GSFC-HDBK-8004',
]);

// These are domain semantic evidence roles, not a new shared artifact vocabulary and not
// a synonym bridge to Quality. `null` remains available for source-native evidence whose
// exact semantic identity is not represented by this small public candidate vocabulary.
export const RELIABILITY_MAINTAINABILITY_EVIDENCE_KINDS = Object.freeze([
  'availability_analysis',
  'failure_closure_trace',
  'failure_repair_metric_record',
  'fmeca_record',
  'logistics_support_analysis',
  'maintainability_demonstration_record',
  'reliability_allocation_model',
]);

export function isReliabilityMaintainabilityEvidenceKind(value) {
  return typeof value === 'string' && RELIABILITY_MAINTAINABILITY_EVIDENCE_KINDS.includes(value);
}

const freezeRule = (rule) => Object.freeze({
  ...rule,
  allowed_evidence_kinds: Object.freeze([...rule.allowed_evidence_kinds]),
  required_authority_families: Object.freeze([...rule.required_authority_families]),
  context_ref_fields: Object.freeze([...rule.context_ref_fields]),
  sufficiency_fields: Object.freeze([...rule.sufficiency_fields]),
});

// Ordered by rule_id. Each row stays a source-supported candidate until an exact project
// binding accepts the row; a candidate never establishes its own applicability.
export const RELIABILITY_MAINTAINABILITY_RULES = Object.freeze([
  freezeRule({
    rule_id: 'RM-AVL-06',
    source_ref: 'S1-NASA-STD-8729.1A',
    source_locator: '§3.2, pp. 7-8; Appendix C, Availability Analysis, p. 33',
    source_modality: 'NASA R&M definition and analysis method; explicit Ai/Ao classification and project-selected target/basis are required',
    allowed_evidence_kinds: [null, 'availability_analysis'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'availability_input_basis_ref',
      'availability_kind_ref',
      'availability_model_or_calculation_ref',
      'availability_requirement_ref',
      'availability_result_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-CLS-07',
    source_ref: 'S2-GSFC-HDBK-8004',
    source_locator: '§§4.4-4.4.1; corroborating NASA-STD-8729.1A §5.2 and Appendix C, Problem Failure Reporting, p. 49',
    source_modality: 'traceable update and failure-control evidence; no engine authority to close risk, authorize repair, release, or accept product',
    allowed_evidence_kinds: [null, 'failure_closure_trace'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'closure_authority_ref',
      'corrective_or_control_action_ref',
      'failure_or_anomaly_ref',
      'fmeca_update_ref',
      'verification_evidence_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-FMECA-02',
    source_ref: 'S2-GSFC-HDBK-8004',
    source_locator: '§§1.1-1.2, 4.4; corroborating NASA-STD-8729.1A Appendix C, FMEA/FMECA, pp. 34-35',
    source_modality: 'GSFC FMECA guidance as a living analysis linked to design/change evidence; this engine does not assign criticality or approve mitigation',
    allowed_evidence_kinds: [null, 'fmeca_record'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'configuration_baseline_ref',
      'criticality_method_ref',
      'failure_mode_trace_ref',
      'fmeca_ref',
      'fmeca_scope_ref',
      'update_trigger_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-MDEMO-04',
    source_ref: 'S1-NASA-STD-8729.1A',
    source_locator: 'Appendix C, Maintainability Demonstration, p. 49',
    source_modality: 'formal repair simulation method for stated critical equipment/circumstances; it is not an automatic requirement outside a bound scope',
    allowed_evidence_kinds: [null, 'maintainability_demonstration_record'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'maintainability_demo_plan_ref',
      'maintainability_demo_procedure_ref',
      'maintainability_demo_result_ref',
      'maintainability_requirement_ref',
      'requirement_comparison_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-MET-03',
    source_ref: 'S1-NASA-STD-8729.1A',
    source_locator: '§3.2, pp. 7-10; Appendix C, Maintainability Modeling, p. 40',
    source_modality: 'defined R&M metrics and a repair-time estimation method; thresholds, units, and calculation method remain project-bound',
    allowed_evidence_kinds: [null, 'failure_repair_metric_record'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'metric_calculation_or_model_ref',
      'metric_cutoff_ref',
      'metric_data_ref',
      'metric_definition_ref',
      'metric_time_basis_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-REL-01',
    source_ref: 'S1-NASA-STD-8729.1A',
    source_locator: '§5.1.2(b); Appendix C, Reliability Modeling (Prediction/Allocation), p. 37',
    source_modality: 'NASA R&M planning/objective material with prediction/allocation method under stated circumstances; no universal calculation is implied',
    allowed_evidence_kinds: [null, 'reliability_allocation_model'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'allocation_or_prediction_basis_ref',
      'model_revision_ref',
      'model_scope_ref',
      'reliability_model_ref',
      'reliability_requirement_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
  freezeRule({
    rule_id: 'RM-SUP-05',
    source_ref: 'S1-NASA-STD-8729.1A',
    source_locator: '§3.2, pp. 7-13; Appendix C, Logistics Support Analysis/Plan, p. 40',
    source_modality: 'supportability/readiness analysis linking maintenance concept, support resources, spares, and support equipment; it does not authorize a purchase or provisioning action',
    allowed_evidence_kinds: [null, 'logistics_support_analysis'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: [
      'logistics_support_analysis_ref',
      'maintenance_concept_ref',
      'spares_analysis_ref',
      'support_equipment_ref',
      'support_resource_basis_ref',
    ],
    sufficiency_fields: ['evaluation_result_ref', 'evaluation_result_state'],
  }),
]);

const digestMaterial = {
  schema_version: RELIABILITY_MAINTAINABILITY_RULESET_SCHEMA,
  revision: RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
  source_packet_ref: RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF,
  rules: RELIABILITY_MAINTAINABILITY_RULES.map(({ allowed_evidence_kinds, ...rule }) => ({
    ...rule,
    allowed_evidence_mappings: allowed_evidence_kinds.map((evidence_kind) => (
      evidence_kind === null ? { source_native: true } : { evidence_kind }
    )),
  })),
};

const rulesetDigest = sha256Hex(
  `soulforge.reliability_maintainability.ruleset.digest.v0\n${canonicalise(digestMaterial, {
    rules: 'sorted_by:rule_id',
    'rules[].allowed_evidence_mappings': 'insertion_ordered',
    'rules[].required_authority_families': 'insertion_ordered',
    'rules[].context_ref_fields': 'insertion_ordered',
    'rules[].sufficiency_fields': 'insertion_ordered',
  })}`,
);

export const RELIABILITY_MAINTAINABILITY_RULESET_REF = Object.freeze({
  entity_id: 'reliability-maintainability-ruleset-v0',
  revision_id: RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: 'sha256',
});
