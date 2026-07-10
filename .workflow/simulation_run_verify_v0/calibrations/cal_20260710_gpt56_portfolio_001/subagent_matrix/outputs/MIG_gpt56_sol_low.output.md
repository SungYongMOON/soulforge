workflow_id: simulation_run_verify_v0
kind: simulation_run_packet
status: complete_with_blocked_case
project_binding:
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
workflow_mode: execute_or_block

policy_binding:
  upstream_packets_are_read_only: true
  blocked_run_is_not_failed_result: true
  verdict_requires_named_measurement_or_rule: true
  owner_acceptance_is_separate: true

run_manifest:
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      requested_action: do_not_execute
      execution_state: not_executed
      simulator_policy: simulator_allowed_if_model_and_measurements_present
      prerequisites:
        model_inventory_state: incomplete
        missing_models:
          - transistor_model_q1
        measurement_definition_state: missing
        owner_decision_refs: []
      upstream_artifact_disposition: read_only

    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      requested_action: package_observed_stub_result
      execution_state: observed_stub_result_packaged
      simulator_policy: dry_run_allowed_with_synthetic_stub
      prerequisites:
        model_inventory_state: complete_as_supplied
        measurement_definition_state: present
        owner_decision_refs: []
      evidence_type: synthetic_stub_log
      upstream_artifact_disposition: read_only
      non_claims:
        - No claim is made that a simulator was invoked.
        - No claim is made that the supplied observation represents physical hardware.
        - No owner acceptance is implied.

measurement_results:
  - case_id: case_A_blocked
    results: []
    result_state: unavailable
    reason: No measurement definitions were supplied and a required model is missing.

  - case_id: case_B_executed_no_acceptance
    results:
      - measurement_id: m_gain_db
        rule_id: r_gain_min_20db
        observed_value: 21.4
        unit: dB
        observation_source: synthetic_stub_log
        pass_condition: value_db >= 20
        comparison_result: condition_satisfied
    result_state: packaged_from_supplied_fixture

result_verdicts:
  - case_id: case_A_blocked
    verdict: blocked
    basis:
      - blocker_id: blocker_missing_model_q1
      - blocker_id: blocker_missing_measurement_definitions
    acceptance_state: not_requested
    note: Blocked execution is not a failed verification result.

  - case_id: case_B_executed_no_acceptance
    measurement_id: m_gain_db
    rule_id: r_gain_min_20db
    verdict: pass
    basis: The supplied synthetic observation of 21.4 dB satisfies the named rule value_db >= 20.
    acceptance_state: pending_owner_decision
    note: The measurement verdict does not constitute owner acceptance.

run_blockers:
  - blocker_id: blocker_missing_model_q1
    case_id: case_A_blocked
    category: missing_model_dependency
    severity: execution_blocking
    detail: Required synthetic model transistor_model_q1 is absent.
    resolution_authority: upstream_source_or_deck_owner
    stop_condition: Do not execute until the required model is supplied through an authorized upstream packet.

  - blocker_id: blocker_missing_measurement_definitions
    case_id: case_A_blocked
    category: missing_measurement_definition
    severity: verdict_blocking
    detail: No named measurement definition or verdict rule was supplied.
    resolution_authority: verification_or_measurement_owner
    stop_condition: Do not assign a pass or fail verdict until a named measurement or rule is supplied.

owner_followup_needed:
  - case_id: case_A_blocked
    needed: true
    requests:
      - Supply or authorize an upstream packet containing transistor_model_q1.
      - Supply approved measurement definitions and named verdict rules.
    rerun_condition: Both execution-blocking prerequisites are resolved.

  - case_id: case_B_executed_no_acceptance
    needed: true
    requests:
      - Decide whether to accept, reject, or request further evidence for the packaged synthetic stub result.
    rerun_condition: Rerun only if the owner requests new evidence or revised criteria.

downstream_handoff:
  verification_plan_from_page_contracts_v0:
    trigger: case_A prerequisite resolution or case_B criterion/result refresh
    payload_summary:
      - case_A is blocked without a failed-result claim.
      - case_B has a supplied synthetic observation satisfying its named rule.
  review_gate_evidence_pack_v0:
    readiness: bounded_summary_available
    payload_summary:
      - Include case_A blocker rows and stop conditions.
      - Include case_B measurement evidence, rule comparison, and pending acceptance state.
  source_gap_followup_packet_v0:
    trigger: case_A_blockers
    payload_summary:
      - missing transistor_model_q1
      - missing measurement definitions and verdict rules

boundary_review_note:
  upstream_packets_mutated: false
  source_or_model_invention: false
  harness_connection_promoted: false
  owner_acceptance_claimed: false
  blocked_case_reported_as_failed_verification: false
  uncertainties:
    - The fixture does not establish that any simulator process ran.
    - The provenance and fidelity of synthetic_stub_log are not independently established.
    - No owner decision references were supplied for either case.
  publication_boundary:
    public_safe: true
    excluded_material:
      - raw model payloads
      - generated decks
      - waveform files
      - runtime absolute paths
      - credentials
      - cookies
      - sessions
      - private run truth
