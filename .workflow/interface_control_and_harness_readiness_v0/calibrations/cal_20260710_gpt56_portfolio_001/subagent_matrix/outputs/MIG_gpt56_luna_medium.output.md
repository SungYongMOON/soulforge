```yaml
interface_control_packet:
  workflow_id: interface_control_and_harness_readiness_v0
  project_code: PUBLIC_CAL
  run_id: cal_interface_control_001
  workflow_mode: harness_review
  status: readiness_ceiling_only
  input_refs:
    - ref_page_mod_alpha_v1
    - ref_asset_manifest_alpha_v1
    - ref_source_alpha_v1
    - ref_quant_alpha_v1
    - ref_harness_alpha_v1
  upstream_artifacts_read_only: true
  harness_packet_mutated: false

interface_control_ledger:
  - interface_control_id: IC-001
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.outputs.J1_PIN1
    upstream_container: outputs
    original_label: VBUS_OUT
    source_ref: SRC_VBUS
    owner_scope_ref: ref_page_mod_alpha_v1
    exposure: external_confirmed
    direction: output
    domain: power
    connection_kind: wire_to_wire
    quantitative_constraints:
      voltage: 5V
      current: 500mA
      status: source_confirmed
    readiness_ceiling: source_supported_possible
    evidence_refs:
      - ref_source_alpha_v1
      - ref_quant_alpha_v1

  - interface_control_id: IC-002
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.inputs.J2_PIN3
    upstream_container: inputs
    original_label: GPIO_WAKE
    source_ref: SRC_GPIO
    owner_scope_ref: ref_page_mod_alpha_v1
    exposure: external_candidate
    direction: input
    domain: digital
    connection_kind: signal_wire
    quantitative_constraints:
      logic_level: 3.3V
      timing: missing
      status: partial
    readiness_ceiling: review_required
    evidence_refs:
      - ref_source_alpha_v1
      - ref_quant_alpha_v1
    gaps:
      - missing_timing_constraint

  - interface_control_id: IC-003
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.local_internal_candidates.TP5
    upstream_container: local_internal_candidates
    original_label: TP5_BOOT
    source_ref: SRC_TEST
    owner_scope_ref: ref_page_mod_alpha_v1
    exposure: local_internal
    direction: unknown
    domain: digital
    connection_kind: test_point
    readiness_ceiling: blocked
    block_reasons:
      - local_internal_misuse
      - role_and_direction_unresolved
    evidence_refs:
      - ref_page_mod_alpha_v1

  - interface_control_id: IC-004
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.passive_or_none.NC7
    upstream_container: passive_or_none
    original_label: NC7
    source_ref: SRC_NC
    owner_scope_ref: ref_page_mod_alpha_v1
    exposure: no_connect
    direction: not_applicable
    domain: not_applicable
    connection_kind: no_connect
    readiness_ceiling: blocked
    block_reasons:
      - no_connect_scope
    evidence_refs:
      - ref_page_mod_alpha_v1

  - interface_control_id: IC-005
    page_asset_id: PAGE_B
    upstream_interface_ref: interfaces.outputs.PWM_A
    upstream_container: outputs
    original_label: PWM_A
    source_ref: SRC_PWM
    owner_scope_ref: ref_page_mod_alpha_v1
    exposure: unknown
    direction: unknown
    domain: unknown
    connection_kind: unknown
    readiness_ceiling: blocked
    block_reasons:
      - role_and_direction_inferred_from_label_only
      - missing_official_source_confirmation
      - missing_quantitative_constraints
    evidence_refs:
      - ref_page_mod_alpha_v1

harness_readiness_matrix:
  - join_id: JOIN_1
    endpoint_interface_control_ids:
      - IC-001
    endpoints:
      - J1_PIN1
      - external_load_vbus
    previous_harness_status: candidate_safe
    readiness_ceiling: candidate_safe_possible
    reason: source-backed interface semantics and 5V/500mA requirements are present; mating-side evidence is not source-confirmed.
    required_followup:
      - downstream_harness_connection_specific_review

  - join_id: JOIN_2
    endpoint_interface_control_ids:
      - IC-003
    endpoints:
      - TP5
      - external_debug_header
    previous_harness_status: candidate_safe
    readiness_ceiling: blocked
    reason: TP5 is local_internal by default and is not externally eligible.
    block_reasons:
      - local_internal_misuse
      - no_approved_reclassification_evidence

  - join_id: JOIN_3
    endpoint_interface_control_ids:
      - IC-002
    endpoints:
      - GPIO_WAKE
      - wake_controller
    previous_harness_status: review_required
    readiness_ceiling: review_required
    reason: external candidate interface is plausible, but timing support is missing and the mating side is not established.
    gaps:
      - missing_timing_constraint
      - mating_side_source_support_missing

  - join_id: JOIN_4
    endpoint_interface_control_ids:
      - IC-005
    endpoints:
      - PWM_A
      - motor_ctrl_pwm
    previous_harness_status: candidate_safe
    readiness_ceiling: blocked
    reason: PWM semantics, role, direction, and required quantities are not source-confirmed.
    block_reasons:
      - source_confirmed_pwm_semantics_missing
      - role_and_direction_unresolved
      - quantitative_constraints_missing

blocked_interface_items:
  - item_id: IC-003
    related_join_ids:
      - JOIN_2
    reason: local_internal_candidate used as an external harness endpoint.
    route: owner_decision_or_scoped_reclassification_request
  - item_id: IC-004
    related_join_ids: []
    reason: no-connect item is outside composition scope.
    route: no_harness_action
  - item_id: IC-005
    related_join_ids:
      - JOIN_4
    reason: required source, role, direction, and quantitative evidence are missing.
    route: official_source_packet_collect_v0_then_interface_control_rerun

review_required_interface_items:
  - item_id: IC-002
    related_join_ids:
      - JOIN_3
    reason: plausible external digital input with incomplete timing and mating-side support.
    route: quantitative_enrichment_and_source_gap_followup

candidate_safe_possible_items:
  - item_id: IC-001
    related_join_ids:
      - JOIN_1
    ceiling_only: true
    reason: controlled external power interface with compatible source-confirmed local constraints.
  - item_id: JOIN_1
    ceiling_only: true
    reason: local endpoint is eligible and required 5V/500mA constraints are available; downstream mating-side review remains required.

source_supported_possible_items:
  - item_id: IC-001
    ceiling_only: true
    reason: exposure, direction, domain, connection kind, and local quantitative constraints are source-supported.
    limitation: this is not source-supported status for JOIN_1 or the final harness.

compatibility_gap_report:
  gaps:
    - gap_id: GAP-001
      affected_items:
        - IC-002
        - JOIN_3
      category: quantitative
      detail: GPIO_WAKE timing constraint is missing.
      effect: blocks_source_supported_possible
      owning_workflow: page_quantitative_enrichment_v0

    - gap_id: GAP-002
      affected_items:
        - IC-002
        - JOIN_3
      category: source_or_mating_side
      detail: wake_controller mating-side compatibility is not established.
      effect: review_required
      owning_workflow: official_source_packet_collect_v0

    - gap_id: GAP-003
      affected_items:
        - IC-003
        - JOIN_2
      category: boundary
      detail: local_internal TP5_BOOT has no approved external reclassification.
      effect: blocks_harness
      owning_workflow: owner_decision

    - gap_id: GAP-004
      affected_items:
        - IC-005
        - JOIN_4
      category: source_and_quantity
      detail: PWM semantics, direction, and quantitative constraints are unavailable.
      effect: blocks_harness_and_source_supported_possible
      owning_workflow: official_source_packet_collect_v0

owner_followup_needed:
  - followup_id: OF-001
    affected_items:
      - IC-003
      - JOIN_2
    request: Decide whether TP5_BOOT may be reclassified for a scoped external debug connection.
    required_evidence:
      - scoped_owner_decision
      - interface_exposure
      - role
      - direction
      - constraints

  - followup_id: OF-002
    affected_items:
      - IC-002
      - JOIN_3
    request: Provide timing and mating-side compatibility evidence for GPIO_WAKE.

  - followup_id: OF-003
    affected_items:
      - IC-005
      - JOIN_4
    request: Provide official or scoped-approved evidence for PWM_A semantics, direction, and required quantities.

interface_open_questions:
  - question_id: Q-001
    affected_items:
      - IC-002
      - JOIN_3
    question: What timing constraint governs GPIO_WAKE?
  - question_id: Q-002
    affected_items:
      - IC-003
      - JOIN_2
    question: Is TP5_BOOT intentionally intended for external debug composition?
  - question_id: Q-003
    affected_items:
      - IC-005
      - JOIN_4
    question: What source confirms PWM_A role, direction, domain, and electrical constraints?

source_gap_rerun_triggers:
  - trigger_id: RERUN-001
    when: GPIO_WAKE timing or mating-side source evidence is added.
    rerun: interface_control_and_harness_readiness_v0
    scope:
      - IC-002
      - JOIN_3
  - trigger_id: RERUN-002
    when: TP5_BOOT receives approved reclassification evidence.
    rerun: interface_control_and_harness_readiness_v0
    scope:
      - IC-003
      - JOIN_2
  - trigger_id: RERUN-003
    when: PWM_A source and quantitative evidence is added.
    rerun: interface_control_and_harness_readiness_v0
    scope:
      - IC-005
      - JOIN_4

harness_input_delta:
  downstream_workflow: xml_harness_composition_v0
  rule: harness_may_weaken_but_not_strengthen_interface_control_ceilings
  allowed_candidate_scope:
    - JOIN_1
    - JOIN_3
  blocked_scope:
    - JOIN_2
    - JOIN_4
  excluded_scope:
    - IC-004
  required_downstream_checks:
    - connection_specific_endpoint_review
    - mating_side_compatibility_review
    - quantitative_constraint_review
    - preservation_of_local_internal_boundary
  final_harness_promotion_authority: downstream_workflow_only

boundary_review_note: |
  This packet records interface-control readiness ceilings for the supplied
  synthetic fixture. It does not approve final harness connections, promote
  candidate states, acquire sources, mutate upstream artifacts, mutate the
  harness packet, synthesize circuitry, generate XML or netlists, or accept
  verification results.

  local_internal_candidates remain non-external by default. TP5_BOOT is blocked
  for external harness use until scoped reclassification evidence exists.

  candidate_safe_possible and source_supported_possible are eligibility ceilings
  only. JOIN_1 remains subject to downstream mating-side and
  connection-specific review. No owner decision is treated as a replacement for
  source fact.
```
