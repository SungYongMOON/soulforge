// Public-synthetic-only fixture for source/RAG/Profile/observation/guidance/MCP seams.
import { assembleEffectiveRuleSet, resolveProfileBindings } from '../../../core/interfaces/domain_engine_adapter.mjs';
import { buildQualityReadinessTypedFacts } from '../binding/quality_readiness_typed_facts.mjs';
import { qualityReadinessAdapter } from '../evaluator/quality_readiness_evaluator_adapter.mjs';
import { buildQualityReadinessPublicSyntheticRequest } from './quality_readiness_public_synthetic.mjs';
import { admitQualityReadinessDirectSource } from '../source/quality_readiness_source_derivation.mjs';
import { createQualityReadinessRagPacket } from '../rag/quality_readiness_rag_boundary.mjs';

export const QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT = '2026-08-26T00:00:00.000Z';

export const qualityReadinessSyntheticRef = (entity_id, revision_id, fill) => ({
  entity_id,
  revision_id,
  content_id: `sha256:${fill.repeat(64)}`,
  content_hash_alg: 'sha256',
});

export const QUALITY_READINESS_SYNTHETIC_PROFILE_RULE = Object.freeze({
  rule_id: 'QR-SYNTH-01',
  source_ref: 'qr_public_synthetic_source_01',
  source_locator: 'synthetic-section-1',
  source_modality: 'synthetic direct-source evidence remains owner-review only',
  allowed_artifact_tokens: [null],
  required_authority_families: ['company_approved_procedure'],
  context_ref_fields: ['synthetic_scope_ref'],
  sufficiency_fields: [],
});

export function buildQualityReadinessDeepeningPublicSynthetic() {
  const profile = {
    profile_kind: 'organization',
    profile_id: 'qr_public_synthetic_org_01',
    domain_engine_id: 'quality_readiness',
    revision_or_hash: 'r1',
    extends_or_base_pin: 'quality_readiness_base_v0',
    source_refs: ['qr_public_synthetic_source_01'],
    operations: [{ op: 'add', rule: QUALITY_READINESS_SYNTHETIC_PROFILE_RULE }],
    order: 0,
  };
  const [binding] = resolveProfileBindings(profile, null);
  const assembly = assembleEffectiveRuleSet(qualityReadinessAdapter, [binding], {});
  const request = buildQualityReadinessPublicSyntheticRequest();
  const sourceDirectRecord = admitQualityReadinessDirectSource({
    source_id: 'qr_public_synthetic_source_01',
    authority_family: 'quality_guidance',
    official_url: 'https://example.invalid/quality-readiness-public-synthetic',
    metadata_revision_ref: qualityReadinessSyntheticRef('qr-synthetic-source-metadata', 'r1', 'a'),
    body_revision_ref: qualityReadinessSyntheticRef('qr-synthetic-source-body', 'r1', 'b'),
    status_receipt_ref: qualityReadinessSyntheticRef('qr-synthetic-source-status', 'r1', 'c'),
    exact_locator: 'synthetic-section-1',
    access_class: 'public_synthetic',
    applicability_ceiling: 'unknown_hold',
  });
  const stageRef = qualityReadinessSyntheticRef('qr-synthetic-profile-stage', 'r1', 'd');
  const acceptanceRef = qualityReadinessSyntheticRef('qr-synthetic-profile-acceptance', 'r1', 'e');
  request.binding.ruleset_ref = structuredClone(assembly.effective_rule_set.ruleset_ref);
  request.binding.ruleset_revision = assembly.effective_rule_set.ruleset_ref.revision_id;
  request.binding.profile_source_bindings = [{
    source_id: sourceDirectRecord.source_id,
    source_ref: 'qr_public_synthetic_source_01',
    metadata_revision_ref: structuredClone(sourceDirectRecord.metadata_revision_ref),
    body_revision_ref: structuredClone(sourceDirectRecord.body_revision_ref),
    direct_derivation_ref: structuredClone(sourceDirectRecord.direct_derivation_ref),
    access_class: 'public_synthetic',
    direct_source_state: 'synthetic_direct_confirmed',
    source_lane: 'public_synthetic',
    claim_ceiling: 'observed',
  }];
  request.binding.accepted_rule_bindings.push({
    rule_id: QUALITY_READINESS_SYNTHETIC_PROFILE_RULE.rule_id,
    stage_ref: structuredClone(stageRef),
    owner_acceptance_ref: structuredClone(acceptanceRef),
  });
  request.domain_input.rows.push({
    case_id: 'PROFILE_SYNTHETIC_SATISFIED',
    rule_id: QUALITY_READINESS_SYNTHETIC_PROFILE_RULE.rule_id,
    stage_ref: structuredClone(stageRef),
    applicability: {
      project_binding: true,
      jurisdiction: true,
      time_window: true,
      document_revision: true,
      approval_scope: true,
    },
    context_refs: {
      synthetic_scope_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-scope', 'r1', '1'),
    },
    authority_bindings: [{
      authority_family: 'company_approved_procedure',
      role_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-role', 'r1', '2'),
      delegation_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-delegation', 'r1', '3'),
      decision_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-decision', 'r1', '4'),
    }],
    observation_attempted: true,
    observation_attempt_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-observation', 'r1', '5'),
    presence_state: 'present',
    evidence_refs: [qualityReadinessSyntheticRef('qr-synthetic-profile-evidence', 'r1', '6')],
    artifact_token: null,
    evaluation_result_ref: qualityReadinessSyntheticRef('qr-synthetic-profile-evaluation', 'r1', '7'),
    evaluation_result_state: 'criteria_met',
  });
  const typed_facts = buildQualityReadinessTypedFacts({
    request,
    compilation_trace: assembly.compilation_trace,
    valid_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
    known_at: QUALITY_READINESS_DEEPENING_SYNTHETIC_INSTANT,
  });
  const rag_packet = createQualityReadinessRagPacket({
    source_set_kind: 'public_synthetic',
    corpus_derivation_sha256: 'public_synthetic_no_corpus',
    direct_source_records: [sourceDirectRecord],
    retrieval_records: [{
      source_id: sourceDirectRecord.source_id,
      direct_record_sha256: sourceDirectRecord.record_sha256,
      locator: 'synthetic-section-1',
      topic_tags: ['quality', 'synthetic'],
    }],
  });
  return {
    profile,
    assembly,
    request,
    typed_facts,
    source_direct_record: sourceDirectRecord,
    rag_packet,
  };
}
