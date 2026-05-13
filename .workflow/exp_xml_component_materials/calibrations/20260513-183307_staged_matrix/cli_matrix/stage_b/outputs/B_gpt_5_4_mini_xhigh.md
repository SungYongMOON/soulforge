candidate_id: B_gpt_5_4_mini_xhigh
```yaml
calibration_id: "20260513-183307_staged_matrix"
workflow_id: "exp_xml_component_materials"

output_tree_contract:
  materials_root: "_workspaces/<project_code>/reference_materials/from_exp_xml"
  parts_folder_name: "parts"
  datasheet_folder_name: "DATA Sheet"
  eval_folder_name: "EVAL"
  required_top_level_outputs:
    - "component_inventory.yaml"
    - "download_manifest.yaml"
    - "downloaded_file_checksum_manifest.yaml"
    - "circuit_design_review_queue.yaml"

profile:
  model: "gpt-5.4-mini"
  reasoning_effort: "xhigh"
  species: "orc"
  class: "archivist"

component_inventory:
  - refdes: "U1"
    value: "Value"
    manufacturer: "Analog Devices"
    manufacturer_part_number: "LT3045EDD-1"
    package: "PKG_LT3045EDD_1"
    source_property_names:
      - "PartInst.PartValue"
      - "PartInst.Package"
      - "Package.Name"
      - "Package.SymbolUserProp.Manufacturer_Part_Number"
      - "Package.SymbolUserProp.Mfr_Name"
      - "Package.SymbolUserProp.PackageName"
      - "Package.SymbolUserProp.PCB Footprint"
      - "PartInstUserProp.PCB Footprint"
    identity_confidence: "high"
    action: "collect"

  - refdes: "U2"
    value: "MCP73831T-2ACI/OT"
    manufacturer: "Microchip Technology"
    manufacturer_part_number: "MCP73831T-2ACI/OT"
    package: "SOT23-5"
    source_property_names:
      - "PartInst.PartValue"
      - "PartInst.Package"
      - "PartInstUserProp.Manufacturer"
      - "PartInstUserProp.Manufacturer Part Number"
      - "PartInstUserProp.PCB Footprint"
    identity_confidence: "high"
    action: "collect"

  - refdes: "R1"
    value: "10k"
    manufacturer: null
    manufacturer_part_number: null
    package: "0603"
    source_property_names:
      - "PartInst.PartValue"
      - "PartInst.Package"
    identity_confidence: "low"
    action: "review_required"

  - refdes: "TP1"
    value: "TESTPOINT"
    manufacturer: null
    manufacturer_part_number: null
    package: "TP"
    source_property_names:
      - "PartInst.PartValue"
      - "PartInst.Package"
    identity_confidence: "low"
    action: "review_required"

  - refdes: "J1"
    value: "USB-C-16P"
    manufacturer: null
    manufacturer_part_number: null
    package: "USB_C_RECEPTACLE"
    source_property_names:
      - "PartInst.PartValue"
      - "PartInst.Package"
      - "PartInstUserProp.Manufacturer"
    identity_confidence: "low"
    action: "review_required"

source_discovery_packet:
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    official_source_status: "approved"
    resolved_from:
      part_value: "Value"
      package_key: "PKG_LT3045EDD_1"
      package_name: "DFN-10"
      footprint: "LTC_DD_10"
      manufacturer: "Analog Devices"
      manufacturer_part_number: "LT3045EDD-1"
    datasheet:
      status: "ready"
      source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
      mock_file: "LT3045_datasheet.pdf"
    eval_materials:
      status: "ready"
      files:
        - type: "evaluation_board_user_guide"
          source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
          mock_file: "DC2222A_user_guide.pdf"
        - type: "pcb_layout_archive"
          source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"
          mock_file: "DC2222A_design_files.zip"
    note: "Identity recovered from the package record because PartValue was placeholder 'Value'."

  - refdes: "U2"
    component_key: "microchip_mcp73831t_2aci_ot"
    official_source_status: "approved"
    resolved_from:
      part_value: "MCP73831T-2ACI/OT"
      package: "SOT23-5"
      manufacturer: "Microchip Technology"
      manufacturer_part_number: "MCP73831T-2ACI/OT"
    datasheet:
      status: "ready"
      source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
      mock_file: "MCP73831_family_datasheet.pdf"
    eval_materials:
      status: "none_found"
      evidence: "Mock official-source catalog has an empty eval_materials list."
    note: "Official datasheet is ready; no official EVAL material is present in the mocked catalog."

  - refdes: "R1"
    official_source_status: "review_required"
    resolved_from:
      part_value: "10k"
      package: "0603"
    reason: "Generic passive with no manufacturer part number evidence."

  - refdes: "TP1"
    official_source_status: "review_required"
    resolved_from:
      part_value: "TESTPOINT"
      package: "TP"
    reason: "Symbolic test point with no manufacturer identity evidence."

  - refdes: "J1"
    official_source_status: "review_required"
    resolved_from:
      part_value: "USB-C-16P"
      package: "USB_C_RECEPTACLE"
    reason: "Connector placeholder without manufacturer part number evidence."

download_manifest:
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    "DATA Sheet":
      status: "saved"
      saved_file: "LT3045_datasheet.pdf"
      saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet/LT3045_datasheet.pdf"
      source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
    "EVAL":
      status: "saved"
      saved_files:
        - material_type: "evaluation_board_user_guide"
          saved_file: "DC2222A_user_guide.pdf"
          saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_user_guide.pdf"
          source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
        - material_type: "pcb_layout_archive"
          saved_file: "DC2222A_design_files.zip"
          saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_design_files.zip"
          source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"

  - refdes: "U2"
    component_key: "microchip_mcp73831t_2aci_ot"
    "DATA Sheet":
      status: "saved"
      saved_file: "MCP73831_family_datasheet.pdf"
      saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf"
      source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
    "EVAL":
      status: "none_found"
      reason: "Mock official-source catalog contains no official EVAL material for this component."

  - refdes: "R1"
    "DATA Sheet":
      status: "review_required"
      reason: "No manufacturer part number evidence is available for authoritative source matching."
    "EVAL":
      status: "review_required"
      reason: "Generic passive; do not create authoritative downloads without exact manufacturer identity."

  - refdes: "TP1"
    "DATA Sheet":
      status: "review_required"
      reason: "No manufacturer part number evidence is available for this test point."
    "EVAL":
      status: "review_required"
      reason: "Symbolic test point; no authoritative EVAL material applies."

  - refdes: "J1"
    "DATA Sheet":
      status: "review_required"
      reason: "Connector identity is not manufacturer-backed."
    "EVAL":
      status: "review_required"
      reason: "Connector placeholder lacks manufacturer identity; review before authoritative collection."

downloaded_file_checksum_manifest:
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    category: "DATA Sheet"
    saved_file: "LT3045_datasheet.pdf"
    saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/DATA Sheet/LT3045_datasheet.pdf"
    source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf"
    byte_size: 1854321
    file_magic: "%PDF-"
    sha256: "1111111111111111111111111111111111111111111111111111111111111111"
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    category: "EVAL"
    material_type: "evaluation_board_user_guide"
    saved_file: "DC2222A_user_guide.pdf"
    saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_user_guide.pdf"
    source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf"
    byte_size: 942210
    file_magic: "%PDF-"
    sha256: "2222222222222222222222222222222222222222222222222222222222222222"
  - refdes: "U1"
    component_key: "analog_devices_lt3045edd_1"
    category: "EVAL"
    material_type: "pcb_layout_archive"
    saved_file: "DC2222A_design_files.zip"
    saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U1/EVAL/DC2222A_design_files.zip"
    source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"
    byte_size: 321004
    file_magic: "PK"
    sha256: "3333333333333333333333333333333333333333333333333333333333333333"
  - refdes: "U2"
    component_key: "microchip_mcp73831t_2aci_ot"
    category: "DATA Sheet"
    saved_file: "MCP73831_family_datasheet.pdf"
    saved_path: "_workspaces/<project_code>/reference_materials/from_exp_xml/parts/U2/DATA Sheet/MCP73831_family_datasheet.pdf"
    source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf"
    byte_size: 1210330
    file_magic: "%PDF-"
    sha256: "4444444444444444444444444444444444444444444444444444444444444444"

circuit_design_review_queue:
  - refdes: "R1"
    category: "generic"
    reason: "10k resistor is generic and lacks manufacturer part number evidence."
    action: "review_required"
  - refdes: "TP1"
    category: "symbolic"
    reason: "TESTPOINT is symbolic and lacks manufacturer identity evidence."
    action: "review_required"
  - refdes: "J1"
    category: "missing_mpn"
    reason: "USB-C-16P placeholder lacks manufacturer part number evidence."
    action: "review_required"

boundary_review_note:
  source_approval: "Approved only from mocked official-source evidence in the fixture."
  public_private_boundary_verdict: "Public-safe; no network, no real downloads, no private workspace data, no secrets, and no credential handling."
  note: "This packet stays within the public-safe synthetic boundary and does not claim any actual file creation or browser activity."

circuit_design_readiness_note:
  ready_components:
    - refdes: "U1"
      status: "ready"
      evidence: ["datasheet", "EVAL/user_guide", "EVAL/design_files"]
    - refdes: "U2"
      status: "ready"
      evidence: ["datasheet"]
      note: "Official EVAL material is none_found, which is acceptable here."
  blocked_or_review_components:
    - refdes: "R1"
      status: "review_required"
      reason: "Generic passive with no manufacturer part number evidence."
    - refdes: "TP1"
      status: "review_required"
      reason: "Symbolic test point with no manufacturer identity evidence."
    - refdes: "J1"
      status: "review_required"
      reason: "Connector placeholder without manufacturer part number evidence."
  next_owner_actions:
    - "Proceed with U1 and U2 as authoritative source-backed parts."
    - "Route R1, TP1, and J1 to review until exact identities are approved or a generic-only policy is explicitly accepted."
  closing_recommendation: "Proceed with U1/U2 and hold R1/TP1/J1 for identity review."
```