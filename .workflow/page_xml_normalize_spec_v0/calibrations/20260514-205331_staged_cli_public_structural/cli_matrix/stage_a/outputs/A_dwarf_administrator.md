{
  "profile_metadata": {
    "workflow_id": "page_xml_normalize_spec_v0",
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_workflow": "capture_xml_intake_library_v0",
    "assigned_profile": {
      "model": "gpt-5.4-mini",
      "reasoning_effort": "low",
      "species": "dwarf",
      "class": "administrator"
    },
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f"
  },
  "normalization_input_summary": {
    "source_type": "public-safe downstream structural metadata from prior split calibration",
    "root_element": "Design",
    "page_boundary_node_family": "Page",
    "page_count": 11,
    "source_order_policy": "preserve upstream page order exactly",
    "stable_page_id_policy": "page_001 through page_011 derived from source order",
    "titleblock_signals": {
      "reported_page_count_values": ["8"],
      "reported_page_number_values": ["1", "2", "5", "6", "7", "8"],
      "conflicts_with_actual_page_nodes": true,
      "treat_as_identity_noise": true
    },
    "normalization_scope": "spec-only, public-safe, read-only inputs",
    "preservation_rules": [
      "do not rewrite source XML",
      "do not normalize source XML in place",
      "do not rename source page assets",
      "do not save over source XML"
    ]
  },
  "page_module_spec_plan": {
    "primary_output": "one page_module_spec_v0.yaml sidecar per source page",
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
    "required_sidecar_blocks": [
      "identity",
      "module_definition",
      "interfaces",
      "performance",
      "composition",
      "evidence_review"
    ],
    "interface_container_policy": [
      "inputs",
      "outputs",
      "bidirectional",
      "passive_or_none"
    ],
    "local_internal_candidates_policy": "keep separate from external interface containers",
    "normalized_ref_policy": "blank unless explicit derived review variant exists",
    "annotation_variant_policy": "disabled by default; review-only if explicitly enabled",
    "scope_disclaimer": [
      "classification is rationale, not confirmed design truth",
      "module scope is review-required",
      "channelization is review-required",
      "function hints are review-required"
    ]
  },
  "page_module_spec_sidecars": [
    {
      "source_page_id": "page_001",
      "source_page_order": 1,
      "source_sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90",
      "registration_key": "page_001",
      "source_system_id": "project_page_xml_asset.page_001",
      "source_page_ref": "project_page_xml_asset.page_001",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "connector-like and regulator-control labels visible; review required"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": ["SW", "FB", "PG"]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted power entry/control sheet signal",
        "classification_basis_hint": "connector-like and regulator-control labels visible; review required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_002",
      "source_page_order": 2,
      "source_sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee",
      "registration_key": "page_002",
      "source_system_id": "project_page_xml_asset.page_002",
      "source_page_ref": "project_page_xml_asset.page_002",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_003",
      "source_page_order": 3,
      "source_sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc",
      "registration_key": "page_003",
      "source_system_id": "project_page_xml_asset.page_003",
      "source_page_ref": "project_page_xml_asset.page_003",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "dense repeated blocks visible; possible channelization review required"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": ["FB", "SET", "VIOC"]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted dense schematic page signal",
        "classification_basis_hint": "dense repeated blocks visible; possible channelization review required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_004",
      "source_page_order": 4,
      "source_sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538",
      "registration_key": "page_004",
      "source_system_id": "project_page_xml_asset.page_004",
      "source_page_ref": "project_page_xml_asset.page_004",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_005",
      "source_page_order": 5,
      "source_sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9",
      "registration_key": "page_005",
      "source_system_id": "project_page_xml_asset.page_005",
      "source_page_ref": "project_page_xml_asset.page_005",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_006",
      "source_page_order": 6,
      "source_sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405",
      "registration_key": "page_006",
      "source_system_id": "project_page_xml_asset.page_006",
      "source_page_ref": "project_page_xml_asset.page_006",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "material-context structural hints present; do not collect materials here"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "missing_or_not_public",
        "visible_label_hint": "redacted hardware/material context signal",
        "classification_basis_hint": "material-context structural hints present; do not collect materials here",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_007",
      "source_page_order": 7,
      "source_sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870",
      "registration_key": "page_007",
      "source_system_id": "project_page_xml_asset.page_007",
      "source_page_ref": "project_page_xml_asset.page_007",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "missing_or_not_public",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_008",
      "source_page_order": 8,
      "source_sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b",
      "registration_key": "page_008",
      "source_system_id": "project_page_xml_asset.page_008",
      "source_page_ref": "project_page_xml_asset.page_008",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "hardware/material context and PCB footprint signals present; review required"
      },
      "interfaces": {
        "inputs": [],
        "outputs": [],
        "bidirectional": [],
        "passive_or_none": [],
        "local_internal_candidates": ["PG"]
      },
      "performance": {
        "quantitative_claims": {},
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "missing_or_not_public",
        "visible_label_hint": "redacted material-heavy page signal",
        "classification_basis_hint": "hardware/material context and PCB footprint signals present; review required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_009",
      "source_page_order": 9,
      "source_sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227",
      "registration_key": "page_009",
      "source_system_id": "project_page_xml_asset.page_009",
      "source_page_ref": "project_page_xml_asset.page_009",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_010",
      "source_page_order": 10,
      "source_sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665",
      "registration_key": "page_010",
      "source_system_id": "project_page_xml_asset.page_010",
      "source_page_ref": "project_page_xml_asset.page_010",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "offpage_connector_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "present_redacted",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    },
    {
      "source_page_id": "page_011",
      "source_page_order": 11,
      "source_sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3",
      "registration_key": "page_011",
      "source_system_id": "project_page_xml_asset.page_011",
      "source_page_ref": "project_page_xml_asset.page_011",
      "normalized_page_ref": "",
      "normalized_sha256": "",
      "module_definition": {
        "structural_scope": "unknown",
        "scope_rationale": "visible evidence weak or generic; keep unknown/review_required"
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
        "unsupported_values_blank": true
      },
      "composition": {
        "role_hints": ["schematic_content", "hardware_or_material_context", "possible_pcb_context"],
        "channelization_status": "review_required"
      },
      "evidence_review": {
        "source_label_signal": "missing_or_not_public",
        "visible_label_hint": "redacted schematic page signal",
        "classification_basis_hint": "visible evidence weak or generic; keep unknown/review_required",
        "evidence_confidence": "low"
      }
    }
  ],
  "module_spec_manifest": {
    "schema_version": "page_module_spec_v0",
    "source_order_preserved": true,
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
    "page_count": 11,
    "manifest_rules": [
      "page_module_spec sidecars are per-page derived artifacts only",
      "project-local only",
      "never under .workflow/",
      "no raw XML included",
      "no final asset registration claimed"
    ]
  },
  "module_spec_index": {
    "index_kind": "page_module_spec_v0",
    "entries": [
      { "page_id": "page_001", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "1a3da91ab0a283e2ad965458df64dc1336cd6bf37e9bbadff737eebe0c66ad90" },
      { "page_id": "page_002", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "4a18c884f36bedabf58bd176d1e7d73c71ff7893d69b0de8b6277b2c337614ee" },
      { "page_id": "page_003", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "f355dc8f26a38429e8ace9f95e84c164bc7ef233eba95d15026bb4c735d93dfc" },
      { "page_id": "page_004", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "2760adf758d9d3c3331997189ac28dd129c41059f0c5db3b9babf160164ee538" },
      { "page_id": "page_005", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "c3d237934d8165606fecfd2e15c590bb7fec496cf92ae4434691a8e01987daf9" },
      { "page_id": "page_006", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "311a9d421ed1e7bdea6a2dcebb944bb4e84c0e23830392cce7d1e782b696c405" },
      { "page_id": "page_007", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "19728e0aff41acc3f7ecb42a0588b6e9a3762f40aa473e163f03f0dd9fca7870" },
      { "page_id": "page_008", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "34e41c5eb8d9a2785727ae24f6e2ec125c49bdba54d39d78bc4e99453ca2465b" },
      { "page_id": "page_009", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "e6a6a20dd485f62c58beffd941612363acf1513ac54d26a88f36e4993c45a227" },
      { "page_id": "page_010", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "1d4a28f3140bf1b25f3426c8fe4b56ef0d08ff0828514321350108f6cbc3f665" },
      { "page_id": "page_011", "sidecar_file": "page_module_spec_v0.yaml", "sha256": "fb360e4fe37cb7046f9180ab6bbcad88656e76eb6102e1678f7cbab6c4f089f3" }
    ]
  },
  "provenance_update": {
    "upstream_source": "whole_xml_page_split_v0",
    "downstream_target": "capture_xml_intake_library_v0",
    "provenance_state": "derived public-safe structural metadata only",
    "lineage_notes": [
      "source page XML treated as immutable read-only input",
      "page identifiers derived from source order, not titleblock count",
      "derived review-only spec packet produced without normalization mutation"
    ]
  },
  "normalization_warnings": [
    "titleblock page count signal conflicts with actual page node count",
    "titleblock page number signal is incomplete and non-contiguous",
    "page_003, page_006, page_007, page_008, page_011 have missing or not public page-number/count signals",
    "material-property signals are present on some pages; do not collect materials here",
    "interface claims remain review-required and should not be treated as confirmed connectivity",
    "normalized_page_ref and normalized_sha256 remain blank by policy"
  ],
  "downstream_handoff": {
    "target_workflow": "capture_xml_intake_library_v0",
    "handoff_packet": {
      "artifact_set": [
        "page_module_spec_sidecars",
        "module_spec_manifest"
      ],
      "compact_context": {
        "page_count": 11,
        "source_order_preserved": true,
        "stable_page_ids": "page_001..page_011",
        "annotation_variant_enabled": false,
        "semantic_truth_status": "review_required"
      },
      "handoff_intent": "pass page-level structural specs for intake library review without claiming final registration"
    }
  },
  "boundary_review": {
    "public_safe_only": true,
    "no_raw_xml": true,
    "no_runtime_absolute_paths": true,
    "no_credentials_or_secret_material": true,
    "no_generated_project_outputs_included": true,
    "no_harness_composition": true,
    "no_material_collection": true,
    "no_final_asset_registration_claimed": true,
    "not_under_workflow_package": true
  },
  "open_questions": [
    "Should any page receive an explicit annotation_variant in a future review-only pass if project policy enables it?",
    "Does downstream intake want an additional manifest field for page-level confidence tiers, or is evidence_review sufficient?",
    "Should page-level module labels remain uniformly unknown until a separate semantic review pass confirms scope?"
  ]
}