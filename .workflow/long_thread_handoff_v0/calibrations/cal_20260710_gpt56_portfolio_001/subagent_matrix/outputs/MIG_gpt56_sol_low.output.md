schema_version: long_thread_handoff_deliverable_v1
workflow_id: long_thread_handoff_v0
fixture_id: public_synthetic_overnight_phase_boundary
public_safe: true

goal_and_scope:
  final_goal: "Finish the synthetic parser migration, validate its behavior, and document remaining compatibility risks."
  success_criteria:
    - "The public parser interface remains unchanged."
    - "The partial implementation receives a bounded implementation review."
    - "The empty-record compatibility edge case is addressed or explicitly documented as unresolved."
    - "Referenced parser unit and repository validators complete successfully before integration claims."
    - "Remaining compatibility risks are documented in repo://docs/demo_parser.md."
    - "Independent verification reviews the changed refs and stated claims."
  active_workspace_scope:
    - "repo://src/demo_parser/**"
    - "repo://tests/demo_parser/**"
    - "repo://docs/demo_parser.md"
  boundary_policy_ref: "fixture://policies/public_safe_local_only"
  boundary_constraints:
    public_safe_local_only: true
    raw_transcript_excluded: true
    hidden_reasoning_excluded: true
    private_payload_excluded: true
    secrets_excluded: true
    host_local_absolute_paths_excluded: true
    external_side_effects_authorized: false
    source_truth_not_created: true
    owner_decisions_not_created: true
    do_not_revert_unowned_changes: true
  stop_conditions:
    - "conflicting_active_goal"
    - "unsafe_public_private_boundary"
    - "secret_or_credential_required"
    - "owner_decision_required"
    - "external_side_effect_not_authorized"
    - "validator_failure_unfixable_in_scope"
    - "required_fresh_subagent_unavailable_for_claim"
    - "exhausted_user_specified_budget"

checkpoint_need_decision:
  handoff_required: true
  reason: "Unresolved forward state must cross an overnight phase boundary under high context pressure."
  prior_checkpoint_ref: "fixture://handoff/previous_parser_checkpoint"
  disposition_of_prior_checkpoint: "Reference only; freshness and contents remain unverified."

night_work_handoff:
  checkpoint_id: "fixture://handoff/public_synthetic_parser_overnight_v1"
  final_goal: "Finish the synthetic parser migration, validate its behavior, and document remaining compatibility risks."
  current_state: "Fixture-reported state: implementation is partial and a compatibility edge case remains unvalidated."
  changed_or_inspected_files:
    changed_files: []
    inspected_files: []
    target_refs_not_yet_inspected:
      - "repo://src/demo_parser/reader.ts"
      - "repo://tests/demo_parser/reader.test.ts"
      - "repo://docs/demo_parser.md"
    non_claim: "No file change or inspection is asserted."
  decisions_made:
    - "Preserve the public parser interface."
  rejected_approaches:
    - "Do not replace the parser with an unrelated framework."
  validation_results:
    status: "not_executed"
    results: []
    pending_command_refs:
      - "cmdref://parser_unit_tests"
      - "cmdref://repository_validate"
    non_claim: "No validator outcome is asserted."
  remaining_risks_or_blockers:
    - "The partial implementation has not received the requested review."
    - "The compatibility edge case remains unvalidated."
    - "Coverage of empty records is unknown."
    - "Independent verification has not occurred."
    - "Integration is blocked until delegated results and validator evidence are available."
  next_actions:
    - "Use a fresh implementation-review subagent with bounded write ownership."
    - "Inspect actual workspace status before accepting or integrating any result."
    - "Run the referenced validators after implementation work."
    - "Use a separate fresh verifier after candidate changes and validator evidence exist."
    - "Integrate only when acceptance criteria and boundaries are satisfied."
  durable_user_instructions:
    - "Do not execute delegated work as part of this deliverable."
    - "Do not send an external notification."
    - "Preserve explicit uncertainty and source/owner boundaries."
    - "Do not claim production readiness, owner approval, default-route safety, or canon promotion."
  unknowns:
    - "Whether the compatibility fixture covers empty records."
    - "Actual contents and status of the target refs."
    - "Whether the prior checkpoint remains current."
    - "Whether either referenced validator would pass."
    - "Whether implementation changes will require owner judgment."

