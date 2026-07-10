```yaml
xml_shape_summary:
  calibration_id: 20260514-135122_staged_cli_matrix
  workflow_id: capture_xml_intake_library_v0
  source_binding: project_binding.synthetic_exp_xml_source
  input_scope: bounded_synthetic_excerpt
  completion_scope: page_level_intake_only
  parser_mode: explicit_net_table
  root_element: CISExport
  schema_marker:
    export_version: "17.4"
  design_name: SYNTH_USB_CTRL
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  occurrence_count:
    explicit_occurrence_nodes: 0
    placed_instances_with_occurrence_paths: 7
  explicit_net_record_count: 4
  no_connect_record_count: 1
  missing_whole_export_context:
    - Whole-export completeness cannot be established from the supplied excerpt.
    - Cross-page nets and hierarchy outside MAIN/PAGE1 are unknown.
    - Complete cache/library and occurrence coverage are unknown.
---
asset_identity:
  asset_id: synthetic.capture_xml.SYNTH_USB_CTRL.v1
  asset_type: cadence_capture_exp_xml
  asset_version: 1
  source_binding: project_binding.synthetic_exp_xml_source
  source_role: read_only_baseline
  design_name: SYNTH_USB_CTRL
  export_version: "17.4"
  intake_scope: page_level
  represented_scope:
    schematic: MAIN
    page: PAGE1
  initial_mdd_attachment:
    state: absent
    pairing_status: expected_later
    owner_assertion: none
  non_claims:
    - No true XML/MDD pairing is established.
    - Full-design or full-library registration is not claimed.
---
block_summary:
  scope:
    schematic: MAIN
    page:
      name: PAGE1
      title: USB power and controller
  cache_packages:
    - package: PKG_STM32F030F4P6
      context: library_cache_definition
      properties:
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        pcb_footprint: TSSOP20
    - package: PKG_AP2112K_3V3
      context: library_cache_definition
      properties:
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        pcb_footprint: SOT23-5
    - package: PKG_USB_C_16P
      context: library_cache_definition
      properties:
        pcb_footprint: USB_C_RECEPTACLE
  placed_instances:
    - refdes: U1
      occurrence_path: /MAIN/PAGE1/U1
      package: PKG_STM32F030F4P6
      source_part_value: Value
      identity:
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        pcb_footprint: TSSOP20
        status: recovered
        confidence: high
        evidence: referenced_package_symbol_properties
      caveat: PartInst value is a placeholder.
    - refdes: U2
      occurrence_path: /MAIN/PAGE1/U2
      package: PKG_AP2112K_3V3
      source_part_value: AP2112K-3.3TRG1
      identity:
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        pcb_footprint: SOT23-5
        status: confirmed_from_component_evidence
        confidence: high
        evidence:
          - direct_part_instance_value
          - referenced_package_symbol_properties
    - refdes: J1
      occurrence_path: /MAIN/PAGE1/J1
      package: PKG_USB_C_16P
      source_part_value: USB-C-16P
      identity:
        component_class: connector_candidate
        pcb_footprint: USB_C_RECEPTACLE
        status: review_required
        confidence: medium
        missing_evidence:
          - manufacturer
          - manufacturer_part_number
    - refdes: R1
      occurrence_path: /MAIN/PAGE1/R1
      package: "0603"
      source_part_value: 5.1k
      identity:
        component_class: generic_resistor
        status: generic_not_confirmed
    - refdes: R2
      occurrence_path: /MAIN/PAGE1/R2
      package: "0603"
      source_part_value: 5.1k
      identity:
        component_class: generic_resistor
        status: generic_not_confirmed
    - refdes: C1
      occurrence_path: /MAIN/PAGE1/C1
      package: "0603"
      source_part_value: 10uF
      identity:
        component_class: generic_capacitor
        status: generic_not_confirmed
    - refdes: TP1
      occurrence_path: /MAIN/PAGE1/TP1
      package: TP
      source_part_value: TESTPOINT
      identity:
        component_class: utility_testpoint
        status: generic_not_confirmed
  port_instances:
    - name: VBUS_IN
      net: VBUS
      direction: input
      page: PAGE1
      status: explicit
  limitations:
    - Symbol-pin definitions are not present in the supplied excerpt.
    - Package definitions are library context and are not counted as placements.
---
extracted_nets:
  confirmed:
    - name: VBUS
      evidence: explicit_net_record
      port_observations:
        - port: VBUS_IN
          direction: input
          status: explicit
      pin_links:
        - {refdes: J1, pin: A4}
        - {refdes: J1, pin: B4}
        - {refdes: U2, pin: IN}
        - {refdes: U2, pin: EN}
        - {refdes: TP1, pin: "1"}
    - name: +3V3
      evidence:
        - explicit_net_record
        - explicit_global_record
      pin_links:
        - {refdes: U2, pin: OUT}
        - {refdes: U1, pin: VDD}
        - {refdes: C1, pin: "1"}
    - name: GND
      evidence:
        - explicit_net_record
        - explicit_global_record
      pin_links:
        - {refdes: J1, pin: A1}
        - {refdes: J1, pin: B1}
        - {refdes: U2, pin: GND}
        - {refdes: U1, pin: VSS}
        - {refdes: C1, pin: "2"}
        - {refdes: R1, pin: "2"}
        - {refdes: R2, pin: "2"}
    - name: USB_CC1
      evidence: explicit_net_record
      pin_links:
        - {refdes: J1, pin: CC1}
        - {refdes: R1, pin: "1"}
  no_connect_observations:
    - refdes: U1
      pin: PA13
      reason: debug header omitted
      evidence: explicit_no_connect_record
      status: confirmed_observation
  review_required:
    - No USB_CC2 net or R2 pin-1 connection is present; none is inferred.
    - Connectivity beyond the four explicit net records is unknown.
    - Cross-page connectivity cannot be assessed from the bounded excerpt.
---
connectors:
  confirmed: []
  candidates:
    - refdes: J1
      candidate_type: USB-C receptacle
      status: review_required
      evidence:
        - reference_designator_prefix_J
        - part_value_USB-C-16P
        - package_footprint_USB_C_RECEPTACLE
        - explicit VBUS, GND, and USB_CC1 pin links
      observed_interface_pins:
        - {pin: A4, net: VBUS}
        - {pin: B4, net: VBUS}
        - {pin: A1, net: GND}
        - {pin: B1, net: GND}
        - {pin: CC1, net: USB_CC1}
      missing_confirmation:
        - manufacturer
        - manufacturer_part_number
        - complete connector pinout
        - explicit CC2 connectivity
  unresolved:
    - J1 cannot be promoted to a confirmed component identity without stronger component evidence.
---
power_summary:
  confirmed_power_nets:
    - name: VBUS
      evidence: explicit_net_record
      observations:
        - J1 A4 and B4 connect to VBUS.
        - U2 IN and EN connect to VBUS.
        - TP1 pin 1 connects to VBUS.
    - name: +3V3
      evidence:
        - explicit_net_record
        - explicit_global_record
      observations:
        - U2 OUT connects to +3V3.
        - U1 VDD and C1 pin 1 connect to +3V3.
  candidate_power_nets: []
  confirmed_ground_nets:
    - name: GND
      evidence:
        - explicit_net_record
        - explicit_global_record
  candidate_ground_nets: []
  enable_or_uvlo_pins:
    - refdes: U2
      pin: EN
      net: VBUS
      status: explicit
  sense_or_feedback_pins: []
  no_connect_pins:
    - refdes: U1
      pin: PA13
      reason: debug header omitted
      status: explicit
  unresolved_power_questions:
    - Regulator behavior and electrical suitability are not established by connectivity alone.
    - Input/output capacitor completeness and requirements cannot be determined from the excerpt.
    - No electrical-rule, voltage-rating, or current-capability conclusions are made.
---
open_questions:
  - id: OQ-001
    subject: input_scope
    status: review_required
    question: Is the supplied excerpt the complete Capture export or only a bounded page representation?
    impact: Full-design, hierarchy, cache, occurrence, and cross-page coverage remain unconfirmed.
  - id: OQ-002
    subject: J1_component_identity
    status: review_required
    question: What owner-approved manufacturer and part number identify J1?
  - id: OQ-003
    subject: USB_CC2
    status: review_required
    question: Is an explicit CC2 net and R2 pin-1 connection present outside the supplied excerpt?
    constraint: Do not infer that connection from names or component values.
  - id: OQ-004
    subject: generic_component_identity
    status: review_required
    question: Are owner-approved identities required for R1, R2, C1, and TP1?
  - id: OQ-005
    subject: U1_PA13_no_connect
    status: review_required
    question: Is the explicit PA13 no-connect disposition intentional for downstream review?
  - id: OQ-006
    subject: initial_mdd
    status: open
    question: Will an owner-supplied MDD attachment be provided through asset_patch_attach_mdd_v0?
---
pcb_pairing_placeholder:
  asset_id: synthetic.capture_xml.SYNTH_USB_CTRL.v1
  state: expected_later
  mdd_attachment_present: false
  pairing_status: unestablished
  owner_assertion: none
  follow_on_workflow:
    workflow_id: asset_patch_attach_mdd_v0
    expected_input: asset_identity
    optional_context_packet: pcb_pairing_placeholder
  constraints:
    - A later attachment must be recorded as owner-supplied.
    - True XML/MDD pairing must not be inferred beyond an owner assertion.
---
provenance:
  calibration_id: 20260514-135122_staged_cli_matrix
  fixture_type: public_safe_synthetic
  workflow_id: capture_xml_intake_library_v0
  source_file_identity: project_binding.synthetic_exp_xml_source
  source_file_sha256:
    value: unknown
    status: not_provided
  input_scope: bounded_synthetic_excerpt
  parser_mode: explicit_net_table
  created_at:
    value: unknown
    status: not_runtime_recorded
  tool_version_or_script_identity:
    value: none_claimed
    status: not_applicable_to_fixture_deliverable
  source_mutation_check:
    required_policy: read_only_preserve_source_xml
    result: not_assessed
  source_content_embedded: false
  runtime_absolute_paths_embedded: false
  page_fragment_caveats:
    - Results cover only MAIN/PAGE1 facts represented by the supplied excerpt.
    - Full-library, full-design, cross-page, and hierarchy completeness are not claimed.
  boundaries:
    - Package metadata is treated as cache/library context.
    - PartInst records are treated as placed instances.
    - Confirmed observations, candidates, and unresolved questions remain separate.
    - No MDD pairing, runtime state, private project state, or source immutability verification is claimed.
---
downstream_handoff:
  target_workflow:
    workflow_id: exp_xml_component_materials
    expected_input:
      exp_xml_source: project_binding.synthetic_exp_xml_source
  source_scope: bounded_synthetic_excerpt
  asset_context:
    asset_id: synthetic.capture_xml.SYNTH_USB_CTRL.v1
    asset_version: 1
  placed_component_hints:
    confirmed_or_recovered:
      - {refdes: U1, manufacturer: STMicroelectronics, manufacturer_part_number: STM32F030F4P6}
      - {refdes: U2, manufacturer: Diodes Incorporated, manufacturer_part_number: AP2112K-3.3TRG1}
    review_required:
      - J1
      - R1
      - R2
      - C1
      - TP1
  connector_hints:
    - refdes: J1
      classification: USB-C receptacle candidate
      status: review_required
  power_hints:
    confirmed_nets:
      - VBUS
      - +3V3
      - GND
    explicit_enable_link:
      refdes: U2
      pin: EN
      net: VBUS
  open_question_ids:
    - OQ-001
    - OQ-002
    - OQ-003
    - OQ-004
    - OQ-005
    - OQ-006
  restrictions:
    - Preserve the original source binding as the required downstream input.
    - Do not treat compact hints as substitutes for source inspection.
    - Do not infer USB_CC2, complete connector pinout, or full-design coverage.
    - Do not embed raw XML or runtime absolute paths.
---
readiness_note:
  workflow_id: capture_xml_intake_library_v0
  disposition: conditional_handoff_ready
  ready_for:
    - bounded downstream component-material review using project_binding.synthetic_exp_xml_source
    - later owner-supplied MDD attachment through asset_patch_attach_mdd_v0
  established:
    - XML-first synthetic asset identity is defined.
    - The absent-MDD placeholder state is explicit.
    - Confirmed connectivity is separated from candidates and open questions.
    - The downstream workflow and required source binding are identified.
    - The packet contains summarized facts rather than raw XML.
  not_established:
    - Source-file hash
    - Source immutability verification
    - Full-export completeness
    - Full-library or full-design completion
    - J1 manufacturer or part number
    - USB_CC2 connectivity
    - XML/MDD pairing
    - Runtime file creation or validator results
  stop_conditions:
    - Stop rather than claim full-design completion unless whole-export scope is established.
    - Stop rather than confirm J1 identity without component evidence.
    - Stop rather than infer USB_CC2 or R2 pin-1 connectivity.
    - Stop rather than claim MDD pairing without an owner-supplied attachment assertion.
    - Stop downstream promotion if the required original EXP.xml source binding is unavailable.
```
