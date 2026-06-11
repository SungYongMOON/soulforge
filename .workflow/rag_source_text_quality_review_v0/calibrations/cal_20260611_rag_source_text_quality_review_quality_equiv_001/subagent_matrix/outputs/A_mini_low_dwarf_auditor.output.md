profile:
  candidate_id: A_mini_low_dwarf_auditor
  model: gpt-5.4-mini
  reasoning_effort: low
  species: dwarf
  class: auditor

quality_review_scope_binding:
  scope_id: SCOPE-SYN-RAG-QA-001
  workflow_id: rag_source_text_quality_review_v0
  calibration_id: cal_20260611_rag_source_text_quality_review_quality_equiv_001
  fixture_id: rag_source_text_quality_review_public_synthetic_refs_001
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
  raw_payload_access: forbidden

source_text_index_inventory:
  index_ref: synthetic://rag_quality/source_text_index/SYN-001
  page_count: 5
  pages:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      page_label: SYN-A-001
      chunk_refs: [CHK-SYN-001-A, CHK-SYN-001-B]
      text_hash_refs: [sha256:synthetic-page-001-a, sha256:synthetic-page-001-b]
      token_count: 420
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      page_label: SYN-A-002
      chunk_refs: [CHK-SYN-002-A]
      text_hash_refs: [sha256:synthetic-page-002-a]
      token_count: 280
      extraction_method: synthetic_picture_caption_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      page_label: SYN-B-003
      chunk_refs: [CHK-SYN-003-A, CHK-SYN-003-B]
      text_hash_refs: [sha256:synthetic-page-003-a, sha256:synthetic-page-003-b]
      token_count: 515
      extraction_method: synthetic_table_ocr
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      page_label: SYN-B-004
      chunk_refs: [CHK-SYN-004-A]
      text_hash_refs: [sha256:synthetic-page-004-a]
      token_count: 365
      extraction_method: synthetic_clean_text
      claim_ceiling: source_supported
      lifecycle_state: current
    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      page_label: SYN-Z-005
      chunk_refs: [CHK-SYN-005-A]
      text_hash_refs: [sha256:synthetic-page-005-a]
      token_count: 190
      extraction_method: synthetic_stale_mixed_source
      claim_ceiling: blocked
      lifecycle_state: stale

traceability_sidecar_inventory:
  sidecar_ref: synthetic://rag_quality/traceability_sidecar/SYN-001
  page_mappings:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      mapping_state: mapped
      trace_event_refs: [TR-SYN-001]
      warnings: []
    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      mapping_state: mapped_with_picture_warning
      trace_event_refs: [TR-SYN-002]
      warnings:
        - picture_trace_missing
        - figure_caption_trace_missing
    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      mapping_state: mapped_with_table_warning
      trace_event_refs: [TR-SYN-003]
      warnings:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain
    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      mapping_state: missing_page_mapping
      trace_event_refs: []
      warnings:
        - page_ref_missing_or_duplicate
    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      mapping_state: mapped_but_scope_mismatch
      trace_event_refs: [TR-SYN-005]
      warnings:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref

answer_run_trace_inventory:
  answer_run_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  run_timestamp_utc: 2026-06-11T00:00:00Z
  raw_question_available: false
  raw_answer_available: false
  notebooklm_payload_available: false
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
  page_reviews:
    - page_ref: P-SYN-001
      claim_ref: CLM-SYN-001
      status: source_supported
      basis:
        - approved_source_ref_match
        - page_index_ref_match
        - sidecar_ref_match
        - claim_ceiling_not_blocked
      warnings: []
    - page_ref: P-SYN-002
      claim_ref: CLM-SYN-002
      status: manual_review
      basis:
        - approved_source_ref_match
        - page_index_ref_match
        - sidecar_ref_match
      warnings:
        - picture_trace_missing
        - figure_caption_trace_missing
      route_hint: manual_review_for_picture_and_caption_trace_uncertainty
    - page_ref: P-SYN-003
      claim_ref: CLM-SYN-003
      status: manual_review
      basis:
        - approved_source_ref_match
        - page_index_ref_match
        - sidecar_ref_match
      warnings:
        - table_cell_mapping_uncertain
        - layout_reading_order_uncertain
      route_hint: manual_review_for_table_and_ocr_uncertainty
    - page_ref: P-SYN-004
      claim_ref: CLM-SYN-004
      status: blocked
      basis:
        - missing_page_mapping
        - missing_page_identity_or_traceability_gap
      warnings:
        - page_ref_missing_or_duplicate
      route_hint: blocked_pending_page_mapping_repair
    - page_ref: P-SYN-005
      claim_ref: CLM-SYN-005
      status: blocked
      basis:
        - source_scope_mismatch
        - stale_index_or_sidecar_ref
        - claim_ceiling_blocked
      warnings:
        - mixed_source_or_claim_ceiling_warning
        - stale_index_or_sidecar_ref
      route_hint: blocked_pending_scope_and_index_refresh

boundary_review_note:
  review_scope: support_traces_only
  non_authorities:
    - source_truth
    - answer_correctness_authority
    - owner_approval_authority
    - canon_promotion
    - default_route_switching
  boundary_observations:
    - no_raw_text_or_excerpts_present
    - no_raw_question_or_answer_present
    - no_notebooklm_payload_or_ids_present
    - no_private_payload_or_runtime_absolute_path_present
  downstream_route_hints:
    - route_picture_and_caption uncertainty to manual review
    - route table and OCR uncertainty to manual review
    - route missing page mapping to blocked until repaired
    - route scope mismatch or stale refs to blocked until refreshed

completion_state: completed