review_gate_packet:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  public_safe: true
  candidate_id: qe_55_medium_darkelf_auditor
  assigned_profile:
    model: gpt-5.5
    reasoning_effort: medium
    species: darkelf
    class: auditor
  project_binding:
    project_code: SYNTH_REVIEW_DEMO
    review_family: TRR_like
    secondary_lenses:
      - PDR_like
    owner_surface: synthetic_owner_board
    approval_claim_allowed: false
    verification_completion_claim_allowed: false
    upstream_mutation_allowed: false
  scope:
    scope_id: synthetic_ctrl_board_harness_trr
    scope_summary: Review readiness for holding a TRR-style conversation about a simulated controller-board XML harness and verification-plan handoff.
  packet_state: ready_with_named_caveats
  packet_claim:
    - Conversation/scheduling readiness only.
    - No review approval claimed.
    - No verification completion claimed.
    - No upstream evidence mutation claimed.

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
  - topic: power_readiness
    status: met
    supported_by:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
    finding: Power is supported as stable/authoritative/ready within the synthetic fixture.
    non_claim: Does not certify completed verification beyond source statements.
  - topic: CAN_termination
    status: partial
    supported_by:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    finding: CAN is partial/informative only; CAN_TERM remains review_required and GAP-CAN-TERM is open.
    non_claim: CAN termination is not upgraded to accepted, verified, or closed.
  - topic: CAN_loopback_fixture
    status: missing
    supported_by:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    finding: CAN loopback fixture is absent; VT-CAN-002 is blocked on fixture.
    non_claim: No CAN fixture availability is inferred.
  - topic: reset_timing
    status: missing
    supported_by:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
      - RR-001 / sha256:demo-rr001
    finding: Reset timing is conflicting; reset proposal exists but is not accepted; reset timing probe is not configured; GAP-RST-TIMING is open.
    non_claim: Reset timing is not accepted, resolved, probed, or verified.
  - topic: owner_decision
    status: missing
    supported_by:
      - ODR-001 / sha256:demo-odr001
    finding: No recorded owner decision exists.
    non_claim: No owner approval, owner closure, or accepted reset decision is claimed.

entrance_criteria_checklist:
  - criterion: Scope identified for TRR-like readiness conversation.
    status: met
    evidence_refs:
      - synthetic_ctrl_board_harness_trr
    note: Scope summary is present in fixture.
  - criterion: Public-safe source packet available.
    status: met
    evidence_refs:
      - SYNTH_REVIEW_DEMO
    note: Fixture marks public_safe true.
  - criterion: Required source refs and checksums preserved.
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
  - criterion: Known caveats are nameable before the review.
    status: partial
    evidence_refs:
      - TRR-001 / sha256:demo-trr001
      - SGF-001 / sha256:demo-sgf001
      - RR-001 / sha256:demo-rr001
    note: CAN/reset caveats are explicit, but unresolved.
  - criterion: Owner decision available before final gate closure.
    status: missing
    evidence_refs:
      - ODR-001 / sha256:demo-odr001
    note: No recorded owner decision.

success_criteria_checklist:
  - criterion: Power evidence can be discussed without known source conflict.
    status: met
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
  - criterion: CAN termination is resolved and accepted.
    status: missing
    evidence_refs:
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    note: CAN_TERM is review_required; GAP-CAN-TERM remains open.
  - criterion: CAN fixture is available for TRR execution.
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    note: CAN loopback fixture absent; VT-CAN-002 blocked.
  - criterion: Reset timing source conflict is resolved.
    status: missing
    evidence_refs:
      - TM-001 / sha256:demo-tm001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
      - RR-001 / sha256:demo-rr001
    note: Reset remains conflicting; proposal is not accepted.
  - criterion: Reset timing probe is configured.
    status: missing
    evidence_refs:
      - HRM-001 / sha256:demo-hrm001
    note: Reset timing probe not configured.
  - criterion: Owner decision recorded.
    status: missing
    evidence_refs:
      - ODR-001 / sha256:demo-odr001
    note: No recorded owner decision.

review_blockers:
  - blocker_id: BLK-CAN-FIXTURE-001
    scope: blocks_review_closure
    sourced_by:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
      - RR-001 / sha256:demo-rr001
    finding: CAN loopback fixture is absent and VT-CAN-002 is blocked on fixture.
    actionability: Route fixture availability or substitution decision to synthetic_owner_board before closure.
  - blocker_id: BLK-CAN-TERM-001
    scope: weakens_review_confidence
    sourced_by:
      - TM-001 / sha256:demo-tm001
      - EAM-001 / sha256:demo-eam001
      - ICP-001 / sha256:demo-icp001
      - SGF-001 / sha256:demo-sgf001
    finding: CAN termination is only partial/informative; CAN_TERM review_required; GAP-CAN-TERM open.
    actionability: Obtain owner disposition or additional source evidence; do not mark resolved from this packet.
  - blocker_id: BLK-RST-CONFLICT-001
    scope: blocks_review_closure
    sourced_by:
      - TM-001 / sha256:demo-tm001
      - ICP-001 / sha256:demo-icp001
      - VPS-001 / sha256:demo-vps001
      - SGF-001 / sha256:demo-sgf001
      - ODR-001 / sha256:demo-odr001
      - RR-001 / sha256:demo-rr001
    finding: Reset timing conflict is unresolved; reset proposal is not accepted.
    actionability: Route reset timing conflict to synthetic_owner_board for accepted decision or source correction.
  - blocker_id: BLK-RST-PROBE-001
    scope: blocks_review_closure
    sourced_by:
      - HRM-001 / sha256:demo-hrm001
      - VPS-001 / sha256:demo-vps001
    finding: Reset timing probe is not configured; VT-RST-003 blocked on timing source conflict.
    actionability: Configure probe or record owner-approved alternative evidence target before closure.
  - blocker_id: BLK-OWNER-DECISION-001
    scope: blocks_review_closure
    sourced_by:
      - ODR-001 / sha256:demo-odr001
    finding: No recorded owner decision.
    actionability: Record owner decision, deferral, or rejection on synthetic_owner_board.

