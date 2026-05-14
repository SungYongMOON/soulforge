```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  model: "gpt-5.4"
  reasoning_effort: "medium"
  species: "elf"
  class: "administrator"
  fixture_type: "public_safe_synthetic"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"

xml_shape_summary:
  root_element: "CISExport"
  parser_mode: "explicit_net_table"
  schematic_count: 1
  page_count: 1
  page_titles:
    - schematic: "MAIN"
      page: "PAGE1"
      title: "USB power and controller"
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  globals:
    - "+3V3"
    - "GND"
  no_connect_records: 1

block_summary:
  confirmed_components:
    - refdes: "U1"
      role: "microcontroller"
      recovered_identity:
        manufacturer: "STMicroelectronics"
        mpn: "STM32F030F4P6"
        footprint: "TSSOP20"
      evidence: "PartInst references PKG_STM32F030F4P6; package properties resolve placeholder PartValue"
      confidence: "high"
    - refdes: "U2"
      role: "3.3V regulator"
      identity:
        manufacturer: "Diodes Incorporated"
        mpn: "AP2112K-3.3TRG1"
        footprint: "SOT23-5"
      evidence: "Direct PartInst value plus referenced package properties"
      confidence: "high"
  candidate_components:
    - refdes: "J1"
      role: "USB-C receptacle/interface"
      package_context:
        footprint: "USB_C_RECEPTACLE"
      evidence: "Placed instance with package PKG_USB_C_16P"
      confidence: "medium"
  review_required_components:
    - refdes: "J1"
      reason: "No manufacturer or MPN evidence in package/instance properties"
    - refdes: "R1"
      reason: "Generic resistor only"
    - refdes: "R2"
      reason: "Generic resistor only"
    - refdes: "C1"
      reason: "Generic capacitor only"
    - refdes: "TP1"
      reason: "Utility/testpoint only"
  functional_summary: "Single-page USB-powered controller sheet with USB VBUS input, 3.3V regulation, MCU core rail, ground return, one explicit CC pull-down path, and one recorded no-connect."

extracted_nets:
  confirmed_nets:
    - name: "VBUS"
      type: "explicit"
      connections:
        - "J1.A4"
        - "J1.B4"
        - "U2.IN"
        - "U2.EN"
        - "TP1.1"
    - name: "+3V3"
      type: "explicit_global"
      connections:
        - "U2.OUT"
        - "U1.VDD"
        - "C1.1"
    - name: "GND"
      type: "explicit_global"
      connections:
        - "J1.A1"
        - "J1.B1"
        - "U2.GND"
        - "U1.VSS"
        - "C1.2"
        - "R1.2"
        - "R2.2"
    - name: "USB_CC1"
      type: "explicit"
      connections:
        - "J1.CC1"
        - "R1.1"
  no_connects:
    - pin: "U1.PA13"
      reason: "debug header omitted"
  not_inferred:
    - "No USB_CC2 net confirmed; R2 is not merged into CC2 without explicit net record"

connectors:
  confirmed: []
  candidate:
    - refdes: "J1"
      interface: "USB-C receptacle"
      connected_nets:
        - "VBUS"
        - "GND"
        - "USB_CC1"
      review_basis: "Connector role supported by refdes/value/package naming and explicit net usage, but identity is not manufacturer-confirmed"
    - refdes: "TP1"
      interface: "testpoint"
      connected_nets:
        - "VBUS"
      review_basis: "Utility connection only; not promoted to confirmed component identity"

power_summary:
  confirmed_power_paths:
    - rail: "VBUS"
      source_side: "J1"
      consumers_or_controls:
        - "U2.IN"
        - "U2.EN"
        - "TP1.1"
    - rail: "+3V3"
      source_side: "U2.OUT"
      consumers:
        - "U1.VDD"
        - "C1.1"
    - rail: "GND"
      members:
        - "J1.A1"
        - "J1.B1"
        - "U2.GND"
        - "U1.VSS"
        - "C1.2"
        - "R1.2"
        - "R2.2"
  candidate_observations:
    - "R1 appears to provide a CC1 pull-down to GND through explicit USB_CC1 and GND membership"
  review_required:
    - "R2 grounded terminal is present, but no explicit CC2 or other net is recorded for pin 1"
    - "No additional USB data, shield, or alternate power-path nets should be assumed from the excerpt"

open_questions:
  review_required:
    - "Should J1 connector identity be resolved from additional source evidence beyond footprint/package name?"
    - "Is R2 intended for USB_CC2 or another function? No explicit net record is present."
    - "Are there omitted USB data, shield, or programming/debug connectivity records outside this excerpt?"
    - "Should U1.PA13 no-connect remain intentional in downstream materials/context?"
  boundary_notes:
    - "Questions are limited to excerpt-derived gaps; no private project or runtime-state lookup assumed."

provenance:
  source_binding: "project_binding.synthetic_exp_xml_source"
  scenario: "public_safe_synthetic"
  evidence_scope: "synthetic EXP.xml excerpt only"
  handling_notes:
    - "Placed design evidence derived from PartInst nodes"
    - "Package nodes used as library/cache context only, except identity recovery for referenced placed instances"
    - "No raw XML, runtime absolute paths, or private-state material carried forward"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    confirmed_components:
      - "U1 -> STM32F030F4P6"
      - "U2 -> AP2112K-3.3TRG1"
    connector_candidates:
      - "J1 USB-C receptacle candidate"
      - "TP1 VBUS testpoint candidate"
    power_rails:
      - "VBUS"
      - "+3V3"
      - "GND"
    open_items:
      - "J1 manufacturer/MPN unresolved"
      - "R2 functional net unresolved"
      - "U1.PA13 recorded as no-connect"
  exclusions:
    - "No raw XML embedded"
    - "No runtime absolute paths"
    - "No inferred nets beyond explicit records"

readiness_note:
  status: "ready_with_review_items"
  rationale: "XML shape and explicit net extraction are sufficient for downstream component-material intake, with connector identity and one passive-net ambiguity preserved as review-required rather than inferred."
```