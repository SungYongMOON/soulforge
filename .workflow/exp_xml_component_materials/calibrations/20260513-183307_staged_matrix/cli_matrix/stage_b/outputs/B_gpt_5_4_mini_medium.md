candidate_id: B_gpt_5_4_mini_medium

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: medium
  species: orc
  class: archivist

component_inventory:
  - refdes: U1
    value: Value
    manufacturer: Analog Devices
    manufacturer_part_number: LT3045EDD-1
    package: DFN-10
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - Package.Name
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
      - SymbolUserProp.PCB_Footprint
      - PartInstUserProp.PCB_Footprint
    identity_confidence: high
    action: ready_for_materials
  - refdes: U2
    value: MCP73831T-2ACI/OT
    manufacturer: Microchip Technology
    manufacturer_part_number: MCP73831T-2ACI/OT
    package: SOT23-5
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
      - PartInstUserProp.Manufacturer_Part_Number
      - PartInstUserProp.PCB_Footprint
    identity_confidence: high
    action: ready_for_materials
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
    identity_confidence: low
    action: review_required
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.RefDes
      - PartInst.PartValue
      - PartInst.Package
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_required

source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    decision: official_source_ready
    official_sources:
      datasheet:
        source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        mock_file: LT3045_datasheet.pdf
      eval_materials:
        - type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          mock_file: DC2222A_user_guide.pdf
        - type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          mock_file: DC2222A_design_files.zip
    notes:
      - PartInst identity recovered from Package and SymbolUserProp because PartValue is placeholder Value.
      - Official evaluation materials are present and countable.
  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    decision: official_source_ready
    official_sources:
      datasheet:
        source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        mock_file: MCP73831_family_datasheet.pdf
      eval_materials: []
    notes:
      - Datasheet is official and countable.
      - Official EVAL material is none_found, which is acceptable and not a failure.
  - refdes: R1
    component_key: generic_passive_0603_10k
    decision: review_required
    official_sources: []
    notes:
      - Generic passive with no manufacturer part number evidence.
      - Do not invent authoritative downloads.
  - refdes: TP1
    component_key: symbolic_testpoint_tp
    decision: review_required
    official_sources: []
    notes:
      - Symbolic test point with no manufacturer part number evidence.
      - Do not invent authoritative downloads.
  - refdes: J1
    component_key: usb_c_receptacle_generic
    decision: review_required
    official_sources: []
    notes:
      - USB-C receptacle lacks manufacturer evidence and part number.
      - Do not treat the package name as an authoritative download source.

download_manifest:
  U1:
    datasheet:
      status: saved_file
      saved_file: LT3045_datasheet.pdf
      target_folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      status: saved_files
      target_folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL
      files:
        - saved_file: DC2222A_user_guide.pdf
          type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          official: true
        - saved_file: DC2222A_design_files.zip
          type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          official: true
  U2:
    datasheet:
      status: saved_file
      saved_file: MCP73831_family_datasheet.pdf
      target_folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: official catalog contains no EVAL materials for MCP73831T-2ACI/OT
  R1:
    datasheet:
      status: review_required
      reason: generic passive with no manufacturer part number evidence
    eval:
      status: review_required
      reason: no official evaluation material expected for a generic passive line item
  TP1:
    datasheet:
      status: review_required
      reason: symbolic test point with no manufacturer part number evidence
    eval:
      status: review_required
      reason: no official evaluation material expected for a symbolic test point
  J1:
    datasheet:
      status: review_required
      reason: connector identity is not manufacturer-backed in the fixture
    eval:
      status: review_required
      reason: no official evaluation material can be asserted without manufacturer identity

downloaded_file_checksum_manifest:
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    file_role: datasheet
    saved_file: LT3045_datasheet.pdf
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    file_role: eval_user_guide
    saved_file: DC2222A_user_guide.pdf
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
  - component_key: analog_devices_lt3045edd_1
    refdes: U1
    file_role: eval_pcb_layout_archive
    saved_file: DC2222A_design_files.zip
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"
    source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - component_key: microchip_mcp73831t_2aci_ot
    refdes: U2
    file_role: datasheet
    saved_file: MCP73831_family_datasheet.pdf
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"
    source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf

circuit_design_review_queue:
  - refdes: R1
    issue_type: generic_part
    reason: 10k resistor has no manufacturer-backed identity in the fixture.
    owner_action: provide manufacturer part number or approve generic passive handling.
  - refdes: TP1
    issue_type: symbolic_part
    reason: testpoint is symbolic only and not an authoritative download target.
    owner_action: confirm whether it should remain a non-material symbol or supply a vendor-backed part.
  - refdes: J1
    issue_type: missing_identity
    reason: USB-C receptacle lacks manufacturer and MPN evidence.
    owner_action: provide connector manufacturer part number or approved source record.
  - refdes: U2
    issue_type: eval_none_found
    reason: official datasheet exists, but no official EVAL material is present.
    owner_action: proceed with datasheet-only material set.

boundary_review_note:
  source_approval: approved
  verdict: public-safe
  rationale:
    - Only mocked official-source evidence from the synthetic fixture was used.
    - No real project files, secrets, credentials, cookies, or workspace data were accessed.
    - No mirrors or unapproved sources were introduced.
    - U2 EVAL is recorded as none_found rather than fabricated.

circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - Materialize U1 and U2 under parts/<refdes>/DATA Sheet and parts/<refdes>/EVAL using the mocked official files.
    - Keep U2 as datasheet-only until official EVAL evidence appears.
    - Resolve R1, TP1, and J1 with manufacturer-backed identity before authoritative material collection.
```

Brief recommendation: promote U1 and U2 as ready, and leave R1, TP1, and J1 in review until manufacturer-backed identity is supplied.