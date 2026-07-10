fixture_id: SYNTH_REVIEW_DEMO
bundle_kind: review_gate_evidence_pack
workflow_id: review_gate_evidence_pack_v0
workflow_mode: scope_review_pack
public_safe: true

review_gate_packet:
  packet_id: RGP-SYNTH-001
  project_code: SYNTH_REVIEW_DEMO
  scope_id: synthetic_ctrl_board_harness_trr
  scope_summary: >-
    Review readiness for holding a TRR-style conversation about a simulated
    controller-board XML harness and verification-plan handoff.
  primary_review_family: TRR_like
  primary_review_question: >-
    Is the test, simulation, inspection, analysis, or demonstration activity
    ready enough to discuss running it?
  secondary_lenses:
    - review_family: PDR_like
      question: >-
        Is the proposed design direction credible enough for preliminary
        review and follow-up planning?
      bounded_focus:
        - CAN termination interface readiness
        - reset timing conflict
        - harness resource readiness
  owner_surface: synthetic_owner_board
  readiness_state: ready_with_named_caveats
  readiness_basis:
    - VT-PWR-001 is described as ready.
    - VT-CAN-002 is blocked by the absent CAN loopback fixture.
    - VT-RST-003 is blocked by a reset timing source conflict.
    - TRR-001 permits readiness with named caveats when the CAN and reset blockers remain explicit.
  review_conversation_focus:
    - Confirm the bounded verification scope and sequencing.
    - Determine responsibility and trigger conditions for obtaining the CAN loopback fixture.
    - Resolve or defer the reset timing source conflict through the owner surface.
    - Identify evidence required before test execution or review closure.
  caveats:
    - CAN loopback execution readiness is not established.
    - Reset verification readiness is not established.
    - CAN termination remains review_required.
    - No owner decision accepting the reset proposal is recorded.
    - Source freshness dates and approval scopes were not supplied.
  non_claims:
    - This evidence pack does not approve the review gate.
    - This evidence pack does not certify verification completion.
    - This evidence pack does not replace owner judgment.
    - This evidence pack does not make missing sources true.
    - This evidence pack does not mutate upstream evidence.
    - This evidence pack does not make private evidence public-safe.

source_index:
  index_id: SI-SYNTH-001
  scope_id: synthetic_ctrl_board_harness_trr
  source_boundary: supplied_synthetic_fixture_only
  entries:
    - artifact_ref: TM-001
      artifact_kind: trace_matrix
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-tm001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - power_trace_status
        - CAN_trace_status
        - reset_trace_conflict
    - artifact_ref: EAM-001
      artifact_kind: evidence_authority_map
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-eam001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - evidence_authority_classification
        - reset_proposal_boundary
    - artifact_ref: ICP-001
      artifact_kind: interface_control_packet
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-icp001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - interface_stability
        - CAN_termination_status
        - reset_interface_conflict
    - artifact_ref: HRM-001
      artifact_kind: harness_readiness_matrix
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-hrm001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - smoke_harness_availability
        - CAN_fixture_gap
        - reset_probe_gap
    - artifact_ref: VPS-001
      artifact_kind: verification_plan_summary
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-vps001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - verification_activity_readiness
        - blocked_verification_items
    - artifact_ref: TRR-001
      artifact_kind: trr_readiness_handoff
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-trr001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - conversation_readiness
        - named_caveat_condition
    - artifact_ref: SGF-001
      artifact_kind: source_gap_followup_packet
      owning_workflow_id: source_gap_followup_packet_v0
      checksum_sha256: sha256:demo-sgf001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - CAN_termination_gap
        - reset_timing_gap
    - artifact_ref: ODR-001
      artifact_kind: owner_decision_record
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-odr001
      approval_scope: synthetic_owner_decision_surface
      freshness_note: freshness_not_supplied
      consumed_for:
        - decision_status
        - reset_proposal_status
    - artifact_ref: RR-001
      artifact_kind: risk_or_open_question_register
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-rr001
      approval_scope: not_supplied
      freshness_note: freshness_not_supplied
      consumed_for:
        - CAN_execution_risk
        - reset_confidence_risk
  excluded_basis:
    - unbounded_chat_history
    - hidden_reference_oracle
    - verifier_report
    - previous_candidate_repair_packet
    - raw_source_payload_text
    - unindexed_owner_file

