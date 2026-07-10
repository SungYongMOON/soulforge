**Declared Thread Goal**

`declared_thread_goal`:
Manage a bounded, durable two-lane orchestration for a synthetic telemetry adapter refactor: one implementation lane for `repo://src/telemetry_adapter/adapter.ts`, one documentation lane for `repo://docs/telemetry_adapter.md`, followed by fresh independent acceptance review. This deliverable prepares orchestration decisions and self-contained packets only; it does not execute worker tasks, create threads, or claim runtime outcomes.

`success_criteria`:
1. The manager scope is explicitly bound to the synthetic refactor objective and listed workspace refs.
2. A compact `night_work_handoff` is refreshed for continuity before any worker creation.
3. Continuation surface selection names durable worker lanes rather than same-thread execution.
4. One bounded worker packet exists for each durable lane: implementation and documentation.
5. One fresh non-implementer verifier packet exists for independent acceptance review.
6. Integration, validation, workflow-check, and closeout plans preserve conservative claim ceilings and public/private boundaries.

`stop_conditions`:
1. `conflicting_active_goal`
2. `unsafe_public_private_boundary`
3. `secret_or_credential_required`
4. `owner_decision_required_for_registration_or_default_route`
5. `unavailable_thread_tool`
6. `worker_write_scope_overlap_without_worktree`
7. `independent_verifier_unavailable_for_required_claim`
8. `worker_direct_substantive_execution_without_no_subagent_exception`
9. `unbounded_recursive_subagent_fanout_requested_or_observed`
10. `validator_failure_unfixable_in_scope`
11. `exhausted_user_specified_budget`

`boundary_constraints`:
- Scope is limited to `repo://src/telemetry_adapter/**` and `repo://docs/telemetry_adapter.md`.
- No external side effects.
- No raw transcript, hidden reasoning, private payload, secret, or host-local absolute path.
- No invented thread ids, command results, validator results, owner approval, registration, or default-route safety.
- No worker execution or thread creation claims.
- Independent acceptance must come from a fresh non-implementer verifier context.
- Write scopes are treated as non-overlapping per fixture, but overlap discovery later must stop or route to worktree isolation.

**Checkpoint Refresh**

`checkpoint_refresh_decision`:
Refresh `night_work_handoff` before any worker creation because unresolved forward state exists, the request is multi-phase, and durable worker lanes are requested.

`night_work_handoff`:
- Goal: Refactor synthetic telemetry adapter and update public operator note with later independent acceptance review.
- Current state: Manager invocation requested; no active worker refs supplied; orchestration deliverable only.
- Scope: `repo://src/telemetry_adapter/adapter.ts`, `repo://docs/telemetry_adapter.md`.
- Constraints: Public-safe only; no external side effects; no execution claims; no registration or default-route change authority.
- Worker plan: durable implementation lane, durable documentation lane, fresh verifier lane after worker outputs exist.
- Validation refs: `cmdref://unit_test`, `cmdref://docs_lint`.
- Risks: Independent verifier required for stronger acceptance claim; write-overlap or missing tool availability would block stronger continuation.
- Next manager action: select continuation surface and issue self-contained packets.
- Unknowns: actual file state, validator behavior, thread ids, and execution outcomes.

`compact_clear_or_rollover_checkpoint`:
Compact checkpoint refreshed; no clear or rollover is required by the fixture alone.

**Continuation Surface Decision**

`thread_team_topology`:
- Current declared thread as manager/main team lead
- Durable worker lane: implementation
- Durable worker lane: documentation
- Fresh verifier lane: independent acceptance review

`continuation_surface_decision`:
`current_thread_manager_plus_worker`

`delegation_routing_decision`:
Use durable worker threads for implementation and documentation because the request is actionable, multi-phase, and explicitly asks for durable lanes. Use a fresh verifier thread or equivalent fresh verifier surface for independent acceptance review. Do not use same-thread execution except for manager packet authoring and closeout planning.

`manager_lifecycle_action`:
Keep the current declared manager thread as the continuity surface. No fresh manager rollover is required by the fixture. Reuse manager role for integration and closeout after worker result packets return.

`worker_lane_plan`:
- Lane 1: implementation refactor on `repo://src/telemetry_adapter/adapter.ts`
- Lane 2: documentation update on `repo://docs/telemetry_adapter.md`
- Lane 3: fresh independent verifier reviewing changed refs, acceptance criteria, and validator evidence if later available

**Worker Thread Packet Set**

`worker_thread_packet_set`:

