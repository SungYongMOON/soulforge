You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: accepted_verification_result_packet_v0
kind: workflow
status: active
title: Accepted Verification Result Packet v0
summary: Record accepted verification results, scoped evidence refs, pass/fail or inconclusive verdicts, and acceptance boundaries for later FCA/SVR-style consumers without mutating upstream planning or source packets.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - verification_result_scope_refs
  - result_artifact_refs
  - approved_result_acceptance_policy
optional_inputs:
  - verification_plan_refs
  - trace_matrix_refs
  - owner_decision_refs
outputs:
  - accepted_verification_result_packet
  - result_summary
  - accepted_result_rows
  - blocked_or_inconclusive_rows
  - acceptance_provenance
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - verification_requirements_matrix
      - fca_svr_handoff_index
    status: optional_scope_alignment
  - workflow_id: simulation_run_verify_v0
    expected_outputs:
      - simulation_run_packet
      - result_verdicts
      - measurement_results
    status: optional_execution_input
downstream_workflows:
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: accepted_result_rows_and_result_summary
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: accepted_result_summary_for_later_review
accepted_result_contract:
  owns:
    - result_scope_identity
    - accepted_result_row_identity
    - acceptance_provenance
    - result_summary
  does_not_own:
    - execution_artifact_mutation
    - owner_acceptance_beyond_scope
    - source_authority_replacement
  authority_boundary:
    result_packet_requires_scoped_acceptance_basis: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is the handoff point between execution packets and later audit consumers.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.
  - The first private pilot exercised the blocked-or-inconclusive path only; no accepted result rows were claimed without scoped acceptance basis.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: accepted_verification_result_packet_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_result_binding
    title: Prepare Result Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_result_binding_setup
    summary: Resolve bounded result scope and output root.
  - step_id: curate_result_rows
    title: Curate Result Rows
    actor_slot: result_curator
    action:
      kind: result_and_verdict_inventory
    summary: Inventory result refs, verdicts, and acceptance basis without mutating upstream artifacts.
  - step_id: map_acceptance_rows
    title: Map Acceptance Rows
    actor_slot: acceptance_mapper
    action:
      kind: accepted_vs_blocked_row_split
    summary: Separate accepted result rows from blocked or inconclusive rows.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: result_packet_write_and_boundary_review
    summary: Confirm no overclaim of owner acceptance or upstream mutation before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "approved_result_acceptance_policy": "Accept only rows with scoped result artifact and acceptance basis; blocked or inconclusive rows remain explicit.",
  "expected_output_groups": [
    "accepted_verification_result_packet",
    "result_summary",
    "accepted_result_rows",
    "blocked_or_inconclusive_rows",
    "acceptance_provenance",
    "boundary_review_note"
  ],
  "fixture_id": "PUBLIC_SYNTH_ACCEPTED_VERIFICATION_RESULT",
  "public_safe": true,
  "result_artifact_refs": [
    {
      "acceptance": "accepted",
      "basis": "public synthetic smoke log ref",
      "id": "VR-001",
      "verdict": "pass"
    },
    {
      "acceptance": "blocked",
      "basis": "missing measurement artifact",
      "id": "VR-002",
      "verdict": "inconclusive"
    }
  ],
  "source_kind": "synthetic_from_workflow_contract",
  "verification_plan_refs": [
    "plan:interface-contract-v0"
  ],
  "verification_result_scope_refs": [
    "scope:interface-smoke-public"
  ],
  "workflow_id": "accepted_verification_result_packet_v0"
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
