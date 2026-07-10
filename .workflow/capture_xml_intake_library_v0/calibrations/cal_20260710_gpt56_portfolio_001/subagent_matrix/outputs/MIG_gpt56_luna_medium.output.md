```yaml
workflow_id: capture_xml_intake_library_v0
calibration_id: 20260514-135122_staged_cli_matrix
fixture_type: public_safe_synthetic
status: complete_for_synthetic_fixture
input_scope: page_fragment
scope_note: bounded synthetic PAGE1 intake; not full-library or full-design completion

xml_shape_summary:
  source_identity: project_binding.synthetic_exp_xml_source
  parser_mode: explicit_net_table
  root_element: CISExport
  schema_marker:
    export_version: "17.4"
    design_name: SYNTH_USB_CTRL
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  occurrence_count: 7
  explicit_net_record_count: 4
  page_fragment_caveats:
    - whole-export hierarchy is not independently established
    - cache/library coverage beyond the supplied bounded input is unknown
    - cross-page nets and omitted pages are not assessed

asset_identity:
  asset_set_id: synthetic.capture_xml_intake.SYNTH_USB_CTRL
  source_asset_id: project_binding.synthetic_exp_xml_source
  asset_version: 1
  source_kind: Cadence Capture EXP.xml
  design_name: SYNTH_USB_CTRL
  attachment_state:
    initial_mdd:
      present: false
      mode: absent
    later_attachment:
      state: expected_later
      workflow_id: asset_patch_attach_mdd_v0
  pairing_claim:
    state: not_established
    note: no MDD was supplied; no XML/MDD pairing is inferred

block_summary:
  confirmed:
    schematics:
      - name: MAIN
        pages:
          - name: PAGE1
            title: USB power and controller
    placed_instances:
      - refdes: U1
        occurrence_path: /MAIN/PAGE1/U1
        component_identity:
          value: STM32F030F4P6
          manufacturer: STMicroelectronics
          mpn: STM32F030F4P6
          confidence: high
          evidence: referenced package properties; PartInst value was placeholder
        package_context: PKG_STM32F030F4P6
      - refdes: U2
        occurrence_path: /MAIN/PAGE1/U2
        component_identity:
          value: AP2112K-3.3TRG1
          manufacturer: Diodes Incorporated
          mpn: AP2112K-3.3TRG1
          confidence: high
          evidence: direct PartInst value and referenced package properties
        package_context: PKG_AP2112K_3V3
      - refdes: J1
        occurrence_path: /MAIN/PAGE1/J1
        component_identity:
          value: USB-C-16P
          confidence: limited
          evidence: direct PartInst value
        package_context: PKG_USB_C_16P
      - refdes: R1
        occurrence_path: /MAIN/PAGE1/R1
        value: 5.1k
        package_context: 0603
      - refdes: R2
        occurrence_path: /MAIN/PAGE1/R2
        value: 5.1k
        package_context: 0603
      - refdes: C1
        occurrence_path: /MAIN/PAGE1/C1
        value: 10uF
        package_context: 0603
      - refdes: TP1
        occurrence_path: /MAIN/PAGE1/TP1
        value: TESTPOINT
        package_context: TP
  review_required:
    - generic or utility parts lack confirmed manufacturer/MPN identity
    - page-fragment scope does not establish complete design hierarchy or library coverage

extracted_nets:
  extraction_mode: explicit_net_table
  confirmed:
    - name: VBUS
      pins:
        - refdes: J1
          pin: A4
        - refdes: J1
          pin: B4
        - refdes: U2
          pin: IN
        - refdes: U2
          pin: EN
        - refdes: TP1
          pin: "1"
    - name: +3V3
      global: true
      pins:
        - refdes: U2
          pin: OUT
        - refdes: U1
          pin: VDD
        - refdes: C1
          pin: "1"
    - name: GND
      global: true
      pins:
        - refdes: J1
          pin: A1
        - refdes: J1
          pin: B1
        - refdes: U2
          pin: GND
        - refdes: U1
          pin: VSS
        - refdes: C1
          pin: "2"
        - refdes: R1
          pin: "2"
        - refdes: R2
          pin: "2"
    - name: USB_CC1
      pins:
        - refdes: J1
          pin: CC1
        - refdes: R1
          pin: "1"
  observations:
    ports:
      - name: VBUS_IN
        net: VBUS
        direction: input
        page: PAGE1
    no_connects:
      - refdes: U1
        pin: PA13
        status: review_visible
        reason: debug header omitted
  non_claims:
    - USB_CC2 is not established
    - R2 is not assigned to USB_CC2
    - no connectivity is inferred from pin or component names alone

connectors:
  confirmed: []
  candidates:
    - refdes: J1
      interface_class: USB-C receptacle
      value: USB-C-16P
      evidence:
        - reference_designator: J1
        - component_value: USB-C-16P
        - symbol_or_package_context: PKG_USB_C_16P
      status: review_required
      missing_evidence:
        - manufacturer
        - manufacturer_part_number
  review_required:
    - connector confirmation requires stronger component evidence

power_summary:
  confirmed_power_nets:
    - VBUS
    - +3V3
  candidate_power_nets: []
  confirmed_ground_nets:
    - GND
  candidate_ground_nets: []
  enable_or_uvlo_pins:
    - refdes: U2
      pin: EN
      net: VBUS
      evidence: explicit_net_record
  sense_or_feedback_pins: []
  no_connect_pins:
    - refdes: U1
      pin: PA13
      reason: debug header omitted
  unresolved_power_questions:
    - VBUS is explicitly connected to U2 EN; intended enable behavior is not inferred
    - regulator operating conditions and design intent are outside this intake packet

open_questions:
  - source scope is bounded PAGE1/page-fragment input; full-export completeness is unknown
  - cross-page connectivity cannot be assessed from the supplied scope
  - J1 manufacturer and manufacturer part number remain unresolved
  - generic parts R1, R2, C1, and TP1 do not have confirmed component identity
  - USB_CC2 connectivity is not present in the explicit net records
  - initial MDD attachment was not supplied
  - source SHA-256 is not asserted by this synthetic deliverable
  - runtime tool version and execution timestamp are not asserted

pcb_pairing_placeholder:
  state: expected_later
  xml_asset_id: project_binding.synthetic_exp_xml_source
  mdd_asset_id: null
  pairing_state: not_established
  patch_workflow_id: asset_patch_attach_mdd_v0

provenance:
  source_file_identity: project_binding.synthetic_exp_xml_source
  source_file_sha256: not_asserted
  source_mutation_check: required_by_contract; no mutation claim made
  input_scope: page_fragment
  parser_mode: explicit_net_table
  created_at: not_asserted
  tool_version_or_script_identity: not_asserted
  source_policy: read_only_preserve_source_xml
  raw_xml_included: false
  runtime_absolute_paths_included: false
  page_fragment_caveats:
    - bounded synthetic input covers MAIN/PAGE1 observations only
    - full-library and full-design coverage are not claimed

downstream_handoff:
  workflow_id: exp_xml_component_materials
  expected_input:
    exp_xml_source: project_binding.synthetic_exp_xml_source
  optional_context_packet:
    scope: page_fragment
    placed_component_refs:
      - U1
      - U2
      - J1
      - R1
      - R2
      - C1
      - TP1
    connector_candidates:
      - J1
    confirmed_power_nets:
      - VBUS
      - +3V3
    confirmed_ground_nets:
      - GND
    open_questions:
      - J1 manufacturer and manufacturer part number unresolved
      - USB_CC2 connectivity not established
      - generic component identities unresolved
      - full-export completeness unknown
  raw_xml_embedded: false
  runtime_absolute_paths_embedded: false

readiness_note:
  status: ready_for_downstream_review
  confirmed_and_unresolved_separated: true
  source_scope_marked: true
  asset_identity_present: true
  initial_mdd_owner_supplied_only_rule: satisfied
  mdd_placeholder_present: true
  raw_xml_excluded: true
  runtime_absolute_paths_excluded: true
  downstream_target: exp_xml_component_materials
  limitations:
    - page-level intake only
    - connector remains review_required
    - later MDD attachment requires asset_patch_attach_mdd_v0
```