```yaml
- title_or_packet_id: synthetic-implementation-lane-packet
  objective: Refactor the synthetic telemetry adapter in repo://src/telemetry_adapter/adapter.ts to satisfy the bounded task goal without expanding scope beyond the adapter area.
  context_refs:
    - fixture://public_synthetic_durable_two_lane_orchestration
    - fixture://handoff/telemetry_refactor_checkpoint
    - repo://src/telemetry_adapter/adapter.ts
    - cmdref://unit_test
  current_state: Manager has bound scope and is delegating a durable implementation lane. Actual file state and validator outcomes are unknown from this fixture.
  acceptance_criteria:
    - Proposed code changes stay within telemetry adapter scope.
    - Public behavior notes needed for documentation handoff are surfaced in the result summary.
    - Any claimed completion is limited to observed worker outputs and not independent acceptance.
  allowed_scope:
    read_paths_or_refs:
      - repo://src/telemetry_adapter/**
      - repo://docs/telemetry_adapter.md only if needed to note doc-impact facts for handoff
    write_paths_or_read_only_status:
      - write allowed: repo://src/telemetry_adapter/adapter.ts
      - read only otherwise unless manager authorizes expansion
    write_ownership: Owns implementation edits within adapter path only.
    conflict_protocol_for_foreground_or_peer_edits: Stop and return a blocker if overlapping active edits or expanded write needs are discovered.
    do_not_revert_others_changes: true
  constraints:
    - No external side effects.
    - No registration, default-route, or acceptance claims.
    - No secret, transcript, or private payload handling.
    - Do not widen scope into documentation edits.
  side_effect_limits:
    - No non-scope file mutation.
    - No thread creation claims.
    - No runtime verification claims beyond observed local worker outputs if execution later occurs.
  subagent_policy:
    subagent_first_posture: true
    allowed_purpose:
      - focused implementation analysis
      - bounded refactor proposal
      - narrow code-impact review
    count_limit_or_no_hardcoded_count: no_hardcoded_count; keep bounded to scope
    named_no_subagent_exceptions:
      - lane_planning_and_worker_packet_authoring
      - small_deterministic_local_check
      - result_integration_or_summary
      - subagent_tool_unavailable_or_blocked
  verification:
    - If execution later occurs, record any commands attempted and exit status.
    - Prefer cmdref://unit_test when applicable for stronger local confidence.
    - Implementer self-check is not independent verification.
  output_shape:
    - subagents_used_or_exception
    - changed_or_inspected_refs
    - commands_run_and_exit_status
    - validators_or_gap
    - blockers
    - residual_risks
    - next_action
    - doc-impact summary for documentation lane
  claim_ceiling: observed
  stop_conditions:
    - Scope expansion beyond adapter path is required
    - Overlapping write scope is discovered
    - Secret or credential is required
    - Validator failure is encountered and not fixable in lane scope

- title_or_packet_id: synthetic-documentation-lane-packet
  objective: Update the public operator note in repo://docs/telemetry_adapter.md to match the bounded telemetry adapter refactor outcome without asserting unverified runtime facts.
  context_refs:
    - fixture://public_synthetic_durable_two_lane_orchestration
    - fixture://handoff/telemetry_refactor_checkpoint
    - repo://docs/telemetry_adapter.md
    - repo://src/telemetry_adapter/adapter.ts
    - cmdref://docs_lint
  current_state: Manager has bound scope and is delegating a durable documentation lane. Actual documentation content and final implementation deltas are unknown from this fixture.
  acceptance_criteria:
    - Documentation changes stay within the public operator note scope.
    - Statements about behavior are limited to source-supported change intent or implementation-lane outputs later supplied.
    - No unsupported production or readiness claims are introduced.
  allowed_scope:
    read_paths_or_refs:
      - repo://docs/telemetry_adapter.md
      - repo://src/telemetry_adapter/** as needed to align documentation with implementation facts
    write_paths_or_read_only_status:
      - write allowed: repo://docs/telemetry_adapter.md
      - read only otherwise unless manager authorizes expansion
    write_ownership: Owns documentation edits in the operator note only.
    conflict_protocol_for_foreground_or_peer_edits: Stop and return a blocker if overlapping documentation edits or dependency on unresolved implementation facts prevents safe update.
    do_not_revert_others_changes: true
  constraints:
    - No external side effects.
    - No invented behavior, validator pass, or acceptance claim.
    - No secret, transcript, or private payload handling.
    - Do not edit implementation files.
  side_effect_limits:
    - No non-scope file mutation.
    - No thread creation claims.
    - No default-route or registration claims.
  subagent_policy:
    subagent_first_posture: true
    allowed_purpose:
      - focused doc analysis
      - wording refinement
      - consistency check against implementation-lane summary
    count_limit_or_no_hardcoded_count: no_hardcoded_count; keep bounded to scope
    named_no_subagent_exceptions:
      - lane_planning_and_worker_packet_authoring
      - small_deterministic_local_check
      - result_integration_or_summary
      - subagent_tool_unavailable_or_blocked
  verification:
    - If execution later occurs, record any commands attempted and exit status.
    - Prefer cmdref://docs_lint when applicable for stronger local confidence.
    - Documentation self-check is not independent acceptance.
  output_shape:
    - subagents_used_or_exception
    - changed_or_inspected_refs
    - commands_run_and_exit_status
    - validators_or_gap
    - blockers
    - residual_risks
    - next_action
  claim_ceiling: observed
  stop_conditions:
    - Required implementation facts are unavailable
    - Documentation scope must expand beyond the operator note
    - Overlapping write scope is discovered
    - Secret or credential is required
```

**Fresh Verifier Packet**

`verifier_packet`:

