You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: test_evaluation_execution_result_ingest_v0
kind: workflow
status: active
title: Test Evaluation Execution Result Ingest v0
summary: General TRR/DT-to-FCA/OT execution and result-ingest workflow for packaging non-simulation-specific test, evaluation, inspection, analysis, and demonstration result evidence without claiming acceptance.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
history: history/
calibrations: calibrations/
inputs:
  - test_evaluation_execution_binding
  - verification_execution_scope_refs
  - approved_test_evaluation_execution_policy
optional_inputs:
  - verification_plan_refs
  - trr_readiness_handoff_refs
  - fca_svr_handoff_index_refs
  - test_harness_asset_plan_refs
  - configuration_baseline_refs
  - procedure_refs
  - fixture_or_instrument_refs
  - tool_or_environment_policy_refs
  - simulation_run_packet_refs
  - review_gate_packet_refs
  - source_gap_followup_packet_refs
  - owner_decision_refs
  - deviation_or_waiver_refs
outputs:
  - execution_run_packet
  - execution_result_register
  - result_verdicts
  - run_blockers
  - owner_followup_needed
  - downstream_handoff
  - boundary_review_note
validation_level: registered_contract_private_evidence
registration_policy: owner_requested_registration
workflow_modes:
  - execute_or_block
  - result_only_ingest
  - rerun_update
method_values:
  - inspection
  - analysis
  - physical_test
  - software_test
  - demonstration
  - operational_evaluation_support
  - simulation_result_ref
  - not_ready
candidate_verdict_values:
  - pass
  - fail
  - inconclusive
  - blocked
  - not_executed
  - not_observed
acceptance_state_values:
  - not_accepted
  - acceptance_basis_required
  - owner_review_required
  - downstream_acceptance_packet_required
registration_evidence_summary:
  posture: contract_only_registered_from_reviewed_public_safe_draft
  supported_claims:
    - execution_result_ref_inventory_shape
    - candidate_verdict_row_shape
    - blocked_inconclusive_not_executed_row_shape
    - downstream_acceptance_review_handoff_shape
  unsupported_claims:
    - accepted_verification_result
    - owner_acceptance
    - trr_dt_fca_ot_pca_approval
    - usable
    - production_ready
    - profile_optimized
upstream_workflows:
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - verification_requirements_matrix
      - test_or_simulation_readiness
      - trr_readiness_handoff
      - fca_svr_handoff_index
    status: primary_planning_input
  - workflow_id: test_harness_asset_planning_v0
    expected_outputs:
      - test_harness_manifest
      - test_interface_list
      - instrumentation_resource_list
      - trr_readiness_checklist
      - planning_blockers
    status: optional_readiness_input
  - workflow_id: simulation_run_verify_v0
    expected_outputs:
      - simulation_run_packet
      - measurement_results
      - result_verdicts
      - run_blockers
    status: optional_simulation_result_ref_only
  - workflow_id: review_gate_evidence_pack_v0
    expected_outputs:
      - review_packet
      - entrance_criteria_checklist
      - review_blockers
      - action_item_register
    status: optional_trr_or_execution_authorization_context
  - workflow_id: configuration_baseline_and_change_control_v0
    expected_outputs:
      - configuration_baseline_packet
      - baseline_inventory
      - change_request_register
      - baseline_gap_register
    status: optional_but_recommended
downstream_workflows:
  - workflow_id: accepted_verification_result_packet_v0
    expected_input: execution_result_register_and_acceptance_basis_refs
    status: required_before_any_accepted_result_claim
  - workflow_id: functional_configuration_audit_page_library_v0
    expected_input: accepted_verification_result_packet_refs_not_candidate_verdicts
    status: later_consumer_after_acceptance_packet
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: execution_result_summary_blockers_and_candidate_verdicts
    status: later_review_consumer
  - workflow_id: owner_decision_packet_v0
    expected_input: owner_review_required_rows_and_acceptance_basis_questions
    status: optional_decision_consumer
  - workflow_id: source_gap_followup_packet_v0
    expected_input: source_or_evidence_gaps_discovered_during_execution_ingest
    status: rerun_trigger_only
  - workflow_id: physical_configuration_audit_asset_package_v0
    expected_input: artifact_inventory_or_package_discrepancy_refs_only
    status: optional_context_not_functional_acceptance
