workflow_id: monster_knowledge_preflight_v0
fixture_id: PUBLIC_SYNTH_MONSTER_KNOWLEDGE_PREFLIGHT_V0
deliverable_kind: public_safe_synthetic_preflight_deliverable
status: ready_for_bounded_main_workflow_handoff
public_safe: true

knowledge_preflight_packet:
  project_binding:
    project_binding_ref: synthetic://project-wiki-binding
    monster_request_ref: synthetic://monster-request-binding
    preflight_policy_ref: synthetic://preflight-policy
    owner_scope_status: not_supplied
  available_surfaces:
    project_wiki:
      availability: available
      binding_ref: synthetic://project-wiki-binding
      priority: first
    approved_sources:
      availability: available
      refs:
        - synthetic://approved-source-ref-001
      payload_included: false
    notebooklm:
      availability: unknown
      binding_ref: null
      advisory_only: true
    common_references:
      availability: unknown
      refs: []
  visible_gaps:
    - gap_ref: synthetic://source-gap-001
      status: unresolved
      description: Source coverage remains incomplete for an unspecified part of the request.
  metadata_only: true
  excluded_content:
    - raw_source_truth
    - source_payload_body
    - notebooklm_answer_payload
    - authentication_or_session_material
    - hidden_private_evidence

wiki_first_query_plan:
  selected_route: query_existing_project_wiki_first
  query_target_ref: synthetic://project-wiki-binding
  objectives:
    - Determine whether existing project knowledge addresses the bounded monster request.
    - Identify which requested claims are supported, unsupported, or ambiguous.
    - Preserve synthetic://source-gap-001 as an explicit unresolved gap.
  query_constraints:
    metadata_only: true
    notebooklm_final_verdict_allowed: false
    source_payload_copy_allowed: false
    canon_promotion_allowed: false
  route_after_query:
    sufficient_metadata_support: handoff_to_main_workflow_with_current_claim_ceiling
    unresolved_source_gap: sourcebound_deepening_required
    scope_or_authority_decision_needed: owner_input_required
  stop_conditions:
    - Stop if the query requires source payloads outside an approved route.
    - Stop if resolving scope requires owner authority.
    - Stop if a stronger claim would exceed the seeded claim ceiling.
    - Stop if public-safe or metadata-only boundaries cannot be maintained.

source_scope_recommendation:
  current_scope:
    wiki_ref: synthetic://project-wiki-binding
    approved_source_refs:
      - synthetic://approved-source-ref-001
    unresolved_gap_refs:
      - synthetic://source-gap-001
  recommendation: query_existing_project_wiki_before_source_deepening
  deepening_route:
    state: conditional
    permitted_trigger: synthetic://source-gap-001-remains-material-after-wiki-query
    required_route: approved_sourcebound_deepening
    proposed_source_ref: synthetic://approved-source-ref-001
  restrictions:
    - Do not treat the approved source reference as proof of any substantive claim.
    - Do not infer the missing source's identity, content, or authority.
    - Do not expand source scope without an approved route.
    - Do not mutate or promote upstream artifacts.

claim_ceiling_seed:
  ceiling: metadata_level_preliminary_only
  permitted_claims:
    - An existing synthetic project-wiki binding is available.
    - One synthetic approved source reference exists.
    - One synthetic source gap remains unresolved.
    - The preflight and handoff remain metadata-only.
  prohibited_claims:
    - substantive_source_truth
    - source_gap_resolution
    - notebooklm_verdict
    - owner_approval
    - ontology_acceptance
    - canon_promotion
    - main_workflow_completion
  uncertainty:
    owner_scope: unknown
    notebooklm_availability: unknown
    wiki_answer_sufficiency: unknown
    approved_source_substantive_support: unknown
  final_claim_authority: false

main_workflow_handoff:
  handoff_state: proceed_with_query_first_boundary
  request_ref: synthetic://monster-request-binding
  knowledge_preflight_packet_ref: synthetic://knowledge-preflight-packet
  wiki_first_query_plan_ref: synthetic://wiki-first-query-plan
  source_scope_recommendation_ref: synthetic://source-scope-recommendation
  claim_ceiling_seed_ref: synthetic://claim-ceiling-seed
  next_action: Query synthetic://project-wiki-binding within the seeded claim ceiling.
  conditional_followup: If synthetic://source-gap-001 remains material, route it through approved source-bound deepening using synthetic://approved-source-ref-001.
  owner_gate: Required if scope, authority, or approval must be determined.
  downstream_constraints:
    - Preserve the unresolved source gap.
    - Treat NotebookLM, if later available, as advisory only.
    - Keep all transferred content metadata-only.
    - Require post-development review before public or canon promotion.

boundary_review_note:
  disposition: boundary_preserved
  confirmed_from_fixture:
    - existing_wiki_binding_available
    - one_approved_source_ref_exists
    - one_source_gap_remains
    - packet_is_metadata_only
  non_claims:
    - No raw-source truth is asserted.
    - No source or NotebookLM answer payload is included.
    - No secret, authentication, or session material is included.
    - No owner approval or decision is asserted.
    - No runtime fact, main-workflow completion, or canon promotion is asserted.
  residual_risks:
    - Wiki sufficiency remains unknown until the bounded query is evaluated.
    - The approved source reference does not establish substantive support by itself.
    - The unresolved source gap may require an approved deepening route.
  release_boundary: synthetic_public_safe_metadata_only
