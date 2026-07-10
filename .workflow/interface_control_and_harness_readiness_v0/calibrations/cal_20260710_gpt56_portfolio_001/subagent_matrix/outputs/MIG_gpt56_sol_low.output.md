interface_control_packet:
  workflow_id: interface_control_and_harness_readiness_v0
  project_code: PUBLIC_CAL
  run_id: cal_interface_control_001
  workflow_mode: harness_review
  authority:
    upstream_artifacts_read_only: true
    readiness_values_are_eligibility_ceilings_only: true
    final_harness_promotion_owned_here: false
    quantitative_truth_owned_here: false
  approved_input_refs:
    - ref_id: ref_page_mod_alpha_v1
      checksum_sha256: "sha256:aaa111"
    - ref_id: ref_asset_manifest_alpha_v1
      checksum_sha256: "sha256:bbb222"
    - ref_id: ref_source_alpha_v1
      source_status: official_present_synthetic
    - ref_id: ref_quant_alpha_v1
    - ref_id: ref_harness_alpha_v1

interface_control_ledger:
  - interface_control_id: IC_PAGE_A_J1_PIN1
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.outputs.J1_PIN1
    upstream_container: outputs
    original_label: VBUS_OUT
    source_ref: SRC_VBUS
    owner_scope_ref: ref_source_alpha_v1
    interface_exposure: external_confirmed
    external_harness_eligible: true
    direction: output
    role: power_output
    domain: power
    connection_kind: wire_to_wire
    quantitative_constraints:
      voltage: 5V
      current: 500mA
      support: source_confirmed
    readiness_ceiling: source_supported_possible
    reason: Source-confirmed external power-output semantics and required quantities are present.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
      - ref_source_alpha_v1
      - ref_quant_alpha_v1

  - interface_control_id: IC_PAGE_A_J2_PIN3
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.inputs.J2_PIN3
    upstream_container: inputs
    original_label: GPIO_WAKE
    source_ref: SRC_GPIO
    owner_scope_ref: ref_source_alpha_v1
    interface_exposure: external_candidate
    external_harness_eligible: true
    direction: input
    role: wake_signal
    domain: digital
    connection_kind: signal_wire
    quantitative_constraints:
      logic_level: 3.3V
      timing: unknown
      support: partial
    readiness_ceiling: review_required
    reason: The required timing constraint is missing and the quantitative record is partial.
    gap_refs:
      - GAP_GPIO_WAKE_TIMING

  - interface_control_id: IC_PAGE_A_TP5
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.local_internal_candidates.TP5
    upstream_container: local_internal_candidates
    original_label: TP5_BOOT
    source_ref: SRC_TEST
    owner_scope_ref: null
    interface_exposure: local_internal
    external_harness_eligible: false
    direction: unknown
    role: test_debug
    domain: digital
    connection_kind: test_point
    quantitative_constraints: not_provided
    readiness_ceiling: blocked
    reason: Local test/debug candidate is non-external by default.
    gap_refs:
      - GAP_TP5_EXTERNAL_RECLASSIFICATION

  - interface_control_id: IC_PAGE_A_NC7
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.passive_or_none.NC7
    upstream_container: passive_or_none
    original_label: NC7
    source_ref: SRC_NC
    owner_scope_ref: ref_source_alpha_v1
    interface_exposure: no_connect
    external_harness_eligible: false
    direction: none
    role: no_connect
    domain: not_applicable
    connection_kind: none
    quantitative_constraints: not_applicable
    readiness_ceiling: blocked
    reason: No-connect items are outside harness-composition scope.
    gap_refs: []

  - interface_control_id: IC_PAGE_B_PWM_A
    page_asset_id: PAGE_B
    upstream_interface_ref: interfaces.outputs.PWM_A
    upstream_container: outputs
    original_label: PWM_A
    source_ref: SRC_PWM
    owner_scope_ref: null
    interface_exposure: unknown
    external_harness_eligible: undetermined
    direction: inferred_output
    role: inferred_pwm_signal
    domain: unknown
    connection_kind: unknown
    quantitative_constraints: missing
    readiness_ceiling: review_required
    reason: Role and direction derive from label-only inference; official semantic and quantitative support are absent.
    gap_refs:
      - GAP_PWM_SEMANTICS
      - GAP_PWM_QUANTITIES

