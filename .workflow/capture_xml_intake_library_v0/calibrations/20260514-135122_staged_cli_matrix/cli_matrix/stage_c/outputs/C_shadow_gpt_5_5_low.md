```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  model: "gpt-5.5"
  reasoning_effort: "low"
  species: "elf"
  class: "administrator"
  execution_mode: "synthetic_no_io"
  source_policy: "read_only_preserve_source_xml"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  export_version: "17.4"
  schematics: 1
  pages: 1
  cache_packages: 3
  placed_instances: 7
  explicit_net_records: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    - refdes: "U1"
      role: "controller"
      identity_source: "referenced package properties"
      manufacturer: "STMicroelectronics"
      mpn: "STM32F030F4P6"
      footprint: "TSSOP20"
      confidence: "high_recovered"
    - refdes: "U2"
      role: "3V3 regulator"
      identity_source: "PartInst value plus package properties"
      manufacturer: "Diodes Incorporated"
      mpn: "AP2112K-3.3TRG1"
      footprint: "SOT23-5"
      confidence: "confirmed"
  candidates:
    - refdes: "J1"
      role: "USB-C connector/interface"
      part_value: "USB-C-16P"
      footprint: "USB_C_RECEPTACLE"
      status: "review_required_identity"
  generic_or_utility:
    - { refdes: "R1", value: "5.1k", package: "0603" }
    - { refdes: "R2", value: "5.1k", package: "0603" }
    - { refdes: "C1", value: "10uF", package: "0603" }
    - { refdes: "TP1", value: "TESTPOINT", package: "TP" }
  review_visible_no_connects:
    - { refdes: "U1", pin: "PA13", reason: "debug header omitted" }

extracted_nets:
  confirmed_explicit:
    - name: "VBUS"
      pins: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
    - name: "+3V3"
      global: true
      pins: ["U2.OUT", "U1.VDD", "C1.1"]
    - name: "GND"
      global: true
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
    - name: "USB_CC1"
      pins: ["J1.CC1", "R1.1"]
  not_inferred:
    - "USB_CC2 was not inferred from R2 because no explicit USB_CC2 net record is present."

connectors:
  confirmed: []
  review_required:
    - refdes: "J1"
      candidate_type: "USB-C receptacle"
      evidence: ["PartValue USB-C-16P", "package footprint USB_C_RECEPTACLE", "pins on VBUS/GND/USB_CC1"]
      missing_evidence: ["manufacturer", "manufacturer_part_number"]

power_summary:
  inputs:
    - net: "VBUS"
      evidence: ["PortInst VBUS_IN input", "J1 A4/B4", "U2 IN/EN", "TP1.1"]
  regulated_outputs:
    - net: "+3V3"
      source: "U2.OUT"
      loads: ["U1.VDD", "C1.1"]
  returns:
    - net: "GND"
      global: true
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]

open_questions:
  - severity: "review_required"
    item: "J1 identity"
    question: "Confirm manufacturer and MPN for USB-C connector."
  - severity: "review_required"
    item: "USB_CC2"
    question: "R2 is tied to GND on pin 2, but no explicit net connects R2 pin 1; do not assume CC2 without source evidence."
  - severity: "review_visible"
    item: "U1.PA13"
    question: "No-connect is intentional per excerpt reason; keep visible for downstream review."

provenance:
  source_type: "public_safe_synthetic_fixture"
  exp_xml_source_binding: "project_binding.synthetic_exp_xml_source"
  immutability: "source XML treated as read-only"
  package_use_policy: "Package records used only as library/cache context for referenced placed instances"
  privacy_boundary: "no raw real XML, runtime absolute paths, credentials, cookies, or private project state used"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  hints:
    placed_components: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    confirmed_identities: ["U1: STM32F030F4P6", "U2: AP2112K-3.3TRG1"]
    connector_review: ["J1"]
    power_nets: ["VBUS", "+3V3", "GND"]
    open_review_items: ["J1 manufacturer/MPN", "missing explicit USB_CC2", "U1.PA13 no-connect"]

readiness_note:
  status: "ready_for_downstream_with_review_items"
  summary: "Explicit net table and placed instances are sufficient for component-materials handoff. Connector identity and absent CC2 evidence remain review-required. No source mutation, file creation, command execution, browsing, or private inspection was performed or claimed."
```