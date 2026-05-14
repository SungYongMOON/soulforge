```json
{
  "profile_metadata": {
    "workflow_id": "whole_xml_page_split_v0",
    "calibration_id": "20260514-171147_staged_cli_real_sample_structural",
    "execution_mode": "public-safe CLI calibration",
    "model": "gpt-5.4-mini",
    "reasoning_effort": "xhigh",
    "species_id": "dwarf",
    "class_id": "archivist",
    "fixture_type": "public_safe_real_sample_derived_structural_metadata",
    "real_sample_used": true,
    "public_safe": true
  },
  "page_boundary_summary": {
    "boundary_node_family": "Page",
    "authoritative_page_nodes": 11,
    "stable_page_id_policy": "derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity",
    "page_number_signal_summary": {
      "present_values": ["1", "2", "5", "6", "7", "8"],
      "missing_or_ambiguous_page_nodes": 5,
      "non_contiguous": true
    },
    "titleblock_page_count_signal": {
      "reported_count_values": ["8"],
      "observed_on_page_nodes": 6,
      "conflicts_with_actual_page_nodes": true
    },
    "warning": "titleblock Page Count=8 conflicts with 11 authoritative Page nodes"
  },
  "page_split_plan": {
    "split_policy": {
      "preserve_source_page_order": true,
      "preserve_page_xml_without_normalization": true,
      "duplicate_or_missing_label_policy": "ordinal_suffix_and_manifest_warning",
      "single_page_fallback_allowed": false
    },
    "storage_policy": {
      "project_local_only": true,
      "never_under_workflow_package": true
    },
    "steps": [
      "Split the 11 Page nodes in source order into one page-local XML asset each.",
      "Derive stable ids page_001..page_011 from source order because page-number signals are missing or non-contiguous.",
      "Preserve each page payload verbatim; do not normalize XML, refdes, nets, connectivity, materials, PCB/MDD pairing, or library identity.",
      "Emit manifest, index, provenance, and warnings alongside the page assets."
    ]
  },
  "page_manifest": {
    "authoritative_page_count": 11,
    "reported_titleblock_page_count": 8,
    "warnings": [
      "Titleblock Page Count=8 is non-authoritative and conflicts with actual Page-node count.",
      "Five page nodes lack usable page-number signals; keep ordinal identity stable."
    ],
    "pages": [
      {
        "stable_id": "page_001",
        "source_ordinal": 1,
        "counts": {
          "element_count": 29892,
          "part_inst_count": 211,
          "net_scalar_count": 296,
          "wire_scalar_count": 856,
          "off_page_connector_count": 156,
          "port_inst_scalar_count": 621,
          "no_connect_marker_count": 621,
          "part_user_prop_count": 1460,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 211
        },
        "signals": {
          "page_number_signals": ["1"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_002",
        "source_ordinal": 2,
        "counts": {
          "element_count": 29974,
          "part_inst_count": 211,
          "net_scalar_count": 296,
          "wire_scalar_count": 851,
          "off_page_connector_count": 155,
          "port_inst_scalar_count": 621,
          "no_connect_marker_count": 621,
          "part_user_prop_count": 1460,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 211
        },
        "signals": {
          "page_number_signals": ["2"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_003",
        "source_ordinal": 3,
        "counts": {
          "element_count": 57198,
          "part_inst_count": 464,
          "net_scalar_count": 260,
          "wire_scalar_count": 1689,
          "off_page_connector_count": 36,
          "port_inst_scalar_count": 1120,
          "no_connect_marker_count": 1120,
          "part_user_prop_count": 3360,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 464
        },
        "signals": {
          "page_number_signals": ["missing_or_not_public"],
          "page_count_signals": ["missing_or_not_public"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_004",
        "source_ordinal": 4,
        "counts": {
          "element_count": 3210,
          "part_inst_count": 11,
          "net_scalar_count": 58,
          "wire_scalar_count": 99,
          "off_page_connector_count": 81,
          "port_inst_scalar_count": 11,
          "no_connect_marker_count": 11,
          "part_user_prop_count": 33,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 11
        },
        "signals": {
          "page_number_signals": ["5"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_005",
        "source_ordinal": 5,
        "counts": {
          "element_count": 4190,
          "part_inst_count": 24,
          "net_scalar_count": 51,
          "wire_scalar_count": 132,
          "off_page_connector_count": 45,
          "port_inst_scalar_count": 64,
          "no_connect_marker_count": 64,
          "part_user_prop_count": 132,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 24
        },
        "signals": {
          "page_number_signals": ["6"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_006",
        "source_ordinal": 6,
        "counts": {
          "element_count": 1434,
          "part_inst_count": 11,
          "net_scalar_count": 10,
          "wire_scalar_count": 50,
          "off_page_connector_count": 0,
          "port_inst_scalar_count": 33,
          "no_connect_marker_count": 33,
          "part_user_prop_count": 63,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 11
        },
        "signals": {
          "page_number_signals": ["missing_or_not_public"],
          "page_count_signals": ["missing_or_not_public"],
          "title_signal": "missing_or_not_public"
        }
      },
      {
        "stable_id": "page_007",
        "source_ordinal": 7,
        "counts": {
          "element_count": 1536,
          "part_inst_count": 12,
          "net_scalar_count": 10,
          "wire_scalar_count": 56,
          "off_page_connector_count": 0,
          "port_inst_scalar_count": 35,
          "no_connect_marker_count": 35,
          "part_user_prop_count": 69,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 12
        },
        "signals": {
          "page_number_signals": ["missing_or_not_public"],
          "page_count_signals": ["missing_or_not_public"],
          "title_signal": "missing_or_not_public"
        }
      },
      {
        "stable_id": "page_008",
        "source_ordinal": 8,
        "counts": {
          "element_count": 4404,
          "part_inst_count": 39,
          "net_scalar_count": 19,
          "wire_scalar_count": 123,
          "off_page_connector_count": 0,
          "port_inst_scalar_count": 96,
          "no_connect_marker_count": 96,
          "part_user_prop_count": 540,
          "material_property_signal_count": 39,
          "pcb_footprint_signal_count": 39
        },
        "signals": {
          "page_number_signals": ["missing_or_not_public"],
          "page_count_signals": ["missing_or_not_public"],
          "title_signal": "missing_or_not_public"
        }
      },
      {
        "stable_id": "page_009",
        "source_ordinal": 9,
        "counts": {
          "element_count": 7200,
          "part_inst_count": 58,
          "net_scalar_count": 39,
          "wire_scalar_count": 220,
          "off_page_connector_count": 23,
          "port_inst_scalar_count": 138,
          "no_connect_marker_count": 138,
          "part_user_prop_count": 358,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 58
        },
        "signals": {
          "page_number_signals": ["7"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_010",
        "source_ordinal": 10,
        "counts": {
          "element_count": 5808,
          "part_inst_count": 10,
          "net_scalar_count": 102,
          "wire_scalar_count": 237,
          "off_page_connector_count": 42,
          "port_inst_scalar_count": 154,
          "no_connect_marker_count": 154,
          "part_user_prop_count": 52,
          "material_property_signal_count": 0,
          "pcb_footprint_signal_count": 10
        },
        "signals": {
          "page_number_signals": ["8"],
          "page_count_signals": ["8"],
          "title_signal": "present_redacted"
        }
      },
      {
        "stable_id": "page_011",
        "source_ordinal": 11,
        "counts": {
          "element_count": 2096,
          "part_inst_count": 16,
          "net_scalar_count": 12,
          "wire_scalar_count": 65,
          "off_page_connector_count": 0,
          "port_inst_scalar_count": 43,
          "no_connect_marker_count": 43,
          "part_user_prop_count": 117,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 16
        },
        "signals": {
          "page_number_signals": ["missing_or_not_public"],
          "page_count_signals": ["missing_or_not_public"],
          "title_signal": "missing_or_not_public"
        }
      }
    ]
  },
  "page_index": {
    "count": 11,
    "entries": [
      { "stable_id": "page_001", "source_ordinal": 1 },
      { "stable_id": "page_002", "source_ordinal": 2 },
      { "stable_id": "page_003", "source_ordinal": 3 },
      { "stable_id": "page_004", "source_ordinal": 4 },
      { "stable_id": "page_005", "source_ordinal": 5 },
      { "stable_id": "page_006", "source_ordinal": 6 },
      { "stable_id": "page_007", "source_ordinal": 7 },
      { "stable_id": "page_008", "source_ordinal": 8 },
      { "stable_id": "page_009", "source_ordinal": 9 },
      { "stable_id": "page_010", "source_ordinal": 10 },
      { "stable_id": "page_011", "source_ordinal": 11 }
    ]
  },
  "source_provenance": {
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "source_size_bytes": 12670307,
    "root_element": "Design",
    "schema_family_marker": "Cadence/OrCAD Capture Design EXP-like XML; host path redacted",
    "parser_mode": "streaming_elementtree_boundary_probe",
    "max_depth": 8,
    "total_element_count": 186608,
    "schematic_count": 1,
    "page_boundary_node_family": "Page",
    "real_sample_used": true,
    "real_sample_path_archived": false,
    "raw_xml_body_included": false,
    "runtime_absolute_path_included": false,
    "global_tag_counts": {
      "Package": 107,
      "PartInst": 1067,
      "NetScalar": 1153,
      "WireScalar": 4378,
      "OffPageConnector": 538,
      "PartInstUserProp": 7644,
      "IsNoConnect": 3494
    }
  },
  "page_role_hints": {
    "authoritative": false,
    "routing_only": true,
    "groups": [
      {
        "pages": [
          "page_001",
          "page_002",
          "page_003",
          "page_004",
          "page_005",
          "page_009",
          "page_010"
        ],
        "hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "basis": {
          "off_page_connector_count": ">0",
          "material_property_signal_count": 0
        }
      },
      {
        "pages": [
          "page_006",
          "page_007",
          "page_008",
          "page_011"
        ],
        "hints": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "basis": {
          "off_page_connector_count": 0,
          "material_property_signal_count": ">0"
        }
      }
    ]
  },
  "split_readiness": {
    "ready": true,
    "status": "ready_with_warning",
    "effective_page_count": 11,
    "single_page_fallback_allowed": false,
    "blockers": [],
    "warnings": [
      "titleblock Page Count=8 conflicts with 11 authoritative Page nodes"
    ],
    "notes": [
      "Use source-order stable ids only.",
      "Titleblock count mismatch is warning-only and does not block splitting."
    ]
  },
  "downstream_handoff": {
    "target_workflow": "page_xml_normalize_spec_v0",
    "bundle": [
      "page XML assets",
      "page_manifest",
      "page_index",
      "source_provenance",
      "warnings"
    ],
    "storage_policy": {
      "project_local_only": true,
      "never_under_workflow_package": true
    },
    "requirements": [
      "Preserve source order and stable ids page_001..page_011.",
      "Keep each page payload intact and page-local.",
      "Treat page-number and page-count metadata as advisory only.",
      "Pass manifest warnings through without renumbering."
    ]
  },
  "open_questions": []
}
```