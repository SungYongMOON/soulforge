workflow_id: simulation_deck_prepare_v0
kind: simulation_deck_packet
status: blocked
project_binding:
  project_code: SYNTH-DECK
  run_id: synth_calibration_case_001
  mode: bounded_prepare
  target_simulator: LTspice
  output_scope: synthetic_public_safe
  upstream_packets_read_only: true
  workflow_phase: pre_run_pre_verification

deck_input_manifest:
  policy:
    status: present
    run_simulation: false
    model_conversion_requires_owner_approval: true
  topology:
    ref: demo_refs/precision_clamp_amp_topology.yaml
    status: present
    payload_included: false
  models:
    - model_id: U1_OPA197
      source_status: official_present
      target_compatibility: likely_supported_unverified
      prepare_status: blocked_pending_compatibility_evidence
    - model_id: R1_R2_R3_C1
      source_status: tool_library_official
      target_compatibility: declared_supported
      prepare_status: prepared_reference
    - model_id: DCLAMP
      source_status: review_only_model_ref
      source_format: PSpice
      target_compatibility: requires_conversion
      owner_conversion_approval: false
      prepare_status: blocked
    - model_id: XLOAD
      source_status: missing_model_ref
      target_compatibility: unknown
      prepare_status: unresolved
  operating_conditions:
    supply: "+/-15V"
    temperature: 25C
    status: present
  stimuli:
    - stimulus_id: dc_sweep
      definition: present_-1V_to_+1V
      status: present
    - stimulus_id: transient_step_stimulus
      status: missing
  measurements:
    - measurement_id: dc_transfer_measurement
      status: present
    - measurement_id: transient_settling_measurement
      status: missing
    - measurement_id: ac_gain_measurement
      status: owner_decision_needed

model_dependency_map:
  topology_ref: demo_refs/precision_clamp_amp_topology.yaml
  dependencies:
    - model_id: U1_OPA197
      required: true
      resolution: unresolved_compatibility
    - model_id: R1_R2_R3_C1
      required: true
      resolution: available
    - model_id: DCLAMP
      required: true
      resolution: blocked_unapproved_conversion
    - model_id: XLOAD
      required: true
      resolution: missing
  completeness: incomplete
  uncertainty: Exact topology-to-model pin and subcircuit mappings are not supplied.

stimulus_measurement_plan:
  operating_conditions:
    supply: "+/-15V"
    temperature: 25C
  analyses:
    - analysis_id: dc_transfer
      stimulus: dc_sweep
      measurement: dc_transfer_measurement
      prepare_status: input_defined
      run_status: not_authorized
    - analysis_id: transient_settling
      stimulus: transient_step_stimulus
      measurement: transient_settling_measurement
      prepare_status: blocked_missing_inputs
      run_status: not_authorized
    - analysis_id: ac_gain
      stimulus: unspecified
      measurement: ac_gain_measurement
      prepare_status: blocked_owner_decision
      run_status: not_authorized

simulator_setup_requirements:
  target_simulator: LTspice
  requirements:
    - Confirm LTspice compatibility for U1_OPA197 from approved evidence.
    - Obtain an approved LTspice-compatible DCLAMP model or owner approval for conversion.
    - Obtain the required XLOAD model and its compatibility evidence.
    - Preserve the supplied supply and temperature conditions.
    - Define the missing transient stimulus and settling measurement.
    - Resolve the AC-gain measurement decision and any associated stimulus.
  prohibited_actions:
    - infer_compatibility_from_filename_or_extension
    - perform_unapproved_model_conversion
    - execute_simulation
    - claim_result_verification

deck_staging_manifest:
  prepared:
    - approved_deck_prepare_policy
    - demo_refs/precision_clamp_amp_topology.yaml
    - R1_R2_R3_C1
    - operating_condition_supply
    - operating_condition_temperature
    - dc_sweep
    - dc_transfer_measurement
  conditionally_staged:
    - input_id: U1_OPA197
      condition: approved_LTspice_compatibility_evidence
  excluded_or_unresolved:
    - DCLAMP
    - XLOAD
    - transient_step_stimulus
    - transient_settling_measurement
    - ac_gain_measurement
    - ac_gain_stimulus
  runnable_deck_claim: false
  run_authorization: false

unresolved_deck_inputs:
  - input_id: U1_OPA197
    reason: unsupported_or_unverified_simulator_compatibility
    required_resolution: approved_LTspice_compatibility_evidence
  - input_id: DCLAMP
    reason: unapproved_model_conversion
    required_resolution: approved_compatible_model_or_owner_conversion_approval
  - input_id: XLOAD
    reason: missing_required_model
    required_resolution: approved_model_ref_and_compatibility_evidence
  - input_id: transient_step_stimulus
    reason: missing_stimulus
    required_resolution: approved_stimulus_definition
  - input_id: transient_settling_measurement
    reason: missing_measurement
    required_resolution: approved_measurement_definition
  - input_id: ac_gain_measurement
    reason: owner_decision_needed
    required_resolution: owner_decision_and_approved_measurement_definition
  - input_id: ac_gain_stimulus
    reason: missing_stimulus
    required_resolution: approved_stimulus_definition_if_ac_analysis_is_required

deck_prepare_blockers:
  blocking: true
  blocker_codes:
    - unsupported_or_unverified_simulator_compatibility
    - unapproved_model_conversion
    - blocked_or_unapproved_required_model
    - missing_required_model
    - missing_stimulus
    - missing_measurement
    - owner_decision_needed
  workflow_decision: simulation_run_verify_blocked
  stop_condition: Do not hand off as runnable until every required blocker has approved source or owner resolution.

owner_followup_needed:
  required: true
  decisions:
    - Approve or reject conversion of the DCLAMP PSpice model for LTspice, or provide an approved compatible replacement.
    - Provide or designate an approved XLOAD model.
    - Define the transient step stimulus.
    - Define the transient settling measurement.
    - Decide whether AC-gain measurement is required and, if required, approve its stimulus and measurement definition.
  evidence_requests:
    - Approved LTspice compatibility evidence for U1_OPA197.
    - Compatibility evidence for the resolved DCLAMP and XLOAD models.

downstream_handoff:
  target_workflow: simulation_run_verify_v0
  readiness: blocked
  handoff_payload:
    prepared_deck_packet_available: false
    blocker_refresh_available: true
    unresolved_inputs_available: true
  rerun_condition: Resume deck preparation only after the required source-backed inputs and owner decisions are supplied.
  result_evidence: none

boundary_review_note:
  outcome: boundary_preserved
  assertions:
    upstream_packets_mutated: false
    simulator_execution_claimed: false
    runnable_deck_proven: false
    waveform_or_measurement_results_claimed: false
    pass_fail_claimed: false
    model_conversion_claimed: false
    staged_manifest_treated_as_run_authorization: false
    raw_payloads_included: false
    runtime_absolute_paths_included: false
  non_claims:
    - This packet is not evidence that a runnable simulation deck exists.
    - Compatibility for U1_OPA197 remains unverified.
    - No DCLAMP conversion is approved or represented as completed.
    - XLOAD remains missing.
    - No simulation, measurement, verification, or result acceptance is represented.
