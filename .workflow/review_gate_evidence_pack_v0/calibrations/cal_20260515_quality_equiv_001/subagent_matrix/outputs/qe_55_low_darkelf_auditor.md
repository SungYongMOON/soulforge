review_gate_packet:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  public_safe: true
  candidate_id: qe_55_low_darkelf_auditor
  review_family: TRR_like
  secondary_lenses:
    - PDR_like
  scope_id: synthetic_ctrl_board_harness_trr
  scope_summary: Review readiness for holding a TRR-style conversation about a simulated controller-board XML harness and verification-plan handoff.
  owner_surface: synthetic_owner_board
  readiness_state: ready_with_named_caveats
  readiness_basis: Conversation/scheduling readiness only, conditioned on naming CAN and reset blockers.
  non_claims:
    - Does not approve the review gate.
    - Does not certify verification completion.
    - Does not record owner judgment.
    - Does not mutate upstream evidence.
    - Does not make missing CAN/reset evidence true.

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
      - TM-001
      - EAM-001
      - ICP-001
      - VPS-001
    finding: Power is supported for review conversation; VT-PWR-001 is ready.
    limits: No approval or verification completion claim is made.
  - topic: can_termination
    status: partial
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - SGF-001
    finding: CAN is partial/informative; CAN_TERM remains review_required and GAP-CAN-TERM is open.
    limits: CAN termination is not upgraded to accepted, verified, or closed.
  - topic: can_loopback_fixture
    status: missing
    evidence_refs:
      - HRM-001
      - VPS-001
      - RR-001
    finding: CAN loopback fixture is absent; VT-CAN-002 is blocked on fixture.
    limits: Missing fixture evidence is not inferred or substituted.
  - topic: reset_timing
    status: conflicting
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - VPS-001
      - SGF-001
      - ODR-001
      - RR-001
    finding: Reset timing has a source conflict; reset proposal exists but is not accepted.
    limits: Reset timing is not upgraded beyond proposed/conflicting.
  - topic: reset_probe
    status: missing
    evidence_refs:
      - HRM-001
    finding: Reset timing probe is not configured.
    limits: No reset measurement readiness is claimed.
  - topic: owner_decision
    status: missing
    evidence_refs:
      - ODR-001
    finding: No recorded owner decision.
    limits: This packet cannot replace owner judgment.

entrance_criteria_checklist:
  - criterion: review_scope_identified
    status: met
    evidence_refs:
      - synthetic_ctrl_board_harness_trr
    note: Scope summary is present.
  - criterion: source_refs_available
    status: met
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - HRM-001
      - VPS-001
      - TRR-001
      - SGF-001
      - ODR-001
      - RR-001
    note: Public-safe source index is available with checksums preserved.
  - criterion: caveats_named_before_review
    status: partial
    evidence_refs:
      - TRR-001
      - RR-001
    note: Review may be held only if CAN/reset caveats are explicit.
  - criterion: can_fixture_available
    status: missing
    evidence_refs:
      - HRM-001
      - VPS-001
      - RR-001
    note: CAN loopback fixture is absent.
  - criterion: reset_conflict_resolved
    status: missing
    evidence_refs:
      - TM-001
      - ICP-001
      - VPS-001
      - SGF-001
      - ODR-001
    note: Reset timing conflict remains open.
  - criterion: owner_decision_recorded
    status: missing
    evidence_refs:
      - ODR-001
    note: No owner decision is recorded.

success_criteria_checklist:
  - criterion: review_conversation_can_be_scheduled_with_named_caveats
    status: partial
    evidence_refs:
      - TRR-001
      - RR-001
    note: Scheduling readiness exists only with explicit CAN/reset caveats.
  - criterion: power_evidence_ready_for_discussion
    status: met
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - VPS-001
    note: Power is supported and VT-PWR-001 is ready.
  - criterion: can_verification_ready_for_closure
    status: missing
    evidence_refs:
      - HRM-001
      - VPS-001
      - SGF-001
    note: CAN fixture and CAN_TERM gap remain open.
  - criterion: reset_verification_ready_for_closure
    status: missing
    evidence_refs:
      - HRM-001
      - VPS-001
      - SGF-001
      - ODR-001
    note: Reset timing conflict and missing probe prevent closure.
  - criterion: owner_decision_available_for_gate_disposition
    status: missing
    evidence_refs:
      - ODR-001
    note: No recorded owner decision exists.

