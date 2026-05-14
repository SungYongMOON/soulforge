**profile**
```yaml
candidate_id: R5_gpt_5_4_mini_medium_orc_archivist
workflow: exp_xml_component_materials
assigned_profile:
  model: gpt-5.4-mini
  reasoning_effort: medium
  species: orc
  class: archivist
mode: public_safe_synthetic_fixture
```

**intake_context_note**
```yaml
authoritative_source: EXP.xml
boundary_rules:
  - Treat PartInst rows as placed components.
  - Do not treat Package nodes or downstream_handoff entries alone as placed BOM lines.
  - Use downstream_handoff only as priority hints and review questions.
  - Do not confirm identity, connectivity, manufacturer, or MPN from downstream_handoff.
  - No network, local files, downloads, browser, or commands were used.
context_summary:
  - U1 identity is recovered only from referenced Package/SymbolUserProp because PartValue is placeholder Value.
  - U2 is a placed battery charger with explicit manufacturer and MPN.
  - R1, TP1, and J1 are placed but partially or fully unresolved for materials review.
  - J2 and U3 appear only in downstream_handoff and are not placed components in EXP.xml.
```

**component_inventory**
```yaml
placed_components:
  - component_key: U1
    part_value: Value
    package: PKG_LT3045EDD_1
    recovered_identity:
      manufacturer: Analog Devices
      manufacturer_part_number: LT3045EDD-1
      package_name: DFN-10
      pcb_footprint: LTC_DD_10
    classification: low_noise_ldo_candidate
    status: confirmed_from_package_metadata

  - component_key: U2
    part_value: MCP73831T-2ACI/OT
    package: SOT23-5
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    classification: battery_charger
    status: confirmed_from_partinst

  - component_key: R1
    part_value: 10k
    package: 0603
    classification: generic_passive
    status: review_needed
    review_reason: passive configuration and circuit role are not established by fixture evidence

  - component_key: TP1
    part_value: TESTPOINT
    package: TP
    classification: testpoint
    status: review_needed
    review_reason: symbolic/test access part, not a materials-confirmed functional component

  - component_key: J1
    part_value: USB-C-16P
    package: USB_C_RECEPTACLE
    manufacturer: ""
    classification: connector
    status: review_needed
    review_reason: manufacturer and MPN are missing in EXP.xml
unplaced_context_only:
  - component_key: J2
    source: downstream_handoff
    status: not_in_exp_xml
  - component_key: U3
    source: downstream_handoff
    status: not_in_exp_xml
```

**source_discovery_packet**
```yaml
materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
official_sources_only: true
source_index:
  - component_key: U1
    source_type: official_datasheet
    title: LT3045_datasheet.pdf
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    status: available
  - component_key: U1
    source_type: official_eval_material
    title: DC2222A_user_guide.pdf
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    status: available
  - component_key: U1
    source_type: official_design_files
    title: DC2222A_design_files.zip
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    status: available
  - component_key: U2
    source_type: official_datasheet
    title: MCP73831_family_datasheet.pdf
    manufacturer: Microchip Technology
    mpn: MCP73831T-2ACI/OT
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    status: available
  - component_key: U2
    source_type: official_eval_material
    status: none_found
```

**download_manifest**
```yaml
contract_paths:
  intake_context_note: intake_context_note.yaml
  component_inventory: component_inventory.yaml
  source_index: source_index.yaml
  download_manifest: download_manifest.yaml
  downloaded_file_checksum_manifest: downloaded_file_checksum_manifest.yaml
  circuit_design_review_queue: circuit_design_review_queue.yaml
planned_materials_layout:
  U1:
    datasheet_dir: parts/U1/DATA Sheet
    eval_dir: parts/U1/EVAL
  U2:
    datasheet_dir: parts/U2/DATA Sheet
    eval_dir: parts/U2/EVAL
download_plan:
  - component_key: U1
    items:
      - title: LT3045_datasheet.pdf
        destination: parts/U1/DATA Sheet
        status: catalog_record_only
      - title: DC2222A_user_guide.pdf
        destination: parts/U1/EVAL
        status: catalog_record_only
      - title: DC2222A_design_files.zip
        destination: parts/U1/EVAL
        status: catalog_record_only
  - component_key: U2
    items:
      - title: MCP73831_family_datasheet.pdf
        destination: parts/U2/DATA Sheet
        status: catalog_record_only
      - title: none
        destination: parts/U2/EVAL
        status: none_found
notes:
  - No actual downloads were performed in this synthetic fixture.
  - URL-only references are not treated as completed downloads.
```

**downloaded_file_checksum_manifest**
```yaml
records:
  - component_key: U1
    title: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    source_type: official_datasheet
  - component_key: U1
    title: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    source_type: official_eval_material
  - component_key: U1
    title: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    source_type: official_design_files
  - component_key: U2
    title: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    source_type: official_datasheet
```

**circuit_design_review_queue**
```yaml
priority_queue:
  - component_key: J1
    reason: manufacturer_and_mpn_missing_in_exp
    action: confirm_identity_from_primary_source_only
  - component_key: R1
    reason: generic_passive_configuration_unknown
    action: classify_resistance_role_and_circuit_function
  - component_key: TP1
    reason: symbolic_testpoint_requires_review_context
    action: confirm_whether_materials_tracking_should_include_it
  - component_key: U1
    reason: recovered_from_package_metadata_not_partvalue
    action: verify_package_to_symbol_mapping_and_use_as_ldo_candidate
  - component_key: U2
    reason: datasheet_available_no_eval_materials
    action: confirm battery_charger handling and document no_eval_found
context_only_not_placed:
  - component_key: J2
    reason: absent_from_exp_xml
  - component_key: U3
    reason: absent_from_exp_xml
```

**boundary_review_note**
```yaml
passed_boundary_checks:
  - No local files were read.
  - No network or browser access was used.
  - No actual downloads were attempted.
  - No secrets, credentials, cookies, or workspace material were introduced.
  - EXP.xml was treated as authoritative for placed inventory and component identity.
  - downstream_handoff was used only for prioritization and open-question framing.
rejected_as_authoritative:
  - Connector identity for J1
  - MPN for J1
  - Connectivity claims
  - J2 placement
  - U3 placement
  - Any unconfirmed BOM inference from downstream_handoff alone
```

**circuit_design_readiness_note**
```yaml
readiness: partial
ready_items:
  - U1 has recoverable official identity and official source material.
  - U2 has confirmed identity and official datasheet coverage.
not_ready_items:
  - J1 lacks confirmed manufacturer and MPN.
  - R1 remains a generic passive with unknown circuit role.
  - TP1 is a testpoint and should be handled as review-context, not confirmed materials BOM.
  - U2 has no official eval materials in the fixture.
overall_assessment: proceed_with_review_queue_before_materials_finalization
```