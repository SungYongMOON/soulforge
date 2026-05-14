profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  model: "gpt-5.4-mini"
  reasoning_effort: "low"
  species: "darkelf"
  class: "administrator"
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
      role: "MCU / controller"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "placed PartInst with placeholder PartValue; recovered from referenced Package SymbolUserProp"
    - refdes: "U2"
      role: "3.3V regulator"
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      confidence: "high"
      basis: "placed PartInst value plus package-level manufacturer evidence"
    - refdes: "J1"
      role: "USB-C receptacle"
      identity: "USB-C-16P"
      confidence: "low"
      basis: "placed PartInst value only; no manufacturer/MPN evidence"
  review_required:
    - refdes: "J1"
      note: "connector/interface candidate, not fully resolved to a library part identity"
  generic_or_utility:
    - refdes: "R1"
      note: "5.1k resistor; do not promote to confirmed library identity"
    - refdes: "R2"
      note: "5.1k resistor; do not promote to confirmed library identity"
    - refdes: "C1"
      note: "10uF capacitor; do not promote to confirmed library identity"
    - refdes: "TP1"
      note: "testpoint; utility part only"

extracted_nets:
  confirmed:
    - name: "VBUS"
      kind: "explicit"
      members:
        - "J1:A4"
        - "J1:B4"
        - "U2:IN"
        - "U2:EN"
        - "TP1:1"
    - name: "+3V3"
      kind: "explicit_global"
      members:
        - "U2:OUT"
        - "U1:VDD"
        - "C1:1"
    - name: "GND"
      kind: "explicit_global"
      members:
        - "J1:A1"
        - "J1:B1"
        - "U2:GND"
        - "U1:VSS"
        - "C1:2"
        - "R1:2"
        - "R2:2"
    - name: "USB_CC1"
      kind: "explicit"
      members:
        - "J1:CC1"
        - "R1:1"
  review_visible_no_connect:
    - refdes: "U1"
      pin: "PA13"
      reason: "debug header omitted"
  not_inferred:
    - "No USB_CC2 net inferred from R2"

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      evidence: "placed instance plus explicit VBUS/GND/CC1 connectivity"
  review_required:
    - refdes: "J1"
      reason: "manufacturer and MPN not present in the excerpt"
  notes:
    - "Treat as interface connector candidate until library identity is resolved downstream"

power_summary:
  rails:
    - name: "VBUS"
      role: "input power"
      consumers: ["U2:IN", "U2:EN", "TP1:1"]
    - name: "+3V3"
      role: "regulated output"
      sources: ["U2:OUT"]
      consumers: ["U1:VDD", "C1:1"]
    - name: "GND"
      role: "common return"
      members: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]
  observations:
    - "USB power enters through J1 and feeds U2."
    - "U2 generates the +3V3 rail for U1."
    - "VBUS is also tied to U2 EN, suggesting always-on enable from input power."

open_questions:
  - "Confirm J1 library identity and manufacturer/MPN if downstream material exists."
  - "Determine whether U1 package-level recovery should be mirrored into a canonical component record downstream."
  - "Check whether TP1 is a single testpoint or part of a larger test access scheme outside this excerpt."
  - "Validate whether any omitted USB data nets exist in the full design; none are present in this excerpt."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_type: "synthetic EXP.xml excerpt"
  boundary: "public_safe; no private runtime truth used"
  evidence_handling:
    - "Placed PartInst records treated as design instances."
    - "Package records treated as library/cache context only."
    - "Recovered U1 identity from package-level properties because the placed instance value was weak."
    - "Kept J1 as review-required because the excerpt lacks manufacturer/MPN evidence."
  immutability:
    - "Source XML not mutated"
    - "Raw XML not reproduced in packet"

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  hints:
    - "placed_components: [U1, U2, J1, R1, R2, C1, TP1]"
    - "connectors: [J1]"
    - "power_nets: [VBUS, +3V3, GND]"
    - "open_questions: 4"
  constraints:
    - "Do not embed raw XML"
    - "Do not include runtime absolute paths"

readiness_note:
  status: "ready"
  confidence: "high"
  rationale: "Explicit net table is complete for the excerpt, placed instances are enumerated, and identity recovery rules were applied conservatively without inventing missing data."