fixture_id: synthetic_public_verification_plan_fixture_20260515_001
workflow_id: verification_plan_from_page_contracts_v0
mode: plan_from_trace
project_code: SYN_PUBLIC_CAL
planning_only: true
verification_execution_allowed: false
verification_completion_claim_allowed: false

verification_plan:
  plan_id: SYN-VPLAN-001
  scope_ref: SYN-TRACE-001
  status: planning_only
  items:
    - verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
      trace_row_id: TR-SYN-001
      page_asset_id: PWR-01
      verification_scope_key: REG-3V3
      claim_kind: quantitative_constraint
      normalized_field_path: rail.vout
      planned_claim: VOUT_3V3 nominal 3.3 V with tolerance +/-5%
      primary_method: analysis
      secondary_methods:
        - inspection
      method_rationale: Analysis can compare the quantitative claim against the approved source and quantitative packet; inspection only establishes source identity and applicability.
      evidence_need_ids:
        - SYN-EN-001
        - SYN-EN-002
      criteria_seed:
        status: source_supported
        basis_refs:
          - SRC-PSU-DS-001
          - SYN-QUANT-001
        criterion: Nominal value is 3.3 V and stated tolerance is +/-5%.
      readiness_state: plan_ready
      gap_ids: []
      owner_followup_ids: []

    - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
      trace_row_id: TR-SYN-002
      page_asset_id: PWR-01
      verification_scope_key: VIN-HARNESS
      claim_kind: harness_connection_claim
      interface_scope: J1.1_to_U1.VIN
      planned_claim: Determine whether the review-required harness connection may become an executable verification item.
      primary_method: owner_review
      secondary_methods:
        - not_ready
      method_rationale: The harness claim requires a scoped owner decision before execution planning; a test cannot be ready without a fixture procedure.
      evidence_need_ids:
        - SYN-EN-003
        - SYN-EN-004
      criteria_seed:
        status: blocked
        basis_refs: []
        criterion: null
        reason: Owner decision and test fixture procedure are missing.
      readiness_state: owner_review_required
      gap_ids:
        - SYN-GAP-001
        - SYN-GAP-002
      owner_followup_ids:
        - SYN-OFU-001

    - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
      trace_row_id: TR-SYN-003
      page_asset_id: PWR-01
      verification_scope_key: STARTUP-SIM
      claim_kind: pspice_readiness
      normalized_field_path: startup.transient
      planned_claim: Prepare a startup-transient simulation item only after all required simulation inputs exist.
      primary_method: not_ready
      intended_future_method: simulation
      method_rationale: Simulation is allowed by policy, but no model, deck, stimuli, or measurement criteria are available.
      evidence_need_ids:
        - SYN-EN-005
        - SYN-EN-006
        - SYN-EN-007
        - SYN-EN-008
      criteria_seed:
        status: blocked
        basis_refs: []
        criterion: null
        reason: Measurement criteria and prerequisite simulation materials are missing.
      readiness_state: blocked_missing_evidence
      gap_ids:
        - SYN-GAP-003
        - SYN-GAP-004
        - SYN-GAP-005
        - SYN-GAP-006
      owner_followup_ids: []

    - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
      trace_row_id: TR-SYN-004
      page_asset_id: LED-02
      verification_scope_key: STATUS-LED
      claim_kind: function_claim
      normalized_field_path: status_led.indication
      planned_claim: Establish the authoritative intended relationship between regulator enable state and status LED indication.
      primary_method: owner_review
      secondary_methods:
        - not_ready
      method_rationale: Owner review may establish intent, but it cannot replace the missing official engineering source needed for an evidence-backed functional criterion.
      evidence_need_ids:
        - SYN-EN-009
        - SYN-EN-010
      criteria_seed:
        status: blocked
        basis_refs: []
        criterion: null
        reason: Official source support and owner intent are missing.
      readiness_state: owner_review_required
      gap_ids:
        - SYN-GAP-007
        - SYN-GAP-008
      owner_followup_ids:
        - SYN-OFU-002

    - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
      trace_row_id: TR-SYN-005
      page_asset_id: PWR-01
      verification_scope_key: CFG-BASELINE
      claim_kind: configuration_baseline
      normalized_field_path: board.revision
      planned_claim: Resolve the conflicting board-revision baseline before affected test planning proceeds.
      primary_method: owner_review
      secondary_methods:
        - inspection
      method_rationale: Inspection can expose the revision mismatch, but only an authorized baseline decision can establish which configuration governs later testing.
      evidence_need_ids:
        - SYN-EN-011
      criteria_seed:
        status: blocked_source_conflict
        basis_refs:
          - SYN-TRACE-001
          - SYN-CFG-A
          - SYN-CFG-B
        criterion: null
        reason: The trace identifies revision A while the configuration packet identifies revision B.
      readiness_state: blocked_source_conflict
      gap_ids:
        - SYN-GAP-009
      owner_followup_ids:
        - SYN-OFU-003

