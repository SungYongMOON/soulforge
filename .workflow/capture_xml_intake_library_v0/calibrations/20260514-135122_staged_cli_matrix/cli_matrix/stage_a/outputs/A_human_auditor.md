1. `profile_metadata`
```yaml
calibration_id: "20260514-135122_staged_cli_matrix"
workflow_id: "capture_xml_intake_library_v0"
fixture_type: "public_safe_synthetic"
assigned_profile:
  model: "gpt-5.4-mini"
  reasoning_effort: "low"
  species: "human"
  class: "auditor"
source_policy: "read_only_preserve_source_xml"
public_archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
```

2. `xml_shape_summary`
```yaml
root_element: "CISExport"
schematic_count: 1
page_count: 1
cache_package_count: 3
placed_instance_count: 7
explicit_net_record_count: 4
parser_mode: "explicit_net_table"
notes:
  - "One schematic page only."
  - "Packages are cache/library context; placed PartInst records drive intake."
```

3. `block_summary`
```yaml
confirmed:
  - refdes: "U1"
    role: "MCU / controller"
    identity: "STMicroelectronics STM32F030F4P6"
    confidence: "high"
    evidence: ["PartInst references PKG_STM32F030F4P6", "Package props include manufacturer and MPN"]
  - refdes: "U2"
    role: "LDO regulator"
    identity: "Diodes Incorporated AP2112K-3.3TRG1"
    confidence: "high"
    evidence: ["PartInst PartValue matches package MPN", "Package props include manufacturer and MPN"]
review_required:
  - refdes: "J1"
    role: "USB-C receptacle / interface"
    identity: "connector candidate"
    confidence: "medium"
    evidence: ["Placed instance exists", "USB-related nets and footprint context present"]
    note: "No manufacturer or MPN evidence in package props."
generic_or_utility:
  - refdes: "R1"
    role: "resistor"
  - refdes: "R2"
    role: "resistor"
  - refdes: "C1"
    role: "capacitor"
  - refdes: "TP1"
    role: "testpoint"
```

4. `extracted_nets`
```yaml
confirmed:
  - name: "VBUS"
    kind: "explicit"
    connections:
      - "J1.A4"
      - "J1.B4"
      - "U2.IN"
      - "U2.EN"
      - "TP1.1"
  - name: "+3V3"
    kind: "explicit_global"
    connections:
      - "U2.OUT"
      - "U1.VDD"
      - "C1.1"
  - name: "GND"
    kind: "explicit_global"
    connections:
      - "J1.A1"
      - "J1.B1"
      - "U2.GND"
      - "U1.VSS"
      - "C1.2"
      - "R1.2"
      - "R2.2"
  - name: "USB_CC1"
    kind: "explicit"
    connections:
      - "J1.CC1"
      - "R1.1"
review_required:
  - name: "U1.PA13"
    kind: "no_connect"
    evidence: "debug header omitted"
not_inferred:
  - "USB_CC2"
```

5. `connectors`
```yaml
confirmed:
  - refdes: "J1"
    type: "USB-C receptacle"
    evidence_level: "candidate"
    notes:
      - "Interface connector on VBUS/GND/CC1 nets."
      - "Do not over-confirm manufacturer/MPN from footprint alone."
ports:
  - name: "VBUS_IN"
    net: "VBUS"
    direction: "input"
    page: "PAGE1"
```

6. `power_summary`
```yaml
rails:
  - net: "VBUS"
    class: "input power"
    role: "USB power entry"
  - net: "+3V3"
    class: "regulated power"
    role: "LDO output feeding MCU and local capacitance"
  - net: "GND"
    class: "ground"
regulation_chain:
  - "VBUS -> U2.IN"
  - "VBUS -> U2.EN"
  - "U2.OUT -> +3V3"
load_notes:
  - "U1 powered from +3V3."
  - "C1 is tied between +3V3 and GND."
  - "TP1 is on VBUS."
```

7. `open_questions`
```yaml
- "J1 connector identity remains review_required because package context lacks manufacturer and MPN."
- "USB_CC2 is not present as an explicit net; do not infer it from R2."
- "R1, R2, C1, and TP1 are utility parts only; no identity promotion requested."
- "No further functional blocks are explicit in this excerpt beyond power, USB interface, and MCU."
```

8. `provenance`
```yaml
source_identity: "project_binding.synthetic_exp_xml_source"
material_scope: "synthetic excerpt only"
immutability: "source summarized without mutation"
evidence_policy:
  - "PartInst records treated as placed instances."
  - "Package records treated as cache/library context only."
  - "Identity recovered from package properties only when instance identity was weak."
boundary_notes:
  - "No raw XML copied into output."
  - "No runtime absolute paths included."
```

9. `downstream_handoff`
```yaml
next_stage: "exp_xml_component_materials"
required_input: "project_binding.synthetic_exp_xml_source"
handoff_hints:
  - "placed_components: U1, U2, J1, R1, R2, C1, TP1"
  - "power_nets: VBUS, +3V3, GND"
  - "connector_candidate: J1"
  - "open_questions: J1 identity, USB_CC2 absence, U1 no-connect visibility"
constraints:
  - "Do not embed raw XML."
  - "Do not add inferred nets or unverified pin links."
```

10. `readiness_note`
```yaml
status: "ready"
confidence: "high"
rationale:
  - "XML shape is explicit and small."
  - "Power and net extraction are complete for the excerpt."
  - "Component identity is confirmed where evidence is sufficient and left open where it is not."
limitations:
  - "Connector identity remains partial."
  - "No inferred nets were promoted."
```