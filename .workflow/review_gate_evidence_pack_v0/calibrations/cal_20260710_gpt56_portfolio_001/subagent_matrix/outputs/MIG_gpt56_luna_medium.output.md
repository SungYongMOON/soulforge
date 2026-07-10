```yaml
review_gate_packet:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  project_code: SYNTH_REVIEW_DEMO
  scope_id: synthetic_ctrl_board_harness_trr
  review_family: TRR_like
  secondary_lenses:
    - PDR_like
  owner_surface: synthetic_owner_board
  scope_summary: >
    Review readiness for holding a TRR-style conversation about a simulated
    controller-board XML harness and verification-plan handoff.
  readiness_state: ready_with_named_caveats
  decision_status: no_owner_decision_recorded
  approval_claim_allowed: false
  verification_completion_claim_allowed: false
  upstream_mutation_allowed: false
  non_claims:
    - This evidence pack does not approve the review gate.
    - This evidence pack does not certify verification completion.
    - This evidence pack does not replace owner judgment.
    - This evidence pack does not make missing sources true.
    - This evidence pack does not mutate upstream evidence.
    - This evidence pack does not make private evidence public-safe.

source_index:
  fixture_id: SYNTH_REVIEW_DEMO
  entries:
    - artifact_ref: TM-001
      artifact_kind: trace_matrix
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-tm001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - TRR trace context
        - reset and CAN evidence mapping
    - artifact_ref: EAM-001
      artifact_kind: evidence_authority_map
      owning_workflow_id: page_module_trace_matrix_v0
      checksum_sha256: sha256:demo-eam001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - authority interpretation
        - source conflict identification
    - artifact_ref: ICP-001
      artifact_kind: interface_control_packet
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-icp001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - interface readiness
        - CAN_TERM and RESET blocker mapping
    - artifact_ref: HRM-001
      artifact_kind: harness_readiness_matrix
      owning_workflow_id: interface_control_and_harness_readiness_v0
      checksum_sha256: sha256:demo-hrm001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - harness readiness
        - missing fixture and timing probe gaps
    - artifact_ref: VPS-001
      artifact_kind: verification_plan_summary
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-vps001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - verification activity readiness
        - procedure and resource gaps
    - artifact_ref: TRR-001
      artifact_kind: trr_readiness_handoff
      owning_workflow_id: verification_plan_from_page_contracts_v0
      checksum_sha256: sha256:demo-trr001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - TRR readiness state
    - artifact_ref: SGF-001
      artifact_kind: source_gap_followup_packet
      owning_workflow_id: source_gap_followup_packet_v0
      checksum_sha256: sha256:demo-sgf001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - source-gap action routing
    - artifact_ref: ODR-001
      artifact_kind: owner_decision_reference
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-odr001
      approval_scope: owner surface reference; no decision recorded
      freshness_note: freshness not supplied
      consumed_for:
        - decision-status determination
    - artifact_ref: RR-001
      artifact_kind: risk_or_open_question_register
      owning_workflow_id: synthetic_owner_board
      checksum_sha256: sha256:demo-rr001
      approval_scope: synthetic fixture evidence reference
      freshness_note: freshness not supplied
      consumed_for:
        - residual-risk and blocker mapping

evidence_matrix:
  review_questions:
    - question_id: TRR-Q1
      review_family: TRR_like
      question: >
        Is the test, simulation, inspection, analysis, or demonstration activity
        ready enough to discuss running it?
      evidence_refs:
        - VPS-001
        - TRR-001
        - HRM-001
      state: partial
      basis: >
        VT-PWR-001 is ready, while CAN and reset activities have identified
        resource or source conflicts.
      gap_or_caveat: >
        Readiness is limited to a conversation with named CAN and reset caveats.

    - question_id: TRR-Q2
      review_family: TRR_like
      question: Are procedure and resource gaps explicitly identified?
      evidence_refs:
        - VPS-001
        - HRM-001
        - SGF-001
      state: supported
      basis: >
        CAN loopback fixture absence, reset timing-source conflict, and the
        corresponding open gaps are identified.

    - question_id: TRR-Q3
      review_family: TRR_like
      question: Is residual risk visible for review discussion?
      evidence_refs:
        - RR-001
        - TRR-001
      state: supported
      basis: >
        CAN fixture absence may block TRR execution and reset conflict may
        weaken confidence.

    - question_id: PDR-Q1
      review_family: PDR_like
      question: Is the proposed design direction credible enough for preliminary review and follow-up planning?
      evidence_refs:
        - ICP-001
        - HRM-001
        - TM-001
        - EAM-001
      state: partial
      basis: >
        Power is stable and supported; CAN remains review-required and reset
        evidence is conflicting or only proposed.
      gap_or_caveat: >
        Interface and reset uncertainty prevent an unqualified credibility claim.

    - question_id: PDR-Q2
      review_family: PDR_like
      question: Are interface and harness risks visible?
      evidence_refs:
        - ICP-001
        - HRM-001
        - RR-001
      state: supported
      basis: >
        CAN_TERM is review_required, RESET is conflicting, the CAN fixture is
        absent, and the reset timing probe is not configured.

  evidence_gaps:
    - GAP-CAN-TERM
    - GAP-RST-TIMING

entrance_criteria_checklist:
  - criterion_id: EC-001
    criterion: Review scope, TRR-like family, and owner surface are explicit.
    status: met
    evidence_refs:
      - project_binding
      - review_scope_refs
  - criterion_id: EC-002
    criterion: Verification activities and readiness handoff are identified.
    status: met
    evidence_refs:
      - VPS-001
      - TRR-001
  - criterion_id: EC-003
    criterion: Procedure and resource gaps are visible.
    status: met
    evidence_refs:
      - HRM-001
      - SGF-001
  - criterion_id: EC-004
    criterion: CAN and reset caveats are named before scheduling discussion.
    status: partial
    evidence_refs:
      - TRR-001
      - RR-001
    owner_or_routing_surface: synthetic_owner_board
  - criterion_id: EC-005
    criterion: No unresolved source conflict affects the review conversation.
    status: missing
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - VPS-001
    gap: GAP-RST-TIMING
    owner_or_routing_surface: source_gap_followup_packet_v0

success_criteria_checklist:
  - criterion_id: SC-001
    criterion: Review identifies whether CAN fixture preparation is required before execution.
    status: partial
    evidence_refs:
      - HRM-001
      - RR-001
    owner_or_routing_surface: synthetic_owner_board
  - criterion_id: SC-002
    criterion: Review identifies the authoritative reset timing basis or defers the decision.
    status: missing
    evidence_refs:
      - EAM-001
      - ICP-001
      - VPS-001
    gap: GAP-RST-TIMING
    owner_or_routing_surface: source_gap_followup_packet_v0
  - criterion_id: SC-003
    criterion: Review records scoped follow-up actions for CAN and reset readiness.
    status: partial
    evidence_refs:
      - SGF-001
      - RR-001
    owner_or_routing_surface: synthetic_owner_board
  - criterion_id: SC-004
    criterion: Review distinguishes discussion readiness from verification completion.
    status: met
    evidence_refs:
      - TRR-001
      - project_binding

review_blockers:
  - blocker_id: RB-CAN-001
    description: CAN loopback fixture is absent.
    scope: blocks_review_scheduling
    status: open
    evidence_refs:
      - HRM-001
      - VPS-001
      - RR-001
    routing_surface: source_gap_followup_packet_v0
  - blocker_id: RB-RST-001
    description: Reset timing source is conflicting and the timing probe is not configured.
    scope: weakens_review_confidence
    status: open
    evidence_refs:
      - TM-001
      - EAM-001
      - ICP-001
      - HRM-001
      - VPS-001
      - SGF-001
    routing_surface: source_gap_followup_packet_v0
  - blocker_id: RB-OWNER-001
    description: No owner decision is recorded accepting the reset proposal.
    scope: blocks_review_closure
    status: open
    evidence_refs:
      - ODR-001
    routing_surface: synthetic_owner_board

action_item_register:
  - action_id: AI-CAN-001
    action: Resolve or explicitly disposition the missing CAN loopback fixture.
    responsible_surface: synthetic_owner_board
    evidence_target:
      - updated harness readiness evidence
      - resolved GAP-CAN-TERM
    trigger_or_due_condition: before CAN execution is treated as ready
    status: open
    closure_rule: remains open until external evidence is supplied
  - action_id: AI-RST-001
    action: Resolve the reset timing-source conflict and configure the timing probe.
    responsible_surface: source_gap_followup_packet_v0
    evidence_target:
      - resolved GAP-RST-TIMING
      - updated reset timing readiness evidence
    trigger_or_due_condition: before reset verification readiness is treated as established
    status: open
    closure_rule: remains open until external source and probe evidence are supplied
  - action_id: AI-OWNER-001
    action: Record an owner decision on the reset proposal or explicitly defer it.
    responsible_surface: synthetic_owner_board
    evidence_target:
      - scoped owner decision reference
    trigger_or_due_condition: during the owner-led review conversation
    status: open
    closure_rule: proposed reset basis is not an accepted decision without an owner decision reference

decision_summary:
  decision_status: no_owner_decision_recorded
  recorded_decisions: []
  proposed_or_deferred_items:
    - item: Hold a TRR-style conversation with CAN and reset caveats explicitly named.
      status: proposed_decision_only
      basis_refs:
        - TRR-001
        - RR-001
    - item: Treat the reset proposal as unresolved pending owner decision and source-gap resolution.
      status: proposed_decision_only
      basis_refs:
        - ODR-001
        - SGF-001
  owner_decision_authority: synthetic_owner_board
  note: This summary records status and proposals only; it creates no owner decision.

readiness_summary: |
  Readiness state: ready_with_named_caveats.

  A TRR-style conversation may be shaped around the available verification-plan,
  harness, interface, trace, and risk evidence, with CAN and reset limitations
  explicitly named. Power verification is identified as ready. CAN remains
  constrained by the absent loopback fixture. Reset remains constrained by a
  timing-source conflict and an unconfigured timing probe. No owner decision is
  recorded for the reset proposal.

  This is a conversation-readiness summary only. It is not a review outcome,
  review approval, verification-completion certification, or replacement for
  owner judgment.

boundary_review_note: |
  Boundary review status: bounded and caveated.

  Confirmed package posture from the supplied fixture:
  - Review family and secondary lens are explicit.
  - Major TRR and PDR-like questions map to supplied evidence references or explicit gaps.
  - Entrance criteria are separated from success criteria.
  - Blockers distinguish scheduling, closure, and confidence effects.
  - Action items identify responsible surfaces, evidence targets, and trigger conditions.
  - No owner decision is represented as recorded.
  - Missing CAN and reset evidence remains visible.
  - Upstream evidence is treated as read-only.
  - No raw payloads, runtime absolute paths, credentials, sessions, or private
    project material are included.

  Non-claims:
  - No review-gate approval is claimed.
  - No verification completion is claimed.
  - No functional acceptance, configuration audit acceptance, or baseline approval
    is claimed.
  - No missing source is treated as true.
  - No action item is treated as closed.
  - Public safety of evidence outside this supplied fixture is not asserted.

review_gate_provenance:
  workflow_id: review_gate_evidence_pack_v0
  fixture_id: SYNTH_REVIEW_DEMO
  source_refs:
    - TM-001
    - EAM-001
    - ICP-001
    - HRM-001
    - VPS-001
    - TRR-001
    - SGF-001
    - ODR-001
    - RR-001
  upstream_artifacts_read_only: true
  source_payloads_embedded: false
  owner_decision_status: no_owner_decision_recorded
  readiness_state: ready_with_named_caveats
  blocker_count: 3
  action_item_count: 3
  evidence_gap_refs:
    - GAP-CAN-TERM
    - GAP-RST-TIMING
  provenance_limits:
    - Freshness was not supplied for the indexed references.
    - This package preserves supplied summaries and does not independently establish their truth.
    - This package does not mutate, repair, or strengthen upstream evidence.
```
