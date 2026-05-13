candidate_id: A_darkelf_auditor

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: darkelf
  class: auditor

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
      - PartInstUserProp.PCB Footprint
    identity_confidence: high
    action: place_and_source_official_materials

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
    action: place_and_source_official_materials

  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names:
      - PartInst.PartValue
    identity_confidence: low
    action: review_required_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
    identity_confidence: low
    action: review_required_symbolic_testpoint

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_required_connector_identity

source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision:
      datasheet:
        url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
        status: accepted_official
        reason: Manufacturer and MPN resolved from package and symbol properties even though PartValue is placeholder.
      eval_materials:
        - type: evaluation_board_user_guide
          url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
          status: accepted_official
        - type: pcb_layout_archive
          url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
          status: accepted_official
    notes:
      - U1 identity recovered from PKG_LT3045EDD_1 and SymbolUserProp fields.
      - Package node alone was not treated as a placed BOM line.

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision:
      datasheet:
        url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
        status: accepted_official
        reason: Exact manufacturer part number is present on PartInst.
      eval_materials:
        status: none_found
        reason: No official EVAL material present in the mocked source catalog for this part.

  - refdes: R1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Generic passive with no manufacturer part identity.
      eval_materials:
        status: none_found
        reason: No owner-approved official evaluation material expected for a generic resistor.

  - refdes: TP1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Symbolic test point has no manufacturer part identity.
      eval_materials:
        status: none_found
        reason: No owner-approved official evaluation material expected for a test point.

  - refdes: J1
    official_source_decision:
      datasheet:
        status: review_required
        reason: Connector identity is incomplete because manufacturer is blank and no part number evidence is present.
      eval_materials:
        status: none_found
        reason: No official evaluation material can be justified without manufacturer part identity.

download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      folder: DATA Sheet
    eval:
      - status: saved
        file_name: DC2222A_user_guide.pdf
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        folder: EVAL
      - status: saved
        file_name: DC2222A_design_files.zip
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        folder: EVAL

  - refdes: U2
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      folder: DATA Sheet
    eval:
      status: none_found
      reason: No official EVAL material in mocked catalog.

  - refdes: R1
    datasheet:
      status: review_required
      reason: Generic passive; no manufacturer part identity to source.
    eval:
      status: none_found
      reason: Not applicable.

  - refdes: TP1
    datasheet:
      status: review_required
      reason: Symbolic test point; no manufacturer part identity to source.
    eval:
      status: none_found
      reason: Not applicable.

  - refdes: J1
    datasheet:
      status: review_required
      reason: Connector manufacturer identity missing; do not authorize authoritative downloads.
    eval:
      status: none_found
      reason: Not applicable.

downloaded_file_checksum_manifest:
  - refdes: U1
    file_name: LT3045_datasheet.pdf
    source_kind: official
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
    byte_size: 1854321
    file_magic: "%PDF-"

  - refdes: U1
    file_name: DC2222A_user_guide.pdf
    source_kind: official
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
    byte_size: 942210
    file_magic: "%PDF-"

  - refdes: U1
    file_name: DC2222A_design_files.zip
    source_kind: official
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
    byte_size: 321004
    file_magic: "PK"

  - refdes: U2
    file_name: MCP73831_family_datasheet.pdf
    source_kind: official
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"
    byte_size: 1210330
    file_magic: "%PDF-"

circuit_design_review_queue:
  - refdes: R1
    issue_type: generic_passive
    severity: low
    reason: No manufacturer part identity; keep out of authoritative download set.

  - refdes: TP1
    issue_type: symbolic_testpoint
    severity: low
    reason: No manufacturer part identity; no official source packet expected.

  - refdes: J1
    issue_type: connector_identity_missing
    severity: medium
    reason: Blank manufacturer and no MPN evidence; requires part identity resolution before sourcing.

  - refdes: U1
    issue_type: placeholder_partvalue
    severity: medium
    reason: PartValue is placeholder Value; identity recovered from package and symbol properties only.

boundary_review_note:
  source_approval: official mocked vendor sources only; no mirrors used
  boundary_verdict: public_safe
  notes:
    - No real downloads, network actions, or local file writes are claimed.
    - Only fixture-provided official source records are counted as downloaded artifacts.
    - Private project data, secrets, and _workspaces material remain excluded.

circuit_design_readiness_note:
  ready_components:
    - U1
    - U2
  blocked_or_review_components:
    - R1
    - TP1
    - J1
  next_owner_actions:
    - Verify U1 placement against LT3045EDD-1 packaging and keep placeholder PartValue from becoming authoritative identity.
    - Carry U2 datasheet as complete; record eval as none_found rather than failure.
    - Resolve J1 manufacturer and MPN before attempting any authoritative material collection.
    - Leave generic passives and symbolic items in review queue unless later BOM evidence upgrades them.
```

Recommendation: keep U1 and U2 in the material pack, and route R1, TP1, and J1 to review until part identity is explicit.