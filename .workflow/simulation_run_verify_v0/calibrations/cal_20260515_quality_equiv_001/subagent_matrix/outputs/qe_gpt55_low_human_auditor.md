simulation_run_packet:
  workflow_id: simulation_run_verify_v0
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
  source_fixture: public_safe_synthetic_prompt_fixture
  execution_claim: no_real_simulator_execution
  upstream_packet_handling: read_only

run_manifest:
  approved_policy:
    upstream_packets_are_read_only: true
    blocked_run_is_not_failed_result: true
    verdict_requires_named_measurement_or_rule: true
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      simulator_policy: simulator_allowed_if_model_and_measurements_present
      expected_runtime_action: do_not_execute
      actual_runtime_action: not_executed_blocked
    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      simulator_policy: dry_run_allowed_with_synthetic_stub
      expected_runtime_action: package_observed_stub_result
      actual_runtime_action: packaged_synthetic_stub_result

measurement_results:
  case_A_blocked:
    status: not_executed
    measurements_available: false
    measurement_results: []
    reason: measurement_definitions_empty_and_required_model_missing
  case_B_executed_no_acceptance:
    status: observed_stub_packaged
    measurements_available: true
    measurement_results:
      - measurement_id: m_gain_db
        rule_id: r_gain_min_20db
        observed_value: 21.4
        unit: dB
        source: synthetic_stub_log
        pass_condition: value_db >= 20

result_verdicts:
  case_A_blocked:
    verdict: blocked_not_failed
    cited_rule: blocked_run_is_not_failed_result
    cited_measurement: none
    rationale: The run was not executed because transistor_model_q1 is missing and no measurement definitions were provided. This is a blocker, not a failed simulation result.
  case_B_executed_no_acceptance:
    verdict: pass_measurement_rule_only
    cited_measurement: m_gain_db
    cited_rule: r_gain_min_20db
    rationale: m_gain_db observed 21.4 dB from synthetic_stub_log, satisfying r_gain_min_20db with pass condition value_db >= 20.
    owner_acceptance_status: not_accepted
    owner_acceptance_reason: owner_decision_refs is empty

run_blockers:
  - case_id: case_A_blocked
    blocker_id: missing_required_model
    detail: transistor_model_q1 is missing.
    effect: simulator execution blocked.
  - case_id: case_A_blocked
    blocker_id: missing_measurement_definitions
    detail: measurement_definitions is empty.
    effect: no valid measurement-backed verdict can be produced.

owner_followup_needed:
  - case_id: case_A_blocked
    needed_action: Provide or approve transistor_model_q1 and required measurement definitions before execution.
  - case_id: case_B_executed_no_acceptance
    needed_action: Owner must review the synthetic stub measurement result and issue an explicit acceptance or rejection decision.
    current_owner_decision_refs: []

downstream_handoff:
  ready_for_downstream: partial
  handoff_items:
    - case_id: case_A_blocked
      handoff_status: blocked_hold
      downstream_instruction: Do not treat as failed result; resolve blockers first.
    - case_id: case_B_executed_no_acceptance
      handoff_status: measurement_rule_pass_pending_owner_acceptance
      downstream_instruction: May be reviewed as a synthetic stub pass for m_gain_db/r_gain_min_20db, but must not be promoted as owner-accepted.

boundary_review_note:
  - Used only the public-safe synthetic fixture from the prompt.
  - Did not read files, run commands, mutate upstream packets, or claim real simulator execution.
  - Blocked/not-executed state is separated from failed verification.
  - Pass verdict cites named measurement m_gain_db and rule r_gain_min_20db.
  - Owner acceptance was not invented; case_B remains pending owner acceptance.