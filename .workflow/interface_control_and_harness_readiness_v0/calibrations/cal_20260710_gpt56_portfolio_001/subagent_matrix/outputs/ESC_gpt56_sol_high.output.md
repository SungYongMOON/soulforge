workflow_id: interface_control_and_harness_readiness_v0
deliverable_kind: interface_control_packet
project_code: PUBLIC_CAL
run_id: cal_interface_control_001
workflow_mode: harness_review
assessment_basis:
  scope: supplied_synthetic_fixture_only
  fact_treatment: fixture_assertions_not_independently_verified
  approval_scope_interpretation: synthetic_calibration_run_only
  upstream_artifacts: read_only
  uncertainty_rule: absent_fields_are_missing_not_inferred
  readiness_semantics: eligibility_ceilings_not_final_harness_statuses

interface_input_inventory:
  - artifact_ref: ref_page_mod_alpha_v1
    artifact_kind: page_module_sidecar
    checksum_sha256: sha256:aaa111
    approval_scope: synthetic_calibration_run_only
    owning_workflow_id: page_xml_normalize_spec_v0

  - artifact_ref: ref_asset_manifest_alpha_v1
    artifact_kind: page_asset_manifest
    checksum_sha256: sha256:bbb222
    approval_scope: synthetic_calibration_run_only
    owning_workflow_id: page_xml_normalize_spec_v0

  - artifact_ref: ref_source_alpha_v1
    artifact_kind: official_source_packet
    checksum_sha256: null
    checksum_state: not_supplied
    source_status: official_present_synthetic
    approval_scope: synthetic_calibration_run_only
    owning_workflow_id: official_source_packet_collect_v0

  - artifact_ref: ref_quant_alpha_v1
    artifact_kind: quantitative_enrichment_packet
    checksum_sha256: null
    checksum_state: not_supplied
    approval_scope: synthetic_calibration_run_only
    owning_workflow_id: page_quantitative_enrichment_v0

  - artifact_ref: ref_harness_alpha_v1
    artifact_kind: harness_composition_packet
    checksum_sha256: null
    checksum_state: not_supplied
    approval_scope: synthetic_calibration_run_only
    owning_workflow_id: xml_harness_composition_v0

