```yaml
workflow_id: simulator_policy_packet_v0
fixture_id: simulator_policy_packet_v0_public_synthetic_blocked_and_authorized_runtime_mix
project_binding:
  project_scope_key: public_sim_policy_fixture
  source_mode: contract_only_synthetic
  public_safe: true

simulator_policy_packet:
  target_simulators:
    - ngspice
    - ltspice
    - xyce
  allowed_use: pre-run policy and readiness gating only
  bounded_scope:
    ngspice: syntax smoke only, subject to trusted local probe evidence
    ltspice: no use authorized until trusted probe evidence exists
    xyce: no use authorized until trusted probe evidence exists
  owner_authorization_posture:
    statement: ngspice syntax smoke allowed after trusted local probe; ltspice and xyce not authorized until probe evidence exists
    execution_claims_allowed: false

runtime_probe_summary:
  ngspice:
    trusted: true
    version_summary: 42.x synthetic summary
    probe_ref: public_fixture_probe_ngspice_version_summary
    path_included: false
    evidence_state: probe_evidence_available
    runtime_identity_state: synthetic_summary_only
  ltspice:
    trusted: false
    probe_ref: public_fixture_probe_ltspice_missing
    path_included: false
    evidence_state: no_trusted_runtime_evidence
  xyce:
    trusted: false
    probe_ref: public_fixture_probe_xyce_not_checked
    path_included: false
    evidence_state: not_probed

execution_authorization_state:
  overall: pre_run_only
  ngspice:
    state: conditionally_authorized
    scope: syntax smoke only
    prerequisite: trusted local probe evidence
    execution_claimed: false
  ltspice:
    state: blocked
    reason: no trusted runtime probe evidence
    execution_claimed: false
  xyce:
    state: blocked
    reason: runtime not probed and no trusted probe evidence
    execution_claimed: false
  simulation_execution: not authorized by this packet
  run_acceptance: not owned
  measurement_results: not available from this packet

runtime_blockers:
  - blocker_id: runtime_blocker_ltspice_probe_missing
    simulator: ltspice
    status: open
    condition: trusted runtime probe evidence is absent
    stop_condition: do not prepare or execute an ltspice lane requiring runtime readiness
  - blocker_id: runtime_blocker_xyce_not_probed
    simulator: xyce
    status: open
    condition: trusted runtime probe evidence is absent because the runtime was not probed
    stop_condition: do not prepare or execute an xyce lane requiring runtime readiness
  - blocker_id: runtime_blocker_source_packet_gaps
    status: open
    condition: source packet summaries identify unresolved local inputs
    affected_inputs:
      - component: U1
        model_family: ltspice
        state: candidate_official_source_identified_not_locally_acquired
      - component: J1
        model_family: s_parameter
        state: owner_file_needed
    stop_condition: downstream source or deck work must preserve these gaps as blockers

boundary_review_note:
  conclusion: trusted ngspice synthetic probe evidence is recorded; ltspice and xyce remain blocked
  non_claims:
    - no simulator installation is claimed
    - no simulator execution is claimed
    - no simulation deck is generated
    - no model approval is granted
    - no measurement result is produced
    - no run acceptance is granted
    - no owner acceptance beyond the stated bounded scope is inferred
    - missing runtime evidence is not treated as failed simulation
  upstream_packets_read_only: true
  downstream_handoff_posture:
    simulation_source_collect_v0: may receive this packet or the blocker summary
    simulation_deck_prepare_v0: must preserve execution authorization state
    simulation_run_verify_v0: must not infer readiness for blocked simulators
    verification_plan_from_page_contracts_v0: may use this as a simulator-policy readiness reference
```
