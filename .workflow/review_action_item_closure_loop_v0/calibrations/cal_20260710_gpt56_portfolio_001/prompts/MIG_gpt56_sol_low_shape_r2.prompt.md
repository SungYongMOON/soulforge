Calibration replay metadata: candidate_id=MIG_gpt56_sol_low_shape_r2; model=gpt-5.6-sol; reasoning_effort=low.
Only candidate/profile metadata was transformed in the frozen public-safe candidate prompt below; task content and fixture remain unchanged.
--- TRANSFORMED FROZEN PUBLIC-SAFE CANDIDATE PROMPT ---
You are running a public-safe CLI-only calibration candidate for Soulforge workflow review_action_item_closure_loop_v0.
Profile metadata:
- candidate_id: MIG_gpt56_sol_low_shape_r2
- model: gpt-5.6-sol
- reasoning_effort: low
- species: dwarf
- class: auditor

Use only the workflow contract summary and synthetic fixture below. Do not read repository files, do not run commands, do not use private/raw/secret material, and do not claim execution, approval, source truth, or pass/fail results beyond this packet.

Workflow contract summary:
- Own only the outputs listed in fixture.required_outputs.
- Preserve read-only upstream boundaries.
- Make blockers, missing inputs, review-required states, provenance summaries, owner actions, downstream handoffs, and boundary notes explicit.
- Machine-readable JSON only. No markdown fence. No prose outside JSON.
- Top-level JSON keys required: candidate_id, workflow_id, profile, fixture_id, public_safe, packets, downstream_handoff, boundary_review_note, completion_state.
- packets must contain one property for each required output name. Use arrays of objects where rows are natural.
- Include stable ids, statuses, provenance or basis, owner action/next action, downstream impact, and not_claimed notes.
- completion_state must distinguish quality-ready packet completion from execution/approval/source-truth claims.

Synthetic public fixture JSON:
{
    "fixture_id":  "review_action_item_closure_loop_v0_public_synthetic_mixed_closure",
    "project_scope_key":  "public_closure_fixture",
    "public_safe":  true,
    "policy_notes":  [
                         "closure evidence ref does not replace owning workflow reindex",
                         "rerun_ready is not rerun_executed",
                         "do not mutate upstream packets"
                     ],
    "action_items":  [
                         {
                             "requested_route":  "source_gap_followup_packet_v0",
                             "source":  "review_gate_evidence_pack_v0",
                             "blocker":  "missing U1 official datasheet",
                             "closure_evidence_ref":  null,
                             "action_id":  "AI-001",
                             "status":  "open"
                         },
                         {
                             "requested_route":  "verification_plan_from_page_contracts_v0",
                             "source":  "verification_plan_from_page_contracts_v0",
                             "blocker":  "owner approved measurement tolerance",
                             "closure_evidence_ref":  "owner_decision_ref:OD-17-summary",
                             "action_id":  "AI-002",
                             "status":  "closure_evidence_supplied"
                         },
                         {
                             "requested_route":  "owner_decision_request",
                             "source":  "interface_control_and_harness_readiness_v0",
                             "blocker":  "IF_PWR direction ambiguous",
                             "closure_evidence_ref":  null,
                             "action_id":  "AI-003",
                             "status":  "waiting_owner"
                         },
                         {
                             "requested_route":  "carry_forward_only",
                             "source":  "review_gate_evidence_pack_v0",
                             "blocker":  "old page id page_003",
                             "closure_evidence_ref":  "trace_delta_ref:TD-04-summary",
                             "action_id":  "AI-004",
                             "status":  "superseded"
                         }
                     ],
    "required_outputs":  [
                             "action_closure_packet",
                             "action_closure_ledger",
                             "closure_status_matrix",
                             "unresolved_action_items",
                             "closure_ready_reruns",
                             "closure_blockers",
                             "carry_forward_register",
                             "owner_decision_request_queue",
                             "closure_provenance",
                             "boundary_review_note"
                         ],
    "source_mode":  "contract_only_synthetic"
}
