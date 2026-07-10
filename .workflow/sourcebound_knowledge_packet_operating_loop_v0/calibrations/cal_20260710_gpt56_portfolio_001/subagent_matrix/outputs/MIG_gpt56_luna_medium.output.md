```yaml
deliverable_type: sourcebound_knowledge_packet_operating_loop_dry_run
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
fixture_id: public_synthetic_mixed_evidence_projection
public_safe: true
dry_run: true
execution_claims: none

source_intake_manifest:
  source_scope_binding: fixture://knowledge/demo_connector_rules
  approved_source_policy:
    allowed_states:
      - official_present
      - owner_approved_local
    public_payload_copy: false
  accepted_sources:
    - source_ref: fixture://sources/official-A
      state: official_present
      approved_scope: sourcebound_projection
      supports:
        - maximum current is conditional on ambient temperature
    - source_ref: fixture://sources/owner-local-B
      state: owner_approved_local
      approval_scope: private_projection
      supports:
        - connector family mapping
  excluded_sources:
    - source_ref: fixture://sources/candidate-C
      state: candidate_official
      handling: blocked_pending_source
      supports:
        - unverified alternate limit
    - source_ref: fixture://sources/conflict-D
      state: conflicting
      handling: blocked_pending_conflict_resolution
      supports:
        - different connector family mapping
  source_gap_handoff:
    required: true
    gaps:
      - gap_id: synthetic-gap-001
        scope: unverified alternate limit
        source_refs:
          - fixture://sources/candidate-C
        route: source_packet_sufficiency_review_v0
      - gap_id: synthetic-gap-002
        scope: connector family mapping conflict
        source_refs:
          - fixture://sources/owner-local-B
          - fixture://sources/conflict-D
        route: source_packet_sufficiency_review_v0

sourcebound_knowledge_packet_manifest:
  packet_id: synthetic-packet-001
  topic: synthetic connector constraint semantics
  visibility: private_project_local
  source_truth_owner: source_packets_or_owner_held_files
  projection_status: derivative_private_projection
  public_payload_included: false
  source_refs:
    - fixture://sources/official-A
    - fixture://sources/owner-local-B
  excluded_source_refs:
    - fixture://sources/candidate-C
    - fixture://sources/conflict-D
  claim_link_rule: every_projection_claim_requires_source_ref_or_gap
  projection_payload_ref: private://synthetic/payload/packet-001
  projection_payload_public: false

compiled_projection_index:
  index_id: synthetic-projection-index-001
  visibility: private_project_local
  authority: navigation_only
  entries:
    - projection_ref: private://synthetic/projection/conditional-current-limit
      source_refs:
        - fixture://sources/official-A
      status: source_supported
    - projection_ref: private://synthetic/projection/connector-family-mapping
      source_refs:
        - fixture://sources/owner-local-B
      status: source_supported_with_conflict_gap
  payload_included: false

compiled_projection_log:
  log_id: synthetic-projection-log-001
  visibility: private_project_local
  authority: navigation_only
  events:
    - event_id: synthetic-log-001
      action: accepted_source_projection
      source_ref: fixture://sources/official-A
    - event_id: synthetic-log-002
      action: accepted_private_local_projection
      source_ref: fixture://sources/owner-local-B
    - event_id: synthetic-log-003
      action: excluded_unapproved_candidate_source
      source_ref: fixture://sources/candidate-C
    - event_id: synthetic-log-004
      action: excluded_conflicting_source
      source_ref: fixture://sources/conflict-D
  payload_included: false

contradiction_gap_lint_report:
  report_id: synthetic-lint-001
  status: issues_present
  findings:
    - finding_id: synthetic-lint-finding-001
      check: unsupported_projection_claim
      status: no_supported_claim_identified
    - finding_id: synthetic-lint-finding-002
      check: source_conflict_or_revision_drift
      status: present
      source_refs:
        - fixture://sources/owner-local-B
        - fixture://sources/conflict-D
      handling: hold_mapping_as_unresolved
    - finding_id: synthetic-lint-finding-003
      check: citation_gap
      status: present_for_unverified_alternate_limit
      source_refs:
        - fixture://sources/candidate-C
      handling: blocked_pending_source
    - finding_id: synthetic-lint-finding-004
      check: advisory_tool_overreach
      status: none_identified
    - finding_id: synthetic-lint-finding-005
      check: figure_table_formula_ocr_gate_needed
      status: unknown
      handling: preserve_unknown_until_source_inspection
    - finding_id: synthetic-lint-finding-006
      check: missing_page_map
      status: unknown
      handling: preserve_unknown

concept_candidate_register:
  register_id: synthetic-concepts-001
  candidates:
    - candidate_id: synthetic-concept-001
      concept_label: conditional maximum current
      source_refs:
        - fixture://sources/official-A
      projection_refs:
        - private://synthetic/projection/conditional-current-limit
      evidence_state: source_supported
      blocker_or_review_note: exact threshold details are not supplied by the fixture
      possible_promotion_target: workflow_candidate
    - candidate_id: synthetic-concept-002
      concept_label: connector family mapping
      source_refs:
        - fixture://sources/owner-local-B
      projection_refs:
        - private://synthetic/projection/connector-family-mapping
      evidence_state: owner_approved_local_with_conflict_gap
      blocker_or_review_note: conflicting mapping remains unresolved
      possible_promotion_target: ontology_candidate
    - candidate_id: synthetic-concept-003
      concept_label: alternate current limit
      source_refs:
        - fixture://sources/candidate-C
      projection_refs: []
      evidence_state: blocked_pending_source
      blocker_or_review_note: candidate_official source is not approved evidence
      possible_promotion_target: source_gap_followup

claim_ceiling_and_promotion_route:
  route_id: synthetic-routes-001
  global_claim_ceiling: source_supported
  source_sufficiency:
    claim_scope: conditional current limit
    allowed_claim_ceiling: source_supported
  routes:
    - candidate_id: synthetic-concept-001
      route_state: source_supported_candidate
      promotion_target: workflow_candidate
      claim_ceiling: source_supported
      canon_status: not_promoted
    - candidate_id: synthetic-concept-002
      route_state: blocked_pending_source
      promotion_target: source_gap_followup
      claim_ceiling: unresolved_due_to_conflict
      canon_status: not_promoted
    - candidate_id: synthetic-concept-003
      route_state: blocked_pending_source
      promotion_target: source_gap_followup
      claim_ceiling: no_supported_claim
      canon_status: not_promoted
  public_canon_route:
    status: blocked_pending_owner_decision_and_review_gate
    owner_delegated_policy_present: false
    post_development_review_gate_present: false

knowledge_package_archive_manifest:
  archive_manifest_id: synthetic-archive-001
  requested: true
  archive_policy:
    agent_upload_authority: none
    archive_is_storage_and_backup_not_authority: true
  package_label: working_packet
  package_status: hold_private
  payload_upload: not_authorized
  canon_package: not_allowed
  archive_refs:
    - private://synthetic/archive/working-packet-001

ontology_candidate_rule_register:
  register_id: synthetic-ontology-rules-001
  rules:
    - candidate_rule_id: synthetic-rule-001
      source_concept_candidate_ids:
        - synthetic-concept-002
      ontology_candidate_type: entity_or_mapping_candidate
      entity_or_relation_label: connector family mapping
      evidence_source_refs:
        - fixture://sources/owner-local-B
      candidate_only_state: candidate_pending_review
      required_review_route: owner_decision_packet_v0
      ontology_canon_accepted: false

optional_notebooklm_advisory_handoff:
  handoff_id: synthetic-notebooklm-handoff-001
  status: skipped
  reason: no advisory handoff requested or required
  owner_operated_upload: not performed
  tool_answer_as_verdict: prohibited

notebooklm_handoff_validation:
  validation_id: synthetic-notebooklm-validation-001
  status: skipped
  safety_claim: no advisory return was used as authority
  truth_evaluation: not performed

workflowization_review_packet:
  packet_id: synthetic-workflowization-review-001
  source_truth_boundary:
    authority: supplied source refs and applicable owner policy
    excluded_as_authority:
      - compiled projection
      - index
      - log
      - candidate_official source
      - conflicting source
      - advisory tools
  projection_boundary:
    visibility: private_project_local
    public_payload: excluded
    authority: navigation_only
  concept_candidate_routes:
    - synthetic-concept-001: workflow_candidate
    - synthetic-concept-002: hold_private_pending_conflict_resolution
    - synthetic-concept-003: source_gap_followup
  claim_ceiling_summary: source_supported_only
  knowledge_package_archive_summary:
    label: working_packet
    authority: storage_only
    upload: not_authorized
  ontology_candidate_rule_summary:
    status: candidate_only
    canon_acceptance: false
  notebooklm_handoff_validation_summary:
    status: skipped
  workflow_or_ontology_candidate_delta:
    workflow_candidate:
      - conditional maximum current
    ontology_candidate:
      - connector family mapping
    unresolved:
      - alternate current limit
      - conflicting connector family mapping
  review_gate_required:
    workflow_id: post_development_review_gate_v0
    minimum_level: inspector_and_judge
    status: pending
  public_canon_status: blocked

boundary_review_note:
  note_id: synthetic-boundary-review-001
  status: hold_private
  source_truth_guard: bounded
  source_support_guard: conditional
  public_payload_guard: pass_by_contract
  authority_overreach_guard: pass_by_contract
  owner_decision_required: true
  review_gate_required: true
  failed_or_unknown_guards:
    - unresolved conflicting mapping
    - missing owner decision or applicable delegated policy
    - missing post-development review gate evidence
    - unknown page-map and extraction limits
  allowed_next_routes:
    - source_packet_sufficiency_review_v0
    - owner_decision_packet_v0
    - post_development_review_gate_v0
  prohibited_routes:
    - canon_candidate
    - canon_entry
    - ontology_mutation
    - workflow_canon_acceptance
```
