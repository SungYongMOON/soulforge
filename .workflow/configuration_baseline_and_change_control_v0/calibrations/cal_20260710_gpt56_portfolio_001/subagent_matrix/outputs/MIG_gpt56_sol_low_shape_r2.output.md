{
  "candidate_id": "MIG_gpt56_sol_low_shape_r2",
  "workflow_id": "configuration_baseline_and_change_control_v0",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta",
  "public_safe": true,
  "packets": {
    "configuration_baseline_packet": [
      {
        "packet_id": "CBP-public_baseline_fixture-001",
        "project_scope_key": "public_baseline_fixture",
        "status": "review_required",
        "basis": {
          "source_mode": "contract_only_synthetic",
          "baseline_count": 3,
          "change_request_count": 3
        },
        "provenance_summary": [
          "requirements_packet_summary",
          "page_module_spec_summary",
          "harness_trace_delta_summary",
          "review_action_item_closure_loop_v0",
          "page_module_trace_matrix_v0",
          "interface_control_and_harness_readiness_v0"
        ],
        "owner_action": "Resolve approval, checksum, and missing-evidence gaps before establishing or changing any controlled baseline.",
        "next_action": "Review BL-REQ-001, BL-PAGE-007, and BL-HARNESS-002 with CR-001 through CR-003.",
        "downstream_impact": "No downstream consumer should treat the proposed deltas as an approved or executed baseline.",
        "not_claimed": [
          "baseline establishment",
          "change execution",
          "approval",
          "source truth",
          "checksum verification"
        ]
      }
    ],
    "baseline_inventory": [
      {
        "inventory_id": "BI-BL-REQ-001",
        "baseline_id": "BL-REQ-001",
        "artifact_ref": "requirements_packet_summary",
        "version": "v0.3",
        "checksum_state": "present_public_prefix_only",
        "approval_state": "reference_only",
        "status": "reference_only_review_required",
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "fixture_field": "baseline_refs"
        },
        "owner_action": "Provide controlled checksum evidence and explicit baseline approval disposition.",
        "next_action": "Evaluate CR-001 against the controlled requirements baseline.",
        "downstream_impact": "Measurement-tolerance consumers must retain the current controlled state until approval.",
        "not_claimed": [
          "full checksum availability",
          "checksum validation",
          "approved baseline status"
        ]
      },
      {
        "inventory_id": "BI-BL-PAGE-007",
        "baseline_id": "BL-PAGE-007",
        "artifact_ref": "page_module_spec_summary",
        "version": "v0.2",
        "checksum_state": "missing",
        "approval_state": "draft",
        "status": "blocked_missing_checksum_and_approval",
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "fixture_field": "baseline_refs"
        },
        "owner_action": "Supply the checksum and approve or reject the draft baseline.",
        "next_action": "Hold CR-002 baseline incorporation pending checksum and disposition.",
        "downstream_impact": "Page identity refresh cannot be represented as a controlled baseline change.",
        "not_claimed": [
          "artifact integrity",
          "approved baseline status",
          "change incorporation"
        ]
      },
      {
        "inventory_id": "BI-BL-HARNESS-002",
        "baseline_id": "BL-HARNESS-002",
        "artifact_ref": "harness_trace_delta_summary",
        "version": "v0.1",
        "checksum_state": "present_public_prefix_only",
        "approval_state": "review_required",
        "status": "blocked_pending_review",
        "provenance": {
          "source_mode": "contract_only_synthetic",
          "fixture_field": "baseline_refs"
        },
        "owner_action": "Complete baseline review and provide the missing CR-003 evidence reference.",
        "next_action": "Resolve interface direction before baseline disposition.",
        "downstream_impact": "Harness and interface-dependent activities remain review-gated.",
        "not_claimed": [
          "full checksum availability",
          "checksum validation",
          "approved interface direction",
          "approved baseline status"
        ]
      }
    ],
    "change_request_register": [
      {
        "register_id": "CRR-CR-001",
        "change_id": "CR-001",
        "affected_refs": [
          "BL-REQ-001"
        ],
        "change_type": "measurement_tolerance_update",
        "status": "review_required_not_approved",
        "approval_state": "not_approved_here",
        "provenance": {
          "source": "review_action_item_closure_loop_v0",
          "evidence_ref": "owner_decision_ref:OD-17-summary"
        },
        "owner_action": "Review the summarized decision evidence and approve, reject, or return the change.",
        "next_action": "Run requirements impact review after owner disposition.",
        "downstream_impact": "Potential effect on requirement interpretation, verification criteria, and dependent measurements.",
        "not_claimed": [
          "evidence verification",
          "approval",
          "implementation",
          "baseline update"
        ]
      },
      {
        "register_id": "CRR-CR-002",
        "change_id": "CR-002",
        "affected_refs": [
          "BL-PAGE-007"
        ],
        "change_type": "page_identity_refresh",
        "status": "blocked_by_draft_baseline_and_missing_checksum",
        "approval_state": "not_approved_here",
        "provenance": {
          "source": "page_module_trace_matrix_v0",
          "evidence_ref": "trace_delta_ref:TD-04-summary"
        },
        "owner_action": "Resolve baseline integrity and approval, then disposition the proposed identity refresh.",
        "next_action": "Rerun page-module trace review after prerequisites are satisfied.",
        "downstream_impact": "Page identity and trace consumers may remain inconsistent until controlled disposition.",
        "not_claimed": [
          "trace-delta verification",
          "approval",
          "implementation",
          "baseline update"
        ]
      },
      {
        "register_id": "CRR-CR-003",
        "change_id": "CR-003",
        "affected_refs": [
          "BL-HARNESS-002"
        ],
        "change_type": "interface_direction_pending",
        "status": "blocked_missing_evidence_owner_waiting",
        "approval_state": "owner_waiting",
        "provenance": {
          "source": "interface_control_and_harness_readiness_v0",
          "evidence_ref": null
        },
        "owner_action": "Provide the interface-direction decision and a public-safe evidence reference.",
        "next_action": "Do not route for incorporation until evidence and owner disposition exist.",
        "downstream_impact": "Interface control, harness readiness, and dependent integration work remain blocked.",
        "not_claimed": [
          "evidence availability",
          "interface direction",
          "approval",
          "implementation",
          "baseline update"
        ]
      }
    ],
    "impact_matrix": [
      {
        "impact_id": "IM-CR-001-BL-REQ-001",
        "change_id": "CR-001",
        "baseline_id": "BL-REQ-001",
        "status": "impact_review_required",
        "impact_domains": [
          "requirements",
          "measurement_tolerance",
          "verification_criteria"
        ],
        "basis": "Change type and affected reference supplied by the synthetic fixture.",
        "owner_action": "Confirm affected requirements and verification obligations.",
        "next_action": "Route to requirements and verification review after approval disposition.",
        "downstream_impact": "Dependent measurement and verification artifacts may require revision.",
        "not_claimed": [
          "complete dependency analysis",
          "actual artifact change",
          "approval"
        ]
      },
      {
        "impact_id": "IM-CR-002-BL-PAGE-007",
        "change_id": "CR-002",
        "baseline_id": "BL-PAGE-007",
        "status": "impact_review_blocked",
        "impact_domains": [
          "page_identity",
          "module_traceability",
          "downstream_references"
        ],
        "basis": "Change type, affected reference, draft state, and missing checksum supplied by the synthetic fixture.",
        "owner_action": "Restore baseline integrity and determine the authoritative page identity.",
        "next_action": "Rerun trace-matrix review following owner disposition.",
        "downstream_impact": "Trace links and page-referencing consumers may need coordinated refresh.",
        "not_claimed": [
          "authoritative identity",
          "complete dependency analysis",
          "actual artifact change",
          "approval"
        ]
      },
      {
        "impact_id": "IM-CR-003-BL-HARNESS-002",
        "change_id": "CR-003",
        "baseline_id": "BL-HARNESS-002",
        "status": "impact_assessment_blocked_missing_evidence",
        "impact_domains": [
          "interface_direction",
          "harness_connectivity",
          "integration_readiness"
        ],
        "basis": "Change type, affected reference, owner-waiting state, and absent evidence reference supplied by the synthetic fixture.",
        "owner_action": "Decide interface direction and provide supporting evidence.",
        "next_action": "Rerun interface and harness readiness assessment after the decision.",
        "downstream_impact": "Connectivity and integration conclusions cannot be finalized.",
        "not_claimed": [
          "interface definition",
          "complete dependency analysis",
          "actual artifact change",
          "approval"
        ]
      }
    ],
    "baseline_gap_register": [
      {
        "gap_id": "BGR-001",
        "baseline_id": "BL-REQ-001",
        "change_id": "CR-001",
        "gap_type": "approval_and_checksum_verification",
        "status": "open_review_required",
        "basis": "Baseline is reference-only and exposes only a public checksum prefix; CR-001 is not approved here.",
        "owner_action": "Provide controlled checksum verification and explicit change disposition.",
        "next_action": "Close the gap before baseline incorporation.",
        "downstream_impact": "Requirements-related change control remains gated.",
        "not_claimed": [
          "checksum validity",
          "approval"
        ]
      },
      {
        "gap_id": "BGR-002",
        "baseline_id": "BL-PAGE-007",
        "change_id": "CR-002",
        "gap_type": "missing_checksum_draft_baseline_and_approval",
        "status": "open_blocking",
        "basis": "Checksum is missing, baseline is draft, and CR-002 is not approved here.",
        "owner_action": "Supply checksum evidence and disposition both baseline and change.",
        "next_action": "Reassess change control readiness after closure.",
        "downstream_impact": "Controlled page identity refresh is blocked.",
        "not_claimed": [
          "artifact integrity",
          "approval",
          "baseline readiness"
        ]
      },
      {
        "gap_id": "BGR-003",
        "baseline_id": "BL-HARNESS-002",
        "change_id": "CR-003",
        "gap_type": "missing_change_evidence_and_owner_decision",
        "status": "open_blocking",
        "basis": "CR-003 has no evidence reference, owner is waiting, and the baseline requires review.",
        "owner_action": "Provide evidence, decide interface direction, and complete baseline review.",
        "next_action": "Resume impact review only after all three prerequisites are satisfied.",
        "downstream_impact": "Harness and interface readiness remain unresolved.",
        "not_claimed": [
          "evidence existence",
          "interface direction",
          "approval",
          "baseline readiness"
        ]
      }
    ],
    "rerun_routing": [
      {
        "route_id": "RR-CR-001",
        "change_id": "CR-001",
        "status": "queued_after_owner_disposition",
        "trigger": "Explicit approval or rejection plus controlled checksum verification for BL-REQ-001.",
        "route_to": [
          "requirements impact review",
          "verification criteria review",
          "configuration baseline review"
        ],
        "basis": "Measurement-tolerance update affecting BL-REQ-001.",
        "owner_action": "Supply disposition and checksum verification.",
        "next_action": "Rerun the listed reviews when the trigger is met.",
        "downstream_impact": "Determines whether dependent measurement artifacts require controlled updates.",
        "not_claimed": [
          "rerun execution",
          "route acceptance",
          "approval"
        ]
      },
      {
        "route_id": "RR-CR-002",
        "change_id": "CR-002",
        "status": "blocked_until_baseline_ready",
        "trigger": "Checksum supplied, draft baseline dispositioned, and CR-002 approved or rejected.",
        "route_to": [
          "page-module trace review",
          "identity consistency review",
          "configuration baseline review"
        ],
        "basis": "Page identity refresh affecting BL-PAGE-007.",
        "owner_action": "Resolve integrity and approval prerequisites.",
        "next_action": "Rerun the listed reviews when the trigger is met.",
        "downstream_impact": "Determines coordinated updates to trace and page-reference consumers.",
        "not_claimed": [
          "rerun execution",
          "route acceptance",
          "approval"
        ]
      },
      {
        "route_id": "RR-CR-003",
        "change_id": "CR-003",
        "status": "blocked_until_evidence_and_decision",
        "trigger": "Evidence reference supplied, interface direction decided, and BL-HARNESS-002 review completed.",
        "route_to": [
          "interface control review",
          "harness readiness review",
          "integration impact review",
          "configuration baseline review"
        ],
        "basis": "Pending interface direction affecting BL-HARNESS-002.",
        "owner_action": "Provide evidence and decision, then complete baseline review.",
        "next_action": "Rerun the listed reviews when the trigger is met.",
        "downstream_impact": "Determines whether interface and harness artifacts can advance.",
        "not_claimed": [
          "rerun execution",
          "route acceptance",
          "approval"
        ]
      }
    ],
    "owner_followup_needed": [
      {
        "followup_id": "OFN-001",
        "related_refs": [
          "BL-REQ-001",
          "CR-001"
        ],
        "status": "owner_action_required",
        "priority": "review_required",
        "basis": "Reference-only baseline, public-prefix checksum state, and unapproved change.",
        "owner_action": "Verify the controlled checksum and disposition CR-001.",
        "next_action": "Authorize review rerun or record rejection.",
        "downstream_impact": "Requirements and verification routing remains pending.",
        "not_claimed": [
          "owner decision",
          "approval"
        ]
      },
      {
        "followup_id": "OFN-002",
        "related_refs": [
          "BL-PAGE-007",
          "CR-002"
        ],
        "status": "owner_action_required_blocking",
        "priority": "blocking",
        "basis": "Missing checksum, draft baseline, and unapproved change.",
        "owner_action": "Supply checksum and disposition both baseline and CR-002.",
        "next_action": "Release page and trace reviews if prerequisites are satisfied.",
        "downstream_impact": "Page identity control remains blocked.",
        "not_claimed": [
          "owner decision",
          "artifact integrity",
          "approval"
        ]
      },
      {
        "followup_id": "OFN-003",
        "related_refs": [
          "BL-HARNESS-002",
          "CR-003"
        ],
        "status": "owner_action_required_blocking",
        "priority": "blocking",
        "basis": "Missing evidence, owner-waiting change, and review-required baseline.",
        "owner_action": "Provide evidence, decide interface direction, and complete baseline review.",
        "next_action": "Release interface and harness reruns only after prerequisite closure.",
        "downstream_impact": "Integration readiness remains unresolved.",
        "not_claimed": [
          "owner decision",
          "evidence availability",
          "approval"
        ]
      }
    ],
    "closure_handoff": [
      {
        "handoff_id": "CH-public_baseline_fixture-001",
        "status": "open_with_blockers",
        "basis": {
          "ready_packet_outputs": [
            "configuration_baseline_packet",
            "baseline_inventory",
            "change_request_register",
            "impact_matrix",
            "baseline_gap_register",
            "rerun_routing",
            "owner_followup_needed",
            "closure_handoff",
            "boundary_review_note"
          ],
          "blocking_refs": [
            "BL-REQ-001",
            "BL-PAGE-007",
            "BL-HARNESS-002",
            "CR-001",
            "CR-002",
            "CR-003"
          ]
        },
        "owner_action": "Resolve the recorded approval, checksum, evidence, and review gaps.",
        "next_action": "Hand resolved items to the specified rerun routes; retain unresolved items as open blockers.",
        "downstream_impact": "Downstream execution and baseline incorporation remain unauthorized.",
        "not_claimed": [
          "closure",
          "execution",
          "approval",
          "source truth",
          "baseline incorporation"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "note_id": "BRN-public_baseline_fixture-001",
        "status": "boundary_preserved",
        "basis": "Assessment is limited to the supplied public-safe workflow summary and synthetic fixture.",
        "read_only_upstream": true,
        "public_safe_scope": true,
        "owner_action": "Perform any approval, controlled-source verification, or execution outside this packet under authorized governance.",
        "next_action": "Use this packet only as a review and routing artifact.",
        "downstream_impact": "Consumers must preserve all review gates and not infer authorization.",
        "not_claimed": [
          "repository access",
          "command execution",
          "private material access",
          "raw source access",
          "approval",
          "source truth",
          "workflow pass",
          "workflow fail"
        ]
      }
    ]
  },
  "downstream_handoff": {
    "handoff_id": "DH-public_baseline_fixture-001",
    "status": "review_and_owner_action_required",
    "eligible_for_quality_review": true,
    "eligible_for_execution": false,
    "eligible_for_baseline_incorporation": false,
    "routes": [
      {
        "route_id": "DH-R1",
        "recipient": "owner_or_authorized_change_authority",
        "purpose": "Disposition approvals, decisions, and missing evidence."
      },
      {
        "route_id": "DH-R2",
        "recipient": "authorized_configuration_control_review",
        "purpose": "Verify controlled baseline integrity and review resolved change packets."
      },
      {
        "route_id": "DH-R3",
        "recipient": "domain_review_workflows",
        "purpose": "Rerun requirements, page-trace, interface, harness, verification, and integration reviews when triggers are satisfied."
      }
    ],
    "open_blockers": [
      "BL-REQ-001 requires controlled checksum verification and approval disposition.",
      "BL-PAGE-007 has a missing checksum and remains draft.",
      "BL-HARNESS-002 remains review-required.",
      "CR-001 and CR-002 are not approved here.",
      "CR-003 is owner-waiting and lacks an evidence reference."
    ],
    "owner_action": "Close or explicitly accept each blocker before authorizing downstream incorporation.",
    "not_claimed": [
      "handoff acceptance",
      "review execution",
      "approval",
      "baseline modification"
    ]
  },
  "boundary_review_note": {
    "note_id": "TOP-BRN-public_baseline_fixture-001",
    "status": "public_safe_boundary_preserved",
    "source_mode": "contract_only_synthetic",
    "upstream_boundary": "read_only",
    "basis": "Only the transformed frozen public-safe prompt content was used.",
    "owner_action": "Keep controlled verification, approval, and execution in authorized systems and roles.",
    "not_claimed": [
      "repository reads",
      "command execution",
      "private or secret access",
      "full checksum knowledge",
      "source truth",
      "approval",
      "execution",
      "pass result",
      "fail result"
    ]
  },
  "completion_state": {
    "packet_completion": "quality_ready_for_review",
    "required_outputs_present": true,
    "execution_state": "not_executed",
    "approval_state": "not_approved_here",
    "source_truth_state": "not_asserted",
    "baseline_state": "not_established_or_modified",
    "workflow_result_state": "no_pass_or_fail_claim",
    "blocking_state": "open_blockers_and_owner_actions_recorded",
    "summary": "The public-safe required-output packet is complete for quality review; approvals, controlled-source verification, reruns, execution, and baseline incorporation remain outside this packet."
  }
}
