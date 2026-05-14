candidate_id: B_gpt_5_5_high

```yaml
profile:
  model: gpt-5.5
  reasoning_effort: high
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
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - Package.SymbolUserProp.Manufacturer_Part_Number
      - Package.SymbolUserProp.Mfr_Name
      - Package.SymbolUserProp.PackageName
      - Package.SymbolUserProp.PCB Footprint
      - PartInstUserProp.PCB Footprint
    identity_confidence: recovered_from_referenced_package
    action: collect_official_datasheet_and_eval_materials

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
      - PartInstUserProp.Manufacturer Part Number
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: collect_official_datasheet_record_eval_none_found

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_value_only
    action: review_required_no_authoritative_mpn

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: symbolic_generic
    action: review_required_no_authoritative_mpn

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: incomplete_identity
    action: review_required_missing_manufacturer_part_number
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    decision: official_source_approved
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    identity_basis: Package.SymbolUserProp recovered from PKG_LT3045EDD_1
    official_sources:
      datasheet: official_mock_available
      eval: official_mock_available

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    decision: official_source_approved
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    identity_basis: PartInstUserProp manufacturer part number
    official_sources:
      datasheet: official_mock_available
      eval: none_found

  - refdes: R1
    decision: review_required
    reason: generic_passive_without_manufacturer_part_number

  - refdes: TP1
    decision: review_required
    reason: test_point_without_manufacturer_part_number

  - refdes: J1
    decision: review_required
    reason: connector_value_without_manufacturer_part_number
```

```yaml
download_manifest:
  materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
  parts:
    U1:
      "DATA Sheet":
        status: saved_file_record
        official: true
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        file: parts/U1/DATA Sheet/LT3045_datasheet.pdf
      EVAL:
        status: saved_file_records
        records:
          - type: evaluation_board_user_guide
            official: true
            source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
            file: parts/U1/EVAL/DC2222A_user_guide.pdf
          - type: pcb_layout_archive
            official: true
            source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
            file: parts/U1/EVAL/DC2222A_design_files.zip

    U2:
      "DATA Sheet":
        status: saved_file_record
        official: true
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        file: parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf
      EVAL:
        status: none_found
        reason: mocked_official_source_catalog_lists_no_eval_materials

    R1:
      "DATA Sheet":
        status: review_required
        reason: no_manufacturer_part_number
      EVAL:
        status: review_required
        reason: no_manufacturer_part_number

    TP1:
      "DATA Sheet":
        status: review_required
        reason: test_point_no_manufacturer_part_number
      EVAL:
        status: review_required
        reason: test_point_no_manufacturer_part_number

    J1:
      "DATA Sheet":
        status: review_required
        reason: missing_manufacturer_and_manufacturer_part_number
      EVAL:
        status: review_required
        reason: missing_manufacturer_and_manufacturer_part_number
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    category: DATA Sheet
    file: parts/U1/DATA Sheet/LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    category: EVAL
    file: parts/U1/EVAL/DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    category: EVAL
    file: parts/U1/EVAL/DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    category: DATA Sheet
    file: parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    severity: review_required
    issue: generic_passive_value_only
    reason: placed component has no manufacturer or manufacturer part number evidence
    next_owner_action: assign approved manufacturer part number or mark as intentionally generic

  - refdes: TP1
    severity: review_required
    issue: symbolic_test_point
    reason: no authoritative manufacturer part identity
    next_owner_action: confirm test point library identity or exempt from source material collection

  - refdes: J1
    severity: review_required
    issue: incomplete_connector_identity
    reason: manufacturer field is blank and no manufacturer part number is present
    next_owner_action: provide approved connector manufacturer and manufacturer part number
```

```yaml
boundary_review_note:
  source_approval_verdict: approved_for_mocked_official_sources_only
  public_private_boundary_verdict: public_safe_synthetic_packet
  notes:
    - Used only fixture-provided mocked official-source evidence.
    - PartInst entries were treated as placed components.
    - Package-only data was used only to recover U1 identity through its referenced package.
    - Generic, symbolic, and incomplete identities were kept out of authoritative download records.
    - No real project data, secrets, credentials, cookies, network material, or _workspaces contents are included.
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      status: ready
      materials:
        datasheet: ready
        eval: ready
    - refdes: U2
      status: ready
      materials:
        datasheet: ready
        eval: none_found_officially_not_blocking

  blocked_or_review_components:
    - refdes: R1
      status: review_required
      blocker: no_authoritative_manufacturer_part_number
    - refdes: TP1
      status: review_required
      blocker: symbolic_test_point_without_part_identity
    - refdes: J1
      status: review_required
      blocker: missing_manufacturer_part_number

  next_owner_actions:
    - Confirm or assign manufacturer part identities for R1, TP1, and J1.
    - Keep U2 EVAL as none_found unless an owner-approved official Microchip evaluation source is later supplied.
    - Runner may write YAML manifests from this packet without adding unapproved mirrors or inferred downloads.
```

Recommendation: advance U1 and U2 into material-ready handling, and hold R1, TP1, and J1 at identity review before any authoritative source collection.