evidence_matrix:
  matrix_id: EM-SYNTH-001
  rows:
    - question_id: RQ-TRR-001
      review_family: TRR_like
      question: Is the bounded verification activity defined well enough to discuss?
      evidence_state: supported
      evidence_refs:
        - VPS-001
        - TRR-001
      finding: >-
        Named verification activities and their current ready or blocked states
        are supplied.
      uncertainty: Procedure details and resource specifications are not supplied.
    - question_id: RQ-TRR-002
      review_family: TRR_like
      question: Are required harness resources available?
      evidence_state: partial
      evidence_refs:
        - HRM-001
        - VPS-001
        - RR-001
      finding: >-
        A smoke harness is described as available, while the CAN loopback
        fixture is absent and the reset timing probe is not configured.
      explicit_gaps:
        - CAN loopback fixture
        - reset timing probe configuration
    - question_id: RQ-TRR-003
      review_family: TRR_like
      question: Are interfaces and source assumptions stable enough to discuss execution?
      evidence_state: conflicting
      evidence_refs:
        - TM-001
        - EAM-001
        - ICP-001
        - SGF-001
      finding: >-
        Power is supported and PWR is stable. CAN is partial, CAN_TERM remains
        review_required, and reset timing has conflicting evidence.
      explicit_gaps:
        - GAP-CAN-TERM
        - GAP-RST-TIMING
    - question_id: RQ-TRR-004
      review_family: TRR_like
      question: Are blockers and residual risks explicit?
      evidence_state: supported
      evidence_refs:
        - TRR-001
        - SGF-001
        - RR-001
      finding: >-
        The CAN fixture absence and reset timing conflict are explicitly named,
        including their possible effects on execution and confidence.
    - question_id: RQ-TRR-005
      review_family: TRR_like
      question: Are accepted verification results available?
      evidence_state: missing
      evidence_refs: []
      explicit_gap: No accepted verification result packet is supplied.
      boundary_note: Accepted results are not required merely to hold this TRR-style conversation.
    - question_id: RQ-PDR-001
      review_family: PDR_like
      question: Is the interface direction credible enough for bounded design discussion?
      evidence_state: partial
      evidence_refs:
        - ICP-001
        - HRM-001
        - EAM-001
      finding: >-
        PWR is stable, but CAN termination remains review_required and the reset
        position remains conflicting and proposed only.

entrance_criteria_checklist:
  checklist_id: EC-SYNTH-001
  criteria:
    - criterion_id: EC-001
      criterion: Review scope, family, and owner surface are explicit.
      status: met
      evidence_refs:
        - SYNTH_REVIEW_DEMO
      routing_surface: synthetic_owner_board
    - criterion_id: EC-002
      criterion: Verification activities and current readiness states are identified.
      status: met
      evidence_refs:
        - VPS-001
        - TRR-001
    - criterion_id: EC-003
      criterion: Required harness resources are identified and available.
      status: partial
      evidence_refs:
        - HRM-001
        - RR-001
      gap: CAN loopback fixture is absent and reset timing probe is not configured.
      routing_surface:
        - interface_control_and_harness_readiness_v0
        - synthetic_owner_board
    - criterion_id: EC-004
      criterion: Critical interface and timing sources are sufficiently stable for discussion.
      status: partial
      evidence_refs:
        - ICP-001
        - EAM-001
        - SGF-001
      gap: CAN termination is review_required and reset timing sources conflict.
      routing_surface:
        - source_gap_followup_packet_v0
        - synthetic_owner_board
    - criterion_id: EC-005
      criterion: Known blockers and caveats are visible in the review packet.
      status: met
      evidence_refs:
        - TRR-001
        - SGF-001
        - RR-001
    - criterion_id: EC-006
      criterion: Source approval scope and freshness are known.
      status: missing
      evidence_refs: []
      gap: Approval scope and freshness metadata were not supplied for most sources.
      routing_surface: synthetic_owner_board
  entrance_assessment: >-
    The review conversation is worth holding with named caveats. The partial and
    missing criteria prevent treating the packet as execution authorization.

