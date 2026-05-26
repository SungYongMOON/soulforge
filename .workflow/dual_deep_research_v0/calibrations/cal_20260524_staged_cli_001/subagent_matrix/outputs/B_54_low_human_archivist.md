profile_metadata:
  candidate_id: B_54_low_human_archivist
  model: gpt-5.4
  reasoning_effort: low
  species: human
  class: archivist
  run_mode: synthetic_public_safe_calibration
  workflow_id: dual_deep_research_v0
  skills_applied:
    - soulforge-workflow-generator
    - soulforge-workflow-check
  constraints:
    - no_shell_commands
    - no_browsing
    - no_real_notebooklm_or_cli_execution
    - no_real_web_drive_wiki_or_source_mutation_claims

goal_declaration:
  research_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  declared_before_material_research: true
  lifecycle_scope:
    - freeze brief before analysis
    - keep NotebookLM and Codex lanes independent until both packets are complete
    - compare and normalize claims
    - prepare advisory delta handoff only
    - stop on real-world authority or mutation requirements
  success_condition: "A synthetic, advisory-only packet identifies minimum preconditions, preserves conflicts/gaps, and prepares a downstream handoff without claiming registration, canon truth, owner approval, or wiki mutation."
  stop_condition: "If completion would require real source truth, NotebookLM account state, owner approval, Drive placement, packet-map mutation, wiki mutation, or registration judgment, record blockers instead of claiming completion."

frozen_research_brief:
  scope:
    - "Use only the workflow contract summary and the two supplied synthetic advisory packets."
    - "Assess preconditions for automatic research-delta handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0."
    - "Preserve common claims, conflicts, exclusions, and blockers."
  exclusions:
    - real web research
    - real NotebookLM execution
    - CLI execution claims
    - Google Drive state
    - wiki registration or mutation
    - canon promotion
    - owner approval inference
    - ontology acceptance inference
    - default-route safety inference beyond stated contract
  allowed_inputs:
    - workflow_contract_summary
    - synthetic_notebooklm_advisory_packet
    - synthetic_codex_direct_advisory_packet
  downstream_limits:
    - advisory_handoff_only
    - no_registration
    - no_default_route_switch
    - no_claim_of_truth
  output_ceiling: "draft advisory handoff packet with explicit blockers and boundary notes"

subagent_stage_manifest:
  independence_required: true
  stages:
    - stage_id: notebooklm_operator
      status: synthetic_preproduced_packet_only
      role: "Consumes only the frozen brief and the supplied synthetic NotebookLM advisory packet."
      execution_claim: "No real CLI, browser, account, or notebook mutation claimed."
    - stage_id: codex_researcher
      status: synthetic_preproduced_packet_only
      role: "Consumes only the frozen brief and the supplied synthetic Codex advisory packet."
      execution_claim: "No browsing or real external research claimed."
    - stage_id: comparison_archivist
      status: completed_synthetically
      role: "Normalizes claims into common, notebooklm_only, codex_only, conflict, and gap; removes common claims from delta recommendations while preserving trace."

notebooklm_cli_research_packet:
  provenance: synthetic_advisory_packet_supplied_by_user
  cli_first_contract_respected: true
  actual_cli_run_claimed: false
  notebook_state:
    nlm_login_check: pass_synthetic
    notebook_selection: reused_synthetic_notebook
  advisory_claims:
    - id: N1
      claim: "Goal must be declared before material research."
    - id: N2
      claim: "NotebookLM and Codex research lanes must remain separated until comparison."
    - id: N3
      claim: "Common claims should be removed from the delta view but retained as trace metadata."
    - id: N4
      claim: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
    - id: N5
      claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      disposition: rejected_overclaim
    - id: N6
      claim: "If a new workflow is needed, route creation through workflow-generator."
  raw_payload_embedded: false
  advisory_only: true

codex_direct_research_packet:
  provenance: synthetic_advisory_packet_supplied_by_user
  research_mode: synthetic_direct_packet_only_no_browse
  advisory_claims:
    - id: C1
      claim: "A goal declaration is required before material research begins."
    - id: C2
      claim: "The two research paths must stay independent until both packets are complete."
    - id: C3
      claim: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
    - id: C4
      claim: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
    - id: C5
      claim: "Common claims are trace metadata and should not be repeated as delta recommendations."
    - id: C6
      claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - id: C7
      claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
  advisory_only: true

