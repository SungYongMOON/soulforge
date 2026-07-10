workflow_id: source_packet_sufficiency_review_v0
fixture_id: PUBLIC_SYNTH_SOURCE_PACKET_SUFFICIENCY_REVIEW_V0
deliverable_kind: source_sufficiency_packet
public_safe: true
review_status: completed_from_supplied_synthetic_fixture

scope_binding:
  intended_claim_families:
    - claim_family_id: SYNTH_CLAIM_FAMILY_SUFFICIENT_01
    - claim_family_id: SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED_01
  evidence_scope:
    - source_packet_refs
    - layout_guide_packet_refs
  governing_policy_ref: approved_sufficiency_policy
  upstream_artifacts_read_only: true

evidence_coverage_table:
  - claim_family_id: SYNTH_CLAIM_FAMILY_SUFFICIENT_01
    evidence_status: sufficient
    evidence_basis: scenario_fact_only
    coverage_statement: The supplied fixture states that this claim family has enough evidence.
    missing_evidence: []
    allowed_claim_ceiling: bounded_sufficiency_claim
    non_claims:
      - No underlying technical value or component-material truth is established.
      - No stronger source or canon authority is implied.
  - claim_family_id: SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED_01
    evidence_status: blocked
    evidence_basis: scenario_fact_only
    coverage_statement: The supplied fixture states that this claim family lacks required layout guidance.
    missing_evidence:
      - evidence_kind: layout_guidance
        status: missing
        exact_document_or_content: unknown
    allowed_claim_ceiling: evidence_gap_identification_only
    non_claims:
      - The blocked status is not a failed-design determination.
      - Layout correctness, quantitative values, and implementation readiness remain undetermined.

blocked_fields_register:
  - blocked_field_id: SYNTH_BLOCKED_LAYOUT_FIELD_01
    claim_family_id: SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED_01
    blocker: missing_layout_guidance
    consequence: Claims requiring layout-guidance support must not be promoted.
    resolution_authority: upstream_source_acquisition_or_owner
    stop_condition: Keep the field blocked until relevant layout guidance is supplied through an approved source packet and sufficiency is reviewed again.

owner_followup_needed:
  required: true
  items:
    - followup_id: SYNTH_OWNER_FOLLOWUP_01
      status: open
      question: Can an approved source packet containing the required layout guidance be provided or identified?
      owner_boundary: The owner determines whether to provide, approve, or waive the requested evidence.
      non_claim: No owner decision is inferred.

allowed_claim_ceiling:
  overall: mixed_bounded
  by_claim_family:
    SYNTH_CLAIM_FAMILY_SUFFICIENT_01: bounded_sufficiency_claim
    SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED_01: evidence_gap_identification_only
  prohibited_promotions:
    - source_authority
    - component_material_truth
    - layout_correctness
    - simulation_validity
    - quantitative_value_truth
    - harness_promotion
    - design_failure

rerun_routes:
  - trigger: Approved layout guidance becomes available.
    route: source_packet_sufficiency_review_v0
    purpose: Reassess SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED_01.
  - trigger: Downstream quantitative enrichment is requested.
    route: page_quantitative_enrichment_v0
    pass:
      - allowed_claim_ceiling
      - blocked_fields_register
  - trigger: Harness composition is requested.
    route: xml_harness_composition_v0
    pass:
      - allowed_claim_ceiling
      - blocked_fields_register
  - trigger: Verification planning is requested.
    route: verification_plan_from_page_contracts_v0
    pass:
      - blocked_fields_register
      - owner_followup_needed

boundary_review_note:
  result: boundary_preserved
  statements:
    - This deliverable is derived only from the supplied public-safe synthetic fixture.
    - The sufficient classification applies only to the fixture's bounded claim family and does not establish technical truth.
    - The blocked classification records missing evidence and does not indicate design failure.
    - Upstream artifacts remain outside this workflow's mutation authority.
    - Missing document identity, technical content, values, and runtime facts remain unknown.
    - No hidden or private evidence is asserted.
