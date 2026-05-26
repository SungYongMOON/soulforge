profile_metadata:
  candidate_id: A_mini_low_human_archivist
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: archivist
  mode: synthetic_public_safe_calibration

goal_declaration:
  bounded_goal: "Determine the minimum conditions that must be satisfied before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  declared_before_material_research: true
  lifecycle_scope:
    - declare goal
    - freeze brief
    - keep NotebookLM and Codex lanes separate
    - compare claims
    - prepare delta handoff packet
    - stop short of registration or wiki mutation
  stop_condition: "If real source truth, owner approval, NotebookLM account state, or wiki mutation would be required, record a blocker instead of claiming completion."

frozen_research_brief:
  scope:
    include:
      - workflow contract summary
      - synthetic NotebookLM advisory packet
      - synthetic Codex advisory packet
      - claim normalization into common, notebooklm_only, codex_only, conflict, gap
      - downstream handoff framing for knowledge_wiki_cell via knowledge_wiki_pipeline_v0
    exclude:
      - real NotebookLM execution
      - real CLI use
      - web browsing
      - source truth inference
      - registration claims
      - wiki mutation claims
      - Drive placement claims
      - NotebookLM packet-map mutation claims
  allowed_inputs:
    - public-safe workflow contract summary
    - synthetic NotebookLM advisory packet
    - synthetic Codex advisory packet
  downstream_limits:
    - advisory only
    - no registration judgment
    - no default-route safety claim
    - no owner approval claim
    - no canon promotion claim

subagent_stage_manifest:
  prepared_stages:
    - stage: notebooklm_operator
      status: completed_synthetic
      constraint: "CLI-first in contract, but synthetic packet only; no real NotebookLM action occurred."
    - stage: codex_researcher
      status: completed_synthetic
      constraint: "Independently produced advisory claims from frozen brief only."
    - stage: comparison_archivist
      status: completed_synthetic
      constraint: "Normalized claims and preserved trace/conflicts/gaps."
  dependency_rule: "NotebookLM and Codex lanes remain independent until both packets are complete."

notebooklm_cli_research_packet:
  status: advisory_only
  source_state: synthetic_packet
  claims:
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
      status: rejected_overclaim
    - id: N6
      claim: "If a new workflow is needed, route creation through workflow-generator."
  notes:
    - "No raw payload embedded."
    - "No real NotebookLM authority inferred."

codex_direct_research_packet:
  status: advisory_only
  source_state: synthetic_packet
  claims:
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

dual_research_comparison_packet:
  common_claims:
    - "Goal declaration is required before material research."
    - "NotebookLM and Codex lanes must remain independent until comparison / both packets are complete."
    - "Common claims should be treated as trace metadata and omitted from delta recommendations."
    - "Handoff can target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
  notebooklm_only:
    - "If a new workflow is needed, route creation through workflow-generator."
  codex_only:
    - "Agreement does not imply source truth or owner approval."
    - "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - "Drive placement and NotebookLM packet-map mutation are out of scope."
  conflict:
    - id: N5_vs_C3_C4
      issue: "N5 overreaches into registration authority."
      resolution: "Reject N5 as an overclaim; keep handoff advisory and downstream-only."
  gaps:
    - "No real source truth available."
    - "No owner approval evidence."
    - "No live NotebookLM CLI evidence."
    - "No wiki mutation evidence."
    - "No registration/default-route safety basis."
  normalized_delta_policy: "Remove common claims from delta recommendations, preserve them as trace metadata, and retain conflicts/gaps verbatim for boundary review."

research_delta_handoff:
  target:
    pipeline: knowledge_wiki_pipeline_v0
    cell: knowledge_wiki_cell
  packet_type: research_delta_handoff
  status: blocked_from_completion
  can_prepare: true
  can_execute: false
  included_content:
    - "Normalized common claims"
    - "NotebookLM-only claims"
    - "Codex-only claims"
    - "Conflict list"
    - "Gap list"
    - "Boundary notes"
  excluded_content:
    - "registration judgment"
    - "owner approval claim"
    - "canon promotion claim"
    - "default-route safety claim"
  blocker:
    reason: "Completion would require real source truth or downstream authority not present in the synthetic fixture."

boundary_review_note:
  verdict: "safe_to_prepare_advisory_packet_only"
  rejected_claims:
    - "N5: research workflow may register the result in the wiki if both lanes agree"
  preserved_boundaries:
    - "No claim of owner approval"
    - "No claim of registration"
    - "No claim of wiki mutation"
    - "No claim of default-route safety"
    - "No claim of source truth"
  required_next_action: "Treat the packet as advisory handoff material only; route any actual workflow creation/evolution separately through workflow-generator and workflow-check before any readiness or registration claim."

optimizer_self_check:
  profile_fit: "A_mini_low_human_archivist is appropriate for bounded claim normalization and trace-preserving synthesis."
  cost_control: "No shell, browser, or external tool use requested or performed."
  risk_controls:
    - "Used only supplied synthetic packets."
    - "Separated common claims from deltas."
    - "Recorded conflict and gaps instead of inferring truth."
    - "Rejected overclaim N5."
  residual_risk: "Any real handoff, registration, or wiki mutation remains unverified and out of scope."