```yaml
title_or_packet_id: synthetic-fresh-verifier-packet
objective: Perform fresh non-implementer acceptance review of the implementation and documentation lane outputs for the synthetic telemetry adapter refactor.
context_refs:
  - fixture://public_synthetic_durable_two_lane_orchestration
  - repo://src/telemetry_adapter/adapter.ts
  - repo://docs/telemetry_adapter.md
  - cmdref://unit_test
  - cmdref://docs_lint
current_state: Verifier is intentionally fresh and independent from implementer contexts. Worker outputs, changed refs, and validator evidence may or may not later be available.
acceptance_criteria:
  - Review is independent and not a fork or continuation of the implementer context.
  - Claims are limited to evidence actually supplied to the verifier.
  - Any acceptance statement distinguishes observed facts, validation gaps, and residual risks.
allowed_scope:
  read_paths_or_refs:
    - repo://src/telemetry_adapter/**
    - repo://docs/telemetry_adapter.md
    - worker result summaries
    - validator outputs if later supplied
  write_paths_or_read_only_status:
    - read only
  write_ownership: none
  conflict_protocol_for_foreground_or_peer_edits: Stop if review cannot remain independent or if required evidence is missing for the requested claim level.
  do_not_revert_others_changes: true
constraints:
  - No implementation or documentation edits.
  - No raw transcript, hidden reasoning, private payload, or secret handling.
  - No readiness, production, registration, or default-route safety claim without evidence.
side_effect_limits:
  - No file mutation
  - No thread creation claims
subagent_policy:
  subagent_first_posture: false
  allowed_purpose:
    - none required by default for this bounded acceptance review packet
  count_limit_or_no_hardcoded_count: no_subagent_expected
  named_no_subagent_exceptions:
    - lane_planning_and_worker_packet_authoring
    - small_deterministic_local_check
    - result_integration_or_summary
verification:
  - Inspect changed refs and validator evidence if later available.
  - State clearly if independent verification is partial or blocked.
output_shape:
  - subagents_used_or_exception
  - changed_or_inspected_refs
  - commands_run_and_exit_status
  - validators_or_gap
  - blockers
  - residual_risks
  - next_action
  - explicit independence note
  - acceptance judgment with claim ceiling
claim_ceiling: source_supported unless validator-backed evidence is actually supplied; otherwise lower if evidence is missing
stop_conditions:
  - Independent context cannot be maintained
  - Required changed refs or validator evidence are unavailable for the requested claim level
  - Review request asks for production, registration, or default-route safety claim
```

`verifier_independence_note`:
Independent acceptance requires a fresh non-implementer verifier context. Implementer self-check or manager continuity from implementation context does not satisfy independent verification.

**Integration, Validation, Workflow-Check, And Closeout Plan**

`integration_validation_log`:
- Wait for worker result summaries from implementation and documentation lanes.
- Record changed or inspected refs, any commands attempted, validator gaps, blockers, residual risks, and next actions from each lane.
- Check that implementation edits stayed within `repo://src/telemetry_adapter/adapter.ts`.
- Check that documentation edits stayed within `repo://docs/telemetry_adapter.md`.
- Confirm no overlap or unowned write-scope breach was reported.
- Route resulting evidence to the fresh verifier packet.
- Limit integrated claim ceiling to the strongest evidence actually returned.

`boundary_review_note`:
Public-safe boundary is preserved if outputs remain synthetic, scoped to listed refs, free of secrets/private payloads/raw transcripts, and avoid execution or registration claims. Any request to claim default-route safety, registration, or production readiness remains out of scope without explicit authority and evidence.

`workflow_check_review_packet`:
- Confirm the deliverable includes goal binding, checkpoint refresh, continuation surface selection, worker packets, verifier packet, and conservative closeout logic.
- Confirm packet fields include objective, context refs, current state, acceptance criteria, allowed scope, constraints, side-effect limits, subagent policy, verification, output shape, claim ceiling, and stop conditions.
- Confirm durable worker routing is used for actionable multi-phase lanes.
- Confirm verifier independence is explicitly required.
- Confirm no default-route safety or registration claim is made.
- Confirm no execution, thread creation, or validator outcome is claimed.

`strongest_supported_workflow_status`:
`active_registered_candidate_structure_only`
This supports only the public-safe workflow structure reflected in the fixture and contract, not runtime execution success, default-route safety, production readiness, or completed rollover behavior.

`default_route_safe`:
`not_claimed`

`closeout_report`:
The declared thread manager should proceed, if later executed in a real runtime, with the current manager as continuity surface, two durable worker lanes for implementation and documentation, and one fresh verifier lane for independent acceptance. In this deliverable, the strongest supported output is the orchestration decision and bounded packet set only. Runtime creation, worker execution, validator outcomes, acceptance success, registration change, and default-route safety remain unclaimed.

`next_action`:
Use the manager decision and packets as the bounded handoff surface for later runtime execution, then integrate worker summaries and route evidence to the fresh verifier before any stronger acceptance statement.

`knowledge_trigger_check`:
No knowledge-ingest trigger is required from this synthetic orchestration packet alone.
