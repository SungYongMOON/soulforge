profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  parser_mode: "explicit_net_table"

xml_shape_summary:
  root_element: "CISExport"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4

block_summary:
  confirmed:
    - refdes: "U1"
      role: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      confidence: "high"
      basis: ["PartInst package reference", "package manufacturer prop", "package MPN prop", "placeholder PartValue recovered"]
    - refdes: "U2"
      role: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      confidence: "high"
      basis: ["PartInst PartValue", "package manufacturer prop", "package MPN prop"]
  review_required:
    - refdes: "J1"
      role: "USB-C receptacle / interface connector"
      identity: "USB-C-16P"
      confidence: "candidate"
      basis: ["PartInst PartValue", "connector-like package", "no manufacturer/MPN evidence"]
    - refdes: "R1"
      role: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "R2"
      role: "resistor"
      identity: "5.1k"
      confidence: "generic"
    - refdes: "C1"
      role: "capacitor"
      identity: "10uF"
      confidence: "generic"
    - refdes: "TP1"
      role: "testpoint"
      identity: "TESTPOINT"
      confidence: "generic"

extracted_nets:
  - name: "VBUS"
    type: "explicit"
    members:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
  - name: "+3V3"
    type: "explicit_global"
    members:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
  - name: "GND"
    type: "explicit_global"
    members:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
  - name: "USB_CC1"
    type: "explicit"
    members:
      - "J1.CC1"
      - "R1.1"
  - name: "U1.PA13"
    type: "no_connect"
    members:
      - "U1.PA13"
    note: "debug header omitted"

connectors:
  confirmed:
    - refdes: "J1"
      kind: "USB-C receptacle"
      status: "review_required"
      evidence: ["placed instance", "USB-related net membership"]
      missing: ["manufacturer", "MPN"]
  port_inference:
    - name: "VBUS_IN"
      net: "VBUS"
      direction: "input"
      status: "confirmed"

power_summary:
  rails:
    - net: "VBUS"
      role: "input power"
      consumers: ["U2.IN", "U2.EN", "TP1.1"]
      source_side: ["J1.A4", "J1.B4"]
    - net: "+3V3"
      role: "regulated 3.3 V rail"
      drivers: ["U2.OUT"]
      loads: ["U1.VDD", "C1.1"]
    - net: "GND"
      role: "ground"
      members: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
  notes:
    - "VBUS is the only explicit input power net."
    - "USB_CC1 is present as a USB configuration channel, not a power rail."
    - "Do not infer CC2; it is not explicitly present."

open_questions:
  - "J1 is connector-like but lacks manufacturer and part-number evidence; keep as candidate until library identity is verified."
  - "R1 and R2 are both 5.1k and tied to ground/CC1 context; function is plausible but not asserted beyond explicit net membership."
  - "C1 is a 10uF capacitor on +3V3/GND, but package class is generic; no further identity promotion."
  - "TP1 is a testpoint on VBUS; no additional classification should be inferred."
  - "No explicit USB_CC2 net is present; do not derive one from R2."

provenance:
  source_policy: "read_only_preserve_source_xml"
  source_identity: "project_binding.synthetic_exp_xml_source"
  evidence_basis:
    - "placed instance records (PartInst)"
    - "package-level manufacturer/MPN props where available"
    - "explicit net table"
    - "no-connect record"
  boundary_notes:
    - "Package records treated as library/cache context only unless tied to a placed instance."
    - "No raw XML, runtime path, credentials, or private project truth included."

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  include_hints:
    - "placed components"
    - "connector candidate"
    - "power rails"
    - "no-connect evidence"
    - "review_required observations"
  exclusions:
    - "raw XML"
    - "runtime absolute paths"
    - "private state"

readiness_note:
  status: "ready_for_downstream_materials_step"
  rationale: "Shape, placed-instance inventory, explicit nets, and review boundaries are all recoverable from the fixture without inference beyond the stated evidence."
