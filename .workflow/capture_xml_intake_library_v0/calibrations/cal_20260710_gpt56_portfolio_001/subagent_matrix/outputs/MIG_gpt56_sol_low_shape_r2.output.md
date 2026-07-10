asset_identity:
  asset_id: synthetic.capture_xml.SYNTH_USB_CTRL.v1
  asset_type: cadence_capture_exp_xml
  design_name: SYNTH_USB_CTRL
  version: 1
  source_binding: project_binding.synthetic_exp_xml_source
  source_role: first_class_read_only_baseline
  scope: synthetic_excerpt
  registration_status: fixture_derived_candidate
  identity_evidence:
    root_element: CISExport
    export_version: "17.4"
  mdd_attachment_state: absent_expected_later
  limitations:
    - No real project asset or runtime file identity is asserted.
    - Synthetic excerpt scope does not establish full-design or full-library completeness.

block_summary:
  input_scope: synthetic_excerpt
  parser_mode: explicit_net_table
  root_element: CISExport
  schema_marker:
    attribute: ExportVersion
    value: "17.4"
  counts:
    schematic_count: 1
    page_count: 1
    cache_package_count: 3
    placed_instance_count: 7
    explicit_occurrence_node_count: 0
    explicit_net_record_count: 4
  schematics:
    - name: MAIN
      pages:
        - name: PAGE1
          title: USB power and controller
  cache_packages:
    - package: PKG_STM32F030F4P6
      classification: library_context
      properties:
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        pcb_footprint: TSSOP20
    - package: PKG_AP2112K_3V3
      classification: library_context
      properties:
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        pcb_footprint: SOT23-5
    - package: PKG_USB_C_16P
      classification: library_context
      properties:
        pcb_footprint: USB_C_RECEPTACLE
        manufacturer: unknown
        manufacturer_part_number: unknown
  placed_instances:
    - refdes: U1
      package: PKG_STM32F030F4P6
      occurrence_path: /MAIN/PAGE1/U1
      source_part_value: Value
      identity:
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        derivation: referenced_package_symbol_properties
        confidence: high_recovered
      review_status: recovered_from_package
    - refdes: U2
      package: PKG_AP2112K_3V3
      occurrence_path: /MAIN/PAGE1/U2
      source_part_value: AP2112K-3.3TRG1
      identity:
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        derivation: part_value_and_referenced_package_properties
        confidence: high
      review_status: supported
    - refdes: J1
      package: PKG_USB_C_16P
      occurrence_path: /MAIN/PAGE1/J1
      source_part_value: USB-C-16P
      identity:
        manufacturer: unknown
        manufacturer_part_number: unknown
        derivation: generic_value_and_package_footprint
        confidence: insufficient_for_confirmed_identity
      review_status: review_required
    - refdes: R1
      package: "0603"
      occurrence_path: /MAIN/PAGE1/R1
      source_part_value: 5.1k
      identity_status: generic_part
    - refdes: R2
      package: "0603"
      occurrence_path: /MAIN/PAGE1/R2
      source_part_value: 5.1k
      identity_status: generic_part
    - refdes: C1
      package: "0603"
      occurrence_path: /MAIN/PAGE1/C1
      source_part_value: 10uF
      identity_status: generic_part
    - refdes: TP1
      package: TP
      occurrence_path: /MAIN/PAGE1/TP1
      source_part_value: TESTPOINT
      identity_status: utility_part
  ports:
    - name: VBUS_IN
      explicit_net: VBUS
      direction: input
      page: PAGE1
  scope_caveats:
    - Package records are library context and are not additional placed instances.
    - OccPath attributes are recorded, but no separate occurrence nodes are present.
    - Whole-export hierarchy, cache coverage, cross-page connectivity, and design completeness remain unconfirmed.

