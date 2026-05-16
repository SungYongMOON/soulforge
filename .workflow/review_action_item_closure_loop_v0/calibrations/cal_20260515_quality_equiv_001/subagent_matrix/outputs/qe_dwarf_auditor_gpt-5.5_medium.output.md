{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_medium",
  "workflow_id": "review_action_item_closure_loop_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "medium",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
  "public_safe": true,
  "packets": {
    "action_closure_packet": [
      {
        "stable_id": "ACP-AI-001",
        "action_id": "AI-001",
        "status": "open",
        "requested_route": "source_gap_followup_packet_v0",
        "blocker": "missing U1 official datasheet",
        "closure_evidence_ref": null,
        "basis": "synthetic fixture action_items row AI-001",
        "owner_action": "supply official U1 datasheet through the owning source-gap follow-up route",
        "downstream_impact": "review item remains unresolved; no rerun readiness can be asserted",
        "not_claimed": "no datasheet retrieval, source truth validation, upstream packet mutation, approval, or execution claimed"
      },
      {
        "stable_id": "ACP-AI-002",
        "action_id": "AI-002",
        "status": "closure_evidence_supplied",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "blocker": "owner approved measurement tolerance",
        "closure_evidence_ref": "owner_decision_ref:OD-17-summary",
        "basis": "synthetic fixture action_items row AI-002",
        "owner_action": "owning workflow should reindex or consume supplied owner decision evidence before rerun",
        "downstream_impact": "candidate for rerun readiness after owning workflow accepts evidence",
        "not_claimed": "rerun_ready is not rerun_executed; supplied evidence is not treated as source truth or final approval"
      },
      {
        "stable_id": "ACP-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner",
        "requested_route": "owner_decision_request",
        "blocker": "IF_PWR direction ambiguous",
        "closure_evidence_ref": null,
        "basis": "synthetic fixture action_items row AI-003",
        "owner_action": "owner must decide IF_PWR direction",
        "downstream_impact": "dependent interface readiness remains review-required and blocked",
        "not_claimed": "no owner decision, design correction, approval, or execution claimed"
      },
      {
        "stable_id": "ACP-AI-004",
        "action_id": "AI-004",
        "status": "superseded",
        "requested_route": "carry_forward_only",
        "blocker": "old page id page_003",
        "closure_evidence_ref": "trace_delta_ref:TD-04-summary",
        "basis": "synthetic fixture action_items row AI-004",
        "owner_action": "carry forward trace delta reference without mutating upstream packet",
        "downstream_impact": "preserve supersession context for downstream review continuity",
        "not_claimed": "trace delta reference does not replace owning workflow reindex or source truth"
      }
    ],
    "action_closure_ledger": [
      {
        "stable_id": "ACL-001",
        "action_id": "AI-001",
        "ledger_status": "unresolved_blocked",
        "basis": "status open with no closure_evidence_ref",
        "next_action": "route to source_gap_followup_packet_v0",
        "downstream_impact": "block closure and rerun readiness",
        "not_claimed": "not closed"
      },
      {
        "stable_id": "ACL-002",
        "action_id": "AI-002",
        "ledger_status": "evidence_supplied_review_required",
        "basis": "status closure_evidence_supplied with owner_decision_ref:OD-17-summary",
        "next_action": "owning verification workflow reviews and reindexes evidence",
        "downstream_impact": "may become rerun-ready after owner workflow acceptance",
        "not_claimed": "not executed or approved"
      },
      {
        "stable_id": "ACL-003",
        "action_id": "AI-003",
        "ledger_status": "owner_decision_required",
        "basis": "status waiting_owner with no closure_evidence_ref",
        "next_action": "queue owner decision request",
        "downstream_impact": "interface readiness remains blocked",
        "not_claimed": "no decision supplied"
      },
      {
        "stable_id": "ACL-004",
        "action_id": "AI-004",
        "ledger_status": "carry_forward_superseded",
        "basis": "status superseded with trace_delta_ref:TD-04-summary",
        "next_action": "record in carry-forward register",
        "downstream_impact": "maintain traceability for superseded page id",
        "not_claimed": "not active closure evidence"
      }
    ],
    "closure_status_matrix": [
      {
        "stable_id": "CSM-OPEN",
        "status_group": "open",
        "action_ids": [
          "AI-001"
        ],
        "count": 1,
        "basis": "fixture status open",
        "next_action": "resolve missing source input",
        "downstream_impact": "blocks closure"
      },
      {
        "stable_id": "CSM-EVIDENCE",
        "status_group": "closure_evidence_supplied",
        "action_ids": [
          "AI-002"
        ],
        "count": 1,
        "basis": "fixture status closure_evidence_supplied",
        "next_action": "owning workflow review before rerun",
        "downstream_impact": "review-required rerun candidate"
      },
      {
        "stable_id": "CSM-WAITING",
        "status_group": "waiting_owner",
        "action_ids": [
          "AI-003"
        ],
        "count": 1,
        "basis": "fixture status waiting_owner",
        "next_action": "owner decision required",
        "downstream_impact": "blocks dependent closure"
      },
      {
        "stable_id": "CSM-SUPERSEDED",
        "status_group": "superseded",
        "action_ids": [
          "AI-004"
        ],
        "count": 1,
        "basis": "fixture status superseded",
        "next_action": "carry forward only",
        "downstream_impact": "traceability retained without active rerun"
      }
    ],
    "unresolved_action_items": [
      {
        "stable_id": "UAI-AI-001",
        "action_id": "AI-001",
        "status": "open",
        "blocker": "missing U1 official datasheet",
        "basis": "no closure_evidence_ref supplied",
        "owner_action": "provide official datasheet through source_gap_followup_packet_v0",
        "downstream_impact": "closure and rerun readiness blocked",
        "not_claimed": "not resolved"
      },
      {
        "stable_id": "UAI-AI-003",
        "action_id": "AI-003",
        "status": "waiting_owner",
        "blocker": "IF_PWR direction ambiguous",
        "basis": "owner decision absent",
        "owner_action": "decide IF_PWR direction",
        "downstream_impact": "interface readiness remains review-required",
        "not_claimed": "no decision made"
      }
    ],
    "closure_ready_reruns": [
      {
        "stable_id": "CRR-AI-002",
        "action_id": "AI-002",
        "status": "review_required_before_rerun_ready",
        "requested_route": "verification_plan_from_page_contracts_v0",
        "closure_evidence_ref": "owner_decision_ref:OD-17-summary",
        "basis": "closure evidence supplied in fixture",
        "owner_action": "owning workflow must accept or reindex evidence before rerun",
        "downstream_impact": "potential rerun candidate after review",
        "not_claimed": "rerun_ready is not rerun_executed; this packet does not claim acceptance"
      }
    ],
    "closure_blockers": [
      {
        "stable_id": "CB-AI-001",
        "action_id": "AI-001",
        "blocker": "missing U1 official datasheet",
        "blocker_type": "missing_source_input",
        "basis": "fixture blocker and null closure_evidence_ref",
        "owner_action": "supply official datasheet",
        "downstream_impact": "blocks source-gap closure",
        "not_claimed": "no source material inspected"
      },
      {
        "stable_id": "CB-AI-003",
        "action_id": "AI-003",
        "blocker": "IF_PWR direction ambiguous",
        "blocker_type": "owner_decision_missing",
        "basis": "fixture waiting_owner status",
        "owner_action": "provide IF_PWR direction decision",
        "downstream_impact": "blocks interface readiness closure",
        "not_claimed": "no design decision made"
      }
    ],
    "carry_forward_register": [
      {
        "stable_id": "CFR-AI-004",
        "action_id": "AI-004",
        "status": "superseded",
        "carry_forward_reason": "old page id page_003",
        "closure_evidence_ref": "trace_delta_ref:TD-04-summary",
        "basis": "fixture requested_route carry_forward_only",
        "owner_action": "preserve reference for downstream continuity",
        "downstream_impact": "supports later trace review without reopening superseded item",
        "not_claimed": "does not mutate upstream packets or replace owning workflow reindex"
      }
    ],
    "owner_decision_request_queue": [
      {
        "stable_id": "ODRQ-AI-003",
        "action_id": "AI-003",
        "request_status": "queued",
        "decision_needed": "IF_PWR direction",
        "basis": "fixture requested_route owner_decision_request and status waiting_owner",
        "owner_action": "issue explicit IF_PWR direction decision",
        "downstream_impact": "needed before interface control and harness readiness closure",
        "not_claimed": "decision not supplied in this packet"
      }
    ],
    "closure_provenance": [
      {
        "stable_id": "CP-001",
        "source_mode": "contract_only_synthetic",
        "fixture_id": "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
        "project_scope_key": "public_closure_fixture",
        "basis": "workflow contract summary and synthetic fixture only",
        "policy_notes_observed": [
          "closure evidence ref does not replace owning workflow reindex",
          "rerun_ready is not rerun_executed",
          "do not mutate upstream packets"
        ],
        "not_claimed": "no repository read, command execution, private material use, raw source access, approval, pass/fail result, or source truth claim"
      }
    ],
    "boundary_review_note": [
      {
        "stable_id": "BRN-001",
        "boundary_status": "public_safe_contract_only",
        "basis": "fixture public_safe true and source_mode contract_only_synthetic",
        "read_only_upstream_boundaries": [
          "review_gate_evidence_pack_v0",
          "verification_plan_from_page_contracts_v0",
          "interface_control_and_harness_readiness_v0"
        ],
        "owner_action": "upstream owners retain responsibility for reindex, acceptance, execution, and approval",
        "downstream_impact": "handoff packets identify blockers and review-required states without altering source packets",
        "not_claimed": "no upstream mutation, execution, source truth, approval, or pass/fail claim"
      }
    ]
  },
  "downstream_handoff": {
    "stable_id": "DH-001",
    "handoff_status": "quality_ready_packet_only",
    "routes": [
      {
        "route": "source_gap_followup_packet_v0",
        "action_ids": [
          "AI-001"
        ],
        "handoff_need": "missing official U1 datasheet"
      },
      {
        "route": "verification_plan_from_page_contracts_v0",
        "action_ids": [
          "AI-002"
        ],
        "handoff_need": "review supplied owner decision evidence before rerun readiness"
      },
      {
        "route": "owner_decision_request",
        "action_ids": [
          "AI-003"
        ],
        "handoff_need": "owner decision for IF_PWR direction"
      },
      {
        "route": "carry_forward_only",
        "action_ids": [
          "AI-004"
        ],
        "handoff_need": "retain superseded trace delta reference"
      }
    ],
    "not_claimed": "handoff is not execution, approval, or upstream source mutation"
  },
  "boundary_review_note": {
    "stable_id": "TOP-BRN-001",
    "status": "boundary_preserved",
    "basis": "workflow contract summary and synthetic public fixture only",
    "public_safe": true,
    "notes": [
      "owned only fixture.required_outputs",
      "preserved read-only upstream boundaries",
      "made blockers, missing inputs, review-required states, provenance, owner actions, downstream handoffs, and boundary notes explicit"
    ],
    "not_claimed": "no repository files read, commands run, private/raw/secret material used, execution performed, approval granted, source truth established, or pass/fail result asserted"
  },
  "completion_state": {
    "stable_id": "CS-001",
    "packet_completion": "quality_ready",
    "required_outputs_present": true,
    "execution_state": "not_executed",
    "approval_state": "not_approved",
    "source_truth_state": "not_claimed",
    "rerun_state": "not_executed",
    "basis": "all required output names represented under packets using only the synthetic fixture and workflow contract summary",
    "not_claimed": "quality-ready packet completion only; no external validation, repository inspection, owner approval, workflow execution, or pass/fail result claimed"
  }
}