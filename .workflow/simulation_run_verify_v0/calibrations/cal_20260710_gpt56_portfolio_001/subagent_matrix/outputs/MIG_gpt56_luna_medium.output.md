```yaml
workflow_id: simulation_run_verify_v0
status: complete_for_synthetic_fixture
project_binding:
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0

run_manifest:
  policy:
    upstream_packets_are_read_only: true
    blocked_run_is_not_failed_result: true
    verdict_requires_named_measurement_or_rule: true
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      execution_status: not_executed
      execution_decision: do_not_execute
      simulator_policy: simulator_allowed_if_model_and_measurements_present
      model_inventory_status: blocked
      measurement_definition_status: missing
      owner_decision_refs: []

    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      execution_status: synthetic_stub_result_packaged
      execution_decision: package_observed_stub_result
      simulator_policy: dry_run_allowed_with_synthetic_stub
      model_inventory_status: all_required_models_present
      measurement_definition_status: present
      owner_decision_refs: []

measurement_results:
  - case_id: case_A_blocked
    measurements: []
    result_status: not_executed
    uncertainty:
      - transistor_model_q1 is missing
      - no measurement definitions are supplied
      - no measured output exists

  - case_id: case_B_executed_no_acceptance
    measurements:
      - measurement_id: m_gain_db
        rule_id: r_gain_min_20db
        value: 21.4
        unit: dB
        source: synthetic_stub_log
        pass_condition: value_db >= 20
    result_status: observed_synthetic_stub_result
    uncertainty:
      - result is limited to the supplied synthetic stub observation
      - no owner acceptance decision is present
      - no claim is made about physical, production, or harness-connected behavior

result_verdicts:
  - case_id: case_A_blocked
    verdict: blocked
    rule_id: null
    rationale: Execution prerequisites are incomplete because transistor_model_q1 and measurement definitions are missing.
    acceptance_status: not_assessed

  - case_id: case_B_executed_no_acceptance
    verdict: pass
    measurement_id: m_gain_db
    rule_id: r_gain_min_20db
    rationale: Observed value 21.4 dB satisfies value_db >= 20.
    acceptance_status: not_assessed
    non_claims:
      - pass is not owner acceptance
      - pass does not establish production or hardware validity

run_blockers:
  - case_id: case_A_blocked
    blocker_id: missing_transistor_model_q1
    severity: blocking
    owner_followup_needed: true
    required_followup:
      - provide approved transistor_model_q1
      - provide named measurement definitions

owner_followup_needed:
  - case_id: case_A_blocked
    required: true
    reason: Resolve missing model and measurement prerequisites before execution.
  - case_id: case_B_executed_no_acceptance
    required: true
    reason: Owner acceptance remains outside workflow authority.

downstream_handoff:
  workflow_id: simulation_run_verify_v0
  handoff_type: accepted_or_blocked_simulation_result_summary
  cases:
    - case_id: case_A_blocked
      next_action: rerun after prerequisite completion
      trigger: source_gap_followup_packet_v0
    - case_id: case_B_executed_no_acceptance
      next_action: owner review and later review-gate consideration
      consumer: review_gate_evidence_pack_v0

boundary_review_note:
  upstream_packets_mutated: false
  source_xml_mutated: false
  models_invented: false
  deck_prepare_authority_replaced: false
  owner_acceptance_claimed: false
  harness_connection_promoted: false
  blocked_run_labeled_as_failed_verification: false
  final_boundary: Results are limited to the supplied synthetic fixture and named measurement rule.
```
