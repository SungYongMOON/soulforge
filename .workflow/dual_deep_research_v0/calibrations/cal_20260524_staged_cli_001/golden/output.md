```yaml
profile_metadata:
  workflow_id: dual_deep_research_v0
  model: gpt-5.5
  reasoning_effort: xhigh
  species: human
  class: auditor
  mode: public_safe_synthetic_calibration
  shell_commands_run: false
  browsing_performed: false
  real_external_side_effects_claimed: false

goal_declaration:
  declared_before_material_research: true
  goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."

frozen_research_brief:
  scope:
    - "Use only the provided workflow contract summary and synthetic advisory packets."
    - "Assess preconditions for preparing a research_delta_handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0."
  exclusions:
    - "No real NotebookLM, CLI, web, Google Drive, wiki, source, or repo mutation."
    - "No source-truth inference, owner approval inference, registration judgment, canon promotion, or default-route safety claim."
  allowed_inputs:
    - "public_safe_workflow_contract_summary"
    - "synthetic_notebooklm_advisory_packet"
    - "synthetic_codex_direct_advisory_packet"
  downstream_limits:
    target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
    registration_performed_by_this_workflow: false
    handoff_is_advisory: true
  stop_condition:
    - "Record blocker instead of completion if real source truth, NotebookLM account state, owner approval, or wiki mutation is required."

subagent_stage_manifest:
  stages:
    - id: notebooklm_operator
      status: synthetic_packet_already_produced
      real_cli_used: false
      independence_rule: "kept separate from Codex packet until comparison"
    - id: codex_researcher
      status: synthetic_direct_packet_only
      real_browse_used: false
      independence_rule: "kept separate from NotebookLM packet until comparison"
    - id: comparison_archivist
      status: executed_synthetically
      task: "normalize claims into common, notebooklm_only, codex_only, conflict, and gap"
  workflow_generator_routing:
    needed: false
    note: "No workflow creation or evolution performed."
  workflow_check_routing:
    needed_for_completion_claims: false
    note: "No readiness, registration, promotion, or default-route safety claim made."

notebooklm_cli_research_packet:
  packet_type: synthetic_advisory
  real_notebooklm_used: false
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  raw_payload_embedded: false
  advisory_claims:
    N1: "Goal must be declared before material research."
    N2: "NotebookLM and Codex research lanes must remain separated until comparison."
    N3: "Common claims should be removed from the delta view but retained as trace metadata."
    N4: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
    N5: "The research workflow itself may register the result in the wiki if both lanes agree."
    N6: "If a new workflow is needed, route creation through workflow-generator."
  rejected_claims:
    N5:
      reason: "Overclaim. Agreement between advisory lanes is not source truth, owner approval, registration authority, or wiki mutation authority."

codex_direct_research_packet:
  packet_type: synthetic_advisory
  research_mode: synthetic_direct_packet_only_no_browse
  advisory_claims:
    C1: "A goal declaration is required before material research begins."
    C2: "The two research paths must stay independent until both packets are complete."
    C3: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
    C4: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
    C5: "Common claims are trace metadata and should not be repeated as delta recommendations."
    C6: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    C7: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."

dual_research_comparison_packet:
  common:
    - claim: "Goal declaration is required before material research."
      trace: [N1, C1]
    - claim: "NotebookLM and Codex lanes must remain independent until both packets are complete and comparison begins."
      trace: [N2, C2]
    - claim: "Common claims are preserved as trace metadata and removed from delta recommendations."
      trace: [N3, C5]
    - claim: "A handoff may target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary review."
      trace: [N4, C4]
  notebooklm_only:
    - claim: "If a new workflow is needed, route creation through workflow-generator."
      trace: [N6]
  codex_only:
    - claim: "Advisory agreement is not source truth and does not imply owner approval."
      trace: [C3]
    - claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      trace: [C6]
    - claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
      trace: [C7]
  conflict:
    - rejected_claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      trace: [N5]
      counter_trace: [C3, C4]
      resolution: "reject_as_overclaim"
  gap:
    - "No real source-truth verification."
    - "No owner approval."
    - "No real NotebookLM account or packet-map state."
    - "No wiki mutation or registration evidence."
    - "No default-route safety evidence."

research_delta_handoff:
  target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  status: prepared_synthetic_advisory_packet
  common_trace_preserved: true
  delta_recommendations:
    - id: D1
      basis: [C3]
      recommendation: "Do not treat NotebookLM/Codex agreement as source truth or owner approval."
    - id: D2
      basis: [C4]
      recommendation: "Prepare only an advisory delta handoff; downstream owns registration judgment."
    - id: D3
      basis: [C6, N6]
      recommendation: "Route any workflow creation or evolution through workflow-generator and require workflow-check before readiness, promotion, registration, default-route switch, or default-route-safety claims."
    - id: D4
      basis: [C7]
      recommendation: "Keep Google Drive placement and NotebookLM packet-map mutation outside this workflow."
  excluded_from_delta_as_common:
    - [N1, C1]
    - [N2, C2]
    - [N3, C5]
    - [N4, C4]
  blockers:
    - "Cannot claim completion, registration, canon acceptance, owner approval, wiki mutation, or default-route safety from this synthetic packet."

boundary_review_note:
  public_private_boundary: pass_synthetic
  source_truth_claimed: false
  owner_approval_claimed: false
  drive_placement_claimed: false
  notebooklm_packet_map_mutation_claimed: false
  wiki_registration_claimed: false
  canon_promotion_claimed: false
  default_route_safe: blocked
  strongest_supported_status_label: draft

optimizer_self_check:
  contract_followed: true
  yaml_top_level_keys_complete: true
  common_claims_removed_from_delta_recommendations: true
  common_trace_preserved: true
  n5_rejected_as_overclaim: true
  shell_commands_run: false
  browsing_performed: false
  real_external_actions_claimed: false
```
