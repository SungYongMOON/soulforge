schema_version: dual_deep_research_deliverable_v0
workflow_id: dual_deep_research_v0
fixture_id: public_synthetic_cli_blocker_independent_research
deliverable_mode: dry_run
public_safe: true
output_state: draft

goal_declaration:
  objective: >-
    Determine which source-supported controls a public workflow should apply
    when summarizing synthetic hardware-layout evidence.
  success_conditions:
    - separate advisory claims by lane
    - identify overlap, delta, conflict, and gaps
    - prepare a bounded downstream handoff
  stop_conditions:
    - secret or raw payload is required
    - source identity cannot be represented by approved refs
    - a claim would require evidence outside the supplied synthetic fixture
    - registration, promotion, upload, mutation, or owner approval would need to be inferred
  allowed_inputs:
    - dual_research_request_binding
    - source_scope_policy
    - notebooklm_cli_policy
    - external_deep_research_policy
    - codex_source_refs
    - synthetic_lane_evidence
    - boundary_attestation
  claim_ceiling:
    level: synthetic_fixture_advisory_only
    constraints:
      - claims describe only supplied synthetic evidence
      - source refs are identifiers, not independently inspected evidence
      - agreement would not establish truth
      - unavailable lanes contribute no research claims
  downstream_handoff_limits:
    - no registration judgment
    - no canon promotion
    - no source upload
    - no notebook or packet-map mutation
    - no workflow creation or evolution claim
    - no default-route switch or safety claim

frozen_research_brief:
  question: >-
    What source-supported controls should a public workflow apply when
    summarizing synthetic hardware-layout evidence?
  scope:
    evidence_domain: synthetic_hardware_layout
    source_policy: primary_or_official_only
    approved_source_handles:
      - fixture://official/layout-guide-A
      - fixture://official/tool-manual-B
    current_fact_browsing_allowed: false
  exclusions:
    - actual browsing
    - NotebookLM invocation
    - external web-app invocation
    - browser fallback
    - authentication inspection or claims
    - raw source or answer payloads
    - secret or session material
    - source upload or synchronization
    - notebook mutation
  source_identity_status: represented_by_approved_synthetic_refs
  public_private_boundary:
    public_material:
      - bounded question
      - synthetic source refs
      - normalized synthetic claim summaries
      - blocker and skip metadata
      - comparison and routing metadata
    prohibited_material:
      - raw payloads
      - transcripts
      - secrets
      - session data
      - account-bound identifiers
      - host-local absolute paths
  frozen: true

subagent_stage_manifest:
  execution_state: prepared_not_executed
  fresh_context_validation_claimed: false
  stages:
    - stage_id: notebooklm_operator
      required_fresh_context: true
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - notebooklm_cli_policy
        - approved_source_handles
      prohibited_inputs:
        - codex findings
        - external-lane findings
        - raw payloads
        - secrets
      expected_output: notebooklm_cli_research_packet
      disposition: blocked_by_fixture_policy
    - stage_id: codex_researcher
      required_fresh_context: true
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - codex_source_refs
        - supplied synthetic Codex claims
      prohibited_inputs:
        - NotebookLM findings
        - external-lane findings
        - unapproved source identities
      expected_output: codex_direct_research_packet
      disposition: fixture_packet_supplied
    - stage_id: external_deep_research_operator
      required_fresh_context: true
      visible_inputs:
        - goal_declaration
        - frozen_research_brief
        - external_deep_research_policy
      prohibited_inputs:
        - NotebookLM findings
        - Codex findings
        - secrets
        - raw external transcripts
      expected_output: external_deep_research_packet
      disposition: skipped_not_requested
    - stage_id: comparison_archivist
      required_fresh_context: true
      visible_inputs_after_lane_completion:
        - notebooklm_cli_research_packet
        - codex_direct_research_packet
        - external_deep_research_packet
        - frozen_research_brief
      prohibited_inputs:
        - raw payloads
        - secrets
        - unsupported source content
      expected_output: dual_research_comparison_packet
      disposition: dry_run_normalization_only
  isolation_rules:
    notebooklm_receives_codex_findings: false
    codex_receives_notebooklm_findings: false
    external_receives_core_lane_findings: false
    comparison_receives_only_completed_or_disposition_packets: true
    controller_merges_before_comparison: false

notebooklm_cli_research_packet:
  lane_id: notebooklm_cli
  advisory: true
  state: blocked_before_research
  blocker: synthetic runtime capability unavailable
  cli_available: false
  browser_fallback_authorized: false
  research_claims: []
  source_refs_used: []
  non_claims:
    - no NotebookLM research result exists in this packet
    - no authentication state is asserted
    - no notebook, source, note, or packet map was mutated
    - no browser fallback occurred
  setup_route_if_later_authorized: docs/architecture/workspace/NOTEBOOKLM_MCP_SETUP_V0.md

codex_direct_research_packet:
  lane_id: codex_direct
  advisory: true
  state: fixture_evidence_available
  evidence_origin: supplied_synthetic_lane_evidence
  source_access_claimed: false
  claims:
    - claim_id: C1
      atomic_claim: retain page-level provenance
      source_ref: fixture://official/layout-guide-A
      support_status: attributed_to_supplied_synthetic_ref
      uncertainty: source content was not independently inspected
    - claim_id: C2
      atomic_claim: record extraction limitations
      source_ref: fixture://official/tool-manual-B
      support_status: attributed_to_supplied_synthetic_ref
      uncertainty: source content was not independently inspected
  non_claims:
    - no browsing or source retrieval is represented
    - no current or unstable fact was assessed
    - the supplied claims are not elevated to verified source truth

