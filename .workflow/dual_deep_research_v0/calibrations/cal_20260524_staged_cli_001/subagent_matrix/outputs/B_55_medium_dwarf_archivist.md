```yaml
profile_metadata:
  candidate_id: B_55_medium_dwarf_archivist
  model: gpt-5.5
  reasoning_effort: medium
  species: dwarf
  class: archivist
  execution_mode: synthetic_public_safe
  external_actions_performed: none

goal_declaration:
  goal: determine_preconditions_for_automatic_research_delta_handoff_to_knowledge_wiki_cell
  declared_before_material_research: true
  downstream_target: knowledge_wiki_cell_via_knowledge_wiki_pipeline_v0
  stop_condition: record_blocker_if_real_source_truth_notebooklm_state_owner_approval_or_wiki_mutation_is_required

frozen_research_brief:
  scope:
    - identify workflow-boundary conditions for preparing a research_delta_handoff
    - compare synthetic NotebookLM and Codex advisory packets
    - preserve common_trace_conflicts_and_gaps
  exclusions:
    - real_notebooklm_cli_execution
    - web_or_drive_access
    - wiki_or_source_mutation
    - owner_approval_inference
    - registration_or_default_route_claim
  allowed_inputs:
    - workflow_contract_summary
    - synthetic_notebooklm_advisory_packet
    - synthetic_codex_direct_advisory_packet
  downstream_limits:
    handoff_may_be_prepared: true
    registration_may_be_claimed: false
    source_truth_may_be_inferred: false
    owner_approval_may_be_inferred: false

subagent_stage_manifest:
  notebooklm_operator:
    status: synthetic_packet_supplied
    independence: kept_separate_until_comparison
    real_cli_used: false
  codex_researcher:
    status: synthetic_packet_supplied
    independence: kept_separate_until_comparison
    browse_used: false
  comparison_archivist:
    status: executed_synthetically
    role: normalize_common_delta_conflict_gap

notebooklm_cli_research_packet:
  advisory_only: true
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  raw_payload_embedded: false
  claims:
    N1: goal_must_be_declared_before_material_research
    N2: notebooklm_and_codex_lanes_remain_separated_until_comparison
    N3: common_claims_removed_from_delta_but_retained_as_trace
    N4: handoff_targets_knowledge_wiki_cell_after_boundary_pass
    N5: workflow_itself_may_register_result_if_both_lanes_agree
    N6: new_workflow_creation_routes_through_workflow_generator

codex_direct_research_packet:
  advisory_only: true
  research_mode: synthetic_direct_packet_only_no_browse
  claims:
    C1: goal_declaration_required_before_material_research
    C2: paths_independent_until_both_packets_complete
    C3: agreement_is_not_source_truth_or_owner_approval
    C4: delta_handoff_may_be_prepared_but_registration_judgment_belongs_downstream
    C5: common_claims_are_trace_not_delta_recommendations
    C6: created_or_evolved_workflows_require_workflow_check_before_readiness_registration_promotion_default_route_claims
    C7: google_drive_placement_and_notebooklm_packet_map_mutation_are_outside_scope

dual_research_comparison_packet:
  common:
    - goal_declaration_required_before_material_research
    - notebooklm_and_codex_paths_must_remain_independent_until_comparison
    - common_claims_retained_as_trace_and_removed_from_delta_recommendations
    - handoff_may_target_knowledge_wiki_cell_or_knowledge_wiki_pipeline_v0
    - new_or_evolved_workflow_work_routes_through_workflow_generator
  notebooklm_only:
    - N4_requires_boundary_pass_before_handoff
  codex_only:
    - agreement_between_lanes_is_not_source_truth_or_owner_approval
    - registration_judgment_belongs_downstream
    - workflow_check_required_before_readiness_registration_promotion_or_default_route_safety_claims
    - google_drive_placement_and_notebooklm_packet_map_mutation_are_outside_scope
  conflict:
    - id: reject_N5
      notebooklm_claim: workflow_itself_may_register_result_if_both_lanes_agree
      codex_or_contract_position: workflow_does_not_perform_registration_and_lane_agreement_is_not_authority
      resolution: rejected_as_overclaim
  gap:
    - real_source_truth_not_established
    - real_notebooklm_account_or_packet_state_not_established
    - owner_approval_not_established
    - wiki_mutation_or_registration_not_performed

research_delta_handoff:
  target: knowledge_wiki_cell_via_knowledge_wiki_pipeline_v0
  status: prepared_synthetic_delta_only
  delta_recommendations:
    - require_boundary_pass_before_handoff
    - state_that_lane_agreement_is_advisory_not_source_truth
    - state_that_registration_judgment_belongs_downstream
    - require_workflow_check_before_any_readiness_registration_promotion_default_route_or_default_route_safety_claim
    - keep_drive_placement_notebooklm_packet_map_mutation_and_wiki_mutation_out_of_scope
  common_trace_preserved:
    - goal_declared_before_material_research
    - independent_notebooklm_and_codex_lanes
    - common_claims_removed_from_delta_view
    - target_is_knowledge_wiki_cell_or_knowledge_wiki_pipeline_v0
  blockers:
    - real_source_truth_required_for_truth_claim
    - owner_approval_required_for_registration_or_default_route_claim
    - downstream_authority_required_for_wiki_mutation

boundary_review_note:
  no_real_external_systems_used: true
  no_registration_claimed: true
  no_default_route_safety_claimed: true
  no_wiki_mutation_claimed: true
  strongest_supported_state: synthetic_handoff_packet_prepared
  rejected_overclaim: N5

optimizer_self_check:
  followed_no_shell_no_browse_constraint: true
  declared_goal_before_material_research: true
  froze_research_brief: true
  preserved_lane_independence_until_comparison: true
  removed_common_claims_from_delta_recommendations: true
  preserved_common_trace: true
  preserved_conflicts_and_gaps: true
  output_machine_readable_yaml: true
```
