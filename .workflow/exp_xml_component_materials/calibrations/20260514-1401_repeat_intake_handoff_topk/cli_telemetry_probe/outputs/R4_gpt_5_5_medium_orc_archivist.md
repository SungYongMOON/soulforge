```yaml
profile:
  candidate_id: R4_gpt_5_5_medium_orc_archivist
  workflow: exp_xml_component_materials
  model: gpt-5.5
  reasoning_effort: medium
  species: orc
  class: archivist
```

```yaml
intake_context_note:
  status: accepted_public_safe_synthetic_fixture_only
  authority:
    placed_inventory: EXP.xml PartInst rows
    identity_mpn_connectivity: EXP.xml plus referenced package properties only
    downstream_handoff: context_only_priority_and_review_hints
  exclusions:
    - no_network
    - no_local_files
    - no_downloads
    - no_file_writes
    - no_real_project_data
  output_tree_contract:
    materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
    required_outputs:
      - intake_context_note.yaml
      - component_inventory.yaml
      - source_index.yaml
      - download_manifest.yaml
      - downloaded_file_checksum_manifest.yaml
      - circuit_design_review_queue.yaml
```

```yaml
component_inventory:
  placed_components:
    - refdes: U1
      component_key: U1_LT3045EDD-1
      part_value_from_partinst: Value
      package: PKG_LT3045EDD_1
      resolved_manufacturer: Analog Devices
      resolved_mpn: LT3045EDD-1
      resolved_from: Package.SymbolUserProp
      package_name: DFN-10
      pcb_footprint: LTC_DD_10
      inventory_status: placed_identity_recovered_from_referenced_package
      priority_hint: low_noise_ldo_candidate
    - refdes: U2
      component_key: U2_MCP73831T-2ACI_OT
      part_value_from_partinst: MCP73831T-2ACI/OT
      package: SOT23-5
      resolved_manufacturer: Microchip Technology
      resolved_mpn: MCP73831T-2ACI/OT
      resolved_from: PartInst
      inventory_status: placed_identity_confirmed_from_partinst
      priority_hint: battery_charger_candidate
    - refdes: R1
      component_key: R1_10k_0603
      part_value_from_partinst: 10k
      package: 0603
      resolved_manufacturer: null
      resolved_mpn: null
      inventory_status: placed_generic_passive_review_required
    - refdes: TP1
      component_key: TP1_TESTPOINT
      part_value_from_partinst: TESTPOINT
      package: TP
      resolved_manufacturer: null
      resolved_mpn: null
      inventory_status: placed_symbolic_review_required
    - refdes: J1
      component_key: J1_USB-C-16P
      part_value_from_partinst: USB-C-16P
      package: USB_C_RECEPTACLE
      resolved_manufacturer: null
      resolved_mpn: null
      inventory_status: placed_connector_mpn_missing_review_required
  not_placed_from_context_only:
    - refdes: J2
      reason: downstream_handoff_only_absent_from_exp
    - refdes: U3
      reason: downstream_handoff_only_absent_from_exp
```

```yaml
source_discovery_packet:
  source_policy: official_mock_catalog_only
  source_index:
    - component_key: U1_LT3045EDD-1
      refdes: U1
      manufacturer: Analog Devices
      mpn: LT3045EDD-1
      official_sources:
        datasheets:
          - filename: LT3045_datasheet.pdf
            source_type: official_datasheet
        eval_materials:
          - filename: DC2222A_user_guide.pdf
            source_type: official_eval_user_guide
          - filename: DC2222A_design_files.zip
            source_type: official_eval_design_files
      discovery_status: official_sources_found
    - component_key: U2_MCP73831T-2ACI_OT
      refdes: U2
      manufacturer: Microchip Technology
      mpn: MCP73831T-2ACI/OT
      official_sources:
        datasheets:
          - filename: MCP73831_family_datasheet.pdf
            source_type: official_datasheet
        eval_materials: []
      eval_status: none_found
      discovery_status: official_datasheet_found
    - component_key: R1_10k_0603
      refdes: R1
      discovery_status: skipped_generic_passive_no_mpn
    - component_key: TP1_TESTPOINT
      refdes: TP1
      discovery_status: skipped_symbolic_no_mpn
    - component_key: J1_USB-C-16P
      refdes: J1
      discovery_status: blocked_missing_manufacturer_and_mpn
```

