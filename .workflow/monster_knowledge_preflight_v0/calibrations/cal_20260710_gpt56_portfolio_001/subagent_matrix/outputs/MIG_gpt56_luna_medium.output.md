```yaml
workflow_id: monster_knowledge_preflight_v0
fixture_id: PUBLIC_SYNTH_MONSTER_KNOWLEDGE_PREFLIGHT_V0
deliverable_kind: workflow_calibration_candidate
public_safe: true
source_kind: synthetic_from_workflow_contract_metadata_only
readiness_label: pilot-executed
calibration_state: candidate
authority: metadata_only

inputs:
  monster_request_binding: synthetic:monster_request_binding_001
  project_knowledge_context_refs:
    - synthetic:project_wiki_binding_001
  preflight_policy: synthetic:preflight_policy_001
  notebooklm_binding_refs: []
  notebooklm_source_ledger_refs: []
  common_reference_refs: []
  source_packet_refs:
    - synthetic:approved_source_ref_001
  owner_decision_refs: []
  existing_mission_refs: []

knowledge_preflight_packet:
  project_binding_ref: synthetic:project_wiki_binding_001
  source_ledger_ref: synthetic:approved_source_ref_001
  notebook_binding_ref: null
  common_reference_ref: null
  visible_gap_refs:
    - synthetic:source_gap_001
  known_claim_ceiling_ref: synthetic:claim_ceiling_seed_001
  metadata_only: true
  source_payload_included: false
  notebooklm_answer_payload_included: false
  auth_or_session_material_included: false

wiki_first_query_plan:
  plan_id: synthetic:wiki_first_query_plan_001
  primary_route: query_existing_project_wiki_first
  ordered_routes:
    - query_existing_project_wiki_first
    - sourcebound_deepening_required_if_gap_persists
    - query_notebooklm_first_only_if_an_approved_binding_is_present
    - owner_input_required_if_scope_or_authority_remains_ambiguous
  query_targets:
    - project_binding_ref: synthetic:project_wiki_binding_001
      purpose: locate existing project knowledge relevant to the monster request
    - visible_gap_ref: synthetic:source_gap_001
      purpose: determine whether approved source deepening is needed
  notebooklm_role: optional_advisory
  notebooklm_final_verdict: prohibited
  stop_if:
    - project scope is not declared
    - allowed claim ceiling is absent
    - approved source route cannot be identified
    - owner decision is required but unavailable

source_scope_recommendation:
  recommendation_id: synthetic:source_scope_recommendation_001
  immediate_scope:
    - existing_project_wiki_binding_ref: synthetic:project_wiki_binding_001
    - approved_source_ref: synthetic:approved_source_ref_001
  deepening_route:
    status: conditional
    trigger_ref: synthetic:source_gap_001
    approved_route_required: true
  source_gap_remains_visible: true
  raw_source_payload_allowed: false
  notebooklm_as_final_authority: false
  owner_approval_assumed: false

claim_ceiling_seed:
  seed_id: synthetic:claim_ceiling_seed_001
  initial_ceiling: only_metadata_supported_by_project_binding_and_approved_source_refs
  allowed:
    - identify available knowledge surfaces
    - identify the approved source reference
    - preserve the visible source gap
    - recommend query-first sequencing
  not_allowed:
    - final monster knowledge claims
    - uncited source truth
    - NotebookLM answer assertions
    - canon or ontology promotion
    - owner approval claims
  promotion_route:
    - query_existing_project_wiki_first
    - resolve_or_escalate_visible_source_gap
    - obtain approved source-backed evidence
    - apply main_workflow_claim_rules

main_workflow_handoff:
  handoff_id: synthetic:main_workflow_handoff_001
  consumable_outputs:
    - synthetic:knowledge_preflight_packet_001
    - synthetic:wiki_first_query_plan_001
    - synthetic:source_scope_recommendation_001
    - synthetic:claim_ceiling_seed_001
  entry_condition: main_workflow_may_begin_with_metadata_only_scope
  required_behavior:
    - query_project_wiki_first
    - retain_source_gap_visibility
    - stay_within_claim_ceiling_seed
    - deepen_sources_only_through_approved_route
  prohibited_behavior:
    - copy_source_payload_into_public_package
    - treat_notebooklm_as_final_verdict
    - infer_owner_approval
    - promote_claim_seed_to_final_claim
    - promote_to_canon_without_required_review

boundary_review_note:
  note_id: synthetic:boundary_review_note_001
  public_safe: true
  metadata_only: true
  no_raw_source_truth_claimed: true
  no_notebooklm_answer_payload_included: true
  no_secret_or_session_material_included: true
  no_owner_approval_overclaim: true
  no_canon_promotion: true
  uncertainty:
    - source gap remains unresolved in this preflight candidate
    - final claims require later source-backed workflow handling
    - NotebookLM availability and runtime state are unspecified
  stop_conditions:
    - missing project owner scope
    - missing allowed claim ceiling
    - unresolved authority ambiguity
    - unavailable approved source route
    - owner decision required
```
