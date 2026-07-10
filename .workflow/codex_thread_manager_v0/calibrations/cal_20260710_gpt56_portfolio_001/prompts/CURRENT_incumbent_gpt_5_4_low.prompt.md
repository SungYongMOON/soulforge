You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.4; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: codex_thread_manager_v0
kind: workflow
status: active
title: Codex Thread Manager v0
summary: Public-safe workflow for making the declared Codex thread the main team lead that manages context lifecycle and coordinates subagent-first role worker, worktree worker, and rollover manager threads while preserving NIGHT_WORK_HANDOFF continuity, explicit thread titles, bounded worker scopes, fresh-context verifier/judge independence, and conservative claim boundaries.
entrypoint: run
execution_mode: codex_app_thread_orchestration_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - soulforge_task_goal
  - active_workspace_scope
  - boundary_policy_ref
  - thread_orchestration_request
optional_inputs:
  - prior_night_work_handoff_ref
  - active_goal_ref
  - manager_thread_ref
  - active_worker_thread_refs
  - target_file_refs
  - validation_command_refs
  - owner_decision_refs
  - context_pressure_signal
outputs:
  - declared_thread_goal
  - night_work_handoff
  - thread_team_topology
  - delegation_routing_decision
  - continuation_surface_decision
  - manager_rollover_packet
  - worker_thread_packet_set
  - worker_result_summary_set
  - integration_validation_log
  - boundary_review_note
  - workflow_check_review_packet
  - verifier_independence_note
  - closeout_report
validation_level: private_one_worker_pilot_observed
registration_policy: owner_requested_registration
output_state: registered
classification_lane:
  primary: operations
  primary_name_ko: 운영
  secondary:
    - project_management
    - workflow_authoring
    - review_governance
  secondary_name_ko:
    - 프로젝트 관리
    - 워크플로우 작성
    - 리뷰/거버넌스
  purpose: discovery_only
  authority: none
execution_binding:
  party_required: false
  candidate_party_id: guild_master_cell
  bound_party_id: null
  binding_authority: none
  notes:
    - Party binding is advisory only.
    - Create a party only when this workflow must chain with multiple other workflows under a reusable service surface.
skill_routes:
  - skill_id: soulforge-codex-thread-manager
    route_kind: local_runtime_bridge
    authority: installed_codex_skill_only
registry_skill_ref: .registry/skills/codex_thread_manager/skill.yaml
request_modes:
  - codex_thread_management
  - explicit_skill_invocation_manager_worker
  - manager_worker_thread_orchestration
  - manager_rollover
  - worktree_worker_isolation
  - read_only_worker_pilot
  - bounded_thread_fanout
