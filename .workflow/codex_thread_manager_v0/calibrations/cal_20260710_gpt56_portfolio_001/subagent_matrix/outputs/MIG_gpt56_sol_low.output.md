workflow_deliverable:
  schema_version: codex_thread_manager_deliverable_v1
  workflow_id: codex_thread_manager_v0
  fixture_id: public_synthetic_durable_two_lane_orchestration
  public_safe: true
  execution_status: planned_not_executed

declared_thread_goal:
  goal: Refactor the synthetic telemetry adapter, update its public operator note, and obtain fresh independent acceptance evidence.
  active_workspace_scope:
    - repo://src/telemetry_adapter/**
    - repo://docs/telemetry_adapter.md
  success_criteria:
    - Implementation changes remain within repo://src/telemetry_adapter/**.
    - Documentation changes remain within repo://docs/telemetry_adapter.md.
    - The implementation and documentation lanes return complete result summaries.
    - Referenced unit-test and documentation-lint validation evidence is reported without invention.
    - A fresh non-implementer verifier reviews the integrated candidate against the stated acceptance criteria.
    - No registration, default-route, or external-side-effect change occurs.
  stop_conditions:
    - conflicting_active_goal
    - unsafe_public_private_boundary
    - secret_or_credential_required
    - owner_decision_required_for_registration_or_default_route
    - unavailable_thread_tool
    - worker_write_scope_overlap_without_worktree
    - independent_verifier_unavailable_for_required_claim
    - worker_direct_substantive_execution_without_no_subagent_exception
    - unbounded_recursive_subagent_fanout_requested_or_observed
    - validator_failure_unfixable_in_scope
    - exhausted_user_specified_budget
    - required source context is absent or materially ambiguous
  boundary_constraints:
    public_safe_only: true
    external_side_effects: forbidden
    allowed_refs:
      - repo://src/telemetry_adapter/**
      - repo://docs/telemetry_adapter.md
      - cmdref://unit_test
      - cmdref://docs_lint
      - fixture://handoff/telemetry_refactor_checkpoint
      - fixture://policies/public_safe_no_external_side_effects
    forbidden_content:
      - raw_thread_transcript
      - hidden_reasoning
      - private_payload
      - secret_or_credential
      - host_local_absolute_path
      - unneeded_source_dump
    forbidden_claims:
      - invented_thread_creation
      - invented_thread_id
      - invented_command_or_validator_result
      - owner_approval
      - registration_change
      - default_route_safety
      - production_readiness
  manager_activation_decision:
    declared_current_thread_is_manager: true
    authority: orchestration_only
    candidate_execution: forbidden

checkpoint_refresh:
  decision: refresh_required
  reason:
    - unresolved_forward_state
    - durable_worker_packets_are_being_prepared
    - moderate_context_pressure
  compact_or_clear: neither_requested
  manager_rollover: not_required
  night_work_handoff:
    handoff_id: synthetic://handoff/telemetry_refactor/planned-v1
    final_goal: Refactor the synthetic telemetry adapter, update its public operator note, and obtain independent acceptance evidence.
    current_state:
      phase: orchestration_planning
      candidate_execution: not_started
      active_worker_threads: []
      completed_worker_results: []
      validation_evidence: unavailable
      independent_acceptance_evidence: unavailable
    target_refs:
      - repo://src/telemetry_adapter/adapter.ts
      - repo://docs/telemetry_adapter.md
    decisions:
      - Keep the declared current thread as manager.
      - Use separate durable implementation and documentation worker lanes.
      - Their declared write scopes do not overlap.
      - Use a fresh non-implementer verifier only after an integrated candidate and evidence packet exist.
      - Preserve registration and default-route state.
    rejected_or_disallowed:
      - same-thread substantive execution
      - subagents as durable lane owners
      - invented runtime or validation facts
      - implementer self-check as independent acceptance
      - registration or default-route changes
    blockers:
      - Worker execution has not been authorized by this deliverable.
      - Actual source state and validation outcomes are unknown.
      - Independent acceptance cannot begin before candidate result packets exist.
    exact_next_actions:
      - Create or assign the implementation worker from its packet if thread tooling remains available.
      - Create or assign the documentation worker from its packet if thread tooling remains available.
      - Record actual worker titles and thread IDs only after creation.
      - Integrate non-overlapping results conservatively.
      - Supply minimal evidence to a fresh verifier.
    continuity_note: Refresh this checkpoint before thread creation, compaction, clearing, rollover, or phase closeout.

