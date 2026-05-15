You are running a public-safe CLI-only calibration candidate for Soulforge workflow simulation_stimulus_measurement_packet_v0.
Profile metadata:
- candidate_id: qe_dwarf_auditor_gpt-5.5_xhigh
- model: gpt-5.5
- reasoning_effort: xhigh
- species: dwarf
- class: auditor

Use only the workflow contract summary and synthetic fixture below. Do not read repository files, do not run commands, do not use private/raw/secret material, and do not claim execution, approval, source truth, or pass/fail results beyond this packet.

Workflow contract summary:
- Own only the outputs listed in fixture.required_outputs.
- Preserve read-only upstream boundaries.
- Make blockers, missing inputs, review-required states, provenance summaries, owner actions, downstream handoffs, and boundary notes explicit.
- Machine-readable JSON only. No markdown fence. No prose outside JSON.
- Top-level JSON keys required: candidate_id, workflow_id, profile, fixture_id, public_safe, packets, downstream_handoff, boundary_review_note, completion_state.
- packets must contain one property for each required output name. Use arrays of objects where rows are natural.
- Include stable ids, statuses, provenance or basis, owner action/next action, downstream impact, and not_claimed notes.
- completion_state must distinguish quality-ready packet completion from execution/approval/source-truth claims.

Synthetic public fixture JSON:
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

