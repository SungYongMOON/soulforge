workflow_id: physical_configuration_audit_asset_package_v0
fixture_id: PUBLIC_SYNTH_PHYSICAL_CONFIGURATION_AUDIT_ASSET_PACKAGE_V0
deliverable_kind: physical_audit_packet
public_safe: true
status: incomplete_release_blocked

project_binding:
  binding_ref: physical_audit_project_binding
  scope: synthetic_release_candidate_asset_package
  baseline_manifest_ref: baseline_manifest_refs
  audit_policy_ref: approved_physical_audit_policy
  authority:
    owns:
      - audit_scope_identity
      - artifact_inventory_rows
      - checksum_and_presence_checks
      - mismatch_and_release_blocker_register
      - closure_handoff
    does_not_own:
      - baseline_approval
      - functional_acceptance
      - upstream_packet_mutation

artifact_inventory_report:
  rows:
    - artifact_id: SYNTH_ARTIFACT_001
      baseline_expectation: present
      package_presence: present
      checksum_status: match
      disposition: aligned
      release_blocking: false
      evidence_basis: synthetic_scenario_fact
    - artifact_id: SYNTH_ARTIFACT_002
      baseline_expectation: present
      package_presence: missing
      checksum_status: not_evaluable
      disposition: discrepancy
      release_blocking: true
      evidence_basis: synthetic_scenario_fact
  inventory_limitations:
    - No additional artifact rows are established by the fixture.
    - Artifact contents, paths, versions, and checksum values are unspecified.

checksum_report:
  summary:
    matched: 1
    mismatched: 0
    not_evaluable_due_to_missing_artifact: 1
  checks:
    - artifact_id: SYNTH_ARTIFACT_001
      result: match
      checksum_value: unspecified
    - artifact_id: SYNTH_ARTIFACT_002
      result: not_evaluable
      reason: artifact_missing
      checksum_value: unspecified

missing_or_mismatched_artifacts:
  - discrepancy_id: SYNTH_DISCREPANCY_001
    artifact_id: SYNTH_ARTIFACT_002
    discrepancy_type: missing_artifact
    observed_state: absent_from_declared_package
    expected_state: present_per_declared_baseline
    checksum_effect: comparison_not_possible
    source_boundary: synthetic_fixture_only

release_blocking_discrepancies:
  - discrepancy_id: SYNTH_DISCREPANCY_001
    blocking_status: release_blocking
    blocking_reason: required_baseline artifact is missing
    required_resolution:
      - Restore or attach the expected artifact through the authorized upstream process.
      - Reconcile its identity against the declared baseline.
      - Perform the applicable checksum comparison.
      - Repeat the bounded physical configuration audit.
    stop_condition: Release closure must not be declared while this discrepancy remains unresolved.

owner_followup_needed:
  required: true
  items:
    - followup_id: SYNTH_FOLLOWUP_001
      owner: authorized_baseline_or_package_owner
      decision_needed: Determine the authorized disposition of the missing artifact.
      permitted_outcomes:
        - supply_artifact_and_reaudit
        - approve_baseline_change_through_upstream_change_control
      prohibited_shortcut: This audit cannot waive the discrepancy or alter the baseline.

closure_handoff:
  audit_result: not_closed
  release_posture: blocked
  aligned_items:
    - SYNTH_ARTIFACT_001
  unresolved_items:
    - SYNTH_DISCREPANCY_001
  rerun_trigger: authorized discrepancy resolution or approved upstream baseline change
  downstream_summary: One checksum match is recorded; one baseline artifact is missing and constitutes one release-blocking discrepancy.

boundary_review_note:
  upstream_artifacts_treated_as_read_only: true
  baseline_approval_claimed: false
  functional_acceptance_claimed: false
  functional_adequacy_evaluated: false
  upstream_mutation_claimed: false
  runtime_verification_claimed: false
  evidence_scope: public_safe_synthetic_fixture
  uncertainty:
    - The fixture does not identify real artifacts, checksum algorithms, checksum values, attachment records, versions, paths, or approving owners.
    - The relationship between the missing artifact and any system function is unknown and is outside this audit.
    - No conclusion is made about functional adequacy, safety, performance, or baseline correctness.
