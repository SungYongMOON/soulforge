fixture_id: SYNTH_REVIEW_DEMO
deliverable_kind: review_gate_evidence_pack
public_safe: true

review_gate_packet:
  project_code: SYNTH_REVIEW_DEMO
  scope_id: synthetic_ctrl_board_harness_trr
  scope_summary: Review readiness for holding a TRR-style conversation about a simulated controller-board XML harness and verification-plan handoff.
  owner_surface: synthetic_owner_board
  workflow_mode: scope_review_pack
  primary_review_family: TRR_like
  primary_review_question: Is the test, simulation, inspection, analysis, or demonstration activity ready enough to discuss running it?
  secondary_lenses:
    - review_family: PDR_like
      question: Is the proposed design direction credible enough for preliminary review and follow-up planning?
  bounded_assessment:
    power:
      state: supported
      summary: Power trace, interface, harness, and verification-plan evidence indicate that VT-PWR-001 is ready.
      source_refs: [TM-001, EAM-001, ICP-001, HRM-001, VPS-001]
    can:
      state: partial
      summary: CAN evidence is informative or review-required; GAP-CAN-TERM remains open and the loopback fixture is absent.
      source_refs: [TM-001, EAM-001, ICP-001, HRM-001, VPS-001, SGF-001, RR-001]
    reset:
      state: conflicting
      summary: Reset trace and interface evidence conflict; the timing probe is not configured and the reset proposal is not owner-accepted.
      source_refs: [TM-001, EAM-001, ICP-001, HRM-001, VPS-001, SGF-001, ODR-001, RR-001]
  readiness_state: ready_with_named_caveats
  readiness_basis:
    - The bounded handoff states that a review conversation may be held if the CAN and reset blockers are explicitly named.
    - Power has supported evidence for discussion.
    - CAN execution remains blocked by the absent loopback fixture.
    - Reset readiness remains constrained by conflicting timing evidence and no accepted owner decision.
  review_conversation_constraints:
    - Do not represent CAN or reset verification as ready for execution.
    - Do not resolve the reset conflict within this pack.
    - Keep proposals separate from owner decisions.
    - Treat upstream artifacts as read-only.
  non_claims:
    - This evidence pack does not approve the review gate.
    - This evidence pack does not certify verification completion.
    - This evidence pack does not replace owner judgment.
    - This evidence pack does not make missing sources true.
    - This evidence pack does not mutate upstream evidence.
    - This evidence pack does not make private evidence public-safe.

source_index:
  scope: synthetic_ctrl_board_harness_trr
  bounded: true
  sources:
    - artifact_ref: TM-001
      artifact_kind: trace_matrix
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-tm001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [power_trace, can_trace, reset_trace]
    - artifact_ref: EAM-001
      artifact_kind: evidence_authority_map
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-eam001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [claim_authority, reset_proposal_boundary]
    - artifact_ref: ICP-001
      artifact_kind: interface_control_packet
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-icp001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [interface_readiness, secondary_pdr_lens]
    - artifact_ref: HRM-001
      artifact_kind: harness_readiness_matrix
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-hrm001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [resource_readiness, harness_gaps]
    - artifact_ref: VPS-001
      artifact_kind: verification_plan_summary
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-vps001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [verification_activity_readiness, blocked_tests]
    - artifact_ref: TRR-001
      artifact_kind: trr_readiness_handoff
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-trr001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [conditional_conversation_readiness]
    - artifact_ref: SGF-001
      artifact_kind: source_gap_followup_packet
      owning_workflow_id: source_gap_followup_packet_v0
      checksum_sha256: sha256:demo-sgf001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [can_gap, reset_gap, retry_routing]
    - artifact_ref: ODR-001
      artifact_kind: owner_decision_record
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-odr001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [decision_status, reset_proposal_boundary]
    - artifact_ref: RR-001
      artifact_kind: risk_or_open_question_register
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-rr001
      approval_scope: synthetic_fixture_only
      freshness_note: not_supplied
      consumed_for: [can_execution_risk, reset_confidence_risk]
  source_limitations:
    - Freshness dates and approval dates were not supplied.
    - No verification-result packet was supplied.
    - No configuration-baseline reference was supplied.
    - Source summaries are the only payload-level evidence available in this fixture.