execution_result_contract:
  owns:
    - execution_scope_identity
    - execution_or_block_decision
    - execution_metadata_refs
    - result_evidence_inventory
    - candidate_verdict_rows
    - blocked_inconclusive_or_not_executed_rows
    - downstream_acceptance_handoff
    - boundary_review_for_non_acceptance
  does_not_own:
    - verification_plan_authoring
    - harness_asset_planning
    - simulation_deck_generation
    - simulation_model_authority
    - simulation_execution_when_a_simulation_run_workflow_is_required
    - owner_acceptance
    - accepted_verification_result_rows
    - fca_svr_acceptance
    - trr_or_ot_approval
    - pca_package_approval
    - upstream_packet_mutation
  authority_boundary:
    execution_packet_is_not_accepted_result: true
    candidate_pass_fail_is_not_owner_acceptance: true
    blocked_execution_is_not_failed_verification: true
    result_ingest_requires_named_evidence_ref: true
    verdict_requires_named_criterion_or_rule: true
    missing_measurement_or_observation_blocks_verdict: true
    simulation_payloads_stay_in_simulation_run_workflow: true
    upstream_artifacts_are_read_only: true
    raw_logs_remain_project_local_or_private: true
    public_package_contains_no_runtime_absolute_paths: true
  required_input_shapes:
    test_evaluation_execution_binding: templates/project_binding.template.yaml
    execution_scope_binding: templates/execution_scope_binding.template.yaml
  required_output_shapes:
    execution_run_packet: templates/execution_run_packet.template.yaml
    execution_result_register: templates/execution_result_register.template.yaml
    result_verdicts: templates/result_verdicts.template.yaml
    run_blockers: templates/run_blockers.template.yaml
    owner_followup_needed: templates/owner_followup_needed.template.yaml
    downstream_handoff: templates/downstream_handoff.template.yaml
    boundary_review_note: templates/boundary_review_note.template.md
