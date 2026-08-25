// Public-synthetic fixture only. It includes no source body, project payload, target value,
// customer data, local path, secret, or Quality acceptance conclusion.
import { CONTRACT_REVISION } from '../../../core/validators/contract_config.mjs';
import {
  RM_ADAPTER_REVISION,
  RM_DOMAIN_INPUT_SCHEMA,
} from '../evaluator/reliability_maintainability.mjs';
import {
  RELIABILITY_MAINTAINABILITY_RULESET_REF,
  RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF as CANONICAL_SOURCE_PACKET_REF,
} from '../rules/reliability_maintainability_rules.mjs';
import { createReliabilityMaintainabilityModuleManifest } from '../topology/reliability_maintainability_module_manifest.mjs';

export const RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF = CANONICAL_SOURCE_PACKET_REF;
export const RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_SHA256 =
  RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF.content_id.slice('sha256:'.length);

const APPLICABLE = Object.freeze({
  project_binding: true,
  jurisdiction: true,
  time_window: true,
  document_revision: true,
  approval_scope: true,
});

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const ref = (entity_id, revision_id, fill) => Object.freeze({
  entity_id,
  revision_id,
  content_id: `sha256:${fill.repeat(64)}`,
  content_hash_alg: 'sha256',
});

const copyApplicability = () => ({ ...APPLICABLE });

const authorityBindings = (families, label, fill) => families
  .slice()
  .sort()
  .map((authority_family, index) => ({
    authority_family,
    role_ref: ref(`synthetic-${label}-role-${index}`, 'r1', fill),
    delegation_ref: ref(`synthetic-${label}-delegation-${index}`, 'r1', fill),
    decision_ref: ref(`synthetic-${label}-decision-${index}`, 'r1', fill),
  }));

const contextRefs = (label, fields, fill) => Object.fromEntries(fields.map((field) => [
  field,
  ref(`synthetic-${label}-${field}`, 'r1', fill),
]));

const ACCEPTED_RULES = Object.freeze([
  ['RM-AVL-06', 'a', 'b'],
  ['RM-CLS-07', 'c', 'd'],
  ['RM-FMECA-02', 'e', 'f'],
  ['RM-MDEMO-04', '1', '2'],
  ['RM-MET-03', '3', '4'],
  ['RM-REL-01', '5', '6'],
  ['RM-SUP-05', '7', '8'],
]);