external_deep_research_packet:
  advisory: true
  state: skipped_not_requested
  policy_requested: false
  lanes:
    - lane_id: gemini_web_deep_research
      state: skipped_not_requested
      claims: []
    - lane_id: gpt_web_deep_research
      state: skipped_not_requested
      claims: []
  non_claims:
    - no external web application was used
    - no authentication, quota, or tool availability state is asserted
    - no external report or transcript exists in this packet

dual_research_comparison_packet:
  normalization_basis: supplied_synthetic_packet_metadata_only
  agreement_is_truth: false
  atomic_claims:
    - normalized_claim_id: N1
      summary: retain page-level provenance
      lane_support:
        codex_direct:
          claim_id: C1
          source_ref: fixture://official/layout-guide-A
        notebooklm_cli: absent_blocked
        gemini_web_deep_research: absent_skipped
        gpt_web_deep_research: absent_skipped
    - normalized_claim_id: N2
      summary: record extraction limitations
      lane_support:
        codex_direct:
          claim_id: C2
          source_ref: fixture://official/tool-manual-B
        notebooklm_cli: absent_blocked
        gemini_web_deep_research: absent_skipped
        gpt_web_deep_research: absent_skipped
  buckets:
    common: []
    notebooklm_only: []
    codex_only:
      - N1
      - N2
    gemini_only: []
    gpt_only: []
    external_only: []
    conflict: []
    gap:
      - gap_id: G1
        summary: no independent NotebookLM lane evidence is available
        cause: blocked_before_research
      - gap_id: G2
        summary: no optional external-lane evidence is available
        cause: skipped_not_requested
      - gap_id: G3
        summary: supplied source refs and claims were not independently inspected
        cause: dry_run_fixture_boundary
      - gap_id: G4
        summary: cross-lane overlap or conflict cannot be substantively assessed
        cause: only one lane contains claims
  common_claim_trace: []
  dedupe_rule:
    trace_common_claims: true
    exclude_common_claims_from_delta_recommendations: true
    effect_in_this_fixture: no_common_claims_to_remove
  comparison_limits:
    - lane absence is not evidence against a claim
    - one-lane attribution is not independent confirmation
    - absence of conflict does not establish correctness

research_delta_handoff:
  packet_kind: knowledge_wiki_request_packet
  state: prepared_not_transmitted
  destination:
    party_id: knowledge_wiki_cell
    workflow_id: knowledge_wiki_pipeline_v0
    handoff_mode: automatic_after_boundary_pass
  delta_items:
    - delta_id: D1
      type: codex_only
      normalized_claim_id: N1
      summary: retain page-level provenance
      source_ref: fixture://official/layout-guide-A
      recommended_downstream_route: sourcebound_review
      required_downstream_judgment:
        - inspect approved source support
        - determine applicability to public workflow summaries
    - delta_id: D2
      type: codex_only
      normalized_claim_id: N2
      summary: record extraction limitations
      source_ref: fixture://official/tool-manual-B
      recommended_downstream_route: sourcebound_review
      required_downstream_judgment:
        - inspect approved source support
        - determine applicability to public workflow summaries
    - delta_id: D3
      type: gap
      gap_refs:
        - G1
        - G2
        - G3
        - G4
      summary: independent corroboration and source-content review remain absent
      recommended_downstream_route: knowledge_wiki_cell_pipeline
  omitted_from_delta_as_common: []
  route_hints_are_advisory: true
  registration_judgment_owner: knowledge_wiki_pipeline_v0
  registration_performed_here: false
  handoff_performed_here: false
  owner_decision_needed_if:
    - source upload or synchronization is proposed
    - registration or promotion is proposed
    - approved source scope must expand
    - an adjacent workflow must be created or evolved
  workflow_authoring_route_if_needed:
    generator: $soulforge-workflow-generator
    required_review_before_claim: $soulforge-workflow-check
    performed_here: false
  prohibited_inferences:
    - source truth established
    - owner approval granted
    - registration accepted
    - canon promotion approved
    - default route switched
    - default-route safety established

boundary_review_note:
  review_surface:
    - goal and brief boundaries
    - lane isolation
    - blocked and skipped lane representation
    - atomic comparison and delta construction
    - downstream authority separation
  deterministic_validators:
    state: not_part_of_fixture
    claimed_as_run: false
  fresh_executor_or_verifier_evidence:
    state: absent
    effect: limits deliverable to dry-run draft
  boundary_checks:
    no_source_truth_overclaim: pass_by_deliverable_content
    no_owner_approval_inference: pass_by_deliverable_content
    no_notebooklm_answer_as_verdict: pass_by_deliverable_content
    no_registration_judgment: pass_by_deliverable_content
    no_canon_promotion_inference: pass_by_deliverable_content
    no_workflow_creation_or_evolution_claim: pass_by_deliverable_content
    no_default_route_switch_claim: pass_by_deliverable_content
    no_public_payload_copy: pass_by_deliverable_content
  registration_result: not_performed
  default_route_result: not_changed
  strongest_supported_workflow_status: draft
  default-route-safe: blocked
  remaining_blockers:
    - NotebookLM lane blocked before research
    - external lanes skipped by policy
    - supplied source content not independently inspected
    - fresh executor and comparison-verifier evidence absent
    - registration and default-route authority remain downstream
  boundary_attestation: >-
    All question text, refs, lane claims, packet identifiers, and comparison
    records in this deliverable are synthetic and public-safe.