dual_research_comparison_packet:
  normalization:
    common:
      - normalized_id: CM1
        claim: "A bounded goal declaration is required before material research."
        trace: [N1, C1]
      - normalized_id: CM2
        claim: "NotebookLM and Codex lanes must remain independent until both research packets are complete and comparison begins."
        trace: [N2, C2]
      - normalized_id: CM3
        claim: "Common claims belong in trace metadata and should be removed from delta recommendations."
        trace: [N3, C5]
      - normalized_id: CM4
        claim: "The downstream handoff target is knowledge_wiki_cell via knowledge_wiki_pipeline_v0, subject to boundary review."
        trace: [N4, C4]
    notebooklm_only:
      - normalized_id: NLM_ONLY_1
        claim: "If a new workflow is needed, route creation through workflow-generator."
        trace: [N6]
        disposition: accepted_with_downstream_check_requirement
    codex_only:
      - normalized_id: CODEX_ONLY_1
        claim: "Cross-lane agreement does not imply source truth or owner approval."
        trace: [C3]
      - normalized_id: CODEX_ONLY_2
        claim: "Workflow-check is required before readiness, registration, promotion, default-route switch, or default-route-safety claims for created/evolved workflows."
        trace: [C6]
      - normalized_id: CODEX_ONLY_3
        claim: "Google Drive placement and NotebookLM packet-map mutation are out of scope for this workflow."
        trace: [C7]
    conflict:
      - normalized_id: CF1
        notebooklm_claim: "The research workflow itself may register the result in the wiki if both lanes agree."
        codex_claim: "Registration judgment belongs downstream; agreement is not truth or approval."
        trace: [N5, C3, C4]
        resolution: reject_N5_as_overclaim
        rationale: "The contract forbids inferring source truth, owner approval, wiki registration judgment, or mutation from lane agreement."
    gap:
      - normalized_id: GAP1
        claim: "No synthetic evidence establishes owner approval for registration or route switching."
      - normalized_id: GAP2
        claim: "No synthetic evidence establishes real source truth beyond advisory packet agreement."
      - normalized_id: GAP3
        claim: "No synthetic evidence establishes wiki mutation authority or successful downstream ingestion."
      - normalized_id: GAP4
        claim: "No created/evolved workflow artifact was reviewed here for readiness or default-route-safe status."
  handoff_preconditions_inferred:
    - goal_declared_before_research
    - frozen_brief_with_allowed_inputs_and_exclusions
    - notebooklm_and_codex_packets_completed_independently
    - comparison_completed_with_common_removed_from_delta_recommendations
    - boundary_review_passed_for_advisory_handoff_scope
    - downstream_target_named_as_knowledge_wiki_cell_via_knowledge_wiki_pipeline_v0
    - no_claim_of_registration_truth_or_owner_approval

research_delta_handoff:
  target: knowledge_wiki_cell
  route: knowledge_wiki_pipeline_v0
  handoff_state: draft
  registration_result: not_performed
  default_route_safe: blocked
  common_trace:
    - CM1
    - CM2
    - CM3
    - CM4
  delta_recommendations:
    - id: D1
      recommendation: "Require explicit boundary review before any research delta handoff."
      basis: [CM4, CODEX_ONLY_1]
    - id: D2
      recommendation: "Treat both NotebookLM and Codex outputs as advisory only; do not treat agreement as source truth or owner approval."
      basis: [CODEX_ONLY_1]
    - id: D3
      recommendation: "Permit handoff packet preparation, but reserve registration judgment and any wiki mutation to downstream authority."
      basis: [C4]
    - id: D4
      recommendation: "If workflow creation or evolution is needed, route through soulforge-workflow-generator and require soulforge-workflow-check before any readiness, promotion, registration, or default-route claim."
      basis: [NLM_ONLY_1, CODEX_ONLY_2]
    - id: D5
      recommendation: "Exclude Google Drive placement and NotebookLM packet-map mutation from handoff completion criteria."
      basis: [CODEX_ONLY_3]
  preserved_conflicts:
    - CF1
  preserved_gaps:
    - GAP1
    - GAP2
    - GAP3
    - GAP4
  blockers:
    - "Owner approval not established."
    - "Source truth not established."
    - "Registration authority not established."
    - "Wiki mutation or downstream ingestion not executed."
  completion_claim: "Synthetic advisory handoff packet prepared; downstream registration or mutation not claimed."

boundary_review_note:
  what_was_checked:
    - synthetic brief freezing
    - advisory packet independence
    - claim normalization and conflict handling
    - handoff-vs-registration boundary
  validators_ran: []
  override_needed: false
  registration_default_route_result:
    registration: no
    default_route_switch: no
    default_route_safe: blocked
  strongest_supported_workflow_status_label: draft
  remaining_blockers:
    - "Real registration surface was not and must not be updated in this synthetic run."
    - "No owner intent or authority for default-route switching."
    - "No real downstream execution evidence."

optimizer_self_check:
  profile_fit: true
  compact_yaml_only: true
  shell_commands_run: false
  browsing_used: false
  real_external_execution_claimed: false
  notebooklm_codex_independence_preserved: true
  common_removed_from_delta_recommendations: true
  conflict_N5_rejected: true
  downstream_registration_claimed: false
  boundary_overclaim_detected: false
  final_assessment: pass_synthetic_fixture
