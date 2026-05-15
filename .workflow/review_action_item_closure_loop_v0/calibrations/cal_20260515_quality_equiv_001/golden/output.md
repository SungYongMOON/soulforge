{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_xhigh",
  "workflow_id": "review_action_item_closure_loop_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
  "public_safe": true,
  "packets": {
    "action_closure_packet": [
      {
        "closure_id": "ACP-AI-001",
        "action_id": "AI-001",
        "status": "not_closed_blocked",
        "basis": "action item status is open and no closure_evidence_ref is supplied",
        "provenance": {
          "source": "review_gate_evidence_pack_v0",
          "requested_route": "source_gap_followup_packet_v0",
          "source_mode": "contract_only_synthetic"
        },
        "blocker": "missing U1 official datasheet",
        "owner_action": "provide or route official U1 datasheet gap followup through source_gap_followup_packet_v0",
        "next_action": "keep item unresolved until owning source-gap workflow supplies acceptable evidence",
        "downstream_impact": "dependent closure and any rerun remain blocked",
        "not_claimed": "no datasheet retrieval, source truth verification, closure approval, or upstream mutation claimed"
      },
      {
        "closure_id": "ACP-AI-002",
        "action_id": "AI-002",
        "status": "closure_evidence_supplied_rerun_ready",
        "basis": "owner decision reference supplied for measurement tolerance blocker",
        "provenance": {
          "source": "verification_plan_from_page_contracts_v0",
          "requested_route": "verification_plan_from_page_contracts_v0",
          "closure_evidence_ref": "owner_decision_ref:OD-17-summary",
          "source_mode": "contract_only_synthetic"
        },
        "blocker": "owner approved measurement tolerance",
        "owner_action": "owning verification workflow must reindex or rerun using supplied owner decision reference",
        "next_action": "queue verification_plan_from_page_contracts_v0 rerun readiness without marking rerun executed",
        "downstream_impact": "verification planning may proceed only after owning workflow rerun or reindex completes",
        "not_claimed": "rerun_ready is not rerun_executed; closure evidence ref does not replace owning workflow reindex"
      },
      {
        "closure_id": "ACP-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner_decision",
        "basis": "action item status is waiting_owner and no closure_evidence_ref is supplied",
        "provenance": {
          "source": "interface_control_and_harness_readiness_v0",
          "requested_route": "owner_decision_request",
          "source_mode": "contract_only_synthetic"
        },
        "blocker": "IF_PWR direction ambiguous",
        "owner_action": "owner must decide IF_PWR direction",
        "next_action": "place item in owner_decision_request_queue",
        "downstream_impact": "interface control and harness readiness remain blocked for this decision",
        "not_claimed": "no owner decision, interface truth, or approval claimed"
      },
      {
        "closure_id": "ACP-AI-004",
        "action_id": "AI-004",
        "status": "superseded_carry_forward_only",
        "basis": "action item status is superseded with trace delta closure evidence supplied",
        "provenance": {
          "source": "review_gate_evidence_pack_v0",
          "requested_route": "carry_forward_only",
          "closure_evidence_ref": "trace_delta_ref:TD-04-summary",
          "source_mode": "contract_only_synthetic"
        },
        "blocker": "old page id page_003",
        "owner_action": "carry forward supersession note without mutating upstream packet",
        "next_action": "register as carry-forward-only historical trace delta",
        "downstream_impact": "downstream consumers should use updated trace context while preserving read-only upstream boundary",
        "not_claimed": "no upstream packet mutation, source truth approval, or rerun execution claimed"
      }
    ],
    "action_closure_ledger": [
      {
        "ledger_id": "ACL-001",
        "action_id": "AI-001",
        "input_status": "open",
        "closure_status": "not_closed_blocked",
        "basis": "missing closure evidence and missing official datasheet blocker",
        "owner_action": "supply official U1 datasheet evidence",
        "next_action": "route source gap followup",
        "downstream_impact": "blocks closure readiness",
        "not_claimed": "no evidence validation performed beyond fixture packet"
      },
      {
        "ledger_id": "ACL-002",
        "action_id": "AI-002",
        "input_status": "closure_evidence_supplied",
        "closure_status": "ready_for_owning_workflow_rerun",
        "basis": "owner_decision_ref:OD-17-summary supplied",
        "owner_action": "verification workflow owner reruns or reindexes",
        "next_action": "queue rerun readiness",
        "downstream_impact": "may unblock verification planning after rerun",
        "not_claimed": "not marked closed by this packet"
      },
      {
        "ledger_id": "ACL-003",
        "action_id": "AI-003",
        "input_status": "waiting_owner",
        "closure_status": "owner_decision_required",
        "basis": "IF_PWR direction remains ambiguous",
        "owner_action": "provide IF_PWR direction decision",
        "next_action": "enqueue owner decision request",
        "downstream_impact": "blocks interface and harness readiness",
        "not_claimed": "no decision inferred"
      },
      {
        "ledger_id": "ACL-004",
        "action_id": "AI-004",
        "input_status": "superseded",
        "closure_status": "carry_forward_registered",
        "basis": "trace_delta_ref:TD-04-summary supplied for old page id page_003",
        "owner_action": "carry forward supersession reference",
        "next_action": "preserve in carry_forward_register",
        "downstream_impact": "prevents stale page id from being treated as active blocker",
        "not_claimed": "not treated as active closure approval"
      }
    ],
    "closure_status_matrix": [
      {
        "matrix_id": "CSM-AI-001",
        "action_id": "AI-001",
        "requested_route": "source_gap_followup_packet_v0",
        "source": "review_gate_evidence_pack_v0",
        "input_status": "open",
        "closure_evidence_state": "missing",
        "closure_category": "blocked_unresolved",
        "rerun_state": "not_ready",
        "owner_action": "provide official U1 datasheet",
        "downstream_impact": "source-dependent closure remains blocked",
        "not_claimed": "no source truth lookup or approval"
      },
      {
        "matrix_id": "CSM-AI-002",
        "action_id": "AI-002",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "source": "verification_plan_from_page_contracts_v0",
        "input_status": "closure_evidence_supplied",
        "closure_evidence_state": "supplied",
        "closure_category": "rerun_ready_review_required",
        "rerun_state": "ready_not_executed",
        "owner_action": "owning workflow rerun or reindex",
        "downstream_impact": "verification plan update can proceed after owning rerun",
        "not_claimed": "no rerun execution"
      },
      {
        "matrix_id": "CSM-AI-003",
        "action_id": "AI-003",
        "requested_route": "owner_decision_request",
        "source": "interface_control_and_harness_readiness_v0",
        "input_status": "waiting_owner",
        "closure_evidence_state": "missing",
        "closure_category": "owner_decision_required",
        "rerun_state": "not_ready",
        "owner_action": "decide IF_PWR direction",
        "downstream_impact": "interface readiness remains review-required",
        "not_claimed": "no owner decision supplied"
      },
      {
        "matrix_id": "CSM-AI-004",
        "action_id": "AI-004",
        "requested_route": "carry_forward_only",
        "source": "review_gate_evidence_pack_v0",
        "input_status": "superseded",
        "closure_evidence_state": "supplied",
        "closure_category": "carry_forward_only",
        "rerun_state": "not_applicable",
        "owner_action": "preserve trace delta as carry-forward note",
        "downstream_impact": "stale page id should not be reopened as active blocker",
        "not_claimed": "no mutation of upstream evidence pack"
      }
    ],
    "unresolved_action_items": [
      {
        "unresolved_id": "UAI-AI-001",
        "action_id": "AI-001",
        "status": "open",
        "blocker": "missing U1 official datasheet",
        "basis": "no closure_evidence_ref supplied",
        "owner_action": "supply official datasheet or source-gap closure evidence",
        "next_action": "route to source_gap_followup_packet_v0",
        "downstream_impact": "closure loop remains blocked",
        "not_claimed": "no datasheet evidence created or verified"
      },
      {
        "unresolved_id": "UAI-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner",
        "blocker": "IF_PWR direction ambiguous",
        "basis": "owner decision still required",
        "owner_action": "owner decides IF_PWR direction",
        "next_action": "enqueue owner_decision_request",
        "downstream_impact": "interface and harness readiness remain pending",
        "not_claimed": "no inferred technical direction"
      }
    ],
    "closure_ready_reruns": [
      {
        "rerun_id": "CRR-AI-002",
        "action_id": "AI-002",
        "status": "rerun_ready_not_executed",
        "target_workflow": "verification_plan_from_page_contracts_v0",
        "basis": "closure_evidence_ref owner_decision_ref:OD-17-summary supplied",
        "owner_action": "verification workflow owner performs rerun or reindex",
        "next_action": "handoff to owning workflow queue",
        "downstream_impact": "updated verification plan may consume owner tolerance decision after rerun",
        "not_claimed": "rerun readiness does not claim rerun execution, approval, or source truth"
      }
    ],
    "closure_blockers": [
      {
        "blocker_id": "CB-AI-001",
        "action_id": "AI-001",
        "status": "blocking",
        "blocker": "missing U1 official datasheet",
        "basis": "open action item without closure evidence",
        "owner_action": "obtain official datasheet evidence",
        "next_action": "source gap followup",
        "downstream_impact": "prevents closure-ready state",
        "not_claimed": "no external source access"
      },
      {
        "blocker_id": "CB-AI-003",
        "action_id": "AI-003",
        "status": "blocking_owner_decision",
        "blocker": "IF_PWR direction ambiguous",
        "basis": "waiting_owner status",
        "owner_action": "provide IF_PWR direction decision",
        "next_action": "owner decision request",
        "downstream_impact": "prevents interface and harness readiness closure",
        "not_claimed": "no owner decision made by candidate"
      }
    ],
    "carry_forward_register": [
      {
        "carry_forward_id": "CFR-AI-004",
        "action_id": "AI-004",
        "status": "registered_carry_forward_only",
        "basis": "superseded action item with trace_delta_ref:TD-04-summary",
        "provenance": {
          "source": "review_gate_evidence_pack_v0",
          "closure_evidence_ref": "trace_delta_ref:TD-04-summary"
        },
        "owner_action": "carry forward supersession note",
        "next_action": "inform downstream consumers that old page id page_003 is superseded",
        "downstream_impact": "avoids reopening superseded page id as active blocker",
        "not_claimed": "no upstream mutation or historical source rewrite"
      }
    ],
    "owner_decision_request_queue": [
      {
        "request_id": "ODRQ-AI-003",
        "action_id": "AI-003",
        "status": "queued_owner_decision_required",
        "decision_needed": "IF_PWR direction",
        "basis": "blocker states IF_PWR direction ambiguous and status is waiting_owner",
        "provenance": {
          "source": "interface_control_and_harness_readiness_v0",
          "requested_route": "owner_decision_request"
        },
        "owner_action": "provide authoritative IF_PWR direction decision",
        "next_action": "return decision evidence to closure loop after owner response",
        "downstream_impact": "blocks interface control and harness readiness until owner decision exists",
        "not_claimed": "no technical direction selected by this candidate"
      }
    ],
    "closure_provenance": [
      {
        "provenance_id": "CP-001",
        "action_id": "AI-001",
        "basis": "synthetic fixture action_items entry AI-001",
        "source_mode": "contract_only_synthetic",
        "source": "review_gate_evidence_pack_v0",
        "requested_route": "source_gap_followup_packet_v0",
        "closure_evidence_ref": null,
        "not_claimed": "repository files, private material, raw truth, commands, and external sources not used"
      },
      {
        "provenance_id": "CP-002",
        "action_id": "AI-002",
        "basis": "synthetic fixture action_items entry AI-002",
        "source_mode": "contract_only_synthetic",
        "source": "verification_plan_from_page_contracts_v0",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "closure_evidence_ref": "owner_decision_ref:OD-17-summary",
        "not_claimed": "owner decision reference not independently verified"
      },
      {
        "provenance_id": "CP-003",
        "action_id": "AI-003",
        "basis": "synthetic fixture action_items entry AI-003",
        "source_mode": "contract_only_synthetic",
        "source": "interface_control_and_harness_readiness_v0",
        "requested_route": "owner_decision_request",
        "closure_evidence_ref": null,
        "not_claimed": "owner decision not supplied or inferred"
      },
      {
        "provenance_id": "CP-004",
        "action_id": "AI-004",
        "basis": "synthetic fixture action_items entry AI-004",
        "source_mode": "contract_only_synthetic",
        "source": "review_gate_evidence_pack_v0",
        "requested_route": "carry_forward_only",
        "closure_evidence_ref": "trace_delta_ref:TD-04-summary",
        "not_claimed": "trace delta not independently verified against source truth"
      }
    ],
    "boundary_review_note": [
      {
        "note_id": "BRN-001",
        "status": "public_safe_contract_only",
        "basis": "fixture policy notes require no upstream mutation and no execution claims",
        "owner_action": "upstream owners retain authority over source packets, reruns, reindexing, and approvals",
        "next_action": "handoff generated packets to appropriate owning workflows for review",
        "downstream_impact": "downstream consumers receive explicit blocked, rerun-ready, owner-decision, and carry-forward states",
        "not_claimed": "no repository read, command execution, private/raw/secret material access, source truth validation, approval, or workflow execution claimed"
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
      "status": "blocked_input_required",
      "basis": "missing U1 official datasheet",
      "owner_action": "source owner supplies official datasheet evidence",
      "downstream_impact": "closure loop cannot close AI-001 until evidence exists",
      "not_claimed": "no evidence acquisition performed"
    },
    {
      "handoff_id": "DH-002",
      "target": "verification_plan_from_page_contracts_v0",
      "action_ids": [
        "AI-002"
      ],
      "status": "rerun_ready_not_executed",
      "basis": "owner_decision_ref:OD-17-summary supplied",
      "owner_action": "owning workflow reruns or reindexes",
      "downstream_impact": "verification planning can consume tolerance decision only after owning workflow action",
      "not_claimed": "no rerun execution or closure approval"
    },
    {
      "handoff_id": "DH-003",
      "target": "owner_decision_request",
      "action_ids": [
        "AI-003"
      ],
      "status": "owner_decision_required",
      "basis": "IF_PWR direction ambiguous",
      "owner_action": "owner provides authoritative direction",
      "downstream_impact": "interface readiness remains blocked",
      "not_claimed": "no decision inferred"
    },
    {
      "handoff_id": "DH-004",
      "target": "carry_forward_only",
      "action_ids": [
        "AI-004"
      ],
      "status": "carry_forward_registered",
      "basis": "trace_delta_ref:TD-04-summary supplied for superseded old page id page_003",
      "owner_action": "preserve carry-forward note",
      "downstream_impact": "downstream consumers avoid treating old page id as active blocker",
      "not_claimed": "no upstream packet mutation"
    }
  ],
  "boundary_review_note": {
    "status": "boundary_preserved",
    "public_safe": true,
    "basis": "used only workflow contract summary and synthetic fixture",
    "read_only_upstream_boundaries": [
      "review_gate_evidence_pack_v0",
      "verification_plan_from_page_contracts_v0",
      "interface_control_and_harness_readiness_v0"
    ],
    "not_claimed": [
      "repository file reads",
      "command execution",
      "private material access",
      "raw truth access",
      "secret access",
      "source truth validation",
      "workflow execution",
      "rerun execution",
      "approval",
      "upstream packet mutation",
      "pass or fail result"
    ]
  },
  "completion_state": {
    "packet_completion": "quality_ready_for_fixture_contract",
    "required_outputs_present": true,
    "execution_claim": "not_claimed",
    "approval_claim": "not_claimed",
    "source_truth_claim": "not_claimed",
    "pass_fail_claim": "not_claimed",
    "basis": "all required output packet names are present under packets and derived only from the synthetic public fixture"
  }
}