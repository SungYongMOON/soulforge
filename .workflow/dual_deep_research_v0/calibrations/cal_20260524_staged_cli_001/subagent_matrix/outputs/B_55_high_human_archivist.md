profile_metadata:
  candidate_id: B_55_high_human_archivist
  model: gpt-5.5
  reasoning_effort: high
  species: human
  class: archivist
  mode: public_safe_synthetic_calibration
  real_tools_used: false
goal_declaration:
  goal: Determine what must be true before dual_deep_research_v0 may prepare an automatic research-delta handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0.
  declared_before_material_research: true
  truth_ceiling: advisory_comparison_only
frozen_research_brief:
  scope:
    - use workflow contract summary
    - use synthetic NotebookLM advisory packet
    - use synthetic Codex direct advisory packet
  exclusions:
    - no shell_commands
    - no browsing
    - no real NotebookLM_or_CLI_claims
    - no Google_Drive_or_wiki_mutation_claims
    - no registration_or_default_route_claims
  allowed_inputs:
    - public_safe_workflow_contract_summary
    - synthetic_notebooklm_advisory_packet
    - synthetic_codex_direct_advisory_packet
  downstream_limits:
    handoff_target: knowledge_wiki_cell_via_knowledge_wiki_pipeline_v0
    registration_authority: downstream_only
    source_truth_claim: prohibited
    owner_approval_claim: prohibited
subagent_stage_manifest:
  notebooklm_operator:
    status: synthetic_packet_supplied
    independence: kept_separate_until_comparison
    real_cli_executed: false
  codex_researcher:
    status: synthetic_packet_supplied
    independence: kept_separate_until_comparison
    browse_executed: false
  comparison_archivist:
    status: completed_from_allowed_synthetic_inputs
    normalized_buckets:
      - common
      - notebooklm_only
      - codex_only
      - conflict
      - gap
notebooklm_cli_research_packet:
  provenance: synthetic_advisory_only
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  raw_payload_embedded: false
  advisory_claims:
    N1: Goal must be declared before material research.
    N2: NotebookLM and Codex research lanes must remain separated until comparison.
    N3: Common claims should be removed from the delta view but retained as trace metadata.
    N4: Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass.
    N5: The research workflow itself may register the result in the wiki if both lanes agree.
    N6: If a new workflow is needed, route creation through workflow-generator.
codex_direct_research_packet:
  provenance: synthetic_advisory_only
  research_mode: synthetic_direct_packet_only_no_browse
  advisory_claims:
    C1: A goal declaration is required before material research begins.
    C2: The two research paths must stay independent until both packets are complete.
    C3: Agreement between NotebookLM and Codex is not source truth and must not imply owner approval.
    C4: Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream.
    C5: Common claims are trace metadata and should not be repeated as delta recommendations.
    C6: Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims.
    C7: Google Drive placement and NotebookLM packet-map mutation are outside this workflow.
dual_research_comparison_packet:
  common:
    - ids: [N1, C1]
      claim: Goal declaration is required before material research.
    - ids: [N2, C2]
      claim: NotebookLM and Codex lanes must remain independent until both packets are complete and comparison begins.
    - ids: [N3, C5]
      claim: Common claims are retained as trace metadata and omitted from delta recommendations.
    - ids: [N4, C4]
      claim: A bounded delta handoff may target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary review; registration is downstream.
  notebooklm_only:
    - ids: [N6]
      claim: New workflow creation should route through workflow-generator.
  codex_only:
    - ids: [C3]
      claim: Lane agreement is not source truth and does not imply owner approval.
    - ids: [C6]
      claim: Workflow creation or evolution requires workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims.
    - ids: [C7]
      claim: Google Drive placement and NotebookLM packet-map mutation are outside this workflow.
  conflict:
    - ids: [N5, C3, C4]
      rejected_claim: The research workflow itself may register the result in the wiki if both lanes agree.
      reason: Agreement is advisory, not source truth or owner approval; registration judgment belongs downstream.
  gap:
    - real source truth was not established
    - real NotebookLM account or notebook state was not verified
    - owner approval was not obtained
    - wiki mutation or registration was not performed
research_delta_handoff:
  target: knowledge_wiki_cell
  route: knowledge_wiki_pipeline_v0
  handoff_state: prepared_synthetic_blocked_for_real_mutation
  common_trace_preserved:
    - goal_declared_before_research
    - independent_lanes_until_comparison
    - common_claims_removed_from_delta_but_retained_as_trace
    - handoff_target_after_boundary_pass
  delta_recommendations:
    - Enforce that lane agreement cannot be treated as source truth or owner approval.
    - Keep wiki registration judgment downstream of dual_deep_research_v0.
    - Treat Google Drive placement and NotebookLM packet-map mutation as out of scope.
    - If workflow creation or evolution is required, route through soulforge-workflow-generator and require soulforge-workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims.
  rejected_delta_items:
    - id: N5
      disposition: rejected_overclaim
  blockers_for_completion:
    - real_source_truth_required_for_truth_claims
    - owner_approval_required_for_registration_or_promotion
    - downstream_wiki_authority_required_for_mutation
boundary_review_note:
  status: boundary_pass_for_synthetic_packet_only
  no_real_notebooklm_claim: true
  no_cli_claim: true
  no_browser_claim: true
  no_drive_claim: true
  no_wiki_mutation_claim: true
  no_registration_claim: true
  default_route_safe: blocked
  strongest_supported_status: pilot-executed_synthetic_fixture_only
optimizer_self_check:
  required_keys_present: true
  common_removed_from_delta_recommendations: true
  common_trace_preserved: true
  conflict_preserved: true
  n5_rejected: true
  workflow_generator_route_recorded_if_needed: true
  workflow_check_required_before_readiness_or_route_claims: true
  output_machine_readable_yaml: true
