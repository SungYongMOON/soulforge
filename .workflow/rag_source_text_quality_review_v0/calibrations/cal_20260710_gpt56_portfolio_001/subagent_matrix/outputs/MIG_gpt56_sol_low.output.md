schema_version: soulforge.rag_source_text_quality_review.deliverable.v0
workflow_id: rag_source_text_quality_review_v0
calibration_id: cal_20260611_rag_source_text_quality_review_quality_equiv_001
fixture_id: rag_source_text_quality_review_public_synthetic_refs_001

quality_review_scope_binding:
  scope_id: SCOPE-SYN-RAG-QA-001
  policy_id: synthetic_payload_free_quality_review_policy_001
  approved_source_refs:
    - SRC-SYN-A
    - SRC-SYN-B
  source_text_index_ref: synthetic://rag_quality/source_text_index/SYN-001
  traceability_sidecar_ref: synthetic://rag_quality/traceability_sidecar/SYN-001
  answer_run_trace_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  metadata_index_refs:
    - synthetic://rag_quality/metadata_index/SYN-001
  sourcebound_packet_refs:
    - synthetic://sourcebound/packet/SYN-001
  owner_decision_refs: []
  claim_ceiling: observed_synthetic_support_trace
  raw_payload_access: forbidden
  persisted_content_policy: refs_hashes_counts_labels_statuses_only
  explicit_exclusions:
    - raw_source_text
    - source_chunks_or_excerpts
    - raw_questions
    - raw_answers
    - notebooklm_payloads
    - private_transcripts
    - secrets_or_credentials
    - runtime_absolute_paths
  authority_limits:
    source_truth: none
    answer_correctness: none
    owner_approval: none
    canon_promotion: none
    default_route_switching: none

source_text_index_inventory:
  index_ref: synthetic://rag_quality/source_text_index/SYN-001
  page_count: 5
  pages:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      page_label: SYN-A-001
      chunk_refs:
        - CHK-SYN-001-A
        - CHK-SYN-001-B
      text_hash_refs:
        - sha256:synthetic-page-001-a
        - sha256:synthetic-page-001-b
      token_count: 420
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
      approved_source_scope: true

    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      page_label: SYN-A-002
      chunk_refs:
        - CHK-SYN-002-A
      text_hash_refs:
        - sha256:synthetic-page-002-a
      token_count: 280
      extraction_method: synthetic_picture_caption_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
      approved_source_scope: true

    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      page_label: SYN-B-003
      chunk_refs:
        - CHK-SYN-003-A
        - CHK-SYN-003-B
      text_hash_refs:
        - sha256:synthetic-page-003-a
        - sha256:synthetic-page-003-b
      token_count: 515
      extraction_method: synthetic_table_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
      approved_source_scope: true

    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      page_label: SYN-B-004
      chunk_refs:
        - CHK-SYN-004-A
      text_hash_refs:
        - sha256:synthetic-page-004-a
      token_count: 365
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
      approved_source_scope: true

    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      page_label: SYN-Z-005
      chunk_refs:
        - CHK-SYN-005-A
      text_hash_refs:
        - sha256:synthetic-page-005-a
      token_count: 190
      extraction_method: synthetic_stale_mixed_source
      claim_ceiling: blocked
      lifecycle_state: stale
      approved_source_scope: false

traceability_sidecar_inventory:
  sidecar_ref: synthetic://rag_quality/traceability_sidecar/SYN-001
  page_mapping_count: 5
  page_mappings:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      chunk_refs:
        - CHK-SYN-001-A
        - CHK-SYN-001-B
      trace_event_refs:
        - TR-SYN-001
      mapping_state: mapped
      warnings: []

    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      chunk_refs:
        - CHK-SYN-002-A
      picture_refs:
        - PIC-SYN-002-A
      trace_event_refs:
        - TR-SYN-002
      mapping_state: mapped_with_picture_warning
      warnings:
        - picture_trace_missing
        - figure_caption_trace_missing

    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      chunk_refs:
        - CHK-SYN-003-A
        - CHK-SYN-003-B
      table_refs:
        - TBL-SYN-003-A
      ocr_event_refs:
        - OCR-SYN-003-A
      trace_event_refs:
        - TR-SYN-003
      mapping_state: mapped_with_table_warning
      warnings:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain

    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      chunk_refs:
        - CHK-SYN-004-A
      trace_event_refs: []
      mapping_state: missing_page_mapping
      warnings:
        - page_ref_missing_or_duplicate

    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      chunk_refs:
        - CHK-SYN-005-A
      trace_event_refs:
        - TR-SYN-005
      mapping_state: mapped_but_scope_mismatch
      warnings:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref

answer_run_trace_inventory:
  answer_run_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  run_timestamp_utc: "2026-06-11T00:00:00Z"
  claim_count: 5
  payload_availability:
    raw_question: false
    raw_answer: false
    notebooklm_payload: false
  claims:
    - answer_claim_ref: CLM-SYN-001
      citation_ref: CIT-SYN-001
      retrieval_event_ref: RET-SYN-001
      page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      trace_hash_ref: sha256:synthetic-trace-001

    - answer_claim_ref: CLM-SYN-002
      citation_ref: CIT-SYN-002
      retrieval_event_ref: RET-SYN-002
      page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      trace_hash_ref: sha256:synthetic-trace-002

    - answer_claim_ref: CLM-SYN-003
      citation_ref: CIT-SYN-003
      retrieval_event_ref: RET-SYN-003
      page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      trace_hash_ref: sha256:synthetic-trace-003

    - answer_claim_ref: CLM-SYN-004
      citation_ref: CIT-SYN-004
      retrieval_event_ref: RET-SYN-004
      page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      trace_hash_ref: sha256:synthetic-trace-004

    - answer_claim_ref: CLM-SYN-005
      citation_ref: CIT-SYN-005
      retrieval_event_ref: RET-SYN-005
      page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      trace_hash_ref: sha256:synthetic-trace-005

