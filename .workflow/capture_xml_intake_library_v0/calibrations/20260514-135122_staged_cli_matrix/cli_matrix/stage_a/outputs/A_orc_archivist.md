profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "orc"
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
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: "PartInst placeholder value recovered from referenced Package-level manufacturer and MPN properties"
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "high"
      basis: "Direct PartInst value plus package-level manufacturer evidence"
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle / interface candidate"
      identity: "USB-C-16P"
      confidence: "candidate"
      basis: "Placed instance present; no package manufacturer or MPN evidence"
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
      confidence: "utility"
  notes:
    - "Package records treated as library/cache context only unless tied to placed instances."
    - "No promotion of generic parts to confirmed identity."

extracted_nets:
  confirmed:
    - net: "VBUS"
      type: "explicit"
      connections:
        - "J1:A4"
        - "J1:B4"
        - "U2:IN"
        - "U2:EN"
        - "TP1:1"
    - net: "+3V3"
      type: "explicit_global"
      connections:
        - "U2:OUT"
        - "U1:VDD"
        - "C1:1"
    - net: "GND"
      type: "explicit_global"
      connections:
        - "J1:A1"
        - "J1:B1"
        - "U2:GND"
        - "U1:VSS"
        - "C1:2"
        - "R1:2"
        - "R2:2"
    - net: "USB_CC1"
      type: "explicit"
      connections:
        - "J1:CC1"
        - "R1:1"
  review_required:
    - net: "U1:PA13"
      type: "no_connect"
      basis: "Explicit no-connect evidence; debug header omitted"
  excluded:
    - "USB_CC2 not inferred from R2"
  parser_notes:
    - "Only explicit net records were used."
    - "No pin-name-based net merging was performed."

connectors:
  confirmed:
    - refdes: "J1"
      type: "connector/interface"
      evidence: "Placed instance on explicit USB-related nets"
      confidence: "candidate"
      status: "review_required"
  summary:
    - "Connector identity is not fully confirmed from package metadata alone."
    - "USB-C context is supported by PartInst value and net topology, but not by manufacturer/MPN evidence."

power_summary:
  rails:
    - rail: "VBUS"
      class: "input_power"
      evidence: "PortInst VBUS_IN and explicit VBUS net"
    - rail: "+3V3"
      class: "regulated_power"
      evidence: "U2 OUT feeding U1 VDD and C1"
    - rail: "GND"
      class: "return"
      evidence: "Explicit global ground net"
  observations:
    - "U2 is the 3.3 V regulator on the sheet."
    - "VBUS feeds U2 IN and EN, suggesting the regulator enable is tied to input power."
    - "TP1 is connected to VBUS."

open_questions:
  - "J1 lacks manufacturer and MPN evidence; confirm whether it should be treated as a USB-C receptacle identity or remain a generic connector candidate."
  - "No explicit USB_CC2 net is present; do not infer it. If required downstream, verify from source schema rather than names alone."
  - "The excerpt provides no signal nets beyond power and CC1; confirm whether the sheet is intentionally partial."
  - "U1 pin-level functional identity beyond the recovered STM32F030F4P6 should be validated only if downstream rules require it."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  policy: "read_only_preserve_source_xml"
  evidence_scope:
    - "Synthetic EXP.xml excerpt only"
    - "No raw XML copied into packet"
    - "No runtime paths or private-state references"
  recovery_rules_applied:
    - "Recovered U1 identity from package-level properties because PartInst value was weak"
    - "Kept package records as context, not placed design instances"
    - "Separated confirmed, candidate, and review-required observations"

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  handoff_hints:
    - "placed_components: U1, U2, J1, R1, R2, C1, TP1"
    - "power_nets: VBUS, +3V3, GND"
    - "connector_candidate: J1"
    - "open_question_count: 4"
  constraints:
    - "Do not embed raw XML"
    - "Do not include runtime absolute paths"
    - "Preserve original source identity"

readiness_note:
  status: "ready_for_downstream_materials_extraction"
  caveat: "Connector confirmation and any non-explicit connectivity remain review-bound; source-derived facts are otherwise sufficiently structured for the next stage."