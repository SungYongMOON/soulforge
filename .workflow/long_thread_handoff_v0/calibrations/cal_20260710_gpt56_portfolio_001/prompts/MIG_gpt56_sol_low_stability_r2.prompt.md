You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: long_thread_handoff_v0
kind: workflow
status: active
title: Long Thread Handoff v0
summary: Public-safe orchestration workflow for long-running, overnight, or cross-session Soulforge work where the manager keeps context clean through conditional durable handoff checkpoints, fresh subagent delegation, autonomous compact/clear timing, validation, and conservative closeout.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - long_thread_goal
  - active_workspace_scope
  - boundary_policy_ref
optional_inputs:
  - prior_night_work_handoff_ref
  - active_goal_ref
  - target_file_refs
  - validation_command_refs
  - subagent_result_refs
  - context_pressure_signal
  - telegram_authorization_ref
  - owner_decision_refs
outputs:
  - night_work_handoff
  - delegation_packet_set
  - context_reset_decision
  - integration_validation_log
  - boundary_review_note
  - closeout_report
validation_level: structure_only_public_safe
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: operations
  primary_name_ko: 운영
  secondary:
    - project_management
    - review
    - knowledge_work
  secondary_name_ko:
    - 프로젝트관리
    - 리뷰
    - 지식작업
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: guild_master_cell
  bound_party_id: null
  binding_authority: none
constituent_workflows:
  required:
    - post_development_review_gate_v0
  optional:
    - workflow_knowledge_preflight_v0
    - knowledge_access_event_capture_v0
    - owner_decision_packet_v0
    - github_upload_publish_v0
skill_routes:
  - skill_id: soulforge-long-thread-handoff
    route_kind: local_runtime_bridge
    authority: installed_codex_skill_only
request_modes:
  - overnight_continuation
  - long_thread_handoff
  - cross_pc_continuity
  - phase_boundary_context_reset
  - compact_before_context_limit
  - subagent_manager_mode
  - closeout_checkpoint
long_thread_handoff_contract:
  owns:
    - goal_and_scope_declaration
    - night_work_handoff_shape
    - manager_context_hygiene_policy
    - subagent_delegation_packet_shape
    - autonomous_compact_clear_decision
    - integration_validation_route
    - conservative_claim_closeout
  does_not_own:
    - source_truth
    - private_payload_storage
    - secret_inspection
    - owner_decision_creation
    - external_notification_authorization
    - default_route_switching
    - production_ready_claim_without_b_v_evidence
    - upstream_workflow_output_mutation
    - public_canon_promotion_beyond_this_package
  checkpoint_required_fields:
    - final_goal
    - current_state
    - changed_or_inspected_files
    - decisions_made
    - rejected_approaches
    - validation_results
    - remaining_risks_or_blockers
    - next_actions
    - durable_user_instructions
    - unknowns
  subagent_delegation_default_policy:
    explicit_invocation_means_active_subagent_delegation: true
    substantive_material_work_uses_fresh_subagents_by_default: true
    same_thread_direct_work_requires_named_no_subagent_exception: true
    no_subagent_exceptions:
      - unclear_goal
      - trivial_status_or_preflight
      - small_deterministic_local_check
      - unavailable_subagent_tool_or_model
      - unsafe_minimal_packet_boundary
      - owner_decision_or_stop_condition
  autonomous_context_policy:
    refresh_handoff_when_forward_state_crosses_context_boundary: true
    clean_bounded_work_can_close_without_handoff: true
    compact_sparingly: true
    clear_at_phase_boundaries: true
    compact_requires_fresh_handoff_when_unresolved_forward_state_remains: true
    clear_requires_fresh_handoff_when_unresolved_forward_state_remains: true
    resume_after_clear_from_handoff_when_checkpoint_exists: true
    handoff_not_required_when_state_is_closed_by_git_validation_activity_or_open_threads: true
  boundary_rules:
    raw_transcript_excluded: true
    private_payload_excluded: true
    secrets_excluded: true
    local_runtime_paths_in_public_package: false
    handoff_is_context_not_authority: true
    subagent_reports_are_evidence_not_source_truth: true
  delegation_packet_minimum:
    required_for:
      - fresh_subagent_packet
      - verifier_or_review_subagent_packet
    fields:
      - objective
      - context_refs
      - current_state
      - acceptance_criteria
      - allowed_scope
      - constraints
      - side_effect_limits
      - verification
      - output_shape
      - claim_ceiling
      - stop_conditions
    claim_ceiling_values:
      - observed
      - source_supported
      - validated_private
      - canon_candidate
      - canon_entry
      - rejected_or_blocked
    allowed_scope_must_include:
      - read_paths_or_refs
      - write_paths_or_read_only_status
      - write_ownership
      - do_not_revert_others_changes
    output_shape_must_include:
      - findings
      - changed_or_inspected_refs
      - commands_run_and_exit_status
      - validators_or_gap
      - blockers
      - residual_risks
      - next_action
    verifier_packet_must_include:
      - changed_refs
      - acceptance_criteria
      - validators
      - claims_to_check
      - suspected_risk_areas
    forbidden_packet_contents:
      - raw_thread_transcript
      - hidden_reasoning
      - private_payload
      - secret_value
      - unneeded_source_dump
