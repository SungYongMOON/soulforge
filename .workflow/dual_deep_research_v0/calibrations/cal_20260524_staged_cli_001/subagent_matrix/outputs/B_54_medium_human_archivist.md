profile_metadata:
  candidate_id: B_54_medium_human_archivist
  model: gpt-5.4
  reasoning_effort: medium
  species: human
  class: archivist
  run_mode: synthetic_public_safe_calibration
  workflow_id: dual_deep_research_v0
  skills_applied:
    - soulforge-workflow-generator
    - soulforge-workflow-check

goal_declaration:
  research_goal: >
    Determine what must be true before a Soulforge workflow may automatically hand a
    research delta to the Knowledge Wiki Cell.
  lifecycle_scope:
    - declare goal before material research
    - freeze brief before lane work
    - keep NotebookLM and Codex lanes independent until both packets complete
    - compare and normalize claims
    - prepare downstream handoff without claiming registration or wiki mutation
  success_condition: >
    Produce a synthetic advisory packet identifying preconditions, conflicts, gaps,
    and blockers for delta handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0.
  stop_condition: >
    If completion would require real source truth, NotebookLM account state, owner approval,
    Drive placement, packet-map mutation, wiki mutation, or registration judgment, record blocker.

frozen_research_brief:
  scope:
    question: >
      What must be true before automatic research-delta handoff may be prepared for
      knowledge_wiki_cell via knowledge_wiki_pipeline_v0?
    allowed_inputs:
      - workflow contract summary in prompt
      - synthetic NotebookLM advisory packet
      - synthetic Codex advisory packet
  exclusions:
    - real web research
    - real NotebookLM/CLI execution
    - real Google Drive state
    - wiki or source mutation
    - owner approval inference
    - canon promotion inference
    - registration judgment inference
    - default-route safety inference beyond conservative check output
  downstream_limits:
    target: knowledge_wiki_cell via knowledge_wiki_pipeline_v0
    allowed_output: advisory research_delta_handoff only
    forbidden_claims:
      - source truth established
      - registration completed
      - wiki updated
      - Drive placement confirmed
      - NotebookLM packet-map mutated
      - ontology accepted
      - default-route safe yes
  frozen: true

subagent_stage_manifest:
  stages:
    - stage_id: notebooklm_operator
      path_type: notebooklm_cli_first
      execution_state: synthetic_preproduced_packet_only
      independence_rule: must remain isolated from codex_researcher until comparison packet exists
    - stage_id: codex_researcher
      path_type: direct_research
      execution_state: synthetic_packet_only_no_browse
      independence_rule: must remain isolated from notebooklm_operator until comparison packet exists
    - stage_id: comparison_archivist
      path_type: synthesis_only
      execution_state: current_stage
      independence_rule: may read both completed advisory packets only after brief freeze
  fresh_execution_authorization: not required_for_synthetic_fixture
  real_subagent_claims_made: false

notebooklm_cli_research_packet:
  provenance: synthetic_advisory_packet_supplied_by_user
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  advisory_claims:
    - id: N1
      claim: Goal must be declared before material research.
    - id: N2
      claim: NotebookLM and Codex research lanes must remain separated until comparison.
    - id: N3
      claim: Common claims should be removed from the delta view but retained as trace metadata.
    - id: N4
      claim: Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass.
    - id: N5
      claim: The research workflow itself may register the result in the wiki if both lanes agree.
      status: rejected_overclaim
    - id: N6
      claim: If a new workflow is needed, route creation through workflow-generator.
  advisory_only: true
  truth_status: not_truth

codex_direct_research_packet:
  provenance: synthetic_advisory_packet_supplied_by_user
  research_mode: synthetic_direct_packet_only_no_browse
  advisory_claims:
    - id: C1
      claim: A goal declaration is required before material research begins.
    - id: C2
      claim: The two research paths must stay independent until both packets are complete.
    - id: C3
      claim: Agreement between NotebookLM and Codex is not source truth and must not imply owner approval.
    - id: C4
      claim: Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream.
    - id: C5
      claim: Common claims are trace metadata and should not be repeated as delta recommendations.
    - id: C6
      claim: Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims.
    - id: C7
      claim: Google Drive placement and NotebookLM packet-map mutation are outside this workflow.
  advisory_only: true
  truth_status: not_truth

