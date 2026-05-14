profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  assigned_profile:
    model: "gpt-5.4"
    reasoning_effort: "medium"
    species: "elf"
    class: "administrator"
  fixture_type: "public_safe_synthetic"
  source_policy: "read_only_preserve_source_xml"
  archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"

xml_shape_summary:
  root_element: "CISExport"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"
  page_titles:
    - schematic: "MAIN"
      page: "PAGE1"
      title: "USB power and controller"

block_summary:
  confirmed_components:
    - refdes: "U1"
      role: "microcontroller"
      identity:
        manufacturer: "STMicroelectronics"
        mpn: "STM32F030F4P6"
        footprint: "TSSOP20"
      identity_basis: "recovered from referenced package because PartInst PartValue is placeholder"
      confidence: "high"
    - refdes: "U2"
      role: "3.3V regulator"
      identity:
        manufacturer: "Diodes Incorporated"
        mpn: "AP2112K-3.3TRG1"
        footprint: "SOT23-5"
      identity_basis: "direct PartInst value plus referenced package properties"
      confidence: "high"
  candidate_components:
    - refdes: "J1"
      role: "USB-C receptacle/interface"
      identity:
        part_value: "USB-C-16P"
        footprint: "USB_C_RECEPTACLE"
      confidence: "medium"
  review_required:
    - refdes: "J1"
      reason: "no manufacturer/MPN evidence in excerpt; connector identity not fully confirmed"
    - refdes: "R1"
      reason: "generic 5.1k resistor; utility part only"
    - refdes: "R2"
      reason: "generic 5.1k resistor; utility part only"
    - refdes: "C1"
      reason: "generic 10uF capacitor; utility part only"
    - refdes: "TP1"
      reason: "generic testpoint; utility part only"
  no_connects:
    - refdes: "U1"
      pin: "PA13"
      reason: "debug header omitted"

extracted_nets:
  confirmed:
    - net: "VBUS"
      kind: "explicit"
      members: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
    - net: "+3V3"
      kind: "explicit_global"
      members: ["U2.OUT", "U1.VDD", "C1.1"]
    - net: "GND"
      kind: "explicit_global"
      members: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
    - net: "USB_CC1"
      kind: "explicit"
      members: ["J1.CC1", "R1.1"]
  review_visible_absences:
    - note: "No explicit USB_CC2 net record present; R2 must not be merged into CC2 by name or symmetry inference."

connectors:
  candidates:
    - refdes: "J1"
      type: "USB-C receptacle"
      evidence:
        - "placed PartInst present"
        - "VBUS pins A4/B4 on explicit VBUS net"
        - "A1/B1 on explicit GND net"
        - "CC1 on explicit USB_CC1 net"
      status: "review_required"
    - refdes: "TP1"
      type: "testpoint"
      evidence:
        - "placed PartInst present"
        - "pin 1 on explicit VBUS net"
      status: "utility_only"

power_summary:
  input_power:
    - net: "VBUS"
      ingress:
        - "PortInst VBUS_IN"
        - "J1 A4/B4"
      consumers_or_taps:
        - "U2.IN"
        - "U2.EN"
        - "TP1.1"
  regulated_power:
    - net: "+3V3"
      source: "U2.OUT"
      consumers:
        - "U1.VDD"
        - "C1.1"
  return_path:
    - net: "GND"
      members:
        - "J1 A1/B1"
        - "U2.GND"
        - "U1.VSS"
        - "C1.2"
        - "R1.2"
        - "R2.2"
  notes:
    - "U2 behaves as VBUS-to-3V3 regulator from explicit net evidence."
    - "EN is tied to VBUS by explicit connectivity."

open_questions:
  - id: "connector_identity_j1"
    status: "review_required"
    question: "What is the exact manufacturer and MPN for J1?"
  - id: "cc2_path_missing"
    status: "review_required"
    question: "Is there an intended USB_CC2 net for R2 pin 1, or is the excerpt intentionally incomplete?"
  - id: "u1_power_pins_scope"
    status: "candidate"
    question: "Are additional U1 supply or decoupling connections outside the excerpt scope?"
  - id: "tp1_intent"
    status: "candidate"
    question: "Is TP1 intended as VBUS measurement/debug access only?"

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_scope: "synthetic EXP.xml excerpt only"
  extraction_mode: "explicit nets and placed PartInst records prioritized; package properties used only through referenced placed instances"
  excluded_from_artifact:
    - "raw XML body"
    - "runtime absolute paths"
    - "private project state"
    - "invented nets or identities"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    confirmed_components: ["U1=STM32F030F4P6", "U2=AP2112K-3.3TRG1"]
    connector_review: ["J1 USB-C receptacle identity unresolved"]
    power_nets: ["VBUS", "+3V3", "GND"]
    notable_net_gap: ["No explicit USB_CC2 net"]
    no_connects: ["U1.PA13"]
  handoff_constraints:
    - "preserve source immutability"
    - "do not embed raw XML"
    - "do not include runtime absolute paths"

readiness_note:
  status: "ready_with_review_flags"
  rationale:
    - "XML shape is consistent and explicit-net parsing is sufficient for intake."
    - "Core power and primary placed-component identities are recoverable with high confidence."
    - "Connector identity and missing CC2 evidence require downstream review, not inference."