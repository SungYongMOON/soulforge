candidate_id: A_elf_archivist

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: archivist

component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: PKG_LT3045EDD_1
    source_property_names:
      - Package.Name
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.PCB Footprint
    identity_confidence: recovered_from_package_symbol_props
    action: place_and_collect_official_sources
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
    identity_confidence: direct_partinst_mpn
    action: place_and_collect_official_sources
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_passive_only
    action: review_required
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: symbolic_testpoint_only
    action: review_required
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: generic_connector_only
    action: review_required

source_discovery_packet:
  - refdes: U1
    official_source_decision: approved
    basis:
      - official_datasheet_available
      - official_eval_user_guide_available
      - official_eval_pcb_layout_archive_available
    source_urls:
      datasheet: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      eval_user_guide: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      eval_pcb_layout_archive: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - refdes: U2
    official_source_decision: approved
    basis:
      - official_datasheet_available
      - no_official_eval_materials_listed
    source_urls:
      datasheet: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
  - refdes: R1
    official_source_decision: review_required
    basis:
      - generic_resistor_no_manufacturer_identity
  - refdes: TP1
    official_source_decision: review_required
    basis:
      - symbolic_testpoint_no_manufacturer_identity
  - refdes: J1
    official_source_decision: review_required
    basis:
      - connector_family_only
      - no_manufacturer_part_number_evidence
      - manufacturer_field_empty

download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      status: saved
      files:
        - file_name: DC2222A_user_guide.pdf
          type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
        - file_name: DC2222A_design_files.zip
          type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
  - refdes: U2
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: no_official_eval_materials_listed_for_mcp73831t_2aci_ot
  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_manufacturer_part_identity
    eval:
      status: review_required
      reason: generic_passive_no_eval_identity
  - refdes: TP1
    datasheet:
      status: review_required
      reason: symbolic_testpoint_no_manufacturer_part_identity
    eval:
      status: review_required
      reason: symbolic_testpoint_no_eval_identity
  - refdes: J1
    datasheet:
      status: review_required
      reason: connector_identity_not_resolved_to_manufacturer_part_number
    eval:
      status: review_required
      reason: connector_identity_not_resolved_to_official_source

downloaded_file_checksum_manifest:
  - file_name: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    source_refdes: U1
    source_kind: datasheet
  - file_name: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    source_refdes: U1
    source_kind: eval_user_guide
  - file_name: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    source_refdes: U1
    source_kind: pcb_layout_archive
  - file_name: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    source_refdes: U2
    source_kind: datasheet

circuit_design_review_queue:
  - refdes: R1
    reason: generic_passive_without_manufacturer_part_number
    severity: low
  - refdes: TP1
    reason: symbolic_testpoint_without_manufacturer_part_number
    severity: low
  - refdes: J1
    reason: connector_without_resolved_manufacturer_part_number_or_official_source
    severity: medium
  - refdes: U2
    reason: eval_materials_none_found_but_datasheet_is_approved
    severity: info

boundary_review_note:
  source_approval: official_mocked_sources_only
  public_private_boundary_verdict: public_safe
  notes:
    - no_network_access_claimed
    - no_real_downloads_claimed
    - no_secret_or_private_workspace_data_used
    - only_mocked_official_source artifacts were counted as downloads

circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - preserve U1 recovery from PKG_LT3045EDD_1 and emit official datasheet plus official EVAL records
    - record U2 datasheet as complete and keep eval as none_found
    - route generic passives, testpoints, and unresolved connectors to review before source collection
```

Recommendation: keep U1 and U2 as authoritative placements; send R1, TP1, and J1 to review until manufacturer-grade identities are supplied.