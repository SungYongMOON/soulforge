candidate_id: B_gpt_5_4_medium

```yaml
profile:
  model: gpt-5.4
  reasoning_effort: medium
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
      - PartInst.PartValue
      - PartInst.Package
      - Package.SymbolUserProp.Manufacturer_Part_Number
      - Package.SymbolUserProp.Mfr_Name
      - Package.SymbolUserProp.PackageName
      - PartInstUserProp.PCB Footprint
      - Package.SymbolUserProp.PCB Footprint
    identity_confidence: recovered_from_package_reference
    action: authoritative_download_ready

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
    identity_confidence: direct_partinst_identity
    action: authoritative_download_ready

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: insufficient_manufacturer_identity
    action: review_queue

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: insufficient_manufacturer_identity
    action: review_queue

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
    action: review_queue
```

```yaml
source_discovery_packet:
  - refdes: U1
    resolved_component_key: analog_devices_lt3045edd_1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    identity_basis:
      - PartInst U1 references Package PKG_LT3045EDD_1
      - Package symbol properties provide manufacturer and manufacturer part number
      - PartInst PartValue is placeholder "Value", so package recovery was required
    official_source_decision:
      approved: true
      datasheet_source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      eval_source_urls:
        - https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        - https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
      notes: package-derived identity accepted per hard rule

  - refdes: U2
    resolved_component_key: microchip_mcp73831t_2aci_ot
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    identity_basis:
      - PartInst user properties provide manufacturer and manufacturer part number
      - PartInst PartValue matches manufacturer part number
    official_source_decision:
      approved: true
      datasheet_source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      eval_source_urls: []
      notes: official datasheet ready; no official eval material found in mocked catalog

  - refdes: R1
    resolved_component_key: null
    manufacturer: null
    manufacturer_part_number: null
    identity_basis:
      - generic passive value only
      - no manufacturer identity
    official_source_decision:
      approved: false
      datasheet_source_url: null
      eval_source_urls: []
      notes: held for review; no authoritative manufacturer-specific material allowed

  - refdes: TP1
    resolved_component_key: null
    manufacturer: null
    manufacturer_part_number: null
    identity_basis:
      - generic test point value only
      - no manufacturer identity
    official_source_decision:
      approved: false
      datasheet_source_url: null
      eval_source_urls: []
      notes: held for review; non-authoritative downloads excluded

  - refdes: J1
    resolved_component_key: null
    manufacturer: null
    manufacturer_part_number: null
    identity_basis:
      - descriptive connector value only
      - manufacturer field blank
    official_source_decision:
      approved: false
      datasheet_source_url: null
      eval_source_urls: []
      notes: held for review pending exact manufacturer part number
```

```yaml
download_manifest:
  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    datasheet:
      status: saved_file_recorded
      folder: DATA Sheet
      mock_file: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      status: saved_file_records_recorded
      files:
        - type: evaluation_board_user_guide
          folder: EVAL
          mock_file: DC2222A_user_guide.pdf
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
        - type: pcb_layout_archive
          folder: EVAL
          mock_file: DC2222A_design_files.zip
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true

  - refdes: U2
    manufacturer_part_number: MCP73831T-2ACI/OT
    datasheet:
      status: saved_file_recorded
      folder: DATA Sheet
      mock_file: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: no official eval material present in mocked official-source catalog
      search_evidence:
        - component_key: microchip_mcp73831t_2aci_ot
        - mocked_eval_material_count: 0

  - refdes: R1
    manufacturer_part_number: null
    datasheet:
      status: review_required
      reason: generic passive without manufacturer part identity
    eval:
      status: review_required
      reason: generic passive without manufacturer part identity

  - refdes: TP1
    manufacturer_part_number: null
    datasheet:
      status: review_required
      reason: test point without manufacturer part identity
    eval:
      status: review_required
      reason: test point without manufacturer part identity

  - refdes: J1
    manufacturer_part_number: null
    datasheet:
      status: review_required
      reason: connector lacks exact manufacturer part number
    eval:
      status: review_required
      reason: connector lacks exact manufacturer part number
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    material_type: datasheet
    mock_file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    material_type: evaluation_board_user_guide
    mock_file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    material_type: pcb_layout_archive
    mock_file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    manufacturer_part_number: MCP73831T-2ACI/OT
    material_type: datasheet
    mock_file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    category: generic_component
    issue: generic resistor value without manufacturer part number
    blocking_reason: authoritative downloads forbidden without manufacturer-specific identity
    required_owner_action: assign exact manufacturer and manufacturer part number or classify as non-downloadable generic

  - refdes: TP1
    category: generic_component
    issue: test point lacks manufacturer part number
    blocking_reason: authoritative downloads forbidden without manufacturer-specific identity
    required_owner_action: assign exact test point manufacturer part number if sourcing materials are required

  - refdes: J1
    category: ambiguous_component
    issue: USB-C-16P descriptive value is not a verified manufacturer part number; manufacturer field blank
    blocking_reason: connector identity unresolved
    required_owner_action: provide exact manufacturer and manufacturer part number before source discovery
```

```yaml
boundary_review_note:
  source_approval_verdict: approved_within_fixture_scope
  boundary_verdict: public_safe
  notes:
    - output uses only public-safe synthetic EXP.xml excerpt and mocked official-source/download evidence
    - no real project files, secrets, credentials, cookies, or workspace materials are introduced
    - only official mocked sources with byte_size, file_magic, and sha256 are counted as downloaded
    - review-required components remain unresolved rather than filled with inferred or unofficial substitutes
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      manufacturer_part_number: LT3045EDD-1
      readiness: datasheet_and_eval_ready
    - refdes: U2
      manufacturer_part_number: MCP73831T-2ACI/OT
      readiness: datasheet_ready_eval_none_found

  blocked_or_review_components:
    - refdes: R1
      reason: generic passive; no manufacturer identity
    - refdes: TP1
      reason: generic test point; no manufacturer identity
    - refdes: J1
      reason: connector identity unresolved

  next_owner_actions:
    - write YAML manifests from this packet for component inventory, download manifest, checksum manifest, and review queue
    - proceed with U1 and U2 materials as authoritative references
    - obtain exact manufacturer part numbers for R1, TP1, and J1 before any authoritative source collection
```

Proceed with manifest writing for `U1` and `U2`, and hold `R1`, `TP1`, `J1` behind owner identity resolution.