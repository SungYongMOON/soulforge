deliverable:
  workflow_id: long_thread_handoff_v0
  fixture_id: public_synthetic_overnight_phase_boundary
  public_safe: true

  declared_goal:
    final_goal: Finish a synthetic parser migration, validate its behavior, and document remaining compatibility risks.
    active_workspace_scope:
      - repo://src/demo_parser/**
      - repo://tests/demo_parser/**
      - repo://docs/demo_parser.md
    success_criteria:
      - Synthetic parser migration status is brought to an integration-ready checkpoint.
      - Behavior validation is attempted through the named synthetic validator refs.
      - Remaining compatibility risks are documented without overstating certainty.
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
      - public-safe only
      - local-only refs
      - no raw transcript
      - no hidden reasoning
      - no private payload
      - no secrets
      - no host-local absolute paths
      - no invented validator result
      - no external notification
      - no production-ready, owner-approval, default-route, or canon-promotion claim

  handoff_need_decision:
    decision: handoff_required
    reason: Unresolved forward state must cross an overnight phase boundary and context pressure is high at a phase boundary.
    no_handoff_reason: null

  night_work_handoff:
    final_goal: Finish a synthetic parser migration, validate its behavior, and document remaining compatibility risks.
    current_state: Implementation is partial; a compatibility edge case remains unvalidated.
    changed_or_inspected_files:
      - repo://src/demo_parser/reader.ts
      - repo://tests/demo_parser/reader.test.ts
      - repo://docs/demo_parser.md
      - fixture://handoff/previous_parser_checkpoint
    decisions_made:
      - Preserve the public parser interface.
    rejected_approaches:
      - Do not replace the parser with an unrelated framework.
    validation_results:
      - No validator outcome is claimed in this package.
      - Planned validator refs are `cmdref://parser_unit_tests` and `cmdref://repository_validate`.
      - Validation status remains pending until delegated work and integration are completed.
    remaining_risks_or_blockers:
      - A compatibility edge case remains unvalidated.
      - Coverage status for empty records is unknown.
      - Integration must not advance claim strength beyond pending validation evidence.
    next_actions:
      - delegate implementation review
      - delegate independent verification
      - integrate only after validators
    durable_user_instructions:
      - Prepare a long-thread handoff, fresh-subagent delegation set, context-reset decision, and conservative closeout.
      - Do not execute delegated work.
      - Do not send a notification.
      - Preserve uncertainty, source/owner boundaries, stop conditions, and non-claims.
    unknowns:
      - Whether the compatibility fixture covers empty records.

  delegation_packet_set:
    packets:
      - packet_id: synthetic_impl_review_packet
        role: fresh_subagent_packet
        objective: Review the partial synthetic parser migration and prepare bounded implementation updates that preserve the public parser interface.
        context_refs:
          - fixture://handoff/previous_parser_checkpoint
          - repo://src/demo_parser/reader.ts
          - repo://tests/demo_parser/reader.test.ts
          - repo://docs/demo_parser.md
        current_state: Implementation is partial; a compatibility edge case remains unvalidated.
        acceptance_criteria:
          - Proposed or applied changes stay within the declared workspace scope.
          - Public parser interface remains preserved.
          - Any implementation change is paired with test or documentation impact notes.
          - Unknown coverage for empty records is either addressed or explicitly left as a blocker.
        allowed_scope:
          read_paths_or_refs:
            - repo://src/demo_parser/**
            - repo://tests/demo_parser/**
            - repo://docs/demo_parser.md
            - fixture://handoff/previous_parser_checkpoint
          write_paths_or_read_only_status:
            - repo://src/demo_parser/reader.ts: writable
            - repo://tests/demo_parser/reader.test.ts: writable
            - repo://docs/demo_parser.md: writable
          write_ownership:
            - worker may modify only the three target file refs named above
          do_not_revert_others_changes: true
        constraints:
          - no raw transcript
          - no hidden reasoning
          - no private payload
          - no secrets
          - no unrelated framework replacement
          - no claims beyond observed or source-supported work product
        side_effect_limits:
          - no external notification
          - no external service mutation
          - no scope expansion beyond declared workspace refs
        verification:
          validators:
            - cmdref://parser_unit_tests
          gap_rule: If validator execution is unavailable, record the gap and lower claim strength.
        output_shape:
          findings: required
          changed_or_inspected_refs: required
          commands_run_and_exit_status: required
          validators_or_gap: required
          blockers: required
          residual_risks: required
          next_action: required
        claim_ceiling: observed
        stop_conditions:
          - owner_decision_required
          - validator_failure_unfixable_in_scope
          - unsafe_public_private_boundary
          - required_fresh_subagent_unavailable_for_claim

      - packet_id: synthetic_verification_packet
        role: verifier_or_review_subagent_packet
        objective: Independently verify parser behavior and compatibility-risk framing after implementation review output is available.
        context_refs:
          - repo://src/demo_parser/reader.ts
          - repo://tests/demo_parser/reader.test.ts
          - repo://docs/demo_parser.md
          - cmdref://parser_unit_tests
          - cmdref://repository_validate
        current_state: Independent verification is pending; no validator outcome is claimed yet.
        acceptance_criteria:
          - Claims are checked against available file state and named validator refs only.
          - Compatibility-risk statements do not exceed available evidence.
          - Empty-record coverage status is explicitly confirmed or remains flagged unknown.
        allowed_scope:
          read_paths_or_refs:
            - repo://src/demo_parser/**
            - repo://tests/demo_parser/**
            - repo://docs/demo_parser.md
            - cmdref://parser_unit_tests
            - cmdref://repository_validate
          write_paths_or_read_only_status:
            - read_only
          write_ownership:
            - none
          do_not_revert_others_changes: true
        constraints:
          - verification only
          - no file edits
          - no invented validator result
          - no source-truth creation
        side_effect_limits:
          - no external notification
          - no external service mutation
        verification:
          validators:
            - cmdref://parser_unit_tests
            - cmdref://repository_validate
          claims_to_check:
            - public parser interface preserved
            - compatibility edge case status
            - documentation alignment with observed behavior
          suspected_risk_areas:
            - empty records
            - behavior drift under preserved public interface
            - documentation overstating compatibility
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
          - validator_failure_unfixable_in_scope
          - unsafe_public_private_boundary
          - owner_decision_required

    local_manager_tasks:
      - Wait for fresh subagent outputs before integration.
      - Compare implementation and verifier outputs for stale-memory or mismatch risk.
      - Integrate only bounded findings supported by returned evidence.
      - Preserve unresolved uncertainty in the refreshed handoff if work remains open.

  work_execution_or_integration_plan:
    integrated_state_summary: Pending delegated implementation review and independent verification; current known state remains partial implementation with one unvalidated compatibility edge case.
    changed_or_inspected_file_refs:
      - repo://src/demo_parser/reader.ts
      - repo://tests/demo_parser/reader.test.ts
      - repo://docs/demo_parser.md
    stale_memory_check_note: Before any integration narrative, compare returned subagent evidence against the current synthetic refs and reject unsupported carryover assumptions from the prior checkpoint.
    integration_rules:
      - inspect actual returned status before decision
      - do not revert unowned changes
      - record failed attempts only when needed to avoid retry
      - do not treat subagent report as source truth by itself

  integration_validation_log:
    validation_plan:
      - Run or otherwise obtain result packets against `cmdref://parser_unit_tests`.
      - Run or otherwise obtain result packets against `cmdref://repository_validate`.
      - Compare validator evidence to implementation and documentation claims.
      - If either validator is unavailable or incomplete, record gap and lower claim ceiling.
    validation_status: pending
    claimed_results:
      - No validator result is claimed in this deliverable.
    partial_validation_effect:
      - Any missing validator outcome lowers claim ceiling and blocks stronger closeout claims.

  boundary_review_note:
    status: pass_with_open_limits
    notes:
      - Package remains public-safe and synthetic by reference.
      - No raw transcript, private payload, secret, or host-local absolute path is included.
      - Handoff is context only, not authority.
      - Subagent reports are evidence, not source truth.
      - External notification is not authorized and is excluded from next actions.

  claim_ceiling: rejected_or_blocked_until_validation_evidence_then_source_supported_at_most

  context_reset_decision:
    decision: clear_after_handoff_refresh
    handoff_refresh_decision: refresh_required
    rationale:
      - An overnight phase boundary is explicit.
      - Context pressure is high at phase boundary.
      - Unresolved forward state must survive across sessions.
      - A fresh checkpoint now supports safe resume after clear.
    refreshed_night_work_handoff: same_as_night_work_handoff
    no_handoff_reason: null
    resume_rule:
      - Resume from the refreshed handoff and delegated result packets, not from unstated thread memory.

  closeout_report:
    status: open_checkpoint_prepared
    summary: Public-safe handoff, bounded fresh-subagent delegation, validation plan, and clear-after-refresh decision are prepared for unresolved synthetic parser migration work.
    blockers:
      - Compatibility edge case remains unvalidated.
      - Empty-record coverage remains unknown unless later evidence resolves it.
      - No validator evidence is present in this deliverable.
    next_action:
      - Dispatch `synthetic_impl_review_packet`.
      - Dispatch `synthetic_verification_packet` after implementation output is available or against current read-only state if appropriate.
      - Integrate only evidence-backed findings.
      - Refresh handoff again only if unresolved forward state remains after the next phase boundary.
    knowledge_trigger_check:
      decision: not_triggered_by_default
      reason: The fixture requires orchestration closeout only; no separate knowledge-capture action is justified without new stable evidence.
    notification:
      telegram: not_authorized_and_not_sent
    non_claims:
      - No delegated work execution is claimed.
      - No notification is claimed.
      - No production-ready claim is made.
      - No owner approval is claimed.
      - No default-route safety claim is made.
      - No canon-promotion claim is made.
