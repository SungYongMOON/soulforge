profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "orc"
    class: "auditor"

xml_shape_summary:
  root_element: "CISExport"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"

block_summary:
  placed_instances_confirmed:
    - refdes: "U1"
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      evidence: ["package-level Manufacturer", "package-level MPN", "PartValue placeholder"]
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "high"
      evidence: ["direct PartInst PartValue", "package-level Manufacturer"]
    - refdes: "J1"
      role: "USB-C receptacle"
      identity: "review_required"
      confidence: "candidate"
      evidence: ["PartValue USB-C-16P", "package footprint USB_C_RECEPTACLE"]
    - refdes: "R1"
      role: "resistor"
      identity: "generic 5.1k"
      confidence: "generic"
    - refdes: "R2"
      role: "resistor"
      identity: "generic 5.1k"
      confidence: "generic"
    - refdes: "C1"
      role: "capacitor"
      identity: "generic 10uF"
      confidence: "generic"
    - refdes: "TP1"
      role: "testpoint"
      identity: "generic testpoint"
      confidence: "generic"
  library_cache_context_only:
    - package: "PKG_STM32F030F4P6"
    - package: "PKG_AP2112K_3V3"
    - package: "PKG_USB_C_16P"

extracted_nets:
  - net: "VBUS"
    kind: "explicit"
    members:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
  - net: "+3V3"
    kind: "explicit_global"
    members:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
  - net: "GND"
    kind: "explicit_global"
    members:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
  - net: "USB_CC1"
    kind: "explicit"
    members:
      - "J1.CC1"
      - "R1.1"
  - no_connect:
      - "U1.PA13"
    note: "review-visible no-connect evidence"

connectors:
  confirmed: []
  candidate:
    - refdes: "J1"
      type: "USB-C receptacle"
      status: "review_required"
      evidence: ["USB-style part value", "USB_C_RECEPTACLE footprint", "explicit VBUS and CC1 wiring"]
  notes:
    - "Do not infer CC2 from R2; no explicit USB_CC2 net is present."
    - "J1 remains unconfirmed as a manufacturer-specific connector."

power_summary:
  rails:
    - net: "VBUS"
      classification: "input_power"
      consumers: ["U2.IN", "U2.EN", "TP1.1"]
    - net: "+3V3"
      classification: "regulated_power"
      source: "U2.OUT"
      consumers: ["U1.VDD", "C1.1"]
    - net: "GND"
      classification: "return"
      consumers: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
  observations:
    - "U2 appears to regulate VBUS to +3V3."
    - "VBUS is also tied to EN, suggesting always-on enable behavior in the excerpt."

open_questions:
  - "J1 manufacturer and MPN are not present; confirm whether this is a generic USB-C receptacle or a specific sourced part."
  - "R2 is only tied to GND in the excerpt; confirm whether it is part of an omitted CC2 path or another utility function."
  - "U1 PA13 is explicitly no-connect; confirm that debug access is intentionally omitted."
  - "No explicit decoupling or USB data nets are shown in the excerpt; confirm whether they are absent from the sheet or omitted from the fixture."

provenance:
  source_policy: "read_only_preserve_source_xml"
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_basis:
    - "PartInst records treated as placed instances"
    - "Package records treated as library/cache context"
    - "explicit net table only"
  confidence_notes:
    - "U1 identity recovered from package-level properties with high confidence."
    - "U2 identity confirmed by direct instance value plus package evidence."
    - "J1 remains candidate only."
  immutability_boundary:
    - "No raw XML copied into artifacts"
    - "No runtime absolute paths stored"

downstream_handoff:
  next_stage: "exp_xml_component_materials"
  input_identity: "project_binding.synthetic_exp_xml_source"
  carry_forward:
    - "placed_components"
    - "connector_candidate"
    - "power_rails"
    - "explicit_nets"
    - "open_questions"
  constraints:
    - "Preserve source immutability"
    - "Do not embed raw XML"
    - "Do not expand beyond summarized facts"

readiness_note:
  status: "ready_for_downstream"
  rationale: "The intake packet cleanly separates confirmed identity, candidate connector evidence, explicit nets, and review items, with no inferred missing nets or promoted generic parts."
