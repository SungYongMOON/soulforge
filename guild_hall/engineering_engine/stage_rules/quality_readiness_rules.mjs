// E01 Quality Readiness candidate rule metadata. This is bounded metadata only: no source body,
// project payload, or applicability decision is stored here.
import { canonicalise } from '../kernel/canonical.mjs';
import { sha256Hex } from '../kernel/fingerprint.mjs';

export const QUALITY_READINESS_RULESET_SCHEMA = 'soulforge.quality_readiness.ruleset.v0';
export const QUALITY_READINESS_RULESET_REVISION = 'soulforge.quality_readiness.ruleset.v0';

export const QUALITY_READINESS_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'quality-readiness-source-packet-v0',
  revision_id: 'quality-readiness-source-packet-v0',
  content_id: 'sha256:22507ce2ba2b5aeac6937d4adfbe2627002cd361990d006847173dac6a02e60c',
  content_hash_alg: 'sha256',
});

const freezeRule = (rule) => Object.freeze({
  ...rule,
  allowed_artifact_tokens: Object.freeze([...rule.allowed_artifact_tokens]),
  required_authority_families: Object.freeze([...rule.required_authority_families]),
  context_ref_fields: Object.freeze([...rule.context_ref_fields]),
  sufficiency_fields: Object.freeze([...rule.sufficiency_fields]),
});

// Ordered by rule_id. Candidate rows remain data until a binding explicitly includes their ID.
export const QUALITY_READINESS_RULES = Object.freeze([
  freezeRule({
    rule_id: 'QR-FAR-01',
    source_ref: 'S2-FAR-46',
    source_locator: '§§46.103-46.105, 46.201-46.203',
    source_modality: 'role- and clause-specific duties; exact contract controls',
    allowed_artifact_tokens: [null],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: ['agency_allocation_ref', 'contract_clause_ref', 'far_jurisdiction_ref'],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-FAR-02',
    source_ref: 'S2-FAR-46',
    source_locator: '§§46.104(c), 46.401(f), 46.501-46.502',
    source_modality: '§46.401(f) inspection documentation is mandatory; ordinary acceptance-certificate path is conditional on exact procedure and exceptions',
    allowed_artifact_tokens: ['delivery_acceptance_record'],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: [
      'agency_procedure_ref',
      'completed_actions_ref',
      'exceptions_ref',
      'far_jurisdiction_ref',
      'inspection_record_ref',
      'record_path_ref',
    ],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-FAR-03',
    source_ref: 'S2-FAR-46',
    source_locator: '§46.407',
    source_modality: 'preserve branch-specific should/may/shall and prerequisites',
    allowed_artifact_tokens: [null],
    required_authority_families: ['applicable_law_and_regulation', 'project_contract_baseline'],
    context_ref_fields: [
      'far_jurisdiction_ref',
      'nonconformance_class_ref',
      'proposed_disposition_ref',
      'selected_branch_ref',
      'technical_evidence_ref',
    ],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-MIL-01',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§1.2, 5.1-5.1.3',
    source_modality: 'operative requirements only after exact invocation; §1.2 flow-down should remains advisory',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['invocation_ref', 'scope_ref'],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-MIL-02',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§5.1.4.1-5.1.4.3',
    source_modality: 'effectiveness proof required; evidence examples are non-exhaustive and not individually mandatory',
    allowed_artifact_tokens: [null, 'manufacturing_process_flow'],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['invocation_ref', 'scope_ref'],
    sufficiency_fields: [
      'approved_evidence_selection_ref',
      'measurement_evaluation_criteria_ref',
    ],
  }),
  freezeRule({
    rule_id: 'QR-MIL-03',
    source_ref: 'S1-MIL-STD-1916',
    source_locator: '§§4.3-4.5',
    source_modality: 'operative requirements with critical-nonconformance branch conditions',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['government_route_ref', 'invocation_ref', 'scope_ref'],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-NASA-01',
    source_ref: 'S3-NASA-STD-8739.6B',
    source_locator: '§§1.2-1.3, 4.1.2-4.1.5',
    source_modality: '§1.2.3 referral remains advisory; §4.1.2 is context; only §§4.1.4-4.1.5 operative duties become checks',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref'],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-NASA-02',
    source_ref: 'S3-NASA-STD-8739.6B',
    source_locator: '§§4.1.6, 4.3.1-4.3.2',
    source_modality: 'operative stop-work and prior-approval requirements',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref'],
    sufficiency_fields: [],
  }),
  freezeRule({
    rule_id: 'QR-NASA-03',
    source_ref: 'S3-NASA-STD-8739.6B',
    source_locator: '§§5.4, 6.6.1, 6.8.1-6.8.2',
    source_modality: 'operative, scope-specific retention/inspection/rework/repair requirements',
    allowed_artifact_tokens: [null],
    required_authority_families: ['project_contract_baseline'],
    context_ref_fields: ['authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref'],
    sufficiency_fields: [],
  }),
]);

const digestMaterial = {
  schema_version: QUALITY_READINESS_RULESET_SCHEMA,
  revision: QUALITY_READINESS_RULESET_REVISION,
  source_packet_ref: QUALITY_READINESS_SOURCE_PACKET_REF,
  rules: QUALITY_READINESS_RULES.map(({ allowed_artifact_tokens, ...rule }) => ({
    ...rule,
    allowed_artifact_mappings: allowed_artifact_tokens.map((artifact_token) => (
      artifact_token === null ? { source_native: true } : { artifact_token }
    )),
  })),
};

const rulesetDigest = sha256Hex(
  `soulforge.quality_readiness.ruleset.digest.v0\n${canonicalise(digestMaterial, {
    rules: 'sorted_by:rule_id',
    'rules[].allowed_artifact_mappings': 'insertion_ordered',
    'rules[].required_authority_families': 'insertion_ordered',
    'rules[].context_ref_fields': 'insertion_ordered',
    'rules[].sufficiency_fields': 'insertion_ordered',
  })}`,
);

export const QUALITY_READINESS_RULESET_REF = Object.freeze({
  entity_id: 'quality-readiness-ruleset-v0',
  revision_id: QUALITY_READINESS_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: 'sha256',
});
