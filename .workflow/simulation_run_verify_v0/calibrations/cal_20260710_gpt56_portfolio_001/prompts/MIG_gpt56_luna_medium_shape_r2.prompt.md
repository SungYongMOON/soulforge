You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=human; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.
Emit the exact public workflow output groups as top-level fields: simulation_run_packet, run_manifest, measurement_results, result_verdicts, run_blockers, owner_followup_needed, downstream_handoff, boundary_review_note.
This shape correction comes from the public workflow output contract and fixture handoff; it is not evaluator or golden material.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: simulation_run_verify_v0
kind: workflow
status: active
title: Simulation Run Verify v0
summary: Run a bounded simulation or validate that a simulation run cannot start, then package execution metadata, measurement outputs, blocker states, and result verdicts without overclaiming acceptance or replacing upstream source authority.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - simulation_run_binding
  - prepared_deck_packet_refs
  - approved_simulation_run_policy
optional_inputs:
  - model_inventory_refs
  - simulator_compatibility_matrix_refs
  - measurement_definition_refs
  - verification_plan_refs
  - owner_decision_refs
  - baseline_refs
outputs:
  - simulation_run_packet
  - run_manifest
  - measurement_results
  - result_verdicts
  - run_blockers
  - owner_followup_needed
  - downstream_handoff
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
workflow_modes:
  - execute_or_block
  - rerun_update
  - result_only_refresh
verdict_values:
  - pass
  - fail
  - inconclusive
  - blocked
  - not_executed
upstream_workflows:
  - workflow_id: simulation_deck_prepare_v0
    expected_outputs:
      - simulation_deck_packet
      - deck_input_manifest
      - model_dependency_map
      - unresolved_deck_inputs
      - deck_prepare_blockers
      - owner_followup_needed
      - downstream_handoff
  - workflow_id: simulation_source_collect_v0
    expected_outputs:
      - simulation_source_packet
      - model_inventory
      - simulator_compatibility_matrix
    status: supporting_input
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_outputs:
      - verification_requirements_matrix
      - test_or_simulation_readiness
      - trr_readiness_handoff
    status: optional_verification_scope_input
downstream_workflows:
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: simulation_result_and_blocker_refresh
    status: rerun_trigger_only
  - workflow_id: review_gate_evidence_pack_v0
    expected_input: accepted_or_blocked_simulation_result_summary
    status: later_review_consumer
  - workflow_id: source_gap_followup_packet_v0
    expected_input: run_blockers_and_owner_followup_needed
    status: rerun_trigger_only
simulation_run_contract:
  owns:
    - bounded_run_identity
    - execution_or_block_decision
    - run_manifest
    - measurement_result_packet
    - result_verdict_rows
    - run_blockers
    - owner_followup_for_failed_prerequisites
    - downstream_handoff_for_verification_and_review
  does_not_own:
    - source_xml_mutation
    - model_invention
    - deck_prepare_authority_replacement
    - owner_acceptance_of_results
    - harness_connection_promotion
  authority_boundary:
    blocked_run_is_not_failed_verification: true
    pass_fail_is_not_owner_acceptance: true
    upstream_packets_are_read_only: true
    verdict_requires_named_measurement_or_rule: true
    missing_measurement_definition_blocks_verdict: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow may execute a bounded simulation when allowed and when prerequisites are met, or explicitly record that execution is blocked.
  - Result packets must separate execution metadata, measured outputs, verdict criteria, and owner acceptance.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.
  - Public workflow files must not contain raw model payloads, generated decks, waveform files, runtime absolute paths, `_workspaces` outputs, credentials, cookies, sessions, or private run truth.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: simulation_run_verify_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_run_binding
    title: Prepare Run Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_simulation_run_binding_setup
    summary: Resolve bounded output root and confirm execution policy before any simulation run attempt.
  - step_id: verify_run_prerequisites
    title: Verify Run Prerequisites
    actor_slot: run_preflight_curator
    action:
      kind: deck_and_measurement_preflight
    summary: Verify deck-preparation outputs, measurement definitions, simulator policy, and baseline refs before execution or blocker recording.
  - step_id: write_result_or_blocker_packet
    title: Write Result Or Blocker Packet
    actor_slot: result_packet_writer
    action:
      kind: simulation_result_or_blocker_write
    summary: Write execution metadata plus measurements and verdicts when run is allowed, or explicit blockers when not.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: run_verify_bundle_write_and_boundary_review
    summary: Confirm no overclaim of acceptance or mutated upstream artifacts, then publish the bounded packet.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
  "project_code": "PUBLIC_CAL_SIM",
  "run_id": "cal_20260515_quality_equiv",
  "output_root_repo_path": "_workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0",
  "approved_simulation_run_policy": {
    "upstream_packets_are_read_only": true,
    "blocked_run_is_not_failed_result": true,
    "verdict_requires_named_measurement_or_rule": true
  },
  "case_A_blocked": {
    "deck_packet_ref": "synthetic/deck_packet_A.yaml",
    "deck_state": "deck_prepared",
    "simulator_policy": "simulator_allowed_if_model_and_measurements_present",
    "model_inventory": "missing transistor_model_q1",
    "measurement_definitions": [],
    "owner_decision_refs": [],
    "expected_runtime_action": "do_not_execute"
  },
  "case_B_executed_no_acceptance": {
    "deck_packet_ref": "synthetic/deck_packet_B.yaml",
    "deck_state": "deck_prepared",
    "simulator_policy": "dry_run_allowed_with_synthetic_stub",
    "model_inventory": {
      "all_required_models_present": true
    },
    "measurement_definitions": [
      {
        "measurement_id": "m_gain_db",
        "rule_id": "r_gain_min_20db",
        "pass_condition": "value_db >= 20"
      }
    ],
    "observed_measurements": [
      {
        "measurement_id": "m_gain_db",
        "value_db": 21.4,
        "unit": "dB",
        "source": "synthetic_stub_log"
      }
    ],
    "owner_decision_refs": [],
    "expected_runtime_action": "package_observed_stub_result"
  }
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
