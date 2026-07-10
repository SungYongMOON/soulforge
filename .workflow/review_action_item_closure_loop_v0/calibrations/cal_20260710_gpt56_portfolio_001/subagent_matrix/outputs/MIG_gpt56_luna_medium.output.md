```yaml
action_closure_packet:
  workflow_id: review_action_item_closure_loop_v0
  fixture_id: review_action_item_closure_loop_v0_public_synthetic_mixed_closure
  project_binding:
    project_scope_key: public_closure_fixture
    source_mode: contract_only_synthetic
    public_safe: true
  mode: initial_closure_loop
  action_closure_ledger:
    - action_id: AI-001
      source: review_gate_evidence_pack_v0
      blocker: missing U1 official datasheet
      status: open
      requested_route: source_gap_followup_packet_v0
      closure_evidence_ref: null
      rerun_ready: false
      unresolved: true
      uncertainty: Closure evidence is absent.

    - action_id: AI-002
      source: verification_plan_from_page_contracts_v0
      blocker: owner approved measurement tolerance
      status: closure_evidence_supplied
      requested_route: verification_plan_from_page_contracts_v0
      closure_evidence_ref: owner_decision_ref:OD-17-summary
      rerun_ready: true
      rerun_executed: false
      unresolved: true
      uncertainty: The evidence reference does not establish owning-workflow reindex or verification completion.

    - action_id: AI-003
      source: interface_control_and_harness_readiness_v0
      blocker: IF_PWR direction ambiguous
      status: waiting_owner
      requested_route: owner_decision_request
      closure_evidence_ref: null
      rerun_ready: false
      unresolved: true
      uncertainty: Owner decision evidence is absent.

    - action_id: AI-004
      source: review_gate_evidence_pack_v0
      blocker: old page id page_003
      status: superseded
      requested_route: carry_forward_only
      closure_evidence_ref: trace_delta_ref:TD-04-summary
      rerun_ready: false
      unresolved: false
      carry_forward: true
      uncertainty: The trace evidence reference does not replace owning-workflow reindex.

  closure_status_matrix:
    proposed: []
    open:
      - AI-001
    waiting_owner:
      - AI-003
    waiting_workflow_rerun: []
    closure_evidence_supplied:
      - AI-002
    externally_closed_with_evidence: []
    deferred: []
    superseded:
      - AI-004

  unresolved_action_items:
    - AI-001
    - AI-002
    - AI-003

  closure_ready_reruns:
    - action_id: AI-002
      target_workflow: verification_plan_from_page_contracts_v0
      readiness_basis:
        - closure_evidence_ref: owner_decision_ref:OD-17-summary
        - evidence_need_or_readiness_may_have_changed: true
      constraints:
        - rerun_ready_is_not_rerun_executed
        - owning_workflow_reindex_required
        - no_upstream_mutation

  closure_blockers:
    - action_id: AI-001
      blocker: missing U1 official datasheet
      route: source_gap_followup_packet_v0
      blocking_state: closure evidence missing

    - action_id: AI-003
      blocker: IF_PWR direction ambiguous
      route: owner_decision_request
      blocking_state: owner decision missing

    - action_id: AI-002
      blocker: owning workflow reindex and verification completion not established
      route: verification_plan_from_page_contracts_v0
      blocking_state: evidence supplied but closure not claimed

  carry_forward_register:
    - action_id: AI-004
      prior_status: superseded
      blocker: old page id page_003
      carry_forward_reason: carry_forward_only
      evidence_ref: trace_delta_ref:TD-04-summary
      closure_claimed: false
      required_followup: owning-workflow reindex if the trace reference is to be used

  owner_decision_request_queue:
    - action_id: AI-003
      decision_request: Resolve IF_PWR direction ambiguity.
      source: interface_control_and_harness_readiness_v0
      status: waiting_owner
      decision_ref: null

  closure_provenance:
    fixture_id: review_action_item_closure_loop_v0_public_synthetic_mixed_closure
    source_mode: contract_only_synthetic
    upstream_artifacts_read_only: true
    evidence_refs:
      AI-002: owner_decision_ref:OD-17-summary
      AI-004: trace_delta_ref:TD-04-summary
    non_claims:
      - No action item is auto-closed.
      - No rerun is claimed as executed.
      - Evidence references do not replace owning-workflow reindex.
      - No upstream packet or source artifact is mutated.
      - No review-gate approval is granted.
      - No verification execution is claimed.

  boundary_review_note:
    result: bounded
    confirmed_boundaries:
      - closure status is tracking state, not owner decision
      - rerun readiness is routing state, not rerun execution
      - upstream artifacts remain read-only
      - closure evidence references are indexed without asserting closure
    remaining_uncertainty:
      - AI-001 lacks closure evidence.
      - AI-002 requires owning-workflow reindex and verification confirmation.
      - AI-003 lacks owner decision evidence.
```
