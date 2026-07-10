You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-sol; reasoning_effort=low; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: simulation_deck_prepare_v0
kind: workflow
status: active
title: Simulation Deck Prepare v0
summary: Prepare or stage bounded simulation deck inputs from approved model packets, deck or demo-circuit refs, operating conditions, stimuli, measurements, and simulator policy before any simulation execution or result verification workflow runs.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - simulation_deck_prepare_binding
  - simulation_source_packet_refs
  - approved_deck_prepare_policy
optional_inputs:
  - model_inventory_refs
  - model_file_manifest_refs
  - demo_circuit_manifest_refs
  - simulator_compatibility_matrix_refs
  - page_module_spec_refs
  - quantitative_enrichment_packet_refs
  - interface_control_packet_refs
  - harness_priority_packet_refs
  - owner_decision_refs
  - stimuli_or_operating_condition_refs
  - measurement_definition_refs
  - simulator_policy_refs
outputs:
  - simulation_deck_packet
  - deck_input_manifest
  - model_dependency_map
  - stimulus_measurement_plan
  - simulator_setup_requirements
  - deck_staging_manifest
  - unresolved_deck_inputs
  - deck_prepare_blockers
  - owner_followup_needed
  - downstream_handoff
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - scaffold_only
  - bounded_prepare
  - rerun_update
upstream_workflows:
  - workflow_id: simulation_source_collect_v0
    expected_outputs:
      - simulation_source_packet
      - model_inventory
      - model_file_manifest
      - demo_circuit_manifest
      - simulator_compatibility_matrix
      - missing_models
      - access_blockers
      - owner_followup_needed
      - downstream_handoff
  - workflow_id: page_quantitative_enrichment_v0
    expected_outputs:
      - quantitative_claims
      - source_gap_report
      - owner_followup_needed
    status: optional_operating_condition_input
  - workflow_id: interface_control_and_harness_readiness_v0
    expected_outputs:
      - interface_control_ledger
      - compatibility_gap_report
    status: optional_interface_scope_input
downstream_workflows:
  - workflow_id: simulation_run_verify_v0
    expected_input: prepared_deck_packet_and_run_blockers
    status: planned
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: deck_prepare_readiness_or_blocker_refresh
    status: rerun_trigger_only
  - workflow_id: source_gap_followup_packet_v0
    expected_input: unresolved_deck_inputs_and_owner_followup_needed
    status: rerun_trigger_only
