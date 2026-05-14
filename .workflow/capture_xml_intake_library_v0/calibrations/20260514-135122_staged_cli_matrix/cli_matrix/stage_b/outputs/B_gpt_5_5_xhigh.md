```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  profile:
    model: "gpt-5.5"
    reasoning_effort: "xhigh"
    species: "elf"
    class: "administrator"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed_components:
    - refdes: "U1"
      identity: "STMicroelectronics STM32F030F4P6"
      evidence: "Recovered from referenced package properties because PartInst value is placeholder."
      confidence: "high"
    - refdes: "U2"
      identity: "AP2112K-3.3TRG1"
      manufacturer: "Diodes Incorporated"
      evidence: "Direct PartInst value plus referenced package properties."
      confidence: "high"
  generic_or_utility_instances:
    - "R1: 5.1k, 0603"
    - "R2: 5.1k, 0603"
    - "C1: 10uF, 0603"
    - "TP1: TESTPOINT"
  review_required:
    - refdes: "J1"
      value: "USB-C-16P"
      reason: "Connector/interface candidate lacks manufacturer and MPN evidence."

extracted_nets:
  confirmed:
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
  review_visible_no_connects:
    - pin: "U1.PA13"
      reason: "debug header omitted"
  not_inferred:
    - "USB_CC2 not created; no explicit net record is present."

connectors:
  candidates:
    - refdes: "J1"
      value: "USB-C-16P"
      footprint: "USB_C_RECEPTACLE"
      connected_nets: ["VBUS", "GND", "USB_CC1"]
      status: "review_required"
      reason: "No manufacturer or MPN evidence."

power_summary:
  inputs:
    - net: "VBUS"
      source_hint: "Port VBUS_IN and USB connector pins J1.A4/J1.B4"
      loads: ["U2.IN", "U2.EN", "TP1.1"]
  rails:
    - net: "+3V3"
      source_hint: "U2.OUT"
      loads: ["U1.VDD", "C1.1"]
  returns:
    - net: "GND"
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]

open_questions:
  - "Confirm J1 manufacturer and exact MPN."
  - "Confirm whether R2 is intended for USB CC2; no explicit USB_CC2 net exists in the fixture."
  - "Review U1.PA13 no-connect against debug/programming requirements."
  - "Confirm generic passives and testpoint values/footprints are acceptable for downstream BOM handling."

provenance:
  source: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  evidence_boundary: "Synthetic excerpt only; no private project XML, runtime paths, credentials, or external inspection used."

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  hints:
    placed_instances: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    confirmed_nets: ["VBUS", "+3V3", "GND", "USB_CC1"]
    connector_review: ["J1"]
    no_connects: ["U1.PA13"]

readiness_note:
  status: "ready_for_downstream_with_review_items"
  summary: "Explicit nets and placed instances are captured. U1 and U2 have usable identity evidence; J1 and possible CC2 intent require review before component-material finalization."
```