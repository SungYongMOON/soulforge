profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  parser_mode: "explicit_net_table"

xml_shape_summary:
  root_element: "CISExport"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4

block_summary:
  confirmed:
    - refdes: "U1"
      kind: "IC"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "PartInst placeholder value recovered from referenced Package SymbolUserProp values"
    - refdes: "U2"
      kind: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "confirmed"
      basis: "Direct PartInst value plus package-level manufacturer evidence"
  review_required:
    - refdes: "J1"
      kind: "connector/interface"
      identity: "USB-C-16P"
      confidence: "candidate"
      basis: "Placed instance present, but no manufacturer/MPN evidence in excerpt"
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
      - "J1:A4"
      - "J1:B4"
      - "U2:IN"
      - "U2:EN"
      - "TP1:1"
  - name: "+3V3"
    explicit: true
    global: true
    members:
      - "U2:OUT"
      - "U1:VDD"
      - "C1:1"
  - name: "GND"
    explicit: true
    global: true
    members:
      - "J1:A1"
      - "J1:B1"
      - "U2:GND"
      - "U1:VSS"
      - "C1:2"
      - "R1:2"
      - "R2:2"
  - name: "USB_CC1"
    explicit: true
    members:
      - "J1:CC1"
      - "R1:1"

connectors:
  confirmed:
    - refdes: "none"
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle"
      status: "candidate_only"
      note: "Interface connector is present as a placed instance, but confirmation is limited by missing manufacturer/MPN data"
  no_inference:
    - "Do not infer CC2 from R2 because no explicit USB_CC2 net is present"

power_summary:
  rails:
    - name: "VBUS"
      type: "input power"
      endpoints: ["J1:A4", "J1:B4", "U2:IN", "U2:EN", "TP1:1"]
    - name: "+3V3"
      type: "regulated output"
      endpoints: ["U2:OUT", "U1:VDD", "C1:1"]
    - name: "GND"
      type: "ground"
      endpoints: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]

open_questions:
  - "J1 identity remains candidate-level only; no manufacturer or MPN evidence is present in the excerpt."
  - "No explicit USB_CC2 net is present; R2 should not be assumed to serve CC2 without source evidence."
  - "U1 PA13 is explicitly no-connect and should remain review-visible in downstream handling."

provenance:
  source_policy: "read_only_preserve_source_xml"
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_scope: "synthetic EXP.xml excerpt only"
  boundary_notes:
    - "No raw XML is reproduced"
    - "No runtime absolute paths are included"
    - "Placed instances are treated separately from cache/package context"
  confidence_policy: "confirmed, candidate, and review-required observations remain separated"

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  hints:
    - "Carry forward confirmed identity for U1 and U2"
    - "Preserve candidate status for J1"
    - "Retain explicit net table and no-connect evidence"
    - "Keep power rail membership compact and source-bound"

readiness_note:
  status: "ready"
  rationale: "The intake packet is sufficiently structured for component-material extraction without inventing missing identity, nets, or connector confirmation."