success_criteria_checklist:
  checklist_id: SC-SYNTH-001
  criteria:
    - criterion_id: SC-001
      criterion: Confirm the bounded verification scope and execution sequence.
      status: partial
      evidence_refs:
        - VPS-001
        - TRR-001
      intended_review_outcome: Record an owner-scoped confirmation or requested revision.
    - criterion_id: SC-002
      criterion: Establish the disposition path for the absent CAN loopback fixture.
      status: missing
      evidence_refs:
        - HRM-001
        - RR-001
      intended_review_outcome: Assign responsibility and a retry trigger.
    - criterion_id: SC-003
      criterion: Resolve or formally defer the reset timing source conflict.
      status: missing
      evidence_refs:
        - TM-001
        - EAM-001
        - ICP-001
        - SGF-001
        - ODR-001
      intended_review_outcome: Record a sourced owner decision or explicit deferral.
    - criterion_id: SC-004
      criterion: Determine whether CAN_TERM needs source refresh or interface revision.
      status: partial
      evidence_refs:
        - ICP-001
        - SGF-001
      intended_review_outcome: Route the narrow follow-up without upgrading current evidence.
    - criterion_id: SC-005
      criterion: Define evidence required before verification execution and later closure.
      status: partial
      evidence_refs:
        - VPS-001
        - HRM-001
        - TRR-001
      intended_review_outcome: Record evidence targets for fixture readiness, probe configuration, and source resolution.
  success_boundary: >-
    These are intended review outcomes. Their inclusion does not promise
    implementation, establish closure, or create an owner decision.

review_blockers:
  register_id: RB-SYNTH-001
  blockers:
    - blocker_id: BLK-CAN-FIXTURE
      title: CAN loopback fixture absent
      blocker_scope: blocks_review_closure
      evidence_refs:
        - HRM-001
        - VPS-001
        - RR-001
      affected_item: VT-CAN-002
      impact: >-
        CAN loopback execution readiness cannot be established from the supplied evidence.
      scheduling_effect: Does not prevent a caveated review conversation.
      closure_condition: Evidence that the required fixture is available and appropriately bound to VT-CAN-002.
    - blocker_id: BLK-RST-SOURCE
      title: Reset timing source conflict
      blocker_scope: blocks_review_closure
      evidence_refs:
        - TM-001
        - EAM-001
        - ICP-001
        - VPS-001
        - SGF-001
        - ODR-001
      affected_item: VT-RST-003
      impact: >-
        Reset verification readiness cannot be established, and the existing
        proposal is not an accepted owner decision.
      scheduling_effect: Does not prevent discussion if the conflict remains explicit.
      closure_condition: A sourced resolution or explicit owner deferral plus corresponding evidence refresh.
    - blocker_id: BLK-CAN-TERM
      title: CAN termination remains review_required
      blocker_scope: weakens_review_confidence
      evidence_refs:
        - TM-001
        - EAM-001
        - ICP-001
        - SGF-001
      affected_item: GAP-CAN-TERM
      impact: CAN interface evidence is insufficient for an unqualified readiness statement.
      closure_condition: Source-backed disposition through the owning follow-up lane.
    - blocker_id: BLK-SOURCE-METADATA
      title: Source approval and freshness metadata incomplete
      blocker_scope: weakens_review_confidence
      evidence_refs: []
      impact: Currency and approval applicability cannot be independently established.
      closure_condition: Bounded approval-scope and freshness metadata supplied by the responsible surface.

action_item_register:
  register_id: AIR-SYNTH-001
  items:
    - action_id: ACT-CAN-FIXTURE
      title: Establish CAN loopback fixture disposition
      responsible_surface:
        - interface_control_and_harness_readiness_v0
        - synthetic_owner_board
      evidence_target: >-
        Fixture availability and readiness evidence linked to VT-CAN-002.
      trigger_or_due_condition: Before VT-CAN-002 is proposed for execution.
      source_refs:
        - HRM-001
        - VPS-001
        - RR-001
      status: open
      closure_rule: External evidence is required; this action does not close itself.
    - action_id: ACT-RST-TIMING
      title: Resolve or defer reset timing source conflict
      responsible_surface:
        - source_gap_followup_packet_v0
        - synthetic_owner_board
      evidence_target: >-
        Source-backed reset timing disposition and, if decided, an owner decision reference.
      trigger_or_due_condition: Before VT-RST-003 is proposed for execution or review closure.
      source_refs:
        - EAM-001
        - ICP-001
        - SGF-001
        - ODR-001
      status: open
      closure_rule: A proposal alone is insufficient.
    - action_id: ACT-CAN-TERM
      title: Refresh CAN termination evidence
      responsible_surface: source_gap_followup_packet_v0
      evidence_target: Source-backed disposition for GAP-CAN-TERM.
      trigger_or_due_condition: Before CAN readiness is upgraded from partial or review_required.
      source_refs:
        - ICP-001
        - SGF-001
      status: open
      rerun_route: source_gap_followup_packet_v0
    - action_id: ACT-RST-PROBE
      title: Define reset timing probe readiness
      responsible_surface: interface_control_and_harness_readiness_v0
      evidence_target: Probe configuration and resource-readiness record for VT-RST-003.
      trigger_or_due_condition: After reset timing basis is resolved and before execution scheduling.
      source_refs:
        - HRM-001
        - VPS-001
      status: open
    - action_id: ACT-SOURCE-METADATA
      title: Supply bounded source approval and freshness metadata
      responsible_surface: synthetic_owner_board
      evidence_target: Approval scope and freshness notes for indexed review sources.
      trigger_or_due_condition: Before an unqualified readiness or closure claim is considered.
      source_refs: []
      status: open

