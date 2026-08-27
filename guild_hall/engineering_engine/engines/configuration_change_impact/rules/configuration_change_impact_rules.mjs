// Public-safe configuration-change impact rules. These are source-supported candidate
// checks, not project authority, compliance criteria, or a configuration-management procedure.
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { sha256Hex } from '../../../core/validators/fingerprint.mjs';

export const CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA = 'soulforge.configuration_change_impact.ruleset.v0';
export const CONFIGURATION_CHANGE_IMPACT_RULESET_REVISION = 'soulforge.configuration_change_impact.ruleset.v0';
export const CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA = 'soulforge.configuration_change_impact.input.v0';
export const CONFIGURATION_CHANGE_IMPACT_ASSESSMENT_SCHEMA = 'soulforge.configuration_change_impact.assessment.v0';
export const CONFIGURATION_CHANGE_IMPACT_RESULT_SCHEMA = 'soulforge.configuration_change_impact.domain_result.v0';
export const CONFIGURATION_CHANGE_IMPACT_RECEIPT_SCHEMA = 'soulforge.configuration_change_impact.receipt.v0';

// One package-owned error vocabulary. Core errors retain their Core ownership; this vocabulary
// names only the domain-local admission and result-contract failures callers can branch on.
export const CONFIGURATION_CHANGE_IMPACT_ERROR_CODES = Object.freeze({
  INPUT_REFUSED: 'CCI_INPUT_REFUSED',
  CHANGE_IDENTITY_REFUSED: 'CCI_CHANGE_IDENTITY_REFUSED',
  IMPACT_COVERAGE_REFUSED: 'CCI_IMPACT_COVERAGE_REFUSED',
  IMPACT_RECORD_REFUSED: 'CCI_IMPACT_RECORD_REFUSED',
  APPROVAL_REFUSED: 'CCI_APPROVAL_REFUSED',
  CLOSURE_REFUSED: 'CCI_CLOSURE_REFUSED',
  EVIDENCE_BINDING_REFUSED: 'CCI_EVIDENCE_BINDING_REFUSED',
  RULESET_REFUSED: 'CCI_RULESET_REFUSED',
  PROFILE_BINDINGS_INVALID: 'CCI_PROFILE_BINDINGS_INVALID',
  PROFILE_DOMAIN_MISMATCH: 'CCI_PROFILE_DOMAIN_MISMATCH',
  PROFILE_PROVENANCE_INVALID: 'CCI_PROFILE_PROVENANCE_INVALID',
  PROFILE_OPERATION_UNSUPPORTED: 'CCI_PROFILE_OPERATION_UNSUPPORTED',
  EVALUATOR_REQUIRED: 'CCI_EVALUATOR_REQUIRED',
  TYPED_FACTS_REFUSED: 'CCI_TYPED_FACTS_REFUSED',
  PROJECT_BINDING_MISMATCH: 'CCI_PROJECT_BINDING_MISMATCH',
  PROFILE_BINDING_MISMATCH: 'CCI_PROFILE_BINDING_MISMATCH',
  GRAPH_REFUSED: 'CCI_PROPAGATION_GRAPH_REFUSED',
  NODE_REFUSED: 'CCI_PROPAGATION_NODE_REFUSED',
  EDGE_REFUSED: 'CCI_PROPAGATION_EDGE_REFUSED',
  SEED_REFUSED: 'CCI_PROPAGATION_SEED_REFUSED',
  PROPAGATION_REFUSED: 'CCI_PROPAGATION_REFUSED',
  PROPAGATION_CONFLICT: 'CCI_PROPAGATION_CONFLICT',
  MANIFEST_INPUT_REFUSED: 'CCI_MANIFEST_INPUT_REFUSED',
});

export const CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF = Object.freeze({
  entity_id: 'configuration-change-impact-source-packet-v0',
  revision_id: 'configuration-change-impact-source-packet-v0',
  content_id: 'sha256:c97908b8d6cb99cf164fb9fff7783a887f85c7748d04cf298ce2e396f54f16cd',
  content_hash_alg: 'sha256',
});