notes:
  - This package is registered as a workflow canon entry at a contract-only/private-evidence claim ceiling.
  - Registration does not claim pilot execution, owner acceptance, TRR/DT/FCA/OT/PCA approval, usable status, production readiness, or optimizer results.
  - It fills the general execution/result lane between planning and accepted-result or audit consumers.
  - Simulation-specific execution remains owned by simulation_run_verify_v0; this workflow may consume simulation result packet refs but must not duplicate raw simulation payloads.
  - Candidate verdict rows can be useful for review and acceptance preparation, but accepted_verification_result_packet_v0 must still decide accepted, blocked, or inconclusive rows from a scoped acceptance basis.
  - Public workflow files must not contain raw test logs, waveform data, vendor payloads, private project outputs, credentials, sessions, or runtime absolute paths.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: test_evaluation_execution_result_ingest_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_execution_binding
    title: Prepare Execution Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_execution_binding_setup
      validates:
        - output_root_is_project_local_or_private_workmeta
        - execution_policy_is_explicit
        - acceptance_policy_is_not_implied
        - input_refs_are_read_only
        - public_package_contains_no_payloads
        - no_runtime_absolute_paths_in_public_package
      creates:
        - execution_output_root
        - execution_run_log_root
    summary: Resolve the bounded output root, allowed methods, and non-acceptance boundary before any execution or result ingest step.
    next:
      on_success: curate_execution_input_set
      on_fail: stop
  - step_id: curate_execution_input_set
    title: Curate Execution Input Set
    actor_slot: input_packet_curator
    action:
      kind: read_only_execution_input_inventory
      artifacts_in:
        - verification_plan_refs
        - trr_readiness_handoff_refs
        - fca_svr_handoff_index_refs
        - test_harness_asset_plan_refs
        - configuration_baseline_refs
        - procedure_refs
        - fixture_or_instrument_refs
        - tool_or_environment_policy_refs
        - simulation_run_packet_refs
        - review_gate_packet_refs
        - source_gap_followup_packet_refs
        - owner_decision_refs
        - deviation_or_waiver_refs
      artifact_out: execution_input_set
      records:
        - artifact_ref
        - artifact_kind
        - owning_workflow_id
        - checksum_sha256
        - approval_scope
        - verification_item_ids
        - baseline_refs
        - procedure_refs
        - resource_refs
        - result_evidence_authority_hint
      forbidden_basis:
        - hidden_reference_oracle
        - verifier_report
        - accepted_verification_result_unless_declared_read_only_context
        - secret_or_session_state
        - raw_unindexed_test_log_payload
        - raw_waveform_or_model_payload
        - unapproved_owner_file
    summary: Build the execution input set from approved refs while keeping raw payloads, secrets, and acceptance evidence out of the construction basis.
    next:
      on_success: assess_execution_readiness_gate
      on_fail: stop
  - step_id: assess_execution_readiness_gate
    title: Assess Execution Readiness Gate
    actor_slot: readiness_gatekeeper
    action:
      kind: execution_readiness_gate
      artifacts_in:
        - execution_input_set
      artifacts_out:
        - executable_item_candidates
        - blocked_or_not_executed_items
        - owner_followup_needed
      checks:
        - each_item_has_stable_verification_item_or_scope_id
        - each_item_has_configuration_or_baseline_ref_when_required
        - each_item_has_procedure_or_observation_rule_ref
        - each_item_has_criterion_or_measurement_rule_ref
        - each_item_has_required_resource_or_environment_ref
        - execution_authorization_is_explicit_for_side_effecting_runs
        - simulation_items_with_raw_execution_need_route_to_simulation_run_verify
      not_claimed:
        - trr_approval
        - verification_passed
        - verification_failed
        - verification_accepted
    summary: Decide which rows may execute or be ingested and which must stay blocked, inconclusive, owner-review-required, or not executed.
    next:
      on_success: execute_or_ingest_result_evidence
      on_fail: stop
  - step_id: execute_or_ingest_result_evidence
    title: Execute Or Ingest Result Evidence
    actor_slot: execution_operator
    action:
      kind: bounded_execution_or_result_ref_ingest
      artifacts_in:
        - executable_item_candidates
        - execution_input_set
      artifacts_out:
        - execution_run_packet
        - raw_result_ref_inventory
      mode_rules:
        execute_or_block:
          requires_explicit_execution_authorization: true
          records_tool_or_human_execution_metadata: true
          stores_raw_outputs_only_in_project_local_or_private_paths: true
        result_only_ingest:
          requires_existing_result_evidence_refs: true
          records_why_execution_was_not_performed_by_this_workflow: true
        simulation_result_ref:
          consume_simulation_run_verify_packet_refs_only: true
          do_not_copy_raw_waveforms_decks_or_model_payloads: true
    summary: Run only explicitly authorized bounded actions, or ingest existing result refs, and record enough provenance for later acceptance review.
    next:
      on_success: normalize_results_and_candidate_verdicts
      on_fail: stop
  - step_id: normalize_results_and_candidate_verdicts
    title: Normalize Results And Candidate Verdicts
    actor_slot: result_curator
    action:
      kind: result_row_and_candidate_verdict_mapping
      artifacts_in:
        - execution_run_packet
        - raw_result_ref_inventory
        - blocked_or_not_executed_items
        - execution_input_set
      artifacts_out:
        - execution_result_register
        - result_verdicts
        - run_blockers
      candidate_verdict_values:
        - pass
        - fail
        - inconclusive
        - blocked
        - not_executed
        - not_observed
      rules:
        - verdict_requires_named_criterion_or_rule
        - measured_or_observed_value_summary_must_not_copy_raw_payload
        - missing_observation_or_measurement_maps_to_inconclusive_or_blocked
        - candidate_pass_or_fail_does_not_create_accepted_result
        - waiver_or_deviation_requires_owner_decision_ref
    summary: Convert result evidence refs into candidate result rows and verdicts without turning them into accepted verification results.
    next:
      on_success: build_downstream_result_handoff
      on_fail: stop
  - step_id: build_downstream_result_handoff
    title: Build Downstream Result Handoff
    actor_slot: handoff_indexer
    action:
      kind: accepted_result_and_audit_handoff_indexing
      artifacts_in:
        - execution_result_register
        - result_verdicts
        - run_blockers
        - owner_followup_needed
      artifact_out: downstream_handoff
      rules:
        - accepted_result_packet_requires_scoped_acceptance_basis
        - fca_svr_consumes_accepted_result_packet_refs_not_candidate_verdicts
        - review_gate_may_consume_candidate_verdict_summary_with_non_acceptance_label
        - pca_consumes_only_artifact_inventory_or_package_discrepancy_context
        - owner_decision_packet_consumes_acceptance_basis_questions
    summary: Prepare refs for accepted-result, review, owner-decision, and audit consumers while preserving claim ceilings.
    next:
      on_success: write_bundle_and_boundary_review
      on_fail: stop
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: execution_result_bundle_boundary_review
      artifacts_in:
        - execution_run_packet
        - execution_result_register
        - result_verdicts
        - run_blockers
        - owner_followup_needed
        - downstream_handoff
      artifact_out: boundary_review_note
      checks:
        - all_rows_have_scope_ids
        - all_result_refs_are_read_only_or_project_local_outputs
        - all_verdicts_have_criteria_or_blocker_rationale
        - no_candidate_verdict_is_labeled_accepted
        - no_trr_fca_ot_pca_approval_claim
        - no_upstream_artifact_mutation
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
        - downstream_acceptance_requirements_are_explicit
    summary: Finalize the bundle and record that the package can support later acceptance review but cannot close acceptance itself.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "workflow_id": "test_evaluation_execution_result_ingest_v0",
  "fixture_id": "PUBLIC_SYNTH_TEST_EVALUATION_EXECUTION_RESULT_INGEST_V0",
  "source_kind": "synthetic_from_workflow_contract",
  "public_safe": true,
  "workflow_title": "Test Evaluation Execution Result Ingest v0",
  "workflow_summary": "General TRR/DT-to-FCA/OT execution and result-ingest workflow for packaging non-simulation-specific test, evaluation, inspection, analysis, and demonstration result evidence without claiming acceptance.",
  "workflow_readiness_label": "registered",
  "input_refs": [
    "test_evaluation_execution_binding",
    "verification_execution_scope_refs",
    "approved_test_evaluation_execution_policy"
  ],
  "expected_output_groups": [
    "execution_run_packet",
    "execution_result_register",
    "result_verdicts",
    "run_blockers",
    "owner_followup_needed",
    "downstream_handoff",
    "boundary_review_note"
  ],
  "must_preserve": [
    "result evidence",
    "no acceptance claim",
    "blocker",
    "boundary",
    "downstream handoff"
  ],
  "scenario_facts": [
    "one passed inspection row",
    "one blocked execution row",
    "one downstream handoff to acceptance review"
  ],
  "boundary_policy": [
    "Do not claim tool use, file edits, runtime paths, or hidden private evidence.",
    "Do not mutate upstream artifacts or promote stronger source/canon authority than the contract supports.",
    "Keep public-safe synthetic boundaries explicit."
  ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
