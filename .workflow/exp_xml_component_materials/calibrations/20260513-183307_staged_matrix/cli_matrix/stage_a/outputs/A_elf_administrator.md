candidate_id: A_elf_administrator
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: elf
  class: administrator

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
    identity_confidence: high
    action: place_and_collect_official_materials
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names: []
    identity_confidence: low
    action: review_required_generic_passive
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names: []
    identity_confidence: low
    action: review_required_symbolic_testpoint
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - Manufacturer
    identity_confidence: low
    action: review_required_connector_identity_missing

source_discovery_packet:
  - refdes: U1
    official_source_decision: approved
    decision_basis:
      - PartInst identity recovered from PKG_LT3045EDD_1
      - Manufacturer_Part_Number and Mfr_Name present in symbol properties
      - PartValue is placeholder and not used as identity
    official_sources:
      datasheet:
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        official: true
      eval_materials:
        - type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
        - type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
  - refdes: U2
    official_source_decision: approved
    decision_basis:
      - Manufacturer and Manufacturer Part Number present directly on PartInst
      - Official datasheet available
      - No official EVAL material listed in mocked catalog
    official_sources:
      datasheet:
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        official: true
      eval_materials: []

download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      saved_file: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval:
      - status: saved
        saved_file: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - status: saved
        saved_file: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - refdes: U2
    datasheet:
      status: saved
      saved_file: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval:
      status: none_found
      reason: official_eval_material_not_listed_in_mock_catalog

downloaded_file_checksum_manifest:
  - refdes: U1
    artifact_type: datasheet
    saved_file: LT3045_datasheet.pdf
    sha256: 1111111111111111111111111111111111111111111111111111111111111111
    byte_size: 1854321
    file_magic: "%PDF-"
  - refdes: U1
    artifact_type: eval
    saved_file: DC2222A_user_guide.pdf
    sha256: 2222222222222222222222222222222222222222222222222222222222222222
    byte_size: 942210
    file_magic: "%PDF-"
  - refdes: U1
    artifact_type: eval
    saved_file: DC2222A_design_files.zip
    sha256: 3333333333333333333333333333333333333333333333333333333333333333
    byte_size: 321004
    file_magic: "PK"
  - refdes: U2
    artifact_type: datasheet
    saved_file: MCP73831_family_datasheet.pdf
    sha256: 4444444444444444444444444444444444444444444444444444444444444444
    byte_size: 1210330
    file_magic: "%PDF-"

circuit_design_review_queue:
  - refdes: R1
    reason: generic_passive_without_manufacturer_part_number
    severity: review_required
  - refdes: TP1
    reason: symbolic_testpoint_without_manufacturer_part_number
    severity: review_required
  - refdes: J1
    reason: connector_identity_missing_no_mpn_evidence
    severity: review_required
  - refdes: U2
    reason: official_eval_material_not_found
    severity: informational_review

boundary_review_note:
  source_approval: official_only_sources_accepted
  public_private_boundary_verdict: public_safe
  notes:
    - No secrets, credentials, cookies, customer data, or workspace-private materials are introduced.
    - Only mocked official-source evidence from the fixture is used.
    - No claim is made of actual network access, downloads, or file writes.

circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - Collect or confirm MPN-level identity for J1 before authoritative material collection.
    - Confirm whether R1 is a standard passive that should be excluded from material download scope.
    - Confirm whether TP1 should remain a symbolic testpoint or map to a real hardware part.
    - For U2, retain datasheet only and mark EVAL as none_found unless a later official source is provided.

closing_recommendation: Keep U1 and U2 in the authoritative material set; route R1, TP1, and J1 to review until identity evidence is strengthened.