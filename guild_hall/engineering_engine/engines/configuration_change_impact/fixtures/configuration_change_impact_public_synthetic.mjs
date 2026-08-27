// Synthetic evidence only. It does not represent a real change, project, configuration item,
// approval, baseline, or closure decision.
import {
  CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS,
  CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA,
  CONFIGURATION_CHANGE_IMPACT_RULESET_REF,
} from '../rules/configuration_change_impact_rules.mjs';
import { configurationChangeImpactChangeIdentityDigest } from '../evaluator/configuration_change_impact_evaluator_adapter.mjs';

const freezeDeep = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

const ref = (name) => `ref:synthetic-${name}`;
const itemRef = (impactKind) => `item:synthetic-${impactKind}`;
const CHANGE_ID = 'synthetic-ecn-001';

function compareRefs(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function makeEvidence(evidenceName, change_identity_digest, item_ref, item_path_refs, relationship_path_refs) {
  return {
    evidence_ref: ref(evidenceName),
    change_id: CHANGE_ID,
    change_identity_digest,
    item_ref,
    item_path_refs: [...item_path_refs],
    relationship_path_refs: [...relationship_path_refs],
  };
}

function makeRequest() {
  const impactSequence = CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map((impact_kind) => ({
    item_ref: itemRef(impact_kind),
    impact_kind,
  }));
  const relationships = impactSequence.slice(0, -1).map((node, index) => ({
    from_item_ref: node.item_ref,
    to_item_ref: impactSequence[index + 1].item_ref,
    relationship_ref: ref(`relationship-${String(index + 1).padStart(2, '0')}`),
  }));
  const change = {
    change_id: CHANGE_ID,
    change_class: 'engineering_change',
    change_request_ref: ref('change-request-001'),
    pre_change_baseline_ref: ref('baseline-r2'),
    pre_change_revision_ref: ref('revision-r2'),
    target_post_change_revision_ref: ref('revision-r3'),
    seed_item_refs: [itemRef('requirements')],
  };
  const change_identity_digest = configurationChangeImpactChangeIdentityDigest({
    change_id: change.change_id,
    change_class: change.change_class,
    change_request_ref: change.change_request_ref,
    pre_change_baseline_ref: change.pre_change_baseline_ref,
    pre_change_revision_ref: change.pre_change_revision_ref,
    target_post_change_revision_ref: change.target_post_change_revision_ref,
  });
  return {
    schema_version: CONFIGURATION_CHANGE_IMPACT_INPUT_SCHEMA,
    change,
    propagation_graph: {
      complete: true,
      nodes: [...impactSequence].sort((left, right) => compareRefs(left.item_ref, right.item_ref)),
      edges: [...relationships].sort((left, right) => compareRefs(left.from_item_ref, right.from_item_ref)
        || compareRefs(left.to_item_ref, right.to_item_ref)
        || compareRefs(left.relationship_ref, right.relationship_ref)),
    },
    impact_records: CONFIGURATION_CHANGE_IMPACT_IMPACT_KINDS.map((impact_kind, index) => {
      const item_path_refs = impactSequence.slice(0, index + 1).map((node) => node.item_ref);
      const relationship_path_refs = relationships.slice(0, index).map((edge) => edge.relationship_ref);
      const item_ref = itemRef(impact_kind);
      return {
        impact_kind,
        impact_state: 'affected_verified',
        impact_analysis_ref: ref(`analysis-${impact_kind}`),
        affected_item_refs: [item_ref],
        propagation_evidence: [makeEvidence(`propagation-${impact_kind}`, change_identity_digest, item_ref, item_path_refs, relationship_path_refs)],
        verification_evidence: [makeEvidence(`verification-${impact_kind}`, change_identity_digest, item_ref, item_path_refs, relationship_path_refs)],
      };
    }),
    approval: {
      state: 'approved',
      approval_decision_ref: ref('ccb-decision-001'),
    },
    closure: {
      state: 'closed',
      closure_evidence: [makeEvidence(
        'closure-package-001',
        change_identity_digest,
        itemRef('closure_evidence'),
        impactSequence.map((node) => node.item_ref),
        relationships.map((edge) => edge.relationship_ref),
      )],
    },
  };
}

function makeProjectBindingRef() {
  return {
    schema_version: 'soulforge.project_binding.v0',
    project_id: 'project:synthetic-configuration-change',
    domain_engine_id: 'configuration_change_impact',
    binding_revision_hash: `sha256:${'a'.repeat(64)}`,
    source_manifest_ref: ref('source-manifest-001'),
  };
}

function makeProjectProfile() {
  return {
    profile_kind: 'project',
    profile_id: 'synthetic-configuration-change-profile',
    domain_engine_id: 'configuration_change_impact',
    revision_or_hash: `sha256:${'b'.repeat(64)}`,
    extends_or_base_pin: CONFIGURATION_CHANGE_IMPACT_RULESET_REF.content_id,
    source_refs: [ref('configuration-change-profile')],
    order: 0,
    operations: [],
  };
}

export const CONFIGURATION_CHANGE_IMPACT_PUBLIC_SYNTHETIC_FIXTURE = freezeDeep({
  fixture_id: 'configuration-change-impact-public-synthetic-v0',
  request: makeRequest(),
  project_binding_ref: makeProjectBindingRef(),
  project_profile: makeProjectProfile(),
  cutoffs: {
    valid_at: '2026-08-26T00:00:00.000Z',
    known_at: '2026-08-26T00:00:00.000Z',
  },
});

export function buildConfigurationChangeImpactPublicSyntheticRequest() {
  return structuredClone(CONFIGURATION_CHANGE_IMPACT_PUBLIC_SYNTHETIC_FIXTURE.request);
}

export function buildConfigurationChangeImpactPublicSyntheticProjectProfile() {
  return structuredClone(CONFIGURATION_CHANGE_IMPACT_PUBLIC_SYNTHETIC_FIXTURE.project_profile);
}

export function buildConfigurationChangeImpactPublicSyntheticBindingInput(
  request = buildConfigurationChangeImpactPublicSyntheticRequest(),
  compilationScope = 'public_synthetic',
) {
  const project_binding_ref = structuredClone(CONFIGURATION_CHANGE_IMPACT_PUBLIC_SYNTHETIC_FIXTURE.project_binding_ref);
  const project_profile = buildConfigurationChangeImpactPublicSyntheticProjectProfile();
  return {
    project_binding_ref,
    project_profile,
    source_snapshot_refs: {
      snapshot_id: ref('snapshot-001'),
      source_refs: [ref('typed-facts-source-001')],
      observations: [{
        fact_kind: 'configuration_change_impact_change',
        project_binding_ref: structuredClone(project_binding_ref),
        project_profile: structuredClone(project_profile),
        change_identity: {
          change_id: request.change.change_id,
          change_class: request.change.change_class,
          change_request_ref: request.change.change_request_ref,
          pre_change_baseline_ref: request.change.pre_change_baseline_ref,
          pre_change_revision_ref: request.change.pre_change_revision_ref,
          target_post_change_revision_ref: request.change.target_post_change_revision_ref,
        },
        request: structuredClone(request),
      }],
    },
    cutoffs: structuredClone(CONFIGURATION_CHANGE_IMPACT_PUBLIC_SYNTHETIC_FIXTURE.cutoffs),
    compilation_scope: { compilation_scope: compilationScope },
  };
}
