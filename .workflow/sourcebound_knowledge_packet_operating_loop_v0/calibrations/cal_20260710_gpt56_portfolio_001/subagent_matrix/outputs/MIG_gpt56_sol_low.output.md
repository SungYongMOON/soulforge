schema_version: sourcebound_knowledge_packet_dry_run_v1
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
fixture_id: public_synthetic_mixed_evidence_projection
execution_state: dry_run_packet_prepared
public_safe: true
boundary_attestation: "All claims, references, topics, and policy values are synthetic."
non_claims:
  - no source payload copied
  - no archive upload performed
  - no advisory service contacted
  - no runtime state verified
  - no ontology or workflow accepted
  - no canon entry created

project_binding:
  source_scope_binding: fixture://knowledge/demo_connector_rules
  topic: synthetic connector constraint semantics
  source_truth_owner: supplied_synthetic_source_refs
  projection_visibility: private_by_contract
  public_payload_copy_allowed: false
  target_consumers:
    - workflow_candidate
    - ontology_candidate
  promotion_boundary:
    public_canon_requires_owner_or_applicable_delegation_plus_review: true
    applicable_owner_decision_ref: null
    applicable_delegated_policy_ref: null
    canon_route_available: false
  archive_boundary:
    requested: true
    agent_upload_authority: none
    upload_or_sync_authorized: false
  advisory_boundary:
    owner_operated_only: true
    advisory_output_is_authority: false

source_intake_manifest:
  manifest_id: synthetic://manifests/source-intake-001
  intake_state: approved_subset_available_with_blocked_refs
  approved_sources:
    - source_ref: fixture://sources/official-A
      state: official_present
      admitted_for:
        - private_projection
        - conditional_current_limit_claim
      supported_statement:
        - maximum current is conditional on ambient temperature
    - source_ref: fixture://sources/owner-local-B
      state: owner_approved_local
      approval_scope: private_projection
      admitted_for:
        - private_projection
        - connector_family_mapping_candidate
      supported_statement:
        - connector family mapping
      promotion_limit: private_projection_scope_only
  excluded_sources:
    - source_ref: fixture://sources/candidate-C
      state: candidate_official
      disposition: blocked
      reason: candidate_official_is_not_an_allowed_intake_state
      prohibited_use:
        - approved_truth
        - claim_support
        - promotion_support
    - source_ref: fixture://sources/conflict-D
      state: conflicting
      disposition: blocked
      reason: conflicting_is_not_an_allowed_intake_state
      prohibited_use:
        - approved_truth
        - connector_family_mapping_resolution
        - promotion_support

source_gap_handoff:
  handoff_id: synthetic://handoffs/source-gap-001
  gaps:
    - gap_id: synthetic-gap-alternate-limit-001
      related_source_ref: fixture://sources/candidate-C
      issue: unverified alternate limit
      state: blocked_pending_approved_source
      route: official_source_packet_collect_v0
      required_resolution: obtain an approved source state before using the alternate limit
    - gap_id: synthetic-gap-family-conflict-001
      related_source_refs:
        - fixture://sources/owner-local-B
        - fixture://sources/conflict-D
      issue: different connector family mappings are represented
      state: unresolved_conflict
      route: source_packet_sufficiency_review_v0
      required_resolution: resolve revision, applicability, or source authority before any definitive mapping claim
  owner_followup_needed: true

sourcebound_knowledge_packet_manifest:
  packet_id: synthetic://private-packets/connector-semantics-001
  packet_state: dry_run_private_derivative_projection
  payload_location: private_by_contract_not_supplied
  payload_embedded: false
  authoritative: false
  source_refs:
    - fixture://sources/official-A
    - fixture://sources/owner-local-B
  excluded_source_refs:
    - fixture://sources/candidate-C
    - fixture://sources/conflict-D
  projection_rules:
    every_claim_requires_source_ref_or_gap: true
    index_and_log_are_navigation_only: true
    unresolved_conflicts_remain_explicit: true

compiled_projection_index:
  index_ref: synthetic://private-indexes/connector-semantics-001
  payload_embedded: false
  authoritative: false
  entries:
    - projection_ref: synthetic://private-projections/conditional-current-001
      subject: conditional current limit
      source_refs:
        - fixture://sources/official-A
      gap_refs: []
    - projection_ref: synthetic://private-projections/family-mapping-001
      subject: connector family mapping
      source_refs:
        - fixture://sources/owner-local-B
      gap_refs:
        - synthetic-gap-family-conflict-001
    - projection_ref: synthetic://private-projections/alternate-limit-gap-001
      subject: unverified alternate limit
      source_refs: []
      gap_refs:
        - synthetic-gap-alternate-limit-001

