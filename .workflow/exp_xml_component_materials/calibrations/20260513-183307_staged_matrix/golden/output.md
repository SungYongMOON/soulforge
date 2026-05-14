# Golden Baseline Packet

```yaml
profile:
  model: "gpt-5.5"
  reasoning_effort: "xhigh"
  species: "human"
  class: "auditor"

component_inventory:
  - refdes: "U1"
    value: "Value"
    manufacturer: "Analog Devices"
    manufacturer_part_number: "LT3045EDD-1"
    package: "PKG_LT3045EDD_1"
    resolved_package: "DFN-10"
    source_property_names: ["PartInst.PartValue", "PartInst.Package", "Package.SymbolUserProp.Mfr_Name", "Package.SymbolUserProp.Manufacturer_Part_Number", "Package.SymbolUserProp.PackageName", "PartInstUserProp.PCB Footprint"]
    identity_confidence: "high_recovered_from_referenced_package"
    action: "collect_official_datasheet_and_eval_materials"

  - refdes: "U2"
    value: "MCP73831T-2ACI/OT"
    manufacturer: "Microchip Technology"
    manufacturer_part_number: "MCP73831T-2ACI/OT"
    package: "SOT23-5"
    source_property_names: ["PartInst.PartValue", "PartInst.Package", "PartInstUserProp.Manufacturer", "PartInstUserProp.Manufacturer Part Number", "PartInstUserProp.PCB Footprint"]
    identity_confidence: "high_direct_partinst_mpn"
    action: "collect_official_datasheet_record_eval_none_found"

  - refdes: "R1"
    value: "10k"
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names: ["PartInst.PartValue", "PartInst.Package"]
    identity_confidence: "low_generic_passive_no_mpn"
    action: "review_required_generic_passive_policy"

  - refdes: "TP1"
    value: "TESTPOINT"
    manufacturer: null
    manufacturer_part_number: null
    package: "TP"
    source_property_names: ["PartInst.PartValue", "PartInst.Package"]
    identity_confidence: "low_testpoint_no_mpn"
    action: "review_required_testpoint_policy"

  - refdes: "J1"
    value: "USB-C-16P"
    manufacturer: null
    manufacturer_part_number: null
    package: "USB_C_RECEPTACLE"
    source_property_names: ["PartInst.PartValue", "PartInst.Package", "PartInstUserProp.Manufacturer"]
    identity_confidence: "low_missing_manufacturer_and_mpn"
    action: "review_required_missing_part_identity"
```

```yaml
source_discovery_packet:
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    decision: "approved_mocked_official_sources"
    datasheet_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
    eval_materials_found: 2

  - refdes: "U2"
    component_key: "microchip_mcp73831t_2aci_ot"
    decision: "approved_mocked_official_datasheet_eval_none_found"
    datasheet_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
    eval_materials_found: 0

  - refdes: ["R1", "TP1", "J1"]
    decision: "defer_authoritative_sources_until_identity_or_policy_review"
    reason: "No manufacturer part number evidence suitable for official material collection."
```

```yaml
download_manifest:
  materials_root: "_workspaces/<project_code>/reference_materials/from_exp_xml"
  entries:
    - refdes: "U1"
      component_key: "analog_devices_lt3045edd_1"
      "DATA Sheet":
        status: "mocked_official_file_ready"
        files: ["parts/analog_devices_lt3045edd_1/DATA Sheet/LT3045_datasheet.pdf"]
      "EVAL":
        status: "mocked_official_files_ready"
        files:
          - "parts/analog_devices_lt3045edd_1/EVAL/DC2222A_user_guide.pdf"
          - "parts/analog_devices_lt3045edd_1/EVAL/DC2222A_design_files.zip"

    - refdes: "U2"
      component_key: "microchip_mcp73831t_2aci_ot"
      "DATA Sheet":
        status: "mocked_official_file_ready"
        files: ["parts/microchip_mcp73831t_2aci_ot/DATA Sheet/MCP73831_family_datasheet.pdf"]
      "EVAL":
        status: "none_found"
        reason: "Fixture official catalog contains no EVAL materials for MCP73831T-2ACI/OT."

    - refdes: ["R1", "TP1", "J1"]
      "DATA Sheet":
        status: "review_required"
      "EVAL":
        status: "review_required"
```

```yaml
downloaded_file_checksum_manifest:
  count_basis: "official mocked records with byte_size, file_magic, and sha256"
  counted_file_count: 4
  files:
    - refdes: "U1"
      file_name: "LT3045_datasheet.pdf"
      sha256: "1111111111111111111111111111111111111111111111111111111111111111"
      byte_size: 1854321
      file_magic: "%PDF-"
    - refdes: "U1"
      file_name: "DC2222A_user_guide.pdf"
      sha256: "2222222222222222222222222222222222222222222222222222222222222222"
      byte_size: 942210
      file_magic: "%PDF-"
    - refdes: "U1"
      file_name: "DC2222A_design_files.zip"
      sha256: "3333333333333333333333333333333333333333333333333333333333333333"
      byte_size: 321004
      file_magic: "PK"
    - refdes: "U2"
      file_name: "MCP73831_family_datasheet.pdf"
      sha256: "4444444444444444444444444444444444444444444444444444444444444444"
      byte_size: 1210330
      file_magic: "%PDF-"
```

```yaml
circuit_design_review_queue:
  blocking_items:
    - refdes: "R1"
      reason: "Generic passive without manufacturer part number evidence."
      owner_action: "Confirm whether generic passive policy is sufficient or provide approved MPN."
    - refdes: "TP1"
      reason: "Test point without manufacturer part number evidence."
      owner_action: "Confirm no external reference material is required or provide approved MPN."
    - refdes: "J1"
      reason: "USB-C receptacle identity lacks manufacturer and manufacturer part number."
      owner_action: "Provide exact connector MPN and approved source."

  nonblocking_notes:
    - refdes: "U2"
      note: "Official EVAL material is none_found in fixture; datasheet remains ready."
```

```yaml
boundary_review_note:
  verdict: "pass_public_safe_synthetic_packet"
  source_approval: "Only mocked official-source records from the fixture are accepted."
  counted_material_rule: "URL-only records are insufficient; counted files require byte_size, file_magic, and sha256."
  public_private_boundary: "No real project data, secrets, credentials, cookies, or private workspace material included."
  disallowed_sources: ["random mirrors", "unverified vendor copies", "account-gated material without owner approval"]
```

```yaml
circuit_design_readiness_note:
  ready_components:
    - refdes: "U1"
      status: "ready_with_datasheet_and_eval_materials"
    - refdes: "U2"
      status: "ready_with_datasheet_eval_none_found"

  blocked_or_review_components: ["R1", "TP1", "J1"]

  next_owner_actions:
    - "Resolve R1, TP1, and J1 identity or policy before authoritative material collection."
    - "Keep U1 and U2 source records tied to mocked official catalog evidence."
    - "Do not add substitute EVAL materials for U2 unless owner-approved official evidence is supplied."
```

Recommendation: proceed with U1 and U2 as material-ready, while holding R1, TP1, and J1 for owner identity or policy review.
