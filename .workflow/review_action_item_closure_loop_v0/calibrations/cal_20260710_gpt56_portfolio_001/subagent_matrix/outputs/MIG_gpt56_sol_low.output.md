fixture_id: review_action_item_closure_loop_v0_public_synthetic_mixed_closure
workflow_id: review_action_item_closure_loop_v0
workflow_mode: initial_closure_loop
source_mode: contract_only_synthetic
project_scope_key: public_closure_fixture
public_safe: true

action_closure_packet:
  packet_id: ACP-public-closure-001
  project_binding:
    project_scope_key: public_closure_fixture
    source_mode: contract_only_synthetic
    upstream_artifact_posture: read_only
    output_scope: synthetic_public_safe
  summary:
    total_action_items: 4
    open: 1
    waiting_owner: 1
    closure_evidence_supplied: 1
    superseded: 1
    externally_closed_with_evidence: 0
    closure_ready_reruns: 1
  stop_conditions:
    - Do not treat a closure evidence reference as owning-workflow reindexing.
    - Do not represent rerun readiness as rerun execution.
    - Do not mutate upstream packets.
    - Do not close an action automatically.
    - Do not infer an owner decision beyond the supplied reference summary.
  non_claims:
    - No upstream artifact repair or mutation is represented.
    - No owner decision authority is exercised.
    - No workflow rerun or verification execution is represented.
    - No review-gate approval is represented.

action_closure_ledger:
  - closure_row_id: ACR-AI-001
    action_id: AI-001
    source_workflow: review_gate_evidence_pack_v0
    blocker: missing U1 official datasheet
    input_status: open
    closure_status: open
    closure_evidence_ref: null
    requested_route: source_gap_followup_packet_v0
    disposition: unresolved
    rerun_eligibility: not_ready
    carry_forward: true
    uncertainty: No official-datasheet evidence reference is supplied.
    next_required_evidence: Approved reference to the missing U1 official datasheet or an owner-authorized disposition.

  - closure_row_id: ACR-AI-002
    action_id: AI-002
    source_workflow: verification_plan_from_page_contracts_v0
    blocker: owner approved measurement tolerance
    input_status: closure_evidence_supplied
    closure_status: closure_evidence_supplied
    closure_evidence_ref: owner_decision_ref:OD-17-summary
    requested_route: verification_plan_from_page_contracts_v0
    disposition: rerun_ready
    rerun_eligibility: ready
    carry_forward: true
    uncertainty: The reference is indexed but its contents and owning-workflow incorporation are not established.
    next_required_evidence: Owning-workflow reindex or rerun output incorporating the referenced owner decision.

  - closure_row_id: ACR-AI-003
    action_id: AI-003
    source_workflow: interface_control_and_harness_readiness_v0
    blocker: IF_PWR direction ambiguous
    input_status: waiting_owner
    closure_status: waiting_owner
    closure_evidence_ref: null
    requested_route: owner_decision_request
    disposition: owner_decision_required
    rerun_eligibility: not_ready
    carry_forward: true
    uncertainty: The required IF_PWR direction is not supplied.
    next_required_evidence: Owner decision reference resolving the IF_PWR direction.

  - closure_row_id: ACR-AI-004
    action_id: AI-004
    source_workflow: review_gate_evidence_pack_v0
    blocker: old page id page_003
    input_status: superseded
    closure_status: superseded
    closure_evidence_ref: trace_delta_ref:TD-04-summary
    requested_route: carry_forward_only
    disposition: superseded_carry_forward
    rerun_eligibility: not_requested
    carry_forward: true
    uncertainty: The trace-delta reference is indexed, but the replacement page identity and upstream reindex state are not supplied.
    next_required_evidence: None for routing unless an owning workflow requires supersession reindex confirmation.

closure_status_matrix:
  - action_id: AI-001
    status: open
    evidence_present: false
    owner_input_needed: false
    rerun_ready: false
    carry_forward: true
  - action_id: AI-002
    status: closure_evidence_supplied
    evidence_present: true
    owner_input_needed: false
    rerun_ready: true
    carry_forward: true
  - action_id: AI-003
    status: waiting_owner
    evidence_present: false
    owner_input_needed: true
    rerun_ready: false
    carry_forward: true
  - action_id: AI-004
    status: superseded
    evidence_present: true
    owner_input_needed: false
    rerun_ready: false
    carry_forward: true

