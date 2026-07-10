workflow_id: functional_configuration_audit_page_library_v0
fixture_id: PUBLIC_SYNTH_FUNCTIONAL_CONFIGURATION_AUDIT_PAGE_LIBRARY_V0
deliverable_kind: functional_audit_packet
public_safe: true

project_binding:
  binding_id: SYNTH_AUDIT_BINDING_001
  scope_ref: SYNTH_AUDIT_SCOPE_001
  policy_ref: SYNTH_APPROVED_AUDIT_POLICY_001
  scope_description: Synthetic page-module and harness claim audit.
  upstream_artifacts_mode: read_only
  excluded_authorities:
    - verification_execution
    - result_acceptance
    - baseline_approval
    - owner_acceptance
    - upstream_packet_mutation

functional_audit_packet:
  packet_id: SYNTH_FUNCTIONAL_AUDIT_PACKET_001
  audit_scope_identity: SYNTH_AUDIT_SCOPE_001
  source_kind: synthetic_from_workflow_contract
  evidence_interpretation:
    accepted_evidence_only: true
    evidence_contents_supplied: false
    limitation: The fixture declares claim outcomes but supplies no underlying evidence content, test values, thresholds, configuration identities, or owner decisions.
  claim_summary:
    total_claims: 3
    verified: 1
    unverified: 1
    discrepant: 1
    residual_risk_rows: 1
  acceptance_status: not_assessed
  owner_signoff_status: not_provided

verified_claim_register:
  - claim_id: SYNTH_CLAIM_VERIFIED_001
    claim_description: Synthetic functional claim declared verified by the fixture.
    configured_item_ref: SYNTH_CONFIGURED_ITEM_001
    evidence_ref: SYNTH_ACCEPTED_EVIDENCE_REF_001
    evidence_status: accepted_evidence_declared_by_fixture
    audit_classification: verified
    limitations:
      - Evidence content and provenance are not included.
      - Verification execution is outside this workflow.
      - Classification is not result acceptance or owner signoff.

unverified_claim_register:
  - claim_id: SYNTH_CLAIM_UNVERIFIED_001
    claim_description: Synthetic functional claim lacking sufficient accepted evidence.
    configured_item_ref: SYNTH_CONFIGURED_ITEM_002
    evidence_ref: null
    audit_classification: unverified
    gap: No accepted verification evidence is identified in the fixture.
    closure_route:
      owner: verification_evidence_owner
      requested_outcome: Provide an accepted evidence reference or retain the claim as unverified.
    stop_condition: Do not promote this claim to verified without accepted evidence traceable to the audited configuration.

discrepancy_register:
  - discrepancy_id: SYNTH_DISCREPANCY_001
    claim_id: SYNTH_CLAIM_DISCREPANT_001
    claim_description: Synthetic claim with a declared discrepancy and associated residual risk.
    configured_item_ref: SYNTH_CONFIGURED_ITEM_003
    expected_condition: Not specified by the fixture.
    observed_condition: Not specified by the fixture.
    evidence_ref: SYNTH_DISCREPANCY_EVIDENCE_REF_001
    audit_classification: discrepancy
    status: open
    uncertainty:
      - The discrepancy magnitude, cause, affected baseline, and performance consequence are unknown.
    closure_route:
      owner: discrepancy_resolution_owner
      actions:
        - Establish the expected and observed conditions.
        - Identify the controlled configuration and accepted evidence.
        - Resolve or formally disposition the discrepancy.
        - Route configuration changes through baseline change control when applicable.
    stop_condition: Do not close the discrepancy from this audit packet alone.

residual_risk_register:
  - risk_id: SYNTH_RESIDUAL_RISK_001
    discrepancy_id: SYNTH_DISCREPANCY_001
    risk_statement: Functional or performance behavior may remain unsupported while the declared discrepancy is open.
    likelihood: unknown
    consequence: unknown
    severity: not_rated
    status: open
    owner: risk_disposition_owner
    required_decision: Owner disposition supported by applicable evidence and policy.
    non_claims:
      - This row does not establish system failure.
      - This row does not establish acceptability.
      - This workflow cannot accept the residual risk.

audit_readiness:
  status: audit_packet_ready_with_open_items
  ready_for:
    - downstream evidence-pack review
    - discrepancy follow-up
    - residual-risk owner disposition
  not_ready_for:
    - system acceptance
    - owner signoff
    - discrepancy closure
    - baseline approval
  blocking_items:
    - SYNTH_CLAIM_UNVERIFIED_001
    - SYNTH_DISCREPANCY_001
    - SYNTH_RESIDUAL_RISK_001

closure_handoff:
  handoff_id: SYNTH_CLOSURE_HANDOFF_001
  open_routes:
    - source_id: SYNTH_CLAIM_UNVERIFIED_001
      destination_role: verification_evidence_owner
      requested_result: Accepted evidence reference or explicit continued-unverified disposition.
    - source_id: SYNTH_DISCREPANCY_001
      destination_role: discrepancy_resolution_owner
      requested_result: Evidence-backed resolution or formal disposition.
    - source_id: SYNTH_RESIDUAL_RISK_001
      destination_role: risk_disposition_owner
      requested_result: Owner decision without treating this audit as acceptance.
    - source_id: SYNTH_DISCREPANCY_001
      destination_workflow: configuration_baseline_and_change_control_v0
      condition: Route only if resolution requires a controlled configuration change.
  completion_condition: All open items have traceable evidence or authorized dispositions from their respective owners.
  workflow_stop_condition: Stop at audit classification and handoff; do not execute verification, mutate upstream artifacts, approve a baseline, or grant acceptance.

boundary_review_note:
  review_status: boundary_preserved
  findings:
    - The packet separates verified, unverified, discrepancy, and residual-risk rows.
    - Upstream artifacts remain read-only.
    - The verified classification is limited to the fixture declaration and is not owner acceptance.
    - Missing evidence content, configuration detail, thresholds, and owner decisions remain explicit uncertainties.
    - Open discrepancies and residual risks remain first-class records.
  non_claims:
    - No system or result acceptance is granted.
    - No baseline is approved.
    - No owner decision is inferred.
    - No upstream artifact is changed.
    - No verification execution or runtime fact is asserted.