export const CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS = Object.freeze([
  'requirements',
  'bom',
  'drawings',
  'software',
  'interfaces',
  'tests',
  'documents',
  'baselines',
  'closure_evidence',
]);

export const CONFIGURATION_CHANGE_IMPACT_IMPACT_STATES = Object.freeze([
  'affected_verified',
  'affected_pending',
  'conflict',
  'not_affected',
  'unknown',
]);

const freezeRule = (rule) => Object.freeze({
  ...rule,
  source_refs: Object.freeze([...rule.source_refs]),
});

export const CONFIGURATION_CHANGE_IMPACT_RULES = Object.freeze([
  freezeRule({
    rule_id: 'CCI-APPROVAL-03',
    source_refs: ['S1-NASA-SEH-REV2', 'S2-NASA-SEH-WEB-6.2'],
    source_locator: 'SEH §6.5.1.2.3; web §6.2.1.2.3',
    evaluation_focus: 'decision evidence stays separate from impact and implementation evidence',
  }),
  freezeRule({
    rule_id: 'CCI-CHANGE-01',
    source_refs: ['S1-NASA-SEH-REV2', 'S2-NASA-SEH-WEB-6.2'],
    source_locator: 'SEH §6.5.1.2.3; web §6.2.1.2.3',
    evaluation_focus: 'explicit controlled-change identity plus pre-change baseline/revision and target post-change revision',
  }),
  freezeRule({
    rule_id: 'CCI-CLOSURE-04',
    source_refs: ['S1-NASA-SEH-REV2', 'S3-NASA-SEH-WEB-6.3', 'S4-NASA-SWE-053-VER-D'],
    source_locator: 'SEH §6.5.1.2.3; web §§6.3.1.2.3-6.3.1.3; SWE-053 §§5-7',
    evaluation_focus: 'verified propagation and change-bound retrievable closure evidence before a closed assessment',
  }),
  freezeRule({
    rule_id: 'CCI-IMPACT-02',
    source_refs: ['S2-NASA-SEH-WEB-6.2', 'S3-NASA-SEH-WEB-6.3'],
    source_locator: 'web §§6.2.1.2.2-6.2.1.2.3; §§6.3.1.2.2-6.3.1.3',
    evaluation_focus: 'explicit, complete impact coverage across the fixed domain vocabulary',
  }),
  freezeRule({
    rule_id: 'CCI-PROPAGATION-05',
    source_refs: ['S2-NASA-SEH-WEB-6.2', 'S3-NASA-SEH-WEB-6.3'],
    source_locator: 'web §§6.2.1.2.2-6.2.1.2.3; §§6.3.1.2.2-6.3.1.3',
    evaluation_focus: 'deterministic transitive impact traversal over explicit dependency facts',
  }),
]);

const digestMaterial = {
  schema_version: CONFIGURATION_CHANGE_IMPACT_RULESET_SCHEMA,
  revision: CONFIGURATION_CHANGE_IMPACT_RULESET_REVISION,
  source_packet_ref: CONFIGURATION_CHANGE_IMPACT_SOURCE_PACKET_REF,
  rules: CONFIGURATION_CHANGE_IMPACT_RULES,
};

const rulesetDigest = sha256Hex(
  `soulforge.configuration_change_impact.ruleset.digest.v0\n${canonicalise(digestMaterial, {
    rules: 'sorted_by:rule_id',
    'rules[].source_refs': 'insertion_ordered',
  })}`,
);

export const CONFIGURATION_CHANGE_IMPACT_RULESET_REF = Object.freeze({
  entity_id: 'configuration-change-impact-ruleset-v0',
  revision_id: CONFIGURATION_CHANGE_IMPACT_RULESET_REVISION,
  content_id: `sha256:${rulesetDigest}`,
  content_hash_alg: 'sha256',
});

export function isConfigurationChangeImpactKind(value) {
  return typeof value === 'string' && CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.includes(value);
}

export function isConfigurationChangeImpactState(value) {
  return typeof value === 'string' && CONFIGURATION_CHANGE_IMPACT_IMPACT_STATES.includes(value);
}
