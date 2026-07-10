```yaml
workflow_id: simulation_stimulus_measurement_packet_v0
fixture_id: simulation_stimulus_measurement_packet_v0_public_synthetic_seed_inputs
project_binding:
  project_scope_key: public_stimulus_fixture
  source_mode: contract_only_synthetic
  public_safe: true

stimuli_or_operating_conditions_packet:
  mode: seed_input_packet
  execution_authorization: false
  target_consumer: simulation_deck_prepare_v0
  rows:
    - id: stim_vdd_nominal
      provenance: owner_statement_summary
      node: VDD
      type: dc_supply
      value: 5 V
      approval_state: seed_only
    - id: stim_vin_step
      provenance: quantitative_enrichment_public_summary
      node: VIN
      type: transient_step
      value: 0 V to 1.8 V at 1 ms
      approval_state: review_required
    - id: load_rout
      provenance: owner_statement_summary
      node: OUT
      type: load
      value: 10 kOhm to GND
      approval_state: seed_only

measurement_definition_packet:
  rows:
    - id: meas_settling_time
      signal: VOUT
      definition: time from VIN step until VOUT remains within 2 percent of final value
      state: defined_review_required
    - id: meas_overshoot
      signal: VOUT
      definition: max excursion above final value after step
      state: defined_review_required
    - id: meas_supply_current
      signal: IDD
      definition: average current between 2 ms and 3 ms
      state: missing_probe_node

execution_scope_note:
  scope_status: seed_inputs_only
  bounded_scope:
    - record supplied stimuli and operating conditions
    - record requested measurement definitions
    - expose missing inputs and approval dependencies
  excluded:
    - simulator_runtime_authorization
    - simulation_deck_generation
    - simulator_execution
    - result_verdicts
    - measurement_results
    - owner_acceptance
  readiness_statement: execution readiness is not established

input_packet_blockers:
  - id: simulator_policy_packet_missing_for_execution
    status: blocking
  - id: temperature_corner_not_owner_approved
    status: blocking
  - id: model_files_not_acquired
    status: blocking
  - id: meas_supply_current_missing_probe_node
    status: blocking
    affected_measurement: meas_supply_current
    signal: IDD

boundary_review_note:
  packet_is_not_execution_authorization: true
  packet_is_not_run_result: true
  packet_is_not_measurement_result: true
  upstream_packets_are_read_only: true
  missing_inputs_remain_visible: true
  seed_or_review_only_inputs_must_not_be_promoted: true
  non_claims:
    - no simulator execution is represented
    - no measurement result is represented
    - no pass_or_fail verdict is represented
    - no owner approval is represented
```
