profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "elf"
    class: "administrator"
  source_policy: "read_only_preserve_source_xml"
  scope_note: "Synthetic intake summary only; no raw XML, runtime paths, or private project truth."

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
      evidence: "Package-level manufacturer and MPN recovered from referenced package; PartInst value is placeholder."
    - refdes: "U2"
      role: "LDO regulator"
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      confidence: "high"
      evidence: "Direct PartInst value matches package-level manufacturer evidence."
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle / interface connector"
      identity: "USB-C-16P"
      confidence: "candidate"
      evidence: "Placed instance and connector-like context present; no manufacturer/MPN confirmation in provided excerpt."
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
      role: "test point"
      identity: "TESTPOINT"
      confidence: "generic"

extracted_nets:
  - name: "VBUS"
    kind: "explicit"
    connections:
      - "J1 A4"
      - "J1 B4"
      - "U2 IN"
      - "U2 EN"
      - "TP1 1"
  - name: "+3V3"
    kind: "global_explicit"
    connections:
      - "U2 OUT"
      - "U1 VDD"
      - "C1 1"
  - name: "GND"
    kind: "global_explicit"
    connections:
      - "J1 A1"
      - "J1 B1"
      - "U2 GND"
      - "U1 VSS"
      - "C1 2"
      - "R1 2"
      - "R2 2"
  - name: "USB_CC1"
    kind: "explicit"
    connections:
      - "J1 CC1"
      - "R1 1"
  - name: "U1 PA13"
    kind: "no_connect"
    connections:
      - "U1 PA13"
    note: "Debug header omitted; preserve as review-visible no-connect evidence."

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      status: "candidate"
      evidence: "Placed connector instance with explicit USB-related nets."
  notes:
    - "Do not infer CC2 from R2; no explicit USB_CC2 net is present."

power_summary:
  rails:
    - name: "VBUS"
      type: "input_supply"
      usage: "External USB power enters via J1 and feeds U2 IN/EN and TP1."
    - name: "+3V3"
      type: "regulated_output"
      usage: "U2 output powers U1 VDD and C1."
    - name: "GND"
      type: "return"
      usage: "Shared return across connector, regulator, MCU, capacitor, and resistors."
  observations:
    - "U2 appears to be the 3.3 V regulator stage."
    - "VBUS-to-EN tie is explicit in the net table."
    - "No additional power nets are evidenced in the excerpt."

open_questions:
  - "J1 remains review_required because connector identity is not confirmed by manufacturer/MPN evidence."
  - "R2 has no explicit net association beyond GND in the excerpt; do not infer a second USB-C termination net."
  - "The excerpt does not provide enough library detail to promote R1, R2, C1, or TP1 beyond generic utility parts."
  - "No alternate power nets or decoupling details are shown beyond the explicit rails listed."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_basis:
    - "Placed instances interpreted from PartInst records only."
    - "Package records used as library/cache context, and only U1 identity was recovered from package-level properties."
    - "Explicit net records were taken as authoritative; no inferred nets were added."
  boundary_notes:
    - "No runtime paths, credentials, private project data, or raw XML were used or stored."
    - "Confirmed, candidate, and review-required observations were kept separate."

downstream_handoff:
  next_step: "exp_xml_component_materials"
  handoff_payload:
    source: "project_binding.synthetic_exp_xml_source"
    placed_instances: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    explicit_nets: ["VBUS", "+3V3", "GND", "USB_CC1"]
    review_flags:
      - "J1 connector identity not fully confirmed"
      - "U1 no-connect on PA13"
  restrictions:
    - "Do not include raw XML."
    - "Do not include runtime absolute paths."
    - "Preserve source immutability."

readiness_note:
  status: "ready_for_downstream_materials_extraction"
  confidence: "high"
  rationale: "Shape, placed instances, explicit nets, and principal power rails are sufficiently resolved for component-materials intake, with connector identity and generic parts still marked appropriately for review."