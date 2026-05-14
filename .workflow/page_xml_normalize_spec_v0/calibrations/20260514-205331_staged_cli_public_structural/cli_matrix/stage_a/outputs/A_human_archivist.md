{
  "profile_metadata": {
    "workflow_id": "page_xml_normalize_spec_v0",
    "profile": {
      "model": "gpt-5.4-mini",
      "reasoning_effort": "low",
      "species": "human",
      "class": "archivist"
    },
    "fixture_type": "public_safe_downstream_structural_metadata_from_prior_split_calibration",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_workflow": "capture_xml_intake_library_v0"
  },
  "normalization_input_summary": {
    "source_page_count": 11,
    "preserve_source_page_order": true,
    "stable_page_id_policy": "page_001..page_011 derived from source order",
    "root_element": "Design",
    "page_boundary_node_family": "Page",
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
    "source_handling": "read-only immutable inputs; no source XML rewrite, rename, or save-over"
  },
  "page_module_spec_plan": {
    "schema_version": "page_module_spec_v0",
    "primary_per_page_file": "page_module_spec_v0.yaml",
    "output_mode": "project-local derived artifacts only",
    "annotation_variant_enabled": false,
    "normalized_page_ref_policy": "blank unless explicit optional derived review variant exists",
    "normalized_sha256_policy": "blank unless explicit optional derived review variant exists",
    "required_blocks": [
      "identity",
      "module_definition",
      "interfaces",
      "performance",
      "composition",
      "evidence_review"
    ],
    "required_interface_containers": [
      "inputs",
      "outputs",
      "bidirectional",
      "passive_or_none"
    ],
    "optional_interface_containers": [
      "local_internal_candidates"
    ],
    "scoping_rule": "classification and channelization are review-required rationale, not confirmed design truth",
    "output_guardrails": [
      "do not collect materials",
      "do not attach MDD files",
      "do not compose a harness",
      "do not infer connectivity",
      "do not claim final library asset registration"
    ]
  },
  "page_module_spec_sidecars": [
    {
      "source_page_id": "page_001",
      "source_page_order": 1,
      "source_page_ref": "project_page_xml_asset.page_001",
      "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_001",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_001",
        "source_page_order": 1,
        "source_page_ref": "project_page_xml_asset.page_001",
        "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "connector-like and regulator-control labels visible; review required",
        "function_hint": "possible power entry/control sheet",
        "channelization_hint": "likely schematic and off-page connector context"
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
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 211,
          "net_scalar_count": 296,
          "wire_scalar_count": 856,
          "off_page_connector_count": 156,
          "pcb_footprint_signal_count": 211
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted power entry/control sheet signal",
        "review_status": "review_required",
        "notes": "Structural density and connector count suggest a meaningful page role, but semantic assignment is not confirmed."
      }
    },
    {
      "source_page_id": "page_002",
      "source_page_order": 2,
      "source_page_ref": "project_page_xml_asset.page_002",
      "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_002",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_002",
        "source_page_order": 2,
        "source_page_ref": "project_page_xml_asset.page_002",
        "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "likely schematic and off-page connector context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 211,
          "net_scalar_count": 296,
          "wire_scalar_count": 851,
          "off_page_connector_count": 155,
          "pcb_footprint_signal_count": 211
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Retain unknown classification; do not overfit from structure alone."
      }
    },
    {
      "source_page_id": "page_003",
      "source_page_order": 3,
      "source_page_ref": "project_page_xml_asset.page_003",
      "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_003",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_003",
        "source_page_order": 3,
        "source_page_ref": "project_page_xml_asset.page_003",
        "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "dense repeated blocks visible; possible channelization review required",
        "function_hint": "dense schematic block page",
        "channelization_hint": "likely schematic and off-page connector context"
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
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 464,
          "net_scalar_count": 260,
          "wire_scalar_count": 1689,
          "off_page_connector_count": 36,
          "pcb_footprint_signal_count": 464
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted dense schematic page signal",
        "review_status": "review_required",
        "notes": "High part-instance density suggests a substantive circuit region, but module identity remains unconfirmed."
      }
    },
    {
      "source_page_id": "page_004",
      "source_page_order": 4,
      "source_page_ref": "project_page_xml_asset.page_004",
      "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_004",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_004",
        "source_page_order": 4,
        "source_page_ref": "project_page_xml_asset.page_004",
        "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "likely schematic and off-page connector context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 11,
          "net_scalar_count": 58,
          "wire_scalar_count": 99,
          "off_page_connector_count": 81,
          "pcb_footprint_signal_count": 11
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Connector-heavy composition is notable, but semantics remain unresolved."
      }
    },
    {
      "source_page_id": "page_005",
      "source_page_order": 5,
      "source_page_ref": "project_page_xml_asset.page_005",
      "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_005",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_005",
        "source_page_order": 5,
        "source_page_ref": "project_page_xml_asset.page_005",
        "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "likely schematic and off-page connector context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 24,
          "net_scalar_count": 51,
          "wire_scalar_count": 132,
          "off_page_connector_count": 45,
          "pcb_footprint_signal_count": 24
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "No stable page-label evidence exposed; maintain generic review stance."
      }
    },
    {
      "source_page_id": "page_006",
      "source_page_order": 6,
      "source_page_ref": "project_page_xml_asset.page_006",
      "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_006",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_006",
        "source_page_order": 6,
        "source_page_ref": "project_page_xml_asset.page_006",
        "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "material-context structural hints present; do not collect materials here",
        "function_hint": "hardware/material-context page",
        "channelization_hint": "schematic content with hardware/material context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 11,
          "net_scalar_count": 10,
          "wire_scalar_count": 50,
          "off_page_connector_count": 0,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 11
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted hardware/material context signal",
        "review_status": "review_required",
        "notes": "Keep materials out of downstream capture; treat as structural context only."
      }
    },
    {
      "source_page_id": "page_007",
      "source_page_order": 7,
      "source_page_ref": "project_page_xml_asset.page_007",
      "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_007",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_007",
        "source_page_order": 7,
        "source_page_ref": "project_page_xml_asset.page_007",
        "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "schematic content with hardware/material context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 12,
          "net_scalar_count": 10,
          "wire_scalar_count": 56,
          "off_page_connector_count": 0,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 12
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "No strong interface inference available."
      }
    },
    {
      "source_page_id": "page_008",
      "source_page_order": 8,
      "source_page_ref": "project_page_xml_asset.page_008",
      "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_008",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_008",
        "source_page_order": 8,
        "source_page_ref": "project_page_xml_asset.page_008",
        "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "hardware/material context and PCB footprint signals present; review required",
        "function_hint": "material-heavy hardware page",
        "channelization_hint": "schematic content with hardware/material context"
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
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 39,
          "net_scalar_count": 19,
          "wire_scalar_count": 123,
          "off_page_connector_count": 0,
          "material_property_signal_count": 39,
          "pcb_footprint_signal_count": 39
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted material-heavy page signal",
        "review_status": "review_required",
        "notes": "Material signals exist structurally, but downstream should not treat them as collected materials."
      }
    },
    {
      "source_page_id": "page_009",
      "source_page_order": 9,
      "source_page_ref": "project_page_xml_asset.page_009",
      "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_009",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_009",
        "source_page_order": 9,
        "source_page_ref": "project_page_xml_asset.page_009",
        "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "likely schematic and off-page connector context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 58,
          "net_scalar_count": 39,
          "wire_scalar_count": 220,
          "off_page_connector_count": 23,
          "pcb_footprint_signal_count": 58
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Maintain unknown unless stronger page-local evidence is available elsewhere."
      }
    },
    {
      "source_page_id": "page_010",
      "source_page_order": 10,
      "source_page_ref": "project_page_xml_asset.page_010",
      "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_010",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_010",
        "source_page_order": 10,
        "source_page_ref": "project_page_xml_asset.page_010",
        "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "likely schematic and off-page connector context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "offpage_connector_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 10,
          "net_scalar_count": 102,
          "wire_scalar_count": 237,
          "off_page_connector_count": 42,
          "pcb_footprint_signal_count": 10
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "Connector density suggests interaction with other pages, but no confirmed module scope."
      }
    },
    {
      "source_page_id": "page_011",
      "source_page_order": 11,
      "source_page_ref": "project_page_xml_asset.page_011",
      "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "identity": {
        "registration_key": "page_011",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_011",
        "source_page_order": 11,
        "source_page_ref": "project_page_xml_asset.page_011",
        "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3"
      },
      "module_definition": {
        "module_scope": "review_required",
        "classification_basis": "visible evidence weak or generic; keep unknown/review_required",
        "function_hint": "unknown",
        "channelization_hint": "schematic content with hardware/material context"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": []
      },
      "performance": {
        "quantitative_claims": [],
        "unsupported_values_stay_blank": true
      },
      "composition": {
        "page_role_hint": [
          "schematic_content",
          "hardware_or_material_context",
          "possible_pcb_context"
        ],
        "structural_counts": {
          "part_inst_count": 16,
          "net_scalar_count": 12,
          "wire_scalar_count": 65,
          "off_page_connector_count": 0,
          "material_property_signal_count": 3,
          "pcb_footprint_signal_count": 16
        }
      },
      "evidence_review": {
        "visible_label_hint": "redacted schematic page signal",
        "review_status": "review_required",
        "notes": "No confirmed downstream library asset registration implied."
      }
    }
  ],
  "module_spec_manifest": {
    "workflow_id": "page_xml_normalize_spec_v0",
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
    "primary_sidecar_name": "page_module_spec_v0.yaml",
    "ordering_policy": "preserve source order",
    "page_identity_policy": "stable ordinal page ids only; ignore titleblock page-count completeness for identity",
    "destination_policy": "project-local derived artifacts only; never under .workflow/"
  },
  "module_spec_index": [
    {
      "source_page_id": "page_001",
      "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_001"
    },
    {
      "source_page_id": "page_002",
      "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_002"
    },
    {
      "source_page_id": "page_003",
      "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_003"
    },
    {
      "source_page_id": "page_004",
      "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_004"
    },
    {
      "source_page_id": "page_005",
      "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_005"
    },
    {
      "source_page_id": "page_006",
      "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_006"
    },
    {
      "source_page_id": "page_007",
      "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_007"
    },
    {
      "source_page_id": "page_008",
      "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_008"
    },
    {
      "source_page_id": "page_009",
      "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_009"
    },
    {
      "source_page_id": "page_010",
      "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_010"
    },
    {
      "source_page_id": "page_011",
      "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
      "sidecar_name": "page_module_spec_v0.yaml",
      "registration_key": "page_011"
    }
  ],
  "provenance_update": {
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_handoff_target": "capture_xml_intake_library_v0",
    "provenance_state": "derived structural metadata packet only",
    "preservation_statement": "source page XML assets treated as immutable read-only inputs; no normalization or rewrite performed",
    "explicit_non_actions": [
      "no raw XML included",
      "no runtime absolute paths included",
      "no generated project outputs included",
      "no credentials or secret material included",
      "no material collection performed"
    ]
  },
  "normalization_warnings": [
    "Titleblock page-count signal reports 8 while 11 page nodes are present; do not use the titleblock count as identity truth.",
    "Page-number signals are incomplete and non-contiguous; preserve source order and stable page ids only.",
    "Annotation variants are disabled by default; normalized_page_ref and normalized_sha256 remain blank.",
    "Material-property structural signals exist on some pages, but downstream must not treat this as collected materials.",
    "Classification, scope, and interface labels are review-required rationale rather than confirmed design truth."
  ],
  "downstream_handoff": {
    "target_workflow": "capture_xml_intake_library_v0",
    "handoff_payloads": [
      "page_module_spec_sidecars",
      "module_spec_manifest",
      "downstream_handoff"
    ],
    "compact_packet": {
      "workflow_id": "page_xml_normalize_spec_v0",
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
      "policy_flags": {
        "preserve_source_order": true,
        "preserve_page_xml_without_normalization": true,
        "annotation_variant_enabled": false,
        "final_asset_registration_done_here": false
      },
      "requested_action": "ingest page_module_spec_sidecars and module_spec_manifest as review-only downstream intake inputs"
    }
  },
  "boundary_review": {
    "public_safe": true,
    "project_local_only": true,
    "under_workflow_package": false,
    "source_xml_mutation": false,
    "raw_xml_exposed": false,
    "private_material_exposed": false,
    "library_registration_claimed": false
  },
  "open_questions": [
    "Should any page-local review later elevate a page from unknown/review_required to a more specific module scope, or should this calibration stay strictly structural?",
    "Is there a project policy for optional review-only annotation variants, or should they remain disabled for all downstream calibration runs?",
    "Should downstream intake prefer page-local label examples only when explicitly public-safe, or always keep local_internal_candidates separate from external interfaces?"
  ]
}