```yaml
interface_control_packet:
  workflow_id: interface_control_and_harness_readiness_v0
  project_code: PUBLIC_CAL
  run_id: cal_interface_control_001
  workflow_mode: harness_review
  readiness_semantics: eligibility_ceiling_only
  non_claims:
    - No readiness ceiling is a final harness connection claim.
    - No possible status is final design approval.
    - Upstream artifacts and harness composition remain read-only.
    - Fixture-provided source-status labels are treated only within this synthetic fixture.

interface_control_ledger:
  - interface_control_id: IC-PUBLIC-CAL-001
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.outputs.J1_PIN1
    upstream_container: outputs
    original_label: VBUS_OUT
    source_ref: SRC_VBUS
    source_state_ref: ref_source_alpha_v1
    exposure: external_confirmed
    readiness_ceiling: source_supported_possible
    reason: >-
      Fixture supplies external power-output exposure, compatible direction/domain/kind,
      and source-confirmed 5V and 500mA constraints.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
      - ref_source_alpha_v1
      - ref_quant_alpha_v1
    gaps: []

  - interface_control_id: IC-PUBLIC-CAL-002
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.inputs.J2_PIN3
    upstream_container: inputs
    original_label: GPIO_WAKE
    source_ref: SRC_GPIO
    source_state_ref: ref_source_alpha_v1
    exposure: external_candidate
    readiness_ceiling: review_required
    reason: >-
      Fixture supplies a plausible external digital input, but timing is missing and
      quantitative support is partial.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
      - ref_source_alpha_v1
      - ref_quant_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-001

  - interface_control_id: IC-PUBLIC-CAL-003
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.local_internal_candidates.TP5
    upstream_container: local_internal_candidates
    original_label: TP5_BOOT
    source_ref: SRC_TEST
    source_state_ref: ref_source_alpha_v1
    exposure: local_internal
    external_harness_eligible: false
    readiness_ceiling: blocked
    reason: >-
      Local test/debug candidate is non-external by default and is proposed as an
      external harness endpoint without scoped reclassification evidence.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-002

  - interface_control_id: IC-PUBLIC-CAL-004
    page_asset_id: PAGE_A
    upstream_interface_ref: interfaces.passive_or_none.NC7
    upstream_container: passive_or_none
    original_label: NC7
    source_ref: SRC_NC
    source_state_ref: ref_source_alpha_v1
    exposure: no_connect
    external_harness_eligible: false
    readiness_ceiling: blocked
    reason: No-connect state is outside composition scope.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
    gaps: []

  - interface_control_id: IC-PUBLIC-CAL-005
    page_asset_id: PAGE_B
    upstream_interface_ref: interfaces.outputs.PWM_A
    upstream_container: outputs
    original_label: PWM_A
    source_ref: SRC_PWM
    exposure: unknown
    readiness_ceiling: review_required
    reason: >-
      Role and direction are inferred from label only; official semantic confirmation
      and required quantitative constraints are absent.
    evidence_refs:
      - ref_page_mod_alpha_v1
      - ref_asset_manifest_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-003

harness_readiness_matrix:
  - join_id: JOIN_1
    controlled_endpoint_ids:
      - IC-PUBLIC-CAL-001
    other_endpoint_ref: external_load_vbus
    readiness_ceiling: review_required
    reason: >-
      The controlled VBUS endpoint has a source-supported eligibility ceiling, but
      the fixture provides no controlled identity, exposure, mating compatibility, or
      source support for external_load_vbus. Harness review may not strengthen this join.
    evidence_refs:
      - ref_harness_alpha_v1
      - ref_source_alpha_v1
      - ref_quant_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-004

  - join_id: JOIN_2
    controlled_endpoint_ids:
      - IC-PUBLIC-CAL-003
    other_endpoint_ref: external_debug_header
    readiness_ceiling: blocked
    reason: Local-internal TP5_BOOT is used as an external harness endpoint without reclassification.
    evidence_refs:
      - ref_harness_alpha_v1
      - ref_page_mod_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-002

  - join_id: JOIN_3
    controlled_endpoint_ids:
      - IC-PUBLIC-CAL-002
    other_endpoint_ref: wake_controller
    readiness_ceiling: review_required
    reason: Required timing constraint is missing; GPIO_WAKE has only partial quantitative support.
    evidence_refs:
      - ref_harness_alpha_v1
      - ref_quant_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-001

  - join_id: JOIN_4
    controlled_endpoint_ids:
      - IC-PUBLIC-CAL-005
    other_endpoint_ref: motor_ctrl_pwm
    readiness_ceiling: review_required
    reason: PWM role, direction, semantics, and required quantitative constraints are not source-confirmed.
    evidence_refs:
      - ref_harness_alpha_v1
    gaps:
      - GAP-PUBLIC-CAL-003

blocked_interface_items:
  - item_id: IC-PUBLIC-CAL-003
    item_type: interface
    reason_code: local_internal_misuse
    route: scoped_owner_decision_or_source_backed_reclassification_request
  - item_id: IC-PUBLIC-CAL-004
    item_type: interface
    reason_code: no_connect_non_composition_scope
    route: remove_from_external_harness_consideration
  - item_id: JOIN_2
    item_type: harness_join
    reason_code: local_internal_misuse
    route: scoped_owner_decision_or_source_backed_reclassification_request

review_required_interface_items:
  - item_id: IC-PUBLIC-CAL-002
    item_type: interface
    reason_code: missing_required_timing_constraint
    route: page_quantitative_enrichment_v0
  - item_id: IC-PUBLIC-CAL-005
    item_type: interface
    reason_code: label_only_role_direction_inference
    route: official_source_packet_collect_v0
  - item_id: JOIN_1
    item_type: harness_join
    reason_code: mating_endpoint_not_controlled_or_source_supported
    route: xml_harness_composition_v0
  - item_id: JOIN_3
    item_type: harness_join
    reason_code: missing_required_timing_constraint
    route: page_quantitative_enrichment_v0
  - item_id: JOIN_4
    item_type: harness_join
    reason_code: source_confirmed_pwm_semantics_missing
    route: official_source_packet_collect_v0

candidate_safe_possible_items: []

source_supported_possible_items:
  - item_id: IC-PUBLIC-CAL-001
    item_type: interface
    ceiling_only: true
    reason: Fixture supplies source-confirmed exposure, direction, domain, connection kind, voltage, and current.

compatibility_gap_report:
  - gap_id: GAP-PUBLIC-CAL-001
    affected_items:
      - IC-PUBLIC-CAL-002
      - JOIN_3
    gap_effect: review_required
    missing_evidence: Timing constraint for GPIO_WAKE.
    owning_workflow: page_quantitative_enrichment_v0
    rerun_condition: Source-confirmed or source-derived timing constraint becomes available.

  - gap_id: GAP-PUBLIC-CAL-002
    affected_items:
      - IC-PUBLIC-CAL-003
      - JOIN_2
    gap_effect: blocks_harness
    missing_evidence: Scoped reclassification of TP5_BOOT from local_internal to external eligibility.
    owning_workflow: upstream_owner_or_later_update_workflow
    rerun_condition: >-
      Scoped owner decision or source-backed reclassification records exposure, role,
      direction, and constraints while preserving upstream sidecar authority.

  - gap_id: GAP-PUBLIC-CAL-003
    affected_items:
      - IC-PUBLIC-CAL-005
      - JOIN_4
    gap_effect: review_required
    missing_evidence: Official PWM role, direction, connection semantics, and required quantities.
    owning_workflow: official_source_packet_collect_v0
    rerun_condition: Approved official source packet closes the PWM semantic and quantity gaps.

  - gap_id: GAP-PUBLIC-CAL-004
    affected_items:
      - JOIN_1
    gap_effect: review_required
    missing_evidence: Controlled mating-endpoint identity, exposure, compatibility, and source support for external_load_vbus.
    owning_workflow: xml_harness_composition_v0
    rerun_condition: Harness composition supplies a controlled, compatible mating-endpoint record.

owner_followup_needed:
  - followup_id: OF-PUBLIC-CAL-001
    subject: TP5_BOOT externality
    requested_decision: >-
      Provide scoped reclassification evidence or retain TP5_BOOT as local_internal
      and exclude JOIN_2 from external harness composition.
    affected_items:
      - IC-PUBLIC-CAL-003
      - JOIN_2

interface_open_questions:
  - question_id: OQ-PUBLIC-CAL-001
    question: What source-confirmed timing constraint governs GPIO_WAKE and JOIN_3?
    affected_items:
      - IC-PUBLIC-CAL-002
      - JOIN_3
  - question_id: OQ-PUBLIC-CAL-002
    question: Is TP5_BOOT authorized for external harness exposure under a scoped reclassification?
    affected_items:
      - IC-PUBLIC-CAL-003
      - JOIN_2
  - question_id: OQ-PUBLIC-CAL-003
    question: What approved source confirms PWM_A role, direction, semantics, and quantities?
    affected_items:
      - IC-PUBLIC-CAL-005
      - JOIN_4
  - question_id: OQ-PUBLIC-CAL-004
    question: What controlled evidence establishes external_load_vbus compatibility with VBUS_OUT?
    affected_items:
      - JOIN_1

source_gap_rerun_triggers:
  - trigger_id: RERUN-PUBLIC-CAL-001
    owning_workflow: page_quantitative_enrichment_v0
    trigger: GPIO_WAKE timing constraint is supplied with approved provenance.
  - trigger_id: RERUN-PUBLIC-CAL-002
    owning_workflow: official_source_packet_collect_v0
    trigger: PWM_A official source evidence is supplied.
  - trigger_id: RERUN-PUBLIC-CAL-003
    owning_workflow: upstream_owner_or_later_update_workflow
    trigger: TP5_BOOT scoped reclassification is supplied.
  - trigger_id: RERUN-PUBLIC-CAL-004
    owning_workflow: xml_harness_composition_v0
    trigger: external_load_vbus receives controlled mating-endpoint evidence.

harness_input_delta:
  downstream_workflow: xml_harness_composition_v0
  rule: harness_may_weaken_but_not_strengthen_beyond_interface_control_ceiling
  join_ceiling_caps:
    - join_id: JOIN_1
      maximum_status: review_required
    - join_id: JOIN_2
      maximum_status: blocked
    - join_id: JOIN_3
      maximum_status: review_required
    - join_id: JOIN_4
      maximum_status: review_required
  interface_ceiling_caps:
    - interface_control_id: IC-PUBLIC-CAL-001
      maximum_status: source_supported_possible
    - interface_control_id: IC-PUBLIC-CAL-002
      maximum_status: review_required
    - interface_control_id: IC-PUBLIC-CAL-003
      maximum_status: blocked
    - interface_control_id: IC-PUBLIC-CAL-004
      maximum_status: blocked
    - interface_control_id: IC-PUBLIC-CAL-005
      maximum_status: review_required

boundary_review_note: |
  Readiness values are ceilings only and do not promote any harness join.
  Local-internal TP5_BOOT remains non-external and JOIN_2 remains blocked unless
  scoped reclassification evidence is provided. JOIN_1, JOIN_3, and JOIN_4 remain
  review-required due to identified evidence gaps. No upstream or harness artifact
  authority is replaced by this packet.
```
