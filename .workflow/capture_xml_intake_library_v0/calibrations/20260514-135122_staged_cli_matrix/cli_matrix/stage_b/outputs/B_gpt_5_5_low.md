```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  model: "gpt-5.5"
  reasoning_effort: "low"
  species: "elf"
  class: "administrator"
  fixture_type: "public_safe_synthetic"

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
      identity_source: "direct PartInst value plus package properties"
      manufacturer: "Diodes Incorporated"
      mpn: "AP2112K-3.3TRG1"
      footprint: "SOT23-5"
      confidence: "confirmed"
  candidates:
    - refdes: "J1"
      role: "USB-C connector/interface"
      part_value: "USB-C-16P"
      footprint: "USB_C_RECEPTACLE"
      status: "review_required"
  generic_or_utility:
    - refdes: "R1"
      value: "5.1k"
      package: "0603"
    - refdes: "R2"
      value: "5.1k"
      package: "0603"
    - refdes: "C1"
      value: "10uF"
      package: "0603"
    - refdes: "TP1"
      value: "TESTPOINT"
      package: "TP"

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
  no_connect:
    - pin: "U1.PA13"
      reason: "debug header omitted"
      status: "review_visible"
  not_inferred:
    - "USB_CC2 was not created or inferred from R2 because no explicit net record is present."

connectors:
  review_required:
    - refdes: "J1"
      candidate_type: "USB-C receptacle"
      evidence: ["PartValue USB-C-16P", "package footprint USB_C_RECEPTACLE", "VBUS/GND/CC1 pin participation"]
      missing_evidence: ["manufacturer", "manufacturer part number"]

power_summary:
  inputs:
    - net: "VBUS"
      evidence: ["PortInst VBUS_IN input", "J1 A4/B4", "U2 IN/EN", "TP1.1"]
  regulated_outputs:
    - net: "+3V3"
      source_candidate: "U2.OUT"
      loads: ["U1.VDD", "C1.1"]
  returns:
    - net: "GND"
      evidence: ["global GND", "J1 A1/B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]

open_questions:
  review_required:
    - "Confirm J1 manufacturer and exact MPN."
    - "Confirm whether R2 should participate in a missing CC2 path; no explicit USB_CC2 net is present."
    - "Confirm U1 PA13 no-connect is intentional for production/debug policy."

provenance:
  source: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  evidence_boundary: "synthetic fixture only"
  raw_xml_embedded: false
  commands_run: false
  files_created_or_modified: false
  network_or_browser_used: false

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input: "original exp_xml_source identity"
  compact_hints:
    placed_components: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    confirmed_mpn_refs: ["U1: STM32F030F4P6", "U2: AP2112K-3.3TRG1"]
    connector_candidates: ["J1"]
    power_nets: ["VBUS", "+3V3", "GND"]
    open_questions_count: 3
  excludes: ["raw XML", "runtime absolute paths", "private project state"]

readiness_note:
  status: "ready_for_downstream_with_review_items"
  summary: "Explicit net table and placed-instance inventory are sufficient for component-materials intake. Connector identity and possible CC2 intent remain review-required."
```