delegation_packet_set:
  execution_status: "prepared_not_dispatched"

  packets:
    - packet_id: "fixture://delegation/parser_implementation_review_v1"
      worker_role: "fresh_implementation_reviewer"
      objective: "Review and, only where justified by the bounded evidence, complete the synthetic parser migration while preserving the public parser interface and addressing the empty-record compatibility risk."
      context_refs:
        - "fixture://handoff/public_synthetic_parser_overnight_v1"
        - "fixture://policies/public_safe_local_only"
      current_state: "Fixture-reported partial implementation with one unvalidated compatibility edge case."
      acceptance_criteria:
        - "Public parser interface remains unchanged."
        - "Relevant behavior for empty records is covered or reported as an unresolved gap."
        - "Changes remain within assigned write ownership."
        - "No unrelated framework replacement is introduced."
        - "The result identifies validators still required."
      allowed_scope:
        read_paths_or_refs:
          - "repo://src/demo_parser/**"
          - "repo://tests/demo_parser/**"
          - "repo://docs/demo_parser.md"
        write_paths_or_read_only_status:
          - "repo://src/demo_parser/reader.ts"
          - "repo://tests/demo_parser/reader.test.ts"
        write_ownership: "Exclusive candidate-write ownership for the two listed files during this bounded task; repo://docs/demo_parser.md is read-only."
        do_not_revert_others_changes: true
      constraints:
        - "Use only bounded public-safe context."
        - "Preserve the public parser interface."
        - "Do not replace the parser with an unrelated framework."
        - "Do not treat the handoff or fixture as source truth beyond its stated claims."
        - "Do not expand scope without an owner decision."
      side_effect_limits:
        external_side_effects: "forbidden"
        notification: "forbidden"
        writes_outside_owned_refs: "forbidden"
        canon_or_default_route_changes: "forbidden"
      verification:
        required_command_refs:
          - "cmdref://parser_unit_tests"
          - "cmdref://repository_validate"
        requirement: "Report each validator as completed with outcome or as an explicit gap; do not invent results."
      output_shape:
        findings: "Required."
        changed_or_inspected_refs: "Required, separating changed from inspected."
        commands_run_and_exit_status: "Required; use an empty list when none were executed."
        validators_or_gap: "Required."
        blockers: "Required."
        residual_risks: "Required."
        next_action: "Required."
      claim_ceiling: "canon_candidate"
      stop_conditions:
        - "Public interface preservation requires an unapproved breaking change."
        - "Required evidence lies outside allowed scope."
        - "Owner decision, secret, credential, or external side effect is required."
        - "Unowned changes would need to be reverted."
        - "A validator failure cannot be resolved within scope."

    - packet_id: "fixture://delegation/parser_independent_verification_v1"
      worker_role: "fresh_independent_verifier"
      objective: "Independently assess candidate parser changes, validator evidence, compatibility coverage, and documentation claims without modifying files."
      context_refs:
        - "fixture://handoff/public_synthetic_parser_overnight_v1"
        - "fixture://policies/public_safe_local_only"
        - "fixture://delegation/parser_implementation_review_v1"
      current_state: "Verification must wait for candidate changed refs and validator evidence."
      acceptance_criteria:
        - "Changed refs remain within implementation write ownership."
        - "The public parser interface is preserved."
        - "Empty-record behavior is covered or explicitly retained as a risk."
        - "Validator evidence supports every completion claim."
        - "Compatibility documentation does not exceed available evidence."
      allowed_scope:
        read_paths_or_refs:
          - "repo://src/demo_parser/**"
          - "repo://tests/demo_parser/**"
          - "repo://docs/demo_parser.md"
          - "cmdref://parser_unit_tests"
          - "cmdref://repository_validate"
        write_paths_or_read_only_status: "read_only"
        write_ownership: "none"
        do_not_revert_others_changes: true
      constraints:
        - "Remain independent from implementation authorship."
        - "Treat subagent reports as evidence, not source truth."
        - "Do not infer validator success from planned execution."
        - "Lower the claim ceiling when evidence is partial."
      side_effect_limits:
        all_writes: "forbidden"
        external_side_effects: "forbidden"
        notification: "forbidden"
        canon_or_default_route_changes: "forbidden"
      verification:
        changed_refs:
          - "Pending implementation result; must be supplied before verification."
        validators:
          - "cmdref://parser_unit_tests"
          - "cmdref://repository_validate"
        claims_to_check:
          - "The public parser interface is preserved."
          - "The migration behavior is supported by tests."
          - "Empty-record compatibility is covered or accurately documented."
          - "Remaining risks are stated conservatively."
        suspected_risk_areas:
          - "Empty-record behavior."
          - "Interface compatibility."
          - "Mismatch between implementation, tests, and documentation."
          - "Completion claims unsupported by validator evidence."
      output_shape:
        findings: "Required."
        changed_or_inspected_refs: "Required; changed refs should be empty for this read-only packet."
        commands_run_and_exit_status: "Required; use an empty list when none were executed."
        validators_or_gap: "Required."
        blockers: "Required."
        residual_risks: "Required."
        next_action: "Required."
      claim_ceiling: "validated_private"
      stop_conditions:
        - "Candidate changed refs or acceptance criteria are unavailable."
        - "Validator evidence is missing or ambiguous."
        - "Unsafe boundary content is encountered."
        - "Owner decision, secret, credential, or external side effect is required."

