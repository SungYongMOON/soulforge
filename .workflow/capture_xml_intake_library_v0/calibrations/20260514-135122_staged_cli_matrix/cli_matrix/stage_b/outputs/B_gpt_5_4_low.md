profile_metadata:
  calibration_id: "20260514-135122_staged_cli_matrix"
  workflow_id: "capture_xml_intake_library_v0"
  fixture_type: "public_safe_synthetic"
  assigned_profile:
    model: "gpt-5.4"
    reasoning_effort: "low"
    species: "elf"
    class: "administrator"

xml_shape_summary:
  source_kind: "synthetic EXP.xml excerpt"
  root_element: "CISExport"
  design_name: "SYNTH_USB_CTRL"
  schematics:
    count: 1
    names: ["MAIN"]
  pages:
    count: 1
    names: ["PAGE1"]
  parser_mode: "explicit_net_table"
  package_context_count: 3
  placed_instance_count: 7
  explicit_net_record_count: 4
  globals_present: ["+3V3", "GND"]
  no_connect_records: 1

block_summary:
  confirmed_components:
    - refdes: "U1"
      role: "microcontroller"
      identity:
        manufacturer: "STMicroelectronics"
        mpn: "STM32F030F4P6"
        confidence: "high_recovered_from_referenced_package"
    - refdes: "U2"
      role: "3.3V regulator"
      identity:
        manufacturer: "Diodes Incorporated"
        mpn: "AP2112K-3.3TRG1"
        confidence: "high_mixed_instance_and_package_evidence"
  candidate_components:
    - refdes: "J1"
      role: "USB connector/interface"
      identity:
        part_value: "USB-C-16P"
        package: "PKG_USB_C_16P"
        footprint: "USB_C_RECEPTACLE"
        confidence: "candidate_only"
  utility_instances:
    - "R1 5.1k"
    - "R2 5.1k"
    - "C1 10uF"
    - "TP1 TESTPOINT"
  review_required_observations:
    - "J1 lacks manufacturer and MPN evidence; connector identity remains unconfirmed."
    - "U1 pin PA13 is explicitly marked no-connect with reason debug header omitted."

extracted_nets:
  confirmed_nets:
    - name: "VBUS"
      members: ["J1:A4", "J1:B4", "U2:IN", "U2:EN", "TP1:1"]
      evidence: "explicit_net"
    - name: "+3V3"
      members: ["U2:OUT", "U1:VDD", "C1:1"]
      evidence: "explicit_net_and_global"
    - name: "GND"
      members: ["J1:A1", "J1:B1", "U2:GND", "U1:VSS", "C1:2", "R1:2", "R2:2"]
      evidence: "explicit_net_and_global"
    - name: "USB_CC1"
      members: ["J1:CC1", "R1:1"]
      evidence: "explicit_net"
  no_connects:
    - refdes: "U1"
      pin: "PA13"
      reason: "debug header omitted"
  not_inferred:
    - "No USB_CC2 net confirmed."
    - "R2 pin 1 has no explicit net in excerpt."

connectors:
  candidate_connectors:
    - refdes: "J1"
      type: "USB-C receptacle candidate"
      connected_pins_by_explicit_net:
        VBUS_side: ["A4", "B4"]
        GND_side: ["A1", "B1"]
        cc_side: ["CC1"]
      review_status: "review_required"
      reason: "footprint/value suggest connector role, but no manufacturer/MPN confirmation"
  test_access:
    - refdes: "TP1"
      role: "VBUS testpoint"
      evidence: "explicit VBUS net membership"

power_summary:
  confirmed_power_paths:
    - rail: "VBUS"
      path: "J1 -> U2(IN, EN) -> TP1"
    - rail: "+3V3"
      path: "U2(OUT) -> U1(VDD) -> C1"
    - rail: "GND"
      members: ["J1", "U2", "U1", "C1", "R1", "R2"]
  regulator_observation:
    - "U2 appears to generate +3V3 from VBUS based on explicit net membership."
  review_required:
    - "EN tied to VBUS is observed by explicit connectivity only; functional intent not further inferred."

open_questions:
  - "Is J1 exact connector MPN intentionally unresolved, or available elsewhere in project sources?"
  - "Is R2 pin 1 connected to an omitted explicit net such as USB_CC2, or intentionally left outside this excerpt?"
  - "Are additional MCU supply or support pins omitted from the excerpt and expected downstream?"
  - "Should PA13 no-connect be preserved as final design intent or revisited for debug/programming access?"

provenance:
  source_binding: "project_binding.synthetic_exp_xml_source"
  source_policy: "read_only_preserve_source_xml"
  archive_policy: "do_not_store_raw_real_xml_or_runtime_absolute_paths"
  evidence_boundary:
    confirmed: "explicit PartInst, Net, Global, NoConnect, and referenced Package properties"
    candidate: "role/identity hints from part value and package naming where direct confirmation is incomplete"
    excluded: "no private project state, no raw XML artifact emission, no inferred missing nets"

downstream_handoff:
  target_workflow: "exp_xml_component_materials"
  required_input_identity: "project_binding.synthetic_exp_xml_source"
  compact_hints:
    confirmed_components: ["U1 STM32F030F4P6", "U2 AP2112K-3.3TRG1"]
    candidate_connector: ["J1 USB-C-16P / USB_C_RECEPTACLE"]
    explicit_power_nets: ["VBUS", "+3V3", "GND"]
    explicit_signal_nets: ["USB_CC1"]
    review_items: ["J1 identity", "R2 pin1 unresolved", "U1 PA13 no-connect"]

readiness_note:
  status: "ready_for_downstream_with_review_flags"
  rationale: "XML shape is coherent and explicit net extraction is sufficient for component-materials intake, with connector identity and omitted-net questions preserved for review."