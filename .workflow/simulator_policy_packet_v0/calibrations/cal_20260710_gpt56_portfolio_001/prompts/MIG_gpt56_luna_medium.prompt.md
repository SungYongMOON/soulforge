You are executing one isolated, public-safe Soulforge workflow calibration candidate.
Produce the final workflow deliverable for the supplied synthetic fixture. Do not discuss model selection or scoring.
Do not claim that you ran commands, opened files, contacted services, changed state, sent messages, or verified runtime facts.
Use only the contract and fixture below. Preserve explicit uncertainty, source/owner boundaries, stop conditions, and non-claims.
Assigned orchestration profile: model=gpt-5.6-luna; reasoning_effort=medium; species=dwarf; class=auditor.
The species/class labels are role metadata, not authority to invent facts or bypass the workflow contract.

--- CURRENT WORKFLOW CONTRACT (PUBLIC CANON) ---
workflow_id: simulator_policy_packet_v0
kind: workflow
status: active
title: Simulator Policy Packet v0
summary: Record trusted local simulator runtime identity or probe evidence, owner execution authorization posture, allowed simulator family and scope, and runtime blockers before simulation lanes claim execution readiness.
entrypoint: run
execution_mode: local_tool_sequence
role_slots: role_slots.yaml
step_graph: step_graph.yaml
handoff_rules: handoff_rules.yaml
monster_rules: monster_rules.yaml
party_compatibility: party_compatibility.yaml
profile_policy: profile_policy.yaml
inputs:
  - simulator_policy_scope
  - simulator_policy_statement
  - approved_simulator_policy
optional_inputs:
  - runtime_probe_refs
  - candidate_demo_circuit_refs
  - simulation_source_packet_refs
  - owner_runtime_artifact_refs
  - stimuli_template_refs
  - measurement_definition_template_refs
outputs:
  - simulator_policy_packet
  - runtime_probe_summary
  - execution_authorization_state
  - runtime_blockers
  - boundary_review_note
validation_level: pilot_executed_private_fixture
registration_policy: owner_requested_registration
downstream_workflows:
  - workflow_id: simulation_source_collect_v0
    expected_input: simulator_policy_packet_or_runtime_blocker_summary
  - workflow_id: simulation_deck_prepare_v0
    expected_input: simulator_policy_packet_and_execution_authorization_state
  - workflow_id: simulation_run_verify_v0
    expected_input: simulator_policy_packet_and_execution_authorization_state
  - workflow_id: verification_plan_from_page_contracts_v0
    expected_input: simulator_policy_ref_for_simulation_readiness
simulator_policy_contract:
  owns:
    - simulator_policy_identity
    - trusted_runtime_probe_summary
    - execution_authorization_state
    - runtime_blocker_register
    - bounded_scope_for_simulator_use
  does_not_own:
    - simulator_installation
    - model_invention
    - simulation_deck_generation
    - simulator_execution
    - measurement_results
    - run_acceptance
  authority_boundary:
    packet_is_not_runtime_installation: true
    packet_is_not_run_result: true
    packet_is_not_model_approval: true
    packet_is_not_owner_acceptance_beyond_scope: true
    upstream_packets_are_read_only: true
    missing_runtime_is_not_failed_simulation: true
  required_output_shapes:
    project_binding: templates/project_binding.template.yaml
notes:
  - This workflow is explicitly pre-run and may validly conclude that no trusted runtime is available.
  - The first private pilot exercised the blocked-runtime path only and did not claim execution authorization.
  - Public workflow canon stores only portable orchestration rules, state semantics, and sanitized templates.


--- CURRENT STEP GRAPH (PUBLIC CANON) ---
workflow_id: simulator_policy_packet_v0
kind: step_graph
status: active
steps:
  - step_id: prepare_policy_binding
    title: Prepare Policy Binding
    actor_slot: workflow_runner
    action:
      kind: project_local_simulator_policy_binding_setup
    summary: Resolve bounded simulator-policy scope and output root.
  - step_id: curate_policy_statement
    title: Curate Policy Statement
    actor_slot: policy_curator
    action:
      kind: simulator_policy_scope_and_authorization_inventory
    summary: Record intended simulator family, scope, and current owner authorization posture.
  - step_id: map_runtime_probe_and_blockers
    title: Map Runtime Probe And Blockers
    actor_slot: runtime_probe_mapper
    action:
      kind: trusted_runtime_probe_and_blocker_split
    summary: Separate trusted runtime evidence from blocked or missing runtime conditions.
  - step_id: write_bundle_and_boundary_review
    title: Write Bundle And Boundary Review
    actor_slot: boundary_reviewer
    action:
      kind: simulator_policy_bundle_write_and_boundary_review
    summary: Confirm that missing runtime remains blocked and no execution authorization is invented.


--- PUBLIC-SAFE SYNTHETIC INPUT FIXTURE ---
{
    "simulator_policy_scope":  {
                                   "target_simulators":  [
                                                             "ngspice",
                                                             "ltspice",
                                                             "xyce"
                                                         ],
                                   "allowed_use":  "pre-run policy and readiness gating only",
                                   "owner_authorization":  "ngspice syntax smoke allowed after trusted local probe; ltspice and xyce not authorized until probe evidence exists",
                                   "no_execution_claims":  true
                               },
    "public_safe":  true,
    "runtime_probe_refs":  [
                               {
                                   "version":  "42.x synthetic summary",
                                   "path_included":  false,
                                   "simulator":  "ngspice",
                                   "trusted":  true,
                                   "probe_ref":  "public_fixture_probe_ngspice_version_summary",
                                   "result":  "probe_evidence_available"
                               },
                               {
                                   "trusted":  false,
                                   "simulator":  "ltspice",
                                   "result":  "no_trusted_runtime_evidence",
                                   "probe_ref":  "public_fixture_probe_ltspice_missing",
                                   "path_included":  false
                               },
                               {
                                   "trusted":  false,
                                   "simulator":  "xyce",
                                   "result":  "not_probed",
                                   "probe_ref":  "public_fixture_probe_xyce_not_checked",
                                   "path_included":  false
                               }
                           ],
    "fixture_id":  "simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix",
    "project_scope_key":  "public_sim_policy_fixture",
    "source_mode":  "contract_only_synthetic",
    "required_outputs":  [
                             "simulator_policy_packet",
                             "runtime_probe_summary",
                             "execution_authorization_state",
                             "runtime_blockers",
                             "boundary_review_note"
                         ],
    "source_packet_summaries":  [
                                    {
                                        "model_family":  "ltspice",
                                        "component":  "U1",
                                        "state":  "candidate_official_source_identified_not_locally_acquired"
                                    },
                                    {
                                        "model_family":  "s_parameter",
                                        "component":  "J1",
                                        "state":  "owner_file_needed"
                                    }
                                ]
}


Return only the usable deliverable. Keep every identifier synthetic and public-safe.
