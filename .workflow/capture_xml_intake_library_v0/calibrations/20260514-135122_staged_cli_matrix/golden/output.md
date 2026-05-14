```yaml
profile_metadata:
  calibration_id: 20260514-135122_staged_cli_matrix
  workflow_id: capture_xml_intake_library_v0
  model: gpt-5.5
  reasoning_effort: xhigh
  species: darkelf
  class: archivist
  fixture_type: public_safe_synthetic
  execution_boundary: synthetic_fixture_only_no_file_or_network_actions

xml_shape_summary:
  root_element: CISExport
  design_name: SYNTH_USB_CTRL
  export_version: "17.4"
  schematics: 1
  pages: 1
  cache_packages: 3
  placed_instances: 7
  explicit_net_records: 4
  parser_mode: explicit_net_table

block_summary:
  confirmed:
    - refdes: U1
      role: microcontroller
      identity: STM32F030F4P6
      manufacturer: STMicroelectronics
      footprint: TSSOP20
      evidence: recovered_from_referenced_package_due_placeholder_partvalue
      confidence: high
    - refdes: U2
      role: 3v3_regulator
      identity: AP2112K-3.3TRG1
      manufacturer: Diodes Incorporated
      footprint: SOT23-5
      evidence: direct_partinst_value_plus_package_properties
  candidate:
    - refdes: J1
      role: usb_c_receptacle
      value: USB-C-16P
      footprint: USB_C_RECEPTACLE
      status: review_required_missing_manufacturer_mpn
  generic_utility:
    - R1: 5.1k_0603
    - R2: 5.1k_0603
    - C1: 10uF_0603
    - TP1: TESTPOINT_TP
  no_connect:
    - refdes: U1
      pin: PA13
      reason: debug_header_omitted
      status: review_visible

extracted_nets:
  confirmed_explicit:
    - name: VBUS
      pins: [J1.A4, J1.B4, U2.IN, U2.EN, TP1.1]
    - name: "+3V3"
      global: true
      pins: [U2.OUT, U1.VDD, C1.1]
    - name: GND
      global: true
      pins: [J1.A1, J1.B1, U2.GND, U1.VSS, C1.2, R1.2, R2.2]
    - name: USB_CC1
      pins: [J1.CC1, R1.1]
  not_inferred:
    - USB_CC2 not created; R2 pin 1 has no explicit net evidence.

connectors:
  review_required:
    - refdes: J1
      type: usb_c_receptacle_candidate
      package: PKG_USB_C_16P
      footprint: USB_C_RECEPTACLE
      confirmed_pins_seen: [A4, B4, A1, B1, CC1]
      missing_evidence: [manufacturer, manufacturer_part_number, explicit_CC2_net]

power_summary:
  inputs:
    - net: VBUS
      source_hint: VBUS_IN_port
      loads: [U2.IN, U2.EN]
      observability: TP1.1
  rails:
    - net: "+3V3"
      source_hint: U2.OUT
      loads: [U1.VDD, C1.1]
      global: true
    - net: GND
      global: true
      returns: [J1.A1, J1.B1, U2.GND, U1.VSS, C1.2, R1.2, R2.2]

open_questions:
  - J1 connector identity requires manufacturer and MPN confirmation.
  - R2 pin 1 is unrepresented in explicit net records; do not assume USB_CC2.
  - Confirm whether U1 PA13 no-connect is intentional for production/debug policy.
  - Confirm C1 placement/function if downstream BOM or ERC classification needs regulator input/output capacitor intent.

provenance:
  source_binding: project_binding.synthetic_exp_xml_source
  source_policy: read_only_preserve_source_xml
  archive_policy: do_not_store_raw_real_xml_or_runtime_absolute_paths
  evidence_basis: provided_public_safe_synthetic_excerpt
  raw_xml_embedded: false
  private_project_data_used: false

downstream_handoff:
  target_workflow: exp_xml_component_materials
  required_input_identity: project_binding.synthetic_exp_xml_source
  hints:
    placed_components: [U1, U2, J1, R1, R2, C1, TP1]
    confirmed_identities: [U1, U2]
    connector_review_items: [J1]
    power_nets: [VBUS, "+3V3", GND]
    review_visible_no_connects: [U1.PA13]
    open_questions_ref: open_questions
  exclusions: [raw_xml, runtime_absolute_paths, private_state]

readiness_note:
  status: ready_for_downstream_synthetic_handoff
  rationale: Explicit net records and placed instances are sufficient for compact intake artifacts; connector identity and absent CC2 evidence remain review-required.
```