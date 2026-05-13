candidate_id: B_gpt_5_4_xhigh

```yaml
profile:
  model: gpt-5.4
  reasoning_effort: xhigh
  species: orc
  class: archivist

component_inventory:
  - {refdes: U1, value: LT3045EDD-1, manufacturer: "Analog Devices", manufacturer_part_number: LT3045EDD-1, package: DFN-10, package_node: PKG_LT3045EDD_1, source_property_names: [PartInst.Package, PartInst.PartValue, PartInstUserProp.PCB Footprint, SymbolUserProp.Manufacturer_Part_Number, SymbolUserProp.Mfr_Name, SymbolUserProp.PackageName, SymbolUserProp.PCB Footprint], identity_confidence: high_recovered_from_package, action: collect_datasheet_and_eval}
  - {refdes: U2, value: MCP73831T-2ACI/OT, manufacturer: "Microchip Technology", manufacturer_part_number: MCP73831T-2ACI/OT, package: SOT23-5, source_property_names: [PartInst.PartValue, PartInst.Package, PartInstUserProp.Manufacturer, PartInstUserProp.Manufacturer\ Part\ Number, PartInstUserProp.PCB\ Footprint], identity_confidence: high_direct_from_partinst, action: collect_datasheet_only_eval_none_found}
  - {refdes: R1, value: 10k, manufacturer: null, manufacturer_part_number: null, package: "0603", source_property_names: [PartInst.PartValue, PartInst.Package], identity_confidence: low_generic_only, action: route_to_review_queue}
  - {refdes: TP1, value: TESTPOINT, manufacturer: null, manufacturer_part_number: null, package: TP, source_property_names: [PartInst.PartValue, PartInst.Package], identity_confidence: low_generic_only, action: route_to_review_queue}
  - {refdes: J1, value: USB-C-16P, manufacturer: null, manufacturer_part_number: null, package: USB_C_RECEPTACLE, source_property_names: [PartInst.PartValue, PartInst.Package, PartInstUserProp.Manufacturer], identity_confidence: low_unresolved_connector_identity, action: route_to_review_queue}

source_discovery_packet:
  - {refdes: U1, component_key: analog_devices_lt3045edd_1, status: approved_official_sources, identity_basis: "Recovered from Package PKG_LT3045EDD_1 because PartValue was placeholder Value.", datasheet_status: official_ready, datasheet_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf", eval_status: official_ready, eval_urls: ["https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf", "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip"]}
  - {refdes: U2, component_key: microchip_mcp73831t_2aci_ot, status: approved_official_sources, identity_basis: "Direct PartInst manufacturer and manufacturer part number match.", datasheet_status: official_ready, datasheet_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf", eval_status: none_found, eval_reason: "Official mock catalog matched the MPN and contained an empty eval_materials list."}
  - {refdes: R1, status: review_required, reason: "Generic passive value and package only; no manufacturer part number evidence for authoritative source discovery."}
  - {refdes: TP1, status: review_required, reason: "Test point is generic and has no manufacturer part number evidence for authoritative source discovery."}
  - {refdes: J1, status: review_required, reason: "Connector identity is ambiguous; PartValue USB-C-16P and empty manufacturer field do not establish an authoritative manufacturer part number."}

download_manifest:
  materials_root: "_workspaces/<project_code>/reference_materials/from_exp_xml"
  parts:
    - refdes: U1
      component_folder_name: U1_LT3045EDD-1
      "DATA Sheet":
        status: ready
        records:
          - {mock_file: LT3045_datasheet.pdf, planned_output_relpath: "parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf", source_url: "https://www.analog.com/media/en/technical-documentation/data-sheets/lt3045.pdf", official: true}
      EVAL:
        status: ready
        records:
          - {type: evaluation_board_user_guide, mock_file: DC2222A_user_guide.pdf, planned_output_relpath: "parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf", source_url: "https://www.analog.com/media/en/technical-documentation/user-guides/dc2222a.pdf", official: true}
          - {type: pcb_layout_archive, mock_file: DC2222A_design_files.zip, planned_output_relpath: "parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip", source_url: "https://www.analog.com/media/en/evaluation-boards-kits/evaluation-software/DC2222A_design_files.zip", official: true}
    - refdes: U2
      component_folder_name: U2_MCP73831T-2ACI_OT
      "DATA Sheet":
        status: ready
        records:
          - {mock_file: MCP73831_family_datasheet.pdf, planned_output_relpath: "parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf", source_url: "https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/MCP73831-Family-Data-Sheet-DS20001984H.pdf", official: true}
      EVAL:
        status: none_found
        reason: "Official mock catalog matched component_key microchip_mcp73831t_2aci_ot and provided no eval materials."
    - {refdes: R1, "DATA Sheet": {status: review_required, reason: "Generic passive without manufacturer part number."}, EVAL: {status: review_required, reason: "Generic passive without manufacturer part number."}}
    - {refdes: TP1, "DATA Sheet": {status: review_required, reason: "Generic test point without manufacturer part number."}, EVAL: {status: review_required, reason: "Generic test point without manufacturer part number."}}
    - {refdes: J1, "DATA Sheet": {status: review_required, reason: "USB-C connector identity unresolved; manufacturer part number missing."}, EVAL: {status: review_required, reason: "USB-C connector identity unresolved; manufacturer part number missing."}}

downloaded_file_checksum_manifest:
  counted_files:
    - {refdes: U1, manufacturer_part_number: LT3045EDD-1, bucket: "DATA Sheet", mock_file: LT3045_datasheet.pdf, planned_output_relpath: "parts/U1_LT3045EDD-1/DATA Sheet/LT3045_datasheet.pdf", sha256: "1111111111111111111111111111111111111111111111111111111111111111", byte_size: 1854321, file_magic: "%PDF-"}
    - {refdes: U1, manufacturer_part_number: LT3045EDD-1, bucket: EVAL, mock_file: DC2222A_user_guide.pdf, planned_output_relpath: "parts/U1_LT3045EDD-1/EVAL/DC2222A_user_guide.pdf", sha256: "2222222222222222222222222222222222222222222222222222222222222222", byte_size: 942210, file_magic: "%PDF-"}
    - {refdes: U1, manufacturer_part_number: LT3045EDD-1, bucket: EVAL, mock_file: DC2222A_design_files.zip, planned_output_relpath: "parts/U1_LT3045EDD-1/EVAL/DC2222A_design_files.zip", sha256: "3333333333333333333333333333333333333333333333333333333333333333", byte_size: 321004, file_magic: PK}
    - {refdes: U2, manufacturer_part_number: MCP73831T-2ACI/OT, bucket: "DATA Sheet", mock_file: MCP73831_family_datasheet.pdf, planned_output_relpath: "parts/U2_MCP73831T-2ACI_OT/DATA Sheet/MCP73831_family_datasheet.pdf", sha256: "4444444444444444444444444444444444444444444444444444444444444444", byte_size: 1210330, file_magic: "%PDF-"}

circuit_design_review_queue:
  - {refdes: R1, category: generic_passive, reason: "PartValue 10k and package 0603 do not establish a manufacturer part number.", required_owner_action: "Provide approved resistor MPN or explicitly classify as non-download generic."}
  - {refdes: TP1, category: generic_testpoint, reason: "TESTPOINT/TP is non-authoritative without manufacturer identity.", required_owner_action: "Provide approved test-point MPN or explicitly classify as non-download generic."}
  - {refdes: J1, category: ambiguous_connector, reason: "USB-C-16P with empty manufacturer field is insufficient for authoritative datasheet/eval collection.", required_owner_action: "Provide exact connector manufacturer and MPN before download authorization."}

boundary_review_note:
  source_approval_verdict: approved_official_mock_sources_only
  public_private_boundary_verdict: public_safe_synthetic_output_only
  counted_source_rule: "Only mocked official-source records with source_url, byte_size, file_magic, and sha256 were counted."
  excluded_materials: ["random mirrors", "non-official substitutes", "real project files", "secrets", "credentials", "_workspaces runtime material"]
  synthesis_note: "This packet describes the expected workflow result from the fixture and does not imply network, browser, command, or file-write activity."

circuit_design_readiness_note:
  ready_components:
    - {refdes: U1, status: ready_for_datasheet_and_eval_materialization, note: "Identity recovered from package symbol properties; official datasheet and eval materials are available and countable."}
    - {refdes: U2, status: ready_for_datasheet_materialization, note: "Official datasheet is available; official eval is none_found and is not a failure."}
  blocked_or_review_components:
    - {refdes: R1, status: review_required, note: "No authoritative manufacturer part number."}
    - {refdes: TP1, status: review_required, note: "No authoritative manufacturer part number."}
    - {refdes: J1, status: review_required, note: "Connector identity unresolved."}
  next_owner_actions:
    - "Materialize YAML manifests for U1 and U2 using the planned paths above."
    - "Hold R1, TP1, and J1 out of authoritative download folders until exact manufacturer part numbers are supplied or explicitly waived as non-download generics."
```

Recommendation: proceed with U1 and U2, and require owner MPN resolution for R1, TP1, and J1 before any authoritative materials step.