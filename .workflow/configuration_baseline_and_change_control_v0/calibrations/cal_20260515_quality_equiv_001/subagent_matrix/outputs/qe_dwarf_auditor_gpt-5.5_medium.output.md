{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_medium",
  "workflow_id": "configuration_baseline_and_change_control_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta",
  "public_safe": true,
  "packets": {
    "configuration_baseline_packet": [
      {
        "packet_id": "CBP-001",
        "status": "quality_ready_packet_only",
        "project_scope_key": "public_baseline_fixture",
        "source_mode": "contract_only_synthetic",
        "basis": "synthetic fixture baseline_refs and change_requests only",
        "included_outputs": [
          "baseline_inventory",
          "change_request_register",
          "impact_matrix",
          "baseline_gap_register",
          "rerun_routing",
          "owner_followup_needed",
          "closure_handoff",
          "boundary_review_note"
        ],
        "owner_action": "review baseline gaps, decide approvals, provide missing evidence where required",
        "downstream_impact": "supports routing and review preparation without asserting source truth or approval",
        "not_claimed": "no repository inspection, command execution, source validation, approval, or pass/fail result claimed"
      }
    ],
    "baseline_inventory": [
      {
        "inventory_id": "BI-BL-REQ-001",
        "baseline_id": "BL-REQ-001",
        "artifact_ref": "requirements_packet_summary",
        "version": "v0.3",
        "approval_state": "reference_only",
        "checksum_state": "present_public_prefix_only",
        "status": "available_as_public_reference_summary",
        "provenance": "fixture.baseline_refs",
        "owner_action": "confirm whether reference-only baseline may be used for downstream comparison",
        "downstream_impact": "affected by CR-001 measurement tolerance update",
        "not_claimed": "checksum completeness and source artifact content not verified"
      },
      {
        "inventory_id": "BI-BL-PAGE-007",
        "baseline_id": "BL-PAGE-007",
        "artifact_ref": "page_module_spec_summary",
        "version": "v0.2",
        "approval_state": "draft",
        "checksum_state": "missing",
        "status": "gap_present",
        "provenance": "fixture.baseline_refs",
        "owner_action": "provide checksum or confirm draft handling rule before controlled baseline use",
        "downstream_impact": "affected by CR-002 page identity refresh and requires review before closure",
        "not_claimed": "draft artifact is not treated as approved baseline"
      },
      {
        "inventory_id": "BI-BL-HARNESS-002",
        "baseline_id": "BL-HARNESS-002",
        "artifact_ref": "harness_trace_delta_summary",
        "version": "v0.1",
        "approval_state": "review_required",
        "checksum_state": "present_public_prefix_only",
        "status": "review_required",
        "provenance": "fixture.baseline_refs",
        "owner_action": "complete review and provide pending interface direction evidence",
        "downstream_impact": "affected by CR-003 and blocks closure until owner direction is available",
        "not_claimed": "review outcome and interface direction not inferred"
      }
    ],
    "change_request_register": [
      {
        "register_id": "CRR-CR-001",
        "change_id": "CR-001",
        "change_type": "measurement_tolerance_update",
        "affected_refs": [
          "BL-REQ-001"
        ],
        "source": "review_action_item_closure_loop_v0",
        "evidence_ref": "owner_decision_ref:OD-17-summary",
        "approval_state": "not_approved_here",
        "status": "review_ready_not_approved",
        "provenance": "fixture.change_requests",
        "owner_action": "approve, reject, or request revision outside this packet",
        "downstream_impact": "may require requirement baseline update and rerun of affected checks",
        "not_claimed": "owner decision content and approval validity not validated"
      },
      {
        "register_id": "CRR-CR-002",
        "change_id": "CR-002",
        "change_type": "page_identity_refresh",
        "affected_refs": [
          "BL-PAGE-007"
        ],
        "source": "page_module_trace_matrix_v0",
        "evidence_ref": "trace_delta_ref:TD-04-summary",
        "approval_state": "not_approved_here",
        "status": "review_ready_not_approved",
        "provenance": "fixture.change_requests",
        "owner_action": "resolve draft baseline and approve or reject page identity change",
        "downstream_impact": "may require page-module trace rerun after identity baseline is controlled",
        "not_claimed": "trace delta source content not inspected"
      },
      {
        "register_id": "CRR-CR-003",
        "change_id": "CR-003",
        "change_type": "interface_direction_pending",
        "affected_refs": [
          "BL-HARNESS-002"
        ],
        "source": "interface_control_and_harness_readiness_v0",
        "evidence_ref": null,
        "approval_state": "owner_waiting",
        "status": "blocked_missing_evidence",
        "provenance": "fixture.change_requests",
        "owner_action": "provide interface direction evidence or defer request",
        "downstream_impact": "blocks harness readiness closure and rerun routing",
        "not_claimed": "no interface decision or readiness state asserted"
      }
    ],
    "impact_matrix": [
      {
        "impact_id": "IM-CR-001-BL-REQ-001",
        "change_id": "CR-001",
        "baseline_id": "BL-REQ-001",
        "impact_type": "measurement_tolerance_baseline_delta",
        "status": "review_required",
        "basis": "CR-001 affected_refs includes BL-REQ-001",
        "owner_action": "confirm tolerance change approval and required verification scope",
        "downstream_impact": "requirements packet comparison and affected measurement checks may need rerun",
        "not_claimed": "no technical tolerance value or verification result provided"
      },
      {
        "impact_id": "IM-CR-002-BL-PAGE-007",
        "change_id": "CR-002",
        "baseline_id": "BL-PAGE-007",
        "impact_type": "page_identity_baseline_delta",
        "status": "blocked_by_draft_and_missing_checksum",
        "basis": "CR-002 affected_refs includes BL-PAGE-007; baseline checksum missing and approval_state draft",
        "owner_action": "stabilize baseline identity and checksum before closure",
        "downstream_impact": "page trace matrix rerun may be required after owner approval",
        "not_claimed": "page identity correctness not assessed"
      },
      {
        "impact_id": "IM-CR-003-BL-HARNESS-002",
        "change_id": "CR-003",
        "baseline_id": "BL-HARNESS-002",
        "impact_type": "interface_direction_dependency",
        "status": "blocked_by_missing_evidence_and_owner_waiting",
        "basis": "CR-003 evidence_ref is null and approval_state owner_waiting",
        "owner_action": "supply interface direction decision and evidence reference",
        "downstream_impact": "harness readiness and interface-control rerun cannot close from this packet",
        "not_claimed": "interface direction not determined"
      }
    ],
    "baseline_gap_register": [
      {
        "gap_id": "BGR-001",
        "baseline_id": "BL-PAGE-007",
        "gap_type": "missing_checksum",
        "status": "blocker_for_controlled_baseline_closure",
        "basis": "checksum_state is missing",
        "owner_action": "provide checksum or public-safe checksum prefix according to owner policy",
        "downstream_impact": "prevents strong baseline identity claim for CR-002",
        "not_claimed": "no checksum reconstructed or inferred"
      },
      {
        "gap_id": "BGR-002",
        "baseline_id": "BL-PAGE-007",
        "gap_type": "draft_approval_state",
        "status": "review_required",
        "basis": "approval_state is draft",
        "owner_action": "approve, reject, or explicitly retain as draft",
        "downstream_impact": "closure handoff must remain review-required",
        "not_claimed": "draft accepted as controlled baseline"
      },
      {
        "gap_id": "BGR-003",
        "baseline_id": "BL-HARNESS-002",
        "gap_type": "pending_review_and_missing_change_evidence",
        "status": "blocker",
        "basis": "baseline approval_state review_required and CR-003 evidence_ref null",
        "owner_action": "complete review and attach evidence reference",
        "downstream_impact": "blocks harness change closure and rerun finalization",
        "not_claimed": "review completion or evidence existence not claimed"
      }
    ],
    "rerun_routing": [
      {
        "routing_id": "RR-CR-001",
        "change_id": "CR-001",
        "recommended_route": "review_action_item_closure_loop_v0",
        "status": "owner_review_then_possible_rerun",
        "basis": "change source and affected requirements baseline",
        "owner_action": "decide approval and define measurement verification scope",
        "downstream_impact": "route can prepare rerun after approval decision",
        "not_claimed": "rerun not executed"
      },
      {
        "routing_id": "RR-CR-002",
        "change_id": "CR-002",
        "recommended_route": "page_module_trace_matrix_v0",
        "status": "blocked_until_baseline_identity_resolved",
        "basis": "source workflow plus BL-PAGE-007 draft and missing checksum",
        "owner_action": "resolve baseline checksum and approval state before rerun",
        "downstream_impact": "trace matrix rerun remains pending",
        "not_claimed": "trace rerun not executed"
      },
      {
        "routing_id": "RR-CR-003",
        "change_id": "CR-003",
        "recommended_route": "interface_control_and_harness_readiness_v0",
        "status": "blocked_owner_waiting",
        "basis": "source workflow plus missing evidence and owner_waiting state",
        "owner_action": "provide interface direction evidence",
        "downstream_impact": "readiness rerun cannot be meaningfully routed to closure",
        "not_claimed": "harness readiness not approved or failed"
      }
    ],
    "owner_followup_needed": [
      {
        "followup_id": "OFN-001",
        "priority": "high",
        "subject": "BL-HARNESS-002 interface direction",
        "status": "owner_waiting",
        "basis": "CR-003 evidence_ref null and approval_state owner_waiting",
        "owner_action": "provide decision evidence or explicitly defer CR-003",
        "downstream_impact": "blocks harness readiness closure",
        "not_claimed": "no substitute evidence created"
      },
      {
        "followup_id": "OFN-002",
        "priority": "high",
        "subject": "BL-PAGE-007 checksum and draft state",
        "status": "review_required",
        "basis": "checksum_state missing and approval_state draft",
        "owner_action": "provide checksum and approval disposition",
        "downstream_impact": "blocks controlled page identity refresh closure",
        "not_claimed": "no artifact integrity claim made"
      },
      {
        "followup_id": "OFN-003",
        "priority": "medium",
        "subject": "CR-001 approval disposition",
        "status": "review_required",
        "basis": "approval_state not_approved_here",
        "owner_action": "approve, reject, or request revision for measurement tolerance update",
        "downstream_impact": "determines whether requirements rerun is needed",
        "not_claimed": "approval not granted by this packet"
      }
    ],
    "closure_handoff": [
      {
        "handoff_id": "CH-001",
        "recipient": "owner_review",
        "status": "open_review_required",
        "basis": "all change requests are not approved here, owner waiting, or blocked by baseline gaps",
        "owner_action": "resolve approval states and missing evidence before closure",
        "downstream_impact": "downstream workflows may use this as a public-safe review packet, not as closure proof",
        "not_claimed": "closure, execution, approval, and source-truth validation not claimed"
      },
      {
        "handoff_id": "CH-002",
        "recipient": "downstream_rerun_planning",
        "status": "conditional_ready",
        "basis": "rerun routes identified from synthetic source fields",
        "owner_action": "activate reruns only after owner approval and evidence completion",
        "downstream_impact": "supports planning for requirements, page trace, and harness readiness reruns",
        "not_claimed": "no rerun started or completed"
      }
    ],
    "boundary_review_note": [
      {
        "note_id": "BRN-001",
        "status": "public_safe_boundary_preserved",
        "basis": "used only workflow contract summary and synthetic fixture",
        "owner_action": "review whether packet is sufficient for calibration scoring",
        "downstream_impact": "safe to hand off as synthetic public calibration output",
        "not_claimed": "repository files, private metadata, raw evidence, secrets, command output, source truth, approval, and pass/fail results not accessed or claimed"
      }
    ]
  },
  "downstream_handoff": {
    "status": "conditional_review_packet_ready",
    "handoff_targets": [
      "owner_review",
      "downstream_rerun_planning",
      "calibration_scoring"
    ],
    "basis": "all required outputs populated from synthetic fixture only",
    "next_action": "owner resolves blockers, missing evidence, and approval dispositions before any closure or rerun execution",
    "not_claimed": "handoff is not an execution result, approval, source-truth finding, or pass/fail certification"
  },
  "boundary_review_note": {
    "status": "boundary_preserved",
    "public_safe": true,
    "source_mode": "contract_only_synthetic",
    "materials_used": [
      "workflow contract summary",
      "synthetic public fixture JSON"
    ],
    "materials_not_used": [
      "repository files",
      "commands",
      "private metadata",
      "raw evidence",
      "secret material",
      "external sources"
    ],
    "not_claimed": "no execution, approval, source validation, or pass/fail result claimed"
  },
  "completion_state": {
    "packet_completion": "quality_ready_for_calibration_review",
    "execution_state": "not_executed",
    "approval_state": "not_approved_here",
    "source_truth_state": "not_claimed",
    "pass_fail_state": "not_claimed",
    "blockers_remaining": [
      "BL-PAGE-007 missing checksum",
      "BL-PAGE-007 draft approval state",
      "CR-003 missing evidence_ref",
      "BL-HARNESS-002 review_required",
      "all change approvals remain outside this packet"
    ]
  }
}