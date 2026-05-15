{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_low",
  "workflow_id": "review_action_item_closure_loop_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
  "public_safe": true,
  "packets": {
    "action_closure_packet": [
      {
        "packet_id": "ACP-AI-001",
        "action_id": "AI-001",
        "status": "not_closed",
        "basis": "status open with no closure_evidence_ref",
        "owner_action": "supply official U1 datasheet through requested route source_gap_followup_packet_v0",
        "downstream_impact": "closure cannot be marked ready; source gap remains blocking",
        "not_claimed": "no source truth, execution, approval, or upstream mutation claimed"
      },
      {
        "packet_id": "ACP-AI-002",
        "action_id": "AI-002",
        "status": "closure_evidence_supplied_review_required",
        "basis": "closure_evidence_ref owner_decision_ref:OD-17-summary supplied for owner approved measurement tolerance",
        "owner_action": "owning workflow must review evidence and reindex if accepted",
        "downstream_impact": "eligible for rerun readiness after owning workflow review; not executed here",
        "not_claimed": "closure evidence ref does not replace owning workflow reindex"
      },
      {
        "packet_id": "ACP-AI-003",
        "action_id": "AI-003",
        "status": "owner_decision_required",
        "basis": "status waiting_owner with no closure_evidence_ref",
        "owner_action": "resolve IF_PWR direction ambiguity through owner_decision_request",
        "downstream_impact": "blocked until owner decision is supplied",
        "not_claimed": "no decision inferred from synthetic packet"
      },
      {
        "packet_id": "ACP-AI-004",
        "action_id": "AI-004",
        "status": "carry_forward_only",
        "basis": "status superseded with trace_delta_ref:TD-04-summary",
        "owner_action": "carry forward trace delta reference without mutating upstream packets",
        "downstream_impact": "do not rerun as active closure item; retain provenance for continuity",
        "not_claimed": "superseded state is not treated as active closure approval"
      }
    ],
    "action_closure_ledger": [
      {
        "ledger_id": "ACL-001",
        "action_id": "AI-001",
        "requested_route": "source_gap_followup_packet_v0",
        "source": "review_gate_evidence_pack_v0",
        "status": "open",
        "closure_evidence_ref": null,
        "ledger_status": "blocked_missing_evidence",
        "next_action": "request missing U1 official datasheet"
      },
      {
        "ledger_id": "ACL-002",
        "action_id": "AI-002",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "source": "verification_plan_from_page_contracts_v0",
        "status": "closure_evidence_supplied",
        "closure_evidence_ref": "owner_decision_ref:OD-17-summary",
        "ledger_status": "review_required_before_closure",
        "next_action": "owning workflow review and reindex decision"
      },
      {
        "ledger_id": "ACL-003",
        "action_id": "AI-003",
        "requested_route": "owner_decision_request",
        "source": "interface_control_and_harness_readiness_v0",
        "status": "waiting_owner",
        "closure_evidence_ref": null,
        "ledger_status": "owner_blocked",
        "next_action": "queue owner decision request"
      },
      {
        "ledger_id": "ACL-004",
        "action_id": "AI-004",
        "requested_route": "carry_forward_only",
        "source": "review_gate_evidence_pack_v0",
        "status": "superseded",
        "closure_evidence_ref": "trace_delta_ref:TD-04-summary",
        "ledger_status": "carry_forward",
        "next_action": "retain trace delta for downstream continuity"
      }
    ],
    "closure_status_matrix": [
      {
        "matrix_id": "CSM-001",
        "action_id": "AI-001",
        "closure_state": "blocked",
        "blocker_type": "missing_source_input",
        "rerun_ready": false,
        "review_required": false,
        "owner_action_required": true
      },
      {
        "matrix_id": "CSM-002",
        "action_id": "AI-002",
        "closure_state": "evidence_supplied_pending_review",
        "blocker_type": "owning_workflow_review",
        "rerun_ready": true,
        "review_required": true,
        "owner_action_required": true
      },
      {
        "matrix_id": "CSM-003",
        "action_id": "AI-003",
        "closure_state": "owner_waiting",
        "blocker_type": "owner_decision",
        "rerun_ready": false,
        "review_required": false,
        "owner_action_required": true
      },
      {
        "matrix_id": "CSM-004",
        "action_id": "AI-004",
        "closure_state": "superseded_carry_forward",
        "blocker_type": "not_active",
        "rerun_ready": false,
        "review_required": false,
        "owner_action_required": false
      }
    ],
    "unresolved_action_items": [
      {
        "unresolved_id": "UAI-001",
        "action_id": "AI-001",
        "status": "open",
        "basis": "missing U1 official datasheet has no closure evidence",
        "next_action": "obtain official datasheet evidence",
        "downstream_impact": "source gap follow-up remains required"
      },
      {
        "unresolved_id": "UAI-003",
        "action_id": "AI-003",
        "status": "waiting_owner",
        "basis": "IF_PWR direction ambiguous and no owner decision supplied",
        "next_action": "owner decision required",
        "downstream_impact": "interface readiness cannot close this item"
      }
    ],
    "closure_ready_reruns": [
      {
        "rerun_id": "CRR-002",
        "action_id": "AI-002",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "status": "rerun_ready_not_executed",
        "basis": "closure evidence supplied via owner_decision_ref:OD-17-summary",
        "next_action": "owning workflow review and rerun scheduling",
        "not_claimed": "rerun_ready is not rerun_executed"
      }
    ],
    "closure_blockers": [
      {
        "blocker_id": "CB-001",
        "action_id": "AI-001",
        "blocker": "missing U1 official datasheet",
        "status": "active_blocker",
        "owner_action": "provide official datasheet evidence",
        "downstream_impact": "prevents closure and rerun readiness"
      },
      {
        "blocker_id": "CB-003",
        "action_id": "AI-003",
        "blocker": "IF_PWR direction ambiguous",
        "status": "owner_decision_blocker",
        "owner_action": "provide direction decision",
        "downstream_impact": "prevents interface closure"
      }
    ],
    "carry_forward_register": [
      {
        "carry_forward_id": "CFR-004",
        "action_id": "AI-004",
        "status": "carry_forward_only",
        "basis": "superseded old page id page_003 with trace_delta_ref:TD-04-summary",
        "next_action": "retain continuity note for downstream consumers",
        "downstream_impact": "excluded from active rerun queue"
      }
    ],
    "owner_decision_request_queue": [
      {
        "request_id": "ODRQ-003",
        "action_id": "AI-003",
        "status": "queued",
        "decision_needed": "resolve IF_PWR direction ambiguity",
        "basis": "requested_route owner_decision_request and status waiting_owner",
        "owner_action": "issue owner decision reference",
        "downstream_impact": "required before closure can proceed"
      },
      {
        "request_id": "ODRQ-002",
        "action_id": "AI-002",
        "status": "review_supplied_decision_ref",
        "decision_needed": "confirm owner_decision_ref:OD-17-summary is accepted by owning workflow",
        "basis": "closure evidence supplied but owning workflow reindex still required",
        "owner_action": "review and reindex if accepted",
        "downstream_impact": "may enable verified rerun path"
      }
    ],
    "closure_provenance": [
      {
        "provenance_id": "CP-001",
        "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
        "source_mode": "contract_only_synthetic",
        "project_scope_key": "public_closure_fixture",
        "basis": "synthetic fixture action_items and workflow contract summary only",
        "boundary": "no repository files, commands, private material, raw truth, or secrets used"
      },
      {
        "provenance_id": "CP-002",
        "policy_basis": [
          "closure evidence ref does not replace owning workflow reindex",
          "rerun_ready is not rerun_executed",
          "do not mutate upstream packets"
        ],
        "boundary": "outputs are derived closure review packets only"
      }
    ],
    "boundary_review_note": [
      {
        "note_id": "BRN-001",
        "status": "boundary_preserved",
        "basis": "owned only fixture.required_outputs and treated upstream sources as read-only",
        "not_claimed": "no execution, approval, source truth, private data access, command run, repository read, or pass/fail certification claimed",
        "downstream_handoff": "owning workflows must review supplied evidence, perform any reindex, and execute reruns outside this packet"
      }
    ]
  },
  "downstream_handoff": [
    {
      "handoff_id": "DH-001",
      "target": "source_gap_followup_packet_v0",
      "action_ids": [
        "AI-001"
      ],
      "status": "blocked_missing_input",
      "next_action": "obtain official U1 datasheet"
    },
    {
      "handoff_id": "DH-002",
      "target": "verification_plan_from_page_contracts_v0",
      "action_ids": [
        "AI-002"
      ],
      "status": "rerun_ready_after_review_not_executed",
      "next_action": "owning workflow review and reindex before rerun execution"
    },
    {
      "handoff_id": "DH-003",
      "target": "owner_decision_request",
      "action_ids": [
        "AI-003"
      ],
      "status": "owner_decision_required",
      "next_action": "owner supplies IF_PWR direction decision"
    },
    {
      "handoff_id": "DH-004",
      "target": "carry_forward_only",
      "action_ids": [
        "AI-004"
      ],
      "status": "carry_forward_registered",
      "next_action": "retain trace delta continuity without active rerun"
    }
  ],
  "boundary_review_note": {
    "status": "public_safe_contract_only",
    "source_mode": "contract_only_synthetic",
    "boundaries_preserved": [
      "no repository reads",
      "no commands run",
      "no private raw or secret material used",
      "no upstream packet mutation",
      "no execution or approval claimed"
    ],
    "not_claimed": "This packet is a quality-ready synthetic closure review artifact, not source truth, workflow execution, rerun execution, owner approval, or pass/fail result."
  },
  "completion_state": {
    "packet_completion": "quality_ready_for_synthetic_fixture",
    "required_outputs_present": true,
    "execution_claim": false,
    "approval_claim": false,
    "source_truth_claim": false,
    "rerun_execution_claim": false,
    "pass_fail_claim": false,
    "basis": "completed only against supplied workflow contract summary and synthetic public fixture"
  }
}