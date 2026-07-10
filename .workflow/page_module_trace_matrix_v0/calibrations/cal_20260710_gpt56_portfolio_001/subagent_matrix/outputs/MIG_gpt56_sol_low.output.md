workflow_deliverable:
  workflow_id: page_module_trace_matrix_v0
  fixture_id: PUBLIC_SYNTH_PAGE_MODULE_TRACE_MATRIX_V0
  deliverable_id: SYNTH_TRACE_BUNDLE_001
  public_safe: true
  execution_claims:
    commands_run: false
    files_opened: false
    files_changed: false
    services_contacted: false
    messages_sent: false
    runtime_facts_verified: false

  trace_matrix:
    trace_scope_key: SYNTH_SCOPE_001
    rows:
      - trace_row_id: SYNTH-TR-ASSET-001
        row_family: asset_identity
        page_asset_id: SYNTH_ASSET_001
        claim_kind: source_supported_identity
        claim_text: "The synthetic fixture requires one source-supported row."
        scope: synthetic_fixture
        normalized_field_path: scenario_facts.source_supported_row
        component_or_interface_or_connection_scope: SYNTH_ASSET_001
        evidence_status: source_confirmed
        evidence_refs:
          - SYNTH_REF_FIXTURE_SCENARIO_FACT_001
        derivation_rule: null
        parent_trace_row_ids: []
        child_trace_row_ids:
          - SYNTH-TR-HARNESS-001
        claim_strength_ceiling: source_supported_possible
        gap_ids: []
        non_claims:
          - actual_asset_identity
          - upstream_source_truth

      - trace_row_id: SYNTH-TR-IFACE-001
        row_family: interface_item
        page_asset_id: SYNTH_ASSET_001
        claim_kind: interface_review_need
        claim_text: "A synthetic interface claim requires review because no resolving owner decision or authoritative detail is supplied."
        scope: synthetic_fixture
        normalized_field_path: scenario_facts.review_required_row
        component_or_interface_or_connection_scope: SYNTH_INTERFACE_001
        evidence_status: review_required
        evidence_refs:
          - SYNTH_REF_FIXTURE_SCENARIO_FACT_002
        derivation_rule: null
        parent_trace_row_ids: []
        child_trace_row_ids:
          - SYNTH-TR-HARNESS-001
        claim_strength_ceiling: review_required
        gap_ids:
          - SYNTH-GAP-OWNER-001
        non_claims:
          - resolved_interface_definition
          - owner_approval

      - trace_row_id: SYNTH-TR-QUANT-001
        row_family: quantitative_constraint
        page_asset_id: SYNTH_ASSET_001
        claim_kind: required_quantitative_support
        claim_text: "A required synthetic quantitative constraint has no allowed supporting value or source reference."
        scope: synthetic_fixture
        normalized_field_path: scenario_facts.missing_evidence_row
        component_or_interface_or_connection_scope: SYNTH_QUANTITY_001
        evidence_status: missing
        evidence_refs: []
        derivation_rule: null
        parent_trace_row_ids: []
        child_trace_row_ids:
          - SYNTH-TR-HARNESS-001
        claim_strength_ceiling: blocked
        gap_ids:
          - SYNTH-GAP-SOURCE-001
        non_claims:
          - quantitative_value
          - acceptable_limit
          - verification_method_completion

      - trace_row_id: SYNTH-TR-HARNESS-001
        row_family: harness_connection_claim
        page_asset_id: SYNTH_ASSET_001
        claim_kind: bounded_harness_connection_candidate
        claim_text: "The synthetic harness connection remains a candidate inferred from supplied row relationships."
        scope: synthetic_fixture
        normalized_field_path: scenario_facts.harness_delta_below_source_authority
        component_or_interface_or_connection_scope: SYNTH_CONNECTION_001
        evidence_status: derived
        evidence_refs:
          - SYNTH-TR-ASSET-001
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
        derivation_rule: "Associate the synthetic connection with its source-supported, review-required, and missing prerequisite rows; apply the weakest unresolved prerequisite as the usable connection ceiling."
        derivation_input_refs:
          - SYNTH-TR-ASSET-001
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
        parent_trace_row_ids:
          - SYNTH-TR-ASSET-001
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
        child_trace_row_ids: []
        row_authority_ceiling: candidate_safe
        effective_harness_ceiling: blocked
        gap_ids:
          - SYNTH-GAP-OWNER-001
          - SYNTH-GAP-SOURCE-001
        non_claims:
          - final_connection_validity
          - source_supported_connection
          - final_circuit_synthesis
          - harness_contract_mutation

  evidence_authority_map:
    trace_matrix_is_source_authority: false
    replaces_upstream_provenance: false
    entries:
      - trace_row_id: SYNTH-TR-ASSET-001
        evidence_status: source_confirmed
        authority_basis:
          kind: supplied_synthetic_fixture_fact
          evidence_ref: SYNTH_REF_FIXTURE_SCENARIO_FACT_001
        ceiling: source_supported_possible
        upstream_owner_retained: true

      - trace_row_id: SYNTH-TR-IFACE-001
        evidence_status: review_required
        authority_basis:
          kind: supplied_synthetic_fixture_fact_with_unresolved_detail
          evidence_ref: SYNTH_REF_FIXTURE_SCENARIO_FACT_002
        ceiling: review_required
        upstream_owner_retained: true

      - trace_row_id: SYNTH-TR-QUANT-001
        evidence_status: missing
        authority_basis:
          kind: no_allowed_support_supplied
          evidence_ref: null
        ceiling: blocked
        upstream_owner_retained: true

      - trace_row_id: SYNTH-TR-HARNESS-001
        evidence_status: derived
        authority_basis:
          kind: declared_derivation
          input_trace_row_ids:
            - SYNTH-TR-ASSET-001
            - SYNTH-TR-IFACE-001
            - SYNTH-TR-QUANT-001
        ceiling: candidate_safe
        effective_ceiling_after_prerequisites: blocked
        upstream_owner_retained: true

  trace_gap_register:
    gaps:
      - gap_id: SYNTH-GAP-OWNER-001
        gap_type: missing_owner_decision
        affected_trace_row_ids:
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-HARNESS-001
        status: open
        impact:
          interface_claim: review_required
          harness_connection: blocked
        action_route:
          target: owner_decision_refs
          requested_artifact: SYNTH_OWNER_DECISION_001
          requested_decision: "Resolve or explicitly retain the ambiguity for SYNTH_INTERFACE_001."
        stop_condition: "Do not promote the affected interface or connection while the owner decision is absent."

      - gap_id: SYNTH-GAP-SOURCE-001
        gap_type: missing_quantitative_constraint
        affected_trace_row_ids:
          - SYNTH-TR-QUANT-001
          - SYNTH-TR-HARNESS-001
        status: open
        impact:
          quantitative_claim: blocked
          harness_connection: blocked
        action_route:
          target: source_gap_followup_packet_v0
          requested_artifact: SYNTH_ALLOWED_QUANTITATIVE_SOURCE_REF_001
          requested_content: "An approved evidence reference supporting the required synthetic quantitative constraint."
        stop_condition: "Do not invent a value, create a placeholder test, or promote the connection without allowed support."

  harness_trace_delta:
    harness_id: SYNTH_HARNESS_001
    is_final_harness_verdict: false
    connections:
      blocked:
        - connection_id: SYNTH_CONNECTION_001
          trace_row_id: SYNTH-TR-HARNESS-001
          row_authority_ceiling: candidate_safe
          effective_claim_strength_ceiling: blocked
          blocker_gap_ids:
            - SYNTH-GAP-OWNER-001
            - SYNTH-GAP-SOURCE-001
          strengthening_requirements:
            - resolve SYNTH-GAP-OWNER-001
            - resolve SYNTH-GAP-SOURCE-001
          non_claims:
            - final_connection_validity
            - automatic_source_supported_promotion
      review_required: []
      candidate_safe_possible: []
      source_supported_possible: []
    narrow_rerun_route:
      workflow_id: xml_harness_composition_v0
      condition: "Only after the blocking gaps receive approved upstream artifacts or explicit owner disposition."
      purpose: claim_ceiling_review
      automatic_promotion_allowed: false

  verification_seed_matrix:
    is_completed_verification: false
    seeds:
      - verification_seed_id: SYNTH-VS-001
        trace_row_id: SYNTH-TR-ASSET-001
        method_seed: inspection
        objective: "Confirm that the consuming evidence pack retains the supplied synthetic evidence reference."
        prerequisites:
          - SYNTH_REF_FIXTURE_SCENARIO_FACT_001
        readiness: seed_ready
        result: not_performed

      - verification_seed_id: SYNTH-VS-002
        trace_row_id: SYNTH-TR-IFACE-001
        method_seed: owner_review
        objective: "Obtain an explicit disposition for the synthetic interface ambiguity."
        prerequisites:
          - SYNTH_OWNER_DECISION_001
        readiness: blocked
        blocking_gap_ids:
          - SYNTH-GAP-OWNER-001
        result: not_performed

      - verification_seed_id: SYNTH-VS-003
        trace_row_id: SYNTH-TR-QUANT-001
        method_seed: not_ready
        objective: "Define a verification seed only after an approved quantitative claim and evidence reference exist."
        prerequisites:
          - SYNTH_ALLOWED_QUANTITATIVE_SOURCE_REF_001
        readiness: blocked
        blocking_gap_ids:
          - SYNTH-GAP-SOURCE-001
        result: not_performed
        placeholder_test_created: false

      - verification_seed_id: SYNTH-VS-004
        trace_row_id: SYNTH-TR-HARNESS-001
        method_seed: analysis
        objective: "Assess connection consistency after all prerequisite trace gaps are closed or explicitly dispositioned."
        prerequisites:
          - SYNTH-TR-ASSET-001
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
        readiness: blocked
        blocking_gap_ids:
          - SYNTH-GAP-OWNER-001
          - SYNTH-GAP-SOURCE-001
        result: not_performed

  review_gate_evidence_index:
    is_review_decision: false
    review_families:
      SRR_SFR_like:
        trace_row_ids:
          - SYNTH-TR-ASSET-001
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
        purpose: scope_and_requirement_evidence_index
      PDR_like:
        trace_row_ids:
          - SYNTH-TR-IFACE-001
          - SYNTH-TR-QUANT-001
          - SYNTH-TR-HARNESS-001
        purpose: preliminary_interface_and_constraint_readiness_index
      CDR_like:
        trace_row_ids:
          - SYNTH-TR-HARNESS-001
        purpose: connection_claim_ceiling_index
      TRR_like:
        trace_row_ids:
          - SYNTH-TR-QUANT-001
          - SYNTH-TR-HARNESS-001
        purpose: verification_prerequisite_gap_index
      FCA_SVR_like:
        trace_row_ids: []
        purpose: no_completion_evidence_supplied
      PCA_like:
        trace_row_ids: []
        purpose: no_configuration_audit_evidence_supplied
    consumption_rule: "Review packets consume synthetic trace-row identifiers, not raw payloads."
    decision_authority_retained_by_review_owner: true

  trace_provenance:
    source_kind: synthetic_from_workflow_contract
    supplied_inputs:
      - trace_matrix_project_binding
      - page_module_spec_refs
      - page_asset_manifest_refs
      - approved_trace_intake_policy
    provenance_refs:
      - provenance_ref_id: SYNTH_REF_FIXTURE_SCENARIO_FACT_001
        basis: "Fixture statement: one source-supported row."
        authority_scope: synthetic_fixture_only
      - provenance_ref_id: SYNTH_REF_FIXTURE_SCENARIO_FACT_002
        basis: "Fixture statement: one review-required row."
        authority_scope: synthetic_fixture_only
      - provenance_ref_id: SYNTH_REF_FIXTURE_SCENARIO_FACT_003
        basis: "Fixture statement: one missing-evidence row."
        authority_scope: synthetic_fixture_only
      - provenance_ref_id: SYNTH_REF_FIXTURE_SCENARIO_FACT_004
        basis: "Fixture statement: one harness delta must stay below source authority."
        authority_scope: synthetic_fixture_only
    checksums:
      status: unknown
      reason: "No checksums are supplied by the fixture."
    approval_scope:
      status: bounded
      basis: "Only the supplied public-safe synthetic contract and fixture are in scope."
    uncertainties:
      - "The symbolic input references contain no supplied artifact bodies, checksums, version identifiers, page details, component identities, quantitative values, or owner decisions."
      - "Source-confirmed status in this deliverable applies only to the fixture-declared synthetic row; it does not establish real source or component truth."
    forbidden_bases_used: []
    upstream_artifacts_mutated: false

  boundary_review_note:
    disposition: usable_with_open_blockers
    public_safe: true
    row_counts:
      total: 4
      source_confirmed: 1
      derived: 1
      review_required: 1
      missing: 1
    gap_counts:
      total_open: 2
      owner_decision: 1
      evidence_or_constraint: 1
    blocker_counts:
      harness_connections_blocked: 1
      verification_seeds_blocked: 3
    preserved_boundaries:
      - "The trace matrix is not source authority."
      - "Upstream artifacts remain read-only and retain ownership of their facts."
      - "The derived harness row remains below source authority and is effectively blocked by unresolved prerequisites."
      - "No final harness validity, completed verification, or review decision is asserted."
      - "Missing evidence remains a first-class row and gap."
      - "No quantitative value, component truth, owner decision, checksum, or runtime fact is invented."
    stop_conditions:
      - "Stop connection promotion while SYNTH-GAP-OWNER-001 or SYNTH-GAP-SOURCE-001 remains open."
      - "Stop quantitative verification planning until an approved quantitative claim and evidence reference are supplied."
      - "Stop source-confirmed classification for any derived, ambiguous, or unsupported claim."
      - "Stop if later inputs introduce conflicting evidence; route the affected rows to review_required."
    best_narrow_downstream_route:
      first:
        workflow_id: source_gap_followup_packet_v0
        input: trace_gap_register
        purpose: batch the missing quantitative evidence and owner-decision requests
      then:
        workflow_id: xml_harness_composition_v0
        input: harness_trace_delta
        purpose: narrow claim-ceiling review after blocker disposition
      verification:
        workflow_id: verification_plan_from_page_contracts_v0
        input: verification_seed_matrix
        condition: "Consume as planning seeds only; do not treat them as verification results."