interface_control_ledger:
  - interface_control_id: IC-PUBLIC-CAL-001
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.outputs.J1_PIN1
    upstream_container: outputs
    original_label: VBUS_OUT
    source_ref: ref_source_alpha_v1#SRC_VBUS
    owner_scope_ref: synthetic_calibration_run_only
    interface_exposure: external_confirmed
    external_harness_eligible: true
    direction: output
    role: power_source
    domain: power
    connection_kind: wire_to_wire
    quantitative_constraints:
      voltage: 5V
      current_capacity: 500mA
      evidence_state: source_confirmed_synthetic
    readiness_ceiling: source_supported_possible
    ceiling_reason: Fixture supplies source-confirmed exposure, direction, domain, connection kind, voltage, and current capacity.
    evidence_refs:
      - ref_page_mod_alpha_v1#interfaces.outputs.J1_PIN1
      - ref_asset_manifest_alpha_v1#PAGE_A
      - ref_source_alpha_v1#SRC_VBUS
      - ref_quant_alpha_v1#VBUS_OUT
    unresolved_gaps: []
    non_claims:
      - Not a final harness connection approval.
      - Mating-end compatibility remains connection-specific.

  - interface_control_id: IC-PUBLIC-CAL-002
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.inputs.J2_PIN3
    upstream_container: inputs
    original_label: GPIO_WAKE
    source_ref: ref_source_alpha_v1#SRC_GPIO
    owner_scope_ref: synthetic_calibration_run_only
    interface_exposure: external_candidate
    external_harness_eligible: true
    direction: input
    role: wake_signal_input
    role_confidence: fixture_supported_but_incomplete
    domain: digital
    connection_kind: signal_wire
    quantitative_constraints:
      logic_level: 3.3V
      timing: missing
      evidence_state: partial
    readiness_ceiling: review_required
    ceiling_reason: The interface is plausible and partially quantified, but timing information is missing.
    evidence_refs:
      - ref_page_mod_alpha_v1#interfaces.inputs.J2_PIN3
      - ref_asset_manifest_alpha_v1#PAGE_A
      - ref_source_alpha_v1#SRC_GPIO
      - ref_quant_alpha_v1#GPIO_WAKE
    unresolved_gaps:
      - GAP-PUBLIC-CAL-003
    non_claims:
      - Compatibility with a wake controller is not established.
      - Missing timing is not treated as not applicable.

  - interface_control_id: IC-PUBLIC-CAL-003
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.local_internal_candidates.TP5
    upstream_container: local_internal_candidates
    original_label: TP5_BOOT
    source_ref: ref_source_alpha_v1#SRC_TEST
    owner_scope_ref: synthetic_calibration_run_only
    interface_exposure: local_internal
    external_harness_eligible: false
    direction: unknown_or_bidirectional
    role: test_debug
    domain: digital
    connection_kind: test_point
    readiness_ceiling: blocked
    ceiling_reason: Local test/debug candidate is non-external by default and cannot be used as an external harness endpoint without approved reclassification.
    blocker_code: local_internal_misuse
    evidence_refs:
      - ref_page_mod_alpha_v1#interfaces.local_internal_candidates.TP5
      - ref_source_alpha_v1#SRC_TEST
    unresolved_gaps:
      - GAP-PUBLIC-CAL-002
    non_claims:
      - An owner hint alone cannot make this endpoint external.
      - No reclassification is implied.

  - interface_control_id: IC-PUBLIC-CAL-004
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.passive_or_none.NC7
    upstream_container: passive_or_none
    original_label: NC7
    source_ref: ref_source_alpha_v1#SRC_NC
    owner_scope_ref: synthetic_calibration_run_only
    interface_exposure: no_connect
    external_harness_eligible: false
    direction: not_applicable
    role: no_connect
    domain: not_applicable
    connection_kind: none
    readiness_ceiling: blocked
    ceiling_reason: The fixture explicitly identifies this item as no-connect and therefore outside harness composition scope.
    blocker_code: no_connect_scope
    evidence_refs:
      - ref_page_mod_alpha_v1#interfaces.passive_or_none.NC7
      - ref_source_alpha_v1#SRC_NC
    unresolved_gaps: []
    non_claims:
      - No electrical connection is authorized or inferred.

  - interface_control_id: IC-PUBLIC-CAL-005
    page_asset_id: PAGE_B
    upstream_interface_ref: interfaces.outputs.PWM_A
    upstream_container: outputs
    original_label: PWM_A
    source_ref: ref_source_alpha_v1#SRC_PWM
    owner_scope_ref: synthetic_calibration_run_only
    interface_exposure: unknown
    external_harness_eligible: unconfirmed
    direction: inferred_output
    role: inferred_pwm_signal
    domain: unconfirmed
    connection_kind: unconfirmed
    quantitative_constraints:
      state: missing
    readiness_ceiling: blocked
    ceiling_reason: Required PWM semantics and quantitative constraints lack official source confirmation; label-based inference is insufficient.
    blocker_code: required_source_and_quantity_gap
    evidence_refs:
      - ref_page_mod_alpha_v1#interfaces.outputs.PWM_A
      - ref_source_alpha_v1#SRC_PWM
    unresolved_gaps:
      - GAP-PUBLIC-CAL-005
    non_claims:
      - The label does not establish PWM behavior, direction, voltage, frequency, duty-cycle range, or compatibility.

