candidate_id: A_dwarf_archivist

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
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
    identity_confidence: high
    action: place_and_collect_official_sources

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
      - PartInst.Package
    identity_confidence: high
    action: place_and_collect_official_sources

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_symbolic_testpoint

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
    action: review_required_connector_no_mpn
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    datasheet:
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      mock_file: LT3045_datasheet.pdf
      status: found
    eval_materials:
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        mock_file: DC2222A_user_guide.pdf
        status: found
      - type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        mock_file: DC2222A_design_files.zip
        status: found
    note: Official source and eval package are available for the recovered U1 identity.

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: approved
    datasheet:
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      mock_file: MCP73831_family_datasheet.pdf
      status: found
    eval_materials:
      - type: evaluation_board_user_guide
        status: none_found
      - type: pcb_layout_archive
        status: none_found
    note: Datasheet is official and ready; no official EVAL material is present in the fixture, so record none_found.

  - refdes: R1
    official_source_decision: review_required
    reason: Generic passive with no manufacturer part number evidence.

  - refdes: TP1
    official_source_decision: review_required
    reason: Symbolic testpoint with no manufacturer part number evidence.

  - refdes: J1
    official_source_decision: review_required
    reason: Connector identity is ambiguous; manufacturer part number is unavailable.
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      folder: parts/U1/DATA Sheet
    eval:
      status: saved
      files:
        - file_name: DC2222A_user_guide.pdf
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          folder: parts/U1/EVAL
        - file_name: DC2222A_design_files.zip
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          folder: parts/U1/EVAL

  - refdes: U2
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      folder: parts/U2/DATA Sheet
    eval:
      status: none_found
      reason: No official EVAL material present in mocked official-source catalog.

  - refdes: R1
    datasheet:
      status: review_required
      reason: Generic passive without manufacturer part identity.
    eval:
      status: review_required
      reason: No official eval source should be inferred for a generic resistor.

  - refdes: TP1
    datasheet:
      status: review_required
      reason: Symbolic test point without manufacturer part identity.
    eval:
      status: review_required
      reason: No official eval source should be inferred for a symbolic test point.

  - refdes: J1
    datasheet:
      status: review_required
      reason: Connector identity unavailable; manufacturer part number not supplied.
    eval:
      status: review_required
      reason: No official eval source should be inferred without manufacturer part identity.
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    file_name: LT3045_datasheet.pdf
    folder: parts/U1/DATA Sheet
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    file_name: DC2222A_user_guide.pdf
    folder: parts/U1/EVAL
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    file_name: DC2222A_design_files.zip
    folder: parts/U1/EVAL
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    file_name: MCP73831_family_datasheet.pdf
    folder: parts/U2/DATA Sheet
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    item_type: generic_passive
    issue: No manufacturer part number evidence.
    disposition: review_required

  - refdes: TP1
    item_type: testpoint
    issue: Symbolic part only; no authoritative manufacturer identity.
    disposition: review_required

  - refdes: J1
    item_type: connector
    issue: Manufacturer field is blank and no manufacturer part number is available.
    disposition: review_required

  - refdes: U2
    item_type: eval_material_gap
    issue: Official datasheet exists, but official EVAL material is none_found in the fixture.
    disposition: informational_blocker_only

  - refdes: U1
    item_type: identity_recovered_from_package
    issue: PartValue is placeholder Value; identity recovered from package and symbol properties.
    disposition: accepted_with_high_confidence
```

```yaml
boundary_review_note:
  source_approval: official mocked sources only
  public_private_boundary_verdict: public_safe
  notes:
    - No real project files, secrets, downloads, or network actions are claimed.
    - Only fixture-provided official-source evidence is counted as downloaded.
    - No fallback to mirrors, stale pointers, or inferred vendor binaries is used.
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
    - Preserve U1 identity from PKG_LT3045EDD_1 and package-level symbol properties.
    - Keep U2 datasheet material and record official EVAL as none_found.
    - Route R1, TP1, and J1 to manual review until manufacturer identity or approved part mapping is supplied.
```

Recommendation: treat U1 and U2 as authoritative materialized parts, and leave the remaining refdes entries in review until manufacturer identity is confirmed.