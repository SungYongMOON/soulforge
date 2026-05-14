profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "human"
    class: "archivist"
  source_policy: "read_only_preserve_source_xml"

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
      kind: "IC"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "Placed instance with placeholder PartValue; recovered from referenced Package SymbolUserProp manufacturer + MPN"
    - refdes: "U2"
      kind: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "high"
      basis: "Direct PartInst value plus package-level manufacturer evidence"
    - refdes: "J1"
      kind: "USB-C receptacle"
      identity: "USB-C-16P"
      confidence: "review_required"
      basis: "Placed connector instance; lacks manufacturer and MPN evidence"
  utility_or_generic:
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
    explicit: true
    members:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
  - name: "+3V3"
    explicit: true
    global: true
    members:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
  - name: "GND"
    explicit: true
    global: true
    members:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
  - name: "USB_CC1"
    explicit: true
    members:
      - "J1.CC1"
      - "R1.1"

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      evidence: ["Placed instance", "Explicit net participation on VBUS, GND, USB_CC1"]
      status: "review_required"
  notes:
    - "Do not infer CC2 from R2; no explicit USB_CC2 net is present."

power_summary:
  rails:
    - name: "VBUS"
      role: "input power"
      sources:
        - "J1.A4"
        - "J1.B4"
      consumers:
        - "U2.IN"
        - "U2.EN"
        - "TP1.1"
    - name: "+3V3"
      role: "regulated output"
      sources:
        - "U2.OUT"
      consumers:
        - "U1.VDD"
        - "C1.1"
    - name: "GND"
      role: "return"
      members:
        - "J1.A1"
        - "J1.B1"
        - "U2.GND"
        - "U1.VSS"
        - "C1.2"
        - "R1.2"
        - "R2.2"
  observations:
    - "U2 appears to regulate VBUS to +3V3."
    - "No inferred power nets beyond the explicit records."
    - "U1 power is on +3V3 with GND return."

open_questions:
  - "J1 manufacturer and MPN are not evidenced; keep as review_required until library identity is confirmed."
  - "R1 and R2 appear to form USB-C CC pull resistors, but only USB_CC1 is explicitly recorded here."
  - "No explicit USB_CC2 net is present; do not synthesize one."
  - "No-connect on U1.PA13 is review-visible and should be preserved downstream."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_kind: "synthetic_exp_xml_excerpt"
  immutability: "preserve_source_xml"
  evidence_basis:
    - "PartInst records treated as placed instances"
    - "Package records treated as library/cache context"
    - "Package-level properties used only to recover U1 identity"
    - "Explicit net table used as the only net source"
  exclusions:
    - "No raw XML copied"
    - "No runtime absolute paths"
    - "No private project truth"

downstream_handoff:
  next_step: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  include_hints:
    - "placed-component identities"
    - "explicit connector evidence"
    - "power rail summary"
    - "review-required connector and CC resistor notes"
    - "U1 recovered manufacturer/MPN evidence"
  exclude:
    - "raw XML"
    - "runtime absolute paths"
    - "private-state data"

readiness_note:
  status: "ready_for_downstream_intake"
  caveats:
    - "Connector identity remains review_required."
    - "No-connect evidence should be carried forward unchanged."
    - "Do not infer any missing nets or pins beyond the explicit table."