candidate_id: B_gpt_5_4_mini_low

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
    identity_confidence: medium
    action: place_and_collect_official_materials

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
    identity_confidence: high
    action: place_and_collect_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_only_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_only_generic_symbolic_item

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_only_generic_connector
```

```yaml
source_discovery_packet:
  U1:
    component_key: analog_devices_lt3045edd_1
    official_source_decision: accept_official_materials
    identity_basis:
      - Package.Name=PKG_LT3045EDD_1
      - SymbolUserProp.Manufacturer_Part_Number=LT3045EDD-1
      - SymbolUserProp.Mfr_Name=Analog Devices
      - PartInst.RefDes=U1
      - PartInst.PartValue=Value_placeholder
    notes:
      - Recovered identity from package-linked symbol properties because PartValue is placeholder Value.
      - Treat as authoritative placed component.

  U2:
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: accept_official_materials
    identity_basis:
      - PartInst.PartValue=MCP73831T-2ACI/OT
      - PartInstUserProp.Manufacturer=Microchip Technology
      - PartInstUserProp.Manufacturer Part Number=MCP73831T-2ACI/OT
      - PartInst.RefDes=U2
    notes:
      - Identity is explicit and high confidence.
      - Official datasheet available; no official EVAL material listed.

  R1:
    official_source_decision: review_required
    identity_basis:
      - Generic passive
      - No manufacturer part number evidence
      - No official source catalog entry
    notes:
      - Keep out of authoritative downloads unless manufacturer identity becomes available.

  TP1:
    official_source_decision: review_required
    identity_basis:
      - Symbolic test point
      - No manufacturer part number evidence
      - No official source catalog entry
    notes:
      - Do not search authoritative downloads for generic test point.

  J1:
    official_source_decision: review_required
    identity_basis:
      - USB-C receptacle placeholder only
      - Manufacturer field empty
      - No manufacturer part number evidence
    notes:
      - Connector identity is insufficient for authoritative source collection.
```

```yaml
download_manifest:
  U1:
    datasheet:
      status: saved
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      saved_file: LT3045_datasheet.pdf
      relative_path: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet/LT3045_datasheet.pdf
      official: true
    eval:
      - status: saved
        type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        saved_file: DC2222A_user_guide.pdf
        relative_path: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_user_guide.pdf
        official: true
      - status: saved
        type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        saved_file: DC2222A_design_files.zip
        relative_path: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_design_files.zip
        official: true

  U2:
    datasheet:
      status: saved
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      saved_file: MCP73831_family_datasheet.pdf
      relative_path: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf
      official: true
    eval:
      status: none_found
      reason: no_official_eval_materials_listed_in_mock_catalog

  R1:
    datasheet:
      status: review_required
      reason: generic_passive_no_manufacturer_part_number
    eval:
      status: none_found
      reason: no_official_eval_materials_expected_for_generic_passive

  TP1:
    datasheet:
      status: review_required
      reason: symbolic_test_point_no_manufacturer_part_number
    eval:
      status: none_found
      reason: no_official_eval_materials_expected_for_test_point

  J1:
    datasheet:
      status: review_required
      reason: connector_placeholder_no_manufacturer_part_number
    eval:
      status: none_found
      reason: no_official_eval_materials_expected_until_identity_confirmed
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    category: datasheet
    saved_file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    official: true

  - refdes: U1
    category: eval
    saved_file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    official: true

  - refdes: U1
    category: eval
    saved_file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    official: true

  - refdes: U2
    category: datasheet
    saved_file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    official: true
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    reason: generic_passive_no_manufacturer_part_number
    severity: low
    disposition: review_required

  - refdes: TP1
    reason: symbolic_test_point_no_manufacturer_part_number
    severity: low
    disposition: review_required

  - refdes: J1
    reason: connector_placeholder_no_manufacturer_part_number_and_empty_manufacturer_field
    severity: medium
    disposition: review_required

  - refdes: U1
    reason: identity_recovered_from_package_and_symbol_props_but_partvalue_is_placeholder
    severity: low
    disposition: accepted_for_official_materials

  - refdes: U2
    reason: no_official_eval_materials_listed
    severity: low
    disposition: accepted_datasheet_only
```

```yaml
boundary_review_note:
  source_approval: official_source_only
  public_private_boundary: public_safe_only
  verdict: pass
  notes:
    - Only mocked official-source evidence was used.
    - No real project EXP.xml, downloads, credentials, cookies, or private workspace data were included.
    - U1, U2 datasheets and U1 eval materials are counted because they include official source metadata, byte size, file magic, and sha256.
    - No substitute or mirror sources were introduced for missing eval material.
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      materials_ready:
        - datasheet
        - eval_user_guide
        - eval_pcb_layout_archive
    - refdes: U2
      materials_ready:
        - datasheet

  blocked_or_review_components:
    - refdes: R1
      block_reason: generic_passive_no_mpn
    - refdes: TP1
      block_reason: symbolic_test_point_no_mpn
    - refdes: J1
      block_reason: connector_identity_not_resolved

  next_owner_actions:
    - confirm whether R1, TP1, and J1 should remain review-only or receive manufacturer identities from a later source pass
    - proceed with U1 and U2 material attachment in the reference materials tree
    - record none_found for U2 eval rather than inventing a substitute
```

Recommendation: keep U1/U2 as the only authoritative material-backed placements; route R1, TP1, and J1 through a later identity-resolution pass.