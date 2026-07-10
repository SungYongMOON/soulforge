workflow_id: technical_risk_open_question_burndown_v0
fixture_id: PUBLIC_SYNTH_TECHNICAL_RISK_OPEN_QUESTION_BURNDOWN_V0
deliverable_kind: technical_risk_open_question_bundle
public_safe: true
source_kind: synthetic_from_workflow_contract

project_binding:
  risk_scope_ref: SYNTH_RISK_SCOPE_001
  risk_register_policy_ref: SYNTH_APPROVED_RISK_POLICY_001
  binding_status: bounded_to_synthetic_fixture
  upstream_artifacts_read_only: true

technical_risk_register:
  - risk_id: SYNTH_RISK_001
    title: Unresolved technical parameter may affect bounded design behavior
    severity: medium
    status: open
    evidence_state: synthetic_scenario_fact_only
    description: A required quantitative technical field remains unresolved within the supplied synthetic scope.
    uncertainty: The missing value, its permissible range, and its actual technical impact are not supplied.
    related_open_question_ids:
      - SYNTH_OQ_001
    closure_criterion_ids:
      - SYNTH_CC_001
    owner_acceptance: not_claimed
    resolution: not_claimed

open_question_register:
  - open_question_id: SYNTH_OQ_001
    question: What owner-approved, source-supported value or range governs the unresolved technical parameter?
    status: open
    answer_state: not_available
    decision_owner: unspecified_owner
    required_support: Owner-approved evidence identifying the applicable value or range and its scope.
    related_risk_ids:
      - SYNTH_RISK_001
    stop_condition: Keep the question open until SYNTH_CC_001 is satisfied; do not infer an answer from this register.

closure_criteria_register:
  - closure_criterion_id: SYNTH_CC_001
    applies_to:
      risk_ids:
        - SYNTH_RISK_001
      open_question_ids:
        - SYNTH_OQ_001
    criterion: A source-supported value or bounded range is supplied, its applicability to the synthetic risk scope is explicit, and the designated owner records the required decision.
    current_state: unmet
    required_evidence:
      - source-supported quantitative value or range
      - explicit scope applicability
      - designated owner decision
    non_claims:
      - No value or range is inferred.
      - No owner decision or acceptance is asserted.
      - No upstream artifact is altered.

burndown_summary:
  total_technical_risks: 1
  open_technical_risks: 1
  medium_open_risks: 1
  total_open_questions: 1
  unanswered_open_questions: 1
  total_closure_criteria: 1
  satisfied_closure_criteria: 0
  burndown_status: blocked_pending_owner_supported_evidence
  false_resolution_prevention: Risk and question remain open because the closure criterion is unmet.

owner_followup_needed:
  required: true
  owner: unspecified_owner
  followup_id: SYNTH_OWNER_FOLLOWUP_001
  requested_action: Provide or approve source-supported evidence for the unresolved parameter and state whether it applies to the bounded synthetic scope.
  decision_boundary: Only the designated owner may provide the required decision or acceptance.
  stop_condition: Do not close SYNTH_RISK_001 or SYNTH_OQ_001 without satisfying SYNTH_CC_001.

rerun_routes:
  - rerun_route_id: SYNTH_RERUN_ROUTE_001
    trigger: SYNTH_CC_001 receives the required evidence and owner decision.
    target_workflow_id: review_gate_evidence_pack_v0
    expected_input: updated_risk_and_open_question_summary
    route_status: dormant_until_trigger
    effect_boundary: Rerun eligibility does not imply closure, acceptance, or successful downstream review.

boundary_review_note:
  status: boundary_preserved
  statements:
    - This bundle is derived only from the public-safe synthetic fixture and workflow contract.
    - The risk register records uncertainty but does not constitute owner acceptance.
    - Upstream artifacts remain read-only and are not represented as updated.
    - No hidden evidence, runtime fact, technical value, or owner decision is asserted.
    - All identifiers are synthetic and public-safe.
    - Closure remains blocked until the explicit criterion is satisfied.
