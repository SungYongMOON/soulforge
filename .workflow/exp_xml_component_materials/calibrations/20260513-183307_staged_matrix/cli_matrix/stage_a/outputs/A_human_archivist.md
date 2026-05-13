candidate_id: A_human_archivist

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: archivist

component_inventory:
  - refdes: U1
    value: LT3045EDD-1
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
    action: placed
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
    action: placed
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
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_required

source_discovery_packet:
  U1:
    component_key: analog_devices_lt3045edd_1
    decision: official_source_confirmed
    recovered_identity_from: PKG_LT3045EDD_1
    evidence:
      - SymbolUserProp.Manufacturer_Part_Number = LT3045EDD-1
      - SymbolUserProp.Mfr_Name = Analog Devices
      - SymbolUserProp.PackageName = DFN-10
      - PartInstUserProp.PCB Footprint = LTC_DD_10
    official_sources:
      datasheet:
        url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        mock_file: LT3045_datasheet.pdf
      eval_materials:
        - type: evaluation_board_user_guide
          url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          mock_file: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          mock_file: DC2222A_design_files.zip
  U2:
    component_key: microchip_mcp73831t_2aci_ot
    decision: official_source_confirmed
    evidence:
      - PartInst.PartValue = MCP73831T-2ACI/OT
      - PartInstUserProp.Manufacturer = Microchip Technology
      - PartInstUserProp.Manufacturer Part Number = MCP73831T-2ACI/OT
      - PartInstUserProp.PCB Footprint = SOT23-5
    official_sources:
      datasheet:
        url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        mock_file: MCP73831_family_datasheet.pdf
      eval_materials: none_found
  R1:
    decision: review_required
    reason: generic_passive_no_mfr_part_number_evidence
    evidence:
      - PartInst.PartValue = 10k
      - PartInst.Package = 0603
  TP1:
    decision: review_required
    reason: symbolic_testpoint_no_mfr_part_number_evidence
    evidence:
      - PartInst.PartValue = TESTPOINT
      - PartInst.Package = TP
  J1:
    decision: review_required
    reason: connector_without_manufacturer_part_number_evidence
    evidence:
      - PartInst.PartValue = USB-C-16P
      - PartInst.Package = USB_C_RECEPTACLE
      - PartInstUserProp.Manufacturer is empty

download_manifest:
  U1:
    DATA Sheet:
      status: saved
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      file_name: LT3045_datasheet.pdf
    EVAL:
      status: saved
      records:
        - type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          file_name: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          file_name: DC2222A_design_files.zip
  U2:
    DATA Sheet:
      status: saved
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      file_name: MCP73831_family_datasheet.pdf
    EVAL:
      status: none_found
      reason: no_official_eval_materials_listed_in_mock_catalog
  R1:
    DATA Sheet:
      status: review_required
      reason: no_manufacturer_part_number
    EVAL:
      status: review_required
      reason: no_manufacturer_part_number
  TP1:
    DATA Sheet:
      status: review_required
      reason: no_manufacturer_part_number
    EVAL:
      status: review_required
      reason: no_manufacturer_part_number
  J1:
    DATA Sheet:
      status: review_required
      reason: no_manufacturer_part_number
    EVAL:
      status: review_required
      reason: no_manufacturer_part_number

downloaded_file_checksum_manifest:
  - refdes: U1
    file_name: LT3045_datasheet.pdf
    sha256: 1111111111111111111111111111111111111111111111111111111111111111
    byte_size: 1854321
    file_magic: "%PDF-"
  - refdes: U1
    file_name: DC2222A_user_guide.pdf
    sha256: 2222222222222222222222222222222222222222222222222222222222222222
    byte_size: 942210
    file_magic: "%PDF-"
  - refdes: U1
    file_name: DC2222A_design_files.zip
    sha256: 3333333333333333333333333333333333333333333333333333333333333333
    byte_size: 321004
    file_magic: "PK"
  - refdes: U2
    file_name: MCP73831_family_datasheet.pdf
    sha256: 4444444444444444444444444444444444444444444444444444444444444444
    byte_size: 1210330
    file_magic: "%PDF-"

circuit_design_review_queue:
  - refdes: R1
    category: generic_passive
    reason: part_value_only_no_manufacturer_identity
  - refdes: TP1
    category: testpoint
    reason: symbolic_component_no_manufacturer_identity
  - refdes: J1
    category: connector
    reason: manufacturer_blank_and_no_mpn_evidence
  - refdes: U2
    category: eval_materials
    reason: no_official_eval_materials_listed
    disposition: none_found
  - refdes: U1
    category: source_review
    reason: package_based_identity_recovery_used
    disposition: approved_for_official_material_collection

boundary_review_note:
  source_approval: official_mock_sources_only_accepted
  public_private_boundary_verdict: public_safe
  notes:
    - no_real_project_files_accessed
    - no_secrets_credentials_or_private_workspace_data_used
    - only mocked official-source evidence from fixture counted

circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - archive U1 official datasheet and eval materials as approved reference set
    - archive U2 official datasheet and record eval_materials as none_found
    - route R1, TP1, and J1 to component-identity review before authoritative material collection
```

Keep the review queue separate from the ready set; that is the cleanest promotion boundary for this fixture.