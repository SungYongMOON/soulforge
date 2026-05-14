profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "low"
    species: "elf"
    class: "auditor"

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
      evidence: ["placed PartInst", "placeholder PartValue", "package-level Manufacturer and MPN"]
      confidence: "high"
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      evidence: ["placed PartInst", "direct PartValue", "package-level Manufacturer and MPN"]
      confidence: "high"
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle"
      identity: "interface candidate only"
      evidence: ["placed PartInst", "USB-C-16P value", "connector-like package"]
      confidence: "medium"
    - refdes: "R1"
      role: "resistor"
      identity: "generic utility part"
      evidence: ["placed PartInst", "5.1k value", "0603 package"]
      confidence: "low"
    - refdes: "R2"
      role: "resistor"
      identity: "generic utility part"
      evidence: ["placed PartInst", "5.1k value", "0603 package"]
      confidence: "low"
    - refdes: "C1"
      role: "capacitor"
      identity: "generic utility part"
      evidence: ["placed PartInst", "10uF value", "0603 package"]
      confidence: "low"
    - refdes: "TP1"
      role: "testpoint"
      identity: "generic utility part"
      evidence: ["placed PartInst", "TESTPOINT value", "TP package"]
      confidence: "low"
  package_cache_only:
    - package: "PKG_STM32F030F4P6"
      note: "library/cache context, not a placed instance"
    - package: "PKG_AP2112K_3V3"
      note: "library/cache context, not a placed instance"
    - package: "PKG_USB_C_16P"
      note: "library/cache context, not a placed instance"

extracted_nets:
  confirmed:
    - name: "VBUS"
      kind: "explicit"
      pins:
        - "J1 A4"
        - "J1 B4"
        - "U2 IN"
        - "U2 EN"
        - "TP1 1"
    - name: "+3V3"
      kind: "explicit global"
      pins:
        - "U2 OUT"
        - "U1 VDD"
        - "C1 1"
    - name: "GND"
      kind: "explicit global"
      pins:
        - "J1 A1"
        - "J1 B1"
        - "U2 GND"
        - "U1 VSS"
        - "C1 2"
        - "R1 2"
        - "R2 2"
    - name: "USB_CC1"
      kind: "explicit"
      pins:
        - "J1 CC1"
        - "R1 1"
  review_required:
    - note: "Do not infer USB_CC2 from R2; no explicit net record is present."
    - note: "Do not infer additional MCU signal nets from absent connectivity."

connectors:
  confirmed:
    - refdes: "J1"
      type: "USB-C receptacle"
      evidence: ["explicit pins on VBUS, GND, USB_CC1", "placed instance"]
      confidence: "medium"
  review_required:
    - refdes: "J1"
      note: "Manufacturer and MPN are not present; connector identity remains partially inferred from value/package context only."
    - refdes: "TP1"
      note: "Not a user-facing connector; utility testpoint only."

power_summary:
  rails:
    - name: "VBUS"
      source: "J1"
      consumers: ["U2 IN", "U2 EN", "TP1"]
      status: "explicit"
    - name: "+3V3"
      source: "U2 OUT"
      consumers: ["U1 VDD", "C1 1"]
      status: "explicit/global"
    - name: "GND"
      source: "system ground"
      consumers: ["J1", "U2", "U1", "C1", "R1", "R2"]
      status: "explicit/global"
  observations:
    - "U2 is the power-regulation boundary between VBUS and +3V3."
    - "VBUS is tied to U2 EN, so enable appears power-derived rather than separately driven."
    - "C1 is on +3V3 to GND and likely serves rail decoupling."

open_questions:
  - "J1 connector identity is review_required because no manufacturer or MPN evidence is present."
  - "R1 and R2 are both 5.1k on GND/CC1 context, but only USB_CC1 is explicitly declared; CC2 must not be inferred."
  - "U1 is confidently recovered from package context, but any deeper MCU pin-role mapping is outside intake scope."
  - "TP1 function is not specified beyond testpoint placement on VBUS."

provenance:
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  evidence_basis:
    - "Placed instances were taken from PartInst records only."
    - "Package-level properties were used only to recover U1 identity where PartInst identity was weak."
    - "Explicit net records were preserved as authoritative connectivity."
  separation_notes:
    - "Package nodes are treated as cache/library context unless tied to a placed instance."
    - "No runtime truth, filesystem paths, credentials, or raw XML are embedded."

downstream_handoff:
  next_step: "exp_xml_component_materials"
  handoff_payload:
    exp_xml_source: "project_binding.synthetic_exp_xml_source"
    placed_components: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    confirmed_nets: ["VBUS", "+3V3", "GND", "USB_CC1"]
    review_required: ["J1 identity", "no-connect visibility for U1 PA13", "CC2 non-inference"]
    power_boundary: ["VBUS -> U2 -> +3V3"]
  restrictions:
    - "No raw XML"
    - "No absolute runtime paths"
    - "No private project truth"

readiness_note:
  status: "ready_for_downstream_materials_intake"
  rationale:
    - "Shape is simple and fully explicit."
    - "Core rails and placements are recovered with clear evidence separation."
    - "Only connector identity and non-explicit side observations remain review_required."