unresolved_action_items:
  - action_id: AI-001
    closure_row_id: ACR-AI-001
    reason: Missing closure evidence for the U1 official-datasheet blocker.
  - action_id: AI-002
    closure_row_id: ACR-AI-002
    reason: Evidence is supplied, but owning-workflow incorporation and resulting closure are not established.
  - action_id: AI-003
    closure_row_id: ACR-AI-003
    reason: Owner resolution of IF_PWR direction remains required.

closure_ready_reruns:
  - rerun_route_id: CRR-AI-002
    action_id: AI-002
    target_workflow: verification_plan_from_page_contracts_v0
    supplied_evidence_ref:
      - owner_decision_ref:OD-17-summary
    readiness_basis: A closure evidence reference is supplied for the measurement-tolerance blocker.
    status: ready_to_request_rerun
    non_claim: The target workflow has not been represented as rerun or reindexed.

closure_blockers:
  - action_id: AI-001
    blocker: missing U1 official datasheet
    blocking_condition: No closure evidence reference is supplied.
    affected_route: source_gap_followup_packet_v0
  - action_id: AI-003
    blocker: IF_PWR direction ambiguous
    blocking_condition: Owner decision reference is absent.
    affected_route: owner_decision_request
  - action_id: AI-002
    blocker: owning workflow has not incorporated the supplied evidence
    blocking_condition: Evidence-reference presence alone does not establish closure.
    affected_route: verification_plan_from_page_contracts_v0

carry_forward_register:
  - carry_forward_id: CFR-AI-001
    action_id: AI-001
    status: open
    rationale: Retain until approved source evidence or disposition is supplied.
  - carry_forward_id: CFR-AI-002
    action_id: AI-002
    status: waiting_workflow_rerun
    rationale: Retain until the owning workflow incorporates the evidence and returns updated status.
  - carry_forward_id: CFR-AI-003
    action_id: AI-003
    status: waiting_owner
    rationale: Retain until an owner decision resolves IF_PWR direction.
  - carry_forward_id: CFR-AI-004
    action_id: AI-004
    status: superseded
    rationale: Preserve supersession history without reopening or declaring external closure.

owner_decision_request_queue:
  - request_id: ODR-AI-003
    action_id: AI-003
    decision_needed: Resolve the intended IF_PWR direction.
    originating_workflow: interface_control_and_harness_readiness_v0
    current_status: waiting_owner
    evidence_ref: null
    stop_condition: Do not select or infer the direction within this workflow.

closure_provenance:
  fixture_id: review_action_item_closure_loop_v0_public_synthetic_mixed_closure
  project_scope_key: public_closure_fixture
  derivation_scope:
    - current public workflow contract
    - current public step graph
    - supplied public-safe synthetic fixture
  upstream_sources_indexed:
    - review_gate_evidence_pack_v0
    - verification_plan_from_page_contracts_v0
    - interface_control_and_harness_readiness_v0
  indexed_evidence_refs:
    - owner_decision_ref:OD-17-summary
    - trace_delta_ref:TD-04-summary
  evidence_limitations:
    - Referenced evidence contents are not included.
    - Reference validity, completeness, and owning-workflow incorporation remain unestablished.
    - No conclusion beyond fixture-provided state is asserted.

boundary_review_note:
  result: boundary_preserved
  findings:
    - Upstream artifacts remain read-only in this deliverable.
    - No action is marked externally_closed_with_evidence.
    - AI-002 is routed as ready to request a rerun, not as rerun or closed.
    - AI-003 remains waiting_owner; no owner decision is inferred.
    - AI-004 remains superseded and carried forward without asserting upstream reindexing.
    - Missing evidence and uncertain incorporation states remain explicit.
  prohibited_claims_avoided:
    - upstream packet mutation
    - automatic action closure
    - owner approval beyond the supplied reference label
    - workflow rerun execution
    - verification execution
    - review-gate approval