function makeFixture() {
  const manifest = createReliabilityMaintainabilityModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-reliability-maintainability-focused-test-v0',
  });
  const accepted_rule_bindings = ACCEPTED_RULES.map(([rule_id, stageFill, ownerFill]) => ({
    rule_id,
    stage_ref: ref(`synthetic-stage-${rule_id}`, 'r1', stageFill),
    owner_acceptance_ref: ref(`synthetic-owner-acceptance-${rule_id}`, 'r1', ownerFill),
  }));
  const stageRef = (ruleId) => structuredClone(
    accepted_rule_bindings.find((binding) => binding.rule_id === ruleId).stage_ref,
  );
  const binding = {
    engine_contract_revision: CONTRACT_REVISION,
    snapshot_schema_revision: RM_DOMAIN_INPUT_SCHEMA,
    engine_ref: ref('synthetic-engine', 'r1', '9'),
    project_binding_ref: ref('synthetic-project-binding', 'r1', 'a'),
    objective_ref: ref('synthetic-objective', 'r1', 'b'),
    policy_ref: ref('synthetic-policy', 'r1', 'c'),
    snapshot_ref: ref('synthetic-snapshot', 'r1', 'd'),
    engine_release_version: '1.0.0',
    engine_artifact_sha256: '4'.repeat(64),
    module_abi_revision: '1.0.0',
    module_bindings: [structuredClone(manifest)],
    common_knowledge_revision: 'reliability-maintainability-common-v0',
    project_knowledge_revision: 'reliability-maintainability-public-synthetic-v0',
    policy_bundle_revision: 'reliability-maintainability-policy-v0',
    ruleset_revision: RELIABILITY_MAINTAINABILITY_RULESET_REVISION,
    accepted_context_generation: 7,
    acl_policy_revision: 'synthetic-read-only-v0',
    execution_mode: 'deterministic_only',
    source_packet_ref: structuredClone(RELIABILITY_MAINTAINABILITY_SOURCE_PACKET_REF),
    ruleset_ref: structuredClone(RELIABILITY_MAINTAINABILITY_RULESET_REF),
    adapter_revision: RM_ADAPTER_REVISION,
    source_bindings: [
      {
        source_id: 'S1-NASA-STD-8729.1A',
        metadata_revision_ref: ref('synthetic-s1-metadata', 'r1', '1'),
        body_revision_ref: ref('synthetic-s1-body', 'r1', '2'),
      },
      {
        source_id: 'S2-GSFC-HDBK-8004',
        metadata_revision_ref: ref('synthetic-s2-metadata', 'r1', '3'),
        body_revision_ref: ref('synthetic-s2-body', 'r1', '4'),
      },
    ],
    accepted_rule_bindings,
  };
  const domain_input = {
    schema_version: RM_DOMAIN_INPUT_SCHEMA,
    rows: [
      {
        case_id: 'RELIABILITY_SATISFIED',
        rule_id: 'RM-REL-01',
        stage_ref: stageRef('RM-REL-01'),
        applicability: copyApplicability(),
        context_refs: contextRefs('rel', [
          'allocation_or_prediction_basis_ref', 'model_revision_ref', 'model_scope_ref',
          'reliability_model_ref', 'reliability_requirement_ref',
        ], '5'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'rel', '6'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-rel', 'r1', '7'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-reliability-model', 'r1', '8')],
        evidence_kind: 'reliability_allocation_model',
        evaluation_result_ref: ref('synthetic-reliability-model-evaluation', 'r1', '9'),
        evaluation_result_state: 'criteria_met',
      },
      {
        case_id: 'FMECA_CONFLICT',
        rule_id: 'RM-FMECA-02',
        stage_ref: stageRef('RM-FMECA-02'),
        applicability: copyApplicability(),
        context_refs: contextRefs('fmeca', [
          'configuration_baseline_ref', 'criticality_method_ref', 'failure_mode_trace_ref',
          'fmeca_ref', 'fmeca_scope_ref', 'update_trigger_ref',
        ], 'a'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'fmeca', 'b'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-fmeca', 'r1', 'c'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-fmeca', 'r1', 'd')],
        evidence_kind: 'fmeca_record',
        conflict_claims: [
          {
            claim_id: 'synthetic-fmeca-source-a',
            authority_family: 'project_contract_baseline',
            source_revision_ref: ref('synthetic-fmeca-source-a-revision', 'r1', '1'),
            lineage_ref: 'synthetic-fmeca-lineage-a',
            applicability: true,
            asserted_value: 'analysis_revision_a',
            valid_at: '2026-08-26T00:00:00.000Z',
            known_at: '2026-08-26T00:00:00.000Z',
          },
          {
            claim_id: 'synthetic-fmeca-source-b',
            authority_family: 'project_contract_baseline',
            source_revision_ref: ref('synthetic-fmeca-source-b-revision', 'r2', '2'),
            lineage_ref: 'synthetic-fmeca-lineage-b',
            applicability: true,
            asserted_value: 'analysis_revision_b',
            valid_at: '2026-08-26T00:00:00.000Z',
            known_at: '2026-08-26T00:00:00.000Z',
          },
        ],
      },
      {
        case_id: 'METRICS_MISSING',
        rule_id: 'RM-MET-03',
        stage_ref: stageRef('RM-MET-03'),
        applicability: copyApplicability(),
        context_refs: contextRefs('metrics', [
          'metric_calculation_or_model_ref', 'metric_cutoff_ref', 'metric_data_ref',
          'metric_definition_ref', 'metric_time_basis_ref',
        ], 'e'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'metrics', 'f'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-metrics', 'r1', '1'),
        presence_state: 'absence_confirmed',
        evidence_refs: [],
        evidence_kind: 'failure_repair_metric_record',
      },
      {
        case_id: 'DEMO_UNKNOWN',
        rule_id: 'RM-MDEMO-04',
        stage_ref: stageRef('RM-MDEMO-04'),
        applicability: { ...copyApplicability(), approval_scope: 'unknown' },
        context_refs: contextRefs('demo', [
          'maintainability_demo_plan_ref', 'maintainability_demo_procedure_ref',
          'maintainability_demo_result_ref', 'maintainability_requirement_ref',
          'requirement_comparison_ref',
        ], '2'),
        authority_bindings: [],
        observation_attempted: false,
        presence_state: 'unknown',
        evidence_refs: [],
        evidence_kind: 'maintainability_demonstration_record',
      },
      {
        case_id: 'SUPPORT_AUTHORITY_HOLD',
        rule_id: 'RM-SUP-05',
        stage_ref: stageRef('RM-SUP-05'),
        applicability: copyApplicability(),
        context_refs: contextRefs('support', [
          'logistics_support_analysis_ref', 'maintenance_concept_ref', 'spares_analysis_ref',
          'support_equipment_ref', 'support_resource_basis_ref',
        ], '3'),
        authority_bindings: [],
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-support', 'r1', '4'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-support-analysis', 'r1', '5')],
        evidence_kind: 'logistics_support_analysis',
      },
      {
        case_id: 'AVAILABILITY_NOT_APPLICABLE',
        rule_id: 'RM-AVL-06',
        stage_ref: stageRef('RM-AVL-06'),
        applicability: { ...copyApplicability(), approval_scope: false },
        context_refs: contextRefs('availability', [
          'availability_input_basis_ref', 'availability_kind_ref',
          'availability_model_or_calculation_ref', 'availability_requirement_ref',
          'availability_result_ref',
        ], '6'),
        authority_bindings: [],
        observation_attempted: false,
        presence_state: 'unknown',
        evidence_refs: [],
        evidence_kind: 'availability_analysis',
        not_applicable_basis_ref: ref('synthetic-availability-na-basis', 'r1', '7'),
      },
      {
        case_id: 'CLOSURE_GAP',
        rule_id: 'RM-CLS-07',
        stage_ref: stageRef('RM-CLS-07'),
        applicability: copyApplicability(),
        context_refs: contextRefs('closure', [
          'corrective_or_control_action_ref', 'failure_or_anomaly_ref', 'fmeca_update_ref',
          'verification_evidence_ref',
        ], '8'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'closure', '9'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-closure', 'r1', 'a'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-closure-trace', 'r1', 'b')],
        evidence_kind: 'failure_closure_trace',
      },
    ],
  };
  const cutoffs = {
    accepted_context_generation: 7,
    assessment_cutoff_ref: ref('synthetic-reliability-maintainability-cutoff', 'r1', 'c'),
  };
  return { manifest, binding, domain_input, cutoffs };
}

