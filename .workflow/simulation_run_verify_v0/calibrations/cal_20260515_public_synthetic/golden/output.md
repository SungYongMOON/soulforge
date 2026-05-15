```yaml
simulation_run_verify_v0_public_packet:
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_public
  data_class: public_safe_synthetic_fixture
  baseline_profile:
    model: gpt-5.5
    reasoning_effort: xhigh
    species: human
    class: auditor
  case_A_blocked:
    runtime_action: not_executed
    measurement_results: []
    result_verdicts:
      - status: blocked_not_executed
        basis:
          - missing_required_model: transistor_model_q1
          - missing_measurement_definitions: true
    run_blockers:
      - missing_model_q1
      - missing_measurement_definitions
    boundary_review_note:
      - no simulator execution claimed
      - no upstream mutation attempted
      - blocked run not labeled as failed verification
  case_B_executed_no_acceptance:
    runtime_action: packaged_observed_synthetic_stub_result
    execution_scope: synthetic_stub_only
    measurement_results:
      - measurement_id: m_gain_db
        rule_id: r_gain_min_20db
        observed_value: 21.4
        unit: dB
        source: synthetic_stub_log
        pass_condition: value_db >= 20
    result_verdicts:
      - measurement_id: m_gain_db
        rule_id: r_gain_min_20db
        status: pass
        acceptance_status: not_owner_accepted
    run_blockers: []
    downstream_handoff:
      status: ready_for_owner_review
    boundary_review_note:
      - no owner acceptance claimed
      - no actual simulator execution claimed beyond synthetic stub
```
