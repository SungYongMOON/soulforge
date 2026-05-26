profile_metadata:
  candidate_id: A_mini_low_dwarf_archivist
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
  class: archivist
  mode: synthetic_public_safe_calibration
  constraints:
    - no_shell
    - no_browse
    - no_real_notebooklm
    - no_real_wiki_mutation
    - no_source_truth_inference

goal_declaration:
  bounded_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  lifecycle_scope:
    includes:
      - pre-handoff boundary conditions
      - lane separation until comparison
      - common-vs-delta normalization
      - downstream handoff target identification
    excludes:
      - registration judgment
      - owner approval inference
      - Drive placement
      - NotebookLM packet-map mutation
      - canon promotion
      - default-route safety claims
      - real source validation
  stop_condition: "If completion would require real source truth, NotebookLM account state, owner approval, or wiki mutation, record a blocker instead."

frozen_research_brief:
  scope:
    allowed_inputs:
      - public-safe workflow contract summary
      - synthetic NotebookLM advisory packet
      - synthetic Codex advisory packet
    allowed_outputs:
      - normalized claim sets
      - conflicts
      - gaps
      - blocker notes
      - downstream handoff packet
  exclusions:
    - shell execution
    - web browsing
    - external tool truth claims
    - real NotebookLM or wiki mutation
  downstream_limits:
    target: knowledge_wiki_cell
    pipeline: knowledge_wiki_pipeline_v0
    authority: advisory_only
    registration: not_performed
  claim_policy:
    common_claims: "remove from delta recommendations, keep as trace metadata"
    conflicts: "preserve explicitly"
    gaps: "preserve explicitly"
    overclaims: "reject"

subagent_stage_manifest:
  stages:
    - stage: notebooklm_operator
      status: complete_synthetic
      role: "CLI-first NotebookLM lane, advisory only"
      input_basis: "frozen brief + synthetic NotebookLM packet"
    - stage: codex_researcher
      status: complete_synthetic
      role: "independent Codex lane, advisory only"
      input_basis: "frozen brief + synthetic Codex packet"
    - stage: comparison_archivist
      status: complete_synthetic
      role: "normalize common, notebooklm_only, codex_only, conflict, gap"
  independence_rule: "NotebookLM and Codex lanes remain separated until both packets are complete."
  fresh_execution_note: "No real fresh execution occurred; this is packet-only synthetic staging."

notebooklm_cli_research_packet:
  source_type: synthetic_advisory_packet
  status: advisory_only
  claims:
    - id: N1
      claim: "Goal must be declared before material research."
      classification: common
    - id: N2
      claim: "NotebookLM and Codex research lanes must remain separated until comparison."
      classification: common
    - id: N3
      claim: "Common claims should be removed from the delta view but retained as trace metadata."
      classification: common
    - id: N4
      claim: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
      classification: notebooklm_only
    - id: N5
      claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      classification: conflict_overclaim
      reason: "Rejected: overclaims registration authority; conflicts with downstream-only registration boundary."
    - id: N6
      claim: "If a new workflow is needed, route creation through workflow-generator."
      classification: notebooklm_only
  raw_payload_embedded: false

codex_direct_research_packet:
  source_type: synthetic_advisory_packet
  status: advisory_only
  claims:
    - id: C1
      claim: "A goal declaration is required before material research begins."
      classification: common
    - id: C2
      claim: "The two research paths must stay independent until both packets are complete."
      classification: common
    - id: C3
      claim: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
      classification: common
    - id: C4
      claim: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
      classification: common
    - id: C5
      claim: "Common claims are trace metadata and should not be repeated as delta recommendations."
      classification: common
    - id: C6
      claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      classification: codex_only
    - id: C7
      claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
      classification: codex_only

dual_research_comparison_packet:
  common_claims:
    - "Goal declaration is required before material research."
    - "NotebookLM and Codex lanes stay independent until both packets are complete."
    - "Agreement between lanes is not source truth and does not imply owner approval."
    - "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment is downstream."
    - "Common claims are trace metadata and should not repeat as delta recommendations."
  notebooklm_only:
    - "Route creation through workflow-generator if a new workflow is needed."
    - "Target handoff after boundary pass is knowledge_wiki_cell / knowledge_wiki_pipeline_v0."
  codex_only:
    - "workflow-check is required before readiness, registration, promotion, default-route switch, or default-route-safety claims for created/evolved workflows."
    - "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
  conflict:
    - claim_id: N5
      issue: "NotebookLM asserts registration may occur if both lanes agree."
      resolution: "Reject as overclaim; registration cannot be claimed here and belongs downstream."
  gaps:
    - "No real source truth available."
    - "No NotebookLM account state."
    - "No owner approval."
    - "No wiki mutation evidence."
    - "No registration decision."
  boundary_summary: "The minimum true preconditions are declared goal, frozen brief, separated research lanes, normalized claim comparison, downstream-only handoff targeting, and explicit refusal to infer registration or approval."

research_delta_handoff:
  target:
    cell: knowledge_wiki_cell
    pipeline: knowledge_wiki_pipeline_v0
  status: prepared_only
  payload:
    include:
      - goal_declaration
      - frozen_research_brief
      - comparison_packet
      - conflict_rejection_notes
      - gap_list
    exclude:
      - registration claims
      - owner approval claims
      - canon promotion claims
      - default-route safety claims
      - wiki mutation claims
  delta_recommendations:
    - "Hand off only after boundary pass and only as advisory research delta."
    - "Do not repeat common claims as recommendations."
    - "Preserve N5 only as a rejected conflict record."
  blocker: "Completion is blocked from claiming downstream registration or wiki mutation because real source truth and downstream authority are unavailable."

boundary_review_note:
  verdict: blocked
  reasons:
    - "Real source truth not available."
    - "No owner approval evidence."
    - "No real NotebookLM or wiki mutation occurred."
    - "Registration judgment belongs downstream and cannot be claimed here."
    - "N5 is an overclaim and must be rejected."
  safe_claim_ceiling: "prepared_advisory_handoff_only"
  explicit_nonclaims:
    - "not registered"
    - "not owner-approved"
    - "not canon-promoted"
    - "not default-route-safe"
    - "not wiki-mutated"

optimizer_self_check:
  profile_fit:
    candidate_id: A_mini_low_dwarf_archivist
    model: gpt-5.4-mini
    reasoning_effort: low
    fit_assessment: "adequate for packet normalization and boundary marking"
  constraint_adherence:
    no_shell: true
    no_browse: true
    no_real_tool_claims: true
    no_source_truth_inference: true
  quality_checks:
    - "Common claims removed from delta recommendations and retained as trace metadata."
    - "Conflict N5 preserved and rejected as overclaim."
    - "Gaps explicitly listed."
    - "Downstream target preserved without claiming registration."
    - "Output remains compact, structured, and machine-readable."