```yaml
download_manifest:
  materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
  downloads:
    - component_key: U1_LT3045EDD-1
      destination: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
      filename: LT3045_datasheet.pdf
      source_type: official_datasheet
      completion_basis: mocked_record_has_byte_size_file_magic_sha256
      status: completed_from_fixture_record
    - component_key: U1_LT3045EDD-1
      destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
      filename: DC2222A_user_guide.pdf
      source_type: official_eval_user_guide
      completion_basis: mocked_record_has_byte_size_file_magic_sha256
      status: completed_from_fixture_record
    - component_key: U1_LT3045EDD-1
      destination: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
      filename: DC2222A_design_files.zip
      source_type: official_eval_design_files
      completion_basis: mocked_record_has_byte_size_file_magic_sha256
      status: completed_from_fixture_record
    - component_key: U2_MCP73831T-2ACI_OT
      destination: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
      filename: MCP73831_family_datasheet.pdf
      source_type: official_datasheet
      completion_basis: mocked_record_has_byte_size_file_magic_sha256
      status: completed_from_fixture_record
  none_found:
    - component_key: U2_MCP73831T-2ACI_OT
      material_class: EVAL
      reason: no_official_eval_materials_in_mock_catalog
  forbidden:
    - random_mirrors
    - url_only_completion
    - downstream_handoff_only_parts
```

```yaml
downloaded_file_checksum_manifest:
  files:
    - path: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
      sha256: "1111111111111111111111111111111111111111111111111111111111111111"
      byte_size: 1854321
      file_magic: "%PDF-"
      checksum_status: fixture_verified
    - path: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
      sha256: "2222222222222222222222222222222222222222222222222222222222222222"
      byte_size: 942210
      file_magic: "%PDF-"
      checksum_status: fixture_verified
    - path: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
      sha256: "3333333333333333333333333333333333333333333333333333333333333333"
      byte_size: 321004
      file_magic: PK
      checksum_status: fixture_verified
    - path: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
      sha256: "4444444444444444444444444444444444444444444444444444444444444444"
      byte_size: 1210330
      file_magic: "%PDF-"
      checksum_status: fixture_verified
```

```yaml
circuit_design_review_queue:
  review_items:
    - refdes: J1
      severity: high
      issue: USB-C connector manufacturer and MPN are missing in EXP PartInst
      constraint: downstream_handoff_connector_identity_do_not_confirm
      required_action: confirm exact connector identity from authoritative project source
    - refdes: R1
      severity: medium
      issue: generic 10k 0603 passive lacks manufacturer MPN tolerance rating and circuit role
      required_action: confirm passive configuration and requirements
    - refdes: TP1
      severity: low
      issue: symbolic testpoint has no sourcing identity
      required_action: decide whether procurement material is required
    - refdes: J2
      severity: medium
      issue: appears only in downstream_handoff and is absent from EXP placed inventory
      required_action: do not include as placed component unless EXP is updated
    - refdes: U3
      severity: medium
      issue: appears only in downstream_handoff and is absent from EXP placed inventory
      required_action: do not include as placed component unless EXP is updated
    - refdes: U1
      severity: medium
      issue: priority low-noise LDO candidate; identity recovered from package property but connectivity not confirmed
      required_action: review LT3045 application requirements against actual schematic connectivity
    - refdes: U2
      severity: medium
      issue: battery charger candidate; connectivity and configuration not confirmed by materials workflow
      required_action: review MCP73831 configuration pins and charging requirements against schematic
```

```yaml
boundary_review_note:
  observed_boundaries:
    - treated only EXP PartInst rows as placed components
    - used Package node only to recover U1 identity because U1 PartValue was placeholder
    - used downstream_handoff only for priority hints and review questions
    - did not promote J2 or U3 to placed inventory
    - did not confirm connector identity connectivity manufacturer or MPN from downstream_handoff
    - used only mocked official catalog records
    - counted only records with sha256 byte_size and file_magic as completed fixture downloads
```

```yaml
circuit_design_readiness_note:
  readiness: materials_packet_ready_with_open_design_questions
  ready_for:
    - datasheet_review_for_U1_LT3045EDD-1
    - datasheet_review_for_U2_MCP73831T-2ACI_OT
    - eval_material_review_for_U1_DC2222A
  not_ready_for:
    - confirmed_full_bom_release
    - connector_procurement_for_J1
    - connectivity_signoff
    - inclusion_of_J2_or_U3_as_EXP_placed_components
  blocking_open_questions:
    - J1 exact MPN and manufacturer
    - R1 passive tolerance power rating and role
    - whether TP1 needs a purchasable part identity
    - schematic connectivity and configuration for U1 and U2
```