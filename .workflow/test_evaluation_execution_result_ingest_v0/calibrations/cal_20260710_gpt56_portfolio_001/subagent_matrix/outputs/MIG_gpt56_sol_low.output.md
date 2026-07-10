workflow_deliverable:
  workflow_id: test_evaluation_execution_result_ingest_v0
  fixture_id: PUBLIC_SYNTH_TEST_EVALUATION_EXECUTION_RESULT_INGEST_V0
  deliverable_id: SYNTH_EXECUTION_RESULT_BUNDLE_001
  source_kind: synthetic_from_workflow_contract
  public_safe: true
  workflow_mode: result_only_ingest
  acceptance_state: downstream_acceptance_packet_required
  claim_ceiling: candidate_verdicts_only
  upstream_artifacts_mutated: false

execution_run_packet:
  packet_id: SYNTH_RUN_PACKET_001
  execution_scope_ref: SYNTH_SCOPE_REF_001
  execution_policy_ref: SYNTH_APPROVED_EXECUTION_POLICY_REF_001
  binding_ref: SYNTH_EXECUTION_BINDING_REF_001
  execution_performed_by_this_workflow: false
  execution_not_performed_reason: synthetic_fixture_supplies_result_scenarios_only
  result_evidence_handling: named_synthetic_refs_only
  raw_payloads_included: false
  runtime_paths_included: false
  items:
    - scope_id: SYNTH_INSPECTION_SCOPE_001
      verification_item_id: SYNTH_VERIFY_ITEM_001
      method: inspection
      procedure_ref: SYNTH_INSPECTION_PROCEDURE_REF_001
      criterion_ref: SYNTH_INSPECTION_CRITERION_REF_001
      result_evidence_ref: SYNTH_INSPECTION_EVIDENCE_REF_001
      evidence_authority: synthetic_fixture_scenario_fact
      execution_disposition: result_ref_ingested
    - scope_id: SYNTH_EXECUTION_SCOPE_002
      verification_item_id: SYNTH_VERIFY_ITEM_002
      method: not_ready
      procedure_ref: SYNTH_EXECUTION_PROCEDURE_REF_002
      criterion_ref: SYNTH_EXECUTION_CRITERION_REF_002
      result_evidence_ref: null
      evidence_authority: none
      execution_disposition: blocked

execution_result_register:
  register_id: SYNTH_RESULT_REGISTER_001
  rows:
    - result_row_id: SYNTH_RESULT_ROW_001
      scope_id: SYNTH_INSPECTION_SCOPE_001
      verification_item_id: SYNTH_VERIFY_ITEM_001
      method: inspection
      criterion_ref: SYNTH_INSPECTION_CRITERION_REF_001
      result_evidence_ref: SYNTH_INSPECTION_EVIDENCE_REF_001
      measured_or_observed_summary: synthetic_fixture_states_that_the_inspection_row_passed
      candidate_verdict: pass
      acceptance_state: not_accepted
      uncertainty: >
        No raw observation, measurement, approval record, or acceptance basis is
        supplied. The candidate verdict represents only the explicit synthetic
        scenario fact.
    - result_row_id: SYNTH_RESULT_ROW_002
      scope_id: SYNTH_EXECUTION_SCOPE_002
      verification_item_id: SYNTH_VERIFY_ITEM_002
      method: not_ready
      criterion_ref: SYNTH_EXECUTION_CRITERION_REF_002
      result_evidence_ref: null
      measured_or_observed_summary: no_execution_result_observed
      candidate_verdict: blocked
      acceptance_state: not_accepted
      uncertainty: >
        The fixture identifies a blocked execution row but does not provide the
        specific readiness deficiency, authorization state, or missing resource.

result_verdicts:
  verdict_set_id: SYNTH_VERDICT_SET_001
  rows:
    - result_row_id: SYNTH_RESULT_ROW_001
      scope_id: SYNTH_INSPECTION_SCOPE_001
      criterion_ref: SYNTH_INSPECTION_CRITERION_REF_001
      evidence_ref: SYNTH_INSPECTION_EVIDENCE_REF_001
      candidate_verdict: pass
      accepted_result: false
      rationale: explicit_synthetic_passed_inspection_scenario
    - result_row_id: SYNTH_RESULT_ROW_002
      scope_id: SYNTH_EXECUTION_SCOPE_002
      criterion_ref: SYNTH_EXECUTION_CRITERION_REF_002
      evidence_ref: null
      candidate_verdict: blocked
      accepted_result: false
      rationale: explicit_synthetic_blocked_execution_scenario_with_no_result_evidence