continuation_surface_decision:
  selected_surface: current_thread_manager_plus_two_durable_role_workers_then_fresh_verifier
  rationale:
    - explicit_manager_invocation
    - two_durable_lanes
    - multi_phase_duration
    - acceptance_review_required
    - thread_tools_assumed_available
  delegation_routing_decision:
    implementation: durable_worker_thread
    documentation: durable_worker_thread
    acceptance: fresh_verifier_thread
    incidental_bounded_side_work: subagent_allowed_within_packet_bounds
  thread_team_topology:
    manager:
      title: Synthetic Telemetry Refactor Manager
      thread_id: unassigned
      lifecycle: retain_across_worker_phase_changes
    workers:
      - title: Synthetic Telemetry Adapter Implementation
        thread_id: unassigned
        lane: implementation
      - title: Synthetic Telemetry Operator Note
        thread_id: unassigned
        lane: documentation
    verifier:
      title: Synthetic Telemetry Refactor Independent Acceptance
      thread_id: unassigned
      context_requirement: fresh_non_implementer
  manager_lifecycle_action:
    action: retain_current_manager
    rollover_required: false
    rollover_triggers:
      - mission_boundary_change
      - material_context_drift
      - cross_pc_or_overnight_transfer
      - twenty_four_hour_span
      - explicit_user_request
    clear_policy: checkpoint_and_accepted_handoff_required
  worktree_decision:
    required_now: false
    basis: Fixture declares implementation and documentation write scopes non-overlapping.
    escalation: Stop or move affected work into isolated worktrees if overlap emerges.

