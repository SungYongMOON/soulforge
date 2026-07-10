```yaml
deliverable_type: dual_deep_research_calibration_candidate
workflow_id: dual_deep_research_v0
fixture_id: public_synthetic_cli_blocker_independent_research
public_safe: true
execution_mode: dry_run
output_state: blocked
claim_ceiling: advisory_only

project_binding:
  project_ref: fixture://synthetic/public-safe
  request_ref: fixture://synthetic/research-request
  source_scope_ref: fixture://synthetic/source-scope
  owner_approval: not_claimed

goal_declaration:
  objective: "Identify source-supported controls for summarizing synthetic hardware-layout evidence."
  success_conditions:
    - separate advisory claims by lane
    - identify overlap, delta, conflict, and gaps
    - prepare downstream handoff
  stop_conditions:
    - secret or raw payload required
    - source identity cannot be represented by approved refs
  allowed_inputs:
    - fixture://official/layout-guide-A
    - fixture://official/tool-manual-B
    - synthetic lane evidence in the supplied fixture
  prohibited_actions:
    - browsing
    - NotebookLM invocation
    - external web-app invocation
    - source upload or synchronization
    - notebook mutation
    - registration judgment
    - canon promotion
  downstream_handoff_limits:
    - no registration judgment
    - no canon promotion
    - no source upload

frozen_research_brief:
  question: "What source-supported controls should a public workflow apply when summarizing synthetic hardware-layout evidence?"
  approved_source_handles:
    - fixture://official/layout-guide-A
    - fixture://official/tool-manual-B
  source_policy:
    primary_or_official_only: true
    current_fact_browsing_allowed: false
  exclusions:
    - raw source payloads
    - secrets and session material
    - unsupported source identities
    - agreement-as-truth inference
  claim_ceiling: "Lane findings remain advisory until source-supported or owner-reviewed downstream."
  stop_condition: "Stop if secret/raw payload access or unrepresentable source identity is required."
  downstream_scope:
    handoff_target: knowledge_wiki_cell
    registration_performed_here: false

subagent_stage_manifest:
  freshness_required: true
  stages:
    - stage_id: notebooklm_operator
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - notebooklm_cli_policy
      isolation:
        receives_codex_findings: false
        receives_external_findings: false
      execution_status: not_executed_dry_run
    - stage_id: codex_researcher
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - fixture://official/layout-guide-A
        - fixture://official/tool-manual-B
      isolation:
        receives_notebooklm_findings: false
        receives_external_findings: false
      execution_status: not_executed_dry_run
      synthetic_fixture_evidence_available: true
    - stage_id: external_deep_research_operator
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - external_deep_research_policy
      isolation:
        receives_notebooklm_findings: false
        receives_codex_findings: false
      execution_status: skipped_not_requested
    - stage_id: comparison_archivist
      visible_inputs:
        - completed_lane_packets
      execution_status: not_executed_dry_run
  raw_payload_visibility: forbidden
  secret_visibility: forbidden

notebooklm_cli_research_packet:
  lane_id: notebooklm_cli
  state: blocked_before_research
  blocker: synthetic runtime capability unavailable
  browser_fallback: not_authorized
  commands_executed: none_claimed
  findings: []
  authority: advisory_only
  setup_reference: docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md

codex_direct_research_packet:
  lane_id: codex_direct
  state: synthetic_fixture_packet
  independence_preserved: true
  claims:
    - claim_id: C1
      source_ref: fixture://official/layout-guide-A
      claim_summary: "retain page-level provenance"
      support_status: source_ref_declared_synthetic
      authority: advisory_only
    - claim_id: C2
      source_ref: fixture://official/tool-manual-B
      claim_summary: "record extraction limitations"
      support_status: source_ref_declared_synthetic
      authority: advisory_only
  raw_payload_included: false
  source_truth_claimed: false

external_deep_research_packet:
  state: skipped_not_requested
  lanes:
    gemini_web_deep_research: skipped
    gpt_web_deep_research: skipped
  blocker: none
  findings: []
  authority: advisory_only
  raw_transcript_included: false

dual_research_comparison_packet:
  comparison_state: synthetic_fixture_comparison
  agreement_is_truth: false
  buckets:
    common: []
    notebooklm_only: []
    codex_only:
      - claim_id: C1
        source_ref: fixture://official/layout-guide-A
      - claim_id: C2
        source_ref: fixture://official/tool-manual-B
    gemini_only: []
    gpt_only: []
    external_only: []
    conflict: []
    gap:
      - "NotebookLM corroboration is unavailable."
      - "External Deep Research corroboration was not requested."
      - "No cross-lane validation is established."
  common_claim_trace:
    retained: true
    claims: []
  delta_rule: "Common claims remain trace metadata and are excluded from delta recommendations."
  conclusion: "The available synthetic evidence yields two Codex-lane advisory delta items and no established overlap or conflict."

research_delta_handoff:
  handoff_state: prepared_for_automatic_route
  target:
    party_id: knowledge_wiki_cell
    workflow_id: knowledge_wiki_pipeline_v0
  registration_judgment_owner: downstream_workflow
  registration_performed_here: false
  delta_items:
    - delta_id: D1
      claim_id: C1
      category: codex_only
      source_ref: fixture://official/layout-guide-A
      item: "Consider retaining page-level provenance in public summaries."
      status: advisory_source_ref_only
    - delta_id: D2
      claim_id: C2
      category: codex_only
      source_ref: fixture://official/tool-manual-B
      item: "Record extraction limitations in public summaries."
      status: advisory_source_ref_only
  downstream_decisions_required:
    - assess source sufficiency
    - determine whether owner review is needed
    - determine registration or storage action
  forbidden_inference:
    - source truth
    - owner approval
    - registration
    - canon promotion
    - workflow creation or evolution
    - default-route safety

boundary_review_note:
  public_private_boundary: pass
  raw_payload_copied: false
  secrets_or_session_material: absent_from_deliverable
  notebooklm_answer_as_verdict: false
  external_lane_authority_claimed: false
  registration_judgment_claimed: false
  owner_approval_claimed: false
  canon_promotion_claimed: false
  workflow_authoring_route: not_triggered
  default_route_safe: blocked
  strongest_supported_status: blocked
  blockers:
    - NotebookLM lane unavailable in the synthetic runtime.
    - Fresh material-stage execution and independent comparison verification are not established in this dry-run deliverable.
  next_authorized_owner_or_workflow:
    - knowledge_wiki_cell
    - knowledge_wiki_pipeline_v0
```
