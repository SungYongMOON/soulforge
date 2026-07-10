project_readiness_digest:
  fixture_id: PUBLIC_SYNTH_PROJECT_READINESS_DIGEST
  workflow_id: project_readiness_digest_v0
  readiness: ready_with_gap
  summary: >-
    The bounded source packet is reported as validated, while profile calibration
    remains pending. Boundary review requires owner confirmation, and release
    scope ownership requires owner input.
  source_refs:
    - workflow_status:alpha
    - review_gate:beta
    - owner_backlog:gamma
  non_claims:
    - This digest does not replace or mutate upstream artifacts.
    - No release readiness or closure is established.
    - No owner confirmation or decision is inferred.

status_rollup:
  - ref: workflow_status:alpha
    state: ready_with_gap
    reported_note: source packet validated; profile calibration pending
    interpretation: Calibration remains an explicit readiness gap.

priority_blockers:
  - ref: review_gate:beta
    blocker: boundary review needs owner confirmation
    status: unresolved
    stop_condition: Do not represent boundary review as complete without owner confirmation.

owner_input_queue:
  - ref: owner_backlog:gamma
    priority: high
    ask: Confirm release scope owner
    status: awaiting_owner_input
    stop_condition: Do not assign or infer the release scope owner.

next_action_recommendations:
  - priority: immediate
    action: Obtain owner confirmation required by the boundary review.
    source_ref: review_gate:beta
    authority_boundary: Owner confirmation is required.
  - priority: high
    action: Obtain an owner decision identifying the release scope owner.
    source_ref: owner_backlog:gamma
    authority_boundary: The digest cannot make this assignment.
  - priority: next
    action: Calibrate owner_decision_packet_v0 after the blocking owner inputs are resolved.
    source_ref: owner_decision_packet_v0
    authority_boundary: This is a calibration priority, not evidence of execution or readiness.

boundary_review_note:
  policy_applied: >-
    Report only from bounded refs; do not mutate upstream artifacts; separate
    blocker, owner input, calibration priority, and next action.
  excluded_from_rollup:
    - ref: workflow_status:delta
      reason: The identifier is not included in digest_scope_refs.
      preserved_note: owner decision missing for release scope
      preserved_state: blocked
  uncertainty:
    - Upstream facts are represented only as fixture-supplied reports.
    - Resolution timing, responsible owner, and final release scope are unknown.
    - The relationship between owner_decision_packet_v0 and the unresolved release-scope decision is not established beyond its supplied calibration priority.
  publication_condition: >-
    Keep unresolved items explicit and retain links to synthetic upstream refs;
    do not present recommendations as completed actions or owner decisions.
