```yaml
workflow_id: llm_wiki_builder_v0
fixture_id: PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
public_safe: true
source_kind: synthetic_from_workflow_contract_metadata_only

builder_scope_packet:
  ref: synth://llm-wiki-builder/builder-scope/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  request_binding: synthetic_builder_request_binding
  project_owner_scope: declared_but_owner_identity_unspecified
  project_wiki_context_refs:
    - synthetic_project_wiki_context
  policy:
    query_first_before_raw_source_when_possible: true
    sourcebound_deepening_conditional: true
    curation_required_for_reusable_result: true
    notebooklm_advisory_only: true
    no_payload_copy_into_public_package: true
  claim_posture:
    source_truth_owner: approved_sources
    approval_owner: unspecified_project_owner
    canon_promotion_owner: review_gate_and_authorized_owner
  stop_conditions:
    - missing_project_scope
    - missing_allowed_claim_posture
    - unavailable_required_context
    - request_for_public_payload_copy
    - request_to_infer_owner_approval

preflight_result_ref:
  ref: synth://llm-wiki-builder/preflight/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: pass_with_source_gap
  route: query_first_front_gate
  source_gap:
    present: true
    description: one source gap remains
    resolution_owner: approved_source_owner_or_designated_curator
    claim_effect: do_not_treat_gap_as_source_truth
  notebooklm_role: advisory_only
  unresolved_questions:
    - source identity and authority for the remaining gap are unspecified
  stop_conditions:
    - source gap blocks the requested claim
    - advisory output is treated as a verdict
    - required source scope cannot be established

candidate_triage_ref:
  ref: synth://llm-wiki-builder/candidate-triage/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: routed
  candidates:
    - candidate_ref: synthetic_candidate_001
      placement: sourcebound_deepening
      eligibility: conditional
      reason: candidate requires the unresolved source gap to be addressed
      notebooklm_packet_eligible: unspecified
      downstream_route: sourcebound_route_decision
  excluded_or_unresolved:
    - candidate_ref: synthetic_candidate_001
      restriction: no authority promotion before source review
  stop_conditions:
    - candidate provenance is unavailable
    - candidate content cannot be separated from source-backed claims
    - packet eligibility is asserted without supporting metadata

sourcebound_route_ref:
  ref: synth://llm-wiki-builder/sourcebound-route/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  route_state: sourcebound_deepening_required
  basis:
    - preflight_has_one_source_gap
    - triage_routes_one_candidate_to_sourcebound_deepening
  required_inputs:
    - synthetic_candidate_001
    - approved_source_packet_if_available
  claim_ceiling:
    current: bounded_uncertain_candidate
    promotion_requires:
      - source_identity
      - source_scope
      - provenance
      - reviewable_support
  owner_input_required: true
  owner_decision_ref: synth://llm-wiki-builder/owner-decision/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  stop_conditions:
    - approved source packet unavailable
    - source scope conflicts remain unresolved
    - owner decision is required but absent
    - sourcebound result would exceed evidence

curation_result_ref:
  ref: synth://llm-wiki-builder/curation/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: follow_up_required
  reusable_result: not_ready_for_final_reuse
  follow_up:
    - resolve_source_gap_and_record_source_ledger_entry
  curation_owner: curation_archivist_or_designated_owner
  required_curation_artifacts:
    - source_ledger_curation_packet
    - review_handoff
  non_claims:
    - no archive_or_retire_execution
    - no ontology_acceptance
    - no canon_promotion
  stop_conditions:
    - curation provenance cannot be recorded
    - reusable placement is requested without reviewable support

usage_capture_note:
  ref: synth://llm-wiki-builder/usage-capture/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: explicit_handoff
  capture_scope:
    - query_first_route_used_as_planned
    - one_candidate_routed_to_sourcebound_deepening
    - one_source_gap_remains
    - one_curation_follow_up_remains
  usage_rollup_ref: synth://llm-wiki-builder/usage-rollup/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  capture_owner: knowledge_access_event_capture_layer
  limitations:
    - no runtime usage facts asserted
    - no tool execution asserted
    - no source payload copied
    - no notebooklm conclusion treated as verdict

final_builder_handoff:
  ref: synth://llm-wiki-builder/final-handoff/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: bounded_handoff
  route:
    1: query_first_front_gate
    2: candidate_triage
    3: sourcebound_deepening_for_synthetic_candidate_001
    4: curation_follow_up
    5: usage_capture_and_boundary_review
  next_actions:
    - resolve_remaining_source_gap
    - obtain_owner_input_if_claim_or_route_requires_it
    - complete_curation_follow_up
    - route any changed claim_or_policy_posture to post_development_review_gate
  authority:
    source_truth: approved_sources
    owner_approval: authorized_owner_only
    canon_promotion: post_development_review_gate
  prohibited_inferences:
    - source_truth_from_workflow_metadata
    - owner_approval_from_route_state
    - notebooklm_answer_as_verdict
    - public_package_payload_from_private_or_unprovided_material
  completion_condition:
    - all required handoff artifacts exist with explicit uncertainty and provenance
    - no unresolved boundary violation remains

boundary_review_note:
  ref: synth://llm-wiki-builder/boundary-review/PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  status: boundary_constrained
  checks:
    no_source_truth_overclaim: preserved
    no_owner_approval_inference: preserved
    no_payload_copy: preserved
    no_notebooklm_answer_as_verdict: preserved
  public_safe_boundary:
    - identifiers are synthetic
    - no private evidence asserted
    - no runtime facts asserted
    - no external service interaction asserted
  promotion_note: any public or canon promotion requires the applicable review gate
```