codex_thread_manager_contract:
  owns:
    - explicit_skill_invocation_as_thread_orchestration_request
    - declared_thread_main_team_lead_activation
    - thread_goal_and_scope_binding
    - long_thread_context_lifecycle_policy
    - night_work_handoff_refresh_before_thread_creation
    - subagent_vs_thread_routing_policy
    - continuation_surface_selection
    - manager_lifecycle_and_rollover_policy
    - role_worker_thread_topology
    - worker_thread_packet_shape
    - worker_subagent_permission_policy
    - worker_no_subagent_exception_policy
    - fresh_verifier_judge_independence_policy
    - inter_thread_result_routing_policy
    - worktree_worker_boundary_policy
    - worker_result_integration_policy
    - thread_id_title_recording_policy
    - workflow_check_review_policy
    - conservative_thread_closeout
  does_not_own:
    - source_truth
    - owner_approval
    - private_payload_storage
    - raw_transcript_storage
    - secret_inspection
    - codex_product_capability_guarantee
    - unbounded_or_unreported_recursive_fanout
    - default_route_switching
    - public_canon_promotion_beyond_this_package
    - production_ready_claim_without_b_v_evidence
  surface_selection:
    manager_thread_plus_role_workers: default_for_substantial_actionable_skill_invocation_when_thread_tools_are_available
    current_thread_manager_plus_worker: minimum_thread_topology_for_actionable_skill_invocation
    same_thread: trivial_preflight_unclear_goal_or_thread_tool_blocked
    fresh_manager_thread: rollover_due_or_mission_boundary_changed
    worker_thread: durable_lane_needs_title_followup_or_independent_history
    worktree_worker_thread: file_mutation_requires_checkout_isolation
    fresh_verifier_or_judge: independent_acceptance_or_readiness_review_needed
    subagent: non_durable_bounded_side_work_integrated_immediately
  routing_policy:
    use_subagent_for:
      - focused_investigation
      - noisy_search
      - small_non_acceptance_verification
      - parallel_analysis_integrated_immediately
    use_worker_thread_for:
      - durable_history_or_thread_id_needed
      - followup_or_overnight_continuity_needed
      - separate_phase_lane
      - long_running_task
      - manager_integration_after_independent_execution
      - role_lane_research_synthesis_verification_coding_or_documentation
    use_fresh_verifier_or_judge_for:
      - independent_review
      - acceptance_judgment
      - workflow_check_review
      - readiness_or_approval_claim
      - adversarial_or_regression_review
    use_worktree_worker_thread_for:
      - file_mutation_with_overlapping_write_scope
      - checkout_isolation_needed
    use_fresh_manager_thread_for:
      - rollover
      - cross_pc_or_overnight_continuity_transfer
      - mission_boundary_change
      - context_drift
      - twenty_four_hour_span
      - explicit_user_request
  manager_lifecycle:
    declared_thread_is_main_team_lead: true
    manager_owns_context_lifecycle: true
    explicit_invocation_creates_worker_by_default_when_actionable: true
    fresh_manager_is_not_default_launcher_behavior: true
    fork_rollover_and_continuation_are_same_role_continuity_not_independence: true
    keep_manager_across_worker_phase_changes: true
    rollover_before_overnight_cross_pc_or_24h_span: true
    clear_requires_checkpoint_and_accepted_handoff: true
    worker_threads_are_not_cleared_for_reuse: true
  context_lifecycle:
    night_work_handoff_is_team_continuity_object: true
    refresh_before_worker_creation_compact_clear_rollover_or_phase_closeout: true
    compact_same_goal_when_context_pressure_drift_or_unit_boundary_justifies: true
    clear_or_fresh_session_at_phase_boundary_when_old_context_distracts: true
    re_anchor_long_phases_with_goal_state_blockers_workers_and_next_action: true
    raw_transcripts_private_payloads_source_dumps_and_secrets_forbidden: true
  role_worker_threads:
    examples:
      - research_thread
      - synthesis_thread
      - verification_thread
      - coding_thread
      - documentation_thread
    manager_records_ids_titles_and_scope: true
    manager_may_route_result_packets_between_workers: true
    peer_review_between_workers_allowed_only_with_fresh_non_implementer_reviewer: true
  worker_policy:
    one_lane_per_worker: true
    worker_thread_id_and_title_must_be_recorded: true
    worker_is_lane_controller_not_primary_doer_by_default: true
    substantive_lane_work_is_subagent_first: true
    subagent_use_allowed_by_default_when_bounded: true
    worker_thread_may_spawn_subagents_within_packet_scope: true
    subagent_count_is_scope_driven_not_fixed: true
    manager_packet_may_set_subagent_limit: true
    worker_packet_must_state_subagent_first_posture_bounds_or_denial: true
    no_subagent_exception_must_be_recorded: true
    no_subagent_exceptions:
      - lane_planning_and_worker_packet_authoring
      - small_deterministic_local_check
      - result_integration_or_summary
      - validator_status_or_git_command
      - manager_authorized_narrow_mechanical_edit
      - subagent_tool_unavailable_or_blocked
      - safe_minimal_packet_cannot_be_created_without_boundary_risk
    recursive_subagent_fanout_allowed_when_bounded_and_reported: true
    worker_thread_automation_or_canon_creation_requires_manager_permission: true
    overlapping_write_scope_requires_worktree_or_stop: true
    delegation_packet_minimum:
      required_for:
        - role_worker_thread_packet
        - worktree_worker_thread_packet
        - worker_created_subagent_packet
        - verifier_or_judge_packet
      fields:
        - title_or_packet_id
        - objective
        - context_refs
        - current_state
        - acceptance_criteria
        - allowed_scope
        - constraints
        - side_effect_limits
        - subagent_policy
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
        - conflict_protocol_for_foreground_or_peer_edits
        - do_not_revert_others_changes
      subagent_policy_must_include:
        - subagent_first_posture
        - allowed_purpose
        - count_limit_or_no_hardcoded_count
        - named_no_subagent_exceptions
      output_shape_must_include:
        - subagents_used_or_exception
        - changed_or_inspected_refs
        - commands_run_and_exit_status
        - validators_or_gap
        - blockers
        - residual_risks
        - next_action
      forbidden_packet_contents:
        - raw_thread_transcript
        - hidden_reasoning
        - private_payload
        - secret_value
        - unneeded_source_dump
  verifier_judge_policy:
    implementer_self_check_is_not_independent_verification: true
    independent_verifier_must_be_fresh_context: true
    verifier_or_judge_must_not_be_fork_of_implementer: true
    verifier_or_judge_must_not_be_manager_rollover_from_implementation_context: true
    verifier_packet_uses_minimal_evidence_not_raw_transcript: true
    verifier_packet_includes_objective_changed_refs_acceptance_criteria_validators_claims_and_risks: true
    verifier_inspects_actual_files_or_status_when_available: true
    unavailable_fresh_verifier_lowers_claim_ceiling_or_blocks_stronger_claim: true
  observed_private_pilot_refs:
    - _workmeta/system/reports/post_development_review/20260608_thread_orchestrator_live_pilot_one_worker.yaml
