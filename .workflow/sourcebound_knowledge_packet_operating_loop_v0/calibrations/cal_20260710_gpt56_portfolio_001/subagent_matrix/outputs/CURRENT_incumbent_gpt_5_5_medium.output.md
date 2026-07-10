```yaml
deliverable_id: fixture://deliverables/public_synthetic_mixed_evidence_projection
workflow_id: sourcebound_knowledge_packet_operating_loop_v0
fixture_id: public_synthetic_mixed_evidence_projection
status: dry_run_packet_ready_for_review
public_safe: true

project_binding:
  source_scope_binding: fixture://knowledge/demo_connector_rules
  topic: synthetic connector constraint semantics
  source_truth_owner: synthetic_source_packets_or_owner_held_files
  private_output_root: private://fixture/demo_connector_rules/
  public_payload_copy: false
  projection_boundary: private_derivative_projection_only
  promotion_boundary: no_canon_entry_without_owner_or_applicable_delegation_plus_review
  archive_requested: true
  archive_agent_upload_authority: none
  advisory_tool_policy: optional_owner_operated_advisory_only

source_intake_manifest:
  approved_source_refs:
    - source_ref: fixture://sources/official-A
      state: official_present
      accepted_for: sourcebound_projection
      visible_support:
        - maximum current is conditional on ambient temperature
    - source_ref: fixture://sources/owner-local-B
      state: owner_approved_local
      approval_scope: private_projection
      accepted_for: private_projection_only
      visible_support:
        - connector family mapping
  blocked_or_nonapproved_source_refs:
    - source_ref: fixture://sources/candidate-C
      state: candidate_official
      blocked_reason: candidate_official_is_not_an_allowed_approved_state
      visible_nonclaim:
        - unverified alternate limit
    - source_ref: fixture://sources/conflict-D
      state: conflicting
      blocked_reason: conflicting_source_cannot_be_used_as_approved_truth
      visible_nonclaim:
        - different connector family mapping
  source_gap_handoff:
    - gap_id: gap://fixture/candidate-C-approval
      source_ref: fixture://sources/candidate-C
      needed_for: alternate limit, if later considered
      route: source_packet_sufficiency_review_v0_or_official_source_packet_collect_v0
    - gap_id: gap://fixture/conflict-D-resolution
      source_ref: fixture://sources/conflict-D
      needed_for: connector family mapping conflict resolution
      route: source_packet_sufficiency_review_v0
  stop_conditions:
    - do_not_treat_candidate_C_as_truth
    - do_not_treat_conflict_D_as_truth
    - do_not_copy_source_payload_into_public_package

sourcebound_knowledge_packet_manifest:
  packet_ref: private://fixture/demo_connector_rules/sourcebound_knowledge_packet_manifest
  packet_state: private_projection_manifest_only
  source_refs_used:
    - fixture://sources/official-A
    - fixture://sources/owner-local-B
  excluded_source_refs:
    - fixture://sources/candidate-C
    - fixture://sources/conflict-D
  payload_in_public_deliverable: none
  claim_rule: every_projection_claim_requires_approved_source_ref_or_gap

compiled_projection_index:
  index_ref: private://fixture/demo_connector_rules/compiled_projection_index
  public_payload: none
  navigation_entries:
    - index_key: conditional_current_limit
      source_refs:
        - fixture://sources/official-A
      projection_ref: private://fixture/demo_connector_rules/projection/conditional_current_limit
    - index_key: connector_family_mapping
      source_refs:
        - fixture://sources/owner-local-B
      projection_ref: private://fixture/demo_connector_rules/projection/connector_family_mapping
      limitation: private_projection_only

compiled_projection_log:
  log_ref: private://fixture/demo_connector_rules/compiled_projection_log
  public_payload: none
  log_events:
    - event_id: log://fixture/intake-approved-A
      summary: official-A available for conditional current limit projection
    - event_id: log://fixture/intake-approved-B
      summary: owner-local-B available only within private_projection approval scope
    - event_id: log://fixture/block-candidate-C
      summary: candidate-C excluded from approved truth
    - event_id: log://fixture/block-conflict-D
      summary: conflict-D excluded pending conflict resolution

contradiction_gap_lint_report:
  report_ref: private://fixture/demo_connector_rules/contradiction_gap_lint_report
  unsupported_projection_claims:
    - claim_area: unverified alternate limit
      source_ref: fixture://sources/candidate-C
      lint_state: blocked_candidate_source
      route: source_gap_followup
  source_conflict_or_revision_drift:
    - claim_area: connector family mapping
      approved_source_ref: fixture://sources/owner-local-B
      conflicting_source_ref: fixture://sources/conflict-D
      lint_state: conflict_visible_but_conflicting_source_not_accepted_as_truth
      route: source_sufficiency_review
  citation_gaps:
    - claim_area: alternate limit
      gap_ref: gap://fixture/candidate-C-approval
  missing_page_map:
    state: unknown
    note: fixture provides source refs and support summaries only
  figure_table_formula_ocr_gate_needed:
    state: unknown
    note: no figures, tables, formulas, or OCR payload supplied
  advisory_tool_overreach:
    state: no_advisory_return_refs_supplied
    note: no NotebookLM or advisory answer may be treated as verdict

concept_candidate_register:
  candidates:
    - candidate_id: concept://fixture/conditional-current-limit
      concept_label: conditional current limit
      source_refs:
        - fixture://sources/official-A
      projection_refs:
        - private://fixture/demo_connector_rules/projection/conditional_current_limit
      evidence_state: source_supported_candidate
      blocker_or_review_note: claim ceiling supplied as source_supported for conditional current limit
      possible_promotion_target:
        - workflow_candidate
        - ontology_candidate
    - candidate_id: concept://fixture/connector-family-mapping
      concept_label: connector family mapping
      source_refs:
        - fixture://sources/owner-local-B
      projection_refs:
        - private://fixture/demo_connector_rules/projection/connector_family_mapping
      evidence_state: review_required
      blocker_or_review_note: owner-local-B is approved only for private_projection; conflict-D indicates unresolved mapping conflict
      possible_promotion_target:
        - hold_private
        - source_gap_followup
        - owner_decision
    - candidate_id: concept://fixture/alternate-limit
      concept_label: unverified alternate limit
      source_refs: []
      projection_refs: []
      evidence_state: blocked_pending_source
      blocker_or_review_note: only supplied support is candidate-C, which is candidate_official and not approved
      possible_promotion_target:
        - source_gap_followup

claim_ceiling_and_promotion_route:
  routes:
    - candidate_id: concept://fixture/conditional-current-limit
      allowed_claim_ceiling: source_supported
      route_state: source_supported_candidate
      promotion_route:
        - workflow_candidate
        - ontology_candidate
      canon_status: not_promoted
      required_before_canon:
        - owner_decision_or_applicable_delegated_policy
        - post_development_review_gate_v0
    - candidate_id: concept://fixture/connector-family-mapping
      allowed_claim_ceiling: private_projection_review_required
      route_state: review_required
      promotion_route:
        - hold_private
        - source_gap_followup
      canon_status: blocked
      blocker: unresolved conflicting source and no owner decision refs
    - candidate_id: concept://fixture/alternate-limit
      allowed_claim_ceiling: no_claim
      route_state: blocked_pending_source
      promotion_route:
        - source_gap_followup
      canon_status: blocked
      blocker: no approved source ref
  delegated_policy_state: none_supplied
  public_canon_route: blocked_without_owner_or_applicable_delegation_plus_review

knowledge_package_archive_manifest:
  archive_manifest_ref: private://fixture/demo_connector_rules/archive_manifest
  archive_requested: true
  agent_upload_authority: none
  archive_is_storage_not_authority: true
  package_entries:
    - artifact_ref: private://fixture/demo_connector_rules/sourcebound_knowledge_packet_manifest
      label: working_packet
      upload_status: not_uploaded_by_agent
    - artifact_ref: private://fixture/demo_connector_rules/compiled_projection_index
      label: working_packet
      upload_status: not_uploaded_by_agent
    - artifact_ref: private://fixture/demo_connector_rules/compiled_projection_log
      label: working_packet
      upload_status: not_uploaded_by_agent
    - artifact_ref: private://fixture/demo_connector_rules/concept_candidate_register
      label: working_packet
      upload_status: not_uploaded_by_agent
    - artifact_ref: private://fixture/demo_connector_rules/claim_ceiling_and_promotion_route
      label: reviewed_private
      upload_status: not_uploaded_by_agent
  canon_package_entries: []

ontology_candidate_rule_register:
  candidate_rules:
    - candidate_rule_id: ontology-rule://fixture/conditional-current-limit
      source_concept_candidate_ids:
        - concept://fixture/conditional-current-limit
      ontology_candidate_type: constraint_semantics
      entity_or_relation_label: current_limit_conditioned_by_ambient_temperature
      evidence_source_refs:
        - fixture://sources/official-A
      candidate_only_state: candidate_only_pending_owner_review
      required_review_route:
        - ontology_review_policy_or_owner_decision
        - post_development_review_gate_v0_before_public_canon
    - candidate_rule_id: ontology-rule://fixture/connector-family-mapping
      source_concept_candidate_ids:
        - concept://fixture/connector-family-mapping
      ontology_candidate_type: mapping_semantics
      entity_or_relation_label: connector_family_mapping
      evidence_source_refs:
        - fixture://sources/owner-local-B
      candidate_only_state: blocked_or_hold_private_pending_conflict_resolution
      required_review_route:
        - source_sufficiency_review_v0
        - owner_decision_if_promotion_requested
  forbidden_states_preserved:
    - no_ontology_canon_acceptance
    - no_ontology_mutation
    - no_final_domain_doctrine

optional_notebooklm_advisory_handoff:
  handoff_state: skipped
  reason: no notebooklm_advisory_return_refs supplied and no owner-operated handoff requested beyond fixture deliverable
  allowed_future_handoff_metadata:
    source_ref_ids:
      - fixture://sources/official-A
      - fixture://sources/owner-local-B
    bounded_question_set:
      - Which approved source refs support conditional current limit semantics?
      - Which connector family mapping claims remain blocked by conflicting or nonapproved refs?
    non_authority_warning: advisory_tool_answer_is_context_only_not_verdict
    expected_return_shape: advisory_observations_with_source_ref_ids_and_nonclaims
  forbidden_content_state:
    credentials: absent
    cookies: absent
    sessions: absent
    upload_secrets: absent
    embedded_private_payload: absent

notebooklm_handoff_validation:
  validation_state: skipped
  owner_operated_upload_required: preserved
  bounded_question_set_present_or_skip_recorded: skip_recorded
  no_credentials_cookies_sessions_or_upload_secrets: true
  no_private_payload_embedded_in_public_package: true
  tool_answer_not_used_as_verdict: true
  source_refs_and_review_gate_remain_authority: true

workflowization_review_packet:
  packet_ref: private://fixture/demo_connector_rules/workflowization_review_packet
  source_truth_boundary: source truth remains in approved synthetic source refs or owner-held files
  projection_boundary: compiled projection/index/log are private navigation surfaces, not authority
  concept_candidate_routes:
    - concept://fixture/conditional-current-limit: workflow_candidate_or_ontology_candidate_after_review
    - concept://fixture/connector-family-mapping: hold_private_or_source_gap_followup
    - concept://fixture/alternate-limit: blocked_pending_source
  claim_ceiling_summary:
    source_supported:
      - concept://fixture/conditional-current-limit
    review_required:
      - concept://fixture/connector-family-mapping
    no_claim:
      - concept://fixture/alternate-limit
  knowledge_package_archive_summary: archive manifest prepared; no agent upload authority; archive is not approval
  ontology_candidate_rule_summary: candidate-only rules captured; no ontology acceptance
  notebooklm_handoff_validation_summary: skipped safely; no advisory verdict used
  workflow_or_ontology_candidate_delta:
    - conditional current limit may be reviewed as reusable constraint semantics
    - connector family mapping requires conflict/source sufficiency handling before promotion
    - alternate limit is excluded until approved source support exists
  review_gate_required:
    workflow_id: post_development_review_gate_v0
    minimum_level: inspector_and_judge
  owner_decision_required_for:
    - canon_entry
    - ontology_acceptance
    - workflow_canon_acceptance
    - promotion of private_projection-only mapping beyond private scope

boundary_review_note:
  boundary_state: ready_for_review_gate_not_canon
  passed_boundaries:
    - public package contains refs and summaries only, not projection payload
    - candidate and conflicting sources are not used as approved truth
    - NotebookLM handoff is skipped and no advisory verdict is used
    - archive upload is not performed or authorized
    - ontology rules remain candidate-only
  blockers:
    - no owner_delegated_canon_policy_refs supplied
    - no owner_decision_refs supplied
    - conflict-D blocks connector mapping promotion
    - candidate-C blocks alternate limit claim
    - post_development_review_gate_v0 not represented as completed in fixture
  final_route: hold_private_with_review_packet_and_source_gap_followup
```