worker_thread_packet_set:
  - packet_id: synthetic://packet/telemetry-implementation-v1
    title: Synthetic Telemetry Adapter Implementation
    objective: Refactor the synthetic telemetry adapter within the implementation scope while preserving externally documented behavior unless source-supported acceptance criteria require a change.
    context_refs:
      - synthetic://handoff/telemetry_refactor/planned-v1
      - repo://src/telemetry_adapter/**
      - repo://src/telemetry_adapter/adapter.ts
      - cmdref://unit_test
      - fixture://policies/public_safe_no_external_side_effects
    current_state:
      execution: not_started
      source_contents: unknown
      validation_results: unknown
      peer_write_scope: repo://docs/telemetry_adapter.md
    acceptance_criteria:
      - Refactor is bounded to the telemetry adapter implementation scope.
      - Existing behavior is preserved unless an explicit, source-supported requirement establishes otherwise.
      - Relevant implementation validation is reported with actual status or explicitly marked unavailable.
      - The result packet identifies any operator-visible behavior or configuration implications for the documentation lane.
      - No unowned change is reverted.
    allowed_scope:
      read_paths_or_refs:
        - repo://src/telemetry_adapter/**
        - repo://docs/telemetry_adapter.md
      write_paths_or_read_only_status:
        write:
          - repo://src/telemetry_adapter/**
        read_only:
          - repo://docs/telemetry_adapter.md
      write_ownership: implementation_worker_only
      conflict_protocol_for_foreground_or_peer_edits: Stop editing the affected ref, preserve the observed state, and report the conflict to the manager.
      do_not_revert_others_changes: true
    constraints:
      - Do not infer requirements absent from supplied sources.
      - Do not edit the operator note.
      - Do not create workflow automation or public canon.
      - Do not expose forbidden content.
    side_effect_limits:
      external_services: forbidden
      messaging: forbidden
      registration_or_default_route_change: forbidden
      writes_outside_allowed_scope: forbidden
    subagent_policy:
      subagent_first_posture: required_for_substantive_lane_work
      allowed_purpose:
        - bounded source inspection
        - focused refactor analysis
        - small non-acceptance verification
      count_limit_or_no_hardcoded_count: no_hardcoded_count_but_scope_driven_bounded_and_reported
      recursive_fanout: bounded_and_reported_only
      named_no_subagent_exceptions:
        - lane_planning_and_worker_packet_authoring
        - small_deterministic_local_check
        - result_integration_or_summary
        - validator_status_or_git_command
        - manager_authorized_narrow_mechanical_edit
        - subagent_tool_unavailable_or_blocked
        - safe_minimal_packet_cannot_be_created_without_boundary_risk
    verification:
      required_refs:
        - cmdref://unit_test
      reporting_rule: Report only observed command and exit status; otherwise mark validation not run or unavailable.
      independent_acceptance: not_satisfied_by_this_worker
    output_shape:
      subagents_used_or_exception: required
      changed_or_inspected_refs: required
      commands_run_and_exit_status: required
      validators_or_gap: required
      blockers: required
      residual_risks: required
      next_action: required
      operator_visible_delta: required
    claim_ceiling: observed
    stop_conditions:
      - write_scope_overlap
      - conflicting_active_goal
      - unsafe_boundary
      - secret_required
      - substantive_direct_execution_without_named_exception
      - unbounded_subagent_fanout
      - material_requirement_ambiguity
      - unfixable_validator_failure_in_scope

  - packet_id: synthetic://packet/telemetry-documentation-v1
    title: Synthetic Telemetry Operator Note
    objective: Update the public telemetry adapter operator note to accurately reflect source-supported operator-facing behavior from the refactor.
    context_refs:
      - synthetic://handoff/telemetry_refactor/planned-v1
      - repo://docs/telemetry_adapter.md
      - repo://src/telemetry_adapter/**
      - cmdref://docs_lint
      - fixture://policies/public_safe_no_external_side_effects
    current_state:
      execution: not_started
      document_contents: unknown
      implementation_delta: pending
      validation_results: unknown
    acceptance_criteria:
      - Documentation remains bounded to repo://docs/telemetry_adapter.md.
      - Statements are supported by inspected source or the implementation worker’s compact result packet.
      - Unknown behavior, defaults, compatibility, or operational effects remain explicitly uncertain.
      - Documentation lint evidence is reported with actual status or marked unavailable.
      - No implementation files are modified.
    allowed_scope:
      read_paths_or_refs:
        - repo://docs/telemetry_adapter.md
        - repo://src/telemetry_adapter/**
        - synthetic://result/telemetry-implementation/pending
      write_paths_or_read_only_status:
        write:
          - repo://docs/telemetry_adapter.md
        read_only:
          - repo://src/telemetry_adapter/**
      write_ownership: documentation_worker_only
      conflict_protocol_for_foreground_or_peer_edits: Stop editing the affected ref, preserve the observed state, and report the conflict to the manager.
      do_not_revert_others_changes: true
    constraints:
      - Do not invent operator behavior, defaults, examples, compatibility claims, or validation results.
      - Do not edit implementation files.
      - Do not create workflow automation or public canon.
      - Do not expose forbidden content.
    side_effect_limits:
      external_services: forbidden
      messaging: forbidden
      registration_or_default_route_change: forbidden
      writes_outside_allowed_scope: forbidden
    subagent_policy:
      subagent_first_posture: required_for_substantive_lane_work
      allowed_purpose:
        - bounded source-to-document consistency analysis
        - focused documentation review
        - small non-acceptance verification
      count_limit_or_no_hardcoded_count: no_hardcoded_count_but_scope_driven_bounded_and_reported
      recursive_fanout: bounded_and_reported_only
      named_no_subagent_exceptions:
        - lane_planning_and_worker_packet_authoring
        - small_deterministic_local_check
        - result_integration_or_summary
        - validator_status_or_git_command
        - manager_authorized_narrow_mechanical_edit
        - subagent_tool_unavailable_or_blocked
        - safe_minimal_packet_cannot_be_created_without_boundary_risk
    verification:
      required_refs:
        - cmdref://docs_lint
      reporting_rule: Report only observed command and exit status; otherwise mark validation not run or unavailable.
      independent_acceptance: not_satisfied_by_this_worker
    output_shape:
      subagents_used_or_exception: required
      changed_or_inspected_refs: required
      commands_run_and_exit_status: required
      validators_or_gap: required
      blockers: required
      residual_risks: required
      next_action: required
      source_support_map: required
    claim_ceiling: source_supported
    stop_conditions:
      - implementation_delta_required_but_unavailable
      - write_scope_overlap
      - conflicting_active_goal
      - unsafe_boundary
      - secret_required
      - substantive_direct_execution_without_named_exception
      - unbounded_subagent_fanout
      - unsupported_operator_claim_required
      - unfixable_validator_failure_in_scope

