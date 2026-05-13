candidate_id: A_human_administrator

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: human
  class: administrator
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
    identity_confidence: recovered_from_package_and_symbol_props
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
    identity_confidence: direct_partinst_evidence
    action: place_and_collect_datasheet_only
  - refdes: R1
    value: 10k
    manufacturer: null
    manufacturer_part_number: null
    package: 0603
    source_property_names: []
    identity_confidence: generic_passive_only
    action: review_queue
  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names: []
    identity_confidence: symbolic_testpoint_only
    action: review_queue
  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - Manufacturer
    identity_confidence: insufficient_manufacturer_evidence
    action: review_queue
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    source_type: datasheet
    source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    official: true
    discovered_identity: LT3045EDD-1
    notes:
      - PartValue was placeholder, so identity was recovered from Package and SymbolUserProp evidence.
      - Treat as authoritative placed component.
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    source_type: eval_material
    eval_kind: evaluation_board_user_guide
    source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
    official: true
    notes:
      - Official evaluation documentation available.
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    source_type: eval_material
    eval_kind: pcb_layout_archive
    source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
    official: true
    notes:
      - Official evaluation design archive available.
  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: approved
    source_type: datasheet
    source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    official: true
    discovered_identity: MCP73831T-2ACI/OT
    notes:
      - Datasheet is official and sufficient for material collection.
      - No official eval material exists in the fixture.
  - refdes: R1
    official_source_decision: review_required
    source_type: none
    reason: generic_passive_no_manufacturer_part_number
  - refdes: TP1
    official_source_decision: review_required
    source_type: none
    reason: symbolic_testpoint_no_manufacturer_part_number
  - refdes: J1
    official_source_decision: review_required
    source_type: none
    reason: connector_without_manufacturer_part_number_evidence
```

```yaml
download_manifest:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    datasheet:
      status: saved
      file_name: LT3045_datasheet.pdf
      folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      official: true
    eval:
      status: saved
      file_name: DC2222A_user_guide.pdf
      folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL
      source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
      official: true
    eval_extra:
      status: saved
      file_name: DC2222A_design_files.zip
      folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL
      source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
      official: true
  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    datasheet:
      status: saved
      file_name: MCP73831_family_datasheet.pdf
      folder: _workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      official: true
    eval:
      status: none_found
      reason: no_official_eval_material_in_mock_catalog
  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_authoritative_mpn
    eval:
      status: review_required
      reason: generic_passive_no_authoritative_mpn
  - refdes: TP1
    datasheet:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_mpn
    eval:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_mpn
  - refdes: J1
    datasheet:
      status: review_required
      reason: connector_without_authoritative_manufacturer_part_number
    eval:
      status: review_required
      reason: connector_without_authoritative_manufacturer_part_number
```

```yaml
downloaded_file_checksum_manifest:
  - refdes: U1
    file_name: LT3045_datasheet.pdf
    sha256: 1111111111111111111111111111111111111111111111111111111111111111
    byte_size: 1854321
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
  - refdes: U1
    file_name: DC2222A_user_guide.pdf
    sha256: 2222222222222222222222222222222222222222222222222222222222222222
    byte_size: 942210
    file_magic: "%PDF-"
    source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
  - refdes: U1
    file_name: DC2222A_design_files.zip
    sha256: 3333333333333333333333333333333333333333333333333333333333333333
    byte_size: 321004
    file_magic: "PK"
    source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
  - refdes: U2
    file_name: MCP73831_family_datasheet.pdf
    sha256: 4444444444444444444444444444444444444444444444444444444444444444
    byte_size: 1210330
    file_magic: "%PDF-"
    source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
```

```yaml
circuit_design_review_queue:
  - refdes: R1
    category: generic_passive
    issue: no_manufacturer_part_number
    severity: review_required
  - refdes: TP1
    category: testpoint
    issue: symbolic_only_no_manufacturer_part_number
    severity: review_required
  - refdes: J1
    category: connector
    issue: insufficient_manufacturer_evidence
    severity: review_required
  - refdes: U2
    category: eval_material
    issue: none_found_for_official_eval_assets
    severity: informational
```

```yaml
boundary_review_note:
  source_approval: official_mock_sources_only
  public_private_boundary_verdict: pass
  notes:
    - No network access was used.
    - No local project files were read.
    - Only fixture-provided official mocked source evidence was used.
    - No secrets, credentials, cookies, or private workspace material were included.
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
    - For U1, retain the recovered LT3045EDD-1 identity and use the official datasheet plus both official eval assets.
    - For U2, keep the official datasheet record and mark eval as none_found.
    - For R1, TP1, and J1, request authoritative manufacturer identity or route to design review before any source collection.
```

Recommendation: treat this packet as the runner-ready YAML set, with U1 and U2 approved for material collection and the remaining refs held for review.