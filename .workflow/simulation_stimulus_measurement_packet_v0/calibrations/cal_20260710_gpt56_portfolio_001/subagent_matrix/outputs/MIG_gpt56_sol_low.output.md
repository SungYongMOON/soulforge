fixture_id: simulation_stimulus_measurement_packet_v0_public_synthetic_seed_inputs
project_scope_key: public_stimulus_fixture
source_mode: contract_only_synthetic
public_safe: true

stimuli_or_operating_conditions_packet:
  packet_state: seed_input_review_required
  rows:
    - id: stim_vdd_nominal
      type: dc_supply
      node: VDD
      value: "5 V"
      provenance: owner_statement_summary
      approval_state: seed_only
    - id: stim_vin_step
      type: transient_step
      node: VIN
      value: "0 V to 1.8 V at 1 ms"
      provenance: quantitative_enrichment_public_summary
      approval_state: review_required
    - id: load_rout
      type: load
      node: OUT
      value: "10 kOhm to GND"
      provenance: owner_statement_summary
      approval_state: seed_only
  conditions_not_established:
    - temperature_corner
    - model_file_binding
    - simulator_policy_binding

measurement_definition_packet:
  packet_state: review_required_with_blocked_row
  rows:
    - id: meas_settling_time
      signal: VOUT
      definition: "time from VIN step until VOUT remains within 2 percent of final value"
      state: defined_review_required
      unresolved_definition_details:
        - final_value_determination_method
        - required_duration_within_tolerance
    - id: meas_overshoot
      signal: VOUT
      definition: "max excursion above final value after step"
      state: defined_review_required
      unresolved_definition_details:
        - final_value_determination_method
        - measurement_window_end
    - id: meas_supply_current
      signal: IDD
      definition: "average current between 2 ms and 3 ms"
      state: missing_probe_node
      unresolved_definition_details:
        - probe_node_or_current_element_binding

execution_scope_note:
  mode: seed_input_packet
  target_consumer: simulation_deck_prepare_v0
  permitted_use:
    - deck_preparation_input_review
    - missing_input_resolution
    - measurement_definition_review
  readiness_state: not_established
  not_execution_authorization: true
  non_claims:
    - simulator_runtime_authorization
    - simulation_deck_generation
    - simulator_execution
    - measurement_results
    - result_verdicts
    - owner_acceptance
  stop_conditions:
    deck_prepare:
      - model_files_not_acquired
      - temperature_corner_not_owner_approved
    run_verify:
      - simulator_policy_packet_missing_for_execution
      - temperature_corner_not_owner_approved
      - model_files_not_acquired
      - meas_supply_current_probe_node_unresolved
      - measurement_definition_review_incomplete

input_packet_blockers:
  packet_state: blocked_for_execution
  blockers:
    - id: simulator_policy_packet_missing_for_execution
      blocks:
        - simulator_execution
        - simulation_run_verify_v0
      resolution_owner: unspecified
      resolution_evidence: missing
    - id: temperature_corner_not_owner_approved
      blocks:
        - finalized_deck_preparation
        - simulator_execution
        - simulation_run_verify_v0
      resolution_owner: owner
      resolution_evidence: missing
    - id: model_files_not_acquired
      blocks:
        - finalized_deck_preparation
        - simulator_execution
        - simulation_run_verify_v0
      resolution_owner: unspecified
      resolution_evidence: missing
    - id: meas_supply_current_probe_node_unresolved
      derived_from: meas_supply_current
      blocks:
        - supply_current_measurement_binding
        - simulation_run_verify_v0
      resolution_owner: unspecified
      resolution_evidence: missing
    - id: measurement_definition_review_incomplete
      derived_from:
        - meas_settling_time
        - meas_overshoot
      blocks:
        - unambiguous_measurement_evaluation
        - simulation_run_verify_v0
      resolution_owner: unspecified
      resolution_evidence: missing

boundary_review_note:
  review_state: boundary_preserved
  upstream_packets_read_only: true
  missing_inputs_visible: true
  packet_is_not_execution_authorization: true
  packet_is_not_run_result: true
  packet_is_not_measurement_result: true
  owner_acceptance_claimed: false
  execution_readiness_claimed: false
  result_verdict_claimed: false
  uncertainty:
    - Seed values retain their supplied approval states.
    - No temperature corner, model-file binding, or simulator policy is established.
    - IDD cannot be bound to a probe from the supplied fixture.
    - Settling-time and overshoot definitions require review before unambiguous evaluation.
  downstream_handoff:
    simulation_deck_prepare_v0:
      expected_input: stimuli_and_measurement_packet_refs
      handoff_state: seed_review_only
    simulation_run_verify_v0:
      expected_input: measurement_definition_packet_and_scope_note
      handoff_state: blocked
    verification_plan_from_page_contracts_v0:
      expected_input: seed_inputs_for_simulation_readiness
      handoff_state: seed_available_with_visible_blockers