evidence_matrix:
  primary_review_family: TRR_like
  rows:
    - question_id: TRR-Q1
      question: Is the verification activity defined well enough for a review conversation?
      state: partial
      evidence_refs: [VPS-001, TRR-001]
      basis: Three synthetic verification activities are identified, but two remain blocked.
      explicit_gaps: [GAP-CAN-TERM, GAP-RST-TIMING]
    - question_id: TRR-Q2
      question: Are required harness resources available or explicitly constrained?
      state: partial
      evidence_refs: [HRM-001, VPS-001, RR-001]
      basis: The smoke harness is available; the CAN loopback fixture and reset timing-probe configuration are absent.
      explicit_gaps: [CAN-loopback-fixture, RESET-timing-probe-configuration]
    - question_id: TRR-Q3
      question: Are source and interface conflicts visible?
      state: supported
      evidence_refs: [TM-001, EAM-001, ICP-001, SGF-001, ODR-001]
      basis: CAN termination remains review-required, and reset timing remains conflicting and proposed-only.
      explicit_gaps: [GAP-CAN-TERM, GAP-RST-TIMING]
    - question_id: TRR-Q4
      question: Is residual risk explicit enough to discuss whether and how testing should proceed?
      state: supported
      evidence_refs: [TRR-001, RR-001]
      basis: The CAN execution risk and reset confidence risk are explicitly named.
      explicit_gaps: []
    - question_id: TRR-Q5
      question: Is verification completion demonstrated?
      state: missing
      evidence_refs: []
      basis: No accepted verification-result packet is supplied.
      explicit_gaps: [accepted-verification-results]
    - question_id: PDR-Q1
      question: Are interface and harness design directions credible enough for preliminary follow-up planning?
      state: partial
      evidence_refs: [ICP-001, HRM-001, EAM-001]
      basis: Power is stable, while CAN termination requires review and reset remains conflicting.
      explicit_gaps: [GAP-CAN-TERM, GAP-RST-TIMING]
    - question_id: PDR-Q2
      question: Are unresolved design choices backed by owner decisions?
      state: missing
      evidence_refs: [ODR-001]
      basis: No owner decision is recorded; the reset position remains a proposal.
      explicit_gaps: [accepted-reset-timing-decision]

entrance_criteria_checklist:
  purpose: Determine whether the bounded review conversation is worth holding; these are not system pass/fail criteria.
  criteria:
    - criterion_id: ENT-001
      criterion: Review scope, primary family, secondary lens, and owner surface are explicit.
      status: met
      evidence_refs: [synthetic_ctrl_board_harness_trr]
      owner_or_route: synthetic_owner_board
    - criterion_id: ENT-002
      criterion: Verification activities and their current readiness states are identifiable.
      status: met
      evidence_refs: [VPS-001, TRR-001]
      owner_or_route: verification_plan_from_page_contracts_v0
    - criterion_id: ENT-003
      criterion: Required harness resources and resource gaps are visible.
      status: partial
      evidence_refs: [HRM-001, RR-001]
      explicit_gap: CAN loopback fixture absent; reset timing probe not configured.
      owner_or_route: interface_control_and_harness_readiness_v0
    - criterion_id: ENT-004
      criterion: Material source and interface conflicts are named.
      status: met
      evidence_refs: [TM-001, ICP-001, SGF-001]
      owner_or_route: source_gap_followup_packet_v0
    - criterion_id: ENT-005
      criterion: Proposals and owner decisions are distinguishable.
      status: met
      evidence_refs: [EAM-001, ODR-001]
      owner_or_route: synthetic_owner_board
    - criterion_id: ENT-006
      criterion: CAN and reset blockers are named in the review agenda.
      status: partial
      evidence_refs: [TRR-001, SGF-001, RR-001]
      explicit_gap: Agenda adoption is not evidenced.
      owner_or_route: synthetic_owner_board
    - criterion_id: ENT-007
      criterion: Evidence freshness is known.
      status: missing
      evidence_refs: []
      explicit_gap: No freshness dates or approval dates supplied.
      owner_or_route: synthetic_owner_board

