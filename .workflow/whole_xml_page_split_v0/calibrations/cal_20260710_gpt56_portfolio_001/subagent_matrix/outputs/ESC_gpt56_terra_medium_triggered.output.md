{
  "page_xml_assets": {
    "status": "planned_from_fixture",
    "output_location": "project-local page split output root (binding-resolved; not under workflow package)",
    "assets": [
      {"page_id": "page_001", "source_ordinal": 1, "asset_ref": "page_001.xml"},
      {"page_id": "page_002", "source_ordinal": 2, "asset_ref": "page_002.xml"},
      {"page_id": "page_003", "source_ordinal": 3, "asset_ref": "page_003.xml"},
      {"page_id": "page_004", "source_ordinal": 4, "asset_ref": "page_004.xml"},
      {"page_id": "page_005", "source_ordinal": 5, "asset_ref": "page_005.xml"},
      {"page_id": "page_006", "source_ordinal": 6, "asset_ref": "page_006.xml"},
      {"page_id": "page_007", "source_ordinal": 7, "asset_ref": "page_007.xml"},
      {"page_id": "page_008", "source_ordinal": 8, "asset_ref": "page_008.xml"},
      {"page_id": "page_009", "source_ordinal": 9, "asset_ref": "page_009.xml"},
      {"page_id": "page_010", "source_ordinal": 10, "asset_ref": "page_010.xml"},
      {"page_id": "page_011", "source_ordinal": 11, "asset_ref": "page_011.xml"}
    ],
    "content_constraints": [
      "Each asset is intended to contain only its source page-local XML payload.",
      "No XML normalization, semantic rewriting, or source mutation is authorized."
    ]
  },
  "page_manifest": {
    "status": "planned_from_fixture",
    "page_count": 11,
    "page_order": [
      "page_001",
      "page_002",
      "page_003",
      "page_004",
      "page_005",
      "page_006",
      "page_007",
      "page_008",
      "page_009",
      "page_010",
      "page_011"
    ],
    "page_id_policy": "Stable IDs derive solely from source order as page_001 through page_011.",
    "warnings": [
      "Titleblock Page Count signal reports 8 on six observed page nodes and conflicts with the 11 Page boundary nodes.",
      "Public page-number signals are incomplete and non-contiguous; they are not used as complete identity.",
      "Five page nodes have missing or non-public page-number signals.",
      "No raw page XML body is included in this manifest."
    ],
    "pages": [
      {"page_id": "page_001", "source_ordinal": 1, "asset_ref": "page_001.xml", "element_count": 29892},
      {"page_id": "page_002", "source_ordinal": 2, "asset_ref": "page_002.xml", "element_count": 29974},
      {"page_id": "page_003", "source_ordinal": 3, "asset_ref": "page_003.xml", "element_count": 57198},
      {"page_id": "page_004", "source_ordinal": 4, "asset_ref": "page_004.xml", "element_count": 3210},
      {"page_id": "page_005", "source_ordinal": 5, "asset_ref": "page_005.xml", "element_count": 4190},
      {"page_id": "page_006", "source_ordinal": 6, "asset_ref": "page_006.xml", "element_count": 1434},
      {"page_id": "page_007", "source_ordinal": 7, "asset_ref": "page_007.xml", "element_count": 1536},
      {"page_id": "page_008", "source_ordinal": 8, "asset_ref": "page_008.xml", "element_count": 4404},
      {"page_id": "page_009", "source_ordinal": 9, "asset_ref": "page_009.xml", "element_count": 7200},
      {"page_id": "page_010", "source_ordinal": 10, "asset_ref": "page_010.xml", "element_count": 5808},
      {"page_id": "page_011", "source_ordinal": 11, "asset_ref": "page_011.xml", "element_count": 2096}
    ]
  },
  "page_index": {
    "status": "planned_from_fixture",
    "ordered_page_ids": [
      "page_001",
      "page_002",
      "page_003",
      "page_004",
      "page_005",
      "page_006",
      "page_007",
      "page_008",
      "page_009",
      "page_010",
      "page_011"
    ],
    "source_ordinal_to_page_id": {
      "1": "page_001",
      "2": "page_002",
      "3": "page_003",
      "4": "page_004",
      "5": "page_005",
      "6": "page_006",
      "7": "page_007",
      "8": "page_008",
      "9": "page_009",
      "10": "page_010",
      "11": "page_011"
    },
    "identity_boundary": "Source order is authoritative for this split plan; titleblock labels and page-number signals remain recorded only as warnings or review context."
  },
  "source_provenance": {
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_revision_identity": "synthetic fixture revision identity unavailable",
    "source_file_sha256_prefix": "74195c6c62bdcf3f",
    "source_file_sha256": "not public in supplied fixture",
    "source_size_bytes": 12670307,
    "root_element": "Design",
    "schema_marker": "Cadence/OrCAD Capture Design EXP-like XML; host path redacted",
    "parser_mode": "streaming_elementtree_boundary_probe",
    "page_boundary_node_family": "Page",
    "page_count_candidate": 11,
    "split_method": "source-order Page boundary extraction with ordinal stable IDs",
    "source_mutation_status": "not runtime-verified by this deliverable; source mutation remains prohibited",
    "raw_xml_body_included": false,
    "runtime_absolute_path_included": false,
    "provenance_limits": [
      "The supplied SHA-256 value is a prefix, not a complete digest.",
      "No host path, raw XML, page payload, credential, or runtime-created timestamp is represented."
    ]
  },
  "page_role_hints": {
    "status": "non_authoritative routing hints",
    "pages": [
      {"page_id": "page_001", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_002", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_003", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_004", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_005", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_006", "hints": ["mixed", "hardware_or_material_context", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_007", "hints": ["mixed", "hardware_or_material_context", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_008", "hints": ["mixed", "hardware_or_material_context", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_009", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_010", "hints": ["schematic", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true},
      {"page_id": "page_011", "hints": ["mixed", "hardware_or_material_context", "possible_pcb_or_mdd_context"], "confidence": "low", "review_required": true}
    ],
    "boundary_note": "Hints do not establish PCB/MDD pairing, material collection, connectivity, or design intent."
  },
  "split_readiness": {
    "status": "conditionally ready_for_page_xml_normalize_spec_v0",
    "readiness_basis": [
      "The fixture identifies 11 ordered Page boundaries.",
      "A deterministic stable-ID plan is available.",
      "The split policy requires project-local outputs and prohibits workflow-package output.",
      "The intended operation preserves page-local XML without normalization."
    ],
    "required_before_downstream_handoff": [
      "Resolve the project-local output binding.",
      "Create the listed assets from the read-only source according to the split plan.",
      "Record complete source digest, source revision identity, asset checksums, creation time, and tool/script identity in project-local provenance.",
      "Confirm source remains unchanged and all derived assets remain outside the workflow package."
    ],
    "stop_conditions": [
      "Stop if the source cannot be treated as read-only.",
      "Stop if the output root resolves under a workflow package.",
      "Stop if Page-boundary extraction does not yield the planned 11 boundaries.",
      "Stop if deterministic source-order identity cannot be preserved.",
      "Stop if any operation would normalize XML, rewrite design semantics, collect materials, or assert PCB/MDD pairing."
    ],
    "non_claims": [
      "No runtime file creation or source-integrity verification is asserted.",
      "No normalization, material collection, connectivity inference, or PCB/MDD pairing result is asserted."
    ]
  }
}