review_blockers:
  - id: BLK-CAN-FIXTURE
    scope: blocks_review_closure
    sourced_by:
      - HRM-001
      - VPS-001
      - RR-001
    finding: CAN loopback fixture is absent; VT-CAN-002 is blocked.
    actionability: Route fixture availability or substitute owner-approved evidence path to synthetic_owner_board.
  - id: BLK-CAN-TERM
    scope: weakens_review_confidence
    sourced_by:
      - ICP-001
      - SGF-001
      - TM-001
      - EAM-001
    finding: CAN_TERM is review_required and GAP-CAN-TERM remains open.
    actionability: Resolve CAN termination evidence or carry as explicit review caveat.
  - id: BLK-RST-TIMING-CONFLICT
    scope: blocks_review_closure
    sourced_by:
      - TM-001
      - ICP-001
      - VPS-001
      - SGF-001
      - ODR-001
      - RR-001
    finding: Reset timing source conflict remains unresolved; proposal is not accepted.
    actionability: Obtain owner decision or source reconciliation before closure.
  - id: BLK-RST-PROBE
    scope: weakens_review_confidence
    sourced_by:
      - HRM-001
    finding: Reset timing probe is not configured.
    actionability: Configure probe or record why probe evidence is not required.
  - id: BLK-OWNER-DECISION
    scope: blocks_review_closure
    sourced_by:
      - ODR-001
    finding: No recorded owner decision.
    actionability: Route decision request to synthetic_owner_board.

action_item_register:
  - id: ACT-CAN-FIXTURE
    owner_routing_surface: synthetic_owner_board
    evidence_target: CAN loopback fixture availability or approved alternate evidence path for VT-CAN-002.
    trigger_due_condition: Before claiming TRR execution readiness or review closure.
    downstream_route: verification_plan_from_page_contracts_v0 and interface_control_and_harness_readiness_v0
  - id: ACT-CAN-TERM
    owner_routing_surface: synthetic_owner_board
    evidence_target: GAP-CAN-TERM disposition and CAN_TERM status update.
    trigger_due_condition: Before CAN evidence is treated as closure-ready.
    downstream_route: source_gap_followup_packet_v0 and interface_control_and_harness_readiness_v0
  - id: ACT-RST-TIMING
    owner_routing_surface: synthetic_owner_board
    evidence_target: Reset timing source conflict resolution or accepted owner decision.
    trigger_due_condition: Before VT-RST-003 can move out of blocked status.
    downstream_route: source_gap_followup_packet_v0 and verification_plan_from_page_contracts_v0
  - id: ACT-RST-PROBE
    owner_routing_surface: synthetic_owner_board
    evidence_target: Reset timing probe configuration evidence or owner-approved non-use rationale.
    trigger_due_condition: Before reset timing evidence is discussed as measured or execution-ready.
    downstream_route: interface_control_and_harness_readiness_v0
  - id: ACT-OWNER-DECISION
    owner_routing_surface: synthetic_owner_board
    evidence_target: Recorded owner decision for reset proposal and review disposition.
    trigger_due_condition: Before any approval, closure, or verification completion claim.
    downstream_route: review_gate_evidence_pack_v0 decision summary update

decision_summary:
  decision_status: no_owner_decision_recorded
  owner_surface: synthetic_owner_board
  approval_claim_allowed: false
  verification_completion_claim_allowed: false
  upstream_mutation_allowed: false
  recorded_decision_refs:
    - ODR-001
  finding: No recorded owner decision; reset proposal exists but is not accepted.
  non_claims:
    - No review approval is recorded.
    - No verification completion is recorded.
    - No reset timing acceptance is recorded.

review_gate_provenance:
  workflow_id: review_gate_evidence_pack_v0
  input_fixture_id: SYNTH_REVIEW_DEMO
  generated_from_public_safe_fixture: true
  source_preservation: Source refs and checksums preserved as supplied.
  mutation_statement: No upstream evidence mutation performed.
  evidence_boundary: Public-safe synthetic evidence only.
  approval_boundary: Owner judgment remains with synthetic_owner_board.

readiness_summary:
  readiness_state: ready_with_named_caveats
  readiness_type: conversation_scheduling_readiness_only
  can_hold_review_conversation: true
  conditions:
    - CAN fixture absence must be named.
    - CAN_TERM review_required/GAP-CAN-TERM must be named.
    - Reset timing conflict must be named.
    - Missing reset timing probe must be named.
    - No recorded owner decision must be named.
  not_ready_for:
    - review approval
    - verification completion claim
    - review closure
    - CAN closure
    - reset closure

boundary_review_note:
  explicit_non_claims:
    - This output did not inspect sources beyond the provided fixture.
    - This output does not certify power, CAN, or reset verification completion.
    - This output does not convert informative/proposed evidence into accepted evidence.
    - This output does not make private evidence public-safe.
    - This output does not replace synthetic_owner_board decisions.
  residual_gaps:
    - CAN loopback fixture absent.
    - CAN termination unresolved and review_required.
    - GAP-CAN-TERM open.
    - Reset timing conflict unresolved.
    - GAP-RST-TIMING open.
    - Reset timing probe not configured.
    - No recorded owner decision.