success_criteria_checklist:
  purpose: Define intended review outcomes; these are not implementation promises or evidence of closure.
  criteria:
    - criterion_id: SUC-001
      criterion: Establish whether VT-PWR-001 may proceed to its separately authorized execution path.
      status: partial
      evidence_refs: [VPS-001, HRM-001]
      unresolved_outcome: Review or owner disposition not recorded.
      owner_or_route: synthetic_owner_board
    - criterion_id: SUC-002
      criterion: Assign a disposition path for the missing CAN loopback fixture and GAP-CAN-TERM.
      status: missing
      evidence_refs: [HRM-001, SGF-001, RR-001]
      unresolved_outcome: No sourced disposition or owner decision.
      owner_or_route: interface_control_and_harness_readiness_v0
    - criterion_id: SUC-003
      criterion: Assign a source-resolution and owner-decision path for reset timing.
      status: missing
      evidence_refs: [TM-001, EAM-001, ICP-001, SGF-001, ODR-001]
      unresolved_outcome: Reset evidence conflicts and the proposal is not accepted.
      owner_or_route: synthetic_owner_board
    - criterion_id: SUC-004
      criterion: Decide whether the remaining caveats permit scheduling later verification execution.
      status: missing
      evidence_refs: [TRR-001, RR-001]
      unresolved_outcome: No owner decision recorded.
      owner_or_route: synthetic_owner_board
    - criterion_id: SUC-005
      criterion: Define the evidence required to close CAN and reset review actions.
      status: partial
      evidence_refs: [VPS-001, SGF-001]
      unresolved_outcome: Evidence targets are identifiable, but acceptance criteria require owner confirmation.
      owner_or_route: synthetic_owner_board
    - criterion_id: SUC-006
      criterion: Accept completed verification results.
      status: not_applicable
      evidence_refs: []
      explicit_gap: No result packet exists in the bounded fixture; result acceptance is outside this pack.
      owner_or_route: external_verification_acceptance_surface

review_blockers:
  blockers:
    - blocker_id: BLK-CAN-FIXTURE
      subject: CAN loopback fixture absent
      scope: blocks_review_closure
      summary: VT-CAN-002 cannot be represented as execution-ready without the required fixture or a sourced alternative disposition.
      evidence_refs: [HRM-001, VPS-001, RR-001]
      owner_or_route: interface_control_and_harness_readiness_v0
      closure_evidence_required: Updated harness-readiness evidence and corresponding verification-plan status.
    - blocker_id: BLK-CAN-TERM
      subject: CAN termination remains review-required
      scope: weakens_review_confidence
      summary: CAN evidence is informative rather than authoritative, and GAP-CAN-TERM remains open.
      evidence_refs: [TM-001, EAM-001, ICP-001, SGF-001]
      owner_or_route: source_gap_followup_packet_v0
      closure_evidence_required: Sourced CAN-termination resolution and refreshed trace/interface evidence.
    - blocker_id: BLK-RST-CONFLICT
      subject: Reset timing evidence conflicts
      scope: blocks_review_closure
      summary: Reset trace and interface positions conflict, and VT-RST-003 remains blocked.
      evidence_refs: [TM-001, ICP-001, VPS-001, SGF-001]
      owner_or_route: source_gap_followup_packet_v0
      closure_evidence_required: Authoritative timing source or explicit scoped owner disposition followed by refreshed upstream evidence.
    - blocker_id: BLK-RST-PROBE
      subject: Reset timing probe not configured
      scope: blocks_review_closure
      summary: Required reset timing instrumentation is not ready.
      evidence_refs: [HRM-001, VPS-001]
      owner_or_route: interface_control_and_harness_readiness_v0
      closure_evidence_required: Updated harness-readiness evidence showing an accepted probe configuration.
    - blocker_id: BLK-OWNER-DECISION
      subject: No owner decision recorded for reset proposal
      scope: weakens_review_confidence
      summary: The reset proposal cannot be treated as an accepted decision.
      evidence_refs: [EAM-001, ODR-001]
      owner_or_route: synthetic_owner_board
      closure_evidence_required: Scoped owner-decision reference.
    - blocker_id: BLK-FRESHNESS
      subject: Evidence freshness is unknown
      scope: weakens_review_confidence
      summary: The fixture supplies checksums but no freshness or approval dates.
      evidence_refs: [TM-001, EAM-001, ICP-001, HRM-001, VPS-001, TRR-001, SGF-001, ODR-001, RR-001]
      owner_or_route: synthetic_owner_board
      closure_evidence_required: Bounded freshness annotations from the responsible source owners.
  scheduling_position:
    blocks_review_scheduling: []
    condition: A review conversation is supportable only with all named caveats retained.
    uncertainty: The pack does not determine whether the owner will schedule the review.

