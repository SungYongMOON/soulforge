workflow_deliverable:
  workflow_id: knowledge_wiki_pipeline_v0
  fixture_id: PUBLIC_SYNTH_SE_KNOWLEDGE_WIKI_PIPELINE_V0
  status: candidate
  readiness_label: pilot-executed
  evidence_basis: synthetic_contract_metadata_only
  public_safe: true

  pipeline_request_packet:
    packet_id: SYNTH_PIPELINE_REQUEST_001
    request_mode: query_first_with_fallback
    source_scope_binding: SYNTH_SOURCE_SCOPE_001
    approved_source_policy: SYNTH_APPROVED_SOURCE_POLICY_001
    expected_output_surface: private_sourcebound_projection
    public_promotion_requested: false
    obsidian_read_view_requested: conditional
    owner_held_archive_policy: storage_only_non_authoritative
    existing_projection_ref: SYNTH_EXISTING_PROJECTION_REF_001
    uncertainty:
      - Existing projection sufficiency is not established by this fixture.
      - Fresh intake remains required if the existing projection is absent, stale, or insufficient.

  routing_decision_note:
    note_id: SYNTH_ROUTING_NOTE_001
    decision: query_first_then_route
    primary_route:
      condition: bounded_existing_projection_is_available_and_sufficient
      route: query_only_with_existing_projection
      skipped_stages:
        - source_intake_stage
        - sourcebound_projection_stage
    fallback_route:
      condition: existing_projection_is_missing_stale_or_insufficient
      route: fresh_pipeline
      required_stage: sourcebound_projection_stage
    optional_gates:
      source_sufficiency_gate: not_inserted_by_fixture
      owner_decision_gate: not_inserted_unless_claim_upgrade_or_promotion_is_requested
    authority_boundary:
      source_authority_granted: false
      archive_authority_granted: false
      canon_authority_granted: false
      rag_index_authority_granted: false

  stage_chain_manifest:
    manifest_id: SYNTH_STAGE_CHAIN_001
    route_selection_order:
      - bind_request_scope
      - archive_candidate_source_stage
      - classify_route
      - assemble_stage_chain
      - query_only_existing_projection_or_fresh_pipeline
      - archive_working_package_stage
      - obsidian_export_decision_stage
      - metadata_capture_stage
      - rag_refresh_handoff_decision_stage
      - closeout_review_stage
      - boundary_review
    query_only_existing_projection:
      enabled: true
      source_intake: skipped_only_with_approved_existing_projection_ref
      sourcebound_projection: skipped_only_with_approved_existing_projection_ref
    fresh_pipeline:
      source_intake: required
      sourcebound_projection: required
    required_closeout:
      closeout_review_ref: SYNTH_CLOSEOUT_REVIEW_REF_001
      boundary_review_note: SYNTH_BOUNDARY_REVIEW_001

  source_packet_refs:
    status: conditional
    refs:
      - SYNTH_SOURCE_PACKET_REF_001
    claim: source_packet_reference_placeholder_only
    non_claims:
      - No source acquisition is asserted.
      - No source truth is established by the fixture.

  sourcebound_packet_refs:
    status: conditional
    refs:
      - SYNTH_SOURCEBOUND_PACKET_REF_001
    claim: private_sourcebound_projection_reference_placeholder_only
    required_for:
      - fresh_pipeline
    non_claims:
      - No projection content or claim authority is asserted.
      - Claim ceilings remain bounded by approved source evidence.

  archive_manifest_refs:
    status: storage_only
    refs:
      - SYNTH_ARCHIVE_MANIFEST_REF_001
    entries:
      - archive_role: candidate_or_working_package_storage
        authority: non_authoritative
        canon_promotion: prohibited_without_registered_authority_and_owner_decision

  obsidian_export_refs:
    decision_ref: SYNTH_OBSIDIAN_DECISION_001
    decision: conditional_blocked_by_default
    allowed_when:
      - canon_backed_registry_or_approved_canon_package_exists
    export_surface: local_generated_read_only_workspace
    prohibited_contents:
      - raw_source_files
      - workmeta_payloads
      - NotebookLM_answers
      - unapproved_projection_content
    non_claims:
      - No export is asserted.

  knowledge_access_refs:
    status: required
    refs:
      - SYNTH_KNOWLEDGE_ACCESS_REF_001
    capture_scope:
      - metadata_only_packet_use
      - projection_or_existing_projection_linkage
    authority_granted: false

  rag_refresh_handoff_refs:
    status: conditional
    refs:
      - SYNTH_RAG_HANDOFF_REF_001
    handoff_type: metadata_only
    allowed_scope:
      - changed_wiki_metadata_refs
      - changed_sourcebound_metadata_refs
    prohibited_scope:
      - source_text_access_grant
      - index_build_authorization
      - rag_refresh_execution_inside_this_pipeline
    downstream_owner: rag_metadata_refresh_v0
    non_claims:
      - No RAG refresh is asserted.

  closeout_review_refs:
    status: required
    refs:
      - SYNTH_CLOSEOUT_REVIEW_REF_001
    review_scope:
      - validation_boundary_check
      - claim_ceiling_check
      - knowledge_trigger_check
      - downstream_blocker_check
    review_authority_granted: false

  boundary_review_note:
    note_id: SYNTH_BOUNDARY_REVIEW_001
    result: bounded_candidate
    confirmed_boundaries:
      - orchestration_only
      - ZIP_container_is_not_source_truth
      - owner_held_archive_is_storage_only
      - no_source_authority_grant
      - no_canon_promotion_without_registered_authority_and_owner_decision
      - Obsidian_export_is_read_only_derived_view
      - RAG_handoff_is_metadata_only
      - downstream_workflows_retain_execution_authority
    unresolved_uncertainties:
      - Source sufficiency is not established.
      - Canon-backed registry availability is not established.
      - Existing projection freshness and completeness are not established.
    public_safe_non_claims:
      - No tool use is claimed.
      - No file edits or runtime facts are claimed.
      - No service contact, upload, synchronization, promotion, or message delivery is claimed.

  stop_conditions:
    - source_intake_bypassed_without_existing_approved_refs
    - zip_container_requested_as_source_truth
    - remote_archive_upload_requested_outside_declared_policy
    - archive_presence_treated_as_source_truth_or_canon_authority
    - obsidian_export_requested_without_canon_backed_source
    - hwp_page_exact_claim_requested_without_page_stable_surface
    - public_promotion_requested_without_authority_register
    - rag_refresh_handoff_attempts_to_grant_source_text_or_index_build_permission
    - rag_refresh_execution_requested_inside_wiki_pipeline
    - owner_decision_required_but_absent_for_claim_upgrade
    - downstream_stage_reports_blocked
