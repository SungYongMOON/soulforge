workflow_id: simulator_policy_packet_v0
fixture_id: simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix
project_scope_key: public_sim_policy_fixture
source_mode: contract_only_synthetic
public_safe: true

simulator_policy_packet:
  policy_scope:
    target_simulators:
      - ngspice
      - ltspice
      - xyce
    allowed_use: pre-run policy and readiness gating only
    no_execution_claims: true
  simulator_policies:
    - simulator: ngspice
      allowed_scope: syntax smoke only
      authorization_posture: condition_satisfied_by_supplied_trusted_probe_evidence
      authorization_limit: does not authorize broader simulation, result acceptance, model approval, or installation
    - simulator: ltspice
      allowed_scope: none until trusted probe evidence exists
      authorization_posture: blocked
    - simulator: xyce
      allowed_scope: none until trusted probe evidence exists
      authorization_posture: blocked
  source_packet_context:
    - component: U1
      model_family: ltspice
      state: candidate_official_source_identified_not_locally_acquired
      treatment: read_only_context
      non_claim: no model acquisition, approval, or runtime readiness established
    - component: J1
      model_family: s_parameter
      state: owner_file_needed
      treatment: read_only_context
      non_claim: no owner file availability or model readiness established
  ownership_boundary:
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

runtime_probe_summary:
  - simulator: ngspice
    probe_ref: public_fixture_probe_ngspice_version_summary
    trust_state: trusted
    reported_result: probe_evidence_available
    reported_version: 42.x synthetic summary
    path_included: false
    uncertainty:
      - exact version is not supplied
      - executable path and runtime location are not supplied
      - current runtime availability is not established beyond the supplied probe summary
  - simulator: ltspice
    probe_ref: public_fixture_probe_ltspice_missing
    trust_state: untrusted_or_absent
    reported_result: no_trusted_runtime_evidence
    path_included: false
    uncertainty:
      - version is unknown
      - runtime identity and availability are not established
  - simulator: xyce
    probe_ref: public_fixture_probe_xyce_not_checked
    trust_state: untrusted_or_absent
    reported_result: not_probed
    path_included: false
    uncertainty:
      - version is unknown
      - runtime identity and availability are not established

execution_authorization_state:
  overall_state: partially_authorized_pre_run_scope
  execution_claimed: false
  simulator_states:
    ngspice:
      state: authorized_for_bounded_syntax_smoke
      basis:
        - owner policy permits syntax smoke after a trusted local probe
        - supplied fixture marks the ngspice probe summary as trusted
      prohibited_claims:
        - simulator execution occurred
        - syntax smoke passed
        - circuit simulation is authorized
        - models or decks are approved
        - results are accepted
    ltspice:
      state: not_authorized
      reason: trusted runtime probe evidence is absent
    xyce:
      state: not_authorized
      reason: runtime was not probed

runtime_blockers:
  - blocker_id: synthetic_blocker_ltspice_trusted_probe_missing
    simulator: ltspice
    state: blocking
    condition_to_clear: owner-recognized trusted runtime probe evidence becomes available
    stop_condition: do not authorize or represent ltspice execution readiness before clearance
  - blocker_id: synthetic_blocker_xyce_not_probed
    simulator: xyce
    state: blocking
    condition_to_clear: owner-recognized trusted runtime probe evidence becomes available
    stop_condition: do not authorize or represent xyce execution readiness before clearance
  - blocker_id: synthetic_blocker_u1_source_not_acquired
    component: U1
    model_family: ltspice
    state: blocking_for_model_dependent_future_work
    condition_to_clear: candidate official source is locally acquired and handled under owner-approved source policy
    stop_condition: do not claim model availability, approval, or simulation readiness
  - blocker_id: synthetic_blocker_j1_owner_file_needed
    component: J1
    model_family: s_parameter
    state: blocking_for_model_dependent_future_work
    condition_to_clear: owner supplies or explicitly approves the required file
    stop_condition: do not invent, substitute, or claim availability of the model
  - blocker_id: synthetic_blocker_ngspice_identity_incomplete
    simulator: ngspice
    state: nonblocking_for_bounded_syntax_smoke_but_blocking_for_broader_claims
    reason: exact version and executable path are absent
    stop_condition: do not extend authorization beyond the stated syntax-smoke scope

boundary_review_note:
  review_state: boundary_preserved
  conclusions:
    - The packet records policy and readiness posture only.
    - The supplied trusted ngspice probe evidence satisfies the owner's prerequisite only for a bounded syntax smoke.
    - No simulator execution, installation, deck generation, measurement, result, or acceptance is claimed.
    - Missing ltspice evidence and an unprobed xyce runtime remain blocked conditions, not failed simulations.
    - Upstream source summaries remain read-only and do not establish model approval or availability.
    - Broader authorization requires explicit owner scope plus the necessary trusted runtime and source evidence.
