profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "human"
    class: "administrator"

xml_shape_summary:
  root_element: "CISExport"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    - refdes: "U1"
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "Placed instance with placeholder PartValue; recovered from referenced Package SymbolUserProp Manufacturer + MPN"
    - refdes: "U2"
      role: "LDO regulator"
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      confidence: "high"
      basis: "Direct PartInst value plus package-level manufacturer evidence"
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle / interface connector"
      identity: "USB-C-16P"
      confidence: "medium"
      basis: "Placed instance only; package footprint exists but no manufacturer or MPN"
    - refdes: "R1"
      role: "resistor"
      identity: "5.1k"
      confidence: "low"
      basis: "Utility part; generic identity only"
    - refdes: "R2"
      role: "resistor"
      identity: "5.1k"
      confidence: "low"
      basis: "Utility part; generic identity only"
    - refdes: "C1"
      role: "capacitor"
      identity: "10uF"
      confidence: "low"
      basis: "Utility part; generic identity only"
    - refdes: "TP1"
      role: "testpoint"
      identity: "TESTPOINT"
      confidence: "low"
      basis: "Utility part; generic identity only"

extracted_nets:
  confirmed:
    - name: "VBUS"
      kind: "explicit"
      pins:
        - "J1:A4"
        - "J1:B4"
        - "U2:IN"
        - "U2:EN"
        - "TP1:1"
    - name: "+3V3"
      kind: "global_explicit"
      pins:
        - "U2:OUT"
        - "U1:VDD"
        - "C1:1"
    - name: "GND"
      kind: "global_explicit"
      pins:
        - "J1:A1"
        - "J1:B1"
        - "U2:GND"
        - "U1:VSS"
        - "C1:2"
        - "R1:2"
        - "R2:2"
    - name: "USB_CC1"
      kind: "explicit"
      pins:
        - "J1:CC1"
        - "R1:1"
  review_required:
    - name: "U1:PA13"
      kind: "no_connect"
      evidence: "debug header omitted"
      action: "retain as review-visible no-connect evidence; do not infer additional debug nets"
    - name: "USB_CC2"
      kind: "absent"
      evidence: "no explicit net record present"
      action: "do not infer from R2"

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      evidence: "Placed instance on explicit USB power/controller sheet"
      status: "review_required"
  notes:
    - "Do not promote connector identity beyond review_required without manufacturer or MPN evidence."
    - "Connector pin evidence is explicit only for VBUS, GND, and CC1-related connectivity."

power_summary:
  rails:
    - name: "VBUS"
      source: "J1"
      consumers: ["U2:IN", "U2:EN", "TP1:1"]
      status: "confirmed"
    - name: "+3V3"
      source: "U2"
      consumers: ["U1:VDD", "C1:1"]
      status: "confirmed"
    - name: "GND"
      source: "system ground"
      consumers: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]
      status: "confirmed"
  observations:
    - "U2 is the explicit 3.3 V regulator feeding the controller rail."
    - "VBUS is present as the USB input rail and is also tied to U2 EN."

open_questions:
  - "J1 connector manufacturer and exact MPN are not present in the fixture."
  - "USB_CC2 is not explicitly recorded; do not infer it from R2."
  - "U1 package-level recovery is strong, but only package metadata supports the identity, not the PartInst value."
  - "No explicit net evidence is provided for reset, SWD, crystal, or data lines."

provenance:
  source_policy: "read_only_preserve_source_xml"
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_scope:
    - "synthetic EXP.xml excerpt only"
    - "placed PartInst records"
    - "package-level SymbolUserProp records"
    - "explicit Net records"
    - "NoConnect record"
  boundary_notes:
    - "No raw XML copied into output artifacts."
    - "No runtime path, credentials, private project truth, or source mutation claimed."

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    - "placed_components: U1, U2, J1, R1, R2, C1, TP1"
    - "confirmed_nets: VBUS, +3V3, GND, USB_CC1"
    - "no_connect_visible: U1 PA13"
    - "review_required_connector: J1"
  constraints:
    - "preserve source immutability"
    - "do not embed raw XML"
    - "do not emit runtime absolute paths"

readiness_note:
  status: "ready_for_downstream_intake"
  rationale: "Shape, placed instances, explicit nets, and no-connect evidence are sufficient for component-materials handoff with clear review boundaries."