verification_requirements_matrix:
  - verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
    requirement_seed: VOUT_3V3 nominal 3.3 V with tolerance +/-5%
    method: analysis
    evidence_status: identified
    criteria_seed_status: source_supported
    readiness_state: plan_ready
    result_status: not_executed

  - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    requirement_seed: Harness connection disposition must be decided before an execution item is defined.
    method: owner_review
    evidence_status: missing_prerequisites
    criteria_seed_status: blocked
    readiness_state: owner_review_required
    result_status: not_executed

  - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    requirement_seed: Startup transient simulation requires a model, deck, stimuli, measurements, and criteria.
    method: not_ready
    intended_future_method: simulation
    evidence_status: missing_prerequisites
    criteria_seed_status: blocked
    readiness_state: blocked_missing_evidence
    result_status: not_executed

  - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    requirement_seed: Status LED functional intent requires authoritative definition.
    method: owner_review
    evidence_status: missing_source_and_intent
    criteria_seed_status: blocked
    readiness_state: owner_review_required
    result_status: not_executed

  - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
    requirement_seed: One authorized board revision must govern affected test planning.
    method: owner_review
    evidence_status: conflicting
    criteria_seed_status: blocked_source_conflict
    readiness_state: blocked_source_conflict
    result_status: not_executed

method_map:
  - verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
    primary_method: analysis
    secondary_methods: [inspection]
    execution_planned_here: false

  - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    primary_method: owner_review
    secondary_methods: [not_ready]
    execution_planned_here: false

  - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    primary_method: not_ready
    intended_future_method: simulation
    execution_planned_here: false

  - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    primary_method: owner_review
    secondary_methods: [not_ready]
    execution_planned_here: false

  - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
    primary_method: owner_review
    secondary_methods: [inspection]
    execution_planned_here: false

evidence_need_register:
  - evidence_need_id: SYN-EN-001
    verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
    need: Applicable approved source for the regulator output requirement
    candidate_ref: SRC-PSU-DS-001
    status: identified
  - evidence_need_id: SYN-EN-002
    verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
    need: Quantitative value and tolerance packet
    candidate_ref: SYN-QUANT-001
    status: identified
  - evidence_need_id: SYN-EN-003
    verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    need: Scoped disposition of the review-required connection
    status: missing_owner_decision
  - evidence_need_id: SYN-EN-004
    verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    need: Approved test fixture procedure
    status: missing
  - evidence_need_id: SYN-EN-005
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    need: Compatible simulation model
    candidate_ref: SYN-SIM-001
    status: missing
  - evidence_need_id: SYN-EN-006
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    need: Simulation deck
    status: missing
  - evidence_need_id: SYN-EN-007
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    need: Defined startup stimuli
    status: missing
  - evidence_need_id: SYN-EN-008
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    need: Measurement definitions and approved acceptance criteria
    status: missing
  - evidence_need_id: SYN-EN-009
    verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    need: Official source defining the LED behavior
    status: missing
  - evidence_need_id: SYN-EN-010
    verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    need: Scoped owner intent decision
    status: missing_owner_decision
  - evidence_need_id: SYN-EN-011
    verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
    need: Authorized governing board-revision baseline
    candidate_refs:
      - SYN-CFG-A
      - SYN-CFG-B
    status: conflicting