extracted_nets:
  confirmed_explicit:
    - name: VBUS
      evidence: explicit_net_record
      pins:
        - {refdes: J1, pin: A4}
        - {refdes: J1, pin: B4}
        - {refdes: U2, pin: IN}
        - {refdes: U2, pin: EN}
        - {refdes: TP1, pin: "1"}
      associated_ports:
        - VBUS_IN
    - name: +3V3
      evidence: explicit_net_record_and_global_symbol
      pins:
        - {refdes: U2, pin: OUT}
        - {refdes: U1, pin: VDD}
        - {refdes: C1, pin: "1"}
    - name: GND
      evidence: explicit_net_record_and_global_symbol
      pins:
        - {refdes: J1, pin: A1}
        - {refdes: J1, pin: B1}
        - {refdes: U2, pin: GND}
        - {refdes: U1, pin: VSS}
        - {refdes: C1, pin: "2"}
        - {refdes: R1, pin: "2"}
        - {refdes: R2, pin: "2"}
    - name: USB_CC1
      evidence: explicit_net_record
      pins:
        - {refdes: J1, pin: CC1}
        - {refdes: R1, pin: "1"}
  no_connect_observations:
    - refdes: U1
      pin: PA13
      reason: debug header omitted
      evidence: explicit_no_connect_record
      review_visibility: required
  review_required:
    - No USB_CC2 net or R2 pin-1 connection is explicit; none is inferred.
    - Connectivity outside the four explicit net records is unknown.
    - No pin merging or additional net naming is derived from component or pin names.

connectors:
  confirmed: []
  candidates:
    - refdes: J1
      candidate_type: USB_Type-C_receptacle
      evidence:
        - reference_designator_prefix: J
        - part_value: USB-C-16P
        - package_footprint: USB_C_RECEPTACLE
        - explicit_interface_pins:
            - A4
            - B4
            - A1
            - B1
            - CC1
      status: review_required
      confirmation_blockers:
        - Manufacturer is absent.
        - Manufacturer part number is absent.
        - Complete connector pinout and interface coverage are not present.
        - CC2 connectivity is not explicit.
  utility_interfaces:
    - refdes: TP1
      type: testpoint
      status: supported_by_part_value
      explicit_connection: VBUS

power_summary:
  confirmed_power_nets:
    - name: VBUS
      evidence: explicit_net_record
      observations:
        - J1 pins A4 and B4 connect to U2 IN.
        - U2 EN and TP1 pin 1 share this net.
    - name: +3V3
      evidence: explicit_net_record_and_global_symbol
      observations:
        - U2 OUT connects to U1 VDD and C1 pin 1.
  candidate_power_nets: []
  confirmed_ground_nets:
    - name: GND
      evidence: explicit_net_record_and_global_symbol
  candidate_ground_nets: []
  enable_or_uvlo_pins:
    - refdes: U2
      pin: EN
      explicit_net: VBUS
      status: confirmed_connection
  sense_or_feedback_pins: []
  no_connect_pins:
    - refdes: U1
      pin: PA13
      reason: debug header omitted
      status: explicit
  unresolved_power_questions:
    - Whether tying U2 EN directly to VBUS is intended requires owner or design review; no electrical verdict is asserted.
    - Input/output capacitor sufficiency, ratings, and regulator stability are outside the supplied structural evidence.
    - No complete USB-C power-entry or CC configuration can be established without explicit CC2 connectivity and full connector evidence.

open_questions:
  - id: OQ-001
    subject: J1 component identity
    owner_boundary: project_owner_or_component_materials_workflow
    question: What manufacturer and manufacturer part number identify J1?
    status: open
  - id: OQ-002
    subject: USB CC2 connectivity
    owner_boundary: schematic_owner
    question: Is a USB_CC2 connection intended for J1 and R2?
    status: open
    non_claim: No CC2 net or R2 pin-1 link is inferred.
  - id: OQ-003
    subject: excerpt completeness
    owner_boundary: source_provider
    question: Does the supplied synthetic excerpt represent a complete export or only a bounded fragment?
    status: open
  - id: OQ-004
    subject: U1 recovered identity
    owner_boundary: component_materials_reviewer
    question: Should U1's package-derived STM32F030F4P6 identity replace its placeholder PartValue in downstream material records?
    status: review_required
  - id: OQ-005
    subject: U1 PA13 no-connect intent
    owner_boundary: schematic_owner
    question: Is the explicit PA13 no-connect acceptable for the intended programming and debug strategy?
    status: open
  - id: OQ-006
    subject: regulator enable topology
    owner_boundary: electrical_design_owner
    question: Is the explicit U2 EN-to-VBUS connection intentional?
    status: open