harness_readiness_matrix:
  - readiness_row_id: HR-PUBLIC-CAL-001
    subject_kind: interface
    subject_ref: IC-PUBLIC-CAL-001
    readiness_ceiling: source_supported_possible
    reason: Source-confirmed synthetic interface semantics and required 5V/500mA constraints are present.

  - readiness_row_id: HR-PUBLIC-CAL-002
    subject_kind: interface
    subject_ref: IC-PUBLIC-CAL-002
    readiness_ceiling: review_required
    reason: Timing evidence is missing.

  - readiness_row_id: HR-PUBLIC-CAL-003
    subject_kind: interface
    subject_ref: IC-PUBLIC-CAL-003
    readiness_ceiling: blocked
    reason: Local/internal endpoint is not externally eligible.

  - readiness_row_id: HR-PUBLIC-CAL-004
    subject_kind: interface
    subject_ref: IC-PUBLIC-CAL-004
    readiness_ceiling: blocked
    reason: Explicit no-connect item.

  - readiness_row_id: HR-PUBLIC-CAL-005
    subject_kind: interface
    subject_ref: IC-PUBLIC-CAL-005
    readiness_ceiling: blocked
    reason: Source-confirmed PWM semantics and quantitative constraints are absent.

  - readiness_row_id: HR-PUBLIC-CAL-006
    subject_kind: harness_join
    subject_ref: JOIN_1
    controlled_endpoint_refs:
      - IC-PUBLIC-CAL-001
      - unresolved:external_load_vbus
    previous_harness_status: candidate_safe
    previous_status_used_as_evidence: false
    readiness_ceiling: review_required
    reason: VBUS_OUT supports the stated 5V/500mA requirement, but the mating endpoint has no controlled identity, direction, load requirement, or source evidence in the fixture.
    gap_refs:
      - GAP-PUBLIC-CAL-001

  - readiness_row_id: HR-PUBLIC-CAL-007
    subject_kind: harness_join
    subject_ref: JOIN_2
    controlled_endpoint_refs:
      - IC-PUBLIC-CAL-003
      - unresolved:external_debug_header
    previous_harness_status: candidate_safe
    previous_status_used_as_evidence: false
    readiness_ceiling: blocked
    reason: TP5 is a local test/debug endpoint and is being proposed for external use without approved reclassification.
    gap_refs:
      - GAP-PUBLIC-CAL-002

  - readiness_row_id: HR-PUBLIC-CAL-008
    subject_kind: harness_join
    subject_ref: JOIN_3
    controlled_endpoint_refs:
      - IC-PUBLIC-CAL-002
      - unresolved:wake_controller
    previous_harness_status: review_required
    previous_status_used_as_evidence: false
    readiness_ceiling: blocked
    reason: The join explicitly requires a timing constraint that is missing; mating-side timing compatibility is also unsupported.
    gap_refs:
      - GAP-PUBLIC-CAL-003
      - GAP-PUBLIC-CAL-004

  - readiness_row_id: HR-PUBLIC-CAL-009
    subject_kind: harness_join
    subject_ref: JOIN_4
    controlled_endpoint_refs:
      - IC-PUBLIC-CAL-005
      - unresolved:motor_ctrl_pwm
    previous_harness_status: candidate_safe
    previous_status_used_as_evidence: false
    readiness_ceiling: blocked
    reason: The required source-confirmed PWM semantics are absent, and the mating endpoint is uncontrolled in the fixture.
    gap_refs:
      - GAP-PUBLIC-CAL-005
      - GAP-PUBLIC-CAL-006

blocked_interface_items:
  - item_ref: IC-PUBLIC-CAL-003
    reason_code: local_internal_misuse
    route: scoped_reclassification_process_or_remove_from_external_harness_scope

  - item_ref: IC-PUBLIC-CAL-004
    reason_code: no_connect_scope
    route: keep_out_of_harness_composition

  - item_ref: IC-PUBLIC-CAL-005
    reason_code: required_source_and_quantity_gap
    route: official_source_and_quantitative_followup

  - item_ref: JOIN_2
    reason_code: local_internal_misuse
    route: remove_join_or_obtain_source-backed_scoped_reclassification

  - item_ref: JOIN_3
    reason_code: missing_required_timing_constraint
    route: quantitative_and_mating_endpoint_followup

  - item_ref: JOIN_4
    reason_code: missing_required_pwm_semantics
    route: official_source_and_mating_endpoint_followup

review_required_interface_items:
  - item_ref: IC-PUBLIC-CAL-002
    reason_code: partial_quantitative_support
    route: resolve_timing_requirements

  - item_ref: JOIN_1
    reason_code: mating_endpoint_uncontrolled
    route: supply_controlled_external_load_contract

candidate_safe_possible_items: []

source_supported_possible_items:
  - item_ref: IC-PUBLIC-CAL-001
    ceiling_only: true
    evidence_refs:
      - ref_source_alpha_v1#SRC_VBUS
      - ref_quant_alpha_v1#VBUS_OUT
    limitation: Does not promote JOIN_1 or any other harness connection.