run_blockers:
  blocker_set_id: SYNTH_BLOCKER_SET_001
  blockers:
    - blocker_id: SYNTH_BLOCKER_001
      scope_id: SYNTH_EXECUTION_SCOPE_002
      verification_item_id: SYNTH_VERIFY_ITEM_002
      blocker_class: readiness_basis_not_supplied
      description: >
        Execution remains blocked because the synthetic fixture does not name
        the specific readiness basis, execution authorization, required
        resource, or result evidence.
      blocked_is_failed_verification: false
      stop_condition: >
        Do not execute, assign pass or fail, or create an accepted result until
        the required readiness basis and explicit execution authorization are
        supplied through approved references.
      resolution_owner: owner_or_authorized_readiness_authority
      resolution_evidence_required:
        - SYNTH_READINESS_BASIS_REF_REQUIRED
        - SYNTH_EXECUTION_AUTHORIZATION_REF_REQUIRED
        - SYNTH_REQUIRED_RESOURCE_OR_ENVIRONMENT_REF_REQUIRED

owner_followup_needed:
  followup_set_id: SYNTH_OWNER_FOLLOWUP_SET_001
  items:
    - followup_id: SYNTH_OWNER_FOLLOWUP_001
      scope_id: SYNTH_EXECUTION_SCOPE_002
      question: >
        What approved readiness basis, execution authorization, and required
        resource or environment references govern this blocked item?
      owner_decision_ref: null
      state: owner_review_required
    - followup_id: SYNTH_OWNER_FOLLOWUP_002
      scope_id: SYNTH_INSPECTION_SCOPE_001
      question: >
        What scoped acceptance basis should evaluate the inspection evidence
        and candidate-pass row?
      owner_decision_ref: null
      state: acceptance_basis_required

downstream_handoff:
  handoff_id: SYNTH_DOWNSTREAM_HANDOFF_001
  destination_workflow_id: accepted_verification_result_packet_v0
  purpose: acceptance_review
  supplied_refs:
    - SYNTH_RESULT_REGISTER_001
    - SYNTH_VERDICT_SET_001
    - SYNTH_BLOCKER_SET_001
    - SYNTH_OWNER_FOLLOWUP_SET_001
  candidate_rows:
    - SYNTH_RESULT_ROW_001
    - SYNTH_RESULT_ROW_002
  required_additional_inputs:
    - SYNTH_SCOPED_ACCEPTANCE_BASIS_REF_REQUIRED
    - SYNTH_ACCEPTANCE_AUTHORITY_REF_REQUIRED
  handoff_state: ready_for_later_acceptance_review
  non_claims:
    - no_accepted_verification_result
    - no_owner_acceptance
    - no_trr_dt_fca_ot_or_pca_approval
    - no_usable_or_production_ready_claim

boundary_review_note:
  note_id: SYNTH_BOUNDARY_REVIEW_NOTE_001
  public_safe: true
  findings:
    - all_result_rows_have_synthetic_scope_ids
    - candidate_verdicts_are_not_labeled_accepted
    - blocked_execution_is_not_labeled_failed_verification
    - named_synthetic_evidence_ref_is_used_for_the_inspection_verdict
    - no_result_evidence_is_invented_for_the_blocked_row
    - no_raw_logs_waveforms_vendor_payloads_credentials_or_sessions_are_included
    - no_runtime_absolute_paths_are_included
    - upstream_references_remain_read_only
    - downstream_acceptance_requirements_are_explicit
  unresolved_uncertainties:
    - inspection_observation_details_are_not_supplied
    - inspection_acceptance_basis_is_not_supplied
    - blocked_item_readiness_deficiency_is_not_specified
    - execution_authorization_for_the_blocked_item_is_not_supplied
  final_boundary: >
    This synthetic bundle packages one candidate-pass inspection row, one
    blocked execution row, and one acceptance-review handoff. It supports later
    review only and does not establish acceptance, approval, operational
    suitability, usability, or production readiness.
