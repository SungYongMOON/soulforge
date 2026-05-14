profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  parser_mode: "explicit_net_table"
  source_policy: "read_only_preserve_source_xml"
  input_class: "synthetic_exp_xml_excerpt"

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
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "placeholder PartInst value recovered from referenced Package SymbolUserProp"
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "confirmed"
      basis: "direct PartInst value plus package-level manufacturer evidence"
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle"
      identity: "connector candidate"
      confidence: "low"
      basis: "connector/interface placement only; no manufacturer or MPN evidence"
  utility_parts:
    - refdes: "R1"
      role: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "R2"
      role: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "C1"
      role: "capacitor"
      identity: "10uF"
      confidence: "generic"
    - refdes: "TP1"
      role: "testpoint"
      identity: "TESTPOINT"
      confidence: "generic"

extracted_nets:
  - net: "VBUS"
    type: "explicit"
    pins:
      - "J1:A4"
      - "J1:B4"
      - "U2:IN"
      - "U2:EN"
      - "TP1:1"
  - net: "+3V3"
    type: "explicit_global"
    pins:
      - "U2:OUT"
      - "U1:VDD"
      - "C1:1"
  - net: "GND"
    type: "explicit_global"
    pins:
      - "J1:A1"
      - "J1:B1"
      - "U2:GND"
      - "U1:VSS"
      - "C1:2"
      - "R1:2"
      - "R2:2"
  - net: "USB_CC1"
    type: "explicit"
    pins:
      - "J1:CC1"
      - "R1:1"

connectors:
  confirmed:
    - refdes: "J1"
      interface: "USB-C receptacle"
      evidence: "explicit part placement and net participation"
      status: "review_required"
  notes:
    - "Do not infer CC2 from R2; no explicit USB_CC2 net is present."
    - "USB interface evidence is sufficient for placement, not for manufacturer confirmation."

power_summary:
  rails:
    - rail: "VBUS"
      role: "input power"
      consumers: ["U2:IN", "U2:EN", "TP1:1"]
      source: ["J1:A4", "J1:B4"]
    - rail: "+3V3"
      role: "regulated output"
      consumers: ["U1:VDD", "C1:1"]
      source: ["U2:OUT"]
    - rail: "GND"
      role: "return"
      consumers: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]
  observations:
    - "U2 is the power conversion element on the sheet."
    - "VBUS is explicitly routed to both input and enable of U2."

open_questions:
  - "J1 lacks manufacturer and MPN evidence; confirm whether the package identity should stay review_required."
  - "R1 and R2 are both 5.1k resistors; confirm if they are intended as USB-C CC pull-downs/pull-ups from the broader design context."
  - "No explicit USB_CC2 net is present; confirm whether the omission is intentional."
  - "U1 PA13 is marked no-connect; confirm whether debug access is intentionally omitted."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  preservation_rule: "source XML remains read-only and unmodified"
  scope_limitations:
    - "No raw XML copied into output artifacts"
    - "No runtime absolute paths recorded"
    - "No private project truth assumed"
  evidence_basis:
    - "explicit net table records"
    - "PartInst placement records"
    - "Package-level properties only for identity recovery when needed"

downstream_handoff:
  next_workflow: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  handoff_hints:
    - "placed component list with confirmed vs review_required separation"
    - "explicit net inventory"
    - "power rail summary"
    - "open questions on connector confirmation and USB CC topology"

readiness_note:
  status: "ready"
  confidence: "high"
  rationale: "The excerpt contains a complete explicit-net intake surface for a small sheet, with one recovered component identity, one confirmed regulator, one connector candidate, and clear review-visible no-connect evidence."