notes:
  - "Registration means the public-safe orchestration structure is available in .workflow/index.yaml."
  - "This package does not claim pilot execution, production readiness, default-route safety, or external notification authority."
  - "The installed Codex skill may act as a local runtime bridge, but local skill files are not public canon authority."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: long_thread_handoff_v0
kind: step_graph
status: active
steps:
  - step_id: intake_and_goal_bind
    title: Intake And Goal Bind
    actor_slot: handoff_manager
    action:
      kind: long_thread_goal_scope_binding
    inputs:
      - long_thread_goal
      - active_workspace_scope
      - boundary_policy_ref
    optional_inputs:
      - prior_night_work_handoff_ref
      - active_goal_ref
    outputs:
      - declared_goal
      - success_criteria
      - stop_conditions
      - boundary_constraints
    next:
      - checkpoint_need_and_refresh
  - step_id: checkpoint_need_and_refresh
    title: Checkpoint Need And Refresh
    actor_slot: checkpoint_curator
    action:
      kind: night_work_handoff_need_decision_and_conditional_update
    inputs:
      - declared_goal
      - boundary_constraints
    optional_inputs:
      - prior_night_work_handoff_ref
      - target_file_refs
      - validation_command_refs
      - owner_decision_refs
    outputs:
      - handoff_need_decision
      - night_work_handoff
      - no_handoff_reason
    rules:
      decide_need_before_delegation: true
      refresh_before_delegation_when_forward_state_must_cross_boundary: true
      refresh_before_compact_when_unresolved_forward_state_remains: true
      refresh_before_clear_when_unresolved_forward_state_remains: true
      clean_bounded_work_closed_by_git_validation_activity_needs_no_handoff: true
      raw_transcript_forbidden: true
      secrets_forbidden: true
      private_payload_forbidden: true
    next:
      - delegation_plan
  - step_id: delegation_plan
    title: Delegation Plan
    actor_slot: delegation_router
    action:
      kind: subagent_delegation_packet_preparation
    inputs:
      - handoff_need_decision
      - boundary_constraints
    optional_inputs:
      - night_work_handoff
      - no_handoff_reason
      - target_file_refs
      - validation_command_refs
    outputs:
      - delegation_packet_set
      - local_manager_tasks
    rules:
      explicit_invocation_requires_active_subagent_delegation: true
      substantive_material_work_uses_subagent_by_default: true
      no_subagent_exception_must_be_recorded: true
      fresh_subagents_are_default: true
      fork_context_preferred: false
      pass_only_bounded_context: true
      delegation_packet_minimum_required: true
      acceptance_criteria_named_or_unknown_recorded: true
      target_file_refs_required_for_file_edit: true
      validation_command_refs_named_or_gap_recorded: true
      result_packet_shape_required: true
      worker_write_ownership_required: true
      no_raw_source_dump: true
    next:
      - work_execution_or_integration
  - step_id: work_execution_or_integration
    title: Work Execution Or Integration
    actor_slot: integration_controller
    action:
      kind: delegated_work_integration_and_state_refresh
    inputs:
      - delegation_packet_set
    optional_inputs:
      - handoff_need_decision
      - night_work_handoff
      - no_handoff_reason
      - subagent_result_refs
      - target_file_refs
    outputs:
      - integrated_state_summary
      - changed_or_inspected_file_refs
      - stale_memory_check_note
    rules:
      inspect_actual_status_before_decision: true
      do_not_revert_unowned_changes: true
      failed_attempts_recorded_only_when_needed_to_avoid_retry: true
    next:
      - validation_and_boundary_check
  - step_id: validation_and_boundary_check
    title: Validation And Boundary Check
    actor_slot: validation_controller
    action:
      kind: deterministic_validation_and_boundary_review
    inputs:
      - integrated_state_summary
      - boundary_constraints
    optional_inputs:
      - validation_command_refs
      - owner_decision_refs
    outputs:
      - integration_validation_log
      - boundary_review_note
      - claim_ceiling
    rules:
      validators_before_narrative_claim: true
      partial_validation_lowers_claim_ceiling: true
      source_truth_not_created: true
    next:
      - context_reset_decision
  - step_id: context_reset_decision
    title: Context Reset Decision
    actor_slot: context_reset_controller
    action:
      kind: autonomous_compact_clear_decision
    inputs:
      - handoff_need_decision
      - integrated_state_summary
      - integration_validation_log
      - claim_ceiling
    optional_inputs:
      - night_work_handoff
      - no_handoff_reason
      - context_pressure_signal
    outputs:
      - context_reset_decision
      - handoff_refresh_decision
      - refreshed_night_work_handoff
      - no_handoff_reason
    rules:
      refresh_handoff_only_when_forward_state_must_survive_boundary: true
      compact_only_same_larger_goal_with_pressure_or_unit_boundary: true
      clear_or_fresh_session_at_phase_boundary: true
      resume_after_clear_from_handoff_when_checkpoint_exists: true
    next:
      - closeout_or_continue
  - step_id: closeout_or_continue
    title: Closeout Or Continue
    actor_slot: closeout_controller
    action:
      kind: conservative_closeout_and_next_action_routing
    inputs:
      - context_reset_decision
      - handoff_refresh_decision
      - claim_ceiling
    optional_inputs:
      - refreshed_night_work_handoff
      - no_handoff_reason
      - telegram_authorization_ref
      - owner_decision_refs
    outputs:
      - closeout_report
      - next_action
      - knowledge_trigger_check
    rules:
      telegram_requires_safe_authorized_mechanism: true
      blocked_when_owner_or_secret_needed: true
      knowledge_trigger_check_required: true
      no_production_ready_claim_without_b_v: true
    next: []