local_manager_tasks:
  - "Keep implementation and verification roles separate."
  - "Supply only bounded refs needed by each packet."
  - "Inspect actual status before integration."
  - "Reject results that omit required output fields."
  - "Route owner-dependent questions to a stop condition."

integration_and_status_plan:
  current_integration_status: "not_started"
  status_inspection:
    - "Compare actual changed refs against assigned write ownership."
    - "Identify unrelated or unowned changes without reverting them."
    - "Reconcile candidate state with the refreshed handoff."
    - "Record stale or contradicted checkpoint statements."
    - "Confirm that documentation changes, if proposed, are separately owned before writing."
  integration_gates:
    - "Implementation result packet is complete."
    - "Changed refs remain within scope and ownership."
    - "Acceptance criteria are addressed or gaps are explicit."
    - "Referenced validators have evidence-backed outcomes."
    - "Independent verification is complete."
    - "Boundary review finds no prohibited content or unauthorized side effect."
  integration_action: "Integrate only after all applicable gates pass; otherwise retain the candidate as blocked or incomplete."
  stale_memory_check_note: "Pending actual-status inspection; no consistency claim is made."

validation_and_boundary_plan:
  validation_status: "not_executed"
  ordered_checks:
    - check_id: "fixture://validation/parser_unit_tests"
      command_ref: "cmdref://parser_unit_tests"
      expected_evidence: "Recorded outcome and relevant failure details without invented success."
    - check_id: "fixture://validation/repository_validate"
      command_ref: "cmdref://repository_validate"
      expected_evidence: "Recorded outcome and relevant failure details without invented success."
    - check_id: "fixture://validation/independent_review"
      command_ref: null
      expected_evidence: "Fresh verifier packet covering changed refs, acceptance criteria, claims, and residual risks."
    - check_id: "fixture://validation/boundary_review"
      command_ref: null
      expected_evidence: "Confirmation that outputs exclude prohibited content and unauthorized claims."
  failure_routing:
    fixable_in_scope: "Return to the bounded implementation packet and revalidate."
    unfixable_in_scope: "Stop and report the blocker."
    owner_decision_required: "Stop without selecting an owner decision."
    unsafe_boundary: "Stop without propagating unsafe content."
  boundary_review_note:
    current_assessment: "The supplied fixture is attested public-safe, but future delegated outputs require a fresh boundary review."
    prohibited_claims:
      - "production_ready"
      - "owner_approved"
      - "default_route_safe"
      - "canon_promoted"
      - "notification_sent"

context_reset_decision:
  decision: "clear_and_resume_from_handoff"
  compact_decision: "do_not_compact_as_primary_action"
  rationale:
    - "Context pressure is high."
    - "The work is at an overnight phase boundary."
    - "Unresolved forward state must survive the boundary."
    - "A refreshed checkpoint is therefore required before clearing."
  handoff_refresh_decision: "refreshed_in_this_deliverable"
  resume_ref: "fixture://handoff/public_synthetic_parser_overnight_v1"
  resume_requirements:
    - "Bind the resumed work to the same synthetic goal and scope."
    - "Recheck actual status instead of assuming checkpoint freshness."
    - "Dispatch the implementation packet before the verifier packet."
    - "Do not integrate before validator evidence and independent review."
  non_claim: "No context reset or resume action is asserted."

closeout_report:
  status: "checkpoint_prepared_work_unexecuted"
  claim_ceiling: "source_supported"
  supported_claims:
    - "The fixture reports partial implementation and an unvalidated compatibility edge case."
    - "A handoff is required because unresolved state crosses an overnight phase boundary."
    - "Bounded delegation, validation, context-reset, and continuation structures are defined."
  unsupported_claims:
    - "The migration is complete."
    - "Any target file was inspected or changed."
    - "Any validator passed or failed."
    - "Independent verification occurred."
    - "The work is production-ready or owner-approved."
    - "Any external notification was sent."
  blockers:
    - "Delegated implementation review was intentionally not executed."
    - "Independent verification lacks candidate changed refs and validator evidence."
    - "Validator outcomes are unknown."
    - "Empty-record compatibility coverage remains unknown."
    - "External notification is unauthorized."
  next_action: "Resume from fixture://handoff/public_synthetic_parser_overnight_v1, inspect actual status, then dispatch the bounded implementation-review packet; proceed to validation and fresh independent verification before integration."
  notification:
    requested: false
    authorized: false
    sent: false
    disposition: "No notification action."
  knowledge_trigger_check:
    status: "not_triggered"
    rationale: "No validated reusable finding, accepted compatibility rule, or completed migration outcome exists yet."
    reconsider_when:
      - "A compatibility behavior is validated."
      - "A reusable migration constraint is source-supported."
      - "Owner-authorized knowledge capture criteria are met."
  residual_risks:
    - "The checkpoint may become stale before resume."
    - "Implementation, tests, and documentation may diverge."
    - "Partial validation would require a lower completion claim."
    - "An owner decision may become necessary if compatibility and interface preservation conflict."