non_claims:
  - no_default_route_safety_claim
  - no_production_ready_claim
  - no_full_rollover_execution_claim
  - no_worktree_worker_execution_claim
  - no_party_binding_claim
notes:
  - "Registration means the public-safe orchestration structure is available in `.workflow/index.yaml`."
  - "The local Codex skill may act as a runtime bridge, but local skill files are not public canon authority."
  - "This package does not claim production readiness, default-route safety, full manager rollover execution, or worktree worker execution."


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: codex_thread_manager_v0
kind: step_graph
status: active
steps:
  - step_id: intake_and_goal_bind
    title: Intake And Goal Bind
    actor_slot: thread_manager
    action:
      kind: codex_thread_goal_scope_binding
    inputs:
      - soulforge_task_goal
      - active_workspace_scope
      - boundary_policy_ref
      - thread_orchestration_request
    optional_inputs:
      - active_goal_ref
      - owner_decision_refs
    outputs:
      - declared_thread_goal
      - success_criteria
      - stop_conditions
      - boundary_constraints
      - manager_activation_decision
      - context_lifecycle_plan
    next:
      - checkpoint_refresh
  - step_id: checkpoint_refresh
    title: Checkpoint Refresh
    actor_slot: checkpoint_curator
    action:
      kind: night_work_handoff_update
    inputs:
      - declared_thread_goal
      - boundary_constraints
    optional_inputs:
      - prior_night_work_handoff_ref
      - active_worker_thread_refs
      - target_file_refs
      - validation_command_refs
    outputs:
      - night_work_handoff
      - compact_clear_or_rollover_checkpoint
    rules:
      required_before_thread_creation: true
      required_before_manager_rollover: true
      required_before_compact_or_clear: true
      raw_transcript_forbidden: true
      private_payload_forbidden: true
      secrets_forbidden: true
    next:
      - continuation_surface_decision
  - step_id: continuation_surface_decision
    title: Continuation Surface Decision
    actor_slot: surface_router
    action:
      kind: same_thread_manager_worker_worktree_or_subagent_selection
    inputs:
      - night_work_handoff
      - boundary_constraints
    optional_inputs:
      - manager_thread_ref
      - active_worker_thread_refs
      - context_pressure_signal
      - target_file_refs
    outputs:
      - thread_team_topology
      - continuation_surface_decision
      - delegation_routing_decision
      - manager_lifecycle_action
      - worker_lane_plan
    rules:
      subagent_for_non_durable_side_work: true
      worker_thread_for_durable_lane: true
      explicit_skill_invocation_defaults_to_manager_thread_plus_role_workers: true
      fresh_manager_not_default_for_launcher_invocation: true
      same_thread_only_for_trivial_preflight_unclear_goal_or_blocked_tools: true
      worker_phase_change_does_not_clear_manager: true
      manager_rollover_before_24h_or_cross_pc: true
      manager_routes_result_packets_between_workers_when_useful: true
      worktree_required_for_overlapping_file_mutation: true
      fork_rollover_and_continuation_are_same_role_continuity_not_independence: true
      fresh_verifier_or_judge_for_acceptance_and_readiness_claims: true
      subagent_not_durable_lane: true
    next:
      - manager_rollover_or_worker_packet
  - step_id: manager_rollover_or_worker_packet
    title: Manager Rollover Or Worker Packet
    actor_slot: worker_packet_author
    action:
      kind: manager_acceptance_or_worker_thread_packet_preparation
    inputs:
      - continuation_surface_decision
      - night_work_handoff
      - worker_lane_plan
    optional_inputs:
      - active_worker_thread_refs
      - target_file_refs
      - validation_command_refs
    outputs:
      - manager_rollover_packet
      - worker_thread_packet_set
    rules:
      fresh_manager_prompt_self_contained: true
      worker_prompt_names_title_and_scope: true
      worker_prompt_subagent_first_for_substantive_lane_work: true
      worker_subagents_allowed_when_bounded_unless_packet_denies: true
      worker_thread_may_spawn_subagents_inside_assigned_lane: true
      worker_subagent_count_is_scope_driven_unless_manager_sets_limit: true
      worker_subagent_first_bounds_or_denial_must_be_written_in_packet: true
      no_subagent_exception_must_be_named_when_worker_does_substantive_work_directly: true
      delegation_packet_minimum_required: true
      worker_prompt_names_context_refs_current_state_acceptance_criteria_allowed_scope_and_side_effect_limits: true
      worker_result_packet_shape_required: true
      verifier_packet_must_be_fresh_context_minimal_evidence: true
      verifier_or_judge_must_not_be_fork_or_continuation_of_implementer: true
      implementer_self_check_not_independent_verification: true
      verifier_inspects_actual_files_or_status_when_available: true
      worker_prompt_includes_handoff_context_and_compact_report_shape: true
      recursive_subagent_fanout_requires_bounds_and_reporting: true
      nested_worker_thread_automation_or_canon_creation_requires_manager_permission: true
      worker_id_title_recording_required: true
    next:
      - worker_execution_or_rollover_acceptance
  - step_id: worker_execution_or_rollover_acceptance
    title: Worker Execution Or Rollover Acceptance
    actor_slot: manager_rollover_controller
    action:
      kind: thread_creation_observation_and_acceptance_gate
    inputs:
      - manager_rollover_packet
      - worker_thread_packet_set
    optional_inputs:
      - manager_thread_ref
      - active_worker_thread_refs
    outputs:
      - thread_creation_log
      - manager_acceptance_report
      - worker_result_summary_set
      - verifier_independence_note
    rules:
      create_worker_thread_after_actionable_skill_invocation_when_available: true
      old_manager_checks_new_manager_acceptance: true
      new_manager_must_reinvoke_runtime_skill_or_read_bridge: true
      worker_thread_id_title_recorded_by_manager: true
      worker_direct_substantive_execution_requires_recorded_no_subagent_exception: true
      acceptance_verifier_created_fresh_or_claim_lowered: true
      files_not_modified_in_read_only_pilot: true
    next:
      - integration_and_validation
  - step_id: integration_and_validation
    title: Integration And Validation
    actor_slot: integration_controller
    action:
      kind: worker_result_integration_and_state_validation
    inputs:
      - thread_creation_log
      - worker_result_summary_set
      - boundary_constraints
    optional_inputs:
      - target_file_refs
      - validation_command_refs
    outputs:
      - integration_validation_log
      - boundary_review_note
      - claim_ceiling
    rules:
      inspect_actual_status_before_decision: true
      do_not_revert_unowned_changes: true
      validators_before_stronger_claims: true
      independent_review_not_satisfied_by_implementer_fork: true
      partial_pilot_lowers_claim_ceiling: true
    next:
      - validation_and_review
  - step_id: validation_and_review
    title: Validation And Review
    actor_slot: validation_controller
    action:
      kind: workflow_check_and_deterministic_validation
    inputs:
      - integration_validation_log
      - boundary_review_note
      - claim_ceiling
    optional_inputs:
      - validation_command_refs
      - owner_decision_refs
    outputs:
      - workflow_check_review_packet
      - strongest_supported_workflow_status
      - default_route_safe
    rules:
      workflow_check_required: true
      workflow_generator_provenance_checked: true
      registration_surface_checked_when_claimed: true
      default_route_safety_named: true
      stronger_claims_require_evidence: true
    next:
      - closeout_or_registration_decision
  - step_id: closeout_or_registration_decision
    title: Closeout Or Registration Decision
    actor_slot: closeout_controller
    action:
      kind: conservative_thread_workflow_closeout
    inputs:
      - workflow_check_review_packet
      - strongest_supported_workflow_status
      - default_route_safe
    optional_inputs:
      - owner_decision_refs
    outputs:
      - closeout_report
      - next_action
      - knowledge_trigger_check
    rules:
      workflow_check_required_for_status_claim: true
      registration_requires_explicit_owner_request: true
      party_creation_only_for_multi_workflow_chain: true
      default_route_safety_not_claimed_without_owner_intent: true
    next: []
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


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "schema_version": "gpt56_portfolio_gate_fixture_v1",
  "workflow_id": "codex_thread_manager_v0",
  "fixture_id": "public_synthetic_durable_two_lane_orchestration",
  "public_safe": true,
  "request": "Act as the declared Codex thread manager for a bounded two-lane refactor. Produce an orchestration decision and self-contained worker packets; do not execute worker tasks or claim thread creation.",
  "inputs": {
    "soulforge_task_goal": "Refactor a synthetic telemetry adapter and update its public operator note, then obtain independent acceptance evidence.",
    "active_workspace_scope": [
      "repo://src/telemetry_adapter/**",
      "repo://docs/telemetry_adapter.md"
    ],
    "boundary_policy_ref": "fixture://policies/public_safe_no_external_side_effects",
    "thread_orchestration_request": {
      "explicit_manager_invocation": true,
      "durable_lanes": [
        "implementation",
        "documentation"
      ],
      "acceptance_review_required": true,
      "expected_duration": "multi_phase"
    },
    "prior_night_work_handoff_ref": "fixture://handoff/telemetry_refactor_checkpoint",
    "active_worker_thread_refs": [],
    "target_file_refs": [
      "repo://src/telemetry_adapter/adapter.ts",
      "repo://docs/telemetry_adapter.md"
    ],
    "validation_command_refs": [
      "cmdref://unit_test",
      "cmdref://docs_lint"
    ],
    "context_pressure_signal": "moderate",
    "owner_decision_refs": []
  },
  "fixture_state": {
    "unresolved_forward_state": true,
    "thread_tools_assumed_available": true,
    "implementation_and_documentation_write_scopes_do_not_overlap": true,
    "verifier_must_be_independent": true,
    "registration_or_default_route_change_authorized": false
  },
  "requested_deliverable": [
    "declared goal, success criteria, stop conditions, and boundary constraints",
    "checkpoint refresh decision and compact NIGHT_WORK_HANDOFF content",
    "continuation surface and manager lifecycle decision",
    "one bounded packet per durable worker lane with subagent-first posture",
    "a fresh non-implementer verifier packet",
    "integration, validation, workflow-check, and conservative closeout plan"
  ],
  "prohibitions": [
    "no raw transcript, hidden reasoning, private payload, secret, or host-local absolute path",
    "no invented thread ids, command results, validator results, owner approval, registration, or default-route safety",
    "no candidate execution"
  ],
  "boundary_attestation": "All names, refs, and task facts are synthetic and public-safe."
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