stop_conditions:
  - conflicting_active_goal
  - unsafe_public_private_boundary
  - secret_or_credential_required
  - owner_decision_required
  - external_side_effect_not_authorized
  - validator_failure_unfixable_in_scope
  - required_fresh_subagent_unavailable_for_claim
  - exhausted_user_specified_budget


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "long_thread_handoff_v0",
  "fixture_id": "public_synthetic_overnight_phase_boundary",
  "public_safe": true,
  "request": "Prepare a long-thread handoff, fresh-subagent delegation set, context-reset decision, and conservative closeout for unresolved work crossing an overnight phase boundary. Do not execute the delegated work or send a notification.",
  "inputs": {
    "long_thread_goal": "Finish a synthetic parser migration, validate its behavior, and document remaining compatibility risks.",
    "active_workspace_scope": [
      "repo://src/demo_parser/**",
      "repo://tests/demo_parser/**",
      "repo://docs/demo_parser.md"
    ],
    "boundary_policy_ref": "fixture://policies/public_safe_local_only",
    "prior_night_work_handoff_ref": "fixture://handoff/previous_parser_checkpoint",
    "target_file_refs": [
      "repo://src/demo_parser/reader.ts",
      "repo://tests/demo_parser/reader.test.ts",
      "repo://docs/demo_parser.md"
    ],
    "validation_command_refs": [
      "cmdref://parser_unit_tests",
      "cmdref://repository_validate"
    ],
    "context_pressure_signal": "high_at_phase_boundary",
    "telegram_authorization_ref": null,
    "owner_decision_refs": []
  },
  "forward_state": {
    "unresolved": true,
    "current_state": "Implementation is partial; a compatibility edge case remains unvalidated.",
    "decisions_made": [
      "Preserve the public parser interface."
    ],
    "rejected_approaches": [
      "Do not replace the parser with an unrelated framework."
    ],
    "unknowns": [
      "Whether the compatibility fixture covers empty records."
    ],
    "next_actions": [
      "delegate implementation review",
      "delegate independent verification",
      "integrate only after validators"
    ]
  },
  "requested_deliverable": [
    "conditional NIGHT_WORK_HANDOFF containing all required checkpoint fields",
    "bounded fresh-subagent packets with write ownership and result shapes",
    "integration/status inspection and validation plan",
    "compact/clear/resume decision",
    "closeout with claim ceiling, blockers, next action, and knowledge-trigger check"
  ],
  "prohibitions": [
    "no raw transcript, hidden reasoning, private payload, secret, host-local absolute path, invented validator result, or external notification",
    "no production-ready, owner-approval, default-route, or canon-promotion claim"
  ],
  "boundary_attestation": "All task state and refs are synthetic and public-safe."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
