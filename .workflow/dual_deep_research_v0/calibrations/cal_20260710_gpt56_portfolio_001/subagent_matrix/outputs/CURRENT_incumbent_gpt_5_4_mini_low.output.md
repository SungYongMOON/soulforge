```yaml
workflow_id: dual_deep_research_v0
fixture_id: public_synthetic_cli_blocker_independent_research
output_state: blocked

goal_declaration:
  workflow_id: dual_deep_research_v0
  goal: >-
    Produce a bounded dual-path research packet for the synthetic question:
    "What source-supported controls should a public workflow apply when
    summarizing synthetic hardware-layout evidence?"
  success_conditions:
    - separate advisory claims by lane
    - identify overlap, delta, conflict, and gaps
    - prepare downstream handoff
  stop_conditions:
    - secret or raw payload required
    - source identity cannot be represented by approved refs
    - any claim would require actual external action, auth, source upload, notebook mutation, browser fallback, or invented research result
  allowed_inputs:
    - dual_research_request_binding
    - source_scope_policy
    - notebooklm_cli_policy
    - approved_source_handles when synthetic and public-safe
    - codex_source_refs when synthetic and public-safe
  downstream_handoff_limits:
    - no registration judgment
    - no canon promotion
    - no source upload
    - no default-route claim
  claim_ceiling: >-
    Advisory-only, source-bounded, synthetic fixture output. Agreement between
    lanes is not truth by itself.

frozen_research_brief:
  question: >-
    What source-supported controls should a public workflow apply when
    summarizing synthetic hardware-layout evidence?
  scope:
    primary_or_official_only: true
    current_fact_browsing_allowed: false
    public_safe: true
  approved_source_handles:
    - fixture://official/layout-guide-A
    - fixture://official/tool-manual-B
  exclusions:
    - secret material
    - raw payloads
    - unsupported source identities
    - canon or registration decisions
  public_private_boundary: >-
    Public-safe synthetic refs only. No private source payload, no external
    service claims, no inferred authority.
  claim_ceiling: >-
    Source-supported advisory controls only. No truth claim beyond the fixture.

subagent_stage_manifest:
  workflow_id: dual_deep_research_v0
  freshness_policy:
    material_stages_should_use_fresh_subagents: true
    subagent_runtime_available: false
    reason: synthetic_cli_blocker_fixture
  stage_roles:
    - stage: notebooklm_operator
      visible_inputs:
        - frozen_research_brief
        - notebooklm_cli_policy
      isolation_rule: do_not_receive_codex_findings_before_packet_completion
    - stage: codex_researcher
      visible_inputs:
        - frozen_research_brief
        - codex_source_refs
      isolation_rule: do_not_receive_notebooklm_findings_before_direct_packet_completion
    - stage: external_deep_research_operator
      visible_inputs:
        - frozen_research_brief
      isolation_rule: do_not_receive_notebooklm_or_codex_findings_before_packet_completion
      status: skipped_not_requested
    - stage: comparison_archivist
      visible_inputs:
        - notebooklm_cli_research_packet
        - codex_direct_research_packet
        - external_deep_research_packet
      isolation_rule: comparison_only_after_packets_complete
  blocked_if:
    - visible_inputs_include_raw_payload_or_secret
    - subagent_runtime_required_for_claim_and_unavailable
  notes:
    - This is a dry-run orchestration manifest only.
    - No fresh execution is claimed.

notebooklm_cli_research_packet:
  lane_id: notebooklm_cli
  status: blocked_before_research
  blocker:
    type: runtime_capability_unavailable
    detail: synthetic runtime capability unavailable
    browser_fallback_authorized: false
    cli_available: false
  setup_ref: docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md
  advisory_summary: >-
    NotebookLM lane could not be executed in this fixture. No notebook,
    source-sync, or query result is claimed.
  claim_ceiling: >-
    Blocker record only. No research output.

codex_direct_research_packet:
  lane_id: codex_direct_source_research
  status: advisory_packet_ready
  source_policy:
    prefer_primary_or_official_sources: true
    browse_for_current_or_unstable_facts: false
    cite_source_refs_or_mark_gap: true
  visible_inputs:
    - frozen_research_brief
    - codex_source_refs
  source_refs:
    - fixture://official/layout-guide-A
    - fixture://official/tool-manual-B
  atomic_claims:
    - claim_id: C1
      source_ref: fixture://official/layout-guide-A
      claim_summary: retain page-level provenance
      support_status: source-backed_from_fixture
    - claim_id: C2
      source_ref: fixture://official/tool-manual-B
      claim_summary: record extraction limitations
      support_status: source-backed_from_fixture
  advisory_summary: >-
    The direct lane suggests two public controls for summarizing synthetic
    hardware-layout evidence: preserve page-level provenance and record
    extraction limitations.
  limitations:
    - only synthetic fixture claims are present
    - no live browsing was used or claimed
    - no source upload or external verification is claimed
  claim_ceiling: >-
    Advisory lane only. Source-backed only within the fixture.

external_deep_research_packet:
  status: skipped_not_requested
  lanes_considered:
    - gemini_web_deep_research
    - gpt_web_deep_research
  skip_reason: external_deep_research_policy.requested is false
  advisory_summary: >-
    External deep research was intentionally not requested and remains absent.
  claim_ceiling: >-
    Skip record only. No external findings.

dual_research_comparison_packet:
  comparison_method: atomic_claim_normalization
  claim_buckets:
    common:
      - claim_id: common-1
        normalized_claim: preserve provenance and record limitations when summarizing
        trace:
          - fixture://official/layout-guide-A -> retain page-level provenance
          - fixture://official/tool-manual-B -> record extraction limitations
        note: >-
          Common overlap is trace metadata only; it is not treated as truth by itself.
    notebooklm_only: []
    codex_only:
      - claim_id: codex-only-1
        normalized_claim: source refs are synthetic fixture refs and remain public-safe
        trace:
          - fixture://official/layout-guide-A
          - fixture://official/tool-manual-B
        note: >-
          This is a boundary/control statement inferred from the fixture shape, not
          a source truth claim.
    gemini_only: []
    gpt_only: []
    external_only: []
    conflict: []
    gap:
      - claim_id: gap-1
        normalized_gap: NotebookLM lane blocked before research; no comparative NotebookLM content exists.
      - claim_id: gap-2
        normalized_gap: External deep research lane was not requested, so no advisory packet exists.
      - claim_id: gap-3
        normalized_gap: No source-upload, registration, or canon decision is in scope for this workflow slice.
  dedupe_rule: >-
    Common claims remain trace metadata and are excluded from delta
    recommendations.
  comparison_summary: >-
    The only shared theme is provenance discipline and limitation tracking. The
    comparative delta is defined by unavailable NotebookLM output and skipped
    external lane, not by disagreement.

research_delta_handoff:
  handoff_target:
    party_id: knowledge_wiki_cell
    workflow_id: knowledge_wiki_pipeline_v0
    handoff_mode: automatic_after_boundary_pass
  request_packet_type: research_delta_handoff_as_knowledge_wiki_request_packet
  delta_items:
    - item_id: delta-1
      category: common_trace
      content: retain page-level provenance and record extraction limitations
      handling: keep as trace metadata, not delta recommendation
    - item_id: delta-2
      category: notebooklm_gap
      content: NotebookLM blocked before research due to unavailable synthetic CLI capability
      handling: downstream may treat as blocker context only
    - item_id: delta-3
      category: external_skip
      content: external deep research was not requested
      handling: downstream may treat as explicit skip context only
    - item_id: delta-4
      category: source_scope
      content: approved refs are fixture://official/layout-guide-A and fixture://official/tool-manual-B
      handling: downstream may use as source-bounded scope metadata only
  route_hints:
    - knowledge_wiki_cell_pipeline
    - knowledge_candidate_triage
    - sourcebound_review
    - knowledge_access_event_capture
    - none
  boundary_limits:
    - no registration judgment
    - no canon promotion
    - no source upload
    - no owner approval inference
    - no default-route claim
  summary: >-
    Prepare a downstream review packet that preserves trace metadata, gap
    context, and synthetic source scope without asserting authority.

boundary_review_note:
  checked:
    - public_private_boundary
    - source_support_posture
    - registration/default-route posture
    - claim ceiling
    - stop conditions
  result:
    public_private_boundary: passed_for_synthetic_fixture_only
    source_support_posture: advisory_only
    registration_default_route_posture: not_assigned_here
    strongest_supported_workflow_status: blocked
    default_route_safe: blocked
  blockers:
    - NotebookLM lane blocked before research because the synthetic CLI capability is unavailable.
    - External deep research was not requested.
    - No downstream registration judgment is owned here.
  next_action:
    - hand off the bounded delta packet to knowledge_wiki_cell for downstream judgment
    - keep all claims advisory and synthetic-safe
  non_claims:
    - no actual external action occurred
    - no browser fallback occurred
    - no notebook mutation occurred
    - no source upload occurred
    - no verification or runtime fact was asserted
```
