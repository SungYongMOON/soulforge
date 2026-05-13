candidate_id: A_dwarf_administrator

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
  class: administrator
```

```yaml
component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: DFN-10
    source_property_names:
      - Package.Name
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: place_and_collect_official_materials

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartInst.PartValue
      - PartInstUserProp.Manufacturer
      - PartInstUserProp.Manufacturer Part Number
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: place_and_collect_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
    identity_confidence: low
    action: review_required_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
    identity_confidence: low
    action: review_required_symbolic_testpoint

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_required_connector_identity
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    datasheet:
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      mock_file: LT3045_datasheet.pdf
      status: accepted
    eval_materials:
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        mock_file: DC2222A_user_guide.pdf
        status: accepted
      - type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        mock_file: DC2222A_design_files.zip
        status: accepted

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: approved
    datasheet:
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      mock_file: MCP73831_family_datasheet.pdf
      status: accepted
    eval_materials:
      status: none_found
      search_evidence: no official EVAL material listed in mocked catalog

  - refdes: R1
    official_source_decision: review_required
    reason: generic_passive_without_manufacturer_part_identity

  - refdes: TP1
    official_source_decision: review_required
    reason: symbolic_testpoint_without_manufacturer_part_identity

  - refdes: J1
    official_source_decision: review_required
    reason: connector_identity_not_resolved_from_mocked_catalog
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file: LT3045_datasheet.pdf
      folder: DATA Sheet
    eval:
      status: saved
      files:
        - file: DC2222A_user_guide.pdf
          folder: EVAL
        - file: DC2222A_design_files.zip
          folder: EVAL

  - refdes: U2
    datasheet:
      status: saved
      file: MCP73831_family_datasheet.pdf
      folder: DATA Sheet
    eval:
      status: none_found
      reason: no_official_eval_material_listed_in_mocked_catalog

  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_authoritative_mpn
    eval:
      status: review_required
      reason: generic_passive_no_authoritative_mpn

  - refdes: TP1
    datasheet:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_mpn
    eval:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_mpn

  - refdes: J1
    datasheet:
      status: review_required
      reason: connector_identity_unresolved
    eval:
      status: review_required
      reason: connector_identity_unresolved
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    category: generic_passive
    issue: no_manufacturer_part_number_evidence
    action: manual_review
  - refdes: TP1
    category: symbolic_testpoint
    issue: no_manufacturer_part_number_evidence
    action: manual_review
  - refdes: J1
    category: connector
    issue: manufacturer_and_mpn_not_resolved
    action: identity_resolution_required
```

```yaml
boundary_review_note:
  source_approval: approved_for_mocked_official_sources_only
  boundary_verdict: public_safe
  notes:
    - no_network_access_claimed
    - no_real_downloads_claimed
    - no_private_project_data_used
    - only_fixture_provided_official_source_records_counted
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - confirm any unresolved connector identity for J1
    - decide whether generic passive R1 needs BOM-level sourcing or remains schematic-only
    - verify whether TP1 is intentionally symbolic or should map to a physical test point part
```

추천: 다음 단계에서는 이 패킷을 그대로 YAML 파일들로 분리하는 runner를 붙이면 됩니다.