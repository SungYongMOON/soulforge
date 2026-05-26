```yaml
profile_metadata:
  candidate_id: B_55_low_human_archivist
  model: gpt-5.5
  reasoning_effort: low
  species: human
  class: archivist
  run_type: public_safe_synthetic_calibration
  external_actions_performed: none
  real_notebooklm_cli_used: false
  web_browsing_used: false
  source_mutation_performed: false

goal_declaration:
  research_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  declared_before_material_research: true
  downstream_target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  success_condition: "Produce a bounded synthetic research_delta_handoff with common claims removed from delta recommendations, conflicts preserved, and blockers recorded."
  stop_condition: "Stop before claiming source truth, NotebookLM account state, owner approval, wiki mutation, registration, canon promotion, or default-route safety."

frozen_research_brief:
  scope:
    - "Use only the provided workflow contract summary."
    - "Use only the provided synthetic NotebookLM and Codex advisory packets."
    - "Normalize claims into common, notebooklm_only, codex_only, conflict, and gap."
    - "Prepare handoff only; do not register or mutate wiki state."
  exclusions:
    - "No shell commands."
    - "No browsing."
    - "No real NotebookLM, CLI, Google Drive, wiki, or source mutation claims."
    - "No inference of source truth, owner approval, ontology acceptance, registration judgment, or default-route safety."
  allowed_inputs:
    - "workflow_contract_summary"
    - "synthetic_notebooklm_advisory_packet"
    - "synthetic_codex_direct_advisory_packet"
  downstream_limits:
    handoff_allowed: true
    registration_allowed: false
    wiki_mutation_allowed: false
    owner_approval_inferred: false
    source_truth_inferred: false

subagent_stage_manifest:
  fresh_stage_policy: synthetic_declared_only
  stages:
    - stage_id: notebooklm_operator
      path: notebooklm
      independence: "Kept separate from Codex path until packet completion."
      execution_status: "synthetic_packet_already_supplied"
      real_cli_used: false
    - stage_id: codex_researcher
      path: codex_direct
      independence: "Used only supplied synthetic packet; no browsing."
      execution_status: "synthetic_packet_already_supplied"
    - stage_id: comparison_archivist
      path: comparison
      independence: "Runs after both advisory packets are complete."
      execution_status: "performed_synthetically_in_output"

notebooklm_cli_research_packet:
  status: advisory_synthetic
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  raw_payload_embedded: false
  claims:
    N1: "Goal must be declared before material research."
    N2: "NotebookLM and Codex research lanes must remain separated until comparison."
    N3: "Common claims should be removed from the delta view but retained as trace metadata."
    N4: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
    N5: "The research workflow itself may register the result in the wiki if both lanes agree."
    N6: "If a new workflow is needed, route creation through workflow-generator."

codex_direct_research_packet:
  status: advisory_synthetic
  research_mode: synthetic_direct_packet_only_no_browse
  claims:
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
    - claim: "NotebookLM and Codex paths must remain independent until both packets are complete and comparison begins."
      trace: [N2, C2]
    - claim: "Common claims are retained as trace metadata and removed from delta recommendations."
      trace: [N3, C5]
    - claim: "A research delta handoff may be prepared for knowledge_wiki_cell / knowledge_wiki_pipeline_v0."
      trace: [N4, C4]
  notebooklm_only:
    - claim: "If a new workflow is needed, route creation through workflow-generator."
      trace: [N6]
      status: "accepted_with_contract_limit"
  codex_only:
    - claim: "Agreement between lanes is not source truth and does not imply owner approval."
      trace: [C3]
      status: "accepted_boundary_limit"
    - claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      trace: [C6]
      status: "accepted_boundary_limit"
    - claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
      trace: [C7]
      status: "accepted_boundary_limit"
  conflict:
    - claim: "Research workflow itself may register the result in the wiki if both lanes agree."
      trace: [N5]
      conflicts_with: [C3, C4, "contract_summary_8", "contract_summary_10"]
      disposition: rejected_overclaim
      reason: "Lane agreement is advisory only and cannot create source truth, owner approval, registration judgment, or wiki mutation authority."
  gap:
    - "No real source truth was established."
    - "No owner approval was established."
    - "No real NotebookLM account, Drive, packet-map, or wiki state was checked."
    - "No registration/default-route safety decision was made."

research_delta_handoff:
  target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  handoff_status: prepared_synthetic_blocked_before_mutation
  delta_recommendations:
    - id: D1
      recommendation: "Treat Codex/NotebookLM agreement as advisory trace only, not source truth or owner approval."
      source_trace: [C3]
    - id: D2
      recommendation: "Keep registration judgment, ontology acceptance, canon promotion, and wiki mutation downstream of this workflow."
      source_trace: [C4]
    - id: D3
      recommendation: "If workflow creation or evolution is needed, route through soulforge-workflow-generator and require soulforge-workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      source_trace: [N6, C6]
    - id: D4
      recommendation: "Do not claim Google Drive placement or NotebookLM packet-map mutation inside this workflow."
      source_trace: [C7]
  common_trace_preserved:
    - [N1, C1]
    - [N2, C2]
    - [N3, C5]
    - [N4, C4]
  excluded_from_delta_as_common:
    - "Goal declaration before material research."
    - "Independent lanes until comparison."
    - "Common claims retained as trace metadata and removed from recommendations."
    - "Handoff may be prepared for knowledge_wiki_cell / knowledge_wiki_pipeline_v0."
  blockers:
    - "Real source truth would require approved source research."
    - "Owner approval would require explicit owner decision."
    - "Wiki registration or mutation would require downstream authority."
    - "NotebookLM account, Drive placement, and packet-map mutation would require real external state checks."

boundary_review_note:
  workflow_generator_needed: false
  workflow_check_needed_for_this_packet: false
  workflow_check_rule_preserved: "Required only before readiness, registration, promotion, default-route switch, or default-route-safety claims if workflow creation/evolution occurs."
  registration_claim: none
  default_route_safe: blocked
  strongest_supported_status: "synthetic_handoff_prepared_not_registered"
  n5_disposition: "rejected_as_overclaim"

optimizer_self_check:
  complied_with_no_shell: true
  complied_with_no_browse: true
  real_external_action_claimed: false
  bounded_goal_declared_first: true
  frozen_brief_present: true
  independent_lane_policy_preserved: true
  common_claims_removed_from_delta: true
  common_trace_preserved: true
  conflicts_preserved: true
  gaps_preserved: true
  n5_rejected: true
  machine_readable_yaml: true
```
