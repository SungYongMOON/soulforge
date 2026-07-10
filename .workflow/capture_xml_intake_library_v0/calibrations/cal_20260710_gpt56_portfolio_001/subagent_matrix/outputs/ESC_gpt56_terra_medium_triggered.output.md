asset_identity:
  asset_id: synthetic:SYNTH_USB_CTRL:capture-exp:v1
  source_identity: project_binding.synthetic_exp_xml_source
  source_kind: Cadence_Capture_EXP_xml
  input_scope: whole_export
  version: 1
  design_name: SYNTH_USB_CTRL
  attachment_state: expected_later

block_summary:
  schematics:
    - name: MAIN
      pages:
        - name: PAGE1
          title: USB power and controller
  cache_packages:
    - name: PKG_STM32F030F4P6
    - name: PKG_AP2112K_3V3
    - name: PKG_USB_C_16P
  placed_instances:
    confirmed_identity:
      - refdes: U1
        occurrence_path: /MAIN/PAGE1/U1
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        identity_evidence: package SymbolUserProp
        confidence: high
      - refdes: U2
        occurrence_path: /MAIN/PAGE1/U2
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        identity_evidence: PartInst value plus package SymbolUserProp
        confidence: high
    review_required_or_generic:
      - refdes: J1
        value: USB-C-16P
        occurrence_path: /MAIN/PAGE1/J1
      - refdes: R1
        value: 5.1k
      - refdes: R2
        value: 5.1k
      - refdes: C1
        value: 10uF
      - refdes: TP1
        value: TESTPOINT

extracted_nets:
  confirmed_explicit_nets:
    - name: VBUS
      pins: [J1.A4, J1.B4, U2.IN, U2.EN, TP1.1]
      port_observation:
        name: VBUS_IN
        direction: input
        page: PAGE1
    - name: +3V3
      global_symbol: +3V3
      pins: [U2.OUT, U1.VDD, C1.1]
    - name: GND
      global_symbol: GND
      pins: [J1.A1, J1.B1, U2.GND, U1.VSS, C1.2, R1.2, R2.2]
    - name: USB_CC1
      pins: [J1.CC1, R1.1]
  confirmed_no_connects:
    - pin: U1.PA13
      reason: debug header omitted
      review_visible: true
  unresolved:
    - USB_CC2 must not be inferred from R2 because no explicit USB_CC2 net is present.

connectors:
  review_required:
    - refdes: J1
      value: USB-C-16P
      classification: connector_or_external_interface_candidate
      evidence:
        - reference_designator_prefix
        - component_value
        - explicit VBUS, GND, and USB_CC1 pin observations
      status: review_required
      reason: manufacturer and manufacturer-part-number evidence are absent
  confirmed: []

power_summary:
  confirmed_power_nets:
    - name: VBUS
      evidence: explicit net and VBUS_IN port observation
    - name: +3V3
      evidence: explicit net and +3V3 global symbol
  confirmed_ground_nets:
    - name: GND
      evidence: explicit net and GND global symbol
  enable_or_uvlo_pins:
    - pin: U2.EN
      net: VBUS
      evidence: explicit pin reference
  sense_or_feedback_pins: []
  no_connect_pins:
    - U1.PA13
  candidate_power_nets: []
  candidate_ground_nets: []
  unresolved_power_questions:
    - The excerpt does not establish regulator operating constraints or broader power topology beyond the explicit nets.

open_questions:
  - J1 requires manufacturer and manufacturer-part-number evidence before connector identity can be confirmed.
  - USB_CC2 connectivity is not present in the explicit net records and remains unconfirmed.
  - Generic and utility-part identities for R1, R2, C1, and TP1 require downstream material evidence if needed.
  - Package/cache definitions are library context and do not establish additional placed instances.

pcb_pairing_placeholder:
  state: expected_later
  mdd_attachment: absent_in_fixture
  pairing_status: not_inferred
  follow_on_workflow: asset_patch_attach_mdd_v0
  required_input: synthetic:SYNTH_USB_CTRL:capture-exp:v1

provenance:
  fixture_type: public_safe_synthetic
  calibration_id: synthetic:20260514-135122_staged_cli_matrix
  source_identity: project_binding.synthetic_exp_xml_source
  source_handling: read_only_preserve_source_xml
  input_scope: whole_export
  parser_mode: explicit_net_table
  xml_shape_summary:
    root_element: CISExport
    schema_marker: ExportVersion_17.4
    schematic_count: 1
    page_count: 1
    cache_package_count: 3
    placed_instance_count: 7
    explicit_net_record_count: 4
  source_file_sha256: unavailable_in_synthetic_fixture
  source_mutation_check: not asserted
  raw_xml_embedded: false
  runtime_absolute_paths_embedded: false
  limits:
    - Source-derived observations are limited to the supplied synthetic excerpt.
    - No MDD attachment or true XML/MDD pairing assertion is supplied.

downstream_handoff:
  workflow_id: exp_xml_component_materials
  required_input: project_binding.synthetic_exp_xml_source
  optional_context:
    asset_id: synthetic:SYNTH_USB_CTRL:capture-exp:v1
    placed_component_hints:
      - U1: STM32F030F4P6
      - U2: AP2112K-3.3TRG1
    connector_hint:
      - J1 is review_required as a USB-C connector/interface candidate
    power_hints:
      - VBUS
      - +3V3
      - GND
    open_question_hints:
      - J1 manufacturer and MPN are absent.
      - USB_CC2 is not established.
  boundaries:
    - This handoff does not replace component-material collection.
    - Raw XML, runtime paths, and inferred connectivity are excluded.