compatibility_gap_report:
  - gap_id: GAP-PUBLIC-CAL-001
    subject_ref: JOIN_1
    gap_kind: mating_endpoint_control_gap
    description: external_load_vbus lacks controlled identity, exposure, direction, domain, load constraints, and source refs.
    effect: review_required
    owning_route: mating_endpoint_source_or_interface_owner
    closure_condition: Controlled mating-end contract confirms 5V compatibility, current demand not exceeding 500mA, return/reference requirements, and connection kind.

  - gap_id: GAP-PUBLIC-CAL-002
    subject_refs:
      - IC-PUBLIC-CAL-003
      - JOIN_2
    gap_kind: local_internal_misuse
    description: TP5_BOOT is local test/debug only but is proposed as an external harness endpoint.
    effect: blocks_harness
    owning_route: upstream_interface_owner_and_scoped_owner_decision
    closure_condition: Remove the join, or provide a scoped source-backed reclassification with exposure, role, direction, constraints, and upstream-authority preservation.

  - gap_id: GAP-PUBLIC-CAL-003
    subject_refs:
      - IC-PUBLIC-CAL-002
      - JOIN_3
    gap_kind: required_quantitative_constraint_missing
    description: GPIO_WAKE timing constraints are absent although JOIN_3 explicitly requires them.
    effect: blocks_harness
    owning_route: page_quantitative_enrichment_v0
    closure_condition: Source-confirmed or source-derived timing limits are supplied and mapped to GPIO_WAKE.

  - gap_id: GAP-PUBLIC-CAL-004
    subject_ref: JOIN_3
    gap_kind: mating_endpoint_control_gap
    description: wake_controller timing, direction, logic thresholds, and source authority are not supplied.
    effect: blocks_candidate_safe_possible
    owning_route: mating_endpoint_source_or_interface_owner
    closure_condition: Controlled mating-side evidence establishes compatible timing, direction, and 3.3V logic constraints.

  - gap_id: GAP-PUBLIC-CAL-005
    subject_refs:
      - IC-PUBLIC-CAL-005
      - JOIN_4
    gap_kind: source_semantics_and_quantity_gap
    description: PWM role, direction, voltage, frequency, duty-cycle constraints, and connection kind are not source-confirmed.
    effect: blocks_harness
    owning_route: official_source_packet_collect_v0_then_page_quantitative_enrichment_v0
    closure_condition: Approved source evidence confirms PWM semantics and all constraints required by the proposed connection.

  - gap_id: GAP-PUBLIC-CAL-006
    subject_ref: JOIN_4
    gap_kind: mating_endpoint_control_gap
    description: motor_ctrl_pwm has no controlled mating-end contract in the fixture.
    effect: blocks_candidate_safe_possible
    owning_route: mating_endpoint_source_or_interface_owner
    closure_condition: Controlled evidence confirms compatible direction, voltage, timing, polarity, domain, and connection kind.

owner_followup_needed:
  - followup_id: OF-PUBLIC-CAL-001
    subject_ref: JOIN_1
    requested_decision: Identify the authoritative owner and approved source refs for external_load_vbus.
    authority_limit: Owner identification does not itself establish electrical compatibility.

  - followup_id: OF-PUBLIC-CAL-002
    subject_refs:
      - IC-PUBLIC-CAL-003
      - JOIN_2
    requested_decision: Confirm that TP5_BOOT remains local-only, or initiate a scoped source-backed reclassification request.
    authority_limit: Owner preference cannot replace missing source facts or mutate the upstream sidecar.

  - followup_id: OF-PUBLIC-CAL-003
    subject_ref: JOIN_3
    requested_decision: Identify the applicable wake timing requirement and authoritative source owner.
    authority_limit: Timing values must come from approved evidence or valid derivation, not an unsupported decision.

  - followup_id: OF-PUBLIC-CAL-004
    subject_ref: JOIN_4
    requested_decision: Identify authoritative PWM and motor-controller source packets.
    authority_limit: The PWM_A label and previous harness status cannot establish semantics.

interface_open_questions:
  - question_id: OQ-PUBLIC-CAL-001
    subject_ref: JOIN_1
    question: What are the controlled voltage, maximum current demand, return path, and connection-kind requirements of external_load_vbus?
    blocking_level: review_required

  - question_id: OQ-PUBLIC-CAL-002
    subject_ref: JOIN_2
    question: Is external use of TP5_BOOT actually required, and if so, where is the scoped source-backed reclassification?
    blocking_level: blocked

  - question_id: OQ-PUBLIC-CAL-003
    subject_ref: JOIN_3
    question: What setup, hold, pulse-width, latency, polarity, and threshold constraints apply to both GPIO_WAKE and wake_controller?
    blocking_level: blocked

  - question_id: OQ-PUBLIC-CAL-004
    subject_ref: JOIN_4
    question: What source-confirmed PWM voltage, frequency, duty-cycle, polarity, direction, and input-loading constraints apply?
    blocking_level: blocked

