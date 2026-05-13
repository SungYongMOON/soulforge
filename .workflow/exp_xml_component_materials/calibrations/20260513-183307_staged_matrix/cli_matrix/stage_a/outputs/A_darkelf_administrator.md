candidate_id: A_darkelf_administrator

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
  class: administrator
```

```yaml
component_inventory:
  - refdes: U1
    value: LT3045EDD-1
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
      - PartInst.PartValue
    identity_confidence: high
    action: place_and_collect_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required_symbolic_testpoint

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
    action: review_required_connector_identity_missing
```

```yaml
source_discovery_packet:
  - refdes: U1
    official_source_decision:
      status: approved
      manufacturer: Analog Devices
      mpn: LT3045EDD-1
      datasheet:
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        official: true
        mock_file: LT3045_datasheet.pdf
      eval_materials:
        - type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
          mock_file: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
          mock_file: DC2222A_design_files.zip

  - refdes: U2
    official_source_decision:
      status: approved
      manufacturer: Microchip Technology
      mpn: MCP73831T-2ACI/OT
      datasheet:
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        official: true
        mock_file: MCP73831_family_datasheet.pdf
      eval_materials:
        status: none_found
        evidence: official_eval_materials_not_present_in_mock_catalog

  - refdes: R1
    official_source_decision:
      status: review_required
      reason: generic_passive_no_manufacturer_part_identity

  - refdes: TP1
    official_source_decision:
      status: review_required
      reason: symbolic_testpoint_no_manufacturer_part_identity

  - refdes: J1
    official_source_decision:
      status: review_required
      reason: connector_identity_missing_manufacturer_part_number
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      folder: parts/U1/DATA Sheet
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval:
      - status: saved
        file_name: DC2222A_user_guide.pdf
        folder: parts/U1/EVAL
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - status: saved
        file_name: DC2222A_design_files.zip
        folder: parts/U1/EVAL
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip

  - refdes: U2
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      folder: parts/U2/DATA Sheet
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval:
      status: none_found
      reason: official_eval_materials_not_present_in_mock_catalog

  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_authoritative_manufacturer_identity
    eval:
      status: review_required
      reason: generic_passive_no_authoritative_manufacturer_identity

  - refdes: TP1
    datasheet:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_manufacturer_identity
    eval:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_manufacturer_identity

  - refdes: J1
    datasheet:
      status: review_required
      reason: connector_identity_missing_manufacturer_part_number
    eval:
      status: review_required
      reason: connector_identity_missing_manufacturer_part_number
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
    category: generic_passive
    issue: no manufacturer part number evidence
    priority: medium

  - refdes: TP1
    category: symbolic_testpoint
    issue: no manufacturer part number evidence
    priority: medium

  - refdes: J1
    category: connector
    issue: missing manufacturer and manufacturer part number
    priority: high

  - refdes: U2
    category: eval_materials
    issue: no official eval material in mock catalog
    priority: low
    note: datasheet is approved; absence of EVAL is not a failure

  - refdes: U1
    category: none
    issue: none
    priority: none
```

```yaml
boundary_review_note:
  source_approval: official_mock_sources_only
  public_private_boundary_verdict: public_safe
  notes:
    - no network access claimed
    - no real project files or secrets used
    - only mocked official-source records counted as downloaded
    - no mirror, credential, cookie, or private-state material included
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
    - collect or confirm authoritative identities for R1, TP1, and J1 before authoritative material routing
    - keep U1 datasheet plus both official EVAL artifacts in the saved-materials set
    - keep U2 datasheet in the saved-materials set and record EVAL as none_found
```

Recommendation: route this packet directly into the runner’s YAML manifest writer with U1 and U2 marked ready, and send R1, TP1, and J1 to manual identity review.