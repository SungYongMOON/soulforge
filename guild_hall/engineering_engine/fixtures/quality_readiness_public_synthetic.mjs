// Public-synthetic inputs only. No project payload, source body, or private path is carried here.
import { CONTRACT_REVISION } from '../kernel/contract_config.mjs';
import {
  QUALITY_READINESS_RULESET_REF,
  QUALITY_READINESS_RULESET_REVISION,
  QUALITY_READINESS_SOURCE_PACKET_REF as CANONICAL_SOURCE_PACKET_REF,
} from '../stage_rules/quality_readiness_rules.mjs';
import { createQualityReadinessModuleManifest } from '../topology/quality_readiness_module_manifest.mjs';

export const QUALITY_READINESS_SOURCE_PACKET_REF = CANONICAL_SOURCE_PACKET_REF;
export const QUALITY_READINESS_SOURCE_PACKET_SHA256 =
  QUALITY_READINESS_SOURCE_PACKET_REF.content_id.slice('sha256:'.length);

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

const APPLICABLE = Object.freeze({
  project_binding: true,
  jurisdiction: true,
  time_window: true,
  document_revision: true,
  approval_scope: true,
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

function makeFixture() {
  const manifest = createQualityReadinessModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e7f465ccbe0243efe5678cdf1a5a7dd05bbcde35',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_kernel: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-quality-readiness-focused-test-v0',
  });

  const accepted_rule_bindings = [
    ['QR-FAR-02', 'a'],
    ['QR-FAR-03', 'b'],
    ['QR-MIL-02', 'c'],
    ['QR-NASA-01', 'd'],
    ['QR-NASA-03', 'e'],
  ].map(([rule_id, fill]) => ({
    rule_id,
    stage_ref: ref(`synthetic-stage-${rule_id}`, 'r1', fill),
    owner_acceptance_ref: ref(`synthetic-owner-acceptance-${rule_id}`, 'r1', fill),
  }));
  const stageRef = (rule_id) => structuredClone(accepted_rule_bindings.find((binding) => binding.rule_id === rule_id).stage_ref);
  const binding = {
    engine_contract_revision: CONTRACT_REVISION,
    snapshot_schema_revision: 'soulforge.quality_readiness.domain_input.v0',
    engine_ref: ref('synthetic-engine', 'r1', '2'),
    project_binding_ref: ref('synthetic-project-binding', 'r1', '3'),
    objective_ref: ref('synthetic-objective', 'r1', '4'),
    policy_ref: ref('synthetic-policy', 'r1', '5'),
    snapshot_ref: ref('synthetic-snapshot', 'r1', '6'),
    engine_release_version: '1.0.0',
    engine_artifact_sha256: '4'.repeat(64),
    module_abi_revision: '1.0.0',
    module_bindings: [structuredClone(manifest)],
    common_knowledge_revision: 'quality-readiness-common-v0',
    project_knowledge_revision: 'quality-readiness-public-synthetic-v0',
    policy_bundle_revision: 'quality-readiness-policy-v0',
    ruleset_revision: QUALITY_READINESS_RULESET_REVISION,
    accepted_context_generation: 7,
    acl_policy_revision: 'synthetic-read-only-v0',
    execution_mode: 'deterministic_only',
    source_packet_ref: structuredClone(QUALITY_READINESS_SOURCE_PACKET_REF),
    ruleset_ref: structuredClone(QUALITY_READINESS_RULESET_REF),
    adapter_revision: 'soulforge.quality_readiness.adapter.v0',
    source_bindings: [
      {
        source_id: 'S1-MIL-STD-1916',
        metadata_revision_ref: ref('synthetic-s1-metadata', 'r1', '7'),
        body_revision_ref: ref('synthetic-s1-body', 'r1', '8'),
      },
      {
        source_id: 'S2-FAR-46',
        metadata_revision_ref: ref('synthetic-s2-metadata', 'r1', '9'),
        body_revision_ref: ref('synthetic-s2-body', 'r1', 'a'),
      },
      {
        source_id: 'S3-NASA-STD-8739.6B',
        metadata_revision_ref: ref('synthetic-s3-metadata', 'r1', 'b'),
        body_revision_ref: ref('synthetic-s3-body', 'r1', 'c'),
      },
    ],
    accepted_rule_bindings,
  };

  const domain_input = {
    schema_version: 'soulforge.quality_readiness.domain_input.v0',
    rows: [
      {
        case_id: 'SATISFIED',
        rule_id: 'QR-MIL-02',
        stage_ref: stageRef('QR-MIL-02'),
        applicability: copyApplicability(),
        context_refs: contextRefs('mil-02', ['invocation_ref', 'scope_ref'], 'd'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'mil-02', 'e'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-mil-02', 'r1', '5'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-manufacturing-flow', 'r1', '6')],
        artifact_token: 'manufacturing_process_flow',
        approved_evidence_selection_ref: ref('synthetic-approved-selection', 'r1', '7'),
        measurement_evaluation_criteria_ref: ref('synthetic-measurement-criteria', 'r1', '8'),
        evaluation_result_ref: ref('synthetic-evaluated-result', 'r1', '9'),
        evaluation_result_state: 'criteria_met',
      },
      {
        case_id: 'MISSING',
        rule_id: 'QR-FAR-02',
        stage_ref: stageRef('QR-FAR-02'),
        applicability: copyApplicability(),
        context_refs: contextRefs('far-02', [
          'agency_procedure_ref', 'completed_actions_ref', 'exceptions_ref', 'far_jurisdiction_ref',
          'inspection_record_ref', 'record_path_ref',
        ], 'a'),
        authority_bindings: authorityBindings([
          'applicable_law_and_regulation', 'project_contract_baseline',
        ], 'far-02', 'b'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-far-02', 'r1', 'b'),
        presence_state: 'absence_confirmed',
        evidence_refs: [],
        artifact_token: 'delivery_acceptance_record',
      },
      {
        case_id: 'UNKNOWN',
        rule_id: 'QR-NASA-01',
        stage_ref: stageRef('QR-NASA-01'),
        applicability: {
          ...copyApplicability(),
          approval_scope: 'unknown',
        },
        context_refs: contextRefs('nasa-01', [
          'authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref',
        ], 'c'),
        authority_bindings: [],
        observation_attempted: false,
        presence_state: 'unknown',
        evidence_refs: [],
        artifact_token: null,
      },
      {
        case_id: 'CONFLICT',
        rule_id: 'QR-NASA-03',
        stage_ref: stageRef('QR-NASA-03'),
        applicability: copyApplicability(),
        context_refs: contextRefs('nasa-03', [
          'authority_route_ref', 'baseline_ref', 'nasa_flowdown_ref', 'scope_ref', 'tailoring_ref',
        ], 'd'),
        authority_bindings: authorityBindings(['project_contract_baseline'], 'nasa-03', 'e'),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-nasa-03', 'r1', 'e'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-visual-inspection-record', 'r1', 'f')],
        artifact_token: null,
        conflict_claims: [
          {
            claim_id: 'synthetic-contract-sampling-claim',
            authority_family: 'project_contract_baseline',
            source_revision_ref: ref('synthetic-contract-sampling', 'contract-r1', '1'),
            lineage_ref: 'synthetic-contract-sampling-lineage',
            applicability: true,
            asserted_value: 'sampling_instruction_s1',
            valid_at: '2026-08-25T00:00:00.000Z',
            known_at: '2026-08-25T00:00:00.000Z',
          },
          {
            claim_id: 'synthetic-flowdown-sampling-claim',
            authority_family: 'project_contract_baseline',
            source_revision_ref: ref('synthetic-flowdown-sampling', 'flowdown-r1', '2'),
            lineage_ref: 'synthetic-flowdown-sampling-lineage',
            applicability: true,
            asserted_value: 'sampling_instruction_s3',
            valid_at: '2026-08-25T00:00:00.000Z',
            known_at: '2026-08-25T00:00:00.000Z',
          },
        ],
      },
      {
        case_id: 'AUTHORITY_HOLD',
        rule_id: 'QR-FAR-03',
        stage_ref: stageRef('QR-FAR-03'),
        applicability: copyApplicability(),
        context_refs: contextRefs('far-03', [
          'far_jurisdiction_ref', 'nonconformance_class_ref', 'proposed_disposition_ref',
          'selected_branch_ref', 'technical_evidence_ref',
        ], 'f'),
        authority_bindings: [],
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-observation-far-03', 'r1', '3'),
        presence_state: 'present',
        evidence_refs: [ref('synthetic-welder-record', 'r1', '4')],
        artifact_token: null,
      },
    ],
  };

  const cutoffs = {
    accepted_context_generation: 7,
    assessment_cutoff_ref: ref('synthetic-quality-readiness-cutoff', 'r1', '5'),
  };

  return {
    manifest,
    binding,
    domain_input,
    cutoffs,
  };
}

export const QUALITY_READINESS_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: 'quality-readiness-public-synthetic-v0',
  request: makeFixture(),
  expected: {
    ordered_case_ids: ['MISSING', 'AUTHORITY_HOLD', 'SATISFIED', 'UNKNOWN', 'CONFLICT'],
    states_by_case: {
      MISSING: 'gap_missing',
      AUTHORITY_HOLD: 'gap_unknown',
      SATISFIED: 'satisfied',
      UNKNOWN: 'gap_unknown',
      CONFLICT: 'gap_conflict',
    },
    counts: {
      satisfied: 1,
      gap_missing: 1,
      gap_unknown: 2,
      gap_conflict: 1,
      not_applicable: 0,
      total: 5,
    },
  },
});

export function buildQualityReadinessPublicSyntheticRequest() {
  return structuredClone(QUALITY_READINESS_PUBLIC_SYNTHETIC_FIXTURE.request);
}