action_item_register:
  action_items:
    - action_id: ACT-CAN-FIXTURE
      action: Provide or formally disposition the CAN loopback fixture requirement.
      responsible_surface: interface_control_and_harness_readiness_v0
      evidence_target: Updated harness_readiness_matrix covering VT-CAN-002.
      trigger_or_due_condition: Before representing VT-CAN-002 as execution-ready or closing BLK-CAN-FIXTURE.
      status: open
      closure_rule: External evidence required; this record does not self-close.
    - action_id: ACT-CAN-SOURCE
      action: Resolve GAP-CAN-TERM using an approved source or scoped owner disposition.
      responsible_surface: source_gap_followup_packet_v0
      evidence_target: Refreshed source-gap packet plus updated trace and interface evidence.
      trigger_or_due_condition: Before CAN termination is upgraded from review-required or informative.
      status: open
      closure_rule: External evidence required; this record does not self-close.
    - action_id: ACT-RST-SOURCE
      action: Resolve GAP-RST-TIMING and preserve any remaining conflict explicitly.
      responsible_surface: source_gap_followup_packet_v0
      evidence_target: Authoritative reset-timing source or documented unresolved conflict.
      trigger_or_due_condition: Before VT-RST-003 is represented as execution-ready.
      status: open
      closure_rule: External evidence required; this record does not self-close.
    - action_id: ACT-RST-DECISION
      action: Record an owner disposition for the reset proposal after source review.
      responsible_surface: synthetic_owner_board
      evidence_target: Scoped owner_decision_ref identifying the accepted, rejected, or deferred proposal.
      trigger_or_due_condition: After reset source evidence is reviewed and before treating the proposal as accepted.
      status: open
      closure_rule: Only a sourced owner record can close this action.
    - action_id: ACT-RST-PROBE
      action: Define and evidence the reset timing-probe configuration.
      responsible_surface: interface_control_and_harness_readiness_v0
      evidence_target: Updated harness-readiness evidence and any verification-plan dependency update.
      trigger_or_due_condition: Before scheduling VT-RST-003 execution.
      status: open
      closure_rule: External evidence required; this record does not self-close.
    - action_id: ACT-VPLAN-REFRESH
      action: Refresh affected verification-plan and TRR handoff entries after CAN or reset evidence changes.
      responsible_surface: verification_plan_from_page_contracts_v0
      evidence_target: Updated verification_plan_summary and trr_readiness_handoff.
      trigger_or_due_condition: Any accepted change to CAN fixture, CAN termination, reset timing, or reset probe status.
      status: trigger_pending
      closure_rule: Requires refreshed upstream artifacts.
    - action_id: ACT-FRESHNESS
      action: Add bounded freshness annotations for the indexed evidence.
      responsible_surface: synthetic_owner_board
      evidence_target: Updated source index inputs with freshness or approval dates.
      trigger_or_due_condition: Before relying on this pack for a later review date.
      status: open
      closure_rule: External source-owner annotations required.