pcb_pairing_placeholder:
  asset_id: synthetic.capture_xml.SYNTH_USB_CTRL.v1
  mdd_attachment:
    state: expected_later
    attachment_mode: none
    owner_assertion: absent
    pairing_confirmed: false
  follow_on_workflow:
    workflow_id: asset_patch_attach_mdd_v0
    expected_input: asset_identity
    optional_context_packet: pcb_pairing_placeholder
  stop_conditions:
    - Do not infer an XML/MDD pairing without an owner-supplied attachment assertion.
    - Do not embed raw MDD payloads in a public packet.

provenance:
  fixture_type: public_safe_synthetic
  calibration_id: 20260514-135122_staged_cli_matrix
  workflow_id: capture_xml_intake_library_v0
  input_scope: synthetic_excerpt
  source_file_identity: project_binding.synthetic_exp_xml_source
  source_file_sha256: unknown_not_supplied
  parser_mode: explicit_net_table
  created_at: unknown_not_runtime_derived
  tool_version_or_script_identity: not_applicable_contract_only_derivation
  source_mutation_check:
    status: not_assessed
    non_claim: No runtime source inspection or mutation verification is asserted.
  source_policy: read_only_preserve_source_xml
  raw_xml_embedded: false
  runtime_absolute_paths_embedded: false
  page_fragment_caveats:
    - The supplied material is explicitly an excerpt.
    - Full hierarchy, cache coverage, occurrence expansion, cross-page nets, and whole-design completeness are not established.
  evidence_boundary:
    confirmed: Limited to explicit synthetic fixture records and direct package-property references.
    candidates: Name-, value-, footprint-, or prefix-based classifications requiring review.
    excluded_claims:
      - runtime file existence
      - source hash verification
      - source immutability verification
      - local output creation
      - full-design completeness
      - real project applicability

downstream_handoff:
  workflow_id: exp_xml_component_materials
  required_input:
    exp_xml_source: project_binding.synthetic_exp_xml_source
  optional_context:
    asset_identity: synthetic.capture_xml.SYNTH_USB_CTRL.v1
    scope: synthetic_excerpt
    placed_component_hints:
      - refdes: U1
        manufacturer: STMicroelectronics
        manufacturer_part_number: STM32F030F4P6
        evidence: referenced_package_symbol_properties
        status: recovered_high_confidence
      - refdes: U2
        manufacturer: Diodes Incorporated
        manufacturer_part_number: AP2112K-3.3TRG1
        evidence: direct_part_value_and_package_properties
        status: supported
      - refdes: J1
        status: review_required
    connector_hints:
      - J1 is a USB Type-C receptacle candidate lacking manufacturer and MPN evidence.
    power_hints:
      - Explicit nets are VBUS, +3V3, GND, and USB_CC1.
      - U2 EN is explicitly connected to VBUS.
    open_question_ids:
      - OQ-001
      - OQ-002
      - OQ-003
      - OQ-004
      - OQ-005
      - OQ-006
  readiness:
    status: conditionally_ready_for_downstream_fixture_processing
    satisfied_conditions:
      - Asset identity is represented.
      - Placed instances are distinguished from cache packages.
      - Explicit nets and the no-connect observation are summarized.
      - MDD absence has an explicit later-attachment placeholder.
      - Confirmed observations and review-required items are separated.
    stop_conditions:
      - Stop if downstream processing requires real-file existence, hashes, or full-export completeness.
      - Stop before confirming J1 identity without component evidence.
      - Stop before adding USB_CC2 or any unlisted connectivity.
      - Stop before asserting XML/MDD pairing without owner-supplied attachment evidence.
    non_claims:
      - No downstream workflow execution is asserted.
      - No output files or runtime artifacts are asserted.
      - No source mutation, runtime validation, or private project inspection is asserted.
