workflow_id: source_packet_sufficiency_review_v0
fixture_id: PUBLIC_SYNTH_SOURCE_PACKET_SUFFICIENCY_REVIEW_V0
source_kind: synthetic_from_workflow_contract
public_safe: true
status: pilot-executed-private-fixture

source_sufficiency_packet:
  scope:
    refs:
      - sufficiency_scope_refs
      - source_packet_refs
      - approved_sufficiency_policy
    claim_families:
      - claim_family_id: SYNTH_CLAIM_FAMILY_SUFFICIENT
        status: sufficient
        evidence_basis: "Fixture states that one claim family has enough evidence."
        claim_ceiling: bounded_claim_per_approved_sufficiency_policy
      - claim_family_id: SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED
        status: blocked
        evidence_basis: "Fixture states that required layout guidance is missing."
        claim_ceiling: no_layout_dependent_claim
    unresolved:
      - owner follow-up remains open

evidence_coverage_table:
  - claim_family_id: SYNTH_CLAIM_FAMILY_SUFFICIENT
    evidence_status: sufficient
    missing_evidence: []
    allowed_use: bounded_claims within approved scope
  - claim_family_id: SYNTH_CLAIM_FAMILY_LAYOUT_BLOCKED
    evidence_status: blocked
    missing_evidence:
      - layout_guidance
    allowed_use: non-layout-dependent claims only

blocked_fields_register:
  - field_id: SYNTH_LAYOUT_DEPENDENT_FIELDS
    status: blocked
    reason: missing layout guidance
    blocked_is_not_failed_design: true
    release_condition: owner-approved layout guidance becomes available

owner_followup_needed:
  status: open
  items:
    - followup_id: SYNTH_OWNER_FOLLOWUP_LAYOUT_GUIDANCE
      request: obtain or approve layout guidance for the blocked claim family
      owner: unspecified_in_fixture
      completion_evidence: unspecified_in_fixture

allowed_claim_ceiling:
  overall: bounded_claims_supported by available evidence and approved_sufficiency_policy
  sufficient_claim_family: bounded_claims within its evidenced scope
  layout_blocked_claim_family: claims excluding layout-dependent conclusions
  prohibited:
    - unsupported quantitative value truth
    - layout conclusions without layout guidance
    - stronger source or canon authority than provided by the contract
    - claims based on hidden private evidence

rerun_routes:
  - route_id: SYNTH_RERUN_LAYOUT_EVIDENCE
    trigger: layout guidance is supplied or owner-approved
    downstream_workflows:
      - page_quantitative_enrichment_v0
      - xml_harness_composition_v0
      - verification_plan_from_page_contracts_v0
  - route_id: SYNTH_RERUN_OWNER_DECISION
    trigger: open owner follow-up is resolved
    action: repeat sufficiency review for affected claim fields

boundary_review_note:
  public_safe_boundary: explicit
  source_authority: not established by this packet
  upstream_artifacts: read_only
  mutation: none
  non_claims:
    - no source acquisition
    - no component material truth
    - no layout extraction
    - no simulation model collection
    - no quantitative value validation
    - no harness promotion
  uncertainty:
    - owner identity and completion evidence are unspecified in the fixture
    - exact claim-family contents are unspecified in the fixture
    - exact blocked field names are unspecified in the fixture
