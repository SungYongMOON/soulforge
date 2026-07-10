```yaml
workflow_id: physical_configuration_audit_asset_package_v0
fixture_id: PUBLIC_SYNTH_PHYSICAL_CONFIGURATION_AUDIT_ASSET_PACKAGE_V0
source_kind: synthetic_from_workflow_contract
public_safe: true
status: fixture_derived
audit_scope:
  project_binding: physical_audit_project_binding
  baseline_refs:
    - baseline_manifest_refs
  policy_ref: approved_physical_audit_policy
  source_authority: declared_fixture_inputs_only

physical_audit_packet:
  audit_type: physical_configuration_audit
  baseline_alignment_assessed: true
  functional_adequacy_assessed: false
  upstream_artifacts_mutated: false

artifact_inventory_report:
  rows:
    - row_id: SYNTH_ARTIFACT_ROW_001
      artifact_ref: SYNTH_ARTIFACT_MATCH_001
      baseline_ref: baseline_manifest_refs
      presence: present
      checksum_status: match
      checksum_values: not_provided
      source_ref: not_provided
      attachment_record: not_provided
      disposition: aligned
    - row_id: SYNTH_ARTIFACT_ROW_002
      artifact_ref: SYNTH_ARTIFACT_MISSING_001
      baseline_ref: baseline_manifest_refs
      presence: missing
      checksum_status: not_evaluated
      checksum_values: not_provided
      source_ref: not_provided
      attachment_record: not_provided
      disposition: missing_artifact
  inventory_completeness: partial
  uncertainty:
    - Exact artifact names, paths, checksum values, and attachment records were not supplied.

checksum_report:
  checks:
    - check_id: SYNTH_CHECKSUM_CHECK_001
      artifact_ref: SYNTH_ARTIFACT_MATCH_001
      result: match
      expected_checksum: not_provided
      observed_checksum: not_provided
    - check_id: SYNTH_CHECKSUM_CHECK_002
      artifact_ref: SYNTH_ARTIFACT_MISSING_001
      result: not_evaluated
      reason: artifact_missing

missing_or_mismatched_artifacts:
  missing:
    - discrepancy_id: SYNTH_MISSING_DISCREPANCY_001
      artifact_ref: SYNTH_ARTIFACT_MISSING_001
      status: confirmed_by_fixture
      required_followup: owner_or_upstream_artifact_owner
  mismatched: []

release_blocking_discrepancies:
  - discrepancy_id: SYNTH_RELEASE_BLOCKER_001
    artifact_ref: not_specified_by_fixture
    classification: release_blocking_discrepancy
    basis: scenario_fact_only
    exact_cause: not_provided
    resolution_owner: not_assigned
    release_status: blocked_pending_owner_resolution

owner_followup_needed:
  - followup_id: SYNTH_OWNER_FOLLOWUP_001
    subject: missing_artifact
    owner: not_assigned
    action: identify_owner_and_supply_or formally disposition missing artifact
  - followup_id: SYNTH_OWNER_FOLLOWUP_002
    subject: release_blocking_discrepancy
    owner: not_assigned
    action: identify cause, decision authority, and disposition
  - followup_id: SYNTH_OWNER_FOLLOWUP_003
    subject: incomplete_source_details
    owner: not_assigned
    action: provide artifact identity, checksum values, attachment records, and source references if required

closure_handoff:
  state: open
  handoff_to: owner_decision_or_upstream_followup
  completion_conditions:
    - Missing artifact is supplied or formally dispositioned.
    - Release-blocking discrepancy is resolved or owner-approved for disposition.
    - Required artifact identity and evidence references are available.
    - Boundary review confirms no functional-acceptance claim.
  stop_conditions:
    - Do not close while the release-blocking discrepancy remains unresolved.
    - Do not infer missing checksum, source, attachment, or ownership data.
    - Do not mutate upstream artifacts.
    - Do not treat this audit as functional acceptance.

boundary_review_note:
  physical_audit_is_not_functional_acceptance: true
  baseline_approval_claimed: false
  functional_acceptance_claimed: false
  upstream_artifacts_read_only: true
  hidden_private_evidence_used: false
  tool_use_claimed: false
  runtime_verification_claimed: false
  public_safe_synthetic_boundary: preserved
```