verifier_packet:
  packet_id: synthetic://packet/telemetry-independent-acceptance-v1
  title: Synthetic Telemetry Refactor Independent Acceptance
  objective: Independently assess the integrated implementation and documentation candidate against the declared acceptance criteria using minimal evidence and actual candidate state when available.
  context_refs:
    - synthetic://handoff/telemetry_refactor/planned-v1
    - synthetic://result/telemetry-implementation/pending
    - synthetic://result/telemetry-documentation/pending
    - repo://src/telemetry_adapter/**
    - repo://docs/telemetry_adapter.md
    - cmdref://unit_test
    - cmdref://docs_lint
  current_state:
    candidate: pending
    worker_results: pending
    validator_evidence: pending
    acceptance_status: not_assessed
  independence_requirements:
    fresh_context: required
    non_implementer: required
    implementer_fork_or_continuation: forbidden
    manager_rollover_from_implementation_context: forbidden
    raw_transcript_input: forbidden
  acceptance_criteria:
    - Implementation and documentation changes stay within their assigned scopes.
    - The implementation result satisfies its packet criteria.
    - Operator-facing documentation agrees with source-supported behavior.
    - Unit-test and documentation-lint evidence is genuine, attributable, and complete enough for the asserted status.
    - No unowned change was reverted.
    - Residual risks and unsupported claims are explicitly identified.
  allowed_scope:
    read_paths_or_refs:
      - repo://src/telemetry_adapter/**
      - repo://docs/telemetry_adapter.md
      - synthetic://result/telemetry-implementation/pending
      - synthetic://result/telemetry-documentation/pending
      - cmdref://unit_test
      - cmdref://docs_lint
    write_paths_or_read_only_status: read_only
    write_ownership: none
    conflict_protocol_for_foreground_or_peer_edits: If candidate state changes during review, stop and request a stable evidence snapshot from the manager.
    do_not_revert_others_changes: true
  constraints:
    - Inspect actual candidate refs or status when available.
    - Use minimal evidence packets, not implementation transcripts.
    - Do not repair the candidate within the verifier lane.
    - Do not infer missing validator outcomes.
  side_effect_limits:
    file_mutation: forbidden
    external_services: forbidden
    messaging: forbidden
    registration_or_default_route_change: forbidden
  subagent_policy:
    subagent_first_posture: required_for_substantive_acceptance_review
    allowed_purpose:
      - bounded implementation review
      - bounded documentation consistency review
      - focused evidence completeness check
    count_limit_or_no_hardcoded_count: no_hardcoded_count_but_scope_driven_bounded_and_reported
    named_no_subagent_exceptions:
      - lane_planning_and_worker_packet_authoring
      - small_deterministic_local_check
      - result_integration_or_summary
      - validator_status_or_git_command
      - subagent_tool_unavailable_or_blocked
      - safe_minimal_packet_cannot_be_created_without_boundary_risk
  verification:
    required_evidence:
      - changed_refs
      - applicable acceptance criteria
      - reported validator commands and exit statuses
      - implementation and documentation result summaries
      - known risks and gaps
    verdict_values:
      - accept_with_supported_claim_ceiling
      - reject
      - blocked
      - insufficient_evidence
  output_shape:
    subagents_used_or_exception: required
    changed_or_inspected_refs: required
    commands_run_and_exit_status: required
    validators_or_gap: required
    criterion_by_criterion_findings: required
    independence_attestation: required
    blockers: required
    residual_risks: required
    next_action: required
    verdict: required
  claim_ceiling: validated_private
  stop_conditions:
    - candidate_or_worker_results_unavailable
    - independence_cannot_be_established
    - candidate_changes_during_review
    - unsafe_boundary
    - secret_required
    - substantive_direct_execution_without_named_exception
    - unbounded_subagent_fanout
    - required_validator_evidence_missing_for_requested_claim

