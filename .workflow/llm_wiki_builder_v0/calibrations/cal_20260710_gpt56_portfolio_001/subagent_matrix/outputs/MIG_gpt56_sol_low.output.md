workflow_deliverable:
  workflow_id: llm_wiki_builder_v0
  fixture_id: PUBLIC_SYNTH_LLM_WIKI_BUILDER_V0
  source_kind: synthetic_from_workflow_contract_metadata_only
  public_safe: true
  status: bounded_handoff_ready

  builder_scope_packet:
    scope_id: SYNTH_BUILDER_SCOPE_001
    request_binding_ref: builder_request_binding
    project_wiki_context_ref: project_wiki_context_refs
    builder_policy_ref: builder_policy
    objective: >-
      Assemble a query-first route for bounded project-wiki use, candidate
      triage, conditional sourcebound deepening, curation planning, usage
      capture, and boundary review.
    claim_posture: metadata_only
    authority_statement: >-
      Source truth remains with approved sources; owner decisions, canon
      promotion, ontology acceptance, and archival actions remain outside
      builder authority.
    constraints:
      - query_first_before_raw_source_when_possible
      - no_payload_copy_into_public_package
      - notebooklm_advisory_only
      - sourcebound_deepening_conditional
      - reusable_results_require_curation

  preflight_result_ref:
    result_id: SYNTH_PREFLIGHT_RESULT_001
    upstream_workflow_id: monster_knowledge_preflight_v0
    state: pass_with_source_gap
    source_gap_count: 1
    source_gap_ref: SYNTH_SOURCE_GAP_001
    claim_ceiling: >-
      Claims may describe the synthetic routing state only; the unresolved
      source gap prevents stronger factual or canon conclusions.
    recommendation: proceed_to_candidate_triage
    non_claims:
      - No source payload was assessed.
      - No runtime preflight result is asserted.
      - The source gap is not treated as resolved.

  candidate_triage_ref:
    result_id: SYNTH_CANDIDATE_TRIAGE_001
    upstream_workflow_id: knowledge_candidate_triage_v0
    state: route_assigned
    candidate_count: 1
    decisions:
      - candidate_id: SYNTH_CANDIDATE_001
        placement_state: pending_sourcebound_deepening
        notebooklm_packet_eligibility: undetermined
        downstream_route: sourcebound_knowledge_packet_operating_loop_v0
        rationale: >-
          The fixture requires one candidate to enter approved-source
          deepening before reusable or stronger claims are considered.
    uncertainty:
      - Candidate content and source sufficiency are unspecified.
      - Bookshelf placement remains provisional.

  sourcebound_route_ref:
    route_id: SYNTH_SOURCEBOUND_ROUTE_001
    selected_state: sourcebound_deepening_required
    candidate_ref: SYNTH_CANDIDATE_001
    source_gap_ref: SYNTH_SOURCE_GAP_001
    target_workflow_id: sourcebound_knowledge_packet_operating_loop_v0
    required_inputs:
      - approved_candidate_source_refs
      - applicable_source_packet_refs
    expected_outputs:
      - sourcebound_knowledge_packet_manifest
      - claim_ceiling_and_promotion_route
    route_boundary: >-
      Deepening may organize evidence and establish a bounded claim ceiling;
      it does not itself grant owner approval or canon authority.
    stop_conditions:
      - Stop if approved source references are absent.
      - Stop if candidate identity or scope cannot be bound.
      - Route to owner_decision_packet_v0 if acceptable source scope requires an owner decision.
      - Do not substitute an advisory NotebookLM response for source evidence.

  curation_result_ref:
    result_id: SYNTH_CURATION_RESULT_001
    target_workflow_id: wiki_curation_maintenance_v0
    state: follow_up_required
    follow_up_count: 1
    follow_ups:
      - follow_up_id: SYNTH_CURATION_FOLLOWUP_001
        action: >-
          Reassess the candidate’s reusable wiki placement after sourcebound
          outputs establish its evidence scope and claim ceiling.
        status: pending
        completion_evidence:
          - sourcebound_knowledge_packet_manifest
          - claim_ceiling_and_promotion_route
          - source_ledger_curation_packet
    prohibited_actions:
      - canon_promotion
      - ontology_acceptance
      - archive_or_retire_execution

  usage_capture_note:
    note_id: SYNTH_USAGE_CAPTURE_001
    target_workflow_id: knowledge_access_event_capture_v0
    handoff_state: explicit
    event_summary: >-
      A query-first builder route encountered one source gap, triaged one
      candidate into sourcebound deepening, and left one curation follow-up.
    capture_scope: routing_metadata_only
    expected_outputs:
      - usage_rollup
      - boundary_review_note
    exclusions:
      - source_payload
      - private_evidence
      - runtime_telemetry
      - inferred_user_or_owner_approval

  final_builder_handoff:
    handoff_id: SYNTH_FINAL_BUILDER_HANDOFF_001
    overall_state: conditional_progress
    completed_route_states:
      - builder_scope_bound
      - preflight_passed_with_one_source_gap
      - candidate_triaged
      - sourcebound_route_selected
      - curation_follow_up_defined
      - usage_capture_handoff_defined
    next_required_action: >-
      Supply approved source references to the sourcebound workflow for
      SYNTH_CANDIDATE_001, then return its bounded manifest and claim ceiling
      to SYNTH_CURATION_FOLLOWUP_001.
    owner_gate: >-
      Owner input is required only if source scope, promotion posture, or
      another reserved decision cannot be resolved within existing policy.
    promotion_gate: >-
      Any changed claim or policy posture must enter
      post_development_review_gate_v0 before public or canon promotion.
    unresolved_items:
      - SYNTH_SOURCE_GAP_001
      - SYNTH_CURATION_FOLLOWUP_001
    terminal_conditions:
      success: >-
        Sourcebound outputs are available, curation follow-up is resolved,
        usage capture is handed off, and all authority boundaries remain intact.
      blocked: >-
        Approved sources are unavailable, required scope is ambiguous, or an
        owner-reserved decision remains unanswered.
      stop: >-
        Stop before stronger claims, public promotion, canon promotion, or
        archival action when required evidence or authority is missing.

  boundary_review_note:
    note_id: SYNTH_BOUNDARY_REVIEW_001
    result: pass_with_open_conditions
    preserved:
      - query-first routing
      - explicit candidate triage
      - conditional sourcebound deepening
      - public-safe synthetic identifiers
      - source and owner authority boundaries
    open_conditions:
      - One synthetic source gap remains unresolved.
      - One synthetic curation follow-up remains pending.
    non_claims:
      - No source truth has been established.
      - No owner approval has been inferred.
      - No NotebookLM answer has been treated as a verdict.
      - No upstream artifact mutation or authority promotion is represented.
      - No runtime operation, hidden evidence, payload transfer, or external action is represented.
