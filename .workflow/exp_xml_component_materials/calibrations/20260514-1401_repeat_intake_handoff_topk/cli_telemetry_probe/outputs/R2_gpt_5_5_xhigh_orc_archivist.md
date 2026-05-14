## profile
```yaml
candidate_id: R2_gpt_5_5_xhigh_orc_archivist
workflow: exp_xml_component_materials
model: gpt-5.5
reasoning_effort: xhigh
species: orc
class: archivist
```

## intake_context_note
```yaml
authority:
  placed_inventory_source: EXP.xml PartInst rows
  downstream_handoff_role: context_only_priority_and_review_hints
  not_authoritative_for:
    - placed_components
    - component_identity
    - manufacturer
    - manufacturer_part_number
    - connectivity
notes:
  - Package metadata used only where referenced by a placed PartInst.
  - U1 identity recovered from referenced Package/SymbolUserProp because PartValue is placeholder Value.
  - J2 and U3 are downstream_handoff-only and absent from EXP PartInst inventory.
```

## component_inventory
```yaml
placed_components:
  - refdes: U1
    component_key: U1_LT3045EDD-1
    part_value: Value
    package: PKG_LT3045EDD_1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package_name: DFN-10
    pcb_footprint: LTC_DD_10
    identity_status: recovered_from_referenced_package_metadata
    materials_status: eligible_for_official_source_lookup

  - refdes: U2
    component_key: U2_MCP73831T-2ACI_OT
    part_value: MCP73831T-2ACI/OT
    package: SOT23-5
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    identity_status: confirmed_from_partinst_fields
    materials_status: eligible_for_official_source_lookup

  - refdes: R1
    component_key: R1_generic_10k_0603
    part_value: 10k
    package: "0603"
    identity_status: generic_passive_no_mpn
    materials_status: review_required

  - refdes: TP1
    component_key: TP1_TESTPOINT_TP
    part_value: TESTPOINT
    package: TP
    identity_status: symbolic_testpoint_no_mpn
    materials_status: review_required

  - refdes: J1
    component_key: J1_USB-C-16P_USB_C_RECEPTACLE
    part_value: USB-C-16P
    package: USB_C_RECEPTACLE
    manufacturer: null
    manufacturer_part_number: null
    identity_status: connector_identity_not_confirmed
    materials_status: review_required
```

## source_discovery_packet
```yaml
materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
sources:
  - refdes: U1
    component_key: U1_LT3045EDD-1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    official_sources_found:
      datasheets:
        - file_name: LT3045_datasheet.pdf
          source_type: official_datasheet
      eval_materials:
        - file_name: DC2222A_user_guide.pdf
          source_type: official_eval_user_guide
        - file_name: DC2222A_design_files.zip
          source_type: official_eval_design_files

  - refdes: U2
    component_key: U2_MCP73831T-2ACI_OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    official_sources_found:
      datasheets:
        - file_name: MCP73831_family_datasheet.pdf
          source_type: official_datasheet
      eval_materials: none_found

review_only_no_source_lookup:
  - R1_generic_10k_0603
  - TP1_TESTPOINT_TP
  - J1_USB-C-16P_USB_C_RECEPTACLE
```

## download_manifest
```yaml
downloads:
  - component_key: U1_LT3045EDD-1
    destination: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
    file_name: LT3045_datasheet.pdf
    source_class: official_datasheet
    download_status: completed_from_mock_official_catalog

  - component_key: U1_LT3045EDD-1
    destination: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
    file_name: DC2222A_user_guide.pdf
    source_class: official_eval_user_guide
    download_status: completed_from_mock_official_catalog

  - component_key: U1_LT3045EDD-1
    destination: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
    file_name: DC2222A_design_files.zip
    source_class: official_eval_design_files
    download_status: completed_from_mock_official_catalog

  - component_key: U2_MCP73831T-2ACI_OT
    destination: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
    file_name: MCP73831_family_datasheet.pdf
    source_class: official_datasheet
    download_status: completed_from_mock_official_catalog

eval_none_found:
  - component_key: U2_MCP73831T-2ACI_OT
    manufacturer_part_number: MCP73831T-2ACI/OT
```

## downloaded_file_checksum_manifest
```yaml
checksums:
  - file_name: LT3045_datasheet.pdf
    component_key: U1_LT3045EDD-1
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    verification_status: mocked_record_complete

  - file_name: DC2222A_user_guide.pdf
    component_key: U1_LT3045EDD-1
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    verification_status: mocked_record_complete

  - file_name: DC2222A_design_files.zip
    component_key: U1_LT3045EDD-1
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK
    verification_status: mocked_record_complete

  - file_name: MCP73831_family_datasheet.pdf
    component_key: U2_MCP73831T-2ACI_OT
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    verification_status: mocked_record_complete
```

## circuit_design_review_queue
```yaml
review_items:
  - id: review_R1_generic_passive
    severity: medium
    refdes: R1
    issue: Generic 10k 0603 passive has no manufacturer part number or tolerance/power/material details.
    required_resolution: Confirm passive specification and approved MPN if material package is required.

  - id: review_TP1_symbolic_testpoint
    severity: low
    refdes: TP1
    issue: Testpoint is symbolic/generic with no manufacturer part number.
    required_resolution: Confirm whether TP1 needs a purchasable testpoint MPN or remains PCB feature only.

  - id: review_J1_connector_identity
    severity: high
    refdes: J1
    issue: USB-C connector has empty manufacturer and no MPN; downstream_handoff explicitly says do not confirm identity/connectivity.
    required_resolution: Confirm connector manufacturer, MPN, footprint compatibility, and connectivity from authoritative schematic/BOM data.

  - id: review_J2_absent_from_exp
    severity: medium
    refdes: J2
    issue: Mentioned only in downstream_handoff and absent from EXP PartInst rows.
    required_resolution: Do not include in placed inventory unless added to authoritative EXP.xml.

  - id: review_U3_absent_from_exp
    severity: medium
    refdes: U3
    issue: Mentioned only in downstream_handoff and absent from EXP PartInst rows.
    required_resolution: Do not include in placed inventory unless added to authoritative EXP.xml.

  - id: review_connectivity_unconfirmed
    severity: high
    issue: Connectivity is not confirmed by materials discovery packet.
    required_resolution: Verify circuit topology and nets against authoritative EXP.xml connectivity before design approval.
```

## boundary_review_note
```yaml
boundary_status: respected
network_used: false
local_files_read: false
files_written: false
sources_used:
  - fixture_exp_partinst_summary
  - fixture_referenced_package_metadata
  - fixture_downstream_handoff_context
  - fixture_mock_official_catalog
forbidden_actions_avoided:
  - random_mirror_sources
  - url_only_download_completion
  - downstream_handoff_as_authoritative_identity
  - package_nodes_as_independent_placed_bom_lines
  - handoff_only_J2_U3_as_placed_components
```

## circuit_design_readiness_note
```yaml
readiness_status: materials_packet_ready_with_design_review_required
materials_ready:
  - U1 official datasheet and eval materials recorded with complete mocked checksums.
  - U2 official datasheet recorded with complete mocked checksum; eval materials none_found.
not_ready_for_design_release:
  - J1 connector identity and MPN unresolved.
  - R1 generic passive details unresolved.
  - TP1 purchasable identity unresolved if required.
  - J2 and U3 are not placed EXP inventory.
  - Connectivity and circuit topology remain unconfirmed by this materials workflow.
```