action_item_register:
  - action_id: ACT-CAN-FIXTURE-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: CAN loopback fixture availability, substitution, or explicit deferral for VT-CAN-002.
    trigger_due_condition: Before review closure; earlier if TRR execution requires live CAN loopback.
    downstream_route: verification_plan_from_page_contracts_v0
    related_blocker: BLK-CAN-FIXTURE-001
  - action_id: ACT-CAN-TERM-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: Owner disposition for CAN_TERM review_required and GAP-CAN-TERM.
    trigger_due_condition: Before claiming CAN readiness or closing CAN-related review items.
    downstream_route: source_gap_followup_packet_v0
    related_blocker: BLK-CAN-TERM-001
  - action_id: ACT-RST-TIMING-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: Accepted reset timing source or explicit owner decision that resolves the conflict.
    trigger_due_condition: Before reset verification closure or any accepted reset timing claim.
    downstream_route: verification_plan_from_page_contracts_v0
    related_blocker: BLK-RST-CONFLICT-001
  - action_id: ACT-RST-PROBE-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: Reset timing probe configuration record or owner-approved alternative.
    trigger_due_condition: Before VT-RST-003 execution or review closure.
    downstream_route: interface_control_and_harness_readiness_v0
    related_blocker: BLK-RST-PROBE-001
  - action_id: ACT-OWNER-DECISION-001
    owner_routing_surface: synthetic_owner_board
    evidence_target: Recorded owner decision, proposed-decision rejection, or explicit deferral.
    trigger_due_condition: Before any approval, acceptance, or closure language is used.
    downstream_route: review_gate_evidence_pack_v0
    related_blocker: BLK-OWNER-DECISION-001

decision_summary:
  decision_status: no_owner_decision_recorded
  owner_surface: synthetic_owner_board
  supported_by:
    - ODR-001 / sha256:demo-odr001
  proposed_decisions:
    - Reset proposal exists but is not accepted.
  recorded_decisions:
    - none
  non_claims:
    - No owner approval recorded.
    - No reset timing acceptance recorded.
    - No CAN termination acceptance recorded.
    - No verification completion recorded.

review_gate_provenance:
  workflow_id: review_gate_evidence_pack_v0
  input_fixture_id: SYNTH_REVIEW_DEMO
  source_policy:
    used_only_public_safe_synthetic_fixture: true
    upstream_mutation_performed: false
    private_evidence_publicized: false
    invented_evidence: false
  preserved_refs_and_checksums:
    - TM-001 / sha256:demo-tm001
    - EAM-001 / sha256:demo-eam001
    - ICP-001 / sha256:demo-icp001
    - HRM-001 / sha256:demo-hrm001
    - VPS-001 / sha256:demo-vps001
    - TRR-001 / sha256:demo-trr001
    - SGF-001 / sha256:demo-sgf001
    - ODR-001 / sha256:demo-odr001
    - RR-001 / sha256:demo-rr001

readiness_summary:
  readiness_state: ready_with_named_caveats
  readiness_type: conversation_and_scheduling_readiness_only
  rationale:
    - TRR-001 permits ready_with_named_caveats only if CAN/reset blockers are named.
    - CAN termination, CAN fixture absence, reset timing conflict, missing reset probe, and missing owner decision are explicitly named.
    - Power appears supported by the fixture.
  not_ready_for:
    - Review approval.
    - Verification completion claim.
    - Review closure without blocker disposition.
    - Owner acceptance claims.

boundary_review_note:
  explicit_non_claims:
    - This packet does not approve the TRR-like review gate.
    - This packet does not certify verification completion.
    - This packet does not replace synthetic_owner_board judgment.
    - This packet does not mutate upstream evidence.
    - This packet does not make missing CAN fixture evidence true.
    - This packet does not upgrade CAN termination beyond review_required/partial/informative.
    - This packet does not resolve reset timing conflict or accept the reset proposal.
  residual_gaps:
    - CAN termination remains open via GAP-CAN-TERM.
    - CAN loopback fixture remains absent.
    - Reset timing conflict remains open via GAP-RST-TIMING.
    - Reset timing probe remains unconfigured.
    - Owner decision remains unrecorded.
  boundary_position: The fixture supports holding a readiness conversation with named caveats, but it does not support closure, approval, or verification completion.