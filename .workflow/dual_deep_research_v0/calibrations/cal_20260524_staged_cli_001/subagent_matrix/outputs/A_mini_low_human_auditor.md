profile_metadata:
  candidate_id: A_mini_low_human_auditor
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: auditor
  mode: synthetic_public_safe_calibration
  source_constraints:
    allowed_inputs:
      - public-safe workflow contract summary
      - synthetic NotebookLM advisory packet
      - synthetic Codex advisory packet
    forbidden_inputs:
      - real NotebookLM state
      - real CLI/browser execution
      - web browsing
      - shell commands
      - source mutation claims
      - owner approval claims
      - wiki mutation claims

goal_declaration:
  bounded_goal: "Determine what must be true before a Soulforge workflow may automatically hand a research delta to the Knowledge Wiki Cell."
  lifecycle_scope:
    includes:
      - declare goal before material research
      - freeze brief before analysis
      - keep NotebookLM and Codex lanes independent until comparison
      - normalize claims into common, notebooklm_only, codex_only, conflict, and gap
      - prepare a downstream handoff packet only
    excludes:
      - real NotebookLM CLI or UI execution
      - real wiki registration or mutation
      - owner approval inference
      - source truth adjudication
      - default-route safety judgment
  stop_condition: "If completion would require real source truth, NotebookLM account state, owner approval, or wiki mutation, record a blocker instead of claiming completion."

frozen_research_brief:
  scope: "Pre-handoff conditions for automatic delta handoff to knowledge_wiki_cell via knowledge_wiki_pipeline_v0"
  exclusions:
    - external verification
    - canon promotion
    - registration judgment
    - workflow authoring beyond packet assembly
    - Drive/NotebookLM mutation claims
  allowed_inputs:
    - synthetic contract summary
    - synthetic NotebookLM advisory packet
    - synthetic Codex advisory packet
  downstream_limits:
    - advisory only
    - no registration
    - no owner approval implication
    - no source truth assertion
  acceptance_tests:
    - goal declared before research
    - lanes remain separated until comparison
    - common claims removed from delta recommendations but retained as trace
    - overclaims flagged as conflict
    - handoff packet targets knowledge_wiki_cell / knowledge_wiki_pipeline_v0 only
  blocker_policy: "Convert any need for real truth, account state, approval, or mutation into a blocker rather than an asserted outcome."

subagent_stage_manifest:
  notebooklm_operator:
    status: completed_synthetic
    role: advisory_lane
    input_boundary: "synthetic contract summary only"
    output_boundary: "NotebookLM advisory claims only"
  codex_researcher:
    status: completed_synthetic
    role: independent advisory lane
    input_boundary: "frozen brief only"
    output_boundary: "Codex advisory claims only"
  comparison_archivist:
    status: completed_synthetic
    role: normalize_and_dedupe
    input_boundary: "both advisory packets after completion"
    output_boundary: "comparison packet + delta handoff"
  freshness_note: "No real execution occurred; stage labels are synthetic fixture labels only."

notebooklm_cli_research_packet:
  packet_state: advisory_only
  claims:
    - id: N1
      text: "Goal must be declared before material research."
      status: common
    - id: N2
      text: "NotebookLM and Codex research lanes must remain separated until comparison."
      status: common
    - id: N3
      text: "Common claims should be removed from the delta view but retained as trace metadata."
      status: common
    - id: N4
      text: "Handoff should target knowledge_wiki_cell / knowledge_wiki_pipeline_v0 after boundary pass."
      status: common
    - id: N5
      text: "The research workflow itself may register the result in the wiki if both lanes agree."
      status: rejected_overclaim_conflict
    - id: N6
      text: "If a new workflow is needed, route creation through workflow-generator."
      status: gap_or_deferred
  note: "NotebookLM packet is advisory only; no real CLI, account, or notebook state is claimed."

codex_direct_research_packet:
  packet_state: advisory_only
  claims:
    - id: C1
      text: "A goal declaration is required before material research begins."
      status: common
    - id: C2
      text: "The two research paths must stay independent until both packets are complete."
      status: common
    - id: C3
      text: "Agreement between NotebookLM and Codex is not source truth and must not imply owner approval."
      status: common
    - id: C4
      text: "Delta handoff may be prepared for knowledge_wiki_cell, but registration judgment belongs downstream."
      status: common
    - id: C5
      text: "Common claims are trace metadata and should not be repeated as delta recommendations."
      status: common
    - id: C6
      text: "Created or evolved workflows require workflow-check before readiness, registration, promotion, default-route switch, or default-route-safety claims."
      status: gap_or_deferred
    - id: C7
      text: "Google Drive placement and NotebookLM packet-map mutation are outside this workflow."
      status: common
  note: "Codex packet is advisory only; no browsing or source mutation occurred."

dual_research_comparison_packet:
  common:
    - "Goal declaration precedes material research."
    - "NotebookLM and Codex lanes remain independent until comparison."
    - "Delta handoff targets knowledge_wiki_cell / knowledge_wiki_pipeline_v0."
    - "Common claims are retained as trace metadata, not repeated as delta recommendations."
    - "Registration judgment is downstream, not implied by agreement."
    - "Google Drive placement and NotebookLM packet-map mutation are outside scope."
  notebooklm_only: []
  codex_only: []
  conflict:
    - claim_id: N5
      issue: "Overclaim: implies wiki registration may be performed by the research workflow itself when both lanes agree."
      resolution: "Reject; registration is downstream and cannot be inferred from agreement."
  gap:
    - "Whether workflow-generator is needed depends on whether a new workflow is actually being created or evolved; not established by this fixture."
    - "Whether workflow-check is mandatory for this exact packet depends on creation/evolution/readiness scope; treat as deferred guardrail, not a proven requirement."
  comparison_summary: "The agreed minimum is a boundary-safe handoff packet only; no authority to register, promote, or declare default-route safety."

research_delta_handoff:
  target: knowledge_wiki_cell
  pipeline: knowledge_wiki_pipeline_v0
  artifact_type: research_delta_handoff
  contents:
    must_include:
      - goal declaration
      - frozen brief
      - common claim trace
      - conflict list
      - gap list
      - downstream-only handoff note
    must_exclude:
      - registration claim
      - owner approval claim
      - source truth claim
      - real notebook mutation claim
      - default-route safety claim
  delta_recommendations:
    - "Use the packet only as an advisory handoff to the knowledge wiki pipeline."
    - "Strip common claims from actionable delta text, but keep them in trace metadata."
    - "Reject any statement that converts lane agreement into registration authority."
  blocker: null

boundary_review_note:
  boundary_result: pass_with_conflict
  overclaim_rejected:
    - N5
  not_claimed:
    - real NotebookLM execution
    - real wiki mutation
    - owner approval
    - canon promotion
    - default-route safety
  residual_risk: "Any move from handoff preparation to registration or workflow promotion requires separate authority and evidence."

optimizer_self_check:
  profile_fit: "Matches the requested A_mini_low_human_auditor calibration profile."
  constraint_compliance:
    - no shell commands used
    - no browsing used
    - no real NotebookLM or wiki claims made
    - synthetic-only evidence preserved
  output_quality:
    - compact: true
    - machine_readable: true
    - common_deduped: true
    - conflict_preserved: true
    - gap_preserved: true
  final_status: "usable synthetic workflow packet, handoff-only, not registered"
