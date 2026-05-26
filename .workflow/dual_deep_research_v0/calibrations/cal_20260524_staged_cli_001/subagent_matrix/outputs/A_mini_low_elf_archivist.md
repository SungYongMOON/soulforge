profile_metadata:
  candidate_id: A_mini_low_elf_archivist
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: archivist
  mode: synthetic_calibration
  no_shell: true
  no_browse: true

goal_declaration:
  bounded_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  lifecycle_scope:
    - declare goal before material research
    - freeze research brief
    - keep NotebookLM and Codex lanes independent until comparison
    - compare and normalize claims
    - prepare a delta handoff packet only
  exclusions:
    - real NotebookLM execution
    - real CLI or web access
    - real Google Drive or wiki mutation
    - owner approval inference
    - registration or canon promotion judgment
  stop_condition: "If truth would require source authority, account state, owner approval, or wiki mutation, record a blocker instead of completion."

frozen_research_brief:
  scope: "Public-safe workflow-contract analysis using only the supplied synthetic advisory packets."
  allowed_inputs:
    - "public-safe workflow contract summary"
    - "synthetic NotebookLM advisory packet"
    - "synthetic Codex direct advisory packet"
  disallowed_inputs:
    - "real NotebookLM state"
    - "real source truth"
    - "external browsing"
    - "workflow mutation"
    - "wiki registration"
  downstream_limit: "Prepare research_delta_handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0 only; do not claim registration."
  normalization_rule: "Separate claims into common, notebooklm_only, codex_only, conflict, and gap."
  boundary_rule: "Do not infer owner approval, canon authority, or default-route safety."

subagent_stage_manifest:
  notebooklm_operator:
    status: "prepared"
    lane: "independent"
    input_basis: "synthetic NotebookLM advisory packet"
    output_expectation: "advisory claims only"
  codex_researcher:
    status: "prepared"
    lane: "independent"
    input_basis: "synthetic Codex direct advisory packet"
    output_expectation: "advisory claims only"
  comparison_archivist:
    status: "prepared"
    lane: "post-both"
    output_expectation: "normalized comparison and delta handoff"
  separation_policy: "NotebookLM and Codex paths remain separated until both packets are complete."

notebooklm_cli_research_packet:
  status: "synthetic_advisory_only"
  login_check: "pass_synthetic"
  notebook_selection: "reused_synthetic_notebook"
  claims:
    - id: N1
      text: "Goal must be declared before material research."
    - id: N2
      text: "NotebookLM and Codex research lanes must remain separated until comparison."
    - id: N3
      text: "Common claims should be removed from the delta view but retained as trace metadata."
    - id: N4
      text: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
    - id: N5
      text: "The research workflow itself may register the result in the wiki if both lanes agree."
      status: "rejected_overclaim_conflict"
    - id: N6
      text: "If a new workflow is needed, route creation through workflow-generator."
  raw_payload_embedded: false

codex_direct_research_packet:
  status: "synthetic_advisory_only"
  research_mode: "synthetic_direct_packet_only_no_browse"
  claims:
    - id: C1
      text: "A goal declaration is required before material research begins."
    - id: C2
      text: "The two research paths must stay independent until both packets are complete."
    - id: C3
      text: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
    - id: C4
      text: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
    - id: C5
      text: "Common claims are trace metadata and should not be repeated as delta recommendations."
    - id: C6
      text: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - id: C7
      text: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."

dual_research_comparison_packet:
  common_claims:
    - "Goal declaration is required before material research."
    - "NotebookLM and Codex lanes stay independent until comparison / both packets complete."
    - "Common claims are trace metadata and should not appear as delta recommendations."
    - "Handoff can target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
  notebooklm_only:
    - "If a new workflow is needed, route creation through workflow-generator."
  codex_only:
    - "Agreement is not source truth and does not imply owner approval."
    - "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
    - "Google Drive placement and NotebookLM packet-map mutation are out of scope."
  conflict:
    - "N5 asserts the workflow itself may register the result in the wiki if both lanes agree."
  gap:
    - "No source-authoritative evidence for automatic wiki handoff becoming actual registration."
    - "No owner approval evidence."
    - "No real NotebookLM state or wiki mutation evidence."
    - "No basis to claim default-route safety."
  normalized_delta:
    - "Declare the goal before material research."
    - "Keep research lanes independent until both packets are complete."
    - "Remove common claims from delta recommendations; retain them only as trace metadata."
    - "Prepare a handoff packet for knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
    - "Use workflow-generator and workflow-check if workflow creation or evolution is involved."
  delta_exclusions:
    - "Do not repeat common claims as recommendations."
    - "Do not treat agreement as authority."
    - "Do not claim registration, canon promotion, or owner approval."
  trace_preservation: true

research_delta_handoff:
  target: "knowledge_wiki_cell"
  pipeline: "knowledge_wiki_pipeline_v0"
  handoff_type: "research_delta_only"
  contents:
    - "bounded goal"
    - "frozen research brief"
    - "normalized delta"
    - "common-trace summary"
    - "conflict record"
    - "gap record"
  explicit_nonclaims:
    - "not registration"
    - "not canon promotion"
    - "not owner approval"
    - "not wiki mutation"
  blocker: "If downstream authority is required, handoff must stop at packet preparation."

boundary_review_note:
  reviewed_boundaries:
    - "No real NotebookLM or CLI execution claimed"
    - "No browsing claimed"
    - "No Google Drive or wiki mutation claimed"
    - "No source truth inferred from agreement"
    - "No owner approval inferred"
  decision:
    status: "blocked_for_authority"
    reason: "The packet can be prepared, but automatic handoff-to-registration cannot be claimed without downstream authority and mutation evidence."
  rejected_overclaim:
    - "N5"
  preserve_common_trace: true

optimizer_self_check:
  profile_fit: "consistent"
  risk_level: "low"
  compactness: "meets"
  boundary_discipline: "passed"
  main_residual_risk: "downstream registration or authority could be mistaken for handoff preparation."
  final_assertion: "Usable synthetic workflow packet produced; completion is limited to delta preparation, not registration."