page_quality_review_packet:
  scope_id: SCOPE-SYN-RAG-QA-001
  review_semantics: support_trace_only
  reviewed_page_count: 5
  status_summary:
    source_supported: 1
    manual_review: 2
    blocked: 2
  pages:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      answer_claim_ref: CLM-SYN-001
      citation_ref: CIT-SYN-001
      status: source_supported
      warning_labels: []
      basis_labels:
        - approved_source_ref
        - matching_page_index_ref
        - matching_sidecar_mapping
        - matching_answer_trace_ref
        - claim_ceiling_not_blocked
      uncertainty: No source-truth, answer-correctness, or owner-approval conclusion is made.

    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      answer_claim_ref: CLM-SYN-002
      citation_ref: CIT-SYN-002
      status: manual_review
      warning_labels:
        - picture_trace_missing
        - figure_caption_trace_missing
      basis_labels:
        - approved_source_ref
        - matching_page_index_ref
        - mapped_with_picture_warning
        - matching_answer_trace_ref
        - claim_ceiling_not_blocked
      uncertainty: Picture and figure-caption trace support remains unresolved.

    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      answer_claim_ref: CLM-SYN-003
      citation_ref: CIT-SYN-003
      status: manual_review
      warning_labels:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain
      basis_labels:
        - approved_source_ref
        - matching_page_index_ref
        - mapped_with_table_warning
        - matching_answer_trace_ref
        - claim_ceiling_not_blocked
      uncertainty: Table-cell mapping and OCR reading order remain unresolved.

    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      answer_claim_ref: CLM-SYN-004
      citation_ref: CIT-SYN-004
      status: blocked
      warning_labels:
        - page_ref_missing_or_duplicate
      basis_labels:
        - approved_source_ref
        - matching_page_index_ref
        - required_sidecar_page_mapping_missing
        - matching_answer_trace_ref
      stop_condition:
        - required_page_identity_missing
      uncertainty: Page-level support cannot be established without an unambiguous sidecar mapping.

    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      answer_claim_ref: CLM-SYN-005
      citation_ref: CIT-SYN-005
      status: blocked
      warning_labels:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref
      basis_labels:
        - source_ref_outside_approved_scope
        - claim_ceiling_blocked
        - lifecycle_state_stale
        - sidecar_scope_mismatch
        - matching_answer_trace_ref
      stop_condition:
        - source_text_index_ref_missing_or_unapproved
        - claim_ceiling_blocks_support_review
      uncertainty: Support review is blocked by scope mismatch, blocked claim ceiling, and stale-reference signals.

boundary_review_note:
  package_public_safe: true
  content_checks:
    raw_source_text_persisted: false
    source_chunks_or_excerpts_persisted: false
    raw_question_persisted: false
    raw_answer_persisted: false
    notebooklm_answer_persisted: false
    secret_or_credential_material_persisted: false
    runtime_absolute_paths_persisted: false
  authority_non_claims:
    source_truth_claimed: false
    answer_correctness_claimed: false
    owner_approval_claimed: false
    public_canon_promotion_claimed: false
    default_route_switch_claimed: false
  unresolved_items:
    - page_ref: P-SYN-002
      status: manual_review
      reason_labels:
        - picture_trace_missing
        - figure_caption_trace_missing
    - page_ref: P-SYN-003
      status: manual_review
      reason_labels:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain
    - page_ref: P-SYN-004
      status: blocked
      reason_labels:
        - page_ref_missing_or_duplicate
    - page_ref: P-SYN-005
      status: blocked
      reason_labels:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref
        - source_ref_outside_approved_scope
        - claim_ceiling_blocked
  downstream_route_hints:
    - workflow_id: owner_decision_packet_v0
      applies_to:
        - P-SYN-002
        - P-SYN-003
      purpose: manual_review_or_policy_exception_needing_owner_decision
      authority_granted: false
    - workflow_id: rag_metadata_refresh_v0
      applies_to:
        - P-SYN-004
        - P-SYN-005
      purpose: stale_or_missing_quality_review_ref_signal
      authority_granted: false
    - workflow_id: sourcebound_knowledge_packet_operating_loop_v0
      applies_to:
        - P-SYN-004
        - P-SYN-005
      purpose: source_gap_or_traceability_gap_from_quality_review
      authority_granted: false
    - workflow_id: rag_work_card_router_v0
      applies_to:
        - P-SYN-002
        - P-SYN-003
        - P-SYN-004
        - P-SYN-005
      purpose: optional_work_card_context_after_review
      authority_granted: false
  promotion_constraint:
    required_workflow_before_public_or_canon_promotion: post_development_review_gate_v0
    promotion_requested: false
    promotion_allowed_here: false
  final_posture: discovery_only_with_manual_and_blocked_followup_required
