You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: functional_configuration_audit_page_library_v0
kind: workflow
status: active
title: Functional Configuration Audit Page Library v0
summary: Audit whether configured page modules and harness compositions satisfy declared functional or performance claims using accepted verification evidence and controlled baseline context, without approving acceptance or mutating upstream artifacts.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - functional_audit_project_binding
  - audit_scope_refs
  - approved_audit_policy
optional_inputs:
  - configuration_baseline_packet_refs
  - trace_matrix_refs
  - verification_result_refs
  - verification_plan_refs
  - harness_packet_refs
  - source_packet_refs
  - action_closure_refs
  - owner_decision_refs
outputs:
  - functional_audit_packet
  - verified_claim_register
  - unverified_claim_register
  - discrepancy_register
  - residual_risk_register
  - audit_readiness
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
      - rerun_routing
    status: optional_but_recommended
  - workflow_id: page_module_trace_matrix_v0
    expected_outputs:
      - trace_matrix
      - evidence_authority_map
      - trace_gap_register
    status: required_for_traceable_claim_audit
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - fca_svr_handoff_index
      - verification_requirements_matrix
    status: optional_planning_input
  - workflow_id: review_action_item_closure_loop_v0
    expected_outputs:
      - action_closure_ledger
      - closure_status_matrix
      - carry_forward_register
    status: optional_closure_context
downstream_workflows:
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: functional_audit_summary_and_discrepancy_refs
    status: later_review_consumer
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_input: discrepancy_and_residual_risk_change_routes
    status: rerun_trigger_only
functional_audit_contract:
  owns:
    - audit_scope_identity
    - claim_to_evidence_audit_rows
    - verified_vs_unverified_claim_split
    - discrepancy_register
    - residual_risk_register
    - closure_handoff_for_followup
  does_not_own:
    - verification_execution
    - result_acceptance
    - baseline_approval
    - owner_acceptance
    - upstream_packet_mutation
  authority_boundary:
    audit_packet_is_not_acceptance: true
    verified_claim_register_is_not_owner_signoff: true
    unverified_claims_remain_first_class: true
    upstream_artifacts_are_read_only: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is an FCA/SVR-style governance consumer. It audits claims against accepted evidence and known gaps; it does not itself accept the system or close discrepancies.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: functional_configuration_audit_page_library_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_audit_binding
    title: Prepare Audit Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_functional_audit_binding_setup
    summary: Resolve the bounded audit scope and output root.
  - step_id: curate_claim_rows
    title: Curate Claim Rows
    actor_slot: claim_audit_curator
    action:
      kind: claim_and_evidence_inventory
    summary: Inventory claims, accepted-evidence refs, and unresolved gaps without mutating upstream packets.
  - step_id: split_verified_unverified_discrepant
    title: Split Verified Unverified Discrepant
    actor_slot: discrepancy_router
    action:
      kind: functional_audit_split_and_followup_mapping
    summary: Separate verified, unverified, discrepancy, and residual-risk rows and map closure routes.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: audit_bundle_write_and_boundary_review
    summary: Confirm no acceptance or upstream mutation overclaim before publishing the audit packet.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "functional_configuration_audit_page_library_v0",
  "fixture_id": "PUBLIC_SYNTH_FUNCTIONAL_CONFIGURATION_AUDIT_PAGE_LIBRARY_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Functional Configuration Audit Page Library v0",
  "workflow_summary": "Audit whether configured page modules and harness compositions satisfy declared functional or performance claims using accepted verification evidence and controlled baseline context, without approving acceptance or mutating upstream artifacts.",
  "workflow_readiness_label": "pilot-executed",
  "input_refs": [
    "functional_audit_project_binding",
    "audit_scope_refs",
    "approved_audit_policy"
  ],
  "expected_output_groups": [
    "functional_audit_packet",
    "verified_claim_register",
    "unverified_claim_register",
    "discrepancy_register",
    "residual_risk_register",
    "audit_readiness",
    "closure_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "accepted evidence",
    "discrepancy",
    "residual risk",
    "no acceptance claim",
    "boundary"
  ],
  "scenario_facts": [
    "one verified claim",
    "one unverified claim",
    "one discrepancy with residual risk"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
