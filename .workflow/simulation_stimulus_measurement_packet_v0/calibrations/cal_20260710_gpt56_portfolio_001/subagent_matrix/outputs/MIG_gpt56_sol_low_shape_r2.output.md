{
  "candidate_id": "MIG_gpt56_sol_low_shape_r2",
  "workflow_id": "simulation_stimulus_measurement_packet_v0",
  "profile": {
    "model": "gpt-5.6-sol",
    "reasoning_effort": "low",
    "species": "dwarf",
    "class": "auditor"
  },
  "fixture_id": "simulation_stimulus_measurement_packet_v0_public_synthetic_seed_inputs",
  "public_safe": true,
  "packets": {
    "stimuli_or_operating_conditions_packet": [
      {
        "id": "stim_vdd_nominal",
        "status": "seed_only",
        "type": "dc_supply",
        "node": "VDD",
        "value": "5 V",
        "provenance": "owner_statement_summary",
        "owner_action": "Review and approve the nominal supply condition before deck preparation or execution.",
        "downstream_impact": "May be transferred to simulation_deck_prepare_v0 only as an unapproved seed condition.",
        "not_claimed": [
          "owner_approval",
          "deck_implementation",
          "simulation_execution",
          "source_truth"
        ]
      },
      {
        "id": "stim_vin_step",
        "status": "review_required",
        "type": "transient_step",
        "node": "VIN",
        "value": "0 V to 1.8 V at 1 ms",
        "provenance": "quantitative_enrichment_public_summary",
        "owner_action": "Review and approve the step levels, timing, and any unspecified edge characteristics.",
        "downstream_impact": "Deck preparation remains review-gated; rise time, fall time, and source impedance are not defined.",
        "not_claimed": [
          "owner_approval",
          "complete_pulse_definition",
          "deck_implementation",
          "simulation_execution",
          "source_truth"
        ]
      },
      {
        "id": "load_rout",
        "status": "seed_only",
        "type": "load",
        "node": "OUT",
        "value": "10 kOhm to GND",
        "provenance": "owner_statement_summary",
        "owner_action": "Confirm that OUT is the intended load node and approve the load value and topology.",
        "downstream_impact": "May be transferred to simulation_deck_prepare_v0 only as an unapproved load seed.",
        "not_claimed": [
          "owner_approval",
          "node_equivalence_to_VOUT",
          "deck_implementation",
          "simulation_execution",
          "source_truth"
        ]
      },
      {
        "id": "operating_condition_temperature",
        "status": "blocked_owner_approval_required",
        "type": "temperature_corner",
        "node": null,
        "value": null,
        "basis": "fixture blocker: temperature_corner_not_owner_approved",
        "owner_action": "Specify and approve the required temperature corner or corner set.",
        "downstream_impact": "The downstream consumer cannot prepare an execution-ready operating-condition set.",
        "not_claimed": [
          "temperature_value",
          "owner_approval",
          "execution_readiness"
        ]
      }
    ],
    "measurement_definition_packet": [
      {
        "id": "meas_settling_time",
        "status": "defined_review_required",
        "signal": "VOUT",
        "definition": "time from VIN step until VOUT remains within 2 percent of final value",
        "basis": "synthetic fixture requested_measurements",
        "owner_action": "Review the definition and specify the observation horizon, final-value method, and persistence criteria.",
        "downstream_impact": "Deck preparation may preserve this provisional definition, but deterministic implementation requires the missing criteria.",
        "not_claimed": [
          "measurement_approval",
          "measurement_implementation",
          "measurement_result",
          "simulation_execution",
          "source_truth"
        ]
      },
      {
        "id": "meas_overshoot",
        "status": "defined_review_required",
        "signal": "VOUT",
        "definition": "max excursion above final value after step",
        "basis": "synthetic fixture requested_measurements",
        "owner_action": "Review the definition and specify the measurement window and final-value method.",
        "downstream_impact": "Deck preparation may preserve this provisional definition, but deterministic implementation requires the missing criteria.",
        "not_claimed": [
          "measurement_approval",
          "measurement_implementation",
          "measurement_result",
          "simulation_execution",
          "source_truth"
        ]
      },
      {
        "id": "meas_supply_current",
        "status": "blocked_missing_probe_node",
        "signal": "IDD",
        "definition": "average current between 2 ms and 3 ms",
        "basis": "synthetic fixture requested_measurements",
        "owner_action": "Identify the supply branch, device terminal, or simulator expression that defines IDD and confirm current polarity.",
        "downstream_impact": "The downstream consumer cannot implement this measurement until a valid probe target and polarity convention are supplied.",
        "not_claimed": [
          "probe_node",
          "polarity_convention",
          "measurement_approval",
          "measurement_implementation",
          "measurement_result",
          "simulation_execution",
          "source_truth"
        ]
      }
    ],
    "execution_scope_note": [
      {
        "id": "execution_scope_public_stimulus_fixture",
        "status": "packet_preparation_only",
        "basis": {
          "source_mode": "contract_only_synthetic",
          "project_scope_key": "public_stimulus_fixture",
          "mode": "seed_input_packet",
          "target_consumer": "simulation_deck_prepare_v0",
          "not_execution_authorization": true
        },
        "owner_action": "Resolve approvals and blockers before granting any separate execution authorization.",
        "downstream_impact": "The packet may support bounded deck preparation but does not authorize model acquisition, deck execution, result interpretation, or approval.",
        "not_claimed": [
          "execution_authorization",
          "simulation_execution",
          "deck_validation",
          "approval",
          "source_truth",
          "pass_fail_result"
        ]
      }
    ],
    "input_packet_blockers": [
      {
        "id": "blocker_simulator_policy_packet",
        "status": "blocking_execution",
        "basis": "simulator_policy_packet_missing_for_execution",
        "owner_action": "Provide or approve the simulator policy packet.",
        "downstream_impact": "Execution configuration and policy compliance cannot be established.",
        "not_claimed": [
          "policy_compliance",
          "execution_readiness"
        ]
      },
      {
        "id": "blocker_temperature_corner",
        "status": "blocking_execution",
        "basis": "temperature_corner_not_owner_approved",
        "owner_action": "Specify and approve the applicable temperature corner or corner set.",
        "downstream_impact": "The operating-condition matrix remains incomplete.",
        "not_claimed": [
          "temperature_approval",
          "corner_completeness",
          "execution_readiness"
        ]
      },
      {
        "id": "blocker_model_files",
        "status": "blocking_execution",
        "basis": "model_files_not_acquired",
        "owner_action": "Acquire and validate the authorized model files through the appropriate source-controlled process.",
        "downstream_impact": "A runnable and source-backed simulation deck cannot be completed.",
        "not_claimed": [
          "model_availability",
          "model_validity",
          "model_provenance",
          "execution_readiness"
        ]
      },
      {
        "id": "blocker_idd_probe_definition",
        "status": "blocking_measurement_implementation",
        "basis": "requested measurement meas_supply_current has state missing_probe_node",
        "owner_action": "Define the IDD probe target and polarity convention.",
        "downstream_impact": "Supply-current measurement cannot be implemented deterministically.",
        "not_claimed": [
          "probe_target",
          "measurement_implementation"
        ]
      }
    ],
    "boundary_review_note": [
      {
        "id": "boundary_review_public_safe_001",
        "status": "boundary_preserved_review_required",
        "basis": "Only the supplied public-safe workflow summary and synthetic fixture are represented.",
        "owner_action": "Review all seed-only, review-required, and blocked items before downstream execution or approval.",
        "downstream_impact": "Downstream use is restricted to provisional packet preparation within simulation_deck_prepare_v0.",
        "not_claimed": [
          "repository_access",
          "command_execution",
          "private_material_access",
          "raw_source_access",
          "upstream_modification",
          "execution",
          "approval",
          "source_truth",
          "pass_fail_result"
        ]
      }
    ]
  },
  "downstream_handoff": {
    "id": "handoff_simulation_deck_prepare_v0_001",
    "status": "provisional_blocked_for_execution",
    "target_consumer": "simulation_deck_prepare_v0",
    "handoff_contents": [
      "seed stimulus and load conditions",
      "review-required measurement definitions",
      "execution scope restrictions",
      "explicit blockers and owner actions",
      "public-safe boundary note"
    ],
    "next_action": "The owner and downstream consumer must resolve approvals, complete missing definitions, acquire authorized models, and supply simulator policy before execution readiness can be assessed.",
    "downstream_impact": "Deck preparation can begin only as provisional structuring; execution and result claims remain blocked.",
    "not_claimed": [
      "consumer_acceptance",
      "deck_completion",
      "execution_readiness",
      "execution_authorization",
      "simulation_results"
    ]
  },
  "boundary_review_note": {
    "id": "boundary_review_top_level_001",
    "status": "public_safe_contract_only",
    "provenance_summary": "Derived exclusively from the transformed frozen public-safe candidate prompt and its synthetic fixture.",
    "read_only_upstream_boundary": "preserved",
    "owner_action": "Maintain separation from repository, private, raw, secret, and execution-authorizing material during calibration review.",
    "downstream_impact": "This response may be evaluated as a packet artifact but cannot establish real-world source truth, execution, approval, or pass/fail status.",
    "not_claimed": [
      "repository_read",
      "command_execution",
      "private_or_secret_access",
      "upstream_write",
      "execution",
      "approval",
      "source_truth",
      "workflow_pass",
      "workflow_fail"
    ]
  },
  "completion_state": {
    "status": "quality_ready_packet_complete_with_blockers",
    "required_outputs_present": true,
    "packet_quality_scope": "All fixture-required output properties are populated with stable identifiers, statuses, bases or provenance, owner actions, downstream impacts, and explicit non-claims.",
    "execution_state": "not_executed",
    "approval_state": "not_approved",
    "source_truth_state": "not_established",
    "pass_fail_state": "not_claimed",
    "remaining_review_states": [
      "VIN transient-step parameters require review and completion",
      "VDD and load seeds require owner approval",
      "temperature corner requires owner approval",
      "settling-time and overshoot definitions require review",
      "IDD probe target and polarity are missing"
    ],
    "remaining_blockers": [
      "simulator_policy_packet_missing_for_execution",
      "temperature_corner_not_owner_approved",
      "model_files_not_acquired",
      "meas_supply_current_missing_probe_node"
    ]
  }
}
