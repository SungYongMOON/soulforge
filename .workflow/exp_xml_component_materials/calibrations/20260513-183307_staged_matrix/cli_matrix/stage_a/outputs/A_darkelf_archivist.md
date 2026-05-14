candidate_id: A_darkelf_archivist

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
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
      - PartValue
      - Package
    identity_confidence: recovered_from_package_and_symbol_props
    action: place_and_collect_official_materials

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - Manufacturer
      - Manufacturer Part Number
      - PCB Footprint
      - PartValue
      - Package
    identity_confidence: direct_part_value_and_mfr_props
    action: place_and_collect_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartValue
      - Package
    identity_confidence: generic_passive_only
    action: review_only_no_authoritative_download

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - Package
    identity_confidence: symbolic_testpoint_only
    action: review_only_no_authoritative_download

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartValue
      - Package
      - Manufacturer
    identity_confidence: connector_generic_only
    action: review_only_no_authoritative_download
```

```yaml
source_discovery_packet:
  U1:
    component_key: analog_devices_lt3045edd_1
    official_source_decision: official_sources_available
    datasheet:
      status: ready
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      mock_file: LT3045_datasheet.pdf
    eval_materials:
      - status: ready
        type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        mock_file: DC2222A_user_guide.pdf
      - status: ready
        type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        mock_file: DC2222A_design_files.zip
    notes:
      - identity recovered from PKG_LT3045EDD_1 because PartValue is placeholder Value
      - official EVAL materials present and countable

  U2:
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: official_sources_available
    datasheet:
      status: ready
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      mock_file: MCP73831_family_datasheet.pdf
    eval_materials:
      - status: none_found
        reason: no official EVAL material provided in mocked source catalog
    notes:
      - datasheet is official and ready
      - record none_found for EVAL instead of inventing substitutes

  R1:
    official_source_decision: review_required
    reason: generic passive with no manufacturer part number evidence

  TP1:
    official_source_decision: review_required
    reason: symbolic testpoint with no manufacturer part number evidence

  J1:
    official_source_decision: review_required
    reason: generic connector entry without manufacturer part number evidence
```

```yaml
download_manifest:
  U1:
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      folder: parts/U1/DATA Sheet
    eval:
      - status: saved
        file_name: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        folder: parts/U1/EVAL
      - status: saved
        file_name: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        folder: parts/U1/EVAL

  U2:
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      folder: parts/U2/DATA Sheet
    eval:
      status: none_found
      reason: no official EVAL material present in mocked official-source catalog

  R1:
    datasheet:
      status: review_required
      reason: generic passive; no manufacturer part identity available
    eval:
      status: review_required
      reason: no manufacturer-specific EVAL expected for a generic resistor

  TP1:
    datasheet:
      status: review_required
      reason: symbolic testpoint; no manufacturer part identity available
    eval:
      status: review_required
      reason: no manufacturer-specific EVAL expected for a testpoint

  J1:
    datasheet:
      status: review_required
      reason: connector identity is generic only; manufacturer part identity missing
    eval:
      status: review_required
      reason: no authoritative EVAL package can be assigned without MPN
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    material: datasheet
    file_name: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    material: eval
    file_name: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    material: eval
    file_name: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    material: datasheet
    file_name: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    issue_type: generic_passive
    reason: no manufacturer part number evidence; keep out of authoritative downloads

  - refdes: TP1
    issue_type: symbolic_testpoint
    reason: no manufacturer part number evidence; keep out of authoritative downloads

  - refdes: J1
    issue_type: connector_unknown
    reason: manufacturer field empty and no part number evidence; review required

  - refdes: U1
    issue_type: identity_recovered_from_package
    reason: PartValue is placeholder Value; confirm recovered identity stays tied to PKG_LT3045EDD_1 mapping

  - refdes: U2
    issue_type: eval_missing
    reason: official datasheet exists but no official EVAL material was provided in the mocked catalog
```

```yaml
boundary_review_note:
  source_approval: passed_for_mocked_official_sources_only
  boundary_verdict: public_safe
  notes:
    - only mocked official-source evidence was used
    - no network, browser, local project file access, or real downloads were claimed
    - no secrets, credentials, or private workspace material were included
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
    - confirm U1 identity remains anchored to PKG_LT3045EDD_1 and its symbol properties
    - file U2 as datasheet-ready with EVAL none_found
    - route R1, TP1, and J1 to review because manufacturer identity is not authoritative enough for material collection
```

Brief recommendation: keep U1 and U2 as the only authoritative material-collection targets; leave the remaining parts in review until manufacturer identity is explicit.