harness_readiness_matrix:
  - readiness_item_id: HR_JOIN_1
    join_id: JOIN_1
    controlled_endpoint_ids:
      - IC_PAGE_A_J1_PIN1
    unresolved_endpoint_refs:
      - external_load_vbus
    previous_harness_status: candidate_safe
    readiness_ceiling: review_required
    reason: The controlled endpoint is source-supported, but compatibility and source support for the mating endpoint are not supplied.
    cannot_exceed: review_required
    gap_refs:
      - GAP_JOIN_1_MATING_ENDPOINT

  - readiness_item_id: HR_JOIN_2
    join_id: JOIN_2
    controlled_endpoint_ids:
      - IC_PAGE_A_TP5
    unresolved_endpoint_refs:
      - external_debug_header
    previous_harness_status: candidate_safe
    readiness_ceiling: blocked
    reason: TP5 is local/internal and lacks an approved external-interface reclassification.
    cannot_exceed: blocked
    gap_refs:
      - GAP_TP5_EXTERNAL_RECLASSIFICATION
      - GAP_JOIN_2_MATING_ENDPOINT

  - readiness_item_id: HR_JOIN_3
    join_id: JOIN_3
    controlled_endpoint_ids:
      - IC_PAGE_A_J2_PIN3
    unresolved_endpoint_refs:
      - wake_controller
    previous_harness_status: review_required
    readiness_ceiling: review_required
    reason: Required timing information and mating-endpoint compatibility evidence are missing.
    cannot_exceed: review_required
    gap_refs:
      - GAP_GPIO_WAKE_TIMING
      - GAP_JOIN_3_MATING_ENDPOINT

  - readiness_item_id: HR_JOIN_4
    join_id: JOIN_4
    controlled_endpoint_ids:
      - IC_PAGE_B_PWM_A
    unresolved_endpoint_refs:
      - motor_ctrl_pwm
    previous_harness_status: candidate_safe
    readiness_ceiling: review_required
    reason: Source-confirmed PWM semantics, quantitative constraints, and mating-endpoint compatibility evidence are absent.
    cannot_exceed: review_required
    gap_refs:
      - GAP_PWM_SEMANTICS
      - GAP_PWM_QUANTITIES
      - GAP_JOIN_4_MATING_ENDPOINT

blocked_interface_items:
  - item_id: IC_PAGE_A_TP5
    reason_code: local_internal_non_external
    route: scoped_reclassification_decision_or_source_backed_request
  - item_id: IC_PAGE_A_NC7
    reason_code: no_connect_non_composition_scope
    route: none
  - item_id: HR_JOIN_2
    reason_code: local_internal_misuse
    route: scoped_reclassification_and_endpoint_compatibility_review

review_required_interface_items:
  - item_id: IC_PAGE_A_J2_PIN3
    reason_code: required_timing_missing
    route: quantitative_enrichment_owner
  - item_id: IC_PAGE_B_PWM_A
    reason_code: label_only_semantics_and_missing_quantities
    route: official_source_packet_owner
  - item_id: HR_JOIN_1
    reason_code: mating_endpoint_uncontrolled
    route: harness_composition_owner
  - item_id: HR_JOIN_3
    reason_code: timing_and_mating_endpoint_incomplete
    route: quantitative_enrichment_and_harness_composition_owners
  - item_id: HR_JOIN_4
    reason_code: pwm_source_and_mating_endpoint_incomplete
    route: official_source_packet_and_harness_composition_owners

candidate_safe_possible_items: []

source_supported_possible_items:
  - item_id: IC_PAGE_A_J1_PIN1
    ceiling_only: true
    final_harness_status: not_assigned

compatibility_gap_report:
  - gap_id: GAP_GPIO_WAKE_TIMING
    affected_items:
      - IC_PAGE_A_J2_PIN3
      - HR_JOIN_3
    gap_effect: blocks_candidate_safe_possible
    missing: Source-supported timing constraint.
    owning_route: page_quantitative_enrichment_v0

  - gap_id: GAP_TP5_EXTERNAL_RECLASSIFICATION
    affected_items:
      - IC_PAGE_A_TP5
      - HR_JOIN_2
    gap_effect: blocks_harness
    missing: Scoped reclassification with exposure, role, direction, and constraints.
    owning_route: owner_decision_or_upstream_update

  - gap_id: GAP_PWM_SEMANTICS
    affected_items:
      - IC_PAGE_B_PWM_A
      - HR_JOIN_4
    gap_effect: blocks_candidate_safe_possible
    missing: Official or scoped owner-baselined PWM role, direction, domain, and connection-kind semantics.
    owning_route: official_source_packet_collect_v0

  - gap_id: GAP_PWM_QUANTITIES
    affected_items:
      - IC_PAGE_B_PWM_A
      - HR_JOIN_4
    gap_effect: blocks_candidate_safe_possible
    missing: Required PWM quantitative constraints.
    owning_route: page_quantitative_enrichment_v0

  - gap_id: GAP_JOIN_1_MATING_ENDPOINT
    affected_items:
      - HR_JOIN_1
    gap_effect: review_required
    missing: Controlled identity, direction, domain, connection kind, and 5V/500mA compatibility for external_load_vbus.
    owning_route: xml_harness_composition_v0

  - gap_id: GAP_JOIN_2_MATING_ENDPOINT
    affected_items:
      - HR_JOIN_2
    gap_effect: blocks_harness
    missing: Controlled compatibility evidence for external_debug_header.
    owning_route: xml_harness_composition_v0

  - gap_id: GAP_JOIN_3_MATING_ENDPOINT
    affected_items:
      - HR_JOIN_3
    gap_effect: review_required
    missing: Controlled compatibility evidence for wake_controller.
    owning_route: xml_harness_composition_v0

  - gap_id: GAP_JOIN_4_MATING_ENDPOINT
    affected_items:
      - HR_JOIN_4
    gap_effect: review_required
    missing: Controlled compatibility evidence for motor_ctrl_pwm.
    owning_route: xml_harness_composition_v0