source_gap_rerun_triggers:
  - trigger_id: RT-PUBLIC-CAL-001
    condition: Approved GPIO_WAKE timing source becomes available.
    narrowest_owning_workflow: page_quantitative_enrichment_v0
    affected_items:
      - IC-PUBLIC-CAL-002
      - JOIN_3
    automatic_promotion_allowed: false

  - trigger_id: RT-PUBLIC-CAL-002
    condition: Approved PWM_A semantic source becomes available.
    narrowest_owning_workflow: official_source_packet_collect_v0
    affected_items:
      - IC-PUBLIC-CAL-005
      - JOIN_4
    automatic_promotion_allowed: false

  - trigger_id: RT-PUBLIC-CAL-003
    condition: Source-confirmed PWM quantities are available after semantic-source closure.
    narrowest_owning_workflow: page_quantitative_enrichment_v0
    affected_items:
      - IC-PUBLIC-CAL-005
      - JOIN_4
    automatic_promotion_allowed: false

  - trigger_id: RT-PUBLIC-CAL-004
    condition: Controlled mating-end evidence becomes available for external_load_vbus, wake_controller, or motor_ctrl_pwm.
    narrowest_owning_workflow: interface_control_and_harness_readiness_v0
    prerequisite_owner: mating_endpoint_source_or_interface_owner
    affected_items:
      - JOIN_1
      - JOIN_3
      - JOIN_4
    automatic_promotion_allowed: false

  - trigger_id: RT-PUBLIC-CAL-005
    condition: A scoped source-backed TP5_BOOT reclassification is approved and reflected by the upstream-owning workflow.
    narrowest_owning_workflow: interface_control_and_harness_readiness_v0
    affected_items:
      - IC-PUBLIC-CAL-003
      - JOIN_2
    automatic_promotion_allowed: false

harness_input_delta:
  packet_ref: ref_harness_alpha_v1
  packet_mutation_authorized: false
  downstream_rule: harness_may_weaken_but_not_strengthen_beyond_interface_control_ceiling
  join_deltas:
    - join_id: JOIN_1
      previous_harness_status: candidate_safe
      imposed_ceiling: review_required
      required_delta: weaken_to_review_required
      reason: Mating endpoint lacks a controlled contract.

    - join_id: JOIN_2
      previous_harness_status: candidate_safe
      imposed_ceiling: blocked
      required_delta: weaken_to_blocked
      reason: Local/internal endpoint misuse.

    - join_id: JOIN_3
      previous_harness_status: review_required
      imposed_ceiling: blocked
      required_delta: weaken_to_blocked
      reason: Required timing constraint and mating-side evidence are missing.

    - join_id: JOIN_4
      previous_harness_status: candidate_safe
      imposed_ceiling: blocked
      required_delta: weaken_to_blocked
      reason: Required source-confirmed PWM semantics and mating-side evidence are missing.
  promotions_authorized: []
  final_harness_claims: []

interface_control_summary:
  controlled_interface_count: 5
  harness_join_count: 4
  combined_readiness_counts:
    blocked: 6
    review_required: 2
    candidate_safe_possible: 0
    source_supported_possible: 1
  local_internal_candidate_count: 1
  local_internal_external_eligible_count: 0
  join_ceiling_changes:
    weakened: 4
    unchanged: 0
    strengthened: 0
  narrow_next_route: Resolve JOIN_1 mating-end evidence first; it is the only join without a hard page-end blocker.

stop_conditions:
  - Stop promotion of any blocked item until its stated closure conditions are satisfied.
  - Stop if identity, checksum, lineage, or approval-scope conflicts appear.
  - Stop if evidence outside the approved synthetic refs would be required.
  - Stop if a hidden reference, verifier report, prior accepted output, repair packet, secret, account, or session state would be needed.
  - Stop external use of local/internal candidates without scoped source-backed reclassification.
  - Stop if closure would require mutation of an upstream sidecar, source packet, quantitative packet, or harness packet.
  - Stop source-supported promotion when required source status is missing, conflicting, unapproved, or unclear.
  - Stop treating owner decisions as substitutes for source or quantitative facts.

boundary_review_note: |
  # Boundary Review Note

  Disposition: bounded fixture deliverable with unresolved blockers.

  The sole local/internal candidate, IC-PUBLIC-CAL-003, remains non-external.
  All four readiness partitions are present, including the empty
  candidate-safe-possible partition. Possible states are ceilings only and do
  not constitute final harness approval.

  IC-PUBLIC-CAL-001 reaches `source_supported_possible` only within the supplied
  synthetic evidence scope. JOIN_1 remains `review_required` because its mating
  endpoint is uncontrolled. JOIN_2, JOIN_3, and JOIN_4 remain blocked for,
  respectively, local/internal misuse, missing required timing, and missing
  source-confirmed PWM semantics.

  Upstream packets retain authority over their content. This packet does not
  patch upstream artifacts, promote harness connections, establish real-world
  source truth, synthesize circuitry, generate a schematic or netlist, accept
  verification results, or make a review-gate decision.
