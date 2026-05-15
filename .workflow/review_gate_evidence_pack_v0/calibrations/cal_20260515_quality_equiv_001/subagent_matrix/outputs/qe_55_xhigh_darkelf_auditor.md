review_gate_packet:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  candidate_id: qe_55_xhigh_darkelf_auditor
  public_safe: true
  project_code: SYNTH_REVIEW_DEMO
  review_family: TRR_like
  secondary_lenses:
    - PDR_like
  scope_id: synthetic_ctrl_board_harness_trr
  scope_summary: Review readiness for holding a TRR-style conversation about a simulated controller-board XML harness and verification-plan handoff.
  owner_surface: synthetic_owner_board
  packet_readiness_state: ready_with_named_caveats
  readiness_limited_to: conversation_scheduling_readiness
  approval_claim: not_claimed
  verification_completion_claim: not_claimed
  upstream_mutation: not_performed

source_index:
  - ref: TM-001
    checksum_sha256: sha256:demo-tm001
    owning_workflow_id: page_module_trace_matrix_v0
    summary: Power supported; CAN partial; reset conflicting.
  - ref: EAM-001
    checksum_sha256: sha256:demo-eam001
    owning_workflow_id: page_module_trace_matrix_v0
    summary: Power authoritative; CAN informative; reset proposed only.
  - ref: ICP-001
    checksum_sha256: sha256:demo-icp001
    owning_workflow_id: interface_control_and_harness_readiness_v0
    summary: PWR stable; CAN_TERM review_required; RESET conflicting.
  - ref: HRM-001
    checksum_sha256: sha256:demo-hrm001
    owning_workflow_id: interface_control_and_harness_readiness_v0
    summary: Smoke harness available; CAN loopback fixture absent; reset timing probe not configured.
  - ref: VPS-001
    checksum_sha256: sha256:demo-vps001
    owning_workflow_id: verification_plan_from_page_contracts_v0
    summary: VT-PWR-001 ready; VT-CAN-002 blocked on fixture; VT-RST-003 blocked on timing source conflict.
  - ref: TRR-001
    checksum_sha256: sha256:demo-trr001
    owning_workflow_id: verification_plan_from_page_contracts_v0
    summary: Ready_with_named_caveats only if CAN/reset blockers are named.
  - ref: SGF-001
    checksum_sha256: sha256:demo-sgf001
    owning_workflow_id: source_gap_followup_packet_v0
    summary: GAP-CAN-TERM and GAP-RST-TIMING open.
  - ref: ODR-001
    checksum_sha256: sha256:demo-odr001
    owning_workflow_id: synthetic_owner_board
    summary: No recorded owner decision; reset proposal exists but is not accepted.
  - ref: RR-001
    checksum_sha256: sha256:demo-rr001
    owning_workflow_id: synthetic_owner_board
    summary: CAN fixture absence may block TRR execution; reset conflict may weaken confidence.

evidence_matrix:
  - topic: power
    status: supported
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
    evidence_read: PWR stable; VT-PWR-001 ready; power support is allowed to stand.
    residual_gap: none stated in fixture
  - topic: CAN termination
    status: partial
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    evidence_read: CAN is partial/informative; CAN_TERM is review_required; GAP-CAN-TERM remains open.
    residual_gap: no owner-accepted CAN termination disposition
  - topic: CAN loopback fixture
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    evidence_read: CAN loopback fixture is absent; VT-CAN-002 is blocked on fixture; absence may block TRR execution.
    residual_gap: no recorded available CAN fixture evidence
  - topic: reset timing
    status: conflicting
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
      - RR-001 / sha256:demo-rr001
    evidence_read: Reset is conflicting; reset proposal exists only as proposed and is not accepted; GAP-RST-TIMING remains open.
    residual_gap: no accepted reset timing source
  - topic: reset timing probe
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
    evidence_read: reset timing probe is not configured.
    residual_gap: no recorded reset probe configuration evidence
  - topic: owner decision
    status: missing
    evidence_refs:
      - ODR-001 / sha256:demo-odr001
    evidence_read: no recorded owner decision; reset proposal is not accepted.
    residual_gap: owner decision remains absent

entrance_criteria_checklist:
  - criterion: source_refs_available
    status: met
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - TRR-001 / sha256:demo-trr001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
      - RR-001 / sha256:demo-rr001
    note: fixture provides public-safe source index.
  - criterion: scope_defined
    status: met
    evidence_refs:
      - fixture_scope
    note: TRR-like conversation scope is defined.
  - criterion: power_evidence_sufficient_for_conversation
    status: met
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
    note: power is supported/stable and VT-PWR-001 is ready.
  - criterion: CAN_and_reset_caveats_named_before_review
    status: partial
    evidence_refs:
      - TRR-001 / sha256:demo-trr001
      - SGF-001 / sha256:demo-sgf001
      - RR-001 / sha256:demo-rr001
    note: caveats are named in this packet, but evidence gaps remain open.
  - criterion: owner_decision_available_before_review
    status: missing
    evidence_refs:
      - ODR-001 / sha256:demo-odr001
    note: no recorded owner decision exists.

success_criteria_checklist:
  - criterion: review_can_close_power_thread
    status: partial
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
    note: power is supported, but closure still requires owner review judgment.
  - criterion: review_can_close_CAN_termination_thread
    status: missing
    evidence_refs:
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    note: CAN_TERM remains review_required and GAP-CAN-TERM is open.
  - criterion: review_can_execute_CAN_verification_thread
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    note: CAN loopback fixture is absent; VT-CAN-002 is blocked.
  - criterion: review_can_close_reset_timing_thread
    status: missing
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
    note: reset timing source conflict remains unresolved; reset proposal is not accepted.
  - criterion: reset_probe_ready_for_timing_evidence
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
    note: reset timing probe is not configured.
  - criterion: owner_decision_recorded
    status: missing
    evidence_refs:
      - ODR-001 / sha256:demo-odr001
    note: no owner decision is recorded.

