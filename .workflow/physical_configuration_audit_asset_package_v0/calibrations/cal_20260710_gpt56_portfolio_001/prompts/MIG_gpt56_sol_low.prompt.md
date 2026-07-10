You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: physical_configuration_audit_asset_package_v0
kind: workflow
status: active
title: Physical Configuration Audit Asset Package v0
summary: Verify that an artifact package matches the declared physical/configuration baseline using checksums, attachment records, source refs, and release-candidate package inventory without judging functional adequacy or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - physical_audit_project_binding
  - baseline_manifest_refs
  - approved_physical_audit_policy
optional_inputs:
  - configuration_baseline_packet_refs
  - trace_matrix_refs
  - source_packet_refs
  - mdd_patch_refs
  - harness_packet_refs
  - release_candidate_inventory_refs
  - owner_decision_refs
outputs:
  - physical_audit_packet
  - artifact_inventory_report
  - checksum_report
  - missing_or_mismatched_artifacts
  - release_blocking_discrepancies
  - owner_followup_needed
  - closure_handoff
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
upstream_workflows:
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_outputs:
      - configuration_baseline_packet
      - baseline_inventory
      - change_request_register
      - impact_matrix
      - baseline_gap_register
    status: optional_but_recommended
  - workflow_id: asset_patch_attach_mdd_v0
    expected_outputs:
      - asset_identity_updated
      - pcb_pairing_placeholder_updated
      - asset_patch_record
      - provenance_update
    status: optional_mdd_attachment_input
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - trace_matrix
      - evidence_authority_map
    status: optional_trace_input
downstream_workflows:
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_input: discrepancy_and_followup_routes
    status: rerun_trigger_only
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: physical_audit_summary_and_release_blockers
    status: later_review_consumer
physical_audit_contract:
  owns:
    - audit_scope_identity
    - artifact_inventory_rows
    - checksum_and_presence_checks
    - mismatch_and_release_blocker_register
    - closure_handoff
  does_not_own:
    - baseline_approval
    - functional_acceptance
    - upstream_packet_mutation
  authority_boundary:
    physical_audit_is_not_functional_acceptance: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is a PCA-style governance consumer. It checks package alignment to a declared configuration baseline, not whether the system function is adequate.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: physical_configuration_audit_asset_package_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_audit_binding
    title: Prepare Audit Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_physical_audit_binding_setup
    summary: Resolve bounded audit scope and output root.
  - step_id: inventory_artifact_rows
    title: Inventory Artifact Rows
    actor_slot: inventory_curator
    action:
      kind: artifact_inventory_and_checksum_inventory
    summary: Inventory baseline/package rows and checksum refs without mutating upstream artifacts.
  - step_id: map_discrepancies
    title: Map Discrepancies
    actor_slot: discrepancy_router
    action:
      kind: release_blocker_and_followup_mapping
    summary: Separate missing/mismatched artifacts and release blockers from non-blocking observations.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: physical_audit_bundle_write_and_boundary_review
    summary: Confirm no baseline or acceptance overclaim before publication.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "physical_configuration_audit_asset_package_v0",
  "fixture_id": "PUBLIC_SYNTH_PHYSICAL_CONFIGURATION_AUDIT_ASSET_PACKAGE_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Physical Configuration Audit Asset Package v0",
  "workflow_summary": "Verify that an artifact package matches the declared physical/configuration baseline using checksums, attachment records, source refs, and release-candidate package inventory without judging functional adequacy or mutating upstream artifacts.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "physical_audit_project_binding",
    "baseline_manifest_refs",
    "approved_physical_audit_policy"
  ],
  "expected_output_groups": [
    "physical_audit_packet",
    "artifact_inventory_report",
    "checksum_report",
    "missing_or_mismatched_artifacts",
    "release_blocking_discrepancies",
    "owner_followup_needed",
    "closure_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "baseline",
    "checksum",
    "discrepancy",
    "boundary",
    "no functional claim"
  ],
  "scenario_facts": [
    "one checksum match",
    "one missing artifact",
    "one release-blocking discrepancy"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
