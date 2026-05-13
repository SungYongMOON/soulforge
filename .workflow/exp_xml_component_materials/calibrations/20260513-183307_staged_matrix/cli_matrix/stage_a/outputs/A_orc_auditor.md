candidate_id: A_orc_auditor

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: orc
  class: auditor
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
    action: place_and_collect_official_materials

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
    action: place_and_collect_official_datasheet_only

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
    action: review_required_connector_identity_missing
```

```yaml
source_discovery_packet:
  U1:
    placed_component_source: PartInst
    identity_recovery:
      package_reference: PKG_LT3045EDD_1
      manufacturer_part_number: LT3045EDD-1
      manufacturer: Analog Devices
      confidence: high
    official_source_decision:
      datasheet: approved
      eval_materials: approved
    evidence:
      datasheet_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      eval_user_guide_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      eval_pcb_layout_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip

  U2:
    placed_component_source: PartInst
    identity_recovery:
      part_value: MCP73831T-2ACI/OT
      manufacturer: Microchip Technology
      confidence: high
    official_source_decision:
      datasheet: approved
      eval_materials: none_found
    evidence:
      datasheet_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      eval_search_evidence: no official eval material present in mocked catalog

  R1:
    placed_component_source: PartInst
    identity_recovery:
      part_value: 10k
      manufacturer_part_number: null
      confidence: low
    official_source_decision:
      datasheet: review_required
      eval_materials: review_required
    evidence:
      reason: generic passive without manufacturer-part identity

  TP1:
    placed_component_source: PartInst
    identity_recovery:
      part_value: TESTPOINT
      manufacturer_part_number: null
      confidence: low
    official_source_decision:
      datasheet: review_required
      eval_materials: review_required
    evidence:
      reason: symbolic testpoint without manufacturer-part identity

  J1:
    placed_component_source: PartInst
    identity_recovery:
      part_value: USB-C-16P
      manufacturer: ""
      manufacturer_part_number: null
      confidence: low
    official_source_decision:
      datasheet: review_required
      eval_materials: review_required
    evidence:
      reason: connector identity unresolved; manufacturer blank and no MPN evidence
```

```yaml
download_manifest:
  U1:
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      folder: parts/U1/DATA Sheet
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      status: saved
      files:
        - file_name: DC2222A_user_guide.pdf
          folder: parts/U1/EVAL
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
        - file_name: DC2222A_design_files.zip
          folder: parts/U1/EVAL
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true

  U2:
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      folder: parts/U2/DATA Sheet
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: no official EVAL material present in mocked source catalog

  R1:
    datasheet:
      status: review_required
      reason: generic passive with no manufacturer-part identity
    eval:
      status: review_required
      reason: generic passive with no manufacturer-part identity

  TP1:
    datasheet:
      status: review_required
      reason: symbolic testpoint with no manufacturer-part identity
    eval:
      status: review_required
      reason: symbolic testpoint with no manufacturer-part identity

  J1:
    datasheet:
      status: review_required
      reason: connector identity unresolved; manufacturer blank and no MPN evidence
    eval:
      status: review_required
      reason: connector identity unresolved; manufacturer blank and no MPN evidence
```

```yaml
downloaded_file_checksum_manifest:
  - file_name: LT3045_datasheet.pdf
    source_component: U1
    kind: datasheet
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - file_name: DC2222A_user_guide.pdf
    source_component: U1
    kind: eval
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - file_name: DC2222A_design_files.zip
    source_component: U1
    kind: eval
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - file_name: MCP73831_family_datasheet.pdf
    source_component: U2
    kind: datasheet
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    reason: generic passive; no manufacturer part identity
    severity: medium
    disposition: review_required

  - refdes: TP1
    reason: symbolic testpoint; no manufacturer part identity
    severity: medium
    disposition: review_required

  - refdes: J1
    reason: connector identity unresolved; manufacturer blank and no MPN evidence
    severity: high
    disposition: review_required

  - refdes: U2
    reason: eval material not found in official mocked catalog
    severity: low
    disposition: informational_none_found
```

```yaml
boundary_review_note:
  source_approval: only mocked official sources were used
  public_private_boundary: public-safe synthetic fixture only; no real project files, secrets, downloads, or network access were used
  verdict: approved_for_public_safe_packet
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
    - retain U1 materials as authoritative source set
    - retain U2 datasheet; accept eval none_found as a valid official outcome
    - resolve R1, TP1, and J1 identities before authoritative material collection
```

Recommendation: keep this packet as the calibration baseline; only promote R1, TP1, and J1 after manufacturer identity is confirmed.