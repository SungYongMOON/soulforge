{
  "page_xml_assets": {
    "status": "derived_asset_manifest_only",
    "output_root": "project_local/page_xml_assets/",
    "source_mutation_allowed": false,
    "assets": [
      {"stable_id": "page_001", "source_ordinal": 1, "asset_ref": "project_local/page_xml_assets/page_001.xml"},
      {"stable_id": "page_002", "source_ordinal": 2, "asset_ref": "project_local/page_xml_assets/page_002.xml"},
      {"stable_id": "page_003", "source_ordinal": 3, "asset_ref": "project_local/page_xml_assets/page_003.xml"},
      {"stable_id": "page_004", "source_ordinal": 4, "asset_ref": "project_local/page_xml_assets/page_004.xml"},
      {"stable_id": "page_005", "source_ordinal": 5, "asset_ref": "project_local/page_xml_assets/page_005.xml"},
      {"stable_id": "page_006", "source_ordinal": 6, "asset_ref": "project_local/page_xml_assets/page_006.xml"},
      {"stable_id": "page_007", "source_ordinal": 7, "asset_ref": "project_local/page_xml_assets/page_007.xml"},
      {"stable_id": "page_008", "source_ordinal": 8, "asset_ref": "project_local/page_xml_assets/page_008.xml"},
      {"stable_id": "page_009", "source_ordinal": 9, "asset_ref": "project_local/page_xml_assets/page_009.xml"},
      {"stable_id": "page_010", "source_ordinal": 10, "asset_ref": "project_local/page_xml_assets/page_010.xml"},
      {"stable_id": "page_011", "source_ordinal": 11, "asset_ref": "project_local/page_xml_assets/page_011.xml"}
    ],
    "payload_policy": {
      "page_local_xml_preserved": true,
      "normalization_performed": false,
      "raw_xml_included": false,
      "public_payload_archive": false
    }
  },
  "page_manifest": {
    "workflow_id": "whole_xml_page_split_v0",
    "calibration_id": "20260514-171147_staged_cli_real_sample_structural",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "page_count": 11,
    "page_order": ["page_001", "page_002", "page_003", "page_004", "page_005", "page_006", "page_007", "page_008", "page_009", "page_010", "page_011"],
    "page_id_policy": "source-order ordinal ids; titleblock count/number is non-authoritative",
    "warnings": [
      "Titleblock reported count 8 conflicts with 11 observed Page nodes.",
      "Five page-number signals are missing or ambiguous.",
      "Page-number signals are non-contiguous.",
      "Page role hints are non-authoritative and require review where ambiguous."
    ],
    "pages": [
      {"stable_id": "page_001", "source_ordinal": 1, "page_number_signal": ["1"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_002", "source_ordinal": 2, "page_number_signal": ["2"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_003", "source_ordinal": 3, "page_number_signal": ["missing_or_not_public"], "page_count_signal": ["missing_or_not_public"], "title_signal": "present_redacted"},
      {"stable_id": "page_004", "source_ordinal": 4, "page_number_signal": ["5"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_005", "source_ordinal": 5, "page_number_signal": ["6"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_006", "source_ordinal": 6, "page_number_signal": ["missing_or_not_public"], "page_count_signal": ["missing_or_not_public"], "title_signal": "missing_or_not_public"},
      {"stable_id": "page_007", "source_ordinal": 7, "page_number_signal": ["missing_or_not_public"], "page_count_signal": ["missing_or_not_public"], "title_signal": "missing_or_not_public"},
      {"stable_id": "page_008", "source_ordinal": 8, "page_number_signal": ["missing_or_not_public"], "page_count_signal": ["missing_or_not_public"], "title_signal": "missing_or_not_public"},
      {"stable_id": "page_009", "source_ordinal": 9, "page_number_signal": ["7"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_010", "source_ordinal": 10, "page_number_signal": ["8"], "page_count_signal": ["8"], "title_signal": "present_redacted"},
      {"stable_id": "page_011", "source_ordinal": 11, "page_number_signal": ["missing_or_not_public"], "page_count_signal": ["missing_or_not_public"], "title_signal": "missing_or_not_public"}
    ]
  },
  "page_index": {
    "root_element": "Design",
    "schema_family_marker": "Cadence/OrCAD Capture Design EXP-like XML; host path redacted",
    "page_boundary_node_family": "Page",
    "page_count_candidate": 11,
    "parser_mode": "streaming_elementtree_boundary_probe",
    "pages": [
      {"stable_id": "page_001", "source_ordinal": 1, "element_count": 29892, "part_inst_count": 211, "net_scalar_count": 296, "wire_scalar_count": 856, "off_page_connector_count": 156},
      {"stable_id": "page_002", "source_ordinal": 2, "element_count": 29974, "part_inst_count": 211, "net_scalar_count": 296, "wire_scalar_count": 851, "off_page_connector_count": 155},
      {"stable_id": "page_003", "source_ordinal": 3, "element_count": 57198, "part_inst_count": 464, "net_scalar_count": 260, "wire_scalar_count": 1689, "off_page_connector_count": 36},
      {"stable_id": "page_004", "source_ordinal": 4, "element_count": 3210, "part_inst_count": 11, "net_scalar_count": 58, "wire_scalar_count": 99, "off_page_connector_count": 81},
      {"stable_id": "page_005", "source_ordinal": 5, "element_count": 4190, "part_inst_count": 24, "net_scalar_count": 51, "wire_scalar_count": 132, "off_page_connector_count": 45},
      {"stable_id": "page_006", "source_ordinal": 6, "element_count": 1434, "part_inst_count": 11, "net_scalar_count": 10, "wire_scalar_count": 50, "off_page_connector_count": 0},
      {"stable_id": "page_007", "source_ordinal": 7, "element_count": 1536, "part_inst_count": 12, "net_scalar_count": 10, "wire_scalar_count": 56, "off_page_connector_count": 0},
      {"stable_id": "page_008", "source_ordinal": 8, "element_count": 4404, "part_inst_count": 39, "net_scalar_count": 19, "wire_scalar_count": 123, "off_page_connector_count": 0},
      {"stable_id": "page_009", "source_ordinal": 9, "element_count": 7200, "part_inst_count": 58, "net_scalar_count": 39, "wire_scalar_count": 220, "off_page_connector_count": 23},
      {"stable_id": "page_010", "source_ordinal": 10, "element_count": 5808, "part_inst_count": 10, "net_scalar_count": 102, "wire_scalar_count": 237, "off_page_connector_count": 42},
      {"stable_id": "page_011", "source_ordinal": 11, "element_count": 2096, "part_inst_count": 16, "net_scalar_count": 12, "wire_scalar_count": 65, "off_page_connector_count": 0}
    ]
  },
  "source_provenance": {
    "source_file_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "source_size_bytes": 12670307,
    "source_revision_identity": "synthetic_fixture_revision_unspecified",
    "parser_mode": "streaming_elementtree_boundary_probe",
    "split_method": "source-order Page-node boundary split",
    "page_count": 11,
    "source_mutation_check": "required_by_contract; runtime result not supplied",
    "created_at": "unspecified",
    "tool_version_or_script_identity": "unspecified"
  },
  "page_role_hints": {
    "authority": "non_authoritative_routing_only",
    "review_required_for_ambiguous_pages": true,
    "hints": [
      {"stable_id": "page_001", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_002", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_003", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_004", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_005", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_006", "hint": "hardware_or_material_context", "confidence": "structural", "signals": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]},
      {"stable_id": "page_007", "hint": "hardware_or_material_context", "confidence": "structural", "signals": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]},
      {"stable_id": "page_008", "hint": "hardware_or_material_context", "confidence": "structural", "signals": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]},
      {"stable_id": "page_009", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_010", "hint": "schematic", "confidence": "structural", "signals": ["schematic_content", "offpage_connector_context", "possible_pcb_context"]},
      {"stable_id": "page_011", "hint": "hardware_or_material_context", "confidence": "structural", "signals": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"]}
    ],
    "non_claims": ["No PCB/MDD pairing established.", "No material collection performed.", "No deep semantic interpretation performed."]
  },
  "split_readiness": {
    "status": "conditionally_ready_for_page_xml_normalize_spec_v0",
    "basis": ["ordered stable page ids defined", "project-local asset locations defined", "normalization excluded", "material collection excluded", "PCB/MDD pairing excluded"],
    "required_runtime_checks_before_acceptance": ["confirm source XML unchanged", "confirm output root is project-local", "confirm no asset is under .workflow/", "record complete source checksum and split provenance"],
    "stop_conditions": ["missing page boundary unless explicit single-page fallback is approved", "output binding is ambiguous or non-project-local", "source mutation detected", "page order or stable ids cannot be recorded"],
    "uncertainties": ["runtime asset existence and checksums are unspecified", "source revision identity, creation time, and tool identity are unspecified"]
  }
}
