```yaml
workflow_id: page_module_trace_matrix_v0
fixture_id: PUBLIC_SYNTH_PAGE_MODULE_TRACE_MATRIX_V0
public_safe: true
trace_matrix:
  trace_scope_key: synthetic_page_module_trace_scope_v0
  rows:
    - trace_row_id: trm-synth-asset-identity-001
      claim_kind: asset_identity
      claim_text: Synthetic page asset is bound to the trace scope.
      scope:
        page_asset_id: SYNTH_PAGE_ASSET_001
      normalized_field_path: page_asset.asset_id
      evidence_status: source_confirmed
      evidence_refs:
        - ref: SYNTH_PAGE_ASSET_MANIFEST_REF_001
          authority: page_asset_manifest
          approval_scope: approved_trace_intake
      owner_workflow_id: page_xml_normalize_spec_v0
      harness_claim_strength_ceiling: source_supported_possible
      verification_seed_ids:
        - vsm-synth-001
      review_gate_row_ids:
        - rgi-synth-srr-001

    - trace_row_id: trm-synth-function-claim-001
      claim_kind: function_claim
      claim_text: Synthetic module function claim requires owner review because the fixture provides no authoritative function evidence.
      scope:
        page_asset_id: SYNTH_PAGE_ASSET_001
        module_id: SYNTH_MODULE_001
      normalized_field_path: module.function_claim
      evidence_status: review_required
      evidence_refs: []
      owner_workflow_id: page_xml_normalize_spec_v0
      gap_ids:
        - gap-synth-owner-decision-001
      harness_claim_strength_ceiling: review_required
      verification_seed_ids:
        - vsm-synth-002
      review_gate_row_ids:
        - rgi-synth-pdr-001

    - trace_row_id: trm-synth-interface-001
      claim_kind: interface_item
      claim_text: Synthetic interface item lacks allowed supporting evidence.
      scope:
        page_asset_id: SYNTH_PAGE_ASSET_001
        module_id: SYNTH_MODULE_001
        interface_id: SYNTH_INTERFACE_001
      normalized_field_path: module.interfaces[0].items[0]
      evidence_status: missing
      evidence_refs: []
      owner_workflow_id: interface_control_and_harness_readiness_v0
      gap_ids:
        - gap-synth-missing-interface-evidence-001
      harness_claim_strength_ceiling: blocked
      verification_seed_ids:
        - vsm-synth-003
      review_gate_row_ids:
        - rgi-synth-trr-001

evidence_authority_map:
  - trace_row_id: trm-synth-asset-identity-001
    evidence_status: source_confirmed
    authority_class: upstream_artifact
    allowed_evidence_refs:
      - SYNTH_PAGE_ASSET_MANIFEST_REF_001
    replaces_upstream_provenance: false

  - trace_row_id: trm-synth-function-claim-001
    evidence_status: review_required
    authority_class: unresolved_owner_review
    conflict_or_ambiguity: true
    allowed_evidence_refs: []
    replaces_upstream_provenance: false

  - trace_row_id: trm-synth-interface-001
    evidence_status: missing
    authority_class: unsupported_required_claim
    allowed_evidence_refs: []
    replaces_upstream_provenance: false

trace_gap_register:
  gaps:
    - gap_id: gap-synth-owner-decision-001
      gap_type: missing_owner_decision
      trace_row_ids:
        - trm-synth-function-claim-001
      action_route: obtain_owner_decision_for_function_claim
      blocking: true
      auto_resolution_allowed: false

    - gap_id: gap-synth-missing-interface-evidence-001
      gap_type: missing_source_ref
      trace_row_ids:
        - trm-synth-interface-001
      action_route: provide_approved_interface_evidence_or_keep_claim_blocked
      blocking: true
      auto_resolution_allowed: false

harness_trace_delta:
  harness_id: SYNTH_HARNESS_001
  source_trace_scope_key: synthetic_page_module_trace_scope_v0
  views:
    blocked:
      - trace_row_id: trm-synth-interface-001
        reason: missing_evidence
    review_required:
      - trace_row_id: trm-synth-function-claim-001
        reason: unresolved_owner_review
    candidate_safe_possible: []
    source_supported_possible:
      - trace_row_id: trm-synth-asset-identity-001
        relevance: identity_context_only
  claim_strength_ceiling: review_required
  final_connection_validity: not_claimed
  final_harness_verdict: not_claimed
  harness_contract_mutation: false

verification_seed_matrix:
  verification_completed: false
  seeds:
    - verification_seed_id: vsm-synth-001
      trace_row_id: trm-synth-asset-identity-001
      method_seed: inspection
      prerequisite_refs:
        - SYNTH_PAGE_ASSET_MANIFEST_REF_001
      status: planned_only

    - verification_seed_id: vsm-synth-002
      trace_row_id: trm-synth-function-claim-001
      method_seed: owner_review
      prerequisite_gap_ids:
        - gap-synth-owner-decision-001
      status: not_ready

    - verification_seed_id: vsm-synth-003
      trace_row_id: trm-synth-interface-001
      method_seed: not_ready
      prerequisite_gap_ids:
        - gap-synth-missing-interface-evidence-001
      status: not_ready

review_gate_evidence_index:
  review_decision_made: false
  rows:
    - review_gate_row_id: rgi-synth-srr-001
      review_family: SRR_SFR_like
      trace_row_ids:
        - trm-synth-asset-identity-001
      evidence_refs:
        - SYNTH_PAGE_ASSET_MANIFEST_REF_001
      decision_status: pending

    - review_gate_row_id: rgi-synth-pdr-001
      review_family: PDR_like
      trace_row_ids:
        - trm-synth-function-claim-001
      gap_ids:
        - gap-synth-owner-decision-001
      decision_status: pending

    - review_gate_row_id: rgi-synth-trr-001
      review_family: TRR_like
      trace_row_ids:
        - trm-synth-interface-001
      gap_ids:
        - gap-synth-missing-interface-evidence-001
      decision_status: pending

trace_provenance:
  provenance_id: prov-synth-page-module-trace-001
  source_kind: synthetic_from_workflow_contract
  fixture_id: PUBLIC_SYNTH_PAGE_MODULE_TRACE_MATRIX_V0
  input_refs:
    - trace_matrix_project_binding
    - page_module_spec_refs
    - page_asset_manifest_refs
    - approved_trace_intake_policy
  upstream_artifacts_read_only: true
  public_payloads_included: false
  private_runtime_paths_included: false
  hidden_evidence_used: false
  source_authority_replaced: false

boundary_review_note:
  boundary_review_id: boundary-synth-001
  result: bounded
  row_counts:
    total: 3
    source_confirmed: 1
    review_required: 1
    missing: 1
  blocker_count: 2
  preserved:
    - evidence authority
    - traceability
    - explicit uncertainty
    - no upstream mutation
    - verification seeds
  non_claims:
    - trace matrix is not source authority
    - harness delta is not a final harness verdict
    - verification seeds are not completed verification
    - review index is not a review decision
  narrow_next_route:
    - resolve gap-synth-owner-decision-001 through owner review
    - resolve gap-synth-missing-interface-evidence-001 with an approved evidence reference
```
