```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.5"
    reasoning_effort: "medium"
    species: "elf"
    class: "administrator"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  export_version: "17.4"
  schematics: 1
  pages: 1
  page_titles:
    - page: "PAGE1"
      title: "USB power and controller"
  cache_packages: 3
  placed_instances: 7
  explicit_net_records: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    - refdes: "U1"
      role: "controller"
      manufacturer: "STMicroelectronics"
      mpn: "STM32F030F4P6"
      footprint: "TSSOP20"
      identity_basis: "recovered_from_referenced_package"
      confidence: "high"
    - refdes: "U2"
      role: "3V3 regulator"
      manufacturer: "Diodes Incorporated"
      mpn: "AP2112K-3.3TRG1"
      footprint: "SOT23-5"
      identity_basis: "direct_partinst_value_plus_package_properties"
      confidence: "high"
  candidate:
    - refdes: "J1"
      role: "USB-C receptacle/interface"
      part_value: "USB-C-16P"
      footprint: "USB_C_RECEPTACLE"
      identity_basis: "placed_instance_plus_package_footprint"
      confidence: "candidate"
  generic_or_utility:
    - { refdes: "R1", value: "5.1k", package: "0603" }
    - { refdes: "R2", value: "5.1k", package: "0603" }
    - { refdes: "C1", value: "10uF", package: "0603" }
    - { refdes: "TP1", value: "TESTPOINT", package: "TP" }
  review_visible_no_connect:
    - refdes: "U1"
      pin: "PA13"
      reason: "debug header omitted"

extracted_nets:
  confirmed_explicit:
    - name: "VBUS"
      pins: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
      port_evidence: [{ name: "VBUS_IN", direction: "input", page: "PAGE1" }]
    - name: "+3V3"
      pins: ["U2.OUT", "U1.VDD", "C1.1"]
      global_evidence: true
    - name: "GND"
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
      global_evidence: true
    - name: "USB_CC1"
      pins: ["J1.CC1", "R1.1"]
  not_inferred:
    - "No USB_CC2 net was created because no explicit USB_CC2 net record is present."

connectors:
  review_required:
    - refdes: "J1"
      candidate_type: "USB-C receptacle"
      footprint: "USB_C_RECEPTACLE"
      connected_nets: ["VBUS", "GND", "USB_CC1"]
      missing_confirmation: ["manufacturer", "manufacturer_part_number"]
      note: "Connector role is candidate only; not promoted to confirmed identity."

power_summary:
  inputs:
    - net: "VBUS"
      evidence: "explicit net plus VBUS_IN input port"
      loads_or_links: ["U2.IN", "U2.EN", "TP1.1", "J1.A4", "J1.B4"]
  generated_or_distributed:
    - net: "+3V3"
      evidence: "explicit global net"
      source_pin: "U2.OUT"
      loads_or_links: ["U1.VDD", "C1.1"]
  returns:
    - net: "GND"
      evidence: "explicit global net"
      pins: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]

open_questions:
  review_required:
    - "Confirm J1 manufacturer and manufacturer part number."
    - "Confirm whether R2 is intentionally only tied to GND or whether a missing explicit CC2 net/source excerpt is expected."
    - "Review U1 PA13 no-connect against debug/programming requirements."
  candidate_evidence:
    - "J1 appears to be the USB-C interface from value, footprint, and connected pins, but identity is not confirmed."
  no_inference_made:
    - "No missing nets, pin links, manufacturers, MPNs, or connector confirmations were inferred from names alone."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_type: "synthetic EXP.xml excerpt"
  boundaries:
    - "No real project XML used."
    - "No runtime absolute paths included."
    - "No credentials, cookies, account sessions, or private-state data used."
    - "Raw XML not embedded in output; only short identifiers and summarized facts retained."
  immutability: "source treated as read-only"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  hints:
    placed_components: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    confirmed_identities: ["U1: STM32F030F4P6", "U2: AP2112K-3.3TRG1"]
    connector_candidates: ["J1"]
    power_nets: ["VBUS", "+3V3", "GND"]
    signal_nets: ["USB_CC1"]
    review_items: ["J1 identity", "missing USB_CC2 evidence", "U1.PA13 no-connect"]

readiness_note:
  status: "ready_for_downstream_with_review_items"
  summary: "The packet preserves explicit net evidence, distinguishes placed instances from cache packages, recovers U1 identity only through its referenced package, and leaves connector/material ambiguities review-visible."
```