verification_gap_register:
  - gap_id: SYN-GAP-001
    verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    gap_type: harness_review_required
    blocker: true
    retry_trigger: Scoped owner disposition is recorded.
  - gap_id: SYN-GAP-002
    verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    gap_type: missing_procedure
    blocker: true
    retry_trigger: Approved test fixture procedure is referenced.
  - gap_id: SYN-GAP-003
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    gap_type: missing_simulation_model
    blocker: true
    retry_trigger: Compatible model reference is available.
  - gap_id: SYN-GAP-004
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    gap_type: missing_simulation_deck
    blocker: true
    retry_trigger: Simulation deck reference is available.
  - gap_id: SYN-GAP-005
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    gap_type: missing_procedure
    detail: Startup stimuli are undefined.
    blocker: true
    retry_trigger: Approved stimuli are defined.
  - gap_id: SYN-GAP-006
    verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
    gap_type: missing_quantitative_value
    detail: Measurement definitions and acceptance criteria are absent.
    blocker: true
    retry_trigger: Approved measurement criteria are referenced.
  - gap_id: SYN-GAP-007
    verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    gap_type: missing_source_ref
    blocker: true
    retry_trigger: Applicable official source is indexed.
  - gap_id: SYN-GAP-008
    verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    gap_type: missing_owner_decision
    blocker: true
    retry_trigger: Scoped owner intent is recorded.
  - gap_id: SYN-GAP-009
    verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
    gap_type: version_or_checksum_conflict
    detail: Trace revision A conflicts with configuration revision B.
    blocker: true
    retry_trigger: An authorized governing baseline resolves or supersedes the conflict.

owner_followup_needed:
  - owner_followup_id: SYN-OFU-001
    verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
    requested_decision: Approve, reject, or retain review-required status for J1.1_to_U1.VIN.
    decision_effect: Determines whether later test preparation is applicable.
    owner_decision_present: false
  - owner_followup_id: SYN-OFU-002
    verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
    requested_decision: State the intended status-LED behavior and identify its authoritative source.
    decision_effect: Enables criteria planning but does not itself supply engineering verification evidence.
    owner_decision_present: false
  - owner_followup_id: SYN-OFU-003
    verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
    requested_decision: Designate the governing board revision or authorize a scoped superseding baseline.
    decision_effect: Unblocks affected test-readiness planning.
    owner_decision_present: false

test_or_simulation_readiness:
  overall_state: blocked
  items:
    - verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
      execution_method: analysis
      readiness: plan_ready
      prerequisites: []
    - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
      execution_method: test
      readiness: owner_review_required
      prerequisites:
        - SYN-OFU-001
        - SYN-GAP-002
    - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
      execution_method: simulation
      readiness: blocked_missing_evidence
      prerequisites:
        - SYN-GAP-003
        - SYN-GAP-004
        - SYN-GAP-005
        - SYN-GAP-006
    - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
      execution_method: demonstration
      readiness: owner_review_required
      prerequisites:
        - SYN-GAP-007
        - SYN-OFU-002
    - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
      execution_method: test
      readiness: blocked_configuration
      prerequisites:
        - SYN-GAP-009
        - SYN-OFU-003
  simulation_or_test_results_present: false