review_blockers:
  - blocker_id: BLK-CAN-TERM-001
    scope: blocks_review_closure
    sourced_by:
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    issue: CAN termination is review_required and GAP-CAN-TERM remains open.
    actionability: route CAN termination disposition to synthetic_owner_board; record accepted termination evidence or keep closure blocked.
  - blocker_id: BLK-CAN-FIXTURE-001
    scope: blocks_review_scheduling
    sourced_by:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    issue: CAN loopback fixture is absent and VT-CAN-002 is blocked on fixture.
    actionability: provide fixture availability evidence or explicitly schedule review as caveated conversation only.
  - blocker_id: BLK-RST-CONFLICT-001
    scope: blocks_review_closure
    sourced_by:
      - TM-001 / sha256:demo-tm001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
    issue: reset timing source conflict remains open; proposal is not owner-accepted.
    actionability: route conflict resolution to synthetic_owner_board and produce accepted reset timing source evidence.
  - blocker_id: BLK-RST-PROBE-001
    scope: weakens_review_confidence
    sourced_by:
      - HRM-001 / sha256:demo-hrm001
    issue: reset timing probe is not configured.
    actionability: configure probe or record why reset probe evidence is deferred.
  - blocker_id: BLK-OWNER-DECISION-001
    scope: blocks_review_closure
    sourced_by:
      - ODR-001 / sha256:demo-odr001
    issue: no recorded owner decision exists.
    actionability: owner board must record decision, deferral, or explicit non-approval state.

action_item_register:
  - action_id: ACT-CAN-TERM-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: accepted CAN termination disposition or explicit continued GAP-CAN-TERM record
    trigger_due_condition: before review closure; before any claim that CAN termination is resolved
    downstream_route: source_gap_followup_packet_v0 and review_gate_evidence_pack_v0 refresh
  - action_id: ACT-CAN-FIXTURE-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: CAN loopback fixture availability evidence or recorded caveated scheduling decision
    trigger_due_condition: before TRR execution or before scheduling as anything stronger than caveated conversation
    downstream_route: verification_plan_from_page_contracts_v0 and interface_control_and_harness_readiness_v0
  - action_id: ACT-RST-TIMING-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: owner-accepted reset timing source resolving conflict
    trigger_due_condition: before reset verification closure or any accepted reset timing claim
    downstream_route: source_gap_followup_packet_v0 and verification_plan_from_page_contracts_v0
  - action_id: ACT-RST-PROBE-001
    owner_routing_surface: interface_control_and_harness_readiness_v0
    evidence_target: reset timing probe configured evidence or owner-approved deferral note
    trigger_due_condition: before reset timing evidence collection
    downstream_route: verification_plan_from_page_contracts_v0
  - action_id: ACT-OWNER-DECISION-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: recorded owner decision, recorded deferral, or explicit no-approval decision
    trigger_due_condition: before review closure or approval language
    downstream_route: decision_summary update and review_gate_evidence_pack_v0 refresh

decision_summary:
  decision_status: no_owner_decision_recorded
  owner_surface: synthetic_owner_board
  evidence_refs:
    - ODR-001 / sha256:demo-odr001
  current_decision_read: no recorded owner decision; reset proposal exists but is not accepted.
  proposed_packet_position: ready_with_named_caveats for conversation scheduling only.
  approval_status: not_approved
  verification_completion_status: not_claimed

review_gate_provenance:
  workflow_id: review_gate_evidence_pack_v0
  input_fixture_id: SYNTH_REVIEW_DEMO
  generated_from: public_safe_synthetic_fixture_only
  source_preservation: all provided refs and checksums preserved
  upstream_mutation_allowed: false
  upstream_mutation_performed: false
  private_evidence_publication: not_performed
  non_claims:
    - does_not_approve_review_gate
    - does_not_certify_verification_completion
    - does_not_replace_owner_judgment
    - does_not_make_missing_sources_true
    - does_not_upgrade_CAN_termination_status
    - does_not_upgrade_reset_timing_status

readiness_summary:
  readiness_state: ready_with_named_caveats
  readiness_scope: conversation_scheduling_readiness_only
  basis:
    - TRR-001 allows ready_with_named_caveats only if CAN/reset blockers are named.
    - This packet names CAN termination, missing CAN fixture, reset timing conflict, missing reset probe, and missing owner decision.
    - Power is supported, but that does not close the review.
  caveats:
    - CAN termination remains review_required/open.
    - CAN loopback fixture is absent.
    - Reset timing conflict remains unresolved.
    - Reset timing probe is not configured.
    - No owner decision is recorded.
  not_ready_for:
    - review approval
    - verification completion claim
    - CAN closure
    - reset timing closure
    - owner-decision closure

boundary_review_note:
  public_safe_boundary: maintained
  inspected_material: prompt_fixture_only
  explicit_non_claims:
    - No local files, commands, browsing, or external inspection are claimed.
    - No owner approval is inferred.
    - No verification result is invented.
    - No CAN termination closure is inferred from partial/informative evidence.
    - No reset timing acceptance is inferred from a proposal.
  residual_gaps:
    - GAP-CAN-TERM remains open.
    - GAP-RST-TIMING remains open.
    - CAN loopback fixture evidence is missing.
    - Reset timing probe configuration evidence is missing.
    - Owner decision record is missing.