compiled_projection_log:
  log_ref: synthetic://private-logs/connector-semantics-001
  payload_embedded: false
  authoritative: false
  entries:
    - log_entry_id: synthetic-log-001
      projection_ref: synthetic://private-projections/conditional-current-001
      disposition: bounded_projection_reference
      note: conditionality must remain attached to any current-limit statement
    - log_entry_id: synthetic-log-002
      projection_ref: synthetic://private-projections/family-mapping-001
      disposition: bounded_projection_reference_with_conflict
      note: mapping remains a private candidate because conflicting input is unresolved
    - log_entry_id: synthetic-log-003
      projection_ref: synthetic://private-projections/alternate-limit-gap-001
      disposition: gap_only
      note: no approved truth claim may be derived from candidate-C

contradiction_gap_lint_report:
  report_id: synthetic://reports/contradiction-gap-lint-001
  overall_state: review_required
  findings:
    - finding_id: synthetic-lint-001
      check: unsupported_projection_claim
      severity: blocking
      affected_ref: fixture://sources/candidate-C
      finding: the alternate limit lacks an approved source state
      required_action: retain as a source gap only
    - finding_id: synthetic-lint-002
      check: source_conflict_or_revision_drift
      severity: blocking_for_definitive_mapping
      affected_refs:
        - fixture://sources/owner-local-B
        - fixture://sources/conflict-D
      finding: connector family mappings differ and applicability or revision is unknown
      required_action: obtain source-resolution evidence
    - finding_id: synthetic-lint-003
      check: citation_gap
      severity: clear_for_bounded_conditional_claim
      affected_ref: synthetic://private-projections/conditional-current-001
      finding: approved source support is identified
    - finding_id: synthetic-lint-004
      check: missing_page_map
      severity: unknown
      finding: no page-map information is supplied by the fixture
      required_action: preserve unknown status; do not imply page-level traceability
    - finding_id: synthetic-lint-005
      check: figure_table_formula_ocr_gate_needed
      severity: unknown
      finding: the fixture does not state whether extraction depends on figures, tables, formulas, or OCR
      required_action: require a later extraction gate if such dependencies exist
    - finding_id: synthetic-lint-006
      check: advisory_tool_overreach
      severity: clear
      finding: no advisory return is present or used as a verdict
  stop_conditions:
    - stop definitive connector family mapping promotion until the conflict is resolved
    - stop alternate-limit claims until an approved source is available
    - stop canon promotion while owner or delegated authority and required review are absent

concept_candidate_register:
  register_id: synthetic://registers/concept-candidates-001
  candidates:
    - candidate_id: synthetic-concept-conditional-current-001
      concept_label: ambient-temperature-conditioned maximum current
      source_refs:
        - fixture://sources/official-A
      projection_refs:
        - synthetic://private-projections/conditional-current-001
      evidence_state: source_supported_candidate
      blocker_or_review_note: preserve the ambient-temperature condition; no unconditional numeric limit is supplied
      possible_promotion_target: workflow_candidate
    - candidate_id: synthetic-concept-family-mapping-001
      concept_label: connector family mapping
      source_refs:
        - fixture://sources/owner-local-B
      projection_refs:
        - synthetic://private-projections/family-mapping-001
      evidence_state: review_required
      blocker_or_review_note: owner-local support is private-projection scoped and a conflicting mapping remains unresolved
      possible_promotion_target: ontology_candidate
    - candidate_id: synthetic-concept-alternate-limit-001
      concept_label: alternate current limit
      source_refs: []
      blocked_source_refs:
        - fixture://sources/candidate-C
      projection_refs:
        - synthetic://private-projections/alternate-limit-gap-001
      evidence_state: blocked_pending_source
      blocker_or_review_note: candidate-C cannot support an approved truth claim
      possible_promotion_target: source_gap_followup

