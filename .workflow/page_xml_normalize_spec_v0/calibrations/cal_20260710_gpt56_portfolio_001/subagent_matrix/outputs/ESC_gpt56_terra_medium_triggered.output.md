{
  "page_module_spec_sidecars": {
    "schema_version": "page_module_spec_v0",
    "primary_per_page_file": "page_module_spec_v0.yaml",
    "materialization_status": "fixture_structural_metadata_only",
    "sidecars": [
      {
        "sidecar_ref": "page_module_specs/page_001/page_module_spec_v0.yaml",
        "identity": {
          "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_001",
          "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
          "source_page_id": "page_001",
          "source_page_order": 1,
          "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_001",
          "source_sha256": null,
          "source_sha256_prefix": "74195c6c62bdcf3f",
          "normalized_page_ref": null,
          "normalized_sha256": null
        },
        "module_definition": {
          "module_scope": "unknown",
          "electrical_domains": [],
          "channelization": {
            "appears_channelized": null,
            "channel_count_hint": null,
            "channel_range_hint": null,
            "repeated_block_kind": null,
            "repeated_block_label_hint": null,
            "evidence_refs": []
          },
          "classification_basis": {
            "page_label": null,
            "visible_part_names": [],
            "connector_like_labels": [],
            "visible_regulator_identity": null,
            "other_visible_evidence": []
          },
          "review_required": true
        },
        "interfaces": {
          "inputs": [],
          "outputs": [],
          "bidirectional": [],
          "passive_or_none": [],
          "local_internal_candidates": [],
          "interface_groups": []
        },
        "performance": {
          "function_hint": null,
          "quantitative_values": [],
          "review_required": true
        },
        "system_contract": {
          "electrical_domains": [],
          "power_contract": [],
          "signal_contract": [],
          "readiness_contract": {
            "harness_ready": false,
            "basis": "no_source_backed interface or connectivity evidence supplied"
          }
        },
        "composition": {
          "external_harness_interfaces": [],
          "local_internal_candidates_are_external_interfaces": false,
          "composition_status": "not_composed"
        },
        "evidence_review": {
          "source_evidence_refs": [],
          "role_hints": [],
          "review_required": true,
          "source_gaps": [
            "Source page XML content and page-level labels were not supplied in this public-safe fixture.",
            "Only a source checksum prefix was supplied; full source_sha256 remains unavailable."
          ],
          "owner_followup": [
            "Provide source-backed page evidence before confirming module semantics, interfaces, domains, or quantitative values."
          ]
        }
      },
      {
        "sidecar_ref": "page_module_specs/page_002/page_module_spec_v0.yaml",
        "identity": {
          "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_002",
          "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
          "source_page_id": "page_002",
          "source_page_order": 2,
          "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_002",
          "source_sha256": null,
          "source_sha256_prefix": "74195c6c62bdcf3f",
          "normalized_page_ref": null,
          "normalized_sha256": null
        },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no_source-backed interface or connectivity evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_003/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_003", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_003", "source_page_order": 3, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_003", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_004/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_004", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_004", "source_page_order": 4, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_004", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_005/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_005", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_005", "source_page_order": 5, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_005", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_006/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_006", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_006", "source_page_order": 6, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_006", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_007/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_007", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_007", "source_page_order": 7, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_007", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_008/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_008", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_008", "source_page_order": 8, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_008", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_009/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_009", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_009", "source_page_order": 9, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_009", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_010/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_010", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_010", "source_page_order": 10, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_010", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      },
      {
        "sidecar_ref": "page_module_specs/page_011/page_module_spec_v0.yaml",
        "identity": { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_011", "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml", "source_page_id": "page_011", "source_page_order": 11, "source_page_ref": "source-page://project_binding.whole_xml_source.sample_exp_capture_big_xml/page_011", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "normalized_page_ref": null, "normalized_sha256": null },
        "module_definition": { "module_scope": "unknown", "electrical_domains": [], "channelization": { "appears_channelized": null, "channel_count_hint": null, "channel_range_hint": null, "repeated_block_kind": null, "repeated_block_label_hint": null, "evidence_refs": [] }, "classification_basis": { "page_label": null, "visible_part_names": [], "connector_like_labels": [], "visible_regulator_identity": null, "other_visible_evidence": [] }, "review_required": true },
        "interfaces": { "inputs": [], "outputs": [], "bidirectional": [], "passive_or_none": [], "local_internal_candidates": [], "interface_groups": [] },
        "performance": { "function_hint": null, "quantitative_values": [], "review_required": true },
        "system_contract": { "electrical_domains": [], "power_contract": [], "signal_contract": [], "readiness_contract": { "harness_ready": false, "basis": "no source-backed evidence supplied" } },
        "composition": { "external_harness_interfaces": [], "local_internal_candidates_are_external_interfaces": false, "composition_status": "not_composed" },
        "evidence_review": { "source_evidence_refs": [], "role_hints": [], "review_required": true, "source_gaps": ["Source page XML content and page-level labels were not supplied.", "Full source_sha256 unavailable."], "owner_followup": ["Provide source-backed page evidence before confirmation."] }
      }
    ]
  },
  "module_spec_manifest": {
    "schema_version": "page_module_spec_manifest_v0",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "page_count": 11,
    "entries": [
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_001", "source_page_id": "page_001", "source_page_order": 1, "page_module_spec_ref": "page_module_specs/page_001/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_002", "source_page_id": "page_002", "source_page_order": 2, "page_module_spec_ref": "page_module_specs/page_002/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_003", "source_page_id": "page_003", "source_page_order": 3, "page_module_spec_ref": "page_module_specs/page_003/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_004", "source_page_id": "page_004", "source_page_order": 4, "page_module_spec_ref": "page_module_specs/page_004/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_005", "source_page_id": "page_005", "source_page_order": 5, "page_module_spec_ref": "page_module_specs/page_005/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_006", "source_page_id": "page_006", "source_page_order": 6, "page_module_spec_ref": "page_module_specs/page_006/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_007", "source_page_id": "page_007", "source_page_order": 7, "page_module_spec_ref": "page_module_specs/page_007/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_008", "source_page_id": "page_008", "source_page_order": 8, "page_module_spec_ref": "page_module_specs/page_008/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_009", "source_page_id": "page_009", "source_page_order": 9, "page_module_spec_ref": "page_module_specs/page_009/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_010", "source_page_id": "page_010", "source_page_order": 10, "page_module_spec_ref": "page_module_specs/page_010/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true },
      { "registration_key": "pmsv0:project_binding.whole_xml_source.sample_exp_capture_big_xml:page_011", "source_page_id": "page_011", "source_page_order": 11, "page_module_spec_ref": "page_module_specs/page_011/page_module_spec_v0.yaml", "source_sha256": null, "source_sha256_prefix": "74195c6c62bdcf3f", "primary_domain": "unknown", "harness_readiness_basis": "no source-backed evidence supplied", "source_gap_present": true, "normalization_status": "review_required", "review_required": true }
    ]
  },
  "module_spec_index": {
    "schema_version": "module_spec_index_v0",
    "ordered_page_ids": ["page_001", "page_002", "page_003", "page_004", "page_005", "page_006", "page_007", "page_008", "page_009", "page_010", "page_011"],
    "stable_page_identity_policy": "source order establishes page_001 through page_011; titleblock page count and number signals are non-authoritative",
    "index_status": "review_required"
  },
  "provenance_update": {
    "upstream_workflow": "whole_xml_page_split_v0",
    "source_fixture_ref": "whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "source_sha256": null,
    "source_page_xml_body_included": false,
    "annotation_variant_status": "not_requested",
    "canonical_source_status": "source XML remains the referenced canonical source; no replacement XML body is supplied"
  },
  "normalization_warnings": [
    {
      "code": "TITLEBLOCK_PAGE_COUNT_CONFLICT",
      "severity": "warning",
      "detail": "Reported titleblock count value 8 conflicts with 11 observed page nodes."
    },
    {
      "code": "TITLEBLOCK_PAGE_NUMBER_INCOMPLETE",
      "severity": "warning",
      "detail": "Only page-number values 1, 2, 5, 6, 7, and 8 were supplied; five page nodes have missing or ambiguous numbering."
    },
    {
      "code": "FULL_SOURCE_SHA256_UNAVAILABLE",
      "severity": "warning",
      "detail": "Only a source checksum prefix is available; required full source_sha256 fields remain null pending source-backed input."
    },
    {
      "code": "PAGE_SEMANTICS_UNAVAILABLE",
      "severity": "review_required",
      "detail": "No raw page XML, labels, role hints, connectivity evidence, or quantitative evidence is included; all semantic, interface, domain, and performance fields remain unconfirmed."
    },
    {
      "code": "NO_ANNOTATION_VARIANT",
      "severity": "info",
      "detail": "No explicit annotation-variant policy or derived review variant is supplied; normalized-page references remain null."
    }
  ],
  "downstream_handoff": {
    "downstream_workflow": "capture_xml_intake_library_v0",
    "handoff_role": "xml_first_asset_registration_preparation",
    "primary_inputs": {
      "page_module_spec_sidecars": "page_module_spec_sidecars",
      "module_spec_manifest": "module_spec_manifest"
    },
    "page_count": 11,
    "registration_keys_are_internal_metadata": true,
    "source_xml_handling": "Read source XML through the project binding when authorized; this packet does not contain raw XML or a canonical replacement body.",
    "readiness": {
      "ready_for_metadata_intake": true,
      "ready_for_semantic_or_connectivity_registration": false,
      "harness_ready": false
    },
    "stop_conditions": [
      "Stop semantic confirmation if source-backed page evidence is absent.",
      "Stop registration if the full source checksum cannot be reconciled where required.",
      "Do not infer connectivity, collect materials, attach MDD, compose a harness, or claim final library registration from this packet."
    ],
    "required_owner_or_source_followup": [
      "Supply source-backed page XML identity and full checksums.",
      "Supply page-level evidence before promoting any interface, electrical-domain, function, channelization, quantitative, or readiness claim."
    ]
  }
}
