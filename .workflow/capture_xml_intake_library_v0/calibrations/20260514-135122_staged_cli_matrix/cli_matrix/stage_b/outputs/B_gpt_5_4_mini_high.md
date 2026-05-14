```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "high"
    species: "elf"
    class: "administrator"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  export_version: "17.4"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"

block_summary:
  confirmed:
    U1:
      identity: "STMicroelectronics STM32F030F4P6"
      basis: "placeholder PartInst value recovered from referenced package properties"
      confidence: "high"
    U2:
      identity: "Diodes Incorporated AP2112K-3.3TRG1"
      basis: "direct PartInst value plus package manufacturer evidence"
      confidence: "high"
  review_required:
    J1:
      identity: "USB-C receptacle candidate"
      basis: "connector/interface placement present, but no manufacturer or MPN evidence"
      confidence: "medium"
  utility_parts:
    R1: "5.1k resistor; generic utility part"
    R2: "5.1k resistor; generic utility part"
    C1: "10uF capacitor; generic utility part"
    TP1: "testpoint; utility part"
  notes:
    - "Package records treated as library/cache context only."
    - "Generic parts were not promoted to confirmed component identity."

extracted_nets:
  confirmed:
    VBUS:
      type: "explicit"
      members: ["J1.A4", "J1.B4", "U2.IN", "U2.EN", "TP1.1"]
    +3V3:
      type: "explicit/global"
      members: ["U2.OUT", "U1.VDD", "C1.1"]
    GND:
      type: "explicit/global"
      members: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
    USB_CC1:
      type: "explicit"
      members: ["J1.CC1", "R1.1"]
  review_required:
    U1_PA13:
      type: "no_connect"
      evidence: "debug header omitted"
  do_not_infer:
    - "Do not infer USB_CC2 from R2; no explicit USB_CC2 net is present."

connectors:
  confirmed_interfaces:
    - refdes: "J1"
      role: "USB-C receptacle interface"
      evidence: ["explicit connector placement", "USB-related pins on VBUS, GND, CC1"]
  external_ports:
    - name: "VBUS_IN"
      net: "VBUS"
      direction: "input"
      page: "PAGE1"
  review_required:
    - refdes: "J1"
      status: "connector identity not fully confirmed from package evidence"

power_summary:
  rails:
    VBUS:
      role: "external USB input"
      feeds: ["U2.IN", "U2.EN", "TP1.1"]
    +3V3:
      role: "regulated output"
      source: "U2.OUT"
      loads: ["U1.VDD", "C1.1"]
    GND:
      role: "common return"
      members: ["J1.A1", "J1.B1", "U2.GND", "U1.VSS", "C1.2", "R1.2", "R2.2"]
  topology: "USB VBUS -> AP2112K-3.3TRG1 -> +3V3"
  notes:
    - "Enable is tied to VBUS on U2."
    - "No explicit power-good or separate always-on rail is present in the excerpt."

open_questions:
  - "J1 lacks manufacturer/MPN evidence; connector confirmation remains review_required."
  - "No explicit USB_CC2 net is present; it must not be inferred."
  - "U1 function beyond recovered MCU identity is not evidenced by this excerpt."

provenance:
  source_kind: "synthetic EXP.xml excerpt"
  evidence_scope:
    confirmed: ["PartInst records", "Package properties", "explicit Net records", "Global records", "PortInst", "NoConnect"]
    candidate: ["package-backed identity recovery for U1", "connector class inference for J1"]
    excluded: ["raw XML storage", "runtime absolute paths", "private project truth", "mutations"]
  immutability: "source treated as read-only"
  boundary: "public-safe summary only"

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  hints:
    placed_components: ["U1", "U2", "J1", "R1", "R2", "C1", "TP1"]
    power_rails: ["VBUS", "+3V3", "GND"]
    connectors: ["J1"]
    review_required: ["J1 confirmation", "absence of USB_CC2"]
  constraints:
    - "Do not embed raw XML."
    - "Do not include runtime absolute paths."
    - "Preserve the original exp_xml_source identity."

readiness_note:
  status: "ready_for_downstream_intake"
  confidence: "high for shape and net extraction; medium for connector identity"
  blockers: "none for component-material intake"
  carry_forward: "review flags on J1 and missing USB_CC2"
```