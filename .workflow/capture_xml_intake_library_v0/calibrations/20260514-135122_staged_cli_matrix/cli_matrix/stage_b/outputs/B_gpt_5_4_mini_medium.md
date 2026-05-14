```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  model: "gpt-5.4-mini"
  reasoning_effort: "medium"
  species: "elf"
  class: "administrator"
  fixture_type: "public_safe_synthetic"
  source_policy: "read_only_preserve_source_xml"

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
      kind: "IC"
      identity: "STMicroelectronics STM32F030F4P6"
      evidence: "Recovered from referenced Package SymbolUserProp because PartInst value is placeholder."
      confidence: "high"
    - refdes: "U2"
      kind: "regulator"
      identity: "AP2112K-3.3TRG1"
      evidence: "Direct PartInst value plus matching package-level manufacturer context."
      confidence: "high"
    - refdes: "R1"
      kind: "resistor"
      identity: "5.1k"
      evidence: "Generic passive; no manufacturer identity promoted."
    - refdes: "R2"
      kind: "resistor"
      identity: "5.1k"
      evidence: "Generic passive; no manufacturer identity promoted."
    - refdes: "C1"
      kind: "capacitor"
      identity: "10uF"
      evidence: "Generic passive; no manufacturer identity promoted."
    - refdes: "TP1"
      kind: "testpoint"
      identity: "TESTPOINT"
      evidence: "Utility part; no library identity promoted."
  review_required:
    - refdes: "J1"
      kind: "connector/interface"
      identity: "USB-C-16P"
      evidence: "Placed instance exists, but manufacturer and MPN are not present in the excerpt."
      confidence: "candidate"

extracted_nets:
  - name: "VBUS"
    status: "explicit"
    pins:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
    notes: "Use as the explicit USB input/power-enable net."
  - name: "+3V3"
    status: "explicit_global"
    pins:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
    notes: "Explicit regulated rail."
  - name: "GND"
    status: "explicit_global"
    pins:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
    notes: "Explicit return rail."
  - name: "USB_CC1"
    status: "explicit"
    pins:
      - "J1.CC1"
      - "R1.1"
    notes: "Do not infer CC2; no explicit USB_CC2 net is present."

connectors:
  confirmed: []
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle"
      evidence: "Placed connector instance with explicit CC1, VBUS, and GND connectivity."
      missing_identity: ["manufacturer", "MPN"]
      confidence: "candidate"

power_summary:
  inputs:
    - net: "VBUS"
      role: "external USB power input"
      endpoints: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
  regulated_rails:
    - net: "+3V3"
      role: "regulated 3.3 V rail"
      endpoints: ["U2.OUT", "U1.VDD", "C1.1"]
  returns:
    - net: "GND"
      role: "ground"
      endpoints: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
  observations:
    - "U2 appears to gate and regulate USB VBUS to +3V3."
    - "No inferred rails or hidden power nets were added."

open_questions:
  - "J1 lacks manufacturer and MPN evidence, so connector identity remains review_required."
  - "USB_CC2 is not explicit; do not infer a second configuration-channel termination from R2."
  - "R1, R2, C1, and TP1 are utility parts only; no promoted component identity is available from the excerpt."
  - "U1 PA13 is explicitly no-connect and should remain visible as a review note, not a connected net."

provenance:
  source_binding: "project_binding.synthetic_exp_xml_source"
  intake_root_policy: "_workspaces/<project_code>/intake/capture_xml"
  evidence_mode: "public_safe_synthetic_excerpt_only"
  immutability_note: "Source is treated as read-only; no mutation or raw XML archival is implied."
  recovery_rules_used:
    - "PartInst records were treated as placed design instances."
    - "Package records were treated as library/cache context only."
    - "Package-level properties were used to recover U1 identity because the instance value was placeholder."
    - "Explicit net records were preserved without pin-name inference."

downstream_handoff:
  next_step: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  carry_forward:
    - "placed-component identities"
    - "explicit nets"
    - "power-summary hints"
    - "connector review state"
    - "U1 recovered identity evidence"
  exclusions:
    - "raw XML"
    - "runtime absolute paths"
    - "private project truth"
    - "inferred nets"

readiness_note:
  status: "ready_for_downstream_handoff"
  blocking_items: ["J1 identity review", "no CC2 inference permitted"]
  summary: "Intake packet is complete for the explicit-net, placed-instance scope and is suitable for exp_xml_component_materials."
```