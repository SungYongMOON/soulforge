```yaml
workflow_id: test_evaluation_execution_result_ingest_v0
fixture_id: PUBLIC_SYNTH_TEST_EVALUATION_EXECUTION_RESULT_INGEST_V0
public_safe: true
claim_ceiling: candidate_execution_result_only
acceptance_state: not_accepted

execution_run_packet:
  run_id: SYNTH-RUN-001
  mode: result_only_ingest
  execution_status: partially_ingested_and_blocked
  scope_refs:
    - SYNTH-SCOPE-INSPECTION-001
    - SYNTH-SCOPE-BLOCKED-001
  input_refs:
    - test_evaluation_execution_binding
    - verification_execution_scope_refs
    - approved_test_evaluation_execution_policy
  evidence_inventory:
    - result_ref: SYNTH-EVIDENCE-INSPECTION-001
      kind: inspection_result_reference
      public_safe_summary: synthetic inspection evidence supporting one candidate pass row
      raw_payload_included: false
      authority: candidate_result_support_only
    - result_ref: SYNTH-EVIDENCE-BLOCKED-001
      kind: blocked_execution_reference
      public_safe_summary: synthetic record that execution was blocked
      raw_payload_included: false
      authority: blocker_support_only
  execution_not_claimed:
    tool_use: true
    file_edits: true
    runtime_paths: true
    private_evidence: true
    owner_acceptance: true

execution_result_register:
  - result_id: SYNTH-RESULT-INSPECTION-001
    scope_id: SYNTH-SCOPE-INSPECTION-001
    method: inspection
    evidence_ref: SYNTH-EVIDENCE-INSPECTION-001
    criterion_ref: SYNTH-CRITERION-INSPECTION-001
    observation_summary: synthetic fixture identifies one passed inspection row
    candidate_verdict: pass
    acceptance_state: not_accepted
    non_claims:
      - does_not_establish_accepted_verification_result
      - does_not_establish_owner_acceptance

  - result_id: SYNTH-RESULT-BLOCKED-001
    scope_id: SYNTH-SCOPE-BLOCKED-001
    method: not_ready
    evidence_ref: SYNTH-EVIDENCE-BLOCKED-001
    criterion_ref: SYNTH-CRITERION-EXECUTION-READINESS-001
    observation_summary: execution is marked blocked by the synthetic fixture
    candidate_verdict: blocked
    acceptance_state: acceptance_basis_required
    blocker_ref: SYNTH-BLOCKER-001
    non_claims:
      - blocked_execution_is_not_failed_verification
      - no verification failure is inferred
      - specific operational blocker detail is not provided by the fixture

result_verdicts:
  - result_id: SYNTH-RESULT-INSPECTION-001
    verdict: pass
    basis_ref: SYNTH-CRITERION-INSPECTION-001
    evidence_ref: SYNTH-EVIDENCE-INSPECTION-001
    status: candidate_only
    accepted: false

  - result_id: SYNTH-RESULT-BLOCKED-001
    verdict: blocked
    basis_ref: SYNTH-CRITERION-EXECUTION-READINESS-001
    evidence_ref: SYNTH-EVIDENCE-BLOCKED-001
    status: candidate_only
    accepted: false

run_blockers:
  - blocker_id: SYNTH-BLOCKER-001
    scope_id: SYNTH-SCOPE-BLOCKED-001
    category: execution_readiness
    rationale: synthetic fixture marks the execution row as blocked without supplying a more specific blocker basis
    required_followup:
      - obtain_named_execution_readiness_basis
      - obtain_required_evidence_or_authorization_refs_if_rerun_is_requested
    verdict_effect: blocked
    acceptance_effect: prevents acceptance closure for this row

owner_followup_needed:
  - followup_id: SYNTH-FOLLOWUP-001
    scope_id: SYNTH-SCOPE-BLOCKED-001
    question: What approved evidence, procedure, criterion, resource, baseline, or execution authorization is required to resolve the blocked row?
    owner_decision_required: true
    acceptance_state: owner_review_required

downstream_handoff:
  handoff_id: SYNTH-HANDOFF-001
  status: prepared_for_acceptance_review
  source_refs:
    - SYNTH-RESULT-INSPECTION-001
    - SYNTH-RESULT-BLOCKED-001
    - SYNTH-BLOCKER-001
  destinations:
    - workflow_id: accepted_verification_result_packet_v0
      handoff_type: acceptance_review_input
      required_inputs:
        - scoped_acceptance_basis
        - acceptance_basis_refs
        - owner_decision_refs_when_required
      candidate_verdicts_are_not_accepted_results: true

    - workflow_id: review_gate_evidence_pack_v0
      handoff_type: non_acceptance_execution_summary
      includes:
        - candidate_verdict_summary
        - blocker_summary
        - evidence_reference_inventory

    - workflow_id: owner_decision_packet_v0
      handoff_type: owner_followup
      includes:
        - SYNTH-FOLLOWUP-001

  excluded_claims:
    - accepted_verification_result
    - owner_acceptance
    - TRR_DT_FCA_OT_PCA_approval
    - production_readiness
    - usable_status

boundary_review_note:
  note_id: SYNTH-BOUNDARY-REVIEW-001
  review_status: boundary_preserved
  confirmed:
    - all rows use synthetic scope identifiers
    - result evidence is represented only by named public-safe references
    - the pass row is candidate-only
    - the blocked row is not characterized as a failed verification
    - acceptance remains not_accepted
    - downstream acceptance requirements are explicit
    - no upstream artifact mutation is claimed
    - no raw payloads, credentials, private evidence, or runtime absolute paths are included
  limitations:
    - the fixture does not provide detailed inspection measurements
    - the fixture does not provide the specific cause of execution blockage
    - no owner acceptance or downstream acceptance decision is represented
```
