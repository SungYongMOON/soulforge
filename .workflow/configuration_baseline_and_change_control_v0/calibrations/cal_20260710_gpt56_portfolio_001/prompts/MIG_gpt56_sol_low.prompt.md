You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: configuration_baseline_and_change_control_v0
kind: workflow
status: active
title: Configuration Baseline And Change Control v0
summary: Inventory baseline refs, track change requests, and route reruns or carry-forward actions for baseline-affecting changes without approving baselines or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - baseline_change_control_binding
  - baseline_scope_refs
  - approved_change_control_policy
optional_inputs:
  - review_gate_packet_refs
  - verification_plan_refs
  - trace_matrix_refs
  - closure_status_refs
  - owner_decision_refs
outputs:
  - configuration_baseline_packet
  - baseline_inventory
  - change_request_register
  - impact_matrix
  - baseline_gap_register
  - rerun_routing
  - owner_followup_needed
  - closure_handoff
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - review_gate_packet
      - action_item_register
      - decision_summary
    status: optional_review_input
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - verification_plan
      - trr_readiness_handoff
      - fca_svr_handoff_index
    status: optional_verification_input
  - workflow_id: review_action_item_closure_loop_v0
    expected_outputs:
      - action_closure_ledger
      - closure_status_matrix
      - carry_forward_register
    status: optional_closure_input
downstream_workflows:
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: updated_baseline_refs_and_change_control_actions
    status: rerun_trigger_only
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: baseline_changes_that_affect_methods_or_readiness
    status: rerun_trigger_only
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: baseline_inventory_and_change_request_register
    status: planned
change_control_contract:
  owns:
    - baseline_scope_inventory
    - change_request_identity
    - impact_routing
    - rerun_routing
    - closure_handoff
  does_not_own:
    - baseline_approval
    - upstream_packet_mutation
    - verification_result_acceptance
  authority_boundary:
    baseline_packet_is_not_baseline_approval: true
    change_request_register_is_not_change_approval: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is a governance lane for baseline inventory and change routing, not a tool for silently editing upstream artifacts.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: configuration_baseline_and_change_control_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_baseline_binding
    title: Prepare Baseline Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_baseline_binding_setup
    summary: Resolve the bounded baseline scope and output root.
  - step_id: inventory_baselines_and_changes
    title: Inventory Baselines And Changes
    actor_slot: baseline_inventory_curator
    action:
      kind: baseline_ref_and_change_request_inventory
    summary: Inventory baseline refs, checksum/version state, and change-request rows.
  - step_id: map_impacts_and_reruns
    title: Map Impacts And Reruns
    actor_slot: impact_router
    action:
      kind: change_impact_and_rerun_route_mapping
    summary: Route each baseline gap or change request to the narrowest downstream consumer.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: baseline_bundle_write_and_boundary_review
    summary: Confirm no baseline approval or upstream mutation overclaim before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
    "fixture_id":  "configuration_baseline_and_change_control_v0_public_synthetic_baseline_delta",
    "project_scope_key":  "public_baseline_fixture",
    "change_requests":  [
                            {
                                "affected_refs":  [
                                                      "BL-REQ-001"
                                                  ],
                                "change_id":  "CR-001",
                                "source":  "review_action_item_closure_loop_v0",
                                "evidence_ref":  "owner_decision_ref:OD-17-summary",
                                "change_type":  "measurement_tolerance_update",
                                "approval_state":  "not_approved_here"
                            },
                            {
                                "affected_refs":  [
                                                      "BL-PAGE-007"
                                                  ],
                                "change_id":  "CR-002",
                                "source":  "page_module_trace_matrix_v0",
                                "evidence_ref":  "trace_delta_ref:TD-04-summary",
                                "change_type":  "page_identity_refresh",
                                "approval_state":  "not_approved_here"
                            },
                            {
                                "affected_refs":  [
                                                      "BL-HARNESS-002"
                                                  ],
                                "change_id":  "CR-003",
                                "source":  "interface_control_and_harness_readiness_v0",
                                "evidence_ref":  null,
                                "change_type":  "interface_direction_pending",
                                "approval_state":  "owner_waiting"
                            }
                        ],
    "public_safe":  true,
    "required_outputs":  [
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
    "baseline_refs":  [
                          {
                              "checksum_state":  "present_public_prefix_only",
                              "approval_state":  "reference_only",
                              "baseline_id":  "BL-REQ-001",
                              "artifact_ref":  "requirements_packet_summary",
                              "version":  "v0.3"
                          },
                          {
                              "checksum_state":  "missing",
                              "approval_state":  "draft",
                              "baseline_id":  "BL-PAGE-007",
                              "artifact_ref":  "page_module_spec_summary",
                              "version":  "v0.2"
                          },
                          {
                              "checksum_state":  "present_public_prefix_only",
                              "approval_state":  "review_required",
                              "baseline_id":  "BL-HARNESS-002",
                              "artifact_ref":  "harness_trace_delta_summary",
                              "version":  "v0.1"
                          }
                      ],
    "source_mode":  "contract_only_synthetic"
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
