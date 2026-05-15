```yaml
simulation_run_packet:
  workflow_id: simulation_run_verify_v0
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
  source_scope: public_safe_synthetic_fixture_only
  upstream_packets_read_only: true
  real_simulator_execution_claimed: false
  owner_acceptance_claimed: false

run_manifest:
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      expected_runtime_action: do_not_execute
      runtime_status: blocked_not_executed
    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      expected_runtime_action: package_observed_stub_result
      runtime_status: synthetic_stub_result_packaged

measurement_results:
  case_A_blocked:
    measurements_available: false
    observed_measurements: []
    note: No measurement definitions were provided, and required model inventory is incomplete.
  case_B_executed_no_acceptance:
    measurements_available: true
    observed_measurements:
      - measurement_id: m_gain_db
        value: 21.4
        unit: dB
        source: synthetic_stub_log
        rule_id: r_gain_min_20db
        pass_condition: value_db >= 20

result_verdicts:
  case_A_blocked:
    verdict: blocked_not_failed
    cited_rule: blocked_run_is_not_failed_result
    cited_measurement: null
    reason: Required model transistor_model_q1 is missing and no measurement definitions are present, so execution was not allowed.
  case_B_executed_no_acceptance:
    verdict: pass
    cited_measurement: m_gain_db
    cited_rule: r_gain_min_20db
    reason: Observed m_gain_db = 21.4 dB satisfies rule r_gain_min_20db with condition value_db >= 20.

run_blockers:
  - case_id: case_A_blocked
    blocker_id: missing_required_model
    detail: model_inventory reports missing transistor_model_q1.
  - case_id: case_A_blocked
    blocker_id: missing_measurement_definitions
    detail: measurement_definitions is empty.

owner_followup_needed:
  - case_id: case_A_blocked
    needed: true
    reason: Owner or upstream preparer must provide the missing transistor model and measurement definitions before execution can be verified.
  - case_id: case_B_executed_no_acceptance
    needed: true
    reason: owner_decision_refs is empty, so owner acceptance is not established.

downstream_handoff:
  ready_items:
    - case_id: case_B_executed_no_acceptance
      handoff_status: measurement_verdict_ready
      contents: Synthetic stub measurement m_gain_db passed rule r_gain_min_20db.
  blocked_items:
    - case_id: case_A_blocked
      handoff_status: blocked_before_execution
      contents: Do not treat as failed verification; unblock inputs first.
  acceptance_status: owner_acceptance_pending

boundary_review_note:
  upstream_packets_mutated: false
  blocked_vs_failed_separated: true
  verdicts_cite_named_measurement_or_rule: true
  owner_acceptance_invented: false
  simulator_execution_boundary: No real simulator execution was performed or claimed; case_B uses only the provided synthetic stub observation.
```