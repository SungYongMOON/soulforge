// Public-synthetic fixture only. It contains no source body, project payload, human identity,
// signature, acceptance decision, absolute path, or private workspace reference.
import { CONTRACT_REVISION } from '../../../core/validators/contract_config.mjs';
import {
  SAFETY_HAZARD_RULES,
  SAFETY_HAZARD_RULESET_REF,
  SAFETY_HAZARD_RULESET_REVISION,
  SAFETY_HAZARD_SOURCE_PACKET_REF,
} from '../rules/safety_hazard_rules.mjs';
import { createSafetyHazardModuleManifest } from '../topology/safety_hazard_module_manifest.mjs';

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const ref = (entityId, revisionId, fill) => Object.freeze({
  entity_id: entityId,
  revision_id: revisionId,
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

const authorityBindings = (label, fill) => [{
  authority_family: 'project_contract_baseline',
  role_ref: ref(`synthetic-${label}-role`, 'r1', fill),
  delegation_ref: ref(`synthetic-${label}-delegation`, 'r1', fill),
  decision_ref: ref(`synthetic-${label}-decision`, 'r1', fill),
}];

const humanAuthorityBinding = (label, fill) => ({
  authority_kind: 'named_human',
  named_human_authority_ref: ref(`synthetic-${label}-human-authority`, 'r1', fill),
  delegation_ref: ref(`synthetic-${label}-human-delegation`, 'r1', fill),
  authority_scope_ref: ref(`synthetic-${label}-human-scope`, 'r1', fill),
});

const conflictClaims = () => [
  {
    claim_id: 'synthetic-contract-control',
    authority_family: 'project_contract_baseline',
    source_revision_ref: ref('synthetic-contract-control', 'contract-r1', 'a'),
    lineage_ref: 'synthetic-contract-control-lineage',
    applicability: true,
    asserted_value: 'verification_complete',
    valid_at: '2026-08-26T00:00:00.000Z',
    known_at: '2026-08-26T00:00:00.000Z',
  },
  {
    claim_id: 'synthetic-wiki-control',
    authority_family: 'reviewed_wiki',
    source_revision_ref: ref('synthetic-wiki-control', 'wiki-r1', 'b'),
    lineage_ref: 'synthetic-wiki-control-lineage',
    applicability: true,
    asserted_value: 'verification_pending',
    valid_at: '2026-08-26T00:00:00.000Z',
    known_at: '2026-08-26T00:00:00.000Z',
  },
];

function makeFixture() {
  const manifest = createSafetyHazardModuleManifest({
    module_version: '0.1.0',
    build_commit: 'e2acd5d899a1760bd528ffd12a9835c949df1d8e',
    artifact_sha256: '1'.repeat(64),
    engine_contract_abi_range: '>=1.0.0 <2.0.0',
    supported_project_classifications: ['public_synthetic'],
    dependency_versions: { engineering_core: '1.0.0' },
    configuration_hash: '2'.repeat(64),
    rollback_compatible_with: ['0.1.0'],
    test_receipt_ref: 'receipt:synthetic-safety-hazard-focused-test-v0',
  });
  const accepted_rule_bindings = SAFETY_HAZARD_RULES.map((rule, index) => ({
    rule_id: rule.rule_id,
    stage_ref: ref(`synthetic-stage-${rule.rule_id}`, 'r1', String(index + 1)),
    human_rule_acceptance_ref: ref(`synthetic-human-rule-acceptance-${rule.rule_id}`, 'r1', String(index + 1)),
  }));

  const binding = {
    engine_contract_revision: CONTRACT_REVISION,
    snapshot_schema_revision: 'soulforge.safety_hazard.domain_input.v0',
    engine_ref: ref('synthetic-safety-hazard-engine', 'r1', '2'),
    project_binding_ref: ref('synthetic-safety-hazard-project-binding', 'r1', '3'),
    objective_ref: ref('synthetic-safety-hazard-objective', 'r1', '4'),
    policy_ref: ref('synthetic-safety-hazard-policy', 'r1', '5'),
    snapshot_ref: ref('synthetic-safety-hazard-snapshot', 'r1', '6'),
    engine_release_version: '1.0.0',
    engine_artifact_sha256: '4'.repeat(64),
    module_abi_revision: '1.0.0',
    module_bindings: [structuredClone(manifest)],
    common_knowledge_revision: 'safety-hazard-common-v0',
    project_knowledge_revision: 'safety-hazard-public-synthetic-v0',
    policy_bundle_revision: 'safety-hazard-policy-v0',
    ruleset_revision: SAFETY_HAZARD_RULESET_REVISION,
    accepted_context_generation: 7,
    acl_policy_revision: 'synthetic-read-only-v0',
    execution_mode: 'deterministic_only',
    source_packet_ref: structuredClone(SAFETY_HAZARD_SOURCE_PACKET_REF),
    ruleset_ref: structuredClone(SAFETY_HAZARD_RULESET_REF),
    adapter_revision: 'soulforge.safety_hazard.adapter.v0',
    source_bindings: [{
      source_id: 'S1-MIL-STD-882E-CHANGE-1',
      metadata_revision_ref: ref('synthetic-mil-std-882e-metadata', 'r1', '7'),
      body_revision_ref: ref('synthetic-mil-std-882e-body', 'r1', '8'),
    }],
    accepted_rule_bindings,
  };

  const domain_input = {
    schema_version: 'soulforge.safety_hazard.domain_input.v0',
    rows: [
      {
        case_id: 'HAZARD_IDENTITY',
        rule_id: 'SH-HZ-01',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-hazard-observation', 'r1', '9'),
        presence_state: 'present',
        lifecycle_status: 'identified',
        authority_bindings: authorityBindings('hazard', 'a'),
        evidence: {
          hazard_identity_ref: ref('synthetic-hazard-identity', 'r1', 'b'),
          hazard_analysis_ref: ref('synthetic-hazard-analysis', 'r1', 'c'),
        },
      },
      {
        case_id: 'RISK_MISSING',
        rule_id: 'SH-RSK-02',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-risk-observation', 'r1', 'd'),
        presence_state: 'absence_confirmed',
        lifecycle_status: 'analyzed',
        authority_bindings: authorityBindings('risk', 'e'),
        evidence: {},
        risk_characterization: {
          severity: 'critical',
          probability: 'remote',
          risk: 'serious',
        },
      },
      {
        case_id: 'MITIGATION_UNKNOWN',
        rule_id: 'SH-MIT-03',
        applicability: copyApplicability(),
        observation_attempted: false,
        presence_state: 'unknown',
        lifecycle_status: 'mitigation_planned',
        authority_bindings: authorityBindings('mitigation', 'f'),
        evidence: {},
      },
      {
        case_id: 'VERIFICATION_CONFLICT',
        rule_id: 'SH-VV-04',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-verification-observation', 'r1', '1'),
        presence_state: 'present',
        lifecycle_status: 'verification_pending',
        authority_bindings: authorityBindings('verification', '2'),
        evidence: {
          mitigation_implementation_ref: ref('synthetic-mitigation-implemented', 'r1', '3'),
          verification_method_ref: ref('synthetic-verification-method', 'r1', '4'),
          verification_evidence_ref: ref('synthetic-verification-evidence', 'r1', '5'),
          effectiveness_result_ref: ref('synthetic-effectiveness-result', 'r1', '6'),
        },
        conflict_claims: conflictClaims(),
      },
      {
        case_id: 'RESIDUAL_RISK_REVIEW',
        rule_id: 'SH-RES-05',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-residual-observation', 'r1', '7'),
        presence_state: 'present',
        lifecycle_status: 'residual_risk_review',
        authority_bindings: authorityBindings('residual', '8'),
        evidence: {
          residual_risk_assessment_ref: ref('synthetic-residual-assessment', 'r1', '9'),
          residual_risk_basis_ref: ref('synthetic-residual-basis', 'r1', 'a'),
        },
      },
      {
        case_id: 'HUMAN_AUTHORITY_EVIDENCE',
        rule_id: 'SH-AUT-06',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-human-authority-observation', 'r1', 'b'),
        presence_state: 'present',
        lifecycle_status: 'residual_risk_review',
        authority_bindings: authorityBindings('human-authority', 'c'),
        acceptance_authority_binding: humanAuthorityBinding('human-authority', 'd'),
        evidence: {
          written_acceptance_record_ref: ref('synthetic-written-acceptance-record', 'r1', 'e'),
        },
      },
      {
        case_id: 'LIFECYCLE_STATUS',
        rule_id: 'SH-LCY-07',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-lifecycle-observation', 'r1', 'f'),
        presence_state: 'present',
        lifecycle_status: 'mitigation_implemented',
        authority_bindings: authorityBindings('lifecycle', '1'),
        evidence: {
          hazard_tracking_ref: ref('synthetic-hazard-tracking', 'r1', '2'),
          lifecycle_status_ref: ref('synthetic-lifecycle-status', 'r1', '3'),
          change_review_ref: ref('synthetic-change-review', 'r1', '4'),
        },
      },
      {
        case_id: 'CLOSURE_EVIDENCE',
        rule_id: 'SH-CLS-08',
        applicability: copyApplicability(),
        observation_attempted: true,
        observation_attempt_ref: ref('synthetic-closure-observation', 'r1', '5'),
        presence_state: 'present',
        lifecycle_status: 'closed',
        authority_bindings: authorityBindings('closure', '6'),
        acceptance_authority_binding: humanAuthorityBinding('closure', '7'),
        evidence: {
          closure_criteria_ref: ref('synthetic-closure-criteria', 'r1', '8'),
          closure_evidence_ref: ref('synthetic-closure-evidence', 'r1', '9'),
          closure_review_ref: ref('synthetic-closure-review', 'r1', 'a'),
        },
      },
    ],
  };

  return {
    manifest,
    binding,
    domain_input,
    cutoffs: {
      accepted_context_generation: 7,
      assessment_cutoff_ref: ref('synthetic-safety-hazard-cutoff', 'r1', 'b'),
    },
  };
}

export const SAFETY_HAZARD_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: 'safety-hazard-public-synthetic-v0',
  request: makeFixture(),
  expected: {
    states_by_case: {
      HAZARD_IDENTITY: 'satisfied',
      RISK_MISSING: 'gap_missing',
      MITIGATION_UNKNOWN: 'gap_unknown',
      VERIFICATION_CONFLICT: 'gap_conflict',
      RESIDUAL_RISK_REVIEW: 'satisfied',
      HUMAN_AUTHORITY_EVIDENCE: 'satisfied',
      LIFECYCLE_STATUS: 'satisfied',
      CLOSURE_EVIDENCE: 'satisfied',
    },
    counts: {
      satisfied: 5,
      gap_missing: 1,
      gap_unknown: 1,
      gap_conflict: 1,
      not_applicable: 0,
      total: 8,
    },
  },
});

export function buildSafetyHazardPublicSyntheticRequest() {
  return structuredClone(SAFETY_HAZARD_PUBLIC_SYNTHETIC_FIXTURE.request);
}
