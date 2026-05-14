profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "elf"
    class: "administrator"
  fixture_type: "public_safe_synthetic"
  source_policy: "read_only_preserve_source_xml"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  export_version: "17.4"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    - refdes: "U1"
      kind: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      evidence: ["PartInst placeholder value", "Package SymbolUserProp manufacturer", "Package SymbolUserProp MPN"]
    - refdes: "U2"
      kind: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "high"
      evidence: ["PartInst value", "Package SymbolUserProp manufacturer", "Package SymbolUserProp MPN"]
  review_required:
    - refdes: "J1"
      kind: "USB-C connector/interface"
      identity: "USB-C-16P"
      confidence: "candidate"
      evidence: ["PartInst value", "package footprint only"]
    - refdes: "R1"
      kind: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "R2"
      kind: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "C1"
      kind: "capacitor"
      identity: "10uF"
      confidence: "generic"
    - refdes: "TP1"
      kind: "testpoint"
      identity: "TESTPOINT"
      confidence: "generic"

extracted_nets:
  - name: "VBUS"
    type: "explicit"
    members:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
  - name: "+3V3"
    type: "explicit_global"
    members:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
  - name: "GND"
    type: "explicit_global"
    members:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
  - name: "USB_CC1"
    type: "explicit"
    members:
      - "J1.CC1"
      - "R1.1"
  - name: "PA13"
    type: "no_connect"
    members:
      - "U1.PA13"
    note: "debug header omitted"

connectors:
  confirmed: []
  candidate:
    - refdes: "J1"
      interface: "USB-C receptacle"
      status: "review_required"
      evidence_strength: "partial"
      notes:
        - "Placed instance present"
        - "No manufacturer or MPN evidence in excerpt"
        - "Do not infer CC2 from R2; no explicit USB_CC2 net"
  utility:
    - refdes: "TP1"
      kind: "testpoint"
      status: "utility"

power_summary:
  rails:
    - name: "VBUS"
      role: "input power"
      explicit: true
      connected_to: ["J1", "U2.IN", "U2.EN", "TP1"]
    - name: "+3V3"
      role: "regulated rail"
      explicit: true
      connected_to: ["U2.OUT", "U1.VDD", "C1.1"]
    - name: "GND"
      role: "return"
      explicit: true
      connected_to: ["J1", "U2", "U1", "C1", "R1", "R2"]
  power_path_summary:
    - "USB VBUS feeds U2 input and enable."
    - "U2 regulates to +3V3 for U1."
    - "C1 is a rail decoupling component tied to +3V3 and GND."
  caution:
    - "No additional power nets inferred beyond explicit records."

open_questions:
  - "J1 connector identity is only partially evidenced; manufacturer and MPN are not confirmed."
  - "R1 and R2 appear to support USB-C CC behavior, but only USB_CC1 is explicitly recorded."
  - "No second CC net is present in the excerpt; do not infer USB_CC2."
  - "No-connect on U1.PA13 is review-visible and may reflect an intentionally omitted debug header."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_class: "synthetic_exemplar"
  immutability: "preserve_source_xml"
  evidence_boundary:
    confirmed:
      - "PartInst records treated as placed design instances"
      - "Package-level props used only to recover identity where instance identity was weak"
      - "Explicit net records used without inference"
    excluded:
      - "No raw XML"
      - "No runtime paths"
      - "No private project inspection"
      - "No command execution claims"

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  hints:
    - "placed_component_summary"
    - "connector_candidate_J1"
    - "power_rails_VBUS_3V3_GND"
    - "no_connect_U1.PA13"
    - "open_questions_on_USB_CC2_and_J1_identity"
  constraints:
    - "Do not embed raw XML"
    - "Do not embed absolute paths"
    - "Preserve source identity"

readiness_note:
  status: "ready_for_downstream_materials_extraction"
  confidence: "high"
  caveat: "Connector identity remains candidate-level; otherwise the intake packet is complete and bounded to explicit evidence."