candidate_id: A_elf_auditor

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: auditor
```

```yaml
component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: PKG_LT3045EDD_1
    source_property_names:
      - PartInst.Package
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: source_and_download
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
    action: source_and_download
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInstUserProp.Manufacturer
      - PartInst.Package
    identity_confidence: low
    action: review_required
```

```yaml
source_discovery_packet:
  U1:
    decision: official_source_approved
    manufacturer: Analog Devices
    mpn: LT3045EDD-1
    datasheet:
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
      status: selected
    eval_materials:
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        official: true
        status: selected
      - type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        official: true
        status: selected
  U2:
    decision: official_source_approved
    manufacturer: Microchip Technology
    mpn: MCP73831T-2ACI/OT
    datasheet:
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
      status: selected
    eval_materials: none_found
  R1:
    decision: review_required
    reason: generic_passive_without_manufacturer_part_identity
    official_source_status: not_authoritative
  TP1:
    decision: review_required
    reason: symbolic_testpoint_without_manufacturer_part_identity
    official_source_status: not_authoritative
  J1:
    decision: review_required
    reason: connector_identity_not_resolved_from_fixture
    official_source_status: not_authoritative
```

```yaml
download_manifest:
  U1:
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      - status: saved
        type: evaluation_board_user_guide
        file_name: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        official: true
      - status: saved
        type: pcb_layout_archive
        file_name: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        official: true
  U2:
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: official_eval_material_not_provided_in_mock_catalog
  R1:
    datasheet:
      status: review_required
      reason: generic_part_without_mpn
    eval:
      status: review_required
      reason: generic_part_without_mpn
  TP1:
    datasheet:
      status: review_required
      reason: symbolic_part_without_mpn
    eval:
      status: review_required
      reason: symbolic_part_without_mpn
  J1:
    datasheet:
      status: review_required
      reason: connector_part_identity_not_authoritatively_resolved
    eval:
      status: review_required
      reason: connector_part_identity_not_authoritatively_resolved
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    category: datasheet
    file_name: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
  - refdes: U1
    category: eval
    file_name: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
  - refdes: U1
    category: eval
    file_name: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - refdes: U2
    category: datasheet
    file_name: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    issue_type: generic_passive
    reason: 10k resistor has no manufacturer part number in fixture
    owner_action: confirm exact resistor part or leave as review-only generic reference
  - refdes: TP1
    issue_type: symbolic_testpoint
    reason: testpoint has no authoritative manufacturer identity
    owner_action: confirm whether a vendor part or schematic-only symbol is intended
  - refdes: J1
    issue_type: unresolved_connector
    reason: USB-C receptacle identity is not backed by manufacturer or MPN evidence
    owner_action: provide exact connector MPN before source collection
```

```yaml
boundary_review_note:
  source_approval: official_mock_sources_only
  verdict: public_safe
  boundary_check:
    - no_network_access_claimed: true
    - no_real_download_claimed: true
    - no_private_project_data_used: true
    - no_secret_material_used: true
    - no_unapproved_mirror_sources_used: true
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
    - confirm or replace generic passive and symbolic parts with authoritative manufacturer identities if they must be sourced
    - keep U1 and U2 in the materials packet with their official datasheets and recorded checksums
    - record U2 eval as none_found, not as a failure
```

Recommendation: proceed with U1 and U2 material manifests, and send R1, TP1, and J1 back for identity clarification before any further source collection.