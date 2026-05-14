{
  "profile_metadata": {
    "workflow_id": "page_xml_normalize_spec_v0",
    "profile": {
      "model": "gpt-5.4-mini",
      "reasoning_effort": "low",
      "species": "darkelf",
      "class": "administrator"
    },
    "fixture_type": "public_safe_downstream_structural_metadata_from_prior_split_calibration",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_workflow": "capture_xml_intake_library_v0"
  },
  "normalization_input_summary": {
    "root_element": "Design",
    "page_boundary_node_family": "Page",
    "page_count": 11,
    "stable_page_id_policy": "derive page_001..page_011 from source order; do not trust titleblock Page Count/Number as complete identity",
    "preserve_source_page_order": true,
    "preserve_page_xml_without_normalization": true,
    "annotation_variant_enabled": false,
    "raw_xml_body_included": false,
    "source_sha256_prefix": "74195c6c62bdcf3f"
  },
  "page_module_spec_plan": {
    "schema_version": "page_module_spec_v0",
    "primary_per_page_file": "page_module_spec_v0.yaml",
    "required_blocks": [
      "identity",
      "module_definition",
      "interfaces",
      "performance",
      "composition",
      "evidence_review"
    ],
    "per_page_outputs": 11,
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
    "normalized_page_ref_policy": "blank_unless_optional_derived_review_variant_exists",
    "semantic_claims_require_review": true,
    "classification_basis_records_rationale_not_truth": true,
    "final_asset_registration_done_here": false
  },
  "page_module_spec_sidecars": [
    {
      "source_page_id": "page_001",
      "source_page_order": 1,
      "source_page_ref": "project_page_xml_asset.page_001",
      "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
      "identity": {
        "registration_key": "page_001",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_001",
        "source_page_order": 1,
        "source_page_ref": "project_page_xml_asset.page_001",
        "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "connector-like and regulator-control labels visible; review required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": [
          "SW",
          "FB",
          "PG"
        ]
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": [
          "SW",
          "FB",
          "PG"
        ]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted power entry/control sheet signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_002",
      "source_page_order": 2,
      "source_page_ref": "project_page_xml_asset.page_002",
      "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
      "identity": {
        "registration_key": "page_002",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_002",
        "source_page_order": 2,
        "source_page_ref": "project_page_xml_asset.page_002",
        "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_003",
      "source_page_order": 3,
      "source_page_ref": "project_page_xml_asset.page_003",
      "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
      "identity": {
        "registration_key": "page_003",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_003",
        "source_page_order": 3,
        "source_page_ref": "project_page_xml_asset.page_003",
        "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "dense repeated blocks visible; possible channelization review required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": [
          "FB",
          "SET",
          "VIOC"
        ]
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": [
          "FB",
          "SET",
          "VIOC"
        ]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted dense schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_004",
      "source_page_order": 4,
      "source_page_ref": "project_page_xml_asset.page_004",
      "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
      "identity": {
        "registration_key": "page_004",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_004",
        "source_page_order": 4,
        "source_page_ref": "project_page_xml_asset.page_004",
        "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_005",
      "source_page_order": 5,
      "source_page_ref": "project_page_xml_asset.page_005",
      "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
      "identity": {
        "registration_key": "page_005",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_005",
        "source_page_order": 5,
        "source_page_ref": "project_page_xml_asset.page_005",
        "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_006",
      "source_page_order": 6,
      "source_page_ref": "project_page_xml_asset.page_006",
      "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
      "identity": {
        "registration_key": "page_006",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_006",
        "source_page_order": 6,
        "source_page_ref": "project_page_xml_asset.page_006",
        "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "material-context structural hints present; do not collect materials here",
        "function_hints": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted hardware/material context signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_007",
      "source_page_order": 7,
      "source_page_ref": "project_page_xml_asset.page_007",
      "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
      "identity": {
        "registration_key": "page_007",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_007",
        "source_page_order": 7,
        "source_page_ref": "project_page_xml_asset.page_007",
        "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_008",
      "source_page_order": 8,
      "source_page_ref": "project_page_xml_asset.page_008",
      "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
      "identity": {
        "registration_key": "page_008",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_008",
        "source_page_order": 8,
        "source_page_ref": "project_page_xml_asset.page_008",
        "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "hardware/material context and PCB footprint signals present; review required",
        "function_hints": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": [
          "PG"
        ]
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": [
          "PG"
        ]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted material-heavy page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_009",
      "source_page_order": 9,
      "source_page_ref": "project_page_xml_asset.page_009",
      "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
      "identity": {
        "registration_key": "page_009",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_009",
        "source_page_order": 9,
        "source_page_ref": "project_page_xml_asset.page_009",
        "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_010",
      "source_page_order": 10,
      "source_page_ref": "project_page_xml_asset.page_010",
      "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
      "identity": {
        "registration_key": "page_010",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_010",
        "source_page_order": 10,
        "source_page_ref": "project_page_xml_asset.page_010",
        "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    },
    {
      "source_page_id": "page_011",
      "source_page_order": 11,
      "source_page_ref": "project_page_xml_asset.page_011",
      "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
      "identity": {
        "registration_key": "page_011",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_011",
        "source_page_order": 11,
        "source_page_ref": "project_page_xml_asset.page_011",
        "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
        "normalized_page_ref": "",
        "normalized_sha256": ""
      },
      "module_definition": {
        "structural_scope_default": "unknown",
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hints": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "local_internal_candidates": []
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_quantitative_values": "blank"
      },
      "composition": {
        "preserve_source_page_order": true,
        "source_page_is_read_only": true,
        "source_page_xml_mutation_allowed": false,
        "annotation_variant": false
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Public-safe structural metadata only; do not infer final library asset registration."
      }
    }
  ],
  "module_spec_manifest": {
    "workflow_id": "page_xml_normalize_spec_v0",
    "schema_version": "page_module_spec_v0",
    "source_page_count": 11,
    "stable_page_ids": [
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
    "source_page_order_preserved": true,
    "project_local_only": true,
    "never_under_workflow_package": true,
    "source_page_xml_mutation_allowed": false,
    "final_asset_registration_done_here": false
  },
  "module_spec_index": {
    "page_001": {
      "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_002": {
      "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_003": {
      "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_004": {
      "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_005": {
      "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_006": {
      "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_007": {
      "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_008": {
      "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_009": {
      "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_010": {
      "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    },
    "page_011": {
      "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "review_status": "review_required"
    }
  },
  "provenance_update": {
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_workflow": "capture_xml_intake_library_v0",
    "source_fixture_ref": "whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "provenance_scope": "public-safe structural metadata only",
    "derived_artifacts": [
      "page_module_spec_sidecars",
      "module_spec_manifest",
      "module_spec_index"
    ],
    "final_asset_registration_done_here": false
  },
  "normalization_warnings": [
    "Titleblock page count signal reports 8, but observed source page nodes are 11; preserve ordinal source order and stable page ids.",
    "Page-number signals are non-contiguous and partially missing; do not use them as identity.",
    "normalized_page_ref and normalized_sha256 remain blank because no optional derived review XML variant is enabled.",
    "Classification and module scope remain review-required rationale, not confirmed design truth.",
    "Do not infer material collection, connectivity, harness composition, or library registration from structural hints."
  ],
  "downstream_handoff": {
    "target_workflow": "capture_xml_intake_library_v0",
    "handoff_payload": [
      "page_module_spec_sidecars",
      "module_spec_manifest",
      "downstream_handoff"
    ],
    "handoff_mode": "compact",
    "constraints": {
      "project_local_only": true,
      "no_raw_xml": true,
      "no_project_private_material": true,
      "no_generated_output_payloads_under_workflow": true
    },
    "next_expected_action": "consume page sidecars as read-only derived metadata and continue intake review"
  },
  "boundary_review": {
    "public_safe": true,
    "read_only_inputs_respected": true,
    "no_commands_run": true,
    "no_files_created": true,
    "no_xml_mutation": true,
    "no_material_collection": true,
    "no_final_registration_claimed": true,
    "project_local_only": true
  },
  "open_questions": [
    "Should a later review pass assign any optional derived review XML variant, or keep normalized_page_ref and normalized_sha256 blank for all pages?",
    "Does downstream intake want any page-specific priority ordering beyond the preserved source order?",
    "Should pages with stronger visible evidence be tagged for higher review priority, or left uniformly review_required?"
  ]
}