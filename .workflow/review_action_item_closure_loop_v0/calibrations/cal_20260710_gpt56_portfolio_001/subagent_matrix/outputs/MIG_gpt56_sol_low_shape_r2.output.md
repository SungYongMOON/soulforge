{
  "candidate_id": "MIG_gpt56_sol_low_shape_r2",
  "workflow_id": "review_action_item_closure_loop_v0",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
  "public_safe": true,
  "packets": {
    "action_closure_packet": [
      {
        "action_id": "AI-001",
        "status": "blocked_missing_input",
        "basis": {
          "source": "review_gate_evidence_pack_v0",
          "fixture_status": "open",
          "blocker": "missing U1 official datasheet",
          "closure_evidence_ref": null
        },
        "owner_action": "Provide or authorize access to the official U1 datasheet.",
        "next_action": "Route the supplied public-safe source reference through source_gap_followup_packet_v0.",
        "downstream_impact": "Closure review cannot proceed without the missing official source.",
        "not_claimed": [
          "datasheet existence or contents",
          "source validation",
          "action closure",
          "upstream mutation"
        ]
      },
      {
        "action_id": "AI-002",
        "status": "closure_evidence_received_reindex_required",
        "basis": {
          "source": "verification_plan_from_page_contracts_v0",
          "fixture_status": "closure_evidence_supplied",
          "blocker": "owner approved measurement tolerance",
          "closure_evidence_ref": "owner_decision_ref:OD-17-summary"
        },
        "owner_action": "Confirm the owning workflow may consume the summarized owner-decision reference.",
        "next_action": "Reindex the closure evidence in verification_plan_from_page_contracts_v0 and rerun its applicable verification-plan review.",
        "downstream_impact": "A rerun can become executable only after owning-workflow reindex and required review.",
        "not_claimed": [
          "validity or contents of OD-17",
          "owning-workflow reindex",
          "rerun execution",
          "action closure",
          "approval"
        ]
      },
      {
        "action_id": "AI-003",
        "status": "waiting_owner_decision",
        "basis": {
          "source": "interface_control_and_harness_readiness_v0",
          "fixture_status": "waiting_owner",
          "blocker": "IF_PWR direction ambiguous",
          "closure_evidence_ref": null
        },
        "owner_action": "Decide and document the intended IF_PWR direction.",
        "next_action": "Submit the decision through owner_decision_request, then return the resulting reference to the owning workflow.",
        "downstream_impact": "Interface and harness readiness remains blocked by direction ambiguity.",
        "not_claimed": [
          "IF_PWR direction",
          "owner decision",
          "action closure",
          "upstream mutation"
        ]
      },
      {
        "action_id": "AI-004",
        "status": "superseded_carry_forward_review_required",
        "basis": {
          "source": "review_gate_evidence_pack_v0",
          "fixture_status": "superseded",
          "blocker": "old page id page_003",
          "closure_evidence_ref": "trace_delta_ref:TD-04-summary"
        },
        "owner_action": "Confirm the trace-delta summary identifies the replacement page or disposition.",
        "next_action": "Carry the item forward without mutating the upstream packet and reconcile it in the owning workflow.",
        "downstream_impact": "Stale page identity remains visible until owning-workflow reconciliation records its disposition.",
        "not_claimed": [
          "validity or contents of TD-04",
          "replacement page identity",
          "owning-workflow reconciliation",
          "action closure"
        ]
      }
    ],
    "action_closure_ledger": [
      {
        "ledger_id": "ACL-AI-001",
        "action_id": "AI-001",
        "status": "open_blocked",
        "provenance": "synthetic fixture action_items[AI-001]",
        "owner_action": "Supply the official U1 datasheet reference.",
        "next_action": "Create source-gap follow-up input.",
        "downstream_impact": "No closure-ready rerun.",
        "not_claimed": "No source retrieval, validation, or closure occurred."
      },
      {
        "ledger_id": "ACL-AI-002",
        "action_id": "AI-002",
        "status": "evidence_supplied_pending_reindex",
        "provenance": "synthetic fixture action_items[AI-002] and owner_decision_ref:OD-17-summary",
        "owner_action": "Authorize owning-workflow consumption if required.",
        "next_action": "Reindex evidence and schedule the applicable rerun.",
        "downstream_impact": "Conditionally rerun-ready after reindex; not executed.",
        "not_claimed": "Evidence validity, reindex, rerun, approval, and closure are not claimed."
      },
      {
        "ledger_id": "ACL-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner",
        "provenance": "synthetic fixture action_items[AI-003]",
        "owner_action": "Resolve IF_PWR direction.",
        "next_action": "Return a bounded decision reference to the owning workflow.",
        "downstream_impact": "Readiness remains blocked.",
        "not_claimed": "No direction decision or closure is claimed."
      },
      {
        "ledger_id": "ACL-AI-004",
        "action_id": "AI-004",
        "status": "superseded_pending_carry_forward_reconciliation",
        "provenance": "synthetic fixture action_items[AI-004] and trace_delta_ref:TD-04-summary",
        "owner_action": "Confirm supersession disposition.",
        "next_action": "Reconcile through carry-forward handling.",
        "downstream_impact": "Stale identifier remains tracked without upstream mutation.",
        "not_claimed": "Trace-delta validity, reconciliation, and closure are not claimed."
      }
    ],
    "closure_status_matrix": [
      {
        "matrix_id": "CSM-AI-001",
        "action_id": "AI-001",
        "input_present": false,
        "review_required": true,
        "owner_decision_required": false,
        "reindex_required": false,
        "rerun_ready": false,
        "closure_ready": false,
        "status": "blocked",
        "basis": "Official U1 datasheet is missing.",
        "owner_action": "Supply official-source reference.",
        "downstream_impact": "Source-gap route remains pending.",
        "not_claimed": "No execution or source truth."
      },
      {
        "matrix_id": "CSM-AI-002",
        "action_id": "AI-002",
        "input_present": true,
        "review_required": true,
        "owner_decision_required": false,
        "reindex_required": true,
        "rerun_ready": false,
        "closure_ready": false,
        "status": "pending_reindex",
        "basis": "A summarized owner-decision evidence reference is supplied.",
        "owner_action": "Permit or confirm evidence consumption.",
        "downstream_impact": "Applicable rerun follows owning-workflow reindex.",
        "not_claimed": "Rerun-ready does not mean rerun-executed; neither is claimed here."
      },
      {
        "matrix_id": "CSM-AI-003",
        "action_id": "AI-003",
        "input_present": false,
        "review_required": true,
        "owner_decision_required": true,
        "reindex_required": false,
        "rerun_ready": false,
        "closure_ready": false,
        "status": "waiting_owner",
        "basis": "IF_PWR direction is ambiguous.",
        "owner_action": "Choose and document IF_PWR direction.",
        "downstream_impact": "Interface readiness remains unresolved.",
        "not_claimed": "No owner decision or technical direction."
      },
      {
        "matrix_id": "CSM-AI-004",
        "action_id": "AI-004",
        "input_present": true,
        "review_required": true,
        "owner_decision_required": false,
        "reindex_required": true,
        "rerun_ready": false,
        "closure_ready": false,
        "status": "carry_forward",
        "basis": "Item is marked superseded with a trace-delta summary reference.",
        "owner_action": "Confirm replacement or retirement disposition.",
        "downstream_impact": "Owning workflow must reconcile the stale page id.",
        "not_claimed": "No replacement identity, reindex, or closure."
      }
    ],
    "unresolved_action_items": [
      {
        "unresolved_id": "UAI-AI-001",
        "action_id": "AI-001",
        "status": "blocked_missing_official_source",
        "basis": "missing U1 official datasheet",
        "owner_action": "Provide the official U1 datasheet reference.",
        "next_action": "Route to source_gap_followup_packet_v0.",
        "downstream_impact": "Closure cannot be evaluated.",
        "not_claimed": "No source truth or closure."
      },
      {
        "unresolved_id": "UAI-AI-002",
        "action_id": "AI-002",
        "status": "pending_owning_workflow_reindex_and_review",
        "basis": "owner_decision_ref:OD-17-summary is supplied but not reindexed here",
        "owner_action": "Confirm evidence handoff.",
        "next_action": "Owning workflow reindexes and reviews the evidence.",
        "downstream_impact": "Rerun remains unexecuted.",
        "not_claimed": "No evidence validation, reindex, rerun, approval, or closure."
      },
      {
        "unresolved_id": "UAI-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner_decision",
        "basis": "IF_PWR direction ambiguous",
        "owner_action": "Resolve IF_PWR direction.",
        "next_action": "Return the bounded decision reference.",
        "downstream_impact": "Harness readiness remains blocked.",
        "not_claimed": "No decision or closure."
      },
      {
        "unresolved_id": "UAI-AI-004",
        "action_id": "AI-004",
        "status": "superseded_pending_reconciliation",
        "basis": "trace_delta_ref:TD-04-summary supplied for old page id page_003",
        "owner_action": "Confirm disposition.",
        "next_action": "Carry forward to owning-workflow reconciliation.",
        "downstream_impact": "Stale page reference remains tracked.",
        "not_claimed": "No trace validation, replacement mapping, or closure."
      }
    ],
    "closure_ready_reruns": [
      {
        "rerun_id": "CRR-AI-002",
        "action_id": "AI-002",
        "status": "conditionally_ready_after_reindex",
        "basis": "Closure evidence reference owner_decision_ref:OD-17-summary is supplied.",
        "prerequisites": [
          "owning workflow reindexes the evidence reference",
          "required review accepts the evidence as applicable",
          "rerun authorization is recorded"
        ],
        "owner_action": "Confirm evidence-consumption and rerun authorization.",
        "next_action": "Hand off to verification_plan_from_page_contracts_v0 for reindex and rerun.",
        "downstream_impact": "May permit action closure evaluation after rerun results exist.",
        "not_claimed": [
          "current rerun readiness without prerequisites",
          "rerun execution",
          "successful rerun",
          "action closure"
        ]
      }
    ],
    "closure_blockers": [
      {
        "blocker_id": "CB-AI-001",
        "action_id": "AI-001",
        "status": "active",
        "blocker": "missing U1 official datasheet",
        "basis": "synthetic fixture",
        "owner_action": "Provide an official datasheet reference.",
        "next_action": "Perform source-gap follow-up.",
        "downstream_impact": "AI-001 cannot advance to closure review.",
        "not_claimed": "No datasheet retrieval or validation."
      },
      {
        "blocker_id": "CB-AI-002",
        "action_id": "AI-002",
        "status": "process_blocked",
        "blocker": "closure evidence has not been reindexed or reviewed by the owning workflow",
        "basis": "fixture policy note that a closure evidence ref does not replace owning workflow reindex",
        "owner_action": "Confirm evidence handoff.",
        "next_action": "Reindex and review in the owning workflow.",
        "downstream_impact": "Rerun is not executable from this packet.",
        "not_claimed": "No reindex, review, or rerun."
      },
      {
        "blocker_id": "CB-AI-003",
        "action_id": "AI-003",
        "status": "active",
        "blocker": "IF_PWR direction ambiguous",
        "basis": "synthetic fixture",
        "owner_action": "Issue an explicit direction decision.",
        "next_action": "Route through owner_decision_request.",
        "downstream_impact": "Interface and harness readiness remain blocked.",
        "not_claimed": "No technical direction or approval."
      },
      {
        "blocker_id": "CB-AI-004",
        "action_id": "AI-004",
        "status": "reconciliation_required",
        "blocker": "old page id page_003 requires supersession disposition",
        "basis": "synthetic fixture and trace_delta_ref:TD-04-summary",
        "owner_action": "Confirm replacement or retirement disposition.",
        "next_action": "Reconcile through carry-forward handling.",
        "downstream_impact": "Stale identity remains visible.",
        "not_claimed": "No replacement mapping or reconciliation."
      }
    ],
    "carry_forward_register": [
      {
        "carry_forward_id": "CFR-AI-004",
        "action_id": "AI-004",
        "status": "registered_pending_reconciliation",
        "basis": {
          "fixture_status": "superseded",
          "blocker": "old page id page_003",
          "closure_evidence_ref": "trace_delta_ref:TD-04-summary"
        },
        "owner_action": "Confirm whether page_003 was replaced or retired.",
        "next_action": "Pass the summarized trace-delta reference to review_gate_evidence_pack_v0 without mutating its upstream packet.",
        "downstream_impact": "The owning workflow retains responsibility for final reconciliation.",
        "not_claimed": [
          "trace-delta source truth",
          "replacement page",
          "upstream mutation",
          "action closure"
        ]
      }
    ],
    "owner_decision_request_queue": [
      {
        "request_id": "ODRQ-AI-003",
        "action_id": "AI-003",
        "status": "awaiting_owner",
        "decision_requested": "Specify the intended IF_PWR direction.",
        "basis": "interface_control_and_harness_readiness_v0 reports IF_PWR direction ambiguous",
        "owner_action": "Choose the direction and provide a bounded decision reference.",
        "next_action": "Return the reference to interface_control_and_harness_readiness_v0 for reindex and review.",
        "downstream_impact": "Interface and harness readiness cannot resolve until the decision is supplied.",
        "not_claimed": [
          "preferred direction",
          "decision outcome",
          "approval",
          "action closure"
        ]
      }
    ],
    "closure_provenance": [
      {
        "provenance_id": "CP-FIXTURE",
        "status": "packet_basis",
        "basis": "contract_only_synthetic",
        "source": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
        "scope": [
          "workflow contract summary",
          "synthetic fixture JSON"
        ],
        "owner_action": "Use owning workflows to validate any referenced evidence before operational use.",
        "next_action": "Preserve references as summaries during downstream handoff.",
        "downstream_impact": "All conclusions remain limited to packet-quality classification.",
        "not_claimed": [
          "repository inspection",
          "command execution",
          "private material access",
          "external source validation",
          "source truth",
          "approval",
          "workflow execution"
        ]
      },
      {
        "provenance_id": "CP-REF-OD-17",
        "status": "unverified_summary_reference",
        "basis": "fixture-provided closure_evidence_ref",
        "source": "owner_decision_ref:OD-17-summary",
        "scope": [
          "AI-002"
        ],
        "owner_action": "Confirm reference applicability in the owning workflow.",
        "next_action": "Reindex and review before rerun.",
        "downstream_impact": "Reference alone does not close AI-002.",
        "not_claimed": "Underlying contents, authenticity, approval, and source truth are not claimed."
      },
      {
        "provenance_id": "CP-REF-TD-04",
        "status": "unverified_summary_reference",
        "basis": "fixture-provided closure_evidence_ref",
        "source": "trace_delta_ref:TD-04-summary",
        "scope": [
          "AI-004"
        ],
        "owner_action": "Confirm supersession disposition in the owning workflow.",
        "next_action": "Reconcile as a carry-forward item.",
        "downstream_impact": "Reference alone does not establish replacement identity or closure.",
        "not_claimed": "Underlying contents, authenticity, mapping, and source truth are not claimed."
      }
    ],
    "boundary_review_note": [
      {
        "note_id": "BRN-001",
        "status": "boundary_preserved",
        "basis": [
          "public-safe synthetic fixture only",
          "upstream packets are read-only",
          "closure evidence references require owning-workflow reindex",
          "rerun_ready is distinct from rerun_executed"
        ],
        "owner_action": "Keep approval, source validation, reindex, execution, and upstream mutation with their owning workflows or authorized owners.",
        "next_action": "Use downstream handoffs as requests, not as records of completed execution.",
        "downstream_impact": "This packet can support review coordination without expanding authority.",
        "not_claimed": [
          "repository access",
          "command execution",
          "upstream mutation",
          "evidence authenticity",
          "source truth",
          "approval",
          "rerun execution",
          "action closure",
          "workflow pass or fail"
        ]
      }
    ]
  },
  "downstream_handoff": [
    {
      "handoff_id": "DH-AI-001",
      "action_id": "AI-001",
      "route": "source_gap_followup_packet_v0",
      "status": "blocked_awaiting_input",
      "basis": "Official U1 datasheet is missing.",
      "owner_action": "Provide an official datasheet reference.",
      "next_action": "Create a source-gap follow-up packet and return its bounded result.",
      "downstream_impact": "Closure review remains paused.",
      "not_claimed": "Route execution or source acquisition."
    },
    {
      "handoff_id": "DH-AI-002",
      "action_id": "AI-002",
      "route": "verification_plan_from_page_contracts_v0",
      "status": "handoff_ready_for_reindex_request",
      "basis": "owner_decision_ref:OD-17-summary is available.",
      "owner_action": "Confirm the owning workflow may consume the reference.",
      "next_action": "Reindex, review, authorize, and then execute the applicable rerun.",
      "downstream_impact": "Rerun results are required before closure evaluation.",
      "not_claimed": "Reindex, review acceptance, rerun readiness, rerun execution, or closure."
    },
    {
      "handoff_id": "DH-AI-003",
      "action_id": "AI-003",
      "route": "owner_decision_request",
      "status": "awaiting_owner",
      "basis": "IF_PWR direction is ambiguous.",
      "owner_action": "Provide the direction decision.",
      "next_action": "Return a bounded decision reference to interface_control_and_harness_readiness_v0.",
      "downstream_impact": "Readiness remains blocked pending decision.",
      "not_claimed": "Decision outcome or approval."
    },
    {
      "handoff_id": "DH-AI-004",
      "action_id": "AI-004",
      "route": "carry_forward_only",
      "status": "registered_pending_owning_workflow_reconciliation",
      "basis": "Superseded item with trace_delta_ref:TD-04-summary.",
      "owner_action": "Confirm replacement or retirement disposition.",
      "next_action": "Reconcile without mutating the upstream review packet.",
      "downstream_impact": "Stale page identity remains tracked until reconciliation.",
      "not_claimed": "Trace validation, replacement identity, upstream mutation, or closure."
    }
  ],
  "boundary_review_note": {
    "status": "public_safe_contract_only_boundary_preserved",
    "basis": "Only the supplied workflow summary and synthetic fixture were used.",
    "read_only_upstream": true,
    "owner_action": "Retain execution, approval, evidence validation, reindex, and source-truth authority outside this packet.",
    "downstream_impact": "Handoffs identify required work but do not record it as performed.",
    "not_claimed": [
      "repository files read",
      "commands run",
      "private or raw material accessed",
      "upstream packets mutated",
      "evidence references validated",
      "source truth established",
      "owner approval granted",
      "reruns executed",
      "actions closed",
      "workflow pass or fail"
    ]
  },
  "completion_state": {
    "status": "quality_ready_packet_complete",
    "required_outputs_present": true,
    "required_output_count": 10,
    "execution_state": "not_executed",
    "approval_state": "not_claimed",
    "source_truth_state": "not_claimed",
    "upstream_mutation_state": "none",
    "closure_state": "no_action_claimed_closed",
    "rerun_state": "none_executed",
    "basis": "All required packet names and explicit boundary, blocker, provenance, owner-action, and handoff fields are represented from the synthetic fixture.",
    "not_claimed": [
      "operational completeness",
      "evidence authenticity",
      "source validation",
      "owning-workflow reindex",
      "rerun execution",
      "successful verification",
      "approval",
      "action closure",
      "workflow pass or fail"
    ]
  }
}
