workflow_deliverable:
  schema_version: long_thread_handoff_deliverable_v1
  workflow_id: long_thread_handoff_v0
  fixture_id: public_synthetic_overnight_phase_boundary
  public_safe: true
  execution_status: planning_only

  declared_goal:
    final_goal: Finish the synthetic parser migration, validate its behavior, and document remaining compatibility risks.
    active_workspace_scope:
      - repo://src/demo_parser/**
      - repo://tests/demo_parser/**
      - repo://docs/demo_parser.md
    success_criteria:
      - Public parser interface remains unchanged.
      - Compatibility behavior, including empty records, is covered or explicitly recorded as unresolved.
      - Referenced validators pass before integration is accepted.
      - Remaining compatibility risks are documented without unsupported claims.
    stop_conditions:
      - conflicting_active_goal
      - unsafe_public_private_boundary
      - secret_or_credential_required
      - owner_decision_required
      - external_side_effect_not_authorized
      - validator_failure_unfixable_in_scope
      - required_fresh_subagent_unavailable_for_claim
      - exhausted_user_specified_budget
    boundary_constraints:
      policy_ref: fixture://policies/public_safe_local_only
      raw_transcript_excluded: true
      hidden_reasoning_excluded: true
      private_payload_excluded: true
      secrets_excluded: true
      host_local_absolute_paths_excluded: true
      external_side_effects_authorized: false
      handoff_is_context_not_authority: true
      subagent_reports_are_evidence_not_source_truth: true

  handoff_need_decision:
    required: true
    reason: Unresolved forward state must cross an overnight phase boundary under high context pressure.
    prior_checkpoint_ref: fixture://handoff/previous_parser_checkpoint
    action: conditionally_refresh_before_delegation_and_clear
    refresh_status: prepared_not_persisted

  night_work_handoff:
    final_goal: Finish the synthetic parser migration, validate its behavior, and document remaining compatibility risks.
    current_state: Implementation is partial; a compatibility edge case remains unvalidated.
    changed_or_inspected_files:
      status: unknown_not_inspected
      target_refs:
        - repo://src/demo_parser/reader.ts
        - repo://tests/demo_parser/reader.test.ts
        - repo://docs/demo_parser.md
      non_claim: No file contents, changes, or repository status are asserted.
    decisions_made:
      - Preserve the public parser interface.
    rejected_approaches:
      - approach: Replace the parser with an unrelated framework.
        disposition: rejected
        reason: Outside the declared migration scope.
    validation_results:
      status: not_run
      results: []
      planned_validator_refs:
        - cmdref://parser_unit_tests
        - cmdref://repository_validate
      non_claim: No validator outcome or runtime behavior is asserted.
    remaining_risks_or_blockers:
      - Compatibility behavior for empty records remains unvalidated.
      - Actual implementation and test state require status inspection.
      - Integration is blocked until fresh implementation review, independent verification, and referenced validators complete.
    next_actions:
      - Inspect current repository status and the bounded target refs.
      - Delegate implementation review and bounded repair.
      - Delegate independent verification after a candidate change set exists.
      - Integrate only after validator evidence is available.
      - Document confirmed residual compatibility risks.
    durable_user_instructions:
      - Do not execute delegated work as part of this deliverable.
      - Do not send an external notification.
      - Preserve explicit uncertainty and source/owner boundaries.
      - Do not claim production readiness, owner approval, default-route safety, or canon promotion.
    unknowns:
      - Whether the compatibility fixture covers empty records.
      - Whether target refs contain unowned changes.
      - Whether the referenced validators currently pass.
      - Whether additional compatibility cases exist beyond the supplied fixture.
    authority_note: This checkpoint preserves context only and grants no implementation, approval, notification, or canon authority.

  delegation_packet_set:
    execution_status: prepared_not_dispatched
    packets:
      - packet_id: synthetic_parser_implementation_review_v1
        freshness_requirement: fresh_subagent
        objective: Review the partial parser migration and make only bounded changes needed to preserve the public interface and address the empty-record compatibility case.
        context_refs:
          - fixture://handoff/previous_parser_checkpoint
          - repo://src/demo_parser/reader.ts
          - repo://tests/demo_parser/reader.test.ts
          - repo://docs/demo_parser.md
        current_state: Implementation is partial; empty-record compatibility is unvalidated.
        acceptance_criteria:
          - Public parser interface remains unchanged.
          - Empty-record behavior is covered by a focused test or reported as blocked with evidence.
          - Changes remain within assigned write ownership.
          - Referenced validators are attempted and outcomes are reported exactly.
        allowed_scope:
          read_paths_or_refs:
            - repo://src/demo_parser/**
            - repo://tests/demo_parser/**
            - repo://docs/demo_parser.md
          write_paths_or_read_only_status:
            mode: bounded_write
            write_refs:
              - repo://src/demo_parser/reader.ts
              - repo://tests/demo_parser/reader.test.ts
          write_ownership: Exclusive ownership of the two listed write refs for this packet; documentation remains read-only.
          do_not_revert_others_changes: true
        constraints:
          - Preserve the public parser interface.
          - Do not introduce an unrelated parser framework.
          - Do not infer source truth from the handoff.
          - Do not include raw transcripts, hidden reasoning, private payloads, secrets, or unneeded source dumps.
        side_effect_limits:
          external_side_effects: forbidden
          notification: forbidden
          writes_outside_owned_refs: forbidden
        verification:
          validator_refs:
            - cmdref://parser_unit_tests
            - cmdref://repository_validate
          requirement: Report each attempted validator and its exit status; do not invent missing results.
        output_shape:
          findings: required
          changed_or_inspected_refs: required
          commands_run_and_exit_status: required
          validators_or_gap: required
          blockers: required
          residual_risks: required
          next_action: required
        claim_ceiling: source_supported
        stop_conditions:
          - unsafe_public_private_boundary
          - secret_or_credential_required
          - owner_decision_required
          - unowned_change_conflict
          - required_change_outside_write_ownership
          - validator_failure_unfixable_in_scope

      - packet_id: synthetic_parser_independent_verification_v1
        freshness_requirement: fresh_independent_subagent
        objective: Independently assess the candidate parser migration against the declared acceptance criteria without modifying files.
        context_refs:
          - repo://src/demo_parser/reader.ts
          - repo://tests/demo_parser/reader.test.ts
          - repo://docs/demo_parser.md
          - cmdref://parser_unit_tests
          - cmdref://repository_validate
        current_state: Verification must begin only after a candidate change set is identified; no candidate result is asserted here.
        acceptance_criteria:
          - Public parser interface preservation is checked.
          - Empty-record compatibility evidence is checked.
          - Validator evidence is checked for completeness and exact outcomes.
          - Residual compatibility risks and evidence gaps are identified.
        allowed_scope:
          read_paths_or_refs:
            - repo://src/demo_parser/**
            - repo://tests/demo_parser/**
            - repo://docs/demo_parser.md
          write_paths_or_read_only_status:
            mode: read_only
          write_ownership: none
          do_not_revert_others_changes: true
        constraints:
          - Remain independent from implementation authorship.
          - Treat implementation reports as evidence, not source truth.
          - Do not repair files or expand scope.
          - Do not include raw transcripts, hidden reasoning, private payloads, secrets, or unneeded source dumps.
        side_effect_limits:
          repository_writes: forbidden
          external_side_effects: forbidden
          notification: forbidden
        verification:
          changed_refs:
            - repo://src/demo_parser/reader.ts
            - repo://tests/demo_parser/reader.test.ts
          validators:
            - cmdref://parser_unit_tests
            - cmdref://repository_validate
          claims_to_check:
            - The public parser interface is preserved.
            - Empty-record compatibility is covered.
            - Reported validator outcomes match available evidence.
          suspected_risk_areas:
            - Empty records
            - Interface compatibility
            - Uncovered legacy behavior
            - Documentation drift
        output_shape:
          findings: required
          changed_or_inspected_refs: required
          commands_run_and_exit_status: required
          validators_or_gap: required
          blockers: required
          residual_risks: required
          next_action: required
        claim_ceiling: source_supported
        stop_conditions:
          - candidate_change_set_unavailable
          - unsafe_public_private_boundary
          - secret_or_credential_required
          - owner_decision_required
          - verification_requires_write
          - validator_failure_unfixable_in_scope

  local_manager_tasks:
    - Compare fresh-subagent reports against their packet scopes and acceptance criteria.
    - Inspect actual status before accepting any implementation or verification claim.
    - Reject or isolate changes outside declared write ownership.
    - Preserve unowned changes.
    - Route unresolved owner decisions to a stop condition.
    - Keep documentation changes unassigned until implementation and verification evidence establish what may be stated.

  integration_and_status_plan:
    execution_status: not_executed
    sequence:
      - Inspect bounded repository status and target refs for actual state and ownership conflicts.
      - Confirm the implementation packet stayed within its two owned write refs.
      - Compare implementation findings with independent verification findings.
      - Resolve discrepancies conservatively; do not treat either report as source truth.
      - Run or evaluate evidence from cmdref://parser_unit_tests.
      - Run or evaluate evidence from cmdref://repository_validate.
      - Update repo://docs/demo_parser.md only with supported behavior and explicit residual risks.
      - Re-run applicable validators after any integration or documentation-affecting change.
    stale_memory_check:
      required: true
      basis: The supplied checkpoint may not represent later repository state.
      current_result: unknown_not_inspected
    integration_gate:
      allowed_only_if:
        - status inspection shows no unresolved ownership conflict
        - implementation acceptance criteria are supported
        - independent verification supplies adequate evidence
        - referenced validators pass
      otherwise: stop_or_continue_with_lower_claim_ceiling

  integration_validation_log:
    status: planned_not_run
    entries:
      - validator_ref: cmdref://parser_unit_tests
        result: unknown
        exit_status: not_available
      - validator_ref: cmdref://repository_validate
        result: unknown
        exit_status: not_available
    commands_run_and_exit_status: []
    claim_effect: Runtime, compatibility, and integration claims remain unvalidated.

  boundary_review_note:
    status: structurally_prepared
    public_safe_fixture_attestation: All supplied task state and refs are synthetic and public-safe.
    external_notification:
      authorized: false
      action: do_not_send
    prohibited_claims:
      - production_ready
      - owner_approved
      - default_route_safe
      - canon_promoted
    unresolved_boundary_risk: Actual future subagent outputs must be screened before integration or durable handoff inclusion.

  context_reset_decision:
    signal: high_at_phase_boundary
    decision: clear_to_fresh_session_after_checkpoint_persistence
    compact_decision: do_not_compact_as_primary_action
    reason: This is an overnight phase boundary with unresolved forward state; a fresh session is preferred once the checkpoint is durably available.
    handoff_refresh_decision: required_before_clear
    refreshed_handoff_status: prepared_not_persisted
    resume_instruction: Resume from the refreshed NIGHT_WORK_HANDOFF, then re-inspect actual repository status before delegation or integration.
    stop_if_checkpoint_unavailable: Preserve the current session or recreate the checkpoint; do not clear unresolved state without a durable checkpoint.

  closeout_report:
    status: blocked_pending_delegated_work_and_validation
    claim_ceiling: source_supported
    supported_claims:
      - The synthetic fixture describes partial implementation and an unvalidated compatibility edge case.
      - A conditional handoff and bounded delegation plan are defined.
      - No external notification is authorized.
    non_claims:
      - No delegated work has been executed.
      - No file, repository, command, validator, or runtime state has been inspected or verified.
      - No implementation, test, compatibility, or production-readiness result is asserted.
      - No owner approval, default-route change, canon promotion, or external notification is asserted.
    blockers:
      - Fresh implementation-review result is unavailable.
      - Fresh independent-verification result is unavailable.
      - Actual repository status is unknown.
      - Both referenced validator outcomes are unknown.
      - Empty-record compatibility remains unvalidated.
    next_action: Persist the refreshed synthetic checkpoint, clear to a fresh session, inspect actual bounded status, and dispatch the implementation-review packet; dispatch independent verification only after a candidate change set exists.
    knowledge_trigger_check:
      status: no_trigger_yet
      reason: No validated reusable compatibility finding or completed migration decision exists.
      reconsider_when:
        - validators establish reusable parser behavior
        - a compatibility risk is confirmed
        - a durable migration decision requires documentation
    notification_disposition: not_authorized_do_not_send
    final_disposition: continue_after_fresh_session_resume
