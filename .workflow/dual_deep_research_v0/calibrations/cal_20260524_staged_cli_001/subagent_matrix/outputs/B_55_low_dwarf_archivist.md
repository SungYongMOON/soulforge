```yaml
profile_metadata:
  candidate_id: B_55_low_dwarf_archivist
  model: gpt-5.5
  reasoning_effort: low
  species: dwarf
  class: archivist
  execution_mode: synthetic_public_safe_calibration
  external_actions_performed: none

goal_declaration:
  research_goal: "Find what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  declared_before_material_research: true
  downstream_target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  stop_condition: "Record blocker if real source truth, NotebookLM account state, owner approval, or wiki mutation would be required."

frozen_research_brief:
  scope:
    - "Use only supplied workflow contract summary."
    - "Use only supplied synthetic NotebookLM and Codex advisory packets."
    - "Normalize requirements for automatic research-delta handoff."
  exclusions:
    - "No browsing."
    - "No shell commands."
    - "No real NotebookLM, CLI, Google Drive, wiki, or source mutation claims."
    - "No registration, canon promotion, default-route-safety, or owner-approval inference."
  allowed_inputs:
    - "workflow_contract_summary"
    - "synthetic_notebooklm_advisory_packet"
    - "synthetic_codex_direct_advisory_packet"
  downstream_limits:
    registration_permitted: false
    wiki_mutation_permitted: false
    owner_approval_inference_permitted: false
    source_truth_inference_permitted: false

subagent_stage_manifest:
  notebooklm_operator:
    status: synthetic_packet_provided
    independence: "kept separate until comparison"
    real_cli_used: false
  codex_researcher:
    status: synthetic_packet_provided
    independence: "kept separate until comparison"
    browsing_used: false
  comparison_archivist:
    status: completed_synthetic_normalization
    role: "compare advisory packets, preserve common trace, isolate deltas/conflicts/gaps"

notebooklm_cli_research_packet:
  synthetic_status:
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

codex_direct_research_packet:
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
    - ids: [N1, C1]
      claim: "A bounded goal declaration is required before material research."
    - ids: [N2, C2]
      claim: "NotebookLM and Codex lanes must stay independent until both packets are complete."
    - ids: [N3, C5]
      claim: "Common claims are retained as trace metadata and removed from delta recommendations."
    - ids: [N4, C4]
      claim: "A research-delta handoff may be prepared for knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
  notebooklm_only:
    - ids: [N6]
      claim: "If a new workflow is needed, route creation through workflow-generator."
  codex_only:
    - ids: [C3]
      claim: "Agreement between advisory lanes is not source truth and does not imply owner approval."
    - ids: [C6]
      claim: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - ids: [C7]
      claim: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
  conflict:
    - ids: [N5, C3, C4]
      rejected_claim: "The research workflow itself may register the result in the wiki if both lanes agree."
      reason: "Lane agreement is advisory, not source truth or owner approval; registration judgment belongs downstream."
      disposition: rejected_overclaim
  gap:
    - "Real source truth is unavailable in this synthetic fixture."
    - "NotebookLM account state is not verified."
    - "Owner approval is not present."
    - "Wiki mutation and registration state are not checked or changed."
    - "No workflow creation/evolution evidence is produced here."

research_delta_handoff:
  target: "knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  handoff_status: prepared_synthetic_delta_only
  common_trace_preserved:
    - "goal_before_material_research"
    - "independent_lanes_until_comparison"
    - "common_claims_removed_from_delta_but_retained_as_trace"
    - "handoff_target_after_boundary_pass"
  delta_recommendations:
    - "Treat NotebookLM and Codex agreement as advisory only, never as source truth."
    - "Do not infer owner approval from dual-lane agreement."
    - "Registration judgment and wiki mutation must remain downstream responsibilities."
    - "Exclude Google Drive placement and NotebookLM packet-map mutation from this workflow."
    - "If workflow creation or evolution is needed, route through soulforge-workflow-generator and require soulforge-workflow-check before readiness, registration, promotion, default-route, or default-route-safety claims."
  blockers:
    - "Cannot claim completion requiring real source truth."
    - "Cannot claim NotebookLM account or CLI state."
    - "Cannot claim owner approval."
    - "Cannot claim wiki registration, mutation, canon promotion, or default-route safety."

boundary_review_note:
  workflow_creation_or_evolution_needed: false
  workflow_generator_route_required_now: false
  workflow_check_required_now: false
  registration_claim: none
  default_route_safe: blocked
  strongest_supported_status: "synthetic_handoff_packet_prepared"
  boundary_pass: true
  rejected_overclaims:
    - "N5"

optimizer_self_check:
  contract_followed:
    no_shell_commands: true
    no_browse: true
    no_real_notebooklm_claim: true
    no_drive_or_wiki_mutation_claim: true
    common_claims_removed_from_delta: true
    common_trace_preserved: true
    conflicts_preserved: true
    gaps_preserved: true
    n5_rejected: true
  concise_machine_readable_yaml: true
```
