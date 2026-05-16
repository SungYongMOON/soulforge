{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_xhigh",
  "workflow_id": "source_gap_followup_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
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
        "gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "dedup_group_id": "dedup-u1-datasheet-blocked-access",
        "source_kind": "datasheet",
        "gap_family": "blocked_access",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "owning_workflow_ids": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "provenance": {
          "basis": "synthetic_fixture_only",
          "source_mode": "contract_only_synthetic"
        },
        "owner_action": "manual_download",
        "next_action": "Owner manually provides or confirms reusable datasheet source for U1 FIXTURE-OPAMP-01, then routes it back to the owning workflows.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "no download performed",
          "no source truth verified",
          "no approval granted"
        ]
      },
      {
        "id": "sgfp-002",
        "status": "blocked_owner_input_required",
        "gap_refs": [
          "layout:L014"
        ],
        "dedup_group_id": "dedup-u1-layout-guide-missing-layout-guidance",
        "source_kind": "layout_guide",
        "gap_family": "missing_layout_guidance",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "owning_workflow_ids": [
          "component_pcb_layout_guide_extraction"
        ],
        "provenance": {
          "basis": "synthetic_fixture_only",
          "source_mode": "contract_only_synthetic"
        },
        "owner_action": "provide_file",
        "next_action": "Owner provides the layout guide file for U1 FIXTURE-OPAMP-01.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "no file received",
          "no layout guidance validated",
          "no approval granted"
        ]
      },
      {
        "id": "sgfp-003",
        "status": "review_required_owner_confirmation",
        "gap_refs": [
          "harness:H002"
        ],
        "dedup_group_id": "dedup-if-pwr-interface-context",
        "source_kind": "interface_context",
        "gap_family": "missing_harness_context",
        "interface_id": "IF_PWR",
        "owning_workflow_ids": [
          "xml_harness_composition_v0"
        ],
        "provenance": {
          "basis": "synthetic_fixture_only",
          "source_mode": "contract_only_synthetic"
        },
        "owner_action": "confirm_connection_role",
        "next_action": "Owner confirms connection role and intended harness context for IF_PWR.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "no interface role inferred",
          "no harness composition approved",
          "no source truth verified"
        ]
      },
      {
        "id": "sgfp-004",
        "status": "review_required_owner_confirmation",
        "gap_refs": [
          "materials:M006"
        ],
        "dedup_group_id": "dedup-j1-material-identity-ambiguity",
        "source_kind": "material_source",
        "gap_family": "identity_ambiguity",
        "component_refdes": "J1",
        "component_identity": "FIXTURE-CONN-02",
        "owning_workflow_ids": [
          "exp_xml_component_materials"
        ],
        "provenance": {
          "basis": "synthetic_fixture_only",
          "source_mode": "contract_only_synthetic"
        },
        "owner_action": "confirm_identity",
        "next_action": "Owner confirms the material-source identity for J1 FIXTURE-CONN-02 before reuse or extraction.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "no identity resolved",
          "no material source approved",
          "no source truth verified"
        ]
      }
    ],
    "gap_dedup_index": [
      {
        "id": "dedup-u1-datasheet-blocked-access",
        "status": "deduplicated_consolidated_owner_action",
        "input_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "dedup_basis": "same component_refdes, component_identity, source_kind, gap_family, and owner_action_hint",
        "retained_impacts": [
          "materials",
          "quantitative"
        ],
        "retained_owning_workflow_ids": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "owner_action": "manual_download",
        "not_claimed": [
          "deduplication is packet organization only",
          "does not verify source equivalence"
        ]
      },
      {
        "id": "dedup-u1-layout-guide-missing-layout-guidance",
        "status": "unique_gap",
        "input_gap_refs": [
          "layout:L014"
        ],
        "dedup_basis": "single matching layout guide gap in fixture",
        "retained_impacts": [
          "layout"
        ],
        "owner_action": "provide_file",
        "not_claimed": [
          "no layout source verified"
        ]
      },
      {
        "id": "dedup-if-pwr-interface-context",
        "status": "unique_gap",
        "input_gap_refs": [
          "harness:H002"
        ],
        "dedup_basis": "single matching interface context gap in fixture",
        "retained_impacts": [
          "harness"
        ],
        "owner_action": "confirm_connection_role",
        "not_claimed": [
          "no interface semantics inferred"
        ]
      },
      {
        "id": "dedup-j1-material-identity-ambiguity",
        "status": "unique_gap",
        "input_gap_refs": [
          "materials:M006"
        ],
        "dedup_basis": "single matching material source identity gap in fixture",
        "retained_impacts": [
          "materials",
          "harness"
        ],
        "owner_action": "confirm_identity",
        "not_claimed": [
          "no component identity resolved"
        ]
      }
    ],
    "owner_action_queue": [
      {
        "id": "owner-action-001",
        "status": "pending_owner",
        "priority_basis": "blocks two downstream impact families and two owning workflows",
        "action": "manual_download",
        "target": {
          "component_refdes": "U1",
          "component_identity": "FIXTURE-OPAMP-01",
          "source_kind": "datasheet"
        },
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "next_action": "Owner supplies datasheet or confirms already-approved reusable source path outside this packet.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "no download executed",
          "no source path approved"
        ]
      },
      {
        "id": "owner-action-002",
        "status": "pending_owner",
        "priority_basis": "blocks layout extraction",
        "action": "provide_file",
        "target": {
          "component_refdes": "U1",
          "component_identity": "FIXTURE-OPAMP-01",
          "source_kind": "layout_guide"
        },
        "related_gap_refs": [
          "layout:L014"
        ],
        "next_action": "Owner provides layout guide file.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "no file received",
          "no layout content reviewed"
        ]
      },
      {
        "id": "owner-action-003",
        "status": "pending_owner",
        "priority_basis": "blocks harness role decision",
        "action": "confirm_connection_role",
        "target": {
          "interface_id": "IF_PWR",
          "source_kind": "interface_context"
        },
        "related_gap_refs": [
          "harness:H002"
        ],
        "next_action": "Owner confirms IF_PWR connection role.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "no role inferred",
          "no harness decision made"
        ]
      },
      {
        "id": "owner-action-004",
        "status": "pending_owner",
        "priority_basis": "blocks material and harness reuse decisions",
        "action": "confirm_identity",
        "target": {
          "component_refdes": "J1",
          "component_identity": "FIXTURE-CONN-02",
          "source_kind": "material_source"
        },
        "related_gap_refs": [
          "materials:M006"
        ],
        "next_action": "Owner confirms J1 material-source identity.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "no identity resolved",
          "no source reuse authorized"
        ]
      }
    ],
    "owner_source_batch_manifest_template": [
      {
        "id": "owner-source-template-001",
        "status": "owner_fill_required",
        "batch_group_id": "batch-u1-datasheet",
        "requested_source_kind": "datasheet",
        "target_component_refdes": "U1",
        "target_component_identity": "FIXTURE-OPAMP-01",
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "owner_fill_fields": [
          "source_file_or_location",
          "source_origin",
          "reuse_allowed",
          "owner_confirmation",
          "date_provided"
        ],
        "downstream_handoff_targets": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "not_claimed": [
          "template only",
          "no source attached"
        ]
      },
      {
        "id": "owner-source-template-002",
        "status": "owner_fill_required",
        "batch_group_id": "batch-u1-layout-guide",
        "requested_source_kind": "layout_guide",
        "target_component_refdes": "U1",
        "target_component_identity": "FIXTURE-OPAMP-01",
        "related_gap_refs": [
          "layout:L014"
        ],
        "owner_fill_fields": [
          "source_file_or_location",
          "source_origin",
          "reuse_allowed",
          "owner_confirmation",
          "date_provided"
        ],
        "downstream_handoff_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "not_claimed": [
          "template only",
          "no source attached"
        ]
      },
      {
        "id": "owner-source-template-003",
        "status": "owner_fill_required",
        "batch_group_id": "batch-j1-material-source",
        "requested_source_kind": "material_source",
        "target_component_refdes": "J1",
        "target_component_identity": "FIXTURE-CONN-02",
        "related_gap_refs": [
          "materials:M006"
        ],
        "owner_fill_fields": [
          "confirmed_component_identity",
          "source_file_or_location",
          "source_origin",
          "reuse_allowed",
          "owner_confirmation",
          "date_provided"
        ],
        "downstream_handoff_targets": [
          "exp_xml_component_materials"
        ],
        "not_claimed": [
          "template only",
          "identity not confirmed"
        ]
      }
    ],
    "download_or_reuse_batch_manifest": [
      {
        "id": "download-reuse-001",
        "status": "pending_owner_decision",
        "batch_group_id": "batch-u1-datasheet",
        "decision_needed": "download_or_reuse",
        "basis": "manual_download requested for blocked datasheet access",
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "owner_action": "manual_download_or_confirm_reuse",
        "next_action": "Owner chooses whether to provide newly downloaded datasheet or approved reusable source.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "no reuse eligibility determined",
          "no download performed"
        ]
      },
      {
        "id": "download-reuse-002",
        "status": "pending_owner_file",
        "batch_group_id": "batch-u1-layout-guide",
        "decision_needed": "provide_file_or_confirm_reuse",
        "basis": "layout guide missing from upstream fixture record",
        "related_gap_refs": [
          "layout:L014"
        ],
        "owner_action": "provide_file",
        "next_action": "Owner provides the layout guide file or identifies an approved reusable file.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "no file checked",
          "no reuse eligibility determined"
        ]
      },
      {
        "id": "download-reuse-003",
        "status": "pending_identity_confirmation",
        "batch_group_id": "batch-j1-material-source",
        "decision_needed": "identity_confirmation_before_reuse",
        "basis": "material source identity ambiguity for J1",
        "related_gap_refs": [
          "materials:M006"
        ],
        "owner_action": "confirm_identity",
        "next_action": "Owner confirms identity before any material source reuse or extraction.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "no identity resolved",
          "no reuse eligibility determined"
        ]
      }
    ],
    "retry_trigger_register": [
      {
        "id": "retry-trigger-001",
        "status": "armed_waiting_owner_input",
        "trigger_condition": "U1 datasheet source is provided or approved for reuse",
        "related_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "retry_targets": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "expected_unblock": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "trigger not fired",
          "retry not executed"
        ]
      },
      {
        "id": "retry-trigger-002",
        "status": "armed_waiting_owner_input",
        "trigger_condition": "U1 layout guide file is provided or approved for reuse",
        "related_gap_refs": [
          "layout:L014"
        ],
        "retry_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "expected_unblock": [
          "layout"
        ],
        "not_claimed": [
          "trigger not fired",
          "retry not executed"
        ]
      },
      {
        "id": "retry-trigger-003",
        "status": "armed_waiting_owner_confirmation",
        "trigger_condition": "IF_PWR connection role is confirmed by owner",
        "related_gap_refs": [
          "harness:H002"
        ],
        "retry_targets": [
          "xml_harness_composition_v0"
        ],
        "expected_unblock": [
          "harness"
        ],
        "not_claimed": [
          "trigger not fired",
          "retry not executed"
        ]
      },
      {
        "id": "retry-trigger-004",
        "status": "armed_waiting_owner_confirmation",
        "trigger_condition": "J1 FIXTURE-CONN-02 identity is confirmed by owner",
        "related_gap_refs": [
          "materials:M006"
        ],
        "retry_targets": [
          "exp_xml_component_materials"
        ],
        "expected_unblock": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "trigger not fired",
          "retry not executed"
        ]
      }
    ],
    "downstream_unblock_map": [
      {
        "id": "unblock-001",
        "status": "blocked_until_owner_source",
        "downstream_area": "materials",
        "blocking_gap_refs": [
          "official:G001",
          "materials:M006"
        ],
        "required_owner_actions": [
          "manual_download_or_confirm_reuse_for_U1_datasheet",
          "confirm_identity_for_J1_material_source"
        ],
        "handoff_targets": [
          "official_source_packet_collect_v0",
          "exp_xml_component_materials"
        ],
        "not_claimed": [
          "materials not unblocked",
          "source truth not verified"
        ]
      },
      {
        "id": "unblock-002",
        "status": "blocked_until_owner_source",
        "downstream_area": "quantitative",
        "blocking_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "required_owner_actions": [
          "manual_download_or_confirm_reuse_for_U1_datasheet"
        ],
        "handoff_targets": [
          "page_quantitative_enrichment_v0"
        ],
        "not_claimed": [
          "quantitative extraction not unblocked",
          "source truth not verified"
        ]
      },
      {
        "id": "unblock-003",
        "status": "blocked_until_owner_file",
        "downstream_area": "layout",
        "blocking_gap_refs": [
          "layout:L014"
        ],
        "required_owner_actions": [
          "provide_U1_layout_guide"
        ],
        "handoff_targets": [
          "component_pcb_layout_guide_extraction"
        ],
        "not_claimed": [
          "layout extraction not unblocked",
          "file not reviewed"
        ]
      },
      {
        "id": "unblock-004",
        "status": "blocked_until_owner_confirmation",
        "downstream_area": "harness",
        "blocking_gap_refs": [
          "harness:H002",
          "materials:M006"
        ],
        "required_owner_actions": [
          "confirm_IF_PWR_connection_role",
          "confirm_J1_material_source_identity"
        ],
        "handoff_targets": [
          "xml_harness_composition_v0",
          "exp_xml_component_materials"
        ],
        "not_claimed": [
          "harness composition not unblocked",
          "role and identity not verified"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary-note-001",
        "status": "boundary_review_required",
        "basis": "contract summary and synthetic public fixture only",
        "read_only_upstream_boundaries": [
          "upstream_gap_records",
          "owning_workflow_id values",
          "source_kind values",
          "downstream_impact values"
        ],
        "owned_outputs": [
          "source_gap_followup_packet",
          "gap_dedup_index",
          "owner_action_queue",
          "owner_source_batch_manifest_template",
          "download_or_reuse_batch_manifest",
          "retry_trigger_register",
          "downstream_unblock_map",
          "boundary_review_note"
        ],
        "boundary_notes": [
          "No repository files were read.",
          "No commands were run.",
          "No private, raw, or secret material was used.",
          "This packet does not approve sources, execute retries, or verify source truth."
        ],
        "not_claimed": [
          "execution",
          "approval",
          "source truth",
          "pass/fail result"
        ]
      }
    ]
  },
  "downstream_handoff": {
    "status": "handoff_packet_ready_review_required",
    "handoff_basis": "synthetic fixture gap records organized into owner actions, retry triggers, and unblock map",
    "handoff_targets": [
      {
        "workflow_id": "official_source_packet_collect_v0",
        "handoff_items": [
          "sgfp-001",
          "owner-source-template-001",
          "retry-trigger-001"
        ],
        "blocked_until": "owner provides or approves U1 datasheet source"
      },
      {
        "workflow_id": "page_quantitative_enrichment_v0",
        "handoff_items": [
          "sgfp-001",
          "owner-source-template-001",
          "retry-trigger-001"
        ],
        "blocked_until": "owner provides or approves U1 datasheet source"
      },
      {
        "workflow_id": "component_pcb_layout_guide_extraction",
        "handoff_items": [
          "sgfp-002",
          "owner-source-template-002",
          "retry-trigger-002"
        ],
        "blocked_until": "owner provides or approves U1 layout guide"
      },
      {
        "workflow_id": "xml_harness_composition_v0",
        "handoff_items": [
          "sgfp-003",
          "retry-trigger-003",
          "unblock-004"
        ],
        "blocked_until": "owner confirms IF_PWR connection role"
      },
      {
        "workflow_id": "exp_xml_component_materials",
        "handoff_items": [
          "sgfp-004",
          "owner-source-template-003",
          "retry-trigger-004"
        ],
        "blocked_until": "owner confirms J1 material-source identity"
      }
    ],
    "not_claimed": [
      "handoff not delivered to external workflow",
      "no downstream retry executed",
      "no downstream approval granted"
    ]
  },
  "boundary_review_note": {
    "status": "public_safe_contract_only",
    "basis": "Provided workflow contract summary and synthetic public fixture JSON only.",
    "constraints_observed": [
      "repository not read",
      "commands not run",
      "private raw and secret material not used",
      "read-only upstream records preserved",
      "only required output packet types produced"
    ],
    "review_required_states": [
      "owner must provide or approve missing sources",
      "owner must confirm IF_PWR role",
      "owner must confirm J1 identity",
      "downstream workflows must review supplied sources before retry"
    ],
    "not_claimed": [
      "execution",
      "approval",
      "source truth",
      "pass/fail result",
      "repository state"
    ]
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "packet_completion": true,
    "execution_performed": false,
    "approval_claimed": false,
    "source_truth_claimed": false,
    "pass_fail_claimed": false,
    "public_safe": true,
    "basis": "Packet completed from synthetic fixture and contract summary only; completion means required JSON outputs were assembled, not that any source, workflow, or downstream state was verified."
  }
}