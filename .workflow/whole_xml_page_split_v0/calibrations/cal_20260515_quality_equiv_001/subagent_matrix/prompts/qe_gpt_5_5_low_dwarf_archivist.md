You are a CLI-only public-safe calibration candidate for Soulforge workflow whole_xml_page_split_v0.
Profile: model=gpt-5.5 reasoning_effort=low species=dwarf class=archivist.

Rules:
- Do not run commands, browse, inspect local files, or claim external validation.
- Use only the public-safe fixture below and the workflow task.
- Do not include raw project payloads, runtime absolute paths, credentials, cookies, or private-state data.
- Output only one valid JSON object. No markdown fences.
- Include these top-level keys: page_manifest, split_warnings, handoff, boundary_notes, next_actions.
- Also include quality_self_check with arrays named covered_requirements, gaps, and boundary_notes.

Task:
Produce a compact page-split manifest from the public structural fixture. Preserve the 11 Page boundaries, source order, stable page_001..page_011 ids, titleblock Page Count=8 conflict warning, project-local output boundary, and downstream handoff to page_xml_normalize_spec_v0.

Public-safe fixture:
{
  "workflow_id": "whole_xml_page_split_v0",
  "calibration_id": "20260514-171147_staged_cli_real_sample_structural",
  "fixture_type": "public_safe_real_sample_derived_structural_metadata",
  "real_sample_used": true,
  "real_sample_path_archived": false,
  "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
  "source_sha256_prefix": "74195c6c62bdcf3f",
  "source_size_bytes": 12670307,
  "raw_xml_body_included": false,
  "runtime_absolute_path_included": false,
  "root_element": "Design",
  "schema_family_marker": "Cadence/OrCAD Capture Design EXP-like XML; host path redacted",
  "parser_mode": "streaming_elementtree_boundary_probe",
  "max_depth": 8,
  "total_element_count": 186608,
  "schematic_count": 1,
  "page_boundary_node_family": "Page",
  "page_count_candidate": 11,
  "titleblock_page_count_signal": {
    "reported_count_values": [
      "8"
    ],
    "observed_on_page_nodes": 6,
    "conflicts_with_actual_page_nodes": true
  },
  "page_number_signal_summary": {
    "present_values": [
      "1",
      "2",
      "5",
      "6",
      "7",
      "8"
    ],
    "missing_or_ambiguous_page_nodes": 5,
    "non_contiguous": true
  },
  "global_tag_counts": {
    "Package": 107,
    "PartInst": 1067,
    "NetScalar": 1153,
    "WireScalar": 4378,
    "OffPageConnector": 538,
    "PartInstUserProp": 7644,
    "IsNoConnect": 3494
  },
  "stable_page_id_policy": "derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity",
  "split_policy": {
    "preserve_source_page_order": true,
    "preserve_page_xml_without_normalization": true,
    "duplicate_or_missing_label_policy": "ordinal_suffix_and_manifest_warning",
    "single_page_fallback_allowed": false
  },
  "expected_output_location_policy": {
    "project_local_only": true,
    "never_under_workflow_package": true,
    "archive_page_payloads_in_public_canon": false
  },
  "pages": [
    {
      "stable_id": "page_001",
      "source_ordinal": 1,
      "element_count": 29892,
      "part_inst_count": 211,
      "net_scalar_count": 296,
      "wire_scalar_count": 856,
      "off_page_connector_count": 156,
      "port_inst_scalar_count": 621,
      "no_connect_marker_count": 621,
      "part_user_prop_count": 1460,
      "page_number_signals": [
        "1"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 211,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_002",
      "source_ordinal": 2,
      "element_count": 29974,
      "part_inst_count": 211,
      "net_scalar_count": 296,
      "wire_scalar_count": 851,
      "off_page_connector_count": 155,
      "port_inst_scalar_count": 621,
      "no_connect_marker_count": 621,
      "part_user_prop_count": 1460,
      "page_number_signals": [
        "2"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 211,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_003",
      "source_ordinal": 3,
      "element_count": 57198,
      "part_inst_count": 464,
      "net_scalar_count": 260,
      "wire_scalar_count": 1689,
      "off_page_connector_count": 36,
      "port_inst_scalar_count": 1120,
      "no_connect_marker_count": 1120,
      "part_user_prop_count": 3360,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 464,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_004",
      "source_ordinal": 4,
      "element_count": 3210,
      "part_inst_count": 11,
      "net_scalar_count": 58,
      "wire_scalar_count": 99,
      "off_page_connector_count": 81,
      "port_inst_scalar_count": 11,
      "no_connect_marker_count": 11,
      "part_user_prop_count": 33,
      "page_number_signals": [
        "5"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 11,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_005",
      "source_ordinal": 5,
      "element_count": 4190,
      "part_inst_count": 24,
      "net_scalar_count": 51,
      "wire_scalar_count": 132,
      "off_page_connector_count": 45,
      "port_inst_scalar_count": 64,
      "no_connect_marker_count": 64,
      "part_user_prop_count": 132,
      "page_number_signals": [
        "6"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 24,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_006",
      "source_ordinal": 6,
      "element_count": 1434,
      "part_inst_count": 11,
      "net_scalar_count": 10,
      "wire_scalar_count": 50,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 33,
      "no_connect_marker_count": 33,
      "part_user_prop_count": 63,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 11,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_007",
      "source_ordinal": 7,
      "element_count": 1536,
      "part_inst_count": 12,
      "net_scalar_count": 10,
      "wire_scalar_count": 56,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 35,
      "no_connect_marker_count": 35,
      "part_user_prop_count": 69,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 12,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_008",
      "source_ordinal": 8,
      "element_count": 4404,
      "part_inst_count": 39,
      "net_scalar_count": 19,
      "wire_scalar_count": 123,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 96,
      "no_connect_marker_count": 96,
      "part_user_prop_count": 540,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 39,
      "pcb_footprint_signal_count": 39,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_009",
      "source_ordinal": 9,
      "element_count": 7200,
      "part_inst_count": 58,
      "net_scalar_count": 39,
      "wire_scalar_count": 220,
      "off_page_connector_count": 23,
      "port_inst_scalar_count": 138,
      "no_connect_marker_count": 138,
      "part_user_prop_count": 358,
      "page_number_signals": [
        "7"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 58,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_010",
      "source_ordinal": 10,
      "element_count": 5808,
      "part_inst_count": 10,
      "net_scalar_count": 102,
      "wire_scalar_count": 237,
      "off_page_connector_count": 42,
      "port_inst_scalar_count": 154,
      "no_connect_marker_count": 154,
      "part_user_prop_count": 52,
      "page_number_signals": [
        "8"
      ],
      "page_count_signals": [
        "8"
      ],
      "title_signal": "present_redacted",
      "material_property_signal_count": 0,
      "pcb_footprint_signal_count": 10,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "offpage_connector_context",
        "possible_pcb_context"
      ]
    },
    {
      "stable_id": "page_011",
      "source_ordinal": 11,
      "element_count": 2096,
      "part_inst_count": 16,
      "net_scalar_count": 12,
      "wire_scalar_count": 65,
      "off_page_connector_count": 0,
      "port_inst_scalar_count": 43,
      "no_connect_marker_count": 43,
      "part_user_prop_count": 117,
      "page_number_signals": [
        "missing_or_not_public"
      ],
      "page_count_signals": [
        "missing_or_not_public"
      ],
      "title_signal": "missing_or_not_public",
      "material_property_signal_count": 3,
      "pcb_footprint_signal_count": 16,
      "datasheet_link_signal_count": 0,
      "role_hint_signals": [
        "schematic_content",
        "hardware_or_material_context",
        "possible_pcb_context"
      ]
    }
  ]
}
