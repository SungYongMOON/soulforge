```yaml
configuration_baseline_packet:
  workflow_id: configuration_baseline_and_change_control_v0
  fixture_id: configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta
  project_scope_key: public_baseline_fixture
  source_mode: contract_only_synthetic
  public_safe: true
  approval_status: reference_and_routing_only
  baseline_approval: not_performed
  upstream_artifact_mutation: not_performed

baseline_inventory:
  - baseline_id: BL-REQ-001
    artifact_ref: requirements_packet_summary
    version: v0.3
    checksum_state: present_public_prefix_only
    approval_state: reference_only
    change_request_ids: [CR-001]

  - baseline_id: BL-PAGE-007
    artifact_ref: page_module_spec_summary
    version: v0.2
    checksum_state: missing
    approval_state: draft
    change_request_ids: [CR-002]

  - baseline_id: BL-HARNESS-002
    artifact_ref: harness_trace_delta_summary
    version: v0.1
    checksum_state: present_public_prefix_only
    approval_state: review_required
    change_request_ids: [CR-003]

change_request_register:
  - change_id: CR-001
    affected_refs: [BL-REQ-001]
    source: review_action_item_closure_loop_v0
    evidence_ref: owner_decision_ref:OD-17-summary
    change_type: measurement_tolerance_update
    approval_state: not_approved_here
    disposition: route_for_owner_decision_and_impact_review

  - change_id: CR-002
    affected_refs: [BL-PAGE-007]
    source: page_module_trace_matrix_v0
    evidence_ref: trace_delta_ref:TD-04-summary
    change_type: page_identity_refresh
    approval_state: not_approved_here
    disposition: route_for owner_decision_and_impact_review

  - change_id: CR-003
    affected_refs: [BL-HARNESS-002]
    source: interface_control_and_harness_readiness_v0
    evidence_ref: null
    change_type: interface_direction_pending
    approval_state: owner_waiting
    disposition: stop_until_owner_decision_and_supporting_evidence

impact_matrix:
  - change_id: CR-001
    affected_baseline_refs: [BL-REQ-001]
    impact_status: impact_not_verified_here
    possible_impact: methods_or_readiness
    downstream_route:
      - workflow_id: verification_plan_from_page_contracts_v0
        route_status: conditional_rerun_trigger
        condition: owner-approved tolerance update affects verification methods or readiness
      - workflow_id: review_gate_evidence_pack_v0
        route_status: conditional_rerun_trigger
        condition: approved change updates review evidence or action closure state

  - change_id: CR-002
    affected_baseline_refs: [BL-PAGE-007]
    impact_status: impact_not_verified_here
    possible_impact: page_identity_and_page_contract_references
    downstream_route:
      - workflow_id: verification_plan_from_page_contracts_v0
        route_status: conditional_rerun_trigger
        condition: approved identity refresh changes verification-plan inputs
      - workflow_id: review_gate_evidence_pack_v0
        route_status: conditional_rerun_trigger
        condition: updated baseline references affect review-gate evidence

  - change_id: CR-003
    affected_baseline_refs: [BL-HARNESS-002]
    impact_status: unresolved
    possible_impact: interface_and_harness_readiness
    downstream_route:
      - workflow_id: verification_plan_from_page_contracts_v0
        route_status: blocked_pending_owner_decision
        condition: owner confirms interface direction and supplies supporting evidence
    stop_condition: do_not_route_as_approved_change

baseline_gap_register:
  - gap_id: BG-001
    baseline_id: BL-PAGE-007
    gap_type: checksum_missing
    evidence_state: confirmed_by_fixture
    action: obtain_or_record an approved checksum through the authorized owner path
    approval_required: true

  - gap_id: BG-002
    baseline_id: BL-HARNESS-002
    gap_type: approval_and_interface_direction_unresolved
    evidence_state: owner_waiting; evidence_ref_missing
    action: obtain owner decision and supporting evidence
    approval_required: true

  - gap_id: BG-003
    baseline_id: BL-REQ-001
    gap_type: reference_only_and_tolerance_change_unapproved
    evidence_state: change_request_present; approval_not_present_here
    action: preserve current reference state and await owner decision
    approval_required: true

rerun_routing:
  default: no_rerun_until_owner_authorized_change_is_available
  routes:
    - change_id: CR-001
      target_workflow: verification_plan_from_page_contracts_v0
      status: conditional
      trigger: approved tolerance change affects methods_or_readiness
    - change_id: CR-001
      target_workflow: review_gate_evidence_pack_v0
      status: conditional
      trigger: approved change alters review evidence or action closure
    - change_id: CR-002
      target_workflow: verification_plan_from_page_contracts_v0
      status: conditional
      trigger: approved page identity refresh affects verification inputs
    - change_id: CR-002
      target_workflow: review_gate_evidence_pack_v0
      status: conditional
      trigger: updated page baseline reference affects review evidence
    - change_id: CR-003
      target_workflow: verification_plan_from_page_contracts_v0
      status: blocked
      trigger: owner decision and evidence required

owner_followup_needed:
  - item_id: OF-001
    related_ids: [CR-001]
    request: decide whether the measurement tolerance update is approved and identify its authoritative baseline state
  - item_id: OF-002
    related_ids: [CR-002]
    request: decide whether the page identity refresh is approved and provide the authoritative baseline reference state
  - item_id: OF-003
    related_ids: [CR-003, BL-HARNESS-002]
    request: provide the interface direction decision and supporting evidence
  - item_id: OF-004
    related_ids: [BL-PAGE-007]
    request: provide or authorize the checksum state for the page baseline

closure_handoff:
  status: open
  carry_forward:
    - unresolved owner decisions for CR-001, CR-002, and CR-003
    - missing checksum for BL-PAGE-007
    - review-required state for BL-HARNESS-002
  closure_criteria:
    - owner decisions recorded for pending changes
    - authoritative baseline references and checksum states recorded
    - conditional downstream reruns routed when trigger conditions are met
    - no unresolved baseline-affecting change remains unclassified
  closure_owner: owner_to_be_identified

boundary_review_note:
  baseline_packet_is_not_baseline_approval: true
  change_request_register_is_not_change_approval: true
  upstream_artifacts_are_read_only: true
  verification_results_accepted_here: false
  claims_not_made:
    - no baseline was approved
    - no change request was approved
    - no upstream artifact was edited
    - no verification result was accepted
    - no impact beyond the fixture-supported possibilities was asserted
  stop_conditions:
    - stop approval claims when approval_state is not approved_here
    - stop rerun routing when required owner authorization or evidence is absent
    - stop closure when unresolved gaps or owner follow-ups remain
```
