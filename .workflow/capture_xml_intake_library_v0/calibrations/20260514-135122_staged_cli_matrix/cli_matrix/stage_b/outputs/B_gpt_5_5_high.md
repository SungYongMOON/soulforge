```yaml
profile_metadata:
  calibration_id: 20260514-135122_staged_cli_matrix
  workflow_id: capture_xml_intake_library_v0
  model: gpt-5.5
  reasoning_effort: high
  species: elf
  class: administrator
  fixture_type: public_safe_synthetic

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
      role: controller
      manufacturer: STMicroelectronics
      mpn: STM32F030F4P6
      footprint: TSSOP20
      evidence: recovered_from_referenced_package
      confidence: high
    - refdes: U2
      role: 3v3_regulator
      manufacturer: Diodes Incorporated
      mpn: AP2112K-3.3TRG1
      footprint: SOT23-5
      evidence: direct_partinst_value_plus_package_props
  candidate:
    - refdes: J1
      role: usb_c_receptacle
      value: USB-C-16P
      footprint: USB_C_RECEPTACLE
      evidence: placed_instance_plus_package_footprint
  review_required:
    - refdes: J1
      issue: connector lacks manufacturer and MPN evidence
    - refdes: R1
      value: 5.1k
      note: generic resistor, not promoted to confirmed identity
    - refdes: R2
      value: 5.1k
      note: generic resistor; pin 1 has no explicit captured net
    - refdes: C1
      value: 10uF
      note: generic capacitor, not promoted to confirmed identity
    - refdes: TP1
      value: TESTPOINT
      note: utility part, not promoted to confirmed identity
    - refdes: U1
      pin: PA13
      observation: explicit no_connect
      reason: debug header omitted

extracted_nets:
  confirmed_explicit:
    - name: VBUS
      pins:
        - J1.A4
        - J1.B4
        - U2.IN
        - U2.EN
        - TP1.1
      source: explicit_net_record
    - name: +3V3
      global: true
      pins:
        - U2.OUT
        - U1.VDD
        - C1.1
      source: explicit_net_record
    - name: GND
      global: true
      pins:
        - J1.A1
        - J1.B1
        - U2.GND
        - U1.VSS
        - C1.2
        - R1.2
        - R2.2
      source: explicit_net_record
    - name: USB_CC1
      pins:
        - J1.CC1
        - R1.1
      source: explicit_net_record
  review_visible_no_connects:
    - U1.PA13: debug header omitted
  not_inferred:
    - USB_CC2: absent; do not infer from R2

connectors:
  candidates:
    - refdes: J1
      interface: USB-C
      value: USB-C-16P
      footprint: USB_C_RECEPTACLE
      connected_pins:
        VBUS: [A4, B4]
        GND: [A1, B1]
        USB_CC1: [CC1]
      status: review_required
      reason: no manufacturer or MPN evidence

power_summary:
  inputs:
    - net: VBUS
      entry_points: [J1.A4, J1.B4, VBUS_IN]
      loads_or_links: [U2.IN, U2.EN, TP1.1]
  regulated_outputs:
    - net: +3V3
      source: U2.OUT
      consumers: [U1.VDD, C1.1]
  returns:
    - net: GND
      global: true
      connected_refs: [J1, U2, U1, C1, R1, R2]

open_questions:
  - Confirm J1 manufacturer and exact MPN.
  - Confirm whether R2 pin 1 should connect to a missing USB_CC2 net; no explicit net record is present.
  - Confirm whether U1 PA13 no-connect is intentional for downstream design checks.
  - Confirm generic passives/testpoint library identities only if BOM-grade output is required.

provenance:
  source_identity: project_binding.synthetic_exp_xml_source
  source_policy: read_only_preserve_source_xml
  archive_policy: do_not_store_raw_real_xml_or_runtime_absolute_paths
  evidence_boundary: fixture_only_public_safe_synthetic
  raw_xml_embedded: false
  private_project_material_used: false
  command_or_file_actions_claimed: false

downstream_handoff:
  target: exp_xml_component_materials
  required_input: project_binding.synthetic_exp_xml_source
  compact_hints:
    placed_refs: [U1, U2, J1, R1, R2, C1, TP1]
    confirmed_components: [U1, U2]
    connector_candidates: [J1]
    power_nets: [VBUS, +3V3, GND]
    signal_nets: [USB_CC1]
    review_items: [J1_identity, missing_USB_CC2_or_R2_pin1, U1_PA13_no_connect]

readiness_note:
  status: ready_for_downstream_intake
  caveat: output is fixture-derived only; no source mutation, path disclosure, raw XML archival, or inferred net expansion is included
```