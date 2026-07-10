```yaml
workflow_id: test_harness_asset_planning_v0
fixture_id: PUBLIC_SYNTH_TEST_HARNESS_ASSET_PLANNING_V0
public_safe: true
planning_status: planning_only
authority_basis:
  - synthetic_workflow_contract
  - public_safe_synthetic_input_fixture
non_claims:
  - no_test_execution
  - no_simulation_execution
  - no_trr_approval
  - no_verification_result_acceptance
  - no_upstream_artifact_mutation

project_binding:
  binding_id: SYNTH_TEST_HARNESS_BINDING_V0
  scope: page_modules_and_composed_harness_candidates
  output_root: SYNTHETIC_OUTPUT_ROOT_TBD
  source_refs:
    - test_harness_planning_binding
    - verification_readiness_refs
    - approved_test_harness_planning_policy
  resolution_status: bounded_by_fixture_only

test_harness_manifest:
  manifest_id: SYNTH_TEST_HARNESS_MANIFEST_V0
  assets:
    - asset_id: SYNTH_PHYSICAL_FIXTURE_001
      asset_class: physical_test_fixture
      purpose: support representative physical verification item
      identity_status: planned
      availability: unknown
      owner: TBD
    - asset_id: SYNTH_SIMULATION_HARNESS_001
      asset_class: simulation_harness
      purpose: support representative simulation verification item
      identity_status: planned
      availability: unknown
      owner: TBD

test_interface_list:
  - interface_id: SYNTH_INTERFACE_001
    target_asset_id: SYNTH_PHYSICAL_FIXTURE_001
    interface_scope: physical_fixture_connection_and_observation_points
    details: TBD from approved interface requirements
    readiness: not_confirmed
  - interface_id: SYNTH_INTERFACE_002
    target_asset_id: SYNTH_SIMULATION_HARNESS_001
    interface_scope: simulation_input_output_boundary
    details: TBD from approved simulation requirements
    readiness: not_confirmed

simulation_fixture_needs:
  - need_id: SYNTH_SIM_NEED_001
    harness_id: SYNTH_SIMULATION_HARNESS_001
    need: simulation fixture or equivalent bounded stimulus model
    source_requirement: verification_readiness_refs
    availability: unknown
    preparation_status: not_started
    execution_status: not_performed

instrumentation_resource_list:
  - resource_id: SYNTH_INSTRUMENT_RESOURCE_001
    resource_class: measurement_or_observation_resource
    supports:
      - SYNTH_PHYSICAL_FIXTURE_001
    identity: TBD
    calibration_or_validity: not_confirmed
    availability: unknown
    owner: TBD

trr_readiness_checklist:
  - row_id: SYNTH_TRR_ROW_001
    check: physical fixture identity and availability
    status: open
    evidence_ref: none_supplied
  - row_id: SYNTH_TRR_ROW_002
    check: simulation harness and fixture definition
    status: open
    evidence_ref: none_supplied
  - row_id: SYNTH_TRR_ROW_003
    check: test interface inventory completeness
    status: open
    evidence_ref: none_supplied
  - row_id: SYNTH_TRR_ROW_004
    check: instrumentation resource identification and availability
    status: open
    evidence_ref: none_supplied
  - row_id: SYNTH_TRR_ROW_005
    check: owner confirmation of missing resources
    status: open
    evidence_ref: none_supplied
  checklist_status: readiness_not_confirmed
  approval_status: not_an_approval

planning_blockers:
  - blocker_id: SYNTH_PLANNING_BLOCKER_001
    description: required harness and resource identities or availability are not established by the supplied fixture
    severity: planning_blocker
    resolution_owner: TBD
    resolution_input: owner_decision_or_source_packet
    stop_condition: do_not_promote_to_readiness_confirmed

owner_followup_needed:
  - followup_id: SYNTH_OWNER_FOLLOWUP_001
    request: identify or confirm owners and availability for the physical fixture, simulation harness, and instrumentation resource
    owner: TBD
    response_required_before:
      - readiness_confirmation
      - TRR preparation handoff
    status: required

boundary_review_note:
  review_id: SYNTH_BOUNDARY_REVIEW_001
  result: bounded
  confirmed:
    - output is an asset plan and readiness checklist only
    - planning blockers remain explicit
    - upstream references are treated as read_only
    - public_safe_synthetic_scope_is_preserved
  prohibited_claims:
    - execution_completed
    - simulation_completed
    - TRR_approved
    - readiness_accepted
    - upstream_artifacts_changed
```
