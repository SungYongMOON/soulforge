```yaml
verification_plan:
  workflow_id: verification_plan_from_page_contracts_v0
  fixture_id: synthetic_public_verification_plan_fixture_20260515_001
  project_code: SYN_PUBLIC_CAL
  mode: plan_from_trace
  planning_only: true
  verification_execution_allowed: false
  verification_completion_claim_allowed: false
  items:
    - verification_item_id: VP-SYN-REG-3V3-TR-SYN-001-PWR-01-QUANT-RAIL-VOUT
      trace_row_id: TR-SYN-001
      page_asset_id: PWR-01
      scope_key: REG-3V3
      claim_kind: quantitative_constraint
      claim: VOUT_3V3 nominal 3.3 V tolerance +/-5%
      method: analysis
      method_rationale: Quantitative nominal and tolerance require comparison against approved source and quantitative values.
      secondary_methods:
        - inspection
      criteria_seed:
        status: seeded
        basis:
          - approved_source: SRC-PSU-DS-001
          - quantitative_packet_ref: SYN-QUANT-001
        statement: Planned analysis shall compare the applicable VOUT result or measurement against 3.3 V nominal and the approved +/-5% tolerance.
      readiness_state: plan_ready_with_prerequisites
      prerequisites:
        - approved quantitative value interpretation
        - future result or measurement packet
      evidence_needed:
        - approved source evidence for nominal and tolerance
        - quantitative analysis or measurement result
        - configuration identity for the evaluated item
      gap_refs: []

    - verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
      trace_row_id: TR-SYN-002
      page_asset_id: PWR-01
      scope_key: VIN-HARNESS
      claim_kind: harness_connection_claim
      interface_scope: J1.1_to_U1.VIN
      claim: Harness connection is proposed between J1.1 and U1.VIN.
      method: owner_review
      method_rationale: Harness status is review_required and authority or intent must be resolved before an execution method is planned.
      secondary_methods:
        - test
      criteria_seed:
        status: blocked
        basis: null
        statement: Pending owner-approved connection intent, fixture procedure, and applicable evidence basis.
      readiness_state: owner_review_required
      prerequisites:
        - owner decision for J1.1_to_U1.VIN
        - test fixture procedure
        - harness connection disposition
      evidence_needed:
        - owner decision reference
        - approved harness or interface evidence
        - test fixture and procedure evidence
        - future test result if the connection is approved for test
      gap_refs:
        - GAP-SYN-002-OWNER-DECISION
        - GAP-SYN-002-TEST-FIXTURE-PROCEDURE
        - GAP-SYN-002-HARNESS-REVIEW

    - verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
      trace_row_id: TR-SYN-003
      page_asset_id: PWR-01
      scope_key: STARTUP-SIM
      claim_kind: pspice_readiness
      claim: Startup transient should be simulated before execution.
      method: not_ready
      method_rationale: Simulation is not ready because the model, deck, stimuli, and measurement criteria are missing.
      secondary_methods: []
      criteria_seed:
        status: blocked
        basis: null
        statement: Simulation criteria shall be defined only after the required model, deck, stimuli, and measurement criteria are available.
      readiness_state: blocked_missing_evidence
      prerequisites:
        - simulation model
        - simulation deck
        - stimuli definition
        - measurement criteria
      evidence_needed:
        - simulation model reference
        - simulation deck reference
        - approved stimuli
        - approved measurement criteria
        - future simulation result packet
      gap_refs:
        - GAP-SYN-003-SIMULATION-MODEL
        - GAP-SYN-003-SIMULATION-DECK
        - GAP-SYN-003-STIMULI
        - GAP-SYN-003-MEASUREMENT-CRITERIA

    - verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
      trace_row_id: TR-SYN-004
      page_asset_id: LED-02
      scope_key: STATUS-LED
      claim_kind: function_claim
      claim: Status LED indicates regulator enabled.
      method: owner_review
      method_rationale: The official source reference and owner intent are missing; owner review is required to establish scope and authority before engineering evidence is selected.
      secondary_methods:
        - demonstration
      criteria_seed:
        status: blocked
        basis: null
        statement: Observable LED behavior criteria remain pending official source support and owner-approved intent.
      readiness_state: owner_review_required
      prerequisites:
        - official source reference
        - owner intent decision
        - observable behavior definition or demonstration script
      evidence_needed:
        - official source evidence
        - owner decision reference
        - future demonstration or test observation
      gap_refs:
        - GAP-SYN-004-OFFICIAL-SOURCE
        - GAP-SYN-004-OWNER-INTENT
        - GAP-SYN-004-OBSERVABLE-BEHAVIOR

    - verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
      trace_row_id: TR-SYN-005
      page_asset_id: PWR-01
      scope_key: CFG-BASELINE
      claim_kind: open_question
      claim: Configuration baseline is unresolved: trace indicates board rev A while the configuration packet indicates rev B.
      method: owner_review
      method_rationale: The conflicting configuration identities require an owner-controlled baseline decision before test planning can proceed.
      secondary_methods:
        - inspection
      criteria_seed:
        status: blocked
        basis: null
        statement: Test criteria and configuration identity remain pending resolution of the board revision conflict.
      readiness_state: blocked_source_conflict
      prerequisites:
        - reconciled configuration baseline
        - owner decision identifying the applicable board revision
        - updated trace or configuration reference if required
      evidence_needed:
        - configuration baseline reference
        - conflict-resolution owner decision
        - future test packet tied to the accepted baseline
      gap_refs:
        - GAP-SYN-005-VERSION-CONFLICT
        - GAP-SYN-005-OWNER-DECISION

verification_requirements_matrix:
  workflow_id: verification_plan_from_page_contracts_v0
  rows:
    - verification_item_id: VP-SYN-REG-3V3-TR-SYN-001-PWR-01-QUANT-RAIL-VOUT
      requirement_status: planned_not_verified
      method: analysis
      readiness_state: plan_ready_with_prerequisites
      criteria_seed_status: seeded
      evidence_need_refs:
        - EVID-SYN-001
    - verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
      requirement_status: planned_not_verified
      method: owner_review
      readiness_state: owner_review_required
      criteria_seed_status: blocked
      evidence_need_refs:
        - EVID-SYN-002
    - verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
      requirement_status: planned_not_verified
      method: not_ready
      readiness_state: blocked_missing_evidence
      criteria_seed_status: blocked
      evidence_need_refs:
        - EVID-SYN-003
    - verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
      requirement_status: planned_not_verified
      method: owner_review
      readiness_state: owner_review_required
      criteria_seed_status: blocked
      evidence_need_refs:
        - EVID-SYN-004
    - verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
      requirement_status: planned_not_verified
      method: owner_review
      readiness_state: blocked_source_conflict
      criteria_seed_status: blocked
      evidence_need_refs:
        - EVID-SYN-005

method_map:
  - verification_item_id: VP-SYN-REG-3V3-TR-SYN-001-PWR-01-QUANT-RAIL-VOUT
    primary_method: analysis
    secondary_methods:
      - inspection
    rationale: Quantitative claim requires bounded comparison to approved source and quantitative values.
  - verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    primary_method: owner_review
    secondary_methods:
      - test
    rationale: Review-required harness claim cannot advance to test without owner disposition and procedure.
  - verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    primary_method: not_ready
    secondary_methods: []
    rationale: Required simulation inputs are missing.
  - verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    primary_method: owner_review
    secondary_methods:
      - demonstration
    rationale: Source authority and owner intent are unresolved.
  - verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
    primary_method: owner_review
    secondary_methods:
      - inspection
    rationale: Conflicting board revisions block configuration-dependent planning.

evidence_need_register:
  - evidence_need_id: EVID-SYN-001
    verification_item_id: VP-SYN-REG-3V3-TR-SYN-001-PWR-01-QUANT-RAIL-VOUT
    needed:
      - approved source evidence
      - quantitative analysis or measurement result
      - configuration identity
    status: prerequisite_pending
  - evidence_need_id: EVID-SYN-002
    verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    needed:
      - owner decision
      - approved harness evidence
      - fixture procedure
      - future test result if approved
    status: blocked_owner_and_procedure
  - evidence_need_id: EVID-SYN-003
    verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    needed:
      - simulation model
      - simulation deck
      - stimuli
      - measurement criteria
      - future simulation result
    status: blocked_missing_evidence
  - evidence_need_id: EVID-SYN-004
    verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    needed:
      - official source reference
      - owner intent decision
      - observable behavior definition
    status: blocked_owner_and_source
  - evidence_need_id: EVID-SYN-005
    verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
    needed:
      - reconciled configuration baseline
      - owner conflict-resolution decision
      - future baseline-bound result packet
    status: blocked_source_conflict

verification_gap_register:
  - gap_id: GAP-SYN-002-OWNER-DECISION
    verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    gap_type: missing_owner_decision
    state: open
    action: Resolve whether J1.1_to_U1.VIN is an approved verification connection.
  - gap_id: GAP-SYN-002-TEST-FIXTURE-PROCEDURE
    verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    gap_type: missing_procedure
    state: open
    action: Provide the applicable test fixture procedure.
  - gap_id: GAP-SYN-002-HARNESS-REVIEW
    verification_item_id: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    gap_type: harness_review_required
    state: blocking
    action: Preserve review-required status until owner disposition.
  - gap_id: GAP-SYN-003-SIMULATION-MODEL
    verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    gap_type: missing_simulation_model
    state: blocking
  - gap_id: GAP-SYN-003-SIMULATION-DECK
    verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    gap_type: missing_simulation_deck
    state: blocking
  - gap_id: GAP-SYN-003-STIMULI
    verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    gap_type: missing_procedure
    state: blocking
  - gap_id: GAP-SYN-003-MEASUREMENT-CRITERIA
    verification_item_id: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    gap_type: missing_quantitative_value
    state: blocking
  - gap_id: GAP-SYN-004-OFFICIAL-SOURCE
    verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    gap_type: missing_source_ref
    state: blocking
  - gap_id: GAP-SYN-004-OWNER-INTENT
    verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    gap_type: missing_owner_decision
    state: blocking
  - gap_id: GAP-SYN-004-OBSERVABLE-BEHAVIOR
    verification_item_id: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    gap_type: missing_procedure
    state: open
  - gap_id: GAP-SYN-005-VERSION-CONFLICT
    verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
    gap_type: version_or_checksum_conflict
    state: blocking
    action: Reconcile board rev A versus configuration packet rev B.
  - gap_id: GAP-SYN-005-OWNER-DECISION
    verification_item_id: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
    gap_type: missing_owner_decision
    state: blocking

owner_followup_needed:
  - owner_followup_id: OF-SYN-001
    related_gap_ids:
      - GAP-SYN-002-OWNER-DECISION
      - GAP-SYN-002-TEST-FIXTURE-PROCEDURE
      - GAP-SYN-004-OFFICIAL-SOURCE
      - GAP-SYN-004-OWNER-INTENT
      - GAP-SYN-005-VERSION-CONFLICT
      - GAP-SYN-005-OWNER-DECISION
    action: Supply scoped decisions, source references, procedure references, and the applicable configuration baseline.
    owner_decision_status: pending
    does_not_claim: owner approval or resolution

test_or_simulation_readiness:
  planning_only: true
  execution_permitted_by_this_bundle: false
  simulation:
    status: not_ready
    blocked_item_ids:
      - VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    missing:
      - simulation model
      - simulation deck
      - stimuli
      - measurement criteria
  test:
    status: blocked
    blocked_item_ids:
      - VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
      - VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
    missing_or_blocking:
      - owner harness decision
      - test fixture procedure
      - reconciled configuration baseline
  demonstration:
    status: owner_review_required
    blocked_item_ids:
      - VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    missing_or_blocking:
      - official source reference
      - owner intent decision
      - observable behavior definition

trr_readiness_handoff:
  handoff_id: TRR-SYN-001
  status: preparation_only
  trr_approval: not_claimed
  planned_items: 5
  prerequisites:
    - resolve harness review and fixture procedure
    - provide simulation model, deck, stimuli, and criteria
    - provide LED source and owner intent
    - reconcile configuration baseline conflict
    - obtain future analysis or measurement evidence for quantitative item
  blockers:
    - GAP-SYN-002-HARNESS-REVIEW
    - GAP-SYN-003-SIMULATION-MODEL
    - GAP-SYN-003-SIMULATION-DECK
    - GAP-SYN-003-STIMULI
    - GAP-SYN-003-MEASUREMENT-CRITERIA
    - GAP-SYN-005-VERSION-CONFLICT
  next_consumer: test_harness_asset_planning_v0

fca_svr_handoff_index:
  index_id: FCA-SVR-SYN-001
  status: planned_anchor_only
  acceptance_evidence: not_present
  expected_future_result_refs:
    - result_ref_for: VP-SYN-REG-3V3-TR-SYN-001-PWR-01-QUANT-RAIL-VOUT
    - result_ref_for: VP-SYN-VIN-HARNESS-TR-SYN-002-PWR-01-HARNESS-J1.1-U1.VIN
    - result_ref_for: VP-SYN-STARTUP-SIM-TR-SYN-003-PWR-01-PSPICE-STARTUP-TRANSIENT
    - result_ref_for: VP-SYN-STATUS-LED-TR-SYN-004-LED-02-FUNCTION-STATUS-LED-ENABLE
    - result_ref_for: VP-SYN-CFG-BASELINE-TR-SYN-005-PWR-01-CONFIG-REVISION
  acceptance_status: deferred_until_accepted_result_packets_exist
  next_consumer: functional_configuration_audit_page_library_v0

verification_plan_summary: |
  Synthetic public-safe verification planning bundle for SYN_PUBLIC_CAL.
  Five atomic planning items were created from five trace rows.

  One quantitative item has a seeded analysis criterion based on approved source and quantitative packet references. Two items require owner review. One simulation item is not ready because required simulation inputs are missing. One configuration item is blocked by a board-revision conflict.

  This bundle records planned methods, evidence needs, blockers, owner follow-up, and future TRR/FCA-SVR anchors. It contains no verification execution, pass/fail result, approval, acceptance, or TRR decision.

verification_plan_provenance:
  fixture_id: synthetic_public_verification_plan_fixture_20260515_001
  workflow_id: verification_plan_from_page_contracts_v0
  project_code: SYN_PUBLIC_CAL
  approved_refs:
    - artifact_kind: seed_matrix
      ref: SYN-SEED-001
      checksum_sha256: "1111"
    - artifact_kind: trace_matrix
      ref: SYN-TRACE-001
      checksum_sha256: "2222"
    - artifact_kind: evidence_authority_map
      ref: SYN-AUTH-001
      checksum_sha256: "3333"
    - artifact_kind: quantitative_packet
      ref: SYN-QUANT-001
      checksum_sha256: "4444"
    - artifact_kind: simulation_source_packet
      ref: SYN-SIM-001
      checksum_sha256: "5555"
    - artifact_kind: interface_control_packet
      ref: SYN-IFC-001
      checksum_sha256: "6666"
    - artifact_kind: harness_packet
      ref: SYN-HAR-001
      checksum_sha256: "7777"
    - artifact_kind: configuration_baseline_ref
      ref: SYN-CFG-A
      checksum_sha256: "8888"
    - artifact_kind: configuration_baseline_ref
      ref: SYN-CFG-B
      checksum_sha256: "9999"
  upstream_artifacts_read_only: true
  public_safe: true
  payloads_embedded: false
  runtime_paths_embedded: false
  verification_results_embedded: false
  owner_decisions_embedded: false

boundary_review_note: |
  Planning-only boundary preserved. The verification plan is not a verification result.
  The requirements matrix is not a pass/fail record. Method assignments do not execute
  inspection, analysis, simulation, test, demonstration, or owner review. Readiness is
  execution-readiness planning only. Missing evidence, review-required harness state,
  and the configuration source conflict remain explicit blockers. TRR and FCA-SVR
  handoffs are planning anchors only and do not claim approval or acceptance.
```
