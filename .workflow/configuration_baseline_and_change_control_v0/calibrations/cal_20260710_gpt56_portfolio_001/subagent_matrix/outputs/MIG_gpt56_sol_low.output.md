configuration_baseline_packet:
  workflow_id: configuration_baseline_and_change_control_v0
  fixture_id: configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta
  project_scope_key: public_baseline_fixture
  source_mode: contract_only_synthetic
  public_safe: true
  packet_state: routing_ready_with_open_gaps
  authority:
    baseline_approval_granted: false
    change_approval_granted: false
    upstream_artifacts_mutated: false
    verification_results_accepted: false
  uncertainty:
    - Full checksums are unavailable.
    - CR-003 has no evidence reference.
    - No owner approval or closure evidence is supplied.

baseline_inventory:
  - baseline_id: BL-REQ-001
    artifact_ref: requirements_packet_summary
    version: v0.3
    checksum_state: present_public_prefix_only
    approval_state: reference_only
    inventory_disposition: inventoried_not_approved
  - baseline_id: BL-PAGE-007
    artifact_ref: page_module_spec_summary
    version: v0.2
    checksum_state: missing
    approval_state: draft
    inventory_disposition: gap_open
  - baseline_id: BL-HARNESS-002
    artifact_ref: harness_trace_delta_summary
    version: v0.1
    checksum_state: present_public_prefix_only
    approval_state: review_required
    inventory_disposition: owner_review_required

change_request_register:
  - change_id: CR-001
    source: review_action_item_closure_loop_v0
    evidence_ref: owner_decision_ref:OD-17-summary
    change_type: measurement_tolerance_update
    affected_refs:
      - BL-REQ-001
    approval_state: not_approved_here
    register_state: recorded_pending_external_approval
  - change_id: CR-002
    source: page_module_trace_matrix_v0
    evidence_ref: trace_delta_ref:TD-04-summary
    change_type: page_identity_refresh
    affected_refs:
      - BL-PAGE-007
    approval_state: not_approved_here
    register_state: recorded_pending_external_approval
  - change_id: CR-003
    source: interface_control_and_harness_readiness_v0
    evidence_ref: null
    change_type: interface_direction_pending
    affected_refs:
      - BL-HARNESS-002
    approval_state: owner_waiting
    register_state: blocked_pending_evidence_and_owner_direction

impact_matrix:
  - change_id: CR-001
    baseline_id: BL-REQ-001
    confirmed_impact: measurement_tolerance_change_proposed
    potential_consumers:
      - verification_plan_from_page_contracts_v0
      - review_gate_evidence_pack_v0
    uncertainty: Method or readiness impact is not established by the supplied summary.
    routing_basis: Route conditionally because tolerance changes may affect verification methods or review evidence.
  - change_id: CR-002
    baseline_id: BL-PAGE-007
    confirmed_impact: page_identity_refresh_proposed
    potential_consumers:
      - review_gate_evidence_pack_v0
    uncertainty: Method or readiness impact is not established.
    routing_basis: Route updated identity and trace references to the review evidence consumer after approval.
  - change_id: CR-003
    baseline_id: BL-HARNESS-002
    confirmed_impact: interface_direction_unresolved
    potential_consumers:
      - verification_plan_from_page_contracts_v0
      - review_gate_evidence_pack_v0
    uncertainty: No evidence reference establishes the proposed interface direction or its downstream effect.
    routing_basis: Hold reruns until evidence and owner direction exist.

baseline_gap_register:
  - gap_id: BG-001
    baseline_id: BL-REQ-001
    gap_type: incomplete_checksum
    state: open
    required_resolution: Provide an authorized checksum reference or explicitly accept prefix-only identification under the approved policy.
    owner_boundary: Resolution and acceptance remain outside this workflow.
  - gap_id: BG-002
    baseline_id: BL-PAGE-007
    gap_type: missing_checksum
    state: open
    required_resolution: Supply the checksum for the identified draft version.
    owner_boundary: This workflow does not create or approve the checksum.
  - gap_id: BG-003
    baseline_id: BL-PAGE-007
    gap_type: draft_baseline
    state: open
    required_resolution: Obtain an external disposition for the draft and CR-002.
    owner_boundary: Baseline approval remains with the designated owner.
  - gap_id: BG-004
    baseline_id: BL-HARNESS-002
    gap_type: incomplete_checksum
    state: open
    required_resolution: Provide an authorized checksum reference or approved prefix-only disposition.
    owner_boundary: Resolution and acceptance remain outside this workflow.
  - gap_id: BG-005
    baseline_id: BL-HARNESS-002
    gap_type: missing_change_evidence
    related_change_id: CR-003
    state: blocked
    required_resolution: Supply a public-safe evidence reference describing the pending interface direction.
    owner_boundary: This workflow cannot infer the interface decision.
  - gap_id: BG-006
    baseline_id: BL-HARNESS-002
    gap_type: owner_decision_pending
    related_change_id: CR-003
    state: blocked
    required_resolution: Owner must decide or formally defer the interface direction.
    owner_boundary: This workflow records but does not make the decision.