decision_summary:
  overall_decision_status: no_owner_decision_recorded
  recorded_decisions: []
  proposed_decisions:
    - proposal_id: PROP-RST-001
      subject: Reset position
      status: proposed_decision_only
      evidence_refs: [EAM-001, ODR-001]
      boundary: The proposal is not accepted and creates no owner decision.
  deferred_questions:
    - question_id: DEC-CAN-001
      question: How will the CAN loopback fixture requirement be satisfied or dispositioned?
      status: decision_deferred
      owner_surface: synthetic_owner_board
    - question_id: DEC-RST-001
      question: Which reset timing source or disposition governs VT-RST-003?
      status: decision_deferred
      owner_surface: synthetic_owner_board
    - question_id: DEC-SCHED-001
      question: Do the named caveats permit later verification-execution scheduling?
      status: decision_deferred
      owner_surface: synthetic_owner_board
  recommendations:
    - Hold only a bounded TRR-style conversation with the CAN and reset limitations explicit.
    - Keep execution authorization and verification-result acceptance outside this evidence pack.
  non_claim: Recommendations are not owner decisions.

review_gate_provenance:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  scope_id: synthetic_ctrl_board_harness_trr
  public_safe: true
  upstream_refs:
    - TM-001
    - EAM-001
    - ICP-001
    - HRM-001
    - VPS-001
    - TRR-001
    - SGF-001
    - ODR-001
    - RR-001
  source_count: 9
  evidence_question_count: 7
  entrance_criterion_count: 7
  success_criterion_count: 6
  blocker_count: 6
  action_item_count: 7
  recorded_owner_decision_count: 0
  proposed_decision_count: 1
  carry_forward:
    open_source_gaps: [GAP-CAN-TERM, GAP-RST-TIMING]
    blocked_verification_activities: [VT-CAN-002, VT-RST-003]
    owner_decisions_needed: [DEC-CAN-001, DEC-RST-001, DEC-SCHED-001]
    rerun_triggers:
      - Accepted CAN fixture or termination evidence changes.
      - Accepted reset timing or probe evidence changes.
      - New scoped owner-decision reference.
      - New freshness information.
  provenance_limitations:
    - Provenance is limited to the supplied synthetic references and summaries.
    - No inference is made from filenames, hidden material, or unindexed sources.
    - Checksums are preserved as fixture identifiers, not independently validated facts.

readiness_summary: |
  Readiness state: ready_with_named_caveats.

  The bounded evidence supports holding a TRR-like review conversation about the
  power activity and the unresolved CAN and reset paths. Power is the strongest
  discussion-ready area. CAN remains constrained by an absent loopback fixture
  and an open termination gap. Reset remains constrained by conflicting timing
  evidence, an unconfigured timing probe, and the absence of an accepted owner
  decision.

  This state concerns readiness for a review conversation only. It does not
  authorize verification execution, approve a review gate, establish review
  closure, or certify verification completion. If the named caveats cannot
  remain explicit, the readiness state must be reconsidered.

boundary_review_note: |
  Boundary posture: preserved.

  The packet keeps entrance criteria separate from desired review outcomes.
  Each major review question has bounded evidence references or an explicit
  gap. Scheduling readiness is distinguished from review closure. Action items
  identify responsible surfaces, evidence targets, and trigger conditions;
  none self-close. The reset proposal is separated from owner decisions.

  Upstream evidence remains read-only. Missing CAN, reset, result, baseline, and
  freshness evidence remains visible. No formal review approval, verification
  completion, functional acceptance, configuration acceptance, or owner
  decision is asserted.

  Stop conditions:
  - Stop any upgrade of CAN readiness until fixture and termination evidence is
    supplied or formally dispositioned.
  - Stop any upgrade of reset readiness until the timing conflict and probe
    configuration are addressed through their owning surfaces.
  - Stop any claim that the reset proposal is accepted without a scoped owner
    decision reference.
  - Stop any verification-completion or review-closure claim without accepted
    external result and decision evidence.
  - Stop and re-scope if the review family, owner surface, or bounded source set
    changes.
