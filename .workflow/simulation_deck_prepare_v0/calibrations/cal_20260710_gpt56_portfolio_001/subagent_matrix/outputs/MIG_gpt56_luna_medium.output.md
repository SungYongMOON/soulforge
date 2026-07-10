```yaml
workflow_id: simulation_deck_prepare_v0
project_binding:
  project_code: SYNTH-DECK
  run_id: synth_calibration_case_001
  mode: bounded_prepare
  output_scope: public_safe_synthetic
  target_simulator: LTspice
  execution_status: not_started
  result_verification_status: not_started

simulation_deck_packet:
  status: blocked_before_simulation
  topology_ref:
    ref: demo_refs/precision_clamp_amp_topology.yaml
    status: present
    payload: omitted
  operating_conditions:
    supply: "+/-15V"
    temperature: 25C
  prepared_inputs:
    - U1_OPA197
    - R1_R2_R3_C1
    - dc_sweep
    - dc_transfer_measurement
  unresolved_inputs:
    - DCLAMP
    - XLOAD
    - transient_step_stimulus
    - transient_settling_measurement
    - ac_gain_measurement
    - verified_U1_OPA197_LTspice_compatibility

deck_input_manifest:
  topology_sources:
    - ref: demo_refs/precision_clamp_amp_topology.yaml
      status: present
      authority: source_ref_only
  models:
    - ref: U1_OPA197
      status: official_present
      simulator_compatibility: likely_supported_unverified
      prepare_status: unresolved_compatibility
    - ref: R1_R2_R3_C1
      status: tool_library_official
      simulator_compatibility: declared_supported
      prepare_status: prepared
    - ref: DCLAMP
      status: review_only_model_ref
      source_format: PSpice
      simulator_compatibility: requires_conversion
      conversion_approval: absent
      prepare_status: blocked
    - ref: XLOAD
      status: missing_model_ref
      prepare_status: blocked

model_dependency_map:
  required:
    - U1_OPA197
    - R1_R2_R3_C1
    - DCLAMP
    - XLOAD
  prepared:
    - R1_R2_R3_C1
  unresolved:
    - ref: U1_OPA197
      reason: simulator compatibility unverified
    - ref: DCLAMP
      reason: conversion requires owner approval
    - ref: XLOAD
      reason: model reference missing

stimulus_measurement_plan:
  prepared:
    - stimulus: dc_sweep
      definition: "-1V_to_+1V"
      measurement: dc_transfer_measurement
      status: staged_as_definition_only
  unresolved:
    - stimulus: transient_step_stimulus
      status: missing
    - measurement: transient_settling_measurement
      status: missing
    - measurement: ac_gain_measurement
      status: owner_decision_needed
  non_claims:
    - no_measurement_results
    - no_waveform_results
    - no_pass_fail_result

simulator_setup_requirements:
  simulator: LTspice
  policy:
    run_simulation: false
    upstream_packets_read_only: true
    model_conversion_requires_owner_approval: true
  compatibility:
    R1_R2_R3_C1: declared_supported
    U1_OPA197: unverified
    DCLAMP: unsupported_until_approved_conversion
    XLOAD: unavailable
  status: incomplete

deck_staging_manifest:
  status: staged_with_blockers
  staged:
    - topology_ref
    - operating_conditions
    - R1_R2_R3_C1
    - dc_sweep
    - dc_transfer_measurement
  not_authorized_for_simulation: true

unresolved_deck_inputs:
  - missing_required_model: XLOAD
  - blocked_model: DCLAMP
  - unverified_simulator_compatibility: U1_OPA197
  - missing_stimulus: transient_step_stimulus
  - missing_measurement: transient_settling_measurement
  - owner_decision_needed: ac_gain_measurement

deck_prepare_blockers:
  - code: missing_required_model
    item: XLOAD
  - code: blocked_or_unapproved_required_model
    item: DCLAMP
  - code: unsupported_or_unverified_simulator_compatibility
    item: U1_OPA197
  - code: missing_stimulus
    item: transient_step_stimulus
  - code: missing_measurement
    item: transient_settling_measurement
  - code: owner_decision_needed
    item: ac_gain_measurement

owner_followup_needed:
  - approve_or_reject_DCLAMP_conversion
  - provide_XLOAD_model_reference
  - confirm_U1_OPA197_LTspice_compatibility
  - provide_transient_step_stimulus
  - provide_transient_settling_measurement_definition
  - decide_whether_ac_gain_measurement_is_required

downstream_handoff:
  target_workflow: simulation_run_verify_v0
  status: blocked
  expected_input: prepared_deck_packet_and_run_blockers
  handoff_note: Resolve all listed blockers before any simulation execution or result verification workflow.
  non_claims:
    - no_simulator_execution
    - no_runnable_deck_proof
    - no_waveform_or_measurement_result
    - no_pass_fail_claim
    - blocked_prepare_is_not_failed_simulation

boundary_review_note:
  source_basis_present_for_staged_and_unresolved_items: true
  upstream_packets_mutated: false
  model_invention: false
  source_authority_replaced: false
  harness_connection_promoted: false
  model_conversion_performed: false
  simulator_execution: false
  result_acceptance: false
  public_safe: true
  runtime_absolute_paths_present: false
  final_workflow_decision: simulation_run_verify_blocked
```
