candidate_id: B_gpt_5_5_medium

```yaml
profile:
  model: gpt-5.5
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
      - Package.Name
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - SymbolUserProp.PCB Footprint
      - PartInst.Package
      - PartInstUserProp.PCB Footprint
    identity_confidence: recovered_from_referenced_package_high
    action: authoritative_downloads_allowed

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
      - PartInstUserProp.Manufacturer Part Number
      - PartInstUserProp.PCB Footprint
    identity_confidence: direct_partinst_high
    action: authoritative_downloads_allowed

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_passive_low
    action: review_required_no_authoritative_download

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_testpoint_low
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
    identity_confidence: incomplete_identity_low
    action: review_required_no_authoritative_download
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    source_decision: official_mock_catalog_match
    datasheet_source_approved: true
    eval_source_approved: true
    notes:
      - PartValue was placeholder Value; identity recovered from referenced Package PKG_LT3045EDD_1.

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    source_decision: official_mock_catalog_match
    datasheet_source_approved: true
    eval_source_approved: false
    notes:
      - Official datasheet found in mocked catalog.
      - No official EVAL material present in mocked catalog.

  - refdes: R1
    source_decision: no_manufacturer_part_identity
    source_approved: false

  - refdes: TP1
    source_decision: generic_testpoint_no_manufacturer_part_identity
    source_approved: false

  - refdes: J1
    source_decision: incomplete_connector_identity
    source_approved: false
```

```yaml
download_manifest:
  - refdes: U1
    manufacturer_part_number: LT3045EDD-1
    DATA Sheet:
      status: saved_mock_record
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
      saved_file: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
      byte_size: 1854321
      file_magic: "%PDF-"
      sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    EVAL:
      status: saved_mock_records
      files:
        - type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
          saved_file: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
          byte_size: 942210
          file_magic: "%PDF-"
          sha256: "2222222222222222222222222222222222222222222222222222222222222222"
        - type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
          saved_file: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
          byte_size: 321004
          file_magic: PK
          sha256: "3333333333333333333333333333333333333333333333333333333333333333"

  - refdes: U2
    manufacturer_part_number: MCP73831T-2ACI/OT
    DATA Sheet:
      status: saved_mock_record
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
      saved_file: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
      byte_size: 1210330
      file_magic: "%PDF-"
      sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    EVAL:
      status: none_found
      reason: mocked_official_catalog_has_no_eval_materials

  - refdes: R1
    DATA Sheet:
      status: review_required
      reason: generic_passive_without_manufacturer_part_number
    EVAL:
      status: review_required
      reason: generic_passive_without_manufacturer_part_number

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
      reason: connector_identity_missing_manufacturer_part_number
    EVAL:
      status: review_required
      reason: connector_identity_missing_manufacturer_part_number
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    saved_file: parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    saved_file: parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    saved_file: parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    saved_file: parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    value: 10k
    package: 0603
    issue: generic_passive_without_manufacturer_part_number
    required_owner_action: provide approved manufacturer and manufacturer_part_number before authoritative material collection

  - refdes: TP1
    value: TESTPOINT
    package: TP
    issue: generic_testpoint_without_manufacturer_part_number
    required_owner_action: confirm whether no vendor material is required or provide approved part identity

  - refdes: J1
    value: USB-C-16P
    package: USB_C_RECEPTACLE
    issue: connector_has_no usable manufacturer or manufacturer_part_number
    required_owner_action: provide exact manufacturer_part_number and approved source target

  - refdes: U2
    value: MCP73831T-2ACI/OT
    package: SOT23-5
    issue: official_eval_material_none_found
    required_owner_action: no blocking action unless project requires an evaluation board packet
```

```yaml
boundary_review_note:
  source_approval_verdict: pass_with_review_items
  public_private_boundary_verdict: public_safe_synthetic_only
  allowed_inputs:
    - synthetic EXP.xml excerpt
    - mocked official-source catalog
    - mocked byte_size file_magic sha256 records
  forbidden_inputs_confirmed_excluded:
    - real project EXP.xml
    - credentials
    - cookies
    - customer source data
    - _workspaces material
    - non-official mirrors
  counted_download_rule: only mocked official records with source_url, byte_size, file_magic, and sha256 are counted
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      manufacturer_part_number: LT3045EDD-1
      ready_materials:
        - DATA Sheet
        - EVAL
      note: identity recovered from referenced package and official mocked records are complete

    - refdes: U2
      manufacturer_part_number: MCP73831T-2ACI/OT
      ready_materials:
        - DATA Sheet
      note: official EVAL is none_found, not a failure

  blocked_or_review_components:
    - refdes: R1
      reason: generic passive lacks manufacturer part identity
    - refdes: TP1
      reason: testpoint lacks manufacturer part identity
    - refdes: J1
      reason: connector lacks manufacturer part number and usable manufacturer evidence

  next_owner_actions:
    - approve or supply exact MPNs for R1, TP1, and J1 if authoritative material collection is required
    - accept U2 EVAL none_found status or provide owner-approved eval source evidence
    - runner may write YAML manifests from this packet under the contracted materials tree
```

Recommendation: advance U1 and U2 datasheet materials, keep U1 EVAL, and hold R1, TP1, and J1 until owner-approved manufacturer part identity is supplied.