decision_summary:
  summary_id: DS-SYNTH-001
  overall_decision_status: no_owner_decision_recorded
  recorded_decisions: []
  proposals:
    - proposal_id: PROP-RST-001
      subject: Reset timing disposition
      status: proposed_decision_only
      evidence_refs:
        - ODR-001
      boundary: The proposal is not accepted and is not an owner decision.
  deferred_items:
    - subject: CAN loopback fixture disposition
      decision_status: decision_deferred
      basis: No scoped owner decision is supplied.
    - subject: CAN termination disposition
      decision_status: decision_deferred
      basis: GAP-CAN-TERM remains open.
  readiness_recommendation:
    state: ready_with_named_caveats
    nature: scheduling_or_conversation_readiness_only
    basis_refs:
      - TRR-001
      - VPS-001
      - HRM-001
      - SGF-001
      - RR-001
  owner_authority_note: >-
    Only synthetic_owner_board may record owner decisions within the declared
    owner surface. This packet records no such accepted decision.

review_gate_provenance:
  provenance_id: RGPV-SYNTH-001
  fixture_id: SYNTH_REVIEW_DEMO
  source_boundary: supplied_public_safe_synthetic_fixture
  upstream_artifacts_read_only: true
  upstream_mutation_allowed: false
  review_approval_claim_allowed: false
  verification_completion_claim_allowed: false
  primary_review_family: TRR_like
  secondary_lenses:
    - PDR_like
  indexed_source_count: 9
  evidence_question_count: 6
  entrance_criterion_count: 6
  success_criterion_count: 5
  blocker_count: 4
  action_item_count: 5
  accepted_owner_decision_count: 0
  unresolved_gap_ids:
    - GAP-CAN-TERM
    - GAP-RST-TIMING
  carry_forward:
    - CAN fixture disposition
    - CAN termination source refresh
    - reset timing source resolution or deferral
    - reset timing probe configuration
    - source approval and freshness metadata
  explicit_uncertainties:
    - Source freshness dates are not supplied.
    - Most source approval scopes are not supplied.
    - Procedure details are not supplied.
    - Accepted verification result packets are not supplied.
    - Configuration baseline evidence is not supplied and is outside this packet's primary TRR scope.
  excluded_claims:
    - formal_review_gate_approval
    - verification_completion
    - functional_acceptance
    - configuration_audit_acceptance
    - owner_decision_creation

readiness_summary: |-
  # Synthetic TRR-Like Readiness Summary

  **State:** `ready_with_named_caveats`

  The supplied evidence is sufficient to hold a bounded TRR-style conversation
  about the simulated controller-board XML harness and verification-plan
  handoff. Power verification is described as ready, while CAN loopback and
  reset timing remain blocked.

  The review should explicitly address the absent CAN loopback fixture,
  `GAP-CAN-TERM`, `GAP-RST-TIMING`, the unconfigured reset timing probe, and the
  absence of an accepted reset decision. These conditions do not prevent the
  conversation, but they prevent an unqualified execution-readiness or
  review-closure statement.

  This readiness state concerns whether the review conversation is worth
  holding. It is not review approval, execution authorization, verification
  completion, or acceptance of any proposed decision.

boundary_review_note: |-
  # Boundary Review Note

  The packet is bounded to `SYNTH_REVIEW_DEMO` and
  `synthetic_ctrl_board_harness_trr`. Every major review question has supplied
  evidence references or an explicit gap. Entrance criteria and intended review
  success criteria remain separate. Scheduling readiness is distinguished from
  closure blockers, and each action names an evidence target and responsible
  surface.

  No accepted owner decision is recorded. The reset position remains a proposal
  only. Missing CAN fixture, CAN termination, reset timing, probe-configuration,
  freshness, and approval-scope evidence remain visible.

  This evidence pack does not approve the review gate.
  This evidence pack does not certify verification completion.
  This evidence pack does not replace owner judgment.
  This evidence pack does not make missing sources true.
  This evidence pack does not mutate upstream evidence.
  This evidence pack does not make private evidence public-safe.