deck_prepare_contract:
  owns:
    - bounded_deck_prepare_identity
    - input_manifest_and_dependency_map
    - prepared_vs_unresolved_input_split
    - deck_prepare_blockers
    - owner_followup_for_missing_policy_or_inputs
    - downstream_handoff_for_run_verify
  does_not_own:
    - model_invention
    - simulator_execution
    - waveform_or_metric_verification
    - result_acceptance
    - source_authority_replacement
    - harness_connection_promotion
  authority_boundary:
    deck_prepare_is_not_simulation_execution: true
    prepared_packet_is_not_result_evidence: true
    upstream_packets_are_read_only: true
    blocked_prepare_is_not_failed_simulation: true
    compatibility_guessing_from_extension_or_name_forbidden: true
    staged_manifest_is_not_run_authorization: true
    stimulus_measurement_plan_is_not_measurement_result: true
  must_block_on:
    - missing_required_model
    - blocked_or_unapproved_required_model
    - missing_deck_or_topology_source
    - missing_deck_prepare_policy
    - missing_stimulus
    - missing_measurement
    - missing_operating_condition
    - missing_model_dependency
    - unsupported_or_unverified_simulator_compatibility
    - unapproved_model_conversion
    - owner_decision_needed
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is pre-run and pre-verify only. It may prepare a bounded deck packet or explicitly block when required models, deck/topology sources, policies, dependencies, operating conditions, stimuli, measurements, simulator compatibility evidence, or owner decisions are missing.
  - The correct v0 result may be mostly unresolved inputs and blockers. That is successful when it prevents downstream workflows from pretending a runnable deck already exists.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.
  - Public workflow files must not contain raw model payloads, generated deck payloads, simulation outputs, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: simulation_deck_prepare_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_deck_binding
    title: Prepare Deck Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_deck_prepare_binding_setup
      requires:
        - simulation_deck_prepare_binding
        - simulation_source_packet_refs
        - approved_deck_prepare_policy
      validates:
        - output_root_is_project_local_or_private_workmeta
        - upstream_packets_are_read_only
        - workflow_is_pre_run_and_pre_result_verification
        - policy_names_model_deck_stimulus_measurement_and_simulator_rules
        - no_runtime_absolute_paths_in_public_package
    summary: Resolve bounded output root and confirm the workflow is pre-run only.
    next:
      on_success: curate_deck_inputs
      on_fail: stop
  - step_id: curate_deck_inputs
    title: Curate Deck Inputs
    actor_slot: deck_input_curator
    action:
      kind: approved_model_and_policy_inventory
      artifacts_in:
        - simulation_source_packet_refs
        - model_inventory_refs
        - model_file_manifest_refs
        - demo_circuit_manifest_refs
        - simulator_compatibility_matrix_refs
        - stimuli_or_operating_condition_refs
        - measurement_definition_refs
        - simulator_policy_refs
      artifacts_out:
        - deck_input_manifest
        - model_dependency_map
        - stimulus_measurement_plan
        - simulator_setup_requirements
      keeps_visible:
        - approved_model_refs
        - review_only_model_refs
        - missing_model_refs
        - blocked_model_refs
        - deck_or_topology_source_refs
        - missing_stimuli
        - missing_measurements
        - simulator_compatibility_caveats
    summary: Inventory approved model refs, deck or demo-circuit refs, simulator policies, operating conditions, stimuli, and measurement definitions without mutating upstream packets.
    next:
      on_success: map_blockers_and_packet
      on_fail: stop
  - step_id: map_blockers_and_packet
    title: Map Blockers And Packet
    actor_slot: blocker_mapper
    action:
      kind: prepared_vs_unresolved_input_split
      artifacts_in:
        - deck_input_manifest
        - model_dependency_map
        - stimulus_measurement_plan
        - simulator_setup_requirements
      artifacts_out:
        - deck_staging_manifest
        - unresolved_deck_inputs
        - deck_prepare_blockers
        - owner_followup_needed
        - downstream_handoff
      must_block_on:
        - missing_required_model
        - blocked_or_unapproved_required_model
        - missing_deck_or_topology_source
        - missing_deck_prepare_policy
        - missing_stimulus
        - missing_measurement
        - missing_operating_condition
        - missing_dependency
        - unsupported_or_unverified_simulator_compatibility
        - unapproved_model_conversion
        - owner_decision_needed
      non_claims:
        - no_simulator_execution
        - no_runnable_deck_proof
        - no_waveform_or_measurement_result
        - no_pass_fail_claim
    summary: Split prepared deck inputs from unresolved or blocked requirements and write downstream handoff without upgrading blockers into run readiness.
    next:
      on_success: write_bundle_and_boundary_review
      on_fail: stop
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: deck_prepare_bundle_write_and_boundary_review
      artifacts_in:
        - deck_input_manifest
        - model_dependency_map
        - stimulus_measurement_plan
        - simulator_setup_requirements
        - deck_staging_manifest
        - unresolved_deck_inputs
        - deck_prepare_blockers
        - owner_followup_needed
        - downstream_handoff
      artifact_out: boundary_review_note
      checks:
        - staged_inputs_or_blockers_have_source_or_owner_basis
        - missing_models_decks_policies_stimuli_measurements_and_compatibility_are_visible
        - no_unapproved_model_conversion
        - no_simulator_execution
        - no_waveform_or_measurement_results
        - no_pass_fail_or_verification_claims
        - no_raw_payloads_or_runtime_absolute_paths_in_public_package
    summary: Write the deck-prepare packet bundle and confirm no execution/result claims were made.
    next:
      on_success: complete
      on_fail: stop


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "project_code": "SYNTH-DECK",
  "run_id": "synth_calibration_case_001",
  "mode": "bounded_prepare",
  "target_simulator": "LTspice",
  "policy": {
    "present": true,
    "upstream_packets_read_only": true,
    "run_simulation": false,
    "model_conversion_requires_owner_approval": true
  },
  "topology_ref": {
    "path_token": "demo_refs/precision_clamp_amp_topology.yaml",
    "present": true,
    "payload": "omitted"
  },
  "models": {
    "U1_OPA197": {
      "status": "official_present",
      "ltspice_compatibility": "likely_supported_unverified"
    },
    "R1_R2_R3_C1": {
      "status": "tool_library_official",
      "ltspice_compatibility": "declared_supported"
    },
    "DCLAMP": {
      "status": "review_only_model_ref",
      "source_format": "PSpice",
      "ltspice_compatibility": "requires_conversion",
      "owner_conversion_approval": false
    },
    "XLOAD": {
      "status": "missing_model_ref"
    }
  },
  "operating_conditions": {
    "supply": "+/-15V",
    "temperature": "25C"
  },
  "stimuli_and_measurements": {
    "dc_sweep": "present_-1V_to_+1V",
    "dc_transfer_measurement": "present",
    "transient_step_stimulus": "missing",
    "transient_settling_measurement": "missing",
    "ac_gain_measurement": "owner_decision_needed"
  },
  "expected_workflow_decision": "simulation_run_verify_blocked"
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