trr_readiness_handoff:
  handoff_id: SYN-TRR-HO-001
  status: not_ready
  approval_claimed: false
  ready_plan_items:
    - SYN-VI-REG-3V3-RAIL-VOUT-001
  blocked_or_review_items:
    - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
      blockers: [SYN-GAP-001, SYN-GAP-002]
    - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
      blockers: [SYN-GAP-003, SYN-GAP-004, SYN-GAP-005, SYN-GAP-006]
    - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
      blockers: [SYN-GAP-007, SYN-GAP-008]
    - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
      blockers: [SYN-GAP-009]
  stop_conditions:
    - Do not route an affected item to execution while its blocking gap remains open.
    - Do not treat owner review as engineering verification evidence.
    - Do not claim TRR approval from this handoff.

fca_svr_handoff_index:
  handoff_id: SYN-FCA-SVR-HO-001
  acceptance_claimed: false
  expected_future_result_anchors:
    - verification_item_id: SYN-VI-REG-3V3-RAIL-VOUT-001
      expected_result_ref: SYN-FUTURE-RESULT-REG-3V3-001
      current_status: not_created
    - verification_item_id: SYN-VI-VIN-HARNESS-J1-1-U1-VIN-001
      expected_result_ref: SYN-FUTURE-RESULT-VIN-HARNESS-001
      current_status: blocked
    - verification_item_id: SYN-VI-STARTUP-SIM-PSPICE-001
      expected_result_ref: SYN-FUTURE-RESULT-STARTUP-SIM-001
      current_status: blocked
    - verification_item_id: SYN-VI-STATUS-LED-FUNCTION-001
      expected_result_ref: SYN-FUTURE-RESULT-STATUS-LED-001
      current_status: blocked
    - verification_item_id: SYN-VI-CFG-BASELINE-PWR01-001
      expected_result_ref: SYN-FUTURE-RESULT-CFG-BASELINE-001
      current_status: blocked
  note: Future result anchors are planning identifiers, not accepted evidence.

verification_plan_provenance:
  fixture_ref: synthetic_public_verification_plan_fixture_20260515_001
  approved_input_refs:
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
  input_treatment: read_only
  provenance_limit: References and supplied fixture statements only; underlying payload contents and applicability beyond the fixture are unknown.
  upstream_mutation_claimed: false
  result_evidence_consumed: false

verification_plan_summary:
  total_verification_items: 5
  plan_ready: 1
  plan_ready_with_prerequisites: 0
  owner_review_required: 2
  blocked_missing_evidence: 1
  blocked_source_conflict: 1
  gaps: 9
  owner_followups: 3
  verification_results: 0
  narrowest_next_route:
    - Resolve SYN-OFU-003 to establish the governing configuration baseline.
    - Resolve SYN-OFU-001 and provide the missing fixture procedure.
    - Supply the simulation model, deck, stimuli, and measurement criteria.
    - Supply an official status-LED source and scoped owner-intent decision.

boundary_review_note:
  planning_artifact_only: true
  claims_verification_execution: false
  claims_pass_or_fail: false
  claims_verification_acceptance: false
  claims_trr_approval: false
  claims_fca_svr_acceptance: false
  suppresses_missing_evidence: false
  source_conflicts_block_affected_items: true
  uncertainty:
    - Underlying approved-reference payloads are not represented in this deliverable.
    - Source applicability is preserved as supplied and is not independently established.
    - No simulation model, deck, test procedure, execution record, or accepted result is asserted.
    - Configuration revision A versus revision B remains unresolved.
  owner_boundary:
    - Owners retain authority over intent, harness disposition, waivers, applicability, and configuration-baseline decisions.
    - Owner decisions do not substitute for required engineering evidence.
  stop_conditions:
    - Stop affected execution planning when required evidence is missing.
    - Stop affected test readiness while the configuration conflict remains unresolved.
    - Keep startup simulation not ready until model, deck, stimuli, measurements, and criteria exist.
    - Do not promote the review-required harness connection without scoped owner disposition.
    - Do not create pass/fail, approval, acceptance, or completion claims from this plan.