integration_validation_and_closeout_plan:
  integration:
    - Accept only compact worker result packets matching the required output shapes.
    - Record actual worker titles and IDs only if creation later occurs.
    - Confirm changed refs remain inside declared non-overlapping write scopes.
    - Stop on overlap, conflicting edits, unexplained changes, or attempted reversion of unowned work.
    - Route the implementation worker’s operator-visible delta to the documentation lane.
    - Form a minimal integrated evidence packet for the fresh verifier.
  deterministic_validation:
    unit_test:
      ref: cmdref://unit_test
      expected_lane: implementation
      current_status: unknown_not_run
    docs_lint:
      ref: cmdref://docs_lint
      expected_lane: documentation
      current_status: unknown_not_run
    reporting_policy: No pass, failure, exit status, or coverage claim until actual evidence is supplied.
  boundary_review:
    checks:
      - changed refs are within active workspace scope
      - lane write ownership remained disjoint
      - no forbidden content entered packets
      - no external side effect occurred
      - no registration or default-route mutation was proposed
    current_status: planned_not_performed
  verifier_independence:
    required: true
    current_status: unavailable_not_created
    consequence: Acceptance, readiness, and validated-private claims remain blocked until fresh independent evidence exists.
  workflow_check:
    required: true
    packet_contents:
      - workflow_id and fixture_id
      - declared goal and boundaries
      - topology and routing decision
      - worker and verifier packet completeness
      - actual integration and validator evidence when available
      - verifier independence evidence
      - residual risks and stop-condition outcomes
      - registration and default-route posture
    checks:
      workflow_contract_conformance: pending
      packet_minimum_fields: pending
      boundary_posture: pending
      workflow_generator_provenance: unknown
      registration_surface: not_claimed
      default_route_safe: not_claimed
    strongest_supported_workflow_status: orchestration_plan_only
  conservative_closeout:
    current_status: open_not_executed
    claim_ceiling: canon_candidate
    supported_claims:
      - A public-safe orchestration decision and bounded synthetic packets are defined.
      - Candidate execution, thread creation, integration, validation, and independent acceptance remain pending.
    unsupported_claims:
      - worker_thread_created
      - candidate_implemented
      - commands_or_validators_run
      - independent_acceptance_obtained
      - production_ready
      - default_route_safe
      - registration_changed
      - owner_approved
    registration_decision: no_change_not_authorized
    default_route_decision: no_change_not_authorized
    party_binding_decision: no_change
    next_action: If execution is separately authorized, refresh the checkpoint, instantiate the two durable workers from these packets, record actual thread metadata, integrate their bounded results, and commission the fresh verifier.
