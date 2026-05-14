```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  model: "gpt-5.4"
  reasoning_effort: "xhigh"
  species: "elf"
  class: "administrator"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  schematic_count: 1
  page_count: 1
  page_titles:
    - page: "PAGE1"
      title: "USB power and controller"
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  global_net_records:
    - "+3V3"
    - "GND"
  port_records:
    - name: "VBUS_IN"
      net: "VBUS"
      direction: "input"
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    - refdes: "U1"
      role: "microcontroller"
      identity: "STMicroelectronics STM32F030F4P6"
      identity_basis: "placed PartInst references package with manufacturer and MPN; instance PartValue is placeholder"
      confidence: "high_recovered"
    - refdes: "U2"
      role: "3.3V regulator"
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      identity_basis: "direct PartInst value plus package manufacturer/MPN"
      confidence: "high"
  candidate:
    - refdes: "J1"
      role: "USB-C receptacle/interface"
      identity_basis: "placed instance plus package footprint context only"
      confidence: "medium_functional"
  review_required:
    - refdes: "J1"
      reason: "no manufacturer or MPN evidence in placed/package data"
    - refdes: "R1"
      role: "generic resistor"
    - refdes: "R2"
      role: "generic resistor"
    - refdes: "C1"
      role: "generic capacitor"
    - refdes: "TP1"
      role: "generic testpoint"
    - refdes: "U1.PA13"
      role: "explicit no_connect"
      reason: "debug header omitted"

extracted_nets:
  confirmed:
    - net: "VBUS"
      pins: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
    - net: "+3V3"
      pins: ["U2.OUT", "U1.VDD", "C1.1"]
      attributes: ["global"]
    - net: "GND"
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
      attributes: ["global"]
    - net: "USB_CC1"
      pins: ["J1.CC1", "R1.1"]
  review_required:
    - item: "R2.1"
      reason: "no explicit net record present"
    - item: "USB_CC2"
      reason: "not present as an explicit net; not inferred"

connectors:
  confirmed:
    - port: "VBUS_IN"
      net: "VBUS"
      direction: "input"
  candidate:
    - refdes: "J1"
      connector_type: "USB-C receptacle"
      evidence: "refdes class and package footprint context"
  review_required:
    - refdes: "J1"
      reason: "connector function is likely, but sourced identity is incomplete"

power_summary:
  confirmed:
    - path: "VBUS -> U2.IN/U2.EN"
    - path: "U2.OUT -> +3V3 -> U1.VDD"
    - path: "GND -> J1/U2/U1/C1/R1/R2"
    - support_nodes:
        - "C1 on +3V3/GND"
        - "TP1 on VBUS"
  candidate: []
  review_required:
    - item: "enable strategy"
      reason: "U2.EN tied to VBUS is observed, but no further intent metadata is available"

open_questions:
  - "Should J1 be bound to a specific manufacturer/MPN, or remain a footprint-level connector entry?"
  - "Is R2 intended for a missing CC2 net or another function? Only pin 2 is explicitly on GND."
  - "Are additional MCU supply/decoupling pins omitted from the excerpt, or intentionally absent from this intake slice?"
  - "Should the explicit U1.PA13 no-connect be preserved as-is downstream, or reconciled against any later debug-access requirements?"

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_kind: "synthetic EXP.xml excerpt from fixture"
  source_policy: "read_only_preserve_source_xml"
  archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  evidence_scope:
    - "placed instance facts from PartInst"
    - "identity recovery from referenced Package only where needed"
    - "explicit nets/globals/ports/no-connect only"
  excluded:
    - "raw XML body"
    - "runtime absolute paths"
    - "private project state"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input:
    exp_xml_source: "project_binding.synthetic_exp_xml_source"
  hints:
    confirmed_components:
      - "U1 = STMicroelectronics STM32F030F4P6"
      - "U2 = Diodes Incorporated AP2112K-3.3TRG1"
    connector_candidates:
      - "J1 USB-C receptacle, identity incomplete"
    power_nets:
      - "VBUS"
      - "+3V3"
      - "GND"
    review_points:
      - "do not infer USB_CC2"
      - "preserve U1.PA13 no-connect"
      - "keep generic passives/utilities unpromoted"

readiness_note:
  status: "ready_with_review_points"
  rationale: "XML shape, placed instances, explicit nets, and two high-confidence component identities are sufficient for downstream component-material intake; connector identity and unresolved generic-net context remain review-visible."
```