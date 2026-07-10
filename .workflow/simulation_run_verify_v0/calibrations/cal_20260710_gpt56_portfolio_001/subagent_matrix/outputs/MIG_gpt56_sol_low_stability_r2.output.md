workflow_id: simulation_run_verify_v0
deliverable_kind: simulation_run_packet
packet_status: complete_from_synthetic_fixture
project_binding:
  project_code: PUBLIC_CAL_SIM
  run_id: cal_20260515_quality_equiv
  output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
  input_scope: public_safe_synthetic_fixture

policy_binding:
  upstream_packets_are_read_only: true
  blocked_run_is_not_failed_result: true
  blocked_run_is_not_failed_verification: true
  verdict_requires_named_measurement_or_rule: true
  missing_measurement_definition_blocks_verdict: true
  pass_fail_is_not_owner_acceptance: true

run_manifest:
  cases:
    - case_id: case_A_blocked
      deck_packet_ref: synthetic/deck_packet_A.yaml
      deck_state: deck_prepared
      simulator_policy: simulator_allowed_if_model_and_measurements_present
      expected_runtime_action: do_not_execute
      execution_state: not_executed
      execution_basis: fixture_prerequisites_not_met
      upstream_packet_mutation: none_claimed

    - case_id: case_B_executed_no_acceptance
      deck_packet_ref: synthetic/deck_packet_B.yaml
      deck_state: deck_prepared
      simulator_policy: dry_run_allowed_with_synthetic_stub
      expected_runtime_action: package_observed_stub_result
      execution_state: fixture_reported_synthetic_stub_result
      execution_basis: supplied_fixture_only
      runtime_execution_independently_verified: false
      upstream_packet_mutation: none_claimed

measurement_results:
  - case_id: case_A_blocked
    measurement_state: unavailable
    results: []
    limitations:
      - No measurement definitions were supplied.
      - No measurement verdict may be issued.

  - case_id: case_B_executed_no_acceptance
    measurement_state: fixture_observed
    results:
      - measurement_id: m_gain_db
        observed_value: 21.4
        unit: dB
        observation_source: synthetic_stub_log
        source_characterization: fixture_supplied
        independently_verified: false
        rule_id: r_gain_min_20db
        pass_condition: value_db >= 20

result_verdicts:
  - case_id: case_A_blocked
    verdict: blocked
    verdict_scope: simulation_run_start
    criteria_basis:
      - missing_required_model: transistor_model_q1
      - missing_measurement_definitions
    verification_result: not_executed
    owner_acceptance: not_granted
    non_claims:
      - The blocked run is not a failed verification result.
      - No simulation result exists for this case.
      - No owner acceptance is implied.

  - case_id: case_B_executed_no_acceptance
    measurement_id: m_gain_db
    rule_id: r_gain_min_20db
    verdict: pass
    verdict_scope: fixture_supplied_measurement_against_named_rule
    evaluation:
      observed_value: 21.4
      unit: dB
      operator: ">="
      threshold: 20
      condition_satisfied: true
    evidence_limit: synthetic_fixture_only
    owner_acceptance: not_granted
    non_claims:
      - The pass verdict does not establish owner acceptance.
      - The synthetic stub result does not establish production-simulator equivalence.
      - Runtime execution was not independently verified.

run_blockers:
  - blocker_id: blocker_case_A_model_q1
    case_id: case_A_blocked
    blocker_type: missing_model
    state: open
    detail: Required transistor model transistor_model_q1 is missing.
    stop_condition: Do not execute until an authorized upstream source provides the required model.

  - blocker_id: blocker_case_A_measurements
    case_id: case_A_blocked
    blocker_type: missing_measurement_definition
    state: open
    detail: No named measurement definitions or verdict rules were supplied.
    stop_condition: Do not execute or issue a result verdict until approved measurement definitions are supplied.

owner_followup_needed:
  - followup_id: followup_case_A_prerequisites
    case_id: case_A_blocked
    required_action:
      - Resolve transistor_model_q1 through the authorized upstream source process.
      - Supply or approve named measurement definitions and associated rules.
    owner_decision_required: true
    workflow_authority_limit: This workflow cannot invent the model, define owner criteria, or mutate the prepared deck.

  - followup_id: followup_case_B_acceptance
    case_id: case_B_executed_no_acceptance
    required_action:
      - Decide whether the fixture-scoped synthetic result is acceptable for its intended downstream use.
      - Decide whether a non-stub simulator run or additional evidence is required.
    owner_decision_required: true
    current_acceptance_state: undecided

downstream_handoff:
  verification_plan_from_page_contracts_v0:
    trigger: simulation_result_and_blocker_refresh
    payload:
      - case_A_blocked prerequisites remain unresolved.
      - case_B_executed_no_acceptance has a fixture-scoped passing measurement verdict without owner acceptance.

  review_gate_evidence_pack_v0:
    status: eligible_for_later_review
    payload:
      - case_A_blocked blocker summary
      - case_B_executed_no_acceptance synthetic measurement and named-rule evaluation
    acceptance_claim: none

  source_gap_followup_packet_v0:
    trigger: rerun_for_case_A
    payload:
      - missing transistor_model_q1
      - missing measurement definitions

boundary_review_note:
  upstream_artifacts:
    treatment: read_only
    mutation_claimed: false
  source_authority:
    preserved: true
    note: Missing models and measurement definitions remain upstream or owner-controlled inputs.
  verdict_authority:
    preserved: true
    note: Only the supplied named rule was evaluated; no rule was invented.
  owner_acceptance:
    granted: false
    note: Neither a blocked state nor a passing fixture-scoped verdict replaces owner acceptance.
  harness_connection_promotion:
    claimed: false
  runtime_facts:
    independently_verified: false
    note: Execution and measurement metadata are represented only as supplied by the synthetic fixture.
  public_safety:
    raw_model_payloads_included: false
    generated_decks_included: false
    waveform_files_included: false
    absolute_runtime_paths_included: false
    credentials_or_sessions_included: false
  stop_conditions:
    - Keep case_A_blocked unexecuted until both required model and approved measurement definitions are present.
    - Do not promote case_B_executed_no_acceptance to owner-accepted status without an explicit owner decision.
    - Do not infer production equivalence from the synthetic stub result.
