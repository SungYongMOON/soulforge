candidate_id: A_dwarf_auditor

```yaml
profile:
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
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
      - PartInst.Package
      - SymbolUserProp.Manufacturer_Part_Number
      - SymbolUserProp.Mfr_Name
      - SymbolUserProp.PackageName
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
    identity_confidence: low
    action: review_only_generic_passive

  - refdes: TP1
    value: TESTPOINT
    manufacturer: null
    manufacturer_part_number: null
    package: TP
    source_property_names:
      - PartInst.PartValue
    identity_confidence: low
    action: review_only_symbolic_or_testpoint

  - refdes: J1
    value: USB-C-16P
    manufacturer: null
    manufacturer_part_number: null
    package: USB_C_RECEPTACLE
    source_property_names:
      - PartInst.PartValue
      - PartInstUserProp.Manufacturer
    identity_confidence: low
    action: review_required_no_authoritative_mpn
```

```yaml
source_discovery_packet:
  - refdes: U1
    component_key: analog_devices_lt3045edd_1
    official_source_decision: approved
    datasheet:
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
      mock_file: LT3045_datasheet.pdf
      status: ready
    eval_materials:
      - type: evaluation_board_user_guide
        source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        mock_file: DC2222A_user_guide.pdf
        status: ready
      - type: pcb_layout_archive
        source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip
        mock_file: DC2222A_design_files.zip
        status: ready

  - refdes: U2
    component_key: microchip_mcp73831t_2aci_ot
    official_source_decision: approved
    datasheet:
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
      mock_file: MCP73831_family_datasheet.pdf
      status: ready
    eval_materials: none_found

  - refdes: R1
    official_source_decision: review_required
    reason: generic_passive_without_manufacturer_part_number_evidence

  - refdes: TP1
    official_source_decision: review_required
    reason: symbolic_testpoint_without_authoritative_manufacturer_identity

  - refdes: J1
    official_source_decision: review_required
    reason: connector_identity_not_resolved_from_public_safe_fixture
```

```yaml
download_manifest:
  - refdes: U1
    datasheet:
      status: saved
      file: LT3045_datasheet.pdf
      source_url: https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf
    eval:
      status: saved
      files:
        - file: DC2222A_user_guide.pdf
          type: evaluation_board_user_guide
          source_url: https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf
        - file: DC2222A_design_files.zip
          type: pcb_layout_archive
          source_url: https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip

  - refdes: U2
    datasheet:
      status: saved
      file: MCP73831_family_datasheet.pdf
      source_url: https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf
    eval:
      status: none_found
      reason: no_official_eval_material_listed_in_fixture

  - refdes: R1
    datasheet:
      status: review_required
      reason: generic_passive_no_authoritative_mpn
    eval:
      status: review_required
      reason: generic_passive_no_eval_expected

  - refdes: TP1
    datasheet:
      status: review_required
      reason: symbolic_testpoint_no_authoritative_mpn
    eval:
      status: review_required
      reason: symbolic_testpoint_no_eval_expected

  - refdes: J1
    datasheet:
      status: review_required
      reason: no_official_source_assigned
    eval:
      status: review_required
      reason: connector_identity_unresolved
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
    reason: no_manufacturer_part_number_evidence
    disposition: review_required

  - refdes: TP1
    issue: symbolic_testpoint
    reason: placeholder_identity_only
    disposition: review_required

  - refdes: J1
    issue: connector_identity_unresolved
    reason: manufacturer_field_blank_and_no_mpn
    disposition: review_required

  - refdes: U1
    issue: identity_recovered_from_package_and_symbol_props
    reason: partvalue_placeholder_value
    disposition: accepted_with_high_confidence

  - refdes: U2
    issue: eval_material_absent
    reason: official_datasheet_available_but_no_official_eval_listed
    disposition: accepted_datasheet_only
```

```yaml
boundary_review_note:
  source_approval: official_mocked_sources_only_approved
  boundary_verdict: public_safe
  notes:
    - no_network_or_real_download_claimed
    - no_secret_private_workspace_material_used
    - only_fixture_provided_mock_files_counted_as_downloaded
    - no_random_mirrors_or_unapproved_sources_used
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
    - preserve U1 as authoritative from PKG_LT3045EDD_1 and proceed with LT3045 datasheet plus eval assets
    - record U2 datasheet as ready and keep eval as none_found
    - send R1, TP1, and J1 to design review until authoritative identities or approved source mappings exist
```

Recommendation: treat this packet as ready for YAML manifest emission, with only the generic and unresolved parts routed to review.