owner_followup_needed:
  - followup_id: OWNER_TP5_RECLASSIFICATION
    affected_items:
      - IC_PAGE_A_TP5
      - HR_JOIN_2
    decision_needed: Confirm whether TP5 may be proposed for external use.
    required_scope:
      - exposure
      - role
      - direction
      - constraints
    boundary: An owner decision cannot replace required source facts.

interface_open_questions:
  - question_id: Q_GPIO_WAKE_TIMING
    question: What source-supported timing constraint applies to GPIO_WAKE?
  - question_id: Q_TP5_EXTERNALITY
    question: Is TP5_BOOT intentionally eligible for external harness use under a scoped reclassification?
  - question_id: Q_PWM_CONTROL
    question: What official source defines PWM_A semantics and required quantitative constraints?
  - question_id: Q_MATING_ENDPOINTS
    question: Where are the controlled identities and compatibility evidence for the four external mating endpoints?

source_gap_rerun_triggers:
  - trigger_id: RERUN_GPIO_QUANT
    when: Source-supported GPIO_WAKE timing evidence becomes available.
    narrowest_owning_workflow: page_quantitative_enrichment_v0
    affected_items:
      - IC_PAGE_A_J2_PIN3
      - HR_JOIN_3
  - trigger_id: RERUN_PWM_SOURCE
    when: Official or scoped approved PWM_A semantic evidence becomes available.
    narrowest_owning_workflow: official_source_packet_collect_v0
    affected_items:
      - IC_PAGE_B_PWM_A
      - HR_JOIN_4
  - trigger_id: RERUN_PWM_QUANT
    when: Source-supported PWM_A quantitative constraints become available.
    narrowest_owning_workflow: page_quantitative_enrichment_v0
    affected_items:
      - IC_PAGE_B_PWM_A
      - HR_JOIN_4
  - trigger_id: RERUN_HARNESS_ENDPOINTS
    when: Controlled mating-endpoint evidence becomes available.
    narrowest_owning_workflow: xml_harness_composition_v0
    affected_items:
      - HR_JOIN_1
      - HR_JOIN_2
      - HR_JOIN_3
      - HR_JOIN_4

harness_input_delta:
  harness_packet_ref: ref_harness_alpha_v1
  mutation_requested: false
  ceiling_updates:
    - join_id: JOIN_1
      previous_status: candidate_safe
      maximum_allowed_status: review_required
    - join_id: JOIN_2
      previous_status: candidate_safe
      maximum_allowed_status: blocked
    - join_id: JOIN_3
      previous_status: review_required
      maximum_allowed_status: review_required
    - join_id: JOIN_4
      previous_status: candidate_safe
      maximum_allowed_status: review_required
  downstream_rule: Harness composition may weaken these ceilings but must not strengthen beyond them.

boundary_review_note:
  readiness_summary:
    interface_rows:
      blocked: 2
      review_required: 2
      candidate_safe_possible: 0
      source_supported_possible: 1
    harness_joins:
      blocked: 1
      review_required: 3
      candidate_safe_possible: 0
      source_supported_possible: 0
  non_claims:
    - Readiness values are eligibility ceilings, not final harness approvals.
    - Source-supported-possible does not establish a source-supported harness connection.
    - No connection-specific acceptance or verification result is asserted.
    - No upstream sidecar, source packet, quantitative packet, or harness packet mutation is authorized.
    - Missing mating-endpoint evidence is not inferred from labels or prior harness status.
  stop_conditions:
    - Do not promote JOIN_2 while TP5 remains local/internal.
    - Do not promote JOIN_3 without the required timing constraint and mating-endpoint compatibility evidence.
    - Do not promote JOIN_4 without approved PWM semantics, required quantities, and mating-endpoint compatibility evidence.
    - Do not promote JOIN_1 beyond review_required until its mating endpoint is controlled and shown compatible with 5V and 500mA.
  narrow_next_route: Obtain the missing mating-endpoint control records, rerun the narrow source or quantitative owners for GPIO_WAKE and PWM_A, and then repeat the ceiling review.