export const RELIABILITY_MAINTAINABILITY_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: 'reliability-maintainability-public-synthetic-v0',
  request: makeFixture(),
  expected: {
    ordered_case_ids: [
      'AVAILABILITY_NOT_APPLICABLE',
      'CLOSURE_GAP',
      'FMECA_CONFLICT',
      'DEMO_UNKNOWN',
      'METRICS_MISSING',
      'RELIABILITY_SATISFIED',
      'SUPPORT_AUTHORITY_HOLD',
    ],
    states_by_case: {
      AVAILABILITY_NOT_APPLICABLE: 'not_applicable',
      CLOSURE_GAP: 'gap_unknown',
      FMECA_CONFLICT: 'gap_conflict',
      DEMO_UNKNOWN: 'gap_unknown',
      METRICS_MISSING: 'gap_missing',
      RELIABILITY_SATISFIED: 'satisfied',
      SUPPORT_AUTHORITY_HOLD: 'gap_unknown',
    },
    counts: {
      satisfied: 1,
      gap_missing: 1,
      gap_unknown: 3,
      gap_conflict: 1,
      not_applicable: 1,
      total: 7,
    },
  },
});

export function buildReliabilityMaintainabilityPublicSyntheticRequest() {
  return structuredClone(RELIABILITY_MAINTAINABILITY_PUBLIC_SYNTHETIC_FIXTURE.request);
}
