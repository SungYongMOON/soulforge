profile_metadata:
  calibration_id: 20260514-135122_staged_cli_matrix
  workflow_id: capture_xml_intake_library_v0
  fixture_type: public_safe_synthetic
  parser_mode: explicit_net_table
  source_policy: read_only_preserve_source_xml

xml_shape_summary:
  root_element: CISExport
  design_name: SYNTH_USB_CTRL
  export_version: "17.4"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4

block_summary:
  confirmed:
    - refdes: U1
      role: MCU
      identity: STMicroelectronics STM32F030F4P6
      confidence: high
      basis: package-level manufacturer and MPN recovered from referenced package
    - refdes: U2
      role: LDO regulator
      identity: AP2112K-3.3TRG1
      confidence: high
      basis: direct PartInst value plus package-level manufacturer evidence
  review_required:
    - refdes: J1
      role: USB-C interface / connector candidate
      confidence: medium
      basis: connector-like placement and explicit pin nets, but no manufacturer or MPN evidence
  utility_parts:
    - refdes: R1
      role: resistor
    - refdes: R2
      role: resistor
    - refdes: C1
      role: capacitor
    - refdes: TP1
      role: testpoint

extracted_nets:
  - name: VBUS
    kind: explicit
    members:
      - J1.A4
      - J1.B4
      - U2.IN
      - U2.EN
      - TP1.1
  - name: +3V3
    kind: explicit_global
    members:
      - U2.OUT
      - U1.VDD
      - C1.1
  - name: GND
    kind: explicit_global
    members:
      - J1.A1
      - J1.B1
      - U2.GND
      - U1.VSS
      - C1.2
      - R1.2
      - R2.2
  - name: USB_CC1
    kind: explicit
    members:
      - J1.CC1
      - R1.1
  - name: U1.PA13
    kind: no_connect
    members:
      - U1.PA13
    notes:
      - debug header omitted

connectors:
  confirmed:
    - refdes: J1
      type: USB-C receptacle candidate
      status: review_required
      evidence:
        - explicit USB-related pins on VBUS, GND, and CC1
        - footprint context indicates USB_C_RECEPTACLE
      non_evidence:
        - no manufacturer
        - no MPN
  ports:
    - name: VBUS_IN
      net: VBUS
      direction: input
      page: PAGE1

power_summary:
  rails:
    - net: VBUS
      role: input power
      consumers:
        - U2.IN
        - U2.EN
        - TP1.1
      source_interface:
        - J1.A4
        - J1.B4
    - net: +3V3
      role: regulated output rail
      drivers:
        - U2.OUT
      consumers:
        - U1.VDD
        - C1.1
    - net: GND
      role: ground
      members:
        - J1.A1
        - J1.B1
        - U2.GND
        - U1.VSS
        - C1.2
        - R1.2
        - R2.2
  notes:
    - VBUS is the only explicit input-power net.
    - No CC2 net is present; do not infer it from R2.

open_questions:
  - J1 identity remains review_required because connector confirmation is not supported by manufacturer or MPN evidence.
  - R1 and R2 appear to implement USB-C CC handling, but only USB_CC1 is explicit in the source excerpt.
  - The role of TP1 is not specified beyond testpoint usage.
  - U1 package footprint context exists, but the placed-instance identity still depends on recovered package-level properties rather than direct PartInst value.

provenance:
  source_class: synthetic_exp_xml_excerpt
  source_identity: project_binding.synthetic_exp_xml_source
  immutability: preserve_source_xml
  evidence_boundary:
    confirmed: package-backed identity and explicit net records only
    candidate: connector classification for J1
    review_required: any inferred topology beyond explicit nets
  exclusions:
    - no raw XML retained
    - no runtime paths retained
    - no private project inspection claimed

downstream_handoff:
  target: exp_xml_component_materials
  required_input: project_binding.synthetic_exp_xml_source
  handoff_payload:
    include:
      - placed_components
      - connector_candidates
      - power_rails
      - no_connects
      - open_questions
    exclude:
      - raw XML
      - absolute paths
      - private runtime truth
  notes:
    - preserve source identity exactly
    - keep connector confidence separate from confirmed parts

readiness_note:
  status: ready_for_downstream_intake
  confidence: high
  rationale: explicit net table is complete for the excerpt, placed instances are enumerated, and only J1 remains review_required rather than blocked.