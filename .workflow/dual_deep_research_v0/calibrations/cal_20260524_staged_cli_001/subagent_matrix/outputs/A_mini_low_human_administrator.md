profile_metadata:
  candidate_id: A_mini_low_human_administrator
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: administrator
  mode: synthetic_calibration
  source_limitations:
    - public_safe_only
    - no_shell_commands
    - no_browse
    - no_real_notebooklm
    - no_real_wiki_mutation
    - no_source_truth_inference

goal_declaration:
  declared_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  lifecycle_scope:
    - declare bounded goal before material research
    - freeze research brief
    - compare independent advisory packets
    - prepare delta handoff only
  stop_conditions:
    - if real source truth is required
    - if NotebookLM account state is required
    - if owner approval is required
    - if wiki mutation is required
    - if registration judgment is required

frozen_research_brief:
  scope:
    - public-safe workflow contract summary only
    - synthetic NotebookLM advisory packet only
    - synthetic Codex advisory packet only
  exclusions:
    - real NotebookLM CLI execution
    - browser fallback
    - web browsing
    - Google Drive or wiki access
    - source mutation
    - canon promotion
    - registration claims
    - owner approval inference
  allowed_inputs:
    - workflow contract summary
    - synthetic NotebookLM advisory claims
    - synthetic Codex advisory claims
  downstream_limits:
    - handoff packet only, not registration
    - preserve common claims as trace metadata
    - preserve conflicts and gaps
    - keep downstream judgment with knowledge_wiki_cell / knowledge_wiki_pipeline_v0

subagent_stage_manifest:
  notebooklm_operator:
    status: simulated_complete
    authorization: synthetic_only
    output_role: advisory
  codex_researcher:
    status: simulated_complete
    authorization: synthetic_only
    output_role: advisory
  comparison_archivist:
    status: simulated_complete
    authorization: synthetic_only
    output_role: normalization_and_delta
  independence_rule:
    notebooklm_and_codex_separated_until: comparison_complete

notebooklm_cli_research_packet:
  nlm_login_check: pass_synthetic
  notebook_selection: reused_synthetic_notebook
  advisory_claims:
    - id: N1
      claim: "Goal must be declared before material research."
      status: supported
    - id: N2
      claim: "NotebookLM and Codex research lanes must remain separated until comparison."
      status: supported
    - id: N3
      claim: "Common claims should be removed from the delta view but retained as trace metadata."
      status: supported
    - id: N4
      claim: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
      status: supported
    - id: N5
      claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      status: rejected_overclaim
      reason: "Registration judgment is downstream and cannot be inferred from lane agreement."
    - id: N6
      claim: "If a new workflow is needed, route creation through workflow-generator."
      status: supported
  raw_payload_embedded: false

codex_direct_research_packet:
  research_mode: synthetic_direct_packet_only_no_browse
  advisory_claims:
    - id: C1
      claim: "A goal declaration is required before material research begins."
      status: supported
    - id: C2
      claim: "The two research paths must stay independent until both packets are complete."
      status: supported
    - id: C3
      claim: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
      status: supported
    - id: C4
      claim: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
      status: supported
    - id: C5
      claim: "Common claims are trace metadata and should not be repeated as delta recommendations."
      status: supported
    - id: C6
      claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      status: supported
    - id: C7
      claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
      status: supported

dual_research_comparison_packet:
  common_claims:
    - "Goal declaration is required before material research."
    - "NotebookLM and Codex paths stay independent until comparison / both packets complete."
    - "Common claims become trace metadata, not delta recommendations."
    - "Handoff target is knowledge_wiki_cell / knowledge_wiki_pipeline_v0."
    - "Workflow creation, if needed, routes through workflow-generator."
  notebooklm_only:
    - "None"
  codex_only:
    - "Agreement does not imply owner approval."
    - "workflow-check is required before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - "Google Drive placement and NotebookLM packet-map mutation are out of scope."
  conflicts:
    - claim_id: N5
      notebooklm_claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      codex_counterpoint: "Registration judgment belongs downstream; agreement is not authority."
      resolution: "Reject as overclaim."
  gaps:
    - "No real source truth was available."
    - "No actual NotebookLM CLI execution occurred."
    - "No owner approval or wiki mutation evidence exists."
    - "No workflow-generator or workflow-check execution evidence exists in this synthetic fixture."

research_delta_handoff:
  target: knowledge_wiki_cell / knowledge_wiki_pipeline_v0
  handoff_type: research_delta
  include:
    - common_claim_trace
    - rejected_overclaim_N5
    - conflict_record
    - gaps_record
    - downstream_limitations
  exclude:
    - registration claim
    - owner approval claim
    - canon promotion claim
    - default-route safety claim
  delta_recommendations:
    - "Require goal declaration before material research."
    - "Keep NotebookLM and Codex lanes independent until both packets complete."
    - "Strip common claims from delta recommendations while preserving trace metadata."
    - "Route any new workflow creation through workflow-generator, then workflow-check before any readiness or registration discussion."
    - "Treat N5 as rejected overclaim."
  blocker:
    status: present
    reason: "Real source truth, owner approval, and wiki mutation are unavailable in this synthetic fixture."

boundary_review_note:
  what_was_checked:
    - public-safe workflow contract summary
    - synthetic NotebookLM advisory packet
    - synthetic Codex advisory packet
    - common / only / conflict / gap normalization
  registration_default_route_result:
    registration: blocked
    default_route_safe: blocked
  strongest_supported_workflow_status_label: blocked
  remaining_blockers:
    - no real source truth
    - no NotebookLM account state
    - no owner approval
    - no wiki mutation
    - no workflow-generator evidence
    - no workflow-check evidence
  note: "N5 was explicitly rejected as an overclaim/conflict and not carried into delta recommendations."

optimizer_self_check:
  profile_fit: "low-effort administrative synthesis only"
  constraint_check:
    - no shell commands
    - no browse
    - no claims of real tool execution
    - no inference of authority
  output_quality_check:
    - compact: yes
    - machine_readable: yes
    - conflicts_preserved: yes
    - gaps_preserved: yes
    - downstream_registration_not_claimed: yes
