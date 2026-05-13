candidate_id: B_gpt_5_5_low

```yaml
profile:
  model: gpt-5.5
  reasoning_effort: low
  species: orc
  class: archivist
```

```yaml
component_inventory:
  - refdes: U1
    value: LT3045EDD-1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: DFN-10
    source_property_names:
      - Package:PKG_LT3045EDD_1.SymbolUserProp.Manufacturer_Part_Number
      - Package:PKG_LT3045EDD_1.SymbolUserProp.Mfr_Name
      - Package:PKG_LT3045EDD_1.SymbolUserProp.PackageName
      - PartInst.Package
      - PartInstUserProp.PCB Footprint
    identity_confidence: recovered_from_referenced_package
    action: authoritative_download_allowed

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
    identity_confidence: high_partinst_mpn
    action: authoritative_download_allowed

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_only
    action: review_required_no_authoritative_download

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: symbolic_generic_only
    action: review_required_no_authoritative_download

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: insufficient_manufacturer_identity
    action: review_required_no_authoritative_download
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    source_decision: official_sources_approved_from_mock_catalog
    datasheet_source:
      official: true
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval_sources:
      - official: true
        type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - official: true
        type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    source_decision: official_datasheet_approved_from_mock_catalog
    datasheet_source:
      official: true
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval_sources: none_found

  - refdes: R1
    source_decision: no_authoritative_source_lookup
    reason: generic_passive_without_manufacturer_part_number

  - refdes: TP1
    source_decision: no_authoritative_source_lookup
    reason: testpoint_symbol_without_manufacturer_part_number

  - refdes: J1
    source_decision: no_authoritative_source_lookup
    reason: connector_has_no_manufacturer_part_number_evidence
```

```yaml
download_manifest:
  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    DATA Sheet:
      status: saved_mock_record
      records:
        - filename: LT3045_datasheet.pdf
          source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
          official: true
          byte_size: 1854321
          file_magic: "%PDF-"
          sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    EVAL:
      status: saved_mock_records
      records:
        - filename: DC2222A_user_guide.pdf
          type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
          byte_size: 942210
          file_magic: "%PDF-"
          sha256: "2222222222222222222222222222222222222222222222222222222222222222"
        - filename: DC2222A_design_files.zip
          type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
          byte_size: 321004
          file_magic: PK
          sha256: "3333333333333333333333333333333333333333333333333333333333333333"

  - refdes: U2
    manufacturer_part_number: MCP73831T-2ACI/OT
    DATA Sheet:
      status: saved_mock_record
      records:
        - filename: MCP73831_family_datasheet.pdf
          source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
          official: true
          byte_size: 1210330
          file_magic: "%PDF-"
          sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    EVAL:
      status: none_found
      reason: mocked_official_source_catalog_lists_no_eval_materials

  - refdes: R1
    DATA Sheet:
      status: review_required
      reason: no_manufacturer_part_number
    EVAL:
      status: review_required
      reason: no_manufacturer_part_number

  - refdes: TP1
    DATA Sheet:
      status: review_required
      reason: testpoint_without_manufacturer_part_number
    EVAL:
      status: review_required
      reason: testpoint_without_manufacturer_part_number

  - refdes: J1
    DATA Sheet:
      status: review_required
      reason: connector_identity_incomplete_no_manufacturer_part_number
    EVAL:
      status: review_required
      reason: connector_identity_incomplete_no_manufacturer_part_number
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    folder: DATA Sheet
    filename: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    folder: EVAL
    filename: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    folder: EVAL
    filename: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    folder: DATA Sheet
    filename: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    category: generic_passive
    issue: no manufacturer or manufacturer part number evidence
    required_owner_action: provide approved manufacturer part number or mark as intentionally generic

  - refdes: TP1
    category: testpoint_symbolic_part
    issue: no manufacturer part number evidence
    required_owner_action: confirm whether authoritative materials are needed or exempt from materials collection

  - refdes: J1
    category: incomplete_connector_identity
    issue: manufacturer field is blank and no manufacturer part number is present
    required_owner_action: provide connector manufacturer and manufacturer part number before authoritative download

  - refdes: U1
    category: recovered_identity
    issue: PartValue is placeholder Value; identity recovered from referenced package SymbolUserProp
    required_owner_action: optional schematic/CIS cleanup so placed PartInst carries explicit MPN
```

```yaml
boundary_review_note:
  source_approval_verdict: approved_public_safe_mock_official_sources_only
  counted_download_rule: counted only mocked records with official=true, byte_size, file_magic, and sha256
  excluded_sources:
    - random_mirrors
    - account_gated_or_unverified_sources
    - URL_only_records_without_mock_file_integrity
  public_private_boundary_verdict: public_safe_synthetic_packet_only
  protected_data_exposure: none
  notes:
    - No network access, browser action, file write, or real binary download is claimed.
    - R1, TP1, and J1 remain outside authoritative downloads until manufacturer part identity is available.
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      readiness: ready_with_recovered_identity
      materials:
        DATA Sheet: ready
        EVAL: ready
      owner_note: consider replacing placeholder PartValue with LT3045EDD-1 in placed component metadata

    - refdes: U2
      readiness: ready
      materials:
        DATA Sheet: ready
        EVAL: none_found
      owner_note: official Microchip datasheet is available; lack of official EVAL material is recorded, not a failure

  blocked_or_review_components:
    - refdes: R1
      reason: generic passive without manufacturer part number
    - refdes: TP1
      reason: testpoint without manufacturer part number
    - refdes: J1
      reason: connector lacks manufacturer and manufacturer part number

  next_owner_actions:
    - Confirm whether R1 and TP1 are intentionally generic and exempt from authoritative material collection.
    - Provide manufacturer and manufacturer part number for J1 if connector datasheet or EVAL materials are required.
    - Optionally normalize U1 placed PartInst metadata so the recovered package identity becomes explicit.
```

Recommendation: proceed with manifest generation for U1 and U2 only; hold R1, TP1, and J1 in review until owner identity evidence is supplied.