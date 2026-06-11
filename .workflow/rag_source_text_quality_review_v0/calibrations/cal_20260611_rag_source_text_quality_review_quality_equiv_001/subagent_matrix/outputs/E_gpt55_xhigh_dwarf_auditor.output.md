profile:
  candidate_id: E_gpt55_xhigh_dwarf_auditor
  model: gpt-5.5
  reasoning_effort: xhigh
  species: dwarf
  class: auditor

quality_review_scope_binding:
  workflow_id: rag_source_text_quality_review_v0
  fixture_id: rag_source_text_quality_review_public_synthetic_refs_001
  scope_id: SCOPE-SYN-RAG-QA-001
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
  raw_payload_access: forbidden
  claim_ceiling: observed_synthetic_support_trace

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
  mapping_count: 5
  mappings:
    - page_ref: P-SYN-001
      source_ref: SRC-SYN-A
      chunk_refs: [CHK-SYN-001-A, CHK-SYN-001-B]
      trace_event_refs: [TR-SYN-001]
      mapping_state: mapped
      warnings: []
    - page_ref: P-SYN-002
      source_ref: SRC-SYN-A
      chunk_refs: [CHK-SYN-002-A]
      picture_refs: [PIC-SYN-002-A]
      trace_event_refs: [TR-SYN-002]
      mapping_state: mapped_with_picture_warning
      warnings: [picture_trace_missing, figure_caption_trace_missing]
    - page_ref: P-SYN-003
      source_ref: SRC-SYN-B
      chunk_refs: [CHK-SYN-003-A, CHK-SYN-003-B]
      table_refs: [TBL-SYN-003-A]
      ocr_event_refs: [OCR-SYN-003-A]
      trace_event_refs: [TR-SYN-003]
      mapping_state: mapped_with_table_warning
      warnings: [table_cell_mapping_uncertain, layout_reading_order_uncertain]
    - page_ref: P-SYN-004
      source_ref: SRC-SYN-B
      chunk_refs: [CHK-SYN-004-A]
      trace_event_refs: []
      mapping_state: missing_page_mapping
      warnings: [page_ref_missing_or_duplicate]
    - page_ref: P-SYN-005
      source_ref: SRC-SYN-Z
      chunk_refs: [CHK-SYN-005-A]
      trace_event_refs: [TR-SYN-005]
      mapping_state: mapped_but_scope_mismatch
      warnings: [mixed_source_or_claim_ceiling_warning, stale_index_or_sidecar_ref]

answer_run_trace_inventory:
  answer_run_ref: synthetic://rag_quality/answer_run_trace/SYN-001
  run_timestamp_utc: "2026-06-11T00:00:00Z"
  raw_question_available: false
  raw_answer_available: false
  notebooklm_payload_available: false
  claim_count: 5
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
  reviewed_page_count: 5
  reviewed_claim_count: 5
  outcomes:
    - page_ref: P-SYN-001
      answer_claim_ref: CLM-SYN-001
      status: source_supported
      warning_categories: []
      basis_labels:
        - approved_source_ref
        - current_index_ref
        - mapped_sidecar_ref
        - claim_ceiling_not_blocked
    - page_ref: P-SYN-002
      answer_claim_ref: CLM-SYN-002
      status: manual_review
      warning_categories: [picture, ocr]
      basis_labels:
        - approved_source_ref
        - current_index_ref
        - mapped_sidecar_ref
        - picture_or_caption_trace_uncertain
    - page_ref: P-SYN-003
      answer_claim_ref: CLM-SYN-003
      status: manual_review
      warning_categories: [table, ocr]
      basis_labels:
        - approved_source_ref
        - current_index_ref
        - mapped_sidecar_ref
        - table_or_layout_trace_uncertain
    - page_ref: P-SYN-004
      answer_claim_ref: CLM-SYN-004
      status: blocked
      warning_categories: [page]
      basis_labels:
        - missing_page_mapping
        - missing_or_duplicate_page_identity
        - empty_trace_event_refs
    - page_ref: P-SYN-005
      answer_claim_ref: CLM-SYN-005
      status: blocked
      warning_categories: [page]
      basis_labels:
        - source_outside_approved_scope
        - stale_index_or_sidecar_ref
        - blocked_claim_ceiling
        - mixed_source_warning

boundary_review_note:
  payload_free: true
  reviewed_only_support_traces: true
  non_authorities:
    - source_truth
    - answer_correctness_authority
    - owner_approval_authority
    - canon_promotion
    - default_route_switching
  downstream_route_hints:
    - route source_supported claims to bounded support-trace acceptance queue
    - route manual_review claims to table_picture_ocr inspection
    - route blocked claims to source_scope_sidecar_repair before reuse

completion_state:
  status: complete
  blocked_count: 2
  manual_review_count: 2
  source_supported_count: 1
  fixture_boundary_preserved: true