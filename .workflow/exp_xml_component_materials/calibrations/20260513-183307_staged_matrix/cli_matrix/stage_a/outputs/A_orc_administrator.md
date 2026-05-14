candidate_id: A_orc_administrator

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: orc
  class: administrator
```

```yaml
component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: DFN-10
    source_property_names:
      - Package.Name
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - PartInst.PartValue
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: place_and_collect_official_materials

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
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    evidence:
      manufacturer: Analog Devices
      mpn: LT3045EDD-1
      datasheet_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      eval_user_guide_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      eval_pcb_archive_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
    note: Identity recovered from Package plus SymbolUserProp because PartValue is placeholder Value.

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: approved
    evidence:
      manufacturer: Microchip Technology
      mpn: MCP73831T-2ACI/OT
      datasheet_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    note: Official datasheet available. No official EVAL material present in the fixture.

  - refdes: R1
    official_source_decision: review_required
    evidence:
      reason: Generic passive with no manufacturer part number evidence.
    note: Keep out of authoritative download set.

  - refdes: TP1
    official_source_decision: review_required
    evidence:
      reason: Symbolic testpoint with no manufacturer part number evidence.
    note: Keep out of authoritative download set.

  - refdes: J1
    official_source_decision: review_required
    evidence:
      reason: Connector identity incomplete and manufacturer field empty.
    note: No authoritative source packet can be asserted from fixture evidence alone.
```

```yaml
download_manifest:
  - refdes: U1
    official_downloads:
      - kind: DATA Sheet
        saved_file: LT3045_datasheet.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        official: true
        byte_size: 1854321
        file_magic: "%PDF-"
        sha256: "1111111111111111111111111111111111111111111111111111111111111111"
      - kind: EVAL
        saved_file: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        official: true
        byte_size: 942210
        file_magic: "%PDF-"
        sha256: "2222222222222222222222222222222222222222222222222222222222222222"
      - kind: EVAL
        saved_file: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        official: true
        byte_size: 321004
        file_magic: "PK"
        sha256: "3333333333333333333333333333333333333333333333333333333333333333"

  - refdes: U2
    official_downloads:
      - kind: DATA Sheet
        saved_file: MCP73831_family_datasheet.pdf
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        official: true
        byte_size: 1210330
        file_magic: "%PDF-"
        sha256: "4444444444444444444444444444444444444444444444444444444444444444"
      - kind: EVAL
        status: none_found
        reason: No official EVAL material exists in the fixture for this Microchip device.

  - refdes: R1
    status: review_required
    reason: No manufacturer part identity available for authoritative downloads.

  - refdes: TP1
    status: review_required
    reason: No manufacturer part identity available for authoritative downloads.

  - refdes: J1
    status: review_required
    reason: Connector identity is incomplete; manufacturer is blank and no official part identity is provided.
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    kind: DATA Sheet
    saved_file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    kind: EVAL
    saved_file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    kind: EVAL
    saved_file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    kind: DATA Sheet
    saved_file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    severity: medium
    reason: Generic passive; no manufacturer part identity evidence.

  - refdes: TP1
    severity: medium
    reason: Symbolic testpoint; no manufacturer part identity evidence.

  - refdes: J1
    severity: high
    reason: Connector identity incomplete; manufacturer blank and no authoritative MPN evidence.

  - refdes: U2
    severity: low
    reason: Datasheet ready, but EVAL material is none_found by official-source evidence rather than downloaded.

  - refdes: U1
    severity: low
    reason: Identity recovered from package and symbol properties, but PartValue is placeholder and should remain traceable to package-derived evidence.
```

```yaml
boundary_review_note:
  source_approval: approved_only_for_mocked_official_sources
  verdict: public_safe
  notes:
    - Used only fixture-provided official-source records.
    - No network access, local project file access, or real download claims are included.
    - No secrets, workspace data, or private project material are introduced.
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
    - For U1, retain package-derived identity and attach the official Analog Devices datasheet plus the two official EVAL artifacts.
    - For U2, attach the official Microchip datasheet and record EVAL as none_found.
    - For R1, TP1, and J1, request identity enrichment or owner-approved review before authoritative material collection.
```

Recommendation: keep U1 and U2 as the only authoritative material targets; route R1, TP1, and J1 to review until their identities are explicitly resolved.