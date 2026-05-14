```yaml
candidate_id: B_gpt_5_4_high
profile:
  model: gpt-5.4
  reasoning_effort: high
  species: orc
  class: archivist

component_inventory:
  - refdes: U1
    value: LT3045EDD-1
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: DFN-10
    source_property_names:
      - PartInst.Package
      - PartValue
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - SymbolUserProp.PCB Footprint
      - PartInstUserProp.PCB Footprint
    identity_confidence: high_recovered_from_package_reference
    action: collect_datasheet_and_eval

  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartValue
      - PartInstUserProp.Manufacturer
      - PartInstUserProp.Manufacturer Part Number
      - PartInstUserProp.PCB Footprint
      - PartInst.Package
    identity_confidence: high
    action: collect_datasheet_only

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low_generic_only
    action: review_required

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartValue
      - PartInst.Package
    identity_confidence: low_generic_only
    action: review_required

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: low_nonmanufacturer_value_only
    action: review_required

source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved_mock_official_sources
    identity_route: PartInst.Package -> Package.SymbolUserProp
    datasheet:
      found: true
      official: true
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval_materials:
      - type: evaluation_board_user_guide
        found: true
        official: true
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      - type: pcb_layout_archive
        found: true
        official: true
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
    decision_basis: placeholder PartValue was overridden by explicit package-level manufacturer and MPN properties

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: datasheet_ready_eval_none_found
    identity_route: PartInst + PartInstUserProp
    datasheet:
      found: true
      official: true
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval_materials:
      found: false
      status: none_found
      search_evidence: mock_official_source_catalog entry exists and eval_materials is empty
    decision_basis: explicit manufacturer and MPN on placed component are sufficient for authoritative datasheet collection

  - refdes: R1
    official_source_decision: review_required
    reason: generic passive value and package only; no manufacturer part number evidence

  - refdes: TP1
    official_source_decision: review_required
    reason: test point placeholder only; no manufacturer part number evidence

  - refdes: J1
    official_source_decision: review_required
    reason: connector-like value string without manufacturer or manufacturer part number evidence

download_manifest:
  - refdes: U1
    data_sheet:
      status: counted_saved_file_record
      manufacturer: Analog Devices
      manufacturer_part_number: LT3045EDD-1
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      mock_file: LT3045_datasheet.pdf
      planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet/LT3045_datasheet.pdf
    eval:
      - status: counted_saved_file_record
        type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        mock_file: DC2222A_user_guide.pdf
        planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_user_guide.pdf
      - status: counted_saved_file_record
        type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        mock_file: DC2222A_design_files.zip
        planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_design_files.zip

  - refdes: U2
    data_sheet:
      status: counted_saved_file_record
      manufacturer: Microchip Technology
      manufacturer_part_number: MCP73831T-2ACI/OT
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      mock_file: MCP73831_family_datasheet.pdf
      planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf
    eval:
      status: none_found
      reason: no official eval material is present in mocked official-source evidence for MCP73831T-2ACI/OT

  - refdes: R1
    data_sheet:
      status: review_required
      reason: no authoritative manufacturer part identity
    eval:
      status: review_required
      reason: no authoritative manufacturer part identity

  - refdes: TP1
    data_sheet:
      status: review_required
      reason: no authoritative manufacturer part identity
    eval:
      status: review_required
      reason: no authoritative manufacturer part identity

  - refdes: J1
    data_sheet:
      status: review_required
      reason: connector identity is not authoritative without manufacturer part number evidence
    eval:
      status: review_required
      reason: connector identity is not authoritative without manufacturer part number evidence

downloaded_file_checksum_manifest:
  - refdes: U1
    material_class: DATA_Sheet
    file_name: LT3045_datasheet.pdf
    planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet/LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    material_class: EVAL
    file_name: DC2222A_user_guide.pdf
    planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    material_class: EVAL
    file_name: DC2222A_design_files.zip
    planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: PK

  - refdes: U2
    material_class: DATA_Sheet
    file_name: MCP73831_family_datasheet.pdf
    planned_relpath: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"

circuit_design_review_queue:
  - refdes: R1
    category: generic_component
    blocking_reason: generic resistor value only; manufacturer part number required for authoritative material collection
    required_owner_action: bind R1 to approved manufacturer part number or mark as intentionally generic/non-downloadable

  - refdes: TP1
    category: generic_component
    blocking_reason: test point placeholder only; no manufacturer part number evidence
    required_owner_action: bind TP1 to approved manufacturer part number or mark as intentionally generic/non-downloadable

  - refdes: J1
    category: ambiguous_component
    blocking_reason: USB-C-16P is not authoritative manufacturer identity and manufacturer field is blank
    required_owner_action: provide manufacturer and manufacturer part number before authoritative source collection

boundary_review_note:
  source_approval_verdict: approved_only_for mocked official-source entries marked official with byte_size, file_magic, and sha256
  public_private_boundary_verdict: public_safe_synthetic_packet
  boundary_basis:
    - derived only from the provided synthetic fixture
    - no real project files, secrets, credentials, cookies, or workspace materials included
    - no non-official mirrors or substitute sources introduced

circuit_design_readiness_note:
  ready_components:
    - refdes: U1
      status: ready
      note: authoritative datasheet and official eval packet identified and countable
    - refdes: U2
      status: ready
      note: authoritative datasheet identified; official eval none_found is acceptable and not a failure
  blocked_or_review_components:
    - refdes: R1
      status: review_required
      note: generic passive without MPN
    - refdes: TP1
      status: review_required
      note: generic test point without MPN
    - refdes: J1
      status: review_required
      note: connector identity incomplete
  next_owner_actions:
    - proceed with manifest generation for U1 and U2 authoritative materials
    - resolve manufacturer part identity for J1 before any authoritative download claim
    - decide whether R1 and TP1 remain intentionally generic or must be bound to approved MPNs
```

Recommendation: promote U1 and U2 into the ready materials path now, and hold R1, TP1, and J1 behind owner identity resolution.