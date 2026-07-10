You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: test_harness_asset_planning_v0
kind: workflow
status: active
title: Test Harness Asset Planning v0
summary: Plan the physical, simulation, or software test-harness assets needed to verify page modules and composed harness candidates without executing tests, approving TRR, or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - test_harness_planning_binding
  - verification_readiness_refs
  - approved_test_harness_planning_policy
optional_inputs:
  - page_module_spec_refs
  - harness_packet_refs
  - source_packet_refs
  - simulation_source_packet_refs
  - simulation_deck_prepare_packet_refs
  - layout_guide_packet_refs
  - interface_control_packet_refs
  - available_instrument_or_fixture_refs
  - owner_decision_refs
outputs:
  - test_harness_manifest
  - test_interface_list
  - simulation_fixture_needs
  - instrumentation_resource_list
  - trr_readiness_checklist
  - planning_blockers
  - owner_followup_needed
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - test_or_simulation_readiness
      - trr_readiness_handoff
      - verification_requirements_matrix
      - owner_followup_needed
  - workflow_id: simulation_source_collect_v0
    expected_outputs:
      - simulation_source_packet
      - model_inventory
      - downstream_handoff
    status: optional_simulation_input
  - workflow_id: simulation_deck_prepare_v0
    expected_outputs:
      - simulation_deck_packet
      - unresolved_deck_inputs
      - deck_prepare_blockers
    status: optional_simulation_input
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - harness_readiness_matrix
      - compatibility_gap_report
    status: optional_interface_scope_input
downstream_workflows:
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: harness_asset_plan_or_blocker_refresh
    status: rerun_trigger_only
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: trr_preparation_asset_plan_summary
    status: later_review_consumer
test_harness_contract:
  owns:
    - planned_test_harness_asset_identity
    - test_interface_inventory
    - simulation_fixture_needs
    - instrumentation_resource_list
    - trr_readiness_checklist
    - planning_blockers
    - owner_followup_for_missing_resources
  does_not_own:
    - test_execution
    - simulation_execution
    - trr_approval
    - verification_result_acceptance
    - upstream_packet_mutation
  authority_boundary:
    plan_is_not_execution: true
    trr_checklist_is_not_trr_approval: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow plans harness assets and readiness only. It does not run tests or simulations and does not approve readiness by itself.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: test_harness_asset_planning_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_planning_binding
    title: Prepare Planning Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_test_harness_binding_setup
    summary: Resolve bounded planning scope and output root.
  - step_id: curate_asset_needs
    title: Curate Asset Needs
    actor_slot: harness_asset_curator
    action:
      kind: fixture_interface_instrument_inventory
    summary: Inventory what the representative verification items would need for test or simulation harness preparation.
  - step_id: map_readiness_and_blockers
    title: Map Readiness And Blockers
    actor_slot: readiness_planner
    action:
      kind: trr_checklist_and_blocker_mapping
    summary: Build TRR-style readiness checklist rows and planning blockers without claiming readiness approval.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: harness_asset_bundle_write_and_boundary_review
    summary: Confirm no execution or approval overclaim before publishing the packet.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "test_harness_asset_planning_v0",
  "fixture_id": "PUBLIC_SYNTH_TEST_HARNESS_ASSET_PLANNING_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Test Harness Asset Planning v0",
  "workflow_summary": "Plan the physical, simulation, or software test-harness assets needed to verify page modules and composed harness candidates without executing tests, approving TRR, or mutating upstream artifacts.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "test_harness_planning_binding",
    "verification_readiness_refs",
    "approved_test_harness_planning_policy"
  ],
  "expected_output_groups": [
    "test_harness_manifest",
    "test_interface_list",
    "simulation_fixture_needs",
    "instrumentation_resource_list",
    "trr_readiness_checklist",
    "planning_blockers",
    "owner_followup_needed",
    "boundary_review_note"
  ],
  "must_preserve": [
    "planning only",
    "readiness",
    "blocker",
    "boundary",
    "no execution claim"
  ],
  "scenario_facts": [
    "one physical fixture need",
    "one simulation harness need",
    "one planning blocker",
    "one owner follow-up item"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
