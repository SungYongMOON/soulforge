{
  "page_module_spec_sidecars": [
    {
      "schema_version": "page_module_spec_v0",
      "identity": {
        "registration_key": "sample_exp_capture_big_xml__page_001",
        "source_system_id": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
        "source_page_id": "page_001",
        "source_page_order": 1,
        "source_page_ref": "synthetic://whole_xml_source/sample_exp_capture_big_xml/page_001",
        "source_sha256": null,
        "source_sha256_prefix": "74195c6c62bdcf3f",
        "normalized_page_ref": null,
        "normalized_sha256": null
      },
      "module_definition": {
        "module_scope": {
          "completeness": "unknown",
          "status": "review_required"
        },
        "electrical_domains": {
          "values": [],
          "status": "unknown",
          "claim_policy": "review_hint"
        },
        "channelization": {
          "appears_channelized": null,
          "channel_count_hint": null,
          "channel_range_hint": null,
          "repeated_block_kind": null,
          "repeated_block_label_hint": null,
          "evidence_refs": [],
          "status": "unknown"
        },
        "classification_basis": {
          "page_label": null,
          "visible_part_names": [],
          "connector_like_labels": [],
          "visible_regulator_identity": null,
          "other_visible_evidence": [],
          "status": "review_required"
        }
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
        "circuit_type_hint": null,
        "quantitative_values": [],
        "status": "unknown",
        "review_required": true
      },
      "system_contract": {
        "electrical_domains": [],
        "power_contract": {
          "values": {},
          "status": "missing_source_evidence"
        },
        "signal_contract": {
          "values": {},
          "status": "missing_source_evidence"
        },
        "readiness_contract": {
          "harness_ready": false,
          "status": "not_source_backed"
        }
      },
      "composition": {
        "external_harness_interfaces": [],
        "materials": [],
        "mdd_attachment": null,
        "status": "not_performed"
      },
      "evidence_review": {
        "source_evidence_refs": [
          "synthetic://whole_xml_source/sample_exp_capture_big_xml/page_001"
        ],
        "review_required": true,
        "confirmed_claims": [],
        "inferred_claims": [],
        "source_gaps": [
          "page_semantics_not_supplied",
          "connectivity_not_inferred",
          "quantitative_values_not_supplied"
        ],
        "owner_followup": "source_owner_review_required"
      },
      "annotation_variant": {
        "enabled": false,
        "ref": null,
        "sha256": null,
        "authority": "review_only"
      }
    }
  ],
  "module_spec_manifest": {
    "schema_version": "page_module_spec_v0",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "page_count": 11,
    "entries": [
      {
        "registration_key": "sample_exp_capture_big_xml__page_001",
        "source_page_id": "page_001",
        "source_page_order": 1,
        "source_page_ref": "synthetic://whole_xml_source/sample_exp_capture_big_xml/page_001",
        "source_sha256": null,
        "page_module_spec_ref": "project-local://page_module_specs/page_001/page_module_spec_v0.yaml",
        "page_module_spec_sha256": null,
        "optional_annotation_variant_ref": null,
        "optional_annotation_variant_sha256": null,
        "role_hints": [],
        "primary_domain": null,
        "harness_readiness_basis": "not_source_backed",
        "source_gap_present": true,
        "normalization_status": "sidecar_prepared_review_required",
        "review_required": true
      }
    ],
    "identity_policy": {
      "page_order_preserved": true,
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
      "registration_key_policy": "source_binding_identity plus stable source page id",
      "raw_xml_body_included": false,
      "final_library_registration_claim": false
    }
  },
  "module_spec_index": {
    "schema_version": "page_module_spec_v0",
    "entries": [
      {
        "source_page_id": "page_001",
        "source_page_order": 1,
        "registration_key": "sample_exp_capture_big_xml__page_001",
        "page_module_spec_ref": "project-local://page_module_specs/page_001/page_module_spec_v0.yaml",
        "status": "review_required"
      }
    ],
    "ordering": "source_page_order_ascending",
    "raw_xml_body_included": false
  },
  "provenance_update": {
    "workflow_id": "page_xml_normalize_spec_v0",
    "upstream_workflow": "whole_xml_page_split_v0",
    "downstream_workflow": "capture_xml_intake_library_v0",
    "source_fixture_ref": "whole_xml_page_split_v0/calibrations/20260514-171147_staged_cli_real_sample_structural/input_fixture.public.json",
    "source_binding_identity": "project_binding.whole_xml_source.sample_exp_capture_big_xml",
    "source_sha256_prefix": "74195c6c62bdcf3f",
    "page_count": 11,
    "stable_page_id_policy": "derive page_001 through page_011 from source order",
    "source_page_xml_mutated": false,
    "raw_xml_body_copied": false,
    "generated_canonical_xml": false,
    "final_library_asset_registered": false
  },
  "normalization_warnings": [
    {
      "code": "TITLEBLOCK_PAGE_COUNT_CONFLICT",
      "severity": "warning",
      "scope": "global",
      "message": "Reported titleblock count value 8 conflicts with 11 observed page nodes.",
      "action": "Use stable source-order page identities."
    },
    {
      "code": "PAGE_NUMBER_SIGNAL_INCOMPLETE",
      "severity": "warning",
      "scope": "global",
      "message": "Page-number signals are missing or ambiguous for 5 page nodes and are non-contiguous.",
      "action": "Do not use titleblock page numbers as complete identity."
    },
    {
      "code": "SEMANTIC_EVIDENCE_MISSING",
      "severity": "review_required",
      "scope": "all_pages",
      "message": "Page semantics, connectivity, interfaces, quantitative values, and harness boundaries are not supplied.",
      "action": "Keep semantic and quantitative fields unknown or blank."
    },
    {
      "code": "CHECKSUM_INCOMPLETE",
      "severity": "review_required",
      "scope": "all_pages",
      "message": "Only a public-safe source checksum prefix is available.",
      "action": "Do not synthesize a full SHA-256 value."
    },
    {
      "code": "ANNOTATED_VARIANTS_DISABLED",
      "severity": "info",
      "scope": "global",
      "message": "No explicit annotation-variant policy was supplied.",
      "action": "Emit sidecars as the complete primary output."
    }
  ],
  "downstream_handoff": {
    "workflow_id": "capture_xml_intake_library_v0",
    "handoff_role": "xml_first_asset_registration_preparation",
    "ready_for_downstream_preparation": true,
    "inputs": {
      "page_module_spec_sidecars": "module_spec_manifest.entries[].page_module_spec_ref",
      "module_spec_manifest": "project-local://manifests/module_spec_manifest.yaml"
    },
    "source_xml_policy": {
      "source_xml_remains_immutable": true,
      "downstream_may_read_source_xml_through_project_binding": true,
      "normalized_xml_replacement_claim": false
    },
    "readiness": {
      "harness_ready": false,
      "final_library_registration": false,
      "materials_collection": false,
      "mdd_attachment_or_pairing": false,
      "harness_composition": false
    },
    "required_followup": [
      "source_owner_review_of_page_semantics",
      "source_backed_interface_and_connectivity_review",
      "source_backed_quantitative_contract_completion",
      "full_checksum_resolution_if_required_by_downstream_registration"
    ]
  }
}
