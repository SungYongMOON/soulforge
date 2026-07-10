{
  "candidate_id": "MIG_gpt56_sol_low_shape_r2",
  "workflow_id": "source_gap_followup_packet_v0",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup",
  "public_safe": true,
  "packets": {
    "source_gap_followup_packet": [
      {
        "stable_id": "SGF-001",
        "status": "blocked_owner_action_required",
        "gap_family": "blocked_access",
        "source_kind": "datasheet",
        "subject": {
          "component_refdes": "U1",
          "component_identity": "FIXTURE-OPAMP-01"
        },
        "upstream_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "owning_workflow_ids": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "provenance": {
          "mode": "contract_only_synthetic",
          "basis": "Two upstream records share component identity, source kind, gap family, and owner action."
        },
        "owner_action": "Manually download the official datasheet once and provide its file reference for controlled reuse.",
        "next_action": "Record the supplied artifact in the batch manifest and trigger both owning workflows.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "Artifact availability",
          "Official-source authenticity",
          "Successful download",
          "Downstream execution"
        ]
      },
      {
        "stable_id": "SGF-002",
        "status": "missing_input_owner_action_required",
        "gap_family": "missing_layout_guidance",
        "source_kind": "layout_guide",
        "subject": {
          "component_refdes": "U1",
          "component_identity": "FIXTURE-OPAMP-01"
        },
        "upstream_gap_refs": [
          "layout:L014"
        ],
        "owning_workflow_ids": [
          "component_pcb_layout_guide_extraction"
        ],
        "provenance": {
          "mode": "contract_only_synthetic",
          "basis": "Single upstream layout-guidance gap record."
        },
        "owner_action": "Provide the applicable layout-guide file or an owner-approved source reference.",
        "next_action": "Register the supplied input and retry layout-guide extraction.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Applicability of any future file",
          "Layout recommendation truth",
          "Downstream execution"
        ]
      },
      {
        "stable_id": "SGF-003",
        "status": "review_required",
        "gap_family": "missing_harness_context",
        "source_kind": "interface_context",
        "subject": {
          "interface_id": "IF_PWR"
        },
        "upstream_gap_refs": [
          "harness:H002"
        ],
        "owning_workflow_ids": [
          "xml_harness_composition_v0"
        ],
        "provenance": {
          "mode": "contract_only_synthetic",
          "basis": "Single upstream interface-context gap record."
        },
        "owner_action": "Confirm the connection role and intended harness context for IF_PWR.",
        "next_action": "Record the owner-confirmed role and retry harness composition.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "Connection role",
          "Electrical correctness",
          "Harness approval",
          "Downstream execution"
        ]
      },
      {
        "stable_id": "SGF-004",
        "status": "review_required",
        "gap_family": "identity_ambiguity",
        "source_kind": "material_source",
        "subject": {
          "component_refdes": "J1",
          "component_identity": "FIXTURE-CONN-02"
        },
        "upstream_gap_refs": [
          "materials:M006"
        ],
        "owning_workflow_ids": [
          "exp_xml_component_materials"
        ],
        "provenance": {
          "mode": "contract_only_synthetic",
          "basis": "Single upstream material-source identity ambiguity."
        },
        "owner_action": "Confirm the exact J1 component identity and applicable material source.",
        "next_action": "Bind the confirmed identity to the source record and retry materials processing.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Component identity",
          "Material-source applicability",
          "Harness compatibility",
          "Downstream execution"
        ]
      }
    ],
    "gap_dedup_index": [
      {
        "stable_id": "GDI-001",
        "status": "deduplicated",
        "canonical_followup_id": "SGF-001",
        "member_upstream_gap_refs": [
          "official:G001",
          "quant:G009"
        ],
        "dedup_basis": [
          "component_identity=FIXTURE-OPAMP-01",
          "component_refdes=U1",
          "source_kind=datasheet",
          "gap_family=blocked_access",
          "owner_action_hint=manual_download"
        ],
        "owner_action": "Acquire one official datasheet artifact and register reuse for both member gaps.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "The two workflows require identical page-level evidence",
          "A supplied artifact will satisfy both workflows"
        ]
      },
      {
        "stable_id": "GDI-002",
        "status": "unique",
        "canonical_followup_id": "SGF-002",
        "member_upstream_gap_refs": [
          "layout:L014"
        ],
        "dedup_basis": [
          "No equivalent layout-guide record exists in the fixture."
        ],
        "owner_action": "Provide the applicable layout-guide input.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Datasheet and layout guide are interchangeable"
        ]
      },
      {
        "stable_id": "GDI-003",
        "status": "unique",
        "canonical_followup_id": "SGF-003",
        "member_upstream_gap_refs": [
          "harness:H002"
        ],
        "dedup_basis": [
          "No equivalent IF_PWR interface-context record exists in the fixture."
        ],
        "owner_action": "Confirm the IF_PWR connection role.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "Interface context can be inferred from component-source gaps"
        ]
      },
      {
        "stable_id": "GDI-004",
        "status": "unique",
        "canonical_followup_id": "SGF-004",
        "member_upstream_gap_refs": [
          "materials:M006"
        ],
        "dedup_basis": [
          "No equivalent J1 identity-ambiguity record exists in the fixture."
        ],
        "owner_action": "Confirm the J1 identity.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Connector identity can be inferred from its fixture label"
        ]
      }
    ],
    "owner_action_queue": [
      {
        "stable_id": "OAQ-001",
        "status": "open",
        "priority_basis": "One acquisition may unblock two owning workflows and two downstream domains.",
        "followup_ids": [
          "SGF-001"
        ],
        "owner_action": "Manually download and provide the official FIXTURE-OPAMP-01 datasheet.",
        "required_input": "File reference plus source URL or equivalent provenance summary.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "Owner completion",
          "Source authenticity"
        ]
      },
      {
        "stable_id": "OAQ-002",
        "status": "open",
        "priority_basis": "Required layout input is absent.",
        "followup_ids": [
          "SGF-002"
        ],
        "owner_action": "Provide the applicable FIXTURE-OPAMP-01 layout guide.",
        "required_input": "File reference and applicability confirmation.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Guide existence",
          "Guide applicability"
        ]
      },
      {
        "stable_id": "OAQ-003",
        "status": "open_review_required",
        "priority_basis": "Harness composition requires an owner-confirmed interface role.",
        "followup_ids": [
          "SGF-003"
        ],
        "owner_action": "Confirm the connection role for IF_PWR.",
        "required_input": "Explicit role and intended connection context.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "Electrical role",
          "Connection correctness"
        ]
      },
      {
        "stable_id": "OAQ-004",
        "status": "open_review_required",
        "priority_basis": "Identity ambiguity affects both materials and harness work.",
        "followup_ids": [
          "SGF-004"
        ],
        "owner_action": "Confirm the exact identity of J1 and its applicable material source.",
        "required_input": "Approved identity plus source reference.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Exact identity",
          "Source applicability"
        ]
      }
    ],
    "owner_source_batch_manifest_template": [
      {
        "stable_id": "OSBMT-001",
        "status": "awaiting_owner_input",
        "batch_item_type": "source_acquisition",
        "followup_ids": [
          "SGF-001"
        ],
        "requested_subject": "FIXTURE-OPAMP-01 official datasheet",
        "required_owner_fields": [
          "artifact_reference",
          "source_url_or_origin",
          "retrieval_date",
          "official_source_confirmation",
          "reuse_authorization"
        ],
        "provenance_basis": "Synthetic upstream records official:G001 and quant:G009.",
        "owner_action": "Populate required fields after acquisition.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "Artifact acquired",
          "Artifact validated"
        ]
      },
      {
        "stable_id": "OSBMT-002",
        "status": "awaiting_owner_input",
        "batch_item_type": "source_provision",
        "followup_ids": [
          "SGF-002"
        ],
        "requested_subject": "FIXTURE-OPAMP-01 applicable layout guide",
        "required_owner_fields": [
          "artifact_reference",
          "source_url_or_origin",
          "applicability_confirmation",
          "revision_or_date",
          "reuse_authorization"
        ],
        "provenance_basis": "Synthetic upstream record layout:L014.",
        "owner_action": "Populate required fields when providing the guide.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Artifact exists",
          "Artifact applies"
        ]
      },
      {
        "stable_id": "OSBMT-003",
        "status": "awaiting_owner_input",
        "batch_item_type": "identity_source_confirmation",
        "followup_ids": [
          "SGF-004"
        ],
        "requested_subject": "J1 exact identity and material source",
        "required_owner_fields": [
          "confirmed_component_identity",
          "source_reference",
          "confirmation_date",
          "applicability_confirmation"
        ],
        "provenance_basis": "Synthetic upstream record materials:M006.",
        "owner_action": "Populate identity and source fields after review.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Identity confirmed",
          "Material source validated"
        ]
      }
    ],
    "download_or_reuse_batch_manifest": [
      {
        "stable_id": "DRBM-001",
        "status": "download_pending",
        "artifact_key": "ART-FIXTURE-OPAMP-01-DATASHEET",
        "mode": "download_once_then_reuse_candidate",
        "followup_ids": [
          "SGF-001"
        ],
        "target_workflow_ids": [
          "official_source_packet_collect_v0",
          "page_quantitative_enrichment_v0"
        ],
        "provenance_basis": "Deduplicated blocked-access records for the same component and source kind.",
        "owner_action": "Provide the official artifact and provenance fields.",
        "next_action": "Verify workflow-specific applicability before dispatching retry triggers.",
        "downstream_impact": [
          "materials",
          "quantitative"
        ],
        "not_claimed": [
          "Download completed",
          "Reuse approved",
          "Workflow-specific sufficiency"
        ]
      },
      {
        "stable_id": "DRBM-002",
        "status": "provision_pending",
        "artifact_key": "ART-FIXTURE-OPAMP-01-LAYOUT-GUIDE",
        "mode": "owner_provided",
        "followup_ids": [
          "SGF-002"
        ],
        "target_workflow_ids": [
          "component_pcb_layout_guide_extraction"
        ],
        "provenance_basis": "Missing layout-guidance record.",
        "owner_action": "Provide the guide and confirm applicability.",
        "next_action": "Register the artifact and dispatch a retry only after boundary review.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Artifact provided",
          "Applicability confirmed"
        ]
      }
    ],
    "retry_trigger_register": [
      {
        "stable_id": "RTR-001",
        "status": "not_ready",
        "trigger_for": "official_source_packet_collect_v0",
        "followup_ids": [
          "SGF-001"
        ],
        "readiness_conditions": [
          "Official datasheet artifact reference recorded",
          "Source provenance recorded",
          "Workflow-specific applicability reviewed"
        ],
        "provenance_basis": "Upstream gap official:G001.",
        "owner_action": "Satisfy the acquisition and provenance conditions.",
        "next_action": "Hand off a retry request to the owning workflow.",
        "downstream_impact": [
          "materials"
        ],
        "not_claimed": [
          "Retry executed",
          "Gap resolved"
        ]
      },
      {
        "stable_id": "RTR-002",
        "status": "not_ready",
        "trigger_for": "page_quantitative_enrichment_v0",
        "followup_ids": [
          "SGF-001"
        ],
        "readiness_conditions": [
          "Datasheet artifact reference recorded",
          "Relevant quantitative content applicability reviewed"
        ],
        "provenance_basis": "Upstream gap quant:G009.",
        "owner_action": "Provide the artifact needed for applicability review.",
        "next_action": "Hand off a retry request to the owning workflow.",
        "downstream_impact": [
          "quantitative"
        ],
        "not_claimed": [
          "Quantitative evidence present",
          "Retry executed",
          "Gap resolved"
        ]
      },
      {
        "stable_id": "RTR-003",
        "status": "not_ready",
        "trigger_for": "component_pcb_layout_guide_extraction",
        "followup_ids": [
          "SGF-002"
        ],
        "readiness_conditions": [
          "Layout-guide artifact reference recorded",
          "Applicability confirmed"
        ],
        "provenance_basis": "Upstream gap layout:L014.",
        "owner_action": "Provide and confirm the applicable guide.",
        "next_action": "Hand off a retry request to the owning workflow.",
        "downstream_impact": [
          "layout"
        ],
        "not_claimed": [
          "Retry executed",
          "Layout guidance extracted"
        ]
      },
      {
        "stable_id": "RTR-004",
        "status": "not_ready",
        "trigger_for": "xml_harness_composition_v0",
        "followup_ids": [
          "SGF-003"
        ],
        "readiness_conditions": [
          "IF_PWR connection role explicitly confirmed",
          "Harness context recorded"
        ],
        "provenance_basis": "Upstream gap harness:H002.",
        "owner_action": "Confirm the interface role and context.",
        "next_action": "Hand off a retry request to the owning workflow.",
        "downstream_impact": [
          "harness"
        ],
        "not_claimed": [
          "Role confirmed",
          "Retry executed",
          "Harness validated"
        ]
      },
      {
        "stable_id": "RTR-005",
        "status": "not_ready",
        "trigger_for": "exp_xml_component_materials",
        "followup_ids": [
          "SGF-004"
        ],
        "readiness_conditions": [
          "J1 identity confirmed",
          "Applicable material source recorded"
        ],
        "provenance_basis": "Upstream gap materials:M006.",
        "owner_action": "Confirm identity and source.",
        "next_action": "Hand off a retry request to the owning workflow.",
        "downstream_impact": [
          "materials",
          "harness"
        ],
        "not_claimed": [
          "Identity resolved",
          "Retry executed",
          "Materials validated"
        ]
      }
    ],
    "downstream_unblock_map": [
      {
        "stable_id": "DUM-001",
        "status": "blocked",
        "downstream_domain": "materials",
        "blocking_followup_ids": [
          "SGF-001",
          "SGF-004"
        ],
        "basis": [
          "official:G001",
          "materials:M006"
        ],
        "owner_action": "Provide the U1 datasheet and confirm J1 identity and source.",
        "next_action": "Dispatch workflow-specific retries after both inputs pass boundary review.",
        "not_claimed": [
          "Materials domain fully unblocked",
          "Inputs are sufficient"
        ]
      },
      {
        "stable_id": "DUM-002",
        "status": "blocked",
        "downstream_domain": "quantitative",
        "blocking_followup_ids": [
          "SGF-001"
        ],
        "basis": [
          "quant:G009"
        ],
        "owner_action": "Provide the U1 datasheet.",
        "next_action": "Review quantitative applicability and dispatch the enrichment retry.",
        "not_claimed": [
          "Quantitative domain unblocked",
          "Required values exist in the artifact"
        ]
      },
      {
        "stable_id": "DUM-003",
        "status": "blocked",
        "downstream_domain": "layout",
        "blocking_followup_ids": [
          "SGF-002"
        ],
        "basis": [
          "layout:L014"
        ],
        "owner_action": "Provide an applicable layout guide.",
        "next_action": "Dispatch layout-guide extraction after applicability confirmation.",
        "not_claimed": [
          "Layout domain unblocked",
          "Guide applicability"
        ]
      },
      {
        "stable_id": "DUM-004",
        "status": "blocked",
        "downstream_domain": "harness",
        "blocking_followup_ids": [
          "SGF-003",
          "SGF-004"
        ],
        "basis": [
          "harness:H002",
          "materials:M006"
        ],
        "owner_action": "Confirm IF_PWR connection context and J1 identity.",
        "next_action": "Dispatch the respective owning-workflow retries after confirmations are recorded.",
        "not_claimed": [
          "Harness domain fully unblocked",
          "Electrical or mechanical compatibility"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "stable_id": "BRN-001",
        "status": "review_required",
        "provenance": {
          "mode": "contract_only_synthetic",
          "fixture_id": "source_gap_followup_packet_v0_public_synthetic_mixed_gap_dedup"
        },
        "read_only_upstream_preserved": true,
        "owned_outputs_limited_to_required_outputs": true,
        "owner_action": "Review deduplication, supply missing inputs, and authorize only workflow-specific downstream handoffs.",
        "downstream_impact": [
          "materials",
          "quantitative",
          "layout",
          "harness"
        ],
        "not_claimed": [
          "Repository inspection",
          "Command execution",
          "Private-source access",
          "Artifact acquisition",
          "Source truth",
          "Owner approval",
          "Workflow execution",
          "Pass or fail result"
        ]
      }
    ]
  },
  "downstream_handoff": {
    "status": "prepared_not_dispatched",
    "handoff_targets": [
      {
        "workflow_id": "official_source_packet_collect_v0",
        "retry_trigger_id": "RTR-001"
      },
      {
        "workflow_id": "page_quantitative_enrichment_v0",
        "retry_trigger_id": "RTR-002"
      },
      {
        "workflow_id": "component_pcb_layout_guide_extraction",
        "retry_trigger_id": "RTR-003"
      },
      {
        "workflow_id": "xml_harness_composition_v0",
        "retry_trigger_id": "RTR-004"
      },
      {
        "workflow_id": "exp_xml_component_materials",
        "retry_trigger_id": "RTR-005"
      }
    ],
    "basis": "Synthetic upstream ownership fields and explicit retry readiness conditions.",
    "owner_action": "Complete and review the corresponding owner actions before dispatch.",
    "not_claimed": [
      "Handoff dispatched",
      "Target workflow accepted the handoff",
      "Any downstream gap resolved"
    ]
  },
  "boundary_review_note": {
    "stable_id": "BRN-001",
    "status": "review_required",
    "public_safe": true,
    "source_mode": "contract_only_synthetic",
    "upstream_records_modified": false,
    "boundary_summary": "The packet organizes synthetic gaps, deduplicates the two U1 datasheet acquisition requests, and prepares conditional handoffs without asserting source truth or execution.",
    "not_claimed": [
      "Repository inspection",
      "Command execution",
      "Private or raw material access",
      "Approval",
      "Source validation",
      "Execution success",
      "Pass or fail"
    ]
  },
  "completion_state": {
    "packet_quality_state": "quality_ready_for_owner_review",
    "required_outputs_present": true,
    "execution_state": "not_executed",
    "approval_state": "not_approved",
    "source_truth_state": "not_established",
    "downstream_handoff_state": "prepared_not_dispatched",
    "open_blockers": [
      "Official FIXTURE-OPAMP-01 datasheet not provided",
      "Applicable FIXTURE-OPAMP-01 layout guide not provided",
      "IF_PWR connection role not confirmed",
      "J1 exact identity and material source not confirmed"
    ],
    "not_claimed": [
      "Workflow pass",
      "Workflow fail",
      "Blocker resolution",
      "Owner acceptance"
    ]
  }
}
