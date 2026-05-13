candidate_id: B_gpt_5_4_mini_high
```yaml
candidate_id: B_gpt_5_4_mini_high
profile:
  model: gpt-5.4-mini
  reasoning_effort: high
  species: orc
  class: archivist

component_inventory:
  - refdes: U1
    value: LT3045EDD-1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: PKG_LT3045EDD_1
    source_property_names:
      - PartValue
      - Manufacturer_Part_Number
      - Mfr_Name
      - PackageName
      - PCB Footprint
      - Package
    identity_confidence: high
    action: capture_official_materials

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
      - Package
    identity_confidence: high
    action: capture_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartValue
      - Package
    identity_confidence: low
    action: review_required_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - Package
    identity_confidence: low
    action: review_required_symbolic_testpoint

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartValue
      - Manufacturer
      - Package
    identity_confidence: low
    action: review_required_missing_manufacturer_identity

source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    placed_component_source: PartInst
    decision: approved_official
    basis:
      - "Identity recovered from PKG_LT3045EDD_1 because PartValue is placeholder Value."
      - "Official Analog Devices datasheet and eval materials are present in the mocked catalog."
    official_source:
      manufacturer: Analog Devices
      mpn: LT3045EDD-1
      datasheet:
        source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
        official: true
      eval_materials:
        - type: evaluation_board_user_guide
          source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
          official: true
        - type: pcb_layout_archive
          source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"
          official: true

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    placed_component_source: PartInst
    decision: approved_official
    basis:
      - "Direct MPN evidence exists on PartInst and PartInstUserProp."
      - "Official Microchip datasheet is present in the mocked catalog."
      - "No official EVAL material is present in the mocked catalog."
    official_source:
      manufacturer: Microchip Technology
      mpn: MCP73831T-2ACI/OT
      datasheet:
        source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
        official: true
      eval_materials: none_found

  - refdes: R1
    component_key: null
    placed_component_source: PartInst
    decision: review_required
    basis:
      - "Generic passive with no manufacturer part number evidence."
      - "Not eligible for authoritative vendor download selection."
    official_source: none

  - refdes: TP1
    component_key: null
    placed_component_source: PartInst
    decision: review_required
    basis:
      - "Symbolic testpoint without manufacturer identity."
      - "Not eligible for authoritative vendor download selection."
    official_source: none

  - refdes: J1
    component_key: null
    placed_component_source: PartInst
    decision: review_required
    basis:
      - "Connector identity is incomplete; manufacturer property is blank."
      - "Not eligible for authoritative vendor download selection."
    official_source: none

download_manifest:
  - refdes: U1
    "DATA Sheet":
      status: saved
      saved_file: LT3045_datasheet.pdf
      source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
      official: true
      byte_size: 1854321
      file_magic: "%PDF-"
      sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    "EVAL":
      status: saved
      saved_files:
        - saved_file: DC2222A_user_guide.pdf
          type: evaluation_board_user_guide
          source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
          official: true
          byte_size: 942210
          file_magic: "%PDF-"
          sha256: "2222222222222222222222222222222222222222222222222222222222222222"
        - saved_file: DC2222A_design_files.zip
          type: pcb_layout_archive
          source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"
          official: true
          byte_size: 321004
          file_magic: "PK"
          sha256: "3333333333333333333333333333333333333333333333333333333333333333"

  - refdes: U2
    "DATA Sheet":
      status: saved
      saved_file: MCP73831_family_datasheet.pdf
      source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
      official: true
      byte_size: 1210330
      file_magic: "%PDF-"
      sha256: "444444444444444444444444444444444444444444444444444444444444444444"
    "EVAL":
      status: none_found
      reason: "No official EVAL material present in the mocked catalog."

  - refdes: R1
    "DATA Sheet":
      status: review_required
      reason: "Generic passive; no manufacturer part number evidence."
    "EVAL":
      status: review_required
      reason: "Vendor-specific EVAL material is not applicable without manufacturer identity."

  - refdes: TP1
    "DATA Sheet":
      status: review_required
      reason: "Symbolic testpoint; no manufacturer part number evidence."
    "EVAL":
      status: review_required
      reason: "Vendor-specific EVAL material is not applicable without manufacturer identity."

  - refdes: J1
    "DATA Sheet":
      status: review_required
      reason: "Connector identity is incomplete; manufacturer is blank."
    "EVAL":
      status: review_required
      reason: "Vendor-specific EVAL material is not applicable without manufacturer identity."

downloaded_file_checksum_manifest:
  - refdes: U1
    material: DATA Sheet
    saved_file: LT3045_datasheet.pdf
    source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    material: EVAL
    saved_file: DC2222A_user_guide.pdf
    source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    material: EVAL
    saved_file: DC2222A_design_files.zip
    source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    material: DATA Sheet
    saved_file: MCP73831_family_datasheet.pdf
    source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"

circuit_design_review_queue:
  - refdes: R1
    issue: generic_passive
    reason: "10k resistor lacks manufacturer identity and should not receive authoritative vendor downloads."
  - refdes: TP1
    issue: symbolic_testpoint
    reason: "TESTPOINT is symbolic and lacks manufacturer part evidence."
  - refdes: J1
    issue: missing_manufacturer_identity
    reason: "USB-C-16P has blank manufacturer data and no MPN evidence."

boundary_review_note:
  source_approval: "Approved: only mocked official sources from the public-safe fixture were used."
  public_private_boundary_verdict: "Public-safe packet only; no real downloads, no network access, no secrets, and no `_workspaces` or private-state material are included."

circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      status: ready
      basis: "Official Analog Devices datasheet plus official eval user guide and design archive."
    - refdes: U2
      status: ready
      basis: "Official Microchip datasheet is present; eval material is none_found, not a failure."
  blocked_or_review_components:
    - refdes: R1
      status: review_required
      basis: "Generic passive without manufacturer part number evidence."
    - refdes: TP1
      status: review_required
      basis: "Symbolic testpoint without manufacturer identity."
    - refdes: J1
      status: review_required
      basis: "Connector identity is incomplete and manufacturer is blank."
  next_owner_actions:
    - "Promote U1 and U2 material records into the runner's YAML manifests."
    - "Keep R1, TP1, and J1 in review until manufacturer identity is resolved."
```