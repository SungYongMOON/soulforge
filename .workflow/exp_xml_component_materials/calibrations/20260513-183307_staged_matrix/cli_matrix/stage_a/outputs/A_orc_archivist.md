candidate_id: A_orc_archivist

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: orc
  class: archivist
```

```yaml
component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: PKG_LT3045EDD_1
    source_property_names:
      - Manufacturer_Part_Number
      - Mfr_Name
      - PackageName
      - PCB Footprint
      - PartInst.Package
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: placed_component_authoritative
  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartValue
      - Manufacturer
      - Manufacturer Part Number
      - PCB Footprint
      - PartInst.Package
    identity_confidence: high
    action: placed_component_authoritative
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_generic_passive
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_testpoint
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartValue
      - Manufacturer
      - PartInst.Package
    identity_confidence: low
    action: review_required_connector_no_mpn
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision:
      datasheet:
        status: selected
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        mock_file: LT3045_datasheet.pdf
      eval_materials:
        - type: evaluation_board_user_guide
          status: selected
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          mock_file: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          status: selected
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          mock_file: DC2222A_design_files.zip
    notes:
      - U1 identity recovered from Package and SymbolUserProp because PartValue is placeholder Value.
      - Package node alone is not treated as a placed BOM line.
  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision:
      datasheet:
        status: selected
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        mock_file: MCP73831_family_datasheet.pdf
      eval_materials:
        status: none_found
        reason: no_official_eval_materials_present_in_mock_catalog
    notes:
      - Datasheet recorded as ready and official.
      - No EVAL material exists in the mocked official catalog.
  - refdes: R1
    official_source_decision:
      status: review_required
      reason: generic_passive_without_manufacturer_part_number_evidence
  - refdes: TP1
    official_source_decision:
      status: review_required
      reason: testpoint_symbol_without_manufacturer_part_number_evidence
  - refdes: J1
    official_source_decision:
      status: review_required
      reason: connector_without_manufacturer_part_number_evidence
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      folder: parts/U1/DATA Sheet
      mock_file: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval:
      - status: saved
        folder: parts/U1/EVAL
        mock_file: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - status: saved
        folder: parts/U1/EVAL
        mock_file: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - refdes: U2
    datasheet:
      status: saved
      folder: parts/U2/DATA Sheet
      mock_file: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval:
      status: none_found
      reason: official_mock_catalog_has_no_eval_materials
  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_authoritative_mpn
    eval:
      status: review_required
      reason: no_authoritative_eval_target
  - refdes: TP1
    datasheet:
      status: review_required
      reason: testpoint_no_authoritative_mpn
    eval:
      status: review_required
      reason: no_authoritative_eval_target
  - refdes: J1
    datasheet:
      status: review_required
      reason: connector_no_authoritative_mpn
    eval:
      status: review_required
      reason: no_authoritative_eval_target
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    mock_file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
  - refdes: U1
    mock_file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
  - refdes: U1
    mock_file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
  - refdes: U2
    mock_file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    reason: generic_passive_without_manufacturer_part_number_evidence
    severity: review_required
  - refdes: TP1
    reason: symbolic_testpoint_without_manufacturer_part_number_evidence
    severity: review_required
  - refdes: J1
    reason: connector_without_manufacturer_part_number_evidence
    severity: review_required
  - refdes: U1
    reason: identity_recovered_from_placeholder_partvalue_requires_package_based_trace
    severity: informational_review
```

```yaml
boundary_review_note:
  source_approval: official_mocked_sources_only
  public_private_boundary_verdict: public_safe
  notes:
    - No network access, file writes, or real downloads are claimed.
    - Only synthetic official-source catalog entries are used.
    - No secrets, credentials, cookies, private project data, or _workspaces material are present.
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
    - Capture U1 and U2 materials into the expected parts/<refdes>/DATA Sheet and parts/<refdes>/EVAL folders.
    - Route R1, TP1, and J1 through component identity review before authoritative material collection.
    - Preserve none_found for U2 EVAL rather than substituting non-official material.
```

Recommended next step: have the runner emit these YAML manifests directly into the workflow packet structure.