{
  "simulation_run_packet": {
    "workflow_id": "simulation_run_verify_v0",
    "project_code": "PUBLIC_CAL_SIM",
    "run_id": "cal_20260515_quality_equiv",
    "cases": [
      {
        "case_id": "case_A_blocked",
        "status": "blocked",
        "execution_action": "do_not_execute",
        "basis": "Required model transistor_model_q1 is missing; measurement definitions are absent."
      },
      {
        "case_id": "case_B_executed_no_acceptance",
        "status": "result_packaged_without_owner_acceptance",
        "execution_action": "package_observed_stub_result",
        "basis": "Required models are present and dry-run execution is allowed with a synthetic stub."
      }
    ]
  },
  "run_manifest": {
    "project_binding": {
      "project_code": "PUBLIC_CAL_SIM",
      "run_id": "cal_20260515_quality_equiv",
      "output_root_repo_path": "_workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0"
    },
    "upstream_packets_read_only": true,
    "simulator_policies": {
      "case_A_blocked": "simulator_allowed_if_model_and_measurements_present",
      "case_B_executed_no_acceptance": "dry_run_allowed_with_synthetic_stub"
    },
    "execution_records": [
      {
        "case_id": "case_A_blocked",
        "execution_status": "not_executed",
        "runtime_action": "do_not_execute"
      },
      {
        "case_id": "case_B_executed_no_acceptance",
        "execution_status": "observed_stub_result_packaged",
        "runtime_action": "package_observed_stub_result"
      }
    ]
  },
  "measurement_results": [
    {
      "case_id": "case_A_blocked",
      "measurement_status": "unavailable",
      "measurements": []
    },
    {
      "case_id": "case_B_executed_no_acceptance",
      "measurement_status": "observed",
      "measurements": [
        {
          "measurement_id": "m_gain_db",
          "rule_id": "r_gain_min_20db",
          "value": 21.4,
          "unit": "dB",
          "source": "synthetic_stub_log"
        }
      ]
    }
  ],
  "result_verdicts": [
    {
      "case_id": "case_A_blocked",
      "verdict": "blocked",
      "rule_id": null,
      "basis": "Missing required model and measurement definition."
    },
    {
      "case_id": "case_B_executed_no_acceptance",
      "verdict": "pass",
      "measurement_id": "m_gain_db",
      "rule_id": "r_gain_min_20db",
      "basis": "Observed value 21.4 dB satisfies value_db >= 20.",
      "owner_acceptance": "not_provided"
    }
  ],
  "run_blockers": [
    {
      "case_id": "case_A_blocked",
      "blocker_id": "missing_transistor_model_q1",
      "category": "required_model",
      "status": "open",
      "effect": "Prevents execution."
    },
    {
      "case_id": "case_A_blocked",
      "blocker_id": "missing_measurement_definitions",
      "category": "measurement_definition",
      "status": "open",
      "effect": "Prevents a named-rule verdict."
    }
  ],
  "owner_followup_needed": [
    {
      "case_id": "case_A_blocked",
      "needed": [
        "Provide or approve transistor_model_q1.",
        "Provide or approve measurement definitions."
      ],
      "owner_acceptance_required": false
    },
    {
      "case_id": "case_B_executed_no_acceptance",
      "needed": [
        "Owner review is required before any acceptance decision."
      ],
      "owner_acceptance_required": true
    }
  ],
  "downstream_handoff": {
    "verification_plan_from_page_contracts_v0": {
      "trigger": "simulation_result_and_blocker_refresh",
      "cases": [
        "case_A_blocked",
        "case_B_executed_no_acceptance"
      ]
    },
    "review_gate_evidence_pack_v0": {
      "input": "accepted_or_blocked_simulation_result_summary",
      "availability": "case_A_blocked blocked summary available; case_B_executed_no_acceptance result available without owner acceptance"
    },
    "source_gap_followup_packet_v0": {
      "input": "run_blockers_and_owner_followup_needed",
      "availability": "case_A_blocked"
    }
  },
  "boundary_review_note": {
    "upstream_packets_mutated": false,
    "model_invented": false,
    "owner_acceptance_claimed": false,
    "harness_connection_promoted": false,
    "blocked_run_interpreted_as_failed_verification": false,
    "uncertainties": [
      "No owner decision references were supplied.",
      "Case B contains an observed synthetic-stub measurement, not owner acceptance."
    ]
  }
}
