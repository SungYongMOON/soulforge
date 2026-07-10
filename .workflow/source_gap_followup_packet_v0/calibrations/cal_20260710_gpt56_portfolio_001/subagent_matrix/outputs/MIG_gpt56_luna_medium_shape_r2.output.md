{
  "candidate_id": "MIG_gpt56_luna_medium_shape_r2",
  "workflow_id": "source_gap_followup_packet_v0",
  "profile": {
    "model": "gpt-5.6-luna",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup",
  "public_safe": true,
  "packets": {
    "source_gap_followup_packet": [
      {
        "id": "SGFP-001",
        "status": "blocked",
        "basis": [
          "official:G001",
          "quant:G009"
        ],
        "source_kind": "datasheet",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "gap_family": "blocked_access",
        "owner_action": "manual_download",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "owning_workflows": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "not_claimed": [
          "No datasheet was downloaded or verified.",
          "No quantitative or materials fields were confirmed."
        ]
      },
      {
        "id": "SGFP-002",
        "status": "missing_input",
        "basis": [
          "layout:L014"
        ],
        "source_kind": "layout_guide",
        "component_refdes": "U1",
        "component_identity": "FIXTURE-OPAMP-01",
        "gap_family": "missing_layout_guidance",
        "owner_action": "provide_file",
        "downstream_impact": [
          "layout"
        ],
        "owning_workflow": "component_pcb_layout_guide_extraction",
        "not_claimed": [
          "No layout guide was provided or inspected."
        ]
      },
      {
        "id": "SGFP-003",
        "status": "review_required",
        "basis": [
          "harness:H002"
        ],
        "source_kind": "interface_context",
        "interface_id": "IF_PWR",
        "gap_family": "missing_harness_context",
        "owner_action": "confirm_connection_role",
        "downstream_impact": [
          "harness"
        ],
        "owning_workflow": "xml_harness_composition_v0",
        "not_claimed": [
          "The connection role was not confirmed."
        ]
      },
      {
        "id": "SGFP-004",
        "status": "identity_ambiguous",
        "basis": [
          "materials:M006"
        ],
        "source_kind": "material_source",
        "component_refdes": "J1",
        "component_identity": "FIXTURE-CONN-02",
        "gap_family": "identity_ambiguity",
        "owner_action": "confirm_identity",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "owning_workflow": "exp_xml_component_materials",
        "not_claimed": [
          "Component identity was not resolved."
        ]
      }
    ],
    "gap_dedup_index": [
      {
        "id": "DEDUP-001",
        "status": "deduplicated_for_followup",
        "dedup_key": "U1|FIXTURE-OPAMP-01|datasheet|blocked_access|manual_download",
        "member_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "primary_followup_id": "SGFP-001",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "basis": "Same component identity, source kind, gap family, and owner action.",
        "not_claimed": [
          "Deduplication does not establish source availability or content validity."
        ]
      },
      {
        "id": "DEDUP-002",
        "status": "unique_followup",
        "dedup_key": "U1|FIXTURE-OPAMP-01|layout_guide|missing_layout_guidance|provide_file",
        "member_gap_refs": [
          "layout:L014"
        ],
        "primary_followup_id": "SGFP-002",
        "downstream_impact": [
          "layout"
        ],
        "basis": "No equivalent record exists in the fixture.",
        "not_claimed": []
      },
      {
        "id": "DEDUP-003",
        "status": "unique_followup",
        "dedup_key": "IF_PWR|interface_context|missing_harness_context|confirm_connection_role",
        "member_gap_refs": [
          "harness:H002"
        ],
        "primary_followup_id": "SGFP-003",
        "downstream_impact": [
          "harness"
        ],
        "basis": "Interface-scoped context gap.",
        "not_claimed": []
      },
      {
        "id": "DEDUP-004",
        "status": "unique_followup",
        "dedup_key": "J1|FIXTURE-CONN-02|material_source|identity_ambiguity|confirm_identity",
        "member_gap_refs": [
          "materials:M006"
        ],
        "primary_followup_id": "SGFP-004",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "basis": "Identity ambiguity requires an independent owner decision.",
        "not_claimed": []
      }
    ],
    "owner_action_queue": [
      {
        "id": "ACT-001",
        "status": "open",
        "priority": "high",
        "action": "manual_download",
        "target": "U1 / FIXTURE-OPAMP-01 datasheet",
        "source_gap_followup_id": "SGFP-001",
        "owner_workflows": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "basis": [
          "official:G001",
          "quant:G009"
        ],
        "not_claimed": [
          "No owner assignment or download completion is recorded."
        ]
      },
      {
        "id": "ACT-002",
        "status": "open",
        "priority": "medium",
        "action": "provide_file",
        "target": "U1 / FIXTURE-OPAMP-01 layout guide",
        "source_gap_followup_id": "SGFP-002",
        "owner_workflow": "component_pcb_layout_guide_extraction",
        "downstream_impact": [
          "layout"
        ],
        "basis": [
          "layout:L014"
        ],
        "not_claimed": [
          "No file receipt is recorded."
        ]
      },
      {
        "id": "ACT-003",
        "status": "open",
        "priority": "high",
        "action": "confirm_connection_role",
        "target": "IF_PWR",
        "source_gap_followup_id": "SGFP-003",
        "owner_workflow": "xml_harness_composition_v0",
        "downstream_impact": [
          "harness"
        ],
        "basis": [
          "harness:H002"
        ],
        "not_claimed": [
          "No connection-role decision is recorded."
        ]
      },
      {
        "id": "ACT-004",
        "status": "open",
        "priority": "high",
        "action": "confirm_identity",
        "target": "J1 / FIXTURE-CONN-02",
        "source_gap_followup_id": "SGFP-004",
        "owner_workflow": "exp_xml_component_materials",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "basis": [
          "materials:M006"
        ],
        "not_claimed": [
          "No identity confirmation is recorded."
        ]
      }
    ],
    "owner_source_batch_manifest_template": {
      "id": "MANIFEST-TEMPLATE-001",
      "status": "template_ready",
      "basis": "Synthetic fixture records after deduplication.",
      "fields": [
        "batch_id",
        "source_gap_followup_id",
        "upstream_gap_refs",
        "component_refdes",
        "component_identity",
        "interface_id",
        "source_kind",
        "requested_action",
        "owner_workflow_id",
        "expected_file_or_decision",
        "provenance_pointer",
        "receipt_status",
        "review_status",
        "downstream_impact",
        "not_claimed"
      ],
      "not_claimed": [
        "No real source location, owner identity, filename, or receipt exists in this packet."
      ]
    },
    "download_or_reuse_batch_manifest": [
      {
        "id": "BATCH-001",
        "status": "pending_owner_execution",
        "strategy": "download_or_reuse",
        "source_gap_followup_id": "SGFP-001",
        "upstream_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "target": "U1 / FIXTURE-OPAMP-01 datasheet",
        "owner_action": "manual_download",
        "reuse_check": "Check for an owner-provided authoritative source packet before downloading.",
        "required_receipt": [
          "source location or reuse pointer",
          "file identity",
          "provenance",
          "review outcome"
        ],
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "No download or reuse check was performed."
        ]
      },
      {
        "id": "BATCH-002",
        "status": "pending_owner_execution",
        "strategy": "provide_file",
        "source_gap_followup_id": "SGFP-002",
        "upstream_gap_refs": [
          "layout:L014"
        ],
        "target": "U1 / FIXTURE-OPAMP-01 layout guide",
        "owner_action": "provide_file",
        "required_receipt": [
          "provided file pointer",
          "file identity",
          "provenance",
          "review outcome"
        ],
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "No file was provided or inspected."
        ]
      }
    ],
    "retry_trigger_register": [
      {
        "id": "RETRY-001",
        "status": "armed_pending_evidence",
        "trigger": "Authoritative U1 datasheet is downloaded or reused and its provenance is recorded.",
        "relaunch_workflows": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0",
          "exp_xml_component_materials"
        ],
        "clears_followups": [
          "SGFP-001"
        ],
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "Trigger condition has not occurred."
        ]
      },
      {
        "id": "RETRY-002",
        "status": "armed_pending_evidence",
        "trigger": "U1 layout guide file is provided with a reviewable provenance pointer.",
        "relaunch_workflows": [
          "component_pcb_layout_guide_extraction"
        ],
        "clears_followups": [
          "SGFP-002"
        ],
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Trigger condition has not occurred."
        ]
      },
      {
        "id": "RETRY-003",
        "status": "armed_pending_owner_decision",
        "trigger": "Owner confirms the connection role for IF_PWR.",
        "relaunch_workflows": [
          "xml_harness_composition_v0"
        ],
        "clears_followups": [
          "SGFP-003"
        ],
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "Owner confirmation has not occurred."
        ]
      },
      {
        "id": "RETRY-004",
        "status": "armed_pending_owner_decision",
        "trigger": "Owner confirms the identity of J1 / FIXTURE-CONN-02.",
        "relaunch_workflows": [
          "exp_xml_component_materials"
        ],
        "clears_followups": [
          "SGFP-004"
        ],
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Identity confirmation has not occurred."
        ]
      }
    ],
    "downstream_unblock_map": [
      {
        "id": "UNBLOCK-001",
        "followup_id": "SGFP-001",
        "blocked_downstream": [
          "materials",
          "quantitative"
        ],
        "unblock_condition": "Authoritative datasheet source packet is available and provenance-reviewed.",
        "next_workflows": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "not_claimed": [
          "Downstream workflows are not unblocked."
        ]
      },
      {
        "id": "UNBLOCK-002",
        "followup_id": "SGFP-002",
        "blocked_downstream": [
          "layout"
        ],
        "unblock_condition": "Reviewable layout guide is provided.",
        "next_workflows": [
          "component_pcb_layout_guide_extraction"
        ],
        "not_claimed": [
          "Layout extraction is not unblocked."
        ]
      },
      {
        "id": "UNBLOCK-003",
        "followup_id": "SGFP-003",
        "blocked_downstream": [
          "harness"
        ],
        "unblock_condition": "IF_PWR connection role is confirmed by the owner.",
        "next_workflows": [
          "xml_harness_composition_v0"
        ],
        "not_claimed": [
          "Harness composition is not unblocked."
        ]
      },
      {
        "id": "UNBLOCK-004",
        "followup_id": "SGFP-004",
        "blocked_downstream": [
          "materials",
          "harness"
        ],
        "unblock_condition": "J1 component identity is confirmed by the owner.",
        "next_workflows": [
          "exp_xml_component_materials"
        ],
        "not_claimed": [
          "Materials and harness work are not unblocked."
        ]
      }
    ],
    "boundary_review_note": {
      "id": "BOUNDARY-001",
      "status": "review_required",
      "basis": "Contract-only synthetic fixture.",
      "read_only_upstream_preserved": true,
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
        "Upstream gap records were treated as read-only inputs.",
        "No repository, command, private material, or external source was accessed.",
        "Deduplication is a follow-up planning operation and does not alter upstream records.",
        "Owner actions, source acquisition, provenance review, execution, and approval remain pending."
      ],
      "not_claimed": [
        "No source truth was established.",
        "No workflow execution occurred.",
        "No approval or pass/fail decision was made."
      ]
    }
  },
  "downstream_handoff": {
    "status": "ready_for_owner_review",
    "handoff_id": "HANDOFF-001",
    "owner_actions": [
      "Execute or delegate ACT-001 through ACT-004.",
      "Record source or decision receipts using MANIFEST-TEMPLATE-001.",
      "Apply retry triggers only after their evidence conditions are met."
    ],
    "receiving_workflows": [
      "official_source_packet_collect_v0",
      "page_quantitative_enrichment_v0",
      "component_pcb_layout_guide_extraction",
      "xml_harness_composition_v0",
      "exp_xml_component_materials"
    ],
    "not_claimed": [
      "No handoff was transmitted.",
      "Receiving workflows have not accepted or processed these packets."
    ]
  },
  "boundary_review_note": {
    "status": "review_required",
    "summary": "Quality-ready synthetic follow-up packet; execution, source verification, owner approval, and downstream acceptance remain unclaimed.",
    "not_claimed": [
      "No repository or command access occurred.",
      "No real-world source truth or completion result was established."
    ]
  },
  "completion_state": {
    "quality_ready_packet": true,
    "execution_completed": false,
    "approval_obtained": false,
    "source_truth_established": false,
    "downstream_unblocked": false,
    "state": "quality_ready_pending_owner_execution_and_review"
  }
}
