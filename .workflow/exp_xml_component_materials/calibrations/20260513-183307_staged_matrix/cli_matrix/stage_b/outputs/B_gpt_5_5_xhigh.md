candidate_id: B_gpt_5_5_xhigh

```yaml
profile:
  model: gpt-5.5
  reasoning_effort: xhigh
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
      - Package.SymbolUserProp.Manufacturer_Part_Number
      - Package.SymbolUserProp.Mfr_Name
      - Package.SymbolUserProp.PackageName
      - PartInst.Package
    identity_confidence: recovered_from_referenced_package
    action: collect_official_datasheet_and_eval_materials

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
    action: collect_official_datasheet_record_eval_none_found

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_no_mpn
    action: review_required_no_authoritative_download

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: generic_symbolic
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
    identity_confidence: incomplete_no_mpn
    action: review_required_no_authoritative_download
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    decision: official_source_approved
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    evidence_basis: mocked_official_source_catalog
    datasheet_source: official
    eval_source: official

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    decision: official_source_approved
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    evidence_basis: mocked_official_source_catalog
    datasheet_source: official
    eval_source: none_found_official_catalog_empty

  - refdes: R1
    decision: review_required
    reason: generic_passive_without_manufacturer_part_identity

  - refdes: TP1
    decision: review_required
    reason: testpoint_without_manufacturer_part_identity

  - refdes: J1
    decision: review_required
    reason: connector_value_present_but_manufacturer_and_mpn_missing
```

```yaml
download_manifest:
  materials_root: _workspaces/<project_code>/reference_materials/from_exp_xml
  parts_folder_name: parts

  components:
    - refdes: U1
      manufacturer_part_number: LT3045EDD-1
      DATA Sheet:
        status: saved_mocked_official_file
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        saved_file: parts/LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
      EVAL:
        status: saved_mocked_official_files
        files:
          - type: evaluation_board_user_guide
            source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
            saved_file: parts/LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
          - type: pcb_layout_archive
            source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
            saved_file: parts/LT3045EDD-1/EVAL/DC2222A_design_files.zip

    - refdes: U2
      manufacturer_part_number: MCP73831T-2ACI/OT
      DATA Sheet:
        status: saved_mocked_official_file
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        saved_file: parts/MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
      EVAL:
        status: none_found
        reason: mocked_official_catalog_contains_no_eval_materials

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
        reason: generic_testpoint_no_mpn
      EVAL:
        status: review_required
        reason: generic_testpoint_no_mpn

    - refdes: J1
      DATA Sheet:
        status: review_required
        reason: manufacturer_and_mpn_missing
      EVAL:
        status: review_required
        reason: manufacturer_and_mpn_missing
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    category: DATA Sheet
    saved_file: parts/LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    category: EVAL
    saved_file: parts/LT3045EDD-1/EVAL/DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    category: EVAL
    saved_file: parts/LT3045EDD-1/EVAL/DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    category: DATA Sheet
    saved_file: parts/MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    severity: normal
    issue: generic_passive_without_authoritative_mpn
    required_owner_action: provide approved manufacturer and manufacturer_part_number or mark as commodity_no_download_required

  - refdes: TP1
    severity: normal
    issue: generic_testpoint_without_authoritative_mpn
    required_owner_action: provide approved testpoint part identity or mark as schematic_only_no_download_required

  - refdes: J1
    severity: high
    issue: connector_value_without_manufacturer_or_mpn
    required_owner_action: identify approved USB-C receptacle manufacturer_part_number before collecting datasheet or footprint-critical material
```

```yaml
boundary_review_note:
  source_approval_verdict: pass_with_review_items
  public_private_boundary_verdict: public_safe_synthetic_only
  notes:
    - Used only mocked official-source catalog evidence.
    - Counted only mocked files with official source, byte_size, file_magic, and sha256.
    - No real network access, browser action, file write, credential, customer data, or _workspaces material is represented.
    - R1, TP1, and J1 remain outside authoritative downloads until owner-approved identity exists.
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      status: ready
      reason: official datasheet and official eval materials identified with complete mocked checksum evidence
    - refdes: U2
      status: ready
      reason: official datasheet identified with complete mocked checksum evidence; official eval material none_found is acceptable

  blocked_or_review_components:
    - refdes: R1
      status: review_required
      reason: generic passive has no manufacturer part identity
    - refdes: TP1
      status: review_required
      reason: testpoint has no manufacturer part identity
    - refdes: J1
      status: blocked_for_identity
      reason: connector requires manufacturer and MPN before footprint or datasheet reliance

  next_owner_actions:
    - Confirm whether R1 and TP1 are commodity or require approved MPN-level material.
    - Provide manufacturer and MPN for J1 before any authoritative download collection.
```

Recommendation: proceed with U1 and U2 material manifests; hold R1, TP1, and J1 in review until owner identity decisions are supplied.