claim_ceiling_and_promotion_route:
  route_id: synthetic://routes/claim-ceiling-001
  routes:
    - candidate_id: synthetic-concept-conditional-current-001
      allowed_claim_ceiling: source_supported
      safe_claim: maximum current is conditional on ambient temperature
      prohibited_claims:
        - unconditional maximum-current value
        - production-ready rule
        - canon rule
      route_state: source_supported_candidate
      promotion_target: workflow_candidate
      next_requirement: post-development review plus owner decision or applicable delegated policy before public canon promotion
    - candidate_id: synthetic-concept-family-mapping-001
      allowed_claim_ceiling: private_review_candidate
      safe_claim: an owner-approved local source supplies a connector family mapping for private projection
      prohibited_claims:
        - definitive family mapping
        - conflict resolution
        - ontology canon
      route_state: review_required
      promotion_target: ontology_candidate
      next_requirement: resolve source conflict, obtain ontology review policy or owner decision, and complete the required review gate
    - candidate_id: synthetic-concept-alternate-limit-001
      allowed_claim_ceiling: gap_only
      safe_claim: an unverified alternate-limit source candidate exists
      prohibited_claims:
        - alternate limit is valid
        - alternate limit supersedes another limit
        - candidate-C is official
      route_state: blocked_pending_source
      promotion_target: source_gap_followup
      next_requirement: approved source intake and sufficiency review
  aggregate_promotion_state: hold_private
  canon_blockers:
    - no owner decision ref
    - no applicable delegated canon policy ref
    - required post-development review gate not established
    - source conflict remains unresolved
    - alternate-limit evidence is unapproved

knowledge_package_archive_manifest:
  archive_manifest_id: synthetic://manifests/archive-001
  archive_requested: true
  archive_authority: storage_and_backup_only
  upload_authority: none
  upload_state: not_authorized
  package_entries:
    - artifact_ref: synthetic://private-packets/connector-semantics-001
      archive_label: working_packet
      inclusion_state: manifest_reference_only
    - artifact_ref: synthetic://private-indexes/connector-semantics-001
      archive_label: working_packet
      inclusion_state: manifest_reference_only
    - artifact_ref: synthetic://private-logs/connector-semantics-001
      archive_label: working_packet
      inclusion_state: manifest_reference_only
    - artifact_ref: synthetic://registers/concept-candidates-001
      archive_label: working_packet
      inclusion_state: manifest_reference_only
    - artifact_ref: synthetic://routes/claim-ceiling-001
      archive_label: reviewed_private
      inclusion_state: proposed_label_only
  canon_package_entries: []
  payload_embedded: false
  archive_presence_would_not_prove:
    - source truth
    - owner approval
    - review completion
    - canon promotion

ontology_candidate_rule_register:
  register_id: synthetic://registers/ontology-rules-001
  register_state: candidate_only
  candidate_rules:
    - candidate_rule_id: synthetic-ontology-rule-conditional-current-001
      source_concept_candidate_ids:
        - synthetic-concept-conditional-current-001
      ontology_candidate_type: relation
      entity_or_relation_label: maximum_current conditioned_by ambient_temperature
      evidence_source_refs:
        - fixture://sources/official-A
      candidate_only_state: source_supported_candidate_not_accepted
      required_review_route:
        - ontology owner review
        - post_development_review_gate_v0
      blocker_note: no ontology review policy or owner decision is supplied
    - candidate_rule_id: synthetic-ontology-rule-family-mapping-001
      source_concept_candidate_ids:
        - synthetic-concept-family-mapping-001
      ontology_candidate_type: relation
      entity_or_relation_label: connector_member_of connector_family
      evidence_source_refs:
        - fixture://sources/owner-local-B
      excluded_conflicting_ref:
        - fixture://sources/conflict-D
      candidate_only_state: blocked_pending_conflict_resolution
      required_review_route:
        - source_packet_sufficiency_review_v0
        - ontology owner review
        - post_development_review_gate_v0
      blocker_note: the mapping cannot be accepted while conflicting evidence remains unresolved
  accepted_rules: []
  ontology_mutation_authorized: false

optional_notebooklm_advisory_handoff:
  handoff_id: synthetic://handoffs/notebooklm-001
  state: skipped
  reason: no advisory return refs or owner-operated handoff request details are supplied
  owner_operated_upload_required: true
  upload_authority_granted: false
  source_ref_ids: []
  bounded_question_set: []
  non_authority_warning: advisory output cannot establish truth, resolve ownership, approve ontology, or promote canon
  expected_return_shape: null
  credentials_or_secrets_included: false
  private_payload_embedded: false

