simulation_run_packet:
  workflow_id: simulation_run_verify_v0
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
  source_fixture: public_safe_synthetic_prompt_fixture
  simulator_execution_claim: none
  upstream_packet_handling: read_only
  packet_status: prepared_from_fixture_only

run_manifest:
  policy:
    upstream_packets_are_read_only: true
    blocked_run_is_not_failed_result: true
    verdict_requires_named_measurement_or_rule: true
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      expected_runtime_action: do_not_execute
      actual_runtime_action: not_executed
    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      expected_runtime_action: package_observed_stub_result
      actual_runtime_action: packaged_synthetic_stub_result

measurement_results:
  - case_id: case_A_blocked
    measurements_available: false
    observed_measurements: []
    note: No measurement definitions were provided, and required model inventory was incomplete.
  - case_id: case_B_executed_no_acceptance
    measurements_available: true
    observed_measurements:
      - measurement_id: m_gain_db
        value: 21.4
        unit: dB
        source: synthetic_stub_log
        rule_id: r_gain_min_20db
        pass_condition: value_db >= 20

result_verdicts:
  - case_id: case_A_blocked
    verdict: blocked_not_executed
    failed_verification: false
    cited_rule: blocked_run_is_not_failed_result
    cited_measurement: none
    rationale: Required model transistor_model_q1 is missing and no measurement definitions were provided, so the expected action is do_not_execute.
  - case_id: case_B_executed_no_acceptance
    verdict: pass
    failed_verification: false
    cited_measurement: m_gain_db
    cited_rule: r_gain_min_20db
    rationale: m_gain_db measured 21.4 dB from synthetic_stub_log, satisfying rule r_gain_min_20db with pass condition value_db >= 20.

run_blockers:
  - case_id: case_A_blocked
    blocker_id: missing_required_model
    blocker_detail: model_inventory reports missing transistor_model_q1.
    execution_effect: simulator run not executed.
  - case_id: case_A_blocked
    blocker_id: missing_measurement_definitions
    blocker_detail: measurement_definitions is empty.
    execution_effect: no pass/fail result can be produced.

owner_followup_needed:
  - case_id: case_A_blocked
    needed_decision: Provide or approve transistor_model_q1 and measurement definitions before execution.
    owner_decision_refs_present: false
  - case_id: case_B_executed_no_acceptance
    needed_decision: Owner acceptance remains pending because owner_decision_refs is empty.
    owner_decision_refs_present: false

downstream_handoff:
  ready_items:
    - case_id: case_B_executed_no_acceptance
      handoff_status: synthetic_stub_result_packaged
      verdict: pass
      caveat: Pass verdict covers the named synthetic measurement rule only; it is not owner acceptance.
  blocked_items:
    - case_id: case_A_blocked
      handoff_status: blocked_before_execution
      next_required_input: required model and measurement definitions

boundary_review_note:
  upstream_packets were treated as read-only. No real simulator execution is claimed. case_A is classified as blocked/not-executed, not as a failed verification. case_B receives a pass verdict only because named measurement m_gain_db satisfies named rule r_gain_min_20db. Owner acceptance was not invented for either case.