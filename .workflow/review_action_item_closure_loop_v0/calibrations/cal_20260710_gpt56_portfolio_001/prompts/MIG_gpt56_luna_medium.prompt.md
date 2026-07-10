You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: review_action_item_closure_loop_v0
kind: workflow
status: active
title: Review Action Item Closure Loop v0
summary: Track review action items, blocker closure evidence, rerun eligibility, and carry-forward state after review packets are held without approving decisions, mutating upstream packets, or pretending actions are closed before evidence exists.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - action_closure_project_binding
  - action_item_register_refs
  - review_blocker_refs
  - approved_action_closure_policy
optional_inputs:
  - decision_summary_refs
  - source_gap_followup_packet_refs
  - verification_plan_refs
  - interface_control_packet_refs
  - harness_trace_delta_refs
  - owner_decision_refs
  - closure_evidence_refs
outputs:
  - action_closure_packet
  - action_closure_ledger
  - closure_status_matrix
  - unresolved_action_items
  - closure_ready_reruns
  - closure_blockers
  - carry_forward_register
  - owner_decision_request_queue
  - closure_provenance
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - initial_closure_loop
  - rerun_update
  - action_status_refresh
status_values:
  - proposed
  - open
  - waiting_owner
  - waiting_workflow_rerun
  - closure_evidence_supplied
  - externally_closed_with_evidence
  - deferred
  - superseded
upstream_workflows:
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - action_item_register
      - review_blockers
      - decision_summary
      - readiness_summary
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - owner_followup_needed
      - verification_gap_register
      - trr_readiness_handoff
      - fca_svr_handoff_index
    status: optional_rerun_consumer
  - workflow_id: source_gap_followup_packet_v0
    expected_outputs:
      - owner_action_queue
      - retry_trigger_register
      - downstream_unblock_map
    status: optional_gap_route_consumer
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - compatibility_gap_report
      - source_gap_rerun_triggers
      - harness_input_delta
    status: optional_rerun_consumer
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - trace_gap_register
      - harness_trace_delta
    status: optional_trace_consumer
downstream_workflows:
  - workflow_id: source_gap_followup_packet_v0
    expected_input: closure_evidence_and_action_status_for_gap_refresh
    status: rerun_trigger_only
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: closure_status_that_changes_evidence_needs_or_readiness
    status: rerun_trigger_only
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: closure_status_and_updated_action_register
    status: rerun_trigger_only
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_input: closure_items_that_require_baseline_or_change_control
    status: planned
closure_contract:
  owns:
    - action_closure_row_identity
    - closure_status_tracking
    - closure_evidence_ref_index
    - rerun_readiness_routing
    - carry_forward_register
    - owner_decision_request_queue
  does_not_own:
    - source_xml_mutation
    - upstream_packet_repair
    - owner_decision_authority
    - action_item_auto_closure
    - review_gate_approval
    - verification_execution
  authority_boundary:
    closure_status_is_not_owner_decision: true
    closure_evidence_ref_does_not_replace_owning_workflow_reindex: true
    rerun_ready_is_not_rerun_executed: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow sits after review packets and before rerun or closure cycles.
  - It packages action status, closure evidence refs, blocker carry-forward, and rerun routes; it does not execute reruns or close items without evidence.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.
  - Public workflow files must not contain raw project payloads, source XML bodies, vendor text, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: review_action_item_closure_loop_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_closure_binding
    title: Prepare Closure Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_closure_binding_setup
    summary: Resolve the bounded private/project-local output root and confirm the loop is a downstream governance lane over read-only upstream artifacts.
  - step_id: curate_action_rows
    title: Curate Action Rows
    actor_slot: action_closure_curator
    action:
      kind: action_row_and_blocker_inventory
    summary: Convert action items, blockers, closure evidence refs, and owner decision requests into stable closure rows.
  - step_id: map_rerun_routes
    title: Map Rerun Routes
    actor_slot: rerun_route_mapper
    action:
      kind: rerun_and_carry_forward_mapping
    summary: Decide which items remain open, which are ready for rerun, and which stay deferred or waiting-owner.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: closure_bundle_write_and_boundary_review
    summary: Write the closure packet bundle and confirm the workflow did not mutate upstream artifacts or overclaim closure.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
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


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
