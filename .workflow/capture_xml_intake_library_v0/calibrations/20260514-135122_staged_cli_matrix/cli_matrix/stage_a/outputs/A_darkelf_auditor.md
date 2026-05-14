profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "darkelf"
    class: "auditor"
  fixture_type: "public_safe_synthetic"
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
      evidence: "Recovered from Package-level Manufacturer and MPN because PartInst value was placeholder."
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "confirmed"
      evidence: "Direct PartInst value plus package-level manufacturer evidence."
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle / interface connector"
      identity: "USB-C-16P"
      confidence: "candidate"
      evidence: "Placed instance with connector value and package footprint only; no manufacturer or MPN."
    - refdes: "R1"
      role: "5.1k resistor"
      identity: "generic passive"
      confidence: "utility"
    - refdes: "R2"
      role: "5.1k resistor"
      identity: "generic passive"
      confidence: "utility"
    - refdes: "C1"
      role: "10uF capacitor"
      identity: "generic passive"
      confidence: "utility"
    - refdes: "TP1"
      role: "testpoint"
      identity: "generic utility"
      confidence: "utility"

extracted_nets:
  confirmed:
    - net: "VBUS"
      kind: "explicit"
      pins:
        - "J1:A4"
        - "J1:B4"
        - "U2:IN"
        - "U2:EN"
        - "TP1:1"
    - net: "+3V3"
      kind: "explicit_global"
      pins:
        - "U2:OUT"
        - "U1:VDD"
        - "C1:1"
    - net: "GND"
      kind: "explicit_global"
      pins:
        - "J1:A1"
        - "J1:B1"
        - "U2:GND"
        - "U1:VSS"
        - "C1:2"
        - "R1:2"
        - "R2:2"
    - net: "USB_CC1"
      kind: "explicit"
      pins:
        - "J1:CC1"
        - "R1:1"
  review_required:
    - net: "U1:PA13"
      kind: "no_connect"
      evidence: "Explicit no-connect marker; debug header omitted."
      status: "review_visible"
  not_inferred:
    - "USB_CC2"
    - "Any unnamed or pin-name-only connectivity beyond explicit net records"

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      status: "candidate_review"
      evidence: "Placed instance with USB-C-16P value and explicit USB-related nets."
      notes:
        - "Treat as interface connector, but do not over-confirm manufacturer identity."
  associated_pins:
    - "VBUS: J1 A4/B4"
    - "GND: J1 A1/B1"
    - "USB_CC1: J1 CC1"

power_summary:
  rails:
    - rail: "VBUS"
      role: "input power"
      consumers: ["U2:IN", "U2:EN", "TP1:1"]
    - rail: "+3V3"
      role: "regulated output"
      source: "U2:OUT"
      consumers: ["U1:VDD", "C1:1"]
    - rail: "GND"
      role: "return"
      consumers: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]
  regulator_chain:
    - "VBUS feeds U2, which generates +3V3 for U1 and C1."
  review_notes:
    - "No inferred CC2 net."
    - "U2 enable is tied to VBUS in the explicit net table."

open_questions:
  - "J1 manufacturer and MPN are not present in the excerpt; confirm connector identity only at candidate level."
  - "R1/R2 function is implied by USB-C CC pull resistors, but no explicit role annotation is present."
  - "No explicit evidence for any USB data nets is present in the excerpt."
  - "No explicit evidence for CC2 is present; do not infer it."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  intake_library_root: "_workspaces/<project_code>/intake/capture_xml"
  preservation_mode: "read_only_preserve_source_xml"
  evidence_basis:
    - "PartInst records treated as placed design instances."
    - "Package records used only as library/cache context unless referenced for identity recovery."
    - "Explicit net records used directly; no net inference performed."
  boundary_notes:
    - "No raw XML copied into artifacts."
    - "No runtime absolute paths, credentials, cookies, or private project truth included."

downstream_handoff:
  target_stage: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    - "placed-components: U1, U2, J1, R1, R2, C1, TP1"
    - "power: VBUS -> U2 -> +3V3"
    - "connectors: J1 candidate USB-C receptacle"
    - "open-questions: connector identity, missing CC2, absent data nets"
  restrictions:
    - "Do not embed raw XML."
    - "Do not embed runtime absolute paths."

readiness_note:
  status: "ready_for_downstream_materials_extraction"
  confidence: "high"
  caveats:
    - "Connector identity remains candidate-level."
    - "No-connect evidence for U1:PA13 should be preserved in downstream handling."
