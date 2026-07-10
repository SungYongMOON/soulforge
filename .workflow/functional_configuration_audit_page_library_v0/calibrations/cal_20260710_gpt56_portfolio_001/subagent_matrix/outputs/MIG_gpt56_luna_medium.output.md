```yaml
workflow_id: functional_configuration_audit_page_library_v0
fixture_id: PUBLIC_SYNTH_FUNCTIONAL_CONFIGURATION_AUDIT_PAGE_LIBRARY_V0
source_kind: synthetic_from_workflow_contract
public_safe: true

project_binding:
  binding_id: SYNTH-FCA-BINDING-001
  project_id: SYNTH-PROJECT-001
  audit_scope_id: SYNTH-AUDIT-SCOPE-001
  approved_audit_policy_ref: SYNTH-APPROVED-AUDIT-POLICY-001
  output_root_ref: SYNTH-FCA-OUTPUT-ROOT-001
  scope_status: bounded
  authority: audit_only

functional_audit_packet:
  packet_id: SYNTH-FCA-PACKET-001
  workflow_id: functional_configuration_audit_page_library_v0
  audit_scope_ref: SYNTH-AUDIT-SCOPE-001
  evidence_basis:
    accepted_evidence_refs:
      - SYNTH-VERIFICATION-EVIDENCE-001
    unavailable_or_unconfirmed_evidence_refs:
      - SYNTH-VERIFICATION-EVIDENCE-002
  result_summary:
    verified_claim_count: 1
    unverified_claim_count: 1
    discrepancy_count: 1
    residual_risk_count: 1
  acceptance_status: not_assessed
  owner_acceptance_status: not_assessed
  upstream_mutation_status: not_performed

verified_claim_register:
  - claim_id: SYNTH-CLAIM-VERIFIED-001
    claim_text: Configured page module composition satisfies the declared functional claim.
    claim_status: verified_against_accepted_evidence
    accepted_evidence_refs:
      - SYNTH-VERIFICATION-EVIDENCE-001
    baseline_context_ref: SYNTH-CONFIGURATION-BASELINE-001
    verification_execution_owner: not_owned_by_this_workflow
    owner_signoff: not_present
    acceptance_claim: false
    notes: Verification evidence is recorded as accepted for audit use; this row does not constitute system acceptance.

unverified_claim_register:
  - claim_id: SYNTH-CLAIM-UNVERIFIED-001
    claim_text: Configured harness composition satisfies the declared performance claim.
    claim_status: unverified
    accepted_evidence_refs: []
    missing_evidence_refs:
      - SYNTH-VERIFICATION-EVIDENCE-002
    required_followup:
      route: SYNTH-VERIFICATION-PLAN-001
      action: obtain or reference accepted performance verification evidence
    owner_signoff: not_present
    acceptance_claim: false
    uncertainty: Performance claim cannot be concluded from the supplied fixture.

discrepancy_register:
  - discrepancy_id: SYNTH-DISCREPANCY-001
    subject_ref: SYNTH-HARNESS-COMPOSITION-001
    discrepancy_status: open
    description: Declared harness configuration and available verification evidence are not aligned sufficiently to close the audit row.
    evidence_refs:
      - SYNTH-VERIFICATION-EVIDENCE-003
    baseline_context_ref: SYNTH-CONFIGURATION-BASELINE-001
    impact: The affected functional or performance claim remains unresolved.
    closure_route:
      workflow_id: configuration_baseline_and_change_control_v0
      route_ref: SYNTH-CHANGE-ROUTE-001
    acceptance_claim: false
    upstream_mutation: prohibited

residual_risk_register:
  - residual_risk_id: SYNTH-RESIDUAL-RISK-001
    source_discrepancy_ref: SYNTH-DISCREPANCY-001
    risk_status: open
    risk_statement: Unresolved harness evidence may conceal failure to meet the declared performance behavior under the scoped configuration.
    affected_claim_refs:
      - SYNTH-CLAIM-UNVERIFIED-001
    containment_or_followup:
      route: SYNTH-VERIFICATION-PLAN-001
      required_owner_decision: SYNTH-OWNER-DECISION-001
    risk_acceptance: not_assessed

audit_readiness:
  readiness_id: SYNTH-AUDIT-READINESS-001
  status: conditionally_ready_for_review
  basis:
    - bounded audit scope identified
    - one claim supported by accepted evidence
    - one claim remains unverified
    - one open discrepancy has been routed
    - residual risk remains explicit
  blockers:
    - SYNTH-VERIFICATION-EVIDENCE-002
    - SYNTH-DISCREPANCY-001
  acceptance_status: not_ready_to_claim_acceptance

closure_handoff:
  handoff_id: SYNTH-FCA-HANDOFF-001
  open_items:
    - item_id: SYNTH-CLOSURE-ITEM-001
      source_ref: SYNTH-CLAIM-UNVERIFIED-001
      next_route: SYNTH-VERIFICATION-PLAN-001
      closure_condition: accepted evidence is available and traceable to the claim
    - item_id: SYNTH-CLOSURE-ITEM-002
      source_ref: SYNTH-DISCREPANCY-001
      next_route: SYNTH-CHANGE-ROUTE-001
      closure_condition: discrepancy is investigated, dispositioned, and re-audited
  owner_decision_refs:
    - SYNTH-OWNER-DECISION-001
  rerun_required: true
  rerun_trigger_refs:
    - SYNTH-DISCREPANCY-001
    - SYNTH-RESIDUAL-RISK-001

boundary_review_note:
  note_id: SYNTH-BOUNDARY-REVIEW-001
  confirmed_boundaries:
    audit_packet_is_not_acceptance: true
    verified_claim_register_is_not_owner_signoff: true
    unverified_claims_remain_first_class: true
    discrepancy_remains_open_until_closure_evidence_exists: true
    residual_risk_remains_open_until_owner_disposition: true
    upstream_artifacts_are_read_only: true
    verification_execution_is_not_owned: true
    baseline_approval_is_not_owned: true
  non_claims:
    - No runtime execution is claimed.
    - No file or upstream artifact mutation is claimed.
    - No owner acceptance or baseline approval is claimed.
    - No private or hidden evidence is used.
    - No stronger source or canon authority is inferred beyond the supplied contract and fixture.
```
