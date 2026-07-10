```yaml
deliverable:
  workflow_id: codex_thread_manager_v0
  fixture_id: public_synthetic_durable_two_lane_orchestration
  status: planned_not_executed

  declared_goal:
    statement: >
      Refactor the synthetic telemetry adapter and update its public operator
      note, followed by independent acceptance review.
    scope:
      - repo://src/telemetry_adapter/adapter.ts
      - repo://docs/telemetry_adapter.md
    success_criteria:
      - Implementation lane produces a bounded adapter refactor.
      - Documentation lane updates the operator note consistently.
      - Unit-test and documentation-lint evidence is available for review.
      - Acceptance is assessed by a fresh non-implementer verifier.
    stop_conditions:
      - conflicting_active_goal
      - unsafe_public_private_boundary
      - secret_or_credential_required
      - unavailable_thread_tool
      - worker_write_scope_overlap_without_worktree
      - independent_verifier_unavailable
      - unbounded_recursive_subagent_fanout
      - validator_failure_unfixable_in_scope
      - owner_decision_required_for_registration_or_default_route

  boundary_constraints:
    public_safe: true
    external_side_effects: forbidden
    raw_transcript: forbidden
    hidden_reasoning: forbidden
    private_payloads: forbidden
    secrets: forbidden
    host_local_absolute_paths: forbidden
    registration_change: not_authorized
    default_route_change: not_authorized
    candidate_execution: forbidden
    claim_ceiling: observed

  checkpoint_refresh:
    required_before_worker_creation: true
    decision: refresh_required
    handoff_ref: fixture://handoff/telemetry_refactor_checkpoint
    night_work_handoff:
      goal: >
        Coordinate two durable, non-overlapping lanes for the synthetic
        telemetry adapter refactor and operator-note update.
      state:
        manager: declared current thread remains main team lead
        workers: none created
        implementation_scope: repo://src/telemetry_adapter/**
        documentation_scope: repo://docs/telemetry_adapter.md
        context_pressure: moderate
        forward_state: unresolved
      decisions:
        - preserve the current manager across worker phases
        - create one bounded worker lane per durable task
        - use a fresh verifier for acceptance
        - do not execute candidate work in this deliverable
      blockers:
        - none currently declared
      next_action: prepare bounded worker and verifier packets
      prohibited_contents:
        - raw transcript
        - private payload
        - secret
        - source dump

  continuation_surface:
    decision: manager_thread_plus_two_role_workers
    manager_lifecycle:
      current_thread_is_main_team_lead: true
      manager_context_lifecycle_owner: true
      rollover: not_indicated
      rollover_reason: >
        No cross-PC transfer, overnight handoff, 24-hour span, or changed
        mission boundary is declared.
      manager_retained_across_worker_phases: true
    worker_topology:
      - logical_worker_id: synthetic://worker/implementation
        title: Telemetry Adapter Implementation Worker
        actual_thread_id: unset_until_creation
        lane: implementation
        worktree_required: false
      - logical_worker_id: synthetic://worker/documentation
        title: Telemetry Adapter Operator Note Worker
        actual_thread_id: unset_until_creation
        lane: documentation
        worktree_required: false
      - logical_worker_id: synthetic://verifier/acceptance
        title: Fresh Telemetry Refactor Acceptance Verifier
        actual_thread_id: unset_until_creation
        lane: independent_verification
        worktree_required: false

  worker_packets:
    - packet_id: synthetic://packet/implementation
      title: Telemetry Adapter Implementation Worker
      objective: >
        Perform the bounded synthetic telemetry adapter refactor within the
        implementation scope.
      context_refs:
        - synthetic://handoff/telemetry_refactor_checkpoint
        - repo://src/telemetry_adapter/adapter.ts
        - cmdref://unit_test
      current_state:
        - implementation lane is pending
        - no worker execution has occurred
      acceptance_criteria:
        - changes remain within repo://src/telemetry_adapter/**
        - adapter behavior is covered by the applicable unit-test evidence
        - no unrelated files or state are changed
      allowed_scope:
        read_paths_or_refs:
          - repo://src/telemetry_adapter/**
        write_paths_or_read_only_status:
          - write: repo://src/telemetry_adapter/**
        write_ownership: implementation worker only
        conflict_protocol: >
          Stop and report any foreground or peer edit affecting the scope;
          do not revert others' changes.
      constraints:
        - public-safe synthetic task only
        - no secrets or external services
        - no canon or registration changes
      side_effect_limits:
        - no messaging
        - no external writes
        - no execution in this candidate deliverable
      subagent_policy:
        subagent_first_posture: required for substantive lane work
        allowed_purpose: bounded implementation assistance
        count_limit_or_no_hardcoded_count: scope-driven and manager-bounded
        named_no_subagent_exceptions:
          - lane planning and packet authoring
          - small deterministic local check
          - result integration or summary
          - validator status
          - unavailable or blocked subagent
      verification:
        planned_reference: cmdref://unit_test
        execution_status: not_run
      output_shape:
        subagents_used_or_exception: required
        changed_or_inspected_refs: required
        commands_run_and_exit_status: none; candidate execution prohibited
        validators_or_gap: unit-test evidence or explicit gap
        blockers: required
        residual_risks: required
        next_action: required
      claim_ceiling: observed
      stop_conditions:
        - write_scope_conflict
        - missing boundary-safe packet
        - secret_or_external_side_effect requirement
        - unbounded fanout

    - packet_id: synthetic://packet/documentation
      title: Telemetry Adapter Operator Note Worker
      objective: >
        Update the public operator note to accurately describe the bounded
        telemetry adapter refactor.
      context_refs:
        - synthetic://handoff/telemetry_refactor_checkpoint
        - repo://docs/telemetry_adapter.md
        - repo://src/telemetry_adapter/adapter.ts
        - cmdref://docs_lint
      current_state:
        - documentation lane is pending
        - no worker execution has occurred
      acceptance_criteria:
        - changes remain limited to repo://docs/telemetry_adapter.md
        - note reflects only source-supported behavior
        - documentation-lint evidence is available or the gap is recorded
      allowed_scope:
        read_paths_or_refs:
          - repo://docs/telemetry_adapter.md
          - repo://src/telemetry_adapter/**
        write_paths_or_read_only_status:
          - write: repo://docs/telemetry_adapter.md
        write_ownership: documentation worker only
        conflict_protocol: >
          Stop and report any foreground or peer edit affecting the scope;
          do not revert others' changes.
      constraints:
        - no invented behavior or operational guarantees
        - no secrets or external services
        - no canon or registration changes
      side_effect_limits:
        - no messaging
        - no external writes
        - no execution in this candidate deliverable
      subagent_policy:
        subagent_first_posture: required for substantive lane work
        allowed_purpose: bounded documentation analysis or drafting
        count_limit_or_no_hardcoded_count: scope-driven and manager-bounded
        named_no_subagent_exceptions:
          - lane planning and packet authoring
          - small deterministic local check
          - result integration or summary
          - validator status
          - unavailable or blocked subagent
      verification:
        planned_reference: cmdref://docs_lint
        execution_status: not_run
      output_shape:
        subagents_used_or_exception: required
        changed_or_inspected_refs: required
        commands_run_and_exit_status: none; candidate execution prohibited
        validators_or_gap: documentation-lint evidence or explicit gap
        blockers: required
        residual_risks: required
        next_action: required
      claim_ceiling: observed
      stop_conditions:
        - write_scope_conflict
        - unsupported documentation claim
        - secret_or_external_side_effect requirement
        - unbounded fanout

  verifier_packet:
    packet_id: synthetic://packet/acceptance-verifier
    title: Fresh Telemetry Refactor Acceptance Verifier
    objective: >
      Independently assess the implementation and documentation results against
      their acceptance criteria.
    context_refs:
      - synthetic://packet/implementation
      - synthetic://packet/documentation
      - cmdref://unit_test
      - cmdref://docs_lint
    current_state:
      - worker packets are prepared
      - worker execution and file status are unknown
    acceptance_criteria:
      - verifier is fresh-context and non-implementer
      - actual changed references or status are inspected when available
      - unit-test and documentation-lint evidence are checked
      - unsupported claims and residual risks are reported
    allowed_scope:
      read_paths_or_refs:
        - repo://src/telemetry_adapter/**
        - repo://docs/telemetry_adapter.md
        - synthetic://worker-result/*
      write_paths_or_read_only_status:
        - read-only
      write_ownership: none
      conflict_protocol: >
        Do not modify or revert files; report unavailable or conflicting
        evidence.
    constraints:
      - minimal evidence only
      - no raw transcript or private payload
      - no acceptance claim without evidence
    side_effect_limits:
      - no file mutation
      - no external communication
    subagent_policy:
      subagent_first_posture: permitted only for bounded evidence inspection
      allowed_purpose: independent evidence gathering
      count_limit_or_no_hardcoded_count: scope-driven and bounded
      named_no_subagent_exceptions:
        - deterministic status inspection
        - result integration or summary
        - unavailable or blocked subagent
    verification:
      independence: fresh non-implementer context required
      execution_status: not_run
    output_shape:
      subagents_used_or_exception: required
      changed_or_inspected_refs: required
      commands_run_and_exit_status: none; candidate execution prohibited
      validators_or_gap: required
      blockers: required
      residual_risks: required
      next_action: required
    claim_ceiling: observed
    stop_conditions:
      - verifier_not_fresh
      - insufficient evidence
      - implementer-fork substitution
      - acceptance evidence unavailable

  integration_validation_plan:
    integration_controller:
      - receive worker result packets
      - inspect actual status before any decision
      - preserve unowned changes
      - record changed or inspected refs
      - lower claims for missing or partial evidence
    planned_validators:
      - cmdref://unit_test
      - cmdref://docs_lint
    execution_status: not_run
    integration_claim: >
      No integration or validation result is asserted by this deliverable.

  workflow_check_plan:
    required: true
    checks:
      - workflow structure and step transitions
      - delegation packet completeness
      - provenance and boundary constraints
      - registration surface only if explicitly claimed
      - default-route safety explicitly left unclaimed
      - fresh verifier independence
    execution_status: not_run
    strongest_supported_status: >
      Public-safe orchestration candidate prepared; runtime execution,
      validation, registration, and readiness remain unverified.

  conservative_closeout:
    closeout_report:
      result: packet_set_ready_for_owner-controlled_execution
      thread_creation: not claimed
      worker_execution: not claimed
      verifier_execution: not claimed
      validation_results: not claimed
      registration: not claimed
      default_route_safety: not claimed
      production_readiness: not claimed
    next_action: >
      If authorized, create the two bounded worker threads, collect result
      packets, then use the fresh verifier packet for independent acceptance.
    knowledge_trigger_check:
      status: not_assessed
      reason: candidate execution and workflow-check review were not performed.

  assumptions:
    - Synthetic refs are treated as the complete available evidence.
    - Thread tools are assumed available only as stated by the fixture.
    - Non-overlapping lane scopes mean no worktree worker is required.
```