rerun_routing:
  - route_id: RR-001
    change_id: CR-001
    target_workflow: verification_plan_from_page_contracts_v0
    trigger: External approval confirms a tolerance change that affects verification methods or readiness.
    state: conditional_hold
    payload_boundary: Approved baseline reference and sanitized change-control action only.
  - route_id: RR-002
    change_id: CR-001
    target_workflow: review_gate_evidence_pack_v0
    trigger: CR-001 receives external disposition and updated baseline references are available.
    state: conditional_hold
    payload_boundary: Updated references and change-control actions; no upstream mutation.
  - route_id: RR-003
    change_id: CR-002
    target_workflow: review_gate_evidence_pack_v0
    trigger: CR-002 is externally approved and BL-PAGE-007 identity plus checksum gaps are resolved.
    state: blocked
    payload_boundary: Approved identity and trace-reference delta only.
  - route_id: RR-004
    change_id: CR-003
    target_workflow: verification_plan_from_page_contracts_v0
    trigger: Evidence and owner direction establish an interface change affecting methods or readiness.
    state: blocked
    payload_boundary: Owner-disposed interface change and sanitized evidence reference only.
  - route_id: RR-005
    change_id: CR-003
    target_workflow: review_gate_evidence_pack_v0
    trigger: Evidence, owner disposition, and updated baseline references become available.
    state: blocked
    payload_boundary: Updated references and change-control actions only.
  - route_id: RR-006
    target_workflow: functional_configuration_audit_page_library_v0
    trigger: Downstream workflow becomes active and accepts the inventory and register.
    state: planned_not_executed
    payload_boundary:
      - baseline_inventory
      - change_request_register

owner_followup_needed:
  required: true
  items:
    - followup_id: OF-001
      subject: CR-001
      request: Provide the external approval or rejection disposition and identify whether verification methods or readiness change.
    - followup_id: OF-002
      subject: BL-PAGE-007
      request: Provide its checksum and the external disposition for draft status and CR-002.
    - followup_id: OF-003
      subject: CR-003
      request: Provide an evidence reference and owner decision or formal deferral for the interface direction.
    - followup_id: OF-004
      subject: checksum_policy
      request: Clarify whether public-prefix-only checksum identification is acceptable under the approved change-control policy.

closure_handoff:
  overall_state: open_not_closable
  open_changes:
    - CR-001
    - CR-002
    - CR-003
  blocked_changes:
    - CR-003
  open_gaps:
    - BG-001
    - BG-002
    - BG-003
    - BG-004
    - BG-005
    - BG-006
  stop_conditions:
    - Do not mark any baseline or change request approved without an external owner disposition.
    - Do not trigger a rerun while its stated evidence, approval, or baseline-identification prerequisites remain unmet.
    - Do not infer CR-003 interface direction or impact from the baseline name.
    - Do not alter upstream packets, trace matrices, plans, or closure records.
    - Do not close the packet while any blocking gap remains unresolved.
  next_handoff_condition: Reassess routing only after owner dispositions, required evidence references, and checksum-policy resolutions are supplied.

boundary_review_note:
  result: boundary_preserved
  statements:
    - This packet is an inventory and routing artifact, not baseline approval.
    - Registering CR-001, CR-002, and CR-003 does not approve them.
    - Upstream artifacts remain read-only and unchanged.
    - No verification result is accepted by this deliverable.
    - Rerun entries are triggers or holds, not claims that reruns occurred.
    - Missing evidence, checksums, approvals, and impact determinations remain explicit.
    - All identifiers and references remain synthetic and public-safe.