dual_research_comparison_packet:
  normalization:
    common:
      - normalized_id: COM1
        sources: [N1, C1]
        claim: Goal declaration is required before material research.
      - normalized_id: COM2
        sources: [N2, C2]
        claim: NotebookLM and Codex lanes stay independent until both packets are complete and comparison begins.
      - normalized_id: COM3
        sources: [N3, C5]
        claim: Common claims are retained as trace metadata and removed from delta recommendations.
      - normalized_id: COM4
        sources: [N4, C4]
        claim: Handoff may target knowledge_wiki_cell via knowledge_wiki_pipeline_v0, but handoff is not registration.
    notebooklm_only:
      - normalized_id: NLM_ONLY_1
        source: N6
        claim: If a new workflow is needed, route creation through workflow-generator.
        disposition: accepted_with_limit
        note: Creation/evolution routing is valid, but completion/readiness claims still require workflow-check.
    codex_only:
      - normalized_id: CODEX_ONLY_1
        source: C3
        claim: Cross-lane agreement is not source truth and does not imply owner approval.
      - normalized_id: CODEX_ONLY_2
        source: C6
        claim: Workflow creation/evolution requires workflow-check before any readiness, registration, promotion, or default-route-safety claim.
      - normalized_id: CODEX_ONLY_3
        source: C7
        claim: Drive placement and NotebookLM packet-map mutation are out of scope.
    conflict:
      - conflict_id: X1
        notebooklm_source: N5
        codex_source: C4
        notebooklm_claim: Research workflow may register result in wiki if both lanes agree.
        codex_claim: Registration judgment belongs downstream.
        resolution: reject_N5
        reason: >
          Violates workflow contract limits; lane agreement is advisory only and does not grant
          registration authority, wiki mutation authority, or truth status.
    gap:
      - gap_id: G1
        claim: No real source-truth verification exists in this synthetic fixture.
      - gap_id: G2
        claim: No owner approval or registration authorization is present.
      - gap_id: G3
        claim: No evidence of downstream acceptance by knowledge_wiki_cell or ontology/canon surfaces.
      - gap_id: G4
        claim: No basis to assert default-route-safe yes.
  common_trace_preserved: true
  delta_recommendations_common_removed: true

research_delta_handoff:
  target: knowledge_wiki_cell
  route: knowledge_wiki_pipeline_v0
  handoff_type: advisory_delta_only
  ready_to_hand_off: true
  preconditions_that_must_be_true:
    - goal_declaration_exists_before_material_research
    - frozen_brief_exists_with_scope_exclusions_allowed_inputs_and_downstream_limits
    - notebooklm_and_codex_packets_were_kept_independent_until_comparison
    - comparison_packet_completed_with_common_notebooklm_only_codex_only_conflict_and_gap
    - common_claims_removed_from_delta_recommendations_but_trace_preserved
    - boundary_review_passed_at_advisory_level_only
    - handoff_is_labeled_non_registration_non_truth_non_mutation
  delta_recommendations:
    - Cross-lane agreement must not be treated as source truth, owner approval, or registration authority.
    - Registration judgment belongs downstream and is not performed by dual_deep_research_v0.
    - Any workflow creation or evolution discovered during research must be routed through soulforge-workflow-generator and checked by soulforge-workflow-check before stronger status claims.
    - Drive placement and NotebookLM packet-map mutation remain outside workflow scope.
  blockers:
    - blocker_id: B1
      condition: If downstream action requires real source truth.
      action: stop_and_record_blocker
    - blocker_id: B2
      condition: If downstream action requires owner approval or registration decision.
      action: stop_and_record_blocker
    - blocker_id: B3
      condition: If downstream action requires wiki mutation, Drive placement, or NotebookLM account state.
      action: stop_and_record_blocker
  non_claims:
    - no_registration_performed
    - no_wiki_mutation_performed
    - no_source_truth_inferred
    - no_owner_approval_inferred
    - no_default_route_switch_claimed

boundary_review_note:
  what_was_checked:
    - bounded goal declaration presence
    - brief freeze and input restrictions
    - lane independence
    - comparison normalization shape
    - registration/default-route claim ceiling
  validators_ran:
    - none_real
  overrides_needed:
    - none
  registration_default_route_result:
    registration: no
    default_route_safe: blocked
  strongest_supported_workflow_status_label: draft
  remaining_blockers:
    - real validation not executed
    - downstream authority not granted
    - registration surface not updated
    - default-route intent/evidence absent

optimizer_self_check:
  profile_fit: aligned_with_archivist_medium
  contract_compliance:
    declared_goal_before_research: true
    brief_frozen: true
    independent_lanes_preserved: true
    no_browse: true
    no_shell: true
    common_removed_from_delta: true
    conflict_preserved: true
    N5_rejected: true
    no_truth_or_registration_overclaim: true
  residual_risk:
    - synthetic fixture cannot prove operational readiness or canon authority
  final_disposition: synthetic_packet_complete_with_conservative_claim_ceiling
