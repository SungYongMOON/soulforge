// Candidate rule metadata only. No project fact, source body, human identity, or acceptance
// decision is stored in this public module.
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const SAFETY_HAZARD_RULESET_SCHEMA = 'soulforge.safety_hazard.ruleset.v0';
export const SAFETY_HAZARD_RULESET_REVISION = 'soulforge.safety_hazard.ruleset.v0';

export const SAFETY_HAZARD_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'safety-hazard-source-packet-v0',
  revision_id: 'safety-hazard-source-packet-v0',
  content_id: 'sha256:30fb5148f61b9eb98ca563a8722c2a91bdf6b620c86f457f05c2739588670f64',
  content_hash_alg: 'sha256',
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  required_evidence_fields: Object.freeze([...rule.required_evidence_fields]),
  required_authority_families: Object.freeze([...rule.required_authority_families]),
  lifecycle_statuses: Object.freeze([...rule.lifecycle_statuses]),
});

export const SAFETY_HAZARD_RULES = Object.freeze([
  freezeRule({
    rule_id: 'SH-AUT-06',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.7',
    source_modality: 'candidate evidence check for a bound human authority and written record; no engine acceptance',
    required_evidence_fields: ['written_acceptance_record_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['residual_risk_review', 'closed'],
    requires_human_authority_binding: true,
  }),
  freezeRule({
    rule_id: 'SH-CLS-08',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.1(d); 4.3.6; 4.3.7',
    source_modality: 'candidate traceability check for closure evidence; it never declares a hazard closed',
    required_evidence_fields: ['closure_criteria_ref', 'closure_evidence_ref', 'closure_review_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['closure_evidence_pending', 'closed'],
    requires_human_authority_binding: true,
  }),
  freezeRule({
    rule_id: 'SH-HZ-01',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.2',
    source_modality: 'candidate evidence check for identified hazard identity and analysis across the life cycle',
    required_evidence_fields: ['hazard_identity_ref', 'hazard_analysis_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['identified', 'analyzed', 'mitigation_planned', 'mitigation_implemented', 'verification_pending', 'residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
  freezeRule({
    rule_id: 'SH-LCY-07',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.8',
    source_modality: 'candidate evidence check for tracked life-cycle status and change review',
    required_evidence_fields: ['hazard_tracking_ref', 'lifecycle_status_ref', 'change_review_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['identified', 'analyzed', 'mitigation_planned', 'mitigation_implemented', 'verification_pending', 'residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
  freezeRule({
    rule_id: 'SH-MIT-03',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.4; 4.3.5',
    source_modality: 'candidate evidence check for planned and selected mitigation with expected reduction',
    required_evidence_fields: ['mitigation_plan_ref', 'selected_mitigation_ref', 'expected_risk_reduction_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['mitigation_planned', 'mitigation_implemented', 'verification_pending', 'residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
  freezeRule({
    rule_id: 'SH-RES-05',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.7',
    source_modality: 'candidate evidence check for bound residual-risk characterisation; no acceptability determination',
    required_evidence_fields: ['residual_risk_assessment_ref', 'residual_risk_basis_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
  freezeRule({
    rule_id: 'SH-RSK-02',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.3; Tables I-III',
    source_modality: 'candidate evidence check for separately bound severity, probability, and risk characterisation',
    required_evidence_fields: ['severity_assessment_ref', 'probability_assessment_ref', 'risk_assessment_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['analyzed', 'mitigation_planned', 'mitigation_implemented', 'verification_pending', 'residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
  freezeRule({
    rule_id: 'SH-VV-04',
    source_ref: 'S1-MIL-STD-882E-CHANGE-1',
    source_locator: '4.3.6',
    source_modality: 'candidate evidence check for implementation, verification method, evidence, and effectiveness result',
    required_evidence_fields: ['mitigation_implementation_ref', 'verification_method_ref', 'verification_evidence_ref', 'effectiveness_result_ref'],
    required_authority_families: ['project_contract_baseline'],
    lifecycle_statuses: ['mitigation_implemented', 'verification_pending', 'residual_risk_review', 'closure_evidence_pending', 'closed'],
    requires_human_authority_binding: false,
  }),
]);

const digestMaterial = {
  schema_version: SAFETY_HAZARD_RULESET_SCHEMA,
  revision: SAFETY_HAZARD_RULESET_REVISION,
  source_packet_ref: SAFETY_HAZARD_SOURCE_PACKET_REF,
  rules: SAFETY_HAZARD_RULES,
};

const rulesetDigest = sha256Hex(canonicalise(digestMaterial, {
  rules: 'sorted_by:rule_id',
  'rules[].required_evidence_fields': 'insertion_ordered',
  'rules[].required_authority_families': 'insertion_ordered',
  'rules[].lifecycle_statuses': 'insertion_ordered',
}));

// Independent literal lock: this value is intentionally not derived from the current rules at
// assertion time. A rule-row change must update the reviewed pin explicitly instead of letting
// the exported reference silently follow production metadata.
export const SAFETY_HAZARD_FROZEN_RULESET_CONTENT_ID = 'sha256:05d49b5bd79fcc956aa93a9877d9a0b638a9d592a86ad7c85e0cc03f53a72992';

if (`sha256:${rulesetDigest}` !== SAFETY_HAZARD_FROZEN_RULESET_CONTENT_ID) {
  throw new Error('Safety Hazard base ruleset digest drifted from its reviewed frozen pin');
}

export const SAFETY_HAZARD_RULESET_REF = Object.freeze({
  entity_id: 'safety-hazard-ruleset-v0',
  revision_id: SAFETY_HAZARD_RULESET_REVISION,
  content_id: SAFETY_HAZARD_FROZEN_RULESET_CONTENT_ID,
  content_hash_alg: 'sha256',
});
