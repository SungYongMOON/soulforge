{
  "candidate_id": "qe_dwarf_auditor_gpt-5.5_xhigh",
  "workflow_id": "simulation_stimulus_measurement_packet_v0",
  "profile": {
    "model": "gpt-5.5",
    "reasoning_effort": "xhigh",
    "species": "dwarf",
    "class": "auditor",
    "mode": "public_safe_cli_only_calibration_candidate"
  },
  "fixture_id": "simulation_stimulus_measurement_packet_v0_public_synthetic_seed_inputs",
  "public_safe": true,
  "packets": {
    "stimuli_or_operating_conditions_packet": [
      {
        "id": "stim_vdd_nominal",
        "status": "seed_only",
        "node": "VDD",
        "type": "dc_supply",
        "value": "5 V",
        "provenance": "owner_statement_summary",
        "owner_action": "owner_review_and_approval_required_before_execution_use",
        "downstream_impact": "simulation_deck_prepare_v0 may carry this as a seed supply condition but must not treat it as approved",
        "not_claimed": "not execution authorization, not source truth, not approved simulator setup"
      },
      {
        "id": "stim_vin_step",
        "status": "review_required",
        "node": "VIN",
        "type": "transient_step",
        "value": "0 V to 1.8 V at 1 ms",
        "provenance": "quantitative_enrichment_public_summary",
        "owner_action": "confirm VIN step amplitude, timing, source impedance, and transition shape",
        "downstream_impact": "simulation_deck_prepare_v0 can prepare a draft step stimulus only after marking review requirement",
        "not_claimed": "not approved stimulus, not execution authorization, not source truth"
      },
      {
        "id": "load_rout",
        "status": "seed_only",
        "node": "OUT",
        "type": "load",
        "value": "10 kOhm to GND",
        "provenance": "owner_statement_summary",
        "owner_action": "owner_review_and_approval_required_before execution use",
        "downstream_impact": "simulation_deck_prepare_v0 may carry this as a seed load condition but must not treat it as approved",
        "not_claimed": "not approved load condition, not execution authorization, not source truth"
      }
    ],
    "measurement_definition_packet": [
      {
        "id": "meas_settling_time",
        "status": "defined_review_required",
        "signal": "VOUT",
        "definition": "time from VIN step until VOUT remains within 2 percent of final value",
        "basis": "requested_measurements synthetic fixture",
        "owner_action": "confirm final value calculation window, tolerance interpretation, and step trigger reference",
        "downstream_impact": "simulation_deck_prepare_v0 can draft measurement logic but must preserve review_required state",
        "not_claimed": "not approved measurement definition, not executed result"
      },
      {
        "id": "meas_overshoot",
        "status": "defined_review_required",
        "signal": "VOUT",
        "definition": "max excursion above final value after step",
        "basis": "requested_measurements synthetic fixture",
        "owner_action": "confirm final value reference, overshoot units, and post-step evaluation interval",
        "downstream_impact": "simulation_deck_prepare_v0 can draft measurement logic but must preserve review_required state",
        "not_claimed": "not approved measurement definition, not executed result"
      },
      {
        "id": "meas_supply_current",
        "status": "missing_probe_node",
        "signal": "IDD",
        "definition": "average current between 2 ms and 3 ms",
        "basis": "requested_measurements synthetic fixture",
        "owner_action": "provide approved current probe element, node, sign convention, and acquisition method",
        "downstream_impact": "simulation_deck_prepare_v0 must block or stub this measurement until probe definition is supplied",
        "not_claimed": "not measurable from this packet alone, not approved measurement definition, not executed result"
      }
    ],
    "execution_scope_note": [
      {
        "id": "exec_scope_public_stimulus_fixture",
        "status": "seed_input_packet_only",
        "basis": "simulation_input_scope.not_execution_authorization is true",
        "target_consumer": "simulation_deck_prepare_v0",
        "mode": "seed_input_packet",
        "owner_action": "supply simulator policy packet, approved corners, and acquired model files before any execution claim",
        "downstream_impact": "downstream consumer may prepare a draft deck packet but must not run or approve simulation from this packet",
        "not_claimed": "not execution, not approval, not pass/fail, not source truth"
      }
    ],
    "input_packet_blockers": [
      {
        "id": "blocker_simulator_policy_packet_missing_for_execution",
        "status": "blocking_execution",
        "basis": "fixture.blockers",
        "owner_action": "provide approved simulator policy packet",
        "downstream_impact": "simulation execution must remain blocked",
        "not_claimed": "no simulator policy inferred"
      },
      {
        "id": "blocker_temperature_corner_not_owner_approved",
        "status": "blocking_execution",
        "basis": "fixture.blockers",
        "owner_action": "owner must approve temperature corner set",
        "downstream_impact": "corner-specific deck preparation must remain review-required",
        "not_claimed": "no temperature corner approved"
      },
      {
        "id": "blocker_model_files_not_acquired",
        "status": "blocking_execution",
        "basis": "fixture.blockers",
        "owner_action": "acquire and approve required model files through permitted owner-controlled process",
        "downstream_impact": "simulation deck cannot be execution-ready",
        "not_claimed": "no model file availability, provenance, or validity claimed"
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary_public_contract_only_synthetic",
        "status": "boundary_preserved",
        "basis": "source_mode contract_only_synthetic and public_safe true",
        "owner_action": "review packet before promoting into any execution or source-backed workflow",
        "downstream_impact": "downstream handoff is limited to public-safe seed preparation context",
        "not_claimed": "no repository read, no private material, no raw truth, no secret material, no execution, no approval, no source-truth validation, no pass/fail result"
      }
    ]
  },
  "downstream_handoff": {
    "target_consumer": "simulation_deck_prepare_v0",
    "handoff_status": "seed_packet_ready_for_review_required_downstream_preparation",
    "allowed_use": "prepare draft simulation deck inputs while preserving blockers and review-required states",
    "blocked_use": "execution, approval, source-truth assertion, pass/fail determination",
    "owner_next_actions": [
      "approve or revise seed stimuli and load conditions",
      "approve measurement definitions and supply missing IDD probe details",
      "provide simulator policy packet",
      "approve temperature corners",
      "acquire and approve model files"
    ]
  },
  "boundary_review_note": {
    "id": "top_boundary_public_safe_contract_only",
    "status": "review_required_before_any_non_packet_use",
    "basis": "synthetic public fixture only",
    "not_claimed": "this response is only a machine-readable candidate packet and does not claim execution, approval, source truth, private/raw material review, or pass/fail outcome"
  },
  "completion_state": {
    "packet_completion_status": "quality_ready_candidate_packet_complete_for_fixture_required_outputs",
    "execution_status": "not_executed",
    "approval_status": "not_approved",
    "source_truth_status": "not_source_truth",
    "pass_fail_status": "not_claimed",
    "public_safe_status": "public_safe_synthetic_only",
    "remaining_blockers": [
      "simulator_policy_packet_missing_for_execution",
      "temperature_corner_not_owner_approved",
      "model_files_not_acquired",
      "meas_supply_current_missing_probe_node"
    ]
  }
}