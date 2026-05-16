{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_medium",
  "workflow_id": "source_gap_followup_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup",
  "public_safe": true,
  "packets": {
    "source_gap_followup_packet": [
      {
        "id": "sgfp-001",
        "status": "blocked_owner_input_required",
        "source_kind": "datasheet",
        "gap_family": "blocked_access",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "upstream_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "owning_workflow_ids": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "provenance_or_basis": "synthetic fixture upstream_gap_records only",
        "owner_action": "manual_download",
        "next_action": "Owner provides or manually downloads official datasheet source for U1 / FIXTURE-OPAMP-01.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "No source was fetched, inspected, approved, or verified as official."
      },
      {
        "id": "sgfp-002",
        "status": "blocked_owner_input_required",
        "source_kind": "layout_guide",
        "gap_family": "missing_layout_guidance",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "upstream_gap_refs": [
          "layout:L014"
        ],
        "owning_workflow_ids": [
          "component_pcb_layout_guide_extraction"
        ],
        "provenance_or_basis": "synthetic fixture upstream_gap_records only",
        "owner_action": "provide_file",
        "next_action": "Owner provides applicable layout guidance file for U1 / FIXTURE-OPAMP-01.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "No layout guide source was fetched, inspected, approved, or verified."
      },
      {
        "id": "sgfp-003",
        "status": "review_required",
        "source_kind": "interface_context",
        "gap_family": "missing_harness_context",
        "interface_id": "IF_PWR",
        "upstream_gap_refs": [
          "harness:H002"
        ],
        "owning_workflow_ids": [
          "xml_harness_composition_v0"
        ],
        "provenance_or_basis": "synthetic fixture upstream_gap_records only",
        "owner_action": "confirm_connection_role",
        "next_action": "Owner confirms connection role and harness context for IF_PWR.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": "No harness role or interface source truth was established."
      },
      {
        "id": "sgfp-004",
        "status": "review_required",
        "source_kind": "material_source",
        "gap_family": "identity_ambiguity",
        "component_refdes": "J1",
        "component_identity": "FIXTURE-CONN-02",
        "upstream_gap_refs": [
          "materials:M006"
        ],
        "owning_workflow_ids": [
          "exp_xml_component_materials"
        ],
        "provenance_or_basis": "synthetic fixture upstream_gap_records only",
        "owner_action": "confirm_identity",
        "next_action": "Owner confirms identity for J1 / FIXTURE-CONN-02 before material or harness reuse.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": "No component identity was resolved or approved."
      }
    ],
    "gap_dedup_index": [
      {
        "id": "gdi-001",
        "dedup_key": "component:U1|identity:FIXTURE-OPAMP-01|source_kind:datasheet|gap_family:blocked_access|owner_action:manual_download",
        "status": "deduplicated",
        "merged_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "basis": "same component_refdes, component_identity, source_kind, gap_family, and owner_action_hint",
        "owner_action": "manual_download",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "Deduplication is packet-level grouping only, not source validation."
      },
      {
        "id": "gdi-002",
        "dedup_key": "component:U1|identity:FIXTURE-OPAMP-01|source_kind:layout_guide|gap_family:missing_layout_guidance|owner_action:provide_file",
        "status": "unique",
        "merged_gap_refs": [
          "layout:L014"
        ],
        "basis": "single matching fixture record",
        "owner_action": "provide_file",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "No upstream record was modified."
      },
      {
        "id": "gdi-003",
        "dedup_key": "interface:IF_PWR|source_kind:interface_context|gap_family:missing_harness_context|owner_action:confirm_connection_role",
        "status": "unique",
        "merged_gap_refs": [
          "harness:H002"
        ],
        "basis": "single interface-scoped fixture record",
        "owner_action": "confirm_connection_role",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": "No interface role was confirmed."
      },
      {
        "id": "gdi-004",
        "dedup_key": "component:J1|identity:FIXTURE-CONN-02|source_kind:material_source|gap_family:identity_ambiguity|owner_action:confirm_identity",
        "status": "unique",
        "merged_gap_refs": [
          "materials:M006"
        ],
        "basis": "single component-scoped fixture record",
        "owner_action": "confirm_identity",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": "No identity ambiguity was resolved."
      }
    ],
    "owner_action_queue": [
      {
        "id": "oaq-001",
        "status": "open",
        "priority_basis": "blocks two downstream areas: materials and quantitative",
        "owner_action": "manual_download",
        "target": "U1 / FIXTURE-OPAMP-01 datasheet",
        "related_packet_ids": [
          "sgfp-001"
        ],
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "No download was performed."
      },
      {
        "id": "oaq-002",
        "status": "open",
        "priority_basis": "blocks layout downstream area",
        "owner_action": "provide_file",
        "target": "U1 / FIXTURE-OPAMP-01 layout guide",
        "related_packet_ids": [
          "sgfp-002"
        ],
        "related_gap_refs": [
          "layout:L014"
        ],
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "No file was provided or inspected."
      },
      {
        "id": "oaq-003",
        "status": "open_review_required",
        "priority_basis": "blocks harness composition context",
        "owner_action": "confirm_connection_role",
        "target": "IF_PWR",
        "related_packet_ids": [
          "sgfp-003"
        ],
        "related_gap_refs": [
          "harness:H002"
        ],
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": "No role confirmation was made."
      },
      {
        "id": "oaq-004",
        "status": "open_review_required",
        "priority_basis": "blocks materials and harness reuse",
        "owner_action": "confirm_identity",
        "target": "J1 / FIXTURE-CONN-02",
        "related_packet_ids": [
          "sgfp-004"
        ],
        "related_gap_refs": [
          "materials:M006"
        ],
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": "No identity confirmation was made."
      }
    ],
    "owner_source_batch_manifest_template": [
      {
        "id": "osbmt-001",
        "status": "template_pending_owner_fill",
        "batch_key": "manual_source_batch_U1_FIXTURE-OPAMP-01",
        "requested_source_kind": "datasheet",
        "requested_target": "U1 / FIXTURE-OPAMP-01",
        "owner_action": "manual_download",
        "fields_required_from_owner": [
          "source_file_path_or_public_url",
          "source_title",
          "source_publisher_or_vendor",
          "retrieval_date",
          "reuse_allowed_for_materials",
          "reuse_allowed_for_quantitative"
        ],
        "basis": "deduplicated blocked_access datasheet gaps official:G001 and quant:G009",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "Template is not a source manifest and contains no verified source truth."
      },
      {
        "id": "osbmt-002",
        "status": "template_pending_owner_fill",
        "batch_key": "provided_layout_batch_U1_FIXTURE-OPAMP-01",
        "requested_source_kind": "layout_guide",
        "requested_target": "U1 / FIXTURE-OPAMP-01",
        "owner_action": "provide_file",
        "fields_required_from_owner": [
          "source_file_path_or_public_url",
          "source_title",
          "source_publisher_or_vendor",
          "retrieval_or_provided_date",
          "applicability_note",
          "reuse_allowed_for_layout"
        ],
        "basis": "layout guide gap layout:L014",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "Template is not a source manifest and contains no verified layout guidance."
      }
    ],
    "download_or_reuse_batch_manifest": [
      {
        "id": "dor-001",
        "status": "owner_input_required_before_retry",
        "batch_key": "manual_source_batch_U1_FIXTURE-OPAMP-01",
        "mode": "download_or_reuse",
        "owner_action": "manual_download",
        "reuse_check_targets": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "required_evidence": [
          "owner-provided file path or reusable public URL",
          "confirmation that source applies to U1 / FIXTURE-OPAMP-01"
        ],
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "No reuse inventory was searched and no download was attempted."
      },
      {
        "id": "dor-002",
        "status": "owner_input_required_before_retry",
        "batch_key": "provided_layout_batch_U1_FIXTURE-OPAMP-01",
        "mode": "provide_or_reuse",
        "owner_action": "provide_file",
        "reuse_check_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "required_evidence": [
          "owner-provided file path or reusable public URL",
          "confirmation that guide applies to U1 / FIXTURE-OPAMP-01"
        ],
        "related_gap_refs": [
          "layout:L014"
        ],
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "No reuse inventory was searched and no provided file was inspected."
      }
    ],
    "retry_trigger_register": [
      {
        "id": "rtr-001",
        "status": "armed_pending_owner_source",
        "trigger_condition": "U1 / FIXTURE-OPAMP-01 datasheet file or reusable URL is provided with applicability confirmation",
        "retry_targets": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "owner_action": "manual_download",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": "Retry was not executed."
      },
      {
        "id": "rtr-002",
        "status": "armed_pending_owner_source",
        "trigger_condition": "U1 / FIXTURE-OPAMP-01 layout guide file or reusable URL is provided with applicability confirmation",
        "retry_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "related_gap_refs": [
          "layout:L014"
        ],
        "owner_action": "provide_file",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": "Retry was not executed."
      },
      {
        "id": "rtr-003",
        "status": "armed_pending_owner_confirmation",
        "trigger_condition": "Owner confirms IF_PWR connection role and harness context",
        "retry_targets": [
          "xml_harness_composition_v0"
        ],
        "related_gap_refs": [
          "harness:H002"
        ],
        "owner_action": "confirm_connection_role",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": "Retry was not executed and interface role was not validated."
      },
      {
        "id": "rtr-004",
        "status": "armed_pending_owner_confirmation",
        "trigger_condition": "Owner confirms J1 / FIXTURE-CONN-02 identity",
        "retry_targets": [
          "exp_xml_component_materials"
        ],
        "related_gap_refs": [
          "materials:M006"
        ],
        "owner_action": "confirm_identity",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": "Retry was not executed and component identity was not validated."
      }
    ],
    "downstream_unblock_map": [
      {
        "id": "dum-001",
        "status": "blocked",
        "downstream_area": "materials",
        "blocking_packet_ids": [
          "sgfp-001",
          "sgfp-004"
        ],
        "required_owner_actions": [
          "manual_download",
          "confirm_identity"
        ],
        "handoff_targets": [
          "official_source_packet_collect_v0",
          "exp_xml_component_materials"
        ],
        "basis": "fixture downstream_impact entries for materials",
        "not_claimed": "Materials workflow is not unblocked by this packet."
      },
      {
        "id": "dum-002",
        "status": "blocked",
        "downstream_area": "quantitative",
        "blocking_packet_ids": [
          "sgfp-001"
        ],
        "required_owner_actions": [
          "manual_download"
        ],
        "handoff_targets": [
          "page_quantitative_enrichment_v0"
        ],
        "basis": "fixture downstream_impact entries for quantitative",
        "not_claimed": "Quantitative workflow is not unblocked by this packet."
      },
      {
        "id": "dum-003",
        "status": "blocked",
        "downstream_area": "layout",
        "blocking_packet_ids": [
          "sgfp-002"
        ],
        "required_owner_actions": [
          "provide_file"
        ],
        "handoff_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "basis": "fixture downstream_impact entries for layout",
        "not_claimed": "Layout workflow is not unblocked by this packet."
      },
      {
        "id": "dum-004",
        "status": "blocked",
        "downstream_area": "harness",
        "blocking_packet_ids": [
          "sgfp-003",
          "sgfp-004"
        ],
        "required_owner_actions": [
          "confirm_connection_role",
          "confirm_identity"
        ],
        "handoff_targets": [
          "xml_harness_composition_v0",
          "exp_xml_component_materials"
        ],
        "basis": "fixture downstream_impact entries for harness",
        "not_claimed": "Harness workflow is not unblocked by this packet."
      }
    ],
    "boundary_review_note": [
      {
        "id": "brn-001",
        "status": "boundary_preserved",
        "basis": "contract_only_synthetic fixture and workflow contract summary",
        "read_only_upstream_boundaries": [
          "upstream_gap_records",
          "owning_workflow_id",
          "source_mode",
          "project_scope_key"
        ],
        "owned_outputs_only": [
          "source_gap_followup_packet",
          "gap_dedup_index",
          "owner_action_queue",
          "owner_source_batch_manifest_template",
          "download_or_reuse_batch_manifest",
          "retry_trigger_register",
          "downstream_unblock_map",
          "boundary_review_note"
        ],
        "not_claimed": "No repository files, commands, private material, raw sources, approvals, executions, or source truth were used or claimed."
      }
    ]
  },
  "downstream_handoff": [
    {
      "id": "dh-001",
      "status": "pending_owner_input",
      "target_workflow_id": "official_source_packet_collect_v0",
      "handoff_basis": "datasheet blocked_access gap official:G001 grouped with U1 source acquisition need",
      "required_before_handoff": "Owner supplies applicable datasheet file or reusable URL.",
      "downstream_impact": [
        "materials"
      ],
      "not_claimed": "No handoff was executed."
    },
    {
      "id": "dh-002",
      "status": "pending_owner_input",
      "target_workflow_id": "page_quantitative_enrichment_v0",
      "handoff_basis": "quantitative datasheet blocked_access gap quant:G009 grouped with U1 source acquisition need",
      "required_before_handoff": "Owner supplies applicable datasheet file or reusable URL.",
      "downstream_impact": [
        "quantitative"
      ],
      "not_claimed": "No handoff was executed."
    },
    {
      "id": "dh-003",
      "status": "pending_owner_input",
      "target_workflow_id": "component_pcb_layout_guide_extraction",
      "handoff_basis": "layout guide gap layout:L014",
      "required_before_handoff": "Owner provides applicable layout guide file or reusable URL.",
      "downstream_impact": [
        "layout"
      ],
      "not_claimed": "No handoff was executed."
    },
    {
      "id": "dh-004",
      "status": "pending_owner_confirmation",
      "target_workflow_id": "xml_harness_composition_v0",
      "handoff_basis": "missing harness context gap harness:H002 for IF_PWR",
      "required_before_handoff": "Owner confirms IF_PWR connection role.",
      "downstream_impact": [
        "harness"
      ],
      "not_claimed": "No handoff was executed."
    },
    {
      "id": "dh-005",
      "status": "pending_owner_confirmation",
      "target_workflow_id": "exp_xml_component_materials",
      "handoff_basis": "identity ambiguity gap materials:M006 for J1 / FIXTURE-CONN-02",
      "required_before_handoff": "Owner confirms component identity.",
      "downstream_impact": [
        "materials",
        "harness"
      ],
      "not_claimed": "No handoff was executed."
    }
  ],
  "boundary_review_note": {
    "status": "public_safe_contract_only",
    "fixture_source_mode": "contract_only_synthetic",
    "provenance_summary": "All packet content was derived only from the provided workflow contract summary and synthetic public fixture JSON.",
    "boundary_notes": [
      "Repository files were not read.",
      "Commands were not run.",
      "Private, raw, and secret material were not used.",
      "Upstream gap records were treated as read-only.",
      "Outputs are packet preparation artifacts only."
    ],
    "not_claimed": "This response does not claim execution, approval, source truth, source retrieval, validation, or pass/fail result."
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "required_outputs_present": true,
    "execution_claim": false,
    "approval_claim": false,
    "source_truth_claim": false,
    "pass_fail_claim": false,
    "public_safe": true,
    "remaining_blockers": [
      "owner manual datasheet download or reusable source path for U1 / FIXTURE-OPAMP-01",
      "owner layout guide file or reusable source path for U1 / FIXTURE-OPAMP-01",
      "owner IF_PWR connection role confirmation",
      "owner J1 / FIXTURE-CONN-02 identity confirmation"
    ],
    "not_claimed": "Completion means the requested machine-readable follow-up packet is complete for the synthetic fixture, not that downstream workflows are unblocked or executed."
  }
}