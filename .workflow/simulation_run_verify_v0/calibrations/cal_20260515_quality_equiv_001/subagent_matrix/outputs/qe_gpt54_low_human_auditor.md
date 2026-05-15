**simulation_run_packet**
```yaml
workflow_id: simulation_run_verify_v0
candidate_profile:
  model: gpt-5.4
  reasoning_effort: low
  species: human
  class: auditor
fixture_scope: public-safe synthetic fixture only
execution_mode: verification packaging only
real_simulator_execution_claimed: false
upstream_packet_mutation: none
project_code: PUBLIC_CAL_SIM
run_id: cal_20260515_quality_equiv
output_root_repo_path: _workmeta/PUBLIC_CAL_SIM/runs/cal_20260515_quality_equiv/simulation_run/simulation_run_verify_v0
policy_checks:
  upstream_packets_are_read_only: satisfied
  blocked_run_is_not_failed_result: satisfied
  verdict_requires_named_measurement_or_rule: satisfied
cases_reviewed:
  - case_A_blocked
  - case_B_executed_no_acceptance
```

**run_manifest**
```yaml
run_entries:
  - case_id: case_A_blocked
    deck_packet_ref: synthetic/deck_packet_A.yaml
    deck_state: deck_prepared
    simulator_policy: simulator_allowed_if_model_and_measurements_present
    expected_runtime_action: do_not_execute
    observed_execution_state: not_executed
    basis:
      - missing transistor model inventory item: transistor_model_q1
      - no measurement definitions provided

  - case_id: case_B_executed_no_acceptance
    deck_packet_ref: synthetic/deck_packet_B.yaml
    deck_state: deck_prepared
    simulator_policy: dry_run_allowed_with_synthetic_stub
    expected_runtime_action: package_observed_stub_result
    observed_execution_state: synthetic_stub_result_packaged
    basis:
      - all required models marked present
      - one named measurement definition present
      - one synthetic observed measurement present
```

**measurement_results**
```yaml
case_measurements:
  - case_id: case_A_blocked
    measurements: []
    measurement_status: not_executed
    note: no measurement_definitions were supplied, so no verifiable measurement result exists

  - case_id: case_B_executed_no_acceptance
    measurements:
      - measurement_id: m_gain_db
        observed_value: 21.4
        unit: dB
        source: synthetic_stub_log
        linked_rule_id: r_gain_min_20db
        pass_condition: value_db >= 20
        rule_evaluation: pass
    measurement_status: observed_from_synthetic_stub
```

**result_verdicts**
```yaml
verdicts:
  - case_id: case_A_blocked
    execution_verdict: blocked_not_executed
    verification_verdict: blocked
    cited_basis:
      - rule: simulator_allowed_if_model_and_measurements_present
      - measurement_requirement_status: no named measurements defined
      - model_requirement_status: missing transistor_model_q1
    failure_classification: not_a_failed_result
    acceptance_status: not_submitted_for_owner_acceptance

  - case_id: case_B_executed_no_acceptance
    execution_verdict: synthetic_measurement_pass_observed
    verification_verdict: pass_for_named_measurement_only
    cited_basis:
      - measurement_id: m_gain_db
      - rule_id: r_gain_min_20db
      - observed_value: 21.4 dB
      - pass_condition: value_db >= 20
    acceptance_status: owner_acceptance_missing
    final_run_acceptance: not_granted
```

**run_blockers**
```yaml
blockers:
  - case_id: case_A_blocked
    blocker_id: b_missing_model_q1
    blocker_type: prerequisite_missing
    blocker_detail: transistor_model_q1 missing from model inventory
    effect: simulation must not be executed under the stated simulator policy

  - case_id: case_A_blocked
    blocker_id: b_missing_measurement_definitions
    blocker_type: verification_definition_missing
    blocker_detail: measurement_definitions list is empty
    effect: no named measurement exists to support any pass/fail verification verdict
```

**owner_followup_needed**
```yaml
followup_items:
  - case_id: case_A_blocked
    owner_action_needed: provide transistor_model_q1 or revise model requirements
    reason: execution prerequisite is blocked by missing named model

  - case_id: case_A_blocked
    owner_action_needed: provide named measurement definitions with rules
    reason: verdict policy requires named measurement or rule citation

  - case_id: case_B_executed_no_acceptance
    owner_action_needed: record explicit acceptance or rejection decision
    reason: observed measurement pass does not imply owner acceptance
    decision_refs_present: []
```

**downstream_handoff**
```yaml
handoff_status:
  upstream_packets: read_only_preserved
  downstream_ready_items:
    - case_B_executed_no_acceptance measurement packet can be handed off as synthetic observed evidence only
  downstream_blocked_items:
    - case_A_blocked cannot proceed to result evaluation until model inventory and measurement definitions are supplied
  required_consumer_cautions:
    - do not treat blocked_not_executed as failed verification
    - do not treat synthetic measurement pass as owner acceptance
    - do not claim real simulator execution from this packet
```

**boundary_review_note**
```yaml
boundary_note:
  fixture_only: true
  files_read: false
  commands_run: false
  real_simulator_execution_claimed: false
  owner_acceptance_invented: false
  public_safe_output: true
  summary:
    - case_A_blocked remained blocked and not executed due to missing named prerequisites
    - case_B_executed_no_acceptance shows a named measurement pass against a named rule, but has no owner acceptance record
```