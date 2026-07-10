You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: simulation_stimulus_measurement_packet_v0
kind: workflow
status: active
title: Simulation Stimulus Measurement Packet v0
summary: Record bounded stimuli or operating conditions, measurement definitions, execution-scope notes, and missing-input blockers before deck-prepare or run-verify workflows consume simulation execution inputs.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - simulation_input_scope
  - simulation_input_statement
  - approved_input_packet_policy
optional_inputs:
  - quantitative_enrichment_packet_refs
  - simulation_source_packet_refs
  - owner_decision_refs
  - source_packet_refs
outputs:
  - stimuli_or_operating_conditions_packet
  - measurement_definition_packet
  - execution_scope_note
  - input_packet_blockers
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
downstream_workflows:
  - workflow_id: simulation_deck_prepare_v0
    expected_input: stimuli_and_measurement_packet_refs
  - workflow_id: simulation_run_verify_v0
    expected_input: measurement_definition_packet_and_scope_note
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: seed_inputs_for_simulation_readiness
simulation_input_contract:
  owns:
    - stimulus_or_operating_condition_rows
    - measurement_definition_rows
    - bounded_execution_scope_note
    - missing_input_blockers
  does_not_own:
    - simulator_runtime_authorization
    - simulation_deck_generation
    - simulator_execution
    - result_verdicts
    - owner_acceptance
  authority_boundary:
    packet_is_not_execution_authorization: true
    packet_is_not_run_result: true
    packet_is_not_measurement_result: true
    upstream_packets_are_read_only: true
    missing_inputs_remain_visible: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow may validly produce seed or review-only execution inputs that are not yet owner-approved.
  - The first private pilot exercised a seed-input path only and did not claim execution readiness.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: simulation_stimulus_measurement_packet_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_input_binding
    title: Prepare Input Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_simulation_input_binding_setup
    summary: Resolve bounded simulation-input scope and output root.
  - step_id: curate_stimuli_and_measurements
    title: Curate Stimuli And Measurements
    actor_slot: input_curator
    action:
      kind: simulation_stimulus_and_measurement_inventory
    summary: Record stimuli or operating conditions plus measurement definitions without claiming execution readiness.
  - step_id: map_scope_and_blockers
    title: Map Scope And Blockers
    actor_slot: blocker_mapper
    action:
      kind: execution_scope_note_and_missing_input_split
    summary: Separate what is available as seed input from what still blocks deck-prepare or run-verify.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: simulation_input_bundle_write_and_boundary_review
    summary: Confirm that seed inputs are not promoted into execution authorization, pass/fail, or measurement results.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
    "required_outputs":  [
                             "stimuli_or_operating_conditions_packet",
                             "measurement_definition_packet",
                             "execution_scope_note",
                             "input_packet_blockers",
                             "boundary_review_note"
                         ],
    "requested_measurements":  [
                                   {
                                       "state":  "defined_review_required",
                                       "id":  "meas_settling_time",
                                       "definition":  "time from VIN step until VOUT remains within 2 percent of final value",
                                       "signal":  "VOUT"
                                   },
                                   {
                                       "state":  "defined_review_required",
                                       "id":  "meas_overshoot",
                                       "definition":  "max excursion above final value after step",
                                       "signal":  "VOUT"
                                   },
                                   {
                                       "state":  "missing_probe_node",
                                       "id":  "meas_supply_current",
                                       "definition":  "average current between 2 ms and 3 ms",
                                       "signal":  "IDD"
                                   }
                               ],
    "fixture_id":  "simulation_stimulus_measurement_packet_v0_public_synthetic_seed_inputs",
    "project_scope_key":  "public_stimulus_fixture",
    "blockers":  [
                     "simulator_policy_packet_missing_for_execution",
                     "temperature_corner_not_owner_approved",
                     "model_files_not_acquired"
                 ],
    "source_mode":  "contract_only_synthetic",
    "public_safe":  true,
    "simulation_input_scope":  {
                                   "not_execution_authorization":  true,
                                   "target_consumer":  "simulation_deck_prepare_v0",
                                   "mode":  "seed_input_packet"
                               },
    "available_seed_inputs":  [
                                  {
                                      "id":  "stim_vdd_nominal",
                                      "provenance":  "owner_statement_summary",
                                      "node":  "VDD",
                                      "type":  "dc_supply",
                                      "value":  "5 V",
                                      "approval_state":  "seed_only"
                                  },
                                  {
                                      "id":  "stim_vin_step",
                                      "provenance":  "quantitative_enrichment_public_summary",
                                      "node":  "VIN",
                                      "type":  "transient_step",
                                      "value":  "0 V to 1.8 V at 1 ms",
                                      "approval_state":  "review_required"
                                  },
                                  {
                                      "id":  "load_rout",
                                      "provenance":  "owner_statement_summary",
                                      "node":  "OUT",
                                      "type":  "load",
                                      "value":  "10 kOhm to GND",
                                      "approval_state":  "seed_only"
                                  }
                              ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
