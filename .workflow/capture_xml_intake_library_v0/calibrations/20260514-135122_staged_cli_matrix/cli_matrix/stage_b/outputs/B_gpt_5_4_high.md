```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  model: "gpt-5.4"
  reasoning_effort: "high"
  species: "elf"
  class: "administrator"
  fixture_type: "public_safe_synthetic"

xml_shape_summary:
  root_element: "CISExport"
  parser_mode: "explicit_net_table"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  globals_present:
    - "+3V3"
    - "GND"
  no_connect_records: 1

block_summary:
  confirmed:
    - refdes: "U1"
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      identity_basis: "PartInst U1 references PKG_STM32F030F4P6; package props recover manufacturer/MPN because instance PartValue is placeholder"
      confidence: "high"
    - refdes: "U2"
      role: "LDO regulator"
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      identity_basis: "Direct PartInst value plus matching package manufacturer/MPN context"
      confidence: "high"
  candidate:
    - refdes: "TP1"
      role: "testpoint"
      identity: "generic utility part"
      identity_basis: "PartInst only; no manufacturer/MPN evidence"
    - refdes: "R1"
      role: "resistor"
      value: "5.1k"
    - refdes: "R2"
      role: "resistor"
      value: "5.1k"
    - refdes: "C1"
      role: "capacitor"
      value: "10uF"
  review_required:
    - refdes: "J1"
      role: "connector/interface"
      identity: "USB-C receptacle candidate"
      evidence: "PartInst value USB-C-16P and package footprint USB_C_RECEPTACLE"
      gap: "no manufacturer/MPN evidence"
    - refdes: "U1.PA13"
      role: "no_connect"
      evidence: "explicit NoConnect record"
      note: "reason states debug header omitted"

extracted_nets:
  confirmed:
    - net: "VBUS"
      type: "explicit"
      members: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
      port_refs: ["VBUS_IN"]
    - net: "+3V3"
      type: "explicit_global"
      members: ["U2.OUT", "U1.VDD", "C1.1"]
    - net: "GND"
      type: "explicit_global"
      members: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
    - net: "USB_CC1"
      type: "explicit"
      members: ["J1.CC1", "R1.1"]
  review_required:
    - note: "No explicit USB_CC2 net record is present; do not infer a net for R2.1 from naming symmetry."

connectors:
  review_required:
    - refdes: "J1"
      interface: "USB-C receptacle candidate"
      confirmed_pins_on_explicit_nets: ["A4", "B4", "A1", "B1", "CC1"]
      unresolved_identity: "manufacturer/MPN absent"
    - refdes: "TP1"
      interface: "test access point"
      confirmed_net: "VBUS"
      unresolved_identity: "generic utility part only"

power_summary:
  confirmed:
    input_power:
      - net: "VBUS"
        path: ["J1.A4/B4", "U2.IN", "U2.EN", "TP1.1"]
    regulated_power:
      - net: "+3V3"
        source: "U2.OUT"
        loads: ["U1.VDD", "C1.1"]
    return:
      - net: "GND"
        members: ["J1", "U2", "U1", "C1", "R1", "R2"]
  review_required:
    - "R2 is grounded on pin 2, but no explicit net ties pin 1 to CC2 or any other signal."
    - "Only the excerpted power pins are captured; no additional USB or MCU supply pins should be assumed."

open_questions:
  - "Should J1 be resolved to a specific manufacturer/MPN, or remain a generic USB-C receptacle in downstream materials?"
  - "Is R2 intended for a missing USB_CC2 net, or is the excerpt intentionally incomplete on that side?"
  - "Is U1.PA13 intentional no-connect for this design state, or does downstream review need to track deferred debug access?"
  - "Are additional J1 pins (shield, D+/D-, SBU, CC2) intentionally omitted from this intake excerpt?"

provenance:
  source_kind: "public_safe_synthetic fixture"
  source_binding: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  handling_note: "Summarized from fixture-provided EXP.xml excerpt only; no raw XML replayed, no private runtime truth used."

downstream_handoff:
  next_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    confirmed_components: ["U1=STM32F030F4P6", "U2=AP2112K-3.3TRG1"]
    connector_review: ["J1 USB-C receptacle candidate lacks MPN", "TP1 generic VBUS testpoint"]
    power_nets: ["VBUS", "+3V3", "GND"]
    review_items: ["missing explicit USB_CC2", "U1.PA13 explicit no-connect"]
  boundary_note: "Pass source identity and summarized observations only; do not embed raw XML or runtime absolute paths."

readiness_note:
  status: "ready_with_review_items"
  rationale: "Explicit-net intake is structurally sufficient for downstream component-material extraction, with connector identity and possible missing CC2 linkage retained as review-required rather than inferred."
```