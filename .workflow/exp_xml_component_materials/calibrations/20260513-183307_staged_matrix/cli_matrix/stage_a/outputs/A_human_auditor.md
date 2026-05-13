candidate_id: A_human_auditor

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: auditor
```

```yaml
component_inventory:
  - refdes: U1
    value: "Value"
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: PKG_LT3045EDD_1
    source_property_names:
      - Manufacturer_Part_Number
      - Mfr_Name
      - PackageName
      - PCB Footprint
    identity_confidence: medium
    action: place_and_material_collect

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - Manufacturer
      - Manufacturer Part Number
      - PCB Footprint
    identity_confidence: high
    action: place_and_material_collect

  - refdes: R1
    value: "10k"
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names: []
    identity_confidence: low
    action: review_queue_only

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names: []
    identity_confidence: low
    action: review_queue_only

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - Manufacturer
    identity_confidence: low
    action: review_queue_only
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision:
      datasheet:
        status: ready
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        mock_file: LT3045_datasheet.pdf
      eval_materials:
        - type: evaluation_board_user_guide
          status: ready
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          mock_file: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          status: ready
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          mock_file: DC2222A_design_files.zip
    source_notes:
      - Identity recovered from Package plus SymbolUserProp because PartValue is placeholder Value.

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision:
      datasheet:
        status: ready
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        mock_file: MCP73831_family_datasheet.pdf
      eval_materials:
        status: none_found
        reason: No official EVAL material listed in the mocked catalog.
    source_notes:
      - Identity confirmed directly from PartValue and Manufacturer Part Number.

  - refdes: R1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Generic passive with no manufacturer part identity.
      eval_materials:
        status: none_found
        reason: Not applicable for generic passive.
    source_notes:
      - Treat as review queue item only.

  - refdes: TP1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Test point has symbolic placeholder identity only.
      eval_materials:
        status: none_found
        reason: Not applicable for test point.
    source_notes:
      - Treat as review queue item only.

  - refdes: J1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Connector identity is incomplete; manufacturer absent.
      eval_materials:
        status: none_found
        reason: No official manufacturer-linked source available from fixture.
    source_notes:
      - Treat as review queue item only.
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval:
      - type: evaluation_board_user_guide
        status: saved
        file: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - type: pcb_layout_archive
        status: saved
        file: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip

  - refdes: U2
    datasheet:
      status: saved
      file: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval:
      status: none_found
      reason: No official EVAL material exists in the mocked catalog.

  - refdes: R1
    datasheet:
      status: review_required
      reason: Generic passive; no manufacturer part identity available.
    eval:
      status: none_found
      reason: No eval material expected for generic passive.

  - refdes: TP1
    datasheet:
      status: review_required
      reason: Symbolic test point; no manufacturer part identity available.
    eval:
      status: none_found
      reason: No eval material expected for test point.

  - refdes: J1
    datasheet:
      status: review_required
      reason: Connector identity incomplete; manufacturer absent.
    eval:
      status: none_found
      reason: No official eval material available from fixture.
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    issue: generic_passive
    reason: No manufacturer part number evidence; not authoritative for material collection.

  - refdes: TP1
    issue: symbolic_test_point
    reason: Placeholder identity only; no vendor material to collect.

  - refdes: J1
    issue: incomplete_connector_identity
    reason: Manufacturer missing; source trace is insufficient for authoritative download.

  - refdes: U1
    issue: placeholder_partvalue
    reason: PartValue is placeholder Value; identity recovered from package and symbol properties, but should be confirmed if upstream symbol data changes.
```

```yaml
boundary_review_note:
  source_approval: official_only_mocks_used
  public_private_boundary_verdict: public_safe
  notes:
    - No network access, real downloads, secrets, or private project data were used.
    - All counted files are mocked official-source artifacts with byte size, file magic, and SHA256 present.
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
    - Confirm U1 identity upstream if the placeholder PartValue is expected to remain unstable.
    - Leave U2 marked ready; keep EVAL as none_found because the fixture provides no official evaluation material.
    - Route R1, TP1, and J1 to review until manufacturer-part identity is available.
```

Recommendation: a runner can emit the four required `*_yaml` manifests directly from this packet; only the generic and identity-incomplete parts need review gating.