notebooklm_handoff_validation:
  validation_id: synthetic://validations/notebooklm-001
  state: skipped
  checks:
    owner_operated_upload_required: preserved
    bounded_question_set_present_or_skip_recorded: pass_by_skip_record
    credentials_cookies_sessions_or_upload_secrets_absent: true
    private_payload_embedded_in_public_package: false
    tool_answer_used_as_verdict: false
    source_refs_and_review_gate_remain_authority: true
  truth_validation_performed: false

workflowization_review_packet:
  packet_id: synthetic://review-packets/workflowization-001
  packet_state: ready_for_review_with_blockers
  source_truth_boundary:
    authoritative_surfaces:
      - approved synthetic source refs within their stated scopes
    excluded_as_truth:
      - fixture://sources/candidate-C
      - fixture://sources/conflict-D
    unresolved:
      - alternate-limit source approval
      - connector family mapping conflict
  projection_boundary:
    state: private_derivative_dry_run
    payload_embedded: false
    index_and_log_authoritative: false
  concept_candidate_routes:
    source_supported_candidate:
      - synthetic-concept-conditional-current-001
    review_required:
      - synthetic-concept-family-mapping-001
    blocked_pending_source:
      - synthetic-concept-alternate-limit-001
  claim_ceiling_summary:
    highest_current_ceiling: source_supported_conditional_claim
    mapping_ceiling: private_review_candidate
    alternate_limit_ceiling: gap_only
    canon_ceiling: blocked
  knowledge_package_archive_summary:
    requested: true
    upload_authority: none
    disposition: manifest_only_no_upload
  ontology_candidate_rule_summary:
    candidate_rules_recorded: 2
    accepted_rules: 0
    mutation_authority: false
  notebooklm_handoff_validation_summary:
    state: skipped
    advisory_verdict_used: false
  workflow_or_ontology_candidate_delta:
    workflow_candidate:
      - preserve ambient-temperature conditionality in any maximum-current rule
    ontology_candidate:
      - maximum_current conditioned_by ambient_temperature
      - connector_member_of connector_family
    blocked_delta:
      - numeric or alternate current limit
      - definitive connector family mapping
      - public or canon registration
  review_gate_required:
    workflow_id: post_development_review_gate_v0
    minimum_level: inspector_and_judge
    full_b_v_escalation_required_if:
      - production-ready claim is proposed
      - reference or oracle claim is proposed
      - public canon promotion is proposed without owner approval
  owner_decision_needed:
    - any public or canon promotion
    - ontology rule acceptance
    - conflict-resolution acceptance
  delegated_policy_applied: false
  canon_registration_target_refs: []

boundary_review_note:
  note_id: synthetic://boundary-reviews/sourcebound-loop-001
  disposition: hold_private_and_handoff_for_review
  ready_for:
    - bounded post-development review
    - approved-source followup
    - owner decision preparation
  not_ready_for:
    - public canon promotion
    - workflow canon acceptance
    - ontology canon acceptance
    - archive upload
    - production-ready or oracle claims
  passed_boundaries:
    - approved and blocked source states remain separated
    - projection payload remains private-by-contract and absent
    - source and projection references remain distinct
    - advisory tooling remains skipped and non-authoritative
    - archive manifest grants no upload or approval authority
    - ontology rules remain candidates
  blockers:
    - unresolved connector family mapping conflict
    - unapproved alternate-limit source
    - missing owner decision or applicable delegated policy
    - required review gate not completed
    - page-map and extraction-gate needs remain unknown
  stop_conditions:
    - do not use candidate-C or conflict-D as approved truth
    - do not assert a definitive connector family mapping
    - do not assert an alternate limit
    - do not upload or copy source payload
    - do not treat an advisory answer as a verdict
    - do not accept ontology or workflow canon
    - do not create a canon entry without applicable authority and the required review gate
  required_next_routes:
    - workflow_id: official_source_packet_collect_v0
      purpose: seek approved evidence for the alternate limit
    - workflow_id: source_packet_sufficiency_review_v0
      purpose: resolve the mapping conflict and determine safe claim ceilings
    - workflow_id: owner_decision_packet_v0
      purpose: obtain an owner decision if promotion remains desired
    - workflow_id: post_development_review_gate_v0
      purpose: conduct inspector-and-judge review before any public or canon promotion
