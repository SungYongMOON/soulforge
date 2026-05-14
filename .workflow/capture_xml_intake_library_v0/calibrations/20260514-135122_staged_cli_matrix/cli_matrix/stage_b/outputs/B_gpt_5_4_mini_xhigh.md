```yaml
profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  profile:
    model: "gpt-5.4-mini"
    reasoning_effort: "xhigh"
    species: "elf"
    class: "administrator"
  source_policy: "read_only_preserve_source_xml"
  public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  intake_library_root: "_workspaces/<project_code>/intake/capture_xml"

xml_shape_summary:
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  export_version: "17.4"
  schematic_count: 1
  page_count: 1
  cache_package_count: 3
  cache_package_names:
    - "PKG_STM32F030F4P6"
    - "PKG_AP2112K_3V3"
    - "PKG_USB_C_16P"
  placed_instance_count: 7
  explicit_net_record_count: 4
  parser_mode: "explicit_net_table"
  page_titles:
    - "USB power and controller"

block_summary:
  confirmed:
    - refdes: "U1"
      kind: "MCU"
      identity: "STMicroelectronics STM32F030F4P6"
      identity_source: "package_props_recovery"
      evidence: "Placed instance references PKG_STM32F030F4P6; package-level Manufacturer and MPN recover identity; PartInst value is placeholder."
      confidence: "high"
    - refdes: "U2"
      kind: "LDO regulator"
      identity: "AP2112K-3.3TRG1"
      identity_source: "partinst_value_plus_package_props"
      evidence: "Direct PartInst value matches package-level Manufacturer, MPN, and footprint evidence."
      confidence: "high"
  candidate:
    - refdes: "J1"
      kind: "USB-C receptacle/interface"
      identity: "USB-C-16P"
      status: "review_required"
      evidence: "Placed instance value plus USB_C_RECEPTACLE footprint and explicit USB-related net membership."
      confidence: "medium"
  placed_utility:
    - refdes: "R1"
      kind: "resistor"
      evidence: "Placed utility part only; no identity promotion required."
    - refdes: "R2"
      kind: "resistor"
      evidence: "Placed utility part only; no identity promotion required."
    - refdes: "C1"
      kind: "capacitor"
      evidence: "Placed utility part only; no identity promotion required."
    - refdes: "TP1"
      kind: "testpoint"
      evidence: "Placed utility part only; no identity promotion required."

extracted_nets:
  - net: "VBUS"
    kind: "explicit"
    status: "confirmed"
    source_record: "Net"
    members:
      - "J1:A4"
      - "J1:B4"
      - "U2:IN"
      - "U2:EN"
      - "TP1:1"
    external_port:
      name: "VBUS_IN"
      direction: "input"
      page: "PAGE1"
  - net: "+3V3"
    kind: "explicit_global"
    status: "confirmed"
    source_record: "Net"
    members:
      - "U2:OUT"
      - "U1:VDD"
      - "C1:1"
  - net: "GND"
    kind: "explicit_global"
    status: "confirmed"
    source_record: "Net"
    members:
      - "J1:A1"
      - "J1:B1"
      - "U2:GND"
      - "U1:VSS"
      - "C1:2"
      - "R1:2"
      - "R2:2"
  - net: "USB_CC1"
    kind: "explicit"
    status: "confirmed"
    source_record: "Net"
    members:
      - "J1:CC1"
      - "R1:1"
    notes:
      - "Do not infer USB_CC2; no explicit net record is present."

connectors:
  confirmed: []
  candidate:
    - refdes: "J1"
      class: "USB-C receptacle/interface"
      status: "review_required"
      evidence: "Explicit USB power and CC membership plus connector-like footprint."
      missing: "Manufacturer and exact MPN confirmation"
  external_ports:
    - name: "VBUS_IN"
      net: "VBUS"
      direction: "input"
      page: "PAGE1"

power_summary:
  rails:
    - name: "VBUS"
      type: "input"
      evidence: "External port VBUS_IN and J1 VBUS pins."
      feeds:
        - "U2:IN"
        - "U2:EN"
        - "TP1:1"
    - name: "+3V3"
      type: "regulated output"
      evidence: "U2 OUT to U1 VDD and C1 pin 1."
      source: "U2"
    - name: "GND"
      type: "return"
      evidence: "Explicit global return net across connector, regulator, MCU, capacitor, and resistors."
  regulator:
    refdes: "U2"
    identity: "AP2112K-3.3TRG1"
    role: "3.3 V LDO"
  no_connects:
    - refdes: "U1"
      pin: "PA13"
      reason: "debug header omitted"

open_questions:
  - "J1 manufacturer and exact MPN are not recovered; keep the connector as review_required."
  - "USB_CC2 is absent from the explicit net table; do not infer it from R2 or pin naming alone."
  - "U2 EN is tied to VBUS in the explicit net record; confirm this enable topology is intentional."
  - "TP1 sits on VBUS; confirm whether it is a probe/test point or another access role."

provenance:
  source_kind: "synthetic_fixture"
  source_identity: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  evidence_boundary:
    confirmed: "Derived from PartInst, Net, PortInst, Global, and NoConnect records."
    identity_recovery: "Package-level properties were used only where placed-instance identity was weak."
    non_inference: "No net, connector, or manufacturer inference beyond explicit records; CC2 was not assumed."
  immutability_note: "No raw XML, runtime absolute path, or private project state is emitted."

downstream_handoff:
  target: "exp_xml_component_materials"
  required_input: "project_binding.synthetic_exp_xml_source"
  handoff_hints:
    placed_instances:
      - "U1"
      - "U2"
      - "J1"
      - "R1"
      - "R2"
      - "C1"
      - "TP1"
    explicit_nets:
      - "VBUS"
      - "+3V3"
      - "GND"
      - "USB_CC1"
    review_required:
      - "J1 identity"
      - "U1 PA13 no-connect"
      - "USB_CC2 absence"
    power_chain: "VBUS -> U2 -> +3V3 -> U1"
  exclusions:
    - "No raw XML"
    - "No runtime absolute paths"
    - "No private truth"

readiness_note:
  status: "ready_with_caveats"
  note: "Packet is complete for downstream component-materials extraction. Preserve explicit-net-only handling and keep J1 identity unresolved until more library evidence is available."
```